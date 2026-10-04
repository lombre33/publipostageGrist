#!/usr/bin/env node
// Texte inséré et texte supprimé du suivi des modifications, à la vraie souris et au vrai clavier, à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis
// sombre. Demande d'Antoine du 01/10 (carte « Rendre lisibles les couleurs du texte inséré et supprimé du suivi ? », réponse « Aligner ») : le texte supprimé était en
// --danger sur --danger-soft (3,7:1 en clair) et, en sombre, une pastille foncée sur la page qui reste blanche ; le texte inséré (vert) touchait tout juste 4,5:1. Ils
// prennent les teintes d'une case de colonne suivie (css/track-changes.css), les mêmes dans les deux thèmes. Le script allume le suivi au bouton, tape et supprime au clavier,
// puis lit deux choses : les couleurs calculées (4,5:1 au moins) ET les pixels réellement peints (un fond de pastille foncé ne se voit pas dans une couleur calculée seule).
// Lancé par run-headless.mjs (groupe Node "trackTextColorsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-track-text-colors-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TRACK_TEXT_COLORS_PORT || 8921);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-table-undo-keyboard.mjs.
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
if (!OFFLINE) console.log('[verify-track-text-colors-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
// Une page neuve par thème : même panneau ~700x400, mêmes routes hors-ligne.
async function openPage(dark) {
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme: dark ? 'dark' : 'light' });
const page = await context.newPage();
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
// Aperçu A4, le réglage d'Antoine : c'est lui qui déclenche aussi la correction de largeur des tableaux trop larges pour la page.
await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });
return page;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const settle = () => sleep(600);

const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const contrast = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

let page;
// Le pixel réellement peint en (x, y) de la fenêtre : une capture de 1x1 px, relue sans bibliothèque (une seule ligne de pixels : tous les filtres PNG rendent les octets bruts).
async function pixelAt(x, y) {
  const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 } });
  const idat = [];
  for (let off = 8; off < png.length;) {
    const len = png.readUInt32BE(off);
    if (png.toString('ascii', off + 4, off + 8) === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3]];
}
const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const paint = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, color: cs.color, bg: cs.backgroundColor, deco: cs.textDecorationLine, text: el.textContent };
}, sel);
// La souris au bas du panneau : les menus de la barre d'outils s'ouvrent au survol et recouvriraient le texte visé.
const parkMouse = async () => { await page.mouse.move(WIDTH / 2, HEIGHT - 20); await sleep(350); };
// Le centre d'un mot du premier paragraphe, pour un double-clic à la vraie souris.
const centerOfWord = word => page.evaluate(w => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap p'), NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const i = n.textContent.indexOf(w);
    if (i < 0) continue;
    const range = document.createRange();
    range.setStart(n, i); range.setEnd(n, i + w.length);
    const r = range.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}, word);

const GREEN = [229, 246, 238];
const RED = [251, 233, 233];
const seen = {};

for (const dark of [false, true]) {
  const theme = dark ? 'sombre' : 'clair';
  page = await openPage(dark);
  console.log(`\n--- thème ${theme} ---`);
  await page.evaluate(() => { Editor.setTrackChanges(false); Editor.setHTML('<p>Texte à garder, un mot à retirer et la fin.</p>'); });
  await settle();

  // Le suivi s'allume au bouton de la barre (vraie souris) ; une frappe au clavier ajoute du texte, un double-clic puis Suppr retire un mot.
  await page.click('#v2-btn-track-changes');
  await sleep(250);
  check(`[${theme}] le bouton de suivi (vraie souris) allume le suivi`, await page.evaluate(() => Editor.isTrackChangesOn()));
  await parkMouse();
  await page.click('.tiptap p');
  await page.keyboard.press('End');
  await page.keyboard.type(' Ajout suivi.');
  await sleep(300);
  await parkMouse();
  const word = await centerOfWord('retirer');
  await page.mouse.dblclick(word.x, word.y);
  await sleep(200);
  await page.keyboard.press('Delete');
  await settle();
  // La sélection du mot supprimé reste peinte en bleu : le curseur passe en fin de ligne avant de lire les pixels.
  await page.keyboard.press('End');
  await sleep(200);
  await parkMouse();

  const ins = await paint('.tiptap ins[data-id]');
  const del = await paint('.tiptap del[data-id]');
  check(`[${theme}] le texte tapé est une insertion en attente, le mot supprimé une suppression gardée dans le texte`,
    !!ins && !!del && /Ajout suivi\./.test(ins.text) && /retirer/.test(del.text), { ins: ins && ins.text, del: del && del.text });
  if (ins && del) {
    check(`[${theme}] texte inséré : vert sur vert pâle, 4,5:1 au moins`, ins.bg === 'rgb(229, 246, 238)' && contrast(ins.color, ins.bg) >= 4.5, { color: ins.color, bg: ins.bg, ratio: contrast(ins.color, ins.bg) });
    check(`[${theme}] texte supprimé : rouge barré sur rouge pâle, 4,5:1 au moins`,
      del.bg === 'rgb(251, 233, 233)' && del.deco.includes('line-through') && contrast(del.color, del.bg) >= 4.5, { color: del.color, bg: del.bg, deco: del.deco, ratio: contrast(del.color, del.bg) });
    // Les pixels : le coin haut gauche de chaque marque porte la teinte (pas de pastille foncée), la page autour reste blanche.
    const insPx = await pixelAt(ins.left + 1, ins.top + 1);
    const delPx = await pixelAt(del.left + 1, del.top + 1);
    const pagePx = await pixelAt(await page.evaluate(() => document.querySelector('.tiptap').getBoundingClientRect().left + 3), del.top + 1);
    check(`[${theme}] pixels peints : texte inséré sur vert pâle, texte supprimé sur rouge pâle, page blanche`,
      near(insPx, GREEN) && near(delPx, RED) && near(pagePx, [255, 255, 255]), { insPx, delPx, pagePx });
    seen[theme] = { ins: ins.color + '/' + ins.bg, del: del.color + '/' + del.bg, insPx: insPx.join(','), delPx: delPx.join(',') };
  }

  // Tout accepter garde le texte tapé sans marque et retire le mot supprimé ; la couleur n'est plus que celle du texte courant.
  await page.click('#v2-btn-accept-all');
  await settle();
  const accepted = await page.evaluate(() => ({ html: Editor.getHTML(), pending: Editor.hasPendingTrackedChanges(), text: document.querySelector('.tiptap p').textContent }));
  check(`[${theme}] « Tout accepter » (vraie souris) : le texte tapé reste, le mot supprimé part, plus aucune marque`,
    !accepted.pending && !/<ins|<del/.test(accepted.html) && /Ajout suivi\./.test(accepted.text) && !/retirer/.test(accepted.text), accepted);
  await page.evaluate(() => Editor.setTrackChanges(false));
  await page.context().close();
}

check('les mêmes couleurs et les mêmes pixels en clair et en sombre', JSON.stringify(seen.clair) === JSON.stringify(seen.sombre), seen);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
