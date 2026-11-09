// Suite "docxImport" - l'IMPORT Word (js/docx-import.js) : un fichier .docx devient le HTML d'un NOUVEAU document (demande du 07/11 : « tous les éléments possibles qui peuvent correspondre aux fonctions déjà
// développées, dire à la personne à la fin ce qui n'a pas pu être pris, au plus près du Word, mise en page originale respectée »), lu ici dans le VRAI éditeur quand le cas le demande (Editor.setHTML puis
// Editor.getHTML : ce qu'il garde est ce que la personne voit).
//
// Les fichiers de l'essai sont ÉCRITS ICI, partie par partie (un paquet OPC : JSZip, du XML comme Word l'écrit : document, styles, numérotation, relations, notes, en-têtes, images) : chaque cas dit ce que son
// fichier contient et ce que l'import doit en faire, sans fichier binaire dans le dépôt. Ce que les cas vérifient :
//  - le fichier : un fichier refusé (pas un zip, un ancien .doc, un zip sans document, un document vide) avec son code d'erreur ; la page (A4, Lettre en paysage, format libre, marges) ;
//  - le texte : gras, italique, souligné et sa sorte, barré, exposant, indice, couleur, surlignage, taille, police (remplacée par la plus proche et comptée), espacement, petites capitales, majuscules ; les séries
//    de caractères voisines de même aspect ne font qu'une ; l'héritage (valeurs par défaut, style, style de caractère, réglage direct) ;
//  - les paragraphes : alignement (et sens de droite à gauche), interligne, espaces avant et après, retraits, titres « Titre 1 » à « Titre 6 », citation, saut de page, tabulation, retour à la ligne ;
//  - les listes : puces (rond, rond creux, carré, signe choisi) et numéros (chiffres, lettres, romains) emboîtés, recommencées, continuées ; les numérotations que l'éditeur n'a pas sont comptées ;
//  - les tableaux : colonnes, fusions horizontales et verticales, fonds, traits (cases, tableau, style de tableau et ses bandes), hauteurs, alignement vertical, tableau dans un tableau mis à plat ;
//  - les images (en ligne, flottante posée dans le texte et comptée, format illisible compté), les liens (sûrs seulement), les notes de bas de page et de fin, les champs (numéro de page, champ de fusion devenu
//    variable, champs figés comptés), les en-têtes et pieds de page (première page différente) ;
//  - le rapport : chaque genre de perte compté une fois à sa place, « rien à dire » quand tout arrive, l'ordre de DocxImport.REPORT_KEYS, les lignes dans les deux langues ;
//  - l'aller-retour : un Word écrit par l'export de l'éditeur (js/docx-export.js) puis importé redonne le même texte et la même structure.
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
  const ready = () => ExportEngines.ensure('docxImport');
  const dom = html => new DOMParser().parseFromString('<body>' + html, 'text/html').body;

  // --- Le paquet : ce que Word écrit, en plus court ---------------------------------------------------------------------------------------------------------------------------
  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const NS = `xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"`;
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rels = list => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(r => `<Relationship Id="${r.id}" Type="${REL}${r.type}" Target="${esc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;
  // Les styles d'un document ordinaire : Calibri 11 pt, 8 pt après chaque paragraphe, interligne 1,08 ; « Titre 1 » à « Titre 3 », « Titre », « Citation », « Paragraphe de liste », « Grille du tableau ».
  const STYLES = ({ extra = '', defaults = '' } = {}) => `${HEAD}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>`
    + `<w:pPrDefault><w:pPr>${defaults || '<w:spacing w:after="160" w:line="259" w:lineRule="auto"/>'}</w:pPr></w:pPrDefault></w:docDefaults>`
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    + '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/></w:style>'
    + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="0"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:color w:val="2F5496"/><w:sz w:val="32"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="56"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:rPr><w:i/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>'
    + '<w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/></w:rPr></w:style>'
    + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
    + '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>'
    + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('') + '</w:tblBorders></w:tblPr></w:style>'
    + `${extra}</w:styles>`;
  const SECT_A4 = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  // Le fichier : `body` (le XML du corps), `sect` (la dernière section), `styles`, `numbering` (le XML de numbering.xml), `settings`, `footnotes` et `endnotes` (le XML des notes), `headers` et `footers`
  // ({ nom: XML }), `media` ({ nom: base64 }), `docRels` (relations du document en plus), `parts` (d'autres parties), `comments`.
  async function docx({ body = '<w:p><w:r><w:t>Bonjour</w:t></w:r></w:p>', sect = SECT_A4, styles = STYLES(), numbering = '', settings = '', footnotes = '', endnotes = '', headers = {}, footers = {}, media = {}, docRels = [], parts = {}, comments = '' } = {}) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = new JSZip();
    const put = (name, text) => zip.file(name, text);
    put('[Content_Types].xml', `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>`);
    put('_rels/.rels', rels([{ id: 'rId1', type: 'officeDocument', target: 'word/document.xml' }]));
    put('word/document.xml', `${HEAD}<w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`);
    const list = [{ id: 'rId1', type: 'styles', target: 'styles.xml' }];
    put('word/styles.xml', styles);
    if (numbering) { list.push({ id: 'rId2', type: 'numbering', target: 'numbering.xml' }); put('word/numbering.xml', `${HEAD}<w:numbering ${NS}>${numbering}</w:numbering>`); }
    if (settings) { list.push({ id: 'rId3', type: 'settings', target: 'settings.xml' }); put('word/settings.xml', `${HEAD}<w:settings ${NS}>${settings}</w:settings>`); }
    if (footnotes) { list.push({ id: 'rId4', type: 'footnotes', target: 'footnotes.xml' }); put('word/footnotes.xml', `${HEAD}<w:footnotes ${NS}>${footnotes}</w:footnotes>`); }
    if (endnotes) { list.push({ id: 'rId5', type: 'endnotes', target: 'endnotes.xml' }); put('word/endnotes.xml', `${HEAD}<w:endnotes ${NS}>${endnotes}</w:endnotes>`); }
    if (comments) { list.push({ id: 'rId6', type: 'comments', target: 'comments.xml' }); put('word/comments.xml', `${HEAD}<w:comments ${NS}>${comments}</w:comments>`); }
    Object.keys(headers).forEach((name) => { list.push({ id: 'rIdH' + name, type: 'header', target: `header${name}.xml` }); put(`word/header${name}.xml`, `${HEAD}<w:hdr ${NS}>${headers[name]}</w:hdr>`); });
    Object.keys(footers).forEach((name) => { list.push({ id: 'rIdF' + name, type: 'footer', target: `footer${name}.xml` }); put(`word/footer${name}.xml`, `${HEAD}<w:ftr ${NS}>${footers[name]}</w:ftr>`); });
    Object.keys(media).forEach(name => zip.file('word/media/' + name, media[name], { base64: true }));
    put('word/_rels/document.xml.rels', rels(list.concat(docRels)));
    Object.keys(parts).forEach(name => put(name, parts[name]));
    return zip.generateAsync({ type: 'arraybuffer' });
  }
  // Les briques d'un corps.
  const t = text => `<w:t xml:space="preserve">${esc(text)}</w:t>`;
  const r = (text, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${t(text)}</w:r>`;
  const p = (content, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${typeof content === 'string' && !/^</.test(content) ? r(content) : content}</w:p>`;
  const pStyle = id => `<w:pStyle w:val="${id}"/>`;
  const numPr = (id, level = 0) => `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${id}"/></w:numPr>`;
  const tc = (content, tcPr = '') => `<w:tc>${tcPr ? `<w:tcPr>${tcPr}</w:tcPr>` : ''}${content}</w:tc>`;
  const tr = (cells, trPr = '') => `<w:tr>${trPr ? `<w:trPr>${trPr}</w:trPr>` : ''}${cells.join('')}</w:tr>`;
  const tbl = (rows, { grid = [2000, 2000], style = '', tblPr = '' } = {}) => `<w:tbl><w:tblPr>${style ? `<w:tblStyle w:val="${style}"/>` : ''}${tblPr}</w:tblPr><w:tblGrid>${grid.map(g => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
  // Une liste de Word : `abstract` { niveaux }, `num`.
  const lvl = (level, fmt, text, extra = '') => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${esc(text)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (level + 1)}" w:hanging="360"/></w:pPr>${extra}</w:lvl>`;
  const BULLETS = '<w:abstractNum w:abstractNumId="0">' + [lvl(0, 'bullet', '', '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>'), lvl(1, 'bullet', 'o', '<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr>'), lvl(2, 'bullet', '', '<w:rPr><w:rFonts w:ascii="Wingdings" w:hAnsi="Wingdings"/></w:rPr>')].join('') + '</w:abstractNum>';
  const DECIMALS = '<w:abstractNum w:abstractNumId="1">' + [lvl(0, 'decimal', '%1.'), lvl(1, 'lowerLetter', '%2)'), lvl(2, 'lowerRoman', '%3.')].join('') + '</w:abstractNum>';
  const NUMBERING = BULLETS + DECIMALS + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>';

  // Une image de l'essai : `w` x `h` points, peinte par `paint(g)` (canvas), en base64.
  const png = (w, h, paint) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    paint(canvas.getContext('2d'));
    return canvas.toDataURL('image/png').split(',')[1];
  };
  const RED_BLUE = () => png(20, 10, (g) => { g.fillStyle = '#ff0000'; g.fillRect(0, 0, 10, 10); g.fillStyle = '#0000ff'; g.fillRect(10, 0, 10, 10); });
  const emu = pt => Math.round(pt * 12700);
  const drawing = ({ rid = 'rIdImg1', w = 100, h = 50, anchor = false, descr = '', crop = '', rot = 0 } = {}) =>
    `<w:r><w:drawing><wp:${anchor ? 'anchor behindDoc="0"' : 'inline'}>${anchor ? '<wp:simplePos x="0" y="0"/>' : ''}<wp:extent cx="${emu(w)}" cy="${emu(h)}"/><wp:docPr id="1" name="Image" descr="${esc(descr)}"/><a:graphic><a:graphicData uri="${PIC_NS}">`
    + `<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="i"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/>${crop}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm${rot ? ` rot="${rot}"` : ''}><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:${anchor ? 'anchor' : 'inline'}></w:drawing></w:r>`;
  const IMAGE_REL = (id, name) => ({ id, type: 'image', target: `media/${name}` });

  // Le fichier importé : `{ html, page, headerFooter, report }`.
  async function imported(options, importOptions) {
    await ready();
    return DocxImport.fromBuffer(await docx(options), importOptions);
  }
  const sectionOf = h => dom(h.html);
  const keysOf = report => report.map(item => item.key);
  const countOf = (report, key) => (report.find(item => item.key === key) || {}).n || 0;
  // L'éditeur réel : le HTML importé y est posé puis relu, ce que la personne voit.
  const inEditor = async (html) => {
    Editor.setHTML(html);
    await sleep(250);
    return Editor.getHTML();
  };

  // ============================================================================================================================================================================================
  // 1. Le fichier
  // ============================================================================================================================================================================================
  add('docxImport_a_refused_file_says_why', 'un fichier qui n\'est pas un Word est refusé avec son code : pas un zip (unreadable), un ancien .doc ou protégé (legacy), un zip sans document (unreadable), un document vide (empty), un fichier trop gros (tooBig)', async () => {
    await ready();
    const { bad, expect } = checker();
    const text = await failure(() => DocxImport.fromBuffer(new TextEncoder().encode('bonjour').buffer));
    expect('un texte n\'est pas un document Word : unreadable', text && text.code === 'unreadable', text && text.code);
    const old = new Uint8Array(16);
    old.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
    const legacy = await failure(() => DocxImport.fromBuffer(old.buffer));
    expect('un fichier .doc d\'avant 2007 (ou protégé par un mot de passe) : legacy', legacy && legacy.code === 'legacy', legacy && legacy.code);
    await ExportCommon.ensureJsZipLoaded();
    const empty = new JSZip();
    empty.file('hello.txt', 'x');
    const noDoc = await failure(async () => DocxImport.fromBuffer(await empty.generateAsync({ type: 'arraybuffer' })));
    expect('un zip sans document Word : unreadable', noDoc && noDoc.code === 'unreadable', noDoc && noDoc.code);
    const blank = await failure(async () => DocxImport.fromBuffer(await docx({ body: '' })));
    expect('un document sans aucun paragraphe : empty', blank && blank.code === 'empty', blank && blank.code);
    const big = await failure(() => DocxImport.fromFile({ size: DocxImport.MAX_FILE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) }));
    expect('un fichier au delà du plafond : tooBig avec sa taille et son plafond', big && big.code === 'tooBig' && big.max === DocxImport.MAX_FILE_BYTES && big.size === DocxImport.MAX_FILE_BYTES + 1, big && [big.code, big.size, big.max]);
    return result(bad);
  });

  add('docxImport_the_page_of_the_file_is_the_page_of_the_editor', 'la page du fichier devient celle de l\'éditeur : A4 portrait et ses marges, Lettre en paysage (format libre), A3', async () => {
    const { bad, expect } = checker();
    const a4 = await imported({});
    expect('A4 portrait, marges de 2,5 cm (1417 twips = 24,99 mm)', a4.page.format === 'A4' && a4.page.orientation === 'portrait' && near(a4.page.top, 25, 0.1) && near(a4.page.left, 25, 0.1), a4.page);
    const letter = await imported({ sect: '<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="1080" w:bottom="720" w:left="1080"/></w:sectPr>' });
    expect('Lettre en paysage : sens paysage, format libre 215,9 x 279,4 mm (côté court d\'abord)', letter.page.orientation === 'landscape' && /^215\.9x279\.4$/.test(letter.page.format), letter.page);
    expect('marges de Lettre : 12,7 mm en haut et en bas, 19,05 à gauche et à droite', near(letter.page.top, 12.7, 0.1) && near(letter.page.right, 19.05, 0.1), letter.page);
    const a3 = await imported({ sect: '<w:sectPr><w:pgSz w:w="16838" w:h="23811"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' });
    expect('A3 portrait', a3.page.format === 'A3' && a3.page.orientation === 'portrait', a3.page);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 2. Le texte
  // ============================================================================================================================================================================================
  add('docxImport_character_marks_and_style_of_a_run', 'gras, italique, souligné (simple et double), barré, exposant, indice, couleur, surlignage, taille, police, espacement, petites capitales, majuscules : repris sur la série de caractères', async () => {
    const { bad, expect } = checker();
    const body = p(r('Gras', '<w:b/>') + r('Italique', '<w:i/>') + r('Sous', '<w:u w:val="single"/>') + r('Double', '<w:u w:val="double"/>') + r('Barre', '<w:strike/>') + r('Exp', '<w:vertAlign w:val="superscript"/>')
      + r('Ind', '<w:vertAlign w:val="subscript"/>') + r('Rouge', '<w:color w:val="FF0000"/>') + r('Jaune', '<w:highlight w:val="yellow"/>') + r('Grand', '<w:sz w:val="40"/>') + r('Georgia', '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/>')
      + r('Large', '<w:spacing w:val="40"/>') + r('Petites', '<w:smallCaps/>') + r('haut', '<w:caps/>') + r('Cache', '<w:vanish/>'));
    const out = await imported({ body });
    const root = sectionOf(out);
    const html = out.html;
    expect('gras : <strong>', /<strong>[^<]*(<span[^>]*>)?Gras/.test(html), html);
    expect('italique : <em>', /<em>(<span[^>]*>)?Italique/.test(html), html);
    expect('souligné simple : <u> sans style', /<u>(<span[^>]*>)?Sous/.test(html), html);
    expect('souligné double : <u style="text-decoration-style: double">', /<u style="text-decoration-style: double">(<span[^>]*>)?Double/.test(html), html);
    expect('barré : <s>', /<s>(<span[^>]*>)?Barre/.test(html), html);
    expect('exposant et indice : <sup> et <sub>', /<sup>(<span[^>]*>)?Exp/.test(html) && /<sub>(<span[^>]*>)?Ind/.test(html), html);
    expect('couleur rouge : color: #ff0000', /color: #ff0000[^>]*>Rouge/.test(html), html);
    expect('surlignage jaune : background-color: #ffff00', /background-color: #ffff00[^>]*>Jaune/.test(html), html);
    expect('taille 20 pt : font-size: 20pt', /font-size: 20pt[^>]*>Grand/.test(html), html);
    expect('police Georgia : font-family: Georgia', /font-family: Georgia[^>]*>Georgia/.test(html), html);
    expect('espacement de 2 pt', /letter-spacing: 2pt/.test(html), html);
    expect('petites capitales : font-variant: small-caps', /font-variant: small-caps[^>]*>Petites/.test(html), html);
    expect('majuscules : le texte est écrit en capitales', /HAUT/.test(html) && !/>haut</.test(html), html);
    expect('texte masqué : retiré et compté', !/Cache/.test(html) && countOf(out.report, 'hidden') === 1, out.report);
    expect('le texte courant est à la taille de Word (11 pt, pas celle de l\'éditeur 10,5) et en Calibri', /font-size: 11pt; font-family: Calibri/.test(html), html);
    return result(bad);
  });

  add('docxImport_a_variant_of_an_editor_font_is_not_reported', 'une variante d\'une police de l\'éditeur (Calibri Light, Times, Courier) prend la sienne sans rien dire ; une autre famille (Cambria, Aptos) est comptée une fois', async () => {
    const { bad, expect } = checker();
    const font = name => `<w:rFonts w:ascii="${name}" w:hAnsi="${name}"/>`;
    const quiet = await imported({ body: p(r('a', font('Calibri Light')) + r('b', font('Times')) + r('c', font('Courier')) + r('d', font('Helvetica'))) });
    expect('quatre variantes : aucune ligne au rapport', countOf(quiet.report, 'fonts') === 0, quiet.report);
    expect('Calibri Light devient Calibri, Times devient Times New Roman', /font-family: Calibri/.test(quiet.html) && /font-family: Times New Roman/.test(quiet.html), quiet.html);
    const loud = await imported({ body: p(r('a', font('Cambria')) + r('b', font('Aptos')) + r('c', font('Aptos'))) });
    expect('Cambria et Aptos : deux polices comptées (Aptos une seule fois)', countOf(loud.report, 'fonts') === 2, loud.report);
    return result(bad);
  });

  add('docxImport_adjacent_runs_with_the_same_look_are_one', 'des séries de caractères voisines de même aspect ne font qu\'une (Word en coupe à chaque correction) ; un aspect différent les sépare', async () => {
    const { bad, expect } = checker();
    const out = await imported({ body: p(r('Bon') + r('jour ') + r('à ', '<w:b/>') + r('tous', '<w:b/>') + r('.')) });
    const spans = (out.html.match(/<span/g) || []).length;
    expect('trois séries (« Bonjour », « à tous » en gras, « . ») : trois <span>', spans === 3, out.html);
    expect('« Bonjour » d\'un seul tenant', /Bonjour </.test(out.html), out.html);
    expect('« à tous » d\'un seul tenant dans un seul <strong>', (out.html.match(/<strong>/g) || []).length === 1 && /à tous/.test(out.html), out.html);
    return result(bad);
  });

  add('docxImport_inheritance_defaults_style_character_style_direct', 'l\'héritage de Word : valeurs par défaut du document, style de paragraphe (et celui dont il hérite), style de caractère, réglage direct, chacun remplaçant celui d\'au-dessous', async () => {
    const { bad, expect } = checker();
    const styles = STYLES({
      extra: '<w:style w:type="paragraph" w:styleId="Base"><w:name w:val="Base"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="00AA00"/><w:sz w:val="28"/></w:rPr></w:style>'
        + '<w:style w:type="paragraph" w:styleId="Child"><w:name w:val="Child"/><w:basedOn w:val="Base"/><w:rPr><w:sz w:val="36"/></w:rPr></w:style>',
    });
    const body = p(r('Enfant') + r('Fort', '<w:rStyle w:val="Strong"/>') + r('Direct', '<w:color w:val="0000FF"/><w:sz w:val="20"/>'), pStyle('Child'));
    const out = await imported({ body, styles });
    expect('taille 18 pt du style enfant (36 demi-points), couleur verte du style de base', /font-size: 18pt[^>]*color: #00aa00[^>]*>Enfant|color: #00aa00[^>]*font-size: 18pt[^>]*>Enfant/.test(out.html), out.html);
    expect('le style de caractère Strong ajoute le gras', /<strong>[^]*Fort/.test(out.html), out.html);
    expect('le réglage direct remplace couleur et taille : bleu, 10 pt', /font-size: 10pt[^>]*color: #0000ff[^>]*>Direct|color: #0000ff[^>]*font-size: 10pt[^>]*>Direct/.test(out.html), out.html);
    return result(bad);
  });

  add('docxImport_paragraph_alignment_spacing_and_indents', 'alignement (centré, droite, justifié), interligne, espaces avant et après, retrait à gauche, première ligne, retrait suspendu : repris comme « Paragraphe… » les règle', async () => {
    const { bad, expect } = checker();
    const body = p('Centré', '<w:jc w:val="center"/>') + p('Droite', '<w:jc w:val="right"/>') + p('Justifié', '<w:jc w:val="both"/>')
      + p('Réglé', '<w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:left="720" w:firstLine="360"/>')
      + p('Suspendu', '<w:ind w:left="720" w:hanging="360"/>') + p('Fixe', '<w:spacing w:line="480" w:lineRule="exact"/>');
    const out = await imported({ body });
    const ps = Array.from(sectionOf(out).querySelectorAll('p'));
    const style = n => ps[n].getAttribute('style') || '';
    expect('centré', /text-align: center/.test(style(0)), style(0));
    expect('à droite', /text-align: right/.test(style(1)), style(1));
    expect('justifié', /text-align: justify/.test(style(2)), style(2));
    expect('espace avant 12 pt, après 6 pt', ps[3].getAttribute('data-space-before') === '12' && ps[3].getAttribute('data-space-after') === '6', ps[3].outerHTML);
    expect('interligne 1,5 : 1,5 fois la ligne simple de l\'éditeur (1,758)', near(Number(ps[3].getAttribute('data-line-height')), 1.5 * 1.172, 0.01), ps[3].outerHTML);
    expect('retrait à gauche de 36 pt, première ligne de 18 pt', ps[3].getAttribute('data-indent-left') === '36' && ps[3].getAttribute('data-indent-first') === '18', ps[3].outerHTML);
    expect('retrait suspendu : -18 pt', ps[4].getAttribute('data-indent-left') === '36' && ps[4].getAttribute('data-indent-first') === '-18', ps[4].outerHTML);
    expect('interligne exact de 24 pt sur du 11 pt : facteur 2,18', near(Number(ps[5].getAttribute('data-line-height')), 24 / 11, 0.02), ps[5].outerHTML);
    return result(bad);
  });

  add('docxImport_headings_quote_tab_break_and_page_break', 'titres 1 à 3 (taille de l\'éditeur oubliée quand elle est celle de Word), citation, tabulation, retour à la ligne, saut de page au milieu d\'un paragraphe', async () => {
    const { bad, expect } = checker();
    const body = p('Titre un', pStyle('Heading1')) + p('Titre deux', pStyle('Heading2')) + p('Titre trois', pStyle('Heading3')) + p('Citée', pStyle('Quote'))
      + p(r('Avant') + '<w:r><w:tab/></w:r>' + r('Après') + '<w:r><w:br/></w:r>' + r('Ligne') + '<w:r><w:br w:type="page"/></w:r>' + r('Page suivante'));
    const out = await imported({ body });
    const root = sectionOf(out);
    expect('trois titres h1, h2, h3', root.querySelectorAll('h1').length === 1 && root.querySelectorAll('h2').length === 1 && root.querySelectorAll('h3').length === 1, out.html);
    expect('le titre 1 garde la couleur de son style (2F5496) et sa taille de 16 pt (celle de l\'éditeur est 24)', /<h1>[^]*font-size: 16pt[^]*color: #2f5496|<h1>[^]*color: #2f5496[^]*font-size: 16pt/.test(out.html), out.html);
    expect('la citation est dans <blockquote>', !!root.querySelector('blockquote p'), out.html);
    expect('une tabulation (nœud-tabulation de l\'éditeur) et un retour à la ligne', !!root.querySelector('span.pp-tab') && /<br>/.test(out.html), out.html);
    expect('un saut de page entre « Ligne » et « Page suivante »', root.querySelectorAll('.page-break-marker').length === 1 && /Ligne[^]*page-break-marker[^]*Page suivante/.test(out.html), out.html);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 3. Les listes
  // ============================================================================================================================================================================================
  add('docxImport_bullets_and_numbers_nested', 'puces (rond, rond creux, carré) et numéros (chiffres, lettres, romains) emboîtés par niveau ; une liste interrompue puis reprise continue sa numérotation', async () => {
    const { bad, expect } = checker();
    const body = p('Un', pStyle('ListParagraph') + numPr(1, 0)) + p('Deux', pStyle('ListParagraph') + numPr(1, 0)) + p('Sous', pStyle('ListParagraph') + numPr(1, 1)) + p('Carré', pStyle('ListParagraph') + numPr(1, 2))
      + p('Texte entre les listes')
      + p('Premier', pStyle('ListParagraph') + numPr(2, 0)) + p('Alpha', pStyle('ListParagraph') + numPr(2, 1)) + p('Romain', pStyle('ListParagraph') + numPr(2, 2)) + p('Second', pStyle('ListParagraph') + numPr(2, 0))
      + p('Interruption') + p('Troisième', pStyle('ListParagraph') + numPr(2, 0));
    const out = await imported({ body, numbering: NUMBERING });
    const root = sectionOf(out);
    expect('une liste à puces d\'abord : rond, puis rond creux (circle), puis carré (square)', !!root.querySelector('ul > li > ul[data-bullet-style="circle"] > li > ul[data-bullet-style="square"]'), out.html);
    const ols = Array.from(root.querySelectorAll(':scope > ol'));
    expect('deux listes numérotées séparées par un paragraphe', ols.length === 2, ols.length);
    expect('lettres puis romains aux niveaux 2 et 3', !!ols[0].querySelector('ol[data-number-style="alpha"] ol[data-number-style="roman"]'), out.html);
    expect('la seconde liste reprend à 3 (« Troisième » est le troisième numéro de niveau 1)', ols[1] && ols[1].getAttribute('start') === '3', ols[1] && ols[1].outerHTML);
    expect('les puces et numéros des paragraphes de liste ne gardent pas le retrait de Word (le niveau de la liste le dit)', !/data-indent-left/.test(root.querySelector('ul').outerHTML), root.querySelector('ul').outerHTML);
    expect('aucune ligne de rapport pour des listes simples', countOf(out.report, 'numbering') === 0, out.report);
    return result(bad);
  });

  add('docxImport_numbering_the_editor_cannot_write_is_counted', 'une numérotation en majuscules ou « 1.1 » est remplacée par la plus proche et comptée une fois par liste et niveau', async () => {
    const { bad, expect } = checker();
    const numbering = '<w:abstractNum w:abstractNumId="3">' + [lvl(0, 'upperLetter', '%1.'), lvl(1, 'decimal', '%1.%2')].join('') + '</w:abstractNum><w:num w:numId="5"><w:abstractNumId w:val="3"/></w:num>';
    const body = p('A', numPr(5, 0)) + p('B', numPr(5, 0)) + p('A.1', numPr(5, 1)) + p('A.2', numPr(5, 1));
    const out = await imported({ body, numbering });
    expect('deux niveaux remplacés : A, B (majuscules) et « 1.1 » : 2 au rapport', countOf(out.report, 'numbering') === 2, out.report);
    expect('la liste est quand même là, en lettres', /<ol[^>]*data-number-style="alpha"/.test(out.html), out.html);
    return result(bad);
  });

  add('docxImport_raised_and_lowered_text_is_a_superscript_and_a_subscript', 'un texte monté ou descendu (« position », comme LibreOffice écrit un exposant) devient exposant ou indice, sans la taille réduite qui l\'accompagne ; un exposant de Word (vertAlign) reste inchangé', async () => {
    const { bad, expect } = checker();
    const body = p(r('x') + r('2', '<w:position w:val="9"/><w:sz w:val="22"/>') + r(' et H') + r('2', '<w:position w:val="-2"/><w:sz w:val="22"/>') + r(' puis ') + r('3', '<w:vertAlign w:val="superscript"/>'));
    const out = await imported({ body });
    const root = sectionOf(out);
    const sups = Array.from(root.querySelectorAll('sup'));
    expect('deux exposants (position montée, vertAlign) et un indice', sups.length === 2 && root.querySelectorAll('sub').length === 1, out.html);
    expect('la taille réduite de « position » n\'est pas gardée en plus de celle de l\'exposant', !/font-size/.test(sups[0].outerHTML) && !/font-size/.test(root.querySelector('sub').outerHTML), out.html);
    return result(bad);
  });

  add('docxImport_margins_are_rounded_to_a_tenth_of_a_millimetre', 'des marges de 1417 twips (2,5 cm que Word affiche) arrivent à 25 mm, pas 24,99', async () => {
    const { bad, expect } = checker();
    const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417"/></w:sectPr>';
    const out = await imported({ body: p('x'), sect });
    expect('25, 25, 20, 25', out.page.top === 25 && out.page.right === 25 && out.page.bottom === 20 && out.page.left === 25, out.page);
    return result(bad);
  });

  add('docxImport_the_tab_size_is_only_set_where_a_tab_is_written', 'le pas des tabulations du document n\'est écrit que sur un paragraphe qui contient une tabulation', async () => {
    const { bad, expect } = checker();
    const out = await imported({ body: p('Sans tabulation') + `<w:p>${r('Avant')}<w:r><w:tab/></w:r>${r('après')}</w:p>`, settings: '<w:defaultTabStop w:val="1134"/>' });
    const paragraphs = Array.from(sectionOf(out).querySelectorAll('p'));
    expect('le premier paragraphe n\'a pas de pas', !paragraphs[0].hasAttribute('data-tab-size'), paragraphs[0].outerHTML);
    expect('le second a celui du document : 56,7 pt', paragraphs[1].getAttribute('data-tab-size') === '56.7', paragraphs[1].outerHTML);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 4. Les tableaux
  // ============================================================================================================================================================================================
  add('docxImport_table_grid_merges_fills_and_borders', 'un tableau : colonnes de la grille, fusion horizontale et verticale, fond de case, traits du style « Grille du tableau », hauteur de ligne, alignement vertical', async () => {
    const { bad, expect } = checker();
    const body = tbl([
      tr([tc(p('A1'), '<w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="FFF2CC"/>')], '<w:trHeight w:val="600" w:hRule="atLeast"/>'),
      tr([tc(p('A2'), '<w:vMerge w:val="restart"/><w:vAlign w:val="center"/>'), tc(p('B2'))]),
      tr([tc(p(''), '<w:vMerge/>'), tc(p('B3'))]),
    ], { grid: [1500, 3000], style: 'TableGrid' });
    const out = await imported({ body });
    const root = sectionOf(out);
    const rows = Array.from(root.querySelectorAll('tr'));
    expect('trois lignes', rows.length === 3, out.html);
    const a1 = rows[0].children[0];
    expect('A1 couvre deux colonnes, fond jaune pâle', a1.getAttribute('colspan') === '2' && /background-color: #fff2cc/.test(a1.getAttribute('style')), a1.outerHTML);
    expect('largeur des colonnes : 1500 et 3000 twips = 100 px et 200 px (le colwidth d\'une case fusionnée les additionne)', a1.getAttribute('colwidth') === '100,200', a1.outerHTML);
    expect('la ligne 1 a la hauteur minimale de 600 twips = 40 px', rows[0].getAttribute('data-row-height') === '40', rows[0].outerHTML);
    expect('A2 couvre deux lignes, centrée verticalement ; la case qui la continue n\'est pas écrite', rows[1].children[0].getAttribute('rowspan') === '2' && rows[1].children[0].getAttribute('data-valign') === 'middle' && rows[2].children.length === 1, out.html);
    expect('le style « Grille du tableau » trace les quatre côtés de A2 en noir (auto) et ses côtés intérieurs', ['top', 'right', 'bottom', 'left'].every(side => rows[1].children[0].getAttribute('data-border-' + side) === '#000000'), rows[1].children[0].outerHTML);
    expect('le texte des cases ne garde pas les 8 pt après du document : le style de tableau dit 0', /data-space-after/.test(rows[1].children[1].innerHTML) ? false : true, rows[1].children[1].innerHTML);
    return result(bad);
  });

  add('docxImport_table_without_style_has_no_borders_and_style_bands_apply', 'un tableau sans style n\'a aucun trait (le quadrillage gris de l\'éditeur est éteint) ; un style de tableau donne à la première ligne et aux bandes leur fond, leur gras et leurs traits', async () => {
    const { bad, expect } = checker();
    const plain = await imported({ body: tbl([tr([tc(p('x')), tc(p('y'))])]) });
    const cell = sectionOf(plain).querySelector('td');
    expect('sans style : « none » sur les quatre côtés', ['top', 'right', 'bottom', 'left'].every(side => cell.getAttribute('data-border-' + side) === 'none'), cell.outerHTML);
    const banded = '<w:style w:type="table" w:styleId="Bande"><w:name w:val="Bande"/><w:basedOn w:val="TableNormal"/><w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:tcPr><w:shd w:val="clear" w:fill="4472C4"/></w:tcPr></w:tblStylePr>'
      + '<w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:val="clear" w:fill="D9E2F3"/></w:tcPr></w:tblStylePr></w:style>';
    const body = tbl([tr([tc(p('Titre'))]), tr([tc(p('Un'))]), tr([tc(p('Deux'))]), tr([tc(p('Trois'))])], { grid: [3000], style: 'Bande', tblPr: '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' });
    const out = await imported({ body, styles: STYLES({ extra: banded }) });
    const tds = Array.from(sectionOf(out).querySelectorAll('td'));
    expect('première ligne : fond bleu, texte blanc en gras', /background-color: #4472c4/.test(tds[0].getAttribute('style')) && /<strong>[^]*color: #ffffff|color: #ffffff[^]*<strong>/.test(tds[0].innerHTML), tds[0].outerHTML);
    expect('première ligne de données : bande 1 (fond bleu pâle) ; deuxième : sans fond ; troisième : bande 1', /#d9e2f3/.test(tds[1].getAttribute('style')) && !tds[2].getAttribute('style') && /#d9e2f3/.test(tds[3].getAttribute('style')), tds.map(td => td.getAttribute('style')));
    return result(bad);
  });

  add('docxImport_table_borders_of_cells_and_unusual_lines_are_counted', 'les traits d\'une case l\'emportent sur ceux du tableau ; un trait en pointillé, double ou épais est repris en trait fin uni de sa couleur et compté une fois par tableau', async () => {
    const { bad, expect } = checker();
    const body = tbl([tr([tc(p('a'), '<w:tcBorders><w:top w:val="dashed" w:sz="8" w:color="FF0000"/><w:bottom w:val="double" w:sz="4" w:color="0000FF"/></w:tcBorders>'), tc(p('b'))])], {
      style: '', tblPr: '<w:tblBorders><w:left w:val="single" w:sz="4" w:color="00AA00"/><w:right w:val="nil"/></w:tblBorders>',
    });
    const out = await imported({ body });
    const a = sectionOf(out).querySelector('td');
    expect('haut rouge, bas bleu (leur sorte est perdue), gauche vert du tableau', a.getAttribute('data-border-top') === '#ff0000' && a.getAttribute('data-border-bottom') === '#0000ff' && a.getAttribute('data-border-left') === '#00aa00', a.outerHTML);
    expect('« nil » est pas de trait', sectionOf(out).querySelectorAll('td')[1].getAttribute('data-border-right') === 'none', out.html);
    expect('un seul tableau concerné : 1 au rapport', countOf(out.report, 'borderStyles') === 1, out.report);
    return result(bad);
  });

  add('docxImport_table_inside_a_table_is_flattened_and_counted', 'un tableau dans une case est mis à plat (ses cases l\'une après l\'autre) et compté', async () => {
    const { bad, expect } = checker();
    const inner = tbl([tr([tc(p('i1')), tc(p('i2'))])]);
    const out = await imported({ body: tbl([tr([tc(p('dehors') + inner + p('fin'))])], { grid: [4000] }) });
    const root = sectionOf(out);
    expect('un seul tableau', root.querySelectorAll('table').length === 1, out.html);
    expect('les textes du tableau intérieur sont dans la case, dans l\'ordre', /dehors[^]*i1[^]*i2[^]*fin/.test(root.querySelector('td').textContent), root.querySelector('td').textContent);
    expect('compté : 1', countOf(out.report, 'nestedTables') === 1, out.report);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 5. Images, liens, notes, champs
  // ============================================================================================================================================================================================
  add('docxImport_images_inline_floating_and_unreadable', 'une image en ligne est reprise à sa largeur (px) avec son texte alternatif ; une image flottante est posée dans le texte et comptée ; un format illisible (EMF) est compté ; rognée ou tournée, reprise entière et comptée', async () => {
    const { bad, expect } = checker();
    const media = { 'image1.png': RED_BLUE(), 'image2.png': RED_BLUE(), 'image3.png': RED_BLUE(), 'image4.emf': 'AAAA' };
    const docRels = [IMAGE_REL('rIdImg1', 'image1.png'), IMAGE_REL('rIdImg2', 'image2.png'), IMAGE_REL('rIdImg3', 'image3.png'), IMAGE_REL('rIdImg4', 'image4.emf')];
    const body = p(drawing({ rid: 'rIdImg1', w: 150, h: 75, descr: 'Logo rouge et bleu' })) + p(drawing({ rid: 'rIdImg2', anchor: true })) + p(drawing({ rid: 'rIdImg4' }))
      + p(drawing({ rid: 'rIdImg3', crop: '<a:srcRect l="10000"/>' }));
    const out = await imported({ body, media, docRels });
    const imgs = Array.from(sectionOf(out).querySelectorAll('img.editor-image'));
    expect('trois images posées (la quatrième, EMF, ne l\'est pas)', imgs.length === 3, out.html.slice(0, 600));
    expect('la première : 150 px de large (150 pt = 200 px à 96 dpi), texte alternatif repris', /width: 266\.67px|width: 200px/.test(imgs[0].getAttribute('style')) && imgs[0].getAttribute('alt') === 'Logo rouge et bleu', imgs[0].outerHTML.slice(0, 160));
    expect('adresse de données PNG', /^data:image\/png;base64,/.test(imgs[0].getAttribute('src')), imgs[0].getAttribute('src').slice(0, 40));
    expect('rapport : une flottante, une illisible, une rognée', countOf(out.report, 'floatingImages') === 1 && countOf(out.report, 'images') === 1 && countOf(out.report, 'imageEffects') === 1, out.report);
    return result(bad);
  });

  add('docxImport_links_notes_and_fields', 'lien extérieur (sûr) repris, lien dangereux (javascript:) repris comme texte et compté ; note de bas de page et de fin ; numéro de page ; champ de fusion sans colonne et champs figés comptés', async () => {
    const { bad, expect } = checker();
    const link = (id, text) => `<w:hyperlink r:id="${id}">${r(text, '<w:rStyle w:val="Hyperlink"/>')}</w:hyperlink>`;
    const fld = (instr, shown) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${r(shown)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    const body = p(r('Voir ') + link('rIdL1', 'le site') + r(' et ') + link('rIdL2', 'piège') + r('.'))
      + p(r('Note') + '<w:r><w:footnoteReference w:id="2"/></w:r>' + r(' fin') + '<w:r><w:endnoteReference w:id="3"/></w:r>')
      + p(fld('MERGEFIELD Nom_inconnu \\* MERGEFORMAT', '«Nom_inconnu»') + r(' ') + fld('DATE \\@ "dd/MM/yyyy"', '07/11/2026') + r(' ') + fld('PAGE', '1'));
    const footnotes = '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="2"><w:p><w:r><w:footnoteRef/></w:r>' + r(' Voici la note de bas de page.') + '</w:p></w:footnote>';
    const endnotes = '<w:endnote w:id="3"><w:p><w:r><w:endnoteRef/></w:r>' + r(' Voici la note de fin.') + '</w:p></w:endnote>';
    const docRels = [{ id: 'rIdL1', type: 'hyperlink', target: 'https://exemple.org/page?a=1&b=2', external: true }, { id: 'rIdL2', type: 'hyperlink', target: 'javascript:alert(1)', external: true }];
    const out = await imported({ body, footnotes, endnotes, docRels });
    const root = sectionOf(out);
    const links = Array.from(root.querySelectorAll('a'));
    expect('un seul lien : celui du site, adresse intacte', links.length === 1 && links[0].getAttribute('href') === 'https://exemple.org/page?a=1&b=2' && links[0].textContent === 'le site', out.html);
    expect('« piège » reste du texte', /piège/.test(root.textContent), root.textContent);
    expect('le lien dangereux est compté', countOf(out.report, 'links') === 1, out.report);
    const notes = Array.from(root.querySelectorAll('sup.footnote-ref-marker'));
    expect('deux appels de note : bas de page et fin (texte brut, sans le numéro)', notes.length === 2 && notes[0].getAttribute('data-note-text') === 'Voici la note de bas de page.' && notes[1].getAttribute('data-note-text') === 'Voici la note de fin.', notes.map(n => n.outerHTML));
    expect('la note de fin est comptée', countOf(out.report, 'endnotes') === 1, out.report);
    expect('le numéro de page est celui de l\'éditeur', root.querySelectorAll('.page-number-badge').length === 1, out.html);
    expect('le champ de fusion sans colonne garde son texte et se compte ; la date, figée, se compte', /«Nom_inconnu»/.test(root.textContent) && countOf(out.report, 'mergeFields') === 1 && countOf(out.report, 'fields') === 1, out.report);
    return result(bad);
  });

  add('docxImport_a_merge_field_with_a_column_becomes_the_variable', 'un champ de fusion dont la colonne existe dans la table courante devient la variable de cette colonne (majuscules, accents et blancs ignorés)', async () => {
    const { bad, expect } = checker();
    const fld = (instr, shown) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${r(shown)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    const body = p(r('Bonjour ') + fld('MERGEFIELD Nom', '«Nom»') + r(' et ') + fld('MERGEFIELD prenom', '«prenom»') + r(' ') + fld('MERGEFIELD Inconnu', '«Inconnu»'));
    const out = await imported({ body }, { mergeField: name => (/^nom$/i.test(name) ? '<span class="var-badge" data-key="T.Nom">#T.Nom</span>' : '') });
    expect('« Nom » devient la variable ; « prenom » et « Inconnu » restent du texte', /var-badge/.test(out.html) && /«prenom»/.test(out.html) && /«Inconnu»/.test(out.html), out.html);
    expect('deux champs sans colonne comptés', countOf(out.report, 'mergeFields') === 2, out.report);
    // La résolution par défaut lit la table courante du faux Grist.
    await ready();
    const table = GristAPI.getCurrentTableId();
    const vars = GristAPI.getAllVariables().filter(v => v.table === table);
    if (vars.length) {
      const name = vars[0].column.toUpperCase();
      const real = await imported({ body: p(fld('MERGEFIELD ' + name, '«' + name + '»')) });
      expect('par défaut : le champ « ' + name + ' » devient la variable de la table courante', /var-badge/.test(real.html), real.html);
    }
    return result(bad);
  });

  add('docxImport_a_table_of_contents_becomes_the_editor_table_of_contents', 'les paragraphes d\'une table des matières de Word (en-tête et lignes TM 1 à TM 3, champ TOC) ne font qu\'un repère de sommaire de l\'éditeur, compté une fois ; les titres restent', async () => {
    const { bad, expect } = checker();
    const tocStyles = ['TOCHeading', 'TOC1', 'TOC2'].map(id => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id === 'TOCHeading' ? 'TOC Heading' : id.replace('TOC', 'toc ')}"/><w:basedOn w:val="Normal"/></w:style>`).join('');
    const entry = (style, text, page, first, last) => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${first ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' : ''}${r(text)}<w:r><w:tab/></w:r>${r(page)}${last ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : ''}</w:p>`;
    const body = p('Table des matières', pStyle('TOCHeading')) + entry('TOC1', 'Introduction', '1', true, false) + entry('TOC2', 'Contexte', '2', false, false) + entry('TOC1', 'Conclusion', '3', false, true)
      + p('Introduction', pStyle('Heading1')) + p('Texte') + p('Conclusion', pStyle('Heading1'));
    const out = await imported({ body, styles: STYLES({ extra: tocStyles }) });
    const root = sectionOf(out);
    expect('un seul repère de sommaire', root.querySelectorAll('.toc-marker').length === 1, out.html.slice(0, 500));
    expect('le texte de la table des matières (les lignes et leurs numéros de page) n\'est pas repris', !/Contexte/.test(root.textContent) && !/Table des matières/.test(root.textContent), root.textContent);
    expect('les deux titres sont gardés', root.querySelectorAll('h1').length === 2, out.html);
    expect('compté une fois, aucun champ figé en plus', countOf(out.report, 'toc') === 1 && !countOf(out.report, 'fields'), out.report);
    const kept = await inEditor(out.html);
    expect('l\'éditeur garde le repère', /toc-marker/.test(kept), kept.slice(0, 300));
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 6. En-têtes, pieds de page, sections, rapport
  // ============================================================================================================================================================================================
  add('docxImport_headers_and_footers_with_a_different_first_page', 'en-tête et pied de page (par défaut et de première page) repris dans la forme de l\'éditeur, le numéro de page devenu celui de l\'éditeur ; la première page différente est gardée seulement si Word la demande', async () => {
    const { bad, expect } = checker();
    const fld = `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${r('1')}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    const sect = '<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/><w:headerReference w:type="first" r:id="rIdH2"/><w:footerReference w:type="default" r:id="rIdF1"/><w:titlePg/>'
      + '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>';
    const out = await imported({ body: p('Corps'), sect, headers: { 1: p('En-tête courant', '<w:jc w:val="right"/>'), 2: p('Première page') }, footers: { 1: p(r('Page ') + fld, '<w:jc w:val="center"/>') } });
    const hf = out.headerFooter;
    expect('l\'en-tête et le pied de page existent et sont activés, première page différente', hf && hf.enabled && hf.differentFirstPage, hf);
    expect('en-tête courant à droite', hf && /En-tête courant/.test(hf.header.default) && /text-align: right/.test(hf.header.default), hf && hf.header);
    expect('en-tête de première page', hf && /Première page/.test(hf.header.first), hf && hf.header);
    expect('pied de page : « Page » puis le numéro de page de l\'éditeur', hf && /Page[^]*page-number-badge/.test(hf.footer.default), hf && hf.footer);
    const noTitle = await imported({ body: p('Corps'), sect: sect.replace('<w:titlePg/>', ''), headers: { 1: p('Courant'), 2: p('Première') }, footers: { 1: p('Pied') } });
    expect('sans « première page différente » Word n\'affiche pas l\'en-tête de première page : l\'éditeur non plus', noTitle.headerFooter && !noTitle.headerFooter.differentFirstPage && noTitle.headerFooter.header.first === '', noTitle.headerFooter);
    const none = await imported({ body: p('Corps') });
    expect('sans en-tête ni pied de page : null', none.headerFooter === null, none.headerFooter);
    return result(bad);
  });

  add('docxImport_a_text_watermark_becomes_the_page_watermark', 'le filigrane texte de Word (CONFIDENTIEL en argent, à moitié transparent, incliné) devient le filigrane de la page de l\'éditeur ; un filigrane en image est compté', async () => {
    const { bad, expect } = checker();
    const mark = (id, inner, style = 'position:absolute;width:527pt;height:131pt;rotation:315;z-index:-251658752') => `<w:r><w:pict><v:shape id="${id}" o:spid="_x0000_s2049" style="${style}" fillcolor="silver" stroked="f">${inner}</v:shape></w:pict></w:r>`;
    const sect = '<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>';
    const text = await imported({ body: p('Corps'), sect, headers: { 1: `<w:p>${mark('PowerPlusWaterMarkObject357476642', '<v:fill opacity=".5"/><v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="CONFIDENTIEL"/>')}</w:p>` } });
    expect('texte, couleur argent, opacité 0,5, en diagonale', text.page.watermark && text.page.watermark.text === 'CONFIDENTIEL' && text.page.watermark.color === '#c0c0c0' && text.page.watermark.opacity === 0.5 && text.page.watermark.angle === 'diagonal', text.page);
    expect('un filigrane repris n\'est pas compté, et n\'ajoute ni en-tête ni pied de page vide', !countOf(text.report, 'watermark') && text.headerFooter === null, [text.report, text.headerFooter]);
    const flat = await imported({ body: p('Corps'), sect, headers: { 1: `<w:p>${mark('PowerPlusWaterMarkObject1', '<v:textpath string="BROUILLON"/>', 'position:absolute;rotation:0')}</w:p>` } });
    expect('à plat : horizontal, opaque (aucun réglage de transparence)', flat.page.watermark && flat.page.watermark.angle === 'horizontal' && flat.page.watermark.opacity === 1, flat.page);
    const image = await imported({ body: p('Corps'), sect, headers: { 1: `<w:p>${mark('PowerPlusWaterMarkObject2', '<v:imagedata r:id="rIdImg1"/>')}</w:p>` } });
    expect('un filigrane image : compté, la page n\'en reçoit pas', countOf(image.report, 'watermark') === 1 && !image.page.watermark, [image.report, image.page]);
    const none = await imported({ body: p('Corps') });
    expect('sans filigrane : rien', !none.page.watermark, none.page);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 6 bis. Les modifications suivies et les commentaires : repris, avec leur auteur et leur date
  // ============================================================================================================================================================================================
  const ins = (id, author, date, inner) => `<w:ins w:id="${id}" w:author="${author}" w:date="${date}">${inner}</w:ins>`;
  const del = (id, author, date, text) => `<w:del w:id="${id}" w:author="${author}" w:date="${date}"><w:r><w:delText xml:space="preserve">${esc(text)}</w:delText></w:r></w:del>`;

  add('docxImport_tracked_changes_stay_pending_with_author_and_date', 'une insertion et une suppression suivies de Word restent des modifications EN ATTENTE de l\'éditeur (<ins> et <del> numérotés), avec l\'auteur et la date du fichier ; deux séries d\'une même révision n\'en font qu\'une ; la mise en forme suivie est acceptée et comptée', async () => {
    const { bad, expect } = checker();
    const body = p(r('Début ') + ins(1, 'Marie Dupont', '2026-11-05T09:30:00Z', r('ajout ', '<w:b/>') + r('simple')) + r(' milieu ') + del(2, 'Paul Martin', '2026-11-06T14:00:00Z', 'supprimé') + r(' fin'))
      + p(r('Ici ') + `<w:moveFrom w:id="3" w:author="Marie Dupont" w:date="2026-11-07T08:00:00Z"><w:r><w:delText>déplacé</w:delText></w:r></w:moveFrom>`, '')
      + p(r('Forme', '<w:rPrChange w:id="4" w:author="A"><w:rPr/></w:rPrChange>'));
    const out = await imported({ body });
    const root = sectionOf(out);
    const adds = Array.from(root.querySelectorAll('ins'));
    const gone = Array.from(root.querySelectorAll('del'));
    expect('l\'insertion : deux séries (gras, puis simple) du même numéro 1', adds.length === 2 && adds.every(el => el.getAttribute('data-id') === '1') && adds.map(el => el.textContent).join('') === 'ajout simple', adds.map(el => el.outerHTML));
    expect('la suppression garde son texte, sous le numéro 2, et le déplacement est une suppression de plus (numéro 3)', gone.length === 2 && gone[0].getAttribute('data-id') === '2' && gone[0].textContent === 'supprimé' && gone[1].getAttribute('data-id') === '3' && gone[1].textContent === 'déplacé', gone.map(el => el.outerHTML));
    const meta = out.suiviModifications || {};
    expect('l\'auteur et la date de chaque révision', meta['1'] && meta['1'].authorName === 'Marie Dupont' && meta['1'].createdAt === '2026-11-05T09:30:00.000Z' && meta['1'].author === null && meta['2'].authorName === 'Paul Martin' && meta['2'].createdAt === '2026-11-06T14:00:00.000Z' && meta['3'].authorName === 'Marie Dupont', meta);
    expect('seule la mise en forme suivie est comptée (acceptée telle quelle), ni les ajouts ni les suppressions', countOf(out.report, 'trackedChanges') === 1, out.report);
    const plainDoc = await imported({ body: p('Rien de suivi') });
    expect('un fichier sans modification suivie : aucune métadonnée', plainDoc.suiviModifications === null, plainDoc.suiviModifications);
    // Dans le VRAI éditeur : les modifications sont en attente, avec leur auteur.
    Editor.setHTML(out.html, out.suiviModifications);
    await sleep(250);
    const kept = Editor.getHTML();
    expect('l\'éditeur garde les insertions et les suppressions numérotées', /<ins data-id="1">/.test(kept) && /<del data-id="2">/.test(kept) && /<del data-id="3">/.test(kept), kept.slice(0, 500));
    let saved = null;
    try { saved = await Editor.getSuiviModificationsForSave(); } catch (e) { saved = { error: String(e) }; }
    const savedText = JSON.stringify(saved);
    expect('à l\'enregistrement, les auteurs du fichier sont gardés', /Marie Dupont/.test(savedText) && /Paul Martin/.test(savedText), savedText.slice(0, 300));
    return result(bad);
  });

  const COMMENT_NS = 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"';
  const commentXml = (id, author, date, paraId, paragraphs) => `<w:comment ${COMMENT_NS} w:id="${id}" w:author="${author}" w:date="${date}" w:initials="X">${paragraphs.map((text, i) => `<w:p w14:paraId="${paraId}${i === paragraphs.length - 1 ? '' : '0'}"><w:r><w:t>${esc(text)}</w:t></w:r></w:p>`).join('')}</w:comment>`;
  const COMMENT_PARTS = () => ({
    comments: [
      commentXml(0, 'Marie Dupont', '2026-11-05T09:30:00Z', '0000000A', ['Premier paragraphe', 'Second paragraphe']),
      commentXml(1, 'Paul Martin', '2026-11-05T10:00:00Z', '0000000C', ['Je réponds']),
      commentXml(2, 'Marie Dupont', '2026-11-05T11:00:00Z', '0000000D', ['À revoir']),
      commentXml(3, 'Marie Dupont', '2026-11-05T12:00:00Z', '0000000E', ['Sans passage']),
    ].join(''),
    docRels: [{ id: 'rIdExt', type: 'commentsExtended', target: 'commentsExtended.xml' }],
    parts: { 'word/commentsExtended.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w15:commentsEx ${COMMENT_NS}><w15:commentEx w15:paraId="0000000A" w15:done="0"/><w15:commentEx w15:paraId="0000000C" w15:paraIdParent="0000000A" w15:done="0"/><w15:commentEx w15:paraId="0000000D" w15:done="1"/><w15:commentEx w15:paraId="0000000E" w15:done="0"/></w15:commentsEx>` },
  });
  const COMMENT_BODY = () => {
    const ref = id => `<w:r><w:commentReference w:id="${id}"/></w:r>`;
    return p(r('Avant ') + '<w:commentRangeStart w:id="0"/><w:commentRangeStart w:id="1"/>' + r('passage commenté') + '<w:commentRangeEnd w:id="0"/>' + ref(0) + '<w:commentRangeEnd w:id="1"/>' + ref(1) + r(' puis ') + '<w:commentRangeStart w:id="2"/>' + r('début d\'un passage'))
      + p(r('suite du passage') + '<w:commentRangeEnd w:id="2"/>' + ref(2) + r(' et ') + '<w:commentRangeStart w:id="3"/><w:commentRangeEnd w:id="3"/>' + ref(3));
  };

  add('docxImport_comments_become_threads_with_author_date_replies_and_resolved', 'les commentaires de Word deviennent des fils de l\'éditeur : la marque sur le passage (aussi sur deux paragraphes), les messages (auteur, texte sur plusieurs paragraphes, date), la réponse dans le fil de son commentaire, l\'état résolu ; un commentaire sans passage est compté', async () => {
    const { bad, expect } = checker();
    const out = await imported(Object.assign({ body: COMMENT_BODY() }, COMMENT_PARTS()));
    const root = sectionOf(out);
    const marks = Array.from(root.querySelectorAll('span.comment-mark'));
    const ids = Array.from(new Set(marks.map(el => el.getAttribute('data-comment-id'))));
    expect('deux fils marqués (le commentaire et sa réponse n\'en font qu\'un)', ids.length === 2 && out.comments.length === 2, [ids, out.comments.map(t => t.id)]);
    const [first, second] = out.comments;
    expect('le premier fil : deux messages dans l\'ordre des dates, le commentaire sur deux paragraphes puis la réponse', first.messages.length === 2 && first.messages[0].auteur === 'Marie Dupont' && first.messages[0].texte === 'Premier paragraphe\nSecond paragraphe'
      && first.messages[0].creeLe === '2026-11-05T09:30:00.000Z' && first.messages[1].auteur === 'Paul Martin' && first.messages[1].texte === 'Je réponds' && first.resolved === false, first);
    expect('sa marque couvre « passage commenté »', marks.filter(el => el.getAttribute('data-comment-id') === first.id).map(el => el.textContent).join('') === 'passage commenté', marks.map(el => el.outerHTML));
    expect('le second fil est résolu (marque data-resolved) et sa marque court sur les deux paragraphes', second.resolved === true && marks.filter(el => el.getAttribute('data-comment-id') === second.id).length === 2 && marks.filter(el => el.getAttribute('data-comment-id') === second.id).every(el => el.getAttribute('data-resolved') === 'true'), marks.map(el => el.outerHTML));
    expect('le commentaire sans passage de texte est compté, non repris', countOf(out.report, 'comments') === 1, out.report);
    const kept = await inEditor(out.html);
    expect('l\'éditeur garde les marques des deux fils', ids.every(id => kept.indexOf('data-comment-id="' + id + '"') >= 0), kept.slice(0, 400));
    const none = await imported({ body: p('Rien à commenter') });
    expect('sans commentaire : aucun fil', none.comments.length === 0, none.comments);
    return result(bad);
  });

  add('docxImport_imported_threads_enter_the_comments_table_at_the_first_save', 'les fils d\'un Word importé s\'ouvrent au clic sur leur marque avant l\'enregistrement ; au premier enregistrement leurs messages entrent dans la table des fils, au numéro du modèle', async (h) => {
    const { bad, expect } = checker();
    const TABLE = 'Publipostage_Commentaires';
    const out = await imported(Object.assign({ body: COMMENT_BODY() }, COMMENT_PARTS()));
    await h.resetEditor();
    Editor.setHTML(out.html, out.suiviModifications);
    Comments.stageImported(out.comments);
    await sleep(250);
    const rowsOf = (modeleId) => {
      const t = window.__gristStub.state.rows[TABLE];
      const rows = [];
      if (t) for (let i = 0; i < t.id.length; i++) if (Number(t.ModeleId[i]) === Number(modeleId)) rows.push({ cid: t.CommentId[i], auteur: t.Auteur[i], texte: t.Texte[i] });
      return rows;
    };
    const mark = document.querySelector('.tiptap .comment-mark[data-comment-id="' + out.comments[0].id + '"]');
    mark.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await sleep(300);
    const popup = document.getElementById('v2-comment-popup');
    expect('avant l\'enregistrement, un clic sur la marque ouvre le fil et montre ses deux messages', !!popup && popup.style.display !== 'none' && popup.querySelectorAll('.v2-comment-popup-message').length === 2, popup && popup.textContent.slice(0, 200));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(150);
    document.getElementById('template-name').value = 'Word avec commentaires';
    await h.clickButton('btn-save');
    await sleep(900);
    const modeleId = Templates.getCurrentId();
    const rows = rowsOf(modeleId);
    expect('le modèle est enregistré et la table des fils a les trois messages, au numéro du modèle', !!modeleId && rows.length === 3, { modeleId, rows });
    expect('les auteurs et textes du fichier', rows.some(r => r.auteur === 'Marie Dupont' && r.texte === 'Premier paragraphe\nSecond paragraphe') && rows.some(r => r.auteur === 'Paul Martin' && r.texte === 'Je réponds') && rows.some(r => r.texte === 'À revoir'), rows);
    expect('chaque fil de la table a sa marque dans le texte', Array.from(new Set(rows.map(r => r.cid))).every(cid => Editor.getHTML().indexOf('data-comment-id="' + cid + '"') >= 0), rows.map(r => r.cid));
    return result(bad);
  });

  add('docxImport_sections_page_breaks_columns_and_page_borders', 'une section de plus se termine par un saut de page ; une autre mise en page, des colonnes et une bordure de page sont comptées ; le texte reste lisible', async () => {
    const { bad, expect } = checker();
    const first = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>';
    const last = '<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/><w:cols w:num="2" w:space="708"/><w:pgBorders><w:top w:val="single" w:sz="4"/></w:pgBorders></w:sectPr>';
    const body = p('Section un') + `<w:p><w:pPr>${first}</w:pPr>${r('Fin de la section un')}</w:p>` + p('Section deux');
    const out = await imported({ body, sect: last });
    expect('un saut de page sépare les sections', /Fin de la section un<\/span><\/p><div class="page-break-marker"><\/div><p[^>]*>.*Section deux/.test(out.html.replace(/\n/g, '')), out.html);
    expect('la page est celle de la première section (A4 portrait) : la dernière, en paysage, est annoncée', out.page && out.page.orientation === 'portrait' && out.page.format === 'A4', out.page);
    expect('la deuxième section est comptée, avec ses colonnes et sa bordure', countOf(out.report, 'sections') === 1 && countOf(out.report, 'columns') === 1 && countOf(out.report, 'pageBorders') === 1, out.report);
    return result(bad);
  });

  add('docxImport_every_loss_is_counted_once_and_in_order', 'forme, graphique, schéma, équation, commentaire, révision, tabulation personnalisée, retrait à droite, bordure de paragraphe, police absente : chaque genre est compté à sa place, dans l\'ordre de DocxImport.REPORT_KEYS ; rien à dire quand tout arrive', async () => {
    const { bad, expect } = checker();
    const shape = `<w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="1" name="Forme"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"/></a:graphic></wp:inline></w:drawing></w:r>`;
    const chart = `<w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="2" name="Graphique"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></wp:inline></w:drawing></w:r>`;
    const diagram = `<w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="3" name="Schéma"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:graphic></wp:inline></w:drawing></w:r>`;
    const body = p(shape + chart + diagram) + p('<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>x=1</m:t></m:r></m:oMath>')
      // Une mise en forme suivie et une marque de paragraphe supprimée : l'éditeur ne suit pas ces genres de modification, elles sont acceptées et comptées.
      + p(r('Mise en forme', '<w:b/><w:rPrChange w:id="7" w:author="A"><w:rPr/></w:rPrChange>'), '<w:rPr><w:del w:id="6" w:author="A"/></w:rPr>')
      + `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="2000"/></w:tabs></w:pPr>${r('Tabulée')}<w:r><w:tab/></w:r>${r('suite')}</w:p>`
      + p('Tabulations déclarées mais jamais utilisées', '<w:tabs><w:tab w:val="right" w:pos="9000"/></w:tabs>') + p('Retrait droit', '<w:ind w:right="720"/>') + p('Encadré', '<w:pBdr><w:top w:val="single" w:sz="4" w:color="000000"/></w:pBdr>')
      + p(r('Police rare', '<w:rFonts w:ascii="Segoe Script" w:hAnsi="Segoe Script"/>')) + p(r('Ombre', '<w:shadow/>'));
    const comments = '<w:comment w:id="0" w:author="A"><w:p><w:r><w:t>Un commentaire</w:t></w:r></w:p></w:comment>';
    const out = await imported({ body, comments });
    const expected = { shapes: 1, charts: 1, diagrams: 1, equations: 1, comments: 1, trackedChanges: 2, tabs: 1, rightIndent: 1, paragraphBorders: 1, fonts: 1, textEffects: 1 };
    Object.keys(expected).forEach(key => expect('« ' + key + ' » compté ' + expected[key], countOf(out.report, key) === expected[key], out.report));
    expect('la mise en forme suivie est acceptée telle quelle (le texte reste, en gras)', /Mise en forme/.test(out.html) && !/<ins|<del/.test(out.html), out.html);
    expect('l\'équation est reprise comme texte', /x=1/.test(out.html), out.html);
    expect('le rapport suit l\'ordre de DocxImport.REPORT_KEYS', JSON.stringify(keysOf(out.report)) === JSON.stringify(DocxImport.REPORT_KEYS.filter(key => expected[key])), keysOf(out.report));
    const calm = await imported({ body: p('Rien à dire') + p(r('Du gras', '<w:b/>')) });
    expect('un document simple : rapport vide (aucune fenêtre)', calm.report.length === 0, calm.report);
    return result(bad);
  });

  add('docxImport_every_report_key_has_its_text_in_both_languages', 'chaque genre du rapport a sa ligne en français et en anglais, avec le pluriel, et l\'anglais est américain', async () => {
    await ready();
    const { bad, expect } = checker();
    const lang = I18n.getLang();
    ['fr', 'en'].forEach((l) => {
      I18n.setLang && I18n.setLang(l);
      DocxImport.REPORT_KEYS.forEach((key) => {
        const one = I18n.t('docx.import.report.' + key, { n: 1 });
        const many = I18n.t('docx.import.report.' + key, { n: 4 });
        expect(l + ' : « ' + key + ' » a un texte avec le nombre', one && !/^docx\.import/.test(one) && /1/.test(one) && /4/.test(many), [one, many]);
      });
    });
    I18n.setLang && I18n.setLang(lang);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 7. L'aller-retour : un Word écrit par l'export de l'éditeur
  // ============================================================================================================================================================================================
  const ROUND_TRIP_HTML = '<h1>Titre un</h1>'
    + '<p style="text-align: center"><strong>Gras</strong>, <em>italique</em>, <u>souligné</u>, <span style="color: #c00000">rouge</span> et <span style="font-size: 16pt">grand</span>.</p>'
    + '<p data-indent-left="36" data-space-after="12">Retrait de 36 pt</p>'
    + '<ul><li><p>Premier</p></li><li><p>Deuxième</p><ul><li><p>Sous-point</p></li></ul></li></ul>'
    + '<ol><li><p>Un</p></li><li><p>Deux</p></li></ol>'
    + '<table style="width: 400px"><colgroup><col style="width: 100px"><col style="width: 300px"></colgroup><tbody>'
    + '<tr><td colspan="1" rowspan="1" colwidth="100" style="background-color: #ffe699"><p>Gauche</p></td><td colspan="1" rowspan="1" colwidth="300"><p>Droite</p></td></tr>'
    + '<tr><td colspan="2" rowspan="1" colwidth="100,300"><p>Fusion</p></td></tr></tbody></table>'
    + '<p>Fin avec note<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Texte de la note"></sup>.</p>';

  add('docxImport_round_trip_with_the_editor_export', 'un Word écrit par l\'export de l\'éditeur puis importé redonne les mêmes titres, mises en forme, listes, tableau (colonnes, fusion, fond), note de bas de page, alignement et retrait', async () => {
    await ready();
    await ExportCommon.ensureJsZipLoaded();
    await DocxExport.ensureDocxLibLoaded();
    const { bad, expect } = checker();
    const { blob } = await DocxExport.getDocxBlobForRecord(ROUND_TRIP_HTML, null, {}, '', null, null);
    const out = await DocxImport.fromBuffer(await blob.arrayBuffer());
    const root = sectionOf(out);
    expect('titre 1', /^Titre un$/.test((root.querySelector('h1') || {}).textContent || ''), out.html.slice(0, 300));
    expect('gras, italique, souligné, rouge', root.querySelector('strong') && root.querySelector('em') && root.querySelector('u') && /color: #c00000/i.test(out.html), out.html.slice(0, 700));
    expect('le grand texte garde sa taille de 16 pt', /font-size: 16pt/.test(out.html), out.html.slice(0, 700));
    expect('le paragraphe centré', /text-align: center/.test(out.html), out.html.slice(0, 500));
    expect('le retrait de 36 pt et l\'espace après de 12 pt', /data-indent-left="36"/.test(out.html) && /data-space-after="12"/.test(out.html), out.html);
    // L'export de l'éditeur écrit la liste emboîtée comme une liste à part (numId 3, niveau 0) : le fichier dit deux listes à puces, l'import en pose deux.
    expect('trois puces et deux numéros', root.querySelectorAll('ul li').length === 3 && root.querySelectorAll('ol li').length === 2, out.html);
    const cells = Array.from(root.querySelectorAll('td'));
    expect('le tableau : trois cases, la dernière sur deux colonnes, fond jaune pâle à gauche', cells.length === 3 && cells[2].getAttribute('colspan') === '2' && /#ffe699/i.test(cells[0].getAttribute('style') || ''), cells.map(c => c.outerHTML.slice(0, 160)));
    // L'export écrit 1521 et 4521 twips (le tableau mesure 6042 : les traits s'ajoutent) : 101 et 301 px.
    expect('colonnes de 100 et 300 px à 2 px près', near(Number(cells[0].getAttribute('colwidth')), 100, 2) && near(Number(cells[1].getAttribute('colwidth')), 300, 2), cells.map(c => c.getAttribute('colwidth')));
    expect('les traits noirs de l\'export sont repris', ['top', 'right', 'bottom', 'left'].every(side => cells[0].getAttribute('data-border-' + side) === '#000000'), cells[0].outerHTML.slice(0, 260));
    expect('l\'interligne par défaut de l\'export (341/240) n\'est pas perdu', /data-line-height="1\.66/.test(out.html), out.html.slice(0, 300));
    const note = root.querySelector('sup.footnote-ref-marker');
    expect('la note de bas de page', note && note.getAttribute('data-note-text') === 'Texte de la note', out.html.slice(-400));
    expect('rien d\'important perdu : la note et la mise en page ne figurent pas au rapport', !countOf(out.report, 'columns') && !countOf(out.report, 'images') && !countOf(out.report, 'fonts'), out.report);
    return result(bad);
  });

  add('docxImport_round_trip_text_survives_the_editor_and_a_second_export', 'le HTML importé posé dans l\'éditeur réel puis relu garde son texte ; exporté une seconde fois en Word puis réimporté, il redonne le même texte', async () => {
    await ready();
    await ExportCommon.ensureJsZipLoaded();
    await DocxExport.ensureDocxLibLoaded();
    const { bad, expect } = checker();
    const first = await DocxExport.getDocxBlobForRecord(ROUND_TRIP_HTML, null, {}, '', null, null);
    const out = await DocxImport.fromBuffer(await first.blob.arrayBuffer());
    const kept = await inEditor(out.html);
    const plain = html => dom(html).textContent.replace(/\s+/g, ' ').trim();
    expect('l\'éditeur garde tout le texte importé', plain(kept) === plain(out.html), [plain(kept).slice(0, 160), plain(out.html).slice(0, 160)]);
    const second = await DocxExport.getDocxBlobForRecord(kept, null, {}, '', null, null);
    const again = await DocxImport.fromBuffer(await second.blob.arrayBuffer());
    expect('le second aller-retour redonne le même texte', plain(again.html) === plain(out.html), [plain(again.html).slice(0, 160), plain(out.html).slice(0, 160)]);
    expect('et le même nombre de cases de tableau et d\'éléments de liste', dom(again.html).querySelectorAll('td').length === dom(out.html).querySelectorAll('td').length && dom(again.html).querySelectorAll('li').length === dom(out.html).querySelectorAll('li').length, [dom(again.html).querySelectorAll('li').length, dom(out.html).querySelectorAll('li').length]);
    return result(bad);
  });

  window.DocxFixtures = { docx, p, r, t, tbl, tr, tc, pStyle, numPr, lvl, STYLES, SECT_A4, NUMBERING, BULLETS, DECIMALS, RED_BLUE, drawing, IMAGE_REL, png, esc, emu, rels, HEAD, NS };
  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.docxImport = cases;
})();
