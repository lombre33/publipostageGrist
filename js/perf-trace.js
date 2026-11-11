// SUIVI DU LAG, TEMPORAIRE (10/11 : de quoi mesurer le gel d'un gros import chez la personne qui l'observe, puis en lire le rapport). Il tourne sans rien changer à l'écran et se lit à la demande :
// Ctrl + Alt + Maj + L (ou `PerfTrace.download()` dans la console) enregistre un rapport texte (`rapport-fluidite-….txt`) et le copie dans le presse-papiers quand le navigateur le permet.
// À retirer une fois le gel compris : ce fichier, sa balise dans index.html, ses textes `perfTrace.*`, son groupe d'essais `perfTrace` et ses appels `PerfTrace.mark` (js/main-import.js, js/main.js, et le `trace` du
// départ du diaporama : extensions/diapositives/slide-show.js et slide-window.js).
//
// Ce qu'il garde (les 600 derniers faits, en mémoire seulement : rien n'est envoyé ni écrit ailleurs) :
//  - les ARRÊTS de la page : un battement toutes les 100 ms, un retard de 150 ms ou plus est un arrêt (marche dans tous les navigateurs, Firefox compris) ;
//  - les longues tâches et les longues images d'animation (`longtask`, `long-animation-frame` : Chromium seulement ; ces dernières disent QUEL script a pris le temps) ;
//  - les étapes que le code nomme (`PerfTrace.mark`) et la durée des fonctions de l'éditeur qui dépassent 40 ms (`PerfTrace.watch`) ;
//  - la mémoire de la page quand le navigateur la donne (Chromium : `performance.memory`), la machine et la taille du document.
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
    FrameAnim: [typeof FrameAnim !== 'undefined' ? FrameAnim : null, ['stampSlides']],
    ExternalImages: [typeof ExternalImages !== 'undefined' ? ExternalImages : null, ['confirmExport', 'blockIn', 'unblockIn']],
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

  // --- Le rapport ---
  const seconds = ms => (ms / 1000).toFixed(ms >= 10000 ? 0 : 1) + ' s';
  function describe(entry) {
    const when = String(entry.t).padStart(7) + ' ms  ';
    const heap = entry.heapMb === undefined ? '' : '  [mémoire JS ' + entry.heapMb + ' Mo]';
    const extra = Object.keys(entry).filter(k => !['t', 'kind', 'label', 'ms', 'heapMb', 'scripts', 'blockingMs'].includes(k)).map(k => k + '=' + entry[k]).join(' ');
    switch (entry.kind) {
      case 'gap': return when + 'ARRÊT de la page : ' + seconds(entry.ms);
      case 'longtask': return when + 'longue tâche : ' + entry.ms + ' ms';
      case 'frame': return when + 'longue image : ' + entry.ms + ' ms (dont ' + entry.blockingMs + ' ms bloquants)' + (entry.scripts.length ? ' par ' + entry.scripts.join(' ; ') : '');
      case 'call': return when + entry.label + ' : ' + entry.ms + ' ms';
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
  return { mark, watch, report, summary, download, events: () => events.slice(), totals: () => Object.assign({}, totals) };
})();
