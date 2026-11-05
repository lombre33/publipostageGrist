// Suite "imageCondition" - la condition d'affichage d'une image liée à une colonne Pièces jointes (retour d'Antoine du 05/11 : « de manière globale on manque des outils de gestion d'une
// variable quand c'est une image (conditions, changement d'attribut etc...) » ; sa réponse à la carte : « Condition, boucle, ligne liée », la condition d'abord). L'attribut `condition` du
// nœud editorImage (js/editor-nodes.js : écrit en data-condition sur l'<img> d'une image de variable seulement), le bouton « Condition d'affichage » de la barre de l'image
// (js/floating-toolbars.js : grisé avec sa raison hors image de colonne, allumé quand une condition est posée), la fenêtre de condition partagée avec les bulles et les blocs
// (js/variable-condition.js, TEXTS.editorImage), le cadre en pointillés bleus avec sa ligne « Si … » (css/editor-v2.css), la Lecture et les exports qui retirent l'image dont la
// condition n'est pas remplie (js/reader-mode.js:resolveImageConditions), le renommage d'une colonne (js/schema-renames.js, qui lisait déjà data-condition de tout élément).
// La souris réelle à 700x400 est dans verify-var-toolbar-mouse.mjs.
(function () {
  const cases = [];
  const PAGE = 'IcNotifications';
  const RECORD_1 = { id: 1, Titre: 'Notif 1', Statut: 'Urgent', Logo: ['L', 11] };
  const RECORD_2 = { id: 2, Titre: 'Notif 2', Statut: 'Normal', Logo: ['L', 12] };
  const COND_TITRE_1 = { mode: 'all', rules: [{ column: 'Titre', operator: '=', value: 'Notif 1' }] };
  const COND_TITRE_2 = { mode: 'all', rules: [{ column: 'Titre', operator: '=', value: 'Notif 2' }] };
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const imageHtml = (column, condition, extra) => `<img class="editor-image" data-var-table="${PAGE}" data-var-column="${column}" data-var-key="${PAGE}.${column}" style="width: 200px; height: 150px"${condition ? attr('data-condition', condition) : ''}${extra || ''}>`;
  const ed = () => EditorCore.getEditor();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const failedOf = checks => Object.keys(checks).filter(k => !checks[k]);
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };

  async function seed(h, html) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(PAGE, { Titre: 'Text', Statut: 'Text', Logo: 'Attachments', Photo: 'Attachments' });
    stub.setRows(PAGE, [Object.assign({ Photo: ['L', 21] }, RECORD_1), Object.assign({ Photo: ['L', 22] }, RECORD_2)]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({ Photo: ['L', 21] }, RECORD_1), PAGE);
    await h.sleep(60);
    Editor.setHTML(html);
    await h.sleep(150);
  }
  async function setRecord(h, record) {
    window.__gristStub.fireRecord(Object.assign({}, record), PAGE);
    await h.sleep(60);
  }
  // Ce que la Lecture écrit : les pièces jointes des images gardées, dans l'ordre, et le texte autour.
  async function readOf(html) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE, GristAPI.getCurrentRecord());
    return { attachments: Array.from(box.querySelectorAll('img')).map(i => i.getAttribute('data-attachment-id')), text: box.textContent.replace(/\s+/g, ' ').trim() };
  }
  const imageNodes = () => { const out = []; ed().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage') out.push({ node, pos }); }); return out; };
  const attrsOf = index => { const f = imageNodes()[index || 0]; return f ? f.node.attrs : null; };
  const imageViews = () => Array.from(document.querySelectorAll('.tiptap .editor-image-view'));
  async function selectImage(h, index) {
    document.querySelector('.tiptap').focus();
    const found = imageNodes()[index || 0];
    if (!found) throw new Error('pas d’image n° ' + (index || 0));
    ed().commands.setNodeSelection(found.pos);
    await h.sleep(150);
    return found;
  }
  const imageBar = () => Array.from(document.querySelectorAll('.v2-floating-toolbar')).find(el => el.querySelector('button[data-action="layer-front"]'));
  const conditionButton = () => { const bar = imageBar(); return bar ? bar.querySelector('button[data-action="var-condition"]') : null; };
  const buttonState = () => {
    const bar = imageBar();
    const b = conditionButton();
    return {
      bar: !!bar && bar.classList.contains('visible'),
      shown: !!b && !!bar && bar.classList.contains('visible') && b.getClientRects().length > 0,
      disabled: !!b && b.getAttribute('aria-disabled') === 'true', active: !!b && b.classList.contains('is-active'), title: b ? b.title : null, label: b ? b.getAttribute('aria-label') : null,
    };
  };
  const pressCondition = () => conditionButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

  // --- La fenêtre de condition (la même que celle d'une bulle ou d'un bloc de texte) ---
  const conditionModal = () => document.getElementById('var-condition-modal');
  const windowShown = () => { const m = conditionModal(); return !!m && m.style.display !== 'none' && m.getClientRects().length > 0; };
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  async function pickColumn(h, row, name) {
    row.querySelector('.macro-rule-column-wrap .ss-trigger').click();
    await h.sleep(30);
    const input = row.querySelector('.macro-rule-column-wrap .ss-panel .ss-input');
    setInput(input, name);
    await h.sleep(10);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await h.sleep(40);
  }
  async function saveCondition(h, column, value) {
    const modal = conditionModal();
    const row = modal.querySelector('.macro-rule-row');
    await pickColumn(h, row, column);
    setInput(row.querySelector('.macro-rule-value'), value);
    await h.sleep(700);
    const debug = Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);
    modal.querySelector('.var-modal-actions .var-modal-primary').click();
    await h.sleep(120);
    return debug;
  }
  const footerLabels = modal => Array.from(modal.querySelectorAll('.var-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent);

  cases.push({
    id: 'imagecond_reader_hides_the_image_when_its_condition_is_not_met',
    description: 'La Lecture (et donc le PDF, le Word, le HTML) retire l’image de colonne dont la condition n’est pas remplie pour la ligne affichée et garde le texte autour ; une image sans condition, ou à condition vraie, reste avec sa pièce jointe ; une condition sans règle complète laisse l’image, une condition illisible la masque ; la ligne suivante inverse le résultat',
    run: async (h) => {
      const html = '<p>Avant ' + imageHtml('Logo', COND_TITRE_1) + ' milieu ' + imageHtml('Photo', COND_TITRE_2) + ' fin ' + imageHtml('Photo') + ' '
        + imageHtml('Logo', { mode: 'all', rules: [{ column: '', operator: '=', value: '' }] }) + ' ' + imageHtml('Logo', null, ' data-condition="{pas du json"') + '</p>';
      await seed(h, '<p></p>');
      const quiet = console.error;
      let first = null;
      let second = null;
      console.error = () => {}; // la condition illisible est signalée à la console (js/condition-rules.js), c'est voulu
      try {
        first = await readOf(html);
        await setRecord(h, RECORD_2);
        second = await readOf(html);
      } finally {
        console.error = quiet;
      }
      await setRecord(h, RECORD_1);
      const checks = {
        // Ligne 1 : Logo (Titre = Notif 1) reste ; Photo (Titre = Notif 2) part ; Photo sans condition reste ; condition vide reste ; condition illisible part.
        firstRow: same(first.attachments, ['11', '21', '11']),
        textStays: first.text.indexOf('Avant') !== -1 && first.text.indexOf('milieu') !== -1 && first.text.indexOf('fin') !== -1,
        // Ligne 2 : Logo part ; Photo (Titre = Notif 2) reste ; Photo sans condition reste ; condition vide reste.
        secondRow: same(second.attachments, ['22', '22', '12']),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, first, second }) : 'ok' };
    },
  });

  cases.push({
    id: 'imagecond_condition_round_trips_through_html_and_never_marks_an_ordinary_image',
    description: 'La condition d’une image de colonne s’écrit en data-condition sur son <img> et se relit à l’identique (enregistrement, collage) ; une image ordinaire n’en écrit jamais, même si le nœud en porte une ; le cadre de l’éditeur n’écrit ni sa classe ni son libellé dans le modèle',
    run: async (h) => {
      await seed(h, '<p>' + imageHtml('Logo', COND_TITRE_1) + '</p>');
      const first = attrsOf(0);
      const saved = Editor.getHTML();
      const written = Array.from(new DOMParser().parseFromString(saved, 'text/html').querySelectorAll('img.editor-image')).map(i => i.getAttribute('data-condition'));
      Editor.setHTML(saved);
      await h.sleep(120);
      const second = attrsOf(0);
      // Le même nœud devenu une image ordinaire : sa condition ne s'écrit plus.
      const found = imageNodes()[0];
      ed().view.dispatch(ed().state.tr.setNodeMarkup(found.pos, undefined, Object.assign({}, found.node.attrs, { varTable: null, varColumn: null, varKey: null, src: PIXEL })));
      await h.sleep(100);
      const ordinary = Editor.getHTML();
      const checks = {
        parsed: same(first.condition, COND_TITRE_1),
        written: written.length === 1 && same(JSON.parse(written[0]), COND_TITRE_1),
        reparsed: same(second.condition, COND_TITRE_1),
        noFrameClassInModel: saved.indexOf('editor-image-conditional') === -1 && saved.indexOf('data-condition="Si') === -1,
        ordinaryImageWritesNone: ordinary.indexOf('data-condition') === -1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, saved, ordinary }) : 'ok' };
    },
  });

  cases.push({
    id: 'imagecond_bar_button_is_for_column_images_only_and_lights_up_with_a_condition',
    description: 'Le bouton « Condition d’affichage » est dans la barre de toute image : actif sur une image de colonne Pièces jointes, grisé avec sa raison (français et anglais) sur une image ordinaire, un clic dessus n’ouvre rien ; il est allumé quand l’image a une condition',
    run: async (h) => {
      await seed(h, '<p>' + imageHtml('Logo') + ' ' + imageHtml('Photo', COND_TITRE_1) + ' <img class="editor-image" src="' + PIXEL + '" style="width: 40px"></p>');
      const states = {};
      const REASON = { fr: 'La condition d’affichage est réservée à une image liée à une colonne de pièces jointes', en: 'A display condition is only for an image linked to an attachments column' };
      const TITLE = { fr: 'Condition d’affichage', en: 'Display condition' };
      for (const lang of ['fr', 'en']) {
        await inLang(lang, async () => {
          for (const [i, kind] of ['plain_column', 'with_condition', 'ordinary'].entries()) {
            await selectImage(h, i);
            states[lang + '_' + kind] = buttonState();
          }
        });
      }
      await selectImage(h, 2);
      pressCondition();
      await h.sleep(150);
      const openedOnOrdinary = windowShown();
      const s = states;
      const checks = {
        enabledOnColumnImage: ['fr', 'en'].every(l => s[l + '_plain_column'].shown && !s[l + '_plain_column'].disabled && !s[l + '_plain_column'].active && s[l + '_plain_column'].title === TITLE[l]),
        litWithCondition: ['fr', 'en'].every(l => s[l + '_with_condition'].shown && !s[l + '_with_condition'].disabled && s[l + '_with_condition'].active),
        greyOnOrdinary: ['fr', 'en'].every(l => s[l + '_ordinary'].shown && s[l + '_ordinary'].disabled && !s[l + '_ordinary'].active && s[l + '_ordinary'].title === REASON[l] && s[l + '_ordinary'].label === REASON[l]),
        clickOnOrdinaryOpensNothing: !openedOnOrdinary,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, states, openedOnOrdinary }) : 'ok' };
    },
  });

  cases.push({
    id: 'imagecond_window_sets_and_removes_the_condition_with_one_undo_each',
    description: 'Le bouton ouvre la fenêtre de condition avec les phrases de l’image (titre, introduction, « Afficher si », aperçu « l’image s’affiche / est masquée »), sans « Avant / Après » ni « Sinon afficher » ni « Défaire » ; « Enregistrer » pose la condition sur l’image en un seul Annuler, en gardant sa taille et son opacité ; « Retirer la condition » la retire en un seul Annuler',
    run: async (h) => {
      await seed(h, '<p>' + imageHtml('Logo', null, ' data-opacity="1"') + '</p>');
      const before = attrsOf(0);
      await selectImage(h, 0);
      pressCondition();
      await h.sleep(250);
      const modal = conditionModal();
      const opened = windowShown();
      const shape = opened ? {
        title: modal.querySelector('.modal-title, h2, [id^="var-condition-title"]').textContent,
        intro: modal.querySelector('.var-modal-intro').textContent,
        modeHasAffix: !!modal.querySelector('.var-condition-affix:not([hidden]) input'),
        otherwiseVisible: Array.from(modal.querySelectorAll('.var-condition-affix')).filter(r => !r.hidden && r.getClientRects().length > 0).length,
        footer: footerLabels(modal),
      } : null;
      const debug = opened ? await saveCondition(h, 'Titre', 'Notif 1') : [];
      const saved = attrsOf(0);
      const afterSave = { class: imageViews()[0].classList.contains('editor-image-conditional') };
      ed().commands.undo();
      await h.sleep(100);
      const undone = attrsOf(0);
      ed().commands.redo();
      await h.sleep(100);
      // Retirer la condition.
      await selectImage(h, 0);
      pressCondition();
      await h.sleep(250);
      const footerWithCondition = windowShown() ? footerLabels(conditionModal()) : [];
      const removeBtn = windowShown() ? conditionModal().querySelector('.var-modal-actions .var-modal-danger:not([hidden])') : null;
      if (removeBtn) removeBtn.click();
      await h.sleep(120);
      const removed = attrsOf(0);
      ed().commands.undo();
      await h.sleep(100);
      const restored = attrsOf(0);
      const checks = {
        opened,
        // « Afficher si » (varCond.modeBefore) est dans le texte de la fenêtre ; l'introduction parle de l'image.
        introSaysImage: !!shape && /image/i.test(shape.intro) && shape.title === 'Condition d’affichage',
        noAffixNoOtherwise: !!shape && !shape.modeHasAffix && shape.otherwiseVisible === 0,
        noUnwrapButton: !!shape && shape.footer.indexOf('Défaire le bloc') === -1 && shape.footer.indexOf('Défaire la valeur') === -1 && shape.footer.length === 2,
        previewTalksAboutTheImage: debug.some(l => /l’image s’affiche/.test(l)),
        savedCondition: !!saved && same(saved.condition, COND_TITRE_1) && saved.width === before.width && saved.opacity === before.opacity && saved.varColumn === 'Logo',
        frameBlue: afterSave.class,
        oneUndoRemovesIt: !!undone && undone.condition == null,
        removeButtonOnlyWithCondition: footerWithCondition.indexOf('Retirer la condition') !== -1,
        removed: !!removed && removed.condition == null && removed.varColumn === 'Logo',
        oneUndoRestoresIt: !!restored && same(restored.condition, COND_TITRE_1),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, shape, debug, saved, undone, removed, restored, footerWithCondition }) : 'ok' };
    },
  });

  cases.push({
    id: 'imagecond_frame_shows_a_blue_dashed_border_and_its_condition_line_in_both_languages',
    description: 'Une image de colonne avec condition garde son cadre visible en édition, en pointillés bleus avec une seconde ligne « Si … » (« If … » en anglais) ; sans condition le cadre garde son aspect gris ; une colonne disparue passe en orange malgré la condition (l’orange l’emporte)',
    run: async (h) => {
      await seed(h, '<p>' + imageHtml('Logo', COND_TITRE_1) + ' ' + imageHtml('Photo') + ' ' + imageHtml('Ancien', COND_TITRE_1) + '</p>');
      const look = (view) => {
        const cs = getComputedStyle(view);
        const label = view.querySelector('.editor-image-var-label');
        return {
          conditional: view.classList.contains('editor-image-conditional'), border: cs.borderTopColor, style: cs.borderTopStyle, bg: cs.backgroundColor,
          line: label ? label.dataset.note || null : null, after: label ? getComputedStyle(label, '::after').content : null,
        };
      };
      const looks = {};
      for (const lang of ['fr', 'en']) {
        await inLang(lang, async () => {
          // Le libellé se dessine avec le nœud : le modèle est rechargé dans la langue, après un document vide (le même contenu garderait les mêmes vues).
          Editor.setHTML('<p></p>');
          await h.sleep(100);
          Editor.setHTML('<p>' + imageHtml('Logo', COND_TITRE_1) + ' ' + imageHtml('Photo') + ' ' + imageHtml('Ancien', COND_TITRE_1) + '</p>');
          await h.sleep(250);
          const views = imageViews();
          looks[lang] = { conditional: look(views[0]), plain: look(views[1]), broken: look(views[2]) };
        });
      }
      const BLUE = 'rgb(91, 127, 192)';
      const checks = {
        blueDashed: ['fr', 'en'].every(l => looks[l].conditional.conditional && looks[l].conditional.border === BLUE && looks[l].conditional.style === 'dashed'),
        lineIsShown: looks.fr.conditional.line === 'Si Titre = Notif 1' && looks.en.conditional.line === 'If Titre = Notif 1'
          && looks.fr.conditional.after.indexOf('Si Titre = Notif 1') !== -1 && looks.en.conditional.after.indexOf('If Titre = Notif 1') !== -1,
        plainKeepsItsLook: ['fr', 'en'].every(l => !looks[l].plain.conditional && looks[l].plain.border !== BLUE && looks[l].plain.line == null),
        brokenBeatsBlue: ['fr', 'en'].every(l => looks[l].broken.conditional && looks[l].broken.bg === 'rgb(251, 233, 233)' && looks[l].broken.border === 'rgb(240, 179, 179)'),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, looks }) : 'ok' };
    },
  });

  cases.push({
    id: 'imagecond_column_renames_follow_into_the_condition_of_an_image',
    description: 'Quand une colonne est renommée dans Grist, la condition d’une image de colonne la suit (data-condition réécrit), comme celle d’une bulle ; la colonne Pièces jointes renommée suit aussi',
    run: async (h) => {
      await seed(h, '<p></p>');
      const m = SchemaRenames.createMapper(
        { f: 1, t: { 1: [PAGE, { 1: 'Titre', 2: 'Logo' }] } },
        { f: 1, t: { 1: [PAGE, { 1: 'Intitule', 2: 'Emblem' }] } },
        {}
      );
      const ctx = { page: m.tableContext(PAGE), trigger: Variables.triggerChar() };
      const renamed = SchemaRenames.rewriteHtml('<p>' + imageHtml('Logo', COND_TITRE_1) + '</p>', m, ctx);
      const box = document.createElement('div');
      box.innerHTML = renamed.html;
      const img = box.querySelector('img');
      const checks = {
        counted: renamed.count >= 1,
        conditionFollows: !!img && JSON.parse(img.getAttribute('data-condition')).rules[0].column === 'Intitule',
        attachmentColumnFollows: !!img && img.getAttribute('data-var-column') === 'Emblem',
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, html: renamed.html }) : 'ok' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.imageCondition = cases;
})();
