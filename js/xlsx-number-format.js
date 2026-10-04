// Formats d'affichage d'Excel (`numFmt` : « #,##0.00\ "€" », « dd/mm/yyyy », « 0.0% »...) : le texte qu'Excel montrerait pour une valeur. Un classeur
// .xlsx ne garde que la valeur brute d'un nombre ou d'une date (12.5, 46298) et le code de format de sa case ; l'import d'une grille
// (js/grid-xlsx-import.js) a besoin du texte affiché, ExcelJS ne l'écrit pas.
//   XlsxNumberFormat.format(value, code, { lang }) -> string
//     value : un nombre, une date (Date, lue en UTC : ExcelJS les rend ainsi), du texte ou un booléen ; code : le format de la case (« General » si
//     vide) ; lang : 'fr' (virgule décimale, espace insécable entre les milliers, jours et mois en français) ou 'en' (point décimal, virgule entre
//     les milliers).
// Géré : les sections `positif;négatif;zéro;texte`, `General`, les chiffres `0 # ?` avec point décimal, milliers et pourcentage, les textes entre
// guillemets, les caractères échappés (`\ `), `[$€-40C]` (le symbole), les couleurs et conditions entre crochets (ignorées), `_x` et `*x` (ignorés :
// ce sont des espaces de mise en page), les chiffres répartis entre des textes (`00 00 00 00 00`), les dates et heures (`yyyy mm dd hh mm ss AM/PM`,
// `mmm`, `mmmm`, `ddd`, `dddd`, `[h]:mm`), les formats de date « système » d'Excel qui dépendent de la langue (`mm-dd-yy`, `[$-F800]`). Pas géré,
// rendu comme `General` : la notation scientifique (`0.00E+00`) et les fractions (`# ?/?`). Pur : Intl seulement, ni DOM ni éditeur. Script
// classique, portée globale comme TableBorders.
const XlsxNumberFormat = (function () {
  const LOCALES = { fr: 'fr-FR', en: 'en-US' };
  // Un Intl.NumberFormat ou DateTimeFormat met des dizaines de microsecondes à se construire, un format de case à se découper : une feuille répète
  // les mêmes sur des milliers de cases, d'où ces deux caches (quelques entrées chacun).
  const formatters = new Map();
  function intl(Kind, locale, options) {
    const key = Kind.name + locale + JSON.stringify(options);
    let formatter = formatters.get(key);
    if (!formatter) { formatter = new Kind(locale, options); formatters.set(key, formatter); }
    return formatter;
  }
  // le jour 0 des numéros de série d'Excel (le jour 1 est le 31/12/1899 : l'erreur de 1900 d'Excel reste en deçà du 01/03/1900)
  const EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
  const DAY_MS = 86400000;
  // Les formats « système » d'Excel (la date courte de la machine) : ExcelJS les nomme `mm-dd-yy` (n° 14) et `m/d/yy "h":mm` (n° 22) ; ils s'écrivent
  // dans l'ordre de la langue. Un format que la personne a écrit elle-même (`m/d/yyyy`) est un format ordinaire : il reste tel que le classeur le
  // dit.
  const LOCALIZED_CODES = {
    fr: { 'mm-dd-yy': 'dd/mm/yyyy', 'm/d/yy "h":mm': 'dd/mm/yyyy hh:mm', '[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy': 'dddd d mmmm yyyy', '[$-F400]h:mm:ss\\ AM/PM': 'hh:mm:ss' },
    en: { 'mm-dd-yy': 'm/d/yyyy', 'm/d/yy "h":mm': 'm/d/yyyy h:mm', '[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy': 'dddd, mmmm d, yyyy', '[$-F400]h:mm:ss\\ AM/PM': 'h:mm:ss AM/PM' },
  };

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

  // Les jetons d'une section : textes (`lit`), chiffres (`dig`), point (`pt`), séparateur de milliers (`thou`), pourcentage (`pct`), texte de la case
  // (`txt`), `General` (`gen`), et les jetons de date (`y`, `mo`, `d`, `h`, `s`, `ap`, `el`), plus `sci` et `frac` (non gérés).
  const SIMPLE_TOKENS = { '.': 'pt', ',': 'thou', '%': 'pct', '@': 'txt' };
  const DATE_RUNS = { y: /[yY]/, mo: /[mM]/, d: /[dD]/, h: /[hH]/, s: /[sS]/ }; // le jeton d'une suite de y, de m, de d...
  const pushLiteral = (tokens, s) => { if (s) tokens.push({ k: 'lit', s }); };
  const runEnd = (section, i, re) => { let j = i; while (j < section.length && re.test(section[j])) j++; return j; };
  // Chaque lecteur lit le jeton qui commence à la position `i`, l'ajoute à `tokens` et rend la position qui suit.
  function readQuoted(section, i, tokens) {
    const end = section.indexOf('"', i + 1);
    const stop = end < 0 ? section.length : end;
    pushLiteral(tokens, section.slice(i + 1, stop));
    return stop + 1;
  }
  function readBracket(section, i, tokens) {
    const end = section.indexOf(']', i);
    const inner = end < 0 ? section.slice(i + 1) : section.slice(i + 1, end);
    const next = end < 0 ? section.length : end + 1;
    const currency = /^\$([^-\]]*)(?:-.*)?$/.exec(inner);
    if (currency) { pushLiteral(tokens, currency[1]); return next; }
    const elapsed = /^(h+|m+|s+)$/i.exec(inner);
    if (elapsed) tokens.push({ k: 'el', u: elapsed[1][0].toLowerCase(), n: elapsed[1].length });
    return next; // une couleur ou une condition : sans effet sur le texte
  }
  // Un mot (`General`, `E+`, `AM/PM`) ou une suite de lettres de date ; -1 quand le caractère n'en commence aucun.
  function readWord(section, i, tokens) {
    const rest = section.slice(i);
    if (/^general/i.test(rest)) { tokens.push({ k: 'gen' }); return i + 7; }
    if (/^e[+-]/i.test(rest)) { tokens.push({ k: 'sci' }); return i + 2; }
    const ampm = /^(AM\/PM|am\/pm|A\/P|a\/p)/.exec(rest);
    if (ampm) { tokens.push({ k: 'ap', short: ampm[1].length === 3, lower: ampm[1] === ampm[1].toLowerCase() }); return i + ampm[1].length; }
    const unit = Object.keys(DATE_RUNS).find(k => DATE_RUNS[k].test(section[i]));
    if (!unit) return -1;
    const j = runEnd(section, i, DATE_RUNS[unit]);
    tokens.push({ k: unit, n: j - i });
    return j;
  }
  function readToken(section, i, tokens) {
    const ch = section[i];
    if (ch === '"') return readQuoted(section, i, tokens);
    if (ch === '\\') { pushLiteral(tokens, section[i + 1] || ''); return i + 2; }
    if (ch === '_' || ch === '*') return i + 2;
    if (ch === '[') return readBracket(section, i, tokens);
    if (ch === '0' || ch === '#' || ch === '?') { tokens.push({ k: 'dig', c: ch }); return i + 1; }
    if (SIMPLE_TOKENS[ch]) { tokens.push({ k: SIMPLE_TOKENS[ch] }); return i + 1; }
    const word = readWord(section, i, tokens);
    if (word >= 0) return word;
    if (ch === '/' && tokens.some(t => t.k === 'dig')) { tokens.push({ k: 'frac' }); return i + 1; }
    pushLiteral(tokens, ch);
    return i + 1;
  }
  function tokenize(section) {
    const tokens = [];
    let i = 0;
    while (i < section.length) i = readToken(section, i, tokens);
    return tokens;
  }

  const sectionCache = new Map();
  function sectionsOf(fmt) {
    let sections = sectionCache.get(fmt);
    if (!sections) {
      if (sectionCache.size >= 500) sectionCache.clear();
      sections = splitSections(fmt).map(tokenize);
      sectionCache.set(fmt, sections);
    }
    return sections;
  }

  const DATE_KINDS = new Set(['y', 'mo', 'd', 'h', 's', 'ap', 'el']);
  const isDateSection = tokens => tokens.some(t => DATE_KINDS.has(t.k));

  // Un nombre sans format (« Standard ») : jusqu'à 11 chiffres significatifs, comme Excel ; un entier garde tous ses chiffres.
  function general(value, lang) {
    if (!Number.isFinite(value)) return String(value);
    const text = Number.isInteger(value) && Math.abs(value) < 1e15 ? String(value) : String(Number(value.toPrecision(11))).replace('e', 'E');
    return lang === 'fr' ? text.replace('.', ',') : text;
  }

  const EMPTY_SLOT = { 0: '0', '?': ' ', '#': '' }; // ce qu'un emplacement de chiffre écrit quand il n'y a plus de chiffre à y mettre

  // Le texte d'un nombre dans une section de chiffres : `abs` est la valeur absolue déjà mise à l'échelle (pourcentage, milliers) ; le signe se règle
  // avant.
  function renderDigits(abs, tokens, lang) {
    const first = tokens.findIndex(t => t.k === 'dig');
    let last = -1;
    tokens.forEach((t, i) => { if (t.k === 'dig') last = i; });
    const point = tokens.findIndex((t, i) => t.k === 'pt' && i > first && i < last);
    const between = tokens.slice(first, point < 0 ? last + 1 : point);
    const fracTokens = point < 0 ? [] : tokens.slice(point + 1, last + 1).filter(t => t.k === 'dig');
    const minInt = between.filter(t => t.k === 'dig' && t.c === '0').length;
    const minFrac = fracTokens.filter(t => t.c === '0').length;
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
        if (t.k === 'dig') placed.push(at > 0 ? digits[--at] : EMPTY_SLOT[t.c]);
        else if (t.k === 'lit') placed.push(t.s);
      }
      return { first, end: (point < 0 ? last : point - 1), text: digits.slice(0, at) + placed.reverse().join('') };
    }
    // L'espace fine insécable de Intl fr-FR devient l'espace insécable ordinaire, comme dans une bulle nombre (js/variable-format.js).
    const numbers = intl(Intl.NumberFormat, locale, { minimumIntegerDigits: Math.max(1, minInt), minimumFractionDigits: minFrac, maximumFractionDigits: fracTokens.length, useGrouping: grouping });
    let text = numbers.format(abs).replace(/\u202f/g, '\u00a0');
    if (!minInt) text = text.replace(/^0(?=\D|$)/, '');
    return { first, end: last, text };
  }

  const plain = t => (t.k === 'lit' ? t.s : t.k === 'pct' ? '%' : ''); // ce qu'écrit un jeton qui n'est pas un chiffre

  function renderNumberSection(value, tokens, lang, negativeShown) {
    if (tokens.some(t => t.k === 'sci' || t.k === 'frac')) return null;
    const sign = negativeShown ? '-' : '';
    if (tokens.some(t => t.k === 'gen')) {
      const text = general(Math.abs(value), lang);
      return sign + tokens.map(t => (t.k === 'gen' ? text : t.k === 'lit' ? t.s : '')).join('');
    }
    let abs = Math.abs(value);
    tokens.forEach(t => { if (t.k === 'pct') abs *= 100; });
    // Des virgules juste derrière le dernier chiffre divisent par 1000 chacune (`#,##0,` : des milliers).
    let lastDig = -1;
    tokens.forEach((t, i) => { if (t.k === 'dig') lastDig = i; });
    let drop = new Set();
    for (let i = lastDig + 1; lastDig >= 0 && i < tokens.length && tokens[i].k === 'thou'; i++) { abs /= 1000; drop.add(i); }
    const live = tokens.filter((_, i) => !drop.has(i));
    if (!live.some(t => t.k === 'dig')) return sign + live.map(plain).join('');
    const block = renderDigits(abs, live, lang);
    return sign + live.map((t, i) => (i === block.first ? block.text : i > block.first && i <= block.end ? '' : plain(t))).join('');
  }

  function serialOf(date) { return (date.getTime() - EPOCH_UTC_MS) / DAY_MS; }
  function dateOfSerial(serial) { return new Date(EPOCH_UTC_MS + Math.round(serial * DAY_MS)); }
  const two = n => String(n).padStart(2, '0');

  // « m » est une minute juste après les heures ou juste avant les secondes, un mois sinon.
  function isMinuteToken(kinds, t) {
    const at = kinds.indexOf(t);
    const before = kinds[at - 1];
    const after = kinds[at + 1];
    const afterHours = before && (before.k === 'h' || (before.k === 'el' && before.u === 'h'));
    return afterHours || (after && (after.k === 's' || (after.k === 'el' && after.u === 's')));
  }
  // Le texte de chaque jeton de date ; `c` garde ce que la date partage entre ses jetons (`afterSeconds`, `fractionAt` : les chiffres qui suivent
  // les secondes).
  function monthOrMinuteText(t, c) {
    if (isMinuteToken(c.kinds, t)) return t.n === 1 ? String(c.date.getUTCMinutes()) : two(c.date.getUTCMinutes());
    if (t.n === 1) return String(c.date.getUTCMonth() + 1);
    if (t.n === 2) return two(c.date.getUTCMonth() + 1);
    if (t.n === 3) return c.names({ month: 'short' });
    if (t.n === 4) return c.names({ month: 'long' });
    return c.names({ month: 'long' }).charAt(0).toUpperCase();
  }
  function dayText(t, c) {
    if (t.n === 1) return String(c.date.getUTCDate());
    if (t.n === 2) return two(c.date.getUTCDate());
    return c.names({ weekday: t.n === 3 ? 'short' : 'long' });
  }
  function hourText(t, c) { const h = c.twelve ? (c.hour24 % 12 || 12) : c.hour24; return t.n === 1 ? String(h) : two(h); }
  function secondsText(t, c) { c.afterSeconds = true; const s = c.date.getUTCSeconds(); return t.n === 1 ? String(s) : two(s); }
  function meridiemText(t, c) {
    const text = t.short ? (c.hour24 < 12 ? 'A' : 'P') : (c.hour24 < 12 ? 'AM' : 'PM');
    return t.lower ? text.toLowerCase() : text;
  }
  function elapsedText(t, c) {
    const perDay = t.u === 'h' ? 24 : t.u === 'm' ? 1440 : 86400;
    const total = Math.floor(c.serial * perDay + 1e-9);
    return t.n === 1 ? String(total) : String(total).padStart(t.n, '0');
  }
  const DATE_TEXT = {
    lit: t => t.s, pt: () => '.', thou: () => ',', mo: monthOrMinuteText, d: dayText, h: hourText, s: secondsText, ap: meridiemText, el: elapsedText,
    y: (t, c) => (t.n <= 2 ? two(c.date.getUTCFullYear() % 100) : String(c.date.getUTCFullYear())),
    // `ss.00` : les centièmes de seconde, les chiffres qui suivent les secondes ; ailleurs un chiffre ne s'écrit pas dans une date.
    dig: (t, c) => (c.afterSeconds ? (c.millis[c.fractionAt++] || '0') : ''),
  };

  function renderDateSection(date, tokens, lang) {
    const locale = LOCALES[lang] || LOCALES.fr;
    const c = {
      date,
      names: opts => intl(Intl.DateTimeFormat, locale, Object.assign({ timeZone: 'UTC' }, opts)).format(date),
      serial: serialOf(date),
      twelve: tokens.some(t => t.k === 'ap'),
      hour24: date.getUTCHours(),
      kinds: tokens.filter(t => t.k !== 'lit'),
      millis: String(date.getUTCMilliseconds()).padStart(3, '0'),
      afterSeconds: false,
      fractionAt: 0,
    };
    return tokens.map((t) => { const text = DATE_TEXT[t.k]; return text ? text(t, c) : ''; }).join('');
  }

  const booleanText = (value, lang) => (lang === 'fr' ? (value ? 'VRAI' : 'FAUX') : (value ? 'TRUE' : 'FALSE'));

  // Le code de la case dans la langue demandée : « General » s'il est vide, les formats « système » d'Excel dans l'ordre de la langue.
  function formatCodeOf(code, lang) {
    let fmt = String(code || 'General').trim() || 'General';
    if (LOCALIZED_CODES[lang] && LOCALIZED_CODES[lang][fmt]) fmt = LOCALIZED_CODES[lang][fmt];
    return fmt;
  }

  // Un texte : la section texte (la quatrième, ou celle qui porte `@`), sinon le texte tel quel.
  function formatText(value, sections) {
    const section = sections.length >= 4 ? sections[3] : sections.find(tokens => tokens.some(t => t.k === 'txt'));
    if (!section) return value;
    return section.map(t => (t.k === 'txt' ? value : t.k === 'lit' ? t.s : '')).join('');
  }

  // Ni texte ni booléen : le nombre de la case (une date en est un, son numéro de série) et sa date s'il y en a une ; `done` quand il n'y a rien
  // à mettre en forme.
  function numericInput(value) {
    if (Object.prototype.toString.call(value) === '[object Date]') {
      if (Number.isNaN(value.getTime())) return { done: '' };
      return { number: serialOf(value), date: value };
    }
    if (typeof value === 'number') return { number: value, date: null };
    return { done: String(value) };
  }

  // Quelle section : positif, négatif (valeur absolue, son signe est dans le format), zéro.
  function pickSection(number, sections) {
    let index = 0;
    let negativeShown = false;
    if (number < 0 && sections.length >= 2) index = 1;
    else if (number < 0) negativeShown = true;
    else if (number === 0 && sections.length >= 3) index = 2;
    return { tokens: sections[index] || sections[0], negativeShown };
  }

  // Une date dont la case n'a pas de format de date (`General`) : la date courte de la langue, avec l'heure si elle n'est pas minuit.
  function renderGeneralDate(date, lang) {
    const short = tokenize(LOCALIZED_CODES[lang]['mm-dd-yy']);
    const withTime = date.getTime() % DAY_MS !== 0 ? short.concat(tokenize(' hh:mm:ss')) : short;
    return renderDateSection(date, withTime, lang);
  }

  function formatNumber(number, date, sections, lang) {
    if (!Number.isFinite(number)) return String(number);
    const { tokens, negativeShown } = pickSection(number, sections);
    if (isDateSection(tokens)) {
      if (!date && number < 0) return '';
      return renderDateSection(date || dateOfSerial(number), tokens, lang);
    }
    if (date && tokens.some(t => t.k === 'gen')) return renderGeneralDate(date, lang);
    const rendered = renderNumberSection(number, tokens, lang, negativeShown);
    if (rendered !== null) return rendered;
    return general(number, lang);
  }

  function format(value, code, options) {
    const lang = options && options.lang === 'en' ? 'en' : 'fr';
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'boolean') return booleanText(value, lang);
    const sections = sectionsOf(formatCodeOf(code, lang));
    if (typeof value === 'string') return formatText(value, sections);
    const input = numericInput(value);
    if (input.done !== undefined) return input.done;
    return formatNumber(input.number, input.date, sections, lang);
  }

  // Le format de la case est-il un format de date ou d'heure ? (ExcelJS rend une Date pour ceux qu'il reconnaît ; un nombre dont le format est une
  // date s'affiche aussi en date.)
  function isDateFormat(code) {
    if (!code) return false;
    const fmt = String(code).trim();
    if (LOCALIZED_CODES.fr[fmt]) return true;
    return sectionsOf(fmt).some(isDateSection);
  }

  return { format, isDateFormat };
})();
