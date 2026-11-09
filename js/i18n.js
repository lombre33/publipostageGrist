// Traduction FR/EN de l'interface (panneau Réglages > Langue) - IIFE classique, chargée en tout premier (avant variable-format.js, variables.js,
// editor.js, main.js et settings.js) pour qu'ils lisent I18n.getLang() et I18n.t() comme un global nu déjà prêt, même schéma de dépendance implicite
// par ordre de <script>.
//
// Les textes eux-mêmes sont dans js/i18n-texts-*.js (un fichier par domaine : modèles, exports, éditeur, variables…), chargés AVANT ce script, qui les assemble plus bas ; il ne
// garde que la langue et `t()`. Un texte neuf va dans le fichier de son domaine, en français et en anglais dans le même lot ; une clé n'existe que dans un seul fichier.
//
// Maintenance : chaque entrée porte fr et en côte à côte dans le même objet littéral, impossible de modifier l'un sans voir l'autre. `t()` avertit en
// console (pas d'échec silencieux) si une traduction 'en' manque : filet de sécurité si un futur texte français est ajouté sans son pendant.
const I18n = (function () {
  // Les textes sont dans js/i18n-texts-*.js (un fichier par domaine, chargés avant ce script) ; une clé n'existe que dans un seul.
  const STRINGS = Object.assign({},
    I18nTextsTemplates,
    I18nTextsExport,
    I18nTextsFormat,
    I18nTextsBlocks,
    I18nTextsEditor,
    I18nTextsReview,
    I18nTextsSlides,
    I18nTextsMotion,
    I18nTextsSettings,
    I18nTextsStatus,
    I18nTextsVariables
  );

  // Hébergé par GFS (`gfs=<n>` dans l'adresse), la langue est celle de GFS : un seul choix par personne pour toutes ses apps (consigne 019, contrats de GFS 5.2 point 6). Celle que la page s'est donnée
  // en se rechargeant elle-même (`#pp-lang=fr|en` à la fin de l'adresse, js/settings.js : l'adresse du cadre garde la langue de sa création, GFS ne le recharge jamais) passe d'abord, puis le
  // paramètre `language` de l'adresse (`fr` ou `en`). null seul, ou quand GFS n'en donne pas une des deux : l'ordre de initialLang.
  function gfsLang() {
    try {
      const search = new URLSearchParams(window.location.search);
      if (!/^\d{1,6}$/.test(search.get('gfs') || '')) return null;
      const reloaded = /^#(?:pp-open=\d+&)?pp-lang=(fr|en)$/.exec(window.location.hash);
      if (reloaded) return reloaded[1];
      const given = String(search.get('language') || '').toLowerCase();
      return given === 'fr' || given === 'en' ? given : null;
    } catch (e) { return null; }
  }

  // Langue au premier lancement : celle de GFS quand il héberge l'app (gfsLang), sinon celle que la personne a choisie dans Réglages (enregistrée), sinon la première langue du navigateur parmi le français
  // et l'anglais, l'anglais quand il n'en propose aucune des deux, le français quand il ne dit rien. Le choix n'est enregistré qu'à un changement dans
  // Réglages : un navigateur remis en anglais, ou en français, est suivi tant que la personne n'a rien choisi.
  function initialLang() {
    const hosted = gfsLang();
    if (hosted) return hosted;
    let stored = null;
    try { stored = localStorage.getItem('pp_lang'); } catch (e) { /* stockage indisponible : on suit le navigateur */ }
    if (stored === 'fr' || stored === 'en') return stored;
    const asked = typeof navigator === 'undefined' ? [] : (navigator.languages && navigator.languages.length ? Array.from(navigator.languages) : [navigator.language]).filter(Boolean);
    for (const tag of asked) {
      const code = String(tag).toLowerCase().split('-')[0];
      if (code === 'fr' || code === 'en') return code;
    }
    return asked.length ? 'en' : 'fr';
  }

  let lang = initialLang();

  // Pluriel sans parenthèses : `{n|forme au singulier|forme au pluriel}` prend l'une ou l'autre selon la valeur de la variable `n` (règles de la
  // langue : en français 0 et 1 sont au singulier, en anglais seul 1) - « {count} {count|ligne trouvée|lignes trouvées} » donne « 1 ligne trouvée »,
  // « 3 lignes trouvées ». Une forme peut contenir d'autres `{variable}` ou un autre pluriel. Traité avant les variables simples, pour que le texte
  // d'une variable (nom de colonne, valeur saisie) ne soit jamais lu comme un pluriel.
  const pluralRules = {};
  function expandPlurals(s, vars) {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) return out + s.slice(i);
      out += s.slice(i, open);
      const head = /^\{(\w+)\|/.exec(s.slice(open));
      if (!head || !vars || !(head[1] in vars)) { out += '{'; i = open + 1; continue; }
      let depth = 0;
      let split = -1;
      let close = -1;
      for (let j = open; j < s.length && close < 0; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') { if (--depth === 0) close = j; }
        else if (s[j] === '|' && depth === 1 && j >= open + head[0].length && split < 0) split = j;
      }
      if (close < 0 || split < 0) { out += '{'; i = open + 1; continue; }
      const rules = pluralRules[lang] || (pluralRules[lang] = new Intl.PluralRules(lang));
      const chosen = rules.select(Number(vars[head[1]])) === 'one' ? s.slice(open + head[0].length, split) : s.slice(split + 1, close);
      out += expandPlurals(chosen, vars);
      i = close + 1;
    }
    return out;
  }

  function translate(key, vars) {
    const entry = STRINGS[key];
    if (!entry) { console.warn('[I18n] clé inconnue :', key); return key; }
    if (!entry[lang]) console.warn('[I18n] traduction "' + lang + '" manquante pour "' + key + '" (repli FR).');
    let s = entry[lang] || entry.fr;
    if (vars) {
      s = expandPlurals(s, vars);
      Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
    }
    return s;
  }

  // Vrai quand la clé a un texte : pour un texte facultatif, que l'appelant lit sinon dans ses données (le nom d'un modèle de la galerie), là où t() d'une clé absente
  // écrirait la clé dans la page et un avertissement dans la console.
  function has(key) { return Object.prototype.hasOwnProperty.call(STRINGS, key); }

  function getLang() { return lang; }

  // Garde la langue pour le prochain chargement (initialLang la relit au démarrage). false : stockage indisponible, la langue ne survivrait pas au rechargement.
  // C'est ainsi que le produit change de langue : js/settings.js:changeLanguage garde le choix, puis recharge la page ; rien n'est retraduit en route.
  function storeLang(next) {
    try { localStorage.setItem('pp_lang', next === 'en' ? 'en' : 'fr'); return true; } catch (e) { return false; }
  }

  // Fixe la langue dans laquelle t() répond, sans toucher à la page ni au stockage. Réservé aux tests (dev-tests/), qui lisent les textes d'un écran dans l'autre
  // langue ; le produit ne l'appelle jamais (gardé par codeHygiene, section 24).
  function setLang(next) { lang = next === 'en' ? 'en' : 'fr'; }

  // Traduit la page statique : les 4 variantes d'attribut de traduction déclarative - le texte français d'origine reste en dur dans le HTML comme repli si
  // ce fichier n'a pas encore chargé.
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = translate(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-tip]').forEach(el => { el.setAttribute('data-tip', translate(el.getAttribute('data-i18n-tip'))); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', translate(el.getAttribute('data-i18n-aria'))); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', translate(el.getAttribute('data-i18n-placeholder'))); });
  }

  // Appliqué une seule fois, au chargement : ce script est placé après tout le HTML du bandeau/des modales (les <script> sont en fin de <body>), donc le DOM
  // à traduire existe déjà - un utilisateur ayant déjà choisi EN voit l'anglais dès l'ouverture. Changer de langue recharge la page, qui repasse ici.
  document.documentElement.lang = lang;
  applyTranslations();

  return { t: translate, has, getLang, setLang, storeLang };
})();
