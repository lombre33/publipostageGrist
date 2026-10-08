// Suite "colorPalette" - le menu de couleur de la barre d'outils et des barres flottantes (js/color-palette.js), la fenêtre « Couleur personnalisée » (js/color-dialog.js) et les rangées
// « Couleurs du modèle » (PageLayout, clé `colors` de la colonne Margins) et « Couleurs du document » (ligne réservée de la table des modèles, Templates.getDocumentSettings) de
// js/color-store.js. Demande d'Antoine du 08/10 : une palette plus moderne, un code # en plus du rouge-vert-bleu, un clic sur une couleur personnalisée qui marche, des couleurs
// personnalisées gardées par modèle et par document, sans table de plus. Les attendus sont ceux de la personne qui choisit une couleur :
//  1) le menu montre cinq rangées de dix couleurs, les rangées « Couleurs du modèle » et « Couleurs du document » et un pied ; la couleur de la sélection y est marquée ;
//  2) UN appui sur une pastille pose la couleur sur la sélection et referme le menu ;
//  3) « Personnalisé… » ouvre une fenêtre où le code, les trois champs, le carré et la teinte disent la même couleur ; « Appliquer » la pose, « Annuler » et Échap ne posent rien ;
//  4) la couleur composée se garde dans la rangée du modèle (cochée d'office) et/ou dans celle du document (à cocher), un appui sur sa pastille la pose, y compris deux fois de suite ;
//     la croix la retire sans rien poser ;
//  5) la rangée du modèle voyage avec le modèle (colonne Margins), borne ce qu'on lui donne et laisse un modèle d'avant se charger sans erreur ;
//  6) celle du document est la même pour tous les modèles, ne crée aucune table, n'est jamais un modèle de la liste, se relit quand une autre personne l'écrit et ne casse rien quand
//     Grist refuse l'écriture.
// Les calculs de couleur seuls sont dans unit-color-math.mjs ; le geste à la vraie souris, à 700x400 (menus entiers dans le panneau, carré qu'on glisse, croix sous le pointeur) dans
// verify-color-palette-mouse.mjs (colorPaletteMouse).
(function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const ed = () => EditorCore.getEditor();
  const stub = () => window.__gristStub;
  const $ = id => document.getElementById(id);
  const press = el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const release = el => el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  const text = el => (el ? el.textContent.trim() : null);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const menu = () => document.querySelector('.v2-color-dropdown.visible');
  const modal = () => $('pp-color-modal');
  const modalShown = () => !!modal() && modal().style.display !== 'none';
  const okButton = () => modal().querySelector('.pp-modal-actions .var-modal-primary');
  const cancelButton = () => modal().querySelector('.pp-modal-actions button:not(.var-modal-primary)');
  const chip = which => getComputedStyle(modal().querySelector('.pp-color-chip-' + which)).backgroundColor;
  const channels = () => Array.from(modal().querySelectorAll('.pp-color-number')).map(input => input.value);
  const typeInto = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const textColor = () => ColorMath.parseCss(ed().getAttributes('textStyle').color);
  const highlightColor = () => ColorMath.parseCss(ed().getAttributes('textStyle').backgroundColor);
  const swatchIn = (root, color) => root.querySelector('.cp-swatch[data-color="' + color + '"]');
  const rowOf = (root, scope) => root.querySelector('.cp-row[data-scope="' + (scope || 'model') + '"]');
  const rowColors = (root, scope) => Array.from(rowOf(root, scope).querySelectorAll('.cp-saved .cp-swatch')).map(button => button.dataset.color);
  const activeSwatches = root => Array.from(root.querySelectorAll('.cp-swatch.is-active')).map(button => button.dataset.color);
  const savedSwatch = (root, color, scope) => rowOf(root, scope).querySelector('.cp-swatch[data-color="' + color + '"]');
  const forgetButton = (root, color, scope) => root.querySelector('.cp-forget[data-action="forget:' + (scope || 'model') + ':' + color + '"]');
  // La ligne réservée aux réglages du document dans la table des modèles (ce que Grist garde) : ses lignes, une au plus.
  const settingsRows = () => { const t = stub().state.rows[TABLE]; return t && t.TypeModele ? t.id.filter((id, i) => t.TypeModele[i] === 'reglages').map(id => stub().getRow(TABLE, id)) : []; };
  const settingsJson = () => { const rows = settingsRows(); try { return rows.length ? JSON.parse(rows[0].Contenu) : null; } catch (e) { return 'illisible'; } };

  // Repart d'un modèle neuf (aucune couleur gardée) avec un texte sélectionné.
  async function setup(h, html) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    Editor.setHTML(html || '<p>Alpha Beta</p>');
    await h.sleep(150);
    await h.selectAllInEditor();
  }
  async function openMenu(h, caretId) {
    EditorCore.closeDropdownPanel();
    press($(caretId));
    await h.sleep(100);
    return menu();
  }
  // Ouvre la fenêtre par le pied du menu, comme le fait une personne ; rend la fenêtre (ou null).
  async function openDialog(h, caretId) {
    const m = await openMenu(h, caretId || 'v2-btn-text-color-caret');
    if (!m) return null;
    press(m.querySelector('.cp-custom'));
    await h.sleep(150);
    return modalShown() ? modal() : null;
  }
  // Les cases « garder » : cochée ou non, comme la personne les coche.
  function setKeep(on, scope) {
    const box = modal().querySelector('.pp-color-keep-row input[value="' + (scope || 'model') + '"]');
    if (box.checked !== on) { box.checked = on; box.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  async function apply(h) { okButton().click(); await h.sleep(150); }
  // Remet le document sans réglages : la ligne réservée retirée de la table (ce que ferait un document neuf), relue par les modèles.
  async function resetDocumentSettings() {
    if (!settingsRows().length && !Templates.getDocumentSettings().colors) return;
    for (const row of settingsRows()) await stub().applyUserActions([['RemoveRecord', TABLE, row.id]]);
    await Templates.loadAll();
  }
  async function cleanup(h) {
    if (modalShown()) cancelButton().click();
    EditorCore.closeDropdownPanel();
    I18n.setLang('fr');
    PageLayout.setMarginsMm(null);
    await h.resetEditor();
    await resetDocumentSettings();
  }
  // Compte les annonces d'un changement de brouillon (ce qui prévient l'enregistrement automatique).
  function listen() {
    const seen = [];
    const on = () => seen.push('marginsChanged');
    document.addEventListener('pp:marginsChanged', on);
    return { seen, stop: () => document.removeEventListener('pp:marginsChanged', on) };
  }

  // === Le menu ===

  cases.push({
    id: 'cp_menu_shows_five_rows_of_ten_the_model_row_and_the_footer_and_marks_the_color_of_the_selection',
    description: 'Le menu de la couleur de police montre une palette de cinq rangées de dix pastilles (des gris du noir au blanc, puis quatre tons), les rangées « Couleurs du modèle » et « Couleurs du document » (vides au départ, « Aucune » à côté du nom, une infobulle dit où elles vivent) et le pied « Personnalisé… » / « Par défaut » ; aucune pastille marquée sans couleur posée ; la couleur de la sélection y est marquée (une pastille de la palette, ou « Personnalisé… » quand elle n\'y est pas, écrite en #code ou en rgb())',
    run: async (h) => {
      try {
        await setup(h);
        const out = {};
        let m = await openMenu(h, 'v2-btn-text-color-caret');
        if (!m) return { pass: false, notes: 'le menu de la couleur de police ne s\'ouvre pas' };
        const swatches = Array.from(m.querySelectorAll('.cp-grid .cp-swatch'));
        const tops = Array.from(new Set(swatches.map(b => Math.round(b.getBoundingClientRect().top))));
        out.fifty = swatches.length === 50;
        out.fiveRowsOfTen = tops.length === 5 && tops.every(top => swatches.filter(b => Math.round(b.getBoundingClientRect().top) === top).length === 10);
        out.greysFirst = swatches[0].dataset.color === '#000000' && swatches[9].dataset.color === '#ffffff';
        out.named = swatches.every(b => b.title === b.dataset.color.toUpperCase() && b.getAttribute('aria-label') === b.title && b.getAttribute('aria-pressed') === 'false');
        out.paletteGroup = m.querySelector('.cp-grid').getAttribute('role') === 'group' && m.querySelector('.cp-grid').getAttribute('aria-label') === 'Palette de couleurs';
        const rows = Array.from(m.querySelectorAll('.cp-row'));
        out.rowLabels = same(rows.map(row => text(row.querySelector('.cp-row-label'))), ['Couleurs du modèle', 'Couleurs du document']) && same(rows.map(row => row.getAttribute('aria-label')), ['Couleurs du modèle', 'Couleurs du document']) && same(rows.map(row => row.dataset.scope), ['model', 'document']);
        out.rowHints = same(rows.map(row => row.querySelector('.cp-row-label').title), ['Avec ce modèle seulement', 'Pour tous les modèles de ce document, partagées avec l’équipe']);
        out.rowsEmpty = rows.length === 2 && rows.every(row => row.classList.contains('is-empty') && text(row.querySelector('.cp-row-empty')) === 'Aucune');
        out.footer = text(m.querySelector('.cp-custom')) === 'Personnalisé…' && text(m.querySelector('[data-action="none"]')) === 'Par défaut';
        out.nothingMarked = activeSwatches(m).length === 0 && !m.querySelector('.cp-custom.is-active');
        // Une couleur de la palette posée : sa pastille est marquée, elle seule.
        EditorCore.closeDropdownPanel();
        ed().chain().focus().selectAll().setTextColor('#15803d').run();
        await h.sleep(80);
        m = await openMenu(h, 'v2-btn-text-color-caret');
        out.paletteMarked = same(activeSwatches(m), ['#15803d']) && swatchIn(m, '#15803d').getAttribute('aria-pressed') === 'true' && !m.querySelector('.cp-custom.is-active');
        // Une couleur hors palette : « Personnalisé… » est marqué, aucune pastille.
        EditorCore.closeDropdownPanel();
        ed().chain().focus().selectAll().setTextColor('#123456').run();
        await h.sleep(80);
        m = await openMenu(h, 'v2-btn-text-color-caret');
        out.customMarked = activeSwatches(m).length === 0 && !!m.querySelector('.cp-custom.is-active');
        // La même couleur écrite en rgb() par le document (ce que le navigateur relit) se marque pareil.
        EditorCore.closeDropdownPanel();
        Editor.setHTML('<p><span style="color: rgb(21, 128, 61)">Alpha</span> Beta</p>');
        await h.sleep(120);
        await h.selectAllInEditor();
        ed().chain().focus().setTextSelection({ from: 1, to: 6 }).run();
        await h.sleep(80);
        m = await openMenu(h, 'v2-btn-text-color-caret');
        out.rgbMarked = same(activeSwatches(m), ['#15803d']);
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await cleanup(h); }
    },
  });

  cases.push({
    id: 'cp_one_press_on_a_swatch_sets_the_color_and_closes_the_menu_for_the_font_and_the_highlight',
    description: 'Un seul appui sur une pastille pose la couleur de police sur la sélection et referme le menu ; l\'icône de la barre rejoue ensuite la dernière couleur choisie ; même chose pour le surlignage ; « Par défaut » / « Aucun » retirent la couleur',
    run: async (h) => {
      try {
        await setup(h);
        const out = {};
        let m = await openMenu(h, 'v2-btn-text-color-caret');
        press(swatchIn(m, '#b91c1c'));
        await h.sleep(120);
        out.fontColor = textColor() === '#b91c1c';
        out.closed = menu() === null;
        out.selectionKept = !ed().state.selection.empty;
        // La couleur choisie est celle que rejoue l'icône de la barre.
        ed().chain().focus().selectAll().unsetTextColor().run();
        await h.sleep(60);
        out.removedByCommand = textColor() === null;
        press($('v2-btn-text-color'));
        await h.sleep(120);
        out.iconReplays = textColor() === '#b91c1c';
        // « Par défaut » retire la couleur de police.
        m = await openMenu(h, 'v2-btn-text-color-caret');
        press(m.querySelector('[data-action="none"]'));
        await h.sleep(120);
        out.defaultRemoves = textColor() === null && menu() === null;
        // Le surlignage.
        m = await openMenu(h, 'v2-btn-highlight-caret');
        out.highlightNone = text(m.querySelector('[data-action="none"]')) === 'Aucun';
        press(swatchIn(m, '#fff2a8'));
        await h.sleep(120);
        out.highlight = highlightColor() === '#fff2a8' && menu() === null;
        m = await openMenu(h, 'v2-btn-highlight-caret');
        out.highlightMarked = same(activeSwatches(m), ['#fff2a8']);
        press(m.querySelector('[data-action="none"]'));
        await h.sleep(120);
        out.highlightRemoved = highlightColor() === null && menu() === null;
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await cleanup(h); }
    },
  });

  // === La fenêtre « Couleur personnalisée » ===

  cases.push({
    id: 'cp_custom_dialog_applies_a_typed_hex_to_the_selection_and_keeps_it_in_the_model_row',
    description: '« Personnalisé… » referme le menu et ouvre la fenêtre (sans couleur de départ : le bleu d\'accent, pas de « Actuelle ») ; un code tapé sans # change l\'aperçu et les trois champs sans être réécrit ; « Appliquer » ferme la fenêtre, pose la couleur sur la sélection que le menu avait retenue, la garde dans la rangée du modèle (cochée d\'office) en prévenant l\'enregistrement une seule fois, et rend le focus à l\'éditeur ; le menu rouvert montre la couleur dans la rangée, marquée',
    run: async (h) => {
      const log = listen();
      try {
        await setup(h);
        const out = {};
        const m = await openMenu(h, 'v2-btn-text-color-caret');
        press(m.querySelector('.cp-custom'));
        await h.sleep(150);
        out.dialogOpens = modalShown();
        out.menuClosed = menu() === null;
        out.title = text($('pp-color-title')) === 'Couleur personnalisée';
        out.startsOnAccent = $('pp-color-hex').value === '#2F6FED';
        out.noCurrentChip = modal().querySelector('.pp-color-chip-before').closest('.pp-color-compare-cell').hidden === true;
        const keepRows = Array.from(modal().querySelectorAll('.pp-color-keep-row'));
        out.keepCheckedByDefault = same(keepRows.map(text), ['Couleurs du modèle', 'Couleurs du document']) && same(keepRows.map(row => row.querySelector('input').checked), [true, false]) && text(modal().querySelector('.pp-color-keep-legend')) === 'Garder cette couleur dans';
        out.keepHints = same(keepRows.map(row => row.title), ['Avec ce modèle seulement', 'Pour tous les modèles de ce document, partagées avec l’équipe']);
        out.hexFocused = document.activeElement === $('pp-color-hex');
        typeInto($('pp-color-hex'), '1e8449');
        out.preview = chip('after') === 'rgb(30, 132, 73)';
        out.channels = same(channels(), ['30', '132', '73']);
        out.hexNotRewrittenWhileTyping = $('pp-color-hex').value === '1e8449';
        okButton().click();
        await h.sleep(150);
        out.closed = !modalShown();
        out.applied = textColor() === '#1e8449';
        out.selectionKept = !ed().state.selection.empty;
        out.stored = same(PageLayout.getCustomColors(), ['#1e8449']);
        out.announcedOnce = log.seen.length === 1;
        out.editorFocused = ed().view.hasFocus();
        const reopened = await openMenu(h, 'v2-btn-text-color-caret');
        out.rowShows = same(rowColors(reopened), ['#1e8449']) && !rowOf(reopened).querySelector('.cp-row-empty') && same(rowColors(reopened, 'document'), []) && settingsRows().length === 0;
        out.rowMarked = same(activeSwatches(reopened), ['#1e8449']) && !reopened.querySelector('.cp-custom.is-active');
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { log.stop(); await cleanup(h); }
    },
  });

  cases.push({
    id: 'cp_custom_dialog_fields_stay_in_sync_and_an_unreadable_value_blocks_apply',
    description: 'Dans la fenêtre : le code (3 ou 6 chiffres, # facultatif, majuscules ou non), les trois champs rouge-vert-bleu (entiers de 0 à 255), le carré et la teinte donnent toujours la même couleur ; une valeur illisible marque son champ, dit comment l\'écrire et grise « Appliquer » (Entrée ne valide pas) sans changer l\'aperçu, et reste marquée quand on quitte le champ ; un champ lisible reprend la forme de la couleur à la sortie',
    run: async (h) => {
      try {
        await setup(h);
        const out = {};
        if (!(await openDialog(h))) return { pass: false, notes: 'la fenêtre ne s\'ouvre pas' };
        const hex = $('pp-color-hex');
        const hint = modal().querySelector('.pp-color-hint');
        const numbers = Array.from(modal().querySelectorAll('.pp-color-number'));
        const [red, green, blue] = numbers;
        const area = modal().querySelector('.pp-color-area');
        const hue = modal().querySelector('.pp-color-hue');
        // Trois chiffres : #1E8 -> #11EE88, sans réécrire le champ pendant la frappe, puis reprise de la forme à la sortie du champ.
        typeInto(hex, '#1E8');
        out.shortCode = chip('after') === 'rgb(17, 238, 136)' && same(channels(), ['17', '238', '136']) && hex.value === '#1E8';
        hex.dispatchEvent(new Event('change', { bubbles: true }));
        out.shapeOnLeave = hex.value === '#11EE88';
        // Illisible : cinq chiffres, une lettre hors a-f, vide.
        for (const bad of ['#12345', '#ggg', '', '#12']) {
          typeInto(hex, bad);
          const ok = hex.getAttribute('aria-invalid') === 'true' && okButton().disabled && text(hint) === '3 ou 6 chiffres, ex. #1E8449' && chip('after') === 'rgb(17, 238, 136)';
          if (!ok) out['bad ' + JSON.stringify(bad)] = false;
        }
        typeInto(hex, '#12');
        hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await h.sleep(60);
        out.enterRefused = modalShown();
        // Un code lisible rend la main à « Appliquer » et efface le message.
        typeInto(hex, '#0a0');
        out.recovers = !hex.hasAttribute('aria-invalid') && !okButton().disabled && text(hint) === '' && chip('after') === 'rgb(0, 170, 0)';
        // Un champ rouge-vert-bleu.
        typeInto(hex, '#102030');
        typeInto(red, '255');
        out.redChannel = hex.value === '#FF2030' && chip('after') === 'rgb(255, 32, 48)' && same(channels(), ['255', '32', '48']);
        for (const bad of ['300', '-1', '12.5', '']) {
          typeInto(green, bad);
          const ok = green.getAttribute('aria-invalid') === 'true' && okButton().disabled && chip('after') === 'rgb(255, 32, 48)';
          if (!ok) out['bad channel ' + JSON.stringify(bad)] = false;
        }
        typeInto(green, '200');
        out.channelRecovers = !green.hasAttribute('aria-invalid') && !okButton().disabled && hex.value === '#FFC830';
        // Quitter un champ illisible le laisse marqué (« Appliquer » reste grisé : un clic dessus ne pose pas en silence la couleur d'avant) ; une autre main sur la couleur le remet d'aplomb.
        typeInto(blue, '999');
        blue.dispatchEvent(new Event('change', { bubbles: true }));
        out.leaveKeepsInvalid = blue.value === '999' && blue.getAttribute('aria-invalid') === 'true' && okButton().disabled && chip('after') === 'rgb(255, 200, 48)';
        typeInto(hex, '#336699');
        out.otherFieldRestores = blue.value === '153' && !blue.hasAttribute('aria-invalid') && !okButton().disabled;
        // Le curseur de teinte et le carré (clavier) : le rouge pur, la teinte du vert, un cran de moins de saturation.
        typeInto(hex, '#ff0000');
        hue.value = '120';
        hue.dispatchEvent(new Event('input', { bubbles: true }));
        out.hue = hex.value === '#00FF00' && same(channels(), ['0', '255', '0']) && area.querySelector('.pp-color-thumb').style.left === '100%' && area.querySelector('.pp-color-thumb').style.top === '0%';
        out.areaValue = area.getAttribute('role') === 'slider' && area.getAttribute('aria-valuetext') === 'Saturation 100 %, luminosité 100 %';
        area.focus();
        area.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
        const [r1, g1, b1] = channels().map(Number);
        out.arrowLeft = g1 === 255 && r1 > 0 && r1 === b1 && r1 <= 4;
        area.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
        const g2 = Number(channels()[1]);
        out.shiftArrowDown = g2 === 230 || g2 === 229;
        // Un gris garde sa teinte : le curseur ne saute pas au rouge.
        typeInto(hex, '#00ff00');
        typeInto(hex, '#808080');
        out.greyKeepsHue = hue.value === '120';
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await cleanup(h); }
    },
  });

  cases.push({
    id: 'cp_custom_dialog_starts_from_the_current_color_and_cancel_escape_and_the_cross_change_nothing',
    description: 'Avec une couleur posée sur la sélection, la fenêtre s\'ouvre sur elle (« Actuelle » face à « Nouvelle », code et champs de cette couleur) ; « Annuler » et Échap la ferment sans rien poser ni garder ni prévenir l\'enregistrement ; le menu Bordures a le même chemin (testé à la souris)',
    run: async (h) => {
      const log = listen();
      try {
        await setup(h);
        const out = {};
        ed().chain().focus().selectAll().setTextColor('#b91c1c').run();
        await h.sleep(80);
        if (!(await openDialog(h))) return { pass: false, notes: 'la fenêtre ne s\'ouvre pas' };
        const before = modal().querySelector('.pp-color-chip-before').closest('.pp-color-compare-cell');
        out.currentShown = !before.hidden && chip('before') === 'rgb(185, 28, 28)' && text(before.querySelector('.pp-color-caption')) === 'Actuelle';
        out.newCaption = text(modal().querySelector('.pp-color-chip-after').closest('.pp-color-compare-cell').querySelector('.pp-color-caption')) === 'Nouvelle';
        out.startsOnCurrent = $('pp-color-hex').value === '#B91C1C' && chip('after') === 'rgb(185, 28, 28)' && same(channels(), ['185', '28', '28']);
        typeInto($('pp-color-hex'), '#0a5');
        out.beforeStays = chip('before') === 'rgb(185, 28, 28)' && chip('after') === 'rgb(0, 170, 85)';
        cancelButton().click();
        await h.sleep(120);
        out.cancelClosesAndKeeps = !modalShown() && textColor() === '#b91c1c' && same(PageLayout.getCustomColors(), []);
        // Échap.
        await openDialog(h);
        typeInto($('pp-color-hex'), '#0a5');
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await h.sleep(120);
        out.escapeClosesAndKeeps = !modalShown() && textColor() === '#b91c1c' && same(PageLayout.getCustomColors(), []);
        out.nothingAnnounced = log.seen.length === 0;
        out.editorFocused = ed().view.hasFocus();
        // Sans couleur posée, la fenêtre repart du bleu d'accent et cache « Actuelle » (la fenêtre garde la couleur de départ de l'ouverture d'avant : rien ne reste).
        ed().chain().focus().selectAll().unsetTextColor().run();
        await h.sleep(80);
        await openDialog(h);
        out.freshStart = $('pp-color-hex').value === '#2F6FED' && modal().querySelector('.pp-color-chip-before').closest('.pp-color-compare-cell').hidden === true;
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { log.stop(); await cleanup(h); }
    },
  });

  cases.push({
    id: 'cp_custom_dialog_keep_box_off_applies_without_keeping_and_the_choice_is_remembered',
    description: 'Case « Couleurs du modèle » décochée : « Appliquer » pose la couleur sans la garder ni prévenir l\'enregistrement ; la fenêtre rouverte garde la case décochée (qui compose plusieurs couleurs de suite ne recoche pas) ; recochée, la couleur se garde',
    run: async (h) => {
      const log = listen();
      try {
        await setup(h);
        const out = {};
        await openDialog(h);
        setKeep(false);
        typeInto($('pp-color-hex'), '#7c3aed');
        await apply(h);
        out.appliedNotKept = textColor() === '#7c3aed' && same(PageLayout.getCustomColors(), []) && log.seen.length === 0;
        await openDialog(h);
        out.remembered = modal().querySelector('.pp-color-keep-row input').checked === false;
        setKeep(true);
        typeInto($('pp-color-hex'), '#0e7490');
        await apply(h);
        out.keptWhenChecked = textColor() === '#0e7490' && same(PageLayout.getCustomColors(), ['#0e7490']) && log.seen.length === 1;
        await openDialog(h);
        out.rememberedChecked = modal().querySelector('.pp-color-keep-row input').checked === true;
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { log.stop(); await cleanup(h); }
    },
  });

  // === La rangée « Couleurs du modèle » ===

  cases.push({
    id: 'cp_model_row_swatch_sets_the_color_in_one_press_twice_and_the_same_color_composed_again_is_not_duplicated',
    description: 'Un appui sur une pastille de la rangée « Couleurs du modèle » pose la couleur et referme le menu, aussi une seconde fois de suite (après une autre couleur) ; composer de nouveau une couleur déjà gardée la pose et la remet en tête sans doublon',
    run: async (h) => {
      try {
        await setup(h);
        const out = {};
        PageLayout.setCustomColors(['#1e8449', '#7c3aed']);
        let m = await openMenu(h, 'v2-btn-text-color-caret');
        out.rowOrder = same(rowColors(m), ['#1e8449', '#7c3aed']);
        press(savedSwatch(m, '#7c3aed'));
        await h.sleep(120);
        out.firstPress = textColor() === '#7c3aed' && menu() === null;
        // Une autre couleur, puis la même couleur gardée de nouveau : elle se repose.
        m = await openMenu(h, 'v2-btn-text-color-caret');
        press(swatchIn(m, '#b91c1c'));
        await h.sleep(120);
        out.other = textColor() === '#b91c1c';
        m = await openMenu(h, 'v2-btn-text-color-caret');
        press(savedSwatch(m, '#7c3aed'));
        await h.sleep(120);
        out.secondPress = textColor() === '#7c3aed' && menu() === null;
        // La même pastille de la rangée, appuyée alors que la couleur est déjà posée : la couleur reste.
        m = await openMenu(h, 'v2-btn-text-color-caret');
        press(savedSwatch(m, '#7c3aed'));
        await h.sleep(120);
        out.alreadyThere = textColor() === '#7c3aed' && menu() === null;
        // Composer #7C3AED de nouveau dans la fenêtre : posée, en tête, sans doublon.
        await openDialog(h);
        setKeep(true);
        typeInto($('pp-color-hex'), '#7C3AED');
        await apply(h);
        out.composedAgain = textColor() === '#7c3aed' && same(PageLayout.getCustomColors(), ['#7c3aed', '#1e8449']);
        // Une couleur gardée à la main avec un code en majuscules ou illisible est écartée par le modèle, pas par le menu.
        out.colorStoreRefusesGarbage = ColorStore.add('model', 'rouge') === false && ColorStore.add('model', '#12345') === false && ColorStore.add('nowhere', '#aabbcc') === false;
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await cleanup(h); }
    },
  });

  cases.push({
    id: 'cp_model_row_keeps_ten_most_recent_first_and_the_cross_forgets_one_without_setting_a_color',
    description: 'La rangée garde dix couleurs au plus, la dernière ajoutée en tête (les plus anciennes s\'effacent) ; la croix d\'une pastille la retire de la rangée et du modèle, prévient l\'enregistrement une fois, laisse le menu ouvert et ne pose aucune couleur (la pastille voisine qui prend sa place non plus)',
    run: async (h) => {
      const log = listen();
      try {
        await setup(h);
        const out = {};
        const colors = Array.from({ length: 12 }, (_, i) => '#' + (0x100000 + i * 0x0b0b0b).toString(16).padStart(6, '0'));
        colors.forEach(color => ColorStore.add('model', color));
        const kept = PageLayout.getCustomColors();
        out.tenMostRecentFirst = kept.length === 10 && same(kept, colors.slice(2).reverse());
        out.max = ColorStore.MAX === 10 && PageLayout.CUSTOM_COLORS_MAX === 10;
        log.seen.length = 0;
        const m = await openMenu(h, 'v2-btn-text-color-caret');
        out.tenSwatches = rowColors(m).length === 10 && same(rowColors(m), kept);
        const third = kept[2];
        const cross = forgetButton(m, third);
        out.crossTitled = !!cross && cross.title === 'Retirer ' + third.toUpperCase() + ' de la liste' && cross.getAttribute('aria-label') === cross.title;
        press(cross);
        release(cross);
        await h.sleep(120);
        const after = menu();
        out.menuStaysOpen = !!after;
        out.rowWithoutIt = !!after && same(rowColors(after), kept.filter(color => color !== third));
        out.modelWithoutIt = same(PageLayout.getCustomColors(), kept.filter(color => color !== third));
        out.announcedOnce = log.seen.length === 1;
        out.nothingSet = textColor() === null;
        out.nineLeft = !!after && rowColors(after).length === 9;
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { log.stop(); await cleanup(h); }
    },
  });

  cases.push({
    id: 'cp_model_row_swatch_is_forgotten_with_delete_and_focus_moves_on',
    description: 'Au clavier, Suppr (ou Retour arrière) sur une pastille de la rangée la retire et rend le focus à la première couleur gardée qui reste ; la dernière retirée, le focus va à « Personnalisé… », la rangée redit « Aucune » et le modèle n\'a plus de clé `colors`',
    run: async (h) => {
      try {
        await setup(h);
        const out = {};
        PageLayout.setCustomColors(['#1e8449', '#7c3aed', '#0e7490']);
        const m = await openMenu(h, 'v2-btn-text-color-caret');
        const key = (el, name) => { const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }); el.dispatchEvent(event); return event.defaultPrevented; };
        const second = savedSwatch(m, '#7c3aed');
        second.focus();
        out.deleteHandled = key(second, 'Delete') === true;
        out.removed = same(PageLayout.getCustomColors(), ['#1e8449', '#0e7490']) && same(rowColors(menu()), ['#1e8449', '#0e7490']);
        out.focusOnFirst = document.activeElement === savedSwatch(menu(), '#1e8449');
        const first = savedSwatch(menu(), '#1e8449');
        out.backspaceHandled = key(first, 'Backspace') === true && same(PageLayout.getCustomColors(), ['#0e7490']);
        const lastOne = savedSwatch(menu(), '#0e7490');
        key(lastOne, 'Delete');
        out.empty = same(PageLayout.getCustomColors(), []) && text(rowOf(menu()).querySelector('.cp-row-empty')) === 'Aucune';
        out.focusOnCustom = document.activeElement === menu().querySelector('.cp-custom');
        out.noKey = !('colors' in PageLayout.getMarginsMm());
        // Suppr ailleurs que sur une couleur gardée ne retire rien.
        PageLayout.setCustomColors(['#1e8449']);
        const m2 = await openMenu(h, 'v2-btn-text-color-caret');
        const grey = swatchIn(m2, '#000000');
        grey.focus();
        key(grey, 'Delete');
        out.otherSwatchUntouched = same(PageLayout.getCustomColors(), ['#1e8449']);
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await cleanup(h); }
    },
  });

  // === Le réglage du modèle (PageLayout) ===

  cases.push({
    id: 'cp_model_colors_setting_is_bounded_clean_and_survives_the_other_page_settings',
    description: 'PageLayout.normalizeCustomColors ne garde que des #rrggbb (minuscules, sans doublon, dix au plus) et jette le reste sans erreur ; un modèle sans couleur n\'a aucune clé `colors` ; setCustomColors rend vrai seulement quand quelque chose change ; les couleurs survivent au sens, au format, aux marges et au filigrane (et l\'inverse) ; elles ne vont pas aux exports ; le JSON enregistré se relit',
    run: async (h) => {
      const problems = [];
      const eq = (label, got, want) => { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); };
      try {
        const n = PageLayout.normalizeCustomColors;
        eq('tri', n(['#1E8449', '#1e8449', 'red', '#12345', '#1234567', 5, null, '#FFF', ' #aabbcc', '#aabbcc']), ['#1e8449', '#aabbcc']);
        eq('pas une liste', [n('#aabbcc'), n({ 0: '#aabbcc' }), n(null), n(undefined), n(7)], [[], [], [], [], []]);
        eq('dix au plus', n(Array.from({ length: 14 }, (_, i) => '#0000' + (0x10 + i).toString(16))).length, 10);
        PageLayout.setMarginsMm(null);
        eq('clés sans couleur', Object.keys(PageLayout.getMarginsMm()), ['top', 'right', 'bottom', 'left', 'orientation', 'format']);
        eq('rien à lire', PageLayout.getCustomColors(), []);
        const events = [];
        const onAny = e => events.push(e.type);
        ['pp:marginsChanged', 'pp:pageLayoutChanged', 'pp:watermarkChanged'].forEach(type => document.addEventListener(type, onAny));
        try {
          eq('vide -> vide', PageLayout.setCustomColors([]), false);
          eq('rien de lisible -> rien', PageLayout.setCustomColors(['rouge', 5]), false);
          eq('premier ajout', PageLayout.setCustomColors(['#AABBCC', '#112233']), true);
          eq('même liste', PageLayout.setCustomColors(['#aabbcc', '#112233']), false);
          eq('lues en minuscules', PageLayout.getCustomColors(), ['#aabbcc', '#112233']);
          eq('une copie, pas le brouillon', (() => { PageLayout.getCustomColors().push('#000000'); return PageLayout.getCustomColors(); })(), ['#aabbcc', '#112233']);
          eq('aucune annonce de page', events, []);
        } finally {
          ['pp:marginsChanged', 'pp:pageLayoutChanged', 'pp:watermarkChanged'].forEach(type => document.removeEventListener(type, onAny));
        }
        eq('clé posée', Object.keys(PageLayout.getMarginsMm()).includes('colors'), true);
        // Survie aux autres réglages.
        PageLayout.setOrientation('landscape');
        PageLayout.setFormat('A5');
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { top: 30 }));
        PageLayout.setWatermark({ text: 'Confidentiel' });
        eq('après sens, format, marges et filigrane', PageLayout.getCustomColors(), ['#aabbcc', '#112233']);
        PageLayout.setWatermark(null);
        eq('après le retrait du filigrane', PageLayout.getCustomColors(), ['#aabbcc', '#112233']);
        PageLayout.setCustomColors(['#445566']);
        eq('le réglage de couleurs ne touche pas aux autres', [PageLayout.getFormat(), PageLayout.isLandscape(), PageLayout.getMarginsMm().top, PageLayout.getWatermark()], ['A5', true, 30, null]);
        // Ni les marges des moteurs ni les exports n'en savent rien.
        eq('exports', [Object.keys(PageLayout.getMarginsPt()).includes('colors'), Object.keys(PageLayout.getMarginsTwip()).includes('colors')], [false, false]);
        // Le JSON enregistré, relu ; un JSON abîmé.
        const stored = JSON.stringify(PageLayout.getMarginsMm());
        PageLayout.setMarginsMm(null);
        eq('remise à zéro', PageLayout.getCustomColors(), []);
        PageLayout.setMarginsMm(JSON.parse(stored));
        eq('relu', PageLayout.getCustomColors(), ['#445566']);
        PageLayout.setMarginsMm({ top: 12, right: 12, bottom: 12, left: 12, colors: 'rouge' });
        eq('JSON abîmé : un texte', PageLayout.getCustomColors(), []);
        PageLayout.setMarginsMm({ top: 12, right: 12, bottom: 12, left: 12, colors: ['#fff', 5, { c: 1 }, '#ABCDEF', '#abcdef'] });
        eq('JSON abîmé : des morceaux', PageLayout.getCustomColors(), ['#abcdef']);
        PageLayout.setMarginsMm({ top: 12, right: 12, bottom: 12, left: 12 });
        eq('modèle d\'avant ce réglage', [PageLayout.getCustomColors(), 'colors' in PageLayout.getMarginsMm()], [[], false]);
        // Le retrait de la dernière couleur enlève la clé.
        PageLayout.setCustomColors(['#445566']);
        PageLayout.setCustomColors([]);
        eq('dernière retirée : plus de clé', 'colors' in PageLayout.getMarginsMm(), false);
        // ColorStore : une annonce par changement, aucune pour une couleur déjà en tête.
        const seen = [];
        const onChange = () => seen.push(1);
        document.addEventListener('pp:marginsChanged', onChange);
        try {
          ColorStore.add('model', '#abcdef');
          ColorStore.add('model', '#ABCDEF');
          ColorStore.add('model', '#123456');
          ColorStore.add('model', '#abcdef');
          ColorStore.remove('model', '#00ff00');
          ColorStore.remove('model', '#123456');
        } finally { document.removeEventListener('pp:marginsChanged', onChange); }
        eq('annonces du magasin', seen.length, 4);
        eq('magasin : rangées', ColorStore.scopes().map(scope => [scope.id, scope.label, scope.colors]), [['model', 'Couleurs du modèle', ['#abcdef']], ['document', 'Couleurs du document', []]]);
      } finally { PageLayout.setMarginsMm(null); OrientationToggle.sync(); await h.resetEditor(); }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  // === Le modèle enregistré ===

  async function savedTemplate(h, nom, html, colors) {
    // « Nouveau » d'abord : sans lui, Enregistrer réécrirait le modèle précédent au lieu d'en créer un.
    await h.clickButton('btn-new');
    await h.sleep(300);
    await setup(h, html);
    PageLayout.setCustomColors(colors || []);
    $('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }
  async function selectTemplate(h, id) {
    const select = $('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(800);
  }

  cases.push({
    id: 'cp_model_colors_are_saved_with_the_template_and_old_or_damaged_json_load_cleanly',
    description: 'Les couleurs du modèle s\'enregistrent avec lui (clé `colors` de la colonne Margins, à côté du format et du sens) et reviennent à son chargement, dans la rangée du menu ; un autre modèle n\'a pas les mêmes ; un modèle d\'avant ce réglage et un JSON abîmé se chargent sans erreur',
    run: async (h) => {
      const problems = [];
      const errors = [];
      const onError = e => errors.push(e.message);
      window.addEventListener('error', onError);
      try {
        const withId = await savedTemplate(h, 'Couleurs présentes', '<p>Un modèle coloré</p>', ['#1e8449', '#7c3aed']);
        const withSaved = JSON.parse(stub().getRow(TABLE, withId).Margins || '{}');
        if (!same(withSaved.colors, ['#1e8449', '#7c3aed'])) problems.push('colonne Margins : ' + JSON.stringify(withSaved));
        if (withSaved.format !== 'A4' || withSaved.orientation !== 'portrait') problems.push('le format et le sens ne sont plus enregistrés : ' + JSON.stringify(withSaved));
        const plainId = await savedTemplate(h, 'Couleurs absentes', '<p>Un modèle nu</p>', null);
        const plainSaved = JSON.parse(stub().getRow(TABLE, plainId).Margins || '{}');
        if ('colors' in plainSaved) problems.push('un modèle sans couleur enregistre la clé : ' + JSON.stringify(plainSaved));
        // Retour au premier : les couleurs reviennent, dans la rangée du menu.
        await selectTemplate(h, withId);
        if (!same(PageLayout.getCustomColors(), ['#1e8449', '#7c3aed'])) problems.push('rechargé : ' + JSON.stringify(PageLayout.getCustomColors()));
        await h.selectAllInEditor();
        let m = await openMenu(h, 'v2-btn-text-color-caret');
        if (!m || !same(rowColors(m), ['#1e8449', '#7c3aed'])) problems.push('la rangée du menu après chargement : ' + JSON.stringify(m && rowColors(m)));
        EditorCore.closeDropdownPanel();
        // L'autre modèle n'a pas celles-ci.
        await selectTemplate(h, plainId);
        if (PageLayout.getCustomColors().length) problems.push('les couleurs restent en passant à un modèle qui n\'en a pas : ' + JSON.stringify(PageLayout.getCustomColors()));
        await h.selectAllInEditor();
        m = await openMenu(h, 'v2-btn-text-color-caret');
        if (!m || rowColors(m).length || !rowOf(m).querySelector('.cp-row-empty')) problems.push('la rangée du menu du modèle nu n\'est pas vide');
        EditorCore.closeDropdownPanel();
        // Modèle d'avant ce réglage : quatre marges, rien d'autre.
        stub().remoteWrite(TABLE, plainId, { Margins: JSON.stringify({ top: 12, right: 12, bottom: 12, left: 12 }) });
        await Templates.loadAll();
        await selectTemplate(h, withId);
        await selectTemplate(h, plainId);
        if (PageLayout.getCustomColors().length) problems.push('modèle d\'avant ce réglage : ' + JSON.stringify(PageLayout.getCustomColors()));
        // JSON abîmé : des morceaux -> les couleurs lisibles ; un texte -> aucune.
        stub().remoteWrite(TABLE, plainId, { Margins: JSON.stringify({ top: 15, right: 15, bottom: 15, left: 15, colors: ['#12', '#ABCDEF', 7, 'rouge'] }) });
        await Templates.loadAll();
        await selectTemplate(h, withId);
        await selectTemplate(h, plainId);
        if (!same(PageLayout.getCustomColors(), ['#abcdef'])) problems.push('JSON abîmé : ' + JSON.stringify(PageLayout.getCustomColors()));
        stub().remoteWrite(TABLE, plainId, { Margins: JSON.stringify({ top: 15, right: 15, bottom: 15, left: 15, colors: 'rouge' }) });
        await Templates.loadAll();
        await selectTemplate(h, withId);
        await selectTemplate(h, plainId);
        if (PageLayout.getCustomColors().length) problems.push('couleurs qui ne sont pas une liste : ' + JSON.stringify(PageLayout.getCustomColors()));
        if (errors.length) problems.push('erreurs JavaScript : ' + errors.join(' | '));
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      } finally {
        window.removeEventListener('error', onError);
        EditorCore.closeDropdownPanel();
        await h.clickButton('btn-new');
        await cleanup(h);
      }
    },
  });

  cases.push({
    id: 'cp_color_composed_in_the_dialog_is_written_with_the_template_by_the_autosave',
    description: 'Une couleur composée et gardée dans un modèle enregistré marque le brouillon modifié : l\'enregistrement automatique écrit la clé `colors` dans la colonne Margins du modèle, sans rien d\'autre à faire',
    run: async (h) => {
      const problems = [];
      let id = null;
      try {
        id = await savedTemplate(h, 'Couleurs autosave', '<p>Texte à colorer</p>', null);
        await h.selectAllInEditor();
        await openDialog(h);
        setKeep(true);
        typeInto($('pp-color-hex'), '#be185d');
        await apply(h);
        if (textColor() !== '#be185d') problems.push('couleur non posée : ' + textColor());
        await h.sleep(2500 + 900);
        const written = JSON.parse(stub().getRow(TABLE, id).Margins || '{}');
        if (!same(written.colors, ['#be185d'])) problems.push('colonne Margins après l\'auto-save : ' + JSON.stringify(written));
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      } finally { await h.clickButton('btn-new'); await cleanup(h); }
    },
  });

  // === Les autres menus, la langue ===

  cases.push({
    id: 'cp_highlight_and_table_fill_menus_share_the_palette_and_the_model_row_and_the_table_bar_comes_back_after_the_dialog',
    description: 'Le surlignage et le fond de cellule ont la même palette et la même rangée « Couleurs du modèle » que la police ; le fond propose « Aucun » ; depuis la barre du tableau, « Personnalisé… » puis « Appliquer » pose le fond sur la case et la barre du tableau revient (le curseur est resté dans la case)',
    run: async (h) => {
      try {
        await setup(h);
        const out = {};
        PageLayout.setCustomColors(['#1e8449']);
        const m = await openMenu(h, 'v2-btn-highlight-caret');
        out.highlight = m.querySelectorAll('.cp-grid .cp-swatch').length === 50 && same(rowColors(m), ['#1e8449']) && !!m.querySelector('.cp-custom');
        EditorCore.closeDropdownPanel();
        // La barre du tableau.
        await h.resetEditor();
        Editor.setHTML('<table><tbody><tr><td><p>Alpha</p></td><td><p>Beta</p></td></tr><tr><td><p>Gamma</p></td><td><p>Delta</p></td></tr></tbody></table><p>Après</p>');
        await h.sleep(200);
        ed().view.focus();
        let pos = -1;
        ed().state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text === 'Alpha') pos = p + 2; });
        ed().view.dispatch(ed().state.tr.setSelection(EditorCore.getTextSelectionClass().create(ed().state.doc, pos)));
        await h.sleep(150);
        const bar = () => Array.from(document.querySelectorAll('.v2-floating-toolbar')).find(el => el.querySelector('button[data-action="fill-open"]')) || null;
        const barShown = () => !!bar() && bar().classList.contains('visible');
        out.barShown = barShown();
        press(bar().querySelector('button[data-action="fill-open"]'));
        await h.sleep(120);
        const fill = menu();
        out.fill = !!fill && fill.querySelectorAll('.cp-grid .cp-swatch').length === 50 && same(rowColors(fill), ['#1e8449']) && text(fill.querySelector('[data-action="none"]')) === 'Aucun';
        press(fill.querySelector('.cp-custom'));
        await h.sleep(150);
        out.dialogOpens = modalShown() && menu() === null;
        setKeep(true);
        typeInto($('pp-color-hex'), '#0369a1');
        await apply(h);
        out.filled = /background-color: rgb\(3, 105, 161\)/.test(Editor.getHTML());
        out.keptInRow = same(PageLayout.getCustomColors(), ['#0369a1', '#1e8449']);
        out.barBack = barShown();
        out.editorFocused = ed().view.hasFocus();
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await cleanup(h); }
    },
  });

  cases.push({
    id: 'cp_menu_and_dialog_follow_the_interface_language',
    description: 'En anglais : « Template colors », « Document colors », « None », « Custom… », « Default », « Color palette » dans le menu ; la fenêtre en anglais (Current, New, Hex code, R, G, B, Keep this color in, Apply, Cancel, message du code) ; la croix d\'une couleur gardée dit « Remove #… from the list » ; le français revient ensuite',
    run: async (h) => {
      try {
        await setup(h);
        const out = {};
        I18n.setLang('en');
        await h.sleep(120);
        PageLayout.setCustomColors(['#1e8449']);
        const m = await openMenu(h, 'v2-btn-text-color-caret');
        out.menu = same(Array.from(m.querySelectorAll('.cp-row-label')).map(text), ['Template colors', 'Document colors']) && text(m.querySelector('.cp-custom')) === 'Custom…' && text(m.querySelector('[data-action="none"]')) === 'Default' && m.querySelector('.cp-grid').getAttribute('aria-label') === 'Color palette';
        out.cross = forgetButton(m, '#1e8449').title === 'Remove #1E8449 from the list';
        EditorCore.closeDropdownPanel();
        PageLayout.setCustomColors([]);
        const empty = await openMenu(h, 'v2-btn-text-color-caret');
        out.empty = same(Array.from(empty.querySelectorAll('.cp-row-empty')).map(text), ['None', 'None']) && same(Array.from(empty.querySelectorAll('.cp-row-label')).map(el => el.title), ['With this template only', 'For every template in this document, shared with the team']);
        press(empty.querySelector('.cp-custom'));
        await h.sleep(150);
        out.dialogOpens = modalShown();
        out.title = text($('pp-color-title')) === 'Custom color';
        out.labels = text(modal().querySelector('label[for="pp-color-hex"]')) === 'Hex code'
          && same(Array.from(modal().querySelectorAll('.pp-color-channel-name')).map(text), ['R', 'G', 'B'])
          && same(Array.from(modal().querySelectorAll('.pp-color-number')).map(input => input.getAttribute('aria-label')), ['Red', 'Green', 'Blue'])
          && text(modal().querySelector('.pp-color-chip-after').closest('.pp-color-compare-cell').querySelector('.pp-color-caption')) === 'New'
          && text(modal().querySelector('.pp-color-keep-legend')) === 'Keep this color in'
          && same(Array.from(modal().querySelectorAll('.pp-color-keep-row')).map(text), ['Template colors', 'Document colors'])
          && text(okButton()) === 'Apply' && text(cancelButton()) === 'Cancel';
        out.areaLabels = modal().querySelector('.pp-color-area').getAttribute('aria-label') === 'Saturation and brightness' && modal().querySelector('.pp-color-hue').getAttribute('aria-label') === 'Hue';
        typeInto($('pp-color-hex'), '#12');
        out.hint = text(modal().querySelector('.pp-color-hint')) === '3 or 6 hex digits, e.g. #1E8449';
        // Le français revient à la prochaine ouverture.
        cancelButton().click();
        await h.sleep(100);
        I18n.setLang('fr');
        await h.sleep(120);
        await openDialog(h);
        out.french = text($('pp-color-title')) === 'Couleur personnalisée' && text(okButton()) === 'Appliquer' && text(modal().querySelector('label[for="pp-color-hex"]')) === 'Code hexadécimal' && text(modal().querySelector('.pp-color-hint')) === '';
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await cleanup(h); }
    },
  });


  // === La rangée « Couleurs du document » ===

  // Remet les cases « garder » de la fenêtre comme au départ (modèle coché, document décoché) : la fenêtre s'en souvient d'une ouverture à l'autre, d'un cas à l'autre.
  async function resetKeepBoxes(h) {
    if (!(await openDialog(h))) return;
    setKeep(true, 'model');
    setKeep(false, 'document');
    cancelButton().click();
    await h.sleep(60);
  }
  const keyOn = (el, name) => { const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }); el.dispatchEvent(event); return event.defaultPrevented; };
  // Ajoutes déjà écrites dans la table des modèles pour la ligne réservée (AddRecord) : une seule, jamais une par couleur.
  const settingsAdds = () => stub().getActionLog().filter(a => a[0] === 'AddRecord' && a[1] === TABLE && a[3] && a[3].TypeModele === 'reglages').length;

  cases.push({
    id: 'cp_document_color_composed_in_the_dialog_is_kept_in_a_reserved_row_of_the_models_table_and_no_table_is_created',
    description: 'Dans la fenêtre, la case « Couleurs du document » (décochée d\'office) garde la couleur pour tout le document : le texte la prend, elle est tout de suite dans la rangée du document (pas dans celle du modèle, aucune annonce d\'enregistrement du modèle), puis dans UNE ligne réservée de la table des modèles (TypeModele = reglages, JSON dans Contenu) - aucune table n\'est créée ; la ligne n\'est jamais un modèle de la liste ; une pastille du document pose la couleur en un appui et referme le menu ; sa croix la retire du document seulement, sans rien poser, menu ouvert, et la ligne se met à jour',
    run: async (h) => {
      const log = listen();
      try {
        await setup(h);
        const out = {};
        stub().clearActionLog();
        const tablesBefore = Object.keys(stub().state.rows).sort();
        out.noRowAtFirst = settingsRows().length === 0;
        await openDialog(h);
        setKeep(false, 'model');
        setKeep(true, 'document');
        typeInto($('pp-color-hex'), '#0b6e4f');
        await apply(h);
        out.applied = textColor() === '#0b6e4f';
        out.immediately = same(Templates.getDocumentSettings().colors, ['#0b6e4f']);
        await h.sleep(250);
        out.modelUntouched = same(PageLayout.getCustomColors(), []) && log.seen.length === 0;
        out.oneRow = settingsRows().length === 1 && settingsRows()[0].Nom === 'Réglages du document' && same(settingsJson(), { colors: ['#0b6e4f'] });
        out.noTable = stub().countActions('AddTable') === 0 && same(Object.keys(stub().state.rows).sort(), tablesBefore);
        await Templates.loadAll();
        out.notATemplate = !Templates.getCached().some(t => t.typeModele === 'reglages' || t.id === settingsRows()[0].id) && !Array.from($('template-select').options).some(option => /Réglages du document/.test(option.textContent));
        out.stillThere = same(Templates.getDocumentSettings().colors, ['#0b6e4f']);
        // Le menu rouvert : la rangée du document a la couleur (marquée, elle n'est pas dans la palette), celle du modèle est vide.
        let m = await openMenu(h, 'v2-btn-text-color-caret');
        out.rows = same(rowColors(m, 'document'), ['#0b6e4f']) && !rowOf(m, 'document').classList.contains('is-empty') && rowOf(m, 'model').classList.contains('is-empty');
        out.marked = same(activeSwatches(m), ['#0b6e4f']);
        // Un appui sur sa pastille la pose.
        EditorCore.closeDropdownPanel();
        ed().chain().focus().selectAll().unsetTextColor().run();
        await h.sleep(60);
        m = await openMenu(h, 'v2-btn-text-color-caret');
        press(savedSwatch(m, '#0b6e4f', 'document'));
        await h.sleep(120);
        out.pressSets = textColor() === '#0b6e4f' && menu() === null;
        // Sa croix la retire du document, sans rien poser, menu ouvert.
        ed().chain().focus().selectAll().unsetTextColor().run();
        await h.sleep(60);
        m = await openMenu(h, 'v2-btn-text-color-caret');
        const cross = forgetButton(m, '#0b6e4f', 'document');
        out.crossTitled = !!cross && cross.title === 'Retirer #0B6E4F de la liste';
        press(cross);
        release(cross);
        await h.sleep(250);
        out.crossForgets = !!menu() && same(rowColors(menu(), 'document'), []) && rowOf(menu(), 'document').classList.contains('is-empty') && !('colors' in Templates.getDocumentSettings());
        out.crossSetsNothing = textColor() === null;
        out.rowUpdated = settingsRows().length === 1 && same(settingsJson(), {});
        out.nothingAnnounced = log.seen.length === 0;
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { log.stop(); await resetKeepBoxes(h); await cleanup(h); }
    },
  });

  cases.push({
    id: 'cp_color_can_be_kept_in_both_rows_and_each_box_is_remembered',
    description: 'Les deux cases cochées : la couleur va dans la rangée du modèle ET dans celle du document ; la fenêtre rouverte garde les cases comme on les a laissées (chacune pour elle-même) ; décochées toutes les deux, la couleur se pose sans rien garder nulle part',
    run: async (h) => {
      const log = listen();
      try {
        await setup(h);
        const out = {};
        const boxes = () => Array.from(modal().querySelectorAll('.pp-color-keep-row input')).map(box => box.checked);
        await openDialog(h);
        setKeep(true, 'model');
        setKeep(true, 'document');
        typeInto($('pp-color-hex'), '#0b6e4f');
        await apply(h);
        await h.sleep(250);
        out.both = same(PageLayout.getCustomColors(), ['#0b6e4f']) && same(Templates.getDocumentSettings().colors, ['#0b6e4f']) && same(settingsJson(), { colors: ['#0b6e4f'] }) && log.seen.length === 1;
        await openDialog(h);
        out.remembered = same(boxes(), [true, true]);
        setKeep(false, 'model');
        typeInto($('pp-color-hex'), '#7a1f5c');
        await apply(h);
        await h.sleep(250);
        out.documentOnly = same(PageLayout.getCustomColors(), ['#0b6e4f']) && same(Templates.getDocumentSettings().colors, ['#7a1f5c', '#0b6e4f']) && log.seen.length === 1;
        await openDialog(h);
        out.rememberedAgain = same(boxes(), [false, true]);
        setKeep(false, 'document');
        typeInto($('pp-color-hex'), '#445566');
        await apply(h);
        await h.sleep(250);
        out.neither = textColor() === '#445566' && same(PageLayout.getCustomColors(), ['#0b6e4f']) && same(Templates.getDocumentSettings().colors, ['#7a1f5c', '#0b6e4f']) && log.seen.length === 1;
        await openDialog(h);
        out.rememberedNeither = same(boxes(), [false, false]);
        cancelButton().click();
        await h.sleep(60);
        // Le même code gardé de nouveau dans le document le remet en tête, sans doublon.
        ColorStore.add('document', '#0b6e4f');
        out.noDuplicate = same(Templates.getDocumentSettings().colors, ['#0b6e4f', '#7a1f5c']);
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { log.stop(); await resetKeepBoxes(h); await cleanup(h); }
    },
  });

  cases.push({
    id: 'cp_document_colors_are_the_same_for_every_template_while_model_colors_follow_each_template',
    description: 'Deux modèles enregistrés : chacun a SES couleurs du modèle, les deux ont les MÊMES couleurs du document (une seule ligne réservée, jamais dans la liste des modèles) ; revenir au premier les retrouve telles quelles',
    run: async (h) => {
      const problems = [];
      try {
        const first = await savedTemplate(h, 'Charte A', '<p>Texte A</p>', ['#111111']);
        ColorStore.add('document', '#0b6e4f');
        ColorStore.add('document', '#7a1f5c');
        await h.sleep(300);
        const second = await savedTemplate(h, 'Charte B', '<p>Texte B</p>', ['#222222', '#333333']);
        await h.selectAllInEditor();
        let m = await openMenu(h, 'v2-btn-text-color-caret');
        if (!m || !same(rowColors(m), ['#222222', '#333333']) || !same(rowColors(m, 'document'), ['#7a1f5c', '#0b6e4f'])) problems.push('second modèle : ' + JSON.stringify(m && [rowColors(m), rowColors(m, 'document')]));
        EditorCore.closeDropdownPanel();
        await selectTemplate(h, first);
        await h.selectAllInEditor();
        m = await openMenu(h, 'v2-btn-text-color-caret');
        if (!m || !same(rowColors(m), ['#111111']) || !same(rowColors(m, 'document'), ['#7a1f5c', '#0b6e4f'])) problems.push('premier modèle : ' + JSON.stringify(m && [rowColors(m), rowColors(m, 'document')]));
        EditorCore.closeDropdownPanel();
        if (settingsRows().length !== 1) problems.push('lignes réservées : ' + settingsRows().length);
        const names = Templates.getCached().map(t => t.nom);
        if (!names.includes('Charte A') || !names.includes('Charte B') || names.includes('Réglages du document')) problems.push('liste des modèles : ' + JSON.stringify(names));
        if (String(first) === String(second)) problems.push('les deux modèles ont le même identifiant');
        // Les couleurs du document ne vont pas dans la colonne Margins d'un modèle.
        const margins = JSON.parse(stub().getRow(TABLE, second).Margins || '{}');
        if (!same(margins.colors, ['#222222', '#333333'])) problems.push('colonne Margins du second : ' + JSON.stringify(margins));
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      } finally { EditorCore.closeDropdownPanel(); await h.clickButton('btn-new'); await cleanup(h); }
    },
  });

  cases.push({
    id: 'cp_document_colors_written_by_another_person_appear_at_the_next_reading_and_other_keys_are_kept',
    description: 'Une autre personne écrit la ligne réservée : ses couleurs du document apparaissent à la lecture suivante des modèles (pas avant) ; une écriture de ce widget garde les autres clés de la ligne ; dix couleurs au plus, la dernière en tête ; douze ajouts de suite n\'écrivent qu\'UNE ligne',
    run: async (h) => {
      try {
        await setup(h);
        const out = {};
        stub().clearActionLog();
        const colors = Array.from({ length: 12 }, (_, i) => '#' + (0x200000 + i * 0x0a0a0a).toString(16).padStart(6, '0'));
        colors.forEach(color => ColorStore.add('document', color));
        await h.sleep(350);
        out.tenMostRecentFirst = same(Templates.getDocumentSettings().colors, colors.slice(2).reverse()) && same(settingsJson(), { colors: colors.slice(2).reverse() });
        out.oneRowForTwelveAdds = settingsRows().length === 1 && settingsAdds() === 1;
        const rowId = settingsRows()[0].id;
        stub().remoteWrite(TABLE, rowId, { Contenu: JSON.stringify({ colors: ['#223344', '#0b6e4f'], autre: 1 }) });
        let m = await openMenu(h, 'v2-btn-text-color-caret');
        out.notBeforeReading = same(rowColors(m, 'document'), colors.slice(2).reverse());
        EditorCore.closeDropdownPanel();
        await Templates.loadAll();
        m = await openMenu(h, 'v2-btn-text-color-caret');
        out.appears = same(rowColors(m, 'document'), ['#223344', '#0b6e4f']);
        EditorCore.closeDropdownPanel();
        ColorStore.add('document', '#556677');
        await h.sleep(250);
        out.keepsOtherKeys = same(settingsJson(), { colors: ['#556677', '#223344', '#0b6e4f'], autre: 1 }) && settingsRows().length === 1 && settingsAdds() === 1;
        // La ligne écrite à la main et abîmée ne casse rien : aucune couleur, aucune erreur, puis une écriture la remplace.
        stub().remoteWrite(TABLE, rowId, { Contenu: '{pas du json' });
        await Templates.loadAll();
        m = await openMenu(h, 'v2-btn-text-color-caret');
        out.damagedReadsAsEmpty = same(rowColors(m, 'document'), []) && rowOf(m, 'document').classList.contains('is-empty');
        EditorCore.closeDropdownPanel();
        ColorStore.add('document', '#112233');
        await h.sleep(250);
        out.damagedReplaced = same(settingsJson(), { colors: ['#112233'] }) && settingsRows().length === 1;
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await cleanup(h); }
    },
  });

  cases.push({
    id: 'cp_document_color_write_refused_by_grist_leaves_the_text_colored_and_the_row_as_it_was_without_errors',
    description: 'Grist refuse d\'écrire la ligne réservée (droit d\'écriture absent) : la couleur est posée sur le texte quand même, la rangée du document revient à l\'état que Grist a confirmé, aucune erreur JavaScript ; Grist revenu, une couleur suivante s\'écrit',
    run: async (h) => {
      const errors = [];
      const onError = e => errors.push(e.message);
      window.addEventListener('error', onError);
      const real = grist.docApi.applyUserActions;
      try {
        await setup(h);
        const out = {};
        ColorStore.add('document', '#0b6e4f');
        await h.sleep(250);
        const rowId = settingsRows()[0].id;
        grist.docApi.applyUserActions = async (actions) => {
          if (actions.some(a => a[0] === 'UpdateRecord' && a[1] === TABLE && a[2] === rowId)) { await h.sleep(400); throw new Error('Droit d\'écriture refusé'); }
          return real.call(grist.docApi, actions);
        };
        await openDialog(h);
        setKeep(false, 'model');
        setKeep(true, 'document');
        typeInto($('pp-color-hex'), '#7a1f5c');
        await apply(h);
        out.applied = textColor() === '#7a1f5c';
        out.optimistic = same(Templates.getDocumentSettings().colors, ['#7a1f5c', '#0b6e4f']);
        await h.sleep(600);
        out.reverted = same(Templates.getDocumentSettings().colors, ['#0b6e4f']) && same(settingsJson(), { colors: ['#0b6e4f'] });
        const m = await openMenu(h, 'v2-btn-text-color-caret');
        out.menuShowsConfirmed = same(rowColors(m, 'document'), ['#0b6e4f']);
        EditorCore.closeDropdownPanel();
        grist.docApi.applyUserActions = real;
        ColorStore.add('document', '#445566');
        await h.sleep(300);
        out.laterWriteWorks = same(settingsJson(), { colors: ['#445566', '#0b6e4f'] });
        out.noError = errors.length === 0;
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + errors.join(' | ') };
      } finally {
        grist.docApi.applyUserActions = real;
        window.removeEventListener('error', onError);
        await resetKeepBoxes(h);
        await cleanup(h);
      }
    },
  });

  cases.push({
    id: 'cp_document_row_swatch_is_forgotten_with_delete_and_focus_moves_on',
    description: 'Au clavier, Suppr sur une pastille de la rangée du document la retire du document (pas du modèle) et rend le focus à la première couleur gardée qui reste ; la dernière retirée, le focus va à « Personnalisé… » et la rangée redit « Aucune »',
    run: async (h) => {
      try {
        await setup(h);
        const out = {};
        PageLayout.setCustomColors(['#111111']);
        ['#0e7490', '#7c3aed', '#1e8449'].forEach(color => ColorStore.add('document', color));
        await h.sleep(250);
        const m = await openMenu(h, 'v2-btn-text-color-caret');
        const second = savedSwatch(m, '#7c3aed', 'document');
        second.focus();
        out.deleteHandled = keyOn(second, 'Delete') === true;
        out.removed = same(Templates.getDocumentSettings().colors, ['#1e8449', '#0e7490']) && same(rowColors(menu(), 'document'), ['#1e8449', '#0e7490']);
        out.modelKept = same(PageLayout.getCustomColors(), ['#111111']) && same(rowColors(menu()), ['#111111']);
        out.focusOnFirstSaved = document.activeElement === savedSwatch(menu(), '#111111', 'model');
        PageLayout.setCustomColors([]);
        EditorCore.closeDropdownPanel();
        const m2 = await openMenu(h, 'v2-btn-text-color-caret');
        keyOn(savedSwatch(m2, '#1e8449', 'document'), 'Backspace');
        out.backspace = same(Templates.getDocumentSettings().colors, ['#0e7490']) && document.activeElement === savedSwatch(menu(), '#0e7490', 'document');
        keyOn(savedSwatch(menu(), '#0e7490', 'document'), 'Delete');
        out.emptied = !('colors' in Templates.getDocumentSettings()) && text(rowOf(menu(), 'document').querySelector('.cp-row-empty')) === 'Aucune' && document.activeElement === menu().querySelector('.cp-custom');
        await h.sleep(250);
        out.rowWritten = same(settingsJson(), {});
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await cleanup(h); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.colorPalette = cases;
})();
