#!/usr/bin/env node
// Refait les deux captures du README public sur l'interface du jour : le modèle « Contrat de prestation de services » de la galerie (templates-gallery/), installé comme le fait une personne
// (« Créer à partir d'un modèle… », « Créer avec ses tables »), puis rempli avec les lignes d'exemple de son exemple.json et de sa famille (des données fictives), 1400×680 pixels CSS à
// l'échelle 2 (2800×1360), en thème clair.
//   edition-variables.png : l'Édition, les variables en bulles ;   lecture-resolue.png : la Lecture, les mêmes variables résolues avec la première ligne d'exemple.
// Hors Grist : le faux Grist de dev-tests/ (grist-stub.js), et le miroir hors-ligne des bibliothèques (dev-tests/.offline-cache/, voir dev-tests/offline-deps.sh) quand il existe ; sans lui,
// la page va chercher ses bibliothèques sur les CDN. La police de l'interface est fixée sur Roboto, celle que la page embarque pour le document : sur une machine de test sans la police
// habituelle d'un poste de travail, `system-ui` donnerait DejaVu Sans, bien plus large que ce que verrait la personne.
// Le modèle est un modèle à tables (pack) : ses variables viennent de plusieurs tables liées (Contrats, Clients, Entreprise). Les installer par le vrai parcours de la galerie, puis y poser les lignes
// d'exemple, est ce que fait aussi dev-tests/gallery-captures.mjs : un modèle dont les tables ne sont pas créées montre des variables en erreur (la capture serait fausse).
// Usage : node outils/depot-propre/captures-readme.mjs [--sortie <dossier>]      (par défaut outils/depot-propre/public/screenshots/ ; publier.sh les pose dans screenshots/ du dépôt public)
// Écrit aussi _test-harness.html à la racine du dépôt de développement (ignoré par git), comme dev-tests/generate-harness.sh.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { entryFiles, readJson } from '../../dev-tests/gallery-captures-lib.mjs';

const ICI = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(ICI, '..', '..');
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const argSortie = process.argv.indexOf('--sortie');
const SORTIE = resolve(argSortie > 0 ? process.argv[argSortie + 1] : join(ICI, 'public', 'screenshots'));
const WIDTH = 1400;
const HEIGHT = 680;
const FONT_UI = "Roboto, 'Helvetica Neue', Arial, sans-serif";
await mkdir(SORTIE, { recursive: true });

// Même régénération du harnais que dev-tests/generate-harness.sh : la page réelle, l'API de Grist remplacée par le stub.
const html = await readFile(join(ROOT, 'index.html'), 'utf8');
await writeFile(join(ROOT, '_test-harness.html'), html.replace('<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>', '<script src="dev-tests/grist-stub.js"></script>'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = createServer(async (req, res) => {
  try {
    const filePath = join(ROOT, normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(target));
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok, ko) => server.listen(0, '127.0.0.1', ok).on('error', ko));
const BASE = `http://127.0.0.1:${server.address().port}`;

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }

// Le miroir hors-ligne des bibliothèques de l'éditeur (esm.sh) : les bundles s'importent entre eux en relatif, réécrit en absolu pour que le même module ne soit pas chargé deux fois.
const esmMapPath = join(CACHE, 'esm-map.json');
const OFFLINE = existsSync(esmMapPath);
const esmMap = OFFLINE ? JSON.parse(readFileSync(esmMapPath, 'utf8')) : {};
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

// Le modèle à photographier : son entrée du catalogue, son pack (tables et liens), les tables de sa famille et les lignes d'exemple (celles du modèle l'emportent sur celles de la famille).
const GALERIE = join(ROOT, 'templates-gallery');
const ENTRY = readJson(join(GALERIE, 'catalogue.json')).find(e => e.id === 'contrat-prestation-services');
if (!ENTRY || !ENTRY.pack) throw new Error('le modèle « contrat-prestation-services » n\'est plus dans templates-gallery/catalogue.json, ou n\'a plus de pack : changer le modèle photographié');
const FILES = entryFiles(GALERIE, ENTRY);
if (!FILES.exemple) throw new Error('le modèle « ' + ENTRY.id + ' » n\'a pas d\'exemple.json : pas de ligne d\'exemple à y poser');
const TABLES = FILES.pack.tables.map(t => {
  if (typeof t !== 'string') return t;
  const found = FILES.familyTables && FILES.familyTables.tables.find(x => x.id === t);
  if (!found) throw new Error(`la table « ${t} » n'est pas dans la famille « ${FILES.pack.family} »`);
  return found;
});
const MAIN = FILES.pack.main || TABLES[0].id;
const ROWS = Object.assign({}, FILES.familyExemple && FILES.familyExemple.rows, FILES.exemple.rows);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Le parcours de la galerie se joue à cette taille (comme dev-tests/gallery-captures.mjs) ; la capture, à 1400×680.
const INSTALL_W = 1100;
const INSTALL_H = 1100;

// ---- Les gestes, à la vraie souris (ceux de dev-tests/gallery-captures.mjs) ----
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
  await page.mouse.move(INSTALL_W / 2, INSTALL_H - 40, { steps: 6 });
}
// « Créer à partir d'un modèle… », la carte du modèle, « Créer avec ses tables », puis « Créer » dans la question : le parcours d'une personne.
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

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2, colorScheme: 'light' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror : ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console : ' + m.text()); });
if (OFFLINE) {
  await page.route('**://esm.sh/**', async route => {
    const url = route.request().url();
    const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
    if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
    const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
    if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
  });
}
await page.addInitScript(() => { try { localStorage.setItem('pp_theme', 'light'); localStorage.setItem('pp_lang', 'fr'); } catch (e) { /* stockage refusé */ } });
// « Aujourd'hui » est toujours le même jour : une date du jour ne change pas d'une régénération à l'autre.
await page.clock.setFixedTime(new Date('2026-10-12T09:00:00+02:00'));
await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
await page.evaluate(f => document.documentElement.style.setProperty('--font-ui', f), FONT_UI);
await page.setViewportSize({ width: INSTALL_W, height: INSTALL_H });
await installFromGallery(page, ENTRY.name);
await fillRows(page, TABLES.map(t => ({ id: t.id, columns: t.columns })), ROWS);
await fire(page, MAIN, 1);
// Le message de l'installation (« … créé avec ses tables vides… ») n'a plus lieu d'être : les lignes d'exemple sont posées. La barre dit ce qu'elle dit au repos.
await page.evaluate(() => { const el = document.getElementById('status-msg'); el.textContent = I18n.t('status.ready'); el.className = ''; });
await page.setViewportSize({ width: WIDTH, height: HEIGHT });
await page.waitForTimeout(1200);

// La souris reste dans la marge grise, à gauche de la feuille : aucun survol (la pastille de zoom reste au repos), aucun menu ouvert.
const MARGE = { x: 100, y: 420 };
// 1. L'Édition, sans curseur dans le texte.
await page.mouse.move(MARGE.x, MARGE.y);
await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
await page.waitForTimeout(500);
await page.screenshot({ path: join(SORTIE, 'edition-variables.png') });
// 2. La Lecture : un vrai clic sur le bouton du mode, puis la souris loin du menu qui s'ouvre au survol.
const b = await page.evaluate(() => { const r = document.getElementById('btn-mode-read').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(b.x - 6, b.y, { steps: 2 });
await page.mouse.move(b.x, b.y, { steps: 3 });
await page.mouse.click(b.x, b.y);
await page.mouse.move(MARGE.x, MARGE.y, { steps: 4 });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(SORTIE, 'lecture-resolue.png') });

await browser.close();
server.close();
if (errors.length) { console.error('Erreurs de la page pendant la capture :\n' + errors.join('\n')); process.exit(1); }
console.log('Captures écrites dans ' + SORTIE + ' : edition-variables.png, lecture-resolue.png');
