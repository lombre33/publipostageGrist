#!/usr/bin/env node
// Saut de page d'une grille (lot C de planning/feature-mode-grille-excel.md, demande d'Antoine du 01/10 : « saut de page gardé : marqueur sur la ligne, nouvelle page du PDF, nouvelle feuille de
// l'Excel ») à la VRAIE souris (page.mouse, Node/Playwright), à la taille du panneau Grist (~700x400), en thème clair puis sombre. Une page.evaluate ne déclenche ni un appui « trusted », ni le
// survol, ni le glissé : c'est ici qu'on s'assure que
//   - le bouton « Saut de page » de la barre d'outils est dans le panneau, grisé (visible, atténué, jamais retiré) sur la première ligne et au milieu d'une case fusionnée sur plusieurs lignes, et
//     qu'un clic dessus alors ne pose rien ; son info-bulle dit ce qu'il fait dans une grille (avant la ligne) ;
//   - un vrai clic le pose AVANT la ligne de la case courante (avant la première ligne d'une sélection de cases glissée), le bouton s'enfonce, un second clic retire le saut ; un Ctrl+Z, un Ctrl+Y ;
//   - le saut SE VOIT : un trait en tirets sur le bord haut de la ligne (mesuré sur les pixels de la capture, de la couleur de la pastille) et une pastille dans le numéro de la ligne, tous deux dans
//     le panneau et lisibles (contraste) ; rien sur les lignes sans saut ;
//   - la pastille ne cache pas la poignée de la ligne du dessus : un appui exactement sur la pastille tire cette poignée (la ligne du dessus change de hauteur, le saut reste) ;
//   - « Fusionner » est grisé (jamais retiré) quand la sélection enjambe un saut, et ne l'est pas quand le saut est sur son bord haut ;
//   - le bouton portrait / paysage de la barre est actif dans une grille : un vrai clic passe en paysage, un second revient ; au clavier, Entrée sur le bouton « Saut de page » le pose une fois.
// Lancé par run-headless.mjs (groupe Node « gridPageBreakMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-grid-pagebreak-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.GRID_PAGEBREAK_PORT || 8919);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-read-mode-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
].filter(([, rel]) => rel !== 'umd/exceljs.min.js' || existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[verify-grid-pagebreak-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { d.accept().catch(() => {}); });
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
  return { context, page };
}


// Centre d'un élément et est-il entièrement dans le panneau ?
async function boxOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
      inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  }, selector);
}

// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, selector) {
  const b = await boxOf(page, selector);
  if (!b) return null;
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(120);
  return b;
}

// Le centre de la case LOGIQUE (ligne r, colonne c, depuis 1) : au milieu de sa colonne et de sa ligne, qu'une case fusionnée la recouvre ou non.
const gridPoint = (page, r, c) => page.evaluate(([row, col]) => {
  const colEl = document.querySelectorAll('.tiptap table > colgroup > col')[col - 1];
  const rowEl = document.querySelectorAll('.tiptap table > tbody > tr')[row - 1];
  if (!colEl || !rowEl) return null;
  const a = colEl.getBoundingClientRect(), b = rowEl.getBoundingClientRect();
  return { x: a.left + a.width / 2, y: b.top + b.height / 2 };
}, [r, c]);

// Appuie sur la case `from`, glisse sur la case `to`, relâche : une sélection de cases.
async function dragGrid(page, from, to) {
  const a = await gridPoint(page, from[0], from[1]);
  const b = await gridPoint(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function clickGrid(page, r, c) {
  const p = await gridPoint(page, r, c);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(100);
}

const colWidths = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table > colgroup > col')).map(c => Math.round(c.getBoundingClientRect().width * 10) / 10));
const rowHeights = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table > tbody > tr')).map(r => Math.round(r.getBoundingClientRect().height * 10) / 10));
const sameList = (a, b, tolerance = 0.6) => !!a && !!b && a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= tolerance);

// Les cases du tableau telles que le document les porte : forme, texte (un élément par paragraphe), alignement, largeur enregistrée.
const cellsOf = page => page.evaluate(() => {
  const doc = EditorCore.getEditor().state.doc;
  const out = [];
  doc.child(0).forEach((row, _o, r) => row.forEach(cell => out.push({
    row: r + 1, colspan: cell.attrs.colspan, rowspan: cell.attrs.rowspan, valign: cell.attrs.verticalAlign, colwidth: cell.attrs.colwidth,
    paragraphs: Array.from({ length: cell.childCount }, (_, i) => cell.child(i).textContent),
  })));
  return out;
});
const mergedOf = cells => cells.find(c => c.colspan > 1 || c.rowspan > 1) || null;
const selectedCount = page => page.evaluate(() => {
  const sel = EditorCore.getEditor().state.selection;
  return sel.$anchorCell ? document.querySelectorAll('.tiptap td.selectedCell, .tiptap th.selectedCell').length : 0;
});

async function loadGrid(page, html) {
  await page.evaluate(h => {
    GridEditor.setActive(false);
    Editor.setHTML(h);
    GridEditor.setActive(true);
    const box = document.getElementById('editor-container');
    box.scrollTop = 0; box.scrollLeft = 0;
  }, html);
  await page.waitForTimeout(500);
}
// Une grille aux dimensions connues : `widths` (px, par colonne), `heights` (px, par ligne), `text(r, c)` le texte de chaque case.
const gridHtml = (widths, heights, text) => `<table style="width: ${widths.reduce((s, w) => s + w, 0)}px;"><colgroup>${widths.map(w => `<col style="width: ${w}px;">`).join('')}</colgroup><tbody>`
  + heights.map((h, r) => `<tr data-row-height="${h}" style="height: ${h}px">${widths.map((w, c) => `<td colwidth="${w}"><p>${text(r + 1, c + 1)}</p></td>`).join('')}</tr>`).join('') + '</tbody></table>';

// « + » puis « Nouvelle grille » (ou « Nouveau document ») à la vraie souris : un modèle de départ tout neuf (un modèle déjà modifié ouvre d'abord « Modifications non enregistrées » : « Abandonner »).
async function freshModel(page, entryId, ready) {
  const newBtn = await boxOf(page, '#btn-new');
  await page.mouse.move(newBtn.x, newBtn.y, { steps: 3 });
  await page.waitForTimeout(350);
  const entry = await boxOf(page, '#' + entryId);
  await page.mouse.move(entry.x, entry.y, { steps: 4 });
  await page.mouse.click(entry.x, entry.y);
  await page.waitForTimeout(250);
  const discard = await page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const button = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).find(b => b.textContent === 'Abandonner');
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (discard) {
    await page.mouse.move(discard.x - 10, discard.y, { steps: 2 });
    await page.mouse.click(discard.x, discard.y);
  }
  await page.waitForFunction(ready, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
}
const freshGrid = page => freshModel(page, 'v2-btn-new-grid', () => GridEditor.isActive() && document.querySelectorAll('.v2-grid-colhead').length > 0);
const freshDocument = page => freshModel(page, 'v2-btn-new-document', () => !GridEditor.isActive() && document.querySelectorAll('.v2-grid-colhead').length === 0);

// Contraste WCAG de deux couleurs CSS « rgb(...) ».
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

const BAR = '.v2-cell-bar-dock .v2-floating-toolbar';
const button = action => `${BAR} button[data-action="${action}"]`;
// Chaque bouton de la barre : visible, grisé, enfoncé, dans la bande ; la hauteur de la barre.
const barState = page => page.evaluate((sel) => {
  const bar = document.querySelector(sel);
  const dockEl = document.getElementById('v2-cell-bar-dock');
  if (!bar || !dockEl) return null;
  const dock = dockEl.getBoundingClientRect();
  const buttons = {};
  const order = [];
  bar.querySelectorAll('button[data-action]').forEach(b => {
    const r = b.getBoundingClientRect();
    const shown = getComputedStyle(b).display !== 'none' && r.width > 0;
    if (shown) order.push([r.left, b.dataset.action]);
    buttons[b.dataset.action] = {
      shown, locked: b.classList.contains('v2-hf-locked'), active: b.classList.contains('is-active'), pressed: b.getAttribute('aria-pressed'), title: b.title, opacity: Number(getComputedStyle(b).opacity),
      inside: r.left >= dock.left - 0.5 && r.right <= dock.right + 0.5 && r.top >= dock.top - 0.5 && r.bottom <= dock.bottom + 0.5,
    };
  });
  order.sort((a, b) => a[0] - b[0]);
  const r = bar.getBoundingClientRect();
  return { buttons, order: order.map(o => o[1]), height: r.height, dockHeight: dock.height, dockShown: getComputedStyle(dockEl).display !== 'none' };
}, BAR);

// Appuie en `from`, glisse jusqu'en `to`, relâche (`during` lit l'état en plein glissé).
async function realDrag(page, from, to, during) {
  await page.mouse.move(from.x, from.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  const live = during ? await during() : null;
  await page.mouse.up();
  await page.waitForTimeout(150);
  return live;
}

const PAGE_BREAK = '#v2-btn-page-break';
const ORIENTATION = '#btn-page-orientation';
const ROW_PX = 30;
// Une grille de 3 colonnes de 120 px et de 8 lignes de 30 px ; MERGED : A2 couvre les lignes 2 et 3.
const PLAIN = gridHtml([120, 120, 120], Array(8).fill(ROW_PX), (r, c) => `${String.fromCharCode(64 + c)}${r}`);
const cell = (text, attrs = '') => `<td colwidth="120"${attrs}><p>${text}</p></td>`;
const tr = cells => `<tr data-row-height="${ROW_PX}" style="height: ${ROW_PX}px">${cells.join('')}</tr>`;
const MERGED = `<table style="width: 360px;"><colgroup><col style="width: 120px;"><col style="width: 120px;"><col style="width: 120px;"></colgroup><tbody>`
  + tr([cell('A1'), cell('B1'), cell('C1')])
  + tr([cell('A2', ' rowspan="2"'), cell('B2'), cell('C2')])
  + tr([cell('B3'), cell('C3')])
  + tr([cell('A4'), cell('B4'), cell('C4')])
  + tr([cell('A5'), cell('B5'), cell('C5')])
  + tr([cell('A6'), cell('B6'), cell('C6')])
  + '</tbody></table>';

// La ligne 3 porte un saut et un fond jaune sur toutes ses cases : le trait en tirets passe par-dessus ce fond (il est dans son `background-image`, le fond choisi est un `background-color`).
const FILLED = `<table style="width: 360px;"><colgroup><col style="width: 120px;"><col style="width: 120px;"><col style="width: 120px;"></colgroup><tbody>`
  + tr([cell('A1'), cell('B1'), cell('C1')]) + tr([cell('A2'), cell('B2'), cell('C2')])
  + `<tr data-row-height="${ROW_PX}" style="height: ${ROW_PX}px" data-page-break-before="true">${['A3', 'B3', 'C3'].map(t => cell(t, ' style="background-color: #fff3a0"')).join('')}</tr>`
  + tr([cell('A4'), cell('B4'), cell('C4')]) + '</tbody></table>';

// Le bouton « Saut de page » de la barre du haut : dans le panneau ? grisé ? enfoncé ? que dit-il ?
const breakButton = page => page.evaluate((sel) => {
  const b = document.querySelector(sel);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return {
    shown: getComputedStyle(b).display !== 'none' && r.width > 0, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    locked: b.classList.contains('v2-hf-locked'), active: b.classList.contains('is-active'), pressed: b.getAttribute('aria-pressed'), tip: b.getAttribute('data-tip'), aria: b.getAttribute('aria-label'),
    opacity: Number(getComputedStyle(b).opacity),
  };
}, PAGE_BREAK);
// Les lignes (depuis 1) dont le <tr> porte le saut, et celles dont le numéro porte la pastille.
const breakRows = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table > tbody > tr')).map((row, i) => (row.getAttribute('data-page-break-before') === 'true' ? i + 1 : 0)).filter(Boolean));
const breakHeads = page => page.evaluate(() => Array.from(document.querySelectorAll('.v2-grid-rowhead')).map((head, i) => (head.classList.contains('has-break') && !!head.querySelector('.v2-grid-break') ? i + 1 : 0)).filter(Boolean));
const savedBreaks = page => page.evaluate(() => (Editor.getHTML().match(/data-page-break-before="true"/g) || []).length);
const heightOfRow = (page, n) => page.evaluate((i) => Math.round(document.querySelectorAll('.tiptap table > tbody > tr')[i - 1].getBoundingClientRect().height * 10) / 10, n);

// La pastille du numéro de ligne `n` : sa boîte, est-elle dans le panneau, que touche-t-on en son centre (elle ne répond pas au pointeur : ce doit être la poignée de la ligne du dessus) ?
const badgeOf = (page, n) => page.evaluate((i) => {
  const head = document.querySelectorAll('.v2-grid-rowhead')[i - 1];
  const badge = head && head.querySelector('.v2-grid-break');
  if (!badge) return null;
  const r = badge.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2 - 3; // un peu au-dessus du bord : sur le territoire de la ligne du dessus
  const hit = document.elementFromPoint(x, y);
  const cs = getComputedStyle(badge);
  const icon = badge.querySelector('svg');
  return {
    x, y, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, w: r.width, h: r.height,
    hit: hit ? String(hit.className && hit.className.baseVal !== undefined ? hit.className.baseVal : hit.className) : null,
    hitIsHandleAbove: !!hit && hit.classList.contains('v2-grid-handle') && hit.parentElement.dataset.index === String(i - 2),
    bg: cs.backgroundColor, fg: icon ? getComputedStyle(icon).color : cs.color, pointerEvents: cs.pointerEvents,
  };
}, n);

// Les pixels réels du bord haut de la ligne n (colonne 3, loin du curseur) : une capture de 8 px de haut relue dans un canvas ; pour chaque rangée de pixels, la part qui a la couleur de la pastille.
async function dashesAt(page, n, accent) {
  const geo = await page.evaluate((i) => {
    const row = document.querySelectorAll('.tiptap table > tbody > tr')[i - 1];
    const cellEl = row.cells[row.cells.length - 1];
    const r = cellEl.getBoundingClientRect();
    return { left: r.left + 6, width: Math.min(80, r.width - 12), top: row.getBoundingClientRect().top };
  }, n);
  const clip = { x: Math.round(geo.left), y: Math.round(geo.top) - 3, width: Math.round(geo.width), height: 8 };
  const png = await page.screenshot({ clip });
  return page.evaluate(async ({ b64, color }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const [ar, ag, ab] = color.match(/[\d.]+/g).map(Number);
    const ratios = [];
    for (let y = 0; y < canvas.height; y++) {
      let n = 0;
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (Math.abs(data[i] - ar) + Math.abs(data[i + 1] - ag) + Math.abs(data[i + 2] - ab) < 60) n++;
      }
      ratios.push(Math.round(n / canvas.width * 100) / 100);
    }
    return ratios;
  }, { b64: png.toString('base64'), color: accent });
}
// Une ligne en tirets : une ou deux rangées de pixels (le trait fait 2 px) ont environ 6 pixels de couleur sur 10, aucune n'est pleine, aucune autre rangée n'a cette couleur.
const isDashed = ratios => ratios.some(r => r >= 0.4 && r <= 0.8) && ratios.every(r => r <= 0.85);
const isBlank = ratios => ratios.every(r => r === 0);

const opacityOf = (page, selector) => page.evaluate(sel => Number(getComputedStyle(document.querySelector(sel)).opacity), selector);

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Saut de page d'une grille à la souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await freshGrid(page);
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);

  // ---------- 1) Le bouton portrait / paysage est actif dans une grille ----------
  const orient = () => page.evaluate((sel) => {
    const b = document.querySelector(sel);
    return { disabled: b.disabled, pressed: b.getAttribute('aria-pressed'), data: b.dataset.orientation, landscape: PageLayout.isLandscape(), overflowX: document.documentElement.scrollWidth > innerWidth };
  }, ORIENTATION);
  const orientBox = await boxOf(page, ORIENTATION);
  const orient0 = await orient();
  check(`${label} - dans une grille, le bouton portrait / paysage est dans le panneau et actif (ni grisé, ni enfoncé)`, !!orientBox && orientBox.inViewport && !orient0.disabled && orient0.pressed === 'false' && !orient0.landscape, { orientBox, orient0 });
  await realClick(page, ORIENTATION);
  await page.waitForTimeout(500);
  const orient1 = await orient();
  check(`${label} - un vrai clic dessus passe la grille en paysage : le bouton s'enfonce, la page du modèle est en paysage, la page ne défile pas de côté`, orient1.landscape && orient1.pressed === 'true' && orient1.data === 'landscape' && !orient1.overflowX, orient1);
  await realClick(page, ORIENTATION);
  await page.waitForTimeout(500);
  const orient2 = await orient();
  check(`${label} - un second vrai clic revient au portrait`, !orient2.landscape && orient2.pressed === 'false' && orient2.data === 'portrait', orient2);

  // ---------- 2) Grisé sur la première ligne ; un clic dessus ne pose rien ----------
  await loadGrid(page, PLAIN);
  await clickGrid(page, 1, 2);
  let btn = await breakButton(page);
  const btnBox = await boxOf(page, PAGE_BREAK);
  check(`${label} - le bouton « Saut de page » est dans le panneau, sur la première ligne il est grisé (visible, atténué, jamais retiré), non enfoncé`,
    !!btn && btn.shown && btn.inViewport && !!btnBox && btnBox.inViewport && btn.locked && btn.opacity > 0 && btn.opacity < 0.6 && btn.pressed === 'false' && !btn.active, { btn, btnBox });
  check(`${label} - dans une grille son info-bulle parle de la ligne (« Saut de page avant la ligne ») et son libellé de l'export`, !!btn && btn.tip === 'Saut de page avant la ligne' && /^Saut de page avant la ligne sélectionnée/.test(btn.aria || ''), btn);
  await realClick(page, PAGE_BREAK);
  check(`${label} - un vrai clic sur le bouton grisé (première ligne) ne pose aucun saut`, (await savedBreaks(page)) === 0 && (await breakHeads(page)).length === 0, { saved: await savedBreaks(page) });

  // ---------- 3) Un vrai clic pose le saut avant la ligne de la case courante ----------
  await page.waitForTimeout(650);
  await clickGrid(page, 3, 2);
  btn = await breakButton(page);
  check(`${label} - sur la ligne 3 le bouton est actif (plus grisé) et non enfoncé`, !!btn && !btn.locked && btn.opacity > 0.9 && btn.pressed === 'false' && !btn.active, btn);
  await page.mouse.move(btnBox.x, btnBox.y, { steps: 4 });
  await page.waitForTimeout(450);
  // js/shortcuts.js ajoute la touche de l'action (`data-keytip` : « (Alt+Entrée) » ou celle que la personne a choisie) après le texte de l'info-bulle : on lit les deux.
  const tipShown = await page.evaluate((sel) => { const el = document.querySelector(sel); const c = getComputedStyle(el, '::after'); return { content: c.content, opacity: Number(c.opacity), keytip: el.getAttribute('data-keytip') || '' }; }, PAGE_BREAK);
  check(`${label} - survolé, le bouton montre son info-bulle « Saut de page avant la ligne », suivie de sa touche`, tipShown.content === '"Saut de page avant la ligne' + tipShown.keytip + '"' && tipShown.opacity > 0.9, tipShown);
  await realClick(page, PAGE_BREAK);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10, { steps: 3 });
  await page.waitForTimeout(250);
  const rowsSet = await breakRows(page);
  const headsSet = await breakHeads(page);
  btn = await breakButton(page);
  check(`${label} - un vrai clic pose le saut AVANT la ligne 3 seulement : <tr data-page-break-before>, une pastille dans le numéro 3 seulement, un seul saut dans l'enregistrement`,
    rowsSet.join() === '3' && headsSet.join() === '3' && (await savedBreaks(page)) === 1, { rowsSet, headsSet, saved: await savedBreaks(page) });
  check(`${label} - le bouton est maintenant enfoncé (aria-pressed vrai, allumé) et reste actif : un second clic retirera le saut`, !!btn && btn.pressed === 'true' && btn.active && !btn.locked, btn);

  // ---------- 4) Il se voit : trait en tirets, pastille dans le panneau, contraste ----------
  const badge = await badgeOf(page, 3);
  const accent = badge && badge.bg;
  check(`${label} - la pastille du numéro 3 est entièrement dans le panneau, ne répond pas au pointeur (pointer-events: none) et laisse la poignée de la ligne 2 sous elle`, !!badge && badge.inViewport && badge.pointerEvents === 'none' && badge.hitIsHandleAbove, badge);
  const ratio = badge ? await page.evaluate(([a, b]) => window.__ratio(a, b), [badge.fg, badge.bg]) : 0;
  check(`${label} - le glyphe blanc de la pastille se lit sur son fond (${ratio.toFixed(2)}:1, au moins 4,5:1)`, ratio >= 4.5, { fg: badge && badge.fg, bg: badge && badge.bg });
  const onRow3 = await dashesAt(page, 3, accent);
  const onRow2 = await dashesAt(page, 2, accent);
  check(`${label} - le bord haut de la ligne 3 est un trait en tirets de la couleur de la pastille (pixels de la capture : part de la couleur par rangée ${JSON.stringify(onRow3)}) et la ligne 2, sans saut, n'en a aucun`, isDashed(onRow3) && isBlank(onRow2), { onRow3, onRow2 });
  const dashRatio = await page.evaluate(([c]) => {
    const row = document.querySelectorAll('.tiptap table > tbody > tr')[2];
    let el = row.cells[0], bg = 'rgba(0, 0, 0, 0)';
    while (el && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(el).backgroundColor; el = el.parentElement; }
    return { ratio: window.__ratio(c, bg), bg };
  }, [accent]);
  check(`${label} - le trait en tirets se distingue du fond de la grille (${dashRatio.ratio.toFixed(2)}:1, au moins 3:1)`, dashRatio.ratio >= 3, dashRatio);

  // ---------- 5) La pastille ne cache pas la poignée de la ligne 2 : un appui sur la pastille la tire ----------
  const before2 = await heightOfRow(page, 2);
  const before3 = await heightOfRow(page, 3);
  await realDrag(page, { x: badge.x, y: badge.y }, { x: badge.x, y: badge.y + 12 });
  await page.waitForTimeout(250);
  const after2 = await heightOfRow(page, 2);
  const after3 = await heightOfRow(page, 3);
  const stillThere = await breakHeads(page);
  const badgeAfter = await badgeOf(page, 3);
  check(`${label} - un appui sur la pastille tire la poignée de la ligne 2 : sa hauteur passe de ${before2} à ${after2} px (+12), la ligne 3 garde ${after3} px, le saut est toujours sur la ligne 3 et sa pastille l'a suivi dans le panneau`,
    Math.abs(after2 - before2 - 12) <= 2 && Math.abs(after3 - before3) <= 0.6 && stillThere.join() === '3' && !!badgeAfter && badgeAfter.inViewport && badgeAfter.hitIsHandleAbove, { before2, after2, before3, after3, stillThere, badgeAfter });
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);

  // ---------- 6) Un second clic le retire, Ctrl+Z / Ctrl+Y ----------
  await page.waitForTimeout(650);
  await clickGrid(page, 3, 2);
  await realClick(page, PAGE_BREAK);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10, { steps: 3 });
  await page.waitForTimeout(250);
  btn = await breakButton(page);
  const clearedRows = await breakRows(page);
  const clearedHeads = await breakHeads(page);
  const clearedLine = await dashesAt(page, 3, accent);
  check(`${label} - un second vrai clic retire le saut : plus d'attribut, plus de pastille, plus de trait, le bouton n'est plus enfoncé`, clearedRows.length === 0 && clearedHeads.length === 0 && isBlank(clearedLine) && !!btn && btn.pressed === 'false' && !btn.active && !btn.locked, { clearedRows, clearedHeads, clearedLine, btn });
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(`${label} - un seul Ctrl+Z rend le saut retiré (ligne 3, pastille et trait)`, (await breakRows(page)).join() === '3' && (await breakHeads(page)).join() === '3', { rows: await breakRows(page) });
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(250);
  check(`${label} - un seul Ctrl+Y le retire de nouveau`, (await breakRows(page)).length === 0 && (await breakHeads(page)).length === 0, { rows: await breakRows(page) });

  // ---------- 7) Au clavier : Entrée sur le bouton pose le saut une seule fois ----------
  await page.waitForTimeout(650);
  await clickGrid(page, 3, 2);
  await page.evaluate(sel => document.querySelector(sel).focus(), PAGE_BREAK);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check(`${label} - au clavier, Entrée sur le bouton « Saut de page » pose UN saut (avant la ligne 3)`, (await breakRows(page)).join() === '3' && (await savedBreaks(page)) === 1, { rows: await breakRows(page) });
  await page.waitForTimeout(650);
  await realClick(page, PAGE_BREAK);
  await page.waitForTimeout(200);

  // ---------- 8) Une sélection de cases glissée : le saut va avant sa première ligne ----------
  await page.waitForTimeout(650);
  await dragGrid(page, [4, 1], [5, 2]);
  btn = await breakButton(page);
  check(`${label} - une sélection de cases glissée (A4 à B5, lignes 4 et 5) laisse le bouton actif`, !!btn && !btn.locked && btn.pressed === 'false', btn);
  await realClick(page, PAGE_BREAK);
  await page.waitForTimeout(250);
  check(`${label} - le saut est posé avant la PREMIÈRE ligne de la sélection (ligne 4) et pas avant la ligne 5 : une seule pastille, dans le numéro 4`, (await breakRows(page)).join() === '4' && (await breakHeads(page)).join() === '4', { rows: await breakRows(page), heads: await breakHeads(page) });
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);

  // ---------- 9) Fusionner : grisé quand la sélection enjambe un saut, actif quand il est sur son bord haut ----------
  await clickGrid(page, 5, 2);
  await realClick(page, PAGE_BREAK);
  await page.waitForTimeout(650);
  await dragGrid(page, [4, 2], [6, 3]);
  let bar = await barState(page);
  check(`${label} - avec un saut avant la ligne 5, « Fusionner » est grisé (visible, atténué) pour B4 à C6 qui l'enjambe`, !!bar && bar.buttons['cell-merge'].shown && bar.buttons['cell-merge'].locked && bar.buttons['cell-merge'].opacity < 0.6, bar && bar.buttons['cell-merge']);
  await realClick(page, button('cell-merge'));
  check(`${label} - un vrai clic sur « Fusionner » grisé ne fusionne rien`, !mergedOf(await cellsOf(page)), await cellsOf(page));
  await page.waitForTimeout(650);
  await dragGrid(page, [5, 2], [6, 3]);
  bar = await barState(page);
  check(`${label} - « Fusionner » est actif pour B5 à C6 (le saut est sur son bord haut, il ne passe pas à l'intérieur)`, !!bar && !bar.buttons['cell-merge'].locked && bar.buttons['cell-merge'].opacity > 0.9, bar && bar.buttons['cell-merge']);
  await page.waitForTimeout(650);
  await clickGrid(page, 5, 2);
  await realClick(page, PAGE_BREAK);
  await page.waitForTimeout(250);
  check(`${label} - le saut de la ligne 5 se retire (le bouton était enfoncé)`, (await breakRows(page)).length === 0, await breakRows(page));

  // ---------- 9 bis) Le trait en tirets passe par-dessus le fond choisi ----------
  await loadGrid(page, FILLED);
  await clickGrid(page, 4, 1);
  const filledBadge = await badgeOf(page, 3);
  const filledLine = filledBadge ? await dashesAt(page, 3, filledBadge.bg) : [];
  const filledBg = await page.evaluate(() => getComputedStyle(document.querySelectorAll('.tiptap table > tbody > tr')[2].cells[2]).backgroundColor);
  check(`${label} - sur une ligne au fond jaune le trait en tirets est là aussi (${JSON.stringify(filledLine)}) et le fond choisi reste (${filledBg})`, isDashed(filledLine) && filledBg === 'rgb(255, 243, 160)', { filledLine, filledBg });

  // ---------- 10) Au milieu d'une case fusionnée sur plusieurs lignes : grisé ----------
  await loadGrid(page, MERGED);
  await clickGrid(page, 3, 2);
  btn = await breakButton(page);
  check(`${label} - ligne 3, dont la case A2 est fusionnée avec la ligne 2 : le bouton « Saut de page » est grisé (un saut couperait la case en deux)`, !!btn && btn.locked && btn.opacity < 0.6, btn);
  await realClick(page, PAGE_BREAK);
  check(`${label} - un vrai clic dessus ne pose rien`, (await breakRows(page)).length === 0 && (await savedBreaks(page)) === 0, await breakRows(page));
  await page.waitForTimeout(650);
  await clickGrid(page, 4, 2);
  btn = await breakButton(page);
  check(`${label} - ligne 4, au-dessous de la case fusionnée : le bouton est actif`, !!btn && !btn.locked && btn.opacity > 0.9, btn);
  await realClick(page, PAGE_BREAK);
  await page.waitForTimeout(250);
  check(`${label} - il pose le saut avant la ligne 4`, (await breakRows(page)).join() === '4', await breakRows(page));

  // ---------- 11) Un document garde le bouton d'avant : libellé d'avant, aucun état enfoncé, un saut de page inséré ----------
  await freshDocument(page);
  await page.evaluate(() => { EditorCore.getEditor().commands.setContent('<p>Avant</p><p>Après</p>'); });
  await page.waitForTimeout(300);
  const ed = await page.evaluate(() => { const e = EditorCore.getEditor(); e.commands.setTextSelection(e.state.doc.child(0).nodeSize - 1); e.commands.focus(); });
  await page.waitForTimeout(150);
  const asDoc = await breakButton(page);
  check(`${label} - dans un document le bouton garde son libellé d'avant (« Saut de page »), n'est ni grisé ni enfoncé et n'annonce aucun état`, !!asDoc && asDoc.tip === 'Saut de page' && asDoc.pressed === null && !asDoc.locked && !asDoc.active, asDoc);
  await realClick(page, PAGE_BREAK);
  const inserted = await page.evaluate(() => ({ markers: document.querySelectorAll('.tiptap .page-break-marker').length, rowBreaks: (Editor.getHTML().match(/data-page-break-before/g) || []).length }));
  check(`${label} - un vrai clic y insère un saut de page de document (un repère, aucune marque de ligne)`, inserted.markers === 1 && inserted.rowBreaks === 0, inserted);

  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
