#!/usr/bin/env node
// La liste « # » (choix d'une colonne) ouverte dans une case de la grille, à la VRAIE souris et au VRAI clavier (page.mouse, page.keyboard, Node/Playwright), à la taille du panneau Grist
// (~700x400) (retour d'Antoine du 09/10 : « quand on est en mode grille et que l'on est dans le menu de variable #, et que l'on utilise flèche haut et bas, au lieu de naviguer dans la liste des
// colonnes, ça bouge de ligne dans la grille » ; « les flèches restent dans la liste tant qu'elle n'est pas fermée »). Une page.evaluate n'envoie ni vraie touche ni vrai survol : c'est ici
// qu'on s'assure que, liste ouverte dans une case de la grille (ou d'un tableau du document),
//   - ↑ et ↓ (Maj comprise) parcourent la liste, qui boucle, et le curseur ne quitte pas sa case : aucune case voisine n'est atteinte ni sélectionnée ;
//   - Entrée et Tab posent la colonne en surbrillance dans CETTE case (Tab ne passe plus à la case suivante), Échap ferme la liste sans bouger le curseur ;
//   - hors liste (jamais ouverte, fermée par Échap, ou « #zzzz » qu'aucune colonne ne porte : rien n'est affiché) les flèches font leur travail de grille comme avant ;
//   - la souris choisit toujours une ligne de la liste.
// Lancé par run-headless.mjs (groupe Node « gridHashMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-grid-hash-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.GRID_HASH_PORT || 8991);
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
if (!OFFLINE) console.log('[verify-grid-hash-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Le centre de la case LOGIQUE (ligne r, colonne c, depuis 1).
const gridPoint = (page, r, c) => page.evaluate(([row, col]) => {
  const colEl = document.querySelectorAll('.tiptap table > colgroup > col')[col - 1];
  const rowEl = document.querySelectorAll('.tiptap table > tbody > tr')[row - 1];
  if (!colEl || !rowEl) return null;
  const a = colEl.getBoundingClientRect(), b = rowEl.getBoundingClientRect();
  return { x: a.left + a.width / 2, y: b.top + b.height / 2 };
}, [r, c]);

// Un vrai clic au centre de la case (la souris y arrive en deux pas, survol compris).
async function clickGrid(page, r, c) {
  const p = await gridPoint(page, r, c);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
}

async function loadGrid(page, html, gridMode = true) {
  await page.evaluate(([h, grid]) => {
    GridEditor.setActive(false);
    Editor.setHTML(h);
    if (grid) GridEditor.setActive(true);
    const box = document.getElementById('editor-container');
    box.scrollTop = 0; box.scrollLeft = 0;
  }, [html, gridMode]);
  await page.waitForTimeout(500);
}
// Une grille aux dimensions connues : `widths` (px, par colonne), `heights` (px, par ligne), `text(r, c)` le texte de chaque case.
const gridHtml = (widths, heights, text) => `<table style="width: ${widths.reduce((s, w) => s + w, 0)}px;"><colgroup>${widths.map(w => `<col style="width: ${w}px;">`).join('')}</colgroup><tbody>`
  + heights.map((h, r) => `<tr data-row-height="${h}" style="height: ${h}px">${widths.map((w, c) => `<td colwidth="${w}"><p>${text(r + 1, c + 1)}</p></td>`).join('')}</tr>`).join('') + '</tbody></table>';

// « + » puis « Nouvelle grille » à la vraie souris : une vraie grille de 15 lignes et 6 colonnes vides. Une grille modifiée et pas enregistrée ouvre d'abord « Modifications non
// enregistrées » : on clique « Abandonner ».
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

// Où est le curseur : la ligne et la colonne (depuis 1) de sa case, le texte de la case, et si la sélection est un simple curseur de texte (pas une sélection de cases).
const where = page => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  const sel = ed.state.selection;
  const node = ed.view.domAtPos(sel.$head.pos).node;
  const el = node && node.nodeType === 1 ? node : node && node.parentElement;
  const td = el && el.closest('td, th');
  if (!td) return { row: null, col: null, text: null, caret: sel.empty };
  const tr = td.parentElement;
  return { row: Array.from(tr.parentElement.children).indexOf(tr) + 1, col: Array.from(tr.children).indexOf(td) + 1, text: td.textContent, caret: sel.empty && sel.$anchor.pos === sel.$head.pos };
});
const cellIs = (got, row, col, text) => !!got && got.row === row && got.col === col && got.caret === true && (text === undefined || got.text === text);
// Les cases que la sélection de cases surligne (« ligne,colonne » depuis 1) : aucune quand le curseur est un simple curseur de texte.
const selectedAt = page => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.tiptap table > tbody > tr').forEach((tr, r) => Array.from(tr.children).forEach((td, c) => { if (td.classList.contains('selectedCell')) out.push(`${r + 1},${c + 1}`); }));
  return out;
});
// Les bulles de variable du document, avec la case qui les porte.
const badges = page => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  const out = [];
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'varBadge') return;
    const dom = ed.view.nodeDOM(pos);
    const td = dom && dom.closest ? dom.closest('td, th') : null;
    const tr = td && td.parentElement;
    out.push({ column: node.attrs.column, row: tr ? Array.from(tr.parentElement.children).indexOf(tr) + 1 : null, col: tr ? Array.from(tr.children).indexOf(td) + 1 : null });
  });
  return out;
});
const rowCount = page => page.evaluate(() => document.querySelectorAll('.tiptap table > tbody > tr').length);

// La liste « # » : affichée ou non, ses lignes, celle qui est choisie, et où elle est.
const listState = page => page.evaluate(() => {
  const box = document.getElementById('autocomplete-box');
  const rows = box ? Array.from(box.querySelectorAll('.ac-items .ac-item')) : [];
  const r = box ? box.getBoundingClientRect() : null;
  const selected = rows.findIndex(row => row.classList.contains('selected'));
  return {
    shown: !!box && getComputedStyle(box).display !== 'none' && r.width > 0 && r.height > 0,
    n: rows.length, selected, selectedText: selected >= 0 ? rows[selected].textContent : null,
    inside: !!r && r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
    rect: r ? { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) } : null,
  };
});
// Un vrai clic dans la case puis la vraie frappe de « # » (et de ce qui suit) : la liste s'ouvre.
async function typeHash(page, r, c, text = '#') {
  await clickGrid(page, r, c);
  await page.keyboard.type(text);
  await page.waitForTimeout(300);
}
async function press(page, key) {
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
}
const columnOf = shown => (shown || '').split('.').pop();

const { context, page } = await openWidget('light');
await page.evaluate(async () => {
  const stub = window.__gristStub;
  const record = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200, Echeance: 631152000, Actif: true };
  stub.setVariables('CsDossiers', { Titre: 'Text', Statut: 'Text', Montant: 'Numeric', Echeance: 'Date', Actif: 'Bool' });
  stub.setRows('CsDossiers', [record]);
  await GristAPI.refreshSchema();
  stub.fireRecord(record, 'CsDossiers');
});
console.log(`\n=== Liste « # » dans une case de la grille, à la vraie souris et au vrai clavier, ${WIDTH}x${HEIGHT} ===`);

// ---------- 1) ↑ et ↓ restent dans la liste ----------
await freshGrid(page);
check('une grille neuve a ses cases vides (15 lignes, 6 colonnes)', (await rowCount(page)) === 15, await rowCount(page));
await typeHash(page, 2, 2);
let list = await listState(page);
check('« # » tapé dans la case vide (ligne 2, colonne 2) : la liste des 5 colonnes s\'affiche dans le panneau, la première est choisie',
  list.shown && list.n === 5 && list.selected === 0 && list.inside && cellIs(await where(page), 2, 2, '#'), { list, at: await where(page) });
await press(page, 'ArrowDown');
list = await listState(page);
let at = await where(page);
check('↓ : la 2e colonne est choisie, la liste reste ouverte et le curseur reste dans la même case (ligne 2, colonne 2)', list.shown && list.selected === 1 && cellIs(at, 2, 2, '#'), { list, at });
for (let i = 0; i < 3; i++) await press(page, 'ArrowDown');
list = await listState(page);
at = await where(page);
check('↓ trois fois de plus : la dernière colonne est choisie, le curseur n\'a pas quitté la case', list.shown && list.selected === 4 && cellIs(at, 2, 2, '#'), { list, at });
await press(page, 'ArrowDown');
list = await listState(page);
at = await where(page);
check('↓ sur la dernière colonne : la liste reboucle sur la première, le curseur reste dans la case', list.shown && list.selected === 0 && cellIs(at, 2, 2, '#'), { list, at });
await press(page, 'ArrowUp');
list = await listState(page);
at = await where(page);
check('↑ sur la première colonne : la liste reboucle sur la dernière, le curseur reste dans la case', list.shown && list.selected === 4 && cellIs(at, 2, 2, '#'), { list, at });
await press(page, 'ArrowUp');
list = await listState(page);
at = await where(page);
check('↑ : l\'avant-dernière colonne est choisie, la liste reste ouverte et le curseur dans la case', list.shown && list.selected === 3 && cellIs(at, 2, 2, '#'), { list, at });
await press(page, 'Shift+ArrowDown');
list = await listState(page);
at = await where(page);
check('Maj + ↓ avance aussi dans la liste : aucune case n\'est sélectionnée, le curseur reste un simple curseur dans la case', list.shown && list.selected === 4 && (await selectedAt(page)).length === 0 && cellIs(at, 2, 2, '#'), { list, selected: await selectedAt(page), at });
const wanted = columnOf(list.selectedText);
await press(page, 'Enter');
await page.waitForTimeout(250);
let made = await badges(page);
check('Entrée pose la colonne en surbrillance dans cette case (ligne 2, colonne 2) : une seule bulle, le « # » a disparu, la liste est fermée, la grille a toujours ses 15 lignes',
  made.length === 1 && made[0].column === wanted && made[0].row === 2 && made[0].col === 2 && !(await listState(page)).shown && (await rowCount(page)) === 15 && (await where(page)).text !== '#', { wanted, made, list: await listState(page), rows: await rowCount(page) });

// ---------- 2) Tab choisit, Échap ferme ----------
await typeHash(page, 3, 3);
await press(page, 'ArrowDown');
list = await listState(page);
check('« # » dans une autre case (ligne 3, colonne 3), ↓ : la 2e colonne est choisie, le curseur reste dans la case', list.shown && list.selected === 1 && cellIs(await where(page), 3, 3, '#'), { list, at: await where(page) });
const second = columnOf(list.selectedText);
await press(page, 'Tab');
await page.waitForTimeout(250);
made = await badges(page);
check('Tab pose la colonne en surbrillance dans cette case (ligne 3, colonne 3) au lieu de passer à la case suivante, la liste se ferme',
  made.length === 2 && made.some(b => b.column === second && b.row === 3 && b.col === 3) && !(await listState(page)).shown && (await where(page)).row === 3 && (await where(page)).col === 3, { second, made, at: await where(page) });

await typeHash(page, 4, 3);
await press(page, 'ArrowDown');
await press(page, 'Escape');
list = await listState(page);
at = await where(page);
check('Échap ferme la liste : le « # » reste dans la case (ligne 4, colonne 3) et le curseur n\'a pas bougé', !list.shown && cellIs(at, 4, 3, '#') && (await badges(page)).length === 2, { list, at });
await press(page, 'ArrowDown');
at = await where(page);
check('liste fermée, ↓ redescend dans la grille comme avant : le curseur passe à la case du dessous (ligne 5, colonne 3)', cellIs(at, 5, 3), at);

// ---------- 3) La souris choisit toujours ----------
await typeHash(page, 2, 4);
list = await listState(page);
const third = await page.evaluate(() => { const r = document.querySelectorAll('#autocomplete-box .ac-items .ac-item')[2].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: document.querySelectorAll('#autocomplete-box .ac-items .ac-item')[2].textContent }; });
check('« # » dans la case (ligne 2, colonne 4) : la liste est ouverte', list.shown && list.n === 5 && cellIs(await where(page), 2, 4, '#'), { list, at: await where(page) });
await page.mouse.move(third.x - 8, third.y, { steps: 2 });
await page.mouse.move(third.x, third.y, { steps: 3 });
await page.mouse.click(third.x, third.y);
await page.waitForTimeout(300);
made = await badges(page);
check('la souris sur la 3e ligne de la liste pose cette colonne dans la case (ligne 2, colonne 4)', made.some(b => b.column === columnOf(third.text) && b.row === 2 && b.col === 4) && !(await listState(page)).shown, { third, made });

// ---------- 4) Hors liste, la grille garde ses flèches ----------
const NAMES = (r, c) => `${'ABCDEFGH'[c - 1]}${r}`;
await loadGrid(page, gridHtml(Array(5).fill(100), Array(6).fill(28), (r, c) => (r === 2 && c === 2 ? '' : NAMES(r, c))));
await clickGrid(page, 3, 2);
await press(page, 'ArrowDown');
at = await where(page);
check('sans liste, ↓ passe à la case du dessous (B3 → B4)', cellIs(at, 4, 2, 'B4'), at);
await press(page, 'ArrowUp');
await press(page, 'ArrowUp');
at = await where(page);
check('sans liste, ↑ remonte d\'une case (B4 → B3 → B2 est vide : le curseur est à la ligne 2)', cellIs(at, 2, 2, ''), at);
await clickGrid(page, 3, 2);
await press(page, 'End');
await press(page, 'ArrowRight');
at = await where(page);
check('sans liste, → en fin de texte passe à la case suivante (B3 → C3)', cellIs(at, 3, 3, 'C3'), at);

await typeHash(page, 2, 2, '#zzzz');
list = await listState(page);
check('« #zzzz » (aucune colonne ne porte ce mot) : la liste n\'est pas affichée', !list.shown && cellIs(await where(page), 2, 2, '#zzzz'), { list, at: await where(page) });
await press(page, 'ArrowDown');
at = await where(page);
check('sans liste affichée, ↓ descend dans la grille comme avant (case du dessous, ligne 3)', cellIs(at, 3, 2), at);

// ---------- 5) Dans une case qui a déjà du texte, après une espace ----------
await clickGrid(page, 4, 3);
await press(page, 'End');
await page.keyboard.type(' #');
await page.waitForTimeout(300);
list = await listState(page);
check('dans une case qui a du texte, « # » après une espace ouvre la liste, le curseur reste dans la case', list.shown && list.n === 5 && cellIs(await where(page), 4, 3, 'C4 #'), { list, at: await where(page) });
await press(page, 'ArrowDown');
await press(page, 'ArrowDown');
list = await listState(page);
at = await where(page);
check('↓ ↓ : la 3e colonne est choisie, le curseur n\'a pas quitté la case (ligne 4, colonne 3)', list.shown && list.selected === 2 && cellIs(at, 4, 3, 'C4 #'), { list, at });
await press(page, 'Escape');

// ---------- 6) Même chose dans un tableau du document (hors mode grille) ----------
await loadGrid(page, gridHtml(Array(3).fill(120), Array(3).fill(28), (r, c) => (r === 2 && c === 2 ? '' : NAMES(r, c))), false);
check('le tableau du document n\'est pas en mode grille', !(await page.evaluate(() => GridEditor.isActive())));
await typeHash(page, 2, 2);
await press(page, 'ArrowDown');
await press(page, 'ArrowDown');
list = await listState(page);
at = await where(page);
check('tableau du document : « # » puis ↓ ↓ choisit la 3e colonne, le curseur reste dans la case (ligne 2, colonne 2)', list.shown && list.selected === 2 && cellIs(at, 2, 2, '#'), { list, at });
await press(page, 'ArrowUp');
list = await listState(page);
at = await where(page);
check('tableau du document : ↑ revient à la 2e colonne, le curseur reste dans la case', list.shown && list.selected === 1 && cellIs(at, 2, 2, '#'), { list, at });
await press(page, 'Escape');

await context.close();
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
