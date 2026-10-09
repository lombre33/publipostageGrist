#!/usr/bin/env node
// Les captures des modèles de la galerie (templates-gallery/, et templates-gallery-dev/ avec --dev), prises dans le VRAI widget : rien n'est dessiné à la main.
// Pour chaque modèle qui a un pack.json et un exemple.json :
//   1. le widget (index.html servi tel quel) s'ouvre sur un document vide, avec le faux Grist de dev-tests/grist-stub.js ;
//   2. le modèle s'installe par le vrai parcours, à la vraie souris : « Créer à partir d'un modèle… », la carte, « Créer avec ses tables », « Créer » (les tables, leurs
//      colonnes de calcul, les règles de liaison et le modèle naissent comme chez un utilisateur : un pack mal écrit échoue ici) ;
//   3. les lignes d'exemple de exemple.json (et de la famille de tables) sont posées dans les tables, qui sont vides : c'est la seule chose que l'installation ne fait pas ;
//   4. pour chaque capture demandée, la ligne est choisie, puis le PDF est exporté par le vrai bouton et chaque page demandée devient capture-N.png (pdftoppm),
//      ou, pour un e-mail ou une grille (kind: "reading"), la Lecture est photographiée ;
//   5. thumb.png (la vignette de la carte), captures.json (l'empreinte de ce qui a servi, cf. dev-tests/gallery-captures-lib.mjs) et le manifeste (screenshot, preview) sont écrits.
// Un modèle dont l'empreinte n'a pas changé n'est pas refait (--force le refait). verify-gallery-captures.mjs (groupe Node galleryCaptures) dit quand une image est à refaire.
//
//   node dev-tests/gallery-captures.mjs                   tous les modèles à refaire de templates-gallery/
//   node dev-tests/gallery-captures.mjs --only flyer-a6   un seul (ou une liste : a,b)
//   node dev-tests/gallery-captures.mjs --force --dev     tout refaire, templates-gallery-dev/ compris
// Il faut : Chromium (Playwright, /opt/node22/lib/node_modules/playwright), poppler (pdftoppm, pdfinfo) et ImageMagick (convert).
// Les exports demandent les bibliothèques des CDN : hors ligne, dev-tests/offline-deps.sh en monte le miroir (.offline-cache), que ce script prend tout seul.
// exemple.json :
//   { "rows": { "Table": [{ "id": 1, "Colonne": valeur, ... }] },       lignes de ce modèle (remplacent celles de la famille, table par table) ;
//                                                                         une Référence est l'id de la ligne visée, une date « AAAA-MM-JJ », une liste un tableau,
//                                                                         une colonne de calcul sa valeur (le faux Grist ne calcule rien)
//     "images": { "1": { "label": "LOGO", "from": "#1d4ed8", "to": "#60a5fa", "width": 480, "height": 320 } },   les pièces jointes (id -> image fabriquée)
//     "captures": [{ "row": 1, "pages": [1, 2], "kind": "pdf", "width": 560, "alt": "..." }],             une ligne de la table principale par capture
//     "thumb": { "capture": 1, "page": 1 } }                                                              (par défaut : la première page de la première capture)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, mkdtempSync, copyFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { entryFiles, inputsHash, pngSize, readJson, CAPTURE_VERSION } from './gallery-captures-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.GALLERY_CAPTURES_PORT || 8921);
const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i === -1 ? fallback : args[i + 1]; };
const only = String(option('only', '')).split(',').map(s => s.trim()).filter(Boolean);
const FORCE = flag('force');
const WITH_DEV = flag('dev');
const VIEW_W = 1100;
// Le jour où les captures sont censées être prises : les lignes d'exemple (échéances, dates d'événements) sont écrites pour lui.
const CAPTURE_NOW = new Date('2026-10-12T09:00:00+02:00');
const VIEW_H = 1100;

// Largeur d'une capture à l'écran de l'aperçu : 3,3 px par mm de page (700 px pour une A4), au moins 440 px (une étiquette reste lisible), au plus 700.
const defaultWidth = (widthMm) => Math.max(440, Math.min(700, Math.round(widthMm * 3.3)));
const THUMB_W = 240;
const THUMB_H = 320;

const sh = (cmd, cmdArgs, options) => spawnSync(cmd, cmdArgs, Object.assign({ encoding: 'utf8' }, options));
for (const tool of ['pdftoppm', 'pdfinfo', 'convert']) {
  if (sh('which', [tool]).status !== 0) { console.error(`Il manque « ${tool} » (poppler-utils, ImageMagick).`); process.exit(2); }
}

// ---- Les modèles à photographier ----
const galleries = [{ dir: 'templates-gallery', label: 'galerie' }];
if (WITH_DEV) galleries.push({ dir: 'templates-gallery-dev', label: 'dev' });
const todo = [];
for (const gallery of galleries) {
  const manifestPath = join(ROOT, gallery.dir, 'manifest.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = readJson(manifestPath);
  manifest.forEach((entry) => {
    if (!entry.pack || (only.length && only.indexOf(entry.id) === -1)) return;
    const root = join(ROOT, gallery.dir);
    const files = entryFiles(root, entry);
    if (!files.exemple) { console.log(`- ${entry.id} : pas d'exemple.json, ignoré`); return; }
    const hash = inputsHash(root, entry);
    const done = existsSync(join(files.dir, 'captures.json')) && readJson(join(files.dir, 'captures.json')).hash === hash;
    if (done && !FORCE) { console.log(`= ${entry.id} : à jour`); return; }
    todo.push({ gallery, root, manifestPath, manifest, entry, files, hash });
  });
}
if (!todo.length) { console.log('Rien à faire.'); process.exit(0); }

// ---- Le serveur : le dépôt tel quel, avec une page de harnais fabriquée à la volée (rien n'est écrit dans le dépôt) ----
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const harness = readFileSync(join(ROOT, 'index.html'), 'utf8').replace('<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>', '<script src="dev-tests/grist-stub.js"></script>');
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/_captures.html') { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); res.end(harness); return; }
    const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(target));
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/qrcode\.min\.js$/, 'umd/qrcode.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = (code) => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const work = mkdtempSync(join(tmpdir(), 'gallery-captures-'));
process.on('exit', () => { try { rmSync(work, { recursive: true, force: true }); } catch (e) { /* le dossier de travail reste dans /tmp */ } });

// Une image de remplacement par pièce jointe de l'exemple : un dégradé et son libellé (ImageMagick). Le widget la demande comme à un vrai Grist.
function makeImage(spec) {
  const file = join(work, 'img-' + Math.random().toString(36).slice(2) + '.png');
  const w = spec.width || 480;
  const h = spec.height || 320;
  const r = sh('convert', ['-size', `${w}x${h}`, `gradient:${spec.from || '#1d4ed8'}-${spec.to || '#60a5fa'}`, '-gravity', 'center', '-fill', spec.color || 'white', '-pointsize', String(spec.pointsize || Math.round(Math.min(w, h) / 6)), '-annotate', '0', spec.label || '', file]);
  if (r.status !== 0) throw new Error('convert : ' + r.stderr);
  return readFileSync(file);
}

async function openWidget(browser, images) {
  const context = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, acceptDownloads: true });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror : ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console.error : ' + m.text()); });
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
  await page.addInitScript(() => { try { localStorage.setItem('pp_theme', 'light'); localStorage.setItem('pp_lang', 'fr'); } catch (e) { /* stockage refusé */ } });
  // « Aujourd'hui » des captures est toujours le même jour : la date du jour d'un modèle (bulle prête à poser) ne change pas d'une régénération à l'autre.
  await page.clock.setFixedTime(CAPTURE_NOW);
  await page.goto(`${BASE}/_captures.html?dev`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return { context, page, problems };
}

// ---- Les gestes, à la vraie souris ----
const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  e.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}, sel);
async function click(page, sel, wait = 200) {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 14, c.y - 6, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 }); await sleep(80);
  await page.mouse.click(c.x, c.y); await sleep(wait);
}
async function clickMenuRow(page, buttonSel, rowSel) {
  const from = await rectOf(page, buttonSel);
  await page.mouse.move(from.x - 14, from.y - 6, { steps: 2 }); await page.mouse.move(from.x, from.y, { steps: 4 }); await sleep(250);
  const to = await rectOf(page, rowSel);
  if (!to) throw new Error('ligne de menu introuvable : ' + rowSel);
  await page.mouse.move(from.x, to.y, { steps: 12 }); await page.mouse.move(to.x, to.y, { steps: 4 }); await sleep(150);
  await page.mouse.click(to.x, to.y); await sleep(500);
  await page.mouse.move(VIEW_W / 2, VIEW_H - 40, { steps: 6 });
}

// « Créer à partir d'un modèle… », la carte du modèle, « Créer avec ses tables », puis « Créer » dans la question : le parcours d'un utilisateur.
async function installFromGallery(page, name) {
  await clickMenuRow(page, '#btn-new', '#v2-btn-new-from-template');
  await page.waitForFunction(() => document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card').length > 0, null, { timeout: 10000 });
  const card = await page.evaluate((n) => {
    const el = Array.from(document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card')).find((c) => c.querySelector('.tpl-gallery-card-name').textContent === n);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, name);
  if (!card) throw new Error('la carte « ' + name + ' » n’est pas dans la galerie');
  await page.mouse.move(card.x - 10, card.y - 5, { steps: 2 }); await page.mouse.move(card.x, card.y, { steps: 3 }); await page.mouse.click(card.x, card.y);
  await page.waitForFunction(() => { const b = document.getElementById('tpl-preview-use-pack'); return b && !b.hidden && getComputedStyle(document.getElementById('template-preview-modal')).display !== 'none'; }, null, { timeout: 15000 });
  await sleep(400);
  await click(page, '#tpl-preview-use-pack', 500);
  const confirm = await page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const b = Array.from(ov.querySelectorAll('.pp-modal-actions button')).find((x) => x.textContent === 'Créer');
    if (!b) return { error: Array.from(ov.querySelectorAll('.pp-modal-actions button')).map((x) => x.textContent).join(' | ') + ' : ' + (ov.querySelector('.pp-dialog-message') || {}).textContent };
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!confirm || confirm.error) throw new Error('la question « Créer les tables du modèle ? » n’est pas là' + (confirm ? ' : ' + confirm.error : ''));
  await page.mouse.move(confirm.x - 8, confirm.y, { steps: 2 }); await page.mouse.click(confirm.x, confirm.y);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('template-gallery-modal')).display === 'none' && Templates.getCurrentId() != null, null, { timeout: 30000 });
  await sleep(900);
}

// Les lignes d'exemple dans les tables que l'installation vient de créer (vides) : valeurs, colonnes d'aide des Références, listes.
async function fillRows(page, tables, rows) {
  await page.evaluate(({ tables, rows }) => {
    const stub = window.__gristStub;
    const day = (s) => Math.floor(Date.parse(s.length === 10 ? s + 'T00:00:00Z' : s + (/Z$|[+-]\d\d:\d\d$/.test(s) ? '' : 'Z')) / 1000);
    const byId = {}; tables.forEach((t) => { byId[t.id] = t; });
    tables.forEach((t) => {
      const list = (rows[t.id] || []).map((r) => {
        const out = { id: r.id };
        t.columns.forEach((c) => {
          let v = r[c.id]; if (v === undefined || (v === '' && c.type !== 'Text' && c.type !== 'Choice')) v = null; // une date, un nombre ou une liste vides sont `null` dans Grist
          const ref = /^Ref:(.+)$/.exec(c.type);
          const refl = /^RefList:(.+)$/.exec(c.type);
          if (v !== null) {
            if (c.type === 'Date' || c.type === 'DateTime') v = typeof v === 'string' ? day(v) : v;
            else if (c.type === 'ChoiceList' || c.type === 'Attachments' || refl) v = ['L'].concat(v);
          }
          out[c.id] = v;
          if (ref || refl) {
            const targetRows = rows[(ref || refl)[1]] || [];
            const shown = (id) => { const row = targetRows.find((x) => x.id === id); const value = row ? row[c.show] : ''; return value == null ? '' : value; };
            // La colonne d'aide que le vrai Grist (et le stub) a rangée pour cette Référence : gristHelper_Display, gristHelper_Display2... (le nom que l'installateur a obtenu).
            const helper = ((stub.state.displayCols || {})[t.id] || {})[c.id] || ('gristHelper_Display' + c.id);
            out[helper] = v === null ? '' : (refl ? ['L'].concat(r[c.id].map(shown)) : shown(v));
          }
        });
        return out;
      });
      stub.setRows(t.id, list);
    });
  }, { tables, rows });
  await sleep(300);
}

// Le widget reçoit la ligne comme grist.onRecord la livre : une Référence vaut sa valeur affichée, une liste ses valeurs affichées, sans le marqueur « L ».
async function fire(page, table, rowId) {
  await page.evaluate(({ table, rowId }) => {
    const stub = window.__gristStub; const st = stub.state;
    const raw = stub.getRow(table, rowId);
    if (!raw) throw new Error('pas de ligne ' + rowId + ' dans ' + table);
    const display = st.displayCols[table] || {};
    const rec = { id: rowId };
    Object.keys(st.columns[table] || {}).forEach((col) => {
      if (col.indexOf('gristHelper_') === 0) return;
      if (display[col]) { const shown = raw[display[col]]; rec[col] = Array.isArray(shown) && shown[0] === 'L' ? shown.slice(1) : shown; }
      else rec[col] = raw[col];
      const type = String((st.columns[table] || {})[col] || '');
      if (/^(ChoiceList|Attachments|RefList)/.test(type) && Array.isArray(rec[col]) && rec[col][0] === 'L') rec[col] = rec[col].slice(1);
    });
    stub.fireRecord(rec, table);
  }, { table, rowId });
  await sleep(600);
}

async function exportPdf(page, file) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click(page, '#btn-export-pdf', 100)]);
  await download.saveAs(file);
}

// « Assemblage avant impression… » du menu Exporter en PDF : les pages de toutes les lignes posées sur des feuilles A4 (les emplacements au maximum, traits de coupe
// à la demande), par le vrai menu et la vraie fenêtre.
async function exportSheets(page, file, spec) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), (async () => {
    await clickMenuRow(page, '#btn-export-pdf', '#v2-btn-export-pdf-sheets');
    await page.waitForSelector('#pp-sheets-modal .var-modal-primary', { state: 'visible', timeout: 15000 });
    await sleep(400);
    await click(page, `#pp-sheets-modal input[name="pp-sheets-marks"][value="${spec.marks === false ? 'off' : 'on'}"]`, 200);
    await click(page, '#pp-sheets-modal .var-modal-primary', 100);
  })()]);
  await download.saveAs(file);
}

// Le PDF -> des PNG (une page chacun) à la largeur voulue ; la largeur d'une page vient de pdfinfo.
function pdfPagesToPng(pdfFile, pages, widthPx, prefix) {
  const info = sh('pdfinfo', [pdfFile]).stdout;
  const size = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info);
  const count = Number((/Pages:\s+(\d+)/.exec(info) || [])[1] || 1);
  if (!size) throw new Error('pdfinfo : taille de page illisible');
  const widthMm = Number(size[1]) / 72 * 25.4;
  const dpi = Math.round((widthPx || defaultWidth(widthMm)) / (Number(size[1]) / 72));
  const out = [];
  pages.forEach((p) => {
    if (p > count) throw new Error(`le PDF n'a que ${count} page(s), pas la page ${p}`);
    const base = prefix + '-p' + p;
    const r = sh('pdftoppm', ['-png', '-r', String(dpi), '-f', String(p), '-l', String(p), '-singlefile', pdfFile, base]);
    if (r.status !== 0) throw new Error('pdftoppm : ' + r.stderr);
    out.push(base + '.png');
  });
  return { files: out, pages: count };
}

// Une image du dossier du modèle : sans métadonnées, en 256 couleurs avec tramage (du texte et des aplats : un tiers du poids ; le tramage évite les bandes
// que ferait un dégradé d'image d'exemple).
function writeOptimised(src, dest) {
  const r = sh('convert', [src, '-strip', '-dither', 'FloydSteinberg', '-colors', '256', '-define', 'png:compression-level=9', 'PNG8:' + dest]);
  if (r.status !== 0) throw new Error('convert : ' + r.stderr);
  return pngSize(readFileSync(dest));
}

// La vignette de la carte : la première page entière, posée sur un fond gris clair avec un trait fin et une ombre douce, en 240 x 320 (le 3 / 4 de la carte).
function writeThumb(src, dest) {
  const r = sh('convert', [src, '-resize', `${THUMB_W - 28}x${THUMB_H - 28}`, '-bordercolor', '#b9c2d3', '-border', '1',
    '(', '+clone', '-background', '#7b869c', '-shadow', '45x3+0+2', ')', '+swap', '-background', 'none', '-layers', 'merge', '+repage',
    '-background', '#e8ecf3', '-gravity', 'center', '-extent', `${THUMB_W}x${THUMB_H}`, '-strip', '-dither', 'FloydSteinberg', '-colors', '256', '-define', 'png:compression-level=9', 'PNG8:' + dest]);
  if (r.status !== 0) throw new Error('convert (vignette) : ' + r.stderr);
  return pngSize(readFileSync(dest));
}

// ---- Un modèle ----
const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
let failures = 0;
for (const job of todo) {
  const { entry, files, root } = job;
  const started = Date.now();
  const tag = `${entry.id}`;
  let session = null;
  try {
    const pack = files.pack;
    const family = files.familyTables;
    const tables = pack.tables.map((t) => {
      if (typeof t !== 'string') return t;
      const found = family && family.tables.find((x) => x.id === t);
      if (!found) throw new Error(`la table « ${t} » n'est pas dans la famille « ${pack.family} »`);
      return found;
    });
    const rows = Object.assign({}, files.familyExemple && files.familyExemple.rows, files.exemple.rows);
    const imageSpecs = Object.assign({}, files.familyExemple && files.familyExemple.images, files.exemple.images);
    const imageBuffers = {};
    Object.keys(imageSpecs).forEach((id) => { imageBuffers[id] = makeImage(imageSpecs[id]); });
    session = await openWidget(browser, imageBuffers);
    const { page, problems } = session;
    await installFromGallery(page, entry.name);
    const main = pack.main || tables[0].id;
    await fillRows(page, tables.map((t) => ({ id: t.id, columns: t.columns })), rows);

    const specs = files.exemple.captures || [];
    if (!specs.length) throw new Error('exemple.json ne demande aucune capture');
    const outFiles = [];
    const preview = [];
    let n = 0;
    for (const spec of specs) {
      await fire(page, main, spec.row || 1);
      const kind = spec.kind || ((pack.template && pack.template.type) === 'document' || !(pack.template && pack.template.type) ? 'pdf' : 'reading');
      if (kind === 'pdf' || kind === 'sheets') {
        const pdf = join(work, `${entry.id}-${n}.pdf`);
        if (kind === 'pdf') await exportPdf(page, pdf);
        else await exportSheets(page, pdf, spec);
        const made = pdfPagesToPng(pdf, spec.pages || [1], spec.width, join(work, `${entry.id}-${n}`));
        // `expectPages` : le nombre de pages que ce PDF doit avoir (un flyer qui déborde sur une deuxième page ne se photographie pas sans le dire).
        if (spec.expectPages && made.pages !== spec.expectPages) {
          // GALLERY_CAPTURES_KEEP=<dossier> : le PDF trop long est gardé là pour qu'on le regarde (pdftoppm -png).
          if (process.env.GALLERY_CAPTURES_KEEP) { mkdirSync(process.env.GALLERY_CAPTURES_KEEP, { recursive: true }); copyFileSync(pdf, join(process.env.GALLERY_CAPTURES_KEEP, `${entry.id}-${n + 1}.pdf`)); }
          throw new Error(`capture ${n + 1} : le PDF a ${made.pages} page(s), pas ${spec.expectPages}`);
        }
        made.files.forEach((png) => { outFiles.push(png); });
      } else {
        if (spec.viewport) await page.setViewportSize({ width: spec.viewport[0], height: spec.viewport[1] });
        await click(page, '#btn-mode-read', 1200);
        await page.mouse.move(10, 10); // la souris quitte le bouton : son menu de survol (« Lecture épurée ») ne reste pas sur la photo
        await sleep(300);
        const png = join(work, `${entry.id}-${n}-reading.png`);
        if (spec.clip) {
          // `clip` : des éléments photographiés ensemble (la barre Objet / À / Cc d'un e-mail et le texte de la Lecture, sans la barre d'outils de l'éditeur qui les sépare) :
          // une liste de groupes, chaque groupe une liste de sélecteurs ; chaque groupe a sa photo (le cadre qui contient tous ses éléments, élargi de `pad` px), toutes de
          // la même largeur (celle du plus large), posées l'une sous l'autre. Les éléments qui n'occupent rien (le <style> que la Lecture ajoute à sa feuille) ne comptent pas.
          const groups = Array.isArray(spec.clip[0]) ? spec.clip : [spec.clip];
          const boxes = await page.evaluate(({ groups, pad }) => {
            // `pad` : un nombre (partout), [haut, droite, bas, gauche], ou une liste de ces formes, une par groupe.
            const padOf = (g) => { const p = Array.isArray(pad) && Array.isArray(pad[0]) ? pad[g] : pad; return Array.isArray(p) ? p : [p, p, p, p]; };
            const out = groups.map((selectors) => {
              const rects = [];
              selectors.forEach((s) => {
                const found = Array.from(document.querySelectorAll(s)).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
                if (!found.length) throw new Error('Lecture : rien à photographier (' + s + ')');
                found.forEach((r) => rects.push(r));
              });
              return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)), top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) };
            });
            const left = Math.max(0, Math.min(...out.map((b, g) => b.left - padOf(g)[3])));
            const right = Math.max(...out.map((b, g) => b.right + padOf(g)[1]));
            return out.map((b, g) => { const [pt, , pb] = padOf(g); return { x: left, y: Math.max(0, b.top - pt), width: right - left, height: b.bottom - b.top + pt + pb }; });
          }, { groups, pad: spec.pad == null ? 8 : spec.pad });
          const parts = [];
          for (let g = 0; g < boxes.length; g += 1) {
            const part = png.replace(/\.png$/, `-${g + 1}.png`);
            await page.screenshot({ path: part, clip: boxes[g] });
            parts.push(part);
          }
          if (parts.length === 1) copyFileSync(parts[0], png);
          else { const r = sh('convert', parts.concat(['-background', 'white', '-append', png])); if (r.status !== 0) throw new Error('convert (-append) : ' + r.stderr); }
        } else {
          const el = await page.$(spec.selector || '.reader-content');
          if (!el) throw new Error('Lecture : rien à photographier (' + (spec.selector || '.reader-content') + ')');
          await el.screenshot({ path: png });
        }
        await click(page, '#btn-mode-edit', 600);
        if (spec.viewport) await page.setViewportSize({ width: VIEW_W, height: VIEW_H });
        outFiles.push(png);
      }
      n += 1;
    }
    // Les anciennes captures du dossier partent, les nouvelles prennent leur place.
    readdirSync(files.dir).filter((f) => /^capture-\d+\.png$/.test(f) || f === 'thumb.png').forEach((f) => rmSync(join(files.dir, f)));
    outFiles.forEach((src, i) => {
      const size = writeOptimised(src, join(files.dir, `capture-${i + 1}.png`));
      preview.push({ src: `${entry.pack.split('/').slice(0, -1).join('/')}/capture-${i + 1}.png`, w: size.w, h: size.h });
    });
    const thumbSpec = files.exemple.thumb || {};
    // Les pages d'une capture se suivent dans outFiles : « capture » est le rang de la capture, « page » le rang de la page dans cette capture.
    let thumbIndex = 0;
    if (thumbSpec.capture || thumbSpec.page) {
      let before = 0;
      for (let i = 0; i < (thumbSpec.capture || 1) - 1; i += 1) before += (specs[i].pages || [1]).length;
      thumbIndex = before + (thumbSpec.page || 1) - 1;
    }
    const thumb = writeThumb(outFiles[thumbIndex], join(files.dir, 'thumb.png'));
    const dirName = entry.pack.split('/').slice(0, -1).join('/');
    writeFileSync(join(files.dir, 'captures.json'), JSON.stringify({ version: CAPTURE_VERSION, hash: job.hash, preview, thumb: { src: dirName + '/thumb.png', w: thumb.w, h: thumb.h } }, null, 2) + '\n');
    // Le manifeste : `screenshot` (la vignette) et `preview` (les captures), à la place de leur ancienne valeur et sans toucher au reste.
    const current = job.manifest.find((x) => x.id === entry.id);
    const rebuilt = {};
    Object.keys(current).forEach((key) => { if (key !== 'preview') rebuilt[key] = current[key]; if (key === 'screenshot') rebuilt.preview = preview; });
    if (!rebuilt.preview) rebuilt.preview = preview;
    rebuilt.screenshot = dirName + '/thumb.png';
    job.manifest[job.manifest.indexOf(current)] = rebuilt;
    writeFileSync(job.manifestPath, JSON.stringify(job.manifest, null, 2) + '\n');
    const bad = problems.filter((p) => !/404/.test(p));
    console.log(`+ ${tag} : ${preview.length} capture(s) + vignette en ${Math.round((Date.now() - started) / 1000)} s` + (bad.length ? ` — ${bad.length} erreur(s) de console : ${bad.slice(0, 3).join(' ; ')}` : ''));
    if (bad.length) failures += 1;
  } catch (e) {
    failures += 1;
    console.log(`! ${tag} : ${e.message}`);
  } finally {
    if (session) await session.context.close();
  }
}
await browser.close();
server.close();
console.log(failures ? `${failures} modèle(s) en échec.` : 'Captures à jour.');
process.exit(failures ? 1 : 0);
