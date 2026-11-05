// Socle commun des captures du README public : le VRAI widget (index.html du dépôt) avec le faux Grist de dev-tests/ (grist-stub.js) et le miroir hors-ligne des bibliothèques
// (dev-tests/.offline-cache/, construit par dev-tests/offline-deps.sh). Rien n'est dessiné à la main. Rien n'est écrit dans le dépôt : la page de harnais est servie à la volée.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { createRequire } from 'node:module';

export const ROOT = resolve(process.env.REPO_DIR || new URL('../../../', import.meta.url).pathname);
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
export const OUT = resolve(process.env.OUT_DIR || new URL('./out', import.meta.url).pathname);
mkdirSync(OUT, { recursive: true });
export const FONT_UI = "Roboto, 'Helvetica Neue', Arial, sans-serif";
export const NOW = new Date('2026-11-04T09:00:00+01:00');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const harness = readFileSync(join(ROOT, 'index.html'), 'utf8').replace('<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>', '<script src="dev-tests/grist-stub.js"></script>');
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/_capture.html') { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); res.end(harness); return; }
    const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(target));
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok, ko) => server.listen(0, '127.0.0.1', ok).on('error', ko));
export const BASE = `http://127.0.0.1:${server.address().port}`;

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/qrcode\.min\.js$/, 'umd/qrcode.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/marked\/[\d.]+\/marked\.min\.js$/, 'umd/marked.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  ...(existsSync(join(CACHE, 'umd/echarts.min.js')) ? [[/^https:\/\/cdn\.jsdelivr\.net\/npm\/echarts@[\d.]+\/dist\/echarts\.min\.js$/, 'umd/echarts.min.js']] : []),
] : [];
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = (code) => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

export const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
export const problems = [];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Un exemplaire du widget. `seed` : du JS exécuté avant le démarrage, `stub` = le faux Grist. `hosted` : GFS simulé (gfs-stub.js), `extensions` : celles qu'il dit actives.
export async function openWidget({ width = 1000, height = 620, scale = 2, theme = 'light', lang = 'fr', seed = '', hosted = false, extensions = [], images = {}, now = NOW, query = '' } = {}) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width, height }, deviceScaleFactor: scale, colorScheme: theme, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => { problems.push('pageerror : ' + e.message); console.log('[pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { problems.push('console.error : ' + m.text()); console.log('[console.error]', m.text().slice(0, 200)); } });
  page.on('dialog', async (d) => { problems.push('boîte native (' + d.type() + ') : ' + d.message()); await d.dismiss(); });
  if (OFFLINE) {
    await page.route('**://esm.sh/**', async (route) => {
      const url = route.request().url();
      const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
      if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
      const spec = Object.keys(esmMap).find((k) => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
      if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
      route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
    });
    for (const [re, rel] of UMD_ROUTES) {
      await page.route(re, async (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: await readFile(join(CACHE, rel), 'utf8') }));
    }
    await page.addInitScript(() => { Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} }); });
  }
  await page.route('**://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**://fonts.gstatic.com/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route('**://docs.getgrist.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**/attachments/*/download*', async (route) => {
    const id = (route.request().url().match(/attachments\/(\d+)\/download/) || [])[1];
    const body = images[id];
    if (!body) return route.fulfill({ status: 404, body: 'pas de pièce jointe ' + id });
    route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body });
  });
  await page.addInitScript(([t, l]) => { try { localStorage.setItem('pp_theme', t); localStorage.setItem('pp_lang', l); } catch (e) { /* stockage refusé */ } }, [theme, lang]);
  if (now) await page.clock.setFixedTime(now);
  if (seed) await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${seed} };`);
  if (hosted) {
    await page.addInitScript({ path: join(ROOT, 'dev-tests', 'gfs-stub.js') });
    await page.addInitScript((list) => { window.__gfsStub.extensions = list; }, extensions);
  }
  await page.goto(`${BASE}/_capture.html?${[hosted ? 'gfs=0' : '', query].filter(Boolean).join('&')}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  await page.evaluate((f) => document.documentElement.style.setProperty('--font-ui', f), FONT_UI);
  await sleep(300);
  return { context, page };
}

export const rectOf = (page, sel, scroll = false) => page.evaluate(([s, sc]) => {
  const e = document.querySelector(s); if (!e) return null;
  if (sc) e.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
}, [sel, scroll]);
// Clic à la vraie souris : approche en deux temps, comme une main.
export async function click(page, sel, wait = 300, scroll = true) {
  const c = await rectOf(page, sel, scroll);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 14, c.y - 6, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 }); await sleep(80);
  await page.mouse.click(c.x, c.y); await sleep(wait);
  return c;
}
// Survol d'un bouton à menu, descente lente vers la ligne, puis clic (le menu reste ouvert tout du long).
export async function clickMenuRow(page, buttonSel, rowSel, wait = 600) {
  const from = await rectOf(page, buttonSel);
  if (!from) throw new Error('bouton introuvable : ' + buttonSel);
  await page.mouse.move(from.x - 14, from.y - 6, { steps: 2 }); await page.mouse.move(from.x, from.y, { steps: 4 }); await sleep(300);
  const to = await rectOf(page, rowSel);
  if (!to) throw new Error('ligne de menu introuvable : ' + rowSel);
  await page.mouse.move(from.x, to.y, { steps: 12 }); await page.mouse.move(to.x, to.y, { steps: 4 }); await sleep(150);
  await page.mouse.click(to.x, to.y); await sleep(wait);
}
// Survol seul (le menu reste ouvert) : la souris va au bouton puis descend vers la ligne, sans cliquer.
export async function hoverMenuRow(page, buttonSel, rowSel, wait = 400) {
  const from = await rectOf(page, buttonSel);
  if (!from) throw new Error('bouton introuvable : ' + buttonSel);
  await page.mouse.move(from.x - 14, from.y - 6, { steps: 2 }); await page.mouse.move(from.x, from.y, { steps: 4 }); await sleep(400);
  if (rowSel) {
    const to = await rectOf(page, rowSel);
    if (!to) throw new Error('ligne de menu introuvable : ' + rowSel);
    await page.mouse.move(from.x, to.y, { steps: 12 }); await page.mouse.move(to.x, to.y, { steps: 4 });
  }
  await sleep(wait);
}
export async function shot(page, name, opts = {}) {
  const path = join(OUT, name + '.png');
  await page.screenshot({ path, ...opts });
  console.log('capture : ' + path);
  return path;
}
export async function done() { await browser.close(); server.close(); if (problems.length) console.log('Erreurs de page :\n' + problems.join('\n')); }

// Un modèle enregistré et ouvert par défaut, semé avant le démarrage du widget : la barre d'outils montre son nom, pas « Nouveau modèle ».
export function seedModel({ name, html, header = '', margins = '', dateModif = 1793700000 }) {
  return `const m = stub.state.rows.Publipostage_Modeles; m.id.push(1); m.Nom.push(${JSON.stringify(name)}); m.Contenu.push(${JSON.stringify(html)});
    m.NomFichierPDF.push(''); m.HeaderFooter.push(${JSON.stringify(header)}); m.DateModif.push(${dateModif}); m.Margins.push(${JSON.stringify(margins)}); m.EstParDefaut.push(true);
    stub.state.nextRowId.Publipostage_Modeles = 2;`;
}
// Le coin d'état au repos, la souris dans la marge, plus aucun focus : le décor d'une capture sans geste en cours.
export async function idle(page, x = 70, y = 600) {
  await page.evaluate(() => { const s = document.getElementById('status-msg'); if (s) { s.textContent = I18n.t('status.ready'); s.className = ''; } if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await page.mouse.move(x, y, { steps: 3 }); await sleep(400);
}
