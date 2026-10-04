// Formats de page (A3, A4, A5, A6) d'un modèle classique - suite de la bascule portrait / paysage (dev-tests/scenarios-orientation.js).
// js/page-layout.js (FORMATS) est la seule table des dimensions : l'aperçu A4 (devenu « Aperçu A5 »...), la pagination de l'éditeur et de la Lecture, le facteur
// d'ajustement de js/main.js, js/pdf-export.js (pageSize de pdfmake), js/docx-export.js (w:pgSz) et les Réglages la lisent.
// Le format voyage avec le sens et les marges, dans la clé `format` du JSON de la colonne Margins (absente = A4 : un modèle enregistré avant ce réglage se recharge
// A4, inchangé).
//
// Le menu de la barre (js/orientation-toggle.js) : survol du bouton Portrait / Paysage, deux lignes de sens, un filet, une ligne par format avec ses dimensions. Les
// scénarios y passent par les VRAIES lignes (`click()` sur le <span> du menu) ; la souris réelle, à 700x400, est dans verify-page-format-mouse.mjs.
//
// Les dimensions attendues sont écrites ICI en dur (pdfmake : standardPageSizes ; Word : twips), indépendamment de la table de PageLayout : si elle dérive d'un
// seul chiffre, ce fichier le voit. Un format de plus est une ligne de FORMATS (js/page-layout.js) et une ligne ici.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.pageFormat = (function () {
  const MM = PageLayout.MM_TO_PX;
  const MM_TO_PT = PageLayout.MM_TO_PT;
  const TABLE = 'Publipostage_Modeles';
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const IDS = ['A3', 'A4', 'A5', 'A6'];
  // Page en portrait : mm (écran), pt (pdfmake), twips (Word).
  const FORMATS = {
    A3: { mm: [297, 420], pt: [841.89, 1190.55], twip: [16838, 23811] },
    A4: { mm: [210, 297], pt: [595.28, 841.89], twip: [11906, 16838] },
    A5: { mm: [148, 210], pt: [419.53, 595.28], twip: [8391, 11906] },
    A6: { mm: [105, 148], pt: [297.64, 419.53], twip: [5953, 8391] },
  };
  function dims(id, orientation, unit) {
    const d = FORMATS[id][unit];
    return orientation === 'landscape' ? { width: d[1], height: d[0] } : { width: d[0], height: d[1] };
  }

  function near(a, b, tol) { return Math.abs(a - b) <= tol; }
  function lines(n, text) { return Array.from({ length: n }, (_, i) => '<p>' + (text || 'Ligne') + ' ' + i + ' du document de test de pagination.</p>').join(''); }
  function zoomOf(el) { const z = parseFloat(getComputedStyle(el).zoom); return (isFinite(z) && z > 0) ? z : 1; }
  function layoutWidth(el) { return el.getBoundingClientRect().width / zoomOf(el); }
  function sheetOf(scope) { return document.querySelector((scope || '#editor-container') + ' .v2-page-sheet'); }
  function cssPageWidth() { return document.documentElement.style.getPropertyValue('--pp-page-width'); }
  function breaks(scope) { return document.querySelectorAll((scope || '#editor-container') + ' .v2-page-break-line').length; }

  // Les deux gestes du menu de la barre, sans passer par ses lignes : PageLayout, puis l'événement `pp:marginsChanged` qui prévient l'enregistrement automatique.
  // Le rafraîchissement (zoom, pagination, Lecture, grille des images) est celui de js/main.js, écouteur de `pp:pageLayoutChanged`.
  function apply(orientation, format) {
    PageLayout.setOrientation(orientation);
    PageLayout.setFormat(format);
    OrientationToggle.sync();
    document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
  }

  // Repart d'un modèle neuf, en Aperçu A4 (toute mesure de page n'a de sens qu'avec lui), dans le sens et le format demandés. La remise à zéro des marges ne dit rien à
  // js/main.js (elle est silencieuse) : l'événement de réajustement est envoyé à la main, pour que le facteur d'ajustement et la pagination partent de la page A4.
  async function setup(h, orientation, format) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    h.setA4Preview(true);
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    if (orientation === 'landscape' || (format && format !== 'A4')) apply(orientation || 'portrait', format || 'A4');
    await h.sleep(300);
  }
  function resetPage() {
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
  }

  async function newDocument(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await h.sleep(300); }
  async function newEmail(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-email'); await h.sleep(300); }

  function menuRows() {
    return Array.from(document.querySelectorAll('#v2-page-flyout .v2-hover-row-check')).map(r => ({
      key: r.getAttribute('data-page-orientation') || r.getAttribute('data-page-format'),
      name: r.querySelector('.v2-page-row-name').textContent,
      size: (r.querySelector('.v2-page-row-size') || { textContent: '' }).textContent,
      checked: r.getAttribute('aria-checked'),
      disabled: r.getAttribute('aria-disabled'),
      greyed: r.classList.contains('v2-hover-row-disabled'),
      tab: r.tabIndex,
    }));
  }
  function menuRow(key) { return document.querySelector('#v2-page-flyout [data-page-orientation="' + key + '"], #v2-page-flyout [data-page-format="' + key + '"]'); }

  async function savedTemplate(h, nom, html, orientation, format) {
    // « Nouveau » d'abord : sans lui, Enregistrer réécrirait le modèle précédent au lieu d'en créer un.
    await h.clickButton('btn-new');
    await h.sleep(300);
    await setup(h, orientation, format);
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

  const TWO_COL_HTML = leftMm => '<p>Repere avant</p>'
    + '<div class="two-columns-zone" style="--layout-left: ' + leftMm + 'mm; --layout-left-mm: ' + leftMm + 'mm">'
    + '<div class="two-columns-column"><p>GAUCHE</p></div><div class="two-columns-column"><p>DROITE</p></div></div>';
  function columnWidthsMm(root) { return Array.from(root.querySelectorAll('.two-columns-column')).map(c => c.getBoundingClientRect().width / zoomOf(c) / MM); }
  const TABLE_HTML = '<table><tbody><tr><td><p>un</p></td><td><p>deux</p></td><td><p>trois</p></td></tr></tbody></table>';

  async function pdfOf(h, html, withHeaderFooter) {
    const result = await h.exportPdfContent(html, withHeaderFooter || null, PageLayout.getMarginsPt());
    return { dd: result.docDefinition, gt: await h.extractPdfGroundTruth(result.base64), result };
  }

  // Une image en calque, posée comme la personne le fait (vrai bouton Image, puis « Au premier plan » par la vraie barre de l'image), à la hauteur d'un paragraphe
  // ANCRE au milieu d'un long document : la grille page (data-page-index / left / top-pt) est celle que l'éditeur a mesurée lui-même. Rend { ed, gridOf } ou { error }.
  async function placeLayeredImageAtAnchor(h) {
    await setup(h, 'portrait', 'A4');
    // Assez loin pour que le texte change de page avec la hauteur de page (environ 52 lignes par page en A4, 35 en A5, 75 en A3).
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
      id: 'fmt_pagelayout_table_matches_pdfmake_and_word',
      description: 'La table des formats de PageLayout donne, pour A3 à A6 dans les deux sens, les millimètres, les points de pdfmake et les twips de Word attendus ; le nom du format est celui que pdfmake et jsPDF connaissent',
      async run() {
        PageLayout.setMarginsMm(null);
        const problems = [];
        const listed = PageLayout.getFormats();
        if (JSON.stringify(listed.map(f => f.id)) !== JSON.stringify(IDS)) problems.push('formats proposés : ' + JSON.stringify(listed.map(f => f.id)));
        IDS.forEach(id => {
          const f = listed.find(x => x.id === id);
          if (!f || f.widthMm !== FORMATS[id].mm[0] || f.heightMm !== FORMATS[id].mm[1]) problems.push(id + ' : dimensions de la liste ' + JSON.stringify(f));
          if (PageLayout.pdfPageNameFor(id) !== id) problems.push(id + ' : nom pdfmake ' + PageLayout.pdfPageNameFor(id));
          ['portrait', 'landscape'].forEach(o => {
            const mm = PageLayout.pageSizeMmFor(o, id); const pt = PageLayout.pageSizePtFor(o, id); const tw = PageLayout.pageSizeTwipFor(o, id);
            const em = dims(id, o, 'mm'); const ep = dims(id, o, 'pt'); const et = dims(id, o, 'twip');
            if (mm.width !== em.width || mm.height !== em.height) problems.push(id + ' ' + o + ' mm ' + JSON.stringify(mm));
            if (!near(pt.width, ep.width, .005) || !near(pt.height, ep.height, .005)) problems.push(id + ' ' + o + ' pt ' + JSON.stringify(pt));
            if (tw.width !== et.width || tw.height !== et.height) problems.push(id + ' ' + o + ' twip ' + JSON.stringify(tw));
          });
        });
        // La page courante, dans toutes les unités, suit le format posé.
        PageLayout.setFormat('A5');
        const mm = PageLayout.getPageSizeMm(); const px = PageLayout.getPageSizePx(); const twip = PageLayout.getPageSizeTwip(); const pt = PageLayout.getPageSizePt();
        if (mm.width !== 148 || mm.height !== 210) problems.push('page A5 en mm : ' + JSON.stringify(mm));
        if (!near(px.width, 148 * MM, .01) || !near(px.height, 210 * MM, .01)) problems.push('page A5 en px : ' + JSON.stringify(px));
        if (!near(twip.width, 8391, 1) || !near(twip.height, 11906, 1)) problems.push('page A5 en twips : ' + JSON.stringify(twip));
        if (!near(pt.width, 419.53, .1) || !near(pt.height, 595.28, .1)) problems.push('page A5 en pt : ' + JSON.stringify(pt));
        // Les moteurs reçoivent le format avec les marges.
        const marginsPt = PageLayout.getMarginsPt(); const marginsTwip = PageLayout.getMarginsTwip();
        if (marginsPt.format !== 'A5' || marginsTwip.format !== 'A5' || PageLayout.getMarginsMm().format !== 'A5') problems.push('le format ne voyage pas avec les marges');
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'fmt_pagelayout_unknown_missing_or_lowercase_format',
      description: 'Une clé `format` absente, inconnue ou abîmée est l\'A4 (modèle d\'avant ce réglage), la casse est ignorée (« a5 » est A5), et le format par défaut est l\'A4 portrait d\'avant : feuille de 793.71px',
      async run() {
        const problems = [];
        const formatAfter = value => { PageLayout.setMarginsMm(value); return PageLayout.getFormat(); };
        const cases = [
          [null, 'A4'], [undefined, 'A4'], [{}, 'A4'], [{ top: 12, right: 12, bottom: 12, left: 12 }, 'A4'], [{ format: 'B7' }, 'A4'], [{ format: '' }, 'A4'],
          [{ format: 42 }, 'A4'], [{ format: null }, 'A4'], [{ format: 'a5' }, 'A5'], [{ format: 'A6' }, 'A6'], [{ format: 'A3', orientation: 'landscape' }, 'A3'],
        ];
        cases.forEach(([value, expected]) => {
          const got = formatAfter(value);
          if (got !== expected) problems.push(JSON.stringify(value) + ' -> ' + got + ' (' + expected + ' attendu)');
        });
        PageLayout.setMarginsMm(null);
        if (PageLayout.getFormat() !== 'A4' || PageLayout.DEFAULT_FORMAT !== 'A4' || PageLayout.isLandscape() || PageLayout.getSheetWidthPx() !== 793.71) problems.push('défaut : ' + PageLayout.getFormat() + ' ' + PageLayout.getSheetWidthPx());
        if (PageLayout.normalizeFormat('a3') !== 'A3' || PageLayout.normalizeFormat('Z9') !== 'A4') problems.push('normalizeFormat');
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'fmt_real_menu_rows_marks_events_and_keyboard',
      description: 'Le menu du bouton Portrait / Paysage a un titre, deux lignes de sens, quatre lignes de format avec leurs dimensions et la ligne « Format libre… » (dev-tests/scenarios-page-size.js) ; cocher une ligne change la page (feuille, pagination, libellés, un seul événement de chaque sorte), recliquer la ligne cochée ne fait rien, Entrée et Espace font comme le clic, le clic sur le bouton tourne toujours la page',
      async run(h) {
        const problems = [];
        let layoutEvents = 0; let marginsEvents = 0;
        const onLayout = () => layoutEvents++; const onMargins = () => marginsEvents++;
        document.addEventListener('pp:pageLayoutChanged', onLayout);
        document.addEventListener('pp:marginsChanged', onMargins);
        try {
          await newDocument(h);
          PageLayout.setMarginsMm(null);
          h.setA4Preview(true);
          Editor.setHTML(lines(150));
          await h.sleep(700);
          OrientationToggle.sync();
          Editor.refreshPaginationPreview();
          await h.sleep(300);
          const btn = document.getElementById('btn-page-orientation');
          const group = document.getElementById('v2-page-group');
          const menu = document.getElementById('v2-page-flyout');
          if (!group || !menu || group.querySelector(':scope > button') !== btn) problems.push('structure : le bouton n\'est pas le premier bouton du groupe');
          if (btn.hasAttribute('data-tip')) problems.push('le bouton d\'un menu au survol porte un data-tip');
          const title = document.getElementById('v2-page-flyout-label');
          if (!title || title.textContent !== 'Page') problems.push('titre du menu : ' + (title && title.textContent));
          const rows = menuRows();
          const keys = rows.map(r => r.key);
          if (JSON.stringify(keys) !== JSON.stringify(['portrait', 'landscape', 'A3', 'A4', 'A5', 'A6', 'custom'])) problems.push('lignes : ' + JSON.stringify(keys));
          const names = rows.map(r => r.name);
          if (JSON.stringify(names) !== JSON.stringify(['Portrait', 'Paysage', 'A3', 'A4', 'A5', 'A6', 'Format libre…'])) problems.push('noms : ' + JSON.stringify(names));
          const sizes = rows.filter(r => /^A\d$/.test(r.key)).map(r => r.size);
          if (JSON.stringify(sizes) !== JSON.stringify(['297 × 420 mm', '210 × 297 mm', '148 × 210 mm', '105 × 148 mm'])) problems.push('dimensions : ' + JSON.stringify(sizes));
          if (rows.filter(r => r.checked === 'true').map(r => r.key).join() !== 'portrait,A4') problems.push('lignes cochées au départ : ' + rows.filter(r => r.checked === 'true').map(r => r.key));
          if (rows.some(r => r.disabled !== 'false' || r.greyed || r.tab !== 0)) problems.push('lignes grisées ou hors du clavier sur un modèle classique');
          if (!document.querySelector('#v2-page-flyout .v2-hover-hsep')) problems.push('pas de filet entre les sens et les formats');
          const portraitBreaks = breaks();
          const a4Width = layoutWidth(sheetOf());
          // Un clic sur la ligne A5.
          layoutEvents = 0; marginsEvents = 0;
          menuRow('A5').click();
          await h.sleep(900);
          const a5Breaks = breaks();
          if (PageLayout.getFormat() !== 'A5' || PageLayout.isLandscape()) problems.push('A5 non posé : ' + PageLayout.getFormat());
          if (!near(layoutWidth(sheetOf()), 148 * MM, 1) || cssPageWidth() !== '559.37px') problems.push('feuille A5 : ' + layoutWidth(sheetOf()).toFixed(2) + ' ' + cssPageWidth());
          if (!(a5Breaks > portraitBreaks)) problems.push('pagination non recalculée : ' + portraitBreaks + ' -> ' + a5Breaks + ' sauts');
          if (layoutEvents !== 1 || marginsEvents !== 1) problems.push('événements après un clic sur A5 : pageLayoutChanged=' + layoutEvents + ' marginsChanged=' + marginsEvents + ' (1 et 1 attendus)');
          const afterA5 = menuRows().filter(r => r.checked === 'true').map(r => r.key).join();
          if (afterA5 !== 'portrait,A5') problems.push('lignes cochées après A5 : ' + afterA5);
          if (btn.getAttribute('aria-label') !== I18n.t('toolbar.orientation.portrait', { format: 'A5' }) || !/A5/.test(btn.getAttribute('aria-label'))) problems.push('libellé du bouton : ' + btn.getAttribute('aria-label'));
          const toggleLabel = document.getElementById('v2-a4-toggle');
          if (toggleLabel.getAttribute('data-tip') !== 'Aperçu A5' || !/A5/.test(toggleLabel.getAttribute('aria-label'))) problems.push('case Aperçu : ' + toggleLabel.getAttribute('data-tip'));
          // Recliquer la ligne cochée : rien ne bouge, aucun événement.
          layoutEvents = 0; marginsEvents = 0;
          menuRow('A5').click();
          await h.sleep(200);
          if (layoutEvents !== 0 || marginsEvents !== 0) problems.push('la ligne déjà cochée a envoyé des événements : ' + layoutEvents + '/' + marginsEvents);
          // Ligne Paysage : le sens change, le format reste.
          menuRow('landscape').click();
          await h.sleep(900);
          if (!PageLayout.isLandscape() || PageLayout.getFormat() !== 'A5') problems.push('Paysage : ' + PageLayout.getOrientation() + ' ' + PageLayout.getFormat());
          if (!near(layoutWidth(sheetOf()), 210 * MM, 1)) problems.push('feuille A5 paysage : ' + layoutWidth(sheetOf()).toFixed(2));
          if (btn.getAttribute('aria-pressed') !== 'true' || btn.dataset.orientation !== 'landscape') problems.push('bouton non enfoncé en paysage');
          // Le clic sur le bouton lui-même tourne la page et garde le format.
          await h.clickButton('btn-page-orientation');
          await h.sleep(700);
          if (PageLayout.isLandscape() || PageLayout.getFormat() !== 'A5') problems.push('clic sur le bouton : ' + PageLayout.getOrientation() + ' ' + PageLayout.getFormat());
          // Clavier : Entrée et Espace sur une ligne.
          menuRow('A3').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          await h.sleep(500);
          if (PageLayout.getFormat() !== 'A3') problems.push('Entrée sur A3 : ' + PageLayout.getFormat());
          menuRow('A6').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
          await h.sleep(500);
          if (PageLayout.getFormat() !== 'A6') problems.push('Espace sur A6 : ' + PageLayout.getFormat());
          menuRow('A4').dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
          await h.sleep(200);
          if (PageLayout.getFormat() !== 'A6') problems.push('une autre touche a changé le format');
          menuRow('A4').click();
          await h.sleep(700);
          if (PageLayout.getFormat() !== 'A4' || !near(layoutWidth(sheetOf()), a4Width, .5) || cssPageWidth() !== '793.71px' || breaks() !== portraitBreaks) problems.push('retour en A4 : ' + PageLayout.getFormat() + ' ' + layoutWidth(sheetOf()).toFixed(2) + ' ' + breaks() + ' sauts (' + portraitBreaks + ' attendus)');
          return { pass: problems.length === 0, notes: JSON.stringify({ problems, portraitBreaks, a5Breaks }) };
        } finally {
          document.removeEventListener('pp:pageLayoutChanged', onLayout);
          document.removeEventListener('pp:marginsChanged', onMargins);
          resetPage();
        }
      },
    },
    {
      id: 'fmt_menu_is_grey_for_other_types_during_an_export_and_refuses_the_change',
      description: 'Sur un email, pendant un export, le menu entier est grisé (lignes hors du clavier, titre « pas disponible » sur un email) et un clic sur une ligne ou un appel direct ne change ni le format ni le sens',
      async run(h) {
        const problems = [];
        try {
          // Email : le type n'est pas dans OrientationToggle.TYPES.
          await newEmail(h);
          await h.sleep(100);
          const title = document.getElementById('v2-page-flyout-label');
          const emailRows = menuRows();
          if (emailRows.length !== 7 || emailRows.some(r => r.disabled !== 'true' || !r.greyed || r.tab !== -1)) problems.push('email : lignes ' + JSON.stringify(emailRows.map(r => [r.key, r.disabled, r.greyed, r.tab])));
          if (!title || title.textContent !== I18n.t('toolbar.page.unavailable')) problems.push('email : titre ' + (title && title.textContent));
          menuRow('A5').click();
          menuRow('landscape').click();
          OrientationToggle.selectFormat('A3');
          OrientationToggle.selectOrientation('landscape');
          await h.sleep(150);
          if (PageLayout.getFormat() !== 'A4' || PageLayout.isLandscape()) problems.push('email : le format ou le sens a changé (' + PageLayout.getFormat() + ' ' + PageLayout.getOrientation() + ')');
          // Modèle classique : dégrisé, puis grisé pendant un export (setBusy), dégrisé après.
          await newDocument(h);
          await h.sleep(100);
          if (menuRows().some(r => r.disabled !== 'false' || r.greyed || r.tab !== 0)) problems.push('modèle classique : lignes grisées');
          OrientationToggle.setBusy(true);
          const busyRows = menuRows();
          if (busyRows.some(r => r.disabled !== 'true' || !r.greyed || r.tab !== -1)) problems.push('export en cours : lignes non grisées');
          if (!document.getElementById('btn-page-orientation').disabled) problems.push('export en cours : bouton non grisé');
          menuRow('A5').click();
          OrientationToggle.selectFormat('A6');
          await h.sleep(100);
          if (PageLayout.getFormat() !== 'A4') problems.push('export en cours : le format a changé (' + PageLayout.getFormat() + ')');
          OrientationToggle.setBusy(false);
          if (menuRows().some(r => r.disabled !== 'false' || r.greyed)) problems.push('après l\'export : lignes restées grisées');
          menuRow('A5').click();
          await h.sleep(300);
          if (PageLayout.getFormat() !== 'A5') problems.push('après l\'export : le clic ne passe plus en A5');
        } finally {
          OrientationToggle.setBusy(false);
          resetPage();
          await newDocument(h);
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'fmt_editor_sheet_width_and_css_variable_per_format',
      description: 'La feuille de l\'éditeur prend la largeur de la page de chaque format dans chaque sens (A3 à A6, portrait et paysage) et la zone de texte celle de la page moins les marges ; l\'A4 portrait garde ses 793.71px d\'avant',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        Editor.setHTML('<p>Texte</p>');
        await h.sleep(200);
        const problems = [];
        const sheet = sheetOf();
        const seen = {};
        for (const o of ['portrait', 'landscape']) {
          for (const id of IDS) {
            apply(o, id);
            await h.sleep(450);
            const page = dims(id, o, 'mm');
            const width = layoutWidth(sheet);
            // editorContentWidthPx lit clientWidth : des pixels de mise en page, déjà indépendants du facteur d'ajustement (contrairement au rectangle de la feuille).
            const content = EditorCore.editorContentWidthPx(EditorCore.getEditor()) / MM;
            const margins = PageLayout.getMarginsMm();
            seen[o + ' ' + id] = { sheet: +width.toFixed(2), content: +content.toFixed(2), css: cssPageWidth() };
            if (!near(width, page.width * MM, 1)) problems.push(o + ' ' + id + ' : feuille ' + width.toFixed(2) + ' (' + (page.width * MM).toFixed(2) + ' attendu)');
            if (!near(content, page.width - margins.left - margins.right, .6)) problems.push(o + ' ' + id + ' : zone de texte ' + content.toFixed(2) + ' mm');
            if (cssPageWidth() !== PageLayout.getSheetWidthPx() + 'px') problems.push(o + ' ' + id + ' : --pp-page-width ' + cssPageWidth());
          }
        }
        // Valeurs exactes qu'il faut garder : l'A4 portrait d'avant, et trois feuilles arrondies au centième.
        const exact = { 'portrait A4': '793.71px', 'landscape A4': '1122.52px', 'portrait A5': '559.37px', 'portrait A6': '396.85px', 'landscape A3': '1587.4px' };
        Object.keys(exact).forEach(k => { if (seen[k].css !== exact[k]) problems.push(k + ' : --pp-page-width ' + seen[k].css + ' (' + exact[k] + ' attendu)'); });
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
      },
    },
    {
      id: 'fmt_preview_toggle_and_button_texts_follow_format_and_language',
      description: 'La case « Aperçu A4 » devient « Aperçu A5 » (« A5 preview » en anglais), le nom accessible du bouton dit le format, et rien ne montre un `{format}` non remplacé, avant comme après un changement de langue',
      async run(h) {
        await setup(h, 'portrait', 'A5');
        const problems = [];
        const read = () => ({
          tip: document.getElementById('v2-a4-toggle').getAttribute('data-tip'), aria: document.getElementById('v2-a4-toggle').getAttribute('aria-label'),
          button: document.getElementById('btn-page-orientation').getAttribute('aria-label'), title: document.getElementById('v2-page-flyout-label').textContent,
          names: menuRows().slice(0, 2).map(r => r.name),
        });
        try {
          const fr = read();
          if (fr.tip !== 'Aperçu A5' || !/^Aperçu A5 — /.test(fr.aria) || !/page A5/.test(fr.aria)) problems.push('français, case : ' + fr.tip + ' | ' + fr.aria);
          if (fr.button !== 'Page A5 en portrait (passer en paysage)') problems.push('français, bouton : ' + fr.button);
          if (fr.title !== 'Page' || fr.names.join() !== 'Portrait,Paysage') problems.push('français, menu : ' + fr.title + ' ' + fr.names);
          I18n.setLang('en');
          await h.sleep(150);
          const en = read();
          if (en.tip !== 'A5 preview' || !/^A5 preview — /.test(en.aria) || !/A5 page/.test(en.aria)) problems.push('anglais, case : ' + en.tip + ' | ' + en.aria);
          if (en.button !== 'A5 page in portrait (switch to landscape)') problems.push('anglais, bouton : ' + en.button);
          if (en.title !== 'Page' || en.names.join() !== 'Portrait,Landscape') problems.push('anglais, menu : ' + en.title + ' ' + en.names);
          // Un changement de format en anglais réécrit les textes en anglais.
          apply('landscape', 'A3');
          await h.sleep(200);
          const en3 = read();
          if (en3.tip !== 'A3 preview' || en3.button !== 'A3 page in landscape (switch to portrait)') problems.push('anglais, A3 paysage : ' + en3.tip + ' | ' + en3.button);
          [fr, en, en3].forEach((r, i) => { if (/\{format\}/.test(JSON.stringify(r))) problems.push('un {format} non remplacé (' + i + ')'); });
        } finally {
          I18n.setLang('fr');
          await h.sleep(150);
          resetPage();
        }
        const back = read();
        if (back.tip !== 'Aperçu A4' || back.button !== 'Page A4 en portrait (passer en paysage)') problems.push('retour en français : ' + back.tip + ' | ' + back.button);
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'fmt_reader_sheet_width_follows_format',
      description: 'En Lecture, la feuille et les espaceurs d\'en-tête / de pied prennent la largeur de la page de chaque format',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED</p>', first: '' } };
        const problems = [];
        const seen = {};
        for (const [o, id] of [['portrait', 'A4'], ['portrait', 'A5'], ['portrait', 'A3'], ['landscape', 'A6'], ['landscape', 'A5']]) {
          apply(o, id);
          await h.sleep(250);
          const sheet = await h.renderReaderMode('<p>Texte</p>', hf);
          await h.sleep(300);
          const spacer = document.querySelector('#reader-container .v2-page-edge-spacer');
          const expected = dims(id, o, 'mm').width * MM;
          const got = layoutWidth(sheet); const spacerWidth = spacer ? layoutWidth(spacer) : null;
          seen[o + ' ' + id] = { sheet: +got.toFixed(2), spacer: spacerWidth && +spacerWidth.toFixed(2) };
          if (!near(got, expected, 1)) problems.push(o + ' ' + id + ' : feuille ' + got.toFixed(2) + ' (' + expected.toFixed(2) + ' attendu)');
          if (spacerWidth === null || !near(spacerWidth, expected, 1)) problems.push(o + ' ' + id + ' : espaceur ' + spacerWidth);
        }
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
      },
    },
    {
      id: 'fmt_editor_pagination_uses_page_height',
      description: 'Le même texte tient sur plus de pages dans un format plus petit (A3 < A4 < A5 < A6) : les sauts de page affichés suivent la hauteur de la page, et le retour en A4 redonne exactement les sauts de départ',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        Editor.setHTML(lines(150));
        await h.sleep(600);
        const counts = {};
        const measure = async id => {
          apply('portrait', id);
          await h.sleep(700);
          Editor.refreshPaginationPreview();
          await h.sleep(350);
          return breaks();
        };
        for (const id of IDS) counts[id] = await measure(id);
        const backToA4 = await measure('A4');
        // Page haute utile : A4 = 277 mm, A5 = 190 mm, A3 = 400 mm (marges par défaut de 9.88 mm) : les rapports de pages suivent à un bloc près.
        const pages = id => counts[id] + 1;
        const ok = counts.A3 < counts.A4 && counts.A4 < counts.A5 && counts.A5 < counts.A6 && backToA4 === counts.A4
          && pages('A5') / pages('A4') > 1.3 && pages('A5') / pages('A4') < 2.1 && pages('A4') / pages('A3') > 1.3 && pages('A4') / pages('A3') < 2.1;
        resetPage();
        return { pass: ok, notes: 'sauts A3=' + counts.A3 + ' A4=' + counts.A4 + ' A5=' + counts.A5 + ' A6=' + counts.A6 + ' retour A4=' + backToA4 };
      },
    },
    {
      id: 'fmt_reader_pagination_matches_editor',
      description: 'La Lecture se repagine comme l\'éditeur dans plusieurs formats et sens (A3 portrait, A5 portrait, A6 paysage) : même hauteur de page, deux moteurs distincts',
      async run(h) {
        const html = lines(150);
        const problems = [];
        const seen = {};
        for (const [o, id] of [['portrait', 'A3'], ['portrait', 'A5'], ['landscape', 'A6']]) {
          await setup(h, o, id);
          Editor.setHTML(html);
          await h.sleep(700);
          Editor.refreshPaginationPreview();
          await h.sleep(350);
          const editorBreaks = breaks();
          await h.renderReaderMode(Editor.getHTML(), EMPTY_HF);
          await h.sleep(500);
          const readerBreaks = breaks('#reader-container');
          seen[o + ' ' + id] = { editor: editorBreaks, lecture: readerBreaks };
          if (editorBreaks < 1 || editorBreaks !== readerBreaks) problems.push(o + ' ' + id + ' : sauts éditeur=' + editorBreaks + ' lecture=' + readerBreaks);
        }
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
      },
    },
    {
      id: 'fmt_fit_zoom_follows_page_width',
      description: 'Le facteur d\'ajustement à la largeur disponible se calcule sur la largeur de la page du format (A5 tient sans réduction, A3 paysage tombe au plancher de 0.5), et revient à la valeur de départ en repassant en A4',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        const container = document.getElementById('editor-container');
        const originalStyle = container.getAttribute('style');
        // Panneau étroit : la feuille A4 ne tient pas, le facteur doit valoir (largeur disponible) / (largeur de la page).
        container.style.width = '700px'; container.style.flex = 'none'; container.style.maxWidth = '700px';
        await h.sleep(500); // l'observateur de redimensionnement de js/main.js recalcule
        const cs = getComputedStyle(container);
        const available = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const zoom = () => parseFloat(container.style.getPropertyValue('--pp-fit-zoom'));
        const expect = w => Math.round(Math.max(0.5, Math.min(1, available / w)) * 1000) / 1000;
        const seen = {};
        const problems = [];
        for (const [o, id] of [['portrait', 'A4'], ['portrait', 'A5'], ['landscape', 'A5'], ['portrait', 'A3'], ['landscape', 'A3'], ['portrait', 'A6'], ['portrait', 'A4']]) {
          apply(o, id);
          await h.sleep(500);
          const wanted = expect(PageLayout.getSheetWidthPx());
          seen[o + ' ' + id] = zoom();
          if (!near(zoom(), wanted, .0011)) problems.push(o + ' ' + id + ' : facteur ' + zoom() + ' (' + wanted + ' attendu pour ' + PageLayout.getSheetWidthPx() + 'px)');
        }
        if (originalStyle === null) container.removeAttribute('style'); else container.setAttribute('style', originalStyle);
        await h.sleep(300);
        // Repères : A5 portrait (559px) tient dans les 656px disponibles, A3 paysage (1587px) tombe au plancher, l'A4 d'avant garde son facteur exact.
        if (seen['portrait A5'] !== 1) problems.push('A5 portrait : facteur ' + seen['portrait A5'] + ' (1 attendu)');
        if (seen['landscape A3'] !== 0.5) problems.push('A3 paysage : facteur ' + seen['landscape A3'] + ' (plancher 0.5 attendu)');
        if (!(seen['portrait A3'] < seen['portrait A4'] && seen['portrait A4'] < seen['portrait A5'])) problems.push('l\'ordre des facteurs ne suit pas la largeur des pages');
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, available: +available.toFixed(1), seen }) };
      },
    },
    {
      id: 'fmt_saved_with_template_and_restored_on_load',
      description: 'Le format s\'enregistre avec le modèle (clé `format` de la colonne Margins) et revient à son chargement, avec le sens ; un modèle A4, un nouveau modèle, un modèle d\'avant ce réglage, un format inconnu et un macro-modèle sans réglage retombent sur l\'A4',
      async run(h) {
        const problems = [];
        const a5Id = await savedTemplate(h, 'Format A5 paysage', '<p>Petit</p>', 'landscape', 'A5');
        const a5Saved = JSON.parse(window.__gristStub.getRow(TABLE, a5Id).Margins || '{}');
        const a3Id = await savedTemplate(h, 'Format A3 portrait', '<p>Grand</p>', 'portrait', 'A3');
        const a3Saved = JSON.parse(window.__gristStub.getRow(TABLE, a3Id).Margins || '{}');
        const a4Id = await savedTemplate(h, 'Format A4 portrait', '<p>Normal</p>', 'portrait', 'A4');
        const a4Saved = JSON.parse(window.__gristStub.getRow(TABLE, a4Id).Margins || '{}');
        if (a5Saved.format !== 'A5' || a5Saved.orientation !== 'landscape') problems.push('colonne A5 paysage : ' + JSON.stringify(a5Saved));
        if (a3Saved.format !== 'A3' || a3Saved.orientation !== 'portrait') problems.push('colonne A3 : ' + JSON.stringify(a3Saved));
        if (a4Saved.format !== 'A4') problems.push('colonne A4 : ' + JSON.stringify(a4Saved));
        // Charger un modèle de format A5, A3 ou A4 n'est pas une modification : passer de l'un à l'autre ne pose jamais « Modifications non enregistrées » (h.choosePrompts garde les questions posées).
        const asked0 = h.choosePrompts.length;
        const state = () => ({ format: PageLayout.getFormat(), landscape: PageLayout.isLandscape(), css: cssPageWidth(), sheet: sheetOf() ? layoutWidth(sheetOf()) : null,
          checked: menuRows().filter(r => r.checked === 'true').map(r => r.key).join(), preview: document.getElementById('v2-a4-toggle').getAttribute('data-tip') });
        await selectTemplate(h, a5Id);
        const loadedA5 = state();
        if (loadedA5.format !== 'A5' || !loadedA5.landscape || loadedA5.css !== '793.7px' || loadedA5.checked !== 'landscape,A5' || loadedA5.preview !== 'Aperçu A5') problems.push('chargé A5 paysage : ' + JSON.stringify(loadedA5));
        if (loadedA5.sheet === null || !near(loadedA5.sheet, 210 * MM, 1)) problems.push('feuille chargée A5 paysage : ' + loadedA5.sheet);
        await selectTemplate(h, a3Id);
        const loadedA3 = state();
        if (loadedA3.format !== 'A3' || loadedA3.landscape || loadedA3.css !== '1122.52px' || loadedA3.checked !== 'portrait,A3') problems.push('chargé A3 : ' + JSON.stringify(loadedA3));
        await selectTemplate(h, a4Id);
        const loadedA4 = state();
        if (loadedA4.format !== 'A4' || loadedA4.landscape || loadedA4.css !== '793.71px' || loadedA4.checked !== 'portrait,A4' || loadedA4.preview !== 'Aperçu A4') problems.push('chargé A4 : ' + JSON.stringify(loadedA4));
        // Un nouveau modèle repart en A4 portrait, même juste après un A5 paysage.
        await selectTemplate(h, a5Id);
        await h.clickButton('btn-new');
        await h.sleep(400);
        const fresh = state();
        if (fresh.format !== 'A4' || fresh.landscape || fresh.css !== '793.71px') problems.push('nouveau modèle : ' + JSON.stringify(fresh));
        if (h.choosePrompts.length !== asked0) problems.push('charger un modèle A5, A3 ou A4 le laisse « modifié » : ' + (h.choosePrompts.length - asked0) + ' question(s) « Modifications non enregistrées » posée(s) en passant de l\'un à l\'autre');
        // Modèle d'avant ce réglage : quatre marges, ni sens ni format.
        window.__gristStub.remoteWrite(TABLE, a4Id, { Margins: JSON.stringify({ top: 12, right: 12, bottom: 12, left: 12 }) });
        await Templates.loadAll();
        await selectTemplate(h, a5Id);
        await selectTemplate(h, a4Id);
        const legacy = state();
        if (legacy.format !== 'A4' || legacy.landscape || !near(PageLayout.getMarginsMm().top, 12, .001) || legacy.css !== '793.71px') problems.push('modèle d\'avant ce réglage : ' + JSON.stringify(legacy));
        // Format inconnu écrit par une version plus récente : l'A4, et les marges sont gardées.
        window.__gristStub.remoteWrite(TABLE, a4Id, { Margins: JSON.stringify({ top: 15, right: 15, bottom: 15, left: 15, orientation: 'portrait', format: 'B7' }) });
        await Templates.loadAll();
        await selectTemplate(h, a5Id);
        await selectTemplate(h, a4Id);
        const unknown = state();
        if (unknown.format !== 'A4' || unknown.css !== '793.71px' || !near(PageLayout.getMarginsMm().top, 15, .001)) problems.push('format inconnu : ' + JSON.stringify(unknown));
        // Un macro-modèle sans réglage de page ne suit pas le format du modèle précédent : A4 portrait. Son bouton est actif (il a sa propre page : dev-tests/scenarios-macro-modeles.js).
        await selectTemplate(h, a5Id);
        const macro = await Templates.save(null, 'Format macro', JSON.stringify({ slots: [] }), '', null, null, 'macro', null);
        await Templates.loadAll();
        const select = document.getElementById('template-select');
        if (!Array.from(select.options).some(o => o.value === String(macro.id))) {
          const option = document.createElement('option'); option.value = String(macro.id); option.textContent = 'Format macro'; select.appendChild(option);
        }
        await selectTemplate(h, macro.id);
        const macroState = state();
        if (macroState.format !== 'A4' || macroState.landscape || macroState.css !== '793.71px' || macroState.checked !== 'portrait,A4' || document.getElementById('btn-page-orientation').disabled) problems.push('macro-modèle : ' + JSON.stringify(macroState));
        await selectTemplate(h, a4Id);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, a5Saved, a3Saved }) };
      },
    },
    {
      id: 'fmt_margins_are_clamped_to_small_pages_and_settings_limits_follow',
      description: 'Une marge trop grande pour une petite page est ramenée (la zone de texte garde au moins 20 mm, jamais négative) et les plafonds des champs de Réglages suivent la page du format et du sens',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        const problems = [];
        PageLayout.setMarginsMm({ top: 30, right: 25, bottom: 20, left: 80 });
        const before = Object.assign({}, PageLayout.getMarginsMm());
        apply('portrait', 'A6');
        await h.sleep(300);
        const a6 = Object.assign({}, PageLayout.getMarginsMm());
        if (a6.left + a6.right > 105 - 20 + .001 || PageLayout.getContentWidthMm() < 20 - .001) problems.push('A6 : zone de texte ' + PageLayout.getContentWidthMm().toFixed(2) + ' mm, marges ' + JSON.stringify(a6));
        if (!(a6.left < before.left)) problems.push('A6 : la marge gauche de 80 mm n\'a pas été réduite');
        if (a6.top !== before.top || a6.bottom !== before.bottom) problems.push('A6 : les marges du haut et du bas (30 et 20 mm tiennent dans 148 mm) ont bougé');
        ['top', 'right', 'bottom', 'left'].forEach(k => { if (!(a6[k] >= 0)) problems.push('A6 : marge ' + k + ' négative'); });
        apply('landscape', 'A6');
        await h.sleep(300);
        if (PageLayout.getContentHeightMm() < 20 - .001 || PageLayout.getContentWidthMm() < 20 - .001) problems.push('A6 paysage : zone de texte ' + PageLayout.getContentWidthMm().toFixed(1) + ' x ' + PageLayout.getContentHeightMm().toFixed(1));
        // Plafonds des champs : page moins 20 mm, haut / droite / bas / gauche.
        const limits = () => ['top', 'right', 'bottom', 'left'].map(s => Number(document.getElementById('settings-margin-' + s).max));
        const readLimits = async (o, id) => {
          apply(o, id);
          await h.sleep(250);
          document.getElementById('v2-btn-settings').click();
          await h.sleep(150);
          const l = limits();
          document.getElementById('settings-close').click();
          return JSON.stringify(l);
        };
        const expected = { 'portrait A4': [277, 190, 277, 190], 'portrait A5': [190, 128, 190, 128], 'landscape A5': [128, 190, 128, 190], 'portrait A3': [400, 277, 400, 277], 'portrait A6': [128, 85, 128, 85] };
        for (const key of Object.keys(expected)) {
          const [o, id] = key.split(' ');
          const got = await readLimits(o, id);
          if (got !== JSON.stringify(expected[key])) problems.push(key + ' : plafonds ' + got + ' (' + JSON.stringify(expected[key]) + ' attendu)');
        }
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, avant: before, a6 }) };
      },
    },
    {
      id: 'fmt_pdf_page_size_per_format_and_orientation',
      description: 'Le PDF de chaque format est une page de la taille de pdfmake (A3 841.89 x 1190.55 pt, A4, A5, A6), dans les deux sens, avec le nom de format et le sens dans la définition du document',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        const problems = [];
        const seen = {};
        for (const o of ['portrait', 'landscape']) {
          for (const id of IDS) {
            apply(o, id);
            await h.sleep(120);
            const { dd, gt } = await pdfOf(h, '<p>Texte ' + id + ' ' + o + '</p>');
            const page = gt.pages[0];
            const expected = dims(id, o, 'pt');
            seen[o + ' ' + id] = [+page.width.toFixed(2), +page.height.toFixed(2)];
            if (dd.pageSize !== id || dd.pageOrientation !== o) problems.push(o + ' ' + id + ' : pageSize=' + dd.pageSize + ' pageOrientation=' + dd.pageOrientation);
            if (!near(page.width, expected.width, .5) || !near(page.height, expected.height, .5)) problems.push(o + ' ' + id + ' : page du PDF ' + page.width.toFixed(2) + ' x ' + page.height.toFixed(2) + ' (' + expected.width + ' x ' + expected.height + ' attendu)');
          }
        }
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
      },
    },
    {
      id: 'fmt_pdf_text_width_and_page_count_follow_format',
      description: 'Dans le PDF, le texte se répartit sur la largeur de contenu du format (A5 : jamais au-delà de la marge droite de 419.53 pt, A3 : bien plus large que l\'A4) et le même texte compte plus de pages dans un format plus petit',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        const problems = [];
        const para = '<p>' + Array.from({ length: 140 }, (_, i) => 'mot' + i).join(' ') + '</p>';
        const rightMostOf = async id => {
          apply('portrait', id);
          await h.sleep(120);
          const { gt } = await pdfOf(h, para);
          return Math.max.apply(null, gt.pages[0].textItems.map(t => t.x + t.width));
        };
        const a4Right = await rightMostOf('A4'); const a5Right = await rightMostOf('A5'); const a3Right = await rightMostOf('A3'); const a6Right = await rightMostOf('A6');
        if (!(a5Right <= 419.53 - 28 + 1 && a5Right > 300)) problems.push('A5 : le texte va jusqu\'à x=' + a5Right.toFixed(1) + ' (limite ' + (419.53 - 28).toFixed(1) + ')');
        if (!(a6Right <= 297.64 - 28 + 1 && a6Right > 200)) problems.push('A6 : le texte va jusqu\'à x=' + a6Right.toFixed(1) + ' (limite ' + (297.64 - 28).toFixed(1) + ')');
        if (!(a4Right <= 595.28 - 28 + 1)) problems.push('A4 : le texte va jusqu\'à x=' + a4Right.toFixed(1));
        if (!(a3Right > 595.28 - 28 && a3Right <= 841.89 - 28 + 1)) problems.push('A3 : le texte va jusqu\'à x=' + a3Right.toFixed(1) + ' (entre ' + (595.28 - 28).toFixed(0) + ' et ' + (841.89 - 28).toFixed(0) + ' attendu)');
        // Nombre de pages du PDF pour 120 lignes.
        const html = lines(120);
        const pageCounts = {};
        for (const id of IDS) {
          apply('portrait', id);
          await h.sleep(120);
          const { gt } = await pdfOf(h, html);
          pageCounts[id] = gt.pages.length;
        }
        if (!(pageCounts.A3 < pageCounts.A4 && pageCounts.A4 < pageCounts.A5 && pageCounts.A5 < pageCounts.A6)) problems.push('pages du PDF : ' + JSON.stringify(pageCounts) + ' (A3 < A4 < A5 < A6 attendu)');
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, droite: { A3: +a3Right.toFixed(1), A4: +a4Right.toFixed(1), A5: +a5Right.toFixed(1), A6: +a6Right.toFixed(1) }, pageCounts }) };
      },
    },
    {
      id: 'fmt_pdf_table_fills_format_width',
      description: 'Un tableau sans largeurs imposées occupe toute la largeur de contenu du format dans le PDF (A5 plus étroit que l\'A4, A3 plus large)',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        const sum = r => {
          const t = h.flattenPdfContent(r.docDefinition.content).find(b => b && b.table);
          return t ? t.table.widths.reduce((a, w) => a + (typeof w === 'number' ? w : w.width), 0) : null;
        };
        const widths = {};
        for (const id of ['A4', 'A5', 'A3']) {
          apply('portrait', id);
          await h.sleep(120);
          widths[id] = sum(await h.exportPdfContent(TABLE_HTML, null, PageLayout.getMarginsPt()));
        }
        const content = id => dims(id, 'portrait', 'pt').width - 56;
        const problems = [];
        Object.keys(widths).forEach(id => {
          if (widths[id] === null || widths[id] > content(id) + 1) problems.push(id + ' : somme des largeurs ' + widths[id] + ' (contenu ' + content(id).toFixed(1) + ')');
        });
        // Le tableau laisse le même retrait (bordures, remplissage) qu'en A4 : l'écart de largeur d'un format à l'autre est celui des pages.
        if (widths.A4 !== null && widths.A5 !== null && !near(widths.A4 - widths.A5, content('A4') - content('A5'), 1.5)) problems.push('A5 : largeur ' + widths.A5 + ' pour ' + widths.A4 + ' en A4 (écart de pages ' + (content('A4') - content('A5')).toFixed(1) + ')');
        if (widths.A4 !== null && widths.A3 !== null && !near(widths.A3 - widths.A4, content('A3') - content('A4'), 1.5)) problems.push('A3 : largeur ' + widths.A3 + ' pour ' + widths.A4 + ' en A4 (écart de pages ' + (content('A3') - content('A4')).toFixed(1) + ')');
        resetPage();
        return { pass: problems.length === 0 && widths.A5 < widths.A4 && widths.A4 < widths.A3, notes: JSON.stringify({ problems, widths }) };
      },
    },
    {
      id: 'fmt_pdf_header_footer_and_page_numbers_follow_format',
      description: 'Avec un en-tête, un pied de page et un numéro de page, le PDF A5 et A3 pose l\'en-tête en haut et le pied en bas de CHAQUE page, à la hauteur du format (pas de celle de l\'A4), avec le bon numéro de page',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED <span class="page-number-badge" data-format="page-n"></span></p>', first: '' } };
        const problems = [];
        const seen = {};
        for (const id of ['A5', 'A3']) {
          apply('portrait', id);
          await h.sleep(150);
          const { gt } = await pdfOf(h, lines(100), hf);
          const height = FORMATS[id].pt[1];
          seen[id] = gt.pages.length;
          if (gt.pages.length < 2) problems.push(id + ' : une seule page');
          gt.pages.forEach((page, i) => {
            if (!near(page.height, height, .5)) problems.push(id + ' page ' + (i + 1) + ' : hauteur ' + page.height.toFixed(2));
            // pdf.js coupe « EN-TETE » au trait d'union : le texte du haut de la page est relu en entier.
            const head = page.textItems.filter(t => t.y < 70);
            const foot = page.textItems.filter(t => t.y > height - 90);
            const footText = foot.map(t => t.str).join(' ');
            if (head.map(t => t.str).join('') !== 'EN-TETE') problems.push(id + ' page ' + (i + 1) + ' : haut de page « ' + head.map(t => t.str).join('') + ' »');
            const number = /PIED\s*Page\s*(\d+)/.exec(footText);
            if (!number || Number(number[1]) !== i + 1) problems.push(id + ' page ' + (i + 1) + ' : pied « ' + footText.trim() + ' »');
            if (foot.some(t => t.y > height - 20)) problems.push(id + ' page ' + (i + 1) + ' : pied hors de la page');
          });
        }
        resetPage();
        return { pass: problems.length === 0 && seen.A3 < seen.A5, notes: JSON.stringify({ problems, pages: seen }) };
      },
    },
    {
      id: 'fmt_docx_page_size_per_format_and_orientation',
      description: 'Le .docx de chaque format déclare sa page (w:pgSz : A3 16838 x 23811 twips, A4, A5 8391 x 11906, A6 5953 x 8391), en paysage avec w:orient et les dimensions échangées, et garde les mêmes marges d\'un format à l\'autre',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        PageLayout.setMarginsMm({ top: 30, right: 25, bottom: 20, left: 35 });
        const problems = [];
        const seen = {};
        const marginsSeen = new Set();
        for (const o of ['portrait', 'landscape']) {
          for (const id of IDS) {
            apply(o, id);
            await h.sleep(120);
            const parts = await h.exportDocxParts('<p>Texte ' + id + '</p>', null, PageLayout.getMarginsTwip());
            const sect = h.docxSectionProps(parts.doc);
            const expected = dims(id, o, 'twip');
            seen[o + ' ' + id] = [sect.widthTwip, sect.heightTwip, sect.orient];
            if (sect.widthTwip !== expected.width || sect.heightTwip !== expected.height) problems.push(o + ' ' + id + ' : page ' + sect.widthTwip + ' x ' + sect.heightTwip + ' (' + expected.width + ' x ' + expected.height + ' attendu)');
            if ((o === 'landscape') !== (sect.orient === 'landscape')) problems.push(o + ' ' + id + ' : w:orient=' + sect.orient);
            marginsSeen.add(JSON.stringify([sect.margins.top, sect.margins.right, sect.margins.bottom, sect.margins.left]));
          }
        }
        if (marginsSeen.size !== 1) problems.push('les marges du .docx changent avec le format : ' + Array.from(marginsSeen).join(' | '));
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
      },
    },
    {
      id: 'fmt_docx_table_and_columns_use_format_width',
      description: 'Dans le .docx A5 et A3, un tableau et une zone à deux colonnes occupent la largeur de contenu de la page du format',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        const problems = [];
        const seen = {};
        for (const [o, id] of [['portrait', 'A5'], ['portrait', 'A3'], ['landscape', 'A5']]) {
          apply(o, id);
          await h.sleep(150);
          const twip = PageLayout.getMarginsTwip();
          const contentTwip = dims(id, o, 'twip').width - twip.left - twip.right;
          const table = await h.exportDocxParts(TABLE_HTML, null, twip);
          const tableGrid = h.docxTables(table.doc)[0];
          const gridSum = tableGrid ? tableGrid.gridCols.reduce((a, w) => a + w, 0) : null;
          const zone = await h.exportDocxParts(TWO_COL_HTML(40), null, twip);
          const zoneGrid = h.docxTables(zone.doc)[0];
          const zoneSum = zoneGrid ? zoneGrid.gridCols.reduce((a, w) => a + w, 0) : null;
          seen[o + ' ' + id] = { contenu: contentTwip, tableau: gridSum, zone: zoneGrid && zoneGrid.gridCols };
          // Le tableau mesure ses colonnes dans le navigateur, arrondies au pixel : un écart de moins d'un millimètre sur la largeur totale existe aussi en A4.
          if (gridSum === null || !near(gridSum, contentTwip, 100)) problems.push(o + ' ' + id + ' : tableau ' + gridSum + ' (contenu ' + contentTwip + ')');
          if (zoneSum === null || !near(zoneSum, contentTwip, 3) || !(zoneGrid.gridCols[2] > 0)) problems.push(o + ' ' + id + ' : zone ' + JSON.stringify(zoneGrid && zoneGrid.gridCols) + ' (contenu ' + contentTwip + ')');
        }
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
      },
    },
    {
      id: 'fmt_wide_left_column_survives_a_small_page',
      description: 'Une colonne gauche de 100 mm (réglée en A4) ne laisse pas la colonne droite négative en A6 (85 mm utiles) : à l\'écran, dans le PDF et dans le .docx, et le réglage revient en repassant en A4',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        Editor.setHTML(TWO_COL_HTML(100));
        await h.sleep(500);
        const a4Cols = columnWidthsMm(h.tiptap());
        apply('portrait', 'A6');
        await h.sleep(600);
        const contentMm = PageLayout.getContentWidthMm();
        const cols = columnWidthsMm(h.tiptap());
        const gapMm = PageLayout.getColumnGapMm();
        const editorOk = cols.length === 2 && cols[0] >= 9.5 && cols[1] >= 9.5 && cols[0] + gapMm + cols[1] <= contentMm + .6;
        const pdf = await h.exportPdfContent(Editor.getHTML(), null, PageLayout.getMarginsPt());
        const gt = await h.extractPdfGroundTruth(pdf.base64);
        // La colonne droite ne mesure que 10 mm : son mot se coupe en plusieurs morceaux, on prend donc tout ce que le PDF peint à droite de la colonne gauche.
        const rightItems = gt.pages[0].textItems.filter(t => t.x > 28 + 60 * MM_TO_PT);
        const right = rightItems.length ? Math.max.apply(null, rightItems.map(t => t.x + t.width)) : null;
        const pdfOk = right !== null && right <= 297.64 - 28 + 1;
        const docx = await h.exportDocxParts(Editor.getHTML(), null, PageLayout.getMarginsTwip());
        const grid = h.docxTables(docx.doc)[0];
        const twip = PageLayout.getMarginsTwip();
        const contentTwip = 5953 - twip.left - twip.right;
        const docxOk = !!grid && grid.gridCols.length === 3 && grid.gridCols.every(w => w > 0) && grid.gridCols.reduce((a, w) => a + w, 0) <= contentTwip + 3;
        // Le réglage de 100 mm n'est pas réécrit : il revient tel quel en A4.
        const serialized = /--layout-left-mm:\s*([\d.]+)mm/.exec(Editor.getHTML());
        apply('portrait', 'A4');
        await h.sleep(500);
        const backCols = columnWidthsMm(h.tiptap());
        const restored = serialized && near(+serialized[1], 100, .01) && near(backCols[0], 100, .6);
        resetPage();
        return {
          pass: near(a4Cols[0], 100, .6) && editorOk && pdfOk && docxOk && !!restored,
          notes: 'A4=' + a4Cols.map(v => v.toFixed(1)) + ' A6=' + cols.map(v => v.toFixed(1)) + ' (contenu ' + contentMm.toFixed(1) + ') pdf droite=' + (right && right.toFixed(1)) + ' docx=' + JSON.stringify(grid && grid.gridCols) + ' retour A4=' + backCols.map(v => v.toFixed(1)),
        };
      },
    },
    {
      id: 'fmt_wide_table_is_brought_back_inside_a_smaller_page',
      description: 'Un tableau aux colonnes réglées (900 px, déjà ramené à 720 px par l\'A4) passé en A5 est ramené dans la zone de texte de la page, comme au changement de marges (clampOverflowingTables) ; le PDF et le .docx A5 le gardent dans la page',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        const wide = '<table><tbody><tr><td colwidth="300"><p>un</p></td><td colwidth="300"><p>deux</p></td><td colwidth="300"><p>trois</p></td></tr></tbody></table>';
        Editor.setHTML(wide);
        await h.sleep(500);
        const ed = EditorCore.getEditor();
        const totalPx = () => { let total = 0; ed.state.doc.descendants(node => { if (node.type.name === 'table') node.firstChild.forEach(c => { total += (c.attrs.colwidth || [25]).reduce((a, w) => a + w, 0); }); return node.type.name !== 'table'; }); return total; };
        const a4Total = totalPx();
        apply('portrait', 'A5');
        await h.sleep(800);
        const contentPx = EditorCore.editorContentWidthPx(ed);
        const a5Total = totalPx();
        const tableEl = h.tiptap().querySelector('table');
        const rendered = tableEl.getBoundingClientRect().width / zoomOf(tableEl);
        const pdf = await h.exportPdfContent(Editor.getHTML(), null, PageLayout.getMarginsPt());
        const pdfTable = h.flattenPdfContent(pdf.docDefinition.content).find(b => b && b.table);
        const pdfSum = pdfTable ? pdfTable.table.widths.reduce((a, w) => a + (typeof w === 'number' ? w : w.width), 0) : null;
        const docx = await h.exportDocxParts(Editor.getHTML(), null, PageLayout.getMarginsTwip());
        const grid = h.docxTables(docx.doc)[0];
        const twip = PageLayout.getMarginsTwip();
        const gridSum = grid ? grid.gridCols.reduce((a, w) => a + w, 0) : null;
        const ok = a4Total > contentPx && a5Total <= contentPx + 3 && rendered <= contentPx + 4
          && pdfSum !== null && pdfSum <= (419.53 - 56) + 1 && gridSum !== null && gridSum <= (8391 - twip.left - twip.right) + 100;
        resetPage();
        return { pass: ok, notes: 'colonnes A4=' + a4Total + 'px, A5=' + a5Total + 'px (zone de texte ' + contentPx.toFixed(1) + 'px) tableau rendu=' + rendered.toFixed(1) + ' pdf=' + (pdfSum && pdfSum.toFixed(1)) + ' docx=' + gridSum };
      },
    },
    {
      id: 'fmt_layered_image_follows_its_text_to_another_page',
      description: 'Une image en calque suit son texte quand le changement de format le fait passer sur une autre page (A4 puis A5, puis A3) : la grille est relue et le PDF la peint sur la page de son texte, à la hauteur que l\'éditeur montre',
      async run(h) {
        const placed = await placeLayeredImageAtAnchor(h);
        if (placed.error) return { pass: false, notes: placed.error };
        const { gridOf } = placed;
        const painted = async () => {
          const pdf = await h.exportPdfContent(Editor.getHTML(), null, PageLayout.getMarginsPt());
          const gt = await h.extractPdfGroundTruth(pdf.base64);
          const pageOfText = gt.pages.findIndex(p => p.textItems.some(t => t.str.indexOf('ANCRE') !== -1));
          const pageOfImage = gt.pages.findIndex(p => p.images.length > 0);
          return { pageOfText, pageOfImage, imageY: pageOfImage >= 0 ? gt.pages[pageOfImage].images[0].y : null };
        };
        const problems = [];
        const seen = {};
        for (const id of ['A4', 'A5', 'A3']) {
          if (id !== 'A4') { apply('portrait', id); await h.sleep(900); }
          const grid = gridOf();
          const pdf = await painted();
          seen[id] = { grille: grid && { i: grid.pageIndex, t: Math.round(grid.pageTopPt * 10) / 10 }, pdf };
          if (!grid || pdf.pageOfText < 0 || pdf.pageOfText !== pdf.pageOfImage) problems.push(id + ' : le PDF peint l\'image sur la page ' + pdf.pageOfImage + ' et son texte sur la page ' + pdf.pageOfText);
          // L'image est peinte là où l'éditeur la montre (grille recapturée : page et hauteur).
          else if (grid.pageIndex !== pdf.pageOfImage || !near(pdf.imageY, 28 + grid.pageTopPt, 2)) problems.push(id + ' : grille page ' + grid.pageIndex + ' / ' + grid.pageTopPt.toFixed(1) + ' mais PDF page ' + pdf.pageOfImage + ' / y=' + (pdf.imageY && pdf.imageY.toFixed(1)));
        }
        if (!(seen.A5.grille && seen.A4.grille && seen.A3.grille && seen.A5.grille.i > seen.A4.grille.i && seen.A4.grille.i > seen.A3.grille.i)) problems.push('la page de l\'image ne suit pas le format : ' + JSON.stringify([seen.A3.grille, seen.A4.grille, seen.A5.grille]));
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
      },
    },
    {
      id: 'fmt_with_track_changes_on_the_grid_recapture_is_not_a_suggestion',
      description: 'Suivi des modifications actif : changer de format relit la grille de l\'image en calque sans la transformer en suppression + insertion à accepter ou refuser',
      async run(h) {
        const placed = await placeLayeredImageAtAnchor(h);
        if (placed.error) return { pass: false, notes: placed.error };
        const { ed, gridOf } = placed;
        const before = Object.assign({}, gridOf());
        if (!Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
        const tracking = Editor.isTrackChangesOn();
        let after = null; let pending = null; let fresh = null; let images = 0;
        try {
          apply('portrait', 'A5');
          await h.sleep(900);
          after = Object.assign({}, gridOf());
          pending = Editor.hasPendingTrackedChanges();
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
        resetPage();
        return {
          pass: tracking && pending === false && images === 1 && moved && matchesEditor,
          notes: 'suivi actif=' + tracking + ' suggestions en attente=' + pending + ' images=' + images + ' grille avant=' + JSON.stringify({ i: before.pageIndex, t: before.pageTopPt })
            + ' apres=' + JSON.stringify(after && { i: after.pageIndex, t: after.pageTopPt }) + ' mesure=' + JSON.stringify(fresh && { i: fresh.pageIndex, t: fresh.pageTopPt }),
        };
      },
    },
    {
      id: 'fmt_exports_without_format_stay_a4',
      description: 'Un appelant d\'avant ce réglage (marges sans format), ou avec un format inconnu, obtient exactement l\'A4 d\'avant dans le PDF et le .docx, en portrait comme en paysage',
      async run(h) {
        await setup(h, 'portrait', 'A4');
        const problems = [];
        const legacyPt = { top: 28, right: 28, bottom: 28, left: 28 };
        const legacyTwip = { top: 560, right: 560, bottom: 560, left: 560 };
        const variants = [
          ['sans format', {}, 'portrait'], ['format inconnu', { format: 'B7' }, 'portrait'], ['paysage sans format', { orientation: 'landscape' }, 'landscape'],
        ];
        for (const [label, extra, o] of variants) {
          const pdf = await h.exportPdfContent('<p>Texte</p>', null, Object.assign({}, legacyPt, extra));
          const gt = await h.extractPdfGroundTruth(pdf.base64);
          const expected = dims('A4', o, 'pt');
          if (pdf.docDefinition.pageSize !== 'A4' || !near(gt.pages[0].width, expected.width, .5) || !near(gt.pages[0].height, expected.height, .5)) problems.push(label + ' : PDF ' + pdf.docDefinition.pageSize + ' ' + gt.pages[0].width.toFixed(2) + ' x ' + gt.pages[0].height.toFixed(2));
          const docx = await h.exportDocxParts('<p>Texte</p>', null, Object.assign({}, legacyTwip, extra));
          const sect = h.docxSectionProps(docx.doc);
          const expectedTwip = dims('A4', o, 'twip');
          if (sect.widthTwip !== expectedTwip.width || sect.heightTwip !== expectedTwip.height) problems.push(label + ' : .docx ' + sect.widthTwip + ' x ' + sect.heightTwip);
        }
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
  ];
})();
