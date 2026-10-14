// Export Markdown : le document d'une ligne en un fichier .md (une seule ligne, ou un fichier par ligne dans une archive ZIP, js/main.js:BATCH_EXPORTS.mdZip).
// Comme le Word, il part du HTML que ReaderMode.preview a résolu pour la ligne (variables remplacées par leurs valeurs, blocs conditionnels tranchés) et le
// lit nœud par nœud, sans rien mesurer : un fichier Markdown ne connaît ni page, ni marge, ni police.
//
// La règle : tout ce que le Markdown sait écrire s'écrit en Markdown (CommonMark et GFM : ce que lisent GitHub, VS Code, Obsidian, Docs de La Suite), et ce
// qu'il ne sait pas écrire s'écrit en HTML en ligne, que presque tous les lecteurs laissent passer, plutôt que d'être perdu.
//  - titres 1 à 6 (leur numérotation « 1) », « a) » est écrite dans le texte, comme dans le PDF), paragraphes, retours à la ligne, sommaire (une liste de liens) ;
//  - gras, italique, barré (** * ~~) ; souligné, exposant, indice, surlignage, couleur, taille et police en <u> <sup> <sub> <mark> <span style> ;
//  - liens (adresses web, e-mail, téléphone), images (une adresse web reste une adresse ; une pièce jointe de Grist ou un graphique part dans le fichier, en
//    data URI : le fichier se suffit) avec leur largeur quand ce n'est pas celle par défaut ;
//  - listes à puces, numérotées (depuis leur premier numéro) et à cases, imbriquées ; citations ; blocs de code avec leur langage ; filet ;
//  - tableaux GFM, ou un tableau HTML quand une case fusionne des cellules ou porte une liste, un code, une citation ou un autre tableau ;
//  - encadrés en alertes GitHub (> [!NOTE], TIP, IMPORTANT, WARNING, CAUTION : la couleur de l'encadré choisit la sorte) ; notes de bas de page en [^1] ;
//  - alignement centré ou à droite d'un paragraphe, d'un titre ou d'une image seule (<div align>) ; saut de page (<div style="page-break-after: always;">) ;
//  - en-têtes et pieds de page, une fois chacun, entre des commentaires HTML (<!-- publipostage:header -->).
// Ce qu'il ne garde pas, volontairement : les marges, le format et le sens de la page, le filigrane, les images « sur toutes les pages » ou derrière le texte,
// les numéros de page, les paragraphes vides (le Markdown n'a pas d'espace vertical), la mise en colonnes (les deux colonnes se suivent), les styles de puces et
// de numérotation (a, b, c...), le justifié, l'interligne, les couleurs de fond des cases. Les variables y sont les valeurs de la ligne, comme dans le PDF.
// Le sens inverse (un .md devient un document) est js/markdown-import.js : il relit ce que ce fichier écrit (alertes, cases, notes, sommaire, saut de page, <div align>,
// <img width>, en-têtes et pieds entre commentaires, variables) ; changer l'écriture ici, c'est changer ce que l'import doit reconnaître (dev-tests/scenarios-markdown-import.js).
//
// Deux fichiers, deux types du menu « Type d'export » : « Markdown » écrit le document d'une ligne, variables remplacées par leurs valeurs ; « Markdown (modèle) » (template : true)
// écrit le modèle lui-même, tel que l'éditeur le garde, pour qu'il revienne intact par l'import. Les mêmes règles d'écriture, avec en plus l'écriture des éléments de fusion :
//  - une bulle de variable sans réglage s'écrit {{Table.Colonne}} (sa clé) ; l'import la retrouve quand la clé est une variable du document ;
//  - tout ce qui porte un réglage ou qui n'a pas d'écriture en Markdown s'écrit en HTML en ligne, avec les attributs que l'éditeur lui donne (data-*) et son libellé comme texte :
//    bulle réglée (format, condition, boucle, texte autour, sinon), calcul, puce (date, heure...), pastille « @ » (la fiche qu'elle cite, pas son nom d'aujourd'hui), numéro de page, case conditionnelle, valeur conditionnelle (<span>) et bloc
//    conditionnel (<div>, une ligne vide autour de son contenu pour que le Markdown y soit encore lu), image liée à une colonne, code QR ou graphique de la page.
// Rien n'est résolu : pas de ligne, pas de lecture de Grist, pas de fenêtre des images d'un autre site (le document n'est pas posé dans la page). Les suggestions du suivi des
// modifications sont acceptées, comme pour tous les exports.
const MarkdownExport = (function () {
  // Le repère d'un saut de ligne du paragraphe pendant la composition : remplacé à la fin (paragraphLines) par la barre oblique du Markdown, ou <br> dans une case.
  const BR = '\x01';
  // Tout ce que la composition ajoute autour du texte (*, [, <, `) est un signe de ponctuation pour les règles de bord de CommonMark : celui-ci le représente.
  const PUNCT = '*';
  const isSpaceChar = c => !c || c === BR || /\s/.test(c);
  const isPunctChar = c => !!c && /[\p{P}\p{S}]/u.test(c);
  const isWordChar = c => !!c && /[\p{L}\p{N}]/u.test(c);
  // Le premier et le dernier caractère d'une chaîne, un emoji compris (deux unités UTF-16) : CommonMark lit des caractères, pas des unités.
  const firstChar = s => (s ? String.fromCodePoint(s.codePointAt(0)) : '');
  const lastChar = s => (s ? Array.from(s.slice(-2)).pop() : '');
  const collapse = s => String(s).replace(/\x01/g, '').replace(/[ \t\r\n\f]+/g, ' ');
  const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttr = s => escapeHtml(s).replace(/"/g, '&quot;');

  // Le texte d'un nœud, protégé pour que le Markdown le relise tel quel. On n'échappe que ce qui peut changer le sens : un crochet seul, un « # » ou un tiret
  // en milieu de ligne restent tels quels (escapeLineStart protège le début des lignes). Dans un lien, les crochets sont tous protégés : un « ] » ferait finir le texte du lien.
  function escapeText(s, ctx) {
    let out = '';
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      const next = s[i + 1] || '';
      if (c === '\\' || c === '`' || c === '*' || c === '~') out += '\\' + c;
      else if (c === '_') out += isWordChar(s[i - 1]) && isWordChar(next) ? c : '\\_';
      else if (c === '[') out += ctx.inLink || next === '^' ? '\\[' : c;
      else if (c === ']') out += ctx.inLink || next === '(' ? '\\]' : c;
      else if (c === '<') out += /[A-Za-z/!?]/.test(next) ? '\\<' : c;
      else if (c === '&') out += /^&#?\w+;/.test(s.slice(i, i + 12)) ? '\\&' : c;
      else if (c === '|') out += ctx.inCell ? '\\|' : c;
      // « {{ » du texte n'est pas une variable : sa première accolade est protégée, l'import ne lit {{Table.Colonne}} que sans elle.
      else if (c === '{') out += next === '{' ? '\\{' : c;
      else out += c;
    }
    return out;
  }

  // Le début d'une ligne de paragraphe qui ressemblerait à un titre, une puce, une citation, un numéro de liste, un filet, une case à cocher, une définition de lien
  // ou une rangée de tableau : sa première lettre est protégée.
  function escapeLineStart(line) {
    return line
      .replace(/^(#{1,6})(?=\s|$)/, '\\$1')
      .replace(/^([-+])(?=\s|$)/, '\\$1')
      .replace(/^(=+|-{2,})\s*$/, m => '\\' + m)
      .replace(/^>/, '\\>')
      .replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2')
      .replace(/^\[([ xX])\](?=\s|$)/, '\\[$1]')
      .replace(/^\[([^\]]*)\]:/, '\\[$1]:')
      .replace(/^\|/, '\\|');
  }

  // --- Les marques du texte --------------------------------------------------------------------------------------------------------------------------
  // `delim` : l'écriture Markdown, `html` : la balise de repli (quand le Markdown ne peut pas ouvrir ou fermer la marque à cet endroit, voir wrapMark).
  const STRONG = { key: 'strong', delim: '**', family: '*', html: ['<strong>', '</strong>'] };
  const EM = { key: 'em', delim: '*', family: '*', html: ['<em>', '</em>'] };
  const DEL = { key: 'del', delim: '~~', family: '~', html: ['<del>', '</del>'] };
  const UNDERLINE = { key: 'u', html: ['<u>', '</u>'] };
  const SUP = { key: 'sup', html: ['<sup>', '</sup>'] };
  const SUB = { key: 'sub', html: ['<sub>', '</sub>'] };
  const HIGHLIGHT = { key: 'mark', html: ['<mark>', '</mark>'] };
  const spanMark = style => ({ key: 'span:' + style, html: ['<span style="' + escapeAttr(style) + '">', '</span>'] });
  const linkMark = (href, title) => ({ key: 'a:' + href + '\n' + title, link: { href, title } });

  const cssOf = (el, name) => (el.style ? el.style.getPropertyValue(name) : '') || '';
  const isBoldValue = v => /^(bold|bolder|[6-9]00)$/i.test(String(v).trim());
  // Le style en ligne qu'on garde : la police, la taille, la couleur et le fond (ce que TipTap pose dans un <span style>, js/editor-nodes.js:inlineStyleAttribute).
  function keptStyle(el) {
    const parts = [];
    [['font-family', v => v.replace(/"/g, "'")], ['font-size', v => v], ['color', v => v], ['background-color', v => v]].forEach(([name, clean]) => {
      const value = cssOf(el, name).trim();
      if (!value || /^(inherit|initial|unset|transparent)$/i.test(value) || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/i.test(value)) return;
      parts.push(name + ': ' + clean(value));
    });
    return parts.join('; ');
  }

  // Les marques qu'un élément pose sur son contenu, de la plus extérieure à la plus intérieure. Un lien sans adresse sûre (HtmlSanitize.safeLinkHref) n'est que du texte.
  function marksOf(el) {
    const marks = [];
    // Une case à cocher résolue (☑ ☐, js/reader-mode.js:checkboxNode) n'est qu'un caractère : sa couleur est un réglage d'affichage de la variable, pas un style du texte.
    if (el.classList.contains('resolved-checkbox')) return marks;
    const tag = el.tagName;
    if (tag === 'A') {
      const href = HtmlSanitize.safeLinkHref(el.getAttribute('href'));
      if (href) marks.push(linkMark(href, el.getAttribute('title') || ''));
    }
    if (tag === 'STRONG' || tag === 'B' || isBoldValue(cssOf(el, 'font-weight'))) marks.push(STRONG);
    if (tag === 'EM' || tag === 'I' || /italic|oblique/i.test(cssOf(el, 'font-style'))) marks.push(EM);
    const decoration = cssOf(el, 'text-decoration') + ' ' + cssOf(el, 'text-decoration-line');
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/i.test(decoration)) marks.push(DEL);
    if (tag === 'U' || tag === 'INS' || /underline/i.test(decoration)) marks.push(UNDERLINE);
    const script = ScriptMarks.kindOf(el) || (/^super\b/i.test(cssOf(el, 'vertical-align')) ? ScriptMarks.SUPERSCRIPT : /^sub\b/i.test(cssOf(el, 'vertical-align')) ? ScriptMarks.SUBSCRIPT : null);
    if (script) marks.push(script === ScriptMarks.SUPERSCRIPT ? SUP : SUB);
    if (tag === 'MARK') marks.push(HIGHLIGHT);
    const style = keptStyle(el);
    if (style) marks.push(spanMark(style));
    return marks;
  }

  // --- Le texte en ligne : un arbre de nœuds { t: 'text' | 'br' | 'code' | 'raw' | 'footnote' | 'mark' } ----------------------------------------------
  // Une image, la note de bas de page, un code en ligne sont des feuilles ; une marque enveloppe ses enfants.
  function inlineNodesOf(node, ctx) {
    if (node.nodeType === Node.TEXT_NODE) {
      const s = collapse(node.nodeValue);
      return s ? [{ t: 'text', s }] : [];
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.hasAttribute('data-pdf-skip')) return [];
    const tag = node.tagName;
    const cl = node.classList;
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'TEMPLATE' || tag === 'INPUT' || tag === 'LABEL') return [];
    // Le modèle garde ses éléments de fusion (le numéro de page compris) ; l'export d'une ligne les a déjà remplacés par leur valeur.
    if (ctx.template && isAtom(node)) return [{ t: 'raw', s: atomPiece(node, ctx) }];
    if (cl.contains('page-number-badge') || cl.contains('page-break-marker') || cl.contains('heading-numbering-config') || cl.contains('toc-marker')) return [];
    if (cl.contains('footnote-ref-marker')) return [{ t: 'footnote', s: node.getAttribute('data-note-text') || '' }];
    if (tag === 'BR') return [{ t: 'br' }];
    // Tabulation (js/tab-indent.js) : une entité par tabulation. Une tabulation ou quatre espaces en tête d'un paragraphe ouvriraient un bloc de code en Markdown.
    if (TabIndent.isTab(node)) return node.textContent.split(TabIndent.TAB).flatMap((piece, i) => (i ? [{ t: 'raw', s: TabIndent.MARKDOWN_TAB }] : []).concat(collapse(piece) ? [{ t: 'text', s: collapse(piece) }] : []));
    if (tag === 'IMG') return imageNodes(node, ctx);
    if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') return node.textContent ? wrapInMarks(node, [{ t: 'code', s: node.textContent }], true) : [];
    const children = [];
    Array.from(node.childNodes).forEach(child => children.push(...inlineNodesOf(child, ctx)));
    // La valeur conditionnelle d'un modèle : sa balise autour de son texte, espaces du bord compris (elle masque l'espace avec le mot).
    if (ctx.template && cl.contains('conditional-value')) return [{ t: 'wrap', open: openTag(node, ctx), close: '</span>', children }];
    return children.length ? wrapInMarks(node, children, false) : [];
  }
  // Les enfants de l'élément sous les marques qu'il pose. Un code en ligne ne garde que les marques qui l'entourent (lien, gras, italique, barré), jamais celle de
  // son propre style.
  function wrapInMarks(el, children, isCode) {
    const marks = isCode ? marksOf(el).filter(m => m.link || m.key === 'strong' || m.key === 'em' || m.key === 'del') : marksOf(el);
    let nodes = children;
    for (let i = marks.length - 1; i >= 0; i -= 1) nodes = [{ t: 'mark', mark: marks[i], children: nodes }];
    return nodes;
  }

  // La largeur d'une image si elle n'est pas celle par défaut de l'éditeur (320 px) : « 150 » ou « 50% », sinon rien.
  const DEFAULT_IMAGE_WIDTH_PX = 320;
  function shownWidthOf(img) {
    const width = cssOf(img, 'width').trim();
    const px = width.match(/^(\d+(?:\.\d+)?)px$/);
    if (px) return Math.round(parseFloat(px[1])) === DEFAULT_IMAGE_WIDTH_PX ? '' : String(Math.round(parseFloat(px[1])));
    return /^\d+(?:\.\d+)?%$/.test(width) ? width : '';
  }
  // L'adresse d'un lien ou d'une image : telle quelle, ou entre < > quand elle porte un blanc ou une parenthèse.
  function destination(url) {
    const clean = String(url).replace(/[\r\n]+/g, '');
    return /[\s()<>]/.test(clean) || !clean ? '<' + clean.replace(/</g, '%3C').replace(/>/g, '%3E') + '>' : clean;
  }
  const titleOf = title => (title ? ' "' + title.replace(/[\r\n]+/g, ' ').replace(/["\\]/g, '\\$&') + '"' : '');
  function imageNodes(img, ctx) {
    // Une image de fusion du modèle s'écrit quel que soit son calque : ce type d'export sert justement à ne rien perdre de ce qui se fusionne.
    if (ctx.template && isMergeImage(img)) return [{ t: 'raw', s: mergeImageHtml(img, ctx) }];
    // Une image « derrière le texte » (un fond) ou répétée sur toutes les pages (un papier à en-tête) n'est pas du contenu du texte.
    if (img.getAttribute('data-layer') === 'behind' || PageLayer.isRepeatedEl(img)) return [];
    const info = ctx.images.get(img);
    if (!info || info.skip) return [];
    const alt = img.getAttribute('alt') || '';
    const width = shownWidthOf(img);
    if (width) return [{ t: 'raw', s: '<img src="' + escapeAttr(info.src) + '" alt="' + escapeAttr(alt) + '" width="' + escapeAttr(width) + '">' }];
    const title = img.getAttribute('title') || '';
    return [{ t: 'raw', s: '![' + alt.replace(/[\r\n]+/g, ' ').replace(/[\\[\]]/g, '\\$&') + '](' + destination(info.src) + titleOf(title) + ')' }];
  }

  // Un code en ligne : la clôture est plus longue que toute suite d'apostrophes inverses du texte ; un blanc de part et d'autre garde un code qui commence ou finit
  // par une apostrophe inverse.
  function codeSpan(text, ctx) {
    const s = text.replace(/\r?\n|\r/g, ' ').replace(ctx.inCell ? /\|/g : /(?!)/g, '\\|');
    if (!s.trim()) return '';
    const runs = s.match(/`+/g) || [];
    let n = 1;
    while (runs.some(run => run.length === n)) n += 1;
    const fence = '`'.repeat(n);
    const pad = /^`|`$/.test(s) || (/^ .* $/.test(s) && s.trim()) ? ' ' : '';
    return fence + pad + s + pad + fence;
  }

  // --- Les éléments de fusion du modèle (« Markdown (modèle) », ctx.template) -------------------------------------------------------------------------
  // Une clé « Table.Colonne » (un chemin de références y ajoute des points) : ce que l'import sait relire entre deux paires d'accolades.
  const KEY_PATTERN = /^[\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)+$/u;
  const PLAIN_BADGE_ATTRS = new Set(['class', 'contenteditable', 'data-table', 'data-column', 'data-key']);
  const ATOM_CLASSES = ['var-badge', 'calc-badge', 'smart-chip', 'mention-chip', 'page-number-badge', 'conditional-checkbox'];
  const isAtom = el => ATOM_CLASSES.some(name => el.classList.contains(name));
  // La valeur d'un attribut dans une balise écrite sur une seule ligne : « | » ne coupe pas la case d'un tableau, un saut de ligne ne coupe pas la balise.
  const attrValue = (value, ctx) => escapeAttr(value).replace(/\r\n?|\n/g, '&#10;').replace(/\|/g, ctx.inCell ? '&#124;' : '|');
  // Les attributs que l'éditeur écrit pour l'élément (la classe et les data-*, plus ceux de `extra`, sauf `omit` : les valeurs qui sont celles par défaut) : ce que l'import
  // redonne tel quel à l'éditeur.
  function mergeAttrs(el, ctx, extra, omit) {
    return Array.from(el.attributes)
      .filter(attr => attr.name !== 'data-pdf-skip' && (attr.name === 'class' || attr.name.indexOf('data-') === 0 || (extra && extra.indexOf(attr.name) !== -1))
        && !(omit && omit[attr.name] === attr.value))
      .map(attr => ' ' + attr.name + '="' + attrValue(attr.value, ctx) + '"').join('');
  }
  const openTag = (el, ctx) => '<' + el.localName + mergeAttrs(el, ctx) + '>';
  // Une bulle sans aucun réglage, d'une clé que l'import saura relire : sa clé entre deux paires d'accolades. '' sinon (la bulle s'écrit alors en HTML).
  function badgeToken(el) {
    const key = el.getAttribute('data-key') || '';
    if (!key || key !== (el.getAttribute('data-table') || '') + '.' + (el.getAttribute('data-column') || '') || !KEY_PATTERN.test(key)) return '';
    return Array.from(el.attributes).every(attr => PLAIN_BADGE_ATTRS.has(attr.name)) ? '{{' + key + '}}' : '';
  }
  // Une bulle, un calcul, une puce, un numéro de page ou une case conditionnelle : un nœud sans contenu à lui, écrit d'un bloc.
  // `html` : dans un morceau de HTML (un tableau aux cases fusionnées), le libellé s'écrit en HTML et non en Markdown.
  function atomPiece(el, ctx, html) {
    const token = el.classList.contains('var-badge') ? badgeToken(el) : '';
    const label = html ? escapeHtml(collapse(el.textContent)) : escapeText(collapse(el.textContent), ctx);
    return token || openTag(el, ctx) + label + '</' + el.localName + '>';
  }
  // Une image liée à une colonne, un graphique de la page ou un code QR dont le texte cite une colonne : sans adresse, dessinée à la lecture.
  const isMergeImage = ExportCommon.isMergeImage;
  const DEFAULT_IMAGE_ATTRS = { 'data-layer': 'normal', 'data-wrap': 'inline' };
  const mergeImageHtml = (img, ctx) => '<img' + mergeAttrs(img, ctx, ['alt', 'style'], DEFAULT_IMAGE_ATTRS) + '>';

  // --- Mise en ordre de l'arbre avant l'écriture --------------------------------------------------------------------------------------------------
  // Deux marques voisines de même clé n'en font qu'une (<strong>a</strong><strong>b</strong> : **ab**), et les blancs et retours à la ligne qui bordent une marque
  // passent dehors (**a **b devient **a** b : un blanc ne peut pas toucher les astérisques du dedans). Une marque vide disparaît.
  function takeEdge(nodes, leading) {
    const taken = [];
    while (nodes.length) {
      const index = leading ? 0 : nodes.length - 1;
      const n = nodes[index];
      if (n.t === 'br') { nodes.splice(index, 1); taken[leading ? 'push' : 'unshift'](n); continue; }
      if (n.t === 'text') {
        const m = (leading ? /^ +/ : / +$/).exec(n.s);
        if (!m) break;
        n.s = leading ? n.s.slice(m[0].length) : n.s.slice(0, n.s.length - m[0].length);
        taken[leading ? 'push' : 'unshift']({ t: 'text', s: m[0] });
        if (n.s) break;
        nodes.splice(index, 1);
        continue;
      }
      if (n.t === 'mark') {
        const inner = takeEdge(n.children, leading);
        if (leading) taken.push(...inner); else taken.unshift(...inner);
        if (n.children.length) break;
        nodes.splice(index, 1);
        continue;
      }
      break;
    }
    return taken;
  }
  function pushNode(out, n) {
    const last = out[out.length - 1];
    if (n.t === 'text' && last && last.t === 'text') last.s += n.s;
    else out.push(n);
  }
  function normalise(nodes) {
    // Les marques voisines de même clé se rejoignent.
    const merged = [];
    nodes.forEach(n => {
      const last = merged[merged.length - 1];
      if (n.t === 'mark' && last && last.t === 'mark' && last.mark.key === n.mark.key) last.children = last.children.concat(n.children);
      else merged.push(n.t === 'mark' ? { t: 'mark', mark: n.mark, children: n.children.slice() } : n);
    });
    const out = [];
    merged.forEach(n => {
      // Sa balise garde les blancs de son bord : ils font partie de la valeur.
      if (n.t === 'wrap') { out.push({ t: 'wrap', open: n.open, close: n.close, children: normalise(n.children) }); return; }
      if (n.t !== 'mark') { pushNode(out, n.t === 'text' ? { t: 'text', s: n.s } : n); return; }
      const kids = normalise(n.children);
      const lead = takeEdge(kids, true);
      const trail = takeEdge(kids, false);
      lead.forEach(x => pushNode(out, x));
      if (kids.length) out.push({ t: 'mark', mark: n.mark, children: kids });
      trail.forEach(x => pushNode(out, x));
    });
    return out;
  }

  // --- L'écriture du texte en ligne ------------------------------------------------------------------------------------------------------------------
  const plainOf = nodes => (nodes.length === 1 && nodes[0].t === 'text' ? nodes[0].s : null);
  function pieceOf(n, ctx) {
    if (n.t === 'text') return { s: escapeText(n.s, ctx) };
    if (n.t === 'br') return { s: BR };
    if (n.t === 'code') return { s: codeSpan(n.s, ctx) };
    if (n.t === 'raw') return { s: n.s };
    if (n.t === 'wrap') return { s: n.open + renderNodes(n.children, { prev: PUNCT, next: PUNCT }, ctx) + n.close };
    if (n.t === 'footnote') { ctx.footnotes.push(n.s); return { s: '[^' + ctx.footnotes.length + ']' }; }
    const isLink = !!n.mark.link;
    if (isLink) ctx.inLink += 1;
    const inner = renderNodes(n.children, { prev: PUNCT, next: PUNCT }, ctx);
    if (isLink) ctx.inLink -= 1;
    return { mark: n.mark, inner, plain: isLink ? plainOf(n.children) : null };
  }
  const firstCharOf = piece => (piece.mark ? PUNCT : firstChar(piece.s));

  // Le lien : <adresse> quand le texte est l'adresse elle-même, sinon [texte](adresse "titre").
  function renderLink(link, inner, plain) {
    if (plain !== null && !link.title) {
      if (plain === link.href && /^[a-z][a-z0-9+.-]*:[^\s<>]*$/i.test(plain)) return '<' + plain + '>';
      if (/^mailto:/i.test(link.href) && plain === link.href.slice(7) && /^[^\s<>@]+@[^\s<>@]+$/.test(plain)) return '<' + plain + '>';
    }
    return '[' + inner + '](' + destination(link.href) + titleOf(link.title) + ')';
  }

  // Une marque autour de son texte déjà écrit. Gras, italique et barré s'écrivent avec leurs signes quand CommonMark peut les ouvrir et les fermer à cet endroit
  // (un signe ne s'ouvre pas devant un blanc, ni devant une ponctuation quand une lettre le précède ; il ne se ferme pas derrière un blanc, ni derrière une ponctuation
  // quand une lettre le suit) ; sinon, et quand une autre marque en astérisques le touche (la règle des multiples de trois), la balise HTML fait le même travail.
  function wrapMark(piece, prev, next, touchesFamily) {
    const { mark, inner } = piece;
    if (!inner) return { s: '' };
    if (mark.link) return { s: renderLink(mark.link, inner, piece.plain) };
    if (mark.delim) {
      const first = firstChar(inner);
      const last = lastChar(inner);
      const canOpen = !isSpaceChar(first) && (!isPunctChar(first) || isSpaceChar(prev) || isPunctChar(prev));
      const canClose = !isSpaceChar(last) && (!isPunctChar(last) || isSpaceChar(next) || isPunctChar(next));
      if (canOpen && canClose && !touchesFamily) return { s: mark.delim + inner + mark.delim, delim: true };
    }
    return { s: mark.html[0] + inner + mark.html[1] };
  }

  function renderNodes(nodes, edge, ctx) {
    const pieces = nodes.map(n => pieceOf(n, ctx));
    let out = '';
    let previousFamily = '';
    pieces.forEach((piece, i) => {
      if (!piece.mark) { out += piece.s; previousFamily = ''; return; }
      const prev = out ? lastChar(out) : edge.prev;
      const next = i + 1 < pieces.length ? firstCharOf(pieces[i + 1]) : edge.next;
      const written = wrapMark(piece, prev, next, !!piece.mark.family && piece.mark.family === previousFamily);
      out += written.s;
      previousFamily = written.delim ? piece.mark.family : '';
    });
    return out;
  }

  // Le texte en ligne de nœuds du DOM, en une chaîne où chaque saut de ligne est un BR.
  function inlineMarkdown(domNodes, ctx, outerMark) {
    let nodes = [];
    domNodes.forEach(n => nodes.push(...inlineNodesOf(n, ctx)));
    if (outerMark) nodes = [{ t: 'mark', mark: outerMark, children: nodes }];
    return renderNodes(normalise(nodes), { prev: '', next: '' }, ctx);
  }
  // Les lignes d'un paragraphe : un saut de ligne devient une barre oblique inverse en fin de ligne (ou <br> dans une case de tableau, qui tient sur une ligne).
  function paragraphLines(inline, ctx) {
    const segments = inline.split(BR).map(s => s.replace(/^[ \t]+|[ \t]+$/g, ''));
    while (segments.length && !segments[0]) segments.shift();
    while (segments.length && !segments[segments.length - 1]) segments.pop();
    if (!segments.length) return [];
    if (ctx.inCell) return [segments.join('<br>')];
    return segments.map((s, i) => escapeLineStart(s) + (i < segments.length - 1 ? '\\' : ''));
  }

  // --- Les blocs --------------------------------------------------------------------------------------------------------------------------------------
  // Un bloc : { type, lines, align? } ; deux blocs se suivent séparés par une ligne vide.
  const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'HR',
    'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'NAV', 'MAIN', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY', 'ADDRESS', 'DL', 'DT', 'DD', 'FORM', 'FIELDSET', 'CENTER']);
  const isBlockNode = node => node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName);
  const hasBlockChild = el => Array.from(el.children).some(child => BLOCK_TAGS.has(child.tagName));

  function joinBlocks(blocks, tight) {
    const lines = [];
    blocks.forEach((b, i) => {
      // Dans un item de liste, une sous-liste suit son paragraphe sans ligne vide : l'item reste « serré ».
      if (i > 0 && !(tight && b.type === 'list' && blocks[i - 1].type === 'p')) lines.push('');
      b.lines.forEach(l => lines.push(l));
    });
    return lines;
  }
  const alignOf = el => {
    const a = (cssOf(el, 'text-align') || el.getAttribute('align') || '').trim().toLowerCase();
    return a === 'center' || a === 'right' ? a : '';
  };
  // Une image seule dans son paragraphe, centrée ou à droite (data-align) : c'est le paragraphe qui l'est.
  function soleImageAlign(el) {
    const kids = Array.from(el.childNodes).filter(n => !(n.nodeType === Node.TEXT_NODE && !n.nodeValue.trim()));
    if (kids.length !== 1 || kids[0].tagName !== 'IMG') return '';
    const a = kids[0].getAttribute('data-align');
    return a === 'center' || a === 'right' ? a : '';
  }

  function paragraphBlock(domNodes, ctx, el) {
    const caption = !!el && el.hasAttribute('data-caption');
    const lines = paragraphLines(inlineMarkdown(domNodes, ctx, caption ? EM : null), ctx);
    if (!lines.length) return null;
    return { type: 'p', lines, align: el ? alignOf(el) || soleImageAlign(el) : '' };
  }

  function headingBlock(el, ctx) {
    const marker = ctx.markers.get(el) || '';
    const inline = inlineMarkdown(Array.from(el.childNodes), ctx, ctx.inCell ? STRONG : null);
    const text = inline.split(BR).map(s => s.trim()).filter(Boolean).join(' ');
    if (!text) return [];
    if (ctx.inCell) return [{ type: 'p', lines: [marker + text] }];
    const level = parseInt(el.tagName.slice(1), 10);
    // Un « # » en fin de titre en serait la clôture.
    return [{ type: 'h', lines: ['#'.repeat(level) + ' ' + marker + text.replace(/#+$/, m => '\\' + m)], align: alignOf(el) }];
  }

  function codeBlock(pre) {
    const lines = ExportCommon.codeLinesOf(pre);
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    const language = (Array.from(pre.querySelectorAll('code')).map(c => c.className).join(' ').match(/(?:^|\s)language-([\w+#.-]+)/) || [])[1] || '';
    let n = 3;
    (lines.join('\n').match(/`{3,}/g) || []).forEach(run => { if (run.length >= n) n = run.length + 1; });
    const fence = '`'.repeat(n);
    return [{ type: 'code', lines: [fence + language].concat(lines, [fence]) }];
  }

  const ALERT_OF_COLOR = { blue: 'NOTE', green: 'TIP', purple: 'IMPORTANT', amber: 'WARNING', red: 'CAUTION', gray: 'NOTE' };
  const prefixQuote = lines => lines.map(l => (l ? '> ' + l : '>'));
  function quoteBlock(el, ctx) {
    const inner = blocksOf(el, ctx);
    return inner.length ? [{ type: 'quote', lines: prefixQuote(joinBlocks(inner)) }] : [];
  }
  function calloutBlock(el, ctx) {
    const inner = blocksOf(el, ctx);
    if (!inner.length) return [];
    return [{ type: 'quote', lines: ['> [!' + (ALERT_OF_COLOR[el.getAttribute('data-color')] || 'NOTE') + ']'].concat(prefixQuote(joinBlocks(inner))) }];
  }
  // Le bloc conditionnel d'un modèle : sa balise ouvrante, son contenu en Markdown entre deux lignes vides (sans elles, le Markdown ne serait plus lu dans une balise de bloc), sa
  // balise fermante. Un bloc vide garde ses deux balises : la condition est un réglage du modèle.
  function conditionalBlock(el, ctx) {
    const inner = joinBlocks(wrapAligned(blocksOf(el, ctx)));
    return [{ type: 'html', lines: [openTag(el, ctx)].concat(inner.length ? [''].concat(inner, ['']) : [], ['</div>']) }];
  }

  // Une liste : la puce ou le numéro de chaque item, le contenu de l'item en retrait de la largeur du signe. Deux listes qui se suivent changent de signe (- puis *, 1. puis
  // 1)) : sans cela le Markdown n'en ferait qu'une.
  function listBlock(list, ctx, previousList) {
    const ordered = list.tagName === 'OL';
    const task = list.getAttribute('data-type') === 'taskList';
    const alt = !!previousList && previousList.ordered === ordered && !previousList.alt;
    const items = Array.from(list.children).filter(c => c.tagName === 'LI');
    if (!items.length) return [];
    const start = ordered ? Math.max(0, parseInt(list.getAttribute('start') || '1', 10) || 1) : 0;
    const rendered = items.map((li, i) => {
      const marker = ordered ? (start + i) + (alt ? ') ' : '. ') : (alt ? '* ' : '- ');
      const checkbox = task ? (li.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] ') : '';
      const blocks = blocksOf(li, ctx);
      const indent = ' '.repeat(marker.length);
      const inner = joinBlocks(blocks, true);
      const lines = inner.length ? inner.map((l, k) => (k === 0 ? marker + checkbox + l : (l ? indent + l : ''))) : [(marker + checkbox).trimEnd()];
      return { lines, loose: blocks.filter(b => b.type !== 'list').length > 1 };
    });
    const loose = rendered.some(r => r.loose);
    const lines = [];
    rendered.forEach((r, i) => {
      if (i > 0 && loose) lines.push('');
      lines.push(...r.lines);
    });
    return [{ type: 'list', ordered, alt, lines }];
  }

  // --- Les tableaux ---------------------------------------------------------------------------------------------------------------------------------
  const COMPLEX_IN_CELL = 'ul, ol, pre, table, blockquote, hr, .callout, .two-columns-zone, .page-break-marker, .toc-marker, .conditional-text';
  const spanAbove1 = (cell, name) => (parseInt(cell.getAttribute(name) || '1', 10) || 1) > 1;
  const isSimpleTable = rows => rows.every(tr => ExportCommon.cellsOf(tr).every(cell => !spanAbove1(cell, 'colspan') && !spanAbove1(cell, 'rowspan') && !cell.querySelector(COMPLEX_IN_CELL)));
  function cellMarkdown(cell, ctx) {
    ctx.inCell += 1;
    const blocks = blocksOf(cell, ctx);
    ctx.inCell -= 1;
    return blocks.map(b => b.lines.join('<br>')).join('<br>');
  }
  function tableBlock(table, ctx) {
    const rows = ExportCommon.tableRows(table);
    if (!rows.length) return [];
    if (!isSimpleTable(rows)) return [{ type: 'html', lines: htmlOf(table, ctx).split('\n').map(l => l.trim()).filter(Boolean) }];
    const grid = rows.map(tr => ExportCommon.cellsOf(tr).map(cell => cellMarkdown(cell, ctx)));
    const width = Math.max(1, ...grid.map(r => r.length));
    const aligns = columnAligns(rows);
    const line = cells => '| ' + cells.concat(Array(width - cells.length).fill('')).join(' | ') + ' |';
    const rule = Array.from({ length: width }, (_, i) => ({ left: ':---', center: ':---:', right: '---:' }[aligns[i]] || '---'));
    return [{ type: 'table', lines: [line(grid[0]), line(rule)].concat(grid.slice(1).map(line)) }];
  }
  // L'alignement d'une case : le sien (style ou attribut align, ce que l'import d'un classeur écrit) ou, comme l'éditeur le range, celui de ses paragraphes et titres quand ils
  // s'accordent tous.
  const alignValue = el => {
    const a = (cssOf(el, 'text-align') || el.getAttribute('align') || '').trim().toLowerCase();
    return a === 'left' || a === 'center' || a === 'right' ? a : '';
  };
  function alignOfCell(cell) {
    const own = alignValue(cell);
    if (own) return own;
    const found = Array.from(cell.children).filter(child => /^(?:P|H[1-6])$/.test(child.tagName)).map(alignValue);
    return found.length && found[0] && found.every(a => a === found[0]) ? found[0] : '';
  }
  // Une seule règle d'alignement par colonne en Markdown : celle des cases du corps quand elles s'accordent toutes (des nombres alignés à droite), sinon celle de l'en-tête.
  function columnAligns(rows) {
    const cellRows = rows.map(tr => ExportCommon.cellsOf(tr));
    return cellRows[0].map((head, i) => {
      const body = cellRows.slice(1).map(cells => (cells[i] ? alignOfCell(cells[i]) : ''));
      return body.length && body[0] && body.every(a => a === body[0]) ? body[0] : alignOfCell(head);
    });
  }

  // Le HTML d'un morceau qu'aucun Markdown n'écrit (un tableau aux cases fusionnées ou chargées) : les balises de structure et de mise en forme, des attributs en nombre
  // réduit, jamais de ligne vide (qui ferait finir le bloc HTML), les sauts de ligne d'un code en &#10;.
  function htmlAttrs(el, names) {
    return names.map(name => (el.hasAttribute(name) && el.getAttribute(name) ? ' ' + name + '="' + escapeAttr(el.getAttribute(name)) + '"' : '')).join('');
  }
  function htmlOf(node, ctx) {
    // « {{ » du texte n'est pas une variable : une accolade en référence de caractère (la barre oblique inverse ne protège rien dans du HTML).
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(collapse(node.nodeValue)).replace(/\{\{/g, '&#123;{');
    if (node.nodeType !== Node.ELEMENT_NODE || node.hasAttribute('data-pdf-skip')) return '';
    const tag = node.tagName;
    const cl = node.classList;
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'TEMPLATE' || tag === 'INPUT' || tag === 'LABEL') return '';
    if (ctx.template && isAtom(node)) return atomPiece(node, ctx, true);
    if (cl.contains('page-number-badge') || cl.contains('page-break-marker') || cl.contains('heading-numbering-config') || cl.contains('toc-marker')) return '';
    if (cl.contains('footnote-ref-marker')) return '<sup>(' + escapeHtml(collapse(node.getAttribute('data-note-text') || '')) + ')</sup>';
    if (tag === 'BR') return '<br>';
    if (tag === 'HR') return '\n<hr>\n';
    if (tag === 'IMG') {
      if (ctx.template && isMergeImage(node)) return mergeImageHtml(node, ctx);
      if (node.getAttribute('data-layer') === 'behind' || PageLayer.isRepeatedEl(node)) return '';
      const info = ctx.images.get(node);
      if (!info || info.skip) return '';
      const width = shownWidthOf(node);
      return '<img src="' + escapeAttr(info.src) + '" alt="' + escapeAttr(node.getAttribute('alt') || '') + '"' + (width ? ' width="' + escapeAttr(width) + '"' : '') + '>';
    }
    if (tag === 'PRE') return '\n<pre>' + escapeHtml(ExportCommon.codeLinesOf(node).join('\n')).replace(/\n/g, '&#10;') + '</pre>\n';
    if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') return '<code>' + escapeHtml(collapse(node.textContent)) + '</code>';
    const inner = () => Array.from(node.childNodes).map(child => htmlOf(child, ctx)).join('');
    if (ctx.template && cl.contains('conditional-text')) return '\n' + openTag(node, ctx) + inner() + '</div>\n';
    if (ctx.template && cl.contains('conditional-value')) return openTag(node, ctx) + inner() + '</span>';
    if (tag === 'TABLE' || tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT' || tag === 'TR') {
      return '\n<' + tag.toLowerCase() + '>' + inner() + '\n</' + tag.toLowerCase() + '>\n';
    }
    if (tag === 'TD' || tag === 'TH') {
      const span = ['colspan', 'rowspan'].map(name => (spanAbove1(node, name) ? ' ' + name + '="' + parseInt(node.getAttribute(name), 10) + '"' : '')).join('');
      const align = alignOfCell(node);
      const background = cssOf(node, 'background-color').trim();
      return '\n<' + tag.toLowerCase() + span + (align ? ' align="' + align + '"' : '') + (background ? ' style="background-color: ' + escapeAttr(background) + '"' : '') + '>' + inner() + '</' + tag.toLowerCase() + '>\n';
    }
    if (tag === 'UL' || tag === 'OL') {
      const open = tag === 'OL' && node.getAttribute('start') && node.getAttribute('start') !== '1' ? '<ol start="' + escapeAttr(node.getAttribute('start')) + '">' : '<' + tag.toLowerCase() + '>';
      const task = node.getAttribute('data-type') === 'taskList';
      const items = Array.from(node.children).filter(c => c.tagName === 'LI').map(li => '\n<li>' + (task ? (li.getAttribute('data-checked') === 'true' ? '&#9745; ' : '&#9744; ') : '') + Array.from(li.childNodes).map(child => htmlOf(child, ctx)).join('') + '</li>');
      return '\n' + open + items.join('') + '\n</' + tag.toLowerCase() + '>\n';
    }
    if (tag === 'LI') return '\n<li>' + inner() + '</li>\n';
    if (/^H[1-6]$/.test(tag) || tag === 'P' || tag === 'BLOCKQUOTE') {
      const name = tag === 'P' ? 'p' : tag.toLowerCase();
      return '\n<' + name + '>' + inner() + '</' + name + '>\n';
    }
    if (cl.contains('callout')) return '\n<blockquote>' + inner() + '</blockquote>\n';
    // Une marque (gras, lien, couleur...) : ses balises autour du contenu. Tout autre élément (div, colonne, span sans style) laisse passer son contenu.
    let html = inner();
    const marks = marksOf(node);
    for (let i = marks.length - 1; i >= 0; i -= 1) {
      const m = marks[i];
      html = m.link ? '<a href="' + escapeAttr(m.link.href) + '"' + (m.link.title ? ' title="' + escapeAttr(m.link.title) + '"' : '') + '>' + html + '</a>' : m.html[0] + html + m.html[1];
    }
    return html;
  }

  // --- Le sommaire ----------------------------------------------------------------------------------------------------------------------------------
  // La cible d'un titre, comme GitHub l'écrit : minuscules, sans ponctuation, tirets à la place des blancs, un numéro derrière le deuxième titre identique.
  function slugger() {
    const seen = new Map();
    return text => {
      const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '').replace(/ /g, '-');
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      return count ? base + '-' + count : base;
    };
  }
  // Les titres du corps (les enfants directs de la racine, comme le PDF et le Word), leur marqueur « 1) » et leur cible.
  function headingsOf(root) {
    const config = root.querySelector(':scope > .heading-numbering-config');
    const style = (config && config.dataset.style) || 'none';
    const elements = Array.from(root.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
    const markers = HeadingNumbering.markersFor(elements, style);
    const slug = slugger();
    const markerOf = new Map();
    const entries = [];
    elements.forEach((el, i) => {
      markerOf.set(el, markers[i]);
      const text = (markers[i] + (el.textContent || '')).replace(/\s+/g, ' ').trim();
      if (!(el.textContent || '').trim()) return;
      entries.push({ level: parseInt(el.tagName.slice(1), 10), text, slug: slug(text) });
    });
    return { markerOf, entries };
  }
  function tocBlocks(ctx) {
    const title = { type: 'p', lines: ['**' + I18n.t('pdf.tocTitle') + '**'] };
    if (!ctx.toc.length) return [title, { type: 'p', lines: ['*' + I18n.t('markdown.tocEmpty') + '*'] }];
    // Le retrait suit la profondeur réelle (un titre 1 puis un titre 3 n'est qu'un cran plus loin), jamais l'écart des niveaux : quatre blancs de plus feraient un bloc de code.
    const stack = [];
    const lines = ctx.toc.map(entry => {
      while (stack.length && stack[stack.length - 1] >= entry.level) stack.pop();
      const depth = stack.length;
      stack.push(entry.level);
      return '  '.repeat(depth) + '- [' + escapeText(entry.text, { inLink: 1, inCell: 0 }) + '](#' + entry.slug + ')';
    });
    return [title, { type: 'list', ordered: false, alt: false, lines }];
  }

  // --- Le parcours des blocs ----------------------------------------------------------------------------------------------------------------------------
  function blockFor(el, ctx, previousList) {
    const cl = el.classList;
    const tag = el.tagName;
    if (el.hasAttribute('data-pdf-skip')) return [];
    if (cl.contains('heading-numbering-config')) return [];
    if (cl.contains('page-break-marker')) return ctx.inCell ? [] : [{ type: 'html', lines: ['<div style="page-break-after: always;"></div>'] }];
    if (cl.contains('toc-marker')) return ctx.inCell ? [] : tocBlocks(ctx);
    if (ctx.template && cl.contains('conditional-text')) return conditionalBlock(el, ctx);
    if (cl.contains('callout')) return calloutBlock(el, ctx);
    if (tag === 'TABLE') return tableBlock(el, ctx);
    if (tag === 'UL' || tag === 'OL') return listBlock(el, ctx, previousList);
    if (tag === 'PRE') return codeBlock(el);
    if (tag === 'BLOCKQUOTE') return quoteBlock(el, ctx);
    if (tag === 'HR') return [{ type: 'hr', lines: ['---'] }];
    if (/^H[1-6]$/.test(tag)) return headingBlock(el, ctx);
    if (tag === 'P' && !hasBlockChild(el)) {
      const block = paragraphBlock(Array.from(el.childNodes), ctx, el);
      return block ? [block] : [];
    }
    // Un conteneur (div, colonne, section, item hors liste) : ses blocs, à la suite ; son alignement passe aux paragraphes et titres qui n'ont pas le leur.
    const blocks = blocksOf(el, ctx);
    const align = alignOf(el);
    if (align) blocks.forEach(b => { if ((b.type === 'p' || b.type === 'h') && !b.align) b.align = align; });
    return blocks;
  }

  // Les blocs des enfants d'un conteneur : les nœuds en ligne qui se suivent font un paragraphe, chaque élément de bloc le sien.
  function blocksOf(parent, ctx) {
    const blocks = [];
    let run = [];
    let previousList = null;
    const flush = () => {
      if (!run.length) return;
      const block = paragraphBlock(run, ctx, null);
      run = [];
      if (block) { blocks.push(block); previousList = null; }
    };
    Array.from(parent.childNodes).forEach(node => {
      if (!isBlockNode(node)) { run.push(node); return; }
      flush();
      const made = blockFor(node, ctx, previousList);
      made.forEach(b => blocks.push(b));
      if (made.length) previousList = made[made.length - 1].type === 'list' ? made[made.length - 1] : null;
    });
    flush();
    return blocks;
  }

  // Au niveau du document : des paragraphes ou titres voisins centrés (ou à droite) tiennent dans un seul <div align>, avec une ligne vide autour du contenu pour que le
  // Markdown y soit encore lu.
  function wrapAligned(blocks) {
    const out = [];
    for (let i = 0; i < blocks.length;) {
      const align = blocks[i].align;
      if (!align) { out.push(blocks[i]); i += 1; continue; }
      const group = [];
      while (i < blocks.length && blocks[i].align === align) { group.push(blocks[i]); i += 1; }
      out.push({ type: 'html', lines: ['<div align="' + align + '">', ''].concat(joinBlocks(group), ['', '</div>']) });
    }
    return out;
  }

  // --- Les images, lues avant l'écriture (un fichier se lit en asynchrone, l'écriture ne l'est pas) ---------------------------------------------------
  // Une adresse web reste une adresse. Une pièce jointe de Grist (son adresse porte un jeton qui s'éteint), une image « blob: » (graphique, code QR) et une adresse relative
  // n'ont pas d'adresse durable : leur fichier part dans le texte, en data URI. Une image qu'on ne peut pas lire n'est pas écrite, et le dit (ExportCommon.noteUnreadImage).
  async function readImages(roots, ctx) {
    const cache = new Map();
    const images = [];
    roots.forEach(root => root.querySelectorAll('img').forEach(img => images.push(img)));
    for (const img of images) {
      if (img.hasAttribute('data-pdf-skip')) { ctx.images.set(img, { skip: true }); continue; }
      if (ctx.template && isMergeImage(img)) continue; // sans adresse : elle est dessinée à la lecture, rien à lire ni à dire
      const src = (img.getAttribute('src') || '').trim();
      if (!src) { ExportCommon.noteImageWithoutSource(img); ctx.images.set(img, { skip: true }); continue; }
      const isAttachment = img.hasAttribute('data-attachment-id') || img.dataset.source === 'attachment' || /\/attachments\/\d+\/download/.test(src);
      if (/^data:image\//i.test(src) || (/^https?:\/\//i.test(src) && !isAttachment)) { ctx.images.set(img, { src }); continue; }
      if (!cache.has(src)) cache.set(src, ImageIo.fetchBlob(src).then(blob => ImageIo.toDataUri(blob)).catch(() => null));
      const data = await cache.get(src);
      if (data) ctx.images.set(img, { src: data });
      else { ExportCommon.noteUnreadImage(img); ctx.images.set(img, { skip: true }); }
    }
  }

  // --- Le document ------------------------------------------------------------------------------------------------------------------------------------
  // Un document inerte (HtmlSanitize.parseInert) : aucune image ne charge pendant la lecture, ce que ferait un <div> de la page (js/external-images.js). Les suggestions du suivi
  // des modifications encore en attente y sont acceptées (le texte supprimé n'y est plus) : le HTML d'une ligne les a déjà vues acceptées (ReaderMode.preview), celui d'un
  // modèle arrive tel que l'éditeur le garde.
  function rootOf(html) {
    const root = HtmlSanitize.parseInert(html || '');
    // Si la vue échoue, le document reste tel qu'il est écrit (suggestions visibles) plutôt que perdu : même repli que ReaderMode.
    try { TrackChanges.acceptedView(root, { tint: false }); } catch (e) { console.error('[markdown-export] vue « comme acceptée » impossible, les suggestions restent affichées', e); }
    return root;
  }
  const ZONES = [['header', 'default'], ['header-first', 'first'], ['footer', 'default'], ['footer-first', 'first']];
  function zonesOf(headerFooterData) {
    if (!headerFooterData || !headerFooterData.enabled) return [];
    return ZONES.map(([name, which]) => {
      const part = headerFooterData[name.startsWith('header') ? 'header' : 'footer'];
      return { name, html: part ? part[which] : '' };
    }).filter(zone => PageLayout.hasZoneContent(zone.html) && (!zone.name.endsWith('-first') || headerFooterData.differentFirstPage));
  }

  // Le Markdown d'un document déjà résolu (le HTML de ReaderMode.preview) et de ses zones d'en-tête et de pied (déjà résolues aussi, ExportCommon.resolveRecord). Avec
  // `options.template`, le HTML est celui du modèle, non résolu : ses éléments de fusion s'écrivent comme le dit l'en-tête du fichier.
  async function htmlToMarkdown(resolvedHtml, headerFooterData, options) {
    const ctx = { footnotes: [], images: new Map(), markers: new Map(), toc: [], inCell: 0, inLink: 0, template: !!(options && options.template) };
    const body = rootOf(resolvedHtml);
    // Ni ligne vide ni saut de page orphelin en fin de document.
    ReaderMode.trimTrailingBlankBlocks(body);
    const zones = zonesOf(headerFooterData).map(zone => ({ name: zone.name, root: rootOf(zone.html) }));
    await readImages([body].concat(zones.map(zone => zone.root)), ctx);
    const headings = headingsOf(body);
    ctx.markers = headings.markerOf;
    ctx.toc = headings.entries;
    const part = (name, blocks) => (name ? ['<!-- publipostage:' + name + ' -->', ''].concat(joinBlocks(blocks), ['', '<!-- /publipostage:' + name + ' -->']) : joinBlocks(blocks));
    const sections = [];
    // Les en-têtes et les pieds se lisent avec leurs propres titres : aucun n'entre dans le sommaire ni dans la numérotation du corps.
    const zoneSection = zone => { ctx.markers = new Map(); sections.push(part(zone.name, wrapAligned(blocksOf(zone.root, ctx)))); ctx.markers = headings.markerOf; };
    zones.filter(zone => zone.name.startsWith('header')).forEach(zoneSection);
    const bodyLines = part(null, wrapAligned(blocksOf(body, ctx)));
    if (bodyLines.length) sections.push(bodyLines);
    zones.filter(zone => zone.name.startsWith('footer')).forEach(zoneSection);
    if (ctx.footnotes.length) {
      sections.push(ctx.footnotes.flatMap((text, i) => {
        const [first, ...rest] = collapse(text).trim() ? String(text).split(/\r?\n/) : [''];
        return ['[^' + (i + 1) + ']: ' + escapeText(first.trim(), { inLink: 0, inCell: 0 })].concat(rest.map(l => '    ' + escapeText(l.trim(), { inLink: 0, inCell: 0 })));
      }));
    }
    const text = sections.map(lines => lines.join('\n')).filter(Boolean).join('\n\n');
    return text ? text + '\n' : '';
  }

  async function getMarkdownBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData) {
    // Le fichier garde l'adresse d'une image d'un autre site, mais le navigateur la télécharge pendant la préparation du document (ReaderMode.preview écrit son HTML dans un
    // nœud de la page) : la fenêtre liste ces sites et peut tout arrêter (js/external-images.js), comme pour le PDF, le Word et l'Excel. Un seul passage pour l'export d'une
    // ligne comme pour chaque ligne d'un lot (exportCurrentRecord passe par ici).
    await ExternalImages.confirmExport(htmlContent, headerFooterData);
    const { resolvedHtml, filename, resolvedHeaderFooterData } = await ExportCommon.resolveRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData);
    const text = await htmlToMarkdown(resolvedHtml, resolvedHeaderFooterData);
    return { blob: new Blob([text], { type: 'text/markdown;charset=utf-8' }), filename };
  }
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData) {
    if (!record) { alert(I18n.t('alert.noRecordForExportMd')); return; }
    const { blob, filename } = await getMarkdownBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData);
    ExportCommon.downloadBlob(blob, (filename || 'publipostage') + '.md');
  }

  // Le modèle lui-même (« Markdown (modèle) ») : le HTML et les en-têtes et pieds que l'éditeur garde, aucune ligne. Le fichier porte le nom du modèle.
  async function getMarkdownBlobForTemplate(htmlContent, headerFooterData, name) {
    const text = await htmlToMarkdown(htmlContent, headerFooterData, { template: true });
    return { blob: new Blob([text], { type: 'text/markdown;charset=utf-8' }), filename: name };
  }
  async function exportTemplate(htmlContent, headerFooterData, name) {
    const { blob, filename } = await getMarkdownBlobForTemplate(htmlContent, headerFooterData, name);
    ExportCommon.downloadBlob(blob, (filename || 'publipostage') + '.md');
  }

  return { exportCurrentRecord, getMarkdownBlobForRecord, exportTemplate, getMarkdownBlobForTemplate, htmlToMarkdown };
})();
