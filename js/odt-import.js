// Import OpenDocument texte : un fichier .odt (ou son modèle .ott, ou le fichier « flat » .fodt) devient le HTML d'un NOUVEAU document, sans nom et pas encore enregistré, sur le modèle de l'import Word
// (js/docx-import.js) : reprendre tous les éléments qui correspondent à une fonction déjà développée, dire à la personne, à la fin, ce qui n'a pas pu être pris, et rester au plus près du fichier. Les formats
// libres (LibreOffice, OnlyOffice, Collabora, Calligra...) sont lus sans aucune bibliothèque de plus : un zip (JSZip, déjà chargé) de parties XML, lu à la main comme le .docx.
//
// Le fichier : `content.xml` (le texte et les styles « automatiques » : P1, T1, Table1.A1...), `styles.xml` (les styles nommés, les valeurs par défaut, les pages et leurs marges), les polices déclarées. Rien n'est
// lu au hasard : une valeur qui manque prend celle que le fichier hérite (les valeurs par défaut, puis le style et ceux dont il hérite `style:parent-style-name`, puis le réglage de la série de caractères).
//
// Ce que le texte devient : les paragraphes (alignement, interligne, espaces avant et après, retraits, sens d'écriture), les titres (`text:h`, niveaux 1 à 6), les séries de caractères (gras, italique, souligné et
// sa sorte, barré, exposant, indice, couleur, fond, police, taille, espacement, petites capitales, majuscules), les listes à puces et numérotées emboîtées, les tableaux (colonnes, fusions, fonds, traits, hauteurs,
// alignement vertical, tableau dans un tableau mis à plat), les liens, les sauts de ligne et de page, les tabulations, la page (format, sens, marges).
// Puis ce que l'éditeur sait porter à côté du texte : les images et les notes, les en-têtes et pieds de page de la page de départ (et sa première page), les commentaires et leurs réponses (des fils), les modifications
// suivies (insertions et suppressions restées en attente, avec auteur et date), les champs de fusion (la variable de la colonne du même nom) et le numéro de page.
//
// Ce qu'il ne garde pas est COMPTÉ, un genre à la fois, et dit à la personne par la fenêtre du compte rendu (js/main-import.js:tellOdtImportReport) ; rien n'est perdu en silence. Le moteur ne touche ni à
// l'éditeur ni à la page : il rend le TEXTE du document (le HTML que l'éditeur écrit), la page et le compte rendu.
const OdtImport = (function () {
  // Les plafonds communs aux imports (js/export-common.js:Ooxml.LIMITS) ; une partie XML plus grosse que celui-ci est refusée.
  const { file: MAX_FILE_BYTES, unpacked: MAX_UNPACKED_BYTES, image: MAX_IMAGE_BYTES, images: MAX_IMAGES_BYTES } = ExportCommon.Ooxml.LIMITS;
  const MAX_PART_BYTES = 60 * 1024 * 1024;
  const MAX_DEPTH = 24;             // listes, tableaux et sections emboîtés
  const MAX_REPEAT = 500;           // une colonne, une ligne ou une case « répétée » plus que cela est ramenée à cela
  const MAX_ROWS = 5000;
  const MAX_CELLS = 20000;          // un tableau plus grand n'est plus un tableau de texte : il est coupé là et le compte rendu le dit
  const PX_PER_PT = 96 / 72;
  const MM_PER_PT = 25.4 / 72;
  const EDITOR_BODY_PT = ExportCommon.EDITOR_STYLE.bodyPt;
  const EDITOR_HEADING_PT = ExportCommon.EDITOR_STYLE.headingPt;
  const NATURAL_LINE = ExportCommon.EDITOR_STYLE.naturalLine;
  const { EDITOR_TEXT, EDITOR_FONTS: editorFonts } = ExportCommon.Ooxml;
  const SAME_FAMILY = /^(?:calibri|carlito|arial(?! (?:black|narrow|rounded|unicode))|arimo|helvetica|liberation sans|times|tinos|liberation serif|georgia|gelasio|courier|cousine|liberation mono|roboto)/;
  const REPORT_KEYS = [
    'sections', 'columns', 'fonts', 'tabs', 'rightIndent', 'paragraphBorders', 'numbering', 'images', 'floatingImages', 'imageEffects', 'shapes', 'headerFooter', 'comments', 'trackedChanges', 'hidden', 'fields', 'mergeFields', 'toc',
    'endnotes', 'nestedTables', 'borderStyles', 'links', 'tableCells',
  ];
  const PAGE_BREAK = '<div class="page-break-marker"></div>';

  // --- Petits outils sur le XML (js/export-common.js:Odf et Ooxml) -------------------------------------------------------------------------------------------------------------------------------
  const { fail, kids, round2, fixed, escAttr } = ExportCommon.Ooxml;
  const { name, attr, attrs, children, child, toPoints } = ExportCommon.Odf;
  const { itemsHtml, safeHref, trackWrap, mergeFieldHtml: defaultMergeField, pageNumberHtml } = ExportCommon.Markup;
  const count = (ctx, key, n) => { ctx.report.set(key, (ctx.report.get(key) || 0) + (n === undefined ? 1 : n)); };
  const lose = (st, key) => { if (st.losses) st.losses.add(key); };
  const whole = (value, fallback, max) => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, max || MAX_REPEAT) : fallback;
  };

  // --- Les styles : un par famille et par nom, avec les propriétés de chaque groupe -----------------------------------------------------------------------------------------------------
  // Les attributs d'un élément de propriétés (`style:text-properties`...) en objet { 'fo:color': '#c80000', ... } : une valeur par nom qualifié.
  const groupsOf = (el) => {
    const sectionProps = child(el, 'style:section-properties');
    const columns = child(sectionProps, 'style:columns');
    return {
      graphic: attrs(child(el, 'style:graphic-properties')), para: attrs(child(el, 'style:paragraph-properties')), text: attrs(child(el, 'style:text-properties')), cell: attrs(child(el, 'style:table-cell-properties')),
      column: attrs(child(el, 'style:table-column-properties')), row: attrs(child(el, 'style:table-row-properties')), table: attrs(child(el, 'style:table-properties')),
      section: attrs(sectionProps), columnCount: columns ? whole(attr(columns, 'fo:column-count'), 1, 99) : 1,
      tabs: children(child(child(el, 'style:paragraph-properties'), 'style:tab-stops'), 'style:tab-stop').length,
    };
  };
  const LIST_LEVELS = ['text:list-level-style-bullet', 'text:list-level-style-number', 'text:list-level-style-image'];
  function readListStyle(el) {
    const levels = new Map();
    children(el, LIST_LEVELS).forEach((level) => {
      const kind = name(level) === 'text:list-level-style-bullet' ? 'bullet' : (name(level) === 'text:list-level-style-number' ? 'number' : 'image');
      levels.set(whole(attr(level, 'text:level'), 1, 10), {
        kind, char: attr(level, 'text:bullet-char') || '', format: attr(level, 'style:num-format') || '', prefix: attr(level, 'style:num-prefix') || '', suffix: attr(level, 'style:num-suffix') || '',
        start: whole(attr(level, 'text:start-value'), 1, 100000), display: whole(attr(level, 'text:display-levels'), 1, 10),
      });
    });
    return levels;
  }
  function readStyles(odf) {
    const fonts = new Map();
    odf.sections('office:font-face-decls').forEach((holder) => {
      children(holder, 'style:font-face').forEach((face) => {
        const family = String(attr(face, 'svg:font-family') || attr(face, 'style:name') || '').replace(/^['"]|['"]$/g, '').split(',')[0].replace(/^['"]|['"]$/g, '').trim();
        fonts.set(attr(face, 'style:name'), family);
      });
    });
    const styles = new Map();
    const defaults = new Map();
    const lists = new Map();
    const layouts = new Map();
    const masters = [];
    const take = (el) => {
      switch (name(el)) {
        case 'style:style': {
          const family = attr(el, 'style:family');
          const styleName = attr(el, 'style:name');
          if (family && styleName) {
            styles.set(family + ':' + styleName, Object.assign({
              name: styleName, family, parent: attr(el, 'style:parent-style-name'), display: attr(el, 'style:display-name') || styleName, master: attr(el, 'style:master-page-name') || '',
              listStyle: attr(el, 'style:list-style-name'), outline: attr(el, 'style:default-outline-level'),
            }, groupsOf(el)));
          }
          break;
        }
        case 'style:default-style': defaults.set(attr(el, 'style:family'), groupsOf(el)); break;
        case 'text:list-style': lists.set(attr(el, 'style:name'), readListStyle(el)); break;
        case 'style:page-layout': layouts.set(attr(el, 'style:name'), attrs(child(el, 'style:page-layout-properties'))); break;
        default: break;
      }
    };
    ['office:styles', 'office:automatic-styles'].forEach(section => odf.sections(section).forEach(holder => children(holder).forEach(take)));
    odf.sections('office:master-styles').forEach(holder => children(holder, 'style:master-page').forEach(master => masters.push(master)));
    return { fonts, styles, defaults, lists, layouts, masters };
  }
  // Un style et ceux dont il hérite, du plus lointain au plus proche ; un cycle ou un nom inconnu coupe la chaîne.
  function styleChain(ctx, family, styleName) {
    const out = [];
    const seen = new Set();
    let current = styleName;
    while (current && !seen.has(current) && out.length < 32) {
      seen.add(current);
      const style = ctx.styles.styles.get(family + ':' + current);
      if (!style) break;
      out.unshift(style);
      current = style.parent;
    }
    return out;
  }
  // Les propriétés d'un groupe (`para`, `cell`...) d'un style, héritage compris : les valeurs par défaut de la famille, puis chaque style de la chaîne, attribut par attribut.
  function merged(ctx, family, styleName, group) {
    const out = Object.assign({}, (ctx.styles.defaults.get(family) || {})[group]);
    styleChain(ctx, family, styleName).forEach(style => Object.assign(out, style[group]));
    return out;
  }
  // Les propriétés de caractère d'un texte : celles de `parent` (le paragraphe, la série de caractères qui contient celle-ci), puis le style de caractère `styleName` et ceux dont il hérite. La taille de police est
  // rendue en points dans `_size` (un pourcentage se compte sur celle de la couche au-dessous).
  function textProps(ctx, family, styleName, parent) {
    const out = Object.assign({}, parent || (ctx.styles.defaults.get('paragraph') || {}).text);
    if (out._size === undefined) out._size = toPoints(out['fo:font-size'], EDITOR_BODY_PT) || 11;
    styleChain(ctx, family, styleName).forEach((style) => {
      Object.assign(out, style.text);
      if (style.text['fo:font-size']) { const size = toPoints(style.text['fo:font-size'], out._size); if (size) out._size = size; }
    });
    return out;
  }

  // --- Les polices, les couleurs et les séries de caractères --------------------------------------------------------------------------------------------------------------------------------------
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const colorOf = value => (HEX_COLOR.test(String(value || '')) ? String(value).slice(1).toLowerCase() : null);
  // La famille de remplacement la plus proche parmi celles de l'éditeur (Roboto par défaut, Arial, Times New Roman, Georgia, Courier New, Calibri) ; null : celle de l'éditeur.
  // Les polices que LibreOffice met à la place d'Arial, de Times New Roman et de Courier New (mêmes chasses) sont ramenées à elles avant la recherche.
  const METRIC_TWINS = { 'liberation sans': 'arial', 'liberation sans narrow': 'arial', 'liberation serif': 'times new roman', 'liberation mono': 'courier new', caladea: 'cambria', 'dejavu serif': 'georgia', 'dejavu sans mono': 'courier new' };
  const familyOf = (key) => {
    const lower = String(key || '').trim().toLowerCase();
    return lower ? ExportCommon.Ooxml.nearestFamily(METRIC_TWINS[lower] || lower) : null;
  };
  const UNDERLINE_STYLES = { dotted: 'dotted', dash: 'dashed', 'long-dash': 'dashed', 'dot-dash': 'dashed', 'dot-dot-dash': 'dashed', wave: 'wavy' };
  // La police d'une série de caractères (sa famille dans l'éditeur, ou null pour celle de l'éditeur) ; une police que l'éditeur n'a pas exactement est comptée une fois.
  function fontOf(ctx, props) {
    const declared = props['style:font-name'] ? ctx.styles.fonts.get(props['style:font-name']) || props['style:font-name'] : props['fo:font-family'];
    const label = String(declared || '').replace(/^['"]|['"]$/g, '').trim();
    if (!label) return null;
    const lower = label.toLowerCase();
    // Une variante d'une police que l'éditeur a (« Liberation Sans », « Calibri Light », « Times ») prend la sienne sans rien dire ; une autre famille (« Cambria », « Consolas ») est comptée.
    if (!editorFonts.has(lower) && !SAME_FAMILY.test(lower) && !ctx.fontsSeen.has(lower)) { ctx.fontsSeen.add(lower); count(ctx, 'fonts'); }
    return familyOf(label);
  }
  // Ce qu'une série de caractères demande, en marques de l'éditeur : { style (déclarations CSS), b, i, u, uLine, s, sup, sub, caps, hidden }.
  function runLook(ctx, props, baseSize, linked) {
    const weight = props['fo:font-weight'];
    const italic = props['fo:font-style'];
    const underline = props['style:text-underline-style'];
    const strike = props['style:text-line-through-style'] || props['style:text-line-through-type'];
    const look = {
      style: [], b: weight === 'bold' || Number(weight) >= 600, i: italic === 'italic' || italic === 'oblique', u: false, uLine: '',
      s: !!strike && strike !== 'none', sup: false, sub: false, caps: props['fo:text-transform'] === 'uppercase', hidden: props['text:display'] === 'none',
    };
    const size = props._size;
    if (Number.isFinite(size) && size > 0 && Math.abs(size - baseSize) > 0.04) look.style.push('font-size: ' + fixed(Math.max(1, size)) + 'pt');
    const family = fontOf(ctx, props);
    if (family) look.style.push('font-family: ' + family);
    const color = colorOf(props['fo:color']);
    if (!linked && color && color !== '000000' && color !== EDITOR_TEXT) look.style.push('color: #' + color);
    const back = colorOf(props['fo:background-color']);
    if (back && back !== 'ffffff') look.style.push('background-color: #' + back);
    const spacing = toPoints(props['fo:letter-spacing']);
    const character = CharacterFormat.declarations({ letterSpacing: spacing || 0, smallCaps: props['fo:font-variant'] === 'small-caps' });
    if (character) look.style.push(character);
    if (underline && underline !== 'none' && !linked) {
      look.u = true;
      look.uLine = props['style:text-underline-type'] === 'double' ? 'double' : (UNDERLINE_STYLES[underline] || '');
    }
    // « Position » : « super 58% », « sub 58% » ou « 33% 58% » (monté ou descendu de 33 %, la taille réduite qui l'accompagne est celle de l'éditeur).
    const position = /^\s*(super|sub|-?\d+(?:\.\d+)?%)/.exec(props['style:text-position'] || '');
    if (position) {
      const raised = position[1] === 'super' || (/%$/.test(position[1]) && parseFloat(position[1]) > 0);
      const lowered = position[1] === 'sub' || (/%$/.test(position[1]) && parseFloat(position[1]) < 0);
      look.sup = raised;
      look.sub = lowered && !raised;
      if (look.sup || look.sub) look.style = look.style.filter(rule => !/^font-size:/.test(rule));
    }
    return look;
  }
  const lookKey = (look, link, track, comments) => [look.style.join(';'), look.b, look.i, look.u, look.uLine, look.s, look.sup, look.sub, look.caps, link || '', track ? track.kind + track.id : '', comments ? comments.map(c => c.id).join(',') : ''].join('|');

  // --- Le texte d'un paragraphe ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // L'état d'un paragraphe en cours de lecture : `props` (propriétés de caractère du paragraphe), `baseSize` (la taille que l'éditeur donne à ce paragraphe sans réglage), `items`, `link`.
  const newState = (ctx, props, baseSize, depth) => ({ ctx, props, baseSize, items: [], link: '', losses: new Set(), depth, collapsible: true, last: null, deleted: null });
  // Le texte d'un nœud, comme OpenDocument le lit : les blancs qui se suivent (espaces, tabulations, retours à la ligne du fichier) n'en font qu'un, et le premier blanc d'un paragraphe ne compte pas.
  function pushText(st, raw, props, collapse) {
    let text = collapse ? raw.replace(/[ \t\r\n]+/g, ' ') : raw;
    if (collapse && st.collapsible) text = text.replace(/^ /, '');
    if (!text) return;
    const look = runLook(st.ctx, props, st.baseSize, !!st.link);
    if (look.hidden) { lose(st, 'hidden'); return; }
    const track = currentTrack(st);
    const comments = openComments(st.ctx, null);
    let rest = text;
    // Un commentaire posé en un point (sans passage choisi) se range sur le mot qui suit.
    if (st.ctx.pointThreads.length) {
      const head = (/^\s*\S+/.exec(text) || [text])[0];
      st.items.push(entryOf(head, look, st.link, track, openComments(st.ctx, st.ctx.pointThreads.splice(0))));
      rest = text.slice(head.length);
    }
    if (rest) st.items.push(entryOf(rest, look, st.link, track, comments));
    st.last = collapse ? st.items[st.items.length - 1] : null;
    st.collapsible = collapse ? / $/.test(text) : false;
  }
  // Une série de caractères : le texte, son aspect, son lien, sa modification suivie et ses fils de commentaire (ce qui fait que deux séries voisines se fondent ou non en une).
  const entryOf = (text, look, link, track, comments) => ({ text, look, key: lookKey(look, link, track, comments), link, caps: look.caps, track, comments });
  // Un élément qui reste seul (image, note, numéro de page) ; dans une insertion suivie, une image est suivie comme elle.
  const pushRaw = (st, html) => { const track = currentTrack(st); st.items.push({ raw: track && /^<img\b/.test(html) ? trackWrap(html, track) : html }); };
  // Les marques sans texte (signets, repères d'index, sauts de page « doux » que l'application calcule), le numéro qu'un titre numéroté recopie (`text:number`) et le texte d'un rubi.
  const SKIPPED = new Set([
    'text:bookmark', 'text:bookmark-start', 'text:bookmark-end', 'text:soft-page-break', 'text:reference-mark', 'text:reference-mark-start', 'text:reference-mark-end', 'text:index-mark', 'text:index-mark-start',
    'text:index-mark-end', 'text:alphabetical-index-mark', 'text:alphabetical-index-mark-start', 'text:alphabetical-index-mark-end', 'text:toc-mark', 'text:toc-mark-start', 'text:toc-mark-end', 'text:number',
    'text:ruby-text', 'text:title', 'text:subject-placeholder-never',
  ]);
  function readInline(st, parent, props) {
    for (let node = parent.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3 || node.nodeType === 4) { pushText(st, node.nodeValue, props, true); continue; }
      if (node.nodeType !== 1) continue;
      const tag = name(node);
      if (SKIPPED.has(tag)) continue;
      switch (tag) {
        case 'text:s': {
          pushText(st, ' '.repeat(whole(attr(node, 'text:c'), 1, 1000)), props, false);
          break;
        }
        case 'text:tab': pushText(st, '\t', props, false); break;
        case 'text:line-break': pushText(st, '\n', props, false); st.collapsible = true; break;
        case 'text:span': readInline(st, node, textProps(st.ctx, 'text', attr(node, 'text:style-name'), props)); break;
        case 'text:a': {
          const target = attr(node, 'xlink:href');
          const href = safeHref(target);
          if (target && !href) count(st.ctx, 'links');
          const outer = st.link;
          st.link = href;
          readInline(st, node, props);
          st.link = outer;
          break;
        }
        case 'text:note': { const marker = noteMarker(st.ctx, node); if (marker) st.items.push({ raw: marker }); break; }
        case 'office:annotation': annotationStart(st, node); break;
        case 'office:annotation-end': annotationEnd(st, node); break;
        case 'text:change-start': changeStart(st, node, props); break;
        case 'text:change-end': changeEnd(st, node); break;
        case 'text:change': pointChange(st, node, props); break;
        case 'draw:frame': { const html = frameHtml(st.ctx, node); if (html) pushRaw(st, html); break; }
        case 'text:page-number':
          // Le numéro de la page où l'on est : celui de l'éditeur ; « la page d'avant » ou « d'après » garde sa dernière valeur.
          if (!attr(node, 'text:select-page') || attr(node, 'text:select-page') === 'current') { pushRaw(st, pageNumberHtml()); break; }
          count(st.ctx, 'fields');
          readInline(st, node, props);
          break;
        case 'text:database-display': {
          // Un champ de fusion devient la variable de la colonne du même nom (quand la table en a une) ; sinon il garde son texte et le compte rendu le dit.
          const html = attr(node, 'text:column-name') ? st.ctx.mergeField(String(attr(node, 'text:column-name')).trim()) : '';
          if (html) { pushRaw(st, html); break; }
          count(st.ctx, 'mergeFields');
          readInline(st, node, props);
          break;
        }
        case 'draw:image': count(st.ctx, 'images'); break;
        case 'text:ruby': readInline(st, child(node, 'text:ruby-base') || node, props); break;
        default:
          if (/^draw:/.test(tag)) { count(st.ctx, 'shapes'); break; }
          // Les champs (date, numéro de page, nombre de pages, auteur, champ de fusion...) : leur dernière valeur reste dans le texte.
          if (/^text:(?:date|time|page-number|page-count|author|sender|initial-creator|creator|file-name|database|user-field|variable|sequence|modification|print|editing|chapter|word-count|paragraph-count|character-count|expression|conditional|hidden|placeholder|bibliography-mark|page-variable|reference)/.test(tag) || /^text:.*-get$/.test(tag)) count(st.ctx, 'fields');
          readInline(st, node, props);
          break;
      }
    }
  }
  // --- Modifications suivies et commentaires -------------------------------------------------------------------------------------------------------------------------------------------------
  const MAX_REVISIONS = 5000;
  const MAX_THREADS = 1000;
  const textOf = el => (el ? el.textContent.trim() : '');
  const isoOf = (text) => { const time = Date.parse(String(text || '').trim()); return Number.isFinite(time) ? new Date(time).toISOString() : null; };
  // Le texte brut d'un élément, comme la personne le lit : les blancs qui se suivent n'en font qu'un, `text:s`, les tabulations et les retours à la ligne sont ceux du fichier.
  function plainText(el) {
    let out = '';
    const walk = (node) => {
      for (let part = node.firstChild; part; part = part.nextSibling) {
        if (part.nodeType === 3 || part.nodeType === 4) { out += part.nodeValue.replace(/[ \t\r\n]+/g, ' '); continue; }
        if (part.nodeType !== 1) continue;
        const tag = name(part);
        if (tag === 'text:s') out += ' '.repeat(whole(attr(part, 'text:c'), 1, 1000));
        else if (tag === 'text:tab') out += '\t';
        else if (tag === 'text:line-break') out += '\n';
        else if (tag !== 'text:note-citation' && tag !== 'text:number') walk(part);
      }
    };
    walk(el);
    return out;
  }
  // Les modifications suivies du fichier (`text:changed-region`) : une insertion (`text:insertion`, le texte inséré est dans le corps, entre `text:change-start` et `text:change-end`), une suppression (le texte supprimé est
  // rangé DANS la région, un `text:change` en marque la place) ou un changement de mise en forme (que l'éditeur ne suit pas : accepté et compté). Une insertion ou une suppression reste une modification EN ATTENTE de
  // l'éditeur (js/track-changes.js : `<ins data-id>` / `<del data-id>`), avec son auteur et sa date dans les métadonnées du suivi.
  function readChanges(ctx, odf) {
    descendants(odf.body, 'changed-region').forEach((region) => {
      if (name(region) !== 'text:changed-region') return;
      const id = attr(region, 'text:id') || attr(region, 'xml:id');
      const body = child(region, ['text:insertion', 'text:deletion', 'text:format-change']);
      if (!id || !body) return;
      const info = child(body, 'office:change-info');
      const kind = name(body) === 'text:insertion' ? 'ins' : (name(body) === 'text:deletion' ? 'del' : 'format');
      ctx.changes.set(id, { id, kind, el: body, author: textOf(child(info, 'dc:creator')), date: isoOf(textOf(child(info, 'dc:date'))) });
    });
  }
  // Le numéro que l'éditeur donne à la modification de ce fichier ({ kind, id }) ; une même région n'est qu'une modification. Au-delà du plafond, la modification est acceptée et comptée.
  function trackOf(ctx, regionId, kind) {
    const key = kind + ':' + regionId;
    let id = ctx.revisions.get(key);
    if (!id) {
      if (ctx.revisions.size >= MAX_REVISIONS) { lostChange(ctx, regionId); return null; }
      id = ctx.revisions.size + 1;
      ctx.revisions.set(key, id);
      const region = ctx.changes.get(regionId) || {};
      const meta = { author: null };
      if (region.author) meta.authorName = region.author.slice(0, 120);
      meta.createdAt = region.date || null;
      ctx.suivi[id] = meta;
    }
    return { kind, id };
  }
  function lostChange(ctx, regionId) {
    if (ctx.countedChanges.has(regionId)) return;
    ctx.countedChanges.add(regionId);
    count(ctx, 'trackedChanges');
  }
  // La modification qui s'applique au texte d'ici : le texte supprimé que l'on relit, ou la dernière insertion ouverte.
  function currentTrack(st) {
    if (st.deleted) return st.deleted;
    const open = st.ctx.openInserts;
    return open.length ? trackOf(st.ctx, open[open.length - 1], 'ins') : null;
  }
  function changeStart(st, node, props) {
    const id = attr(node, 'text:change-id');
    const region = st.ctx.changes.get(id);
    if (!region) return;
    if (region.kind === 'ins') st.ctx.openInserts.push(id);
    else if (region.kind === 'del') deletedText(st, region, props);
    else lostChange(st.ctx, id);
  }
  function changeEnd(st, node) {
    const open = st.ctx.openInserts;
    const index = open.lastIndexOf(attr(node, 'text:change-id'));
    if (index >= 0) open.splice(index, 1);
  }
  function pointChange(st, node, props) {
    const id = attr(node, 'text:change-id');
    const region = st.ctx.changes.get(id);
    if (!region) return;
    if (region.kind === 'del') deletedText(st, region, props);
    else if (region.kind === 'format') lostChange(st.ctx, id);
  }
  // Le texte qu'une suppression suivie a rangé dans sa région, remis ici, barré en attente : ses paragraphes se suivent d'un retour à la ligne. Une suppression sans texte (un simple saut de paragraphe) est comptée.
  function deletedText(st, region, props) {
    const ctx = st.ctx;
    const paragraphs = descendants(region.el, 'p').concat(descendants(region.el, 'h')).filter(part => name(part) === 'text:p' || name(part) === 'text:h');
    paragraphs.sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
    if (!paragraphs.some(part => part.textContent.trim())) { lostChange(ctx, region.id); return; }
    const track = trackOf(ctx, region.id, 'del');
    if (!track) return;
    const outer = st.deleted;
    st.deleted = track;
    paragraphs.forEach((part, index) => {
      if (index) pushText(st, '\n', props, false);
      st.collapsible = false;
      readInline(st, part, props);
    });
    st.deleted = outer;
  }
  // Les commentaires du fichier (`office:annotation`) et leurs réponses (`loext:parent-name`) : un FIL de l'éditeur (js/comments.js) - la marque `comment-mark` sur le passage, les messages (auteur, texte, date) rangés pour
  // la table des fils quand le document aura un numéro. Le passage s'étend jusqu'à `office:annotation-end` du même nom ; un commentaire posé en un point se range sur le mot qui suit (ou le dernier du paragraphe).
  function readComments(ctx, odf) {
    const annotations = descendants(odf.body, 'annotation').filter(el => name(el) === 'office:annotation');
    descendants(odf.body, 'annotation-end').forEach((el) => { if (name(el) === 'office:annotation-end' && attr(el, 'office:name')) ctx.endNames.add(attr(el, 'office:name')); });
    const stamp = Date.now().toString(36);
    const threadOf = new Map();
    const replies = [];
    annotations.forEach((el) => {
      const texte = descendants(el, 'p').filter(part => name(part) === 'text:p').map(plainText).join('\n').replace(/^\s+|\s+$/g, '');
      if (!texte) return;
      const entry = { el, own: attr(el, 'office:name'), parent: attr(el, 'loext:parent-name'), message: { auteur: textOf(child(el, 'dc:creator')), texte, creeLe: isoOf(textOf(child(el, 'dc:date'))) || new Date().toISOString() } };
      if (entry.parent) { replies.push(entry); return; }
      if (ctx.threads.length >= MAX_THREADS) { count(ctx, 'comments'); return; }
      const thread = { id: 'cm-' + stamp + 'o' + (ctx.threads.length + 1), resolved: attr(el, 'loext:resolved') === 'true', messages: [entry.message], anchored: false };
      ctx.threads.push(thread);
      ctx.threadOf.set(el, thread);
      if (entry.own) threadOf.set(entry.own, thread);
    });
    replies.forEach((entry) => {
      const thread = threadOf.get(entry.parent);
      if (!thread) { count(ctx, 'comments'); return; }
      thread.messages.push(entry.message);
      if (entry.own) threadOf.set(entry.own, thread);
    });
    ctx.threads.forEach(thread => thread.messages.sort((a, b) => String(a.creeLe).localeCompare(String(b.creeLe))));
    ctx.annotations = new Set(annotations);
  }
  function annotationStart(st, node) {
    const ctx = st.ctx;
    // Un commentaire d'un endroit que la lecture n'a pas fait (en-tête, pied de page) n'a pas de fil : compté.
    if (!ctx.annotations.has(node)) { count(ctx, 'comments'); return; }
    const thread = ctx.threadOf.get(node);
    if (!thread) return;
    const own = attr(node, 'office:name');
    if (own && ctx.endNames.has(own)) ctx.openThreads.set(own, thread);
    else ctx.pointThreads.push(thread);
  }
  function annotationEnd(st, node) {
    st.ctx.openThreads.delete(attr(node, 'office:name'));
  }
  // Les fils dont le passage est ouvert à cet endroit (et ceux de `extra`) : [{ id, resolved }] dans l'ordre des numéros, ou null ; le fil dont un passage est marqué est « accroché ».
  function openComments(ctx, extra) {
    const seen = new Map();
    ctx.openThreads.forEach((thread) => { seen.set(thread.id, thread); });
    (extra || []).forEach((thread) => { seen.set(thread.id, thread); });
    if (!seen.size) return null;
    seen.forEach((thread) => { thread.anchored = true; });
    return Array.from(seen.values()).sort((a, b) => (a.id < b.id ? -1 : 1)).map(thread => ({ id: thread.id, resolved: thread.resolved }));
  }
  // Un commentaire posé en un point, quand plus aucun texte ne suit dans le paragraphe : il se range sur le dernier mot de ce paragraphe.
  function anchorStrays(st) {
    const ctx = st.ctx;
    if (!ctx.pointThreads.length) return;
    let index = st.items.length - 1;
    while (index >= 0 && st.items[index].raw !== undefined) index -= 1;
    if (index < 0) { ctx.pointThreads.length = 0; return; }
    const entry = st.items[index];
    const marks = openComments(ctx, ctx.pointThreads.splice(0));
    const found = /\S+\s*$/.exec(entry.text);
    const cut = found && found.index > 0 ? found.index : 0;
    const tail = entryOf(entry.text.slice(cut), entry.look, entry.link, entry.track, (entry.comments || []).concat(marks).sort((a, b) => (a.id < b.id ? -1 : 1)));
    if (cut) st.items.splice(index, 1, entryOf(entry.text.slice(0, cut), entry.look, entry.link, entry.track, entry.comments), tail);
    else st.items[index] = tail;
    if (st.last === entry) st.last = tail;
  }

  // --- Les images et les notes ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const IMAGE_SNIFF = [['iVBOR', 'image/png'], ['/9j/', 'image/jpeg'], ['R0lGOD', 'image/gif'], ['UklGR', 'image/webp'], ['Qk', 'image/bmp'], ['PHN2Zy', 'image/svg+xml'], ['PD94bW', 'image/svg+xml']];
  // Les images du document, lues une fois pour toutes en adresses de données, avec les plafonds de poids de l'import Word : `draw:image` -> { src } ou { unsupported: true } (format illisible,
  // trop lourde, adresse hors du fichier : jamais allée chercher sur le réseau). Un fichier « flat » les porte en base 64 dans `office:binary-data`.
  async function loadImages(ctx, odf) {
    const images = new Map();
    const imageTypes = ExportCommon.Ooxml.IMAGE_TYPES;
    // Les images du corps, et celles des en-têtes et pieds de page (rangés dans les pages maîtresses).
    const nodes = [odf.body].concat(odf.sections('office:master-styles')).reduce((all, holder) => all.concat(ExportCommon.Odf.descendants(holder, 'image').filter(node => name(node) === 'draw:image')), []);
    for (const node of nodes) {
      const href = String(attr(node, 'xlink:href') || '').replace(/^\.\//, '');
      const binary = child(node, 'office:binary-data');
      let mime = '';
      let b64 = '';
      try {
        if (binary) {
          b64 = binary.textContent.replace(/\s+/g, '');
          const sniffed = IMAGE_SNIFF.find(([prefix]) => b64.indexOf(prefix) === 0);
          mime = sniffed ? sniffed[1] : '';
        } else if (href && !/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^\.\.|^\//.test(href)) {
          mime = imageTypes[href.split('.').pop().toLowerCase()] || '';
          const file = mime ? odf.fileOf(href) : null;
          b64 = file ? await file.async('base64') : '';
        }
      } catch (e) {
        b64 = '';
      }
      const bytes = b64.length * 0.75;
      if (!mime || !b64 || bytes > MAX_IMAGE_BYTES || ctx.imageBytes + bytes > MAX_IMAGES_BYTES) { images.set(node, { unsupported: true }); continue; }
      ctx.imageBytes += bytes;
      images.set(node, { src: 'data:' + mime + ';base64,' + b64 });
    }
    return images;
  }
  const FRAME_OBJECTS = ['draw:text-box', 'draw:object', 'draw:object-ole', 'draw:plugin', 'draw:floating-frame', 'draw:applet', 'draw:g', 'draw:custom-shape'];
  // Ce que le style d'une image demande et que l'éditeur n'a pas : rognée (`fo:clip`), retournée (`style:mirror`), tournée (`draw:transform`).
  function imageEffects(ctx, frame) {
    const graphic = Object.assign({}, ((ctx.styles.styles.get('graphic:' + attr(frame, 'draw:style-name')) || {}).graphic));
    const clip = /rect\(\s*(-?[\d.]+)\w*\s*,?\s*(-?[\d.]+)\w*\s*,?\s*(-?[\d.]+)\w*\s*,?\s*(-?[\d.]+)/.exec(graphic['fo:clip'] || '');
    const clipped = !!clip && clip.slice(1, 5).some(value => Math.abs(parseFloat(value)) > 0.001);
    const mirrored = !!graphic['style:mirror'] && graphic['style:mirror'] !== 'none';
    const turned = /rotate/.test(attr(frame, 'draw:transform') || '');
    return clipped || mirrored || turned;
  }
  // Un cadre (`draw:frame`) en balisage : l'image (en ligne, ou « flottante » posée dans le texte et comptée) ; une zone de texte, un objet incorporé ou un graphique n'est pas repris (compté), une image
  // illisible ou trop lourde non plus. Une image rognée, retournée ou tournée est reprise entière et droite (comptée).
  function frameHtml(ctx, frame) {
    if (FRAME_OBJECTS.some(tag => child(frame, tag))) { count(ctx, 'shapes'); return ''; }
    const node = child(frame, 'draw:image');
    if (!node) { count(ctx, 'shapes'); return ''; }
    const image = ctx.images.get(node);
    if (!image || image.unsupported) { count(ctx, 'images'); return ''; }
    if (attr(frame, 'text:anchor-type') && attr(frame, 'text:anchor-type') !== 'as-char') count(ctx, 'floatingImages');
    if (imageEffects(ctx, frame)) count(ctx, 'imageEffects');
    const width = toPoints(attr(frame, 'svg:width'));
    const px = width > 0 ? Math.min(width, ctx.contentWidthPt) * PX_PER_PT : 0;
    const alt = String(((child(frame, 'svg:desc') || child(frame, 'svg:title') || {}).textContent) || '').trim();
    return '<img class="editor-image" src="' + image.src + '" alt="' + escAttr(alt) + '"' + (px > 0 ? ' style="width: ' + fixed(px) + 'px"' : '') + '>';
  }
  // Le texte brut d'une note (l'éditeur la garde en texte, sur une ligne) : ses paragraphes, sans le numéro de la note.
  function plainNote(note) {
    const body = child(note, 'text:note-body');
    const parts = [];
    kids(body).forEach((part) => {
      const text = plainText(part).replace(/\s+/g, ' ').trim();
      if (text) parts.push(text);
    });
    return parts.join(' ');
  }
  // Une note de bas de page devient le repère de note de l'éditeur (`sup.footnote-ref-marker`, son texte dans `data-note-text`) ; une note de fin aussi, et le compte rendu le dit.
  function noteMarker(ctx, note) {
    const text = plainNote(note);
    if (!text) return '';
    if (attr(note, 'text:note-class') === 'endnote') count(ctx, 'endnotes');
    ctx.noteCounter += 1;
    return '<sup class="footnote-ref-marker" data-note-id="fn-' + Date.now().toString(36) + 'o' + ctx.noteCounter + '" data-note-text="' + escAttr(text) + '"></sup>';
  }

  // --- Les paragraphes -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const rtlOf = para => /^rl/.test(para['style:writing-mode'] || '');
  // Le niveau de titre (1 à 6) : `text:outline-level` (de 1 à 10 dans le fichier).
  const headingLevel = el => Math.min(6, whole(attr(el, 'text:outline-level'), 1, 10));
  const isQuote = chain => chain.some(style => /^(?:quotations?|quote|citation)$/i.test(style.display));
  // Un paragraphe de la table des matières (styles « Contents 1 »...) : l'éditeur refait son sommaire lui-même à partir des titres.
  function alignOf(para, rtl) {
    const value = para['fo:text-align'];
    if (!value) return undefined;
    if (value === 'center') return 'center';
    if (value === 'justify' || value === 'justified') return 'justify';
    if (value === 'end') return rtl ? 'left' : 'right';
    if (value === 'right') return rtl ? undefined : 'right';
    if (value === 'left') return rtl ? 'left' : undefined;
    return undefined;
  }
  // Une marge ou un retrait en points, `fo:margin` (les quatre côtés) donnant ce que le côté n'a pas.
  const sideOf = (para, side) => {
    const value = para['fo:margin-' + side] !== undefined ? para['fo:margin-' + side] : para['fo:margin'];
    return toPoints(String(value === undefined ? '' : value).trim().split(/\s+/)[0], 0);
  };
  // Les réglages de « Paragraphe… » (js/paragraph-format.js) : interligne (multiple de la ligne simple, ou hauteur fixée en points ramenée à la taille du texte), espaces avant et après, retraits.
  function formatOf(para, sizePt, inList, st) {
    const out = {};
    const before = sideOf(para, 'top');
    const after = sideOf(para, 'bottom');
    if (before !== null) out.spaceBefore = before;
    if (after !== null) out.spaceAfter = after;
    const line = para['fo:line-height'];
    if (line && line !== 'normal') {
      if (/%$/.test(line)) { const ratio = parseFloat(line) / 100; if (Number.isFinite(ratio) && ratio > 0) out.lineHeight = ratio * NATURAL_LINE; }
      else { const fixedHeight = toPoints(line); if (fixedHeight && fixedHeight > 0) out.lineHeight = fixedHeight / Math.max(1, sizePt); }
    }
    if (!inList) {
      const left = sideOf(para, 'left');
      const first = toPoints(para['fo:text-indent'], 0);
      if (left !== null && left > 0) out.indentLeft = left;
      if (first !== null && first !== 0) out.indentFirst = first;
    }
    const right = sideOf(para, 'right');
    if (right !== null && right > 0) lose(st, 'rightIndent');
    return out;
  }
  const BORDER = /^(?!\s*(?:none|hidden)\b)\s*\S+\s+\S+/;
  function hasBorders(para) {
    const sides = ['fo:border', 'fo:border-top', 'fo:border-bottom', 'fo:border-left', 'fo:border-right'];
    const lines = sides.some(side => para[side] && BORDER.test(para[side]) && parseFloat(para[side]) !== 0);
    const fill = para['fo:background-color'] && para['fo:background-color'] !== 'transparent';
    return !!(lines || fill);
  }
  // Les blocs d'un paragraphe (un ou plusieurs : un saut de page avant ou après le coupe), chacun en balisage.
  function paragraphHtml(ctx, el, inList) {
    const isHeading = name(el) === 'text:h';
    const styleName = attr(el, 'text:style-name');
    const chain = styleChain(ctx, 'paragraph', styleName);
    const para = merged(ctx, 'paragraph', styleName, 'para');
    const textBase = textProps(ctx, 'paragraph', styleName, null);
    const level = isHeading ? headingLevel(el) : 0;
    const baseSize = level ? EDITOR_HEADING_PT['H' + level] : EDITOR_BODY_PT;
    const st = newState(ctx, textBase, baseSize, 0);
    readInline(st, el, textBase);
    anchorStrays(st);
    // Le dernier blanc d'un paragraphe ne compte pas.
    if (st.last && / $/.test(st.last.text)) { st.last.text = st.last.text.slice(0, -1); if (!st.last.text) st.items.splice(st.items.lastIndexOf(st.last), 1); }
    const sizePt = Number.isFinite(textBase._size) ? textBase._size : EDITOR_BODY_PT;
    const format = formatOf(para, sizePt, inList, st);
    // Les tabulations ne comptent que dans un paragraphe qui en contient une : un style qui en déclare sans qu'on s'en serve ne change rien à ce qu'on voit.
    const hasTab = st.items.some(item => item.text && item.text.indexOf('\t') >= 0);
    const tabStop = toPoints((ctx.styles.defaults.get('paragraph') || {}).para && ctx.styles.defaults.get('paragraph').para['style:tab-stop-distance']);
    if (hasTab && tabStop && tabStop > 0) format.tabSize = round2(tabStop);
    if (hasTab) { const own = chain.some(style => style.tabs > 0); if (own) lose(st, 'tabs'); }
    if (hasBorders(para)) lose(st, 'paragraphBorders');
    const rtl = rtlOf(para);
    const align = alignOf(para, rtl);
    const direction = TextDirection.markup(rtl);
    const keep = para['fo:keep-with-next'] === 'always' && !level ? ' data-keep-next="true"' : '';
    const html = itemsHtml(st.items);
    const empty = !html;
    let block;
    if (level) {
      block = '<h' + level + direction + (align ? ' style="text-align: ' + align + '"' : '') + '>' + html + '</h' + level + '>';
    } else {
      const filler = empty && sizePt >= 12 && !inList ? '<span style="font-size: ' + fixed(sizePt) + 'pt"> </span>' : '';
      block = '<p' + direction + ParagraphFormat.markup(format, align, rtl) + keep + '>' + html + filler + '</p>';
    }
    if (!level && isQuote(chain) && !inList) block = '<blockquote>' + block + '</blockquote>';
    st.losses.forEach(key => count(ctx, key));
    const out = [];
    if (pageBreakBefore(ctx, para, chain)) out.push(PAGE_BREAK);
    out.push(block);
    if (para['fo:break-after'] === 'page') out.push(PAGE_BREAK);
    return { html: out.join(''), rtl };
  }
  // La page maîtresse que demande un style (le plus proche de la chaîne qui en nomme une) : le paragraphe ou le tableau qui la porte commence une page.
  function masterOf(chain) {
    for (let i = chain.length - 1; i >= 0; i--) if (chain[i].master) return chain[i].master;
    return '';
  }
  // Un saut de page avant le paragraphe (ou le tableau) : demandé, ou son style change de page (`style:master-page-name`, la page maîtresse est notée pour le compte rendu) ; jamais au tout début du document, qui n'ouvre
  // pas de page vide.
  function pageBreakBefore(ctx, props, chain) {
    const master = masterOf(chain);
    if (master) ctx.usedMasters.add(master);
    return !!ctx.started && (props['fo:break-before'] === 'page' || !!master);
  }

  // --- Les listes ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const BULLET_PUA = { B7: '•', '6C': '•', '9F': '•', '6F': 'o', A7: '▪', '6E': '■', A8: '◆', FC: '✓', FB: '✗' };
  // Le signe d'une puce : un caractère de la zone privée (Symbol, Wingdings) devient son équivalent, le reste se range dans « rond », « rond creux », « carré » ou un signe choisi.
  function bulletOf(level) {
    const raw = Array.from(level.char || '')[0] || '';
    const code = raw ? raw.codePointAt(0) : 0;
    const sign = code >= 0xF000 && code <= 0xF0FF ? (BULLET_PUA[(code & 0xFF).toString(16).toUpperCase()] || '•') : raw;
    if (!sign || /^[•●·∙]$/.test(sign)) return { style: 'disc', char: '' };
    if (/^[o○◦]$/.test(sign)) return { style: 'circle', char: '' };
    if (/^[▪■◾◼§▫□◻]$/.test(sign)) return { style: 'square', char: '' };
    return { style: 'disc', char: BulletFormat.normalized(sign) || '' };
  }
  const NUMBER_STYLES = { 1: 'decimal', a: 'alpha', i: 'roman' };
  // La numérotation d'un niveau : { tag: 'ol', style, start } ; ce que l'éditeur ne sait pas écrire (majuscules, « 1.1 », texte autour du numéro) est compté une fois par liste et par niveau.
  function numberingOf(ctx, level, key) {
    const format = level.format;
    const style = NUMBER_STYLES[String(format).toLowerCase()] || 'decimal';
    const simple = (!level.prefix && (!level.suffix || /^[.)]$/.test(level.suffix))) || (level.prefix === '(' && level.suffix === ')');
    const exact = (format === '1' || format === 'a' || format === 'i') && simple && level.display <= 1;
    if (!exact && !ctx.fontsSeen.has('num:' + key)) { ctx.fontsSeen.add('num:' + key); count(ctx, 'numbering'); }
    return style;
  }
  // La liste dont le style de liste est donné par la liste elle-même, ou à défaut par le style de son premier paragraphe.
  function listStyleOf(ctx, listEl, inherited) {
    const own = attr(listEl, 'text:style-name');
    if (own) return own;
    if (inherited) return inherited;
    const first = child(child(listEl, ['text:list-item', 'text:list-header']), ['text:p', 'text:h']);
    const chain = first ? styleChain(ctx, 'paragraph', attr(first, 'text:style-name')) : [];
    for (let i = chain.length - 1; i >= 0; i--) if (chain[i].listStyle) return chain[i].listStyle;
    return '';
  }
  function counterOf(ctx, listStyle) {
    if (!ctx.counters.has(listStyle)) ctx.counters.set(listStyle, []);
    return ctx.counters.get(listStyle);
  }
  function listHtml(ctx, listEl, level, inherited, depth) {
    const styleName = listStyleOf(ctx, listEl, inherited);
    const levels = ctx.styles.lists.get(styleName) || new Map();
    const info = levels.get(level) || levels.get(1) || { kind: 'bullet', char: '', format: '', prefix: '', suffix: '', start: 1, display: 1 };
    const counters = counterOf(ctx, styleName || '#default');
    const items = children(listEl, ['text:list-item', 'text:list-header']);
    const continues = attr(listEl, 'text:continue-numbering') === 'true' || !!attr(listEl, 'text:continue-list');
    const numbered = info.kind === 'number';
    if (!continues || counters[level] === undefined) counters[level] = info.start - 1;
    const firstItem = items.find(item => name(item) === 'text:list-item');
    const startValue = firstItem ? whole(attr(firstItem, 'text:start-value'), 0, 1000000) : 0;
    const start = startValue || counters[level] + 1;
    let open;
    let rtl = false;
    let body = '';
    items.forEach((item) => {
      const header = name(item) === 'text:list-header';
      const value = whole(attr(item, 'text:start-value'), 0, 1000000);
      if (!header) {
        if (value) counters[level] = value - 1;
        counters[level] += 1;
        counters.length = level + 1;
      }
      let content = '';
      kids(item).forEach((part) => {
        const tag = name(part);
        if (tag === 'text:p' || tag === 'text:h') {
          const made = paragraphHtml(ctx, part, true);
          if (!content) rtl = rtl || made.rtl;
          content += made.html;
        } else if (tag === 'text:list') {
          content += listHtml(ctx, part, level + 1, styleName, depth + 1);
        } else {
          content += blocksOf(ctx, part, depth + 1);
        }
      });
      body += '<li>' + (content || '<p></p>') + '</li>';
    });
    const way = TextDirection.markup(rtl);
    if (numbered) {
      const style = numberingOf(ctx, info, styleName + ':' + level);
      open = '<ol' + way + (style !== 'decimal' ? ' data-number-style="' + style + '"' : '') + (start > 1 ? ' start="' + start + '"' : '') + '>';
      return open + body + '</ol>';
    }
    if (info.kind === 'image' && !ctx.fontsSeen.has('num:' + styleName + ':' + level)) { ctx.fontsSeen.add('num:' + styleName + ':' + level); count(ctx, 'numbering'); }
    const bullet = bulletOf(info);
    open = '<ul' + way + (bullet.style !== 'disc' ? ' data-bullet-style="' + bullet.style + '"' : '') + BulletFormat.markup(bullet.char) + '>';
    return open + body + '</ul>';
  }

  // --- Les blocs : paragraphes, listes, tableaux, sections ---------------------------------------------------------------------------------------------------------------------------------------------
  const INDEXES = ['text:table-of-content', 'text:illustration-index', 'text:alphabetical-index', 'text:user-index', 'text:table-index', 'text:object-index', 'text:bibliography'];
  // Les blocs d'un conteneur (le corps, une case de tableau, une section), en balisage.
  function blocksOf(ctx, container, depth) {
    let out = '';
    if (!container || depth > MAX_DEPTH) return out;
    kids(container).forEach((part) => {
      const tag = name(part);
      switch (tag) {
        case 'text:p': case 'text:h': {
          out += paragraphHtml(ctx, part, false).html;
          ctx.started = true;
          break;
        }
        case 'text:list': out += listHtml(ctx, part, 1, '', depth); ctx.started = true; break;
        case 'table:table':
          if (depth > 0) { count(ctx, 'nestedTables'); out += flattenTable(ctx, part, depth); } else out += tableHtml(ctx, part, depth);
          ctx.started = true;
          break;
        case 'text:section': {
          const sectionStyle = ctx.styles.styles.get('section:' + attr(part, 'text:style-name'));
          if (attr(part, 'text:display') === 'none') { count(ctx, 'hidden'); break; }
          if (sectionStyle && sectionStyle.columnCount > 1) count(ctx, 'columns');
          out += blocksOf(ctx, part, depth + 1);
          break;
        }
        case 'text:numbered-paragraph': out += blocksOf(ctx, part, depth + 1); break;
        case 'text:tracked-changes': break;
        case 'draw:frame': { const html = frameHtml(ctx, part); if (html) { out += '<p>' + html + '</p>'; ctx.started = true; } break; }
        default:
          if (INDEXES.indexOf(tag) >= 0) { count(ctx, 'toc'); if (tag === 'text:table-of-content') out += '<div class="toc-marker"></div>'; ctx.started = true; break; }
          if (/^draw:/.test(tag)) count(ctx, 'shapes');
          break;
      }
    });
    return out;
  }
  // Un tableau dans une case : l'éditeur n'a pas de tableau dans un tableau, ses cases sont reprises l'une après l'autre.
  function flattenTable(ctx, table, depth) {
    let out = '';
    rowsOf(table).forEach(row => children(row, 'table:table-cell').forEach((cell) => { out += blocksOf(ctx, cell, depth + 1); }));
    return out;
  }

  // --- Les tableaux ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const ROW_HOLDERS = ['table:table-header-rows', 'table:table-rows', 'table:table-row-group'];
  const COLUMN_HOLDERS = ['table:table-header-columns', 'table:table-columns', 'table:table-column-group'];
  // Les lignes d'un tableau, dans l'ordre, y compris celles que rangent les groupes et l'en-tête répété.
  function rowsOf(table) {
    const out = [];
    const walk = (holder) => {
      kids(holder).forEach((part) => {
        const tag = name(part);
        if (tag === 'table:table-row') out.push(part);
        else if (ROW_HOLDERS.indexOf(tag) >= 0) walk(part);
      });
    };
    walk(table);
    return out;
  }
  function columnsOf(ctx, table) {
    const out = [];
    const walk = (holder) => {
      kids(holder).forEach((part) => {
        const tag = name(part);
        if (tag === 'table:table-column') {
          const props = merged(ctx, 'table-column', attr(part, 'table:style-name'), 'column');
          const relative = /^(\d+(?:\.\d+)?)\*$/.exec(props['style:rel-column-width'] || '');
          const width = toPoints(props['style:column-width']);
          for (let n = whole(attr(part, 'table:number-columns-repeated'), 1); n > 0 && out.length < 200; n--) out.push({ width, rel: relative ? Number(relative[1]) : null });
        } else if (COLUMN_HOLDERS.indexOf(tag) >= 0) walk(part);
      });
    };
    walk(table);
    return out;
  }
  // Un trait d'OpenDocument (« 0.5pt solid #000000 ») en valeur de l'éditeur : 'none', ou '#rrggbb' (le trait fin de cette couleur). Épaisseur et sorte (pointillé, double...) ne se gardent pas : la sorte qui n'est pas unie est comptée.
  function borderValue(text, losses) {
    const parts = String(text || '').trim().split(/\s+/);
    if (!text || parts[0] === 'none' || parts[0] === 'hidden' || parts.length < 2) return text ? 'none' : null;
    if (parseFloat(parts[0]) === 0) return 'none';
    if (parts[1] !== 'solid' && losses) losses.add('borderStyles');
    return '#' + (colorOf(parts[2]) || '000000');
  }
  function sidesOf(cellProps, losses) {
    const sides = {};
    ['top', 'right', 'bottom', 'left'].forEach((side) => {
      const own = cellProps['fo:border-' + side] !== undefined ? cellProps['fo:border-' + side] : cellProps['fo:border'];
      sides[side] = borderValue(own, losses);
    });
    return sides;
  }
  function tableHtml(ctx, table, depth) {
    const tableProps = merged(ctx, 'table', attr(table, 'table:style-name'), 'table');
    const losses = new Set();
    const columns = columnsOf(ctx, table);
    const rowEls = rowsOf(table).slice(0, MAX_ROWS);
    // Les lignes et leurs cases, chacune avec sa colonne de départ : les cases couvertes (fusions) sont écrites par le fichier, la grille compte donc les colonnes comme lui.
    const rows = [];
    let cellTotal = 0;
    let cut = 0;
    rowEls.forEach((rowEl) => {
      const rowProps = merged(ctx, 'table-row', attr(rowEl, 'table:style-name'), 'row');
      const height = toPoints(rowProps['style:row-height']) || toPoints(rowProps['style:min-row-height']) || 0;
      const cells = [];
      let col = 0;
      let owed = 0;   // les cases couvertes qui suivent une case étalée sur plusieurs colonnes (le fichier les écrit) : déjà comptées dans son étalement
      kids(rowEl).forEach((cellEl) => {
        const tag = name(cellEl);
        if (tag !== 'table:table-cell' && tag !== 'table:covered-table-cell') return;
        const repeat = whole(attr(cellEl, 'table:number-columns-repeated'), 1);
        if (tag === 'table:covered-table-cell') {
          const inside = Math.min(owed, repeat);
          owed -= inside;
          col += repeat - inside;
          return;
        }
        for (let n = 0; n < repeat && col < 200; n++) {
          const span = whole(attr(cellEl, 'table:number-columns-spanned'), 1, 200);
          cells.push({ el: cellEl, col, span, down: whole(attr(cellEl, 'table:number-rows-spanned'), 1, 5000), sides: null });
          col += span;
          owed = span - 1;
        }
      });
      const times = whole(attr(rowEl, 'table:number-rows-repeated'), 1);
      for (let n = 0; n < times && rows.length < MAX_ROWS; n++) {
        if (cellTotal + cells.length > MAX_CELLS) { cut += cells.length; continue; }
        cellTotal += cells.length;
        rows.push({ height, cells: n === 0 ? cells : cells.map(cell => Object.assign({}, cell)), width: col });
      }
    });
    if (cut) count(ctx, 'tableCells', 1);
    const gridWidth = Math.max(columns.length, ...rows.map(row => row.width), 1);
    // La largeur des colonnes : absolue (`style:column-width`), ou relative (« 1953* ») à la largeur du tableau ; une colonne sans largeur prend sa part de ce qui reste.
    const totalWidth = toPoints(tableProps['style:width'], ctx.contentWidthPt) || (tableProps['style:rel-width'] ? toPoints(tableProps['style:rel-width'], ctx.contentWidthPt) : null);
    const relTotal = columns.reduce((sum, column) => sum + (column.rel || 0), 0);
    const absTotal = columns.reduce((sum, column) => sum + (column.width || 0), 0);
    const widths = [];
    for (let c = 0; c < gridWidth; c++) {
      const column = columns[c] || {};
      let width = column.width;
      if (!width && column.rel && relTotal) width = (totalWidth || ctx.contentWidthPt || 450) * column.rel / relTotal;
      if (!width) width = Math.max(30, ((totalWidth || ctx.contentWidthPt || 450) - absTotal) / Math.max(1, gridWidth - columns.filter(entry => entry.width).length));
      widths.push(Math.max(1, Math.round(width * PX_PER_PT)));
    }
    // Les traits : la case décide de chacun des siens ; un côté qu'elle n'a pas tracé prend celui que sa voisine trace sur la même arête.
    const grid = rows.map(() => []);
    rows.forEach((row, r) => row.cells.forEach((cell) => {
      cell.props = merged(ctx, 'table-cell', attr(cell.el, 'table:style-name'), 'cell');
      cell.sides = sidesOf(cell.props, losses);
      for (let dr = 0; dr < cell.down && r + dr < rows.length; dr++) for (let dc = 0; dc < cell.span; dc++) grid[r + dr][cell.col + dc] = cell;
    }));
    const neighbor = { top: [-1, 0, 'bottom'], bottom: [1, 0, 'top'], left: [0, -1, 'right'], right: [0, 1, 'left'] };
    rows.forEach((row, r) => row.cells.forEach((cell) => {
      Object.keys(neighbor).forEach((side) => {
        if (cell.sides[side] && cell.sides[side] !== 'none') return;
        const [dr, dc, facing] = neighbor[side];
        const rr = dr < 0 ? r - 1 : (dr > 0 ? r + cell.down : r);
        const cc = dc < 0 ? cell.col - 1 : (dc > 0 ? cell.col + cell.span : cell.col);
        const other = grid[rr] && grid[rr][cc];
        if (other && other !== cell && other.sides[facing] && other.sides[facing] !== 'none') cell.sides[side] = other.sides[facing];
      });
    }));
    let html = '<table style="width: ' + widths.reduce((sum, width) => sum + width, 0) + 'px"><colgroup>' + widths.map(width => '<col style="width: ' + width + 'px">').join('') + '</colgroup><tbody>';
    rows.forEach((row) => {
      const height = row.height > 0 ? Math.round(row.height * PX_PER_PT) : 0;
      html += '<tr' + (height ? ' data-row-height="' + height + '" style="height: ' + height + 'px"' : '') + '>';
      row.cells.forEach((cell) => {
        const fill = colorOf(cell.props['fo:background-color']);
        const valign = cell.props['style:vertical-align'];
        const span = widths.slice(cell.col, cell.col + cell.span);
        const content = blocksOf(ctx, cell.el, depth + 1);
        html += '<td' + (cell.span > 1 ? ' colspan="' + cell.span + '"' : '') + (cell.down > 1 ? ' rowspan="' + cell.down + '"' : '') + ' colwidth="' + span.join(',') + '"'
          + (fill && fill !== 'ffffff' ? ' style="background-color: #' + fill + '"' : '') + (valign === 'middle' ? ' data-valign="middle"' : (valign === 'bottom' ? ' data-valign="bottom"' : ''))
          + ['top', 'right', 'bottom', 'left'].map(side => ' data-border-' + side + '="' + (cell.sides[side] || 'none') + '"').join('') + '>' + (content || '<p></p>') + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    losses.forEach(key => count(ctx, key));
    // Un saut de page avant le tableau (réglage du style du tableau).
    return (pageBreakBefore(ctx, tableProps, styleChain(ctx, 'table', attr(table, 'table:style-name'))) ? PAGE_BREAK : '') + html;
  }

  // --- La page ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Les formats que l'éditeur nomme (côté court, côté long, en millimètres) ; tout autre est un format libre « LARGEURxHAUTEUR ».
  const NAMED_FORMATS = [['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148]];
  function pageOf(layout) {
    if (!layout) return null;
    const width = toPoints(layout['fo:page-width']);
    const height = toPoints(layout['fo:page-height']);
    if (!width || !height) return null;
    const short = Math.min(width, height) * MM_PER_PT;
    const long = Math.max(width, height) * MM_PER_PT;
    const named = NAMED_FORMATS.find(format => Math.abs(format[1] - short) < 1.5 && Math.abs(format[2] - long) < 1.5);
    const tenth = value => Math.round(value * 10) / 10;
    const format = PageLayout.normalizeFormat(named ? named[0] : tenth(short) + 'x' + tenth(long));
    const margin = (side) => {
      const value = layout['fo:margin-' + side] !== undefined ? layout['fo:margin-' + side] : layout['fo:margin'];
      const points = toPoints(String(value === undefined ? '' : value).trim().split(/\s+/)[0]);
      return tenth(Math.max(0, points === null ? 56.7 : points) * MM_PER_PT);
    };
    return { top: margin('top'), right: margin('right'), bottom: margin('bottom'), left: margin('left'), orientation: width > height ? PageLayout.LANDSCAPE : PageLayout.PORTRAIT, format };
  }
  const samePage = (first, second) => !!first && !!second && ['top', 'right', 'bottom', 'left'].every(side => Math.abs(first[side] - second[side]) < 0.6) && first.orientation === second.orientation && first.format === second.format;
  // La page de départ : celle que nomme le premier style qui en change, sinon la première page maîtresse du fichier.
  function firstMaster(ctx) {
    const named = new Map(ctx.styles.masters.map(master => [attr(master, 'style:name'), master]));
    let wanted = null;
    ctx.styles.styles.forEach((style) => { if (!wanted && style.master && ctx.firstStyles.has(style.family + ':' + style.name)) wanted = style.master; });
    return named.get(wanted) || ctx.styles.masters[0] || null;
  }

  // --- Les en-têtes et pieds de page ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // Le contenu d'une zone (`style:header`, `style:footer-first`...), en balisage ; rien quand elle manque ou qu'elle est masquée (`style:display="false"`). Une zone ne commence pas de page : le texte déjà lu n'y change rien.
  function zoneHtml(ctx, page, tag) {
    const holder = child(page, tag);
    if (!holder || attr(holder, 'style:display') === 'false') return '';
    const started = ctx.started;
    ctx.started = false;
    const html = blocksOf(ctx, holder, 0);
    ctx.started = started;
    return PageLayout.hasZoneContent(html) ? html : '';
  }
  // La zone existe, n'est pas masquée et porte du texte ou une image (sans la lire : elle n'est pas reprise).
  function hasContent(page, tag) {
    const holder = child(page, tag);
    return !!holder && attr(holder, 'style:display') !== 'false' && !!(holder.textContent.trim() || descendants(holder, 'frame').length);
  }
  // Les zones de la page de départ : { header: { default, first }, footer: { default, first }, different (la première page a les siennes), leftPages (zones des pages paires, non reprises) }. La première page a ses zones
  // soit dans la page maîtresse même (`style:header-first`), soit parce que la page maîtresse de départ est « Première page », suivie (`style:next-style-name`) par celle des autres pages.
  function zonesOf(ctx, master) {
    const zones = { header: { default: '', first: '' }, footer: { default: '', first: '' }, different: false, leftPages: 0 };
    if (!master) return zones;
    const nextName = attr(master, 'style:next-style-name');
    const next = nextName && nextName !== attr(master, 'style:name') ? ctx.styles.masters.find(other => attr(other, 'style:name') === nextName) : null;
    ['header', 'footer'].forEach((kind) => {
      const own = zoneHtml(ctx, master, 'style:' + kind);
      const explicit = zoneHtml(ctx, master, 'style:' + kind + '-first');
      if (explicit) { zones[kind].default = own; zones[kind].first = explicit; zones.different = true; }
      else if (next) { zones[kind].first = own; zones[kind].default = zoneHtml(ctx, next, 'style:' + kind); }
      else zones[kind].default = own;
      if (hasContent(master, 'style:' + kind + '-left')) zones.leftPages += 1;
    });
    if (next && ['header', 'footer'].some(kind => zones[kind].first || zones[kind].default)) zones.different = true;
    // La première page qui n'a pas de zone à elle (un pied de page, quand seul l'en-tête a une première page) montre celle des autres pages.
    if (zones.different) ['header', 'footer'].forEach((kind) => { if (!zones[kind].first && !next) zones[kind].first = zones[kind].default; });
    return zones;
  }

  // --- Le fichier ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const MESSAGES = {
    notPackage: 'Ce fichier n’est pas un document OpenDocument.', unreadable: 'Ce fichier n’a pas pu être lu.', tooBig: 'Ce fichier est trop gros pour être importé.',
    encrypted: 'Ce fichier OpenDocument est protégé par un mot de passe.',
  };
  async function fromBuffer(buffer, options) {
    const odf = await ExportCommon.Odf.open(buffer, { limits: { maxUnpacked: MAX_UNPACKED_BYTES, maxPart: MAX_PART_BYTES }, messages: MESSAGES });
    if (odf.kind !== 'text') throw fail('wrongType', 'Ce fichier OpenDocument n’est pas un document texte.', { kind: odf.kind });
    const styles = readStyles(odf);
    const ctx = {
      styles, report: new Map(), fontsSeen: new Set(), counters: new Map(), started: false, contentWidthPt: 450, firstStyles: new Set(), usedMasters: new Set(), images: new Map(), imageBytes: 0, noteCounter: 0,
      mergeField: (options && options.mergeField) || defaultMergeField,
      changes: new Map(), revisions: new Map(), suivi: {}, countedChanges: new Set(), openInserts: [],
      threads: [], threadOf: new Map(), annotations: new Set(), endNames: new Set(), openThreads: new Map(), pointThreads: [],
    };
    // Les styles du premier bloc disent la page de départ (ils changent de page maîtresse), avant que le corps soit lu.
    kids(odf.body).some((part) => {
      const tag = name(part);
      if (tag === 'text:p' || tag === 'text:h') ctx.firstStyles.add('paragraph:' + attr(part, 'text:style-name'));
      else if (tag === 'table:table') ctx.firstStyles.add('table:' + attr(part, 'table:style-name'));
      else if (tag === 'text:list') return false;
      else return false;
      return true;
    });
    const master = firstMaster(ctx);
    const layout = master ? styles.layouts.get(attr(master, 'style:page-layout-name')) : null;
    const page = pageOf(layout);
    if (page) {
      const widthPt = (page.orientation === PageLayout.LANDSCAPE ? Math.max(toPoints(layout['fo:page-width']), toPoints(layout['fo:page-height'])) : Math.min(toPoints(layout['fo:page-width']), toPoints(layout['fo:page-height'])));
      ctx.contentWidthPt = Math.max(100, widthPt - (page.left + page.right) / MM_PER_PT);
    }
    ctx.images = await loadImages(ctx, odf);
    readChanges(ctx, odf);
    readComments(ctx, odf);
    const html = blocksOf(ctx, odf.body, 0).replace(/(?:<div class="page-break-marker"><\/div>)+$/, '');
    ctx.openThreads.clear();
    ctx.openInserts.length = 0;
    // Les en-têtes et pieds de page de la page de départ ; ceux des pages paires (une autre zone pour les pages de gauche) ne sont pas repris : comptés.
    const zones = zonesOf(ctx, master);
    const filled = ['header', 'footer'].some(kind => zones[kind].default || zones[kind].first);
    const headerFooter = filled ? { enabled: true, differentFirstPage: zones.different, header: zones.header, footer: zones.footer } : null;
    if (zones.leftPages) count(ctx, 'headerFooter', zones.leftPages);
    // Les pages maîtresses que le texte demande (un style qui change de page) et dont la mise en page n'est pas celle de départ : seule celle de départ est reprise.
    const startName = attr(master, 'style:name');
    let differing = 0;
    ctx.usedMasters.forEach((used) => {
      const other = styles.masters.find(candidate => attr(candidate, 'style:name') === used);
      if (used !== startName && other && !samePage(pageOf(styles.layouts.get(attr(other, 'style:page-layout-name'))), page)) differing += 1;
    });
    if (differing) count(ctx, 'sections', differing);
    if (!/\S/.test(html.replace(/<[^>]*>/g, '')) && !/<(?:table|img|hr)\b|toc-marker/.test(html) && !filled) throw fail('empty', 'Ce document OpenDocument est vide.');
    // Les fils dont aucun passage de texte n'a été marqué n'ont rien à quoi s'accrocher : comptés, non repris.
    const unanchored = ctx.threads.filter(thread => !thread.anchored).length;
    if (unanchored) count(ctx, 'comments', unanchored);
    const comments = ctx.threads.filter(thread => thread.anchored).map(thread => ({ id: thread.id, resolved: thread.resolved, messages: thread.messages }));
    const report = REPORT_KEYS.filter(key => ctx.report.get(key)).map(key => ({ key, n: ctx.report.get(key) }));
    return { html, headerFooter, page, report, suiviModifications: ctx.revisions.size ? ctx.suivi : null, comments };
  }
  const descendants = (el, local) => (el ? Array.from(el.getElementsByTagNameNS('*', local)) : []);
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
