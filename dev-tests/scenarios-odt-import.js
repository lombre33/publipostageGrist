// Suite "odtImport" - l'IMPORT OpenDocument texte (js/odt-import.js) : un fichier .odt (ou son modèle .ott, ou le .fodt « flat ») devient le HTML d'un NOUVEAU document, sur le modèle de l'import Word
// (js/docx-import.js ; chantier « formats libres » ouvert le 17/11 par Antoine : « le premier et les 3 derniers », étude du 13/11). Le HTML importé est posé dans le VRAI éditeur quand le cas le demande
// (Editor.setHTML puis Editor.getHTML : ce qu'il garde est ce que la personne voit).
//
// Les fichiers de l'essai sont ÉCRITS ICI, partie par partie (un zip OpenDocument : JSZip, XML comme LibreOffice l'écrit - styles automatiques P1, T1, Table1.A1, styles nommés, polices déclarées, page maîtresse) :
// chaque cas dit ce que son fichier contient et ce que l'import doit en faire, sans fichier binaire dans le dépôt. Ce que les cas vérifient :
//  - le fichier : un fichier refusé (pas un zip, zip sans contenu, protégé par mot de passe, tableur, présentation, document vide) avec son code d'erreur ; le « flat » et le modèle ; la page (A4, Lettre en paysage,
//    format libre, marges) ;
//  - le texte : gras, italique, souligné et sa sorte, barré, exposant, indice, couleur, fond, taille, police (remplacée par la plus proche et comptée), espacement, petites capitales, majuscules, texte masqué ;
//    les séries de caractères voisines de même aspect ne font qu'une ; l'héritage (valeurs par défaut, style, style de caractère, réglage direct) ; les blancs comme OpenDocument les lit ;
//  - les paragraphes : alignement (et sens de droite à gauche), interligne, espaces avant et après, retraits, titres, citation, saut de page, tabulation, retour à la ligne ;
//  - les listes : puces (rond, rond creux, carré, signe choisi) et numéros (chiffres, lettres, romains) emboîtés, recommencées, continuées ; les numérotations que l'éditeur n'a pas sont comptées ;
//  - les tableaux : colonnes, fusions horizontales et verticales (cases couvertes), fonds, traits, hauteurs, alignement vertical, colonnes répétées plafonnées, tableau dans un tableau mis à plat ;
//  - les liens (sûrs seulement), les notes, images, formes, en-têtes et pieds, commentaires, modifications suivies, champs et index : COMPTÉS au compte rendu ;
//  - le rapport : chaque genre de perte compté une fois à sa place, « rien à dire » quand tout arrive, l'ordre de OdtImport.REPORT_KEYS, les lignes dans les deux langues.
(function () {
  const cases = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const add = (id, description, run) => cases.push({ id, description, run });
  const near = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
  const checker = () => {
    const bad = [];
    return { bad, expect: (label, condition, detail) => { if (!condition) bad.push(label + (detail === undefined ? '' : ' : ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); } };
  };
  const failure = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const ready = () => ExportEngines.ensure('odtImport');
  const dom = html => new DOMParser().parseFromString('<body>' + html, 'text/html').body;

  // --- Le paquet : ce que LibreOffice écrit, en plus court ---------------------------------------------------------------------------------------------------------------------
  const URN = 'urn:oasis:names:tc:opendocument:xmlns:';
  const NS = `xmlns:office="${URN}office:1.0" xmlns:style="${URN}style:1.0" xmlns:text="${URN}text:1.0" xmlns:table="${URN}table:1.0" xmlns:draw="${URN}drawing:1.0" xmlns:fo="${URN}xsl-fo-compatible:1.0" xmlns:svg="${URN}svg-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:number="${URN}datastyle:1.0" xmlns:presentation="${URN}presentation:1.0" xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0" xmlns:meta="${URN}meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:manifest="${URN}manifest:1.0"`;
  const HEAD = '<?xml version="1.0" encoding="UTF-8"?>';
  const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const MIME_TEXT = 'application/vnd.oasis.opendocument.text';
  const A4 = '<style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2cm" fo:margin-right="2cm"/>';
  // Les valeurs par défaut de LibreOffice : Liberation Serif 12 pt, polices déclarées.
  const DEFAULT_STYLES = '<style:default-style style:family="paragraph"><style:paragraph-properties fo:orphans="2" fo:widows="2" style:tab-stop-distance="1.25cm"/><style:text-properties style:font-name="Liberation Serif" fo:font-size="12pt" fo:language="fr" fo:country="FR"/></style:default-style>'
    + '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>'
    + '<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="text"><style:paragraph-properties fo:margin-top="0.423cm" fo:margin-bottom="0.212cm" fo:keep-with-next="always"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="14pt"/></style:style>'
    + '<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.247cm" fo:line-height="115%"/></style:style>'
    + '<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="1"><style:text-properties fo:font-size="130%" fo:font-weight="bold"/></style:style>'
    + '<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="2"><style:text-properties fo:font-size="115%" fo:font-weight="bold"/></style:style>'
    + '<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm" fo:margin-top="0cm" fo:margin-bottom="0.5cm"/></style:style>'
    + '<style:style style:name="Strong_20_Emphasis" style:display-name="Strong Emphasis" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>'
    + '<style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text"><style:text-properties fo:color="#000080" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>';
  const FONTS = '<style:font-face style:name="Liberation Serif" svg:font-family="&apos;Liberation Serif&apos;" style:font-family-generic="roman"/><style:font-face style:name="Liberation Sans" svg:font-family="&apos;Liberation Sans&apos;" style:font-family-generic="swiss"/>'
    + '<style:font-face style:name="Cambria" svg:font-family="Cambria" style:font-family-generic="roman"/><style:font-face style:name="Consolas" svg:font-family="Consolas" style:font-family-generic="modern"/><style:font-face style:name="Zapfino" svg:font-family="Zapfino"/>';
  const MASTER = (extra = '') => `<style:master-page style:name="Standard" style:page-layout-name="pm1">${extra}</style:master-page>`;
  const stylesXml = ({ styles = DEFAULT_STYLES, layout = A4, masters = MASTER(), fonts = FONTS, auto = '' } = {}) => `${HEAD}<office:document-styles ${NS} office:version="1.3"><office:font-face-decls>${fonts}</office:font-face-decls><office:styles>${styles}</office:styles>`
    + `<office:automatic-styles><style:page-layout style:name="pm1">${layout}</style:page-layout>${auto}</office:automatic-styles><office:master-styles>${masters}</office:master-styles></office:document-styles>`;
  const contentXml = ({ body, auto = '', bodyTag = 'office:text' }) => `${HEAD}<office:document-content ${NS} office:version="1.3"><office:font-face-decls/><office:automatic-styles>${auto}</office:automatic-styles><office:body><${bodyTag}>${body}</${bodyTag}></office:body></office:document-content>`;
  const manifest = (mime, encrypted) => `${HEAD}<manifest:manifest ${NS} manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/>`
    + `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml">${encrypted ? '<manifest:encryption-data manifest:checksum-type="SHA1/1K" manifest:checksum="AAAA"/>' : ''}</manifest:file-entry>`
    + '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>';
  // Le fichier : `body` (le XML du corps), `auto` (styles automatiques de content.xml), `styles`, `layout`, `masters`, `fonts`, `autoStyles` (ceux de styles.xml), `mime`, `bodyTag`, `encrypted`, `parts`.
  async function odt({ body = '<text:p>Bonjour</text:p>', auto = '', styles, layout, masters, fonts, autoStyles, mime = MIME_TEXT, bodyTag = 'office:text', encrypted = false, parts = {}, noContent = false } = {}) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = new JSZip();
    zip.file('mimetype', mime, { compression: 'STORE' });
    zip.file('META-INF/manifest.xml', manifest(mime, encrypted));
    if (!noContent) zip.file('content.xml', contentXml({ body, auto, bodyTag }));
    zip.file('styles.xml', stylesXml({ styles, layout, masters, fonts, auto: autoStyles }));
    Object.keys(parts).forEach(name => zip.file(name, parts[name]));
    return zip.generateAsync({ type: 'arraybuffer', mimeType: mime });
  }
  const flat = ({ body, auto = '', mime = MIME_TEXT } = {}) => new TextEncoder().encode(`${HEAD}<office:document ${NS} office:version="1.3" office:mimetype="${mime}"><office:font-face-decls>${FONTS}</office:font-face-decls><office:styles>${DEFAULT_STYLES}</office:styles>`
    + `<office:automatic-styles><style:page-layout style:name="pm1">${A4}</style:page-layout>${auto}</office:automatic-styles><office:master-styles>${MASTER()}</office:master-styles><office:body><office:text>${body}</office:text></office:body></office:document>`).buffer;
  // Les briques d'un corps.
  const p = (content, style = '') => `<text:p${style ? ` text:style-name="${style}"` : ''}>${content}</text:p>`;
  const h = (content, level = 1, style = '') => `<text:h text:style-name="${style || 'Heading_20_' + level}" text:outline-level="${level}">${content}</text:h>`;
  const span = (content, style) => `<text:span text:style-name="${style}">${content}</text:span>`;
  const pStyle = (name, para = '', text = '', parent = 'Standard', extra = '') => `<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="${parent}"${extra}>${para ? `<style:paragraph-properties ${para}/>` : ''}${text ? `<style:text-properties ${text}/>` : ''}</style:style>`;
  const tStyle = (name, text, parent = '') => `<style:style style:name="${name}" style:family="text"${parent ? ` style:parent-style-name="${parent}"` : ''}><style:text-properties ${text}/></style:style>`;
  const cellStyle = (name, props) => `<style:style style:name="${name}" style:family="table-cell"><style:table-cell-properties ${props}/></style:style>`;
  const colStyle = (name, width) => `<style:style style:name="${name}" style:family="table-column"><style:table-column-properties style:column-width="${width}"/></style:style>`;
  const cell = (content, style = '', attrs = '') => `<table:table-cell${style ? ` table:style-name="${style}"` : ''}${attrs ? ' ' + attrs : ''} office:value-type="string">${content}</table:table-cell>`;
  const covered = (count = 1) => `<table:covered-table-cell${count > 1 ? ` table:number-columns-repeated="${count}"` : ''}/>`;
  const row = (cells, style = '', attrs = '') => `<table:table-row${style ? ` table:style-name="${style}"` : ''}${attrs ? ' ' + attrs : ''}>${cells.join('')}</table:table-row>`;
  const table = (cols, rows, { style = '', name = 'Table1' } = {}) => `<table:table table:name="${name}"${style ? ` table:style-name="${style}"` : ''}>${cols}${rows.join('')}</table:table>`;
  const bulletList = (items, style = 'L1') => `<text:list text:style-name="${style}">${items.join('')}</text:list>`;
  const item = (content, attrs = '') => `<text:list-item${attrs ? ' ' + attrs : ''}>${content}</text:list-item>`;
  const BULLET_LEVELS = (levels) => levels.map((ch, i) => `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="${esc(ch)}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(i + 1) * 1.27}cm" fo:text-indent="-0.635cm" fo:margin-left="${(i + 1) * 1.27}cm"/></style:list-level-properties></text:list-level-style-bullet>`).join('');
  const NUMBER_LEVEL = (level, format, { prefix = '', suffix = '.', start = 1, display = 1 } = {}) => `<text:list-level-style-number text:level="${level}" style:num-prefix="${esc(prefix)}" style:num-suffix="${esc(suffix)}" style:num-format="${format}"${start !== 1 ? ` text:start-value="${start}"` : ''}${display !== 1 ? ` text:display-levels="${display}"` : ''}/>`;
  const listStyle = (name, levels) => `<text:list-style style:name="${name}">${levels}</text:list-style>`;

  // Le fichier importé : `{ html, page, headerFooter, report }`.
  async function imported(options, importOptions) {
    await ready();
    return OdtImport.fromBuffer(await odt(options), importOptions);
  }
  const keysOf = report => report.map(entry => entry.key);
  const countOf = (report, key) => (report.find(entry => entry.key === key) || {}).n || 0;
  const inEditor = async (html) => {
    Editor.setHTML(html);
    await sleep(250);
    return Editor.getHTML();
  };
  const textOf = html => dom(html).textContent.replace(/\s+/g, ' ').trim();

  // ============================================================================================================================================================================================
  // 1. Le fichier
  // ============================================================================================================================================================================================
  add('odtImport_a_refused_file_says_why', 'un fichier qui n\'est pas un OpenDocument texte est refusé avec son code : pas un zip (unreadable), un zip sans contenu (unreadable), protégé (encrypted), un tableur ou une présentation (wrongType et son genre), un document vide (empty)', async () => {
    await ready();
    const { bad, expect } = checker();
    const text = await failure(() => OdtImport.fromBuffer(new TextEncoder().encode('bonjour').buffer));
    expect('un texte n\'est pas un document OpenDocument : unreadable', text && text.code === 'unreadable', text && text.code);
    const noContent = await failure(async () => OdtImport.fromBuffer(await odt({ noContent: true })));
    expect('un zip sans content.xml : unreadable', noContent && noContent.code === 'unreadable', noContent && noContent.code);
    const locked = await failure(async () => OdtImport.fromBuffer(await odt({ encrypted: true })));
    expect('un fichier protégé par un mot de passe : encrypted', locked && locked.code === 'encrypted', locked && locked.code);
    const sheet = await failure(async () => OdtImport.fromBuffer(await odt({ mime: 'application/vnd.oasis.opendocument.spreadsheet', bodyTag: 'office:spreadsheet', body: '<table:table table:name="A"/>' })));
    expect('un tableur : wrongType et son genre', sheet && sheet.code === 'wrongType' && sheet.kind === 'spreadsheet', sheet && [sheet.code, sheet.kind]);
    const slides = await failure(async () => OdtImport.fromBuffer(await odt({ mime: 'application/vnd.oasis.opendocument.presentation', bodyTag: 'office:presentation', body: '<draw:page draw:name="p1"/>' })));
    expect('une présentation : wrongType et son genre', slides && slides.code === 'wrongType' && slides.kind === 'presentation', slides && [slides.code, slides.kind]);
    const empty = await failure(async () => OdtImport.fromBuffer(await odt({ body: p('') + p('   ') })));
    expect('un document sans texte : empty', empty && empty.code === 'empty', empty && empty.code);
    const bytes = new Uint8Array(16);
    bytes.set([0x50, 0x4B, 3, 4]);
    const broken = await failure(() => OdtImport.fromBuffer(bytes.buffer));
    expect('un zip abîmé : unreadable', broken && broken.code === 'unreadable', broken && broken.code);
    return result(bad);
  });

  add('odtImport_flat_and_template_files_are_read_like_the_zip', 'le fichier « flat » (.fodt, un seul XML) et le modèle (.ott) donnent le même document que le zip', async () => {
    await ready();
    const { bad, expect } = checker();
    const body = h('Titre') + p('Un ' + span('mot', 'T1') + ' en gras.');
    const auto = tStyle('T1', 'fo:font-weight="bold"');
    const zipped = await OdtImport.fromBuffer(await odt({ body, auto }));
    const flatOut = await OdtImport.fromBuffer(flat({ body, auto }));
    const template = await OdtImport.fromBuffer(await odt({ body, auto, mime: 'application/vnd.oasis.opendocument.text-template' }));
    expect('le flat donne le même HTML que le zip', flatOut.html === zipped.html, [flatOut.html.slice(0, 160), zipped.html.slice(0, 160)]);
    expect('le modèle donne le même HTML que le zip', template.html === zipped.html, template.html.slice(0, 160));
    const parsed = dom(zipped.html);
    expect('le titre et le mot en gras sont là', !!parsed.querySelector('h1') && parsed.querySelector('h1').textContent === 'Titre' && Array.from(parsed.querySelectorAll('strong')).some(el => el.textContent === 'mot'), zipped.html.slice(0, 300));
    return result(bad);
  });

  add('odtImport_other_prefixes_are_read_by_namespace', 'un fichier dont les préfixes sont autres (« t: » au lieu de « text: ») est lu de même', async () => {
    await ready();
    const { bad, expect } = checker();
    const buffer = new TextEncoder().encode(`${HEAD}<o:document xmlns:o="${URN}office:1.0" xmlns:t="${URN}text:1.0" xmlns:s="${URN}style:1.0" o:mimetype="${MIME_TEXT}"><o:body><o:text><t:p>Préfixes libres</t:p></o:text></o:body></o:document>`).buffer;
    const out = await OdtImport.fromBuffer(buffer);
    expect('le texte est repris', textOf(out.html) === 'Préfixes libres', out.html);
    return result(bad);
  });

  add('odtImport_page_is_the_first_master_page', 'la page : A4, Lettre en paysage, format libre, marges (la page maîtresse de départ)', async () => {
    const { bad, expect } = checker();
    const a4 = await imported({});
    expect('A4 portrait, marges de 20 mm', a4.page && a4.page.format === PageLayout.normalizeFormat('A4') && a4.page.orientation === PageLayout.PORTRAIT && near(a4.page.top, 20, 0.2) && near(a4.page.left, 20, 0.2), a4.page);
    const letter = await imported({ layout: '<style:page-layout-properties fo:page-width="11in" fo:page-height="8.5in" style:print-orientation="landscape" fo:margin-top="1in" fo:margin-bottom="1in" fo:margin-left="0.5in" fo:margin-right="0.5in"/>' });
    expect('Lettre en paysage : format libre 215,9 x 279,4, marges 25,4 et 12,7 mm', letter.page && letter.page.orientation === PageLayout.LANDSCAPE && near(letter.page.top, 25.4, 0.2) && near(letter.page.left, 12.7, 0.2), letter.page);
    const free = await imported({ layout: '<style:page-layout-properties fo:page-width="150mm" fo:page-height="200mm" fo:margin="1cm"/>' });
    expect('un format libre 150 x 200 : ni A5 ni A4, marges de 10 mm données par « fo:margin »', free.page && free.page.format === PageLayout.normalizeFormat('150x200') && near(free.page.right, 10, 0.2), free.page);
    const a5 = await imported({ layout: '<style:page-layout-properties fo:page-width="14.8cm" fo:page-height="21cm"/>' });
    expect('A5', a5.page && a5.page.format === PageLayout.normalizeFormat('A5'), a5.page);
    return result(bad);
  });

  add('odtImport_a_style_that_changes_page_layout_is_counted_and_makes_a_page_break', 'un style qui change de page maîtresse commence une page ; seule la page de départ est reprise et chaque autre mise en page demandée est comptée (une page maîtresse jamais demandée ne compte pas)', async () => {
    const auto = '<style:style style:name="PL" style:family="paragraph" style:parent-style-name="Standard" style:master-page-name="Landscape"/><style:style style:name="PS" style:family="paragraph" style:parent-style-name="Standard" style:master-page-name="Standard"/>';
    const masters = MASTER() + '<style:master-page style:name="Landscape" style:page-layout-name="pm2"/><style:master-page style:name="Unused" style:page-layout-name="pm3"/>';
    const autoStyles = '<style:page-layout style:name="pm2"><style:page-layout-properties fo:page-width="29.7cm" fo:page-height="21cm" fo:margin="2cm"/></style:page-layout><style:page-layout style:name="pm3"><style:page-layout-properties fo:page-width="10cm" fo:page-height="10cm"/></style:page-layout>';
    const out = await imported({ auto, masters, autoStyles, body: p('Début') + p('Paysage', 'PL') + p('Retour', 'PS') + p('Encore paysage', 'PL') });
    const { bad, expect } = checker();
    expect('la page de départ est l\'A4 portrait', out.page && out.page.orientation === PageLayout.PORTRAIT, out.page);
    expect('trois sauts de page (trois paragraphes qui changent de page)', out.html.split('page-break-marker').length - 1 === 3, out.html);
    expect('UNE autre mise en page demandée (paysage), comptée une fois ; « Unused » n\'est jamais demandée', countOf(out.report, 'sections') === 1, out.report);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 2. Le texte
  // ============================================================================================================================================================================================
  add('odtImport_character_marks_come_over_as_editor_marks', 'gras, italique, souligné (et sa sorte), barré, exposant, indice, couleur, fond, taille, police, espacement, petites capitales, majuscules : repris comme marques de l\'éditeur', async () => {
    const auto = [
      tStyle('T1', 'fo:font-weight="bold"'), tStyle('T2', 'fo:font-style="italic"'), tStyle('T3', 'style:text-underline-style="solid" style:text-underline-width="auto"'),
      tStyle('T4', 'style:text-underline-style="dotted" style:text-underline-width="auto"'), tStyle('T5', 'style:text-line-through-style="solid"'), tStyle('T6', 'style:text-position="super 58%"'),
      tStyle('T7', 'style:text-position="sub 58%"'), tStyle('T8', 'fo:color="#c80000"'), tStyle('T9', 'fo:background-color="#ffff00"'), tStyle('T10', 'fo:font-size="20pt"'),
      tStyle('T11', 'style:font-name="Liberation Sans"'), tStyle('T12', 'fo:letter-spacing="0.05cm"'), tStyle('T13', 'fo:font-variant="small-caps"'), tStyle('T14', 'fo:text-transform="uppercase"'),
      tStyle('T15', 'style:text-underline-style="solid" style:text-underline-type="double"'),
    ].join('');
    const out = await imported({ auto, body: p(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15'].map(name => span(name + ' ', name)).join('')) });
    const { bad, expect } = checker();
    const root = dom(out.html);
    expect('gras', !!root.querySelector('strong') && /T1/.test(root.querySelector('strong').textContent));
    expect('italique', !!root.querySelector('em') && /T2/.test(root.querySelector('em').textContent));
    expect('souligné uni', Array.from(root.querySelectorAll('u')).some(u => /T3/.test(u.textContent) && !u.getAttribute('style')), out.html.slice(0, 400));
    expect('souligné pointillé', Array.from(root.querySelectorAll('u')).some(u => /T4/.test(u.textContent) && /dotted/.test(u.getAttribute('style') || '')));
    expect('souligné double', Array.from(root.querySelectorAll('u')).some(u => /T15/.test(u.textContent) && /double/.test(u.getAttribute('style') || '')));
    expect('barré', !!root.querySelector('s') && /T5/.test(root.querySelector('s').textContent));
    expect('exposant', !!root.querySelector('sup') && /T6/.test(root.querySelector('sup').textContent));
    expect('indice', !!root.querySelector('sub') && /T7/.test(root.querySelector('sub').textContent));
    expect('couleur du texte', /color: #c80000/.test(out.html), out.html.slice(0, 600));
    expect('fond du texte', /background-color: #ffff00/.test(out.html));
    expect('taille 20 pt', /font-size: 20pt/.test(out.html));
    expect('police Arial (la plus proche de Liberation Sans)', /font-family: Arial/.test(out.html));
    expect('espacement', /letter-spacing/.test(out.html), out.html.slice(0, 600));
    expect('petites capitales', /small-caps/.test(out.html));
    expect('majuscules : le texte est écrit en capitales', /T14/.test(root.textContent) && root.textContent.indexOf('T14') >= 0 && /T14/.test(root.textContent.toUpperCase()));
    return result(bad);
  });

  add('odtImport_inheritance_defaults_style_character_style_direct', 'l\'héritage : valeurs par défaut du fichier, style de paragraphe et ses parents, style de caractère, réglage direct - chacun l\'emporte sur le précédent', async () => {
    const styles = DEFAULT_STYLES + pStyle('Parent', '', 'fo:font-weight="bold" fo:color="#112233"', 'Standard', ' style:display-name="Parent"') + pStyle('Child', '', 'fo:font-style="italic" fo:color="#445566"', 'Parent');
    const auto = tStyle('T1', 'fo:color="#778899"', 'Strong_20_Emphasis');
    const out = await imported({ styles, auto, body: p('hérité', 'Child') + p('mot ' + span('direct', 'T1') + ' fin', 'Child') });
    const { bad, expect } = checker();
    expect('le gras du style parent et l\'italique de l\'enfant sont repris', /<strong><em>/.test(out.html) || /<em><strong>/.test(out.html), out.html.slice(0, 300));
    expect('la couleur du style enfant (445566) l\'emporte sur celle du parent (112233)', /#445566/.test(out.html) && !/#112233/.test(out.html), out.html.slice(0, 400));
    expect('la couleur directe (778899) l\'emporte sur celle du style', /#778899/.test(out.html), out.html.slice(0, 600));
    return result(bad);
  });

  add('odtImport_neighbouring_runs_with_the_same_look_make_one', 'les séries de caractères voisines de même aspect ne font qu\'une (LibreOffice en coupe à chaque correction)', async () => {
    const auto = tStyle('T1', 'fo:font-weight="bold"') + tStyle('T2', 'fo:font-weight="bold"');
    const out = await imported({ auto, body: p(span('gras', 'T1') + span(' encore', 'T2') + ' et normal') });
    const { bad, expect } = checker();
    const strong = dom(out.html).querySelectorAll('strong');
    expect('un seul <strong> pour « gras encore »', strong.length === 1 && strong[0].textContent === 'gras encore', out.html);
    return result(bad);
  });

  add('odtImport_whitespace_is_read_the_opendocument_way', 'les blancs : une suite de blancs du fichier n\'en fait qu\'un, <text:s text:c="3"/> en fait trois, <text:tab/> une tabulation, <text:line-break/> un retour à la ligne ; le premier blanc d\'un paragraphe ne compte pas', async () => {
    const out = await imported({ body: p('  Un   mot\n   suivant<text:s text:c="3"/>fin<text:tab/>tab<text:line-break/>ligne') });
    const { bad, expect } = checker();
    const text = dom(out.html).textContent;
    expect('« Un mot suivant » (blancs réduits, sans blanc de tête)', /^Un mot suivant/.test(text), text);
    expect('trois espaces explicites avant « fin »', /suivant {3}fin/.test(text.replace(/ /g, ' ')), JSON.stringify(text));
    expect('une tabulation', /fin\ttab/.test(text), JSON.stringify(text));
    expect('un retour à la ligne', /<br\b/.test(out.html) && /tab/.test(text) && /ligne/.test(text), out.html);
    return result(bad);
  });

  add('odtImport_unknown_fonts_are_replaced_and_counted_once', 'une police que l\'éditeur n\'a pas est remplacée par la plus proche et comptée UNE fois ; Cambria → Times New Roman, Consolas → Courier New, une police sans cousine → celle de l\'éditeur', async () => {
    const auto = tStyle('T1', 'style:font-name="Cambria"') + tStyle('T2', 'style:font-name="Consolas"') + tStyle('T3', 'style:font-name="Zapfino"');
    const out = await imported({ auto, body: p(span('a', 'T1') + ' ' + span('b', 'T2') + ' ' + span('c', 'T3') + ' ' + span('d', 'T1')) });
    const { bad, expect } = checker();
    expect('Cambria → Times New Roman', /font-family: Times New Roman/.test(out.html), out.html);
    expect('Consolas → Courier New', /font-family: Courier New/.test(out.html), out.html);
    expect('Zapfino : la police de l\'éditeur (aucune déclaration)', !/Zapfino/.test(out.html));
    expect('trois polices comptées (Cambria une seule fois malgré deux emplois)', countOf(out.report, 'fonts') === 3, out.report);
    return result(bad);
  });

  add('odtImport_hidden_text_is_removed_and_counted', 'le texte masqué (text:display="none") est retiré et compté', async () => {
    const auto = tStyle('T1', 'text:display="none"');
    const out = await imported({ auto, body: p('visible ' + span('secret', 'T1') + 'fin') });
    const { bad, expect } = checker();
    expect('« secret » n\'est pas dans le document', !/secret/.test(out.html) && /visible/.test(out.html), out.html);
    expect('un texte masqué compté', countOf(out.report, 'hidden') === 1, out.report);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 3. Les paragraphes
  // ============================================================================================================================================================================================
  add('odtImport_paragraph_alignment_spacing_and_indents', 'alignement (début, fin, centré, justifié), sens de droite à gauche, interligne (pourcentage et hauteur fixe), espaces avant et après, retrait de première ligne et à gauche', async () => {
    const auto = [
      pStyle('P1', 'fo:text-align="center"'), pStyle('P2', 'fo:text-align="end"'), pStyle('P3', 'fo:text-align="justify"'), pStyle('P4', 'style:writing-mode="rl-tb" fo:text-align="start"'),
      pStyle('P5', 'fo:line-height="200%" fo:margin-top="0.5cm" fo:margin-bottom="1cm"'), pStyle('P6', 'fo:line-height="18pt"', 'fo:font-size="12pt"'),
      pStyle('P7', 'fo:margin-left="2cm" fo:text-indent="1cm"'), pStyle('P8', 'fo:margin-right="1cm"'),
    ].join('');
    const out = await imported({ auto, body: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map(name => p('texte ' + name, name)).join('') });
    const { bad, expect } = checker();
    const paragraphs = Array.from(dom(out.html).querySelectorAll('p'));
    const by = name => paragraphs.find(para => para.textContent.indexOf(name) >= 0);
    expect('centré', /text-align: center/.test(by('P1').getAttribute('style') || ''), by('P1').outerHTML);
    expect('fin = à droite', /text-align: right/.test(by('P2').getAttribute('style') || ''), by('P2').outerHTML);
    expect('justifié', /text-align: justify/.test(by('P3').getAttribute('style') || ''), by('P3').outerHTML);
    expect('de droite à gauche', by('P4').getAttribute('dir') === 'rtl', by('P4').outerHTML);
    const line = Number(by('P5').getAttribute('data-line-height'));
    expect('interligne 200 % = 2 lignes simples (x 1,172)', near(line, 2 * 1.172, 0.05) || /line-height: 2\.3/.test(by('P5').getAttribute('style') || ''), by('P5').outerHTML);
    expect('espaces avant et après', /margin-top|data-space-before/.test(by('P5').outerHTML) && /margin-bottom|data-space-after/.test(by('P5').outerHTML), by('P5').outerHTML);
    expect('hauteur de ligne fixe 18 pt sur du 12 pt : 1,5 ligne', near(Number(by('P6').getAttribute('data-line-height')), 1.5, 0.05) || /1\.5/.test(by('P6').outerHTML), by('P6').outerHTML);
    expect('retrait de première ligne et à gauche', /indent|margin-left|data-indent/i.test(by('P7').outerHTML), by('P7').outerHTML);
    expect('retrait à droite compté, non repris', countOf(out.report, 'rightIndent') === 1, out.report);
    return result(bad);
  });

  add('odtImport_headings_quote_and_page_breaks', 'titres de niveau 1 à 6, citation, saut de page avant et après (jamais un saut au tout début)', async () => {
    const styles = DEFAULT_STYLES;
    const auto = pStyle('Pb', 'fo:break-before="page"') + pStyle('Pa', 'fo:break-after="page"') + pStyle('Pstart', 'fo:break-before="page"');
    const body = p('Début', 'Pstart') + [1, 2, 3, 4, 5, 6].map(level => h('Niveau ' + level, level, level <= 2 ? '' : 'Heading')).join('') + p('Une citation', 'Quotations') + p('Avant page', 'Pb') + p('Après page', 'Pa') + p('Fin');
    const out = await imported({ styles, auto, body });
    const { bad, expect } = checker();
    const root = dom(out.html);
    expect('six titres h1 à h6', [1, 2, 3, 4, 5, 6].every(level => !!root.querySelector('h' + level)), out.html.slice(0, 300));
    expect('la citation est dans un blockquote', !!root.querySelector('blockquote') && /Une citation/.test(root.querySelector('blockquote').textContent), out.html);
    const markers = out.html.split('page-break-marker').length - 1;
    expect('deux sauts de page : avant « Avant page » et après « Après page » (pas avant « Début », premier bloc)', markers === 2, { markers, html: out.html });
    expect('l\'ordre : le saut précède « Avant page »', out.html.indexOf('page-break-marker') < out.html.indexOf('Avant page'));
    expect('pas de saut au tout début', out.html.indexOf('page-break-marker') > out.html.indexOf('Début'));
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 4. Les listes
  // ============================================================================================================================================================================================
  add('odtImport_nested_bullet_and_number_lists', 'listes à puces emboîtées (rond, rond creux, carré) et numérotées (chiffres, lettres, romains), départ et reprise', async () => {
    const styles = DEFAULT_STYLES + listStyle('L1', BULLET_LEVELS(['•', '◦', '▪']))
      + listStyle('N1', NUMBER_LEVEL(1, '1') + NUMBER_LEVEL(2, 'a', { suffix: ')' }) + NUMBER_LEVEL(3, 'i'))
      + listStyle('N2', NUMBER_LEVEL(1, '1', { start: 4 }));
    const body = bulletList([item(p('un') + bulletList([item(p('deux') + bulletList([item(p('trois'))]))]))])
      + bulletList([item(p('a1') + bulletList([item(p('b1'))], 'N1')), item(p('a2'))], 'N1')
      + bulletList([item(p('quatre')), item(p('cinq'))], 'N2');
    const out = await imported({ styles, body });
    const { bad, expect } = checker();
    const root = dom(out.html);
    const first = root.querySelector('ul');
    expect('une liste à puces à trois niveaux', !!first && !!first.querySelector('ul ul'), out.html.slice(0, 400));
    expect('niveau 2 : rond creux', first.querySelector('ul').getAttribute('data-bullet-style') === 'circle', first.querySelector('ul').outerHTML.slice(0, 100));
    expect('niveau 3 : carré', !!first.querySelector('ul ul ul') && first.querySelector('ul ul ul').getAttribute('data-bullet-style') === 'square', first.querySelector('ul ul').outerHTML.slice(0, 100));
    const numbers = root.querySelectorAll('ol');
    expect('des listes numérotées', numbers.length >= 2, out.html);
    expect('la sous-liste numérotée est en lettres', Array.from(numbers).some(ol => ol.getAttribute('data-number-style') === 'alpha'), Array.from(numbers).map(ol => ol.outerHTML.slice(0, 60)));
    expect('la liste qui commence à 4', Array.from(numbers).some(ol => ol.getAttribute('start') === '4'), Array.from(numbers).map(ol => ol.outerHTML.slice(0, 60)));
    return result(bad);
  });

  add('odtImport_bullet_signs_and_unsupported_numbering_are_counted', 'une puce dont le signe est du jeu Symbol (zone privée) devient « rond » ; une puce « choisie » est gardée ; une numérotation que l\'éditeur n\'a pas (majuscules, « 1.1 », texte autour) est remplacée et comptée UNE fois par liste et niveau', async () => {
    const styles = DEFAULT_STYLES + listStyle('L1', BULLET_LEVELS(['', '★'])) + listStyle('N1', NUMBER_LEVEL(1, 'A', { prefix: 'Art. ' }) + NUMBER_LEVEL(2, '1', { display: 2 }));
    const body = bulletList([item(p('x') + bulletList([item(p('y'))]))]) + bulletList([item(p('a') + bulletList([item(p('b')), item(p('c'))], 'N1')), item(p('d'))], 'N1');
    const out = await imported({ styles, body });
    const { bad, expect } = checker();
    const lists = dom(out.html).querySelectorAll('ul');
    expect('Symbol U+F0B7 : le rond par défaut (aucune marque)', !lists[0].getAttribute('data-bullet-style') && !lists[0].getAttribute('data-bullet-char'), lists[0].outerHTML.slice(0, 100));
    expect('une puce choisie (★) est gardée sur le niveau 2', /★/.test(out.html), out.html.slice(0, 300));
    expect('deux numérotations remplacées (niveau 1 « Art. A » et niveau 2 « 1.1 »)', countOf(out.report, 'numbering') === 2, out.report);
    return result(bad);
  });

  add('odtImport_numbering_continues_when_asked', 'une liste « continue la numérotation » reprend où la précédente s\'est arrêtée', async () => {
    const styles = DEFAULT_STYLES + listStyle('N1', NUMBER_LEVEL(1, '1'));
    const body = bulletList([item(p('un')), item(p('deux'))], 'N1') + p('entre') + `<text:list text:style-name="N1" text:continue-numbering="true"><text:list-item><text:p>trois</text:p></text:list-item></text:list>`;
    const out = await imported({ styles, body });
    const { bad, expect } = checker();
    const lists = dom(out.html).querySelectorAll('ol');
    expect('deux listes numérotées', lists.length === 2, out.html);
    expect('la seconde commence à 3', lists[1] && lists[1].getAttribute('start') === '3', lists[1] && lists[1].outerHTML.slice(0, 80));
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 5. Les tableaux
  // ============================================================================================================================================================================================
  add('odtImport_table_columns_spans_fills_borders_and_heights', 'tableau : largeur des colonnes, fusions horizontale (case couverte) et verticale, fonds, traits d\'une case (et le trait que sa voisine trace), hauteur de ligne, alignement vertical', async () => {
    const auto = `<style:style style:name="Table1" style:family="table"><style:table-properties style:width="12cm" table:align="left"/></style:style>` + colStyle('Table1.A', '3cm') + colStyle('Table1.B', '4cm') + colStyle('Table1.C', '5cm')
      + `<style:style style:name="Table1.1" style:family="table-row"><style:table-row-properties style:row-height="2cm"/></style:style>`
      + cellStyle('Table1.A1', 'fo:border="0.5pt solid #000000" fo:padding="0.1cm"') + cellStyle('Table1.B1', 'fo:background-color="#ffcc00" fo:border="none" style:vertical-align="middle"') + cellStyle('Table1.C1', 'fo:border-left="1pt dotted #ff0000" fo:border-top="none" fo:border-right="none" fo:border-bottom="none" style:vertical-align="bottom"');
    const cols = '<table:table-column table:style-name="Table1.A"/><table:table-column table:style-name="Table1.B"/><table:table-column table:style-name="Table1.C"/>';
    const rows = [
      row([cell(p('A1'), 'Table1.A1'), cell(p('B1'), 'Table1.B1', 'table:number-columns-spanned="2"'), covered()], 'Table1.1'),
      row([cell(p('A2'), 'Table1.A1', 'table:number-rows-spanned="2"'), cell(p('B2'), 'Table1.C1'), cell(p('C2'), 'Table1.C1')]),
      row([covered(), cell(p('B3')), cell(p('C3'))]),
    ];
    const out = await imported({ auto, body: table(cols, rows, { style: 'Table1' }) });
    const { bad, expect } = checker();
    const root = dom(out.html);
    const cells = Array.from(root.querySelectorAll('td'));
    expect('sept cases : A1, B1 (fusionnée sur deux colonnes), A2 (sur deux lignes), B2, C2, B3, C3', cells.length === 7, cells.map(c => c.textContent));
    const colwidths = Array.from(root.querySelectorAll('col')).map(c => parseFloat(c.getAttribute('style').replace(/[^0-9.]/g, '')));
    expect('trois colonnes de 3, 4 et 5 cm (113, 151 et 189 px à 2 px près)', colwidths.length === 3 && near(colwidths[0], 113.4, 2) && near(colwidths[1], 151.2, 2) && near(colwidths[2], 189, 2), colwidths);
    const b1 = cells.find(c => c.textContent === 'B1');
    expect('B1 sur deux colonnes', b1.getAttribute('colspan') === '2', b1.outerHTML.slice(0, 160));
    const a2 = cells.find(c => c.textContent === 'A2');
    expect('A2 sur deux lignes', a2.getAttribute('rowspan') === '2', a2.outerHTML.slice(0, 160));
    expect('fond jaune de B1', /background-color: #ffcc00/.test(b1.getAttribute('style') || ''), b1.outerHTML.slice(0, 200));
    expect('alignement vertical : B1 au milieu', b1.getAttribute('data-valign') === 'middle');
    expect('traits de A1 : noirs sur les quatre côtés', ['top', 'right', 'bottom', 'left'].every(side => cells[0].getAttribute('data-border-' + side) === '#000000'), cells[0].outerHTML.slice(0, 260));
    const a1 = cells[0];
    const c2 = cells.find(c => c.textContent === 'C2');
    expect('C2 : trait gauche rouge', c2.getAttribute('data-border-left') === '#ff0000', c2.outerHTML.slice(0, 260));
    expect('C2 : trait gauche pointillé compté (repris en trait fin uni)', countOf(out.report, 'borderStyles') === 1, out.report);
    expect('hauteur de la première ligne : 2 cm = 76 px', near(Number(root.querySelector('tr').getAttribute('data-row-height')), 75.6, 1.5), root.querySelector('tr').outerHTML.slice(0, 120));
    expect('A1 n\'a rien à sa gauche que son propre trait', a1.getAttribute('data-border-left') === '#000000');
    return result(bad);
  });

  add('odtImport_repeated_columns_and_rows_are_capped', 'les colonnes et les lignes « répétées » (LibreOffice en écrit 16 383) sont plafonnées, jamais des milliers de cases', async () => {
    const cols = '<table:table-column table:number-columns-repeated="16383"/>';
    const rows = [row([cell(p('a')), cell(p('b')), `<table:table-cell table:number-columns-repeated="16380"/>`]), `<table:table-row table:number-rows-repeated="1048000"><table:table-cell table:number-columns-repeated="16383"/></table:table-row>`];
    const out = await imported({ body: table(cols, rows) });
    const { bad, expect } = checker();
    const cells = dom(out.html).querySelectorAll('td').length;
    expect('au plus 20 000 cases (le plafond tient)', cells > 0 && cells <= 20000, cells);
    expect('le tableau coupé est compté', countOf(out.report, 'tableCells') === 1, out.report);
    expect('le texte est là', /a/.test(textOf(out.html)));
    return result(bad);
  });

  add('odtImport_nested_table_is_flattened_and_counted', 'un tableau dans une case est mis à plat (l\'éditeur n\'en a pas) et compté', async () => {
    const inner = table('<table:table-column/>', [row([cell(p('dedans'))])], { name: 'Inner' });
    const out = await imported({ body: table('<table:table-column/>', [row([cell(p('dehors') + inner)])]) });
    const { bad, expect } = checker();
    const root = dom(out.html);
    expect('un seul tableau', root.querySelectorAll('table').length === 1, out.html);
    expect('le texte du tableau interne est repris', /dehors/.test(out.html) && /dedans/.test(out.html), out.html);
    expect('un tableau mis à plat compté', countOf(out.report, 'nestedTables') === 1, out.report);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 6. Les liens, ce qui n'est pas repris, le compte rendu
  // ============================================================================================================================================================================================
  add('odtImport_links_keep_only_safe_addresses', 'un lien https, mailto ou tel est gardé ; un lien « javascript: » ou « file: » reste du texte et est compté', async () => {
    const body = p('<text:a xlink:href="https://exemple.fr/page" xlink:type="simple">sûr</text:a> '
      + '<text:a xlink:href="mailto:a@b.fr" xlink:type="simple">mél</text:a> '
      + '<text:a xlink:href="javascript:alert(1)" xlink:type="simple">piège</text:a> '
      + '<text:a xlink:href="file:///etc/passwd" xlink:type="simple">fichier</text:a>');
    const out = await imported({ body });
    const { bad, expect } = checker();
    const links = Array.from(dom(out.html).querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect('deux liens gardés', JSON.stringify(links) === JSON.stringify(['https://exemple.fr/page', 'mailto:a@b.fr']), links);
    expect('le texte des liens refusés reste', /piège/.test(out.html) && /fichier/.test(out.html));
    expect('deux liens refusés comptés', countOf(out.report, 'links') === 2, out.report);
    expect('rien d\'exécutable dans le HTML', !/javascript:|onerror|<script/i.test(out.html), out.html);
    return result(bad);
  });

  add('odtImport_what_is_not_carried_over_is_counted', 'notes, images, formes, commentaires, modifications suivies, champs, index, section à colonnes, en-tête : comptés au compte rendu, jamais perdus en silence', async () => {
    const auto = `<style:style style:name="Sect1" style:family="section"><style:section-properties><style:columns fo:column-count="2" fo:column-gap="0.5cm"/></style:section-properties></style:style>`;
    const body = '<text:tracked-changes text:track-changes="true"><text:changed-region text:id="ct1"><text:insertion><office:change-info><dc:creator>A</dc:creator></office:change-info></text:insertion></text:changed-region></text:tracked-changes>'
      + p('Texte avec note<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>Contenu de la note</text:p></text:note-body></text:note> et commentaire<office:annotation><dc:creator>B</dc:creator><text:p>À revoir</text:p></office:annotation><office:annotation-end/>.')
      + p('Image <draw:frame draw:name="i1" text:anchor-type="as-char" svg:width="2cm" svg:height="1cm"><draw:image xlink:href="Pictures/a.png" xlink:type="simple"/></draw:frame>')
      + p('Zone <draw:frame draw:name="z1" text:anchor-type="as-char" svg:width="2cm" svg:height="1cm"><draw:text-box><text:p>dedans</text:p></draw:text-box></draw:frame>')
      + p('Date : <text:date text:date-value="2026-11-17">17/11/2026</text:date>, page <text:page-number>3</text:page-number>')
      + '<text:table-of-content text:name="Index1"><text:index-body><text:p>Sommaire</text:p></text:index-body></text:table-of-content>'
      + '<text:section text:style-name="Sect1" text:name="S1"><text:p>En colonnes</text:p></text:section>';
    const out = await imported({ auto, body, masters: MASTER('<style:header><text:p>En-tête</text:p></style:header>') });
    const { bad, expect } = checker();
    expect('la note est comptée', countOf(out.report, 'notes') === 1, out.report);
    expect('le commentaire est compté', countOf(out.report, 'comments') === 1, out.report);
    expect('l\'image est comptée', countOf(out.report, 'images') === 1, out.report);
    expect('la zone de texte est comptée comme forme', countOf(out.report, 'shapes') === 1, out.report);
    expect('deux champs comptés (date, numéro de page)', countOf(out.report, 'fields') === 2, out.report);
    expect('l\'index est compté', countOf(out.report, 'toc') === 1, out.report);
    expect('la section en deux colonnes est comptée', countOf(out.report, 'columns') === 1, out.report);
    expect('la modification suivie est comptée', countOf(out.report, 'trackedChanges') === 1, out.report);
    expect('l\'en-tête est compté', countOf(out.report, 'headerFooter') === 1, out.report);
    expect('le texte « En colonnes » est repris, sur une colonne', /En colonnes/.test(out.html));
    expect('les champs gardent leur dernière valeur', /17\/11\/2026/.test(out.html), out.html.slice(0, 600));
    expect('le texte de la zone n\'est pas repris', !/dedans/.test(out.html), out.html);
    expect('l\'ordre du rapport suit OdtImport.REPORT_KEYS', JSON.stringify(keysOf(out.report)) === JSON.stringify(OdtImport.REPORT_KEYS.filter(key => keysOf(out.report).indexOf(key) >= 0)), keysOf(out.report));
    return result(bad);
  });

  add('odtImport_a_plain_document_has_nothing_to_report', 'un document ordinaire (titre, texte, liste, tableau, lien) arrive sans rien à dire', async () => {
    const out = await imported({ styles: DEFAULT_STYLES + listStyle('L1', BULLET_LEVELS(['•'])), body: h('Titre') + p('Texte <text:a xlink:href="https://exemple.fr" xlink:type="simple">lien</text:a>') + bulletList([item(p('un'))]) + table('<table:table-column/>', [row([cell(p('a'))])]) });
    const { bad, expect } = checker();
    expect('rapport vide', out.report.length === 0, out.report);
    return result(bad);
  });

  add('odtImport_report_lines_exist_in_both_languages', 'chaque genre du rapport a sa ligne en français ET en anglais, au singulier comme au pluriel, sans clé brute', async () => {
    await ready();
    const { bad, expect } = checker();
    const lang = I18n.getLang();
    OdtImport.REPORT_KEYS.forEach((key) => {
      ['fr', 'en'].forEach((code) => {
        I18n.setLang && I18n.setLang(code);
        const one = I18n.t('odt.import.report.' + key, { n: 1 });
        const many = I18n.t('odt.import.report.' + key, { n: 4 });
        expect(code + ' / ' + key + ' : une ligne', typeof one === 'string' && one.length > 8 && one.indexOf('odt.import.report.') < 0 && one.indexOf('{') < 0, one);
        expect(code + ' / ' + key + ' : le pluriel diffère du singulier et porte le nombre', many !== one && /4/.test(many), [one, many]);
      });
    });
    I18n.setLang && I18n.setLang(lang);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 7. Dans l'éditeur réel
  // ============================================================================================================================================================================================
  add('odtImport_the_real_editor_keeps_what_the_import_wrote', 'le HTML importé posé dans l\'éditeur réel puis relu garde le texte, les titres, la liste, le tableau et ses fusions', async () => {
    await ready();
    const styles = DEFAULT_STYLES + listStyle('L1', BULLET_LEVELS(['•']));
    const auto = tStyle('T1', 'fo:font-weight="bold" fo:color="#c80000"') + cellStyle('Table1.A1', 'fo:border="0.5pt solid #000000"');
    const rows = [row([cell(p('Entête'), 'Table1.A1', 'table:number-columns-spanned="2"'), covered()]), row([cell(p('A'), 'Table1.A1'), cell(p('B'), 'Table1.A1')])];
    const body = h('Compte rendu') + p('Un ' + span('mot', 'T1') + ' important.') + bulletList([item(p('premier')), item(p('second'))]) + table('<table:table-column/><table:table-column/>', rows);
    const out = await OdtImport.fromBuffer(await odt({ styles, auto, body }));
    const { bad, expect } = checker();
    const kept = await inEditor(out.html);
    const root = dom(kept);
    expect('le titre', !!root.querySelector('h1') && /Compte rendu/.test(root.querySelector('h1').textContent), kept.slice(0, 200));
    expect('le gras rouge', !!root.querySelector('strong') && /c80000/i.test(kept.replace(/rgb\(200, 0, 0\)/i, 'c80000')), kept.slice(0, 500));
    expect('la liste a ses deux items', root.querySelectorAll('li').length === 2);
    expect('le tableau garde sa fusion sur deux colonnes', !!root.querySelector('td[colspan="2"], th[colspan="2"]'), kept.slice(-400));
    expect('le texte entier est gardé', textOf(kept) === textOf(out.html), [textOf(kept).slice(0, 120), textOf(out.html).slice(0, 120)]);
    return result(bad);
  });

  add('odtImport_a_big_document_is_read_in_reasonable_time', 'un document de 3 000 paragraphes est lu en moins de 5 secondes', async () => {
    await ready();
    const { bad, expect } = checker();
    let body = '';
    for (let i = 0; i < 3000; i++) body += p('Paragraphe numéro ' + i + ' avec un peu de texte pour faire un corps ordinaire.');
    const buffer = await odt({ body });
    const started = performance.now();
    const out = await OdtImport.fromBuffer(buffer);
    const took = performance.now() - started;
    expect('tous les paragraphes sont là', (out.html.match(/<p/g) || []).length >= 3000, (out.html.match(/<p/g) || []).length);
    expect('en moins de 5 s', took < 5000, Math.round(took));
    return result(bad);
  });

  window.OdtFixtures = { odt, flat, p, h, span, pStyle, tStyle, cellStyle, colStyle, cell, covered, row, table, bulletList, item, listStyle, BULLET_LEVELS, NUMBER_LEVEL, DEFAULT_STYLES, FONTS, MASTER, A4, esc, HEAD, NS };
  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.odtImport = cases;
})();
