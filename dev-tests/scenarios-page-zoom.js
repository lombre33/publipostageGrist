// Suite "pageZoom" - zoom de la page (js/page-zoom.js, css/page-zoom.css), en Édition et en Lecture : un petit document aux dimensions personnalisées
// apparaîtrait sinon tout petit au milieu du gris. Une pastille dans le coin bas droit du document (moins, pourcentage, plus, Ajuster), Ctrl (⌘) +
// molette, Ctrl (⌘) + plus / moins / 0 ; affichage seulement ; le niveau est gardé par modèle, dans ce navigateur.
// Ici : la structure, les niveaux, les états et les textes, dans la page (clics, touches et molette synthétiques) ;
// dev-tests/verify-page-zoom-mouse.mjs en mesure les pixels à 700x400 à la vraie souris, à la vraie molette et au vrai clavier, en clair, en sombre
// et en anglais.
// Les contrôles se lisent par le DOM (#pp-page-zoom-*), jamais par l'API de PageZoom : sur l'ancien code ils sont absents et le scénario échoue au
// lieu de lever une exception.
// Chaque scénario repart de l'affichage d'origine et y revient (finish) : le niveau choisi ne doit rien laisser derrière lui.
(function () {
  const cases = [];
  const STORAGE = 'pp_page_zoom';
  const PAGE_LINES = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + i + ' du document de test de pagination, assez longue pour occuper la largeur de la page.</p>').join('');
  const SHORT_HTML = '<p>Un petit document de test.</p><p>Second paragraphe.</p>';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  const el = id => document.getElementById(id);
  const part = key => el('pp-page-zoom-' + key);
  const editorBox = () => el('editor-container');
  const readerBox = () => el('reader-container');
  const factorOf = box => parseFloat((box || editorBox()).style.getPropertyValue('--pp-fit-zoom'));
  const shown = () => { const p = part('value'); return p ? p.textContent : null; };
  const isOff = key => { const b = part(key); return !!b && b.getAttribute('aria-disabled') === 'true'; };
  const press = key => { const b = part(key); if (!b) return false; b.click(); return true; };
  const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.0006 : tol);
  const sheetOf = box => box.querySelector(box === editorBox() ? '.v2-page-sheet' : '.reader-content');
  const inRead = () => readerBox().style.display === 'block';
  // La feuille telle que la mise en page la connaît (pixels de la page) et telle qu'elle est à l'écran (zoom compris).
  const layoutWidth = box => { const s = sheetOf(box); return s ? s.offsetWidth : null; };
  const screenWidth = box => { const s = sheetOf(box); return s ? s.getBoundingClientRect().width : null; };
  const savedLevels = () => { try { return JSON.parse(localStorage.getItem(STORAGE) || '[]'); } catch (e) { return null; } };

  function key(init) {
    const event = new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init));
    document.activeElement.dispatchEvent(event);
    return event;
  }
  function wheel(target, init) {
    const r = target.getBoundingClientRect();
    const event = new WheelEvent('wheel', Object.assign({ bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }, init));
    target.dispatchEvent(event);
    return event;
  }

  // Repart de l'affichage d'origine : le niveau d'un scénario précédent est rendu par le pourcentage (ou, à défaut, par la touche 0).
  async function toOriginal() {
    if (part('value') && !isOff('value')) press('value');
    localStorage.removeItem(STORAGE);
    editorBox().style.maxWidth = '';
    await sleep(350);
  }
  async function setup(h, html) {
    await toOriginal();
    await h.resetEditor();
    I18n.setLang('fr');
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    Editor.setHTML(html || SHORT_HTML);
    await sleep(350);
  }
  async function finish(h) {
    await toOriginal();
    if (inRead()) { el('btn-mode-edit').click(); await sleep(500); }
    I18n.setLang('fr');
    const toggle = el('v2-toggle-a4-preview');
    if (toggle && !toggle.disabled && !toggle.checked) { toggle.click(); await sleep(200); }
    document.querySelectorAll('.pp-modal').forEach(m => { if (m.dataset.testOpened) { m.style.display = 'none'; delete m.dataset.testOpened; } });
    PageLayout.setMarginsMm(null);
    await sleep(100);
  }

  async function savedTemplate(h, name, html, type) {
    // « Nouveau » d'abord : sans lui, Enregistrer réécrirait le modèle précédent au lieu d'en créer un.
    await h.clickButton('btn-new');
    await h.sleep(300);
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    Editor.setHTML(html || SHORT_HTML);
    el('template-name').value = name;
    if (type) {
      const row = await Templates.save(null, name, html, '', null, null, type, null);
      return row.id;
    }
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }
  async function selectTemplate(h, id) {
    const select = el('template-select');
    // Un modèle écrit directement (grille, macro-modèle) n'est pas encore dans la liste : le cache des modèles est relu et l'entrée posée à la main, comme le fait scenarios-orientation.js.
    if (!Array.from(select.options).some(o => o.value === String(id))) {
      await Templates.loadAll();
      const tpl = Templates.byId(id);
      const option = document.createElement('option');
      option.value = String(id);
      option.textContent = tpl ? tpl.nom : 'Modèle ' + id;
      select.appendChild(option);
    }
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(800);
  }

  cases.push({
    id: 'page_zoom_pill_sits_in_the_corner_with_its_four_controls',
    description: 'Une pastille dans le coin bas droit du document, hors de la barre d’outils : moins, pourcentage (100 % au départ), plus, Ajuster ; sous les barres flottantes et les menus (jeton --z-page-zoom), rien de grisé, rien d’enfoncé',
    run: async (h) => {
      try {
        await setup(h);
        const pill = el('pp-page-zoom');
        const r = pill && pill.getBoundingClientRect();
        const cs = pill && getComputedStyle(pill);
        const root = getComputedStyle(document.documentElement);
        const buttons = ['out', 'value', 'in', 'fit'].map(k => part(k));
        const got = {
          pill: !!pill, inBody: !!pill && pill.parentElement === document.body, role: pill && pill.getAttribute('role'), aria: pill && pill.getAttribute('aria-label'),
          four: buttons.every(Boolean), fixed: cs && cs.position, z: cs && cs.zIndex, tokenZoom: root.getPropertyValue('--z-page-zoom').trim(), tokenToolbar: root.getPropertyValue('--z-floating-toolbar').trim(),
          rightGap: r && Math.round(window.innerWidth - r.right), bottomGap: r && Math.round(window.innerHeight - r.bottom), height: r && Math.round(r.height),
          value: shown(), pressed: part('fit') && part('fit').getAttribute('aria-pressed'), anyOff: ['out', 'value', 'in', 'fit'].some(isOff),
          factor: factorOf(editorBox()), outText: part('out') && part('out').textContent, inText: part('in') && part('in').textContent, fitText: part('fit') && part('fit').textContent,
          outAria: part('out') && part('out').getAttribute('aria-label'), types: buttons.map(b => b && b.type),
        };
        const pass = got.pill && got.inBody && got.role === 'region' && got.aria === 'Zoom de la page' && got.four && got.fixed === 'fixed' && got.z === '1400' && got.tokenZoom === '1400'
          && Number(got.tokenZoom) < Number(got.tokenToolbar) && got.rightGap >= 16 && got.rightGap <= 40 && got.bottomGap >= 16 && got.bottomGap <= 40 && got.height <= 34
          && got.value === '100 %' && got.pressed === 'false' && !got.anyOff && (got.factor === 1 || isNaN(got.factor)) && got.outText === '−' && got.inText === '+' && got.fitText === 'Ajuster'
          && got.outAria === 'Zoom arrière (' + (/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl') + ' −)' && got.types.every(t => t === 'button');
        return { pass, notes: JSON.stringify(got) };
      } finally { await finish(h); }
    },
  });

  cases.push({
    id: 'page_zoom_texts_are_in_both_languages',
    description: 'Infobulles, étiquettes et pourcentage en français et en anglais, avec le raccourci de la plateforme ; chaque clé pageZoom.* existe dans les deux langues avec les mêmes variables',
    run: async (h) => {
      try {
        await setup(h);
        const mod = /Mac|iPhone|iPad/i.test(navigator.platform || '') ? '⌘' : 'Ctrl';
        const read = () => ({ out: part('out').title, outAria: part('out').getAttribute('aria-label'), inn: part('in').title, value: part('value').title, valueText: shown(), fit: part('fit').textContent, fitTip: part('fit').title, group: el('pp-page-zoom').getAttribute('aria-label') });
        const fr = read();
        I18n.setLang('en');
        await sleep(100);
        const en = read();
        I18n.setLang('fr');
        const expectFr = { out: 'Zoom arrière (' + mod + ' −)', outAria: 'Zoom arrière (' + mod + ' −)', inn: 'Zoom avant (' + mod + ' +)', value: 'Revenir à l’affichage d’origine (' + mod + ' 0)', valueText: '100 %', fit: 'Ajuster', fitTip: 'Ajuster la page à la largeur du panneau', group: 'Zoom de la page' };
        const expectEn = { out: 'Zoom out (' + mod + ' −)', outAria: 'Zoom out (' + mod + ' −)', inn: 'Zoom in (' + mod + ' +)', value: 'Back to the original view (' + mod + ' 0)', valueText: '100%', fit: 'Fit', fitTip: 'Fit the page to the panel width', group: 'Page zoom' };
        const sameFr = JSON.stringify(fr) === JSON.stringify(expectFr);
        const sameEn = JSON.stringify(en) === JSON.stringify(expectEn);
        // Toutes les clés, dans les deux langues, avec les mêmes {variables} : relues par l'API publique (t) avec des valeurs repérables.
        const keys = ['pageZoom.group', 'pageZoom.value', 'pageZoom.out', 'pageZoom.in', 'pageZoom.reset', 'pageZoom.fit', 'pageZoom.fit.tip', 'pageZoom.unavailable.preview', 'pageZoom.unavailable.none'];
        const vars = { n: 'N1', keys: 'K1', format: 'F1' };
        const placeholders = text => (text.match(/\b(N1|K1|F1)\b/g) || []).sort().join(',');
        const complete = keys.map(k => { I18n.setLang('fr'); const a = I18n.t(k, vars); I18n.setLang('en'); const b = I18n.t(k, vars); I18n.setLang('fr'); return { k, a, b, same: placeholders(a) === placeholders(b), blank: !a || !b || a === k || b === k }; });
        const bad = complete.filter(c => !c.same || c.blank);
        return { pass: sameFr && sameEn && bad.length === 0, notes: JSON.stringify({ fr, en, bad }) };
      } finally { await finish(h); }
    },
  });

  cases.push({
    id: 'page_zoom_buttons_walk_the_steps_and_only_the_screen_changes',
    description: 'Plus et moins suivent l’échelle (…, 90, 100, 110, 125, 150…) : la feuille grandit ou rétrécit à l’écran seulement - ses pixels de page, le HTML du modèle et la largeur de page restent ceux d’avant ; les bornes (25 % et 400 %) grisent le bouton sans le retirer',
    run: async (h) => {
      try {
        await setup(h, PAGE_LINES(8));
        const layout0 = layoutWidth(editorBox());
        const html0 = Editor.getHTML();
        const pageWidth0 = PageLayout.getSheetWidthPx();
        const up = [];
        for (let i = 0; i < 3; i++) { press('in'); await sleep(60); up.push(shown() + '/' + factorOf(editorBox())); }
        const screenAt150 = screenWidth(editorBox());
        const layoutAt150 = layoutWidth(editorBox());
        const down = [];
        for (let i = 0; i < 6; i++) { press('out'); await sleep(60); down.push(shown() + '/' + factorOf(editorBox())); }
        // Jusqu'aux bornes.
        for (let i = 0; i < 20; i++) press('in');
        await sleep(100);
        const top = { value: shown(), factor: factorOf(editorBox()), inOff: isOff('in'), outOff: isOff('out') };
        press('in'); await sleep(60);
        const stillTop = { value: shown(), factor: factorOf(editorBox()) };
        for (let i = 0; i < 30; i++) press('out');
        await sleep(100);
        const bottom = { value: shown(), factor: factorOf(editorBox()), outOff: isOff('out'), inOff: isOff('in') };
        press('out'); await sleep(60);
        const stillBottom = { value: shown(), factor: factorOf(editorBox()) };
        const visibleAtMin = !!el('pp-page-zoom-out') && el('pp-page-zoom-out').getClientRects().length > 0;
        const expectedUp = ['110 %/1.1', '125 %/1.25', '150 %/1.5'];
        const expectedDown = ['125 %/1.25', '110 %/1.1', '100 %/1', '90 %/0.9', '80 %/0.8', '75 %/0.75'];
        const same = layoutWidth(editorBox()) === layout0 && layoutAt150 === layout0 && Editor.getHTML() === html0 && PageLayout.getSheetWidthPx() === pageWidth0;
        const pass = JSON.stringify(up) === JSON.stringify(expectedUp) && JSON.stringify(down) === JSON.stringify(expectedDown) && near(screenAt150, layout0 * 1.5, 1.2) && same
          && top.value === '400 %' && top.factor === 4 && top.inOff && !top.outOff && stillTop.value === '400 %'
          && bottom.value === '25 %' && bottom.factor === 0.25 && bottom.outOff && !bottom.inOff && stillBottom.value === '25 %' && visibleAtMin;
        return { pass, notes: JSON.stringify({ up, down, layout0, layoutAt150, screenAt150, same, top, stillTop, bottom, stillBottom, visibleAtMin }) };
      } finally { await finish(h); }
    },
  });

  cases.push({
    id: 'page_zoom_fit_fills_the_panel_width_follows_it_and_the_percentage_goes_back',
    description: '« Ajuster » donne à la page toute la largeur du panneau (enfoncé) et la suit quand il change de taille ; un cran de plus ou de moins quitte l’ajustement ; cliquer le pourcentage rend l’affichage d’origine',
    run: async (h) => {
      try {
        await setup(h, PAGE_LINES(8));
        // Un panneau étroit comme celui de Grist, à partir de la largeur de la fenêtre de test.
        editorBox().style.maxWidth = '700px';
        await sleep(450);
        const box = editorBox();
        const padding = parseFloat(getComputedStyle(box).paddingLeft) + parseFloat(getComputedStyle(box).paddingRight);
        const originalFactor = factorOf(box);
        press('fit');
        await sleep(500);
        const sheet = sheetOf(box);
        const fitted = { factor: factorOf(box), value: shown(), pressed: part('fit').getAttribute('aria-pressed'), screen: sheet.getBoundingClientRect().width, avail: box.offsetWidth - padding };
        // La feuille remplit la largeur utile, sans déborder (barre de défilement comptée comme présente : au plus 20 px d'écart).
        const fills = fitted.screen <= fitted.avail + 0.5 && fitted.screen >= fitted.avail - 20 && box.scrollWidth <= box.clientWidth + 1;
        editorBox().style.maxWidth = '1000px';
        await sleep(600);
        const wider = { factor: factorOf(box), pressed: part('fit').getAttribute('aria-pressed'), screen: sheetOf(box).getBoundingClientRect().width };
        editorBox().style.maxWidth = '500px';
        await sleep(600);
        const narrower = { factor: factorOf(box), pressed: part('fit').getAttribute('aria-pressed') };
        press('in');
        await sleep(300);
        const leftAt = { pressed: part('fit').getAttribute('aria-pressed'), factor: factorOf(box), value: shown() };
        editorBox().style.maxWidth = '900px';
        await sleep(600);
        const left = Object.assign({ factorAfterWiden: factorOf(box), valueAfterWiden: shown() }, { pressed: leftAt.pressed, factorBefore: leftAt.factor });
        press('value');
        await sleep(500);
        editorBox().style.maxWidth = '';
        await sleep(500);
        const original = { factor: factorOf(box), value: shown(), pressed: part('fit').getAttribute('aria-pressed') };
        // Un cran de plus quitte l'ajustement : le panneau a beau s'élargir, le niveau ne bouge plus.
        const pass = fitted.pressed === 'true' && fitted.factor > 0.5 && fitted.factor < 1 && fills && wider.pressed === 'true' && wider.factor > fitted.factor && wider.screen > fitted.screen
          && narrower.pressed === 'true' && narrower.factor < fitted.factor && left.pressed === 'false' && left.factorAfterWiden === left.factorBefore
          && original.pressed === 'false' && original.factor === 1 && original.value === '100 %' && originalFactor <= 1;
        return { pass, notes: JSON.stringify({ originalFactor, fitted, fills, wider, narrower, left, original }) };
      } finally { await finish(h); }
    },
  });

  cases.push({
    id: 'page_zoom_keys_follow_the_browser_conventions_and_leave_typing_alone',
    description: 'Ctrl (⌘) + plus (ou =), + moins, + 0 zooment la page et arrêtent le zoom du navigateur ; sans Ctrl, avec Alt, ou sous une fenêtre ouverte, rien ne bouge et le navigateur garde sa touche',
    run: async (h) => {
      try {
        await setup(h);
        await h.focusAtEnd();
        const run = [];
        const step = (label, init, expectPrevented, expectValue) => {
          const event = key(init);
          run.push({ label, prevented: event.defaultPrevented, expectPrevented, value: shown(), expectValue });
        };
        step('Ctrl+=', { key: '=', code: 'Equal', ctrlKey: true }, true, '110 %');
        step('Ctrl++', { key: '+', code: 'Equal', ctrlKey: true, shiftKey: true }, true, '125 %');
        step('Ctrl+-', { key: '-', code: 'Minus', ctrlKey: true }, true, '110 %');
        step('Ctrl+0', { key: '0', code: 'Digit0', ctrlKey: true }, true, '100 %');
        step('⌘+=', { key: '=', code: 'Equal', metaKey: true }, true, '110 %');
        step('Ctrl+à (AZERTY, chiffre 0)', { key: 'à', code: 'Digit0', ctrlKey: true }, true, '100 %');
        step('sans Ctrl : la frappe d’un plus', { key: '+', code: 'Equal', shiftKey: true }, false, '100 %');
        step('Ctrl+Alt+= (AltGr)', { key: '=', code: 'Equal', ctrlKey: true, altKey: true }, false, '100 %');
        step('Ctrl+Alt+0 (Paragraphe)', { key: '0', code: 'Digit0', ctrlKey: true, altKey: true }, false, '100 %');
        // Sous une fenêtre ouverte, les touches de ses champs restent à elle.
        const modal = el('link-rules-modal');
        modal.style.display = 'flex';
        modal.dataset.testOpened = '1';
        step('fenêtre ouverte', { key: '=', code: 'Equal', ctrlKey: true }, false, '100 %');
        modal.style.display = 'none';
        delete modal.dataset.testOpened;
        step('fenêtre refermée', { key: '=', code: 'Equal', ctrlKey: true }, true, '110 %');
        const bad = run.filter(r => r.prevented !== r.expectPrevented || r.value !== r.expectValue);
        return { pass: bad.length === 0, notes: JSON.stringify({ bad, run: run.map(r => r.label + '→' + r.value) }) };
      } finally { await finish(h); }
    },
  });

  cases.push({
    id: 'page_zoom_keys_give_way_to_a_key_the_user_gave_to_another_action',
    description: 'Une touche que l’utilisateur a donnée à une autre action (Réglages > Raccourcis) reste à cette action : Ctrl + moins lance « Liste à puces » et ne zoome pas ; la touche rendue, elle zoome de nouveau',
    run: async (h) => {
      try {
        await setup(h);
        await h.focusAtEnd();
        const editor = EditorCore.getEditor();
        const bound = Shortcuts.setKey('bulletList', 'Mod+-');
        await sleep(50);
        const taken = key({ key: '-', code: 'Minus', ctrlKey: true });
        await sleep(150);
        const whileBound = { problem: bound.problem, prevented: taken.defaultPrevented, value: shown(), bullets: editor.isActive('bulletList') };
        Shortcuts.resetKey('bulletList');
        await sleep(50);
        if (editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run();
        const freed = key({ key: '-', code: 'Minus', ctrlKey: true });
        await sleep(100);
        const afterReset = { prevented: freed.defaultPrevented, value: shown(), bullets: editor.isActive('bulletList') };
        const pass = whileBound.problem === '' && whileBound.prevented && whileBound.value === '100 %' && whileBound.bullets
          && afterReset.prevented && afterReset.value === '90 %' && !afterReset.bullets;
        return { pass, notes: JSON.stringify({ whileBound, afterReset }) };
      } finally { Shortcuts.resetAll(); await finish(h); }
    },
  });

  cases.push({
    id: 'page_zoom_ctrl_wheel_zooms_and_the_plain_wheel_keeps_scrolling',
    description: 'Ctrl (⌘) + molette (et le pincement du pavé tactile, qui arrive en molette avec Ctrl) zoome la page, le navigateur ne zoome pas lui-même ; sans Ctrl la molette défile comme avant',
    run: async (h) => {
      try {
        await setup(h, PAGE_LINES(8));
        const box = editorBox();
        const plain = wheel(box, { deltaY: 100 });
        const afterPlain = { prevented: plain.defaultPrevented, value: shown() };
        const zoomIn = wheel(box, { deltaY: -100, ctrlKey: true });
        await sleep(50);
        const afterIn = { prevented: zoomIn.defaultPrevented, value: shown(), factor: factorOf(box) };
        const zoomOut = wheel(box, { deltaY: 100, ctrlKey: true });
        await sleep(50);
        const afterOut = { prevented: zoomOut.defaultPrevented, value: shown(), factor: factorOf(box) };
        // Un pincement : beaucoup de petits cran, qui se suivent en continu.
        for (let i = 0; i < 10; i++) wheel(box, { deltaY: -8, ctrlKey: true });
        await sleep(50);
        const pinched = { value: shown(), factor: factorOf(box) };
        // Sur la pastille aussi.
        const onPill = wheel(el('pp-page-zoom'), { deltaY: 100, ctrlKey: true });
        const horizontal = wheel(box, { deltaY: 0, deltaX: 40, ctrlKey: true });
        // Sans aperçu de la page, le navigateur garde sa molette.
        const toggle = el('v2-toggle-a4-preview');
        toggle.click();
        await sleep(300);
        const off = wheel(box, { deltaY: -100, ctrlKey: true });
        const afterOff = { prevented: off.defaultPrevented };
        toggle.click();
        await sleep(300);
        const pass = !afterPlain.prevented && afterPlain.value === '100 %' && afterIn.prevented && afterIn.value === '116 %' && near(afterIn.factor, 1.162, 0.002)
          && afterOut.prevented && afterOut.value === '100 %' && pinched.factor > 1.1 && pinched.factor < 1.14 && onPill.defaultPrevented && !horizontal.defaultPrevented && !afterOff.prevented;
        return { pass, notes: JSON.stringify({ afterPlain, afterIn, afterOut, pinched, onPill: onPill.defaultPrevented, horizontal: horizontal.defaultPrevented, afterOff }) };
      } finally { await finish(h); }
    },
  });

  cases.push({
    id: 'page_zoom_is_greyed_with_its_reason_when_there_is_no_page_and_never_removed',
    description: 'Aperçu de la page décoché, grille ou résumé d’un macro-modèle : la pastille reste là, grisée, avec la raison dans l’infobulle (anglais compris) ; un clic n’y change rien et les touches laissent le navigateur zoomer ; elle se dégrise avec la page',
    run: async (h) => {
      try {
        await setup(h);
        const problems = [];
        const states = () => ({ off: ['out', 'value', 'in', 'fit'].map(isOff), present: !!el('pp-page-zoom') && el('pp-page-zoom').getClientRects().length > 0, title: part('in') && part('in').title, value: shown(), pressed: part('fit') && part('fit').getAttribute('aria-pressed') });
        const allOff = s => s.off.every(Boolean) && s.present;
        // 1) L'aperçu de la page décoché par sa vraie case.
        const toggle = el('v2-toggle-a4-preview');
        toggle.click();
        await sleep(350);
        const preview = states();
        press('in'); press('fit'); press('value');
        const keyEvent = key({ key: '=', code: 'Equal', ctrlKey: true });
        await sleep(100);
        const afterClicks = states();
        I18n.setLang('en');
        await sleep(80);
        const previewEn = states();
        I18n.setLang('fr');
        toggle.click();
        await sleep(350);
        const back = states();
        if (!allOff(preview)) problems.push('aperçu décoché : ' + JSON.stringify(preview));
        if (!/aperçu A4 est décoché/.test(preview.title || '')) problems.push('raison (aperçu) : ' + preview.title);
        if (afterClicks.value !== '100 %' || keyEvent.defaultPrevented) problems.push('clics ou touche pris en compte sans page : ' + JSON.stringify({ afterClicks, prevented: keyEvent.defaultPrevented }));
        if (!/A4 preview is turned off/.test(previewEn.title || '')) problems.push('raison en anglais : ' + previewEn.title);
        if (back.off.some(Boolean)) problems.push('dégrisé avec la page : ' + JSON.stringify(back));
        // 2) Une grille n’a pas de page : la case de l’aperçu est grisée, la pastille aussi.
        const gridId = await savedTemplate(h, 'Zoom grille', '<table><tbody><tr><td><p></p></td><td><p></p></td></tr></tbody></table>', GridEditor.TYPE);
        await selectTemplate(h, gridId);
        const grid = states();
        if (!allOff(grid) || !/n’a pas de page/.test(grid.title || '')) problems.push('grille : ' + JSON.stringify(grid));
        // 3) Le résumé d’un macro-modèle non plus.
        const macro = await Templates.save(null, 'Zoom macro', JSON.stringify({ slots: [] }), '', null, null, 'macro', null);
        await selectTemplate(h, macro.id);
        const macroState = states();
        if (!allOff(macroState) || !/n’a pas de page/.test(macroState.title || '')) problems.push('macro-modèle : ' + JSON.stringify(macroState));
        // 4) Retour à un modèle ordinaire : la pastille se dégrise.
        const plainId = await savedTemplate(h, 'Zoom ordinaire', SHORT_HTML);
        await selectTemplate(h, plainId);
        const plain = states();
        if (plain.off.some(Boolean)) problems.push('modèle ordinaire : ' + JSON.stringify(plain));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, preview, previewEn: previewEn.title, grid, macroState }) };
      } finally { await finish(h); }
    },
  });

  cases.push({
    id: 'page_zoom_follows_the_mode_and_the_reader_paginates_again',
    description: 'Le niveau suit d’un mode à l’autre : choisi en Édition, il est celui de la Lecture, et inversement ; la pagination (bandes de l’éditeur, fond des pages de la Lecture) est refaite sur le rendu réel, à la mesure de la page, quel que soit le niveau',
    run: async (h) => {
      try {
        await setup(h, PAGE_LINES(130));
        // La Lecture n'affiche rien sans ligne de Grist : une ligne est envoyée comme le fait scenarios-clean-reading.js.
        const TABLE = 'PpZoomLecture';
        window.__gristStub.setVariables(TABLE, { Nom: 'Text' });
        window.__gristStub.setRows(TABLE, [{ id: 1, Nom: 'Dupont' }]);
        await GristAPI.refreshSchema();
        window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, TABLE);
        await sleep(500);
        const bandsOf = box => Array.from(box.querySelectorAll('.v2-page-band')).map(b => b.getBoundingClientRect().top);
        // Positions en pixels de la page : relatives au haut de la feuille, ramenées par le zoom.
        const relative = (box, list) => { const s = sheetOf(box).getBoundingClientRect(); const z = parseFloat(getComputedStyle(sheetOf(box)).zoom) || 1; return list.map(t => Math.round((t - s.top) / z)); };
        const bands100 = relative(editorBox(), bandsOf(editorBox()));
        press('in'); press('in');
        await sleep(700);
        const editorAt125 = { value: shown(), factor: factorOf(editorBox()), bands: relative(editorBox(), bandsOf(editorBox())) };
        el('btn-mode-read').click();
        await sleep(1500);
        const reader = readerBox();
        const inReader = { value: shown(), factor: factorOf(reader), visible: inRead() };
        const paperTop = () => { const p = reader.querySelector('.v2-reader-paper'); const s = sheetOf(reader); return p && s ? { top: Math.round(p.getBoundingClientRect().top - s.getBoundingClientRect().top), left: Math.round(p.getBoundingClientRect().left - s.getBoundingClientRect().left) } : null; };
        const readerBands = () => relative(reader, Array.from(reader.querySelectorAll('.v2-page-band')).map(b => b.getBoundingClientRect().top));
        const readerAt125 = { paper: paperTop(), bands: readerBands() };
        press('in');
        await sleep(1500);
        const readerAt150 = { value: shown(), factor: factorOf(reader), paper: paperTop(), bands: readerBands(), screen: screenWidth(reader), layout: layoutWidth(reader) };
        el('btn-mode-edit').click();
        await sleep(700);
        const backInEdit = { value: shown(), factor: factorOf(editorBox()), bands: relative(editorBox(), bandsOf(editorBox())) };
        const sameBands = (a, b) => a.length === b.length && a.length > 0 && a.every((v, i) => Math.abs(v - b[i]) <= 1);
        const pass = editorAt125.value === '125 %' && near(editorAt125.factor, 1.25) && sameBands(bands100, editorAt125.bands)
          && inReader.visible && inReader.value === '125 %' && near(inReader.factor, 1.25) && readerAt125.paper && readerAt125.paper.top === 0 && readerAt125.paper.left === 0 && sameBands(bands100, readerAt125.bands)
          && readerAt150.value === '150 %' && near(readerAt150.factor, 1.5) && readerAt150.paper && readerAt150.paper.top === 0 && readerAt150.paper.left === 0 && sameBands(bands100, readerAt150.bands) && near(readerAt150.screen, readerAt150.layout * 1.5, 1.2)
          && backInEdit.value === '150 %' && near(backInEdit.factor, 1.5) && sameBands(bands100, backInEdit.bands);
        return { pass, notes: JSON.stringify({ bands100, editorAt125, inReader, readerAt125, readerAt150, backInEdit }) };
      } finally { await finish(h); }
    },
  });

  cases.push({
    id: 'page_zoom_level_is_kept_per_template_in_this_browser',
    description: 'Le niveau est gardé par modèle dans ce navigateur : un autre modèle repart de l’affichage d’origine, le premier retrouve son niveau (et son « Ajuster ») ; le même numéro sous un autre nom (un autre document Grist) ne le reprend pas ; un stockage illisible ne casse rien',
    run: async (h) => {
      try {
        await setup(h);
        const problems = [];
        const idA = await savedTemplate(h, 'Zoom A', SHORT_HTML);
        const idB = await savedTemplate(h, 'Zoom B', SHORT_HTML);
        await selectTemplate(h, idA);
        press('in'); press('in');
        await sleep(500);
        const a1 = { value: shown(), factor: factorOf(editorBox()) };
        const store1 = savedLevels();
        await selectTemplate(h, idB);
        const b1 = { value: shown(), factor: factorOf(editorBox()), pressed: part('fit').getAttribute('aria-pressed') };
        press('fit');
        await sleep(500);
        const b2 = { pressed: part('fit').getAttribute('aria-pressed'), factor: factorOf(editorBox()) };
        await selectTemplate(h, idA);
        const a2 = { value: shown(), factor: factorOf(editorBox()), pressed: part('fit').getAttribute('aria-pressed') };
        await selectTemplate(h, idB);
        const b3 = { pressed: part('fit').getAttribute('aria-pressed'), factor: factorOf(editorBox()) };
        // Le niveau choisi juste avant de quitter un modèle est gardé pour lui, sans attendre la pause.
        await selectTemplate(h, idA);
        press('in');
        await selectTemplate(h, idB);
        await selectTemplate(h, idA);
        const a3 = { value: shown() };
        // Même numéro de ligne, autre nom : le niveau d’un autre document Grist n’est pas repris.
        const tampered = savedLevels().map(e => (String(e.i) === String(idA) ? Object.assign({}, e, { n: 'Un autre modèle' }) : e));
        localStorage.setItem(STORAGE, JSON.stringify(tampered));
        await selectTemplate(h, idB);
        await selectTemplate(h, idA);
        const a4 = { value: shown() };
        // Un stockage cassé : l’affichage d’origine, sans exception.
        localStorage.setItem(STORAGE, '{pas du JSON');
        await selectTemplate(h, idB);
        await selectTemplate(h, idA);
        const a5 = { value: shown() };
        const entryA = (store1 || []).find(e => String(e.i) === String(idA));
        if (!(a1.value === '125 %' && near(a1.factor, 1.25))) problems.push('A choisi : ' + JSON.stringify(a1));
        if (!(entryA && entryA.m === 'manual' && near(entryA.z, 1.25) && entryA.n === 'Zoom A')) problems.push('niveau de A gardé : ' + JSON.stringify(store1));
        if (!(b1.value === '100 %' && b1.pressed === 'false')) problems.push('B repart de l’affichage d’origine : ' + JSON.stringify(b1));
        if (!(b2.pressed === 'true')) problems.push('B ajusté : ' + JSON.stringify(b2));
        if (!(a2.value === '125 %' && a2.pressed === 'false')) problems.push('A retrouve son niveau : ' + JSON.stringify(a2));
        if (!(b3.pressed === 'true')) problems.push('B retrouve « Ajuster » : ' + JSON.stringify(b3));
        if (!(a3.value === '150 %')) problems.push('niveau choisi avant de quitter : ' + JSON.stringify(a3));
        if (!(a4.value === '100 %')) problems.push('même numéro, autre nom : ' + JSON.stringify(a4));
        if (!(a5.value === '100 %')) problems.push('stockage cassé : ' + JSON.stringify(a5));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await finish(h); }
    },
  });

  cases.push({
    id: 'page_zoom_press_on_the_pill_keeps_the_floating_bars_open_and_other_presses_still_close_them',
    description: 'Un appui sur la pastille ne ferme pas la barre flottante de l’image sélectionnée (le filet de editor-core.js la laissait fermer) ; un appui ailleurs hors de l’éditeur la ferme toujours',
    run: async (h) => {
      try {
        await setup(h);
        const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        const ed = EditorCore.getEditor();
        ed.commands.setTextSelection(1);
        ed.commands.insertContent({ type: 'editorImage', attrs: { src: PNG, alt: '', width: '120px' } });
        let pos = -1;
        ed.state.doc.descendants((node, p) => { if (node.type.name === 'editorImage' && pos < 0) pos = p; });
        ed.chain().focus().setNodeSelection(pos).run();
        await sleep(350);
        const barOpen = () => !!document.querySelector('.v2-floating-toolbar.visible button[data-action="layer-front"]');
        const opened = barOpen();
        const pressed = target => target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
        pressed(part('in'));
        await sleep(150);
        const afterPill = barOpen();
        press('in');
        await sleep(600);
        const afterZoom = barOpen();
        pressed(el('status-msg'));
        await sleep(150);
        const afterElsewhere = barOpen();
        return { pass: opened && afterPill && afterZoom && !afterElsewhere, notes: JSON.stringify({ opened, afterPill, afterZoom, afterElsewhere }) };
      } finally { await finish(h); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pageZoom = cases;
})();
