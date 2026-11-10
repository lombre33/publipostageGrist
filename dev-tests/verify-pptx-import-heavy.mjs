#!/usr/bin/env node
// L'IMPORT d'un GROS fichier PowerPoint (10/11, « tout freeze, il faut avancer en fond sans bloquer la page ») : js/pptx-import.js lit le fichier par tranches de 30 ms (la page répond entre deux), js/image-io.js
// encode les images hors du fil principal, un fichier de 15 Mo ou plus voit ses images ramenées à 220 points par pouce (HEAVY_FILE_BYTES, TARGET_PPI), js/main-import.js compte les diapositives lues dans le coin
// d'état, refuse un second import lancé en route et dit la mise en place avant le dernier bloc ; js/perf-trace.js (TEMPORAIRE, à retirer avec lui) enregistre les arrêts de la page, les étapes de l'import et
// les fonctions lentes, et son rapport sort par Ctrl + Alt + Maj + L.
// Les fichiers sont fabriqués dans la page avec les briques de dev-tests/scenarios-pptx-import.js (aucun fichier binaire dans le dépôt) : des photos de 12 millions de points rognées (donc redessinées une à une) ;
// le fichier « lourd » est le même, grossi de 16 Mo d'octets qu'aucune compression ne réduit.
// Ce que les cas vérifient :
//  - la page répond pendant la lecture : le battement d'un minuteur de 10 ms ne s'arrête jamais plus de 300 ms (avant : 450 ms, dix arrêts de plus de 200 ms) ; le compteur de progression monte jusqu'au total ;
//  - un fichier léger garde la définition de ses images (comme avant) ; un fichier lourd les ramène à 220 points par pouce de leur boîte, pèse cinq à dix fois moins dans le texte, et rend la même structure et le
//    même rapport ;
//  - à la vraie souris : le coin d'état dit « Lecture du fichier PowerPoint… n / 6 » puis « Mise en place de 6 diapositives… » puis « PowerPoint importé », un clic sur « Réglages » en route ouvre la fenêtre
//    sans attendre la fin, un second fichier choisi pendant la lecture est refusé en le disant (un seul import arrive) ;
//  - le suivi du lag : un arrêt de la page est compté et daté, une fonction lente surveillée est gardée avec son nom (promesse comprise), les étapes de l'import y sont, le rapport est un texte lisible
//    (machine, mémoire, chronologie), et Ctrl + Alt + Maj + L enregistre `rapport-fluidite-….txt` et le dit dans une fenêtre, en français et en anglais.
// Lancé par run-headless.mjs (groupe Node « pptxImportHeavy », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-pptx-import-heavy.mjs
import { readFile } from 'node:fs/promises';
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';
import { clickHoverRow } from './load-lib.mjs';

const t = await start({ name: 'verify-pptx-import-heavy', port: Number(process.env.PPTX_IMPORT_HEAVY_PORT || 9101) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const SEED = seedModels();
const PLUS = '#btn-new';
const ROW = '#v2-btn-import-pptx';
const MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const SLIDES = 6;
const PICS = 3;
const PHOTO_PX = [4000, 3000];
const BOX_PT = [200, 130];

// Fabrique un fichier dans la page et le garde dans `window.__decks[name]` (un ArrayBuffer). `pad` : des Mo d'octets aléatoires de plus (un fichier « lourd »).
async function makeDeck(page, name, pad) {
  return page.evaluate(async ({ name, pad, slidesN, picsPer, photoPx, boxPt }) => {
    const F = window.PptxFixtures;
    const photo = (seed) => {
      const canvas = document.createElement('canvas');
      canvas.width = photoPx[0];
      canvas.height = photoPx[1];
      const g = canvas.getContext('2d');
      const grad = g.createLinearGradient(0, 0, photoPx[0], photoPx[1]);
      grad.addColorStop(0, `hsl(${seed * 70 % 360},70%,50%)`);
      grad.addColorStop(1, `hsl(${(seed * 70 + 120) % 360},70%,40%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, photoPx[0], photoPx[1]);
      for (let i = 0; i < 400; i++) { g.fillStyle = `hsla(${(i * 37 + seed * 50) % 360},80%,60%,0.5)`; g.fillRect((i * 97) % photoPx[0], (i * 53) % photoPx[1], 30 + (i % 7) * 20, 30 + (i % 5) * 25); }
      return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
    };
    const media = { 'photo1.jpg': photo(1), 'photo2.jpg': photo(2), 'photo3.jpg': photo(3) };
    const crop = '<a:srcRect l="5000" t="5000" r="5000" b="5000"/>';
    const slides = Array.from({ length: slidesN }, (_, s) => ({
      rels: [F.IMAGE_REL('rId2', 'photo1.jpg'), F.IMAGE_REL('rId3', 'photo2.jpg'), F.IMAGE_REL('rId4', 'photo3.jpg')],
      shapes: F.textBox(40, 20, 880, 50, F.para(F.run('Diapositive ' + (s + 1), 'sz="3200"')), { id: 2 })
        + Array.from({ length: picsPer }, (_, i) => F.pic({ id: 10 + i, x: 40 + i * 215, y: 100, w: boxPt[0], h: boxPt[1], rid: 'rId' + (2 + (i % 3)), crop })).join(''),
    }));
    let buffer = await F.pptx({ slides, media });
    if (pad) {
      await ExportCommon.ensureJsZipLoaded();
      const zip = await JSZip.loadAsync(buffer);
      const bytes = new Uint8Array(pad * 1024 * 1024);
      for (let at = 0; at < bytes.length; at += 65536) crypto.getRandomValues(bytes.subarray(at, Math.min(at + 65536, bytes.length)));
      zip.file('ppt/embeddings/pad.bin', bytes, { compression: 'STORE' });
      buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' });
    }
    window.__decks = window.__decks || {};
    window.__decks[name] = buffer;
    return buffer.byteLength;
  }, { name, pad, slidesN: SLIDES, picsPer: PICS, photoPx: PHOTO_PX, boxPt: BOX_PT });
}

// Lit le fichier gardé dans la page en comptant les arrêts du battement d'un minuteur de 10 ms ; rend ce que l'import a écrit (sans les octets d'image : leur empreinte à part) et la taille des trois premières images.
const readDeck = (page, name) => page.evaluate(async (which) => {
  const digest = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  const gaps = [];
  let last = performance.now();
  let on = true;
  const beat = () => { const now = performance.now(); gaps.push(now - last); last = now; if (on) setTimeout(beat, 10); };
  setTimeout(beat, 10);
  const progress = [];
  const started = performance.now();
  const result = await PptxImport.fromBuffer(window.__decks[which], { onProgress: p => progress.push([p.done, p.total]) });
  const ms = Math.round(performance.now() - started);
  on = false;
  const sources = result.html.match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g) || [];
  const dims = await Promise.all(sources.slice(0, 3).map(src => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve([img.naturalWidth, img.naturalHeight]); img.onerror = () => resolve(null); img.src = src; })));
  return {
    ms, maxGap: Math.round(Math.max(...gaps)), over200: gaps.filter(g => g > 200).length, progress, dims, images: sources.length, slideCount: result.slideCount, report: JSON.stringify(result.report),
    htmlMb: Math.round(result.html.length / 104857.6) / 10, shape: await digest(result.html.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, 'DATA')),
  };
}, name);

const statusOf = page => page.evaluate(() => document.getElementById('status-msg').textContent);
const dialogOf = page => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  const shown = !!ov && getComputedStyle(ov).display !== 'none';
  const title = ov && ov.querySelector('#pp-dialog-title');
  const message = ov && ov.querySelector('#pp-dialog-message');
  return { shown, title: title ? title.textContent : '', message: message ? message.textContent : '' };
});

async function run(lang) {
  const tag = `[${lang}] `;
  console.log(`\n=== Import d'un gros PowerPoint, ${WIDTH}x${HEIGHT}, ${lang === 'fr' ? 'français' : 'anglais'} ===`);
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme: 'light' });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.addScriptTag({ url: '/dev-tests/scenarios-pptx-import.js' });
  await page.waitForFunction(sel => { const el = document.querySelector(sel); return !!el && el.getAttribute('aria-disabled') === 'false'; }, ROW, { timeout: 20000 });
  if (lang === 'en') { await shortcutCase(page, tag, lang); return; }
  await page.evaluate(() => ExportEngines.ensure('pptxImport'));

  // 1) Un fichier léger : la page respire pendant la lecture, la progression monte jusqu'au total, les images gardent leur définition.
  const lightBytes = await makeDeck(page, 'light', 0);
  check(tag + 'le fichier léger pèse moins de 15 Mo (il est lu comme avant)', lightBytes < 15 * 1024 * 1024, lightBytes);
  const light = await readDeck(page, 'light');
  check(tag + `pendant la lecture de ${SLIDES} diapositives de photos de 12 millions de points, la page ne s'arrête jamais plus de 300 ms (avant : 450 ms et dix arrêts de plus de 200 ms)`, light.maxGap <= 300 && light.over200 <= 1, { maxGap: light.maxGap, over200: light.over200, ms: light.ms });
  check(tag + `la progression monte de 0 à ${SLIDES} sur ${SLIDES}, une fois par diapositive au moins, sans jamais reculer`,
    light.progress.length >= SLIDES && light.progress.every(([done, total], i) => total === SLIDES && (i === 0 || done >= light.progress[i - 1][0])) && light.progress[light.progress.length - 1][0] === SLIDES, light.progress);
  check(tag + 'un fichier léger garde la définition de ses images : 4 000 points de large et plus, comme avant', light.dims.length === 3 && light.dims.every(d => d && d[0] >= 4000), light.dims);
  check(tag + `les ${SLIDES} diapositives sont là, et le rapport ne dit rien d'une image perdue`, light.slideCount === SLIDES && !/"images"/.test(light.report), { slideCount: light.slideCount, report: light.report });

  // 2) Le même fichier, lourd : les images tiennent dans 220 points par pouce de leur boîte, le texte pèse bien moins, la structure et le rapport sont les mêmes.
  const heavyBytes = await makeDeck(page, 'heavy', 16);
  check(tag + 'le fichier lourd pèse 15 Mo ou plus', heavyBytes >= 15 * 1024 * 1024, heavyBytes);
  const heavy = await readDeck(page, 'heavy');
  const fitW = Math.ceil(BOX_PT[0] * 220 / 72);
  const fitH = Math.ceil(BOX_PT[1] * 220 / 72);
  check(tag + `un fichier lourd ramène chaque image à 220 points par pouce de sa boîte (${BOX_PT[0]} x ${BOX_PT[1]} points : ${fitW} x ${fitH} au plus, sans perdre plus d'un quart)`,
    heavy.dims.length === 3 && heavy.dims.every(d => d && d[0] <= fitW + 1 && d[1] <= fitH + 1 && d[0] >= fitW * 0.75), heavy.dims);
  check(tag + 'le texte du fichier lourd pèse au moins cinq fois moins que celui du fichier léger', heavy.htmlMb * 5 <= light.htmlMb, { heavy: heavy.htmlMb, light: light.htmlMb });
  check(tag + 'la structure et le rapport sont ceux du fichier léger (mêmes cadres, mêmes images, même rapport) : seules les images sont plus petites', heavy.shape === light.shape && heavy.images === light.images && heavy.report === light.report && heavy.slideCount === SLIDES, { shape: [heavy.shape, light.shape], images: [heavy.images, light.images], report: [heavy.report, light.report] });
  check(tag + 'le fichier lourd est lu plus vite que le léger (moins d\'octets à encoder) et la page y respire aussi', heavy.ms < light.ms && heavy.maxGap <= 300, { heavy: [heavy.ms, heavy.maxGap], light: [light.ms, light.maxGap] });

  // 3) À la vraie souris : le fichier léger choisi par le vrai sélecteur ; la page répond en route, un second fichier est refusé, le coin d'état dit les étapes.
  const raw = await page.evaluate(() => { const bytes = new Uint8Array(window.__decks.light); let text = ''; for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode.apply(null, bytes.subarray(at, at + 8192)); return btoa(text); });
  const file = { name: 'photos.pptx', mimeType: MIME, buffer: Buffer.from(raw, 'base64') };
  await page.evaluate(() => {
    window.__status = [];
    const el = document.getElementById('status-msg');
    new MutationObserver(() => window.__status.push([Math.round(performance.now()), el.textContent])).observe(el, { childList: true, characterData: true, subtree: true });
  });
  const pick = async (what) => {
    const waiting = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    await page.evaluate(() => 0);
    await sleep(250);
    await clickHoverRow(page, PLUS, ROW);
    const chooser = await waiting;
    if (chooser) await chooser.setFiles(what);
    return !!chooser;
  };
  check(tag + 'le vrai sélecteur s\'ouvre pour le premier fichier', await pick(file));
  const during = Date.now();
  await page.waitForFunction(() => window.__status.some(([, text]) => /^(Lecture du fichier PowerPoint… \d|Reading the PowerPoint file… \d)/.test(text)), null, { timeout: 15000 }).catch(() => {});
  // Un clic sur « Réglages » pendant la lecture : la fenêtre s'ouvre sans attendre la fin de l'import.
  const settings = await page.evaluate(() => { const r = document.getElementById('v2-btn-settings').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const clickedAt = Date.now();
  await page.mouse.move(settings.x - 6, settings.y, { steps: 2 });
  await page.mouse.click(settings.x, settings.y);
  const opened = await page.waitForFunction(() => { const el = document.getElementById('settings-modal'); return !!el && getComputedStyle(el).display !== 'none'; }, null, { timeout: 3000 }).then(() => true, () => false);
  const openedIn = Date.now() - clickedAt;
  const importing = await page.evaluate(() => !/PowerPoint (importé|imported)/.test(document.getElementById('status-msg').textContent));
  check(tag + 'un clic sur « Réglages » en pleine lecture ouvre la fenêtre en moins de 1,5 s, alors que l\'import n\'est pas fini', opened && openedIn < 1500 && importing, { opened, openedIn, importing });
  await page.keyboard.press('Escape');
  await sleep(300);
  // Un second fichier choisi en route : refusé, dit dans le coin d'état ; un seul import arrive.
  const second = await pick(file);
  await sleep(500);
  const busyText = await page.evaluate(() => window.__status.map(([, text]) => text).filter(text => /déjà en cours|already running/.test(text)));
  check(tag + 'un second fichier choisi pendant la lecture est refusé : « Un import PowerPoint est déjà en cours »', second && busyText.length >= 1, { second, busyText });
  await page.waitForFunction(() => /PowerPoint importé|PowerPoint imported/.test(document.getElementById('status-msg').textContent), null, { timeout: 60000 });
  await sleep(500);
  const log = await page.evaluate(() => window.__status.map(([, text]) => text));
  const firstRead = log.findIndex(text => /^Lecture du fichier PowerPoint… \d+ \/ 6$/.test(text));
  const placing = log.findIndex(text => /^Mise en place de 6 diapositives…$/.test(text));
  const imported = log.findIndex(text => /^PowerPoint importé : 6 diapositives\./.test(text));
  check(tag + 'le coin d\'état dit les étapes dans l\'ordre : « Lecture du fichier PowerPoint… n / 6 », « Mise en place de 6 diapositives… », puis « PowerPoint importé : 6 diapositives. »', firstRead >= 0 && placing > firstRead && imported > placing, { firstRead, placing, imported, log: log.slice(0, 12) });
  const state = await page.evaluate(() => ({ slides: document.querySelectorAll('.pp-slide-item').length, marks: PerfTrace.events().filter(e => e.kind === 'mark' && /^import PowerPoint/.test(e.label)).map(e => e.label) }));
  check(tag + 'un seul import est arrivé : 6 miniatures, et le suivi n\'a vu qu\'une lecture, une mise en place', state.slides === SLIDES && state.marks.filter(m => m === 'import PowerPoint : lecture').length === 1 && state.marks.filter(m => m === 'import PowerPoint : en place').length === 1, state);
  check(tag + 'après l\'import, un nouvel import est de nouveau possible (le garde est levé)', await page.evaluate(() => document.getElementById('v2-btn-import-pptx').getAttribute('aria-disabled') === 'false'));
  void during;

  // 4) Le suivi du lag.
  await traceCases(page, tag);
  await shortcutCase(page, tag, lang);
}

async function traceCases(page, tag) {
  const marks = await page.evaluate(() => PerfTrace.events().filter(e => e.kind === 'mark' && /^import PowerPoint/.test(e.label)));
  check(tag + 'le suivi a daté les quatre étapes de l\'import, dans l\'ordre, avec les diapositives lues',
    marks.map(m => m.label).join('|') === 'import PowerPoint : lecture|import PowerPoint : lu|import PowerPoint : mise en place|import PowerPoint : en place' && marks[1].diapositives === SLIDES && marks.every((m, i) => i === 0 || m.t >= marks[i - 1].t), marks);
  const gap = await page.evaluate(async () => {
    const before = PerfTrace.totals();
    await new Promise(resolve => setTimeout(() => { const end = performance.now() + 700; while (performance.now() < end) { /* la page est prise */ } resolve(); }, 50));
    await new Promise(resolve => setTimeout(resolve, 400));
    const after = PerfTrace.totals();
    return { gaps: after.gaps - before.gaps, maxGapMs: after.maxGapMs, blocked: after.blockedMs - before.blockedMs };
  });
  check(tag + 'une page prise 700 ms est comptée comme UN arrêt de 500 ms ou plus', gap.gaps === 1 && gap.maxGapMs >= 500 && gap.blocked >= 500, gap);
  const calm = await page.evaluate(async () => {
    const before = PerfTrace.totals().gaps;
    await new Promise(resolve => setTimeout(resolve, 600));
    return PerfTrace.totals().gaps - before;
  });
  check(tag + 'une page au repos ne compte aucun arrêt', calm === 0, calm);
  const watched = await page.evaluate(async () => {
    const busy = (ms) => { const end = performance.now() + ms; while (performance.now() < end) { /* attente active */ } };
    const tool = { slow() { busy(80); return 'a'; }, quick() { return 'b'; }, async later() { await new Promise(resolve => setTimeout(resolve, 70)); return 'c'; }, boom() { busy(60); throw new Error('raté'); } };
    ['slow', 'quick', 'later', 'boom'].forEach(name => PerfTrace.watch(tool, name, 'Essai.' + name));
    const twice = PerfTrace.watch(tool, 'slow', 'Essai.slow');
    const results = [tool.slow(), tool.quick(), await tool.later()];
    let thrown = null;
    try { tool.boom(); } catch (e) { thrown = e.message; }
    const calls = PerfTrace.events().filter(e => e.kind === 'call' && /^Essai\./.test(e.label)).map(e => [e.label, e.ms]);
    return { results, thrown, twice, calls, editorWrapped: !!Editor.setHTML.__perfWatched };
  });
  const got = Object.fromEntries(watched.calls.map(([label, ms]) => [label, ms]));
  check(tag + 'une fonction surveillée rend son résultat, relance son erreur, et la durée de celles qui dépassent 40 ms est gardée sous son nom (une promesse est suivie jusqu\'à sa fin)',
    watched.results.join('') === 'abc' && watched.thrown === 'raté' && got['Essai.slow'] >= 70 && got['Essai.later'] >= 60 && got['Essai.boom'] >= 50 && !('Essai.quick' in got), watched);
  check(tag + 'une fonction n\'est jamais surveillée deux fois, et les fonctions d\'Editor le sont (Editor.setHTML)', watched.twice === false && watched.editorWrapped, watched);
  const report = await page.evaluate(() => PerfTrace.report());
  check(tag + 'le rapport est un texte lisible : titre, navigateur, machine (cœurs, mémoire), document, arrêts comptés, chronologie avec les étapes de l\'import et l\'arrêt de 700 ms',
    /^Rapport de fluidité de Publipostage\+/.test(report) && /Navigateur : /.test(report) && /Machine : \d+ cœurs/.test(report) && /Mémoire JS maintenant : /.test(report) && /Chargement de la page : DOMContentLoaded \d+ ms, page chargée \d+ ms, \d+ fichiers lus/.test(report) && /Document : éléments de la page \d+/.test(report) && /Arrêts de la page .* : [1-9]/.test(report)
    && /Chronologie/.test(report) && /import PowerPoint : en place/.test(report) && /ARRÊT de la page : 0\.[5-9] s|ARRÊT de la page : 1\.\d s/.test(report) && /Essai\.slow : \d+ ms/.test(report), report.slice(0, 900));
  const summary = await page.evaluate(() => PerfTrace.summary('import PowerPoint'));
  check(tag + 'le résumé d\'une ligne (à coller dans un autre rapport) donne les arrêts, la mémoire et les étapes de l\'import', /^arrêts de la page \d+ \(.*\), longues tâches \d+/.test(summary) && /import PowerPoint : lecture à /.test(summary) && /import PowerPoint : en place à /.test(summary) && !/\n/.test(summary), summary);
  const longRun = await page.evaluate(() => { for (let i = 0; i < 900; i++) PerfTrace.mark('bruit ' + i); return PerfTrace.events().length; });
  check(tag + 'le suivi garde au plus 600 faits (les plus récents), jamais plus', longRun <= 600, longRun);
}

// Ctrl + Alt + Maj + L, au vrai clavier : le rapport est enregistré dans un fichier daté, la fenêtre le dit (copié ou non), Échap la ferme.
async function shortcutCase(page, tag, lang) {
  const waitingDownload = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.keyboard.press('Control+Alt+Shift+KeyL');
  const download = await waitingDownload;
  check(tag + 'Ctrl + Alt + Maj + L enregistre un fichier « rapport-fluidite-AAAAMMJJHHMM.txt »', !!download && /^rapport-fluidite-\d{12}\.txt$/.test(download.suggestedFilename()), download && download.suggestedFilename());
  if (download) {
    const text = await readFile(await download.path(), 'utf8');
    check(tag + 'le fichier est le rapport (titre, chronologie)', /^Rapport de fluidité de Publipostage\+/.test(text) && /Chronologie/.test(text), text.slice(0, 120));
  }
  await page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 5000 }).catch(() => {});
  const dialog = await dialogOf(page);
  const T = lang === 'fr'
    ? { title: 'Rapport de fluidité', saved: /Le rapport est (copié dans le presse-papiers et enregistré|enregistré) dans « rapport-fluidite-\d{12}\.txt »/ }
    : { title: 'Smoothness report', saved: /The report is (copied to the clipboard and saved|saved) as “rapport-fluidite-\d{12}\.txt”/ };
  check(tag + `la fenêtre « ${T.title} » dit où est le rapport et s'il est copié`, dialog.shown && dialog.title === T.title && T.saved.test(dialog.message), dialog);
  await page.keyboard.press('Escape');
  await sleep(400);
  check(tag + 'Échap ferme la fenêtre', !(await dialogOf(page)).shown);
  check(tag + 'une autre combinaison (Ctrl + Alt + L sans Maj) n\'enregistre rien', await (async () => {
    const other = page.waitForEvent('download', { timeout: 1200 }).then(() => true, () => false);
    await page.keyboard.press('Control+Alt+KeyL');
    return !(await other);
  })());
  void HEIGHT;
}

await run('fr');
await run('en');
await t.finish();
