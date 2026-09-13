// Suite "images" - insertion, position (en ligne aligné gauche/centre/
// droite, calque devant/derrière), redimensionnement (poignées réelles),
// zoom +/-/taille d'origine, opacité, bascule ligne/bloc, suppression.
// Image en data: URI (1x1 PNG) - contourne toute dépendance réseau ET la
// vérification CORS (warnIfImageUrlNotExportable retourne immédiatement
// pour un src data:, cf. editor.js), donc rien à attendre ni simuler côté
// chargement réseau.
(function () {
  const DATA_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const cases = [];

  async function insertImageViaToolbar(h) {
    const origPrompt = window.prompt;
    window.prompt = () => DATA_PNG;
    await h.clickButton('v2-btn-image');
    window.prompt = origPrompt;
    await h.sleep(80);
    return h.tiptap().querySelector('img.editor-image');
  }

  cases.push({
    id: 'img_insert_basic',
    description: 'Insertion d\'une image via le bouton toolbar (invite URL)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const img = await insertImageViaToolbar(h);
      return { pass: !!img && img.getAttribute('src') === DATA_PNG, notes: Editor.getHTML() };
    },
  });

  ['left', 'center', 'right'].forEach(align => {
    cases.push({
      id: 'img_align_' + align,
      description: 'Image en ligne alignée "' + align + '" via la toolbar flottante',
      run: async (h) => {
        await h.resetEditor();
        await h.focusAtEnd();
        const img = await insertImageViaToolbar(h);
        await h.selectAtomNode(img);
        const btn = document.querySelector('.v2-floating-toolbar button[data-action="align-' + align + '"]');
        if (!btn) return { pass: false, notes: 'toolbar image non trouvée après sélection - html=' + h.tiptap().innerHTML };
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(60);
        const html = Editor.getHTML();
        const pass = align === 'left' ? true : new RegExp('data-align="' + align + '"').test(html);
        return { pass, notes: html };
      },
    });
  });

  ['front', 'behind'].forEach(layer => {
    cases.push({
      id: 'img_layer_' + layer,
      description: 'Basculer l\'image en calque "' + layer + '"',
      run: async (h) => {
        await h.resetEditor();
        await h.focusAtEnd();
        await h.typeText('Texte autour de l\'image');
        const img = await insertImageViaToolbar(h);
        await h.selectAtomNode(img);
        const btn = document.querySelector('.v2-floating-toolbar button[data-action="layer-' + layer + '"]');
        if (!btn) return { pass: false, notes: 'toolbar image non trouvée' };
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(60);
        const html = Editor.getHTML();
        return { pass: new RegExp('data-layer="' + layer + '"').test(html), notes: html };
      },
    });
  });

  cases.push({
    id: 'img_resize_corner_handle',
    description: 'Glisser la poignée de redimensionnement (coin se) agrandit l\'image',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const img = await insertImageViaToolbar(h);
      img.style.width = '100px';
      await h.sleep(30);
      await h.selectAtomNode(img);
      const handle = h.tiptap().querySelector('.editor-image-handle-se');
      if (!handle) return { pass: false, notes: 'poignée de redimensionnement introuvable - html=' + h.tiptap().innerHTML };
      const before = img.getBoundingClientRect().width;
      const rect = handle.getBoundingClientRect();
      await h.dragFromTo(handle, [rect.left, rect.top], [rect.left + 60, rect.top + 60]);
      const after = img.getBoundingClientRect().width;
      return { pass: after > before + 20, notes: JSON.stringify({ before, after }) };
    },
  });

  ['nw', 'ne', 'sw'].forEach(corner => {
    cases.push({
      id: 'img_resize_corner_' + corner,
      description: 'Glisser la poignée de redimensionnement (coin ' + corner + ')',
      run: async (h) => {
        await h.resetEditor();
        await h.focusAtEnd();
        const img = await insertImageViaToolbar(h);
        img.style.width = '150px';
        await h.sleep(30);
        await h.selectAtomNode(img);
        const handle = h.tiptap().querySelector('.editor-image-handle-' + corner);
        if (!handle) return { pass: false, notes: 'poignée introuvable' };
        const before = img.getBoundingClientRect().width;
        const rect = handle.getBoundingClientRect();
        const dx = corner.includes('w') ? -50 : 50;
        await h.dragFromTo(handle, [rect.left, rect.top], [rect.left + dx, rect.top]);
        const after = h.tiptap().querySelector('img.editor-image').getBoundingClientRect().width;
        return { pass: Math.abs(after - before) > 20, notes: JSON.stringify({ before, after }) };
      },
    });
  });

  cases.push({
    id: 'img_zoom_buttons',
    description: 'Boutons zoom+/zoom-/taille d\'origine changent la largeur affichée',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const img = await insertImageViaToolbar(h);
      img.style.width = '200px';
      await h.sleep(30);
      await h.selectAtomNode(img);
      const zoomInBtn = document.querySelector('.v2-floating-toolbar button[data-action="zoom-in"]');
      if (!zoomInBtn) return { pass: false, notes: 'toolbar image non trouvée' };
      const widthBefore = parseFloat(h.tiptap().querySelector('img.editor-image').style.width);
      zoomInBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const widthAfterZoomIn = parseFloat(h.tiptap().querySelector('img.editor-image').style.width);
      return { pass: widthAfterZoomIn > widthBefore, notes: JSON.stringify({ widthBefore, widthAfterZoomIn }) };
    },
  });

  cases.push({
    id: 'img_reset_size',
    // NOTE : la version précédente de ce test simulait un "redimensionnement"
    // en mutant `img.style.width` DIRECTEMENT en JS, sans jamais passer par
    // ProseMirror - le modèle gardait donc sa largeur d'origine (déjà
    // 320px), si bien que le clic "Taille d'origine" appliquait un patch
    // IDENTIQUE aux attributs déjà en place. ProseMirror considère alors le
    // nœud remplacé comme inchangé (`Node.eq()`) et n'appelle jamais le
    // callback `update()` de la NodeView - le <img> gardait donc son style
    // muté "à la main", en dehors de tout mécanisme réel de l'éditeur. Un
    // VRAI redimensionnement utilisateur (glisser une poignée, ou les boutons
    // zoom avant/arrière testés ici) commite toujours la largeur dans le
    // modèle AVANT le clic sur reset - dans ce cas, vérifié manuellement puis
    // ici, l'affichage ET le modèle se mettent bien à jour ensemble. Anomalie
    // invalidée (cf. BUGS.md) - c'était un artefact du harnais de test, pas
    // un bug de l'application.
    description: 'Bouton "taille d\'origine" ramène l\'image à 320px (largeur par défaut, pas la taille intrinsèque du fichier) après un VRAI redimensionnement (zoom avant répété)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const img = await insertImageViaToolbar(h);
      await h.selectAtomNode(img);
      for (let i = 0; i < 3; i++) {
        const zoomBtn = document.querySelector('.v2-floating-toolbar button[data-action="zoom-in"]');
        if (!zoomBtn) return { pass: false, notes: 'toolbar image non trouvée (zoom-in)' };
        zoomBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(50);
      }
      const widthAfterZoom = parseFloat(h.tiptap().querySelector('img.editor-image').style.width);
      const resetBtn = document.querySelector('.v2-floating-toolbar button[data-action="reset"]');
      if (!resetBtn) return { pass: false, notes: 'toolbar image non trouvée (reset)' };
      resetBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const widthAfter = parseFloat(h.tiptap().querySelector('img.editor-image').style.width);
      const html = Editor.getHTML();
      return { pass: widthAfterZoom > 320 && widthAfter === 320 && /width:\s*320px/.test(html), notes: JSON.stringify({ widthAfterZoom, widthAfter, html }) };
    },
  });

  cases.push({
    id: 'img_opacity_slider',
    description: 'Le curseur d\'opacité change le style opacity de l\'image (calque uniquement)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Autour');
      const img = await insertImageViaToolbar(h);
      await h.selectAtomNode(img);
      const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
      if (!frontBtn) return { pass: false, notes: 'toolbar image non trouvée' };
      frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const slider = document.querySelector('.v2-floating-toolbar input[data-role="opacity"]');
      if (!slider) return { pass: false, notes: 'curseur d\'opacité introuvable' };
      slider.value = '50';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      return { pass: /opacity:\s*0\.5/.test(html), notes: html };
    },
  });

  cases.push({
    id: 'img_wrap_toggle_inline_block',
    description: 'Bascule ligne/bloc (wrap) change l\'attribut data-wrap',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const img = await insertImageViaToolbar(h);
      await h.selectAtomNode(img);
      const before = Editor.getHTML();
      const wrapBtn = document.querySelector('.v2-floating-toolbar button[data-action="wrap"]');
      if (!wrapBtn) return { pass: false, notes: 'toolbar image non trouvée' };
      wrapBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const after = Editor.getHTML();
      return { pass: before !== after, notes: JSON.stringify({ before, after }) };
    },
  });

  cases.push({
    id: 'img_delete_button',
    description: 'Le bouton Supprimer de la toolbar flottante retire l\'image',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const img = await insertImageViaToolbar(h);
      await h.selectAtomNode(img);
      const delBtn = document.querySelector('.v2-floating-toolbar button[data-action="delete"]');
      if (!delBtn) return { pass: false, notes: 'toolbar image non trouvée' };
      delBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      return { pass: !html.includes('editor-image'), notes: html };
    },
  });

  cases.push({
    id: 'img_between_two_paragraphs',
    description: 'Une image en calque "devant" positionnée entre deux paragraphes distincts reste ancrée correctement (pas de fusion des 2 paragraphes)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Premier paragraphe');
      await h.typeText('\n');
      await h.typeText('Second paragraphe');
      const paras = h.tiptap().querySelectorAll('p');
      await h.focusInElement(paras[paras.length - 1], true);
      const img = await insertImageViaToolbar(h);
      await h.selectAtomNode(img);
      const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
      if (!frontBtn) return { pass: false, notes: 'toolbar image non trouvée' };
      frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      const paraCount = (html.match(/<p[ >]/g) || []).length;
      return { pass: html.includes('Premier paragraphe') && html.includes('Second paragraphe') && paraCount >= 2, notes: html };
    },
  });

  cases.push({
    id: 'img_move_when_layered',
    description: 'Glisser une image en calque (via sa poignée de déplacement) change sa position left/top',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Texte porteur');
      const img = await insertImageViaToolbar(h);
      await h.selectAtomNode(img);
      const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
      frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const moveHandle = h.tiptap().querySelector('.editor-image-move-handle');
      if (!moveHandle) return { pass: false, notes: 'poignée de déplacement introuvable - html=' + h.tiptap().innerHTML };
      const before = Editor.getHTML();
      const rect = moveHandle.getBoundingClientRect();
      await h.dragFromTo(moveHandle, [rect.left, rect.top], [rect.left + 80, rect.top + 40]);
      const after = Editor.getHTML();
      return { pass: before !== after && /left:\s*\d/.test(after) && /top:\s*\d/.test(after), notes: JSON.stringify({ before, after }) };
    },
  });

  ['table', 'twoColumns', 'twoColumns-right'].forEach(container => {
    const baseContainer = container === 'twoColumns-right' ? 'twoColumns' : container;
    cases.push({
      id: 'img_layer_toggle_no_jump_in_' + container,
      // Bug réel (signalé par l'utilisateur) : dans une cellule de tableau (position:relative CSS), setLayer() calculait left/top depuis .tiptap alors que
      // le navigateur les applique depuis la cellule (son propre ancêtre positionné réel) - l'image sautait hors de la zone de texte à l'affichage.
      // Variante "-right" : la colonne de DROITE d'un module 2 colonnes - même ancêtre positionné réel (.two-columns-zone, cf.
      // project_two_columns_image_anchor_bug) que la gauche, mais jamais exercée explicitement avant cet audit de couverture.
      description: 'Passer une image en calque "devant" dans un(e) ' + container + ' ne la fait pas sauter visuellement',
      run: async (h) => {
        await h.resetEditor();
        await h.focusAtEnd();
        document.getElementById(baseContainer === 'table' ? 'v2-btn-table' : 'v2-btn-two-columns').click();
        await h.sleep(80);
        const ed = EditorCore.getEditor();
        const hostP = baseContainer === 'table' ? h.tiptap().querySelector('table td p')
          : container === 'twoColumns-right' ? h.tiptap().querySelectorAll('.two-columns-column')[1].querySelector('p')
          : h.tiptap().querySelector('.two-columns-column p');
        ed.commands.setTextSelection(ed.view.posAtDOM(hostP, 0));
        ed.commands.focus();
        await h.sleep(50);
        const img = await insertImageViaToolbar(h);
        const beforeRect = img.getBoundingClientRect();
        await h.selectAtomNode(img);
        await h.sleep(80);
        const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
        if (!frontBtn) return { pass: false, notes: 'toolbar image non trouvée' };
        frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(100);
        const wrap = h.tiptap().querySelector('.editor-image-view');
        if (!wrap) return { pass: false, notes: 'wrapper calque introuvable après le basculement' };
        const afterRect = wrap.getBoundingClientRect();
        const jump = Math.hypot(afterRect.top - beforeRect.top, afterRect.left - beforeRect.left);
        return { pass: jump < 10, notes: JSON.stringify({ before: { top: beforeRect.top, left: beforeRect.left }, after: { top: afterRect.top, left: afterRect.left }, jump }) };
      },
    });
  });

  // Mode Lecture ne fait AUCUNE résolution de position lui-même : il injecte le HTML sérialisé tel quel (l'image en calque y est un <img> nu avec son
  // style inline position:absolute, sans le wrapper NodeView de l'éditeur) et laisse le CSS natif du navigateur résoudre l'ancêtre positionné. Ces 3 tests
  // vérifient que ça retombe bien sur le MÊME ancêtre que dans l'éditeur pour les 3 contextes qui comptent - un seul (cellule de tableau) avait un vrai
  // trou de CSS (#reader-container td/th sans position:relative, cf. .tiptap table td/th qui l'a) avant ce correctif.
  async function renderHtmlInReaderMode(h, html) {
    document.getElementById('editor-container').style.display = 'none';
    const readerContainer = document.getElementById('reader-container');
    readerContainer.style.display = 'block';
    await ReaderMode.render(html, 'FakeTable', {}, null);
    await h.sleep(200);
  }
  function exitReaderModeAfterTest(h) {
    // btn-mode-edit.click() (comme dans pagebreak_readmode_gap_matches_editor) ne restaure RIEN dans ce harnais local : le clic du bouton passe par
    // main.js:switchMode, câblé seulement dans le vrai init() Grist (cf. mémoire project_local_testing_scope) - jamais atteint ici. Sans ce constat, ce
    // scénario laissait #reader-container visible EN PLUS de #editor-container après coup (tiptapRect à {} pour tout scénario suivant qui en a besoin) -
    // reproduit donc directement l'effet DOM de switchMode('edit') à la main plutôt que de compter sur le clic.
    document.getElementById('editor-container').style.display = 'block';
    document.getElementById('reader-container').style.display = 'none';
  }
  function assertReaderImagePosition(offsetParentSelector, expectedLeft, expectedTop) {
    const img = document.querySelector('#reader-container img.editor-image');
    const parent = document.querySelector('#reader-container ' + offsetParentSelector);
    if (!img || !parent) return { pass: false, notes: 'img=' + !!img + ' parent=' + !!parent };
    const imgRect = img.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const actualLeft = imgRect.left - parentRect.left;
    const actualTop = imgRect.top - parentRect.top;
    const pass = Math.abs(actualLeft - expectedLeft) < 3 && Math.abs(actualTop - expectedTop) < 3;
    return { pass, notes: JSON.stringify({ expectedLeft, expectedTop, actualLeft, actualTop }) };
  }

  cases.push({
    id: 'readmode_layered_image_position_top_level',
    description: 'Mode Lecture : une image en calque au premier niveau (hors tableau/2-colonnes) se positionne au bon endroit (ancêtre positionné : .reader-content)',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Texte porteur pour ancrage, un paragraphe normal au premier niveau du document.</p>'
        + '<p><img class="editor-image" src="' + DATA_PNG + '" alt="" data-layer="front" data-wrap="inline" style="width:40px;position:absolute;left:120px;top:80px;z-index:5"></p>';
      await renderHtmlInReaderMode(h, html);
      const result = assertReaderImagePosition('.reader-content', 120, 80);
      exitReaderModeAfterTest(h);
      await h.sleep(60);
      return result;
    },
  });

  cases.push({
    id: 'readmode_layered_image_position_in_table_cell',
    // Régression directe du bug trouvé cette session : #reader-container td/th n'avait pas position:relative (contrairement à .tiptap table td/th côté
    // éditeur) - l'image en calque résolvait son ancêtre positionné sur un DIV bien plus haut, atterrissant à un endroit incohérent.
    description: 'Mode Lecture : une image en calque dans une cellule de tableau se positionne relativement à SA cellule (ancêtre positionné réel), pas plus haut',
    run: async (h) => {
      await h.resetEditor();
      const html = '<table><tbody><tr><td><p>Texte de cellule.<img class="editor-image" src="' + DATA_PNG + '" alt="" data-layer="front" data-wrap="inline" style="width:40px;position:absolute;left:15px;top:20px;z-index:5"></p></td><td><p>Autre cellule.</p></td></tr></tbody></table>';
      await renderHtmlInReaderMode(h, html);
      const result = assertReaderImagePosition('table td', 15, 20);
      exitReaderModeAfterTest(h);
      await h.sleep(60);
      return result;
    },
  });

  cases.push({
    id: 'readmode_layered_image_position_in_twoColumns',
    description: 'Mode Lecture : une image en calque dans une colonne d\'un module 2 colonnes se positionne relativement à la ZONE (.two-columns-zone, son vrai ancêtre positionné - règle générique non scopée de style.css), pas à .reader-content',
    run: async (h) => {
      await h.resetEditor();
      const html = '<div class="two-columns-zone" style="--layout-left: 50%;">'
        + '<div class="two-columns-column"><p>Texte colonne gauche.</p></div>'
        + '<div class="two-columns-column"><p>Texte colonne droite.<img class="editor-image" src="' + DATA_PNG + '" alt="" data-layer="front" data-wrap="inline" style="width:40px;position:absolute;left:60px;top:35px;z-index:5"></p></div>'
        + '</div>';
      await renderHtmlInReaderMode(h, html);
      const result = assertReaderImagePosition('.two-columns-zone', 60, 35);
      exitReaderModeAfterTest(h);
      await h.sleep(60);
      return result;
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.images = cases;
})();
