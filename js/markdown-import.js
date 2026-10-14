// Import Markdown : un fichier .md devient le HTML de l'éditeur d'un nouveau document, sans nom et pas encore enregistré (js/main.js:onImportMd, comme « Importer un
// Excel… »). marked (CommonMark et GFM : tableaux, listes à cases, barré, adresses seules) lit le Markdown ; le HTML qu'il rend est ensuite remis dans la forme que
// l'éditeur écrit lui-même (listes à cases, encadrés, notes de bas de page, sommaire, saut de page, images, alignements). Ce que l'éditeur ne sait pas lire est ouvert
// par HtmlSanitize (son texte reste), jamais gardé.
//
// Les fichiers visés, par ordre d'importance :
//  - ceux de Docs de La Suite (BlockNote) : puces « * », filet « *** », saut de ligne « \ », « &#x20; » autour d'une marque, listes à cases, tableaux GFM, images ;
//  - ceux que l'export Markdown du widget écrit (js/markdown-export.js) : ce qu'il garde en HTML en ligne (<u>, <sup>, <sub>, <mark>, <span style>, <div align>,
//    <img width>, tableaux HTML), les alertes GitHub, les notes [^1], le sommaire en liens, le saut de page, les en-têtes et pieds de page entre commentaires ;
//  - ceux de GitHub, VS Code, Obsidian, Typora et du reste du monde Markdown.
// Les variables : l'export « Markdown (modèle) » écrit une bulle sans réglage {{Table.Colonne}} et le reste de ses éléments de fusion (bulle réglée, calcul, puce, numéro de page,
// valeur et bloc conditionnels, image liée à une colonne) en HTML en ligne ; l'un et l'autre redeviennent ce qu'ils étaient. Une paire d'accolades dont la clé n'est pas une
// variable de ce document reste du texte.
// Ce qu'il ne garde pas, volontairement : une image dont l'adresse n'est pas une adresse web ni une data URI (le fichier d'à côté n'est pas envoyé avec le texte : un
// mot le dit à sa place), le titre d'une image ou d'un lien, la numérotation des titres écrite dans le texte (elle reste du texte), l'en-tête YAML d'un fichier Jekyll ou
// Hugo, les définitions de notes que rien n'appelle.
const MarkdownImport = (function () {
  // Au-delà, la page ne tiendrait pas le document (marked, puis l'éditeur, lisent tout en mémoire).
  const MAX_BYTES = 10 * 1024 * 1024;
  // marked 15.0.12, MIT : ~40 Ko, chargé au premier import seulement. Recalculer l'empreinte si la version change : `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`
  // (le fichier de cdnjs est celui de npm, octet pour octet).
  const MARKED_LIB = { src: 'https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.12/marked.min.js', integrity: 'sha384-948ahk4ZmxYVYOc+rxN1H2gM1EJ2Duhp7uHtZ4WSLkV4Vtx5MUqnV+l7u9B+jFv+' };
  let libPromise = null;
  function ensureLibLoaded() {
    if (!libPromise) libPromise = (window.marked ? Promise.resolve() : ExportCommon.loadScriptOnce(MARKED_LIB)).catch(e => { libPromise = null; throw e; });
    return libPromise;
  }

  // Les erreurs que la personne peut corriger (mauvais fichier) : `code` dit laquelle (js/main.js:reportMdImportError).
  const fail = (code, extra) => Object.assign(new Error('Import Markdown : ' + code), { code }, extra);

  const escapeAttr = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // --- Le lecteur -------------------------------------------------------------------------------------------------------------------------------
  // Un lecteur à nous : les réglages de marked ne changent pas pour le reste de la page. Les notes de bas de page « [^1] » n'existent pas dans marked : une extension
  // en ligne les lit, après les échappements et le code (« \[^1] » et « `[^1]` » restent du texte), pour celles dont une définition existe (`notes`, étiquette en
  // minuscules -> texte brut) et que rien d'autre ne réclame.
  const state = { notes: new Map(), counter: 0 };
  let parser = null;
  function markdownParser() {
    if (parser) return parser;
    parser = new window.marked.Marked({ gfm: true, breaks: false });
    parser.use({
      extensions: [{
        name: 'footnoteRef',
        level: 'inline',
        start: src => src.indexOf('[^'),
        tokenizer(src) {
          const m = /^\[\^([^\]\s]+)\]/.exec(src);
          const text = m && state.notes.get(m[1].toLowerCase());
          return text === undefined || text === null ? undefined : { type: 'footnoteRef', raw: m[0], text };
        },
        renderer(token) {
          state.counter += 1;
          return '<sup class="footnote-ref-marker" data-note-id="fn-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + state.counter
            + '" data-note-text="' + escapeAttr(token.text) + '"></sup>';
        },
      }],
    });
    return parser;
  }

  // --- Le fichier -------------------------------------------------------------------------------------------------------------------------------
  // UTF-8 (avec ou sans BOM), UTF-16 avec BOM, sinon Windows-1252 (un fichier enregistré « ANSI » par un vieil éditeur) : aucun octet n'est perdu en silence. Un octet nul
  // hors UTF-16 est un fichier binaire.
  function decode(bytes) {
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    if (bytes.indexOf(0) !== -1) throw fail('unreadable');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }
  async function readText(file) {
    if (file.size > MAX_BYTES) throw fail('tooBig', { size: file.size, max: MAX_BYTES });
    return decode(new Uint8Array(await file.arrayBuffer()));
  }

  // --- Le texte, avant marked ---------------------------------------------------------------------------------------------------------------------
  // L'en-tête YAML d'un fichier Jekyll, Hugo ou Obsidian (---, des lignes « clé: valeur », ---) : des réglages, pas du texte. Un filet suivi d'un paragraphe et d'un
  // autre filet n'en est pas un : toutes les lignes doivent ressembler à du YAML.
  function withoutFrontMatter(text) {
    const m = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text);
    if (!m) return text;
    const lines = m[1].split('\n').filter(line => line.trim());
    const yaml = lines.length && /^[\w"'.\- ]+:(?:\s|$)/.test(lines[0]) && lines.every(line => /^[\w"'.\- ]+:(?:\s|$)|^\s+\S|^\s*-\s|^#/.test(line));
    return yaml ? text.slice(m[0].length) : text;
  }

  // Les lignes d'un bloc de code délimité (``` ou ~~~, ouverture et fermeture comprises) : ni un repère d'en-tête ni une définition de note ne s'y lit.
  function codeMask(lines) {
    const mask = new Array(lines.length).fill(false);
    let fence = null;
    lines.forEach((line, i) => {
      if (fence) {
        mask[i] = true;
        const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
        if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
        return;
      }
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (open && !(open[1][0] === '`' && open[2].indexOf('`') !== -1)) { fence = open[1]; mask[i] = true; }
    });
    return mask;
  }

  // Les en-têtes et pieds de page que l'export a écrits entre <!-- publipostage:header --> et <!-- /publipostage:header --> (et header-first, footer, footer-first) :
  // leurs lignes, à part du corps. Un repère sans sa fermeture n'est qu'un commentaire HTML.
  function splitZones(lines) {
    const mask = codeMask(lines);
    const zones = {};
    const body = [];
    for (let i = 0; i < lines.length; i += 1) {
      const open = !mask[i] && /^\s*<!--\s*publipostage:(header|header-first|footer|footer-first)\s*-->\s*$/.exec(lines[i]);
      if (open) {
        const close = new RegExp('^\\s*<!--\\s*/publipostage:' + open[1] + '\\s*-->\\s*$');
        let j = i + 1;
        while (j < lines.length && !(close.test(lines[j]) && !mask[j])) j += 1;
        if (j < lines.length) { zones[open[1]] = lines.slice(i + 1, j); i = j; continue; }
      }
      body.push(lines[i]);
    }
    return { zones, body };
  }

  // Les notes de bas de page « [^1]: texte » (la suite en retrait de quatre blancs est à elles) : retirées du corps, gardées par étiquette.
  function splitNotes(lines) {
    const mask = codeMask(lines);
    const notes = new Map();
    const body = [];
    const indented = line => /^(?: {4}|\t)/.test(line);
    for (let i = 0; i < lines.length; i += 1) {
      const m = !mask[i] && /^ {0,3}\[\^([^\]\s]+)\]:[ \t]?(.*)$/.exec(lines[i]);
      if (!m) { body.push(lines[i]); continue; }
      const text = [m[2]];
      let j = i + 1;
      while (j < lines.length) {
        if (indented(lines[j])) { text.push(lines[j].replace(/^(?: {4}|\t)/, '')); j += 1; continue; }
        if (!lines[j].trim() && j + 1 < lines.length && indented(lines[j + 1])) { text.push(''); j += 1; continue; }
        break;
      }
      notes.set(m[1].toLowerCase(), text.join('\n').trim());
      i = j - 1;
    }
    return { notes, body };
  }
  // Le texte d'une note, tel que l'éditeur le garde : brut, sur une ligne. Les échappements et la mise en forme du Markdown tombent, l'adresse d'un lien passe entre parenthèses.
  function plainNote(text) {
    const kept = state.notes;
    state.notes = new Map();
    const html = markdownParser().parseInline(text);
    state.notes = kept;
    const doc = new DOMParser().parseFromString('<body>' + html, 'text/html');
    doc.body.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (href && a.textContent.trim() !== href) a.append(' (' + href + ')');
    });
    doc.body.querySelectorAll('br').forEach(br => br.replaceWith(' '));
    return doc.body.textContent.replace(/\s+/g, ' ').trim();
  }

  // --- Les variables, avant marked --------------------------------------------------------------------------------------------------------------------
  // {{Table.Colonne}} (espaces permis autour de la clé) : la bulle sans réglage que l'export d'un modèle écrit. Chaque paire dont la clé est une variable du document devient sa
  // bulle, en HTML en ligne que marked laisse passer et que l'éditeur relit. Une clé qui n'en est pas une (une autre table, une colonne disparue) reste du texte et, quand elle
  // a la forme d'une clé « Table.Colonne », se compte (`unknownVariables`) pour que le coin d'état le dise. Rien n'est lu dans du code (bloc délimité, code en ligne), dans une
  // balise HTML (un attribut peut citer des accolades) ni derrière une barre oblique inverse : « \{{ » est du texte, ce que l'export écrit pour un « {{ » du document.
  const TOKEN = /\{\{[ \t]*([^{}\n]*?)[ \t]*\}\}/y;
  const KEY_SHAPE = /^[\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)+$/u;
  // La bulle de la clé, quand la clé entière est une variable du document ('' sinon) : la même que celle de la liste « # » (EditorNodes.varBadgeHtml).
  function badgeHtml(key) {
    const found = Variables.findTextVariables(Variables.triggerChar() + key);
    const whole = found.length === 1 && found[0].start === 0 && found[0].end === key.length + 1 ? found[0] : null;
    return whole ? EditorNodes.varBadgeHtml({ table: whole.table, column: whole.column, key }) : '';
  }
  // La fin du code en ligne qui s'ouvre en `at` (une suite de n apostrophes inverses, fermée par une suite de la même longueur), ou -1 : le code en ligne qui ne se ferme pas est du texte.
  function codeSpanEnd(line, at, n) {
    for (let j = line.indexOf('`', at + n); j !== -1;) {
      let k = j;
      while (line[k] === '`') k += 1;
      if (k - j === n) return k;
      j = line.indexOf('`', k);
    }
    return -1;
  }
  // La fin de la balise HTML qui s'ouvre en `at`, ou -1 : jusqu'au « > » qui n'est pas dans une valeur entre guillemets.
  function tagEnd(line, at) {
    let quote = '';
    for (let j = at + 1; j < line.length; j += 1) {
      const c = line[j];
      if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>') return j + 1;
    }
    return -1;
  }
  function variablesOfLine(line, ctx) {
    let out = '';
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      let end = -1;
      if (c === '\\') end = i + 2;
      else if (c === '`') { let n = 1; while (line[i + n] === '`') n += 1; end = codeSpanEnd(line, i, n); if (end === -1) end = i + n; }
      else if (c === '<' && /[A-Za-z/!?]/.test(line[i + 1] || '')) end = tagEnd(line, i);
      else if (c === '{' && line[i + 1] === '{') {
        TOKEN.lastIndex = i;
        const m = TOKEN.exec(line);
        if (m && m[1]) {
          const badge = badgeHtml(m[1]);
          if (!badge && KEY_SHAPE.test(m[1])) ctx.unknownVariables += 1;
          out += badge || m[0];
          i += m[0].length;
          continue;
        }
      }
      if (end === -1) end = i + 1;
      out += line.slice(i, end);
      i = end;
    }
    return out;
  }
  function variables(lines, ctx) {
    if (!lines.some(line => line.indexOf('{{') !== -1)) return lines;
    const code = codeMask(lines);
    return lines.map((line, i) => (code[i] || line.indexOf('{{') === -1 ? line : variablesOfLine(line, ctx)));
  }

  // --- Le HTML de marked, remis dans la forme de l'éditeur ----------------------------------------------------------------------------------
  const el = (doc, tag, attrs) => {
    const node = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(name => node.setAttribute(name, attrs[name]));
    return node;
  };
  const isBlank = node => node.nodeType === Node.TEXT_NODE && !node.nodeValue.trim();
  const significant = parent => Array.from(parent.childNodes).filter(node => !isBlank(node));
  const hasContent = node => !!node.textContent.trim() || !!(node.querySelector && node.querySelector('img, hr, br'));
  const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'BLOCKQUOTE', 'PRE', 'HR', 'DIV', 'CENTER', 'DETAILS', 'FIGURE', 'SECTION', 'ARTICLE',
    'ASIDE', 'HEADER', 'FOOTER', 'NAV', 'MAIN', 'ADDRESS', 'DL', 'FIELDSET']);

  // Les alertes de GitHub : un bloc de citation dont la première ligne est [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] ou [!CAUTION] devient un encadré (js/callout.js :
  // les couleurs et les icônes sont celles que l'export a écrites en alerte, dans l'autre sens ; un encadré gris revient bleu : GitHub n'a pas de gris).
  const ALERTS = { NOTE: ['blue', 'info'], TIP: ['green', 'bulb'], IMPORTANT: ['purple', 'alert'], WARNING: ['amber', 'warning'], CAUTION: ['red', 'alert'] };
  function alertsToCallouts(root) {
    const doc = root.ownerDocument;
    Array.from(root.querySelectorAll('blockquote')).forEach(quote => {
      const first = quote.firstElementChild;
      const lead = first && first.tagName === 'P' ? first.firstChild : null;
      if (!lead || lead.nodeType !== Node.TEXT_NODE) return;
      const m = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(\n|$)/i.exec(lead.nodeValue);
      if (!m) return;
      const [color, icon] = ALERTS[m[1].toUpperCase()];
      lead.nodeValue = lead.nodeValue.slice(m[0].length);
      // « [!NOTE] » suivi d'un saut de ligne dur : le <br> en fait partie.
      if (!lead.nodeValue && lead.nextSibling && lead.nextSibling.nodeType === Node.ELEMENT_NODE && lead.nextSibling.tagName === 'BR') lead.nextSibling.remove();
      if (!lead.nodeValue) lead.remove();
      if (!hasContent(first)) first.remove();
      const callout = el(doc, 'div', { class: 'callout', 'data-color': color, 'data-icon': icon, role: 'note' });
      while (quote.firstChild) callout.appendChild(quote.firstChild);
      if (!significant(callout).length) callout.appendChild(el(doc, 'p'));
      quote.replaceWith(callout);
    });
  }

  // Les listes à cases (« - [ ] » et « - [x] » : marked pose une case à cocher devant le texte de l'élément). Une liste mêlée de cases et de puces fait deux listes, chacune
  // de sa forme ; dans une liste numérotée, la case reste un caractère (☐ ☑), l'éditeur n'a pas de liste numérotée à cases.
  function taskLists(root) {
    const doc = root.ownerDocument;
    const boxOf = li => li.querySelector(':scope > input[type="checkbox"], :scope > p:first-child > input[type="checkbox"]');
    const trimLead = parent => {
      const lead = parent.firstChild;
      if (lead && lead.nodeType === Node.TEXT_NODE) lead.nodeValue = lead.nodeValue.replace(/^[ \t]+/, '');
    };
    Array.from(root.querySelectorAll('ul, ol')).forEach(list => {
      const items = Array.from(list.children).filter(child => child.tagName === 'LI');
      if (!items.some(boxOf)) return;
      if (list.tagName === 'OL') {
        items.forEach(li => {
          const box = boxOf(li);
          if (box) box.replaceWith(doc.createTextNode(box.hasAttribute('checked') ? '☑' : '☐'));
        });
        return;
      }
      const runs = [];
      items.forEach(li => {
        const task = !!boxOf(li);
        const last = runs[runs.length - 1];
        if (last && last.task === task) last.items.push(li); else runs.push({ task, items: [li] });
      });
      const made = runs.map(run => {
        const ul = el(doc, 'ul', run.task ? { 'data-type': 'taskList' } : {});
        run.items.forEach(li => {
          if (run.task) {
            const box = boxOf(li);
            const checked = box.hasAttribute('checked');
            const holder = box.parentElement;
            box.remove();
            trimLead(holder);
            li.setAttribute('data-type', 'taskItem');
            li.setAttribute('data-checked', checked ? 'true' : 'false');
          }
          ul.appendChild(li);
        });
        return ul;
      });
      list.replaceWith(...made);
    });
  }

  // La cible d'un titre, comme GitHub l'écrit (et comme l'export l'a écrite dans son sommaire) : minuscules, sans ponctuation, tirets à la place des blancs, un numéro
  // derrière le deuxième titre identique.
  function slugger() {
    const seen = new Map();
    return text => {
      const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '').replace(/ /g, '-');
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      return count ? base + '-' + count : base;
    };
  }
  const anchorOf = href => {
    const raw = String(href || '').slice(1);
    try { return decodeURIComponent(raw).toLowerCase(); } catch (e) { return raw.toLowerCase(); }
  };
  // Le sommaire : une liste dont chaque élément est un lien vers une ancre du document (« - [Titre](#titre) », en retrait pour les niveaux), dont l'un au moins vise un
  // titre du document, est le sommaire que l'export a écrit, et que l'éditeur sait générer lui-même. Elle devient le repère du sommaire ; le paragraphe en gras qui la
  // titre (« Sommaire ») s'en va avec elle. Une liste de liens qui ne mène pas aux titres reste une liste. « [TOC] » (Typora, GitLab, markdown-it) est le même repère.
  const TOC_TITLES = new Set(['sommaire', 'table des matières', 'table of contents', 'contents', 'toc']);
  function tableOfContents(root) {
    const doc = root.ownerDocument;
    const slug = slugger();
    const targets = new Set();
    Array.from(root.children).forEach(child => {
      if (/^H[1-6]$/.test(child.tagName)) targets.add(slug(child.textContent.replace(/\s+/g, ' ').trim()));
    });
    const anchorItem = li => {
      const kids = significant(li).filter(node => !(node.nodeType === Node.ELEMENT_NODE && (node.tagName === 'UL' || node.tagName === 'OL')));
      const own = kids.length === 1 && kids[0].nodeType === Node.ELEMENT_NODE && kids[0].tagName === 'P' ? significant(kids[0]) : kids;
      return own.length === 1 && own[0].nodeType === Node.ELEMENT_NODE && own[0].tagName === 'A' && /^#/.test(own[0].getAttribute('href') || '') ? own[0] : null;
    };
    Array.from(root.children).forEach(child => {
      if (child.tagName === 'P' && /^\[{1,2}_{0,2}toc_{0,2}\]{1,2}$/i.test(child.textContent.trim())) { child.replaceWith(el(doc, 'div', { class: 'toc-marker' })); return; }
      if (child.tagName !== 'UL') return;
      const anchors = Array.from(child.querySelectorAll('li')).map(anchorItem);
      if (!anchors.length || anchors.some(a => !a) || !anchors.some(a => targets.has(anchorOf(a.getAttribute('href'))))) return;
      const before = child.previousElementSibling;
      const titles = before && before.tagName === 'P' ? significant(before) : [];
      if (titles.length === 1 && titles[0].nodeType === Node.ELEMENT_NODE && titles[0].tagName === 'STRONG' && TOC_TITLES.has(before.textContent.trim().toLowerCase())) before.remove();
      child.replaceWith(el(doc, 'div', { class: 'toc-marker' }));
    });
  }

  // Le saut de page de l'export (<div style="page-break-after: always;">, qui est aussi celui de Typora) et ses cousins : le style CSS d'une rupture, « \newpage » de Pandoc.
  function pageBreaks(root) {
    const doc = root.ownerDocument;
    Array.from(root.querySelectorAll('div[style]')).forEach(div => {
      if (!/page-break-(?:after|before)\s*:\s*always|break-(?:after|before)\s*:\s*page/i.test(div.getAttribute('style') || '') || hasContent(div)) return;
      div.replaceWith(el(doc, 'div', { class: 'page-break-marker' }));
    });
    Array.from(root.children).forEach(child => {
      if (child.tagName === 'P' && /^\\(?:newpage|pagebreak|clearpage)$/.test(child.textContent.trim())) child.replaceWith(el(doc, 'div', { class: 'page-break-marker' }));
    });
  }

  // Les images. Seules une adresse web et une data URI sont des images que l'éditeur sait montrer : le reste (un chemin relatif, file:) est dit par un mot à la place de
  // l'image. La largeur vient de l'attribut width de l'export (<img width="150"> ou "50%") ; sans elle, la largeur par défaut de l'éditeur s'applique.
  function widthOf(img) {
    const attr = (img.getAttribute('width') || '').trim();
    const style = (img.style && img.style.width) || '';
    return /^\d+(?:\.\d+)?%$/.test(attr) ? attr : /^\d+(?:\.\d+)?(?:px)?$/.test(attr) ? parseFloat(attr) + 'px' : /^\d+(?:\.\d+)?(?:px|%)$/.test(style) ? style : '';
  }
  function images(root, ctx) {
    const doc = root.ownerDocument;
    Array.from(root.querySelectorAll('img')).forEach(img => {
      // Une image que le modèle lie à une colonne (ce que l'export d'un modèle écrit en HTML) n'a pas d'adresse : elle est dessinée à la lecture, elle reste telle quelle.
      if (ExportCommon.isMergeImage(img)) { img.classList.add('editor-image'); return; }
      let src = (img.getAttribute('src') || '').trim();
      if (/^\/\//.test(src)) src = 'https:' + src;
      const alt = (img.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
      if (!/^https?:\/\//i.test(src) && !/^data:image\//i.test(src)) {
        ctx.skippedImages += 1;
        const note = el(doc, 'em');
        note.textContent = '[' + (alt ? I18n.t('markdown.imageNotImportedNamed', { alt }) : I18n.t('markdown.imageNotImported')) + ']';
        img.replaceWith(note);
        return;
      }
      const made = el(doc, 'img', { class: 'editor-image', src, alt });
      const width = widthOf(img);
      if (width) made.setAttribute('style', 'width: ' + width);
      img.replaceWith(made);
    });
  }

  // L'alignement : <div align="center"> (et <center>) donne son alignement aux paragraphes et titres qu'il entoure ; un paragraphe ou un titre qui porte align aussi, et
  // une case de tableau (marked écrit align="right" pour « ---: ») : dans l'éditeur, l'alignement est celui des paragraphes de la case. Une image seule dans son
  // paragraphe est centrée ou mise à droite par son propre réglage.
  const textAlignOf = value => { const a = String(value || '').trim().toLowerCase(); return a === 'center' || a === 'right' ? a : ''; };
  function setAlign(node, align) {
    if (node.tagName === 'P') {
      const kids = significant(node);
      if (kids.length === 1 && kids[0].nodeType === Node.ELEMENT_NODE && kids[0].tagName === 'IMG') { kids[0].setAttribute('data-align', align); return; }
    }
    node.style.textAlign = align;
  }
  function alignCell(cell, align) {
    const blocks = Array.from(cell.children).filter(child => /^(?:P|H[1-6])$/.test(child.tagName));
    if (blocks.length) { blocks.forEach(block => setAlign(block, align)); return; }
    if (!significant(cell).length || Array.from(cell.children).some(child => BLOCKS.has(child.tagName))) return;
    const paragraph = cell.ownerDocument.createElement('p');
    while (cell.firstChild) paragraph.appendChild(cell.firstChild);
    cell.appendChild(paragraph);
    setAlign(paragraph, align);
  }
  // Du texte ou une image posés directement dans un bloc (une image seule sur sa ligne que marked laisse en HTML, un <div align> sans paragraphe) : rangés en paragraphes,
  // pour que l'alignement ait où se poser. Une ligne vide entre deux blocs HTML finit le paragraphe (marked la laisse entre eux) : deux images écrites chacune dans son bloc
  // restent deux paragraphes, comme l'export les a écrites, au lieu de tenir sur une même ligne.
  const isBlankLine = node => node.nodeType === Node.TEXT_NODE && !node.nodeValue.trim() && /\n[ \t]*\n/.test(node.nodeValue);
  function wrapInlineRuns(box) {
    const doc = box.ownerDocument;
    let run = null;
    Array.from(box.childNodes).forEach(node => {
      if (isBlankLine(node)) { run = null; return; }
      const inline = node.nodeType === Node.TEXT_NODE ? !!node.nodeValue.trim() || !!run : node.nodeType === Node.ELEMENT_NODE && !BLOCKS.has(node.tagName);
      if (!inline) { run = null; return; }
      if (!run) { run = doc.createElement('p'); box.insertBefore(run, node); }
      run.appendChild(node);
    });
  }
  function alignments(root) {
    Array.from(root.querySelectorAll('div[align], center')).forEach(box => {
      const align = textAlignOf(box.getAttribute('align') || (box.tagName === 'CENTER' ? 'center' : ''));
      if (align) {
        wrapInlineRuns(box);
        Array.from(box.children).forEach(child => { if (/^(?:P|H[1-6])$/.test(child.tagName) && !child.getAttribute('align')) setAlign(child, align); });
      }
      box.replaceWith(...Array.from(box.childNodes));
    });
    Array.from(root.querySelectorAll('p[align], h1[align], h2[align], h3[align], h4[align], h5[align], h6[align]')).forEach(node => {
      const align = textAlignOf(node.getAttribute('align'));
      if (align) setAlign(node, align);
      node.removeAttribute('align');
    });
    Array.from(root.querySelectorAll('th[align], td[align]')).forEach(cell => {
      const align = textAlignOf(cell.getAttribute('align'));
      if (align) alignCell(cell, align);
      cell.removeAttribute('align');
    });
  }

  // marked ferme chaque bloc de code par un saut de ligne : l'éditeur en ferait une ligne vide de plus, et l'export la réécrirait.
  function codeBlocks(root) {
    root.querySelectorAll('pre > code').forEach(code => { if (code.lastChild && code.lastChild.nodeType === Node.TEXT_NODE) code.lastChild.nodeValue = code.lastChild.nodeValue.replace(/\n$/, ''); });
  }

  // Un paragraphe sans rien dedans (ce qu'un morceau de HTML en ligne peut laisser entre deux blocs) n'est pas du contenu.
  function dropEmptyParagraphs(root) {
    Array.from(root.children).forEach(child => { if (child.tagName === 'P' && !child.childNodes.length) child.remove(); });
  }

  // Le HTML de l'éditeur pour un morceau de Markdown (le corps, ou la zone d'un en-tête ou d'un pied), ses notes retirées d'abord.
  function convert(lines, ctx) {
    const { notes, body } = splitNotes(lines);
    state.notes = new Map();
    notes.forEach((text, label) => state.notes.set(label, plainNote(text)));
    const rendered = markdownParser().parse(variables(body, ctx).join('\n'));
    state.notes = new Map();
    const doc = new DOMParser().parseFromString('<body>' + rendered, 'text/html');
    const root = doc.body;
    root.querySelectorAll('script, style, template, noscript, iframe, object, embed').forEach(node => node.remove()); // ni texte ni image : retirés avant que le rangement en paragraphes ne leur en fasse un
    alertsToCallouts(root);
    taskLists(root);
    tableOfContents(root);
    pageBreaks(root);
    images(root, ctx);
    wrapInlineRuns(root);
    root.querySelectorAll('div.conditional-text').forEach(wrapInlineRuns);
    alignments(root);
    codeBlocks(root);
    dropEmptyParagraphs(root);
    return HtmlSanitize.clean(root.innerHTML).trim();
  }

  // Le document d'un texte Markdown : { html, headerFooter (ou null), skippedImages, unknownVariables }. La bibliothèque doit être chargée (ensureLibLoaded).
  function toDocument(markdown) {
    const text = withoutFrontMatter(String(markdown == null ? '' : markdown).replace(/^﻿/, '').replace(/\r\n?/g, '\n'));
    const ctx = { skippedImages: 0, unknownVariables: 0 };
    const { zones, body } = splitZones(text.split('\n'));
    const html = convert(body, ctx);
    const zoneHtml = name => (zones[name] ? convert(zones[name], ctx) : '');
    const data = { enabled: false, differentFirstPage: false, header: { default: zoneHtml('header'), first: zoneHtml('header-first') }, footer: { default: zoneHtml('footer'), first: zoneHtml('footer-first') } };
    const filled = [data.header.default, data.header.first, data.footer.default, data.footer.first].some(PageLayout.hasZoneContent);
    if (!html && !filled) throw fail('empty');
    data.enabled = filled;
    data.differentFirstPage = PageLayout.hasZoneContent(data.header.first) || PageLayout.hasZoneContent(data.footer.first);
    return { html, headerFooter: filled ? data : null, skippedImages: ctx.skippedImages, unknownVariables: ctx.unknownVariables };
  }

  // Le fichier choisi, lu et converti : { html, headerFooter, skippedImages, unknownVariables }, ou une erreur à code (tooBig, unreadable, empty, library : la bibliothèque ne s'est pas chargée).
  async function fromFile(file) {
    const text = await readText(file);
    try { await ensureLibLoaded(); } catch (e) { throw fail('library', { cause: e }); }
    return toDocument(text);
  }

  return { ensureLibLoaded, fromFile, toDocument, MAX_BYTES };
})();
