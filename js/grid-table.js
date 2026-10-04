// Tableaux de tableur pour une grille (planning/feature-mode-grille-excel.md). Un tableur (Excel, Google Sheets, LibreOffice Calc) pose dans le
// presse-papiers un tableau HTML dont la mise en forme est dans une feuille de style (`class=xl65`) ou en ligne : ce module le lit case par case et
// le réécrit en HTML d'éditeur avec ce que la grille sait garder (fusions, fond, gras / italique / souligné / barré, couleur et taille du texte,
// alignements horizontal et vertical, traits, retours à la ligne dans la case, liens). Un modèle de cases unique :
//   { width, cols: [px], rows: [{ height: px, cells: [{ col, colspan, rowspan, html, align, valign, fill, borders: { top, right, bottom, left } }]
//   }] }
// où `html` est le contenu en ligne déjà écrit (marques comprises) : le presse-papiers (`fromClipboardHtml`) et un classeur .xlsx
// (js/grid-xlsx-import.js) y arrivent chacun de leur côté et sortent par le même `toHtml`, si bien qu'un tableau collé et un tableau importé ne
// peuvent pas diverger.
// Un document (hors grille) reçoit le même tableau, en cases : `toDocumentHtml` n'écrit que ce que le PDF et le Word d'un tableau de document lisent
// (fusions, fond, texte, alignement horizontal, liens, largeur des colonnes) et ni traits case par case, ni alignement vertical, ni hauteur de ligne
// : l'éditeur les montrerait, mais l'export ne les lit que pour une grille (une ligne qui porte `data-row-height` en fait une).
// Pur : DOMParser seulement, ni éditeur ni ProseMirror. Script classique, portée globale comme TableBorders.
const GridTable = (function () {
  const MAX_ROWS = 3000;
  const MAX_COLS = 300;
  // Qui prévenir quand un tableau de tableur dépasse ce que la mise en forme garde (MAX_ROWS lignes, MAX_COLS colonnes) : il est alors collé tel
  // quel (rewriteSpreadsheetHtml). Un seul rappel, posé par js/main.js ; sans lui rien n'est dit (module seul, tests). Il rend le rappel précédent :
  // un test qui pose le sien le remet ensuite.
  let onTooBig = null;
  function setTooBigHandler(handler) {
    const before = onTooBig;
    onTooBig = typeof handler === 'function' ? handler : null;
    return before;
  }
  const TABLE_RE = /<table[\s>]/i;
  // Ce que posent les tableurs, avec de quoi les reconnaître : Excel (ProgId et espace de noms Office), Google Sheets (élément et attributs
  // `sheets`), LibreOffice (generator).
  const SPREADSHEET_RE = /urn:schemas-microsoft-com:office:excel|name=["']?ProgId["']?\s+content=["']?Excel|google-sheets-html-origin|data-sheets-(?:root|value)|name=["']?generator["']?\s+content=["']?(?:Sheets|LibreOffice)/i;
  const SAFE_LINK_RE = /^(?:https?:|mailto:|tel:)/i;
  // Le gris des traits de quadrillage de Google Sheets (`td { border: 1px solid #cccccc }` sur chaque case) : c'est le trait de départ de la grille,
  // pas un trait choisi.
  const GRIDLINE_GRAYS = ['#cccccc'];
  const SKIPPED_TAGS = new Set(['script', 'style', 'img', 'svg', 'table', 'object', 'iframe', 'video', 'audio', 'canvas', 'head', 'title', 'meta', 'link', 'noscript']);
  const BLOCK_TAGS = new Set(['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol']);
  const SEMANTIC_TAGS = {
    b: { bold: true }, strong: { bold: true }, i: { italic: true }, em: { italic: true }, cite: { italic: true }, var: { italic: true },
    u: { underline: true }, ins: { underline: true }, s: { strike: true }, strike: { strike: true }, del: { strike: true },
  };
  const NAMED_COLORS = {
    black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', gray: '#808080', grey: '#808080',
    silver: '#c0c0c0', maroon: '#800000', navy: '#000080', teal: '#008080', lime: '#00ff00', aqua: '#00ffff', cyan: '#00ffff', fuchsia: '#ff00ff', magenta: '#ff00ff', olive: '#808000',
    pink: '#ffc0cb', brown: '#a52a2a', gold: '#ffd700', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', darkgrey: '#a9a9a9', darkblue: '#00008b', darkgreen: '#006400',
    darkred: '#8b0000', lightblue: '#add8e6', lightgreen: '#90ee90', lightyellow: '#ffffe0', skyblue: '#87ceeb', violet: '#ee82ee', indigo: '#4b0082', coral: '#ff7f50', salmon: '#fa8072',
  };

  const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttr = text => escapeHtml(text).replace(/"/g, '&quot;');
  const clampInt = (value, min, max) => { const n = parseInt(value, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };

  // « a: b; c: rgb(1, 2, 3) » -> { a: 'b', c: 'rgb(1, 2, 3)' }, en gardant l'ordre d'écriture dans `order` (le dernier gagne entre `border` et
  // `border-top`). Les `mso-*` d'Office sont ignorés, `!important` aussi.
  function parseDecls(text) {
    const out = [];
    let depth = 0;
    let quote = '';
    let current = '';
    const flush = () => {
      const at = current.indexOf(':');
      if (at > 0) {
        const name = current.slice(0, at).trim().toLowerCase();
        const value = current.slice(at + 1).replace(/!important/i, '').trim();
        if (name && value && !name.startsWith('mso-')) out.push([name, value]);
      }
      current = '';
    };
    for (const ch of String(text || '')) {
      if (quote) { if (ch === quote) quote = ''; current += ch; continue; }
      if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ';' && depth === 0) { flush(); continue; }
      current += ch;
    }
    flush();
    return out;
  }

  function parseColor(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text || ['transparent', 'none', 'auto', 'inherit', 'initial', 'unset'].includes(text)) return null;
    if (text === 'windowtext' || text === 'currentcolor') return '#000000';
    if (text === 'window') return '#ffffff';
    let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
    if (m) return '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    if (/^#[0-9a-f]{6}$/.test(text)) return text;
    m = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(text);
    if (m) {
      const alpha = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      if (alpha === 0) return null;
      return '#' + [m[1], m[2], m[3]].map(n => Math.min(255, Math.round(parseFloat(n))).toString(16).padStart(2, '0')).join('');
    }
    return NAMED_COLORS[text] || null;
  }

  // Une longueur CSS en points (11.0pt, 14px, .5in) ; null si elle n'en est pas une.
  function toPt(value) {
    const m = /^(-?\d*\.?\d+)\s*(pt|px|in|cm|mm)?$/i.exec(String(value || '').trim());
    if (!m) return null;
    const n = parseFloat(m[1]);
    const unit = (m[2] || 'px').toLowerCase();
    return { pt: n, px: n * 0.75, in: n * 72, cm: n * 28.3465, mm: n * 2.83465 }[unit];
  }
  const toPx = value => { const pt = toPt(value); return pt === null ? null : pt / 0.75; };

  // Les règles `tag`, `.classe`, `tag.classe` des <style> d'un tableur (Excel les range dans <!-- ... --> et y mêle des `@page`) ; les autres
  // sélecteurs sont ignorés.
  function parseRules(cssText) {
    const rules = [];
    const text = String(cssText || '').replace(/<!--|-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(text))) {
      const decls = parseDecls(m[2]);
      m[1].split(',').forEach(selector => {
        const parsed = /^([a-z][a-z0-9]*)?((?:\.[\w-]+)*)$/i.exec(selector.trim());
        if (!parsed || (!parsed[1] && !parsed[2])) return;
        rules.push({ tag: (parsed[1] || '').toLowerCase(), classes: parsed[2] ? parsed[2].slice(1).split('.') : [], decls, order: rules.length });
      });
    }
    return rules;
  }

  // Le style que l'élément porte de lui-même : attributs de présentation (`align`, `valign`, `bgcolor`, `color` de <font>), puis les règles (la
  // balise avant la classe, la règle écrite plus tard avant la plus ancienne), puis son attribut `style`. { props: { nom: valeur }, seq: { nom:
  // rang } } : le rang dit quelle écriture a eu le dernier mot.
  function ownStyle(el, rules) {
    const props = {};
    const seq = {};
    let rank = 0;
    // Une valeur que CSS refuse n'écrase rien : `td { text-align: general }` d'Excel n'est pas du CSS, l'attribut `align=right` de la case reste donc
    // celui qui compte.
    const set = (name, value) => {
      if (name === 'text-align' && !/^(left|right|center|justify|start|end|inherit|initial|unset)$/i.test(String(value).trim())) return;
      props[name] = value;
      seq[name] = rank++;
    };
    [['align', 'text-align'], ['valign', 'vertical-align'], ['bgcolor', 'background-color'], ['color', 'color']].forEach(([attr, name]) => {
      const value = el.getAttribute && el.getAttribute(attr);
      if (value) set(name, value);
    });
    const specificity = rule => rule.classes.length * 10 + (rule.tag ? 1 : 0);
    rules
      .filter(rule => (!rule.tag || el.localName === rule.tag) && rule.classes.every(name => el.classList && el.classList.contains(name)))
      .sort((a, b) => specificity(a) - specificity(b) || a.order - b.order)
      .forEach(rule => rule.decls.forEach(([name, value]) => set(name, value)));
    parseDecls(el.getAttribute && el.getAttribute('style')).forEach(([name, value]) => set(name, value));
    return { props, seq };
  }

  // La mise en forme du texte portée par un style ; seules les propriétés écrites y figurent (le reste hérite). `size` en points, absente quand elle
  // vaut celle du tableur.
  function textFormat(style, baseSizePt) {
    const p = style.props;
    const fmt = {};
    if (p['font-weight'] !== undefined) fmt.bold = /^(bold|bolder|[6-9]00)$/i.test(p['font-weight']);
    if (p['font-style'] !== undefined) fmt.italic = /^(italic|oblique)/i.test(p['font-style']);
    const decoration = p['text-decoration'] !== undefined ? p['text-decoration'] : p['text-decoration-line'];
    if (decoration !== undefined) { fmt.underline = /underline/i.test(decoration); fmt.strike = /line-through/i.test(decoration); }
    if (p.color !== undefined) { const color = parseColor(p.color); fmt.color = color === '#000000' ? null : color; }
    if (p['font-size'] !== undefined) {
      const pt = toPt(p['font-size']);
      fmt.size = pt !== null && Math.abs(pt - baseSizePt) > 0.05 ? Math.round(pt * 2) / 2 : null;
    }
    return fmt;
  }

  function collectInline(node, state, out) {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) { out.push({ text: child.nodeValue, fmt: state.fmt }); return; }
      if (child.nodeType !== 1) return;
      const tag = child.localName;
      if (SKIPPED_TAGS.has(tag)) return;
      if (tag === 'br') { out.push({ br: true }); return; }
      let fmt = Object.assign({}, state.fmt, SEMANTIC_TAGS[tag] || {}, textFormat(ownStyle(child, state.rules), state.baseSizePt));
      if (tag === 'a') {
        const href = (child.getAttribute('href') || '').trim();
        if (SAFE_LINK_RE.test(href)) fmt = Object.assign({}, fmt, { href });
      }
      const block = BLOCK_TAGS.has(tag);
      if (block) out.push({ blockBreak: true });
      collectInline(child, Object.assign({}, state, { fmt }), out);
      if (block) out.push({ blockBreak: true });
    });
  }

  // Les jetons d'une case en HTML d'éditeur : espaces blancs réduits comme le fait un navigateur (le texte d'Excel est coupé en lignes de code),
  // espaces de bord ôtés, retours à la ligne gardés (`<br>` : un retour dans la case), jamais en bout de case.
  function tokensToHtml(tokens) {
    const items = [];
    tokens.forEach((token) => {
      if (token.blockBreak) { if (items.length && !items[items.length - 1].br) items.push({ br: true }); return; }
      if (token.br) { items.push({ br: true }); return; }
      const text = token.text.replace(/[ \t\r\n\f]+/g, ' ');
      if (text) items.push({ text, fmt: token.fmt });
    });
    // Espaces : un seul entre deux textes, aucun au bord d'une ligne.
    let last = '';
    items.forEach((item, i) => {
      if (item.br) { last = ''; return; }
      let text = item.text;
      if (!last || /[ \u00a0]/.test(last)) text = text.replace(/^[ \u00a0]+/, '');
      const next = items[i + 1];
      if (!next || next.br) text = text.replace(/[ \u00a0]+$/, '');
      item.text = text;
      if (text) last = text.slice(-1);
    });
    while (items.length && (items[items.length - 1].br || !items[items.length - 1].text)) items.pop();
    while (items.length && (items[0].br || !items[0].text)) items.shift();
    return items.map(item => (item.br ? '<br>' : markHtml(escapeHtml(item.text), item.fmt))).join('');
  }

  // Un texte déjà échappé dans ses marques : gras, italique, souligné, barré, couleur et taille du texte (un <span style> que l'éditeur relit en
  // `textStyle`), lien.
  function markHtml(escaped, fmt) {
    let html = escaped;
    if (!fmt) return html;
    if (fmt.strike) html = `<s>${html}</s>`;
    if (fmt.underline) html = `<u>${html}</u>`;
    if (fmt.italic) html = `<em>${html}</em>`;
    if (fmt.bold) html = `<strong>${html}</strong>`;
    const css = [];
    if (fmt.color) css.push(`color: ${fmt.color}`);
    if (fmt.size) css.push(`font-size: ${fmt.size}pt`);
    if (css.length) html = `<span style="${css.join('; ')}">${html}</span>`;
    if (fmt.href) html = `<a href="${escapeAttr(fmt.href)}">${html}</a>`;
    return html;
  }

  // « .5pt solid windowtext », « 1px solid #000000 », « none » -> '#rrggbb', ou null (« pas de trait » du tableur = le trait de départ de la grille,
  // comme le quadrillage d'Excel qui n'est pas copié).
  function parseBorder(value) {
    const tokens = String(value || '').trim().split(/\s+(?![^(]*\))/).filter(Boolean);
    if (!tokens.length) return null;
    const styleToken = tokens.find(t => /^(none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset)$/i.test(t));
    if (!styleToken || /^(none|hidden)$/i.test(styleToken)) return null;
    const width = tokens.find(t => /^-?\d*\.?\d+(pt|px|in|cm|mm)?$/i.test(t));
    if (width !== undefined && parseFloat(width) === 0) return null;
    const color = tokens.map(parseColor).find(Boolean) || '#000000';
    return GRIDLINE_GRAYS.includes(color) ? null : color;
  }

  // La valeur d'un côté : celle de `border` ou de `border-<côté>`, la dernière écrite l'emporte.
  function borderSide(style, side) {
    const general = style.seq.border;
    const own = style.seq['border-' + side];
    if (general === undefined && own === undefined) return null;
    return parseBorder(own !== undefined && (general === undefined || own > general) ? style.props['border-' + side] : style.props.border);
  }

  const NUMBER_RE = /^[+\-−]?\s*(?:[€$£¥]\s*)?\d[\d\s  .,']*\s*(?:%|[€$£¥]|[A-Za-z]{1,3})?$/;

  function horizontalAlign(style, text) {
    const raw = String(style.props['text-align'] || '').trim().toLowerCase();
    if (raw === 'left' || raw === 'start') return null;
    if (raw === 'center' || raw === 'right' || raw === 'justify') return raw;
    if (raw === 'end') return 'right';
    // « Standard » (`general`) : Excel et Sheets alignent les nombres à droite sans l'écrire.
    return NUMBER_RE.test(text) ? 'right' : null;
  }

  // Excel et Sheets écrivent `vertical-align: bottom` sur toutes les cases (c'est leur alignement de départ) : on ne peut pas y lire un choix. Le bas
  // est donc ignoré et la case garde l'alignement de la grille (le milieu) ; le haut et le milieu, eux, ne s'écrivent que quand la personne les a
  // choisis.
  function verticalAlign(style) {
    const raw = String(style.props['vertical-align'] || '').trim().toLowerCase();
    if (raw === 'top') return 'top';
    if (raw === 'middle' || raw === 'center' || raw === 'justify' || raw === 'distributed') return 'middle';
    return null;
  }

  function fillColor(style) {
    const direct = parseColor(style.props['background-color']);
    if (direct) return direct;
    const shorthand = String(style.props.background || '').trim().split(/\s+(?![^(]*\))/).map(parseColor).find(Boolean);
    return shorthand || null;
  }

  // La largeur (`width`) d'une colonne ou la hauteur (`height`) d'une ligne, en px : l'attribut d'Excel et de Sheets (des px) ou la longueur en ligne
  // (des pt chez Excel).
  function lengthPx(el, rules, name) {
    const attr = el.getAttribute(name);
    if (attr && /^\d+(\.\d+)?$/.test(attr.trim())) return parseFloat(attr);
    const px = toPx(ownStyle(el, rules).props[name]);
    return px === null ? 0 : px;
  }

  // `report` (facultatif) : reçoit `tooBig` ({ kind: 'rows' | 'cols', count, max }) quand le tableau dépasse MAX_ROWS lignes ou MAX_COLS colonnes -
  // le modèle est alors null, comme pour un presse-papiers sans tableau, et la raison se lit ici.
  function fromClipboardHtml(html, report) {
    if (typeof html !== 'string' || !TABLE_RE.test(html)) return null;
    const tooBig = (kind, count, max) => { if (report) report.tooBig = { kind, count, max }; return null; };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return null;
    const rules = [];
    doc.querySelectorAll('style').forEach(el => rules.push(...parseRules(el.textContent)));
    // La taille du texte « de départ » du tableur (Excel : 11 pt sur `td`, Sheets : 10 pt sur la table) : une case n'a une taille à elle que si elle
    // s'en écarte.
    const baseCell = ownStyle(doc.createElement('td'), rules);
    const baseSize = toPt(baseCell.props['font-size']) || toPt(ownStyle(table, rules).props['font-size']) || 11;
    // Ce que le tableur cache (une ligne ou une case masquée, écrite `display:none`) ne se colle pas ; une case fusionnée qui couvre une ligne cachée
    // ne compte que les lignes qui restent.
    const hidden = el => ownStyle(el, rules).props.display === 'none';
    const allRows = Array.from(table.rows);
    const rowEls = allRows.filter(tr => !hidden(tr));
    if (!rowEls.length) return null;
    if (allRows.length > MAX_ROWS) return tooBig('rows', allRows.length, MAX_ROWS);
    const rowIndex = new Map(allRows.map((tr, i) => [tr, i]));
    const shownBefore = [0];
    allRows.forEach((tr, i) => shownBefore.push(shownBefore[i] + (hidden(tr) ? 0 : 1)));

    const occupied = [];
    const rows = rowEls.map((tr, r) => {
      const entries = [];
      let col = 0;
      Array.from(tr.cells).filter(td => !hidden(td)).forEach((td) => {
        while (occupied[r] && occupied[r][col]) col++;
        const colspan = clampInt(td.getAttribute('colspan'), 1, MAX_COLS);
        const from = rowIndex.get(tr);
        const rowspan = Math.max(1, shownBefore[Math.min(allRows.length, from + clampInt(td.getAttribute('rowspan'), 1, MAX_ROWS))] - shownBefore[from]);
        for (let rr = r; rr < r + rowspan; rr++) for (let cc = col; cc < col + colspan; cc++) (occupied[rr] = occupied[rr] || [])[cc] = true;
        entries.push({ col, colspan, rowspan, td });
        col += colspan;
      });
      return { entries, height: lengthPx(tr, rules, 'height') };
    });
    const width = Math.max(1, ...occupied.map(line => (line ? line.length : 0)));
    if (width > MAX_COLS) return tooBig('cols', width, MAX_COLS);

    const model = { width, cols: [], rows: [] };
    // Les colonnes : des <col width> (Excel, Sheets), ou une largeur portée par le <colgroup> lui-même (LibreOffice).
    const pushCol = (el) => { const px = lengthPx(el, rules, 'width'); const span = clampInt(el.getAttribute('span'), 1, MAX_COLS); for (let i = 0; i < span; i++) model.cols.push(px); };
    Array.from(table.children).forEach((el) => {
      if (el.localName === 'col') pushCol(el);
      else if (el.localName === 'colgroup') { const cols = el.querySelectorAll('col'); if (cols.length) cols.forEach(pushCol); else pushCol(el); }
    });
    rows.forEach((row, r) => {
      const cells = row.entries.map(({ col, colspan, rowspan, td }) => {
        const style = ownStyle(td, rules);
        const trStyle = ownStyle(td.parentElement, rules);
        // Les attributs de ligne (`valign`, `bgcolor` d'une <tr> de LibreOffice) valent pour ses cases quand elles n'en disent rien.
        ['vertical-align', 'background-color'].forEach((name) => { if (style.props[name] === undefined && trStyle.props[name] !== undefined) { style.props[name] = trStyle.props[name]; style.seq[name] = 0; } });
        const tokens = [];
        collectInline(td, { fmt: Object.assign({}, textFormat(style, baseSize)), rules, baseSizePt: baseSize }, tokens);
        const html = tokensToHtml(tokens);
        const text = td.textContent.replace(/[\s ]+/g, ' ').trim();
        return {
          col, colspan, rowspan, html,
          align: horizontalAlign(style, text),
          valign: verticalAlign(style),
          fill: fillColor(style),
          borders: { top: borderSide(style, 'top'), right: borderSide(style, 'right'), bottom: borderSide(style, 'bottom'), left: borderSide(style, 'left') },
        };
      });
      // Une ligne qui laisse des emplacements libres (HTML bancal) reçoit des cases vides : le tableau est un rectangle.
      for (let c = 0; c < width; c++) {
        if (!(occupied[r] && occupied[r][c])) cells.push({ col: c, colspan: 1, rowspan: 1, html: '', align: null, valign: null, fill: null, borders: { top: null, right: null, bottom: null, left: null } });
      }
      cells.sort((a, b) => a.col - b.col);
      model.rows.push({ height: row.height, cells });
    });
    return model;
  }

  // Le modèle en HTML d'éditeur. `sizes` : écrire aussi la largeur des colonnes et la hauteur des lignes (un tableau neuf, l'import) ; sans elles (un
  // collage dans une grille qui a déjà les siennes) la grille garde ses colonnes et ses lignes, et celles qu'elle ajoute prennent la taille de leur
  // voisine.
  function toHtml(model, options) {
    const sizes = !!(options && options.sizes);
    const widths = [];
    for (let c = 0; c < model.width; c++) widths.push(Math.round(model.cols[c] || 100));
    const cellHtml = (cell) => {
      const attrs = [];
      if (cell.colspan > 1) attrs.push(`colspan="${cell.colspan}"`);
      if (cell.rowspan > 1) attrs.push(`rowspan="${cell.rowspan}"`);
      if (sizes) attrs.push(`colwidth="${widths.slice(cell.col, cell.col + cell.colspan).join(',')}"`);
      if (cell.valign) attrs.push(`data-valign="${cell.valign}"`);
      ['top', 'right', 'bottom', 'left'].forEach((side) => { if (cell.borders && cell.borders[side]) attrs.push(`data-border-${side}="${cell.borders[side]}"`); });
      if (cell.fill) attrs.push(`style="background-color: ${cell.fill}"`);
      const align = cell.align ? ` style="text-align: ${cell.align}"` : '';
      return `<td${attrs.length ? ' ' + attrs.join(' ') : ''}><p${align}>${cell.html || ''}</p></td>`;
    };
    const rows = model.rows.map((row) => {
      const height = sizes && row.height ? Math.round(row.height) : 0;
      return `<tr${height ? ` data-row-height="${height}" style="height: ${height}px"` : ''}>${row.cells.map(cellHtml).join('')}</tr>`;
    }).join('');
    const total = widths.reduce((sum, w) => sum + w, 0);
    const colgroup = sizes ? `<colgroup>${widths.map(w => `<col style="width: ${w}px;">`).join('')}</colgroup>` : '';
    return `<table${sizes ? ` style="width: ${total}px;"` : ''}>${colgroup}<tbody>${rows}</tbody></table>`;
  }

  // Le modèle en HTML de document : les largeurs des colonnes (le tableau garde les proportions du tableur, l'éditeur le ramène à la page s'il la
  // dépasse), sans hauteur de ligne, sans trait case par case ni alignement vertical (voir l'en-tête).
  function toDocumentHtml(model) {
    const plain = {
      width: model.width,
      cols: model.cols,
      rows: model.rows.map(row => ({ height: 0, cells: row.cells.map(cell => Object.assign({}, cell, { valign: null, borders: null })) })),
    };
    return toHtml(plain, { sizes: true });
  }

  function isSpreadsheetHtml(html) {
    return typeof html === 'string' && TABLE_RE.test(html) && SPREADSHEET_RE.test(html);
  }

  // Le HTML collé, réécrit par `write` quand il vient d'un tableur ; tout autre HTML (un texte, une page web, des cases copiées dans l'éditeur même)
  // est rendu tel quel. Un tableur trop grand l'est aussi, et la personne en est prévenue (setTooBigHandler) : le tableau collé garderait ses cases
  // sans leur mise en forme, elle ne le saurait pas autrement.
  function rewriteSpreadsheetHtml(html, write) {
    if (!isSpreadsheetHtml(html)) return html;
    try {
      const report = {};
      const model = fromClipboardHtml(html, report);
      if (report.tooBig && onTooBig) {
        try { onTooBig(report.tooBig); } catch (e) { console.warn('[GridTable] avertissement d\'un tableau trop grand impossible :', e); }
      }
      return model ? write(model) : html;
    } catch (e) {
      console.warn('[GridTable] tableau collé illisible, collé tel quel :', e);
      return html;
    }
  }

  // Pour la grille : sans largeurs ni hauteurs (la grille garde ses colonnes et ses lignes).
  function cleanPastedHtml(html) { return rewriteSpreadsheetHtml(html, model => toHtml(model, { sizes: false })); }

  // Pour un document : un tableau du document.
  function cleanPastedDocumentHtml(html) { return rewriteSpreadsheetHtml(html, toDocumentHtml); }

  // Le presse-papiers porte-t-il un tableau de tableur ? Excel y joint aussi une image de la plage : sans ce test, c'est elle qui serait collée (dans
  // une grille comme dans un document).
  function clipboardHasSpreadsheetTable(clipboardData) {
    try { return isSpreadsheetHtml(clipboardData && clipboardData.getData('text/html')); } catch (e) { return false; }
  }

  // Un lien qu'une case peut garder : http, https, mailto, tel (un `javascript:` ou un `file:` perd son lien et garde son texte).
  const isSafeLink = href => SAFE_LINK_RE.test(String(href || '').trim());

  return { fromClipboardHtml, toHtml, toDocumentHtml, cleanPastedHtml, cleanPastedDocumentHtml, isSpreadsheetHtml, clipboardHasSpreadsheetTable, isSafeLink, markHtml, escapeHtml, setTooBigHandler };
})();
