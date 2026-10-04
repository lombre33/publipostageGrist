// Format de page libre : la page du modèle à la taille saisie en centimètres (ligne « Format libre… » du menu Page, js/page-size-dialog.js), suite des formats A3 à A6
// (dev-tests/scenarios-page-format.js). Demande d'Antoine du 04/10 : « donner la longueur / largeur en cm d'un modèle, l'enregistrer, et que ça fonctionne sur la feature d'assemblage ».
// La taille voyage avec le modèle dans la clé `format` du JSON de la colonne Margins : « LARGEURxHAUTEUR » en millimètres, côté court d'abord (« 37x70 » est une page de 3,7 x 7 cm,
// que `orientation` tourne en paysage) ; une dimension égale à celle d'un format de la liste redevient ce format. js/page-layout.js (formatOf, setPageSize) est la seule source : l'aperçu, la
// pagination, la Lecture, js/pdf-export.js, js/docx-export.js et l'assemblage avant impression (dev-tests/scenarios-sheet-assembly.js) la lisent comme ils lisent un format de la liste.
//
// Les dimensions attendues sont écrites ICI en dur (points de pdfmake, twips de Word), calculées d'après les millimètres sans passer par PageLayout : si sa conversion dérive, ce fichier le voit.
// La fenêtre et la ligne du menu sont atteintes par leurs VRAIS éléments (`click()` sur la ligne, valeurs posées dans les champs avec l'événement `input`) ; la souris réelle, à 700x400, est dans
// verify-page-size-mouse.mjs.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.pageSize = (function () {
  const MM = PageLayout.MM_TO_PX;
  const PT_PER_MM = 72 / 25.4;
  const TWIP_PER_MM = 1440 / 25.4;
  const TABLE = 'Publipostage_Modeles';
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  function near(a, b, tol) { return Math.abs(a - b) <= tol; }
  function lines(n) { return Array.from({ length: n }, (_, i) => '<p>Ligne ' + i + ' du document de test de pagination.</p>').join(''); }
  function zoomOf(el) { const z = parseFloat(getComputedStyle(el).zoom); return (isFinite(z) && z > 0) ? z : 1; }
  function layoutWidth(el) { return el.getBoundingClientRect().width / zoomOf(el); }
  function sheetOf(scope) { return document.querySelector((scope || '#editor-container') + ' .v2-page-sheet'); }
  function cssPageWidth() { return document.documentElement.style.getPropertyValue('--pp-page-width'); }
  function breaks(scope) { return document.querySelectorAll((scope || '#editor-container') + ' .v2-page-break-line').length; }
  function escape() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }

  // Repart d'un modèle neuf, en Aperçu A4 (toute mesure de page n'a de sens qu'avec lui). La remise à zéro des marges est silencieuse : l'événement de réajustement est envoyé à la main.
  async function setup(h) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    h.setA4Preview(true);
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.sleep(300);
  }
  function resetPage() {
    closeWindowIfOpen();
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
  }
  async function newDocument(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await h.sleep(300); }
  async function newEmail(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-email'); await h.sleep(300); }

  // Le geste de la personne : la page saisie passe par OrientationToggle (gardes, enregistrement automatique), comme « Valider » de la fenêtre.
  function applySize(widthMm, heightMm) { return OrientationToggle.selectPageSize(widthMm, heightMm); }

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
  const checkedKeys = () => menuRows().filter(r => r.checked === 'true').map(r => r.key).join();

  // La fenêtre « Format libre… ».
  const modal = () => document.getElementById('pp-pagesize-modal');
  const isOpen = () => !!modal() && modal().style.display !== 'none';
  const field = side => document.getElementById('pp-pagesize-' + side);
  function type(side, value) { const input = field(side); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  const okButton = () => modal().querySelector('.var-modal-actions .var-modal-primary');
  const cancelButton = () => modal().querySelector('.var-modal-actions button:not(.var-modal-primary):not(.pp-pagesize-save)');
  function closeWindowIfOpen() { if (isOpen()) cancelButton().click(); }
  function windowState() {
    const sheet = modal().querySelector('.pp-pagesize-sheet');
    const error = document.getElementById('pp-pagesize-error');
    return {
      title: modal().querySelector('h3').textContent,
      labels: Array.from(modal().querySelectorAll('.pp-pagesize-label')).map(l => l.textContent),
      aria: [field('width').getAttribute('aria-label'), field('height').getAttribute('aria-label')],
      width: field('width').value, height: field('height').value,
      invalid: [field('width').getAttribute('aria-invalid') === 'true', field('height').getAttribute('aria-invalid') === 'true'],
      error: error.hidden ? '' : error.textContent,
      hint: document.getElementById('pp-pagesize-hint').textContent,
      caption: modal().querySelector('.pp-pagesize-caption').textContent,
      orientation: modal().querySelector('.pp-pagesize-orientation').textContent,
      okDisabled: okButton().disabled, buttons: [cancelButton().textContent, okButton().textContent],
      sheet: { w: parseFloat(sheet.style.width), h: parseFloat(sheet.style.height) },
    };
  }
  async function openWindowByRow(h) {
    menuRow('custom').click();
    await h.sleep(150);
    return isOpen();
  }

  async function savedTemplate(h, nom, html, widthMm, heightMm) {
    // « Nouveau » d'abord : sans lui, Enregistrer réécrirait le modèle précédent au lieu d'en créer un.
    await h.clickButton('btn-new');
    await h.sleep(300);
    await setup(h);
    if (widthMm) applySize(widthMm, heightMm);
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
  async function pdfOf(h, html, withHeaderFooter) {
    const result = await h.exportPdfContent(html, withHeaderFooter || null, PageLayout.getMarginsPt());
    return { dd: result.docDefinition, gt: await h.extractPdfGroundTruth(result.base64), result };
  }

  // Trois pages libres, leurs dimensions (portrait : côté court d'abord) dans chaque unité.
  const FREE = {
    '37x70': { mm: [37, 70], pt: [37 * PT_PER_MM, 70 * PT_PER_MM], twip: [2098, 3969] },
    '100x150': { mm: [100, 150], pt: [100 * PT_PER_MM, 150 * PT_PER_MM], twip: [5669, 8504] },
    '558.8x558.8': { mm: [558.8, 558.8], pt: [1584, 1584], twip: [31680, 31680] },
  };

  return [
    {
      id: 'psize_formatof_reads_canonicalizes_and_bounds_the_dimension',
      description: 'Un identifiant « LxH » est lu (casse, blancs, un seul décimal), remis côté court d\'abord, borné de 20 à 558,8 mm, et redevient A3 à A6 quand il en a les dimensions ; tout ce qui n\'est pas une dimension (virgule, quatre chiffres, trois valeurs, nombre, absent) est l\'A4 ; la liste proposée ne gagne aucune ligne',
      async run() {
        const problems = [];
        const cases = [
          ['37x70', '37x70'], ['70x37', '37x70'], ['70X37', '37x70'], [' 37x70 ', '37x70'], ['37.0x70.0', '37x70'], ['37.5x70', '37.5x70'], ['100x150', '100x150'],
          ['210x297', 'A4'], ['297x210', 'A4'], ['148x210', 'A5'], ['420x297', 'A3'], ['105x148', 'A6'], ['210.0x297.0', 'A4'],
          ['5x5', '20x20'], ['0x0', '20x20'], ['999x999', '558.8x558.8'], ['10x700', '20x558.8'], ['558.8x558.8', '558.8x558.8'],
          ['1000x50', 'A4'], ['37x', 'A4'], ['x70', 'A4'], ['37,5x70', 'A4'], ['37x70x80', 'A4'], ['-37x70', 'A4'], ['37.55x70', 'A4'], ['B7', 'A4'], ['', 'A4'], [42, 'A4'], [null, 'A4'], [undefined, 'A4'],
        ];
        cases.forEach(([value, expected]) => {
          const got = PageLayout.normalizeFormat(value);
          if (got !== expected) problems.push(JSON.stringify(value) + ' -> ' + got + ' (' + expected + ' attendu)');
        });
        // Idempotent : un identifiant déjà normalisé ne bouge plus.
        ['37x70', '37.5x70', '20x558.8', '558.8x558.8', 'A5'].forEach(id => { if (PageLayout.normalizeFormat(PageLayout.normalizeFormat(id)) !== PageLayout.normalizeFormat(id)) problems.push('pas idempotent : ' + id); });
        if (!PageLayout.isCustomFormat('37x70') || !PageLayout.isCustomFormat('70x37') || PageLayout.isCustomFormat('A4') || PageLayout.isCustomFormat('210x297') || PageLayout.isCustomFormat('B7') || PageLayout.isCustomFormat(undefined)) problems.push('isCustomFormat');
        if (JSON.stringify(PageLayout.getFormats().map(f => f.id)) !== JSON.stringify(['A3', 'A4', 'A5', 'A6'])) problems.push('la liste proposée a changé : ' + JSON.stringify(PageLayout.getFormats().map(f => f.id)));
        if (PageLayout.CUSTOM_MIN_MM !== 20 || PageLayout.CUSTOM_MAX_MM !== 558.8) problems.push('bornes : ' + PageLayout.CUSTOM_MIN_MM + ' ' + PageLayout.CUSTOM_MAX_MM);
        // Le format voyage tel quel dans les marges lues d'un modèle (colonne Margins) : clé abîmée = A4, marges gardées.
        PageLayout.setMarginsMm({ top: 15, right: 15, bottom: 15, left: 15, format: '37X70', orientation: 'landscape' });
        if (PageLayout.getFormat() !== '37x70' || !PageLayout.isLandscape()) problems.push('JSON écrit à la main : ' + PageLayout.getFormat());
        PageLayout.setMarginsMm({ top: 15, right: 15, bottom: 15, left: 15, format: 'axb' });
        if (PageLayout.getFormat() !== 'A4' || !near(PageLayout.getMarginsMm().top, 15, .001)) problems.push('identifiant abîmé : ' + PageLayout.getFormat());
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'psize_dimensions_in_every_unit',
      description: 'Une page libre a ses dimensions attendues en millimètres, en points (pdfmake), en twips (Word) et en pixels (écran), dans les deux sens, et le plafond de 558,8 mm fait exactement les 31680 twips (22 pouces) que Word accepte',
      async run() {
        const problems = [];
        const seen = {};
        Object.keys(FREE).forEach(id => {
          const e = FREE[id];
          ['portrait', 'landscape'].forEach(o => {
            const swap = a => o === 'landscape' ? { width: a[1], height: a[0] } : { width: a[0], height: a[1] };
            const mm = PageLayout.pageSizeMmFor(o, id); const pt = PageLayout.pageSizePtFor(o, id); const tw = PageLayout.pageSizeTwipFor(o, id);
            const em = swap(e.mm); const ep = swap(e.pt); const et = swap(e.twip);
            seen[id + ' ' + o] = [mm.width, mm.height, +pt.width.toFixed(2), +pt.height.toFixed(2), tw.width, tw.height];
            if (mm.width !== em.width || mm.height !== em.height) problems.push(id + ' ' + o + ' mm ' + JSON.stringify(mm));
            if (!near(pt.width, ep.width, .01) || !near(pt.height, ep.height, .01)) problems.push(id + ' ' + o + ' pt ' + JSON.stringify(pt));
            if (tw.width !== et.width || tw.height !== et.height) problems.push(id + ' ' + o + ' twip ' + JSON.stringify(tw));
          });
          // La page courante, dans toutes les unités, suit le format posé.
          PageLayout.setMarginsMm({ format: id, orientation: 'landscape' });
          const mm = PageLayout.getPageSizeMm(); const px = PageLayout.getPageSizePx(); const twip = PageLayout.getPageSizeTwip(); const pt = PageLayout.getPageSizePt();
          if (mm.width !== e.mm[1] || mm.height !== e.mm[0]) problems.push(id + ' page courante en mm : ' + JSON.stringify(mm));
          if (!near(px.width, e.mm[1] * MM, .01) || !near(px.height, e.mm[0] * MM, .01)) problems.push(id + ' page courante en px : ' + JSON.stringify(px));
          if (!near(twip.width, e.twip[1], 1) || !near(twip.height, e.twip[0], 1)) problems.push(id + ' page courante en twips : ' + JSON.stringify(twip));
          if (!near(pt.width, e.pt[1], .05) || !near(pt.height, e.pt[0], .05)) problems.push(id + ' page courante en pt : ' + JSON.stringify(pt));
          if (PageLayout.getSheetWidthPx() !== Math.round(e.mm[1] * MM * 100) / 100) problems.push(id + ' largeur de feuille : ' + PageLayout.getSheetWidthPx());
          const marginsPt = PageLayout.getMarginsPt(); const marginsTwip = PageLayout.getMarginsTwip();
          if (marginsPt.format !== id || marginsTwip.format !== id) problems.push(id + ' : le format ne voyage pas avec les marges (' + marginsPt.format + ', ' + marginsTwip.format + ')');
        });
        // pdfmake reçoit le nom d'un format de la liste, et les dimensions en points (portrait) d'un format libre.
        const name = PageLayout.pdfPageNameFor('37x70');
        if (!name || typeof name !== 'object' || !near(name.width, 37 * PT_PER_MM, .001) || !near(name.height, 70 * PT_PER_MM, .001)) problems.push('nom pdfmake d\'un format libre : ' + JSON.stringify(name));
        if (PageLayout.pdfPageNameFor('A5') !== 'A5' || PageLayout.pdfPageNameFor('148x210') !== 'A5') problems.push('nom pdfmake de l\'A5 : ' + PageLayout.pdfPageNameFor('A5') + ' ' + PageLayout.pdfPageNameFor('148x210'));
        // Plafond de la saisie : jamais plus que Word n'accepte, dans aucun sens.
        PageLayout.setPageSize(700, 900);
        if (PageLayout.getFormat() !== '558.8x558.8' || PageLayout.getPageSizeTwip().width !== 31680 || PageLayout.getPageSizeTwip().height !== 31680) problems.push('plafond : ' + PageLayout.getFormat() + ' ' + JSON.stringify(PageLayout.getPageSizeTwip()));
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
      },
    },
    {
      id: 'psize_setpagesize_orientation_events_and_small_page_margins',
      description: 'setPageSize pose la page telle qu\'on la voit : plus large que haute = paysage, carrée = sens gardé, 297 x 210 = A4 paysage ; un seul événement par changement et aucun quand rien ne change ; une valeur qui n\'est pas un nombre ne change rien ; sous 60 mm de côté court, des marges encore d\'origine passent à 3 mm, des marges réglées ne bougent jamais',
      async run() {
        const problems = [];
        let layoutEvents = 0; let marginsEvents = 0;
        const onLayout = () => layoutEvents++; const onMargins = () => marginsEvents++;
        document.addEventListener('pp:pageLayoutChanged', onLayout);
        document.addEventListener('pp:marginsChanged', onMargins);
        const state = () => PageLayout.getFormat() + ' ' + PageLayout.getOrientation();
        const m = () => PageLayout.getMarginsMm();
        try {
          PageLayout.setMarginsMm(null);
          // Plus large que haute : paysage, le plus petit côté devient le format.
          if (PageLayout.setPageSize(70, 37) !== true || state() !== '37x70 landscape') problems.push('70 x 37 : ' + state());
          if (layoutEvents !== 1) problems.push('événements après 70 x 37 : ' + layoutEvents + ' (1 attendu)');
          if (![m().top, m().right, m().bottom, m().left].every(v => near(v, 3, .001))) problems.push('marges d\'origine sur une étiquette : ' + JSON.stringify(m()));
          // La même page : rien ne bouge, aucun événement.
          layoutEvents = 0;
          if (PageLayout.setPageSize(70, 37) !== false || layoutEvents !== 0) problems.push('la même page : ' + layoutEvents + ' événement(s)');
          // Plus haute que large : portrait.
          if (PageLayout.setPageSize(37, 70) !== true || state() !== '37x70 portrait') problems.push('37 x 70 : ' + state());
          // Carrée : le sens est gardé, dans les deux sens.
          PageLayout.setPageSize(90, 90);
          if (state() !== '90x90 portrait') problems.push('carré depuis le portrait : ' + state());
          PageLayout.setPageSize(120, 90);
          PageLayout.setPageSize(90, 90);
          if (state() !== '90x90 landscape') problems.push('carré depuis le paysage : ' + state());
          // Un format de la liste saisi en centimètres redevient ce format.
          PageLayout.setPageSize(297, 210);
          if (state() !== 'A4 landscape') problems.push('297 x 210 : ' + state());
          PageLayout.setPageSize(148, 210);
          if (state() !== 'A5 portrait') problems.push('148 x 210 : ' + state());
          // Un dixième de millimètre, et les bornes.
          PageLayout.setPageSize(105.55, 148.25);
          if (PageLayout.getFormat() !== '105.6x148.3') problems.push('arrondi au dixième : ' + PageLayout.getFormat());
          PageLayout.setPageSize(5, 700);
          if (PageLayout.getFormat() !== '20x558.8') problems.push('bornes : ' + PageLayout.getFormat());
          // Ce qui n'est pas un nombre ne change rien.
          const before = state() + JSON.stringify(m()); layoutEvents = 0;
          const refused = [PageLayout.setPageSize('abc', 50), PageLayout.setPageSize(50, ''), PageLayout.setPageSize(null, 50), PageLayout.setPageSize(undefined, 50), PageLayout.setPageSize(NaN, 50), PageLayout.setPageSize(50, Infinity)];
          if (refused.some(v => v !== false) || before !== state() + JSON.stringify(m()) || layoutEvents !== 0) problems.push('valeurs refusées : ' + JSON.stringify(refused) + ' ' + state());
          // setPageSize ne prévient pas l'enregistrement : c'est le geste (OrientationToggle.selectPageSize) qui le fait.
          if (marginsEvents !== 0) problems.push('setPageSize a envoyé pp:marginsChanged ' + marginsEvents + ' fois');

          // Marges d'origine : 3 mm sous 60 mm de côté court, pas au-delà.
          PageLayout.setMarginsMm(null);
          PageLayout.setPageSize(59.9, 120);
          if (!near(m().left, 3, .001)) problems.push('59,9 mm de côté court : marges ' + m().left);
          PageLayout.setMarginsMm(null);
          PageLayout.setPageSize(60, 120);
          if (!near(m().left, PageLayout.DEFAULT_MARGIN_MM, .001)) problems.push('60 mm de côté court : marges ' + m().left + ' (celles d\'origine attendues)');
          PageLayout.setMarginsMm(null);
          PageLayout.setPageSize(100, 150);
          if (!near(m().top, PageLayout.DEFAULT_MARGIN_MM, .001)) problems.push('100 x 150 : marges ' + m().top);
          // Marges réglées par la personne : jamais touchées, seulement re-bornées pour la page.
          PageLayout.setMarginsMm({ top: 12, right: 12, bottom: 12, left: 12 });
          PageLayout.setPageSize(100, 50);
          if (![m().top, m().right, m().bottom, m().left].every(v => near(v, 12, .001))) problems.push('marges réglées sur 100 x 50 : ' + JSON.stringify(m()));
          PageLayout.setMarginsMm({ top: 12, right: 12, bottom: 12, left: 12 });
          PageLayout.setPageSize(70, 37);
          if (!(m().top < 12 && m().top + m().bottom <= 37 - PageLayout.MIN_CONTENT_MM + .001)) problems.push('marges réglées re-bornées sur 70 x 37 : ' + JSON.stringify(m()));
          // Une étiquette qui revient à l'A4 garde ses marges : on ne devine pas ce qu'on n'a pas été invité à changer.
          PageLayout.setMarginsMm(null);
          PageLayout.setPageSize(70, 37);
          PageLayout.setPageSize(210, 297);
          if (PageLayout.getFormat() !== 'A4' || !near(m().left, 3, .001)) problems.push('retour en A4 : ' + state() + ' marges ' + m().left);
          // Le contenu minimal reste respecté : 20 x 20 mm n'a plus de marge.
          PageLayout.setMarginsMm(null);
          PageLayout.setPageSize(20, 20);
          if (!near(PageLayout.getContentWidthMm(), 20, .001) || !near(PageLayout.getContentHeightMm(), 20, .001)) problems.push('20 x 20 : zone de texte ' + PageLayout.getContentWidthMm() + ' x ' + PageLayout.getContentHeightMm());
        } finally {
          document.removeEventListener('pp:pageLayoutChanged', onLayout);
          document.removeEventListener('pp:marginsChanged', onMargins);
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'psize_header_footer_height_rule',
      description: 'fitsHeaderFooter : une page de moins de 80 mm de haut (dans son sens) ne reçoit plus d\'en-tête ni de pied ; tous les formats de la liste, dans les deux sens, les reçoivent',
      async run() {
        const problems = [];
        ['A3', 'A4', 'A5', 'A6'].forEach(id => ['portrait', 'landscape'].forEach(o => {
          PageLayout.setMarginsMm({ format: id, orientation: o });
          if (!PageLayout.fitsHeaderFooter()) problems.push(id + ' ' + o + ' : refusé');
        }));
        [[70, 37, false], [37, 70, false], [150, 79.9, false], [150, 80, true], [100, 150, true], [20, 558.8, true], [558.8, 20, false]].forEach(([w, hgt, expected]) => {
          PageLayout.setMarginsMm(null);
          PageLayout.setPageSize(w, hgt);
          if (PageLayout.fitsHeaderFooter() !== expected) problems.push(w + ' x ' + hgt + ' mm : fitsHeaderFooter ' + PageLayout.fitsHeaderFooter() + ' (' + expected + ' attendu)');
        });
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'psize_labels_in_centimeters_follow_the_language',
      description: 'Le format libre se dit en centimètres dans les phrases de l\'interface (« Aperçu 7 × 3,7 cm », « Page 7 × 3,7 cm en paysage », le texte du filigrane), avec la virgule en français et le point en anglais, dans le sens de la page ; un format de la liste garde son nom ; aucun {format} ni {min} non remplacé',
      async run(h) {
        await setup(h);
        const problems = [];
        const read = () => ({
          tip: document.getElementById('v2-a4-toggle').getAttribute('data-tip'), aria: document.getElementById('v2-a4-toggle').getAttribute('aria-label'),
          button: document.getElementById('btn-page-orientation').getAttribute('aria-label'), row: menuRows().find(r => r.key === 'custom'),
        });
        const watermarkHint = () => { WatermarkDialog.open(); const text = document.getElementById('pp-watermark-hint').textContent; escape(); return text; };
        try {
          applySize(70, 37);
          await h.sleep(200);
          const fr = read();
          if (PageLayout.getFormatLabel() !== '7 × 3,7 cm' || PageLayout.formatLabel('37x70') !== '3,7 × 7 cm' || PageLayout.formatLabel('37x70', 'landscape') !== '7 × 3,7 cm') problems.push('étiquettes : ' + PageLayout.getFormatLabel() + ' | ' + PageLayout.formatLabel('37x70') + ' | ' + PageLayout.formatLabel('37x70', 'landscape'));
          if (PageLayout.formatLabel('105.5x148.3') !== '10,55 × 14,83 cm' || PageLayout.formatLabel('558.8x558.8') !== '55,88 × 55,88 cm' || PageLayout.formatLabel('A5') !== 'A5' || PageLayout.formatLabel('210x297') !== 'A4') problems.push('étiquettes (décimales, bornes, formats de la liste)');
          if (fr.tip !== 'Aperçu 7 × 3,7 cm' || !/^Aperçu 7 × 3,7 cm — /.test(fr.aria) || !/page 7 × 3,7 cm/.test(fr.aria)) problems.push('français, case : ' + fr.tip + ' | ' + fr.aria);
          if (fr.button !== 'Page 7 × 3,7 cm en paysage (passer en portrait)') problems.push('français, bouton : ' + fr.button);
          if (fr.row.name !== 'Format libre…' || fr.row.size !== '7 × 3,7 cm' || fr.row.checked !== 'true') problems.push('français, ligne du menu : ' + JSON.stringify(fr.row));
          if (!/7 × 3,7 cm/.test(watermarkHint())) problems.push('français, filigrane : ' + watermarkHint());
          I18n.setLang('en');
          await h.sleep(200);
          const en = read();
          if (PageLayout.getFormatLabel() !== '7 × 3.7 cm' || PageLayout.formatLabel('105.5x148.3') !== '10.55 × 14.83 cm') problems.push('étiquettes en anglais : ' + PageLayout.getFormatLabel());
          if (en.tip !== '7 × 3.7 cm preview' || !/^7 × 3.7 cm preview — /.test(en.aria)) problems.push('anglais, case : ' + en.tip + ' | ' + en.aria);
          if (en.button !== '7 × 3.7 cm page in landscape (switch to portrait)') problems.push('anglais, bouton : ' + en.button);
          if (en.row.name !== 'Custom size…' || en.row.size !== '7 × 3.7 cm') problems.push('anglais, ligne du menu : ' + JSON.stringify(en.row));
          if (!/7 × 3.7 cm/.test(watermarkHint())) problems.push('anglais, filigrane : ' + watermarkHint());
          // Un format de la liste en anglais : son nom, ligne « Format libre » décochée et sans taille.
          applySize(210, 297);
          await h.sleep(200);
          const back = read();
          if (back.tip !== 'A4 preview' || back.button !== 'A4 page in portrait (switch to landscape)' || back.row.checked !== 'false' || back.row.size !== '') problems.push('A4 en anglais : ' + JSON.stringify(back));
          [fr, en, back].forEach((r, i) => { if (/\{(format|min|max)\}/.test(JSON.stringify(r))) problems.push('un {format} non remplacé (' + i + ')'); });
        } finally {
          I18n.setLang('fr');
          await h.sleep(150);
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'psize_menu_row_opens_the_window_and_follows_the_page',
      description: 'La ligne « Format libre… » est la septième ligne cochable du menu Page, après A6 : décochée sur un format de la liste, elle s\'ouvre au clic comme à Entrée et à Espace ; sur une page libre elle est cochée avec sa taille en centimètres, Paysage coché quand elle est plus large que haute, A4 décoché, et A4 se recoche en cliquant sa ligne',
      async run(h) {
        await newDocument(h);
        PageLayout.setMarginsMm(null);
        OrientationToggle.sync();
        const problems = [];
        try {
          const rows = menuRows();
          if (rows.map(r => r.key).join() !== 'portrait,landscape,A3,A4,A5,A6,custom') problems.push('lignes : ' + rows.map(r => r.key));
          const custom = rows[6];
          if (custom.name !== 'Format libre…' || custom.size !== '' || custom.checked !== 'false' || custom.disabled !== 'false' || custom.tab !== 0) problems.push('ligne au départ : ' + JSON.stringify(custom));
          const rowEl = menuRow('custom');
          if (rowEl.id !== 'v2-btn-page-custom' || rowEl.getAttribute('role') !== 'menuitemradio') problems.push('identifiant ou rôle : ' + rowEl.id + ' ' + rowEl.getAttribute('role'));
          if (checkedKeys() !== 'portrait,A4') problems.push('lignes cochées au départ : ' + checkedKeys());
          // Le clic ouvre la fenêtre, sur la page courante.
          if (!(await openWindowByRow(h))) problems.push('le clic n\'a pas ouvert la fenêtre');
          else {
            const s = windowState();
            if (s.width !== '21' || s.height !== '29,7') problems.push('champs au départ : ' + s.width + ' x ' + s.height);
            if (checkedKeys() !== 'portrait,A4') problems.push('ouvrir la fenêtre a changé la page : ' + checkedKeys());
            cancelButton().click();
            await h.sleep(100);
            if (isOpen()) problems.push('Annuler ne ferme pas la fenêtre');
          }
          // Le clavier : Entrée puis Espace, comme les autres lignes.
          rowEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          await h.sleep(150);
          if (!isOpen()) problems.push('Entrée sur la ligne n\'ouvre pas la fenêtre'); else { escape(); await h.sleep(100); }
          if (isOpen()) problems.push('Échap ne ferme pas la fenêtre');
          rowEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
          await h.sleep(150);
          if (!isOpen()) problems.push('Espace sur la ligne n\'ouvre pas la fenêtre'); else { escape(); await h.sleep(100); }
          rowEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
          await h.sleep(100);
          if (isOpen()) problems.push('une autre touche a ouvert la fenêtre');
          // Une page libre : la ligne se coche et dit sa taille.
          applySize(70, 37);
          await h.sleep(200);
          const free = menuRows();
          if (checkedKeys() !== 'landscape,custom') problems.push('lignes cochées sur 70 x 37 : ' + checkedKeys());
          const c2 = free.find(r => r.key === 'custom');
          if (c2.size !== '7 × 3,7 cm' || free.find(r => r.key === 'A4').checked !== 'false') problems.push('ligne sur 70 x 37 : ' + JSON.stringify(c2));
          // Plus haute que large : Portrait coché.
          applySize(37, 70);
          await h.sleep(200);
          if (checkedKeys() !== 'portrait,custom' || menuRows().find(r => r.key === 'custom').size !== '3,7 × 7 cm') problems.push('lignes cochées sur 37 x 70 : ' + checkedKeys() + ' ' + menuRows().find(r => r.key === 'custom').size);
          // Le clic sur le bouton tourne la page libre : la ligne dit la taille dans le nouveau sens.
          await h.clickButton('btn-page-orientation');
          await h.sleep(200);
          if (checkedKeys() !== 'landscape,custom' || menuRows().find(r => r.key === 'custom').size !== '7 × 3,7 cm') problems.push('bouton Page sur 37 x 70 : ' + checkedKeys() + ' ' + menuRows().find(r => r.key === 'custom').size);
          // Une taille égale à celle de l'A4 : A4 coché, « Format libre… » décochée.
          applySize(297, 210);
          await h.sleep(200);
          if (checkedKeys() !== 'landscape,A4') problems.push('lignes cochées sur 297 x 210 : ' + checkedKeys());
          // Retour en A5 par sa ligne : la ligne libre redevient vide.
          applySize(70, 37);
          menuRow('A5').click();
          await h.sleep(300);
          if (checkedKeys() !== 'landscape,A5' || menuRows().find(r => r.key === 'custom').size !== '') problems.push('A5 après une page libre : ' + checkedKeys() + ' ' + menuRows().find(r => r.key === 'custom').size);
        } finally {
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'psize_window_validation_preview_and_confirm',
      description: 'La fenêtre « Format libre… » : champs en centimètres à la page courante, virgule ou point, « cm » toléré ; un champ vide ne dit rien mais grise « Valider », une valeur hors de 2 à 55,88 cm ou illisible est refusée sous le champ (aria-invalid, message, aperçu gardé sur la dernière page valide) ; la feuille d\'aperçu, sa taille et son sens suivent la frappe ; Valider, Entrée, Annuler et Échap',
      async run(h) {
        await setup(h);
        const problems = [];
        let layoutEvents = 0; let marginsEvents = 0;
        const onLayout = () => layoutEvents++; const onMargins = () => marginsEvents++;
        document.addEventListener('pp:pageLayoutChanged', onLayout);
        document.addEventListener('pp:marginsChanged', onMargins);
        try {
          if (!(await openWindowByRow(h))) return { pass: false, notes: 'la fenêtre ne s\'ouvre pas' };
          const s0 = windowState();
          if (s0.title !== 'Format de page libre' || s0.labels.join() !== 'Format,Largeur,Hauteur' || s0.buttons.join() !== 'Annuler,Valider') problems.push('textes : ' + JSON.stringify([s0.title, s0.labels, s0.buttons]));
          if (!/^De 2 à 55,88 cm/.test(s0.hint) || !/paysage/.test(s0.hint) || /\{/.test(s0.hint)) problems.push('indication : ' + s0.hint);
          if (s0.caption !== '21 × 29,7 cm' || s0.orientation !== 'Portrait' || s0.okDisabled || s0.error !== '' || s0.invalid.some(Boolean)) problems.push('départ : ' + JSON.stringify(s0));
          if (!s0.aria[0].includes('centimètres') || !s0.aria[1].includes('centimètres')) problems.push('noms accessibles : ' + s0.aria);
          if (document.activeElement !== field('width')) problems.push('focus au départ : ' + (document.activeElement && (document.activeElement.id || document.activeElement.tagName)));
          if (field('width').selectionStart !== 0 || field('width').selectionEnd !== field('width').value.length) problems.push('le champ de la largeur n\'est pas sélectionné');
          if (!near(s0.sheet.h, 96, .5) || !near(s0.sheet.w, 96 * 210 / 297, 1)) problems.push('feuille d\'aperçu A4 : ' + JSON.stringify(s0.sheet));
          // La frappe : la feuille, la taille et le sens suivent.
          type('width', '7'); type('height', '3,7');
          const s1 = windowState();
          if (s1.caption !== '7 × 3,7 cm' || s1.orientation !== 'Paysage' || s1.okDisabled || s1.error !== '') problems.push('7 x 3,7 : ' + JSON.stringify(s1));
          if (!near(s1.sheet.w, 96, .5) || !near(s1.sheet.h, 96 * 37 / 70, 1)) problems.push('feuille 7 x 3,7 : ' + JSON.stringify(s1.sheet));
          type('width', '5'); type('height', '5');
          const sq = windowState();
          if (sq.caption !== '5 × 5 cm' || sq.orientation !== '' || !near(sq.sheet.w, sq.sheet.h, 1)) problems.push('carré : ' + JSON.stringify(sq));
          // Les écritures acceptées.
          const accepted = [['7.5', 75], ['7,5', 75], ['7,5 cm', 75], ['  7,5CM ', 75], ['7.', 70], ['55,88', 558.8], ['2', 20], ['10,55', 105.5], ['07', 70]];
          accepted.forEach(([text, mm]) => {
            type('width', text); type('height', '10');
            const s = windowState();
            if (s.okDisabled || s.error !== '' || s.invalid[0]) problems.push('« ' + text + ' » refusé : ' + s.error);
            else if (s.caption !== PageLayout.cmText(mm) + ' × 10 cm') problems.push('« ' + text + ' » lu ' + s.caption + ' (' + PageLayout.cmText(mm) + ' cm attendu)');
          });
          // Hors bornes : refusé sous le champ, la feuille garde la dernière page valide, Valider grisé.
          type('width', '7'); type('height', '3,7');
          const keep = windowState().caption;
          [['1', 'range', 0], ['1,99', 'range', 0], ['55,89', 'range', 0], ['56', 'range', 0], ['100000', 'range', 0], ['0', 'range', 0], [',5', 'range', 0]].forEach(([text, kind, side]) => {
            type('width', text);
            const s = windowState();
            if (!s.invalid[side] || s.invalid[1 - side] || !s.okDisabled || s.error !== 'La taille doit être comprise entre 2 et 55,88 cm.' || s.caption !== keep) problems.push('« ' + text + ' » : ' + JSON.stringify([s.invalid, s.okDisabled, s.error, s.caption]));
          });
          type('width', '7');
          ['abc', '7 mm', '7,5,5', '-3', '7 cm cm', '1e2', '7;5'].forEach(text => {
            type('height', text);
            const s = windowState();
            if (s.invalid[0] || !s.invalid[1] || !s.okDisabled || s.error !== 'Saisissez un nombre en centimètres, par exemple 10,5.' || s.caption !== keep) problems.push('« ' + text + ' » : ' + JSON.stringify([s.invalid, s.okDisabled, s.error, s.caption]));
          });
          // Un champ vide : rien à reprocher encore, mais pas de validation possible.
          type('width', '7'); type('height', '');
          const empty = windowState();
          if (empty.error !== '' || empty.invalid.some(Boolean) || !empty.okDisabled) problems.push('champ vide : ' + JSON.stringify([empty.error, empty.invalid, empty.okDisabled]));
          // La correction efface l'erreur.
          type('height', '3,7');
          const fixed = windowState();
          if (fixed.error !== '' || fixed.invalid.some(Boolean) || fixed.okDisabled) problems.push('valeur corrigée : ' + JSON.stringify([fixed.error, fixed.invalid, fixed.okDisabled]));
          // Valider ne fait rien tant qu'un champ est mauvais : « Valider » grisé, Entrée refusée, la fenêtre reste ouverte et le focus revient sur le champ fautif.
          type('height', 'abc');
          layoutEvents = 0; marginsEvents = 0;
          field('height').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          await h.sleep(150);
          if (!isOpen() || layoutEvents !== 0 || marginsEvents !== 0) problems.push('Entrée sur une saisie mauvaise : ouverte=' + isOpen() + ' événements ' + layoutEvents + '/' + marginsEvents);
          if (PageLayout.getFormat() !== 'A4') problems.push('une saisie mauvaise a changé la page : ' + PageLayout.getFormat());
          // Annuler et Échap : rien ne change.
          type('width', '7'); type('height', '3,7');
          cancelButton().click();
          await h.sleep(100);
          if (isOpen() || PageLayout.getFormat() !== 'A4' || layoutEvents !== 0 || marginsEvents !== 0) problems.push('Annuler : ouverte=' + isOpen() + ' ' + PageLayout.getFormat() + ' événements ' + layoutEvents + '/' + marginsEvents);
          await openWindowByRow(h);
          type('width', '7'); type('height', '3,7');
          escape();
          await h.sleep(100);
          if (isOpen() || PageLayout.getFormat() !== 'A4' || layoutEvents !== 0 || marginsEvents !== 0) problems.push('Échap : ouverte=' + isOpen() + ' ' + PageLayout.getFormat());
          // À la réouverture, la page courante, pas la dernière saisie abandonnée.
          await openWindowByRow(h);
          const reopened = windowState();
          if (reopened.width !== '21' || reopened.height !== '29,7' || reopened.error !== '' || reopened.okDisabled) problems.push('réouverture : ' + JSON.stringify([reopened.width, reopened.height, reopened.error]));
          // Valider : la page change, un événement de chaque sorte, la fenêtre se ferme.
          type('width', '7'); type('height', '3,7');
          okButton().click();
          await h.sleep(500);
          if (isOpen()) problems.push('Valider ne ferme pas la fenêtre');
          if (PageLayout.getFormat() !== '37x70' || !PageLayout.isLandscape()) problems.push('Valider : ' + PageLayout.getFormat() + ' ' + PageLayout.getOrientation());
          if (layoutEvents !== 1 || marginsEvents !== 1) problems.push('événements après Valider : pageLayoutChanged=' + layoutEvents + ' marginsChanged=' + marginsEvents + ' (1 et 1 attendus)');
          // À la réouverture, la page libre, sens compris.
          await openWindowByRow(h);
          const onFree = windowState();
          if (onFree.width !== '7' || onFree.height !== '3,7' || onFree.caption !== '7 × 3,7 cm' || onFree.orientation !== 'Paysage') problems.push('réouverture sur 7 x 3,7 : ' + JSON.stringify([onFree.width, onFree.height, onFree.caption]));
          // Valider sans rien changer : aucun événement, aucune écriture.
          layoutEvents = 0; marginsEvents = 0;
          okButton().click();
          await h.sleep(200);
          if (layoutEvents !== 0 || marginsEvents !== 0) problems.push('Valider sans changement : événements ' + layoutEvents + '/' + marginsEvents);
          // Entrée dans un champ valide valide la fenêtre ; 21 x 29,7 redevient l'A4 portrait.
          await openWindowByRow(h);
          type('width', '21'); type('height', '29,7');
          field('height').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          await h.sleep(500);
          if (isOpen() || PageLayout.getFormat() !== 'A4' || PageLayout.isLandscape()) problems.push('Entrée : ouverte=' + isOpen() + ' ' + PageLayout.getFormat() + ' ' + PageLayout.getOrientation());
          if (checkedKeys() !== 'portrait,A4') problems.push('lignes cochées après 21 x 29,7 : ' + checkedKeys());
          // Pendant une composition (accent mort), Entrée ne valide pas.
          await openWindowByRow(h);
          type('width', '7'); type('height', '3,7');
          field('height').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }));
          await h.sleep(150);
          if (!isOpen() || PageLayout.getFormat() !== 'A4') problems.push('Entrée pendant une composition : ouverte=' + isOpen() + ' ' + PageLayout.getFormat());
          // L'anglais.
          I18n.setLang('en');
          await h.sleep(100);
          closeWindowIfOpen();
          await openWindowByRow(h);
          const en = windowState();
          if (en.title !== 'Custom page size' || en.labels.join() !== 'Format,Width,Height' || en.buttons.join() !== 'Cancel,Confirm' && en.buttons.join() !== 'Cancel,OK') problems.push('anglais, textes : ' + JSON.stringify([en.title, en.labels, en.buttons]));
          if (en.hint !== 'From 2 to 55.88 cm, the Word limit. Wider than tall, the page is in landscape.') problems.push('anglais, indication : ' + en.hint);
          if (en.width !== '21' || en.height !== '29.7' || en.caption !== '21 × 29.7 cm' || en.orientation !== 'Portrait') problems.push('anglais, champs : ' + JSON.stringify([en.width, en.height, en.caption, en.orientation]));
          type('width', '60');
          if (windowState().error !== 'The size must be between 2 and 55.88 cm.') problems.push('anglais, bornes : ' + windowState().error);
          type('width', 'abc');
          if (windowState().error !== 'Enter a number in centimeters, for example 10.5.') problems.push('anglais, nombre : ' + windowState().error);
          type('width', '7,5');
          if (windowState().caption !== '7.5 × 29.7 cm') problems.push('anglais, virgule acceptée : ' + windowState().caption);
          if (/\{(min|max|format)\}/.test(JSON.stringify(en))) problems.push('un {min} ou {max} non remplacé');
        } finally {
          I18n.setLang('fr');
          await h.sleep(150);
          document.removeEventListener('pp:pageLayoutChanged', onLayout);
          document.removeEventListener('pp:marginsChanged', onMargins);
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'psize_window_is_refused_on_other_types_and_during_an_export',
      description: 'Sur un email, la ligne est grisée et hors du clavier, un clic ne l\'ouvre pas et selectPageSize ne change rien ; pendant un export, la page ne change pas même si la fenêtre était déjà ouverte ; la fenêtre ouverte avant l\'export ne la modifie pas à « Valider »',
      async run(h) {
        const problems = [];
        try {
          await newEmail(h);
          await h.sleep(100);
          const email = menuRows().find(r => r.key === 'custom');
          if (!email || email.disabled !== 'true' || !email.greyed || email.tab !== -1) problems.push('email : ligne ' + JSON.stringify(email));
          menuRow('custom').click();
          await h.sleep(150);
          if (isOpen()) { problems.push('email : la fenêtre s\'est ouverte'); closeWindowIfOpen(); }
          if (OrientationToggle.selectPageSize(70, 37) !== false || PageLayout.getFormat() !== 'A4' || PageLayout.isLandscape()) problems.push('email : la page a changé (' + PageLayout.getFormat() + ' ' + PageLayout.getOrientation() + ')');
          if (typeof PageLayout.setPageSize !== 'function') problems.push('setPageSize absent');
          await newDocument(h);
          await h.sleep(100);
          const doc = menuRows().find(r => r.key === 'custom');
          if (doc.disabled !== 'false' || doc.greyed || doc.tab !== 0) problems.push('modèle classique : ligne ' + JSON.stringify(doc));
          // Export en cours : la ligne est grisée, un clic n'ouvre rien.
          OrientationToggle.setBusy(true);
          const busy = menuRows().find(r => r.key === 'custom');
          if (busy.disabled !== 'true' || !busy.greyed || busy.tab !== -1) problems.push('export en cours : ligne ' + JSON.stringify(busy));
          menuRow('custom').click();
          await h.sleep(150);
          if (isOpen()) { problems.push('export en cours : la fenêtre s\'est ouverte'); closeWindowIfOpen(); }
          OrientationToggle.setBusy(false);
          // La fenêtre ouverte AVANT l'export : « Valider » pendant l'export ne change rien et ferme la fenêtre.
          menuRow('custom').click();
          await h.sleep(150);
          type('width', '7'); type('height', '3,7');
          OrientationToggle.setBusy(true);
          okButton().click();
          await h.sleep(200);
          if (isOpen() || PageLayout.getFormat() !== 'A4' || PageLayout.isLandscape()) problems.push('Valider pendant un export : ouverte=' + isOpen() + ' ' + PageLayout.getFormat());
          OrientationToggle.setBusy(false);
          // Après l'export, la ligne s'ouvre de nouveau.
          menuRow('custom').click();
          await h.sleep(150);
          if (!isOpen()) problems.push('après l\'export : la ligne n\'ouvre plus la fenêtre'); else closeWindowIfOpen();
        } finally {
          OrientationToggle.setBusy(false);
          resetPage();
          await newDocument(h);
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'psize_editor_reader_sheet_pagination_and_fit_zoom_follow_the_free_page',
      description: 'La feuille de l\'éditeur et celle de la Lecture prennent la largeur de la page libre, la zone de texte celle de la page moins les marges, la pagination de l\'éditeur et de la Lecture s\'accordent sur sa hauteur, et le facteur d\'ajustement suit sa largeur (une page de 10 cm tient sans réduction, 40 cm tombe au plancher de 0,5)',
      async run(h) {
        await setup(h);
        Editor.setHTML(lines(150));
        await h.sleep(600);
        const problems = [];
        const seen = {};
        const container = document.getElementById('editor-container');
        const originalStyle = container.getAttribute('style');
        container.style.width = '700px'; container.style.flex = 'none'; container.style.maxWidth = '700px';
        await h.sleep(500);
        const cs = getComputedStyle(container);
        const available = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const zoom = () => parseFloat(container.style.getPropertyValue('--pp-fit-zoom'));
        const expectZoom = w => Math.round(Math.max(0.5, Math.min(1, available / w)) * 1000) / 1000;
        const a4Breaks = (() => { Editor.refreshPaginationPreview(); return breaks(); })();
        for (const [w, hgt] of [[100, 150], [150, 100], [70, 37], [400, 500]]) {
          applySize(w, hgt);
          await h.sleep(700);
          Editor.refreshPaginationPreview();
          await h.sleep(350);
          const editorBreaks = breaks();
          const key = w + 'x' + hgt;
          const width = layoutWidth(sheetOf());
          const content = EditorCore.editorContentWidthPx(EditorCore.getEditor()) / MM;
          const margins = PageLayout.getMarginsMm();
          seen[key] = { sheet: +width.toFixed(2), content: +content.toFixed(2), css: cssPageWidth(), zoom: zoom(), breaks: editorBreaks };
          if (!near(width, w * MM, 1)) problems.push(key + ' : feuille ' + width.toFixed(2) + ' (' + (w * MM).toFixed(2) + ' attendu)');
          if (!near(content, w - margins.left - margins.right, .6)) problems.push(key + ' : zone de texte ' + content.toFixed(2) + ' mm (' + (w - margins.left - margins.right).toFixed(2) + ' attendu)');
          if (cssPageWidth() !== PageLayout.getSheetWidthPx() + 'px' || cssPageWidth() !== Math.round(w * MM * 100) / 100 + 'px') problems.push(key + ' : --pp-page-width ' + cssPageWidth());
          if (!near(zoom(), expectZoom(PageLayout.getSheetWidthPx()), .0011)) problems.push(key + ' : facteur ' + zoom() + ' (' + expectZoom(PageLayout.getSheetWidthPx()) + ' attendu)');
          // Lecture : même largeur, mêmes sauts de page.
          const reader = await h.renderReaderMode(Editor.getHTML(), EMPTY_HF);
          await h.sleep(500);
          const readerWidth = layoutWidth(reader);
          const readerBreaks = breaks('#reader-container');
          seen[key].lecture = { sheet: +readerWidth.toFixed(2), breaks: readerBreaks };
          if (!near(readerWidth, w * MM, 1)) problems.push(key + ' : feuille de la Lecture ' + readerWidth.toFixed(2));
          if (editorBreaks !== readerBreaks) problems.push(key + ' : sauts éditeur=' + editorBreaks + ' lecture=' + readerBreaks);
        }
        if (!(seen['100x150'].breaks > a4Breaks)) problems.push('la page de 100 x 150 mm ne coupe pas plus que l\'A4 : ' + seen['100x150'].breaks + ' contre ' + a4Breaks);
        if (!(seen['70x37'].breaks > seen['100x150'].breaks)) problems.push('l\'étiquette ne coupe pas plus que la carte : ' + seen['70x37'].breaks + ' contre ' + seen['100x150'].breaks);
        if (seen['100x150'].zoom !== 1 || seen['400x500'].zoom !== 0.5) problems.push('facteurs : ' + seen['100x150'].zoom + ' et ' + seen['400x500'].zoom + ' (1 et 0,5 attendus)');
        if (originalStyle === null) container.removeAttribute('style'); else container.setAttribute('style', originalStyle);
        await h.sleep(300);
        // Retour à l'A4 : la feuille et les sauts de départ.
        PageLayout.setMarginsMm(null);
        document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
        await h.sleep(700);
        Editor.refreshPaginationPreview();
        await h.sleep(350);
        if (cssPageWidth() !== '793.71px' || breaks() !== a4Breaks) problems.push('retour en A4 : ' + cssPageWidth() + ' ' + breaks() + ' sauts (' + a4Breaks + ' attendus)');
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen, a4Breaks }) };
      },
    },
    {
      id: 'psize_saved_with_the_template_and_restored_on_load',
      description: 'La page libre s\'enregistre avec le modèle (clé `format` « 37x70 » + sens de la colonne Margins, aucune colonne de plus) et revient à son chargement, avec la ligne du menu cochée ; charger un modèle libre n\'est pas une modification ; un identifiant écrit à la main (casse, bornes) est lu, un identifiant abîmé tombe sur l\'A4 en gardant les marges',
      async run(h) {
        const problems = [];
        const idLabel = await savedTemplate(h, 'Étiquette libre', '<p>Petit</p>', 70, 37);
        const labelSaved = JSON.parse(window.__gristStub.getRow(TABLE, idLabel).Margins || '{}');
        const idCard = await savedTemplate(h, 'Carte libre', '<p>Carte</p>', 100, 150);
        const cardSaved = JSON.parse(window.__gristStub.getRow(TABLE, idCard).Margins || '{}');
        const idA4 = await savedTemplate(h, 'Courrier libre', '<p>Normal</p>');
        const a4Saved = JSON.parse(window.__gristStub.getRow(TABLE, idA4).Margins || '{}');
        if (labelSaved.format !== '37x70' || labelSaved.orientation !== 'landscape') problems.push('colonne de l\'étiquette : ' + JSON.stringify(labelSaved));
        if (![labelSaved.top, labelSaved.right, labelSaved.bottom, labelSaved.left].every(v => near(v, 3, .001))) problems.push('marges enregistrées de l\'étiquette : ' + JSON.stringify(labelSaved));
        if (cardSaved.format !== '100x150' || cardSaved.orientation !== 'portrait') problems.push('colonne de la carte : ' + JSON.stringify(cardSaved));
        if (a4Saved.format !== 'A4') problems.push('colonne du courrier : ' + JSON.stringify(a4Saved));
        const table = window.__gristStub.state.rows[TABLE];
        const columns = Object.keys(window.__gristStub.getRow(TABLE, idLabel)).sort().join();
        const asked0 = h.choosePrompts.length;
        const state = () => ({ format: PageLayout.getFormat(), landscape: PageLayout.isLandscape(), css: cssPageWidth(), sheet: sheetOf() ? layoutWidth(sheetOf()) : null, checked: checkedKeys(),
          preview: document.getElementById('v2-a4-toggle').getAttribute('data-tip'), size: menuRows().find(r => r.key === 'custom').size });
        await selectTemplate(h, idLabel);
        const loadedLabel = state();
        if (loadedLabel.format !== '37x70' || !loadedLabel.landscape || loadedLabel.checked !== 'landscape,custom' || loadedLabel.preview !== 'Aperçu 7 × 3,7 cm' || loadedLabel.size !== '7 × 3,7 cm') problems.push('chargé étiquette : ' + JSON.stringify(loadedLabel));
        if (loadedLabel.sheet === null || !near(loadedLabel.sheet, 70 * MM, 1) || loadedLabel.css !== Math.round(70 * MM * 100) / 100 + 'px') problems.push('feuille chargée de l\'étiquette : ' + loadedLabel.sheet + ' ' + loadedLabel.css);
        await selectTemplate(h, idCard);
        const loadedCard = state();
        if (loadedCard.format !== '100x150' || loadedCard.landscape || loadedCard.checked !== 'portrait,custom' || loadedCard.size !== '10 × 15 cm') problems.push('chargé carte : ' + JSON.stringify(loadedCard));
        await selectTemplate(h, idA4);
        const loadedA4 = state();
        if (loadedA4.format !== 'A4' || loadedA4.landscape || loadedA4.css !== '793.71px' || loadedA4.checked !== 'portrait,A4' || loadedA4.size !== '') problems.push('chargé courrier : ' + JSON.stringify(loadedA4));
        // Un nouveau modèle repart en A4 portrait, même juste après une page libre.
        await selectTemplate(h, idLabel);
        await h.clickButton('btn-new');
        await h.sleep(400);
        const fresh = state();
        if (fresh.format !== 'A4' || fresh.landscape || fresh.css !== '793.71px' || fresh.checked !== 'portrait,A4') problems.push('nouveau modèle : ' + JSON.stringify(fresh));
        if (h.choosePrompts.length !== asked0) problems.push('charger un modèle de page libre le laisse « modifié » : ' + (h.choosePrompts.length - asked0) + ' question(s) posée(s)');
        // Identifiant écrit à la main : casse, bornes, abîmé.
        window.__gristStub.remoteWrite(TABLE, idCard, { Margins: JSON.stringify({ top: 12, right: 12, bottom: 12, left: 12, orientation: 'portrait', format: '100X150' }) });
        await Templates.loadAll();
        await selectTemplate(h, idLabel);
        await selectTemplate(h, idCard);
        const handwritten = state();
        if (handwritten.format !== '100x150' || !near(PageLayout.getMarginsMm().top, 12, .001)) problems.push('« 100X150 » : ' + JSON.stringify(handwritten));
        window.__gristStub.remoteWrite(TABLE, idCard, { Margins: JSON.stringify({ top: 12, right: 12, bottom: 12, left: 12, orientation: 'portrait', format: '9999x1' }) });
        await Templates.loadAll();
        await selectTemplate(h, idLabel);
        await selectTemplate(h, idCard);
        const broken = state();
        if (broken.format !== 'A4' || broken.css !== '793.71px' || !near(PageLayout.getMarginsMm().top, 12, .001)) problems.push('identifiant abîmé : ' + JSON.stringify(broken));
        window.__gristStub.remoteWrite(TABLE, idCard, { Margins: JSON.stringify({ top: 0, right: 0, bottom: 0, left: 0, orientation: 'portrait', format: '1x900' }) });
        await Templates.loadAll();
        await selectTemplate(h, idLabel);
        await selectTemplate(h, idCard);
        if (PageLayout.getFormat() !== '20x558.8') problems.push('identifiant hors bornes : ' + PageLayout.getFormat());
        await selectTemplate(h, idA4);
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, labelSaved, cardSaved, columns, rows: Object.keys(table || {}).length }) };
      },
    },
    {
      id: 'psize_pdf_and_docx_pages_for_a_free_format',
      description: 'Le PDF et le .docx d\'une page libre ont sa taille (pdfmake : dimensions en points passées telles quelles et sens ; Word : w:pgSz en twips et w:orient, dans les deux sens), aux marges du modèle ; le plafond de 55,88 cm fait 31680 twips',
      async run(h) {
        await setup(h);
        const problems = [];
        const seen = {};
        const cases = [[70, 37, 'étiquette'], [37, 70, 'étiquette debout'], [100, 150, 'carte'], [150, 100, 'carte couchée'], [558.8, 558.8, 'plafond'], [90, 90, 'carré']];
        for (const [w, hgt, name] of cases) {
          PageLayout.setMarginsMm(null);
          applySize(w, hgt);
          await h.sleep(150);
          const { dd, gt } = await pdfOf(h, '<p>Texte ' + name + '</p>');
          const page = gt.pages[0];
          const landscape = w > hgt;
          seen[name] = { pdf: [+page.width.toFixed(2), +page.height.toFixed(2)], orientation: dd.pageOrientation };
          if (!near(page.width, w * PT_PER_MM, .5) || !near(page.height, hgt * PT_PER_MM, .5)) problems.push(name + ' : page du PDF ' + page.width.toFixed(2) + ' x ' + page.height.toFixed(2) + ' (' + (w * PT_PER_MM).toFixed(2) + ' x ' + (hgt * PT_PER_MM).toFixed(2) + ' attendu)');
          if (dd.pageOrientation !== (w > hgt ? 'landscape' : 'portrait')) problems.push(name + ' : pageOrientation ' + dd.pageOrientation);
          if (typeof dd.pageSize !== 'object' || !near(dd.pageSize.width, Math.min(w, hgt) * PT_PER_MM, .001) || !near(dd.pageSize.height, Math.max(w, hgt) * PT_PER_MM, .001)) problems.push(name + ' : pageSize de pdfmake ' + JSON.stringify(dd.pageSize));
          const parts = await h.exportDocxParts('<p>Texte ' + name + '</p>', null, PageLayout.getMarginsTwip());
          const sect = h.docxSectionProps(parts.doc);
          const expectW = Math.round(w * TWIP_PER_MM); const expectH = Math.round(hgt * TWIP_PER_MM);
          seen[name].docx = [sect.widthTwip, sect.heightTwip, sect.orient];
          if (!near(sect.widthTwip, expectW, 1) || !near(sect.heightTwip, expectH, 1)) problems.push(name + ' : w:pgSz ' + sect.widthTwip + ' x ' + sect.heightTwip + ' (' + expectW + ' x ' + expectH + ' attendu)');
          if (w !== hgt && landscape !== (sect.orient === 'landscape')) problems.push(name + ' : w:orient ' + sect.orient);
          if (Math.max(sect.widthTwip, sect.heightTwip) > 31680) problems.push(name + ' : Word refuserait cette page (' + Math.max(sect.widthTwip, sect.heightTwip) + ' twips)');
          const m = PageLayout.getMarginsTwip();
          if (sect.margins.top !== m.top || sect.margins.left !== m.left) problems.push(name + ' : marges Word ' + JSON.stringify(sect.margins) + ' (' + m.top + ' / ' + m.left + ' attendu)');
        }
        // Les dimensions exactes qu'il faut garder pour l'étiquette : 3969 x 2098 twips en paysage.
        if (seen['étiquette'].docx[0] !== 3969 || seen['étiquette'].docx[1] !== 2098) problems.push('étiquette en twips : ' + seen['étiquette'].docx);
        if (seen['plafond'].docx[0] !== 31680) problems.push('plafond en twips : ' + seen['plafond'].docx);
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
      },
    },
    {
      id: 'psize_a_label_is_one_page_in_every_engine_with_the_small_page_margins',
      description: 'Une étiquette de 7 x 3,7 cm de trois lignes tient sur une seule page dans l\'éditeur, la Lecture et le PDF avec les marges de 3 mm que la saisie pose ; avec les marges d\'un modèle neuf (9,9 mm) la zone de texte ne tient plus que 50 x 17 mm',
      async run(h) {
        await setup(h);
        const html = '<p><strong>Café Arabica 250 g</strong></p><p>Réf. CAF-250 · Lot 2026-10</p><p>Rayon A3 · 4,90 €</p>';
        const problems = [];
        applySize(70, 37);
        Editor.setHTML(html);
        await h.sleep(900);
        Editor.refreshPaginationPreview();
        await h.sleep(350);
        const editorBreaks = breaks();
        await h.renderReaderMode(html, EMPTY_HF);
        await h.sleep(600);
        const readerBreaks = breaks('#reader-container');
        const { gt } = await pdfOf(h, html);
        const content = [PageLayout.getContentWidthMm(), PageLayout.getContentHeightMm()];
        if (editorBreaks !== 0 || readerBreaks !== 0 || gt.pages.length !== 1) problems.push('pages : éditeur ' + (editorBreaks + 1) + ', Lecture ' + (readerBreaks + 1) + ', PDF ' + gt.pages.length + ' (1 partout attendu)');
        if (!near(content[0], 64, .01) || !near(content[1], 31, .01)) problems.push('zone de texte : ' + content.map(v => v.toFixed(2)) + ' mm (64 x 31 attendu)');
        // Les marges d'un modèle neuf sur la même page : 50 x 17 mm, réduits à ce que la page permet.
        PageLayout.setMarginsMm({ format: '37x70', orientation: 'landscape' });
        const roomy = [PageLayout.getContentWidthMm(), PageLayout.getContentHeightMm()];
        if (!near(roomy[1], 20, .01) || !(roomy[0] < 52)) problems.push('marges d\'un modèle neuf : ' + roomy.map(v => v.toFixed(2)));
        resetPage();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, content, roomy }) };
      },
    },
    {
      id: 'psize_header_footer_zones_are_locked_on_a_low_page_unless_they_have_content',
      description: 'Sur une page de moins de 80 mm de haut, les zones d\'en-tête et de pied encore vides sont grisées (v2-hf-locked, jamais retirées), ne prennent ni le clic ni l\'entrée directe ; une zone qui a déjà un contenu reste ouvrable pour qu\'on le retire ; sur une page assez haute, rien ne change',
      async run(h) {
        await setup(h);
        const problems = [];
        const hf = (header, footer) => ({ enabled: true, differentFirstPage: false, header: { default: header, first: '' }, footer: { default: footer, first: '' } });
        const zone = pos => document.querySelector('#editor-container .v2-page-edge-' + pos);
        const refresh = async () => { Editor.refreshPaginationPreview(); await h.sleep(500); };
        try {
          // Page assez haute : les deux zones vides sont libres et s'ouvrent.
          applySize(100, 150);
          Editor.setHTML('<p>Texte</p>');
          Editor.setHeaderFooterData(EMPTY_HF);
          await h.sleep(500);
          await refresh();
          if (!zone('top') || !zone('bottom')) return { pass: false, notes: 'zones de marge introuvables' };
          if (zone('top').classList.contains('v2-hf-locked') || zone('bottom').classList.contains('v2-hf-locked')) problems.push('100 x 150 : zones grisées');
          zone('top').click();
          await h.sleep(250);
          if (!HeaderFooterPreview.getHfMode() || HeaderFooterPreview.getHfMode().zone !== 'header') problems.push('100 x 150 : le clic sur la zone du haut n\'ouvre pas l\'en-tête (' + JSON.stringify(HeaderFooterPreview.getHfMode()) + ')');
          Editor.exitHeaderFooterModeIfActive();
          await h.sleep(250);
          // Page basse : zones vides grisées, clic et entrée directe sans effet.
          applySize(70, 37);
          Editor.setHTML('<p>Texte</p>');
          Editor.setHeaderFooterData(EMPTY_HF);
          await h.sleep(500);
          await refresh();
          const top = zone('top'); const bottom = zone('bottom');
          if (!top || !bottom) return { pass: false, notes: 'zones de marge introuvables sur 70 x 37 : ' + problems };
          if (!top.classList.contains('v2-hf-locked') || !bottom.classList.contains('v2-hf-locked')) problems.push('70 x 37 : zones vides non grisées (' + top.className + ' | ' + bottom.className + ')');
          if (getComputedStyle(top).pointerEvents !== 'none' || getComputedStyle(bottom).pointerEvents !== 'none') problems.push('70 x 37 : les zones grisées prennent encore la souris');
          top.click(); bottom.click();
          HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
          HeaderFooterPreview.enterHeaderFooterMode('footer', 'default');
          await h.sleep(250);
          if (HeaderFooterPreview.getHfMode()) problems.push('70 x 37 : une zone vide s\'est ouverte (' + JSON.stringify(HeaderFooterPreview.getHfMode()) + ')');
          // Page basse mais un en-tête existant (posé sur une grande page) : sa zone n'est pas grisée et s'ouvre, le pied vide reste grisé.
          Editor.setHeaderFooterData(hf('<p>EN-TETE</p>', ''));
          await h.sleep(300);
          await refresh();
          const topFilled = zone('top'); const bottomEmpty = zone('bottom');
          if (!topFilled || topFilled.classList.contains('v2-hf-locked')) problems.push('70 x 37 : la zone remplie est grisée');
          if (!bottomEmpty || !bottomEmpty.classList.contains('v2-hf-locked')) problems.push('70 x 37 : la zone vide n\'est plus grisée à côté d\'une zone remplie');
          HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
          await h.sleep(250);
          if (!HeaderFooterPreview.getHfMode() || HeaderFooterPreview.getHfMode().zone !== 'header') problems.push('70 x 37 : la zone remplie ne s\'ouvre pas');
          // Une fois dans l'édition, passer à l'autre zone reste permis (les boutons de la barre d'en-tête ne sont pas grisés).
          HeaderFooterPreview.enterHeaderFooterMode('footer', 'default');
          await h.sleep(250);
          if (!HeaderFooterPreview.getHfMode() || HeaderFooterPreview.getHfMode().zone !== 'footer') problems.push('70 x 37 : passer au pied depuis l\'en-tête est refusé');
          Editor.exitHeaderFooterModeIfActive();
          await h.sleep(250);
          // Retour sur une grande page : plus rien n'est grisé.
          applySize(210, 297);
          Editor.setHeaderFooterData(EMPTY_HF);
          await h.sleep(300);
          await refresh();
          if (zone('top').classList.contains('v2-hf-locked') || zone('bottom').classList.contains('v2-hf-locked')) problems.push('A4 : zones restées grisées');
        } finally {
          Editor.exitHeaderFooterModeIfActive();
          Editor.setHeaderFooterData(EMPTY_HF);
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
  ];
})();
