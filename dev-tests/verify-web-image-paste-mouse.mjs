#!/usr/bin/env node
// Les images d'une page web collée restent dans le document (relevé par l'étude de l'import HTML du 13/11 : « coller une page web fait disparaître les images »). Cause : copier une partie d'une
// page web ne met dans le presse-papiers que du HTML (`text/html` et `text/plain`, aucune image « fichier ») ; chaque photo y est une `<img src="https://…">`, et l'éditeur ne lisait que ses propres
// images (`img.editor-image`) : ProseMirror écartait les autres en silence (js/editor.js : `webImagesAsEditorImages`, appelé par `transformPastedHTML`).
// dev-tests/scenarios-web-image-paste.js (groupe « webImagePaste ») vérifie ce que le collage écrit avec des évènements `paste` synthétiques ; ici tout est vrai, comme chez la personne : une VRAIE page
// web servie par un AUTRE site (un second serveur, donc une autre origine : ses images sont « d'un autre site »), une VRAIE sélection à la souris (du titre au dernier paragraphe), le VRAI Ctrl+C
// (le HTML que Chromium écrit : styles recopiés sur chaque balise, adresses rendues absolues, largeur de la feuille de style devenue `style="width: 300px"`), puis dans le widget, à la taille du panneau
// Grist d'Antoine (~700x400), le VRAI Ctrl+V, d'abord tel que Chromium le rend, puis enveloppé comme Windows le rend (`<html><body><!--StartFragment-->…<!--EndFragment-->`) :
//   - le HTML qui arrive à l'éditeur porte bien les `<img>` de la page (le test ne passe pas faute d'avoir joué le cas) ;
//   - le document garde le texte et trois images, dans l'ordre : la photo (300 px, texte alternatif), la petite icône (20 px) et le dessin intégré (data URI, 40 px) ; le pixel espion de 1 px n'est pas collé ;
//   - le collage ne fait contacter aucun site : AUCUNE requête vers l'autre site tant qu'on n'a pas cliqué ; les images de l'autre site sont des cadres « Afficher » qui nomment le site, entiers dans le
//     panneau, que la souris atteint (le dessin intégré, lui, s'affiche tout de suite) ;
//   - un VRAI clic sur « Afficher » charge les images de ce site (la photo se peint à sa taille, son contour en tirets dit qu'elle vient d'un autre site) ;
//   - un seul Ctrl+Z défait le collage entier, Ctrl+Maj+Z le rend ;
//   - l'image « Copier l'image » (le clic droit : un fichier image dans le presse-papiers) se colle toujours comme avant, en data URI.
// Les captures (variable `WEB_IMAGE_PASTE_SHOTS` : un dossier) montrent le collage puis les images affichées.
// Lancé par run-headless.mjs (groupe Node « webImagePasteMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-web-image-paste-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.WEB_IMAGE_PASTE_MOUSE_PORT || 8964);
const SITE_PORT = Number(process.env.WEB_IMAGE_PASTE_SITE_PORT || 8965);
const SHOTS = process.env.WEB_IMAGE_PASTE_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-paste-variable-mouse.mjs.
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

// Un PNG fait main (aucune bibliothèque) : un dégradé, assez grand pour se voir sur une capture.
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
function png(width, height, colorAt) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const [r, g, b] = colorAt(x, y); const at = y * (width * 3 + 1) + 1 + x * 3; raw[at] = r; raw[at + 1] = g; raw[at + 2] = b; }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PHOTO = png(600, 400, (x, y) => [40 + Math.round(x / 6), 90 + Math.round(y / 4), 160 - Math.round(x / 8)]);
const ICON = png(40, 40, (x, y) => [200, 60 + y * 4, 60]);
const DRAWING = png(80, 40, (x) => [60, 160, 90 + x]);
const DRAWING_URI = 'data:image/png;base64,' + DRAWING.toString('base64');

// Le « site web » : une page d'article, ses images, et le compte des requêtes que le widget lui fait.
const siteRequests = [];
const site = createServer((req, res) => {
  const path = req.url.split('?')[0];
  siteRequests.push({ path, referer: req.headers.referer || '' });
  if (path === '/photo.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(PHOTO); return; }
  if (path === '/small.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(ICON); return; }
  if (path === '/pixel.gif') { res.writeHead(200, { 'Content-Type': 'image/gif' }); res.end(Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64')); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Actualités</title>
<style>body { font-family: serif; margin: 16px; font-size: 16px; max-width: 620px } .hero { width: 300px; border: 1px solid #888 } figcaption { color: #555; font-style: italic }</style></head>
<body><article>
<h1 id="start">Le chantier avance</h1>
<p>Un paragraphe avant la photo.</p>
<figure><img class="hero" src="/photo.png" alt="Une photo du chantier"><figcaption>La légende de la photo</figcaption></figure>
<p>Une icône <img src="/small.png" width="20" height="20" alt=""> au milieu du texte, un pixel espion <img src="/pixel.gif" width="1" height="1" alt="">, puis un dessin <img src="${DRAWING_URI}" width="40" alt="Un dessin intégré"> .</p>
<p id="end">Dernier paragraphe de l'article.</p>
</article></body></html>`);
});
await new Promise((ok, ko) => site.listen(SITE_PORT, '127.0.0.1', ok).on('error', ko));
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const SITE_HOST = `127.0.0.1:${SITE_PORT}`;

const esmMapPath = join(CACHE, 'esm-map.json');
const OFFLINE = existsSync(esmMapPath);
const esmMap = OFFLINE ? JSON.parse(readFileSync(esmMapPath, 'utf8')) : {};
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/vfs_fonts\.min\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
].filter(([, rel]) => rel !== 'umd/exceljs.min.js' || existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[verify-web-image-paste-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const pageErrors = [];
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const shot = (page, name) => SHOTS ? page.screenshot({ path: join(SHOTS, name + '.png') }) : Promise.resolve();

async function openWidget(context, colorScheme) {
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { d.accept().catch(() => {}); });
  if (OFFLINE) {
    await page.route('**://esm.sh/**', async route => {
      const url = route.request().url();
      const chunkFile = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
      if (chunkFile) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunkFile[1]), 'utf8')) });
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
  return page;
}

// Ce que Windows rend à `getData('text/html')` : le HTML copié, entouré des repères et de retours à la ligne.
async function wrapClipboardLikeWindows(page) {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    let html = null;
    for (const item of items) if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
    if (html == null) return null;
    const wrapped = '<html>\r\n<body>\r\n<!--StartFragment-->' + html.replace(/^<meta[^>]*>/i, '') + '<!--EndFragment-->\r\n</body>\r\n</html>';
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([wrapped], { type: 'text/html' }) }, { unsanitized: ['text/html'] })]);
    return wrapped;
  });
}

// Une vraie sélection à la souris : du début du titre à la fin du dernier paragraphe, puis le vrai Ctrl+C.
async function copyArticle(webPage) {
  const spots = await webPage.evaluate(() => {
    const first = document.getElementById('start').getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('end'));
    const rects = range.getClientRects();
    const last = rects[rects.length - 1];
    return { x1: first.left + 1, y1: first.top + first.height / 2, x2: last.right + 2, y2: last.top + last.height / 2 };
  });
  await webPage.mouse.move(spots.x1, spots.y1);
  await webPage.mouse.down();
  await webPage.mouse.move((spots.x1 + spots.x2) / 2, (spots.y1 + spots.y2) / 2, { steps: 6 });
  await webPage.mouse.move(spots.x2, spots.y2, { steps: 6 });
  await webPage.mouse.up();
  await webPage.keyboard.press('Control+C');
}

async function startDocument(page) {
  await page.evaluate(() => {
    GridEditor.setActive(false);
    Editor.setHTML('<p>Début du document</p>');
    window.__pasted = null;
    if (!window.__pasteListener) {
      window.__pasteListener = e => { window.__pasted = e.clipboardData.getData('text/html'); };
      document.addEventListener('paste', window.__pasteListener, true);
    }
    const box = document.getElementById('editor-container');
    box.scrollTop = 0; box.scrollLeft = 0;
  });
  await page.waitForTimeout(400);
  // Un vrai clic au bout du texte (à droite du paragraphe) pose le curseur à la fin de la ligne.
  const at = await page.evaluate(() => {
    const p = document.querySelector('.tiptap > p');
    const range = document.createRange();
    range.selectNodeContents(p);
    const rects = range.getClientRects();
    const last = rects[rects.length - 1] || p.getBoundingClientRect();
    return { x: last.right + 12, y: last.top + last.height / 2 };
  });
  await page.mouse.click(at.x, at.y);
}

const imagesOf = page => page.evaluate(() => {
  const found = [];
  EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'editorImage') found.push({ src: node.attrs.src.startsWith('data:') ? 'data:' : node.attrs.src, alt: node.attrs.alt, width: node.attrs.width }); });
  return found;
});
const textOf = page => page.evaluate(() => EditorCore.getEditor().state.doc.textContent);
const docJson = page => page.evaluate(() => JSON.stringify(EditorCore.getEditor().state.doc.toJSON()));

async function flow(label, how, { wrap }) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme: 'light' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  const web = await context.newPage();
  await web.setViewportSize({ width: WIDTH, height: 700 });
  await web.goto(SITE + '/article.html');
  await web.waitForLoadState('load');
  await copyArticle(web);
  const page = await openWidget(context);
  await page.bringToFront();
  const requestsFromWidget = () => siteRequests.filter(r => /^\/(photo|small|pixel)\./.test(r.path) && r.referer.startsWith(BASE)).length;

  if (wrap) {
    const wrapped = await wrapClipboardLikeWindows(page);
    check(`${label}, ${how} - le presse-papiers est réécrit comme Windows le rend (repères StartFragment)`, !!wrapped && /<!--StartFragment-->/.test(wrapped) && /<img/i.test(wrapped));
  }
  await startDocument(page);
  const before = await docJson(page);
  const widgetRequestsBefore = requestsFromWidget();
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(700);
  await shot(page, `${wrap ? '2' : '1'}-collage-${wrap ? 'windows' : 'chromium'}`);

  const arrived = await page.evaluate(() => window.__pasted);
  check(`${label}, ${how} - le HTML qui arrive à l'éditeur porte les images de la page`, !!arrived && (arrived.match(/<img\b/gi) || []).length === 4 && arrived.includes(SITE + '/photo.png') && (!wrap || /<!--StartFragment-->/.test(arrived)), arrived ? arrived.slice(0, 200) : arrived);

  const images = await imagesOf(page);
  const text = await textOf(page);
  check(`${label}, ${how} - le texte de l'article est là, après le début du document`, text.startsWith('Début du document') && /Le chantier avance/.test(text) && /La légende de la photo/.test(text) && /Dernier paragraphe de l'article\./.test(text), text);
  check(`${label}, ${how} - trois images, dans l'ordre : la photo (300 px), l'icône (20 px), le dessin intégré (40 px) ; le pixel espion n'est pas collé`,
    images.length === 3
      && images[0].src === SITE + '/photo.png' && images[0].alt === 'Une photo du chantier' && images[0].width === '300px'
      && images[1].src === SITE + '/small.png' && images[1].alt === '' && images[1].width === '20px'
      && images[2].src === 'data:' && images[2].alt === 'Un dessin intégré' && images[2].width === '40px', images);

  // Rien n'a contacté l'autre site : les cadres « Afficher » nomment le site, le dessin intégré est déjà peint.
  await page.waitForTimeout(400);
  check(`${label}, ${how} - le collage n'a fait aucune requête vers l'autre site (photo, icône, pixel)`, requestsFromWidget() === widgetRequestsBefore, siteRequests.slice(-6));
  const views = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .editor-image-view')).map(view => {
    const img = view.querySelector('img');
    return {
      blocked: view.classList.contains('editor-image-blocked'), site: view.dataset.blockedSite || '', src: img.getAttribute('src') ? (img.getAttribute('src').startsWith('data:') ? 'data:' : img.getAttribute('src')) : '',
      loaded: !!img.getAttribute('src') && img.complete && img.naturalWidth > 0, label: (view.querySelector('.editor-image-blocked-site') || {}).textContent || '', button: !!view.querySelector('.editor-image-reveal'),
    };
  }));
  check(`${label}, ${how} - la photo et l'icône sont des cadres masqués qui nomment l'autre site, sans adresse donnée au navigateur`,
    views.length === 3 && views[0].blocked && views[1].blocked && views[0].site === SITE_HOST && views[1].site === SITE_HOST && views[0].src === '' && views[1].src === '' && views[0].label === SITE_HOST && views[0].button, views);
  check(`${label}, ${how} - le dessin intégré (data URI) s'affiche tout de suite`, views.length === 3 && !views[2].blocked && views[2].loaded, views[2]);

  // Le bouton « Afficher » de la photo est entier dans le panneau 700x400 et la souris l'atteint (clic de Playwright : il refuse un bouton recouvert).
  const reveal = page.locator('.tiptap .editor-image-view.editor-image-blocked .editor-image-reveal').first();
  await reveal.scrollIntoViewIfNeeded().catch(() => {});
  const box = (await reveal.count()) ? await reveal.boundingBox() : null;
  check(`${label}, ${how} - le bouton « Afficher » est entier dans le panneau (${WIDTH}x${HEIGHT})`, !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= WIDTH && box.y + box.height <= HEIGHT, box);
  await shot(page, `${wrap ? '2' : '1'}-bouton-afficher`);
  const hits = !!box && await page.evaluate(([x, y]) => { const hit = document.elementFromPoint(x, y); return !!hit && !!hit.closest('.editor-image-reveal'); }, [box.x + box.width / 2, box.y + box.height / 2]);
  check(`${label}, ${how} - la souris atteint le bouton (rien ne le recouvre)`, hits);
  if (box) await reveal.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .editor-image-view')).map(view => {
    const img = view.querySelector('img');
    // La feuille est réduite dans un panneau de ~700 px (EditorCore.layoutZoom) : la largeur réglée est la largeur mesurée divisée par ce facteur.
    const rect = img.getBoundingClientRect();
    return { blocked: view.classList.contains('editor-image-blocked'), loaded: !!img.getAttribute('src') && img.complete && img.naturalWidth > 0, width: Math.round(rect.width / EditorCore.layoutZoom(view)), flagged: img.hasAttribute('data-external-site') };
  }));
  check(`${label}, ${how} - un vrai clic sur « Afficher » charge les images de ce site : la photo se peint à ses 300 px réglés, l'icône aussi (20 px)`,
    after.length === 3 && after[0].loaded && !after[0].blocked && after[1].loaded && !after[1].blocked && Math.abs(after[0].width - 300) <= 2 && Math.abs(after[1].width - 20) <= 1, after);
  check(`${label}, ${how} - c'est ce clic, et lui seul, qui a fait demander la photo à l'autre site`, requestsFromWidget() > widgetRequestsBefore && siteRequests.some(r => r.path === '/photo.png' && r.referer.startsWith(BASE)), siteRequests.slice(-6));
  check(`${label}, ${how} - une image affichée d'un autre site reste signalée (contour en tirets : data-external-site)`, !!(after[0] && after[0].flagged), after);
  const shown = page.locator('.tiptap .editor-image-view').first();
  await shown.scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, `${wrap ? '2' : '1'}-images-affichees`);

  // Un seul Ctrl+Z défait le collage entier ; Ctrl+Maj+Z le rend.
  const filled = await docJson(page);
  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(300);
  check(`${label}, ${how} - un seul Ctrl+Z défait le collage entier (texte et images)`, (await docJson(page)) === before, (await textOf(page)).slice(0, 80));
  await page.keyboard.press('Control+Shift+Z');
  await page.waitForTimeout(300);
  check(`${label}, ${how} - Ctrl+Maj+Z le rend, à l'identique`, (await docJson(page)) === filled);
  await context.close();
}

// « Copier l'image » (clic droit) : le presse-papiers porte un fichier image ; il se colle toujours en data URI, comme avant.
async function copyImageFlow() {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme: 'light' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await openWidget(context);
  await page.bringToFront();
  await page.evaluate(async (dataUri) => {
    const blob = await (await fetch(dataUri)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }, DRAWING_URI);
  await startDocument(page);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(700);
  const images = await imagesOf(page);
  check('« Copier l\'image » (un fichier image dans le presse-papiers) se colle toujours : une image, en data URI', images.length === 1 && images[0].src === 'data:', images);
  await context.close();
}

await flow('clair', 'tel que Chromium le copie', { wrap: false });
await flow('clair', 'enveloppé comme Windows', { wrap: true });
await copyImageFlow();

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors.slice(0, 3));
await browser.close();
server.close();
site.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
