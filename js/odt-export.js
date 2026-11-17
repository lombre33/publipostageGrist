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
  const NAMESPACES = [
    ['office', 'urn:oasis:names:tc:opendocument:xmlns:office:1.0'], ['style', 'urn:oasis:names:tc:opendocument:xmlns:style:1.0'], ['text', 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'],
    ['table', 'urn:oasis:names:tc:opendocument:xmlns:table:1.0'], ['draw', 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0'], ['fo', 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0'],
    ['svg', 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0'], ['xlink', 'http://www.w3.org/1999/xlink'], ['dc', 'http://purl.org/dc/elements/1.1/'], ['meta', 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0'],
    ['number', 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0'], ['manifest', 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0'],
  ];
  const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';
  const namespaceAttrs = NAMESPACES.map(entry => 'xmlns:' + entry[0] + '="' + entry[1] + '"').join(' ');
  const BLOCK_TAGS = /^(?:P|H[1-6]|DIV|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|SECTION|ARTICLE|ASIDE|FIGURE|FIGCAPTION|MAIN|NAV|HEADER|FOOTER|DL|DT|DD|ADDRESS)$/;
  const { cssColorHex } = ExportCommon;

  // --- Le XML ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Un texte pour un élément ou un attribut : les caractères que XML 1.0 interdit sont retirés (un seul suffit à rendre tout le fichier illisible), puis les quatre signes réservés sont écrits.
  const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
  const escText = text => String(text === null || text === undefined ? '' : text).replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = text => escText(text).replace(/"/g, '&quot;').replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
  const fixed = (value, digits) => String(Math.round(value * Math.pow(10, digits === undefined ? 3 : digits)) / Math.pow(10, digits === undefined ? 3 : digits));
  const centimeters = points => fixed(points * CM_PER_PT, 3) + 'cm';
  const attrsOf = (list) => list.filter(pair => pair[1] !== null && pair[1] !== undefined && pair[1] !== '').map(pair => ' ' + pair[0] + '="' + escAttr(pair[1]) + '"').join('');
  // Le texte d'un paragraphe comme OpenDocument le lit : les blancs qui se suivent n'en font qu'un, et le premier blanc d'un paragraphe ne compte pas ; une suite d'espaces s'écrit donc `text:s`, une tabulation
  // `text:tab`, un retour à la ligne `text:line-break`. `state.blank` : le caractère d'avant est un blanc (ou le paragraphe commence).
  function textXml(raw, state) {
    const text = String(raw === null || raw === undefined ? '' : raw).replace(INVALID_XML, '').replace(/\r\n?/g, '\n');
    let out = '';
    let index = 0;
    while (index < text.length) {
      const char = text[index];
      if (char === ' ') {
        let run = 1;
        while (text[index + run] === ' ') run += 1;
        if (state.blank) out += '<text:s' + (run > 1 ? ' text:c="' + run + '"' : '') + '/>';
        else out += ' ' + (run > 1 ? '<text:s' + (run > 2 ? ' text:c="' + (run - 1) + '"' : '') + '/>' : '');
        state.blank = true;
        index += run;
      } else if (char === '\t') {
        out += '<text:tab/>';
        state.blank = true;
        index += 1;
      } else if (char === '\n') {
        out += '<text:line-break/>';
        state.blank = true;
        index += 1;
      } else {
        let end = index + 1;
        while (end < text.length && !/[ \t\n]/.test(text[end])) end += 1;
        out += escText(text.slice(index, end));
        state.blank = false;
        index = end;
      }
    }
    return out;
  }

  // --- Les styles : un par réglage différent, nommé P1, T1, Table1... ----------------------------------------------------------------------------------------------------------------------------------
  function newContext(options) {
    return {
      autoStyles: [], names: new Map(), counts: {}, fonts: new Set([BODY_FONT, CODE_FONT]), tables: 0, listLevel: 0, deferred: [], report: new Map(), flow: { pageBreak: false, started: false }, depth: 0,
      contentWidthPt: options.contentWidthPt,
    };
  }
  // Le nom du style de ce genre (`prefix` : P, T, Table...) et de cette clé ; `build(name)` écrit son XML la première fois.
  function styleNameOf(ctx, prefix, key, build) {
    const cacheKey = prefix + '|' + key;
    let styleName = ctx.names.get(cacheKey);
    if (!styleName) {
      ctx.counts[prefix] = (ctx.counts[prefix] || 0) + 1;
      styleName = prefix + ctx.counts[prefix];
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
      if (tag === 'IMG') { countLost(ctx, 'images'); return; }
      if (node.classList && (node.classList.contains('footnote-ref-marker') || node.classList.contains('page-number-badge'))) { countLost(ctx, node.classList.contains('page-number-badge') ? 'fields' : 'notes'); return; }
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
    if (!opts.inList && takeBreak(ctx)) props.breakBefore = true;
    ctx.flow.started = true;
    const state = { blank: true };
    const base = opts.base || STYLE.bodyPt;
    const inner = (opts.prefix ? textXml(opts.prefix, state) : '') + inlineXml(children, Object.assign({}, BASE_LOOK, opts.look || {}), state, ctx, base);
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
    if (el.classList.contains('toc-marker')) { countLost(ctx, 'toc'); return ''; }
    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      return paragraphXml(ctx, el, Array.from(el.childNodes), { parent: 'Heading_20_' + level, level, base: STYLE.headingPt[tag], inList: opts.inList });
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
    const fill = css && css.backgroundColor ? cssColorHex(css.backgroundColor) : null;
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
  // Les styles nommés : les valeurs par défaut (police et taille du corps, interligne de l'éditeur), les titres, la citation, le code, le trait, le lien.
  function namedStylesXml() {
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
      + '<style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text"><style:text-properties fo:color="' + STYLE.linkColor + '" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>'
      + '<style:style style:name="Visited_20_Internet_20_Link" style:display-name="Visited Internet Link" style:family="text"><style:text-properties fo:color="#551a8b" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>';
    return out;
  }
  // La page : format et sens (`margins.format`, `margins.orientation`), marges en millimètres.
  function pageLayoutXml(margins) {
    const size = PageLayout.pageSizeMmFor(margins.orientation === 'landscape' ? 'landscape' : 'portrait', margins.format);
    const side = value => fixed((Number.isFinite(value) ? value : PageLayout.DEFAULT_MARGIN_MM) / 10, 3) + 'cm';
    return '<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="' + fixed(size.width / 10, 3) + 'cm" fo:page-height="' + fixed(size.height / 10, 3) + 'cm" style:print-orientation="'
      + (margins.orientation === 'landscape' ? 'landscape' : 'portrait') + '" fo:margin-top="' + side(margins.top) + '" fo:margin-bottom="' + side(margins.bottom) + '" fo:margin-left="' + side(margins.left) + '" fo:margin-right="' + side(margins.right)
      + '" style:writing-mode="lr-tb"/></style:page-layout>';
  }
  const stylesXml = (ctx, margins) => XML_HEAD + '<office:document-styles ' + namespaceAttrs + ' office:version="1.3"><office:font-face-decls>' + fontFaces(ctx) + '</office:font-face-decls><office:styles>' + namedStylesXml()
    + '</office:styles><office:automatic-styles>' + pageLayoutXml(margins) + '</office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>';
  const contentXml = (ctx, body) => XML_HEAD + '<office:document-content ' + namespaceAttrs + ' office:version="1.3"><office:font-face-decls>' + fontFaces(ctx) + '</office:font-face-decls><office:automatic-styles>'
    + ctx.autoStyles.join('') + '</office:automatic-styles><office:body><office:text>' + body + '</office:text></office:body></office:document-content>';
  const metaXml = title => XML_HEAD + '<office:document-meta ' + namespaceAttrs + ' office:version="1.3"><office:meta><meta:generator>' + GENERATOR + '</meta:generator>' + (title ? '<dc:title>' + escText(title) + '</dc:title>' : '')
    + '<meta:creation-date>' + new Date().toISOString().replace(/\.\d+Z$/, '') + '</meta:creation-date></office:meta></office:document-meta>';
  const manifestXml = () => XML_HEAD + '<manifest:manifest ' + namespaceAttrs + ' manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="' + MIME + '"/>'
    + ['content.xml', 'styles.xml', 'meta.xml'].map(path => '<manifest:file-entry manifest:full-path="' + path + '" manifest:media-type="text/xml"/>').join('') + '</manifest:manifest>';

  // Le document : `html` (déjà résolu pour la ligne), `options.margins` (en mm : { top, right, bottom, left, orientation, format }, ceux de PageLayout.getMarginsMm() à défaut), `options.title`.
  // Rend { blob, report: [{ key, n }] } : le fichier et ce que le moteur n'a pas repris (jamais perdu en silence).
  async function build(html, options) {
    const opts = options || {};
    await ExportCommon.ensureJsZipLoaded();
    const margins = Object.assign({}, PageLayout.getMarginsMm(), opts.margins || {});
    const size = PageLayout.pageSizeMmFor(margins.orientation === 'landscape' ? 'landscape' : 'portrait', margins.format);
    const ctx = newContext({ contentWidthPt: (size.width - (margins.left || 0) - (margins.right || 0)) * PageLayout.MM_TO_PT });
    const root = document.createElement('div');
    Dom.setMarkup(root, HtmlSanitize.clean(html || ''));
    ReaderMode.trimTrailingBlankBlocks(root);
    const body = blocksOf(ctx, root, {});
    const zip = new JSZip();
    zip.file('mimetype', MIME, { compression: 'STORE' });
    zip.file('META-INF/manifest.xml', manifestXml());
    zip.file('content.xml', contentXml(ctx, body));
    zip.file('styles.xml', stylesXml(ctx, margins));
    zip.file('meta.xml', metaXml(opts.title));
    const blob = await zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' });
    return { blob, report: Array.from(ctx.report.entries()).map(entry => ({ key: entry[0], n: entry[1] })) };
  }

  // Le document d'une ligne : le HTML résolu pour elle (variables remplacées), son nom de fichier, puis le fichier.
  async function getOdtBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, margins) {
    const { resolvedHtml, filename } = await ExportCommon.resolveRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData);
    const built = await build(resolvedHtml, { margins });
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
