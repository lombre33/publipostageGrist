#!/usr/bin/env node
// Les graphiques d'une présentation LONGUE ne se dessinent plus tous à l'ouverture (demande du 03/11 : « optimiser la consommation de RAM, là en ouvrant la présentation du modèle depuis GFS ça reste long genre
// 5 à 10 secondes »). Avant, l'éditeur lançait le dessin des douze graphiques de « Présentation commerciale » d'un coup (environ une seconde et demie de fil principal, des toiles de 5 Mo chacune qui ne rendaient
// leur mémoire qu'au ramasse-miettes) ; chaque lecture d'un graphique créé lisait les sept tables de réglages de Grist quand deux lui suffisent. À 700x400, hébergé par GFS (simulé par dev-tests/gfs-stub.js), les
// extensions « graphique » et « diapositives » actives, le document de Grist de dev-tests/scenarios-chart-block.js (la table GfVentes).
//  UNE PRÉSENTATION de 40 diapositives, un graphique CRÉÉ chacune (barres, courbes, aires, secteurs, anneaux ; un titre chacune : 40 dessins différents, la mémoire des dessins ne les confond pas) :
//   - à l'ouverture, l'éditeur ne dessine que ce qu'on voit : le haut du document et ce que montrent les miniatures de la bande (moins de la moitié des 40), la diapositive 1 en tête ; un cadre loin de la vue n'a
//     pas de dessin (le cadre pointillé, aucune image) ;
//   - la molette le fait défiler jusque dans la vue : il se dessine ; la bande, qu'on fait défiler à la molette jusqu'à une miniature lointaine, la montre dessinée (la miniature copie un cadre que l'éditeur
//     n'avait pas dessiné : il le dessine pour elle, extensions/diapositives/slide-strip.js `copiesOf`, js/chart-entry.js `demand`) ;
//   - la Lecture montre les 40 images, et les 40 dessins sont faits UNE seule fois en tout (l'éditeur, la bande et la Lecture partagent la mémoire des dessins) ; le retour en édition n'en refait aucun et ne
//     fait revenir à aucun cadre dessiné, même un instant, le cadre pointillé.
//  UN DOCUMENT de six sections, un graphique créé chacune (pas de bande : rien ne demande un dessin que la vue) : même chose, et le retour de la Lecture ne fait pas clignoter le cadre dessiné qu'on voit.
//  LE DÉFILEMENT (demande du fil des miniatures, 03/11 : « 3 à 6 tâches longues de 65 à 200 ms à la molette, 1 à 3 images au-dessus de 100 ms ; sur 7322e6f, aucune ») : un dessin prend le fil principal 30 à 80 ms, il ne
//  commence donc jamais pendant que la molette tourne (une rafale de 35 pas de 100 px, un pas toutes les 60 ms : aucun dessin ni aucune tâche longue commencés pendant, aucune image au-dessus de 100 ms), et, la rafale finie,
//  tout ce que l'éditeur montre est dessiné ; par pauses d'une seconde entre trois coups de molette, le cadre qui arrive dans la vue est déjà dessiné (on dessine deux écrans d'avance, dans les pauses).
//  LES LECTURES EN SÉRIE (même demande : « avec 300 ms de latence, les cinq premiers graphiques n'ont leurs données que 1,9 s après la bande, au lieu de 0,6 s ») : cinq graphiques créés sur cinq tables, Grist à 300 ms l'appel :
//  leurs lectures partent ensemble (au moins quatre lectures de tables de données en vol en même temps), pas l'une après l'autre.
//  LE DESSIN AU REPOS (carte du 03/11 « Dessiner les graphiques restants au repos, après l'ouverture ? » : « Oui, au repos, un à la fois ») : les parcours ci-dessus le coupent (ChartBlock.setIdleDrawing(false)) ; une page neuve le laisse
//  permis : après l'ouverture et deux secondes de repos, les cadres que personne ne voit se dessinent un à un (au moins 240 ms entre deux, aucune tâche de plus de 150 ms : un dessin prend de 30 à 100 ms d'un seul tenant, pas plusieurs d'un coup), des touches pressées arrêtent la file, et la première Lecture
//  ne dessine plus rien.
//  LA TOILE : ChartMake.toImage rend la même image qu'avant (octet pour octet, 1440 x 900 pour 480 x 300 à trois pixels par pixel) et remet à zéro toutes les toiles qu'il a créées (leur mémoire est rendue tout de suite) ;
//  six dessins demandés ensemble encodent leur PNG hors du fil principal (`toBlob`), un à la fois (deux encodages en attente garderaient chacun leurs toiles de 5 Mo).
//  LA LECTURE DES RÉGLAGES : un graphique créé (ChartSource.made) lit deux tables de Grist, `_grist_Tables` et `_grist_Tables_column` ; un graphique de la page (`read`) toutes sauf `_grist_Pages` ; la liste (`list`) les sept.
// Lancé par run-headless.mjs (groupe Node « chartLazy », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-chart-lazy.mjs
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { start, seedModels, ROOT } from './gfs-page.mjs';
import { click } from './load-lib.mjs';

const t = await start({ name: 'verify-chart-lazy', port: Number(process.env.CHART_LAZY_PORT || 9182) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PNG = /^data:image\/png;base64,/;
const N = 40;   // les diapositives de la présentation
const M = 6;    // les sections du document
const KINDS = ['bar', 'line', 'area', 'pie', 'donut'];

// ---- Les deux modèles de l'essai -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Le graphique créé, tel que l'éditeur l'écrit : jamais d'image, sa définition (colonnes par identifiant), les lignes, son nom. Un titre à chacun : une définition, donc un dessin, à chacun.
const made = (title, k, table = 'GfVentes', width = 480, height = 300) => '<img class="editor-image" alt="Graphique" style="width: ' + width + 'px; height: ' + height + 'px" data-layer="normal" data-wrap="inline" data-chart-spec="'
  + JSON.stringify({ v: 1, kind: KINDS[k % KINDS.length], table, label: 'Mois', values: ['Montant'], title }).replace(/"/g, '&quot;') + '" data-chart-scope="all" data-chart-name="' + title + '">';
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const PROPS = '<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0"></div>';
const slides = [PROPS];
for (let k = 1; k <= N; k++) {
  slides.push('<h2>Diapositive ' + k + '</h2>', '<p>' + made('Graphique ' + k, k) + '</p>');
  if (k < N) slides.push(BR);
}
// Une présentation de plus de graphiques que la mémoire des dessins n'en garde (64) : le dessin au repos doit s'arrêter à 64.
const BIG = 70;
const bigSlides = [PROPS];
for (let k = 1; k <= BIG; k++) {
  bigSlides.push('<h2>Diapositive ' + k + '</h2>', '<p>' + made('Grand graphique ' + k, k) + '</p>');
  if (k < BIG) bigSlides.push(BR);
}
const sections = ['<h1>Rapport</h1>'];
for (let k = 1; k <= M; k++) {
  sections.push('<h2>Section ' + k + '</h2>', '<p>Le texte de la section ' + k + '.</p>', '<p>' + made('Section ' + k, k) + '</p>');
  if (k < M) sections.push(BR);
}
// Un document de cinq petits graphiques (300 x 100), chacun sur sa table (GfV1 à GfV5) : tous près de la vue à l'ouverture, et cinq tables à lire.
const TABLES = 5;
const several = ['<h1>Cinq tables</h1>'];
for (let k = 1; k <= TABLES; k++) several.push('<p>' + made('Table ' + k, k, 'GfV' + k, 300, 100) + '</p>');
const SEED = seedModels({}) + `
  add(7, 'Présentation longue', ${JSON.stringify(slides.join(''))}, false, 'presentation');
  add(8, 'Document long', ${JSON.stringify(sections.join(''))}, false, 'document');
  add(9, 'Document à cinq tables', ${JSON.stringify(several.join(''))}, false, 'document');
  add(10, 'Présentation de ${BIG} graphiques', ${JSON.stringify(bigSlides.join(''))}, false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;

// ---- Les gestes ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// `idle` : le dessin au repos reste permis (par défaut il est coupé : les parcours qui regardent le dessin à la demande ne veulent pas qu'un repos de deux secondes dessine le reste sous leurs yeux).
async function openApp(idle = false) {
  const opened = await t.openPage({ hosted: true, stub: { extensions: ['graphique', 'diapositives'] }, seed: SEED, lang: 'fr', colorScheme: 'light' });
  const { page } = opened;
  // Le document de Grist est celui de scenarios-chart-block.js : une seule description des données, chargée dans la page.
  await page.addScriptTag({ path: join(ROOT, 'dev-tests', 'scenarios-chart-block.js') });
  await page.evaluate(async () => { await GfsLink.ready; await Extensions.loadAll(); await window.__chartFixture.seed({ resetEditor: async () => {} }); });
  // Cinq tables de plus pour le document à cinq tables : les colonnes et les lignes de GfVentes, un nom chacune.
  await page.evaluate(() => {
    for (let k = 1; k <= 5; k++) {
      window.__gristStub.setVariables('GfV' + k, { Mois: 'Text', Montant: 'Numeric' });
      window.__gristStub.setRows('GfV' + k, [{ id: 1, Mois: 'Janvier', Montant: 10 * k }, { id: 2, Mois: 'Février', Montant: 20 * k }, { id: 3, Mois: 'Mars', Montant: 15 * k }]);
    }
  });
  // Le compte des dessins : chaque appel du moteur (ECharts) pour un graphique créé, posé avant l'ouverture du modèle, avec l'heure où il commence ; les tâches longues (50 ms et plus) ; le plus long intervalle entre deux images.
  await page.evaluate(() => {
    window.__draws = { n: 0, at: [] };
    const real = ChartMake.toImage;
    ChartMake.toImage = function () { window.__draws.n += 1; window.__draws.at.push(performance.now()); return real.apply(this, arguments); };
    window.__long = [];
    try { new PerformanceObserver((list) => { list.getEntries().forEach((e) => window.__long.push({ at: e.startTime, ms: e.duration })); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* pas de tâche longue à compter */ }
    window.__fps = { last: 0, max: 0 };
    const tick = (now) => { if (window.__fps.last) window.__fps.max = Math.max(window.__fps.max, now - window.__fps.last); window.__fps.last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    // Les boîtes que les gestes visent : le conteneur de l'éditeur, la bande (le premier parent de la liste qui défile), le cadre `i` du document, la miniature `i`.
    const strip = () => {
      const first = document.querySelector('.pp-slide-list .pp-slide-item');
      for (let el = first && first.parentElement; el && el !== document.body; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
      }
      return null;
    };
    window.__lazy = {
      editor: () => document.getElementById('editor-container'),
      strip,
      frame: i => Array.from(document.querySelectorAll('.editor-image-chart-placeholder')).filter(w => !w.closest('.pp-slide-list'))[i],
      thumb: i => document.querySelectorAll('.pp-slide-list .pp-slide-item')[i],
    };
  });
  if (!idle) await page.evaluate(() => { if (typeof ChartBlock.setIdleDrawing === 'function') ChartBlock.setIdleDrawing(false); });
  await sleep(300);
  return opened;
}
// `slides` : le nombre de miniatures que la bande doit montrer (une présentation) ; 0 pour un document, qui n'a pas de bande.
async function openModel(page, id, slides) {
  await Promise.race([
    page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
  if (slides) await page.waitForFunction(k => document.querySelectorAll('.pp-slide-item').length >= k, slides, { timeout: 30000 }).catch(() => {});
}
// Le nombre de dessins une fois que plus aucun ne se fait depuis `quiet` ms.
async function calm(page, quiet = 1800, limit = 60000) {
  let last = -1;
  let since = Date.now();
  const start0 = Date.now();
  while (Date.now() - start0 < limit) {
    const n = await page.evaluate(() => window.__draws.n);
    if (n !== last) { last = n; since = Date.now(); } else if (Date.now() - since >= quiet) return n;
    await sleep(100);
  }
  return last;
}
// Les cadres de l'ÉDITEUR dans l'ordre du document (la bande en porte des copies, qu'on laisse de côté) : dessinés ou non, et leur boîte.
const editorFrames = page => page.evaluate(() => Array.from(document.querySelectorAll('.editor-image-chart-placeholder')).filter(w => !w.closest('.pp-slide-list')).map((w) => {
  const img = w.querySelector('img');
  const box = w.getBoundingClientRect();
  return { drawn: w.classList.contains('editor-image-chart-drawn'), src: (img && img.getAttribute('src')) || '', width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10 };
}));
// Les miniatures de la bande, dans l'ordre : le dessin de leur graphique (ou rien), et si elles sont dans la vue de la bande.
const thumbs = page => page.evaluate(() => {
  const strip = window.__lazy.strip();
  const view = strip ? strip.getBoundingClientRect() : null;
  return Array.from(document.querySelectorAll('.pp-slide-list .pp-slide-item')).map((item) => {
    const wrap = item.querySelector('.editor-image-chart-placeholder');
    const img = wrap && wrap.querySelector('img');
    const box = item.getBoundingClientRect();
    return { chart: !!wrap, drawn: !!wrap && wrap.classList.contains('editor-image-chart-drawn') && /^data:image\/png/.test((img && img.getAttribute('src')) || ''), inView: !!view && box.bottom > view.top + 4 && box.top < view.bottom - 4 };
  });
});
const isDrawn = frame => !!frame && frame.drawn && PNG.test(frame.src);
// Fait défiler à la VRAIE molette le conteneur (`which` : 'editor' ou 'strip') jusqu'à ce que sa cible (le cadre ou la miniature `index`) soit au milieu de sa vue, ou, le conteneur arrivé au bout, dans sa vue.
async function wheelTo(page, which, index) {
  let last = null;
  for (let turn = 0; turn < 160; turn++) {
    const gap = await page.evaluate(({ which, index }) => {
      const L = window.__lazy;
      const scroller = which === 'editor' ? L.editor() : L.strip();
      const target = which === 'editor' ? L.frame(index) : L.thumb(index);
      if (!scroller || !target) return null;
      const s = scroller.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const x = Math.max(2, Math.min(innerWidth - 2, s.left + s.width / 2));
      const y = Math.max(2, Math.min(innerHeight - 2, s.top + Math.min(s.height, innerHeight - s.top) / 2));
      const middle = b.top + b.height / 2;
      return { dy: middle - y, x, y, top: scroller.scrollTop, inView: middle > s.top + 4 && middle < Math.min(s.bottom, innerHeight) - 4 };
    }, { which, index });
    if (!gap) return false;
    if (Math.abs(gap.dy) < 40 || (gap.inView && gap.top === last)) return true;
    if (gap.top === last && !gap.inView && turn > 2) return false;
    last = gap.top;
    await page.mouse.move(gap.x, gap.y);
    await page.mouse.wheel(0, Math.max(-400, Math.min(400, gap.dy)));
    await sleep(80);
  }
  return false;
}
// Une rafale de coups de molette sur l'éditeur : `steps` pas de 100 px, un toutes les `every` ms. Rend ce que la page a vécu pendant la rafale : les dessins commencés, les tâches longues commencées (leur durée) et le plus long
// intervalle entre deux images du navigateur (relevé à la fin de la rafale, avant les dessins qu'elle laisse derrière elle).
async function wheelBurst(page, steps, every) {
  const at = await page.evaluate(() => { const r = window.__lazy.editor().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, innerHeight - r.top) / 2 }; });
  await page.mouse.move(at.x, at.y);
  await page.evaluate(() => { window.__fps.max = 0; window.__burstFrom = performance.now(); });
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, 100); await sleep(every); }
  const end = await page.evaluate(() => { window.__burstTo = performance.now(); return { worstFrame: Math.round(window.__fps.max) }; });
  await sleep(300);   // le navigateur livre les tâches longues avec un peu de retard
  const seen = await page.evaluate(() => {
    const from = window.__burstFrom;
    const to = window.__burstTo;
    return { ms: Math.round(to - from), draws: window.__draws.at.filter(t => t >= from && t <= to).length, longs: window.__long.filter(l => l.at >= from && l.at <= to).map(l => Math.round(l.ms)) };
  });
  return Object.assign(seen, end);
}
// Les cadres de l'éditeur dans la vue (au moins 4 px dedans) qui n'ont pas leur dessin : leur rang (de 1).
const viewHoles = page => page.evaluate(() => {
  const box = window.__lazy.editor().getBoundingClientRect();
  const bottom = Math.min(box.bottom, innerHeight);
  const drawn = (w) => { const img = w.querySelector('img'); return w.classList.contains('editor-image-chart-drawn') && /^data:image\/png/.test((img && img.getAttribute('src')) || ''); };
  return Array.from(document.querySelectorAll('.editor-image-chart-placeholder')).filter(w => !w.closest('.pp-slide-list')).map((w, i) => ({ w, i, b: w.getBoundingClientRect() }))
    .filter(f => f.b.width > 0 && f.b.bottom > box.top + 4 && f.b.top < bottom - 4 && !drawn(f.w)).map(f => f.i + 1);
});
async function waitFor(page, what, fn, arg, timeout = 15000) {
  try { await page.waitForFunction(fn, arg, { timeout }); return true; } catch (e) { console.log('  (attente sans fin : ' + what + ')'); return false; }
}
const frameDrawn = (page, i, timeout) => waitFor(page, 'le dessin du cadre ' + (i + 1), n => { const w = Array.from(document.querySelectorAll('.editor-image-chart-placeholder')).filter(x => !x.closest('.pp-slide-list'))[n]; return !!w && w.classList.contains('editor-image-chart-drawn') && /^data:image\/png/.test(w.querySelector('img').getAttribute('src') || ''); }, i, timeout);
// La Lecture : toutes les images (`count`) puis, le retour en édition, ce qui s'est vu à l'écran. Rend les images de la Lecture et, du retour, le nombre de fois (à chaque image du navigateur) où un cadre qui était
// dessiné et à l'écran ne l'était plus (le cadre pointillé qui revient un instant, avant que le dessin ne revienne de la mémoire des dessins), sur combien de cadres vus.
async function readingAndBack(page, count) {
  await page.mouse.move(650, 380);
  await click(page, '#btn-mode-read');
  const ready = await waitFor(page, 'les images de la Lecture', k => { const imgs = Array.from(document.querySelectorAll('#reader-container img')); return imgs.length === k && imgs.every(i => /^data:image\/png/.test(i.getAttribute('src') || '')); }, count, 60000);
  const images = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container img')).map(i => i.getAttribute('src') || ''));
  const total = await calm(page, 1200);
  const before = (await editorFrames(page)).map(f => isDrawn(f));
  await page.evaluate((drawnBefore) => {
    const flash = window.__flash = { bad: 0, seen: 0, stop: false };
    const tick = () => {
      const box = document.getElementById('editor-container').getBoundingClientRect();
      Array.from(document.querySelectorAll('.editor-image-chart-placeholder')).filter(w => !w.closest('.pp-slide-list')).forEach((w, i) => {
        const b = w.getBoundingClientRect();
        if (!drawnBefore[i] || box.height === 0 || b.width === 0 || b.bottom <= box.top || b.top >= box.bottom) return;
        flash.seen += 1;
        if (!(w.classList.contains('editor-image-chart-drawn') && /^data:image\/png/.test((w.querySelector('img').getAttribute('src') || '')))) flash.bad += 1;
      });
      if (!flash.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, before);
  await click(page, '#btn-mode-edit');
  await sleep(2500);
  const flash = await page.evaluate(() => { window.__flash.stop = true; return { bad: window.__flash.bad, seen: window.__flash.seen }; });
  const afterEdit = await calm(page, 1200);
  return { ready, images, total, flash, afterEdit };
}

// ---- Le parcours : une présentation -------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\nUne présentation de ' + N + ' diapositives, un graphique créé chacune');
const { page } = await openApp();
await openModel(page, 7, N);
const shown = await page.evaluate(() => document.querySelectorAll('.pp-slide-item').length);
check('la présentation est ouverte : ' + N + ' diapositives dans la bande', shown === N, shown);

// 1) L'ouverture : seulement ce qui se voit.
const atOpen = await calm(page);
const framesOpen = await editorFrames(page);
const drawnOpen = framesOpen.filter(isDrawn).length;
console.log('  (à l\'ouverture : ' + atOpen + ' dessins sur ' + N + ', ' + drawnOpen + ' cadres dessinés)');
check('l\'éditeur a ' + N + ' cadres de graphique', framesOpen.length === N, framesOpen.length);
check('à l\'ouverture, moins de la moitié des ' + N + ' dessins sont faits (ce qu\'on voit : le haut du document et les miniatures de la bande), pas les ' + N, atOpen > 0 && atOpen < N / 2, { dessins: atOpen, cadresDessines: drawnOpen });
check('la diapositive 1, celle de la vue, est dessinée : une image PNG', isDrawn(framesOpen[0]), framesOpen[0] && [framesOpen[0].drawn, framesOpen[0].src.slice(0, 22)]);
check('les cadres dessinés sont autant que les dessins faits (aucun dessin perdu, aucun cadre dessiné sans dessin)', drawnOpen === atOpen, { dessins: atOpen, cadresDessines: drawnOpen });
const undrawn = framesOpen.map((f, i) => (isDrawn(f) ? -1 : i)).filter(i => i >= 0);
check('la plupart des cadres sont encore le cadre pointillé : pas d\'image, pas de classe « dessiné »', undrawn.length >= N / 2 && undrawn.every(i => !framesOpen[i].drawn && framesOpen[i].src === ''), undrawn.length);
// Le dessin au repos est coupé dans ce parcours (ChartBlock.setIdleDrawing(false)) : plus de deux secondes de repos, et pas un dessin de plus.
await sleep(3500);
const stillAtOpen = await page.evaluate(() => window.__draws.n);
check('coupé, le dessin au repos ne dessine rien : trois secondes et demie de repos de plus, aucun dessin de plus', stillAtOpen === atOpen, { avant: atOpen, apres: stillAtOpen });

// 1b) La molette : aucun dessin ne commence pendant qu'elle tourne ; tout ce qu'on voit est dessiné à l'arrêt ; entre deux gestes, les pauses suffisent pour que le cadre qui arrive soit déjà dessiné.
console.log('\nLe défilement à la molette');
const before0 = await editorFrames(page);
// Un endroit où plus de dix cadres sont encore sans dessin : on met en vue le cadre d'avant (d'un saut), et on laisse se dessiner ce qui est près.
const run = before0.findIndex((f, i) => i >= 3 && before0.length - i >= 12 && before0.slice(i, i + 12).every(x => !isDrawn(x)));
if (run < 0) check('un endroit du document où douze cadres de suite sont encore sans dessin, pour essayer la molette', false, before0.map(f => isDrawn(f)));
else {
  await page.evaluate((i) => { const L = window.__lazy; const r = L.editor().getBoundingClientRect(); const b = L.frame(i).getBoundingClientRect(); L.editor().scrollTop += (b.top + b.height / 2) - (r.top + r.height / 2); }, run - 1);
  await calm(page, 1500);
  const framesJump = await editorFrames(page);
  const ahead = framesJump.filter((f, i) => i >= run && !isDrawn(f)).length;
  check('au saut, ce qui est près de la vue se dessine et il reste plus bas au moins 6 cadres sans dessin pour la rafale', ahead >= 6, { dessines: framesJump.filter(isDrawn).length, sansDessinPlusBas: ahead });
  const draws0 = await page.evaluate(() => window.__draws.n);
  const burst = await wheelBurst(page, 35, 60);
  await calm(page, 1500);
  const madeAfter = (await page.evaluate(() => window.__draws.n)) - draws0;
  const holes = await viewHoles(page);
  console.log('  (rafale de ' + burst.ms + ' ms : ' + burst.draws + ' dessins commencés pendant, tâches longues ' + JSON.stringify(burst.longs) + ', plus long intervalle entre deux images ' + burst.worstFrame + ' ms ; ' + madeAfter + ' dessins depuis le saut)');
  check('la rafale de molette (35 pas de 100 px, un toutes les 60 ms) a fait entrer des cadres sans dessin dans le champ : il s\'est dessiné de quoi les montrer', madeAfter >= 1, madeAfter);
  check('aucun dessin ne commence pendant que la molette tourne (un dessin fige la page 30 à 80 ms : un à-coup à chaque graphique qui arrive)', burst.draws === 0, burst);
  check('aucune tâche longue (50 ms et plus) ne commence pendant que la molette tourne', burst.longs.length === 0, burst.longs);
  check('aucune image du navigateur ne dépasse 100 ms pendant que la molette tourne', burst.worstFrame <= 100, burst.worstFrame);
  check('la rafale finie, tout ce que l\'éditeur montre est dessiné (aucun cadre pointillé dans la vue)', holes.length === 0, holes);
  check('défiler ne dessine que ce qui est près de la vue, pas tous les cadres qu\'on a dépassés : quelques dessins, pas plus de 10', madeAfter <= 10, madeAfter);
}
// Des gestes et des pauses : trois coups de molette, une seconde de pause, cinq fois de suite ; à chaque pause, aucun cadre pointillé dans la vue (deux écrans d'avance, dessinés pendant les pauses).
const pauses = [];
for (let g = 0; g < 5; g++) {
  await wheelBurst(page, 3, 60);
  await sleep(1000);
  pauses.push((await viewHoles(page)).length);
}
check('entre deux gestes de molette, aucun cadre pointillé n\'arrive dans la vue (les cadres proches se dessinent dans les pauses)', pauses.every(n => n === 0), pauses);
// La suite repart du haut du document : ce qui est près se dessine, et on regarde de nouveau quels cadres n'ont pas de dessin.
await page.evaluate(() => { window.__lazy.editor().scrollTop = 0; });
await calm(page, 1500);
const framesTop = await editorFrames(page);
const undrawn2 = framesTop.map((f, i) => (isDrawn(f) ? -1 : i)).filter(i => i >= 0);

// 2) Un cadre loin de la vue : la molette l'amène, il se dessine.
const target = undrawn2[Math.floor(undrawn2.length / 2)];
let framesScroll = framesTop;
if (target === undefined) check('un cadre sans dessin attend la molette', false, undrawn2.length);
else {
  const before = await page.evaluate(() => window.__draws.n);
  const reached = await wheelTo(page, 'editor', target);
  check('la molette amène le cadre ' + (target + 1) + ' (sans dessin) au milieu de la vue de l\'éditeur', reached, target);
  const framed = await frameDrawn(page, target);
  const afterScroll = await calm(page, 1200);
  framesScroll = await editorFrames(page);
  check('le cadre, une fois dans la vue, se dessine (une image PNG)', framed && isDrawn(framesScroll[target]), framesScroll[target] && [framesScroll[target].drawn, framesScroll[target].src.slice(0, 22)]);
  check('le cadre ne change que de son trait pointillé (2 px) quand le dessin vient : même largeur, même hauteur à 4 px près (la pagination et la mise en page n\'en savent rien)',
    framesTop[target].width > 100 && Math.abs(framesScroll[target].width - framesTop[target].width) <= 4 && Math.abs(framesScroll[target].height - framesTop[target].height) <= 4, [framesTop[target].width, framesTop[target].height, framesScroll[target].width, framesScroll[target].height]);
  check('défiler dessine ce qui entre dans la vue, pas tout le document : quelques dessins de plus, pas les ' + (N - before), afterScroll > before && afterScroll - before <= 8, { avant: before, apres: afterScroll });
}

// 3) La bande : une miniature lointaine montre le dessin, l'éditeur dessine pour elle le cadre qu'elle copie.
const farThumb = framesScroll.map((f, i) => i).filter(i => !isDrawn(framesScroll[i]) && i !== target).pop();
const farOk = farThumb !== undefined;
check('il reste un cadre sans dessin pour essayer la bande', farOk, farThumb);
if (farOk) {
  const stripReached = await wheelTo(page, 'strip', farThumb);
  check('la molette amène la miniature ' + (farThumb + 1) + ' dans la vue de la bande', stripReached, farThumb);
  const thumbDrawn = await waitFor(page, 'le dessin de la miniature ' + (farThumb + 1), i => { const item = document.querySelectorAll('.pp-slide-list .pp-slide-item')[i]; const w = item && item.querySelector('.editor-image-chart-placeholder'); return !!w && w.classList.contains('editor-image-chart-drawn') && /^data:image\/png/.test(w.querySelector('img').getAttribute('src') || ''); }, farThumb, 12000);
  const framesStrip = await editorFrames(page);
  const stripAfter = await thumbs(page);
  check('la miniature montre le DESSIN du graphique (pas le cadre pointillé) une fois dans la vue de la bande', thumbDrawn && stripAfter[farThumb].drawn, stripAfter[farThumb]);
  check('l\'éditeur a dessiné le cadre que la miniature copie (la même image)', isDrawn(framesStrip[farThumb]), framesStrip[farThumb] && framesStrip[farThumb].src.slice(0, 22));
  const visible = stripAfter.map((s, i) => (s.inView && s.chart ? i : -1)).filter(i => i >= 0);
  check('toutes les miniatures que la bande montre ont leur dessin', visible.length > 0 && visible.every(i => stripAfter[i].drawn), visible.map(i => [i + 1, stripAfter[i].drawn]));
}

// 4) La Lecture : les 40 images, chaque dessin fait une seule fois en tout ; le retour en édition.
const deck = await readingAndBack(page, N);
check('la Lecture montre les ' + N + ' graphiques : ' + N + ' images PNG', deck.ready && deck.images.length === N && deck.images.every(s => PNG.test(s)), deck.images.length);
check('les ' + N + ' images sont différentes (un dessin chacune)', new Set(deck.images).size === N, new Set(deck.images).size);
check('chaque graphique est dessiné UNE seule fois en tout (éditeur, bande et Lecture partagent la mémoire des dessins) : ' + N + ' dessins', deck.total === N, deck.total);
check('le retour en édition ne refait aucun dessin', deck.afterEdit === N, deck.afterEdit);
check('au retour en édition, aucun cadre dessiné et à l\'écran ne redevient, même un instant, le cadre pointillé', deck.flash.seen > 0 && deck.flash.bad === 0, deck.flash);
const framesEnd = await editorFrames(page);
check('de retour, les cadres dessinés ont les mêmes octets que la Lecture (la mémoire des dessins rend le même dessin)', framesEnd.filter(isDrawn).length >= 1 && framesEnd.filter(isDrawn).every(f => deck.images.includes(f.src)), framesEnd.filter(isDrawn).length);

// ---- Le parcours : un document ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\nUn document de ' + M + ' sections, un graphique créé chacune');
const drawsBefore = await page.evaluate(() => window.__draws.n);
// Le conteneur de l'éditeur garde son défilement d'un modèle à l'autre : le document s'ouvre en haut.
await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
await openModel(page, 8, 0);
const docAtOpen = (await calm(page)) - drawsBefore;
const docOpen = await editorFrames(page);
console.log('  (à l\'ouverture : ' + docAtOpen + ' dessins sur ' + M + ', cadres dessinés : ' + docOpen.map(f => (isDrawn(f) ? 'oui' : 'non')).join(' ') + ')');
check('le document a ' + M + ' cadres de graphique', docOpen.length === M, docOpen.length);
check('à l\'ouverture, seul le haut du document se dessine : le premier graphique, et pas les ' + M, docAtOpen >= 1 && docAtOpen < M / 2 && isDrawn(docOpen[0]), { dessins: docAtOpen });
check('le dernier graphique n\'a pas de dessin (le cadre pointillé : pas d\'image, pas de classe « dessiné »)', !docOpen[M - 1].drawn && docOpen[M - 1].src === '', docOpen[M - 1]);
const docReached = await wheelTo(page, 'editor', M - 2);
const docFramed = await frameDrawn(page, M - 2);
check('la molette amène l\'avant-dernier graphique dans la vue : il se dessine (une image PNG)', docReached && docFramed, { amene: docReached, dessine: docFramed });
const docBack = await readingAndBack(page, M);
check('la Lecture du document montre les ' + M + ' graphiques, dessinés une seule fois chacun', docBack.ready && docBack.images.length === M && docBack.images.every(s => PNG.test(s)) && docBack.total - drawsBefore === M, { images: docBack.images.length, dessins: docBack.total - drawsBefore });
check('le retour en édition du document ne refait aucun dessin', docBack.afterEdit === docBack.total, [docBack.total, docBack.afterEdit]);
check('au retour en édition du document, le cadre dessiné qu\'on voit (rien ne le demande que la vue) ne redevient pas, un instant, le cadre pointillé', docBack.flash.seen > 0 && docBack.flash.bad === 0, docBack.flash);

// ---- Les lectures en série : cinq graphiques sur cinq tables, Grist à 300 ms l'appel -----------------------------------------------------------------------------------------------------------------
console.log('\nCinq graphiques sur cinq tables, Grist à 300 ms l\'appel');
await page.evaluate(() => {
  const d = grist.docApi;
  const real = d.fetchTable.bind(d);
  const reads = window.__reads = { live: 0, peak: 0, real };
  d.fetchTable = function (name) {
    if (!/^GfV\d$/.test(String(name))) return real(name);
    reads.live += 1;
    reads.peak = Math.max(reads.peak, reads.live);
    return Promise.resolve(real(name)).finally(() => { reads.live -= 1; });
  };
  window.__gristStub.setLatency(300);
  document.getElementById('editor-container').scrollTop = 0;
});
const latencyFrom = Date.now();
await openModel(page, 9, 0);
const severalDrawn = await waitFor(page, 'les ' + TABLES + ' dessins', n => { const w = Array.from(document.querySelectorAll('.editor-image-chart-placeholder')); return w.length === n && w.every(x => x.classList.contains('editor-image-chart-drawn')); }, TABLES, 40000);
const severalMs = Date.now() - latencyFrom;
const severalReads = await page.evaluate(() => { const r = window.__reads; grist.docApi.fetchTable = r.real; window.__gristStub.setLatency(0); return { peak: r.peak }; });
console.log('  (les ' + TABLES + ' graphiques dessinés ' + severalMs + ' ms après l\'ordre d\'ouverture, jusqu\'à ' + severalReads.peak + ' lectures de tables de données en vol en même temps)');
check('les ' + TABLES + ' graphiques sur ' + TABLES + ' tables se dessinent', severalDrawn, severalMs);
check('leurs lectures de Grist partent ensemble : au moins ' + (TABLES - 1) + ' lectures de tables de données en vol en même temps, pas une après l\'autre', severalReads.peak >= TABLES - 1, severalReads);

// ---- Le dessin au repos : les cadres que personne ne voit se dessinent quand la page ne bouge plus ----------------------------------------------------------------------------------------------------
console.log('\nLe dessin au repos');
// Le repos se lit dans l'activation de l'utilisateur du navigateur (`navigator.userActivation`), jamais dans des écouteurs posés sur la page : un écouteur de frappe ou de clic sur `document` (keydown, pointerdown,
// input) ajoutait 25 ms à chaque touche tapée dans « Présentation commerciale » (la touche et la saisie : 3 et 0 ms avant, 16 et 12 ms avec trois écouteurs passifs, mesuré le 04/11).
const blockSource = readFileSync(join(ROOT, 'extensions', 'graphique', 'chart-block.js'), 'utf8');
const typedListeners = blockSource.match(/addEventListener\(\s*(?:'|")(?:keydown|keypress|keyup|input|beforeinput|pointerdown|mousedown|touchstart)(?:'|")/g) || [];
const typedLists = blockSource.match(/\[\s*(?:'|")(?:keydown|keypress|keyup|input|beforeinput|pointerdown|mousedown|touchstart)(?:'|")[^\]]*\]\s*\.forEach/g) || [];
check('le graphique ne pose aucun écouteur de frappe ni de clic sur la page (25 ms de plus par touche tapée) : le repos vient de navigator.userActivation', typedListeners.length === 0 && typedLists.length === 0 && /navigator\.userActivation/.test(blockSource), { ecouteurs: typedListeners.concat(typedLists) });
// Une page neuve (mémoire des dessins vide, compteurs à zéro) où le dessin au repos reste permis.
const rest = await openApp(true);
const rp = rest.page;
await openModel(rp, 7, N);
const restOpen = await calm(rp, 1000);
const restFramesOpen = (await editorFrames(rp)).filter(isDrawn).length;
console.log('  (à l\'ouverture : ' + restOpen + ' dessins sur ' + N + ', ' + restFramesOpen + ' cadres dessinés)');
const firstIdle = await waitFor(rp, 'le premier dessin au repos', n => window.__draws.n > n, restOpen, 25000);
check('la page au repos (ni défilement ni geste depuis quelques secondes), un cadre que personne ne voit se dessine', firstIdle && restOpen < N / 2, { ouverture: restOpen });
// Une frappe pendant le dessin au repos l'arrête : des touches toutes les 330 ms pendant quatre secondes, aucun dessin ne commence (hors celui qui était déjà parti). Le repos se lit dans l'activation de l'utilisateur
// du navigateur, et Playwright la lui donne à chaque appel de evaluate : aucun entre le premier dessin au repos et la fin des touches (les heures sont prises à l'horloge murale, `performance.timeOrigin` + l'heure du dessin).
const keysFrom = Date.now();
for (let i = 0; i < 12; i++) { await rp.keyboard.press('Insert'); await sleep(330); }   // une touche qui ne fait rien dans l'éditeur ; Maj, Ctrl et Échap ne donnent pas l'activation de l'utilisateur au navigateur
const keysTo = Date.now();
const drawnDuringKeys = await rp.evaluate(([from, to]) => window.__draws.at.filter(t => performance.timeOrigin + t > from + 400 && performance.timeOrigin + t <= to).length, [keysFrom, keysTo]);
check('pendant des frappes, le dessin au repos ne commence aucun dessin (il attend le repos, quelques secondes sans geste, après la dernière)', drawnDuringKeys === 0, { dessinsPendantLesFrappes: drawnDuringKeys });
const restDone = await waitFor(rp, 'les ' + N + ' cadres dessinés au repos', k => { const w = Array.from(document.querySelectorAll('.editor-image-chart-placeholder')).filter(x => !x.closest('.pp-slide-list')); return w.length === k && w.every(x => x.classList.contains('editor-image-chart-drawn') && /^data:image\/png/.test(x.querySelector('img').getAttribute('src') || '')); }, N, 90000);
const restTotal = await calm(rp, 1500);
const idleSpy = await rp.evaluate((first) => {
  const at = window.__draws.at.slice(first);
  const gaps = [];
  for (let i = 1; i < at.length; i++) gaps.push(Math.round(at[i] - at[i - 1]));
  return { gaps, longs: window.__long.filter(l => l.at >= at[0]).map(l => Math.round(l.ms)) };
}, restOpen);
console.log('  (' + restTotal + ' dessins en tout ; intervalles entre deux dessins au repos, en ms : ' + idleSpy.gaps.join(' ') + ' ; tâches longues pendant : ' + JSON.stringify(idleSpy.longs) + ')');
check('au repos, les ' + N + ' cadres de l\'éditeur se dessinent (une image PNG chacun)', restDone, restTotal);
check('chaque graphique est dessiné UNE seule fois : ' + N + ' dessins en tout, aucun refait', restTotal === N, restTotal);
check('un dessin à la fois, avec un intervalle d\'au moins 240 ms entre deux (le navigateur respire)', idleSpy.gaps.length >= 10 && idleSpy.gaps.every(g => g >= 240), idleSpy.gaps);
check('aucune tâche de plus de 150 ms pendant le dessin au repos (un dessin par tâche : 30 à 100 ms chacun, pas plusieurs d\'un coup)', idleSpy.longs.every(ms => ms <= 150), idleSpy.longs);
// La première Lecture trouve tout dans la mémoire des dessins : aucun dessin de plus.
const restRead = await readingAndBack(rp, N);
check('la première Lecture ne dessine plus rien : les ' + N + ' images y sont, sans un dessin de plus que ceux du repos', restRead.ready && restRead.images.length === N && restRead.images.every(s => PNG.test(s)) && restRead.total === restTotal, { images: restRead.images.length, auRepos: restTotal, apresLaLecture: restRead.total });
check('le retour en édition ne redessine rien non plus', restRead.afterEdit === N, restRead.afterEdit);

// Plus de graphiques que la mémoire des dessins n'en garde (64) : le dessin au repos s'arrête quand elle est pleine, au lieu de dessiner le 65e qui ferait partir le plus ancien (les plus proches de la vue sont
// dessinés d'abord, donc ce sont les plus loin qui restent sans dessin) ; la première Lecture ne dessine que ceux-là.
console.log('\nLe dessin au repos dans une présentation de ' + BIG + ' graphiques (la mémoire des dessins en garde 64)');
const big = await openApp(true);
const bp = big.page;
await openModel(bp, 10, BIG);
const bigOpen = await calm(bp, 1000);
// On attend dans la page, sans appeler evaluate (il donnerait l'activation de l'utilisateur au navigateur, et le dessin au repos attend qu'il n'y en ait plus), qu'aucun dessin ne commence plus depuis douze secondes.
await waitFor(bp, 'la fin du dessin au repos', () => { const at = window.__draws.at; return at.length > 12 && performance.now() - at[at.length - 1] > 12000; }, null, 150000);
const bigTotal = await bp.evaluate(() => window.__draws.n);
const bigFrames = await editorFrames(bp);
const bigDrawn = bigFrames.map(f => isDrawn(f));
console.log('  (à l\'ouverture : ' + bigOpen + ' dessins ; au repos : ' + bigTotal + ' dessins en tout, ' + bigDrawn.filter(Boolean).length + ' cadres dessinés sur ' + bigFrames.length + ')');
check('la présentation a ' + BIG + ' cadres de graphique', bigFrames.length === BIG, bigFrames.length);
check('le dessin au repos se fait (plus de dessins que l\'ouverture n\'en a fait)', bigTotal > bigOpen + 10, { ouverture: bigOpen, enTout: bigTotal });
check('il s\'arrête à 64 dessins, la mémoire des dessins pleine (pas ' + BIG + ' : le 65e ferait partir un dessin qu\'il faudrait refaire à la Lecture)', bigTotal === 64, bigTotal);
// Les cadres que l'ouverture a dessinés (la vue, et ce que la bande montre) ne comptent pas dans l'ordre ; ceux du repos vont du plus proche de la vue au plus loin : le haut du document est dessiné, les derniers à l'être
// manquent.
check('64 cadres sur ' + BIG + ' sont dessinés : les ' + (BIG - 64) + ' qui manquent sont les plus loin de la vue (le haut du document est dessiné)', bigDrawn.filter(Boolean).length === 64 && bigDrawn.slice(0, 50).every(Boolean), bigDrawn.map(d => (d ? 1 : 0)).join(''));
// La Lecture montre les 70 images : elle dessine les 6 qui manquent (et, la mémoire des dessins n'en gardant que 64, quelques-uns de ceux que ces 6 en ont fait partir, qu'elle redemande plus loin).
const bigRead = await readingAndBack(bp, BIG);
console.log('  (' + bigRead.total + ' dessins en tout après la Lecture, ' + BIG + ' images)');
check('la première Lecture montre les ' + BIG + ' images (PNG), dessinées au plus une fois chacune de plus que celles qui manquaient', bigRead.ready && bigRead.images.length === BIG && bigRead.images.every(src => PNG.test(src)) && bigRead.total < bigTotal + 2 * (BIG - 64) + 10, { images: bigRead.images.length, dessinsApresLaLecture: bigRead.total });

// ---- La toile : la même image, et plus aucune toile pleine derrière ----------------------------------------------------------------------------------------------------------------------------------
console.log('\nLa toile d\'ECharts');
const canvas = await page.evaluate(async () => {
  const option = { animation: false, backgroundColor: '#ffffff', xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [3, 5, 2] }] };
  const created = [];
  const real = document.createElement;
  document.createElement = function (tag) { const el = real.apply(this, arguments); if (String(tag).toLowerCase() === 'canvas') created.push(el); return el; };
  let uri = '';
  try { uri = await ChartMake.toImage(option, 480, 300); } finally { document.createElement = real; }
  // Le dessin tel qu'il se faisait avant (ni toile remise à zéro, ni rien d'autre) : l'image doit être la même, octet pour octet.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;width:480px;height:300px';
  document.body.appendChild(host);
  const chart = window.echarts.init(host, null, { renderer: 'canvas', width: 480, height: 300, devicePixelRatio: ChartMake.SCALE });
  chart.setOption(option, true);
  const reference = chart.renderToCanvas({ type: 'png', pixelRatio: ChartMake.SCALE, backgroundColor: '#ffffff' }).toDataURL('image/png');
  chart.dispose();
  host.remove();
  const size = await new Promise((ok) => { const img = new Image(); img.onload = () => ok({ width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => ok({ width: 0, height: 0 }); img.src = uri; });
  return { png: uri.slice(0, 22), same: uri === reference, bytes: uri.length, size, canvases: created.length, full: created.filter(c => c.width !== 0 || c.height !== 0).map(c => c.width + 'x' + c.height) };
});
check('ChartMake.toImage rend une image PNG de 1440 x 900 pixels pour 480 x 300 (trois pixels par pixel)', PNG.test(canvas.png) && canvas.size.width === 1440 && canvas.size.height === 900, canvas);
check('c\'est la même image, octet pour octet, que celle du dessin d\'avant (sans toile remise à zéro)', canvas.same && canvas.bytes > 1000, { memeImage: canvas.same, octets: canvas.bytes });
check('toutes les toiles que le dessin a créées sont ramenées à zéro (leur mémoire est rendue tout de suite, pas au prochain ramasse-miettes)', canvas.canvases >= 2 && canvas.full.length === 0, canvas);

// Six dessins demandés ensemble (un export, la bande et la Lecture à la fois) : l'encodage du PNG se fait hors du fil principal (`toBlob`), et deux dessins qui l'attendraient ensemble garderaient chacun leurs toiles de 5 Mo.
const queued = await page.evaluate(async () => {
  const option = { animation: false, backgroundColor: '#ffffff', xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [3, 5, 2] }] };
  const realBlob = HTMLCanvasElement.prototype.toBlob;
  let open = 0, peak = 0, calls = 0;
  HTMLCanvasElement.prototype.toBlob = function (callback, ...rest) { calls += 1; open += 1; peak = Math.max(peak, open); return realBlob.call(this, (blob) => { open -= 1; callback(blob); }, ...rest); };
  const created = [];
  const realCreate = document.createElement;
  document.createElement = function (tag) { const el = realCreate.apply(this, arguments); if (String(tag).toLowerCase() === 'canvas') created.push(el); return el; };
  let uris = [];
  try { uris = await Promise.all([1, 2, 3, 4, 5, 6].map(() => ChartMake.toImage(option, 480, 300))); } finally { HTMLCanvasElement.prototype.toBlob = realBlob; document.createElement = realCreate; }
  return { calls, peak, png: uris.every(u => /^data:image\/png;base64,/.test(u)), same: uris.every(u => u === uris[0]), canvases: created.length, full: created.filter(c => c.width !== 0 || c.height !== 0).length };
});
check('six dessins demandés ensemble : l\'encodage du PNG se fait hors du fil principal (toBlob), un dessin à la fois (jamais deux encodages en même temps), les six images sont les mêmes et aucune toile ne reste pleine', queued.calls === 6 && queued.peak === 1 && queued.png && queued.same && queued.canvases >= 12 && queued.full === 0, queued);

// ---- La lecture des réglages : deux tables pour un graphique créé ---------------------------------------------------------------------------------------------------------------------------------
console.log('\nLes tables de réglages de Grist');
const reads = await page.evaluate(async () => {
  const names = [];
  const real = GristAPI.fetchTableRows;
  GristAPI.fetchTableRows = function (name) { names.push(String(name)); return real.apply(this, arguments); };
  try {
    const def = ChartMake.normalize({ kind: 'bar', table: 'GfVentes', label: 'Mois', values: ['Montant'] });
    const spec = await GristAPI.withReadPass(() => ChartSource.made(def));
    const forMade = names.splice(0).filter(n => /^_grist_/.test(n));
    const pageChart = await GristAPI.withReadPass(() => ChartSource.read(101));
    const forRead = names.splice(0).filter(n => /^_grist_/.test(n));
    const list = await GristAPI.withReadPass(() => ChartSource.list());
    const forList = names.splice(0).filter(n => /^_grist_/.test(n));
    return { madeFound: !!spec && Array.isArray(spec.fields) && spec.fields.length > 0, readFound: !!pageChart, listFound: list.length > 0, forMade: forMade.sort(), forRead: forRead.sort(), forList: forList.sort() };
  } finally { GristAPI.fetchTableRows = real; }
});
check('un graphique créé (ChartSource.made) se lit, avec ses colonnes', reads.madeFound, reads);
check('il ne lit que deux tables de réglages : _grist_Tables et _grist_Tables_column', JSON.stringify(reads.forMade) === JSON.stringify(['_grist_Tables', '_grist_Tables_column']), reads.forMade);
check('un graphique de la page (ChartSource.read) se lit et ne lit pas les pages (_grist_Pages)', reads.readFound && reads.forRead.length === 6 && reads.forRead.indexOf('_grist_Pages') === -1 && reads.forRead.indexOf('_grist_Views_section_field') >= 0, reads.forRead);
check('la liste des graphiques (ChartSource.list) lit les sept tables, les pages dont elle a besoin pour l\'ordre', reads.listFound && reads.forList.length === 7 && reads.forList.indexOf('_grist_Pages') >= 0, reads.forList);

await t.finish();
