// Suite "odsImport" - l'IMPORT d'un tableur OpenDocument (js/ods-import.js) : un fichier .ods (ou son modèle .ots, ou le .fods « flat ») devient une GRILLE, sur le modèle de l'import d'un classeur Excel
// (js/grid-xlsx-import.js ; chantier « formats libres » ouvert le 17/11 par Antoine : « le premier et les 3 derniers », étude du 13/11). Le HTML importé est lu tel que la grille le reçoit.
//
// Les fichiers de l'essai sont ÉCRITS ICI, partie par partie (un zip OpenDocument : JSZip, XML comme LibreOffice l'écrit - styles automatiques ce1, co1, ro1, cases `office:value-type` avec leur `text:p` affiché,
// colonnes et lignes « répétées », cases couvertes) : chaque cas dit ce que son fichier contient et ce que l'import doit en faire, sans fichier binaire dans le dépôt. Ce que les cas vérifient :
//  - le fichier : refusé avec son code (pas un zip, zip sans contenu, protégé, document texte, présentation, aucune feuille, feuille vide, trop grande) ; le « flat » et le modèle ; les feuilles (liste, ordre, masquées) ;
//  - les cases : le texte tel que le tableur l'affiche, sinon la valeur écrite ; l'alignement « standard » selon le genre de la valeur, les alignements choisis, le retrait ; gras, italique, souligné, barré, exposant,
//    couleur, taille et police (par case et par plage de texte, héritage compris), fond, traits (couleur, côté, trait de départ de la grille), liens sûrs, retours à la ligne ;
//  - la forme : fusions (cases couvertes, traits de la case d'angle), largeur des colonnes, hauteur des lignes, lignes et colonnes masquées, filtrées ou repliées ;
//  - les plages « répétées » : colonnes, lignes et cases à valeur développées, la fin vide (des milliers de cases) ignorée, une mise en forme au loin qui n'agrandit pas la feuille ;
//  - le rapport : chaque genre de perte compté une fois à sa place, dans l'ordre de OdsImport.REPORT_KEYS, les lignes dans les deux langues.
(function () {
  const cases = [];
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const add = (id, description, run) => cases.push({ id, description, run });
  const checker = () => {
    const bad = [];
    return { bad, expect: (label, condition, detail) => { if (!condition) bad.push(label + (detail === undefined ? '' : ' : ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); } };
  };
  const failure = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const ready = () => ExportEngines.ensure('odsImport');
  const dom = html => new DOMParser().parseFromString('<body>' + html, 'text/html').body;

  // --- Le paquet : ce que LibreOffice écrit, en plus court ---------------------------------------------------------------------------------------------------------------------
  const URN = 'urn:oasis:names:tc:opendocument:xmlns:';
  const NS = `xmlns:office="${URN}office:1.0" xmlns:style="${URN}style:1.0" xmlns:text="${URN}text:1.0" xmlns:table="${URN}table:1.0" xmlns:draw="${URN}drawing:1.0" xmlns:fo="${URN}xsl-fo-compatible:1.0" xmlns:svg="${URN}svg-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:number="${URN}datastyle:1.0" xmlns:calcext="urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0" xmlns:meta="${URN}meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:manifest="${URN}manifest:1.0"`;
  const HEAD = '<?xml version="1.0" encoding="UTF-8"?>';
  const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const MIME_SHEET = 'application/vnd.oasis.opendocument.spreadsheet';
  const DEFAULT_STYLES = '<style:default-style style:family="table-cell"><style:paragraph-properties style:tab-stop-distance="1.25cm"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="10pt" fo:language="fr" fo:country="FR"/></style:default-style>'
    + '<style:style style:name="Default" style:family="table-cell"/>'
    + '<style:style style:name="Heading" style:family="table-cell" style:parent-style-name="Default"><style:text-properties fo:font-size="14pt" fo:font-weight="bold"/></style:style>'
    + '<style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text"><style:text-properties fo:color="#000080" style:text-underline-style="solid"/></style:style>';
  const FONTS = '<style:font-face style:name="Liberation Sans" svg:font-family="&apos;Liberation Sans&apos;" style:font-family-generic="swiss"/><style:font-face style:name="Courier New" svg:font-family="&apos;Courier New&apos;" style:font-family-generic="modern"/>';
  const stylesXml = ({ styles = DEFAULT_STYLES, fonts = FONTS } = {}) => `${HEAD}<office:document-styles ${NS} office:version="1.3"><office:font-face-decls>${fonts}</office:font-face-decls><office:styles>${styles}</office:styles></office:document-styles>`;
  const contentXml = ({ body, auto = '', bodyTag = 'office:spreadsheet' }) => `${HEAD}<office:document-content ${NS} office:version="1.3"><office:font-face-decls/><office:automatic-styles>${auto}</office:automatic-styles><office:body><${bodyTag}>${body}</${bodyTag}></office:body></office:document-content>`;
  const manifest = (mime, encrypted) => `${HEAD}<manifest:manifest ${NS} manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/>`
    + `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml">${encrypted ? '<manifest:encryption-data manifest:checksum-type="SHA1/1K" manifest:checksum="AAAA"/>' : ''}</manifest:file-entry>`
    + '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>';
  // Le fichier : `sheets` (le XML des feuilles), `auto` (styles automatiques de content.xml), `styles`, `fonts`, `mime`, `bodyTag`, `encrypted`, `noContent`.
  async function ods({ sheets = [sheet('Feuille1', [row([text('Bonjour')])])], auto = '', styles, fonts, mime = MIME_SHEET, bodyTag = 'office:spreadsheet', encrypted = false, noContent = false } = {}) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = new JSZip();
    zip.file('mimetype', mime, { compression: 'STORE' });
    zip.file('META-INF/manifest.xml', manifest(mime, encrypted));
    if (!noContent) zip.file('content.xml', contentXml({ body: Array.isArray(sheets) ? sheets.join('') : sheets, auto, bodyTag }));
    zip.file('styles.xml', stylesXml({ styles, fonts }));
    return zip.generateAsync({ type: 'arraybuffer', mimeType: mime });
  }
  const flat = ({ sheets, auto = '', mime = MIME_SHEET } = {}) => new TextEncoder().encode(`${HEAD}<office:document ${NS} office:version="1.3" office:mimetype="${mime}"><office:font-face-decls>${FONTS}</office:font-face-decls><office:styles>${DEFAULT_STYLES}</office:styles>`
    + `<office:automatic-styles>${auto}</office:automatic-styles><office:body><office:spreadsheet>${sheets.join('')}</office:spreadsheet></office:body></office:document>`).buffer;

  // Les briques d'une feuille. Une case affiche toujours son texte (`text:p`) à côté de sa valeur, comme LibreOffice l'écrit.
  const attrsOf = (attrs, style) => (style ? ` table:style-name="${style}"` : '') + (attrs ? ' ' + attrs : '');
  const text = (content, style = '', attrs = '') => `<table:table-cell${attrsOf(attrs, style)} office:value-type="string" calcext:value-type="string"><text:p>${content}</text:p></table:table-cell>`;
  const num = (shown, value, style = '', attrs = '') => `<table:table-cell${attrsOf(attrs, style)} office:value-type="float" office:value="${value}" calcext:value-type="float"><text:p>${shown}</text:p></table:table-cell>`;
  const blank = (count = 1, style = '') => `<table:table-cell${style ? ` table:style-name="${style}"` : ''}${count > 1 ? ` table:number-columns-repeated="${count}"` : ''}/>`;
  const covered = (count = 1) => `<table:covered-table-cell${count > 1 ? ` table:number-columns-repeated="${count}"` : ''}/>`;
  const row = (cells, attrs = '', style = '') => `<table:table-row${attrsOf(attrs, style)}>${cells.join('')}</table:table-row>`;
  const col = (style = '', attrs = '') => `<table:table-column${attrsOf(attrs, style)}/>`;
  const sheet = (name, rows, { cols = '', style = '', extra = '' } = {}) => `<table:table table:name="${esc(name)}"${style ? ` table:style-name="${style}"` : ''}>${cols}${rows.join('')}${extra}</table:table>`;
  const cellStyle = (name, { cell = '', para = '', textProps = '', parent = 'Default' } = {}) => `<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="${parent}">`
    + `${cell ? `<style:table-cell-properties ${cell}/>` : ''}${para ? `<style:paragraph-properties ${para}/>` : ''}${textProps ? `<style:text-properties ${textProps}/>` : ''}</style:style>`;
  const colStyle = (name, width) => `<style:style style:name="${name}" style:family="table-column"><style:table-column-properties style:column-width="${width}" fo:break-before="auto"/></style:style>`;
  const rowStyle = (name, height, optimal = false) => `<style:style style:name="${name}" style:family="table-row"><style:table-row-properties style:row-height="${height}" style:use-optimal-row-height="${optimal}"/></style:style>`;
  const textStyle = (name, props) => `<style:style style:name="${name}" style:family="text"><style:text-properties ${props}/></style:style>`;
  const span = (content, style) => `<text:span text:style-name="${style}">${content}</text:span>`;

  // Le fichier importé : `{ html, model, report, ... }`.
  async function imported(options, importOptions) {
    await ready();
    return OdsImport.fromBuffer(await ods(options), importOptions);
  }
  // La grille lue dans le HTML : une liste de lignes, chacune une liste de cases { text, html, colspan, rowspan, align, indent, fill, borders, valign, width }.
  function gridOf(html) {
    const body = dom(html);
    return Array.from(body.querySelectorAll('tr')).map(tr => Array.from(tr.children).map((td) => {
      const paragraph = td.querySelector('p');
      const style = td.getAttribute('style') || '';
      const fill = /background-color:\s*([^;]+)/.exec(style);
      const look = paragraph ? paragraph.getAttribute('style') || '' : '';
      const align = /text-align:\s*([a-z]+)/.exec(look);
      return {
        text: td.textContent.replace(/\s+/g, ' ').trim(),
        html: paragraph ? paragraph.innerHTML : '',
        colspan: Number(td.getAttribute('colspan') || 1),
        rowspan: Number(td.getAttribute('rowspan') || 1),
        align: align ? align[1] : null,
        indent: Number((paragraph && paragraph.getAttribute('data-indent-left')) || 0),
        fill: fill ? fill[1].trim() : null,
        valign: td.getAttribute('data-valign'),
        borders: Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [side, td.getAttribute('data-border-' + side)])),
        width: td.getAttribute('colwidth'),
      };
    }));
  }
  const rowHeights = html => Array.from(dom(html).querySelectorAll('tr')).map(tr => Number(tr.getAttribute('data-row-height')));
  const keysOf = report => report.map(entry => entry.key);
  const countOf = (report, key) => (report.find(entry => entry.key === key) || {}).n || 0;

  // ============================================================================================================================================================================================
  // 1. Le fichier
  // ============================================================================================================================================================================================
  add('odsImport_a_refused_file_says_why', 'un fichier qui n\'est pas un tableur OpenDocument est refusé avec son code : pas un zip (unreadable), un zip sans contenu (unreadable), protégé (encrypted), un document texte ou une présentation (wrongType et son genre), sans feuille ou feuille vide (empty), plus gros que la limite (fileTooBig)', async () => {
    await ready();
    const { bad, expect } = checker();
    const codeOf = async (buffer) => { const e = await failure(() => OdsImport.fromBuffer(buffer)); return e ? e.code : 'aucune erreur'; };
    expect('pas un zip', await codeOf(new TextEncoder().encode('Ceci est du texte, pas un tableur.').buffer) === 'unreadable');
    expect('un zip sans content.xml', await codeOf(await ods({ noContent: true })) === 'unreadable');
    expect('protégé par un mot de passe', await codeOf(await ods({ encrypted: true })) === 'encrypted');
    const text = await failure(async () => OdsImport.fromBuffer(await ods({ mime: 'application/vnd.oasis.opendocument.text', bodyTag: 'office:text', sheets: '<text:p>Bonjour</text:p>' })));
    expect('un document texte : wrongType et son genre', text && text.code === 'wrongType' && text.kind === 'text', text && [text.code, text.kind]);
    const slides = await failure(async () => OdsImport.fromBuffer(await ods({ mime: 'application/vnd.oasis.opendocument.presentation', bodyTag: 'office:presentation', sheets: '' })));
    expect('une présentation : wrongType et son genre', slides && slides.code === 'wrongType' && slides.kind === 'presentation', slides && [slides.code, slides.kind]);
    expect('aucune feuille : empty', await codeOf(await ods({ sheets: '' })) === 'empty');
    expect('une feuille de cases vides : empty', await codeOf(await ods({ sheets: [sheet('Vide', [row([blank(3)], 'table:number-rows-repeated="1048576"')])] })) === 'empty');
    expect('une feuille qui n\'a que des fonds sous rien : empty', await codeOf(await ods({
      auto: cellStyle('ce1', { cell: 'fo:background-color="#ffff00"' }), sheets: [sheet('Fond', [row([blank(3, 'ce1')])])],
    })) === 'empty');
    const huge = await failure(() => OdsImport.importFile({ size: OdsImport.MAX_FILE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) }));
    expect('un fichier plus gros que la limite : fileTooBig avec sa taille', huge && huge.code === 'fileTooBig' && huge.size === OdsImport.MAX_FILE_BYTES + 1 && huge.max === OdsImport.MAX_FILE_BYTES, huge && [huge.code, huge.size, huge.max]);
    return result(bad);
  });

  add('odsImport_flat_and_template_files_are_read_like_the_zip', 'le fichier « flat » (.fods, un seul XML) et le modèle (.ots) donnent la même grille que le zip', async () => {
    await ready();
    const { bad, expect } = checker();
    const sheets = [sheet('Feuille1', [row([text('Nom'), text('Âge')]), row([text('Ana'), num('31', 31)])])];
    const zip = await OdsImport.fromBuffer(await ods({ sheets }));
    const single = await OdsImport.fromBuffer(flat({ sheets }));
    const template = await OdsImport.fromBuffer(await ods({ sheets, mime: 'application/vnd.oasis.opendocument.spreadsheet-template' }));
    expect('le flat donne la même grille', single.html === zip.html, [single.html.slice(0, 200), zip.html.slice(0, 200)]);
    expect('le modèle aussi', template.html === zip.html);
    expect('2 lignes, 2 colonnes', zip.rows === 2 && zip.cols === 2, [zip.rows, zip.cols]);
    expect('le texte est celui du fichier', gridOf(zip.html).map(cells => cells.map(c => c.text).join('|')).join('/') === 'Nom|Âge/Ana|31', gridOf(zip.html));
    return result(bad);
  });

  add('odsImport_another_prefix_is_read_by_namespace', 'un fichier dont les préfixes sont autres (« t: » au lieu de « table: ») est lu de même', async () => {
    await ready();
    const { bad, expect } = checker();
    const body = '<t:table t:name="S"><t:table-row><t:table-cell o:value-type="string"><x:p>Bonjour</x:p></t:table-cell></t:table-row></t:table>';
    const xml = `${HEAD}<o:document-content xmlns:o="${URN}office:1.0" xmlns:t="${URN}table:1.0" xmlns:x="${URN}text:1.0"><o:body><o:spreadsheet>${body}</o:spreadsheet></o:body></o:document-content>`;
    await ExportCommon.ensureJsZipLoaded();
    const zip = new JSZip();
    zip.file('mimetype', MIME_SHEET, { compression: 'STORE' });
    zip.file('content.xml', xml);
    const out = await OdsImport.fromBuffer(await zip.generateAsync({ type: 'arraybuffer' }));
    expect('le texte est lu', gridOf(out.html)[0][0].text === 'Bonjour', out.html.slice(0, 200));
    return result(bad);
  });

  add('odsImport_sheets_are_listed_in_order_and_hidden_ones_are_left_out', 'les feuilles visibles sont proposées dans l\'ordre du fichier, la masquée non ; la grille est celle de la feuille choisie ; un rang trop grand prend la dernière ; toutes masquées : la première', async () => {
    await ready();
    const { bad, expect } = checker();
    const auto = '<style:style style:name="ta1" style:family="table"><style:table-properties table:display="true"/></style:style><style:style style:name="ta2" style:family="table"><style:table-properties table:display="false"/></style:style>';
    const sheets = [sheet('Premier', [row([text('un')])], { style: 'ta1' }), sheet('Caché', [row([text('caché')])], { style: 'ta2' }), sheet('Troisième', [row([text('trois')])])];
    const book = await OdsImport.openFile(new File([await ods({ sheets, auto })], 'a.ods'));
    expect('deux feuilles proposées, dans l\'ordre', book.sheets.map(s => s.name).join('|') === 'Premier|Troisième' && book.sheets[1].index === 1, book.sheets);
    const second = book.build(1, { lang: 'fr' });
    expect('la grille de la deuxième visible', second.sheetName === 'Troisième' && second.sheetIndex === 1 && second.sheetCount === 2 && gridOf(second.html)[0][0].text === 'trois', [second.sheetName, second.sheetIndex, second.sheetCount]);
    const beyond = book.build(9, { lang: 'fr' });
    expect('un rang trop grand prend la dernière', beyond.sheetName === 'Troisième', beyond.sheetName);
    const none = await OdsImport.fromBuffer(await ods({ sheets: [sheet('Caché', [row([text('seule')])], { style: 'ta2' })], auto }));
    expect('toutes masquées : la première est lue', none.sheetName === 'Caché' && gridOf(none.html)[0][0].text === 'seule', none.sheetName);
    const picked = await OdsImport.fromBuffer(await ods({ sheets, auto }), { sheetIndex: 1 });
    expect('fromBuffer lit la feuille demandée', picked.sheetName === 'Troisième', picked.sheetName);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 2. Le contenu d'une case
  // ============================================================================================================================================================================================
  add('odsImport_the_shown_text_wins_over_the_written_value', 'la case donne le texte que le tableur affiche (« 1 234,50 € », « 25 % »), pas sa valeur ; plusieurs paragraphes, retour à la ligne, espaces et tabulation s\'y retrouvent ; les plages voisines de même aspect n\'en font qu\'une', async () => {
    const { bad, expect } = checker();
    const out = await imported({
      sheets: [sheet('S', [row([
        num('1 234,50 €', 1234.5), num('25 %', 0.25), text('un</text:p><text:p>deux'), text('a<text:line-break/>b'), text('x<text:s text:c="3"/>y<text:tab/>z'), text('<text:span text:style-name="T1">ab</text:span><text:span text:style-name="T1">cd</text:span>'),
      ])])], auto: textStyle('T1', 'fo:font-weight="bold"'),
    });
    const [cells] = gridOf(out.html);
    expect('le montant tel qu\'affiché', cells[0].text === '1 234,50 €', cells[0].text);
    expect('le pourcentage tel qu\'affiché', cells[1].text === '25 %', cells[1].text);
    expect('deux paragraphes : deux lignes', cells[2].html === 'un<br>deux', cells[2].html);
    expect('un saut de ligne', cells[3].html === 'a<br>b', cells[3].html);
    expect('espaces écrits et tabulation', cells[4].html === 'x   y\tz', JSON.stringify(cells[4].html));
    expect('deux plages gras voisines : un seul gras', cells[5].html === '<strong>abcd</strong>', cells[5].html);
    return result(bad);
  });

  add('odsImport_a_value_without_text_is_written_simply', 'sans texte affiché (fichier écrit par un programme), la valeur est écrite au plus simple : nombre, pourcentage, devise, booléen (VRAI/FAUX, TRUE/FALSE), date (jj/mm/aaaa, mm/jj/aaaa), heure, chaîne', async () => {
    const { bad, expect } = checker();
    const bare = (type, attrs) => `<table:table-cell office:value-type="${type}" ${attrs}/>`;
    const cells = [
      bare('float', 'office:value="12.5"'), bare('percentage', 'office:value="0.256"'), bare('currency', 'office:value="3" office:currency="EUR"'), bare('boolean', 'office:boolean-value="true"'), bare('boolean', 'office:boolean-value="false"'),
      bare('date', 'office:date-value="2024-03-05"'), bare('date', 'office:date-value="2024-03-05T14:30:00"'), bare('time', 'office:time-value="PT09H05M07S"'), bare('string', 'office:string-value="écrit"'),
    ];
    const source = { sheets: [sheet('S', [row(cells)])] };
    const [fr] = gridOf((await imported(source, { lang: 'fr' })).html);
    expect('en français', fr.map(c => c.text).join('|') === '12.5|25.6 %|3 EUR|VRAI|FAUX|05/03/2024|05/03/2024 14:30|09:05:07|écrit', fr.map(c => c.text));
    const [en] = gridOf((await imported(source, { lang: 'en' })).html);
    expect('en anglais', en.map(c => c.text).join('|') === '12.5|25.6 %|3 EUR|TRUE|FALSE|03/05/2024|03/05/2024 14:30|09:05:07|écrit', en.map(c => c.text));
    return result(bad);
  });

  add('odsImport_standard_alignment_follows_the_kind_of_value', 'sans alignement choisi : nombres et dates à droite, booléens et erreurs au centre, texte à gauche ; l\'alignement choisi (centré, à droite, justifié, à gauche) l\'emporte, même sur un nombre', async () => {
    const { bad, expect } = checker();
    const auto = cellStyle('ce1', { para: 'fo:text-align="center" style:text-align-source="fix"' }) + cellStyle('ce2', { para: 'fo:text-align="end" style:text-align-source="fix"' })
      + cellStyle('ce3', { para: 'fo:text-align="justify" style:text-align-source="fix"' }) + cellStyle('ce4', { para: 'fo:text-align="start" style:text-align-source="fix"' }) + cellStyle('ce5', { para: 'fo:text-align="start" style:text-align-source="value-type"' });
    const date = '<table:table-cell office:value-type="date" office:date-value="2024-03-05"><text:p>05/03/2024</text:p></table:table-cell>';
    const bool = '<table:table-cell office:value-type="boolean" office:boolean-value="true"><text:p>VRAI</text:p></table:table-cell>';
    const err = '<table:table-cell office:value-type="string" calcext:value-type="error"><text:p>#DIV/0!</text:p></table:table-cell>';
    const out = await imported({ auto, sheets: [sheet('S', [
      row([text('texte'), num('12', 12), date, bool, err]),
      row([num('1', 1, 'ce1'), num('2', 2, 'ce2'), text('justifié', 'ce3'), num('4', 4, 'ce4'), num('5', 5, 'ce5')]),
    ])] });
    const [standard, chosen] = gridOf(out.html);
    expect('texte à gauche, nombre et date à droite, booléen et erreur au centre', standard.map(c => c.align).join('|') === '|right|right|center|center', standard.map(c => c.align));
    expect('centré, à droite, justifié, à gauche, « standard » malgré le texte écrit', chosen.map(c => c.align).join('|') === 'center|right|justify||right', chosen.map(c => c.align));
    return result(bad);
  });

  add('odsImport_indent_vertical_alignment_and_rotation', 'le retrait (marge gauche) est repris pour un texte à gauche et ignoré à droite ; l\'alignement vertical haut et bas est repris, « automatique » prend celui de la grille (le milieu) ; un texte tourné reste à l\'horizontale et est compté', async () => {
    const { bad, expect } = checker();
    const auto = cellStyle('ce1', { para: 'fo:margin-left="0.353cm"', cell: 'style:vertical-align="top"' }) + cellStyle('ce2', { para: 'fo:margin-left="0.353cm" fo:text-align="end" style:text-align-source="fix"', cell: 'style:vertical-align="bottom"' })
      + cellStyle('ce3', { cell: 'style:vertical-align="automatic" style:rotation-angle="90"' }) + cellStyle('ce4', { cell: 'style:vertical-align="middle"' });
    const out = await imported({ auto, sheets: [sheet('S', [row([text('a', 'ce1'), text('b', 'ce2'), text('c', 'ce3'), text('d', 'ce4')])])] });
    const [cells] = gridOf(out.html);
    expect('retrait de 0,353 cm = 10 pt', Math.abs(cells[0].indent - 10) < 0.1, cells[0].indent);
    expect('aucun retrait à droite', cells[1].indent === 0 && cells[1].align === 'right', [cells[1].indent, cells[1].align]);
    expect('haut, bas, automatique, milieu', cells.map(c => c.valign).join('|') === 'top|bottom|middle|middle', cells.map(c => c.valign));
    expect('le texte tourné est compté', countOf(out.report, 'rotated') === 1, out.report);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 3. La mise en forme du texte, le fond et les traits
  // ============================================================================================================================================================================================
  add('odsImport_character_marks_come_from_the_style_chain_and_the_spans', 'gras, italique, souligné, barré, couleur, taille et police viennent du style de la case, de celui dont il hérite et des plages de texte (`text:span`) ; le noir n\'est pas écrit ; la taille la plus courante et la police la plus courante ne sont pas écrites', async () => {
    const { bad, expect } = checker();
    const auto = cellStyle('ce1', { textProps: 'fo:font-weight="bold" fo:font-style="italic"' }) + cellStyle('ce2', { parent: 'ce1', textProps: 'style:text-underline-style="solid" style:text-line-through-style="solid" fo:color="#c80000"' })
      + cellStyle('ce3', { textProps: 'fo:font-size="18pt"' }) + cellStyle('ce4', { textProps: 'style:font-name="Courier New"' }) + cellStyle('ce5', { textProps: 'fo:color="#000000"' })
      + textStyle('T1', 'fo:font-weight="normal" fo:color="#0000ff"') + textStyle('T2', 'style:text-position="super 58%"') + textStyle('T3', 'style:text-position="sub 58%"');
    const out = await imported({ auto, sheets: [sheet('S', [
      row([text('plain'), text('gras italique', 'ce1'), text('hérité', 'ce2'), text('grand', 'ce3'), text('machine', 'ce4'), text('noir', 'ce5')]),
      row([text('normal ' + span('bleu', 'T1') + ' fin', 'ce1'), text('m' + span('2', 'T2') + ' H' + span('2', 'T3') + 'O'), text('plain'), text('plain'), text('plain'), text('plain')]),
    ])] });
    const [first, second] = gridOf(out.html);
    expect('texte simple : rien d\'écrit', first[0].html === 'plain', first[0].html);
    expect('gras et italique du style de la case', first[1].html === '<strong><em>gras italique</em></strong>', first[1].html);
    expect('l\'héritage : gras, italique, souligné, barré et rouge', /<strong>/.test(first[2].html) && /<em>/.test(first[2].html) && /<u>/.test(first[2].html) && /<s>|<del>|<strike>/.test(first[2].html) && /c80000|rgb\(200, 0, 0\)/i.test(first[2].html), first[2].html);
    expect('18 pt : la taille est écrite', /font-size: 18pt/.test(first[3].html), first[3].html);
    expect('Courier New : la police est écrite', /Courier New/.test(first[4].html), first[4].html);
    expect('le noir n\'est pas écrit', !/color/.test(first[5].html), first[5].html);
    expect('une plage normale et bleue dans une case en gras', /<strong><em>normal <\/em><\/strong>/.test(second[0].html) && /0000ff|rgb\(0, 0, 255\)/i.test(second[0].html) && !/<strong>(?:<em>)?[^<]*bleu/.test(second[0].html), second[0].html);
    expect('exposant et indice', /<sup>2<\/sup>/.test(second[1].html) && /<sub>2<\/sub>/.test(second[1].html), second[1].html);
    return result(bad);
  });

  add('odsImport_the_default_style_of_the_file_is_the_starting_text', 'les valeurs par défaut du fichier (police, taille) et le style « Default » ne sont pas écrits quand tout le tableur les partage ; un style qui change la taille de départ (titre en 14 pt) est écrit, et si le tableur n\'est QUE en 14 pt, 14 pt est le texte de départ', async () => {
    const { bad, expect } = checker();
    const mixed = await imported({ sheets: [sheet('S', [row([text('Titre', 'Heading'), text('a'), text('b'), text('c')])])] });
    const [cells] = gridOf(mixed.html);
    expect('le titre garde sa taille (14 pt) et son gras', /font-size: 14pt/.test(cells[0].html) && /<strong>/.test(cells[0].html), cells[0].html);
    expect('les autres : rien d\'écrit', cells.slice(1).every(c => !/font-size/.test(c.html)), cells.map(c => c.html));
    const only = await imported({ sheets: [sheet('S', [row([text('Titre', 'Heading'), text('Autre', 'Heading')])])] });
    expect('un tableur tout en 14 pt : la taille de départ n\'est pas écrite', !/font-size/.test(gridOf(only.html)[0][0].html), gridOf(only.html)[0][0].html);
    return result(bad);
  });

  add('odsImport_fill_and_borders_keep_their_color_and_side', 'le fond (« transparent » = aucun) et les traits (couleur, côté, raccourci `fo:border` et côté qui le précise) sont repris ; « none » et le trait de départ de la grille (#777777) n\'en sont pas ; un trait épais, pointillé ou double est repris en trait fin uni et compté une fois par case', async () => {
    const { bad, expect } = checker();
    const auto = cellStyle('ce1', { cell: 'fo:background-color="#ffff00"' }) + cellStyle('ce2', { cell: 'fo:background-color="transparent"' })
      + cellStyle('ce3', { cell: 'fo:border-top="0.74pt solid #ff0000" fo:border-bottom="0.74pt solid #00ff00" fo:border-left="none" fo:border-right="0.74pt solid #777777"' })
      + cellStyle('ce4', { cell: 'fo:border="0.74pt solid #0000ff" fo:border-bottom="none"' })
      + cellStyle('ce5', { cell: 'fo:border-top="2.25pt solid #000000" fo:border-bottom="0.74pt dotted #000000" fo:border-left="0.74pt double #000000"' });
    const out = await imported({ auto, sheets: [sheet('S', [row([text('a', 'ce1'), text('b', 'ce2'), text('c', 'ce3'), blank(), text('d', 'ce4'), blank(), text('e', 'ce5')])])] });
    const [cells] = gridOf(out.html);
    expect('fond jaune', cells[0].fill === '#ffff00', cells[0].fill);
    expect('« transparent » : pas de fond', cells[1].fill === null, cells[1].fill);
    expect('traits : haut rouge, bas vert, ni gauche ni droite (le trait de départ n\'est pas un choix)', cells[2].borders.top === '#ff0000' && cells[2].borders.bottom === '#00ff00' && !cells[2].borders.left && !cells[2].borders.right, cells[2].borders);
    expect('le raccourci et le côté qui le précise', cells[4].borders.top === '#0000ff' && cells[4].borders.left === '#0000ff' && !cells[4].borders.bottom, cells[4].borders);
    expect('épais, pointillé et double : traits repris, comptés une fois (une case)', cells[6].borders.top === '#000000' && cells[6].borders.bottom === '#000000' && countOf(out.report, 'borderStyles') === 1, [cells[6].borders, out.report]);
    return result(bad);
  });

  add('odsImport_links_line_breaks_and_unsafe_addresses', 'un lien https, mailto ou tel est gardé (même dans un texte en plusieurs plages) ; un lien « javascript: » ou interne (#Feuille.A1) reste du texte', async () => {
    const { bad, expect } = checker();
    const link = (href, label) => `<text:a xlink:href="${href}" xlink:type="simple">${label}</text:a>`;
    const out = await imported({ sheets: [sheet('S', [row([text(link('https://example.org/a', 'site')), text(link('mailto:a@b.fr', 'mail')), text(link('javascript:alert(1)', 'piège')), text(link('#Feuille2.A1', 'interne')), text('voir ' + link('tel:+33123456789', 'le standard') + ' !')])])] });
    const [cells] = gridOf(out.html);
    expect('https gardé', /<a href="https:\/\/example\.org\/a">site<\/a>/.test(cells[0].html), cells[0].html);
    expect('mailto gardé', /<a href="mailto:a@b\.fr">mail<\/a>/.test(cells[1].html), cells[1].html);
    expect('javascript: reste du texte', cells[2].html === 'piège' && !/href/.test(cells[2].html), cells[2].html);
    expect('un lien interne reste du texte', cells[3].html === 'interne', cells[3].html);
    expect('un lien au milieu du texte', /voir <a href="tel:\+33123456789">le standard<\/a> !/.test(cells[4].html), cells[4].html);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 4. La forme de la feuille
  // ============================================================================================================================================================================================
  add('odsImport_merged_cells_keep_their_spans_and_the_corner_borders', 'une fusion de trois colonnes et une de deux lignes gardent leur étendue (cases couvertes ignorées), le contenu et les traits de leur case d\'angle', async () => {
    const { bad, expect } = checker();
    const auto = cellStyle('ce1', { cell: 'fo:border="0.74pt solid #ff0000" fo:background-color="#eeeeee"' });
    const out = await imported({ auto, sheets: [sheet('S', [
      row([text('Titre', 'ce1', 'table:number-columns-spanned="3" table:number-rows-spanned="1"'), covered(2), text('côté', '', 'table:number-rows-spanned="2" table:number-columns-spanned="1"')]),
      row([text('a'), text('b'), text('c'), covered()]),
    ])] });
    const [first, second] = gridOf(out.html);
    expect('première ligne : la fusion de trois colonnes puis la fusion de deux lignes', first.length === 2 && first[0].colspan === 3 && first[0].text === 'Titre' && first[1].rowspan === 2, first);
    expect('seconde ligne : trois cases', second.length === 3 && second.map(c => c.text).join('|') === 'a|b|c', second);
    expect('la fusion porte les quatre traits et le fond de sa case d\'angle', first[0].fill === '#eeeeee' && ['top', 'right', 'bottom', 'left'].every(side => first[0].borders[side] === '#ff0000'), first[0]);
    return result(bad);
  });

  add('odsImport_a_hidden_line_inside_a_merge_shrinks_it', 'une ligne masquée dans une fusion la raccourcit ; une fusion dont l\'ancre est masquée prend la première case visible', async () => {
    const { bad, expect } = checker();
    const out = await imported({ sheets: [sheet('S', [
      row([text('haut', '', 'table:number-rows-spanned="3" table:number-columns-spanned="1"'), text('x1')]),
      row([covered(), text('x2')], 'table:visibility="collapse"'),
      row([covered(), text('x3')]),
      row([text('bas'), text('x4')]),
    ])] });
    const grid = gridOf(out.html);
    expect('trois lignes visibles : fusion sur deux lignes', grid.length === 3 && grid[0][0].rowspan === 2, grid.map(r => r.map(c => c.text + ':' + c.rowspan)));
    expect('le rapport compte la ligne masquée', countOf(out.report, 'hiddenRows') === 1, out.report);
    return result(bad);
  });

  add('odsImport_column_widths_and_row_heights', 'la largeur des colonnes (cm) devient des pixels (2,258 cm = 85 px, 5 cm = 189 px), celle d\'une colonne sans largeur est 85 px ; la hauteur d\'une ligne est reprise, sauf la hauteur « au plus juste » de LibreOffice (0,45 cm) qui prend celle de la grille (20 px)', async () => {
    const { bad, expect } = checker();
    const auto = colStyle('co1', '5cm') + colStyle('co2', '0.3cm') + rowStyle('ro1', '1.5cm', false) + rowStyle('ro2', '0.452cm', true);
    const out = await imported({ auto, sheets: [sheet('S', [row([text('a'), text('b'), text('c')], '', 'ro1'), row([text('d'), text('e'), text('f')], '', 'ro2')], { cols: col('co1') + col('co2') + col() })] });
    const [first] = gridOf(out.html);
    expect('5 cm = 189 px', first[0].width === '189', first[0].width);
    expect('une colonne très étroite : 24 px au moins', first[1].width === '24', first[1].width);
    expect('une colonne sans largeur : 85 px', first[2].width === '85', first[2].width);
    expect('1,5 cm = 57 px de haut, « au plus juste » = 20 px', rowHeights(out.html).join('|') === '57|20', rowHeights(out.html));
    return result(bad);
  });

  add('odsImport_hidden_filtered_and_folded_lines_are_left_out', 'les lignes et colonnes masquées (collapse), filtrées (filter) ou dans un groupe replié ne sont pas importées et sont comptées ; les colonnes répétées masquées de même', async () => {
    const { bad, expect } = checker();
    const out = await imported({ sheets: [sheet('S', [
      row([text('a1'), text('b1'), text('c1'), text('d1')]),
      row([text('a2'), text('b2'), text('c2'), text('d2')], 'table:visibility="collapse"'),
      row([text('a3'), text('b3'), text('c3'), text('d3')], 'table:visibility="filter"'),
      '<table:table-row-group table:display="false"><table:table-row><table:table-cell office:value-type="string"><text:p>a4</text:p></table:table-cell></table:table-row></table:table-row-group>',
      row([text('a5'), text('b5'), text('c5'), text('d5')]),
    ], { cols: col('', 'table:visibility="collapse"') + '<table:table-column table:number-columns-repeated="2"/>' + col('', 'table:visibility="filter"') })] });
    const grid = gridOf(out.html);
    expect('lignes 1 et 5, colonnes b et c', grid.map(r => r.map(c => c.text).join('|')).join('/') === 'b1|c1/b5|c5', grid.map(r => r.map(c => c.text)));
    expect('3 lignes et 2 colonnes masquées', countOf(out.report, 'hiddenRows') === 3 && countOf(out.report, 'hiddenCols') === 2, out.report);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 5. Les plages « répétées »
  // ============================================================================================================================================================================================
  add('odsImport_repeated_cells_columns_and_rows_are_expanded_only_where_they_have_values', 'une case à valeur répétée trois fois donne trois cases ; une ligne à valeur répétée deux fois donne deux lignes ; les colonnes répétées gardent leur largeur', async () => {
    const { bad, expect } = checker();
    const auto = colStyle('co1', '3cm');
    const out = await imported({ auto, sheets: [sheet('S', [
      row([text('x', '', 'table:number-columns-repeated="3"'), text('fin')]),
      row([text('r'), blank(3)], 'table:number-rows-repeated="2"'),
    ], { cols: col('co1', 'table:number-columns-repeated="3"') + col() })] });
    const grid = gridOf(out.html);
    expect('x x x fin', grid[0].map(c => c.text).join('|') === 'x|x|x|fin', grid[0].map(c => c.text));
    expect('la ligne répétée est écrite deux fois', grid.length === 3 && grid[1][0].text === 'r' && grid[2][0].text === 'r', grid.length);
    expect('trois colonnes de 3 cm (113 px) puis celle de départ', grid[0].map(c => c.width).join('|') === '113|113|113|85', grid[0].map(c => c.width));
    return result(bad);
  });

  add('odsImport_the_empty_tail_of_a_sheet_does_not_make_it_big', 'LibreOffice écrit « un million de lignes vides de 1 024 cases » après les données : la feuille garde ses lignes de valeurs, rien d\'autre', async () => {
    const { bad, expect } = checker();
    const out = await imported({ sheets: [sheet('S', [
      row([text('a'), text('b'), blank(1022)]), row([text('c'), text('d'), blank(1022)]),
      row([blank(1024)], 'table:number-rows-repeated="1048574"'),
    ], { cols: col('', 'table:number-columns-repeated="1024"') })] });
    expect('2 lignes et 2 colonnes', out.rows === 2 && out.cols === 2, [out.rows, out.cols]);
    return result(bad);
  });

  add('odsImport_formatting_alone_counts_only_next_to_the_data', 'des lignes qui n\'ont qu\'un fond ou un trait, collées sous les données, font partie de la grille (un tableau dessiné jusqu\'en bas) ; un fond posé sur toute une ligne ou toute la feuille ne l\'agrandit pas', async () => {
    const { bad, expect } = checker();
    const auto = cellStyle('ce1', { cell: 'fo:background-color="#cccccc"' });
    const drawn = await imported({ auto, sheets: [sheet('S', [row([text('a'), text('b')]), row([blank(2, 'ce1'), blank(1)]), row([blank(2, 'ce1')]), row([blank(1)]), row([blank(2, 'ce1')])])] });
    expect('les deux lignes de fond collées sont reprises, pas celle qui suit un trou', drawn.rows === 3 && drawn.cols === 2, [drawn.rows, drawn.cols]);
    const wide = await imported({ auto, sheets: [sheet('S', [row([text('a'), text('b'), blank(1022, 'ce1')]), row([blank(1024, 'ce1')], 'table:number-rows-repeated="1048575"')])] });
    expect('un fond sur toute la feuille n\'agrandit rien', wide.rows === 1 && wide.cols === 2, [wide.rows, wide.cols]);
    return result(bad);
  });

  add('odsImport_the_column_default_style_gives_empty_cells_their_look', 'une case sans style prend celui de sa ligne, sinon celui de sa colonne (`table:default-cell-style-name`) : une colonne entière sur fond jaune garde son fond dans les cases écrites sans style', async () => {
    const { bad, expect } = checker();
    const auto = cellStyle('ce1', { cell: 'fo:background-color="#ffff00"' }) + cellStyle('ce2', { cell: 'fo:background-color="#00ffff"' });
    const out = await imported({ auto, sheets: [sheet('S', [
      row([text('a'), text('b')]),
      row([text('c'), text('d')], 'table:default-cell-style-name="ce2"'),
    ], { cols: col('', 'table:default-cell-style-name="ce1"') + col() })] });
    const [first, second] = gridOf(out.html);
    expect('colonne jaune', first[0].fill === '#ffff00' && first[1].fill === null, [first[0].fill, first[1].fill]);
    expect('la ligne prend le pas sur la colonne', second[0].fill === '#00ffff' && second[1].fill === '#00ffff', [second[0].fill, second[1].fill]);
    return result(bad);
  });

  // ============================================================================================================================================================================================
  // 6. Le rapport et les limites
  // ============================================================================================================================================================================================
  add('odsImport_what_is_not_carried_over_is_counted', 'formules, mises en forme conditionnelles, images, graphiques, formes, commentaires, textes tournés, traits spéciaux, lignes et colonnes masquées : comptés à leur place, dans l\'ordre de REPORT_KEYS, un genre à la fois ; rien à dire quand tout arrive', async () => {
    const { bad, expect } = checker();
    const auto = cellStyle('ce1', { cell: 'style:rotation-angle="45"' }) + cellStyle('ce2', { cell: 'fo:border-top="2.25pt solid #000000"' });
    const image = '<draw:frame draw:name="img" text:anchor-type="cell" svg:width="2cm" svg:height="1cm"><draw:image xlink:href="Pictures/a.png"/></draw:frame>';
    const chart = '<draw:frame draw:name="chart" svg:width="5cm" svg:height="5cm"><draw:object xlink:href="./Object 1"/></draw:frame>';
    const shape = '<draw:custom-shape draw:name="forme"><draw:enhanced-geometry draw:type="ooxml-rect"/></draw:custom-shape>';
    const group = '<draw:g><draw:rect/><draw:ellipse/></draw:g>';
    const box = '<draw:frame draw:name="zone"><draw:text-box><text:p>mot</text:p></draw:text-box></draw:frame>';
    const comment = '<office:annotation><dc:creator>Ana</dc:creator><text:p>note</text:p></office:annotation>';
    const conditional = '<calcext:conditional-formats><calcext:conditional-format calcext:target-range-address="A1:A5"><calcext:condition calcext:apply-style-name="x" calcext:value="&gt;3"/><calcext:condition calcext:apply-style-name="y" calcext:value="&lt;1"/></calcext:conditional-format><calcext:conditional-format calcext:target-range-address="B1:B5"><calcext:color-scale/></calcext:conditional-format></calcext:conditional-formats>';
    const full = await imported({ auto, sheets: [sheet('S', [
      row([text('a', 'ce1'), text('b', 'ce2'), `<table:table-cell office:value-type="float" office:value="3" table:formula="of:=1+2"><text:p>3</text:p></table:table-cell>`, text('c' + comment)]),
      row([text('hors champ', '', 'table:visibility="collapse"')], 'table:visibility="collapse"'),
    ], { cols: col() + col() + col() + col('', 'table:visibility="collapse"'), extra: `<table:shapes>${image}${chart}${shape}${group}${box}</table:shapes>${conditional}` })] });
    expect('l\'ordre et les nombres', keysOf(full.report).join(',') === 'formulas,conditional,images,charts,shapes,comments,hiddenRows,hiddenCols,borderStyles,rotated' && full.report.map(e => e.n).join(',') === '1,3,1,1,3,1,1,1,1,1', full.report);
    expect('les genres sont ceux de REPORT_KEYS, dans son ordre', full.report.every((entry, i, all) => OdsImport.REPORT_KEYS.indexOf(entry.key) >= 0 && (i === 0 || OdsImport.REPORT_KEYS.indexOf(all[i - 1].key) < OdsImport.REPORT_KEYS.indexOf(entry.key))), full.report);
    const clean = await imported({ sheets: [sheet('S', [row([text('rien'), num('1', 1)])])] });
    expect('rien à dire quand tout est arrivé', clean.report.length === 0, clean.report);
    return result(bad);
  });

  add('odsImport_every_report_line_has_its_text', 'chaque genre du rapport a sa ligne dans la langue courante (les clés de l\'import Excel : pas de clé à part)', async () => {
    await ready();
    const { bad, expect } = checker();
    OdsImport.REPORT_KEYS.forEach((key) => {
      const line = I18n.t('xlsx.import.report.' + key, { n: 2 });
      expect('texte de ' + key, line && line !== 'xlsx.import.report.' + key && /2/.test(line), line);
    });
    ['status.odsImported', 'status.odsImportEmpty', 'status.odtImportOtherKind'].forEach((key) => {
      const line = I18n.t(key, { rows: 2, cols: 3, kind: 'x' });
      expect('texte de ' + key, line && line !== key, line);
    });
    return result(bad);
  });

  add('odsImport_a_sheet_too_big_for_a_grid_is_refused_with_its_size', 'plus de 1 000 lignes, 100 colonnes ou 5 000 cases visibles : refusé (tooBig) avec les nombres ; des lignes masquées ne comptent pas', async () => {
    await ready();
    const { bad, expect } = checker();
    const manyRows = n => Array.from({ length: n }, (_, i) => row([text('l' + i)]));
    const tall = await failure(async () => imported({ sheets: [sheet('S', manyRows(1001))] }));
    expect('1 001 lignes : tooBig', tall && tall.code === 'tooBig' && tall.rows === 1001 && tall.maxRows === 1000, tall && [tall.code, tall.rows, tall.maxRows]);
    const wide = await failure(async () => imported({ sheets: [sheet('S', [row(Array.from({ length: 101 }, (_, i) => text('c' + i)))])] }));
    expect('101 colonnes : tooBig', wide && wide.code === 'tooBig' && wide.cols === 101 && wide.maxCols === 100, wide && [wide.code, wide.cols, wide.maxCols]);
    const area = await failure(async () => imported({ sheets: [sheet('S', Array.from({ length: 100 }, (_, r) => row(Array.from({ length: 51 }, (_, c) => text(r + ',' + c)))))] }));
    expect('100 x 51 = 5 100 cases : tooBig', area && area.code === 'tooBig' && area.maxCells === 5000, area && [area.code, area.maxCells]);
    const folded = await imported({ sheets: [sheet('S', Array.from({ length: 1100 }, (_, i) => row([text('l' + i)], i % 11 === 0 ? 'table:visibility="collapse"' : '')))] });
    expect('1 100 lignes dont 100 masquées : 1 000 sont lues', folded.rows === 1000 && countOf(folded.report, 'hiddenRows') === 100, [folded.rows, folded.report]);
    return result(bad);
  });

  add('odsImport_a_big_sheet_is_read_in_reasonable_time', 'une feuille de 1 000 lignes de 5 cases est lue en moins de 5 secondes', async () => {
    await ready();
    const { bad, expect } = checker();
    const rows = Array.from({ length: 1000 }, (_, i) => row([text('Ligne ' + i), num(String(i), i), text('x', '', 'table:number-columns-repeated="3"')]));
    const buffer = await ods({ sheets: [sheet('S', rows)] });
    const started = performance.now();
    const out = await OdsImport.fromBuffer(buffer);
    const took = performance.now() - started;
    expect('1 000 lignes, 5 colonnes', out.rows === 1000 && out.cols === 5, [out.rows, out.cols]);
    expect('en moins de 5 s', took < 5000, Math.round(took));
    return result(bad);
  });

  add('odsImport_the_import_sends_one_grid_html_like_a_pasted_spreadsheet', 'le HTML rendu est celui de GridTable.toHtml : un tableau à colonnes (colgroup), largeur et hauteur de ligne écrites, une cellule avec un seul paragraphe', async () => {
    const { bad, expect } = checker();
    const out = await imported({ sheets: [sheet('S', [row([text('a'), text('b')]), row([text('c'), text('d')])])] });
    const body = dom(out.html);
    expect('un seul tableau', body.children.length === 1 && body.firstElementChild.tagName === 'TABLE', out.html.slice(0, 120));
    expect('colgroup de deux colonnes', body.querySelectorAll('colgroup col').length === 2);
    expect('chaque case a un paragraphe', Array.from(body.querySelectorAll('td')).every(td => td.querySelectorAll('p').length === 1));
    expect('le modèle dit la même chose', out.model.width === 2 && out.model.rows.length === 2 && out.model.cols.length === 2, out.model);
    return result(bad);
  });

  // Les briques de fichiers, pour dev-tests/verify-ods-import-mouse.mjs (la même fabrique : aucun fichier binaire dans le dépôt).
  window.OdsFixtures = { ods, flat, text, num, blank, covered, row, col, sheet, cellStyle, colStyle, rowStyle, textStyle, span };
  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.odsImport = cases;
})();
