// Suite "images" - insertion, position (en ligne aligné gauche/centre/
// droite, calque devant/derrière), redimensionnement (poignées réelles),
// zoom +/-/taille d'origine, opacité, bascule ligne/bloc, suppression.
// Image en data: URI (1x1 PNG) - contourne toute dépendance réseau ET la
// conversion en data URI (urlToDataUriOrWarn retourne immédiatement pour
// un src data:, cf. main-toolbar.js), donc rien à attendre ni simuler côté
// chargement réseau pour la plupart des cas ci-dessous. Deux cas dédiés
// plus bas exercent la vraie conversion http(s) -> data: (retour Antoine,
// 2026-09-28), via des chemins servis par le serveur de test lui-même
// (même origine, pas de CORS réel à simuler).
(function () {
  const DATA_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const cases = [];

  async function insertImageViaToolbar(h) {
    const dialogs = h.stubDialogs({ prompt: DATA_PNG });
    await h.clickButton('v2-btn-image');
    dialogs.restore();
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

  cases.push({
    id: 'img_insert_from_url_converts_to_data_uri',
    description: 'Image insérée depuis une vraie URL http(s) : convertie en data: URI dès l\'insertion, l\'URL brute n\'est jamais stockée dans le modèle (retour Antoine, 2026-09-28)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      // Chemin relatif servi par le serveur de test lui-même (même origine que la page) : un
      // vrai fetch() a bien lieu, sans dépendre d'un hôte externe ni se heurter au CORS.
      const dialogs = h.stubDialogs({ prompt: '/img/grist-factory-logo.jpg' });
      await h.clickButton('v2-btn-image');
      dialogs.restore();
      await h.sleep(150);
      const img = h.tiptap().querySelector('img.editor-image');
      const src = img && img.getAttribute('src');
      return {
        pass: !!src && src.startsWith('data:image/') && !src.includes('grist-factory-logo'),
        notes: src ? src.slice(0, 60) + '…' : '(aucune image)',
      };
    },
  });

  cases.push({
    id: 'img_insert_from_url_fetch_failure_keeps_raw_url_and_warns',
    description: 'Image insérée depuis une URL introuvable (404) : conversion impossible, repli sur l\'URL brute + avertissement affiché (au lieu de bloquer l\'insertion)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const dialogs = h.stubDialogs({ prompt: '/img/n-existe-pas-404.png' });
      const origAlert = window.alert;
      let alertShown = false;
      window.alert = () => { alertShown = true; };
      await h.clickButton('v2-btn-image');
      // clickButton ne fait qu'un sleep(30) fixe - le bind() du bouton est async (fetch 404 puis
      // insertion) et n'est pas attendu par le clic lui-même. Restaurer window.alert tout de suite
      // gagnait la course la plupart du temps mais pas sous charge (flaky, signalé par le
      // coordinateur, 2026-09-28) : on attend le vrai signal (alerte déclenchée OU image déjà
      // insérée avec l'URL de repli) avant de rendre la main aux globals d'origine.
      const deadline = Date.now() + 3000;
      while (!alertShown && !h.tiptap().querySelector('img.editor-image') && Date.now() < deadline) {
        await h.sleep(20);
      }
      dialogs.restore();
      window.alert = origAlert;
      await h.sleep(50);
      const img = h.tiptap().querySelector('img.editor-image');
      const src = img && img.getAttribute('src');
      return {
        pass: alertShown && src === '/img/n-existe-pas-404.png',
        notes: { alertShown, src },
      };
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
    description: 'Bascule ligne/bloc (wrap) change l\'attribut data-wrap d\'une image posée dans une phrase (grisée quand l\'image est seule : groupe imageText)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Une phrase avec une image ');
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

  // Choix « Corriger » d'Antoine (2026-10-01) : un vrai clic hors de l'éditeur et hors de la barre ferme la barre flottante d'une image (hideFloatingContextToolbars sur le
  // mousedown), mais le blur de l'éditeur qui suit est une transaction TipTap de plus, et check() la rouvrait - mesuré à la vraie souris sur un clic dans le texte d'état. Un
  // mousedown synthétique seul ne déplace pas le focus : le blur est rejoué ici, comme le fait un vrai clic.
  cases.push({
    id: 'img_floating_bar_closes_on_outside_click_with_blur',
    description: 'Un clic hors de l\'éditeur et hors de la barre ferme la barre flottante d\'une image, blur de l\'éditeur compris ; un clic sur l\'image la rouvre',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const img = await insertImageViaToolbar(h);
      await h.selectAtomNode(img);
      const panel = Array.from(document.querySelectorAll('.v2-floating-toolbar')).find(b => b.querySelector('input[data-role="opacity"]'));
      if (!panel || !panel.classList.contains('visible')) return { pass: false, notes: 'barre image non affichée après la sélection de l\'image' };
      h.tiptap().focus();
      const outside = document.getElementById('template-name') || document.body;
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      h.tiptap().blur();
      await h.sleep(100);
      const closed = !panel.classList.contains('visible');
      h.tiptap().focus();
      await h.selectAtomNode(img);
      const reopened = panel.classList.contains('visible');
      return { pass: closed && reopened, notes: JSON.stringify({ closed, reopened }) };
    },
  });

  // --- Ancien modèle (image en calque sans position de page) chargé pendant que l'éditeur est masqué (Antoine, 01/10, carte « Corriger ») ---
  // HeaderFooterPreview.migrateLegacyImagePositions donne leur grille page (pageIndex, pageLeftPt, pageTopPt) aux images en calque qui n'en ont pas, en mesurant le DOM.
  // Éditeur en display:none (Lecture, résumé d'un macro-modèle), tous les rectangles valent 0 : l'image recevait -marge/-marge (le coin de la page, -28/-28 pt à 10 mm),
  // et cette position s'enregistrait à la première frappe ou au premier Enregistrer, sans jamais être recalculée (pageIndex n'est plus nul).
  const legacyLayerHtml = '<p>Avant</p><p>Texte <img class="editor-image" src="' + DATA_PNG + '" alt="" style="width: 100px; height: 100px; left: 123px; top: 210px; position: absolute;" data-layer="front" data-wrap="inline"> fin</p><p>Suite</p>';
  const gridOfFirstImage = () => {
    const img = new DOMParser().parseFromString(Editor.getHTML(), 'text/html').querySelector('img.editor-image');
    const num = name => (img && img.hasAttribute(name)) ? parseFloat(img.getAttribute(name)) : null;
    return img ? { pageIndex: num('data-page-index'), pageLeftPt: num('data-page-left-pt'), pageTopPt: num('data-page-top-pt'), left: img.style.left, top: img.style.top } : null;
  };
  const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.6;

  cases.push({
    id: 'image_legacy_layer_hidden_load_is_migrated_when_the_editor_is_shown',
    description: 'Un ancien modèle chargé éditeur masqué garde ses images sans position de page (pas de -marge/-marge), puis les reçoit, les mêmes que chargé éditeur visible, quand l\'éditeur revient',
    run: async (h) => {
      const container = document.getElementById('editor-container');
      try {
        await h.resetEditor();
        h.setA4Preview(true);
        Editor.setHTML(legacyLayerHtml);
        await h.sleep(300);
        const visible = gridOfFirstImage();
        container.style.display = 'none';
        Editor.setHTML(legacyLayerHtml);
        await h.sleep(300);
        const hidden = gridOfFirstImage();
        container.style.display = 'block';
        Editor.refreshLayout();
        await h.sleep(300);
        const shown = gridOfFirstImage();
        const visibleOk = !!visible && visible.pageIndex === 0 && visible.pageLeftPt > 0 && visible.pageTopPt > 0;
        const hiddenOk = !!hidden && hidden.pageIndex === null && hidden.pageLeftPt === null && hidden.left === '123px' && hidden.top === '210px';
        const shownOk = !!shown && shown.pageIndex === 0 && near(shown.pageLeftPt, visible.pageLeftPt) && near(shown.pageTopPt, visible.pageTopPt);
        return { pass: visibleOk && hiddenOk && shownOk, notes: JSON.stringify({ visible, hidden, shown }) };
      } finally { container.style.display = 'block'; }
    },
  });

  cases.push({
    id: 'image_legacy_layer_hidden_load_never_writes_the_corner_position',
    description: 'Éditeur masqué puis tapé après son retour : le HTML qui s\'enregistre porte la position mesurée éditeur visible, jamais -marge/-marge',
    run: async (h) => {
      const container = document.getElementById('editor-container');
      try {
        await h.resetEditor();
        h.setA4Preview(true);
        Editor.setHTML(legacyLayerHtml);
        await h.sleep(300);
        const visible = gridOfFirstImage();
        container.style.display = 'none';
        Editor.setHTML(legacyLayerHtml);
        await h.sleep(300);
        container.style.display = 'block';
        Editor.refreshLayout();
        await h.sleep(300);
        // Une frappe réelle après le retour de l'éditeur : c'est elle qui déclenche l'enregistrement automatique.
        await h.focusAtEnd();
        await h.typeText('!');
        await h.sleep(100);
        const saved = gridOfFirstImage();
        const margin = PageLayout.getMarginsPt();
        const atCorner = !!saved && near(saved.pageLeftPt, -margin.left) && near(saved.pageTopPt, -margin.top);
        return { pass: !atCorner && !!saved && near(saved.pageLeftPt, visible.pageLeftPt) && near(saved.pageTopPt, visible.pageTopPt), notes: JSON.stringify({ visible, saved, margin }) };
      } finally { container.style.display = 'block'; }
    },
  });

  cases.push({
    id: 'image_layer_with_page_grid_is_untouched_by_hidden_load_and_refresh',
    description: 'Une image en calque qui a déjà sa position de page la garde à l\'identique : chargée éditeur masqué, puis au retour de l\'éditeur (refreshLayout rejoué deux fois)',
    run: async (h) => {
      const container = document.getElementById('editor-container');
      try {
        await h.resetEditor();
        h.setA4Preview(true);
        const modern = '<p>Texte <img class="editor-image" src="' + DATA_PNG + '" alt="" style="width: 100px; height: 100px; left: 123px; top: 210px; position: absolute;" data-layer="front" data-wrap="inline" data-page-index="0" data-page-left-pt="477.5" data-page-top-pt="-2.5"> fin</p>';
        container.style.display = 'none';
        Editor.setHTML(modern);
        await h.sleep(300);
        const hidden = gridOfFirstImage();
        container.style.display = 'block';
        Editor.refreshLayout();
        await h.sleep(200);
        Editor.refreshLayout();
        await h.sleep(200);
        const shown = gridOfFirstImage();
        const expected = { pageIndex: 0, pageLeftPt: 477.5, pageTopPt: -2.5 };
        const same = g => !!g && g.pageIndex === expected.pageIndex && g.pageLeftPt === expected.pageLeftPt && g.pageTopPt === expected.pageTopPt;
        return { pass: same(hidden) && same(shown), notes: JSON.stringify({ hidden, shown }) };
      } finally { container.style.display = 'block'; }
    },
  });

  // --- Le même ancien modèle, suivi des modifications actif (Antoine, 01/10, suite de la carte « Corriger ») ---
  // La passe de migration n'est pas une modification de la personne. Suivie, la bibliothèque en faisait une suppression + une insertion de l'image ; l'original (marqué
  // supprimé, pageIndex toujours nul) restait candidat à la passe suivante, et chaque retour de l'éditeur (Editor.refreshLayout : Lecture puis Édition, chaque frappe dans
  // une marge des Réglages) ajoutait une copie de plus, en suggestion en attente enregistrée avec le modèle (2 images à l'ouverture, 3, 4, 5... ensuite).
  const imageCount = () => {
    const images = [];
    EditorCore.getEditor().state.doc.descendants(node => {
      if (node.type.name === 'editorImage') images.push({ marks: node.marks.map(m => m.type.name), pageIndex: node.attrs.pageIndex });
    });
    return {
      images: images.length,
      marked: images.filter(i => i.marks.length).length,
      inserted: images.filter(i => i.marks.includes('insertion')).length,
      deleted: images.filter(i => i.marks.includes('deletion')).length,
      withGrid: images.filter(i => i.pageIndex != null).length,
      pending: Editor.hasPendingTrackedChanges(),
    };
  };
  const layerImgHtml = (grid) => '<img class="editor-image" src="' + DATA_PNG + '" alt="" style="width: 100px; position: absolute; left: 123px; top: 210px; z-index: 5;" data-layer="front" data-wrap="inline"'
    + (grid ? ' data-page-index="0" data-page-left-pt="64.25" data-page-top-pt="129.5"' : '') + '>';
  // Ce qu'enregistrait l'ancienne passe : l'original en suppression, puis ses copies (ici 3) dans une même insertion.
  const damagedLayerHtml = '<p>Avant</p><p>Texte <del data-id="1">' + layerImgHtml(false) + '</del><ins data-id="1">' + layerImgHtml(true).repeat(3) + '</ins> fin</p><p>Suite</p>';
  const withTrackChanges = async (body) => {
    try {
      Editor.setTrackChanges(true);
      await new Promise(r => setTimeout(r, 200));
      if (!Editor.isTrackChangesOn()) return { pass: false, notes: 'le suivi des modifications ne s\'allume pas' };
      return await body();
    } finally { Editor.setTrackChanges(false); }
  };

  cases.push({
    id: 'image_legacy_layer_track_changes_load_is_migrated_without_a_suggestion',
    description: 'Suivi des modifications actif : un ancien modèle reçoit la position de page de son image à l\'ouverture sans suggestion (une seule image, ni suppression ni insertion), hors Annuler et sans sélectionner l\'image',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      return withTrackChanges(async () => {
        Editor.setHTML(legacyLayerHtml);
        await h.sleep(400);
        const state = imageCount();
        const ed = EditorCore.getEditor();
        const canUndo = ed.can().undo();
        const imageSelected = !!ed.state.selection.node;
        const grid = gridOfFirstImage();
        return {
          pass: state.images === 1 && state.marked === 0 && state.withGrid === 1 && state.pending === false && !canUndo && !imageSelected && !!grid && grid.pageIndex === 0,
          notes: JSON.stringify({ state, canUndo, imageSelected, grid }),
        };
      });
    },
  });

  cases.push({
    id: 'image_legacy_layer_track_changes_each_return_of_the_editor_adds_no_copy',
    description: 'Suivi actif : chaque retour de l\'éditeur (refreshLayout, puis un vrai aller-retour Lecture / Édition) laisse une seule image, sans suggestion en attente',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      return withTrackChanges(async () => {
        Editor.setHTML(legacyLayerHtml);
        await h.sleep(400);
        const steps = [['ouverture', imageCount()]];
        for (let i = 1; i <= 3; i++) {
          Editor.refreshLayout();
          await h.sleep(250);
          steps.push(['refreshLayout ' + i, imageCount()]);
        }
        for (let i = 1; i <= 2; i++) {
          await h.clickButton('btn-mode-read');
          await h.sleep(500);
          await h.clickButton('btn-mode-edit');
          await h.sleep(500);
          steps.push(['Lecture puis Edition ' + i, imageCount()]);
        }
        const bad = steps.filter(([, s]) => s.images !== 1 || s.marked !== 0 || s.pending !== false);
        return { pass: bad.length === 0, notes: JSON.stringify(steps.map(([label, s]) => label + ' : ' + s.images + ' image(s), ' + s.marked + ' marquee(s)')) };
      });
    },
  });

  cases.push({
    id: 'image_legacy_layer_track_changes_hidden_load_is_migrated_once_back_without_a_suggestion',
    description: 'Suivi actif, ancien modèle chargé éditeur masqué : l\'image reçoit sa position de page au retour de l\'éditeur, une seule fois et sans suggestion',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      const container = document.getElementById('editor-container');
      return withTrackChanges(async () => {
        try {
          container.style.display = 'none';
          Editor.setHTML(legacyLayerHtml);
          await h.sleep(300);
          const hidden = imageCount();
          container.style.display = 'block';
          Editor.refreshLayout();
          await h.sleep(300);
          const shown = imageCount();
          Editor.refreshLayout();
          await h.sleep(300);
          const again = imageCount();
          const ok = hidden.images === 1 && hidden.withGrid === 0 && [shown, again].every(s => s.images === 1 && s.marked === 0 && s.withGrid === 1 && s.pending === false);
          return { pass: ok, notes: JSON.stringify({ hidden, shown, again }) };
        } finally { container.style.display = 'block'; }
      });
    },
  });

  cases.push({
    id: 'image_legacy_layer_track_changes_deleted_by_the_person_is_not_copied',
    description: 'Suivi actif : une image que la personne a supprimée en suggestion reste une seule image marquée supprimée au retour de l\'éditeur, elle ne se recopie pas',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      const container = document.getElementById('editor-container');
      return withTrackChanges(async () => {
        try {
          // Chargé masqué : l'image n'a pas encore sa position de page, la passe de migration l'attend (cf. les cas plus haut).
          container.style.display = 'none';
          Editor.setHTML(legacyLayerHtml);
          await h.sleep(300);
          container.style.display = 'block';
          const ed = EditorCore.getEditor();
          let imagePos = null;
          ed.state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage') imagePos = pos; });
          ed.chain().focus().setNodeSelection(imagePos).deleteSelection().run();
          await h.sleep(200);
          const deleted = imageCount();
          Editor.refreshLayout();
          await h.sleep(300);
          Editor.refreshLayout();
          await h.sleep(300);
          const back = imageCount();
          return { pass: deleted.images === 1 && deleted.deleted === 1 && back.images === 1 && back.deleted === 1 && back.inserted === 0, notes: JSON.stringify({ deleted, back }) };
        } finally { container.style.display = 'block'; }
      });
    },
  });

  cases.push({
    id: 'image_legacy_layer_track_changes_a_template_already_damaged_stops_growing_and_reject_all_restores_one_image',
    description: 'Un modèle déjà abîmé (l\'original en suppression et trois copies en insertion) ne grossit plus à l\'ouverture ni au retour de l\'éditeur ; « Tout refuser » ne laisse que l\'image d\'origine, avec sa position de page',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      return withTrackChanges(async () => {
        Editor.setHTML(damagedLayerHtml);
        await h.sleep(400);
        const loaded = imageCount();
        Editor.refreshLayout();
        await h.sleep(300);
        Editor.refreshLayout();
        await h.sleep(300);
        const refreshed = imageCount();
        await h.clickButton('v2-btn-reject-all');
        await h.sleep(400);
        const rejected = imageCount();
        const grid = gridOfFirstImage();
        const stable = loaded.images === 4 && loaded.deleted === 1 && loaded.inserted === 3 && refreshed.images === 4 && refreshed.inserted === 3;
        return {
          pass: stable && rejected.images === 1 && rejected.marked === 0 && rejected.pending === false && rejected.withGrid === 1 && !!grid && grid.pageIndex === 0,
          notes: JSON.stringify({ loaded, refreshed, rejected, grid }),
        };
      });
    },
  });

  // --- Passes par lot sur les images en calque : une seule pagination pour toute la passe ---
  // migrateLegacyImagePositions et recaptureLayeredImageGrids mesurent chaque image avec computePageGridPosition, qui reposait toute la pagination (renderPaginationOverlay) à
  // chaque appel : le temps croissait comme images x mise en page (80 images dans un document de 320 blocs : 2 s au chargement d'un modèle). La pagination n'est reposée qu'une fois
  // pour la passe, et de nouveau après une image que la mesure a repoussée au bord de la page. Chaque rendu écrit le libellé « + Ajouter un en-tête » : I18n.t('hf.addHeader') les compte.
  const paginationsDuring = fn => {
    const real = I18n.t;
    let renders = 0;
    I18n.t = function (key) { if (key === 'hf.addHeader') renders++; return real.apply(this, arguments); };
    try { return { result: fn(), renders }; } finally { I18n.t = real; }
  };
  const batchImagesHtml = (count, { withGrid, corner }) => '<p>Début</p>' + Array.from({ length: 40 }, (_, i) => '<p>Remplissage ' + i + ' ' + 'mot '.repeat(30) + '</p>').join('')
    + Array.from({ length: count }, (_, i) => {
      const where = corner && i === 0 ? 'left: -9999px; top: -9999px;' : 'left: ' + (60 + (i % 5) * 70) + 'px; top: ' + (30 + i * 45) + 'px;';
      const grid = withGrid ? ' data-page-index="0" data-page-left-pt="40" data-page-top-pt="' + (20 + i * 30) + '"' : '';
      return '<p>Ligne ' + i + ' <img class="editor-image" src="' + DATA_PNG + '" alt="" style="width: 40px; height: 40px; position: absolute; ' + where + ' z-index: 5;" data-layer="front" data-wrap="inline"' + grid + '></p>';
    }).join('');
  const imageDoms = () => {
    const doms = [];
    EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage') doms.push({ dom: EditorCore.getEditor().view.nodeDOM(pos), attrs: node.attrs }); });
    return doms;
  };
  // Les attributs enregistrés suivent la mesure d'une image prise seule (voie publique, pagination reposée à chaque fois), à l'arrondi du pixel près.
  const gridsMatchSingleMeasure = () => imageDoms().every(({ dom, attrs }) => {
    const g = HeaderFooterPreview.computePageGridPosition(dom);
    return !!g && g.pageIndex === attrs.pageIndex && near(g.pageLeftPt, attrs.pageLeftPt) && near(g.pageTopPt, attrs.pageTopPt);
  });

  cases.push({
    id: 'image_layered_batch_recapture_paginates_once',
    description: 'Recapturer la grille de 30 images en calque ne repose la pagination qu\'une fois, et chaque image reçoit la grille qu\'une mesure prise seule lui donne',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      Editor.setHTML(batchImagesHtml(30, { withGrid: true }));
      await h.sleep(400);
      const { result, renders } = paginationsDuring(() => HeaderFooterPreview.recaptureLayeredImageGrids());
      const matches = gridsMatchSingleMeasure();
      return { pass: result === true && renders === 1 && matches && imageDoms().length === 30, notes: JSON.stringify({ result, renders, matches }) };
    },
  });

  cases.push({
    id: 'image_layered_batch_migrate_paginates_once',
    description: 'Migrer 30 images en calque sans grille (modèle ancien) ne repose la pagination qu\'une fois ; toutes reçoivent leur grille',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML(batchImagesHtml(30, { withGrid: false }));
      await h.sleep(300);
      h.setA4Preview(true);
      const before = imageDoms().filter(({ attrs }) => attrs.pageIndex == null).length;
      const { renders } = paginationsDuring(() => HeaderFooterPreview.migrateLegacyImagePositions());
      const after = imageDoms().filter(({ attrs }) => attrs.pageIndex == null).length;
      return { pass: before === 30 && after === 0 && renders === 1 && gridsMatchSingleMeasure(), notes: JSON.stringify({ before, after, renders }) };
    },
  });

  cases.push({
    id: 'image_layered_batch_repaginates_after_a_moved_image',
    description: 'Une image que la mesure repousse au bord de la page fait reposer la pagination avant l\'image suivante (deux fois en tout), et les grilles restent celles d\'une mesure prise seule',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      Editor.setHTML(batchImagesHtml(6, { withGrid: true, corner: true }));
      await h.sleep(400);
      const { result, renders } = paginationsDuring(() => HeaderFooterPreview.recaptureLayeredImageGrids());
      const [corner] = imageDoms();
      const atEdge = near(corner.attrs.pageLeftPt, -PageLayout.getMarginsPt().left);
      return { pass: result === true && renders === 2 && atEdge && gridsMatchSingleMeasure(), notes: JSON.stringify({ result, renders, atEdge }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.images = cases;
})();
