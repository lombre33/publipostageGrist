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
  // L'heure d'une colonne « Date et heure » (format.time) : `colon` s'écrit comme sur une horloge numérique à 24 heures (23:30), `ampm` à 12 heures avec AM / PM
  // (11:30 PM), `ampmlower` à 12 heures avec am / pm en minuscules collés aux minutes (11:30pm, l'écriture de départ de Grist), toutes les trois dans toutes les
  // langues ; `natural` comme on l'écrit dans la langue de l'interface - « 23 h 30 » en français, « 11:30 PM » en anglais, qui n'écrit pas « 23 h 30 » : c'est alors
  // `ampm`. Absente, la valeur n'a pas d'heure - c'est l'écriture par défaut, celle des documents d'avant ce réglage. `labelEn` : comme pour DATE_PRESETS.
  const TIME_STYLES = [
    { key: 'colon', label: '23:30', labelEn: '23:30' },
    { key: 'natural', label: '23 h 30', labelEn: '11:30 PM' },
    { key: 'ampm', label: '11:30 PM', labelEn: '11:30 PM' },
    { key: 'ampmlower', label: '11:30pm', labelEn: '11:30pm' },
  ];
  // I18n est absent des tests qui chargent ce fichier seul : le français est alors la langue.
  const interfaceIsEnglish = () => typeof I18n !== 'undefined' && I18n.getLang() === 'en';
  function presetLabel(preset) {
    // Suit la langue de l'interface, jamais le style fr / us éventuellement choisi sur cette variable : un libellé anglais dans une interface française
    // prêterait à confusion.
    return interfaceIsEnglish() ? (preset.labelEn || preset.label) : preset.label;
  }
  // Une date n'a pas de réglage de langue par variable, contrairement au nombre (opts.style) : elle suit la langue de l'interface.
  const dateLocale = () => (interfaceIsEnglish() ? 'en-US' : 'fr-FR');

  // Le type d'une colonne « Date et heure » porte son fuseau après les deux-points (« DateTime:Europe/Paris ») : Grist ne rend jamais « DateTime » nu pour
  // une vraie colonne (vérifié dans un vrai Grist), et `=== 'DateTime'` n'était donc jamais vrai. Même lecture que ConditionRules.dateTimeZone, redite ici
  // parce que ce fichier n'a aucune dépendance (un test garde les deux d'accord).
  const isDateTimeType = type => typeof type === 'string' && (type === 'DateTime' || type.indexOf('DateTime:') === 0);
  const isDateType = type => type === 'Date' || isDateTimeType(type);
  const dateTimeZone = type => (typeof type === 'string' && type.indexOf('DateTime:') === 0 ? type.slice('DateTime:'.length) : null);
  // Le fuseau tel que le moteur le connaît : UTC quand la colonne n'en dit pas ou qu'il l'ignore (très rare), le jour est alors celui d'une colonne Date.
  const knownZones = new Map();
  function zoneOrUtc(zone) {
    if (!zone) return 'UTC';
    if (!knownZones.has(zone)) {
      let known = true;
      try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch (e) { known = false; }
      knownZones.set(zone, known ? zone : 'UTC');
    }
    return knownZones.get(zone);
  }
  // Un Intl.DateTimeFormat met des dizaines de microsecondes à se construire : une feuille ou un lot de documents les répète des milliers de fois.
  const clockFormatters = new Map();
  function wallClock(date, zone) {
    // Le jour et l'heure que le mur du fuseau montre à cet instant : { year, month, day, hour, minute }. Le soir à Paris (23 h 30, encore le 12) est déjà
    // le lendemain en UTC ; une colonne Date, ancrée à minuit UTC pour son jour civil, se lit en UTC (zone vide).
    const tz = zoneOrUtc(zone);
    if (tz !== 'UTC') {
      if (!clockFormatters.has(tz)) clockFormatters.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }));
      try {
        const read = {};
        clockFormatters.get(tz).formatToParts(date).forEach(part => { read[part.type] = parseInt(part.value, 10); });
        return { year: read.year, month: read.month, day: read.day, hour: read.hour, minute: read.minute };
      } catch (e) { /* date hors des bornes d'Intl : repli sur UTC */ }
    }
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
  const twoDigits = n => String(n).padStart(2, '0');
  function timeLabel(style) {
    return interfaceIsEnglish() ? (style.labelEn || style.label) : style.label;
  }
  // Le réglage tel que la langue de l'interface l'écrit : `natural` est « 23 h 30 » en français et, en anglais, le même texte que `ampm`.
  const writtenTimeStyle = key => (key === 'natural' && interfaceIsEnglish() ? 'ampm' : key);
  // Ce que la liste « Heure » propose dans la langue de l'interface, une fois chaque écriture : `natural` et `ampm` écrivent pareil en anglais, la liste garde `ampm`, qui
  // ne change pas avec la langue. Un modèle réglé en `natural` n'y perd rien : timeChoiceOf lui donne l'option qui écrit comme lui.
  const timeChoices = () => TIME_STYLES.filter(style => writtenTimeStyle(style.key) === style.key);
  // L'option de la liste qui écrit comme ce réglage ; '' pour ce qui n'est pas l'un des TIME_STYLES (pas de réglage : « Sans heure »).
  const timeChoiceOf = key => (TIME_STYLES.some(style => style.key === key) ? writtenTimeStyle(key) : '');
  function timeText(clock, style) {
    // L'heure d'un instant, dans l'un des TIME_STYLES ; '' pour une valeur qui n'en est pas un (pas de réglage : pas d'heure). À 12 heures, minuit est « 12:30 AM » et
    // midi « 12:00 PM » (« 12:30am », « 12:00pm » en minuscules).
    switch (writtenTimeStyle(style)) {
      case 'colon': return twoDigits(clock.hour) + ':' + twoDigits(clock.minute);
      case 'ampm': return (clock.hour % 12 || 12) + ':' + twoDigits(clock.minute) + (clock.hour < 12 ? ' AM' : ' PM');
      case 'ampmlower': return (clock.hour % 12 || 12) + ':' + twoDigits(clock.minute) + (clock.hour < 12 ? 'am' : 'pm');
      case 'natural': return clock.hour + ' h ' + twoDigits(clock.minute);
      default: return '';
    }
  }
  // Ce qui lie la date à l'heure : une espace derrière une date en chiffres, « à » (« at ») derrière un mois écrit en lettres. `english` : la langue demandée, celle de l'interface
  // sinon.
  function dateTimeJoiner(preset, english = interfaceIsEnglish()) {
    if (preset.options && (preset.options.month === 'short' || preset.options.month === 'long')) return english ? ' at ' : ' à ';
    return english && !preset.iso ? ', ' : ' ';
  }
  // Vrai quand la bulle écrit l'heure de cette valeur : une colonne « Date et heure » en a une, et une colonne « Any » qui calcule un instant (la valeur
  // `val` porte alors son fuseau) ; le réglage doit être l'un des TIME_STYLES.
  function writesTime(format, columnType, val) {
    const hasTime = isDateTimeType(columnType) || (columnType === 'Any' && !!val && !!val.timezone);
    return hasTime && !!format && TIME_STYLES.some(style => style.key === format.time);
  }

  function gristDateToJsDate(val) {
    // Une date arrive en timestamp Unix (secondes : la ligne brute de fetchTable, l'export en lot), en objet Date (la ligne que grist.onRecord affiche) ou en
    // chaîne déjà formatée : la chaîne et l'objet vont tels quels au constructeur Date, jamais parseFloat * 1000 (« 2026-09-12 » serait pris pour un
    // timestamp). Lu en UTC partout dans ce fichier : une colonne Date pure est ancrée à minuit UTC pour son jour civil. Exportée : une lecture des deux formes.
    if (val == null || val === '') return null;
    if (typeof val === 'number') return Number.isFinite(val) ? new Date(val * 1000) : null;
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // --- Cellule en erreur ---
  // Une cellule dont la formule a échoué arrive sous deux formes : grist.onRecord livre un RaisedException { name, message, details, user_input }, dont String() est ce
  // que Grist montre dans la cellule (« #DIV/0! », « #TypeError », « #Invalid DateTime: bientôt ») ; fetchTable (export en lot, boucles, tables liées) livre
  // ['E', nom, message, détail, saisie]. cellError en refait le même objet à partir de la forme brute, avec le même String() (RaisedException.toString dans
  // grist-core, app/plugin/GristData.ts), pour que les deux lignes s'écrivent, se comparent et se calculent pareil, dans une colonne de n'importe quel type.
  class CellError {
    constructor(parts) {
      const rest = parts.slice();
      this.name = rest.shift();
      this.message = rest.shift();
      this.details = rest.shift();
      const input = rest.shift();
      this.user_input = input == null ? undefined : input.u;
    }
    toString() {
      switch (this.name) {
        case 'ZeroDivisionError': return '#DIV/0!';
        case 'UnmarshallableError': return this.details || '#' + this.name;
        case 'InvalidTypedValue': return `#Invalid ${this.message}: ${this.details}`;
        default: return '#' + this.name;
      }
    }
  }
  const cellError = parts => new CellError(parts);
  // Vrai pour l'une ou l'autre forme (le RaisedException de Grist se reconnaît à ses propriétés : la classe du plugin n'a pas de nom stable une fois minifiée).
  const isCellError = val => !!val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date) && typeof val.name === 'string' && 'message' in val && 'details' in val;

  function buildDateStringFromParts(parts, keep) {
    // Assemble la chaîne des « parts » d'Intl.DateTimeFormat#formatToParts en ne gardant que le jour, le mois, l'année demandés (boutons J / M / A). Un
    // séparateur n'est gardé qu'entre deux composants gardés, jamais en tête, en fin ni collé à un composant retiré (« M A » garderait sinon un « / »
    // fantôme).
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
  function wordifyDateParts(parts) {
    // Écrit en toutes lettres chaque composant encore purement numérique après filtrage : un mois déjà écrit en lettres reste tel quel, seuls le jour,
    // l'année (et un mois numérique) sont convertis.
    const lang = numberLang();
    return parts.map(part => (/^\d+$/.test(part.value) ? Object.assign({}, part, { value: numberToWords(parseInt(part.value, 10), 0, lang) }) : part));
  }
  function isFirstDayBeforeMonthName(day, parts, keep) {
    // En français le premier du mois s'écrit « 1er » (« 1er décembre 2026 ») et, en toutes lettres, « premier » ; les autres jours gardent leur nombre.
    // Seul un jour suivi de son mois écrit en lettres est concerné : « 01/12/2026 » (mois en chiffres) et un jour gardé seul (bouton M relâché) restent
    // « 1 ». L'anglais n'est pas touché. `day` : le jour du mur du fuseau (wallClock).
    return dateLocale() === 'fr-FR' && day === 1 && keep.day && keep.month
      && parts.some(part => part.type === 'month' && !/^\d+$/.test(part.value));
  }
  function withDayText(parts, text) {
    return parts.map(part => (part.type === 'day' ? Object.assign({}, part, { value: text }) : part));
  }

  function formatDate(val, format, columnType) {
    // Le texte d'une date. `columnType` : le type Grist de la colonne lue, quand on le connaît - une colonne « Date et heure » (DateTime:Europe/Paris) se
    // lit dans SON fuseau, le jour d'un instant n'étant pas le même à Paris et en UTC, et seule elle peut écrire une heure (format.time), avec la colonne
    // « Any » qui calcule un instant. Sans lui, ou pour une colonne Date (ancrée à minuit UTC pour son jour civil), tout se lit en UTC et sans heure. Une date
    // qui porte son fuseau (`timezone`, celui de GristDateTime et de Variables.decodeShown) le garde quand la colonne ne dit rien : la Référence qui montre une
    // date et heure a le type « Ref:… ».
    const date = gristDateToJsDate(val);
    if (!date) return '';
    format = format || {};
    const zone = zoneOrUtc(dateTimeZone(columnType) || (val && val.timezone) || null);
    const clock = wallClock(date, zone);
    const preset = DATE_PRESETS.find(p => p.key === format.preset) || DATE_PRESETS[0];
    const keep = {
      day: format.day !== false,
      month: format.month !== false,
      year: format.year !== false,
    };
    let parts;
    if (preset.iso) {
      const y = String(clock.year);
      const m = twoDigits(clock.month);
      const d = twoDigits(clock.day);
      parts = [{ type: 'year', value: y }, { type: 'literal', value: '-' }, { type: 'month', value: m }, { type: 'literal', value: '-' }, { type: 'day', value: d }];
    } else if (preset.shortNoPad) {
      // Construit à la main : Intl fr-FR complète toujours jour et mois à deux chiffres, même avec `numeric`, et ce préréglage existe pour s'en
      // distinguer.
      const day = String(clock.day);
      const month = String(clock.month);
      const year = String(clock.year).slice(-2);
      const first = dateLocale() === 'en-US' ? { type: 'month', value: month } : { type: 'day', value: day };
      const second = dateLocale() === 'en-US' ? { type: 'day', value: day } : { type: 'month', value: month };
      parts = [first, { type: 'literal', value: '/' }, second, { type: 'literal', value: '/' }, { type: 'year', value: year }];
    } else {
      parts = new Intl.DateTimeFormat(dateLocale(), Object.assign({ timeZone: zone }, preset.options)).formatToParts(date);
    }
    const firstOfMonth = isFirstDayBeforeMonthName(clock.day, parts, keep);
    if (format.words) parts = wordifyDateParts(firstOfMonth ? withDayText(parts, 'premier') : parts);
    else if (firstOfMonth) parts = withDayText(parts, '1er');
    const text = buildDateStringFromParts(parts, keep);
    // L'heure reste en chiffres, même en toutes lettres : « Lettres » écrit la date.
    return writesTime(format, columnType, val) ? text + dateTimeJoiner(preset) + timeText(clock, format.time) : text;
  }

  // --- Nombre en toutes lettres (français, orthographe classique) ---
  const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix'];

  function twoDigitsToWords(n, hasFollowing) {
    // n dans [0, 99]. « et » pour 21, 31, 41, 51, 61, 71 mais pas 81 (quatre-vingt-un) ; 71 et 91 passent par soixante / quatre-vingt + un nombre de 10
    // à 19. `hasFollowing` : autre chose s'écrit après ce nombre dans le nombre entier, « vingt » perdant alors son « s » (quatre-vingts seul, mais
    // quatre-vingt mille, quatre-vingt-un).
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
  function threeDigitsToWords(n, hasFollowing) {
    // n dans [0, 999]. « cent » prend un « s » seulement s'il est multiplié (> 1) et que rien ne suit ce nombre : « vingt » et « cent » sont les deux
    // seuls mots de nombre à porter la marque du pluriel, et la perdent dès qu'un autre mot de nombre les suit.
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
  function integerToWordsFr(rounded) {
    // « mille » est invariable et jamais précédé de « un », contrairement à « million » et « milliard », de vrais noms qui prennent « un » et un « s »
    // au pluriel. Écrit la partie entière seule (numberToWords écrit les décimales).
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
  function splitAbsolute(n, decimals) {
    // La valeur absolue de `n` arrondie à `decimals` décimales comme le chiffre l'écrit (par Intl, comme formatNumber : un 1,005 que les chiffres
    // montrent « 1,01 » ne s'écrit pas « un euro » en lettres) : { intPart, fracDigits }, la partie entière et les décimales en chiffres, zéros de tête
    // compris (« 05 »).
    const text = new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(n));
    const dot = text.indexOf('.');
    return { intPart: parseInt(dot === -1 ? text : text.slice(0, dot), 10), fracDigits: dot === -1 ? '' : text.slice(dot + 1) };
  }
  function fractionToWords(digits, toWords, zeroWord) {
    // Les décimales dites comme elles s'écrivent : chaque zéro de tête se dit (« 1,05 » : « un virgule zéro cinq »), le reste est un nombre (« 56 » :
    // « cinquante-six »).
    const zeros = /^0*/.exec(digits)[0].length;
    const words = new Array(zeros).fill(zeroWord);
    if (zeros < digits.length) words.push(toWords(parseInt(digits.slice(zeros), 10)));
    return words.join(' ');
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
  // Ce qui change d'une langue à l'autre dans l'écriture d'un nombre ou d'un montant : l'entier en lettres, les mots de la virgule, du zéro, du moins
  // et du « et » entre unités et centimes, les devises connues, accolées au nombre (« mille euros », « a thousand euros », pas « mille € ») avec leur
  // petite unité au singulier et au pluriel (les décimales d'un montant sont ses centimes). Une devise inconnue (symbole ou texte libre) reste telle
  // quelle.
  const WORDS = {
    fr: {
      integer: integerToWordsFr, point: ' virgule ', zero: 'zéro', minus: 'moins ', and: ' et ',
      currency: { '€': 'euro', '$': 'dollar', '£': 'livre' },
      subunit: { '€': ['centime', 'centimes'], '$': ['cent', 'cents'], '£': ['penny', 'pence'] },
    },
    en: {
      integer: integerToWordsEn, point: ' point ', zero: 'zero', minus: 'minus ', and: ' and ',
      currency: { '€': 'euro', '$': 'dollar', '£': 'pound' },
      subunit: { '€': ['cent', 'cents'], '$': ['cent', 'cents'], '£': ['penny', 'pence'] },
    },
  };
  function numberToWords(n, decimals, lang) {
    // Écrit un nombre en toutes lettres, décimales comprises quand `decimals` est renseigné (0 à 3) : « 1234,56 » doit pouvoir s'écrire avec sa partie
    // décimale. Sans `decimals`, l'entier le plus proche. Un montant dans une devise connue ne passe pas par ici : ses décimales sont des centimes
    // (amountToWords).
    const w = WORDS[lang];
    const d = decimals == null ? 0 : decimals;
    const { intPart, fracDigits } = splitAbsolute(n, d);
    const words = w.integer(intPart) + (d > 0 ? w.point + fractionToWords(fracDigits, w.integer, w.zero) : '');
    return (n < 0 && (intPart > 0 || /[1-9]/.test(fracDigits)) ? w.minus : '') + words;
  }
  function currencyWords(symbol, count, lang) {
    const base = WORDS[lang].currency[symbol];
    if (!base) return symbol;
    return count > 1 || count < -1 ? base + 's' : base;
  }
  // Pluriel dès deux en français (« zéro euro », « un euro »), dès qu'il n'y en a pas un en anglais (« zero euros »).
  const isPlural = (count, lang) => (lang === 'en' ? count !== 1 : count > 1);
  // Les centimes d'un montant écrit avec 0, 1 ou 2 décimales : « 0,5 » vaut cinquante centimes.
  const centsOf = (fracDigits, decimals) => (decimals === 0 ? 0 : parseInt(fracDigits, 10) * (decimals === 1 ? 10 : 1));
  function unitsToWords(count, unit, lang) {
    // Les unités entières d'un montant. Un million rond ou un milliard rond veut « de » en français : « un million d’euros ».
    const name = isPlural(count, lang) ? unit + 's' : unit;
    const roundMillions = lang !== 'en' && count > 0 && count % 1e6 === 0;
    const de = roundMillions ? (/^[aeiouyéèêàâîôû]/i.test(name) ? 'd’' : 'de ') : '';
    return WORDS[lang].integer(count) + ' ' + de + name;
  }
  function amountToWords(n, decimals, symbol, lang) {
    // Un montant dans une devise connue, en toutes lettres : les unités entières puis, s'il y en a, les centimes (« six cent cinquante euros », « un
    // euro et un centime », « cinquante centimes », « mille deux cent trente-quatre euros et cinq centimes »), jamais « virgule ». Deux décimales au
    // plus : un montant qui en a trois s'écrit comme un nombre (null, comme pour une devise inconnue : l'appelant écrit le nombre puis la devise telle
    // quelle).
    const w = WORDS[lang];
    const unit = w.currency[symbol];
    const d = decimals == null ? 0 : decimals;
    if (!unit || d > 2) return null;
    const { intPart, fracDigits } = splitAbsolute(n, d);
    const cents = centsOf(fracDigits, d);
    const parts = [];
    if (intPart > 0 || cents === 0) parts.push(unitsToWords(intPart, unit, lang));
    if (cents > 0) parts.push(w.integer(cents) + ' ' + w.subunit[symbol][isPlural(cents, lang) ? 1 : 0]);
    return (n < 0 && (intPart > 0 || cents > 0) ? w.minus : '') + parts.join(w.and);
  }

  function numberLang(style) {
    // La langue d'écriture en lettres et la locale Intl d'un nombre : un réglage de la variable (opts.style 'fr' ou 'us') l'emporte sur la langue de
    // l'interface ; 'none' (qui ne touche pas à la langue) et l'absence de réglage la suivent.
    if (style === 'us') return 'en';
    if (style === 'fr') return 'fr';
    return interfaceIsEnglish() ? 'en' : 'fr';
  }

  function isZero(val) {
    // Vrai pour une valeur qui est zéro : le nombre 0, ou un texte qui ne s'écrit que 0 (« 0 », « 0,00 », « 0.0 »). Une valeur que l'arrondi seul fait
    // afficher 0 (0,004 à deux décimales) n'est pas nulle. C'est ce que lit l'option « Si la valeur vaut zéro » d'une bulle nombre (`zero: 'hide'`,
    // Variables.formatValue).
    if (typeof val === 'number') return val === 0;
    return typeof val === 'string' && /^\s*[-+]?0+(?:[.,]0*)?\s*$/.test(val);
  }

  // --- Oui / Non (colonne booléenne) ---
  const BOOL_CHECKBOX_STYLES = ['accentStrike', 'classic', 'accentPlain'];
  const CHECKED_BOX = '☑';
  const UNCHECKED_BOX = '☐';
  function isCheckboxStyle(style) { return BOOL_CHECKBOX_STYLES.indexOf(style) !== -1; }
  function boolStyle(format) {
    // format = { type: 'bool', style } : l'un des trois styles de case, nommés comme ceux de la liste à cases (`data-tasklist-style`,
    // js/main-toolbar.js), sinon 'text' (sans réglage, ou réglage d'un autre type). Les deux styles « accent » dessinent la même case : le texte qui
    // suit n'est jamais barré, le barré n'existe que dans la liste à cases.
    return format && format.type === 'bool' && isCheckboxStyle(format.style) ? format.style : 'text';
  }
  function checkboxColor(checked, style) {
    // Couleur d'une case (hexa), celle que la Lecture dessine (`currentColor`) et que le PDF, le Word et l'Excel reprennent pour la case : accent plein
    // quand elle est cochée, gris du contour sinon ; « classic » reste noir et gris, comme la case de la liste.
    if (style === 'classic') return checked ? '#222222' : '#6b7684';
    return checked ? '#2f6fed' : '#767676';
  }
  function formatBool(val, format) {
    // 'text' écrit « vrai » ou « faux » (« true » ou « false » en anglais), une case le caractère ☑ ou ☐ que ReaderMode.checkboxNode dessine en vraie
    // case (`.resolved-checkbox`). Là où seul du texte compte (champs Objet, À, Cc, Cci, nom du PDF, fenêtres), Variables.formatValue écrit « vrai »
    // ou « faux » (option `rawNumbers`).
    if (typeof val !== 'boolean') return val == null ? '' : String(val);
    if (boolStyle(format) === 'text') return I18n.t(val ? 'varFmt.boolTrue' : 'varFmt.boolFalse');
    return val ? CHECKED_BOX : UNCHECKED_BOX;
  }

  function decimalDigits(opts) {
    // Le nombre de décimales qu'écrit un réglage : { min, max }, ou null quand rien n'est réglé (Intl décide). `decimals` seul est un nombre fixe ;
    // avec `maxDecimals` (le « au plus » de Grist, que seul « Comme dans Grist » pose), `decimals` devient le « au moins » - zéro s'il manque.
    const min = opts.decimals != null ? opts.decimals : null;
    if (opts.maxDecimals != null) { const floor = min != null ? min : 0; return { min: floor, max: Math.max(opts.maxDecimals, floor) }; }
    return min != null ? { min, max: min } : null;
  }
  function currencyGap(currency) {
    // Ce que l'anglais met entre une devise écrite avant le nombre et ce nombre : une espace insécable quand la devise ne finit ni par un symbole ni par une espace
    // (« CHF 1,234.57 », « kr 12 », « pts 5 »), rien sinon (« $7.13 », « €5 ») - la règle de CLDR, celle d'Intl pour Grist. Le français met toujours une espace après.
    return /[\p{S}\p{Z}]$/u.test(currency) ? '' : '\u00a0';
  }
  function currencyFirst(currency, formatted) {
    // L'écriture anglaise d'une devise, comme Intl l'écrit pour Grist : le signe moins passe avant la devise (« -$7.13 », pas « $-7.13 »), puis la devise et son espace.
    const sign = formatted.charAt(0) === '-' ? '-' : '';
    return `${sign}${currency}${currencyGap(currency)}${formatted.slice(sign.length)}`;
  }
  function formatNumber(val, opts) {
    // opts = { style: 'fr' | 'us' | 'none', decimals: 0-3 | null, maxDecimals, currency: '' | '€' | '$' | texte, percent: bool, words: bool } ; l'option `zero` est
    // traitée avant cet appel, par Variables.formatValue. `percent` écrit la valeur fois cent suivie de « % » (0,256 : « 25,6 % ») et l'emporte sur la devise ;
    // « Lettres » (`words`) l'emporte sur les deux.
    if (val == null || val === '') return '';
    const n = typeof val === 'number' ? val : parseFloat(val);
    if (!Number.isFinite(n)) return String(val);
    opts = opts || {};
    const lang = numberLang(opts.style);
    if (opts.words) {
      const amount = opts.currency ? amountToWords(n, opts.decimals, opts.currency, lang) : null;
      if (amount != null) return amount;
      const words = numberToWords(n, opts.decimals, lang);
      return opts.currency ? `${words} ${currencyWords(opts.currency, Math.round(n), lang)}` : words;
    }
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    const intlOpts = {};
    const digits = decimalDigits(opts);
    if (digits) { intlOpts.minimumFractionDigits = digits.min; intlOpts.maximumFractionDigits = digits.max; }
    if (opts.percent) intlOpts.style = 'percent';
    if (opts.style === 'none') intlOpts.useGrouping = false;
    // L'espace fine insécable (U+202F) qu'Intl met entre les milliers en français manque à la police des PDF (pdfmake, Roboto) : elle s'y peignait en
    // case vide et décalait la suite de la ligne. L'espace insécable (U+00A0) y est, et se lit pareil partout ailleurs (Lecture, Word, email).
    let formatted = new Intl.NumberFormat(locale, intlOpts).format(n).replace(/\u202f/g, '\u00a0');
    if (opts.currency && !opts.percent) formatted = locale === 'fr-FR' ? `${formatted} ${opts.currency}` : currencyFirst(opts.currency, formatted);
    return formatted;
  }

  // --- « Comme dans Grist » : le format d'affichage d'une colonne Grist, traduit en réglage de bulle ---
  // Grist garde ce format dans le widgetOptions (JSON) de la colonne : pour un nombre (Numérique, Entier) numMode (« currency », « decimal », « percent », « scientific » ;
  // absent : nombre brut, sans séparateur de milliers), numSign (« parens » : les négatifs entre parenthèses), decimals (au moins), maxDecimals (au plus) et currency ; pour
  // une date (Date, Date et heure) dateFormat et, pour la seconde, timeFormat, écrits comme moment.js. `gristColumnFormat` en tire le `format` de bulle qui s'écrit pareil -
  // ou, avec `exact` faux, le plus proche - ou dit pourquoi le widget ne sait pas l'écrire ({ refusal, detail }). Un réglage de bulle ne change pas de langue pour autant :
  // FR ou US reste celui de la bulle (ou de la langue de l'interface), seule la facon d'écrire le nombre ou la date est reprise.
  const MAX_DIGITS = 20;
  function gristDigits(options, currency, isInt) {
    // Les décimales que Grist écrit, lues comme lui sur Intl (buildNumberFormat, app/common/NumberFormat.ts de grist-core) : { min, max }. Sans réglage, une devise a
    // les siennes (deux pour l'euro, aucune pour le yen), un pourcentage aucune, un nombre « , » jusqu'à trois et un nombre brut jusqu'à dix ; une colonne Entier part de zéro.
    const mode = options.numMode;
    const intl = mode === 'currency' ? { style: 'currency', currency } : mode === 'percent' ? { style: 'percent' } : { useGrouping: mode === 'decimal' };
    const decimals = options.decimals != null ? options.decimals : (isInt ? 0 : null);
    if (decimals != null) intl.minimumFractionDigits = Math.min(MAX_DIGITS, Math.max(0, Number(decimals)));
    const floor = new Intl.NumberFormat('en-US', intl).resolvedOptions().minimumFractionDigits || 0;
    if (options.maxDecimals != null) intl.maximumFractionDigits = Math.min(MAX_DIGITS, Math.max(floor, Number(options.maxDecimals)));
    else if (!mode) intl.maximumFractionDigits = Math.min(MAX_DIGITS, Math.max(floor, 10));
    const resolved = new Intl.NumberFormat('en-US', intl).resolvedOptions();
    return { min: resolved.minimumFractionDigits, max: resolved.maximumFractionDigits };
  }
  function currencySymbol(code) {
    // Le signe d'une devise comme Grist l'écrit (le symbole court : « € », « $ », « £ », « CHF »), le code lui-même quand Intl n'en connaît pas.
    try {
      const part = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(p => p.type === 'currency');
      return part ? part.value : code;
    } catch (e) { return code; }
  }
  // La devise d'un pays, quand ni la colonne ni les réglages du document n'en disent une : Grist la tire de la langue du document (getCurrency, app/common/NumberFormat.ts, table
  // du paquet locale-currency). Ici les pays les plus courants ; un pays absent n'a pas de devise connue.
  const REGION_CURRENCY = {};
  [['EUR', 'AD AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MC ME MT NL PT SI SK SM VA XK'], ['USD', 'US EC SV PA PR'], ['GBP', 'GB GG IM JE'], ['CHF', 'CH LI'],
    ['CAD', 'CA'], ['AUD', 'AU'], ['NZD', 'NZ'], ['JPY', 'JP'], ['CNY', 'CN'], ['HKD', 'HK'], ['SGD', 'SG'], ['INR', 'IN'], ['KRW', 'KR'], ['TWD', 'TW'], ['THB', 'TH'],
    ['VND', 'VN'], ['IDR', 'ID'], ['MYR', 'MY'], ['PHP', 'PH'], ['BRL', 'BR'], ['MXN', 'MX'], ['ARS', 'AR'], ['CLP', 'CL'], ['COP', 'CO'], ['PEN', 'PE'], ['RUB', 'RU'],
    ['UAH', 'UA'], ['PLN', 'PL'], ['CZK', 'CZ'], ['HUF', 'HU'], ['RON', 'RO'], ['BGN', 'BG'], ['SEK', 'SE'], ['NOK', 'NO'], ['DKK', 'DK'], ['ISK', 'IS'], ['TRY', 'TR'],
    ['ILS', 'IL'], ['AED', 'AE'], ['SAR', 'SA'], ['EGP', 'EG'], ['MAD', 'MA'], ['TND', 'TN'], ['DZD', 'DZ'], ['ZAR', 'ZA'], ['NGN', 'NG'],
    ['XOF', 'BF BJ CI GW ML NE SN TG'], ['XAF', 'CF CG CM GA GQ TD']].forEach(([code, regions]) => regions.split(' ').forEach(region => { REGION_CURRENCY[region] = code; }));
  function localeCurrency(locale) {
    // La devise de la langue d'un document (« fr-FR » : EUR), null quand le pays manque (« fr » seul) ou n'est pas dans la table.
    const found = /^[A-Za-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2}|\d{3})(?:[-_]|$)/.exec(String(locale || ''));
    return (found && REGION_CURRENCY[found[1].toUpperCase()]) || null;
  }
  function documentCurrency(settings) {
    // La devise par défaut du document, comme Grist la choisit : celle de ses réglages, sinon celle de sa langue (« en-US » quand il n'en dit pas) ; null si inconnue,
    // et quand les réglages eux-mêmes le sont (null : Grist ne les a pas rendus - ne pas deviner une devise).
    if (!settings) return null;
    return settings.currency || localeCurrency(settings.locale || 'en-US');
  }
  function gristNumberFormat(columnType, options, docCurrency) {
    const mode = options.numMode || null;
    if (mode === 'scientific') return { refusal: 'scientific' };
    let currency = null;
    if (mode === 'currency') {
      currency = String(options.currency || docCurrency || '').toUpperCase();
      if (!currency) return { refusal: 'currency' };
    }
    let digits;
    try { digits = gristDigits(options, currency, columnType === 'Int'); } catch (e) { return { refusal: 'currency', detail: currency }; }
    const format = { type: 'number' };
    if (!mode) format.style = 'none';
    if (currency) format.currency = currencySymbol(currency);
    if (mode === 'percent') format.percent = true;
    format.decimals = digits.min;
    // Un entier n'a pas de décimales à écrire de plus : « jusqu'à dix » n'aurait que l'air d'un réglage.
    if (digits.max > digits.min && columnType !== 'Int') format.maxDecimals = digits.max;
    return { format, exact: options.numSign !== 'parens' };
  }

  // Une écriture de moment.js découpée en morceaux : { token, text }, `token` valant « sep » pour un séparateur et « x » pour tout ce que le widget ne sait pas écrire (une
  // lettre qui n'est pas un composant, un texte entre crochets).
  const MOMENT_TOKEN = /\[[^\]]*\]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a|Z|z|\p{L}|[^]/gu;
  const MOMENT_KNOWN = ['YYYY', 'YY', 'MMMM', 'MMM', 'MM', 'M', 'Do', 'DD', 'D', 'dddd', 'ddd', 'HH', 'H', 'hh', 'h', 'mm', 'm', 'ss', 's', 'A', 'a', 'Z', 'z'];
  function momentTokens(text) {
    return (String(text).match(MOMENT_TOKEN) || []).map(piece => ({ token: MOMENT_KNOWN.indexOf(piece) !== -1 ? piece : (/^[\p{L}\[]/u.test(piece) ? 'x' : 'sep'), text: piece }));
  }
  // Les composants de date d'une écriture de moment.js : le genre et la forme (« num2 » : deux chiffres, « num1 » : sans zéro de tête, « ordinal » : 1er, 2e...).
  const DATE_TOKENS = {
    YYYY: ['year', 'full'], YY: ['year', 'short'], MMMM: ['month', 'long'], MMM: ['month', 'short'], MM: ['month', 'num2'], M: ['month', 'num1'],
    Do: ['day', 'ordinal'], DD: ['day', 'num2'], D: ['day', 'num1'], dddd: ['weekday', 'long'], ddd: ['weekday', 'short'],
  };
  // Ce que chaque préréglage de date écrit, dit en moment.js, dans chaque langue : un format de Grist identique à l'une de ces lignes s'écrit pareil.
  const PRESET_MOMENT = {
    dmy_slash_full: { fr: 'DD/MM/YYYY', en: 'MM/DD/YYYY' },
    dmy_slash_short: { fr: 'D/M/YY', en: 'M/D/YY' },
    iso: { fr: 'YYYY-MM-DD', en: 'YYYY-MM-DD' },
    d_mmm_yyyy: { fr: 'D MMM YYYY', en: 'MMM D, YYYY' },
    d_mmmm_yyyy: { fr: 'D MMMM YYYY', en: 'MMMM D, YYYY' },
    ddd_d_mmm_yyyy: { fr: 'ddd D MMM YYYY', en: 'ddd, MMM D, YYYY' },
    dddd_d_mmmm_yyyy: { fr: 'dddd D MMMM YYYY', en: 'dddd, MMMM D, YYYY' },
  };
  // L'ordre jour / mois / année des préréglages en chiffres : celui de la langue de l'interface (le numérique) ou année d'abord (ISO).
  const NUMERIC_ORDER = { fr: ['day', 'month', 'year'], en: ['month', 'day', 'year'], iso: ['year', 'month', 'day'] };
  // Comment ces préréglages en chiffres écrivent chaque composant (voir DATE_TOKENS) et ce qui les sépare : un format de Grist qui en diffère s'écrit « approché ».
  const NUMERIC_FORMS = {
    dmy_slash_full: { year: 'full', month: 'num2', day: 'num2', separator: '/' },
    dmy_slash_short: { year: 'short', month: 'num1', day: 'num1', separator: '/' },
    iso: { year: 'full', month: 'num2', day: 'num2', separator: '-' },
  };
  function gristDateFormat(dateFormat, lang) {
    // Le préréglage de date (et les boutons J / M / A) qui écrit le dateFormat de Grist : { format: { type: 'date', preset, day?, month?, year? }, exact }, ou { refusal, detail }.
    // Un mois en lettres s'écrit dans la langue de l'interface et un jour sans zéro de tête (« approché » : exact faux) ; un ordre jour / mois / année que la langue de l'interface
    // n'écrit pas (« MM/DD/YYYY » en français : « 09/12 » se lirait 9 décembre) est refusé plutôt que changé en silence. `exact` : le texte est le même que celui de Grist -
    // chiffres du même nombre de chiffres, mêmes séparateurs, pas de jour de semaine perdu.
    const text = dateFormat || 'YYYY-MM-DD';
    const found = {};
    const order = [];
    const separators = [];
    for (const piece of momentTokens(text)) {
      if (piece.token === 'sep') { if (!/^[ \/\-.,]$/.test(piece.text)) return { refusal: 'dateFormat', detail: text }; separators.push(piece.text); continue; }
      const kind = DATE_TOKENS[piece.token];
      if (!kind || found[kind[0]]) return { refusal: 'dateFormat', detail: text };
      found[kind[0]] = kind[1];
      if (kind[0] !== 'weekday') order.push(kind[0]);
    }
    if (!order.length) return { refusal: 'dateFormat', detail: text };
    const textual = found.month === 'short' || found.month === 'long';
    let preset;
    if (textual) {
      const long = found.month === 'long';
      preset = found.weekday ? (long ? 'dddd_d_mmmm_yyyy' : 'ddd_d_mmm_yyyy') : (long ? 'd_mmmm_yyyy' : 'd_mmm_yyyy');
    } else {
      const family = order[0] === 'year' ? 'iso' : lang;
      if (order.join() !== NUMERIC_ORDER[family].filter(part => found[part]).join()) return { refusal: 'dateOrder', detail: text };
      preset = family === 'iso' ? 'iso' : (found.year === 'short' ? 'dmy_slash_short' : 'dmy_slash_full');
    }
    const format = { type: 'date', preset };
    ['day', 'month', 'year'].forEach(part => { if (!found[part]) format[part] = false; });
    let exact;
    if (textual) exact = lang === 'en' && text === PRESET_MOMENT[preset].en;
    else {
      const wanted = NUMERIC_FORMS[preset];
      exact = !found.weekday && ['year', 'month', 'day'].every(part => !found[part] || found[part] === wanted[part]) && separators.every(sep => sep === wanted.separator);
    }
    return { format, exact };
  }
  function gristTimeFormat(timeFormat) {
    // L'heure de la colonne « Date et heure » : « colon » (23:30) pour une horloge à 24 heures, « ampm » (11:30 PM, moment.js « A ») ou « ampmlower » (11:30pm, « a ») pour celle à 12
    // heures, aucune quand Grist n'en écrit pas ({ time: null }). Les secondes et le fuseau (« z ») ne s'écrivent pas : le plus proche, exact faux ; à 12 heures, seuls « h:mm A » et
    // « h:mma » - le départ de Grist - s'écrivent comme lui (« hh » met un zéro de tête, « h:mm a » une espace avant am / pm). Sans réglage, Grist écrit « h:mma » (1:15pm).
    const text = timeFormat == null ? 'h:mma' : String(timeFormat);
    if (text.trim() === '') return { time: null, exact: true };
    const tokens = momentTokens(text);
    if (tokens.some(piece => piece.token === 'x' || DATE_TOKENS[piece.token])) return { refusal: 'timeFormat', detail: text };
    const has = names => tokens.some(piece => names.indexOf(piece.token) !== -1);
    if (has(['HH', 'H'])) return { time: 'colon', exact: text === 'HH:mm' };
    if (has(['hh', 'h'])) {
      const lower = has(['a']) && !has(['A']);
      return { time: lower ? 'ampmlower' : 'ampm', exact: text === (lower ? 'h:mma' : 'h:mm A') };
    }
    return { refusal: 'timeFormat', detail: text };
  }

  function gristColumnFormat(columnType, options, docCurrency, lang) {
    // Le `format` de bulle qui écrit une valeur de cette colonne comme Grist (voir plus haut). `columnType` : le type de la colonne (« Numeric », « Int », « Date » ou
    // « DateTime:<fuseau> »), `options` : son widgetOptions lu (null : illisible), `docCurrency` : la devise du document (documentCurrency), `lang` : la langue de l'interface
    // ('fr' ou 'en', celle qui écrit les dates). { format, exact } ou { refusal: 'unknown' | 'scientific' | 'currency' | 'dateOrder' | 'dateFormat' | 'timeFormat', detail }.
    if (!options || typeof options !== 'object') return { refusal: 'unknown' };
    if (columnType === 'Numeric' || columnType === 'Int') return gristNumberFormat(columnType, options, docCurrency);
    if (!isDateType(columnType)) return { refusal: 'unknown' };
    const date = gristDateFormat(options.dateFormat, lang === 'en' ? 'en' : 'fr');
    if (date.refusal || !isDateTimeType(columnType)) return date;
    const time = gristTimeFormat(options.timeFormat);
    if (time.refusal) return time;
    if (time.time) date.format.time = time.time;
    // Grist lie la date à l'heure par une espace ; la bulle écrit une virgule derrière une date en chiffres en anglais et « à » / « at » derrière un mois en lettres (dateTimeJoiner) :
    // avec une heure, ce texte-là n'est pas celui de Grist.
    const sameJoiner = !time.time || dateTimeJoiner(DATE_PRESETS.find(p => p.key === date.format.preset), lang === 'en') === ' ';
    return { format: date.format, exact: date.exact && time.exact && sameJoiner };
  }
  // Les réglages de nombre et de date que « Comme dans Grist » pose ensemble : ils se remplacent tous (rien d'un ancien réglage de date ne reste sur un nombre), le reste du format - le zéro
  // masqué, la liste - n'est pas un réglage de Grist et reste.
  const GRIST_KEYS = ['type', 'style', 'decimals', 'maxDecimals', 'currency', 'percent', 'words', 'preset', 'day', 'month', 'year', 'time'];
  function applyGristFormat(current, gristFormat) {
    // Le format d'une bulle une fois « Comme dans Grist » posé : le sien, sans les réglages d'avant. Un nombre à milliers garde le FR ou US choisi sur la bulle ; sans choix, la langue de
    // l'interface décide, comme pour une bulle neuve.
    const before = current || {};
    const next = {};
    Object.keys(before).forEach(key => { if (GRIST_KEYS.indexOf(key) === -1) next[key] = before[key]; });
    if (gristFormat.type === 'number' && gristFormat.style == null && (before.style === 'fr' || before.style === 'us')) next.style = before.style;
    return Object.assign(next, gristFormat);
  }
  function sameFormat(a, b) {
    // Deux réglages de bulle écrivent-ils pareil ? Pas de réglage (null) et un format vide ({}) sont le même.
    const left = a || {};
    const right = b || {};
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => JSON.stringify(left[key]) === JSON.stringify(right[key]));
  }
  function gristPreview(columnType, format) {
    // Ce que ce format écrit pour une valeur d'exemple, pour l'info-bulle du bouton : 1234,5678 (0,2567 en pourcentage), ou le 12/09/2026 à 21 h 30 (UTC).
    if (format.type === 'number') return formatNumber(format.percent ? 0.2567 : 1234.5678, format);
    return formatDate(Date.UTC(2026, 8, 12, 21, 30) / 1000, format, isDateTimeType(columnType) ? 'DateTime' : 'Date');
  }

  // --- Liste (colonne Choix multiple ou Référence multiple) ---
  const LIST_PICKS = ['all', 'first', 'last', 'nth'];
  const LIST_SEPARATOR = ', ';
  const LIST_INDEX_MAX = 999;
  // Les types de colonne que ces réglages concernent.
  function isListType(type) { return type === 'ChoiceList' || (typeof type === 'string' && type.indexOf('RefList:') === 0); }
  // Genre de réglage de format qu'une colonne de ce type permet : nombre, date, Oui / Non ou liste, sinon null (même répartition que la barre
  // flottante, js/floating-toolbars.js:wireVariableFloatingToolbar). Un format ne se garde que sur une colonne du même genre - une date sur un
  // texte donnerait n'importe quoi - : « Colonne… » (js/variable-column.js) et « Remplacer » (js/variable-linked-attrs.js) le lisent ici.
  function columnKind(type) {
    if (type === 'Numeric' || type === 'Int') return 'number';
    if (isDateType(type)) return 'date';
    if (isListType(type)) return 'list';
    return type === 'Bool' ? 'bool' : null;
  }
  // Le genre de réglage que porte un format de bulle (celui que permet une colonne est `columnKind`) : nombre, date, Oui / Non, liste, sinon null.
  // Le zéro se règle seul, sans `type` (js/floating-toolbars.js, num-zero) : c'est un réglage nombre ; la liste aussi (`list`, js/variable-list.js) :
  // elle suit d'une liste de choix à une liste de références, pas sur une colonne qui n'est pas une liste.
  function formatKindOf(format) {
    if (!format) return null;
    if (format.type === 'number' || format.type === 'date' || format.type === 'bool') return format.type;
    if (format.zero) return 'number';
    return format.list ? 'list' : null;
  }
  function normalizeList(raw) {
    // format.list = { pick, index, separator, lastSeparator, perValue } : ce que règle la fenêtre « Liste » (js/variable-list.js). `pick` : 'all'
    // (`separator` entre chacune, `lastSeparator` avant la dernière, le même si vide), 'first', 'last' ou 'nth' (la n-ième, `index` depuis 1 ; une
    // liste plus courte n'écrit rien). Ici, les réglages complets d'un `format.list` quelconque (absent, illisible, incomplet) : toujours un objet,
    // chaque clé à sa valeur par défaut au besoin.
    const list = raw && typeof raw === 'object' ? raw : {};
    return {
      pick: LIST_PICKS.indexOf(list.pick) !== -1 ? list.pick : 'all',
      index: Math.min(LIST_INDEX_MAX, Math.max(1, Math.floor(Number(list.index)) || 1)),
      separator: typeof list.separator === 'string' ? list.separator : LIST_SEPARATOR,
      lastSeparator: typeof list.lastSeparator === 'string' ? list.lastSeparator : '',
      perValue: list.perValue === true,
    };
  }
  function isDefaultList(raw) {
    // Vrai quand ces réglages ne changent rien : ni la façon d'écrire la liste, ni le nombre de documents à l'export.
    const list = normalizeList(raw);
    return list.pick === 'all' && list.separator === LIST_SEPARATOR && list.lastSeparator === '' && !list.perValue;
  }
  function storedList(raw) {
    // Ce que la bulle enregistre : seulement les clés utiles (le numéro ne sert qu'à « n-ième », les séparateurs qu'à « toutes »), ou null quand tout
    // est par défaut : une bulle remise au défaut n'a plus de réglage, ni de point bleu.
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
  function listStyle(format) {
    // Les réglages d'écriture du `format` d'une bulle quand ils diffèrent du défaut, sinon null : c'est ce que lit Variables.formatValue, une bulle
    // sans eux s'écrit comme avant (toutes les valeurs, dans l'ordre de la cellule, séparées par « , »).
    if (!format || !format.list) return null;
    const list = normalizeList(format.list);
    return list.pick === 'all' && list.separator === LIST_SEPARATOR && list.lastSeparator === '' ? null : list;
  }
  // Les valeurs d'une liste à plat : une liste de listes (une colonne Choix multiple lue sur plusieurs lignes liées) n'en fait qu'une.
  function flattenList(value) { return Array.isArray(value) ? value.flat(Infinity) : [value]; }
  function listText(texts, raw) {
    // Le texte d'une liste dont les valeurs sont déjà écrites (`texts`) : les valeurs vides sont sautées, puis le choix de `list` s'applique.
    const list = normalizeList(raw);
    const shown = texts.filter(text => text !== '' && text != null);
    if (list.pick === 'first') return shown.length ? shown[0] : '';
    if (list.pick === 'last') return shown.length ? shown[shown.length - 1] : '';
    if (list.pick === 'nth') return list.index <= shown.length ? shown[list.index - 1] : '';
    if (shown.length < 2) return shown.join('');
    const last = list.lastSeparator === '' ? list.separator : list.lastSeparator;
    return shown.slice(0, -1).join(list.separator) + last + shown[shown.length - 1];
  }

  // === Texte autour de la valeur === « Avant » et « Après » d'une bulle (fenêtre de js/variable-condition.js) : un texte collé à la valeur, par exemple
  // la virgule qui ne s'écrit que si la variable s'affiche. Deux attributs du nœud (`before` et `after`, data-before et data-after dans le HTML), pas
  // des clés du `format` : retirer un réglage de nombre ou de date ne les efface pas. La Lecture et tous les exports (PDF, Word, Excel, en-têtes et
  // pieds) les écrivent dans ReaderMode.resolveBadgeNode, au contact de la valeur ; `withAffixes` est la même règle sur un texte déjà résolu (l'aperçu
  // de la fenêtre, un champ de texte brut qui résout une bulle).
  const AFFIX_MAX = 40;
  function affix(raw) {
    // Un de ces textes tel qu'il se garde : au plus AFFIX_MAX caractères, espaces compris - une espace seule est un vrai choix -, sans caractère de
    // contrôle (un retour à la ligne ferait une ligne de plus dans le PDF) ; null quand il est vide ou n'est pas du texte.
    const text = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, AFFIX_MAX) : '';
    return text === '' ? null : text;
  }
  function affixes(before, after) {
    // Les deux textes d'une bulle : { before, after } (l'un des deux peut être null), ou null quand elle n'en a aucun.
    const out = { before: affix(before), after: affix(after) };
    return out.before || out.after ? out : null;
  }
  function withAffixes(text, around) {
    // La valeur écrite d'une bulle avec son texte autour. Rien n'est ajouté à une valeur vide (ou d'espaces seules) : la virgule ne s'écrit que pour
    // une variable qui montre quelque chose.
    if (!around || text == null || String(text).trim() === '') return text;
    return (around.before || '') + text + (around.after || '');
  }

  return {
    DATE_PRESETS, TIME_STYLES, presetLabel, timeLabel, timeChoices, timeChoiceOf, timeText, formatDate, gristDateToJsDate, cellError, isCellError, wallClock, writesTime, isDateTimeType, isDateType, dateTimeZone, formatNumber, numberLang, isZero,
    currencyGap, decimalDigits, localeCurrency, documentCurrency, gristColumnFormat, applyGristFormat, sameFormat, gristPreview,
    BOOL_CHECKBOX_STYLES, CHECKED_BOX, UNCHECKED_BOX, isCheckboxStyle, boolStyle, checkboxColor, formatBool,
    LIST_INDEX_MAX, isListType, columnKind, formatKindOf, normalizeList, isDefaultList, storedList, listStyle, flattenList, listText,
    AFFIX_MAX, affix, affixes, withAffixes,
  };
})();
