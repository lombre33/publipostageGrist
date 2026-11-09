// Suite "imageReshape" - « Pivoter à gauche », « Pivoter à droite » et « Retourner » du menu « Pivoter et retourner » de la barre de l'image, puis la fenêtre « Rogner l'image » (js/image-reshape.js,
// js/image-crop.js, js/floating-toolbars.js ; demande d'Antoine du 09/11 : « rogner et tourner les images », carte « Import + boutons Pivoter et Rogner »). Chaque cas relit ce que l'éditeur garde : les points de l'image (un canvas), sa largeur à l'écran, l'historique. Une image de quatre quarts
// de couleurs différentes (rouge et bleu en haut, vert et jaune en bas, 40 x 20) montre le sens de chaque geste. Ce que les cas gardent : le quart de tour dans les deux sens (l'image garde sa taille à l'écran,
// tournée : une image de 200 px de large et 2 pour 1 devient 100 px de large et 1 pour 2), le miroir (la largeur ne bouge pas), UN pas d'historique par geste (un Ctrl + Z rend l'image et sa largeur), quatre
// quarts de tour qui redonnent l'image, deux clics rapides qui font deux gestes, le grisé avec sa raison (colonne, QR code, graphique, vidéo, SVG, autre site) sans qu'un clic ne change rien, une image que
// la personne a quittée entre-temps qui n'est pas touchée. Le rognage : la fenêtre s'ouvre sur l'image avec « Rogner » grisé tant que le cadre couvre tout, les flèches sur les poignées de bord le règlent
// (Maj : par cinq centièmes), il ne passe ni le bord d'en face ni celui de l'image, « Rogner » redessine l'image sur la partie gardée en gardant son échelle (largeur à l'écran de la partie gardée),
// un JPEG reste un JPEG, un Ctrl + Z rend l'image et sa largeur, Échap n'y touche pas, une image remplacée pendant que la fenêtre est ouverte n'est pas rognée.
(function () {
  const cases = [];
  const GAP = 700;
  const ed = () => EditorCore.getEditor();
  const press = el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const barWith = action => [...document.querySelectorAll('.v2-floating-toolbar')].find(el => el.querySelector('button[data-action="' + action + '"]')) || null;
  const buttonOf = (bar, action) => (bar && bar.querySelector('button[data-action="' + action + '"]')) || null;
  const imageNode = () => { let found = null; ed().state.doc.descendants((n, p) => { if (!found && n.type.name === 'editorImage') found = { node: n, pos: p }; }); return found; };
  const attrs = () => imageNode().node.attrs;
  const quarters = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 20;
    const g = canvas.getContext('2d');
    [['#ff0000', 0, 0], ['#0000ff', 20, 0], ['#00ff00', 0, 10], ['#ffff00', 20, 10]].forEach(([color, x, y]) => { g.fillStyle = color; g.fillRect(x, y, 20, 10); });
    return canvas.toDataURL('image/png');
  };
  const RED = [255, 0, 0], BLUE = [0, 0, 255], GREEN = [0, 255, 0], YELLOW = [255, 255, 0];
  const isColor = (px, rgb) => px[3] === 255 && rgb.every((v, i) => Math.abs(px[i] - v) < 40);
  // Les quatre quarts de l'image gardée et sa taille en points.
  async function look(src) {
    const canvas = await ImageIo.draw(src);
    const g = canvas.getContext('2d');
    const at = (fx, fy) => Array.from(g.getImageData(Math.floor(canvas.width * fx), Math.floor(canvas.height * fy), 1, 1).data);
    return { w: canvas.width, h: canvas.height, tl: at(0.25, 0.25), tr: at(0.75, 0.25), bl: at(0.25, 0.75), br: at(0.75, 0.75) };
  }
  // Le menu « Pivoter et retourner » ouvert, comme un appui sur son bouton le fait ; sa ligne `action` est appuyée comme un clic de souris l'appuie.
  const menuRow = action => [...document.querySelectorAll('.v2-image-menu button[data-action="' + action + '"]')][0] || null;
  async function start(h, html) {
    await h.resetEditor();
    Editor.setHTML(html || '<p>Avant</p><p><img class="editor-image" src="' + quarters() + '" alt="" style="width: 200px"></p><p>Après</p>');
    await h.sleep(300);
    ed().view.focus();
    ed().commands.setNodeSelection(imageNode().pos);
    await h.sleep(150);
    return barWith('reshape');
  }
  // Ouvre le menu de la barre (s'il ne l'est pas) puis appuie sa ligne `action`.
  async function pressed(h, bar, action) {
    const opener = buttonOf(bar, 'reshape');
    if (!opener) throw new Error('bouton « reshape » introuvable');
    if (opener.getAttribute('aria-expanded') !== 'true') { press(opener); await h.sleep(150); }
    const btn = menuRow(action);
    if (!btn) throw new Error('ligne « ' + action + ' » introuvable');
    press(btn);
    await h.sleep(250);
    return btn;
  }
  const undo = async (h) => { await h.sleep(GAP); ed().commands.undo(); await h.sleep(150); };
  // La fenêtre « Rogner l'image » : ouverte, ses poignées, son bouton « Rogner », sa ligne de taille.
  const cropOverlay = () => document.getElementById('pp-crop-modal');
  const cropWindowShown = () => { const el = cropOverlay(); return !!el && getComputedStyle(el).display !== 'none'; };
  const cropHandle = name => document.querySelector('#pp-crop-modal .pp-crop-handle[data-handle="' + name + '"]');
  const cropOk = () => document.querySelector('#pp-crop-modal .var-modal-primary');
  const cropSize = () => (document.querySelector('#pp-crop-modal .pp-crop-size') || { textContent: '' }).textContent;
  const arrow = (handle, key, times, shiftKey) => { for (let i = 0; i < (times || 1); i++) handle.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: !!shiftKey, bubbles: true, cancelable: true })); };
  const near = (a, b) => Math.abs(a - b) < 0.0005;
  // Ouvre la fenêtre du rognage par le bouton de la barre.
  async function openCrop(h, html) {
    const bar = await start(h, html);
    const opener = buttonOf(bar, 'crop');
    if (!opener) throw new Error('bouton « crop » introuvable');
    press(opener);
    await h.sleep(350);
    if (!cropWindowShown()) throw new Error('la fenêtre du rognage ne s\'ouvre pas');
    return bar;
  }
  const closeCrop = async (h) => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await h.sleep(150); };

  cases.push({
    id: 'imagereshape_turn_right_swaps_the_size_and_one_undo_brings_it_back',
    description: '« Pivoter à droite » redessine l\'image d\'un quart de tour dans le sens horaire (le vert prend la place du rouge) et lui donne comme largeur son ancienne hauteur à l\'écran (200 px de large, 2 pour 1 : 100 px, 1 pour 2) ; un Ctrl + Z rend l\'image d\'avant et sa largeur, un Ctrl + Y la remet',
    run: async (h) => {
      const bad = [];
      const bar = await start(h);
      const before = attrs();
      if (!bar) return { pass: false, notes: 'la barre de l\'image n\'a pas le bouton « Pivoter à droite »' };
      await pressed(h, bar, 'turn-right');
      const now = attrs();
      const q = await look(now.src);
      if (!(q.w === 20 && q.h === 40 && isColor(q.tl, GREEN) && isColor(q.tr, RED) && isColor(q.bl, YELLOW) && isColor(q.br, BLUE))) bad.push('quart de tour à droite : ' + JSON.stringify(q));
      if (now.width !== '100px') bad.push('largeur : ' + now.width);
      if (!ed().state.selection.node || ed().state.selection.node.type.name !== 'editorImage') bad.push('l\'image n\'est plus sélectionnée');
      await undo(h);
      if (attrs().src !== before.src || attrs().width !== '200px') bad.push('un Ctrl + Z ne rend pas l\'image : ' + attrs().width);
      ed().commands.redo();
      await h.sleep(150);
      if (attrs().src !== now.src || attrs().width !== '100px') bad.push('un Ctrl + Y ne la remet pas');
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  cases.push({
    id: 'imagereshape_turn_left_and_flip',
    description: '« Pivoter à gauche » tourne d\'un quart de tour dans l\'autre sens (le bleu prend la place du rouge) ; « Retourner » est un miroir gauche-droite (le bleu et le rouge échangés) qui ne change ni la taille de l\'image ni sa largeur',
    run: async (h) => {
      const bad = [];
      let bar = await start(h);
      await pressed(h, bar, 'turn-left');
      const left = await look(attrs().src);
      if (!(left.w === 20 && left.h === 40 && isColor(left.tl, BLUE) && isColor(left.tr, YELLOW) && isColor(left.bl, RED) && isColor(left.br, GREEN))) bad.push('quart de tour à gauche : ' + JSON.stringify(left));
      if (attrs().width !== '100px') bad.push('largeur à gauche : ' + attrs().width);
      bar = await start(h);
      await pressed(h, bar, 'flip');
      const flipped = await look(attrs().src);
      if (!(flipped.w === 40 && flipped.h === 20 && isColor(flipped.tl, BLUE) && isColor(flipped.tr, RED) && isColor(flipped.bl, YELLOW) && isColor(flipped.br, GREEN))) bad.push('miroir : ' + JSON.stringify(flipped));
      if (attrs().width !== '200px') bad.push('largeur du miroir : ' + attrs().width);
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  cases.push({
    id: 'imagereshape_four_quarter_turns_and_two_quick_clicks',
    description: 'quatre quarts de tour redonnent l\'image (mêmes quarts, même largeur) ; deux clics rapides font deux gestes l\'un après l\'autre (un demi-tour : le jaune en haut à gauche)',
    run: async (h) => {
      const bad = [];
      let bar = await start(h);
      for (let i = 0; i < 4; i++) await pressed(h, bar, 'turn-right');
      const back = await look(attrs().src);
      if (!(back.w === 40 && back.h === 20 && isColor(back.tl, RED) && isColor(back.tr, BLUE) && isColor(back.bl, GREEN) && isColor(back.br, YELLOW))) bad.push('quatre quarts de tour : ' + JSON.stringify(back));
      if (attrs().width !== '200px') bad.push('largeur après quatre quarts de tour : ' + attrs().width);
      bar = await start(h);
      for (let i = 0; i < 2; i++) { press(buttonOf(bar, 'reshape')); press(menuRow('turn-right')); }
      await h.sleep(600);
      const half = await look(attrs().src);
      if (!(half.w === 40 && half.h === 20 && isColor(half.tl, YELLOW) && isColor(half.tr, GREEN))) bad.push('deux clics rapides : ' + JSON.stringify(half));
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  cases.push({
    id: 'imagereshape_buttons_are_greyed_with_their_reason_and_change_nothing',
    description: 'une image de colonne Pièces jointes, un QR code, un graphique, une vidéo, une image vectorielle et une image d\'un autre site ont leur bouton « Pivoter et retourner » grisé (aria-disabled, jamais retiré) avec le texte qui dit pourquoi : un clic dessus n\'ouvre rien et ne change rien ; une image saine l\'allume, son menu a trois lignes nommées et un second appui le ferme',
    run: async (h) => {
      const bad = [];
      const svg = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"><rect width="4" height="2"/></svg>');
      const variants = [
        ['colonne', { varTable: 'Factures', varColumn: 'Photo', varKey: 'Factures.Photo', src: null }, 'imgToolbar.reshapeNeedsPicture'],
        ['QR code', { qrText: 'https://exemple.fr', src: 'data:image/png;base64,iVBORw0KGgo=' }, 'imgToolbar.reshapeNeedsPicture'],
        ['graphique', { chartSpec: '{"shape":"bars"}', src: null }, 'imgToolbar.reshapeNeedsPicture'],
        ['vidéo', { video: 'youtube:dQw4w9WgXcQ', src: null }, 'imgToolbar.reshapeNeedsPicture'],
        ['vectorielle', { src: svg }, 'imgToolbar.reshapeVector'],
        ['autre site', { src: 'https://exemple.fr/photo.png' }, 'imgToolbar.reshapeExternal'],
      ];
      const bar0 = await start(h);
      if (!bar0) return { pass: false, notes: 'pas de barre' };
      for (const [label, patch, key] of variants) {
        await start(h);
        const found = imageNode();
        ed().view.dispatch(ed().state.tr.setNodeMarkup(found.pos, undefined, Object.assign({}, found.node.attrs, patch)));
        await h.sleep(150);
        ed().commands.setNodeSelection(found.pos);
        await h.sleep(200);
        const bar = barWith('reshape');
        const keep = JSON.stringify(attrs());
        const opener = buttonOf(bar, 'reshape');
        if (!opener) { bad.push(label + ' : bouton « reshape » retiré'); continue; }
        if (opener.getAttribute('aria-disabled') !== 'true') bad.push(label + ' : « Pivoter et retourner » n\'est pas grisé');
        if (opener.title !== I18n.t(key)) bad.push(label + ' : il ne dit pas pourquoi : ' + opener.title);
        press(opener);
        await h.sleep(200);
        if (opener.getAttribute('aria-expanded') === 'true' || [...document.querySelectorAll('.v2-image-menu')].some(el => el.classList.contains('visible'))) bad.push(label + ' : le menu s\'est ouvert sur un bouton grisé');
        if (JSON.stringify(attrs()) !== keep) bad.push(label + ' : un clic sur le bouton grisé a changé l\'image');
        // « Rogner… » : le même grisé, la même raison, et un clic n'ouvre pas la fenêtre.
        const cropBtn = buttonOf(bar, 'crop');
        if (!cropBtn) { bad.push(label + ' : bouton « crop » retiré'); continue; }
        if (cropBtn.getAttribute('aria-disabled') !== 'true') bad.push(label + ' : « Rogner… » n\'est pas grisé');
        if (cropBtn.title !== I18n.t(key)) bad.push(label + ' : « Rogner… » ne dit pas pourquoi : ' + cropBtn.title);
        press(cropBtn);
        await h.sleep(200);
        if (cropWindowShown()) bad.push(label + ' : la fenêtre du rognage s\'est ouverte sur un bouton grisé');
        if (JSON.stringify(attrs()) !== keep) bad.push(label + ' : un clic sur « Rogner… » grisé a changé l\'image');
      }
      // Une image saine : le bouton est allumé et porte son nom, le menu s'ouvre avec ses trois lignes, chacune avec son nom, et se referme à un second appui.
      const healthy = await start(h);
      const opener = buttonOf(healthy, 'reshape');
      if (!opener || opener.getAttribute('aria-disabled') === 'true' || opener.title !== I18n.t('imgToolbar.reshape')) bad.push('image saine : bouton ' + (opener ? opener.title + ' / ' + opener.getAttribute('aria-disabled') : 'absent'));
      press(opener);
      await h.sleep(200);
      const menu = [...document.querySelectorAll('.v2-image-menu')].find(el => el.classList.contains('visible'));
      if (!menu) bad.push('image saine : le menu ne s\'ouvre pas');
      else {
        const rows = [...menu.querySelectorAll('button[data-action]')].map(row => row.dataset.action + ':' + row.textContent.trim());
        const want = [['turn-left', 'imgToolbar.turnLeft'], ['turn-right', 'imgToolbar.turnRight'], ['flip', 'imgToolbar.flip']].map(([a, k]) => a + ':' + I18n.t(k));
        if (JSON.stringify(rows) !== JSON.stringify(want)) bad.push('lignes du menu : ' + JSON.stringify(rows));
        if (opener.getAttribute('aria-expanded') !== 'true') bad.push('aria-expanded du bouton ouvert : ' + opener.getAttribute('aria-expanded'));
      }
      press(opener);
      await h.sleep(150);
      if ([...document.querySelectorAll('.v2-image-menu')].some(el => el.classList.contains('visible'))) bad.push('un second appui ne referme pas le menu');
      const cropOk = buttonOf(healthy, 'crop');
      if (!cropOk || cropOk.getAttribute('aria-disabled') === 'true' || cropOk.title !== I18n.t('imgToolbar.crop')) bad.push('image saine : « Rogner… » ' + (cropOk ? cropOk.title + ' / ' + cropOk.getAttribute('aria-disabled') : 'absent'));
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  cases.push({
    id: 'imagereshape_an_image_replaced_in_the_meantime_is_not_touched_and_the_result_is_a_plain_image',
    description: 'un geste dont l\'image a été remplacée avant que le redessin ait fini ne fait rien (l\'autre image reste telle qu\'elle est) ; une image redessinée sort dans le HTML de l\'éditeur comme une image ordinaire (classe, largeur, adresse de données)',
    run: async (h) => {
      const bad = [];
      await start(h);
      const found = imageNode();
      const other = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const real = ImageIo.reshape;
      // Un redessin lent : le temps de remplacer l'image sous le geste.
      ImageIo.reshape = async function (...args) { await h.sleep(150); return real.apply(this, args); };
      try {
        const running = ImageReshape.run(ed(), 'turn-right');
        await h.sleep(40);
        ed().view.dispatch(ed().state.tr.setNodeMarkup(found.pos, undefined, Object.assign({}, found.node.attrs, { src: other })));
        const done = await running;
        await h.sleep(100);
        if (done !== false) bad.push('le geste a écrit sur l\'image remplacée : ' + done);
        if (attrs().src !== other || attrs().width !== '200px') bad.push('l\'image remplacée a changé : ' + attrs().width);
      } finally { ImageIo.reshape = real; }
      const bar = await start(h);
      await pressed(h, bar, 'turn-right');
      const html = Editor.getHTML();
      const tag = (/<img[^>]*class="editor-image"[^>]*>/.exec(html) || [''])[0];
      if (!(/src="data:image\/png;base64,[^"]+"/.test(tag) && /width: 100px/.test(tag))) bad.push('HTML : ' + tag.slice(0, 160));
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  cases.push({
    id: 'imagecrop_window_opens_greyed_until_the_frame_moves_and_keeps_the_frame_inside_the_image',
    description: 'le bouton « Rogner… » ouvre la fenêtre sur l\'image : le cadre couvre tout, « Rogner » est grisé et la ligne dit « Rien à rogner » ; les flèches sur les poignées de bord règlent le cadre (une flèche : un centième, Maj : cinq centièmes ; la flèche droite sur le bord de gauche le fait avancer, sur le bord de droite elle l\'écarte) et « Rogner » s\'allume avec la taille gardée ; un bord ne passe ni le bord d\'en face (il reste au moins 5 %) ni le bord de l\'image ; revenir au cadre entier regrise « Rogner »',
    run: async (h) => {
      const bad = [];
      await openCrop(h);
      if (!cropOk().disabled) bad.push('« Rogner » n\'est pas grisé sur un cadre entier');
      if (cropSize() !== I18n.t('crop.nothing')) bad.push('ligne de taille au départ : ' + cropSize());
      const handles = [...document.querySelectorAll('#pp-crop-modal .pp-crop-handle')].map(el => el.dataset.handle + (el.tabIndex >= 0 ? '' : '(souris)'));
      if (handles.join(',') !== 'n,e,s,w,nw(souris),ne(souris),se(souris),sw(souris)') bad.push('poignées : ' + handles.join(','));
      const named = [...document.querySelectorAll('#pp-crop-modal .pp-crop-handle')].every(el => el.title && el.getAttribute('aria-label') === el.title);
      if (!named) bad.push('une poignée n\'a pas de nom');
      const w = cropHandle('w');
      arrow(w, 'ArrowRight', 1, false);
      let c = ImageCrop.current();
      if (!near(c.l, 0.01)) bad.push('une flèche : ' + c.l);
      arrow(w, 'ArrowRight', 3, true);
      c = ImageCrop.current();
      if (!near(c.l, 0.16)) bad.push('trois flèches avec Maj : ' + c.l);
      if (cropOk().disabled) bad.push('« Rogner » reste grisé après un réglage');
      if (!/{?\d+/.test(cropSize()) || cropSize() === I18n.t('crop.nothing')) bad.push('ligne de taille après réglage : ' + cropSize());
      // Le bord de droite : la flèche gauche le fait avancer vers l'intérieur, la droite l'écarte (jamais au-delà de l'image).
      const e = cropHandle('e');
      arrow(e, 'ArrowLeft', 2, true);
      c = ImageCrop.current();
      if (!near(c.r, 0.1)) bad.push('bord de droite avancé : ' + c.r);
      arrow(e, 'ArrowRight', 5, true);
      c = ImageCrop.current();
      if (!near(c.r, 0)) bad.push('bord de droite écarté au-delà de l\'image : ' + c.r);
      // Le bord de gauche poussé très loin : il s'arrête avant le bord d'en face (au moins 5 % restent).
      arrow(w, 'ArrowRight', 40, true);
      c = ImageCrop.current();
      if (1 - c.l - c.r < 0.0499) bad.push('le cadre est passé sous 5 % : ' + JSON.stringify(c));
      // Le bord du haut et celui du bas : les flèches haut et bas.
      const n = cropHandle('n');
      const s = cropHandle('s');
      arrow(n, 'ArrowDown', 3, true);
      arrow(s, 'ArrowUp', 2, true);
      c = ImageCrop.current();
      if (!(near(c.t, 0.15) && near(c.b, 0.1))) bad.push('bords du haut et du bas : ' + JSON.stringify(c));
      // Une flèche qui ne dit rien à cette poignée (haut sur le bord de gauche) ne la bouge pas.
      const before = JSON.stringify(ImageCrop.current());
      arrow(w, 'ArrowUp', 3, true);
      if (JSON.stringify(ImageCrop.current()) !== before) bad.push('une flèche haut a bougé le bord de gauche');
      // Retour au cadre entier : « Rogner » se grise de nouveau.
      arrow(w, 'ArrowLeft', 40, true);
      arrow(n, 'ArrowUp', 40, true);
      arrow(s, 'ArrowDown', 40, true);
      c = ImageCrop.current();
      if (!(near(c.l, 0) && near(c.t, 0) && near(c.r, 0) && near(c.b, 0))) bad.push('retour au cadre entier : ' + JSON.stringify(c));
      if (!cropOk().disabled || cropSize() !== I18n.t('crop.nothing')) bad.push('« Rogner » ne se grise pas au retour au cadre entier');
      await closeCrop(h);
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  cases.push({
    id: 'imagecrop_crop_redraws_on_the_kept_part_keeps_the_scale_and_one_undo_brings_it_back',
    description: '« Rogner » redessine l\'image sur la partie gardée (un quart de la gauche et la moitié du bas ôtés d\'une image de 40 x 20 : 30 x 10 points, le rouge à gauche et le bleu à droite) ; l\'image garde son échelle (200 px de large pour toute l\'image : 150 px pour les trois quarts gardés), reste sélectionnée, la fenêtre est fermée ; un Ctrl + Z rend l\'image d\'avant et sa largeur, un Ctrl + Y la remet ; un JPEG reste un JPEG ; ce qu\'on garde sort dans le HTML comme une image ordinaire',
    run: async (h) => {
      const bad = [];
      await openCrop(h);
      const before = attrs();
      arrow(cropHandle('w'), 'ArrowRight', 5, true);
      arrow(cropHandle('s'), 'ArrowUp', 10, true);
      cropOk().click();
      await h.sleep(500);
      const now = attrs();
      if (cropWindowShown()) bad.push('la fenêtre reste ouverte après « Rogner »');
      const q = await look(now.src);
      if (!(q.w === 30 && q.h === 10 && isColor(q.tl, RED) && isColor(q.tr, BLUE) && isColor(q.bl, RED) && isColor(q.br, BLUE))) bad.push('image rognée : ' + JSON.stringify(q));
      if (now.width !== '150px') bad.push('largeur à l\'écran : ' + now.width);
      if (!ed().state.selection.node || ed().state.selection.node.type.name !== 'editorImage') bad.push('l\'image n\'est plus sélectionnée');
      if (!/^data:image\/png/.test(now.src)) bad.push('une image PNG devrait rester PNG : ' + now.src.slice(0, 24));
      const html = Editor.getHTML();
      const tag = (/<img[^>]*class="editor-image"[^>]*>/.exec(html) || [''])[0];
      if (!(/src="data:image\/png;base64,[^"]+"/.test(tag) && /width: 150px/.test(tag))) bad.push('HTML : ' + tag.slice(0, 160));
      await undo(h);
      if (attrs().src !== before.src || attrs().width !== '200px') bad.push('un Ctrl + Z ne rend pas l\'image : ' + attrs().width);
      ed().commands.redo();
      await h.sleep(150);
      if (attrs().src !== now.src || attrs().width !== '150px') bad.push('un Ctrl + Y ne la remet pas');
      // Un JPEG reste un JPEG.
      const canvas = document.createElement('canvas');
      canvas.width = 40; canvas.height = 20;
      const g = canvas.getContext('2d');
      g.fillStyle = '#336699'; g.fillRect(0, 0, 40, 20);
      await openCrop(h, '<p>Avant</p><p><img class="editor-image" src="' + canvas.toDataURL('image/jpeg', 0.9) + '" alt="" style="width: 200px"></p><p>Après</p>');
      arrow(cropHandle('n'), 'ArrowDown', 2, true);
      cropOk().click();
      await h.sleep(500);
      if (!/^data:image\/jpeg/.test(attrs().src)) bad.push('un JPEG rogné ne reste pas JPEG : ' + attrs().src.slice(0, 24));
      if (attrs().width !== '200px') bad.push('rognage par le haut seul : la largeur ne doit pas bouger : ' + attrs().width);
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  cases.push({
    id: 'imagecrop_escape_and_a_replaced_image_leave_the_picture_untouched',
    description: 'Échap ferme la fenêtre du rognage sans toucher l\'image (même cadre réglé) ; « Annuler » du bas de la fenêtre aussi ; Entrée sur une poignée rogne ; une image remplacée pendant que la fenêtre est ouverte n\'est pas rognée par le bouton « Rogner » ; le focus revient à l\'éditeur',
    run: async (h) => {
      const bad = [];
      await openCrop(h);
      const keep = JSON.stringify(attrs());
      arrow(cropHandle('w'), 'ArrowRight', 5, true);
      await closeCrop(h);
      if (cropWindowShown()) bad.push('Échap ne ferme pas la fenêtre');
      if (JSON.stringify(attrs()) !== keep) bad.push('Échap a changé l\'image');
      if (!ed().view.hasFocus()) bad.push('le focus n\'est pas revenu à l\'éditeur');
      await openCrop(h);
      if (ImageCrop.current().l !== 0) bad.push('la fenêtre rouverte garde l\'ancien cadre : ' + JSON.stringify(ImageCrop.current()));
      arrow(cropHandle('w'), 'ArrowRight', 5, true);
      document.querySelector('#pp-crop-modal .pp-modal-actions button:not(.var-modal-primary)').click();
      await h.sleep(150);
      if (cropWindowShown() || JSON.stringify(attrs()) !== keep) bad.push('« Annuler » a laissé la fenêtre ouverte ou changé l\'image');
      // Entrée sur une poignée rogne.
      await openCrop(h);
      arrow(cropHandle('w'), 'ArrowRight', 2, true);
      cropHandle('w').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await h.sleep(500);
      if (cropWindowShown() || attrs().width !== '180px') bad.push('Entrée n\'a pas rogné : ' + attrs().width + (cropWindowShown() ? ' (fenêtre ouverte)' : ''));
      // Une image remplacée sous la fenêtre ouverte.
      await openCrop(h);
      const found = imageNode();
      const other = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      arrow(cropHandle('w'), 'ArrowRight', 5, true);
      ed().view.dispatch(ed().state.tr.setNodeMarkup(found.pos, undefined, Object.assign({}, found.node.attrs, { src: other })));
      cropOk().click();
      await h.sleep(500);
      if (attrs().src !== other || attrs().width !== '200px') bad.push('l\'image remplacée a été rognée : ' + attrs().width);
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.imageReshape = cases;
})();
