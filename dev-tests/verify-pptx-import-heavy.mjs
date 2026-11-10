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

  // 1b) Le résultat d'un import ne retient pas la lecture : gardé (pendant la mise en place, pendant que la personne lit le rapport), il n'ajoute presque aucun document au navigateur. Un accesseur écrit dans
  // `fromBuffer` gardait en vie le paquet dézippé, les documents XML de chaque diapositive et le cache des images (450 documents et 110 000 nœuds pour 150 diapositives).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const documentsNow = async () => { await cdp.send('HeapProfiler.collectGarbage'); await sleep(300); await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Memory.getDOMCounters')).documents; };
  const docsBefore = await documentsNow();
  await page.evaluate(async () => { window.__held = await PptxImport.fromBuffer(window.__decks.light); });
  const docsHeld = await documentsNow();
  await page.evaluate(() => { window.__held = null; });
  check(tag + `le résultat d'un import gardé ne retient pas la lecture (paquet, documents XML, cache d'images) : au plus 5 documents de plus après ramasse-miettes (${docsBefore} avant, ${docsHeld} avec le résultat)`, docsHeld - docsBefore <= 5, { docsBefore, docsHeld });

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
  const during = Date.now();
  // Le voile suit TOUT l'import : ses textes successifs sont gardés pour juger de ce que la personne a vu.
  await page.evaluate(() => {
    window.__veilTexts = [];
    const note = () => {
      const el = document.getElementById('pp-placing-modal');
      const line = el && el.querySelector('.pp-placing-line');
      if (el && line && getComputedStyle(el).display !== 'none' && line.textContent && window.__veilTexts[window.__veilTexts.length - 1] !== line.textContent) window.__veilTexts.push(line.textContent);
    };
    new MutationObserver(note).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style'] });
  });
  const veilState = () => page.evaluate(() => {
    const el = document.getElementById('pp-placing-modal');
    if (!el || getComputedStyle(el).display === 'none') return { shown: false };
    const cancel = el.querySelector('.pp-modal-actions button');
    const r = cancel ? cancel.getBoundingClientRect() : null;
    return { shown: true, line: el.querySelector('.pp-placing-line').textContent, percent: Number(el.querySelector('.pp-placing-bar').getAttribute('aria-valuenow')), cancelShown: !!r && r.width > 0 && getComputedStyle(cancel.closest('.pp-modal-actions')).display !== 'none', cancelLabel: cancel ? cancel.textContent : '' };
  });
  await page.evaluate(() => { window.__textBefore = Editor.getHTML(); window.__idBefore = Templates.getCurrentId(); });

  // 3a) Le premier fichier est ANNULÉ en route : le voile est là dès la lecture avec « Annuler l'import », il couvre le panneau (un clic sur « Réglages » tombe sur lui), l'annulation arrête la lecture en moins de
  // 2,5 s et rien n'a changé.
  check(tag + 'le vrai sélecteur s\'ouvre pour le premier fichier', await pick(file));
  const veilUp = await page.waitForFunction(() => { const el = document.getElementById('pp-placing-modal'); return !!el && getComputedStyle(el).display !== 'none' && /^(Lecture du fichier PowerPoint… \d|Reading the PowerPoint file… \d)/.test(el.querySelector('.pp-placing-line').textContent); }, null, { timeout: 25000 }).then(() => true, () => false);
  const reading = await veilState();
  check(tag + 'pendant la lecture le voile est là : « Lecture du fichier PowerPoint… n / 6 », une barre qui n\'a pas dépassé la part de la lecture (65 %), « Annuler l\'import »', veilUp && reading.shown && /^Lecture du fichier PowerPoint… \d \/ 6$/.test(reading.line) && reading.percent <= 65 && reading.cancelShown && reading.cancelLabel === 'Annuler l’import', reading);
  const settings = await page.evaluate(() => { const r = document.getElementById('v2-btn-settings').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(settings.x - 6, settings.y, { steps: 2 });
  await page.mouse.click(settings.x, settings.y);
  await sleep(500);
  const settingsOpened = await page.evaluate(() => { const el = document.getElementById('settings-modal'); return !!el && getComputedStyle(el).display !== 'none'; });
  check(tag + 'le voile couvre le panneau pendant la lecture : un clic sur « Réglages » n\'ouvre rien', settingsOpened === false, { settingsOpened });
  const cancelAt = Date.now();
  await page.locator('#pp-placing-modal .pp-modal-actions button').click();
  const cancelled = await page.waitForFunction(() => /Import annulé|Import canceled/.test(document.getElementById('status-msg').textContent), null, { timeout: 8000 }).then(() => true, () => false);
  const cancelMs = Date.now() - cancelAt;
  await sleep(300);
  const afterCancel = await page.evaluate(() => ({ same: Editor.getHTML() === window.__textBefore, id: Templates.getCurrentId(), idBefore: window.__idBefore, veil: (() => { const el = document.getElementById('pp-placing-modal'); return !!el && getComputedStyle(el).display !== 'none'; })(), marks: PerfTrace.events().filter(e => e.kind === 'mark' && /^import PowerPoint/.test(e.label)).map(e => e.label), status: document.getElementById('status-msg').textContent }));
  check(tag + 'Annuler l\'import arrête la lecture en moins de 2,5 s : « Import annulé : rien n\'a changé. », le voile est retiré, le texte est celui d\'avant, aucune mise en place', cancelled && cancelMs < 2500 && !afterCancel.veil && afterCancel.same && afterCancel.id === afterCancel.idBefore && afterCancel.marks.length === 1 && afterCancel.marks[0] === 'import PowerPoint : lecture' && /rien n’a changé/.test(afterCancel.status), { cancelled, cancelMs, afterCancel });

  // 3b) Le même fichier, mené jusqu'au bout : le coin d'état et le voile disent les étapes, un second import lancé en route est refusé.
  await page.evaluate(() => { window.__status.length = 0; window.__veilTexts.length = 0; });
  check(tag + 'le vrai sélecteur s\'ouvre de nouveau : l\'import annulé a levé le garde', await pick(file));
  await page.waitForFunction(() => window.__status.some(([, text]) => /^(Lecture du fichier PowerPoint… \d|Reading the PowerPoint file… \d)/.test(text)), null, { timeout: 15000 }).catch(() => {});
  // Un second fichier lancé en route (sans passer par le menu, que le voile couvre) : refusé, dit dans le coin d'état ; un seul import arrive.
  const secondStarted = await page.evaluate(() => {
    const original = GridXlsxImport.chooseFile;
    GridXlsxImport.chooseFile = (callback) => { callback(new File([window.__decks.light], 'second.pptx')); };
    try { document.getElementById('v2-btn-import-pptx').click(); } finally { GridXlsxImport.chooseFile = original; }
    return true;
  });
  await sleep(500);
  const busyText = await page.evaluate(() => window.__status.map(([, text]) => text).filter(text => /déjà en cours|already running/.test(text)));
  check(tag + 'un second fichier lancé pendant la lecture est refusé : « Un import PowerPoint est déjà en cours »', secondStarted && busyText.length >= 1, { secondStarted, busyText });
  await page.waitForFunction(() => /PowerPoint importé|PowerPoint imported/.test(document.getElementById('status-msg').textContent), null, { timeout: 60000 });
  await sleep(500);
  const log = await page.evaluate(() => window.__status.map(([, text]) => text));
  const firstRead = log.findIndex(text => /^Lecture du fichier PowerPoint… \d+ \/ 6$/.test(text));
  const placing = log.findIndex(text => /^Mise en place des diapositives… 0 \/ 6$/.test(text));
  const placed = log.findIndex(text => /^Mise en place des diapositives… 6 \/ 6$/.test(text));
  const imported = log.findIndex(text => /^PowerPoint importé : 6 diapositives\./.test(text));
  check(tag + 'le coin d\'état dit les étapes dans l\'ordre : « Lecture du fichier PowerPoint… n / 6 », « Mise en place des diapositives… 0 / 6 » jusqu\'à « 6 / 6 », puis « PowerPoint importé : 6 diapositives. »', firstRead >= 0 && placing > firstRead && placed > placing && imported > placed, { firstRead, placing, placed, imported, log: log.slice(0, 16) });
  const veilTexts = await page.evaluate(() => window.__veilTexts.slice());
  check(tag + 'le voile a dit la lecture au fil des diapositives (au moins trois textes « Lecture du fichier PowerPoint… n / 6 » différents) puis, une fois fini, il est retiré', veilTexts.filter(text => /^Lecture du fichier PowerPoint… \d \/ 6$/.test(text)).length >= 3 && !(await veilState()).shown, veilTexts);
  const state = await page.evaluate(() => ({ slides: document.querySelectorAll('.pp-slide-item').length, marks: PerfTrace.events().filter(e => e.kind === 'mark' && /^import PowerPoint/.test(e.label)).map(e => e.label) }));
  check(tag + 'un seul import est arrivé : 6 miniatures, et le suivi n\'a vu que deux lectures (l\'annulée et celle-ci), une mise en place', state.slides === SLIDES && state.marks.filter(m => m === 'import PowerPoint : lecture').length === 2 && state.marks.filter(m => m === 'import PowerPoint : en place').length === 1, state);
  check(tag + 'après l\'import, un nouvel import est de nouveau possible (le garde est levé)', await page.evaluate(() => document.getElementById('v2-btn-import-pptx').getAttribute('aria-disabled') === 'false'));
  void during;

  // 3b) Un fichier ordinaire importé n'est pas enregistré tout seul : sans identifiant ni nom, la personne nomme puis enregistre (comme avant).
  check(tag + 'un fichier ordinaire (moins de 15 Mo) importé reste « à nommer » : ni identifiant ni nom, et le coin d\'état le dit', await page.evaluate(() => Templates.getCurrentId() == null && document.getElementById('template-name').value === '' && /Nommez le modèle puis enregistrez-le/.test(document.getElementById('status-msg').textContent)));
  await placingCases(page, tag);

  // 3c) Un gros fichier (15 Mo ou plus) est enregistré dans Grist dès que sa mise en place est finie, sous le nom du fichier (choix d'Antoine du 10/11, « enregistrer le modèle au fil de l'import »).
  const rawHeavy = await page.evaluate(() => { const bytes = new Uint8Array(window.__decks.heavy); let text = ''; for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode.apply(null, bytes.subarray(at, at + 8192)); return btoa(text); });
  await page.evaluate(() => { window.__status.length = 0; });
  check(tag + 'le vrai sélecteur s\'ouvre pour le gros fichier', await pick({ name: 'Ma grosse présentation.pptx', mimeType: MIME, buffer: Buffer.from(rawHeavy, 'base64') }));
  // Le texte d'avant n'est pas enregistré : la question « Enregistrer / Ne pas enregistrer / Annuler » vient APRÈS la lecture, avant la mise en place (le voile n'est pas encore là) ; « Ne pas enregistrer » la lève.
  const asked = await page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 90000 }).then(() => true, () => false);
  const veilDuringQuestion = await page.evaluate(() => { const el = document.getElementById('pp-placing-modal'); return !!el && getComputedStyle(el).display !== 'none'; });
  check(tag + 'avec un texte non enregistré à l\'écran, la question de départ est posée une fois le gros fichier lu, sans voile par-dessus', asked && !veilDuringQuestion, { asked, veilDuringQuestion });
  if (asked) await page.locator('#pp-dialog-modal .pp-modal-actions button', { hasText: 'Ne pas enregistrer' }).click();
  await page.waitForFunction(() => window.__status.some(([, text]) => /enregistré sous/.test(text)), null, { timeout: 120000 }).catch(() => {});
  await sleep(500);
  const kept = await page.evaluate(() => {
    const id = Templates.getCurrentId();
    const tpl = id == null ? null : Templates.byId(id);
    return { id, nom: tpl && tpl.nom, type: tpl && tpl.typeModele, breaks: tpl ? (String(tpl.contenu).match(/page-break-marker/g) || []).length : -1, title: document.getElementById('template-name').value, selected: document.getElementById('template-select').value, log: window.__status.map(([, text]) => text).filter(text => /^Enregistrement|enregistré|Enregistré/.test(text)) };
  });
  check(tag + 'un gros fichier importé est enregistré dans Grist sous son nom : un identifiant, « Ma grosse présentation », type présentation, six diapositives dans le contenu écrit', kept.id != null && kept.nom === 'Ma grosse présentation' && kept.type === 'presentation' && kept.breaks === SLIDES - 1 && kept.title === 'Ma grosse présentation' && String(kept.selected) === String(kept.id), kept);
  check(tag + 'le coin d\'état le dit : « PowerPoint importé : 6 diapositives, enregistré sous « Ma grosse présentation ». »', kept.log.some(text => text === 'PowerPoint importé : 6 diapositives, enregistré sous « Ma grosse présentation ».'), kept.log);
  const noVeil = await page.evaluate(() => !document.getElementById('pp-placing-modal') || getComputedStyle(document.getElementById('pp-placing-modal')).display === 'none');
  check(tag + 'le voile est retiré quand l\'import est fini : le texte se tape de nouveau', noVeil);

  // 4) Le suivi du lag.
  await traceCases(page, tag);
  await shortcutCase(page, tag, lang);
}

// La mise en place par morceaux (js/import-placing.js, 10/11, « ça freeze sur Mise en place de 57 diapositives : verrouiller l'éditeur sans figer, avec l'avancement ») : le texte posé par morceaux est celui d'un
// seul bloc, la page respire entre deux, la bande ne se relit qu'à la fin, une diapositive refusée est remplacée par une page vide, le voile (après une demi-seconde) verrouille le panneau.
async function placingCases(page, tag) {
  const COPIES = 20;
  const r = await page.evaluate(async ({ copies }) => {
    const PB = ImportPlacing.PAGE_BREAK;
    const imported = await PptxImport.fromBuffer(window.__decks.heavy);
    const lazyOk = imported.html === imported.slideTexts.join(PB) && imported.slideTexts.length === imported.slideCount;
    const many = [];
    for (let k = 0; k < copies; k++) imported.slideTexts.forEach(text => many.push(text));
    const beating = () => {
      let last = performance.now();
      let max = 0;
      let on = true;
      const beat = () => { const now = performance.now(); max = Math.max(max, now - last); last = now; if (on) setTimeout(beat, 10); };
      setTimeout(beat, 10);
      return { stop: () => { on = false; return Math.round(max); } };
    };
    const tick = ms => new Promise(resolve => setTimeout(resolve, ms));
    const stripCount = () => document.querySelectorAll('.pp-slide-item').length;
    const breaks = html => (html.match(/page-break-marker/g) || []).length;
    // D'un seul bloc (ce que faisait l'import).
    let hb = beating();
    Editor.setHTML(many.join(PB));
    await tick(60);
    const oneShotGap = hb.stop();
    await tick(300);
    const reference = Editor.getHTML();
    // Par morceaux : trois diapositives par le chemin habituel, les autres à la suite.
    Editor.setHTML(many.slice(0, 3).join(PB));
    await tick(300);
    const rest = many.slice(3);
    const stripBefore = stripCount();
    hb = beating();
    let mid = null;
    const failed = await ImportPlacing.appendSlides(rest, (n) => { if (n === 60) mid = stripCount(); });
    await tick(60);
    const chunkedGap = hb.stop();
    await tick(300);
    const chunked = Editor.getHTML();
    const sameText = chunked === reference;
    let firstDiff = -1;
    if (!sameText) { const n = Math.min(chunked.length, reference.length); firstDiff = 0; while (firstDiff < n && chunked[firstDiff] === reference[firstDiff]) firstDiff++; }
    const out = {
      lazyOk, oneShotGap, chunkedGap, sameText, firstDiff, refLen: reference.length, chunkedLen: chunked.length, refBreaks: breaks(reference), chunkedBreaks: breaks(chunked),
      consumed: rest.every(text => text === ''), failed, stripBefore, mid, stripAfter: stripCount(), total: many.length,
    };
    // Une diapositive refusée par l'éditeur : remplacée par une page vide, comptée, les rangs ne bougent pas.
    Editor.setHTML(many.slice(0, 3).join(PB));
    await tick(200);
    const original = Editor.appendHTML;
    let calls = 0;
    Editor.appendHTML = function () { calls += 1; if (calls === 2) throw new Error('refusée'); return original.apply(this, arguments); };
    const warn = console.warn;
    console.warn = () => {};
    let failedOne = -1;
    try { failedOne = await ImportPlacing.appendSlides(many.slice(3, 6), () => {}); } finally { Editor.appendHTML = original; console.warn = warn; }
    await tick(200);
    out.failedOne = failedOne;
    out.afterFailBreaks = breaks(Editor.getHTML());
    // Le texte préparé d'avance (Editor.prepareHTML) : le même que celui de getHTML, rendu par tranches ; jamais servi pour un document qui a changé depuis.
    const plain = Editor.getHTML();
    let pauses = 0;
    await Editor.prepareHTML(() => { pauses += 1; return new Promise(resolve => setTimeout(resolve, 0)); });
    const prepared = Editor.getHTML();
    out.prepSame = prepared === plain;
    out.prepPauses = pauses;
    await Editor.prepareHTML(() => Promise.resolve());
    EditorCore.getEditor().chain().focus('end').insertContent('§§prépare§§').run();
    const after = Editor.getHTML();
    out.prepStale = after !== plain && after.indexOf('§§prépare§§') >= 0;
    return out;
  }, { copies: COPIES });
  check(tag + 'les textes de l\'import sont donnés diapositive par diapositive (`slideTexts`), et `html` est leur réunion faite à la demande', r.lazyOk, r);
  check(tag + `${COPIES * SLIDES} diapositives posées par morceaux donnent EXACTEMENT le texte posé d'un seul bloc (même longueur, mêmes ${r.refBreaks} sauts de page)`, r.sameText && r.refBreaks === COPIES * SLIDES - 1 && r.chunkedBreaks === r.refBreaks, { sameText: r.sameText, firstDiff: r.firstDiff, refLen: r.refLen, chunkedLen: r.chunkedLen, refBreaks: r.refBreaks, chunkedBreaks: r.chunkedBreaks });
  check(tag + 'les textes posés sont libérés au fur et à mesure (la liste est vide à la fin), et aucune diapositive n\'est perdue', r.consumed && r.failed === 0, { consumed: r.consumed, failed: r.failed });
  check(tag + 'la bande des diapositives est tenue pendant la pose (même nombre de miniatures à la soixantième qu\'au début) puis relue une fois à la fin (toutes les diapositives)', r.stripBefore === 3 && r.mid === r.stripBefore && r.stripAfter === r.total, { stripBefore: r.stripBefore, mid: r.mid, stripAfter: r.stripAfter, total: r.total });
  check(tag + `pendant la pose de ${COPIES * SLIDES} diapositives par morceaux la page ne s'arrête jamais plus de 400 ms, et moins longtemps que pour la pose d'un seul bloc`, r.chunkedGap <= 400 && r.chunkedGap < r.oneShotGap, { chunkedGap: r.chunkedGap, oneShotGap: r.oneShotGap });
  check(tag + 'une diapositive que l\'éditeur refuse est remplacée par une page vide et comptée : six diapositives restent six', r.failedOne === 1 && r.afterFailBreaks === 5, { failedOne: r.failedOne, afterFailBreaks: r.afterFailBreaks });
  check(tag + 'le texte préparé d\'avance par tranches (`Editor.prepareHTML`, une pause par bloc) est exactement celui de `getHTML`, et il n\'est jamais servi pour un document qui a changé depuis', r.prepSame && r.prepPauses >= 6 && r.prepStale, { prepSame: r.prepSame, prepPauses: r.prepPauses, prepStale: r.prepStale });
  await lockCases(page, tag);
  await veilCases(page, tag);
}

// Le texte MASQUÉ pendant la pose d'un très gros fichier (js/import-placing.js, LOCK_AFTER_FRAMES, 10/11 : 120 diapositives de schémas posées en 14 s au lieu de 26 quand le voile cache le texte) : seulement quand le voile
// est à l'écran ET que 2 500 cadres sont posés ; jamais pour un fichier ordinaire ; toujours remontré à la fin, même quand la pose échoue ; et les mesures prises pendant le masquage sont celles du texte montré (le
// point rouge d'une diapositive dont un cadre sort de la page tombe sur la même diapositive).
async function lockCases(page, tag) {
  const r = await page.evaluate(async () => {
    const tick = ms => new Promise(resolve => setTimeout(resolve, ms));
    const PB = ImportPlacing.PAGE_BREAK;
    const hiddenNow = () => EditorCore.getEditor().view.dom.style.contentVisibility === 'hidden';
    // 40 diapositives de 80 petits cadres (3 200 cadres) ; la septième a un cadre bien plus haut que la page.
    const slide = (k, tall) => Array.from({ length: 80 }, (_, j) => FreeFrame.html({ x: 20 + (j % 10) * 55, y: 20 + Math.floor(j / 10) * 40, w: 50, h: 30 }, '<p>' + k + '-' + j + '</p>')).join('')
      + (tall ? FreeFrame.html({ x: 10, y: 10, w: 100, h: 3000 }, '<p>trop haut</p>') : '');
    const deck = () => Array.from({ length: 40 }, (_, k) => slide(k, k === 6));
    const dots = () => Array.from(document.querySelectorAll('.pp-slide-item')).map((el, i) => { const d = el.querySelector('.pp-slide-overflow'); return d && !d.hidden ? i : -1; }).filter(i => i >= 0);
    const out = {};
    // 1. Voile à l'écran : masqué une fois 2 500 cadres posés (diapositive 32 sur 80 cadres), jamais avant ; remontré à la fin.
    Editor.setHTML(deck().slice(0, 3).join(PB));
    await tick(200);
    let firstHidden = -1;
    let hiddenWhileVeil = 0;
    await ImportPlacing.appendSlides(deck().slice(3), (n) => { if (hiddenNow()) { hiddenWhileVeil += 1; if (firstHidden < 0) firstHidden = n; } }, { covered: () => true });
    await tick(500);
    out.firstHidden = firstHidden; out.hiddenWhileVeil = hiddenWhileVeil; out.hiddenAfter = hiddenNow(); out.styleAfter = EditorCore.getEditor().view.dom.style.contentVisibility;
    out.dotsLocked = dots();
    // 2. Sans voile (covered absent) : jamais masqué, mêmes points rouges.
    Editor.setHTML(deck().slice(0, 3).join(PB));
    await tick(200);
    let hiddenNoVeil = 0;
    await ImportPlacing.appendSlides(deck().slice(3), () => { if (hiddenNow()) hiddenNoVeil += 1; });
    await tick(500);
    out.hiddenNoVeil = hiddenNoVeil; out.dotsPlain = dots();
    // 3. Un fichier ordinaire (240 cadres) avec le voile : jamais masqué.
    Editor.setHTML(deck().slice(0, 3).join(PB));
    await tick(200);
    let hiddenSmall = 0;
    await ImportPlacing.appendSlides(deck().slice(3, 6), () => { if (hiddenNow()) hiddenSmall += 1; }, { covered: () => true });
    out.hiddenSmall = hiddenSmall;
    // 4. Une pose qui échoue pendant le masquage remontre le texte.
    Editor.setHTML(deck().slice(0, 3).join(PB));
    await tick(200);
    let wasHidden = false;
    let rejected = false;
    try {
      await ImportPlacing.appendSlides(deck().slice(3), (n) => { if (hiddenNow()) wasHidden = true; if (wasHidden && n >= 36) throw new Error('arrêt voulu'); }, { covered: () => true });
    } catch (e) { rejected = /arrêt voulu/.test(String(e && e.message)); }
    out.failWasHidden = wasHidden; out.failRejected = rejected; out.failHiddenAfter = hiddenNow();
    return out;
  });
  check(tag + 'le voile à l\'écran et 2 500 cadres posés : le texte est masqué (content-visibility: hidden) à partir de la trente-deuxième diapositive de 80 cadres, jamais avant, et remontré à la fin', r.firstHidden >= 31 && r.firstHidden <= 33 && r.hiddenWhileVeil >= 5 && !r.hiddenAfter && r.styleAfter === '', { firstHidden: r.firstHidden, hiddenWhileVeil: r.hiddenWhileVeil, hiddenAfter: r.hiddenAfter, styleAfter: r.styleAfter });
  check(tag + 'sans voile à l\'écran, ou pour un fichier ordinaire (240 cadres), le texte n\'est jamais masqué', r.hiddenNoVeil === 0 && r.hiddenSmall === 0, { hiddenNoVeil: r.hiddenNoVeil, hiddenSmall: r.hiddenSmall });
  check(tag + 'une pose qui échoue pendant le masquage remontre le texte (la personne ne reste pas devant un éditeur vide)', r.failWasHidden && r.failRejected && !r.failHiddenAfter, { failWasHidden: r.failWasHidden, failRejected: r.failRejected, failHiddenAfter: r.failHiddenAfter });
  check(tag + 'les mesures prises pendant le masquage sont celles du texte montré : le point rouge de la diapositive au cadre trop haut tombe sur la septième, masquée ou non', JSON.stringify(r.dotsLocked) === JSON.stringify(r.dotsPlain) && r.dotsLocked.includes(6), { dotsLocked: r.dotsLocked, dotsPlain: r.dotsPlain });
}

// Le voile de la mise en place : absent d'un travail court, devant le panneau au bout d'une demi-seconde (texte et barre à jour), que ni Échap, ni la frappe, ni un clic n'atteignent ; il se retire pour une question
// (`suspend`) et revient au pas suivant.
async function veilCases(page, tag) {
  const veil = () => page.evaluate(() => {
    const el = document.getElementById('pp-placing-modal');
    const shown = !!el && getComputedStyle(el).display !== 'none';
    const fill = el && el.querySelector('.pp-placing-fill');
    const bar = el && el.querySelector('.pp-placing-bar');
    const box = el && el.querySelector('.pp-modal-box');
    return { shown, line: shown ? el.querySelector('.pp-placing-line').textContent : '', width: fill ? fill.style.width : '', now: bar ? bar.getAttribute('aria-valuenow') : '', title: box ? el.querySelector('h3').textContent : '', hint: shown ? el.querySelector('.pp-placing-hint').textContent.length : 0 };
  });
  const short = await page.evaluate(async () => {
    const progress = ImportPlacing.begin();
    progress.update('court', 0.5);
    await new Promise(resolve => setTimeout(resolve, 200));
    progress.end();
    return !!document.getElementById('pp-placing-modal') && getComputedStyle(document.getElementById('pp-placing-modal')).display !== 'none';
  });
  check(tag + 'un travail de moins d\'une demi-seconde ne montre aucun voile', short === false, short);
  await page.evaluate(() => { window.__veil = ImportPlacing.begin(); window.__veil.update('Premier texte', 0.25); window.__textBefore = Editor.getHTML(); });
  await sleep(700);
  await page.evaluate(() => window.__veil.update('Mise en place des diapositives… 30 / 120', 0.25));
  const shown = await veil();
  check(tag + 'au bout d\'une demi-seconde le voile est là : titre, texte du pas, barre à 25 %, conseil de patience', shown.shown && shown.line === 'Mise en place des diapositives… 30 / 120' && shown.width === '25%' && shown.now === '25' && shown.title === 'Import du PowerPoint' && shown.hint > 30, shown);
  const where = await page.evaluate(() => { const r = document.getElementById('editor-container').getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + Math.min(r.height / 2, 120); const top = document.elementFromPoint(x, y); return { x, y, covered: !!top && !!top.closest('#pp-placing-modal') }; });
  check(tag + 'le voile couvre le texte : un clic au milieu de l\'éditeur tombe sur lui', where.covered, where);
  await page.mouse.click(where.x, where.y);
  await page.keyboard.press('Escape');
  await page.keyboard.type('zzz');
  await sleep(200);
  const unchanged = await page.evaluate(() => Editor.getHTML() === window.__textBefore);
  check(tag + 'ni Échap, ni la frappe, ni un clic ne ferment le voile ni n\'écrivent dans le texte (le texte est le même, à l\'octet près)', (await veil()).shown && unchanged, { shown: (await veil()).shown, unchanged });
  await page.evaluate(() => window.__veil.suspend());
  const suspended = await veil();
  await page.evaluate(() => window.__veil.update('Mise en place des diapositives… 60 / 120', 0.5));
  const back = await veil();
  check(tag + 'le voile se retire pour une question (`suspend`) et revient au pas suivant, la barre à 50 %', !suspended.shown && back.shown && back.width === '50%', { suspended, back });
  await page.evaluate(() => window.__veil.end());
  check(tag + 'à la fin du travail le voile disparaît', !(await veil()).shown);
  // Un petit fichier à qui la question « Modifications non enregistrées » est posée : la lecture dure moins d'une demi-seconde, la personne répond bien plus tard, et la mise en place - courte - ne montre aucun voile
  // (l'attente se compte depuis la reprise, pas depuis le début de l'import) ; si elle dure, il vient une demi-seconde plus tard, sans nouveau pas, et se retire à la fin.
  const small = await page.evaluate(async () => {
    const open = () => { const el = document.getElementById('pp-placing-modal'); return !!el && getComputedStyle(el).display !== 'none'; };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const progress = ImportPlacing.begin();
    progress.update('Lecture', 0.3);
    progress.suspend();
    await wait(800);                                 // la personne réfléchit à la question
    progress.update('Mise en place', 0.7);
    const atOnce = open();
    await wait(250);
    progress.update('Mise en place', 0.8);
    const quick = open();                            // 250 ms de mise en place : pas de voile
    await wait(450);                                 // ... mais 700 ms de pose, sans aucun pas entre-temps : le minuteur le montre
    const later = open();
    progress.end();
    return { atOnce, quick, later, closed: !open() };
  });
  check(tag + 'après une question, un petit fichier ne voit pas le voile pendant sa mise en place courte ; une pose qui dure le fait venir au bout d\'une demi-seconde, et il se retire à la fin', !small.atOnce && !small.quick && small.later && small.closed, small);
}

async function traceCases(page, tag) {
  const marks = (await page.evaluate(() => PerfTrace.events().filter(e => e.kind === 'mark' && /^import PowerPoint/.test(e.label)))).slice(1, 5);
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
