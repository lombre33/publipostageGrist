#!/usr/bin/env node
// Hauteur d'une ligne d'un tableau de DOCUMENT réglée depuis ses numéros (js/grid-editor.js : documentStrips, poignées des numéros ; lot 4 (b) sur 6 de « le tableau d'un document est un
// tableau du mode grille » et point 5.4 des fonctions manquantes : « une case de signature : on choisit la hauteur, 3 cm ») à la VRAIE souris (page.mouse, page.keyboard ; Node/Playwright),
// à la taille du panneau Grist (~700x400), en thème clair puis sombre, puis dans un panneau étroit (420 px), en Aperçu A4 (feuille réduite à ~0,85) et sans. Un appui simulé ne
// donne ni capture du pointeur, ni survol, ni curseur « row-resize » : c'est ici qu'on s'assure que
//   - chaque numéro porte sa poignée (un vrai pointeur la touche, le curseur y devient « row-resize ») ; les lettres ont la leur depuis le lot 4 (c), mesurée par verify-doc-strips-width-mouse.mjs
//     (groupe docStripsWidthMouse) ;
//   - tirer un numéro règle la hauteur de SA ligne en direct (les autres lignes gardent la leur, celles du dessous descendent, le texte d'après aussi, le texte d'avant ne bouge pas) et la
//     bulle la dit en centimètres (la page est en centimètres, la grille en pixels) ; rien n'est écrit dans le document avant le relâcher, puis UNE transaction pose la hauteur en pixels de
//     mise en page (pas ceux de l'écran, que la feuille réduite ou agrandie déforme) : le HTML garde « data-row-height », un seul Ctrl+Z rend la ligne, Rétablir la repose ;
//   - une ligne ne descend pas sous la hauteur de son texte ; Échap annule le glissé sans rien laisser (marque du tableau, feuille d'aperçu, bulle, curseur) ;
//   - des lignes choisies par leurs numéros prennent toutes la même hauteur ;
//   - seul le tableau des bandeaux est réglé quand le document en porte plusieurs ; pour un tableau dans une case, la ligne du tableau extérieur est réglée et celle de l'intérieur garde la sienne ;
//   - le suivi des modifications propose la hauteur (marque « modification » sur la ligne réglée) et « Tout refuser » la rend ; une ligne déjà proposée (enveloppée d'un <span> par le suivi) se règle
//     encore : l'aperçu la suit et son plancher est la hauteur de son texte ; la bulle se lit (contraste de la charte, F5).
// Les fonctions elles-mêmes sont dans dev-tests/scenarios-grid-in-document.js (groupe gridInDocument) ; la place des bandeaux à l'écran est mesurée par verify-doc-strips-mouse.mjs
// (groupe docStripsMouse).
// Lancé par run-headless.mjs (groupe Node « docStripsResizeMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-doc-strips-resize-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.DOC_STRIPS_RESIZE_MOUSE_PORT || 8994);
const WIDTH = 700;
const HEIGHT = 400;
const NARROW = 420;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-doc-strips-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-doc-strips-resize-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function openWidget(colorScheme, size = { width: WIDTH, height: HEIGHT }) {
  const context = await browser.newContext({ bypassCSP: true, viewport: size, colorScheme });
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
async function realClick(page, selector, options) {
  const b = await boxOf(page, selector);
  if (!b) return null;
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y, options);
  await page.waitForTimeout(200);
  return b;
}

// Le centre de la case dont le texte est exactement `text`, ramenée au milieu du plan de travail d'abord : dans un panneau de 420 px la barre d'outils passe sur deux lignes, il ne reste
// que 150 px de plan de travail et le second tableau d'un document en sort.
const cellPoint = (page, text) => page.evaluate((wanted) => {
  const td = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).find(c => c.querySelector('p') && c.querySelector('p').textContent === wanted);
  if (!td) return null;
  td.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = td.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, text);
async function clickCell(page, text) {
  const p = await cellPoint(page, text);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
}
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;

// Contraste WCAG de deux couleurs CSS « rgb(...) ».
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

const STRIPS = '.pp-doc-strips';
const ROWHEAD = n => `${STRIPS} .v2-grid-rowhead:nth-child(${n})`;

// Un document : un paragraphe, un tableau 3 lignes x 3 colonnes aux largeurs réglées (140, 190 et 120 px), un paragraphe.
const cellsHtml = (row, widths) => '<tr>' + widths.map((w, c) => `<td colwidth="${w}"><p>${'ABC'[c]}${row}</p></td>`).join('') + '</tr>';
const DOC = '<p>Avant le tableau</p><table><tbody>' + [1, 2, 3].map(r => cellsHtml(r, [140, 190, 120])).join('') + '</tbody></table><p>Après le tableau</p>';
// Deux tableaux : A (2 lignes, 2 colonnes) puis B (4 lignes, 3 colonnes), un paragraphe entre les deux.
const TWO = '<p>Avant</p><table><tbody>' + [1, 2].map(r => cellsHtml(r, [150, 150]).replace(/<p>([A-C])(\d)<\/p>/g, '<p>T$1$2</p>')).join('') + '</tbody></table>'
  + '<p>Entre les tableaux</p><table><tbody>' + [1, 2, 3, 4].map(r => cellsHtml(r, [110, 110, 110]).replace(/<p>([A-C])(\d)<\/p>/g, '<p>U$1$2</p>')).join('') + '</tbody></table><p>Après</p>';
// Tout ce que la page montre des bandeaux et du tableau `n` (depuis 0) : rectangles à l'écran (pixels écran), étiquettes, têtes allumées.
const stripsState = (page, n = 0) => page.evaluate((index) => {
  // Un rectangle de zéros pour ce qui n'existe pas : une page sans bandeaux fait échouer les vérifications, elle n'arrête pas le script.
  const rect = node => { if (!node) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const root = document.querySelector('.pp-doc-strips');
  const box = document.getElementById('editor-container');
  const c = box.getBoundingClientRect();
  const tables = Array.from(document.querySelectorAll('.tiptap table')).filter(t => !t.parentElement.closest('table'));
  const table = tables[index] || null;
  const rows = table ? Array.from(table.querySelectorAll(':scope > tbody > tr')) : [];
  const firstCells = rows[0] ? Array.from(rows[0].children) : [];
  const heads = kind => (root ? Array.from(root.querySelectorAll('.v2-grid-' + kind + 'head')) : []).map(h => Object.assign({ label: h.textContent, sel: h.classList.contains('sel'), handles: h.querySelectorAll('.v2-grid-handle').length }, rect(h)));
  const sheet = document.querySelector('#editor-container .v2-page-sheet');
  return {
    count: document.querySelectorAll('.pp-doc-strips').length,
    shown: !!root && !root.hidden && getComputedStyle(root).display !== 'none',
    parent: root ? root.parentElement.tagName : null,
    root: rect(root),
    container: { left: c.left + box.clientLeft, top: c.top + box.clientTop, right: c.left + box.clientLeft + box.clientWidth, bottom: c.top + box.clientTop + box.clientHeight },
    corner: rect(root && root.querySelector('.v2-grid-corner')), cols: rect(root && root.querySelector('.v2-grid-cols')), rowsStrip: rect(root && root.querySelector('.v2-grid-rows')),
    colHeads: heads('col'), rowHeads: heads('row'),
    table: rect(table), tableRows: rows.map(rect), tableCols: firstCells.map(rect),
    zoom: sheet ? parseFloat(getComputedStyle(sheet).zoom) || 1 : 1, a4: box.classList.contains('a4-preview'),
    inScrollBox: !!root && box.contains(root),
  };
}, n);
// Les lettres sont sur les colonnes, les numéros sur les lignes, le coin entre les deux : bords mesurés (pixels écran).
function alignment(s) {
  const bad = [];
  if (!s.shown || !s.table) return ['bandeaux ou tableau absents'];
  s.colHeads.forEach((h, i) => {
    const col = s.tableCols[i];
    if (!col || !near(h.left, col.left) || !near(h.right, col.right)) bad.push(`lettre ${h.label} : ${Math.round(h.left)}-${Math.round(h.right)} pour la colonne ${col ? Math.round(col.left) + '-' + Math.round(col.right) : '?'}`);
  });
  s.rowHeads.forEach((h, i) => {
    const row = s.tableRows[i];
    if (!row || !near(h.top, row.top) || !near(h.bottom, row.bottom)) bad.push(`numéro ${h.label} : ${Math.round(h.top)}-${Math.round(h.bottom)} pour la ligne ${row ? Math.round(row.top) + '-' + Math.round(row.bottom) : '?'}`);
  });
  if (s.colHeads.length !== s.tableCols.length) bad.push(`${s.colHeads.length} lettres pour ${s.tableCols.length} colonnes`);
  if (s.rowHeads.length !== s.tableRows.length) bad.push(`${s.rowHeads.length} numéros pour ${s.tableRows.length} lignes`);
  // Les numéros touchent le bord gauche du tableau, sauf quand la place manque à sa gauche (page sans Aperçu A4, tableau défilé) : ils restent alors contre le bord du plan de travail.
  const right = Math.max(s.table.left, s.container.left + s.rowsStrip.width);
  if (!near(s.cols.bottom, s.table.top, 2) || !near(s.rowsStrip.right, right, 2)) bad.push(`bandeaux hors du coin du tableau : ${JSON.stringify([s.cols.bottom, s.table.top, s.rowsStrip.right, right])}`);
  if (!near(s.corner.right, right, 2) || !near(s.corner.bottom, s.table.top, 2)) bad.push('coin mal placé');
  return bad;
}
// Ce qu'un vrai pointeur trouve au centre de `selector` : est-ce lui (ou un de ses enfants) ?
const hitsIt = (page, selector) => page.evaluate((sel) => {
  const node = document.querySelector(sel);
  if (!node) return false;
  const r = node.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!top && (top === node || node.contains(top));
}, selector);
// Le texte d'avant, le tableau et le texte d'après : leurs rectangles.
const flow = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap > p, .tiptap table')).map((node) => { const r = node.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; }));
// La souris attend dans le coin du plan de travail : partie de (0, 0), elle traverserait la barre d'outils (ses menus s'ouvrent au survol) et le clic suivant tomberait dans un menu ouvert.
const parkMouse = page => { const size = page.viewportSize(); return page.mouse.move(size.width - 12, size.height - 12); };
async function load(page, html) {
  await page.evaluate(({ html }) => { GridEditor.setActive(false); Editor.setHTML(html); const box = document.getElementById('editor-container'); box.scrollTop = 0; box.scrollLeft = 0; }, { html });
  await page.waitForTimeout(500);
  await parkMouse(page);
}
const setA4 = (page, on) => page.evaluate((value) => { const t = document.getElementById('v2-toggle-a4-preview'); if (t && t.checked !== value) { t.checked = value; t.dispatchEvent(new Event('change', { bubbles: true })); } }, on).then(() => page.waitForTimeout(500));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Ce que ce script ajoute aux assistants ci-dessus.

// Un tableau extérieur de deux lignes dont une case porte un tableau intérieur d'une ligne.
const INNER = '<p>Avant</p><table><tbody><tr><td><p>Dehors</p><table><tbody><tr><td><p>N1</p></td><td><p>N2</p></td></tr></tbody></table></td><td><p>Voisine</p></td></tr>'
  + '<tr><td><p>Bas</p></td><td><p>Bas droite</p></td></tr></tbody></table><p>Après</p>';

// Le tableau de rang `index` tel que le document le dit (pas tel que l'écran le montre) : la hauteur posée de chaque ligne, les marques de suivi de chaque ligne, la largeur de chaque case.
const modelOf = (page, index = 0) => page.evaluate((n) => {
  const tables = [];
  EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'table') tables.push(node); return true; });
  const rows = []; const widths = []; const marks = [];
  tables[n].forEach((row) => {
    rows.push(row.attrs.rowHeight || null);
    marks.push(row.marks.map(mark => mark.type.name + ':' + mark.attrs.attrName).join());
    const line = [];
    row.forEach(cell => line.push(cell.attrs.colwidth ? cell.attrs.colwidth[0] : null));
    widths.push(line);
  });
  return { rows, widths, marks };
}, index);
const sameModel = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const allNull = list => list.every(v => v === null);
// Les lignes du tableau de rang `index` (hors tableaux dans une case) à l'écran : place et hauteur.
const rowsOnScreen = (page, index = 0) => page.evaluate((n) => {
  const tables = Array.from(document.querySelectorAll('.tiptap table')).filter(t => !t.parentElement.closest('table'));
  // Sous le suivi des modifications une ligne proposée est enveloppée d'un <span> dans le <tbody>.
  return Array.from(tables[n].querySelectorAll(':scope > tbody > tr, :scope > tbody > span > tr')).map((tr) => { const r = tr.getBoundingClientRect(); return { top: r.top, height: r.height }; });
}, index);
const cmOf = (page, px) => page.evaluate(value => PageLayout.cmText(value * 25.4 / 96) + ' cm', px);
const tipText = page => page.evaluate(() => { const t = document.querySelector('.v2-grid-tip'); return t ? t.textContent : null; });
const leftovers = page => page.evaluate(() => ({
  marked: document.querySelectorAll('[data-pp-sizing]').length, preview: !!document.getElementById('pp-grid-resize-preview'), tip: !!document.querySelector('.v2-grid-tip'),
  cursorClass: document.body.classList.contains('pp-grid-resizing-row') || document.body.classList.contains('pp-grid-resizing-col'),
}));
const noLeftovers = l => l.marked === 0 && !l.preview && !l.tip && !l.cursorClass;
const sheetZoom = page => page.evaluate(() => EditorCore.layoutZoom(EditorCore.getEditor().view.dom));

const ROWHANDLE = n => `${ROWHEAD(n)} .v2-grid-handle`;
// Un vrai glissé : la souris rejoint la poignée (survol compris), appuie, se déplace de (dx, dy) en plusieurs pas, laisse `during` regarder la page en plein glissé, puis relâche
// (sauf `keepDown`). Rend la boîte de la poignée de départ et ce que `during` a lu.
async function drag(page, selector, dx, dy, { during, keepDown = false, steps = 8 } = {}) {
  const b = await boxOf(page, selector);
  if (!b) throw new Error('poignée introuvable : ' + selector);
  await page.mouse.move(b.x + 6, b.y - 5, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(b.x + dx, b.y + dy, { steps });
  await page.waitForTimeout(200);
  const mid = during ? await during() : null;
  if (!keepDown) {
    await page.mouse.up();
    await page.waitForTimeout(550);
  }
  return { box: b, mid };
}
// Plus de 500 ms entre deux gestes : prosemirror-history groupe sinon les transactions rapprochées en UN seul évènement.
const undoKey = async (page) => { await page.keyboard.press('Control+z'); await page.waitForTimeout(450); };
const redoKey = async (page) => { await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(450); };

async function runTheme(theme, size, tag) {
  const label = tag || (theme === 'dark' ? 'sombre' : 'clair');
  console.log(`\n=== Hauteur d'une ligne d'un tableau de document depuis ses numéros, à la souris, ${size.width}x${size.height}, ${tag ? 'panneau étroit' : 'thème ' + label} ===`);
  const { context, page } = await openWidget(theme, size);
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);

  for (const a4 of [true, false]) {
    const mode = a4 ? 'Aperçu A4' : 'page sans A4';
    const tag2 = `${label}, ${mode}`;
    await setA4(page, a4);

    // ---------- 1) Les poignées : une par numéro, qui répondent au pointeur (celles des lettres : docStripsWidthMouse) ----------
    await load(page, DOC);
    await clickCell(page, 'B2');
    let s = await stripsState(page);
    const zoom = await sheetZoom(page);
    const hits = [];
    for (let n = 1; n <= 3; n++) hits.push(await hitsIt(page, ROWHANDLE(n)));
    check(`${tag2} (feuille à l'échelle ${zoom.toFixed(2)}) - trois poignées de ligne (une par numéro), un vrai pointeur au centre de chacune tombe sur elle ; chaque lettre porte aussi la sienne`,
      s.shown && hits.every(Boolean) && s.rowHeads.every(h => h.handles === 1) && s.colHeads.every(h => h.handles === 1), { hits, rows: s.rowHeads.map(h => h.handles), cols: s.colHeads.map(h => h.handles) });
    const hb = await boxOf(page, ROWHANDLE(2));
    await page.mouse.move(hb.x - 4, hb.y - 4, { steps: 2 });
    await page.mouse.move(hb.x, hb.y, { steps: 3 });
    await page.waitForTimeout(150);
    const hover = await page.evaluate(sel => ({ cursor: getComputedStyle(document.querySelector(sel)).cursor, line: getComputedStyle(document.querySelector(sel), '::after').opacity }), ROWHANDLE(2));
    const rest = await page.evaluate(sel => getComputedStyle(document.querySelector(sel), '::after').opacity, ROWHANDLE(3));
    check(`${tag2} - le curseur devient « row-resize » sur une poignée de ligne ; son trait d'accent n'apparaît que sous le pointeur`, hover.cursor === 'row-resize' && Number(hover.line) > 0.5 && Number(rest) === 0, { hover, rest });
    await parkMouse(page);

    // ---------- 2) Hauteur d'une ligne (point 5.4 : « une case de signature haute ») ----------
    await load(page, DOC);
    await clickCell(page, 'B2');
    const model0 = await modelOf(page);
    const rows0 = await rowsOnScreen(page);
    const flow0 = await flow(page);
    const natural = rows0[1].height / zoom;
    const DY = 60;
    const expectedRow = Math.round(natural + DY / zoom);
    const expectedCm = await cmOf(page, expectedRow);
    const row = await drag(page, ROWHANDLE(2), 0, DY, {
      during: async () => ({
        tip: await tipText(page), rows: await rowsOnScreen(page), model: await modelOf(page), s: await stripsState(page), flow: await flow(page),
        marked: await page.evaluate(() => !!document.querySelector('.tiptap table[data-pp-sizing]')), preview: await page.evaluate(() => (document.getElementById('pp-grid-resize-preview') || {}).textContent || ''),
        cursorClass: await page.evaluate(() => document.body.classList.contains('pp-grid-resizing-row')),
      }),
    });
    const mid = row.mid;
    check(`${tag2} - tirer le numéro 2 vers le bas de ${DY} px : la bulle dit la hauteur en centimètres (${expectedCm}), le curseur reste « row-resize » partout`, mid.tip === expectedCm && mid.cursorClass, { tip: mid.tip, attendu: expectedCm });
    check(`${tag2} - en plein glissé la ligne 2 a déjà la nouvelle hauteur à l'écran (${Math.round(expectedRow * zoom * 10) / 10} px), les lignes 1 et 3 n'ont pas changé, la ligne 3 est descendue d'autant`,
      near(mid.rows[1].height, expectedRow * zoom, 0.8) && near(mid.rows[0].height, rows0[0].height, 0.3) && near(mid.rows[2].height, rows0[2].height, 0.3) && near(mid.rows[2].top - rows0[2].top, mid.rows[1].height - rows0[1].height, 0.8),
      { avant: rows0, pendant: mid.rows, expectedRow });
    check(`${tag2} - le texte d'avant n'a pas bougé, celui d'après est descendu de la même hauteur`, near(mid.flow[0][1], flow0[0][1], 0.5) && near(mid.flow[2][1] - flow0[2][1], mid.rows[1].height - rows0[1].height, 1), { avant: flow0, pendant: mid.flow });
    check(`${tag2} - le numéro 2 suit la ligne en plein glissé (même hauteur, même place), le tableau réglé porte sa marque et l'aperçu ne vise que lui`,
      near(mid.s.rowHeads[1].height, mid.rows[1].height, 0.8) && near(mid.s.rowHeads[1].top, mid.rows[1].top, 1) && mid.marked && /table\[data-pp-sizing\] > tbody > tr:nth-child\(2\)/.test(mid.preview), { head: mid.s.rowHeads[1], row: mid.rows[1], marked: mid.marked, preview: mid.preview });
    check(`${tag2} - rien n'est écrit dans le document avant le relâcher (aucune hauteur posée)`, sameModel(mid.model, model0), { avant: model0, pendant: mid.model });
    const model1 = await modelOf(page);
    const html1 = await page.evaluate(() => Editor.getHTML());
    s = await stripsState(page);
    check(`${tag2} - au relâcher la ligne 2 porte ${expectedRow} px (les lignes 1 et 3 gardent la hauteur de leur texte), le HTML garde « data-row-height » et le style`, model1.rows.join() === `,${expectedRow},` && html1.includes(`data-row-height="${expectedRow}"`) && html1.includes(`height: ${expectedRow}px`), { model1, html: html1.slice(0, 300) });
    const rows1 = await rowsOnScreen(page);
    check(`${tag2} - la ligne 2 a bien ${expectedRow} px de mise en page après le relâcher, sans saut (${Math.round(rows1[1].height * 10) / 10} px à l'écran), et les numéros sont toujours sur leurs lignes`, near(rows1[1].height, expectedRow * zoom, 0.8) && alignment(s).length === 0, { ecran: rows1[1].height, bad: alignment(s) });
    check(`${tag2} - rien ne traîne après le glissé (marque du tableau, feuille d'aperçu, bulle, curseur de glissé)`, noLeftovers(await leftovers(page)), await leftovers(page));
    const kept = await page.evaluate(() => ({ editor: document.activeElement === EditorCore.getEditor().view.dom, bar: !!document.querySelector('.v2-floating-toolbar.v2-table-toolbar.visible') }));
    check(`${tag2} - l'éditeur garde le focus et la barre du tableau reste affichée`, kept.editor && kept.bar, kept);
    await undoKey(page);
    check(`${tag2} - un seul Ctrl+Z rend la ligne à la hauteur de son texte (document et écran)`, sameModel(await modelOf(page), model0) && near((await rowsOnScreen(page))[1].height, rows0[1].height, 0.8), { modele: await modelOf(page), ecran: (await rowsOnScreen(page))[1].height });
    await redoKey(page);
    check(`${tag2} - Rétablir la repose`, (await modelOf(page)).rows.join() === `,${expectedRow},`, await modelOf(page));
    await undoKey(page);

    // ---------- 3) Plancher : jamais sous la hauteur du texte ----------
    // Un petit écart d'abord : dans un panneau de 420 px la barre du tableau passe sur deux lignes, le tableau part plus bas et la poignée d'une ligne agrandie de 60 px sortirait de l'écran.
    const SMALL = 30;
    const expectedSmall = Math.round(natural + SMALL / zoom);
    await drag(page, ROWHANDLE(2), 0, SMALL);
    const tall = await modelOf(page);
    await drag(page, ROWHANDLE(2), 0, -400);
    const floor = await modelOf(page);
    const rows2 = await rowsOnScreen(page);
    check(`${tag2} - tirée jusqu'en haut, la ligne s'arrête à la hauteur de son texte (${Math.round(rows2[1].height * 10) / 10} px à l'écran), la hauteur posée n'est jamais en dessous (${floor.rows[1]} px pour ${Math.round(natural * 10) / 10})`,
      tall.rows[1] === expectedSmall && floor.rows[1] >= Math.floor(natural) && floor.rows[1] <= Math.ceil(natural) + 1 && rows2[1].height >= rows0[1].height - 0.6, { tall, floor, natural, ecran: rows2[1].height });
    await undoKey(page);
    await undoKey(page);

    // ---------- 4) Échap annule ----------
    await load(page, DOC);
    await clickCell(page, 'B2');
    const modelEsc = await modelOf(page);
    const rowsEsc = await rowsOnScreen(page);
    await drag(page, ROWHANDLE(1), 0, 40, { keepDown: true });
    const midEsc = await rowsOnScreen(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const afterEsc = await rowsOnScreen(page);
    check(`${tag2} - Échap en plein glissé annule : la hauteur d'avant revient (${Math.round(midEsc[0].height)} px pendant, ${Math.round(afterEsc[0].height)} px après), le document n'a pas changé, rien ne traîne`,
      midEsc[0].height > rowsEsc[0].height + 20 && near(afterEsc[0].height, rowsEsc[0].height, 0.5) && sameModel(await modelOf(page), modelEsc) && noLeftovers(await leftovers(page)), { rowsEsc, midEsc, afterEsc, left: await leftovers(page) });
    await clickCell(page, 'B2');

    // ---------- 5) Plusieurs lignes choisies par leurs numéros : la même hauteur pour toutes ----------
    await realClick(page, ROWHEAD(1));
    await page.keyboard.down('Shift');
    await realClick(page, ROWHEAD(3));
    await page.keyboard.up('Shift');
    await page.waitForTimeout(300);
    const rowsMulti = await rowsOnScreen(page);
    const multiExpected = Math.round(rowsMulti[2].height / zoom + 30 / zoom);
    await drag(page, ROWHANDLE(3), 0, 30);
    const modelMulti = await modelOf(page);
    check(`${tag2} - lignes 1 à 3 choisies, tirer le bas de la ligne 3 de 30 px règle les trois lignes à la même hauteur (${multiExpected} px)`, modelMulti.rows.every(r => r === multiExpected), { modelMulti, multiExpected });
    await undoKey(page);
    check(`${tag2} - un seul Ctrl+Z rend les trois lignes`, allNull((await modelOf(page)).rows), await modelOf(page));

    // ---------- 6) Deux tableaux : seul celui des bandeaux est réglé ----------
    await load(page, TWO);
    await clickCell(page, 'UB3');
    const aRows0 = await rowsOnScreen(page, 0);
    const bRows0 = await rowsOnScreen(page, 1);
    const twoDrag = await drag(page, ROWHANDLE(2), 0, 30, {
      during: async () => ({ a: await rowsOnScreen(page, 0), b: await rowsOnScreen(page, 1), marked: await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table')).map(t => t.hasAttribute('data-pp-sizing'))) }),
    });
    const aRows1 = await rowsOnScreen(page, 0);
    const modelA = await modelOf(page, 0); const modelB = await modelOf(page, 1);
    check(`${tag2} - deux tableaux : tirer le numéro 2 du tableau B règle sa ligne 2 pendant le glissé (+${Math.round(twoDrag.mid.b[1].height - bRows0[1].height)} px) et ne touche pas la ligne 2 du tableau A (même rang), ni pendant ni après`,
      twoDrag.mid.b[1].height > bRows0[1].height + 15 && twoDrag.mid.a.every((r, i) => near(r.height, aRows0[i].height, 0.3)) && aRows1.every((r, i) => near(r.height, aRows0[i].height, 0.3))
        && twoDrag.mid.marked.join() === 'false,true' && allNull(modelA.rows) && modelB.rows[1] > 0 && modelB.rows[0] === null && modelB.rows[2] === null,
      { aAvant: aRows0, aPendant: twoDrag.mid.a, modelA, modelB, marked: twoDrag.mid.marked });
    await undoKey(page);

    // ---------- 7) Tableau dans une case : la ligne du tableau extérieur est réglée, celle de l'intérieur garde sa hauteur ----------
    await load(page, INNER);
    await clickCell(page, 'Voisine');
    const innerHeights = () => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table table tr')).map(tr => tr.getBoundingClientRect().height));
    const innerRows0 = await innerHeights();
    const innerDrag = await drag(page, ROWHANDLE(1), 0, 40, { during: async () => ({ inner: await innerHeights(), outer: await rowsOnScreen(page) }) });
    const innerModel = await modelOf(page, 0);
    check(`${tag2} - tableau dans une case : tirer la ligne 1 du tableau extérieur la règle, la ligne du tableau intérieur garde sa hauteur (${Math.round(innerRows0[0])} px) pendant le glissé et après`,
      innerModel.rows[0] > 0 && innerModel.rows[1] === null && innerDrag.mid.inner.every((h, i) => near(h, innerRows0[i], 0.3)) && (await innerHeights()).every((h, i) => near(h, innerRows0[i], 0.3)), { innerRows0, pendant: innerDrag.mid.inner, outer: innerModel });
    await undoKey(page);
  }

  // ---------- 8) Le suivi des modifications : la hauteur est une suggestion, refusable ----------
  await setA4(page, true);
  await load(page, DOC);
  await clickCell(page, 'B2');
  await page.evaluate(() => Editor.setTrackChanges(true));
  await page.waitForTimeout(300);
  await clickCell(page, 'B2');
  await drag(page, ROWHANDLE(2), 0, 50);
  const tracked = await modelOf(page);
  check(`${label} - suivi allumé : tirer le numéro 2 pose la hauteur en suggestion (marque « modification » de la hauteur de la ligne 2, aucune autre ligne touchée)`, tracked.rows[1] > 0 && tracked.marks[1] === 'modification:rowHeight' && tracked.marks[0] === '' && tracked.marks[2] === '', tracked);
  // Le suivi enveloppe la ligne proposée dans un <span> : elle se règle encore (l'aperçu la suit, sa hauteur ne descend que jusqu'à celle de son texte).
  const wrapped = await page.evaluate(() => !!document.querySelector('.tiptap table > tbody > span > tr'));
  const tall = (await rowsOnScreen(page))[1].height;
  const again = await drag(page, ROWHANDLE(2), 0, -25, { during: async () => (await rowsOnScreen(page))[1].height });
  const shorter = (await rowsOnScreen(page))[1].height;
  check(`${label} - suivi allumé, ligne déjà proposée (enveloppée d'un <span>) : la tirer vers le haut de 25 px la raccourcit en direct (${Math.round(tall)} → ${Math.round(again.mid)} px) et au relâcher (${Math.round(shorter)} px)`,
    wrapped && near(again.mid, tall - 25, 2.5) && near(shorter, tall - 25, 2.5), { wrapped, tall, mid: again.mid, shorter });
  await drag(page, ROWHANDLE(2), 0, -400, { steps: 12 });
  const floorRows = await rowsOnScreen(page);
  check(`${label} - suivi allumé, ligne déjà proposée : tirée tout en haut, elle s'arrête à la hauteur de son texte (celle d'une ligne voisine : ${Math.round(floorRows[0].height)} px), pas à sa hauteur du moment`,
    near(floorRows[1].height, floorRows[0].height, 1.5), floorRows.map(r => r.height));
  await page.evaluate(() => EditorCore.getEditor().chain().focus().rejectAllSuggestionsChunked().run());
  await page.waitForTimeout(800);
  check(`${label} - « Tout refuser » rend la hauteur d'origine (toutes les lignes à la hauteur de leur texte)`, allNull((await modelOf(page)).rows), await modelOf(page));
  await page.evaluate(() => Editor.setTrackChanges(false));
  await page.waitForTimeout(300);

  // ---------- 9) Page agrandie : la hauteur posée est celle de la mise en page, pas celle de l'écran ----------
  await load(page, DOC);
  // Le haut du tableau à un tiers du plan de travail (120 px au plus) : dans 420 px la barre d'outils passe sur deux lignes, il ne reste que 150 px de plan de travail.
  const topOfTable = () => page.evaluate(() => { const box = document.getElementById('editor-container'); const t = document.querySelector('.tiptap table'); box.scrollTop += t.getBoundingClientRect().top - box.getBoundingClientRect().top - Math.min(120, box.clientHeight / 3); });
  await topOfTable();
  for (let i = 0; i < 14 && (await sheetZoom(page)) <= 1.1; i++) await realClick(page, '#pp-page-zoom-in');
  await page.waitForTimeout(500);
  await topOfTable();
  await clickCell(page, 'B2');
  const zoomed = await sheetZoom(page);
  const rowsZ = await rowsOnScreen(page);
  const expectedZ = Math.round(rowsZ[1].height / zoomed + 50 / zoomed);
  await drag(page, ROWHANDLE(2), 0, 50);
  const modelZ = await modelOf(page);
  check(`${label} - page à ${Math.round(zoomed * 100)} % : tirer le numéro 2 de 50 px écran pose ${expectedZ} px de mise en page (${Math.round(50 / zoomed)} px de plus), pas 50`, zoomed > 1.1 && modelZ.rows[1] === expectedZ, { modelZ, expectedZ, zoom: zoomed });
  await undoKey(page);
  await realClick(page, '#pp-page-zoom-fit');
  await page.waitForTimeout(400);

  // ---------- 10) La bulle se lit : contraste de la charte, et elle reste dans le panneau ----------
  await setA4(page, true);
  await load(page, DOC);
  await clickCell(page, 'B2');
  await drag(page, ROWHANDLE(3), 0, 25, { keepDown: true });
  const tipInfo = await page.evaluate(() => {
    const t = document.querySelector('.v2-grid-tip');
    if (!t) return null;
    const cs = getComputedStyle(t); const r = t.getBoundingClientRect();
    return { ratio: window.__ratio(cs.color, cs.backgroundColor), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, text: t.textContent };
  });
  await page.mouse.up();
  await page.waitForTimeout(500);
  check(`${label} - la bulle du glissé (${tipInfo && tipInfo.text}) a un contraste de ${tipInfo ? tipInfo.ratio.toFixed(1) : '?'}:1 (au moins 4,5) et reste dans le panneau`, !!tipInfo && tipInfo.ratio >= 4.5 && tipInfo.inside, tipInfo);
  await undoKey(page);

  await context.close();
}

await runTheme('light', { width: WIDTH, height: HEIGHT });
await runTheme('dark', { width: WIDTH, height: HEIGHT });
await runTheme('light', { width: NARROW, height: HEIGHT }, 'étroit');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
