// Suite "imageReshape" - « Pivoter à gauche », « Pivoter à droite » et « Retourner » du menu « Pivoter et retourner » de la barre de l'image (js/image-reshape.js, js/floating-toolbars.js ; demande d'Antoine du
// 09/11 : « rogner et tourner les images », carte « Import + boutons Pivoter et Rogner »). Chaque cas relit ce que l'éditeur garde : les points de l'image (un canvas), sa largeur à l'écran, l'historique. Une image de quatre quarts
// de couleurs différentes (rouge et bleu en haut, vert et jaune en bas, 40 x 20) montre le sens de chaque geste. Ce que les cas gardent : le quart de tour dans les deux sens (l'image garde sa taille à l'écran,
// tournée : une image de 200 px de large et 2 pour 1 devient 100 px de large et 1 pour 2), le miroir (la largeur ne bouge pas), UN pas d'historique par geste (un Ctrl + Z rend l'image et sa largeur), quatre
// quarts de tour qui redonnent l'image, deux clics rapides qui font deux gestes, le grisé avec sa raison (colonne, QR code, graphique, vidéo, SVG, autre site) sans qu'un clic ne change rien, une image que
// la personne a quittée entre-temps qui n'est pas touchée.
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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.imageReshape = cases;
})();
