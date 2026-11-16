// Suite "stateStyle" - le mode « Identité de l'État » (DSFR), deuxième lot, première moitié : le style de l'État dans le document (js/state-style.js).
//  - les menus de couleur : deux rangées de plus (« Couleurs de l'État », « Alertes de l'État ») MODE ALLUMÉ seulement, au format de la rangée du thème (sans croix, chaque couleur nommée) ; éteint, la palette
//    est celle d'avant ; les valeurs sont celles du DSFR 1.15.4 et chaque couleur qui sert de texte tient 4,5:1 sur le blanc, sauf le bleu France clair (4,22:1), réservé aux filets ;
//  - le bleu France clair posé en couleur de texte : le coin d'état le dit, la couleur reste posée ; aucun avis pour une autre couleur ni mode éteint ;
//  - « Appliquer le style de l'État » (menu Titre) : les six niveaux de titres du modèle prennent Marianne, #161616 et les tailles papier ; rien d'autre ne change (le texte, les réglages du document) ; UN Ctrl + Z
//    défait, Ctrl + Y remet ; une seconde fois ne fait rien (pas de pas d'annulation) ; la ligne est grisée, avec sa raison, mode éteint ou extension absente (son clic ouvre alors l'installation) ;
//  - un modèle qui porte ce style s'ouvre et se réenregistre à l'identique mode éteint, et s'affiche pareil ;
//  - les textes, en français et en anglais, ne promettent rien d'« officiel ».
// Joué « hébergé » (dev-tests/gfs-stub.js) : l'extension `etat` est active ou non selon `setExtensions`. Le même parcours à la vraie souris dans le panneau de 700x400 : dev-tests/verify-state-style-mouse.mjs (stateStyleMouse).
(function () {
  const cases = [];
  const KEY = 'pp_etat_declaration';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const byId = id => document.getElementById(id);
  const ed = () => EditorCore.getEditor();
  const row = () => byId('v2-btn-state-style-apply');
  const statusText = () => byId('status-msg').textContent;
  const press = el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const menu = () => document.querySelector('.v2-color-dropdown.visible');
  const swatchIn = (root, color) => root.querySelector('.cp-swatch[data-color="' + color + '"]');
  const rowOf = (root, scope) => root.querySelector('.cp-row[data-scope="' + scope + '"]');
  const rowIds = root => Array.from(root.querySelectorAll('.cp-row')).map(r => r.dataset.scope);
  const keyEvent = key => new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true });
  const settle = async () => { await ActionHistory.whenIdle(); await sleep(120); };
  async function undo() { ed().commands.focus('end'); await sleep(60); ed().view.dom.dispatchEvent(keyEvent('z')); await settle(); }
  async function redo() { ed().commands.focus('end'); await sleep(60); ed().view.dom.dispatchEvent(keyEvent('y')); await settle(); }
  const record = on => JSON.stringify({ v: StateMode.TEXT_VERSION, quality: 'etat', date: '2026-11-01', on });

  // Le mode allumé (extension active + déclaration valable) ou éteint, le temps de `fn` ; tout est remis après.
  async function withMode(state, fn) {
    const stub = window.__gfsStub;
    const before = stub.extensions.slice();
    stub.setExtensions(state === 'absent' ? ['graphique'] : ['graphique', 'etat']);
    for (let i = 0; i < 60 && Extensions.isActive('etat') !== (state !== 'absent'); i++) await sleep(30);
    if (state === 'on') PersonStore.set(KEY, record(true));
    else if (state === 'off') PersonStore.set(KEY, record(false));
    else PersonStore.remove(KEY);
    try { return await fn(); } finally {
      EditorCore.closeDropdownPanel();
      stub.setExtensions(before);
      await sleep(60);
      PersonStore.remove(KEY);
      StateMode.syncSettings();
    }
  }
  async function openMenu(caretId) {
    EditorCore.closeDropdownPanel();
    press(byId(caretId));
    await sleep(100);
    return menu();
  }
  const config = levels => '<div class="heading-numbering-config" data-style="none"' + (levels ? " data-level-styles='" + JSON.stringify(levels) + "'" : '') + '></div>';
  const SAMPLE = '<h1>Un <strong>gras</strong></h1><h2>Sous-titre</h2><h3>Trois</h3><p>texte courant</p>';
  async function load(markup) {
    Editor.setHTML(markup);
    await sleep(200);
  }
  const content = () => ed().state.doc.toJSON().content.filter(node => node.type !== 'headingNumberingConfig');
  async function clickRow() {
    StateStyle.syncRow(row(), ed());
    press(row());
    row().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(150);
  }
  const expectedStyles = () => HeadingStyles.normalize(StateStyle.headingStyles());

  cases.push({
    id: 'statestyle_color_rows_appear_only_with_the_mode_on_and_hold_the_dsfr_values',
    description: 'Mode allumé : le menu de la couleur de police ajoute « Couleurs de l’État » (dix couleurs) et « Alertes de l’État » (cinq), sans croix, chacune nommée au survol, avant les couleurs gardées ; éteint ou sans l’extension : la palette d’avant',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      Editor.setHTML('<p>Alpha</p>');
      await sleep(150);
      await h.selectAllInEditor();
      const wanted = ['#000091', '#6a6af4', '#e3e3fd', '#f5f5fe', '#e1000f', '#161616', '#3a3a3a', '#666666', '#eeeeee', '#f6f6f6'];
      const alerts = ['#0063cb', '#18753c', '#b34000', '#ce0500', '#c9191e'];
      for (const state of ['off', 'absent']) {
        await withMode(state, async () => {
          const m = await openMenu('v2-btn-text-color-caret');
          if (!m) { bad.push(state + ' : menu absent'); return; }
          if (!same(rowIds(m), ['model', 'document'])) bad.push(state + ' : rangées=' + rowIds(m).join());
          if (ColorStore.rows().some(r => /^state/.test(r.id))) bad.push(state + ' : ColorStore.rows montre l’État');
        });
      }
      await withMode('on', async () => {
        const m = await openMenu('v2-btn-text-color-caret');
        if (!m) { bad.push('on : menu absent'); return; }
        if (!same(rowIds(m), ['state', 'state-alerts', 'model', 'document'])) bad.push('on : rangées=' + rowIds(m).join());
        const brand = rowOf(m, 'state');
        const signals = rowOf(m, 'state-alerts');
        if (!brand || !signals) return;
        const colors = r => Array.from(r.querySelectorAll('.cp-swatch')).map(b => b.dataset.color);
        if (!same(colors(brand), wanted)) bad.push('couleurs de l’État=' + colors(brand).join());
        if (!same(colors(signals), alerts)) bad.push('couleurs d’alerte=' + colors(signals).join());
        if (m.querySelector('.cp-row[data-scope^="state"] .cp-forget, .cp-row[data-scope^="state"] .cp-saved')) bad.push('une croix ou un « .cp-saved » dans les rangées de l’État');
        const names = Array.from(brand.querySelectorAll('.cp-swatch')).map(b => b.title);
        if (names.some(name => !/·\s#[0-9A-F]{6}$/.test(name))) bad.push('infobulle sans nom ni code : ' + names.join(' | '));
        if (!/Bleu France\b.*#000091/i.test(names[0])) bad.push('premier nom=' + names[0]);
        if (!/filets|barres/i.test(names[1])) bad.push('le bleu clair ne dit pas qu’il est pour les filets : ' + names[1]);
        if (brand.querySelector('.cp-row-label').textContent !== I18n.t('state.color.row') || brand.getAttribute('aria-label') !== I18n.t('state.color.row')) bad.push('intitulé=' + brand.querySelector('.cp-row-label').textContent);
        // Une couleur de l'État se pose comme n'importe quelle pastille.
        swatchIn(m, '#000091').click();
        await sleep(120);
        if (ColorMath.parseCss(ed().getAttributes('textStyle').color) !== '#000091') bad.push('le bleu France ne se pose pas : ' + ed().getAttributes('textStyle').color);
        const store = ColorStore.rows().filter(r => !/^state/.test(r.id)).map(r => r.id);
        if (!same(store, ['model', 'document'])) bad.push('rangées gardées=' + store.join());
      });
      return result(bad);
    },
  });

  cases.push({
    id: 'statestyle_text_colors_hold_4_5_to_1_except_the_light_france_blue',
    description: 'Chaque couleur de l’État qui peut servir de texte tient 4,5:1 sur le blanc ; le bleu France clair (4,22:1) seul n’y arrive pas, et son nom le réserve aux filets ; les fonds pâles sont des fonds',
    run: async () => {
      const bad = [];
      const contrast = color => ColorMath.contrast(color, '#ffffff');
      const texts = StateStyle.BRAND.concat(StateStyle.ALERTS).filter(item => !/Pale|Faint|greyBackground|greyPale/.test(item[0]));
      texts.forEach(([name, color]) => {
        const ratio = contrast(color);
        if (name === 'blueFranceLight') {
          if (ratio >= 4.5 || Math.abs(ratio - 4.22) > 0.05) bad.push('bleu clair=' + ratio);
        } else if (ratio < 4.5) bad.push(name + ' ' + color + ' ' + ratio.toFixed(2));
      });
      if (StateStyle.LIGHT_BLUE !== '#6a6af4') bad.push('LIGHT_BLUE=' + StateStyle.LIGHT_BLUE);
      if (contrast(StateStyle.INK) < 15) bad.push('gris des titres=' + contrast(StateStyle.INK));
      return result(bad);
    },
  });

  cases.push({
    id: 'statestyle_light_blue_as_text_is_flagged_but_still_applied',
    description: 'Le bleu France clair posé en couleur de texte (mode allumé) : le coin d’état dit 4,22:1 et les filets, la couleur est bien posée ; une autre couleur, ou le mode éteint, ne dit rien',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      Editor.setHTML('<p>Alpha</p>');
      await sleep(150);
      const quiet = () => { byId('status-msg').textContent = ''; };
      await withMode('on', async () => {
        await h.selectAllInEditor();
        quiet();
        let m = await openMenu('v2-btn-text-color-caret');
        swatchIn(m, '#000091').click();
        await sleep(150);
        if (statusText() === I18n.t('state.color.lightBlueText')) bad.push('avis pour le bleu France');
        await h.selectAllInEditor();
        m = await openMenu('v2-btn-text-color-caret');
        swatchIn(m, '#6a6af4').click();
        await sleep(150);
        if (statusText() !== I18n.t('state.color.lightBlueText')) bad.push('pas d’avis : ' + JSON.stringify(statusText()));
        if (ColorMath.parseCss(ed().getAttributes('textStyle').color) !== '#6a6af4') bad.push('la couleur n’est pas posée : ' + ed().getAttributes('textStyle').color);
        if (!/4,22/.test(statusText()) || !/filets/.test(statusText())) bad.push('texte de l’avis=' + statusText());
        if (byId('status-msg').className.includes('error')) bad.push('l’avis est montré comme une erreur');
      });
      await withMode('off', async () => {
        await h.selectAllInEditor();
        quiet();
        ed().chain().focus().setTextColor('#6a6af4').run();
        if (StateStyle.noteTextColor('#6a6af4')) bad.push('avis mode éteint');
        if (statusText()) bad.push('texte dans le coin d’état mode éteint : ' + statusText());
      });
      EditorCore.closeDropdownPanel();
      return result(bad);
    },
  });

  cases.push({
    id: 'statestyle_apply_writes_the_six_heading_levels_in_the_model_only_in_one_undo_step',
    description: '« Appliquer le style de l’État » : les six niveaux de titres du modèle prennent Marianne, #161616 et 26 à 14 pt (le niveau 2 d’avant est remplacé) ; le texte et les réglages du document ne bougent pas ; le titre est peint ainsi ; UN Ctrl + Z défait, Ctrl + Y remet ; une seconde fois ne crée aucun pas',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      await withMode('on', async () => {
        const before = { 2: { fontFamily: 'Georgia', color: '#ff0000' } };
        await load(config(before) + SAMPLE);
        await sleep(300);
        if (!same(HeadingStyles.stylesOf(ed().state.doc), HeadingStyles.normalize(before))) bad.push('départ : le style du niveau 2 n’est pas lu : ' + JSON.stringify(HeadingStyles.stylesOf(ed().state.doc)));
        const text = content();
        const shared = JSON.stringify(Templates.getDocumentSettings());
        const start = Editor.getHTML();
        await clickRow();
        const styles = HeadingStyles.stylesOf(ed().state.doc);
        if (!same(styles, expectedStyles())) bad.push('styles=' + JSON.stringify(styles));
        if (!styles || Object.keys(styles).length !== 6) bad.push('niveaux=' + (styles && Object.keys(styles).join()));
        if (!HeadingStyles.stylesOf(ed().state.doc) || /Georgia/.test(JSON.stringify(styles))) bad.push('le niveau 2 d’avant est resté');
        if (!same(content(), text)) bad.push('le contenu du document a changé');
        if (JSON.stringify(Templates.getDocumentSettings()) !== shared) bad.push('un réglage du document a bougé');
        if (statusText() !== I18n.t('state.style.status.applied')) bad.push('coin d’état=' + statusText());
        const h1 = document.querySelector('#editor-container .ProseMirror h1');
        const paint = h1 && getComputedStyle(h1);
        if (!paint || !/Marianne/.test(paint.fontFamily) || Math.abs(parseFloat(paint.fontSize) - 26 * 96 / 72) > 0.6 || paint.color !== 'rgb(22, 22, 22)') bad.push('titre 1 peint ' + (paint && [paint.fontFamily, paint.fontSize, paint.color].join(' / ')));
        const h3 = document.querySelector('#editor-container .ProseMirror h3');
        if (!h3 || Math.abs(parseFloat(getComputedStyle(h3).fontSize) - 18 * 96 / 72) > 0.6) bad.push('titre 3 peint ' + (h3 && getComputedStyle(h3).fontSize));
        const applied = Editor.getHTML();
        // Une seconde fois : rien à écrire, aucun pas de plus.
        await clickRow();
        if (Editor.getHTML() !== applied) bad.push('la seconde fois change le document');
        if (statusText() !== I18n.t('state.style.status.same')) bad.push('coin d’état la seconde fois=' + statusText());
        await undo();
        if (Editor.getHTML() !== start) bad.push('Ctrl+Z ne rend pas le départ d’un seul coup (la seconde fois a laissé un pas ?)');
        if (!same(HeadingStyles.stylesOf(ed().state.doc), HeadingStyles.normalize(before))) bad.push('styles après Ctrl+Z=' + JSON.stringify(HeadingStyles.stylesOf(ed().state.doc)));
        await redo();
        if (Editor.getHTML() !== applied) bad.push('Ctrl+Y ne remet pas le style');
      });
      return result(bad);
    },
  });

  cases.push({
    id: 'statestyle_apply_keeps_what_the_person_set_by_hand_on_a_heading',
    description: '« Appliquer » n’efface pas la mise en forme faite à la main d’un titre (un mot en rouge reste rouge) ; il n’y a pas de style écrit hors des titres',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      await withMode('on', async () => {
        await load('<h1>Un <span style="color: #ce0500">mot</span></h1><p>texte</p>');
        const before = JSON.stringify(content());
        await clickRow();
        if (JSON.stringify(content()) !== before) bad.push('le contenu a changé : ' + JSON.stringify(content()).slice(0, 200));
        const styles = HeadingStyles.stylesOf(ed().state.doc);
        if (!styles || !styles[1]) bad.push('style absent');
        const span = document.querySelector('#editor-container .ProseMirror h1 span');
        if (!span || getComputedStyle(span).color !== 'rgb(206, 5, 0)') bad.push('le mot rouge n’est plus rouge : ' + (span && getComputedStyle(span).color));
      });
      return result(bad);
    },
  });

  cases.push({
    id: 'statestyle_the_row_is_greyed_with_its_reason_until_the_mode_is_on',
    description: 'Mode éteint : la ligne du menu Titre est grisée (aria-disabled, jamais retirée), sa raison est au survol et un clic la dit sans rien changer ; extension absente : la raison est celle des Réglages et le clic demande l’installation à GFS ; allumer ou éteindre le mode la met à jour',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      await load(SAMPLE);
      await withMode('off', async () => {
        const start = Editor.getHTML();
        StateStyle.syncRow(row(), ed());
        if (!row()) { bad.push('ligne absente'); return; }
        if (row().getAttribute('aria-disabled') !== 'true' || !row().classList.contains('v2-hover-row-disabled')) bad.push('non grisée : ' + row().className);
        if (row().title !== I18n.t('state.style.locked.off')) bad.push('raison=' + row().title);
        byId('status-msg').textContent = '';
        await clickRow();
        if (Editor.getHTML() !== start) bad.push('un clic grisé a changé le document');
        if (statusText() !== I18n.t('state.style.locked.off')) bad.push('coin d’état=' + statusText());
        // Allumer le mode : la ligne se libère d’elle-même (le mode prévient ses abonnés).
        if (!StateMode.setOn(true)) bad.push('setOn(true) refusé');
        if (row().getAttribute('aria-disabled') !== 'false' || row().title !== I18n.t('state.style.apply.hint')) bad.push('toujours grisée allumée : ' + row().getAttribute('aria-disabled') + ' ' + row().title);
        if (row().tabIndex !== 0) bad.push('hors du clavier allumée');
        StateMode.setOn(false);
        if (row().getAttribute('aria-disabled') !== 'true') bad.push('reste libre éteinte');
      });
      await withMode('absent', async () => {
        StateStyle.syncRow(row(), ed());
        if (row().getAttribute('aria-disabled') !== 'true') bad.push('absent : non grisée');
        if (row().title !== StateMode.view().hint) bad.push('absent : raison=' + row().title);
        window.__gfsStub.calls.length = 0;
        await clickRow();
        for (let i = 0; i < 60 && !window.__gfsStub.calls.some(c => c.nom === 'installer'); i++) await sleep(30);
        const call = window.__gfsStub.calls.find(c => c.nom === 'installer');
        if (!call || !call.args || call.args.extension !== 'etat') bad.push('installer(etat) non demandé : ' + JSON.stringify(window.__gfsStub.calls));
      });
      return result(bad);
    },
  });

  cases.push({
    id: 'statestyle_a_template_carrying_the_style_opens_and_saves_the_same_with_the_mode_off',
    description: 'Un modèle qui porte le style de l’État (styles de titres écrits) se relit et se réécrit octet pour octet mode éteint comme allumé ; ses titres sont peints pareil ; la Lecture porte le même style',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      const markup = config(StateStyle.headingStyles()) + '<h1>Titre</h1><h2>Sous-titre</h2><p>texte</p>';
      const seen = {};
      for (const state of ['on', 'off', 'absent']) {
        await withMode(state, async () => {
          await load(markup);
          const h1 = document.querySelector('#editor-container .ProseMirror h1');
          const paint = h1 ? getComputedStyle(h1) : null;
          seen[state] = { html: Editor.getHTML(), paint: paint && [paint.fontFamily, paint.fontSize, paint.color].join('/') };
          const reader = await h.renderReaderMode(Editor.getHTML());
          const rh = reader.querySelector('h1');
          seen[state].reader = rh ? rh.getAttribute('style') : null;
          document.getElementById('reader-container').style.display = 'none';
        });
      }
      if (seen.on.html !== seen.off.html || seen.on.html !== seen.absent.html) bad.push('le HTML enregistré change avec le mode');
      if (seen.on.paint !== seen.off.paint || seen.on.paint !== seen.absent.paint || !/Marianne/.test(seen.on.paint || '')) bad.push('titre peint : ' + JSON.stringify(seen));
      if (!seen.on.reader || !/Marianne/.test(seen.on.reader) || seen.on.reader !== seen.off.reader) bad.push('Lecture : ' + JSON.stringify([seen.on.reader, seen.off.reader]));
      if (!/data-level-styles/.test(seen.off.html)) bad.push('le style n’est pas dans le HTML enregistré');
      return result(bad);
    },
  });

  cases.push({
    id: 'statestyle_texts_are_in_both_languages_and_promise_nothing_official',
    description: 'Les textes du lot 2 existent en français et en anglais, sans variable oubliée ; aucun ne parle d’« officiel » ou de « conforme au DSFR »',
    run: async () => {
      const bad = [];
      const keys = ['state.color.row', 'state.color.row.hint', 'state.color.alerts', 'state.color.alerts.hint', 'state.color.lightBlueText', 'state.style.apply', 'state.style.apply.hint', 'state.style.locked.off', 'state.style.status.applied', 'state.style.status.same']
        .concat(StateStyle.BRAND.concat(StateStyle.ALERTS).map(item => 'state.color.name.' + item[0]));
      const kept = I18n.getLang();
      const words = { fr: [], en: [] };
      for (const lang of ['fr', 'en']) {
        I18n.setLang(lang);
        keys.forEach((key) => { const text = I18n.t(key); words[lang].push(text); if (!text || text === key) bad.push(lang + ' manquant : ' + key); });
      }
      I18n.setLang(kept);
      keys.forEach((key, i) => {
        if (words.fr[i] === words.en[i] && !/state\.color\.name\.(info)$/.test(key)) bad.push('identique dans les deux langues : ' + key);
        if (/\{[a-z]+\}/.test(words.fr[i] + words.en[i])) bad.push('variable non remplacée : ' + key);
      });
      if (/officiel|official|conforme au dsfr|dsfr[- ]compliant/i.test(words.fr.concat(words.en).join(' '))) bad.push('promesse « officiel » ou « conforme »');
      if (/\b(colour|grey|favour)\b/i.test(words.en.join(' '))) bad.push('anglais britannique');
      return result(bad);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.stateStyle = cases;
})();
