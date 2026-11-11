// Import Word : un fichier .docx devient le HTML d'un NOUVEAU document, sans nom et pas encore enregistré (js/main.js:onImportDocx, ligne « Importer un Word… » du menu « + »), sur le
// modèle de l'import PowerPoint (js/pptx-import.js). Le but : reprendre tous les éléments qui correspondent à une fonction déjà développée, dire à la personne, à la fin, ce qui n'a pas pu
// être pris, et rester au plus près du Word, mise en page d'origine respectée.
//
// Le fichier : un paquet OPC (un zip, JSZip) de parties XML, lu comme Word l'écrit : la partie principale (`word/document.xml`), ses relations (`_rels`), les styles (`styles.xml` : valeurs
// par défaut, styles de paragraphe, de caractère et de tableau, avec leur héritage `basedOn`), la numérotation (`numbering.xml`), le thème (couleurs et polices), les notes de bas de page,
// les en-têtes et pieds de page, les images (`media/`). Rien n'est lu au hasard : une valeur qui manque prend celle que Word prendrait (les valeurs par défaut du document, puis le style,
// puis le réglage du paragraphe ou de la série de caractères).
//
// Ce que le texte devient : les paragraphes (alignement, interligne, espaces avant et après, retraits, sens d'écriture), les titres (styles « Titre 1 » à « Titre 6 »), les séries de
// caractères (gras, italique, souligné et sa sorte, barré, exposant, indice, couleur, surlignage, fond, police, taille, espacement, petites capitales, majuscules), les listes à puces et
// numérotées emboîtées, les tableaux (colonnes, fusions, fonds, traits, hauteurs, alignement vertical, styles de tableau et leurs bandes), les images (en ligne, ou flottantes posées en ligne),
// les liens, les sauts de ligne et de page, les tabulations, les notes de bas de page, les champs (numéro de page, champs de fusion devenus variables quand la colonne existe), la page (format,
// sens, marges), les en-têtes et pieds de page (première page différente comprise).
//
// Ce qu'il ne garde pas est COMPTÉ, un genre à la fois, et dit à la personne par la fenêtre du compte rendu (js/main.js:tellDocxImportReport) ; rien n'est perdu en silence. Le moteur ne
// touche ni à l'éditeur ni à la page : il rend le TEXTE du document (le HTML que l'éditeur écrit), la page, les en-têtes et pieds de page, et le compte rendu.
const DocxImport = (function () {
  const MAX_FILE_BYTES = 150 * 1024 * 1024;
  const MAX_UNPACKED_BYTES = 900 * 1024 * 1024;   // ce que le paquet pèse une fois défait : plus, c'est une bombe de compression
  const MAX_PART_BYTES = 60 * 1024 * 1024;         // une partie XML plus grosse est ignorée
  const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
  const MAX_IMAGES_BYTES = 80 * 1024 * 1024;       // le poids des images reprises, au total : le modèle s'écrit dans une case de Grist
  const MAX_DEPTH = 24;                            // tableaux, contrôles et champs emboîtés
  const PT_PER_TWIP = 1 / 20;
  const PX_PER_TWIP = 96 / 1440;
  const PX_PER_EMU = 1 / 9525;
  const MM_PER_TWIP = 25.4 / 1440;
  const EDITOR_BODY_PT = ExportCommon.EDITOR_STYLE.bodyPt;
  const EDITOR_HEADING_PT = ExportCommon.EDITOR_STYLE.headingPt;
  const NATURAL_LINE = ExportCommon.EDITOR_STYLE.naturalLine;
  const EDITOR_TEXT = '1b2430';
  // Les polices que l'éditeur sait montrer ; toute autre est remplacée par la plus proche (familyOf) et comptée au compte rendu.
  const EDITOR_FONTS = new Set(['roboto', 'arial', 'times new roman', 'georgia', 'courier new', 'calibri']);
  const SAME_FAMILY = /^(?:calibri|carlito|arial(?! (?:black|narrow|rounded|unicode))|arimo|helvetica|times|tinos|georgia|gelasio|courier|cousine|roboto)/;
  const REPORT_KEYS = [
    'sections', 'columns', 'fonts', 'tabs', 'rightIndent', 'paragraphBorders', 'numbering', 'images', 'floatingImages', 'imageEffects', 'shapes', 'charts', 'diagrams', 'equations',
    'comments', 'trackedChanges', 'hidden', 'fields', 'toc', 'endnotes', 'nestedTables', 'borderStyles', 'pageBorders', 'links', 'mergeFields', 'symbols', 'watermark', 'textEffects',
  ];

  // --- Petits outils sur le XML (js/export-common.js:Ooxml, communs avec js/pptx-import.js) --------------------------------------------------------------------------------------------------
  const { fail, kids, kid, at, descendants, relAttr, round2, fixed, escText, escAttr, spaced } = ExportCommon.Ooxml;
  // Un attribut lu par son nom local, quel que soit son préfixe (`w:val`, `val`) ; null quand il manque.
  const attr = ExportCommon.Ooxml.localAttr;
  const numAttr = ExportCommon.Ooxml.numAttrOf(attr);
  // Une bascule de Word (`w:b`, `w:i`, `w:strike`...) : sans valeur ou à « 1 », « true », « on » elle est posée ; « 0 », « false », « off » elle est retirée.
  function isOn(prop) {
    if (!prop) return false;
    const v = prop.val;
    return v === undefined || v === null || !/^(0|false|off)$/i.test(String(v));
  }

  // --- Les propriétés : un réglage par nom d'élément, fusionné couche après couche --------------------------------------------------------------------------------------------------
  // Word applique les valeurs par défaut du document, puis le style (et ceux dont il hérite), puis le réglage direct : chaque couche remplace celle d'au-dessous, attribut par attribut
  // (le retrait « à gauche » d'une couche et celui « de première ligne » d'une autre se complètent). `props[nom] = { …attributs, el }`.
  function mergeInto(props, container) {
    kids(container).forEach((child) => {
      const tag = child.localName;
      const next = Object.assign({}, props[tag]);
      const fresh = {};
      for (let i = 0; i < child.attributes.length; i++) fresh[child.attributes[i].localName] = child.attributes[i].value;
      // Un retrait de première ligne et un retrait suspendu s'excluent ; la couche qui en dit un efface l'autre.
      if (tag === 'ind') {
        if ('firstLine' in fresh || 'firstLineChars' in fresh) { delete next.hanging; delete next.hangingChars; }
        if ('hanging' in fresh || 'hangingChars' in fresh) { delete next.firstLine; delete next.firstLineChars; }
      }
      props[tag] = Object.assign(next, fresh, { el: child });
    });
    return props;
  }

  // --- Le paquet -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const resolvePath = ExportCommon.Ooxml.resolvePath;
  async function openPackage(buffer) {
    const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
    if (head[0] === 0xD0 && head[1] === 0xCF && head[2] === 0x11 && head[3] === 0xE0) throw fail('legacy', 'Fichier Word ancien ou protégé par un mot de passe.');
    if (head[0] !== 0x50 || head[1] !== 0x4B) throw fail('unreadable', 'Ce fichier n’est pas un document Word.');
    try {
      await ExportCommon.ensureJsZipLoaded();
    } catch (e) {
      throw fail('library', 'La bibliothèque de lecture des fichiers n’a pas pu être chargée.', { cause: e });
    }
    let zip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (e) {
      throw fail('unreadable', 'Ce fichier n’est pas un document Word lisible.', { cause: e });
    }
    const names = new Map();
    Object.keys(zip.files).forEach((name) => { if (!zip.files[name].dir) names.set(name.toLowerCase(), name); });
    const unpacked = ExportCommon.zipUnpackedBytes(zip);
    if (unpacked > MAX_UNPACKED_BYTES) throw fail('tooBig', 'Ce document est trop volumineux une fois défait.', { size: unpacked, max: MAX_UNPACKED_BYTES });
    const docs = new Map();
    const relsCache = new Map();
    const fileOf = path => (path ? zip.file(names.get(String(path).toLowerCase()) || path) : null);
    const parser = new DOMParser();
    async function xml(path) {
      if (!path) return null;
      if (docs.has(path)) return docs.get(path);
      let doc = null;
      const file = fileOf(path);
      if (file) {
        try {
          const text = await file.async('string');
          if (text.length <= MAX_PART_BYTES) {
            const parsed = parser.parseFromString(text, 'application/xml');
            doc = parsed.getElementsByTagName('parsererror').length ? null : parsed;
          }
        } catch (e) {
          doc = null;
        }
      }
      docs.set(path, doc);
      return doc;
    }
    // Les relations d'une partie : par identifiant { type (le dernier mot), target (chemin dans le paquet, ou null), href (adresse extérieure), external }.
    async function rels(partPath) {
      if (relsCache.has(partPath)) return relsCache.get(partPath);
      const slash = partPath.lastIndexOf('/');
      const doc = await xml(partPath.slice(0, slash + 1) + '_rels/' + partPath.slice(slash + 1) + '.rels');
      const byId = new Map();
      const list = [];
      if (doc) {
        descendants(doc.documentElement, 'Relationship').forEach((el) => {
          const external = attr(el, 'TargetMode') === 'External';
          const targetText = attr(el, 'Target') || '';
          const entry = {
            id: attr(el, 'Id'), type: String(attr(el, 'Type') || '').split('/').pop(), external,
            target: external ? null : resolvePath(partPath, targetText), href: external ? targetText : null,
          };
          byId.set(entry.id, entry);
          list.push(entry);
        });
      }
      const result = { byId, list, ofType: type => list.filter(entry => entry.type === type) };
      relsCache.set(partPath, result);
      return result;
    }
    return { zip, fileOf, xml, rels, has: path => !!fileOf(path) };
  }

  // --- Le thème : couleurs et polices que le document cite par leur nom ----------------------------------------------------------------------------------------------------------
  function readTheme(doc) {
    const theme = { colors: {}, major: '', minor: '' };
    if (!doc) return theme;
    const scheme = descendants(doc.documentElement, 'clrScheme')[0];
    kids(scheme).forEach((c) => {
      const holder = kid(c);
      if (!holder) return;
      theme.colors[c.localName] = (holder.localName === 'sysClr' ? attr(holder, 'lastClr') : attr(holder, 'val')) || '';
    });
    const major = descendants(doc.documentElement, 'majorFont')[0];
    const minor = descendants(doc.documentElement, 'minorFont')[0];
    theme.major = attr(kid(major, 'latin'), 'typeface') || '';
    theme.minor = attr(kid(minor, 'latin'), 'typeface') || '';
    return theme;
  }
  // Le nom d'une couleur du thème dans un fichier Word (`w:themeColor`) et celui de la couleur du thème qu'il désigne.
  const THEME_COLOR = {
    text1: 'dk1', dark1: 'dk1', background1: 'lt1', light1: 'lt1', text2: 'dk2', dark2: 'dk2', background2: 'lt2', light2: 'lt2',
    accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hyperlink: 'hlink', followedHyperlink: 'folHlink',
  };
  const HEX = /^[0-9a-f]{6}$/i;
  // Une couleur de Word (`w:val` en hexadécimal ou « auto », `w:themeColor`, `w:themeShade`, `w:themeTint`) en hexadécimal minuscule ; null pour « auto » (la couleur du contexte).
  function colorOf(theme, spec) {
    if (!spec) return null;
    const name = spec.themeColor || spec.themeFill;
    if (name && THEME_COLOR[name] && HEX.test(theme.colors[THEME_COLOR[name]] || '')) {
      let rgb = [0, 2, 4].map(i => parseInt(theme.colors[THEME_COLOR[name]].slice(i, i + 2), 16));
      const shade = spec.themeShade || spec.themeFillShade;
      const tint = spec.themeTint || spec.themeFillTint;
      if (shade) rgb = rgb.map(c => Math.round(c * parseInt(shade, 16) / 255));
      if (tint) rgb = rgb.map(c => Math.round(255 - (255 - c) * parseInt(tint, 16) / 255));
      return rgb.map(c => ('0' + c.toString(16)).slice(-2)).join('');
    }
    const value = spec.val !== undefined ? spec.val : spec.fill;
    return HEX.test(value || '') ? String(value).toLowerCase() : null;
  }

  // --- Les styles ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function readStyles(doc) {
    const out = { defaults: { p: {}, r: {} }, byId: new Map(), defaultParagraph: null, defaultTable: null, chain: new Map() };
    if (!doc) return out;
    const root = doc.documentElement;
    const docDefaults = kid(root, 'docDefaults');
    mergeInto(out.defaults.r, at(docDefaults, 'rPrDefault/rPr'));
    mergeInto(out.defaults.p, at(docDefaults, 'pPrDefault/pPr'));
    kids(root, 'style').forEach((el) => {
      const id = attr(el, 'styleId');
      if (!id) return;
      const style = {
        id, type: attr(el, 'type'), name: attr(kid(el, 'name'), 'val') || id, basedOn: attr(kid(el, 'basedOn'), 'val'),
        p: mergeInto({}, kid(el, 'pPr')), r: mergeInto({}, kid(el, 'rPr')), tblPr: kid(el, 'tblPr'), tcPr: kid(el, 'tcPr'), trPr: kid(el, 'trPr'),
        conditions: kids(el, 'tblStylePr'),
      };
      out.byId.set(id, style);
      if (attr(el, 'default') === '1' || attr(el, 'default') === 'true') {
        if (style.type === 'paragraph') out.defaultParagraph = id;
        if (style.type === 'table') out.defaultTable = id;
      }
    });
    return out;
  }
  // Le style et ceux dont il hérite, du plus lointain au plus proche.
  function styleChain(styles, id) {
    if (!id) return [];
    if (styles.chain.has(id)) return styles.chain.get(id);
    const list = [];
    const seen = new Set();
    for (let cur = styles.byId.get(id); cur && !seen.has(cur.id); cur = cur.basedOn ? styles.byId.get(cur.basedOn) : null) {
      seen.add(cur.id);
      list.unshift(cur);
    }
    styles.chain.set(id, list);
    return list;
  }

  // --- La numérotation -----------------------------------------------------------------------------------------------------------------------------------------------------------------
  function readNumbering(doc) {
    const out = { abstracts: new Map(), nums: new Map() };
    if (!doc) return out;
    const root = doc.documentElement;
    kids(root, 'abstractNum').forEach((el) => {
      const levels = new Map();
      kids(el, 'lvl').forEach((lvl) => {
        const level = numAttr(lvl, 'ilvl', 0);
        levels.set(level, {
          start: numAttr(kid(lvl, 'start'), 'val', 1), fmt: attr(kid(lvl, 'numFmt'), 'val') || 'decimal', text: attr(kid(lvl, 'lvlText'), 'val') || '',
          font: attr(kid(kid(lvl, 'rPr'), 'rFonts'), 'ascii') || attr(kid(kid(lvl, 'rPr'), 'rFonts'), 'hAnsi') || '', pStyle: attr(kid(lvl, 'pStyle'), 'val'),
          legal: !!kid(lvl, 'isLgl'),
        });
      });
      out.abstracts.set(attr(el, 'abstractNumId'), levels);
    });
    kids(root, 'num').forEach((el) => {
      const overrides = new Map();
      kids(el, 'lvlOverride').forEach((o) => {
        const start = kid(o, 'startOverride');
        const lvl = kid(o, 'lvl');
        overrides.set(numAttr(o, 'ilvl', 0), {
          start: start ? numAttr(start, 'val', 1) : null,
          level: lvl ? {
            start: numAttr(kid(lvl, 'start'), 'val', 1), fmt: attr(kid(lvl, 'numFmt'), 'val') || 'decimal', text: attr(kid(lvl, 'lvlText'), 'val') || '',
            font: attr(kid(kid(lvl, 'rPr'), 'rFonts'), 'ascii') || '', pStyle: null, legal: !!kid(lvl, 'isLgl'),
          } : null,
        });
      });
      out.nums.set(attr(el, 'numId'), { abstractId: attr(kid(el, 'abstractNumId'), 'val'), overrides });
    });
    return out;
  }

  // --- Les polices et les couleurs -----------------------------------------------------------------------------------------------------------------------------------------------
  // La famille de remplacement la plus proche parmi celles de l'éditeur (Roboto par défaut, Arial, Times New Roman, Georgia, Courier New, Calibri) ; null : celle de l'éditeur.
  function familyOf(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    if (/^(calibri|carlito)/.test(key)) return 'Calibri';
    if (/^(arial|helvetica|arimo)/.test(key)) return 'Arial';
    if (key === 'georgia' || key === 'gelasio') return 'Georgia';
    if (/^(courier|consolas|lucida console|monaco|menlo|cascadia|source code|fira (code|mono)|andale mono|cousine|monospace)/.test(key)) return 'Courier New';
    if (/^(times|tinos|cambria|garamond|palatino|book antiqua|bookman|century (schoolbook|old)|constantia|baskerville|didot|bodoni|sitka|minion|perpetua|goudy|caslon|georgia pro|serif$)/.test(key)) return 'Times New Roman';
    return null;
  }
  const HIGHLIGHT = {
    yellow: 'ffff00', green: '00ff00', cyan: '00ffff', magenta: 'ff00ff', blue: '0000ff', red: 'ff0000', darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080',
    darkRed: '800000', darkYellow: '808000', darkGray: '808080', lightGray: 'c0c0c0', black: '000000', white: 'ffffff',
  };
  // Les noms de ligne de soulignement de Word et la sorte que l'éditeur sait dessiner (js/character-format.js) ; le reste est le soulignement simple.
  function underlineStyle(val) {
    if (/^double/i.test(val)) return 'double';
    if (/^dotted/i.test(val)) return 'dotted';
    if (/^(dash|dot)/i.test(val)) return 'dashed';
    if (/^wav/i.test(val)) return 'wavy';
    return '';
  }
  const SYMBOL_CHARS = {
    symbol: { 'B7': '•', 'A8': '♦', 'A7': '♣', 'AB': '↔', 'AE': '→', 'AC': '←', 'AD': '↑', 'AF': '↓', 'B1': '±', 'B0': '°', 'A3': '≤', 'B3': '≥', 'B9': '≠', 'A5': '∞', 'D6': '√', 'E5': '∑' },
    wingdings: { 'FC': '✓', 'FB': '✗', 'FE': '☑', 'A8': '◻', 'A7': '▪', '6C': '●', '6E': '■', '6F': '□', '71': '❑', '76': '❖', '75': '◆', 'D8': '➢', 'E8': '➔', 'F0': '➔', 'FD': '☒', 'A1': '○', '9F': '•' },
  };

  // --- Les propriétés de paragraphe et de série de caractères, héritage compris -----------------------------------------------------------------------------------------
  // Ajoute les réglages de `from` (propriétés déjà fusionnées) à `into`, attribut par attribut.
  function layer(into, from) {
    if (!from) return into;
    Object.keys(from).forEach((tag) => {
      const next = Object.assign({}, into[tag]);
      const fresh = from[tag];
      if (tag === 'ind') {
        if ('firstLine' in fresh || 'firstLineChars' in fresh) { delete next.hanging; delete next.hangingChars; }
        if ('hanging' in fresh || 'hangingChars' in fresh) { delete next.firstLine; delete next.firstLineChars; }
      }
      into[tag] = Object.assign(next, fresh);
    });
    return into;
  }
  // Ce que Word applique à un paragraphe : { p, r, styleId, chain } - valeurs par défaut, couches du tableau (`layers`), style de paragraphe et ceux dont il hérite, réglage direct.
  function resolveParagraph(ctx, pPr, layers) {
    const styleId = attr(kid(pPr, 'pStyle'), 'val') || ctx.styles.defaultParagraph;
    const chain = styleChain(ctx.styles, styleId);
    const p = layer({}, ctx.styles.defaults.p);
    const r = layer({}, ctx.styles.defaults.r);
    (layers || []).forEach((l) => { layer(p, l.p); layer(r, l.r); });
    chain.forEach((style) => { layer(p, style.p); layer(r, style.r); });
    mergeInto(p, pPr);
    return { p, r, styleId, chain };
  }
  // Les propriétés d'une série de caractères : celles du paragraphe, du style de caractère, puis le réglage direct.
  function resolveRun(ctx, base, rPr) {
    const r = layer({}, base);
    if (rPr) {
      const charStyle = attr(kid(rPr, 'rStyle'), 'val');
      styleChain(ctx.styles, charStyle).forEach(style => layer(r, style.r));
      mergeInto(r, rPr);
    }
    return r;
  }
  // La police d'une série de caractères (sa famille dans l'éditeur, ou null pour celle de l'éditeur) ; une police que l'éditeur n'a pas exactement est comptée une fois.
  function fontOf(ctx, r) {
    const f = r.rFonts;
    if (!f) return null;
    let name = f.ascii || f.hAnsi || f.cs || f.eastAsia || '';
    const themed = f.asciiTheme || f.hAnsiTheme || '';
    if (!name && themed) name = /major/i.test(themed) ? ctx.theme.major : ctx.theme.minor;
    if (themed && !f.ascii) name = /major/i.test(themed) ? ctx.theme.major : ctx.theme.minor;
    name = String(name || '').trim();
    if (!name) return null;
    const lower = name.toLowerCase();
    // Une variante d'une police que l'éditeur a (« Calibri Light », « Times », « Courier ») prend la sienne sans rien dire ; une autre famille (« Cambria », « Consolas », « Aptos ») est comptée.
    if (!EDITOR_FONTS.has(lower) && !SAME_FAMILY.test(lower) && !ctx.fontsSeen.has(lower)) { ctx.fontsSeen.add(lower); count(ctx, 'fonts'); }
    return familyOf(name);
  }
  function count(ctx, key, n) { ctx.report.set(key, (ctx.report.get(key) || 0) + (n === undefined ? 1 : n)); }
  // Un genre de perte compté une fois par paragraphe (`st.losses`), pas une fois par série de caractères.
  function lose(st, key) { if (st.losses) st.losses.add(key); }

  // Ce qu'une série de caractères demande, en marques de l'éditeur : { style (déclarations CSS), b, i, u, uLine, s, sup, sub, caps, hidden }.
  function runLook(ctx, r, baseSize, linked) {
    const look = { style: [], b: isOn(r.b), i: isOn(r.i), u: false, uLine: '', s: isOn(r.strike) || isOn(r.dstrike), sup: false, sub: false, caps: isOn(r.caps), hidden: isOn(r.vanish) };
    const size = r.sz ? Number(r.sz.val) / 2 : 10;
    if (Number.isFinite(size) && size > 0 && Math.abs(size - baseSize) > 0.04) look.style.push('font-size: ' + fixed(Math.max(1, size)) + 'pt');
    const family = fontOf(ctx, r);
    if (family) look.style.push('font-family: ' + family);
    const color = colorOf(ctx.theme, r.color);
    if (!linked && color && color !== '000000' && color !== EDITOR_TEXT) look.style.push('color: #' + color);
    const highlight = r.highlight && HIGHLIGHT[r.highlight.val];
    const shade = r.shd && String(r.shd.val || '') !== 'clear' ? null : colorOf(ctx.theme, r.shd);
    const fill = r.shd ? colorOf(ctx.theme, { fill: r.shd.fill, themeFill: r.shd.themeFill, themeFillShade: r.shd.themeFillShade, themeFillTint: r.shd.themeFillTint }) : null;
    const back = highlight || fill || shade;
    if (back && back !== 'ffffff') look.style.push('background-color: #' + back);
    const spacing = r.spacing ? Number(r.spacing.val) * PT_PER_TWIP : 0;
    const character = CharacterFormat.declarations({ letterSpacing: spacing, smallCaps: isOn(r.smallCaps) });
    if (character) look.style.push(character);
    const u = r.u && String(r.u.val || 'single');
    if (u && !/^none$/i.test(u) && !linked) { look.u = true; look.uLine = underlineStyle(u); }
    const align = r.vertAlign && r.vertAlign.val;
    // « Position » (texte monté ou descendu, comme LibreOffice écrit un exposant) à défaut de « Exposant / Indice » : monté = exposant, descendu = indice, et la taille réduite qui l'accompagne est celle de l'éditeur.
    const position = r.position ? Number(r.position.val) : 0;
    if (align === 'superscript') look.sup = true; else if (align === 'subscript') look.sub = true;
    else if (!align && Number.isFinite(position) && position > 0) look.sup = true;
    else if (!align && Number.isFinite(position) && position < 0) look.sub = true;
    if ((look.sup || look.sub) && !align) look.style = look.style.filter(rule => !/^font-size:/.test(rule));
    return look;
  }
  function lookKey(look, link, track, comments) { return [look.style.join(';'), look.b, look.i, look.u, look.uLine, look.s, look.sup, look.sub, link || '', track ? track.kind + track.id : '', comments ? comments.map(c => c.id).join(',') : ''].join('|'); }
  // Le texte `inner` (déjà en balisage) avec les marques de la série de caractères, dans l'ordre de l'éditeur (js/pptx-import.js:runMarkup).
  function wrapRun(inner, look, link, track, comments) {
    let html = look.style.length ? '<span style="' + look.style.join('; ') + '">' + inner + '</span>' : inner;
    if (look.b) html = '<strong>' + html + '</strong>';
    if (look.i) html = '<em>' + html + '</em>';
    if (look.u) html = look.uLine ? '<u style="text-decoration-style: ' + look.uLine + '">' + html + '</u>' : '<u>' + html + '</u>';
    if (look.s) html = '<s>' + html + '</s>';
    if (look.sup) html = '<sup>' + html + '</sup>';
    else if (look.sub) html = '<sub>' + html + '</sub>';
    if (link) html = '<a href="' + escAttr(link) + '">' + html + '</a>';
    // Les marques de l'éditeur qui ne changent pas l'aspect : le fil de commentaire (js/comments.js), puis la modification suivie (js/track-changes.js : `<ins>` ou `<del>` et son numéro).
    if (comments) comments.forEach((c) => { html = '<span class="comment-mark" data-comment-id="' + escAttr(c.id) + '" data-resolved="' + (c.resolved ? 'true' : 'false') + '">' + html + '</span>'; });
    if (track) html = trackWrap(html, track);
    return html;
  }
  const trackWrap = (html, track) => '<' + (track.kind === 'del' ? 'del' : 'ins') + ' data-id="' + track.id + '">' + html + '</' + (track.kind === 'del' ? 'del' : 'ins') + '>';
  // Les séries de caractères qui se suivent avec le même aspect ne font qu'un (Word en coupe à chaque correction ou révision) ; un élément `raw` (image, note, numéro de page) reste seul.
  function itemsHtml(items) {
    let out = '';
    for (let i = 0; i < items.length;) {
      const item = items[i];
      if (item.raw !== undefined) { out += item.raw; i += 1; continue; }
      let text = item.text;
      let j = i + 1;
      while (j < items.length && items[j].raw === undefined && items[j].key === item.key) { text += items[j].text; j += 1; }
      out += wrapRun(spaced(item.caps ? text.toLocaleUpperCase() : text), item.look, item.link, item.track, item.comments);
      i = j;
    }
    return out;
  }
  const SAFE_LINK = /^(https?:|mailto:|tel:)/i;
  function safeHref(href) {
    const text = String(href || '').trim();
    return SAFE_LINK.test(text) && !/[\u0000-\u001f\s]/.test(text) ? text : '';
  }

  // --- Le texte d'un paragraphe ---------------------------------------------------------------------------------------------------------------------------------------------------
  // L'état d'un paragraphe en cours de lecture : `r` (propriétés de caractère du paragraphe), `baseSize` (la taille que l'éditeur donne à ce paragraphe sans réglage), `items`, `link`.
  function newState(ctx, part, resolved, baseSize, depth) {
    return { ctx, part, r: resolved.r, baseSize, items: [], link: '', track: null, losses: new Set(), blocks: null, pendingBreaks: 0, depth };
  }
  function pushText(st, r, text, linked) {
    if (text === '') return;
    const look = runLook(st.ctx, r, st.baseSize, !!st.link || linked);
    if (look.hidden) { count(st.ctx, 'hidden'); return; }
    // Un titre de l'éditeur est déjà en gras : le gras du style « Titre » de Word n'ajoute pas de balise.
    if (st.heading) look.b = false;
    const last = st.items[st.items.length - 1];
    const comments = openComments(st.ctx);
    st.items.push({ key: lookKey(look, st.link, st.track, comments) + (look.caps ? '|C' : ''), look, link: st.link, caps: look.caps, text, track: st.track, comments });
    return last;
  }
  function pushRaw(st, html) {
    // Une image écrite dans une insertion suivie est suivie comme elle (js/track-changes.js sait marquer une image).
    st.items.push({ raw: st.track && /^<img\b/.test(html) ? trackWrap(html, st.track) : html });
  }

  const FIELD_NAME = /^\s*([A-Za-z=]+)/;
  const FROZEN_FIELDS = new Set(['DATE', 'TIME', 'SAVEDATE', 'PRINTDATE', 'CREATEDATE', 'NUMPAGES', 'SECTIONPAGES', 'NUMWORDS', 'NUMCHARS', 'FILENAME', 'AUTHOR', 'TITLE', 'DOCPROPERTY', 'USERNAME', 'IF', 'FORMULA', '=', 'COMPARE', 'INFO']);
  function fieldKind(instr) {
    const m = FIELD_NAME.exec(instr || '');
    return m ? m[1].toUpperCase() : '';
  }
  // Un champ qui se ferme : ce qu'il devient. Un lien enveloppe son résultat, un champ de fusion devient la variable de la colonne du même nom (quand elle existe), le numéro de page devient celui de
  // l'éditeur ; les autres champs gardent leur résultat tel que Word l'a calculé (les champs qui changeraient d'un jour à l'autre sont comptés).
  function closeField(st, field) {
    const ctx = st.ctx;
    const kind = field.kind;
    if (kind === 'HYPERLINK') {
      const target = /\\l\s+"([^"]*)"/.exec(field.instr);
      const url = /^\s*HYPERLINK\s+(?:\\[a-z]\s+)*"([^"]*)"/i.exec(field.instr);
      const href = !target && url ? safeHref(url[1]) : '';
      if (!href) count(ctx, 'links');
      field.sink.forEach((item) => { if (href && item.raw === undefined) { item.link = href; item.look = Object.assign({}, item.look, { u: false }); item.key += '|a:' + href; } });
    } else if (kind === 'MERGEFIELD') {
      const name = (/MERGEFIELD\s+(?:\\[a-z*]\s+)*"?([^"\\]+?)"?(?:\s+\\|\s*$)/i.exec(field.instr + ' ') || [])[1];
      const html = name ? ctx.mergeField(name.trim()) : '';
      if (html) { st.items = field.parentItems; pushRaw(st, html); return; }
      count(ctx, 'mergeFields');
    } else if (kind === 'PAGE') {
      st.items = field.parentItems;
      pushRaw(st, '<span class="page-number-badge" contenteditable="false" data-format="n"></span>');
      return;
    } else if (kind === 'TOC' || FROZEN_FIELDS.has(kind)) {
      count(ctx, 'fields');
    }
    st.items = field.parentItems.concat(field.sink);
  }
  // Un champ dont le résultat est repris tel quel n'a pas besoin de collecte ; les autres (lien, champ de fusion, numéro de page) la demandent, le temps de leur résultat.
  const COLLECTED = new Set(['HYPERLINK', 'MERGEFIELD', 'PAGE']);
  function fieldChar(st, type) {
    const stack = st.ctx.fields;
    if (type === 'begin') {
      stack.push({ instr: '', kind: '', phase: 'instr', sink: null, parentItems: null });
    } else if (type === 'separate') {
      const field = stack[stack.length - 1];
      if (!field) return;
      field.phase = 'result';
      field.kind = fieldKind(field.instr);
      if (COLLECTED.has(field.kind)) { field.parentItems = st.items; field.sink = []; st.items = field.sink; }
    } else if (type === 'end') {
      const field = stack.pop();
      if (!field) return;
      if (field.phase === 'instr') field.kind = fieldKind(field.instr);
      if (field.sink) closeField(st, field);
      else if (FROZEN_FIELDS.has(field.kind) || field.kind === 'TOC') count(st.ctx, 'fields');
    }
  }

  // Les images d'une partie (le document, un en-tête, un pied de page) : lues une fois, en adresse de données, avec le plafond de poids du modèle.
  const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
  async function loadImages(ctx, rels) {
    const images = new Map();
    for (const entry of rels.ofType('image')) {
      const ext = String(entry.target || '').split('.').pop().toLowerCase();
      const mime = IMAGE_TYPES[ext];
      const file = entry.target ? ctx.pkg.fileOf(entry.target) : null;
      if (!file || !mime) { images.set(entry.id, { unsupported: true }); continue; }
      let b64 = '';
      try { b64 = await file.async('base64'); } catch (e) { b64 = ''; }
      const bytes = b64.length * 0.75;
      if (!b64 || bytes > MAX_IMAGE_BYTES || ctx.imageBytes + bytes > MAX_IMAGES_BYTES) { images.set(entry.id, { unsupported: true }); continue; }
      ctx.imageBytes += bytes;
      images.set(entry.id, { src: 'data:' + mime + ';base64,' + b64 });
    }
    return images;
  }
  const GRAPHIC = { picture: /\/picture$/, chart: /\/chart$/, diagram: /\/diagram$/, shape: /\/wordprocessingShape$/, group: /\/wordprocessingGroup$/, canvas: /\/wordprocessingCanvas$/ };
  // Une image de Word rognée (`a:srcRect`), tournée (`rot`) ou retournée (`flipH`, `flipV`) est REDESSINÉE comme Word la montre (ImageIo.reshape, le même redessin que l'import PowerPoint et que les
  // boutons de la barre de l'image) : le balisage ne porte d'abord qu'un repère à sa place (`REDRAW_MARK` + son rang), les images se redessinent ensemble une fois le paquet lu (`settleRedraws`).
  const REDRAW_MARK = 'pp-redraw:';
  // `straightPx` (avec `reshape`) : la largeur de l'image restée droite, que reprend une image qu'on n'a pas pu redessiner.
  function imageHtml(st, rId, widthPx, alt, reshape, straightPx) {
    const image = st.part.images.get(rId);
    if (!image || image.unsupported) { count(st.ctx, 'images'); return ''; }
    const style = widthPx > 0 ? ' style="width: ' + fixed(widthPx) + 'px"' : '';
    return '<img class="editor-image" src="' + (reshape ? redrawMark(st, rId, image.src, reshape, straightPx) : image.src) + '" alt="' + escAttr(alt || '') + '"' + style + '>';
  }
  // Le repère d'une image à redessiner : une même image redessinée de la même façon (le logo d'un en-tête, repris en première page) ne se redessine qu'une fois.
  function redrawMark(st, rId, src, reshape, straightPx) {
    const ctx = st.ctx;
    const key = st.part.path + '|' + rId + '|' + JSON.stringify(reshape) + '|' + straightPx;
    let rank = ctx.redrawKeys.get(key);
    if (rank === undefined) {
      rank = ctx.redraws.length;
      ctx.redrawKeys.set(key, rank);
      ctx.redraws.push({ src, reshape, straightPx, uses: 0 });
    }
    ctx.redraws[rank].uses += 1;
    return REDRAW_MARK + rank;
  }
  // Les images à redessiner, une à une (le canvas d'une grande photo pèse : pas deux à la fois), puis posées à la place de leur repère dans chaque texte. Une image que le navigateur ne sait pas
  // redessiner (vectorielle, illisible) ou qui, redessinée, dépasserait le poids permis reste entière et droite, et le compte rendu le dit (`imageEffects`).
  async function settleRedraws(ctx, texts) {
    if (!ctx.redraws.length) return texts;
    const results = [];
    for (const job of ctx.redraws) {
      let out = null;
      try {
        out = await ImageIo.reshape(job.src, job.reshape);
      } catch (e) {
        out = null;
      }
      const before = job.src.length * 0.75;
      const after = out ? out.src.length * 0.75 : 0;
      if (!out || after > MAX_IMAGE_BYTES || ctx.imageBytes + Math.max(0, after - before) > MAX_IMAGES_BYTES) {
        count(ctx, 'imageEffects', job.uses);
        results.push(null);
      } else {
        ctx.imageBytes += Math.max(0, after - before);
        results.push(out.src);
      }
    }
    // Une image redessinée prend la place de son repère ; une image qui ne l'a pas été reprend son adresse, et la largeur de l'image droite.
    const marked = new RegExp('<img class="editor-image" src="' + REDRAW_MARK + '(\\d+)"([^>]*)>', 'g');
    return texts.map(text => text.replace(marked, (found, rank, rest) => {
      const job = ctx.redraws[Number(rank)];
      const done = results[Number(rank)];
      if (done) return '<img class="editor-image" src="' + done + '"' + rest + '>';
      const style = job.straightPx > 0 ? ' style="width: ' + fixed(job.straightPx) + 'px"' : '';
      return '<img class="editor-image" src="' + job.src + '"' + rest.replace(/ style="[^"]*"/, '') + style + '>';
    }));
  }
  // Ce que Word demande de l'image d'un dessin : les marges rognées (`srcRect`, en cent-millièmes de l'image), le tour (`rot`, en soixantièmes de degré, sens horaire), le miroir, et les proportions
  // de la boîte où elle est étirée (`ratio`) ; null quand l'image est posée telle quelle.
  function reshapeOf(crop, xfrm, widthPx, heightPx) {
    const part = side => Math.max(0, numAttr(crop, side, 0) / 100000);
    const margins = { l: part('l'), t: part('t'), r: part('r'), b: part('b') };
    const cropped = margins.l > 0 || margins.t > 0 || margins.r > 0 || margins.b > 0;
    const turn = ImageIo.turnOf(numAttr(xfrm, 'rot', 0) / 60000);
    const flip = name => /^(1|true|on)$/i.test(String(attr(xfrm, name) || ''));
    const flipH = flip('flipH');
    const flipV = flip('flipV');
    if (!cropped && !turn && !flipH && !flipV) return null;
    const out = { turn, flipH, flipV };
    if (cropped) out.crop = margins;
    if (widthPx > 0 && heightPx > 0) out.ratio = round2(widthPx / heightPx);
    return out;
  }
  // La largeur que l'image prend à l'écran une fois tournée : celle de la boîte qui l'enveloppe (Word garde l'étendue de l'image droite et met la place du tour dans `effectExtent`).
  function turnedWidth(widthPx, heightPx, turn) {
    if (!turn || !(widthPx > 0) || !(heightPx > 0)) return widthPx;
    if (turn % 90 === 0) return turn === 90 || turn === 270 ? heightPx : widthPx;
    const radians = turn * Math.PI / 180;
    return Math.abs(widthPx * Math.cos(radians)) + Math.abs(heightPx * Math.sin(radians));
  }
  // Un dessin (`w:drawing`) : une image en ligne ou flottante (posée en ligne, comptée), sinon un objet que l'éditeur ne sait pas reprendre, compté.
  function drawingHtml(st, drawing) {
    const holder = kid(drawing, ['inline', 'anchor']);
    if (!holder) return '';
    const ctx = st.ctx;
    const data = descendants(holder, 'graphicData')[0];
    const uri = attr(data, 'uri') || '';
    const extent = kid(holder, 'extent');
    const widthPx = numAttr(extent, 'cx', 0) * PX_PER_EMU;
    const heightPx = numAttr(extent, 'cy', 0) * PX_PER_EMU;
    const docPr = kid(holder, 'docPr');
    if (GRAPHIC.picture.test(uri)) {
      const blip = descendants(data, 'blip')[0];
      const rId = relAttr(blip, 'embed') || relAttr(blip, 'link');
      const reshape = reshapeOf(descendants(data, 'srcRect')[0], descendants(data, 'xfrm')[0], widthPx, heightPx);
      if (holder.localName === 'anchor') count(ctx, 'floatingImages');
      return imageHtml(st, rId, reshape ? turnedWidth(widthPx, heightPx, reshape.turn) : widthPx, attr(docPr, 'descr') || attr(docPr, 'title') || '', reshape, widthPx);
    }
    if (GRAPHIC.chart.test(uri)) count(ctx, 'charts');
    else if (GRAPHIC.diagram.test(uri)) count(ctx, 'diagrams');
    else count(ctx, 'shapes');
    return '';
  }
  // Une image ou une forme du dessin à l'ancienne (VML, `w:pict`) : l'image si elle en est une, sinon un filigrane ou une forme, comptés.
  function pictureHtml(st, pict) {
    const ctx = st.ctx;
    const image = descendants(pict, 'imagedata')[0];
    if (image) {
      const rId = relAttr(image, 'id');
      const shape = image.parentNode;
      const style = (shape && shape.getAttribute && shape.getAttribute('style')) || '';
      const w = /(?:^|;)\s*width\s*:\s*([\d.]+)\s*(pt|px|in|cm|mm)?/i.exec(style);
      const unit = { pt: 96 / 72, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };
      const widthPx = w ? Number(w[1]) * (unit[(w[2] || 'pt').toLowerCase()] || 1) : 0;
      const id = (shape && shape.getAttribute && shape.getAttribute('id')) || '';
      if (/PowerPlusWaterMarkObject/i.test(id)) { count(ctx, 'watermark'); return ''; }
      return imageHtml(st, rId, widthPx, '', false);
    }
    const marks = descendants(pict, 'shape').filter(shape => /PowerPlusWaterMarkObject/i.test(shape.getAttribute('id') || ''));
    if (marks.length) {
      // Un filigrane texte devient celui de la page de l'éditeur (un seul : le premier lu, les en-têtes de première page et ordinaire le répètent) ; un autre est compté.
      const mark = watermarkOf(marks[0]);
      if (mark && !ctx.watermark) ctx.watermark = mark; else if (!mark) count(ctx, 'watermark');
    } else count(ctx, 'shapes');
    return '';
  }
  // Le filigrane texte de Word (dessin à l'ancienne : `v:shape` « PowerPlusWaterMarkObject » avec un `v:textpath`) : { text, angle, color, opacity } à la forme de PageLayout.normalizeWatermark, ou null (un filigrane image).
  const VML_COLORS = { silver: 'c0c0c0', gray: '808080', grey: '808080', black: '000000', white: 'ffffff', red: 'ff0000', blue: '0000ff', green: '008000', yellow: 'ffff00', lightgray: 'd3d3d3', lightgrey: 'd3d3d3', darkgray: 'a9a9a9', darkgrey: 'a9a9a9', orange: 'ffa500', navy: '000080', maroon: '800000', purple: '800080', teal: '008080' };
  function watermarkOf(shape) {
    const path = descendants(shape, 'textpath')[0];
    const text = path ? String(path.getAttribute('string') || '').replace(/\s+/g, ' ').trim() : '';
    if (!text) return null;
    const fill = String(shape.getAttribute('fillcolor') || '').trim().toLowerCase().replace(/\s*\[.*\]\s*$/, '');
    const hex = /^#?([0-9a-f]{6})$/.exec(fill);
    const color = '#' + (hex ? hex[1] : VML_COLORS[fill] || '808080');
    const rawOpacity = String((descendants(shape, 'fill')[0] || { getAttribute: () => '' }).getAttribute('opacity') || '').trim();
    let opacity = rawOpacity ? parseFloat(rawOpacity) : 1;
    if (/f$/i.test(rawOpacity)) opacity /= 65536;
    if (!Number.isFinite(opacity)) opacity = 1;
    const rotation = /rotation\s*:\s*(-?[\d.]+)/i.exec(shape.getAttribute('style') || '');
    const turned = rotation ? Number(rotation[1]) % 360 !== 0 : false;
    return { text, angle: turned ? 'diagonal' : 'horizontal', color, opacity: Math.min(1, Math.max(0.05, Math.round(opacity * 100) / 100)) };
  }
  function symbolOf(font, char) {
    const code = parseInt(char, 16);
    if (!Number.isFinite(code)) return '';
    const table = SYMBOL_CHARS[String(font || '').toLowerCase().replace(/\s*\d+$/, '')];
    const hex = ('0' + (code & 0xFF).toString(16)).slice(-2).toUpperCase();
    return table && table[hex] ? table[hex] : '';
  }
  const noteMarker = (ctx, text) => {
    ctx.noteCounter += 1;
    return '<sup class="footnote-ref-marker" data-note-id="fn-' + Date.now().toString(36) + 'w' + ctx.noteCounter + '" data-note-text="' + escAttr(text) + '"></sup>';
  };

  // --- Modifications suivies et commentaires ------------------------------------------------------------------------------------------------------------------------------------------------
  // Une insertion ou une suppression suivie de Word (`w:ins`, `w:del`, et leurs déplacements) reste une modification EN ATTENTE de l'éditeur (js/track-changes.js : `<ins data-id>` / `<del data-id>`), avec son
  // auteur et sa date dans les métadonnées du suivi ; une même révision de Word (même numéro) n'est qu'une modification. Les modifications de mise en forme ou de structure, que l'éditeur ne suit pas, sont acceptées
  // et comptées (`countLostRevisions`).
  const MAX_REVISIONS = 5000;
  function trackOf(ctx, el, kind) {
    const wordId = attr(el, 'id');
    const key = kind + ':' + (wordId === null ? 'n' + (ctx.revisionAnon += 1) : wordId);
    let id = ctx.revisions.get(key);
    if (!id) {
      if (ctx.revisions.size >= MAX_REVISIONS) { count(ctx, 'trackedChanges'); return null; }
      id = ctx.revisions.size + 1;
      ctx.revisions.set(key, id);
      const meta = { author: null };
      const name = String(attr(el, 'author') || '').trim();
      if (name) meta.authorName = name.slice(0, 120);
      const time = Date.parse(attr(el, 'date') || '');
      meta.createdAt = Number.isFinite(time) ? new Date(time).toISOString() : null;
      ctx.suivi[id] = meta;
    }
    return { kind, id };
  }
  const LOST_REVISIONS = ['rPrChange', 'pPrChange', 'sectPrChange', 'tblPrChange', 'tcPrChange', 'trPrChange', 'tblGridChange', 'tblPrExChange', 'numberingChange', 'cellIns', 'cellDel', 'cellMerge'];
  function countLostRevisions(ctx, body) {
    let lost = 0;
    LOST_REVISIONS.forEach((name) => { lost += descendants(body, name).length; });
    ['ins', 'del', 'moveFrom', 'moveTo'].forEach((name) => descendants(body, name).forEach((el) => { const parent = el.parentNode && el.parentNode.localName; if (parent === 'rPr' || parent === 'trPr') lost += 1; }));
    if (lost) count(ctx, 'trackedChanges', lost);
  }
  // Un commentaire de Word (`word/comments.xml`) et ses réponses (`commentsExtended.xml` : le parent d'une réponse, l'état « résolu ») : un FIL de l'éditeur (js/comments.js) - la marque `comment-mark` sur le passage,
  // les messages (auteur, texte, date) rangés pour la table des fils quand le document aura un numéro. Les réponses rejoignent le fil du commentaire qu'elles suivent. Un commentaire sans passage de texte n'a rien à marquer :
  // il est compté.
  const MAX_THREADS = 1000;
  const plainText = (paragraph) => {
    let out = '';
    const walk = (el) => kids(el).forEach((c) => {
      if (c.localName === 't') out += c.textContent; else if (c.localName === 'tab') out += '\t'; else if (c.localName === 'br' || c.localName === 'cr') out += '\n'; else walk(c);
    });
    walk(paragraph);
    return out;
  };
  async function readComments(ctx, pkg, commentsPath, extendedPath) {
    const doc = commentsPath ? await pkg.xml(commentsPath) : null;
    if (!doc) return;
    const entries = [];
    kids(doc.documentElement, 'comment').forEach((el) => {
      const paragraphs = descendants(el, 'p');
      const time = Date.parse(attr(el, 'date') || '');
      const last = paragraphs[paragraphs.length - 1];
      entries.push({
        wordId: attr(el, 'id'), auteur: String(attr(el, 'author') || '').trim(), creeLe: new Date(Number.isFinite(time) ? time : Date.now()).toISOString(),
        texte: paragraphs.map(plainText).join('\n').replace(/\s+$/, '').replace(/^\s+/, ''), paraId: last ? attr(last, 'paraId') : null,
      });
    });
    const extended = new Map();
    const ext = extendedPath ? await pkg.xml(extendedPath) : null;
    if (ext) descendants(ext.documentElement, 'commentEx').forEach((x) => extended.set(attr(x, 'paraId'), { parent: attr(x, 'paraIdParent'), done: /^(1|true)$/i.test(String(attr(x, 'done') || '')) }));
    const byPara = new Map(entries.filter(e => e.paraId).map(e => [e.paraId, e]));
    const rootOf = (entry) => {
      let cur = entry;
      for (let guard = 0; guard < 50; guard++) {
        const info = extended.get(cur.paraId);
        const parent = info && info.parent ? byPara.get(info.parent) : null;
        if (!parent || parent === cur) break;
        cur = parent;
      }
      return cur;
    };
    const stamp = Date.now().toString(36);
    const threads = new Map();
    entries.forEach((entry) => {
      if (entry.wordId === null || !entry.texte) return;
      const root = rootOf(entry);
      let thread = threads.get(root);
      if (!thread) {
        if (threads.size >= MAX_THREADS) { count(ctx, 'comments'); return; }
        const info = extended.get(root.paraId);
        thread = { id: 'cm-' + stamp + 'w' + (threads.size + 1), resolved: !!(info && info.done), messages: [], anchored: false };
        threads.set(root, thread);
        ctx.threads.push(thread);
      }
      thread.messages.push({ auteur: entry.auteur, texte: entry.texte, creeLe: entry.creeLe });
      ctx.comments.set(entry.wordId, { thread });
    });
    ctx.threads.forEach(thread => thread.messages.sort((a, b) => String(a.creeLe).localeCompare(String(b.creeLe))));
  }
  // Les fils dont le passage est ouvert à cet endroit du texte (`w:commentRangeStart` lu, `w:commentRangeEnd` pas encore) : [{ id, resolved }] dans l'ordre des numéros, ou null.
  function openComments(ctx) {
    if (!ctx.openComments.size) return null;
    const seen = new Map();
    ctx.openComments.forEach((wordId) => {
      const info = ctx.comments.get(wordId);
      if (info && !seen.has(info.thread.id)) { seen.set(info.thread.id, { id: info.thread.id, resolved: info.thread.resolved }); info.thread.anchored = true; }
    });
    return seen.size ? Array.from(seen.values()).sort((a, b) => (a.id < b.id ? -1 : 1)) : null;
  }
  function commentRange(ctx, el) {
    const id = attr(el, 'id');
    if (id === null) return;
    if (el.localName === 'commentRangeStart') { if (ctx.comments.has(id)) ctx.openComments.add(id); } else ctx.openComments.delete(id);
  }

  // Une série de caractères (`w:r`).
  const DELETED_PARTS = new Set(['delText', 't', 'tab', 'br', 'cr', 'noBreakHyphen', 'softHyphen']);
  function readRun(st, run) {
    const ctx = st.ctx;
    const rPr = kid(run, 'rPr');
    const r = resolveRun(ctx, st.r, rPr);
    if (['shadow', 'emboss', 'imprint', 'outline'].some(k => isOn(r[k])) && kids(run).some(c => c.localName === 't' && c.textContent.trim())) lose(st, 'textEffects');
    let buffer = '';
    const flush = () => { if (buffer) { pushText(st, r, buffer, false); buffer = ''; } };
    const openField = () => ctx.fields[ctx.fields.length - 1];
    const deleted = !!st.track && st.track.kind === 'del';
    kids(run).forEach((c) => {
      // Une série supprimée (suivi des modifications) ne garde que son texte, ses tabulations et ses retours à la ligne.
      if (deleted && !DELETED_PARTS.has(c.localName)) return;
      switch (c.localName) {
        case 'delText': buffer += c.textContent; break;
        case 't': { const open = openField(); if (!(open && open.phase === 'instr')) buffer += c.textContent; break; }
        case 'instrText': { flush(); const open = openField(); if (open) open.instr += c.textContent; break; }
        case 'tab': case 'ptab': buffer += '\t'; break;
        case 'cr': buffer += '\n'; break;
        case 'br': {
          const type = attr(c, 'type');
          if (type === 'page') { flush(); st.items.push({ pageBreak: true }); } else if (type === 'column') { flush(); st.items.push({ pageBreak: true }); count(ctx, 'columns'); } else buffer += '\n';
          break;
        }
        case 'noBreakHyphen': buffer += '\u2011'; break;
        case 'softHyphen': buffer += '\u00ad'; break;
        case 'sym': {
          const sign = symbolOf(attr(c, 'font'), attr(c, 'char'));
          if (sign) buffer += sign; else count(ctx, 'symbols');
          break;
        }
        case 'fldChar': flush(); fieldChar(st, attr(c, 'fldCharType')); break;
        case 'drawing': { flush(); const html = drawingHtml(st, c); if (html) pushRaw(st, html); break; }
        case 'pict': { flush(); const html = pictureHtml(st, c); if (html) pushRaw(st, html); break; }
        case 'object': { flush(); const html = pictureHtml(st, c); if (html) pushRaw(st, html); else count(ctx, 'shapes'); break; }
        case 'footnoteReference': case 'endnoteReference': {
          flush();
          const id = attr(c, 'id');
          const endnote = c.localName === 'endnoteReference';
          const text = (endnote ? ctx.endnotes : ctx.footnotes).get(id);
          if (endnote) count(ctx, 'endnotes');
          pushRaw(st, noteMarker(ctx, text || ''));
          break;
        }
        case 'AlternateContent': {
          flush();
          const choice = kid(c, 'Choice') || kid(c, 'Fallback');
          if (choice) kids(choice).forEach((d) => { if (d.localName === 'drawing') { const html = drawingHtml(st, d); if (html) pushRaw(st, html); } else if (d.localName === 'pict') { const html = pictureHtml(st, d); if (html) pushRaw(st, html); } });
          break;
        }
        default: break;
      }
    });
    flush();
  }

  // Le contenu d'un paragraphe ou d'un conteneur en ligne (lien, révision, balise, contrôle de contenu) : les séries de caractères et ce qui les entoure.
  function readInline(st, parent, depth) {
    if (depth > MAX_DEPTH) return;
    const ctx = st.ctx;
    kids(parent).forEach((c) => {
      switch (c.localName) {
        case 'r': readRun(st, c); break;
        case 'hyperlink': {
          const rId = relAttr(c, 'id');
          const entry = rId ? st.part.rels.byId.get(rId) : null;
          const href = entry && entry.external ? safeHref(entry.href) : '';
          if (!href) { if (rId || attr(c, 'anchor')) count(ctx, 'links'); }
          const kept = st.link;
          st.link = href;
          readInline(st, c, depth + 1);
          st.link = kept;
          break;
        }
        case 'fldSimple': {
          const field = { instr: attr(c, 'instr') || '', kind: '', phase: 'result', sink: null, parentItems: null };
          field.kind = fieldKind(field.instr);
          ctx.fields.push(field);
          if (COLLECTED.has(field.kind)) { field.parentItems = st.items; field.sink = []; st.items = field.sink; }
          readInline(st, c, depth + 1);
          ctx.fields.pop();
          if (field.sink) closeField(st, field); else if (FROZEN_FIELDS.has(field.kind)) count(ctx, 'fields');
          break;
        }
        case 'ins': case 'moveTo': case 'del': case 'moveFrom': {
          const kind = c.localName === 'ins' || c.localName === 'moveTo' ? 'ins' : 'del';
          const track = trackOf(ctx, c, kind);
          if (!track && kind === 'del') break; // trop de révisions : la suppression est acceptée
          const kept = st.track;
          st.track = track;
          readInline(st, c, depth + 1);
          st.track = kept;
          break;
        }
        case 'commentRangeStart': case 'commentRangeEnd': commentRange(ctx, c); break;
        case 'smartTag': case 'customXml': case 'bdo': case 'dir': case 'sdtContent': case 'subDoc': readInline(st, c, depth + 1); break;
        case 'sdt': readInline(st, kid(c, 'sdtContent'), depth + 1); break;
        case 'oMath': case 'oMathPara': {
          const text = descendants(c, 't').map(t => t.textContent).join('');
          count(ctx, 'equations');
          if (text) pushText(st, st.r, text, false);
          break;
        }
        case 'AlternateContent': {
          const choice = kid(c, 'Choice') || kid(c, 'Fallback');
          if (choice) readInline(st, choice, depth + 1);
          break;
        }
        default: break;
      }
    });
  }

  // --- Les paragraphes en blocs ----------------------------------------------------------------------------------------------------------------------------------------------------
  const ALIGN_JUSTIFY = /^(both|distribute|thaiDistribute|highKashida|mediumKashida|lowKashida)$/;
  // L'alignement que l'éditeur écrit (undefined : celui du début de ligne). Dans un paragraphe de droite à gauche Word lit « gauche » et « droite » comme « début » et « fin » ; l'éditeur,
  // lui, garde l'alignement en toutes lettres.
  function alignOf(p, rtl) {
    const jc = p.jc && p.jc.val;
    if (!jc) return undefined;
    if (jc === 'center') return 'center';
    if (ALIGN_JUSTIFY.test(jc)) return 'justify';
    const end = jc === 'right' || jc === 'end';
    if (rtl) return end ? 'left' : undefined;
    return end ? 'right' : undefined;
  }
  // Le niveau de titre (1 à 6) d'un paragraphe d'après son style : « Titre 1 » (nommé `heading 1` dans le fichier, quelle que soit la langue de Word) à « Titre 6 ».
  function headingLevel(resolved) {
    for (let i = resolved.chain.length - 1; i >= 0; i--) {
      const style = resolved.chain[i];
      const m = /^heading\s*([1-6])$/i.exec(style.name) || /^(?:heading|titre)([1-6])$/i.exec(style.id);
      if (m) return Number(m[1]);
    }
    return 0;
  }
  const isQuote = resolved => resolved.chain.some(style => /^(quote|intense quote)$/i.test(style.name));
  const twipsToPt = value => Number(value) * PT_PER_TWIP;
  // Les réglages de « Paragraphe… » (js/paragraph-format.js) d'un paragraphe de Word : interligne (multiple de la ligne simple, ou hauteur fixée en points ramenée à la taille du texte), espaces
  // avant et après, retraits.
  function formatOf(p, sizePt, inList, st) {
    const out = {};
    const spacing = p.spacing;
    if (spacing) {
      const auto = value => (value === '1' || value === 'true' ? 280 : null);
      const before = auto(spacing.beforeAutospacing) !== null ? 280 : (spacing.before !== undefined ? Number(spacing.before) : null);
      const after = auto(spacing.afterAutospacing) !== null ? 280 : (spacing.after !== undefined ? Number(spacing.after) : null);
      if (before !== null && Number.isFinite(before)) out.spaceBefore = twipsToPt(before);
      if (after !== null && Number.isFinite(after)) out.spaceAfter = twipsToPt(after);
      const line = spacing.line !== undefined ? Number(spacing.line) : NaN;
      if (Number.isFinite(line) && line > 0) {
        if (!spacing.lineRule || spacing.lineRule === 'auto') out.lineHeight = (line / 240) * NATURAL_LINE;
        else out.lineHeight = twipsToPt(line) / Math.max(1, sizePt);
      }
    }
    const ind = p.ind;
    if (ind && !inList) {
      const left = ind.left !== undefined ? ind.left : ind.start;
      if (left !== undefined && Number(left) > 0) out.indentLeft = twipsToPt(left);
      if (ind.firstLine !== undefined && Number(ind.firstLine) > 0) out.indentFirst = twipsToPt(ind.firstLine);
      if (ind.hanging !== undefined && Number(ind.hanging) > 0) out.indentFirst = -twipsToPt(ind.hanging);
    }
    if (ind) {
      const right = ind.right !== undefined ? ind.right : ind.end;
      if (right !== undefined && Number(right) > 0) lose(st, 'rightIndent');
    }
    return out;
  }
  const NO_BORDER = /^(nil|none)$/i;
  function hasBorders(p) {
    const box = p.pBdr && p.pBdr.el;
    const lines = box ? kids(box).some(side => !NO_BORDER.test(attr(side, 'val') || 'none')) : false;
    const fill = p.shd && p.shd.fill && !/^auto$/i.test(p.shd.fill) && String(p.shd.val || '') !== 'clear' ? true : (p.shd && p.shd.fill && !/^auto$/i.test(p.shd.fill));
    return lines || !!fill;
  }
  function hasCustomTabs(p) {
    const box = p.tabs && p.tabs.el;
    return box ? kids(box, 'tab').some(t => attr(t, 'val') !== 'clear') : false;
  }

  // La liste d'un paragraphe : { tag, style, char, start, level, id }, ou null. `ordinal` compte les éléments de chaque niveau comme Word (un niveau repart quand un niveau au-dessus avance).
  function listOf(ctx, p) {
    const holder = p.numPr && p.numPr.el;
    if (!holder) return null;
    const numId = attr(kid(holder, 'numId'), 'val');
    if (numId === null || numId === '0') return null;
    const num = ctx.numbering.nums.get(numId);
    if (!num) return null;
    const levels = ctx.numbering.abstracts.get(num.abstractId);
    if (!levels) return null;
    const ilvl = Math.min(8, Math.max(0, Number(attr(kid(holder, 'ilvl'), 'val') || 0)));
    const override = num.overrides.get(ilvl);
    const lvl = (override && override.level) || levels.get(ilvl) || levels.get(0);
    if (!lvl) return null;
    // Le compte : par liste abstraite (deux listes du même modèle se suivent, sauf si l'une recommence), un compte par niveau.
    const key = num.abstractId;
    const counters = ctx.counters.get(key) || (ctx.counters.set(key, []), ctx.counters.get(key));
    const startedKey = numId + ':' + ilvl;
    if (override && override.start !== null && !ctx.started.has(startedKey)) counters[ilvl] = override.start - 1;
    ctx.started.add(startedKey);
    counters[ilvl] = (counters[ilvl] === undefined ? lvl.start - 1 : counters[ilvl]) + 1;
    for (let l = ilvl + 1; l < counters.length; l++) counters[l] = undefined;
    const ordinal = counters[ilvl];
    if (lvl.fmt === 'bullet' || lvl.fmt === 'none') {
      const raw = Array.from(lvl.text || '')[0] || '';
      const code = raw ? raw.codePointAt(0) : 0;
      const sign = (code >= 0xF000 && code <= 0xF0FF) ? symbolOf(lvl.font || 'symbol', (code & 0xFF).toString(16)) || ((code & 0xFF) === 0xB7 || (code & 0xFF) === 0x6C ? '•' : '') : raw;
      let style = 'disc';
      let char = '';
      if (/^[•●·∙]$/.test(sign) || !sign) style = 'disc';
      else if (/^[o○◦]$/.test(sign)) style = 'circle';
      else if (/^[▪■◾◼§▫□◻]$/.test(sign)) style = 'square';
      else char = BulletFormat.normalized(sign) || '';
      return { tag: 'ul', style, char, start: 1, level: ilvl, id: numId };
    }
    const numberFormats = { decimal: 'decimal', lowerLetter: 'alpha', upperLetter: 'alpha', lowerRoman: 'roman', upperRoman: 'roman' };
    const style = numberFormats[lvl.fmt] || 'decimal';
    // Ce que l'éditeur ne sait pas écrire d'une numérotation (majuscules, « 1.1 », « Article 1 », chiffres arabes avec zéro) : compté une fois par liste et par niveau.
    const simple = /^%\d[.)]?$/.test(lvl.text) || /^\(%\d\)$/.test(lvl.text);
    const noted = 'num:' + numId + ':' + ilvl;
    if ((!numberFormats[lvl.fmt] || /^upper/.test(lvl.fmt) || !simple) && !ctx.fontsSeen.has(noted)) { ctx.fontsSeen.add(noted); count(ctx, 'numbering'); }
    return { tag: 'ol', style, char: '', start: ordinal, level: ilvl, id: numId };
  }

  // Un paragraphe de la table des matières de Word (styles « TM 1 » à « TM 9 », « En-tête TM », ou leurs noms d'origine « TOC 1 », « TOC Heading ») : l'éditeur refait son sommaire lui-même à partir des titres.
  const TOC_STYLE = /^(?:toc\s*\d|toc heading|table of contents|contents heading|tm\s*\d|en-t[eê]te de table des mati[eè]res|table des mati[eè]res|sommaire|titre de table des mati[eè]res)/i;
  const isTocParagraph = resolved => resolved.chain.some(style => TOC_STYLE.test(style.name) || /^TOC\d?$|^TOCHeading$/i.test(style.id));

  // Les blocs d'un paragraphe (un ou plusieurs : un saut de page au milieu le coupe), chacun { html, list?, quote?, raw? }.
  function paragraphItems(ctx, part, p, layers, depth) {
    const pPr = kid(p, 'pPr');
    const resolved = resolveParagraph(ctx, pPr, layers);
    if (depth === 0 && part.body && isTocParagraph(resolved)) {
      const sectPr = kid(pPr, 'sectPr');
      if (sectPr) ctx.sections.push(sectPr);
      return [{ raw: '<div class="toc-marker"></div>', toc: true }];
    }
    const level = headingLevel(resolved);
    const baseSize = level ? EDITOR_HEADING_PT['H' + level] : EDITOR_BODY_PT;
    const st = newState(ctx, part, resolved, baseSize, depth);
    st.heading = !!level;
    readInline(st, p, 0);
    const sectPr = kid(pPr, 'sectPr');
    if (sectPr) ctx.sections.push(sectPr);
    const out = [];
    const props = resolved.p;
    const rtl = isOn(props.bidi);
    const list = level ? null : listOf(ctx, props);
    // La taille du paragraphe : celle de sa marque de paragraphe (une ligne vide a la hauteur de son texte).
    const markRun = resolveRun(ctx, resolved.r, kid(pPr, 'rPr'));
    const sizePt = markRun.sz ? Number(markRun.sz.val) / 2 : EDITOR_BODY_PT;
    const format = formatOf(props, sizePt, !!list, st);
    // Les tabulations ne comptent que dans un paragraphe qui en contient une : un style qui en déclare sans qu'on s'en serve ne change rien à ce qu'on voit.
    const hasTab = st.items.some(item => item.text && item.text.indexOf('\t') >= 0);
    if (ctx.tabStop && hasTab) format.tabSize = ctx.tabStop;
    if (hasTab && hasCustomTabs(props)) lose(st, 'tabs');
    if (hasBorders(props)) lose(st, 'paragraphBorders');
    const align = alignOf(props, rtl);
    const direction = TextDirection.markup(rtl);
    const keep = isOn(props.keepNext) && !level ? ' data-keep-next="true"' : '';
    if (isOn(props.pageBreakBefore)) out.push({ raw: '<div class="page-break-marker"></div>' });
    // Les segments entre les sauts de page.
    const segments = [[]];
    st.items.forEach((item) => { if (item.pageBreak) segments.push([]); else segments[segments.length - 1].push(item); });
    segments.forEach((items, index) => {
      if (index > 0) out.push({ raw: '<div class="page-break-marker"></div>' });
      const html = itemsHtml(items);
      const empty = !html;
      if (empty && segments.length > 1) return;
      let block;
      if (level) {
        block = '<h' + level + direction + (align ? ' style="text-align: ' + align + '"' : '') + '>' + html + '</h' + level + '>';
      } else {
        const attrs = direction + ParagraphFormat.markup(format, align, rtl) + keep;
        const filler = empty && sizePt >= 12 && !list ? '<span style="font-size: ' + fixed(sizePt) + 'pt"> </span>' : '';
        block = '<p' + attrs + '>' + html + filler + '</p>';
      }
      const entry = { html: block };
      if (list && index === 0) { entry.list = list; entry.rtl = rtl; }
      else if (isQuote(resolved) && !level) entry.quote = true;
      out.push(entry);
    });
    st.losses.forEach(key => count(ctx, key));
    // Un paragraphe de fin de section : la page suivante commence (sauf section continue, que le saut de page coupe quand même).
    if (sectPr && !(attr(kid(sectPr, 'type'), 'val') === 'continuous')) out.push({ raw: '<div class="page-break-marker"></div>' });
    return out;
  }
  // Les blocs en balisage : les listes sont emboîtées selon leur niveau (jamais de saut de niveau), une liste change quand sa sorte ou son style change (js/pptx-import.js:assemble).
  function assemble(items) {
    let out = '';
    const stack = [];
    const closeTo = (depth) => { while (stack.length > depth) out += '</li></' + (stack.pop().tag === 'ol' ? 'ol' : 'ul') + '>'; };
    items.forEach((item) => {
      if (!item.list) {
        closeTo(0);
        out += item.quote ? '<blockquote>' + item.html + '</blockquote>' : (item.raw !== undefined ? item.raw : item.html);
        return;
      }
      const l = item.list;
      const level = Math.min(l.level, stack.length);
      closeTo(level + 1);
      const key = l.tag + ':' + l.style + ':' + l.char + ':' + l.id + ':' + (item.rtl ? 'rtl' : '');
      const top = stack[level];
      if (top && top.key === key) {
        out += '</li>';
      } else {
        if (top) closeTo(level);
        const way = TextDirection.markup(item.rtl);
        if (l.tag === 'ol') out += '<ol' + way + (l.style !== 'decimal' ? ' data-number-style="' + l.style + '"' : '') + (l.start > 1 ? ' start="' + l.start + '"' : '') + '>';
        else out += '<ul' + way + (l.style !== 'disc' ? ' data-bullet-style="' + l.style + '"' : '') + BulletFormat.markup(l.char) + '>';
        stack[level] = { tag: l.tag, key };
        stack.length = level + 1;
      }
      out += '<li>' + item.html;
    });
    closeTo(0);
    return out;
  }
  // Les blocs d'un conteneur (le corps, une case de tableau, un en-tête) : paragraphes, tableaux, contrôles de contenu.
  function blocksOf(ctx, part, container, layers, depth) {
    const out = [];
    if (!container || depth > MAX_DEPTH) return out;
    kids(container).forEach((c) => {
      switch (c.localName) {
        case 'p': paragraphItems(ctx, part, c, layers, depth).forEach(item => out.push(item)); break;
        case 'tbl':
          if (depth > 0) { count(ctx, 'nestedTables'); out.push(...flattenTable(ctx, part, c, layers, depth)); } else out.push({ raw: tableHtml(ctx, part, c, layers, depth) });
          break;
        case 'sdt': blocksOf(ctx, part, kid(c, 'sdtContent'), layers, depth).forEach(item => out.push(item)); break;
        case 'sdtContent': case 'customXml': case 'smartTag': blocksOf(ctx, part, c, layers, depth).forEach(item => out.push(item)); break;
        case 'commentRangeStart': case 'commentRangeEnd': commentRange(ctx, c); break;
        case 'ins': case 'moveTo': count(ctx, 'trackedChanges'); blocksOf(ctx, part, c, layers, depth).forEach(item => out.push(item)); break;
        case 'del': case 'moveFrom': count(ctx, 'trackedChanges'); break;
        default: break;
      }
    });
    // Les paragraphes qui se suivent d'une table des matières ne font qu'un repère de sommaire, compté une fois.
    const merged = [];
    out.forEach((item) => {
      if (item.toc && merged.length && merged[merged.length - 1].toc) return;
      if (item.toc) count(ctx, 'toc');
      merged.push(item);
    });
    return merged;
  }
  // Un tableau dans une case : l'éditeur n'a pas de tableau dans un tableau, ses cases sont reprises l'une après l'autre.
  function flattenTable(ctx, part, tbl, layers, depth) {
    const out = [];
    kids(tbl, 'tr').forEach(tr => kids(tr, 'tc').forEach(tc => blocksOf(ctx, part, tc, layers, depth + 1).forEach(item => out.push(item))));
    return out;
  }

  // --- Les tableaux ----------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Ce que le style de tableau demande d'une région (première ligne, bandes, première colonne...) : ses propriétés de paragraphe et de caractère, de case et de tableau.
  function conditionOf(chain, type) {
    const out = { p: {}, r: {}, tc: {}, tbl: {} };
    chain.forEach(style => style.conditions.forEach((cond) => {
      if (attr(cond, 'type') !== type) return;
      mergeInto(out.p, kid(cond, 'pPr'));
      mergeInto(out.r, kid(cond, 'rPr'));
      mergeInto(out.tc, kid(cond, 'tcPr'));
      mergeInto(out.tbl, kid(cond, 'tblPr'));
    }));
    return out;
  }
  // Les traits d'un jeu de propriétés (`tblBorders` ou `tcBorders`) : { top, bottom, left, right, insideH, insideV } -> élément.
  function bordersOf(props, tag) {
    const box = props && props[tag] && props[tag].el;
    const out = {};
    kids(box).forEach((side) => {
      const name = side.localName === 'start' ? 'left' : (side.localName === 'end' ? 'right' : side.localName);
      out[name] = side;
    });
    return out;
  }
  // Un trait de Word en valeur de l'éditeur : 'none', ou '#rrggbb' (le trait fin de cette couleur). Épaisseur et sorte (pointillé, double...) ne se gardent pas : la sorte qui n'est pas unie est comptée.
  function borderValue(ctx, side, losses) {
    if (!side) return null;
    const val = attr(side, 'val') || 'single';
    if (NO_BORDER.test(val)) return 'none';
    if (!/^single$/i.test(val) && losses) losses.add('borderStyles');
    const color = colorOf(ctx.theme, { val: attr(side, 'color'), themeColor: attr(side, 'themeColor'), themeShade: attr(side, 'themeShade'), themeTint: attr(side, 'themeTint') });
    return '#' + (color || '000000');
  }
  const LOOK_BITS = { firstRow: 0x20, lastRow: 0x40, firstColumn: 0x80, lastColumn: 0x100, noHBand: 0x200, noVBand: 0x400 };
  function tableLook(direct) {
    const look = direct.tblLook;
    const out = {};
    if (!look) return out;
    const mask = look.val !== undefined ? parseInt(look.val, 16) || 0 : 0;
    Object.keys(LOOK_BITS).forEach((key) => {
      out[key] = look[key] !== undefined ? /^(1|true|on)$/i.test(look[key]) : (mask & LOOK_BITS[key]) !== 0;
    });
    return out;
  }

  function tableHtml(ctx, part, tbl, layers, depth) {
    const tblPr = kid(tbl, 'tblPr');
    const styleId = attr(kid(tblPr, 'tblStyle'), 'val') || ctx.styles.defaultTable;
    const chain = styleChain(ctx.styles, styleId);
    const direct = mergeInto({}, tblPr);
    const look = tableLook(direct);
    const whole = { p: {}, r: {}, tc: {}, tbl: {} };
    chain.forEach((style) => { layer(whole.p, style.p); layer(whole.r, style.r); mergeInto(whole.tc, style.tcPr); mergeInto(whole.tbl, style.tblPr); });
    const losses = new Set();
    // Les lignes et leurs cases, chacune avec sa colonne de départ (la grille compte les colonnes avant les fusions).
    const rows = kids(tbl, 'tr').map((tr) => {
      const trPr = kid(tr, 'trPr');
      let col = Number(attr(kid(trPr, 'gridBefore'), 'val') || 0);
      const cells = [];
      const take = (tc) => {
        const tcPr = kid(tc, 'tcPr');
        const span = Math.max(1, Number(attr(kid(tcPr, 'gridSpan'), 'val') || 1));
        const merge = kid(tcPr, 'vMerge');
        cells.push({ tc, tcPr, col, span, vmerge: merge ? (attr(merge, 'val') === 'restart' ? 'restart' : 'continue') : null, down: 1, skip: false });
        col += span;
      };
      kids(tr).forEach((c) => { if (c.localName === 'tc') take(c); else if (c.localName === 'sdt') kids(kid(c, 'sdtContent'), 'tc').forEach(take); });
      return { tr, trPr, cells, height: numAttr(kid(trPr, 'trHeight'), 'val', 0) };
    });
    let grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map(g => numAttr(g, 'w', 0));
    const columns = Math.max(grid.length, ...rows.map(row => row.cells.reduce((n, c) => Math.max(n, c.col + c.span), 0)), 1);
    if (grid.length < columns) {
      const known = grid.slice();
      grid = [];
      for (let i = 0; i < columns; i++) grid.push(known[i] || 1440);
    }
    // Les fusions verticales : la case de départ compte les cases qui la continuent dessous.
    rows.forEach((row, r) => row.cells.forEach((cell) => {
      if (cell.vmerge !== 'restart') return;
      for (let rr = r + 1; rr < rows.length; rr++) {
        const below = rows[rr].cells.find(c => c.col === cell.col && c.vmerge === 'continue');
        if (!below) break;
        below.skip = true;
        cell.down += 1;
      }
    }));
    rows.forEach(row => row.cells.forEach((cell) => { if (cell.vmerge === 'continue' && !cell.skip) cell.skip = true; }));
    const widthsPx = grid.map(w => Math.max(1, Math.round(w * PX_PER_TWIP)));
    const directBorders = bordersOf(direct, 'tblBorders');
    const wholeBorders = bordersOf(whole.tbl, 'tblBorders');
    const wholeCellBorders = bordersOf(whole.tc, 'tcBorders');
    const lastRow = rows.length - 1;
    const dataFirst = look.firstRow ? 1 : 0;
    const dataLast = look.lastRow ? lastRow - 1 : lastRow;
    const dataColFirst = look.firstColumn ? 1 : 0;
    const dataColLast = look.lastColumn ? columns - 2 : columns - 1;
    let html = '<table style="width: ' + widthsPx.reduce((a, b) => a + b, 0) + 'px"><colgroup>' + widthsPx.map(w => '<col style="width: ' + w + 'px">').join('') + '</colgroup><tbody>';
    rows.forEach((row, r) => {
      const height = row.height > 0 ? Math.round(row.height * PX_PER_TWIP) : 0;
      html += '<tr' + (height ? ' data-row-height="' + height + '" style="height: ' + height + 'px"' : '') + '>';
      row.cells.forEach((cell) => {
        if (cell.skip) return;
        const c = cell.col;
        // Les régions du style de tableau qui touchent cette case, de la moins à la plus prioritaire.
        const types = [];
        if (!look.noHBand && r >= dataFirst && r <= dataLast) types.push(((r - dataFirst) % 2 === 0) ? 'band1Horz' : 'band2Horz');
        if (!look.noVBand && c >= dataColFirst && c <= dataColLast) types.push(((c - dataColFirst) % 2 === 0) ? 'band1Vert' : 'band2Vert');
        if (look.firstColumn && c === 0) types.push('firstCol');
        if (look.lastColumn && c + cell.span >= columns) types.push('lastCol');
        if (look.firstRow && r === 0) types.push('firstRow');
        if (look.lastRow && r + cell.down - 1 >= lastRow && lastRow > 0) types.push('lastRow');
        if (look.firstRow && look.firstColumn && r === 0 && c === 0) types.push('nwCell');
        const conds = types.map(type => conditionOf(chain, type));
        const own = mergeInto({}, cell.tcPr);
        const textLayers = (layers || []).concat([{ p: whole.p, r: whole.r }], conds.map(k => ({ p: k.p, r: k.r })));
        // Le fond : la case, puis les régions (la plus prioritaire d'abord), puis le style.
        const fillOf = (props) => {
          const shd = props.shd;
          if (!shd || shd.fill === undefined || /^auto$/i.test(shd.fill)) return null;
          return colorOf(ctx.theme, { fill: shd.fill, themeFill: shd.themeFill, themeFillShade: shd.themeFillShade, themeFillTint: shd.themeFillTint });
        };
        let fill = fillOf(own);
        for (let i = conds.length - 1; i >= 0 && !fill; i--) fill = fillOf(conds[i].tc);
        if (!fill) fill = fillOf(whole.tc);
        // Les traits : la case, les régions, le tableau, le style ; la face intérieure ou extérieure selon la place de la case.
        const ownBorders = bordersOf(own, 'tcBorders');
        const edges = { top: r === 0, bottom: r + cell.down - 1 >= lastRow, left: c === 0, right: c + cell.span >= columns };
        const outer = { top: 'top', bottom: 'bottom', left: 'left', right: 'right' };
        const inner = { top: 'insideH', bottom: 'insideH', left: 'insideV', right: 'insideV' };
        let borderAttrs = '';
        ['top', 'right', 'bottom', 'left'].forEach((side) => {
          const tableName = edges[side] ? outer[side] : inner[side];
          let found = ownBorders[side];
          for (let i = conds.length - 1; i >= 0 && !found; i--) {
            const cb = bordersOf(conds[i].tc, 'tcBorders');
            const tb = bordersOf(conds[i].tbl, 'tblBorders');
            found = cb[side] || tb[tableName];
          }
          if (!found) found = directBorders[tableName] || wholeCellBorders[side] || wholeBorders[tableName];
          const value = borderValue(ctx, found, losses) || 'none';
          borderAttrs += ' data-border-' + side + '="' + value + '"';
        });
        const valign = attr(kid(cell.tcPr, 'vAlign'), 'val');
        const span = widthsPx.slice(c, c + cell.span);
        const content = assemble(blocksOf(ctx, part, cell.tc, textLayers, depth + 1));
        html += '<td' + (cell.span > 1 ? ' colspan="' + cell.span + '"' : '') + (cell.down > 1 ? ' rowspan="' + cell.down + '"' : '') + ' colwidth="' + span.join(',') + '"'
          + (fill ? ' style="background-color: #' + fill + '"' : '') + (valign === 'center' ? ' data-valign="middle"' : (valign === 'bottom' ? ' data-valign="bottom"' : '')) + borderAttrs + '>'
          + (content || '<p></p>') + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    losses.forEach(key => count(ctx, key));
    return html;
  }

  // --- La page, les en-têtes et pieds de page, les notes --------------------------------------------------------------------------------------------------------------------
  // Les formats que l'éditeur nomme (côté court, côté long, en millimètres) ; tout autre est un format libre « LARGEURxHAUTEUR ».
  const NAMED_FORMATS = [['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148]];
  function pageOf(sectPr) {
    const size = kid(sectPr, 'pgSz');
    const margin = kid(sectPr, 'pgMar');
    let w = numAttr(size, 'w', 11906);
    let h = numAttr(size, 'h', 16838);
    const landscape = w > h;
    const short = Math.min(w, h) * MM_PER_TWIP;
    const long = Math.max(w, h) * MM_PER_TWIP;
    const named = NAMED_FORMATS.find(f => Math.abs(f[1] - short) < 1.5 && Math.abs(f[2] - long) < 1.5);
    const tenthText = value => String(Math.round(value * 10) / 10);
    const tenth = value => Math.round(value * 10) / 10;
    const format = PageLayout.normalizeFormat(named ? named[0] : tenthText(short) + 'x' + tenthText(long));
    const mm = (name, fallback) => Math.max(0, Math.abs(numAttr(margin, name, fallback)) * MM_PER_TWIP);
    return {
      top: tenth(mm('top', 1440)), right: tenth(mm('right', 1440)), bottom: tenth(mm('bottom', 1440)), left: tenth(mm('left', 1440)),
      orientation: landscape ? PageLayout.LANDSCAPE : PageLayout.PORTRAIT, format,
    };
  }
  const samePage = (a, b) => ['top', 'right', 'bottom', 'left'].every(k => Math.abs(a[k] - b[k]) < 0.6) && a.orientation === b.orientation && a.format === b.format;

  // Le texte brut d'une note de bas de page (l'éditeur la garde en texte, sur une ligne).
  function plainNote(note) {
    const parts = [];
    kids(note, 'p').forEach((p) => {
      let text = '';
      descendants(p, 'r').forEach((run) => {
        if (kid(run, 'footnoteRef') || kid(run, 'endnoteRef')) return;
        kids(run).forEach((c) => { if (c.localName === 't') text += c.textContent; else if (c.localName === 'tab' || c.localName === 'br' || c.localName === 'cr') text += ' '; });
      });
      if (text.trim()) parts.push(text.replace(/\s+/g, ' ').trim());
    });
    return parts.join(' ');
  }
  async function readNotes(pkg, path, tag) {
    const out = new Map();
    const doc = await pkg.xml(path);
    if (!doc) return out;
    kids(doc.documentElement, tag).forEach((note) => {
      const type = attr(note, 'type');
      if (type && type !== 'normal') return;
      out.set(attr(note, 'id'), plainNote(note));
    });
    return out;
  }

  // La zone d'en-tête ou de pied de page d'un type (`default`, `first`) d'une section : son HTML ('' quand elle n'a rien).
  async function zoneHtml(ctx, docRels, sectPr, refName, type) {
    const ref = kids(sectPr, refName).find(el => attr(el, 'type') === type);
    const entry = ref ? docRels.byId.get(relAttr(ref, 'id')) : null;
    const doc = entry && entry.target ? await ctx.pkg.xml(entry.target) : null;
    if (!doc) return '';
    const rels = await ctx.pkg.rels(entry.target);
    const part = { path: entry.target, rels, images: await loadImages(ctx, rels) };
    const items = blocksOf(ctx, part, doc.documentElement, [], 0);
    return assemble(items);
  }

  // --- Le document -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Le document d'un paquet Word : { html, page, headerFooter (ou null), report: [{ key, n }], paragraphs }.
  async function fromBuffer(buffer, options) {
    const pkg = await openPackage(buffer);
    const mainTarget = await (async () => {
      const doc = await pkg.xml('_rels/.rels');
      const list = doc ? descendants(doc.documentElement, 'Relationship') : [];
      const main = list.find(el => /\/officeDocument$/.test(attr(el, 'Type') || ''));
      return main ? resolvePath('', attr(main, 'Target') || '') : null;
    })();
    const mainPath = mainTarget && pkg.has(mainTarget) ? mainTarget : (pkg.has('word/document.xml') ? 'word/document.xml' : null);
    if (!mainPath) throw fail('unreadable', 'Ce fichier n’est pas un document Word.');
    const doc = await pkg.xml(mainPath);
    if (!doc) throw fail('unreadable', 'Ce document Word n’a pas pu être lu.');
    const docRels = await pkg.rels(mainPath);
    const byType = type => (docRels.ofType(type)[0] || {}).target || null;
    const theme = readTheme(await pkg.xml(byType('theme') || 'word/theme/theme1.xml'));
    const styles = readStyles(await pkg.xml(byType('styles') || 'word/styles.xml'));
    const numbering = readNumbering(await pkg.xml(byType('numbering') || 'word/numbering.xml'));
    const settings = await pkg.xml(byType('settings') || 'word/settings.xml');
    const ctx = {
      pkg, theme, styles, numbering, report: new Map(), fontsSeen: new Set(), imageBytes: 0, fields: [], sections: [], counters: new Map(), started: new Set(), noteCounter: 0,
      footnotes: await readNotes(pkg, byType('footnotes') || 'word/footnotes.xml', 'footnote'),
      endnotes: await readNotes(pkg, byType('endnotes') || 'word/endnotes.xml', 'endnote'),
      tabStop: null, revisions: new Map(), revisionAnon: 0, suivi: {}, comments: new Map(), threads: [], openComments: new Set(),
      mergeField: (options && options.mergeField) || defaultMergeField,
      redraws: [], redrawKeys: new Map(),
    };
    const tab = settings ? numAttr(descendants(settings.documentElement, 'defaultTabStop')[0], 'val', 0) : 0;
    if (tab > 0) ctx.tabStop = round2(tab * PT_PER_TWIP);
    await readComments(ctx, pkg, byType('comments'), byType('commentsExtended'));
    const body = kid(doc.documentElement, 'body');
    if (!body) throw fail('empty', 'Ce document Word est vide.');
    const part = { path: mainPath, rels: docRels, images: await loadImages(ctx, docRels), body: true };
    const items = blocksOf(ctx, part, body, [], 0);
    ctx.openComments.clear();
    countLostRevisions(ctx, body);
    const finalSect = kid(body, 'sectPr');
    const sections = ctx.sections.concat(finalSect ? [finalSect] : []);
    if (finalSect) ctx.sections.length = 0;
    // Un saut de page de fin de section en fin de document n'ouvre pas de page vide.
    while (items.length && items[items.length - 1].raw === '<div class="page-break-marker"></div>') items.pop();
    let html = assemble(items);
    const first = sections[0] || finalSect;
    const page = first ? pageOf(first) : null;
    let different = 0;
    sections.slice(1).forEach((s) => { if (!samePage(pageOf(s), page)) different += 1; if (numAttr(kid(s, 'cols'), 'num', 1) > 1) count(ctx, 'columns'); });
    if (first && numAttr(kid(first, 'cols'), 'num', 1) > 1) count(ctx, 'columns');
    if (different) count(ctx, 'sections', different);
    sections.forEach((s) => { if (kid(s, 'pgBorders')) count(ctx, 'pageBorders'); });
    // Les en-têtes et pieds de page de la première section (ou du document, à défaut).
    const holder = sections.find(s => kids(s, ['headerReference', 'footerReference']).length) || first;
    const zones = { header: { default: '', first: '' }, footer: { default: '', first: '' } };
    if (holder) {
      zones.header.default = await zoneHtml(ctx, docRels, holder, 'headerReference', 'default');
      zones.header.first = await zoneHtml(ctx, docRels, holder, 'headerReference', 'first');
      zones.footer.default = await zoneHtml(ctx, docRels, holder, 'footerReference', 'default');
      zones.footer.first = await zoneHtml(ctx, docRels, holder, 'footerReference', 'first');
    }
    // Les images rognées, tournées ou retournées se redessinent ici, dans le document et dans chaque zone, avant que le compte rendu soit établi.
    [html, zones.header.default, zones.header.first, zones.footer.default, zones.footer.first] = await settleRedraws(ctx, [html, zones.header.default, zones.header.first, zones.footer.default, zones.footer.first]);
    const different1 = !!kid(holder, 'titlePg') && (PageLayout.hasZoneContent(zones.header.first) || PageLayout.hasZoneContent(zones.footer.first));
    if (!different1) { zones.header.first = ''; zones.footer.first = ''; }
    const filled = [zones.header.default, zones.header.first, zones.footer.default, zones.footer.first].some(PageLayout.hasZoneContent);
    const headerFooter = filled ? { enabled: true, differentFirstPage: different1, header: zones.header, footer: zones.footer } : null;
    if (ctx.watermark) { if (page) page.watermark = ctx.watermark; else count(ctx, 'watermark'); }
    if (!html.replace(/<p[^>]*><\/p>/g, '').trim() && !filled) throw fail('empty', 'Ce document Word est vide.');
    // Les fils dont aucun passage de texte n'a été marqué n'ont rien à quoi s'accrocher : comptés, non repris.
    const unanchored = ctx.threads.filter(thread => !thread.anchored).length;
    if (unanchored) count(ctx, 'comments', unanchored);
    const comments = ctx.threads.filter(thread => thread.anchored).map(thread => ({ id: thread.id, resolved: thread.resolved, messages: thread.messages }));
    const report = REPORT_KEYS.filter(key => ctx.report.get(key)).map(key => ({ key, n: ctx.report.get(key) }));
    return { html, page, headerFooter, report, suiviModifications: ctx.revisions.size ? ctx.suivi : null, comments };
  }
  // Un champ de fusion de Word devient la variable de la colonne du même nom dans la table courante, quand elle existe et qu'une seule colonne porte ce nom ('' : il reste son texte). Le nom se compare
  // sans tenir compte des majuscules ni des accents, un blanc valant un trait bas (Word écrit « Prénom_du_client » pour « Prénom du client »).
  const plainName = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_]+/g, '_').trim();
  function defaultMergeField(name) {
    try {
      const wanted = plainName(name);
      const table = GristAPI.getCurrentTableId();
      if (!wanted || !table) return '';
      const matches = GristAPI.getAllVariables().filter(v => v.table === table && (plainName(v.column) === wanted || plainName(GristAPI.getColumnLabel(v.table, v.column)) === wanted));
      return matches.length === 1 ? EditorNodes.varBadgeHtml({ table: matches[0].table, column: matches[0].column, key: matches[0].key }) : '';
    } catch (e) {
      return '';
    }
  }
  async function fromFile(file, options) {
    if (!file || file.size > MAX_FILE_BYTES) throw fail('tooBig', 'Ce fichier est trop gros pour être importé.', { size: file ? file.size : 0, max: MAX_FILE_BYTES });
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (e) {
      throw fail('unreadable', 'Ce fichier n’a pas pu être lu.', { cause: e });
    }
    return fromBuffer(buffer, options);
  }

  return { fromFile, fromBuffer, MAX_FILE_BYTES, MAX_UNPACKED_BYTES, REPORT_KEYS };
})();
