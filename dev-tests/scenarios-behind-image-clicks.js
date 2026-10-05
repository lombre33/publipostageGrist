// Suite "behindClicks" - un clic sur du texte posé sur une image « derrière le texte » atteint le texte, plus l'image (demande d'Antoine du 04/10 : « des fois je veux supprimer une ligne et ça me supprime
// l'image à proximité », puis « important ! l'image est une image importée via une colonne PJ »). Le cadre de l'image (le `<span class="editor-image-view">`) reste au-dessus du texte pour que sa poignée de
// déplacement soit atteignable : il recevait aussi les clics tombés sur les lignes que l'image recouvre, le clic sélectionnait l'image et Suppr l'effaçait au lieu du caractère. Maintenant
// (createBehindImageClickThroughExtension de js/editor-nodes.js) le survol décide : quand le pointeur est sur un caractère, le cadre prend la classe `editor-image-click-through` (css/editor-v2.css :
// `pointer-events: none`, ses poignées gardent les leurs) et le clic tombe sur le texte ; ailleurs sur l'image, un clic la sélectionne comme avant. Une image devant le texte, une image au fil du texte
// et un bouton de souris enfoncé (un geste commencé) ne changent pas.
// Une frappe ou une souris synthétique ne fait ni le clic ni le glissé du navigateur : les scénarios lisent donc ce que le survol décide (la classe, le style calculé, l'élément qu'un clic atteindrait,
// `elementFromPoint`). Le vrai clic, double clic, triple clic, glissé et la poignée à 700x400, image d'un fichier et image PJ, en clair et en sombre : dev-tests/verify-behind-image-clicks-mouse.mjs.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const PJ_ATTRS = ' data-var-table="Clients" data-var-column="Photo" data-var-key="Clients.Photo"';
  // Une image en calque sous les premières lignes de texte (courtes : l'image dépasse le texte à droite et au-dessous). `left` et `top` du style sont comptés depuis le coin de l'éditeur (1 pt = 4/3 px).
  const KINDS = [
    { label: 'image d\'un fichier', pj: false },
    { label: 'image PJ', pj: true },
  ];
  function floating(kind, layer, left, top) {
    return '<img class="editor-image" src="' + (kind.pj ? '' : DATA) + '" alt="" style="width: 120px; height: 120px; position: absolute; left: ' + left + 'px; top: ' + top + 'px; z-index: ' + (layer === 'front' ? 5 : -1)
      + ';" data-layer="' + layer + '" data-wrap="inline" data-page-index="0" data-page-left-pt="' + Math.round(left * 0.75) + '" data-page-top-pt="' + Math.round(top * 0.75) + '"' + (kind.pj ? PJ_ATTRS : '') + '>';
  }
  const classic = '<img class="editor-image" src="' + DATA + '" alt="" style="width: 60px" data-layer="normal" data-wrap="inline">';
  const doc = image => '<p>Titre' + image + '</p><p>Ligne A</p><p>Ligne B</p><p>Ligne C</p><p>Ligne D</p>';

  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(250);
    const container = document.getElementById('editor-container');
    if (container) container.scrollTop = 0;
    await sleep(80);
  }
  const wrapEl = () => document.querySelector('.tiptap .editor-image-view');
  // Le rectangle à l'écran du texte (hors image) du paragraphe de rang i.
  function textBox(i) {
    const p = document.querySelectorAll('.tiptap > p')[i];
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const rects = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || node.parentElement.closest('.editor-image-view')) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      Array.from(range.getClientRects()).forEach(x => { if (x.width > 0 && x.height > 0) rects.push(x); });
    }
    return rects.length ? { left: rects[0].left, top: rects[0].top, right: rects[rects.length - 1].right, bottom: rects[rects.length - 1].bottom } : null;
  }
  // Le document sans image d'abord (le texte se mesure), puis avec l'image posée sous les lignes A à D : son bord gauche passe sur la première lettre (sa poignée de déplacement, à gauche du cadre, tombe sur le
  // bord d'un mot), elle dépasse le texte à droite et au-dessous. La mise en page de l'éditeur (marge, largeur) ne compte pas : tout se règle sur le texte mesuré.
  async function place(h, kind, layer) {
    await setDoc(h, doc(''));
    const tip = document.querySelector('.tiptap').getBoundingClientRect();
    const a = textBox(1);
    const left = Math.round(a.left - tip.left - 6);
    const top = Math.round(a.top - tip.top - 4);
    Editor.setHTML(doc(floating(kind, layer, left, top)));
    await sleep(250);
    const container = document.getElementById('editor-container');
    if (container) container.scrollTop = 0;
    await sleep(80);
  }
  function selectImage() {
    let pos = null;
    ed().state.doc.descendants((node, at) => { if (node.type.name === 'editorImage') pos = at; });
    ed().commands.setNodeSelection(pos);
  }
  // Le calque de l'image, comme le fait la barre de l'image : l'image sélectionnée, ses attributs changés.
  async function setLayer(layer) {
    selectImage();
    ed().commands.updateAttributes('editorImage', { layer });
    await sleep(150);
  }
  // Le pointeur bouge : l'événement part de l'élément sous le pointeur et remonte jusqu'à l'éditeur, comme celui du navigateur.
  function hover(x, y, buttons) {
    const target = document.elementFromPoint(x, y) || document.querySelector('.tiptap');
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: buttons || 0, view: window }));
  }
  const passes = () => !!wrapEl() && wrapEl().classList.contains('editor-image-click-through');
  const pointerEvents = () => getComputedStyle(wrapEl()).pointerEvents;
  // Ce qu'un clic en (x, y) atteindrait : « image » (le cadre ou ce qu'il contient), « poignée », « texte » (le contenu de l'éditeur : paragraphe, titre, case de tableau...) ou autre chose.
  function reached(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return 'rien';
    if (el.closest('.editor-image-move-handle, .editor-image-handle')) return 'poignée';
    if (el.closest('.editor-image-view')) return 'image';
    if (el.closest('.tiptap')) return 'texte';
    return 'autre';
  }
  // Les points d'essai : un mot de la ligne B (sur l'image), un point de l'image sans texte (à droite des lignes), le bord droit de la ligne B (même ligne, mais plus de lettre), un point hors de l'image.
  function points() {
    const box = textBox(2);
    const view = wrapEl().getBoundingClientRect();
    return {
      word: { x: box.left + 14, y: (box.top + box.bottom) / 2 },
      free: { x: view.right - 14, y: view.bottom - 14 },
      afterText: { x: box.right + 10, y: (box.top + box.bottom) / 2 },
      outside: { x: view.right + 80, y: view.top + 20 },
      view, box,
    };
  }
  const covers = p => p.word.x > p.view.left && p.word.x < p.view.right && p.word.y > p.view.top && p.word.y < p.view.bottom
    && p.afterText.x > p.view.left && p.afterText.x < p.view.right && p.free.x > p.box.right + 4;

  cases.push({
    id: 'behind_clicks_the_frame_of_a_behind_image_lets_clicks_through_only_over_a_character',
    description: 'Image derrière le texte (d\'un fichier ou PJ) : le pointeur sur un caractère posé sur l\'image, son cadre prend la classe de passage, ne reçoit plus les clics (pointer-events none) et un clic atteint le texte ; sur la partie de l\'image sans texte (à droite des lignes, au-dessous) ou sur le bout de la ligne, hors de tout caractère, le cadre garde les clics et un clic atteint l\'image ; hors de l\'image rien ne change',
    run: async (h) => {
      const problems = [];
      for (const kind of KINDS) {
        await place(h, kind, 'behind');
        const p = points();
        if (!covers(p)) { problems.push(kind.label + ' : le décor ne recouvre pas la ligne B (' + JSON.stringify(p) + ')'); continue; }
        // Au repos (avant tout mouvement) : le cadre reçoit les clics.
        if (passes() || pointerEvents() === 'none') problems.push(kind.label + ' : au repos, le cadre laisse déjà passer les clics (' + pointerEvents() + ')');
        hover(p.word.x, p.word.y);
        if (!passes() || pointerEvents() !== 'none') problems.push(kind.label + ' : le pointeur sur un mot : le cadre ne laisse pas passer les clics (classe ' + passes() + ', ' + pointerEvents() + ')');
        if (reached(p.word.x, p.word.y) !== 'texte') problems.push(kind.label + ' : le pointeur sur un mot : un clic atteindrait ' + reached(p.word.x, p.word.y) + ' (texte attendu)');
        hover(p.free.x, p.free.y);
        if (passes() || pointerEvents() === 'none') problems.push(kind.label + ' : le pointeur sur l\'image sans texte : le cadre laisse passer les clics (' + pointerEvents() + ')');
        if (reached(p.free.x, p.free.y) !== 'image') problems.push(kind.label + ' : le pointeur sur l\'image sans texte : un clic atteindrait ' + reached(p.free.x, p.free.y) + ' (image attendue)');
        hover(p.word.x, p.word.y);
        hover(p.afterText.x, p.afterText.y);
        if (passes()) problems.push(kind.label + ' : le pointeur juste après le dernier caractère de la ligne : le cadre laisse passer les clics');
        if (reached(p.afterText.x, p.afterText.y) !== 'image') problems.push(kind.label + ' : le pointeur juste après le dernier caractère : un clic atteindrait ' + reached(p.afterText.x, p.afterText.y) + ' (image attendue)');
        hover(p.word.x, p.word.y);
        hover(p.outside.x, p.outside.y);
        if (passes()) problems.push(kind.label + ' : le pointeur hors de l\'image : le cadre garde la classe de passage');
        // Le mouvement qui suit un passage rend les clics au cadre, d'un mot à l'autre sans trou.
        const a = textBox(1), b = textBox(3);
        hover(a.left + 14, (a.top + a.bottom) / 2);
        const onA = passes();
        hover(b.left + 14, (b.top + b.bottom) / 2);
        const onB = passes();
        if (!onA || !onB) problems.push(kind.label + ' : le passage ne suit pas le pointeur d\'une ligne à l\'autre (A ' + onA + ', C ' + onB + ')');
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'behind_clicks_an_image_in_front_of_the_text_and_an_image_in_the_flow_never_let_clicks_through',
    description: 'Une image devant le texte (d\'un fichier ou PJ) reste cliquable partout, texte dessous ou non : son cadre ne prend jamais la classe de passage ; une image au fil du texte non plus',
    run: async (h) => {
      const problems = [];
      for (const kind of KINDS) {
        await place(h, kind, 'front');
        const p = points();
        if (!covers(p)) { problems.push(kind.label + ' devant : le décor ne recouvre pas la ligne B'); continue; }
        hover(p.word.x, p.word.y);
        if (passes() || pointerEvents() === 'none') problems.push(kind.label + ' devant : le pointeur sur un mot : le cadre laisse passer les clics (' + pointerEvents() + ')');
        if (reached(p.word.x, p.word.y) !== 'image') problems.push(kind.label + ' devant : un clic sur un mot atteindrait ' + reached(p.word.x, p.word.y) + ' (image attendue)');
        hover(p.free.x, p.free.y);
        if (passes() || pointerEvents() === 'none') problems.push(kind.label + ' devant : le pointeur sur l\'image sans texte : le cadre laisse passer les clics');
      }
      await setDoc(h, '<p>Titre</p><p>Ligne A' + classic + '</p><p>Ligne B</p>');
      const view = wrapEl().getBoundingClientRect();
      hover(view.left + view.width / 2, view.top + view.height / 2);
      if (passes() || pointerEvents() === 'none') problems.push('image au fil du texte : le cadre laisse passer les clics (' + pointerEvents() + ')');
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'behind_clicks_the_handles_keep_their_own_clicks_while_the_frame_lets_clicks_through',
    description: 'Le cadre qui laisse passer les clics ne prive pas l\'image de ses poignées : la poignée de déplacement (toujours visible) et les poignées de coin (image sélectionnée) gardent pointer-events auto, un clic sur elles atteint la poignée, même quand un mot est dessous',
    run: async (h) => {
      const problems = [];
      for (const kind of KINDS) {
        await place(h, kind, 'behind');
        const wrap = wrapEl();
        // Le cadre en état de passage (ce que le survol d'un mot lui fait).
        wrap.classList.add('editor-image-click-through');
        const move = wrap.querySelector('.editor-image-move-handle');
        if (!move) { problems.push(kind.label + ' : pas de poignée de déplacement'); continue; }
        if (getComputedStyle(wrap).pointerEvents !== 'none') problems.push(kind.label + ' : le cadre en passage garde les clics (' + getComputedStyle(wrap).pointerEvents + ')');
        if (getComputedStyle(move).pointerEvents !== 'auto') problems.push(kind.label + ' : la poignée de déplacement ne reçoit plus les clics (' + getComputedStyle(move).pointerEvents + ')');
        const r = move.getBoundingClientRect();
        if (reached(r.left + r.width / 2, r.top + r.height / 2) !== 'poignée') problems.push(kind.label + ' : un clic au centre de la poignée de déplacement atteindrait ' + reached(r.left + r.width / 2, r.top + r.height / 2));
        // Image sélectionnée : les poignées de coin, aussi.
        selectImage();
        await sleep(80);
        const corners = Array.from(wrap.querySelectorAll('.editor-image-handle'));
        const shown = corners.filter(c => getComputedStyle(c).display !== 'none');
        if (shown.length < 4) problems.push(kind.label + ' : ' + shown.length + ' poignée(s) de coin visible(s) (4 attendues)');
        shown.forEach((c, i) => {
          if (getComputedStyle(c).pointerEvents !== 'auto') problems.push(kind.label + ' : la poignée de coin ' + i + ' ne reçoit plus les clics');
          const cr = c.getBoundingClientRect();
          if (reached(cr.left + cr.width / 2, cr.top + cr.height / 2) !== 'poignée') problems.push(kind.label + ' : un clic sur la poignée de coin ' + i + ' atteindrait ' + reached(cr.left + cr.width / 2, cr.top + cr.height / 2));
        });
        // Et le pointeur sur la poignée, même au bord d'un mot, redonne le cadre en entier (pas de passage sur la poignée).
        wrap.classList.remove('editor-image-click-through');
        hover(r.left + r.width / 2, r.top + r.height / 2);
        if (passes()) problems.push(kind.label + ' : le pointeur sur la poignée de déplacement met le cadre en passage');
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'behind_clicks_changing_the_layer_of_an_image_follows_it_and_a_button_down_keeps_the_state',
    description: 'Passer l\'image de « derrière » à « devant » enlève le passage (même pointeur sur un mot) et le repasser « derrière » le rend ; un mouvement bouton enfoncé (glissé de sélection, de poignée) garde l\'état où le geste a commencé ; une image supprimée ne laisse rien derrière elle (aucune erreur au mouvement suivant)',
    run: async (h) => {
      const problems = [];
      const errors = [];
      const onError = e => errors.push(e.message);
      window.addEventListener('error', onError);
      try {
        await place(h, KINDS[0], 'behind');
        const p = points();
        hover(p.word.x, p.word.y);
        if (!passes()) problems.push('derrière : le pointeur sur un mot ne met pas le cadre en passage');
        // Bouton enfoncé : le passage tient, même sur la partie de l'image sans texte ; relâché, le mouvement suivant le défait.
        hover(p.free.x, p.free.y, 1);
        if (!passes()) problems.push('bouton enfoncé : le cadre a perdu le passage en cours de geste');
        hover(p.free.x, p.free.y, 0);
        if (passes()) problems.push('bouton relâché : le cadre garde le passage sur la partie de l\'image sans texte');
        // Bouton enfoncé depuis l'image sans texte : un mot survolé ne met pas le cadre en passage en cours de geste.
        hover(p.free.x, p.free.y, 1);
        hover(p.word.x, p.word.y, 1);
        if (passes()) problems.push('bouton enfoncé depuis l\'image : le cadre est passé en passage en cours de geste');
        hover(p.word.x, p.word.y, 0);
        if (!passes()) problems.push('bouton relâché sur un mot : le cadre n\'est pas en passage');
        // « Devant » : plus de passage, ni tout de suite ni au survol suivant.
        await setLayer('front');
        if (passes()) problems.push('devant : la classe de passage est restée sur le cadre');
        const q = points();
        hover(q.word.x, q.word.y);
        if (passes() || pointerEvents() === 'none') problems.push('devant : le pointeur sur un mot met le cadre en passage');
        // Redevenue « derrière » : le passage revient.
        await setLayer('behind');
        const r = points();
        hover(r.word.x, r.word.y);
        if (!passes()) problems.push('derrière de nouveau : le pointeur sur un mot ne met pas le cadre en passage');
        // Image supprimée : le mouvement suivant ne casse rien et ne laisse aucun cadre.
        selectImage();
        ed().commands.deleteSelection();
        await sleep(120);
        hover(r.word.x, r.word.y);
        hover(r.free.x, r.free.y);
        if (document.querySelectorAll('.tiptap .editor-image-view').length) problems.push('image supprimée : il reste un cadre');
        if (errors.length) problems.push('erreur au mouvement suivant : ' + errors.join(' ; '));
      } finally {
        window.removeEventListener('error', onError);
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  // Le rectangle à l'écran des premières lettres du premier texte qui commence par `start` dans l'éditeur (hors image).
  function wordBox(start) {
    const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('.editor-image-view') || !node.nodeValue.startsWith(start)) continue;
      const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, Math.min(3, node.nodeValue.length));
      const r = range.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: (r.top + r.bottom) / 2 };
    }
    return null;
  }
  // Une grande image en calque, posée au coin de l'éditeur : elle recouvre le début de chaque sorte de bloc du document d'essai.
  const big = (kind, layer, width, height) => floating(kind, layer, 0, 0).replace('width: 120px; height: 120px', 'width: ' + width + 'px; height: ' + height + 'px');

  cases.push({
    id: 'behind_clicks_every_kind_of_text_block_lets_the_click_through_and_overlapping_images_do_too',
    description: 'Un titre, un élément de liste, une case de tableau et un paragraphe posés sur l\'image laissent passer le clic jusqu\'au texte ; deux images derrière le texte qui se recouvrent le laissent passer toutes les deux (l\'une ne cache pas le texte à l\'autre) ; un point de l\'image sans texte garde le clic pour elle',
    run: async (h) => {
      const problems = [];
      const html = image => '<p>Début' + image + '</p><h2>Gros titre</h2><ul><li><p>Puce liste</p></li></ul><table><tbody><tr><td><p>Case un</p></td><td><p>Case deux</p></td></tr></tbody></table><p>Fin de page</p>';
      await setDoc(h, html(''));
      // Une première image d'un fichier, une seconde PJ un peu plus petite posée sur elle : le texte est sous les deux.
      Editor.setHTML(html(big(KINDS[0], 'behind', 900, 600) + big(KINDS[1], 'behind', 880, 580)));
      await sleep(300);
      const container = document.getElementById('editor-container');
      if (container) container.scrollTop = 0;
      await sleep(80);
      const wraps = Array.from(document.querySelectorAll('.tiptap .editor-image-view'));
      if (wraps.length !== 2) { problems.push(wraps.length + ' image(s) dans le document d\'essai (2 attendues)'); return { pass: false, notes: JSON.stringify(problems) }; }
      const state = () => wraps.map(w => w.classList.contains('editor-image-click-through'));
      for (const start of ['Début', 'Gros titre', 'Puce liste', 'Case un', 'Case deux', 'Fin de page']) {
        const w = wordBox(start);
        if (!w) { problems.push('« ' + start + ' » : texte introuvable'); continue; }
        // Le texte est-il bien sous les deux images (le décor) ?
        const under = wraps.every(el => { const r = el.getBoundingClientRect(); return w.x > r.left && w.x < r.right && w.y > r.top && w.y < r.bottom; });
        if (!under) { problems.push('« ' + start + ' » : le décor ne recouvre pas ce texte (' + Math.round(w.x) + ', ' + Math.round(w.y) + ')'); continue; }
        hover(w.x, w.y);
        if (state().some(on => !on)) problems.push('« ' + start + ' » : une des deux images ne laisse pas passer le clic (' + JSON.stringify(state()) + ')');
        if (reached(w.x, w.y) !== 'texte') problems.push('« ' + start + ' » : un clic atteindrait ' + reached(w.x, w.y) + ' (texte attendu)');
      }
      // Hors de tout texte, sous les deux images : le clic reste à l'image.
      const rect = wraps[0].getBoundingClientRect();
      const free = { x: rect.right - 30, y: rect.top + 30 };
      hover(free.x, free.y);
      if (state().some(on => on)) problems.push('point de l\'image sans texte : une image laisse passer le clic (' + JSON.stringify(state()) + ')');
      if (reached(free.x, free.y) !== 'image') problems.push('point de l\'image sans texte : un clic atteindrait ' + reached(free.x, free.y) + ' (image attendue)');
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  // Ce que « sur un caractère » veut dire à l'entier près (createBehindImageClickThroughExtension : `onTextLine`) : la ligne compte en entier en hauteur, la plus haute de l'interligne du
  // paragraphe et des lettres, et un pixel de plus que les lettres de chaque côté. Chaque point d'essai se calcule sur le texte mesuré : le dernier point dedans, puis celui d'après, dehors.
  cases.push({
    id: 'behind_clicks_a_text_line_reaches_one_pixel_beyond_its_letters_and_covers_the_whole_line_height',
    description: 'Le cadre d\'une image derrière le texte laisse passer le clic jusqu\'à un pixel au-delà des lettres de la ligne, de chaque côté, et sur toute la hauteur de la ligne (l\'interligne du paragraphe, ou les lettres quand elles sont plus hautes : un mot en gros caractères) ; un pixel plus loin, le clic reste à l\'image',
    run: async (h) => {
      const problems = [];
      // La ligne B est centrée (de la place libre de chaque côté des lettres, dans son paragraphe) et porte un mot en gros caractères, plus haut que l'interligne du paragraphe.
      const html = image => '<p>Titre' + image + '</p><p>Ligne A</p><p style="text-align: center">Ligne <span style="font-size: 36px">B</span></p><p>Ligne C</p><p>Ligne D</p>';
      await setDoc(h, html(''));
      const tip = document.querySelector('.tiptap').getBoundingClientRect();
      const first = textBox(2);
      Editor.setHTML(html(floating(KINDS[0], 'behind', Math.round(first.left - tip.left - 30), Math.round(first.top - tip.top - 40))));
      await sleep(300);
      const container = document.getElementById('editor-container');
      if (container) container.scrollTop = 0;
      await sleep(80);
      const paragraph = document.querySelectorAll('.tiptap > p')[2];
      const big = paragraph.querySelector('span');
      if (!wrapEl() || !big) return { pass: false, notes: JSON.stringify(['le décor manque : image ' + !!wrapEl() + ', gros caractères ' + !!big]) };
      const rectOf = node => { const range = document.createRange(); range.selectNodeContents(node); return range.getClientRects()[0]; };
      const small = rectOf(paragraph.firstChild), large = rectOf(big.firstChild);
      const lineHeight = parseFloat(getComputedStyle(paragraph).lineHeight);
      const middle = rect => (rect.top + rect.bottom) / 2;
      const half = rect => Math.max(lineHeight, rect.height) / 2;
      const smallX = Math.round((small.left + small.right) / 2), largeX = Math.round((large.left + large.right) / 2);
      const probes = [
        ['un pixel avant les lettres', Math.ceil(small.left) - 1, Math.round(middle(small)), true],
        ['deux pixels avant les lettres', Math.ceil(small.left) - 2, Math.round(middle(small)), false],
        ['un pixel après les lettres', Math.floor(large.right) + 1, Math.round(middle(large)), true],
        ['deux pixels après les lettres', Math.floor(large.right) + 2, Math.round(middle(large)), false],
        ['haut de la ligne des petites lettres', smallX, Math.ceil(middle(small) - half(small)), true],
        ['juste au-dessus de la ligne des petites lettres', smallX, Math.ceil(middle(small) - half(small)) - 1, false],
        ['bas de la ligne des petites lettres', smallX, Math.floor(middle(small) + half(small)), true],
        ['juste au-dessous de la ligne des petites lettres', smallX, Math.floor(middle(small) + half(small)) + 1, false],
        ['haut des gros caractères', largeX, Math.ceil(middle(large) - half(large)), true],
        ['juste au-dessus des gros caractères', largeX, Math.ceil(middle(large) - half(large)) - 1, false],
        ['bas des gros caractères', largeX, Math.floor(middle(large) + half(large)), true],
        ['juste au-dessous des gros caractères', largeX, Math.floor(middle(large) + half(large)) + 1, false],
      ];
      if (!(large.height > lineHeight) || !(small.height < lineHeight)) problems.push('le décor ne donne pas ce qu\'il faut : lettres ' + Math.round(small.height) + ' px et ' + Math.round(large.height) + ' px, interligne ' + lineHeight + ' px');
      const frame = wrapEl().getBoundingClientRect();
      const outside = probes.filter(probe => !(probe[1] >= frame.left && probe[1] <= frame.right && probe[2] >= frame.top && probe[2] <= frame.bottom)).map(probe => probe[0]);
      if (outside.length) problems.push('le décor ne recouvre pas ces points : ' + outside.join(', '));
      probes.forEach(([name, x, y, expected]) => {
        hover(frame.right + 40, frame.top + 5);
        hover(x, y);
        if (passes() !== expected) problems.push(name + ' (' + x + ', ' + y + ') : le cadre ' + (passes() ? 'laisse passer' : 'garde') + ' le clic (' + (expected ? 'passage' : 'image') + ' attendu)');
      });
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.behindClicks = cases;
})();
