#!/usr/bin/env node
// Un tableau posé dans une colonne de zone à deux colonnes, à la VRAIE souris et au VRAI clavier, à la taille du panneau Grist d'Antoine (~700x400), Aperçu A4 :
//  - le trait de séparation de la zone glissé vers la gauche (poignée .two-columns-resize-grip, mousedown / mousemove / mouseup) : au lâcher la colonne est plus
//    étroite et le tableau qui s'y trouve est ramené dans sa colonne, colonnes au prorata - il ne passe plus sur le texte de l'autre colonne ;
//  - Ctrl+Z (vraie touche) : UNE seule étape rend à la fois la séparation d'avant et les largeurs d'avant du tableau (la correction des largeurs est rangée dans
//    l'événement du glisser, js/editor.js:dispatchColumnWidthFix), Ctrl+Y les reprend ensemble ;
//  - une bordure de colonne du tableau glissée bien au-delà de sa colonne : au lâcher le tableau est ramené dans la colonne (il l'était dans la page seulement), et un
//    Ctrl+Z défait le glissement ET le recalcul d'un coup ;
//  - le tableau de la colonne de droite, plus étroite encore, ne sort pas de la page.
// Lancé par run-headless.mjs (groupe Node "zoneTableMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-zone-table-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.ZONE_TABLE_PORT || 8903);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-access-rights-mouse.mjs.
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-zone-table-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
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
// Aperçu A4, le réglage d'Antoine : c'est lui qui déclenche aussi la correction de largeur des tableaux trop larges pour la page.
await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Laisse le temps à onUpdate de rejouer ses corrections, qui passent par des transactions supplémentaires : un état lu trop tôt cacherait la boucle.
const settle = () => sleep(700);


const state = () => page.evaluate(() => {
  const root = document.querySelector('.tiptap');
  const zoom = EditorCore.layoutZoom(root);
  const columns = Array.from(root.querySelectorAll('.two-columns-column'));
  const textOf = c => { const cs = getComputedStyle(c); return c.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0); };
  const tables = columns.map(c => c.querySelector('table')).map(t => (t ? {
    cols: Array.from(t.querySelectorAll(':scope > colgroup > col')).map(col => Math.round(col.getBoundingClientRect().width / zoom * 10) / 10),
    width: Math.round(t.getBoundingClientRect().width / zoom * 10) / 10,
    right: Math.round(t.getBoundingClientRect().right / zoom * 10) / 10,
  } : null));
  const zoneMatch = Editor.getHTML().match(/--layout-left: (\d+)%/);
  return {
    split: zoneMatch ? Number(zoneMatch[1]) : null,
    columnText: columns.map(textOf).map(w => Math.round(w * 10) / 10),
    columnRight: columns.map(c => Math.round(c.getBoundingClientRect().right / zoom * 10) / 10),
    pageRight: Math.round((root.getBoundingClientRect().left / zoom) + root.clientWidth * 1 - (parseFloat(getComputedStyle(root).paddingRight) || 0)),
    tables,
    html: Editor.getHTML(),
  };
});
// Le modèle posé, puis un clic dans son premier paragraphe : le clavier est dans le texte, comme chez quelqu'un qui écrivait avant de toucher à la zone.
async function loadDoc(html) {
  await page.evaluate(h => Editor.setHTML(h), html);
  await settle();
  await page.click('.tiptap p >> nth=0');
  await sleep(200);
}
async function undo() { await page.keyboard.press('Control+z'); await settle(); }
async function redo() { await page.keyboard.press('Control+y'); await settle(); }
const tableHtml = (widths, label) => {
  const colgroup = '<colgroup>' + widths.map(w => `<col style="width: ${w}px;">`).join('') + '</colgroup>';
  const row = r => '<tr>' + widths.map((w, c) => `<td colspan="1" rowspan="1" colwidth="${w}"><p>${label}${r}${'ABC'[c]}</p></td>`).join('') + '</tr>';
  return `<table style="width: ${widths.reduce((s, w) => s + w, 0)}px;">${colgroup}<tbody>${row(1)}${row(2)}</tbody></table>`;
};
const zoneHtml = (split, left, right) => `<div class="two-columns-zone" style="--layout-left: ${split}%"><div class="two-columns-column">${left}</div><div class="two-columns-column">${right}</div></div>`;
const near = (a, b, tol) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= tol);
const sum = a => a.reduce((s, x) => s + x, 0);
const proportional = (cols, widths) => near(cols.map(c => c / sum(cols)), widths.map(w => w / sum(widths)), 0.02);

// 1) Le trait de séparation glissé : le tableau de la colonne gauche suit la colonne.
const WIDTHS = [110, 110, 110];
await loadDoc('<p>Avant</p>' + zoneHtml(50, tableHtml(WIDTHS, 'L'), '<p>Texte à côté</p>') + '<p>Après</p>');
const laid = await state();
check('tableau de 330 px dans la colonne gauche d\'une zone à 50 % : il tient, il n\'a pas bougé', laid.split === 50 && near(laid.tables[0].cols, WIDTHS, 0.5), laid);

const zone = await page.evaluate(() => {
  const r = document.querySelector('.tiptap .two-columns-zone-outer').getBoundingClientRect();
  const g = document.querySelector('.tiptap .two-columns-resize-grip').getBoundingClientRect();
  return { left: r.left, width: r.width, gripX: g.left + g.width / 2, gripY: g.top + g.height / 2 };
});
await page.mouse.move(zone.gripX - 40, zone.gripY);
await page.mouse.move(zone.gripX, zone.gripY, { steps: 4 });
await sleep(200);
await page.mouse.down();
await page.mouse.move(zone.left + zone.width * 0.3, zone.gripY, { steps: 10 });
await page.mouse.up();
await settle();
const narrowed = await state();
check('séparation glissée à ~30 % à la vraie souris : la zone est à 30 %', narrowed.split >= 28 && narrowed.split <= 32, narrowed.split);
check('le tableau est ramené dans sa colonne (largeur <= texte de la colonne + 3), colonnes au prorata',
  narrowed.tables[0].width <= narrowed.columnText[0] + 3 && narrowed.tables[0].cols.length === 3 && proportional(narrowed.tables[0].cols, WIDTHS), { narrowed: narrowed.tables[0], column: narrowed.columnText[0] });
check('il ne passe plus sur la colonne de droite (son bord droit est avant le bord de sa colonne)', narrowed.tables[0].right <= narrowed.columnRight[0] + 1, { table: narrowed.tables[0].right, column: narrowed.columnRight[0] });

await undo();
const undone = await state();
check('Ctrl+Z (vraie touche), UNE étape : la séparation et les largeurs du tableau redeviennent exactement celles d\'avant', undone.html === laid.html && undone.split === 50, { avant: laid.split, apres: undone.split, cols: undone.tables[0].cols });
await redo();
const redone = await state();
check('Ctrl+Y (vraie touche), UNE étape : la séparation et les largeurs reviennent ensemble', redone.html === narrowed.html, { attendu: narrowed.split, obtenu: redone.split, cols: redone.tables[0].cols });

// 2) Une bordure de colonne du tableau glissée bien au-delà de sa colonne : au lâcher, il est ramené dans la colonne.
await loadDoc('<p>Avant</p>' + zoneHtml(50, tableHtml(WIDTHS, 'L'), '<p>Texte à côté</p>') + '<p>Après</p>');
const before = await state();
const border = await page.evaluate(() => {
  const r = document.querySelector('.tiptap .two-columns-column table td').getBoundingClientRect();
  return { x: r.right - 1, y: r.top + r.height / 2 };
});
await page.mouse.move(border.x - 30, border.y);
await page.mouse.move(border.x, border.y, { steps: 4 });
await sleep(200);
const handleShown = await page.evaluate(() => !!document.querySelector('.column-resize-handle'));
await page.mouse.down();
await page.mouse.move(border.x + 220, border.y, { steps: 10 });
await page.mouse.up();
await settle();
const dragged = await state();
check('bordure glissée de ~220 px vers la droite : la poignée de redimensionnement s\'est montrée',  handleShown, handleShown);
check('au lâcher, le tableau est ramené dans sa colonne (pas dans la page seulement)', dragged.tables[0].width <= dragged.columnText[0] + 3 && dragged.tables[0].width > before.tables[0].width - 3, { dragged: dragged.tables[0], column: dragged.columnText[0], avant: before.tables[0] });
check('la colonne glissée est restée la plus large des trois', dragged.tables[0].cols[0] > dragged.tables[0].cols[1] && dragged.tables[0].cols[0] > dragged.tables[0].cols[2], dragged.tables[0].cols);
await undo();
const dragUndone = await state();
check('Ctrl+Z (vraie touche), UNE étape : le glissement et le recalcul sont défaits ensemble', dragUndone.html === before.html, { avant: before.tables[0].cols, apres: dragUndone.tables[0].cols });

// 3) La colonne de droite, plus étroite (zone à 70 %) : un tableau trop large n'en sort pas, ni de la page.
await loadDoc('<p>Avant</p>' + zoneHtml(70, '<p>Texte à côté</p>', tableHtml([120, 120, 120], 'R')) + '<p>Après</p>');
const right = await state();
check('colonne de droite à 30 % de la zone, tableau de 360 px : ramené dans sa colonne, bord droit dans la page', right.tables[1].width <= right.columnText[1] + 3 && right.tables[1].right <= right.pageRight + 1 && proportional(right.tables[1].cols, [120, 120, 120]), { table: right.tables[1], column: right.columnText[1], page: right.pageRight });
await undo();
const rightUndone = await state();
check('Ctrl+Z après le chargement d\'un modèle : la correction des largeurs n\'est pas un événement à défaire seul (le tableau ne redevient pas large)', rightUndone.tables[1] === null || rightUndone.tables[1].width <= rightUndone.columnText[1] + 3, rightUndone.tables[1]);

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
