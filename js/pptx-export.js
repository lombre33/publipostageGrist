// Export PowerPoint : la présentation d'une ligne en un fichier .pptx (une seule ligne, ou un fichier par ligne dans une archive ZIP : js/main.js, SINGLE_EXPORTS.pptx et BATCH_EXPORTS.pptxZip). Comme
// le Word, le Markdown et le HTML, il part du HTML que ReaderMode.preview a résolu pour la ligne (variables remplacées par leurs valeurs, blocs conditionnels tranchés, ExportCommon.resolveRecord) ;
// à la différence d'eux, ce HTML garde le repère de chaque diapositive (SlidesEntry.outputHtml, `keepProps`) : sa transition, son fond et ses notes d'intervenant n'ont de place que dans ce fichier-là.
//
// Une diapositive est ce qui se trouve entre deux sauts de page. Chacune devient une diapositive PowerPoint de la taille de la page (16:9 : 12 192 000 × 6 858 000 EMU, soit 960 × 540 points ; 12 700 EMU
// le point), avec ses objets MODIFIABLES dans PowerPoint, jamais une image de la page :
//  - le texte : un bloc de texte par suite de paragraphes qui se suivent dans la même colonne (leurs écarts sont écrits en « espacement avant »), le premier titre de la diapositive est son titre
//    (l'espace réservé « Titre » : le plan et la lecture d'écran de PowerPoint le voient) ; listes à puces et numérotées (niveaux compris), gras, italique, souligné, barré, exposant, indice,
//    couleur, fond (surlignage), taille, police, liens (adresse, ou diapositive visée par un signet), alignement, interligne, numéro de diapositive ;
//  - les cadres libres et les formes (js/free-frame.js) : la forme prédéfinie de PowerPoint qui porte leur nom (`rect`, `ellipse`, `star5`, `wedgeRoundRectCallout`...), leur fond, leur trait et leur
//    texte, à leur place au point près, tournés (`rot`, 60 000 unités par degré) ; les traits et flèches : un connecteur droit, retourné et fléché comme à l'écran ;
//  - les images (en ligne, devant ou derrière le texte), les tableaux (colonnes, hauteurs, cases fusionnées, bords, fonds, alignement vertical), le fond de la diapositive ;
//  - la transition, qui se rejoue au diaporama de PowerPoint (fondu, poussé, balayage, couvrir, découvrir, zoom ; côté et durée), et les notes de l'intervenant (le volet « Notes »).
// Les positions se MESURENT sur le rendu réel de l'éditeur (ExportCommon.attachMeasureHost : la même mise en page que l'écran, la police et les tailles du document), jamais se déduisent.
//
// Ce qu'il ne reprend pas, volontairement (le dire est le rôle de la fiche du moteur, README) : les en-têtes, pieds de page et filigrane (PowerPoint les pose sur le masque), les notes de bas de page, les
// sommaires, les encadrés (leur texte part, pas leur cadre), le texte qui déborde de la diapositive (il reste hors d'elle, comme à l'écran), le habillage d'une image par le texte, les polices elles-mêmes
// (jamais embarquées : une police absente chez le lecteur est remplacée par PowerPoint), les animations d'objets autres que celles d'un objet de l'éditeur (js/frame-anim.js : apparition, fondu, volée, balayage, zoom, entrée ou sortie, écrites en `p:timing`). Les images d'un autre site passent d'abord par la fenêtre js/external-images.js.
const PptxExport = (function () {
  const EMU_PER_PT = 12700;
  const PX_TO_PT = 72 / 96;
  const PT_TO_PX = 96 / 72;
  const SLIDE_16_9 = { cx: 12192000, cy: 6858000 };
  const NOTES_SIZE = { cx: 6858000, cy: 9144000 };
  const FIRST_SLIDE_ID = 256;
  const NS = {
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  };
  const ROOT_NS = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
  const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const CT = 'application/vnd.openxmlformats-officedocument.presentationml.';
  // Le rapport entre la hauteur d'une ligne et le corps de la police de l'éditeur (Roboto : 1,172) : l'interligne d'un paragraphe (1,42 dans l'éditeur) se compte en pourcentage de la ligne « simple »
  // de PowerPoint, qui est celle de la police.
  const NATURAL_LINE = ExportCommon.EDITOR_STYLE.naturalLine;
  const LINK_COLOR = '0563C1';
  const TEXT_COLOR = '1B2430'; // la couleur du texte de l'éditeur : celle du thème (dk1), jamais récrite sur chaque série de caractères
  const GENERIC_FONTS = { cousine: 'Courier New', 'sans-serif': 'Arial', 'system-ui': 'Arial', 'ui-sans-serif': 'Arial', serif: 'Times New Roman', monospace: 'Courier New', 'ui-monospace': 'Courier New' };
  const BULLETS = { disc: ['Arial', '•'], circle: ['Courier New', 'o'], square: ['Wingdings', '§'] };
  const NUMBERING = { decimal: 'arabicPeriod', 'lower-alpha': 'alphaLcPeriod', 'lower-latin': 'alphaLcPeriod', 'upper-alpha': 'alphaUcPeriod', 'upper-latin': 'alphaUcPeriod', 'lower-roman': 'romanLcPeriod', 'upper-roman': 'romanUcPeriod' };
  const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' };
  const MEDIA_TYPES = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' };
  const INVISIBLE = ['page-break-marker', 'pp-slide-props', 'pp-slide-link', 'toc-marker', 'heading-numbering-config'];
  const BLOCK_TAGS = /^(P|DIV|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|IMG)$/;

  // --- Petites aides ---------------------------------------------------------------------------------------------------------------------------------------------------------
  const emu = pt => Math.round(pt * EMU_PER_PT);
  const pxEmu = px => emu(px * PX_TO_PT);
  // Un caractère que XML 1.0 refuse (contrôles, U+FFFE, moitié de paire de substitution) ferait refuser tout le fichier : il s'en va.
  const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
  const LONE_HIGH = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g;
  const LONE_LOW = /(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
  const clean = text => String(text == null ? '' : text).replace(ILLEGAL_XML, '').replace(LONE_HIGH, '').replace(LONE_LOW, '$1');
  const esc = text => clean(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const clampInt = (value, lo, hi) => Math.min(hi, Math.max(lo, Math.round(value)));
  const sameish = (a, b, tolerance = 2) => Math.abs(a - b) <= tolerance;
  const guid = (n) => '{' + [8, 4, 4, 4, 12].map((len, i) => (((n + 1) * 2654435761 + i * 40503) >>> 0).toString(16).toUpperCase().padStart(len, '0').slice(-len)).join('-') + '}';

  function relsXml(list) {
    return XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + list.map(rel => `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${esc(rel.target)}"${rel.external ? ' TargetMode="External"' : ''}/>`).join('') + '</Relationships>';
  }

  // --- Le gabarit du fichier : thème, masque, mise en page, propriétés. Écrits à la main, sans rien d'autre qu'un titre et un texte : ils ne portent aucun style, tout est posé sur les objets. ---------
  function themeXml(name) {
    const line = w => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
    const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    const effect = '<a:effectStyle><a:effectLst/></a:effectStyle>';
    const fonts = tag => `<a:${tag}><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:${tag}>`;
    return XML_HEAD + `<a:theme xmlns:a="${NS.a}" name="${esc(name)}"><a:themeElements>`
      + `<a:clrScheme name="Grist Factory"><a:dk1><a:srgbClr val="${TEXT_COLOR}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>`
      + '<a:accent1><a:srgbClr val="2F6FED"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>'
      + `<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="${LINK_COLOR}"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>`
      + `<a:fontScheme name="Grist Factory">${fonts('majorFont')}${fonts('minorFont')}</a:fontScheme>`
      + `<a:fmtScheme name="Grist Factory"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst><a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst>`
      + `<a:effectStyleLst>${effect}${effect}${effect}</a:effectStyleLst><a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme>`
      + '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
  }

  const GROUP_PROPERTIES = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const TEXT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const levelStyles = build => TEXT_LEVELS.map(n => `<a:lvl${n}pPr${build(n)}</a:lvl${n}pPr>`).join('');
  const DEF_RPR = size => `<a:defRPr sz="${size}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr>`;
  const placeholderShape = (id, name, ph, box, body) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${ph}/></p:nvPr></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${box[0]}" y="${box[1]}"/><a:ext cx="${box[2]}" cy="${box[3]}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>${body}</p:sp>`;
  const SLIDE_NUMBER_FIELD = '<a:fld id="{C1FF6DA9-008F-8B48-92A6-B652298478BF}" type="slidenum"><a:rPr lang="en-US"/><a:t>‹#›</a:t></a:fld>';
  function frameBoxes(size) {
    const x = f => Math.round(size.cx * f);
    const y = f => Math.round(size.cy * f);
    return {
      title: [x(0.06875), y(0.05324), x(0.8625), y(0.19328)],
      body: [x(0.06875), y(0.26621), x(0.8625), y(0.63447)],
      date: [x(0.06875), y(0.92683), x(0.225), y(0.05324)],
      footer: [x(0.33125), y(0.92683), x(0.3375), y(0.05324)],
      number: [x(0.70625), y(0.92683), x(0.225), y(0.05324)],
    };
  }
  function masterXml(size) {
    const box = frameBoxes(size);
    const footerLike = (id, name, ph, geometry, align, content) => placeholderShape(id, name, ph, geometry,
      `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle><a:lvl1pPr algn="${align}"><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle><a:p>${content}<a:endParaRPr lang="en-US"/></a:p></p:txBody>`);
    const bodyStyle = levelStyles(n => ` marL="${342900 + (n - 1) * 400050}" indent="-342900" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="•"/>${DEF_RPR(Math.max(1400, 2800 - (n - 1) * 400))}`);
    const otherStyle = levelStyles(n => ` marL="${(n - 1) * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">${DEF_RPR(1800)}`);
    return XML_HEAD + `<p:sldMaster ${ROOT_NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP_PROPERTIES}`
      + placeholderShape(2, 'Title Placeholder 1', 'type="title"', box.title, `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master title style</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody>`)
      + placeholderShape(3, 'Text Placeholder 2', 'type="body" idx="1"', box.body, `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody>`)
      + footerLike(4, 'Date Placeholder 3', 'type="dt" sz="half" idx="2"', box.date, 'l', '')
      + footerLike(5, 'Footer Placeholder 4', 'type="ftr" sz="quarter" idx="3"', box.footer, 'ctr', '')
      + footerLike(6, 'Slide Number Placeholder 5', 'type="sldNum" sz="quarter" idx="4"', box.number, 'r', SLIDE_NUMBER_FIELD)
      + '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
      + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
      + `<p:txStyles><p:titleStyle><a:lvl1pPr algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr></p:titleStyle>`
      + `<p:bodyStyle>${bodyStyle}</p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr>${otherStyle}</p:otherStyle></p:txStyles></p:sldMaster>`;
  }
  function layoutXml() {
    const footerLike = (id, name, ph, content) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${ph}/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p>${content}<a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
    return XML_HEAD + `<p:sldLayout ${ROOT_NS} type="titleOnly" preserve="1"><p:cSld name="Title Only"><p:spTree>${GROUP_PROPERTIES}`
      + `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master title style</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`
      + footerLike(3, 'Date Placeholder 2', 'type="dt" sz="half" idx="10"', '')
      + footerLike(4, 'Footer Placeholder 3', 'type="ftr" sz="quarter" idx="11"', '')
      + footerLike(5, 'Slide Number Placeholder 4', 'type="sldNum" sz="quarter" idx="12"', SLIDE_NUMBER_FIELD)
      + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  }
  function notesMasterXml(size) {
    const sheet = { w: 6858000, h: 9144000 };
    const slideW = 5486400;
    const slideH = Math.round(slideW * size.cy / size.cx);
    const line = '<a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln>';
    const small = (id, name, ph, geometry, align, anchor, content) => placeholderShape(id, name, ph, geometry,
      `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"${anchor ? ` anchor="${anchor}"` : ''}/><a:lstStyle><a:lvl1pPr algn="${align}"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p>${content}<a:endParaRPr lang="en-US"/></a:p></p:txBody>`);
    const notesStyle = levelStyles(n => ` marL="${(n - 1) * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">${DEF_RPR(1200)}`);
    return XML_HEAD + `<p:notesMaster ${ROOT_NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP_PROPERTIES}`
      + small(2, 'Header Placeholder 1', 'type="hdr" sz="quarter"', [0, 0, 2971800, 458788], 'l', '', '')
      + small(3, 'Date Placeholder 2', 'type="dt" idx="1"', [3884613, 0, 2971800, 458788], 'r', '', '')
      + `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Image Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round((sheet.w - slideW) / 2)}" y="1143000"/><a:ext cx="${slideW}" cy="${slideH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>${line}</p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`
      + placeholderShape(5, 'Notes Placeholder 4', 'type="body" sz="quarter" idx="3"', [685800, 4400550, 5486400, 3600450], `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody>`)
      + small(6, 'Footer Placeholder 5', 'type="ftr" sz="quarter" idx="4"', [0, 8685213, 2971800, 458787], 'l', 'b', '')
      + small(7, 'Slide Number Placeholder 6', 'type="sldNum" sz="quarter" idx="5"', [3884613, 8685213, 2971800, 458787], 'r', 'b', SLIDE_NUMBER_FIELD)
      + '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
      + `<p:notesStyle>${notesStyle}</p:notesStyle></p:notesMaster>`;
  }
  const PRESENTATION_PROPERTIES = XML_HEAD + `<p:presentationPr ${ROOT_NS}/>`;
  const VIEW_PROPERTIES = XML_HEAD + `<p:viewPr ${ROOT_NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr><p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="1" d="1"/><a:sy n="1" d="1"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`;
  const TABLE_STYLES = XML_HEAD + `<a:tblStyleLst xmlns:a="${NS.a}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`;
  function presentationXml(slides, size, hasNotes, relIds) {
    const defaults = levelStyles(n => ` marL="${(n - 1) * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">${DEF_RPR(1800)}`);
    return XML_HEAD + `<p:presentation ${ROOT_NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${relIds.master}"/></p:sldMasterIdLst>`
      + (hasNotes ? `<p:notesMasterIdLst><p:notesMasterId r:id="${relIds.notesMaster}"/></p:notesMasterIdLst>` : '')
      + `<p:sldIdLst>${slides.map((slide, i) => `<p:sldId id="${FIRST_SLIDE_ID + i}" r:id="${relIds.slides[i]}"/>`).join('')}</p:sldIdLst>`
      + `<p:sldSz cx="${size.cx}" cy="${size.cy}"/><p:notesSz cx="${NOTES_SIZE.cx}" cy="${NOTES_SIZE.cy}"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr>${defaults}</p:defaultTextStyle></p:presentation>`;
  }
  function corePropertiesXml(title, when) {
    return XML_HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${esc(title)}</dc:title><dc:creator>Grist Factory</dc:creator><cp:lastModifiedBy>Grist Factory</cp:lastModifiedBy><cp:revision>1</cp:revision>`
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified></cp:coreProperties>`;
  }
  function appPropertiesXml(slideCount, noteCount, size) {
    const wide = Math.abs(size.cx / size.cy - 16 / 9) < 0.01;
    return XML_HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
      + `<TotalTime>0</TotalTime><Application>Grist Factory</Application><PresentationFormat>${wide ? 'Widescreen' : 'Custom'}</PresentationFormat><Slides>${slideCount}</Slides><Notes>${noteCount}</Notes><HiddenSlides>0</HiddenSlides><AppVersion>16.0000</AppVersion></Properties>`;
  }
  function contentTypesXml(parts) {
    const extensions = Array.from(new Set(parts.media.map(m => m.ext)));
    return XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + extensions.map(ext => `<Default Extension="${ext}" ContentType="${MEDIA_TYPES[ext]}"/>`).join('')
      + `<Override PartName="/ppt/presentation.xml" ContentType="${CT}presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}slideMaster+xml"/>`
      + `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT}slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`
      + `<Override PartName="/ppt/presProps.xml" ContentType="${CT}presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="${CT}viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="${CT}tableStyles+xml"/>`
      + (parts.notes ? `<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="${CT}notesMaster+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` : '')
      + parts.slides.map((slide, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${CT}slide+xml"/>`).join('')
      + parts.slides.filter(slide => slide.notes).map(slide => `<Override PartName="/ppt/notesSlides/notesSlide${slide.number}.xml" ContentType="${CT}notesSlide+xml"/>`).join('')
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  }

  // --- Le texte : un paragraphe PowerPoint par paragraphe de l'éditeur, ses séries de caractères d'après le style que le navigateur calcule (WYSIWYG : ce que l'éditeur montre) ------------------------
  const cssHex = value => ExportCommon.cssColorHex(value);
  // Une couleur unie, avec sa TRANSPARENCE en pour cent quand elle en a une : `<a:alpha>` est l'opacité en millièmes de pour cent (50 % de transparence : 50000).
  const colorXml = (hex, tr) => (tr ? `<a:srgbClr val="${hex}"><a:alpha val="${Math.round((100 - tr) * 1000)}"/></a:srgbClr>` : `<a:srgbClr val="${hex}"/>`);
  const fillXml = (hex, tr) => `<a:solidFill>${colorXml(hex, tr)}</a:solidFill>`;
  const sizeOf = px => clampInt(parseFloat(px) * PX_TO_PT * 100, 100, 400000);
  // L'espacement des caractères (`letter-spacing` calculé, « normal » ou des pixels) en centièmes de point, comme l'attribut `spc` d'un texte.
  const spacingOf = px => (/^-?[\d.]+px$/.test(String(px)) ? clampInt(parseFloat(px) * PX_TO_PT * 100, -400000, 400000) : 0);
  function familyOf(css) {
    const first = String(css || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
    return GENERIC_FONTS[first.toLowerCase()] || first || 'Arial';
  }
  // La famille de remplacement que PowerPoint prend quand la police manque : 34 = sans empattement, 18 = avec, 49 = chasse fixe.
  function pitchOf(css, family) {
    const text = String(css || '').toLowerCase();
    if (/monospace|courier|consolas|cousine/.test(text) || family === 'Courier New') return 49;
    if (/(^|[ ,])serif/.test(text) && !/sans-serif/.test(text)) return 18;
    return 34;
  }
  const styleCache = new WeakMap();
  function computedOf(el) {
    let cs = styleCache.get(el);
    if (!cs) { cs = getComputedStyle(el); styleCache.set(el, cs); }
    return cs;
  }
  // Le style d'un texte dont le parent est `el`, `stop` étant le paragraphe qui le contient : les décorations (souligné, barré), le surlignage, l'exposant et le lien viennent des éléments entre les deux.
  function runStyleOf(el, stop) {
    const cs = computedOf(el);
    let underline = false;
    let strike = false;
    let highlight = null;
    let script = null;
    let link = null;
    let sizeEl = el;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const line = computedOf(n).textDecorationLine || '';
      if (/underline/.test(line)) underline = true;
      if (/line-through/.test(line)) strike = true;
      if (n !== stop) {
        if (!highlight) highlight = cssHex(computedOf(n).backgroundColor);
        const kind = ScriptMarks.kindOf(n);
        if (kind && !script) script = kind;
        if (n.tagName === 'A' && !link && n.getAttribute('href')) link = n;
      }
      if (n === stop) break;
    }
    if (script) { sizeEl = el; while (sizeEl && sizeEl !== stop && ScriptMarks.kindOf(sizeEl)) sizeEl = sizeEl.parentElement; }
    const family = familyOf(cs.fontFamily);
    const weight = cs.fontWeight;
    return {
      sz: sizeOf(computedOf(sizeEl || el).fontSize),
      b: weight === 'bold' || parseInt(weight, 10) >= 600,
      i: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique',
      u: underline,
      strike,
      spc: spacingOf(cs.letterSpacing),
      cap: cs.textTransform === 'uppercase' ? 'all' : (/small-caps/.test(cs.fontVariantCaps || '') ? 'small' : ''),
      baseline: script === ScriptMarks.SUPERSCRIPT ? 30000 : (script === ScriptMarks.SUBSCRIPT ? -25000 : 0),
      color: link ? LINK_COLOR : (cssHex(cs.color) === TEXT_COLOR ? null : cssHex(cs.color)),
      highlight,
      family,
      pitch: pitchOf(cs.fontFamily, family),
      link,
    };
  }
  const styleKey = st => [st.sz, st.b, st.i, st.u, st.strike, st.spc, st.cap, st.baseline, st.color, st.highlight, st.family, st.link ? st.link.getAttribute('href') : ''].join('|');

  // Les propriétés d'une série de caractères (`a:rPr`), dans l'ordre du schéma : trait, remplissage, surlignage, police, lien.
  function runPropertiesXml(st, slide, tag = 'a:rPr') {
    const attrs = [`sz="${st.sz}"`];
    if (st.b) attrs.push('b="1"');
    if (st.i) attrs.push('i="1"');
    if (st.u) attrs.push('u="sng"');
    if (st.strike) attrs.push('strike="sngStrike"');
    if (st.spc) attrs.push(`spc="${st.spc}"`);
    if (st.cap) attrs.push(`cap="${st.cap}"`);
    if (st.baseline) attrs.push(`baseline="${st.baseline}"`);
    attrs.push('dirty="0"');
    const link = st.link ? slide.linkXml(st.link) : '';
    return `<${tag} ${attrs.join(' ')}>${st.color ? fillXml(st.color) : ''}${st.highlight ? `<a:highlight><a:srgbClr val="${st.highlight}"/></a:highlight>` : ''}<a:latin typeface="${esc(st.family)}" pitchFamily="${st.pitch}" charset="0"/>${link}</${tag}>`;
  }
  const endRunXml = (st, slide) => runPropertiesXml(Object.assign({}, st, { link: null, u: false, strike: false, highlight: null }), slide, 'a:endParaRPr');

  // La place qu'une image dans la ligne prend au texte : des espaces insécables de la largeur de l'image (elle devient un objet de la diapositive, posé par-dessus). Une image qui flotte ou qui est en calque ne
  // pousse aucun texte.
  const NBSP_EM = 0.25;
  function spacerFor(img, st) {
    const cs = computedOf(img);
    if (cs.float !== 'none' || cs.position === 'absolute' || !/^inline/.test(cs.display)) return null;
    const widthPt = img.getBoundingClientRect().width * PX_TO_PT;
    const count = Math.round(widthPt / (NBSP_EM * (st.sz / 100)));
    return count > 0 ? { text: '\u00A0'.repeat(count), st } : null;
  }
  // Les séries de caractères d'un paragraphe, dans l'ordre : { text, st } ou { br, st } ou { field, st }, et `images` : les images de ses lignes. Une image dans le texte n'en est pas une (`onImage`) ;
  // une sous-liste, un tableau ou un bloc ont leur propre paragraphe.
  function runsOf(unit, onImage) {
    const runs = [];
    runs.images = [];
    const push = (item) => {
      const last = runs[runs.length - 1];
      if (item.text !== undefined && last && last.text !== undefined && styleKey(last.st) === styleKey(item.st)) last.text += item.text;
      else runs.push(item);
    };
    const walk = (node) => {
      if (node.nodeType === 3) {
        const text = node.nodeValue.replace(/\r\n?/g, '\n');
        if (!text) return;
        const st = runStyleOf(node.parentElement, unit.el);
        text.split('\n').forEach((part, i) => {
          if (i) push({ br: true, st });
          if (part) push({ text: part, st });
        });
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node;
      if (el.tagName === 'BR') {
        if (el.parentNode.childNodes.length > 1 && !el.classList.contains('ProseMirror-trailingBreak')) push({ br: true, st: runStyleOf(el.parentElement, unit.el) });
        return;
      }
      if (el.tagName === 'IMG') {
        onImage(el);
        const gap = spacerFor(el, runStyleOf(el.parentElement || unit.el, unit.el));
        if (gap) { push(gap); runs.images.push(el); }
        return;
      }
      if (/^(UL|OL|TABLE)$/.test(el.tagName) || (el !== unit.el && el.tagName === 'DIV' && !el.classList.contains('resolved-var') && Array.from(el.children).some(child => BLOCK_TAGS.test(child.tagName)))) return;
      if (INVISIBLE.some(name => el.classList.contains(name)) || el.tagName === 'LABEL' || el.tagName === 'INPUT') return;
      if (el.classList.contains('page-number-badge')) { push({ field: true, st: runStyleOf(el, unit.el), format: el.getAttribute('data-format') || 'n' }); return; }
      if (el.classList.contains('resolved-checkbox')) { push({ text: el.textContent, st: Object.assign(runStyleOf(el, unit.el), { family: 'Segoe UI Symbol', pitch: 34 }) }); return; }
      Array.from(el.childNodes).forEach(walk);
    };
    Array.from(unit.el.childNodes).forEach(walk);
    return runs;
  }
  function runsXml(runs, slide, ctx) {
    return runs.map((run) => {
      if (run.br) return `<a:br>${runPropertiesXml(run.st, slide)}</a:br>`;
      if (run.field) {
        const suffix = run.format === 'n-slash-total' ? `<a:r>${runPropertiesXml(run.st, slide)}<a:t>/${ctx.slideCount}</a:t></a:r>` : '';
        const prefix = run.format === 'page-n' ? `<a:r>${runPropertiesXml(run.st, slide)}<a:t>Page </a:t></a:r>` : '';
        return `${prefix}<a:fld id="${guid(slide.number)}" type="slidenum">${runPropertiesXml(run.st, slide)}<a:t>${slide.number}</a:t></a:fld>${suffix}`;
      }
      return `<a:r>${runPropertiesXml(run.st, slide)}<a:t>${esc(run.text)}</a:t></a:r>`;
    }).join('');
  }

  const ALIGNS = { left: 'l', start: 'l', right: 'r', end: 'r', center: 'ctr', justify: 'just' };
  // La puce ou le numéro de l'éditeur est de la taille du début du texte de son point, ou à défaut de celle de l'élément de liste (`marker` : { sz } sa taille en centièmes de point, `size` celle de la première série de caractères) :
  // en pourcentage de ce texte. Sa couleur n'a rien à dire : PowerPoint la prend à la première série de caractères, comme l'éditeur.
  function bulletXml(list, unit, size) {
    if (!list || !unit.bullet) return '<a:buNone/>';
    const marker = unit.marker && size ? clampInt(unit.marker / size * 100000, 25000, 400000) : 100000;
    const scale = Math.abs(marker - 100000) > 3000 ? `<a:buSzPct val="${marker}"/>` : '';
    if (unit.task) return `${scale}<a:buFont typeface="Segoe UI Symbol"/><a:buChar char="${unit.task === 'done' ? '☑' : '☐'}"/>`;
    if (list.ordered) return `${scale}<a:buFont typeface="+mj-lt"/><a:buAutoNum type="${list.numbering}"${list.start !== 1 ? ` startAt="${list.start}"` : ''}/>`;
    const [font, char] = BULLETS[list.glyph] || BULLETS.disc;
    return `${scale}<a:buFont typeface="${font}"/><a:buChar char="${char}"/>`;
  }
  // Les propriétés d'un paragraphe (`a:pPr`) : retrait depuis la gauche du bloc, alignement, interligne (en pourcentage de la ligne simple de la police), espace avant (l'écart mesuré avec le paragraphe
  // précédent) et puce. Le niveau d'une liste est celui de ses sous-listes.
  function paragraphPropertiesXml(unit, pos, extra = {}) {
    const cs = computedOf(unit.el);
    const attrs = [];
    // Le retrait de la puce : celui de l'éditeur, élargi de ce qu'il manque pour que la puce ou le numéro tienne devant le texte (sinon PowerPoint reporte le texte au taquet suivant) ; tous les paragraphes de
    // l'élément suivent, pour rester alignés.
    const measured = unit.list ? Math.max(0, unit.rect.left - unit.list.left) : 0;
    const room = unit.list && unit.marker ? unit.marker / 100 * (unit.list.ordered ? 1.7 : 1.1) * PT_TO_PX : 0;
    const widen = Math.max(0, room - measured);
    // Les retraits de « Paragraphe… » (js/paragraph-format.js) d'un paragraphe libre : le remplissage à gauche, que sa boîte mesurée compte mais pas le texte, s'ajoute au retrait ; le retrait de
    // la première ligne (`text-indent`, négatif s'il est suspendu) est l'`indent` de PowerPoint. Dans une liste et une citation les deux sont à zéro (la feuille de style les y neutralise).
    const free = !unit.list && unit.el.tagName === 'P';
    const padLeft = free ? parseFloat(cs.paddingLeft) || 0 : 0;
    const firstLine = free ? parseFloat(cs.textIndent) || 0 : 0;
    const marL = Math.max(0, unit.rect.left - pos.originLeft) + widen + padLeft;
    const hang = unit.list && unit.bullet ? measured + widen : 0;
    if (marL > 0.5) attrs.push(`marL="${pxEmu(marL)}"`);
    if (hang > 0.5) attrs.push(`indent="${-pxEmu(hang)}"`);
    else if (Math.abs(firstLine) > 0.5) attrs.push(`indent="${pxEmu(firstLine)}"`);
    else if (unit.list) attrs.push('indent="0"');
    if (unit.list) attrs.push(`lvl="${Math.min(8, unit.list.level)}"`);
    const align = ALIGNS[cs.textAlign];
    if (align && align !== 'l') attrs.push(`algn="${align}"`);
    const lh = parseFloat(cs.lineHeight);
    const fs = parseFloat(cs.fontSize);
    const children = [];
    if (extra.exactPt) children.push(`<a:lnSpc><a:spcPts val="${clampInt(extra.exactPt * 100, 100, 1584000)}"/></a:lnSpc>`);
    else if (cs.lineHeight !== 'normal' && lh > 0 && fs > 0) children.push(`<a:lnSpc><a:spcPct val="${clampInt(lh / fs / NATURAL_LINE * 100000, 20000, 500000)}"/></a:lnSpc>`);
    // L'espace avant : l'écart mesuré avec le paragraphe d'avant plus l'espace avant que « Paragraphe… » (js/paragraph-format.js) a posé en haut du paragraphe - un remplissage, que sa boîte mesurée compte ;
    // l'espace après : celui qu'une image haute rend (`extra.afterPt`) plus l'espace après posé en bas.
    const beforePx = (pos.gapPx || 0) + (parseFloat(cs.paddingTop) || 0);
    const afterPt = (extra.afterPt || 0) + (parseFloat(cs.paddingBottom) || 0) * PX_TO_PT;
    if (beforePx > 0.5) children.push(`<a:spcBef><a:spcPts val="${clampInt(beforePx * PX_TO_PT * 100, 0, 158400)}"/></a:spcBef>`);
    children.push(`<a:spcAft><a:spcPts val="${clampInt(afterPt * 100, 0, 158400)}"/></a:spcAft>`);
    children.push(unit.list ? bulletXml(unit.list, unit, extra.size) : '<a:buNone/>');
    return `<a:pPr ${attrs.join(' ')}>${children.join('')}</a:pPr>`;
  }
  // Ce qu'une image plus haute que la ligne ajoute à la hauteur du paragraphe dans l'éditeur (une seule fois par ligne : les images d'une même ligne ont le même bas) : PowerPoint n'en sait rien, le texte suivant
  // s'écrirait sous l'image, par-dessus. Un paragraphe d'une seule ligne a cette ligne-là à la hauteur de l'éditeur (`exactPt` : le texte en bas de la ligne, à côté du bas de l'image, comme à l'écran) ; sinon
  // l'espace après le paragraphe rend la place (`afterPt`).
  function imageExtra(images, unit) {
    const cs = computedOf(unit.el);
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.42 || 0;
    // La hauteur du texte seul : les espaces que « Paragraphe… » pose en haut et en bas du paragraphe sont des remplissages de sa boîte, qu'une ligne d'image ne remplit pas.
    const padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const tallest = new Map();
    images.forEach((img) => {
      const r = img.getBoundingClientRect();
      const key = Math.round(r.bottom);
      tallest.set(key, Math.max(tallest.get(key) || 0, r.height));
    });
    let extra = 0;
    let tall = 0;
    tallest.forEach((height) => { extra += Math.max(0, height - lineHeight); tall = Math.max(tall, height); });
    if (!extra) return { afterPt: 0, exactPt: 0 };
    return unit.rect.height - padding - tall < lineHeight * 0.9 ? { afterPt: 0, exactPt: (unit.rect.height - padding) * PX_TO_PT } : { afterPt: extra * PX_TO_PT, exactPt: 0 };
  }
  function paragraphXml(unit, pos, slide, ctx) {
    const runs = runsOf(unit, img => slide.noteImage(img));
    const base = runs.length ? runs[runs.length - 1].st : runStyleOf(unit.el, unit.el);
    const first = runs.find(run => run.st);
    const extra = Object.assign({ size: first ? first.st.sz : base.sz }, imageExtra(runs.images, unit));
    return `<a:p>${paragraphPropertiesXml(unit, pos, extra)}${runsXml(runs, slide, ctx)}${endRunXml(base, slide)}</a:p>`;
  }
  // Les paragraphes d'une suite d'unités, de gauche à `originLeft` (px) : l'écart avec l'unité d'avant devient l'espace avant.
  function paragraphsXml(units, originLeft, slide, ctx) {
    return units.map((unit, i) => paragraphXml(unit, { originLeft, gapPx: i ? Math.max(0, unit.rect.top - units[i - 1].rect.bottom) : 0 }, slide, ctx)).join('') || '<a:p><a:endParaRPr lang="en-US"/></a:p>';
  }
  const hasText = unit => unit.el.textContent.replace(/[\s ]+/g, '') !== '' || unit.el.querySelector('img, .page-number-badge') !== null;

  // --- Les unités de texte : chaque paragraphe (ou point de liste) de l'éditeur avec son rectangle, mesuré tant que l'hôte est attaché. ----------------------------------------------------------------------
  function listInfo(el, parent) {
    const cs = computedOf(el);
    const ordered = el.tagName === 'OL';
    const start = ordered ? (parseInt(el.getAttribute('start'), 10) || 1) : 1;
    return {
      ordered, start, level: parent ? parent.level + 1 : 0, left: 0,
      numbering: NUMBERING[cs.listStyleType] || 'arabicPeriod',
      glyph: BULLETS[cs.listStyleType] ? cs.listStyleType : 'disc',
      task: el.getAttribute('data-type') === 'taskList',
    };
  }
  function collectUnits(el, acc, scope, list) {
    const tag = el.tagName;
    if (tag === 'UL' || tag === 'OL') {
      const info = listInfo(el, list);
      info.left = scope.box(el).left;
      Array.from(el.children).forEach((item) => { if (item.tagName === 'LI') collectItem(item, acc, scope, info); });
      return;
    }
    if (tag === 'BLOCKQUOTE' || (tag === 'DIV' && Array.from(el.children).some(child => BLOCK_TAGS.test(child.tagName)))) {
      Array.from(el.children).forEach(child => collectUnits(child, acc, scope, null));
      return;
    }
    acc.push({ el, rect: scope.box(el), outer: scope.outer(el), list: null, bullet: false });
  }
  function collectItem(li, acc, scope, list) {
    let first = true;
    const blocks = Array.from(li.children).filter(child => child.tagName !== 'LABEL' && child.tagName !== 'INPUT');
    const checked = li.getAttribute('data-checked') === 'true' ? 'done' : 'todo';
    // La taille de la puce : celle que l'éditeur lui donne, la taille du début du texte du point quand il en a une (js/list-markers.js, posée sur l'hôte de mesure), sinon celle du point - qui est aussi
    // la seule d'un point de liste à cases, qui n'a pas de `::marker`.
    const ownMarkerPx = parseFloat(getComputedStyle(li, '::marker').fontSize);
    const marker = sizeOf(ownMarkerPx > 0 ? ownMarkerPx : computedOf(li).fontSize);
    const leaf = (el, bullet) => ({ el, rect: scope.box(el), outer: scope.outer(el), list, bullet, marker, task: list.task && bullet ? checked : null });
    if (!blocks.some(child => BLOCK_TAGS.test(child.tagName))) { acc.push(leaf(li, true)); return; }
    blocks.forEach((child) => {
      if (child.tagName === 'UL' || child.tagName === 'OL') { collectUnits(child, acc, scope, list); return; }
      if (child.tagName === 'DIV' && Array.from(child.children).some(c => BLOCK_TAGS.test(c.tagName))) {
        Array.from(child.children).forEach((c) => {
          if (c.tagName === 'UL' || c.tagName === 'OL') collectUnits(c, acc, scope, list);
          else if (/^(P|H[1-6]|PRE)$/.test(c.tagName)) { acc.push(leaf(c, first)); first = false; }
        });
        return;
      }
      if (/^(P|H[1-6]|DIV|PRE)$/.test(child.tagName)) { acc.push(leaf(child, first)); first = false; }
    });
  }


  // --- Les objets d'une diapositive ----------------------------------------------------------------------------------------------------------------------------------------------------------------
  function xfrmXml(x, y, w, h, extra = '') {
    return `<a:xfrm${extra}><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.max(0, Math.round(w))}" cy="${Math.max(0, Math.round(h))}"/></a:xfrm>`;
  }
  const insetsXml = (t, r, b, l) => `wrap="square" lIns="${emu(l)}" tIns="${emu(t)}" rIns="${emu(r)}" bIns="${emu(b)}" rtlCol="0"`;
  // Le STYLE du trait (`dash`, `cap`, `cmpd` : js/shape-geometry.js) : le bout et le type composé sont des attributs de `a:ln` (`cap` : `rnd`, `sq`, le bout plat étant celui de PowerPoint sans rien écrire ;
  // `cmpd` : `dbl`, `thinThick`, `thickThin`, `tri`, le trait simple étant celui d'origine), le tiret son enfant après le remplissage (`a:prstDash val`, ou `a:custDash` et ses `a:ds d sp`, en millièmes de
  // pour cent de l'épaisseur du trait) ; sans tiret, `solid`.
  const LINE_CAPS = { round: 'rnd', square: 'sq' };
  function dashXml(dash) {
    const spec = ShapeGeometry.dashDrawingMl(dash);
    if (!spec) return '<a:prstDash val="solid"/>';
    return spec.preset ? `<a:prstDash val="${spec.preset}"/>` : `<a:custDash>${spec.custom.map(({ d, sp }) => `<a:ds d="${d}" sp="${sp}"/>`).join('')}</a:custDash>`;
  }
  const lineXml = (hex, widthPt, extra = '', tr = 0, style = null) => `<a:ln w="${emu(widthPt)}"${style && LINE_CAPS[style.cap] ? ` cap="${LINE_CAPS[style.cap]}"` : ''}${style && ShapeGeometry.cmpdOf(style.cmpd) ? ` cmpd="${ShapeGeometry.cmpdOf(style.cmpd)}"` : ''}>${fillXml(hex, tr)}${dashXml(style && style.dash)}${extra}</a:ln>`;
  const nameOf = (slide, key, id) => esc(`${I18n.t('pptx.name.' + key)} ${id - 1}`);

  // Un bloc de texte : l'espace réservé « Titre » (`title`) ou une zone de texte. Sa boîte est celle que le texte occupe dans l'éditeur ; elle grandit avec le texte (`spAutoFit`) quand PowerPoint le réécrit.
  function textBoxXml(slide, box, paragraphs, title) {
    const id = slide.takeId();
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${nameOf(slide, title ? 'title' : 'text', id)}"/><p:cNvSpPr${title ? '><a:spLocks noGrp="1"/></p:cNvSpPr>' : ' txBox="1"/>'}<p:nvPr>${title ? '<p:ph type="title"/>' : ''}</p:nvPr></p:nvSpPr>`
      + `<p:spPr>${xfrmXml(emu(box.x), emu(box.y), emu(box.w), emu(box.h))}${title ? '' : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>'}</p:spPr>`
      + `<p:txBody><a:bodyPr ${insetsXml(0, 0, 0, 0)} anchor="t">${title ? '<a:noAutofit/>' : '<a:spAutoFit/>'}</a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
  }
  // Un trait droit (connecteur) de (x1, y1) à (x2, y2), en points sur la diapositive : la ligne prédéfinie de PowerPoint va du coin haut gauche au coin bas droit de sa boîte, `flip` la retourne.
  function connectorXml(slide, box, hex, widthPt, flip, ends, key, tr, style) {
    const id = slide.takeId();
    const flips = (flip.includes('h') ? ' flipH="1"' : '') + (flip.includes('v') ? ' flipV="1"' : '');
    const tip = (name, type, w, len) => (type ? `<a:${name} type="${type}" w="${w || 'med'}" len="${len || 'med'}"/>` : '');
    const tips = ends ? tip('headEnd', ends.head, ends.headW, ends.headLen) + tip('tailEnd', ends.tail, ends.tailW, ends.tailLen) : '';
    return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${nameOf(slide, key || 'line', id)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>`
      + `<p:spPr>${xfrmXml(emu(box.x), emu(box.y), emu(box.w), emu(box.h), flips)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${lineXml(hex, widthPt, tips, tr, style)}</p:spPr></p:cxnSp>`;
  }
  function pictureXml(slide, media, box, img, rot) {
    const id = slide.takeId();
    const link = img.closest ? img.closest('a[href]') : null;
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${nameOf(slide, 'picture', id)}" descr="${esc(img.getAttribute('alt') || '')}">${link ? slide.linkXml(link) : ''}</p:cNvPr>`
      + '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
      + `<p:blipFill><a:blip r:embed="${slide.relFor(REL + 'image', '../media/' + media.name)}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
      + `<p:spPr>${xfrmXml(emu(box.x), emu(box.y), emu(box.w), emu(box.h), rot ? ` rot="${Math.round(rot * 60000)}"` : '')}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }

  // --- Les images : lues une fois (une même image deux fois dans le fichier n'y est qu'une fois), en PNG, JPEG ou GIF ; tout autre format est redessiné en PNG ------------------------------------------------------
  async function mediaFor(img, ctx) {
    const src = (img.getAttribute('src') || '').trim();
    if (!src) { ExportCommon.noteImageWithoutSource(img); return null; }
    if (!ctx.media.has(src)) {
      ctx.media.set(src, (async () => {
        let blob;
        try { blob = await ImageIo.fetchBlob(src); }
        catch (e) { console.warn('[PptxExport] image ignorée (téléchargement impossible) :', src.slice(0, 80), e); ExportCommon.noteUnreadImage(img); return null; }
        let ext = IMAGE_TYPES[blob.type];
        let ratio;
        if (ext) {
          ratio = await ImageIo.load(blob).then(image => (image.naturalWidth && image.naturalHeight ? image.naturalHeight / image.naturalWidth : 0.75), () => 0.75);
        } else {
          try {
            const canvas = await ImageIo.draw(blob);
            blob = await ImageIo.pngBlob(canvas);
            ext = 'png';
            ratio = canvas.height / canvas.width;
          } catch (e) { console.warn('[PptxExport] image ignorée (rastérisation impossible) :', src.slice(0, 80), e); ExportCommon.noteUnreadImage(img); return null; }
        }
        const media = { name: 'image' + (ctx.mediaList.length + 1) + '.' + ext, ext, ratio, data: await blob.arrayBuffer() };
        ctx.mediaList.push(media);
        return media;
      })());
    }
    return ctx.media.get(src);
  }

  // --- La mesure : tout se lit sur l'hôte attaché hors écran, depuis son coin haut gauche (le coin du texte de la page) ; les marges de la page y ajoutent leur part -------------------------------------------------
  // `at` : le coin haut gauche de `root` sur la diapositive, en points (par défaut celui du texte de la page ; pour un cadre libre, celui de son texte).
  function scopeFor(root, ctx, at) {
    const origin = root.getBoundingClientRect();
    const corner = at || { x: ctx.margins.left, y: ctx.margins.top };
    const scope = {
      origin, block: null,
      box(el) {
        const r = el.getBoundingClientRect();
        return { left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top, width: r.width, height: r.height };
      },
      outer() {
        const b = this.box(this.block);
        return { left: b.left, right: b.right };
      },
      // Un rectangle mesuré (px depuis le coin de l'hôte) en points sur la diapositive.
      onSlide(b) {
        return { x: corner.x + b.left * PX_TO_PT, y: corner.y + b.top * PX_TO_PT, w: b.width * PX_TO_PT, h: b.height * PX_TO_PT };
      },
    };
    return scope;
  }
  const isFrame = el => el.classList.contains('pp-free-frame');
  const isInvisible = el => INVISIBLE.some(name => el.classList.contains(name)) || /^(STYLE|SCRIPT)$/.test(el.tagName);

  // Les blocs d'un conteneur dans l'ordre : `flow` (texte, tableaux, images, filets, blocs de code), `frames` (cadres libres, rangés à part : ils sont au-dessus de tout). Une zone à deux colonnes et un bloc
  // qui n'en est que l'enveloppe se parcourent de l'intérieur : chaque bloc garde la place que l'éditeur lui a donnée.
  function walkBlocks(container, scope, found) {
    Array.from(container.children).forEach((el) => {
      if (isInvisible(el)) return;
      if (isFrame(el)) { found.frames.push(el); return; }
      const tag = el.tagName;
      if (tag === 'TABLE') { found.flow.push({ type: 'table', el }); return; }
      if (tag === 'IMG') { found.flow.push({ type: 'picture', el }); return; }
      if (tag === 'HR') { found.flow.push({ type: 'rule', el }); return; }
      if (tag === 'PRE') { found.flow.push({ type: 'code', el }); return; }
      if (tag === 'BLOCKQUOTE' && Array.from(el.children).some(child => child.tagName === 'TABLE')) { walkBlocks(el, scope, found); return; }
      if (tag === 'DIV' && (el.classList.contains('two-columns-zone') || el.classList.contains('hf-float-row') || Array.from(el.children).some(child => child.tagName === 'DIV' || child.tagName === 'TABLE' || child.tagName === 'IMG'))) { walkBlocks(el, scope, found); return; }
      if (!/^(P|H[1-6]|UL|OL|BLOCKQUOTE|DIV)$/.test(tag)) return;
      scope.block = el;
      const units = [];
      collectUnits(el, units, scope, null);
      found.flow.push({ type: 'text', units, el });
    });
  }
  // Les unités de texte qui se suivent dans la même colonne, sans remonter, font une seule zone de texte ; celles du début et de la fin qui n'ont rien à montrer (la ligne vide que laisse la frappe) sont
  // retirées : la zone commence au premier mot.
  function groupTexts(flow) {
    const out = [];
    let group = null;
    flow.forEach((item) => {
      if (item.type !== 'text') { group = null; out.push(item); return; }
      const units = item.units.slice();
      while (units.length && !hasText(units[0])) units.shift();
      while (units.length && !hasText(units[units.length - 1])) units.pop();
      if (!units.length) return;
      const last = group && group.units[group.units.length - 1];
      if (group && sameish(last.outer.left, units[0].outer.left) && sameish(last.outer.right, units[0].outer.right) && units[0].rect.top >= last.rect.bottom - 2) group.units.push(...units);
      else { group = { type: 'text', units, el: item.el }; out.push(group); }
    });
    return out;
  }
  const isHeadingUnit = unit => /^H[1-6]$/.test(unit.el.tagName) && !unit.list;

  // --- Les tableaux ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Le trait fin d'un tableau que personne n'a réglé : celui du PDF (js/pdf-export.js, TABLE_BORDER_COLOR et TABLE_LINE_PT), pas le gris clair de l'écran.
  const TABLE_BORDER = { hex: '777777', pt: 0.5 };
  function borderXml(tag, value) {
    if (value === TableBorders.NONE) return `<a:${tag} w="0"><a:noFill/></a:${tag}>`;
    const hex = value ? String(value).replace('#', '').toUpperCase() : TABLE_BORDER.hex;
    return `<a:${tag} w="${emu(TABLE_BORDER.pt)}" cap="flat" cmpd="sng" algn="ctr">${fillXml(hex)}<a:prstDash val="solid"/></a:${tag}>`;
  }
  // La largeur de chaque colonne, mesurée sur les cases qui n'en couvrent qu'une ; une colonne que seules des cases fusionnées couvrent prend sa part de la largeur qu'elles ont de plus.
  function columnWidthsOf(placed, count) {
    const widths = new Array(count).fill(null);
    placed.forEach(({ el, col, colspan }) => { if (colspan === 1 && widths[col] === null) widths[col] = el.getBoundingClientRect().width; });
    placed.forEach(({ el, col, colspan }) => {
      if (colspan === 1) return;
      const span = widths.slice(col, col + colspan);
      const unknown = span.filter(w => w === null).length;
      if (!unknown) return;
      const rest = Math.max(0, el.getBoundingClientRect().width - span.reduce((sum, w) => sum + (w || 0), 0));
      for (let i = col; i < col + colspan; i += 1) if (widths[i] === null) widths[i] = rest / unknown;
    });
    return widths.map(w => w || 0);
  }
  function cellXml(cell, owner, slide, ctx, scope, sides) {
    const cs = computedOf(cell);
    const found = { flow: [], frames: [] };
    walkBlocks(cell, scope, found);
    const units = found.flow.filter(item => item.type === 'text').flatMap(item => item.units);
    const pad = side => parseFloat(cs['padding' + side]) || 0;
    const contentLeft = scope.box(cell).left + pad('Left');
    const base = units.length ? '' : endRunXml(runStyleOf(cell, cell), slide);
    const paragraphs = units.length ? paragraphsXml(units, contentLeft, slide, ctx) : `<a:p>${base}</a:p>`;
    const fill = cell.style.backgroundColor && cssHex(cell.style.backgroundColor);
    const valign = ExportCommon.cellVerticalAlign(cell);
    const attrs = [];
    if (owner.colspan > 1) attrs.push(`gridSpan="${owner.colspan}"`);
    if (owner.rowspan > 1) attrs.push(`rowSpan="${owner.rowspan}"`);
    const edge = side => (sides ? sides[side] : null);
    return `<a:tc ${attrs.join(' ')}><a:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</a:txBody>`
      + `<a:tcPr marL="${pxEmu(pad('Left'))}" marR="${pxEmu(pad('Right'))}" marT="${pxEmu(pad('Top'))}" marB="${pxEmu(pad('Bottom'))}" anchor="${valign === 'middle' ? 'ctr' : (valign === 'bottom' ? 'b' : 't')}">`
      + `${borderXml('lnL', edge('left'))}${borderXml('lnR', edge('right'))}${borderXml('lnT', edge('top'))}${borderXml('lnB', edge('bottom'))}${fill ? fillXml(fill) : '<a:noFill/>'}</a:tcPr></a:tc>`;
  }
  const mergedCellXml = (hMerge, vMerge) => `<a:tc${hMerge ? ' hMerge="1"' : ''}${vMerge ? ' vMerge="1"' : ''}><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></a:txBody><a:tcPr/></a:tc>`;
  // `at` : le rectangle du tableau sur la diapositive (points), `place` le transforme (un cadre pivoté déplace son contenu).
  function tableXml(table, slide, ctx, scope, at) {
    const rows = ExportCommon.tableRows(table);
    const { placed, width: count } = ExportCommon.placeCells(rows);
    if (!placed.length || !count) return '';
    const widths = columnWidthsOf(placed, count);
    const heights = rows.map(tr => tr.getBoundingClientRect().height);
    const borders = ExportCommon.cellBorderSides(table);
    const grid = rows.map(() => new Array(count).fill(null));
    placed.forEach((owner) => {
      for (let dr = 0; dr < owner.rowspan; dr += 1) for (let dc = 0; dc < owner.colspan; dc += 1) grid[owner.row + dr][owner.col + dc] = { owner, dr, dc };
    });
    const body = rows.map((tr, r) => `<a:tr h="${pxEmu(heights[r])}">${grid[r].map((slot) => {
      if (!slot) return mergedCellXml(false, false);
      if (slot.dr || slot.dc) return mergedCellXml(slot.dc > 0, slot.dr > 0);
      return cellXml(slot.owner.el, slot.owner, slide, ctx, scope, borders && borders.get(slot.owner.el));
    }).join('')}</a:tr>`).join('');
    const id = slide.takeId();
    const total = widths.reduce((sum, w) => sum + w, 0);
    return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${nameOf(slide, 'table', id)}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>`
      + `<p:xfrm><a:off x="${emu(at.x)}" y="${emu(at.y)}"/><a:ext cx="${pxEmu(total)}" cy="${pxEmu(heights.reduce((sum, h) => sum + h, 0))}"/></p:xfrm>`
      + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${ExportCommon.headerRowCount(rows) ? ' firstRow="1"' : ''}/>`
      + `<a:tblGrid>${widths.map(w => `<a:gridCol w="${pxEmu(w)}"/>`).join('')}</a:tblGrid>${body}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  }

  // --- Les images d'un texte et de la diapositive ----------------------------------------------------------------------------------------------------------------------------------------------------
  // Une image dans le texte ou seule : à la place que l'éditeur lui donne ; en calque (devant ou derrière le texte) à la place de la grille de la page que l'éditeur a relevée (data-page-left-pt et data-page-top-pt,
  // depuis le coin du texte), à défaut à celle que le rendu lui donne. Taille : celle que l'image montre.
  async function pictureOf(img, slide, ctx, scope, place) {
    const media = await mediaFor(img, ctx);
    if (!media) return null;
    const layer = img.getAttribute('data-layer');
    const shown = scope.box(img);
    const styleWidth = parseFloat(img.style.width) * PX_TO_PT;
    let w = shown.width > 0 ? shown.width * PX_TO_PT : (styleWidth || 240);
    let h = shown.height > 0 ? shown.height * PX_TO_PT : w * media.ratio;
    const at = scope.onSlide(shown);
    let x = at.x;
    let y = at.y;
    const gridLeft = parseFloat(img.getAttribute('data-page-left-pt'));
    const gridTop = parseFloat(img.getAttribute('data-page-top-pt'));
    if ((layer === 'front' || layer === 'behind') && Number.isFinite(gridLeft) && Number.isFinite(gridTop)) {
      x = ctx.margins.left + gridLeft;
      y = ctx.margins.top + gridTop;
      if (!(shown.width > 0)) { w = styleWidth || w; h = w * media.ratio; }
    }
    const placed = place ? place({ x, y, w, h }) : { x, y, w, h, rot: 0 };
    return { layer, xml: pictureXml(slide, media, placed, img, placed.rot) };
  }
  function putPicture(slide, picture) {
    if (!picture) return;
    (picture.layer === 'behind' ? slide.shapes.back : (picture.layer === 'front' ? slide.shapes.front : slide.shapes.flow)).push(picture.xml);
  }

  // --- Les cadres libres, les formes et les traits (js/free-frame.js) ---------------------------------------------------------------------------------------------------------------------------
  const FRAME_CONTENT = ':scope > .pp-free-frame-box > .pp-free-frame-content';
  function rotatedAbout(box, centre, degrees) {
    if (!degrees) return Object.assign({ rot: 0 }, box);
    const turn = degrees * Math.PI / 180;
    const cx = box.x + box.w / 2 - centre.x;
    const cy = box.y + box.h / 2 - centre.y;
    const nx = centre.x + cx * Math.cos(turn) - cy * Math.sin(turn);
    const ny = centre.y + cx * Math.sin(turn) + cy * Math.cos(turn);
    return { x: nx - box.w / 2, y: ny - box.h / 2, w: box.w, h: box.h, rot: degrees };
  }
  // Les coins du trait d'une forme de la norme : en onglet, à la limite que l'éditeur dessine (ShapePresets.MITER_LIMIT, en cent-millièmes).
  const MITER_XML = `<a:miter lim="${ShapePresets.MITER_LIMIT * 100000}"/>`;
  // Les réglages d'une forme de la norme (`adj`, js/shape-presets.js) en `a:avLst` : un `a:gd` (« val 25000 ») par réglage qui n'est pas celui d'origine.
  // Un arbre de ShapePresets.customTree écrit en XML.
  const treeXml = node => `<${node.n}${Object.keys(node.a).map(key => ` ${key}="${node.a[key]}"`).join('')}${node.c.length ? `>${node.c.map(treeXml).join('')}</${node.n}>` : '/>'}`;
  // La géométrie d'une forme : `a:custGeom` pour une forme libre, `a:prstGeom` (son nom et ses réglages) sinon.
  function geometryXml(kind, adj) {
    const tree = ShapePresets.customTree(kind);
    return tree ? treeXml(tree) : `<a:prstGeom prst="${kind || 'rect'}">${avLstXml(kind, adj)}</a:prstGeom>`;
  }
  function avLstXml(kind, adj) {
    const kept = adj ? ShapePresets.adjOf(kind, adj) : {};
    const guides = Object.keys(ShapePresets.adjDefaults(kind)).filter(key => key in kept).map(key => `<a:gd name="${key}" fmla="val ${kept[key]}"/>`);
    return guides.length ? `<a:avLst>${guides.join('')}</a:avLst>` : '<a:avLst/>';
  }
  async function frameXml(frame, slide, ctx) {
    const content = frame.querySelector(FRAME_CONTENT);
    if (!content) return;
    const attrs = FreeFrame.measuresOf(frame);
    if (frame.hasAttribute(FreeFrame.BACKGROUND_ATTR)) { if (attrs.fill) slide.background = attrs.fill; return; }
    const firstId = slide.nextShapeId;
    // « Derrière le texte » : la forme passe avant le texte dans la diapositive, donc derrière lui (slideXml) ; les images que le cadre porte la suivent.
    const out = attrs.layer === FreeFrame.LAYER_BEHIND ? slide.shapes.behindFrames : slide.shapes.frames;
    if (attrs.shape === ShapeGeometry.LINE) {
      out.push(connectorXml(slide, { x: attrs.x, y: attrs.y, w: attrs.w, h: attrs.h }, String(attrs.line).replace('#', '').toUpperCase(), FreeFrame.lineWidthOf(attrs), ShapeGeometry.flipOf(attrs.flip), { head: attrs.head, tail: attrs.tail, headW: attrs.headW, headLen: attrs.headLen, tailW: attrs.tailW, tailLen: attrs.tailLen }, 'line', attrs.lineTr, attrs));
      slide.animate(attrs.anim, firstId, slide.nextShapeId - 1, 0);
      return;
    }
    const boxEl = content.parentElement;
    const savedTurn = boxEl.style.transform;
    boxEl.style.transform = 'none';
    try {
      const boxRect = boxEl.getBoundingClientRect();
      const inside = contentRect(content, boxRect);
      const scope = scopeFor(content, ctx, { x: attrs.x + inside.left * PX_TO_PT, y: attrs.y + inside.top * PX_TO_PT });
      const style = computedOf(content);
      const pad = side => (parseFloat(style['padding' + side]) || 0) * PX_TO_PT;
      const edge = FreeFrame.lineWidthOf(attrs);
      const half = edge / 2;
      const heightPt = Math.max(attrs.h, boxRect.height * PX_TO_PT);
      const found = { flow: [], frames: [] };
      walkBlocks(content, scope, found);
      const units = found.flow.filter(item => item.type === 'text').flatMap(item => item.units);
      const paragraphs = paragraphsXml(units, scope.box(content).left + pad('Left') * PT_TO_PX, slide, ctx);
      // La bulle de PowerPoint a pour boîte son corps, sa queue en dépasse : la boîte du cadre, queue comprise, en est la part BUBBLE_BODY de haut.
      const bodyPt = attrs.shape === 'wedgeRoundRectCallout' ? heightPt * ShapeGeometry.BUBBLE_BODY : heightPt;
      const turn = attrs.rot * Math.PI / 180;
      const bodyGap = (bodyPt - heightPt) / 2;
      const turnedX = attrs.rot ? -Math.sin(turn) * bodyGap : 0;
      const turnedY = attrs.rot ? (Math.cos(turn) - 1) * bodyGap : 0;
      const insets = attrs.shape ? ShapeGeometry.textInsets('rect', attrs.w, attrs.h, 0) : ['Top', 'Right', 'Bottom', 'Left'].map(side => Math.max(0, pad(side) - half));
      // Une forme de la norme (le cylindre, le cœur... ; ou l'une des seize à réglages) : la boîte de sa géométrie, que le trait, les pointes des coins ou la queue d'une bulle débordent dans le
      // cadre (ShapeGeometry.presetPlace), et ses réglages.
      const preset = ShapeGeometry.drawnByPresets(attrs.shape, attrs.adj);
      const place = preset ? ShapeGeometry.presetPlace(attrs, heightPt, edge) : { x: attrs.x + half + turnedX, y: attrs.y + half + turnedY, w: attrs.w - edge, h: bodyPt - edge };
      const id = slide.takeId();
      out.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${nameOf(slide, attrs.shape ? 'shape' : 'text', id)}"/><p:cNvSpPr${attrs.shape ? '' : ' txBox="1"'}/><p:nvPr/></p:nvSpPr>`
        + `<p:spPr>${xfrmXml(emu(place.x), emu(place.y), emu(place.w), emu(place.h), attrs.rot ? ` rot="${Math.round(attrs.rot * 60000)}"` : '')}`
        + `${geometryXml(attrs.shape, preset ? attrs.adj : '')}${attrs.fill ? fillXml(attrs.fill.replace('#', '').toUpperCase(), attrs.fillTr) : '<a:noFill/>'}${edge ? lineXml(attrs.line.replace('#', '').toUpperCase(), edge, preset ? MITER_XML : '', attrs.lineTr, attrs) : '<a:ln><a:noFill/></a:ln>'}</p:spPr>`
        + `<p:txBody><a:bodyPr ${insetsXml(insets[0], insets[1], insets[2], insets[3])} anchor="${attrs.shape ? 'ctr' : 't'}">${attrs.shape ? '<a:noAutofit/>' : '<a:spAutoFit/>'}</a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`);
      // Ce que le cadre porte et qui n'est pas du texte (une image, un tableau) devient un objet de la diapositive, à sa place dans le cadre, tourné avec lui.
      const centre = { x: attrs.x + attrs.w / 2, y: attrs.y + heightPt / 2 };
      for (const item of found.flow) {
        if (item.type === 'picture') {
          const media = await mediaFor(item.el, ctx);
          if (media) out.push(pictureXml(slide, media, rotatedAbout(scope.onSlide(scope.box(item.el)), centre, attrs.rot), item.el, attrs.rot));
        } else if (item.type === 'table') {
          const b = rotatedAbout(scope.onSlide(scope.box(item.el)), centre, attrs.rot);
          out.push(tableXml(item.el, slide, ctx, scope, b));
        }
      }
      await flushInlineImages(slide, ctx, scope, box => rotatedAbout(box, centre, attrs.rot), out);
      slide.animate(attrs.anim, firstId, slide.nextShapeId - 1, id);
    } finally { boxEl.style.transform = savedTurn; }
  }
  function contentRect(content, boxRect) {
    const r = content.getBoundingClientRect();
    return { left: r.left - boxRect.left, top: r.top - boxRect.top };
  }
  // Les images trouvées dans les paragraphes, posées après le texte qui les porte.
  async function flushInlineImages(slide, ctx, scope, place, into) {
    const images = slide.pendingImages.splice(0);
    for (const img of images) {
      const picture = await pictureOf(img, slide, ctx, scope, place);
      if (!picture) continue;
      if (into && picture.layer !== 'behind' && picture.layer !== 'front') into.push(picture.xml); else putPicture(slide, picture);
    }
  }

  // --- La diapositive : fond, transition, notes -----------------------------------------------------------------------------------------------------------------------------------------------
  // Le sens d'une transition à côté (`from`, le côté d'où la diapositive arrive à l'écran) dans le mot de PowerPoint.
  const DIRECTIONS = {
    push: { r: 'l', l: 'r', t: 'd', b: 'u' },
    wipe: { r: 'l', l: 'r', t: 'd', b: 'u' },
    cover: { r: 'l', l: 'r', t: 'd', b: 'u' },
    uncover: { r: 'l', l: 'r', t: 'd', b: 'u' },
    // Division : `orient` (la ligne du milieu) et `dir` ; stores : `dir` (le sens des lames).
    split: { r: 'orient="vert" dir="out"', l: 'orient="vert" dir="in"', b: 'orient="horz" dir="out"', t: 'orient="horz" dir="in"' },
    blinds: { r: 'horz', b: 'vert' },
  };
  function transitionXml(props) {
    if (!props) return '';
    // Le passage seul à la suivante (`advance`, en millisecondes) : `advTm` de la transition, avec ou sans effet.
    const timing = props.advance ? ` advTm="${props.advance}"` : '';
    if (!props.transition) return timing ? `<p:transition${timing}/>` : '';
    const effect = {
      fade: () => '<p:fade/>',
      push: () => `<p:push dir="${DIRECTIONS.push[props.from]}"/>`,
      wipe: () => `<p:wipe dir="${DIRECTIONS.wipe[props.from]}"/>`,
      cover: () => `<p:cover dir="${DIRECTIONS.cover[props.from]}"/>`,
      uncover: () => `<p:pull dir="${DIRECTIONS.uncover[props.from]}"/>`,
      zoom: () => '<p:zoom dir="in"/>',
      split: () => `<p:split ${DIRECTIONS.split[props.from]}/>`,
      blinds: () => `<p:blinds dir="${DIRECTIONS.blinds[props.from]}"/>`,
      circle: () => '<p:circle/>',
      diamond: () => '<p:diamond/>',
      plus: () => '<p:plus/>',
    }[props.transition]();
    const speed = props.dur <= 500 ? 'fast' : (props.dur <= 1000 ? 'med' : 'slow');
    return '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
      + `<mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14"><p:transition spd="${speed}" p14:dur="${props.dur}"${timing}>${effect}</p:transition></mc:Choice>`
      + `<mc:Fallback><p:transition spd="${speed}"${timing}>${effect}</p:transition></mc:Fallback></mc:AlternateContent>`;
  }
  // Les animations d'objets (js/frame-anim.js) : `p:timing`, la suite de la diapositive rangée en pas (FrameAnim.stepsOf) comme PowerPoint la range - un `p:par` par clic, dedans un par groupe qui part
  // ensemble (au clic, ou après la précédente), dedans un par effet. Les préréglages de PowerPoint : apparition (1), fondu (10), volée (2), balayage (22), zoom (53).
  const ANIM_PRESET = { appear: 1, fade: 10, fly: 2, wipe: 22, zoom: 53 };
  const ANIM_SUBTYPE = { fly: { t: 1, r: 2, b: 4, l: 8 }, wipe: { t: 1, r: 2, b: 4, l: 8 }, zoom: { '': 16 } };
  const ANIM_WIPE = { t: 'up', b: 'down', l: 'left', r: 'right' };
  const ANIM_NODE = { click: 'clickEffect', with: 'withEffect', after: 'afterEffect' };
  const ANIM_EDGE = { l: ['ppt_x', '0-#ppt_w/2'], r: ['ppt_x', '1+#ppt_w/2'], t: ['ppt_y', '0-#ppt_h/2'], b: ['ppt_y', '1+#ppt_h/2'] };
  function behaviorsXml(a, id, nextId) {
    const target = `<p:tgtEl><p:spTgt spid="${id}"/></p:tgtEl>`;
    const visible = `<p:set><p:cBhvr><p:cTn id="${nextId()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${a.exit && a.effect !== 'appear' ? a.dur : 0}"/></p:stCondLst></p:cTn>${target}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${a.exit ? 'hidden' : 'visible'}"/></p:to></p:set>`;
    const filter = name => `<p:animEffect transition="${a.exit ? 'out' : 'in'}" filter="${name}"><p:cBhvr><p:cTn id="${nextId()}" dur="${a.dur}"/>${target}</p:cBhvr></p:animEffect>`;
    const move = (attr, from, to) => `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${nextId()}" dur="${a.dur}" fill="hold"/>${target}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr>`
      + `<p:tavLst><p:tav tm="0"><p:val><p:strVal val="${a.exit ? to : from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${a.exit ? from : to}"/></p:val></p:tav></p:tavLst></p:anim>`;
    if (a.effect === 'appear') return visible;
    if (a.effect === 'fade') return visible + filter('fade');
    if (a.effect === 'wipe') return visible + filter(`wipe(${ANIM_WIPE[a.side]})`);
    if (a.effect === 'zoom') return visible + move('ppt_w', '0', '#ppt_w') + move('ppt_h', '0', '#ppt_h') + filter('fade');
    const [axis, edge] = ANIM_EDGE[a.side];
    const still = axis === 'ppt_x' ? 'ppt_y' : 'ppt_x';
    const moving = move(axis, edge, '#' + axis);
    const fixed = move(still, '#' + still, '#' + still);
    return visible + (axis === 'ppt_x' ? moving + fixed : fixed + moving);
  }
  function timingXml(slide) {
    const items = [];
    slide.animations.forEach((one) => {
      for (let id = one.first; id <= one.last; id += 1) items.push({ anim: id === one.first ? one.anim : Object.assign({}, one.anim, { start: 'with' }), id, shape: id === one.shape });
    });
    if (!items.length) return '';
    const { steps } = FrameAnim.stepsOf(items);
    let counter = 2;
    const nextId = () => { counter += 1; return counter; };
    const built = [];
    steps.forEach((step, k) => {
      if (!step.length) return;
      const stepId = nextId();
      const groups = [];
      step.forEach((entry) => {
        const a = entry.anim;
        const item = items[entry.index];
        if (a.start !== 'with' || !groups.length) groups.push({ delay: entry.begin - a.delay, effects: [] });
        groups[groups.length - 1].effects.push({ a, item });
      });
      const groupXml = groups.map((group) => {
        const groupId = nextId();
        const effects = group.effects.map(({ a, item }) => {
          const effectId = nextId();
          const subtype = (ANIM_SUBTYPE[a.effect] || {})[a.side] || 0;
          const inner = behaviorsXml(a, item.id, nextId);
          return `<p:par><p:cTn id="${effectId}" presetID="${ANIM_PRESET[a.effect]}" presetClass="${a.exit ? 'exit' : 'entr'}" presetSubtype="${subtype}" fill="hold"${item.shape ? ' grpId="0"' : ''} nodeType="${ANIM_NODE[a.start]}">`
            + `<p:stCondLst><p:cond delay="${a.delay}"/></p:stCondLst><p:childTnLst>${inner}</p:childTnLst></p:cTn></p:par>`;
        }).join('');
        return `<p:par><p:cTn id="${groupId}" fill="hold"><p:stCondLst><p:cond delay="${group.delay}"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par>`;
      }).join('');
      // Le pas 0 part seul à l'arrivée sur la diapositive ; les autres attendent un clic.
      const start = k === 0 ? '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : '<p:cond delay="indefinite"/>';
      built.push(`<p:par><p:cTn id="${stepId}" fill="hold"><p:stCondLst>${start}</p:stCondLst><p:childTnLst>${groupXml}</p:childTnLst></p:cTn></p:par>`);
    });
    const builds = items.filter(item => item.shape).map(item => `<p:bldP spid="${item.id}" grpId="0" animBg="1"/>`).join('');
    return '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
      + `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${built.join('')}</p:childTnLst></p:cTn>`
      + '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
      + `</p:childTnLst></p:cTn></p:par></p:tnLst>${builds ? `<p:bldLst>${builds}</p:bldLst>` : ''}</p:timing>`;
  }
  function slideXml(slide) {
    const shapes = slide.shapes.behindFrames.concat(slide.shapes.back, slide.shapes.flow, slide.shapes.front, slide.shapes.frames).join('');
    const background = slide.background ? `<p:bg><p:bgPr>${fillXml(slide.background.replace('#', '').toUpperCase())}<a:effectLst/></p:bgPr></p:bg>` : '';
    return XML_HEAD + `<p:sld ${ROOT_NS}${slide.props && slide.props.hidden ? ' show="0"' : ''}><p:cSld>${background}<p:spTree>${GROUP_PROPERTIES}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transitionXml(slide.props)}${timingXml(slide)}</p:sld>`;
  }
  function notesSlideXml(slide) {
    const lines = String(slide.props.notes).split('\n');
    const paragraphs = lines.map(line => (line ? `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(line)}</a:t></a:r></a:p>` : '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>')).join('');
    return XML_HEAD + `<p:notes ${ROOT_NS}><p:cSld><p:spTree>${GROUP_PROPERTIES}`
      + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
      + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
      + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>';
  }

  // Une diapositive en construction : ses objets (derrière le texte, texte, devant, cadres), ses relations (mise en page, images, liens, notes) et le compte de ses identifiants.
  function newSlide(ctx, number, props) {
    return {
      number, props, background: props && props.bg, shapes: { behindFrames: [], back: [], flow: [], front: [], frames: [] }, pendingImages: [], nextShapeId: 2,
      notes: !!(props && props.notes),
      rels: [{ id: 'rId1', type: REL + 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }],
      takeId() { return this.nextShapeId++; },
      // L'animation d'un objet de l'éditeur (js/frame-anim.js) : elle se pose sur les objets de PowerPoint qu'il est devenu (`first` à `last`, ses identifiants ; `shape` : celui de sa forme à texte, s'il y en a un).
      animations: [],
      animate(anim, first, last, shape) {
        const a = FrameAnim.normalized(anim);
        if (a && last >= first) this.animations.push({ anim: a, first, last, shape });
      },
      relFor(type, target, external) {
        const found = this.rels.find(rel => rel.type === type && rel.target === target);
        if (found) return found.id;
        const id = 'rId' + (this.rels.length + 1);
        this.rels.push({ id, type, target, external });
        return id;
      },
      // Le lien d'une série de caractères ou d'une image : une adresse (ouverte au clic), ou la diapositive d'un signet (`#adresse`) ; un lien dont la cible n'est pas dans le fichier reste du texte.
      linkXml(a) {
        const href = a.getAttribute('href');
        const safe = HtmlSanitize.safeLinkHref(href);
        if (safe) return `<a:hlinkClick r:id="${this.relFor(REL + 'hyperlink', safe, true)}"/>`;
        const anchor = HtmlSanitize.internalAnchorId(href);
        const target = anchor ? ctx.anchors.get(anchor) : null;
        return target ? `<a:hlinkClick r:id="${this.relFor(REL + 'slide', 'slide' + target + '.xml')}" action="ppaction://hlinksldjump"/>` : '';
      },
      noteImage(img) { this.pendingImages.push(img); },
    };
  }

  async function buildSlide(source, number, ctx) {
    const slide = newSlide(ctx, number, source.props);
    const host = document.createElement('div');
    source.nodes.forEach(node => host.appendChild(node));
    ExportCommon.fillEmptyBlocks(host);
    const detach = ExportCommon.attachMeasureHost(host, ctx.contentWidthPx);
    try {
      await Promise.all(Array.from(host.querySelectorAll('img')).map(img => (img.decode ? img.decode().catch(() => {}) : null)));
      const scope = scopeFor(host, ctx);
      const found = { flow: [], frames: [] };
      walkBlocks(host, scope, found);
      // Le titre : le premier bloc de texte de la diapositive, quand c'est un titre.
      const first = found.flow.find(item => item.type === 'text' && item.units.some(hasText));
      let title = null;
      if (first && isHeadingUnit(first.units[0]) && first.units.length === 1) { title = first.units[0]; first.units = []; }
      for (const item of groupTexts(found.flow)) {
        if (item.type === 'text') {
          const left = Math.min(...item.units.map(unit => (unit.list ? Math.min(unit.outer.left, unit.list.left) : unit.outer.left)));
          const right = Math.max(...item.units.map(unit => unit.outer.right));
          const top = item.units[0].rect.top;
          const bottom = item.units[item.units.length - 1].rect.bottom;
          slide.shapes.flow.push(textBoxXml(slide, scope.onSlide({ left, top, width: right - left, height: bottom - top }), paragraphsXml(item.units, left, slide, ctx)));
          await flushInlineImages(slide, ctx, scope, null, null);
        } else if (item.type === 'picture') {
          putPicture(slide, await pictureOf(item.el, slide, ctx, scope, null));
        } else if (item.type === 'table') {
          slide.shapes.flow.push(tableXml(item.el, slide, ctx, scope, scope.onSlide(scope.box(item.el))));
        } else if (item.type === 'rule') {
          const b = scope.onSlide(scope.box(item.el));
          slide.shapes.flow.push(connectorXml(slide, { x: b.x, y: b.y + b.h / 2, w: b.w, h: 0 }, cssHex(computedOf(item.el).backgroundColor) || 'D0D7DE', 0.75, '', null, 'line'));
        } else if (item.type === 'code') {
          slide.shapes.flow.push(codeXml(item.el, slide, ctx, scope));
          await flushInlineImages(slide, ctx, scope, null, null);
        }
      }
      // Les images des cases d'un tableau, posées après lui (par-dessus).
      await flushInlineImages(slide, ctx, scope, null, null);
      if (title) {
        const b = scope.onSlide(title.rect);
        slide.shapes.flow.unshift(textBoxXml(slide, b, paragraphsXml([title], title.rect.left, slide, ctx), true));
      }
      for (const frame of found.frames) await frameXml(frame, slide, ctx);
    } finally { detach(); }
    return slide;
  }
  // Un bloc de code : un rectangle gris à bord fin, le texte en police à chasse fixe (les lignes se suivent par des sauts de ligne).
  function codeXml(pre, slide, ctx, scope) {
    const b = scope.onSlide(scope.box(pre));
    const cs = computedOf(pre);
    const pad = side => (parseFloat(cs['padding' + side]) || 0) * PX_TO_PT;
    const unit = { el: pre, rect: scope.box(pre), outer: { left: 0, right: 0 }, list: null, bullet: false };
    const id = slide.takeId();
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${nameOf(slide, 'code', id)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
      + `<p:spPr>${xfrmXml(emu(b.x), emu(b.y), emu(b.w), emu(b.h))}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml(ExportCommon.hexOf(ExportCommon.EDITOR_STYLE.codeFillColor))}${lineXml(ExportCommon.hexOf(ExportCommon.EDITOR_STYLE.codeBoxColor), 0.75)}</p:spPr>`
      + `<p:txBody><a:bodyPr ${insetsXml(pad('Top'), pad('Right'), pad('Bottom'), pad('Left'))} anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphXml(unit, { originLeft: unit.rect.left, gapPx: 0 }, slide, ctx)}</p:txBody></p:sp>`;
  }

  // --- Le fichier -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Les diapositives d'un HTML résolu : ce qui est entre deux sauts de page, avec le repère de la diapositive (SlideProps) et les signets qu'elle porte.
  function slidesOf(html) {
    const root = document.createElement('div');
    Dom.setMarkup(root, html || '');
    const slides = [{ nodes: [], props: null }];
    Array.from(root.childNodes).forEach((node) => {
      const current = slides[slides.length - 1];
      if (node.nodeType === 3) { if (node.nodeValue.trim()) current.nodes.push(node); return; }
      if (node.nodeType !== 1) return;
      if (node.classList.contains('page-break-marker')) { slides.push({ nodes: [], props: null }); return; }
      if (node.classList.contains(SlideProps.CLASS)) { if (!current.props) current.props = SlideProps.attrsOf(node); return; }
      if (!isInvisible(node)) current.nodes.push(node);
    });
    return slides;
  }
  function slideSizeOf(margins) {
    const page = PageLayout.pageSizePtFor(margins.orientation, margins.format);
    if (Math.abs(page.width - 960) < 1 && Math.abs(page.height - 540) < 1) return SLIDE_16_9;
    return { cx: emu(page.width), cy: emu(page.height) };
  }

  // Le fichier .pptx d'un HTML résolu. `marginsPt` : la page (PageLayout.getMarginsPt : marges, sens, format), `title` : le titre du document.
  async function fromHtml(html, options = {}) {
    await ExportCommon.ensureJsZipLoaded();
    const marginsPt = options.marginsPt || PageLayout.getMarginsPt();
    const size = slideSizeOf(marginsPt);
    const page = PageLayout.pageSizePtFor(marginsPt.orientation, marginsPt.format);
    const sources = slidesOf(html);
    const anchors = new Map();
    sources.forEach((source, i) => {
      Anchors.indexElements(source.nodes.filter(node => node.nodeType === 1)).forEach((el, id) => { if (!anchors.has(id)) anchors.set(id, i + 1); });
    });
    const ctx = {
      size, anchors, media: new Map(), mediaList: [], slideCount: sources.length,
      margins: { top: marginsPt.top, right: marginsPt.right, bottom: marginsPt.bottom, left: marginsPt.left },
      contentWidthPx: Math.max(40, (page.width - marginsPt.left - marginsPt.right) * PT_TO_PX),
    };
    const slides = [];
    for (let i = 0; i < sources.length; i += 1) {
      const slide = await buildSlide(sources[i], i + 1, ctx);
      slide.props = sources[i].props || { transition: '', from: 'r', dur: 700, bg: '', notes: '', hidden: false, advance: 0 };
      slides.push(slide);
    }
    const noted = slides.filter(slide => slide.notes);
    const zip = new JSZip();
    // Aucun dossier à part dans l'archive (« ppt/ », « _rels/ »…) : un paquet OPC n'a que des parties, comme python-pptx ou PowerPoint les écrivent.
    const put = (path, data) => zip.file(path, data, { createFolders: false });
    const relIds = { master: 'rId1', notesMaster: 'rId' + (slides.length + 6), slides: slides.map((slide, i) => 'rId' + (i + 2)) };
    put('[Content_Types].xml', contentTypesXml({ media: ctx.mediaList, slides, notes: noted.length > 0 }));
    put('_rels/.rels', relsXml([
      { id: 'rId1', type: REL + 'officeDocument', target: 'ppt/presentation.xml' },
      { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' },
      { id: 'rId3', type: REL + 'extended-properties', target: 'docProps/app.xml' },
    ]));
    put('docProps/core.xml', corePropertiesXml(options.title || '', new Date().toISOString().replace(/\.\d+Z$/, 'Z')));
    put('docProps/app.xml', appPropertiesXml(slides.length, noted.length, size));
    put('ppt/presentation.xml', presentationXml(slides, size, noted.length > 0, relIds));
    const presentationRels = [{ id: relIds.master, type: REL + 'slideMaster', target: 'slideMasters/slideMaster1.xml' }]
      .concat(slides.map((slide, i) => ({ id: relIds.slides[i], type: REL + 'slide', target: `slides/slide${i + 1}.xml` })))
      .concat([
        { id: 'rId' + (slides.length + 2), type: REL + 'presProps', target: 'presProps.xml' },
        { id: 'rId' + (slides.length + 3), type: REL + 'viewProps', target: 'viewProps.xml' },
        { id: 'rId' + (slides.length + 4), type: REL + 'theme', target: 'theme/theme1.xml' },
        { id: 'rId' + (slides.length + 5), type: REL + 'tableStyles', target: 'tableStyles.xml' },
      ]);
    if (noted.length) presentationRels.push({ id: relIds.notesMaster, type: REL + 'notesMaster', target: 'notesMasters/notesMaster1.xml' });
    put('ppt/_rels/presentation.xml.rels', relsXml(presentationRels));
    put('ppt/presProps.xml', PRESENTATION_PROPERTIES);
    put('ppt/viewProps.xml', VIEW_PROPERTIES);
    put('ppt/tableStyles.xml', TABLE_STYLES);
    put('ppt/theme/theme1.xml', themeXml('Grist Factory'));
    put('ppt/slideMasters/slideMaster1.xml', masterXml(size));
    put('ppt/slideMasters/_rels/slideMaster1.xml.rels', relsXml([
      { id: 'rId1', type: REL + 'slideLayout', target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: REL + 'theme', target: '../theme/theme1.xml' },
    ]));
    put('ppt/slideLayouts/slideLayout1.xml', layoutXml());
    put('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relsXml([{ id: 'rId1', type: REL + 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]));
    if (noted.length) {
      put('ppt/notesMasters/notesMaster1.xml', notesMasterXml(size));
      put('ppt/notesMasters/_rels/notesMaster1.xml.rels', relsXml([{ id: 'rId1', type: REL + 'theme', target: '../theme/theme2.xml' }]));
      put('ppt/theme/theme2.xml', themeXml('Grist Factory'));
    }
    slides.forEach((slide, i) => {
      const rels = slide.rels.slice();
      if (slide.notes) rels.push({ id: 'rId' + (rels.length + 1), type: REL + 'notesSlide', target: `../notesSlides/notesSlide${slide.number}.xml` });
      put(`ppt/slides/slide${i + 1}.xml`, slideXml(slide));
      put(`ppt/slides/_rels/slide${i + 1}.xml.rels`, relsXml(rels));
      if (slide.notes) {
        put(`ppt/notesSlides/notesSlide${slide.number}.xml`, notesSlideXml(slide));
        put(`ppt/notesSlides/_rels/notesSlide${slide.number}.xml.rels`, relsXml([
          { id: 'rId1', type: REL + 'notesMaster', target: '../notesMasters/notesMaster1.xml' },
          { id: 'rId2', type: REL + 'slide', target: `../slides/slide${i + 1}.xml` },
        ]));
      }
    });
    ctx.mediaList.forEach(media => put('ppt/media/' + media.name, media.data));
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' });
  }

  async function getPptxBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt) {
    // Une image d'un site externe est téléchargée pour ce fichier (mediaFor) : la fenêtre la liste et peut tout arrêter (js/external-images.js).
    await ExternalImages.confirmExport(htmlContent, null);
    const { resolvedHtml, filename } = await ExportCommon.resolveRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData);
    const blob = await fromHtml(resolvedHtml, { marginsPt, title: filename });
    return { blob, filename };
  }
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt) {
    if (!record) { alert(I18n.t('alert.noRecordForExportPptx')); return; }
    const { blob, filename } = await getPptxBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt);
    ExportCommon.downloadBlob(blob, (filename || 'publipostage') + '.pptx');
  }

  return { exportCurrentRecord, getPptxBlobForRecord, fromHtml };
})();
