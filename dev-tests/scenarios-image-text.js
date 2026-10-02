// Image « Au cœur du texte » et texte autour : mêmes positions dans l'éditeur, la Lecture, le PDF et le Word (Antoine, 02/10, point 9 : « la fiabilité entre l'affichage éditeur,
// lecture et pdf », « une batterie de tests exhaustive avec des prises de mesures »). « Au cœur du texte » est le calque `normal` de la barre de l'image (devant / derrière le texte
// sont l'autre sujet : groupes imageParity et pageLayer). Choix d'Antoine (carte du point 10) : « La rendre fidèle » : la bascule en ligne / bloc fait la même chose partout.
//
// Ce que chaque réglage veut dire (l'éditeur est la référence, charte UX/UI) :
//  - aucun alignement, « en ligne » : l'image est posée dans la ligne de texte, son pied sur la ligne de base ;
//  - aucun alignement, « bloc » : l'image est seule sur sa ligne, à gauche ; le texte d'avant finit sa ligne, celui d'après repart dessous ;
//  - centre : seule sur sa ligne, centrée ;
//  - gauche / droite : flottante, le texte (et celui des paragraphes suivants tant qu'elle les dépasse) l'habille.
// Les mesures sont celles du navigateur (éditeur, Lecture), de pdf.js sur les octets du PDF et du XML du Word, jamais une valeur écrite en dur dans un seul rendu.
//
// Famille « éditeur » (ce fichier, premier lot) : le texte d'un paragraphe où l'image est seule sur sa ligne garde son interligne avant et après elle (il se superposait à l'image), le
// paragraphe n'a pas de ligne en plus sous l'image, et le bouton « Basculer en ligne / bloc » de la barre de l'image est grisé quand il ne change rien.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.imageText = (function () {
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const r1 = v => Math.round(v * 10) / 10;
  const clone = o => JSON.parse(JSON.stringify(o));

  // Textes : de quoi faire plusieurs lignes à la largeur de la page A4. Seuls comptent les nombres et les positions mesurés, pas la police.
  const BEFORE = "Le texte qui entoure l'image doit se placer de la même façon dans l'éditeur, la Lecture,";
  const AFTER = "le PDF et le Word : à côté de l'image tant qu'elle est là, puis dessous, avec le même retrait et les mêmes lignes. Rien ne doit bouger d'un rendu à l'autre, ni la première ligne, ni la dernière, ni la marge qui sépare le texte de l'image.";
  const FOLLOW = "Un deuxième paragraphe suit le premier : si l'image est plus haute que le premier paragraphe, le texte de celui-ci continue à contourner l'image.";

  // PNG de la taille demandée (largeur et hauteur naturelles = celles qu'on lui donne, donc le ratio est exact).
  const pngCache = {};
  function png(w, h) {
    const key = w + 'x' + h;
    if (pngCache[key]) return pngCache[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#e53935'; g.fillRect(0, 0, w / 2, h / 2);
    g.fillStyle = '#43a047'; g.fillRect(w / 2, 0, w / 2, h / 2);
    g.fillStyle = '#1e88e5'; g.fillRect(0, h / 2, w / 2, h / 2);
    g.fillStyle = '#fdd835'; g.fillRect(w / 2, h / 2, w / 2, h / 2);
    return (pngCache[key] = c.toDataURL('image/png'));
  }
  function imgHtml(o) {
    o = Object.assign({ w: 160, h: 120, align: null, wrap: 'inline', layer: 'normal' }, o || {});
    const style = 'width: ' + o.w + 'px' + (o.layer === 'normal' ? '' : '; position: absolute; left: 100px; top: 100px; z-index: ' + (o.layer === 'front' ? 5 : -1));
    return '<img class="editor-image" src="' + png(o.w, o.h) + '" alt="" style="' + style + '" data-layer="' + o.layer + '" data-wrap="' + o.wrap + '"' + (o.align ? ' data-align="' + o.align + '"' : '') + '>';
  }
  // Où est l'image : seule dans son paragraphe, en tête, au milieu, en fin de texte.
  const PLACES = {
    alone: im => '<p>' + im + '</p>',
    start: im => '<p>' + im + AFTER + '</p>',
    mid: im => '<p>' + BEFORE + ' ' + im + ' ' + AFTER + '</p>',
    end: im => '<p>' + BEFORE + ' ' + AFTER + ' ' + im + '</p>',
  };
  // Un paragraphe repère d'une ligne en tête (donne la hauteur d'une ligne), le paragraphe de l'image, puis un paragraphe de suite.
  const docOf = (place, o) => '<p>Ligne repère.</p>' + PLACES[place](imgHtml(o)) + '<p>' + FOLLOW + '</p>';

  function zoomOf(el) {
    const sheet = el.closest ? el.closest('.v2-page-sheet, .reader-content') : null;
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  }
  async function setupEditor(h, html) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    Editor.setHeaderFooterData(clone(EMPTY_HF));
    Editor.setHTML(html);
    Editor.refreshLayout();
    await h.sleep(250);
  }

  // Les mots du texte de `root` regroupés en lignes (même haut à 3 px près, dans l'ordre de lecture), en pixels de mise en page (zoom de la feuille retiré). `top` / `bottom` : la boîte du texte.
  function linesOf(root, z) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const items = [];
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.nodeValue.trim() || n.parentElement.closest('.editor-image-view, .v2-hf-zone, .v2-pagination-overlay, .page-break-marker, .v2-page-band, .two-columns-mm-button, .two-columns-mm-popover')) continue;
      const re = /\S+/g; let m;
      while ((m = re.exec(n.nodeValue))) {
        const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        const r = rg.getBoundingClientRect();
        if (r.width) items.push({ w: m[0], left: r.left / z, right: r.right / z, top: r.top / z, bottom: r.bottom / z });
      }
    }
    const lines = [];
    items.forEach(it => {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - it.top) < 3 && it.left >= last.right - 1) { last.right = it.right; last.bottom = Math.max(last.bottom, it.bottom); last.words.push(it.w); }
      else lines.push({ top: it.top, bottom: it.bottom, left: it.left, right: it.right, words: [it.w] });
    });
    return lines;
  }

  // L'image seule sur sa ligne, dans l'éditeur : le texte au-dessus ou au-dessous, jamais à côté ni dessus ; le paragraphe fait la hauteur des lignes de texte plus celle de l'image
  // (aucune ligne en plus) ; l'image est calée à gauche (bloc) ou au centre du paragraphe.
  function checkOwnLine(place, align) {
    const tip = document.querySelector('#editor-container .tiptap');
    const z = zoomOf(tip);
    const paragraphs = Array.from(tip.querySelectorAll(':scope > p'));
    const lineH = paragraphs[0].getBoundingClientRect().height / z;
    const host = paragraphs[1];
    const hr = host.getBoundingClientRect();
    const ir = host.querySelector('img.editor-image').getBoundingClientRect();
    const I = { top: ir.top / z, bottom: ir.bottom / z, h: ir.height / z, left: ir.left / z, right: ir.right / z };
    const lines = linesOf(host, z);
    const above = lines.filter(l => l.bottom <= I.top + 0.5);
    const below = lines.filter(l => l.top >= I.bottom - 0.5);
    const hostH = hr.height / z;
    const wantH = lines.length * lineH + I.h;
    const hostL = hr.left / z, hostR = hr.right / z;
    const xOk = align === 'center' ? Math.abs((I.left + I.right) / 2 - (hostL + hostR) / 2) <= 1.5 : Math.abs(I.left - hostL) <= 1;
    const orderOk = place === 'alone' ? lines.length === 0
      : place === 'start' ? above.length === 0 && below.length > 0
      : place === 'end' ? below.length === 0 && above.length > 0
      : above.length > 0 && below.length > 0;
    const pass = above.length + below.length === lines.length && orderOk && Math.abs(hostH - wantH) <= 1.5 && xOk;
    return { pass, notes: JSON.stringify({ lignesAuDessus: above.length, lignesAuDessous: below.length, lignesTotal: lines.length, hauteurParagraphe: r1(hostH), attendue: r1(wantH), hauteurImage: r1(I.h), hauteurLigne: r1(lineH), xImage: r1(I.left), xParagraphe: r1(hostL), alignOk: xOk }) };
  }

  const cases = [];

  // --- Éditeur : l'image seule sur sa ligne (« bloc » sans alignement, ou centrée) ---
  [{ name: 'block', align: null, wrap: 'block' }, { name: 'center', align: 'center', wrap: 'inline' }].forEach(kind => {
    Object.keys(PLACES).forEach(place => {
      cases.push({
        id: 'imgtext_editor_' + kind.name + '_' + place,
        description: 'Éditeur : image ' + (kind.name === 'center' ? 'centrée' : 'en bloc') + ' ' + ({ alone: 'seule dans son paragraphe', start: 'en tête de paragraphe', mid: 'au milieu du texte', end: 'en fin de texte' })[place]
          + ' - le texte reste au-dessus et au-dessous, jamais sur l\'image ; le paragraphe fait la hauteur des lignes et de l\'image, sans ligne en plus',
        run: async (h) => {
          await setupEditor(h, docOf(place, { align: kind.align, wrap: kind.wrap }));
          return checkOwnLine(place, kind.align);
        },
      });
    });
  });

  // --- Barre de l'image : « Basculer en ligne / bloc » grisé quand il ne change rien, actif quand il y a du texte autour ---
  const wrapButton = () => document.querySelector('.v2-floating-toolbar button[data-action="wrap"]');
  async function select(h, html) {
    await setupEditor(h, html);
    const img = h.tiptap().querySelector('img.editor-image');
    await h.selectAtomNode(img);
    await h.sleep(80);
    return wrapButton();
  }
  const SENTENCE = id => '<p>Une phrase avec ' + id + ' au milieu.</p>';
  const TOGGLE_SITUATIONS = [
    { id: 'alone_inline', html: '<p>' + imgHtml() + '</p>', enabled: false, what: 'image seule dans son paragraphe' },
    { id: 'alone_block', html: '<p>' + imgHtml({ wrap: 'block' }) + '</p>', enabled: false, what: 'image en bloc seule dans son paragraphe' },
    { id: 'in_sentence', html: SENTENCE(imgHtml()), enabled: true, what: 'image dans une phrase' },
    { id: 'in_sentence_block', html: SENTENCE(imgHtml({ wrap: 'block' })), enabled: true, what: 'image en bloc dans une phrase' },
    { id: 'beside_other_image', html: '<p>' + imgHtml() + imgHtml({ w: 60, h: 40 }) + '</p>', enabled: true, what: 'image à côté d\'une autre image du flux' },
    { id: 'left', html: SENTENCE(imgHtml({ align: 'left' })), enabled: false, what: 'image alignée à gauche (elle flotte)' },
    { id: 'center', html: SENTENCE(imgHtml({ align: 'center' })), enabled: false, what: 'image centrée (toujours seule sur sa ligne)' },
    { id: 'right', html: SENTENCE(imgHtml({ align: 'right' })), enabled: false, what: 'image alignée à droite (elle flotte)' },
    { id: 'front', html: SENTENCE(imgHtml({ layer: 'front' })), enabled: false, what: 'image devant le texte' },
    { id: 'behind', html: SENTENCE(imgHtml({ layer: 'behind' })), enabled: false, what: 'image derrière le texte' },
  ];
  TOGGLE_SITUATIONS.forEach(s => {
    cases.push({
      id: 'imgtext_toolbar_wrap_' + (s.enabled ? 'enabled_' : 'greyed_') + s.id,
      description: 'Barre de l\'image : « Basculer en ligne / bloc » est ' + (s.enabled ? 'actif' : 'grisé (jamais retiré), avec une info-bulle qui dit pourquoi') + ' pour une ' + s.what,
      run: async (h) => {
        const btn = await select(h, s.html);
        if (!btn) return { pass: false, notes: 'bouton « Basculer en ligne / bloc » introuvable' };
        const greyed = btn.classList.contains('is-disabled');
        const aria = btn.getAttribute('aria-disabled');
        const want = s.enabled ? I18n.t('imgToolbar.inlineToggle') : I18n.t('imgToolbar.wrapNeedsText');
        const pass = greyed === !s.enabled && (s.enabled ? aria !== 'true' : aria === 'true') && btn.title === want && (getComputedStyle(btn).opacity !== '1') === !s.enabled;
        return { pass, notes: JSON.stringify({ grise: greyed, ariaDisabled: aria, titre: btn.title, titreAttendu: want, opacite: getComputedStyle(btn).opacity }) };
      },
    });
  });

  cases.push({
    id: 'imgtext_toolbar_wrap_greyed_click_changes_nothing',
    description: 'Barre de l\'image : un clic sur « Basculer en ligne / bloc » grisé ne change rien au document',
    run: async (h) => {
      const btn = await select(h, '<p>' + imgHtml() + '</p>');
      const before = Editor.getHTML();
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await h.sleep(80);
      const after = Editor.getHTML();
      return { pass: before === after && /data-wrap="inline"/.test(after), notes: JSON.stringify({ avant: before.slice(-120), apres: after.slice(-120) }) };
    },
  });

  cases.push({
    id: 'imgtext_toolbar_wrap_toggle_puts_the_image_on_its_own_line_and_back',
    description: 'Barre de l\'image : « Basculer en ligne / bloc » sur une image au milieu d\'une phrase la met seule sur sa ligne (texte au-dessus et au-dessous), le second clic la remet dans la ligne',
    run: async (h) => {
      const btn = await select(h, docOf('mid'));
      if (!btn || btn.classList.contains('is-disabled')) return { pass: false, notes: 'bouton absent ou grisé pour une image dans le texte' };
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(120);
      const block = /data-wrap="block"/.test(Editor.getHTML());
      const pressed = wrapButton().classList.contains('is-active');
      const own = checkOwnLine('mid', null);
      wrapButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(120);
      const back = /data-wrap="inline"/.test(Editor.getHTML());
      const tip = document.querySelector('#editor-container .tiptap');
      const z = zoomOf(tip);
      const host = tip.querySelectorAll(':scope > p')[1];
      const ir = host.querySelector('img.editor-image').getBoundingClientRect();
      const sharesALine = linesOf(host, z).some(l => l.top < ir.bottom / z - 0.5 && l.bottom > ir.top / z + 0.5);
      return { pass: block && pressed && own.pass && back && sharesALine, notes: JSON.stringify({ blocApresUnClic: block, boutonEnfonce: pressed, surSaLigne: own, retourEnLigne: back, texteSurLaLigneDeLImage: sharesALine }) };
    },
  });

  // === Famille « Lecture » (deuxième lot) : les mêmes images et les mêmes lignes de texte que dans l'éditeur ===
  // Toutes les façons de poser une image « au cœur du texte » : alignement x bascule x place dans le texte (32), tailles (9), contextes (8), fin de page (3). La même table sert à chaque rendu.
  const SHORT = "Un troisième paragraphe, pour finir, bien après l'image.";
  const LONG = BEFORE + ' ' + AFTER;
  const im = (align, wrap, w, h) => imgHtml({ w: w || 160, h: h || 120, align: align === 'none' ? null : align, wrap: wrap || 'inline' });
  const MATRIX = [];
  const add = (id, family, what, html) => MATRIX.push({ id, family, what, html });
  const ALIGN_NAME = { none: 'sans alignement', left: 'alignée à gauche', right: 'alignée à droite', center: 'centrée' };
  const WRAP_NAME = { inline: 'en ligne', block: 'en bloc' };
  const PLACE_NAME = { alone: 'seule dans son paragraphe', start: 'en tête de paragraphe', mid: 'au milieu du texte', end: 'en fin de texte' };
  ['none', 'left', 'right', 'center'].forEach(align => ['inline', 'block'].forEach(wrap => {
    const t = align + '_' + wrap, i = im(align, wrap);
    const what = place => 'image ' + ALIGN_NAME[align] + ', ' + WRAP_NAME[wrap] + ', ' + PLACE_NAME[place];
    add('alone_' + t, 'place', what('alone'), '<p>' + SHORT + '</p><p>' + i + '</p><p>' + LONG + '</p>');
    add('start_' + t, 'place', what('start'), '<p>' + i + LONG + '</p><p>' + FOLLOW + '</p>');
    add('mid_' + t, 'place', what('mid'), '<p>' + BEFORE + ' ' + i + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>');
    add('end_' + t, 'place', what('end'), '<p>' + LONG + ' ' + i + '</p><p>' + FOLLOW + '</p>');
  }));
  add('small_mid_none', 'size', 'icône de 20 px dans une phrase', '<p>' + BEFORE + ' ' + im('none', 'inline', 20, 20) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>');
  add('small_mid_left', 'size', 'icône de 20 px alignée à gauche dans une phrase', '<p>' + BEFORE + ' ' + im('left', 'inline', 20, 20) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>');
  add('tall_left', 'size', 'image haute (300 px) à gauche, plus haute que son paragraphe : le texte des paragraphes suivants la contourne', '<p>' + im('left', 'inline', 160, 300) + SHORT + '</p><p>' + FOLLOW + '</p><p>' + SHORT + '</p><p>' + FOLLOW + '</p>');
  add('tall_right', 'size', 'image haute (300 px) à droite, plus haute que son paragraphe', '<p>' + im('right', 'inline', 160, 300) + SHORT + '</p><p>' + FOLLOW + '</p><p>' + SHORT + '</p><p>' + FOLLOW + '</p>');
  add('full_none_start', 'size', 'image sans alignement de toute la largeur, en tête de paragraphe', '<p>' + im('none', 'inline', 718, 100) + LONG + '</p><p>' + FOLLOW + '</p>');
  add('full_left_start', 'size', 'image à gauche de toute la largeur, en tête de paragraphe', '<p>' + im('left', 'inline', 718, 100) + LONG + '</p><p>' + FOLLOW + '</p>');
  add('full_center_alone', 'size', 'image centrée de toute la largeur, seule dans son paragraphe', '<p>' + SHORT + '</p><p>' + im('center', 'inline', 718, 100) + '</p><p>' + LONG + '</p>');
  add('toowide_none_mid', 'size', 'image sans alignement plus large que la page (900 px), au milieu du texte', '<p>' + BEFORE + ' ' + im('none', 'inline', 900, 200) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>');
  add('toowide_left_start', 'size', 'image à gauche plus large que la page (900 px), en tête de paragraphe', '<p>' + im('left', 'inline', 900, 200) + LONG + '</p><p>' + FOLLOW + '</p>');
  add('cell_left', 'context', 'image à gauche dans une case de tableau', '<table><tbody><tr><td><p>' + im('left', 'inline', 100, 80) + LONG + '</p></td><td><p>' + FOLLOW + '</p></td></tr></tbody></table><p>' + SHORT + '</p>');
  add('cell_none_mid', 'context', 'image en ligne dans une phrase, dans une case de tableau', '<table><tbody><tr><td><p>' + BEFORE + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + '</p></td><td><p>' + FOLLOW + '</p></td></tr></tbody></table><p>' + SHORT + '</p>');
  const column = host => '<div class="two-columns-zone" style="--layout-left: 50%;"><div class="two-columns-column">' + host + '</div><div class="two-columns-column"><p>' + FOLLOW + '</p></div></div><p>' + SHORT + '</p>';
  add('column_left', 'context', 'image à gauche dans une colonne', column('<p>' + im('left', 'inline', 100, 80) + LONG + '</p>'));
  add('column_none_mid', 'context', 'image en ligne dans une phrase, dans une colonne', column('<p>' + BEFORE + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + '</p>'));
  add('list_left', 'context', 'image à gauche dans une liste', '<ul><li><p>' + im('left', 'inline', 100, 80) + LONG + '</p></li><li><p>' + FOLLOW + '</p></li></ul><p>' + SHORT + '</p>');
  add('heading_none', 'context', 'image en ligne dans un titre', '<h2>Un titre avec ' + im('none', 'inline', 40, 40) + ' au milieu</h2><p>' + FOLLOW + '</p>');
  add('heading_left', 'context', 'image à gauche dans un titre', '<h2>' + im('left', 'inline', 100, 80) + 'Un titre suivi de son image</h2><p>' + FOLLOW + '</p>');
  add('quote_left', 'context', 'image à gauche dans une citation', '<blockquote><p>' + im('left', 'inline', 100, 80) + LONG + '</p></blockquote><p>' + SHORT + '</p>');
  // Fin de page : 47 lignes de remplissage, puis l'image à cheval sur le saut de page.
  const FILL = Array.from({ length: 47 }, (_, i) => '<p>Ligne de remplissage numéro ' + (i + 1) + '.</p>').join('');
  add('page_left', 'page', 'image à gauche au bas de la page, à cheval sur le saut de page', FILL + '<p>' + im('left', 'inline', 160, 200) + LONG + '</p><p>' + FOLLOW + '</p>');
  add('page_none_mid', 'page', 'image en ligne au milieu du texte, au bas de la page', FILL + '<p>' + BEFORE + ' ' + im('none', 'inline', 160, 200) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>');
  add('page_center', 'page', 'image centrée seule au bas de la page', FILL + '<p>' + SHORT + '</p><p>' + im('center', 'inline', 160, 200) + '</p><p>' + FOLLOW + '</p>');

  // Ce que pose un rendu : le rectangle de chaque image et chaque ligne de texte, en pixels de mise en page (zoom de la feuille retiré), depuis le coin de son conteneur.
  function layoutOf(root) {
    const z = zoomOf(root);
    const o = root.getBoundingClientRect();
    const ox = o.left / z, oy = o.top / z;
    const imgs = Array.from(root.querySelectorAll('img.editor-image')).map(img => {
      const r = img.getBoundingClientRect();
      return { x: r.left / z - ox, y: r.top / z - oy, w: r.width / z, h: r.height / z };
    });
    const lines = linesOf(root, z).map(l => ({ x: l.left - ox, xr: l.right - ox, y: l.top - oy, text: l.words.join(' ') }));
    return { imgs, lines };
  }
  const PT = 0.75; // 1 px = 0,75 pt
  const TOLERANCE_PT = 0.6;
  const r2 = v => Math.round(v * 100) / 100;
  // Écart d'un rendu avec l'éditeur (la référence) : même nombre d'images et de lignes, mêmes mots sur chaque ligne, chaque position à `TOLERANCE_PT` près. Les écarts sont donnés en pt.
  function compareLayouts(ref, got) {
    const worstImg = { x: 0, y: 0, w: 0, h: 0 }, worstLine = { x: 0, xr: 0, y: 0 };
    const problems = [];
    if (ref.imgs.length !== got.imgs.length) problems.push({ images: { editeur: ref.imgs.length, rendu: got.imgs.length } });
    ref.imgs.forEach((a, i) => {
      const b = got.imgs[i];
      if (!b) return;
      ['x', 'y', 'w', 'h'].forEach(k => { const d = Math.abs(b[k] - a[k]) * PT; if (d > worstImg[k]) worstImg[k] = d; });
    });
    if (ref.lines.length !== got.lines.length) problems.push({ lignes: { editeur: ref.lines.length, rendu: got.lines.length } });
    ref.lines.forEach((a, i) => {
      const b = got.lines[i];
      if (!b) return;
      if (a.text !== b.text) { if (problems.length < 3) problems.push({ ligne: i, editeur: a.text.slice(0, 40), rendu: b.text.slice(0, 40) }); return; }
      ['x', 'xr', 'y'].forEach(k => { const d = Math.abs(b[k] - a[k]) * PT; if (d > worstLine[k]) { worstLine[k] = d; if (d > TOLERANCE_PT && problems.length < 3) problems.push({ ligne: i, texte: a.text.slice(0, 30), ecart: k, editeur: r2(a[k] * PT), rendu: r2(b[k] * PT) }); } });
    });
    const worst = Math.max(...Object.values(worstImg), ...Object.values(worstLine));
    return {
      pass: problems.length === 0 && worst <= TOLERANCE_PT,
      notes: JSON.stringify({ images: ref.imgs.length, lignes: ref.lines.length, pireEcartImage: { x: r2(worstImg.x), y: r2(worstImg.y), l: r2(worstImg.w), h: r2(worstImg.h) }, pireEcartLigne: { x: r2(worstLine.x), xr: r2(worstLine.xr), y: r2(worstLine.y) }, problemes: problems }),
    };
  }
  async function readerVersusEditor(h, html) {
    await setupEditor(h, html);
    const editor = layoutOf(h.tiptap());
    const reader = await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
    await h.sleep(250);
    return compareLayouts(editor, layoutOf(reader));
  }
  MATRIX.forEach(c => cases.push({
    id: 'imgtext_reader_' + c.id,
    description: 'Lecture : ' + c.what + ' - les images et chaque ligne de texte sont où l\'éditeur les met (mêmes mots par ligne, écart de position ≤ ' + TOLERANCE_PT + ' pt)',
    run: async (h) => readerVersusEditor(h, c.html),
  }));

  return cases;
})();
