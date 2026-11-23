// Export OpenDocument texte : le document d'une ligne en un fichier .odt (LibreOffice, OnlyOffice, Collabora, Calligra...), sur le modèle de l'export Word (js/docx-export.js) mais SANS bibliothèque : le zip
// (JSZip, déjà chargé) et son XML sont écrits à la main, comme l'import les lit (js/odt-import.js, qui sert d'essai d'aller-retour).
//
// Le fichier : `mimetype` (en premier, non compressé : c'est ainsi que les applications reconnaissent un OpenDocument), `META-INF/manifest.xml`, `content.xml` (le texte et ses styles « automatiques » P1, T1,
// Table1.A1, L1...), `styles.xml` (les valeurs par défaut, les styles nommés, la page et ses marges), `meta.xml`. Le texte vient du HTML du document DÉJÀ résolu pour la ligne (js/export-common.js:resolveRecord) ;
// rien ne se mesure sur un rendu : tout se lit sur les balises et les attributs que l'éditeur écrit (les mêmes que l'import Word et l'import OpenDocument produisent).
//
// Ce que le fichier reprend : les paragraphes (alignement, interligne, espaces avant et après, retraits, sens d'écriture, « garder avec le suivant »), les titres 1 à 6, les citations, les blocs de code, les séries
// de caractères (gras, italique, souligné et sa sorte, barré, exposant, indice, couleur, fond, taille, police, espacement, petites capitales, majuscules), les liens sûrs, les sauts de ligne et de page, les listes à puces
// et numérotées emboîtées (signe de puce, style et départ des numéros) et les listes de tâches, les tableaux (colonnes, fusions, fonds, traits, hauteurs, alignement vertical) et la page (format, sens, marges). Le moteur
// compte ce qu'il ne reprend pas encore (`report`) au lieu de le perdre en silence.
const OdtExport = (function () {
  const STYLE = ExportCommon.EDITOR_STYLE;
  const MIME = 'application/vnd.oasis.opendocument.text';
  const GENERATOR = 'Grist Factory';
  const BODY_FONT = 'Roboto';
  const CODE_FONT = 'Courier New';
  const PT_PER_PX = 0.75;
  const CM_PER_PT = 2.54 / 72;
  const MAX_DEPTH = 24;             // listes, tableaux et citations emboîtés
  const DEFAULT_BORDER = '#b8c0c9'; // le trait d'une case que personne n'a réglée (css/editor-v2.css : `.tiptap table td`)
  const TASK_MARKERS = { off: '☐ ', on: '☑ ' };
  const BULLET_SIGNS = { disc: '•', circle: '◦', square: '▪' };
  const NUMBER_FORMATS = { decimal: '1', alpha: 'a', roman: 'i' };
  const UNDERLINE_STYLES = { dotted: 'dotted', dashed: 'dash', wavy: 'wave' };
  const QUOTE_INDENT_PT = 12;
  const LIST_STEP_CM = 0.9;
  const { XML_HEAD, namespaceAttrs, escText, escAttr, fixed, attrsOf, textXml } = ExportCommon.OdfXml;
  const BLOCK_TAGS = /^(?:P|H[1-6]|DIV|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|SECTION|ARTICLE|ASIDE|FIGURE|FIGCAPTION|MAIN|NAV|HEADER|FOOTER|DL|DT|DD|ADDRESS)$/;
  const { cssColorHex } = ExportCommon;

  const centimeters = points => fixed(points * CM_PER_PT, 3) + 'cm';

  // --- Les styles : un par réglage différent, nommé P1, T1, Table1... ----------------------------------------------------------------------------------------------------------------------------------
  function newContext(options) {
    return {
      autoStyles: [], names: new Map(), counts: {}, fonts: new Set([BODY_FONT, CODE_FONT]), tables: 0, listLevel: 0, deferred: [], report: new Map(), flow: { pageBreak: false, started: false }, depth: 0,
      contentWidthPt: options.contentWidthPt, marginLeftPt: options.marginLeftPt || 0, marginTopPt: options.marginTopPt || 0, topBandPt: options.topBandPt || 0, images: new Map(), parts: [], pictureNames: new Map(), notes: 0, frames: 0, namePrefix: '', headings: new Map(), headingList: [],
    };
  }
  // Le nom du style de ce genre (`prefix` : P, T, Table...) et de cette clé ; `build(name)` écrit son XML la première fois.
  function styleNameOf(ctx, prefix, key, build) {
    const cacheKey = prefix + '|' + key;
    let styleName = ctx.names.get(cacheKey);
    if (!styleName) {
      ctx.counts[prefix] = (ctx.counts[prefix] || 0) + 1;
      styleName = ctx.namePrefix + prefix + ctx.counts[prefix];
      ctx.names.set(cacheKey, styleName);
      ctx.autoStyles.push(build(styleName));
    }
    return styleName;
  }
  const countLost = (ctx, key, n) => { ctx.report.set(key, (ctx.report.get(key) || 0) + (n === undefined ? 1 : n)); };

  // --- Les séries de caractères ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const BASE_LOOK = { b: false, i: false, u: false, uLine: '', s: false, sup: false, sub: false, color: '', back: '', size: 0, family: '', spacing: 0, caps: false, smallCaps: false, link: false };
  const lookKey = look => JSON.stringify(look);
  // La taille en points d'une longueur CSS : « 14pt », « 18.6px », « 120% » ou « 1.2em » (sur la taille `base` du texte qui l'entoure) ; 0 quand elle ne dit rien.
  function sizeOf(value, base) {
    const found = /^\s*(-?\d*\.?\d+)\s*(pt|px|%|em|rem)\s*$/i.exec(String(value || ''));
    if (!found) return 0;
    const amount = Number(found[1]);
    const unit = found[2].toLowerCase();
    if (unit === 'pt') return amount;
    if (unit === 'px') return amount * PT_PER_PX;
    return amount * (unit === '%' ? 0.01 : 1) * (base || STYLE.bodyPt);
  }
  const familyOf = (value) => {
    const first = String(value || '').split(',')[0].replace(/^[\s'"]+|[\s'"]+$/g, '');
    return /^(?:inherit|initial|unset|sans-serif|serif|monospace)$/i.test(first) ? (/^monospace$/i.test(first) ? CODE_FONT : '') : first;
  };
  // L'aspect d'une série de caractères une fois l'élément `el` lu : celui du dessus (`look`), puis la balise (gras, italique...), puis son style en ligne.
  function lookOf(look, el, base) {
    const next = Object.assign({}, look);
    const tag = el.tagName;
    if (tag === 'STRONG' || tag === 'B') next.b = true;
    if (tag === 'EM' || tag === 'I') next.i = true;
    if (tag === 'U') next.u = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.s = true;
    if (tag === 'SUP') { next.sup = true; next.sub = false; }
    if (tag === 'SUB') { next.sub = true; next.sup = false; }
    if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') next.family = CODE_FONT;
    const css = el.style;
    if (!css || !css.length) return next;
    if (css.fontWeight === 'bold' || Number(css.fontWeight) >= 600) next.b = true;
    else if (css.fontWeight === 'normal' || (css.fontWeight && Number(css.fontWeight) < 600)) next.b = false;
    if (css.fontStyle === 'italic' || css.fontStyle === 'oblique') next.i = true;
    else if (css.fontStyle === 'normal') next.i = false;
    const decoration = (css.textDecorationLine || css.textDecoration || '');
    if (/underline/.test(decoration)) next.u = true;
    if (/line-through/.test(decoration)) next.s = true;
    if (next.u && css.textDecorationStyle && css.textDecorationStyle !== 'solid') next.uLine = css.textDecorationStyle;
    if (/^(?:super)$/.test(css.verticalAlign || '')) { next.sup = true; next.sub = false; }
    if (/^(?:sub)$/.test(css.verticalAlign || '')) { next.sub = true; next.sup = false; }
    const color = css.color ? cssColorHex(css.color) : null;
    if (color) next.color = '#' + color.toLowerCase();
    const back = css.backgroundColor ? cssColorHex(css.backgroundColor) : null;
    if (back) next.back = '#' + back.toLowerCase();
    const size = sizeOf(css.fontSize, next.size || base);
    if (size) next.size = Math.round(size * 100) / 100;
    const family = familyOf(css.fontFamily);
    if (family) next.family = family;
    const spacing = sizeOf(css.letterSpacing, next.size || base);
    if (spacing) next.spacing = Math.round(spacing * 100) / 100;
    if (/small-caps/.test(css.fontVariant || css.fontVariantCaps || '')) next.smallCaps = true;
    if (css.textTransform === 'uppercase') next.caps = true;
    return next;
  }
  const lookIsPlain = look => lookKey(look) === lookKey(BASE_LOOK);
  // Le style de caractères d'un aspect (écrit à la première demande) : `text:span text:style-name="T1"`.
  function textStyleOf(ctx, look) {
    return styleNameOf(ctx, 'T', lookKey(look), (name) => {
      const props = [];
      if (look.b) props.push(['fo:font-weight', 'bold']);
      if (look.i) props.push(['fo:font-style', 'italic']);
      if (look.u) {
        props.push(['style:text-underline-style', UNDERLINE_STYLES[look.uLine] || 'solid'], ['style:text-underline-width', 'auto'], ['style:text-underline-color', 'font-color']);
        if (look.uLine === 'double') props.push(['style:text-underline-type', 'double']);
      }
      if (look.s) props.push(['style:text-line-through-style', 'solid'], ['style:text-line-through-type', 'single']);
      if (look.sup) props.push(['style:text-position', 'super 58%']);
      else if (look.sub) props.push(['style:text-position', 'sub 58%']);
      if (look.color) props.push(['fo:color', look.color]);
      if (look.back) props.push(['fo:background-color', look.back]);
      if (look.size) props.push(['fo:font-size', fixed(look.size, 2) + 'pt']);
      if (look.family) { ctx.fonts.add(look.family); props.push(['style:font-name', look.family]); }
      if (look.spacing) props.push(['fo:letter-spacing', fixed(look.spacing, 2) + 'pt']);
      if (look.smallCaps) props.push(['fo:font-variant', 'small-caps']);
      if (look.caps) props.push(['fo:text-transform', 'uppercase']);
      return '<style:style style:name="' + name + '" style:family="text"><style:text-properties' + attrsOf(props) + '/></style:style>';
    });
  }
  const safeLink = href => (/^(?:https?:|mailto:|tel:)/i.test(String(href || '').trim()) && !/[\u0000-\u001f\s]/.test(String(href).trim()) ? String(href).trim() : '');

  // Les enfants en ligne d'un bloc, en XML de paragraphe. `base` : la taille du texte du bloc (titre ou corps).
  function inlineXml(nodes, look, state, ctx, base) {
    let out = '';
    nodes.forEach((node) => {
      if (node.nodeType === 3) {
        const xml = textXml(node.nodeValue, state);
        if (!xml) return;
        out += lookIsPlain(look) ? xml : '<text:span text:style-name="' + textStyleOf(ctx, look) + '">' + xml + '</text:span>';
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === 'BR') { out += '<text:line-break/>'; state.blank = true; return; }
      if (/^(?:SCRIPT|STYLE|TEMPLATE|INPUT|LABEL|BUTTON)$/.test(tag)) return;
      if (tag === 'IMG') { out += imageXml(ctx, node); return; }
      if (node.classList && node.classList.contains('footnote-ref-marker')) { out += noteXml(ctx, node); return; }
      if (node.classList && node.classList.contains('page-number-badge')) { out += '<text:page-number text:select-page="current">1</text:page-number>'; return; }
      if (tag === 'A') {
        const href = safeLink(node.getAttribute('href'));
        const inner = inlineXml(Array.from(node.childNodes), lookOf(look, node, base), state, ctx, base);
        out += href && inner ? '<text:a xlink:type="simple" xlink:href="' + escAttr(href) + '" text:style-name="Internet_20_link" text:visited-style-name="Visited_20_Internet_20_Link">' + inner + '</text:a>' : inner;
        return;
      }
      out += inlineXml(Array.from(node.childNodes), lookOf(look, node, base), state, ctx, base);
    });
    return out;
  }

  // --- Les images et les notes ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Les types d'image qu'un OpenDocument garde tels quels ; tout le reste (WEBP, SVG) est redessiné en PNG, comme pour le Word.
  const PICTURE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };
  const DEFAULT_PICTURE_RATIO = 0.75;
  const DEFAULT_PICTURE_WIDTH_PX = 320;
  // Une image lue : ses octets (rangés dans `Pictures/` du paquet, une fois par adresse) et sa taille ; une image qu'on ne sait pas lire ne reste pas en silence : elle est comptée.
  async function readPicture(ctx, img) {
    const src = img.getAttribute('src') || '';
    if (!src) return null;
    if (ctx.pictureNames.has(src)) return ctx.pictureNames.get(src);
    let blob;
    try { blob = await ImageIo.fetchBlob(src); } catch (e) { return null; }
    let type = PICTURE_TYPES[blob.type];
    let ratio = DEFAULT_PICTURE_RATIO;
    try {
      if (type) {
        const decoded = await ImageIo.load(blob);
        if (decoded.naturalWidth && decoded.naturalHeight) ratio = decoded.naturalHeight / decoded.naturalWidth;
      } else {
        const canvas = await ImageIo.draw(blob);
        blob = await ImageIo.pngBlob(canvas);
        type = 'png';
        ratio = canvas.height / canvas.width;
      }
    } catch (e) { return null; }
    const number = ctx.parts.length + 1;
    const picture = { path: 'Pictures/image' + number + '.' + type, mediaType: type === 'jpg' ? 'image/jpeg' : 'image/' + type, data: await blob.arrayBuffer(), ratio };
    ctx.parts.push(picture);
    ctx.pictureNames.set(src, picture);
    return picture;
  }
  // Avant d'écrire le texte (qui reste d'un seul tenant, sans attente) : chaque image du document est lue, sa taille posée (la largeur réglée dans l'éditeur, ramenée à celle de la page).
  async function prepareImages(ctx, root) {
    const images = Array.from(root.querySelectorAll('img'));
    for (const img of images) {
      if (img.hasAttribute('data-pdf-skip')) continue;
      // « Sur toutes les pages » (js/page-layer.js) : l'image se pose dans l'en-tête de chaque page, pas dans le texte.
      if (typeof PageLayer !== 'undefined' && PageLayer.isRepeatedEl(img)) continue;
      const picture = await readPicture(ctx, img);
      if (!picture) continue;
      const widthPx = Math.max(1, parseFloat(img.style.width) || DEFAULT_PICTURE_WIDTH_PX);
      const widthPt = Math.min(widthPx * PT_PER_PX, ctx.contentWidthPt > 0 ? ctx.contentWidthPt : Infinity);
      ctx.images.set(img, { picture, widthPt, heightPt: Math.max(1, widthPt * picture.ratio) });
    }
  }
  // Où et comment une image se pose, comme dans le Word : dans la ligne (ancrée « comme un caractère ») ; à gauche ou à droite avec le texte qui l'entoure (`data-align`) ; devant ou derrière le texte à une
  // place de la page (`data-layer`, avec la position que l'éditeur a relevée : `data-page-left-pt`, `data-page-top-pt`, `data-page-index`). Un calque dont la position n'est pas connue reste dans la ligne, et est compté.
  function placementOf(ctx, img) {
    const layer = img.getAttribute('data-layer');
    if (layer === 'front' || layer === 'behind') {
      const left = parseFloat(img.getAttribute('data-page-left-pt'));
      const top = parseFloat(img.getAttribute('data-page-top-pt'));
      if (Number.isFinite(left) && Number.isFinite(top) && img.hasAttribute('data-page-index')) return { kind: layer, x: ctx.marginLeftPt + left, y: ctx.marginTopPt + ctx.topBandPt + top };
      countLost(ctx, 'imagesFloating');
      return { kind: 'inline' };
    }
    const align = img.getAttribute('data-align');
    if (align === 'left' || align === 'right') return { kind: 'side', side: align };
    return { kind: 'inline' };
  }
  const WRAP_SIDE_CM = centimeters(9);
  const WRAP_BELOW_CM = centimeters(6);
  function frameStyleOf(ctx, place) {
    const kind = place.kind === 'side' ? 'side-' + place.side : place.kind;
    return styleNameOf(ctx, 'fr', kind, (name) => {
      const head = '<style:style style:name="' + name + '" style:family="graphic" style:parent-style-name="Graphics"><style:graphic-properties ';
      if (place.kind === 'inline') {
        return head + 'style:wrap="none" style:vertical-pos="top" style:vertical-rel="baseline" fo:margin-left="0cm" fo:margin-right="0cm" fo:margin-top="0cm" fo:margin-bottom="0cm" fo:padding="0cm" fo:border="none"/></style:style>';
      }
      if (place.kind === 'side') {
        const right = place.side === 'right';
        return head + 'style:wrap="parallel" style:number-wrapped-paragraphs="no-limit" style:wrap-contour="false" style:horizontal-pos="' + place.side + '" style:horizontal-rel="paragraph" style:vertical-pos="top" style:vertical-rel="paragraph"'
          + ' fo:margin-left="' + (right ? WRAP_SIDE_CM : '0cm') + '" fo:margin-right="' + (right ? '0cm' : WRAP_SIDE_CM) + '" fo:margin-top="0cm" fo:margin-bottom="' + WRAP_BELOW_CM + '" fo:padding="0cm" fo:border="none"/></style:style>';
      }
      return head + 'style:wrap="run-through" style:run-through="' + (place.kind === 'behind' ? 'background' : 'foreground') + '" style:horizontal-pos="from-left" style:horizontal-rel="page" style:vertical-pos="from-top" style:vertical-rel="page"'
        + ' fo:margin-left="0cm" fo:margin-right="0cm" fo:margin-top="0cm" fo:margin-bottom="0cm" fo:padding="0cm" fo:border="none"/></style:style>';
    });
  }
  function imageXml(ctx, img) {
    const prepared = ctx.images.get(img);
    if (!prepared) { countLost(ctx, 'images'); return ''; }
    const place = placementOf(ctx, img);
    const style = frameStyleOf(ctx, place);
    ctx.frames += 1;
    const alt = String(img.getAttribute('alt') || '').trim();
    const anchor = place.kind === 'inline' ? 'as-char' : 'paragraph';
    const position = place.kind === 'front' || place.kind === 'behind' ? ' svg:x="' + centimeters(place.x) + '" svg:y="' + centimeters(place.y) + '"' : '';
    return '<draw:frame draw:style-name="' + style + '" draw:name="Image' + ctx.frames + '" text:anchor-type="' + anchor + '"' + position + ' svg:width="' + centimeters(prepared.widthPt) + '" svg:height="' + centimeters(prepared.heightPt) + '" draw:z-index="' + (place.kind === 'behind' ? 0 : ctx.frames) + '">'
      + '<draw:image xlink:href="' + prepared.picture.path + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>' + (alt ? '<svg:desc>' + escText(alt) + '</svg:desc>' : '') + '</draw:frame>';
  }
  // Une note de bas de page : son numéro dans le texte, son texte au pied de la page (que LibreOffice et Word placent).
  function noteXml(ctx, marker) {
    ctx.notes += 1;
    const text = textXml(marker.getAttribute('data-note-text') || '', { blank: true });
    return '<text:note text:id="ftn' + ctx.notes + '" text:note-class="footnote"><text:note-citation>' + ctx.notes + '</text:note-citation><text:note-body><text:p text:style-name="Footnote">' + text + '</text:p></text:note-body></text:note>';
  }

  // --- Les paragraphes -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const numberAttr = (el, name) => { const value = parseFloat(el.getAttribute(name)); return Number.isFinite(value) ? value : null; };
  // Le style d'un paragraphe : son modèle nommé (`parent` : Standard, Heading_20_1, Quotations...) et ses réglages (alignement, interligne, espaces, retraits, sens, saut de page, garder avec le suivant).
  function paragraphStyleOf(ctx, parent, props) {
    return styleNameOf(ctx, 'P', parent + '|' + JSON.stringify(props), (name) => {
      const list = [];
      if (props.align) list.push(['fo:text-align', props.align]);
      if (props.line) list.push(['fo:line-height', fixed(props.line / STYLE.naturalLine * 100, 1) + '%']);
      if (props.before !== null && props.before !== undefined) list.push(['fo:margin-top', centimeters(props.before)]);
      if (props.after !== null && props.after !== undefined) list.push(['fo:margin-bottom', centimeters(props.after)]);
      if (props.left) list.push(['fo:margin-left', centimeters(props.left)]);
      if (props.first) list.push(['fo:text-indent', centimeters(props.first)]);
      if (props.tab) list.push(['style:tab-stop-distance', centimeters(props.tab)]);
      if (props.rtl) list.push(['style:writing-mode', 'rl-tb']);
      if (props.keep) list.push(['fo:keep-with-next', 'always']);
      if (props.breakBefore) list.push(['fo:break-before', 'page']);
      const body = list.length ? '<style:paragraph-properties' + attrsOf(list) + '/>' : '';
      return '<style:style style:name="' + name + '" style:family="paragraph" style:parent-style-name="' + parent + '">' + body + '</style:style>';
    });
  }
  // Les réglages d'un bloc : alignement (`style` ou `align`), sens (`dir`), « Paragraphe… » (js/paragraph-format.js : `data-line-height`, `data-space-before`, `data-space-after`, `data-indent-left`,
  // `data-indent-first`, `data-tab-size`), « Garder avec le suivant » (`data-keep-next`).
  function propsOf(el, withIndent) {
    const props = {};
    const align = String((el.style && el.style.textAlign) || el.getAttribute('align') || '').toLowerCase();
    if (/^(?:left|right|center|justify)$/.test(align)) props.align = align;
    else if (align === 'start') props.align = 'left';
    else if (align === 'end') props.align = 'right';
    if (el.getAttribute('dir') === 'rtl') props.rtl = true;
    const line = numberAttr(el, 'data-line-height');
    if (line && line > 0) props.line = line;
    const before = numberAttr(el, 'data-space-before');
    const after = numberAttr(el, 'data-space-after');
    if (before !== null) props.before = before;
    if (after !== null) props.after = after;
    if (withIndent) {
      const left = numberAttr(el, 'data-indent-left');
      const first = numberAttr(el, 'data-indent-first');
      if (left) props.left = left;
      if (first) props.first = first;
    }
    const tab = numberAttr(el, 'data-tab-size');
    if (tab && tab > 0) props.tab = tab;
    if (el.getAttribute('data-keep-next') === 'true') props.keep = true;
    return props;
  }
  // Un saut de page demandé avant ce bloc : consommé par lui, jamais au tout début du document.
  function takeBreak(ctx) {
    const wanted = ctx.flow.pageBreak && ctx.flow.started;
    ctx.flow.pageBreak = false;
    return wanted;
  }
  // Un paragraphe (ou un titre) en XML : `parent` le style nommé, `base` la taille du texte, `children` ses enfants en ligne.
  function paragraphXml(ctx, el, children, options) {
    const opts = options || {};
    const props = Object.assign(propsOf(el, !opts.inList), opts.props || {});
    // Une image centrée (`data-align`) : l'OpenDocument aligne le paragraphe qui la porte (à gauche ou à droite, l'image est posée avec le texte autour d'elle : `placementOf`).
    if (!props.align) {
      const aligned = Array.from(el.children || []).find(child => child.tagName === 'IMG' && child.getAttribute('data-align') === 'center');
      if (aligned) props.align = 'center';
    }
    if (!opts.inList && takeBreak(ctx)) props.breakBefore = true;
    ctx.flow.started = true;
    const state = { blank: true };
    const base = opts.base || STYLE.bodyPt;
    let inner = (opts.prefix ? textXml(opts.prefix, state) : '') + inlineXml(children, Object.assign({}, BASE_LOOK, opts.look || {}), state, ctx, base);
    // Le titre que le sommaire vise : un signet autour de son texte.
    if (opts.anchor) inner = '<text:bookmark-start text:name="' + opts.anchor + '"/>' + inner + '<text:bookmark-end text:name="' + opts.anchor + '"/>';
    const style = paragraphStyleOf(ctx, opts.parent || 'Standard', props);
    if (opts.level) return '<text:h text:style-name="' + style + '" text:outline-level="' + opts.level + '">' + inner + '</text:h>';
    return '<text:p text:style-name="' + style + '">' + inner + '</text:p>';
  }
  // Les lignes d'un bloc de code, un paragraphe chacune, en police à chasse fixe.
  function codeXml(ctx, el) {
    const lines = ExportCommon.codeLinesOf(el);
    return lines.map((line, index) => {
      const props = {};
      if (index === 0 && takeBreak(ctx)) props.breakBefore = true;
      ctx.flow.started = true;
      const state = { blank: true };
      const style = paragraphStyleOf(ctx, 'Preformatted_20_Text', props);
      return '<text:p text:style-name="' + style + '">' + textXml(line, state) + '</text:p>';
    }).join('');
  }

  // --- Les blocs : paragraphes, titres, citations, listes, tableaux -------------------------------------------------------------------------------------------------------------------------------
  // Les enfants d'un conteneur en blocs : les nœuds en ligne qui se suivent font UN paragraphe, chaque bloc a le sien. `options` : ceux du paragraphe (`inList`, `parent`, `look`).
  function blocksOf(ctx, container, options) {
    let out = '';
    let pending = [];
    const opts = options || {};
    const flush = () => {
      if (pending.some(node => node.nodeType === 1 || /\S/.test(node.nodeValue))) out += paragraphXml(ctx, container, pending, opts);
      pending = [];
    };
    Array.from(container.childNodes).forEach((node) => {
      if (node.nodeType === 1 && BLOCK_TAGS.test(node.tagName)) { flush(); out += blockXml(ctx, node, opts); } else pending.push(node);
    });
    flush();
    return out;
  }
  function blockXml(ctx, el, options) {
    const opts = options || {};
    const tag = el.tagName;
    if (ctx.depth > MAX_DEPTH) return paragraphXml(ctx, el, [document.createTextNode(el.textContent)], { inList: opts.inList });
    if (el.classList.contains('page-break-marker')) { ctx.flow.pageBreak = true; return ''; }
    if (el.classList.contains('toc-marker')) return tocXml(ctx, el);
    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      return paragraphXml(ctx, el, Array.from(el.childNodes), { parent: 'Heading_20_' + level, level, base: STYLE.headingPt[tag], inList: opts.inList, anchor: ctx.headings.get(el) });
    }
    if (tag === 'P') return paragraphXml(ctx, el, Array.from(el.childNodes), { inList: opts.inList, parent: opts.parent, base: opts.base });
    if (tag === 'BLOCKQUOTE') {
      ctx.depth += 1;
      const inner = blocksOf(ctx, el, { parent: 'Quotations', inList: opts.inList });
      ctx.depth -= 1;
      return inner;
    }
    if (tag === 'PRE') return codeXml(ctx, el);
    if (tag === 'HR') return paragraphXml(ctx, el, [], { parent: 'Horizontal_20_Line', inList: opts.inList });
    if (tag === 'UL' || tag === 'OL') { ctx.depth += 1; const xml = listXml(ctx, el); ctx.depth -= 1; return xml; }
    if (tag === 'TABLE') {
      ctx.depth += 1;
      const xml = tableXml(ctx, el);
      ctx.depth -= 1;
      // OpenDocument ne met pas de tableau dans l'item d'une liste : il suit la liste (jamais perdu).
      if (ctx.listLevel > 0 && xml) { ctx.deferred.push(xml); return ''; }
      return xml;
    }
    // Une autre boîte (div, section, encadré, colonnes) : ses blocs sont repris l'un après l'autre.
    ctx.depth += 1;
    const inner = blocksOf(ctx, el, opts);
    ctx.depth -= 1;
    return inner;
  }

  // --- Le sommaire ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Les titres du corps, dans l'ordre : chacun reçoit un signet (`__RefHeading___Toc1`...) que les entrées du sommaire visent. Posés avant d'écrire le texte : le sommaire vient avant ses titres.
  function collectHeadings(ctx, root) {
    Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')).forEach((el) => {
      const anchor = '__RefHeading___Toc' + (ctx.headingList.length + 1);
      ctx.headings.set(el, anchor);
      ctx.headingList.push({ level: Number(el.tagName.slice(1)), text: (el.textContent || '').replace(/\s+/g, ' ').trim(), anchor });
    });
  }
  // Un vrai sommaire OpenDocument (`text:table-of-content`) : ses entrées sont écrites (une par titre des niveaux réglés, avec un lien vers son signet), sans numéro de page - que seul l'éditeur de
  // texte calcule : « Mettre à jour l'index » de LibreOffice les écrit. Le modèle d'entrée porte les numéros de page quand le sommaire les demande.
  function tocXml(ctx, marker) {
    const options = TocOptions.normalize(TocOptions.ofElement(marker));
    const title = I18n.t('pdf.tocTitle');
    const breakBefore = takeBreak(ctx);
    ctx.flow.started = true;
    const titleStyle = paragraphStyleOf(ctx, 'Contents_20_Heading', breakBefore ? { breakBefore: true } : {});
    const entries = ctx.headingList.filter(entry => entry.text && TocOptions.covers(options, entry.level));
    let templates = '';
    for (let level = options.from; level <= options.to; level++) {
      templates += '<text:table-of-content-entry-template text:outline-level="' + level + '" text:style-name="Contents_20_' + level + '"><text:index-entry-link-start text:style-name="Index_20_Link"/><text:index-entry-text/>'
        + (options.pages ? '<text:index-entry-tab-stop style:type="right" style:leader-char="."/><text:index-entry-page-number/>' : '') + '<text:index-entry-link-end/></text:table-of-content-entry-template>';
    }
    const rows = entries.length
      ? entries.map(entry => '<text:p text:style-name="Contents_20_' + entry.level + '"><text:a xlink:type="simple" xlink:href="#' + entry.anchor + '" text:style-name="Index_20_Link" text:visited-style-name="Index_20_Link">' + textXml(entry.text, { blank: true }) + '</text:a></text:p>').join('')
      : '<text:p text:style-name="Contents_20_1">' + escText(I18n.t('docx.tocEmpty')) + '</text:p>';
    ctx.tocs = (ctx.tocs || 0) + 1;
    const name = 'Table of Contents' + ctx.tocs;
    return '<text:table-of-content text:protected="false" text:name="' + name + '"><text:table-of-content-source text:outline-level="' + options.to + '"><text:index-title-template text:style-name="Contents_20_Heading">' + escText(title)
      + '</text:index-title-template>' + templates + '</text:table-of-content-source><text:index-body><text:index-title text:name="' + name + '_Head"><text:p text:style-name="' + titleStyle + '">' + escText(title) + '</text:p></text:index-title>'
      + rows + '</text:index-body></text:table-of-content>';
  }

  // --- Les listes ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Le style de liste de ce genre : un signe de puce ou un format de numéro, sur dix niveaux qui s'indentent d'un cran.
  function listStyleOf(ctx, spec) {
    return styleNameOf(ctx, 'L', JSON.stringify(spec), (name) => {
      let levels = '';
      for (let level = 1; level <= 10; level++) {
        const margin = fixed(LIST_STEP_CM * level, 3) + 'cm';
        const alignment = '<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="'
          + margin + '" fo:text-indent="-' + fixed(LIST_STEP_CM * 0.7, 3) + 'cm" fo:margin-left="' + margin + '"/></style:list-level-properties>';
        if (spec.kind === 'number') {
          levels += '<text:list-level-style-number text:level="' + level + '" style:num-suffix="." style:num-format="' + NUMBER_FORMATS[spec.style] + '">' + alignment + '</text:list-level-style-number>';
        } else {
          levels += '<text:list-level-style-bullet text:level="' + level + '" text:bullet-char="' + escAttr(spec.char) + '">' + alignment + '</text:list-level-style-bullet>';
        }
      }
      return '<text:list-style style:name="' + name + '">' + levels + '</text:list-style>';
    });
  }
  // Le signe d'une puce : celui que « Puce… » a choisi (js/bullet-format.js), à défaut celui du style (rond, rond creux, carré).
  function bulletCharOf(list) {
    const chosen = typeof BulletFormat !== 'undefined' ? BulletFormat.markerOf(list) : null;
    return (chosen && chosen.trim()) || BULLET_SIGNS[list.getAttribute('data-bullet-style')] || BULLET_SIGNS.disc;
  }
  // Une liste en XML : une `text:list` du style de la liste, chaque item ses blocs (le texte, puis ses sous-listes), la liste de tâches en paragraphes à case ☐ ou ☑.
  function listXml(ctx, list) {
    const items = Array.from(list.children).filter(child => child.tagName === 'LI');
    if (list.getAttribute('data-type') === 'taskList') return items.map(item => taskItemXml(ctx, item)).join('');
    const numbered = list.tagName === 'OL';
    const style = listStyleOf(ctx, numbered ? { kind: 'number', style: NUMBER_FORMATS[list.getAttribute('data-number-style')] ? list.getAttribute('data-number-style') : 'decimal' } : { kind: 'bullet', char: bulletCharOf(list) });
    const start = numbered ? parseInt(list.getAttribute('start') || '1', 10) || 1 : 1;
    let out = '<text:list text:style-name="' + style + '">';
    ctx.listLevel += 1;
    items.forEach((item, index) => {
      let content = blocksOf(ctx, item, { inList: true });
      if (!content) content = '<text:p text:style-name="Standard"/>';
      out += '<text:list-item' + (index === 0 && start > 1 ? ' text:start-value="' + start + '"' : '') + '>' + content + '</text:list-item>';
    });
    ctx.listLevel -= 1;
    out += '</text:list>';
    return ctx.listLevel === 0 ? out + ctx.deferred.splice(0).join('') : out;
  }
  function taskItemXml(ctx, item) {
    const checked = item.getAttribute('data-checked') === 'true';
    const holder = item.querySelector(':scope > div') || item;
    const first = holder.querySelector(':scope > p');
    const children = first ? Array.from(first.childNodes) : Array.from(holder.childNodes).filter(node => !(node.nodeType === 1 && /^(?:LABEL|INPUT|UL|OL)$/.test(node.tagName)));
    let out = paragraphXml(ctx, first || item, children, { prefix: checked ? TASK_MARKERS.on : TASK_MARKERS.off, props: { left: LIST_STEP_CM / CM_PER_PT } });
    holder.querySelectorAll(':scope > ul, :scope > ol').forEach((nested) => { out += listXml(ctx, nested); });
    return out;
  }

  // --- Les tableaux ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const borderOf = value => (value === 'none' ? 'none' : '0.75pt solid ' + (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? value.toLowerCase() : DEFAULT_BORDER));
  function cellStyleOf(ctx, cell, sides) {
    const css = cell.style;
    let fill = css && css.backgroundColor ? cssColorHex(css.backgroundColor) : null;
    // Un fond à motif (js/cell-pattern.js) : l'OpenDocument texte n'a pas de motif de fond de case, la case prend la teinte moyenne du motif sur son fond (à défaut blanc).
    const pattern = CellPattern.parse(cell);
    if (pattern) fill = (CellPattern.averageTone(pattern, fill) || '').replace(/^#/, '') || fill;
    const valign = ExportCommon.cellVerticalAlign(cell);
    const spec = { fill: fill ? '#' + fill.toLowerCase() : '', valign: valign || '', sides: sides ? ['top', 'right', 'bottom', 'left'].map(side => sides[side]) : null };
    return styleNameOf(ctx, 'Cell', JSON.stringify(spec), (name) => {
      const list = [['fo:padding-top', '0.106cm'], ['fo:padding-bottom', '0.106cm'], ['fo:padding-left', '0.159cm'], ['fo:padding-right', '0.159cm']];
      ['top', 'right', 'bottom', 'left'].forEach((side, index) => list.push(['fo:border-' + side, borderOf(spec.sides ? spec.sides[index] : null)]));
      if (spec.fill) list.push(['fo:background-color', spec.fill]);
      if (valign) list.push(['style:vertical-align', valign]);
      return '<style:style style:name="' + name + '" style:family="table-cell"><style:table-cell-properties' + attrsOf(list) + '/></style:style>';
    });
  }
  // La largeur de chaque colonne en points : `colwidth` des cases d'une seule colonne (px), puis les `<col>` du tableau ; une colonne sans mesure prend sa part de ce qui reste.
  function columnWidthsOf(ctx, table, placed, count) {
    const widths = new Array(count).fill(0);
    placed.forEach((cell) => {
      if (cell.colspan !== 1) return;
      const px = parseFloat(String(cell.el.getAttribute('colwidth') || '').split(',')[0]);
      if (px > 0 && !widths[cell.col]) widths[cell.col] = px * PT_PER_PX;
    });
    Array.from(table.querySelectorAll(':scope > colgroup > col')).forEach((col, index) => {
      const px = parseFloat(col.style && col.style.width);
      if (px > 0 && index < count && !widths[index]) widths[index] = px * PT_PER_PX;
    });
    const known = widths.reduce((sum, width) => sum + width, 0);
    const missing = widths.filter(width => !width).length;
    const available = ctx.contentWidthPt || 450;
    if (missing) {
      const share = Math.max(30, (available - known) / missing);
      widths.forEach((width, index) => { if (!width) widths[index] = share; });
    }
    const total = widths.reduce((sum, width) => sum + width, 0);
    // Un tableau plus large que la page est ramené à la largeur utile (l'éditeur le fait défiler, le fichier non).
    return total > available ? widths.map(width => width * available / total) : widths;
  }
  function tableXml(ctx, table) {
    const rows = ExportCommon.tableRows(table);
    if (!rows.length) return '';
    const { placed, width } = ExportCommon.placeCells(rows);
    if (!width) return '';
    const sides = ExportCommon.cellBorderSides(table);
    const widths = columnWidthsOf(ctx, table, placed, width);
    const total = widths.reduce((sum, value) => sum + value, 0);
    const breakBefore = takeBreak(ctx);
    ctx.flow.started = true;
    const tableStyle = styleNameOf(ctx, 'Tab', JSON.stringify({ total: Math.round(total * 10), breakBefore }), name => '<style:style style:name="' + name + '" style:family="table"><style:table-properties style:width="'
      + centimeters(total) + '" table:align="left"' + (breakBefore ? ' fo:break-before="page"' : '') + '/></style:style>');
    ctx.tables += 1;
    let out = '<table:table table:name="Table' + ctx.tables + '" table:style-name="' + tableStyle + '">';
    widths.forEach((value) => {
      const columnStyle = styleNameOf(ctx, 'Col', String(Math.round(value * 10)), name => '<style:style style:name="' + name + '" style:family="table-column"><style:table-column-properties style:column-width="' + centimeters(value) + '"/></style:style>');
      out += '<table:table-column table:style-name="' + columnStyle + '"/>';
    });
    const startOf = new Map(placed.map(cell => [cell.row + ':' + cell.col, cell]));
    const covered = new Set();
    placed.forEach((cell) => { for (let r = 0; r < cell.rowspan; r++) for (let c = 0; c < cell.colspan; c++) if (r || c) covered.add((cell.row + r) + ':' + (cell.col + c)); });
    rows.forEach((tr, r) => {
      const height = ExportCommon.rowHeightPx(tr);
      const rowStyle = height ? styleNameOf(ctx, 'Row', String(Math.round(height)), name => '<style:style style:name="' + name + '" style:family="table-row"><style:table-row-properties style:min-row-height="' + centimeters(height * PT_PER_PX) + '"/></style:style>') : '';
      out += '<table:table-row' + (rowStyle ? ' table:style-name="' + rowStyle + '"' : '') + '>';
      for (let c = 0; c < width; c++) {
        const cell = startOf.get(r + ':' + c);
        if (!cell) { out += covered.has(r + ':' + c) ? '<table:covered-table-cell/>' : '<table:table-cell office:value-type="string"><text:p text:style-name="Standard"/></table:table-cell>'; continue; }
        ctx.depth += 1;
        const content = blocksOf(ctx, cell.el, { inList: false }) || '<text:p text:style-name="Standard"/>';
        ctx.depth -= 1;
        const style = cellStyleOf(ctx, cell.el, sides ? sides.get(cell.el) : null);
        out += '<table:table-cell table:style-name="' + style + '" office:value-type="string"' + (cell.colspan > 1 ? ' table:number-columns-spanned="' + cell.colspan + '"' : '') + (cell.rowspan > 1 ? ' table:number-rows-spanned="' + cell.rowspan + '"' : '') + '>' + content + '</table:table-cell>';
      }
      out += '</table:table-row>';
    });
    return out + '</table:table>';
  }

  // --- Les fichiers du paquet ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const fontFaces = ctx => Array.from(ctx.fonts).map(font => '<style:font-face style:name="' + escAttr(font) + '" svg:font-family="' + escAttr(/\s/.test(font) ? "'" + font + "'" : font) + '"/>').join('');
  // Les six niveaux d'entrée du sommaire : un cran de retrait par niveau, les points de conduite et le numéro de page à droite.
  function contentsStylesXml(contentWidthPt) {
    let out = '';
    for (let level = 1; level <= 6; level++) {
      const left = (level - 1) * 12;
      const right = Math.max(left + 20, (contentWidthPt || 480) - left);
      out += '<style:style style:name="Contents_20_' + level + '" style:display-name="Contents ' + level + '" style:family="paragraph" style:parent-style-name="Index" style:class="index"><style:paragraph-properties fo:margin-left="' + centimeters(left)
        + '" fo:margin-top="0cm" fo:margin-bottom="0.1cm"><style:tab-stops><style:tab-stop style:position="' + centimeters(right) + '" style:type="right" style:leader-char="."/></style:tab-stops></style:paragraph-properties></style:style>';
    }
    return out;
  }
  // Les styles nommés : les valeurs par défaut (police et taille du corps, interligne de l'éditeur), les titres, la citation, le code, le trait, le lien.
  function namedStylesXml(contentWidthPt) {
    const heading = (level) => {
      const size = STYLE.headingPt['H' + level];
      return '<style:style style:name="Heading_20_' + level + '" style:display-name="Heading ' + level + '" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Standard" style:default-outline-level="' + level
        + '"><style:text-properties fo:font-size="' + size + 'pt" fo:font-weight="bold"/></style:style>';
    };
    let out = '<style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="' + fixed(STYLE.lineHeight / STYLE.naturalLine * 100, 1) + '%" style:tab-stop-distance="1.25cm" fo:orphans="2" fo:widows="2"/>'
      + '<style:text-properties style:font-name="' + BODY_FONT + '" fo:font-size="' + STYLE.bodyPt + 'pt" fo:language="fr" fo:country="FR"/></style:default-style>'
      + '<style:style style:name="Standard" style:family="paragraph" style:class="text"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm"/></style:style>'
      + '<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:keep-with-next="always"/>'
      + '<style:text-properties fo:font-weight="bold"/></style:style>';
    for (let level = 1; level <= 6; level++) out += heading(level);
    out += '<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-left="' + centimeters(QUOTE_INDENT_PT) + '" fo:margin-top="0.106cm" fo:margin-bottom="0.106cm"'
      + ' fo:padding-left="0.3cm" fo:border-left="1.5pt solid #d0d7de" fo:border-top="none" fo:border-right="none" fo:border-bottom="none"/><style:text-properties fo:font-style="italic" fo:color="#444444"/></style:style>'
      + '<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:line-height="100%" fo:background-color="'
      + STYLE.codeFillColor + '"/><style:text-properties style:font-name="' + CODE_FONT + '" fo:font-size="' + STYLE.codePt + 'pt"/></style:style>'
      + '<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-top="0.1cm" fo:margin-bottom="0.1cm"'
      + ' fo:border-bottom="0.75pt solid #b8c0c9" fo:border-top="none" fo:border-left="none" fo:border-right="none"/><style:text-properties fo:font-size="2pt"/></style:style>'
      + '<style:style style:name="Index" style:family="paragraph" style:parent-style-name="Standard" style:class="index"/>'
      + '<style:style style:name="Contents_20_Heading" style:display-name="Contents Heading" style:family="paragraph" style:parent-style-name="Index" style:class="index"><style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.2cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>'
      + contentsStylesXml(contentWidthPt)
      + '<style:style style:name="Index_20_Link" style:display-name="Index Link" style:family="text"/>'
      + '<style:style style:name="Footnote" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-left="0.5cm" fo:text-indent="-0.5cm"/><style:text-properties fo:font-size="' + STYLE.bodyPt * 0.85 + 'pt"/></style:style>'
      + '<style:style style:name="Graphics" style:family="graphic"><style:graphic-properties text:anchor-type="paragraph" svg:x="0cm" svg:y="0cm" style:wrap="dynamic" style:number-wrapped-paragraphs="no-limit" style:wrap-contour="false"'
      + ' style:vertical-pos="top" style:vertical-rel="paragraph" style:horizontal-pos="center" style:horizontal-rel="paragraph"/></style:style>'
      + '<style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text"><style:text-properties fo:color="' + STYLE.linkColor + '" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>'
      + '<style:style style:name="Visited_20_Internet_20_Link" style:display-name="Visited Internet Link" style:family="text"><style:text-properties fo:color="#551a8b" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>';
    return out;
  }
  // La bande d'une zone (en-tête ou pied) : la hauteur de la zone de l'éditeur, puis l'écart avec le texte. Sans contenu dans la zone, pas de bande : la page garde sa marge.
  function bandStyleXml(zone, wanted) {
    if (!wanted) return '';
    const height = centimeters(PageLayout.HEADER_FOOTER_ZONE_PX * PT_PER_PX);
    const gap = centimeters(PageLayout.HEADER_FOOTER_GAP_PT);
    return '<style:' + zone + '-style><style:header-footer-properties fo:min-height="' + height + '" fo:margin-' + (zone === 'header' ? 'bottom' : 'top') + '="' + gap + '"/></style:' + zone + '-style>';
  }
  // La page : format et sens (`margins.format`, `margins.orientation`), marges en millimètres.
  function pageLayoutXml(margins, bands) {
    const size = PageLayout.pageSizeMmFor(margins.orientation === 'landscape' ? 'landscape' : 'portrait', margins.format);
    const side = value => fixed((Number.isFinite(value) ? value : PageLayout.DEFAULT_MARGIN_MM) / 10, 3) + 'cm';
    return '<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="' + fixed(size.width / 10, 3) + 'cm" fo:page-height="' + fixed(size.height / 10, 3) + 'cm" style:print-orientation="'
      + (margins.orientation === 'landscape' ? 'landscape' : 'portrait') + '" fo:margin-top="' + side(margins.top) + '" fo:margin-bottom="' + side(margins.bottom) + '" fo:margin-left="' + side(margins.left) + '" fo:margin-right="' + side(margins.right)
      + '" style:writing-mode="lr-tb"/>' + bandStyleXml('header', bands && bands.header) + bandStyleXml('footer', bands && bands.footer) + '</style:page-layout>';
  }
  // `zones` : { bands: { header, footer }, styles: [styles automatiques des zones], master: XML des en-têtes et pieds }.
  const stylesXml = (ctx, margins, zones) => XML_HEAD + '<office:document-styles ' + namespaceAttrs + ' office:version="1.3"><office:font-face-decls>' + fontFaces(ctx) + '</office:font-face-decls><office:styles>' + namedStylesXml(ctx.contentWidthPt)
    + '</office:styles><office:automatic-styles>' + pageLayoutXml(margins, zones.bands) + zones.styles.join('') + '</office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1">' + zones.master
    + '</style:master-page></office:master-styles></office:document-styles>';
  const contentXml = (ctx, body) => XML_HEAD + '<office:document-content ' + namespaceAttrs + ' office:version="1.3"><office:font-face-decls>' + fontFaces(ctx) + '</office:font-face-decls><office:automatic-styles>'
    + ctx.autoStyles.join('') + '</office:automatic-styles><office:body><office:text>' + body + '</office:text></office:body></office:document-content>';
  const metaXml = title => XML_HEAD + '<office:document-meta ' + namespaceAttrs + ' office:version="1.3"><office:meta><meta:generator>' + GENERATOR + '</meta:generator>' + (title ? '<dc:title>' + escText(title) + '</dc:title>' : '')
    + '<meta:creation-date>' + new Date().toISOString().replace(/\.\d+Z$/, '') + '</meta:creation-date></office:meta></office:document-meta>';
  const manifestXml = (ctx) => XML_HEAD + '<manifest:manifest ' + namespaceAttrs + ' manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="' + MIME + '"/>'
    + ['content.xml', 'styles.xml', 'meta.xml'].map(path => '<manifest:file-entry manifest:full-path="' + path + '" manifest:media-type="text/xml"/>').join('')
    + ctx.parts.map(part => '<manifest:file-entry manifest:full-path="' + part.path + '" manifest:media-type="' + part.mediaType + '"/>').join('') + '</manifest:manifest>';

  // --- Les en-têtes et pieds de page ------------------------------------------------------------------------------------------------------------------------------------------------------
  // Les zones comme dans le PDF et le Word : sur toutes les pages dès qu'une variante a du contenu, une variante pour la première page quand elle est demandée.
  function zonesOf(headerFooterData) {
    const enabled = !!(headerFooterData && headerFooterData.enabled);
    const differentFirstPage = enabled && !!headerFooterData.differentFirstPage;
    const variants = differentFirstPage ? ['default', 'first'] : ['default'];
    const html = (zone, variant) => (enabled && headerFooterData[zone] && headerFooterData[zone][variant]) || '';
    return { enabled, variants, html, has: zone => variants.some(variant => PageLayout.hasZoneContent(html(zone, variant))) };
  }
  // Le XML d'une zone. Ses styles automatiques vont dans `styles.xml` (là où l'en-tête est écrit), sous des noms à eux (MP1, MT1...) : ceux du corps sont dans `content.xml` et ne se voient pas d'ici.
  async function zoneContent(ctx, html) {
    const saved = { names: ctx.names, counts: ctx.counts, autoStyles: ctx.autoStyles, namePrefix: ctx.namePrefix, flow: ctx.flow, headings: ctx.headings };
    ctx.names = new Map(); ctx.counts = {}; ctx.autoStyles = []; ctx.namePrefix = 'M'; ctx.flow = { pageBreak: false, started: false }; ctx.headings = new Map();
    try {
      const root = document.createElement('div');
      Dom.setMarkup(root, HtmlSanitize.clean(html || ''));
      Array.from(root.querySelectorAll('.page-break-marker, .toc-marker')).forEach(el => el.remove());
      ReaderMode.trimTrailingBlankBlocks(root);
      await prepareImages(ctx, root);
      const body = blocksOf(ctx, root, {});
      return { body, styles: ctx.autoStyles };
    } finally {
      ctx.names = saved.names; ctx.counts = saved.counts; ctx.autoStyles = saved.autoStyles; ctx.namePrefix = saved.namePrefix; ctx.flow = saved.flow; ctx.headings = saved.headings;
    }
  }
  // Les en-têtes et pieds de la page maîtresse : { bands, styles, master }.
  async function zonesXml(ctx, zones) {
    const out = { bands: { header: zones.has('header'), footer: zones.has('footer') }, styles: [], master: '' };
    for (const zone of ['header', 'footer']) {
      if (!out.bands[zone]) continue;
      for (const variant of zones.variants) {
        const html = zones.html(zone, variant);
        const made = PageLayout.hasZoneContent(html) ? await zoneContent(ctx, html) : { body: '', styles: [] };
        out.styles.push(...made.styles);
        const tag = 'style:' + zone + (variant === 'first' ? '-first' : '');
        out.master += '<' + tag + '>' + (made.body || '<text:p text:style-name="Standard"/>') + '</' + tag + '>';
      }
    }
    return out;
  }

  // Le document : `html` (déjà résolu pour la ligne), `options.headerFooterData` (les zones d'en-tête et de pied, résolues aussi), `options.margins` (en mm : { top, right, bottom, left, orientation, format }, ceux de PageLayout.getMarginsMm() à défaut), `options.title`.
  // Rend { blob, report: [{ key, n }] } : le fichier et ce que le moteur n'a pas repris (jamais perdu en silence).
  async function build(html, options) {
    const opts = options || {};
    await ExportCommon.ensureJsZipLoaded();
    const margins = Object.assign({}, PageLayout.getMarginsMm(), opts.margins || {});
    const size = PageLayout.pageSizeMmFor(margins.orientation === 'landscape' ? 'landscape' : 'portrait', margins.format);
    const zoneSet = zonesOf(opts.headerFooterData);
    const ctx = newContext({
      contentWidthPt: (size.width - (margins.left || 0) - (margins.right || 0)) * PageLayout.MM_TO_PT, marginLeftPt: (margins.left || 0) * PageLayout.MM_TO_PT, marginTopPt: (margins.top || 0) * PageLayout.MM_TO_PT,
      topBandPt: zoneSet.has('header') ? PageLayout.HEADER_FOOTER_ZONE_PX * PT_PER_PX + PageLayout.HEADER_FOOTER_GAP_PT : 0,
    });
    const root = document.createElement('div');
    Dom.setMarkup(root, HtmlSanitize.clean(html || ''));
    ReaderMode.trimTrailingBlankBlocks(root);
    await prepareImages(ctx, root);
    collectHeadings(ctx, root);
    const body = blocksOf(ctx, root, {});
    const zones = await zonesXml(ctx, zoneSet);
    const zip = new JSZip();
    zip.file('mimetype', MIME, { compression: 'STORE' });
    zip.file('META-INF/manifest.xml', manifestXml(ctx), { createFolders: false });
    ctx.parts.forEach(part => zip.file(part.path, part.data, { createFolders: false }));   // pas d'entrée de dossier : « Pictures/ » n'est écrit nulle part
    zip.file('content.xml', contentXml(ctx, body));
    zip.file('styles.xml', stylesXml(ctx, margins, zones));
    zip.file('meta.xml', metaXml(opts.title));
    const blob = await zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' });
    return { blob, report: Array.from(ctx.report.entries()).map(entry => ({ key: entry[0], n: entry[1] })) };
  }

  // Le document d'une ligne : le HTML résolu pour elle (variables remplacées), son nom de fichier, puis le fichier.
  async function getOdtBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, margins) {
    // Comme le Word : les images d'un autre site et les images sans texte alternatif se confirment une fois, avant tout (js/external-images.js, js/alt-reminder.js).
    await ExternalImages.confirmExport(htmlContent, headerFooterData);
    await AltReminder.confirmExport(htmlContent, headerFooterData);
    const { resolvedHtml, filename, resolvedHeaderFooterData } = await ExportCommon.resolveRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData);
    const built = await build(resolvedHtml, { margins, headerFooterData: resolvedHeaderFooterData });
    return { blob: built.blob, filename, report: built.report };
  }
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, margins) {
    if (!record) { alert(I18n.t('alert.noRecordForExportOdf')); return null; }
    const made = await getOdtBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, margins);
    ExportCommon.downloadBlob(made.blob, (made.filename || 'publipostage') + '.odt');
    return made;
  }

  return { build, exportCurrentRecord, getOdtBlobForRecord, MIME };
})();
