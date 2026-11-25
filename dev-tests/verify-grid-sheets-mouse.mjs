#!/usr/bin/env node
// Les ONGLETS d'une grille importée d'un classeur Excel à plusieurs feuilles (js/grid-sheets.js ; choix d'Antoine du 18/11 : « Onglets seulement après un import Excel ») à la VRAIE souris et au
// vrai clavier, à la taille du panneau Grist d'Antoine (~700x400), en thème clair, sombre puis en anglais. dev-tests/scenarios-grid-sheets.js (groupe « gridSheets ») vérifie le modèle, l'historique et les
// exports DANS la page avec des évènements synthétiques ; une page.evaluate ne dit ni si la barre d'onglets est atteignable à la souris, ni si rien ne la recouvre, ni qu'un clic « trusted » rend la saisie
// au texte. C'est ici qu'on s'assure que
//   - « Toutes les feuilles (onglets) » est la première ligne de la liste des feuilles, atteignable, et un vrai clic dessus importe le classeur en onglets ;
//   - la barre d'onglets est sous le plan de travail, entière dans le panneau, avec un onglet par feuille visible (un nom très long est coupé, pas la barre), le bon onglet sélectionné ; rien ne la recouvre ;
//     chaque onglet tient les contrastes de la charte (au moins 4,5 : 1), le sélectionné se distingue par autre chose que la couleur (gras et trait du haut) ;
//   - un vrai clic sur un onglet montre la feuille (le tableau change, le texte du premier onglet n'y est plus) et rend la saisie au texte ; la frappe va dans la feuille montrée, et en revenant à la première
//     elle est intacte ; les flèches du clavier déplacent le focus d'un onglet à l'autre et Entrée ouvre celui qui l'a ;
//   - la barre disparaît en Lecture et revient en Édition ; « Nouveau document » la retire.
// Lancé par run-headless.mjs (groupe Node « gridSheetsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-grid-sheets-mouse.mjs
// GRID_SHEETS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.GRID_SHEETS_MOUSE_PORT || 8948);
const SHOTS = process.env.GRID_SHEETS_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-grid-mouse.mjs.
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

const OFFLINE = existsSync(join(CACHE, 'umd'));
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdf-lib@[\d.]+\/dist\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/exceljs@[\d.]+\/dist\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
].filter(([, rel]) => rel !== 'umd/exceljs.min.js' || existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[verify-grid-sheets-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

async function openWidget(colorScheme, lang) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  // La page ne change plus de langue en route : l'anglais est une page qui DÉMARRE en anglais (la langue choisie est lue au démarrage, `pp_lang`).
  if (lang === 'en') await page.addInitScript(() => { try { localStorage.setItem('pp_lang', 'en'); } catch (e) { /* stockage refusé : la page reste en français */ } });
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { d.accept().catch(() => {}); });
  if (OFFLINE) {
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

async function boxOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
      inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  }, selector);
}

// Contraste WCAG de deux couleurs CSS « rgb(...) ».
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

// La couleur de fond que l'œil voit derrière un élément : celle du premier ancêtre qui en a une opaque.
const BACKGROUND_FN = `(el) => {
  for (let node = el; node; node = node.parentElement) {
    const m = /^rgba?\\(([^)]+)\\)$/.exec(getComputedStyle(node).backgroundColor);
    if (!m) continue;
    const parts = m[1].split(',').map(Number);
    if (parts.length < 4 || parts[3] >= 0.99) return 'rgb(' + parts[0] + ', ' + parts[1] + ', ' + parts[2] + ')';
  }
  return 'rgb(255, 255, 255)';
}`;

// Le sélecteur de fichier du navigateur, par le geste complet : « + » au survol, la ligne au vrai clic. L'écoute du sélecteur est installée AVANT le clic (elle passe par un aller-retour
// avec le navigateur : sans lui, le premier sélecteur d'une page neuve peut passer inaperçu). Rend le sélecteur, ou null s'il ne s'est pas ouvert.
async function openChooser(page) {
  const waiting = page.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null);
  await page.evaluate(() => 0);
  await page.waitForTimeout(250);
  const plus = await boxOf(page, '#btn-new');
  await page.mouse.move(plus.x, plus.y, { steps: 3 });
  await page.waitForTimeout(350);
  const row = await boxOf(page, '#v2-btn-import-xlsx');
  await page.mouse.move(row.x, row.y, { steps: 4 });
  await page.mouse.click(row.x, row.y);
  const chooser = await waiting;
  await page.mouse.move(WIDTH - 10, HEIGHT - 10); // hors du menu
  return chooser;
}

// La liste des feuilles (js/grid-xlsx-import.js:chooseSheet) telle que la personne la voit : ouverte ou non, ses lignes (atteignables à la souris, lisibles : F5), la zone de recherche et son
// focus, la place qu'elle prend par rapport au « + » d'où l'on est parti, le panneau qui la contient.
const sheetList = page => page.evaluate(([contrastSrc, backgroundSrc]) => {
  const contrast = eval(contrastSrc);
  const background = eval(backgroundSrc);
  const panel = document.querySelector('#v2-xlsx-sheet-search .ss-panel');
  if (!panel || panel.hidden) return null;
  const r = panel.getBoundingClientRect();
  const input = panel.querySelector('.ss-input');
  const plus = document.getElementById('btn-new').getBoundingClientRect();
  const rows = Array.from(panel.querySelectorAll('.ss-option')).map((row) => {
    const rr = row.getBoundingClientRect();
    const top = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
    const name = row.querySelector('.ss-name');
    return { text: name.textContent, x: rr.left + rr.width / 2, y: rr.top + rr.height / 2, reachable: !!top && row.contains(top), inPanel: rr.left >= 0 && rr.top >= 0 && rr.right <= innerWidth && rr.bottom <= innerHeight, contrast: contrast(getComputedStyle(name).color, background(row)) };
  });
  const empty = panel.querySelector('.ss-empty');
  return {
    rows, placeholder: input.placeholder, focused: document.activeElement === input, search: input.value, emptyShown: empty && !empty.hidden ? empty.textContent : '',
    left: r.left, top: r.top, right: r.right, bottom: r.bottom, inPanel: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    belowPlus: r.top >= plus.bottom - 1 && r.top <= plus.bottom + 24 && r.left <= plus.left + plus.width / 2 && r.right >= plus.left + plus.width / 2,
    hostCount: document.querySelectorAll('#v2-xlsx-sheet-search').length,
  };
}, [CONTRAST_FN, BACKGROUND_FN]);
// Attend que la liste soit ouverte (le classeur est lu : ExcelJS se charge à la demande) ; rend son état, ou null.
async function waitForSheetList(page) {
  await page.waitForFunction(() => { const panel = document.querySelector('#v2-xlsx-sheet-search .ss-panel'); return !!panel && !panel.hidden; }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
  return sheetList(page);
}
// Un vrai clic sur la ligne d'une feuille de la liste.
async function clickSheetRow(page, name) {
  const list = await sheetList(page);
  const row = list && list.rows.find(r => r.text === name);
  if (!row) return null;
  await page.mouse.move(row.x - 6, row.y, { steps: 3 });
  await page.mouse.click(row.x, row.y);
  return row;
}

// Un classeur de trois feuilles visibles, dont une au nom long (Excel en tolère 31 caractères au plus), et une masquée.
async function buildBook(page) {
  const base64 = await page.evaluate(async () => {
    await ExportEngines.ensure('xlsx');
    await XlsxExport.ensureExcelLibLoaded();
    const wb = new ExcelJS.Workbook();
    const sales = wb.addWorksheet('Ventes');
    sales.columns = [{ width: 18 }, { width: 12 }];
    sales.addRow(['Produit', 'Total']);
    sales.addRow(['Vis à bois', 12]);
    sales.addRow(['Clou', 7]);
    wb.addWorksheet('Brouillon', { state: 'hidden' }).getCell('A1').value = 'secret';
    const stock = wb.addWorksheet('Stock de la réserve centrale');
    stock.addRow(['Article', 'Reste']);
    stock.addRow(['Vis', 40]);
    wb.addWorksheet('Notes').getCell('A1').value = 'Une note';
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

const focusInText = page => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap'));
const firstCell = page => page.evaluate(() => EditorCore.getEditor().state.doc.child(0).firstChild.firstChild.textContent);
const gridActive = page => page.evaluate(() => GridEditor.isActive());

// La barre d'onglets telle que la personne la voit : chaque onglet (nom, place, atteignable, contraste, sélectionné), la barre dans le panneau, le plan de travail au-dessus.
const tabBarState = page => page.evaluate(([contrastSrc, backgroundSrc]) => {
  const contrast = eval(contrastSrc);
  const background = eval(backgroundSrc);
  const bar = document.getElementById('v2-sheet-tabs');
  const shown = !!bar && getComputedStyle(bar).display !== 'none' && bar.getBoundingClientRect().height > 0;
  if (!shown) return { shown: false };
  const r = bar.getBoundingClientRect();
  const editor = document.getElementById('editor-container').getBoundingClientRect();
  const tabs = Array.from(bar.querySelectorAll('[role="tab"]')).map((tab) => {
    const tr = tab.getBoundingClientRect();
    const top = document.elementFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2);
    const style = getComputedStyle(tab);
    return { text: tab.textContent, x: tr.left + tr.width / 2, y: tr.top + tr.height / 2, left: tr.left, right: tr.right, selected: tab.getAttribute('aria-selected') === 'true', reachable: !!top && tab.contains(top),
      inPanel: tr.width > 0 && tr.left >= 0 && tr.right <= innerWidth && tr.top >= 0 && tr.bottom <= innerHeight, clipped: tab.scrollWidth > tab.clientWidth + 1, weight: Number(style.fontWeight), topLine: style.borderTopColor + ' ' + style.borderTopWidth,
      contrast: contrast(style.color, background(tab)) };
  });
  return { shown, left: r.left, right: r.right, top: r.top, bottom: r.bottom, h: r.height, scrolls: bar.scrollWidth > bar.clientWidth + 1, aboveBar: editor.bottom <= r.top + 1, inPanel: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, tabs };
}, [CONTRAST_FN, BACKGROUND_FN]);

const TEXTS = {
  fr: { all: 'Toutes les feuilles (onglets)' },
  en: { all: 'All sheets (tabs)' },
};

async function run(theme, lang) {
  const label = (lang === 'en' ? 'anglais' : theme === 'dark' ? 'sombre' : 'clair');
  const T = TEXTS[lang];
  console.log(`\n=== Onglets d'une grille à la vraie souris, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const { context, page } = await openWidget(theme, lang);
  const dir = await mkdtemp(join(tmpdir(), 'grid-sheets-'));
  const bookPath = join(dir, 'classeur.xlsx');
  await writeFile(bookPath, await buildBook(page));
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang === 'en' ? 'en' : theme}-${name}.png`) }); };

  // 1) Le geste complet : « + », la ligne d'import, le vrai sélecteur, puis la liste des feuilles dont la première ligne est « Toutes les feuilles ».
  const chooser = await openChooser(page);
  check(`${label} - le vrai sélecteur de fichier s'ouvre`, !!chooser);
  if (!chooser) { await context.close(); return; }
  await chooser.setFiles(bookPath);
  const list = await waitForSheetList(page);
  check(`${label} - la liste des feuilles commence par « ${T.all} », puis les trois feuilles visibles (la masquée n'y est pas)`,
    !!list && list.rows.map(r => r.text).join('|') === [T.all, 'Ventes', 'Stock de la réserve centrale', 'Notes'].join('|'), list && list.rows.map(r => r.text));
  check(`${label} - chaque ligne est atteignable à la souris, dans le panneau, et lisible (contraste d'au moins 4,5 : 1)`, !!list && list.rows.every(r => r.reachable && r.inPanel && r.contrast >= 4.5), list && list.rows.map(r => [r.text, r.reachable, r.inPanel, r.contrast]));
  await snap('liste');
  const clicked = await clickSheetRow(page, T.all);
  check(`${label} - un vrai clic sur « ${T.all} » trouve sa ligne`, !!clicked);
  await page.waitForFunction(() => GridEditor.isActive() && document.querySelectorAll('#v2-sheet-tabs [role="tab"]').length > 0, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);

  // 2) La barre d'onglets.
  let bar = await tabBarState(page);
  const names = (bar.tabs || []).map(t => t.text);
  check(`${label} - la grille s'ouvre sur la première feuille avec un onglet par feuille visible, dans l'ordre d'Excel`, bar.shown && names.join('|') === 'Ventes|Stock de la réserve centrale|Notes' && (await firstCell(page)) === 'Produit', { names });
  check(`${label} - la barre est sous le plan de travail, entière dans le panneau, et le bon onglet est sélectionné`, bar.shown && bar.aboveBar && bar.inPanel && bar.h >= 26 && bar.h <= 48 && bar.tabs.filter(t => t.selected).map(t => t.text).join('') === 'Ventes', { top: bar.top, bottom: bar.bottom, h: bar.h });
  check(`${label} - chaque onglet est atteignable à la souris (rien ne le recouvre) et ses lettres tiennent les contrastes de la charte (au moins 4,5 : 1)`, bar.tabs.every(t => t.reachable && t.contrast >= 4.5), bar.tabs.map(t => [t.text, t.reachable, t.contrast]));
  const selected = bar.tabs.find(t => t.selected);
  const plain = bar.tabs.find(t => !t.selected);
  check(`${label} - l'onglet choisi se distingue par autre chose que la couleur : gras et trait du haut`, !!selected && !!plain && selected.weight > plain.weight && selected.topLine !== plain.topLine, { selected: [selected.weight, selected.topLine], plain: [plain.weight, plain.topLine] });
  check(`${label} - la barre ne dépasse jamais du panneau : tous les onglets y tiennent, ou elle défile`, bar.tabs.every(t => t.right <= WIDTH) || bar.scrolls, { rights: bar.tabs.map(t => t.right), scrolls: bar.scrolls });
  await snap('onglets');

  // 3) Un vrai clic sur le deuxième onglet : la feuille change, la saisie revient au texte ; la frappe va dans la feuille montrée.
  await page.mouse.move(bar.tabs[2].x - 4, bar.tabs[2].y, { steps: 3 });
  await page.mouse.click(bar.tabs[2].x, bar.tabs[2].y);
  await page.waitForTimeout(400);
  check(`${label} - un vrai clic sur « Notes » montre sa feuille et rend la saisie au texte`, (await firstCell(page)) === 'Une note' && (await focusInText(page)));
  await page.keyboard.type('NOUVEAU ');
  await page.waitForTimeout(200);
  bar = await tabBarState(page);
  await page.mouse.click(bar.tabs[0].x, bar.tabs[0].y);
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => ({ first: EditorCore.getEditor().state.doc.child(0).firstChild.firstChild.textContent, saved: Editor.getHTML() }));
  check(`${label} - la frappe est allée dans la feuille « Notes » ; la première feuille est intacte et le texte enregistré porte les deux`, back.first === 'Produit' && /NOUVEAU Une note/.test(back.saved.replace(/<[^>]+>/g, '')) && (back.saved.match(/<table\b/g) || []).length === 3, { first: back.first });
  await snap('apres-frappe');

  // 4) Le clavier : les flèches déplacent le focus d'un onglet à l'autre, Entrée ouvre celui qui l'a.
  await page.focus('#v2-sheet-tabs [role="tab"][aria-selected="true"]');
  await page.keyboard.press('ArrowRight');
  const afterArrow = await page.evaluate(() => ({ focused: document.activeElement && document.activeElement.textContent, first: EditorCore.getEditor().state.doc.child(0).firstChild.firstChild.textContent }));
  check(`${label} - la flèche droite déplace le focus sur l'onglet suivant sans changer de feuille`, afterArrow.focused.startsWith('Stock') && afterArrow.first === 'Produit', afterArrow);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const afterEnter = await page.evaluate(() => ({ focused: document.activeElement && document.activeElement.textContent, first: EditorCore.getEditor().state.doc.child(0).firstChild.firstChild.textContent }));
  check(`${label} - Entrée ouvre l'onglet qui a le focus, et le focus y reste`, afterEnter.first === 'Article' && afterEnter.focused.startsWith('Stock'), afterEnter);

  // 5) La Lecture cache la barre, l'Édition la rend.
  await page.evaluate(() => document.getElementById('btn-mode-read') && document.getElementById('btn-mode-read').click());
  await page.waitForTimeout(500);
  const reading = await tabBarState(page);
  await page.evaluate(() => document.getElementById('btn-mode-edit') && document.getElementById('btn-mode-edit').click());
  await page.waitForTimeout(500);
  const editing = await tabBarState(page);
  check(`${label} - la barre d'onglets disparaît avec l'éditeur en Lecture et revient en Édition`, reading.shown === false && editing.shown === true, { reading: reading.shown, editing: editing.shown });
  await snap('lecture');

  await context.close();
}

await run('light', 'fr');
await run('dark', 'fr');
await run('light', 'en');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
