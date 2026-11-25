// SUIVI DU LAG, TEMPORAIRE (10/11 : de quoi mesurer le gel d'un gros import chez la personne qui l'observe, puis en lire le rapport). Il tourne sans rien changer à l'écran et se lit à la demande :
// Ctrl + Alt + Maj + L (ou `PerfTrace.download()` dans la console) enregistre un rapport texte (`rapport-fluidite-….txt`) et le copie dans le presse-papiers quand le navigateur le permet.
// À retirer une fois le gel compris : ce fichier, sa balise dans index.html, ses textes `perfTrace.*`, son groupe d'essais `perfTrace` et ses appels `PerfTrace.mark` (js/main-import.js, js/main.js, et le `trace` du
// départ du diaporama : extensions/diapositives/slide-show.js et slide-window.js ; mise en page du rendu d'impression et du diaporama : js/reader-mode.js, `traceMark`).
//
// Ce qu'il garde (les 600 derniers faits, en mémoire seulement : rien n'est envoyé ni écrit ailleurs) :
//  - les ARRÊTS de la page : un battement toutes les 100 ms, un retard de 150 ms ou plus est un arrêt (marche dans tous les navigateurs, Firefox compris) ;
//  - les longues tâches et les longues images d'animation (`longtask`, `long-animation-frame` : Chromium seulement ; ces dernières disent QUEL script a pris le temps) ;
//  - les étapes que le code nomme (`PerfTrace.mark`) et la durée des fonctions de l'éditeur qui dépassent 40 ms (`PerfTrace.watch`) ;
//  - la mémoire de la page quand le navigateur la donne (Chromium : `performance.memory`), la machine et la taille du document ;
//  - LE JOURNAL D'OUVERTURE (23/11, « explorer des pistes pour que l'ouverture soit encore plus rapide » : tous les documents, le démarrage du widget, le changement de document par le menu) : chaque appel à Grist
//    (`grist.docApi` : lecture d'une table, écriture, jeton) avec sa durée et ce qu'il porte, cumulé par appel dans le rapport, de quoi voir ce que le démarrage et les relectures de l'enregistrement automatique
//    lisent ; les fichiers du chargement (les plus lents, ceux servis sans transfert, le dernier reçu de chaque site : l'éditeur, servi par la copie de l'app, arrive-t-il longtemps après les scripts ?) ; le temps de chaque document ouvert
//    depuis le menu (`menu : document choisi`, `document ouvert`).
const PerfTrace = (function () {
  const T0 = performance.now();
  const MAX_EVENTS = 600;
  const BEAT_MS = 100;
  const GAP_MS = 150;       // un battement en retard d'au moins autant est un arrêt
  const SLOW_CALL_MS = 40;  // une fonction surveillée plus longue est gardée
  const events = [];
  const totals = { gaps: 0, blockedMs: 0, maxGapMs: 0, longTasks: 0, slowCalls: 0 };
  const errors = [];
  let hiddenAt = document.hidden ? performance.now() : 0;
  let visibleAgain = 0;

  const rel = time => Math.round(time - T0);
  function heapMb() {
    const memory = performance.memory;
    return memory && memory.usedJSHeapSize ? Math.round(memory.usedJSHeapSize / 1048576) : null;
  }
  function push(entry) {
    events.push(entry);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  }

  // Une étape que le code nomme, avec la mémoire du moment ; `extra` : des chiffres en plus (diapositives lues, taille...).
  function mark(label, extra) {
    if (performance.now() - watchesAt > 1000) installWatches();
    const heap = heapMb();
    push(Object.assign({ t: rel(performance.now()), kind: 'mark', label }, heap === null ? {} : { heapMb: heap }, extra || {}));
  }

  // Le battement : un minuteur qui se relance lui-même ; s'il arrive en retard, la page était occupée. Un onglet caché ralentit les minuteurs (et le retour à l'écran aussi) : ce retard-là n'est pas compté.
  let lastBeat = performance.now();
  function beat() {
    const now = performance.now();
    const late = now - lastBeat - BEAT_MS;
    lastBeat = now;
    const away = document.hidden || (hiddenAt && now - hiddenAt < 2000) || (visibleAgain && now - visibleAgain < 2000);
    if (late >= GAP_MS && !away) {
      totals.gaps += 1;
      totals.blockedMs += Math.round(late);
      totals.maxGapMs = Math.max(totals.maxGapMs, Math.round(late));
      push({ t: rel(now - late), kind: 'gap', ms: Math.round(late) });
    }
    setTimeout(beat, BEAT_MS);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = performance.now();
    else { visibleAgain = performance.now(); hiddenAt = 0; }
  });
  setTimeout(beat, BEAT_MS);

  // Ce que le navigateur sait dire des longues tâches : Chromium seulement, sans erreur ailleurs.
  function observe(type, onEntry) {
    try {
      new PerformanceObserver(list => list.getEntries().forEach(onEntry)).observe({ type, buffered: true });
    } catch (e) { /* type inconnu de ce navigateur */ }
  }
  observe('longtask', (entry) => {
    totals.longTasks += 1;
    push({ t: rel(entry.startTime), kind: 'longtask', ms: Math.round(entry.duration) });
  });
  observe('long-animation-frame', (entry) => {
    if (entry.duration < 100) return;
    const scripts = (entry.scripts || []).slice(0, 3).map(s => (s.sourceFunctionName || s.invoker || '?') + ' ' + String(s.sourceURL || '').split('/').pop().split('?')[0] + ':' + (s.sourceCharPosition >= 0 ? s.sourceCharPosition : '?') + ' ' + Math.round(s.duration) + ' ms');
    push({ t: rel(entry.startTime), kind: 'frame', ms: Math.round(entry.duration), blockingMs: Math.round(entry.blockingDuration || 0), scripts });
  });

  // Surveille `owner[name]` : une fonction qui dépasse SLOW_CALL_MS est gardée avec son nom (le résultat et l'exception passent tels quels ; une promesse est suivie jusqu'à sa fin).
  function watch(owner, name, label) {
    const original = owner && owner[name];
    if (typeof original !== 'function' || original.__perfWatched) return false;
    const watched = function () {
      const start = performance.now();
      const done = () => {
        const ms = performance.now() - start;
        if (ms >= SLOW_CALL_MS) { totals.slowCalls += 1; push({ t: rel(start), kind: 'call', label: label || name, ms: Math.round(ms) }); }
      };
      let result;
      try { result = original.apply(this, arguments); } catch (e) { done(); throw e; }
      if (result && typeof result.then === 'function') result.then(done, done); else done();
      return result;
    };
    watched.__perfWatched = true;
    try { owner[name] = watched; } catch (e) { return false; }
    return true;
  }
  // Les modules qui portent l'ouverture d'un gros document : toutes leurs fonctions exportées sont surveillées (sauf les lectures `get…`, `is…`, `has…`, appelées dans des boucles). Une extension qui arrive
  // après le chargement (la bande des diapositives) est prise au passage suivant : `installWatches` est relancée par chaque repère, au plus une fois par seconde.
  const modulesToWatch = () => ({
    Editor: typeof Editor !== 'undefined' ? Editor : null,
    EditorCore: typeof EditorCore !== 'undefined' ? EditorCore : null,
    SlidesEntry: typeof SlidesEntry !== 'undefined' ? SlidesEntry : null,
    SlideStrip: typeof SlideStrip !== 'undefined' ? SlideStrip : null,
    SlideOverview: typeof SlideOverview !== 'undefined' ? SlideOverview : null,
    HeaderFooterPreview: typeof HeaderFooterPreview !== 'undefined' ? HeaderFooterPreview : null,
    Templates: typeof Templates !== 'undefined' ? Templates : null,
    LinkedTable: typeof LinkedTable !== 'undefined' ? LinkedTable : null,
    SlideLinks: typeof SlideLinks !== 'undefined' ? SlideLinks : null,
    SlideCopies: typeof SlideCopies !== 'undefined' ? SlideCopies : null,
    PageCopies: typeof PageCopies !== 'undefined' ? PageCopies : null,
    PageZoom: typeof PageZoom !== 'undefined' ? PageZoom : null,
    MainToolbar: typeof MainToolbar !== 'undefined' ? MainToolbar : null,
    // Le départ du diaporama (11/11 : « l'ouverture dans un nouvel onglet prend une éternité ») : le texte, le rendu de la Lecture, l'envoi à la fenêtre.
    SlideShow: typeof SlideShow !== 'undefined' ? SlideShow : null,
    SlideWindow: typeof SlideWindow !== 'undefined' ? SlideWindow : null,
    PrintExport: typeof PrintExport !== 'undefined' ? PrintExport : null,
    HeavyImages: typeof HeavyImages !== 'undefined' ? HeavyImages : null,
  });
  // Les modules dont seules ces fonctions sont surveillées : les autres sont appelées dans des boucles (une par variable, par lien, par image), où la surveillance elle-même pèserait.
  const functionsToWatch = () => ({
    ReaderMode: [typeof ReaderMode !== 'undefined' ? ReaderMode : null, ['render', 'renderInto']],
    HtmlSanitize: [typeof HtmlSanitize !== 'undefined' ? HtmlSanitize : null, ['clean', 'parseInert']],
    FrameAnim: [typeof FrameAnim !== 'undefined' ? FrameAnim : null, ['stampSlides', 'stampIn']],
    ExternalImages: [typeof ExternalImages !== 'undefined' ? ExternalImages : null, ['setAside', 'blockIn']],
  });
  let watchesAt = 0;
  function installWatches() {
    watchesAt = performance.now();
    const modules = modulesToWatch();
    Object.keys(modules).forEach((moduleName) => {
      const owner = modules[moduleName];
      if (!owner) return;
      Object.keys(owner).forEach((method) => {
        const descriptor = Object.getOwnPropertyDescriptor(owner, method);
        if (descriptor && typeof descriptor.value === 'function' && !/^(?:get|is|has)[A-Z_]/.test(method)) watch(owner, method, moduleName + '.' + method);
      });
    });
    const chosen = functionsToWatch();
    Object.keys(chosen).forEach((moduleName) => {
      const owner = chosen[moduleName][0];
      if (owner) chosen[moduleName][1].forEach((method) => { watch(owner, method, moduleName + '.' + method); });
    });
  }
  window.addEventListener('load', () => setTimeout(installWatches, 0));
  window.addEventListener('error', (event) => { if (errors.length < 8) errors.push(String(event.message || event.error || '').slice(0, 200)); });
  window.addEventListener('unhandledrejection', (event) => { if (errors.length < 8) errors.push('promesse : ' + String(event.reason && event.reason.message || event.reason || '').slice(0, 200)); });

  // --- Les appels à Grist (le journal d'ouverture) ---
  // Une ligne par appel plus long que GRIST_EVENT_MS, ou qui porte plus de GRIST_EVENT_CHARS signes, dans la chronologie ; tous les appels comptent dans le cumul du rapport (par « appel table »). La durée est celle de
  // l'aller-retour vu d'ici (la requête, Grist, la réponse) : le travail de la page sur la réponse n'y est pas.
  const GRIST_EVENT_MS = 60;
  const GRIST_EVENT_CHARS = 102400;
  const gristCalls = new Map();
  // Ce qu'un appel porte, en signes : les textes d'une table lue ou d'une écriture (un nombre compte pour 8). Plafonné : un tableau de plus de 200 000 valeurs est estimé sur son début.
  function charsOf(value, depth) {
    if (typeof value === 'string') return value.length;
    if (value === null || typeof value !== 'object' || depth > 3) return typeof value === 'number' ? 8 : 0;
    const list = Array.isArray(value) ? value : Object.keys(value).map(key => value[key]);
    const limit = Math.min(list.length, 200000);
    let sum = 0;
    for (let i = 0; i < limit; i++) sum += charsOf(list[i], depth + 1);
    return limit < list.length ? Math.round(sum * list.length / limit) : sum;
  }
  // « fetchTable Publipostage_Modeles », « apply… 1 action UpdateRecord Publipostage_Modeles » (les écritures de grist.docApi portent un nom en « apply ») : ce que l'appel demande, sans ses valeurs.
  const isWrite = name => /^apply/.test(name);
  function describeGristCall(name, args) {
    const first = args[0];
    if (name === 'fetchTable' && typeof first === 'string') return name + ' ' + first;
    if (isWrite(name) && Array.isArray(first) && first.length) {
      const action = Array.isArray(first[0]) ? first[0] : [];
      return name + ' ' + first.length + (first.length > 1 ? ' actions ' : ' action ') + action.slice(0, 2).filter(part => typeof part === 'string').join(' ');
    }
    return name;
  }
  function noteGristCall(label, start, chars) {
    const ms = performance.now() - start;
    const known = gristCalls.get(label) || { n: 0, ms: 0, max: 0, chars: 0 };
    known.n += 1;
    known.ms += ms;
    known.max = Math.max(known.max, ms);
    known.chars += chars;
    gristCalls.set(label, known);
    if (ms >= GRIST_EVENT_MS || chars >= GRIST_EVENT_CHARS) push({ t: rel(start), kind: 'grist', label, ms: Math.round(ms), chars });
  }
  // Surveille les fonctions de `api` (grist.docApi) : le résultat, la promesse et l'exception passent tels quels, le compte se fait à côté. Rend le nombre de fonctions surveillées.
  function watchGrist(api) {
    let watched = 0;
    if (!api || typeof api !== 'object') return watched;
    Object.keys(api).forEach((name) => {
      const original = api[name];
      if (typeof original !== 'function' || original.__perfGrist) return;
      const wrapped = function () {
        const start = performance.now();
        const label = describeGristCall(name, arguments);
        const sent = isWrite(name) ? charsOf(arguments[0], 0) : 0;
        let result;
        try { result = original.apply(this, arguments); } catch (error) { noteGristCall(label, start, sent); throw error; }
        if (result && typeof result.then === 'function') {
          result.then(value => noteGristCall(label, start, name === 'fetchTable' ? charsOf(value, 0) : sent), () => noteGristCall(label, start, sent));
        } else noteGristCall(label, start, sent);
        return result;
      };
      wrapped.__perfGrist = true;
      try { api[name] = wrapped; watched += 1; } catch (error) { /* une propriété que l'objet refuse de changer reste telle qu'elle est */ }
    });
    return watched;
  }
  // `grist` est là avant ce fichier (le script de l'API de Grist est chargé en tête d'index.html) : les premiers appels du démarrage passent déjà par ici.
  try { if (typeof grist !== 'undefined' && grist && grist.docApi) watchGrist(grist.docApi); } catch (error) { /* hors de Grist (une page de test sans API) : rien à surveiller */ }

  // --- Le document choisi dans le menu ---
  // Le menu des documents (#template-select) : l'instant du choix, pour que `opened` dise ce qui s'est passé entre le choix et le texte à l'écran (une attente d'enregistrement, une lecture dans Grist...).
  let pickAt = 0;
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!target || target.id !== 'template-select') return;
    pickAt = performance.now();
    mark('menu : document choisi', { id: target.value });
  }, true);
  // Un document est posé dans l'éditeur (js/main.js:loadTemplateIntoEditor) : `info` dit lequel (id, type, Ko) et le temps que la fonction a pris ; `depuisLeMenuMs` : depuis le choix dans le menu, quand c'est de là qu'il vient.
  function opened(info) {
    const since = pickAt ? Math.round(performance.now() - pickAt) : null;
    pickAt = 0;
    mark('document ouvert', Object.assign({}, info, since === null ? {} : { depuisLeMenuMs: since }));
  }

  // --- Le rapport ---
  const seconds = ms => (ms / 1000).toFixed(ms >= 10000 ? 0 : 1) + ' s';
  const span = ms => (ms < 1000 ? Math.round(ms) + ' ms' : seconds(ms));
  const megabytes = chars => (chars >= 1048576 ? (chars / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(chars / 1024)) + ' Ko');
  function describe(entry) {
    const when = String(entry.t).padStart(7) + ' ms  ';
    const heap = entry.heapMb === undefined ? '' : '  [mémoire JS ' + entry.heapMb + ' Mo]';
    const extra = Object.keys(entry).filter(k => !['t', 'kind', 'label', 'ms', 'heapMb', 'scripts', 'blockingMs'].includes(k)).map(k => k + '=' + entry[k]).join(' ');
    switch (entry.kind) {
      case 'gap': return when + 'ARRÊT de la page : ' + seconds(entry.ms) + ' (jusqu’à ' + (entry.t + entry.ms) + ' ms)';
      case 'longtask': return when + 'longue tâche : ' + entry.ms + ' ms';
      case 'frame': return when + 'longue image : ' + entry.ms + ' ms (dont ' + entry.blockingMs + ' ms bloquants)' + (entry.scripts.length ? ' par ' + entry.scripts.join(' ; ') : '');
      case 'call': return when + entry.label + ' : ' + entry.ms + ' ms';
      case 'grist': return when + 'Grist ' + entry.label + ' : ' + entry.ms + ' ms' + (entry.chars ? ', ' + megabytes(entry.chars) : '') + (entry.ms >= 300 ? ' (réponse à ' + (entry.t + entry.ms) + ' ms)' : '');
      default: return when + entry.label + (extra ? '  ' + extra : '') + heap;
    }
  }
  function documentFacts() {
    try {
      const images = document.querySelectorAll('#editor-container img');
      let imageChars = 0;
      images.forEach((img) => { imageChars += (img.getAttribute('src') || '').length; });
      return 'éléments de la page ' + document.getElementsByTagName('*').length + ', images du document ' + images.length + ' (' + Math.round(imageChars / 104857.6) / 10 + ' Mo d\'adresses de données), diapositives en bande ' + document.querySelectorAll('.pp-slide-item').length;
    } catch (e) { return 'document illisible'; }
  }
  // Le chargement de la page, tel que le navigateur le chiffre (marche dans Firefox aussi) : de quoi mesurer le préchargement des scripts (outils/precharger-scripts.mjs) chez la personne.
  function loadFacts() {
    try {
      const navigation = performance.getEntriesByType('navigation')[0];
      if (!navigation) return 'non donné par ce navigateur';
      const files = performance.getEntriesByType('resource').filter(entry => entry.initiatorType === 'script' || entry.initiatorType === 'link' || entry.initiatorType === 'css').length;
      return 'DOMContentLoaded ' + Math.round(navigation.domContentLoadedEventEnd) + ' ms, page chargée ' + Math.round(navigation.loadEventEnd) + ' ms, ' + files + ' fichiers lus (scripts et feuilles)';
    } catch (e) { return 'illisible'; }
  }
  // Le départ, tel que le navigateur le chiffre : la chronologie de ce rapport compte depuis l'instant où CE fichier s'exécute (les scripts d'avant sont déjà passés), pas depuis le clic dans GFS ; le premier affichage dit quand la personne voit enfin quelque chose.
  function startFacts() {
    try {
      const paints = {};
      performance.getEntriesByType('paint').forEach((entry) => { paints[entry.name] = Math.round(entry.startTime); });
      const navigation = performance.getEntriesByType('navigation')[0];
      const parts = [];
      if (navigation) parts.push('index.html reçu à ' + Math.round(navigation.responseEnd) + ' ms');
      parts.push('premier affichage ' + (paints['first-paint'] === undefined ? 'non donné' : paints['first-paint'] + ' ms') + ', premier contenu ' + (paints['first-contentful-paint'] === undefined ? 'non donné' : paints['first-contentful-paint'] + ' ms'));
      const opened = events.find(entry => entry.kind === 'mark' && entry.label === 'document ouvert');
      if (opened) parts.push('premier document à l’écran à ' + Math.round(T0 + opened.t) + ' ms');
      return ['Départ : la chronologie ci-dessous commence ' + Math.round(T0) + ' ms après le début du chargement de la page (temps de la page : ' + parts.join(' ; ') + ')'];
    } catch (error) { return ['Départ : illisible']; }
  }
  // De quoi se compose la table des modèles que le démarrage lit en entier (js/templates.js:loadAll) : par colonne, et les lignes les plus lourdes ; le travail de ce widget sur ces lignes (hors attente de Grist) est dit à côté.
  function weightFacts() {
    if (typeof Templates === 'undefined' || typeof Templates.getLoadWeights !== 'function') return [];
    const weights = Templates.getLoadWeights();
    if (!weights) return ['Table des modèles : pas encore lue'];
    const total = Object.keys(weights.columns).reduce((sum, column) => sum + weights.columns[column], 0);
    const columns = Object.keys(weights.columns).filter(column => weights.columns[column] > 0).sort((a, b) => weights.columns[b] - weights.columns[a]).slice(0, 6).map(column => column + ' ' + megabytes(weights.columns[column]));
    return [
      'Table des modèles : ' + weights.rows + ' lignes, ' + megabytes(total) + ' ; par colonne : ' + columns.join(', '),
      '   les plus lourdes : ' + weights.heaviest.map(row => '#' + row.id + ' ' + row.type + ' « ' + row.name + ' » ' + megabytes(row.chars)).join(' ; '),
      '   le travail de ce widget une fois la table reçue : comptage ' + weights.weighMs + ' ms, mise en cache des lignes ' + (weights.rowsMs === undefined ? '?' : weights.rowsMs) + ' ms',
    ];
  }
  // Les appels à Grist, cumulés : ce que le démarrage lit, ce que l'enregistrement automatique relit toutes les 15 s au repos, ce qu'une écriture envoie.
  function gristFacts() {
    const rows = Array.from(gristCalls.entries()).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12);
    const total = Array.from(gristCalls.values()).reduce((sum, item) => ({ n: sum.n + item.n, ms: sum.ms + item.ms }), { n: 0, ms: 0 });
    if (!rows.length) return ['Appels à Grist : aucun vu (ce rapport est fait hors de Grist, ou avant le premier appel)'];
    return ['Appels à Grist : ' + total.n + ' en tout, ' + span(total.ms) + ' cumulées (les plus longs d’abord ; un « signes » = ce que l’appel lit ou envoie)']
      .concat(rows.map(([label, item]) => '   ' + label + ' : ' + item.n + ' fois, ' + span(item.ms) + ' en tout, le plus long ' + span(item.max) + (item.chars ? ', ' + megabytes(item.chars) + ' de signes' : '')));
  }
  // --- La lecture légère (SQL) : répond-elle chez cette personne, et en combien de temps, à côté de la lecture complète du démarrage ---
  // La table des modèles se lit EN ENTIER (contenus compris) au démarrage. Lire seulement ses noms, ses dates et ses longueurs par l'interface SQL du document (js/grist-api.js:lightQuery) coûterait bien moins
  // si elle répond ; ce que le rapport dit ici le décide (23/11). Une seule lecture, faite quand on enregistre le rapport (Ctrl + Alt + Maj + L) : rien ne part sur le réseau tant que personne ne le demande.
  // Les valeurs de SQL sont comparées à celles du cache (des dates qui s'égalent, des longueurs qui s'égalent) : ce que la lecture légère saurait dire d'un modèle changé, sans le relire.
  const PROBE_TIMEOUT_MS = 4000;
  let lightProbeResult = null;
  const codePoints = text => { let count = text.length; for (let i = 0; i < text.length; i++) { const unit = text.charCodeAt(i); if (unit >= 0xD800 && unit <= 0xDBFF) count--; } return count; };
  async function probeSql() {
    const start = performance.now();
    const done = result => { lightProbeResult = Object.assign({ ms: Math.round(performance.now() - start) }, result); return lightProbeResult; };
    if (typeof GristAPI === 'undefined' || typeof GristAPI.lightQuery !== 'function' || typeof Templates === 'undefined' || typeof SchemaColumns === 'undefined') return done({ state: 'absent' });
    try {
      // Les noms que le document PORTE (les anciens, français, d'une bêta : SchemaColumns.whereIs), pas ceux du code.
      const quote = name => '"' + String(name).replace(/"/g, '""') + '"';
      const dateAt = SchemaColumns.whereIs(Templates.TABLE_NAME, 'ModifiedAt');
      const contentAt = SchemaColumns.whereIs(Templates.TABLE_NAME, 'Content');
      const rows = await GristAPI.lightQuery('SELECT id, ' + quote(dateAt.column) + ' AS ModifiedAt, length(' + quote(contentAt.column) + ') AS taille FROM ' + quote(dateAt.table), PROBE_TIMEOUT_MS);
      const cached = Templates.getCached();
      const byId = new Map(cached.map(template => [String(template.id), template]));
      let seen = 0, sameDates = 0, sameLengths = 0;
      rows.forEach((row) => {
        const template = byId.get(String(row.id));
        if (!template) return;
        seen += 1;
        if (Templates.sameDateModif(row.ModifiedAt, template.dateModif)) sameDates += 1;
        if (template.chargee !== false && typeof template.contenu === 'string' && Number(row.taille) === codePoints(template.contenu)) sameLengths += 1;
      });
      return done({ state: 'ok', rows: rows.length, cached: cached.length, seen, sameDates, sameLengths, chars: charsOf(rows, 0) });
    } catch (error) {
      return done({ state: 'refused', reason: (error && error.reason) || 'erreur', status: error && error.status, detail: error && error.detail });
    }
  }
  // La lecture d'UNE ligne par l'interface REST (`/tables/<table>/records`, filtrée sur son numéro), au même jeton en lecture seule : si elle répond, un document peut s'afficher sans attendre la lecture de toute la table (la ligne du modèle ouvert, ou la première). Ce qu'elle rend est comparé au cache.
  async function probeRest() {
    const start = performance.now();
    const done = result => Object.assign({ ms: Math.round(performance.now() - start) }, result);
    if (typeof GristAPI === 'undefined' || typeof GristAPI.lightRecords !== 'function' || typeof Templates === 'undefined' || typeof SchemaColumns === 'undefined') return done({ state: 'absent' });
    try {
      const cached = Templates.getCached();
      const current = Templates.getCurrentId();
      const target = cached.find(template => String(template.id) === String(current)) || cached[0];
      if (!target) return done({ state: 'absent' });
      const contentAt = SchemaColumns.whereIs(Templates.TABLE_NAME, 'Content');
      const { records, bytes } = await GristAPI.lightRecords(contentAt.table, [target.id], PROBE_TIMEOUT_MS);
      const fields = records[0] && records[0].fields;
      const result = { state: 'ok', rows: records.length, bytes, id: target.id, same: !!fields && target.chargee !== false && fields[contentAt.column] === target.contenu };
      return done(result);
    } catch (error) {
      return done({ state: 'refused', reason: (error && error.reason) || 'erreur', status: error && error.status, detail: error && error.detail });
    }
  }
  // Une seule sonde à la fois : un second appui sur le raccourci pendant qu'elle tourne attend la même au lieu d'en relancer une (qui aurait remplacé le résultat par un résultat sans la lecture REST, et refait des demandes).
  let probing = null;
  function probeLight() {
    if (!probing) {
      probing = (async () => {
        const sql = await probeSql();
        sql.rest = await probeRest();
        return sql;
      })().finally(() => { probing = null; });
    }
    return probing;
  }
  const REASONS = { jeton: 'Grist ne donne pas de jeton', 'réseau': 'la demande n’a pas abouti (hors ligne, politique du site ou de GFS)', http: 'Grist a refusé', 'délai': 'pas de réponse à temps', forme: 'réponse que je ne sais pas lire', erreur: 'erreur' };
  function lightFacts() {
    const probe = lightProbeResult;
    if (!probe) return ['Lecture légère (SQL) : pas encore sondée (elle se fait quand on enregistre ce rapport par Ctrl + Alt + Maj + L)'];
    if (probe.state === 'absent') return ['Lecture légère (SQL) : indisponible dans cette page'];
    const full = typeof Templates !== 'undefined' && typeof SchemaColumns !== 'undefined' ? gristCalls.get('fetchTable ' + SchemaColumns.actualTable(Templates.TABLE_NAME)) : null;
    const against = full && full.n ? ' ; la lecture complète de la table des modèles : ' + span(full.max) + ' au plus long, ' + megabytes(full.chars / full.n) + ' par lecture' : '';
    const rest = restFacts(probe.rest);
    if (probe.state === 'refused') return ['Lecture légère (SQL) : refusée après ' + span(probe.ms) + ' - ' + (REASONS[probe.reason] || probe.reason) + (probe.status ? ' (HTTP ' + probe.status + ')' : '') + (probe.detail ? ' : « ' + probe.detail + ' »' : '') + against, ...rest];
    return [
      'Lecture légère (SQL) : répond en ' + span(probe.ms) + ' (' + probe.rows + ' lignes, ' + megabytes(probe.chars) + ')' + against,
      '   dates qui s’égalent à celles du cache : ' + probe.sameDates + ' sur ' + probe.seen + ' ; longueurs qui s’égalent : ' + probe.sameLengths + ' sur ' + probe.seen + (probe.rows !== probe.cached ? ' ; ATTENTION : ' + probe.rows + ' lignes en SQL, ' + probe.cached + ' modèles en cache' : ''),
      ...rest,
    ];
  }
  function restFacts(probe) {
    if (!probe || probe.state === 'absent') return ['Lecture d’une ligne par REST : indisponible dans cette page'];
    if (probe.state === 'refused') return ['Lecture d’une ligne par REST : refusée après ' + span(probe.ms) + ' - ' + (REASONS[probe.reason] || probe.reason) + (probe.status ? ' (HTTP ' + probe.status + ')' : '') + (probe.detail ? ' : « ' + probe.detail + ' »' : '')];
    const lines = ['Lecture d’une ligne par REST : répond en ' + span(probe.ms) + ' (ligne #' + probe.id + ', ' + megabytes(probe.bytes) + ', ' + probe.rows + ' ligne rendue, texte identique à celui du cache : ' + (probe.same ? 'oui' : 'NON') + ')'];
    return lines;
  }
  // Les fichiers du chargement : les plus lents, ceux servis sans transfert (le cache du navigateur : seulement pour ceux de la page, un autre site ne donne pas sa taille), et pour chaque site le dernier fichier reçu
  // (l'éditeur vient de vendor/editeur/, avec l'app : s'il arrive longtemps après les scripts, la page l'attend).
  function fileFacts() {
    try {
      const all = performance.getEntriesByType('resource');
      if (!all.length) return ['Fichiers : non donnés par ce navigateur'];
      const own = all.filter(entry => entry.name.indexOf(location.origin) === 0);
      const free = own.filter(entry => entry.transferSize === 0 && entry.decodedBodySize > 0).length;
      const hosts = {};
      all.forEach((entry) => {
        let host = '?';
        try { host = new URL(entry.name).host; } catch (error) { /* adresse illisible */ }
        const known = hosts[host] || { n: 0, last: 0, first: Infinity, bytes: 0 };
        known.n += 1;
        known.last = Math.max(known.last, Math.round(entry.responseEnd));
        known.first = Math.min(known.first, Math.round(entry.startTime));
        known.bytes += entry.transferSize || 0;
        hosts[host] = known;
      });
      const slow = all.slice().sort((a, b) => (b.responseEnd - b.startTime) - (a.responseEnd - a.startTime)).slice(0, 6)
        .map(entry => entry.name.split('/').pop().split('?')[0].slice(0, 40) + ' ' + Math.round(entry.responseEnd - entry.startTime) + ' ms (début à ' + Math.round(entry.startTime) + ' ms)');
      return [
        'Fichiers : ' + all.length + ' lus, dont ' + free + ' sur ' + own.length + ' de la page sans transfert (cache du navigateur)',
        '   par site : ' + Object.keys(hosts).map(host => host + ' ' + hosts[host].n + ' (le dernier reçu à ' + hosts[host].last + ' ms, le premier demandé à ' + hosts[host].first + ' ms' + (hosts[host].bytes ? ', ' + megabytes(hosts[host].bytes) + ' transférés' : '') + ')').join(' ; '),
        '   les plus lents : ' + slow.join(' ; '),
      ];
    } catch (error) { return ['Fichiers : illisibles']; }
  }
  function report() {
    const nav = navigator;
    const heap = heapMb();
    const lines = [
      'Rapport de fluidité de Publipostage+ (suivi temporaire)',
      'Fait le ' + new Date().toISOString() + ', page ouverte depuis ' + seconds(performance.now() - T0),
      'Navigateur : ' + nav.userAgent,
      'Machine : ' + (nav.hardwareConcurrency || '?') + ' cœurs, mémoire annoncée ' + (nav.deviceMemory ? nav.deviceMemory + ' Go' : 'inconnue') + ', écran ' + screen.width + 'x' + screen.height + ' à ' + (window.devicePixelRatio || 1) + ', fenêtre ' + innerWidth + 'x' + innerHeight,
      'Mémoire JS maintenant : ' + (heap === null ? 'non donnée par ce navigateur' : heap + ' Mo'),
      'Chargement de la page : ' + loadFacts(),
      ...startFacts(),
      ...fileFacts(),
      ...gristFacts(),
      ...weightFacts(),
      ...lightFacts(),
      'Document : ' + documentFacts(),
      'Arrêts de la page (retard de ' + GAP_MS + ' ms ou plus) : ' + totals.gaps + ', ' + seconds(totals.blockedMs) + ' au total, le plus long ' + seconds(totals.maxGapMs) + ' ; longues tâches ' + totals.longTasks + ' ; fonctions lentes ' + totals.slowCalls,
    ];
    if (errors.length) lines.push('Erreurs vues : ' + errors.join(' | '));
    lines.push('', 'Chronologie (les ' + events.length + ' derniers faits ; le temps compte depuis l\'ouverture de la page) :');
    events.slice().sort((a, b) => a.t - b.t).forEach(entry => lines.push(describe(entry)));
    return lines.join('\n');
  }

  // Une ligne pour un autre rapport (la fenêtre « ce qui n'a pas été repris » d'un import) : les arrêts, la mémoire et les repères dont le nom commence par `prefix` (tous par défaut), chacun avec son instant.
  function summary(prefix) {
    const heap = heapMb();
    const marks = events.filter(entry => entry.kind === 'mark' && (!prefix || entry.label.indexOf(prefix) === 0)).map(entry => entry.label + ' à ' + seconds(entry.t));
    return 'arrêts de la page ' + totals.gaps + ' (' + seconds(totals.blockedMs) + ', le plus long ' + seconds(totals.maxGapMs) + '), longues tâches ' + totals.longTasks
      + (heap === null ? '' : ', mémoire JS ' + heap + ' Mo') + (marks.length ? ' ; ' + marks.join(' ; ') : '');
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  }
  // Enregistre le rapport dans un fichier et le copie ; rend { name, copied }.
  async function download() {
    await probeLight();
    const text = report();
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const name = 'rapport-fluidite-' + stamp + '.txt';
    ExportCommon.downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
    return { name, copied: await copy(text) };
  }

  // Ctrl + Alt + Maj + L : le geste qui enregistre le rapport. `code` et non `key` : sous Windows, Ctrl + Alt est AltGr et `key` peut ne pas être « l ».
  document.addEventListener('keydown', async (event) => {
    if (!(event.ctrlKey && event.altKey && event.shiftKey && event.code === 'KeyL')) return;
    event.preventDefault();
    const result = await download();
    if (typeof Dialogs !== 'undefined' && Dialogs.notice) {
      await Dialogs.notice({ title: I18n.t('perfTrace.title'), message: I18n.t(result.copied ? 'perfTrace.savedAndCopied' : 'perfTrace.saved', { name: result.name }) });
    }
  }, true);

  mark('page ouverte');
  return { mark, watch, watchGrist, opened, report, summary, download, probeLight, events: () => events.slice(), totals: () => Object.assign({}, totals), gristCalls: () => Array.from(gristCalls.entries()).map(([label, item]) => Object.assign({ label }, item)) };
})();
