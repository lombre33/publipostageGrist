// Suite "undoPage" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi la PAGE du modèle : format, sens, taille libre, marges, filigrane, couleurs du modèle (demande d'Antoine du 22/10 :
// « le ctrl+Z ne prend pas en compte le changement de format. Il doit prendre en compte 100% des actions faites dans le widget »). La page vit dans PageLayout (le brouillon de la colonne Margins), hors
// du document : l'historique de l'éditeur ne la connaissait pas, Ctrl + Z défaisait le dernier mot tapé et laissait le format. js/history-markers.js y range un repère par geste de la page, entre les frappes.
//
// Les attendus sont ceux de la personne qui défait : 1) UN Ctrl + Z rend la page d'avant (le modèle, la feuille de l'éditeur, le bouton Page, l'enregistrement automatique en est prévenu), UN Ctrl + Y la
// rend de nouveau ; 2) l'ordre est celui des gestes, texte et page mêlés ; 3) un geste en plusieurs temps (les chiffres d'une marge, les sauts de page et le sens des marges d'« Aucune page tournée »)
// est UN pas ; 4) un geste qui ne change rien n'ajoute rien à l'historique ; 5) un nouveau geste efface ce qui se rétablissait ; 6) un autre modèle ne reçoit jamais la page de l'ancien.
// Le même parcours à la vraie souris et au vrai clavier, dans le panneau de 700x400 : verify-undo-page-mouse.mjs (undoPageMouse).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.undoPage = (function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const stub = () => window.__gristStub;
  const ed = () => EditorCore.getEditor();
  const byId = id => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  const lines = (n, tag) => Array.from({ length: n }, (_, i) => '<p>' + tag + ' ' + i + ' du modèle de test.</p>').join('');
  const PLAIN_BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const breakTo = sense => '<div class="page-break-marker" contenteditable="false" data-page-orientation="' + sense + '">Saut de page</div>';
  const markersOf = html => html.match(/<div class="page-break-marker"[^>]*>/g) || [];
  const THREE_PAGES = lines(3, 'Alpha') + PLAIN_BREAK + lines(3, 'Bravo') + PLAIN_BREAK + lines(3, 'Charlie');

  // La page du modèle telle que la personne la voit : ce que PageLayout garde et ce que la feuille de l'éditeur en lit.
  function page() {
    const margins = PageLayout.getMarginsMm();
    const watermark = PageLayout.getWatermark();
    return {
      format: PageLayout.getFormat(), orientation: PageLayout.getOrientation(), auto: PageLayout.isOrientationAuto(),
      margins: [margins.top, margins.right, margins.bottom, margins.left].map(v => Math.round(v * 10) / 10),
      watermark: watermark ? watermark.text : null, colors: PageLayout.getCustomColors(),
      sheet: document.documentElement.style.getPropertyValue('--pp-page-width'),
    };
  }
  // Ctrl + Z et Ctrl + Y au vrai clavier de l'éditeur (la touche passe par le raccourci de TipTap, comme sous les doigts).
  function press(key, shiftKey) {
    const event = new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, shiftKey: !!shiftKey, bubbles: true, cancelable: true });
    ed().view.dom.dispatchEvent(event);
    return event.defaultPrevented;
  }
  const undo = () => press('z');
  const redo = () => press('y');
  // Du texte tapé à la fin du document : un événement de l'historique, clos aussitôt pour que la frappe suivante n'y soit pas rangée.
  function type(text) {
    const state = ed().state;
    const tr = state.tr.insertText(text, state.doc.content.size - 1);
    tr.setMeta('closeHistory$', true);
    ed().view.dispatch(tr);
  }
  const text = () => ed().getText();
  // Compte les annonces qui préviennent l'enregistrement automatique et la mise en page.
  function listen() {
    const counter = { margins: 0, layout: 0, watermark: 0, reset() { counter.margins = counter.layout = counter.watermark = 0; }, stop() { ['pp:marginsChanged', 'pp:pageLayoutChanged', 'pp:watermarkChanged'].forEach((type, i) => document.removeEventListener(type, handlers[i])); } };
    const handlers = [() => { counter.margins++; }, () => { counter.layout++; }, () => { counter.watermark++; }];
    ['pp:marginsChanged', 'pp:pageLayoutChanged', 'pp:watermarkChanged'].forEach((type, i) => document.addEventListener(type, handlers[i]));
    return counter;
  }
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }

  // Un modèle neuf en Aperçu A4, du type Document (le seul à avoir toutes les lignes du menu Page), `html` dans l'éditeur.
  async function fresh(h, html) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    Editor.setHTML(html || '<p></p>');
    OrientationToggle.sync('document');
    await h.sleep(250);
  }
  async function leave(h) {
    const settings = byId('settings-modal');
    if (settings && settings.style.display !== 'none') byId('settings-close').click();
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.resetEditor();
  }

  // --- Format, sens, taille libre : le menu Page ---

  cases.push({
    id: 'undo_page_format_comes_back_with_ctrl_z_and_goes_again_with_ctrl_y',
    description: 'Le format choisi dans le menu Page (A5) entre dans l\'historique : Ctrl + Z rend l\'A4 (modèle, feuille de l\'éditeur), Ctrl + Y l\'A5, le bouton Annuler de la barre fait comme Ctrl + Z, et chaque retour prévient l\'enregistrement automatique',
    async run(h) {
      const problems = [];
      const log = listen();
      try {
        await fresh(h);
        const start = page();
        OrientationToggle.selectFormat('A5');
        await h.sleep(120);
        const a5 = page();
        if (a5.format !== 'A5' || a5.sheet === start.sheet) problems.push('A5 posé : ' + JSON.stringify(a5));
        log.reset();
        undo();
        await h.sleep(150);
        check(problems, 'Ctrl + Z', page(), start);
        if (log.layout < 1 || log.margins < 1) problems.push('Ctrl + Z n\'a pas prévenu la mise en page et l\'enregistrement : ' + JSON.stringify({ layout: log.layout, margins: log.margins }));
        log.reset();
        redo();
        await h.sleep(150);
        check(problems, 'Ctrl + Y', page(), a5);
        if (log.layout < 1 || log.margins < 1) problems.push('Ctrl + Y n\'a pas prévenu : ' + JSON.stringify({ layout: log.layout, margins: log.margins }));
        await h.clickButton('v2-btn-undo');
        await h.sleep(150);
        check(problems, 'bouton Annuler', page(), start);
        check(problems, 'le bouton Page dit le format', byId('btn-page-orientation').getAttribute('aria-label').indexOf('A5') === -1, true);
        return verdict(problems, { start: start.format, a5: a5.format });
      } finally { log.stop(); await leave(h); }
    },
  });

  cases.push({
    id: 'undo_page_orientation_comes_back_with_ctrl_z_and_the_button_follows',
    description: 'Le sens (Paysage, par le menu puis par le bouton de la barre) entre dans l\'historique : Ctrl + Z rend le portrait, le bouton Page et la feuille de l\'éditeur le disent, Ctrl + Y rend le paysage',
    async run(h) {
      const problems = [];
      try {
        await fresh(h);
        const start = page();
        OrientationToggle.selectOrientation('landscape');
        await h.sleep(120);
        const landscape = page();
        if (landscape.orientation !== 'landscape') problems.push('paysage posé : ' + JSON.stringify(landscape));
        undo();
        await h.sleep(150);
        check(problems, 'Ctrl + Z', page(), start);
        check(problems, 'bouton Page après Ctrl + Z', byId('btn-page-orientation').dataset.orientation, 'portrait');
        redo();
        await h.sleep(150);
        check(problems, 'Ctrl + Y', page(), landscape);
        check(problems, 'bouton Page après Ctrl + Y', byId('btn-page-orientation').dataset.orientation, 'landscape');
        // Le bouton de la barre, lui, tourne la page d'un clic : un geste de l'historique comme les lignes du menu.
        await h.clickButton('btn-page-orientation');
        await h.sleep(120);
        check(problems, 'le clic sur le bouton', page().orientation, 'portrait');
        undo();
        await h.sleep(150);
        check(problems, 'Ctrl + Z après le clic sur le bouton', page().orientation, 'landscape');
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_page_free_size_comes_back_with_ctrl_z',
    description: 'La taille libre de la fenêtre « Format libre… » (OrientationToggle.selectPageSize) entre dans l\'historique : Ctrl + Z rend le format et le sens d\'avant, Ctrl + Y la taille saisie',
    async run(h) {
      const problems = [];
      try {
        await fresh(h);
        const start = page();
        if (!OrientationToggle.selectPageSize(200, 100)) problems.push('la taille est refusée');
        await h.sleep(120);
        const free = page();
        if (free.format === start.format || free.orientation !== 'landscape') problems.push('taille posée : ' + JSON.stringify(free));
        undo();
        await h.sleep(150);
        check(problems, 'Ctrl + Z', page(), start);
        redo();
        await h.sleep(150);
        check(problems, 'Ctrl + Y', page(), free);
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_page_macro_orientation_auto_comes_back_with_ctrl_z',
    description: '« Selon chaque modèle » d\'un macro-modèle entre dans l\'historique : Ctrl + Z rend le sens imposé d\'avant, Ctrl + Y le réglage',
    async run(h) {
      const problems = [];
      try {
        await fresh(h);
        OrientationToggle.sync('macro');
        OrientationToggle.selectOrientation('landscape');
        await h.sleep(100);
        const forced = page();
        OrientationToggle.selectAuto();
        await h.sleep(120);
        const auto = page();
        if (!auto.auto) problems.push('« Selon chaque modèle » n\'est pas posé : ' + JSON.stringify(auto));
        undo();
        await h.sleep(150);
        check(problems, 'Ctrl + Z', page(), forced);
        redo();
        await h.sleep(150);
        check(problems, 'Ctrl + Y', page(), auto);
        return verdict(problems, {});
      } finally { OrientationToggle.sync('document'); await leave(h); }
    },
  });

  // --- Marges : les préréglages et les chiffres tapés ---

  const field = side => byId('settings-margin-' + side);
  const preset = id => byId('settings-margin-preset-' + id);
  async function openMargins(h) {
    byId('v2-btn-settings').click();
    await h.sleep(100);
    document.querySelector('.settings-tab[data-settings-tab="pageMargins"]').click();
    await h.sleep(60);
  }
  const closeSettings = () => byId('settings-close').click();
  function typeMargin(side, value) {
    const input = field(side);
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const commitMargin = side => field(side).dispatchEvent(new Event('change', { bubbles: true }));

  cases.push({
    id: 'undo_page_margin_presets_are_one_step_each',
    description: 'Un préréglage de marges (Étroites, puis Larges) est un geste de l\'historique : Ctrl + Z rend les marges d\'avant le dernier, puis d\'avant le premier, Ctrl + Y les rejoue',
    async run(h) {
      const problems = [];
      try {
        await fresh(h);
        await openMargins(h);
        const start = page();
        preset('narrow').click();
        await h.sleep(100);
        const narrow = page();
        preset('wide').click();
        await h.sleep(100);
        const wide = page();
        if (same(narrow.margins, start.margins) || same(wide.margins, narrow.margins)) problems.push('les préréglages n\'ont rien posé : ' + JSON.stringify({ start: start.margins, narrow: narrow.margins, wide: wide.margins }));
        undo();
        await h.sleep(120);
        check(problems, 'Ctrl + Z, Larges défait', page(), narrow);
        undo();
        await h.sleep(120);
        check(problems, 'Ctrl + Z, Étroites défait', page(), start);
        redo();
        redo();
        await h.sleep(120);
        check(problems, 'Ctrl + Y deux fois', page(), wide);
        // Un préréglage déjà en place ne change rien : il n'ajoute rien à l'historique.
        preset('wide').click();
        await h.sleep(80);
        undo();
        await h.sleep(120);
        check(problems, 'Ctrl + Z après un préréglage déjà en place', page(), narrow);
        closeSettings();
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_page_typed_margin_is_one_step_not_one_per_digit',
    description: 'Les chiffres tapés dans un champ de marge ("2" puis "25" puis "250") sont UN pas : un Ctrl + Z rend la marge d\'avant la saisie, pas celle d\'avant le dernier chiffre ; une autre saisie, ensuite, est un autre pas',
    async run(h) {
      const problems = [];
      try {
        await fresh(h);
        await openMargins(h);
        const start = page();
        typeMargin('top', '2');
        typeMargin('top', '25');
        typeMargin('top', '30');
        commitMargin('top');
        await h.sleep(80);
        const first = page();
        if (first.margins[0] !== 30) problems.push('30 mm tapés : ' + JSON.stringify(first.margins));
        typeMargin('left', '1');
        typeMargin('left', '15');
        commitMargin('left');
        await h.sleep(80);
        const second = page();
        if (second.margins[3] !== 15) problems.push('15 mm tapés : ' + JSON.stringify(second.margins));
        undo();
        await h.sleep(120);
        check(problems, 'un Ctrl + Z rend la marge gauche d\'avant sa saisie', page(), first);
        undo();
        await h.sleep(120);
        check(problems, 'un second Ctrl + Z rend la marge haute d\'avant sa saisie', page(), start);
        redo();
        await h.sleep(120);
        check(problems, 'Ctrl + Y', page(), first);
        // Les champs de Réglages montrent la page retrouvée quand la fenêtre se rouvre.
        closeSettings();
        await openMargins(h);
        check(problems, 'les champs rouverts', [field('top'), field('right'), field('bottom'), field('left')].map(input => Math.round(parseFloat(input.value) * 10) / 10), first.margins);
        closeSettings();
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_page_typed_margin_closed_with_the_window_is_recorded',
    description: 'Une marge tapée puis Réglages fermé sans quitter le champ (aucun événement `change`) est quand même un pas de l\'historique',
    async run(h) {
      const problems = [];
      try {
        await fresh(h);
        await openMargins(h);
        const start = page();
        typeMargin('bottom', '40');
        closeSettings();
        await h.sleep(80);
        if (page().margins[2] !== 40) problems.push('40 mm tapés : ' + JSON.stringify(page().margins));
        undo();
        await h.sleep(120);
        check(problems, 'Ctrl + Z', page(), start);
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  // --- Filigrane ---

  cases.push({
    id: 'undo_page_watermark_comes_back_with_ctrl_z',
    description: 'Le filigrane posé par la fenêtre « Filigrane… », puis retiré, entre dans l\'historique : Ctrl + Z rend le filigrane retiré, un second le rend absent, Ctrl + Y le rejoue ; chaque retour repeint la page (pp:watermarkChanged)',
    async run(h) {
      const problems = [];
      const log = listen();
      try {
        await fresh(h, lines(8, 'Texte'));
        const modal = () => byId('pp-watermark-modal');
        const primary = () => modal().querySelector('.var-modal-actions button.var-modal-primary');
        const danger = () => modal().querySelector('.var-modal-actions button.var-modal-danger');
        const input = value => { const f = byId('pp-watermark-text'); f.value = value; f.dispatchEvent(new Event('input', { bubbles: true })); };
        const start = page();
        WatermarkDialog.open();
        input('BROUILLON');
        primary().click();
        await h.sleep(100);
        const set = page();
        if (set.watermark !== 'BROUILLON') problems.push('filigrane posé : ' + JSON.stringify(set.watermark));
        WatermarkDialog.open();
        danger().click();
        await h.sleep(100);
        if (page().watermark !== null) problems.push('filigrane retiré : ' + JSON.stringify(page().watermark));
        log.reset();
        undo();
        await h.sleep(120);
        check(problems, 'Ctrl + Z rend le filigrane retiré', page(), set);
        if (log.watermark < 1 || log.margins < 1) problems.push('Ctrl + Z n\'a pas prévenu : ' + JSON.stringify({ watermark: log.watermark, margins: log.margins }));
        undo();
        await h.sleep(120);
        check(problems, 'second Ctrl + Z', page(), start);
        redo();
        await h.sleep(120);
        check(problems, 'Ctrl + Y', page(), set);
        return verdict(problems, {});
      } finally {
        log.stop();
        const modal = byId('pp-watermark-modal');
        if (modal && modal.style.display !== 'none') { const cancel = modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)'); if (cancel) cancel.click(); }
        await leave(h);
      }
    },
  });

  // --- Couleurs du modèle ---

  const press1 = el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const colorMenu = () => document.querySelector('.v2-color-dropdown.visible');
  async function composeColor(h, hex) {
    EditorCore.closeDropdownPanel();
    press1(byId('v2-btn-text-color-caret'));
    await h.sleep(100);
    press1(colorMenu().querySelector('.cp-custom'));
    await h.sleep(150);
    const field = byId('pp-color-hex');
    field.value = hex;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    byId('pp-color-modal').querySelector('.pp-modal-actions .var-modal-primary').click();
    await h.sleep(150);
  }
  const textColor = () => ed().getAttributes('textStyle').color || null;

  cases.push({
    id: 'undo_page_custom_color_kept_in_the_model_goes_with_the_color_it_set',
    description: 'La couleur composée dans « Personnalisé… » et gardée dans la rangée du modèle se défait avec la couleur posée sur le texte, d\'un seul Ctrl + Z ; Ctrl + Y rend les deux ; « oublier » une couleur gardée se défait aussi',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, '<p>Alpha Beta</p>');
        await h.selectAllInEditor();
        await composeColor(h, '1e8449');
        check(problems, 'couleur posée', [textColor(), PageLayout.getCustomColors()], ['#1e8449', ['#1e8449']]);
        undo();
        await h.sleep(150);
        check(problems, 'un Ctrl + Z défait la couleur du texte ET la rangée du modèle', [textColor(), PageLayout.getCustomColors()], [null, []]);
        redo();
        await h.sleep(150);
        check(problems, 'Ctrl + Y rend les deux', [textColor(), PageLayout.getCustomColors()], ['#1e8449', ['#1e8449']]);
        // « Oublier » une couleur gardée : la croix de sa pastille.
        EditorCore.closeDropdownPanel();
        press1(byId('v2-btn-text-color-caret'));
        await h.sleep(100);
        const cross = colorMenu().querySelector('.cp-forget[data-action="forget:model:#1e8449"]');
        if (!cross) problems.push('la croix de la couleur gardée est introuvable');
        else {
          press1(cross);
          cross.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          cross.click();
          await h.sleep(120);
          check(problems, 'oubliée', PageLayout.getCustomColors(), []);
          EditorCore.closeDropdownPanel();
          undo();
          await h.sleep(150);
          check(problems, 'Ctrl + Z rend la couleur oubliée', [textColor(), PageLayout.getCustomColors()], ['#1e8449', ['#1e8449']]);
        }
        return verdict(problems, {});
      } finally {
        const modal = byId('pp-color-modal');
        if (modal && modal.style.display !== 'none') { const cancel = modal.querySelector('.pp-modal-actions button:not(.var-modal-primary)'); if (cancel) cancel.click(); }
        EditorCore.closeDropdownPanel();
        await leave(h);
      }
    },
  });

  // --- L'ordre des gestes, texte et page mêlés ---

  cases.push({
    id: 'undo_page_steps_come_back_in_the_order_of_the_gestures_text_and_page_mixed',
    description: 'Texte tapé, format, texte, sens, texte : quatre Ctrl + Z défont dans l\'ordre inverse (le dernier mot, le sens, l\'avant-dernier mot, le format), et quatre Ctrl + Y les rejouent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        await fresh(h);
        const start = page();
        type('A');
        OrientationToggle.selectFormat('A5');
        const afterFormat = page();
        type('B');
        OrientationToggle.selectOrientation('landscape');
        const afterSense = page();
        type('C');
        const states = [];
        states.push({ text: text(), page: page() });
        const expected = [
          { label: 'sans C', text: 'AB', page: afterSense },
          { label: 'sens défait', text: 'AB', page: afterFormat },
          { label: 'sans B', text: 'A', page: afterFormat },
          { label: 'format défait', text: 'A', page: start },
          { label: 'sans A', text: '', page: start },
        ];
        expected.forEach(step => {
          undo();
          states.push({ label: step.label, text: text(), page: page() });
        });
        expected.forEach((step, i) => {
          const got = states[i + 1];
          if (got.text !== step.text || !same(got.page, step.page)) problems.push('Ctrl + Z « ' + step.label + ' » : ' + JSON.stringify({ text: got.text, format: got.page.format, orientation: got.page.orientation }) + ' au lieu de ' + JSON.stringify({ text: step.text, format: step.page.format, orientation: step.page.orientation }));
        });
        const replay = [];
        for (let i = 0; i < expected.length; i++) { redo(); replay.push({ text: text(), format: page().format, orientation: page().orientation }); }
        const want = [
          { text: 'A', format: start.format, orientation: start.orientation },
          { text: 'A', format: afterFormat.format, orientation: afterFormat.orientation },
          { text: 'AB', format: afterFormat.format, orientation: afterFormat.orientation },
          { text: 'AB', format: afterSense.format, orientation: afterSense.orientation },
          { text: 'ABC', format: afterSense.format, orientation: afterSense.orientation },
        ];
        check(problems, 'Ctrl + Y cinq fois', replay, want);
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_page_a_new_gesture_clears_what_could_be_redone_and_a_gesture_that_changes_nothing_adds_nothing',
    description: 'Après un Ctrl + Z, un geste neuf de la page efface ce qui se rétablissait (Ctrl + Y ne rend plus l\'ancien format) ; choisir le format déjà en place n\'ajoute aucun pas',
    async run(h) {
      const problems = [];
      try {
        await fresh(h);
        type('A');
        const start = page();
        OrientationToggle.selectFormat('A5');
        undo();
        await h.sleep(120);
        check(problems, 'après Ctrl + Z', page(), start);
        OrientationToggle.selectFormat('A3');
        await h.sleep(120);
        const a3 = page();
        redo();
        await h.sleep(120);
        check(problems, 'Ctrl + Y après un geste neuf ne rend pas l\'A5', page(), a3);
        // Le format déjà en place : rien à défaire.
        OrientationToggle.selectFormat('A3');
        OrientationToggle.selectOrientation('portrait');
        await h.sleep(80);
        undo();
        await h.sleep(120);
        check(problems, 'Ctrl + Z après des gestes qui ne changent rien rend le format d\'avant', page(), start);
        check(problems, 'le texte tapé est encore là', text(), 'A');
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  // --- Les gestes en plusieurs temps ---

  cases.push({
    id: 'undo_page_this_page_orientation_is_one_step_with_its_page_breaks_and_the_margins',
    description: 'Menu Page, « Cette page », la première page en paysage : le saut de page que le menu écrit et le sens des marges sont UN pas - un Ctrl + Z rend le texte d\'avant ET le portrait, un Ctrl + Y les deux de nouveau',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, THREE_PAGES);
        await h.sleep(300);
        ed().commands.setTextSelection(1);
        await h.sleep(60);
        OrientationToggle.sync();
        const before = Editor.getHTML();
        const start = page();
        if (!OrientationToggle.selectScope('page')) problems.push('« Cette page » refusée');
        OrientationToggle.selectOrientation('landscape');
        await h.sleep(400);
        const turned = Editor.getHTML();
        const done = page();
        if (turned === before || done.orientation !== 'landscape' || (markersOf(turned)[0] || '').indexOf('data-page-orientation="portrait"') === -1) problems.push('la première page n\'est pas tournée : ' + JSON.stringify({ markers: markersOf(turned), orientation: done.orientation }));
        undo();
        await h.sleep(300);
        if (Editor.getHTML() !== before) problems.push('Ctrl + Z ne rend pas le texte d\'avant : ' + JSON.stringify(markersOf(Editor.getHTML())));
        check(problems, 'Ctrl + Z rend aussi le sens des marges', page(), start);
        redo();
        await h.sleep(300);
        if (Editor.getHTML() !== turned) problems.push('Ctrl + Y ne rend pas le texte tourné : ' + JSON.stringify(markersOf(Editor.getHTML())));
        check(problems, 'Ctrl + Y rend aussi le sens des marges', page(), done);
        return verdict(problems, {});
      } finally { OrientationToggle.selectScope('document'); await leave(h); }
    },
  });

  cases.push({
    id: 'undo_page_whole_document_orientation_is_one_step_with_the_breaks_it_removes',
    description: 'Menu Page, « Tout le document » en paysage sur un document aux pages tournées une à une (après la question) : les sauts retirés et le sens des marges sont UN pas, Ctrl + Z rend les pages tournées et le portrait',
    async run(h) {
      const problems = [];
      const html = lines(2, 'Alpha') + breakTo('landscape') + lines(2, 'Bravo') + breakTo('portrait') + lines(2, 'Charlie');
      try {
        await fresh(h, html);
        await h.sleep(300);
        const before = Editor.getHTML();
        const start = page();
        OrientationToggle.selectScope('document');
        const answers = h.stubDialogs({ confirm: true });
        try { await OrientationToggle.selectOrientation('landscape'); } finally { answers.restore(); }
        await h.sleep(400);
        const turned = Editor.getHTML();
        const done = page();
        if (turned.indexOf('data-page-orientation') !== -1 || done.orientation !== 'landscape') problems.push('le document n\'est pas tourné en entier : ' + JSON.stringify({ markers: markersOf(turned), orientation: done.orientation }));
        undo();
        await h.sleep(300);
        if (Editor.getHTML() !== before) problems.push('Ctrl + Z ne rend pas les pages tournées : ' + JSON.stringify(markersOf(Editor.getHTML())));
        check(problems, 'Ctrl + Z rend aussi le sens des marges', page(), start);
        redo();
        await h.sleep(300);
        check(problems, 'Ctrl + Y', [Editor.getHTML() === turned, page()], [true, done]);
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  // --- Ce qui ne doit pas bouger ---

  cases.push({
    id: 'undo_page_does_not_cross_a_model_change',
    description: 'Charger un autre modèle vide l\'historique : un Ctrl + Z ne rend jamais la page de l\'ancien modèle au nouveau (ni son format, ni ses marges, ni son filigrane)',
    async run(h) {
      const problems = [];
      try {
        await fresh(h);
        OrientationToggle.selectFormat('A5');
        OrientationToggle.selectOrientation('landscape');
        PageLayout.setCustomColors([]);
        await h.sleep(100);
        // Le chargement d'un autre modèle : sa page d'abord, puis son texte (js/main.js:loadContentIntoEditor).
        PageLayout.setMarginsMm({ top: 10, right: 10, bottom: 10, left: 10, format: 'A3', orientation: 'portrait' });
        Editor.setHTML('<p>Autre modèle</p>');
        await h.sleep(250);
        const other = page();
        undo();
        await h.sleep(150);
        check(problems, 'Ctrl + Z sur le nouveau modèle', page(), other);
        redo();
        await h.sleep(150);
        check(problems, 'Ctrl + Y sur le nouveau modèle', page(), other);
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_page_keeps_the_pending_marks_and_the_selection',
    description: 'Un geste de la page ne perd ni les marques en attente (le gras choisi avant de taper) ni la sélection ; Ctrl + Z de la page non plus',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, '<p>Alpha Beta</p>');
        ed().commands.setTextSelection({ from: 3, to: 6 });
        ed().commands.focus();
        await h.sleep(60);
        const selection = [ed().state.selection.from, ed().state.selection.to];
        OrientationToggle.selectFormat('A5');
        await h.sleep(100);
        check(problems, 'sélection après le geste', [ed().state.selection.from, ed().state.selection.to], selection);
        ed().commands.setTextSelection(1);
        ed().commands.toggleBold();
        const marks = ed().state.storedMarks ? ed().state.storedMarks.map(mark => mark.type.name) : [];
        if (marks.indexOf('bold') === -1) problems.push('le gras en attente n\'est pas posé : ' + JSON.stringify(marks));
        OrientationToggle.selectFormat('A3');
        await h.sleep(100);
        const kept = ed().state.storedMarks ? ed().state.storedMarks.map(mark => mark.type.name) : [];
        if (kept.indexOf('bold') === -1) problems.push('le geste de la page a perdu le gras en attente : ' + JSON.stringify(kept));
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_page_with_track_changes_on_is_not_a_suggestion',
    description: 'Suivi des modifications actif : un geste de la page et son Ctrl + Z ne créent aucune suggestion à accepter ou refuser, le texte reste tel quel',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, '<p>Alpha Beta</p>');
        Editor.setTrackChanges(true);
        await h.sleep(100);
        const start = page();
        const html = Editor.getHTML();
        OrientationToggle.selectFormat('A5');
        await h.sleep(100);
        undo();
        await h.sleep(150);
        check(problems, 'page rendue', page(), start);
        if (Editor.hasPendingTrackedChanges()) problems.push('le geste ou son Ctrl + Z a laissé une modification en attente');
        if (Editor.getHTML() !== html) problems.push('le texte a changé : ' + Editor.getHTML());
        return verdict(problems, {});
      } finally { Editor.setTrackChanges(false); await leave(h); }
    },
  });

  // --- Le focus hors de l'éditeur ---
  // Après un menu ou une fenêtre, le focus reste sur le bouton qu'on a cliqué ou retombe sur le corps de la page : TipTap, qui écoute l'éditeur seul, n'entendait pas Ctrl + Z. js/shortcuts.js le fait
  // alors partir au bouton Annuler (`anywhere`) - sauf dans un champ de saisie (où Ctrl + Z défait la frappe), sous une fenêtre ouverte et quand l'éditeur n'est pas à l'écran (Lecture).

  // La touche là où est le focus (le raccourci de Shortcuts, qui écoute le document), pas dans l'éditeur. Rend vrai si la touche a été prise.
  function pressAt(key, target, shiftKey) {
    const event = new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, shiftKey: !!shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }
  const blurAll = () => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); };

  cases.push({
    id: 'undo_page_ctrl_z_acts_when_the_focus_is_on_a_button_or_on_the_page',
    description: 'Le format choisi, puis le focus sur le bouton Page ou sur le corps de la page (hors de l\'éditeur) : Ctrl + Z rend l\'A4, Ctrl + Y et Ctrl + Maj + Z rendent l\'A5 ; avec le focus dans l\'éditeur, Ctrl + Z ne défait qu\'UN geste (pas de double annulation)',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, lines(2, 'Texte'));
        const start = page();
        OrientationToggle.selectFormat('A5');
        await h.sleep(120);
        const a5 = page();
        byId('btn-page-orientation').focus();
        if (document.activeElement !== byId('btn-page-orientation')) problems.push('le bouton Page n\'a pas pris le focus');
        if (!pressAt('z', document.activeElement)) problems.push('Ctrl + Z, focus sur le bouton Page : la touche n\'a pas été prise');
        await h.sleep(150);
        check(problems, 'Ctrl + Z, focus sur le bouton Page', page(), start);
        blurAll();
        if (!pressAt('y', document.body)) problems.push('Ctrl + Y, focus sur le corps : la touche n\'a pas été prise');
        await h.sleep(150);
        check(problems, 'Ctrl + Y, focus sur le corps', page(), a5);
        blurAll();
        pressAt('z', document.body);
        await h.sleep(150);
        blurAll();
        if (!pressAt('z', document.body, true)) problems.push('Ctrl + Maj + Z, focus sur le corps : la touche n\'a pas été prise');
        await h.sleep(150);
        check(problems, 'Ctrl + Maj + Z, focus sur le corps', page(), a5);
        // Dans l'éditeur la touche reste à TipTap : deux gestes de la page, UN Ctrl + Z n'en défait qu'un.
        OrientationToggle.selectOrientation('landscape');
        await h.sleep(120);
        const both = page();
        ed().commands.focus();
        await h.sleep(60);
        pressAt('z', ed().view.dom);
        await h.sleep(150);
        check(problems, 'Ctrl + Z dans l\'éditeur : un seul geste défait', { format: page().format, orientation: page().orientation }, { format: both.format, orientation: 'portrait' });
        return verdict(problems, { start: start.format, a5: a5.format });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_page_ctrl_z_leaves_text_fields_windows_and_reading_alone',
    description: 'Le format A5 posé : Ctrl + Z dans un champ de saisie (il y défait la frappe), sous une fenêtre ouverte (Réglages) et en Lecture (l\'éditeur n\'est pas à l\'écran) ne touche pas à la page et n\'est pas pris ; retour à l\'écran de l\'éditeur, il agit de nouveau',
    async run(h) {
      const problems = [];
      const input = document.createElement('input');
      try {
        await fresh(h, lines(2, 'Texte'));
        const start = page();
        OrientationToggle.selectFormat('A5');
        await h.sleep(120);
        const a5 = page();
        document.body.appendChild(input);
        input.focus();
        if (document.activeElement !== input) problems.push('le champ n\'a pas pris le focus');
        if (pressAt('z', input)) problems.push('Ctrl + Z dans un champ de saisie : la touche a été prise');
        await h.sleep(100);
        check(problems, 'Ctrl + Z dans un champ de saisie', page(), a5);
        input.remove();
        blurAll();
        byId('v2-btn-settings').click();
        await h.sleep(300);
        if (pressAt('z', document.activeElement || document.body)) problems.push('Ctrl + Z sous la fenêtre Réglages : la touche a été prise');
        await h.sleep(100);
        check(problems, 'Ctrl + Z sous la fenêtre Réglages', page(), a5);
        byId('settings-close').click();
        await h.sleep(200);
        blurAll();
        byId('btn-mode-read').click();
        await h.sleep(600);
        if (pressAt('z', document.body)) problems.push('Ctrl + Z en Lecture : la touche a été prise');
        await h.sleep(100);
        check(problems, 'Ctrl + Z en Lecture', page(), a5);
        byId('btn-mode-edit').click();
        await h.sleep(600);
        blurAll();
        if (!pressAt('z', document.body)) problems.push('Ctrl + Z, de retour en Édition : la touche n\'a pas été prise');
        await h.sleep(150);
        check(problems, 'Ctrl + Z, de retour en Édition', page(), start);
        return verdict(problems, {});
      } finally { input.remove(); byId('btn-mode-edit').click(); await h.sleep(300); await leave(h); }
    },
  });

  // Un composant dont les boutons gardent le focus et qui défait lui-même (le panneau Rechercher / Remplacer : Ctrl + Z sur « Remplacer » défait le remplacement et le focus RESTE sur le bouton) le dit par
  // `data-own-undo` : la touche lui reste, js/shortcuts.js ne la prend pas pour le bouton Annuler de la barre (qui, lui, met le focus dans l'éditeur).
  cases.push({
    id: 'undo_page_ctrl_z_stays_with_a_component_that_undoes_by_itself',
    description: 'Le format A5 posé, le focus sur un bouton d\'un composant `data-own-undo` : Ctrl + Z n\'est pas pris par le raccourci (la page reste A5, le focus reste sur le bouton) ; le même bouton hors de ce composant : Ctrl + Z rend l\'A4 et le focus passe à l\'éditeur ; le panneau Rechercher / Remplacer porte cette marque',
    async run(h) {
      const problems = [];
      const host = document.createElement('div');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Bouton';
      host.appendChild(button);
      try {
        await fresh(h, lines(2, 'Texte'));
        const start = page();
        OrientationToggle.selectFormat('A5');
        await h.sleep(120);
        const a5 = page();
        host.setAttribute('data-own-undo', '');
        document.body.appendChild(host);
        button.focus();
        if (document.activeElement !== button) problems.push('le bouton n\'a pas pris le focus');
        if (pressAt('z', button)) problems.push('Ctrl + Z sur un bouton d\'un composant data-own-undo : la touche a été prise');
        await h.sleep(100);
        check(problems, 'Ctrl + Z, composant data-own-undo', page(), a5);
        if (document.activeElement !== button) problems.push('le focus a quitté le bouton du composant');
        host.removeAttribute('data-own-undo');
        if (!pressAt('z', button)) problems.push('Ctrl + Z sur le même bouton hors du composant : la touche n\'a pas été prise');
        await h.sleep(150);
        check(problems, 'Ctrl + Z, bouton sans la marque', page(), start);
        if (!document.activeElement || !document.activeElement.closest('.ProseMirror')) problems.push('le focus n\'est pas passé à l\'éditeur');
        FindReplace.open({ replace: true });
        await h.sleep(100);
        const bar = byId('pp-find-bar');
        if (!bar || !bar.hasAttribute('data-own-undo')) problems.push('le panneau Rechercher / Remplacer ne porte pas data-own-undo');
        FindReplace.close({ focus: false });
        return verdict(problems, { start: start.format, a5: a5.format });
      } finally { host.remove(); if (FindReplace.isOpen()) FindReplace.close({ focus: false }); await leave(h); }
    },
  });

  // --- Le modèle enregistré ---

  cases.push({
    id: 'undo_page_is_written_by_the_autosave_with_the_template',
    description: 'Un modèle enregistré, son format changé puis défait par Ctrl + Z : l\'enregistrement automatique écrit la page DÉFAITE dans la colonne Margins (sans lui, le modèle gardait le format que la personne venait d\'annuler)',
    async run(h) {
      const problems = [];
      let id = null;
      try {
        await h.clickButton('btn-new');
        await h.sleep(300);
        await fresh(h, lines(4, 'Texte'));
        byId('template-name').value = 'Annuler la page';
        await h.clickButton('btn-save');
        await h.sleep(500);
        id = Templates.getCurrentId();
        OrientationToggle.selectFormat('A5');
        await h.sleep(2500 + 900);
        const written = JSON.parse(stub().getRow(TABLE, id).Margins || '{}');
        if (written.format !== 'A5') problems.push('l\'enregistrement automatique n\'a pas écrit l\'A5 : ' + JSON.stringify(written));
        undo();
        await h.sleep(2500 + 900);
        const undone = JSON.parse(stub().getRow(TABLE, id).Margins || '{}');
        if (undone.format !== 'A4') problems.push('après Ctrl + Z, la colonne Margins garde ' + JSON.stringify(undone.format));
        return verdict(problems, { written: written.format, undone: undone.format });
      } finally { await h.clickButton('btn-new'); await leave(h); }
    },
  });

  return cases;
})();
