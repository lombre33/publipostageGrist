// Export OpenDocument présentation : la présentation en un fichier .odp (LibreOffice Impress, OnlyOffice, Collabora...), SANS bibliothèque de plus : le zip (JSZip, déjà chargé) et son XML sont écrits à la main, comme
// l'import les lit (js/odp-import.js, qui sert d'essai d'aller-retour).
//
// La présentation se lit EXACTEMENT comme pour PowerPoint (js/pptx-export.js : les boîtes de texte, les listes, les formes, les traits, les images, les tableaux, le décor du thème, tous mesurés dans l'éditeur) : l'export
// PowerPoint fabrique son fichier, que ce fichier-ci relit (le DrawingML qu'il a écrit lui-même, donc connu à la virgule près) pour l'écrire en OpenDocument. Un seul lecteur de la diapositive pour les deux formats :
// une correction de la mesure vaut pour l'un et pour l'autre. Le repère de chaque diapositive (js/slide-props.js : transition, passage au temps, notes, masquée) est lu dans l'éditeur, sans détour.
//  - Le texte : un paragraphe par paragraphe, une liste OpenDocument par suite de puces (ses niveaux, sa numérotation), une série de caractères par style (police, taille, gras, italique, souligné, barré, couleur,
//    surlignage, exposant, lien, ombre et contour).
//  - Les formes : le tracé de la forme (js/shape-presets.js, celui de PowerPoint) est écrit en chemin (`draw:enhanced-path`) : LibreOffice ne dessine pas une forme de la norme sans son tracé. Les traits ont leurs pointes
//    et leurs tirets, les images leur texte alternatif, les tableaux leurs cases fusionnées, leurs bords et leurs fonds.
//  - Le décor du thème (bandeau, logo, numéro, pied) est celui de la page maîtresse ; la première diapositive a la sienne quand le décor n'est « ni numéro ni pied sur la première ».
// Ce que le fichier ne reprend pas est dit (`report`) : les animations d'objets, les objets masqués (écartés), une transition que l'OpenDocument n'a pas (remplacée par un fondu), les faces éclaircies ou assombries des formes
// (la même couleur partout), les graphiques créés (repris en image, plus modifiables).
const OdpExport = (function () {
  const MIME = 'application/vnd.oasis.opendocument.presentation';
  const GENERATOR = 'Grist Factory';
  const { XML_HEAD, NAMESPACES, escText, escAttr, fixed, attrsOf, textXml } = ExportCommon.OdfXml;
  const { kids, kid, descendants, localAttr, relAttr } = ExportCommon.Ooxml;
  const NAMESPACE_ATTRS = NAMESPACES.concat([
    ['presentation', 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0'], ['smil', 'urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0'], ['anim', 'urn:oasis:names:tc:opendocument:xmlns:animation:1.0'],
    ['script', 'urn:oasis:names:tc:opendocument:xmlns:script:1.0'], ['dom', 'http://www.w3.org/2001/xml-events'], ['loext', 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0'],
  ]).map(([prefix, uri]) => 'xmlns:' + prefix + '="' + uri + '"').join(' ');
  const EMU_PER_CM = 360000;
  const EMU_PER_PT = 12700;
  const MAX_PART_BYTES = 64 * 1024 * 1024;
  const SCHEME_SLOTS = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
  const IMAGE_TYPES = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', gif: 'image/gif' };
  const JUMPS = { nextslide: 'next-page', previousslide: 'previous-page', firstslide: 'first-page', lastslide: 'last-page', endshow: 'stop' };
  const GENERIC_FONTS = { 34: 'swiss', 18: 'roman', 49: 'modern' };
  const NUMBER_FORMATS = { arabicPeriod: ['1', '.'], alphaLcPeriod: ['a', '.'], alphaUcPeriod: ['A', '.'], romanLcPeriod: ['i', '.'], romanUcPeriod: ['I', '.'] };
  const UNDERLINES = { sng: ['solid', 'single'], dbl: ['solid', 'double'], dotted: ['dotted', 'single'], dash: ['dash', 'single'], wavy: ['wave', 'single'] };
  // Les tirets de PowerPoint (`a:prstDash`) : des couples (trait, blanc) en largeurs de trait.
  const DASHES = {
    dot: [[1, 3]], dash: [[4, 3]], lgDash: [[8, 3]], dashDot: [[4, 3], [1, 3]], lgDashDot: [[8, 3], [1, 3]], lgDashDotDot: [[8, 3], [1, 3], [1, 3]],
    sysDash: [[3, 1]], sysDot: [[1, 1]], sysDashDot: [[3, 1], [1, 1]], sysDashDotDot: [[3, 1], [1, 1], [1, 1]],
  };
  // Les pointes de PowerPoint : le tracé de la pointe (pointe en haut, comme LibreOffice les dessine), sa boîte, et si elle est centrée sur le bout du trait.
  const MARKERS = {
    triangle: { name: 'Triangle', box: '0 0 20 30', path: 'M10 0L0 30H20Z', center: false },
    stealth: { name: 'Stealth', box: '0 0 20 30', path: 'M10 0L0 30L10 22L20 30Z', center: false },
    arrow: { name: 'OpenArrow', box: '0 0 20 30', path: 'M10 0L20 27L17 30L10 12L3 30L0 27Z', center: false },
    diamond: { name: 'Diamond', box: '0 0 20 20', path: 'M10 0L20 10L10 20L0 10Z', center: true },
    oval: { name: 'Oval', box: '0 0 20 20', path: 'M10 0C15.5 0 20 4.5 20 10C20 15.5 15.5 20 10 20C4.5 20 0 15.5 0 10C0 4.5 4.5 0 10 0Z', center: true },
  };
  const MARKER_WIDTH = { sm: 2, med: 3, lg: 5 };
  // La transition de l'éditeur (js/slide-props.js) en OpenDocument : [type, sous-type] ; le côté d'où la diapositive arrive suit l'import (js/odp-import.js : SIDES).
  const SIDE_TO_SUBTYPE = { push: { r: 'fromLeft', l: 'fromRight', b: 'fromTop', t: 'fromBottom' }, wipe: { r: 'leftToRight', l: 'rightToLeft', b: 'topToBottom', t: 'bottomToTop' } };
  const TRANSITIONS = {
    fade: () => ['fade', 'crossfade'],
    push: props => ['pushWipe', SIDE_TO_SUBTYPE.push[props.from] || 'fromLeft'],
    cover: props => ['slideWipe', SIDE_TO_SUBTYPE.push[props.from] || 'fromLeft'],
    uncover: props => ['slideWipe', SIDE_TO_SUBTYPE.push[props.from] || 'fromLeft', 'reverse'],
    wipe: props => ['barWipe', SIDE_TO_SUBTYPE.wipe[props.from] || 'leftToRight'],
    split: props => ['barnDoorWipe', props.from === 'r' || props.from === 'l' ? 'vertical' : 'horizontal'],
    blinds: props => ['blindsWipe', props.from === 'r' || props.from === 'l' ? 'vertical' : 'horizontal'],
    circle: () => ['ellipseWipe', 'circle'],
    diamond: () => ['irisWipe', 'diamond'],
    plus: () => ['fourBoxWipe', 'cornersIn'],
  };
  const NO_PROPS = { transition: '', from: 'r', dur: 700, bg: '', notes: '', hidden: false, advance: 0 };

  // --- Petites aides ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const cm = emu => fixed(emu / EMU_PER_CM, 3) + 'cm';
  const pt = hundredths => fixed(hundredths / 100, 2) + 'pt';
  const intAttr = (el, name, fallback) => {
    const raw = el ? localAttr(el, name) : null;
    const n = raw === null || raw === '' ? NaN : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const flag = (el, name) => !!el && (localAttr(el, name) === '1' || localAttr(el, name) === 'true');
  const lose = (ctx, key, n = 1) => ctx.lost.set(key, (ctx.lost.get(key) || 0) + n);
  const hexOf = value => '#' + String(value).replace('#', '').toLowerCase();
  // Un nom de style : les styles d'un même jeu de propriétés ne sont écrits qu'une fois. `reg` : le registre du fichier (le contenu, ou la page maîtresse).
  function newRegistry(tag) {
    const known = new Map();
    const counts = {};
    return {
      xml: [],
      named(prefix, key, make) {
        const full = prefix + '\u0000' + key;
        if (known.has(full)) return known.get(full);
        counts[prefix] = (counts[prefix] || 0) + 1;
        const name = tag + prefix + counts[prefix];
        known.set(full, name);
        this.xml.push(make(name));
        return name;
      },
    };
  }
  const fontFaces = fonts => Array.from(fonts, ([family, pitch]) => '<style:font-face style:name="' + escAttr(family) + '" svg:font-family="' + escAttr(/\s/.test(family) ? "'" + family + "'" : family) + '"'
    + (GENERIC_FONTS[pitch] ? ' style:font-family-generic="' + GENERIC_FONTS[pitch] + '"' : '') + (pitch === 49 ? ' style:font-pitch="fixed"' : '') + '/>').join('');

  // --- Les couleurs, les traits, les remplissages du DrawingML -------------------------------------------------------------------------------------------------------------------
  // Le thème du fichier (ppt/theme/theme1.xml) : ses couleurs (`dk1`, `lt1`, `accent1`...) et ses deux polices.
  function themeOf(doc) {
    const out = { colors: { dk1: '#1b2430', lt1: '#ffffff', dk2: '#44546a', lt2: '#e7e6e6' }, major: 'Arial', minor: 'Arial' };
    if (!doc) return out;
    const scheme = descendants(doc.documentElement, 'clrScheme')[0];
    kids(scheme).forEach((slot) => {
      const spec = kids(slot)[0];
      const raw = spec ? localAttr(spec, 'val') : null;
      if (raw && /^[0-9a-f]{6}$/i.test(raw)) out.colors[slot.localName] = hexOf(raw);
    });
    const face = name => { const holder = descendants(doc.documentElement, name)[0]; const latin = holder && kid(holder, 'latin'); return latin ? localAttr(latin, 'typeface') : null; };
    out.major = face('majorFont') || out.major;
    out.minor = face('minorFont') || out.minor;
    return out;
  }
  // Une couleur : { hex, tr } (`tr` : la transparence en pour cent) ; `holder` : un `a:solidFill`, ou la couleur elle-même.
  function colorOf(env, holder) {
    const spec = holder && (holder.localName === 'srgbClr' || holder.localName === 'schemeClr' ? holder : kid(holder, ['srgbClr', 'schemeClr']));
    if (!spec) return null;
    const raw = localAttr(spec, 'val') || '';
    const hex = spec.localName === 'srgbClr' ? hexOf(raw) : env.ctx.theme.colors[SCHEME_SLOTS[raw] || raw];
    if (!hex) return null;
    const alpha = kid(spec, 'alpha');
    return { hex, tr: alpha ? Math.max(0, Math.min(100, Math.round(100 - intAttr(alpha, 'val', 100000) / 1000))) : 0 };
  }
  const fillOf = (env, holder) => {
    const fill = holder && kids(holder).find(el => /^(noFill|solidFill|gradFill|blipFill|pattFill)$/.test(el.localName));
    return fill && fill.localName === 'solidFill' ? colorOf(env, fill) : null;
  };
  function endOf(el) {
    const type = el ? localAttr(el, 'type') : null;
    return type && type !== 'none' && MARKERS[type] ? { type, w: localAttr(el, 'w') || 'med' } : null;
  }
  // Le trait (`a:ln`) : null quand il n'y en a pas.
  function lineOf(env, ln) {
    const fill = ln && kids(ln).find(el => /^(noFill|solidFill)$/.test(el.localName));
    if (!fill || fill.localName === 'noFill') return null;
    const preset = kid(ln, 'prstDash');
    const custom = kid(ln, 'custDash');
    let dash = null;
    if (preset && DASHES[localAttr(preset, 'val')]) dash = DASHES[localAttr(preset, 'val')];
    else if (custom) dash = kids(custom, 'ds').map(el => [intAttr(el, 'd', 100000) / 100000, intAttr(el, 'sp', 100000) / 100000]);
    return {
      w: intAttr(ln, 'w', 12700), color: colorOf(env, fill), dash: dash && dash.length ? dash : null, cap: localAttr(ln, 'cap'),
      join: kid(ln, 'round') ? 'round' : (kid(ln, 'bevel') ? 'bevel' : (kid(ln, 'miter') ? 'miter' : '')), head: endOf(kid(ln, 'headEnd')), tail: endOf(kid(ln, 'tailEnd')), compound: localAttr(ln, 'cmpd'),
    };
  }
  // Les définitions que `office:styles` porte : les tirets et les pointes, une fois chacune.
  function dashName(ctx, pairs) {
    const key = JSON.stringify(pairs);
    if (!ctx.dashes.has(key)) ctx.dashes.set(key, 'Dash' + (ctx.dashes.size + 1));
    return ctx.dashes.get(key);
  }
  const percent = value => fixed(value * 100, 0) + '%';
  function dashesXml(ctx) {
    return Array.from(ctx.dashes, ([key, name]) => {
      const pairs = JSON.parse(key);
      const first = pairs[0];
      const second = pairs[1];
      const spaces = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
      return '<draw:stroke-dash draw:name="' + name + '" draw:display-name="' + name + '" draw:style="rect" draw:dots1="1" draw:dots1-length="' + percent(first[0]) + '"'
        + (second ? ' draw:dots2="1" draw:dots2-length="' + percent(second[0]) + '"' : '') + ' draw:distance="' + percent(spaces) + '"/>';
    }).join('');
  }
  const markersXml = ctx => Array.from(ctx.markers, type => '<draw:marker draw:name="' + MARKERS[type].name + '" svg:viewBox="' + MARKERS[type].box + '" svg:d="' + MARKERS[type].path + '"/>').join('');

  // --- Le texte --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Les propriétés d'une série de caractères (`a:rPr`, `a:endParaRPr`) : celles que l'export PowerPoint a écrites (js/pptx-export.js:runPropertiesXml).
  function runStyleOf(env, rPr) {
    const latin = rPr && kid(rPr, 'latin');
    const typeface = latin ? localAttr(latin, 'typeface') : null;
    const family = !typeface ? 'Arial' : (typeface === '+mn-lt' ? env.ctx.theme.minor : (typeface === '+mj-lt' ? env.ctx.theme.major : typeface));
    const fill = rPr && kids(rPr, 'solidFill')[0];
    const highlight = rPr && kid(rPr, 'highlight');
    const shadow = rPr && kid(rPr, 'effectLst');
    return {
      sz: intAttr(rPr, 'sz', 1800), b: flag(rPr, 'b'), i: flag(rPr, 'i'), u: rPr ? localAttr(rPr, 'u') || '' : '', strike: !!rPr && /Strike$/.test(localAttr(rPr, 'strike') || '') && localAttr(rPr, 'strike') !== 'noStrike',
      spc: intAttr(rPr, 'spc', 0), cap: rPr ? localAttr(rPr, 'cap') || '' : '', baseline: intAttr(rPr, 'baseline', 0), color: fill ? colorOf(env, fill) : null,
      highlight: highlight ? colorOf(env, highlight) : null, family, pitch: latin ? intAttr(latin, 'pitchFamily', 34) : 34, link: rPr ? kid(rPr, 'hlinkClick') : null,
      shadow: !!(shadow && kid(shadow, 'outerShdw')), outline: !!(rPr && kid(rPr, 'ln')),
    };
  }
  function textStyleName(env, st) {
    const color = (st.color && st.color.hex) || env.defaultColor;
    const [underline, kind] = UNDERLINES[st.u] || ['none', 'single'];
    const props = ['style:font-name="' + escAttr(st.family) + '"', 'fo:font-size="' + pt(st.sz) + '"', 'fo:color="' + color + '"'];
    props.push('fo:font-weight="' + (st.b ? 'bold' : 'normal') + '"', 'fo:font-style="' + (st.i ? 'italic' : 'normal') + '"');
    if (st.u && underline !== 'none') props.push('style:text-underline-style="' + underline + '"', 'style:text-underline-type="' + kind + '"', 'style:text-underline-width="auto"', 'style:text-underline-color="font-color"');
    else props.push('style:text-underline-style="none"');
    props.push(st.strike ? 'style:text-line-through-style="solid" style:text-line-through-type="single"' : 'style:text-line-through-style="none"');
    if (st.spc) props.push('fo:letter-spacing="' + pt(st.spc) + '"');
    if (st.cap === 'all') props.push('fo:text-transform="uppercase"');
    else if (st.cap === 'small') props.push('fo:font-variant="small-caps"');
    if (st.baseline) props.push('style:text-position="' + (st.baseline > 0 ? '30%' : '-25%') + ' 58%"');
    if (st.highlight) props.push('fo:background-color="' + st.highlight.hex + '"');
    if (st.shadow) props.push('fo:text-shadow="1pt 1pt"');
    if (st.outline) props.push('style:text-outline="true"');
    env.ctx.fonts.set(st.family, st.pitch);
    return env.reg.named('T', props.join(' '), name => '<style:style style:name="' + name + '" style:family="text"><style:text-properties ' + props.join(' ') + '/></style:style>');
  }
  // Ce que le lien d'une série de caractères ou d'un objet vise : une adresse, ou la page d'une diapositive du fichier ; null sinon.
  function targetOf(env, link) {
    const id = link ? relAttr(link, 'id') : null;
    const rel = id ? env.rels.byId.get(id) : null;
    if (!rel) return null;
    if (rel.external) return rel.href;
    const slide = /(?:^|\/)slide(\d+)\.xml$/.exec(rel.target || '');
    return slide ? '#page' + slide[1] : null;
  }
  // Un paragraphe de `a:txBody` en modèle : ses retraits, son alignement, ses espaces, sa puce et ses séries de caractères.
  function paragraphOf(env, para) {
    const pPr = kid(para, 'pPr');
    const model = {
      marL: intAttr(pPr, 'marL', 0), indent: intAttr(pPr, 'indent', 0), level: intAttr(pPr, 'lvl', 0), align: (pPr && localAttr(pPr, 'algn')) || 'l', rtl: flag(pPr, 'rtl'), tab: intAttr(pPr, 'defTabSz', 0),
      line: null, before: 0, after: 0, bullet: null, runs: [], end: null, list: false,
    };
    kids(pPr).forEach((el) => {
      const name = el.localName;
      const first = kids(el)[0];
      if (name === 'lnSpc' && first) model.line = first.localName === 'spcPct' ? { pct: intAttr(first, 'val', 100000) / 1000 } : { pt: intAttr(first, 'val', 1200) / 100 };
      else if ((name === 'spcBef' || name === 'spcAft') && first && first.localName === 'spcPts') model[name === 'spcBef' ? 'before' : 'after'] = intAttr(first, 'val', 0) / 100;
      else if (name === 'buChar') model.bullet = Object.assign(model.bullet || {}, { kind: 'char', char: localAttr(el, 'char') || '•' });
      else if (name === 'buAutoNum') model.bullet = Object.assign(model.bullet || {}, { kind: 'num', type: localAttr(el, 'type') || 'arabicPeriod', start: intAttr(el, 'startAt', 1) });
      else if (name === 'buFont') model.bullet = Object.assign(model.bullet || {}, { font: localAttr(el, 'typeface') });
      else if (name === 'buClr') model.bullet = Object.assign(model.bullet || {}, { color: colorOf(env, el) });
      else if (name === 'buSzPct') model.bullet = Object.assign(model.bullet || {}, { size: intAttr(el, 'val', 100000) / 1000 });
    });
    if (model.bullet && !model.bullet.kind) model.bullet = null;
    model.list = !!model.bullet;
    kids(para).forEach((el) => {
      const name = el.localName;
      if (name === 'r' || name === 'fld') {
        const text = kid(el, 't');
        model.runs.push({ text: text ? text.textContent : '', field: name === 'fld', st: runStyleOf(env, kid(el, 'rPr')) });
      } else if (name === 'br') model.runs.push({ br: true, st: runStyleOf(env, kid(el, 'rPr')) });
      else if (name === 'endParaRPr') model.end = runStyleOf(env, el);
    });
    return model;
  }
  function paragraphStyleName(env, model) {
    const props = [];
    const para = [];
    const list = model.list;
    // Un paragraphe de liste prend ses retraits de la liste (son niveau) ; un autre, les siens.
    para.push('fo:margin-left="' + (list ? '0cm' : cm(model.marL)) + '"', 'fo:margin-right="0cm"', 'fo:text-indent="' + (list ? '0cm' : cm(model.indent)) + '"');
    const align = { l: model.rtl ? 'end' : 'start', r: model.rtl ? 'start' : 'end', ctr: 'center', just: 'justify' }[model.align] || 'start';
    para.push('fo:text-align="' + align + '"');
    if (model.rtl) para.push('style:writing-mode="rl-tb"');
    if (model.line) para.push('fo:line-height="' + (model.line.pct ? fixed(model.line.pct, 1) + '%' : fixed(model.line.pt * 12700 / EMU_PER_CM, 3) + 'cm') + '"');
    para.push('fo:margin-top="' + cm(model.before * EMU_PER_PT) + '"', 'fo:margin-bottom="' + cm(model.after * EMU_PER_PT) + '"');
    // L'interligne se compte sur la taille de la police, comme PowerPoint (et l'export PowerPoint) le font : pas sur la hauteur de ligne propre à la police.
    para.push('style:font-independent-line-spacing="true"');
    if (model.tab) para.push('style:tab-stop-distance="' + cm(model.tab) + '"');
    // Le style de la fin du paragraphe : la taille d'un paragraphe vide, la police.
    const end = model.end || (model.runs[0] && model.runs[0].st);
    if (end) {
      env.ctx.fonts.set(end.family, end.pitch);
      props.push('style:font-name="' + escAttr(end.family) + '"', 'fo:font-size="' + pt(end.sz) + '"', 'fo:color="' + ((end.color && end.color.hex) || env.defaultColor) + '"');
    }
    const body = '<style:paragraph-properties ' + para.join(' ') + '/>' + (props.length ? '<style:text-properties ' + props.join(' ') + '/>' : '');
    return env.reg.named('P', body, name => '<style:style style:name="' + name + '" style:family="paragraph">' + body + '</style:style>');
  }
  function runXml(env, run, number) {
    if (run.br) return '<text:line-break/>';
    const style = textStyleName(env, run.st);
    let inner;
    if (run.field) inner = '<text:page-number text:select-page="current">' + escText(run.text || String(number)) + '</text:page-number>';
    else inner = textXml(run.text, env.blank);
    const target = run.st.link ? targetOf(env, run.st.link) : null;
    if (target) inner = '<text:a xlink:type="simple" xlink:href="' + escAttr(target) + '">' + inner + '</text:a>';
    return '<text:span text:style-name="' + style + '">' + inner + '</text:span>';
  }
  function paragraphXml(env, model) {
    env.blank = { blank: true };
    const inner = model.runs.map(run => runXml(env, run, env.number)).join('');
    return '<text:p text:style-name="' + paragraphStyleName(env, model) + '">' + inner + '</text:p>';
  }
  // Le style d'une suite de puces : un niveau par niveau utilisé (le premier paragraphe de ce niveau en donne la forme et les retraits).
  function listStyleName(env, group) {
    const levels = new Map();
    group.forEach((model) => { if (!levels.has(model.level)) levels.set(model.level, model); });
    const depth = Math.max(...levels.keys());
    const sorted = [];
    for (let level = 0; level <= depth; level += 1) {
      const known = levels.get(level) || levels.get(Math.max(...Array.from(levels.keys()).filter(n => n < level), -1)) || group[0];
      sorted.push(known);
    }
    const levelXml = sorted.map((model, level) => {
      const bullet = model.bullet;
      const hang = Math.max(0, -model.indent);
      const geometry = '<style:list-level-properties text:space-before="' + cm(Math.max(0, model.marL - hang)) + '" text:min-label-width="' + cm(hang) + '"/>';
      let font = bullet.font && !/^\+/.test(bullet.font) ? bullet.font : null;
      let char = bullet.char;
      if (font === 'Wingdings' && char === '§') { font = 'Arial'; char = '▪'; }
      if (font) env.ctx.fonts.set(font, 34);
      const text = '<style:text-properties' + (font ? ' style:font-name="' + escAttr(font) + '"' : '') + (bullet.color ? ' fo:color="' + bullet.color.hex + '"' : '') + ' fo:font-size="' + fixed(bullet.size || 100, 0) + '%"/>';
      if (bullet.kind === 'num') {
        const [format, suffix] = NUMBER_FORMATS[bullet.type] || NUMBER_FORMATS.arabicPeriod;
        return '<text:list-level-style-number text:level="' + (level + 1) + '" style:num-suffix="' + suffix + '" style:num-format="' + format + '"' + (bullet.start > 1 ? ' text:start-value="' + bullet.start + '"' : '') + '>' + geometry + text + '</text:list-level-style-number>';
      }
      return '<text:list-level-style-bullet text:level="' + (level + 1) + '" text:bullet-char="' + escAttr(char) + '">' + geometry + text + '</text:list-level-style-bullet>';
    }).join('');
    return env.reg.named('L', levelXml, name => '<text:list-style style:name="' + name + '">' + levelXml + '</text:list-style>');
  }
  // Une suite de paragraphes de liste en `text:list` emboîtées : un niveau de plus ouvre une liste dans le point en cours, un niveau de moins en referme.
  function listXml(env, group) {
    const style = listStyleName(env, group);
    let out = '';
    let depth = 0;
    group.forEach((model) => {
      const target = model.level + 1;
      while (depth > target) { out += '</text:list-item></text:list>'; depth -= 1; }
      if (depth === target) out += '</text:list-item><text:list-item>';
      while (depth < target) { out += (depth === 0 ? '<text:list text:style-name="' + style + '">' : '<text:list>') + '<text:list-item>'; depth += 1; }
      out += paragraphXml(env, model);
    });
    while (depth > 0) { out += '</text:list-item></text:list>'; depth -= 1; }
    return out;
  }
  // Le corps d'un texte (`a:txBody`, ou le texte d'une case) : ses paragraphes, les suites de puces en listes.
  function bodyXml(env, txBody) {
    const models = kids(txBody, 'p').map(para => paragraphOf(env, para));
    let out = '';
    let group = [];
    const flush = () => { if (group.length) out += listXml(env, group); group = []; };
    // Une suite de puces d'une même sorte (le signe ou la numérotation de chaque niveau) : une autre sorte au même niveau ouvre une autre liste (la numérotation repart).
    const signature = model => [model.bullet.kind, model.bullet.char, model.bullet.type, model.bullet.font].join('|');
    models.forEach((model) => {
      if (model.list) {
        const same = group.find(other => other.level === model.level);
        if (same && signature(same) !== signature(model)) flush();
        group.push(model);
        return;
      }
      flush();
      out += paragraphXml(env, model);
    });
    flush();
    return out || '<text:p/>';
  }

  // --- Les formes -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function boxOf(holder) {
    const xfrm = holder && (kid(holder, 'xfrm') || kid(kid(holder, 'spPr'), 'xfrm'));
    const off = xfrm && kid(xfrm, 'off');
    const ext = xfrm && kid(xfrm, 'ext');
    return { x: intAttr(off, 'x', 0), y: intAttr(off, 'y', 0), w: intAttr(ext, 'cx', 0), h: intAttr(ext, 'cy', 0), rot: intAttr(xfrm, 'rot', 0) / 60000, flipH: flag(xfrm, 'flipH'), flipV: flag(xfrm, 'flipV') };
  }
  // La place d'un objet : sa position et sa taille, ou sa taille et sa transformation quand il est tourné (le coin haut gauche tourné, que l'import relit).
  function placeAttrs(box) {
    const size = ' svg:width="' + cm(box.w) + '" svg:height="' + cm(box.h) + '"';
    if (!box.rot) return size + ' svg:x="' + cm(box.x) + '" svg:y="' + cm(box.y) + '"';
    const turn = box.rot * Math.PI / 180;
    const dx = box.w / 2;
    const dy = box.h / 2;
    const left = box.x + dx - (dx * Math.cos(turn) - dy * Math.sin(turn));
    const top = box.y + dy - (dx * Math.sin(turn) + dy * Math.cos(turn));
    return size + ' draw:transform="rotate (' + fixed(-turn, 6) + ') translate (' + cm(left) + ' ' + cm(top) + ')"';
  }
  // Le tracé d'une forme en `draw:enhanced-path` et le rectangle de son texte, dans une boîte de `w` sur `h` centièmes de point.
  const hundredth = value => String(Math.round(value * 100));
  function pathOf(env, spPr, box) {
    const wPt = box.w / EMU_PER_PT;
    const hPt = box.h / EMU_PER_PT;
    const width = Math.max(1, Math.round(wPt * 100));
    const height = Math.max(1, Math.round(hPt * 100));
    let paths = [];
    let text = [0, 0, wPt, hPt];
    const preset = kid(spPr, 'prstGeom');
    const custom = kid(spPr, 'custGeom');
    if (preset) {
      const kind = localAttr(preset, 'prst') || 'rect';
      const adj = {};
      descendants(preset, 'gd').forEach((guide) => { adj[localAttr(guide, 'name')] = Number(String(localAttr(guide, 'fmla') || '').replace(/^val\s+/, '')); });
      paths = ShapePresets.paths(kind, wPt, hPt, adj);
      if (paths.length) text = ShapePresets.textRect(kind, wPt, hPt, adj);
    } else if (custom) {
      const guides = {};
      descendants(custom, 'gd').forEach((guide) => {
        const found = /^\*\/\s+(w|h)\s+(-?\d+)\s+(\d+)$/.exec(localAttr(guide, 'fmla') || '');
        if (found) guides[localAttr(guide, 'name')] = (found[1] === 'w' ? wPt : hPt) * Number(found[2]) / Number(found[3]);
      });
      const rect = kid(custom, 'rect');
      if (rect) text = ['l', 't', 'r', 'b'].map((side, i) => (guides[localAttr(rect, side)] !== undefined ? guides[localAttr(rect, side)] : [0, 0, wPt, hPt][i]));
      paths = descendants(custom, 'path').map((path) => {
        const sx = wPt / (intAttr(path, 'w', wPt * 100) || 1);
        const sy = hPt / (intAttr(path, 'h', hPt * 100) || 1);
        const point = el => { const at = kid(el, 'pt'); return [intAttr(at, 'x', 0) * sx, intAttr(at, 'y', 0) * sy]; };
        const commands = [];
        kids(path).forEach((el) => {
          if (el.localName === 'moveTo') commands.push(['M'].concat(point(el)));
          else if (el.localName === 'lnTo') commands.push(['L'].concat(point(el)));
          else if (el.localName === 'cubicBezTo') { const pts = kids(el, 'pt'); commands.push(['C'].concat(...pts.map(at => [intAttr(at, 'x', 0) * sx, intAttr(at, 'y', 0) * sy]))); }
          else if (el.localName === 'close') commands.push(['Z']);
        });
        const fill = localAttr(path, 'fill');
        return { fill: fill === 'none' ? '' : (fill || 'norm'), stroke: localAttr(path, 'stroke') !== '0', commands };
      });
    }
    if (!paths.length) paths = [{ fill: 'norm', stroke: true, commands: [['M', 0, 0], ['L', wPt, 0], ['L', wPt, hPt], ['L', 0, hPt], ['Z']] }];
    if (paths.some(item => item.fill && item.fill !== 'norm')) lose(env.ctx, 'shading');
    const flipX = value => (box.flipH ? wPt - value : value);
    const flipY = value => (box.flipV ? hPt - value : value);
    const words = [];
    paths.forEach((item) => {
      if (!item.commands.length) return;
      if (!item.fill) words.push('F');
      if (!item.stroke) words.push('S');
      item.commands.forEach((command) => {
        if (command[0] === 'Z') { words.push('Z'); return; }
        const numbers = [];
        for (let i = 1; i < command.length; i += 2) numbers.push(hundredth(flipX(command[i])), hundredth(flipY(command[i + 1])));
        words.push(command[0] + ' ' + numbers.join(' '));
      });
      words.push('N');
    });
    const rect = [flipX(text[0]), flipY(text[1]), flipX(text[2]), flipY(text[3])];
    const area = [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])];
    return { viewBox: '0 0 ' + width + ' ' + height, path: words.join(' '), text: area.map(hundredth).join(' ') };
  }
  // Le style graphique d'un objet : fond, trait (et ses pointes), marges du texte, alignement vertical, hauteur qui suit le texte, colonnes, texte alternatif « décoratif ».
  function graphicStyleName(env, spec) {
    const props = [];
    if (spec.fill) props.push('draw:fill="solid"', 'draw:fill-color="' + spec.fill.hex + '"', 'draw:opacity="' + (100 - spec.fill.tr) + '%"');
    else props.push('draw:fill="none"');
    const line = spec.line;
    if (line) {
      const width = line.w / EMU_PER_CM;
      props.push('draw:stroke="' + (line.dash ? 'dash' : 'solid') + '"');
      if (line.dash) props.push('draw:stroke-dash="' + dashName(env.ctx, line.dash) + '"');
      props.push('svg:stroke-width="' + fixed(width, 3) + 'cm"', 'svg:stroke-color="' + (line.color ? line.color.hex : '#000000') + '"');
      if (line.color && line.color.tr) props.push('svg:stroke-opacity="' + (100 - line.color.tr) + '%"');
      if (line.cap === 'rnd') props.push('svg:stroke-linecap="round"');
      else if (line.cap === 'sq') props.push('svg:stroke-linecap="square"');
      if (line.join) props.push('draw:stroke-linejoin="' + line.join + '"');
      [['start', line.head], ['end', line.tail]].forEach(([side, tip]) => {
        if (!tip) return;
        env.ctx.markers.add(tip.type);
        const size = (MARKER_WIDTH[tip.w] || 3) * Math.max(line.w, 1.5 * EMU_PER_PT);
        props.push('draw:marker-' + side + '="' + MARKERS[tip.type].name + '"', 'draw:marker-' + side + '-width="' + cm(size) + '"', 'draw:marker-' + side + '-center="' + MARKERS[tip.type].center + '"');
      });
    } else props.push('draw:stroke="none"');
    if (spec.text) {
      const body = spec.text;
      props.push('draw:textarea-vertical-align="' + body.anchor + '"', 'draw:textarea-horizontal-align="justify"', 'draw:auto-grow-height="' + body.grow + '"', 'draw:auto-grow-width="false"', 'draw:fit-to-size="false"', 'style:shrink-to-fit="false"');
      props.push('fo:padding-top="' + cm(body.t) + '"', 'fo:padding-right="' + cm(body.r) + '"', 'fo:padding-bottom="' + cm(body.b) + '"', 'fo:padding-left="' + cm(body.l) + '"', 'fo:wrap-option="' + (body.wrap ? 'wrap' : 'no-wrap') + '"');
      if (body.cols) props.push('fo:column-count="' + body.cols + '"', 'fo:column-gap="' + cm(body.gap) + '"');
    }
    if (spec.decorative) props.push('loext:decorative="true"');
    const writing = spec.text && spec.text.vert === 'vert' ? '<style:paragraph-properties style:writing-mode="tb-rl"/>' : (spec.text ? '<style:paragraph-properties style:writing-mode="lr-tb"/>' : '');
    const body = '<style:graphic-properties ' + props.join(' ') + '/>' + writing;
    const family = spec.family || 'graphic';
    return env.reg.named(family === 'presentation' ? 'pr' : 'gr', family + body, name => '<style:style style:name="' + name + '" style:family="' + family + '">' + body + '</style:style>');
  }
  function bodyOf(bodyPr, box) {
    const auto = bodyPr ? kid(bodyPr, 'spAutoFit') : null;
    const anchor = bodyPr ? localAttr(bodyPr, 'anchor') : 't';
    return {
      anchor: anchor === 'ctr' ? 'middle' : (anchor === 'b' ? 'bottom' : 'top'), grow: !!auto, wrap: !bodyPr || localAttr(bodyPr, 'wrap') !== 'none',
      t: intAttr(bodyPr, 'tIns', 45720), r: intAttr(bodyPr, 'rIns', 91440), b: intAttr(bodyPr, 'bIns', 45720), l: intAttr(bodyPr, 'lIns', 91440),
      cols: intAttr(bodyPr, 'numCol', 1) > 1 ? intAttr(bodyPr, 'numCol', 1) : 0, gap: intAttr(bodyPr, 'spcCol', 0), vert: bodyPr ? localAttr(bodyPr, 'vert') || '' : '', box,
    };
  }
  // Le lien d'un objet (`a:hlinkClick` de ses propriétés) : un écouteur de clic, comme LibreOffice l'écrit.
  function listenersOf(env, cNvPr) {
    const link = cNvPr && kid(cNvPr, 'hlinkClick');
    if (!link) return '';
    const action = localAttr(link, 'action') || '';
    const jump = /hlinkshowjump\?jump=(\w+)/.exec(action);
    if (jump) {
      if (!JUMPS[jump[1]]) { lose(env.ctx, 'actions'); return ''; }
      return '<office:event-listeners><presentation:event-listener script:event-name="dom:click" presentation:action="' + JUMPS[jump[1]] + '"/></office:event-listeners>';
    }
    const target = targetOf(env, link);
    if (!target) return '';
    return '<office:event-listeners><presentation:event-listener script:event-name="dom:click" presentation:action="show" xlink:href="' + escAttr(target) + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onRequest"/></office:event-listeners>';
  }
  const decorativeOf = cNvPr => !!cNvPr && descendants(cNvPr, 'decorative').some(el => flag(el, 'val'));
  const nameOf = cNvPr => ' draw:name="' + escAttr((cNvPr && localAttr(cNvPr, 'name')) || '') + '"';
  const layerOf = env => ' draw:layer="' + (env.master ? 'backgroundobjects' : 'layout') + '"';
  const altOf = cNvPr => { const text = cNvPr ? localAttr(cNvPr, 'descr') : ''; return text ? '<svg:desc>' + escText(text) + '</svg:desc>' : ''; };

  // Un `p:sp` : un titre ou une zone de texte (`draw:frame` et son `draw:text-box`), ou une forme (`draw:custom-shape` et son tracé).
  function shapeXml(env, sp) {
    const nvSp = kid(sp, 'nvSpPr');
    const cNvPr = kid(nvSp, 'cNvPr');
    if (flag(cNvPr, 'hidden')) { lose(env.ctx, 'hiddenObjects'); return ''; }
    const ph = kid(kid(nvSp, 'nvPr'), 'ph');
    if (env.master && ph) return '';
    const spPr = kid(sp, 'spPr');
    const txBody = kid(sp, 'txBody');
    const box = boxOf(sp);
    const bodyPr = txBody ? kid(txBody, 'bodyPr') : null;
    const body = bodyOf(bodyPr, box);
    const title = !!ph && localAttr(ph, 'type') === 'title';
    const textBox = flag(kid(nvSp, 'cNvSpPr'), 'txBox') || title;
    const spec = { fill: fillOf(env, spPr), line: lineOf(env, kid(spPr, 'ln')), text: body, decorative: decorativeOf(cNvPr) };
    if (spec.line && spec.line.compound) lose(env.ctx, 'compoundLines');
    const textEnv = Object.assign({}, env, { defaultColor: title ? env.ctx.titleColor : env.ctx.theme.colors.dk1 });
    const content = txBody ? bodyXml(textEnv, txBody) : '<text:p/>';
    const listeners = listenersOf(env, cNvPr);
    if (textBox && !body.vert) {
      const style = graphicStyleName(env, title ? Object.assign({ family: 'presentation' }, spec) : spec);
      const attrs = title ? ' presentation:style-name="' + style + '" presentation:class="title" presentation:user-transformed="true"' : ' draw:style-name="' + style + '"';
      return '<draw:frame' + nameOf(cNvPr) + attrs + layerOf(env) + placeAttrs(box) + '>' + listeners + '<draw:text-box>' + content + '</draw:text-box>' + altOf(cNvPr) + '</draw:frame>';
    }
    const geometry = pathOf(env, spPr, box);
    const turned = body.vert === 'vert270' ? ' draw:text-rotate-angle="90"' : '';
    return '<draw:custom-shape' + nameOf(cNvPr) + ' draw:style-name="' + graphicStyleName(env, spec) + '"' + layerOf(env) + placeAttrs(box) + '>' + altOf(cNvPr) + listeners + content
      + '<draw:enhanced-geometry svg:viewBox="' + geometry.viewBox + '" draw:type="non-primitive" draw:text-areas="' + geometry.text + '"' + turned + ' draw:enhanced-path="' + geometry.path + '"/></draw:custom-shape>';
  }
  // Un `p:cxnSp` : un trait droit de son début à sa fin (la boîte, retournée), avec ses pointes.
  function lineXml(env, cxn) {
    const cNvPr = kid(kid(cxn, 'nvCxnSpPr'), 'cNvPr');
    if (flag(cNvPr, 'hidden')) { lose(env.ctx, 'hiddenObjects'); return ''; }
    const spPr = kid(cxn, 'spPr');
    const box = boxOf(cxn);
    const line = lineOf(env, kid(spPr, 'ln'));
    if (line && line.compound) lose(env.ctx, 'compoundLines');
    const x1 = box.flipH ? box.x + box.w : box.x;
    const x2 = box.flipH ? box.x : box.x + box.w;
    const y1 = box.flipV ? box.y + box.h : box.y;
    const y2 = box.flipV ? box.y : box.y + box.h;
    const style = graphicStyleName(env, { fill: null, line, decorative: decorativeOf(cNvPr) });
    return '<draw:line' + nameOf(cNvPr) + ' draw:style-name="' + style + '"' + layerOf(env) + ' svg:x1="' + cm(x1) + '" svg:y1="' + cm(y1) + '" svg:x2="' + cm(x2) + '" svg:y2="' + cm(y2) + '">' + altOf(cNvPr) + listenersOf(env, cNvPr) + '</draw:line>';
  }
  // Un `p:pic` : une image de `Pictures/`, à sa place, avec son texte alternatif.
  function pictureXml(env, pic) {
    const cNvPr = kid(kid(pic, 'nvPicPr'), 'cNvPr');
    if (flag(cNvPr, 'hidden')) { lose(env.ctx, 'hiddenObjects'); return ''; }
    const blip = descendants(pic, 'blip')[0];
    const rel = blip ? env.rels.byId.get(relAttr(blip, 'embed')) : null;
    if (!rel || !rel.target) return '';
    const file = rel.target.split('/').pop();
    env.ctx.pictures.set(rel.target, 'Pictures/' + file);
    const style = graphicStyleName(env, { fill: null, line: null, decorative: decorativeOf(cNvPr) });
    return '<draw:frame' + nameOf(cNvPr) + ' draw:style-name="' + style + '"' + layerOf(env) + placeAttrs(boxOf(pic)) + '>' + listenersOf(env, cNvPr)
      + '<draw:image xlink:href="Pictures/' + escAttr(file) + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>' + altOf(cNvPr) + '</draw:frame>';
  }

  // --- Les tableaux ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function borderOf(env, ln) {
    const fill = ln && kids(ln).find(el => /^(noFill|solidFill)$/.test(el.localName));
    if (!fill || fill.localName === 'noFill') return 'none';
    const color = colorOf(env, fill);
    return fixed(intAttr(ln, 'w', 6350) / EMU_PER_PT, 2) + 'pt solid ' + (color ? color.hex : '#000000');
  }
  function cellXml(env, tc, covered) {
    if (covered) return '<table:covered-table-cell/>';
    const tcPr = kid(tc, 'tcPr');
    const fill = fillOf(env, tcPr);
    const anchor = tcPr ? localAttr(tcPr, 'anchor') : 't';
    const props = ['fo:padding-left="' + cm(intAttr(tcPr, 'marL', 91440)) + '"', 'fo:padding-right="' + cm(intAttr(tcPr, 'marR', 91440)) + '"', 'fo:padding-top="' + cm(intAttr(tcPr, 'marT', 45720)) + '"', 'fo:padding-bottom="' + cm(intAttr(tcPr, 'marB', 45720)) + '"'];
    props.push('style:vertical-align="' + (anchor === 'ctr' ? 'middle' : (anchor === 'b' ? 'bottom' : 'top')) + '"', 'fo:background-color="' + (fill ? fill.hex : 'transparent') + '"');
    [['lnL', 'left'], ['lnR', 'right'], ['lnT', 'top'], ['lnB', 'bottom']].forEach(([tag, side]) => props.push('fo:border-' + side + '="' + borderOf(env, kid(tcPr, tag)) + '"'));
    const style = env.reg.named('ce', props.join(' '), name => '<style:style style:name="' + name + '" style:family="table-cell"><style:table-cell-properties ' + props.join(' ') + '/></style:style>');
    const span = intAttr(tc, 'gridSpan', 1);
    const rows = intAttr(tc, 'rowSpan', 1);
    return '<table:table-cell table:style-name="' + style + '"' + (span > 1 ? ' table:number-columns-spanned="' + span + '"' : '') + (rows > 1 ? ' table:number-rows-spanned="' + rows + '"' : '')
      + '>' + bodyXml(env, kid(tc, 'txBody')) + '</table:table-cell>';
  }
  function tableXml(env, frame) {
    const cNvPr = kid(kid(frame, 'nvGraphicFramePr'), 'cNvPr');
    if (flag(cNvPr, 'hidden')) { lose(env.ctx, 'hiddenObjects'); return ''; }
    const tbl = descendants(frame, 'tbl')[0];
    if (!tbl) { lose(env.ctx, 'charts'); return ''; }
    const columns = kids(kid(tbl, 'tblGrid'), 'gridCol').map(col => intAttr(col, 'w', 0));
    const columnsXml = columns.map((width) => {
      const style = env.reg.named('co', String(width), name => '<style:style style:name="' + name + '" style:family="table-column"><style:table-column-properties style:column-width="' + cm(width) + '"/></style:style>');
      return '<table:table-column table:style-name="' + style + '"/>';
    }).join('');
    const rowsXml = kids(tbl, 'tr').map((tr) => {
      const style = env.reg.named('ro', String(intAttr(tr, 'h', 0)), name => '<style:style style:name="' + name + '" style:family="table-row"><style:table-row-properties style:row-height="' + cm(intAttr(tr, 'h', 0)) + '" style:use-optimal-row-height="false"/></style:style>');
      const cells = kids(tr, 'tc').map(tc => cellXml(env, tc, flag(tc, 'hMerge') || flag(tc, 'vMerge'))).join('');
      return '<table:table-row table:style-name="' + style + '">' + cells + '</table:table-row>';
    }).join('');
    const style = graphicStyleName(env, { fill: null, line: null });
    return '<draw:frame' + nameOf(cNvPr) + ' draw:style-name="' + style + '"' + layerOf(env) + placeAttrs(boxOf(frame)) + '><table:table>' + columnsXml + rowsXml + '</table:table></draw:frame>';
  }

  // Les objets d'un arbre de formes (`p:spTree`), dans l'ordre de la pile.
  function treeXml(env, tree) {
    return kids(tree).map((el) => {
      if (el.localName === 'sp') return shapeXml(env, el);
      if (el.localName === 'cxnSp') return lineXml(env, el);
      if (el.localName === 'pic') return pictureXml(env, el);
      if (el.localName === 'graphicFrame') return tableXml(env, el);
      return '';
    }).join('');
  }

  // --- La diapositive : fond, transition, notes ---------------------------------------------------------------------------------------------------------------------------------------
  const durationOf = ms => 'PT' + String(Math.floor(ms / 3600000)).padStart(2, '0') + 'H' + String(Math.floor(ms / 60000) % 60).padStart(2, '0') + 'M' + String(Math.round(ms / 1000) % 60).padStart(2, '0') + 'S';
  function pageStyleName(env, props, background, ctx) {
    const attrs = ['presentation:background-visible="true"', 'presentation:background-objects-visible="true"'];
    if (background) attrs.push('draw:background-size="border"', 'draw:fill="solid"', 'draw:fill-color="' + background.hex + '"');
    if (props.hidden) attrs.push('presentation:visibility="hidden"');
    if (props.advance > 0) attrs.push('presentation:transition-type="automatic"', 'presentation:duration="' + durationOf(props.advance) + '"');
    if (props.transition) {
      const found = TRANSITIONS[props.transition] ? TRANSITIONS[props.transition](props) : null;
      if (!found) lose(ctx, 'transitions');
      const [type, subtype, direction] = found || ['fade', 'crossfade'];
      attrs.push('presentation:transition-speed="' + (props.dur <= 500 ? 'fast' : (props.dur <= 1000 ? 'medium' : 'slow')) + '"', 'smil:type="' + type + '"', 'smil:subtype="' + subtype + '"');
      if (direction) attrs.push('smil:direction="' + direction + '"');
    }
    return env.reg.named('dp', attrs.join(' '), name => '<style:style style:name="' + name + '" style:family="drawing-page"><style:drawing-page-properties ' + attrs.join(' ') + '/></style:style>');
  }
  // Les notes de la diapositive : la vignette de la page et le cadre des notes, à la place de la page de notes de PowerPoint (15,24 cm de large, sous la vignette).
  function notesXml(env, text, slideSize, number) {
    const width = 5486400;
    const height = Math.round(width * slideSize.cy / slideSize.cx);
    const paragraphs = String(text).split('\n').map(line => '<text:p>' + escText(line) + '</text:p>').join('');
    const style = graphicStyleName(env, { fill: null, line: null, text: { anchor: 'top', grow: false, wrap: true, t: 45720, r: 91440, b: 45720, l: 91440, cols: 0, gap: 0, vert: '' }, family: 'presentation' });
    return '<presentation:notes><draw:page-thumbnail draw:layer="layout" svg:width="' + cm(width) + '" svg:height="' + cm(height) + '" svg:x="' + cm((6858000 - width) / 2) + '" svg:y="' + cm(1143000) + '" draw:page-number="' + number + '" presentation:class="page"/>'
      + '<draw:frame presentation:style-name="' + style + '" draw:layer="layout" svg:width="' + cm(width) + '" svg:height="' + cm(3600450) + '" svg:x="' + cm((6858000 - width) / 2) + '" svg:y="' + cm(4400550) + '" presentation:class="notes" presentation:placeholder="true"><draw:text-box>' + paragraphs + '</draw:text-box></draw:frame></presentation:notes>';
  }

  // --- Le fichier -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function masterPageXml(name, style, layout, objects, slideSize) {
    const width = 5486400;
    const height = Math.round(width * slideSize.cy / slideSize.cx);
    return '<style:master-page style:name="' + name + '" style:page-layout-name="' + layout + '" draw:style-name="' + style + '">' + objects
      + '<presentation:notes style:page-layout-name="PM2"><draw:page-thumbnail draw:layer="backgroundobjects" svg:width="' + cm(width) + '" svg:height="' + cm(height) + '" svg:x="' + cm((6858000 - width) / 2) + '" svg:y="' + cm(1143000) + '" presentation:class="page"/></presentation:notes></style:master-page>';
  }
  const stylesXml = (ctx, slideSize, masterPages, masterStyles) => XML_HEAD + '<office:document-styles ' + NAMESPACE_ATTRS + ' office:version="1.3"><office:font-face-decls>' + fontFaces(ctx.fonts) + '</office:font-face-decls>'
    + '<office:styles>' + dashesXml(ctx) + markersXml(ctx) + '<style:style style:name="standard" style:family="graphic"><style:graphic-properties draw:fill="none" draw:stroke="none"/></style:style></office:styles>'
    + '<office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="' + cm(slideSize.cx) + '" fo:page-height="' + cm(slideSize.cy) + '" style:print-orientation="landscape"/></style:page-layout>'
    + '<style:page-layout style:name="PM2"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="' + cm(6858000) + '" fo:page-height="' + cm(9144000) + '" style:print-orientation="portrait"/></style:page-layout>'
    + masterStyles + '</office:automatic-styles><office:master-styles><draw:layer-set><draw:layer draw:name="layout"/><draw:layer draw:name="background"/><draw:layer draw:name="backgroundobjects"/><draw:layer draw:name="controls"/><draw:layer draw:name="measurelines"/></draw:layer-set>'
    + masterPages + '</office:master-styles></office:document-styles>';
  const contentXml = (ctx, styles, body) => XML_HEAD + '<office:document-content ' + NAMESPACE_ATTRS + ' office:version="1.3"><office:scripts/><office:font-face-decls>' + fontFaces(ctx.fonts) + '</office:font-face-decls><office:automatic-styles>'
    + styles + '</office:automatic-styles><office:body><office:presentation>' + body + '</office:presentation></office:body></office:document-content>';
  const metaXml = (title, pages) => XML_HEAD + '<office:document-meta ' + NAMESPACE_ATTRS + ' office:version="1.3"><office:meta><meta:generator>' + GENERATOR + '</meta:generator>' + (title ? '<dc:title>' + escText(title) + '</dc:title>' : '')
    + '<meta:creation-date>' + new Date().toISOString().slice(0, 19) + '</meta:creation-date><meta:document-statistic meta:page-count="' + pages + '"/></office:meta></office:document-meta>';
  function manifestXml(ctx) {
    const entry = (path, type) => '<manifest:file-entry manifest:full-path="' + path + '" manifest:media-type="' + type + '"/>';
    return XML_HEAD + '<manifest:manifest ' + NAMESPACE_ATTRS + ' manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="' + MIME + '"/>'
      + entry('content.xml', 'text/xml') + entry('styles.xml', 'text/xml') + entry('meta.xml', 'text/xml')
      + Array.from(ctx.pictures.values(), path => entry(path, IMAGE_TYPES[path.split('.').pop().toLowerCase()] || 'image/png')).join('') + '</manifest:manifest>';
  }

  // Les objets de la page maîtresse : ceux de la maîtresse et de la mise en page de la première diapositive qui ne sont pas des espaces réservés (le bandeau, le logo, le numéro, le pied).
  async function decorOf(pkg, ctx, part, reg) {
    const doc = await pkg.xml(part);
    const tree = doc && descendants(doc.documentElement, 'spTree')[0];
    if (!tree) return '';
    const env = { ctx, reg, rels: await pkg.rels(part), master: true, defaultColor: ctx.theme.colors.dk1, number: 1 };
    return treeXml(env, tree);
  }

  // Le fichier .odp d'un HTML résolu. `options` : { marginsPt (PageLayout.getMarginsPt), title }. Rend { blob, report: [{ key, n }] }.
  async function fromHtml(html, options) {
    const opts = options || {};
    await ExportCommon.ensureJsZipLoaded();
    await ExportEngines.ensure('pptx');
    const sources = PptxExport.slidesOf(html);
    const charts = (String(html || '').match(/data-chart-office=/g) || []).length;
    const pptx = await PptxExport.fromHtml(html, { marginsPt: opts.marginsPt, title: opts.title, imageCharts: true });
    const pkg = await ExportCommon.Ooxml.openPackage(await pptx.arrayBuffer(), {
      limits: { maxUnpacked: ExportCommon.Ooxml.LIMITS.unpacked, maxPart: MAX_PART_BYTES },
      messages: { legacy: '', notPackage: '', unreadable: '', tooBig: '' },
    });
    const presentation = await pkg.xml('ppt/presentation.xml');
    const size = kid(presentation.documentElement, 'sldSz');
    const slideSize = { cx: intAttr(size, 'cx', 12192000), cy: intAttr(size, 'cy', 6858000) };
    const master = await pkg.xml('ppt/slideMasters/slideMaster1.xml');
    const titleSlot = master && descendants(master.documentElement, 'titleStyle')[0];
    const titleColor = titleSlot && descendants(titleSlot, 'schemeClr')[0];
    const ctx = { theme: themeOf(await pkg.xml('ppt/theme/theme1.xml')), lost: new Map(), fonts: new Map(), pictures: new Map(), dashes: new Map(), markers: new Set(), titleColor: '' };
    ctx.titleColor = ctx.theme.colors[SCHEME_SLOTS[titleColor ? localAttr(titleColor, 'val') : 'tx1'] || 'dk1'];
    const content = newRegistry('');
    const masterReg = newRegistry('M');
    const hasFirst = pkg.has('ppt/slideLayouts/slideLayout2.xml');
    const body = [];
    for (let i = 0; i < sources.length; i += 1) {
      const path = 'ppt/slides/slide' + (i + 1) + '.xml';
      const doc = await pkg.xml(path);
      const rels = await pkg.rels(path);
      const props = Object.assign({}, NO_PROPS, sources[i].props || {});
      const env = { ctx, reg: content, rels, master: false, defaultColor: ctx.theme.colors.dk1, number: i + 1 };
      const tree = doc && descendants(doc.documentElement, 'spTree')[0];
      const background = doc ? colorOf(env, descendants(doc.documentElement, 'bgPr')[0] && kid(descendants(doc.documentElement, 'bgPr')[0], 'solidFill')) : null;
      if (doc && descendants(doc.documentElement, 'timing').length) lose(ctx, 'animations');
      const objects = tree ? treeXml(env, tree) : '';
      const notes = props.notes ? notesXml(env, props.notes, slideSize, i + 1) : '';
      body.push('<draw:page draw:name="page' + (i + 1) + '" draw:style-name="' + pageStyleName(env, props, background, ctx) + '" draw:master-page-name="' + (hasFirst && i === 0 ? 'First' : 'Default') + '">' + objects + notes + '</draw:page>');
    }
    if (charts) lose(ctx, 'charts', charts);
    // Les pages maîtresses : le fond du thème, le décor ; une seconde pour la première diapositive quand le décor lui est autre.
    const themeFill = ctx.theme.colors.lt1;
    const masterStyle = masterReg.named('dp', 'master', name => '<style:style style:name="' + name + '" style:family="drawing-page"><style:drawing-page-properties draw:background-size="border" draw:fill="solid" draw:fill-color="' + themeFill + '"/></style:style>');
    const pages = [masterPageXml('Default', masterStyle, 'PM1', await decorOf(pkg, ctx, 'ppt/slideMasters/slideMaster1.xml', masterReg), slideSize)];
    if (hasFirst) pages.push(masterPageXml('First', masterStyle, 'PM1', await decorOf(pkg, ctx, 'ppt/slideLayouts/slideLayout2.xml', masterReg), slideSize));
    const zip = new JSZip();
    zip.file('mimetype', MIME, { compression: 'STORE' });
    zip.file('META-INF/manifest.xml', manifestXml(ctx), { createFolders: false });
    zip.file('content.xml', contentXml(ctx, content.xml.join(''), body.join('')));
    zip.file('styles.xml', stylesXml(ctx, slideSize, pages.join(''), masterReg.xml.join('')));
    zip.file('meta.xml', metaXml(opts.title, sources.length));
    for (const [source, target] of ctx.pictures) {
      const file = pkg.fileOf(source);
      if (file) zip.file(target, await file.async('uint8array'), { createFolders: false });
    }
    const blob = await zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' });
    return { blob, report: Array.from(ctx.lost, ([key, n]) => ({ key, n })) };
  }

  // --- Les exports ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async function getOdpBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt) {
    await ExportEngines.ensure('pptx');
    // Comme le PowerPoint : une image d'un site externe est téléchargée pour ce fichier (la fenêtre la liste et peut tout arrêter), et les images sans texte alternatif sont signalées une fois si le réglage l'est.
    await ExternalImages.confirmExport(htmlContent, null);
    await AltReminder.confirmExport(htmlContent, null);
    const { resolvedHtml, filename } = await ExportCommon.resolveRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData);
    const built = await fromHtml(resolvedHtml, { marginsPt, title: filename });
    return { blob: built.blob, filename, report: built.report };
  }
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt) {
    if (!record) { alert(I18n.t('alert.noRecordForExportOdf')); return null; }
    const made = await getOdpBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, marginsPt);
    ExportCommon.downloadBlob(made.blob, (made.filename || 'publipostage') + '.odp');
    return made;
  }

  return { fromHtml, getOdpBlobForRecord, exportCurrentRecord, MIME };
})();
