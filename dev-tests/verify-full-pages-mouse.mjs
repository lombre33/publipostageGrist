#!/usr/bin/env node
// « Pages entières » (Antoine, 01/10 15:55) à la vraie souris, à la taille du panneau Grist d'Antoine (~700x400, feuille réduite à ~0,85) puis en témoin à 1400x1000 : la couture entre deux
// feuilles (le bas de la page qui finit, la gouttière, le haut de la page qui commence) ne vole aucun clic - un clic dans la marge d'une page 2 atteint le texte, l'image posée dans le
// haut de page se sélectionne et se déplace -, son pied et son en-tête ouvrent toujours leur édition, la gouttière ne fait rien, et une copie de « Sur toutes les pages » ne prend jamais
// la souris. Les copies sont posées au coin de chaque page (mesures à l'écran, zoom compris).
// Fonctionnalité du 01/10 : js/header-footer-preview.js (renderPaginationOverlay, buildSeam, paintRepeatedCopies), js/page-layer.js, css/editor-v2.css.
// Lancé par run-headless.mjs (groupe Node "fullPagesMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-full-pages-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.FULL_PAGES_MOUSE_PORT || 8919);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-layer-images-mouse.mjs.
async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const stubbed = html.replace(
    '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>',
    '<script src="dev-tests/grist-stub.js"></script>'
  );
  await writeFile(join(ROOT, '_test-harness.html'), stubbed);
}
await regenerateHarness();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok, ko) => server.listen(PORT, '127.0.0.1', ok).on('error', ko));
const BASE = `http://127.0.0.1:${PORT}`;

const esmMapPath = join(CACHE, 'esm-map.json');
const OFFLINE = existsSync(esmMapPath);
const esmMap = OFFLINE ? JSON.parse(readFileSync(esmMapPath, 'utf8')) : {};
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/vfs_fonts\.min\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-full-pages-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
if (OFFLINE) {
  await page.route('**://esm.sh/**', async route => {
    const url = route.request().url();
    const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
    if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
    const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
    if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
  });
  for (const [re, rel] of UMD_ROUTES) {
    await page.route(re, async route => route.fulfill({
      status: 200, contentType: 'text/javascript; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: await readFile(join(CACHE, rel), 'utf8'),
    }));
  }
  await page.addInitScript(() => {
    Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} });
  });
  await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
}

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });


const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol == null ? 1.5 : tol);
const r2 = v => Math.round(v * 100) / 100;

// Rectangle (pixels écran) d'un élément, ou null.
const rectOf = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
}, sel);
async function clickAt(x, y) { await page.mouse.move(x, y); await sleep(40); await page.mouse.down(); await sleep(40); await page.mouse.up(); await sleep(180); }
async function clickToolbar(action) {
  const c = await rectOf('.v2-floating-toolbar button[data-action="' + action + '"]');
  if (!c) return false;
  await clickAt(c.x, c.y);
  return true;
}
const focusInEditor = () => page.evaluate(() => EditorCore.getEditor().view.dom.contains(document.activeElement));
const PT = 96 / 72;
const zoomOfSheet = () => page.evaluate(() => { const z = parseFloat(getComputedStyle(document.querySelector('#editor-container .v2-page-sheet')).zoom); return isFinite(z) && z > 0 ? z : 1; });
const selectionInfo = () => page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return { image: !!(s.node && s.node.type.name === 'editorImage'), empty: s.empty }; });
const hfMode = () => page.evaluate(() => HeaderFooterPreview.isEditingHeaderFooter() ? HeaderFooterPreview.getHfMode() : null);
const exitHf = async () => { await page.evaluate(() => HeaderFooterPreview.exitHeaderFooterModeIfActive()); await sleep(250); };
// Amène le centre vertical d'un point de la page (ordonnée écran) au milieu de la zone visible du conteneur, puis rend le décalage appliqué.
async function scrollToCenter(selector, nth) {
  await page.evaluate(([sel, n]) => {
    const ec = document.getElementById('editor-container');
    const el = document.querySelectorAll(sel)[n || 0];
    const b = el.getBoundingClientRect(); const c = ec.getBoundingClientRect();
    ec.scrollTop += (b.top + b.height / 2) - (c.top + c.height / 2);
  }, [selector, nth || 0]);
  await sleep(250);
}
const rectNth = (sel, n) => page.evaluate(([s, i]) => {
  const el = document.querySelectorAll(s)[i || 0];
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
}, [sel, n || 0]);
// Ce que la souris touche au point (x, y) : la classe du premier élément, et s'il est dans une couture ou dans une copie.
const touched = (x, y) => page.evaluate(([px, py]) => {
  const el = document.elementFromPoint(px, py);
  if (!el) return null;
  return { cls: (el.className && el.className.baseVal === undefined ? el.className : '') || el.tagName, inSeam: !!el.closest('.v2-page-band'), inZone: !!el.closest('.v2-hf-zone'), inGutter: !!el.closest('.v2-page-seam-divider'), isCopy: !!el.closest('.v2-page-layer'), image: !!el.closest('.editor-image-view'), tiptap: el.classList.contains('tiptap') || !!el.closest('.tiptap') };
}, [x, y]);

async function freshDocument() {
  await page.evaluate(() => {
    const ec = document.getElementById('editor-container');
    ec.classList.add('a4-preview');
    ec.scrollTop = 0;
    PageLayout.setMarginsMm(null);
    Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED</p>', first: '' } });
    const c = document.createElement('canvas'); c.width = 120; c.height = 120;
    const g = c.getContext('2d');
    g.fillStyle = '#1e88e5'; g.fillRect(0, 0, 120, 120); g.fillStyle = '#fdd835'; g.fillRect(40, 40, 40, 40);
    const src = c.toDataURL('image/png');
    const m = PageLayout.getMarginsPx(); const K = 96 / 72;
    const img = o => '<p><img class="editor-image" src="' + src + '" alt="" style="width: 120px; height: 120px; position: absolute; left: ' + (m.left + o.leftPt * K) + 'px; top: ' + (m.top + o.topPt * K) + 'px; z-index: -1;" data-layer="behind" data-wrap="inline"'
      + (o.repeat ? ' data-repeat="true"' : '') + ' data-page-index="' + o.pageIndex + '" data-page-left-pt="' + o.leftPt + '" data-page-top-pt="' + o.topPt + '"></p>';
    const lines = Array.from({ length: 130 }, (_, i) => '<p>Ligne ' + i + ' du document, un peu de texte pour remplir la page.</p>').join('');
    // Le triangle de coin répété ; une image de la page 2, dans la bande de son en-tête (son `top` est celui d'un modèle d'avant les pages entières : la grille le remet en place).
    Editor.setHTML(img({ repeat: true, leftPt: -28, topPt: -83, pageIndex: 0 }) + img({ repeat: false, leftPt: 300, topPt: -60, pageIndex: 1 }) + lines);
    Editor.refreshLayout();
  });
  await sleep(700);
}

// Les pages de l'éditeur, en pixels écran : haut et bas de chaque feuille (la gouttière entre deux).
const pagesOnScreen = () => page.evaluate(() => {
  const ec = document.getElementById('editor-container');
  const sheet = ec.querySelector('.v2-page-sheet').getBoundingClientRect();
  const seams = Array.from(ec.querySelectorAll('.v2-pagination-overlay .v2-page-band'));
  const tops = [sheet.top]; const bottoms = [];
  seams.forEach(s => { bottoms.push(s.querySelector('.v2-page-seam-divider').getBoundingClientRect().top); tops.push(s.querySelector('.v2-page-seam-divider').getBoundingClientRect().bottom); });
  bottoms.push(sheet.bottom);
  return { tops, bottoms, left: sheet.left, right: sheet.right };
});

async function run(label) {
  await freshDocument();
  const z = await zoomOfSheet();
  const pg = await pagesOnScreen();
  check(label + ' : trois feuilles (' + pg.tops.length + '), facteur ' + r2(z), pg.tops.length >= 3);

  // Les copies du triangle de coin : au coin haut gauche de chaque page 2 et 3, à l'écran.
  const copies = await page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .v2-page-layer img.v2-page-layer-copy')).map(i => { const b = i.getBoundingClientRect(); return { left: b.left, top: b.top, w: b.width }; }));
  check(label + ' : une copie du triangle sur chacune des pages 2 et 3', copies.length === 2, copies);
  check(label + ' : chaque copie est au coin haut gauche de sa feuille (écart ≤ 1 px à l\'écran)', copies.length === 2 && copies.every((c, k) => near(c.left, pg.left, 1) && near(c.top, pg.tops[k + 1], 1)), { copies, pages: pg.tops });
  check(label + ' : la copie a la taille de l\'image (120 px de mise en page)', copies.length === 2 && copies.every(c => near(c.w, 120 * z, 1)), copies.map(c => c.w));

  // L'image de la page 2 est remise à la place que dit sa grille : -60 pt du corps de la page 2, +55 pt de bande, +28 pt de marge = 23 pt sous le haut de la page.
  const grid = await page.evaluate(() => { let a = null; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'editorImage' && !n.attrs.repeat) a = n.attrs; }); return a; });
  const imgRect = await rectNth('.tiptap .editor-image-view img', 1);
  check(label + ' : l\'image de la page 2 est à 23 pt sous le haut de sa page (grille page 1, -60 pt)', !!imgRect && near((imgRect.top - pg.tops[1]) / z / PT, 28 + 55 - 60, 0.6) && grid && grid.pageIndex === 1, { image: imgRect && r2((imgRect.top - pg.tops[1]) / z / PT), grille: grid && { p: grid.pageIndex, t: grid.pageTopPt } });

  // --- Un clic dans le bas de page de la page 1 (marge du bas, sous le pied) ne s'arrête pas à la couture ---
  await scrollToCenter('.v2-pagination-overlay .v2-page-seam-foot', 0);
  const foot = await rectNth('.v2-pagination-overlay .v2-page-seam-foot', 0);
  const lowInFoot = { x: foot.left + foot.w * 0.5, y: foot.bottom - 14 * z };
  const hit1 = await touched(lowInFoot.x, lowInFoot.y);
  check(label + ' : en bas de la page 1, la souris touche le texte de la page (`.tiptap`), pas la couture', !!hit1 && hit1.tiptap && !hit1.inSeam, hit1);
  await clickAt(lowInFoot.x, lowInFoot.y);
  check(label + ' : ce clic n\'ouvre ni le pied ni l\'en-tête, et le curseur reste dans l\'éditeur', (await hfMode()) === null && await focusInEditor());

  // --- Le pied de la page 1 ouvre toujours son édition ---
  const footerText = await rectNth('.v2-pagination-overlay .v2-page-band-footer p', 0);
  await clickAt(footerText.x, footerText.y);
  const hfFooter = await hfMode();
  check(label + ' : un clic sur le pied de la couture ouvre le pied de page', !!hfFooter && hfFooter.zone === 'footer', hfFooter);
  await exitHf();

  // --- La gouttière ne fait rien ---
  await scrollToCenter('.v2-pagination-overlay .v2-page-seam-divider', 0);
  const gutter = await rectNth('.v2-pagination-overlay .v2-page-seam-divider', 0);
  const before = await page.evaluate(() => EditorCore.getEditor().state.selection.from);
  const hitGutter = await touched(gutter.x, gutter.y);
  check(label + ' : au milieu de la gouttière, la souris touche la gouttière', !!hitGutter && hitGutter.inGutter, hitGutter);
  await clickAt(gutter.x, gutter.y);
  check(label + ' : un clic dans la gouttière n\'ouvre aucune zone', (await hfMode()) === null);

  // --- L'en-tête de la page 2 ouvre son édition ---
  const headerText = await rectNth('.v2-pagination-overlay .v2-page-band-header p', 0);
  const hitHeader = await touched(headerText.x, headerText.y);
  check(label + ' : sur le texte de l\'en-tête de la page 2, la souris touche la zone de l\'en-tête', !!hitHeader && hitHeader.inZone, hitHeader);
  await clickAt(headerText.x, headerText.y);
  const hfHeader = await hfMode();
  check(label + ' : un clic sur l\'en-tête de la couture ouvre l\'en-tête', !!hfHeader && hfHeader.zone === 'header', hfHeader);
  await exitHf();

  // --- L'image de la page 2, dans le haut de page, se sélectionne : la couture la laisse atteindre ---
  await scrollToCenter('.tiptap .editor-image-view img', 1);
  const imgNow = await rectNth('.tiptap .editor-image-view img', 1);
  const hitImg = await touched(imgNow.x, imgNow.y);
  check(label + ' : au centre de l\'image de la page 2, la souris touche l\'image (pas la couture)', !!hitImg && hitImg.image && !hitImg.inSeam, hitImg);
  await clickAt(imgNow.x, imgNow.y);
  check(label + ' : un clic sur cette image la sélectionne', (await selectionInfo()).image);
  check(label + ' : ce clic n\'ouvre aucune zone', (await hfMode()) === null);

  // --- Elle se déplace à la souris par sa poignée (une image « derrière le texte » est sous le texte : on la tient par la poignée, comme le font les autres scripts de souris), sa grille reste sur la page 2 ---
  const gridOf = () => page.evaluate(() => { let a = null; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'editorImage' && !n.attrs.repeat) a = n.attrs; }); return { p: a.pageIndex, l: a.pageLeftPt, t: a.pageTopPt }; });
  const g0 = await gridOf();
  const handle = await rectNth('.tiptap .editor-image-view .editor-image-move-handle', 1);
  const hitHandle = await touched(handle.x, handle.y);
  check(label + ' : la poignée de déplacement de l\'image de la page 2 est atteinte par la souris (ni la couture ni le texte ne la couvrent)', !!hitHandle && /move-handle/.test(hitHandle.cls), hitHandle);
  await page.mouse.move(handle.x, handle.y); await sleep(40);
  await page.mouse.down(); await sleep(60);
  await page.mouse.move(handle.x + 20, handle.y + 20, { steps: 4 }); await sleep(40);
  await page.mouse.move(handle.x + 40, handle.y + 50, { steps: 6 }); await sleep(60);
  await page.mouse.up(); await sleep(350);
  const g1 = await gridOf();
  check(label + ' : glissée de 40 x 50 px, l\'image avance de ' + r2(40 / z / PT) + ' x ' + r2(50 / z / PT) + ' pt dans sa grille', near(g1.l - g0.l, 40 / z / PT, 1.2) && near(g1.t - g0.t, 50 / z / PT, 1.2), { avant: g0, apres: g1 });
  check(label + ' : et elle reste sur la page 2 (sa grille ne change pas de page)', g1.p === 1, { avant: g0, apres: g1 });

  // --- Une copie ne prend jamais la souris ---
  await page.evaluate(() => EditorCore.getEditor().commands.setTextSelection(3));
  await scrollToCenter('#editor-container .v2-page-layer img.v2-page-layer-copy', 1);
  const copy = await rectNth('#editor-container .v2-page-layer img.v2-page-layer-copy', 1);
  const hitCopy = await touched(copy.x, copy.y);
  check(label + ' : au centre de la copie du triangle (page 3), la souris touche le texte de la page, pas la copie', !!hitCopy && !hitCopy.isCopy && !hitCopy.image, hitCopy);
  await clickAt(copy.x, copy.y);
  check(label + ' : un clic sur la copie ne sélectionne aucune image et laisse le curseur dans l\'éditeur', !(await selectionInfo()).image && await focusInEditor());

  // --- Rien ne déborde du panneau ---
  const overflow = await page.evaluate(() => { const ec = document.getElementById('editor-container'); return { sw: ec.scrollWidth, cw: ec.clientWidth }; });
  check(label + ' : la feuille tient dans la largeur du panneau (pas de défilement horizontal)', overflow.sw <= overflow.cw + 1, overflow);
}

await run('700x400');

// Témoin : panneau large, facteur 1.
await page.setViewportSize({ width: 1400, height: 1000 });
await sleep(900);
await run('1400x1000');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
