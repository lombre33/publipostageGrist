// Formatage d'une bulle #Variable : nombre, date, Oui / Non et liste. Sans dépendance externe : Intl couvre tout sauf l'écriture d'un nombre en
// toutes lettres, écrite ici à la main (orthographe classique « vingt et un », pas la réforme de 1990, forme attendue en contrat).
const VariableFormat = (function () {
  // `labelEn` n'est pas la traduction du libellé français mais ce que ce préréglage produit une fois dateLocale() basculée sur 'en-US' : l'ordre jour
  // / mois change avec la locale.
  const DATE_PRESETS = [
    { key: 'dmy_slash_full', label: '12/09/2026', labelEn: '09/12/2026', options: { day: '2-digit', month: '2-digit', year: 'numeric' } },
    { key: 'dmy_slash_short', label: '12/9/26', labelEn: '9/12/26', shortNoPad: true },
    { key: 'iso', label: '2026-09-12', labelEn: '2026-09-12', iso: true },
    { key: 'd_mmm_yyyy', label: '12 sept. 2026', labelEn: 'Sep 12, 2026', options: { day: 'numeric', month: 'short', year: 'numeric' } },
    { key: 'd_mmmm_yyyy', label: '12 septembre 2026', labelEn: 'September 12, 2026', options: { day: 'numeric', month: 'long', year: 'numeric' } },
    { key: 'ddd_d_mmm_yyyy', label: 'mar. 12 sept. 2026', labelEn: 'Sat, Sep 12, 2026', options: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } },
    { key: 'dddd_d_mmmm_yyyy', label: 'mardi 12 septembre 2026', labelEn: 'Saturday, September 12, 2026', options: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } },
  ];
  // I18n est absent des tests qui chargent ce fichier seul : le français est alors la langue.
  const interfaceIsEnglish = () => typeof I18n !== 'undefined' && I18n.getLang() === 'en';
  // Suit la langue de l'interface, jamais le style fr / us éventuellement choisi sur cette variable : un libellé anglais dans une interface française
  // prêterait à confusion.
  function presetLabel(preset) {
    return interfaceIsEnglish() ? (preset.labelEn || preset.label) : preset.label;
  }
  // Une date n'a pas de réglage de langue par variable, contrairement au nombre (opts.style) : elle suit la langue de l'interface.
  const dateLocale = () => (interfaceIsEnglish() ? 'en-US' : 'fr-FR');

  // Une date arrive en timestamp Unix (secondes) ou en chaîne déjà formatée : la chaîne va telle quelle au constructeur Date, jamais parseFloat *
  // 1000 (« 2026-09-12 » serait pris pour un timestamp). Lu en UTC partout dans ce fichier : une colonne Date pure est ancrée à minuit UTC pour son
  // jour civil.
  function gristDateToJsDate(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'number') return Number.isFinite(val) ? new Date(val * 1000) : null;
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Assemble la chaîne des « parts » d'Intl.DateTimeFormat#formatToParts en ne gardant que le jour, le mois, l'année demandés (boutons J / M / A). Un
  // séparateur n'est gardé qu'entre deux composants gardés, jamais en tête, en fin ni collé à un composant retiré (« M A » garderait sinon un « / »
  // fantôme).
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
  // Écrit en toutes lettres chaque composant encore purement numérique après filtrage : un mois déjà écrit en lettres reste tel quel, seuls le jour,
  // l'année (et un mois numérique) sont convertis.
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
      // Construit à la main : Intl fr-FR complète toujours jour et mois à deux chiffres, même avec `numeric`, et ce préréglage existe pour s'en
      // distinguer.
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

  // n dans [0, 99]. « et » pour 21, 31, 41, 51, 61, 71 mais pas 81 (quatre-vingt-un) ; 71 et 91 passent par soixante / quatre-vingt + un nombre de 10
  // à 19. `hasFollowing` : autre chose s'écrit après ce nombre dans le nombre entier, « vingt » perdant alors son « s » (quatre-vingts seul, mais
  // quatre-vingt mille, quatre-vingt-un).
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
  // n dans [0, 999]. « cent » prend un « s » seulement s'il est multiplié (> 1) et que rien ne suit ce nombre : « vingt » et « cent » sont les deux
  // seuls mots de nombre à porter la marque du pluriel, et la perdent dès qu'un autre mot de nombre les suit.
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
  // « mille » est invariable et jamais précédé de « un », contrairement à « million » et « milliard », de vrais noms qui prennent « un » et un « s »
  // au pluriel. Écrit la partie entière seule (numberToWordsFr écrit les décimales).
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
      // Un groupe a quelque chose qui suit dès qu'un groupe de rang inférieur existe ou qu'il reste des unités. « mille » fait exception : ce n'est
      // pas un nom mais une particule multiplicative, que « vingt » et « cent » perdent toujours devant lui (« quatre-vingt mille », « deux cent
      // mille »).
      const hasFollowing = g.divisor === 1e3 ? true : (idx < groups.length - 1 || unitsCount > 0);
      if (g.divisor === 1e3) parts.push(g.count === 1 ? 'mille' : threeDigitsToWords(g.count, hasFollowing) + ' mille');
      else parts.push(threeDigitsToWords(g.count, hasFollowing) + ' ' + (g.count > 1 ? g.plural : g.singular));
    });
    if (unitsCount > 0 || groups.length === 0) parts.push(threeDigitsToWords(unitsCount, false));
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  // La valeur absolue de `n` arrondie à `decimals` décimales comme le chiffre l'écrit (par Intl, comme formatNumber : un 1,005 que les chiffres
  // montrent « 1,01 » ne s'écrit pas « un euro » en lettres) : { intPart, fracDigits }, la partie entière et les décimales en chiffres, zéros de tête
  // compris (« 05 »).
  function splitAbsolute(n, decimals) {
    const text = new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(n));
    const dot = text.indexOf('.');
    return { intPart: parseInt(dot === -1 ? text : text.slice(0, dot), 10), fracDigits: dot === -1 ? '' : text.slice(dot + 1) };
  }
  // Les décimales dites comme elles s'écrivent : chaque zéro de tête se dit (« 1,05 » : « un virgule zéro cinq »), le reste est un nombre (« 56 » :
  // « cinquante-six »).
  function fractionToWords(digits, toWords, zeroWord) {
    const zeros = /^0*/.exec(digits)[0].length;
    const words = new Array(zeros).fill(zeroWord);
    if (zeros < digits.length) words.push(toWords(parseInt(digits.slice(zeros), 10)));
    return words.join(' ');
  }
  // Écrit un nombre en toutes lettres, décimales comprises quand `decimals` est renseigné (0 à 3) : « 1234,56 » doit pouvoir s'écrire avec sa partie
  // décimale. Sans `decimals`, l'entier le plus proche. Un montant dans une devise connue ne passe pas par ici : ses décimales sont des centimes
  // (amountToWords).
  function numberToWordsFr(n, decimals) {
    const d = decimals == null ? 0 : decimals;
    const { intPart, fracDigits } = splitAbsolute(n, d);
    let words = integerToWordsFr(intPart);
    if (d > 0) words += ' virgule ' + fractionToWords(fracDigits, integerToWordsFr, 'zéro');
    return (n < 0 && (intPart > 0 || /[1-9]/.test(fracDigits)) ? 'moins ' : '') + words;
  }

  // --- Nombre en toutes lettres (anglais, convention américaine) --- Bien plus simple que le français : « hundred », « thousand », « million » et
  // « billion » sont invariables, et l'anglais courant et légal omet « and » entre les centaines et le reste (« one hundred twenty-one »).
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
    const d = decimals == null ? 0 : decimals;
    const { intPart, fracDigits } = splitAbsolute(n, d);
    let words = integerToWordsEn(intPart);
    if (d > 0) words += ' point ' + fractionToWords(fracDigits, integerToWordsEn, 'zero');
    return (n < 0 && (intPart > 0 || /[1-9]/.test(fracDigits)) ? 'minus ' : '') + words;
  }

  // La devise en toutes lettres, accolée au nombre en lettres (« mille euros », « a thousand euros », pas « mille € ») ; le symbole ou le texte tel
  // quel pour une devise personnalisée non reconnue.
  const CURRENCY_WORDS_FR = { '€': 'euro', '$': 'dollar', '£': 'livre' };
  const CURRENCY_WORDS_EN = { '€': 'euro', '$': 'dollar', '£': 'pound' };
  function currencyWords(symbol, count, lang) {
    const base = (lang === 'en' ? CURRENCY_WORDS_EN : CURRENCY_WORDS_FR)[symbol];
    if (!base) return symbol;
    return count > 1 || count < -1 ? base + 's' : base;
  }
  // La petite unité de chaque devise connue (singulier, pluriel) : les décimales d'un montant sont ses centimes.
  const SUBUNIT_WORDS_FR = { '€': ['centime', 'centimes'], '$': ['cent', 'cents'], '£': ['penny', 'pence'] };
  const SUBUNIT_WORDS_EN = { '€': ['cent', 'cents'], '$': ['cent', 'cents'], '£': ['penny', 'pence'] };
  // Un montant dans une devise connue, en toutes lettres : les unités entières puis, s'il y en a, les centimes (« six cent cinquante euros », « un
  // euro et un centime », « cinquante centimes », « mille deux cent trente-quatre euros et cinq centimes »), jamais « virgule ». Deux décimales au
  // plus : un montant qui en a trois s'écrit comme un nombre (null, comme pour une devise inconnue : l'appelant écrit le nombre puis la devise telle
  // quelle). Pluriel dès deux en français (« zéro euro », « un euro »), dès qu'il n'y en a pas un en anglais (« zero euros »). Un million rond ou un
  // milliard rond veut « de » : « un million d’euros ».
  function amountToWords(n, decimals, symbol, lang) {
    const en = lang === 'en';
    const unit = (en ? CURRENCY_WORDS_EN : CURRENCY_WORDS_FR)[symbol];
    const d = decimals == null ? 0 : decimals;
    if (!unit || d > 2) return null;
    const subunit = (en ? SUBUNIT_WORDS_EN : SUBUNIT_WORDS_FR)[symbol];
    const { intPart, fracDigits } = splitAbsolute(n, d);
    const cents = d === 0 ? 0 : parseInt(fracDigits, 10) * (d === 1 ? 10 : 1);
    const toWords = en ? integerToWordsEn : integerToWordsFr;
    const plural = count => (en ? count !== 1 : count > 1);
    const parts = [];
    if (intPart > 0 || cents === 0) {
      const name = plural(intPart) ? unit + 's' : unit;
      const de = !en && intPart > 0 && intPart % 1e6 === 0 ? (/^[aeiouyéèêàâîôû]/i.test(name) ? 'd’' : 'de ') : '';
      parts.push(toWords(intPart) + ' ' + de + name);
    }
    if (cents > 0) parts.push(toWords(cents) + ' ' + subunit[plural(cents) ? 1 : 0]);
    return (n < 0 && (intPart > 0 || cents > 0) ? (en ? 'minus ' : 'moins ') : '') + parts.join(en ? ' and ' : ' et ');
  }

  // La langue d'écriture en lettres et la locale Intl d'un NOMBRE : un réglage de la variable (opts.style 'fr' ou 'us') l'emporte sur la langue de
  // l'interface ; 'none' (qui ne touche pas à la langue) et l'absence de réglage la suivent.
  function numberLang(style) {
    if (style === 'us') return 'en';
    if (style === 'fr') return 'fr';
    return interfaceIsEnglish() ? 'en' : 'fr';
  }

  // Vrai pour une valeur qui est zéro : le nombre 0, ou un texte qui ne s'écrit que 0 (« 0 », « 0,00 », « 0.0 »). Une valeur que l'arrondi seul fait
  // afficher 0 (0,004 à deux décimales) n'est pas nulle. C'est ce que lit l'option « Si la valeur vaut zéro » d'une bulle nombre (`zero: 'hide'`,
  // Variables.formatValue).
  function isZero(val) {
    if (typeof val === 'number') return val === 0;
    return typeof val === 'string' && /^\s*[-+]?0+(?:[.,]0*)?\s*$/.test(val);
  }

  // --- Oui / Non (colonne booléenne) ---
  // format = { type: 'bool', style } : 'text' écrit « vrai » / « faux » (« true » / « false » en anglais), l'écriture aussi d'une bulle sans
  // réglage ; 'accentStrike', 'classic' et 'accentPlain' écrivent une case, cochée ou non, les trois styles de la liste à cases
  // (`data-tasklist-style`, js/main-toolbar.js), au même nom pour que la barre de la bulle et celle de la liste se ressemblent. Dans le texte que
  // rend formatBool, la case est le caractère ☑ ou ☐ : ReaderMode.checkboxNode en fait une vraie case dessinée (`.resolved-checkbox`). Partout où
  // seul du texte compte (champs Objet, À, Cc, Cci, nom du PDF, fenêtres), Variables.formatValue écrit « vrai » / « faux » à la place (option
  // `rawNumbers`). Les deux styles « accent » dessinent la même case : le texte qui suit n'est jamais barré, le barré n'existe que dans la liste à
  // cases.
  const BOOL_CHECKBOX_STYLES = ['accentStrike', 'classic', 'accentPlain'];
  const CHECKED_BOX = '☑';
  const UNCHECKED_BOX = '☐';
  function isCheckboxStyle(style) { return BOOL_CHECKBOX_STYLES.indexOf(style) !== -1; }
  // Le style d'une bulle Oui / Non : l'un des trois styles de case, sinon 'text' (sans réglage, ou réglage d'un autre type).
  function boolStyle(format) {
    return format && format.type === 'bool' && isCheckboxStyle(format.style) ? format.style : 'text';
  }
  // Couleur d'une case (hexa), celle que la Lecture dessine (`currentColor`) et que le PDF, le Word et l'Excel reprennent pour la case : accent plein
  // quand elle est cochée, gris du contour sinon ; « classic » reste noir et gris, comme la case de la liste.
  function checkboxColor(checked, style) {
    if (style === 'classic') return checked ? '#222222' : '#6b7684';
    return checked ? '#2f6fed' : '#767676';
  }
  function formatBool(val, format) {
    if (typeof val !== 'boolean') return val == null ? '' : String(val);
    if (boolStyle(format) === 'text') return I18n.t(val ? 'varFmt.boolTrue' : 'varFmt.boolFalse');
    return val ? CHECKED_BOX : UNCHECKED_BOX;
  }

  // opts = { style: 'fr' | 'us' | 'none', decimals: 0-3 | null, currency: '' | '€' | '$' | texte, words: bool } ; l'option `zero` est traitée avant
  // cet appel, par Variables.formatValue.
  function formatNumber(val, opts) {
    if (val == null || val === '') return '';
    const n = typeof val === 'number' ? val : parseFloat(val);
    if (!Number.isFinite(n)) return String(val);
    opts = opts || {};
    const lang = numberLang(opts.style);
    if (opts.words) {
      const amount = opts.currency ? amountToWords(n, opts.decimals, opts.currency, lang) : null;
      if (amount != null) return amount;
      const words = lang === 'en' ? numberToWordsEn(n, opts.decimals) : numberToWordsFr(n, opts.decimals);
      return opts.currency ? `${words} ${currencyWords(opts.currency, Math.round(n), lang)}` : words;
    }
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    const intlOpts = {};
    if (opts.decimals != null) { intlOpts.minimumFractionDigits = opts.decimals; intlOpts.maximumFractionDigits = opts.decimals; }
    if (opts.style === 'none') intlOpts.useGrouping = false;
    // L'espace fine insécable (U+202F) qu'Intl met entre les milliers en français manque à la police des PDF (pdfmake, Roboto) : elle s'y peignait en
    // case vide et décalait la suite de la ligne. L'espace insécable (U+00A0) y est, et se lit pareil partout ailleurs (Lecture, Word, email).
    let formatted = new Intl.NumberFormat(locale, intlOpts).format(n).replace(/\u202f/g, '\u00a0');
    if (opts.currency) formatted = locale === 'fr-FR' ? `${formatted} ${opts.currency}` : `${opts.currency}${formatted}`;
    return formatted;
  }

  // --- Liste (colonne Choix multiple ou Référence multiple) ---
  // format.list = { pick, index, separator, lastSeparator, perValue } : ce que règle la fenêtre « Liste » (js/variable-list.js). Sans réglage, toutes
  // les valeurs s'écrivent dans l'ordre de la cellule, séparées par « , » (Variables.formatValue). `pick` : 'all' (toutes : `separator` entre
  // chacune, `lastSeparator` avant la dernière, le même séparateur si vide), 'first', 'last' ou 'nth' (la n-ième, `index` compté depuis 1 ; une liste
  // plus courte n'écrit rien). Seules les clés qui s'écartent du défaut sont enregistrées (storedList) : une bulle remise au défaut n'a plus de
  // réglage, ni de point bleu.
  const LIST_PICKS = ['all', 'first', 'last', 'nth'];
  const LIST_SEPARATOR = ', ';
  const LIST_INDEX_MAX = 999;
  // Les types de colonne que ces réglages concernent.
  function isListType(type) { return type === 'ChoiceList' || (typeof type === 'string' && type.indexOf('RefList:') === 0); }
  // Les réglages complets d'un `format.list` quelconque (absent, illisible, incomplet) : toujours un objet, chaque clé à sa valeur par défaut au
  // besoin.
  function normalizeList(raw) {
    const list = raw && typeof raw === 'object' ? raw : {};
    return {
      pick: LIST_PICKS.indexOf(list.pick) !== -1 ? list.pick : 'all',
      index: Math.min(LIST_INDEX_MAX, Math.max(1, Math.floor(Number(list.index)) || 1)),
      separator: typeof list.separator === 'string' ? list.separator : LIST_SEPARATOR,
      lastSeparator: typeof list.lastSeparator === 'string' ? list.lastSeparator : '',
      perValue: list.perValue === true,
    };
  }
  // Vrai quand ces réglages ne changent rien : ni la façon d'écrire la liste, ni le nombre de documents à l'export.
  function isDefaultList(raw) {
    const list = normalizeList(raw);
    return list.pick === 'all' && list.separator === LIST_SEPARATOR && list.lastSeparator === '' && !list.perValue;
  }
  // Ce que la bulle enregistre : seulement les clés utiles (le numéro ne sert qu'à « n-ième », les séparateurs qu'à « toutes »), ou null quand tout
  // est par défaut.
  function storedList(raw) {
    const list = normalizeList(raw);
    if (isDefaultList(list)) return null;
    const out = {};
    if (list.pick !== 'all') out.pick = list.pick;
    if (list.pick === 'nth') out.index = list.index;
    if (list.pick === 'all') {
      if (list.separator !== LIST_SEPARATOR) out.separator = list.separator;
      if (list.lastSeparator !== '') out.lastSeparator = list.lastSeparator;
    }
    if (list.perValue) out.perValue = true;
    return out;
  }
  // Les réglages d'écriture du `format` d'une bulle quand ils diffèrent du défaut, sinon null : c'est ce que lit Variables.formatValue, une bulle
  // sans eux s'écrit comme avant.
  function listStyle(format) {
    if (!format || !format.list) return null;
    const list = normalizeList(format.list);
    return list.pick === 'all' && list.separator === LIST_SEPARATOR && list.lastSeparator === '' ? null : list;
  }
  // Les valeurs d'une liste à plat : une liste de listes (une colonne Choix multiple lue sur plusieurs lignes liées) n'en fait qu'une.
  function flattenList(value) {
    if (!Array.isArray(value)) return [value];
    return value.reduce((all, item) => all.concat(flattenList(item)), []);
  }
  // Le texte d'une liste dont les valeurs sont déjà écrites (`texts`) : les valeurs vides sont sautées, puis le choix de `list` s'applique.
  function listText(texts, raw) {
    const list = normalizeList(raw);
    const shown = texts.filter(text => text !== '' && text != null);
    if (list.pick === 'first') return shown.length ? shown[0] : '';
    if (list.pick === 'last') return shown.length ? shown[shown.length - 1] : '';
    if (list.pick === 'nth') return list.index <= shown.length ? shown[list.index - 1] : '';
    if (shown.length < 2) return shown.join('');
    const last = list.lastSeparator === '' ? list.separator : list.lastSeparator;
    return shown.slice(0, -1).join(list.separator) + last + shown[shown.length - 1];
  }

  return {
    DATE_PRESETS, presetLabel, formatDate, formatNumber, numberLang, isZero,
    BOOL_CHECKBOX_STYLES, CHECKED_BOX, UNCHECKED_BOX, isCheckboxStyle, boolStyle, checkboxColor, formatBool,
    LIST_INDEX_MAX, isListType, normalizeList, isDefaultList, storedList, listStyle, flattenList, listText,
  };
})();
