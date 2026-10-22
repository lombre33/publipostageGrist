// Onglet Marges de Réglages (js/settings.js) : les quatre préréglages (Aucune, Étroites, Classiques, Larges : ceux de Word, en millimètres) et la chaîne « Lier les quatre marges »
// (demande d'Antoine du 22/10 : « des presets aucune, étroit, classique, large, et un bouton pour garder liées les quatre marges si on en change une »).
//
// Ces scénarios tournent DANS la page (clic() et événement `input` posés à la main) ; le script Node `marginPresetsMouse` (dev-tests/verify-margin-presets-mouse.mjs) refait le parcours à la vraie
// souris et au vrai clavier dans le panneau de 700x400 et mesure ce qui se voit. Ici : ce que chaque bouton pose, ce qui est enfoncé, ce que la chaîne change, et que PageLayout.boundedMarginsMm
// (ce qu'un préréglage « en place » veut dire sur une petite page) est exactement ce que setMarginsMm retient.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.marginPresets = (function () {
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const PRESET_IDS = ['none', 'narrow', 'classic', 'wide'];
  // Les nombres de Word, en mm : Étroites 1,27 cm, Classiques 2,54 cm (« Normal »), Larges 2,54 cm en haut et en bas et 5,08 cm de chaque côté.
  const EXPECTED = {
    none: { top: 0, right: 0, bottom: 0, left: 0 },
    narrow: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
    classic: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    wide: { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 },
  };

  const byId = id => document.getElementById(id);
  const field = side => byId('settings-margin-' + side);
  const preset = id => byId('settings-margin-preset-' + id);
  const link = () => byId('settings-margins-link');
  const near = (a, b, tolerance) => Math.abs(a - b) <= (tolerance === undefined ? 0.001 : tolerance);
  const sidesNear = (got, want, tolerance) => SIDES.every(side => near(got[side], want[side], tolerance));
  const fieldValues = () => SIDES.reduce((out, side) => { out[side] = parseFloat(field(side).value); return out; }, {});
  const pressedPresets = () => PRESET_IDS.filter(id => preset(id).getAttribute('aria-pressed') === 'true');
  const marginsOf = () => SIDES.reduce((out, side) => { out[side] = PageLayout.getMarginsMm()[side]; return out; }, {});
  const mmOf = px => px / PageLayout.MM_TO_PX;

  // Le brouillon repart des marges par défaut, la chaîne est relâchée (son état vit tant que la page est ouverte : un scénario ne le laisse pas au suivant), Réglages est ouvert sur l'onglet Marges.
  async function open(h, margins) {
    await h.resetEditor();
    h.setA4Preview(true);
    PageLayout.setMarginsMm(margins || null);
    await h.sleep(120);
    byId('v2-btn-settings').click();
    await h.sleep(100);
    document.querySelector('.settings-tab[data-settings-tab="pageMargins"]').click();
    if (link().getAttribute('aria-pressed') === 'true') link().click();
    await h.sleep(80);
  }
  function close() {
    if (link().getAttribute('aria-pressed') === 'true') link().click();
    byId('settings-close').click();
    PageLayout.setMarginsMm(null);
  }
  function type(side, text) {
    const input = field(side);
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // Compte les `pp:marginsChanged` (ce qui marque le modèle modifié et réveille l'enregistrement automatique).
  function countChanges() {
    const counter = { n: 0, stop() { document.removeEventListener('pp:marginsChanged', onChange); } };
    const onChange = () => { counter.n++; };
    document.addEventListener('pp:marginsChanged', onChange);
    return counter;
  }

  return [
    {
      id: 'margin_presets_each_button_poses_its_four_margins',
      description: 'Chaque préréglage pose ses quatre marges (Aucune 0, Étroites 12,7, Classiques 25,4, Larges 25,4 en haut et en bas et 50,8 de chaque côté), les quatre champs les montrent, l\'éditeur se remet en page, le modèle est marqué modifié, et seul ce bouton est enfoncé',
      async run(h) {
        await open(h);
        const counter = countChanges();
        const out = {};
        try {
          for (const id of PRESET_IDS) {
            const before = counter.n;
            preset(id).click();
            await h.sleep(120);
            const padding = getComputedStyle(h.tiptap());
            out[id] = {
              margins: marginsOf(), fields: fieldValues(), pressed: pressedPresets(), events: counter.n - before,
              screen: { top: mmOf(parseFloat(padding.paddingTop)), right: mmOf(parseFloat(padding.paddingRight)), bottom: mmOf(parseFloat(padding.paddingBottom)), left: mmOf(parseFloat(padding.paddingLeft)) },
            };
          }
        } finally { counter.stop(); close(); }
        const pass = PRESET_IDS.every(id => {
          const got = out[id];
          return sidesNear(got.margins, EXPECTED[id]) && sidesNear(got.fields, EXPECTED[id], 0.05) && sidesNear(got.screen, EXPECTED[id], 0.2)
            && got.pressed.length === 1 && got.pressed[0] === id && got.events === 1;
        });
        return { pass, notes: JSON.stringify(out) };
      },
    },
    {
      id: 'margin_presets_keep_the_rest_of_the_page',
      description: 'Un préréglage ne touche ni au sens, ni au format, ni au filigrane, ni aux couleurs du modèle : seules les quatre marges changent',
      async run(h) {
        await open(h);
        PageLayout.setFormat('A5');
        PageLayout.setOrientation('landscape');
        PageLayout.setWatermark({ text: 'BROUILLON' });
        PageLayout.setCustomColors(['#336699']);
        const before = JSON.parse(JSON.stringify(PageLayout.getMarginsMm()));
        preset('wide').click();
        await h.sleep(120);
        const after = PageLayout.getMarginsMm();
        const kept = after.orientation === before.orientation && after.format === before.format
          && JSON.stringify(after.watermark) === JSON.stringify(before.watermark) && JSON.stringify(after.colors) === JSON.stringify(before.colors);
        const changed = sidesNear(after, EXPECTED.wide);
        close();
        PageLayout.setOrientation('portrait');
        PageLayout.setFormat('A4');
        PageLayout.setWatermark(null);
        PageLayout.setCustomColors([]);
        return { pass: kept && changed && before.orientation === 'landscape' && before.format === 'A5', notes: 'avant=' + JSON.stringify(before) + ' apres=' + JSON.stringify(after) };
      },
    },
    {
      id: 'margin_presets_pressed_follows_the_margins',
      description: 'Le bouton enfoncé suit les marges : aucun avec les marges par défaut, aucun dès qu\'une marge est changée à la main, celui dont les quatre nombres sont saisis à la main (12,7 partout : Étroites) ; un préréglage déjà en place ne change rien et ne marque pas le modèle modifié',
      async run(h) {
        await open(h);
        const out = {};
        out.atStart = pressedPresets();
        SIDES.forEach(side => type(side, '12.7'));
        await h.sleep(80);
        out.byHand = pressedPresets();
        type('top', '13');
        await h.sleep(80);
        out.oneChanged = pressedPresets();
        preset('narrow').click();
        await h.sleep(80);
        out.clicked = pressedPresets();
        const counter = countChanges();
        const marginsBefore = JSON.stringify(PageLayout.getMarginsMm());
        preset('narrow').click();
        await h.sleep(80);
        out.again = { events: counter.n, same: JSON.stringify(PageLayout.getMarginsMm()) === marginsBefore, pressed: pressedPresets() };
        counter.stop();
        close();
        const pass = out.atStart.length === 0 && out.byHand.join() === 'narrow' && out.oneChanged.length === 0 && out.clicked.join() === 'narrow'
          && out.again.events === 0 && out.again.same && out.again.pressed.join() === 'narrow';
        return { pass, notes: JSON.stringify(out) };
      },
    },
    {
      id: 'margin_presets_on_a_small_page_stay_pressed',
      description: 'Sur une page trop petite pour un préréglage (A6 : 50,8 mm de chaque côté ne laissent pas 20 mm de texte), PageLayout le réduit et le bouton reste enfoncé : « en place » veut dire « ce que PageLayout poserait », pas « les nombres de la table »',
      async run(h) {
        await open(h);
        PageLayout.setFormat('A6');
        await h.sleep(120);
        const out = {};
        for (const id of ['wide', 'classic']) {
          preset(id).click();
          await h.sleep(100);
          out[id] = { margins: marginsOf(), pressed: pressedPresets(), bounded: PageLayout.boundedMarginsMm(EXPECTED[id]) };
        }
        PageLayout.setPageSize(70, 37);
        await h.sleep(120);
        preset('classic').click();
        await h.sleep(100);
        out.label = { margins: marginsOf(), pressed: pressedPresets(), bounded: PageLayout.boundedMarginsMm(EXPECTED.classic), content: { width: PageLayout.getContentWidthMm(), height: PageLayout.getContentHeightMm() } };
        close();
        PageLayout.setFormat('A4');
        const reduced = out.wide.margins.left < EXPECTED.wide.left && near(out.wide.margins.left + out.wide.margins.right, 85, 0.01);
        const pass = reduced && out.wide.pressed.join() === 'wide' && sidesNear(out.wide.margins, out.wide.bounded)
          && out.classic.pressed.join() === 'classic' && sidesNear(out.classic.margins, EXPECTED.classic)
          && out.label.pressed.join() === 'classic' && sidesNear(out.label.margins, out.label.bounded) && out.label.margins.top < EXPECTED.classic.top && near(out.label.content.height, PageLayout.MIN_CONTENT_MM, 0.01);
        return { pass, notes: JSON.stringify(out) };
      },
    },
    {
      id: 'margin_bounded_margins_are_what_setMarginsMm_keeps',
      description: 'PageLayout.boundedMarginsMm rend exactement ce que setMarginsMm retient (A4 portrait et paysage, A6, page libre, « Selon chaque modèle »), sans rien changer au brouillon',
      async run(h) {
        await open(h);
        const wanted = { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 };
        const pages = [
          ['A4 portrait', () => {}],
          ['A4 paysage', () => PageLayout.setOrientation('landscape')],
          ['A6', () => { PageLayout.setOrientation('portrait'); PageLayout.setFormat('A6'); }],
          ['page libre 70 x 37 mm', () => PageLayout.setPageSize(70, 37)],
          ['selon chaque modèle', () => { PageLayout.setFormat('A4'); PageLayout.setOrientationAuto(true); }],
        ];
        const out = {};
        let pass = true;
        for (const [name, arrange] of pages) {
          arrange();
          const before = JSON.stringify(PageLayout.getMarginsMm());
          const bounded = PageLayout.boundedMarginsMm(wanted);
          const untouched = JSON.stringify(PageLayout.getMarginsMm()) === before;
          PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), wanted));
          const kept = marginsOf();
          const same = sidesNear(bounded, kept, 1e-9);
          out[name] = { bounded, kept, untouched, same };
          if (!untouched || !same) pass = false;
        }
        PageLayout.setOrientationAuto(false);
        PageLayout.setOrientation('portrait');
        PageLayout.setFormat('A4');
        close();
        // Un côté absent garde celui d'à présent ; sans argument aucun, ce sont les marges d'à présent.
        PageLayout.setMarginsMm({ top: 11, right: 12, bottom: 13, left: 14 });
        const partial = PageLayout.boundedMarginsMm({ top: 30 });
        const partialOk = near(partial.top, 30) && near(partial.right, 12) && near(partial.bottom, 13) && near(partial.left, 14);
        PageLayout.setMarginsMm(null);
        return { pass: pass && partialOk, notes: JSON.stringify(out) + ' partiel=' + JSON.stringify(partial) };
      },
    },
    {
      id: 'margin_link_off_by_default_changes_one_margin_at_a_time',
      description: 'Sans la chaîne (état de départ), la saisie d\'une marge ne change que celle-là, comme avant ; le bouton de la chaîne est relâché (aria-pressed faux) au départ et son clic ne change aucune marge',
      async run(h) {
        await open(h, { top: 10, right: 11, bottom: 12, left: 13 });
        const counter = countChanges();
        const out = { startPressed: link().getAttribute('aria-pressed'), startClass: link().classList.contains('is-on') };
        link().click();
        await h.sleep(60);
        out.afterClick = { pressed: link().getAttribute('aria-pressed'), margins: marginsOf(), events: counter.n };
        link().click();
        await h.sleep(60);
        type('left', '30');
        await h.sleep(80);
        out.typed = marginsOf();
        counter.stop();
        close();
        const pass = out.startPressed === 'false' && !out.startClass && out.afterClick.pressed === 'true' && sidesNear(out.afterClick.margins, { top: 10, right: 11, bottom: 12, left: 13 }) && out.afterClick.events === 0
          && sidesNear(out.typed, { top: 10, right: 11, bottom: 12, left: 30 });
        return { pass, notes: JSON.stringify(out) };
      },
    },
    {
      id: 'margin_link_on_applies_the_typed_value_to_all_four',
      description: 'La chaîne enfoncée : la valeur saisie dans l\'un des quatre champs s\'applique aux quatre (champs, brouillon et mise en page de l\'éditeur), quel que soit le champ ; relâchée, la saisie ne change de nouveau que son champ ; une saisie vide ou négative ne change rien',
      async run(h) {
        await open(h, { top: 10, right: 11, bottom: 12, left: 13 });
        const out = {};
        link().click();
        await h.sleep(60);
        const counter = countChanges();
        for (const [side, value] of [['bottom', '18'], ['right', '22.5'], ['top', '7'], ['left', '0']]) {
          type(side, value);
          await h.sleep(80);
          out[side] = { margins: marginsOf(), fields: fieldValues() };
        }
        const padding = getComputedStyle(h.tiptap());
        out.screenLeft = mmOf(parseFloat(padding.paddingLeft));
        const before = JSON.stringify(marginsOf());
        type('top', '');
        type('top', '-4');
        await h.sleep(80);
        out.refused = { same: JSON.stringify(marginsOf()) === before, events: counter.n };
        link().click();
        await h.sleep(60);
        type('bottom', '40');
        await h.sleep(80);
        out.released = marginsOf();
        counter.stop();
        close();
        const pass = sidesNear(out.bottom.margins, { top: 18, right: 18, bottom: 18, left: 18 }) && sidesNear(out.bottom.fields, { top: 18, right: 18, bottom: 18, left: 18 }, 0.05)
          && sidesNear(out.right.margins, { top: 22.5, right: 22.5, bottom: 22.5, left: 22.5 }) && sidesNear(out.top.margins, { top: 7, right: 7, bottom: 7, left: 7 })
          && sidesNear(out.left.margins, { top: 0, right: 0, bottom: 0, left: 0 }) && sidesNear(out.left.fields, { top: 0, right: 0, bottom: 0, left: 0 }, 0.05) && near(out.screenLeft, 0, 0.2)
          && out.refused.same && out.refused.events === 4
          && sidesNear(out.released, { top: 0, right: 0, bottom: 40, left: 0 });
        return { pass, notes: JSON.stringify(out) };
      },
    },
    {
      id: 'margin_link_on_keeps_each_pair_printable',
      description: 'Liées, quatre marges démesurées restent bornées par paire (la largeur de contenu garde 20 mm au moins, la hauteur aussi) et les champs montrent ce que PageLayout retient, pas la saisie',
      async run(h) {
        await open(h);
        link().click();
        await h.sleep(60);
        type('top', '150');
        await h.sleep(100);
        const margins = marginsOf();
        const fields = fieldValues();
        const content = { width: PageLayout.getContentWidthMm(), height: PageLayout.getContentHeightMm() };
        close();
        const pass = margins.left + margins.right <= 190 + 0.01 && margins.top + margins.bottom <= 277 + 0.01 && content.width >= PageLayout.MIN_CONTENT_MM - 0.01
          && near(margins.left, margins.right) && near(margins.top, margins.bottom) && sidesNear(fields, margins, 0.05) && margins.left < 150;
        return { pass, notes: JSON.stringify({ margins, fields, content }) };
      },
    },
    {
      id: 'margin_link_released_by_an_unequal_preset',
      description: 'Une chaîne enfoncée est relâchée par « Larges » (quatre marges qui ne sont plus égales : la saisie suivante les écraserait toutes) et reste enfoncée avec « Aucune », « Étroites » et « Classiques » (quatre marges égales)',
      async run(h) {
        await open(h);
        const out = {};
        link().click();
        await h.sleep(60);
        for (const id of ['narrow', 'classic', 'none']) {
          preset(id).click();
          await h.sleep(60);
          out[id] = link().getAttribute('aria-pressed');
        }
        preset('wide').click();
        await h.sleep(80);
        out.wide = { link: link().getAttribute('aria-pressed'), on: link().classList.contains('is-on'), margins: marginsOf() };
        type('left', '45');
        await h.sleep(80);
        out.afterTyping = marginsOf();
        close();
        const pass = out.narrow === 'true' && out.classic === 'true' && out.none === 'true' && out.wide.link === 'false' && !out.wide.on && sidesNear(out.wide.margins, EXPECTED.wide)
          && sidesNear(out.afterTyping, { top: 25.4, right: 50.8, bottom: 25.4, left: 45 });
        return { pass, notes: JSON.stringify(out) };
      },
    },
    {
      id: 'margin_link_state_lives_while_the_page_is_open',
      description: 'La chaîne garde son état quand on ferme et rouvre Réglages (ouvrir Réglages ne change aucune marge) ; son icône dit l\'état (chaîne accrochée ou écartée) et son nom ne change pas',
      async run(h) {
        await open(h, { top: 10, right: 11, bottom: 12, left: 13 });
        const markup = () => link().innerHTML;
        const out = { name: link().getAttribute('aria-label'), off: markup() };
        link().click();
        await h.sleep(60);
        out.on = markup();
        out.nameOn = link().getAttribute('aria-label');
        byId('settings-close').click();
        await h.sleep(60);
        byId('v2-btn-settings').click();
        await h.sleep(100);
        document.querySelector('.settings-tab[data-settings-tab="pageMargins"]').click();
        out.reopened = { pressed: link().getAttribute('aria-pressed'), margins: marginsOf(), markup: markup() === out.on };
        close();
        const pass = out.off.length > 0 && out.on.length > 0 && out.off !== out.on && out.name === out.nameOn && out.name === 'Lier les quatre marges'
          && out.reopened.pressed === 'true' && out.reopened.markup && sidesNear(out.reopened.margins, { top: 10, right: 11, bottom: 12, left: 13 });
        return { pass, notes: JSON.stringify(out) };
      },
    },
    {
      id: 'margin_presets_texts_french',
      description: 'En français : « Aucune », « Étroites », « Classiques », « Larges » ; chaque info-bulle dit les nombres que le bouton pose (virgule décimale) ; la chaîne se nomme « Lier les quatre marges » et son info-bulle dit ce qu\'elle fait',
      async run(h) {
        await open(h);
        const labels = PRESET_IDS.map(id => preset(id).textContent.trim());
        const tips = PRESET_IDS.map(id => preset(id).title);
        const numbersOf = text => (text.match(/\d+(?:,\d+)?/g) || []).map(n => parseFloat(n.replace(',', '.')));
        const tipNumbers = {};
        PRESET_IDS.forEach(id => { tipNumbers[id] = numbersOf(preset(id).title); });
        const group = document.querySelector('.settings-margins-presets').getAttribute('aria-label');
        const out = { labels, tips, group, linkName: link().getAttribute('aria-label'), linkTip: link().title };
        close();
        // Les nombres de l'info-bulle sont ceux que le bouton pose : un nombre distinct de chaque préréglage, dans l'ordre haut, côtés.
        const tipsMatch = PRESET_IDS.every(id => {
          const values = Array.from(new Set(SIDES.map(side => EXPECTED[id][side])));
          return values.every(v => tipNumbers[id].includes(v)) && tipNumbers[id].every(n => values.includes(n));
        });
        const pass = labels.join('|') === 'Aucune|Étroites|Classiques|Larges' && tipsMatch && group === 'Préréglages de marges'
          && out.linkName === 'Lier les quatre marges' && out.linkTip === 'Lier les quatre marges : en changer une change les trois autres'
          && tips.every(tip => tip.includes('mm') && !/\d\.\d/.test(tip));
        return { pass, notes: JSON.stringify(out) };
      },
    },
    {
      id: 'margin_presets_texts_english',
      description: 'In English: "None", "Narrow", "Classic", "Wide"; each tooltip gives the numbers the button sets (decimal point); the chain is named "Link all four margins"',
      lang: 'en',
      async run(h) {
        await open(h);
        const labels = PRESET_IDS.map(id => preset(id).textContent.trim());
        const tips = PRESET_IDS.map(id => preset(id).title);
        const group = document.querySelector('.settings-margins-presets').getAttribute('aria-label');
        const out = { labels, tips, group, linkName: link().getAttribute('aria-label'), linkTip: link().title };
        close();
        const numbersOf = text => (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
        const tipsMatch = PRESET_IDS.every((id, at) => {
          const values = Array.from(new Set(SIDES.map(side => EXPECTED[id][side])));
          const found = numbersOf(tips[at]);
          return values.every(v => found.includes(v)) && found.every(n => values.includes(n));
        });
        const pass = labels.join('|') === 'None|Narrow|Classic|Wide' && tipsMatch && group === 'Margin presets'
          && out.linkName === 'Link all four margins' && out.linkTip === 'Link all four margins: changing one changes the other three' && tips.every(tip => !/\d,\d/.test(tip));
        return { pass, notes: JSON.stringify(out) };
      },
    },
  ];
})();
