#!/usr/bin/env node
// Largeur d'une colonne d'un tableau de DOCUMENT réglée par la poignée de sa lettre (js/grid-editor.js : startResize, planColumnWidths ; lot 4 (c) sur 6 de « le tableau d'un document est un
// tableau du mode grille », les lots 4 (a) et 4 (b) sont les bandeaux et la hauteur depuis les numéros), à la VRAIE souris (page.mouse, page.keyboard ; Node/Playwright), à la taille du panneau
// Grist (~700x400), en thème clair puis sombre, puis dans un panneau étroit (420 px), en Aperçu A4 (feuille réduite à ~0,85) et sans. Un appui simulé ne donne ni capture du pointeur, ni survol,
// ni curseur « col-resize » : c'est ici qu'on s'assure que
//   - chaque lettre porte sa poignée (un vrai pointeur la touche, y compris celle de la dernière colonne, au bord du tableau ; le curseur y devient « col-resize ») ;
//   - tirer une lettre règle la largeur de SA colonne en direct (les autres colonnes gardent la leur, celles de droite se décalent, le texte d'avant et d'après ne bouge pas), les lettres suivent
//     leurs colonnes, la bulle dit la largeur en centimètres ; rien n'est écrit dans le document avant le relâcher, puis UNE transaction pose la largeur en pixels de mise en page sur toutes les cases
//     de la colonne (pas ceux de l'écran, que la feuille réduite ou agrandie déforme) : le HTML garde « colwidth » et le style de la colonne, un seul Ctrl+Z la rend, Rétablir la repose, sans saut
//     au relâcher ; la poignée ne choisit pas la colonne (le curseur reste dans sa case) ;
//   - en Aperçu A4 la page limite le tableau : une colonne qu'on agrandit au-delà de la place libre prend la place aux colonnes qui la suivent, au prorata de ce qu'elles peuvent céder (jamais sous
//     25 px), la colonne tirée s'arrête où la page finit, la dernière colonne prend ce qui reste de la page, un tableau qui remplit la page n'écrit rien ; sans Aperçu A4 rien ne limite ;
//   - des colonnes automatiques (aucune largeur posée) sont figées par le glissé à leur largeur du moment, sans saut ; Échap annule sans rien laisser ; des colonnes choisies par leurs lettres
//     prennent toutes la largeur de la poignée tirée ; seul le tableau des bandeaux est réglé (deux tableaux, un tableau dans une case) ;
//   - le suivi des modifications propose la largeur (marque « modification » sur la colonne tirée, aucune sur les colonnes figées) et « Tout refuser » la rend ; la page agrandie pose des pixels de
//     mise en page ; la bulle se lit (contraste de la charte, F5) ; dans une grille la poignée d'une lettre règle toujours sa colonne, sans limite de page.
// Les fonctions elles-mêmes sont dans dev-tests/scenarios-grid-in-document.js (groupe gridInDocument) ; la hauteur d'une ligne est mesurée par verify-doc-strips-resize-mouse.mjs (groupe
// docStripsResizeMouse), la place des bandeaux à l'écran par verify-doc-strips-mouse.mjs (groupe docStripsMouse).
// Lancé par run-headless.mjs (groupe Node « docStripsWidthMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-doc-strips-width-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.DOC_STRIPS_WIDTH_MOUSE_PORT || 8995);
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
if (!OFFLINE) console.log('[verify-doc-strips-width-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const sum = list => list.reduce((a, b) => a + b, 0);

// Contraste WCAG de deux couleurs CSS « rgb(...) ».
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

const STRIPS = '.pp-doc-strips';
const COLHEAD = n => `${STRIPS} .v2-grid-colhead:nth-child(${n})`;
const COLHANDLE = n => `${COLHEAD(n)} .v2-grid-handle`;

// Un document : un paragraphe, un tableau 3 lignes x 3 colonnes aux largeurs réglées (140, 190 et 120 px), un paragraphe.
const cellsHtml = (row, widths) => '<tr>' + widths.map((w, c) => `<td${w ? ` colwidth="${w}"` : ''}><p>${'ABC'[c]}${row}</p></td>`).join('') + '</tr>';
const DOC = '<p>Avant le tableau</p><table><tbody>' + [1, 2, 3].map(r => cellsHtml(r, [140, 190, 120])).join('') + '</tbody></table><p>Après le tableau</p>';
// Les mêmes trois colonnes, sans largeur posée (celles d'un tableau qu'on vient d'insérer).
const AUTO = '<p>Avant le tableau</p><table><tbody>' + [1, 2, 3].map(r => cellsHtml(r, [0, 0, 0])).join('') + '</tbody></table><p>Après le tableau</p>';
// Deux tableaux : A (2 lignes, 2 colonnes) puis B (4 lignes, 3 colonnes), un paragraphe entre les deux.
const TWO = '<p>Avant</p><table><tbody>' + [1, 2].map(r => cellsHtml(r, [150, 150]).replace(/<p>([A-C])(\d)<\/p>/g, '<p>T$1$2</p>')).join('') + '</tbody></table>'
  + '<p>Entre les tableaux</p><table><tbody>' + [1, 2, 3, 4].map(r => cellsHtml(r, [110, 110, 110]).replace(/<p>([A-C])(\d)<\/p>/g, '<p>U$1$2</p>')).join('') + '</tbody></table><p>Après</p>';
// Un tableau extérieur dont une case porte un tableau intérieur d'une ligne.
const INNER = '<p>Avant</p><table><tbody><tr><td colwidth="300"><p>Dehors</p><table><tbody><tr><td colwidth="60"><p>N1</p></td><td colwidth="140"><p>N2</p></td></tr></tbody></table></td><td colwidth="200"><p>Voisine</p></td></tr>'
  + '<tr><td colwidth="300"><p>Bas</p></td><td colwidth="200"><p>Bas droite</p></td></tr></tbody></table><p>Après</p>';
// Une grille de trois colonnes (100, 150 et 80 px) et deux lignes.
const GRID = '<table style="width: 330px;"><colgroup>' + [100, 150, 80].map(w => `<col style="width: ${w}px;">`).join('') + '</colgroup><tbody>'
  + [32, 60].map((h, r) => `<tr data-row-height="${h}" style="height: ${h}px">` + [100, 150, 80].map((w, c) => `<td colwidth="${w}"><p>${'ABC'[c]}${r + 1}</p></td>`).join('') + '</tr>').join('') + '</tbody></table>';

// Tout ce que la page montre des bandeaux et du tableau `n` (depuis 0) : étiquettes, poignées, rectangles à l'écran (pixels écran).
const stripsState = (page, n = 0) => page.evaluate((index) => {
  const rect = node => { if (!node) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const root = document.querySelector('.pp-doc-strips');
  const tables = Array.from(document.querySelectorAll('.tiptap table')).filter(t => !t.parentElement.closest('table'));
  const table = tables[index] || null;
  const cols = table ? Array.from(table.querySelectorAll(':scope > colgroup > col')) : [];
  const heads = (root ? Array.from(root.querySelectorAll('.v2-grid-colhead')) : []).map(h => Object.assign({ label: h.textContent, handles: h.querySelectorAll('.v2-grid-handle').length }, rect(h)));
  return { shown: !!root && !root.hidden && getComputedStyle(root).display !== 'none', table: rect(table), cols: cols.map(rect), heads };
}, n);
// Les lettres sont sur les colonnes (bords mesurés, pixels écran).
const headsOnColumns = (s, tolerance = 1.5) => s.shown && s.heads.length === s.cols.length && s.heads.every((h, i) => near(h.left, s.cols[i].left, tolerance) && near(h.right, s.cols[i].right, tolerance));
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
async function load(page, html, { grid = false } = {}) {
  await page.evaluate(({ html, grid }) => { GridEditor.setActive(false); Editor.setHTML(html); if (grid) GridEditor.setActive(true); const box = document.getElementById('editor-container'); box.scrollTop = 0; box.scrollLeft = 0; }, { html, grid });
  await page.waitForTimeout(500);
  await parkMouse(page);
}
const setA4 = (page, on) => page.evaluate((value) => { const t = document.getElementById('v2-toggle-a4-preview'); if (t && t.checked !== value) { t.checked = value; t.dispatchEvent(new Event('change', { bubbles: true })); } }, on).then(() => page.waitForTimeout(500));

// Le tableau de rang `index` tel que le document le dit (pas tel que l'écran le montre) : la largeur posée de chaque case ligne par ligne, les marques de suivi de chaque case.
const modelOf = (page, index = 0) => page.evaluate((n) => {
  const tables = [];
  EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'table') tables.push(node); return true; });
  const widths = []; const marks = [];
  tables[n].forEach((row) => {
    const line = []; const mark = [];
    row.forEach((cell) => { line.push(cell.attrs.colwidth ? cell.attrs.colwidth[0] : null); mark.push(cell.marks.map(m => m.type.name + ':' + m.attrs.attrName).join()); });
    widths.push(line); marks.push(mark);
  });
  return { widths, first: widths[0], marks };
}, index);
const sameModel = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const allRows = (model, wanted) => model.widths.every(line => JSON.stringify(line) === JSON.stringify(wanted));
const cmOf = (page, px) => page.evaluate(value => PageLayout.cmText(value * 25.4 / 96) + ' cm', px);
const tipText = page => page.evaluate(() => { const t = document.querySelector('.v2-grid-tip'); return t ? t.textContent : null; });
const leftovers = page => page.evaluate(() => ({
  marked: document.querySelectorAll('[data-pp-sizing]').length, preview: !!document.getElementById('pp-grid-resize-preview'), tip: !!document.querySelector('.v2-grid-tip'),
  cursorClass: document.body.classList.contains('pp-grid-resizing-row') || document.body.classList.contains('pp-grid-resizing-col'),
}));
const noLeftovers = l => l.marked === 0 && !l.preview && !l.tip && !l.cursorClass;
const sheetZoom = page => page.evaluate(() => EditorCore.layoutZoom(EditorCore.getEditor().view.dom));
const pageWidth = page => page.evaluate(() => Math.floor(EditorCore.editorContentWidthPx(EditorCore.getEditor())));
// Le corps de la page en pixels écran : les marges de la feuille retirées.
const pageBody = page => page.evaluate(() => {
  const el = EditorCore.getEditor().view.dom; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); const z = EditorCore.layoutZoom(el);
  return { left: r.left + (parseFloat(cs.paddingLeft) || 0) * z, right: r.right - (parseFloat(cs.paddingRight) || 0) * z };
});
const selectionText = page => page.evaluate(() => { const sel = EditorCore.getEditor().state.selection; return (sel.$anchorCell ? 'cases:' + sel.ranges.length : '') + sel.$from.parent.textContent; });

// Ramène la poignée `selector` dans le plan de travail, comme le ferait la main sur la molette : dans un panneau de 420 px le plan ne fait que 150 px de haut, le bandeau des lettres (posé
// juste au-dessus du tableau) passe sous la barre d'outils quand le haut du tableau touche le haut du plan, et un tableau de 450 px dépasse le panneau à droite.
async function reach(page, selector) {
  await page.evaluate((sel) => {
    const box = document.getElementById('editor-container');
    const handle = document.querySelector(sel);
    if (!box || !handle) return;
    const area = box.getBoundingClientRect();
    const r = handle.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cy < area.top + 6) box.scrollTop -= area.top + 6 - cy;
    if (cy > area.bottom - 6) box.scrollTop += cy - (area.bottom - 6);
    if (cx > area.right - 6) box.scrollLeft += cx - (area.right - 6);
    if (cx < area.left + 6) box.scrollLeft -= area.left + 6 - cx;
  }, selector);
  await page.waitForTimeout(250);
}

// Un vrai glissé : la souris rejoint la poignée (survol compris), appuie, se déplace de (dx, dy) en plusieurs pas, laisse `during` regarder la page en plein glissé, puis relâche
// (sauf `keepDown`). Rend la boîte de la poignée de départ et ce que `during` a lu.
async function drag(page, selector, dx, dy, { during, keepDown = false, steps = 8 } = {}) {
  await reach(page, selector);
  const b = await boxOf(page, selector);
  if (!b) throw new Error('poignée introuvable : ' + selector);
  await page.mouse.move(b.x - 6, b.y - 5, { steps: 2 });
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
// Jusqu'où la souris peut aller vers la droite sans quitter le panneau, en pixels écran, à partir de la poignée `selector`.
const roomToTheRight = async (page, selector) => { await reach(page, selector); const b = await boxOf(page, selector); const size = page.viewportSize(); return Math.floor(size.width - 8 - b.x); };
// Plus de 500 ms entre deux gestes : prosemirror-history groupe sinon les transactions rapprochées en UN seul évènement.
const undoKey = async (page) => { await page.waitForTimeout(650); await page.keyboard.press('Control+z'); await page.waitForTimeout(450); };
const redoKey = async (page) => { await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(450); };

async function runTheme(theme, size, tag) {
  const label = tag || (theme === 'dark' ? 'sombre' : 'clair');
  console.log(`\n=== Largeur d'une colonne d'un tableau de document depuis ses lettres, à la souris, ${size.width}x${size.height}, ${tag ? 'panneau étroit' : 'thème ' + label} ===`);
  const { context, page } = await openWidget(theme, size);
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);
  const narrow = size.width < 500;

  for (const a4 of [true, false]) {
    const mode = a4 ? 'Aperçu A4' : 'page sans A4';
    const tag2 = `${label}, ${mode}`;
    await setA4(page, a4);

    // ---------- 1) Les poignées : une par lettre, qui répondent au pointeur ----------
    await load(page, DOC);
    await clickCell(page, 'B2');
    let s = await stripsState(page);
    const zoom = await sheetZoom(page);
    const hits = [];
    // Un tableau de 450 px dépasse un panneau de 420 px sans page : le plan ne défile pas et la poignée de sa dernière colonne est hors du panneau (null : pas mesurée).
    for (let n = 1; n <= 3; n++) {
      await reach(page, COLHANDLE(n));
      const b = await boxOf(page, COLHANDLE(n));
      hits.push(b.x > 0 && b.x < size.width - 1 ? await hitsIt(page, COLHANDLE(n)) : null);
    }
    check(`${tag2} (feuille à l'échelle ${zoom.toFixed(2)}) - trois poignées de colonne (une par lettre), un vrai pointeur au centre de chacune tombe sur elle, y compris celle de la dernière colonne (au bord du tableau) tant que le panneau la laisse voir`,
      s.shown && hits.every(h => h !== false) && hits.filter(h => h === true).length >= (narrow ? 2 : 3) && s.heads.length === 3 && s.heads.every(h => h.handles === 1), { hits, heads: s.heads.map(h => h.handles) });
    await reach(page, COLHANDLE(2));
    const hb = await boxOf(page, COLHANDLE(2));
    await page.mouse.move(hb.x - 4, hb.y + 3, { steps: 2 });
    await page.mouse.move(hb.x, hb.y, { steps: 3 });
    await page.waitForTimeout(150);
    const hover = await page.evaluate(sel => ({ cursor: getComputedStyle(document.querySelector(sel)).cursor, line: getComputedStyle(document.querySelector(sel), '::after').opacity }), COLHANDLE(2));
    const rest = await page.evaluate(sel => getComputedStyle(document.querySelector(sel), '::after').opacity, COLHANDLE(3));
    check(`${tag2} - le curseur devient « col-resize » sur une poignée de colonne ; son trait d'accent n'apparaît que sous le pointeur`, hover.cursor === 'col-resize' && Number(hover.line) > 0.5 && Number(rest) === 0, { hover, rest });
    await parkMouse(page);

    // ---------- 2) Largeur d'une colonne ----------
    await load(page, DOC);
    await clickCell(page, 'B2');
    const model0 = await modelOf(page);
    const cols0 = await stripsState(page);
    const flow0 = await flow(page);
    const DX = narrow ? 40 : 60;
    const expectedCol = Math.round(190 + DX / zoom);
    const expectedCm = await cmOf(page, expectedCol);
    const colDrag = await drag(page, COLHANDLE(2), DX, 0, {
      during: async () => ({
        tip: await tipText(page), s: await stripsState(page), model: await modelOf(page), flow: await flow(page),
        marked: await page.evaluate(() => !!document.querySelector('.tiptap table[data-pp-sizing]')), preview: await page.evaluate(() => (document.getElementById('pp-grid-resize-preview') || {}).textContent || ''),
        cursorClass: await page.evaluate(() => document.body.classList.contains('pp-grid-resizing-col')),
      }),
    });
    const mid = colDrag.mid;
    check(`${tag2} - tirer la lettre B vers la droite de ${DX} px : la bulle dit la largeur en centimètres (${expectedCm}), le curseur reste « col-resize » partout`, mid.tip === expectedCm && mid.cursorClass, { tip: mid.tip, attendu: expectedCm });
    check(`${tag2} - en plein glissé la colonne B a déjà la nouvelle largeur à l'écran (${Math.round(expectedCol * zoom * 10) / 10} px), les colonnes A et C n'ont pas changé, C s'est décalée d'autant`,
      near(mid.s.cols[1].width, expectedCol * zoom, 0.8) && near(mid.s.cols[0].width, cols0.cols[0].width, 0.3) && near(mid.s.cols[2].width, cols0.cols[2].width, 0.3) && near(mid.s.cols[2].left - cols0.cols[2].left, mid.s.cols[1].width - cols0.cols[1].width, 0.8),
      { avant: cols0.cols.map(c => c.width), pendant: mid.s.cols.map(c => c.width), expectedCol });
    check(`${tag2} - la lettre B suit la colonne en plein glissé, comme la lettre C (même largeur, même place) ; le texte d'avant et celui d'après n'ont pas bougé`,
      headsOnColumns(mid.s, 1.2) && near(mid.flow[0][1], flow0[0][1], 0.5) && near(mid.flow[2][1], flow0[2][1], 0.5), { lettres: mid.s.heads.map(h => [h.left, h.right]), colonnes: mid.s.cols.map(c => [c.left, c.right]), flow0, pendant: mid.flow });
    check(`${tag2} - le tableau réglé porte sa marque, l'aperçu ne vise que lui et sa colonne 2`, mid.marked && /table\[data-pp-sizing\] > colgroup > col:nth-child\(2\)/.test(mid.preview), { marked: mid.marked, preview: mid.preview });
    check(`${tag2} - rien n'est écrit dans le document avant le relâcher (aucune largeur posée)`, sameModel(mid.model, model0), { avant: model0, pendant: mid.model });
    const model1 = await modelOf(page);
    const html1 = await page.evaluate(() => Editor.getHTML());
    s = await stripsState(page);
    check(`${tag2} - au relâcher la colonne B porte ${expectedCol} px sur toutes ses cases (A et C gardent 140 et 120), le HTML garde « colwidth » et le style de la colonne`,
      allRows(model1, [140, expectedCol, 120]) && (html1.match(new RegExp(` colwidth="${expectedCol}"`, 'g')) || []).length === 3 && html1.includes(`<col style="width: ${expectedCol}px;">`), { model1: model1.widths, html: html1.slice(0, 400) });
    check(`${tag2} - la colonne B a la même largeur après le relâcher qu'en plein glissé (${Math.round(s.cols[1].width * 10) / 10} px à l'écran : pas de saut), et les lettres sont toujours sur leurs colonnes`,
      near(s.cols[1].width, mid.s.cols[1].width, 0.8) && near(s.table.right, mid.s.table.right, 1.2) && headsOnColumns(s), { apres: s.cols.map(c => c.width), pendant: mid.s.cols.map(c => c.width) });
    check(`${tag2} - rien ne traîne après le glissé (marque du tableau, feuille d'aperçu, bulle, curseur de glissé)`, noLeftovers(await leftovers(page)), await leftovers(page));
    const kept = await page.evaluate(() => ({ editor: document.activeElement === EditorCore.getEditor().view.dom, bar: !!document.querySelector('.v2-floating-toolbar.v2-table-toolbar.visible') }));
    check(`${tag2} - l'éditeur garde le focus, la barre du tableau reste affichée et le curseur reste dans la case B2 (la poignée ne choisit pas la colonne)`, kept.editor && kept.bar && (await selectionText(page)) === 'B2', { kept, selection: await selectionText(page) });
    await undoKey(page);
    check(`${tag2} - un seul Ctrl+Z rend la colonne à sa largeur (document et écran)`, sameModel((await modelOf(page)).widths, model0.widths) && near((await stripsState(page)).cols[1].width, cols0.cols[1].width, 0.8), { modele: await modelOf(page), ecran: (await stripsState(page)).cols[1].width });
    await redoKey(page);
    check(`${tag2} - Rétablir la repose`, allRows(await modelOf(page), [140, expectedCol, 120]), await modelOf(page));
    await undoKey(page);

    // ---------- 3) La page limite le tableau (Aperçu A4) ; sans elle rien ne limite ----------
    await load(page, DOC);
    await clickCell(page, 'B2');
    const P = await pageWidth(page);
    const body = await pageBody(page);
    const room = await roomToTheRight(page, COLHANDLE(1));
    if (a4) {
      // 80 px de plus que la place libre de la page : B et C cèdent 80 px, au prorata de ce qu'elles peuvent céder (165 et 95). Un pixel d'écran vaut 1/zoom pixels de page (2 à 0,5) :
      // la largeur obtenue est la demandée à `step` près, et tout le reste se compte à partir d'elle.
      const want = 140 + (P - 450) + 80;
      const step = Math.ceil(1 / zoom);
      const dxScreen = Math.round((want - 140) * zoom);
      const over = await drag(page, COLHANDLE(1), Math.min(dxScreen, room), 0, { during: async () => ({ tip: await tipText(page), s: await stripsState(page) }) });
      const afterOver = await stripsState(page);
      const modelOver = await modelOf(page);
      const w = modelOver.first;
      const got = w[0];
      const gave = got - 140 - (P - 450);
      const gaveB = 190 - w[1], gaveC = 120 - w[2];
      check(`${tag2} - tirer la lettre A au-delà de la place libre de la page (${P} px de corps de page) : A prend ${got} px (${want} visés), B et C cèdent les ${gave} px que la page n'a plus au prorata de ce qu'elles peuvent céder (${gaveB} et ${gaveC} px), la somme est celle de la page`,
        dxScreen <= room && Math.abs(got - want) <= step && gave > 0 && gaveB + gaveC === gave && w[1] >= 25 && w[2] >= 25 && Math.abs(gaveB * 95 - gaveC * 165) <= 260 && sum(w) === P && allRows(modelOver, w), { w, want, got, gave, P, dxScreen, room });
      check(`${tag2} - le tableau ne sort pas de la page, ni en plein glissé ni après (bord droit du tableau ${Math.round(afterOver.table.right)} px pour un corps de page qui finit à ${Math.round(body.right)} px) ; la bulle dit ${await cmOf(page, got)}`,
        over.mid.s.table.right <= body.right + 2 * zoom && afterOver.table.right <= body.right + 2 * zoom && over.mid.tip === (await cmOf(page, got)), { pendant: over.mid.s.table.right, apres: afterOver.table.right, body: body.right, tip: over.mid.tip });
      check(`${tag2} - le rendu en plein glissé est celui du relâcher (colonnes ${over.mid.s.cols.map(c => Math.round(c.width / zoom)).join(', ')} px de page) et les lettres le suivent`,
        over.mid.s.cols.every((c, i) => near(c.width, afterOver.cols[i].width, 0.8)) && headsOnColumns(afterOver) && headsOnColumns(over.mid.s, 1.2), { pendant: over.mid.s.cols.map(c => c.width), apres: afterOver.cols.map(c => c.width) });
      await undoKey(page);
      check(`${tag2} - un seul Ctrl+Z rend les trois largeurs (140, 190 et 120 px)`, allRows(await modelOf(page), [140, 190, 120]), await modelOf(page));
      // Beaucoup plus loin : la colonne A s'arrête où la page finit, B et C au plancher de 25 px.
      const farDx = Math.min(room, Math.round(900 * zoom));
      const far = await drag(page, COLHANDLE(1), farDx, 0, { during: async () => ({ tip: await tipText(page), s: await stripsState(page) }) });
      const wFar = (await modelOf(page)).first;
      const cap = P - 50;
      const demanded = 140 + Math.round(farDx / zoom);
      check(`${tag2} - tirée très loin (${demanded} px demandés), la colonne A s'arrête où la page finit (${cap} px), B et C au plancher de 25 px, la bulle dit ${await cmOf(page, cap)} et le tableau reste dans la page`,
        demanded > cap && JSON.stringify(wFar) === JSON.stringify([cap, 25, 25]) && far.mid.tip === (await cmOf(page, cap)) && far.mid.s.table.right <= body.right + 2 * zoom && (await stripsState(page)).table.right <= body.right + 2 * zoom, { wFar, demanded, cap, tip: far.mid.tip });
      await undoKey(page);
      // La dernière colonne prend ce qui reste de la page, pas plus.
      const lastRoom = await roomToTheRight(page, COLHANDLE(3));
      const lastDx = Math.min(lastRoom, Math.round(600 * zoom));
      await drag(page, COLHANDLE(3), lastDx, 0);
      const wLast = (await modelOf(page)).first;
      check(`${tag2} - tirée vers la droite, la dernière colonne prend ce qui reste de la page (${P - 330} px) et pas davantage`, JSON.stringify(wLast) === JSON.stringify([140, 190, Math.min(P - 330, 120 + Math.round(lastDx / zoom))]) && (await stripsState(page)).table.right <= body.right + 2 * zoom, { wLast, P, lastDx });
      // Un tableau qui remplit la page : sa dernière colonne ne grandit plus, rien n'est écrit.
      if (wLast[2] === P - 330) {
        const full = await modelOf(page);
        await drag(page, COLHANDLE(3), Math.min(lastRoom, 60), 0);
        check(`${tag2} - le tableau remplit la page : tirer sa dernière colonne vers la droite n'écrit rien`, sameModel(await modelOf(page), full), await modelOf(page));
      }
      await undoKey(page);
    } else {
      // Sans Aperçu A4 il n'y a pas de page : rien ne limite la largeur (au plus 1200 px par colonne) ; les autres colonnes ne bougent pas.
      const farDx = Math.min(room, 900);
      await drag(page, COLHANDLE(1), farDx, 0);
      const wNo = (await modelOf(page)).first;
      check(`${tag2} - sans page, tirer la lettre A de ${farDx} px la porte à ${140 + farDx} px, B et C gardent leurs largeurs (rien ne limite le tableau sans page : il déborde)`, JSON.stringify(wNo) === JSON.stringify([140 + farDx, 190, 120]), { wNo, farDx });
      await undoKey(page);
    }
    check(`${tag2} - plus rien ne traîne et le document est celui d'avant`, noLeftovers(await leftovers(page)) && allRows(await modelOf(page), [140, 190, 120]), { left: await leftovers(page), model: await modelOf(page) });

    // ---------- 4) Colonnes automatiques : le glissé les fige à leur largeur du moment ----------
    await load(page, AUTO);
    await clickCell(page, 'B2');
    const autoBefore = await stripsState(page);
    const autoModel0 = await modelOf(page);
    const baseAuto = autoBefore.cols.map(c => Math.floor(c.width / zoom + 0.001));
    const AUTO_DX = narrow ? 30 : 40;
    const growth = Math.round(AUTO_DX / zoom);
    const autoDrag = await drag(page, COLHANDLE(1), AUTO_DX, 0, { during: async () => ({ s: await stripsState(page), model: await modelOf(page) }) });
    const autoAfter = await stripsState(page);
    const autoModel = await modelOf(page);
    const excess = a4 ? Math.max(0, sum(baseAuto) + growth - Math.max(P, sum(baseAuto))) : 0;
    const wA = autoModel.first;
    check(`${tag2} - colonnes automatiques (aucune largeur posée) : tirer la lettre A de ${AUTO_DX} px lui donne ${baseAuto[0] + growth} px et fige B et C à leur largeur du moment${a4 ? ` (moins les ${excess} px que la page leur prend)` : ''}, sur toutes les lignes`,
      sameModel(autoDrag.mid.model, autoModel0) && wA.every(w => Number.isInteger(w)) && wA[0] === baseAuto[0] + growth && (a4 ? sum(wA) <= P && wA[1] + wA[2] === baseAuto[1] + baseAuto[2] - excess : wA[1] === baseAuto[1] && wA[2] === baseAuto[2]) && autoModel.widths.every(line => line.join() === wA.join()),
      { avant: baseAuto, apres: wA, excess, P });
    check(`${tag2} - le rendu en plein glissé est celui du relâcher (pas de saut), les lettres sont sur leurs colonnes`, autoDrag.mid.s.cols.every((c, i) => near(c.width, autoAfter.cols[i].width, 0.8)) && headsOnColumns(autoAfter), { pendant: autoDrag.mid.s.cols.map(c => c.width), apres: autoAfter.cols.map(c => c.width) });
    await undoKey(page);
    const autoUndone = await stripsState(page);
    check(`${tag2} - un Ctrl+Z rend les colonnes à leur largeur d'avant (au pixel près : ${baseAuto.join(', ')} px)`, autoUndone.cols.every((c, i) => near(c.width, autoBefore.cols[i].width, 1.5)) && (await modelOf(page)).widths.every(line => line.join() === baseAuto.join()), { avant: autoBefore.cols.map(c => c.width), apres: autoUndone.cols.map(c => c.width), model: await modelOf(page) });

    // ---------- 5) Échap annule ----------
    await load(page, DOC);
    await clickCell(page, 'B2');
    const modelEsc = await modelOf(page);
    const colsEsc = await stripsState(page);
    await drag(page, COLHANDLE(2), DX, 0, { keepDown: true });
    const midEsc = await stripsState(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const afterEsc = await stripsState(page);
    check(`${tag2} - Échap en plein glissé annule : la largeur d'avant revient (${Math.round(midEsc.cols[1].width)} px pendant, ${Math.round(afterEsc.cols[1].width)} px après), les lettres aussi, le document n'a pas changé, rien ne traîne`,
      midEsc.cols[1].width > colsEsc.cols[1].width + 20 * zoom && near(afterEsc.cols[1].width, colsEsc.cols[1].width, 0.5) && headsOnColumns(afterEsc) && sameModel(await modelOf(page), modelEsc) && noLeftovers(await leftovers(page)), { colsEsc: colsEsc.cols.map(c => c.width), midEsc: midEsc.cols.map(c => c.width), afterEsc: afterEsc.cols.map(c => c.width), left: await leftovers(page) });
    await clickCell(page, 'B2');

    // ---------- 6) Plusieurs colonnes choisies par leurs lettres : la même largeur pour toutes ----------
    await realClick(page, COLHEAD(1));
    await page.keyboard.down('Shift');
    await realClick(page, COLHEAD(2));
    await page.keyboard.up('Shift');
    await page.waitForTimeout(300);
    const multiExpected = Math.round(190 + DX / zoom / 2);
    await drag(page, COLHANDLE(2), Math.round(DX / 2), 0);
    const modelMulti = await modelOf(page);
    check(`${tag2} - colonnes A et B choisies, tirer le bord de B de ${Math.round(DX / 2)} px les règle toutes les deux à la même largeur (${multiExpected} px), C ne bouge pas, sur toutes les lignes`, allRows(modelMulti, [multiExpected, multiExpected, 120]), { modelMulti: modelMulti.widths, multiExpected });
    await undoKey(page);
    check(`${tag2} - un seul Ctrl+Z rend les deux colonnes`, allRows(await modelOf(page), [140, 190, 120]), await modelOf(page));

    // ---------- 7) Deux tableaux : seul celui des bandeaux est réglé ----------
    await load(page, TWO);
    await clickCell(page, 'UB3');
    const twoA0 = await stripsState(page, 0);
    const twoModelA0 = await modelOf(page, 0);
    const twoDrag = await drag(page, COLHANDLE(2), narrow ? 30 : 40, 0, { during: async () => ({ a: await stripsState(page, 0), b: await stripsState(page, 1), marked: await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table')).map(t => t.hasAttribute('data-pp-sizing'))) }) });
    const modelA = await modelOf(page, 0); const modelB = await modelOf(page, 1);
    check(`${tag2} - deux tableaux : tirer la lettre B du tableau B règle sa colonne 2 (${modelB.first.join(', ')} px) et ne touche pas la colonne 2 du tableau A (même rang), ni pendant ni après`,
      twoDrag.mid.marked.join() === 'false,true' && twoDrag.mid.a.cols.every((c, i) => near(c.width, twoA0.cols[i].width, 0.3)) && sameModel(modelA, twoModelA0) && modelB.first[0] === 110 && modelB.first[1] > 110 && modelB.first[2] === 110, { marked: twoDrag.mid.marked, modelA: modelA.first, modelB: modelB.first });
    await undoKey(page);

    // ---------- 8) Tableau dans une case : seule la colonne du tableau extérieur est réglée ----------
    await load(page, INNER);
    await clickCell(page, 'Voisine');
    await drag(page, COLHANDLE(1), narrow ? 30 : 40, 0);
    const innerOuter = await modelOf(page, 0); const innerInner = await modelOf(page, 1);
    check(`${tag2} - tableau dans une case : tirer la lettre A du tableau extérieur règle sa colonne (${innerOuter.first.join(', ')} px) et laisse les largeurs du tableau intérieur (60 et 140 px)`, innerOuter.first[0] > 300 && innerOuter.first[1] === 200 && sameModel(innerInner.first, [60, 140]), { innerOuter: innerOuter.widths, innerInner: innerInner.widths });
    await undoKey(page);
  }

  // ---------- 9) Le suivi des modifications : la largeur est une suggestion, refusable ----------
  await setA4(page, true);
  await load(page, DOC);
  await clickCell(page, 'B2');
  await page.evaluate(() => Editor.setTrackChanges(true));
  await page.waitForTimeout(300);
  await clickCell(page, 'B2');
  await drag(page, COLHANDLE(2), narrow ? 30 : 50, 0);
  const tracked = await modelOf(page);
  check(`${label} - suivi allumé : tirer la lettre B pose la largeur en suggestion (marque « modification » de la largeur sur les trois cases de la colonne B, aucune autre colonne touchée)`,
    tracked.first[1] > 190 && tracked.marks.every(line => line[1] === 'modification:colwidth' && line[0] === '' && line[2] === ''), tracked);
  await page.evaluate(() => EditorCore.getEditor().chain().focus().rejectAllSuggestionsChunked().run());
  await page.waitForTimeout(800);
  check(`${label} - « Tout refuser » rend la largeur d'origine (140, 190 et 120 px)`, allRows(await modelOf(page), [140, 190, 120]), await modelOf(page));
  // Colonnes automatiques : la colonne tirée est proposée ; celles que le glissé ne fait que figer à leur largeur du moment ne portent aucune marque ; en Aperçu A4 les colonnes qui cèdent
  // de la place à la page, elles, ont vraiment changé : elles sont proposées aussi. Refuser rend à tout le tableau sa largeur d'avant.
  for (const a4 of [false, true]) {
    const tag3 = `${label}, ${a4 ? 'Aperçu A4' : 'page sans A4'}`;
    await setA4(page, a4);
    await load(page, AUTO);
    await clickCell(page, 'B2');
    const autoZoom = await sheetZoom(page);
    const autoBase = (await stripsState(page)).cols.map(c => Math.floor(c.width / autoZoom + 0.001));
    await page.evaluate(() => Editor.setTrackChanges(true));
    await page.waitForTimeout(300);
    await clickCell(page, 'B2');
    await drag(page, COLHANDLE(1), narrow ? 20 : 30, 0);
    const trackedAuto = await modelOf(page);
    const changed = trackedAuto.first.map((w, i) => w !== autoBase[i]);
    const marked = trackedAuto.marks.map(line => line.map(m => m === 'modification:colwidth'));
    check(`${tag3} - suivi allumé, colonnes automatiques : la largeur de la colonne A est proposée${a4 ? ', celles de B et de C aussi puisque la page les a rétrécies' : ', celles de B et de C que le glissé fige à leur largeur du moment ne portent aucune marque'}`,
      changed[0] && (a4 ? changed[1] && changed[2] : !changed[1] && !changed[2]) && marked.every(line => line.every((m, i) => m === changed[i])) && trackedAuto.first.every(w => Number.isInteger(w)) && trackedAuto.widths.every(line => line.join() === trackedAuto.first.join()), { trackedAuto, autoBase });
    await page.evaluate(() => EditorCore.getEditor().chain().focus().rejectAllSuggestionsChunked().run());
    await page.waitForTimeout(800);
    const refusedAuto = await modelOf(page);
    check(`${tag3} - « Tout refuser » (colonnes automatiques) rend les largeurs d'avant (${autoBase.join(', ')} px)`, refusedAuto.widths.every(line => line.join() === autoBase.join()), { refusedAuto: refusedAuto.widths, autoBase });
    await page.evaluate(() => Editor.setTrackChanges(false));
    await page.waitForTimeout(300);
  }

  // ---------- 10) Page agrandie : la largeur posée est celle de la mise en page, pas celle de l'écran ----------
  await load(page, DOC);
  // Le haut du tableau à un tiers du plan de travail (120 px au plus) : dans 420 px la barre d'outils passe sur deux lignes, il ne reste que 150 px de plan de travail.
  const topOfTable = () => page.evaluate(() => { const box = document.getElementById('editor-container'); const t = document.querySelector('.tiptap table'); box.scrollTop += t.getBoundingClientRect().top - box.getBoundingClientRect().top - Math.min(120, box.clientHeight / 3); });
  await topOfTable();
  for (let i = 0; i < 14 && (await sheetZoom(page)) <= 1.1; i++) await realClick(page, '#pp-page-zoom-in');
  await page.waitForTimeout(500);
  await topOfTable();
  await clickCell(page, 'B2');
  const zoomed = await sheetZoom(page);
  const roomZ = await roomToTheRight(page, COLHANDLE(2));
  const dxZ = Math.min(roomZ, 50);
  const expectedZ = Math.round(190 + dxZ / zoomed);
  await drag(page, COLHANDLE(2), dxZ, 0);
  const modelZ = await modelOf(page);
  check(`${label} - page à ${Math.round(zoomed * 100)} % : tirer la lettre B de ${dxZ} px écran pose ${expectedZ} px de mise en page (${Math.round(dxZ / zoomed)} px de plus), pas ${190 + dxZ}`, zoomed > 1.1 && modelZ.first[1] === expectedZ, { modelZ: modelZ.first, expectedZ, zoom: zoomed });
  await undoKey(page);
  await realClick(page, '#pp-page-zoom-fit');
  await page.waitForTimeout(400);

  // ---------- 11) La bulle se lit : contraste de la charte, et elle reste dans le panneau ----------
  await setA4(page, true);
  await load(page, DOC);
  await clickCell(page, 'B2');
  await drag(page, COLHANDLE(3), narrow ? 15 : 25, 0, { keepDown: true });
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

  // ---------- 12) Une grille : sa poignée de lettre règle toujours la colonne, sans limite de page ----------
  // Dans 420 px la barre (deux lignes) et la barre d'outils ne laissent à la grille que ~70 px : ses lettres se voient, leurs gestes n'ont plus de place.
  if (!narrow) {
    await setA4(page, false);
    await load(page, GRID, { grid: true });
    await clickCell(page, 'B2');
    const gridHandle = '.v2-grid-cols .v2-grid-colhead:nth-child(1) .v2-grid-handle';
    const gridWidths = () => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table > colgroup > col')).map(c => Math.round(c.getBoundingClientRect().width * 10) / 10));
    const gridBefore = await gridWidths();
    const gridDrag = await drag(page, gridHandle, 60, 0, { during: async () => ({ cols: await gridWidths(), tip: await tipText(page) }) });
    const gridAfter = await modelOf(page);
    check(`${label}, grille - tirer la lettre A de 60 px la porte à 160 px (${gridBefore[0]} → ${gridDrag.mid.cols[0]} px en plein glissé), la bulle dit « 160 px », B et C gardent 150 et 80 px`,
      near(gridDrag.mid.cols[0], 160, 0.8) && gridDrag.mid.tip === '160 px' && near(gridDrag.mid.cols[1], 150, 0.3) && allRows(gridAfter, [160, 150, 80]), { before: gridBefore, mid: gridDrag.mid, model: gridAfter.widths });
    await undoKey(page);
    check(`${label}, grille - un seul Ctrl+Z rend les largeurs (100, 150 et 80 px)`, allRows(await modelOf(page), [100, 150, 80]), await modelOf(page));
  }

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
