// Formatage nombre/date d'une bulle #Variable (v2 uniquement) - aucune
// dépendance externe : Intl.NumberFormat/Intl.DateTimeFormat (natifs du
// navigateur) couvrent tout sauf l'écriture d'un nombre en toutes lettres,
// qui n'a pas d'équivalent Intl et est donc écrite à la main ci-dessous
// (orthographe classique/traditionnelle - "vingt et un", pas la réforme de
// 1990 "vingt-et-un" - c'est la forme encore attendue dans un contrat).
const VariableFormat = (function () {
  // Préréglages de date, dans l'esprit de ce que proposent Word/Google Docs
  // (une liste de préréglages classiques) plutôt qu'un compositeur totalement
  // libre - cf. mémoire projet : une option "format personnalisé" est prévue
  // pour plus tard, pas construite ici.
  const DATE_PRESETS = [
    { key: 'dmy_slash_full', label: '12/09/2026', options: { day: '2-digit', month: '2-digit', year: 'numeric' } },
    { key: 'dmy_slash_short', label: '12/9/26', shortNoPad: true },
    { key: 'iso', label: '2026-09-12', iso: true },
    { key: 'd_mmm_yyyy', label: '12 sept. 2026', options: { day: 'numeric', month: 'short', year: 'numeric' } },
    { key: 'd_mmmm_yyyy', label: '12 septembre 2026', options: { day: 'numeric', month: 'long', year: 'numeric' } },
    { key: 'ddd_d_mmm_yyyy', label: 'mar. 12 sept. 2026', options: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } },
    { key: 'dddd_d_mmmm_yyyy', label: 'mardi 12 septembre 2026', options: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } },
  ];

  // Grist représente une colonne Date/DateTime comme un timestamp Unix en
  // SECONDES. Une colonne Date pure est ancrée à MINUIT UTC pour le jour
  // civil qu'elle représente - la lire en heure LOCALE ferait dériver d'un
  // jour entier pour tout fuseau à l'ouest de l'UTC (ex. 18:00 la veille en
  // heure de Paris -1, ou carrément la veille pour un fuseau américain) :
  // chaque composant est donc lu en UTC ci-dessous, jamais en heure locale.
  // Simplification acceptée pour cet incrément : une colonne DateTime avec
  // un fuseau d'affichage Grist non-UTC explicitement configuré n'est pas
  // traitée différemment (pas encore rencontré en pratique).
  function gristDateToJsDate(val) {
    if (val == null || val === '') return null;
    const n = typeof val === 'number' ? val : parseFloat(val);
    if (!Number.isFinite(n)) return null;
    return new Date(n * 1000);
  }

  function formatDate(val, presetKey) {
    const date = gristDateToJsDate(val);
    if (!date) return '';
    const preset = DATE_PRESETS.find(p => p.key === presetKey) || DATE_PRESETS[0];
    if (preset.iso) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (preset.shortNoPad) {
      // Construit à la main plutôt que via Intl.DateTimeFormat : la locale
      // fr-FR zéro-remplit jour/mois même avec `numeric` (vérifié - aucune
      // option Intl ne produit "12/9/26" non complété), ce préréglage existe
      // justement pour s'en distinguer de dmy_slash_full.
      return `${date.getUTCDate()}/${date.getUTCMonth() + 1}/${String(date.getUTCFullYear()).slice(-2)}`;
    }
    return new Intl.DateTimeFormat('fr-FR', Object.assign({ timeZone: 'UTC' }, preset.options)).format(date);
  }

  // --- Nombre en toutes lettres (français, orthographe classique) ---
  const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix'];

  // n dans [0,99]. "et" (jamais de trait d'union) pour 21/31/41/51/61/71 -
  // MAIS PAS pour 81 (quatre-vingt-un, exception bien connue). 71/91 passent
  // par soixante/quatre-vingt + un nombre de 10-19 (soixante-ET-onze,
  // quatre-vingt-onze). `hasFollowing` = autre chose s'écrit APRÈS ce nombre
  // dans le nombre entier (encore des unités, "mille", "million"...) - "vingt"
  // perd alors son 's' (quatre-vingts SEUL, mais quatre-vingt mille/-un),
  // même règle que pour "cent" (cf. threeDigitsToWords).
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
  // n dans [0,999]. "cent"/"cents" : un 's' seulement si multiplié (>1) ET
  // rien ne suit APRÈS ce nombre dans le nombre entier (deux cents seul,
  // mais deux cent un / deux cent mille / deux cents millions SEUL) -
  // "vingt" et "cent" sont les deux seuls mots de nombre qui prennent la
  // marque du pluriel, et tous deux la perdent dès qu'un autre mot de
  // nombre les suit (règle classique de l'Académie française).
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
  // "mille" toujours invariable (jamais "milles"), jamais précédé de "un"
  // ("mille", pas "un mille") - contrairement à "million"/"milliard", de
  // vrais noms qui prennent "un" et un 's' au pluriel normalement. N'écrit
  // QUE la partie entière (n déjà un entier positif ou nul) - la partie
  // décimale, le cas échéant, est gérée à part par numberToWordsFr ci-dessous.
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
      // Un groupe (milliards/millions/mille) a "quelque chose qui suit" dès
      // qu'un groupe de rang inférieur existe ENCORE, ou qu'il reste des
      // unités après - jamais du fait du nom "million"/"milliard" qui suit
      // IMMÉDIATEMENT ce même groupe (celui-là fait partie du groupe lui-même,
      // "quatre-vingts millions" seul garde son 's'). "mille" est différent :
      // ce n'est PAS un nom (invariable, jamais "un mille"/"milles") mais une
      // simple particule multiplicative qui continue le même groupe de
      // chiffres - "vingt"/"cent" la perdent donc TOUJOURS devant "mille"
      // ("quatre-vingt mille", "deux cent mille"), qu'autre chose suive
      // ensuite ou non.
      const hasFollowing = g.divisor === 1e3 ? true : (idx < groups.length - 1 || unitsCount > 0);
      if (g.divisor === 1e3) parts.push(g.count === 1 ? 'mille' : threeDigitsToWords(g.count, hasFollowing) + ' mille');
      else parts.push(threeDigitsToWords(g.count, hasFollowing) + ' ' + (g.count > 1 ? g.plural : g.singular));
    });
    if (unitsCount > 0 || groups.length === 0) parts.push(threeDigitsToWords(unitsCount, false));
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  // Écriture en toutes lettres, partie décimale INCLUSE si `decimals` est
  // renseigné (0-3, choisi via la même barre de formatage que pour l'écriture
  // chiffrée - PAS d'arrondi silencieux à l'entier le plus proche : demandé
  // explicitement par l'utilisateur, un montant "1234,56" doit pouvoir
  // s'écrire "mille deux cent trente-quatre virgule cinquante-six", pas être
  // tronqué à "mille deux cent trente-quatre"). `decimals` absent/`null` =
  // comportement historique (entier le plus proche, aucune virgule) - un
  // choix EXPLICITE dans la barre de formatage est nécessaire pour activer
  // l'écriture de la partie décimale.
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
  // Forme en toutes lettres d'une devise, pour l'accoler au nombre en
  // lettres ("mille euros", pas "mille €") - repli sur le symbole/texte tel
  // quel pour une devise personnalisée non reconnue.
  const CURRENCY_WORDS = { '€': 'euro', '$': 'dollar', '£': 'livre' };
  function currencyWords(symbol, count) {
    const base = CURRENCY_WORDS[symbol];
    if (!base) return symbol;
    return count > 1 || count < -1 ? base + 's' : base;
  }

  // opts = { style: 'fr'|'us'|'none', decimals: 0-3|null, currency: ''|'€'|'$'|texte, words: bool }
  function formatNumber(val, opts) {
    if (val == null || val === '') return '';
    const n = typeof val === 'number' ? val : parseFloat(val);
    if (!Number.isFinite(n)) return String(val);
    opts = opts || {};
    if (opts.words) {
      const words = numberToWordsFr(n, opts.decimals);
      return opts.currency ? `${words} ${currencyWords(opts.currency, Math.round(n))}` : words;
    }
    const locale = opts.style === 'us' ? 'en-US' : 'fr-FR';
    const intlOpts = {};
    if (opts.decimals != null) { intlOpts.minimumFractionDigits = opts.decimals; intlOpts.maximumFractionDigits = opts.decimals; }
    if (opts.style === 'none') intlOpts.useGrouping = false;
    let formatted = new Intl.NumberFormat(locale, intlOpts).format(n);
    if (opts.currency) formatted = locale === 'fr-FR' ? `${formatted} ${opts.currency}` : `${opts.currency}${formatted}`;
    return formatted;
  }

  return { DATE_PRESETS, formatDate, formatNumber, numberToWordsFr };
})();
