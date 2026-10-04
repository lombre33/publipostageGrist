#!/usr/bin/env node
// Annuler / Rétablir au VRAI clavier (Ctrl+Z, Ctrl+Y via page.keyboard) sur un tableau qui a des largeurs de colonnes, à la taille du panneau Grist d'Antoine
// (~700x400), avec la vraie souris pour tout le reste (bouton Tableau de la barre, glisser d'une bordure de colonne, boutons de la barre flottante du tableau).
// Bug corrigé (29/09) : dès qu'un tableau avait une largeur explicite sur ses colonnes (bordure glissée une fois, ou modèle enregistré avec ses largeurs),
// js/editor.js ajoutait, après chaque ajout de colonne ou glissement de bordure, une transaction de correction de largeurs qui formait son PROPRE événement
// d'historique : Ctrl+Z défaisait cette correction, onUpdate la rejouait aussitôt, et l'ajout de la colonne ne pouvait plus jamais être annulé. Aucun test ne
// le voyait : les scénarios de dev-tests/scenarios-tables.js appellent la commande ou dispatchent l'événement, jamais la touche.
// Lancé par run-headless.mjs (groupe Node "tableUndoKeyboard", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-table-undo-keyboard.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TABLE_UNDO_PORT || 8899);
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
if (!OFFLINE) console.log('[verify-table-undo-keyboard] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

const tableState = () => page.evaluate(() => {
  const first = document.querySelector('.tiptap table tr');
  return {
    cols: first ? first.children.length : null,
    widths: first ? Array.from(first.children).map(c => c.getAttribute('colwidth') || '-') : null,
    html: Editor.getHTML(),
  };
});
async function loadDoc(html) {
  await page.evaluate(h => Editor.setHTML(h), html);
  await settle();
}
// Bouton de la barre flottante du tableau : apparaît quand le curseur est dans une cellule (page.click = vraie souris, vérifie que le bouton reçoit le clic).
async function clickInFirstCell() {
  await page.click('.tiptap table td >> nth=0');
  await sleep(300);
}
async function clickTableAction(action) {
  await page.click(`.v2-floating-toolbar.visible button[data-action="${action}"]`);
  await settle();
}
async function undo() { await page.keyboard.press('Control+z'); await settle(); }
async function redo() { await page.keyboard.press('Control+y'); await settle(); }
const hasWidth = widths => !!widths && widths.every(w => w !== '-');

// 1) Parcours complet à la vraie souris : tableau inséré par le bouton de la barre, une bordure glissée (les colonnes reçoivent une largeur), une colonne ajoutée.
await loadDoc('<p>Avant</p>');
await page.click('.tiptap p >> nth=0');
await page.keyboard.press('Control+End');
await page.click('#v2-btn-table');
await settle();
const inserted = await tableState();
check('tableau inséré par le bouton de la barre : 2 colonnes, encore sans largeur (auto)', inserted.cols === 2 && inserted.widths.every(w => w === '-'), inserted);

const border = await page.evaluate(() => {
  const r = document.querySelector('.tiptap table td, .tiptap table th').getBoundingClientRect();
  return { x: r.right - 1, y: r.top + r.height / 2 };
});
await page.mouse.move(border.x - 30, border.y);
await page.mouse.move(border.x, border.y, { steps: 4 });
await sleep(200);
const handleShown = await page.evaluate(() => !!document.querySelector('.column-resize-handle'));
await page.mouse.down();
await page.mouse.move(border.x - 40, border.y, { steps: 6 });
await page.mouse.up();
await settle();
const dragged = await tableState();
check('bordure glissée à la vraie souris : chaque colonne a maintenant une largeur', handleShown && dragged.cols === 2 && hasWidth(dragged.widths), { handleShown, ...dragged });

await clickInFirstCell();
await clickTableAction('col-after');
const added = await tableState();
check('colonne ajoutée par la barre du tableau : 3 colonnes, toutes avec une largeur (la nouvelle aussi)', added.cols === 3 && hasWidth(added.widths), added);

await undo();
const undone1 = await tableState();
check('Ctrl+Z (vraie touche) : la colonne ajoutée disparaît, le tableau redevient exactement celui d\'avant', undone1.cols === 2 && undone1.html === dragged.html, { avant: dragged, apres: undone1 });

await undo();
const undone2 = await tableState();
check('2e Ctrl+Z : le glissement de bordure est défait, les colonnes redeviennent automatiques', undone2.cols === 2 && undone2.widths.every(w => w === '-') && undone2.html === inserted.html, { avant: inserted, apres: undone2 });

await redo();
const redone1 = await tableState();
check('Ctrl+Y (vraie touche) : la bordure retrouve sa largeur', redone1.html === dragged.html, { attendu: dragged, obtenu: redone1 });
await redo();
const redone2 = await tableState();
check('2e Ctrl+Y : la colonne réapparaît avec ses largeurs', redone2.html === added.html, { attendu: added, obtenu: redone2 });

// 2) Modèle enregistré avec les largeurs de ses colonnes (le cas courant d'un vrai document) : du texte tapé, puis une colonne ajoutée AVANT la première.
// Un Ctrl+Z ne défait que l'ajout, le suivant que le texte : la correction de largeur ne mange pas l'événement voisin.
const seed = '<p>Avant</p><table><tbody><tr><td colwidth="200"><p>a</p></td><td colwidth="200"><p>b</p></td></tr>'
  + '<tr><td colwidth="200"><p>c</p></td><td colwidth="200"><p>d</p></td></tr></tbody></table><p>Après</p>';
await loadDoc(seed);
const seeded = await tableState();
check('modèle chargé avec des largeurs : 2 colonnes de 200', seeded.cols === 2 && seeded.widths.join() === '200,200', seeded);
await clickInFirstCell();
await page.keyboard.type('X');
await sleep(800);
const typed = await tableState();
await clickTableAction('col-before');
const withColumn = await tableState();
check('modèle à largeurs : colonne ajoutée avant la première, toutes les colonnes gardent une largeur', withColumn.cols === 3 && hasWidth(withColumn.widths), withColumn);
await undo();
const modelUndo1 = await tableState();
check('modèle à largeurs, Ctrl+Z : la colonne ajoutée disparaît, le texte tapé avant reste', modelUndo1.cols === 2 && modelUndo1.html === typed.html && /X/.test(modelUndo1.html), { attendu: typed, obtenu: modelUndo1 });
await undo();
const modelUndo2 = await tableState();
check('modèle à largeurs, 2e Ctrl+Z : le texte tapé disparaît, retour au modèle chargé', modelUndo2.cols === 2 && modelUndo2.html === seeded.html, { attendu: seeded, obtenu: modelUndo2 });
await redo(); await redo();
const modelRedo = await tableState();
check('modèle à largeurs, 2 × Ctrl+Y : texte puis colonne reviennent', modelRedo.html === withColumn.html, { attendu: withColumn, obtenu: modelRedo });

// 3) Tableau presque aussi large que la page : la colonne ajoutée le fait déborder, une 2e correction le ramène dans la page (elle aussi dans le même Ctrl+Z).
const contentWidth = await page.evaluate(() => EditorCore.editorContentWidthPx(EditorCore.getEditor()));
const half = Math.floor((contentWidth - 8) / 2);
const wide = `<p>Avant</p><table><tbody><tr><td colwidth="${half}"><p>a</p></td><td colwidth="${half}"><p>b</p></td></tr>`
  + `<tr><td colwidth="${half}"><p>c</p></td><td colwidth="${half}"><p>d</p></td></tr></tbody></table><p>Après</p>`;
await loadDoc(wide);
const wideSeed = await tableState();
await clickInFirstCell();
await clickTableAction('col-after');
const wideAdded = await tableState();
const wideSum = (wideAdded.widths || []).reduce((s, w) => s + (Number(w) || 0), 0);
check('tableau presque aussi large que la page : la colonne ajoutée est ramenée dans la page (largeur totale <= zone de texte)',
  wideAdded.cols === 3 && hasWidth(wideAdded.widths) && wideSum <= contentWidth + 3 && Number(wideAdded.widths[0]) < half, { contentWidth, half, wideSum, seed: wideSeed.widths, added: wideAdded.widths });
await undo();
const wideUndone = await tableState();
check('tableau large, Ctrl+Z : une seule frappe défait l\'ajout et le recalcul des largeurs', wideUndone.cols === 2 && wideUndone.html === wideSeed.html, { attendu: wideSeed, obtenu: wideUndone });

// 4) Non-régression : un tableau resté automatique (jamais redimensionné) s'annulait déjà, il doit continuer.
await loadDoc('<p>Avant</p>');
await page.click('.tiptap p >> nth=0');
await page.keyboard.press('Control+End');
await page.click('#v2-btn-table');
await settle();
const auto = await tableState();
await clickInFirstCell();
await clickTableAction('col-after');
const autoAdded = await tableState();
await undo();
const autoUndone = await tableState();
check('tableau resté automatique : colonne ajoutée puis Ctrl+Z, retour exact au tableau d\'avant', autoAdded.cols === 3 && autoUndone.cols === 2 && autoUndone.html === auto.html, { auto, autoAdded, autoUndone });

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
