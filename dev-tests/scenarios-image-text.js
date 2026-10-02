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
        if (r.width) items.push({ w: m[0], left: r.left / z, right: r.right / z, top: r.top / z, bottom: r.bottom / z, font: (parseFloat(getComputedStyle(n.parentElement).fontSize) || 0) / z });
      }
    }
    const lines = [];
    items.forEach(it => {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - it.top) < 3 && it.left >= last.right - 1) { last.right = it.right; last.bottom = Math.max(last.bottom, it.bottom); last.words.push(it.w); last.font = Math.max(last.font, it.font); }
      else lines.push({ top: it.top, bottom: it.bottom, left: it.left, right: it.right, words: [it.w], font: it.font });
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
  // `meta` : ce que le cas pose, pour les rendus qui se lisent sur la structure du fichier (Word) : l'alignement et la bascule de l'image, sa place, le texte d'avant et d'après l'image dans son paragraphe HTML
  // (`pre`, `post`), le paragraphe qui précède (`prev`) et celui qui suit (`next`) le paragraphe de l'image, et `container` (case de tableau, colonne, liste, titre, citation).
  const add = (id, family, what, html, meta) => MATRIX.push({ id, family, what, html, meta: meta || null });
  const ALIGN_NAME = { none: 'sans alignement', left: 'alignée à gauche', right: 'alignée à droite', center: 'centrée' };
  const WRAP_NAME = { inline: 'en ligne', block: 'en bloc' };
  const PLACE_NAME = { alone: 'seule dans son paragraphe', start: 'en tête de paragraphe', mid: 'au milieu du texte', end: 'en fin de texte' };
  ['none', 'left', 'right', 'center'].forEach(align => ['inline', 'block'].forEach(wrap => {
    const t = align + '_' + wrap, i = im(align, wrap);
    const what = place => 'image ' + ALIGN_NAME[align] + ', ' + WRAP_NAME[wrap] + ', ' + PLACE_NAME[place];
    add('alone_' + t, 'place', what('alone'), '<p>' + SHORT + '</p><p>' + i + '</p><p>' + LONG + '</p>', { align, wrap, place: 'alone', pre: '', post: '', prev: SHORT, next: LONG });
    add('start_' + t, 'place', what('start'), '<p>' + i + LONG + '</p><p>' + FOLLOW + '</p>', { align, wrap, place: 'start', pre: '', post: LONG, prev: null, next: FOLLOW });
    add('mid_' + t, 'place', what('mid'), '<p>' + BEFORE + ' ' + i + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>', { align, wrap, place: 'mid', pre: BEFORE, post: AFTER, prev: null, next: FOLLOW });
    add('end_' + t, 'place', what('end'), '<p>' + LONG + ' ' + i + '</p><p>' + FOLLOW + '</p>', { align, wrap, place: 'end', pre: LONG, post: '', prev: null, next: FOLLOW });
  }));
  add('small_mid_none', 'size', 'icône de 20 px dans une phrase', '<p>' + BEFORE + ' ' + im('none', 'inline', 20, 20) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>', { align: 'none', wrap: 'inline', place: 'mid', pre: BEFORE, post: AFTER, prev: null, next: FOLLOW });
  add('small_mid_left', 'size', 'icône de 20 px alignée à gauche dans une phrase', '<p>' + BEFORE + ' ' + im('left', 'inline', 20, 20) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>', { align: 'left', wrap: 'inline', place: 'mid', pre: BEFORE, post: AFTER, prev: null, next: FOLLOW });
  add('tall_left', 'size', 'image haute (300 px) à gauche, plus haute que son paragraphe : le texte des paragraphes suivants la contourne', '<p>' + im('left', 'inline', 160, 300) + SHORT + '</p><p>' + FOLLOW + '</p><p>' + SHORT + '</p><p>' + FOLLOW + '</p>', { align: 'left', wrap: 'inline', place: 'start', pre: '', post: SHORT, prev: null, next: FOLLOW });
  add('tall_right', 'size', 'image haute (300 px) à droite, plus haute que son paragraphe', '<p>' + im('right', 'inline', 160, 300) + SHORT + '</p><p>' + FOLLOW + '</p><p>' + SHORT + '</p><p>' + FOLLOW + '</p>', { align: 'right', wrap: 'inline', place: 'start', pre: '', post: SHORT, prev: null, next: FOLLOW });
  add('full_none_start', 'size', 'image sans alignement de toute la largeur, en tête de paragraphe', '<p>' + im('none', 'inline', 718, 100) + LONG + '</p><p>' + FOLLOW + '</p>', { align: 'none', wrap: 'inline', place: 'start', pre: '', post: LONG, prev: null, next: FOLLOW });
  add('full_left_start', 'size', 'image à gauche de toute la largeur, en tête de paragraphe', '<p>' + im('left', 'inline', 718, 100) + LONG + '</p><p>' + FOLLOW + '</p>', { align: 'left', wrap: 'inline', place: 'start', pre: '', post: LONG, prev: null, next: FOLLOW });
  add('full_center_alone', 'size', 'image centrée de toute la largeur, seule dans son paragraphe', '<p>' + SHORT + '</p><p>' + im('center', 'inline', 718, 100) + '</p><p>' + LONG + '</p>', { align: 'center', wrap: 'inline', place: 'alone', pre: '', post: '', prev: SHORT, next: LONG });
  add('toowide_none_mid', 'size', 'image sans alignement plus large que la page (900 px), au milieu du texte', '<p>' + BEFORE + ' ' + im('none', 'inline', 900, 200) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>', { align: 'none', wrap: 'inline', place: 'mid', pre: BEFORE, post: AFTER, prev: null, next: FOLLOW });
  add('toowide_left_start', 'size', 'image à gauche plus large que la page (900 px), en tête de paragraphe', '<p>' + im('left', 'inline', 900, 200) + LONG + '</p><p>' + FOLLOW + '</p>', { align: 'left', wrap: 'inline', place: 'start', pre: '', post: LONG, prev: null, next: FOLLOW });
  add('cell_left', 'context', 'image à gauche dans une case de tableau', '<table><tbody><tr><td><p>' + im('left', 'inline', 100, 80) + LONG + '</p></td><td><p>' + FOLLOW + '</p></td></tr></tbody></table><p>' + SHORT + '</p>', { align: 'left', wrap: 'inline', place: 'start', pre: '', post: LONG, prev: null, next: null, container: 'cell' });
  add('cell_none_mid', 'context', 'image en ligne dans une phrase, dans une case de tableau', '<table><tbody><tr><td><p>' + BEFORE + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + '</p></td><td><p>' + FOLLOW + '</p></td></tr></tbody></table><p>' + SHORT + '</p>', { align: 'none', wrap: 'inline', place: 'mid', pre: BEFORE, post: AFTER, prev: null, next: null, container: 'cell' });
  const column = host => '<div class="two-columns-zone" style="--layout-left: 50%;"><div class="two-columns-column">' + host + '</div><div class="two-columns-column"><p>' + FOLLOW + '</p></div></div><p>' + SHORT + '</p>';
  add('column_left', 'context', 'image à gauche dans une colonne', column('<p>' + im('left', 'inline', 100, 80) + LONG + '</p>'), { align: 'left', wrap: 'inline', place: 'start', pre: '', post: LONG, prev: null, next: null, container: 'column' });
  add('column_none_mid', 'context', 'image en ligne dans une phrase, dans une colonne', column('<p>' + BEFORE + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + '</p>'), { align: 'none', wrap: 'inline', place: 'mid', pre: BEFORE, post: AFTER, prev: null, next: null, container: 'column' });
  add('list_left', 'context', 'image à gauche dans une liste', '<ul><li><p>' + im('left', 'inline', 100, 80) + LONG + '</p></li><li><p>' + FOLLOW + '</p></li></ul><p>' + SHORT + '</p>', { align: 'left', wrap: 'inline', place: 'start', pre: '', post: LONG, prev: null, next: null, container: 'list' });
  add('heading_none', 'context', 'image en ligne dans un titre', '<h2>Un titre avec ' + im('none', 'inline', 40, 40) + ' au milieu</h2><p>' + FOLLOW + '</p>', { align: 'none', wrap: 'inline', place: 'mid', pre: 'Un titre avec', post: 'au milieu', prev: null, next: FOLLOW, container: 'heading' });
  add('heading_left', 'context', 'image à gauche dans un titre', '<h2>' + im('left', 'inline', 100, 80) + 'Un titre suivi de son image</h2><p>' + FOLLOW + '</p>', { align: 'left', wrap: 'inline', place: 'start', pre: '', post: 'Un titre suivi de son image', prev: null, next: FOLLOW, container: 'heading' });
  add('quote_left', 'context', 'image à gauche dans une citation', '<blockquote><p>' + im('left', 'inline', 100, 80) + LONG + '</p></blockquote><p>' + SHORT + '</p>', { align: 'left', wrap: 'inline', place: 'start', pre: '', post: LONG, prev: null, next: SHORT, container: 'quote' });
  // Fin de page : 47 lignes de remplissage, puis l'image à cheval sur le saut de page.
  const fill = n => Array.from({ length: n }, (_, i) => '<p>Ligne de remplissage numéro ' + (i + 1) + '.</p>').join('');
  const FILL = fill(47);
  add('page_left', 'page', 'image à gauche au bas de la page, à cheval sur le saut de page', FILL + '<p>' + im('left', 'inline', 160, 200) + LONG + '</p><p>' + FOLLOW + '</p>', { align: 'left', wrap: 'inline', place: 'start', pre: '', post: LONG, prev: null, next: FOLLOW });
  add('page_none_mid', 'page', 'image en ligne au milieu du texte, au bas de la page', FILL + '<p>' + BEFORE + ' ' + im('none', 'inline', 160, 200) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>', { align: 'none', wrap: 'inline', place: 'mid', pre: BEFORE, post: AFTER, prev: null, next: FOLLOW });
  add('page_center', 'page', 'image centrée seule au bas de la page', FILL + '<p>' + SHORT + '</p><p>' + im('center', 'inline', 160, 200) + '</p><p>' + FOLLOW + '</p>', { align: 'center', wrap: 'inline', place: 'alone', pre: '', post: '', prev: SHORT, next: FOLLOW });

  // Ce que pose un rendu : le rectangle de chaque image et chaque ligne de texte, en pixels de mise en page (zoom de la feuille retiré), depuis le coin de son conteneur.
  function layoutOf(root) {
    const z = zoomOf(root);
    const o = root.getBoundingClientRect();
    const ox = o.left / z, oy = o.top / z;
    const imgs = Array.from(root.querySelectorAll('img.editor-image')).map(img => {
      const r = img.getBoundingClientRect();
      return { x: r.left / z - ox, y: r.top / z - oy, w: r.width / z, h: r.height / z };
    });
    const lines = linesOf(root, z).map(l => ({ x: l.left - ox, xr: l.right - ox, y: l.top - oy, text: l.words.join(' '), font: l.font }));
    return { imgs, lines };
  }
  const PT = 0.75; // 1 px = 0,75 pt
  const TOLERANCE_PT = 0.6;
  const r2 = v => Math.round(v * 100) / 100;
  // Écart d'un rendu avec l'éditeur (la référence) : même nombre d'images et de lignes, mêmes mots sur chaque ligne, chaque position à `TOLERANCE_PT` près. Les écarts sont donnés en pt.
  // `tol` : { x, y } en pt, 0,6 pour chacun par défaut ; x vaut pour les bords gauche et droit des lignes et des images.
  function compareLayouts(ref, got, tol) {
    const tolX = (tol && tol.x) || TOLERANCE_PT, tolY = (tol && tol.y) || TOLERANCE_PT;
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
      ['x', 'xr', 'y'].forEach(k => { const d = Math.abs(b[k] - a[k]) * PT; if (d > worstLine[k]) { worstLine[k] = d; if (d > (k === 'y' ? tolY : tolX) && problems.length < 3) problems.push({ ligne: i, texte: a.text.slice(0, 30), ecart: k, editeur: r2(a[k] * PT), rendu: r2(b[k] * PT) }); } });
    });
    const over = (w, k) => w > (k === 'y' || k === 'h' ? tolY : tolX);
    const tooFar = Object.keys(worstImg).some(k => over(worstImg[k], k)) || Object.keys(worstLine).some(k => over(worstLine[k], k));
    return {
      pass: problems.length === 0 && !tooFar,
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

  // === Famille « Word » (troisième lot) : la structure du fichier .docx, cas par cas ===
  // Le Word se lit ici sur son XML : où est l'image (dans la ligne ou ancrée), dans quel paragraphe, avec quel alignement, quelle marge d'habillage, quel texte avant et après, quelle taille. Où Word pose
  // ensuite chaque ligne, il le recalcule : cette géométrie-là se mesure dans un rendu LibreOffice, hors dépôt (banc `banc/`, `runmatrix.py`).
  const EMU_PER_PT = 12700;
  const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
  // Chaque <w:p> du fichier, dans l'ordre : son alignement, son texte, et ses morceaux dans l'ordre (texte, image dans la ligne, image ancrée avec son habillage).
  function wordParagraphs(doc) {
    const inCell = el => { for (let n = el.parentNode; n; n = n.parentNode) if (n.nodeName === 'w:tc') return true; return false; };
    return Array.from(doc.getElementsByTagName('w:p')).map(p => {
      const jc = p.getElementsByTagName('w:jc')[0];
      const segs = [];
      const walker = doc.createTreeWalker(p, NodeFilter.SHOW_ELEMENT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeName === 'w:t') segs.push({ text: n.textContent });
        else if (n.nodeName === 'w:drawing') {
          const anchor = n.getElementsByTagName('wp:anchor')[0];
          const box = anchor || n.getElementsByTagName('wp:inline')[0];
          const extent = box && box.getElementsByTagName('wp:extent')[0];
          const square = anchor && anchor.getElementsByTagName('wp:wrapSquare')[0];
          const posH = anchor && anchor.getElementsByTagName('wp:positionH')[0];
          const align = posH && posH.getElementsByTagName('wp:align')[0];
          const dist = name => (anchor ? Number(anchor.getAttribute(name)) : null);
          segs.push({
            drawing: anchor ? 'anchor' : 'inline', w: extent ? Number(extent.getAttribute('cx')) / EMU_PER_PT : null, h: extent ? Number(extent.getAttribute('cy')) / EMU_PER_PT : null,
            wrapSide: square ? square.getAttribute('wrapText') : null, alignH: align ? align.textContent : null, relativeH: posH ? posH.getAttribute('relativeFrom') : null,
            distL: dist('distL'), distR: dist('distR'), distT: dist('distT'), distB: dist('distB'),
            squareDistL: square ? Number(square.getAttribute('distL')) : null, squareDistR: square ? Number(square.getAttribute('distR')) : null, squareDistB: square ? Number(square.getAttribute('distB')) : null,
          });
        }
      }
      return { jc: jc ? jc.getAttribute('w:val') : null, inCell: inCell(p), segs, text: segs.map(sg => sg.text || '').join('') };
    });
  }
  async function wordVersusEditor(h, html) {
    await setupEditor(h, html);
    const editor = layoutOf(h.tiptap());
    const exported = await h.exportDocxParts(Editor.getHTML(), Editor.getHeaderFooterData());
    return { editor, paragraphs: wordParagraphs(exported.doc).filter(p => p.text.trim() || p.segs.some(sg => sg.drawing)) };
  }
  const WRAP_TEXT_SIDE_EMU = 9 * EMU_PER_PT; // 12 px côté texte
  const WRAP_BELOW_EMU = 6 * EMU_PER_PT;     // 8 px dessous
  // Ce que le fichier doit dire pour un cas : l'image seule, une seule, au bon endroit, de la taille de l'éditeur.
  function checkWord(m, found) {
    const ps = found.paragraphs;
    const hosts = ps.filter(p => p.segs.some(sg => sg.drawing));
    if (hosts.length !== 1) return { pass: false, notes: JSON.stringify({ paragraphesAvecImage: hosts.length, attendu: 1 }) };
    const host = hosts[0], hi = ps.indexOf(host);
    const k = host.segs.findIndex(sg => sg.drawing);
    const d = host.segs[k];
    const before = norm(host.segs.slice(0, k).map(sg => sg.text || '').join(''));
    const after = norm(host.segs.slice(k + 1).map(sg => sg.text || '').join(''));
    const own = m.align === 'center' ? 'center' : (m.align === 'none' && m.wrap === 'block') ? 'left' : null;
    const isFloat = m.align === 'left' || m.align === 'right';
    const problems = [];
    const expect = (what, ok, got, wanted) => { if (!ok) problems.push({ [what]: got, attendu: wanted }); };
    const prevText = hi > 0 ? norm(ps[hi - 1].text) : null, nextText = hi < ps.length - 1 ? norm(ps[hi + 1].text) : null;
    if (own) {
      expect('image', d.drawing === 'inline', d.drawing, 'inline (dans son propre paragraphe)');
      expect('texteAvantDansLeParagrapheDeLImage', before === '', before.slice(0, 30), '');
      expect('texteApresDansLeParagrapheDeLImage', after === '', after.slice(0, 30), '');
      // À gauche : l'alignement par défaut du paragraphe suffit (rien à dire) ; le cas d'un paragraphe centré qui porte une image en bloc a son scénario.
      expect('alignement', host.jc === own || (own === 'left' && host.jc === null), host.jc, own);
      const wantPrev = m.pre ? norm(m.pre) : (m.prev ? norm(m.prev) : null), wantNext = m.post ? norm(m.post) : (m.next ? norm(m.next) : null);
      if (wantPrev !== null) expect('paragrapheAvant', prevText === wantPrev, (prevText || '').slice(0, 30), wantPrev.slice(0, 30));
      if (wantNext !== null) expect('paragrapheApres', nextText === wantNext, (nextText || '').slice(0, 30), wantNext.slice(0, 30));
    } else if (isFloat) {
      expect('image', d.drawing === 'anchor', d.drawing, 'anchor (habillage)');
      expect('cote du texte', d.wrapSide === (m.align === 'left' ? 'right' : 'left'), d.wrapSide, m.align === 'left' ? 'right' : 'left');
      expect('bordDeLImage', d.alignH === m.align && d.relativeH === 'margin', d.alignH + '/' + d.relativeH, m.align + '/margin');
      const textSide = m.align === 'left' ? 'distR' : 'distL', otherSide = m.align === 'left' ? 'distL' : 'distR';
      expect('margeCoteTexte', d[textSide] === WRAP_TEXT_SIDE_EMU && d['squareD' + textSide.slice(1)] === WRAP_TEXT_SIDE_EMU, d[textSide], WRAP_TEXT_SIDE_EMU);
      expect('margeDessous', d.distB === WRAP_BELOW_EMU && d.squareDistB === WRAP_BELOW_EMU, d.distB, WRAP_BELOW_EMU);
      expect('margeCoteOppose', d[otherSide] === 0, d[otherSide], 0);
      expect('texteAvantDansLeParagrapheDeLImage', before === '', before.slice(0, 30), '');
      expect('texteApresDansLeParagrapheDeLImage', after === norm(m.post), after.slice(0, 30), norm(m.post).slice(0, 30));
      const wantPrev = m.pre ? norm(m.pre) : (m.prev ? norm(m.prev) : null);
      if (wantPrev !== null) expect('paragrapheAvant', prevText === wantPrev, (prevText || '').slice(0, 30), wantPrev.slice(0, 30));
      if (m.next) expect('paragrapheApres', nextText === norm(m.next), (nextText || '').slice(0, 30), norm(m.next).slice(0, 30));
    } else {
      expect('image', d.drawing === 'inline', d.drawing, 'inline (dans la ligne)');
      expect('texteAvant', before === norm(m.pre), before.slice(0, 30), norm(m.pre).slice(0, 30));
      expect('texteApres', after === norm(m.post), after.slice(0, 30), norm(m.post).slice(0, 30));
      if (m.place === 'alone') {
        if (m.prev) expect('paragrapheAvant', prevText === norm(m.prev), (prevText || '').slice(0, 30), norm(m.prev).slice(0, 30));
        if (m.next) expect('paragrapheApres', nextText === norm(m.next), (nextText || '').slice(0, 30), norm(m.next).slice(0, 30));
      }
    }
    if (m.container === 'cell' || m.container === 'column') expect('dansUneCase', host.inCell === true, host.inCell, true);
    const ed = found.editor.imgs[0];
    const dw = Math.abs(d.w - ed.w * PT), dh = Math.abs(d.h - ed.h * PT);
    expect('tailleDeLImage', dw <= TOLERANCE_PT && dh <= TOLERANCE_PT, { l: r2(d.w), h: r2(d.h) }, { l: r2(ed.w * PT), h: r2(ed.h * PT) });
    return { pass: problems.length === 0, notes: JSON.stringify({ image: d.drawing, alignement: host.jc, avant: before.slice(0, 24), apres: after.slice(0, 24), paragrapheAvant: (prevText || '').slice(0, 24), paragrapheApres: (nextText || '').slice(0, 24), problemes: problems }) };
  }
  MATRIX.forEach(c => cases.push({
    id: 'imgtext_docx_' + c.id,
    description: 'Word : ' + c.what + ' - dans le fichier, l\'image est où l\'éditeur la met (dans la ligne, seule dans son paragraphe aligné, ou ancrée avec habillage et marges de 9 pt et 6 pt), avec le texte avant et après, à la taille de l\'éditeur',
    run: async (h) => checkWord(c.meta, await wordVersusEditor(h, c.html)),
  }));
  cases.push({
    id: 'imgtext_docx_block_in_a_centered_paragraph_stays_on_the_left',
    description: 'Word : une image en bloc dans un paragraphe centré reste à gauche, seule sur sa ligne (un bloc ne suit pas le text-align de son paragraphe), comme dans l\'éditeur ; le texte autour reste centré',
    run: async (h) => {
      const found = await wordVersusEditor(h, '<p style="text-align: center">' + BEFORE + ' ' + imgHtml({ wrap: 'block' }) + ' ' + AFTER + '</p>');
      const ps = found.paragraphs;
      const hi = ps.findIndex(p => p.segs.some(sg => sg.drawing));
      const tip = document.querySelector('#editor-container .tiptap');
      const editorLeft = Math.abs(found.editor.imgs[0].x - (tip.querySelector('p').getBoundingClientRect().left / zoomOf(tip) - tip.getBoundingClientRect().left / zoomOf(tip))) <= 1;
      const pass = ps.length === 3 && hi === 1 && ps[1].jc === 'left' && ps[0].jc === 'center' && ps[2].jc === 'center' && editorLeft;
      return { pass, notes: JSON.stringify({ paragraphes: ps.map(p => ({ jc: p.jc, image: p.segs.some(sg => sg.drawing), texte: p.text.slice(0, 20) })), imageAGaucheDansLEditeur: editorLeft }) };
    },
  });

  const PDF_NOT_YET = ['list_left', 'quote_left'];
  // === Famille « PDF » (quatrième lot) : ce que pdf.js lit dans le fichier, cas par cas ===
  // Le PDF se lit sur ce qui y est peint (pdf.js, h.extractPdfGroundTruth) : chaque image (rectangle) et chaque ligne de texte (bord gauche, bord droit, ligne de base), en pt depuis le coin de la page, comme
  // l'éditeur (la référence) depuis le coin de sa feuille. pdf.js donne la ligne de base du texte, l'éditeur le haut de sa boîte : l'écart entre les deux est celui d'un paragraphe seul, mesuré une fois.
  let pdfBaselineOffsetPt = null, pdfBaselineFontPx = 0;
  async function pdfOf(h) {
    const res = await h.exportPdfContent(Editor.getHTML(), Editor.getHeaderFooterData(), PageLayout.getMarginsPt());
    return h.extractPdfGroundTruth(res.base64);
  }
  // Les lignes d'une page du PDF : les morceaux de texte qui partagent une ligne de base (à 2 pt près), de gauche à droite. Le texte sans ses espaces : où un morceau s'arrête et où le suivant commence
  // n'est pas ce qu'on compare ici.
  function pdfLinesOf(page) {
    const items = page.textItems.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    items.forEach(it => {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) < 2) last.items.push(it); else lines.push({ y: it.y, items: [it] });
    });
    // Deux colonnes, deux cases de tableau : un vide de plus de 8 pt sépare deux lignes, sauf si une image les sépare (la ligne qui porte une image).
    const separated = [];
    lines.forEach(l => {
      const its = l.items.sort((a, b) => a.x - b.x);
      let group = [its[0]];
      its.slice(1).forEach(it => {
        const prev = group[group.length - 1], end = prev.x + prev.width;
        const imageBetween = page.images.some(im => im.x >= end - 1 && im.x + im.width <= it.x + 1 && l.y >= im.y - 4 && l.y <= im.y + im.height + 4);
        if (it.x - end > 8 && !imageBetween) { separated.push({ y: l.y, items: group }); group = [it]; } else group.push(it);
      });
      separated.push({ y: l.y, items: group });
    });
    lines.length = 0;
    separated.forEach(l => lines.push(l));
    return lines.map(l => {
      const its = l.items.sort((a, b) => a.x - b.x), end = its[its.length - 1];
      return { x: its[0].x, xr: end.x + end.width, y: l.y, text: its.map(i => i.str).join('').replace(/\s+/g, '') };
    });
  }
  // `opts.ignoreText` : le texte d'une case voisine, que le PDF place selon sa propre répartition des colonnes de tableau (écart de largeur de colonne propre au tableau, avec ou sans image) : ses lignes ne sont pas comparées.
  // `opts.dropIcon` : l'icône d'un encadré est une image du PDF (15 pt), pas une image du texte : elle n'est pas comparée. `opts.xTolerancePt` : l'écart permis sur les x quand le PDF ne reprend pas la largeur de la case (une case de
  // tableau y est plus étroite d'une espace et demie, cf. tableFrom : un texte centré s'en décale de 2 pt, un texte justifié s'arrête 6 pt avant) ; les y gardent 0,6 pt.
  async function pdfVersusEditor(h, html, opts) {
    const { ignoreText = null, dropIcon = false, xTolerancePt = null } = opts || {};
    if (pdfBaselineOffsetPt === null) {
      await setupEditor(h, '<p>Étalon</p>');
      const etalon = layoutOf(h.tiptap()).lines[0], ground = await pdfOf(h);
      pdfBaselineOffsetPt = pdfLinesOf(ground.pages[0])[0].y - etalon.y * PT;
      pdfBaselineFontPx = etalon.font;
    }
    await setupEditor(h, html);
    const editor = layoutOf(h.tiptap());
    editor.lines.forEach(l => { l.text = l.text.replace(/\s+/g, ''); });
    const page = (await pdfOf(h)).pages[0];
    const ignored = ignoreText ? ignoreText.replace(/\s+/g, '') : null;
    if (ignored) editor.lines = editor.lines.filter(l => !ignored.includes(l.text));
    // Dans l'espace de l'éditeur (pixels de mise en page), pour la même comparaison que la Lecture.
    const got = {
      imgs: page.images.filter(i => !(dropIcon && i.width < 20)).map(i => ({ x: i.x / PT, y: i.y / PT, w: i.width / PT, h: i.height / PT })),
      lines: pdfLinesOf(page).map(l => ({ x: l.x / PT, xr: l.xr / PT, y: l.y / PT, text: l.text })),
    };
    // L'éditeur range les lignes dans l'ordre du document (une colonne après l'autre), le PDF par hauteur : mêmes lignes, rangées dans l'ordre de l'éditeur (une ligne que l'éditeur n'a pas reste à la fin).
    // La ligne de base de pdf.js est ramenée au haut du texte par l'écart d'une ligne seule, proportionnel au corps de la ligne (un titre n'a pas celui d'un paragraphe).
    const taken = new Set();
    const rank = l => { const i = editor.lines.findIndex((e, k) => !taken.has(k) && e.text === l.text); if (i === -1) return Infinity; taken.add(i); return i; };
    got.lines = got.lines.filter(l => !(ignored && ignored.includes(l.text))).map(l => ({ l, r: rank(l) })).sort((a, b) => a.r - b.r)
      .map(o => Object.assign(o.l, { y: o.l.y - (pdfBaselineOffsetPt / PT) * ((editor.lines[o.r] && editor.lines[o.r].font) || pdfBaselineFontPx) / pdfBaselineFontPx }));
    return compareLayouts(editor, got, xTolerancePt ? { x: xTolerancePt } : null);
  }
  MATRIX.filter(c => c.family !== 'page' && !(PDF_NOT_YET || []).includes(c.id)).forEach(c => cases.push({
    id: 'imgtext_pdf_' + c.id,
    description: 'PDF : ' + c.what + ' - les images et chaque ligne de texte sont où l\'éditeur les met (mêmes mots par ligne, écart de position ≤ ' + TOLERANCE_PT + ' pt)',
    run: async (h) => pdfVersusEditor(h, c.html, c.meta && c.meta.container === 'cell' ? { ignoreText: FOLLOW, xTolerancePt: 1 } : {}),
  }));
  // Autres contextes de la case de tableau et de l'encadré, que seul le PDF doit démêler : l'image en bloc ou centrée, le texte justifié ou centré autour d'une image dans la ligne.
  const cellOf = (td, p) => '<table><tbody><tr>' + td + p + '</td><td><p>' + FOLLOW + '</p></td></tr></tbody></table><p>' + SHORT + '</p>';
  [
    { id: 'cell_center_alone', what: 'image centrée seule dans son paragraphe, dans une case de tableau', html: cellOf('<td>', '<p>' + SHORT + '</p><p>' + im('center', 'inline', 100, 60) + '</p><p>' + LONG + '</p>'), opts: { ignoreText: FOLLOW, xTolerancePt: 1 } },
    { id: 'cell_block_mid', what: 'image en bloc au milieu du texte, dans une case de tableau', html: cellOf('<td>', '<p>' + BEFORE + ' ' + im('none', 'block', 100, 60) + ' ' + AFTER + '</p>'), opts: { ignoreText: FOLLOW } },
    { id: 'cell_justified_mid', what: 'image en ligne dans un paragraphe justifié, dans une case de tableau', html: cellOf('<td>', '<p style="text-align: justify">' + BEFORE + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + '</p>'), opts: { ignoreText: FOLLOW, xTolerancePt: 6.5 } },
    { id: 'cell_centered_mid', what: 'image en ligne dans un texte centré, dans une case de tableau', html: cellOf('<td style="text-align: center">', '<p>' + BEFORE + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + '</p>'), opts: { ignoreText: FOLLOW, xTolerancePt: 2.5 } },
    { id: 'justified_mid_none', what: 'image en ligne au milieu d\'un paragraphe justifié (chaque ligne étirée à la largeur de l\'éditeur)', html: '<p style="text-align: justify">' + BEFORE + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>' },
    { id: 'justified_left_start', what: 'image à gauche en tête d\'un paragraphe justifié (le texte à côté, étiré à la largeur qui reste)', html: '<p style="text-align: justify">' + im('left', 'inline', 160, 120) + LONG + '</p><p>' + FOLLOW + '</p>' },
    { id: 'centered_mid_none', what: 'image en ligne au milieu d\'un paragraphe centré', html: '<p style="text-align: center">' + BEFORE + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>' },
    { id: 'right_aligned_mid_none', what: 'image en ligne au milieu d\'un paragraphe aligné à droite', html: '<p style="text-align: right">' + BEFORE + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>' },
    { id: 'callout_none_mid', what: 'image en ligne au milieu du texte, dans un encadré', html: '<div class="callout" data-color="blue" data-icon="info"><p>' + BEFORE + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + '</p></div><p>' + SHORT + '</p>', opts: { dropIcon: true } },
    { id: 'heading_right', what: 'image à droite en tête d\'un titre (le texte du titre à côté d\'elle)', html: '<h2>' + im('right', 'inline', 100, 80) + 'Un titre suivi de son image à droite, assez long pour passer sur deux lignes</h2><p>' + FOLLOW + '</p>' },
    { id: 'heading_after_float', what: 'titre sous une image à gauche plus haute que son paragraphe (le titre se range à côté d\'elle, puis reprend toute la largeur)', html: '<p>Ligne repère.</p><p>' + im('left', 'inline', 160, 300) + SHORT + '</p><h2>Un titre assez long pour passer à côté de l\'image puis dessous, sur plusieurs lignes d\'affilée comme le texte</h2><p>' + FOLLOW + '</p>', opts: { xTolerancePt: 1.5 } },
    { id: 'heading_plain_long', what: 'titre long sans image (garde-fou de la mesure : la largeur d\'une ligne de texte gras)', html: '<h2>Un titre assez long pour passer à côté de l\'image puis dessous, sur plusieurs lignes d\'affilée comme le texte</h2><p>' + FOLLOW + '</p>', opts: { xTolerancePt: 1.5 } },
    { id: 'heading_centered_none', what: 'image en ligne dans un titre centré', html: '<h2 style="text-align: center">Un titre avec ' + im('none', 'inline', 40, 40) + ' au milieu</h2><p>' + FOLLOW + '</p>' },
    { id: 'cell_right', what: 'image à droite dans une case de tableau (la case de droite : l\'image sépare sinon le texte de sa voisine)', html: '<table><tbody><tr><td><p>' + FOLLOW + '</p></td><td><p>' + im('right', 'inline', 100, 80) + LONG + '</p></td></tr></tbody></table><p>' + SHORT + '</p>', opts: { ignoreText: FOLLOW, xTolerancePt: 5 } },
    { id: 'cell_left_next_paragraph', what: 'image à gauche plus haute que son paragraphe, dans une case : le paragraphe suivant de la case se range à côté d\'elle', html: cellOf('<td>', '<p>' + im('left', 'inline', 100, 200) + SHORT + '</p><p>' + LONG + '</p>'), opts: { ignoreText: FOLLOW, xTolerancePt: 1 } },
    { id: 'cell_left_then_row', what: 'image à gauche plus haute que le texte de sa case : la ligne suivante du tableau repart sous elle', html: '<table><tbody><tr><td><p>' + im('left', 'inline', 100, 200) + SHORT + '</p></td><td><p>' + FOLLOW + '</p></td></tr><tr><td><p>Case du dessous.</p></td><td><p></p></td></tr></tbody></table><p>' + SHORT + '</p>', opts: { ignoreText: FOLLOW, xTolerancePt: 1 } },
    { id: 'column_right', what: 'image à droite dans une colonne (la colonne de droite : l\'image sépare sinon le texte de sa voisine)', html: '<div class="two-columns-zone" style="--layout-left: 50%;"><div class="two-columns-column"><p>' + FOLLOW + '</p></div><div class="two-columns-column"><p>' + im('right', 'inline', 100, 80) + LONG + '</p></div></div><p>' + SHORT + '</p>', opts: { ignoreText: FOLLOW } },
    { id: 'column_left_next_paragraph', what: 'image à gauche plus haute que son paragraphe, dans une colonne : le paragraphe suivant de la colonne se range à côté d\'elle', html: column('<p>' + im('left', 'inline', 100, 200) + SHORT + '</p><p>' + LONG + '</p>') },
    { id: 'callout_left', what: 'image à gauche dans un encadré', html: '<div class="callout" data-color="blue" data-icon="info"><p>' + im('left', 'inline', 100, 80) + LONG + '</p></div><p>' + SHORT + '</p>', opts: { dropIcon: true } },
    { id: 'callout_right', what: 'image à droite dans un encadré', html: '<div class="callout" data-color="blue" data-icon="info"><p>' + im('right', 'inline', 100, 80) + LONG + '</p></div><p>' + SHORT + '</p>', opts: { dropIcon: true } },
    { id: 'callout_left_tall', what: 'image à gauche plus haute que le texte de son encadré : elle le dépasse (l\'éditeur ne l\'agrandit pas) et le paragraphe d\'après se range encore à côté d\'elle', html: '<div class="callout" data-color="blue" data-icon="info"><p>' + im('left', 'inline', 100, 200) + FOLLOW + '</p></div><p>' + LONG + '</p><p>' + SHORT + '</p>', opts: { dropIcon: true } },
    { id: 'callout_right_tall', what: 'image à droite plus haute que le texte de son encadré : elle le dépasse et le paragraphe d\'après se range encore à côté d\'elle', html: '<div class="callout" data-color="blue" data-icon="info"><p>' + im('right', 'inline', 100, 200) + FOLLOW + '</p></div><p>' + LONG + '</p><p>' + SHORT + '</p>', opts: { dropIcon: true } },
  ].forEach(c => cases.push({
    id: 'imgtext_pdf_' + c.id,
    description: 'PDF : ' + c.what + ' - l\'image et chaque ligne de texte sont où l\'éditeur les met (mêmes mots par ligne, écart de position ≤ ' + TOLERANCE_PT + ' pt)',
    run: async (h) => pdfVersusEditor(h, c.html, c.opts),
  }));

  // === Fin de page : le PDF coupe en pages, l'éditeur est continu ===
  // Les y de l'éditeur ne valent plus ici : une image qui ne tient pas dans ce qui reste de la page passe en haut de la suivante, avec la ligne où elle est posée. Ce que le PDF doit garder, lui : le texte entier, dans l'ordre ;
  // l'image une fois, entière dans sa page (jamais coupée par le bord ni dans la marge) ; autant de lignes avant l'image que dans l'éditeur ; rien qui la recouvre ; et, pour une image habillée, le texte à côté d'elle à sa marge de 9 pt.
  async function pdfPagesVersusEditor(h, html, align, opts) {
    const { dropIcon = false } = opts || {};
    await setupEditor(h, html);
    const editor = layoutOf(h.tiptap());
    const ground = await pdfOf(h);
    const m = PageLayout.getMarginsPt();
    const problems = [];
    const pages = ground.pages.map(pg => ({ pg, lines: pdfLinesOf(pg) }));
    const editorText = editor.lines.map(l => l.text.replace(/\s+/g, '')).join('');
    // Les puces d'une liste sont du texte dans le PDF, un marqueur de la liste dans l'éditeur.
    const pdfText = pages.map(p => p.lines.map(l => l.text).join('')).join('').replace(/•/g, '');
    if (pdfText !== editorText) { let i = 0; while (i < pdfText.length && pdfText[i] === editorText[i]) i += 1; problems.push({ texte: 'différent', rang: i, editeur: editorText.slice(Math.max(0, i - 10), i + 20), pdf: pdfText.slice(Math.max(0, i - 10), i + 20) }); }
    const found = [];
    pages.forEach((p, pi) => p.pg.images.forEach(im => { if (!(dropIcon && im.width < 20)) found.push({ page: pi, im }); }));
    if (found.length !== editor.imgs.length) problems.push({ images: { editeur: editor.imgs.length, pdf: found.length } });
    const before = { editor: 0, pdf: 0 };
    found.forEach(({ page, im }, k) => {
      const pg = ground.pages[page];
      if (im.y < m.top - 0.5 || im.y + im.height > pg.height - m.bottom + 0.5) problems.push({ image: 'hors de la zone de texte de sa page', page: page + 1, haut: r2(im.y), bas: r2(im.y + im.height), zone: [r2(m.top), r2(pg.height - m.bottom)] });
      pg.textItems.forEach(it => {
        const overlapsX = it.x < im.x + im.width - 0.5 && it.x + it.width > im.x + 0.5;
        if (overlapsX && it.y > im.y + 4 && it.y < im.y + im.height) problems.push({ recouvre: it.str.slice(0, 20), page: page + 1 });
        if (k === 0 && align === 'left' && it.y > im.y + 4 && it.y < im.y + im.height + 6 && it.x < im.x + im.width + 9 - 0.6 && it.x + it.width > im.x) problems.push({ tropPresDeLImage: it.str.slice(0, 20), x: r2(it.x), image: r2(im.x + im.width) });
        if (k === 0 && align === 'right' && it.y > im.y + 4 && it.y < im.y + im.height + 6 && it.x + it.width > im.x - 9 + 0.6 && it.x < im.x + im.width) problems.push({ tropPresDeLImage: it.str.slice(0, 20), xr: r2(it.x + it.width), image: r2(im.x) });
      });
      const ed = editor.imgs[k];
      if (ed) {
        before.editor += editor.lines.filter(l => l.y < ed.y - 0.5).length;
        before.pdf += pages.reduce((n, p, pi) => n + (pi < page ? p.lines.length : pi === page ? p.lines.filter(l => l.y < im.y).length : 0), 0);
      }
    });
    if (before.editor !== before.pdf) problems.push({ lignesAvantLImage: before });
    return { pass: problems.length === 0, notes: JSON.stringify({ pages: pages.length, images: found.map(f => ({ page: f.page + 1, x: r2(f.im.x), y: r2(f.im.y) })), lignes: pages.map(p => p.lines.length), problemes: problems.slice(0, 4) }) };
  }
  [
    { id: 'page_left', align: 'left' },
    { id: 'page_none_mid', align: null },
    { id: 'page_center', align: 'center' },
  ].forEach(c => {
    const m = MATRIX.find(x => x.id === c.id);
    cases.push({
      id: 'imgtext_pdf_' + c.id,
      description: 'PDF : ' + m.what + ' - le texte entier dans l\'ordre, l\'image une fois et entière dans sa page (jamais coupée), rien dessus, le texte à côté d\'elle à 9 pt, autant de lignes avant elle que dans l\'éditeur',
      run: async (h) => pdfPagesVersusEditor(h, m.html, c.align),
    });
  });
  [
    { id: 'page_right_tall', what: 'image haute à droite au bas de la page, trop haute pour ce qui reste', align: 'right', html: fill(44) + '<p>' + im('right', 'inline', 160, 300) + LONG + '</p><p>' + FOLLOW + '</p>' },
    { id: 'page_left_fits', what: 'image à gauche qui tient dans ce qui reste de la page, texte à côté qui passe à la page suivante', align: 'left', html: fill(38) + '<p>' + im('left', 'inline', 160, 160) + LONG + '</p><p>' + FOLLOW + '</p><p>' + LONG + '</p><p>' + FOLLOW + '</p><p>' + LONG + '</p><p>' + FOLLOW + '</p>' },
    { id: 'page_block_mid', what: 'image « bloc » au milieu du texte, au bas de la page', align: null, html: FILL + '<p>' + BEFORE + ' ' + im('none', 'block', 160, 200) + ' ' + AFTER + '</p><p>' + FOLLOW + '</p>' },
    { id: 'page_cell_left', what: 'image à gauche dans une case de tableau au bas de la page (la ligne du tableau passe à la page suivante avec son image)', align: 'left', html: fill(44) + '<table><tbody><tr><td><p>' + im('left', 'inline', 100, 150) + LONG + '</p></td><td><p></p></td></tr></tbody></table><p>' + SHORT + '</p>' },
    { id: 'page_column_left', what: 'image à gauche dans une colonne au bas de la page (la zone passe à la page suivante avec son image)', align: 'left', html: fill(44) + '<div class="two-columns-zone" style="--layout-left: 50%;"><div class="two-columns-column"><p>' + im('left', 'inline', 100, 150) + LONG + '</p></div><div class="two-columns-column"><p></p></div></div><p>' + SHORT + '</p>' },
    { id: 'page_callout_left', what: 'image à gauche dans un encadré au bas de la page', align: 'left', opts: { dropIcon: true }, html: fill(45) + '<div class="callout" data-color="blue" data-icon="info"><p>' + im('left', 'inline', 100, 150) + LONG + '</p></div><p>' + SHORT + '</p>' },
  ].forEach(c => cases.push({
    id: 'imgtext_pdf_' + c.id,
    description: 'PDF : ' + c.what + ' - le texte entier dans l\'ordre, l\'image une fois et entière dans sa page (jamais coupée), rien dessus, le texte à côté d\'elle à 9 pt, autant de lignes avant elle que dans l\'éditeur',
    run: async (h) => pdfPagesVersusEditor(h, c.html, c.align, c.opts),
  }));

  // Une image habillée plus haute que son paragraphe, suivie d'autre chose qu'un paragraphe : un tableau, un titre, une liste, une citation, un bloc de code n'ont pas de texte que le PDF puisse ranger à côté d'elle, ils
  // repartent sous l'image (le navigateur, lui, les range à côté quand ils tiennent) - sans jamais passer dessus.
  [
    { id: 'float_then_table', what: 'image à gauche plus haute que son paragraphe, suivie d\'un tableau', next: '<table><tbody><tr><td><p>' + FOLLOW + '</p></td></tr></tbody></table>' },
    { id: 'float_then_heading', what: 'image à gauche plus haute que son paragraphe, suivie d\'un titre', next: '<h2>Un titre sous l\'image</h2>' },
    { id: 'float_then_list', what: 'image à gauche plus haute que son paragraphe, suivie d\'une liste', next: '<ul><li><p>Premier élément de la liste</p></li><li><p>Deuxième élément</p></li></ul>' },
    { id: 'float_then_quote', what: 'image à gauche plus haute que son paragraphe, suivie d\'une citation', next: '<blockquote><p>' + FOLLOW + '</p></blockquote>' },
    { id: 'float_then_image_paragraph', what: 'image à gauche plus haute que son paragraphe, suivie d\'un paragraphe qui porte lui-même une image', next: '<p>' + BEFORE + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + '</p>' },
  ].forEach(c => cases.push({
    id: 'imgtext_pdf_' + c.id,
    description: 'PDF : ' + c.what + ' - le texte entier dans l\'ordre, l\'image entière, rien dessus, le texte à côté d\'elle à 9 pt',
    run: async (h) => pdfPagesVersusEditor(h, '<p>Ligne repère.</p><p>' + im('left', 'inline', 160, 300) + SHORT + '</p>' + c.next + '<p>' + FOLLOW + '</p>', 'left'),
  }));

  // === Notes de bas de page dans un paragraphe qui porte une image ===
  // Le texte d'un tel paragraphe est lu par morceaux (une ligne, ce qui précède l'image, ce qui la suit) : chaque note doit rester dans le texte, juste après son mot, et n'être comptée qu'une fois au bas de la page.
  const NOTE = (n, text) => '<sup class="footnote-ref-marker" data-note-id="' + n + '" data-note-text="' + text + '"></sup>';
  const NOTE_1 = NOTE(1, 'Première note'), NOTE_2 = NOTE(2, 'Deuxième note');
  async function pdfNotesWithImage(h, html) {
    await setupEditor(h, html);
    const page = (await pdfOf(h)).pages[0];
    const entries = page.textItems.filter(i => /^\d+\.$/.test(i.str.trim()));
    const zoneTop = entries.length ? Math.min(...entries.map(i => i.y)) - 12 : page.height;
    const body = page.textItems.filter(i => i.y < zoneTop), zone = page.textItems.filter(i => i.y >= zoneTop);
    const refs = body.filter(i => /^\d+$/.test(i.str.trim())).sort((a, b) => a.y - b.y || a.x - b.x);
    const zoneText = zone.map(i => i.str).join('').replace(/\s+/g, '');
    // Un numéro de note est un exposant : sa ligne de base est 5,5 pt au-dessus de celle de la ligne.
    const lineBefore = refs[0] ? body.filter(i => i !== refs[0] && Math.abs(i.y - refs[0].y) < 8 && i.x < refs[0].x).sort((a, b) => a.x - b.x) : [];
    const before = lineBefore.map(i => i.str).join('').replace(/\s+/g, '');
    const last = lineBefore[lineBefore.length - 1];
    const gap = last && refs[0] ? refs[0].x - (last.x + last.width) : null;
    const problems = [];
    if (entries.map(i => i.str.trim()).join(' ') !== '1. 2.') problems.push({ entrees: entries.map(i => i.str.trim()) });
    if (zoneText.split('Premièrenote').length !== 2 || zoneText.split('Deuxièmenote').length !== 2) problems.push({ bas: zoneText.slice(0, 80) });
    if (refs.map(i => i.str.trim()).join(' ') !== '1 2') problems.push({ numeros: refs.map(i => i.str.trim()) });
    if (!before.endsWith('Lecture,') || gap === null || gap < -0.5 || gap > 3) problems.push({ avantLaNote1: before.slice(-20), ecartPt: gap === null ? null : r2(gap) });
    return { pass: problems.length === 0, notes: JSON.stringify({ entrees: entries.length, numeros: refs.map(i => i.str.trim()), avantLaNote1: before.slice(-12), ecartPt: gap === null ? null : r2(gap), problemes: problems }) };
  }
  [
    { id: 'footnotes_inline_mid', what: 'image en ligne au milieu du texte', html: '<p>' + BEFORE + NOTE_1 + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + NOTE_2 + '</p><p>Suite sans note.</p>' },
    { id: 'footnotes_block_mid', what: 'image « bloc » au milieu du texte', html: '<p>' + BEFORE + NOTE_1 + ' ' + im('none', 'block', 100, 60) + ' ' + AFTER + NOTE_2 + '</p><p>Suite sans note.</p>' },
    { id: 'footnotes_left_float', what: 'image à gauche en tête du paragraphe', html: '<p>' + im('left', 'inline', 100, 80) + BEFORE + NOTE_1 + ' ' + AFTER + NOTE_2 + '</p><p>Suite sans note.</p>' },
    { id: 'footnotes_justified_mid', what: 'image en ligne au milieu d\'un paragraphe justifié', html: '<p style="text-align: justify">' + BEFORE + NOTE_1 + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + NOTE_2 + '</p><p>Suite sans note.</p>' },
    { id: 'footnotes_cell_mid', what: 'image en ligne au milieu du texte d\'une case de tableau', html: '<table><tbody><tr><td><p>' + BEFORE + NOTE_1 + ' ' + im('none', 'inline', 60, 40) + ' ' + AFTER + NOTE_2 + '</p></td><td><p>' + SHORT + '</p></td></tr></tbody></table><p>Suite sans note.</p>' },
  ].forEach(c => cases.push({
    id: 'imgtext_pdf_' + c.id,
    description: 'PDF : ' + c.what + ', avec deux notes de bas de page - chaque note reste juste après son mot (la première après « Lecture, »), les deux numéros sont dans le texte, et les deux notes sont au bas de la page, une fois chacune',
    run: async (h) => pdfNotesWithImage(h, c.html),
  }));

  return cases;
})();
