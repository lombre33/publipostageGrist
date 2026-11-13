// Import HTML : un fichier .html (une page web enregistrée, un export de Word « Page web », un export HTML du widget) devient le HTML de l'éditeur d'un nouveau document, sans nom et pas encore
// enregistré (js/main-import.js:onImportHtml, comme « Importer un Markdown… »). Rien n'est lu par une bibliothèque : le navigateur lit le HTML (DOMParser, document inerte : rien ne charge ni ne s'exécute),
// HtmlSanitize assainit l'ARBRE d'abord (liste blanche de balises, ni script, ni style, ni svg), puis ce module le remet dans la forme que l'éditeur écrit lui-même ; le schéma de l'éditeur reste le dernier
// filtre. L'ordre compte : convertir un arbre brut (clean(root.innerHTML)) perdrait le texte qui suit une balise forgée.
//
// Ce qu'il reprend :
//  - les couleurs et la mise en forme des FEUILLES DE STYLE de la page (choix du 13/11 : oui) : la cascade (spécificité, ordre, !important, style en ligne) est calculée sur une feuille que le navigateur lit sans la poser
//    (`new CSSStyleSheet()`), puis recopiée en marques de texte : couleur, taille (px et pt seulement : un « 2em » donnerait un titre géant), fond, gras, italique, souligné, barré, alignement, fond de case de tableau ;
//    une couleur illisible (clair sur fond blanc) est écartée, une taille est tenue entre 6 et 200 px ; ce qu'une règle cache (`display: none`) est retiré ;
//  - le menu, la colonne latérale, l'en-tête et le pied du site : gardés comme du texte (choix du 13/11 : tout garder), et dits dans le compte rendu ;
//  - les listes de Word « Page web » (les puces `mso-list:Ignore` redeviennent de vraies listes, avec leurs niveaux) ;
//  - ce que l'export HTML du widget (js/html-export.js, classes `pp-*`) a écrit : encadrés, listes à cases, sommaire, notes de bas de page, colonnes, légendes, signets, en-tête et pied, images alignées ;
//  - les images : une adresse web (gardée telle quelle : js/external-images.js ne la charge qu'après « Afficher ») ou une data URI ; une adresse relative (le fichier d'à côté n'est pas envoyé avec le texte) est dite par
//    un mot à la place, comme l'import Markdown ; les pixels d'un pixel (suivi) sont retirés ;
//  - {{Table.Colonne}} dans le texte : la bulle de la variable quand la colonne existe dans ce document, du texte (et un compte) sinon.
// Ce qu'il ne garde pas : les programmes, les cadres et médias intégrés, les dessins SVG, les champs de formulaire (les intitulés restent), les liens vers une autre page du site (leur texte reste), les polices.
// Le fichier ne donne ni le nom du modèle (le document reste « sans nom »), ni sa page : seul le document est repris, plus l'en-tête et le pied d'un export du widget.
const HtmlImport = (function () {
  // Au-delà, la page ne tiendrait pas le document (le navigateur, puis l'éditeur, lisent tout en mémoire).
  const MAX_BYTES = 10 * 1024 * 1024;
  // Le texte posé dans l'éditeur coûte cher (mesuré le 13/11 : 2 Mo de texte 5 s, 6 Mo 62 s) : une page qui dépasse ce nombre de caractères de texte est refusée, avec ce que l'éditeur peut tenir.
  const MAX_TEXT = 2000000;
  // La lecture des feuilles de style ne tient pas la page : au-delà de ce texte ou de ce temps, le reste est laissé (dit dans le compte rendu).
  const MAX_CSS = 3 * 1024 * 1024;
  const CSS_BUDGET_MS = 2000;
  const MIN_SIZE_PX = 6;
  const MAX_SIZE_PX = 200;
  // Un texte plus clair que ça sur son fond (blanc quand la page n'en dit pas un autre que l'éditeur reprendrait) n'est pas lisible : la couleur est écartée.
  const MIN_CONTRAST = 1.6;

  // Les genres du compte rendu, dans l'ordre de la fenêtre (`html.import.report.<genre>`).
  const REPORT_KEYS = ['imagesRelative', 'imagesExternal', 'pixels', 'relativeLinks', 'embedded', 'svg', 'formFields', 'scripts', 'navigation', 'hidden', 'relativeSizes', 'stylesUnread', 'variables'];

  // Les erreurs que la personne peut corriger (mauvais fichier) : `code` dit laquelle (js/main-import.js:reportHtmlImportError).
  const fail = (code, extra) => Object.assign(new Error('Import HTML : ' + code), { code }, extra);

  // --- Le fichier -------------------------------------------------------------------------------------------------------------------------------
  // UTF-8 (avec ou sans BOM), UTF-16 avec BOM, le jeu que la page déclare (<meta charset> ou Content-Type : un Word « Page web » est en Windows-1252), sinon UTF-8 strict puis Windows-1252 : aucun octet n'est perdu
  // en silence. Un octet nul hors UTF-16 est un fichier binaire.
  function declaredCharset(bytes) {
    const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 4096));
    const found = /<meta[^>]+charset\s*=\s*["']?\s*([\w:.-]+)/i.exec(head);
    return found ? found[1].toLowerCase() : '';
  }
  function decode(bytes) {
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    if (bytes.indexOf(0) !== -1) throw fail('unreadable');
    const label = declaredCharset(bytes);
    if (label && !/^utf-?8$/.test(label)) {
      try { return new TextDecoder(label).decode(bytes); } catch (e) { /* un jeu que le navigateur ne connaît pas : la lecture d'au-dessous */ }
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }
  async function readText(file) {
    if (file.size > MAX_BYTES) throw fail('tooBig', { size: file.size, max: MAX_BYTES });
    return decode(new Uint8Array(await file.arrayBuffer()));
  }

  // --- Petits outils ---------------------------------------------------------------------------------------------------------------------------
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'BLOCKQUOTE', 'PRE', 'HR', 'DIV', 'CENTER', 'FIGURE',
    'FIGCAPTION', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'NAV', 'MAIN', 'ADDRESS', 'DL', 'DT', 'DD']);
  const ALIGN_BOXES = new Set(['LI', 'TD', 'TH', 'DIV', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'MAIN', 'FIGURE', 'CENTER', 'NAV', 'ADDRESS', 'FIGCAPTION']);
  const isBlank = node => node.nodeType === TEXT_NODE && !node.nodeValue.trim();
  const isParagraphLike = el => /^(?:P|H[1-6])$/.test(el.tagName);
  // Les éléments que ce module écrit lui-même (formes de l'éditeur) : leurs attributs ne sont pas ceux de la page, le rangement final les laisse.
  let made = new WeakSet();
  function make(doc, tag, attrs) {
    const node = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(name => node.setAttribute(name, attrs[name]));
    made.add(node);
    return node;
  }
  function unwrap(node) { node.replaceWith(...Array.from(node.childNodes)); }

  // Une couleur CSS en « #rrggbb » : le navigateur la lit (noms, rgb(), hsl()...). null pour tout ce qui n'est pas une couleur pleine : transparente, calculée (var(), calc()), héritée, dégradé.
  let colorContext = null;
  const colorCache = new Map();
  function normalizeColor(value) {
    const text = String(value == null ? '' : value).trim().toLowerCase();
    if (!text || text.length > 60 || /var\(|inherit|initial|unset|revert|currentcolor|transparent|calc|url|gradient/.test(text)) return null;
    if (colorCache.has(text)) return colorCache.get(text);
    let out = null;
    try {
      if (!colorContext) colorContext = document.createElement('canvas').getContext('2d');
      // Deux fonds de départ : une valeur que le navigateur refuse laisse le fond de départ (qui diffère d'un essai à l'autre).
      colorContext.fillStyle = '#000001'; colorContext.fillStyle = text; const firstTry = colorContext.fillStyle;
      colorContext.fillStyle = '#000002'; colorContext.fillStyle = text; const secondTry = colorContext.fillStyle;
      if (firstTry === secondTry && /^#[0-9a-f]{6}$/.test(firstTry)) out = firstTry;
    } catch (e) { out = null; }
    colorCache.set(text, out);
    return out;
  }
  // Une taille en points de l'éditeur (ses tailles sont en pt) : « 16px » -> « 12pt ». null hors px et pt ; `relative` : une taille relative (em, %, rem, mot) que l'éditeur ne reprend pas.
  function sizeOf(value) {
    const found = /^\s*(\d*\.?\d+)\s*(px|pt)\s*$/i.exec(String(value || ''));
    if (!found) return { size: null, relative: !!String(value || '').trim() && !/^(?:inherit|initial|unset|revert|normal)/i.test(String(value)) };
    const px = parseFloat(found[1]) * (found[2].toLowerCase() === 'pt' ? 4 / 3 : 1);
    if (!(px >= MIN_SIZE_PX)) return { size: null, relative: false };
    return { size: (Math.round(Math.min(px, MAX_SIZE_PX) * 0.75 * 2) / 2) + 'pt', relative: false };
  }

  // --- Les feuilles de style ----------------------------------------------------------------------------------------------------------------
  // Les propriétés que l'éditeur sait porter, plus celles qui décident de ce qui est vu (display, visibility) et la position d'une image (float).
  const PROPS = ['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'text-decoration-line', 'text-decoration', 'text-align', 'display', 'visibility', 'float'];
  const INLINE_SPEC = 1e9;
  const SKIPPED_SELECTOR = /::|:(?:hover|focus|focus-within|focus-visible|active|visited|target|checked|disabled|enabled|placeholder-shown)\b/;

  // Les sélecteurs d'une liste « a, b:not(c, d), e » : séparés aux virgules de premier niveau.
  function splitSelectors(text) {
    const parts = [];
    let depth = 0; let quote = ''; let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) { if (ch === quote && text[i - 1] !== '\\') quote = ''; } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(' || ch === '[') depth += 1; else if (ch === ')' || ch === ']') depth -= 1;
      else if (ch === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
    }
    parts.push(text.slice(start));
    return parts.map(part => part.trim()).filter(Boolean);
  }
  // La spécificité d'un sélecteur (identifiants, classes et attributs et pseudo-classes, balises), approchée : :where() compte zéro, :is() :not() :has() comptent leurs arguments.
  function specificityOf(selector) {
    let text = selector.replace(/\[[^\]]*\]/g, ' [a] ').replace(/:where\([^)]*\)/g, '').replace(/:(?:is|not|has|matches)\(([^)]*)\)/g, ' $1 ');
    const ids = (text.match(/#[\w-]+/g) || []).length;
    const classes = (text.match(/\.[\w-]+|\[a\]|:(?!:)[\w-]+(?:\([^)]*\))?/g) || []).length;
    text = text.replace(/::?[\w-]+(?:\([^)]*\))?/g, ' ').replace(/[#.][\w-]+|\[a\]/g, ' ');
    const tags = (text.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
    return ids * 10000 + classes * 100 + tags;
  }
  // Ce que la page contient : classes, identifiants et balises. Un sélecteur dont le dernier élément cite une classe, un identifiant ou une balise absents ne peut rien trouver : il n'est pas cherché.
  function vocabularyOf(root) {
    const vocabulary = { classes: new Set(), ids: new Set(), tags: new Set() };
    root.querySelectorAll('*').forEach((el) => {
      vocabulary.tags.add(el.localName);
      if (el.id) vocabulary.ids.add(el.id);
      el.classList.forEach(name => vocabulary.classes.add(name));
    });
    return vocabulary;
  }
  function mayMatch(selector, vocabulary) {
    const last = selector.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').split(/[\s>+~]+/).filter(Boolean).pop() || '';
    const classes = last.match(/\.[\w-]+/g) || [];
    if (classes.some(name => !vocabulary.classes.has(name.slice(1)))) return false;
    const ids = last.match(/#[\w-]+/g) || [];
    if (ids.some(name => !vocabulary.ids.has(name.slice(1)))) return false;
    const tag = /^[a-zA-Z][\w-]*/.exec(last);
    return !tag || vocabulary.tags.has(tag[0].toLowerCase());
  }

  // La déclaration gagnante de chaque propriété, élément par élément : une plus importante (!important), puis plus spécifique, puis plus tardive.
  function addDeclaration(table, el, prop, value, spec, order, important) {
    let entry = table.get(el);
    if (!entry) { entry = {}; table.set(el, entry); }
    const current = entry[prop];
    if (current && (current.important !== important ? current.important : current.spec !== spec ? current.spec > spec : current.order > order)) return;
    entry[prop] = { value, spec, order, important };
  }

  // Les règles de l'écran (sans condition, `all`, `screen`), dans l'ordre ; les règles d'une autre condition (largeur, impression) ne sont pas lues.
  function styleRulesOf(rules, out) {
    Array.from(rules).forEach((rule) => {
      if (rule instanceof CSSStyleRule) { out.push(rule); return; }
      if (rule instanceof CSSMediaRule) {
        const media = rule.media.mediaText.trim().toLowerCase();
        if (!media || media === 'all' || media === 'screen') styleRulesOf(rule.cssRules, out);
        return;
      }
      if ((rule instanceof CSSSupportsRule) || (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule)) styleRulesOf(rule.cssRules, out);
    });
  }

  // Ce que la page dit d'un élément qu'elle ne dit pas par une règle : `align`, `bgcolor`, <center>, <font color>, <mark> (de la plus faible priorité).
  function presentationalHints(root, table) {
    const hint = (el, prop, value) => { if (value) addDeclaration(table, el, prop, value, 0, -1, false); };
    root.querySelectorAll('[align], [bgcolor], center, font, mark').forEach((el) => {
      const align = (el.getAttribute('align') || '').trim().toLowerCase();
      if (el.localName === 'center') hint(el, 'text-align', 'center');
      else if (/^(?:left|right|center|justify)$/.test(align) && el.localName !== 'img' && el.localName !== 'table') hint(el, 'text-align', align);
      if (el.hasAttribute('bgcolor')) hint(el, 'background-color', el.getAttribute('bgcolor'));
      if (el.localName === 'font') hint(el, 'color', el.getAttribute('color'));
      if (el.localName === 'mark') hint(el, 'background-color', '#ffff00');
    });
  }

  // Le tableau des déclarations de la page : Map(élément -> { propriété: { value, spec, order, important } }), le style en ligne comprenant.
  function declarationsOf(root, cssText, report) {
    const table = new Map();
    presentationalHints(root, table);
    const text = String(cssText || '').replace(/@import[^;]*;/gi, '');
    if (text.length > MAX_CSS) report.stylesUnread = 1;
    let sheet = null;
    if (text.trim()) {
      try { sheet = new CSSStyleSheet(); sheet.replaceSync(text.slice(0, MAX_CSS)); } catch (e) { sheet = null; report.stylesUnread = 1; }
    }
    if (sheet) {
      const rules = [];
      styleRulesOf(sheet.cssRules, rules);
      const vocabulary = vocabularyOf(root);
      const started = performance.now();
      for (let i = 0; i < rules.length; i += 1) {
        if (performance.now() - started > CSS_BUDGET_MS) { report.stylesUnread = 1; break; }
        const rule = rules[i];
        const declared = [];
        PROPS.forEach((prop) => {
          const value = rule.style.getPropertyValue(prop);
          if (value) declared.push([prop, value.trim(), rule.style.getPropertyPriority(prop) === 'important']);
        });
        if (!declared.length) continue;
        splitSelectors(rule.selectorText).forEach((selector) => {
          if (SKIPPED_SELECTOR.test(selector) || !mayMatch(selector, vocabulary)) return;
          let found = [];
          try { found = Array.from(root.querySelectorAll(selector)); } catch (e) { return; }
          if (!found.length) return;
          const spec = specificityOf(selector);
          found.forEach(el => declared.forEach(([prop, value, important]) => addDeclaration(table, el, prop, value, spec, i, important)));
        });
      }
    }
    // Le style en ligne gagne sur toute règle, sauf un !important de la feuille.
    root.querySelectorAll('[style]').forEach((el) => {
      PROPS.forEach((prop) => {
        const value = el.style.getPropertyValue(prop);
        if (value) addDeclaration(table, el, prop, value.trim(), INLINE_SPEC, Number.MAX_SAFE_INTEGER, el.style.getPropertyPriority(prop) === 'important');
      });
    });
    return table;
  }

  // Ce que l'éditeur retient d'un élément : { color, bg (fond du texte), fill (fond d'une case, ou d'une ligne de tableau), size, bold, italic, under, strike, align, float, hidden }. Une propriété que la page
  // ne dit pas (ou que l'éditeur ne porte pas) est absente. Un lien garde le style de lien de l'éditeur : ni sa couleur, ni sa taille.
  const BG_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'SPAN', 'MARK', 'STRONG', 'B', 'EM', 'I', 'U', 'CODE', 'SMALL', 'FONT', 'SUB', 'SUP', 'KBD', 'BLOCKQUOTE']);
  const FILL_TAGS = new Set(['TD', 'TH', 'TR', 'THEAD', 'TBODY', 'TFOOT']);
  function ownOf(el, declared, report) {
    const own = {};
    const value = prop => (declared[prop] ? declared[prop].value : '');
    const lower = prop => value(prop).toLowerCase();
    if (/^none\b/.test(lower('display')) || /^(?:hidden|collapse)\b/.test(lower('visibility'))) { own.hidden = true; return own; }
    const tag = el.tagName;
    if (tag === 'IMG') { const float = lower('float'); if (float === 'left' || float === 'right') own.float = float; return own; }
    const background = normalizeColor(value('background-color'));
    if (background && BG_TAGS.has(tag)) own.bg = background;
    if (background && FILL_TAGS.has(tag)) own.fill = background;
    const align = lower('text-align').replace(/^-(?:webkit|moz)-/, '');
    if (/^(?:left|right|center|justify)$/.test(align)) own.align = align;
    if (tag === 'A') return own;
    const color = normalizeColor(value('color'));
    if (color) own.color = color;
    if (value('font-size')) {
      const { size, relative } = sizeOf(value('font-size'));
      if (relative) report.relativeSizes = (report.relativeSizes || 0) + 1;
      // La taille d'un titre est celle de son niveau dans l'éditeur (js/heading-styles.js) : la reprendre la ferait diverger du style du document.
      else if (size && !/^H[1-6]$/.test(tag)) own.size = size;
    }
    const weight = lower('font-weight');
    if (weight) own.bold = weight === 'bold' || weight === 'bolder' || parseInt(weight, 10) >= 600;
    const style = lower('font-style');
    if (style) own.italic = style === 'italic' || style === 'oblique';
    const line = lower('text-decoration-line') || lower('text-decoration');
    if (line) { own.under = /underline/.test(line); own.strike = /line-through/.test(line); }
    return own;
  }

  // Le texte dont la couleur ne se lirait pas sur son fond (le fond d'une page n'est pas repris : celui de l'éditeur est blanc) garde la couleur de l'éditeur.
  const readable = (color, back) => !color || ColorMath.contrast(color, back || '#ffffff') >= MIN_CONTRAST;

  // Le style d'un texte, en une seule marque de style (une marque de style imbriquée dans une autre REMPLACE la première chez ProseMirror : la taille d'un bloc serait perdue sous la couleur d'un mot) et les
  // balises de gras, italique, souligné, barré : le texte est enveloppé une fois, avec le style effectif de tous ses ancêtres.
  function wrapText(node, eff) {
    const doc = node.ownerDocument;
    const chain = [];
    const parent = node.parentElement;
    if (eff.bold && !(parent && parent.closest('b, strong, th'))) chain.push(['strong']);
    if (eff.italic && !(parent && parent.closest('i, em'))) chain.push(['em']);
    if (eff.under && !(parent && parent.closest('u'))) chain.push(['u']);
    if (eff.strike && !(parent && parent.closest('s, strike, del'))) chain.push(['s']);
    const style = [];
    const color = readable(eff.color, eff.bg || eff.fill) ? eff.color : null;
    if (color) style.push('color: ' + color);
    if (eff.size) style.push('font-size: ' + eff.size);
    if (eff.bg) style.push('background-color: ' + eff.bg);
    if (style.length) chain.push(['span', style.join('; ')]);
    if (!chain.length) return;
    let outer = null; let leaf = null;
    chain.forEach(([tag, css]) => {
      const el = doc.createElement(tag);
      if (css) el.setAttribute('style', css);
      if (leaf) leaf.appendChild(el); else outer = el;
      leaf = el;
    });
    node.replaceWith(outer);
    leaf.appendChild(node);
  }

  // Du texte et des éléments « en ligne » posés directement dans une case, un item, un bloc : rangés en paragraphes pour que l'alignement ait où se poser ; une image seule se centre ou se met à droite par
  // son propre réglage (`imageAlign`).
  function wrapAlignRuns(box, align, imageAlign) {
    const doc = box.ownerDocument;
    let run = [];
    const flush = () => {
      const kept = run.filter(node => !isBlank(node));
      if (kept.length === 1 && kept[0].nodeName === 'IMG') imageAlign.set(kept[0], align === 'justify' ? 'left' : align);
      else if (kept.length) {
        const p = make(doc, 'p', { style: 'text-align: ' + align });
        run[0].before(p);
        run.forEach(node => p.appendChild(node));
      }
      run = [];
    };
    Array.from(box.childNodes).forEach((node) => {
      const inline = node.nodeType === TEXT_NODE || (node.nodeType === ELEMENT_NODE && !BLOCK_TAGS.has(node.tagName) && !node.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, table, div, blockquote, pre'));
      if (inline) run.push(node); else flush();
    });
    flush();
  }

  // Descend les propriétés de texte des blocs aux caractères : l'éditeur les range en marques (une couleur sur <p> ou <td> n'existe pas chez lui).
  function styleText(root, table, report, imageAlign) {
    const resolved = new Map();
    table.forEach((declared, el) => resolved.set(el, ownOf(el, declared, report)));
    // Ce que la page cache n'est pas du texte.
    let hidden = 0;
    resolved.forEach((own, el) => { if (own.hidden && el !== root && root.contains(el)) { hidden += 1; el.remove(); } });
    if (hidden) report.hidden = hidden;
    const walk = (el, parentEff) => {
      const own = resolved.get(el);
      let eff = parentEff;
      if (own) {
        eff = Object.assign({}, parentEff);
        ['color', 'bg', 'fill', 'size', 'bold', 'italic', 'under', 'strike', 'align'].forEach((prop) => { if (own[prop] !== undefined) eff[prop] = own[prop]; });
        // Le gras d'un titre est celui de son niveau.
        if (/^H[1-6]$/.test(el.tagName)) eff.bold = false;
      }
      const tag = el.tagName;
      if ((tag === 'TD' || tag === 'TH') && eff.fill) el.style.backgroundColor = eff.fill;
      const align = eff.align === 'center' || eff.align === 'right' || eff.align === 'justify' ? eff.align : '';
      if (align && isParagraphLike(el)) el.style.textAlign = align;
      else if (align && ALIGN_BOXES.has(tag)) wrapAlignRuns(el, align, imageAlign);
      const styled = eff.color || eff.size || eff.bg || eff.bold || eff.italic || eff.under || eff.strike;
      Array.from(el.childNodes).forEach((child) => {
        if (child.nodeType === TEXT_NODE) { if (styled && child.nodeValue.trim()) wrapText(child, eff); return; }
        if (child.nodeType === ELEMENT_NODE) walk(child, eff);
      });
      // Les balises qui n'ont d'effet que par leur style (span, font, mark) : leur style est descendu aux caractères, elles s'effacent (deux marques de style imbriquées se remplacent).
      if (/^(?:SPAN|FONT|MARK)$/.test(tag) && el !== root) unwrap(el);
    };
    // Le style de la racine (<body>, ou le bloc d'un export du widget) n'est pas repris : c'est celui de la page, pas du document.
    Array.from(root.childNodes).forEach((child) => { if (child.nodeType === ELEMENT_NODE) walk(child, {}); });
    // Les images portent leur position : float.
    resolved.forEach((own, el) => { if (own.float && el.localName === 'img') imageAlign.set(el, own.float); });
  }

  // --- Les listes de Word « Page web » -----------------------------------------------------------------------------------------------------
  // Un paragraphe de liste de Word porte sa puce dans <span style="mso-list:Ignore"> (« · », « o », « 1. ») et son niveau dans son style (`mso-list:l0 level2 lfo1`) : les paragraphes qui se suivent
  // redeviennent une liste à puces ou numérotée, imbriquée selon le niveau. Les blancs entre deux paragraphes ne coupent pas la liste.
  const MSO_IGNORE = /mso-list\s*:\s*ignore/i;
  // Le niveau d'un paragraphe de liste : `level2` de son style `mso-list`, sinon son retrait à gauche (36 pt par niveau chez Word), sinon 1.
  function wordLevelOf(p) {
    const style = p.getAttribute('style') || '';
    const named = /level(\d+)/i.exec(style);
    if (named) return Math.max(1, Math.min(9, parseInt(named[1], 10)));
    const margin = /margin-left\s*:\s*([\d.]+)(pt|cm|in|px)/i.exec(style);
    if (!margin) return 1;
    const points = parseFloat(margin[1]) * ({ pt: 1, cm: 28.35, in: 72, px: 0.75 })[margin[2].toLowerCase()];
    return Math.max(1, Math.min(9, Math.round(points / 36)));
  }
  function wordLists(root, table) {
    const items = [];
    const seen = new Set();
    root.querySelectorAll('span[style]').forEach((marker) => {
      if (!MSO_IGNORE.test(marker.getAttribute('style') || '')) return;
      const p = marker.closest('p, div, li');
      if (!p || p.localName === 'li' || seen.has(p)) return;
      seen.add(p);
      items.push({ p, marker });
    });
    if (!items.length) return 0;
    const doc = root.ownerDocument;
    let stack = [];
    let previous = null;
    items.forEach(({ p, marker }) => {
      // Un paragraphe qui ne suit pas le précédent (un autre élément entre les deux) ouvre une autre liste.
      let between = previous ? previous.nextSibling : null;
      while (between && (isBlank(between) || between.nodeType === 8)) between = between.nextSibling;
      if (!previous || between !== p) stack = [];
      const level = wordLevelOf(p);
      const markText = marker.textContent.replace(/[\s ]+/g, '');
      const ordered = /^\(?(?:\d+|[a-zA-Z]{1,4})[.)]$/.test(markText);
      marker.remove();
      const li = make(doc, 'li');
      const own = table.get(p);
      if (own) table.set(li, own);
      while (p.firstChild) li.appendChild(p.firstChild);
      while (stack.length && stack[stack.length - 1].level > level) stack.pop();
      if (stack.length && stack[stack.length - 1].level === level && stack[stack.length - 1].ordered !== ordered) stack.pop();
      if (!stack.length || stack[stack.length - 1].level < level) {
        const list = doc.createElement(ordered ? 'ol' : 'ul');
        if (stack.length) stack[stack.length - 1].last.appendChild(list); else p.before(list);
        stack.push({ level, ordered, list, last: li });
      }
      const top = stack[stack.length - 1];
      top.list.appendChild(li);
      top.last = li;
      previous = p;
    });
    // Les paragraphes restent en place (vides) jusqu'ici : le suivant retrouve le précédent comme voisin.
    items.forEach(({ p }) => p.remove());
    return items.length;
  }

  // --- Ce que l'export HTML du widget a écrit ----------------------------------------------------------------------------------------------
  // js/html-export.js écrit un document REMPLI (les variables y sont déjà leur valeur) dans des classes `pp-*` : chacune redevient la forme de l'éditeur, dans l'autre sens. Les éléments sont recréés (`make`),
  // jamais modifiés : ce qui reste de la page est assaini comme le reste.
  function mapWidgetExport(root, report, imageAlign) {
    const doc = root.ownerDocument;
    const zones = { header: '', footer: '' };
    const kids = (el, tag, attrs) => { const out = make(doc, tag, attrs); while (el.firstChild) out.appendChild(el.firstChild); return out; };
    root.querySelectorAll('nav.pp-toc').forEach(nav => nav.replaceWith(make(doc, 'div', { class: 'toc-marker' })));
    root.querySelectorAll('.pp-callout').forEach((callout) => {
      const attrs = { class: 'callout', role: 'note' };
      if (callout.getAttribute('data-color')) attrs['data-color'] = callout.getAttribute('data-color');
      if (callout.getAttribute('data-icon')) attrs['data-icon'] = callout.getAttribute('data-icon');
      callout.replaceWith(kids(callout, 'div', attrs));
    });
    root.querySelectorAll('ul.pp-tasks').forEach((list) => {
      const out = make(doc, 'ul', { 'data-type': 'taskList' });
      Array.from(list.children).forEach((li) => {
        if (li.localName !== 'li') return;
        const item = make(doc, 'li', { 'data-type': 'taskItem', 'data-checked': li.classList.contains('pp-done') ? 'true' : 'false' });
        li.querySelectorAll('.pp-checkbox').forEach(box => box.remove());
        const body = li.querySelector('.pp-task-body') || li;
        while (body.firstChild) item.appendChild(body.firstChild);
        out.appendChild(item);
      });
      list.replaceWith(out);
    });
    // Les notes : le texte de chaque note de la liste finale, puis chaque appel devient la pastille de l'éditeur.
    const notes = new Map();
    root.querySelectorAll('ol.pp-footnotes > li').forEach((li) => {
      const copy = li.cloneNode(true);
      copy.querySelectorAll('a[href^="#pp-fnref"]').forEach(a => a.remove());
      notes.set(li.getAttribute('id'), copy.textContent.replace(/\s+/g, ' ').trim());
    });
    let count = 0;
    root.querySelectorAll('sup.pp-fnref').forEach((sup) => {
      const link = sup.querySelector('a[href^="#pp-fn-"]');
      const text = link ? notes.get(link.getAttribute('href').slice(1)) || '' : '';
      count += 1;
      sup.replaceWith(make(doc, 'sup', { class: 'footnote-ref-marker', 'data-note-id': 'fn-imp' + count, 'data-note-text': text }));
    });
    root.querySelectorAll('ol.pp-footnotes').forEach(list => list.remove());
    root.querySelectorAll('.pp-table').forEach(unwrap);
    root.querySelectorAll('.pp-columns').forEach((columns) => {
      const cells = Array.from(columns.children).filter(child => child.classList.contains('pp-column'));
      if (cells.length !== 2) { unwrap(columns); return; }
      const left = /^[\d.]+(?:%|mm|px|cm|in|pt)$/.test((columns.style.getPropertyValue('--pp-left') || '').trim()) ? columns.style.getPropertyValue('--pp-left').trim() : '';
      const zone = make(doc, 'div', Object.assign({ class: 'two-columns-zone' }, left ? { style: '--layout-left: ' + left } : {}));
      cells.forEach(cell => zone.appendChild(kids(cell, 'div', { class: 'two-columns-column' })));
      columns.replaceWith(zone);
    });
    root.querySelectorAll('p.pp-caption').forEach(p => p.replaceWith(kids(p, 'p', { 'data-caption': 'true' })));
    root.querySelectorAll('img').forEach((img) => {
      ['left', 'right', 'center'].forEach((side) => { if (img.classList.contains('pp-' + side)) imageAlign.set(img, side); });
    });
    // L'en-tête et le pied de page (le tout premier et le tout dernier bloc du document) sortent du texte, une fois le reste mis en forme.
    ['header', 'footer'].forEach((name) => {
      root.querySelectorAll(':scope > .pp-zone.pp-' + name).forEach((zone) => { zones[name] = zone; zone.remove(); });
    });
    report.widget = 1;
    return zones;
  }

  // --- Le reste de la page ------------------------------------------------------------------------------------------------------------------------
  // <dt> et <dd> n'ont pas de forme chez l'éditeur : le terme devient un paragraphe en gras, sa définition un paragraphe ; <figcaption> devient la légende d'une image.
  function structure(root) {
    const doc = root.ownerDocument;
    root.querySelectorAll('dt').forEach((dt) => {
      const strong = doc.createElement('strong');
      while (dt.firstChild) strong.appendChild(dt.firstChild);
      const p = make(doc, 'p');
      p.appendChild(strong);
      dt.replaceWith(p);
    });
    root.querySelectorAll('dd').forEach((dd) => { const p = make(doc, 'p'); while (dd.firstChild) p.appendChild(dd.firstChild); dd.replaceWith(p); });
    root.querySelectorAll('dl').forEach(unwrap);
    root.querySelectorAll('figcaption').forEach((caption) => {
      const p = make(doc, 'p', { 'data-caption': 'true' });
      while (caption.firstChild) p.appendChild(caption.firstChild);
      caption.replaceWith(p);
    });
  }

  // Les signets : un lien `#adresse` qui mène à un élément de la page (son `id`, ou une ancre vide posée au début d'un paragraphe ou d'un titre) garde son lien et le bloc visé devient un signet
  // (js/anchors.js : un paragraphe ou un titre) ; un lien qui ne mène nulle part (la table des matières d'un autre outil, un « haut de page ») n'est plus qu'un texte. Les attributs sont posés plus tard
  // (`decorate`), après que le rangement a retiré ceux de la page.
  function anchors(root, decorate) {
    const wanted = new Set();
    root.querySelectorAll('a[href^="#"]').forEach((a) => { const id = HtmlSanitize.internalAnchorId(a.getAttribute('href')); if (id) wanted.add(id); });
    const block = (el) => {
      if (isParagraphLike(el)) return el;
      // Une ancre vide (<a id>, ou le repère vide <span id> que l'export du widget pose au début d'un titre que le sommaire cite déjà) vise le bloc où elle est posée ou celui qui la suit.
      if (!el.childNodes.length) {
        const parent = el.parentElement;
        if (parent && isParagraphLike(parent) && parent.firstChild === el) return parent;
        const next = el.nextElementSibling;
        return next && isParagraphLike(next) ? next : null;
      }
      return el.querySelector('p, h1, h2, h3, h4, h5, h6');
    };
    const given = new Set();
    root.querySelectorAll('[id]').forEach((el) => {
      const id = el.getAttribute('id');
      if (!wanted.has(id) || given.has(id) || !Anchors.isId(id)) return;
      const target = block(el);
      if (!target || decorate.has(target)) return;
      given.add(id);
      decorate.set(target, { 'data-anchor': id });
    });
    root.querySelectorAll('a[href^="#"]').forEach((a) => {
      const id = HtmlSanitize.internalAnchorId(a.getAttribute('href'));
      if (!id || !given.has(id)) unwrap(a);
    });
  }

  // Ce que la page porte et que l'éditeur n'a pas : classes, identifiants, attributs `data-*` (ceux de l'éditeur sont `editor-image`, `callout`, `data-type`... : une page qui les porterait ferait des objets de
  // l'éditeur sans l'avoir demandé) sont retirés, sauf aux éléments que ce module a écrits.
  function stripForeign(root) {
    root.querySelectorAll('*').forEach((el) => {
      if (made.has(el)) { el.removeAttribute('id'); return; }
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name === 'class' || name === 'id' || name.indexOf('data-') === 0) el.removeAttribute(attr.name);
      });
    });
    root.querySelectorAll('input, button, select, textarea').forEach(el => el.remove());
  }

  // --- Les images ------------------------------------------------------------------------------------------------------------------------------------
  // Seules une adresse web et une data URI (png, jpeg, gif, webp, avif, bmp) sont des images que l'éditeur sait montrer. Le reste (un chemin relatif, file:, blob:) est dit par un mot à la place, comme l'import
  // Markdown. Un pixel d'un pixel (suivi) est retiré. La largeur vient de l'attribut width ou du style ; sans elle, la largeur par défaut de l'éditeur s'applique.
  const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp)[;,]/i;
  function widthOf(img) {
    const attr = (img.getAttribute('width') || '').trim();
    const style = (img.style && img.style.width) || '';
    if (/^\d+(?:\.\d+)?%$/.test(attr)) return attr;
    if (/^\d+(?:\.\d+)?(?:px)?$/.test(attr)) return parseFloat(attr) + 'px';
    return /^\d+(?:\.\d+)?(?:px|%)$/.test(style) ? style : '';
  }
  const heightOf = (img) => { const attr = (img.getAttribute('height') || '').trim(); const style = (img.style && img.style.height) || ''; return parseFloat(attr) || parseFloat(style) || 0; };
  function images(root, report, base, imageAlign) {
    const doc = root.ownerDocument;
    root.querySelectorAll('img').forEach((img) => {
      let src = (img.getAttribute('src') || '').trim();
      if (/^\/\//.test(src)) src = 'https:' + src;
      else if (base && src && !/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(src)) { try { src = new URL(src, base).href; } catch (e) { /* adresse illisible : elle sera relative */ } }
      const alt = (img.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const width = widthOf(img);
      const tiny = (parseFloat(width) <= 2 && /px|^[\d.]+$/.test(width)) || (heightOf(img) > 0 && heightOf(img) <= 2);
      if (tiny) { img.remove(); report.pixels = (report.pixels || 0) + 1; return; }
      const web = /^https?:\/\//i.test(src);
      if (!web && !DATA_IMAGE.test(src)) {
        // Une data URI d'un autre genre (un dessin SVG) est un dessin non repris ; le reste (chemin relatif, file:, blob:, rien) est un fichier d'à côté.
        if (/^data:/i.test(src)) report.svg = (report.svg || 0) + 1; else report.imagesRelative = (report.imagesRelative || 0) + 1;
        const note = doc.createElement('em');
        note.textContent = '[' + (alt ? I18n.t('markdown.imageNotImportedNamed', { alt }) : I18n.t('markdown.imageNotImported')) + ']';
        img.replaceWith(note);
        return;
      }
      if (web) report.imagesExternal = (report.imagesExternal || 0) + 1;
      const fresh = doc.createElement('img');
      fresh.setAttribute('class', 'editor-image');
      fresh.setAttribute('src', src);
      fresh.setAttribute('alt', alt);
      if (width) fresh.setAttribute('style', 'width: ' + width);
      const side = imageAlign.get(img) || (/^(?:left|right|center)$/i.test(img.getAttribute('align') || '') ? img.getAttribute('align').toLowerCase() : '');
      if (side === 'left' || side === 'right' || side === 'center') fresh.setAttribute('data-align', side);
      img.replaceWith(fresh);
    });
  }

  // --- Les variables ----------------------------------------------------------------------------------------------------------------------------------
  // {{Table.Colonne}} (espaces permis autour de la clé) : la bulle sans réglage que l'export d'un modèle écrit. Chaque paire dont la clé est une variable du document devient sa bulle ; une clé qui n'en est pas
  // une reste du texte et, quand elle a la forme d'une clé « Table.Colonne », se compte. Rien n'est lu dans du code.
  const TOKEN = /\{\{[ \t]*([^{}\n]*?)[ \t]*\}\}/g;
  const KEY_SHAPE = /^[\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)+$/u;
  function badgeHtml(key) {
    const found = Variables.findTextVariables(Variables.triggerChar() + key);
    const whole = found.length === 1 && found[0].start === 0 && found[0].end === key.length + 1 ? found[0] : null;
    return whole ? EditorNodes.varBadgeHtml({ table: whole.table, column: whole.column, key }) : '';
  }
  function variables(root, report) {
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue.indexOf('{{') !== -1 && !(node.parentElement && node.parentElement.closest('pre, code'))) nodes.push(node);
    }
    nodes.forEach((node) => {
      const value = node.nodeValue;
      const out = [];
      let last = 0;
      let changed = false;
      for (const match of value.matchAll(TOKEN)) {
        if (!match[1]) continue;
        const badge = badgeHtml(match[1]);
        if (!badge) { if (KEY_SHAPE.test(match[1])) report.variables = (report.variables || 0) + 1; continue; }
        out.push(doc.createTextNode(value.slice(last, match.index)), ...Array.from(Dom.inertTemplate(badge).content.childNodes));
        last = match.index + match[0].length;
        changed = true;
      }
      if (!changed) return;
      out.push(doc.createTextNode(value.slice(last)));
      node.replaceWith(...out);
    });
  }

  // --- Les comptes avant assainissement ---------------------------------------------------------------------------------------------------
  // Ce que l'assainissement va retirer se compte AVANT, sur l'arbre lu tel quel : programmes, cadres et médias intégrés, dessins, champs de formulaire, liens vers une autre page.
  function countOriginals(original, report) {
    const count = (key, n) => { if (n) report[key] = (report[key] || 0) + n; };
    count('scripts', original.querySelectorAll('script').length);
    const body = original.body;
    if (!body) return;
    count('embedded', body.querySelectorAll('iframe, frame, video, audio, object, embed, canvas, applet').length);
    count('svg', body.querySelectorAll('svg').length);
    count('formFields', body.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), input[type="checkbox"]:not([disabled]), select, textarea, button').length);
    count('relativeLinks', Array.from(body.querySelectorAll('a[href]')).filter(a => !/^\s*(?:https?:|mailto:|tel:|#|javascript:|\/\/)/i.test(a.getAttribute('href') || '')).length);
  }
  function baseOf(original) {
    const base = original.querySelector('base[href]');
    try { return base && /^https?:\/\//i.test(base.getAttribute('href')) ? new URL(base.getAttribute('href')).href : ''; } catch (e) { return ''; }
  }
  // Le texte des feuilles de style de l'écran : <style> sans `media` ou pour l'écran. Les feuilles liées (<link rel="stylesheet">) ne sont pas dans le fichier : elles ne sont pas lues.
  function styleTextOf(original) {
    return Array.from(original.querySelectorAll('style')).filter((style) => {
      const media = (style.getAttribute('media') || '').trim().toLowerCase();
      return !media || media === 'all' || media === 'screen';
    }).map(style => style.textContent).join('\n');
  }

  // --- Le document ------------------------------------------------------------------------------------------------------------------------------------
  // Les éléments de navigation que la page porte, gardés comme du texte (menu, colonne latérale, en-tête et pied du site) : comptés pour le compte rendu.
  function countNavigation(root) {
    return Array.from(root.querySelectorAll('nav, aside, [role="navigation"], [role="complementary"], [role="contentinfo"], [role="banner"], header, footer'))
      .filter(el => !el.parentElement || !el.parentElement.closest('article, section, main, blockquote, li, td, th')).length;
  }

  // Le HTML de l'éditeur pour la racine d'un morceau de page (le corps, ou la zone d'un en-tête ou d'un pied), les rangements communs faits.
  function finish(root, report, base, imageAlign, decorate) {
    stripForeign(root);
    decorate.forEach((attrs, el) => Object.keys(attrs).forEach(name => el.setAttribute(name, attrs[name])));
    decorate.clear();
    images(root, report, base, imageAlign);
    variables(root, report);
    return HtmlSanitize.clean(root.innerHTML).trim();
  }

  // Le document d'un texte HTML : { html, headerFooter (ou null), report: [{ key, n }] }, ou une erreur à code (empty, tooMuchText, unreadable).
  function toDocument(raw) {
    const text = String(raw == null ? '' : raw).replace(/^﻿/, '');
    made = new WeakSet();
    const report = {};
    const original = new DOMParser().parseFromString(text, 'text/html');
    countOriginals(original, report);
    const base = baseOf(original);
    const cssText = styleTextOf(original);
    // Les boutons et ce que la page cache par l'attribut `hidden` sont retirés AVANT l'assainissement : il ouvrirait un bouton (son texte resterait), il n'a pas de quoi reconnaître un élément caché.
    original.body.querySelectorAll('[hidden], button').forEach(el => el.remove());
    const tree = HtmlSanitize.parseInert(original.body.innerHTML);
    const chars = tree.textContent.length;
    if (chars > MAX_TEXT) throw fail('tooMuchText', { chars, max: MAX_TEXT });
    const widget = tree.querySelector('.pp-doc');
    const root = widget || tree;
    const imageAlign = new Map();
    const decorate = new Map();
    let zones = { header: '', footer: '' };
    if (widget) zones = mapWidgetExport(root, report, imageAlign);
    else {
      const table = declarationsOf(root, cssText, report);
      wordLists(root, table);
      styleText(root, table, report, imageAlign);
      const nav = countNavigation(root);
      if (nav) report.navigation = nav;
    }
    structure(root);
    anchors(root, decorate);
    const html = finish(root, report, base, imageAlign, decorate);
    const headerFooter = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
    ['header', 'footer'].forEach((name) => {
      if (zones[name]) {
        structure(zones[name]);
        headerFooter[name].default = finish(zones[name], report, base, imageAlign, new Map());
      }
    });
    const filled = PageLayout.hasZoneContent(headerFooter.header.default) || PageLayout.hasZoneContent(headerFooter.footer.default);
    if (!html && !filled) throw fail('empty');
    headerFooter.enabled = filled;
    made = new WeakSet();
    return { html, headerFooter: filled ? headerFooter : null, report: REPORT_KEYS.filter(key => report[key]).map(key => ({ key, n: report[key] })), widget: !!report.widget };
  }

  // Le fichier choisi, lu et converti : { html, headerFooter, report }, ou une erreur à code (tooBig, unreadable, empty, tooMuchText).
  async function fromFile(file) {
    const text = await readText(file);
    // Le coin d'état se peint avant que la conversion ne tienne la page.
    await new Promise(resolve => setTimeout(resolve, 0));
    return toDocument(text);
  }

  return { fromFile, toDocument, decode, REPORT_KEYS, MAX_BYTES, MAX_TEXT };
})();
