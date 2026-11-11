#!/usr/bin/env node
// L'enregistrement automatique d'un modèle LOURD attend la fin du GESTE de la personne, pas seulement de sa frappe (js/main-autosave.js : heavyPassMustWait, heavyIdleReadMustWait ; 11/11, un PowerPoint de
// 29 Mo : « quand on déplace une diapo c'est full freeze pendant plusieurs secondes » - le passage partait 1,5 s après la dernière modification, donc au moment où la personne, sa diapositive déplacée,
// allait chercher la suivante à la souris ; or il relit la table des modèles, écrit le texte entier et tient la page pendant des secondes). Dans GFS simulé, à la vraie souris, 700x400 :
//  1. un modèle de 8,2 millions de signes, une lettre tapée, puis la souris qui bouge sans arrêt pendant 14 s (bien après les 8,2 s d'écart dus à son poids) : rien n'est écrit ni relu pendant le geste ;
//  2. la souris s'arrête : le passage part dans les secondes qui suivent, après avoir lu la table, et porte la lettre ;
//  3. un geste qui dure plus de 45 s (AUTOSAVE_QUIET_MAX_DEFER_MS) ne retient pas l'enregistrement plus longtemps : il part quand même, souris en mouvement ;
//  4. au repos (rien à enregistrer), la relecture de la table lourde attend de même la fin du geste, puis vient ;
//  5. un modèle léger garde son rythme : il s'enregistre pendant que la souris bouge.
// Les attentes longues (82 s entre deux relectures au repos d'une table de ce poids, 45 s de report au plus) ne sont pas attendues pour de bon : l'horloge que le code lit (performance.now) est avancée à la
// main, les minuteries restent celles du navigateur.
// Lancé par run-headless.mjs (groupe Node « autosaveGestureMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-autosave-gesture-mouse.mjs
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-autosave-gesture-mouse', port: Number(process.env.AUTOSAVE_GESTURE_PORT || 8897) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TABLE = 'Publipostage_Modeles';
const HEAVY_CHARS = 8200000; // un peu plus que AUTOSAVE_HEAVY_CHARS (8 millions) : 8,2 s entre deux passages
const HEAVY_ID = 8;
const LIGHT_ID = 2;
const SEED = seedModels() + `
  add(${HEAVY_ID}, 'Lourd', '<p>Début</p><p><img class="editor-image" alt="Photo" src="data:image/png;base64,' + 'A'.repeat(${HEAVY_CHARS}) + '" style="width: 80px" data-layer="normal" data-wrap="inline"></p><p>Fin</p>', false, 'document');
  stub.state.nextRowId.Publipostage_Modeles = 10;
`;
// L'horloge que le code lit, avançable : posée avant tout script de la page, pour que chaque instant retenu soit sur la même.
const CLOCK = `(() => { const real = performance.now.bind(performance); window.__clockSkew = 0; performance.now = () => real() + window.__clockSkew; })();`;

const tab = await t.openPage({ seed: SEED, init: CLOCK });
const { page, app } = tab;

const open = async (id) => {
  await Promise.race([
    page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(30000),
  ]);
  await app.waitForFunction(n => String(Templates.getCurrentId()) === String(n) && !!document.querySelector('#editor-container .tiptap p'), id, { timeout: 30000 }).catch(() => {});
  await sleep(600);
  return app.evaluate(() => String(Templates.getCurrentId()));
};
// Les écritures du TEXTE d'un modèle (une ligne mise à jour avec son `Contenu`) : le premier passage crée aussi le jeton du modèle (une colonne, puis la ligne), sans rien du texte.
const counts = () => app.evaluate(table => ({ writes: window.__gristStub.state.actionLog.filter(a => a[0] === 'UpdateRecord' && a[1] === table && a[3] && 'Contenu' in a[3]).length, reads: window.__modelReads }), TABLE);
const contentOf = id => app.evaluate(([table, n]) => { const m = window.__gristStub.state.rows[table]; return m.Contenu[m.id.indexOf(n)] || ''; }, [TABLE, id]);
const advanceClock = ms => app.evaluate((by) => { window.__clockSkew += by; }, ms);
const editorBox = () => app.evaluate(() => { const r = document.getElementById('editor-container').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
// La souris se promène sur l'éditeur, un déplacement tous les `each` ms (jamais 1,5 s sans bouger), pendant `ms`.
let wanderStep = 0;
async function wander(ms, each = 350) {
  const box = await editorBox();
  const until = Date.now() + ms;
  while (Date.now() < until) {
    wanderStep++;
    const x = box.x + 40 + (wanderStep * 37) % Math.max(60, box.width - 80);
    const y = box.y + 30 + (wanderStep * 23) % Math.max(40, box.height - 60);
    await page.mouse.move(x, y, { steps: 3 });
    await sleep(each);
  }
}
// Un clic au bout du dernier paragraphe, puis une lettre au clavier.
async function typeAtEnd(letter) {
  const spot = await app.evaluate(() => {
    const list = document.querySelectorAll('#editor-container .tiptap > p');
    const last = list[list.length - 1];
    last.scrollIntoView({ block: 'center' });
    const range = document.createRange();
    range.selectNodeContents(last);
    const rects = range.getClientRects();
    const r = rects.length ? rects[rects.length - 1] : last.getBoundingClientRect();
    return { x: r.right + 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(spot.x - 8, spot.y);
  await page.mouse.move(spot.x, spot.y, { steps: 2 });
  await page.mouse.click(spot.x, spot.y);
  await sleep(120);
  await page.keyboard.press('End');
  await page.keyboard.type(letter);
}
const waitFor = async (test, ms, each = 150) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await test()) return true; await sleep(each); }
  return test();
};

// ---- Le modèle lourd ----
const opened = await open(HEAVY_ID);
const loadedAt = Date.now();
check('(préparation) le modèle lourd est ouvert', opened === String(HEAVY_ID), opened);
await app.evaluate((table) => {
  const docApi = window.grist.docApi;
  const original = docApi.fetchTable;
  window.__modelReads = 0;
  docApi.fetchTable = function (tableId) { if (tableId === table) window.__modelReads += 1; return original.apply(this, arguments); };
  window.__gristStub.clearActionLog();
}, TABLE);
const weight = await app.evaluate(n => (Templates.byId(n) || { contenu: '' }).contenu.length, HEAVY_ID);
check('(préparation) il pèse plus de 8 millions de signes', weight > 8000000, weight);

// 1. Une lettre, puis la souris bouge sans arrêt.
await typeAtEnd('a');
const before = await counts();
await wander(14000);
const during = await counts();
const sinceLoad = Date.now() - loadedAt;
check('1. pendant 14 s de souris en mouvement (' + Math.round(sinceLoad / 1000) + ' s après le chargement, l\'écart dû au poids est passé), rien n\'est écrit',
  sinceLoad > 12000 && during.writes === 0, during);
check('1. ... et la table des modèles n\'est pas relue', during.reads === before.reads, { before: before.reads, during: during.reads });

// 2. La souris s'arrête.
const stoppedAt = Date.now();
const written = await waitFor(async () => (await counts()).writes >= 1, 9000);
const delay = Date.now() - stoppedAt;
check('2. la souris arrêtée, le passage part dans les secondes qui suivent', written && delay <= 9000, { written, delay });
const afterStop = await contentOf(HEAVY_ID);
check('2. ... et il porte la lettre tapée, avec tout le texte', /Fina<\/p>|aFin<\/p>|Fin<\/p><p>a/.test(afterStop.slice(-200)) && afterStop.length > HEAVY_CHARS, afterStop.slice(-80));
const afterFirst = await counts();
check('2. ... la table a été lue avant d\'écrire (un passage lit avant d\'écrire)', afterFirst.reads - during.reads >= 1, afterFirst.reads - during.reads);

// 3. Un geste qui dure plus que le report le plus long : l'enregistrement part quand même.
await typeAtEnd('b');
await wander(11500); // l'écart dû au poids repasse (8,2 s) et un passage au moins est reporté par le geste
const held = await counts();
check('3. (préparation) le passage dû est retenu par la souris en mouvement', held.writes === afterFirst.writes, { held: held.writes, before: afterFirst.writes });
await advanceClock(46000);
await wander(6000);
const forced = await counts();
check('3. après 45 s de report, le passage part même si la souris bouge encore', forced.writes > held.writes, { forced: forced.writes, held: held.writes });
check('3. ... avec la lettre', /b/.test((await contentOf(HEAVY_ID)).slice(-200)), (await contentOf(HEAVY_ID)).slice(-80));

// 4. Au repos : la relecture d'une table lourde attend la fin du geste.
await sleep(1800); // la souris ne bouge plus : la relecture de la date du passage, s'il en reste une, est finie
const rested = await counts();
const dirty = await app.evaluate(() => { const el = document.getElementById('status-msg'); return el ? el.textContent : ''; });
await advanceClock(190000); // plus que l'attente la plus longue entre deux relectures au repos (AUTOSAVE_IDLE_MAX_INTERVAL_MS)
await wander(6500);
const idleMoving = await counts();
check('4. au repos, relecture due, souris en mouvement pendant 6,5 s : la table lourde n\'est pas relue', idleMoving.reads === rested.reads && idleMoving.writes === rested.writes, { rested, idleMoving, dirty });
const idleStoppedAt = Date.now();
const reread = await waitFor(async () => (await counts()).reads > rested.reads, 7000);
check('4. la souris arrêtée, la relecture vient dans les secondes qui suivent', reread, { ms: Date.now() - idleStoppedAt, counts: await counts() });
check('4. ... et rien n\'est écrit (rien n\'était à enregistrer)', (await counts()).writes === rested.writes, await counts());

// 5. Un modèle léger garde son rythme.
const light = await open(LIGHT_ID);
check('(préparation) le modèle léger est ouvert', light === String(LIGHT_ID), light);
await sleep(400);
const lightBefore = await counts();
await typeAtEnd('c');
await wander(6500);
const lightDuring = await counts();
check('5. un modèle léger s\'enregistre à son rythme pendant que la souris bouge', lightDuring.writes > lightBefore.writes && /c/.test(await contentOf(LIGHT_ID)), { before: lightBefore.writes, during: lightDuring.writes, content: await contentOf(LIGHT_ID) });

check('aucune boîte native ouverte', tab.natives.length === 0, tab.natives);
await t.finish();
