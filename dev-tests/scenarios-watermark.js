// Filigrane de la page (roadmap n° 14 "WaterMark" ; js/page-layout.js, js/page-layer.js, js/watermark-dialog.js, js/orientation-toggle.js, js/header-footer-preview.js,
// js/reader-mode.js, js/pdf-export.js, js/docx-export.js) : un texte écrit en grand en travers de chaque page du modèle, propre au modèle, dans le MÊME dessin pour l'éditeur,
// la Lecture, le PDF et le Word.
//
// Le réglage est une clé `watermark` du JSON de la colonne Margins ({ text, angle, color, opacity }), bornée par PageLayout.normalizeWatermark ; sa géométrie (corps des
// caractères, angle) est calculée UNE fois par PageLayer.watermarkLayout et lue par les quatre rendus. Chaque scénario compare donc ce que le rendu peint à ce que la géométrie
// commune demande : l'éditeur et la Lecture dans le DOM (centre du texte = centre de la feuille), le PDF dans le fichier produit (pdf.js : matrice du texte, opacité du remplissage,
// ordre de peinture), le Word dans le .docx produit (ancre de l'en-tête, image dont on lit les pixels), jamais les objets pdfmake / docx.js intermédiaires.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.watermark = (function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const PT = 96 / 72;
  const GRAY = 'rgb(128, 128, 128)';
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const r1 = n => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
  const lines = n => Array.from({ length: n }, (_, i) => `<p>Ligne ${i} du document de test de pagination.</p>`).join('');
  const stub = () => window.__gristStub;
  const WM = { text: 'CONFIDENTIEL', angle: 'diagonal', color: '#808080', opacity: 0.2 };

  // Repart d'un modèle neuf en Aperçu A4 (la couche des pages n'existe qu'avec lui), `html` dans l'éditeur, sans filigrane.
  async function setup(h, html) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    h.setA4Preview(true);
    Editor.setHTML(html || lines(80));
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.sleep(450);
  }
  // L'Aperçu A4 par sa vraie case (js/main.js:applyA4Preview rafraîchit la pagination) : h.setA4Preview ne change que la classe des conteneurs.
  async function setPreview(h, on) {
    const toggle = document.getElementById('v2-toggle-a4-preview');
    toggle.checked = !!on;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(600);
  }
  async function restore(h) {
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.resetEditor();
  }

  // Ce que la géométrie commune demande pour la page courante.
  function expectedLayout(wm) {
    const size = PageLayout.getPageSizePt();
    return PageLayer.watermarkLayout(PageLayout.normalizeWatermark(wm), size.width, size.height);
  }

  // Le filigrane sur les feuilles d'un rendu écran (éditeur ou Lecture) : une ligne par page, avec l'écart entre le centre du texte (tourné autour de son centre) et celui de la
  // feuille, en pixels écran.
  function layerOf(root) {
    return Array.from(root.querySelectorAll('.v2-page-layer-page')).map(box => {
      const el = box.querySelector('.v2-page-watermark');
      if (!el) return { has: false };
      const br = box.getBoundingClientRect(), er = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const m = new DOMMatrix(cs.transform);
      return {
        has: true, count: box.querySelectorAll('.v2-page-watermark').length, text: el.textContent, color: cs.color, opacity: Number(cs.opacity), fontPx: parseFloat(el.style.fontSize),
        deg: Math.round(Math.atan2(m.b, m.a) * 1800 / Math.PI) / 10, dx: r1(er.left + er.width / 2 - (br.left + br.width / 2)), dy: r1(er.top + er.height / 2 - (br.top + br.height / 2)),
        pointer: cs.pointerEvents, select: cs.userSelect, boxW: br.width, boxH: br.height,
      };
    });
  }
  const pagesOf = root => root.querySelectorAll('.v2-pagination-overlay .v2-page-band').length + 1;
  // Vérifie que chaque feuille porte UN filigrane tel que la géométrie commune le demande ; rend les écarts constatés.
  function paintProblems(label, root, wm, zoom) {
    const problems = [];
    const rows = layerOf(root);
    const want = withRgb(expectedLayout(wm));
    if (!rows.length) return [label + ' : aucune feuille ne porte de filigrane'];
    if (rows.length !== pagesOf(root)) problems.push(label + ' : ' + rows.length + ' feuille(s) avec filigrane pour ' + pagesOf(root) + ' page(s)');
    rows.forEach((row, k) => {
      if (!row.has || row.count !== 1) { problems.push(label + ' page ' + (k + 1) + ' : ' + (row.has ? row.count + ' filigranes' : 'pas de filigrane')); return; }
      if (row.text !== want.text) problems.push(label + ' page ' + (k + 1) + ' : texte « ' + row.text + ' »');
      if (row.color !== want.colorRgb) problems.push(label + ' page ' + (k + 1) + ' : couleur ' + row.color + ' (' + want.colorRgb + ' attendu)');
      if (!near(row.opacity, want.opacity, 0.005)) problems.push(label + ' page ' + (k + 1) + ' : opacité ' + row.opacity);
      if (!near(row.fontPx, want.fontSizePt * PT, 0.1)) problems.push(label + ' page ' + (k + 1) + ' : corps ' + r1(row.fontPx) + ' px (' + r1(want.fontSizePt * PT) + ' attendus)');
      if (row.deg !== want.angleDeg) problems.push(label + ' page ' + (k + 1) + ' : angle ' + row.deg + '° (' + want.angleDeg + '° attendus)');
      if (Math.abs(row.dx) > 0.7 || Math.abs(row.dy) > 0.7) problems.push(label + ' page ' + (k + 1) + ' : centre du texte à (' + row.dx + ', ' + row.dy + ') px du centre de la feuille');
    });
    return problems;
  }
  // La couleur CSS calculée d'un réglage (#rrggbb -> rgb(r, g, b)) pour comparer au rendu.
  function withRgb(layout) {
    const v = parseInt(layout.color.slice(1), 16);
    return Object.assign({ colorRgb: 'rgb(' + (v >> 16) + ', ' + ((v >> 8) & 255) + ', ' + (v & 255) + ')' }, layout);
  }

  // === Le réglage : borné, enregistré, rétro-compatible ===

  cases.push({
    id: 'wm_settings_are_bounded_and_templates_without_watermark_are_unchanged',
    description: 'normalizeWatermark borne tout (40 caractères, blancs réduits, sens, couleur #rrggbb, opacité de 5 à 100 %) ; sans texte, pas de filigrane ; un modèle d\'avant ce réglage garde ses clés une à une',
    run: async (h) => {
      const problems = [];
      const n = PageLayout.normalizeWatermark;
      const eq = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); };
      eq('défauts', n({ text: 'Brouillon' }), { text: 'Brouillon', angle: 'diagonal', color: '#808080', opacity: 0.2 });
      eq('blancs réduits', n({ text: '  Ne   pas \n copier  ' }).text, 'Ne pas copier');
      eq('40 caractères', n({ text: 'x'.repeat(60) }).text.length, 40);
      eq('texte vide', n({ text: '   ' }), null);
      eq('pas un texte', n({ text: 12 }), null);
      eq('pas un objet', [n(null), n('CONFIDENTIEL'), n(['x']), n(undefined), n(12)], [null, null, null, null, null]);
      eq('sens inconnu', n({ text: 'A', angle: 'vertical' }).angle, 'diagonal');
      eq('sens horizontal', n({ text: 'A', angle: 'horizontal' }).angle, 'horizontal');
      eq('couleur valide en majuscules', n({ text: 'A', color: '#C62828' }).color, '#c62828');
      eq('couleur inconnue', [n({ text: 'A', color: 'red' }).color, n({ text: 'A', color: 'javascript:alert(1)' }).color, n({ text: 'A', color: '#12345' }).color, n({ text: 'A', color: 5 }).color], ['#808080', '#808080', '#808080', '#808080']);
      eq('opacité bornée', [n({ text: 'A', opacity: 0 }).opacity, n({ text: 'A', opacity: -3 }).opacity, n({ text: 'A', opacity: 7 }).opacity, n({ text: 'A', opacity: 0.5 }).opacity, n({ text: 'A', opacity: 0.234 }).opacity, n({ text: 'A', opacity: 'abc' }).opacity, n({ text: 'A', opacity: null }).opacity], [0.05, 0.05, 1, 0.5, 0.23, 0.2, 0.2]);
      // Un modèle sans filigrane garde exactement les clés d'avant : ni `watermark` vide, ni `null`.
      PageLayout.setMarginsMm(null);
      eq('clés sans filigrane', Object.keys(PageLayout.getMarginsMm()), ['top', 'right', 'bottom', 'left', 'orientation', 'format']);
      eq('rien dans les marges en pt ni en twips', [Object.keys(PageLayout.getMarginsPt()).indexOf('watermark'), Object.keys(PageLayout.getMarginsTwip()).indexOf('watermark')], [-1, -1]);
      PageLayout.setMarginsMm({ top: 12, right: 12, bottom: 12, left: 12 });
      eq('modèle d\'avant ce réglage', PageLayout.getWatermark(), null);
      PageLayout.setMarginsMm({ top: 12, right: 12, bottom: 12, left: 12, watermark: { text: 'Z', color: 'javascript:alert(1)', angle: 'x', opacity: 'abc' } });
      eq('JSON abîmé : valeurs par défaut', PageLayout.getWatermark(), { text: 'Z', angle: 'diagonal', color: '#808080', opacity: 0.2 });
      PageLayout.setMarginsMm({ top: 12, right: 12, bottom: 12, left: 12, watermark: 'CONFIDENTIEL' });
      eq('JSON abîmé : un texte à la place de l\'objet', PageLayout.getWatermark(), null);
      PageLayout.setMarginsMm(null);
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'wm_set_remove_announce_once_and_survive_page_changes',
    description: 'setWatermark annonce pp:watermarkChanged seulement quand le filigrane CHANGE ; il survit au sens, au format et aux marges ; les marges en pt et en twips le portent pour les exporteurs ; le JSON enregistré le restitue',
    run: async (h) => {
      const problems = [];
      PageLayout.setMarginsMm(null);
      const events = [];
      const onEvent = e => events.push(e.detail.watermark ? e.detail.watermark.text : null);
      document.addEventListener('pp:watermarkChanged', onEvent);
      try {
        const emptyOnNone = PageLayout.setWatermark({ text: '   ' });
        const first = PageLayout.setWatermark({ text: 'Confidentiel' });
        const again = PageLayout.setWatermark({ text: '  Confidentiel ', angle: 'diagonal', color: '#808080', opacity: 0.2 });
        if (!first || again || emptyOnNone) problems.push('retours : ' + [first, again, emptyOnNone].join());
        if (events.join('|') !== 'Confidentiel') problems.push('événements après trois appels : ' + events.join('|'));
        PageLayout.setOrientation('landscape');
        PageLayout.setFormat('A5');
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { top: 30 }));
        const kept = PageLayout.getWatermark();
        if (!kept || kept.text !== 'Confidentiel' || PageLayout.getFormat() !== 'A5' || !PageLayout.isLandscape()) problems.push('le filigrane ne survit pas au sens, au format et aux marges : ' + JSON.stringify({ kept, format: PageLayout.getFormat() }));
        const pt = PageLayout.getMarginsPt(), twip = PageLayout.getMarginsTwip();
        if (!pt.watermark || pt.watermark.text !== 'Confidentiel' || !twip.watermark || twip.watermark.text !== 'Confidentiel') problems.push('marges en pt / twips sans filigrane : ' + JSON.stringify({ pt: pt.watermark, twip: twip.watermark }));
        // Le JSON enregistré dans la colonne Margins, relu tel quel.
        const stored = JSON.stringify(PageLayout.getMarginsMm());
        PageLayout.setMarginsMm(null);
        if (PageLayout.getWatermark() !== null) problems.push('setMarginsMm(null) ne remet pas à zéro');
        PageLayout.setMarginsMm(JSON.parse(stored));
        const back = PageLayout.getWatermark();
        if (!back || back.text !== 'Confidentiel' || PageLayout.getFormat() !== 'A5') problems.push('JSON relu : ' + JSON.stringify(back));
        const removed = PageLayout.setWatermark(null);
        const removedAgain = PageLayout.setWatermark(null);
        if (!removed || removedAgain || PageLayout.getWatermark() !== null || 'watermark' in PageLayout.getMarginsMm() || events.map(String).join('|') !== 'Confidentiel|null') problems.push('retrait : ' + JSON.stringify({ removed, removedAgain, events }));
        if (PageLayout.getFormat() !== 'A5') problems.push('retirer le filigrane a touché le format');
      } finally {
        document.removeEventListener('pp:watermarkChanged', onEvent);
        PageLayout.setMarginsMm(null);
        OrientationToggle.sync();
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  // === La géométrie commune ===

  cases.push({
    id: 'wm_geometry_keeps_the_text_inside_the_page_for_every_format_text_and_direction',
    description: 'PageLayer.watermarkLayout : pour A3 à A6, portrait et paysage, des textes courts, longs, très larges (WWW) et très étroits (iii), en diagonale et à l\'horizontale, l\'encre MESURÉE (Roboto gras) reste dans la page avec une marge, le corps est lisible et le même corps vaut pour les quatre rendus',
    run: async (h) => {
      await document.fonts.load('700 40px Roboto', 'CONFIDENTIEL');
      const texts = ['CONFIDENTIEL', 'BROUILLON', 'COPIE', 'A', 'OK', 'Ne pas diffuser sans autorisation écrite', 'W'.repeat(40), 'i'.repeat(40), 'Ne pas copier - usage interne uniquement', 'DRAFT 2026', 'Éàç @ % ? !'];
      const g = document.createElement('canvas').getContext('2d');
      const problems = [];
      const CAP = 0.711; // hauteur des capitales de Roboto, en em
      let worst = { ratio: 0 }, smallest = { fontSizePt: 1e9 }, count = 0;
      for (const format of PageLayout.getFormats().map(f => f.id)) {
        for (const orientation of ['portrait', 'landscape']) {
          const size = PageLayout.pageSizePtFor(orientation, format);
          for (const text of texts) {
            for (const angle of ['diagonal', 'horizontal']) {
              const label = format + ' ' + orientation + ' ' + angle + ' « ' + text.slice(0, 14) + ' »';
              const layout = PageLayer.watermarkLayout(PageLayout.normalizeWatermark({ text, angle }), size.width, size.height);
              count++;
              if (!layout || layout.text !== PageLayout.normalizeWatermark({ text }).text || layout.text !== text) { problems.push(label + ' : pas de géométrie ou texte changé'); continue; }
              g.font = '700 ' + layout.fontSizePt + 'px Roboto';
              const width = g.measureText(layout.text).width;
              const rad = Math.abs(layout.angleDeg) * Math.PI / 180;
              const inkW = width * Math.cos(rad) + CAP * layout.fontSizePt * Math.sin(rad), inkH = width * Math.sin(rad) + CAP * layout.fontSizePt * Math.cos(rad);
              const ratio = Math.max(inkW / size.width, inkH / size.height);
              if (ratio > worst.ratio) worst = { ratio: +ratio.toFixed(3), label };
              if (layout.fontSizePt < smallest.fontSizePt) smallest = { fontSizePt: layout.fontSizePt, label };
              if (ratio > 0.95) problems.push(label + ' : l\'encre occupe ' + Math.round(ratio * 100) + ' % de la page');
              if (layout.fontSizePt < 6 || layout.fontSizePt > 200) problems.push(label + ' : corps ' + layout.fontSizePt + ' pt hors de 6 à 200');
              if (angle === 'horizontal' && layout.angleDeg !== 0) problems.push(label + ' : angle ' + layout.angleDeg);
              if (angle === 'diagonal' && layout.angleDeg !== -45) problems.push(label + ' : angle ' + layout.angleDeg);
              if (layout.fontSizePt > Math.min(size.width, size.height) * 0.45 + 0.05) problems.push(label + ' : corps ' + layout.fontSizePt + ' pt plus grand que 45 % du petit côté');
            }
          }
        }
      }
      // Un texte ordinaire est lisible de loin : « CONFIDENTIEL » prend au moins 10 % du petit côté d'un A6 et du double sur un A4.
      const a6 = PageLayout.pageSizePtFor('portrait', 'A6'), a4 = PageLayout.pageSizePtFor('portrait', 'A4');
      const small = PageLayer.watermarkLayout(PageLayout.normalizeWatermark({ text: 'CONFIDENTIEL' }), a6.width, a6.height).fontSizePt;
      const big = PageLayer.watermarkLayout(PageLayout.normalizeWatermark({ text: 'CONFIDENTIEL' }), a4.width, a4.height).fontSizePt;
      if (small < a6.width * 0.1 || big < small * 1.9) problems.push('corps de « CONFIDENTIEL » : ' + small + ' pt en A6, ' + big + ' pt en A4');
      // Les bornes du texte nul.
      if (PageLayer.watermarkLayout(null, 595, 842) !== null || PageLayer.watermarkLayout({ text: '' }, 595, 842) !== null || PageLayer.watermarkLayout({ text: 'A' }, 0, 842) !== null) problems.push('pas de géométrie sans texte ni page');
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: problems.slice(0, 8), cases: count, worst, smallest }) };
    },
  });

  // === L'éditeur ===

  cases.push({
    id: 'wm_editor_paints_every_page_centered_behind_the_text_and_clears_on_removal',
    description: 'Éditeur (Aperçu A4) : chaque page porte UN filigrane au centre de sa feuille, au corps, à la couleur, à l\'opacité et à l\'angle de la géométrie commune ; il est derrière le texte, hors du document, ni cliquable ni sélectionnable ; le retirer vide la couche',
    run: async (h) => {
      await setup(h);
      try {
        const problems = [];
        const ec = document.getElementById('editor-container');
        const htmlBefore = Editor.getHTML();
        const textBefore = EditorCore.getEditor().getText();
        PageLayout.setWatermark(WM);
        await h.sleep(250);
        problems.push(...paintProblems('éditeur', ec, WM));
        const rows = layerOf(ec);
        if (rows.length < 2) problems.push('le document de test tient sur ' + rows.length + ' page(s), il en faut au moins 2');
        if (rows.some(r => r.pointer !== 'none' || r.select !== 'none')) problems.push('le filigrane est cliquable ou sélectionnable : ' + JSON.stringify(rows.map(r => [r.pointer, r.select])));
        // Derrière le texte : la couche précède le contenu dans la feuille, et le document n'a pas bougé (le filigrane n'en fait pas partie).
        const layer = ec.querySelector('.v2-page-layer');
        const position = layer ? layer.compareDocumentPosition(h.tiptap()) : 0;
        if (!layer || !(position & Node.DOCUMENT_POSITION_FOLLOWING)) problems.push('la couche n\'est pas avant le texte dans la feuille');
        if (layer && layer.contains(h.tiptap())) problems.push('la couche contient le texte');
        if (Editor.getHTML() !== htmlBefore || EditorCore.getEditor().getText() !== textBefore || h.tiptap().querySelector('.v2-page-watermark')) problems.push('le filigrane est entré dans le document');
        EditorCore.getEditor().commands.selectAll();
        const selected = String(window.getSelection());
        if (selected.indexOf('CONFIDENTIEL') !== -1) problems.push('« Tout sélectionner » prend le texte du filigrane');
        // Un clic au centre de la première feuille passe à travers : l'élément touché n'est jamais le filigrane.
        const first = ec.querySelector('.v2-page-layer-page').getBoundingClientRect();
        const touched = document.elementFromPoint(first.left + first.width / 2, Math.min(first.top + first.height / 2, innerHeight - 5));
        if (touched && touched.closest && touched.closest('.v2-page-watermark')) problems.push('un clic touche le filigrane');
        // Autre réglage : horizontal, rouge, 50 % - la couche est repeinte, jamais empilée.
        PageLayout.setWatermark({ text: 'Brouillon à relire', angle: 'horizontal', color: '#c62828', opacity: 0.5 });
        await h.sleep(250);
        problems.push(...paintProblems('éditeur (horizontal)', ec, { text: 'Brouillon à relire', angle: 'horizontal', color: '#c62828', opacity: 0.5 }));
        // Retirer.
        PageLayout.setWatermark(null);
        await h.sleep(250);
        const left = ec.querySelectorAll('.v2-page-watermark').length;
        const layers = ec.querySelectorAll('.v2-page-layer').length;
        if (left || layers) problems.push('après retrait : ' + left + ' filigrane(s) et ' + layers + ' couche(s) restent');
        if (Editor.getHTML() !== htmlBefore) problems.push('le document a changé');
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, pages: rows.length, sample: rows[0] }) };
      } finally { await restore(h); }
    },
  });

  cases.push({
    id: 'wm_editor_follows_the_page_format_and_orientation_and_stays_with_the_template_without_a4_preview',
    description: 'Le filigrane suit la page : en A5 paysage chaque feuille porte le sien, recentré et recalculé pour CETTE page (corps différent) ; sans Aperçu A4 il n\'y a pas de page à orner (rien n\'est peint, rien ne casse) et il revient avec l\'Aperçu',
    run: async (h) => {
      await setup(h);
      try {
        const problems = [];
        const ec = document.getElementById('editor-container');
        PageLayout.setWatermark(WM);
        await h.sleep(250);
        const a4 = expectedLayout(WM).fontSizePt;
        PageLayout.setFormat('A5');
        PageLayout.setOrientation('landscape');
        await h.sleep(700);
        problems.push(...paintProblems('A5 paysage', ec, WM));
        const a5 = expectedLayout(WM).fontSizePt;
        if (near(a4, a5, 0.5)) problems.push('le corps ne dépend pas de la page : ' + a4 + ' pt en A4, ' + a5 + ' pt en A5 paysage');
        PageLayout.setOrientation('portrait');
        PageLayout.setFormat('A4');
        await h.sleep(700);
        problems.push(...paintProblems('A4 de nouveau', ec, WM));
        // Sans Aperçu A4 : pas de pagination, donc pas de couche.
        await setPreview(h, false);
        const offCount = ec.querySelectorAll('.v2-page-watermark').length;
        if (offCount !== 0) problems.push('sans Aperçu A4 : ' + offCount + ' filigrane(s) peint(s)');
        PageLayout.setWatermark({ text: 'Autre texte' });
        await h.sleep(300);
        if (ec.querySelectorAll('.v2-page-watermark').length !== 0) problems.push('sans Aperçu A4, un changement de filigrane en peint un');
        await setPreview(h, true);
        problems.push(...paintProblems('Aperçu A4 rallumé', ec, { text: 'Autre texte' }));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, a4, a5 }) };
      } finally { await restore(h); }
    },
  });

  // === La Lecture ===

  function restoreReader() {
    const container = document.getElementById('reader-container');
    if (container) container.style.display = '';
    document.getElementById('editor-container').style.display = '';
    document.getElementById('btn-mode-edit').click();
  }
  cases.push({
    id: 'wm_reader_paints_the_same_watermark_on_every_page_as_the_editor',
    description: 'Lecture : chaque page porte le même filigrane que l\'éditeur (texte, couleur, opacité, corps, angle), centré sur sa feuille ; retirer le filigrane le retire de la Lecture',
    run: async (h) => {
      await setup(h);
      try {
        const problems = [];
        const wm = { text: 'BROUILLON', angle: 'horizontal', color: '#1565c0', opacity: 0.45 };
        PageLayout.setWatermark(wm);
        await h.sleep(200);
        await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
        await h.sleep(300);
        const rc = document.getElementById('reader-container');
        problems.push(...paintProblems('Lecture', rc, wm));
        const rows = layerOf(rc);
        if (rows.length < 2) problems.push('la Lecture n\'a que ' + rows.length + ' page(s)');
        if (rows.some(r => r.pointer !== 'none' || r.select !== 'none')) problems.push('le filigrane de la Lecture est cliquable ou sélectionnable');
        const content = rc.querySelector('.reader-content');
        if (content && content.querySelector('.v2-page-watermark')) problems.push('le filigrane est dans le texte de la Lecture');
        // Le filigrane se retire aussi de la Lecture (rendu de nouveau).
        PageLayout.setWatermark(null);
        await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
        await h.sleep(300);
        if (rc.querySelectorAll('.v2-page-watermark').length) problems.push('la Lecture garde un filigrane après retrait');
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, pages: rows.length }) };
      } finally { restoreReader(); await restore(h); }
    },
  });

  // === Le PDF ===

  // Les pages du PDF produit, lues par pdf.js : le texte (dans l'ordre de peinture), sa matrice, et l'opacité du remplissage en vigueur à chaque affichage de texte.
  async function pdfPagesOf(h, base64) {
    await h.ensurePdfJsLoaded();
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const OPS = window.pdfjsLib.OPS;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter(i => i.str && i.str.trim()).map(i => ({ str: i.str, m: Array.from(i.transform), width: i.width }));
      const ops = await page.getOperatorList();
      let alpha = 1, fill = null;
      const stack = [], shown = [];
      for (let k = 0; k < ops.fnArray.length; k++) {
        const fn = ops.fnArray[k], args = ops.argsArray[k];
        if (fn === OPS.save) stack.push([alpha, fill]);
        else if (fn === OPS.restore) { const top = stack.pop(); if (top) { alpha = top[0]; fill = top[1]; } }
        else if (fn === OPS.setGState) { for (const entry of args[0]) if (entry[0] === 'ca') alpha = entry[1]; }
        else if (fn === OPS.setFillRGBColor) fill = Array.from(args);
        else if (fn === OPS.showText || fn === OPS.showSpacedText) shown.push({ alpha, fill });
      }
      pages.push({ width: view.width, height: view.height, items, shown });
    }
    return pages;
  }

  cases.push({
    id: 'wm_pdf_paints_the_text_first_on_every_page_at_the_centre_with_the_chosen_size_angle_and_opacity',
    description: 'PDF : chaque page commence par le texte du filigrane, peint AVANT le contenu (derrière lui), en vrai texte vectoriel, au corps et à l\'angle de la géométrie commune, centré sur la page, à la couleur et à l\'opacité choisies ; le contenu garde son opacité pleine',
    run: async (h) => {
      await setup(h);
      try {
        const problems = [];
        const wm = { text: 'CONFIDENTIEL', angle: 'diagonal', color: '#c62828', opacity: 0.35 };
        PageLayout.setWatermark(wm);
        const want = expectedLayout(wm);
        const result = await h.exportPdfContent(lines(90), null, PageLayout.getMarginsPt());
        const pages = await pdfPagesOf(h, result.base64);
        if (pages.length < 2) problems.push('le PDF n\'a que ' + pages.length + ' page(s)');
        pages.forEach((page, k) => {
          const label = 'page ' + (k + 1);
          const first = page.items[0];
          if (!first || first.str !== wm.text) { problems.push(label + ' : le premier texte peint est « ' + (first && first.str) + ' » au lieu du filigrane'); return; }
          if (!page.items.slice(1).some(i => /Ligne/.test(i.str))) problems.push(label + ' : le contenu n\'est pas peint après le filigrane');
          const m = first.m;
          const size = Math.hypot(m[0], m[1]);
          const theta = Math.atan2(m[1], m[0]);
          if (!near(size, want.fontSizePt, 0.3)) problems.push(label + ' : corps ' + r1(size) + ' pt (' + want.fontSizePt + ' attendus)');
          // Le repère du PDF a l'axe y vers le haut : -45° de CSS (le texte monte vers la droite) y vaut +45°.
          if (!near(theta * 180 / Math.PI, -want.angleDeg, 0.5)) problems.push(label + ' : angle ' + r1(theta * 180 / Math.PI) + '° (' + (-want.angleDeg) + '° attendus)');
          // Le centre de la boîte du texte (la ligne de base est 0,342 em sous lui, dans le repère du texte) est le centre de la page.
          const u = [Math.cos(theta), Math.sin(theta)], v = [-Math.sin(theta), Math.cos(theta)];
          const cx = m[4] + first.width / 2 * u[0] + 0.342 * size * v[0], cy = m[5] + first.width / 2 * u[1] + 0.342 * size * v[1];
          if (!near(cx, page.width / 2, 1.6) || !near(cy, page.height / 2, 1.6)) problems.push(label + ' : centre du texte à (' + r1(cx) + ', ' + r1(cy) + ') pt, page de ' + r1(page.width) + ' x ' + r1(page.height));
          // Le texte du filigrane est affiché en plusieurs morceaux (un par groupe de glyphes) : tous en tête de la page, tous à la même opacité et à la même couleur.
          const marked = page.shown.filter(sh => sh.alpha !== 1), body = page.shown.filter(sh => sh.alpha === 1);
          const prefix = marked.length > 0 && page.shown.slice(0, marked.length).every(sh => sh.alpha !== 1);
          if (!marked.length || !prefix) problems.push(label + ' : les affichages du filigrane ne sont pas tous en tête de la page (' + JSON.stringify(page.shown.slice(0, 14).map(sh => sh.alpha)) + ')');
          if (marked.some(sh => !near(sh.alpha, 0.35, 0.005))) problems.push(label + ' : opacité du filigrane ' + JSON.stringify(marked.map(sh => sh.alpha)));
          if (marked.some(sh => !sh.fill || sh.fill.some((c, i) => Math.abs(c - [198, 40, 40][i]) > 1))) problems.push(label + ' : couleur ' + JSON.stringify(marked[0] && marked[0].fill));
          if (!body.length) problems.push(label + ' : aucun texte du contenu à l\'opacité pleine');
        });
        // Sans filigrane, le PDF d'avant : aucune page ne commence par ce texte.
        PageLayout.setWatermark(null);
        const plain = await h.exportPdfContent(lines(90), null, PageLayout.getMarginsPt());
        const plainPages = await pdfPagesOf(h, plain.base64);
        if (plainPages.some(p => p.items.some(i => i.str === wm.text))) problems.push('le PDF sans filigrane contient quand même le texte');
        if (plainPages.length !== pages.length) problems.push('le filigrane change le nombre de pages : ' + pages.length + ' avec, ' + plainPages.length + ' sans');
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, pages: pages.length, want }) };
      } finally { await restore(h); }
    },
  });

  cases.push({
    id: 'wm_pdf_horizontal_in_a5_landscape_and_with_an_image_on_every_page_share_the_background',
    description: 'PDF : à l\'horizontale (0°), en A5 paysage, le texte est centré sur CETTE page ; avec une image « Sur toutes les pages » le fond de chaque page porte les deux (le texte d\'abord), une seule couche de page',
    run: async (h) => {
      await setup(h);
      try {
        const problems = [];
        const wm = { text: 'COPIE', angle: 'horizontal', color: '#000000', opacity: 0.3 };
        PageLayout.setFormat('A5');
        PageLayout.setOrientation('landscape');
        PageLayout.setWatermark(wm);
        const want = expectedLayout(wm);
        const result = await h.exportPdfContent(lines(60), null, PageLayout.getMarginsPt());
        const truth = await h.extractPdfGroundTruth(result.base64);
        const pages = await pdfPagesOf(h, result.base64);
        pages.forEach((page, k) => {
          const first = page.items[0];
          if (!first || first.str !== wm.text) { problems.push('page ' + (k + 1) + ' : premier texte « ' + (first && first.str) + ' »'); return; }
          const size = Math.hypot(first.m[0], first.m[1]);
          if (!near(page.width, 595.28, 1) || !near(page.height, 419.53, 1)) problems.push('page ' + (k + 1) + ' : ' + r1(page.width) + ' x ' + r1(page.height) + ' pt au lieu de l\'A5 paysage');
          if (!near(size, want.fontSizePt, 0.3) || !near(first.m[1], 0, 0.01)) problems.push('page ' + (k + 1) + ' : corps ' + r1(size) + ' pt / pente ' + first.m[1]);
          const cx = first.m[4] + first.width / 2, cy = first.m[5] + 0.342 * size;
          if (!near(cx, page.width / 2, 1.6) || !near(cy, page.height / 2, 1.6)) problems.push('page ' + (k + 1) + ' : centre du texte à (' + r1(cx) + ', ' + r1(cy) + ') pour une page de ' + r1(page.width) + ' x ' + r1(page.height));
        });
        if (!truth.pages.every(p => p.images.length === 0)) problems.push('une image est peinte sans qu\'il y en ait dans le modèle');
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, pages: pages.length, want, size: pages[0] && [r1(pages[0].width), r1(pages[0].height)] }) };
      } finally { await restore(h); }
    },
  });

  // === Le Word ===

  // Les ancres des en-têtes du .docx produit : mode d'habillage, position, taille, et les pixels de l'image qu'elles montrent.
  async function wordAnchors(parts) {
    const found = [];
    const headers = Object.keys(parts.parts).filter(n => /^word\/header\d*\.xml$/.test(n));
    for (const name of headers) {
      const doc = new DOMParser().parseFromString(parts.parts[name], 'application/xml');
      const relsName = name.replace('word/', 'word/_rels/') + '.rels';
      const rels = {};
      if (parts.parts[relsName]) {
        const relDoc = new DOMParser().parseFromString(parts.parts[relsName], 'application/xml');
        Array.from(relDoc.getElementsByTagName('Relationship')).forEach(r => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
      }
      for (const anchor of Array.from(doc.getElementsByTagNameNS('*', 'anchor'))) {
        const q = tag => anchor.getElementsByTagNameNS('*', tag)[0];
        const blip = q('blip');
        const embed = blip && (blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
        const target = embed && rels[embed];
        const extent = q('extent');
        const posH = q('positionH'), posV = q('positionV');
        const item = {
          header: name, behind: anchor.getAttribute('behindDoc'), cx: extent ? Number(extent.getAttribute('cx')) : null, cy: extent ? Number(extent.getAttribute('cy')) : null,
          posH: posH ? { from: posH.getAttribute('relativeFrom'), align: (posH.getElementsByTagNameNS('*', 'align')[0] || {}).textContent || null, offset: (posH.getElementsByTagNameNS('*', 'posOffset')[0] || {}).textContent || null } : null,
          posV: posV ? { from: posV.getAttribute('relativeFrom'), align: (posV.getElementsByTagNameNS('*', 'align')[0] || {}).textContent || null, offset: (posV.getElementsByTagNameNS('*', 'posOffset')[0] || {}).textContent || null } : null,
          media: target ? 'word/' + target.replace(/^\.?\/?/, '') : null,
        };
        found.push(item);
      }
    }
    return found;
  }
  // Les pixels d'un PNG du .docx : boîte de l'encre (alpha > 8), alpha maximal, couleur des pixels les plus opaques.
  async function pngInk(parts, media) {
    const bytes = await parts.zip.file(media).async('uint8array');
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, maxA = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const a = d[(y * canvas.width + x) * 4 + 3];
        if (a > maxA) maxA = a;
        if (a > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
    }
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= maxA - 2 && d[i + 3] > 0) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return { width: canvas.width, height: canvas.height, bytes: bytes.length, ink: maxX < 0 ? null : { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 }, maxAlpha: maxA, color: n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null };
  }

  cases.push({
    id: 'wm_word_header_holds_a_picture_behind_the_text_centered_on_the_page_with_the_chosen_colour_and_opacity',
    description: 'Word : l\'en-tête du .docx porte une image ancrée DERRIÈRE le texte, centrée sur la page (horizontalement et verticalement), dont les pixels ont la couleur et l\'opacité choisies et dont l\'encre est centrée dans l\'image et de la taille que la géométrie demande ; sans filigrane, aucune image',
    run: async (h) => {
      await setup(h);
      try {
        const problems = [];
        await document.fonts.load('700 40px Roboto', 'CONFIDENTIEL');
        const wm = { text: 'CONFIDENTIEL', angle: 'diagonal', color: '#1565c0', opacity: 0.4 };
        PageLayout.setWatermark(wm);
        const want = expectedLayout(wm);
        const parts = await h.exportDocxParts(lines(90), null, PageLayout.getMarginsTwip());
        const anchors = await wordAnchors(parts);
        if (anchors.length !== 1) problems.push(anchors.length + ' image(s) ancrée(s) dans les en-têtes au lieu d\'une : ' + JSON.stringify(anchors));
        const a = anchors[0];
        let ink = null, expectedInkPt = null;
        if (a) {
          if (a.behind !== '1') problems.push('l\'image n\'est pas derrière le texte (behindDoc=' + a.behind + ')');
          if (!a.posH || a.posH.from !== 'page' || a.posH.align !== 'center') problems.push('position horizontale : ' + JSON.stringify(a.posH));
          if (!a.posV || a.posV.from !== 'page' || a.posV.align !== 'center') problems.push('position verticale : ' + JSON.stringify(a.posV));
          if (!a.media || !parts.zip.file(a.media)) problems.push('image introuvable : ' + a.media);
          else {
            ink = await pngInk(parts, a.media);
            const EMU_PER_PT = 12700;
            const widthPt = a.cx / EMU_PER_PT, heightPt = a.cy / EMU_PER_PT;
            // L'image est à l'échelle de sa taille d'affichage (1,5 pixel par point).
            if (!near(ink.width / widthPt, 1.5, 0.05) || !near(ink.height / heightPt, 1.5, 0.05)) problems.push('échelle de l\'image : ' + r1(ink.width / widthPt) + ' px/pt en largeur, ' + r1(ink.height / heightPt) + ' en hauteur');
            if (!ink.ink) problems.push('l\'image est transparente partout');
            else {
              const centerX = (ink.ink.x0 + ink.ink.x1) / 2 / ink.width, centerY = (ink.ink.y0 + ink.ink.y1) / 2 / ink.height;
              if (!near(centerX, 0.5, 0.03) || !near(centerY, 0.5, 0.03)) problems.push('l\'encre n\'est pas centrée dans l\'image : (' + r1(centerX * 100) + ' %, ' + r1(centerY * 100) + ' %)');
              if (!near(ink.maxAlpha, 0.4 * 255, 4)) problems.push('opacité de l\'image : alpha ' + ink.maxAlpha + ' (' + Math.round(0.4 * 255) + ' attendu)');
              if (!ink.color || ink.color.some((c, i) => Math.abs(c - [21, 101, 192][i]) > 6)) problems.push('couleur de l\'image : ' + JSON.stringify(ink.color));
              // L'encre mesurée dans l'image se compare à la boîte de la géométrie commune (largeur du texte en Roboto gras, hauteur des capitales).
              const g = document.createElement('canvas').getContext('2d');
              g.font = '700 ' + want.fontSizePt + 'px Roboto';
              const textW = g.measureText(want.text).width, capH = 0.711 * want.fontSizePt, rad = Math.abs(want.angleDeg) * Math.PI / 180;
              expectedInkPt = { w: textW * Math.cos(rad) + capH * Math.sin(rad), h: textW * Math.sin(rad) + capH * Math.cos(rad) };
              const inkWPt = (ink.ink.x1 - ink.ink.x0) / 1.5, inkHPt = (ink.ink.y1 - ink.ink.y0) / 1.5;
              // L'encre est plus petite que la boîte tournée du texte (les coins de la boîte n'ont pas d'encre : le haut de « C », le bas de « L » après l'angle) : de 88 à 103 %.
              const share = [inkWPt / expectedInkPt.w, inkHPt / expectedInkPt.h];
              if (share.some(x => x < 0.88 || x > 1.03)) problems.push('encre de ' + r1(inkWPt) + ' x ' + r1(inkHPt) + ' pt, ' + r1(expectedInkPt.w) + ' x ' + r1(expectedInkPt.h) + ' attendus');
              if (ink.bytes > 90000) problems.push('image de ' + ink.bytes + ' octets : trop lourde pour un en-tête');
            }
          }
        }
        // L'en-tête est bien celui des sections du document.
        const sect = parts.parts['word/document.xml'].match(/<w:headerReference[^>]*>/g) || [];
        if (!sect.length) problems.push('le document ne référence aucun en-tête');
        // Sans filigrane : plus d'image dans l'en-tête.
        PageLayout.setWatermark(null);
        const plain = await h.exportDocxParts(lines(90), null, PageLayout.getMarginsTwip());
        const plainAnchors = await wordAnchors(plain);
        if (plainAnchors.length) problems.push('sans filigrane, ' + plainAnchors.length + ' image(s) restent dans les en-têtes');
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, anchor: a, ink, expectedInkPt }) };
      } finally { await restore(h); }
    },
  });

  // === Avec une image « Sur toutes les pages » : une seule couche de page ===

  const PNG = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 40;
    const g = canvas.getContext('2d');
    g.fillStyle = '#c33'; g.fillRect(0, 0, 40, 40);
    return canvas.toDataURL('image/png');
  })();
  const layerImage = () => '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 60px; height: 60px; position: absolute; left: 30px; top: 20px; z-index: -1;" data-layer="behind" data-wrap="inline" data-repeat="true" data-page-index="0" data-page-left-pt="-10" data-page-top-pt="-10"></p>';

  cases.push({
    id: 'wm_shares_the_page_layer_with_images_on_every_page',
    description: 'Une image « Sur toutes les pages » et un filigrane : l\'éditeur les peint dans la MÊME boîte de page (le texte d\'abord, sous l\'image), le PDF les met dans le même fond de page (texte puis image), le Word ancre les deux dans l\'en-tête',
    run: async (h) => {
      await setup(h, layerImage() + lines(80));
      try {
        const problems = [];
        PageLayout.setWatermark(WM);
        await h.sleep(300);
        const ec = document.getElementById('editor-container');
        const boxes = Array.from(ec.querySelectorAll('.v2-page-layer-page'));
        if (boxes.length < 2) problems.push('seulement ' + boxes.length + ' boîte(s) de page');
        // Les copies de l'image ne sont que sur les pages 2 et suivantes (l'original est sur la première) ; le filigrane est sur toutes, avant les images dans la boîte.
        boxes.forEach((box, k) => {
          const kids = Array.from(box.children).map(c => c.className.replace(/\s+/g, '.'));
          if (!kids.length || kids[0] !== 'v2-page-watermark') problems.push('page ' + (k + 1) + ' : le premier élément de la boîte est « ' + kids[0] + ' »');
          if (k > 0 && !kids.some(c => /v2-page-layer-copy/.test(c))) problems.push('page ' + (k + 1) + ' : pas de copie de l\'image');
        });
        const pdf = await h.exportPdfContent(Editor.getHTML(), null, PageLayout.getMarginsPt());
        const truth = await h.extractPdfGroundTruth(pdf.base64);
        const pages = await pdfPagesOf(h, pdf.base64);
        pages.forEach((page, k) => { if (!page.items[0] || page.items[0].str !== WM.text) problems.push('PDF page ' + (k + 1) + ' : le filigrane n\'est pas peint en premier'); });
        if (!truth.pages.every(p => p.images.length >= 1)) problems.push('PDF : une page n\'a pas l\'image : ' + JSON.stringify(truth.pages.map(p => p.images.length)));
        const parts = await h.exportDocxParts(Editor.getHTML(), null, PageLayout.getMarginsTwip());
        const anchors = await wordAnchors(parts);
        if (anchors.length !== 2) problems.push('Word : ' + anchors.length + ' image(s) ancrée(s) dans les en-têtes au lieu de deux (le filigrane et l\'image)');
        if (anchors.some(a => a.behind !== '1')) problems.push('Word : une image ancrée n\'est pas derrière le texte');
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, boxes: boxes.length }) };
      } finally { await restore(h); }
    },
  });

  // === Le modèle enregistré ===

  async function savedTemplate(h, nom, html, watermark) {
    // « Nouveau » d'abord : sans lui, Enregistrer réécrirait le modèle précédent au lieu d'en créer un.
    await h.clickButton('btn-new');
    await h.sleep(300);
    await setup(h, html);
    PageLayout.setWatermark(watermark || null);
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }
  async function selectTemplate(h, id) {
    const select = document.getElementById('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(800);
  }

  cases.push({
    id: 'wm_saved_with_template_restored_on_load_and_old_or_damaged_json_load_cleanly',
    description: 'Le filigrane s\'enregistre avec le modèle (clé `watermark` de la colonne Margins) et revient à son chargement, peint ; un autre modèle n\'en a pas ; un modèle d\'avant ce réglage et un JSON abîmé se chargent sans filigrane ni erreur ; un macro-modèle a le sien',
    run: async (h) => {
      const problems = [];
      const errors = [];
      const onError = e => errors.push(e.message);
      window.addEventListener('error', onError);
      try {
        const withId = await savedTemplate(h, 'Filigrane présent', lines(60), { text: 'DRAFT', angle: 'horizontal', color: '#2e7d32', opacity: 0.35 });
        const withSaved = JSON.parse(stub().getRow(TABLE, withId).Margins || '{}');
        if (!withSaved.watermark || withSaved.watermark.text !== 'DRAFT' || withSaved.watermark.angle !== 'horizontal' || withSaved.watermark.color !== '#2e7d32' || withSaved.watermark.opacity !== 0.35) problems.push('colonne Margins : ' + JSON.stringify(withSaved));
        if (withSaved.format !== 'A4' || withSaved.orientation !== 'portrait') problems.push('le format et le sens ne sont plus enregistrés : ' + JSON.stringify(withSaved));
        const plainId = await savedTemplate(h, 'Filigrane absent', lines(60), null);
        const plainSaved = JSON.parse(stub().getRow(TABLE, plainId).Margins || '{}');
        if ('watermark' in plainSaved) problems.push('un modèle sans filigrane enregistre la clé : ' + JSON.stringify(plainSaved));
        // Retour au premier : le filigrane revient, et il est peint dans l'éditeur.
        await selectTemplate(h, withId);
        const ec = document.getElementById('editor-container');
        h.setA4Preview(true);
        await h.sleep(500);
        const loaded = PageLayout.getWatermark();
        if (!loaded || loaded.text !== 'DRAFT' || loaded.color !== '#2e7d32') problems.push('rechargé : ' + JSON.stringify(loaded));
        if (loaded) problems.push(...paintProblems('rechargé', ec, loaded));
        // L'autre modèle n'en a pas, et la couche est vidée.
        await selectTemplate(h, plainId);
        await h.sleep(400);
        if (PageLayout.getWatermark() !== null || ec.querySelectorAll('.v2-page-watermark').length) problems.push('le filigrane reste en passant à un modèle qui n\'en a pas');
        // Modèle d'avant ce réglage : quatre marges, rien d'autre.
        stub().remoteWrite(TABLE, plainId, { Margins: JSON.stringify({ top: 12, right: 12, bottom: 12, left: 12 }) });
        await Templates.loadAll();
        await selectTemplate(h, withId);
        await selectTemplate(h, plainId);
        if (PageLayout.getWatermark() !== null) problems.push('modèle d\'avant ce réglage : ' + JSON.stringify(PageLayout.getWatermark()));
        // JSON abîmé : couleur et sens inconnus -> valeurs par défaut ; un filigrane qui n'est pas un objet -> aucun.
        stub().remoteWrite(TABLE, plainId, { Margins: JSON.stringify({ top: 15, right: 15, bottom: 15, left: 15, watermark: { text: 'Z', color: 'javascript:alert(1)', angle: 'x', opacity: 'abc' } }) });
        await Templates.loadAll();
        await selectTemplate(h, withId);
        await selectTemplate(h, plainId);
        const damaged = PageLayout.getWatermark();
        if (!damaged || damaged.text !== 'Z' || damaged.color !== '#808080' || damaged.angle !== 'diagonal' || damaged.opacity !== 0.2) problems.push('JSON abîmé : ' + JSON.stringify(damaged));
        stub().remoteWrite(TABLE, plainId, { Margins: JSON.stringify({ top: 15, right: 15, bottom: 15, left: 15, watermark: 'CONFIDENTIEL' }) });
        await Templates.loadAll();
        await selectTemplate(h, withId);
        await selectTemplate(h, plainId);
        if (PageLayout.getWatermark() !== null) problems.push('filigrane qui n\'est pas un objet : ' + JSON.stringify(PageLayout.getWatermark()));
        // Un macro-modèle a sa propre page, donc son propre filigrane.
        const macro = await Templates.save(null, 'Filigrane macro', JSON.stringify({ slots: [] }), '', null, Object.assign({ top: 10, right: 10, bottom: 10, left: 10 }, { orientation: 'portrait', format: 'A4', watermark: { text: 'MACRO', angle: 'diagonal', color: '#000000', opacity: 0.1 } }), 'macro', null);
        await Templates.loadAll();
        const select = document.getElementById('template-select');
        if (!Array.from(select.options).some(o => o.value === String(macro.id))) {
          const option = document.createElement('option'); option.value = String(macro.id); option.textContent = 'Filigrane macro'; select.appendChild(option);
        }
        await selectTemplate(h, macro.id);
        const macroWm = PageLayout.getWatermark();
        if (!macroWm || macroWm.text !== 'MACRO' || macroWm.opacity !== 0.1) problems.push('macro-modèle : ' + JSON.stringify(macroWm));
        await selectTemplate(h, plainId);
        if (errors.length) problems.push('erreurs JavaScript : ' + errors.join(' | '));
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      } finally {
        window.removeEventListener('error', onError);
        await h.clickButton('btn-new');
        await restore(h);
      }
    },
  });

  // === La fenêtre et le menu ===

  cases.push({
    id: 'wm_dialog_applies_removes_and_the_autosave_writes_it',
    description: 'La fenêtre « Filigrane… » : « Valider » pose le réglage borné et prévient l\'auto-save, qui écrit la clé dans la colonne Margins ; « Annuler » ne touche à rien ; un texte vidé puis « Valider » retire ; « Retirer le filigrane » aussi, et n\'apparaît que s\'il y a un filigrane',
    run: async (h) => {
      const problems = [];
      const id = await savedTemplate(h, 'Filigrane fenêtre', lines(40), null);
      try {
        const modal = () => document.getElementById('pp-watermark-modal');
        const field = () => document.getElementById('pp-watermark-text');
        const button = cls => modal().querySelector('.var-modal-actions button.' + cls);
        const cancel = () => Array.from(modal().querySelectorAll('.var-modal-actions button')).find(b => !b.classList.contains('var-modal-primary') && !b.classList.contains('var-modal-danger'));
        const choose = (selector) => modal().querySelector(selector).click();
        const open = () => { const ok = WatermarkDialog.open(); return ok && modal().style.display !== 'none'; };
        if (!open()) problems.push('la fenêtre ne s\'ouvre pas');
        if (!button('var-modal-danger').hidden) problems.push('« Retirer » est affiché alors qu\'il n\'y a pas de filigrane');
        // Annuler ne touche à rien.
        field().value = 'ABANDONNÉ'; field().dispatchEvent(new Event('input', { bubbles: true }));
        cancel().click();
        if (modal().style.display !== 'none' || PageLayout.getWatermark() !== null) problems.push('Annuler a posé un filigrane : ' + JSON.stringify(PageLayout.getWatermark()));
        // Valider pose le réglage (texte + couleur + sens + opacité choisis dans la fenêtre).
        open();
        field().value = '  Ne   pas copier '; field().dispatchEvent(new Event('input', { bubbles: true }));
        choose('.pp-watermark-swatch[data-color="red"]');
        choose('.pp-watermark-choice[data-value="horizontal"]');
        const range = document.getElementById('pp-watermark-opacity');
        range.value = '65'; range.dispatchEvent(new Event('input', { bubbles: true }));
        stub().clearActionLog();
        button('var-modal-primary').click();
        const set = PageLayout.getWatermark();
        if (!set || set.text !== 'Ne pas copier' || set.color !== '#c62828' || set.angle !== 'horizontal' || set.opacity !== 0.65) problems.push('réglage posé : ' + JSON.stringify(set));
        if (modal().style.display !== 'none') problems.push('Valider ne ferme pas la fenêtre');
        // Le brouillon est marqué modifié : un tick d'auto-save écrit la clé dans la colonne Margins.
        await h.sleep(2500 + 900);
        const written = JSON.parse(stub().getRow(TABLE, id).Margins || '{}');
        const writes = stub().countActions('UpdateRecord', TABLE);
        if (!written.watermark || written.watermark.text !== 'Ne pas copier' || written.watermark.opacity !== 0.65) problems.push('colonne Margins après l\'auto-save : ' + JSON.stringify(written) + ' (' + writes + ' écriture(s))');
        // Rouverte, la fenêtre montre ce réglage ; « Retirer » est là.
        open();
        const shown = { text: field().value, color: modal().querySelector('.pp-watermark-swatch[aria-checked="true"]').dataset.color, angle: modal().querySelector('.pp-watermark-choice[aria-checked="true"]').dataset.value, range: range.value, percent: modal().querySelector('.pp-watermark-percent').textContent, remove: !button('var-modal-danger').hidden };
        if (shown.text !== 'Ne pas copier' || shown.color !== 'red' || shown.angle !== 'horizontal' || shown.range !== '65' || shown.percent !== '65 %' || !shown.remove) problems.push('fenêtre rouverte : ' + JSON.stringify(shown));
        // Un réglage à 23 % (écrit à la main) n'est pas arrondi à l'ouverture par le curseur : « Valider » sans y toucher le garde tel quel.
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { watermark: { text: 'Z', angle: 'diagonal', color: '#123456', opacity: 0.23 } }));
        cancel().click();
        open();
        button('var-modal-primary').click();
        const kept = PageLayout.getWatermark();
        if (!kept || kept.opacity !== 0.23 || kept.color !== '#123456') problems.push('« Valider » sans toucher aux réglages les a changés : ' + JSON.stringify(kept));
        // Texte vidé puis Valider : retiré.
        open();
        field().value = ''; field().dispatchEvent(new Event('input', { bubbles: true }));
        button('var-modal-primary').click();
        if (PageLayout.getWatermark() !== null) problems.push('un texte vidé n\'a pas retiré le filigrane : ' + JSON.stringify(PageLayout.getWatermark()));
        // Retirer.
        PageLayout.setWatermark({ text: 'A retirer' });
        open();
        button('var-modal-danger').click();
        if (PageLayout.getWatermark() !== null || modal().style.display !== 'none') problems.push('« Retirer le filigrane » : ' + JSON.stringify(PageLayout.getWatermark()));
        // Valider sans rien changer n'annonce ni ne marque rien.
        const events = [];
        const onEvent = () => events.push('changed');
        document.addEventListener('pp:watermarkChanged', onEvent);
        document.addEventListener('pp:marginsChanged', onEvent);
        open();
        button('var-modal-primary').click();
        document.removeEventListener('pp:watermarkChanged', onEvent);
        document.removeEventListener('pp:marginsChanged', onEvent);
        if (events.length) problems.push('Valider sans changement annonce ' + events.length + ' événement(s)');
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      } finally {
        const modal = document.getElementById('pp-watermark-modal');
        if (modal && modal.style.display !== 'none') { const b = modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)'); if (b) b.click(); }
        await h.clickButton('btn-new');
        await restore(h);
      }
    },
  });

  cases.push({
    id: 'wm_menu_row_follows_the_page_menu_rules_type_export_and_language',
    description: 'La ligne « Filigrane… » du menu Page : dernière ligne après un filet, montre le texte en cours à droite, grisée et inactive pour un type de modèle que le menu ne suit pas (email) et pendant un export, active pour un macro-modèle ; suit la langue ; sa touche Entrée ouvre la fenêtre',
    run: async (h) => {
      await setup(h);
      try {
        const problems = [];
        const row = () => document.getElementById('v2-btn-watermark');
        const menu = () => document.getElementById('v2-page-flyout');
        const modalOpen = () => { const m = document.getElementById('pp-watermark-modal'); return !!m && m.style.display !== 'none'; };
        const closeModal = () => { const m = document.getElementById('pp-watermark-modal'); if (m && m.style.display !== 'none') m.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click(); };
        const kids = Array.from(menu().children);
        if (kids[kids.length - 1] !== row() || !kids[kids.length - 2].classList.contains('v2-hover-hsep')) problems.push('« Filigrane… » n\'est pas la dernière ligne après un filet');
        if (row().getAttribute('role') !== 'menuitem' || row().tabIndex !== 0 || row().classList.contains('v2-hover-row-check')) problems.push('rôle ou tabulation de la ligne : ' + row().getAttribute('role') + ' / ' + row().tabIndex);
        const state = () => ({ name: row().querySelector('.v2-page-row-name').textContent, value: row().querySelector('.v2-page-row-size').textContent, aria: row().getAttribute('aria-disabled'), grey: row().classList.contains('v2-hover-row-disabled'), tab: row().tabIndex });
        const s0 = state();
        if (s0.name !== 'Filigrane…' || s0.value !== '' || s0.aria !== 'false' || s0.grey || s0.tab !== 0) problems.push('sans filigrane : ' + JSON.stringify(s0));
        PageLayout.setWatermark({ text: 'CONFIDENTIEL' });
        const s1 = state();
        if (s1.value !== 'CONFIDENTIEL') problems.push('avec filigrane, le texte en cours n\'est pas dit : ' + JSON.stringify(s1));
        // Un clic et la touche Entrée ouvrent la fenêtre (le focus reste où il était : mousedown ne le prend pas).
        row().click();
        if (!modalOpen()) problems.push('un clic sur la ligne n\'ouvre pas la fenêtre');
        closeModal();
        row().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        if (!modalOpen()) problems.push('Entrée sur la ligne n\'ouvre pas la fenêtre');
        closeModal();
        // Pendant un export : grisée, inactive.
        OrientationToggle.setBusy(true);
        const busy = state();
        row().click();
        if (!busy.grey || busy.aria !== 'true' || busy.tab !== -1 || modalOpen()) problems.push('pendant un export : ' + JSON.stringify(busy) + ', fenêtre ouverte ' + modalOpen());
        OrientationToggle.setBusy(false);
        // Un type que le menu ne suit pas (email) : grisée, inactive, avec le même titre que le reste du menu.
        OrientationToggle.sync('email');
        const email = state();
        row().click();
        const title = document.getElementById('v2-page-flyout-label').textContent;
        if (!email.grey || email.aria !== 'true' || email.tab !== -1 || modalOpen() || title !== 'Page (pas disponible pour ce modèle)') problems.push('modèle email : ' + JSON.stringify(email) + ', fenêtre ouverte ' + modalOpen() + ', titre « ' + title + ' »');
        // Un macro-modèle a sa page : la ligne est active.
        OrientationToggle.sync('macro');
        const macro = state();
        if (macro.grey || macro.aria !== 'false' || macro.tab !== 0) problems.push('macro-modèle : ' + JSON.stringify(macro));
        OrientationToggle.sync('document');
        // La langue : le nom suit, le texte du filigrane reste celui de la personne.
        I18n.setLang('en');
        await h.sleep(150);
        const en = state();
        I18n.setLang('fr');
        await h.sleep(150);
        if (en.name !== 'Watermark…' || en.value !== 'CONFIDENTIEL') problems.push('en anglais : ' + JSON.stringify(en));
        PageLayout.setWatermark(null);
        const s2 = state();
        if (s2.value !== '') problems.push('filigrane retiré : le texte reste dans le menu : ' + JSON.stringify(s2));
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      } finally {
        I18n.setLang('fr');
        OrientationToggle.setBusy(false);
        OrientationToggle.sync('document');
        const m = document.getElementById('pp-watermark-modal');
        if (m && m.style.display !== 'none') m.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
        await restore(h);
      }
    },
  });

  return cases;
})();
