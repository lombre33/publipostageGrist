// Formats d'affichage d'Excel (`numFmt` : « #,##0.00\ "€" », « dd/mm/yyyy », « 0.0% »...) : le TEXTE qu'Excel montrerait pour une valeur. Un classeur .xlsx ne garde que la valeur brute d'un nombre ou d'une
// date (12.5, 46298) et le code de format de sa case ; l'import d'une grille (js/grid-xlsx-import.js, sujet 18 du 02/10) a besoin du texte affiché, ExcelJS ne l'écrit pas.
//   XlsxNumberFormat.format(value, code, { lang })  ->  string
//     value : un nombre, une date (Date, lue en UTC : ExcelJS les rend ainsi), du texte ou un booléen ; code : le format de la case (« General » si vide) ; lang : 'fr' (virgule décimale, espace
//     insécable entre les milliers, jours et mois en français) ou 'en' (point décimal, virgule entre les milliers).
// Géré : les sections `positif;négatif;zéro;texte`, `General`, les chiffres `0 # ?` avec point décimal, milliers et pourcentage, les textes entre guillemets, les caractères échappés (`\ `), `[$€-40C]`
// (le symbole), les couleurs et conditions entre crochets (ignorées), `_x` et `*x` (ignorés : ce sont des espaces de mise en page), les chiffres répartis entre des textes (`00 00 00 00 00`), les dates et
// heures (`yyyy mm dd hh mm ss AM/PM`, `mmm`, `mmmm`, `ddd`, `dddd`, `[h]:mm`), les formats de date « système » d'Excel qui dépendent de la langue (`mm-dd-yy`, `[$-F800]`). Pas géré, rendu comme `General` :
// la notation scientifique (`0.00E+00`) et les fractions (`# ?/?`). Pur : Intl seulement, ni DOM ni éditeur. Script classique, portée globale comme TableBorders.
const XlsxNumberFormat = (function () {
  const LOCALES = { fr: 'fr-FR', en: 'en-US' };
  const EPOCH_UTC_MS = Date.UTC(1899, 11, 30); // le jour 0 des numéros de série d'Excel (le jour 1 est le 31/12/1899 : l'erreur de 1900 d'Excel reste en deçà du 01/03/1900)
  const DAY_MS = 86400000;
  // Les formats « système » d'Excel (la date courte de la machine) : ExcelJS les nomme `mm-dd-yy` (n° 14) et `m/d/yy "h":mm` (n° 22) ; ils s'écrivent dans l'ordre de la langue. Un format que la personne a écrit
  // elle-même (`m/d/yyyy`) est un format ordinaire : il reste tel que le classeur le dit.
  const LOCALIZED_CODES = {
    fr: { 'mm-dd-yy': 'dd/mm/yyyy', 'm/d/yy "h":mm': 'dd/mm/yyyy hh:mm', '[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy': 'dddd d mmmm yyyy', '[$-F400]h:mm:ss\\ AM/PM': 'hh:mm:ss' },
    en: { 'mm-dd-yy': 'm/d/yyyy', 'm/d/yy "h":mm': 'm/d/yyyy h:mm', '[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy': 'dddd, mmmm d, yyyy', '[$-F400]h:mm:ss\\ AM/PM': 'h:mm:ss AM/PM' },
  };

  // --- Découpe d'un format -----------------------------------------------------------------------------------------------------------------------------------

  // Les sections d'un format, séparées par `;` hors guillemets, crochets et caractères échappés.
  function splitSections(code) {
    const out = [];
    let current = '';
    let quote = false;
    let bracket = false;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (quote) { current += ch; if (ch === '"') quote = false; continue; }
      if (bracket) { current += ch; if (ch === ']') bracket = false; continue; }
      if (ch === '"') { quote = true; current += ch; continue; }
      if (ch === '[') { bracket = true; current += ch; continue; }
      if (ch === '\\') { current += ch + (code[i + 1] || ''); i++; continue; }
      if (ch === ';') { out.push(current); current = ''; continue; }
      current += ch;
    }
    out.push(current);
    return out;
  }

  // Les jetons d'une section : textes (`lit`), chiffres (`dig`), point (`pt`), séparateur de milliers (`thou`), pourcentage (`pct`), texte de la case (`txt`), `General` (`gen`), et les jetons de date
  // (`y`, `mo`, `d`, `h`, `s`, `ap`, `el`), plus `sci` et `frac` (non gérés).
  function tokenize(section) {
    const tokens = [];
    const lit = (s) => { if (s) tokens.push({ k: 'lit', s }); };
    const run = (i, re) => { let j = i; while (j < section.length && re.test(section[j])) j++; return j; };
    let i = 0;
    while (i < section.length) {
      const ch = section[i];
      const rest = section.slice(i);
      if (ch === '"') { const end = section.indexOf('"', i + 1); const stop = end < 0 ? section.length : end; lit(section.slice(i + 1, stop)); i = stop + 1; continue; }
      if (ch === '\\') { lit(section[i + 1] || ''); i += 2; continue; }
      if (ch === '_' || ch === '*') { i += 2; continue; }
      if (ch === '[') {
        const end = section.indexOf(']', i);
        const inner = end < 0 ? section.slice(i + 1) : section.slice(i + 1, end);
        i = end < 0 ? section.length : end + 1;
        const currency = /^\$([^-\]]*)(?:-.*)?$/.exec(inner);
        if (currency) { lit(currency[1]); continue; }
        const elapsed = /^(h+|m+|s+)$/i.exec(inner);
        if (elapsed) tokens.push({ k: 'el', u: elapsed[1][0].toLowerCase(), n: elapsed[1].length });
        continue; // une couleur ou une condition : sans effet sur le texte
      }
      if (ch === '0' || ch === '#' || ch === '?') { tokens.push({ k: 'dig', c: ch }); i++; continue; }
      if (ch === '.') { tokens.push({ k: 'pt' }); i++; continue; }
      if (ch === ',') { tokens.push({ k: 'thou' }); i++; continue; }
      if (ch === '%') { tokens.push({ k: 'pct' }); i++; continue; }
      if (ch === '@') { tokens.push({ k: 'txt' }); i++; continue; }
      if (/^general/i.test(rest)) { tokens.push({ k: 'gen' }); i += 7; continue; }
      if (/^e[+-]/i.test(rest)) { tokens.push({ k: 'sci' }); i += 2; continue; }
      const ampm = /^(AM\/PM|am\/pm|A\/P|a\/p)/.exec(rest);
      if (ampm) { tokens.push({ k: 'ap', short: ampm[1].length === 3, lower: ampm[1] === ampm[1].toLowerCase() }); i += ampm[1].length; continue; }
      if (/[yY]/.test(ch)) { const j = run(i, /[yY]/); tokens.push({ k: 'y', n: j - i }); i = j; continue; }
      if (/[mM]/.test(ch)) { const j = run(i, /[mM]/); tokens.push({ k: 'mo', n: j - i }); i = j; continue; }
      if (/[dD]/.test(ch)) { const j = run(i, /[dD]/); tokens.push({ k: 'd', n: j - i }); i = j; continue; }
      if (/[hH]/.test(ch)) { const j = run(i, /[hH]/); tokens.push({ k: 'h', n: j - i }); i = j; continue; }
      if (/[sS]/.test(ch)) { const j = run(i, /[sS]/); tokens.push({ k: 's', n: j - i }); i = j; continue; }
      if (ch === '/' && tokens.some(t => t.k === 'dig')) { tokens.push({ k: 'frac' }); i++; continue; }
      lit(ch);
      i++;
    }
    return tokens;
  }

  const DATE_KINDS = new Set(['y', 'mo', 'd', 'h', 's', 'ap', 'el']);
  const isDateSection = tokens => tokens.some(t => DATE_KINDS.has(t.k));

  // --- Nombres -----------------------------------------------------------------------------------------------------------------------------------------------

  // Un nombre sans format (« Standard ») : jusqu'à 11 chiffres significatifs, comme Excel ; un entier garde tous ses chiffres.
  function general(value, lang) {
    if (!Number.isFinite(value)) return String(value);
    const text = Number.isInteger(value) && Math.abs(value) < 1e15 ? String(value) : String(Number(value.toPrecision(11))).replace('e', 'E');
    return lang === 'fr' ? text.replace('.', ',') : text;
  }

  // Le texte d'un nombre dans une section de chiffres : `abs` est la valeur absolue déjà mise à l'échelle (pourcentage, milliers) ; le signe se règle avant.
  function renderDigits(abs, tokens, lang) {
    const first = tokens.findIndex(t => t.k === 'dig');
    let last = -1;
    tokens.forEach((t, i) => { if (t.k === 'dig') last = i; });
    const point = tokens.findIndex((t, i) => t.k === 'pt' && i > first && i < last);
    const intTokens = tokens.slice(first, point < 0 ? last + 1 : point).filter(t => t.k === 'dig');
    const fracTokens = point < 0 ? [] : tokens.slice(point + 1, last + 1).filter(t => t.k === 'dig');
    const minInt = intTokens.filter(t => t.c === '0').length;
    const minFrac = fracTokens.filter(t => t.c === '0').length;
    const between = tokens.slice(first, point < 0 ? last + 1 : point);
    const grouping = between.some((t, i) => t.k === 'thou' && between.slice(0, i).some(d => d.k === 'dig') && between.slice(i + 1).some(d => d.k === 'dig'));
    const interleaved = between.some(t => t.k === 'lit');
    const locale = LOCALES[lang] || LOCALES.fr;
    if (interleaved && !fracTokens.length) {
      // Des chiffres répartis entre des textes (`00 00 00 00 00`, `000-00`) : les chiffres remplissent les emplacements de droite à gauche.
      const digits = String(Math.round(abs));
      let at = digits.length;
      const placed = [];
      for (let i = between.length - 1; i >= 0; i--) {
        const t = between[i];
        if (t.k === 'dig') {
          if (at > 0) { placed.unshift(digits[--at]); } else if (t.c === '0') placed.unshift('0'); else if (t.c === '?') placed.unshift(' '); else placed.unshift('');
        } else if (t.k === 'lit') placed.unshift(t.s);
      }
      const extra = at > 0 ? digits.slice(0, at) : '';
      const text = extra + placed.join('');
      return { first, end: (point < 0 ? last : point - 1), text };
    }
    // L'espace fine insécable de Intl fr-FR devient l'espace insécable ordinaire, comme dans une bulle nombre (js/variable-format.js).
    let text = new Intl.NumberFormat(locale, { minimumIntegerDigits: Math.max(1, minInt), minimumFractionDigits: minFrac, maximumFractionDigits: fracTokens.length, useGrouping: grouping }).format(abs).replace(/\u202f/g, '\u00a0');
    if (!minInt) text = text.replace(/^0(?=\D|$)/, '');
    return { first, end: last, text };
  }

  function renderNumberSection(value, tokens, lang, negativeShown) {
    if (tokens.some(t => t.k === 'sci' || t.k === 'frac')) return null;
    if (tokens.some(t => t.k === 'gen')) {
      const text = general(Math.abs(value), lang);
      const out = tokens.map(t => (t.k === 'gen' ? text : t.k === 'lit' ? t.s : '')).join('');
      return (negativeShown ? '-' : '') + out;
    }
    let abs = Math.abs(value);
    tokens.forEach(t => { if (t.k === 'pct') abs *= 100; });
    // Des virgules juste derrière le dernier chiffre divisent par 1000 chacune (`#,##0,` : des milliers).
    let lastDig = -1;
    tokens.forEach((t, i) => { if (t.k === 'dig') lastDig = i; });
    let drop = new Set();
    for (let i = lastDig + 1; lastDig >= 0 && i < tokens.length && tokens[i].k === 'thou'; i++) { abs /= 1000; drop.add(i); }
    const live = tokens.filter((_, i) => !drop.has(i));
    if (!live.some(t => t.k === 'dig')) return (negativeShown ? '-' : '') + live.map(t => (t.k === 'lit' ? t.s : t.k === 'pct' ? '%' : '')).join('');
    const block = renderDigits(abs, live, lang);
    const out = live.map((t, i) => {
      if (i < block.first) return t.k === 'lit' ? t.s : t.k === 'pct' ? '%' : '';
      if (i === block.first) return block.text;
      if (i <= block.end) return '';
      return t.k === 'lit' ? t.s : t.k === 'pct' ? '%' : '';
    }).join('');
    return (negativeShown ? '-' : '') + out;
  }

  // --- Dates -------------------------------------------------------------------------------------------------------------------------------------------------

  function serialOf(date) { return (date.getTime() - EPOCH_UTC_MS) / DAY_MS; }
  function dateOfSerial(serial) { return new Date(EPOCH_UTC_MS + Math.round(serial * DAY_MS)); }
  const two = n => String(n).padStart(2, '0');

  function renderDateSection(date, tokens, lang) {
    const locale = LOCALES[lang] || LOCALES.fr;
    const names = (opts) => new Intl.DateTimeFormat(locale, Object.assign({ timeZone: 'UTC' }, opts)).format(date);
    const serial = serialOf(date);
    const twelve = tokens.some(t => t.k === 'ap');
    const hour24 = date.getUTCHours();
    const kinds = tokens.filter(t => t.k !== 'lit');
    const millis = String(date.getUTCMilliseconds()).padStart(3, '0');
    let afterSeconds = false;
    let fractionAt = 0;
    return tokens.map((t) => {
      if (t.k === 'lit') return t.s;
      // `ss.00` : les centièmes de seconde, les chiffres qui suivent les secondes ; ailleurs un chiffre ne s'écrit pas dans une date.
      if (t.k === 'dig') return afterSeconds ? (millis[fractionAt++] || '0') : '';
      if (t.k === 'pt') return '.';
      if (t.k === 'thou') return ',';
      if (t.k === 'y') return t.n <= 2 ? two(date.getUTCFullYear() % 100) : String(date.getUTCFullYear());
      if (t.k === 'mo') {
        const at = kinds.indexOf(t);
        const before = kinds[at - 1];
        const after = kinds[at + 1];
        // « m » est une minute juste après les heures ou juste avant les secondes, un mois sinon.
        if ((before && (before.k === 'h' || (before.k === 'el' && before.u === 'h'))) || (after && (after.k === 's' || (after.k === 'el' && after.u === 's')))) return t.n === 1 ? String(date.getUTCMinutes()) : two(date.getUTCMinutes());
        if (t.n === 1) return String(date.getUTCMonth() + 1);
        if (t.n === 2) return two(date.getUTCMonth() + 1);
        if (t.n === 3) return names({ month: 'short' });
        if (t.n === 4) return names({ month: 'long' });
        return names({ month: 'long' }).charAt(0).toUpperCase();
      }
      if (t.k === 'd') {
        if (t.n === 1) return String(date.getUTCDate());
        if (t.n === 2) return two(date.getUTCDate());
        return names({ weekday: t.n === 3 ? 'short' : 'long' });
      }
      if (t.k === 'h') { const h = twelve ? (hour24 % 12 || 12) : hour24; return t.n === 1 ? String(h) : two(h); }
      if (t.k === 's') { afterSeconds = true; const s = date.getUTCSeconds(); return t.n === 1 ? String(s) : two(s); }
      if (t.k === 'ap') { const text = t.short ? (hour24 < 12 ? 'A' : 'P') : (hour24 < 12 ? 'AM' : 'PM'); return t.lower ? text.toLowerCase() : text; }
      if (t.k === 'el') {
        const total = t.u === 'h' ? Math.floor(serial * 24 + 1e-9) : t.u === 'm' ? Math.floor(serial * 1440 + 1e-9) : Math.floor(serial * 86400 + 1e-9);
        return t.n === 1 ? String(total) : String(total).padStart(t.n, '0');
      }
      return '';
    }).join('');
  }

  // --- Entrée ------------------------------------------------------------------------------------------------------------------------------------------------

  function format(value, code, options) {
    const lang = options && options.lang === 'en' ? 'en' : 'fr';
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'boolean') return lang === 'fr' ? (value ? 'VRAI' : 'FAUX') : (value ? 'TRUE' : 'FALSE');
    let fmt = String(code || 'General').trim() || 'General';
    if (LOCALIZED_CODES[lang] && LOCALIZED_CODES[lang][fmt]) fmt = LOCALIZED_CODES[lang][fmt];
    const sections = splitSections(fmt).map(tokenize);
    if (typeof value === 'string') {
      const section = sections.length >= 4 ? sections[3] : sections.find(tokens => tokens.some(t => t.k === 'txt'));
      if (!section) return value;
      return section.map(t => (t.k === 'txt' ? value : t.k === 'lit' ? t.s : '')).join('');
    }
    let number;
    let date = null;
    if (Object.prototype.toString.call(value) === '[object Date]') {
      if (Number.isNaN(value.getTime())) return '';
      date = value;
      number = serialOf(value);
    } else if (typeof value === 'number') {
      number = value;
    } else {
      return String(value);
    }
    if (!Number.isFinite(number)) return String(number);
    // Quelle section : positif, négatif (valeur absolue, son signe est dans le format), zéro.
    let index = 0;
    let negativeShown = false;
    if (number < 0 && sections.length >= 2) index = 1;
    else if (number < 0) negativeShown = true;
    else if (number === 0 && sections.length >= 3) index = 2;
    const tokens = sections[index] || sections[0];
    if (isDateSection(tokens)) {
      if (!date && number < 0) return '';
      return renderDateSection(date || dateOfSerial(number), tokens, lang);
    }
    // Une date dont la case n'a pas de format de date (`General`) : la date courte de la langue, avec l'heure si elle n'est pas minuit.
    if (date && tokens.some(t => t.k === 'gen')) {
      const short = tokenize(LOCALIZED_CODES[lang]['mm-dd-yy']);
      const withTime = date.getTime() % DAY_MS !== 0 ? short.concat(tokenize(' hh:mm:ss')) : short;
      return renderDateSection(date, withTime, lang);
    }
    const rendered = renderNumberSection(number, tokens, lang, negativeShown);
    if (rendered !== null) return rendered;
    return general(number, lang);
  }

  // Le format de la case est-il un format de date ou d'heure ? (ExcelJS rend une Date pour ceux qu'il reconnaît ; un nombre dont le format est une date s'affiche aussi en date.)
  function isDateFormat(code) {
    if (!code) return false;
    const fmt = String(code).trim();
    if (LOCALIZED_CODES.fr[fmt]) return true;
    return splitSections(fmt).some(section => isDateSection(tokenize(section)));
  }

  return { format, isDateFormat, dateOfSerial, serialOf };
})();
