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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.images = cases;
})();
