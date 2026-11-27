// Le VRAI widget, piloté dans un Chromium headless, comme un utilisateur : ce que gallery-captures.mjs (les captures des modèles de la galerie) et verify-export-corpus.mjs (le banc de
// fidélité des exports sur modèles réels) ont en commun. Rien n'est écrit dans le dépôt.
//   - un petit serveur sert le dépôt tel quel, avec une page de harnais fabriquée à la volée (index.html, le faux Grist de dev-tests/grist-stub.js à la place du vrai) ;
//   - `openWidget` ouvre cette page (polices et Grist coupés, pièces jointes servies, jour fixe, GFS simulé pour une présentation) ;
//   - `installFromGallery` installe un modèle de la galerie par le vrai parcours, à la vraie souris ; `fillRows` pose les lignes d'exemple ; `fire` donne la ligne au widget ;
//   - `exportPdf` clique le vrai bouton « Exporter » et garde le fichier (dans le type choisi) ; `chooseExportType` / `exportAs` choisissent d'abord le type (pdf, docx, odf) dans son menu.
// Hors ligne, dev-tests/offline-deps.sh monte le miroir des bibliothèques des CDN (.offline-cache) : ce module le prend tout seul.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { entryFiles, readJson } from './gallery-captures-lib.mjs';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const GFS_STUB = join(ROOT, 'dev-tests', 'gfs-stub.js');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const sh = (cmd, cmdArgs, options) => spawnSync(cmd, cmdArgs, Object.assign({ encoding: 'utf8' }, options));

// `port` : le port du serveur ; `viewW` x `viewH` : la fenêtre ; `now` : le jour où l'on est (la date du jour d'un modèle ne change pas d'un passage à l'autre) ; `workName` : le dossier de travail.
export async function createKit({ port, viewW = 1100, viewH = 1100, now = new Date('2026-10-12T09:00:00+02:00'), workName = 'real-widget-' }) {
  const VIEW_W = viewW;
  const VIEW_H = viewH;
  const CAPTURE_NOW = now;
  const PORT = port;
  const work = mkdtempSync(join(tmpdir(), workName));
  process.on('exit', () => { try { rmSync(work, { recursive: true, force: true }); } catch (e) { /* le dossier de travail reste dans /tmp */ } });

  // ---- Le serveur : le dépôt tel quel, avec une page de harnais fabriquée à la volée (rien n'est écrit dans le dépôt) ----
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  };
  // La politique de sécurité de la page (index.html) ne laisse passer, pour les images et les requêtes, que `self` et https : les pièces jointes du faux Grist (http://localhost/api/docs/.../attachments/...)
  // seraient refusées, ni la Lecture ni le PDF n'auraient leurs images. Le harnais de test la retire, comme celui de run-headless.mjs ; l'essai de la politique elle-même est `cspLoad`.
  const harness = readFileSync(join(ROOT, 'index.html'), 'utf8').replace('<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>', '<script src="dev-tests/grist-stub.js"></script>')
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
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

  const OFFLINE = existsSync(join(CACHE, 'umd'));
  const UMD_ROUTES = OFFLINE ? [
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdf-lib@[\d.]+\/dist\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/qrcode-generator@[\d.]+\/qrcode\.js$/, 'umd/qrcode.min.js'],
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
    ...(existsSync(join(CACHE, 'umd/echarts.min.js')) ? [[/^https:\/\/cdn\.jsdelivr\.net\/npm\/echarts@[\d.]+\/dist\/echarts\.min\.js$/, 'umd/echarts.min.js']] : []),
  ] : [];

  // Une image de remplacement par pièce jointe de l'exemple : un dégradé et son libellé (ImageMagick). Le widget la demande comme à un vrai Grist.
  function makeImage(spec) {
    const file = join(work, 'img-' + Math.random().toString(36).slice(2) + '.png');
    const w = spec.width || 480;
    const h = spec.height || 320;
    const r = sh('convert', ['-size', `${w}x${h}`, `gradient:${spec.from || '#1d4ed8'}-${spec.to || '#60a5fa'}`, '-gravity', 'center', '-fill', spec.color || 'white', '-pointsize', String(spec.pointsize || Math.round(Math.min(w, h) / 6)), '-annotate', '0', spec.label || '', file]);
    if (r.status !== 0) throw new Error('convert : ' + r.stderr);
    return readFileSync(file);
  }

  // `slides` : le modèle est une présentation ; le widget s'ouvre hébergé par le GFS simulé, l'extension « diapositives » active (sans elle, la galerie ne la crée pas).
  async function openWidget(browser, images, { slides = false, extensions = [] } = {}) {
    const context = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, acceptDownloads: true });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror : ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console.error : ' + m.text()); });
    page.on('dialog', async (d) => { problems.push('boîte native (' + d.type() + ') : ' + d.message()); await d.dismiss(); });
    if (OFFLINE) {
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
    if (slides) {
      await page.addInitScript({ path: GFS_STUB });
      await page.addInitScript((list) => { window.__gfsStub.extensions = list; }, ['diapositives'].concat(extensions.filter(id => id !== 'diapositives')));
    } else if (extensions.length) {
      await page.addInitScript({ path: GFS_STUB });
      await page.addInitScript((list) => { window.__gfsStub.extensions = list; }, extensions);
    }
    await page.goto(`${BASE}/_captures.html?${slides ? 'gfs=0&' : ''}dev`, { waitUntil: 'load' });
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

  // Le type d'export (« pdf », « docx », « odf »…) se choisit dans le menu du type, comme le fait un utilisateur ; le bouton Exporter garde ensuite ce type.
  async function chooseExportType(page, type) {
    await clickMenuRow(page, '#v2-btn-quality', '#v2-quality-flyout .v2-hover-row[data-export-type="' + type + '"]');
    await sleep(250);
  }
  async function exportAs(page, type, file) {
    await chooseExportType(page, type);
    await exportPdf(page, file);
  }

  // Un widget « vide » pour les documents fabriqués : un petit modèle de la galerie l'installe (il donne au widget une table et une ligne d'exemple, sans quoi rien ne s'affiche), puis le document est remplacé
  // par setDocument. Rend { page, context, main, rowId, problems }.
  async function openBlankSession(browser) {
    const root = join(ROOT, 'templates-gallery');
    const catalogue = readJson(join(root, 'catalogue.json'));
    const entry = catalogue.find((e) => e.pack && e.id === 'attestation') || catalogue.find((e) => e.pack);
    const files = entryFiles(root, entry);
    const family = files.familyTables;
    const tables = files.pack.tables.map((t) => (typeof t !== 'string' ? t : family.tables.find((x) => x.id === t)));
    const rows = Object.assign({}, files.familyExemple && files.familyExemple.rows, files.exemple.rows);
    const imageSpecs = Object.assign({}, files.familyExemple && files.familyExemple.images, files.exemple.images);
    const images = {};
    Object.keys(imageSpecs).forEach((id) => { images[id] = makeImage(imageSpecs[id]); });
    const session = await openWidget(browser, images, { extensions: files.exemple.extensions || [] });
    await installFromGallery(session.page, entry.name);
    const main = files.pack.main || tables[0].id;
    await fillRows(session.page, tables.map((t) => ({ id: t.id, columns: t.columns })), rows);
    return Object.assign(session, { main, rowId: (rows[main] || [])[0].id });
  }
  // Un document posé dans l'éditeur du widget : son HTML (les images écrites `{{img:LARGEURxHAUTEUR}}` sont dessinées dans la page), les marges, le format et le sens de la page, l'en-tête et le pied de page.
  // `doc` : { html, page: { orientation, format, top, right, bottom, left }, headerFooter }.
  async function setDocument(page, doc) {
    await page.evaluate(({ d }) => {
      const draw = (w, h) => {
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1d4ed8'); g.addColorStop(1, '#60a5fa');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff'; ctx.font = Math.max(8, Math.round(Math.min(w, h) / 4)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(w + 'x' + h, w / 2, h / 2);
        return canvas.toDataURL('image/png');
      };
      const html = d.html.replace(/\{\{img:(\d+)x(\d+)\}\}/g, (m, w, h) => draw(Math.max(8, Number(w)), Math.max(8, Number(h))));
      PageLayout.setMarginsMm(d.page);
      Editor.setHTML(html);
      Editor.setHeaderFooterData(d.headerFooter || { enabled: false, differentFirstPage: false, header: { default: '' }, footer: { default: '' } });
    }, { d: doc });
    await sleep(500);
  }
  // Seules les marges changent (le balayage de la limite de page) : le texte du document reste tel quel.
  async function setMargins(page, margins) {
    await page.evaluate((m) => { PageLayout.setMarginsMm(m); }, margins);
    await sleep(150);
  }
  return {
    work, base: BASE, viewW: VIEW_W, viewH: VIEW_H,
    launch: () => chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] }),
    close: () => server.close(),
    makeImage, openWidget, rectOf, click, clickMenuRow, installFromGallery, fillRows, fire, exportPdf, chooseExportType, exportAs, setDocument, setMargins, openBlankSession,
  };
}
