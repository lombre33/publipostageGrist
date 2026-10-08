#!/usr/bin/env node
// Lignes et colonnes d'une grille choisies par leurs bandeaux (numéros, lettres, Maj + clic) à la VRAIE souris et au VRAI clavier (page.mouse, page.keyboard, Node/Playwright), à la taille du
// panneau Grist (~700x400) (demande d'Antoine du 08/10 : « quand une sélection est faite par ligne ou par colonne entière en cliquant sur les rubans dédiés, il faut que l'ensemble des
// actions soient effectuées sur les lignes/colonnes »). Une page.evaluate ne déclenche ni le vrai presse-papiers, ni le survol, ni un clic « trusted » : c'est ici qu'on s'assure que
//   - Ctrl+C sur des lignes ou des colonnes choisies par leurs bandeaux prend toutes les cases (texte tabulé et HTML), comme le même bloc choisi en glissant ;
//   - Ctrl+V sur des lignes ou des colonnes choisies pose le bloc copié EN ENTIER à partir de la case en haut à gauche de la sélection (la grille gagne les lignes qui manquent), au lieu de le
//     rogner à la taille de la sélection ; comme dans un tableur, une sélection dont les dimensions sont des multiples exacts de celles du bloc le répète, une case copiée remplit toute la ligne ;
//   - « Ligne avant », « Ligne après », « Colonne avant » et « Colonne après » ajoutent autant de lignes (de colonnes) que la sélection en couvre, en UN Ctrl+Z, la sélection restant sur les mêmes
//     lignes ; un simple curseur n'en ajoute qu'une, et un tableau de document aussi ;
//   - gras, taille, police, couleurs, puces, alignements, fond, alignement vertical, bordures, Suppr, Retour arrière, Ctrl+X, fusion et suppression de lignes ou de colonnes touchent toutes
//     les cases choisies, et elles seules ;
//   - tirer le trait (la poignée) d'une des lignes ou colonnes choisies par leurs bandeaux les règle toutes à la même taille, en direct puis en UNE transaction ; le trait d'une ligne hors de la
//     sélection, d'une seule ligne choisie ou d'un bloc qui ne couvre pas toute la largeur ne règle que sa ligne.
// Lancé par run-headless.mjs (groupe Node « gridLinesMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-grid-lines-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.GRID_LINES_PORT || 8990);
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
if (!OFFLINE) console.log('[verify-grid-lines-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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


// Centre d'un élément.
async function boxOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
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

async function openMenuAndPick(page, openSel, itemSel) {
  await realClick(page, openSel);
  await page.evaluate(sel => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: 'nearest' }); }, itemSel);
  await page.waitForTimeout(60);
  await realClick(page, itemSel);
}

async function hoverAndClick(page, hoverSel, targetSel) {
  const main = await boxOf(page, hoverSel);
  await page.mouse.move(main.x, main.y, { steps: 3 });
  await page.waitForTimeout(350);
  await realClick(page, targetSel);
}

const parkMouse = async page => { await page.mouse.move(WIDTH - 12, HEIGHT - 70, { steps: 3 }); await page.waitForTimeout(250); };

// Le centre de la case LOGIQUE (ligne r, colonne c, depuis 1).
const gridPoint = (page, r, c) => page.evaluate(([row, col]) => {
  const colEl = document.querySelectorAll('.tiptap table > colgroup > col')[col - 1];
  const rowEl = document.querySelectorAll('.tiptap table > tbody > tr')[row - 1];
  if (!colEl || !rowEl) return null;
  const a = colEl.getBoundingClientRect(), b = rowEl.getBoundingClientRect();
  return { x: a.left + a.width / 2, y: b.top + b.height / 2 };
}, [r, c]);

// Appuie sur la case `from`, glisse sur la case `to`, relâche : une sélection de cases « à la main ».
async function dragGrid(page, from, to) {
  const a = await gridPoint(page, from[0], from[1]);
  const b = await gridPoint(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

async function clickGrid(page, r, c) {
  const p = await gridPoint(page, r, c);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(100);
}

// Un clic sur le numéro d'une ligne ou la lettre d'une colonne (`index` depuis 0), Maj enfoncée pour étendre la sélection. Le clic vise l'étiquette, loin de la poignée du bord.
async function clickRibbon(page, kind, index, shift = false) {
  const label = kind === 'row' ? `.v2-grid-rows .v2-grid-rowhead[data-index="${index}"] .v2-grid-label` : `.v2-grid-cols .v2-grid-colhead[data-index="${index}"] .v2-grid-label`;
  const b = await boxOf(page, label);
  await page.mouse.move(b.x, b.y, { steps: 3 });
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(b.x, b.y);
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(150);
}
// Les lignes (ou colonnes) `from` à `to` choisies par leurs bandeaux : un clic, puis Maj + clic sur la dernière.
async function pickLines(page, kind, from, to = from) {
  await clickRibbon(page, kind, from);
  if (to !== from) await clickRibbon(page, kind, to, true);
}

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

// Cinq colonnes (A à E) de 100 px, six lignes de 28 px, chaque case porte son nom : A1, B1... E6.
const COLS = 5, ROWS = 6;
const nameOf = (r, c) => `${'ABCDEFGH'[c - 1]}${r}`;
const GRID = gridHtml(Array(COLS).fill(100), Array(ROWS).fill(28), nameOf);
const matrix = (rows, cols, at) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => at(r + 1, c + 1)));
const ORIGINAL = matrix(ROWS, COLS, nameOf);
const cellsBetween = (r1, r2, c1, c2) => { const out = []; for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(`${r},${c}`); return out; };

// La grille telle que l'écran la montre : le texte de chaque case, ligne par ligne.
const texts = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table > tbody > tr')).map(tr => Array.from(tr.children).map(td => td.textContent)));
// Les cases que la sélection de cases surligne (« ligne,colonne » depuis 1, sans case fusionnée dans ces grilles).
const selectedAt = page => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.tiptap table > tbody > tr').forEach((tr, r) => Array.from(tr.children).forEach((td, c) => { if (td.classList.contains('selectedCell')) out.push(`${r + 1},${c + 1}`); }));
  return out;
});
const colWidths = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table > colgroup > col')).map(c => Math.round(c.getBoundingClientRect().width * 10) / 10));
const rowHeights = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table > tbody > tr')).map(r => Math.round(r.getBoundingClientRect().height * 10) / 10));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const allNear = (list, ref, tolerance = 0.6) => list.every(x => Math.abs(x - ref) <= tolerance);
// Les écarts (au plus 8) entre la grille lue et la grille attendue, pour le détail d'un échec.
function gaps(got, want) {
  const out = [];
  for (let r = 0; r < Math.max(got.length, want.length); r++) {
    for (let c = 0; c < Math.max((got[r] || []).length, (want[r] || []).length); c++) {
      const g = (got[r] || [])[c], w = (want[r] || [])[c];
      if (g !== w) out.push(`${r + 1},${c + 1} : ${JSON.stringify(g)} au lieu de ${JSON.stringify(w)}`);
    }
  }
  if (got.length !== want.length) out.push(`${got.length} lignes au lieu de ${want.length}`);
  return out.slice(0, 8);
}
const checkGrid = (name, got, want) => { const diff = gaps(got, want); check(name, diff.length === 0, diff); };

// Presse-papiers : ce que Ctrl+C / Ctrl+X y mettent, lu par un écouteur du document qui passe après celui de l'éditeur.
async function spyClipboard(page) {
  await page.evaluate(() => {
    window.__clip = null;
    if (window.__clipSpy) return;
    window.__clipSpy = true;
    for (const type of ['copy', 'cut']) document.addEventListener(type, (e) => { window.__clip = { type, text: e.clipboardData.getData('text/plain'), html: e.clipboardData.getData('text/html') }; });
  });
}
async function copyKeys(page, key = 'Control+c') {
  await page.evaluate(() => { window.__clip = null; });
  await page.keyboard.press(key);
  await page.waitForTimeout(250);
  return page.evaluate(() => window.__clip);
}
const countTags = (html, tag) => (html.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length;
// Coller (Ctrl+V) puis laisser passer la transaction et ce qu'elle déclenche.
async function paste(page) {
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(350);
}
// Deux gestes à moins de 500 ms l'un de l'autre sont UN seul évènement d'historique (prosemirror-history, newGroupDelay) : on laisse passer ce délai avant Ctrl+Z.
async function undo(page) {
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
}

// « + » puis « Nouvelle grille » à la vraie souris : une vraie grille, dont la feuille n'est pas réduite à l'écran (le zoom de la page ne s'applique pas à une grille) - une taille tirée de N px
// y est une taille de N px. Une grille modifiée et pas enregistrée ouvre d'abord « Modifications non enregistrées » : on clique « Abandonner ».
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

// La poignée du trait sous le numéro d'une ligne ou à droite de la lettre d'une colonne (`index` depuis 0).
const handleOf = (kind, index) => (kind === 'row' ? `.v2-grid-rows .v2-grid-rowhead[data-index="${index}"] .v2-grid-handle` : `.v2-grid-cols .v2-grid-colhead[data-index="${index}"] .v2-grid-handle`);
// Tire cette poignée de `delta` px (vers le bas pour une ligne, vers la droite pour une colonne) à la vraie souris ; `during` mesure pendant que le bouton est enfoncé.
async function dragHandle(page, kind, index, delta, during) {
  const b = await boxOf(page, handleOf(kind, index));
  const to = kind === 'row' ? { x: b.x, y: b.y + delta } : { x: b.x + delta, y: b.y };
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  const live = during ? await during() : null;
  await page.mouse.up();
  await page.waitForTimeout(250);
  return live;
}
const headSizes = (page, kind) => page.evaluate(k => Array.from(document.querySelectorAll(k === 'row' ? '.v2-grid-rows .v2-grid-rowhead' : '.v2-grid-cols .v2-grid-colhead')).map(h => Math.round(h.getBoundingClientRect()[k === 'row' ? 'height' : 'width'] * 10) / 10), kind);
const tipText = page => page.evaluate(() => (document.querySelector('.v2-grid-tip') || {}).textContent || null);
const tableWidth = page => page.evaluate(() => Math.round(document.querySelector('.tiptap table').getBoundingClientRect().width * 10) / 10);
// Les transactions qui changent le document depuis la dernière remise à zéro.
async function countTransactions(page) {
  await page.evaluate(() => {
    window.__tx = 0;
    if (!window.__txSpy) { window.__txSpy = true; EditorCore.getEditor().on('transaction', ({ transaction }) => { if (transaction.docChanged) window.__tx++; }); }
  });
}
const transactions = page => page.evaluate(() => window.__tx);
const sizesAre = (list, want, tolerance = 0.6) => list.length === want.length && list.every((x, i) => Math.abs(x - want[i]) <= tolerance);

const BAR = '.v2-cell-bar-dock .v2-floating-toolbar';
const barButton = action => `${BAR} button[data-action="${action}"]`;

const { context, page } = await openWidget('light');
await spyClipboard(page);
console.log(`\n=== Lignes et colonnes choisies par leurs bandeaux, à la vraie souris et au vrai clavier, ${WIDTH}x${HEIGHT} ===`);

// ---------- 1) Copier : toutes les cases, comme en glissant ----------
await loadGrid(page, GRID);
await pickLines(page, 'row', 1, 2);
check('les numéros 2 et 3 (clic, puis Maj + clic) sélectionnent les dix cases des deux lignes', same(await selectedAt(page), cellsBetween(2, 3, 1, COLS)), await selectedAt(page));
let ribbonCopy = await copyKeys(page);
check('Ctrl+C sur ces deux lignes : le texte brut est un tableau tabulé de 2 lignes de 5 cases',
  !!ribbonCopy && ribbonCopy.type === 'copy' && ribbonCopy.text === 'A2\tB2\tC2\tD2\tE2\nA3\tB3\tC3\tD3\tE3', ribbonCopy && ribbonCopy.text);
check('Ctrl+C sur ces deux lignes : le HTML est un tableau de 2 lignes de 5 cases', !!ribbonCopy && countTags(ribbonCopy.html, 'tr') === 2 && countTags(ribbonCopy.html, 'td') === 10, ribbonCopy && ribbonCopy.html.slice(0, 200));
await dragGrid(page, [2, 1], [3, COLS]);
const dragCopy = await copyKeys(page);
check('le même bloc choisi à la main donne exactement la même copie (texte et HTML)', !!dragCopy && !!ribbonCopy && dragCopy.text === ribbonCopy.text && dragCopy.html === ribbonCopy.html, { drag: dragCopy && dragCopy.text, ribbon: ribbonCopy && ribbonCopy.text });

await pickLines(page, 'col', 1, 2);
check('les lettres B et C (clic, puis Maj + clic) sélectionnent les douze cases des deux colonnes', same(await selectedAt(page), cellsBetween(1, ROWS, 2, 3)), await selectedAt(page));
const colCopy = await copyKeys(page);
check('Ctrl+C sur ces deux colonnes : le texte brut est un tableau tabulé de 6 lignes de 2 cases',
  !!colCopy && colCopy.text === Array.from({ length: ROWS }, (_, i) => `B${i + 1}\tC${i + 1}`).join('\n'), colCopy && colCopy.text);
check('Ctrl+C sur ces deux colonnes : le HTML est un tableau de 6 lignes de 2 cases', !!colCopy && countTags(colCopy.html, 'tr') === ROWS && countTags(colCopy.html, 'td') === 2 * ROWS, colCopy && colCopy.html.slice(0, 200));

// ---------- 2) Coller sur des lignes ou des colonnes choisies : le bloc entier, depuis la case en haut à gauche ----------
const BLOCK = [[1, 2], [3, 3]];   // B1:C3 : trois lignes de deux cases, copié à la main
async function copyBlock() {
  await dragGrid(page, ...BLOCK);
  const clip = await copyKeys(page);
  return clip && clip.text === 'B1\tC1\nB2\tC2\nB3\tC3';
}
await loadGrid(page, GRID);
// La taille d'une case à l'écran (le panneau réduit la feuille) : les lignes et colonnes neuves doivent avoir la même.
const rowPx = (await rowHeights(page))[0], colPx = (await colWidths(page))[0];
check('B1:C3 choisi en glissant se copie en trois lignes de deux cases', await copyBlock());

await pickLines(page, 'row', 4);
check('le numéro 5 sélectionne les cinq cases de la ligne', same(await selectedAt(page), cellsBetween(5, 5, 1, COLS)), await selectedAt(page));
await paste(page);
checkGrid('Ctrl+V sur le numéro 5 pose le bloc entier (3 lignes de 2 cases) à partir de A5, la ligne manquante est ajoutée, le reste de la ligne 5 reste',
  await texts(page), matrix(ROWS + 1, COLS, (r, c) => (r >= 5 && c <= 2 ? nameOf(r - 4, c + 1) : r <= ROWS ? nameOf(r, c) : '')));
check('le bloc collé reste choisi (3 lignes de 2 cases) et la grille a gagné une ligne de la même hauteur que les autres', same(await selectedAt(page), cellsBetween(5, 7, 1, 2)) && (await rowHeights(page)).length === ROWS + 1 && allNear(await rowHeights(page), rowPx), { selected: await selectedAt(page), heights: await rowHeights(page), rowPx });
await undo(page);
checkGrid('un seul Ctrl+Z rend la grille d\'avant (6 lignes)', await texts(page), ORIGINAL);

await pickLines(page, 'col', 3);
check('la lettre D sélectionne les six cases de la colonne', same(await selectedAt(page), cellsBetween(1, ROWS, 4, 4)), await selectedAt(page));
await paste(page);
checkGrid('Ctrl+V sur la lettre D pose le bloc entier (3 lignes de 2 cases) à partir de D1, sans répéter la première colonne sur D et E',
  await texts(page), matrix(ROWS, COLS, (r, c) => (r <= 3 && c >= 4 ? nameOf(r, c - 2) : nameOf(r, c))));
await undo(page);

await pickLines(page, 'row', 1, 2);
check('les numéros 2 et 3 sélectionnent les deux lignes', same(await selectedAt(page), cellsBetween(2, 3, 1, COLS)), await selectedAt(page));
await paste(page);
checkGrid('Ctrl+V sur les numéros 2 et 3 (2 lignes) pose quand même le bloc de 3 lignes : A2:B4, la ligne 4 n\'est pas laissée de côté',
  await texts(page), matrix(ROWS, COLS, (r, c) => (r >= 2 && r <= 4 && c <= 2 ? nameOf(r - 1, c + 1) : nameOf(r, c))));
await undo(page);

// Un bloc d'une ligne de deux cases (B1:C1) sur une colonne : une seule fois, depuis D1 (la colonne n'est pas un multiple de deux cases)
await loadGrid(page, GRID);
await dragGrid(page, [1, 2], [1, 3]);
await copyKeys(page);
await pickLines(page, 'col', 3);
await paste(page);
checkGrid('un bloc de 2 cases copié sur la lettre D va en D1:E1 une seule fois (la colonne n\'est pas un multiple de la largeur du bloc, pas de répétition vers le bas)',
  await texts(page), matrix(ROWS, COLS, (r, c) => (r === 1 && c >= 4 ? nameOf(1, c - 2) : nameOf(r, c))));

// Comme un tableur : les dimensions de la sélection sont des multiples exacts de celles du bloc, il se répète
await loadGrid(page, GRID);
await dragGrid(page, [1, 2], [1, 3]);
await copyKeys(page);
await pickLines(page, 'col', 1, 4);
check('les lettres B à E sélectionnent quatre colonnes entières', same(await selectedAt(page), cellsBetween(1, ROWS, 2, 5)), await selectedAt(page));
await paste(page);
checkGrid('un bloc de 2 cases copié sur quatre colonnes entières les remplit en se répétant (B1 C1 B1 C1 sur toutes les lignes), la colonne A reste',
  await texts(page), matrix(ROWS, COLS, (r, c) => (c === 1 ? nameOf(r, 1) : c % 2 === 0 ? 'B1' : 'C1')));

// Une seule case copiée remplit toute la ligne choisie
await loadGrid(page, GRID);
await clickGrid(page, 1, 2);
await page.keyboard.press('Home');
await page.keyboard.press('Shift+End');
await copyKeys(page);
await pickLines(page, 'row', 3);
await paste(page);
checkGrid('une case copiée collée sur le numéro 4 remplit les cinq cases de la ligne, les autres lignes restent',
  await texts(page), matrix(ROWS, COLS, (r, c) => (r === 4 ? 'B1' : nameOf(r, c))));

// Un curseur dans une case : le bloc se pose à partir d'elle, la grille gagne la ligne qui manque (comme avant)
await loadGrid(page, GRID);
await pickLines(page, 'row', 1, 2);
await copyKeys(page);
await clickGrid(page, 6, 1);
await paste(page);
checkGrid('Ctrl+V depuis un curseur en A6 pose les deux lignes copiées à partir de A6 (la grille gagne la ligne 7), comme avant',
  await texts(page), matrix(ROWS + 1, COLS, (r, c) => (r === 6 ? nameOf(2, c) : r === 7 ? nameOf(3, c) : nameOf(r, c))));

// ---------- 3) Lignes et colonnes ajoutées : autant que la sélection en couvre ----------
await loadGrid(page, GRID);
await pickLines(page, 'row', 1, 2);
await realClick(page, barButton('row-before'));
await page.waitForTimeout(250);
checkGrid('« Ligne avant » sur les numéros 2 et 3 ajoute deux lignes vides au-dessus, les lignes d\'avant suivent (8 lignes)',
  await texts(page), matrix(ROWS + 2, COLS, (r, c) => (r === 1 ? nameOf(1, c) : r <= 3 ? '' : nameOf(r - 2, c))));
check('« Ligne avant » : la sélection reste sur les deux mêmes lignes (devenues 4 et 5) et les lignes neuves ont la hauteur des autres', same(await selectedAt(page), cellsBetween(4, 5, 1, COLS)) && (await rowHeights(page)).length === ROWS + 2 && allNear(await rowHeights(page), rowPx), { selected: await selectedAt(page), heights: await rowHeights(page), rowPx });
await undo(page);
checkGrid('un seul Ctrl+Z rend la grille d\'avant « Ligne avant » (6 lignes)', await texts(page), ORIGINAL);

await pickLines(page, 'row', 1, 2);
await realClick(page, barButton('row-after'));
await page.waitForTimeout(250);
checkGrid('« Ligne après » sur les numéros 2 et 3 ajoute deux lignes vides sous la ligne 3 (8 lignes)',
  await texts(page), matrix(ROWS + 2, COLS, (r, c) => (r <= 3 ? nameOf(r, c) : r <= 5 ? '' : nameOf(r - 2, c))));
check('« Ligne après » : la sélection reste sur les lignes 2 et 3', same(await selectedAt(page), cellsBetween(2, 3, 1, COLS)), await selectedAt(page));
await undo(page);
checkGrid('un seul Ctrl+Z rend la grille d\'avant « Ligne après » (6 lignes)', await texts(page), ORIGINAL);

await pickLines(page, 'col', 1, 2);
await realClick(page, barButton('col-before'));
await page.waitForTimeout(250);
checkGrid('« Colonne avant » sur les lettres B et C ajoute deux colonnes vides à gauche, les colonnes d\'avant suivent (7 colonnes)',
  await texts(page), matrix(ROWS, COLS + 2, (r, c) => (c === 1 ? nameOf(r, 1) : c <= 3 ? '' : nameOf(r, c - 2))));
check('« Colonne avant » : la sélection reste sur les deux mêmes colonnes (devenues D et E) et les colonnes neuves ont la largeur des autres', same(await selectedAt(page), cellsBetween(1, ROWS, 4, 5)) && (await colWidths(page)).length === COLS + 2 && allNear(await colWidths(page), colPx, 1), { selected: (await selectedAt(page)).slice(0, 4), widths: await colWidths(page), colPx });
await undo(page);
checkGrid('un seul Ctrl+Z rend la grille d\'avant « Colonne avant » (5 colonnes)', await texts(page), ORIGINAL);

await pickLines(page, 'col', 1, 2);
await realClick(page, barButton('col-after'));
await page.waitForTimeout(250);
checkGrid('« Colonne après » sur les lettres B et C ajoute deux colonnes vides à droite de C (7 colonnes)',
  await texts(page), matrix(ROWS, COLS + 2, (r, c) => (c <= 3 ? nameOf(r, c) : c <= 5 ? '' : nameOf(r, c - 2))));
await undo(page);

// Une seule ligne ou colonne choisie, ou un simple curseur : une seule ajoutée, comme avant
await pickLines(page, 'row', 2);
await realClick(page, barButton('row-after'));
await page.waitForTimeout(250);
checkGrid('« Ligne après » sur le seul numéro 3 ajoute une seule ligne', await texts(page), matrix(ROWS + 1, COLS, (r, c) => (r <= 3 ? nameOf(r, c) : r === 4 ? '' : nameOf(r - 1, c))));
await undo(page);
await clickGrid(page, 2, 2);
await realClick(page, barButton('col-before'));
await page.waitForTimeout(250);
checkGrid('« Colonne avant » depuis un curseur en B2 ajoute une seule colonne', await texts(page), matrix(ROWS, COLS + 1, (r, c) => (c === 1 ? nameOf(r, 1) : c === 2 ? '' : nameOf(r, c - 1))));
await undo(page);

// Un tableau de document : « Ligne après » en ajoute une, la barre de la case d'un tableau de document n'a pas changé
await page.evaluate(() => {
  GridEditor.setActive(false);
  EditorCore.getEditor().commands.setContent('<p>Avant</p><table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table><p>Après</p>');
});
await page.waitForTimeout(450);
const docCell = await boxOf(page, '.tiptap table tr:nth-child(1) > td:nth-child(1)');
await page.mouse.click(docCell.x, docCell.y);
await page.waitForTimeout(350);
await realClick(page, '.v2-floating-toolbar button[data-action="row-after"]');
await page.waitForTimeout(250);
const docRows = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table tr')).map(tr => Array.from(tr.children).map(td => td.textContent).join('|')));
check('dans un tableau de document, « Ligne après » ajoute une ligne vide sous le curseur', docRows.length === 3 && docRows[0] === 'a|b' && docRows[1] === '|' && docRows[2] === 'c|d', docRows);

// ---------- 4) Les autres actions touchent toutes les cases choisies, et elles seules ----------
await loadGrid(page, gridHtml(Array(COLS).fill(100), Array(ROWS + 2).fill(28), nameOf));
const ACTION_ROWS = ROWS + 2;
const MODES = {
  lignes: { pick: () => pickLines(page, 'row', 1, 3), inside: (r) => r >= 2 && r <= 4 },       // numéros 2 à 4
  colonnes: { pick: () => pickLines(page, 'col', 1, 2), inside: (r, c) => c >= 2 && c <= 3 },    // lettres B et C
};
const cellsState = () => page.evaluate(() => {
  const out = {};
  document.querySelectorAll('.tiptap table tr').forEach((tr, ri) => Array.from(tr.children).forEach((td, ci) => {
    const styled = prop => { const el = Array.from(td.querySelectorAll('span[style]')).find(s => s.style[prop]); return el ? el.style[prop] : ''; };
    const p = td.querySelector('p');
    out[`${ri + 1},${ci + 1}`] = {
      text: td.textContent, size: styled('fontSize'), family: styled('fontFamily'), color: styled('color'), background: styled('backgroundColor'),
      bold: !!td.querySelector('strong, b'), list: !!td.querySelector('ul > li'), align: p ? (p.style.textAlign || '') : '', fill: td.style.backgroundColor || '',
      valign: td.getAttribute('data-valign') || '',
      allNone: ['top', 'right', 'bottom', 'left'].every(side => td.getAttribute(`data-border-${side}`) === 'none'),
    };
  }));
  return out;
});
const FORMATS = [
  ['gras', () => realClick(page, '#v2-btn-bold'), s => s.bold],
  ['taille 12 pt', () => openMenuAndPick(page, '#v2-size-chip-val', '.v2-format-panel.visible button[data-action="12pt"]'), s => s.size === '12pt'],
  ['police Georgia', () => openMenuAndPick(page, '#v2-font-chip', '.v2-format-panel.visible button[data-action="Georgia"]'), s => /Georgia/.test(s.family)],
  ['couleur de police', () => openMenuAndPick(page, '#v2-btn-text-color-caret', '.v2-color-dropdown.visible button[data-action="pick:#b91c1c"]'), s => s.color === 'rgb(185, 28, 28)'],
  ['surlignage', () => openMenuAndPick(page, '#v2-btn-highlight-caret', '.v2-color-dropdown.visible button[data-action="pick:#fff2a8"]'), s => s.background === 'rgb(255, 242, 168)'],
  ['liste à puces', () => realClick(page, '#v2-btn-bullet'), s => s.list],
  ['alignement centré', () => hoverAndClick(page, '#v2-btn-align-main', '#v2-btn-align-center'), s => s.align === 'center'],
  ['fond de case', () => openMenuAndPick(page, barButton('fill-open'), '.v2-color-dropdown.visible button[data-action="pick:#fff2a8"]'), s => /255, 242, 168/.test(s.fill)],
  ['alignement vertical en haut', () => realClick(page, barButton('valign-top')), s => s.valign === 'top'],
  ['bordures : aucune', () => openMenuAndPick(page, barButton('borders-open'), '.v2-borders-dropdown button[data-action="borders:none"]'), s => s.allNone],
];
for (const [mode, { pick, inside }] of Object.entries(MODES)) {
  for (const [name, act, has] of FORMATS) {
    await loadGrid(page, gridHtml(Array(COLS).fill(100), Array(ACTION_ROWS).fill(28), nameOf));
    await parkMouse(page);
    await pick();
    await act();
    await page.waitForTimeout(200);
    const state = await cellsState();
    const wrong = Object.keys(state).filter((key) => { const [r, c] = key.split(',').map(Number); return !!has(state[key]) !== inside(r, c); });
    check(`${mode} choisies par leurs bandeaux : ${name} touche toutes les cases choisies, et elles seules`, wrong.length === 0, wrong.slice(0, 8));
  }
  for (const key of ['Delete', 'Backspace', 'Control+x']) {
    await loadGrid(page, gridHtml(Array(COLS).fill(100), Array(ACTION_ROWS).fill(28), nameOf));
    await parkMouse(page);
    await pick();
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    const state = await cellsState();
    const wrong = Object.keys(state).filter((k) => { const [r, c] = k.split(',').map(Number); return (state[k].text === '') !== inside(r, c); });
    check(`${mode} choisies par leurs bandeaux : ${key} vide toutes les cases choisies, et elles seules, la grille garde ses ${ACTION_ROWS} lignes et ses ${COLS} colonnes`,
      wrong.length === 0 && (await texts(page)).length === ACTION_ROWS && (await colWidths(page)).length === COLS, wrong.slice(0, 8));
  }
  await loadGrid(page, gridHtml(Array(COLS).fill(100), Array(ACTION_ROWS).fill(28), nameOf));
  await parkMouse(page);
  await pick();
  await realClick(page, barButton('cell-merge'));
  await page.waitForTimeout(250);
  const merged = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table td')).filter(td => td.colSpan > 1 || td.rowSpan > 1).map(td => `${td.rowSpan}x${td.colSpan}`));
  check(`${mode} choisies par leurs bandeaux : « Fusionner les cases » en fait UNE seule case (${mode === 'lignes' ? '3 lignes sur 5 colonnes' : `${ACTION_ROWS} lignes sur 2 colonnes`})`,
    merged.length === 1 && merged[0] === (mode === 'lignes' ? `3x${COLS}` : `${ACTION_ROWS}x2`), merged);
}
// Supprimer les lignes ou les colonnes choisies : toutes, pas seulement la première
await loadGrid(page, GRID);
await parkMouse(page);
await pickLines(page, 'row', 1, 2);
await realClick(page, barButton('row-del'));
await page.waitForTimeout(250);
checkGrid('« Supprimer la ligne » sur les numéros 2 et 3 supprime les deux lignes', await texts(page), matrix(ROWS - 2, COLS, (r, c) => nameOf(r === 1 ? 1 : r + 2, c)));
await loadGrid(page, GRID);
await parkMouse(page);
await pickLines(page, 'col', 1, 2);
await realClick(page, barButton('col-del'));
await page.waitForTimeout(250);
checkGrid('« Supprimer la colonne » sur les lettres B et C supprime les deux colonnes', await texts(page), matrix(ROWS, COLS - 2, (r, c) => nameOf(r, c === 1 ? 1 : c + 2)));

// ---------- 5) Tirer le trait d'une ligne ou d'une colonne choisie : toutes les choisies prennent la même taille ----------
await freshGrid(page);
await loadGrid(page, GRID);
await countTransactions(page);
const PX = { row: (await rowHeights(page))[0], col: (await colWidths(page))[0] };
check('une vraie grille (« Nouvelle grille ») n\'est pas réduite à l\'écran : colonnes de 100 px, lignes à la hauteur de leur texte (un peu moins de 30 px)', PX.col === 100 && PX.row >= 28 && PX.row < 30, PX);
// Ce qu'une poignée tirée de `delta` px annonce et pose : la taille de départ plus le déplacement, arrondie.
const rowAt = delta => Math.round(PX.row + delta);
const liveRows = async () => ({ heights: await rowHeights(page), heads: await headSizes(page, 'row'), tip: await tipText(page), tx: await transactions(page) });
const liveCols = async () => ({ widths: await colWidths(page), heads: await headSizes(page, 'col'), tip: await tipText(page), table: await tableWidth(page), tx: await transactions(page) });
const ROW_START = Array(ROWS).fill(PX.row);
const COL_START = Array(COLS).fill(PX.col);

// Plusieurs lignes choisies par leurs numéros : tirer le trait de l'une les règle toutes
await pickLines(page, 'row', 1, 3);
check('les numéros 2 à 4 sélectionnent trois lignes entières', same(await selectedAt(page), cellsBetween(2, 4, 1, COLS)), await selectedAt(page));
await countTransactions(page);
let live = await dragHandle(page, 'row', 2, 20, liveRows);
let wantRows = [PX.row, rowAt(20), rowAt(20), rowAt(20), PX.row, PX.row];
check(`tirer de 20 px le trait sous le numéro 3 (les numéros 2 à 4 sont choisis) : les trois lignes passent à ${rowAt(20)} px EN DIRECT, leurs numéros aussi, l'info-bulle l'annonce, rien n'est enregistré avant le relâcher`,
  sizesAre(live.heights, wantRows) && sizesAre(live.heads, wantRows) && live.tip === `${rowAt(20)} px` && live.tx === 0, live);
check(`au relâcher : UNE transaction, les trois lignes à ${rowAt(20)} px, les autres inchangées, la sélection reste sur les lignes 2 à 4`,
  sizesAre(await rowHeights(page), wantRows) && (await transactions(page)) === 1 && same(await selectedAt(page), cellsBetween(2, 4, 1, COLS)), { heights: await rowHeights(page), tx: await transactions(page), selected: (await selectedAt(page)).length });
await undo(page);
check('un seul Ctrl+Z rend les six lignes à leur hauteur de départ', sizesAre(await rowHeights(page), ROW_START), await rowHeights(page));

// Le trait d'une autre ligne de la sélection (la dernière) règle aussi les trois, vers le haut comme vers le bas (des lignes de 40 px peuvent rétrécir jusqu'à la hauteur de leur texte)
await loadGrid(page, gridHtml(Array(COLS).fill(100), Array(ROWS).fill(40), nameOf));
const mid = (await rowHeights(page))[0];
check('des lignes de 40 px sont plus hautes que leur texte', Math.abs(mid - 40) <= 0.6, mid);
await pickLines(page, 'row', 1, 3);
live = await dragHandle(page, 'row', 3, -8, liveRows);
check(`le trait sous la dernière ligne choisie (le numéro 4), tiré vers le haut de 8 px, règle les trois lignes à ${Math.round(mid - 8)} px EN DIRECT`, sizesAre(live.heights, [mid, ...Array(3).fill(Math.round(mid - 8)), mid, mid]) && live.tip === `${Math.round(mid - 8)} px`, live);
check(`au relâcher : les trois lignes à ${Math.round(mid - 8)} px, les trois autres gardent leurs 40 px`, sizesAre(await rowHeights(page), [mid, ...Array(3).fill(Math.round(mid - 8)), mid, mid]), await rowHeights(page));
await undo(page);
check('un seul Ctrl+Z rend les six lignes à 40 px', sizesAre(await rowHeights(page), Array(ROWS).fill(mid)), await rowHeights(page));

// Ce qui ne règle qu'une ligne : une seule ligne choisie, un curseur, un trait hors de la sélection, un bloc qui ne couvre pas toute la largeur
await loadGrid(page, GRID);
await pickLines(page, 'row', 2);
await dragHandle(page, 'row', 2, 20);
check('une seule ligne choisie (le numéro 3) : tirer son trait ne change que cette ligne', sizesAre(await rowHeights(page), [PX.row, PX.row, rowAt(20), PX.row, PX.row, PX.row]), await rowHeights(page));
await loadGrid(page, GRID);
await clickGrid(page, 2, 2);
await dragHandle(page, 'row', 3, 20);
check('un curseur dans une case : tirer le trait du numéro 4 ne change que la ligne 4', sizesAre(await rowHeights(page), [PX.row, PX.row, PX.row, rowAt(20), PX.row, PX.row]), await rowHeights(page));
await loadGrid(page, GRID);
await pickLines(page, 'row', 1, 3);
await countTransactions(page);
await dragHandle(page, 'row', 5, 20);
check('le trait d\'une ligne hors de la sélection (le numéro 6, alors que 2 à 4 sont choisis) ne règle que cette ligne, la sélection reste', sizesAre(await rowHeights(page), [PX.row, PX.row, PX.row, PX.row, PX.row, rowAt(20)]) && same(await selectedAt(page), cellsBetween(2, 4, 1, COLS)), { heights: await rowHeights(page), selected: (await selectedAt(page)).length });
await loadGrid(page, GRID);
await dragGrid(page, [2, 2], [4, 3]);
check('B2:C4 choisi en glissant couvre trois lignes mais pas toute la largeur', same(await selectedAt(page), cellsBetween(2, 4, 2, 3)), await selectedAt(page));
await dragHandle(page, 'row', 2, 20);
check('un bloc qui ne couvre pas toute la largeur (B2:C4) : le trait du numéro 3 ne règle que la ligne 3', sizesAre(await rowHeights(page), [PX.row, PX.row, rowAt(20), PX.row, PX.row, PX.row]), await rowHeights(page));

// Plusieurs colonnes choisies par leurs lettres
await loadGrid(page, GRID);
await pickLines(page, 'col', 1, 3);
check('les lettres B à D sélectionnent trois colonnes entières', same(await selectedAt(page), cellsBetween(1, ROWS, 2, 4)), (await selectedAt(page)).length);
await countTransactions(page);
live = await dragHandle(page, 'col', 2, 30, liveCols);
let wantCols = [PX.col, PX.col + 30, PX.col + 30, PX.col + 30, PX.col];
check('tirer de 30 px le trait à droite de la lettre C (B à D sont choisies) : les trois colonnes passent à 130 px EN DIRECT, leurs lettres aussi, le tableau s\'élargit de 90 px, l\'info-bulle l\'annonce, rien n\'est enregistré avant le relâcher',
  sizesAre(live.widths, wantCols) && sizesAre(live.heads, wantCols) && Math.abs(live.table - (COLS * PX.col + 90)) <= 1 && live.tip === `${PX.col + 30} px` && live.tx === 0, live);
check('au relâcher : UNE transaction, les trois colonnes à 130 px, les autres à 100 px, le tableau mesure la somme des colonnes, la sélection reste sur les colonnes B à D',
  sizesAre(await colWidths(page), wantCols) && (await transactions(page)) === 1 && Math.abs((await tableWidth(page)) - (COLS * PX.col + 90)) <= 1 && same(await selectedAt(page), cellsBetween(1, ROWS, 2, 4)), { widths: await colWidths(page), tx: await transactions(page), table: await tableWidth(page) });
await undo(page);
check('un seul Ctrl+Z rend les cinq colonnes à 100 px', sizesAre(await colWidths(page), COL_START), await colWidths(page));

await loadGrid(page, GRID);
await pickLines(page, 'col', 1, 3);
await dragHandle(page, 'col', 1, -40);
check('le trait à droite de la première colonne choisie (B), tiré vers la gauche de 40 px, règle B, C et D à 60 px', sizesAre(await colWidths(page), [PX.col, PX.col - 40, PX.col - 40, PX.col - 40, PX.col]), await colWidths(page));
await loadGrid(page, GRID);
await pickLines(page, 'col', 1);
await dragHandle(page, 'col', 1, 30);
check('une seule colonne choisie (B) : tirer son trait ne change que cette colonne', sizesAre(await colWidths(page), [PX.col, PX.col + 30, PX.col, PX.col, PX.col]), await colWidths(page));
await loadGrid(page, GRID);
await pickLines(page, 'col', 1, 3);
await dragHandle(page, 'col', 4, 30);
check('le trait d\'une colonne hors de la sélection (E, alors que B à D sont choisies) ne règle que cette colonne', sizesAre(await colWidths(page), [PX.col, PX.col, PX.col, PX.col, PX.col + 30]), await colWidths(page));
await loadGrid(page, GRID);
await dragGrid(page, [2, 2], [4, 3]);
await dragHandle(page, 'col', 1, 30);
check('un bloc qui ne couvre pas toute la hauteur (B2:C4) : le trait de la lettre B ne règle que la colonne B', sizesAre(await colWidths(page), [PX.col, PX.col + 30, PX.col, PX.col, PX.col]), await colWidths(page));
// Une seule case choisie n'est pas « plusieurs colonnes » : B et C fusionnées en une case (qui reste choisie), le trait de C ne règle que C
await loadGrid(page, GRID);
await parkMouse(page);
await pickLines(page, 'col', 1, 2);
await realClick(page, barButton('cell-merge'));
await page.waitForTimeout(250);
const mergedPair = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table td')).filter(td => td.colSpan > 1 || td.rowSpan > 1).map(td => `${td.rowSpan}x${td.colSpan}`));
await dragHandle(page, 'col', 2, 25);
check('colonnes B et C fusionnées en UNE case (elle reste choisie) : tirer le trait de C ne règle que C, B garde sa largeur',
  same(mergedPair, [`${ROWS}x2`]) && sizesAre(await colWidths(page), [PX.col, PX.col, PX.col + 25, PX.col, PX.col]), { mergedPair, widths: await colWidths(page) });

// Toute la grille choisie (le coin) : le trait de n'importe quelle ligne règle toutes les lignes, celui de n'importe quelle colonne toutes les colonnes
await loadGrid(page, GRID);
await realClick(page, '.v2-grid-corner');
check('le coin sélectionne les trente cases', (await selectedAt(page)).length === ROWS * COLS, (await selectedAt(page)).length);
await dragHandle(page, 'row', 3, 12);
check(`toute la grille choisie : le trait sous le numéro 4 règle les six lignes à ${rowAt(12)} px`, sizesAre(await rowHeights(page), Array(ROWS).fill(rowAt(12))), await rowHeights(page));
await dragHandle(page, 'col', 3, 10);
check('toute la grille choisie : le trait à droite de la lettre D règle les cinq colonnes à 110 px', sizesAre(await colWidths(page), Array(COLS).fill(PX.col + 10)), await colWidths(page));

// Le plancher : toutes les lignes tirées ensemble s'arrêtent à la plus haute des hauteurs de leur texte
const LONG = 'Un texte long sur trois lignes';
const TALL = gridHtml(Array(COLS).fill(100), Array(ROWS).fill(28), (r, c) => (r === 3 && c === 1 ? LONG : nameOf(r, c)));
await loadGrid(page, TALL);
const tallRow = (await rowHeights(page))[2];
check('une ligne au texte long est nettement plus haute que les autres (son plancher), et les numéros 2 à 4 restent dans le panneau', tallRow > 2 * PX.row && tallRow < 100, await rowHeights(page));
await pickLines(page, 'row', 1, 3);
check('les numéros 2 à 4 sélectionnent les quinze cases des trois lignes', same(await selectedAt(page), cellsBetween(2, 4, 1, COLS)), (await selectedAt(page)).length);
await countTransactions(page);
live = await dragHandle(page, 'row', 1, -120, liveRows);
check('tirer vers le haut le trait de la ligne 2 (lignes 2 à 4 choisies) : les trois lignes s\'arrêtent EN DIRECT à la hauteur du texte de la plus haute, jamais en dessous',
  sizesAre(live.heights.slice(1, 4), Array(3).fill(tallRow), 1.2) && Math.abs(parseFloat(live.tip) - tallRow) <= 1.2 && live.tx === 0, { live, tallRow });
const floorRows = await rowHeights(page);
check('au relâcher : UNE transaction, les trois lignes ont la même hauteur (celle du texte de la plus haute), les autres gardent la leur', sizesAre(floorRows.slice(1, 4), Array(3).fill(floorRows[2]), 0.6) && Math.abs(floorRows[2] - tallRow) <= 1.2 && sizesAre([floorRows[0], ...floorRows.slice(4)], Array(3).fill(PX.row)) && (await transactions(page)) === 1, { floorRows, tallRow, tx: await transactions(page) });

// Un simple appui sur la poignée, sans la bouger, ne change rien (les lignes gardent chacune leur hauteur)
await loadGrid(page, TALL);
await pickLines(page, 'row', 1, 3);
check('les numéros 2 à 4 sont choisis avant l\'appui', same(await selectedAt(page), cellsBetween(2, 4, 1, COLS)), (await selectedAt(page)).length);
await countTransactions(page);
const beforeClick = await rowHeights(page);
await dragHandle(page, 'row', 1, 0);
check('un appui sur la poignée sans la bouger ne change aucune hauteur et n\'enregistre rien', sizesAre(await rowHeights(page), beforeClick) && (await transactions(page)) === 0, { before: beforeClick, after: await rowHeights(page), tx: await transactions(page) });
// Un aller-retour qui revient au point de départ avant le relâcher : même chose
const handleBack = await boxOf(page, handleOf('row', 1));
await page.mouse.move(handleBack.x, handleBack.y, { steps: 3 });
await page.mouse.down();
await page.mouse.move(handleBack.x, handleBack.y + 40, { steps: 6 });
const duringBack = await rowHeights(page);
await page.mouse.move(handleBack.x, handleBack.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(250);
check('tirer la poignée puis la ramener au point de départ avant de relâcher ne change aucune hauteur et n\'enregistre rien', duringBack[1] > beforeClick[1] + 20 && sizesAre(await rowHeights(page), beforeClick) && (await transactions(page)) === 0, { before: beforeClick, during: duringBack, after: await rowHeights(page), tx: await transactions(page) });

// Échap pendant le geste : tout est rendu
await loadGrid(page, GRID);
await pickLines(page, 'row', 1, 3);
await countTransactions(page);
const handleEsc = await boxOf(page, handleOf('row', 2));
await page.mouse.move(handleEsc.x, handleEsc.y, { steps: 3 });
await page.mouse.down();
await page.mouse.move(handleEsc.x, handleEsc.y + 30, { steps: 6 });
const duringEsc = await rowHeights(page);
await page.keyboard.press('Escape');
await page.mouse.up();
await page.waitForTimeout(250);
const afterEsc = await rowHeights(page);
const leftOver = await page.evaluate(() => ({ preview: !!document.getElementById('pp-grid-resize-preview'), cls: document.body.className, heads: Array.from(document.querySelectorAll('.v2-grid-rowhead')).map(h => Math.round(h.getBoundingClientRect().height * 10) / 10) }));
check('Échap pendant le geste : les trois lignes reprennent leur hauteur, rien n\'est enregistré, l\'aperçu est retiré, la sélection reste',
  sizesAre(duringEsc, [PX.row, PX.row + 30, PX.row + 30, PX.row + 30, PX.row, PX.row]) && sizesAre(afterEsc, ROW_START) && sizesAre(leftOver.heads, ROW_START) && !leftOver.preview && !/pp-grid-resizing/.test(leftOver.cls)
    && (await transactions(page)) === 0 && same(await selectedAt(page), cellsBetween(2, 4, 1, COLS)), { duringEsc, afterEsc, leftOver, tx: await transactions(page) });

// Une case fusionnée sur deux colonnes tirées ensemble reçoit les deux parts de sa largeur
const MERGED = `<table style="width: 500px;"><colgroup>${'<col style="width: 100px;">'.repeat(5)}</colgroup><tbody>`
  + '<tr data-row-height="28" style="height: 28px"><td colwidth="100"><p>A1</p></td><td colspan="2" colwidth="100,100"><p>B1C1</p></td><td colwidth="100"><p>D1</p></td><td colwidth="100"><p>E1</p></td></tr>'
  + [2, 3].map(r => `<tr data-row-height="28" style="height: 28px">${[1, 2, 3, 4, 5].map(c => `<td colwidth="100"><p>${nameOf(r, c)}</p></td>`).join('')}</tr>`).join('') + '</tbody></table>';
await loadGrid(page, MERGED);
await pickLines(page, 'col', 1, 2);
await dragHandle(page, 'col', 1, 30);
const mergedNow = await page.evaluate(() => {
  let colwidth = null;
  EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'tableCell' && node.attrs.colspan === 2) colwidth = node.attrs.colwidth; });
  const td = Array.from(document.querySelectorAll('.tiptap table td')).find(x => x.colSpan === 2);
  return { colwidth, width: td ? Math.round(td.getBoundingClientRect().width * 10) / 10 : null };
});
check('colonnes B et C choisies, B tirée de 30 px : B et C passent à 130 px, la case fusionnée sur les deux porte les deux parts (130 + 130) et mesure 260 px',
  sizesAre(await colWidths(page), [PX.col, PX.col + 30, PX.col + 30, PX.col, PX.col]) && same(mergedNow.colwidth, [PX.col + 30, PX.col + 30]) && Math.abs(mergedNow.width - 2 * (PX.col + 30)) <= 1, { widths: await colWidths(page), mergedNow });

await context.close();
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
