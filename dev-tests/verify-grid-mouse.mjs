#!/usr/bin/env node
// Mode grille (js/grid-editor.js) à la VRAIE souris et au vrai clavier (page.mouse / page.keyboard, Node/Playwright), à la taille du panneau Grist d'Antoine (~700x400),
// en thème clair puis sombre. dev-tests/scenarios-grid.js (groupe « grid ») vérifie la logique DANS la page avec des évènements synthétiques ; une page.evaluate ne
// déclenche ni un geste « trusted », ni le survol d'un menu, ni la molette, ni une vraie frappe : c'est ici qu'on s'assure que
//   - « + » puis « Nouvelle grille » se choisit à la souris et la grille tient dans le panneau (bandeaux visibles, pas recouverts) ;
//   - tirer le trait d'une colonne ou d'une ligne marche au vrai pointeur : aperçu en direct, info-bulle de la taille, UNE transaction, un seul Annuler (Ctrl+Z) ;
//   - cliquer une lettre, un numéro ou le coin sélectionne ; Tab, flèches, Ctrl+A et Suppr se comportent comme dans un tableur et ne sortent jamais du tableau ;
//   - les bandeaux restent collés au défilement (molette, vertical et horizontal) et la barre de la case reste dans le panneau ;
//   - les textes des bandeaux, leur état « sélectionné » et le cadre de la case courante tiennent les contrastes de la charte (F5), clair et sombre.
// Lancé par run-headless.mjs (groupe Node « gridMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-grid-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.GRID_MOUSE_PORT || 8909);
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
if (!OFFLINE) console.log('[verify-grid-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
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
  // `?dev` : sans lui, « Nouvelle grille » reste cachée du menu « + » (la grille n'a pas encore son export Excel).
  await page.goto(`${BASE}/_test-harness.html?dev`, { waitUntil: 'load' });
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
  return b;
}

// Tire à la vraie souris d'un point à un autre : appuyé, déplacé en `steps` pas, `during` lu AVANT le relâcher, puis relâché.
async function realDrag(page, from, to, during) {
  await page.mouse.move(from.x, from.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  const live = during ? await during() : null;
  await page.mouse.up();
  await page.waitForTimeout(150);
  return live;
}

const gridState = page => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  const doc = ed.state.doc;
  const table = doc.child(0);
  const widths = [];
  table.firstChild.forEach(cell => widths.push(cell.attrs.colwidth && cell.attrs.colwidth[0]));
  const heights = [];
  table.forEach(row => heights.push(row.attrs.rowHeight));
  const sel = ed.state.selection;
  let selected = 0;
  if (sel.forEachCell) sel.forEachCell(() => { selected++; });
  const insideTable = !!sel.$anchorCell || (sel.$from.depth >= 1 && sel.$from.node(1).type.name === 'table');
  return {
    rows: table.childCount, cols: table.firstChild.childCount, widths, heights, text: doc.textContent, selected, insideTable,
    cellsByWidth: (() => { const col0 = new Set(); table.forEach(row => col0.add(String(row.child(0).attrs.colwidth))); return Array.from(col0); })(),
  };
});

// Contraste WCAG de deux couleurs CSS « rgb(...) » (le fond rgba(0,0,0,0) d'un parent est remonté par `backdrop`).
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

// « + » puis « Nouvelle grille » à la vraie souris : une grille de départ toute neuve (le menu s'ouvre au survol, l'entrée est visible grâce à ?dev).
async function freshGrid(page) {
  const newBtn = await boxOf(page, '#btn-new');
  await page.mouse.move(newBtn.x, newBtn.y, { steps: 3 });
  await page.waitForTimeout(350);
  const entry = await boxOf(page, '#v2-btn-new-grid');
  await page.mouse.move(entry.x, entry.y, { steps: 4 });
  await page.mouse.click(entry.x, entry.y);
  await page.waitForFunction(() => GridEditor.isActive() && document.querySelectorAll('.v2-grid-colhead').length > 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10); // hors du menu
  return entry;
}

// Un clic réel exige que la cible soit DANS le panneau : sinon page.mouse clique dans le vide et le test échouerait pour une mauvaise raison.
async function clickInPanel(page, selector, label) {
  const b = await boxOf(page, selector);
  const touched = b && await page.evaluate(({ sel, x, y }) => { const top = document.elementFromPoint(x, y); const el = document.querySelector(sel); return !!top && el.contains(top); }, { sel: selector, x: b.x, y: b.y });
  if (!b || !b.inViewport || !touched) { check(`${label} : ${selector} est sous le pointeur, dans le panneau (cible d'un vrai clic)`, false, { b, touched }); return null; }
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.click(b.x, b.y);
  return b;
}

const rowHeightNow = (page, i) => page.evaluate(n => document.querySelectorAll('.tiptap table > tbody > tr')[n].getBoundingClientRect().height, i);

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Mode grille à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);

  // 1) « + » puis « Nouvelle grille » à la souris.
  const entry = await freshGrid(page);
  check(`${label} - le menu « + » montre « Nouvelle grille » (avec ?dev), dans le panneau`, !!entry && entry.inViewport && entry.w > 0, entry);
  const start = await gridState(page);
  check(`${label} - vrai clic sur « Nouvelle grille » : une grille de 15 lignes x 6 colonnes de 100 px, lignes de 28 px`,
    start.rows === 15 && start.cols === 6 && start.widths.every(w => w === 100) && start.heights.every(h => h === 28), start);

  // 2) Ce qui se voit dans le panneau : les bandeaux et la première case sont à portée de souris, rien ne les recouvre.
  const layout = await page.evaluate(() => {
    const hit = sel => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { ok: !!top && el.contains(top), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }; };
    const container = document.getElementById('editor-container').getBoundingClientRect();
    return { corner: hit('.v2-grid-corner'), col: hit('.v2-grid-colhead'), row: hit('.v2-grid-rowhead'), cell: hit('.tiptap table td'), container: [Math.round(container.left), Math.round(container.top), Math.round(container.width), Math.round(container.height)],
      a4: document.getElementById('editor-container').classList.contains('a4-preview'), sheet: getComputedStyle(document.querySelector('.v2-page-sheet')).boxShadow };
  });
  check(`${label} - le coin, la lettre A, le numéro 1 et la première case sont visibles et atteignables à la souris (rien ne les recouvre)`, layout.corner.ok && layout.col.ok && layout.row.ok && layout.cell.ok, layout);
  check(`${label} - aucune feuille A4 : pas de classe a4-preview, pas d'ombre de page`, !layout.a4 && layout.sheet === 'none', { a4: layout.a4, sheet: layout.sheet });

  // 3) Tirer le trait entre A et B au vrai pointeur : aperçu en direct, info-bulle, UNE transaction, un seul Ctrl+Z. Le curseur est dans la case A1 (première ligne) :
  //    la barre de la case ne doit pas recouvrir le bandeau des lettres, sinon la poignée n'est plus atteignable.
  await clickInPanel(page, '.tiptap table tr:nth-child(1) td:nth-child(1)', `${label} - colonne`);
  await page.keyboard.type('Nom');
  await page.waitForTimeout(700); // hors du groupe d'historique de la frappe
  const handleA = await boxOf(page, '.v2-grid-colhead:nth-child(1) .v2-grid-handle');
  const covered = await page.evaluate(() => {
    const hits = sel => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!top && (el === top || el.contains(top)); };
    const bar = document.querySelector('.v2-floating-toolbar.visible');
    return { handleA: hits('.v2-grid-colhead:nth-child(1) .v2-grid-handle'), letterC: hits('.v2-grid-colhead:nth-child(3)'), number1: hits('.v2-grid-rowhead:nth-child(1)'), bar: bar ? Array.from(bar.getBoundingClientRect().toJSON ? [bar.getBoundingClientRect().left, bar.getBoundingClientRect().top, bar.getBoundingClientRect().right, bar.getBoundingClientRect().bottom] : []) : null };
  });
  check(`${label} - le curseur dans la première ligne : la barre de la case ne recouvre ni la poignée A|B, ni la lettre C, ni le numéro 1`, covered.handleA && covered.letterC && covered.number1, covered);
  await page.evaluate(() => { window.__gridTx = 0; EditorCore.getEditor().on('transaction', ({ transaction }) => { if (transaction.docChanged) window.__gridTx++; }); });
  const liveCol = await realDrag(page, { x: handleA.x, y: handleA.y }, { x: handleA.x + 60, y: handleA.y }, () => page.evaluate(() => ({
    width: document.querySelector('.tiptap table col').getBoundingClientRect().width,
    head: document.querySelector('.v2-grid-colhead').getBoundingClientRect().width,
    tip: (document.querySelector('.v2-grid-tip') || {}).textContent || null,
    txDuring: window.__gridTx,
    cursor: getComputedStyle(document.body).cursor,
  })));
  const afterCol = await gridState(page);
  const txCol = await page.evaluate(() => window.__gridTx);
  check(`${label} - tirer le trait A|B de 60 px : la colonne passe à 160 px en direct, l'info-bulle l'annonce, rien n'est enregistré avant le relâcher`,
    liveCol && Math.abs(liveCol.width - 160) <= 1 && Math.abs(liveCol.head - 160) <= 1 && liveCol.tip === '160 px' && liveCol.txDuring === 0 && liveCol.cursor === 'col-resize', liveCol);
  check(`${label} - au relâcher : UNE transaction, toute la colonne A à 160 px, les autres colonnes inchangées`,
    txCol === 1 && afterCol.cellsByWidth.join() === '160' && afterCol.widths.slice(1).every(w => w === 100), { txCol, afterCol });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const undoneCol = await gridState(page);
  check(`${label} - un seul Ctrl+Z rend la colonne A à 100 px (et le texte saisi avant reste)`, undoneCol.cellsByWidth.join() === '100' && undoneCol.text === 'Nom', undoneCol);

  // 4) Tirer le trait sous le numéro 1 : hauteur de ligne ; plancher = la hauteur du texte ; Échap annule.
  await freshGrid(page);
  const handle1 = await boxOf(page, '.v2-grid-rowhead:nth-child(1) .v2-grid-handle');
  const liveRow = await realDrag(page, { x: handle1.x, y: handle1.y }, { x: handle1.x, y: handle1.y + 40 }, () => page.evaluate(() => ({
    height: document.querySelector('.tiptap table > tbody > tr').getBoundingClientRect().height,
    head: document.querySelector('.v2-grid-rowhead').getBoundingClientRect().height,
    tip: (document.querySelector('.v2-grid-tip') || {}).textContent || null,
    cursor: getComputedStyle(document.body).cursor,
  })));
  const afterRow = await gridState(page);
  const shownRow = await rowHeightNow(page, 0);
  check(`${label} - tirer le trait sous le 1 de 40 px : la ligne passe à ~69 px EN DIRECT (la vraie ligne, pas seulement le bandeau), l'info-bulle l'annonce, puis 69 px enregistrés`,
    Math.abs(liveRow.height - 68.9) <= 2 && Math.abs(liveRow.head - liveRow.height) <= 1.5 && /^\d+ px$/.test(liveRow.tip || '') && liveRow.cursor === 'row-resize'
      && afterRow.heights[0] >= 66 && afterRow.heights[0] <= 70 && afterRow.heights.slice(1).every(h => h === 28) && Math.abs(shownRow - liveRow.height) <= 1.5, { liveRow, shownRow, heights: afterRow.heights.slice(0, 3) });
  await clickInPanel(page, '.tiptap table tr:nth-child(2) td:nth-child(2)', `${label} - plancher`);
  await page.keyboard.type('Une ligne de texte assez longue pour passer sur trois lignes dans cette case');
  await page.waitForTimeout(250);
  const natural = await rowHeightNow(page, 1);
  const handle2 = await boxOf(page, '.v2-grid-rowhead:nth-child(2) .v2-grid-handle');
  await realDrag(page, { x: handle2.x, y: Math.min(handle2.y, HEIGHT - 6) }, { x: handle2.x, y: Math.min(handle2.y, HEIGHT - 6) - 150 });
  const floorState = await gridState(page);
  const floorShown = await rowHeightNow(page, 1);
  check(`${label} - tirer la ligne 2 vers le haut s'arrête à la hauteur de son texte (plancher), jamais en dessous`,
    floorState.heights[1] >= Math.floor(natural) - 1 && Math.abs(floorShown - natural) <= 2.5 && natural > 60, { natural, floor: floorState.heights[1], shown: floorShown });
  const handle3 = await boxOf(page, '.v2-grid-colhead:nth-child(3) .v2-grid-handle');
  const widthsBefore = (await gridState(page)).widths.join();
  await page.mouse.move(handle3.x, handle3.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(handle3.x + 70, handle3.y, { steps: 6 });
  const duringEsc = await page.evaluate(() => document.querySelector('.tiptap table col:nth-child(3)').getBoundingClientRect().width);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(200);
  const afterEsc = await gridState(page);
  const bodyClass = await page.evaluate(() => document.body.className);
  const previewLeft = await page.evaluate(() => !!document.getElementById('pp-grid-resize-preview'));
  check(`${label} - Échap pendant le geste : la largeur d'avant est rendue, rien n'est enregistré, le pointeur redevient normal, l'aperçu est retiré`,
    Math.abs(duringEsc - 170) <= 1 && afterEsc.widths.join() === widthsBefore && !/pp-grid-resizing/.test(bodyClass) && !previewLeft, { duringEsc, before: widthsBefore, after: afterEsc.widths.join(), bodyClass, previewLeft });

  // 5) Cliquer une lettre, un numéro, le coin (vrai clic) ; Suppr vide, Ctrl+Z rend.
  await freshGrid(page);
  await clickInPanel(page, '.tiptap table tr:nth-child(1) td:nth-child(1)', `${label} - sélection`);
  await page.keyboard.type('Nom');
  await clickInPanel(page, '.tiptap table tr:nth-child(3) td:nth-child(3)', `${label} - sélection`);
  await page.keyboard.type('Total');
  await page.waitForTimeout(700);
  const colB = await boxOf(page, '.v2-grid-colhead:nth-child(2)');
  await page.mouse.click(colB.x - 6, colB.y);
  await page.waitForTimeout(150);
  const selCol = await gridState(page);
  const lit = await page.evaluate(() => ({ cols: Array.from(document.querySelectorAll('.v2-grid-colhead.sel')).map(e => e.textContent), rows: document.querySelectorAll('.v2-grid-rowhead.sel').length }));
  check(`${label} - vrai clic sur la lettre B : les 15 cases de la colonne sont sélectionnées et seule la lettre B s'allume`, selCol.selected === 15 && lit.cols.join() === 'B', { selected: selCol.selected, lit });
  const row3 = await boxOf(page, '.v2-grid-rowhead:nth-child(3)');
  await page.mouse.click(row3.x, row3.y - 4);
  await page.waitForTimeout(150);
  const selRow = await gridState(page);
  check(`${label} - vrai clic sur le numéro 3 : les 6 cases de la ligne sont sélectionnées`, selRow.selected === 6, selRow.selected);
  const colD = await boxOf(page, '.v2-grid-colhead:nth-child(4)');
  const colF = await boxOf(page, '.v2-grid-colhead:nth-child(6)');
  await page.mouse.click(colD.x - 6, colD.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(colF.x - 6, colF.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(150);
  const selExt = await gridState(page);
  check(`${label} - clic sur D puis Maj + clic sur F : les trois colonnes D, E et F (45 cases)`, selExt.selected === 45, selExt.selected);
  const corner = await boxOf(page, '.v2-grid-corner');
  await page.mouse.click(corner.x, corner.y);
  await page.waitForTimeout(150);
  const selAll = await gridState(page);
  check(`${label} - vrai clic sur le coin : toute la grille est sélectionnée`, selAll.selected === 90, selAll.selected);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(150);
  const cleared = await gridState(page);
  check(`${label} - Suppr sur toute la grille vide les cases et garde la grille (15 x 6)`, cleared.text === '' && cleared.rows === 15 && cleared.cols === 6, cleared);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const restored = await gridState(page);
  check(`${label} - un Ctrl+Z après Suppr rend les deux textes`, restored.text === 'NomTotal' && restored.rows === 15, restored.text);

  // 6) Le clavier d'un tableur : Tab passe à la case suivante, les flèches restent dans le tableau, Ctrl+A prend les cases.
  await freshGrid(page);
  await clickInPanel(page, '.tiptap table tr:nth-child(5) td:nth-child(1)', `${label} - clavier`);
  await page.keyboard.type('Total');
  await page.keyboard.press('Tab');
  await page.keyboard.type('12');
  const tabbed = await page.evaluate(() => { const cells = document.querySelectorAll('.tiptap table tr:nth-child(5) td'); return [cells[0].textContent, cells[1].textContent]; });
  check(`${label} - Tab passe à la case suivante : « Total » puis « 12 » dans la ligne 5`, tabbed.join('|') === 'Total|12', tabbed);
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const arrows = await gridState(page);
  const lastRowCurrent = await page.evaluate(() => { const cur = document.querySelector('.v2-grid-cur'); return !!cur && cur.parentElement === document.querySelector('.tiptap table > tbody > tr:last-child'); });
  check(`${label} - 30 flèches bas puis 12 flèches droite : le curseur reste dans le tableau (dernière ligne), jamais dans le paragraphe caché dessous, et la grille garde ses 15 lignes`, arrows.insideTable && lastRowCurrent && arrows.rows === 15, { arrows: arrows.insideTable, lastRowCurrent, rows: arrows.rows });
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(150);
  const ctrlA = await gridState(page);
  check(`${label} - Ctrl+A sélectionne les 90 cases (pas le document entier)`, ctrlA.selected === 90, ctrlA.selected);

  // 7) Barre de la case : posée contre la case courante, dans le panneau, hors des bandeaux.
  await freshGrid(page);
  await clickInPanel(page, '.tiptap table tr:nth-child(7) td:nth-child(3)', `${label} - barre`);
  await page.waitForTimeout(350);
  const bar = await page.evaluate(() => {
    const del = document.querySelector('.v2-floating-toolbar button[data-action="table-del"]');
    const el = del && del.closest('.v2-floating-toolbar');
    if (!el) return null;
    const b = el.getBoundingClientRect(); const c = GridEditor.currentCellDom().getBoundingClientRect();
    const box = document.getElementById('editor-container').getBoundingClientRect();
    const corner = document.querySelector('.v2-grid-corner').getBoundingClientRect();
    return { visible: el.classList.contains('visible'), left: b.left, right: b.right, top: b.top, bottom: b.bottom, cellTop: c.top, cellBottom: c.bottom, boxTop: box.top, stripBottom: corner.bottom, stripRight: corner.right, delGrey: del.classList.contains('v2-hf-locked') };
  });
  check(`${label} - la barre de la case est affichée tout contre la case courante, entièrement dans le panneau et hors des bandeaux, « Supprimer le tableau » grisé`,
    !!bar && bar.visible && bar.left >= bar.stripRight && bar.right <= WIDTH && bar.top >= bar.stripBottom && (Math.abs(bar.bottom + 8 - bar.cellTop) <= 4 || Math.abs(bar.top - (bar.cellBottom + 8)) <= 4) && bar.delGrey, bar);
  await clickInPanel(page, '.tiptap table tr:nth-child(2) td:nth-child(1)', `${label} - barre en haut`);
  await page.waitForTimeout(350);
  const barTop = await page.evaluate(() => {
    const del = document.querySelector('.v2-floating-toolbar button[data-action="table-del"]');
    const el = del.closest('.v2-floating-toolbar'); const b = el.getBoundingClientRect(); const corner = document.querySelector('.v2-grid-corner').getBoundingClientRect(); const c = GridEditor.currentCellDom().getBoundingClientRect();
    return { top: b.top, left: b.left, bottom: b.bottom, stripBottom: corner.bottom, stripRight: corner.right, cellBottom: c.bottom };
  });
  check(`${label} - curseur en 2e ligne, colonne A : la barre passe SOUS la case, ni sur le bandeau des lettres ni sur celui des numéros`,
    barTop.top >= barTop.cellBottom && barTop.left >= barTop.stripRight && barTop.top >= barTop.stripBottom, barTop);

  // 8) Les bandeaux restent collés quand on défile à la molette (vertical puis horizontal).
  await freshGrid(page);
  await page.mouse.move(WIDTH / 2, HEIGHT / 2 + 60);
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(250);
  const scrolledY = await page.evaluate(() => {
    const c = document.getElementById('editor-container').getBoundingClientRect();
    const col = document.querySelector('.v2-grid-colhead').getBoundingClientRect();
    const row = document.querySelector('.v2-grid-rowhead').getBoundingClientRect();
    const corner = document.querySelector('.v2-grid-corner').getBoundingClientRect();
    return { scrollTop: document.getElementById('editor-container').scrollTop, containerTop: c.top, colTop: col.top, rowTop: row.top, cornerTop: corner.top };
  });
  check(`${label} - défilement vertical à la molette : le bandeau des lettres reste collé en haut du panneau, le bandeau des numéros défile avec les lignes`,
    scrolledY.scrollTop > 100 && Math.abs(scrolledY.colTop - scrolledY.containerTop) <= 1 && Math.abs(scrolledY.cornerTop - scrolledY.containerTop) <= 1 && scrolledY.rowTop < scrolledY.containerTop - 50, scrolledY);
  await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
  await page.waitForTimeout(150);
  const handleWide = await boxOf(page, '.v2-grid-colhead:nth-child(1) .v2-grid-handle');
  await realDrag(page, { x: handleWide.x, y: handleWide.y }, { x: handleWide.x + 520, y: handleWide.y });
  await page.mouse.move(WIDTH / 2, HEIGHT / 2 + 60);
  await page.mouse.wheel(300, 0);
  await page.waitForTimeout(250);
  const scrolledX = await page.evaluate(() => {
    const box = document.getElementById('editor-container');
    const c = box.getBoundingClientRect();
    const row = document.querySelector('.v2-grid-rowhead').getBoundingClientRect();
    const corner = document.querySelector('.v2-grid-corner').getBoundingClientRect();
    const col = document.querySelector('.v2-grid-colhead').getBoundingClientRect();
    return { scrollLeft: box.scrollLeft, containerLeft: c.left, rowLeft: row.left, cornerLeft: corner.left, colLeft: col.left, colWidth: col.width };
  });
  check(`${label} - défilement horizontal (colonne A élargie) : le bandeau des numéros et le coin restent collés à gauche, les lettres défilent avec les colonnes`,
    scrolledX.scrollLeft > 100 && Math.abs(scrolledX.rowLeft - scrolledX.containerLeft) <= 1 && Math.abs(scrolledX.cornerLeft - scrolledX.containerLeft) <= 1 && scrolledX.colLeft < scrolledX.containerLeft + 44 - 50, scrolledX);

  // Une grille neuve s'ouvre en haut à gauche, même quand la précédente avait défilé (le plan de travail est le même) : sans cela sa première ligne et ses bandeaux restaient hors de vue.
  await page.mouse.move(WIDTH / 2, HEIGHT / 2 + 60);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(250);
  const scrolledBefore = await page.evaluate(() => document.getElementById('editor-container').scrollTop);
  await freshGrid(page);
  const reopened = await page.evaluate(() => {
    const b = document.getElementById('editor-container');
    const td = document.querySelector('.tiptap table td'); const r = td.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { scrollTop: b.scrollTop, scrollLeft: b.scrollLeft, firstCellTouched: !!top && td.contains(top) };
  });
  check(`${label} - une grille neuve s'ouvre en haut à gauche même si la précédente avait défilé (première case sous le pointeur)`,
    scrolledBefore > 100 && reopened.scrollTop === 0 && reopened.scrollLeft === 0 && reopened.firstCellTouched, { scrolledBefore, reopened });

  // 9) Contrastes de la charte (F5) : texte des bandeaux, bandeau sélectionné, cadre de la case courante.
  await freshGrid(page);
  await clickInPanel(page, '.tiptap table tr:nth-child(2) td:nth-child(2)', `${label} - contrastes`);
  await page.waitForTimeout(200);
  const contrast = await page.evaluate(`(() => {
    const ratio = ${CONTRAST_FN};
    const colour = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    const colSel = document.querySelector('.v2-grid-colhead.sel');
    const cur = document.querySelector('.v2-grid-cur');
    return {
      label: ratio(colour('.v2-grid-colhead:not(.sel)', 'color'), colour('.v2-grid-colhead:not(.sel)', 'backgroundColor')),
      selectedLabel: colSel ? ratio(getComputedStyle(colSel).color, getComputedStyle(colSel).backgroundColor) : null,
      rowLabel: ratio(colour('.v2-grid-rowhead:not(.sel)', 'color'), colour('.v2-grid-rowhead:not(.sel)', 'backgroundColor')),
      frame: cur ? ratio(getComputedStyle(cur).outlineColor, getComputedStyle(document.querySelector('.tiptap table')).backgroundColor) : null,
    };
  })()`);
  check(`${label} - contrastes : lettres et numéros >= 4,5:1, bandeau sélectionné >= 4,5:1, cadre de la case >= 3:1`,
    contrast.label >= 4.5 && contrast.rowLabel >= 4.5 && contrast.selectedLabel >= 4.5 && contrast.frame >= 3, contrast);

  // 10) Lecture d'une grille (lot A2) au vrai bouton « Lecture » : la grille garde ses tailles (colonnes de 100 px, ligne de 60 px, texte au milieu de sa case), déborde du
  //     panneau au lieu d'être écrasée (défilement horizontal à la molette) et n'a ni bandeaux ni ligne vide sous elle ; « Édition » la rend avec ses bandeaux.
  await freshGrid(page);
  await page.evaluate(async () => {
    const T = 'GrilleSouris'; const stub = window.__gristStub;
    stub.setVariables(T, { Nom: 'Text' });
    stub.setRows(T, [{ id: 1, Nom: 'Alpha' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Alpha' }, T);
    const badge = `<span class="var-badge" data-table="${T}" data-column="Nom" data-key="${T}.Nom"></span>`;
    const heights = [28, 60, 28];
    const cells = [Array.from({ length: 12 }, (_, c) => 'L1C' + (c + 1)), ['Centré', badge, ...Array(10).fill('')], ['fin', ...Array(11).fill('')]];
    const html = `<table style="width: 1200px;"><colgroup>${'<col style="width: 100px;">'.repeat(12)}</colgroup><tbody>`
      + cells.map((row, r) => `<tr data-row-height="${heights[r]}" style="height: ${heights[r]}px">${row.map(c => `<td colwidth="100"><p>${c}</p></td>`).join('')}</tr>`).join('') + '</tbody></table>';
    GridEditor.setActive(false); Editor.setHTML(html); GridEditor.setActive(true);
  });
  await page.waitForTimeout(300);
  await realClick(page, '#btn-mode-read');
  await page.waitForFunction(() => { const t = document.querySelector('#reader-container table'); return !!t && t.textContent.includes('Alpha'); }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const reading = await page.evaluate(() => {
    const reader = document.getElementById('reader-container');
    const table = reader.querySelector('table');
    const rows = Array.from(table.rows);
    const box = table.getBoundingClientRect();
    const centre = (td, tr) => { const range = document.createRange(); range.selectNodeContents(td); const r = range.getBoundingClientRect(); return (r.top + r.bottom) / 2 - tr.getBoundingClientRect().top; };
    const opaque = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
    const td = rows[1].cells[0];
    return {
      readerShown: getComputedStyle(reader).display !== 'none', editorHidden: getComputedStyle(document.getElementById('editor-container')).display === 'none',
      width: box.width, cols: Array.from(rows[0].cells).map(c => c.getBoundingClientRect().width), rows: rows.map(r => r.getBoundingClientRect().height),
      centre: centre(td, rows[1]), rowHeight: rows[1].getBoundingClientRect().height, align: getComputedStyle(td).verticalAlign,
      resolved: rows[1].cells[1].textContent.trim(), lastBlock: reader.querySelector('.reader-content').lastElementChild.tagName, a4: reader.classList.contains('a4-preview'),
      scrollW: reader.scrollWidth, clientW: reader.clientWidth,
      text: getComputedStyle(td).color, background: opaque(td),
    };
  });
  check(`${label} - Lecture d'une grille (vrai clic sur Lecture) : le tableau garde ses 12 colonnes de 100 px (1 201 px, plus large que le panneau) et ses lignes de 28, 60 et 28 px, sans feuille A4`,
    reading.readerShown && reading.editorHidden && Math.abs(reading.width - 1201) <= 1 && reading.cols.every(w => Math.abs(w - 100) <= 0.6) && Math.abs(reading.rows[1] - 60) <= 1 && Math.abs(reading.rows[0] - 28.9) <= 1.5 && !reading.a4, reading);
  check(`${label} - Lecture d'une grille : le texte est au milieu de sa case (ligne de 60 px), la bulle est remplacée par sa valeur « Alpha », aucune ligne vide sous le tableau`,
    reading.align === 'middle' && Math.abs(reading.centre - reading.rowHeight / 2) <= 1.5 && reading.resolved === 'Alpha' && reading.lastBlock === 'TABLE', reading);
  const readerContrast = await page.evaluate(`(() => { const ratio = ${CONTRAST_FN}; return ratio(${JSON.stringify(reading.text)}, ${JSON.stringify(reading.background)}); })()`);
  check(`${label} - Lecture d'une grille : texte des cases >= 4,5:1 sur le fond`, readerContrast >= 4.5, { text: reading.text, background: reading.background, readerContrast });
  const readerBox = await boxOf(page, '#reader-container');
  await page.mouse.move(readerBox.x, readerBox.y + 40);
  await page.mouse.wheel(300, 0);
  await page.waitForTimeout(250);
  const scrolledReading = await page.evaluate(() => { const r = document.getElementById('reader-container'); const t = r.querySelector('table').getBoundingClientRect(); return { scrollLeft: r.scrollLeft, tableLeft: t.left, tableWidth: t.width }; });
  check(`${label} - Lecture d'une grille large : la molette la fait défiler à l'horizontale (le tableau garde sa largeur, il n'est pas écrasé dans le panneau)`,
    reading.scrollW > reading.clientW + 400 && scrolledReading.scrollLeft >= 250 && Math.abs(scrolledReading.tableWidth - 1201) <= 1, { scrollW: reading.scrollW, clientW: reading.clientW, scrolledReading });
  await realClick(page, '#btn-mode-edit');
  await page.waitForTimeout(500);
  const backInEdit = await page.evaluate(() => ({ active: GridEditor.isActive(), cols: document.querySelectorAll('.v2-grid-colhead').length, rows: document.querySelectorAll('.v2-grid-rowhead').length, readerHidden: getComputedStyle(document.getElementById('reader-container')).display === 'none' }));
  check(`${label} - retour à l'édition (vrai clic) : la grille est là avec ses 12 lettres et ses 3 numéros`, backInEdit.active && backInEdit.cols === 12 && backInEdit.rows === 3 && backInEdit.readerHidden, backInEdit);

  // 11) Export Excel (lot D) à la vraie souris : le menu « Qualité PDF » (au survol) garde ses trois lignes d'export, grisées selon le type de modèle ; dans une grille « Exporter en
  //     Excel… » télécharge le classeur de la ligne courante, et une ligne Word grisée ne lance rien.
  await freshGrid(page);
  await page.evaluate(() => {
    const badge = `<span class="var-badge" data-table="GrilleSouris" data-column="Nom" data-key="GrilleSouris.Nom"></span>`;
    const html = `<table style="width: 300px;"><colgroup><col style="width: 150px;"><col style="width: 150px;"></colgroup><tbody><tr data-row-height="30" style="height: 30px"><td colwidth="150"><p>Nom</p></td><td colwidth="150"><p>${badge}</p></td></tr></tbody></table>`;
    GridEditor.setActive(false); Editor.setHTML(html); GridEditor.setActive(true);
  });
  await page.waitForTimeout(300);
  const openExportMenu = async () => {
    const trigger = await boxOf(page, '#v2-btn-quality');
    await page.mouse.move(trigger.x - 20, trigger.y + 40, { steps: 2 });
    await page.mouse.move(trigger.x, trigger.y, { steps: 3 });
    await page.waitForTimeout(450);
  };
  const exportRows = () => page.evaluate(`(() => {
    const ratio = ${CONTRAST_FN};
    const opaque = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
    const out = {};
    for (const id of ['v2-btn-export-docx', 'v2-btn-export-docx-batch', 'v2-btn-export-xlsx']) {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out[id] = { greyed: el.classList.contains('v2-hover-row-disabled'), aria: el.getAttribute('aria-disabled'), shown: r.width > 0 && r.height > 0, inPanel: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, reachable: !!top && el.contains(top),
        contrast: Math.round(ratio(getComputedStyle(el).color, opaque(el)) * 100) / 100, text: el.textContent.trim() };
    }
    return out;
  })()`);
  await openExportMenu();
  const inGridRows = await exportRows();
  const g = inGridRows;
  check(`${label} - menu d'export dans une grille : les trois lignes sont là, visibles dans le panneau et atteignables ; Excel active, les deux lignes Word grisées`,
    Object.values(g).every(r => r.shown && r.inPanel && r.reachable) && !g['v2-btn-export-xlsx'].greyed && g['v2-btn-export-docx'].greyed && g['v2-btn-export-docx-batch'].greyed
    && g['v2-btn-export-docx'].aria === 'true' && g['v2-btn-export-xlsx'].aria === null, g);
  check(`${label} - menu d'export : le texte des lignes (grisées comprises) reste lisible, >= 4,5:1`, Object.values(g).every(r => r.contrast >= 4.5), Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.contrast])));
  // Une ligne grisée ne lance rien : vrai clic sur « Exporter en DOCX », aucun téléchargement.
  let wordDownload = null;
  page.once('download', d => { wordDownload = d.suggestedFilename(); });
  await realClick(page, '#v2-btn-export-docx');
  await page.waitForTimeout(1500);
  check(`${label} - vrai clic sur la ligne Word grisée d'une grille : aucun téléchargement`, wordDownload === null, { wordDownload });
  await openExportMenu();
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await realClick(page, '#v2-btn-export-xlsx');
  const download = await downloadPromise;
  let xlsxInfo = null;
  if (download) {
    const stream = await download.createReadStream();
    const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    xlsxInfo = { name: download.suggestedFilename(), size: bytes.length, zip: bytes.slice(0, 2).toString() === 'PK', hasSheet: bytes.includes(Buffer.from('xl/worksheets/sheet1.xml')) };
  }
  await page.waitForTimeout(300);
  const statusAfter = await page.evaluate(() => document.getElementById('status-msg').textContent);
  check(`${label} - vrai clic sur « Exporter en Excel… » : un fichier .xlsx est téléchargé (archive avec sa feuille), et le coin d'état annonce « Fichier Excel généré. »`,
    !!xlsxInfo && /\.xlsx$/.test(xlsxInfo.name) && xlsxInfo.zip && xlsxInfo.size > 2000 && xlsxInfo.hasSheet && /Excel/.test(statusAfter), { xlsxInfo, statusAfter });
  // Dans un document : l'inverse - Excel grisée, Word active.
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
  const newBtn2 = await boxOf(page, '#btn-new');
  await page.mouse.move(newBtn2.x, newBtn2.y, { steps: 3 });
  await page.waitForTimeout(350);
  await clickInPanel(page, '#v2-btn-new-document', `${label} - Nouveau document`);
  await page.waitForTimeout(500);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
  await openExportMenu();
  const inDocRows = await exportRows();
  const d = inDocRows;
  check(`${label} - menu d'export dans un document : « Exporter en Excel… » est grisée (elle reste dans le menu), les deux lignes Word sont actives`,
    Object.values(d).every(r => r.shown && r.inPanel && r.reachable) && d['v2-btn-export-xlsx'].greyed && d['v2-btn-export-xlsx'].aria === 'true' && !d['v2-btn-export-docx'].greyed && !d['v2-btn-export-docx-batch'].greyed && Object.values(d).every(r => r.contrast >= 4.5), d);
  let excelDownload = null;
  page.once('download', x => { excelDownload = x.suggestedFilename(); });
  await realClick(page, '#v2-btn-export-xlsx');
  await page.waitForTimeout(1500);
  check(`${label} - vrai clic sur la ligne Excel grisée d'un document : aucun téléchargement`, excelDownload === null, { excelDownload });

  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
