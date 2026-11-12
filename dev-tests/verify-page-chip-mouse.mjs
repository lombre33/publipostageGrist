#!/usr/bin/env node
// Le repère « 3/4 » du défilement (js/page-chip.js, css/page-zoom.css ; audit « confort d'usage » du 12/11, idée 12, GO d'Antoine : plus discret que la maquette, « x/x » sans le mot « page », près du zoom,
// près du pointeur quand on tire la barre, effacé après le défilement) à la VRAIE molette et à la vraie souris, à 700x400 (le panneau de Grist) :
//   1) au repos, rien ; à la molette, « 1/3 » s'allume au-dessus de la pastille de zoom, calé sur son bord droit, petit (20 px), sans le mot « page » ;
//   2) plus bas, la page suit (« 2/3 »), tout en bas c'est la dernière (« 3/3 ») ;
//   3) une seconde après la dernière molette, il est éteint (opacité 0) ;
//   4) la barre de défilement tenue à la souris : il quitte le coin pour suivre le pointeur (à sa gauche, à sa hauteur), reste tant qu'elle est tenue, et s'efface après le relâchement ;
//   5) la Lecture : même repère à la molette ;
//   6) un document d'une page : jamais de repère ;
//   7) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « pageChipMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-page-chip-mouse.mjs
import { open, stopServer, sleep, click, fire } from './load-lib.mjs';

const PORT = Number(process.env.PAGE_CHIP_PORT || 9014);
let failed = 0;
let total = 0;
const check = (label, ok, extra) => {
  total++;
  if (!ok) failed++;
  console.log((ok ? '  ok   - ' : '  FAIL - ') + label + (ok || extra === undefined ? '' : ' (' + JSON.stringify(extra) + ')'));
};
const spec = paragraphs => ({ tables: [{ id: 'PcClients', rows: 3, columns: [{ id: 'Nom', type: 'Text' }] }], models: { count: 1, paragraphs, table: 'PcClients', columns: ['Nom'], firstIsDefault: true } });

const chipState = (page, containerId) => page.evaluate(id => {
  const chip = document.getElementById('pp-page-chip');
  const zoom = document.getElementById('pp-page-zoom');
  const r = chip.getBoundingClientRect();
  const z = zoom.getBoundingClientRect();
  const c = document.getElementById(id);
  return { text: chip.textContent, on: chip.classList.contains('pp-page-chip-on'), opacity: parseFloat(getComputedStyle(chip).opacity), left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height,
    zoomTop: z.top, zoomRight: z.right, scrollTop: c.scrollTop, max: c.scrollHeight - c.clientHeight, shown: r.width > 0 && getComputedStyle(chip).visibility !== 'hidden' };
}, containerId);
const SHAPE = /^\d+\/\d+$/;

let w = null;
const errors = [];
try {
  console.log('\n[1] Édition : un document de trois pages, à la molette');
  w = await open({ spec: spec(120), port: PORT, settleMs: 2000, theme: 'light', lang: 'fr' });
  let page = w.page;
  const seams = await page.evaluate(() => document.querySelectorAll('#editor-container .v2-page-seam-divider').length);
  check('l\'aperçu A4 montre trois pages (deux coutures)', seams === 2, seams);
  let s = await chipState(page, 'editor-container');
  check('au repos, aucun repère à l\'écran', !s.on && !s.shown, s);
  await page.mouse.move(300, 250);
  await page.mouse.wheel(0, 120);
  await sleep(350);
  s = await chipState(page, 'editor-container');
  check('à la molette, « 1/3 » s\'allume (« x/x », sans le mot « page »)', s.on && s.shown && s.text === '1/3' && SHAPE.test(s.text), s);
  check('il est petit (20 px) et posé au-dessus de la pastille de zoom, calé sur son bord droit', s.height <= 22 && s.bottom <= s.zoomTop && s.zoomTop - s.bottom <= 12 && Math.abs(s.right - s.zoomRight) <= 3, s);

  console.log('\n[2] La page suit le défilement');
  await page.evaluate(() => { const c = document.getElementById('editor-container'); c.scrollTop = (c.scrollHeight - c.clientHeight) * 0.5; });
  await sleep(350);
  s = await chipState(page, 'editor-container');
  check('vers le milieu du document : « 2/3 »', s.on && s.text === '2/3', s);
  await page.mouse.wheel(0, 20000);
  await sleep(400);
  s = await chipState(page, 'editor-container');
  check('tout en bas : « 3/3 »', s.on && s.text === '3/3' && s.scrollTop >= s.max - 3, s);

  console.log('\n[3] Il s\'efface après le défilement');
  await sleep(1500);
  s = await chipState(page, 'editor-container');
  check('une seconde et demie plus tard, il est éteint', !s.on && s.opacity === 0, s);

  console.log('\n[4] En tenant la barre de défilement');
  // Le Chromium sans écran n'a que des barres fines qui se superposent au contenu et qu'on ne peut pas tirer : on y TIENT la barre (appui au bord droit du document, là où se prend la barre
  // avec une barre classique) et le défilement vient d'ailleurs (la molette). Ce que le test voit, c'est le repère qui quitte le coin pour suivre le pointeur et s'efface au relâchement.
  await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
  await sleep(1300);
  const edge = await page.evaluate(() => { const c = document.getElementById('editor-container'); const b = c.getBoundingClientRect(); return { x: b.right - 4, y: b.top + c.clientTop + c.clientHeight * 0.4 }; });
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await sleep(250);
  s = await chipState(page, 'editor-container');
  check('l\'appui sur la barre allume le repère, à gauche du pointeur et à sa hauteur (pas au coin)', s.on && s.shown && s.right <= edge.x && edge.x - s.right <= 40 && Math.abs((s.top + s.bottom) / 2 - edge.y) <= 14, { s, edge });
  await page.mouse.move(edge.x, edge.y + 60, { steps: 5 });
  await page.mouse.wheel(0, 20000);
  await sleep(300);
  s = await chipState(page, 'editor-container');
  check('le numéro avance et le repère reste près du pointeur', s.on && s.text === '3/3' && Math.abs((s.top + s.bottom) / 2 - (edge.y + 60)) <= 14, { s, edge });
  await sleep(1300);
  s = await chipState(page, 'editor-container');
  check('tant que la barre est tenue, il reste', s.on, s);
  await page.mouse.up();
  await sleep(1500);
  s = await chipState(page, 'editor-container');
  check('relâchée, il s\'efface', !s.on && s.opacity === 0, s);

  console.log('\n[5] La Lecture');
  await fire(page, 'PcClients', 1); // la Lecture montre une ligne : sans elle, un guide
  await sleep(500);
  await click(page, '#btn-mode-read');
  await sleep(1200);
  await page.mouse.move(300, 250);
  await page.mouse.wheel(0, 300);
  await sleep(400);
  s = await chipState(page, 'reader-container');
  check('à la molette, le repère « x/y » s\'allume aussi en Lecture', s.on && s.shown && SHAPE.test(s.text) && Number(s.text.split('/')[1]) === 3, s);
  errors.push(...w.errors);
  await w.close();
  w = null;

  console.log('\n[6] Un document d\'une page');
  w = await open({ spec: spec(2), port: PORT, settleMs: 2000, theme: 'light', lang: 'fr' });
  page = w.page;
  await page.mouse.move(300, 250);
  await page.mouse.wheel(0, 300);
  await sleep(400);
  s = await chipState(page, 'editor-container');
  check('une seule page : aucun repère', !s.on && !s.shown, s);
  errors.push(...w.errors);
  await w.close();
  w = null;

  check('aucune erreur de page', errors.length === 0, errors.slice(0, 3));
} catch (e) {
  failed++;
  total++;
  console.log('  FAIL - exception : ' + (e && e.stack || e));
} finally {
  if (w) await w.close();
  await stopServer();
}
console.log('\n' + (total - failed) + '/' + total + ' passés');
process.exit(failed ? 1 : 0);
