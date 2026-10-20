#!/usr/bin/env node
// En-tête et pied de page « souples » (js/header-footer-preview.js:refreshZoneOverflow, js/main-toolbar.js, js/floating-toolbars.js, css/editor-v2.css), à la taille du panneau Grist
// d'Antoine (~700x400), à la VRAIE souris (page.mouse) et au VRAI clavier (frappe, Entrée, Tab, Retour arrière, Ctrl+V, Ctrl+Z), en clair, en sombre et en anglais. La demande du 20/10 :
// « il faut qu'il retrouve de la souplesse, mais sans que jamais ça ne vienne décaller le reste du texte de la page » - une zone garde sa taille (60 px de contenu), l'éditeur ne refuse
// plus rien et dit ce qui dépasse. Ce que scenarios-headerfooter.js ne peut pas voir depuis la page :
//  - une image de n'importe quelle taille, collée avec le VRAI presse-papiers de Chromium et un vrai Ctrl+V, entre dans la zone sans être refusée ni rognée ; une bannière qui tient dans la
//    bande ne dit rien ; une image qui la dépasse se dit : trait rouge en tirets et fond rouge pâle PEINTS (relus aux pixels d'une capture) à la limite, note « L’en-tête dépasse de N mm… »
//    et bouton « Réduire l’image » dans le panneau, au premier plan, lisibles (contraste ≥ 4,5:1), sans recouvrir « Terminer » ;
//  - « Réduire l’image » à la souris : l'image tient dans la bande, ses proportions sont gardées, le trait et la note partent, le clavier reste dans la zone ; un seul Ctrl+Z rend l'image ;
//  - des lignes tapées avec Entrée ne sont jamais refusées (pied de page) : la note vient avec la quatrième ligne et part quand on efface la ligne de trop ;
//  - le bouton Tableau de la barre pose un tableau d'UNE ligne dans la zone (qui ne dépasse pas), la barre flottante du tableau ne recouvre pas « Terminer », la bande fermée et la Lecture
//    montrent le même quadrillage ;
//  - le texte de la page ne bouge pas : son premier mot est au même endroit avec un en-tête d'une ligne, d'une image énorme et d'un tableau (zone fermée) ;
//  - l'interface en anglais.
// Lancé par run-headless.mjs (groupe Node "headerFooterFlexMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-header-footer-flex-mouse.mjs
// HF_FLEX_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.HF_FLEX_MOUSE_PORT || 9088);
const SHOTS = process.env.HF_FLEX_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-header-footer-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-header-footer-flex-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
// Le VRAI presse-papiers de Chromium : le Ctrl+V colle ce que navigator.clipboard.write y a posé, comme une image copiée dans une autre application.
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });
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

async function waitReady() {
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
}
await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await waitReady();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };

// --- Ce que la souris voit ---
const centerOf = selector => page.evaluate(sel => {
  const r = document.querySelector(sel).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, selector);
// L'élément tel que la souris le voit : visible dans le panneau et au premier plan (rien d'autre n'est dessus à son centre).
const hit = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    found: true, hidden: !!el.hidden, w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom),
    inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)),
  };
}, selector);
const seen = box => box.found && !box.hidden && box.inPanel && box.onTop;
const textOf = selector => page.evaluate(sel => { const el = document.querySelector(sel); return el ? el.textContent : null; }, selector);
// Rapport de contraste WCAG du texte d'un élément sur son fond réel (les fonds transparents des ancêtres sont composés jusqu'au premier opaque).
const contrastOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(s => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const layers = [];
  for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
  let base = { r: 255, g: 255, b: 255, a: 1 };
  for (const c of layers.reverse()) base = mix(c, base);
  let fg = parse(getComputedStyle(el).color);
  if (fg.a < 1) fg = mix(fg, base);
  const a = lum(fg), b = lum(base);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}, selector);

// Les pixels réellement peints sur une ligne de `width` px (une capture de 1 px de haut, relue sans bibliothèque : une seule ligne de pixels, un filtre PNG à défaire au plus).
async function rowPixels(x, y, width) {
  const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width, height: 1 } });
  const bpp = png[25] === 6 ? 4 : 3;
  const idat = [];
  for (let off = 8; off < png.length;) {
    const len = png.readUInt32BE(off);
    if (png.toString('ascii', off + 4, off + 8) === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const out = [];
  for (let i = 0; i < width * bpp; i++) {
    const left = i >= bpp ? out[i - bpp] : 0;
    out.push((raw[1 + i] + (raw[0] === 1 || raw[0] === 4 ? left : raw[0] === 3 ? left >> 1 : 0)) & 255);
  }
  return Array.from({ length: width }, (_, p) => [out[p * bpp], out[p * bpp + 1], out[p * bpp + 2]]);
}
const isRed = ([r, g, b]) => r >= 150 && g <= 100 && b <= 100;
// Le trait de la limite, tel qu'il est PEINT : sur une des lignes de pixels voisines de la limite attendue (`.tiptap` + remplissage haut + 60 px de contenu, à l'échelle de la feuille),
// des tirets rouges sur le quart au moins de la largeur de la zone. Rend aussi ce que la zone peint juste sous le trait et juste au-dessus, au bord droit de la zone (loin de l'image).
async function limitPaint() {
  const g = await page.evaluate(() => {
    const tip = EditorCore.getEditor().view.dom;
    const zoom = EditorCore.layoutZoom(tip);
    const r = tip.getBoundingClientRect();
    const limit = (parseFloat(getComputedStyle(tip).paddingTop) || 0) + PageLayout.HEADER_FOOTER_ZONE_PX;
    return { left: r.left, width: r.width, y: r.top + limit * zoom, right: Math.min(r.right, innerWidth - 2) };
  });
  const width = Math.max(40, Math.min(Math.floor(g.width) - 24, Math.floor(WIDTH - g.left - 14), 400));
  let lineAt = null;
  if (g.y >= 4 && g.y <= HEIGHT - 4) {
    for (let dy = -3; dy <= 3 && lineAt === null; dy++) {
      const pixels = await rowPixels(g.left + 12, g.y + dy, width);
      if (pixels.filter(isRed).length / width >= 0.25) lineAt = Math.round((g.y + dy) * 10) / 10;
    }
  }
  let below = null, above = null;
  if (lineAt !== null) {
    const x = g.right - 8;
    below = (await rowPixels(x, lineAt + 14, 1))[0];
    above = (await rowPixels(x, lineAt - 6, 1))[0];
  }
  return { expectedY: Math.round(g.y * 10) / 10, lineAt, below, above };
}
// Le rouge pâle sous le trait : rgba(197, 48, 48, .09) sur le blanc du papier, soit environ (250, 236, 236).
const isTint = ([r, g, b]) => r >= 244 && r <= 253 && g >= 228 && g <= 244 && b >= 228 && b <= 244;
const isPaper = ([r, g, b]) => r >= 252 && g >= 252 && b >= 252;

// --- Ce que la zone ouverte dit d'elle-même ---
const zoneState = () => page.evaluate(() => {
  const container = document.getElementById('editor-container');
  const note = document.getElementById('v2-hf-overflow');
  const noteShown = !!note && !note.hidden;
  const button = noteShown ? note.querySelector('.v2-hf-overflow-btn') : null;
  const tip = EditorCore.getEditor().view.dom;
  const zoom = EditorCore.layoutZoom(tip);
  const img = tip.querySelector('img.editor-image');
  const r = img ? img.getBoundingClientRect() : null;
  return {
    over: container.classList.contains('hf-over'), noteShown, text: noteShown ? note.querySelector('.v2-hf-overflow-text').textContent : null,
    button: button && !button.hidden ? button.textContent : null,
    images: tip.querySelectorAll('img.editor-image').length,
    img: r ? { w: Math.round(r.width / zoom), h: Math.round(r.height / zoom), style: img.getAttribute('style') } : null,
  };
});
const mmOf = state => { const m = /(\d+) mm/.exec(state.text || ''); return m ? Number(m[1]) : null; };
const html = () => page.evaluate(() => Editor.getHTML());

// --- Gestes ---
const EMPTY = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
const setHeaderFooter = (header, footer) => page.evaluate(({ header, footer }) => Editor.setHeaderFooterData({ enabled: !!(header || footer), differentFirstPage: false, header: { default: header || '', first: '' }, footer: { default: footer || '', first: '' } }), { header, footer });
async function setDoc(doc) {
  await page.evaluate(d => { Editor.setHTML(d); }, doc);
  await sleep(250);
}
// Le clic réel dans la marge d'une zone ouvre cette zone (js/header-footer-preview.js:zoneUnderPointer) ; on vérifie que c'est bien elle qui est en édition.
async function openZoneByMouse(pos) {
  const sel = '#editor-container .v2-page-edge-' + pos;
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  await sleep(250);
  const c = await centerOf(sel);
  await page.mouse.move(c.x, c.y);
  await sleep(80);
  await page.mouse.click(c.x, c.y);
  await sleep(450);
  return page.evaluate(zone => Editor.isEditingHeaderFooter() && !!document.getElementById('v2-hf-pill') && document.querySelector('#v2-hf-zone-segment button.active').dataset.zone === zone, pos === 'top' ? 'header' : 'footer');
}
async function clickCenter(selector) {
  const c = await centerOf(selector);
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await sleep(60);
  await page.mouse.click(c.x, c.y);
  await sleep(350);
}
// « Terminer » à la souris ; rend vrai quand la zone est refermée et que la pastille a disparu.
async function clickDone() {
  await clickCenter('#v2-hf-btn-done');
  await sleep(250);
  return page.evaluate(() => !Editor.isEditingHeaderFooter() && !document.getElementById('v2-hf-pill'));
}
const caretInZone = async () => { await page.click('#editor-container .tiptap p >> nth=0'); await sleep(120); };
// Une image copiée dans une autre application : un PNG de `width` x `height` posé dans le vrai presse-papiers, puis un vrai Ctrl+V.
async function pastePng(width, height) {
  await page.evaluate(async ({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const g = canvas.getContext('2d');
    g.fillStyle = '#2f6fed'; g.fillRect(0, 0, width, height);
    const blob = await new Promise(ok => canvas.toBlob(ok, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }, { width, height });
  await page.keyboard.press('Control+V');
  await sleep(900);
}
// Le haut du premier mot du corps, depuis le haut de la feuille, en pixels de mise en page : ne bouge pas, quoi qu'on mette dans l'en-tête.
const bodyTop = () => page.evaluate(() => {
  const p = Array.from(document.querySelectorAll('#editor-container .tiptap p')).find(el => el.textContent === 'Corps du document');
  if (!p) return null;
  const sheet = document.querySelector('#editor-container .v2-page-sheet');
  return Math.round((p.getBoundingClientRect().top - sheet.getBoundingClientRect().top) / EditorCore.layoutZoom(p) * 10) / 10;
});
// La table et la ligne en cours, pour la Lecture (sans ligne, le widget n'affiche que sa notice de liaison).
async function seedRecord() {
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    const row = { id: 1, Nom: 'Atelier Durand' };
    stub.setVariables('FlexClients', { Nom: 'Text' });
    stub.setRows('FlexClients', [row]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, row), 'FlexClients');
  });
  await sleep(200);
}

// Le parcours d'un thème : en-tête (bannière, grande image, Réduire, Ctrl+Z), texte de la page immobile, tableau, pied de page au clavier.
async function run(T) {
  await setDoc('<p>Corps du document</p>');
  await setHeaderFooter('<p>Une ligne</p>', '');
  await sleep(400);
  const referenceTop = await bodyTop();
  await setHeaderFooter('', '');
  await sleep(300);

  // 1. Une bannière large collée : elle tient dans la bande, la zone ne dit rien.
  check(`${T}, en-tête : un clic réel dans la marge du haut ouvre l'en-tête`, await openZoneByMouse('top'));
  await caretInZone();
  await pastePng(3000, 200);
  let state = await zoneState();
  let paint = await limitPaint();
  check(`${T}, en-tête : une bannière de 3000 x 200 collée au vrai Ctrl+V entre à 320 px de large (21 px de haut), ni refusée ni rognée, et la zone ne dit rien (ni note, ni trait rouge)`,
    state.images === 1 && !!state.img && state.img.w === 320 && state.img.h <= 60 && !state.over && !state.noteShown && paint.lineAt === null, { state, paint });
  await page.keyboard.press('Control+Z');
  await sleep(350);
  check(`${T}, en-tête : un Ctrl+Z retire la bannière`, (await zoneState()).images === 0);

  // 2. Une grande image : elle entre aussi, et la zone dit qu'elle dépasse.
  await pastePng(1200, 800);
  state = await zoneState();
  paint = await limitPaint();
  const noteBox = await hit('#v2-hf-overflow'), buttonBox = await hit('#v2-hf-overflow .v2-hf-overflow-btn'), doneBox = await hit('#v2-hf-btn-done');
  const noteContrast = await contrastOf('#v2-hf-overflow .v2-hf-overflow-text'), buttonContrast = await contrastOf('#v2-hf-overflow .v2-hf-overflow-btn');
  check(`${T}, en-tête : une image de 1200 x 800 collée entre à 320 px de large (240 px de haut), ni refusée ni rognée`, state.images === 1 && !!state.img && state.img.w === 320 && state.img.h > 200 && /width: 320px/.test(state.img.style || ''), state);
  check(`${T}, en-tête : la zone dit qu'elle dépasse - « L’en-tête dépasse de N mm… » (N ≈ 43), « Réduire l’image » - dans le panneau, au premier plan, lisibles (contraste ≥ 4,5:1)`,
    state.over && state.noteShown && /^L’en-tête dépasse de \d+ mm/.test(state.text || '') && mmOf(state) >= 35 && mmOf(state) <= 50 && state.button === 'Réduire l’image'
    && seen(noteBox) && seen(buttonBox) && noteContrast >= 4.5 && buttonContrast >= 4.5, { text: state.text, button: state.button, noteBox, buttonBox, noteContrast, buttonContrast });
  check(`${T}, en-tête : le trait rouge en tirets et le fond rouge pâle dessous sont peints à la limite de la bande (60 px de contenu), le papier reste blanc au-dessus`,
    paint.lineAt !== null && !!paint.below && !!paint.above && isTint(paint.below) && isPaper(paint.above), paint);
  check(`${T}, en-tête : « Terminer » reste visible et au premier plan (la note ne le recouvre pas)`, seen(doneBox), doneBox);
  await snap(`${T}-1-grande-image`);

  // 3. « Réduire l'image » à la souris, un seul Ctrl+Z pour l'annuler, puis de nouveau « Réduire ».
  await clickCenter('#v2-hf-overflow .v2-hf-overflow-btn');
  await sleep(300);
  state = await zoneState();
  paint = await limitPaint();
  check(`${T}, en-tête : « Réduire l’image » à la souris : l'image tient dans la bande (60 px de haut au plus), garde ses proportions 3:2 (largeur ≈ 3/2 de la hauteur), la note, le trait et le fond partent`,
    !!state.img && state.img.h <= 60 && state.img.h >= 16 && Math.abs(state.img.w / state.img.h - 1.5) < 0.1 && !state.over && !state.noteShown && paint.lineAt === null, { state, paint });
  await page.keyboard.press('Control+Z');
  await sleep(450);
  state = await zoneState();
  check(`${T}, en-tête : un seul Ctrl+Z rend l'image telle qu'elle était (320 px de large) et la note revient`, !!state.img && state.img.w === 320 && state.over && state.noteShown, state);
  await clickCenter('#v2-hf-overflow .v2-hf-overflow-btn');
  await sleep(800);
  // Un clic sur l'image réduite la sélectionne : sa barre flottante s'ouvre sans recouvrir « Terminer » (elle passe sous l'image quand elle n'a pas la place au-dessus, sous la pastille).
  const imagePoint = await page.evaluate(() => { const r = EditorCore.getEditor().view.dom.querySelector('img.editor-image').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(imagePoint.x, imagePoint.y);
  await sleep(80);
  await page.mouse.click(imagePoint.x, imagePoint.y);
  await sleep(500);
  const imageBar = await page.evaluate(() => {
    const bar = Array.from(document.querySelectorAll('.v2-floating-toolbar.visible')).find(b => b.querySelector('[data-action="zoom-in"]'));
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right) };
  });
  const barDone = await hit('#v2-hf-btn-done');
  check(`${T}, en-tête : un clic sur l'image réduite ouvre sa barre flottante, qui ne recouvre pas « Terminer » (le bouton reste visible et au premier plan, la barre est sous la pastille)`, !!imageBar && seen(barDone) && imageBar.t >= barDone.b, { imageBar, barDone });
  await snap(`${T}-1b-barre-image`);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('X');
  await sleep(250);
  check(`${T}, en-tête : le clavier est resté dans la zone après « Réduire l’image » : la lettre tapée s'écrit après l'image`, /<img[^>]*>X<\/p>/.test(await html()), await html());
  await page.keyboard.press('Backspace');
  await sleep(200);
  check(`${T}, en-tête : « Terminer » à la souris referme la zone`, await clickDone());

  // 4. Le texte de la page n'a pas bougé : même place qu'avec un en-tête d'une ligne.
  const afterImage = await bodyTop();
  check(`${T}, page : le premier mot du corps est à la même place avec un en-tête d'une ligne et avec l'en-tête de la grande image réduite (${referenceTop} px de la feuille)`, referenceTop !== null && afterImage !== null && Math.abs(afterImage - referenceTop) < 0.5, { referenceTop, afterImage });

  // 5. Une grande image laissée entière, zone refermée : coupée à la bande, le corps ne bouge pas.
  await setHeaderFooter('', '');
  await sleep(300);
  await openZoneByMouse('top');
  await caretInZone();
  await pastePng(1200, 800);
  const closedOk = await clickDone();
  await page.evaluate(() => document.querySelector('#editor-container .v2-page-edge-top').scrollIntoView({ block: 'center' }));
  await sleep(250);
  const band = await page.evaluate(() => {
    const body = document.querySelector('#editor-container .v2-hf-zone-body');
    if (!body) return null;
    const zoom = EditorCore.layoutZoom(body);
    return { h: Math.round(body.getBoundingClientRect().height / zoom * 10) / 10, imgH: Math.round(body.querySelector('img').getBoundingClientRect().height / zoom), clip: getComputedStyle(body).overflow };
  });
  const tallTop = await bodyTop();
  check(`${T}, en-tête : la grande image gardée entière, zone refermée, est coupée à la bande (60 px, l'image en fait 240) et le premier mot du corps reste à la même place`,
    closedOk && !!band && band.h <= 60.5 && band.imgH > 200 && band.clip === 'hidden' && tallTop !== null && Math.abs(tallTop - referenceTop) < 0.5, { band, tallTop, referenceTop });
  await snap(`${T}-2-bande-coupee`);

  // 6. Le bouton Tableau de la barre : une seule ligne dans la zone, qui tient ; la barre du tableau ne recouvre pas « Terminer ».
  await setHeaderFooter('', '');
  await sleep(300);
  check(`${T}, en-tête : un clic réel dans la marge du haut ouvre l'en-tête (tableau)`, await openZoneByMouse('top'));
  await caretInZone();
  const tableButton = await hit('#v2-btn-table');
  const lockedTable = await page.evaluate(() => document.getElementById('v2-btn-table').classList.contains('v2-hf-locked'));
  check(`${T}, en-tête : le bouton Tableau de la barre est actif (pas grisé), dans le panneau et au premier plan`, seen(tableButton) && !lockedTable, { tableButton, lockedTable });
  await clickCenter('#v2-btn-table');
  await sleep(300);
  const cells = await page.evaluate(() => { const tip = EditorCore.getEditor().view.dom; return { rows: tip.querySelectorAll('tr').length, cols: tip.querySelectorAll('tr:first-child > td').length }; });
  check(`${T}, en-tête : un clic sur « Tableau » pose un tableau de UNE ligne et deux colonnes dans la zone, sans refus`, cells.rows === 1 && cells.cols === 2, cells);
  await page.keyboard.type('Société');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Adresse');
  await sleep(350);
  state = await zoneState();
  const tableDone = await hit('#v2-hf-btn-done');
  const barBox = await hit('.v2-table-toolbar.visible');
  check(`${T}, en-tête : le tableau saisi au clavier (Tab passe à la case suivante) tient dans la bande : ni note, ni trait rouge`, /<td[^>]*><p>Société<\/p><\/td><td[^>]*><p>Adresse<\/p><\/td>/.test(await html()) && !state.over && !state.noteShown, { state, html: await html() });
  check(`${T}, en-tête : la barre flottante du tableau ne recouvre pas « Terminer » (elle passe sous le tableau) : le bouton est visible et au premier plan`, seen(tableDone) && barBox.found && barBox.t >= tableDone.b, { tableDone, barBox });
  await snap(`${T}-3-tableau`);
  const openHeights = await page.evaluate(() => { const tip = EditorCore.getEditor().view.dom; const zoom = EditorCore.layoutZoom(tip); const t = tip.querySelector('table'); const td = tip.querySelector('td'); const cs = getComputedStyle(td); return { table: Math.round(t.getBoundingClientRect().height / zoom * 10) / 10, border: cs.borderTopStyle, padding: cs.paddingTop + ' ' + cs.paddingLeft }; });
  check(`${T}, en-tête : « Terminer » à la souris referme la zone avec le tableau`, await clickDone());
  await page.evaluate(() => document.querySelector('#editor-container .v2-page-edge-top').scrollIntoView({ block: 'center' }));
  await sleep(250);
  const closedTable = await page.evaluate(() => {
    const body = document.querySelector('#editor-container .v2-hf-zone-body');
    const zoom = EditorCore.layoutZoom(body);
    const t = body && body.querySelector('table');
    if (!t) return null;
    const td = t.querySelector('td'); const cs = getComputedStyle(td);
    return { table: Math.round(t.getBoundingClientRect().height / zoom * 10) / 10, rows: t.querySelectorAll('tr').length, border: cs.borderTopStyle, padding: cs.paddingTop + ' ' + cs.paddingLeft, text: body.textContent };
  });
  check(`${T}, en-tête : la bande fermée montre le tableau avec le même quadrillage et la même hauteur qu'ouvert (une ligne, cases bordées)`, !!closedTable && closedTable.rows === 1 && closedTable.border === 'solid' && closedTable.padding === openHeights.padding && Math.abs(closedTable.table - openHeights.table) < 1 && closedTable.text === 'SociétéAdresse', { closedTable, openHeights });
  const tableTop = await bodyTop();
  check(`${T}, page : le premier mot du corps est à la même place avec un en-tête fait d'un tableau`, tableTop !== null && Math.abs(tableTop - referenceTop) < 0.5, { tableTop, referenceTop });
  await snap(`${T}-4-tableau-ferme`);

  // 7. La Lecture montre le même tableau, quadrillé.
  await page.click('#btn-mode-read');
  await page.waitForSelector('#reader-container .reader-content', { timeout: 10000 }).catch(() => {});
  await sleep(900);
  const reader = await page.evaluate(() => {
    const top = document.querySelector('#reader-container .v2-page-edge-top');
    const t = top && top.querySelector('table');
    if (!t) return null;
    const td = t.querySelector('td'); const cs = getComputedStyle(td);
    return { rows: t.querySelectorAll('tr').length, border: cs.borderTopStyle, padding: cs.paddingTop + ' ' + cs.paddingLeft, text: t.textContent, clip: !!top.querySelector('.v2-hf-clip') };
  });
  check(`${T}, Lecture : l'en-tête montre le tableau d'une ligne, cases bordées, dans l'enveloppe qui coupe à la bande`, !!reader && reader.rows === 1 && reader.border === 'solid' && reader.text === 'SociétéAdresse' && reader.clip, reader);
  await snap(`${T}-5-lecture`);
  await page.click('#btn-mode-edit');
  await sleep(700);

  // 8. Pied de page, au clavier seul : des lignes avec Entrée ne sont jamais refusées, la note vient avec la quatrième et part avec la ligne de trop.
  await setHeaderFooter('', '');
  await sleep(300);
  check(`${T}, pied : un clic réel dans la marge du bas ouvre le pied de page`, await openZoneByMouse('bottom'));
  await caretInZone();
  for (const line of ['Ligne 1', 'Ligne 2', 'Ligne 3']) { await page.keyboard.type(line); await page.keyboard.press('Enter'); }
  await sleep(300);
  const threeLines = await zoneState();
  await page.keyboard.type('Ligne 4');
  await sleep(300);
  state = await zoneState();
  const footerNote = await hit('#v2-hf-overflow');
  const footerContrast = await contrastOf('#v2-hf-overflow .v2-hf-overflow-text');
  check(`${T}, pied : trois lignes tapées avec Entrée tiennent (la ligne vide que laisse Entrée à la fin ne compte pas) ; la quatrième fait dépasser et la zone le dit : « Le pied de page dépasse de N mm… », dans le panneau, lisible (≥ 4,5:1), sans bouton (pas d'image)`,
    !threeLines.over && !threeLines.noteShown && state.over && state.noteShown && /^Le pied de page dépasse de \d+ mm/.test(state.text || '') && state.button === null && seen(footerNote) && footerContrast >= 4.5, { threeLines, state, footerNote, footerContrast });
  await snap(`${T}-6-pied`);
  for (let i = 0; i < 8; i++) await page.keyboard.press('Backspace');
  await sleep(300);
  state = await zoneState();
  check(`${T}, pied : Retour arrière sur la ligne de trop (8 frappes) : les trois lignes tiennent de nouveau, la note et le trait partent`, !state.over && !state.noteShown && (await html()).includes('Ligne 3') && !(await html()).includes('Ligne 4'), { state, html: await html() });
  check(`${T}, pied : « Terminer » à la souris referme le pied`, await clickDone());
  await setHeaderFooter('', '');
  await sleep(300);
}

await seedRecord();
await run('clair');
await page.evaluate(() => Settings.setTheme('dark'));
await sleep(250);
await run('sombre');
await page.evaluate(() => Settings.setTheme('light'));
await sleep(200);

// L'interface en anglais : la langue se change par un rechargement (storeLang, puis la page repart).
async function runEnglish() {
  await page.evaluate(() => I18n.storeLang('en'));
  await page.reload({ waitUntil: 'load' });
  await waitReady();
  await sleep(250);
  await setDoc('<p>Body text</p>');
  await setHeaderFooter('', '');
  await sleep(300);
  check('anglais, en-tête : un clic réel dans la marge du haut ouvre l\'en-tête', await openZoneByMouse('top'));
  await caretInZone();
  for (const line of ['Line 1', 'Line 2', 'Line 3', 'Line 4']) { await page.keyboard.type(line); if (line !== 'Line 4') await page.keyboard.press('Enter'); }
  await sleep(300);
  let state = await zoneState();
  let noteBox = await hit('#v2-hf-overflow');
  check('anglais, en-tête : quatre lignes tapées : la note dit « The header is N mm too tall: anything below the line will be cut when printed or exported. », dans le panneau',
    state.over && /^The header is \d+ mm too tall: anything below the line will be cut when printed or exported\.$/.test(state.text || '') && state.button === null && seen(noteBox), { state, noteBox });
  await page.keyboard.press('Control+Z');
  await sleep(300);
  await pastePng(1200, 800);
  state = await zoneState();
  noteBox = await hit('#v2-hf-overflow');
  const buttonBox = await hit('#v2-hf-overflow .v2-hf-overflow-btn');
  check('anglais, en-tête : avec une grande image, la note garde le bouton « Shrink the image », dans le panneau, au premier plan, sans recouvrir « Terminer »',
    state.over && state.button === 'Shrink the image' && seen(noteBox) && seen(buttonBox) && seen(await hit('#v2-hf-btn-done')), { state, noteBox, buttonBox });
  await snap('en-1-note');
  await clickCenter('#v2-hf-overflow .v2-hf-overflow-btn');
  await sleep(300);
  state = await zoneState();
  check('anglais, en-tête : « Shrink the image » à la souris : l\'image tient dans la bande, la note part', !!state.img && state.img.h <= 60 && !state.over && !state.noteShown, state);
  await clickDone();
  await setHeaderFooter('', '');
  await page.evaluate(() => I18n.storeLang('fr'));
}
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
