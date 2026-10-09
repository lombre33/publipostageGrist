#!/usr/bin/env node
// « Égaliser » : la hauteur des lignes, la largeur des colonnes que les cases choisies couvrent prennent leur moyenne (js/grid-editor.js : canEqualize, equalizeLines ; boutons de la barre du
// tableau, js/floating-toolbars.js), demande d'Antoine du 09/10 : « quand je sélectionne plusieurs lignes ou plusieurs colonnes, harmoniser leur taille (prendre la moyenne) », dans un tableau
// de document comme dans une grille (la barre est la même). Contrôlé à la VRAIE souris (page.mouse, page.keyboard ; Node/Playwright), à la taille du panneau Grist (~700x400), en thème clair
// puis sombre, puis dans un panneau étroit (420 px, la barre passe sur deux lignes), en Aperçu A4 (feuille réduite à ~0,85) et sans, puis dans une grille :
//   - les deux boutons sont dans la barre, à leur place (« Égaliser les lignes » après « Supprimer la ligne », « Égaliser les colonnes » après « Supprimer la colonne »), entiers dans le panneau,
//     un vrai pointeur au centre de chacun tombe dessus ; grisés avec leur raison en info-bulle tant que la sélection ne couvre pas deux lignes (colonnes), et un appui dessus ne change rien ;
//   - des lignes choisies par leurs numéros, un appui sur « Égaliser la hauteur » donne à chacune la moyenne de leurs hauteurs (en pixels de mise en page, pas ceux de l'écran), en UNE
//     transaction (un Ctrl+Z, un Rétablir) ; le tableau garde sa taille d'ensemble, les numéros restent sur leurs lignes, l'éditeur garde le focus et la barre reste affichée ;
//   - des colonnes choisies par leurs lettres : la moyenne de leurs largeurs, la largeur du tableau inchangée ; deux colonnes sur trois : la troisième garde la sienne ;
//   - des cases choisies en glissant (un tableau dans une case, qui n'a pas de bandeaux) : les mêmes boutons ;
//   - le suivi des modifications propose les tailles (une suggestion par ligne ou case touchée) et « Tout refuser » les rend ;
//   - dans une grille : la même barre, les mêmes boutons, les tailles en pixels.
// Les fonctions elles-mêmes sont dans dev-tests/scenarios-grid-in-document.js (groupe gridInDocument), scenarios-grid.js (groupe grid) et scenarios-floating-toolbars.js (groupe floatingToolbars).
// Lancé par run-headless.mjs (groupe Node « tableEqualizeMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-table-equalize-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TABLE_EQUALIZE_MOUSE_PORT || 8998);
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
if (!OFFLINE) console.log('[verify-table-equalize-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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


// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Assistants

const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, selector, options) {
  const b = await boxOf(page, selector);
  if (!b) return null;
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y, options);
  await page.waitForTimeout(250);
  return b;
}
// Le centre de la case dont le texte est exactement `text`, ramenée au milieu du plan de travail d'abord (dans 420 px la barre passe sur deux lignes, il reste 150 px de plan de travail).
const cellPoint = (page, text, scroll = true) => page.evaluate(([wanted, scroll]) => {
  const td = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).find(c => c.querySelector('p') && c.querySelector('p').textContent === wanted);
  if (!td) return null;
  if (scroll) td.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = td.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, [text, scroll]);
async function clickCell(page, text) {
  const p = await cellPoint(page, text);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
}
// La souris attend dans le coin du plan de travail : partie de (0, 0), elle traverserait la barre d'outils (ses menus s'ouvrent au survol).
const parkMouse = page => { const size = page.viewportSize(); return page.mouse.move(size.width - 12, size.height - 12); };
async function load(page, html, { grid = false } = {}) {
  await page.evaluate(({ html, grid }) => { GridEditor.setActive(false); Editor.setHTML(html); if (grid) GridEditor.setActive(true); const box = document.getElementById('editor-container'); box.scrollTop = 0; box.scrollLeft = 0; }, { html, grid });
  await page.waitForTimeout(600);
  await parkMouse(page);
}
const setA4 = (page, on) => page.evaluate((value) => { const t = document.getElementById('v2-toggle-a4-preview'); if (t && t.checked !== value) { t.checked = value; t.dispatchEvent(new Event('change', { bubbles: true })); } }, on).then(() => page.waitForTimeout(500));
// Plus de 500 ms entre deux gestes : prosemirror-history groupe sinon les transactions rapprochées en UN seul évènement.
const undoKey = async (page) => { await page.waitForTimeout(650); await page.keyboard.press('Control+z'); await page.waitForTimeout(450); };
const redoKey = async (page) => { await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(450); };
const sheetZoom = page => page.evaluate(() => EditorCore.layoutZoom(EditorCore.getEditor().view.dom));

const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

const DOC_STRIPS = '.pp-doc-strips';
const BAR = '.v2-table-toolbar';
// Les trois colonnes (140, 190 et 120 px) et les trois lignes d'un tableau de document, un paragraphe avant et après.
const SIZED = '<p>Avant le tableau</p><table><tbody>' + [1, 2, 3].map(r => '<tr>' + [140, 190, 120].map((w, c) => `<td colwidth="${w}"><p>${'ABC'[c]}${r}</p></td>`).join('') + '</tr>').join('') + '</tbody></table><p>Après le tableau</p>';
// Un tableau extérieur dont une case porte un tableau intérieur de deux cases (pas de bandeaux pour lui : ses cases se choisissent en glissant).
const INNER = '<p>Avant</p><table><tbody><tr><td><p>Dehors</p><table><tbody><tr><td colwidth="60"><p>N1</p></td><td colwidth="140"><p>N2</p></td></tr></tbody></table></td><td><p>Voisine</p></td></tr>'
  + '<tr><td><p>Bas</p></td><td><p>Bas droite</p></td></tr></tbody></table><p>Après</p>';
// Une grille de trois colonnes (100, 150 et 80 px) et trois lignes (32, 60 et 88 px : aucune sous la hauteur de son texte, ~29 px, sinon la grille la dessine à celle-ci et la moyenne mesurée n'est pas celle de la page).
const GRID = '<table style="width: 330px;"><colgroup>' + [100, 150, 80].map(w => `<col style="width: ${w}px;">`).join('') + '</colgroup><tbody>'
  + [32, 60, 88].map((h, r) => `<tr data-row-height="${h}" style="height: ${h}px">` + [100, 150, 80].map((w, c) => `<td colwidth="${w}"><p>${'ABC'[c]}${r + 1}</p></td>`).join('') + '</tr>').join('') + '</tbody></table>';

// Les hauteurs posées, d'un coup, sur les lignes du premier tableau (le moyen le plus court d'avoir des lignes de tailles différentes).
const setHeights = (page, heights) => page.evaluate((list) => {
  const ed = EditorCore.getEditor();
  let pos = null;
  ed.state.doc.descendants((n, p) => { if (n.type.name === 'table' && pos === null) { pos = p; return false; } return true; });
  const tr = ed.state.tr; let at = pos + 1;
  ed.state.doc.nodeAt(pos).forEach((row, _o, i) => { tr.setNodeMarkup(at, undefined, Object.assign({}, row.attrs, { rowHeight: list[i] })); at += row.nodeSize; });
  ed.view.dispatch(tr);
}, heights);
// Le tableau de rang `index` tel que le document le dit : hauteur posée et marques de suivi de chaque ligne, largeur posée de chaque colonne (par la première ligne).
const modelOf = (page, index = 0) => page.evaluate((n) => {
  const tables = [];
  EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'table') tables.push(node); return true; });
  const rows = []; const marks = []; const widths = [];
  tables[n].forEach((row) => {
    rows.push(row.attrs.rowHeight || null);
    marks.push(row.marks.map(mark => mark.type.name + ':' + mark.attrs.attrName).join());
    const line = []; row.forEach(cell => line.push(cell.attrs.colwidth ? cell.attrs.colwidth[0] : null)); widths.push(line);
  });
  return { rows, marks, widths: widths[0], allWidths: widths };
}, index);
// Les tailles RENDUES du premier tableau (hors tableaux dans une case) en pixels de mise en page : le rendu divisé par la réduction de la feuille (1 dans une grille). Sous le suivi, une
// ligne proposée est enveloppée d'un <span>.
const sizesOf = page => page.evaluate(() => {
  const tables = Array.from(document.querySelectorAll('.tiptap table')).filter(t => !t.parentElement.closest('table'));
  const t = tables[0];
  const z = GridEditor.isActive() ? 1 : EditorCore.layoutZoom(t);
  const round = v => Math.round(v / z * 10) / 10;
  return {
    z, width: round(t.getBoundingClientRect().width),
    rows: Array.from(t.querySelectorAll(':scope > tbody > tr, :scope > tbody > span > tr')).map(r => round(r.getBoundingClientRect().height)),
    cols: Array.from(t.querySelectorAll(':scope > colgroup > col')).map(c => round(c.getBoundingClientRect().width)),
  };
});
const allEqual = (list, tolerance = 0.8) => list.every(v => Math.abs(v - list[0]) <= tolerance);
const sum = list => list.reduce((a, b) => a + b, 0);

// La barre du tableau : ses boutons dans l'ordre où l'œil les lit (rangée, puis gauche à droite), l'état de « Égaliser » (visible, grisé, raison, entier dans le panneau, un vrai pointeur au centre
// tombe-t-il dessus ?), la barre elle-même.
const barState = page => page.evaluate((barSel) => {
  const bar = document.querySelector(barSel + '.visible') || document.querySelector(barSel);
  if (!bar) return null;
  const buttons = {}; const order = [];
  Array.from(bar.querySelectorAll('button[data-action]')).forEach((b) => {
    const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
    const shown = cs.display !== 'none' && r.width > 0 && r.height > 0;
    if (shown) order.push([Math.round(r.top / 12), r.left, b.dataset.action]);
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    buttons[b.dataset.action] = {
      shown, disabled: b.classList.contains('is-disabled'), locked: b.classList.contains('v2-hf-locked'), aria: b.getAttribute('aria-disabled'), title: b.title, opacity: Number(cs.opacity), color: cs.color,
      inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hit: !!top && (top === b || b.contains(top)), svg: b.querySelectorAll('svg').length, w: r.width, h: r.height,
    };
  });
  order.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const r = bar.getBoundingClientRect();
  return { buttons, order: order.map(o => o[2]), height: r.height, background: getComputedStyle(bar).backgroundColor, visible: bar.classList.contains('visible') || getComputedStyle(bar).display !== 'none', inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
}, BAR);
const pressBar = (page, action) => realClick(page, `${BAR} button[data-action="${action}"]`);

// Un numéro ou une lettre cliqué comme une personne le fait (Maj pour étendre) ; `root` : les bandeaux d'un document (.pp-doc-strips) ou ceux d'une grille (aucun préfixe).
async function clickHead(page, root, kind, n, shift = false) {
  const b = await boxOf(page, `${root} .v2-grid-${kind}head:nth-child(${n})`.trim());
  if (!b) throw new Error(`${kind} ${n} introuvable`);
  const work = await boxOf(page, '#editor-container');
  if (b.x < work.left || b.x > work.right || b.y < work.top + 2 || b.y > work.bottom - 2) throw new Error(`${kind} ${n} hors du plan de travail (${Math.round(b.x)}, ${Math.round(b.y)}) : la souris cliquerait dans le vide`);
  await page.mouse.move(b.x, b.y, { steps: 3 });
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(b.x, b.y);
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(250);
}
const chooseLines = async (page, root, kind, from, to) => { await clickHead(page, root, kind, from); if (to !== from) await clickHead(page, root, kind, to, true); };
const selectedCellCount = page => page.evaluate(() => { const sel = EditorCore.getEditor().state.selection; return sel.$anchorCell ? sel.ranges.length : 0; });
// Les numéros sont-ils toujours sur leurs lignes ?
const rowHeadsAligned = (page, root) => page.evaluate(([rootSel]) => {
  const tables = Array.from(document.querySelectorAll('.tiptap table')).filter(t => !t.parentElement.closest('table'));
  const rows = Array.from(tables[0].querySelectorAll(':scope > tbody > tr, :scope > tbody > span > tr'));
  const heads = Array.from(document.querySelectorAll(`${rootSel} .v2-grid-rowhead`.trim()));
  return heads.length === rows.length && heads.every((h, i) => { const a = h.getBoundingClientRect(), b = rows[i].getBoundingClientRect(); return Math.abs(a.top - b.top) <= 2 && Math.abs(a.bottom - b.bottom) <= 2; });
}, [root]);
const focusInEditor = page => page.evaluate(() => EditorCore.getEditor().view.hasFocus());

const FR = {
  rows: 'Égaliser la hauteur des lignes (moyenne)', rowsNeed: 'Égaliser la hauteur des lignes : sélectionnez-en au moins deux, en glissant sur le tableau',
  cols: 'Égaliser la largeur des colonnes (moyenne)', colsNeed: 'Égaliser la largeur des colonnes : sélectionnez-en au moins deux, en glissant sur le tableau',
};
const EN = {
  rows: 'Make rows the same height (average)', rowsNeed: 'Make rows the same height: select at least two, by dragging across the table',
  cols: 'Make columns the same width (average)', colsNeed: 'Make columns the same width: select at least two, by dragging across the table',
};
const free = (b, title) => !!b && b.shown && !b.disabled && b.aria === 'false' && b.opacity > 0.9 && b.title === title;
const grey = (b, title) => !!b && b.shown && b.disabled && b.aria === 'true' && b.opacity < 0.6 && b.title === title;

async function runTheme(theme, size, tag) {
  const label = tag || (theme === 'dark' ? 'sombre' : 'clair');
  console.log(`\n=== « Égaliser » (hauteur des lignes, largeur des colonnes) à la souris, ${size.width}x${size.height}, ${tag ? 'panneau étroit' : 'thème ' + label} ===`);
  const { context, page } = await openWidget(theme, size);
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);
  // Dans 420 px la barre passe sur deux lignes : il reste ~150 px de plan de travail, trois lignes de 40, 80 et 160 px ne s'y voient pas toutes (le numéro de la troisième serait hors de la vue) ;
  // on y prend des lignes plus basses, sans rien changer au reste de la vérification.
  const narrow = size.width < 500;
  const HEIGHTS = narrow ? [34, 46, 62] : [40, 80, 160];
  const MEAN = Math.round(sum(HEIGHTS) / 3);
  const LIST = HEIGHTS.join(', ').replace(/, (\d+)$/, ' et $1');
  const AGAIN = narrow ? [30, 30, 48] : [30, 30, 150];
  const AGAIN_MEAN = Math.round(sum(AGAIN) / 3);

  for (const a4 of [true, false]) {
    const mode = a4 ? 'Aperçu A4' : 'page sans A4';
    const tag2 = `${label}, ${mode}`;
    await setA4(page, a4);

    // ---------- 1) La barre : les deux boutons, à leur place, grisés avec leur raison au curseur ----------
    await load(page, SIZED);
    await setHeights(page, HEIGHTS);
    await page.waitForTimeout(300);
    await clickCell(page, 'B2');
    const zoom = await sheetZoom(page);
    let bar = await barState(page);
    const o = bar && bar.order;
    check(`${tag2} (feuille à l'échelle ${zoom.toFixed(2)}) - la barre porte « Égaliser les lignes » juste après « Supprimer la ligne » et « Égaliser les colonnes » juste après « Supprimer la colonne », entiers dans le panneau, avec leur icône`,
      !!bar && o.indexOf('rows-equalize') === o.indexOf('row-del') + 1 && o.indexOf('row-del') >= 0 && o.indexOf('cols-equalize') === o.indexOf('col-del') + 1 && o.indexOf('col-del') >= 0
      && bar.buttons['rows-equalize'].inside && bar.buttons['cols-equalize'].inside && bar.buttons['rows-equalize'].svg === 1 && bar.buttons['cols-equalize'].svg === 1, { order: o });
    check(`${tag2} - un vrai pointeur au centre de chacun des deux boutons tombe sur lui (rien ne les recouvre), et ils ont la taille de leurs voisins`,
      !!bar && bar.buttons['rows-equalize'].hit && bar.buttons['cols-equalize'].hit && near(bar.buttons['rows-equalize'].w, bar.buttons['row-del'].w, 0.6) && near(bar.buttons['cols-equalize'].h, bar.buttons['col-del'].h, 0.6),
      bar && [bar.buttons['rows-equalize'], bar.buttons['row-del']]);
    check(`${tag2} - curseur dans une case : les deux boutons sont grisés avec leur raison en info-bulle, aucun n'est retiré`, !!bar && grey(bar.buttons['rows-equalize'], FR.rowsNeed) && grey(bar.buttons['cols-equalize'], FR.colsNeed), bar && [bar.buttons['rows-equalize'], bar.buttons['cols-equalize']]);
    const before = await page.evaluate(() => Editor.getHTML());
    await pressBar(page, 'rows-equalize');
    await pressBar(page, 'cols-equalize');
    check(`${tag2} - un appui sur un bouton grisé ne change rien au document`, (await page.evaluate(() => Editor.getHTML())) === before);

    // ---------- 2) Des lignes choisies par leurs numéros : leur moyenne, en une transaction ----------
    await chooseLines(page, DOC_STRIPS, 'row', 1, 3);
    bar = await barState(page);
    check(`${tag2} - les lignes 1 à 3 choisies par leurs numéros : les deux boutons sont libres, avec leur info-bulle`, !!bar && free(bar.buttons['rows-equalize'], FR.rows) && free(bar.buttons['cols-equalize'], FR.cols), bar && [bar.buttons['rows-equalize'], bar.buttons['cols-equalize']]);
    const rowsBefore = await sizesOf(page);
    const mean = Math.round(sum(rowsBefore.rows) / 3);
    await pressBar(page, 'rows-equalize');
    const m1 = await modelOf(page);
    const rowsAfter = await sizesOf(page);
    check(`${tag2} - « Égaliser la hauteur » : les trois lignes (${rowsBefore.rows.map(Math.round).join(', ')} px) prennent la moyenne (${mean} px), posée en pixels de mise en page ; le rendu la suit`,
      m1.rows.every(v => v === mean) && mean === MEAN && allEqual(rowsAfter.rows, 0.8) && near(rowsAfter.rows[0], mean, 0.8), { rowsBefore: rowsBefore.rows, model: m1.rows, after: rowsAfter.rows });
    check(`${tag2} - la somme des hauteurs ne bouge pas (à l'arrondi près), la largeur du tableau non plus, les numéros restent sur leurs lignes`,
      near(sum(rowsAfter.rows), sum(rowsBefore.rows), 3) && near(rowsAfter.width, rowsBefore.width, 1) && (await rowHeadsAligned(page, DOC_STRIPS)), { avant: sum(rowsBefore.rows), apres: sum(rowsAfter.rows) });
    bar = await barState(page);
    check(`${tag2} - l'éditeur garde le focus, la barre reste affichée, les neuf cases restent choisies`, (await focusInEditor(page)) && !!bar && bar.visible && (await selectedCellCount(page)) === 9, { focus: await focusInEditor(page), selected: await selectedCellCount(page) });
    await undoKey(page);
    check(`${tag2} - UN Ctrl+Z rend les trois hauteurs (${LIST} px)`, JSON.stringify((await modelOf(page)).rows) === JSON.stringify(HEIGHTS), (await modelOf(page)).rows);
    await redoKey(page);
    check(`${tag2} - Rétablir les égalise de nouveau (${mean} px)`, (await modelOf(page)).rows.every(v => v === mean), (await modelOf(page)).rows);
    await undoKey(page);

    // ---------- 3) Des colonnes choisies par leurs lettres ----------
    await clickCell(page, 'B2');
    await chooseLines(page, DOC_STRIPS, 'col', 1, 3);
    const colsBefore = await sizesOf(page);
    await pressBar(page, 'cols-equalize');
    const m2 = await modelOf(page);
    const colsAfter = await sizesOf(page);
    check(`${tag2} - « Égaliser la largeur » : les trois colonnes (140, 190 et 120 px) prennent 150 px, la largeur du tableau ne change pas (${Math.round(colsBefore.width)} px)`,
      m2.allWidths.every(line => line.every(w => w === 150)) && allEqual(colsAfter.cols, 0.8) && near(colsAfter.cols[0], 150, 0.8) && near(colsAfter.width, colsBefore.width, 1.5), { model: m2.allWidths, cols: colsAfter.cols, width: [colsBefore.width, colsAfter.width] });
    check(`${tag2} - les lettres restent sur leurs colonnes et l'éditeur garde le focus`, (await focusInEditor(page)) && (await page.evaluate((root) => {
      const t = Array.from(document.querySelectorAll('.tiptap table')).filter(x => !x.parentElement.closest('table'))[0];
      const cols = Array.from(t.querySelectorAll(':scope > colgroup > col'));
      const heads = Array.from(document.querySelectorAll(`${root} .v2-grid-colhead`));
      return heads.length === cols.length && heads.every((h, i) => { const a = h.getBoundingClientRect(), b = cols[i].getBoundingClientRect(); return Math.abs(a.left - b.left) <= 2 && Math.abs(a.right - b.right) <= 2; });
    }, DOC_STRIPS)));
    await undoKey(page);
    check(`${tag2} - UN Ctrl+Z rend les largeurs (140, 190 et 120 px)`, JSON.stringify((await modelOf(page)).widths) === '[140,190,120]', (await modelOf(page)).widths);
    // Deux colonnes sur trois : la troisième garde la sienne.
    await clickCell(page, 'B2');
    await chooseLines(page, DOC_STRIPS, 'col', 1, 2);
    await pressBar(page, 'cols-equalize');
    check(`${tag2} - les colonnes A et B choisies : elles prennent 165 px (la moyenne de 140 et 190), C garde ses 120 px`, JSON.stringify((await modelOf(page)).widths) === '[165,165,120]', (await modelOf(page)).widths);
    await undoKey(page);

    // ---------- 4) Une ligne seule : la hauteur grisée, les colonnes libres ----------
    await clickCell(page, 'B2');
    await chooseLines(page, DOC_STRIPS, 'row', 2, 2);
    bar = await barState(page);
    check(`${tag2} - la ligne 2 seule choisie : « Égaliser la hauteur » est grisé (une seule ligne), « Égaliser la largeur » libre (trois colonnes couvertes)`, !!bar && grey(bar.buttons['rows-equalize'], FR.rowsNeed) && free(bar.buttons['cols-equalize'], FR.cols), bar && [bar.buttons['rows-equalize'], bar.buttons['cols-equalize']]);

    // ---------- 5) Des cases choisies en glissant, dans un tableau posé dans une case (sans bandeaux) ----------
    await load(page, INNER);
    await clickCell(page, 'N1');
    const a = await cellPoint(page, 'N1'), b = await cellPoint(page, 'N2', false);
    await page.mouse.move(a.x, a.y, { steps: 2 }); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(300);
    bar = await barState(page);
    check(`${tag2} - tableau dans une case, deux cases choisies en glissant : « Égaliser la largeur » libre, « Égaliser la hauteur » grisé (une seule ligne)`, !!bar && free(bar.buttons['cols-equalize'], FR.cols) && grey(bar.buttons['rows-equalize'], FR.rowsNeed), bar && [bar.buttons['rows-equalize'], bar.buttons['cols-equalize']]);
    await pressBar(page, 'cols-equalize');
    const inner = await page.evaluate(() => {
      const widths = []; let depth0 = null;
      EditorCore.getEditor().state.doc.descendants((node, pos, parent) => { if (node.type.name === 'tableCell') widths.push([node.textContent, node.attrs.colwidth ? node.attrs.colwidth[0] : null]); return true; });
      return widths;
    });
    const widthsOf = text => (inner.find(([t]) => t.startsWith(text)) || [])[1];
    check(`${tag2} - les deux cases du tableau intérieur (60 et 140 px) prennent 100 px chacune ; les cases du tableau extérieur ne sont pas touchées`, widthsOf('N1') === 100 && widthsOf('N2') === 100 && widthsOf('Voisine') == null && widthsOf('Bas') == null, inner);
    await undoKey(page);
  }

  // ---------- 6) Le suivi des modifications : les tailles sont proposées, « Tout refuser » les rend ----------
  await setA4(page, true);
  await load(page, SIZED);
  await setHeights(page, HEIGHTS);
  await page.waitForTimeout(300);
  await clickCell(page, 'B2');
  await page.evaluate(() => Editor.setTrackChanges(true));
  await page.waitForTimeout(300);
  await clickCell(page, 'B2');
  await chooseLines(page, DOC_STRIPS, 'row', 1, 3);
  let bar = await barState(page);
  check(`${label} - suivi allumé : les deux boutons restent libres (la hauteur d'une ligne et la largeur d'une colonne sont suivies)`, !!bar && free(bar.buttons['rows-equalize'], FR.rows) && free(bar.buttons['cols-equalize'], FR.cols), bar && [bar.buttons['rows-equalize'], bar.buttons['cols-equalize']]);
  await pressBar(page, 'rows-equalize');
  await pressBar(page, 'cols-equalize');
  const tracked = await modelOf(page);
  check(`${label} - suivi allumé : « Égaliser » propose les hauteurs (marque « modification » sur chacune des trois lignes) et les largeurs`,
    tracked.rows.every(v => v === MEAN) && tracked.marks.every(m => m === 'modification:rowHeight') && tracked.allWidths.every(line => line.every(w => w === 150)), tracked);
  // Une ligne déjà proposée (enveloppée d'un <span> par le suivi) s'égalise encore, et sa hauteur de départ est celle du rendu.
  await setHeights(page, AGAIN);
  await page.waitForTimeout(300);
  await clickCell(page, 'B2');
  await chooseLines(page, DOC_STRIPS, 'row', 1, 3);
  await pressBar(page, 'rows-equalize');
  const again = await modelOf(page);
  check(`${label} - suivi allumé, lignes déjà proposées : égaliser les mesure encore (${AGAIN.join(', ')} px → ${AGAIN_MEAN} px) et la hauteur d'une ligne n'est pas retenue à celle du moment`, again.rows.every(v => v === AGAIN_MEAN), again.rows);
  await page.evaluate(() => EditorCore.getEditor().chain().focus().rejectAllSuggestionsChunked().run());
  await page.waitForTimeout(800);
  const refused = await modelOf(page);
  check(`${label} - « Tout refuser » rend les tailles d'origine (lignes ${LIST} px, colonnes 140, 190 et 120 px)`, JSON.stringify(refused.rows) === JSON.stringify(HEIGHTS) && JSON.stringify(refused.widths) === '[140,190,120]', refused);
  await page.evaluate(() => Editor.setTrackChanges(false));
  await page.waitForTimeout(300);

  // ---------- 7) Les mots : français et anglais ----------
  await load(page, SIZED);
  await clickCell(page, 'B2');
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(300);
  await clickCell(page, 'B2');
  bar = await barState(page);
  check(`${label} - en anglais : les deux boutons grisés disent leur raison en anglais`, !!bar && grey(bar.buttons['rows-equalize'], EN.rowsNeed) && grey(bar.buttons['cols-equalize'], EN.colsNeed), bar && [bar.buttons['rows-equalize'].title, bar.buttons['cols-equalize'].title]);
  await chooseLines(page, DOC_STRIPS, 'row', 1, 3);
  bar = await barState(page);
  check(`${label} - en anglais : libres, ils disent « Make rows the same height (average) » et « Make columns the same width (average) »`, !!bar && free(bar.buttons['rows-equalize'], EN.rows) && free(bar.buttons['cols-equalize'], EN.cols), bar && [bar.buttons['rows-equalize'].title, bar.buttons['cols-equalize'].title]);
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(300);

  // ---------- 8) Lisibilité : l'icône d'un bouton libre se lit sur la barre ----------
  await clickCell(page, 'B2');
  await chooseLines(page, DOC_STRIPS, 'row', 1, 3);
  bar = await barState(page);
  const contrast = await page.evaluate(([bg]) => ['rows-equalize', 'cols-equalize'].map(a => window.__ratio(getComputedStyle(document.querySelector('.v2-table-toolbar button[data-action="' + a + '"]')).color, bg)), [bar && bar.background]);
  check(`${label} - l'icône des deux boutons libres se lit sur la barre (contraste ≥ 3:1) : ${contrast.map(c => Math.round(c * 100) / 100).join(' et ')}`, contrast.every(c => c >= 3), contrast);

  // ---------- 9) Une grille : la même barre, les mêmes boutons, les tailles en pixels ----------
  await setA4(page, false);
  await load(page, GRID, { grid: true });
  await clickCell(page, 'B2');
  bar = await barState(page);
  const g = bar && bar.order;
  check(`${label}, grille - la barre de la grille porte aussi les deux boutons à leur place, grisés avec leur raison au curseur`,
    !!bar && g.indexOf('rows-equalize') === g.indexOf('row-del') + 1 && g.indexOf('cols-equalize') === g.indexOf('col-del') + 1 && grey(bar.buttons['rows-equalize'], FR.rowsNeed) && grey(bar.buttons['cols-equalize'], FR.colsNeed) && bar.buttons['rows-equalize'].inside && bar.buttons['cols-equalize'].inside, bar && { order: g, rows: bar.buttons['rows-equalize'], cols: bar.buttons['cols-equalize'] });
  // Dans 420 px la barre (deux lignes) et la barre d'outils ne laissent à la grille que ~70 px : ses numéros ne se choisissent plus à la souris ; la barre, elle, est vérifiée ci-dessus.
  if (narrow) { await context.close(); return; }
  await chooseLines(page, '', 'row', 1, 3);
  const gridBefore = await sizesOf(page);
  await pressBar(page, 'rows-equalize');
  const gm = await modelOf(page);
  const gridAfter = await sizesOf(page);
  check(`${label}, grille - les lignes 1 à 3 (${gridBefore.rows.map(Math.round).join(', ')} px) prennent la moyenne (60 px), en pixels comme les bandeaux de la grille les disent ; la grille garde sa largeur`,
    gm.rows.every(v => v === 60) && allEqual(gridAfter.rows, 0.8) && near(gridAfter.width, gridBefore.width, 1) && (await rowHeadsAligned(page, '')), { model: gm.rows, before: gridBefore.rows, after: gridAfter.rows });
  await undoKey(page);
  check(`${label}, grille - UN Ctrl+Z rend les hauteurs (32, 60 et 88 px)`, JSON.stringify((await modelOf(page)).rows) === '[32,60,88]', (await modelOf(page)).rows);
  await clickCell(page, 'B2');
  await chooseLines(page, '', 'col', 1, 3);
  await pressBar(page, 'cols-equalize');
  const gc = await modelOf(page);
  const gridCols = await sizesOf(page);
  check(`${label}, grille - les colonnes A à C (100, 150 et 80 px) prennent 110 px, la grille garde sa largeur (330 px)`, gc.allWidths.every(line => line.every(w => w === 110)) && allEqual(gridCols.cols, 0.8) && near(gridCols.width, 330, 1.5), { model: gc.allWidths, cols: gridCols.cols, width: gridCols.width });
  await undoKey(page);
  check(`${label}, grille - UN Ctrl+Z rend les largeurs (100, 150 et 80 px)`, JSON.stringify((await modelOf(page)).widths) === '[100,150,80]', (await modelOf(page)).widths);

  await context.close();
}

await runTheme('light', { width: WIDTH, height: HEIGHT });
await runTheme('dark', { width: WIDTH, height: HEIGHT });
await runTheme('light', { width: NARROW, height: HEIGHT }, 'étroit');

console.log(`\n${total - failures}/${total} passés`);
if (pageErrors.length) { console.log('Erreurs de page :', pageErrors); failures++; }
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
