// Suite "odpImport" - l'IMPORT d'une présentation OpenDocument (js/odp-import.js) : un fichier .odp (ou son modèle .otp, ou le .fodp « flat ») devient une PRÉSENTATION de l'éditeur, sur le modèle de l'import PowerPoint
// (js/pptx-import.js ; chantier « formats libres » ouvert le 17/11 par Antoine : « le premier et les 3 derniers », étude du 13/11). Le texte de chaque diapositive est lu tel que js/import-placing.js le pose.
//
// Les fichiers de l'essai sont ÉCRITS ICI, partie par partie (un zip OpenDocument : JSZip, XML comme LibreOffice Impress l'écrit - styles automatiques `gr1`, `pr1`, `P1`, `T1`, pages `draw:page`, cadres `draw:frame`,
// formes `draw:custom-shape` en `ooxml-*`, rotation `draw:transform="rotate (..) translate (..)"`) : chaque cas dit ce que son fichier contient et ce que l'import doit en faire, sans fichier binaire dans le dépôt.
// Les valeurs de rotation et de position sont celles que LibreOffice 24.2 a écrites pour une forme tournée de 20 degrés (relevé du 17/11). Ce que les cas vérifient :
//  - le fichier : refusé avec son code (pas un zip, sans contenu, protégé, texte, tableur, aucune diapositive, trop gros) ; le « flat », le modèle ; la page (taille de la page maîtresse, sens, page trop grande) ;
//  - le texte : cadres de texte et emplacements (titre, plan), séries de caractères, aspect hérité du style de l'objet, listes, ancrage (haut, milieu), marges ;
//  - les formes : sorte de la norme (`ooxml-*`) et de LibreOffice, réglages, fond, transparence, trait, tiret, rotation, forme inconnue ; les traits et connecteurs (pointes, sens) ; les images (texte alternatif, rognage,
//    format illisible) ; les tableaux (fonds, traits, aperçu du tableau) ; les groupes mis à plat ;
//  - la diapositive : fond (uni, de la maîtresse, dégradé), notes, masquée, passage (effet, durée), décor de la page maîtresse (derrière le texte, une fois par maîtresse, caché par « objets de l'arrière-plan ») ;
//  - le compte rendu : chaque genre non repris compté une fois à sa place, les genres du texte avec leur portée, jamais en silence ; les plafonds (diapositives, annulation).
(function () {
  const cases = [];
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const add = (id, description, run) => cases.push({ id, description, run });
  const checker = () => {
    const bad = [];
    return { bad, expect: (label, condition, detail) => { if (!condition) bad.push(label + (detail === undefined ? '' : ' : ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); } };
  };
  const failure = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const ready = () => ExportEngines.ensure(['odpImport', 'odtImport']);
  const dom = html => new DOMParser().parseFromString('<body>' + html, 'text/html').body;
  const CM = 72 / 2.54;
  const near = (a, b, tolerance = 0.06) => Math.abs(Number(a) - Number(b)) <= tolerance;

  // --- Le paquet : ce que LibreOffice écrit, en plus court ---------------------------------------------------------------------------------------------------------------------
  const URN = 'urn:oasis:names:tc:opendocument:xmlns:';
  const NS = `xmlns:office="${URN}office:1.0" xmlns:style="${URN}style:1.0" xmlns:text="${URN}text:1.0" xmlns:table="${URN}table:1.0" xmlns:draw="${URN}drawing:1.0" xmlns:fo="${URN}xsl-fo-compatible:1.0" xmlns:svg="${URN}svg-compatible:1.0"`
    + ` xmlns:presentation="${URN}presentation:1.0" xmlns:smil="${URN}smil-compatible:1.0" xmlns:anim="${URN}animation:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"`
    + ` xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="${URN}meta:1.0" xmlns:number="${URN}datastyle:1.0"`;
  const HEAD = '<?xml version="1.0" encoding="UTF-8"?>';
  const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const MIME = 'application/vnd.oasis.opendocument.presentation';
  const DEFAULT_STYLES = '<style:default-style style:family="graphic"><style:paragraph-properties style:tab-stop-distance="1.25cm"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="18pt"/></style:default-style>'
    + '<style:style style:name="standard" style:family="graphic"><style:graphic-properties draw:stroke="solid" svg:stroke-width="0cm" svg:stroke-color="#3465a4" draw:fill="solid" draw:fill-color="#729fcf" fo:padding-top="0.125cm" fo:padding-bottom="0.125cm" fo:padding-left="0.25cm" fo:padding-right="0.25cm"/></style:style>'
    + '<style:style style:name="Object_20_with_20_no_20_fill_20_and_20_no_20_line" style:family="graphic" style:parent-style-name="standard"><style:graphic-properties draw:stroke="none" draw:fill="none"/></style:style>';
  const FONTS = '<style:font-face style:name="Liberation Sans" svg:font-family="&apos;Liberation Sans&apos;" style:font-family-generic="swiss"/><style:font-face style:name="Papyrus" svg:font-family="Papyrus" style:font-family-generic="decorative"/>';
  const layout = (name = 'PM1', width = '28cm', height = '15.75cm') => `<style:page-layout style:name="${name}"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="${width}" fo:page-height="${height}"/></style:page-layout>`;
  const master = (name = 'Default', content = '', { layoutName = 'PM1', style = '' } = {}) => `<style:master-page style:name="${name}" style:page-layout-name="${layoutName}"${style ? ` draw:style-name="${style}"` : ''}>${content}</style:master-page>`;
  const stylesXml = ({ styles = '', masters, layouts, masterStyles = '' }) => `${HEAD}<office:document-styles ${NS} office:version="1.3"><office:font-face-decls>${FONTS}</office:font-face-decls><office:styles>${DEFAULT_STYLES}${styles}</office:styles>`
    + `<office:automatic-styles>${layouts}${masterStyles}</office:automatic-styles><office:master-styles>${masters}</office:master-styles></office:document-styles>`;
  const contentXml = ({ body, auto = '', bodyTag = 'office:presentation' }) => `${HEAD}<office:document-content ${NS} office:version="1.3"><office:font-face-decls/><office:automatic-styles>${auto}</office:automatic-styles><office:body><${bodyTag}>${body}</${bodyTag}></office:body></office:document-content>`;
  const manifest = (mime, encrypted) => `${HEAD}<manifest:manifest xmlns:manifest="${URN}manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/>`
    + `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml">${encrypted ? '<manifest:encryption-data manifest:checksum-type="SHA1/1K" manifest:checksum="AAAA"/>' : ''}</manifest:file-entry>`
    + '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>';
  // Le fichier : `pages` (le XML des pages), `auto` (styles automatiques de content.xml), `styles` (styles nommés), `masters`, `layouts`, `masterStyles`, `files` ({ 'Pictures/a.png': base64 }), `mime`, `bodyTag`, `encrypted`, `noContent`.
  async function odp({ pages = [page('Diapositive 1', '')], auto = '', styles = '', masters = master(), layouts = layout(), masterStyles = '', files = {}, mime = MIME, bodyTag = 'office:presentation', encrypted = false, noContent = false } = {}) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = new JSZip();
    zip.file('mimetype', mime, { compression: 'STORE' });
    zip.file('META-INF/manifest.xml', manifest(mime, encrypted));
    if (!noContent) zip.file('content.xml', contentXml({ body: Array.isArray(pages) ? pages.join('') : pages, auto, bodyTag }));
    zip.file('styles.xml', stylesXml({ styles, masters, layouts, masterStyles }));
    Object.keys(files).forEach((path) => { zip.file(path, files[path], { base64: true }); });
    return zip.generateAsync({ type: 'arraybuffer', mimeType: mime });
  }
  const flat = ({ pages, auto = '', styles = '', mime = MIME } = {}) => new TextEncoder().encode(`${HEAD}<office:document ${NS} office:version="1.3" office:mimetype="${mime}"><office:font-face-decls>${FONTS}</office:font-face-decls>`
    + `<office:styles>${DEFAULT_STYLES}${styles}</office:styles><office:automatic-styles>${auto}${layout()}</office:automatic-styles><office:master-styles>${master()}</office:master-styles>`
    + `<office:body><office:presentation>${pages.join('')}</office:presentation></office:body></office:document>`).buffer;
  // Une image PNG de 1 x 1 pixel (un point rouge), en base 64.
  const PNG_RED = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

  // Les briques d'une diapositive. Les mesures sont en centimètres, comme LibreOffice les écrit.
  const place = ({ x = 0, y = 0, w = 5, h = 2 } = {}) => `svg:x="${x}cm" svg:y="${y}cm" svg:width="${w}cm" svg:height="${h}cm"`;
  const paragraph = (content, style = '') => `<text:p${style ? ` text:style-name="${style}"` : ''}>${content}</text:p>`;
  const span = (content, style) => `<text:span text:style-name="${style}">${content}</text:span>`;
  const frameText = (content, { style = '', cls = '', textStyle = '', box = {}, extra = '' } = {}) => `<draw:frame ${style ? `draw:style-name="${style}" ` : ''}${cls ? `presentation:class="${cls}" ` : ''}${textStyle ? `draw:text-style-name="${textStyle}" ` : ''}${place(box)} ${extra}><draw:text-box>${content}</draw:text-box></draw:frame>`;
  const presentationFrame = (content, { style, cls = 'outline', textStyle = '', box = {} } = {}) => `<draw:frame presentation:style-name="${style}" ${textStyle ? `draw:text-style-name="${textStyle}" ` : ''}presentation:class="${cls}" ${place(box)}><draw:text-box>${content}</draw:text-box></draw:frame>`;
  const shape = (type, { style = '', box = {}, content = '', modifiers = '', transform = '', textStyle = '', geometryExtra = '' } = {}) => `<draw:custom-shape ${style ? `draw:style-name="${style}" ` : ''}${textStyle ? `draw:text-style-name="${textStyle}" ` : ''}`
    + `${transform ? `svg:width="${(box.w || 5)}cm" svg:height="${(box.h || 2)}cm" draw:transform="${transform}"` : place(box)}>${content}`
    + `<draw:enhanced-geometry draw:type="${type}"${modifiers ? ` draw:modifiers="${modifiers}"` : ''}${geometryExtra}/></draw:custom-shape>`;
  const lineEl = (tag, x1, y1, x2, y2, style = '') => `<draw:${tag} ${style ? `draw:style-name="${style}" ` : ''}svg:x1="${x1}cm" svg:y1="${y1}cm" svg:x2="${x2}cm" svg:y2="${y2}cm"><text:p/></draw:${tag}>`;
  const pictureFrame = (href, { box = {}, desc = '', style = '' } = {}) => `<draw:frame ${style ? `draw:style-name="${style}" ` : ''}${place(box)}><draw:image xlink:href="${href}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"><text:p/></draw:image>${desc ? `<svg:desc>${esc(desc)}</svg:desc>` : ''}</draw:frame>`;
  const page = (name, children, { style = '', masterName = 'Default', notes = '', extra = '' } = {}) => `<draw:page draw:name="${esc(name)}" ${style ? `draw:style-name="${style}" ` : ''}draw:master-page-name="${masterName}">${children}${notes ? `<presentation:notes>${notes}</presentation:notes>` : ''}${extra}</draw:page>`;
  const notesFrame = lines => `<draw:frame presentation:class="notes" ${place({ x: 2, y: 14, w: 16, h: 12 })}><draw:text-box>${lines.map(line => paragraph(line)).join('')}</draw:text-box></draw:frame>`;
  const graphic = (name, props, { parent = 'standard', paragraph: paragraphProps = '', text = '' } = {}) => `<style:style style:name="${name}" style:family="graphic" style:parent-style-name="${parent}"><style:graphic-properties ${props}/>`
    + `${paragraphProps ? `<style:paragraph-properties ${paragraphProps}/>` : ''}${text ? `<style:text-properties ${text}/>` : ''}</style:style>`;
  const presentationStyle = (name, props, { parent = '', text = '' } = {}) => `<style:style style:name="${name}" style:family="presentation"${parent ? ` style:parent-style-name="${parent}"` : ''}><style:graphic-properties ${props}/>${text ? `<style:text-properties ${text}/>` : ''}</style:style>`;
  const paragraphStyle = (name, { para = '', text = '' } = {}) => `<style:style style:name="${name}" style:family="paragraph">${para ? `<style:paragraph-properties ${para}/>` : ''}${text ? `<style:text-properties ${text}/>` : ''}</style:style>`;
  const textStyle = (name, props) => `<style:style style:name="${name}" style:family="text"><style:text-properties ${props}/></style:style>`;
  const pageStyle = (name, props) => `<style:style style:name="${name}" style:family="drawing-page"><style:drawing-page-properties ${props}/></style:style>`;
  const bulletList = (name, levels = 3) => `<text:list-style style:name="${name}">${Array.from({ length: levels }, (_, i) => `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="${i === 1 ? '–' : '•'}"><style:list-level-properties text:space-before="${i * 1.2}cm" text:min-label-width="0.9cm"/></text:list-level-style-bullet>`).join('')}</text:list-style>`;
  const numberedList = name => `<text:list-style style:name="${name}"><text:list-level-style-number text:level="1" style:num-suffix="." style:num-format="1"><style:list-level-properties text:min-label-width="0.9cm"/></text:list-level-style-number></text:list-style>`;

  // Le fichier importé : `{ slideTexts, html, page, report, stats, slideCount }`.
  async function imported(options, importOptions) {
    await ready();
    return OdpImport.fromBuffer(await odp(options), importOptions);
  }
  // Les cadres d'une diapositive : [{ x, y, w, h, shape, fill, line, lw, rot, layer, alt, adj, fillTr, lineTr, dash, flip, head, tail, text, html }].
  const attrOf = (el, name) => el.getAttribute('data-ff-' + name);
  function framesOf(slideText) {
    return Array.from(dom(slideText).querySelectorAll('.pp-free-frame')).map(el => ({
      x: Number(attrOf(el, 'x')), y: Number(attrOf(el, 'y')), w: Number(attrOf(el, 'w')), h: Number(attrOf(el, 'h')), shape: attrOf(el, 'shape') || '', fill: attrOf(el, 'fill') || '', line: attrOf(el, 'line') || '', lw: Number(attrOf(el, 'lw') || 0),
      rot: Number(attrOf(el, 'rot') || 0), layer: attrOf(el, 'layer') || '', alt: attrOf(el, 'alt') || '', adj: attrOf(el, 'adj') || '', fillTr: Number(attrOf(el, 'fill-tr') || 0), lineTr: Number(attrOf(el, 'line-tr') || 0),
      dash: attrOf(el, 'dash') || '', flip: attrOf(el, 'flip') || '', head: attrOf(el, 'head') || '', tail: attrOf(el, 'tail') || '', text: el.textContent.trim(), html: el.querySelector('.pp-free-frame-content, [class*="content"]') ? el.querySelector('.pp-free-frame-box').innerHTML : el.innerHTML, el,
    }));
  }
  // Le repère de la diapositive (fond, notes, masquée, passage) : { bg, notes, hidden, transition, from, dur, advance }.
  function propsOf(slideText) {
    const marker = dom(slideText).querySelector('.pp-slide-props, [data-bg], [data-notes], [data-hidden], [data-trans], [data-advance]');
    const read = name => (marker ? marker.getAttribute(name) : null);
    return { bg: read('data-bg') || '', notes: read('data-notes') || '', hidden: read('data-hidden') === '1', transition: read('data-trans') || '', from: read('data-trans-from') || '', dur: Number(read('data-trans-dur') || 0), advance: Number(read('data-advance') || 0) };
  }
  const keysOf = report => report.map(entry => entry.key);
  const countOf = (report, key) => (report.find(entry => entry.key === key) || {}).n || 0;
  const slideOne = async (children, options = {}) => { const out = await imported(Object.assign({ pages: [page('Diapositive 1', children)] }, options)); return { out, text: out.slideTexts[0], frames: framesOf(out.slideTexts[0]) }; };

  // ============================================================================================================================================================================================
  // 1. Le fichier
  // ============================================================================================================================================================================================
  add('odpImport_a_refused_file_says_why', 'un fichier qui n\'est pas une présentation OpenDocument est refusé avec son code : pas un zip, sans contenu, protégé, un document texte ou un tableur (wrongType et genre), aucune diapositive, trop gros', async () => {
    await ready();
    const { bad, expect } = checker();
    const codeOf = async (buffer) => { const e = await failure(() => OdpImport.fromBuffer(buffer)); return e ? e.code : 'aucune erreur'; };
    expect('pas un zip', await codeOf(new TextEncoder().encode('Ceci est du texte, pas une présentation.').buffer) === 'unreadable');
    expect('un zip sans content.xml', await codeOf(await odp({ noContent: true })) === 'unreadable');
    expect('protégé par un mot de passe', await codeOf(await odp({ encrypted: true })) === 'encrypted');
    const text = await failure(async () => OdpImport.fromBuffer(await odp({ mime: 'application/vnd.oasis.opendocument.text', bodyTag: 'office:text', pages: '<text:p>Bonjour</text:p>' })));
    expect('un document texte : wrongType et son genre', text && text.code === 'wrongType' && text.kind === 'text', text && [text.code, text.kind]);
    const sheet = await failure(async () => OdpImport.fromBuffer(await odp({ mime: 'application/vnd.oasis.opendocument.spreadsheet', bodyTag: 'office:spreadsheet', pages: '<table:table table:name="A"/>' })));
    expect('un tableur : wrongType et son genre', sheet && sheet.code === 'wrongType' && sheet.kind === 'spreadsheet', sheet && [sheet.code, sheet.kind]);
    expect('aucune diapositive : empty', await codeOf(await odp({ pages: '' })) === 'empty');
    const huge = await failure(() => OdpImport.fromFile({ size: OdpImport.MAX_FILE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) }));
    expect('un fichier plus gros que la limite : tooBig avec sa taille', huge && huge.code === 'tooBig' && huge.size === OdpImport.MAX_FILE_BYTES + 1 && huge.max === OdpImport.MAX_FILE_BYTES, huge && [huge.code, huge.size, huge.max]);
    return result(bad);
  });

  add('odpImport_flat_and_template_files_are_read_like_the_zip', 'le fichier « flat » (.fodp, un seul XML) et le modèle (.otp) donnent les mêmes diapositives que le zip', async () => {
    await ready();
    const { bad, expect } = checker();
    const pages = [page('Un', frameText(paragraph('Bonjour'), { box: { x: 2, y: 2, w: 10, h: 2 } })), page('Deux', '')];
    const zip = await OdpImport.fromBuffer(await odp({ pages }));
    const single = await OdpImport.fromBuffer(flat({ pages }));
    const template = await OdpImport.fromBuffer(await odp({ pages, mime: 'application/vnd.oasis.opendocument.presentation-template' }));
    expect('deux diapositives', zip.slideCount === 2 && zip.slideTexts.length === 2, zip.slideCount);
    expect('le flat donne les mêmes textes', JSON.stringify(zip.slideTexts) === JSON.stringify(single.slideTexts));
    expect('le modèle aussi', JSON.stringify(zip.slideTexts) === JSON.stringify(template.slideTexts));
    expect('le texte de la première diapositive', framesOf(zip.slideTexts[0]).some(frame => frame.text === 'Bonjour'), framesOf(zip.slideTexts[0]).map(frame => frame.text));
    return result(bad);
  });

  add('odpImport_the_result_has_the_shape_of_the_powerpoint_import', 'le résultat a la forme de l\'import PowerPoint : slideTexts, html (réuni à la demande, aux sauts de page), page, slideCount, report, stats (non énumérables)', async () => {
    const { bad, expect } = checker();
    const out = await imported({ pages: [page('A', ''), page('B', ''), page('C', '')] });
    expect('trois textes', Array.isArray(out.slideTexts) && out.slideTexts.length === 3 && out.slideCount === 3);
    expect('le texte entier est réuni aux sauts de page', out.html === out.slideTexts.join('<div class="page-break-marker"></div>'), out.html.length);
    expect('la page est celle de la maîtresse (format libre, paysage)', out.page && out.page.orientation === PageLayout.LANDSCAPE && typeof out.page.format === 'string', out.page);
    expect('un rapport vide', Array.isArray(out.report) && out.report.length === 0, out.report);
    expect('les mesures ne sont pas énumérables', !Object.keys(out).includes('stats') && out.stats && out.stats.slides === 3 && out.stats.fileBytes > 0 && Array.isArray(out.stats.holders), out.stats);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 2. La page
  // ============================================================================================================================================================================================
  add('odpImport_the_page_is_the_master_page_size', 'la page est celle de la page maîtresse : 28 x 15,75 cm en paysage, 21 x 29,7 cm en portrait ; une page plus grande que l\'éditeur n\'accepte est ramenée à la plus grande, les cadres suivent', async () => {
    await ready();
    const { bad, expect } = checker();
    const size = page_ => PageLayout.pageSizeMmFor(page_.orientation, page_.format);
    const wide = await imported();
    expect('16:9 : paysage 280 x 157,5 mm', wide.page.orientation === PageLayout.LANDSCAPE && near(size(wide.page).width, 280, 0.2) && near(size(wide.page).height, 157.5, 0.2), [wide.page, size(wide.page)]);
    const tall = await imported({ layouts: layout('PM1', '21cm', '29.7cm') });
    expect('A4 portrait', tall.page.orientation === PageLayout.PORTRAIT && near(size(tall.page).width, 210, 0.2) && near(size(tall.page).height, 297, 0.2), [tall.page, size(tall.page)]);
    const four = await imported({ layouts: layout('PM1', '25.4cm', '19.05cm') });
    expect('4:3 : 254 x 190,5 mm', near(size(four.page).width, 254, 0.2) && near(size(four.page).height, 190.5, 0.2), size(four.page));
    // Une page de 400 x 200 cm : le grand côté est ramené au plus grand (CUSTOM_MAX_MM), l'objet suit (k < 1).
    const maxMm = PageLayout.CUSTOM_MAX_MM;
    const giant = await imported({ layouts: layout('PM1', '400cm', '200cm'), pages: [page('G', frameText(paragraph('x'), { cls: '', style: 'gr9', box: { x: 100, y: 50, w: 200, h: 100 } }))], auto: graphic('gr9', 'draw:fill="solid" draw:fill-color="#ff0000" draw:stroke="none"') });
    const frame = framesOf(giant.slideTexts[0])[0];
    expect('page géante : grand côté borné', near(Math.max(size(giant.page).width, size(giant.page).height), maxMm, 0.2) && giant.page.orientation === PageLayout.LANDSCAPE, [giant.page, maxMm]);
    const k = maxMm / 4000;   // le grand côté de 400 cm = 4 000 mm ramené à CUSTOM_MAX_MM
    expect('l\'objet est ramené dans la même proportion (le coin est à 100 cm x k, les marges du cadre en plus)', frame && frame.x < 100 * CM && near(frame.x, 100 * CM * k, 1) && near(frame.w, 200 * CM * k, 15), frame && [frame.x, frame.w, 100 * CM * k, 200 * CM * k]);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 3. Le texte
  // ============================================================================================================================================================================================
  add('odpImport_a_text_frame_keeps_its_runs_and_paragraph_format', 'une zone de texte : ses séries de caractères (gras, italique, couleur, taille), l\'alignement du paragraphe et la boîte du fichier (les marges du cadre compensées)', async () => {
    const { bad, expect } = checker();
    const { frames } = await slideOne(
      frameText(paragraph(span('Titre ', 'T1') + span('rouge', 'T2'), 'P1'), { style: 'gr1', box: { x: 2, y: 3, w: 20, h: 3 } }),
      { auto: graphic('gr1', 'draw:fill="none" draw:stroke="none" draw:textarea-vertical-align="top" fo:padding-left="0.25cm" fo:padding-right="0.25cm" fo:padding-top="0.125cm" fo:padding-bottom="0.125cm"', { parent: 'Object_20_with_20_no_20_fill_20_and_20_no_20_line' })
        + paragraphStyle('P1', { para: 'fo:text-align="center" fo:margin-left="0cm" fo:margin-top="0cm"' })
        + textStyle('T1', 'fo:font-size="32pt" fo:font-weight="bold"') + textStyle('T2', 'fo:font-size="32pt" fo:font-style="italic" fo:color="#c00000"') },
    );
    const frame = frames[0];
    expect('un seul cadre de texte (pas de forme)', frames.length === 1 && frame.shape === '' && frame.fill === '' && frame.line === '', frames.map(f => [f.shape, f.fill, f.line]));
    expect('le texte', frame && frame.text === 'Titre rouge', frame && frame.text);
    expect('la boîte : le coin du fichier, les marges du cadre compensées (0,25 cm = 7,09 pt contre 7,2)', frame && near(frame.x, 2 * CM + 7.0866 - 7.2, 0.1) && near(frame.y, 3 * CM + 3.5433 - 3.6, 0.1) && near(frame.w, 20 * CM + 14.4 - 14.1732, 0.1), frame && [frame.x, frame.y, frame.w]);
    const html = frame.el.innerHTML;
    expect('gras', /<strong>/.test(html), html);
    expect('italique et couleur', /<em>/.test(html) && /color: #c00000/.test(html), html);
    expect('la taille de 32 pt', /font-size: 32pt/.test(html), html);
    expect('paragraphe centré', /text-align: center/.test(html), html);
    return result(bad);
  });

  add('odpImport_the_text_inherits_from_the_object_style', 'un emplacement (plan) dont le texte n\'écrit ni taille ni police prend ceux du style de présentation de l\'objet, puis ceux du « style de texte » (`draw:text-style-name`) : héritage du plus lointain au plus proche', async () => {
    const { bad, expect } = checker();
    const { frames } = await slideOne(
      presentationFrame(`<text:list text:style-name="L1"><text:list-item>${paragraph('Premier', 'P1')}</text:list-item></text:list>`, { style: 'pr1', textStyle: 'P2', box: { x: 1, y: 4, w: 24, h: 10 } }),
      { styles: presentationStyle('Base-outline1', 'draw:stroke="none" draw:fill="none"', { text: 'fo:font-size="28pt" fo:color="#1f497d"' }),
        auto: presentationStyle('pr1', 'draw:stroke="none" draw:fill="none" draw:textarea-vertical-align="top"', { parent: 'Base-outline1' }) + paragraphStyle('P1', { para: 'fo:margin-left="0cm"' }) + paragraphStyle('P2', { text: 'fo:font-size="30pt"' }) + bulletList('L1') },
    );
    const html = frames[0] && frames[0].el.innerHTML;
    expect('la taille vient du style de texte (30 pt, plus proche que les 28 pt du style de présentation)', /font-size: 30pt/.test(html), html);
    expect('la couleur vient du style de présentation', /color: #1f497d/.test(html), html);
    expect('c\'est une liste à puces', /<ul/.test(html) && /<li/.test(html), html);
    return result(bad);
  });

  add('odpImport_lists_keep_their_levels_and_numbering', 'les listes : deux niveaux emboîtés, une liste numérotée ; un paragraphe vide garde sa ligne', async () => {
    const { bad, expect } = checker();
    const nested = `<text:list text:style-name="L1"><text:list-item>${paragraph('Haut', 'P1')}<text:list><text:list-item>${paragraph('Bas', 'P1')}</text:list-item></text:list></text:list-item></text:list>`;
    const numbered = `<text:list text:style-name="L2"><text:list-item>${paragraph('Un', 'P1')}</text:list-item><text:list-item>${paragraph('Deux', 'P1')}</text:list-item></text:list>`;
    const { frames } = await slideOne(
      frameText(nested, { style: 'gr1', box: { x: 1, y: 1, w: 10, h: 5 } }) + frameText(numbered, { style: 'gr1', box: { x: 12, y: 1, w: 10, h: 5 } }) + frameText(paragraph('') + paragraph('Après'), { style: 'gr1', box: { x: 1, y: 8, w: 10, h: 4 } }),
      { auto: graphic('gr1', 'draw:fill="none" draw:stroke="none"', { parent: 'Object_20_with_20_no_20_fill_20_and_20_no_20_line' }) + paragraphStyle('P1', { para: 'fo:margin-left="0cm"' }) + bulletList('L1') + numberedList('L2') },
    );
    const first = frames[0].el;
    expect('deux niveaux emboîtés', first.querySelectorAll('ul ul li').length === 1 && first.textContent.replace(/\s+/g, '') === 'HautBas', first.innerHTML);
    const second = frames[1].el;
    expect('liste numérotée : un <ol> de deux points', second.querySelectorAll('ol > li').length === 2, second.innerHTML);
    expect('un paragraphe vide puis un paragraphe', frames[2].el.querySelectorAll('p').length === 2, frames[2].el.innerHTML);
    return result(bad);
  });

  add('odpImport_a_text_anchored_in_the_middle_goes_down_to_its_text', 'un texte posé (sans fond ni trait) ancré au milieu ou en bas : le cadre est ramené à la hauteur de son texte, mesurée, et descend où le texte est ; ancré en haut, il reste en haut de sa boîte', async () => {
    const { bad, expect } = checker();
    const style = (name, anchor) => graphic(name, `draw:fill="none" draw:stroke="none" draw:textarea-vertical-align="${anchor}" fo:padding-left="0.25cm" fo:padding-right="0.25cm" fo:padding-top="0.125cm" fo:padding-bottom="0.125cm"`, { parent: 'Object_20_with_20_no_20_fill_20_and_20_no_20_line' });
    const box = { x: 2, y: 2, w: 20, h: 8 };
    const { frames } = await slideOne(
      frameText(paragraph('Haut', 'P1'), { style: 'gr1', box }) + frameText(paragraph('Milieu', 'P1'), { style: 'gr2', box: Object.assign({}, box, { x: 2 }) }) + frameText(paragraph('Bas', 'P1'), { style: 'gr3', box }),
      { auto: style('gr1', 'top') + style('gr2', 'middle') + style('gr3', 'bottom') + paragraphStyle('P1', { text: 'fo:font-size="24pt"' }) },
    );
    const [top, middle, bottom] = frames;
    expect('en haut : la boîte entière du fichier (8 cm, moins les marges du cadre)', top && near(top.h, 8 * CM + 7.2 - 7.0866, 0.3), top && top.h);
    expect('en haut : le haut de la boîte', top && near(top.y, 2 * CM + 3.5433 - 3.6, 0.1), top && top.y);
    expect('au milieu : plus court que la boîte et plus bas', middle && middle.h < 8 * CM * 0.5 && middle.y > top.y + 20, middle && [middle.y, middle.h]);
    expect('au milieu : centré dans la boîte (à 4 pt près)', middle && Math.abs((middle.y + middle.h / 2) - (2 * CM + 4 * CM)) < 6, middle && [middle.y + middle.h / 2, 2 * CM + 4 * CM]);
    expect('en bas : le bas du cadre est le bas de la boîte (à 6 pt près)', bottom && Math.abs((bottom.y + bottom.h) - (2 * CM + 8 * CM)) < 8, bottom && [bottom.y + bottom.h, 2 * CM + 8 * CM]);
    return result(bad);
  });

  add('odpImport_a_table_becomes_a_table_in_a_frame', 'un tableau (cadre `draw:frame` > `table:table`) devient un tableau de l\'éditeur dans un cadre libre : colonnes, fonds de cases (style `loext:graphic-properties`, case par défaut de la ligne), traits ; l\'image d\'aperçu qui l\'accompagne n\'est pas comptée', async () => {
    const { bad, expect } = checker();
    const table = '<draw:frame svg:x="2cm" svg:y="3cm" svg:width="12cm" svg:height="4cm"><table:table><table:table-column table:style-name="co1"/><table:table-column table:style-name="co1"/>'
      + `<table:table-row table:style-name="ro1" table:default-cell-style-name="ce1"><table:table-cell>${paragraph('A1')}</table:table-cell><table:table-cell>${paragraph('B1')}</table:table-cell></table:table-row>`
      + `<table:table-row table:style-name="ro1"><table:table-cell table:style-name="ce2">${paragraph('A2')}</table:table-cell><table:table-cell table:style-name="ce2">${paragraph('B2')}</table:table-cell></table:table-row></table:table>`
      + '<draw:image xlink:href="Pictures/TablePreview1.svm" xlink:type="simple"/></draw:frame>';
    const { out, frames } = await slideOne(table, {
      auto: '<style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="6cm"/></style:style><style:style style:name="ro1" style:family="table-row"><style:table-row-properties style:row-height="2cm"/></style:style>'
        + '<style:style style:name="ce1" style:family="table-cell"><loext:graphic-properties draw:fill="solid" draw:fill-color="#4f81bd"/><style:paragraph-properties fo:border="0.5pt solid #ffffff"/></style:style>'
        + '<style:style style:name="ce2" style:family="table-cell"><loext:graphic-properties draw:fill="none"/></style:style>',
    });
    const frame = frames[0];
    const cells = frame ? Array.from(frame.el.querySelectorAll('td')) : [];
    expect('un cadre qui porte un tableau de deux lignes de deux cases', frames.length === 1 && cells.length === 4 && frame.el.querySelectorAll('tr').length === 2, frames.length);
    expect('le texte des cases', cells.map(td => td.textContent.trim()).join('|') === 'A1|B1|A2|B2', cells.map(td => td.textContent));
    expect('fond de la première ligne (case par défaut de la ligne)', /background-color:\s*#4f81bd/i.test(cells[0].getAttribute('style') || ''), cells[0].getAttribute('style'));
    expect('traits blancs de la première ligne', cells[0].getAttribute('data-border-top') === '#ffffff', cells[0].getAttribute('data-border-top'));
    expect('largeur de colonne : 6 cm', /colwidth="\d+"/.test(cells[0].outerHTML) && Math.abs(Number(cells[0].getAttribute('colwidth')) - 6 * CM * 96 / 72) < 3, cells[0].getAttribute('colwidth'));
    expect('l\'aperçu du tableau n\'est pas une image perdue', countOf(out.report, 'images') === 0, out.report);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 4. Les formes, les traits, les images
  // ============================================================================================================================================================================================
  add('odpImport_shapes_keep_kind_fill_line_and_text', 'une forme de la norme (`ooxml-roundRect`, réglage 20 000), une ellipse de LibreOffice, une flèche : la sorte, le fond, la transparence, le trait (épaisseur, couleur, tiret), le texte posé dans la forme', async () => {
    const { bad, expect } = checker();
    const { out, frames } = await slideOne(
      shape('ooxml-roundRect', { style: 'gr1', box: { x: 2, y: 2, w: 8, h: 4 }, modifiers: '20000', content: paragraph('Forme', 'P1') })
      + shape('ellipse', { style: 'gr2', box: { x: 12, y: 2, w: 6, h: 4 } }) + shape('right-arrow', { style: 'gr3', box: { x: 2, y: 8, w: 6, h: 3 } }),
      { auto: graphic('gr1', 'draw:fill="solid" draw:fill-color="#3070b0" draw:opacity="60%" draw:stroke="solid" svg:stroke-width="0.106cm" svg:stroke-color="#000000" draw:textarea-vertical-align="middle"')
        + graphic('gr2', 'draw:fill="solid" draw:fill-color="#ffd040" draw:stroke="dash" draw:stroke-dash="Dash" svg:stroke-width="0.05cm" svg:stroke-color="#4a7ebb"')
        + graphic('gr3', 'draw:fill="solid" draw:fill-color="#40b060" draw:stroke="none"') + paragraphStyle('P1', { text: 'fo:font-size="14pt" fo:color="#ffffff"' }) },
    );
    const [round, oval, arrow] = frames;
    expect('rectangle arrondi de la norme', round && round.shape === 'roundRect' && round.fill === '#3070b0' && round.line === '#000000', round && [round.shape, round.fill, round.line]);
    expect('son réglage (poignée jaune) est gardé', round && /adj\s*20000/.test(round.adj), round && round.adj);
    expect('son trait : 0,106 cm = 3 pt', round && near(round.lw, 3, 0.05), round && round.lw);
    expect('son fond à 60 % d\'opacité : 40 % de transparence', round && round.fillTr === 40, round && round.fillTr);
    expect('son texte, dans la forme', round && round.text === 'Forme' && /color: #ffffff/.test(round.el.innerHTML), round && round.text);
    expect('ellipse de LibreOffice, trait tireté', oval && oval.shape === 'ellipse' && oval.fill === '#ffd040' && oval.line === '#4a7ebb' && oval.dash !== '', oval && [oval.shape, oval.dash]);
    expect('flèche de LibreOffice : rightArrow, sans trait', arrow && arrow.shape === 'rightArrow' && arrow.line === '' && arrow.fill === '#40b060', arrow && [arrow.shape, arrow.line]);
    expect('rien n\'est compté', out.report.length === 0, out.report);
    return result(bad);
  });

  add('odpImport_a_rotated_shape_keeps_its_place', 'une forme tournée de 20 degrés (relevé LibreOffice 24.2 : `rotate (-0.349…) translate (21.201cm 2.622cm)`) retrouve sa boîte droite (20,32 ; 3,81 cm) et son angle de 20 degrés dans le sens des aiguilles d\'une montre', async () => {
    const { bad, expect } = checker();
    const { frames } = await slideOne(
      shape('ooxml-roundRect', { style: 'gr1', box: { w: 7.619, h: 3.809 }, transform: 'rotate (-0.349065850398867) translate (21.201cm 2.622cm)', modifiers: '16667' }),
      { auto: graphic('gr1', 'draw:fill="solid" draw:fill-color="#3070b0" draw:stroke="none"') },
    );
    const frame = frames[0];
    expect('la boîte avant rotation', frame && near(frame.x, 20.32 * CM, 0.6) && near(frame.y, 3.81 * CM, 0.6) && near(frame.w, 7.619 * CM, 0.2) && near(frame.h, 3.809 * CM, 0.2), frame && [frame.x / CM, frame.y / CM, frame.w / CM, frame.h / CM]);
    expect('l\'angle : 20 degrés', frame && near(frame.rot, 20, 0.05), frame && frame.rot);
    return result(bad);
  });

  add('odpImport_an_unknown_shape_becomes_a_rectangle_and_is_counted', 'une forme que l\'éditeur ne dessine pas devient un rectangle et le compte rendu la compte ; une forme sans fond, sans trait et sans texte n\'est pas reprise', async () => {
    const { bad, expect } = checker();
    const { out, frames } = await slideOne(
      shape('mso-spt-nulle-part', { style: 'gr1', box: { x: 2, y: 2, w: 6, h: 3 } }) + shape('ooxml-rect', { style: 'gr0', box: { x: 10, y: 2, w: 6, h: 3 } }),
      { auto: graphic('gr1', 'draw:fill="solid" draw:fill-color="#ff8800" draw:stroke="none"') + graphic('gr0', 'draw:fill="none" draw:stroke="none"') },
    );
    expect('un seul cadre : le rectangle orange', frames.length === 1 && frames[0].shape === 'rect' && frames[0].fill === '#ff8800', frames.map(f => [f.shape, f.fill]));
    expect('compté une fois : shapes', countOf(out.report, 'shapes') === 1 && out.report.find(entry => entry.key === 'shapes').scope === 'odp', out.report);
    return result(bad);
  });

  add('odpImport_a_plain_rectangle_path_is_a_rectangle_and_costs_nothing', 'une forme dessinée par son chemin (`non-primitive`, comme l\'export OpenDocument l\'écrit) qui n\'est qu\'un rectangle plein cadre est un rectangle sans rien de perdu ; un autre chemin reste une forme inconnue, comptée', async () => {
    const { bad, expect } = checker();
    const rectangle = ' svg:viewBox="0 0 600 300" draw:enhanced-path="M 0 0 L 600 0 L 600 300 L 0 300 Z N"';
    const triangle = ' svg:viewBox="0 0 600 300" draw:enhanced-path="M 0 0 L 600 0 L 0 300 Z N"';
    const { out, frames } = await slideOne(
      shape('non-primitive', { style: 'gr1', box: { x: 2, y: 2, w: 6, h: 3 }, geometryExtra: rectangle }) + shape('non-primitive', { style: 'gr1', box: { x: 10, y: 2, w: 6, h: 3 }, geometryExtra: triangle }),
      { auto: graphic('gr1', 'draw:fill="solid" draw:fill-color="#ff8800" draw:stroke="none"') },
    );
    expect('deux cadres, deux rectangles orange', frames.length === 2 && frames.every(frame => frame.shape === 'rect' && frame.fill === '#ff8800'), frames.map(f => [f.shape, f.fill]));
    expect('le tracé de rectangle n\'est pas compté, l\'autre l\'est : shapes une fois', countOf(out.report, 'shapes') === 1, out.report);
    return result(bad);
  });

  add('odpImport_lines_and_connectors_keep_their_ends_and_arrows', 'un trait et un connecteur : les deux bouts, le sens (de droite à gauche : retourné), la couleur, l\'épaisseur, le tiret, les pointes (« Arrow » : triangle, « Circle » : ovale) ; un trait sans couleur n\'est pas repris', async () => {
    const { bad, expect } = checker();
    const { frames } = await slideOne(
      lineEl('line', 2, 2, 10, 4, 'gr1') + lineEl('connector', 12, 3, 6, 8, 'gr2') + lineEl('line', 1, 12, 5, 12, 'gr3'),
      { auto: graphic('gr1', 'draw:stroke="solid" svg:stroke-width="0.141cm" svg:stroke-color="#ff0000" draw:marker-end="Arrow"')
        + graphic('gr2', 'draw:stroke="dash" svg:stroke-width="0.05cm" svg:stroke-color="#0000ff" draw:marker-start="Circle"') + graphic('gr3', 'draw:stroke="none"') },
    );
    const [line, connector] = frames;
    expect('deux traits (le troisième n\'a pas de couleur)', frames.length === 2 && frames.every(frame => frame.shape === 'line'), frames.map(f => f.shape));
    expect('le premier : de (2 ; 2) à (10 ; 4) cm, rouge, 4 pt, pointe de fin', line && near(line.x, 2 * CM, 0.1) && near(line.y, 2 * CM, 0.1) && near(line.w, 8 * CM, 0.1) && near(line.h, 2 * CM, 0.1) && line.line === '#ff0000' && near(line.lw, 4, 0.05) && line.tail === 'triangle' && line.flip === '', line && [line.x, line.w, line.lw, line.tail, line.flip]);
    expect('le connecteur : du haut droit au bas gauche (flip h), tireté, pointe de début ovale', connector && connector.flip === 'h' && connector.head === 'oval' && connector.dash !== '' && near(connector.x, 6 * CM, 0.1), connector && [connector.flip, connector.head, connector.dash, connector.x]);
    return result(bad);
  });

  add('odpImport_pictures_keep_their_box_and_alt_text', 'une image : le cadre qui la porte à la boîte du fichier (marges du cadre comprises), son texte alternatif, sa rotation ; un format illisible, une image absente et une image rognée sont comptés', async () => {
    const { bad, expect } = checker();
    const { out, frames } = await slideOne(
      pictureFrame('Pictures/rouge.png', { box: { x: 2, y: 3, w: 6, h: 4.5 }, desc: 'Un point rouge' }) + pictureFrame('Pictures/ancien.svm', { box: { x: 10, y: 3, w: 4, h: 3 } })
      + pictureFrame('Pictures/rouge.png', { box: { x: 16, y: 3, w: 4, h: 3 }, style: 'gr1' }) + pictureFrame('Pictures/absente.png', { box: { x: 2, y: 9, w: 4, h: 3 } }),
      { files: { 'Pictures/rouge.png': PNG_RED, 'Pictures/ancien.svm': 'AAAA' }, auto: graphic('gr1', 'fo:clip="rect(0.5cm, 0cm, 0cm, 0.5cm)" style:mirror="none"') },
    );
    const picture = frames[0];
    expect('la première image : un cadre avec une <img> en adresse de données', picture && /<img[^>]*src="data:image\/png;base64,/.test(picture.el.innerHTML), picture && picture.el.innerHTML.slice(0, 120));
    expect('sa boîte, élargie des marges du cadre', picture && near(picture.x, 2 * CM - 7.2, 0.1) && near(picture.y, 3 * CM - 3.6, 0.1) && near(picture.w, 6 * CM + 14.4, 0.1), picture && [picture.x, picture.y, picture.w]);
    expect('son texte alternatif', picture && picture.alt === 'Un point rouge', picture && picture.alt);
    const shown = picture && /<img[^>]*style="width:\s*([\d.]+)px/.exec(picture.el.innerHTML);
    expect('la largeur de l\'image est celle du fichier (6 cm = 226,8 px)', shown && near(shown[1], 6 * CM * 96 / 72, 0.1), shown && shown[1]);
    expect('l\'image rognée est reprise entière (2 images : la première et la rognée)', frames.length === 2, frames.length);
    expect('format illisible + image absente comptés (2 images), la rognée comptée à part (1)', countOf(out.report, 'images') === 2 && countOf(out.report, 'imageEffects') === 1, out.report);
    return result(bad);
  });

  add('odpImport_groups_are_flattened_and_what_is_not_carried_is_counted', 'un groupe est mis à plat (ses objets gardent leur place) ; un tracé libre, un graphique, un objet incorporé, un son ou une vidéo, une animation d\'objet sont comptés chacun à sa place', async () => {
    const { bad, expect } = checker();
    const object = (href) => `<draw:frame ${place({ x: 1, y: 1, w: 4, h: 3 })}><draw:object xlink:href="${href}"/></draw:frame>`;
    const { out, frames } = await slideOne(
      `<draw:g>${shape('ooxml-rect', { style: 'gr1', box: { x: 1, y: 1, w: 3, h: 2 } })}${shape('ooxml-ellipse', { style: 'gr1', box: { x: 5, y: 1, w: 3, h: 2 } })}</draw:g>`
      + '<draw:polygon draw:points="0,0 10,10 0,10" svg:viewBox="0 0 10 10" svg:x="1cm" svg:y="1cm" svg:width="2cm" svg:height="2cm"/>'
      + object('./Object 1') + object('./Object 2') + `<draw:frame ${place()}><draw:plugin xlink:href="video.mp4"/></draw:frame>`
      + '<anim:par presentation:node-type="on-click"><anim:par presentation:node-type="with-previous"/></anim:par>',
      { auto: graphic('gr1', 'draw:fill="solid" draw:fill-color="#112233" draw:stroke="none"') },
    );
    expect('le groupe est à plat : deux cadres', frames.length === 2 && frames[0].shape === 'rect' && frames[1].shape === 'ellipse', frames.map(f => f.shape));
    expect('le tracé libre est compté', countOf(out.report, 'freeDrawings') === 1, out.report);
    expect('les objets incorporés comptés (sans contenu graphique lisible)', countOf(out.report, 'embedded') === 2, out.report);
    expect('le son ou la vidéo est compté', countOf(out.report, 'media') === 1, out.report);
    expect('une animation d\'objet par effet : 2 (clic et avec le précédent)', countOf(out.report, 'animations') === 2, out.report);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 5. La diapositive
  // ============================================================================================================================================================================================
  add('odpImport_slide_background_notes_hidden_and_transition', 'le fond uni de la diapositive (blanc : aucun), celui de sa maîtresse à défaut, un dégradé remplacé par sa couleur moyenne (compté) ; les notes (un paragraphe par ligne), la diapositive masquée, le passage au temps (5 s) et l\'effet', async () => {
    await ready();
    const { bad, expect } = checker();
    const pages = [
      page('Bleue', '', { style: 'dp1', notes: notesFrame(['Première ligne', 'Deuxième ligne']) }),
      page('Blanche', '', { style: 'dp2' }),
      page('Maîtresse', '', { masterName: 'Sombre' }),
      page('Dégradé', '', { style: 'dp3' }),
      page('Masquée', '', { style: 'dp4' }),
      page('Effet inconnu', '', { style: 'dp5' }),
    ];
    const out = await OdpImport.fromBuffer(await odp({
      pages, masters: master('Default') + master('Sombre', '', { style: 'Mdp1' }),
      masterStyles: pageStyle('Mdp1', 'draw:fill="solid" draw:fill-color="#202020"'),
      styles: '<draw:gradient draw:name="Grad" draw:start-color="#ff0000" draw:end-color="#0000ff"/>',
      auto: pageStyle('dp1', 'draw:fill="solid" draw:fill-color="#eef4ff" presentation:transition-type="automatic" presentation:duration="PT00H00M05S" smil:type="fade" presentation:transition-speed="fast"')
        + pageStyle('dp2', 'draw:fill="solid" draw:fill-color="#ffffff"') + pageStyle('dp3', 'draw:fill="gradient" draw:fill-gradient-name="Grad"') + pageStyle('dp4', 'presentation:visibility="hidden" smil:type="pushWipe" smil:subtype="fromLeft"')
        + pageStyle('dp5', 'smil:type="spiralWipe"'),
    }));
    const [bleue, blanche, sombre, degrade, masquee, effet] = out.slideTexts.map(propsOf);
    expect('fond uni de la diapositive', bleue.bg.toLowerCase() === '#eef4ff', bleue);
    expect('notes : une ligne par paragraphe', bleue.notes === 'Première ligne\nDeuxième ligne', bleue.notes);
    expect('passage au temps : 5 000 ms, fondu, vite (400 ms)', bleue.advance === 5000 && bleue.transition === 'fade' && bleue.dur === 400, bleue);
    expect('le blanc n\'est pas écrit (c\'est le fond d\'origine)', blanche.bg === '', blanche);
    expect('la maîtresse donne son fond à défaut', sombre.bg.toLowerCase() === '#202020', sombre);
    expect('le dégradé rouge-bleu : leur moyenne #800080', degrade.bg.toLowerCase() === '#800080', degrade);
    expect('masquée, effet « glisser depuis la gauche »', masquee.hidden === true && masquee.transition === 'push' && masquee.from === 'r', masquee);
    expect('effet inconnu : un fondu, compté', effet.transition === 'fade' && countOf(out.report, 'transitions') === 1, [effet, out.report]);
    expect('le fond en dégradé est compté (slidePatterns)', countOf(out.report, 'slidePatterns') === 1, out.report);
    return result(bad);
  });

  add('odpImport_the_master_page_decor_goes_behind_the_text', 'le décor de la page maîtresse (une forme, une image ; pas ses emplacements) est posé DERRIÈRE le texte de chaque diapositive qui la montre, une fois par maîtresse ; « objets de l\'arrière-plan » décoché le cache', async () => {
    await ready();
    const { bad, expect } = checker();
    const decor = shape('ooxml-rect', { style: 'gr1', box: { x: 0, y: 14, w: 28, h: 1.75 } })
      + `<draw:frame presentation:class="title" ${place({ x: 1, y: 1, w: 20, h: 2 })}><draw:text-box>${paragraph('Titre de la maîtresse')}</draw:text-box></draw:frame>`
      + pictureFrame('Pictures/logo.png', { box: { x: 24, y: 0.5, w: 3, h: 2 }, desc: 'Logo' });
    const out = await OdpImport.fromBuffer(await odp({
      masters: master('Default', decor),
      pages: [page('Un', frameText(paragraph('Texte un'), { style: 'gr2', box: { x: 2, y: 3, w: 10, h: 2 } })), page('Deux', '', {}), page('Trois', '', { style: 'dp1' })],
      files: { 'Pictures/logo.png': PNG_RED },
      auto: graphic('gr1', 'draw:fill="solid" draw:fill-color="#ee0000" draw:stroke="none"') + graphic('gr2', 'draw:fill="none" draw:stroke="none"', { parent: 'Object_20_with_20_no_20_fill_20_and_20_no_20_line' })
        + pageStyle('dp1', 'presentation:background-objects-visible="false"'),
    }));
    const first = framesOf(out.slideTexts[0]);
    expect('le bandeau et le logo derrière, puis le texte (3 cadres, jamais le titre de la maîtresse)', first.length === 3 && first[0].layer === 'behind' && first[1].layer === 'behind' && first[2].layer === '' && first[2].text === 'Texte un', first.map(f => [f.layer, f.shape, f.text]));
    expect('le bandeau : sa boîte', first[0] && first[0].fill === '#ee0000' && near(first[0].y, 14 * CM, 0.5), first[0] && [first[0].fill, first[0].y]);
    expect('le logo a son texte alternatif', first[1] && first[1].alt === 'Logo', first[1] && first[1].alt);
    const second = framesOf(out.slideTexts[1]);
    expect('la deuxième diapositive (sans texte) a le même décor', second.length === 2 && second.every(f => f.layer === 'behind'), second.map(f => f.layer));
    const third = framesOf(out.slideTexts[2]);
    expect('« objets de l\'arrière-plan » décoché : aucun décor', third.length === 0, third.map(f => f.layer));
    expect('rien n\'est compté', out.report.length === 0, out.report);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 6. Le compte rendu et les plafonds
  // ============================================================================================================================================================================================
  add('odpImport_the_report_counts_each_kind_in_order_with_its_scope', 'le compte rendu : les genres de la présentation dans l\'ordre de REPORT_KEYS (portée `odp`), puis ceux que le texte d\'un objet compte (portée `odt` : police absente, lien non sûr), jamais deux fois', async () => {
    const { bad, expect } = checker();
    const { out } = await slideOne(
      frameText(paragraph(span('Papyrus', 'T1') + '<text:a xlink:href="javascript:alert(1)">piège</text:a>'), { style: 'gr1', box: { x: 1, y: 1, w: 10, h: 2 } })
      + shape('mso-inconnue', { style: 'gr2', box: { x: 1, y: 5, w: 3, h: 2 } }) + '<draw:polygon draw:points="0,0 1,1 0,1" svg:viewBox="0 0 1 1" svg:x="1cm" svg:y="1cm" svg:width="1cm" svg:height="1cm"/>',
      { auto: graphic('gr1', 'draw:fill="none" draw:stroke="none"', { parent: 'Object_20_with_20_no_20_fill_20_and_20_no_20_line' }) + graphic('gr2', 'draw:fill="solid" draw:fill-color="#445566" draw:stroke="none"') + textStyle('T1', 'style:font-name="Papyrus" fo:font-size="20pt"') },
    );
    const keys = keysOf(out.report);
    expect('ses genres', ['freeDrawings', 'shapes', 'fonts', 'links'].every(key => keys.includes(key)), keys);
    const own = out.report.filter(entry => entry.scope === 'odp').map(entry => entry.key);
    expect('les genres de la présentation sont dans l\'ordre de REPORT_KEYS', own.join() === OdpImport.REPORT_KEYS.filter(key => own.includes(key)).join(), own);
    expect('ceux du texte viennent après, avec la portée odt', out.report.slice(own.length).every(entry => entry.scope === 'odt') && keys.indexOf('fonts') > keys.indexOf('shapes'), out.report);
    expect('chaque genre une seule fois', new Set(keys).size === keys.length, keys);
    return result(bad);
  });

  add('odpImport_more_than_the_maximum_slides_are_cut_and_counted', 'au delà de 500 diapositives, les autres sont comptées (slidesCut) et laissées ; l\'avancement est dit à chaque diapositive', async () => {
    await ready();
    const { bad, expect } = checker();
    const many = Array.from({ length: OdpImport.MAX_SLIDES + 3 }, (_, i) => page('D' + i, ''));
    const seen = [];
    const out = await OdpImport.fromBuffer(await odp({ pages: many }), { onProgress: info => seen.push(info.done + '/' + info.total) });
    expect('500 diapositives lues', out.slideCount === OdpImport.MAX_SLIDES, out.slideCount);
    expect('les trois autres comptées', countOf(out.report, 'slidesCut') === 3, out.report);
    expect('l\'avancement : 1/500 puis 500/500', seen[0] === '1/' + OdpImport.MAX_SLIDES && seen[seen.length - 1] === OdpImport.MAX_SLIDES + '/' + OdpImport.MAX_SLIDES && seen.length === OdpImport.MAX_SLIDES, [seen[0], seen[seen.length - 1], seen.length]);
    return result(bad);
  });

  add('odpImport_the_import_can_be_cancelled', '« Annuler l\'import » (shouldStop) arrête la lecture entre deux diapositives : l\'erreur `cancelled`, rien n\'est rendu', async () => {
    await ready();
    const { bad, expect } = checker();
    let reads = 0;
    const error = await failure(async () => OdpImport.fromBuffer(await odp({ pages: Array.from({ length: 20 }, (_, i) => page('D' + i, '')) }), { onProgress: () => { reads += 1; }, shouldStop: () => reads >= 3 }));
    expect('annulé : code cancelled', error && error.code === 'cancelled', error && error.code);
    expect('la lecture s\'est arrêtée à trois diapositives', reads === 3, reads);
    return result(bad);
  });

  add('odpImport_a_big_presentation_is_read_in_reasonable_time', 'une présentation de 120 diapositives de trois objets est lue en moins de 15 secondes', async () => {
    await ready();
    const { bad, expect } = checker();
    const slide = i => page('D' + i, frameText(paragraph(span('Titre ' + i, 'T1')), { style: 'gr1', box: { x: 1, y: 1, w: 20, h: 2 } }) + shape('ooxml-ellipse', { style: 'gr2', box: { x: 3, y: 5, w: 4, h: 3 } }) + lineEl('line', 1, 10, 9, 10, 'gr3'));
    const buffer = await odp({
      pages: Array.from({ length: 120 }, (_, i) => slide(i)),
      auto: graphic('gr1', 'draw:fill="none" draw:stroke="none"', { parent: 'Object_20_with_20_no_20_fill_20_and_20_no_20_line' }) + graphic('gr2', 'draw:fill="solid" draw:fill-color="#00aa88" draw:stroke="none"') + graphic('gr3', 'draw:stroke="solid" svg:stroke-color="#000000"') + textStyle('T1', 'fo:font-size="24pt"'),
    });
    const started = performance.now();
    const out = await OdpImport.fromBuffer(buffer);
    const took = performance.now() - started;
    expect('120 diapositives de trois cadres', out.slideCount === 120 && out.slideTexts.every(text => framesOf(text).length === 3), out.slideCount);
    expect('en moins de 15 s', took < 15000, Math.round(took));
    return result(bad);
  });

  // Les briques de fichiers, pour dev-tests/verify-odp-import-mouse.mjs (la même fabrique : aucun fichier binaire dans le dépôt).
  window.OdpFixtures = { odp, flat, layout, master, place, paragraph, span, frameText, presentationFrame, shape, lineEl, pictureFrame, page, notesFrame, graphic, presentationStyle, paragraphStyle, textStyle, pageStyle, bulletList, numberedList, PNG_RED };
  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.odpImport = cases;
})();
