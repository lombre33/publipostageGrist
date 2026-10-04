#!/usr/bin/env node
// Une image tirée dans un coin de la feuille, avec un en-tête et un pied de page, à la vraie souris et à la taille du panneau Grist d'Antoine (~700x400).
// Antoine (01/10, modèle « Fiche mission ») cale des triangles de coin et des logos au bord de la feuille : l'image doit s'arrêter pile dans le coin (la bande
// que le PDF réserve sous la marge du haut compte dans la marge), rester atteignable à la souris alors que l'espaceur de l'en-tête la recouvre, et la marge
// vide autour d'elle doit toujours ouvrir l'en-tête ou le pied de page (les espaceurs ne prennent pas la souris : js/header-footer-preview.js:zoneUnderPointer).
// Les scénarios de dev-tests/ n'ont ni vraie souris ni feuille réduite : ils ne voient ni un espaceur qui masque l'image ni un clic perdu dans la marge.
// Même parcours rejoué à 1400x1000 (facteur 1) en témoin.
// Lancé par run-headless.mjs (groupe Node "imageCornerMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-image-corner-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.IMAGE_CORNER_MOUSE_PORT || 8916);
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-image-corner-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
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

// Rectangles (pixels écran) de l'image, de la feuille et de ses deux espaceurs, plus le facteur d'ajustement.
const geometry = () => page.evaluate(() => {
  const img = document.querySelector('.tiptap .editor-image-view img');
  const r = img.getBoundingClientRect();
  const sheet = document.querySelector('#editor-container .v2-page-sheet');
  const sr = sheet.getBoundingClientRect();
  const rect = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height }; };
  return {
    image: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height },
    sheet: { left: sr.left, top: sr.top, right: sr.right, bottom: sr.bottom },
    tiptap: rect(document.querySelector('#editor-container .tiptap')),
    top: rect(document.querySelector('#editor-container .v2-page-edge-top')),
    bottom: rect(document.querySelector('#editor-container .v2-page-edge-bottom')),
    zoom: parseFloat(getComputedStyle(sheet).zoom) || 1,
  };
});
const imageAttrs = () => page.evaluate(() => {
  let attrs = null;
  EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'editorImage' && !attrs) attrs = { layer: node.attrs.layer, left: node.attrs.left, top: node.attrs.top, pageIndex: node.attrs.pageIndex, pageLeftPt: node.attrs.pageLeftPt, pageTopPt: node.attrs.pageTopPt }; });
  return attrs;
});
const centerOf = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
}, sel);
// Ce que la souris toucherait vraiment en (x, y).
const hitAt = (x, y) => page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  return { onImage: !!el.closest('.editor-image-view'), onZone: !!el.closest('.v2-hf-zone'), margin: el.classList.contains('tiptap') || el.classList.contains('v2-page-sheet'), tag: el.className ? String(el.className).split(' ')[0] : el.tagName };
}, { x, y });

async function clickAt(x, y) { await page.mouse.move(x, y); await sleep(40); await page.mouse.down(); await sleep(40); await page.mouse.up(); await sleep(200); }
async function dragBy(from, dx, dy) {
  await page.mouse.move(from.x, from.y); await sleep(60);
  await page.mouse.down(); await sleep(60);
  const steps = 14;
  for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + dx * i / steps, from.y + dy * i / steps); await sleep(12); }
  await sleep(60);
  await page.mouse.up(); await sleep(300);
}
async function clickToolbar(action) {
  const c = await centerOf('.v2-floating-toolbar button[data-action="' + action + '"]');
  if (!c) return false;
  await clickAt(c.x, c.y);
  return true;
}
const editingZone = () => page.evaluate(() => { const m = HeaderFooterPreview.getHfMode(); return m ? m.zone : null; });
const imageSelected = () => page.evaluate(() => { const n = EditorCore.getEditor().state.selection.node; return !!n && n.type.name === 'editorImage'; });
async function leaveZone() {
  if (await editingZone()) { await page.evaluate(() => HeaderFooterPreview.exitHeaderFooterModeIfActive()); await sleep(250); }
}

// Document neuf : un en-tête et un pied de page remplis, un paragraphe, l'image (320 px de large, ratio 2:1) dans le texte, puis des lignes en dessous.
async function freshDocument() {
  await page.evaluate(() => {
    document.getElementById('editor-container').classList.add('a4-preview');
    PageLayout.setMarginsMm(null);
    Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED</p>', first: '' } });
    const c = document.createElement('canvas'); c.width = 320; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#1e88e5'; g.fillRect(0, 0, 320, 160); g.fillStyle = '#fdd835'; g.fillRect(160, 80, 160, 80);
    const src = c.toDataURL('image/png');
    const paras = Array.from({ length: 8 }, (_, i) => '<p>Ligne ' + i + ' du document, un peu de texte pour remplir la page.</p>').join('');
    Editor.setHTML('<p>Texte </p>' + paras);
    const ed = EditorCore.getEditor();
    ed.commands.setTextSelection(6);
    ed.commands.insertContent({ type: 'editorImage', attrs: { src, alt: '', width: '320px' } });
    Editor.refreshLayout();
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
  });
  await sleep(600);
}

async function corner(label, expectZoomBelowOne) {
  await freshDocument();
  await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
  await sleep(150);
  const g0 = await geometry();
  if (expectZoomBelowOne) check(label + ' : la feuille est réduite (facteur d\'ajustement < 1)', g0.zoom > 0.8 && g0.zoom < 0.9, g0.zoom);
  else check(label + ' : la feuille est à sa taille (facteur 1)', g0.zoom === 1, g0.zoom);
  // La place que les zones prennent dans la page : entre le bord de la feuille et le texte, la bande de 55 pt du PDF (73,3 px) en haut comme en bas ; la boîte de chaque
  // zone n'est que sa bande cliquable, posée sur la marge.
  const roomAbove = (g0.tiptap.top - g0.sheet.top) / g0.zoom, roomBelow = (g0.sheet.bottom - g0.tiptap.bottom) / g0.zoom;
  check(label + ' : la page réserve la bande de 55 pt (73,3 px de mise en page) au-dessus du texte, et la même au-dessous',
    near(roomAbove, 73.33, 1) && near(roomBelow, 73.33, 1), { haut: r2(roomAbove), bas: r2(roomBelow) });
  check(label + ' : la boîte de chaque zone est sa bande cliquable (moins que la marge et la bande ensemble : le reste de la marge garde le curseur)',
    !!g0.top && !!g0.bottom && g0.top.h / g0.zoom < 73.33 + 37.33 - 20 && g0.bottom.h / g0.zoom < 73.33 + 37.33 - 20, { haut: g0.top && r2(g0.top.h / g0.zoom), bas: g0.bottom && r2(g0.bottom.h / g0.zoom) });

  // 1) L'image dans le texte, un clic la sélectionne, « devant le texte ».
  await page.evaluate(() => document.querySelector('.tiptap .editor-image-view img').scrollIntoView({ block: 'center' }));
  await sleep(150);
  const c1 = await centerOf('.tiptap .editor-image-view img');
  await clickAt(c1.x, c1.y);
  check(label + ' : un clic sur l\'image la sélectionne', await imageSelected());
  check(label + ' : « devant le texte » est offert par la barre flottante', await clickToolbar('layer-front'));

  // 2) Glisser la poignée vers le haut et la gauche, bien au-delà du coin de la feuille : l'image s'arrête pile dans le coin.
  await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
  await sleep(200);
  const handle = await centerOf('.tiptap .editor-image-view .editor-image-move-handle');
  check(label + ' : la poignée de déplacement est là', !!handle, handle);
  const g1 = await geometry();
  await dragBy(handle, -(g1.image.left + 600), -(g1.image.top + 600));
  const g2 = await geometry();
  const attrs = await imageAttrs();
  check(label + ' : l\'image s\'arrête dans le coin haut gauche de la feuille (écart ≤ 1,5 px à l\'écran)',
    near(g2.image.left, g2.sheet.left) && near(g2.image.top, g2.sheet.top), { image: [r2(g2.image.left), r2(g2.image.top)], feuille: [r2(g2.sheet.left), r2(g2.sheet.top)] });
  check(label + ' : sa position de page vaut -(marge + bande) en haut et -marge à gauche (28 pt, 83 pt)', !!attrs && near(attrs.pageLeftPt, -28, 0.5) && near(attrs.pageTopPt, -83, 0.5), attrs);

  // 3) L'image recouvre la zone de l'en-tête : un clic sur elle la sélectionne, il n'ouvre pas l'en-tête.
  const gx = await geometry();
  const px = gx.image.left + gx.image.w / 2, py = gx.image.top + gx.image.h / 2;
  const hit = await hitAt(px, py);
  check(label + ' : au centre de l\'image, la souris touche l\'image (pas la zone de l\'en-tête)', !!hit && hit.onImage && !hit.onZone, hit);
  await page.evaluate(() => EditorCore.getEditor().commands.setTextSelection(1));
  await sleep(100);
  await clickAt(px, py);
  check(label + ' : un clic sur l\'image posée dans le coin la sélectionne', await imageSelected());
  check(label + ' : ce clic n\'ouvre ni l\'en-tête ni le pied de page', (await editingZone()) === null, await editingZone());

  // 4) La marge à vide ouvre l'en-tête : à droite de l'image, dans la bande ; puis le pied de page, au milieu de sa zone.
  const gt = await geometry();
  const tx = gt.sheet.right - 50 * gt.zoom, ty = gt.top.top + 36 * gt.zoom;
  const hitTop = await hitAt(tx, ty);
  check(label + ' : à droite de l\'image, la souris touche la marge de la feuille (pas un espaceur)', !!hitTop && hitTop.margin && !hitTop.onImage, hitTop);
  await page.mouse.move(tx, ty); await sleep(150);
  const lit = await page.evaluate(() => document.querySelector('#editor-container .v2-page-edge-top').classList.contains('v2-hf-zone-hover'));
  const cursor = await page.evaluate(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)).cursor, { x: tx, y: ty });
  check(label + ' : le survol de la marge allume la zone de l\'en-tête et donne le curseur main', lit && cursor === 'pointer', { allumee: lit, curseur: cursor });
  await clickAt(tx, ty);
  check(label + ' : un clic dans la marge à droite de l\'image ouvre l\'en-tête', (await editingZone()) === 'header', await editingZone());
  check(label + ' : la pastille d\'édition est là', await page.evaluate(() => !!document.getElementById('v2-hf-pill')));
  await leaveZone();

  await page.evaluate(() => document.querySelector('#editor-container .v2-page-edge-bottom').scrollIntoView({ block: 'center' }));
  await sleep(200);
  const gb = await geometry();
  const bx = (gb.sheet.left + gb.sheet.right) / 2, by = gb.bottom.top + gb.bottom.h / 2;
  const hitBottom = await hitAt(bx, by);
  check(label + ' : au milieu du pied de page, la souris touche la marge (pas un espaceur)', !!hitBottom && hitBottom.margin, hitBottom);
  await clickAt(bx, by);
  check(label + ' : un clic dans la zone du pied ouvre le pied de page', (await editingZone()) === 'footer', await editingZone());
  await leaveZone();
}

await corner('700x400', true);

// Témoin : panneau large, facteur 1.
await page.setViewportSize({ width: 1400, height: 1000 });
await sleep(900);
await corner('1400x1000', false);

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
