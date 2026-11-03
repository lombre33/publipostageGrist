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
//  LA TOILE : ChartMake.toImage rend la même image qu'avant (octet pour octet, 1440 x 900 pour 480 x 300 à trois pixels par pixel) et remet à zéro toutes les toiles qu'il a créées (leur mémoire est rendue tout de suite).
//  LA LECTURE DES RÉGLAGES : un graphique créé (ChartSource.made) lit deux tables de Grist, `_grist_Tables` et `_grist_Tables_column` ; un graphique de la page (`read`) toutes sauf `_grist_Pages` ; la liste (`list`) les sept.
// Lancé par run-headless.mjs (groupe Node « chartLazy », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-chart-lazy.mjs
import { join } from 'node:path';
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
const made = (title, k) => '<img class="editor-image" alt="Graphique" style="width: 480px; height: 300px" data-layer="normal" data-wrap="inline" data-chart-spec="'
  + JSON.stringify({ v: 1, kind: KINDS[k % KINDS.length], table: 'GfVentes', label: 'Mois', values: ['Montant'], title }).replace(/"/g, '&quot;') + '" data-chart-scope="all" data-chart-name="' + title + '">';
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const PROPS = '<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0"></div>';
const slides = [PROPS];
for (let k = 1; k <= N; k++) {
  slides.push('<h2>Diapositive ' + k + '</h2>', '<p>' + made('Graphique ' + k, k) + '</p>');
  if (k < N) slides.push(BR);
}
const sections = ['<h1>Rapport</h1>'];
for (let k = 1; k <= M; k++) {
  sections.push('<h2>Section ' + k + '</h2>', '<p>Le texte de la section ' + k + '.</p>', '<p>' + made('Section ' + k, k) + '</p>');
  if (k < M) sections.push(BR);
}
const SEED = seedModels({}) + `
  add(7, 'Présentation longue', ${JSON.stringify(slides.join(''))}, false, 'presentation');
  add(8, 'Document long', ${JSON.stringify(sections.join(''))}, false, 'document');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;

// ---- Les gestes ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function openApp() {
  const opened = await t.openPage({ hosted: true, stub: { extensions: ['graphique', 'diapositives'] }, seed: SEED, lang: 'fr', colorScheme: 'light' });
  const { page } = opened;
  // Le document de Grist est celui de scenarios-chart-block.js : une seule description des données, chargée dans la page.
  await page.addScriptTag({ path: join(ROOT, 'dev-tests', 'scenarios-chart-block.js') });
  await page.evaluate(async () => { await GfsLink.ready; await Extensions.loadAll(); await window.__chartFixture.seed({ resetEditor: async () => {} }); });
  // Le compte des dessins : chaque appel du moteur (ECharts) pour un graphique créé, posé avant l'ouverture du modèle.
  await page.evaluate(() => {
    window.__draws = { n: 0 };
    const real = ChartMake.toImage;
    ChartMake.toImage = function () { window.__draws.n += 1; return real.apply(this, arguments); };
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

// 2) Un cadre loin de la vue : la molette l'amène, il se dessine.
const target = undrawn[Math.floor(undrawn.length / 2)];
let framesScroll = framesOpen;
if (target === undefined) check('un cadre sans dessin attend la molette (il y en a plus de la moitié)', false, undrawn.length);
else {
  const before = await page.evaluate(() => window.__draws.n);
  const reached = await wheelTo(page, 'editor', target);
  check('la molette amène le cadre ' + (target + 1) + ' (sans dessin) au milieu de la vue de l\'éditeur', reached, target);
  const framed = await frameDrawn(page, target);
  const afterScroll = await calm(page, 1200);
  framesScroll = await editorFrames(page);
  check('le cadre, une fois dans la vue, se dessine (une image PNG)', framed && isDrawn(framesScroll[target]), framesScroll[target] && [framesScroll[target].drawn, framesScroll[target].src.slice(0, 22)]);
  check('le cadre ne change que de son trait pointillé (2 px) quand le dessin vient : même largeur, même hauteur à 4 px près (la pagination et la mise en page n\'en savent rien)',
    framesOpen[target].width > 100 && Math.abs(framesScroll[target].width - framesOpen[target].width) <= 4 && Math.abs(framesScroll[target].height - framesOpen[target].height) <= 4, [framesOpen[target].width, framesOpen[target].height, framesScroll[target].width, framesScroll[target].height]);
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
