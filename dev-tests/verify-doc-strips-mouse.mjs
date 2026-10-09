#!/usr/bin/env node
// Bandeaux A, B, C / 1, 2, 3 d'un tableau de DOCUMENT (js/grid-editor.js : documentStrips ; Antoine, 09/10 : « le module d'insertion de tableau d'un doc classique est en fait un tableau
// du mode grille », lot 4 (a) sur 6 : « Tableau actif », par-dessus la page, sans rien décaler) à la VRAIE souris (page.mouse, page.keyboard ; Node/Playwright), à la taille du panneau
// Grist (~700x400), en thème clair puis sombre, puis dans un panneau étroit (420 px). Une page.evaluate ne déclenche ni un appui « trusted », ni le survol, ni la molette : c'est ici qu'on
// s'assure que
//   - tant que le curseur est hors d'un tableau, la page n'a AUCUN bandeau ; dès qu'il entre dans un tableau, les lettres se posent juste au-dessus de ses colonnes et les numéros juste à
//     gauche de ses lignes (bords mesurés à l'écran, feuille réduite à ~0,85 en Aperçu A4 ou non), le coin entre les deux ; ils ne décalent rien (le texte d'avant, le tableau et le texte
//     d'après restent au pixel près où ils étaient) et se cliquent (un vrai pointeur dessus tombe sur eux, pas sur la page) ;
//   - cliquer une lettre choisit la colonne, un numéro la ligne, le coin tout le tableau, Maj + clic étend ; l'éditeur garde le focus, la barre du tableau reste affichée, les lettres et
//     numéros touchés par la sélection s'allument ;
//   - la barre du tableau ne recouvre jamais les bandeaux (elle se pose au-dessus de leurs lettres, ou dessous le tableau), et ses boutons fonctionnent bandeaux montrés (une ligne de plus : un
//     numéro de plus) ;
//   - ils suivent le défilement (vertical, horizontal une fois la page agrandie), sont rognés aux bords du plan de travail (jamais sur la barre d'outils) et suivent aussi le changement de tableau ;
//   - ils ne se montrent pas pour un tableau dans une case, dans une colonne, ni dans une grille (qui a les siens), ni en Lecture ; le suivi des modifications les laisse (choisir ne modifie rien) ;
//   - contrastes de la charte (F5), clair et sombre.
// Les fonctions elles-mêmes (étiquettes, sélection, allumage, nettoyage de la page) sont dans dev-tests/scenarios-grid-in-document.js (groupe gridInDocument).
// Lancé par run-headless.mjs (groupe Node « docStripsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-doc-strips-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.DOC_STRIPS_MOUSE_PORT || 8992);
const WIDTH = 700;
const HEIGHT = 400;
const NARROW = 420;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-doc-table-tools-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-doc-strips-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Le centre de la case dont le texte est exactement `text`.
const cellPoint = (page, text) => page.evaluate((wanted) => {
  const td = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).find(c => c.querySelector('p') && c.querySelector('p').textContent === wanted);
  if (!td) return null;
  const r = td.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, text);
async function clickCell(page, text) {
  const p = await cellPoint(page, text);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
}
// Un clic dans le texte d'un paragraphe HORS tableau (au bout de sa ligne). Le paragraphe est d'abord ramené dans le plan de travail : le curseur de fin de document peut avoir fait défiler
// la page, et le premier paragraphe se trouvait alors sous la barre d'outils (le clic tombait sur un bouton).
const paragraphPoint = (page, text) => page.evaluate((wanted) => {
  const p = Array.from(document.querySelectorAll('.tiptap > p')).find(node => node.textContent === wanted);
  if (!p) return null;
  p.scrollIntoView({ block: 'nearest' });
  const box = document.getElementById('editor-container').getBoundingClientRect();
  const r = p.getBoundingClientRect();
  const y = r.top + r.height / 2;
  if (y < box.top + 4 || y > box.bottom - 4) return null;
  return { x: r.left + Math.min(r.width - 4, 60), y };
}, text);
async function clickParagraph(page, text) {
  const p = await paragraphPoint(page, text);
  if (!p) throw new Error('paragraphe introuvable : ' + text + ' parmi ' + JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap > p')).map(node => node.textContent))));
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
}
const selectedTexts = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap td.selectedCell, .tiptap th.selectedCell')).map(c => c.textContent));
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;

// Contraste WCAG de deux couleurs CSS « rgb(...) ».
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

const BAR = '.v2-floating-toolbar.v2-table-toolbar.visible';
const STRIPS = '.pp-doc-strips';
const COLHEAD = n => `${STRIPS} .v2-grid-colhead:nth-child(${n})`;
const ROWHEAD = n => `${STRIPS} .v2-grid-rowhead:nth-child(${n})`;
const CORNER = `${STRIPS} .v2-grid-corner`;

// Un document : un paragraphe, un tableau 3 lignes x 3 colonnes aux largeurs réglées (140, 190 et 120 px), un paragraphe.
const cellsHtml = (row, widths) => '<tr>' + widths.map((w, c) => `<td colwidth="${w}"><p>${'ABC'[c]}${row}</p></td>`).join('') + '</tr>';
const DOC = '<p>Avant le tableau</p><table><tbody>' + [1, 2, 3].map(r => cellsHtml(r, [140, 190, 120])).join('') + '</tbody></table><p>Après le tableau</p>';
// Deux tableaux : A (2 lignes, 2 colonnes) puis B (4 lignes, 3 colonnes), un paragraphe entre les deux.
const TWO = '<p>Avant</p><table><tbody>' + [1, 2].map(r => cellsHtml(r, [150, 150]).replace(/<p>([A-C])(\d)<\/p>/g, '<p>T$1$2</p>')).join('') + '</tbody></table>'
  + '<p>Entre les tableaux</p><table><tbody>' + [1, 2, 3, 4].map(r => cellsHtml(r, [110, 110, 110]).replace(/<p>([A-C])(\d)<\/p>/g, '<p>U$1$2</p>')).join('') + '</tbody></table><p>Après</p>';
// Un tableau dans la case d'un autre.
const NESTED = '<p>Avant</p><table><tbody><tr><td><p>Dehors</p><table><tbody><tr><td><p>N1</p></td><td><p>N2</p></td></tr></tbody></table></td><td><p>Voisine</p></td></tr></tbody></table><p>Après</p>';
// Un long document : de quoi défiler, le tableau au milieu.
const LONG = Array.from({ length: 14 }, (_, i) => `<p>Paragraphe ${i + 1} avant le tableau, un peu de texte pour remplir la page.</p>`).join('') + '<table><tbody>'
  + [1, 2, 3].map(r => cellsHtml(r, [140, 190, 120])).join('') + '</tbody></table>' + Array.from({ length: 14 }, (_, i) => `<p>Paragraphe ${i + 1} après le tableau.</p>`).join('');

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
const labelsOf = heads => heads.map(h => h.label).join('');
const litOf = heads => heads.map((h, i) => (h.sel ? i : -1)).filter(i => i >= 0).join(',');

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
// Entier dans le plan de travail ?
const insideBox = (r, box, slack = 0.5) => !!r && r.left >= box.left - slack && r.right <= box.right + slack && r.top >= box.top - slack && r.bottom <= box.bottom + slack;
// La partie d'un rectangle qui reste dans le plan de travail (largeur, hauteur).
const visiblePart = (r, box) => ({ w: Math.max(0, Math.min(r.right, box.right) - Math.max(r.left, box.left)), h: Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top)) });
const overlap = (a, b) => !!a && !!b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const barRect = page => page.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return null; const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }, BAR);
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
const sameFlow = (a, b) => a.length === b.length && a.every((r, i) => r.every((v, k) => near(v, b[i][k], 0.6)));

// La souris attend dans le coin du plan de travail : partie de (0, 0), elle traverserait la barre d'outils (ses menus s'ouvrent au survol) et le clic suivant tomberait dans un menu ouvert.
const parkMouse = page => { const size = page.viewportSize(); return page.mouse.move(size.width - 12, size.height - 12); };
async function load(page, html) {
  await page.evaluate(({ html }) => { GridEditor.setActive(false); Editor.setHTML(html); const box = document.getElementById('editor-container'); box.scrollTop = 0; box.scrollLeft = 0; }, { html });
  await page.waitForTimeout(500);
  await parkMouse(page);
}
const setA4 = (page, on) => page.evaluate((value) => { const t = document.getElementById('v2-toggle-a4-preview'); if (t && t.checked !== value) { t.checked = value; t.dispatchEvent(new Event('change', { bubbles: true })); } }, on).then(() => page.waitForTimeout(500));

async function runTheme(theme, size, tag) {
  const label = tag || (theme === 'dark' ? 'sombre' : 'clair');
  console.log(`\n=== Bandeaux d'un tableau de document à la souris, ${size.width}x${size.height}, ${tag ? 'panneau étroit' : 'thème ' + label} ===`);
  const { context, page } = await openWidget(theme, size);
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);
  const narrow = size.width < 500;

  for (const a4 of [true, false]) {
    const mode = a4 ? 'Aperçu A4' : 'page sans A4';
    await setA4(page, a4);
    await load(page, DOC);

    // ---------- 1) Hors d'un tableau : rien ----------
    await clickParagraph(page, 'Avant le tableau');
    const before = await flow(page);
    let s = await stripsState(page);
    check(`${label}, ${mode} - curseur hors du tableau : la page n'a aucun bandeau (rien de caché non plus)`, s.count === 0, { count: s.count });

    // ---------- 2) Dans une case : les bandeaux se posent ----------
    await clickCell(page, 'B2');
    s = await stripsState(page);
    check(`${label}, ${mode} - curseur dans B2 : trois lettres A B C et trois numéros 1 2 3, un coin, posés par-dessus la page (dans le body, hors du plan de travail qui défile), sans poignée de réglage`,
      s.shown && s.parent === 'BODY' && !s.inScrollBox && labelsOf(s.colHeads) === 'ABC' && labelsOf(s.rowHeads) === '123' && !!s.corner && s.colHeads.concat(s.rowHeads).every(h => h.handles === 0), { shown: s.shown, parent: s.parent, cols: labelsOf(s.colHeads), rows: labelsOf(s.rowHeads) });
    const bad = alignment(s);
    check(`${label}, ${mode} (feuille à l'échelle ${s.zoom.toFixed(2)}) - les lettres sont sur leurs colonnes, les numéros sur leurs lignes, le coin entre les deux (bords à 1,5 px près)`, bad.length === 0, bad);
    check(`${label}, ${mode} - la lettre fait ${Math.round(s.cols.height)} px de haut, le numéro ${Math.round(s.rowsStrip.width)} px de large : lisibles à l'échelle de l'écran quelle que soit celle de la feuille`,
      near(s.cols.height, 22, 1) && near(s.rowsStrip.width, 20, 1) && near(s.corner.width, 20, 1) && near(s.corner.height, 22, 1), { cols: s.cols, rows: s.rowsStrip });
    const after = await flow(page);
    check(`${label}, ${mode} - rien n'a bougé : le texte d'avant, le tableau et le texte d'après sont où ils étaient (à 0,6 px près)`, sameFlow(before, after), { before, after });
    check(`${label}, ${mode} - la lettre B, le numéro 2 et le coin sont allumés ou libres comme il faut : B et 2 allumés (case courante), A C 1 3 éteints`, litOf(s.colHeads) === '1' && litOf(s.rowHeads) === '1', { cols: litOf(s.colHeads), rows: litOf(s.rowHeads) });
    const readable = narrow ? s.colHeads.concat(s.rowHeads).every(h => insideBox(h, s.container) || visiblePart(h, s.container).w >= 14) : [s.corner, s.cols, s.rowsStrip].every(r => insideBox(r, s.container));
    check(`${label}, ${mode} - les bandeaux se lisent : ${narrow ? 'chaque lettre et chaque numéro garde au moins 14 px de large dans le plan de travail' : 'entiers dans le plan de travail'}`, readable, { container: s.container, rows: s.rowsStrip, cols: s.cols });
    const firstText = await page.evaluate(() => document.querySelector('.tiptap table td p').getBoundingClientRect().left);
    check(`${label}, ${mode} - les numéros ne recouvrent pas le texte de la première colonne (leur bord droit à ${Math.round(s.rowsStrip.right)} px, le texte à ${Math.round(firstText)} px)`, s.rowsStrip.right <= firstText + 0.5, { right: s.rowsStrip.right, text: firstText });
    const hits = [await hitsIt(page, COLHEAD(2)), await hitsIt(page, ROWHEAD(2)), await hitsIt(page, CORNER)];
    check(`${label}, ${mode} - un vrai pointeur sur la lettre B, sur le numéro 2 et sur le coin tombe sur eux, pas sur la page`, hits.every(Boolean), hits);
    const ratios = await page.evaluate(() => {
      const ratio = window.__ratio;
      const pick = sel => { const n = document.querySelector(sel); if (!n) return 0; const cs = getComputedStyle(n); return ratio(cs.color, cs.backgroundColor); };
      return { letter: pick('.pp-doc-strips .v2-grid-colhead:nth-child(1)'), lit: pick('.pp-doc-strips .v2-grid-colhead.sel'), number: pick('.pp-doc-strips .v2-grid-rowhead:nth-child(1)') };
    });
    check(`${label}, ${mode} - contrastes : lettre ${ratios.letter.toFixed(1)}, lettre allumée ${ratios.lit.toFixed(1)}, numéro ${ratios.number.toFixed(1)} (≥ 4,5:1)`, ratios.letter >= 4.5 && ratios.lit >= 4.5 && ratios.number >= 4.5, ratios);

    // ---------- 3) Cliquer les bandeaux ----------
    await realClick(page, COLHEAD(2));
    s = await stripsState(page);
    let texts = await selectedTexts(page);
    let focus = await page.evaluate(() => ({ editor: document.activeElement === EditorCore.getEditor().view.dom, bar: !!document.querySelector('.v2-floating-toolbar.v2-table-toolbar.visible') }));
    check(`${label}, ${mode} - un clic sur la lettre B choisit la colonne B (B1, B2, B3), l'éditeur garde le focus, la barre du tableau reste, les bandeaux aussi, la lettre B est allumée et les numéros 1 2 3 aussi`,
      texts.join() === 'B1,B2,B3' && focus.editor && focus.bar && s.shown && litOf(s.colHeads) === '1' && litOf(s.rowHeads) === '0,1,2', { texts, focus, cols: litOf(s.colHeads), rows: litOf(s.rowHeads) });
    await realClick(page, ROWHEAD(2));
    texts = await selectedTexts(page);
    s = await stripsState(page);
    check(`${label}, ${mode} - un clic sur le numéro 2 choisit la ligne 2 (A2, B2, C2), le numéro 2 et les lettres A B C sont allumés`, texts.join() === 'A2,B2,C2' && litOf(s.rowHeads) === '1' && litOf(s.colHeads) === '0,1,2', { texts, rows: litOf(s.rowHeads), cols: litOf(s.colHeads) });
    await page.keyboard.down('Shift');
    await realClick(page, ROWHEAD(3));
    await page.keyboard.up('Shift');
    texts = await selectedTexts(page);
    check(`${label}, ${mode} - Maj + clic sur le numéro 3 étend aux lignes 2 et 3 (six cases)`, texts.join() === 'A2,B2,C2,A3,B3,C3', texts);
    await realClick(page, COLHEAD(1));
    await page.keyboard.down('Shift');
    await realClick(page, COLHEAD(3));
    await page.keyboard.up('Shift');
    texts = await selectedTexts(page);
    check(`${label}, ${mode} - un clic sur la lettre A puis Maj + clic sur la lettre C choisit les trois colonnes (neuf cases)`, texts.length === 9, texts);
    await realClick(page, CORNER);
    texts = await selectedTexts(page);
    s = await stripsState(page);
    check(`${label}, ${mode} - un clic sur le coin choisit tout le tableau (neuf cases), toutes les lettres et tous les numéros s'allument`, texts.length === 9 && litOf(s.colHeads) === '0,1,2' && litOf(s.rowHeads) === '0,1,2', { count: texts.length, cols: litOf(s.colHeads), rows: litOf(s.rowHeads) });

    // ---------- 4) Quitter le tableau ----------
    await clickParagraph(page, 'Après le tableau');
    s = await stripsState(page);
    check(`${label}, ${mode} - le curseur sort du tableau (clic sous lui) : les bandeaux sont retirés de la page`, s.count === 0, { count: s.count });
    await clickCell(page, 'B1');
    s = await stripsState(page);
    check(`${label}, ${mode} - il revient dans B1 : les bandeaux reviennent, bien placés`, s.shown && alignment(s).length === 0, alignment(s));
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(250);
    s = await stripsState(page);
    check(`${label}, ${mode} - la flèche du haut, depuis la première ligne, sort du tableau et retire les bandeaux`, s.count === 0, { count: s.count });
  }
  await setA4(page, true);

  if (narrow) { await context.close(); return; }

  // ---------- 5) La barre du tableau ne recouvre pas les bandeaux ----------
  await load(page, LONG);
  await page.evaluate(() => { const box = document.getElementById('editor-container'); const t = document.querySelector('.tiptap table'); box.scrollTop += t.getBoundingClientRect().top - box.getBoundingClientRect().top - 150; });
  await page.waitForTimeout(300);
  await clickCell(page, 'B2');
  let s = await stripsState(page);
  let bar = await barRect(page);
  check(`${label} - la barre du tableau est affichée et ne recouvre ni les lettres, ni les numéros, ni le coin`, !!bar && s.shown && !overlap(bar, s.cols) && !overlap(bar, s.rowsStrip) && !overlap(bar, s.corner), { bar, cols: s.cols, rows: s.rowsStrip });
  check(`${label} - elle se pose AU-DESSUS des lettres, à ${bar ? Math.round(s.cols.top - bar.bottom) : '?'} px d'elles (8 px d'écart de départ)`, !!bar && bar.bottom <= s.cols.top + 0.5 && s.cols.top - bar.bottom <= 14, { bar, cols: s.cols });
  await realClick(page, COLHEAD(2));
  bar = await barRect(page);
  check(`${label} - un clic sur une lettre ne ferme pas la barre du tableau`, !!bar && (await selectedTexts(page)).join() === 'B1,B2,B3', { bar });
  await clickCell(page, 'B2');
  await realClick(page, `${BAR} button[data-action="row-after"]`);
  s = await stripsState(page);
  check(`${label} - « Ligne après » (vrai clic dans la barre) : le tableau a quatre lignes et les bandeaux quatre numéros, toujours calés sur leurs lignes`, s.tableRows.length === 4 && labelsOf(s.rowHeads) === '1234' && alignment(s).length === 0, { rows: labelsOf(s.rowHeads), bad: alignment(s) });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  s = await stripsState(page);
  check(`${label} - Ctrl+Z défait la ligne : trois numéros de nouveau`, s.tableRows.length === 3 && labelsOf(s.rowHeads) === '123' && alignment(s).length === 0, { rows: labelsOf(s.rowHeads) });

  // ---------- 6) Défilement ----------
  // La molette tourne dans la gouttière à gauche de la page : la barre du tableau (fixe, hors du plan de travail) ne reçoit pas la molette.
  const scrollTopOf = () => page.evaluate(() => document.getElementById('editor-container').scrollTop);
  const gutter = { x: 6, y: HEIGHT - 30 };
  const top0 = await scrollTopOf();
  await page.mouse.move(gutter.x, gutter.y);
  await page.mouse.wheel(0, 60);
  await page.waitForTimeout(350);
  const top1 = await scrollTopOf();
  s = await stripsState(page);
  check(`${label} - la molette de 60 px (la page a défilé de ${Math.round(top1 - top0)} px) : les bandeaux ont suivi le tableau (lettres, numéros et coin, à 1,5 px)`, top1 - top0 >= 40 && s.shown && alignment(s).length === 0, { moved: top1 - top0, bad: alignment(s) });
  check(`${label} - l'enveloppe des bandeaux est exactement le plan de travail : rien ne dépasse sur la barre d'outils`, s.root && near(s.root.left, s.container.left, 0.6) && near(s.root.top, s.container.top, 0.6) && near(s.root.right, s.container.right, 0.6) && near(s.root.bottom, s.container.bottom, 0.6), { root: s.root, container: s.container });
  // Le haut du tableau passe 30 px au-dessus du plan de travail : sa première ligne est sortie, les deux autres se voient encore.
  await page.evaluate(() => { const box = document.getElementById('editor-container'); const t = document.querySelector('.tiptap table'); box.scrollTop += t.getBoundingClientRect().top - box.getBoundingClientRect().top + 30; });
  await page.waitForTimeout(350);
  s = await stripsState(page);
  const above = await page.evaluate(() => {
    const box = document.getElementById('editor-container').getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + 120, box.top - 8);
    return { tag: hit ? hit.tagName : null, inStrips: !!hit && !!hit.closest('.pp-doc-strips') };
  });
  check(`${label} - le tableau sorti par le haut : les lettres sont rognées au bord du plan de travail (aucune ne dépasse sur la barre d'outils), les numéros des lignes encore à l'écran restent`,
    s.shown && s.cols.bottom <= s.container.top + 2 && !above.inStrips && s.rowHeads.some(h => visiblePart(h, s.container).h > 8), { cols: s.cols, container: s.container, above, rows: s.rowHeads.map(h => Math.round(h.top)) });
  await page.mouse.wheel(0, -2000);
  await page.waitForTimeout(350);
  s = await stripsState(page);
  check(`${label} - de retour en haut de la page, les bandeaux sont toujours sur le tableau`, s.shown ? alignment(s).length === 0 || s.table.top < s.container.top - 60 : false, alignment(s));

  // ---------- 7) Page agrandie : défilement horizontal ----------
  await page.evaluate(() => { const box = document.getElementById('editor-container'); const t = document.querySelector('.tiptap table'); box.scrollTop += t.getBoundingClientRect().top - box.getBoundingClientRect().top - 120; });
  for (let i = 0; i < 6 && (await stripsState(page)).zoom <= 1.1; i++) await realClick(page, '#pp-page-zoom-in');
  await page.waitForTimeout(500);
  await page.evaluate(() => { const box = document.getElementById('editor-container'); const t = document.querySelector('.tiptap table'); box.scrollTop += t.getBoundingClientRect().top - box.getBoundingClientRect().top - 120; });
  await clickCell(page, 'B2');
  s = await stripsState(page);
  check(`${label} - page à ${Math.round(s.zoom * 100)} % : les bandeaux sont calés sur le tableau agrandi (lettres et numéros à leurs colonnes et lignes) et gardent leur taille d'écran`, s.shown && s.zoom > 1 && alignment(s).length === 0 && near(s.cols.height, 22, 1), { zoom: s.zoom, bad: alignment(s) });
  await page.mouse.move(gutter.x, gutter.y);
  await page.mouse.wheel(90, 0);
  await page.waitForTimeout(350);
  s = await stripsState(page);
  const scrolled = await page.evaluate(() => document.getElementById('editor-container').scrollLeft);
  check(`${label} - défilement horizontal de ${Math.round(scrolled)} px : les bandeaux ont suivi`, scrolled > 0 && s.shown && alignment(s).length === 0, { scrolled, bad: alignment(s) });
  await realClick(page, '#pp-page-zoom-fit');
  await page.waitForTimeout(400);

  // ---------- 8) Deux tableaux : les bandeaux suivent le tableau actif ----------
  await load(page, TWO);
  await clickCell(page, 'TA1');
  s = await stripsState(page, 0);
  check(`${label} - tableau A (deux lettres, deux numéros) : bandeaux posés sur lui`, s.shown && labelsOf(s.colHeads) === 'AB' && labelsOf(s.rowHeads) === '12' && alignment(s).length === 0, { cols: labelsOf(s.colHeads), rows: labelsOf(s.rowHeads), bad: alignment(s) });
  await clickCell(page, 'UB3');
  s = await stripsState(page, 1);
  check(`${label} - un clic dans le tableau B (trois lettres, quatre numéros) : ils passent sur lui, il n'y en a qu'un jeu dans la page`, s.count === 1 && s.shown && labelsOf(s.colHeads) === 'ABC' && labelsOf(s.rowHeads) === '1234' && alignment(s).length === 0 && litOf(s.rowHeads) === '2', { count: s.count, cols: labelsOf(s.colHeads), rows: labelsOf(s.rowHeads), bad: alignment(s) });
  await clickParagraph(page, 'Après');
  s = await stripsState(page);
  check(`${label} - hors des deux tableaux : plus aucun bandeau`, s.count === 0, { count: s.count });

  // ---------- 9) Pas de bandeaux là où la place manque ----------
  await load(page, NESTED);
  await clickCell(page, 'N1');
  s = await stripsState(page);
  check(`${label} - curseur dans un tableau posé DANS une case : aucun bandeau`, s.count === 0, { count: s.count });
  await clickCell(page, 'Voisine');
  s = await stripsState(page);
  check(`${label} - curseur dans la case voisine du tableau extérieur : ses bandeaux (deux lettres, un numéro)`, s.shown && labelsOf(s.colHeads) === 'AB' && labelsOf(s.rowHeads) === '1', { cols: labelsOf(s.colHeads), rows: labelsOf(s.rowHeads) });
  await load(page, '<p>Début</p>');
  await clickParagraph(page, 'Début');
  await page.evaluate(() => { document.getElementById('v2-btn-two-columns').click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const p = document.querySelector('.tiptap .two-columns-column p'); EditorCore.getEditor().chain().focus().setTextSelection(EditorCore.getEditor().view.posAtDOM(p, 0)).run(); document.getElementById('v2-btn-table').click(); });
  await page.waitForTimeout(500);
  const inColumn = await page.evaluate(() => !!document.querySelector('.tiptap .two-columns-column table'));
  s = await stripsState(page);
  check(`${label} - curseur dans un tableau posé dans une colonne : aucun bandeau`, inColumn && s.count === 0, { inColumn, count: s.count });

  // ---------- 10) Le suivi des modifications les laisse, et choisir ne modifie rien ----------
  await load(page, DOC);
  await page.evaluate(() => Editor.setTrackChanges(true));
  await clickCell(page, 'B2');
  const htmlBefore = await page.evaluate(() => Editor.getHTML());
  await realClick(page, COLHEAD(3));
  s = await stripsState(page);
  const tracked = await page.evaluate(() => ({ html: Editor.getHTML(), pending: TrackChanges.hasPendingSuggestions(EditorCore.getEditor().state) }));
  check(`${label} - suivi des modifications allumé : les bandeaux sont là, la lettre C choisit sa colonne et rien n'est modifié (aucune suggestion, même HTML)`, s.shown && (await selectedTexts(page)).join() === 'C1,C2,C3' && tracked.html === htmlBefore && !tracked.pending, { pending: tracked.pending });
  await page.evaluate(() => Editor.setTrackChanges(false));

  // ---------- 11) Lecture ----------
  await load(page, DOC);
  await clickCell(page, 'B2');
  await realClick(page, '#btn-mode-read');
  await page.waitForTimeout(400);
  s = await stripsState(page);
  check(`${label} - en Lecture : aucun bandeau à l'écran`, !s.shown, { count: s.count, shown: s.shown });
  await realClick(page, '#btn-mode-edit');
  await page.waitForTimeout(400);
  await clickCell(page, 'B2');
  s = await stripsState(page);
  check(`${label} - de retour en Édition : un clic dans la case et les bandeaux reviennent`, s.shown && alignment(s).length === 0, alignment(s));

  // ---------- 12) Une grille a les siens ----------
  async function freshModel(entryId, ready) {
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
    if (discard) { await page.mouse.move(discard.x - 10, discard.y, { steps: 2 }); await page.mouse.click(discard.x, discard.y); }
    await page.waitForFunction(ready, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.mouse.move(WIDTH - 10, HEIGHT - 10);
  }
  await freshModel('v2-btn-new-grid', () => GridEditor.isActive() && document.querySelectorAll('#editor-container .v2-grid-colhead').length > 0);
  await clickCell(page, '').catch(() => {});
  await page.mouse.click(300, 250);
  await page.waitForTimeout(300);
  const grid = await page.evaluate(() => ({
    active: GridEditor.isActive(), doc: document.querySelectorAll('.pp-doc-strips').length,
    own: document.querySelectorAll('#editor-container .v2-grid-colhead').length + 'x' + document.querySelectorAll('#editor-container .v2-grid-rowhead').length,
  }));
  check(`${label} - dans une grille : ses propres bandeaux (6 lettres, 15 numéros) et aucun jeu de document`, grid.active && grid.doc === 0 && grid.own === '6x15', grid);
  await freshModel('v2-btn-new-document', () => !GridEditor.isActive());
  await load(page, DOC);
  await clickCell(page, 'B2');
  s = await stripsState(page);
  check(`${label} - de retour dans un document : un clic dans le tableau et les bandeaux reviennent`, s.shown && alignment(s).length === 0 && s.count === 1, { count: s.count, bad: alignment(s) });

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
