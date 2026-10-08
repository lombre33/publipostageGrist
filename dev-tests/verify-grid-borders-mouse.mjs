#!/usr/bin/env node
// Menu « Bordures » de la barre de la case d'une grille (lot B2 de planning/feature-mode-grille-excel.md, demande d'Antoine du 01/10) à la VRAIE souris (page.mouse, Node/Playwright), à la
// taille du panneau Grist (~700x400), en thème clair puis sombre. Une page.evaluate ne déclenche ni un appui « trusted », ni le survol, ni le glissé : c'est ici qu'on s'assure que
//   - le bouton « Bordures » a sa place dans la barre (entre le fond et l'alignement vertical), sur la même ligne, et qu'un clic ouvre un menu SOUS la bande de la barre, tout entier dans le
//     panneau, dont chaque réglage (les huit icônes, les nuances, « Personnalisé », « Par défaut ») est sous le pointeur ;
//   - choisir une couleur ne referme pas le menu, un réglage l'applique à la sélection de cases (une transaction, un Ctrl+Z) et le referme ;
//   - « Intérieures » est grisé (jamais retiré) pour une seule case ou une case fusionnée, un clic dessus ne fait rien ;
//   - le trait choisi est celui des DEUX cases qui se le partagent, « Aucune bordure » le cache des deux côtés, l'éditeur le montre comme enregistré ;
//   - le menu de fond s'ouvre lui aussi sous la bande, et le texte du menu reste lisible en clair comme en sombre ;
//   - la ligne à cocher « Quadrillage » tout en bas du menu (cochée au départ, sous le pointeur dans 700x400, texte lisible) : un clic la décoche sans refermer le menu, le tableau enregistré porte
//     `data-grid-lines="off"`, l'éditeur garde son quadrillage, et la Lecture, relue sur de vrais pixels, ne peint plus que les traits posés (cadre rouge, trait « Par défaut ») ; un second clic la recoche.
// Lancé par run-headless.mjs (groupe Node « gridBordersMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-grid-borders-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.GRID_BORDERS_PORT || 8918);
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
].filter(([, rel]) => rel !== 'umd/exceljs.min.js' || existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[verify-grid-borders-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// « + » puis « Nouvelle grille » à la vraie souris : une grille de départ toute neuve (une grille déjà modifiée ouvre d'abord « Modifications non enregistrées » : « Abandonner »).
async function freshGrid(page) {
  const newBtn = await boxOf(page, '#btn-new');
  await page.mouse.move(newBtn.x, newBtn.y, { steps: 3 });
  await page.waitForTimeout(350);
  const entry = await boxOf(page, '#v2-btn-new-grid');
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
  await page.waitForFunction(() => GridEditor.isActive() && document.querySelectorAll('.v2-grid-colhead').length > 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
}

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


const MENU = '.v2-borders-dropdown';
const RED = '#b91c1c';
const RED_RGB = 'rgb(185, 28, 28)';
const RED_PARTS = [185, 28, 28];
const sameKept = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const PRESET_IDS = ['all', 'outer', 'inner', 'top', 'bottom', 'left', 'right', 'none'];
const preset = id => `${MENU} button[data-action="borders:${id}"]`;
const swatch = color => `${MENU} button[data-action="pen:${color}"]`;

// Le menu : ouvert ? où ? chaque bouton est-il sous le pointeur, grisé, enfoncé ?
const menuState = page => page.evaluate(([menuSel, barSel]) => {
  const menu = document.querySelector(menuSel);
  const dock = document.getElementById('v2-cell-bar-dock');
  if (!menu || !dock) return null;
  const m = menu.getBoundingClientRect();
  const d = dock.getBoundingClientRect();
  const shown = menu.classList.contains('visible') && getComputedStyle(menu).display !== 'none' && m.width > 0;
  const reach = {};
  const states = {};
  menu.querySelectorAll('button[data-action]').forEach((b) => {
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    reach[b.dataset.action] = !!hit && (hit === b || b.contains(hit));
    states[b.dataset.action] = { disabled: b.getAttribute('aria-disabled') === 'true', active: b.classList.contains('is-active'), w: Math.round(r.width), h: Math.round(r.height) };
  });
  return {
    shown, top: m.top, bottom: m.bottom, left: m.left, right: m.right, dockBottom: d.bottom, dockTop: d.top,
    below: m.top >= d.bottom - 1, inside: m.left >= 0 && m.top >= 0 && m.right <= innerWidth && m.bottom <= innerHeight,
    reach, states, unreachable: Object.keys(reach).filter(k => !reach[k]),
  };
}, [MENU, BAR]);

// Le menu de couleur ouvert (celui du fond ou celui des bordures) : sous la bande ? tout entier dans le panneau ? chaque bouton sous le pointeur ? sa hauteur, ses rangées de couleurs gardées.
const openMenuInfo = page => page.evaluate(() => {
  const dock = document.getElementById('v2-cell-bar-dock').getBoundingClientRect();
  const panels = Array.from(document.querySelectorAll('.v2-color-dropdown.visible'));
  const p = panels[0];
  if (!p) return null;
  const r = p.getBoundingClientRect();
  const buttons = Array.from(p.querySelectorAll('button:not(.cp-forget)'));
  const unreachable = buttons.filter((b) => { const q = b.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !(hit === b || b.contains(hit)); }).length;
  const palette = p.querySelector('.cp-grid').getBoundingClientRect();
  const rows = p.querySelector('.cp-rows').getBoundingClientRect();
  return { n: panels.length, buttons: buttons.length, unreachable, kept: Array.from(p.querySelectorAll('.cp-row')).map(row => row.querySelectorAll('.cp-saved').length),
    below: r.top >= dock.bottom - 1, inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.top >= 0, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), dockBottom: Math.round(dock.bottom),
    rowsRightOfPalette: rows.left >= palette.right && rows.left >= p.querySelector('.v2-color-dropdown-footer').getBoundingClientRect().right - 1 };
});

// Les bords des cases (lus sur ce que le document porte, comme l'enregistrement) : « haut,droite,bas,gauche » de la case (ligne, colonne depuis 1), « - » pour un côté sans valeur.
const sidesOf = (page, r, c) => page.evaluate(([row, col]) => {
  const cell = document.querySelectorAll('.tiptap table > tbody > tr')[row - 1].cells[col - 1];
  return ['top', 'right', 'bottom', 'left'].map(s => cell.getAttribute('data-border-' + s) || '-').join(',');
}, [r, c]);
const borderAttrCount = page => page.evaluate(() => (Editor.getHTML().match(/data-border-/g) || []).length);
// Ce que le bouton « Bordures » annonce de son menu (aria-expanded) : « true » ouvert, « false » refermé.
const expandedOf = page => page.evaluate(() => document.getElementById('v2-table-borders-btn').getAttribute('aria-expanded'));
const lookOf = (page, r, c, side) => page.evaluate(([row, col, s]) => {
  const cell = document.querySelectorAll('.tiptap table > tbody > tr')[row - 1].cells[col - 1];
  const style = getComputedStyle(cell);
  return style['border' + s + 'Style'] + ' ' + style['border' + s + 'Color'];
}, [r, c, side]);

// Les pixels d'une petite zone de l'écran (clip en px de page), lus sur une vraie capture : [[r, g, b], ...] ligne par ligne.
async function pixelsOf(page, clip) {
  const png = await page.screenshot({ clip, type: 'png' });
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const out = [];
    for (let i = 0; i < data.length; i += 4) out.push([data[i], data[i + 1], data[i + 2]]);
    return out;
  }, png.toString('base64'));
}
const colorGap = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Menu « Bordures » à la souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await freshGrid(page);
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);
  await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });

  // ---------- 1) Le bouton dans la barre ----------
  await clickGrid(page, 2, 2);
  let bar = await barState(page);
  const chip = bar && bar.buttons['borders-open'];
  const order = bar ? bar.order : [];
  check(`${label} - le bouton « Bordures » est dans la barre de la case, entre le fond et l'alignement vertical, dans la bande, actif`,
    !!chip && chip.shown && chip.inside && !chip.locked && chip.title === 'Bordures' && order.indexOf('borders-open') === order.indexOf('fill-open') + 1 && order.indexOf('valign-top') === order.indexOf('borders-open') + 1, { chip, order });
  check(`${label} - la barre, avec le bouton de plus, tient toujours sur une seule ligne à ${WIDTH} px`, !!bar && bar.height <= 34 && bar.dockHeight <= 40 && bar.order.length === 15, bar && { height: bar.height, dock: bar.dockHeight, n: bar.order.length });

  // ---------- 2) Le menu s'ouvre sous la bande, tout est sous le pointeur ----------
  await realClick(page, button('borders-open'));
  let menu = await menuState(page);
  check(`${label} - un clic sur « Bordures » ouvre le menu SOUS la bande de la barre, tout entier dans le panneau`, !!menu && menu.shown && menu.below && menu.inside, menu && { top: menu.top, bottom: menu.bottom, dockBottom: menu.dockBottom, right: menu.right });
  check(`${label} - le bouton « Bordures » annonce son menu ouvert : aria-expanded vaut « true » (et « false » avant le clic)`, (await expandedOf(page)) === 'true' && !!chip && chip.shown, await expandedOf(page));
  check(`${label} - chaque bouton du menu (8 réglages, 20 nuances en deux rangées, « Personnalisé », « Par défaut », « Quadrillage ») est sous le pointeur`, !!menu && Object.keys(menu.reach).length === 31 && menu.unreachable.length === 0, menu && menu.unreachable);
  check(`${label} - les huit réglages sont des boutons d'au moins 24 px de côté, dans l'ordre Toutes, Extérieures, Intérieures, Haut, Bas, Gauche, Droite, Aucune`,
    !!menu && PRESET_IDS.every(id => menu.states['borders:' + id] && menu.states['borders:' + id].w >= 24 && menu.states['borders:' + id].h >= 24)
    && await page.evaluate(ids => JSON.stringify(Array.from(document.querySelectorAll('.v2-borders-dropdown .v2-borders-presets button')).map(b => b.dataset.action.slice(8))) === JSON.stringify(ids), PRESET_IDS));
  check(`${label} - « Par défaut » est la couleur du stylo au départ`, !!menu && menu.states['pen-auto'].active && !menu.states['pen:' + RED].active, menu && menu.states);
  const colors = await page.evaluate(([menuSel]) => {
    const menu = document.querySelector(menuSel);
    const label = menu.querySelector('.v2-borders-pen');
    const bg = getComputedStyle(menu).backgroundColor;
    const icon = menu.querySelector('.v2-borders-presets button svg');
    return { label: Math.round(window.__ratio(getComputedStyle(label).color, bg) * 100) / 100, icon: Math.round(window.__ratio(getComputedStyle(icon).color, bg) * 100) / 100, text: label.textContent };
  }, [MENU]);
  check(`${label} - le texte « ${colors.text} » du menu est lisible (≥ 4,5:1 : ${colors.label}), les icônes aussi (≥ 3:1 : ${colors.icon})`, colors.label >= 4.5 && colors.icon >= 3, colors);

  // ---------- 3) « Intérieures » grisé pour une seule case, un clic dessus ne fait rien ----------
  check(`${label} - « Intérieures » est grisé (une seule case n'a pas de trait intérieur), les sept autres réglages ne le sont pas`, !!menu && menu.states['borders:inner'].disabled && PRESET_IDS.filter(id => id !== 'inner').every(id => !menu.states['borders:' + id].disabled), menu && menu.states);
  const innerLook = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).opacity, preset('inner'));
  check(`${label} - « Intérieures » grisé est atténué à l'écran, pas retiré (opacité ${innerLook})`, Number(innerLook) < 0.6 && Number(innerLook) > 0);
  await realClick(page, preset('inner'));
  menu = await menuState(page);
  check(`${label} - un clic sur « Intérieures » grisé ne fait rien : le menu reste ouvert, aucun trait écrit`, !!menu && menu.shown && (await borderAttrCount(page)) === 0);

  // ---------- 4) Une couleur ne referme pas le menu ----------
  await realClick(page, swatch(RED));
  menu = await menuState(page);
  check(`${label} - choisir le rouge laisse le menu ouvert, la nuance est cochée et « Par défaut » ne l'est plus, aucun trait écrit`, !!menu && menu.shown && menu.states['pen:' + RED].active && !menu.states['pen-auto'].active && (await borderAttrCount(page)) === 0, menu && { shown: menu.shown, red: menu.states['pen:' + RED], auto: menu.states['pen-auto'] });
  // ---------- 4 bis) « Personnalisé… » : la fenêtre s'ouvre sur la couleur du stylo, la couleur composée devient celle du stylo et le menu revient ----------
  await realClick(page, `${MENU} button[data-action="pen-custom"]`);
  const dialog = await page.evaluate(() => {
    const modal = document.getElementById('pp-color-modal');
    const box = modal && modal.querySelector('.pp-modal-box');
    const r = box ? box.getBoundingClientRect() : null;
    const hex = document.getElementById('pp-color-hex');
    return {
      shown: !!modal && getComputedStyle(modal).display !== 'none', menuOpen: !!document.querySelector('.v2-borders-dropdown.visible'), hex: hex && hex.value, focused: !!hex && document.activeElement === hex,
      inside: !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    };
  });
  check(`${label} - « Personnalisé… » du menu Bordures ferme le menu et ouvre la fenêtre sur le rouge du stylo (${RED.toUpperCase()}), tout entière dans le panneau, le champ du code au clavier`, dialog.shown && !dialog.menuOpen && dialog.hex === RED.toUpperCase() && dialog.focused && dialog.inside, dialog);
  await page.keyboard.type('ff8800');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  menu = await menuState(page);
  check(`${label} - Entrée applique : la fenêtre se ferme, le menu Bordures revient sous la bande avec la pastille gardée enfoncée (le stylo y est) ; ni nuance, ni « Personnalisé… », ni « Par défaut » ne l'est`,
    !!menu && menu.shown && menu.below && menu.inside && menu.states['pen:#ff8800'] && menu.states['pen:#ff8800'].active && !menu.states['pen-custom'].active && !menu.states['pen-auto'].active && !menu.states['pen:' + RED].active
    && menu.unreachable.every(action => action.indexOf('forget:') === 0) && !(await page.evaluate(() => getComputedStyle(document.getElementById('pp-color-modal')).display !== 'none')), menu && { shown: menu.shown, below: menu.below, inside: menu.inside, kept: menu.states['pen:#ff8800'], custom: menu.states['pen-custom'], auto: menu.states['pen-auto'], unreachable: menu.unreachable });
  const penRow = await page.evaluate(() => Array.from(document.querySelectorAll('.v2-borders-dropdown .cp-row .cp-swatch')).map(b => b.dataset.color));
  check(`${label} - la couleur composée est gardée dans la rangée « Couleurs du modèle » du menu Bordures : une pastille de plus`, JSON.stringify(penRow) === JSON.stringify(['#ff8800']), penRow);
  await realClick(page, swatch(RED));
  await realClick(page, `${MENU} .cp-row .cp-swatch[data-color="#ff8800"]`);
  menu = await menuState(page);
  check(`${label} - un clic sur la pastille gardée la rend couleur du stylo sans refermer le menu : sa pastille est enfoncée, le rouge ne l'est plus`, !!menu && menu.shown && menu.states['pen:#ff8800'].active && !menu.states['pen:' + RED].active, menu && menu.states['pen:#ff8800']);
  await realClick(page, swatch(RED));
  menu = await menuState(page);
  check(`${label} - le rouge redevient la couleur du stylo : sa nuance est enfoncée, la pastille gardée ne l'est plus`, !!menu && menu.states['pen:' + RED].active && !menu.states['pen:#ff8800'].active && !menu.states['pen-custom'].active, menu && menu.states);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10, { steps: 3 });

  // ---------- 5) Un réglage s'applique à la sélection, referme le menu, un Ctrl+Z l'annule ----------
  await page.waitForTimeout(650);
  // Le menu (palette et rangées de couleurs gardées côte à côte, ~390 px de large) couvre la moitié gauche de la grille : le clic qui le referme est sur la colonne F.
  await clickGrid(page, 2, 6);
  menu = await menuState(page);
  check(`${label} - un clic dans la grille, hors du menu, referme le menu : le bouton annonce « false »`, !!menu && !menu.shown && (await expandedOf(page)) === 'false', { shown: menu && menu.shown, expanded: await expandedOf(page) });
  await dragGrid(page, [2, 2], [4, 4]);
  await realClick(page, button('borders-open'));
  menu = await menuState(page);
  check(`${label} - à trois cases de large, « Intérieures » est actif et le rouge est toujours la couleur du stylo`, !!menu && menu.shown && !menu.states['borders:inner'].disabled && menu.states['pen:' + RED].active, menu && menu.states);
  await realClick(page, preset('outer'));
  menu = await menuState(page);
  check(`${label} - « Bordures extérieures » referme le menu, et le bouton annonce « false »`, !!menu && !menu.shown && (await expandedOf(page)) === 'false', await expandedOf(page));
  const corner = await sidesOf(page, 2, 2);
  const middle = await sidesOf(page, 3, 3);
  const leftNeighbour = await sidesOf(page, 3, 1);
  const aboveNeighbour = await sidesOf(page, 1, 3);
  const rightEdge = await sidesOf(page, 3, 4);
  const count = await borderAttrCount(page);
  check(`${label} - le cadre rouge de B2:D4 : coin B2 haut et gauche, rien dans la case du milieu, et les cases voisines (A3, C1) portent le même trait sur le côté partagé (${count} bords écrits : 12 traits x 2 cases)`,
    corner === `${RED},-,-,${RED}` && middle === '-,-,-,-' && leftNeighbour === `-,${RED},-,-` && aboveNeighbour === `-,-,${RED},-` && rightEdge === `-,${RED},-,-` && count === 24, { corner, middle, leftNeighbour, aboveNeighbour, rightEdge, count });
  const looks = [await lookOf(page, 2, 2, 'Top'), await lookOf(page, 2, 2, 'Left'), await lookOf(page, 1, 3, 'Bottom'), await lookOf(page, 3, 3, 'Top')];
  check(`${label} - l'éditeur montre le trait rouge sur le cadre (solid ${RED_RGB}) et le trait de départ à l'intérieur`, looks.slice(0, 3).every(l => l === 'solid ' + RED_RGB) && looks[3].startsWith('solid') && !looks[3].includes(RED_RGB), looks);
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  check(`${label} - un seul Ctrl+Z défait tout le cadre : plus aucun bord écrit`, (await borderAttrCount(page)) === 0, await borderAttrCount(page));
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(200);
  check(`${label} - Ctrl+Y le rétablit d'un coup (24 bords)`, (await borderAttrCount(page)) === 24, await borderAttrCount(page));

  // ---------- 6) « Aucune bordure » ----------
  await page.waitForTimeout(650);
  await dragGrid(page, [3, 3], [3, 4]);
  await realClick(page, button('borders-open'));
  await realClick(page, preset('none'));
  const hiddenLook = [await lookOf(page, 3, 3, 'Top'), await lookOf(page, 3, 3, 'Right'), await lookOf(page, 3, 4, 'Left')];
  const hiddenSides = await sidesOf(page, 3, 3);
  const rightOfBlock = await sidesOf(page, 3, 5);
  check(`${label} - « Aucune bordure » sur C3:D3 cache les quatre côtés des deux cases, des deux côtés d'un trait partagé (C3 : ${hiddenSides}, E3 : ${rightOfBlock}) ; l'éditeur ne les dessine plus`,
    hiddenSides === 'none,none,none,none' && rightOfBlock.split(',')[3] === 'none' && hiddenLook.every(l => l.startsWith('hidden')), { hiddenSides, hiddenLook, rightOfBlock });
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  check(`${label} - un Ctrl+Z rend les traits de C3:D3`, (await sidesOf(page, 3, 3)) === '-,-,-,-' && (await borderAttrCount(page)) === 24, { sides: await sidesOf(page, 3, 3), count: await borderAttrCount(page) });

  // ---------- 7) Une case fusionnée n'a pas de trait intérieur ----------
  await loadGrid(page, gridHtml([100, 100, 100, 100], [30, 30, 30, 30], (r, c) => `${String.fromCharCode(64 + c)}${r}`));
  await dragGrid(page, [2, 2], [3, 3]);
  await realClick(page, button('cell-merge'));
  await realClick(page, button('borders-open'));
  menu = await menuState(page);
  check(`${label} - une case fusionnée n'a aucun trait intérieur : « Intérieures » est grisé, « Extérieures » et « Toutes » ne le sont pas`, !!menu && menu.shown && menu.states['borders:inner'].disabled && !menu.states['borders:outer'].disabled && !menu.states['borders:all'].disabled, menu && menu.states);
  await realClick(page, preset('all'));
  const mergedSides = await sidesOf(page, 2, 2);
  const mergedCount = await borderAttrCount(page);
  check(`${label} - « Toutes les bordures » sur la case fusionnée : le trait rouge sur son pourtour, une seule valeur par côté (${mergedSides}), ${mergedCount} bords écrits : les 4 de la case et un par case voisine du pourtour`, mergedSides === `${RED},${RED},${RED},${RED}` && mergedCount === 12, { mergedSides, mergedCount });
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);

  // ---------- 7 bis) « Quadrillage » : la ligne à cocher du menu, la Lecture sur de vrais pixels ----------
  const GRIDLINES = `${MENU} button[data-action="gridlines"]`;
  const gridLinesChecked = () => page.evaluate(sel => document.querySelector(sel).getAttribute('aria-checked'), GRIDLINES);
  const savedOff = () => page.evaluate(() => /<table[^>]*data-grid-lines="off"/.test(Editor.getHTML()));
  const shownNow = () => page.evaluate(() => GridEditor.gridLinesShown(EditorCore.getEditor()));
  const plainLook = () => page.evaluate(() => { const cell = document.querySelectorAll('.tiptap table > tbody > tr')[3].cells[3]; const s = getComputedStyle(cell); return `${s.borderTopStyle} ${s.borderTopColor} ${s.borderLeftStyle} ${s.borderLeftColor}`; });
  // La Lecture a besoin d'une ligne à lire : un enregistrement de test, comme celui des scénarios (dev-tests/scenarios-grid.js:useReadRecord).
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    const record = { id: 1, Nom: 'Alpha Durand' };
    stub.setVariables('GrilleLecture', { Nom: 'Text' });
    stub.setRows('GrilleLecture', [record]);
    await GristAPI.refreshSchema();
    stub.fireRecord(record, 'GrilleLecture');
  });
  await loadGrid(page, gridHtml([100, 100, 100, 100], [30, 30, 30, 30], () => ''));
  await dragGrid(page, [2, 2], [3, 3]);
  await realClick(page, button('borders-open'));
  await realClick(page, swatch(RED));
  await realClick(page, preset('outer')); // le cadre rouge de B2:C3
  await clickGrid(page, 1, 1);
  await realClick(page, button('borders-open'));
  await realClick(page, `${MENU} button[data-action="pen-auto"]`);
  await realClick(page, preset('bottom')); // un trait « Par défaut » sous A1
  await page.waitForTimeout(650);
  await clickGrid(page, 4, 4);
  await realClick(page, button('borders-open'));
  menu = await menuState(page);
  const row = await page.evaluate(([sel, menuSel]) => {
    const btn = document.querySelector(sel);
    const menuEl = document.querySelector(menuSel);
    const bg = getComputedStyle(menuEl).backgroundColor;
    const name = btn.querySelector('.v2-borders-gridlines-name');
    const hint = btn.querySelector('small');
    const r = btn.getBoundingClientRect();
    return {
      checked: btn.getAttribute('aria-checked'), role: btn.getAttribute('role'), name: name.textContent, hint: hint.textContent, title: btn.title,
      nameRatio: Math.round(window.__ratio(getComputedStyle(name).color, bg) * 100) / 100, hintRatio: Math.round(window.__ratio(getComputedStyle(hint).color, bg) * 100) / 100,
      w: Math.round(r.width), h: Math.round(r.height), bottom: r.bottom, font: getComputedStyle(btn).fontFamily,
    };
  }, [GRIDLINES, MENU]);
  check(`${label} - la ligne « Quadrillage » est tout en bas du menu, sous le pointeur, tout dans le panneau (bas du menu à ${menu && Math.round(menu.bottom)} px sur ${HEIGHT}), cochée au départ`,
    !!menu && menu.shown && menu.inside && menu.reach.gridlines === true && row.checked === 'true' && row.role === 'checkbox' && row.name === 'Quadrillage' && row.hint === 'Lecture et exports' && row.w >= 150 && row.h >= 24 && row.bottom <= menu.bottom, { row, menu: menu && { bottom: menu.bottom, inside: menu.inside } });
  check(`${label} - son libellé (${row.nameRatio}:1) et sa mention « ${row.hint} » (${row.hintRatio}:1) sont lisibles (≥ 4,5:1), dans la police du système`, row.nameRatio >= 4.5 && row.hintRatio >= 4.5 && !/manrope/i.test(row.font), row);
  const editorBefore = await plainLook();

  // un clic décoche, sans refermer le menu
  await realClick(page, GRIDLINES);
  menu = await menuState(page);
  check(`${label} - un clic sur « Quadrillage » le décoche et laisse le menu ouvert ; le modèle enregistré porte data-grid-lines="off", l'éditeur garde son quadrillage (${editorBefore})`,
    !!menu && menu.shown && (await gridLinesChecked()) === 'false' && !(await shownNow()) && (await savedOff()) && (await plainLook()) === editorBefore && editorBefore.startsWith('solid '), { checked: await gridLinesChecked(), look: await plainLook() });
  await page.mouse.click(WIDTH - 10, HEIGHT - 10);
  await page.waitForTimeout(200);

  // la Lecture, sur de vrais pixels : à plat (case vide) le fond de la case ; à la frontière de deux cases le trait, ou rien
  const readingPaint = async () => {
    await page.evaluate(() => document.getElementById('btn-mode-read').click());
    await page.waitForFunction(() => document.querySelectorAll('#reader-container table > tbody > tr').length >= 4, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const spots = await page.evaluate(() => {
      const rows = document.querySelectorAll('#reader-container table > tbody > tr');
      const box = (r, c) => rows[r].cells[c].getBoundingClientRect();
      const inside = box(3, 3);
      const left = box(3, 3).left; // frontière entre D4 et C4 : aucun trait posé
      const bFrame = box(1, 1); // B2
      const a1 = box(0, 0);
      return {
        background: [inside.left + inside.width / 2, inside.top + inside.height / 2],
        plain: [left, inside.top + inside.height / 2],
        frame: [bFrame.left, bFrame.top + bFrame.height / 2],
        placed: [a1.left + a1.width / 2, a1.bottom],
      };
    });
    const sample = async ([x, y]) => pixelsOf(page, { x: Math.round(x) - 3, y: Math.round(y) - 3, width: 7, height: 7 });
    const bg = (await sample(spots.background))[24];
    const nearest = (pixels, wanted) => Math.min(...pixels.map(p => colorGap(p, wanted)));
    const out = {
      plainDiffers: Math.max(...(await sample(spots.plain)).map(p => colorGap(p, bg))) > 25,
      plainGrey: nearest(await sample(spots.plain), [184, 192, 201]) <= 12,
      frameRed: nearest(await sample(spots.frame), RED_PARTS) <= 12,
      placedGrey: nearest(await sample(spots.placed), [184, 192, 201]) <= 12,
    };
    await page.evaluate(() => document.getElementById('btn-mode-edit').click());
    await page.waitForFunction(() => !document.body.classList.contains('pp-editor-hidden'), null, { timeout: 15000 });
    await page.waitForTimeout(400);
    return out;
  };
  const hiddenPaint = await readingPaint();
  check(`${label} - Lecture, quadrillage masqué : plus aucun trait entre deux cases que rien ne borde, mais le cadre rouge et le trait « Par défaut » sont peints (pixels relus : ${JSON.stringify(hiddenPaint)})`,
    !hiddenPaint.plainDiffers && !hiddenPaint.plainGrey && hiddenPaint.frameRed && hiddenPaint.placedGrey, hiddenPaint);

  // un second clic recoche : la Lecture retrouve son quadrillage
  await clickGrid(page, 4, 4);
  await realClick(page, button('borders-open'));
  check(`${label} - rouvert, le menu montre « Quadrillage » décoché`, (await gridLinesChecked()) === 'false');
  await realClick(page, GRIDLINES);
  menu = await menuState(page);
  check(`${label} - un second clic recoche « Quadrillage » (menu toujours ouvert) et retire la marque du modèle enregistré`, !!menu && menu.shown && (await gridLinesChecked()) === 'true' && (await shownNow()) && !(await page.evaluate(() => /data-grid-lines/.test(Editor.getHTML()))));
  await page.mouse.click(WIDTH - 10, HEIGHT - 10);
  await page.waitForTimeout(200);
  const shownPaint = await readingPaint();
  check(`${label} - Lecture, quadrillage montré : le trait entre deux cases est de nouveau peint, avec le cadre rouge et le trait « Par défaut » (pixels relus : ${JSON.stringify(shownPaint)})`,
    shownPaint.plainDiffers && shownPaint.plainGrey && shownPaint.frameRed && shownPaint.placedGrey, shownPaint);

  // un seul Ctrl+Z défait le dernier geste (la coche remise)
  await page.waitForTimeout(650);
  await page.evaluate(() => EditorCore.getEditor().commands.focus());
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  check(`${label} - un seul Ctrl+Z défait le dernier clic sur « Quadrillage » : le quadrillage est de nouveau masqué`, !(await shownNow()) && (await savedOff()), { shown: await shownNow() });
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);

  // ---------- 8) Le menu de fond s'ouvre lui aussi sous la bande ----------
  await clickGrid(page, 2, 1);
  await realClick(page, button('fill-open'));
  const fill = await page.evaluate(() => {
    const dock = document.getElementById('v2-cell-bar-dock').getBoundingClientRect();
    const panels = Array.from(document.querySelectorAll('.v2-color-dropdown')).filter(p => p.classList.contains('visible') && !p.classList.contains('v2-borders-dropdown'));
    const p = panels[0];
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const unreachable = Array.from(p.querySelectorAll('button:not(.cp-forget)')).filter(b => { const q = b.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !(hit === b || b.contains(hit)); }).length;
    return { below: r.top >= dock.bottom - 1, inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.top >= 0, unreachable, n: panels.length, top: r.top, bottom: r.bottom, dockBottom: dock.bottom };
  });
  check(`${label} - le menu de fond s'ouvre sous la bande, tout dans le panneau et sous le pointeur, et un seul menu est ouvert à la fois`, !!fill && fill.below && fill.inside && fill.unreachable === 0 && fill.n === 1, fill);
  // ---------- 8 bis) Dix couleurs gardées dans chaque rangée : les deux menus restent sous la bande ----------
  // Les rangées « Couleurs du modèle » et « Couleurs du document » passent à droite de la palette dans un panneau court : le menu ne grandit pas avec elles (en passant à la ligne sous la palette
  // il aurait glissé sur la bande de la barre).
  await realClick(page, button('fill-open'));
  await page.evaluate(() => {
    ['#7c3aed', '#be123c', '#0f766e', '#4338ca', '#9a3412', '#334155', '#a21caf', '#0369a1', '#15803d', '#ca8a04'].forEach(color => ColorStore.add('model', color));
    ['#111827', '#7f1d1d', '#14532d', '#1e3a8a', '#4c1d95', '#831843', '#713f12', '#164e63', '#3f6212', '#9f1239'].forEach(color => ColorStore.add('document', color));
  });
  await realClick(page, button('fill-open'));
  const fullFill = await openMenuInfo(page);
  check(`${label} - avec dix couleurs gardées dans chaque rangée (${fullFill && fullFill.kept.join(' et ')}) le menu de fond s'ouvre toujours sous la bande (haut ${fullFill && fullFill.top} pour une bande qui finit à ${fullFill && fullFill.dockBottom}), tout entier dans le panneau (${fullFill && fullFill.h} px de haut, au plus 207), ses ${fullFill && fullFill.buttons} boutons sous le pointeur, les rangées à droite de la palette et de son pied`,
    !!fullFill && fullFill.below && fullFill.inside && fullFill.h <= 207 && fullFill.unreachable === 0 && fullFill.n === 1 && fullFill.buttons === 72 && sameKept(fullFill.kept, [10, 10]) && fullFill.rowsRightOfPalette, fullFill);
  await realClick(page, button('borders-open'));
  const fullBorders = await openMenuInfo(page);
  check(`${label} - le menu Bordures aussi (${fullBorders && fullBorders.kept.join(' et ')} couleurs gardées) : sous la bande (haut ${fullBorders && fullBorders.top} pour une bande qui finit à ${fullBorders && fullBorders.dockBottom}), tout entier dans le panneau (${fullBorders && fullBorders.h} px de haut, au plus 207), ses ${fullBorders && fullBorders.buttons} boutons sous le pointeur, les rangées à droite de la palette et de son pied`,
    !!fullBorders && fullBorders.below && fullBorders.inside && fullBorders.h <= 207 && fullBorders.unreachable === 0 && fullBorders.n === 1 && fullBorders.buttons === 51 && sameKept(fullBorders.kept, [10, 10]) && fullBorders.rowsRightOfPalette, fullBorders);
  await page.evaluate(() => { PageLayout.setCustomColors(['#ff8800']); Templates.updateDocumentSettings({ colors: null }); });
  await realClick(page, button('fill-open'));
  await realClick(page, button('borders-open'));
  menu = await menuState(page);
  const stillFill = await page.evaluate(() => Array.from(document.querySelectorAll('.v2-color-dropdown')).filter(p => p.classList.contains('visible')).length);
  check(`${label} - ouvrir « Bordures » referme le menu de fond (un seul menu ouvert)`, !!menu && menu.shown && stillFill === 1, { shown: menu && menu.shown, open: stillFill });
  await realClick(page, button('borders-open'));
  menu = await menuState(page);
  check(`${label} - un second clic sur « Bordures » referme le menu`, !!menu && !menu.shown);

  // Au clavier : le bouton reçoit le focus, Entrée ouvre le menu.
  await page.evaluate(sel => document.querySelector(sel).focus(), button('borders-open'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  menu = await menuState(page);
  check(`${label} - au clavier, Entrée sur « Bordures » ouvre le menu`, !!menu && menu.shown);
  await page.mouse.click(WIDTH - 10, HEIGHT - 10);
  await page.waitForTimeout(150);

  // ---------- 9) Un tableau de document : pas de bouton « Bordures » ----------
  await page.evaluate(() => {
    GridEditor.setActive(false);
    EditorCore.getEditor().commands.setContent('<p>Avant</p><table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table><p>Après</p>');
  });
  await page.waitForTimeout(450);
  const t = await boxOf(page, '.tiptap table tr:nth-child(2) > td:nth-child(2)');
  await page.mouse.click(t.x, t.y);
  await page.waitForTimeout(350);
  const classic = await page.evaluate(() => {
    const del = document.querySelector('.v2-floating-toolbar button[data-action="table-del"]');
    const bar = del && del.closest('.v2-floating-toolbar');
    if (!bar) return null;
    return Array.from(bar.querySelectorAll('button[data-action]')).filter(b => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0).map(b => b.dataset.action);
  });
  check(`${label} - tableau de document : la barre n'a pas de bouton « Bordures » (ni d'alignement vertical) ; ses boutons de fusion sont ceux du tableau de document`, !!classic && !classic.includes('borders-open') && classic.join() === 'row-before,row-after,row-del,col-before,col-after,col-del,table-del,cell-merge,cell-split,caption,fill-open', classic);

  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
