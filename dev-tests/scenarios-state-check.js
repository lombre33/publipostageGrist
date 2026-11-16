// Suite "stateCheck" - le mode « Identité de l'État » (DSFR), lot 4 : le contrôle du style de l'État (js/state-check.js, js/state-check-pane.js).
//  - chaque constat (police, couleurs, titres, contraste, taille, images, liens, langue) a un document FAUTIF où il est « à revoir » et lui seul, et un document SAIN où tous sont sans remarque ;
//  - les endroits à voir sont les bons (le texte du paragraphe, l'image entière), nommés par le titre qui les précède ; les phrases sont celles du constat, au singulier comme au pluriel ;
//  - le contrôle n'écrit RIEN : le document, la sélection exceptée, est le même après lecture, ouverture du volet, « Voir » ; il ne bloque rien ;
//  - la ligne du menu « Édition collaborative » est grisée (jamais retirée) avec sa raison tant que le mode n'est pas allumé, libre allumé ; la palette Alt+/ la propose ;
//  - le volet : les lignes à revoir passent devant, le résumé les compte, « Voir » parcourt les endroits en boucle, « Décrire » ouvre la fenêtre du texte alternatif, il se rafraîchit à la frappe, se ferme quand le
//    mode s'éteint, et cède le bord droit au volet de relecture (et inversement) ;
//  - les textes existent en français et en anglais, sans promesse « officielle » ni « conforme ».
// Joué « hébergé » (dev-tests/gfs-stub.js) : l'extension `etat` est active ou non selon `setExtensions`. Le même parcours à la vraie souris dans le panneau de 700x400 : dev-tests/verify-state-check-mouse.mjs (stateCheckMouse).
(function () {
  const cases = [];
  const KEY = 'pp_etat_declaration';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const byId = id => document.getElementById(id);
  const ed = () => EditorCore.getEditor();
  const row = () => byId('v2-btn-state-check');
  const pane = () => byId('pp-state-pane');
  const statusText = () => byId('status-msg').textContent;
  const record = on => JSON.stringify({ v: StateMode.TEXT_VERSION, quality: 'etat', date: '2026-11-01', on });

  // Le mode allumé (extension active + déclaration valable), éteint, ou sans l'extension, le temps de `fn` ; tout est remis après.
  async function withMode(state, fn) {
    const stub = window.__gfsStub;
    const before = stub.extensions.slice();
    stub.setExtensions(state === 'absent' ? ['graphique'] : ['graphique', 'etat']);
    for (let i = 0; i < 60 && Extensions.isActive('etat') !== (state !== 'absent'); i++) await sleep(30);
    if (state === 'on') PersonStore.set(KEY, record(true));
    else if (state === 'off') PersonStore.set(KEY, record(false));
    else PersonStore.remove(KEY);
    StateCheckPane.syncRow();
    try { return await fn(); } finally {
      StateCheckPane.closePane({ focus: false });
      stub.setExtensions(before);
      await sleep(60);
      PersonStore.remove(KEY);
      StateMode.syncSettings();
      StateCheckPane.syncRow();
    }
  }

  const config = levels => '<div class="heading-numbering-config" data-style="none"' + (levels ? " data-level-styles='" + JSON.stringify(levels) + "'" : '') + '></div>';
  // Un paragraphe aux couleurs et à la police de l'État, et ce qu'on y ajoute à la main.
  const body = (text, style) => '<p><span style="font-family: Marianne, arial, sans-serif; color: #161616;' + (style || '') + '">' + text + '</span></p>';
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const image = attrs => '<p><img class="editor-image" src="' + PIXEL + '"' + (attrs || '') + '></p>';
  // Le document sain : titres 1, 2 sans saut, style des titres de l'État, texte en Marianne, un lien en bleu France, une image décrite.
  const HEALTHY = config(StateStyle.headingStyles()) + '<h1>Titre</h1>' + body('Un texte') + '<h2>Sous-titre</h2>' + body('Suite') + '<p><a href="https://exemple.fr"><span style="font-family: Marianne, arial, sans-serif; color: #000091">un lien</span></a></p>' + image(' alt="Logo du service"');
  const levels = () => StateStyle.headingStyles();
  async function load(markup) {
    Editor.setHTML(markup);
    await sleep(200);
  }
  const report = options => StateCheck.read(ed().state.doc, options);
  const warnIds = r => r.checks.filter(c => c.state === 'warn').map(c => c.id);
  const checkOf = (r, id) => r.checks.find(c => c.id === id);
  const textOfItem = item => ed().state.doc.textBetween(item.from, item.to, ' ');

  cases.push({
    id: 'statecheck_a_healthy_document_has_nothing_to_review',
    description: 'Un document aux titres sans saut, en Marianne, aux couleurs de l’État, au lien bleu France, à l’image décrite : les huit constats sont sans remarque, dans l’ordre du volet',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      await load(HEALTHY);
      const r = report({ lang: 'fr' });
      if (!same(r.checks.map(c => c.id), ['fonts', 'palette', 'headings', 'contrast', 'size', 'images', 'links', 'language'])) bad.push('constats=' + r.checks.map(c => c.id).join());
      if (r.warn !== 0 || r.ok !== 8) bad.push('warn=' + r.warn + ' ok=' + r.ok + ' à revoir : ' + warnIds(r).join());
      if (checkOf(r, 'headings').total !== 2 || checkOf(r, 'images').total !== 1 || checkOf(r, 'links').total !== 1) bad.push('décomptes : ' + JSON.stringify(r.checks.map(c => [c.id, c.total])));
      return result(bad);
    },
  });

  // Chaque constat : un document fautif où lui seul est à revoir.
  const FAULTS = [
    { id: 'fonts', markup: HEALTHY + '<p><span style="font-family: Times New Roman; color: #161616">Texte en Times</span></p>', then: (c, bad) => { if (c.count !== 1 || c.font !== 'Times New Roman') bad.push('fonts : ' + c.count + ' ' + c.font); } },
    { id: 'fonts', markup: HEALTHY + '<p>Sans réglage</p>', then: (c, bad) => { if (c.count !== 1 || c.font !== 'Roboto') bad.push('sans réglage : ' + c.count + ' ' + c.font); } },
    { id: 'palette', markup: HEALTHY + body('Violet', 'color: #7a1fa2'), then: (c, bad) => { if (c.count !== 1 || c.colors[0].hex !== '#7a1fa2') bad.push('palette : ' + JSON.stringify(c.colors)); } },
    { id: 'palette', markup: HEALTHY + body('Surligné', 'background-color: #ffff00'), then: (c, bad) => { if (c.count !== 1 || c.colors[0].hex !== '#ffff00') bad.push('surlignage : ' + JSON.stringify(c.colors)); } },
    { id: 'palette', markup: HEALTHY + '<div class="callout" data-color="blue" data-icon="info">' + body('Encadré bleu') + '</div>', then: (c, bad) => { if (c.count !== 1 || c.colors[0].hex !== Callout.colorOf('blue').accent) bad.push('encadré : ' + JSON.stringify(c.colors)); } },
    { id: 'headings', markup: config(levels()) + '<h1>Un</h1><h3>Trois</h3>' + body('Texte'), then: (c, bad) => { if (c.jumps !== 1 || c.extraTop !== 0 || c.startsAt !== 0) bad.push('saut : ' + JSON.stringify(c)); } },
    { id: 'headings', markup: config(levels()) + '<h1>Un</h1><h1>Deux</h1>' + body('Texte'), then: (c, bad) => { if (c.extraTop !== 1 || c.jumps !== 0) bad.push('deux titres 1 : ' + JSON.stringify(c)); } },
    { id: 'headings', markup: config(levels()) + '<h2>Deux</h2><h3>Trois</h3>' + body('Texte'), then: (c, bad) => { if (c.startsAt !== 2 || c.jumps !== 0) bad.push('commence au 2 : ' + JSON.stringify(c)); } },
    { id: 'contrast', markup: HEALTHY + body('Bleu clair', 'color: #6a6af4'), then: (c, bad) => { if (c.count !== 1 || c.fg !== '#6a6af4' || c.bg !== '#ffffff' || Math.abs(c.ratio - 4.22) > 0.01) bad.push('contraste : ' + JSON.stringify([c.count, c.fg, c.bg, c.ratio])); } },
    { id: 'size', markup: HEALTHY + body('Tout petit', 'font-size: 8pt'), then: (c, bad) => { if (c.count !== 1 || c.pt !== 8) bad.push('taille : ' + c.count + ' ' + c.pt); } },
    { id: 'images', markup: HEALTHY + image(''), then: (c, bad) => { if (c.count !== 1 || c.total !== 2) bad.push('images : ' + c.count + '/' + c.total); } },
    { id: 'links', markup: HEALTHY + '<p><a href="https://exemple.fr"><span style="font-family: Marianne, arial, sans-serif; color: #161616">lien noir</span></a></p>', then: (c, bad) => { if (c.count !== 1 || c.total !== 2) bad.push('liens : ' + c.count + '/' + c.total); } },
    { id: 'language', markup: HEALTHY, options: { lang: 'en' }, then: (c, bad) => { if (c.lang !== 'en' || c.count !== 1) bad.push('langue : ' + JSON.stringify(c)); } },
  ];
  FAULTS.forEach((fault, n) => {
    cases.push({
      id: 'statecheck_fault_' + n + '_' + fault.id + '_is_to_review_and_only_it',
      description: 'Constat « ' + fault.id + ' » : le document fautif (n° ' + (n + 1) + ') est à revoir pour ce constat et pour lui seul, le même document sans la faute n’a rien à revoir',
      run: async (h) => {
        const bad = [];
        await h.resetEditor();
        await load(fault.markup);
        const r = report(Object.assign({ lang: 'fr' }, fault.options));
        if (!same(warnIds(r), [fault.id])) bad.push('à revoir : ' + warnIds(r).join() + ' au lieu de ' + fault.id);
        else fault.then(checkOf(r, fault.id), bad);
        // Le même document sans la faute : rien à revoir (pour la langue, le même document lu en français).
        await load(HEALTHY);
        const healthy = report({ lang: 'fr' });
        if (healthy.warn !== 0) bad.push('le document sain a des constats : ' + warnIds(healthy).join());
        return result(bad);
      },
    });
  });

  cases.push({
    id: 'statecheck_places_are_the_paragraph_text_or_the_whole_image_under_their_heading',
    description: 'Les endroits à voir : le texte du paragraphe fautif, ou l’image entière ; nommés par le titre qui les précède (« sous « Sous-titre » »), ou « au début du document » avant le premier titre',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      await load('<p>Avant tout titre</p>' + HEALTHY + '<p><span style="font-family: Times New Roman; color: #161616">Texte en Times</span></p>' + image(''));
      const r = report({ lang: 'fr' });
      const fonts = checkOf(r, 'fonts');
      if (fonts.count !== 2) bad.push('fonts=' + fonts.count);
      const first = fonts.items[0];
      if (!first || textOfItem(first) !== 'Avant tout titre' || first.where !== '') bad.push('premier endroit : ' + JSON.stringify(first));
      const second = fonts.items[1];
      if (!second || textOfItem(second) !== 'Texte en Times' || second.where !== 'Sous-titre') bad.push('second endroit : ' + JSON.stringify(second));
      const images = checkOf(r, 'images');
      const node = images.items[0] && ed().state.doc.nodeAt(images.items[0].from);
      if (!images.items[0] || !images.items[0].node || !node || node.type.name !== 'editorImage') bad.push('image : ' + JSON.stringify(images.items[0]));
      if (!StateCheck.describe(first && fonts).detail.includes('au début du document')) bad.push('« au début » non dit : ' + StateCheck.describe(fonts).detail);
      if (!StateCheck.describe(images).detail.includes('sous « Sous-titre »')) bad.push('« sous » non dit : ' + StateCheck.describe(images).detail);
      const order = fonts.items.map(item => item.from);
      if (!same(order, order.slice().sort((a, b) => a - b))) bad.push('endroits dans le désordre');
      return result(bad);
    },
  });

  cases.push({
    id: 'statecheck_sentences_say_the_finding_in_both_languages_with_the_right_plural',
    description: 'Le constat en mots : un titre et un détail, au singulier et au pluriel, sans variable oubliée, en français comme en anglais ; une couleur hors palette est nommée par sa teinte et son code',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      await load(config(levels()) + '<h1>Titre</h1>' + body('A', 'color: #7a1fa2') + body('B', 'color: #e1000f; font-size: 8pt') + body('C', 'color: #ef4444') + body('D', 'color: #00aa00') + body('E', 'color: #ffee00') + image('') + image(''));
      const kept = I18n.getLang();
      try {
        for (const lang of ['fr', 'en']) {
          I18n.setLang(lang);
          const r = report({ lang: 'en' });
          r.checks.forEach((check) => {
            const text = StateCheck.describe(check);
            if (!text.title || !text.detail || /\{|\}|state\.check\./.test(text.title + text.detail)) bad.push(lang + ' ' + check.id + ' : ' + JSON.stringify(text));
          });
          const palette = StateCheck.describe(checkOf(r, 'palette'));
          const hue = (fr, en) => (lang === 'fr' ? fr : en);
          if (!palette.title.startsWith('4 ')) bad.push(lang + ' titre des couleurs : ' + palette.title);
          if (!palette.detail.includes(hue('Violet', 'Purple') + ' #7a1fa2') || !palette.detail.includes('#ef4444')) bad.push(lang + ' détail des couleurs : ' + palette.detail);
          if (!/(et 1 autre|and 1 more)/.test(palette.detail)) bad.push(lang + ' « et N autres » : ' + palette.detail);
          const images = StateCheck.describe(checkOf(r, 'images'));
          if (!images.title.startsWith('2 ') || !/(images sans texte alternatif|images without alternative text)/.test(images.title)) bad.push(lang + ' pluriel des images : ' + images.title);
          const size = StateCheck.describe(checkOf(r, 'size'));
          if (!size.detail.startsWith('1 passage ') || !/8 pt/.test(size.detail)) bad.push(lang + ' singulier de la taille : ' + size.detail);
          const language = StateCheck.describe(checkOf(r, 'language'));
          if (!/(anglais|English)/.test(language.detail)) bad.push(lang + ' langue : ' + language.detail);
          const ratio = StateCheck.describe(checkOf(report({ lang: 'fr' }), 'contrast'));
          if (ratio.title !== I18n.t('state.check.contrast.title')) bad.push(lang + ' titre du contraste : ' + ratio.title);
        }
        I18n.setLang('fr');
        const contrast = StateCheck.describe(checkOf(report({ lang: 'fr' }), 'contrast'));
        if (!/\d,\d\d:1/.test(contrast.detail) && checkOf(report({ lang: 'fr' }), 'contrast').state === 'warn') bad.push('virgule décimale : ' + contrast.detail);
      } finally { I18n.setLang(kept); }
      // Les teintes.
      const hues = { '#ff0000': 'red', '#ff8800': 'orange', '#ffee00': 'yellow', '#00aa00': 'green', '#00cccc': 'cyan', '#0000ff': 'blue', '#8800ff': 'purple', '#ff66aa': 'pink', '#888888': 'gray', '#000000': 'black', '#ffffff': 'white' };
      Object.keys(hues).forEach((hex) => { if (StateCheck.hueKey(hex) !== hues[hex]) bad.push('teinte de ' + hex + ' : ' + StateCheck.hueKey(hex)); });
      return result(bad);
    },
  });

  cases.push({
    id: 'statecheck_reading_and_the_pane_write_nothing_into_the_document',
    description: 'Lire le document, ouvrir le volet, parcourir les endroits avec « Voir » et fermer : le document est le même octet pour octet, rien n’est enregistré à la place de la personne ; seule la sélection bouge',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      await load(HEALTHY + '<p>Sans réglage</p><p>Deux</p>');
      await withMode('on', async () => {
        const before = { json: JSON.stringify(ed().getJSON()), html: Editor.getHTML() };
        report({ lang: 'fr' });
        if (!StateCheckPane.open()) { bad.push('le volet ne s’ouvre pas'); return; }
        await sleep(100);
        const go = pane().querySelector('[data-check="fonts"] .pp-statepane-go');
        if (!go) { bad.push('« Voir » absent'); return; }
        go.click();
        await sleep(60);
        go.click();
        await sleep(60);
        StateCheckPane.closePane({ focus: false });
        if (JSON.stringify(ed().getJSON()) !== before.json || Editor.getHTML() !== before.html) bad.push('le document a changé');
      });
      return result(bad);
    },
  });

  cases.push({
    id: 'statecheck_the_row_is_greyed_with_its_reason_until_the_mode_is_on',
    description: 'Mode éteint : la ligne « Contrôle du style de l’État » du menu Édition collaborative est grisée (aria-disabled, jamais retirée) avec sa raison, et un clic la dit sans ouvrir le volet ; extension absente : le clic demande l’installation à GFS ; allumé : libre, et la palette la propose',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      await load(HEALTHY);
      if (!row()) { bad.push('ligne absente'); return result(bad); }
      await withMode('off', async () => {
        if (row().getAttribute('aria-disabled') !== 'true' || !row().classList.contains('v2-hover-row-disabled')) bad.push('éteint : non grisée');
        const reason = I18n.t('state.style.locked.off');
        if (LockReasons.reasonOf(row()) !== reason || row().title !== reason) bad.push('éteint : raison=' + LockReasons.reasonOf(row()) + ' / ' + row().title);
        if (!row().hasAttribute('data-explains')) bad.push('éteint : data-explains manquant');
        byId('status-msg').textContent = '';
        row().click();
        await sleep(100);
        if (!pane() || !pane().hidden) bad.push('éteint : le volet s’est ouvert');
        if (statusText() !== reason) bad.push('éteint : coin d’état=' + statusText());
        if (!Shortcuts.state('stateCheck').available) bad.push('éteint : la palette ne propose pas la ligne (elle explique au clic)');
      });
      await withMode('absent', async () => {
        if (row().getAttribute('aria-disabled') !== 'true') bad.push('absent : non grisée');
        if (LockReasons.reasonOf(row()) !== StateMode.view().hint) bad.push('absent : raison=' + LockReasons.reasonOf(row()));
        window.__gfsStub.calls.length = 0;
        row().click();
        for (let i = 0; i < 60 && !window.__gfsStub.calls.some(c => c.nom === 'installer'); i++) await sleep(30);
        const call = window.__gfsStub.calls.find(c => c.nom === 'installer');
        if (!call || !call.args || call.args.extension !== 'etat') bad.push('absent : installer(etat) non demandé');
        if (pane() && !pane().hidden) bad.push('absent : le volet s’est ouvert');
      });
      await withMode('on', async () => {
        if (row().getAttribute('aria-disabled') !== 'false' || row().hasAttribute('data-explains') || LockReasons.reasonOf(row())) bad.push('allumé : toujours grisée');
        if (!Shortcuts.state('stateCheck').available) bad.push('allumé : la palette ne la propose pas');
        row().click();
        await sleep(150);
        if (!pane() || pane().hidden || !StateCheckPane.isOpen()) bad.push('allumé : le volet ne s’ouvre pas');
        if (row().getAttribute('aria-pressed') !== 'true' || !row().classList.contains('is-active')) bad.push('allumé : la ligne ne dit pas « ouvert »');
        row().click();
        await sleep(100);
        if (StateCheckPane.isOpen() || !pane().hidden) bad.push('allumé : un second clic ne ferme pas');
      });
      return result(bad);
    },
  });

  cases.push({
    id: 'statecheck_the_pane_lists_to_review_first_counts_them_and_walks_the_places',
    description: 'Le volet : les lignes à revoir passent devant, le résumé les compte (« 2 à revoir · 6 sans remarque »), « Voir » pose la sélection sur l’endroit suivant en boucle et le dit, « Décrire » ouvre la fenêtre du texte alternatif sur l’image',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      await load(HEALTHY + '<p><span style="font-family: Times New Roman; color: #161616">Un</span></p><p><span style="font-family: Times New Roman; color: #161616">Deux</span></p>' + image(''));
      await withMode('on', async () => {
        if (!StateCheckPane.open()) { bad.push('le volet ne s’ouvre pas'); return; }
        await sleep(100);
        const items = Array.from(pane().querySelectorAll('.pp-statepane-item'));
        if (items.length !== 8) bad.push('lignes=' + items.length);
        const states = items.map(item => item.classList.contains('is-warn') ? 'warn' : 'ok');
        const firstOk = states.indexOf('ok');
        if (states.slice(firstOk).includes('warn')) bad.push('une ligne à revoir derrière une ligne sans remarque : ' + states.join());
        if (!same(items.slice(0, 2).map(item => item.dataset.check), ['fonts', 'images'])) bad.push('à revoir : ' + items.slice(0, 2).map(item => item.dataset.check).join());
        const summary = pane().querySelector('.pp-statepane-summary').textContent;
        if (summary !== I18n.t('state.check.summary.warn', { count: 2 }) + ' · ' + I18n.t('state.check.summary.ok', { count: 6 })) bad.push('résumé=' + summary);
        if (!/Légende|Caption|Constats seulement|Findings only/.test(pane().querySelector('.pp-statepane-note').textContent)) bad.push('pied du volet : ' + pane().querySelector('.pp-statepane-note').textContent);
        // « Voir » parcourt les deux paragraphes en boucle.
        const go = pane().querySelector('[data-check="fonts"] .pp-statepane-go');
        const picked = () => ed().state.doc.textBetween(ed().state.selection.from, ed().state.selection.to, ' ');
        go.click(); await sleep(60);
        const one = picked();
        if (one !== 'Un') bad.push('premier « Voir » : ' + one);
        const seenText = () => pane().querySelector('[data-check="fonts"] .pp-statepane-seen').textContent;
        if (seenText() !== I18n.t('state.check.seen', { at: 1, count: 2 })) bad.push('« 1 sur 2 » non dit : ' + seenText());
        if (pane().querySelector('.pp-statepane-summary').textContent !== summary) bad.push('le résumé a changé après « Voir » : ' + pane().querySelector('.pp-statepane-summary').textContent);
        go.click(); await sleep(60);
        if (picked() !== 'Deux') bad.push('second « Voir » : ' + picked());
        go.click(); await sleep(60);
        if (picked() !== 'Un') bad.push('la boucle ne reprend pas : ' + picked());
        // « Décrire » : l'image est sélectionnée et la fenêtre du texte alternatif s'ouvre.
        const describe = pane().querySelector('[data-check="images"] .pp-statepane-go');
        if (!describe || describe.textContent !== I18n.t('state.check.describe')) bad.push('« Décrire » : ' + (describe && describe.textContent));
        else {
          describe.click();
          await sleep(200);
          const selected = ed().state.selection.node;
          if (!selected || selected.type.name !== 'editorImage') bad.push('l’image n’est pas sélectionnée');
          const modal = byId('pp-alt-modal');
          if (!modal || getComputedStyle(modal).display === 'none') bad.push('la fenêtre du texte alternatif ne s’ouvre pas');
          else { document.querySelector('#pp-alt-modal .pp-modal-actions button:not(.var-modal-primary)').click(); await sleep(60); }
        }
        StateCheckPane.closePane({ focus: false });
      });
      return result(bad);
    },
  });

  cases.push({
    id: 'statecheck_the_pane_follows_typing_closes_with_the_mode_and_yields_the_edge_to_the_review_pane',
    description: 'Le volet se relit une fois la frappe calmée ; il se ferme quand le mode s’éteint ; ouvrir le volet de relecture le ferme (et le texte retrouve sa marge), l’ouvrir ferme celui de relecture',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      await load(HEALTHY);
      await withMode('on', async () => {
        StateCheckPane.open();
        await sleep(100);
        if (StateCheckPane.report().warn !== 0) bad.push('départ : à revoir=' + StateCheckPane.report().warn);
        const box = byId('editor-container');
        if (!box.style.marginRight) bad.push('le texte ne laisse pas de place au volet');
        // Une faute tapée : le volet la voit sans qu'on le rouvre.
        ed().chain().focus('end').insertContent('<p>Sans police</p>').run();
        await sleep(500);
        if (StateCheckPane.report().warn !== 1 || pane().querySelector('.pp-statepane-item').dataset.check !== 'fonts') bad.push('la frappe n’a pas été relue : ' + StateCheckPane.report().warn);
        // Le volet de relecture prend le bord, le contrôle s'efface.
        if (!TrackChangesPane.open('changes')) bad.push('le volet de relecture ne s’ouvre pas');
        if (StateCheckPane.isOpen() || !pane().hidden) bad.push('les deux volets sont ouverts ensemble');
        if (!StateCheckPane.open()) bad.push('le contrôle ne s’ouvre pas après la relecture');
        if (TrackChangesPane.isOpen()) bad.push('le contrôle ouvert laisse la relecture ouverte');
        // Le mode s'éteint : le volet se ferme, la ligne se grise.
        StateMode.setOn(false);
        await sleep(100);
        if (StateCheckPane.isOpen() || !pane().hidden || box.style.marginRight) bad.push('le mode éteint laisse le volet ou sa marge');
        if (row().getAttribute('aria-disabled') !== 'true') bad.push('la ligne reste libre mode éteint');
        StateMode.setOn(true);
      });
      TrackChangesPane.closePane({ focus: false });
      return result(bad);
    },
  });

  cases.push({
    id: 'statecheck_texts_are_in_both_languages_and_promise_nothing_official',
    description: 'Les textes du contrôle existent en français et en anglais, sans variable oubliée ; aucun ne parle d’« officiel » ou de « conforme au DSFR » ; le pied du volet dit que le contrôle ne dit rien du droit d’utiliser la marque',
    run: async () => {
      const bad = [];
      const keys = ['state.check.row.aria', 'state.check.title', 'state.check.close', 'state.check.note', 'state.check.summary.warn', 'state.check.summary.ok', 'state.check.seen', 'state.check.see', 'state.check.describe', 'state.check.state.warn',
        'state.check.state.ok', 'state.check.where.under', 'state.check.where.top', 'state.check.palette.color', 'state.check.palette.more', 'state.check.headings.none', 'state.check.headings.startsAt', 'state.check.headings.jumps',
        'state.check.headings.extraTop', 'state.check.images.none', 'state.check.images.hint', 'state.check.links.none']
        .concat(['fonts', 'palette', 'headings', 'contrast', 'size', 'images', 'links', 'language'].map(id => 'state.check.' + id + '.title'))
        .concat(['fonts', 'palette', 'headings', 'contrast', 'size', 'images', 'links', 'language'].map(id => 'state.check.' + id + '.ok').filter(key => I18n.has(key)))
        .concat(['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'gray', 'black', 'white', 'unknown'].map(hue => 'state.check.hue.' + hue));
      const kept = I18n.getLang();
      const words = { fr: [], en: [] };
      try {
        for (const lang of ['fr', 'en']) {
          I18n.setLang(lang);
          keys.forEach((key) => { const text = I18n.t(key, { count: 2, at: 1, level: 2, title: 'T', name: 'N', code: '#000000', where: 'W', font: 'F', ratio: '4', fg: '#000000', bg: '#ffffff', pt: '8' }); words[lang].push(text); if (!text || text === key) bad.push(lang + ' manquant : ' + key); });
        }
      } finally { I18n.setLang(kept); }
      keys.forEach((key, i) => {
        if (words.fr[i] === words.en[i] && !/\.(row\.aria|palette\.color|hue\.(orange|cyan))$|\.images\.title$/.test(key)) bad.push('identique dans les deux langues : ' + key);
        if (/\{[a-z]+\}/.test(words.fr[i] + words.en[i])) bad.push('variable non remplacée : ' + key);
      });
      const all = words.fr.concat(words.en).join(' ');
      if (/officiel|official|conforme au dsfr|dsfr[- ]compliant|compliant|certifi/i.test(all.replace(/ne certifie/g, ''))) bad.push('promesse « officiel » ou « conforme »');
      if (/\b(colour|grey|favour)\b/i.test(words.en.join(' '))) bad.push('anglais britannique');
      I18n.setLang('fr');
      const fr = I18n.t('state.check.note');
      I18n.setLang(kept);
      if (!/droit d’utiliser la marque/.test(fr) || !/charte/.test(fr)) bad.push('pied du volet : ' + fr);
      return result(bad);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.stateCheck = cases;
})();
