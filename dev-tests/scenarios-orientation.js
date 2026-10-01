// Paysage / portrait d'un modèle classique (js/page-layout.js : orientation, getPageSize*, --pp-page-width ; consommée par l'aperçu A4, la pagination de
// l'éditeur et de la Lecture, le facteur d'ajustement de js/main.js, js/pdf-export.js, js/docx-export.js, js/pdf-export-alt.js, les Réglages).
//
// Le format A4 était écrit en dur à sept endroits (793.71px / 841.89pt / 11906 x 16838 twips...). Chaque scénario vérifie donc un étage DIFFÉRENT, et
// systématiquement que le paysage donne le même résultat à l'écran et à l'export - un étage oublié se verrait ici comme une page de 297 mm de haut
// découpée dans un PDF de 210 mm, ou un tableau Word plus étroit que la page.
//
// Ce que fait le bouton Portrait / Paysage de la barre : PageLayout.setOrientation(), puis l'événement `pp:marginsChanged`. Les scénarios passent par
// `toggle()` ci-dessous, qui reproduit ces deux gestes ; le rafraîchissement (zoom, pagination, Lecture, grille des images) est celui de js/main.js, écouteur
// de `pp:pageLayoutChanged` - le même chemin qu'au clic. Un scénario (orient_real_button_...) clique le VRAI bouton, avec la liste de types livrée.
//
// `--pp-page-width` (posée par PageLayout.applyToPreviewCss) vaut 793.71px en portrait - la valeur que css/editor-v2.css écrivait en dur avant ce réglage, et
// non les 793.7008px de 210 mm - et 1122.52px en paysage : un modèle portrait rend, et se réduit au panneau, exactement comme avant.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.orientation = (function () {
  const MM = PageLayout.MM_TO_PX;
  const DEFAULT_MARGINS = { top: PageLayout.DEFAULT_MARGIN_MM, right: PageLayout.DEFAULT_MARGIN_MM, bottom: PageLayout.DEFAULT_MARGIN_MM, left: PageLayout.DEFAULT_MARGIN_MM };
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  // Page A4 en pt, dans les deux sens (pdfmake : 595.28 x 841.89).
  const PORTRAIT_PT = { width: 595.28, height: 841.89 };
  const LANDSCAPE_PT = { width: 841.89, height: 595.28 };
  const TABLE = 'Publipostage_Modeles';

  function near(a, b, tol) { return Math.abs(a - b) <= tol; }
  function lines(n, text) { return Array.from({ length: n }, (_, i) => '<p>' + (text || 'Ligne') + ' ' + i + ' du document de test de pagination.</p>').join(''); }

  function toggle(orientation) {
    PageLayout.setOrientation(orientation);
    document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
  }

  // Repart d'un modèle neuf, en Aperçu A4 (toute mesure de page n'a de sens qu'avec lui), dans l'orientation demandée.
  async function setup(h, orientation) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    if (orientation === 'landscape') toggle('landscape');
    await h.sleep(250);
  }

  // Facteur d'ajustement courant de la feuille (zoom CSS) : les rectangles lus dans la feuille sont en pixels écran, déjà multipliés par lui.
  function zoomOf(el) { const z = parseFloat(getComputedStyle(el).zoom); return (isFinite(z) && z > 0) ? z : 1; }
  function layoutWidth(el) { return el.getBoundingClientRect().width / zoomOf(el); }

  const TWO_COL_HTML = leftMm => '<p>Repere avant</p>'
    + '<div class="two-columns-zone" style="--layout-left: ' + leftMm + 'mm; --layout-left-mm: ' + leftMm + 'mm">'
    + '<div class="two-columns-column"><p>GAUCHE</p></div><div class="two-columns-column"><p>DROITE</p></div></div>';
  function columnWidthsMm(root) { return Array.from(root.querySelectorAll('.two-columns-column')).map(c => c.getBoundingClientRect().width / zoomOf(c) / MM); }

  const TABLE_HTML = '<table><tbody><tr><td><p>un</p></td><td><p>deux</p></td><td><p>trois</p></td></tr></tbody></table>';

  async function savedTemplate(h, nom, html, orientation) {
    // « Nouveau » d'abord : sans lui, Enregistrer réécrirait le modèle précédent au lieu d'en créer un.
    await h.clickButton('btn-new');
    await h.sleep(300);
    await setup(h, orientation);
    Editor.setHTML(html || '<p>Contenu</p>');
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }
  async function selectTemplate(h, id) {
    const select = document.getElementById('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(700);
  }

  // Une image en calque, posée comme la personne le fait : par le vrai bouton Image de la barre, à la hauteur d'un paragraphe ANCRE au milieu d'un long
  // document (3e page en portrait, 4e en paysage), puis passée « Au premier plan » par la vraie barre de l'image - la grille page
  // (data-page-index / left / top-pt) est donc celle que l'éditeur a mesurée lui-même. Rend { ed, gridOf } ou { error }.
  async function placeLayeredImageAtAnchor(h) {
    await setup(h, 'portrait');
    // Assez loin pour que le texte change de page avec la hauteur de page (environ 41 lignes par page en portrait, 36 en paysage).
    Editor.setHTML(lines(120) + '<p>ANCRE</p>' + lines(60, 'Suite'));
    await h.sleep(700);
    const ed = EditorCore.getEditor();
    let anchorP = null;
    h.tiptap().querySelectorAll('p').forEach(p => { if (p.textContent === 'ANCRE') anchorP = p; });
    if (!anchorP) return { error: 'paragraphe ANCRE introuvable' };
    ed.commands.setTextSelection(ed.view.posAtDOM(anchorP, 0) + 5);
    ed.commands.focus();
    await h.sleep(80);
    const dialogs = h.stubDialogs({ prompt: TINY_PNG });
    document.getElementById('v2-btn-image').click();
    await h.sleep(200);
    dialogs.restore();
    const img = anchorP.querySelector('img.editor-image') || h.tiptap().querySelector('img.editor-image');
    if (!img) return { error: 'image non insérée' };
    await h.selectAtomNode(img);
    await h.sleep(100);
    const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
    if (!frontBtn) return { error: 'barre de l\'image introuvable' };
    frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await h.sleep(200);
    const gridOf = () => { let a = null; ed.state.doc.descendants(n => { if (n.type.name === 'editorImage') a = n.attrs; }); return a; };
    return { ed, gridOf };
  }

  return [
    {
      id: 'orient_real_button_turns_a_document_and_stays_grey_for_other_types',
      description: 'Avec la liste de types livrée, le bouton est actif pour un modèle classique et grisé pour un email : un vrai clic passe la feuille en paysage et repagine, avertit l\'enregistrement automatique, un second clic revient',
      async run(h) {
        const problems = [];
        let layoutEvents = 0; let marginsEvents = 0;
        const onLayout = () => layoutEvents++; const onMargins = () => marginsEvents++;
        document.addEventListener('pp:pageLayoutChanged', onLayout);
        document.addEventListener('pp:marginsChanged', onMargins);
        try {
          if (OrientationToggle.TYPES.indexOf('document') === -1) problems.push('« document » n\'est pas dans OrientationToggle.TYPES : ' + JSON.stringify(OrientationToggle.TYPES));
          if (OrientationToggle.TYPES.indexOf('macro') === -1) problems.push('« macro » n\'est pas dans OrientationToggle.TYPES (un macro-modèle a sa propre page) : ' + JSON.stringify(OrientationToggle.TYPES));
          if (OrientationToggle.TYPES.indexOf('email') !== -1) problems.push('un email ne suit pas l\'orientation : ' + JSON.stringify(OrientationToggle.TYPES));
          h.openFlyout('#v2-new-template-group');
          await h.clickButton('v2-btn-new-document');
          await h.sleep(300);
          PageLayout.setMarginsMm(null);
          h.setA4Preview(true);
          Editor.setHTML(lines(150));
          await h.sleep(700);
          Editor.refreshPaginationPreview();
          const btn = document.getElementById('btn-page-orientation');
          const sheet = document.querySelector('#editor-container .v2-page-sheet');
          const breaks = () => document.querySelectorAll('#editor-container .v2-page-break-line').length;
          if (btn.disabled) problems.push('grisé sur un modèle classique');
          const portraitBreaks = breaks();
          const portraitWidth = layoutWidth(sheet);
          layoutEvents = 0; marginsEvents = 0;
          await h.clickButton('btn-page-orientation');
          await h.sleep(900);
          const landscapeBreaks = breaks();
          const landscapeWidth = layoutWidth(sheet);
          if (!PageLayout.isLandscape() || btn.getAttribute('aria-pressed') !== 'true') problems.push('un clic ne passe pas en paysage');
          if (!near(landscapeWidth, 1122.52, 1)) problems.push('feuille en paysage : ' + landscapeWidth.toFixed(2));
          if (!(landscapeBreaks > portraitBreaks)) problems.push('pagination non recalculée : ' + portraitBreaks + ' -> ' + landscapeBreaks + ' sauts');
          if (layoutEvents !== 1 || marginsEvents !== 1) problems.push('événements après un clic : pageLayoutChanged=' + layoutEvents + ' marginsChanged=' + marginsEvents + ' (1 et 1 attendus)');
          await h.clickButton('btn-page-orientation');
          await h.sleep(900);
          if (PageLayout.isLandscape() || btn.getAttribute('aria-pressed') !== 'false') problems.push('le second clic ne revient pas en portrait');
          if (!near(layoutWidth(sheet), portraitWidth, .5) || breaks() !== portraitBreaks) problems.push('retour au portrait : feuille ' + layoutWidth(sheet).toFixed(2) + ', sauts ' + breaks() + ' (attendu ' + portraitWidth.toFixed(2) + ', ' + portraitBreaks + ')');
          // Un email ne suit pas l'orientation : bouton grisé, un clic ne change rien.
          h.openFlyout('#v2-new-template-group');
          await h.clickButton('v2-btn-new-email');
          await h.sleep(300);
          if (!btn.disabled) problems.push('dégrisé sur un email');
          btn.click(); OrientationToggle.toggle();
          await h.sleep(100);
          if (PageLayout.isLandscape()) problems.push('un email a tourné');
          return { pass: problems.length === 0, notes: JSON.stringify({ problems, portraitBreaks, landscapeBreaks, portraitWidth: +portraitWidth.toFixed(2), landscapeWidth: +landscapeWidth.toFixed(2) }) };
        } finally {
          document.removeEventListener('pp:pageLayoutChanged', onLayout);
          document.removeEventListener('pp:marginsChanged', onMargins);
          PageLayout.setMarginsMm(null);
          OrientationToggle.sync();
          h.openFlyout('#v2-new-template-group');
          await h.clickButton('v2-btn-new-document');
          await h.sleep(200);
        }
      },
    },
    {
      id: 'orient_pagelayout_api_and_millimetres_kept',
      description: 'Basculer l\'orientation échange la page (297 x 210) et garde les quatre marges en millimètres, que l\'export reçoit avec l\'orientation',
      async run(h) {
        await setup(h, 'portrait');
        PageLayout.setMarginsMm({ top: 30, right: 25, bottom: 20, left: 35 });
        const before = PageLayout.getMarginsMm();
        toggle('landscape');
        await h.sleep(150);
        const after = PageLayout.getMarginsMm();
        const sameNumbers = ['top', 'right', 'bottom', 'left'].every(k => near(before[k], after[k], .001));
        const page = PageLayout.getPageSizeMm();
        const pt = PageLayout.getMarginsPt();
        const twip = PageLayout.getMarginsTwip();
        const sheetLandscape = PageLayout.getSheetWidthPx();
        const ok = PageLayout.isLandscape() && page.width === 297 && page.height === 210 && sheetLandscape === 1122.52
          && near(PageLayout.getContentWidthMm(), 297 - 25 - 35, .01) && near(PageLayout.getContentHeightMm(), 210 - 30 - 20, .01)
          && sameNumbers && pt.orientation === 'landscape' && twip.orientation === 'landscape' && after.orientation === 'landscape';
        toggle('portrait');
        const back = PageLayout.getPageSizeMm();
        return { pass: ok && !PageLayout.isLandscape() && back.width === 210 && back.height === 297 && PageLayout.getSheetWidthPx() === 793.71, notes: 'page=' + JSON.stringify(page) + ' marges=' + JSON.stringify(after) + ' pt.orientation=' + pt.orientation };
      },
    },
    {
      id: 'orient_editor_sheet_width_follows_orientation',
      description: 'La feuille de l\'éditeur mesure 793.71px en portrait et 1122.52px en paysage, et la zone de texte 190 / 277 mm',
      async run(h) {
        await setup(h, 'portrait');
        Editor.setHTML('<p>Texte</p>');
        await h.sleep(200);
        const sheet = document.querySelector('#editor-container .v2-page-sheet');
        const contentMm = () => EditorCore.editorContentWidthPx(EditorCore.getEditor()) / zoomOf(sheet) / MM;
        const portrait = { sheet: layoutWidth(sheet), content: contentMm() };
        toggle('landscape');
        await h.sleep(400);
        const landscape = { sheet: layoutWidth(sheet), content: contentMm(), cssVar: document.documentElement.style.getPropertyValue('--pp-page-width') };
        const ok = near(portrait.sheet, 793.71, 1) && near(portrait.content, 190.24, .5)
          && near(landscape.sheet, 1122.52, 1) && near(landscape.content, 277.24, .5) && landscape.cssVar === '1122.52px';
        return { pass: ok, notes: 'portrait=' + JSON.stringify(portrait) + ' paysage=' + JSON.stringify(landscape) };
      },
    },
    {
      id: 'orient_reader_sheet_width_follows_orientation',
      description: 'En Lecture, la feuille et les espaceurs d\'en-tête / de pied prennent la largeur de la page dans son sens',
      async run(h) {
        await setup(h, 'portrait');
        const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED</p>', first: '' } };
        const sheet = await h.renderReaderMode('<p>Texte</p>', hf);
        await h.sleep(250);
        const portrait = layoutWidth(sheet);
        toggle('landscape');
        await h.sleep(300);
        const sheetL = await h.renderReaderMode('<p>Texte</p>', hf);
        await h.sleep(300);
        const spacer = document.querySelector('#reader-container .v2-page-edge-spacer');
        const landscape = layoutWidth(sheetL);
        const spacerWidth = spacer ? layoutWidth(spacer) : null;
        return {
          pass: near(portrait, 793.71, 1) && near(landscape, 1122.52, 1) && spacerWidth !== null && near(spacerWidth, 1122.52, 1),
          notes: 'portrait=' + portrait.toFixed(2) + ' paysage=' + landscape.toFixed(2) + ' espaceur=' + (spacerWidth && spacerWidth.toFixed(2)),
        };
      },
    },
    {
      id: 'orient_editor_pagination_uses_page_height',
      description: 'Les sauts de page affichés suivent la hauteur de la page : le même texte tient sur plus de pages en paysage (190 mm utiles contre 277)',
      async run(h) {
        await setup(h, 'portrait');
        Editor.setHTML(lines(150));
        await h.sleep(600);
        Editor.refreshPaginationPreview();
        await h.sleep(300);
        const breaks = () => document.querySelectorAll('#editor-container .v2-page-break-line').length;
        const portrait = breaks();
        toggle('landscape');
        await h.sleep(700);
        const landscape = breaks();
        toggle('portrait');
        await h.sleep(700);
        const backToPortrait = breaks();
        // 277 / 190 = 1.46 : tolérance large (un bloc ne se coupe pas), mais nettement au-dessus de 1.
        const ratio = (landscape + 1) / (portrait + 1);
        return { pass: portrait >= 2 && ratio > 1.3 && ratio < 1.7 && backToPortrait === portrait, notes: 'sauts portrait=' + portrait + ' paysage=' + landscape + ' retour=' + backToPortrait + ' rapport=' + ratio.toFixed(2) };
      },
    },
    {
      id: 'orient_reader_pagination_matches_editor',
      description: 'La Lecture se repagine comme l\'éditeur en paysage (même hauteur de page, deux moteurs distincts)',
      async run(h) {
        await setup(h, 'landscape');
        const html = lines(150);
        Editor.setHTML(html);
        await h.sleep(700);
        Editor.refreshPaginationPreview();
        await h.sleep(300);
        const editorBreaks = document.querySelectorAll('#editor-container .v2-page-break-line').length;
        await h.renderReaderMode(Editor.getHTML(), EMPTY_HF);
        await h.sleep(500);
        const readerBreaks = document.querySelectorAll('#reader-container .v2-page-break-line').length;
        return { pass: editorBreaks >= 3 && editorBreaks === readerBreaks, notes: 'sauts editeur=' + editorBreaks + ' lecture=' + readerBreaks };
      },
    },
    {
      id: 'orient_fit_zoom_follows_page_width',
      description: 'Le facteur d\'ajustement à la largeur disponible se calcule sur la largeur de la page dans son sens, et se recalcule au changement d\'orientation',
      async run(h) {
        await setup(h, 'portrait');
        const container = document.getElementById('editor-container');
        const originalStyle = container.getAttribute('style');
        // Panneau étroit : la feuille ne tient pas, le facteur doit valoir (largeur disponible) / (largeur de la page).
        container.style.width = '700px'; container.style.flex = 'none'; container.style.maxWidth = '700px';
        await h.sleep(500); // l'observateur de redimensionnement de js/main.js recalcule
        const cs = getComputedStyle(container);
        const available = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const zoom = () => parseFloat(container.style.getPropertyValue('--pp-fit-zoom'));
        const portraitZoom = zoom();
        toggle('landscape');
        await h.sleep(500);
        const landscapeZoom = zoom();
        toggle('portrait');
        await h.sleep(500);
        const backZoom = zoom();
        // Un panneau dont la largeur disponible tombe pile sur une frontière d'arrondi : 656 / 793.71 = 0.826496 s'arrondit à 0.826, 656 / 793.7008 (210 mm) = 0.826505
        // à 0.827. Seule la largeur de feuille d'avant l'orientation (793.71) rend 0.826 : le portrait garde son facteur exact, au millième.
        let probeWidth = 700; let probeAvailable = available;
        for (let i = 0; i < 5 && probeAvailable !== 656; i++) {
          probeWidth += 656 - probeAvailable;
          container.style.width = probeWidth + 'px'; container.style.maxWidth = probeWidth + 'px';
          await h.sleep(400);
          const probeStyle = getComputedStyle(container);
          probeAvailable = container.clientWidth - parseFloat(probeStyle.paddingLeft) - parseFloat(probeStyle.paddingRight);
        }
        const boundaryZoom = zoom();
        if (originalStyle === null) container.removeAttribute('style'); else container.setAttribute('style', originalStyle);
        await h.sleep(300);
        const expect = w => Math.round(Math.max(0.5, Math.min(1, available / w)) * 1000) / 1000;
        // Portrait : le facteur d'avant l'orientation, au millième près (available / 793.71, arrondi) - pas available / 793.7008.
        const ok = near(portraitZoom, expect(793.71), .0001) && near(landscapeZoom, expect(1122.52), .0011) && near(backZoom, portraitZoom, .0001) && landscapeZoom < portraitZoom
          && probeAvailable === 656 && boundaryZoom === 0.826;
        return { pass: ok, notes: 'disponible=' + available.toFixed(1) + ' portrait=' + portraitZoom + ' paysage=' + landscapeZoom + ' retour=' + backZoom + ' frontière d\'arrondi (disponible ' + probeAvailable + ')=' + boundaryZoom + ' (0.826 attendu)' };
      },
    },
    {
      id: 'orient_saved_with_template_and_restored_on_load',
      description: 'L\'orientation s\'enregistre avec le modèle (colonne Margins) et revient à son chargement ; un modèle portrait, un nouveau modèle et un macro-modèle sans réglage restent en portrait (le bouton du macro-modèle est actif)',
      async run(h) {
        const landscapeId = await savedTemplate(h, 'Orient paysage', '<p>Paysage</p>', 'landscape');
        const row = window.__gristStub.getRow(TABLE, landscapeId);
        const saved = JSON.parse(row.Margins || '{}');
        const portraitId = await savedTemplate(h, 'Orient portrait', '<p>Portrait</p>', 'portrait');
        const sheetNow = () => { const el = document.querySelector('#editor-container .v2-page-sheet'); return el ? layoutWidth(el) : null; };
        const buttonNow = () => { const b = document.getElementById('btn-page-orientation'); return { disabled: b.disabled, pressed: b.getAttribute('aria-pressed') }; };
        await selectTemplate(h, landscapeId);
        const loadedLandscape = { landscape: PageLayout.isLandscape(), cssVar: document.documentElement.style.getPropertyValue('--pp-page-width') };
        const landscapeButton = buttonNow();
        await selectTemplate(h, portraitId);
        const loadedPortrait = { landscape: PageLayout.isLandscape(), cssVar: document.documentElement.style.getPropertyValue('--pp-page-width'), sheet: sheetNow() };
        await selectTemplate(h, landscapeId);
        await h.clickButton('btn-new');
        await h.sleep(400);
        const fresh = PageLayout.isLandscape();
        // Un macro-modèle sans réglage de page : l'orientation du modèle précédent ne le suit pas (il garde la page par défaut, portrait), son bouton est actif.
        await selectTemplate(h, landscapeId);
        const macro = await Templates.save(null, 'Orient macro', JSON.stringify({ slots: [] }), '', null, null, 'macro', null);
        await Templates.loadAll();
        const select = document.getElementById('template-select');
        if (!Array.from(select.options).some(o => o.value === String(macro.id))) {
          const option = document.createElement('option'); option.value = String(macro.id); option.textContent = 'Orient macro'; select.appendChild(option);
        }
        await selectTemplate(h, macro.id);
        const macroLandscape = PageLayout.isLandscape();
        const macroSheet = document.documentElement.style.getPropertyValue('--pp-page-width');
        const macroButton = buttonNow();
        await selectTemplate(h, portraitId);
        const ok = saved.orientation === 'landscape'
          && loadedLandscape.landscape && loadedLandscape.cssVar === '1122.52px'
          && !loadedPortrait.landscape && loadedPortrait.cssVar === '793.71px' && loadedPortrait.sheet !== null && near(loadedPortrait.sheet, 793.71, 1)
          && !fresh && !macroLandscape && macroSheet === '793.71px' && macroButton.disabled === false && macroButton.pressed === 'false' && landscapeButton.disabled === false && landscapeButton.pressed === 'true';
        return { pass: ok, notes: 'colonne=' + row.Margins + ' charge paysage=' + JSON.stringify(loadedLandscape) + ' charge portrait=' + JSON.stringify(loadedPortrait) + ' nouveau paysage=' + fresh + ' macro paysage=' + macroLandscape + ' bouton paysage=' + JSON.stringify(landscapeButton) + ' bouton macro=' + JSON.stringify(macroButton) };
      },
    },
    {
      id: 'orient_legacy_margins_without_orientation_load_as_portrait',
      description: 'Un modèle enregistré avant ce réglage (Margins sans orientation) se charge en portrait, inchangé',
      async run(h) {
        const id = await savedTemplate(h, 'Orient ancien', '<p>Ancien</p>', 'portrait');
        // Marges d'avant le réglage : exactement quatre nombres, aucune clé d'orientation.
        window.__gristStub.remoteWrite(TABLE, id, { Margins: JSON.stringify({ top: 12, right: 12, bottom: 12, left: 12 }) });
        await Templates.loadAll();
        await h.clickButton('btn-new');
        await h.sleep(300);
        await selectTemplate(h, id);
        const m = PageLayout.getMarginsMm();
        const sheet = document.querySelector('#editor-container .v2-page-sheet');
        return { pass: !PageLayout.isLandscape() && near(m.top, 12, .001) && document.documentElement.style.getPropertyValue('--pp-page-width') === '793.71px' && near(layoutWidth(sheet), 793.71, 1), notes: 'marges=' + JSON.stringify(m) + ' feuille=' + layoutWidth(sheet).toFixed(2) };
      },
    },
    {
      id: 'orient_pdf_landscape_page_and_text_width',
      description: 'Le PDF d\'un modèle paysage est une page A4 paysage (841.89 x 595.28 pt) où le texte se répartit sur la largeur de contenu paysage',
      async run(h) {
        await setup(h, 'landscape');
        const para = '<p>' + Array.from({ length: 70 }, (_, i) => 'mot' + i).join(' ') + '</p>';
        const result = await h.exportPdfContent(para, null, PageLayout.getMarginsPt());
        const dd = result.docDefinition;
        const gt = await h.extractPdfGroundTruth(result.base64);
        const page = gt.pages[0];
        const rightMost = Math.max.apply(null, page.textItems.map(t => t.x + t.width));
        const contentRight = LANDSCAPE_PT.width - 28;
        const ok = dd.pageSize === 'A4' && dd.pageOrientation === 'landscape'
          && near(page.width, LANDSCAPE_PT.width, .5) && near(page.height, LANDSCAPE_PT.height, .5)
          && rightMost > PORTRAIT_PT.width && rightMost <= contentRight + 1;
        return { pass: ok, notes: 'orientation=' + dd.pageOrientation + ' page=' + page.width.toFixed(2) + 'x' + page.height.toFixed(2) + ' texte jusqu\'a x=' + rightMost.toFixed(1) + ' (limite ' + contentRight.toFixed(1) + ')' };
      },
    },
    {
      id: 'orient_pdf_portrait_unchanged_without_orientation',
      description: 'Sans orientation dans les marges (appel d\'avant ce réglage) le PDF reste exactement l\'A4 portrait d\'avant',
      async run(h) {
        await setup(h, 'portrait');
        const legacy = { top: 28, right: 28, bottom: 28, left: 28 };
        const result = await h.exportPdfContent('<p>Texte</p>', null, legacy);
        const gt = await h.extractPdfGroundTruth(result.base64);
        const page = gt.pages[0];
        return {
          pass: result.docDefinition.pageOrientation === 'portrait' && near(page.width, PORTRAIT_PT.width, .5) && near(page.height, PORTRAIT_PT.height, .5),
          notes: 'orientation=' + result.docDefinition.pageOrientation + ' page=' + page.width.toFixed(2) + 'x' + page.height.toFixed(2),
        };
      },
    },
    {
      id: 'orient_pdf_follows_page_height_for_page_count',
      description: 'Un même texte compte plus de pages dans le PDF paysage que dans le PDF portrait',
      async run(h) {
        await setup(h, 'portrait');
        const html = lines(120);
        const portrait = await h.exportPdfContent(html, null, PageLayout.getMarginsPt());
        toggle('landscape');
        await h.sleep(200);
        const landscape = await h.exportPdfContent(html, null, PageLayout.getMarginsPt());
        const gtP = await h.extractPdfGroundTruth(portrait.base64);
        const gtL = await h.extractPdfGroundTruth(landscape.base64);
        const ratio = gtL.pages.length / gtP.pages.length;
        return { pass: gtP.pages.length >= 2 && ratio > 1.3 && ratio < 1.8, notes: 'pages portrait=' + gtP.pages.length + ' paysage=' + gtL.pages.length };
      },
    },
    {
      id: 'orient_pdf_table_fills_landscape_width',
      description: 'Un tableau sans largeurs imposées occupe toute la largeur de contenu paysage dans le PDF',
      async run(h) {
        await setup(h, 'portrait');
        const portrait = await h.exportPdfContent(TABLE_HTML, null, PageLayout.getMarginsPt());
        toggle('landscape');
        await h.sleep(200);
        const landscape = await h.exportPdfContent(TABLE_HTML, null, PageLayout.getMarginsPt());
        // Après la mise en page, pdfmake remplace chaque largeur par un objet { width, ... } : on lit le nombre dans les deux formes.
        const sum = r => {
          const t = h.flattenPdfContent(r.docDefinition.content).find(b => b && b.table);
          return t ? t.table.widths.reduce((a, w) => a + (typeof w === 'number' ? w : w.width), 0) : null;
        };
        const p = sum(portrait); const l = sum(landscape);
        const contentLandscape = LANDSCAPE_PT.width - 56; const contentPortrait = PORTRAIT_PT.width - 56;
        return { pass: p !== null && l !== null && p < contentPortrait + 1 && l > contentPortrait && l <= contentLandscape + 1, notes: 'somme des largeurs portrait=' + (p && p.toFixed(1)) + ' paysage=' + (l && l.toFixed(1)) + ' (contenu ' + contentPortrait.toFixed(1) + ' / ' + contentLandscape.toFixed(1) + ')' };
      },
    },
    {
      id: 'orient_docx_section_landscape',
      description: 'Le .docx d\'un modèle paysage déclare une page paysage (w:orient, 16838 x 11906 twips) avec les mêmes marges ; le portrait ne bouge pas',
      async run(h) {
        await setup(h, 'portrait');
        PageLayout.setMarginsMm({ top: 30, right: 25, bottom: 20, left: 35 });
        const portrait = await h.exportDocxParts('<p>Texte</p>', null, PageLayout.getMarginsTwip());
        const sectP = h.docxSectionProps(portrait.doc);
        toggle('landscape');
        await h.sleep(200);
        const landscape = await h.exportDocxParts('<p>Texte</p>', null, PageLayout.getMarginsTwip());
        const sectL = h.docxSectionProps(landscape.doc);
        const sameMargins = ['top', 'right', 'bottom', 'left'].every(k => sectP.margins[k] === sectL.margins[k]);
        const ok = sectP.widthTwip === 11906 && sectP.heightTwip === 16838 && sectP.orient !== 'landscape'
          && sectL.widthTwip === 16838 && sectL.heightTwip === 11906 && sectL.orient === 'landscape' && sameMargins;
        return { pass: ok, notes: 'portrait=' + JSON.stringify([sectP.widthTwip, sectP.heightTwip, sectP.orient]) + ' paysage=' + JSON.stringify([sectL.widthTwip, sectL.heightTwip, sectL.orient]) + ' marges identiques=' + sameMargins };
      },
    },
    {
      id: 'orient_docx_table_and_columns_use_landscape_width',
      description: 'Dans le .docx paysage, un tableau et une zone à deux colonnes occupent la largeur de contenu paysage',
      async run(h) {
        await setup(h, 'landscape');
        const twipMargins = PageLayout.getMarginsTwip();
        const contentTwip = 16838 - twipMargins.left - twipMargins.right;
        const table = await h.exportDocxParts(TABLE_HTML, null, twipMargins);
        const tableGrid = h.docxTables(table.doc)[0];
        const gridSum = tableGrid ? tableGrid.gridCols.reduce((a, w) => a + w, 0) : null;
        const zone = await h.exportDocxParts(TWO_COL_HTML(100), null, twipMargins);
        const zoneGrid = h.docxTables(zone.doc)[0];
        const zoneSum = zoneGrid ? zoneGrid.gridCols.reduce((a, w) => a + w, 0) : null;
        return {
          // Le tableau mesure ses colonnes dans le navigateur, arrondies au pixel : un écart de moins d'un millimètre sur la largeur totale existe aussi en portrait.
          pass: gridSum !== null && zoneSum !== null && near(gridSum, contentTwip, 100) && gridSum > 11906 - 1120 && near(zoneSum, contentTwip, 3) && zoneGrid.gridCols[2] > 0,
          notes: 'contenu=' + contentTwip + ' tableau=' + gridSum + ' zone=' + JSON.stringify(zoneGrid && zoneGrid.gridCols),
        };
      },
    },
    {
      id: 'orient_wide_left_column_survives_switch_to_portrait',
      description: 'Une colonne gauche de 200 mm (réglée en paysage) ne laisse pas la colonne droite négative en portrait : à l\'écran, dans le PDF et dans le .docx, et le réglage revient en repassant en paysage',
      async run(h) {
        await setup(h, 'landscape');
        Editor.setHTML(TWO_COL_HTML(200));
        await h.sleep(500);
        const landscapeCols = columnWidthsMm(h.tiptap());
        toggle('portrait');
        await h.sleep(600);
        const contentMm = PageLayout.getContentWidthMm();
        const cols = columnWidthsMm(h.tiptap());
        const gapMm = PageLayout.getColumnGapMm();
        const editorOk = cols.length === 2 && cols[0] >= 9.5 && cols[1] >= 9.5 && cols[0] + gapMm + cols[1] <= contentMm + .6;
        // PDF : la colonne droite reste dans la page.
        const pdf = await h.exportPdfContent(Editor.getHTML(), null, PageLayout.getMarginsPt());
        const gt = await h.extractPdfGroundTruth(pdf.base64);
        // La colonne droite ne mesure que 10 mm : son mot se coupe en plusieurs morceaux, on prend donc tout ce que le PDF peint à droite de la colonne gauche.
        const rightItems = gt.pages[0].textItems.filter(t => t.x > 28 + 160 * PageLayout.MM_TO_PT);
        const right = rightItems.length ? { x: Math.min.apply(null, rightItems.map(t => t.x)), width: Math.max.apply(null, rightItems.map(t => t.x + t.width)) - Math.min.apply(null, rightItems.map(t => t.x)) } : null;
        const pdfOk = !!right && right.x + right.width <= PORTRAIT_PT.width - 28 + 1;
        // Word : trois largeurs strictement positives dont la somme tient dans la page.
        const docx = await h.exportDocxParts(Editor.getHTML(), null, PageLayout.getMarginsTwip());
        const grid = h.docxTables(docx.doc)[0];
        const twip = PageLayout.getMarginsTwip();
        const contentTwip = 11906 - twip.left - twip.right;
        const docxOk = !!grid && grid.gridCols.length === 3 && grid.gridCols.every(w => w > 0) && grid.gridCols.reduce((a, w) => a + w, 0) <= contentTwip + 3;
        // Le réglage de 200 mm n'est pas réécrit : il revient tel quel en paysage.
        const serialized = /--layout-left-mm:\s*([\d.]+)mm/.exec(Editor.getHTML());
        toggle('landscape');
        await h.sleep(500);
        const backCols = columnWidthsMm(h.tiptap());
        const restored = serialized && near(+serialized[1], 200, .01) && near(backCols[0], 200, .6);
        return {
          pass: near(landscapeCols[0], 200, .6) && editorOk && pdfOk && docxOk && !!restored,
          notes: 'paysage=' + landscapeCols.map(v => v.toFixed(1)) + ' portrait=' + cols.map(v => v.toFixed(1)) + ' (contenu ' + contentMm.toFixed(1) + ') pdf droite=' + (right ? (right.x + right.width).toFixed(1) : 'absente')
            + ' docx=' + JSON.stringify(grid && grid.gridCols) + ' retour paysage=' + backCols.map(v => v.toFixed(1)),
        };
      },
    },
    {
      id: 'orient_layered_image_follows_its_text_to_another_page',
      description: 'Une image en calque suit son texte quand le changement d\'orientation le fait passer sur une autre page : même page dans le PDF que le texte qu\'elle accompagne',
      async run(h) {
        const placed = await placeLayeredImageAtAnchor(h);
        if (placed.error) return { pass: false, notes: placed.error };
        const { gridOf } = placed;
        // Où le PDF peint le texte et l'image : sur quelle page, et à quelle hauteur pour l'image.
        const painted = async () => {
          const pdf = await h.exportPdfContent(Editor.getHTML(), null, PageLayout.getMarginsPt());
          const gt = await h.extractPdfGroundTruth(pdf.base64);
          const pageOfText = gt.pages.findIndex(p => p.textItems.some(t => t.str.indexOf('ANCRE') !== -1));
          const pageOfImage = gt.pages.findIndex(p => p.images.length > 0);
          return { pageOfText, pageOfImage, imageY: pageOfImage >= 0 ? gt.pages[pageOfImage].images[0].y : null };
        };
        const before = gridOf();
        const inPortrait = await painted();
        toggle('landscape');
        await h.sleep(900);
        const after = gridOf();
        const inLandscape = await painted();
        const moved = before && after && before.pageIndex !== after.pageIndex;
        // L'image est peinte là où l'éditeur la montre (grille recapturée : page et hauteur), donc sur la page de son texte - dans les deux sens.
        const sameAsEditor = !!after && inLandscape.pageOfImage === after.pageIndex && near(inLandscape.imageY, 28 + after.pageTopPt, 2);
        return {
          pass: !!moved && inPortrait.pageOfText >= 0 && inPortrait.pageOfText === inPortrait.pageOfImage
            && inLandscape.pageOfText >= 0 && inLandscape.pageOfText === inLandscape.pageOfImage && inLandscape.pageOfText !== inPortrait.pageOfText && sameAsEditor,
          notes: 'grille avant=' + JSON.stringify(before && { i: before.pageIndex, t: before.pageTopPt }) + ' apres=' + JSON.stringify(after && { i: after.pageIndex, t: after.pageTopPt })
            + ' portrait=' + JSON.stringify(inPortrait) + ' paysage=' + JSON.stringify(inLandscape),
        };
      },
    },
    {
      id: 'orient_with_track_changes_on_the_grid_recapture_is_not_a_suggestion',
      description: 'Suivi des modifications actif : changer d\'orientation relit la grille de l\'image en calque sans la transformer en suppression + insertion à accepter ou refuser',
      async run(h) {
        const placed = await placeLayeredImageAtAnchor(h);
        if (placed.error) return { pass: false, notes: placed.error };
        const { ed, gridOf } = placed;
        const before = Object.assign({}, gridOf());
        if (!Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
        const tracking = Editor.isTrackChangesOn();
        let after = null; let pending = null; let fresh = null; let images = 0;
        try {
          toggle('landscape');
          await h.sleep(900);
          after = Object.assign({}, gridOf());
          pending = Editor.hasPendingTrackedChanges();
          // La grille relue doit être celle que l'éditeur mesure maintenant sur l'image (même mesure que la recapture), et il ne doit rester qu'UNE image :
          // transformée en suggestion, l'ancienne (supprimée) et la nouvelle (insérée) restent toutes deux dans le document.
          ed.state.doc.descendants((node, pos) => {
            if (node.type.name !== 'editorImage') return;
            images++;
            fresh = HeaderFooterPreview.computePageGridPosition(ed.view.nodeDOM(pos));
          });
        } finally {
          if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
        }
        const moved = !!after && after.pageIndex !== before.pageIndex;
        const matchesEditor = !!fresh && !!after && fresh.pageIndex === after.pageIndex && near(fresh.pageTopPt, after.pageTopPt, 1) && near(fresh.pageLeftPt, after.pageLeftPt, 1);
        return {
          pass: tracking && pending === false && images === 1 && moved && matchesEditor,
          notes: 'suivi actif=' + tracking + ' suggestions en attente=' + pending + ' images=' + images + ' grille avant=' + JSON.stringify({ i: before.pageIndex, t: before.pageTopPt })
            + ' apres=' + JSON.stringify(after && { i: after.pageIndex, t: after.pageTopPt }) + ' mesure=' + JSON.stringify(fresh && { i: fresh.pageIndex, t: fresh.pageTopPt }),
        };
      },
    },
    {
      id: 'orient_layered_grid_is_recaptured_once_the_editor_can_measure_again',
      description: 'Orientation changée sans Aperçu A4, ou en Lecture : la grille de l\'image en calque attend, puis est recapturée dès que l\'éditeur peut de nouveau mesurer sa page (Aperçu A4 rallumé, retour en Édition)',
      async run(h) {
        const placed = await placeLayeredImageAtAnchor(h);
        if (placed.error) return { pass: false, notes: placed.error };
        const { ed, gridOf } = placed;
        const snapshot = () => Object.assign({}, gridOf());
        // La grille que l'éditeur mesure maintenant sur l'image (même mesure que la recapture).
        const measured = () => {
          let grid = null;
          ed.state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage') grid = HeaderFooterPreview.computePageGridPosition(ed.view.nodeDOM(pos)); });
          return grid;
        };
        const matchesEditor = () => { const a = gridOf(); const m = measured(); return !!a && !!m && a.pageIndex === m.pageIndex && near(a.pageTopPt, m.pageTopPt, 1); };
        // Le vrai interrupteur Aperçu A4 : même écouteur que le clic.
        const a4 = document.getElementById('v2-toggle-a4-preview');
        const setA4 = on => { a4.checked = on; a4.dispatchEvent(new Event('change', { bubbles: true })); };
        const portrait = snapshot();
        // 1. Sans Aperçu A4 il n'y a pas de pagination : rien à mesurer, la grille reste celle du portrait, puis elle est recapturée quand l'aperçu revient.
        setA4(false);
        await h.sleep(200);
        toggle('landscape');
        await h.sleep(500);
        const whileA4Off = snapshot();
        setA4(true);
        await h.sleep(900);
        const afterA4On = snapshot();
        const a4Ok = whileA4Off.pageIndex === portrait.pageIndex && whileA4Off.pageTopPt === portrait.pageTopPt && afterA4On.pageIndex !== portrait.pageIndex && matchesEditor();
        // 2. En Lecture l'éditeur est masqué : même attente, recapture au retour en Édition.
        toggle('portrait');
        await h.sleep(500);
        const portraitAgain = snapshot();
        document.getElementById('btn-mode-read').click();
        await h.sleep(500);
        toggle('landscape');
        await h.sleep(500);
        const whileReading = snapshot();
        document.getElementById('btn-mode-edit').click();
        await h.sleep(900);
        const backInEdit = snapshot();
        const readOk = whileReading.pageIndex === portraitAgain.pageIndex && whileReading.pageTopPt === portraitAgain.pageTopPt && backInEdit.pageIndex !== portraitAgain.pageIndex && matchesEditor();
        const fmt = g => JSON.stringify({ i: g.pageIndex, t: g.pageTopPt });
        return {
          pass: a4Ok && readOk,
          notes: 'portrait=' + fmt(portrait) + ' sans aperçu, en paysage=' + fmt(whileA4Off) + ' aperçu rallumé=' + fmt(afterA4On)
            + ' | portrait=' + fmt(portraitAgain) + ' en Lecture, paysage=' + fmt(whileReading) + ' retour en Édition=' + fmt(backInEdit),
        };
      },
    },
    {
      id: 'orient_settings_margin_limits_follow_orientation',
      description: 'Dans Réglages, le plafond de chaque marge suit la page : 277 mm en haut / en bas et 190 à gauche / à droite en portrait, l\'inverse en paysage',
      async run(h) {
        await setup(h, 'portrait');
        const limits = () => ['top', 'right', 'bottom', 'left'].map(s => Number(document.getElementById('settings-margin-' + s).max));
        document.getElementById('v2-btn-settings').click();
        await h.sleep(150);
        const portrait = limits();
        document.getElementById('settings-close').click();
        toggle('landscape');
        await h.sleep(250);
        document.getElementById('v2-btn-settings').click();
        await h.sleep(150);
        const landscape = limits();
        document.getElementById('settings-close').click();
        return { pass: JSON.stringify(portrait) === JSON.stringify([277, 190, 277, 190]) && JSON.stringify(landscape) === JSON.stringify([190, 277, 190, 277]), notes: 'portrait(haut,droite,bas,gauche)=' + portrait + ' paysage=' + landscape };
      },
    },
    {
      id: 'orient_alternative_pdf_paths_follow_orientation',
      description: 'L\'impression navigateur et les qualités raster (grisées dans l\'interface) suivent aussi le sens de la page',
      async run(h) {
        const printed = [];
        const rasterOpts = [];
        const origLoad = ExportCommon.loadScriptOnce;
        const origHtml2pdf = window.html2pdf;
        ExportCommon.loadScriptOnce = () => Promise.resolve();
        window.html2pdf = () => ({ set(o) { rasterOpts.push(o); return this; }, from() { return this; }, save() { return Promise.resolve(); } });
        try {
          for (const orientation of ['portrait', 'landscape']) {
            const before = document.querySelectorAll('iframe').length;
            await PdfExportAlt.exportViaBrowserPrint('<p>x</p>', 'essai', orientation);
            const frames = Array.from(document.querySelectorAll('iframe'));
            const frame = frames[frames.length - 1];
            const rule = frame && frame.contentDocument && /@page\s*\{[^}]*\}/.exec(frame.contentDocument.documentElement.innerHTML);
            printed.push({ orientation, rule: rule && rule[0], frames: frames.length - before });
          }
          await PdfExportAlt.exportViaRaster('<p>x</p>', 'essai', 'low', 'landscape');
          await PdfExportAlt.exportViaRaster('<p>x</p>', 'essai', 'low');
        } finally {
          ExportCommon.loadScriptOnce = origLoad;
          window.html2pdf = origHtml2pdf;
        }
        const ok = printed.length === 2 && /size:\s*A4;/.test(printed[0].rule || '') && /size:\s*A4 landscape;/.test(printed[1].rule || '')
          && rasterOpts.length === 2 && rasterOpts[0].jsPDF.orientation === 'landscape' && rasterOpts[1].jsPDF.orientation === 'portrait';
        return { pass: ok, notes: 'impression=' + JSON.stringify(printed) + ' raster=' + JSON.stringify(rasterOpts.map(o => o.jsPDF.orientation)) };
      },
    },
  ];
})();
