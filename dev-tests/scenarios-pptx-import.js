// Suite "pptxImport" - l'IMPORT PowerPoint (js/pptx-import.js) : un fichier .pptx devient le HTML d'une NOUVELLE présentation (demande du 22/10, carte « Import PowerPoint », 6e lot de la parité PowerPoint),
// lu ici dans le VRAI éditeur quand le cas le demande (Editor.setHTML puis Editor.getHTML : ce qu'il garde est ce que la personne voit). Le geste complet (ligne « Importer un PowerPoint… » du menu « + », vrai
// sélecteur de fichier, question « Modifications non enregistrées », fenêtre de ce qui n'a pas été repris, messages d'état) est à la vraie souris dans dev-tests/verify-pptx-import-mouse.mjs (groupe
// Node « pptxImportMouse »).
//
// Les fichiers de l'essai sont ÉCRITS ICI, partie par partie (un paquet OPC : JSZip, du XML comme PowerPoint l'écrit : thème, masque, mise en page, diapositives, notes, images) : chaque cas dit ce que son fichier
// contient et ce que l'import doit en faire, sans fichier binaire dans le dépôt. Ce que les cas vérifient :
//  - le fichier : la page de l'éditeur (16:9, 4:3, portrait, une page trop grande ramenée à la plus grande que l'éditeur accepte), une diapositive par saut de page, un fichier refusé (pas un zip, un zip sans
//    présentation, un ancien .ppt, une présentation sans diapositive, un fichier trop gros) avec son code d'erreur ; rien d'autre ne fait échouer l'import ;
//  - les objets : un texte posé, une forme (rotation, fond, trait, forme voisine comptée), un trait ou une flèche (bouts, retournement, connecteur coudé compté), une image (rognée, retournée, étirée aux proportions de
//    sa boîte, au pixel près), un groupe (ses enfants à leur place), un rectangle trop mince (un trait) ;
//  - l'héritage : un espace réservé prend sa place, sa taille, sa couleur, son alignement et ses puces de la mise en page puis du masque ; les couleurs du thème et leurs retouches ; l'inversion des couleurs du masque ;
//  - le texte : gras, italique, souligné, barré, exposant, couleur, SURLIGNAGE, taille, lien, numéro de diapositive, alignement, puces et numérotations imbriquées, retour à la ligne, tabulation, majuscules ;
//  - la diapositive : son fond (uni, hérité, dégradé en couleur moyenne, image derrière le texte), ses notes, sa transition (sens, durée, effet inconnu compté), le décor du masque et de la mise en page recopié DERRIÈRE
//    le texte (sauf là où le fichier le masque), les espaces réservés du masque jamais recopiés ;
//  - le texte tel que l'éditeur le pose : réduit pour tenir dans sa boîte, boîte descendue pour un texte en bas, tableaux dans le texte de la diapositive à leur place au point près (marges de la page, lignes
//    vides), plusieurs tableaux (le moins partagé est rangé à la place des autres et compté) ;
//  - le rapport : chaque genre d'objet qui n'arrive pas tel quel est compté (animations, graphiques, schémas, objets incorporés, vidéos, tracés, équations, commentaires, images illisibles, formes, connecteurs, dégradés,
//    transitions, liens vers une diapositive, diapositives masquées, objets du masque, diapositives en trop) ; puis, demande du 22/10 « Import PowerPoint sans perte », chantier 1 « le compte rendu dit tout »,
//    chaque chose que le fichier demande et que l'éditeur ne sait pas encore faire (interligne, espaces et retraits, tabulations, sens d'écriture, colonnes, vertical, espacement des caractères, petites capitales,
//    ombre ou contour des lettres, dégradé, souligné, polices absentes, puces, tirets, trait double, bouts, ombre, lueur, reflet, relief, transparence, motif, image en fond, objet masqué, bulle, liens et textes
//    alternatifs, images en forme ou réglées, fonds de case et de diapositive en motif, minutage, sections, thème) : un fichier par famille dont le rapport est EXACTEMENT ce que son seul objet demande, un cas « rien à
//    dire » (ce que l'éditeur fait lui-même ne donne aucune ligne), un cas « une fois » (un objet n'est compté qu'une fois, quel que soit le nombre de passes), un fichier qui demande tout, les lignes dans les deux langues ;
//  - l'aller-retour : une présentation écrite par l'export PowerPoint de l'éditeur (js/pptx-export.js) puis importée redonne les mêmes cadres, formes, traits, fond, notes et transition.
(function () {
  const cases = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const add = (id, description, run) => cases.push({ id, description, run });
  const near = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
  // Une série de contrôles : `expect(label, condition, detail)`, les écarts sont dits un par un.
  const checker = () => {
    const bad = [];
    return { bad, expect: (label, condition, detail) => { if (!condition) bad.push(label + (detail === undefined ? '' : ' : ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); } };
  };
  const failure = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const ready = () => ExportEngines.ensure('pptxImport');

  // --- Le paquet : ce que PowerPoint écrit, en plus court ---------------------------------------------------------------------------------------------------------------------------
  const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const NS = `xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"`;
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const emu = pt => Math.round(pt * 12700);
  const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tree = shapes => `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree>`;
  const rels = list => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(r => `<Relationship Id="${r.id}" Type="${REL}${r.type}" Target="${esc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;
  const COLORS = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
  const CLR_MAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
  const themeXml = (colors, effects = '<a:effectStyle><a:effectLst/></a:effectStyle>') => {
    const c = Object.assign({}, COLORS, colors);
    const phLine = w => `<a:ln w="${w}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`;
    const phFill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    return `${HEAD}<a:theme xmlns:a="${A_NS}" name="Essai"><a:themeElements><a:clrScheme name="Essai">${Object.keys(c).map(k => `<a:${k}><a:srgbClr val="${c[k]}"/></a:${k}>`).join('')}</a:clrScheme>`
      + '<a:fontScheme name="Essai"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>'
      + `<a:fmtScheme name="Essai"><a:fillStyleLst>${phFill}${phFill}${phFill}</a:fillStyleLst><a:lnStyleLst>${phLine(9525)}${phLine(25400)}${phLine(38100)}</a:lnStyleLst><a:effectStyleLst>${effects}</a:effectStyleLst><a:bgFillStyleLst>${phFill}${phFill}${phFill}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  };
  const masterXml = m => `${HEAD}<p:sldMaster ${NS}><p:cSld>${m.bg || ''}${tree(m.shapes || '')}</p:cSld><p:clrMap ${m.clrMap || CLR_MAP}/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>`
    + `<p:txStyles><p:titleStyle>${m.title || ''}</p:titleStyle><p:bodyStyle>${m.body || ''}</p:bodyStyle><p:otherStyle>${m.other || ''}</p:otherStyle></p:txStyles></p:sldMaster>`;
  const layoutXml = l => `${HEAD}<p:sldLayout ${NS}${l.showMasterSp === false ? ' showMasterSp="0"' : ''}><p:cSld>${l.bg || ''}${tree(l.shapes || '')}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const slideXml = s => `${HEAD}<p:sld ${NS}${s.show === false ? ' show="0"' : ''}${s.showMasterSp === false ? ' showMasterSp="0"' : ''}><p:cSld>${s.bg || ''}${tree(s.shapes || '')}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${s.transition || ''}${s.timing || ''}</p:sld>`;
  const notesXml = lines => `${HEAD}<p:notes ${NS}><p:cSld>${tree('<p:sp><p:nvSpPr><p:cNvPr id="2" name="Image de la diapositive"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
    + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${lines.map(l => `<a:p><a:r><a:rPr lang="fr-FR"/><a:t>${esc(l)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`)}</p:cSld></p:notes>`;
  // Le fichier : `size` (points), `slides` ({ shapes, bg, notes (lignes), transition, timing, show, showMasterSp, rels (liens de la diapositive : { id, type, target, external }) }), `master` et `layout` ({ shapes, bg,
  // clrMap, title, body, other, showMasterSp, rels }), `colors` (le thème), `effects` (ses styles d'effet : le deuxième est l'`effectRef idx="2"` d'un objet), `media` ({ nom: base64 }), `defaultText` (le style par défaut
  // de la présentation), `presentationExt` (la fin de la présentation : ses sections), `parts` (d'autres parties du paquet : { chemin: texte }).
  async function pptx({ size = [960, 540], slides = [{}], master = {}, layout = {}, colors, effects, media = {}, defaultText = '', presentationExt = '', parts = {} } = {}) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = new JSZip();
    const put = (name, text) => zip.file(name, text);
    put('[Content_Types].xml', `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="emf" ContentType="image/x-emf"/></Types>`);
    put('_rels/.rels', rels([{ id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' }]));
    put('ppt/presentation.xml', `${HEAD}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${emu(size[0])}" cy="${emu(size[1])}"/><p:notesSz cx="6858000" cy="9144000"/>${defaultText}${presentationExt}</p:presentation>`);
    put('ppt/_rels/presentation.xml.rels', rels([{ id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' }].concat(slides.map((s, i) => ({ id: `rId${i + 2}`, type: 'slide', target: `slides/slide${i + 1}.xml` })))));
    put('ppt/slideMasters/slideMaster1.xml', masterXml(master));
    put('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }, { id: 'rId2', type: 'theme', target: '../theme/theme1.xml' }].concat(master.rels || [])));
    put('ppt/slideLayouts/slideLayout1.xml', layoutXml(layout));
    put('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }].concat(layout.rels || [])));
    put('ppt/theme/theme1.xml', themeXml(colors, effects));
    slides.forEach((s, i) => {
      const list = [{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }].concat(s.rels || []);
      if (s.notes) {
        list.push({ id: 'rId90', type: 'notesSlide', target: `../notesSlides/notesSlide${i + 1}.xml` });
        put(`ppt/notesSlides/notesSlide${i + 1}.xml`, notesXml(s.notes));
      }
      put(`ppt/slides/slide${i + 1}.xml`, slideXml(s));
      put(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels(list));
    });
    Object.keys(media).forEach(name => zip.file('ppt/media/' + name, media[name], { base64: true }));
    Object.keys(parts).forEach(name => put(name, parts[name]));
    return zip.generateAsync({ type: 'arraybuffer' });
  }
  const IMAGE_REL = (id, name) => ({ id, type: 'image', target: `../media/${name}` });
  // Les objets d'une diapositive.
  const xfrm = (x, y, w, h, attrs = '', tag = 'a:xfrm') => `<${tag}${attrs ? ' ' + attrs : ''}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></${tag}>`;
  const solid = hex => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
  const scheme = (name, mods = '') => `<a:solidFill><a:schemeClr val="${name}">${mods}</a:schemeClr></a:solidFill>`;
  const ln = (widthPt, fill = solid('000000'), ends = '') => `<a:ln w="${emu(widthPt)}">${fill}${ends}</a:ln>`;
  const run = (text, attrs = '', inner = '') => `<a:r><a:rPr lang="fr-FR"${attrs ? ' ' + attrs : ''}>${inner}</a:rPr><a:t>${esc(text)}</a:t></a:r>`;
  const para = (content, props = '', inner = '') => `<a:p>${props || inner ? `<a:pPr${props ? ' ' + props : ''}>${inner}</a:pPr>` : ''}${content}</a:p>`;
  // `cnv` / `cnvInner` : les attributs (hidden="1", descr="...") et les enfants (un lien) des propriétés de l'objet ; `effects` : ce qui suit son trait dans `p:spPr` (ombre, lueur, relief).
  const cNvPr = (id, name, cnv = '', cnvInner = '') => `<p:cNvPr id="${id}" name="${esc(name)}"${cnv ? ' ' + cnv : ''}${cnvInner ? `>${cnvInner}</p:cNvPr>` : '/>'}`;
  function sp({ id = 2, name = 'Objet', x, y, w, h, prst = 'rect', geom = '', fill = '', line = '', effects = '', xf = '', ph = '', txBox = false, body = '', bodyXml = '', lst = '', text = '', style = '', cnv = '', cnvInner = '' } = {}) {
    const geometry = geom || (prst ? `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>` : '');
    return `<p:sp><p:nvSpPr>${cNvPr(id, name, cnv, cnvInner)}<p:cNvSpPr${txBox ? ' txBox="1"' : ''}/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${x === undefined ? '' : xfrm(x, y, w, h, xf)}${geometry}${fill}${line}${effects}</p:spPr>${style}`
      + `<p:txBody><a:bodyPr${body ? ' ' + body : ''}>${bodyXml}</a:bodyPr>${lst ? `<a:lstStyle>${lst}</a:lstStyle>` : '<a:lstStyle/>'}${text || '<a:p><a:endParaRPr lang="fr-FR"/></a:p>'}</p:txBody></p:sp>`;
  }
  const textBox = (x, y, w, h, text, extra = {}) => sp(Object.assign({ name: 'Zone de texte', x, y, w, h, txBox: true, fill: '<a:noFill/>', text }, extra));
  const cxn = ({ id = 3, name = 'Connecteur', x, y, w, h, xf = '', prst = 'straightConnector1', line = ln(1), effects = '', cnv = '', cnvInner = '' } = {}) =>
    `<p:cxnSp><p:nvCxnSpPr>${cNvPr(id, name, cnv, cnvInner)}<p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(x, y, w, h, xf)}<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${line}${effects}</p:spPr></p:cxnSp>`;
  // `geom` : la forme de l'image (un rectangle, sauf rognage en forme) ; `spPrInner` : sa bordure et ses effets ; `cnvInner` : son lien.
  const pic = ({ id = 4, name = 'Image', x, y, w, h, rid = 'rId2', xf = '', crop = '', blip = '', descr = '', nvPr = '', geom = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>', spPrInner = '', cnvInner = '' } = {}) =>
    `<p:pic><p:nvPicPr>${cNvPr(id, name, `descr="${esc(descr)}"`, cnvInner)}<p:cNvPicPr/><p:nvPr>${nvPr}</p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}">${blip}</a:blip>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(x, y, w, h, xf)}${geom}${spPrInner}</p:spPr></p:pic>`;
  const grp = ({ id = 5, x, y, w, h, cx, cy, cw, ch, xf = '', children } = {}) =>
    `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Groupe"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm${xf ? ' ' + xf : ''}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/><a:chOff x="${emu(cx)}" y="${emu(cy)}"/><a:chExt cx="${emu(cw)}" cy="${emu(ch)}"/></a:xfrm></p:grpSpPr>${children}</p:grpSp>`;
  // Un tableau : `cols` (largeurs, points), `rows` ([{ h, cells: [{ text, span, rowSpan, hMerge, vMerge, fill, anchor, attrs, paras (les paragraphes de la case, écrits tels quels) }] }]).
  // `fillXml` : le fond de la case écrit tel quel (un dégradé, un motif) ; `vert` : le sens du texte (vert270...).
  const cell = (c) => `<a:tc${c.span > 1 ? ` gridSpan="${c.span}"` : ''}${c.rowSpan > 1 ? ` rowSpan="${c.rowSpan}"` : ''}${c.hMerge ? ' hMerge="1"' : ''}${c.vMerge ? ' vMerge="1"' : ''}><a:txBody><a:bodyPr/><a:lstStyle/>${c.paras || para(c.text ? run(c.text, c.attrs || 'sz="1200"') : '')}</a:txBody><a:tcPr${c.anchor ? ` anchor="${c.anchor}"` : ''}${c.vert ? ` vert="${c.vert}"` : ''}>${c.fillXml || (c.fill ? solid(c.fill) : '')}</a:tcPr></a:tc>`;
  const table = ({ id = 6, x, y, cols, rows, flags = '', style = '' } = {}) => {
    const w = cols.reduce((a, b) => a + b, 0);
    const h = rows.reduce((a, row) => a + row.h, 0);
    return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Tableau"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>${xfrm(x, y, w, h, '', 'p:xfrm')}`
      + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${flags ? ' ' + flags : ''}>${style}</a:tblPr><a:tblGrid>${cols.map(c => `<a:gridCol w="${emu(c)}"/>`).join('')}</a:tblGrid>`
      + `${rows.map(row => `<a:tr h="${emu(row.h)}">${row.cells.map(cell).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  };
  // Une image de l'essai : `w` x `h` points, peinte par `paint(g)` (canvas), en base64.
  const png = (w, h, paint) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    paint(canvas.getContext('2d'));
    return canvas.toDataURL('image/png').split(',')[1];
  };
  // Rouge à gauche, bleu à droite : de quoi voir un rognage ou un retournement aux pixels.
  const TWO_TONE = () => png(40, 20, (g) => { g.fillStyle = '#ff0000'; g.fillRect(0, 0, 20, 20); g.fillStyle = '#0000ff'; g.fillRect(20, 0, 20, 20); });

  // --- Ce que l'import a écrit, lu comme l'éditeur le lit -------------------------------------------------------------------------------------------------------------------------
  const body = html => new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
  // Les diapositives du texte importé : pour chacune son repère (ce qu'en lit SlideProps), ses cadres (ce qu'en lit FreeFrame, avec leur texte), ses tableaux et le reste de son texte.
  function slidesOf(html) {
    const slides = [{ props: null, frames: [], tables: [], flow: [] }];
    Array.from(body(html).children).forEach((el) => {
      if (el.classList.contains('page-break-marker')) { slides.push({ props: null, frames: [], tables: [], flow: [] }); return; }
      const slide = slides[slides.length - 1];
      if (el.classList.contains('pp-slide-props')) slide.props = SlideProps.attrsOf(el);
      else if (el.classList.contains('pp-free-frame')) {
        const inner = el.querySelector('.pp-free-frame-content');
        slide.frames.push(Object.assign(FreeFrame.measuresOf(el), { el, text: inner ? inner.textContent : '', inner: inner ? inner.innerHTML : '' }));
      } else if (el.tagName === 'TABLE') slide.tables.push(el);
      else slide.flow.push(el);
    });
    return slides;
  }
  const only = frames => frames.filter(frame => frame.layer !== 'behind');
  const behind = frames => frames.filter(frame => frame.layer === 'behind');
  const run1 = async (options) => { await ready(); return PptxImport.fromBuffer(await pptx(options)); };
  const reportOf = r => Object.fromEntries(r.report.map(item => [item.key, item.n]));
  // Ce que l'éditeur fait du texte importé : la page du fichier, puis le texte.
  async function inEditor(h, imported) {
    await h.resetEditor();
    // La feuille de la page (largeur du papier, marges) n'existe que sous `a4-preview`, que resetEditor() retire (README, piège de la classe).
    document.getElementById('editor-container').classList.add('a4-preview');
    PageLayout.setMarginsMm(Object.assign({}, imported.page));
    Editor.setHTML(imported.html, null);
    await sleep(600);
    return Editor.getHTML();
  }
  // Un pixel d'une image (adresse de données) : [r, v, b, a].
  async function pixel(data, x, y) {
    const img = await ImageIo.load(data);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(x, y, 1, 1).data);
  }
  const imageSize = async (data) => { const img = await ImageIo.load(data); return { w: img.naturalWidth, h: img.naturalHeight }; };
  const dataOf = frame => (frame.el.querySelector('img') || { getAttribute: () => null }).getAttribute('src');
  const sameColor = (got, want, tolerance = 6) => got && want.every((c, i) => Math.abs(got[i] - c) <= tolerance);

  // --- Le fichier ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  add('pptx_import_a_file_becomes_slides_one_per_page_break',
    'Un fichier de trois diapositives 16:9 devient trois diapositives séparées par des sauts de page, sur la page libre de 960 x 540 points de l\'éditeur (190,5 x 338,7 mm), un texte posé à sa place au point près',
    async () => {
      const r = await run1({ slides: [{ shapes: textBox(100, 80, 300, 60, para(run('Bonjour', 'sz="2000"'))) }, { shapes: '' }, { shapes: textBox(20, 30, 200, 40, para(run('Trois', 'sz="2000"'))) }] });
      const { bad, expect } = checker();
      expect('trois diapositives', r.slideCount === 3, r.slideCount);
      expect('la page : paysage, format libre 190.5x338.7 (16:9)', r.page.orientation === 'landscape' && r.page.format === PageLayout.SLIDE_FORMAT, r.page);
      const slides = slidesOf(r.html);
      expect('trois diapositives dans le texte, séparées par deux sauts de page', slides.length === 3 && (r.html.match(/page-break-marker/g) || []).length === 2, slides.length);
      const text = slides[0].frames[0];
      expect('le texte posé : x 100, y 80, largeur 300, hauteur 60 (les marges intérieures de PowerPoint sont celles d\'un cadre : rien à compenser)',
        !!text && near(text.x, 100) && near(text.y, 80) && near(text.w, 300) && near(text.h, 60) && /Bonjour/.test(text.text), text && { x: text.x, y: text.y, w: text.w, h: text.h });
      expect('le texte est à la taille du fichier (20 pt)', /font-size: 20pt/.test(text ? text.inner : ''), text && text.inner);
      expect('la deuxième diapositive, sans objet, n\'a aucun cadre', slides[1].frames.length === 0);
      expect('la troisième garde son texte', slides[2].frames.length === 1 && /Trois/.test(slides[2].frames[0].text));
      expect('rien à dire dans le rapport', r.report.length === 0, r.report);
      return result(bad);
    });

  add('pptx_import_page_formats_four_three_portrait_and_too_large',
    'La page suit la taille des diapositives : 4:3 (720 x 540 pt), portrait, et une page plus grande que l\'éditeur n\'en accepte est ramenée à la plus grande, le contenu à l\'échelle',
    async () => {
      const { bad, expect } = checker();
      const four = await run1({ size: [720, 540], slides: [{ shapes: textBox(72, 54, 200, 40, para(run('Quatre tiers', 'sz="2000"'))) }] });
      expect('4:3 : paysage, 190.5x254', four.page.orientation === 'landscape' && four.page.format === '190.5x254', four.page);
      const f = slidesOf(four.html)[0].frames[0];
      expect('4:3 : le texte reste à ses 72 x 54 points', f && near(f.x, 72) && near(f.y, 54) && near(f.w, 200), f && { x: f.x, y: f.y, w: f.w });
      const portrait = await run1({ size: [540, 960], slides: [{ shapes: '' }] });
      expect('portrait : le sens est portrait, la page 190.5x338.7', portrait.page.orientation === 'portrait' && portrait.page.format === '190.5x338.7', portrait.page);
      // 40 pouces x 22,5 pouces : 2 880 x 1 620 points, bien au delà des 558,8 mm (1 584 points) que l'éditeur accepte au plus.
      const big = await run1({ size: [2880, 1620], slides: [{ shapes: sp({ x: 288, y: 162, w: 1440, h: 200, fill: solid('FFC000'), text: para(run('Grande page', 'sz="4000"')) }) }] });
      const size = PageLayout.pageSizePtFor(big.page.orientation, big.page.format);
      expect('page trop grande : le grand côté est ramené au plus grand que l\'éditeur accepte (558,8 mm), l\'autre le suit : les proportions 16:9 sont gardées (pas un carré)',
        near(size.width, 1584, 1) && near(size.height / size.width, 9 / 16, 0.004), { size, format: big.page.format });
      const g = slidesOf(big.html)[0].frames[0];
      const k = size.width / 2880;
      expect('page trop grande : la boîte est à l\'échelle de la page (x 288 → 288 k, largeur 1 440 → 1 440 k)', g && near(g.x, 288 * k, 1) && near(g.w, 1440 * k, 1.5), g && { x: g.x, w: g.w, k });
      expect('page trop grande : le texte est à l\'échelle (40 pt → 40 k)', g && new RegExp('font-size: ' + (Math.round(40 * k * 100) / 100) + 'pt').test(g.inner), g && g.inner);
      return result(bad);
    });

  add('pptx_import_refused_files_have_their_error_code',
    'Un fichier qui n\'est pas une présentation est refusé avec son code : pas un zip (unreadable), un zip sans présentation (unreadable), un ancien .ppt (legacy), sans diapositive (empty), trop gros (tooBig) ; un objet illisible n\'en est pas un',
    async () => {
      await ready();
      const { bad, expect } = checker();
      const codeOf = async (buffer) => { const e = await failure(() => PptxImport.fromBuffer(buffer)); return e ? e.code : 'aucune erreur'; };
      expect('un texte : unreadable', (await codeOf(new TextEncoder().encode('Bonjour, ceci n\'est pas un zip').buffer)) === 'unreadable');
      await ExportCommon.ensureJsZipLoaded();
      const empty = new JSZip();
      empty.file('lisez-moi.txt', 'rien');
      expect('un zip sans présentation : unreadable', (await codeOf(await empty.generateAsync({ type: 'arraybuffer' }))) === 'unreadable');
      const legacy = new Uint8Array(2048);
      legacy.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
      expect('un fichier d\'avant 2007 (ou protégé par un mot de passe) : legacy', (await codeOf(legacy.buffer)) === 'legacy');
      expect('une présentation sans diapositive : empty', (await codeOf(await pptx({ slides: [] }))) === 'empty');
      const e = await failure(() => PptxImport.fromFile({ size: PptxImport.MAX_FILE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) }));
      expect('trop gros : tooBig, avec la taille et la limite', !!e && e.code === 'tooBig' && e.size === PptxImport.MAX_FILE_BYTES + 1 && e.max === PptxImport.MAX_FILE_BYTES, e && { code: e.code, size: e.size, max: e.max });
      const unreadable = await failure(() => PptxImport.fromFile({ size: 10, arrayBuffer: async () => { throw new Error('disque'); } }));
      expect('un fichier qui ne se lit pas : unreadable', !!unreadable && unreadable.code === 'unreadable', unreadable && unreadable.code);
      // Une diapositive dont le XML est cassé ne fait pas échouer l'import : elle est comptée, les autres arrivent.
      const zip = await JSZip.loadAsync(await pptx({ slides: [{ shapes: textBox(10, 10, 200, 40, para(run('Reste', 'sz="2000"'))) }, { shapes: '' }] }));
      zip.file('ppt/slides/slide2.xml', '<p:sld><oups');
      const r = await PptxImport.fromBuffer(await zip.generateAsync({ type: 'arraybuffer' }));
      expect('une diapositive illisible : comptée, les deux diapositives arrivent', r.slideCount === 2 && reportOf(r).unreadable === 1 && slidesOf(r.html)[0].frames.length === 1, r);
      return result(bad);
    });

  // --- L'héritage : la place, le style et les puces d'un espace réservé -------------------------------------------------------------------------------------------------------------------
  add('pptx_import_placeholders_inherit_place_style_and_bullets',
    'Un titre et un texte sans position ni style prennent leur place, leur taille, leur gras, leur couleur du thème, leur alignement et leurs puces de la mise en page puis du masque ; les niveaux de puces sont emboîtés',
    async () => {
      const masterShapes = sp({ id: 2, name: 'Titre', x: 50, y: 30, w: 860, h: 70, ph: '<p:ph type="title"/>', prst: '', text: para(run('Cliquez pour modifier le titre')) })
        + sp({ id: 3, name: 'Texte', x: 50, y: 130, w: 860, h: 360, ph: '<p:ph type="body" idx="1"/>', prst: '', text: para(run('Cliquez pour modifier le texte')) });
      const layoutShapes = sp({ id: 2, name: 'Texte', x: 60, y: 140, w: 840, h: 340, ph: '<p:ph type="body" idx="1"/>', prst: '', text: para(run('Texte de la mise en page')) });
      const r = await run1({
        master: {
          shapes: masterShapes,
          title: `<a:lvl1pPr algn="ctr"><a:defRPr sz="4400" b="1">${scheme('accent1')}</a:defRPr></a:lvl1pPr>`,
          body: `<a:lvl1pPr><a:buChar char="•"/><a:defRPr sz="2800"/></a:lvl1pPr><a:lvl2pPr><a:buChar char="–"/><a:defRPr sz="2400"/></a:lvl2pPr>`,
        },
        layout: { shapes: layoutShapes },
        slides: [{
          shapes: sp({ id: 2, name: 'Titre 1', prst: '', ph: '<p:ph type="title"/>', text: para(run('Titre du fichier')) })
            + sp({ id: 3, name: 'Espace réservé du contenu 2', prst: '', ph: '<p:ph idx="1"/>', text: para(run('Premier')) + para(run('Sous-point'), 'lvl="1"') + para(run('Deuxième')) }),
        }],
      });
      const { bad, expect } = checker();
      const [title, content] = slidesOf(r.html)[0].frames;
      expect('deux cadres (titre, texte), pas un de plus : l\'espace réservé du masque et celui de la mise en page ne sont pas recopiés', slidesOf(r.html)[0].frames.length === 2, slidesOf(r.html)[0].frames.map(f => f.text));
      expect('le titre prend la place du masque (la mise en page n\'en a pas) : 50, 30, 860 x 70', !!title && near(title.x, 50) && near(title.y, 30) && near(title.w, 860) && near(title.h, 70), title && { x: title.x, y: title.y, w: title.w, h: title.h });
      expect('le titre : 44 pt, gras, centré, de la couleur accent1 du thème (4472c4)', !!title && /font-size: 44pt; color: #4472c4/.test(title.inner) && /<strong>/.test(title.inner) && /text-align: center/.test(title.inner), title && title.inner);
      expect('le texte prend la place de la MISE EN PAGE (60, 140, 840 x 340), pas celle du masque', !!content && near(content.x, 60) && near(content.y, 140) && near(content.w, 840) && near(content.h, 340), content && { x: content.x, y: content.y, w: content.w, h: content.h });
      const list = content && content.el.querySelector('ul');
      expect('trois éléments de liste, dont le sous-point emboîté sous « Premier » : <ul><li>Premier<ul><li>Sous-point</li></ul></li><li>Deuxième</li></ul>',
        !!list && list.querySelectorAll(':scope > li').length === 2 && /^Premier/.test(list.children[0].textContent) && !!list.children[0].querySelector(':scope > ul > li') && /Deuxième/.test(list.children[1].textContent), content && content.inner);
      expect('les tailles viennent des niveaux du masque : 28 pt, puis 24 pt pour le sous-point', !!content && /font-size: 28pt">Premier/.test(content.inner) && /font-size: 24pt">Sous-point/.test(content.inner) && /font-size: 28pt">Deuxième/.test(content.inner), content && content.inner);
      return result(bad);
    });

  add('pptx_import_theme_colors_with_their_modifiers_and_the_inverted_color_map',
    'Les couleurs du thème (accent, texte, fond, retouches « plus sombre » et « plus clair », couleur système, nommée) deviennent des couleurs fixes ; la correspondance inversée d\'un masque sombre inverse le texte et le fond',
    async () => {
      const rect = (i, fill) => sp({ id: 10 + i, name: 'R' + i, x: 20 + 130 * i, y: 40, w: 110, h: 60, fill, text: para(run('x')) });
      const r = await run1({
        colors: { accent1: 'FF0000' },
        slides: [{
          shapes: [scheme('accent1'), scheme('accent1', '<a:lumMod val="50000"/>'), scheme('accent1', '<a:lumMod val="20000"/><a:lumOff val="80000"/>'), scheme('tx1'), scheme('bg2'),
            '<a:solidFill><a:sysClr val="windowText" lastClr="000000"/></a:solidFill>', '<a:solidFill><a:prstClr val="red"/></a:solidFill>'].map((fill, i) => rect(i, fill)).join(''),
        }],
      });
      const { bad, expect } = checker();
      const fills = slidesOf(r.html)[0].frames.map(f => f.fill);
      expect('accent1 (FF0000 dans ce thème) : ff0000 ; « plus sombre 50 % » : 800000 ; « plus clair 80 % » : ffcccc ; texte 1 : 000000 ; fond 2 : e7e6e6 ; couleur système : 000000 ; nommée « red » : ff0000',
        fills.join(',') === '#ff0000,#800000,#ffcccc,#000000,#e7e6e6,#000000,#ff0000', fills);
      // Un masque sombre : fond 1 et texte 1 sont échangés par la correspondance de couleurs.
      const dark = await run1({
        master: { clrMap: CLR_MAP.replace('bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"', 'bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"'), bg: '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>' },
        slides: [{ shapes: rect(0, scheme('tx1')) + rect(1, scheme('bg1')) }],
      });
      const d = slidesOf(dark.html)[0];
      expect('masque sombre : le fond de la diapositive est celui de « fond 1 », qui est le noir (dk1) : #000000', d.props && d.props.bg === '#000000', d.props);
      expect('masque sombre : « texte 1 » est le blanc du thème (lt1), « fond 1 » le noir', d.frames[0].fill === '#ffffff' && d.frames[1].fill === '#000000', d.frames.map(f => f.fill));
      return result(bad);
    });

  // --- Le texte --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  add('pptx_import_text_marks_highlight_links_lists_and_alignment',
    'Gras, italique, souligné, barré, exposant, couleur, taille, SURLIGNAGE, lien, majuscules, numéro de diapositive, retour à la ligne, alignement, puces (rond, carré, cases), numérotations (lettres, chiffres romains, départ) sont repris',
    async () => {
      const marks = para(
        run('Gras', 'b="1"') + run(' italique', 'i="1"') + run(' souligné', 'u="sng"') + run(' barré', 'strike="sngStrike"') + run(' exposant', 'baseline="30000"')
        + run(' rouge', 'sz="2400"', solid('C00000')) + run(' surligné', '', '<a:highlight><a:srgbClr val="FFFF00"/></a:highlight>') + run(' lien', '', '<a:hlinkClick r:id="rId2"/>') + run(' maj', 'cap="all"')
        + '<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="fr-FR"/><a:t>‹#›</a:t></a:fld>' + '<a:br/>' + run('Ligne deux') + run('\tTabulé'));
      const lists = para(run('Rond'), '', '<a:buChar char="o"/>') + para(run('Carré'), '', '<a:buChar char="§"/>') + para(run('À faire'), '', '<a:buChar char="☐"/>') + para(run('Fait'), '', '<a:buChar char="☑"/>')
        + para(run('Lettre c'), '', '<a:buAutoNum type="alphaLcPeriod" startAt="3"/>') + para(run('Lettre d'), '', '<a:buAutoNum type="alphaLcPeriod" startAt="3"/>')
        + para(run('Romain'), '', '<a:buAutoNum type="romanUcPeriod"/>') + para(run('Un'), '', '<a:buAutoNum type="arabicPeriod"/>');
      const aligns = para(run('Centré'), 'algn="ctr"') + para(run('Droite'), 'algn="r"') + para(run('Justifié'), 'algn="just"');
      const r = await run1({
        slides: [{
          rels: [{ id: 'rId2', type: 'hyperlink', target: 'https://example.org/page', external: true }],
          shapes: textBox(20, 10, 900, 90, marks) + textBox(20, 110, 440, 300, lists) + textBox(480, 110, 440, 100, aligns),
        }],
      });
      const { bad, expect } = checker();
      const [markFrame, listFrame, alignFrame] = slidesOf(r.html)[0].frames;
      const mark = (frame, selector) => Array.from(frame.el.querySelectorAll(selector)).map(n => n.textContent.trim()).join('|');
      expect('gras, italique, souligné, barré, exposant', mark(markFrame, 'strong') === 'Gras' && mark(markFrame, 'em') === 'italique' && mark(markFrame, 'u') === 'souligné' && mark(markFrame, 's') === 'barré' && mark(markFrame, 'sup') === 'exposant', markFrame.inner);
      expect('couleur et taille d\'une série : « rouge » à 24 pt en #c00000', /color: #c00000/.test(markFrame.inner) && /font-size: 24pt[^"]*">\s*rouge/.test(markFrame.inner), markFrame.inner);
      expect('le surlignage est repris : « surligné » sur fond #ffff00', /background-color: #ffff00">\s*surligné/.test(markFrame.inner), markFrame.inner);
      expect('le lien : l\'adresse du fichier, sur « lien »', mark(markFrame, 'a[href="https://example.org/page"]') === 'lien', markFrame.inner);
      expect('majuscules : « maj » devient « MAJ »', /MAJ/.test(markFrame.text) && !/ maj/.test(markFrame.text), markFrame.text);
      expect('le numéro de diapositive est la pastille « # » de l\'éditeur', markFrame.el.querySelectorAll('.page-number-badge').length === 1);
      expect('un retour à la ligne est un <br>, une tabulation quatre espaces', markFrame.el.querySelectorAll('br').length === 1 && / {3}Tabulé|  +Tabulé/.test(markFrame.text), markFrame.text);
      const kinds = Array.from(listFrame.el.querySelectorAll('ul, ol')).map(list => list.tagName.toLowerCase() + (list.getAttribute('data-bullet-style') ? ':' + list.getAttribute('data-bullet-style') : '')
        + (list.getAttribute('data-type') ? ':' + list.getAttribute('data-type') : '') + (list.getAttribute('data-number-style') ? ':' + list.getAttribute('data-number-style') : '') + (list.getAttribute('start') ? '@' + list.getAttribute('start') : ''));
      expect('les listes : rond, carré, cases, lettres à partir de c, chiffres romains, chiffres', kinds.join(' ') === 'ul:circle ul:square ul:taskList ol:alpha@3 ol:roman ol', kinds);
      const tasks = Array.from(listFrame.el.querySelectorAll('li[data-type="taskItem"]')).map(li => li.getAttribute('data-checked') + ':' + li.textContent.trim());
      expect('les cases : « À faire » non cochée, « Fait » cochée', tasks.join('|') === 'false:À faire|true:Fait', tasks);
      expect('la liste « lettres » a ses deux éléments', listFrame.el.querySelector('ol[data-number-style="alpha"]').children.length === 2);
      const align = Array.from(alignFrame.el.querySelectorAll('p')).map(p => p.style.textAlign || 'left').join(',');
      expect('alignement : centré, droite, justifié', align === 'center,right,justify', align);
      return result(bad);
    });

  // --- L'interligne et les espaces avant et après (« Paragraphe… », chantier 2 de « Import PowerPoint sans perte ») --------------------------------------------------------------------------
  // Les réglages de chaque paragraphe sous `root`, comme l'éditeur les lit : « Texte[interligne|avant|après] », « - » pour un réglage absent, « ∅ » pour un paragraphe sans texte.
  const settingsOf = root => Array.from(root.querySelectorAll('p')).map((p) => {
    const part = name => (p.hasAttribute(name) ? p.getAttribute(name) : '-');
    return (p.textContent.trim() || '∅') + '[' + part('data-line-height') + '|' + part('data-space-before') + '|' + part('data-space-after') + ']';
  }).join(' ');
  const lnPct = pct => `<a:lnSpc><a:spcPct val="${Math.round(pct * 1000)}"/></a:lnSpc>`;
  const lnPts = pt => `<a:lnSpc><a:spcPts val="${Math.round(pt * 100)}"/></a:lnSpc>`;
  const spcPts = (name, pt) => `<a:${name}><a:spcPts val="${Math.round(pt * 100)}"/></a:${name}>`;
  const spcPct = (name, pct) => `<a:${name}><a:spcPct val="${Math.round(pct * 1000)}"/></a:${name}>`;

  add('pptx_import_line_spacing_and_paragraph_spaces_become_the_paragraph_settings',
    'Les trois réglages de « Paragraphe… » viennent du fichier : interligne en pour cent (150 % = 1,758 fois la taille ; 100 %, la ligne simple de l\'éditeur = 1,172 ; 121 %, son interligne d\'origine = aucun réglage), interligne exact en points (28 pt sur du 14 pt = 2), espaces avant et après en points et en pour cent d\'une ligne (50 % de 14 pt = 8,4 pt) ; l\'espace avant le premier paragraphe et après le dernier n\'est pas posé (on pense que PowerPoint ne le pose pas : à vérifier sur un vrai fichier) ; le rapport n\'a rien à dire ; l\'éditeur garde les réglages',
    async (h) => {
      const r = await run1({
        slides: [{
          shapes: lone(
            para(sm('Un'), '', lnPct(150) + spcPts('spcBef', 20))
            + para(sm('Deux'), '', lnPts(28))
            + para(sm('Trois'), '', lnPct(100))
            + para(sm('Quatre'), '', lnPct(121.16))
            + para(sm('Cinq'), '', spcPts('spcBef', 12) + spcPct('spcAft', 50))
            + para(sm('Six'), '', spcPct('spcBef', 20) + spcPts('spcAft', 18))),
        }],
      });
      const { bad, expect } = checker();
      const want = 'Un[1.758|-|-] Deux[2|-|-] Trois[1.172|-|-] Quatre[-|-|-] Cinq[1.172|12|8.4] Six[1.172|3.36|-]';
      const frame = slidesOf(r.html)[0].frames[0];
      expect('150 % → 1,758 ; 28 pt exacts sur 14 pt → 2 ; 100 % → 1,172 ; 121 % → rien ; 12 pt avant et 50 % de ligne après (8,4 pt) ; 20 % de ligne avant (3,36 pt) ; ni les 20 pt avant le premier ni les 18 pt après le dernier', settingsOf(frame.el) === want, settingsOf(frame.el));
      expect('le style est celui que l\'éditeur écrit : interligne et remplissages en points',
        /<p data-line-height="1\.758" style="line-height: 1\.758"><span[^>]*>Un/.test(frame.inner) && /<p data-line-height="1\.172" data-space-before="12" data-space-after="8\.4" style="line-height: 1\.172; padding-top: 12pt; padding-bottom: 8\.4pt"><span[^>]*>Cinq/.test(frame.inner), frame.inner);
      expect('le rapport ne dit rien de l\'interligne ni des espaces : le fichier est repris entier', r.report.length === 0, r.report);
      // Dans l'éditeur : les réglages sont gardés au chargement, et les lignes sont aussi hautes que le réglage le dit (14 pt x 1,758 = 24,6 pt).
      const html = await inEditor(h, r);
      expect('l\'éditeur garde les réglages de chaque paragraphe', settingsOf(slidesOf(html)[0].frames[0].el) === want, settingsOf(slidesOf(html)[0].frames[0].el));
      const second = Array.from(document.querySelectorAll('.tiptap .pp-free-frame p')).find(p => p.textContent === 'Deux');
      const s = sheet();
      expect('dans l\'éditeur, « Deux » (28 pt exacts) fait 28 pt de haut, à un point près', !!second && near(heightPt(second, s), 28, 1), second && heightPt(second, s));
      return result(bad);
    });

  add('pptx_import_line_spacing_and_spaces_come_from_the_master_styles_and_the_paragraph_wins',
    'L\'interligne et les espaces suivent l\'héritage comme la taille : le titre à 90 % (1,055), un texte à 90 % avec 10 pt avant chaque paragraphe (sauf le premier), un paragraphe qui dit autre chose l\'emporte (150 %, aucun espace) ; la mise en page passe avant le masque',
    async () => {
      const master = sp({ id: 2, name: 'Titre', x: 50, y: 30, w: 860, h: 70, ph: '<p:ph type="title"/>', prst: '', text: para(run('Cliquez pour modifier le titre')) })
        + sp({ id: 3, name: 'Texte', x: 50, y: 130, w: 860, h: 360, ph: '<p:ph type="body" idx="1"/>', prst: '', text: para(run('Cliquez pour modifier le texte')) });
      const r = await run1({
        master: {
          shapes: master,
          title: `<a:lvl1pPr>${lnPct(90)}<a:defRPr sz="4000"/></a:lvl1pPr>`,
          body: `<a:lvl1pPr>${lnPct(90)}${spcPts('spcBef', 10)}<a:buNone/><a:defRPr sz="2800"/></a:lvl1pPr>`,
        },
        layout: { shapes: sp({ id: 2, name: 'Texte', x: 60, y: 140, w: 840, h: 340, ph: '<p:ph type="body" idx="1"/>', prst: '', lst: `<a:lvl1pPr>${lnPct(80)}</a:lvl1pPr>`, text: para(run('Texte de la mise en page')) }) },
        slides: [{
          shapes: sp({ id: 2, name: 'Titre 1', prst: '', ph: '<p:ph type="title"/>', text: para(run('Titre')) })
            + sp({ id: 3, name: 'Contenu 2', prst: '', ph: '<p:ph idx="1"/>', text: para(run('Un')) + para(run('Deux')) + para(run('Trois'), '', lnPct(150) + spcPts('spcBef', 0)) }),
        }],
      });
      const { bad, expect } = checker();
      const [title, content] = slidesOf(r.html)[0].frames;
      expect('le titre est à 90 % de la ligne simple : 1,055', !!title && settingsOf(title.el) === 'Titre[1.055|-|-]', title && settingsOf(title.el));
      // La mise en page du texte dit 80 % (son premier niveau) : elle passe avant le masque pour l'interligne ; les 10 pt avant viennent du masque.
      expect('le texte : l\'interligne de la mise en page (80 % = 0,938) et les 10 pt avant du masque, sauf avant le premier ; le paragraphe qui dit 150 % et 0 pt l\'emporte',
        !!content && settingsOf(content.el) === 'Un[0.938|-|-] Deux[0.938|10|-] Trois[1.758|-|-]', content && settingsOf(content.el));
      return result(bad);
    });

  add('pptx_import_list_items_empty_paragraphs_and_table_cells_carry_their_spacing',
    'L\'interligne et les espaces sont posés aussi sur un élément de liste, un paragraphe vide (sa ligne a la hauteur du réglage) et un paragraphe de case de tableau ; le premier paragraphe d\'une case n\'a pas d\'espace avant ni le dernier d\'espace après',
    async () => {
      const spaced = lnPct(80) + spcPts('spcBef', 6);
      const bullet = '<a:buChar char="•"/>';
      const r = await run1({
        slides: [{
          shapes: lone(
            para(sm('Premier'), 'marL="342900" indent="-342900"', spaced + bullet)
            + para(sm('Deuxième'), 'marL="342900" indent="-342900"', spaced + bullet)
            + para('', '', lnPct(200) + spcPts('spcBef', 6))
            + para(sm('Fin'))
          ) + table({ x: 60, y: 360, cols: [300], rows: [{ h: 160, cells: [{ paras: para(sm('Haut'), '', lnPct(150) + spcPts('spcBef', 9) + spcPts('spcAft', 4)) + para(sm('Milieu'), '', spcPts('spcBef', 9) + spcPts('spcAft', 4)) + para(sm('Bas'), '', spcPts('spcBef', 9) + spcPts('spcAft', 4)) }] }] }),
        }],
      });
      const { bad, expect } = checker();
      const slide = slidesOf(r.html)[0];
      const frame = slide.frames[0];
      expect('les éléments de liste portent leurs réglages sur le paragraphe de l\'élément, le premier sans espace avant', settingsOf(frame.el).indexOf('Premier[0.938|-|-] Deuxième[0.938|6|-]') === 0 && !!frame.el.querySelector('ul > li > p[data-line-height]'), frame.inner);
      expect('le paragraphe vide a son interligne (200 % = 2,344) et son espace avant (6 pt), sa ligne garde une espace insécable à sa taille', /∅\[2\.344\|6\|-\]/.test(settingsOf(frame.el)) && /<p data-line-height="2\.344" data-space-before="6"[^>]*><span style="font-size: 18pt">(\u00a0|&nbsp;)<\/span><\/p>/.test(frame.inner), frame.inner);
      expect('le dernier paragraphe n\'a que l\'interligne simple', / Fin\[1\.172\|-\|-\]$/.test(settingsOf(frame.el)), settingsOf(frame.el));
      const cell = slide.tables[0] && slide.tables[0].querySelector('td, th');
      expect('une case de tableau : « Haut » a 150 % et 4 pt après (pas d\'espace avant le premier), « Milieu » 9 pt avant et 4 après, « Bas » 9 pt avant et aucun après',
        !!cell && settingsOf(cell) === 'Haut[1.758|-|4] Milieu[1.172|9|4] Bas[1.172|9|-]', cell && settingsOf(cell));
      expect('rien au rapport', r.report.length === 0, r.report);
      return result(bad);
    });

  add('pptx_import_spaces_follow_the_text_size_when_the_text_is_reduced_or_the_page_is_scaled',
    'Le texte réduit par PowerPoint (normAutofit) garde sa réduction d\'interligne (80 % pour 20 % de réduction : 0,938) et ses espaces suivent la réduction des caractères (10 pt x 62,5 % = 6,25 pt) ; sur une page ramenée à la plus grande de l\'éditeur, un espace de 10 pt suit l\'échelle ; un interligne exact suit la taille du texte réduit',
    async () => {
      const { bad, expect } = checker();
      const paras = para(sm('Un')) + para(sm('Deux'), '', spcPts('spcBef', 10)) + para(sm('Trois'), '', lnPts(21));
      const reduced = await run1({ slides: [{ shapes: textBox(40, 100, 800, 300, paras, { id: 2, bodyXml: '<a:normAutofit fontScale="62500" lnSpcReduction="20000"/>' }) }] });
      expect('fontScale 62,5 % et lnSpcReduction 20 % : l\'interligne simple devient 80 % (0,938), 10 pt avant deviennent 6,25 pt, 21 pt exacts sur du 14 pt font toujours 1,5 fois la taille',
        settingsOf(slidesOf(reduced.html)[0].frames[0].el) === 'Un[0.938|-|-] Deux[0.938|6.25|-] Trois[1.5|-|-]', settingsOf(slidesOf(reduced.html)[0].frames[0].el));
      const exact = await run1({ slides: [{ shapes: textBox(40, 100, 800, 300, para(sm('Un')) + para(sm('Deux'), '', lnPct(100)), { id: 2 }) }] });
      expect('sans réduction, l\'interligne simple n\'est pas touché par un lnSpcReduction absent : 1,172', settingsOf(slidesOf(exact.html)[0].frames[0].el) === 'Un[1.172|-|-] Deux[1.172|-|-]', settingsOf(slidesOf(exact.html)[0].frames[0].el));
      // 2 880 x 1 620 pt : la page est ramenée à 1 584 pt de large (k = 0,55).
      const big = await run1({ size: [2880, 1620], slides: [{ shapes: textBox(288, 162, 1440, 600, para(run('Un', 'sz="4000"')) + para(run('Deux', 'sz="4000"'), '', spcPts('spcBef', 20)), { id: 2 }) }] });
      const k = PageLayout.pageSizePtFor(big.page.orientation, big.page.format).width / 2880;
      expect('page à l\'échelle ' + (Math.round(k * 1000) / 1000) + ' : 20 pt avant deviennent ' + (Math.round(20 * k * 100) / 100) + ' pt',
        settingsOf(slidesOf(big.html)[0].frames[0].el) === 'Un[1.172|-|-] Deux[1.172|' + (Math.round(20 * k * 100) / 100) + '|-]', { got: settingsOf(slidesOf(big.html)[0].frames[0].el), k });
      return result(bad);
    });

  add('pptx_import_text_is_measured_with_its_own_spacing_not_the_editors',
    'La hauteur mesurée d\'un texte est celle de son interligne et de ses espaces : deux lignes de 20 pt à 100 % (2 x 23,4 pt) tiennent dans une boîte de 52 pt et gardent leur taille, où l\'interligne de l\'éditeur (2 x 28,4 pt) les aurait réduites ; 30 pt d\'espace entre elles les réduisent',
    async () => {
      const { bad, expect } = checker();
      const sizeOf = r => { const m = /font-size: ([\d.]+)pt/.exec(slidesOf(r.html)[0].frames[0].inner); return m ? Number(m[1]) : null; };
      const two = (extra = '') => para(run('Premier paragraphe', 'sz="2000"')) + para(run('Deuxième paragraphe', 'sz="2000"'), '', extra);
      const single = await run1({ slides: [{ shapes: textBox(40, 100, 400, 52, two(lnPct(100)), { id: 2 }) }] });
      expect('à 100 %, le texte tient et reste à 20 pt', sizeOf(single) === 20 && !reportOf(single).shrunk, { size: sizeOf(single), report: single.report });
      const editorsOwn = await run1({ slides: [{ shapes: textBox(40, 100, 400, 52, two(lnPct(121.16)), { id: 2 }) }] });
      expect('avec l\'interligne de l\'éditeur (1,42), le même texte est trop haut : réduit', sizeOf(editorsOwn) < 20 && reportOf(editorsOwn).shrunk === 1, { size: sizeOf(editorsOwn), report: editorsOwn.report });
      const spaced = await run1({ slides: [{ shapes: textBox(40, 100, 400, 52, two(lnPct(100) + spcPts('spcBef', 30)), { id: 2 }) }] });
      expect('30 pt avant le second paragraphe : le texte ne tient plus, il est réduit', sizeOf(spaced) < 20 && reportOf(spaced).shrunk === 1, { size: sizeOf(spaced), report: spaced.report });
      return result(bad);
    });

  add('pptx_import_round_trip_keeps_the_line_spacing_and_the_spaces_of_the_editor_export',
    'Le PowerPoint que l\'éditeur écrit pour un paragraphe réglé (interligne 1,055, 10 pt avant, 6 pt après) est relu avec les mêmes réglages ; un paragraphe sans réglage reste sans réglage',
    async () => {
      await ExportEngines.ensure('pptx', 'pptxImport');
      const inner = '<p>Aa</p>'
        + '<p data-line-height="1.055" data-space-before="10" data-space-after="6" style="line-height: 1.055; padding-top: 10pt; padding-bottom: 6pt;">Bb</p>'
        + '<p data-line-height="2.344" style="line-height: 2.344;">Cc</p><p>Dd</p>';
      const html = FreeFrame.html({ x: 60, y: 60, w: 600, h: 300 }, inner) + '<p></p>';
      await PageLayout.setMarginsMm(SlidesEntry.pageFor('presentation', null));
      const blob = await PptxExport.fromHtml(html, { marginsPt: PageLayout.getMarginsPt(), title: 'Essai' });
      const imported = await PptxImport.fromBuffer(await blob.arrayBuffer());
      const { bad, expect } = checker();
      const frame = slidesOf(imported.html)[0].frames[0];
      expect('les réglages du paragraphe « Bb » et de « Cc » reviennent, ceux de « Aa » et « Dd » (aucun réglage) aussi', !!frame && settingsOf(frame.el) === 'Aa[-|-|-] Bb[1.055|10|6] Cc[2.344|-|-] Dd[-|-|-]', frame && settingsOf(frame.el));
      expect('rien à dire au rapport', imported.report.length === 0, imported.report);
      return result(bad);
    });

  // --- Les objets ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  add('pptx_import_shapes_keep_fill_line_rotation_and_count_the_neighbours',
    'Une forme garde sa sorte, son fond, son trait et sa rotation ; une forme que l\'éditeur n\'a pas (pentagone fléché, nuage, forme libre) devient un rectangle et se compte ; une forme libre qui n\'est qu\'un rectangle est un rectangle ; un tracé libre sans fond ni texte n\'est pas repris',
    async () => {
      const row = (i, prst, extra = {}) => sp(Object.assign({ id: 10 + i, name: prst, x: 40 + 150 * (i % 6), y: 160 + 120 * Math.floor(i / 6), w: 120, h: 80, prst, fill: solid('70AD47'), text: para(run('x')) }, extra));
      const custom = (points, extra = {}) => sp(Object.assign({ id: 40, name: 'Forme libre', x: 40, y: 400, w: 120, h: 80, prst: '', fill: solid('FFC000'),
        geom: `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="${points[0][0]}" y="${points[0][1]}"/></a:moveTo>${points.slice(1).map(p => `<a:lnTo><a:pt x="${p[0]}" y="${p[1]}"/></a:lnTo>`).join('')}<a:close/></a:path></a:pathLst></a:custGeom>` }, extra));
      const r = await run1({
        slides: [{
          shapes: sp({ id: 2, name: 'Rectangle', x: 40, y: 20, w: 200, h: 100, fill: solid('FFC000'), line: ln(1.5, solid('2F5597')), text: para(run('Rect', 'sz="2000"')) })
            + sp({ id: 3, name: 'Ellipse', x: 300, y: 20, w: 200, h: 100, prst: 'ellipse', fill: solid('70AD47'), xf: 'rot="1800000"', text: para(run('Tournée')) })
            + sp({ id: 4, name: 'Rectangle centré', x: 600, y: 20, w: 200, h: 100, fill: solid('5B9BD5'), body: 'anchor="ctr"', text: para(run('Centré')) })
            + ['roundRect', 'triangle', 'diamond', 'rightArrow', 'star5', 'wedgeRoundRectCallout'].map((prst, i) => row(i, prst)).join('')
            + row(6, 'homePlate', { text: '' }) + row(7, 'cloud', { text: '' }) + custom([[0, 0], [100, 0], [100, 100], [0, 100]]) + custom([[50, 0], [100, 100], [0, 100]], { id: 41, x: 200 })
            + sp({ id: 42, name: 'Tracé', x: 400, y: 400, w: 100, h: 60, prst: '', geom: custom([[0, 0], [100, 100]]).match(/<a:custGeom>[\s\S]*<\/a:custGeom>/)[0], line: ln(2) }),
        }],
      });
      const { bad, expect } = checker();
      const frames = slidesOf(r.html)[0].frames;
      const named = {};
      frames.forEach((f) => { named[f.shape || 'texte'] = (named[f.shape || 'texte'] || 0) + 1; });
      const [rect, ellipse, centered] = frames;
      expect('le rectangle dont le texte est en haut reste un cadre de texte, avec son fond #ffc000 et son trait #2f5597 de 1,5 pt', rect.shape === '' && rect.fill === '#ffc000' && rect.line === '#2f5597' && near(rect.lw, 1.5) && /Rect/.test(rect.text), rect);
      expect('le trait de PowerPoint est centré sur le bord, celui de l\'éditeur est dans la boîte : la boîte (40, 20, 200 x 100) est élargie d\'une demi-épaisseur de chaque côté, 39,25, 19,25, 201,5 x 101,5', near(rect.x, 39.25) && near(rect.y, 19.25) && near(rect.w, 201.5) && near(rect.h, 101.5), { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      expect('une forme sans trait garde sa boîte exacte (l\'ellipse : 300, 20, 200 x 100)', near(ellipse.x, 300) && near(ellipse.y, 20) && near(ellipse.w, 200) && near(ellipse.h, 100), { x: ellipse.x, y: ellipse.y, w: ellipse.w, h: ellipse.h });
      expect('l\'ellipse tournée de 30° : forme ellipse, rotation 30', ellipse.shape === 'ellipse' && near(ellipse.rot, 30, 0.01) && ellipse.fill === '#70ad47', ellipse);
      expect('le rectangle dont le texte est centré devient une forme (son texte est centré dans sa boîte)', centered.shape === 'rect' && centered.fill === '#5b9bd5', centered);
      expect('les formes que l\'éditeur dessine gardent leur sorte : arrondi, triangle, losange, flèche à droite, étoile, bulle', frames.slice(3, 9).map(f => f.shape).join(',') === 'roundRect,triangle,diamond,rightArrow,star5,wedgeRoundRectCallout', frames.slice(3, 9).map(f => f.shape));
      expect('le pentagone fléché et le nuage sont des rectangles (la voisine la plus proche)', frames[9].shape === 'rect' && frames[10].shape === 'rect', frames.slice(9, 11).map(f => f.shape));
      expect('la forme libre en rectangle est un rectangle, la forme libre en triangle en est un aussi', frames[11].shape === 'rect' && frames[12].shape === 'rect', frames.slice(11, 13).map(f => f.shape));
      expect('le tracé libre sans fond ni texte n\'est pas repris : treize cadres seulement', frames.length === 13, frames.length);
      expect('le rapport compte les formes remplacées : pentagone fléché, nuage, forme libre en triangle, tracé libre = 4', reportOf(r).shapes === 4, r.report);
      return result(bad);
    });

  add('pptx_import_lines_arrows_flips_rotations_and_bent_connectors',
    'Un connecteur devient une ligne (ses deux bouts, son épaisseur, sa couleur, ses pointes), retournée ou tournée comme le fichier le dit ; un connecteur coudé est un trait droit compté ; un rectangle trop mince est un trait de son épaisseur',
    async () => {
      const r = await run1({
        slides: [{
          shapes: cxn({ id: 2, x: 100, y: 200, w: 300, h: 0, line: ln(3, solid('2F5597'), '<a:headEnd type="triangle"/><a:tailEnd type="triangle"/>') })
            + cxn({ id: 3, x: 450, y: 180, w: 200, h: 80, xf: 'flipV="1"', line: ln(2, solid('C00000'), '<a:tailEnd type="triangle"/>') })
            + cxn({ id: 4, x: 700, y: 300, w: 100, h: 0, xf: 'rot="5400000"', line: ln(1) })
            + cxn({ id: 5, x: 100, y: 400, w: 200, h: 60, prst: 'bentConnector3', line: ln(1, solid('00B050')) })
            + sp({ id: 6, name: 'Règle', x: 100, y: 480, w: 300, h: 2, fill: solid('FF0000') })
            + sp({ id: 7, name: 'Trait', x: 500, y: 450, w: 200, h: 0, prst: 'line', line: ln(4, solid('7030A0')) }),
        }],
      });
      const { bad, expect } = checker();
      const lines = slidesOf(r.html)[0].frames;
      const both = lines[0];
      expect('un connecteur : ligne de (100, 200) à (400, 200), 3 pt, #2f5597, pointes aux deux bouts', both.shape === 'line' && near(both.x, 100) && near(both.y, 200) && near(both.w, 300) && near(both.h, 0) && near(both.lw, 3) && both.line === '#2f5597' && both.head === 'triangle' && both.tail === 'triangle', both);
      const flipped = lines[1];
      expect('retourné en hauteur : du bas gauche au haut droit (flip v), pointe à la fin seulement', flipped.shape === 'line' && flipped.flip === 'v' && near(flipped.x, 450) && near(flipped.y, 180) && near(flipped.w, 200) && near(flipped.h, 80) && flipped.head === '' && flipped.tail === 'triangle', flipped);
      const turned = lines[2];
      expect('tourné de 90° : la ligne est verticale, de (750, 250) à (750, 350)', turned.shape === 'line' && near(turned.x, 750, 0.1) && near(turned.y, 250, 0.1) && near(turned.w, 0, 0.1) && near(turned.h, 100, 0.1), turned);
      expect('le connecteur coudé est une ligne droite de son début à sa fin', lines[3].shape === 'line' && near(lines[3].x, 100) && near(lines[3].y, 400) && near(lines[3].w, 200) && near(lines[3].h, 60), lines[3]);
      expect('un rectangle plein de 2 pt de haut est un trait de 2 pt, au milieu de sa boîte', lines[4].shape === 'line' && near(lines[4].lw, 2) && lines[4].line === '#ff0000' && near(lines[4].x, 100) && near(lines[4].w, 300) && near(lines[4].y, 481, 0.6), lines[4]);
      expect('une forme « ligne » (prstGeom line) est une ligne, de son épaisseur et de sa couleur', lines[5].shape === 'line' && near(lines[5].lw, 4) && lines[5].line === '#7030a0' && near(lines[5].w, 200), lines[5]);
      expect('le rapport compte le connecteur coudé', reportOf(r).connectors === 1 && Object.keys(reportOf(r)).length === 1, r.report);
      return result(bad);
    });

  add('pptx_import_pictures_cropped_flipped_and_stretched_to_the_box_by_pixels',
    'Une image est reprise telle quelle quand rien ne la change ; rognée, retournée ou étirée aux proportions de sa boîte, elle est redessinée (au pixel près) ; une image illisible (EMF) est comptée et non reprise',
    async () => {
      const media = { 'image1.png': TWO_TONE(), 'image2.emf': btoa('EMF-not-an-image') };
      const r = await run1({
        media,
        slides: [{
          rels: [IMAGE_REL('rId2', 'image1.png'), IMAGE_REL('rId3', 'image2.emf')],
          shapes: pic({ id: 2, x: 50, y: 50, w: 200, h: 100, descr: 'Le logo' })
            + pic({ id: 3, x: 300, y: 50, w: 100, h: 100, crop: '<a:srcRect l="50000"/>' })
            + pic({ id: 4, x: 450, y: 50, w: 200, h: 100, xf: 'flipH="1"' })
            + pic({ id: 5, x: 700, y: 50, w: 100, h: 100 })
            + pic({ id: 6, x: 50, y: 300, w: 100, h: 100, rid: 'rId3' }),
        }],
      });
      const { bad, expect } = checker();
      const frames = slidesOf(r.html)[0].frames;
      expect('quatre images reprises, l\'EMF non', frames.length === 4, frames.length);
      const [plain, cropped, flipped, stretched] = frames;
      expect('l\'image intacte : les octets du fichier tels quels (pas de redessin), classe editor-image, texte alternatif du fichier', dataOf(plain) === 'data:image/png;base64,' + media['image1.png'] && plain.el.querySelector('img.editor-image').alt === 'Le logo', plain.inner.slice(0, 160));
      expect('elle est réglée par sa largeur : 200 pt = 266,67 px, et son cadre est élargi des marges d\'un cadre (42,8, 46,4, 214,4 x 107,2)',
        /width: 266\.67px/.test(plain.inner) && near(plain.x, 42.8) && near(plain.y, 46.4) && near(plain.w, 214.4) && near(plain.h, 107.2), { x: plain.x, y: plain.y, w: plain.w, h: plain.h, inner: plain.inner.slice(0, 200) });
      const cropSize = await imageSize(dataOf(cropped));
      expect('rognée de la moitié gauche : il ne reste que le bleu, 20 x 20', cropSize.w === 20 && cropSize.h === 20 && sameColor(await pixel(dataOf(cropped), 3, 10), [0, 0, 255]) && sameColor(await pixel(dataOf(cropped), 16, 10), [0, 0, 255]), cropSize);
      expect('retournée : le bleu est à gauche, le rouge à droite', sameColor(await pixel(dataOf(flipped), 5, 10), [0, 0, 255]) && sameColor(await pixel(dataOf(flipped), 35, 10), [255, 0, 0]));
      const stretchedSize = await imageSize(dataOf(stretched));
      expect('étirée aux proportions de sa boîte carrée (l\'image est deux fois plus large que haute) : 40 x 40, le rouge toujours à gauche', stretchedSize.w === 40 && stretchedSize.h === 40 && sameColor(await pixel(dataOf(stretched), 5, 20), [255, 0, 0]) && sameColor(await pixel(dataOf(stretched), 35, 20), [0, 0, 255]), stretchedSize);
      expect('le rapport compte l\'image illisible', reportOf(r).images === 1 && r.report.length === 1, r.report);
      return result(bad);
    });

  add('pptx_import_groups_put_their_children_at_their_place',
    'Les objets d\'un groupe sont à leur place sur la diapositive : le repère des enfants (décalage, échelle) est appliqué, groupes emboîtés compris',
    async () => {
      const box = (id, x, y, w, h, fill) => sp({ id, name: 'R' + id, x, y, w, h, fill: solid(fill), text: para(run('x')) });
      const r = await run1({
        slides: [{
          shapes: grp({
            x: 100, y: 100, w: 400, h: 200, cx: 0, cy: 0, cw: 800, ch: 400,
            children: box(10, 0, 0, 400, 200, 'FF0000') + box(11, 400, 200, 400, 200, '00FF00')
              + grp({ id: 12, x: 0, y: 0, w: 400, h: 400, cx: 0, cy: 0, cw: 400, ch: 400, children: box(13, 200, 0, 200, 200, '0000FF') }),
          }),
        }],
      });
      const { bad, expect } = checker();
      const frames = slidesOf(r.html)[0].frames;
      const at = (f, x, y, w, h) => near(f.x, x, 0.1) && near(f.y, y, 0.1) && near(f.w, w, 0.1) && near(f.h, h, 0.1);
      expect('le premier enfant (0, 0, 400 x 200) du groupe à l\'échelle 1/2 : (100, 100, 200 x 100)', frames.length === 3 && at(frames[0], 100, 100, 200, 100), frames[0]);
      expect('le deuxième enfant (400, 200) : (300, 200, 200 x 100)', at(frames[1], 300, 200, 200, 100), frames[1]);
      expect('l\'enfant du groupe emboîté : (200, 100, 100 x 100)', at(frames[2], 200, 100, 100, 100), frames[2]);
      return result(bad);
    });

  // --- La diapositive : fond, notes, transition, décor ----------------------------------------------------------------------------------------------------------------------------------------
  add('pptx_import_backgrounds_solid_inherited_gradient_and_picture',
    'Le fond d\'une diapositive : uni (le sien, ou celui du masque), dégradé (sa couleur moyenne, comptée), image (une image derrière le texte, à la taille de la page) ; une couleur translucide du décor se fond dans la couleur moyenne de l\'image',
    async () => {
      const bg = fill => `<p:bg><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg>`;
      const gradient = '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>';
      const picture = '<a:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>';
      const pictureSlide = { bg: bg(picture), rels: [IMAGE_REL('rId2', 'image1.png')], shapes: sp({ id: 2, name: 'Voile', x: 100, y: 100, w: 300, h: 100, fill: '<a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="50000"/></a:srgbClr></a:solidFill>', text: para(run('x')) }) };
      const r = await run1({ media: { 'image1.png': TWO_TONE() }, master: { bg: bg(solid('1F2937')) }, slides: [{ bg: bg(solid('FFF2CC')) }, {}, { bg: bg(gradient) }, pictureSlide] });
      const { bad, expect } = checker();
      const slides = slidesOf(r.html);
      expect('un fond uni de la diapositive : #fff2cc', slides[0].props && slides[0].props.bg === '#fff2cc', slides[0].props);
      expect('sans fond à elle, la diapositive prend celui du masque : #1f2937', slides[1].props && slides[1].props.bg === '#1f2937', slides[1].props);
      expect('un dégradé du rouge au bleu : sa couleur moyenne #800080, comptée une fois', slides[2].props && slides[2].props.bg === '#800080' && reportOf(r).gradients === 1, { props: slides[2].props, report: r.report });
      const back = behind(slides[3].frames);
      expect('un fond en image : un cadre derrière le texte, qui couvre la page (élargi des marges d\'un cadre : -7,2, -3,6, 974,4 x 547,2)', back.length === 1 && near(back[0].x, -7.2) && near(back[0].y, -3.6) && near(back[0].w, 974.4) && near(back[0].h, 547.2), back.map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h })));
      const size = back.length ? await imageSize(dataOf(back[0])) : null;
      expect('l\'image est amenée aux proportions de la page (16:9) sans rien perdre : 40 x 23, le rouge à gauche, le bleu à droite', !!size && size.w === 40 && size.h >= 22 && size.h <= 23 && sameColor(await pixel(dataOf(back[0]), 4, 10), [255, 0, 0]) && sameColor(await pixel(dataOf(back[0]), 36, 10), [0, 0, 255]), size);
      const veil = only(slides[3].frames)[0];
      expect('un voile blanc à demi transparent sur ce fond se fond dans sa couleur moyenne (violet 800080) : #bf80bf', !!veil && /^#[0-9a-f]{6}$/.test(veil.fill) && [0xbf, 0x80, 0xbf].every((c, i) => Math.abs(parseInt(veil.fill.slice(1 + 2 * i, 3 + 2 * i), 16) - c) <= 4), veil && veil.fill);
      return result(bad);
    });

  add('pptx_import_notes_and_transitions_with_their_direction_and_duration',
    'Les notes de l\'intervenant (une ligne par paragraphe) et la transition de chaque diapositive : effet, côté d\'où elle arrive, durée (celle de PowerPoint 2010 comprise) ; un effet que l\'éditeur n\'a pas devient un fondu et se compte',
    async () => {
      const alt = (dur, effect) => `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14"><p:transition spd="med" p14:dur="${dur}">${effect}</p:transition></mc:Choice><mc:Fallback><p:transition spd="med">${effect}</p:transition></mc:Fallback></mc:AlternateContent>`;
      const t = (spd, effect) => `<p:transition${spd ? ` spd="${spd}"` : ''}>${effect}</p:transition>`;
      const r = await run1({
        slides: [
          { notes: ['Première ligne', 'Deuxième ligne avec une apostrophe \' et un &'], transition: t('fast', '<p:fade/>') },
          { transition: t('slow', '<p:push dir="u"/>') },
          { transition: alt(1250, '<p:wipe dir="r"/>') },
          { transition: t('', '<p:checker dir="horz"/>') },
          { transition: t('med', '<p:cover dir="l"/>') },
          { transition: t('med', '<p:pull dir="d"/>') },
          { transition: t('med', '<p:zoom dir="in"/>') },
          {},
        ],
      });
      const { bad, expect } = checker();
      const props = slidesOf(r.html).map(slide => slide.props);
      const of = i => props[i] && `${props[i].transition}/${props[i].from}/${props[i].dur}`;
      expect('les notes : une ligne par paragraphe, apostrophe et & gardés', props[0].notes === 'Première ligne\nDeuxième ligne avec une apostrophe \' et un &', props[0].notes);
      expect('fondu rapide : fade, 400 ms', of(0) === 'fade/r/400', of(0));
      expect('poussé « vers le haut » : push, arrive du bas, 1 000 ms (lent)', of(1) === 'push/b/1000', of(1));
      expect('balayage à la durée de PowerPoint 2010 (p14:dur) : wipe, arrive de la gauche, 1 250 ms et non les 700 ms de « moyen »', of(2) === 'wipe/l/1250', of(2));
      expect('un effet inconnu (damier) : fondu, 700 ms par défaut, compté', of(3) === 'fade/r/700' && reportOf(r).transitions === 1, { got: of(3), report: r.report });
      expect('couvrir : cover ; découvrir : uncover (arrive du haut) ; zoom : zoom', of(4) === 'cover/r/700' && of(5) === 'uncover/t/700' && /^zoom\//.test(of(6)), [of(4), of(5), of(6)]);
      expect('une diapositive sans notes ni transition n\'a pas de repère', props[7] === null, props[7]);
      return result(bad);
    });

  add('pptx_import_master_and_layout_decor_goes_behind_the_text',
    'Les objets du masque et de la mise en page qui ne sont pas des espaces réservés (bandeau, texte fixe) sont recopiés DERRIÈRE le texte de chaque diapositive qui les montre ; jamais l\'espace réservé ; pas quand la diapositive (ou la mise en page, pour le masque) masque les graphiques d\'arrière-plan',
    async () => {
      const masterShapes = sp({ id: 20, name: 'Bandeau', x: 0, y: 0, w: 960, h: 40, fill: scheme('accent1') })
        + textBox(40, 500, 300, 30, para(run('Pied du masque', 'sz="1200"')), { id: 21 })
        + sp({ id: 2, name: 'Titre', x: 50, y: 60, w: 860, h: 70, ph: '<p:ph type="title"/>', prst: '', text: para(run('Cliquez pour modifier le titre')) });
      const layoutShapes = sp({ id: 30, name: 'Bas', x: 0, y: 500, w: 960, h: 40, fill: scheme('accent2') })
        + sp({ id: 31, name: 'Texte', x: 60, y: 140, w: 840, h: 340, ph: '<p:ph type="body" idx="1"/>', prst: '', text: para(run('Texte de la mise en page')) });
      const own = textBox(100, 200, 300, 40, para(run('Propre', 'sz="2000"')));
      const full = await run1({ master: { shapes: masterShapes }, layout: { shapes: layoutShapes }, slides: [{ shapes: own }, { shapes: own, showMasterSp: false }, { shapes: own }] });
      const { bad, expect } = checker();
      const slides = slidesOf(full.html);
      const names = slide => behind(slide.frames).map(f => f.text.trim() || f.fill).join(',');
      expect('la diapositive 1 montre le décor du masque (bandeau accent1, pied) puis celui de la mise en page (bandeau accent2) : trois cadres derrière le texte', names(slides[0]) === '#4472c4,Pied du masque,#ed7d31', names(slides[0]));
      expect('le bandeau du masque est à sa place (0, 0, 960 x 40) ; chaque copie est « derrière le texte »', near(behind(slides[0].frames)[0].x, 0) && near(behind(slides[0].frames)[0].w, 960) && near(behind(slides[0].frames)[0].h, 40) && behind(slides[0].frames).every(f => f.layer === 'behind'), behind(slides[0].frames).map(f => ({ x: f.x, w: f.w, h: f.h })));
      expect('le texte de la diapositive vient après le décor, et n\'est pas derrière', only(slides[0].frames).length === 1 && /Propre/.test(only(slides[0].frames)[0].text) && slides[0].frames[slides[0].frames.length - 1].layer !== 'behind', slides[0].frames.map(f => f.layer));
      expect('« Masquer les graphiques d\'arrière-plan » (showMasterSp="0" sur la diapositive) : aucun décor', behind(slides[1].frames).length === 0 && only(slides[1].frames).length === 1, names(slides[1]));
      expect('la diapositive 3 a de nouveau tout son décor', names(slides[2]) === names(slides[0]), names(slides[2]));
      expect('les espaces réservés du masque et de la mise en page ne sont jamais recopiés', !/Cliquez|Texte de la mise/.test(full.html));
      expect('rien à dire dans le rapport', full.report.length === 0, full.report);
      const layoutOnly = await run1({ master: { shapes: masterShapes }, layout: { shapes: layoutShapes, showMasterSp: false }, slides: [{ shapes: own }] });
      expect('une mise en page qui masque les graphiques du masque ne montre que les siens : le seul bandeau accent2', names(slidesOf(layoutOnly.html)[0]) === '#ed7d31', names(slidesOf(layoutOnly.html)[0]));
      return result(bad);
    });

  // --- Le texte tel que l'éditeur le pose --------------------------------------------------------------------------------------------------------------------------------------------------
  // La feuille de la page dans l'éditeur : son haut, son zoom ; une position en points depuis le haut de la page.
  function sheet() {
    const el = document.querySelector('#editor-container .v2-page-sheet') || document.querySelector('#editor-container .tiptap');
    const rect = el.getBoundingClientRect();
    const size = PageLayout.getPageSizePt();
    return { rect, zoom: rect.width / (size.width * 4 / 3), size };
  }
  const topPt = (el, s) => (el.getBoundingClientRect().top - s.rect.top) / s.zoom * 0.75;
  const heightPt = (el, s) => el.getBoundingClientRect().height / s.zoom * 0.75;

  add('pptx_import_text_is_reduced_to_fit_its_box_and_anchored_text_goes_down',
    'Un texte plus haut que sa boîte (l\'interligne de l\'éditeur est de 1,42, celui de PowerPoint de 1,2) est réduit jusqu\'à y tenir, et l\'éditeur le pose à cette hauteur ; la réduction de PowerPoint (normAutofit) est gardée ; un texte posé en bas ou au centre de sa boîte a sa boîte descendue',
    async (h) => {
      const para20 = text => para(run(text, 'sz="2000"'));
      const r = await run1({
        slides: [{
          shapes: textBox(40, 100, 300, 50, para20('Premier paragraphe') + para20('Deuxième paragraphe'), { id: 2 })
            + textBox(400, 100, 300, 50, para(run('Déjà réduit par PowerPoint', 'sz="2400"')), { id: 3, bodyXml: '<a:normAutofit fontScale="62500" lnSpcReduction="20000"/>' })
            + textBox(40, 300, 300, 200, para20('En bas'), { id: 4, body: 'anchor="b"' })
            + textBox(400, 300, 300, 200, para20('Au milieu'), { id: 5, body: 'anchor="ctr"' }),
        }],
      });
      const { bad, expect } = checker();
      const [tall, scaled, bottom, middle] = slidesOf(r.html)[0].frames;
      const size = /font-size: ([\d.]+)pt/.exec(tall.inner);
      expect('le texte trop haut est réduit : entre 12 pt (le plancher, 60 %) et 20 pt exclu', !!size && Number(size[1]) >= 12 && Number(size[1]) < 20, tall.inner);
      expect('le rapport compte ce texte réduit, et lui seul (celui de PowerPoint a déjà sa réduction)', reportOf(r).shrunk === 1, r.report);
      expect('la réduction de PowerPoint (62,5 %) est gardée : 24 pt devient 15 pt', /font-size: 15pt/.test(scaled.inner), scaled.inner);
      expect('un texte posé en bas : sa boîte est descendue à la hauteur de son texte, qui finit à 500 pt (le bas de la boîte d\'origine)', near(bottom.y + bottom.h, 500, 1) && bottom.h < 60 && bottom.h > 25, { y: bottom.y, h: bottom.h });
      expect('un texte posé au milieu : sa boîte est descendue de la même façon, centrée dans l\'ancienne (300 à 500)', near(middle.y + middle.h / 2, 400, 1) && middle.h < 60, { y: middle.y, h: middle.h });
      // Dans l'éditeur : le cadre réduit ne dépasse pas la hauteur du fichier, à quelques points près.
      await inEditor(h, r);
      const s = sheet();
      const box = document.querySelector('.tiptap .pp-free-frame .pp-free-frame-box');
      expect('dans l\'éditeur, la boîte du texte réduit mesure 50 pt (3 % de plus au plus), pas les 64 pt qu\'il aurait à sa taille d\'origine', !!box && heightPt(box, s) <= 50 * 1.06 + 1, box && heightPt(box, s));
      return result(bad);
    });

  add('pptx_import_tables_in_the_text_of_the_slide_at_their_place',
    'Un tableau est un tableau de l\'éditeur dans le texte de sa diapositive (colonnes, hauteurs, cases fusionnées, fond, alignement), à sa place au point près grâce à des lignes vides et aux marges de la page ; un tableau ailleurs sur la page est rangé à la place des autres et compté',
    async (h) => {
      const r = await run1({
        slides: [
          { shapes: table({ x: 60, y: 150, cols: [200, 200, 200], rows: [
            { h: 40, cells: [{ text: 'Entête', span: 3, attrs: 'sz="1400" b="1"' }, { hMerge: true }, { hMerge: true }] },
            { h: 40, cells: [{ text: 'A', rowSpan: 2 }, { text: 'B', fill: 'FFFF00' }, { text: 'C', anchor: 'ctr' }] },
            { h: 40, cells: [{ vMerge: true }, { text: 'E' }, { text: 'F' }] },
          ] }) },
          { shapes: table({ x: 300, y: 100, cols: [150, 150], rows: [{ h: 30, cells: [{ text: 'X' }, { text: 'Y' }] }] }) },
        ],
      });
      const { bad, expect } = checker();
      const [first, second] = slidesOf(r.html);
      const t = first.tables[0];
      expect('un tableau de trois lignes dans le texte de la diapositive 1, un dans le texte de la 2', !!t && first.tables.length === 1 && second.tables.length === 1 && t.rows.length === 3, [first.tables.length, second.tables.length]);
      expect('l\'entête est une seule case de trois colonnes', t.rows[0].cells.length === 1 && t.rows[0].cells[0].colSpan === 3 && t.rows[0].cells[0].getAttribute('colwidth') === '267,267,267', t.rows[0].cells[0].outerHTML.slice(0, 120));
      expect('la case « A » couvre deux lignes, « B » est jaune, « C » centrée en hauteur', t.rows[1].cells.length === 3 && t.rows[1].cells[0].rowSpan === 2 && t.rows[1].cells[1].style.backgroundColor === 'rgb(255, 255, 0)' && t.rows[1].cells[2].getAttribute('data-valign') === 'middle', t.rows[1].innerHTML.slice(0, 300));
      expect('la troisième ligne n\'a que « E » et « F » (la case « A » passe dessous)', t.rows[2].cells.length === 2 && /E/.test(t.rows[2].cells[0].textContent), t.rows[2].textContent);
      expect('chaque ligne a sa hauteur du fichier (40 pt = 53 px)', Array.from(t.rows).every(row => row.getAttribute('data-row-height') === '53'), Array.from(t.rows).map(row => row.getAttribute('data-row-height')));
      expect('les marges de la page sont celles du tableau : gauche 60 pt = 21,17 mm, droite 300,09 pt = 105,87 mm, haut celle de l\'éditeur (9,88 mm)', near(r.page.left, 21.17, 0.02) && near(r.page.right, 105.87, 0.05) && near(r.page.top, 9.88, 0.02), r.page);
      expect('le second tableau n\'est pas à la place du premier : rangé à sa place et compté', reportOf(r).tablesMoved === 1, r.report);
      expect('le texte de la diapositive n\'est que des lignes vides (celles qui mettent le tableau à 150 pt) : aucun mot', first.flow.length >= 2 && first.flow.every(el => el.tagName === 'P' && el.textContent.trim() === ''), first.flow.map(el => el.textContent));
      // Dans l'éditeur : le tableau est à 150 pt du haut de la page, à 60 pt de son bord gauche, large de 600 pt.
      await inEditor(h, r);
      const s = sheet();
      const table1 = document.querySelector('.tiptap table');
      expect('dans l\'éditeur, le premier tableau est à 150 pt du haut de la page (à 3 pt près) et large de 600 pt', !!table1 && near(topPt(table1, s), 150, 3) && near(table1.getBoundingClientRect().width / s.zoom * 0.75, 600, 2), table1 && { top: topPt(table1, s), width: table1.getBoundingClientRect().width / s.zoom * 0.75 });
      expect('et à 60 pt du bord gauche de la page', !!table1 && near((table1.getBoundingClientRect().left - s.rect.left) / s.zoom * 0.75, 60, 2), table1 && (table1.getBoundingClientRect().left - s.rect.left) / s.zoom * 0.75);
      return result(bad);
    });

  // --- Le rapport et les limites ----------------------------------------------------------------------------------------------------------------------------------------------------------
  // Un fichier qui porte un objet de chaque genre que l'import ne reprend pas tel quel (le rapport en compte dix-huit) : le cas du rapport l'importe, le test à la vraie souris (window.PptxFixtures)
  // le donne à choisir pour voir la fenêtre au rapport le plus long.
  function everyKindOfObject() {
    const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
    const frame = (uri, inner = '', name = 'Objet') => `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="30" name="${name}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm(100, 100, 200, 100, '', 'p:xfrm')}<a:graphic><a:graphicData uri="${uri}">${inner}</a:graphicData></a:graphic></p:graphicFrame>`;
    const timing = '<p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="clickEffect"/></p:par><p:par><p:cTn id="2" nodeType="withEffect"/></p:par><p:par><p:cTn id="3" nodeType="afterEffect"/></p:par><p:par><p:cTn id="4" nodeType="mainSeq"/></p:par></p:tnLst></p:timing>';
    const equation = `<mc:AlternateContent ${MC} xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><mc:Choice Requires="a14"><p:sp><p:nvSpPr><p:cNvPr id="40" name="Équation"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(10, 10, 100, 40)}</p:spPr><p:txBody><a:bodyPr/><a:p><m:oMathPara><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></m:oMathPara></a:p></p:txBody></p:sp></mc:Choice><mc:Fallback/></mc:AlternateContent>`;
    const gradientShape = sp({ id: 41, name: 'Dégradé', x: 400, y: 300, w: 100, h: 60, fill: '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst></a:gradFill>', text: para(run('x')) });
    const jump = textBox(20, 400, 300, 40, para(run('Vers la suite', '', '<a:hlinkClick r:id="rId8" action="ppaction://hlinksldjump"/>')), { id: 42 });
    return {
      media: { 'image1.png': TWO_TONE(), 'image2.emf': btoa('EMF') },
      master: { shapes: frame('http://schemas.openxmlformats.org/drawingml/2006/table', '<a:tbl/>', 'Tableau du masque') },
      parts: { 'ppt/comments/comment1.xml': `${HEAD}<p:cmLst ${NS}><p:cm authorId="0" idx="1"><p:text>Un</p:text></p:cm><p:cm authorId="0" idx="2"><p:text>Deux</p:text></p:cm></p:cmLst>` },
      slides: [{
        timing,
        transition: '<p:transition><p:checker dir="horz"/></p:transition>',
        rels: [IMAGE_REL('rId2', 'image1.png'), IMAGE_REL('rId3', 'image2.emf'), { id: 'rId7', type: 'comments', target: '../comments/comment1.xml' }, { id: 'rId8', type: 'slide', target: 'slide2.xml' }],
        shapes: frame('http://schemas.openxmlformats.org/drawingml/2006/chart', '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId9"/>', 'Graphique')
          + frame('http://schemas.openxmlformats.org/drawingml/2006/diagram', '', 'Schéma')
          + frame('http://schemas.openxmlformats.org/drawingml/2006/table', '', 'Tableau illisible')
          + frame('http://schemas.openxmlformats.org/presentationml/2006/ole', '<p:oleObj/>', 'Objet incorporé')
          + frame('http://example.org/inconnu', '', 'Objet inconnu')
          + pic({ id: 31, x: 20, y: 300, w: 100, h: 100, nvPr: '<a:videoFile r:link="rId10"/>' })
          + pic({ id: 32, x: 150, y: 300, w: 100, h: 100, rid: 'rId3' })
          + '<p:contentPart xmlns:r="' + R_NS + '" r:id="rId11"/>'
          + equation
          + sp({ id: 33, name: 'Pentagone', x: 300, y: 300, w: 80, h: 60, prst: 'homePlate', fill: solid('FFC000'), text: para(run('x')) })
          + cxn({ id: 34, x: 100, y: 450, w: 100, h: 40, prst: 'curvedConnector3' })
          + gradientShape + jump,
      }, { show: false, shapes: '' }],
    };
  }

  add('pptx_import_report_counts_every_kind_of_object_that_does_not_arrive',
    'Le rapport compte, par genre, ce qui n\'arrive pas tel quel : animations, graphique, schéma, tableau illisible, objet incorporé, vidéo, tracé, équation, commentaires, image illisible, forme et connecteur remplacés, dégradé, transition, lien vers une diapositive, diapositive masquée, objet du masque, objet illisible',
    async () => {
      const r = await run1(everyKindOfObject());
      const { bad, expect } = checker();
      const expected = { animations: 3, charts: 1, diagrams: 1, tables: 1, embedded: 1, media: 1, ink: 1, equations: 1, comments: 2, images: 1, shapes: 1, connectors: 1, gradients: 1, transitions: 1, slideLinks: 1, hidden: 1, masterObjects: 1, unreadable: 1 };
      expect('chaque genre est compté, une fois par objet', JSON.stringify(reportOf(r)) === JSON.stringify(expected), reportOf(r));
      expect('le rapport suit l\'ordre de PptxImport.REPORT_KEYS', JSON.stringify(r.report.map(item => item.key)) === JSON.stringify(PptxImport.REPORT_KEYS.filter(key => expected[key])), r.report.map(item => item.key));
      expect('le tableau du masque est compté une fois, pas une fois par diapositive', reportOf(r).masterObjects === 1);
      expect('les objets qui arrivent arrivent : le pentagone (rectangle), le connecteur courbe (ligne), le dégradé, le texte du lien, la vidéo (son image d\'affiche)', slidesOf(r.html)[0].frames.length >= 5, slidesOf(r.html)[0].frames.length);
      return result(bad);
    });

  add('pptx_import_limits_slides_cut_and_a_master_with_too_many_objects',
    'Au delà de 500 diapositives, les suivantes ne sont pas reprises et le rapport le dit ; un masque de plus de 150 objets de décor n\'est pas recopié (compté une seule fois, pas une fois par diapositive)',
    async () => {
      await ready();
      const { bad, expect } = checker();
      const many = await PptxImport.fromBuffer(await pptx({ slides: Array.from({ length: PptxImport.MAX_SLIDES + 1 }, () => ({})) }));
      expect('501 diapositives : 500 reprises, une coupée', many.slideCount === PptxImport.MAX_SLIDES && reportOf(many).slidesCut === 1 && (many.html.match(/page-break-marker/g) || []).length === PptxImport.MAX_SLIDES - 1, { slides: many.slideCount, report: many.report });
      const shapes = Array.from({ length: 151 }, (_, i) => sp({ id: 100 + i, name: 'Décor ' + i, x: 5 * (i % 150), y: 5, w: 30, h: 30, fill: solid('FFC000') })).join('');
      const heavy = await run1({ master: { shapes }, slides: [{ shapes: textBox(100, 200, 300, 40, para(run('Texte', 'sz="2000"'))) }, { shapes: textBox(100, 200, 300, 40, para(run('Autre', 'sz="2000"'))) }] });
      const slides = slidesOf(heavy.html);
      expect('un masque de 151 objets de décor : rien n\'est recopié, les 151 objets sont comptés une fois (pas 302)', slides.every(slide => behind(slide.frames).length === 0 && slide.frames.length === 1) && reportOf(heavy).masterObjects === 151, { report: heavy.report, behind: slides.map(slide => behind(slide.frames).length) });
      return result(bad);
    });

  // --- Ce que le fichier demande et que l'éditeur ne sait pas encore faire --------------------------------------------------------------------------------------------------------------------------
  // Le rapport le dit aussi (demande du 22/10, « Import PowerPoint sans perte », chantier 1 : « le compte rendu dit tout ») : une ligne par genre, une fois par objet (un texte, un trait, une image, un tableau),
  // jamais pour un objet qui n'arrive pas, jamais pour ce que le fichier laisse à sa valeur d'origine ni pour ce que l'éditeur fait lui-même. Chaque cas est un petit fichier dont le rapport est EXACTEMENT ce que
  // son seul objet demande : un genre de trop serait une fausse alerte. Un chantier qui apprend à reprendre une de ces choses retire son cas d'ici et sa ligne du rapport.
  const sm = (text, attrs = '', inner = '') => run(text, `sz="1400"${attrs ? ' ' + attrs : ''}`, inner);
  const lone = (paras, extra) => textBox(60, 40, 800, 300, paras, Object.assign({ id: 2 }, extra));
  const card = extra => sp(Object.assign({ id: 2, name: 'Carte', x: 60, y: 60, w: 300, h: 140, fill: solid('DDEEFF'), line: ln(2, solid('2F5597')), text: para(sm('Texte')) }, extra));
  const stroke = extra => cxn(Object.assign({ id: 3, x: 60, y: 260, w: 300, h: 0, line: ln(3, solid('C00000')) }, extra));
  const photo = extra => pic(Object.assign({ id: 4, x: 60, y: 260, w: 200, h: 140 }, extra));
  const GRADIENT = '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill>';
  const PATTERN = '<a:pattFill prst="wdUpDiag"><a:fgClr><a:srgbClr val="FF0000"/></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill>';
  const SHADOW_FX = '<a:outerShdw blurRad="63500" dist="38100" dir="2700000" algn="tl" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:outerShdw>';
  const GLOW_FX = '<a:glow rad="101600"><a:srgbClr val="FF0000"/></a:glow>';
  const SHADOW = `<a:effectLst>${SHADOW_FX}</a:effectLst>`;
  const BLIP_FILL = '<a:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>';
  const FREEFORM = '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="50" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="100"/></a:lnTo><a:lnTo><a:pt x="0" y="100"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom>';
  const translucent = alpha => `<a:solidFill><a:srgbClr val="FF0000"><a:alpha val="${alpha}"/></a:srgbClr></a:solidFill>`;
  const dashed = ln(3, solid('FF0000'), '<a:prstDash val="dash"/>');
  const listed = (inner, props = '') => para(sm('Texte'), 'marL="342900" indent="-342900"' + (props ? ' ' + props : ''), inner);
  // Le style d'un objet qui cite le deuxième style d'effet du thème (une ombre dans `THEME_EFFECTS`).
  const themed = idx => `<p:style><a:lnRef idx="0"><a:srgbClr val="000000"/></a:lnRef><a:fillRef idx="0"><a:srgbClr val="000000"/></a:fillRef><a:effectRef idx="${idx}"><a:srgbClr val="000000"/></a:effectRef><a:fontRef idx="minor"><a:srgbClr val="000000"/></a:fontRef></p:style>`;
  const THEME_EFFECTS = `<a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst>${SHADOW_FX}</a:effectLst></a:effectStyle>`;
  const SECTIONS = '<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p14:section name="Début" id="{6F1A0001-0000-4000-8000-000000000001}"><p14:sldIdLst><p14:sldId id="256"/></p14:sldIdLst></p14:section><p14:section name="Fin" id="{6F1A0002-0000-4000-8000-000000000002}"><p14:sldIdLst/></p14:section></p14:sectionLst></p:ext></p:extLst>';
  const LOSS_RELS = [IMAGE_REL('rId2', 'p.png'), IMAGE_REL('rId3', 'q.emf'), { id: 'rId9', type: 'hyperlink', target: 'https://example.org/page', external: true }];
  const LINK = '<a:hlinkClick r:id="rId9"/>';
  // Un cas : ce qu'on y lit (`label`), le rapport attendu (`expect`, {} : rien à dire), l'objet (`shapes`) et, au besoin, la diapositive (`slide` : fond, transition) et le fichier (`options`). `alone` : le cas
  // change tout le fichier (un style du masque), il ne se mêle pas aux autres dans `everyKindOfLoss`.
  const lossCase = (label, expect, shapes, more = {}) => Object.assign({ label, expect, shapes }, more);
  const lossDeck = c => Object.assign({ media: { 'p.png': TWO_TONE(), 'q.emf': btoa('EMF') }, slides: [Object.assign({ rels: LOSS_RELS }, c.slide, { shapes: c.shapes })] }, c.options);
  const sameReport = (got, want) => { const a = Object.keys(got).sort(); const b = Object.keys(want).sort(); return a.length === b.length && a.every((key, i) => key === b[i] && got[key] === want[key]); };

  // Le texte : paragraphes, caractères, puces.
  const textLosses = () => [
    lossCase('retrait hors liste', { indents: 1 }, lone(para(sm('Texte'), 'marL="457200" indent="-228600"'))),
    lossCase('tabulation', { tabs: 1 }, lone(para(sm('A\tB')))),
    lossCase('écrit de droite à gauche', { rtl: 1 }, lone(para(sm('Texte'), 'rtl="1" algn="r"'))),
    lossCase('deux colonnes', { columns: 1 }, lone(para(sm('Texte')), { body: 'numCol="2" spcCol="182880"' })),
    lossCase('texte vertical', { vertical: 1 }, lone(para(sm('Texte')), { body: 'vert="vert270"' })),
    lossCase('espacement des caractères', { charSpacing: 1 }, lone(para(sm('Texte', 'spc="300"')))),
    lossCase('petites capitales', { smallCaps: 1 }, lone(para(sm('Texte', 'cap="small"')))),
    lossCase('ombre et contour des lettres : une seule fois pour le texte', { textEffects: 1 },
      lone(para(sm('Ombre', '', SHADOW) + sm(' Contour', '', '<a:ln w="12700"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln>')))),
    lossCase('lettres en dégradé', { textGradient: 1 }, lone(para(sm('Texte', '', GRADIENT)))),
    lossCase('souligné double', { underlines: 1 }, lone(para(sm('Texte', 'u="dbl"')))),
    lossCase('police que l\'éditeur n\'a pas', { fonts: 1 }, lone(para(sm('Texte', '', '<a:latin typeface="Comic Sans MS"/>')))),
    lossCase('puce d\'une autre couleur que le texte', { bulletLook: 1 }, lone(listed('<a:buClr><a:srgbClr val="FF0000"/></a:buClr><a:buChar char="•"/>'))),
    lossCase('puce agrandie à 150 %', { bulletLook: 1 }, lone(listed('<a:buSzPct val="150000"/><a:buChar char="•"/>'))),
    lossCase('puce d\'un autre signe : une flèche', { bulletChars: 1 }, lone(listed('<a:buFont typeface="Arial"/><a:buChar char="→"/>'))),
    lossCase('numérotation en lettres majuscules', { bulletChars: 1 }, lone(listed('<a:buAutoNum type="alphaUcPeriod"/>'))),
    lossCase('puce en image : le retrait de la puce n\'est pas compté en plus', { bulletImages: 1 }, lone(listed('<a:buBlip><a:blip r:embed="rId2"/></a:buBlip>'))),
  ];
  // Les formes et les traits.
  const objectLosses = () => [
    lossCase('trait en tirets (forme)', { dashes: 1 }, card({ line: dashed })),
    lossCase('trait en pointillés (trait)', { dashes: 1 }, stroke({ line: ln(3, solid('FF0000'), '<a:prstDash val="sysDot"/>') })),
    lossCase('trait double', { compoundLines: 1 }, card({ line: '<a:ln w="76200" cmpd="dbl"><a:solidFill><a:srgbClr val="2F5597"/></a:solidFill></a:ln>' })),
    lossCase('bouts arrondis', { lineEnds: 1 }, stroke({ line: '<a:ln w="38100" cap="rnd"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln>' })),
    lossCase('pointe en losange', { lineEnds: 1 }, stroke({ line: ln(2, solid('FF0000'), '<a:tailEnd type="diamond"/>') })),
    lossCase('pointe en triangle, large', { lineEnds: 1 }, stroke({ line: ln(2, solid('FF0000'), '<a:tailEnd type="triangle" w="lg" len="med"/>') })),
    lossCase('ombre portée', { shadows: 1 }, card({ effects: SHADOW })),
    lossCase('ombre portée d\'un trait', { shadows: 1 }, stroke({ effects: SHADOW })),
    lossCase('ombre du thème citée par le style de l\'objet (effectRef)', { shadows: 1 }, card({ style: themed(2) }), { options: { effects: THEME_EFFECTS } }),
    lossCase('lueur', { effects: 1 }, card({ effects: `<a:effectLst>${GLOW_FX}</a:effectLst>` })),
    lossCase('reflet et bords adoucis : un seul objet, une seule fois', { effects: 1 },
      card({ effects: '<a:effectLst><a:reflection blurRad="6350" stA="50000" endA="300" endPos="35000" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/><a:softEdge rad="63500"/></a:effectLst>' })),
    lossCase('relief', { relief: 1 }, card({ effects: '<a:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></a:scene3d><a:sp3d><a:bevelT w="63500" h="63500"/></a:sp3d>' })),
    lossCase('rotation en 3D', { relief: 1 }, card({ effects: '<a:scene3d><a:camera prst="perspectiveLeft"><a:rot lat="0" lon="1200000" rev="0"/></a:camera><a:lightRig rig="threePt" dir="t"/></a:scene3d>' })),
    lossCase('fond translucide', { transparency: 1 }, card({ fill: translucent(40000) })),
    lossCase('trait translucide', { transparency: 1 }, card({ line: ln(3, translucent(40000)) })),
    lossCase('trait translucide d\'un connecteur', { transparency: 1 }, stroke({ line: ln(3, translucent(40000)) })),
    lossCase('fond en motif', { patterns: 1 }, card({ fill: PATTERN })),
    lossCase('fond en image sur une ellipse', { shapePictures: 1 }, card({ prst: 'ellipse', fill: BLIP_FILL })),
    lossCase('fond en image en mosaïque', { shapePictures: 1 }, card({ fill: '<a:blipFill><a:blip r:embed="rId2"/><a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/></a:blipFill>' })),
    lossCase('objet masqué', { hiddenObjects: 1 }, card({ cnv: 'hidden="1"' })),
    lossCase('bulle ovale', { callouts: 1 }, card({ prst: 'wedgeEllipseCallout' })),
    lossCase('bulle rectangulaire', { callouts: 1 }, card({ prst: 'wedgeRectCallout' })),
    lossCase('lien posé sur une forme', { objectLinks: 1 }, card({ cnvInner: LINK })),
    lossCase('texte alternatif d\'une forme', { altTexts: 1 }, card({ cnv: 'descr="Un bouton"' })),
    lossCase('lien et texte alternatif d\'un trait', { objectLinks: 1, altTexts: 1 }, stroke({ cnv: 'descr="Une flèche"', cnvInner: LINK })),
    lossCase('plusieurs pertes sur un même objet : une fois chacune', { dashes: 1, shadows: 1, effects: 1, transparency: 1 },
      card({ line: ln(3, translucent(40000), '<a:prstDash val="dash"/>'), effects: `<a:effectLst>${SHADOW_FX}${GLOW_FX}</a:effectLst>` })),
    lossCase('tracé libre non repris : ses pertes ne sont pas comptées', { shapes: 1 }, sp({ id: 2, name: 'Tracé', x: 60, y: 60, w: 100, h: 60, prst: '', geom: FREEFORM, line: dashed, effects: SHADOW }), { alone: true }),
    lossCase('objet masqué : seulement dit masqué', { hiddenObjects: 1 }, card({ cnv: 'hidden="1"', line: dashed, effects: SHADOW }), { alone: true }),
    lossCase('image illisible : seulement dite illisible', { images: 1 }, photo({ rid: 'rId3', spPrInner: SHADOW, cnvInner: LINK }), { alone: true }),
  ];
  // Les images, les tableaux, les diapositives et le fichier.
  const fileLosses = () => {
    const cells = list => table({ id: 6, x: 60, y: 60, cols: [150, 150], rows: [{ h: 40, cells: list }] });
    return [
      lossCase('image rognée en ellipse', { imageShapes: 1 }, photo({ geom: '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>' })),
      lossCase('image rognée en forme libre', { imageShapes: 1 }, photo({ geom: FREEFORM })),
      lossCase('image en niveaux de gris', { imageAdjust: 1 }, photo({ blip: '<a:grayscl/>' })),
      lossCase('image : luminosité et contraste', { imageAdjust: 1 }, photo({ blip: '<a:lum bright="40000" contrast="-20000"/>' })),
      lossCase('image recolorée', { imageAdjust: 1 }, photo({ blip: '<a:duotone><a:srgbClr val="000080"/><a:srgbClr val="FFFFFF"/></a:duotone>' })),
      lossCase('image avec une bordure', { imageFrames: 1 }, photo({ spPrInner: ln(3, solid('FF0000')) })),
      lossCase('image avec une ombre', { imageFrames: 1 }, photo({ spPrInner: SHADOW })),
      lossCase('lien posé sur une image', { objectLinks: 1 }, photo({ cnvInner: LINK })),
      lossCase('tableau : fonds de case en dégradé et en motif, une fois pour le tableau', { cellFills: 1 }, cells([{ text: 'A', fillXml: GRADIENT }, { text: 'B', fillXml: PATTERN }])),
      lossCase('tableau : texte vertical dans une case', { vertical: 1 }, cells([{ text: 'A', vert: 'vert270' }, { text: 'B' }])),
      lossCase('tableau : espacement des caractères dans une case', { charSpacing: 1 }, cells([{ text: 'A', attrs: 'sz="1200" spc="300"' }, { text: 'B' }])),
      lossCase('fond de diapositive en motif', { slidePatterns: 1 }, '', { slide: { bg: `<p:bg><p:bgPr>${PATTERN}<a:effectLst/></p:bgPr></p:bg>` } }),
      lossCase('diapositive qui avance seule après un délai', { timings: 1 }, '', { slide: { transition: '<p:transition spd="med" advTm="3000"><p:fade/></p:transition>' } }),
      lossCase('minutage et effet de transition inconnu', { transitions: 1, timings: 1 }, '', { slide: { transition: '<p:transition advTm="2000"><p:checker/></p:transition>' } }),
      lossCase('sections de diapositives', { sections: 2 }, '', { options: { presentationExt: SECTIONS } }),
      lossCase('police du thème : comptée sous son vrai nom, le thème dit avec elle', { fonts: 1, theme: 1 }, lone(para(sm('Titre', '', '<a:latin typeface="+mj-lt"/>')))),
      lossCase('couleurs du thème : dites avec une autre ligne', { dashes: 1, theme: 1 }, card({ fill: scheme('accent1'), line: dashed })),
    ];
  };
  // Tout ce que le fichier peut demander, une fois chaque : une diapositive par cas (les cas qui changent tout le fichier n'y sont pas) ; `expect` en est le rapport attendu. Le test à la vraie souris le donne à choisir
  // pour voir la fenêtre au rapport le plus long.
  function everyKindOfLoss() {
    const cases = textLosses().concat(objectLosses(), fileLosses()).filter(c => !c.alone);
    const options = { media: { 'p.png': TWO_TONE(), 'q.emf': btoa('EMF') }, slides: cases.map(c => Object.assign({ rels: LOSS_RELS }, c.slide, { shapes: c.shapes })) };
    cases.forEach((c) => { Object.assign(options, c.options); });
    const expect = {};
    cases.forEach((c) => { Object.keys(c.expect).forEach((key) => { expect[key] = (expect[key] || 0) + c.expect[key]; }); });
    expect.theme = Math.min(expect.theme, 1);
    return { options, expect };
  }

  const runLosses = async (list) => {
    const { bad, expect } = checker();
    for (const c of list) {
      const got = reportOf(await run1(lossDeck(c)));
      expect(c.label, sameReport(got, c.expect), { got, want: c.expect });
    }
    return result(bad);
  };
  add('pptx_import_report_says_what_a_text_asks_and_the_editor_cannot_do',
    'Le rapport dit, une fois par texte, ce que le fichier demande d\'un texte et que l\'éditeur ne sait pas faire : retraits, tabulations, droite à gauche, colonnes, texte vertical, espacement des caractères, petites capitales, ombre ou contour des lettres, dégradé, souligné autre que simple, police absente, puce d\'une autre couleur ou taille, d\'un autre signe, en image',
    () => runLosses(textLosses()));
  add('pptx_import_report_says_what_a_shape_or_a_line_asks_and_the_editor_cannot_draw',
    'Le rapport dit, une fois par objet et par genre, ce que le fichier demande d\'une forme ou d\'un trait que l\'éditeur ne dessine pas : tirets, trait double, bouts, ombre (celle du thème comprise), lueur, reflet, relief, transparence, motif, image en fond, objet masqué, bulle ovale, lien, texte alternatif ; jamais pour un objet qui n\'arrive pas',
    () => runLosses(objectLosses()));
  add('pptx_import_report_says_what_an_image_a_table_a_slide_or_the_file_asks_and_the_editor_cannot_do',
    'Le rapport dit ce que le fichier demande d\'une image (forme, réglages, bordure, ombre, lien), d\'un tableau (fonds en dégradé ou en motif, texte vertical), d\'une diapositive (fond en motif, minutage), du fichier (sections, thème figé, police du thème sous son vrai nom)',
    () => runLosses(fileLosses()));

  add('pptx_import_report_says_nothing_of_what_the_editor_does_itself_or_the_file_leaves_alone',
    'Aucune ligne pour ce que l\'éditeur fait lui-même (interligne et espaces, que « Paragraphe… » reprend, retraits de liste, six polices, puces rond, rond creux, carré, cases, 1. a. i., couleur et taille de puce du texte, soulignement simple, effets vides, trait plein, pointe triangle moyenne, opacité à 100 %, image sur un rectangle, rognage rectangulaire, bulle à coins arrondis) ni pour une valeur laissée à celle d\'origine ; le thème seul n\'ouvre pas de fenêtre',
    async () => {
      const kept = [
        lossCase('interligne simple (100 %) et celui de l\'éditeur (121 %)', {}, lone(para(sm('Un'), '', '<a:lnSpc><a:spcPct val="100000"/></a:lnSpc>') + para(sm('Deux'), '', '<a:lnSpc><a:spcPct val="121000"/></a:lnSpc>'))),
        lossCase('espace avant le premier paragraphe et après le dernier : rien entre eux', {}, lone(para(sm('Un'), '', '<a:spcBef><a:spcPts val="1800"/></a:spcBef>') + para(sm('Deux'), '', '<a:spcAft><a:spcPts val="1800"/></a:spcAft>'))),
        lossCase('espaces nuls', {}, lone(para(sm('Un'), '', '<a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft>') + para(sm('Deux'), '', '<a:spcBef><a:spcPct val="0"/></a:spcBef>'))),
        lossCase('retrait d\'un point de liste', {}, lone(listed('<a:buChar char="•"/>'))),
        lossCase('sens, colonnes et écriture ordinaires', {}, lone(para(sm('Texte'), 'rtl="0"'), { body: 'numCol="1" vert="horz"' })),
        lossCase('espacement nul, majuscules, souligné simple, barré, gras, italique, exposant', {}, lone(para(sm('Texte', 'spc="0" cap="all" u="sng" strike="sngStrike" b="1" i="1" baseline="30000"')))),
        lossCase('effets vides et contour sans fond', {}, lone(para(sm('Texte', '', '<a:ln w="12700"><a:noFill/></a:ln><a:effectLst/>')))),
        lossCase('les six polices de l\'éditeur et celle du thème', {}, lone(['Roboto', 'Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Calibri'].map(face => para(sm(face, '', `<a:latin typeface="${face}"/>`))).join('') + para(sm('Thème', '', '<a:latin typeface="+mn-lt"/>')))),
        lossCase('les puces que l\'éditeur dessine, de la couleur et de la taille du texte', {}, lone(
          ['<a:buChar char="•"/>', '<a:buChar char="o"/>', '<a:buChar char="§"/>', '<a:buChar char="☐"/>', '<a:buChar char="☑"/>', '<a:buAutoNum type="arabicPeriod"/>', '<a:buAutoNum type="alphaLcPeriod"/>', '<a:buAutoNum type="romanLcPeriod"/>']
            .map(bullet => para(sm('Texte', '', solid('C00000')), 'marL="342900" indent="-342900"', `<a:buClr><a:srgbClr val="C00000"/></a:buClr><a:buSzPct val="100000"/>${bullet}`)).join('')
          + para(sm('Taille', '', solid('C00000')), 'marL="342900" indent="-342900"', '<a:buSzPts val="1400"/><a:buChar char="•"/>'))),
        lossCase('un paragraphe vide garde ses réglages sans les compter', {}, lone(para('', 'marL="457200" indent="-228600"', '<a:lnSpc><a:spcPct val="150000"/></a:lnSpc><a:spcBef><a:spcPts val="1800"/></a:spcBef>'))),
        lossCase('trait plein dit en toutes lettres, composé simple, bouts plats', {}, card({ line: '<a:ln w="38100" cap="flat" cmpd="sng"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:prstDash val="solid"/></a:ln>' })),
        lossCase('pointe en triangle de taille moyenne aux deux bouts', {}, stroke({ line: ln(2, solid('FF0000'), '<a:headEnd type="triangle" w="med" len="med"/><a:tailEnd type="triangle"/>') })),
        lossCase('opacité de 100 % dite en toutes lettres', {}, card({ fill: translucent(100000), line: ln(3, translucent(100000)) })),
        lossCase('liste d\'effets vide de l\'objet : l\'ombre du thème ne s\'applique pas', {}, card({ style: themed(2), effects: '<a:effectLst/>' }), { options: { effects: THEME_EFFECTS } }),
        lossCase('bulle à coins arrondis, fond en image sur un rectangle, texte alternatif d\'une image', {}, card({ prst: 'wedgeRoundRectCallout' }) + card({ id: 5, fill: BLIP_FILL }) + photo({ descr: 'Un logo' })),
        lossCase('image sur un rectangle : transparence et luminosité nulle', {}, photo({ blip: '<a:alphaModFix amt="50000"/><a:lum/>' })),
        lossCase('tableau aux fonds unis', {}, table({ id: 6, x: 60, y: 60, cols: [150, 150], rows: [{ h: 40, cells: [{ text: 'A', fill: 'FFFF00' }, { text: 'B', vert: 'horz' }, ] }] })),
        lossCase('case vide à texte vertical', {}, table({ id: 6, x: 60, y: 60, cols: [150, 150], rows: [{ h: 40, cells: [{ vert: 'vert270' }, { text: 'B' }] }] })),
        lossCase('diapositive à fond uni qui avance au clic', {}, '', { slide: { bg: `<p:bg><p:bgPr>${solid('FFF2CC')}<a:effectLst/></p:bgPr></p:bg>`, transition: '<p:transition spd="med" advClick="1"><p:fade/></p:transition>' } }),
        lossCase('couleurs du thème seules : pas de fenêtre pour elles', {}, card({ fill: scheme('accent1') })),
      ];
      return runLosses(kept);
    });

  add('pptx_import_report_counts_each_loss_once_whatever_the_passes_over_the_text',
    'Une perte est comptée une seule fois : pas une fois par essai de réduction d\'un texte ou d\'un tableau, pas une fois par diapositive qui montre le décor (une fois pour le masque, une fois pour la mise en page), une police une fois pour tout le fichier (la casse ne change rien), jamais pour l\'espace réservé du masque',
    async () => {
      const { bad, expect } = checker();
      // Un texte trop haut pour sa boîte : l'éditeur l'essaie à plusieurs tailles avant de le garder réduit ; ses liens, son espacement et sa tabulation sont comptés comme dans le fichier, une fois.
      const jump = n => run('Lien ' + n, 'sz="2000" spc="300"', '<a:hlinkClick r:id="rId8" action="ppaction://hlinksldjump"/>');
      const reduced = await run1({ slides: [{ rels: [{ id: 'rId8', type: 'slide', target: 'slide1.xml' }],
        shapes: textBox(40, 100, 300, 50, para(jump(1) + run(' et ', 'sz="2000"') + jump(2)) + para(run('Deuxième paragraphe\tavec tabulation', 'sz="2000"')), { id: 2 }) }] });
      expect('un texte réduit : une réduction, deux liens, une tabulation, un espacement des caractères', sameReport(reportOf(reduced), { shrunk: 1, slideLinks: 2, tabs: 1, charSpacing: 1 }), reduced.report);
      // Un tableau trop haut : même chose, l'espacement de ses caractères est compté une fois pour le tableau.
      const long = attrs => ({ text: 'Un texte assez long pour que la case grandisse beaucoup', attrs });
      const squeezed = await run1({ slides: [{ shapes: table({ x: 60, y: 100, cols: [200, 200], rows: [{ h: 20, cells: [long('sz="2000" spc="300"'), long('sz="2000" spc="300"')] }] }) }] });
      expect('un tableau réduit : une réduction, un espacement des caractères', sameReport(reportOf(squeezed), { shrunk: 1, charSpacing: 1 }), squeezed.report);
      // Le décor du masque et de la mise en page, montré par trois diapositives : compté une fois chacun ; l'espace réservé du masque (un texte espacé) n'est jamais compté.
      const bar = (id, name, y, hex, extra) => sp(Object.assign({ id, name, x: 0, y, w: 960, h: 40, fill: solid(hex), line: dashed }, extra));
      const own = textBox(100, 200, 300, 40, para(run('Propre', 'sz="2000"')), { id: 2 });
      const decor = await run1({
        master: { shapes: bar(20, 'Bandeau', 0, 'FFC000', { effects: SHADOW }) + sp({ id: 2, name: 'Titre', x: 50, y: 60, w: 860, h: 70, ph: '<p:ph type="title"/>', prst: '', text: para(run('Cliquez', 'sz="1400" spc="300"')) }) },
        layout: { shapes: bar(30, 'Bas', 500, '70AD47', {}) },
        slides: [{ shapes: own }, { shapes: own }, { shapes: own }],
      });
      expect('le décor sur trois diapositives : deux traits en tirets et une ombre, une fois ; le texte espacé de l\'espace réservé du masque, jamais', sameReport(reportOf(decor), { dashes: 2, shadows: 1 }), decor.report);
      // Une police est comptée une fois pour tout le fichier, quelle que soit la casse de son nom.
      const faces = await run1({ slides: [
        { shapes: lone(para(sm('Un', '', '<a:latin typeface="Comic Sans MS"/>') + sm(' deux', '', '<a:latin typeface="Verdana"/>'))) },
        { shapes: lone(para(sm('Trois', '', '<a:latin typeface="Comic Sans MS"/>'))) + card({ id: 5, text: para(sm('Quatre', '', '<a:latin typeface="comic sans ms"/>')) }) },
      ] });
      expect('quatre emplois de deux polices : deux polices', sameReport(reportOf(faces), { fonts: 2 }), faces.report);
      return result(bad);
    });

  add('pptx_import_report_every_kind_of_loss_at_once',
    'Un fichier qui demande de tout à la fois (une diapositive par cas) : chaque genre est compté exactement, le rapport suit l\'ordre de PptxImport.REPORT_KEYS, le thème est dit avec les autres lignes ; chaque genre du rapport a son cas ici',
    async () => {
      const { options, expect: want } = everyKindOfLoss();
      const r = await run1(options);
      const { bad, expect } = checker();
      expect('chaque genre est compté exactement : la somme des cas', sameReport(reportOf(r), want), { got: reportOf(r), want });
      expect('le rapport suit l\'ordre de PptxImport.REPORT_KEYS', JSON.stringify(r.report.map(item => item.key)) === JSON.stringify(PptxImport.REPORT_KEYS.filter(key => want[key])), r.report.map(item => item.key));
      const older = ['animations', 'charts', 'diagrams', 'tables', 'tablesMoved', 'shrunk', 'embedded', 'media', 'ink', 'equations', 'comments', 'images', 'shapes', 'connectors', 'gradients', 'transitions', 'slideLinks', 'hidden', 'masterObjects', 'slidesCut', 'unreadable'];
      const missing = PptxImport.REPORT_KEYS.filter(key => !older.includes(key) && !want[key]);
      expect('chaque genre du rapport a son cas : aucun n\'est sans essai', missing.length === 0, missing);
      return result(bad);
    });

  add('pptx_import_report_lines_are_written_in_both_languages_with_their_plural',
    'Chaque genre du rapport a sa ligne en français et en anglais, au singulier (1) et au pluriel (2), sans variable ni barre laissée dans le texte, sans parenthèses de pluriel, et la ligne anglaise n\'est pas le repli français',
    async () => {
      await ready();
      const { bad, expect } = checker();
      const was = I18n.getLang();
      const lines = {};
      try {
        for (const lang of ['fr', 'en']) {
          I18n.setLang(lang);
          lines[lang] = {};
          PptxImport.REPORT_KEYS.forEach((key) => {
            const id = 'pptx.import.report.' + key;
            const one = I18n.t(id, { n: 1, max: 500 });
            const two = I18n.t(id, { n: 2, max: 500 });
            lines[lang][key] = one;
            expect(lang + ' ' + key + ' : la clé existe', I18n.has(id), id);
            expect(lang + ' ' + key + ' : au singulier « ' + one + ' »', /^1 \S/.test(one) && !/[{}|]/.test(one), one);
            expect(lang + ' ' + key + ' : au pluriel « ' + two + ' »', /^2 \S/.test(two) && !/[{}|]/.test(two) && two !== one.replace(/^1/, '2'), two);
            expect(lang + ' ' + key + ' : pas de pluriel entre parenthèses', !/\(s\)|\(es\)/.test(one + two), one);
          });
        }
      } finally { I18n.setLang(was); }
      PptxImport.REPORT_KEYS.forEach((key) => {
        expect(key + ' : la ligne anglaise n\'est pas celle du français', lines.en[key] !== lines.fr[key], lines.en[key]);
      });
      return result(bad);
    });


  // --- L'aller-retour et l'éditeur --------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Une présentation de l'éditeur (le HTML qu'il écrit : repères de diapositive, cadres, formes, traits, tableau) exportée en PowerPoint (js/pptx-export.js) puis importée : les deux moteurs s'accordent.
  const BR = '<div class="page-break-marker"></div>';
  add('pptx_import_round_trip_with_the_editor_s_own_powerpoint_export',
    'Une présentation écrite par l\'export PowerPoint de l\'éditeur puis importée redonne les mêmes cadres (place au point près, taille, forme, fond, trait, rotation, retournement, pointes), le même texte et ses marques, le même fond, les mêmes notes, la même transition (durée comprise)',
    async () => {
      await ExportEngines.ensure('pptx', 'pptxImport');
      const slideA = SlideProps.html({ bg: '#fff7e6', notes: 'Première ligne\nDeuxième avec une apostrophe \' et un & et un <', transition: 'push', from: 'l', dur: 900 })
        + FreeFrame.html({ x: 60, y: 60, w: 400, h: 80 }, '<p><span style="font-size: 24pt"><strong>Titre en gras</strong></span></p>')
        + FreeFrame.html({ x: 60, y: 180, w: 260, h: 120, shape: 'rect', fill: '#d9e2f3', line: '#2f5597', lw: 1.5 }, '<p style="text-align: center">Rectangle</p>')
        + FreeFrame.html({ x: 380, y: 180, w: 220, h: 120, shape: 'ellipse', fill: '#fde68a', line: '#b45309', lw: 2, rot: 30 }, '<p>Ellipse à 30°</p>')
        + FreeFrame.html({ x: 60, y: 360, w: 300, h: 0, shape: 'line', line: '#2f5597', lw: 3, head: 'triangle', tail: 'triangle' }, '')
        + FreeFrame.html({ x: 420, y: 340, w: 200, h: 80, shape: 'line', line: '#c00000', lw: 2, flip: 'v', tail: 'triangle' }, '')
        + FreeFrame.html({ x: 700, y: 340, w: 180, h: 100, shape: 'rect', fill: '#be185d' }, '<p></p>')
        + '<p></p>' + BR;
      const slideB = FreeFrame.html({ x: 60, y: 60, w: 500, h: 60 }, '<p><span style="font-size: 20pt">Un </span><span style="font-size: 20pt; background-color: #fef08a">surligné</span><span style="font-size: 20pt"> et </span><a href="https://example.org/a"><span style="font-size: 20pt">un lien</span></a></p>')
        + '<table><tbody><tr><th colspan="2"><p>Entête</p></th></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table><p></p>';
      const html = slideA + slideB;
      await PageLayout.setMarginsMm(SlidesEntry.pageFor('presentation', null));
      const blob = await PptxExport.fromHtml(html, { marginsPt: PageLayout.getMarginsPt(), title: 'Essai' });
      const imported = await PptxImport.fromBuffer(await blob.arrayBuffer());
      const { bad, expect } = checker();
      expect('deux diapositives, la même page (16:9)', imported.slideCount === 2 && imported.page.format === PageLayout.SLIDE_FORMAT && imported.page.orientation === 'landscape', { slides: imported.slideCount, page: imported.page });
      const [a, b] = slidesOf(imported.html);
      expect('le fond, les notes (apostrophe, & et < compris) et la transition (poussé depuis la gauche, 900 ms) sont ceux de l\'éditeur',
        a.props && a.props.bg === '#fff7e6' && a.props.notes === 'Première ligne\nDeuxième avec une apostrophe \' et un & et un <' && a.props.transition === 'push' && a.props.from === 'l' && a.props.dur === 900, a.props);
      const want = [
        { shape: '', x: 60, y: 60, w: 400, h: 80 },
        { shape: 'rect', x: 60, y: 180, w: 260, h: 120, fill: '#d9e2f3', line: '#2f5597', lw: 1.5 },
        { shape: 'ellipse', x: 380, y: 180, w: 220, h: 120, fill: '#fde68a', line: '#b45309', lw: 2, rot: 30 },
        { shape: 'line', x: 60, y: 360, w: 300, h: 0, line: '#2f5597', lw: 3, head: 'triangle', tail: 'triangle' },
        { shape: 'line', x: 420, y: 340, w: 200, h: 80, line: '#c00000', lw: 2, flip: 'v', tail: 'triangle' },
        { shape: 'rect', x: 700, y: 340, w: 180, h: 100, fill: '#be185d' },
      ];
      expect('six cadres sur la diapositive 1', a.frames.length === want.length, a.frames.length);
      want.forEach((w, i) => {
        const got = a.frames[i];
        if (!got) return;
        const wrong = ['x', 'y', 'w', 'h'].filter(k => !near(got[k], w[k], 0.6)).concat(['shape', 'fill', 'line', 'flip', 'head', 'tail'].filter(k => (w[k] || '') !== got[k])).concat(w.lw !== undefined && !near(got.lw, w.lw, 0.05) ? ['lw'] : []).concat(w.rot !== undefined && !near(got.rot, w.rot, 0.05) ? ['rot'] : []);
        expect('le cadre ' + (i + 1) + ' (' + (w.shape || 'texte') + ') revient tel quel', wrong.length === 0, { wrong, got: { shape: got.shape, x: got.x, y: got.y, w: got.w, h: got.h, fill: got.fill, line: got.line, lw: got.lw, rot: got.rot, flip: got.flip, head: got.head, tail: got.tail } });
      });
      expect('le titre garde son gras et sa taille (24 pt)', !!a.frames[0] && /<strong>/.test(a.frames[0].inner) && /font-size: 24pt/.test(a.frames[0].inner) && /Titre en gras/.test(a.frames[0].text), a.frames[0] && a.frames[0].inner);
      expect('les textes de la forme et de l\'ellipse sont gardés, celui du rectangle centré', /Rectangle/.test(a.frames[1].text) && /text-align: center/.test(a.frames[1].inner) && /Ellipse à 30°/.test(a.frames[2].text), [a.frames[1].inner, a.frames[2].text]);
      expect('le texte de la diapositive 2 garde son surlignage et son lien', !!b.frames[0] && /background-color: #fef08a">\s*surligné/.test(b.frames[0].inner) && /<a href="https:\/\/example\.org\/a">/.test(b.frames[0].inner), b.frames[0] && b.frames[0].inner);
      const cells = b.tables[0] ? Array.from(b.tables[0].querySelectorAll('th, td')).map(c => c.textContent.trim() + (c.colSpan > 1 ? '*' + c.colSpan : '')).join('|') : null;
      expect('le tableau de la diapositive 2 revient avec sa case d\'entête sur deux colonnes', cells === 'Entête*2|A|B', cells);
      expect('rien d\'autre à dire que ce que l\'export ne sait pas écrire : rien', imported.report.length === 0, imported.report);
      return result(bad);
    });

  add('pptx_import_result_loads_in_the_editor_on_the_slide_page_without_overflow',
    'Le texte importé s\'ouvre dans l\'éditeur sur la page du fichier : une diapositive par page, chaque cadre à sa place, aucun cadre qui sorte de sa page (hors un décor rogné), et rien ne se perd au chargement',
    async (h) => {
      const r = await run1({
        master: { shapes: sp({ id: 20, name: 'Bandeau', x: 0, y: 0, w: 960, h: 40, fill: scheme('accent1') }) },
        slides: [
          { shapes: textBox(40, 60, 880, 60, para(run('Titre', 'sz="3200"'))) + sp({ id: 3, name: 'Carte', x: 40, y: 140, w: 400, h: 200, fill: solid('E7E6E6'), line: ln(2, solid('444444')), text: para(run('Carte', 'sz="2000"')) }) + cxn({ id: 4, x: 500, y: 150, w: 300, h: 150, line: ln(3, solid('C00000'), '<a:tailEnd type="triangle"/>') }) },
          { shapes: textBox(40, 60, 880, 60, para(run('Deux', 'sz="3200"'))) + textBox(40, 150, 600, 300, para(run('Un texte plus long, ', 'sz="2000"') + run('sur plusieurs lignes quand la zone est pleine, vraiment long long long long long.', 'sz="2000"')) + para(run('Deuxième paragraphe', 'sz="2000"'))) },
          { shapes: sp({ id: 3, name: 'Rotation', x: 300, y: 150, w: 360, h: 200, prst: 'ellipse', fill: solid('FFC000'), xf: 'rot="1200000"', text: para(run('Tournée', 'sz="2400"')) }) },
        ],
      });
      const { bad, expect } = checker();
      const html = await inEditor(h, r);
      const s = sheet();
      const frames = Array.from(document.querySelectorAll('.tiptap .pp-free-frame'));
      const declared = slidesOf(r.html).reduce((n, slide) => n + slide.frames.length, 0);
      expect('l\'éditeur garde les neuf cadres du fichier (4 + 3 + 2, le bandeau du masque compris sur chaque diapositive)', frames.length === declared && declared === 9, { frames: frames.length, declared });
      expect('trois diapositives : deux sauts de page dans le texte', document.querySelectorAll('.tiptap .page-break-marker').length === 2, document.querySelectorAll('.tiptap .page-break-marker').length);
      const out = frames.filter(el => !el.classList.contains('pp-free-frame-behind') && FreeFrame.overflowsPage(el));
      expect('aucun cadre n\'est signalé comme sortant de sa diapositive (le point rouge de la bande ne s\'allume pas)', out.length === 0, out.map(el => FreeFrame.measuresOf(el)));
      const boxTop = el => (el.querySelector('.pp-free-frame-box').getBoundingClientRect().top - s.rect.top) / s.zoom * 0.75;
      const title = frames[1];
      expect('le titre de la diapositive 1 (après le bandeau du masque) est à 60 pt du haut de la page, le bandeau à 0', !!title && near(boxTop(title), 60, 1.5) && near(boxTop(frames[0]), 0, 1.5), title && [boxTop(frames[0]), boxTop(title)]);
      const pageSize = PageLayout.getPageSizePt();
      expect('la page de l\'éditeur est celle du fichier : 960 x 540 pt', near(pageSize.width, 960.09, 0.2) && near(pageSize.height, 540, 0.2), pageSize);
      expect('l\'HTML relu après chargement garde les attributs des cadres (x, y, largeur, hauteur)', /data-ff-x="40"/.test(html) && /data-ff-w="880"/.test(html), html.slice(0, 200));
      return result(bad);
    });

  // Les mêmes briques pour le test à la vraie souris (dev-tests/verify-pptx-import-mouse.mjs) : il charge ce fichier dans la page et y fabrique ses fichiers .pptx, sans fichier binaire dans le dépôt.
  window.PptxFixtures = { pptx, sp, textBox, cxn, pic, grp, table, png, TWO_TONE, para, run, solid, scheme, ln, xfrm, emu, IMAGE_REL, everyKindOfObject, everyKindOfLoss };
  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pptxImport = cases;
})();
