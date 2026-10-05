// Bibliothèque du banc de charge (dev-tests/load-tests.mjs) : ouvre le VRAI widget (index.html servi tel quel) dans Chromium à la taille du panneau d'Antoine (700x400), avec le faux Grist
// de dev-tests/grist-stub.js, un document en volume fabriqué avant l'init (dev-tests/load-doc.js, description posée dans window.__LOAD_SPEC), le miroir hors ligne des CDN
// (dev-tests/.offline-cache, voir offline-deps.sh) et des compteurs de ce que le widget lit et écrit. Rien n'est écrit dans le dépôt : la page de test est servie à la volée.
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
export const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

let server = null;
let BASE = null;
async function startServer(port) {
  if (server) return BASE;
  const indexHtml = await readFile(join(ROOT, 'index.html'), 'utf8');
  const harness = indexHtml.replace('<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>', '<script src="dev-tests/grist-stub.js"></script>');
  server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/_load.html') { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); res.end(harness); return; }
      const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
      if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const info = await stat(filePath);
      const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
      res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(target));
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise((ok, ko) => server.listen(port, '127.0.0.1', ok).on('error', ko));
  BASE = `http://127.0.0.1:${port}`;
  return BASE;
}
export async function stopServer() { if (server) { await new Promise(r => server.close(r)); server = null; } }

const OFFLINE = existsSync(join(CACHE, 'esm-map.json'));
if (!OFFLINE) throw new Error('miroir hors ligne absent : bash dev-tests/offline-deps.sh');
const esmMap = JSON.parse(readFileSync(join(CACHE, 'esm-map.json'), 'utf8'));
const UMD_ROUTES = [
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/vfs_fonts\.min\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/qrcode\.min\.js$/, 'umd/qrcode.min.js'],
].filter(([, rel]) => existsSync(join(CACHE, rel)));
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');

// open({ spec, width, height, port, theme, lang }) -> { page, errors, stats(), resetStats(), ready, close }
//   spec : la description du document (voir dev-tests/load-doc.js). `ready` : millisecondes depuis le début de la navigation jusqu'à « Widget prêt. ».
//   onPage(page, context) : appelé dès que la page existe, avant sa première navigation (pour écouter les requêtes du chargement, par exemple).
export async function open({ spec = {}, width = 700, height = 400, port = Number(process.env.LOAD_PORT || 8971), theme = 'light', lang = 'fr', acceptDownloads = true, settleMs = 2500, onPage = null } = {}) {
  const base = await startServer(port);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const context = await browser.newContext({ bypassCSP: true, viewport: { width, height }, colorScheme: theme === 'dark' ? 'dark' : 'light', acceptDownloads });
  const page = await context.newPage();
  if (onPage) await onPage(page, context);
  const errors = [];
  const dialogs = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('dialog', async d => { dialogs.push({ type: d.type(), message: d.message() }); await d.accept(d.type() === 'prompt' ? 'Test' : undefined); });
  await page.route('**://esm.sh/**', async route => {
    const url = route.request().url();
    const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
    if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
    const found = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
    if (!found) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[found].replace(/^\//, '')), 'utf8')) });
  });
  for (const [re, rel] of UMD_ROUTES) {
    await page.route(re, async route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: await readFile(join(CACHE, rel), 'utf8') }));
  }
  // Le hash SRI de js/pdf-export.js ne peut pas être satisfait par un miroir local (comme dans dev-tests/run-headless.mjs) : neutralisé ici seulement.
  await page.addInitScript(() => { Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} }); });
  await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
  await page.route('**://docs.getgrist.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.addInitScript(({ theme, lang }) => {
    try { localStorage.setItem('pp_theme', theme); localStorage.setItem('pp_lang', lang); } catch (e) { /* stockage refusé : réglages par défaut */ }
  }, { theme, lang });
  await page.addInitScript(s => { window.__LOAD_SPEC = s; }, spec);
  await page.addInitScript({ content: await readFile(join(ROOT, 'dev-tests', 'load-doc.js'), 'utf8') });
  const t0 = Date.now();
  await page.goto(`${base}/_load.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 120000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 180000 });
  const wall = Date.now() - t0;
  const ready = await page.evaluate(() => window.__LOAD.readyAt);
  const seedMs = await page.evaluate(() => window.__LOAD.seedMs);
  await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });
  // « Widget prêt. » vient avant la fin des lectures différées de l'ouverture (passe exacte du schéma, vérifications de renommage) et le premier rendu de l'éditeur : taper trop tôt perd des touches.
  await sleep(settleMs);
  return {
    browser, context, page, errors, dialogs, ready, seedMs, wall,
    stats: () => page.evaluate(() => window.__LOAD.snapshot()),
    resetStats: () => page.evaluate(() => window.__LOAD.reset()),
    heapMb: () => page.evaluate(() => { try { gc(); } catch (e) { /* --expose-gc absent */ } return Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10; }),
    close: async () => { await browser.close(); },
  };
}

// ---- Fabrication des descriptions de documents ----
// Le mélange de types d'un tableau : Texte, Nombre, Entier, Date, Oui/Non, Choix, Choix multiple, plus une Référence et une Liste de références vers `refs[i]` s'il y en a.
const MIX = ['Text', 'Text', 'Numeric', 'Int', 'Date', 'Bool', 'Choice', 'ChoiceList', 'Text', 'Numeric'];
const CHOICES = ['Alpha', 'Bêta', 'Gamma', 'Delta', 'Epsilon', 'Zêta', 'Êta', 'Thêta'];
export function columnsMix(n, { refs = [], prefix = 'Col' } = {}) {
  const cols = [];
  for (let c = 0; c < n; c++) {
    let type = MIX[c % MIX.length];
    if (refs.length && c % 11 === 5) type = 'Ref:' + refs[(c / 11 | 0) % refs.length];
    else if (refs.length && c % 11 === 9) type = 'RefList:' + refs[(c / 11 | 0) % refs.length];
    const col = { id: prefix + String(c + 1).padStart(3, '0'), type };
    if (type === 'Choice' || type === 'ChoiceList') col.choices = CHOICES;
    cols.push(col);
  }
  return cols;
}
// tables : n tables de `cols` colonnes et `rows` lignes (les Références visent la table suivante, si elle existe).
export function tablesSpec({ tables, cols, rows, prefix = 'Table', refs = true }) {
  const ids = Array.from({ length: tables }, (_, i) => prefix + String(i + 1).padStart(2, '0'));
  return ids.map((id, i) => ({ id, rows: typeof rows === 'function' ? rows(i) : rows, columns: columnsMix(typeof cols === 'function' ? cols(i) : cols, { refs: refs && ids.length > 1 ? [ids[(i + 1) % ids.length]] : [] }) }));
}

// ---- Mesures et compte rendu ----
export class Report {
  constructor(title) { this.title = title; this.rows = []; this.notes = []; }
  // rec(section, name, value, { unit, budget, note }) : `budget` = la valeur au-delà de laquelle la mesure est signalée (LENT) ; `ok: false` = CASSE.
  rec(section, name, value, { unit = 'ms', budget = null, ok = null, note = '' } = {}) {
    let verdict = '';
    if (ok === false) verdict = 'CASSE';
    else if (budget != null && value > budget) verdict = 'LENT';
    const row = { section, name, value: typeof value === 'number' ? Math.round(value * 100) / 100 : value, unit, budget, verdict, note };
    this.rows.push(row);
    const shown = typeof row.value === 'number' ? row.value.toLocaleString('fr-FR') : String(row.value);
    console.log(`  ${verdict ? verdict.padEnd(5) : 'ok   '} ${section} | ${name} : ${shown}${unit ? ' ' + unit : ''}${budget != null ? ' (budget ' + budget + ')' : ''}${note ? ' - ' + note : ''}`);
    return row;
  }
  note(text) { this.notes.push(text); console.log('  ... ' + text); }
  async save(file) { await mkdir(resolve(file, '..'), { recursive: true }); await writeFile(file, JSON.stringify({ title: this.title, rows: this.rows, notes: this.notes }, null, 1)); }
  get flagged() { return this.rows.filter(r => r.verdict); }
}

// Temps d'une fonction exécutée dans la page : `await timed(page, 'code JS qui renvoie une promesse ou une valeur', arg)` -> { ms, value }.
export async function timed(page, code, arg) {
  return page.evaluate(async ({ code, arg }) => {
    const fn = new Function('arg', 'return (async () => { ' + code + ' })()');
    const t0 = performance.now();
    const value = await fn(arg);
    return { ms: performance.now() - t0, value };
  }, { code, arg });
}
// Idem, plus le temps jusqu'à la prochaine image peinte (deux requestAnimationFrame) : ce que la personne attend vraiment.
export async function timedPaint(page, code, arg) {
  return page.evaluate(async ({ code, arg }) => {
    const fn = new Function('arg', 'return (async () => { ' + code + ' })()');
    const t0 = performance.now();
    const value = await fn(arg);
    const tWork = performance.now() - t0;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { ms: performance.now() - t0, workMs: tWork, value };
  }, { code, arg });
}

// ---- Gestes à la vraie souris ----
export const center = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
export async function click(page, sel) {
  const c = await center(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 20, c.y); await page.mouse.move(c.x, c.y, { steps: 3 }); await sleep(50);
  await page.mouse.click(c.x, c.y);
}
export async function hoverRow(page, parentSel, rowSel) {
  const p = await center(page, parentSel);
  await page.mouse.move(p.x - 25, p.y); await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(600);
  const r = await center(page, rowSel);
  if (!r) throw new Error('ligne introuvable : ' + rowSel);
  const inRow = Math.min(Math.max(p.x, r.x - r.w / 2 + 6), r.x + r.w / 2 - 6);
  await page.mouse.move(inRow, p.y + 10, { steps: 2 });
  await page.mouse.move(inRow, r.y, { steps: 6 });
  await page.mouse.move(r.x, r.y, { steps: 4 }); await sleep(200);
  return r;
}
export async function clickHoverRow(page, parentSel, rowSel) {
  const r = await hoverRow(page, parentSel, rowSel);
  await page.mouse.click(r.x, r.y);
}

// Ligne courante comme grist.onRecord la livre (valeurs brutes du faux Grist : une Référence vaut son identifiant).
export async function fire(page, table, rowId) {
  await page.evaluate(({ table, rowId }) => {
    const stub = window.__gristStub;
    const row = stub.getRow(table, rowId);
    const rec = { id: rowId };
    Object.keys(stub.state.columns[table] || {}).forEach(col => {
      let value = row[col];
      if (Array.isArray(value) && value[0] === 'L') value = value.slice(1);
      rec[col] = value;
    });
    stub.fireRecord(rec, table);
  }, { table, rowId });
  await sleep(250);
}

// Choisit un modèle dans la liste (vraie souris) : ouvre la liste si besoin, clique sa ligne (défile jusqu'à elle).
export async function pickTemplate(page, name) {
  const open = await page.evaluate(() => { const p = document.querySelector('.tts-popup'); return !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 0; });
  if (!open) { await click(page, '.tts-trigger'); await sleep(350); }
  const pos = await page.evaluate(n => {
    const row = Array.from(document.querySelectorAll('.tts-popup .tts-row-leaf')).find(e => e.querySelector('.tts-row-label').textContent.replace(/ ★| 📌/g, '').trim() === n);
    if (!row) return null;
    row.scrollIntoView({ block: 'nearest' });
    const b = row.getBoundingClientRect();
    return { x: b.left + 60, y: b.top + b.height / 2 };
  }, name);
  if (!pos) throw new Error('modèle introuvable dans la liste : ' + name);
  await page.mouse.move(pos.x, pos.y); await sleep(80); await page.mouse.click(pos.x, pos.y);
  await sleep(700);
  return page.evaluate(() => Templates.getCurrentId());
}
export async function status(page) { return page.evaluate(() => (document.getElementById('status-msg') || {}).textContent || ''); }
export async function mode(page, which) { await click(page, which === 'read' ? '#btn-mode-read' : '#btn-mode-edit'); await sleep(900); }

// ---- Exports : le fichier téléchargé est enregistré dans OUT_DIR puis mesuré ----
export const OUT_DIR = process.env.LOAD_OUT || '/tmp/pp-load-out';
export async function downloadOf(page, name, action, timeout = 600000) {
  await mkdir(OUT_DIR, { recursive: true });
  const t0 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout }), action()]);
  const file = join(OUT_DIR, name + extname(dl.suggestedFilename()));
  await dl.saveAs(file);
  return { file, suggested: dl.suggestedFilename(), size: (await stat(file)).size, ms: Date.now() - t0 };
}
export async function confirmDialog(page) {
  await page.waitForSelector('#pp-dialog-modal .var-modal-primary', { state: 'visible', timeout: 30000 });
  await sleep(250);
  await click(page, '#pp-dialog-modal .var-modal-primary');
}
// Les lignes du menu « Exporter en PDF » (survol du bouton) : ZIP, un seul PDF ; « Qualité » : Word, Excel.
export const EXPORT_ROWS = {
  pdfZip: ['#btn-export-pdf', '#v2-btn-export-pdf-batch'],
  pdfMerged: ['#btn-export-pdf', '#v2-btn-export-pdf-merged'],
  pdfSheets: ['#btn-export-pdf', '#v2-btn-export-pdf-sheets'], // « Assemblage avant impression » : la fenêtre de réglage tient lieu de confirmation
  docxZip: ['#v2-btn-quality', '#v2-btn-export-docx-batch'],
  xlsxZip: ['#v2-btn-quality', '#v2-btn-export-xlsx-batch'],
  xlsxSingle: ['#v2-btn-quality', '#v2-btn-export-xlsx-single'],
};
export async function exportBatchOf(page, kind, name, { timeout = 900000 } = {}) {
  const [parent, row] = EXPORT_ROWS[kind];
  return downloadOf(page, name, async () => {
    await clickHoverRow(page, parent, row);
    if (kind === 'pdfSheets') { await page.waitForSelector('#pp-sheets-modal .var-modal-primary', { state: 'visible', timeout: 30000 }); await sleep(250); await click(page, '#pp-sheets-modal .var-modal-primary'); }
    else await confirmDialog(page);
  }, timeout);
}
