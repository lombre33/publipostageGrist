// Suite "images" - insertion, position (en ligne aligné gauche/centre/
// droite, calque devant/derrière), redimensionnement (poignées réelles),
// zoom +/-/taille d'origine, opacité, bascule ligne/bloc, suppression.
// Image en data: URI (1x1 PNG) - contourne toute dépendance réseau ET la
// conversion en data URI (urlToDataUriOrWarn retourne immédiatement pour
// un src data:, cf. main-toolbar.js), donc rien à attendre ni simuler côté
// chargement réseau pour la plupart des cas ci-dessous. Deux cas dédiés
// plus bas exercent la vraie conversion http(s) -> data: (retour Antoine,
// 2026-09-28), via des chemins servis par le serveur de test lui-même
// (même origine : intégrée sans question, pas de CORS réel à simuler).
// Une adresse d'un AUTRE site pose la question « Intégrer l'image » / « Garder
// le lien » (choix d'Antoine, 04/10) : les cas « img_insert_external_url_* »,
// avec `fetch` remplacé pour les adresses en « .test ».
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

  // --- Image d'un AUTRE site : la question « Intégrer l'image » / « Garder le lien » (choix d'Antoine du 04/10, contrôle de sécurité) ---------------------------------
  // Les adresses sont en « .test » (jamais résolues) et `fetch` est remplacé le temps d'un cas : les adresses « .test » sont notées et reçoivent une image (« refuse » dans
  // le nom : le site refuse, comme un CORS), le reste passe aux vrais fichiers du harnais.
  const EXTERNAL_URL = 'https://images.exemple.test/logo.png';
  const EXTERNAL_HOST = 'images.exemple.test';
  function stubFetch() {
    const original = window.fetch;
    const urls = [];
    window.fetch = function (input, init) {
      const url = String(typeof input === 'string' ? input : input && input.url);
      if (!/^https?:\/\/[^/]*\.test(:\d+)?\//.test(url)) return original.call(window, input, init);
      urls.push(url);
      if (/refuse/.test(url)) return Promise.reject(new TypeError('Failed to fetch'));
      const bytes = Uint8Array.from(atob(DATA_PNG.split(',')[1]), c => c.charCodeAt(0));
      return Promise.resolve(new Response(new Blob([bytes], { type: 'image/png' }), { status: 200 }));
    };
    return { urls, restore() { window.fetch = original; } };
  }
  // Un clic sur « Insérer une image » avec l'adresse tapée et la réponse donnée à la question ; `choose` : 'keep', 'embed' ou null (annulée). On attend l'image (ou 400 ms
  // quand aucune ne doit venir : le gestionnaire du bouton est asynchrone, le clic ne l'attend pas). Rend ce qui a été demandé, téléchargé et inséré.
  async function insertByUrl(h, typed, choose, { expectImage = true, alert = false } = {}) {
    const fetches = stubFetch();
    const asked = [];
    const dialogs = h.stubDialogs({ prompt: typed, choose: opts => { asked.push({ fetchesAtAsk: fetches.urls.length, opts }); return choose; } });
    const origAlert = window.alert;
    let alertShown = false;
    window.alert = () => { alertShown = true; };
    await h.clickButton('v2-btn-image');
    const deadline = Date.now() + (expectImage ? 3000 : 400);
    while (Date.now() < deadline && !(expectImage && h.tiptap().querySelector('img.editor-image') && (!alert || alertShown))) await h.sleep(20);
    await h.sleep(120);
    dialogs.restore(); fetches.restore(); window.alert = origAlert;
    const image = h.tiptap().querySelector('img.editor-image');
    return { asked, fetched: fetches.urls, alertShown, image, src: image && image.getAttribute('src') };
  }

  cases.push({
    id: 'img_insert_external_url_asks_embed_or_keep',
    description: 'Adresse d\'une image d\'un autre site : une question « Intégrer l\'image » (par défaut) / « Garder le lien », posée après l\'adresse et AVANT tout téléchargement, qui nomme le site',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const r = await insertByUrl(h, EXTERNAL_URL, 'embed');
      const q = r.asked[0] && r.asked[0].opts;
      const labels = q && q.choices.map(c => c.label);
      return {
        pass: r.asked.length === 1 && r.asked[0].fetchesAtAsk === 0 && q.title === I18n.t('dialog.imageExternal.title')
          && q.message === I18n.t('dialog.imageExternal.message', { site: EXTERNAL_HOST }) && q.message.includes(EXTERNAL_HOST)
          && JSON.stringify(q.choices.map(c => c.value)) === '["keep","embed"]' && q.choices[1].primary === true && !q.choices[0].primary
          && JSON.stringify(labels) === JSON.stringify([I18n.t('dialog.imageExternal.keep'), I18n.t('dialog.imageExternal.embed')]),
        notes: { asked: r.asked.length, fetchesAtAsk: r.asked[0] && r.asked[0].fetchesAtAsk, title: q && q.title, labels, primary: q && q.choices.filter(c => c.primary).map(c => c.value) },
      };
    },
  });

  cases.push({
    id: 'img_insert_external_url_embed_converts_to_data_uri',
    description: '« Intégrer l\'image » : l\'image est téléchargée une fois, insérée en data: URI, l\'adresse du site n\'est pas dans le modèle et l\'image n\'est pas signalée',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const r = await insertByUrl(h, EXTERNAL_URL, 'embed');
      const html = Editor.getHTML();
      return {
        pass: !!r.src && r.src.startsWith('data:image/') && JSON.stringify(r.fetched) === JSON.stringify([EXTERNAL_URL]) && !html.includes(EXTERNAL_HOST)
          && !r.image.hasAttribute('data-external-site') && !r.alertShown,
        notes: { src: r.src && r.src.slice(0, 40), fetched: r.fetched, flagged: r.image && r.image.getAttribute('data-external-site'), alert: r.alertShown },
      };
    },
  });

  cases.push({
    id: 'img_insert_external_url_keep_link_stays_flagged',
    description: '« Garder le lien » : l\'adresse est gardée telle quelle, rien n\'est téléchargé à l\'insertion, et l\'image reste signalée (hôte, infobulle, contour en tirets rouges)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const r = await insertByUrl(h, EXTERNAL_URL, 'keep');
      const outline = r.image && getComputedStyle(r.image).outlineStyle;
      return {
        pass: r.src === EXTERNAL_URL && r.fetched.length === 0 && r.image.getAttribute('data-external-site') === EXTERNAL_HOST
          && r.image.title === I18n.t('image.externalSite', { site: EXTERNAL_HOST }) && outline === 'dashed' && !r.alertShown && Editor.getHTML().includes(EXTERNAL_URL),
        notes: { src: r.src, fetched: r.fetched, flagged: r.image && r.image.getAttribute('data-external-site'), outline, alert: r.alertShown },
      };
    },
  });

  cases.push({
    id: 'img_insert_external_url_cancel_inserts_nothing',
    description: 'Question annulée (Annuler, Échap) : aucune image, aucun téléchargement, le document est inchangé',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Avant');
      const before = Editor.getHTML();
      const r = await insertByUrl(h, EXTERNAL_URL, null, { expectImage: false });
      return {
        pass: r.asked.length === 1 && !r.image && r.fetched.length === 0 && !r.alertShown && Editor.getHTML() === before,
        notes: { asked: r.asked.length, image: !!r.image, fetched: r.fetched, same: Editor.getHTML() === before },
      };
    },
  });

  cases.push({
    id: 'img_insert_external_url_embed_failure_keeps_link_and_warns',
    description: '« Intégrer l\'image » sur un site qui refuse le téléchargement : l\'alerte s\'affiche et le lien est gardé, signalé comme tout lien d\'un autre site',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const url = 'https://refuse.exemple.test/logo.png';
      const r = await insertByUrl(h, url, 'embed', { alert: true });
      return {
        pass: r.alertShown && r.src === url && JSON.stringify(r.fetched) === JSON.stringify([url]) && r.image.getAttribute('data-external-site') === 'refuse.exemple.test',
        notes: { alert: r.alertShown, src: r.src, fetched: r.fetched, flagged: r.image && r.image.getAttribute('data-external-site') },
      };
    },
  });

  cases.push({
    id: 'img_insert_url_no_question_for_data_and_same_site',
    description: 'Une adresse data: ou du même site que le widget n\'envoie personne ailleurs : intégrée comme avant, sans question',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const data = await insertByUrl(h, DATA_PNG, 'keep');
      await h.resetEditor();
      await h.focusAtEnd();
      const same = await insertByUrl(h, '/img/grist-factory-logo.jpg', 'keep');
      return {
        pass: data.asked.length === 0 && data.src === DATA_PNG && same.asked.length === 0 && !!same.src && same.src.startsWith('data:image/'),
        notes: { dataAsked: data.asked.length, dataSrc: data.src && data.src.slice(0, 30), sameAsked: same.asked.length, sameSrc: same.src && same.src.slice(0, 30) },
      };
    },
  });

  cases.push({
    id: 'img_insert_url_spaces_trimmed',
    description: 'Une adresse collée avec des espaces ou un retour à la ligne autour : l\'adresse gardée et celle de la question sont nettoyées ; des espaces seuls ne demandent ni n\'insèrent rien',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      const padded = await insertByUrl(h, '  ' + EXTERNAL_URL + ' \n', 'keep');
      await h.resetEditor();
      await h.focusAtEnd();
      const blank = await insertByUrl(h, '   ', 'keep', { expectImage: false });
      return {
        pass: padded.src === EXTERNAL_URL && padded.asked.length === 1 && padded.asked[0].opts.message.includes('(' + EXTERNAL_HOST + ')')
          && blank.asked.length === 0 && !blank.image && blank.fetched.length === 0,
        notes: { paddedSrc: padded.src, blankAsked: blank.asked.length, blankImage: !!blank.image },
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

  // ---------------------------------------------------------------------------------------------------------------------------------------------
  // La vue de l'image (js/editor-nodes.js, NodeView de editorImage) : le DOM qu'elle construit, ce que chaque attribut en fait (applyImageAttrs), les
  // poignées qu'on tire et qu'on glisse. Écrits sur l'ancien code, une seule fonction de 180 lignes, avant son découpage : ils fixent ce que la vue
  // fait, ni plus ni moins. Les événements sont envoyés à la main (même schéma que h.dragFromTo), à la taille du harnais : la feuille n'y est pas
  // réduite, un pixel de souris vaut un pixel de mise en page (la réduction à ~0,85 est celle des scripts `imageZoomMouse`, à la vraie souris).
  const mouse = (type, x, y) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  // Deux objets plats égaux, quel que soit l'ordre de leurs clés.
  const same = (a, b) => { const keys = Object.keys(Object.assign({}, a, b)).sort(); return JSON.stringify(a, keys) === JSON.stringify(b, keys); };
  const imageHtml = (attrs, style) => '<p>Texte <img class="editor-image" src="' + DATA_PNG + '" alt="Logo"' + (style == null ? '' : ' style="' + style + '"') + (attrs || '') + '></p>';

  async function imageSetup(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await h.sleep(150);
    return h.tiptap().querySelector('.editor-image-view');
  }
  function imageNodeAt() {
    let found = null;
    EditorCore.getEditor().state.doc.descendants((node, pos) => { if (!found && node.type.name === 'editorImage') found = { node, pos }; });
    return found;
  }
  function setImageAttrs(patch) {
    const ed = EditorCore.getEditor();
    const image = imageNodeAt();
    ed.view.dispatch(ed.state.tr.setNodeMarkup(image.pos, undefined, Object.assign({}, image.node.attrs, patch)));
  }
  // Ce que la vue montre d'une image : les classes (sans celle de la sélection), le style du cadre et de l'<img>, le libellé, la poignée de déplacement.
  function viewSnapshot(wrap) {
    const img = wrap.querySelector('img.editor-image');
    return {
      cls: Array.from(wrap.classList).filter(c => c !== 'editor-image-selected').sort().join(' '),
      wrapStyle: wrap.getAttribute('style') || '',
      src: img.getAttribute('src'), alt: img.getAttribute('alt'), imgStyle: img.getAttribute('style'),
      label: wrap.querySelector('.editor-image-var-label').textContent,
      handle: wrap.querySelector('.editor-image-move-handle').style.display,
      align: wrap.getAttribute('data-align'), wrapAttr: wrap.getAttribute('data-wrap'),
    };
  }
  const VIEW_DEFAULTS = { cls: 'editor-image-view', wrapStyle: '', src: DATA_PNG, alt: 'Logo', imgStyle: 'width: 120px', label: '', handle: 'none', align: null, wrapAttr: 'inline' };
  const viewExpected = overrides => Object.assign({}, VIEW_DEFAULTS, overrides);
  const FRONT_STYLE = 'width: 100px; position: absolute; left: 30px; top: 40px; z-index: 5';
  const GRID = ' data-page-index="0" data-page-left-pt="10" data-page-top-pt="20"';
  const VAR = ' data-var-table="Docs" data-var-column="Photo" data-var-key="Docs.Photo"';

  cases.push({
    id: 'image_view_builds_its_dom',
    description: 'La vue de l\'image : le cadre, l\'<img>, le libellé, la poignée de déplacement puis les quatre poignées de coin',
    run: async (h) => {
      const wrap = await imageSetup(h, imageHtml(' data-layer="normal" data-wrap="inline"', 'width: 120px'));
      const kids = Array.from(wrap.children);
      const move = wrap.querySelector('.editor-image-move-handle');
      const seen = {
        frame: wrap.tagName + ' ' + wrap.className,
        order: kids.map(k => k.tagName + '.' + Array.from(k.classList).join('.')).join(' '),
        draggable: wrap.querySelector('img').draggable,
        moveTitle: move.title === I18n.t('image.moveHandle') && move.title !== '',
        selected: wrap.classList.contains('editor-image-selected'),
      };
      const expected = {
        frame: 'SPAN editor-image-view',
        order: 'IMG.editor-image SPAN.editor-image-var-label SPAN.editor-image-move-handle SPAN.editor-image-handle.editor-image-handle-nw SPAN.editor-image-handle.editor-image-handle-ne SPAN.editor-image-handle.editor-image-handle-sw SPAN.editor-image-handle.editor-image-handle-se',
        draggable: false, moveTitle: true, selected: false,
      };
      await h.selectAtomNode(wrap.querySelector('img'));
      seen.selectedAfterClick = wrap.classList.contains('editor-image-selected');
      expected.selectedAfterClick = true;
      document.body.dispatchEvent(mouse('mousedown', 3, 3));
      EditorCore.getEditor().commands.setTextSelection(1);
      await h.sleep(60);
      seen.selectedAfterLeaving = wrap.classList.contains('editor-image-selected');
      expected.selectedAfterLeaving = false;
      return { pass: same(seen, expected), notes: JSON.stringify({ seen, expected }) };
    },
  });

  cases.push({
    id: 'image_view_attributes_grid',
    description: 'Ce que la vue de l\'image fait de chaque attribut : style de l\'<img>, classes et style du cadre, libellé d\'une variable ou d\'un QR code, alignement, enveloppement',
    run: async (h) => {
      const table = [
        ['plain', imageHtml(' data-layer="normal" data-wrap="inline"', 'width: 120px'), {}],
        ['opacity', imageHtml('', 'width: 120px; opacity: 0.4'), { imgStyle: 'width: 120px; opacity: 0.4' }],
        ['opacityOne', imageHtml('', 'width: 120px; opacity: 1'), {}],
        ['defaultWidth', imageHtml('', 'opacity: 0.5'), { imgStyle: 'width: 320px; opacity: 0.5' }],
        ['front', imageHtml(' data-layer="front"', FRONT_STYLE), { cls: 'editor-image-layered editor-image-view', wrapStyle: 'position: absolute; left: 30px; top: 40px; width: 100px;', imgStyle: 'width: 100px; position: relative; z-index: 5', handle: '' }],
        ['behind', imageHtml(' data-layer="behind"', 'width: 100px; position: absolute; left: 30px; top: 40px; z-index: -1; opacity: 0.5'), { cls: 'editor-image-layered editor-image-view', wrapStyle: 'position: absolute; left: 30px; top: 40px; width: 100px;', imgStyle: 'width: 100px; opacity: 0.5; position: relative; z-index: -1', handle: '' }],
        ['layeredWithoutPosition', imageHtml(' data-layer="front"', 'width: 100px'), { cls: 'editor-image-layered editor-image-view', wrapStyle: 'position: absolute; left: 0px; top: 0px; width: 100px;', imgStyle: 'width: 100px; position: relative; z-index: 5', handle: '' }],
        ['behindRepeated', imageHtml(' data-layer="behind" data-repeat="true"' + GRID, 'width: 100px; position: absolute; left: 30px; top: 40px; z-index: -1'), { cls: 'editor-image-layered editor-image-repeated editor-image-view', wrapStyle: 'position: absolute; left: 30px; top: 40px; width: 100px;', imgStyle: 'width: 100px; position: relative; z-index: -1', handle: '' }],
        ['frontNotRepeated', imageHtml(' data-layer="front" data-repeat="true"' + GRID, FRONT_STYLE), { cls: 'editor-image-layered editor-image-view', wrapStyle: 'position: absolute; left: 30px; top: 40px; width: 100px;', imgStyle: 'width: 100px; position: relative; z-index: 5', handle: '' }],
        ['variable', imageHtml(VAR, 'width: 200px; height: 80px'), { cls: 'editor-image-var-placeholder editor-image-view', src: '', imgStyle: 'width: 200px; height: 80px', label: '#Docs.Photo' }],
        ['variableWithoutHeight', imageHtml(VAR, 'width: 200px'), { cls: 'editor-image-var-placeholder editor-image-view', src: '', imgStyle: 'width: 200px', label: '#Docs.Photo' }],
        ['variableWithoutKey', imageHtml(' data-var-table="Docs" data-var-column="Photo"', 'width: 200px; height: 80px'), { cls: 'editor-image-var-placeholder editor-image-view', src: '', imgStyle: 'width: 200px; height: 80px', label: '#' }],
        ['heightIgnoredOutsideVariable', imageHtml('', 'width: 120px; height: 50px'), {}],
        ['qrBox', '<p>Texte <img class="editor-image" alt="QR" data-qr-text="#Table.Colonne" style="width: 120px"></p>', { cls: 'editor-image-qr-placeholder editor-image-var-placeholder editor-image-view', src: '', alt: 'QR', imgStyle: 'width: 120px; aspect-ratio: 1 / 1', label: '#Table.Colonne' }],
        ['qrDrawn', imageHtml(' data-qr-text="https://exemple.test"', 'width: 120px'), { alt: 'Logo' }],
        ['qrInVariable', '<p>Texte <img class="editor-image" alt="V" data-qr-text="#T.C"' + VAR + ' style="width: 200px; height: 80px"></p>', { cls: 'editor-image-var-placeholder editor-image-view', src: '', alt: 'V', imgStyle: 'width: 200px; height: 80px', label: '#Docs.Photo' }],
        ['alignAndBlock', imageHtml(' data-align="center" data-wrap="block"', 'width: 120px'), { align: 'center', wrapAttr: 'block' }],
        ['emptyAlt', '<p>Texte <img class="editor-image" src="' + DATA_PNG + '" alt="" style="width: 120px"></p>', { alt: '' }],
      ];
      const seen = {};
      const expected = {};
      for (const [name, html, overrides] of table) {
        const wrap = await imageSetup(h, html);
        const snapshot = wrap ? viewSnapshot(wrap) : 'cadre absent';
        const want = viewExpected(overrides);
        seen[name] = same(snapshot, want) ? 'ok' : snapshot;
        expected[name] = 'ok';
      }
      return { pass: same(seen, expected), notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'image_view_attributes_update',
    description: 'Une mise à jour des attributs réécrit la vue de l\'image en place : le calque se pose et se retire, la classe de clic au travers part avec « derrière », une variable devient image et inversement',
    run: async (h) => {
      const wrap = await imageSetup(h, imageHtml(' data-layer="front"', FRONT_STYLE));
      const steps = [];
      const record = (name, expectedOverrides) => {
        const view = h.tiptap().querySelector('.editor-image-view');
        steps.push([name, view === wrap && same(viewSnapshot(wrap), viewExpected(expectedOverrides)) ? 'ok' : (view === wrap ? viewSnapshot(wrap) : 'vue recréée')]);
      };
      const FRONT = { cls: 'editor-image-layered editor-image-view', wrapStyle: 'position: absolute; left: 30px; top: 40px; width: 100px;', imgStyle: 'width: 100px; position: relative; z-index: 5', handle: '' };
      record('initial', FRONT);
      setImageAttrs({ layer: 'normal' }); await h.sleep(60);
      record('toNormal', { imgStyle: 'width: 100px' });
      setImageAttrs({ layer: 'behind', left: 12, top: 34 }); await h.sleep(60);
      record('toBehind', { cls: 'editor-image-layered editor-image-view', wrapStyle: 'position: absolute; left: 12px; top: 34px; width: 100px;', imgStyle: 'width: 100px; position: relative; z-index: -1', handle: '' });
      wrap.classList.add('editor-image-click-through');
      setImageAttrs({ opacity: 0.25 }); await h.sleep(60);
      record('behindStaysClickThrough', { cls: 'editor-image-click-through editor-image-layered editor-image-view', wrapStyle: 'position: absolute; left: 12px; top: 34px; width: 100px;', imgStyle: 'width: 100px; opacity: 0.25; position: relative; z-index: -1', handle: '' });
      setImageAttrs({ layer: 'front', opacity: null }); await h.sleep(60);
      record('toFrontDropsClickThrough', { cls: 'editor-image-layered editor-image-view', wrapStyle: 'position: absolute; left: 12px; top: 34px; width: 100px;', imgStyle: 'width: 100px; position: relative; z-index: 5', handle: '' });
      setImageAttrs({ layer: 'normal', varTable: 'Docs', varColumn: 'Photo', varKey: 'Docs.Photo', height: '80px' }); await h.sleep(60);
      record('toVariable', { cls: 'editor-image-var-placeholder editor-image-view', src: '', imgStyle: 'width: 100px; height: 80px', label: '#Docs.Photo' });
      setImageAttrs({ varTable: null, varColumn: null, varKey: null }); await h.sleep(60);
      record('backToImage', { imgStyle: 'width: 100px' });
      setImageAttrs({ align: 'right', wrap: 'block' }); await h.sleep(60);
      record('alignRight', { imgStyle: 'width: 100px', align: 'right', wrapAttr: 'block' });
      setImageAttrs({ align: null, wrap: null }); await h.sleep(60);
      record('alignCleared', { imgStyle: 'width: 100px' });
      setImageAttrs({ alt: null, width: null }); await h.sleep(60);
      record('altAndWidthCleared', { alt: '', imgStyle: '' });
      const seen = {}; const expected = {};
      steps.forEach(([name, result]) => { seen[name] = result; expected[name] = 'ok'; });
      return { pass: same(seen, expected), notes: JSON.stringify(seen) };
    },
  });

  // Appuie sur `target` (mousedown en son centre) sans relâcher. Rend l'abscisse et l'ordonnée de l'appui, si le mousedown a été annulé (preventDefault)
  // et s'il est remonté jusqu'au <body>.
  function pressOn(target) {
    const rect = target.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    const reached = [];
    const spy = event => reached.push(event.type);
    document.body.addEventListener('mousedown', spy);
    const notPrevented = target.dispatchEvent(mouse('mousedown', x, y));
    document.body.removeEventListener('mousedown', spy);
    return { x, y, prevented: !notPrevented, reachedBody: reached.length > 0 };
  }
  const dragBy = (press, dx, dy) => document.dispatchEvent(mouse('mousemove', press.x + dx, press.y + dy));
  const releaseBy = (press, dx, dy) => document.dispatchEvent(mouse('mouseup', press.x + dx, press.y + dy));

  // Les ajouts et retraits d'écouteurs de souris sur `document` pendant `action`, avec la fonction (cf. scenarios-twocolumns.js).
  async function documentListeners(action) {
    const log = [];
    const add = document.addEventListener;
    const remove = document.removeEventListener;
    const watched = type => type === 'mousemove' || type === 'mouseup';
    document.addEventListener = function (type, fn) { if (watched(type)) log.push({ op: 'add', type, fn }); return add.apply(this, arguments); };
    document.removeEventListener = function (type, fn) { if (watched(type)) log.push({ op: 'remove', type, fn }); return remove.apply(this, arguments); };
    try { await action(log); } finally { document.addEventListener = add; document.removeEventListener = remove; }
    return log;
  }
  // Ce qui reste posé à la fin du journal : un retrait ne défait que l'ajout qui le précède (même fonction).
  const leaked = (log, type) => {
    const live = [];
    log.forEach(e => {
      if (e.type !== type) return;
      const at = live.findIndex(l => l.fn === e.fn && l.capture === e.capture);
      if (e.op === 'add') { if (at === -1) live.push(e); } else if (at !== -1) live.splice(at, 1);
    });
    return live.length;
  };
  const widthOf = () => { const n = imageNodeAt(); return n.node.attrs.width + ' ' + n.node.attrs.height; };

  cases.push({
    id: 'image_view_resize_gestures',
    description: 'Les poignées de coin : le signe de chaque coin, le plancher de 30 px, la hauteur d\'un placeholder de variable, la largeur du cadre d\'un calque, le glisser qui se détache',
    run: async (h) => {
      const seen = {};
      const gesture = async (name, html, corner, dx, dy) => {
        const wrap = await imageSetup(h, html);
        const img = wrap.querySelector('img.editor-image');
        const press = pressOn(wrap.querySelector('.editor-image-handle-' + corner));
        dragBy(press, dx, dy);
        const live = img.style.width + '|' + img.style.height + '|' + wrap.style.width;
        releaseBy(press, dx, dy);
        await h.sleep(80);
        const after = viewSnapshot(h.tiptap().querySelector('.editor-image-view'));
        seen[name] = [press.prevented, press.reachedBody, live, widthOf(), after.wrapStyle ? 'cadre ' + after.wrapStyle : 'cadre libre', after.imgStyle].join(' ; ');
      };
      const PLAIN = imageHtml('', 'width: 150px');
      const BOX = imageHtml(VAR, 'width: 200px; height: 80px');
      const LAYER = imageHtml(' data-layer="front"', FRONT_STYLE);
      await gesture('se', PLAIN, 'se', 40, 0);
      await gesture('sw', PLAIN, 'sw', -40, 0);
      await gesture('nw', PLAIN, 'nw', -40, 0);
      await gesture('ne', PLAIN, 'ne', 40, 0);
      await gesture('seFloor', PLAIN, 'se', -1000, 0);
      await gesture('swFloor', PLAIN, 'sw', 1000, 0);
      await gesture('heightIgnored', PLAIN, 'se', 40, 500);
      await gesture('noMove', PLAIN, 'se', 0, 0);
      await gesture('boxSe', BOX, 'se', 30, 20);
      await gesture('boxNw', BOX, 'nw', -30, -20);
      await gesture('boxNe', BOX, 'ne', 30, -20);
      await gesture('boxSw', BOX, 'sw', -30, 20);
      await gesture('boxFloor', BOX, 'se', -1000, -1000);
      await gesture('layered', LAYER, 'se', 25, 10);
      // Les attributs lus au début du geste sont ceux du document à ce moment-là, pas ceux du premier rendu de la vue.
      const late = await imageSetup(h, PLAIN);
      setImageAttrs({ layer: 'front', left: 30, top: 40 });
      await h.sleep(80);
      const latePress = pressOn(late.querySelector('.editor-image-handle-se'));
      dragBy(latePress, 25, 0);
      seen.layeredAfterUpdate = late.style.width + ' ' + late.querySelector('img').style.width;
      releaseBy(latePress, 25, 0);
      await h.sleep(80);
      // Détaché : un mousemove après le relâchement ne bouge plus rien ; détruite en plein glisser, la vue n'a plus d'écouteur de mouvement.
      const wrap = await imageSetup(h, PLAIN);
      const img = wrap.querySelector('img.editor-image');
      await documentListeners(async (log) => {
        let press = pressOn(wrap.querySelector('.editor-image-handle-se'));
        dragBy(press, 10, 0);
        releaseBy(press, 10, 0);
        await h.sleep(80);
        seen.leakedAfterRelease = leaked(log.slice(), 'mousemove');
        const widthAfter = img.style.width;
        dragBy(press, 90, 0);
        seen.detached = widthAfter + ' ' + img.style.width;
        const again = h.tiptap().querySelector('.editor-image-view');
        press = pressOn(again.querySelector('.editor-image-handle-se'));
        dragBy(press, 10, 0);
        Editor.setHTML('<p>Apres</p>');
        await h.sleep(150);
        seen.leakedAtDestroy = leaked(log.slice(), 'mousemove');
      });
      const expected = {
        se: 'true ; false ; 190px|| ; 190px null ; cadre libre ; width: 190px', sw: 'true ; false ; 190px|| ; 190px null ; cadre libre ; width: 190px',
        nw: 'true ; false ; 190px|| ; 190px null ; cadre libre ; width: 190px', ne: 'true ; false ; 190px|| ; 190px null ; cadre libre ; width: 190px',
        seFloor: 'true ; false ; 30px|| ; 30px null ; cadre libre ; width: 30px', swFloor: 'true ; false ; 30px|| ; 30px null ; cadre libre ; width: 30px',
        heightIgnored: 'true ; false ; 190px|| ; 190px null ; cadre libre ; width: 190px', noMove: 'true ; false ; 150px|| ; 150px null ; cadre libre ; width: 150px',
        boxSe: 'true ; false ; 230px|100px| ; 230px 100px ; cadre libre ; width: 230px; height: 100px', boxNw: 'true ; false ; 230px|100px| ; 230px 100px ; cadre libre ; width: 230px; height: 100px',
        boxNe: 'true ; false ; 230px|100px| ; 230px 100px ; cadre libre ; width: 230px; height: 100px', boxSw: 'true ; false ; 230px|100px| ; 230px 100px ; cadre libre ; width: 230px; height: 100px',
        boxFloor: 'true ; false ; 30px|30px| ; 30px 30px ; cadre libre ; width: 30px; height: 30px',
        layered: 'true ; false ; 125px||125px ; 125px null ; cadre position: absolute; left: 30px; top: 40px; width: 125px; ; width: 125px; position: relative; z-index: 5',
        layeredAfterUpdate: '175px 175px', leakedAfterRelease: 0, detached: '160px 160px', leakedAtDestroy: 0,
      };
      return { pass: same(seen, expected), notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'image_view_move_gestures',
    description: 'Glisser une image en calque : par sa poignée, ou directement quand elle est sélectionnée ; sans mouvement rien ne s\'écrit ; une image en ligne ne se glisse pas',
    run: async (h) => {
      const seen = {};
      const wrap = await imageSetup(h, imageHtml(' data-layer="front"', FRONT_STYLE));
      const img = wrap.querySelector('img.editor-image');
      const pos = () => wrap.style.left + ' ' + wrap.style.top;
      const attrsNow = () => { const a = imageNodeAt().node.attrs; return a.left + ' ' + a.top; };
      // Pas encore sélectionnée : l'appui sur l'image n'est pas un glisser.
      let press = pressOn(img);
      dragBy(press, 20, 15);
      seen.unselectedLive = pos();
      releaseBy(press, 20, 15);
      await h.sleep(60);
      seen.unselectedAttrs = attrsNow() + ' ' + press.prevented + ' ' + press.reachedBody;
      // Sélectionnée : l'appui sur l'image se glisse. Le cadre suit la souris en direct, les attributs s'écrivent au relâchement. (La sélection se pose par
      // la commande, pas par un clic : un second clic au même endroit dans la demi-seconde serait pour ProseMirror un double clic.)
      EditorCore.getEditor().commands.setNodeSelection(imageNodeAt().pos);
      await h.sleep(80);
      seen.selected = wrap.classList.contains('editor-image-selected');
      press = pressOn(img);
      dragBy(press, 20, 15);
      seen.imageLive = pos() + ' ' + press.prevented + ' ' + press.reachedBody;
      releaseBy(press, 20, 15);
      await h.sleep(80);
      seen.imageAfter = attrsNow() + ' ' + pos();
      // Par la poignée de déplacement, sélectionnée ou non.
      press = pressOn(wrap.querySelector('.editor-image-move-handle'));
      dragBy(press, -10, -5);
      seen.handleLive = pos() + ' ' + press.prevented + ' ' + press.reachedBody;
      releaseBy(press, -10, -5);
      await h.sleep(80);
      seen.handleAfter = attrsNow() + ' ' + pos();
      // Sans mouvement : rien ne s'écrit.
      const docBefore = EditorCore.getEditor().state.doc;
      await documentListeners(async (inner) => {
        press = pressOn(wrap.querySelector('.editor-image-move-handle'));
        releaseBy(press, 0, 0);
        await h.sleep(80);
        seen.leakedAfterRelease = leaked(inner.slice(), 'mousemove');
      });
      seen.noMove = (EditorCore.getEditor().state.doc === docBefore) + ' ' + attrsNow();
      // Détaché : un mousemove après le relâchement ne bouge plus rien.
      dragBy(press, 50, 50);
      seen.detached = pos();
      // Détruite en plein glisser : plus d'écouteur de mouvement.
      await documentListeners(async (inner) => {
        const again = pressOn(wrap.querySelector('.editor-image-move-handle'));
        dragBy(again, 5, 5);
        Editor.setHTML('<p>Apres</p>');
        await h.sleep(150);
        seen.leakedAtDestroy = leaked(inner.slice(), 'mousemove');
        releaseBy(again, 5, 5);
        await h.sleep(60);
      });
      // Une image en ligne : pas de poignée de déplacement visible, et l'appui sur l'image ne glisse rien.
      const inline = await imageSetup(h, imageHtml(' data-layer="normal"', 'width: 120px'));
      EditorCore.getEditor().commands.setNodeSelection(imageNodeAt().pos);
      await h.sleep(80);
      const inlinePress = pressOn(inline.querySelector('img'));
      seen.inline = inline.querySelector('.editor-image-move-handle').style.display + ' ' + inlinePress.prevented + ' ' + inlinePress.reachedBody;
      releaseBy(inlinePress, 0, 0);
      const expected = {
        unselectedLive: '30px 40px', unselectedAttrs: '30 40 false true',
        selected: true, imageLive: '50px 55px true false', imageAfter: '50 55 50px 55px',
        handleLive: '40px 50px true false', handleAfter: '40 50 40px 50px',
        noMove: 'true 40 50', leakedAfterRelease: 0, detached: '40px 50px', leakedAtDestroy: 0,
        inline: 'none false true',
      };
      return { pass: same(seen, expected), notes: JSON.stringify(seen) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.images = cases;
})();
