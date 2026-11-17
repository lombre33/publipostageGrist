// Suite "odpExport" - l'EXPORT OpenDocument présentation (js/odp-export.js) : la présentation d'une ligne devient un .odp, SANS bibliothèque de plus (JSZip, XML écrit à la main), chantier « formats libres », lot 5b. La
// diapositive se lit comme pour PowerPoint : l'export PowerPoint (js/pptx-export.js) fabrique son fichier et le .odp en est la traduction, d'où ce que ces cas vérifient : ce que le FICHIER dit de la diapositive, pas
// comment l'éditeur la mesure (c'est le travail de la suite « pptxExport » et de js/verify-pptx-export.mjs).
//
// Les cas écrivent le fichier dans la page puis le RELISENT de deux façons : sa forme (le paquet : `mimetype` en premier et non compressé, un manifeste qui nomme chaque partie, du XML bien formé, les noms
// d'espaces utilisés tous déclarés - `dom:` des liens d'objet compris, sans quoi LibreOffice les jette) et son sens (l'import OpenDocument présentation du même chantier, js/odp-import.js, relit le fichier : ce qu'on y
// retrouve est ce que LibreOffice y verra). Un essai d'aller-retour ne remplace pas LibreOffice : le fichier a aussi été ouvert par LibreOffice 24.2 (conversion en PDF et en .odp) hors dépôt, cf. dev-tests/README.md.
//  - la forme : paquet, mimetype, manifeste, XML bien formé, espaces de noms, taille et sens de la page, un nom de fichier ;
//  - le texte : séries de caractères (gras, italique, souligné, barré, couleur, surlignage), liens (adresse et signet), listes à puces et numérotées imbriquées, le titre à sa place, les polices déclarées ;
//  - les formes : rectangle, ellipse tournée, bulle (le tracé écrit, jamais une forme « de la norme » sans son chemin), traits et pointes, rotation d'un texte, liens d'objet (adresse, diapositive suivante, signet) ;
//  - les tableaux (cases fusionnées), les images (`Pictures/`, texte alternatif) ;
//  - la diapositive : fond, notes, masquée, passage (effet, côté, durée), le décor du thème (bandeau, numéro, pied, première diapositive à part) ;
//  - le compte rendu : chaque genre non repris compté une fois, jamais en silence, FR et EN ; le nom du fichier et la variable résolue d'une ligne.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const add = (id, description, run) => cases.push({ id, description, run });
  const checker = () => {
    const bad = [];
    return { bad, expect: (label, condition, detail) => { if (!condition) bad.push(label + (detail === undefined ? '' : ' : ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); } };
  };
  const near = (a, b, tolerance = 0.02) => Math.abs(Number(a) - Number(b)) <= tolerance;
  const ready = () => ExportEngines.ensure(['pptx', 'odpExport', 'odpImport', 'odtImport']);
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };
  const TABLE = 'DiapoOdp';
  const RECORD = { id: 1, Nom: 'Alice Martin' };
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text' });
    stub.setRows(TABLE, [RECORD]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD), TABLE);
    await sleep(100);
  }

  // --- Les briques d'une présentation de l'éditeur (le même balisage que verify-pptx-export.mjs) --------------------------------------------------------------------------------------------------------------
  const BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const RED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAG0lEQVR4nGM4wcBANiJf56jmUc2jmkc1U0UzAAn6OJAPHK6LAAAAAElFTkSuQmCC';
  const props = attrs => `<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0"${attrs}></div>`;
  const frame = (x, y, w, h, look, body, rot) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${rot ? ` data-ff-rot="${rot}"` : ''}${look || ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content">${body}</div></div></div>`;
  const line = (x, y, w, h, extra) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-shape="line" data-ff-line="#2f5597" data-ff-lw="3"${extra || ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content"></div></div></div>`;
  const sz = (pt, text) => `<span style="font-size: ${pt}pt;">${text}</span>`;
  const RECT = ' data-ff-shape="rect" data-ff-fill="#d9e2f3" data-ff-line="#2f5597" data-ff-lw="1.5"';
  const ELLIPSE = ' data-ff-shape="ellipse" data-ff-fill="#fde68a" data-ff-line="#b45309" data-ff-lw="2"';
  const BUBBLE = ' data-ff-shape="wedgeRoundRectCallout" data-ff-fill="#dcfce7" data-ff-line="#15803d" data-ff-lw="1.5"';
  const linked = target => ' data-ff-shape="rect" data-ff-fill="#e2e8f0" data-ff-link="' + target + '"';
  const marginsOf = theme => Object.assign({}, PageLayout.getMarginsPt(), { orientation: 'landscape', format: PageLayout.SLIDE_FORMAT }, theme ? { theme } : {});
  const THEME = { v: 1, name: 'Océan', colors: { bg: '#fdf6e3', text: '#1f2937', title: '#0b3c5d', accent1: '#1d6fa5', accent2: '#e07a1f', accent3: '#2e8b57', accent4: '#8e44ad', accent5: '#c0392b', accent6: '#7f8c8d' }, fonts: { title: 'Arial', body: 'Arial' }, decor: { band: { edge: 'bottom', size: 'thick', color: 'accent2' }, number: { pos: 'br' }, footer: { text: 'Pied de test', pos: 'bl' }, skipFirst: true } };

  // --- Lire un .odp écrit ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const NS = Object.assign({ script: 'urn:oasis:names:tc:opendocument:xmlns:script:1.0' }, ExportCommon.Odf.NS);
  const parseXml = xml => new DOMParser().parseFromString(xml, 'application/xml');
  const all = (root, ns, name) => Array.from(root.getElementsByTagNameNS(NS[ns], name));
  const attr = (el, ns, name) => (el ? el.getAttributeNS(NS[ns], name) || '' : '');
  const kids = (el, ns, name) => Array.from(el.children).filter(child => child.namespaceURI === NS[ns] && child.localName === name);
  // Le fichier : { blob, report, zip, names, text(path), content, styles, pages, named(name), prop(styleName, family, attr), shapes(page) }.
  async function openOdp(made) {
    const zip = await JSZip.loadAsync(await made.blob.arrayBuffer());
    const text = path => zip.file(path).async('string');
    const contentXml = await text('content.xml');
    const stylesXml = await text('styles.xml');
    const content = parseXml(contentXml);
    const styles = parseXml(stylesXml);
    const named = {};
    [content, styles].forEach(doc => all(doc, 'style', 'style').forEach((el) => { named[attr(el, 'style', 'name')] = el; }));
    const pages = all(content, 'draw', 'page');
    const properties = (styleName, tag) => { const style = named[styleName]; return style ? kids(style, 'style', tag)[0] || null : null; };
    return {
      blob: made.blob, report: made.report, filename: made.filename, zip, names: Object.keys(zip.files), text, contentXml, stylesXml, content, styles, pages, named,
      graphic: (styleName, name) => attr(properties(styleName, 'graphic-properties'), 'draw', name) || attr(properties(styleName, 'graphic-properties'), 'svg', name) || attr(properties(styleName, 'graphic-properties'), 'fo', name),
      textProp: (styleName, name) => attr(properties(styleName, 'text-properties'), 'fo', name) || attr(properties(styleName, 'text-properties'), 'style', name),
      shapes: page => Array.from(page.children).filter(el => el.namespaceURI === NS.draw && /^(frame|custom-shape|line|g)$/.test(el.localName)),
      textOf: el => all(el, 'text', 'p').map(p => p.textContent).join('\n'),
    };
  }
  async function exportDeck(html, { theme, title = 'essai' } = {}) {
    await ready();
    return openOdp(await OdpExport.fromHtml(html, { marginsPt: marginsOf(theme), title }));
  }
  const slideOne = (...children) => children.join('');
  // L'angle de `draw:transform="rotate (a) translate (...)"`, ramené à ]-π, π] (un tour de plus ou de moins n'y change rien).
  const angleOf = transform => { const angle = Number((/rotate \((-?[\d.]+)\)/.exec(transform || '') || [0, NaN])[1]); return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI)); };

  // ============================================================================================================================================================================================
  // 1. La forme du fichier
  // ============================================================================================================================================================================================
  add('odpExport_the_package_is_a_valid_opendocument_presentation', 'le paquet : `mimetype` en premier et non compressé, un manifeste qui nomme chaque partie, du XML bien formé, les espaces de noms déclarés (dom: compris), la page en 16:9, une page par diapositive', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    const x = await exportDeck(slideOne('<h1>Titre un</h1><p>Texte</p>', BREAK, '<h2>Deux</h2>', BREAK, '<h2>Trois</h2>'));
    expect('le premier fichier du zip est mimetype', x.names[0] === 'mimetype', x.names);
    expect('mimetype dit « application/vnd.oasis.opendocument.presentation » et rien d\'autre', (await x.text('mimetype')) === 'application/vnd.oasis.opendocument.presentation');
    const entry = x.zip.file('mimetype');
    expect('mimetype n\'est pas compressé', entry && entry._data && entry._data.compression && entry._data.compression.magic === '\u0000\u0000');
    expect('le type du blob est celui d\'une présentation OpenDocument', x.blob.type === 'application/vnd.oasis.opendocument.presentation', x.blob.type);
    const manifest = parseXml(await x.text('META-INF/manifest.xml'));
    const listed = all(manifest, 'manifest', 'file-entry').map(el => attr(el, 'manifest', 'full-path'));
    expect('le manifeste nomme content.xml, styles.xml et meta.xml', ['content.xml', 'styles.xml', 'meta.xml'].every(name => listed.indexOf(name) >= 0), listed);
    const parts = x.names.filter(name => !/\/$/.test(name) && name !== 'mimetype' && name !== 'META-INF/manifest.xml');
    expect('chaque partie du paquet est dans le manifeste', parts.every(name => listed.indexOf(name) >= 0), parts);
    for (const name of ['META-INF/manifest.xml', 'content.xml', 'styles.xml', 'meta.xml']) {
      const doc = parseXml(await x.text(name));
      expect(name + ' est du XML bien formé', !doc.getElementsByTagName('parsererror').length, (doc.getElementsByTagName('parsererror')[0] || {}).textContent);
    }
    expect('`dom:` est déclaré dans content.xml (sans lui LibreOffice jette les liens d\'objet : script:event-name="dom:click")', /xmlns:dom="http:\/\/www\.w3\.org\/2001\/xml-events"/.test(x.contentXml));
    expect('trois pages, nommées', x.pages.length === 3 && x.pages.every((page, i) => attr(page, 'draw', 'name') === 'page' + (i + 1)), x.pages.length);
    const layout = all(x.styles, 'style', 'page-layout')[0];
    const size = all(layout, 'style', 'page-layout-properties')[0];
    expect('la page est une diapositive 16:9 (33,87 x 19,05 cm)', near(parseFloat(attr(size, 'fo', 'page-width')), 33.867, 0.05) && near(parseFloat(attr(size, 'fo', 'page-height')), 19.05, 0.05), [attr(size, 'fo', 'page-width'), attr(size, 'fo', 'page-height')]);
    const meta = parseXml(await x.text('meta.xml'));
    expect('le titre du document est dans meta.xml', all(meta, 'dc', 'title')[0] && all(meta, 'dc', 'title')[0].textContent === 'essai');
    expect('une page maîtresse nommée « Default »', all(x.styles, 'style', 'master-page').some(el => attr(el, 'style', 'name') === 'Default'));
    expect('rien à dire pour une présentation ordinaire', !x.report.length, x.report);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 2. Le texte
  // ============================================================================================================================================================================================
  add('odpExport_text_runs_links_and_title_are_written', 'le texte : le titre est un emplacement de titre, les séries de caractères (gras, italique, souligné, barré, couleur, surlignage) ont leur style, un lien garde son adresse ou son signet, les polices sont déclarées', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    const html = slideOne(
      `<h1 style="text-align: center;">${sz(44, 'Titre un')}</h1>`,
      `<p>${sz(20, '<strong>gras</strong> <em>italique</em> <u>souligné</u> <s>barré</s> <a href="https://example.org/a">un lien</a> <span style="color:#c00000">rouge</span> <span style="background-color:#fef08a">surligné</span>')}</p>`,
      `<p>${sz(20, 'Vers la <a href="#bk1">diapositive deux</a>.')}</p>`, BREAK,
      `<p data-anchor="bk1" data-anchor-name="Cible">${sz(20, 'Cible du signet')}</p>`);
    const x = await exportDeck(html);
    const [title, body] = x.shapes(x.pages[0]);
    expect('le titre est un emplacement de titre', title && attr(title, 'presentation', 'class') === 'title', title && title.outerHTML.slice(0, 160));
    expect('son texte', x.textOf(title) === 'Titre un', x.textOf(title));
    const paragraphs = all(title, 'text', 'p');
    expect('il est centré', paragraphs[0] && ['center'].includes((x.named[attr(paragraphs[0], 'text', 'style-name')] ? attr(kids(x.named[attr(paragraphs[0], 'text', 'style-name')], 'style', 'paragraph-properties')[0], 'fo', 'text-align') : '')), paragraphs[0] && attr(paragraphs[0], 'text', 'style-name'));
    expect('le texte est une zone de texte', body && body.localName === 'frame' && all(body, 'draw', 'text-box').length === 1, body && body.localName);
    const spanOf = word => all(body, 'text', 'span').find(el => el.textContent === word);
    const styleOf = word => attr(spanOf(word), 'text', 'style-name');
    expect('« gras » est en gras', x.textProp(styleOf('gras'), 'font-weight') === 'bold', styleOf('gras'));
    expect('« italique » est en italique', x.textProp(styleOf('italique'), 'font-style') === 'italic');
    expect('« souligné » est souligné', !!x.textProp(styleOf('souligné'), 'text-underline-style') && x.textProp(styleOf('souligné'), 'text-underline-style') !== 'none', x.textProp(styleOf('souligné'), 'text-underline-style'));
    expect('« barré » est barré', !!x.textProp(styleOf('barré'), 'text-line-through-style') && x.textProp(styleOf('barré'), 'text-line-through-style') !== 'none', x.textProp(styleOf('barré'), 'text-line-through-style'));
    expect('« rouge » est rouge', /^#c00000$/i.test(x.textProp(styleOf('rouge'), 'color')), x.textProp(styleOf('rouge'), 'color'));
    expect('« surligné » a son fond', /^#fef08a$/i.test(x.textProp(styleOf('surligné'), 'background-color')), x.textProp(styleOf('surligné'), 'background-color'));
    expect('la taille est celle de l\'éditeur (20 pt)', x.textProp(styleOf('gras'), 'font-size') === '20pt', x.textProp(styleOf('gras'), 'font-size'));
    const links = all(body, 'text', 'a');
    expect('le lien garde son adresse', links.some(el => attr(el, 'xlink', 'href') === 'https://example.org/a' && el.textContent === 'un lien'), links.map(el => attr(el, 'xlink', 'href')));
    expect('le lien vers une diapositive pointe son nom de page (#page2)', links.some(el => attr(el, 'xlink', 'href') === '#page2' && el.textContent === 'diapositive deux'), links.map(el => attr(el, 'xlink', 'href')));
    const faces = all(x.content, 'style', 'font-face').concat(all(x.styles, 'style', 'font-face'));
    const faceNames = faces.map(el => attr(el, 'style', 'name'));
    const used = new Set();
    Array.from(x.contentXml.matchAll(/style:font-name="([^"]+)"/g)).forEach(match => used.add(match[1]));
    expect('chaque police utilisée est déclarée', used.size > 0 && Array.from(used).every(name => faceNames.indexOf(name) >= 0), { used: Array.from(used), faceNames });
    return result(bad);
  });

  add('odpExport_lists_keep_their_levels_and_numbering', 'les listes : une liste OpenDocument par suite de puces, les niveaux imbriqués, la numérotation (1.) à part des puces, deux listes qui se suivent restent deux', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    const html = slideOne(
      `<ul><li><p>${sz(20, 'Premier')}</p></li><li><p>${sz(20, 'Deuxième')}</p><ul><li><p>${sz(20, 'Sous-point')}</p></li></ul></li></ul>`,
      `<ol><li><p>${sz(20, 'Un')}</p></li><li><p>${sz(20, 'Deux')}</p></li></ol>`);
    const x = await exportDeck(html);
    const lists = all(x.pages[0], 'text', 'list').filter(el => el.parentNode.localName !== 'list-item');
    expect('deux listes de premier niveau : la liste à puces puis la liste numérotée', lists.length === 2, lists.length);
    expect('la première a deux entrées, la seconde est dans la deuxième', lists[0] && kids(lists[0], 'text', 'list-item').length === 2 && all(kids(lists[0], 'text', 'list-item')[1], 'text', 'list').length === 1, lists[0] && lists[0].outerHTML.slice(0, 300));
    expect('le sous-point est dans la liste du deuxième niveau', lists[0] && all(lists[0], 'text', 'list')[0] && all(lists[0], 'text', 'list')[0].textContent === 'Sous-point');
    const listStyle = name => all(x.content, 'text', 'list-style').find(el => attr(el, 'style', 'name') === name);
    const first = listStyle(attr(lists[0], 'text', 'style-name'));
    const second = listStyle(attr(lists[1], 'text', 'style-name'));
    expect('la liste à puces a ses niveaux de puces', first && all(first, 'text', 'list-level-style-bullet').length >= 2, first && first.outerHTML.slice(0, 200));
    expect('la liste numérotée a une numérotation arabe suivie d\'un point', second && all(second, 'text', 'list-level-style-number').some(el => attr(el, 'style', 'num-format') === '1' && attr(el, 'style', 'num-suffix') === '.'), second && second.outerHTML.slice(0, 200));
    expect('les deux listes ont chacune leur style', attr(lists[0], 'text', 'style-name') !== attr(lists[1], 'text', 'style-name'));
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 3. Les formes, les traits, les liens d'objet
  // ============================================================================================================================================================================================
  add('odpExport_shapes_are_written_with_their_path_and_rotation', 'les formes : rectangle, ellipse tournée de 30° et bulle sont des formes dessinées AVEC leur chemin (LibreOffice ne trace pas une forme de la norme sans lui), fond et trait en style graphique, la rotation en draw:transform, le texte dans la forme', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    const x = await exportDeck(slideOne(
      frame(60, 60, 260, 120, RECT, '<p>Rectangle avec <strong>texte</strong></p>'),
      frame(380, 60, 220, 120, ELLIPSE, '<p style="text-align:center">Ellipse</p>', 30),
      frame(640, 50, 240, 120, BUBBLE, '<p>Bulle</p>'),
      frame(60, 360, 300, 120, '', '<p style="text-align:right">Texte tourné</p>', 330)));
    const shapes = x.shapes(x.pages[0]);
    const custom = shapes.filter(el => el.localName === 'custom-shape');
    expect('trois formes dessinées', custom.length === 3, shapes.map(el => el.localName));
    custom.forEach((shape, i) => {
      const geometry = all(shape, 'draw', 'enhanced-geometry')[0];
      expect('la forme ' + (i + 1) + ' porte son chemin (draw:enhanced-path) et sa boîte (svg:viewBox)', geometry && !!attr(geometry, 'draw', 'enhanced-path') && /^0 0 \d+ \d+$/.test(attr(geometry, 'svg', 'viewBox')), geometry && geometry.outerHTML.slice(0, 200));
    });
    const rectangle = custom[0];
    expect('le rectangle : 260 x 120 pt moins le trait de 1,5 pt (la boîte du fichier PowerPoint) = 9,12 x 4,18 cm', near(parseFloat(attr(rectangle, 'svg', 'width')), 9.119, 0.02) && near(parseFloat(attr(rectangle, 'svg', 'height')), 4.18, 0.02), [attr(rectangle, 'svg', 'width'), attr(rectangle, 'svg', 'height')]);
    expect('le rectangle a son fond et son trait', /^#d9e2f3$/i.test(x.graphic(attr(rectangle, 'draw', 'style-name'), 'fill-color')) && /^#2f5597$/i.test(x.graphic(attr(rectangle, 'draw', 'style-name'), 'stroke-color')), [x.graphic(attr(rectangle, 'draw', 'style-name'), 'fill-color'), x.graphic(attr(rectangle, 'draw', 'style-name'), 'stroke-color')]);
    expect('le texte de la forme est dans la forme', x.textOf(rectangle) === 'Rectangle avec texte', x.textOf(rectangle));
    const ellipse = custom[1];
    expect('l\'ellipse tournée de 30° dans le sens des aiguilles : rotate (-30° en radians)', near(angleOf(attr(ellipse, 'draw', 'transform')), -Math.PI / 6, 0.001), attr(ellipse, 'draw', 'transform'));
    expect('une forme qui n\'est pas tournée n\'a pas de draw:transform', !attr(rectangle, 'draw', 'transform'));
    expect('la bulle a un fond vert pâle', /^#dcfce7$/i.test(x.graphic(attr(custom[2], 'draw', 'style-name'), 'fill-color')));
    const turned = shapes.find(el => el.localName === 'frame' && x.textOf(el) === 'Texte tourné');
    expect('le texte tourné de 330° dans le sens des aiguilles est un angle de +30° (même angle à un tour près)', turned && near(angleOf(attr(turned, 'draw', 'transform')), Math.PI / 6, 0.001), turned && attr(turned, 'draw', 'transform'));
    return result(bad);
  });

  add('odpExport_lines_have_their_arrows_and_dashes', 'les traits : de bout en bout, la pointe de début et de fin (marqueurs déclarés dans les styles), le sens (retourné), l\'épaisseur', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    const x = await exportDeck(slideOne(
      line(60, 260, 300, 0, ' data-ff-head="triangle" data-ff-tail="triangle"'),
      line(420, 240, 200, 80, ' data-ff-flip="v" data-ff-tail="triangle"'),
      line(60, 400, 200, 0, ' data-ff-dash="dash"')));
    const lines = x.shapes(x.pages[0]).filter(el => el.localName === 'line');
    expect('trois traits', lines.length === 3, x.shapes(x.pages[0]).map(el => el.localName));
    const first = lines[0];
    expect('le premier va de gauche à droite à hauteur constante', parseFloat(attr(first, 'svg', 'x1')) < parseFloat(attr(first, 'svg', 'x2')) && near(parseFloat(attr(first, 'svg', 'y1')), parseFloat(attr(first, 'svg', 'y2'))), [attr(first, 'svg', 'x1'), attr(first, 'svg', 'x2'), attr(first, 'svg', 'y1'), attr(first, 'svg', 'y2')]);
    expect('il a une pointe au début et une à la fin', !!x.graphic(attr(first, 'draw', 'style-name'), 'marker-start') && !!x.graphic(attr(first, 'draw', 'style-name'), 'marker-end'), [x.graphic(attr(first, 'draw', 'style-name'), 'marker-start'), x.graphic(attr(first, 'draw', 'style-name'), 'marker-end')]);
    const markers = all(x.styles, 'draw', 'marker').map(el => attr(el, 'draw', 'name'));
    expect('la pointe nommée est déclarée dans les styles', markers.indexOf(x.graphic(attr(first, 'draw', 'style-name'), 'marker-end')) >= 0, markers);
    expect('son épaisseur est de 3 pt (0,106 cm)', near(parseFloat(x.graphic(attr(first, 'draw', 'style-name'), 'stroke-width')), 0.106, 0.01), x.graphic(attr(first, 'draw', 'style-name'), 'stroke-width'));
    const second = lines[1];
    expect('le trait retourné (flip v) monte : son début est plus bas que sa fin', parseFloat(attr(second, 'svg', 'y1')) > parseFloat(attr(second, 'svg', 'y2')), [attr(second, 'svg', 'y1'), attr(second, 'svg', 'y2')]);
    expect('il n\'a de pointe qu\'à la fin', !x.graphic(attr(second, 'draw', 'style-name'), 'marker-start') && !!x.graphic(attr(second, 'draw', 'style-name'), 'marker-end'));
    expect('le tiret est un style de tiret déclaré (draw:stroke="dash")', x.graphic(attr(lines[2], 'draw', 'style-name'), 'stroke') === 'dash' && all(x.styles, 'draw', 'stroke-dash').some(el => attr(el, 'draw', 'name') === x.graphic(attr(lines[2], 'draw', 'style-name'), 'stroke-dash')), x.graphic(attr(lines[2], 'draw', 'style-name'), 'stroke'));
    return result(bad);
  });

  add('odpExport_object_links_become_slide_show_actions', 'les liens d\'objet : une adresse, « diapositive suivante » et un signet sont des actions du diaporama (presentation:event-listener) sur la forme ; les autres sont comptées', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    const x = await exportDeck(slideOne(
      frame(420, 400, 150, 40, linked('https://example.org/b'), '<p>Bouton web</p>'),
      frame(590, 400, 150, 40, linked('pp:next'), '<p>Bouton suivant</p>'),
      frame(760, 400, 150, 40, linked('#bk1'), '<p>Bouton signet</p>'),
      frame(420, 455, 150, 40, linked('pp:back'), '<p>Dernière vue</p>'), BREAK,
      `<p data-anchor="bk1" data-anchor-name="Cible">${sz(20, 'Cible')}</p>`));
    const listeners = all(x.pages[0], 'presentation', 'event-listener');
    expect('trois actions écrites', listeners.length === 3, listeners.length);
    const byLabel = label => { const shape = x.shapes(x.pages[0]).find(el => x.textOf(el) === label); return shape ? all(shape, 'presentation', 'event-listener')[0] : null; };
    const web = byLabel('Bouton web');
    expect('l\'adresse : action « show » vers l\'adresse', web && attr(web, 'presentation', 'action') === 'show' && attr(web, 'xlink', 'href') === 'https://example.org/b', web && web.outerHTML);
    expect('l\'événement est « dom:click »', web && attr(web, 'script', 'event-name') === 'dom:click');
    const next = byLabel('Bouton suivant');
    expect('la diapositive suivante : action « next-page »', next && attr(next, 'presentation', 'action') === 'next-page', next && next.outerHTML);
    const bookmark = byLabel('Bouton signet');
    expect('le signet : action « show » vers la page cible (#page2)', bookmark && attr(bookmark, 'presentation', 'action') === 'show' && attr(bookmark, 'xlink', 'href') === '#page2', bookmark && bookmark.outerHTML);
    expect('une action que le format n\'a pas est comptée, jamais en silence', (x.report.find(entry => entry.key === 'actions') || {}).n === 1, x.report);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 4. Les tableaux et les images
  // ============================================================================================================================================================================================
  add('odpExport_tables_keep_merged_cells_and_images_keep_their_alt_text', 'un tableau garde ses cases fusionnées (colonnes et lignes, cases couvertes), une image va dans Pictures/ avec son texte alternatif et son entrée du manifeste', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    const x = await exportDeck(slideOne(
      '<table><tbody><tr><th colspan="2"><p>Entête</p></th></tr><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>D</p></td></tr></tbody></table>',
      `<p><img class="editor-image" alt="Un point rouge" src="data:image/png;base64,${RED_PNG}" style="width: 60px" data-layer="normal" data-wrap="inline"></p>`));
    const table = all(x.pages[0], 'table', 'table')[0];
    expect('un tableau de deux colonnes et de trois lignes', table && kids(table, 'table', 'table-column').length === 2 && kids(table, 'table', 'table-row').length === 3, table && [kids(table, 'table', 'table-column').length, kids(table, 'table', 'table-row').length]);
    const rows = table ? kids(table, 'table', 'table-row') : [];
    const cells = row => Array.from(row.children);
    expect('l\'entête s\'étend sur deux colonnes, suivie d\'une case couverte', rows[0] && attr(cells(rows[0])[0], 'table', 'number-columns-spanned') === '2' && cells(rows[0])[1].localName === 'covered-table-cell', rows[0] && rows[0].outerHTML.slice(0, 300));
    expect('« A » s\'étend sur deux lignes, la case sous elle est couverte', rows[1] && attr(cells(rows[1])[0], 'table', 'number-rows-spanned') === '2' && rows[2] && cells(rows[2])[0].localName === 'covered-table-cell');
    expect('le texte des cases', x.textOf(table).replace(/\n/g, ' ') === 'Entête A B D', x.textOf(table));
    const picture = all(x.pages[0], 'draw', 'image')[0];
    const href = attr(picture, 'xlink', 'href');
    expect('une image : son fichier est dans Pictures/', /^Pictures\/.+\.png$/.test(href) && x.names.indexOf(href) >= 0, [href, x.names]);
    const manifest = parseXml(await x.text('META-INF/manifest.xml'));
    expect('elle est au manifeste avec son type', all(manifest, 'manifest', 'file-entry').some(el => attr(el, 'manifest', 'full-path') === href && attr(el, 'manifest', 'media-type') === 'image/png'));
    expect('son texte alternatif est écrit (svg:desc)', all(picture.parentNode, 'svg', 'desc').some(el => el.textContent === 'Un point rouge'), picture.parentNode.outerHTML.slice(0, 300));
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 5. La diapositive : fond, notes, masquée, passage ; le décor du thème
  // ============================================================================================================================================================================================
  add('odpExport_slide_background_notes_hidden_and_transition', 'la diapositive : son fond, ses notes (page de notes), « masquée », le passage (effet, côté, durée) et le passage au temps ; une transition inconnue devient un fondu et est comptée', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    const x = await exportDeck(slideOne(
      props(' data-trans="push" data-trans-from="l" data-trans-dur="900" data-advance="4000" data-bg="#fff7e6" data-notes="Première ligne&#10;Deuxième ligne"'), '<h2>Un</h2>', BREAK,
      props(' data-hidden="1" data-trans="wipe" data-trans-from="t" data-trans-dur="1200"'), '<h2>Deux masquée</h2>', BREAK,
      props(' data-trans="zoom"'), '<h2>Trois</h2>'));
    const style = page => x.named[attr(page, 'draw', 'style-name')];
    const pageProps = page => kids(style(page), 'style', 'drawing-page-properties')[0];
    expect('le fond de la première est celui du repère', /^#fff7e6$/i.test(attr(pageProps(x.pages[0]), 'draw', 'fill-color')) && attr(pageProps(x.pages[0]), 'draw', 'fill') === 'solid', pageProps(x.pages[0]) && pageProps(x.pages[0]).outerHTML);
    const first = pageProps(x.pages[0]);
    expect('le passage : « pushWipe » depuis la droite (fromRight), 0,9 s', attr(first, 'smil', 'type') === 'pushWipe' && attr(first, 'smil', 'subtype') === 'fromRight', first && first.outerHTML);
    expect('le passage au temps : automatique, 4 secondes (PT00H00M04S)', attr(first, 'presentation', 'transition-type') === 'automatic' && attr(first, 'presentation', 'duration') === 'PT00H00M04S', first && first.outerHTML);
    const notes = all(x.pages[0], 'presentation', 'notes')[0];
    expect('les notes : une page de notes, deux paragraphes', notes && x.textOf(notes) === 'Première ligne\nDeuxième ligne', notes && x.textOf(notes));
    expect('la vignette de la page est dans les notes', notes && all(notes, 'draw', 'page-thumbnail').length === 1);
    expect('la deuxième est masquée', attr(pageProps(x.pages[1]), 'presentation', 'visibility') === 'hidden', pageProps(x.pages[1]) && pageProps(x.pages[1]).outerHTML);
    expect('son passage : « barWipe », arrivée par le haut (bottomToTop, le sens que l\'import relit)', attr(pageProps(x.pages[1]), 'smil', 'type') === 'barWipe' && attr(pageProps(x.pages[1]), 'smil', 'subtype') === 'bottomToTop', pageProps(x.pages[1]).outerHTML);
    expect('la troisième : le passage « zoom » n\'existe pas, un fondu le remplace', attr(pageProps(x.pages[2]), 'smil', 'type') === 'fade', pageProps(x.pages[2]) && pageProps(x.pages[2]).outerHTML);
    expect('la transition remplacée est comptée', (x.report.find(entry => entry.key === 'transitions') || {}).n === 1, x.report);
    return result(bad);
  });

  add('odpExport_theme_decor_goes_to_the_master_pages', 'le décor du thème : une page maîtresse pour le bandeau, le numéro et le pied (derrière le texte), une seconde pour la première diapositive quand son décor est autre, le fond du thème, la couleur du texte du thème', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    // Le thème est celui de la page, et le HTML des sorties porte la police et la couleur du thème sur chaque bloc (SlideTheme.forOutput, que js/slides-entry.js:outputHtml enchaîne avant les exports).
    PageLayout.setTheme(THEME);
    let x;
    try { x = await exportDeck(SlideTheme.forOutput(slideOne('<h1>Titre</h1><p>Texte</p>', BREAK, '<h2>Deux</h2><p>Texte</p>'), PageLayout.getTheme()), { theme: PageLayout.getTheme() }); } finally { PageLayout.setTheme(null); }
    const masters = all(x.styles, 'style', 'master-page');
    const byName = name => masters.find(el => attr(el, 'style', 'name') === name);
    expect('deux pages maîtresses : « Default » et « First »', !!byName('Default') && !!byName('First'), masters.map(el => attr(el, 'style', 'name')));
    expect('la première diapositive utilise « First », la seconde « Default »', attr(x.pages[0], 'draw', 'master-page-name') === 'First' && attr(x.pages[1], 'draw', 'master-page-name') === 'Default', x.pages.map(el => attr(el, 'draw', 'master-page-name')));
    const decor = master => Array.from(master.children).filter(el => el.namespaceURI === NS.draw);
    expect('« Default » porte le bandeau, le numéro, le pied', decor(byName('Default')).length >= 3, decor(byName('Default')).map(el => el.localName));
    expect('les objets du décor sont sur le calque « backgroundobjects »', decor(byName('Default')).every(el => attr(el, 'draw', 'layer') === 'backgroundobjects'), decor(byName('Default')).map(el => attr(el, 'draw', 'layer')));
    expect('« First » n\'a ni le numéro ni le pied (« pas sur la première »)', decor(byName('First')).length < decor(byName('Default')).length, [decor(byName('First')).length, decor(byName('Default')).length]);
    expect('le pied de page écrit son texte', /Pied de test/.test(x.stylesXml));
    const background = byName('Default');
    const backgroundStyle = x.named[attr(background, 'draw', 'style-name')];
    expect('le fond est celui du thème (#fdf6e3)', backgroundStyle && /^#fdf6e3$/i.test(attr(kids(backgroundStyle, 'style', 'drawing-page-properties')[0], 'draw', 'fill-color')), backgroundStyle && backgroundStyle.outerHTML);
    const title = x.shapes(x.pages[0])[0];
    const titleSpan = all(title, 'text', 'span')[0];
    expect('le titre est de la couleur du titre du thème (#0b3c5d)', /^#0b3c5d$/i.test(x.textProp(attr(titleSpan, 'text', 'style-name'), 'color')), x.textProp(attr(titleSpan, 'text', 'style-name'), 'color'));
    const text = x.shapes(x.pages[0])[1];
    const textSpan = all(text, 'text', 'span')[0];
    expect('le texte est de la couleur du texte du thème (#1f2937)', /^#1f2937$/i.test(x.textProp(attr(textSpan, 'text', 'style-name'), 'color')), x.textProp(attr(textSpan, 'text', 'style-name'), 'color'));
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 6. Le compte rendu, le nom du fichier, l'aller-retour
  // ============================================================================================================================================================================================
  add('odpExport_what_is_not_carried_over_is_counted_in_both_languages', 'ce que le fichier ne reprend pas est compté, une fois par genre, avec sa phrase en français et en anglais : animations, objets masqués, transition remplacée, action non reprise', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    const hiddenFrame = '<div class="pp-free-frame" role="group" data-ff-x="60" data-ff-y="60" data-ff-w="100" data-ff-h="40" data-ff-shape="rect" data-ff-fill="#fff" data-ff-hidden="1"><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>caché</p></div></div></div>';
    const x = await exportDeck(slideOne(
      props(' data-trans="zoom"'), '<h2>Un</h2>', frame(420, 400, 150, 40, linked('pp:back'), '<p>Bouton</p>'), hiddenFrame));
    const count = key => (x.report.find(entry => entry.key === key) || {}).n || 0;
    expect('une transition remplacée', count('transitions') === 1, x.report);
    expect('une action non reprise', count('actions') === 1, x.report);
    expect('chaque genre n\'a qu\'une ligne', new Set(x.report.map(entry => entry.key)).size === x.report.length, x.report);
    const KEYS = ['animations', 'hiddenObjects', 'transitions', 'shading', 'compoundLines', 'actions'];
    for (const lang of ['fr', 'en']) {
      await inLang(lang, async () => {
        KEYS.forEach((key) => {
          const text = I18n.t('odf.export.lost.' + key, { n: 2 });
          expect(lang + ' : la phrase « ' + key + ' » existe et dit le nombre', text && text.indexOf('odf.export.lost') < 0 && /2/.test(text), text);
        });
      });
    }
    expect('FR et EN ne disent pas la même chose', I18n.t('odf.export.lost.actions', { n: 1 }) !== undefined, '');
    return result(bad);
  });

  add('odpExport_a_row_gives_its_filename_and_its_variables', 'pour une ligne : les variables sont remplacées par les valeurs de la ligne, le nom du fichier suit le modèle de nom, le rapport est celui du fichier', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    await ready();
    const chip = `<span class="var-badge" data-table="${TABLE}" data-column="Nom" data-key="${TABLE}.Nom"></span>`;
    const made = await OdpExport.getOdpBlobForRecord(`<h1>${chip}</h1><p>Bonjour ${chip}</p>`, TABLE, RECORD, 'Diapo {Nom}', null, marginsOf());
    const x = await openOdp(made);
    expect('le texte porte la valeur de la ligne', /Alice Martin/.test(x.contentXml) && !/var-badge/.test(x.contentXml), x.contentXml.slice(x.contentXml.indexOf('<office:body>'), x.contentXml.indexOf('<office:body>') + 400));
    expect('le nom du fichier suit le modèle de nom', typeof made.filename === 'string' && made.filename.length > 0, made.filename);
    expect('le blob est une présentation OpenDocument', made.blob.type === OdpExport.MIME && OdpExport.MIME === 'application/vnd.oasis.opendocument.presentation', made.blob.type);
    expect('le rapport est une liste', Array.isArray(made.report), made.report);
    return result(bad);
  });

  add('odpExport_the_file_is_read_back_by_the_import', 'l\'aller-retour : l\'import OpenDocument relit le fichier écrit - mêmes diapositives, même texte, mêmes formes, le tableau et l\'image, le fond, les notes et le passage', async (h) => {
    const { bad, expect } = checker();
    await seed(h);
    await ready();
    const html = slideOne(
      props(' data-trans="push" data-trans-from="l" data-trans-dur="900" data-bg="#fff7e6" data-notes="Une note"'),
      `<h1>${sz(44, 'Titre un')}</h1>`, `<p>${sz(20, 'Du <strong>gras</strong> et <a href="https://example.org/a">un lien</a>')}</p>`,
      frame(60, 260, 260, 120, RECT, '<p>Dans la forme</p>'),
      line(60, 420, 300, 0, ' data-ff-tail="triangle"'), BREAK,
      '<h2>Tableau</h2><table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>',
      `<p><img class="editor-image" alt="Un point rouge" src="data:image/png;base64,${RED_PNG}" style="width: 60px" data-layer="normal" data-wrap="inline"></p>`);
    const made = await OdpExport.fromHtml(html, { marginsPt: marginsOf(), title: 'essai' });
    const back = await OdpImport.fromBuffer(await made.blob.arrayBuffer());
    expect('deux diapositives', back.slideCount === 2, back.slideCount);
    expect('la page est 16:9 en paysage', back.page.format === PageLayout.SLIDE_FORMAT && back.page.orientation === 'landscape', back.page);
    const first = new DOMParser().parseFromString('<body>' + back.slideTexts[0], 'text/html').body;
    expect('le titre et le texte reviennent', /Titre un/.test(first.textContent) && /gras/.test(first.textContent) && /un lien/.test(first.textContent), first.textContent);
    expect('le lien revient avec son adresse', !!first.querySelector('a[href="https://example.org/a"]'));
    expect('la forme revient avec son texte', Array.from(first.querySelectorAll('.pp-free-frame')).some(el => /Dans la forme/.test(el.textContent)), first.innerHTML.slice(0, 300));
    expect('le trait revient avec sa pointe', !!first.querySelector('.pp-free-frame[data-ff-shape="line"][data-ff-tail]'));
    const marker = first.querySelector('.pp-slide-props');
    expect('le repère de la diapositive revient : fond, notes, passage', marker && /fff7e6/i.test(marker.getAttribute('data-bg') || '') && /Une note/.test(marker.getAttribute('data-notes') || '') && marker.getAttribute('data-trans') === 'push', marker && marker.outerHTML);
    const second = new DOMParser().parseFromString('<body>' + back.slideTexts[1], 'text/html').body;
    expect('le tableau revient (deux cases)', second.querySelectorAll('td, th').length === 2 && /A/.test(second.textContent) && /B/.test(second.textContent), second.innerHTML.slice(0, 300));
    expect('l\'image revient avec son texte alternatif', !!second.querySelector('img[alt="Un point rouge"]'), second.innerHTML.slice(0, 400));
    expect('rien n\'est perdu dans l\'aller-retour', !(back.report || []).length, back.report);
    return result(bad);
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.odpExport = cases;
})();
