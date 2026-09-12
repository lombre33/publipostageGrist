// Formatage nombre/date d'une bulle #Variable - aucune dépendance externe :
// Intl.NumberFormat/Intl.DateTimeFormat couvrent tout sauf l'écriture d'un
// nombre en toutes lettres (pas d'équivalent Intl), écrite à la main
// ci-dessous (orthographe classique - "vingt et un", pas la réforme de 1990
// "vingt-et-un" - la forme encore attendue dans un contrat).
const VariableFormat = (function () {
  // labelEn n'est pas une traduction du texte français mais ce que ce même
  // préréglage produit réellement une fois dateLocale() basculée sur
  // 'en-US' - l'ordre jour/mois change lui-même avec la locale.
  const DATE_PRESETS = [
    { key: 'dmy_slash_full', label: '12/09/2026', labelEn: '09/12/2026', options: { day: '2-digit', month: '2-digit', year: 'numeric' } },
    { key: 'dmy_slash_short', label: '12/9/26', labelEn: '9/12/26', shortNoPad: true },
    { key: 'iso', label: '2026-09-12', labelEn: '2026-09-12', iso: true },
    { key: 'd_mmm_yyyy', label: '12 sept. 2026', labelEn: 'Sep 12, 2026', options: { day: 'numeric', month: 'short', year: 'numeric' } },
    { key: 'd_mmmm_yyyy', label: '12 septembre 2026', labelEn: 'September 12, 2026', options: { day: 'numeric', month: 'long', year: 'numeric' } },
    { key: 'ddd_d_mmm_yyyy', label: 'mar. 12 sept. 2026', labelEn: 'Sat, Sep 12, 2026', options: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } },
    { key: 'dddd_d_mmmm_yyyy', label: 'mardi 12 septembre 2026', labelEn: 'Saturday, September 12, 2026', options: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } },
  ];
  // Suit la langue de l'interface, jamais le style fr/us éventuellement déjà
  // choisi sur cette variable précise (resterait confus d'afficher un
  // libellé anglais alors que l'interface est en français).
  function presetLabel(preset) {
    return (typeof I18n !== 'undefined' && I18n.getLang() === 'en') ? (preset.labelEn || preset.label) : preset.label;
  }
  // Contrairement au nombre (opts.style), une date n'a pas de réglage
  // d'override par variable - suit uniquement la langue globale de l'interface.
  function dateLocale() {
    return (typeof I18n !== 'undefined' && I18n.getLang() === 'en') ? 'en-US' : 'fr-FR';
  }

  // Une colonne Date/DateTime Grist arrive ici soit en timestamp Unix en
  // secondes (nombre), soit en chaîne déjà formatée (ex. "2026-09-12", via
  // grist.onRecord) - une chaîne est confiée telle quelle au constructeur
  // Date natif, jamais parseFloat/multipliée par 1000 (parseFloat("2026-09-12")
  // ne lit que "2026", confondu avec un timestamp Unix - symptôme "1/1/1970" constaté).
  // Chaque composant est lu en UTC partout dans ce fichier, jamais en heure
  // locale : une colonne Date pure est ancrée à minuit UTC pour son jour
  // civil, la lire en heure locale ferait dériver d'un jour entier pour tout
  // fuseau à l'ouest de l'UTC.
  function gristDateToJsDate(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'number') return Number.isFinite(val) ? new Date(val * 1000) : null;
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Assemble une chaîne à partir des "parts" d'Intl.DateTimeFormat#formatToParts,
  // en ne gardant que jour/mois/année demandés (boutons J/M/A de la barre de
  // formatage). Un séparateur n'est conservé que s'il se trouve entre deux
  // composants gardés, jamais en tête/fin ni collé à un composant retiré
  // (sinon "M A" laisserait un "/" fantôme en tête).
  function buildDateStringFromParts(parts, keep) {
    let result = '';
    let pendingLiteral = '';
    let wroteAny = false;
    parts.forEach(part => {
      if (part.type === 'literal') { pendingLiteral += part.value; return; }
      const shouldKeep = Object.prototype.hasOwnProperty.call(keep, part.type) ? keep[part.type] : true;
      if (!shouldKeep) { pendingLiteral = ''; return; }
      if (wroteAny) result += pendingLiteral;
      result += part.value;
      pendingLiteral = '';
      wroteAny = true;
    });
    return result;
  }
  // Convertit en toutes lettres chaque composant encore purement numérique
  // après filtrage - un nom de mois déjà écrit en toutes lettres reste tel
  // quel, seuls jour/année (et un mois numérique éventuel) sont convertis.
  function wordifyDateParts(parts) {
    const toWords = dateLocale() === 'en-US' ? numberToWordsEn : numberToWordsFr;
    return parts.map(part => (/^\d+$/.test(part.value) ? Object.assign({}, part, { value: toWords(parseInt(part.value, 10)) }) : part));
  }

  function formatDate(val, format) {
    const date = gristDateToJsDate(val);
    if (!date) return '';
    format = format || {};
    const preset = DATE_PRESETS.find(p => p.key === format.preset) || DATE_PRESETS[0];
    const keep = {
      day: format.day !== false,
      month: format.month !== false,
      year: format.year !== false,
    };
    let parts;
    if (preset.iso) {
      const y = String(date.getUTCFullYear());
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      parts = [{ type: 'year', value: y }, { type: 'literal', value: '-' }, { type: 'month', value: m }, { type: 'literal', value: '-' }, { type: 'day', value: d }];
    } else if (preset.shortNoPad) {
      // Construit à la main plutôt que via Intl.DateTimeFormat : la locale
      // fr-FR zéro-remplit jour/mois même avec `numeric` (vérifié - aucune
      // option Intl ne produit "12/9/26" non complété), ce préréglage existe
      // justement pour s'en distinguer de dmy_slash_full. Ordre ET locale
      // suivent I18n.getLang() comme le reste de ce fichier - jour/mois
      // d'abord en français, mois/jour d'abord en anglais (convention US).
      const day = String(date.getUTCDate());
      const month = String(date.getUTCMonth() + 1);
      const year = String(date.getUTCFullYear()).slice(-2);
      const first = dateLocale() === 'en-US' ? { type: 'month', value: month } : { type: 'day', value: day };
      const second = dateLocale() === 'en-US' ? { type: 'day', value: day } : { type: 'month', value: month };
      parts = [first, { type: 'literal', value: '/' }, second, { type: 'literal', value: '/' }, { type: 'year', value: year }];
    } else {
      parts = new Intl.DateTimeFormat(dateLocale(), Object.assign({ timeZone: 'UTC' }, preset.options)).formatToParts(date);
    }
    if (format.words) parts = wordifyDateParts(parts);
    return buildDateStringFromParts(parts, keep);
  }

  // --- Nombre en toutes lettres (français, orthographe classique) ---
  const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix'];

  // n dans [0,99]. "et" pour 21/31/41/51/61/71, mais pas 81 (quatre-vingt-un).
  // 71/91 passent par soixante/quatre-vingt + un nombre de 10-19. `hasFollowing`
  // = autre chose s'écrit après ce nombre dans le nombre entier - "vingt"
  // perd alors son 's' (quatre-vingts seul, mais quatre-vingt mille/-un).
  function twoDigitsToWords(n, hasFollowing) {
    if (n < 20) return UNITS[n];
    const tens = Math.floor(n / 10);
    const unit = n % 10;
    if (tens === 7 || tens === 9) {
      const base = tens === 7 ? 'soixante' : 'quatre-vingt';
      if (unit === 1 && tens === 7) return base + ' et onze';
      return base + '-' + UNITS[10 + unit];
    }
    if (unit === 0) return (tens === 8 && !hasFollowing) ? 'quatre-vingts' : TENS[tens];
    if (unit === 1 && tens >= 2 && tens !== 8) return TENS[tens] + ' et un';
    return TENS[tens] + '-' + UNITS[unit];
  }
  // n dans [0,999]. "cent"/"cents" : un 's' seulement si multiplié (>1) et
  // rien ne suit après ce nombre - "vingt" et "cent" sont les deux seuls
  // mots de nombre qui prennent la marque du pluriel, et la perdent dès
  // qu'un autre mot de nombre les suit.
  function threeDigitsToWords(n, hasFollowing) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    let words = '';
    if (h > 0) {
      words = h === 1 ? 'cent' : UNITS[h] + ' cent';
      if (rest === 0 && h > 1 && !hasFollowing) words += 's';
      if (rest > 0) words += ' ' + twoDigitsToWords(rest, hasFollowing);
    } else if (rest > 0) {
      words = twoDigitsToWords(rest, hasFollowing);
    }
    return words;
  }
  // "mille" toujours invariable, jamais précédé de "un" - contrairement à
  // "million"/"milliard", de vrais noms qui prennent "un" et un 's' au
  // pluriel. N'écrit que la partie entière (la partie décimale est gérée à part par numberToWordsFr).
  function integerToWordsFr(rounded) {
    if (rounded === 0) return 'zéro';
    const scales = [
      { divisor: 1e9, singular: 'milliard', plural: 'milliards' },
      { divisor: 1e6, singular: 'million', plural: 'millions' },
      { divisor: 1e3, singular: 'mille', plural: 'mille' },
    ];
    let remaining = rounded;
    const groups = [];
    scales.forEach(s => {
      const count = Math.floor(remaining / s.divisor);
      remaining %= s.divisor;
      if (count > 0) groups.push(Object.assign({ count }, s));
    });
    const unitsCount = remaining;
    const parts = [];
    groups.forEach((g, idx) => {
      // Un groupe a "quelque chose qui suit" dès qu'un groupe de rang
      // inférieur existe encore, ou qu'il reste des unités après. "mille"
      // est différent : ce n'est pas un nom mais une particule
      // multiplicative, "vingt"/"cent" la perdent donc toujours devant
      // "mille" ("quatre-vingt mille", "deux cent mille").
      const hasFollowing = g.divisor === 1e3 ? true : (idx < groups.length - 1 || unitsCount > 0);
      if (g.divisor === 1e3) parts.push(g.count === 1 ? 'mille' : threeDigitsToWords(g.count, hasFollowing) + ' mille');
      else parts.push(threeDigitsToWords(g.count, hasFollowing) + ' ' + (g.count > 1 ? g.plural : g.singular));
    });
    if (unitsCount > 0 || groups.length === 0) parts.push(threeDigitsToWords(unitsCount, false));
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  // Écriture en toutes lettres, partie décimale incluse si `decimals` est
  // renseigné (0-3) - pas d'arrondi silencieux à l'entier le plus proche, un
  // montant "1234,56" doit pouvoir s'écrire avec sa partie décimale.
  // `decimals` absent/null = comportement historique (entier le plus proche).
  function numberToWordsFr(n, decimals) {
    const isNegative = n < 0;
    const d = decimals == null ? 0 : decimals;
    const factor = Math.pow(10, d);
    const roundedTotal = Math.round(Math.abs(n) * factor);
    const intPart = Math.floor(roundedTotal / factor);
    const fracPart = roundedTotal - intPart * factor;
    let words = integerToWordsFr(intPart);
    if (d > 0) words += ' virgule ' + integerToWordsFr(fracPart);
    return (isNegative && roundedTotal > 0 ? 'moins ' : '') + words;
  }

  // --- Nombre en toutes lettres (anglais, convention américaine) ---
  // Bien plus simple que le français : "hundred"/"thousand"/"million"/
  // "billion" restent toujours invariables, et l'anglais courant/légal omet
  // "and" entre les centaines et le reste ("one hundred twenty-one").
  const UNITS_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS_EN = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function twoDigitsToWordsEn(n) {
    if (n < 20) return UNITS_EN[n];
    const tens = Math.floor(n / 10);
    const unit = n % 10;
    return unit === 0 ? TENS_EN[tens] : TENS_EN[tens] + '-' + UNITS_EN[unit];
  }
  function threeDigitsToWordsEn(n) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    let words = '';
    if (h > 0) {
      words = UNITS_EN[h] + ' hundred';
      if (rest > 0) words += ' ' + twoDigitsToWordsEn(rest);
    } else if (rest > 0) {
      words = twoDigitsToWordsEn(rest);
    }
    return words;
  }
  function integerToWordsEn(rounded) {
    if (rounded === 0) return 'zero';
    const scales = [
      { divisor: 1e9, name: 'billion' },
      { divisor: 1e6, name: 'million' },
      { divisor: 1e3, name: 'thousand' },
    ];
    let remaining = rounded;
    const parts = [];
    scales.forEach(s => {
      const count = Math.floor(remaining / s.divisor);
      remaining %= s.divisor;
      if (count > 0) parts.push(threeDigitsToWordsEn(count) + ' ' + s.name);
    });
    if (remaining > 0 || parts.length === 0) parts.push(threeDigitsToWordsEn(remaining));
    return parts.join(' ');
  }
  function numberToWordsEn(n, decimals) {
    const isNegative = n < 0;
    const d = decimals == null ? 0 : decimals;
    const factor = Math.pow(10, d);
    const roundedTotal = Math.round(Math.abs(n) * factor);
    const intPart = Math.floor(roundedTotal / factor);
    const fracPart = roundedTotal - intPart * factor;
    let words = integerToWordsEn(intPart);
    if (d > 0) words += ' point ' + integerToWordsEn(fracPart);
    return (isNegative && roundedTotal > 0 ? 'minus ' : '') + words;
  }

  // Forme en toutes lettres d'une devise, pour l'accoler au nombre en
  // lettres ("mille euros"/"a thousand euros", pas "mille €") - repli sur le
  // symbole/texte tel quel pour une devise personnalisée non reconnue.
  const CURRENCY_WORDS_FR = { '€': 'euro', '$': 'dollar', '£': 'livre' };
  const CURRENCY_WORDS_EN = { '€': 'euro', '$': 'dollar', '£': 'pound' };
  function currencyWords(symbol, count, lang) {
    const base = (lang === 'en' ? CURRENCY_WORDS_EN : CURRENCY_WORDS_FR)[symbol];
    if (!base) return symbol;
    return count > 1 || count < -1 ? base + 's' : base;
  }

  // Langue effective pour l'écriture en lettres/la locale Intl d'un NOMBRE -
  // un override explicite par variable (opts.style 'fr'/'us') prime toujours
  // sur la langue globale de l'interface ; 'none' (pas de séparateur de
  // milliers, orthogonal au choix de langue) et l'absence de réglage suivent
  // tous les deux I18n.getLang().
  function numberLang(style) {
    if (style === 'us') return 'en';
    if (style === 'fr') return 'fr';
    return (typeof I18n !== 'undefined' && I18n.getLang() === 'en') ? 'en' : 'fr';
  }

  // opts = { style: 'fr'|'us'|'none', decimals: 0-3|null, currency: ''|'€'|'$'|texte, words: bool }
  function formatNumber(val, opts) {
    if (val == null || val === '') return '';
    const n = typeof val === 'number' ? val : parseFloat(val);
    if (!Number.isFinite(n)) return String(val);
    opts = opts || {};
    const lang = numberLang(opts.style);
    if (opts.words) {
      const words = lang === 'en' ? numberToWordsEn(n, opts.decimals) : numberToWordsFr(n, opts.decimals);
      return opts.currency ? `${words} ${currencyWords(opts.currency, Math.round(n), lang)}` : words;
    }
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    const intlOpts = {};
    if (opts.decimals != null) { intlOpts.minimumFractionDigits = opts.decimals; intlOpts.maximumFractionDigits = opts.decimals; }
    if (opts.style === 'none') intlOpts.useGrouping = false;
    let formatted = new Intl.NumberFormat(locale, intlOpts).format(n);
    if (opts.currency) formatted = locale === 'fr-FR' ? `${formatted} ${opts.currency}` : `${opts.currency}${formatted}`;
    return formatted;
  }

  return { DATE_PRESETS, presetLabel, formatDate, formatNumber, numberToWordsFr, numberToWordsEn };
})();
