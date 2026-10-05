#!/usr/bin/env node
// Import d'un classeur Excel dans une grille (js/grid-xlsx-import.js, ligne « Importer un Excel… » du menu « + », sujet 18 du 02/10) à la VRAIE souris, au vrai clavier et avec un VRAI
// sélecteur de fichier (page.waitForEvent('filechooser') : Chromium n'ouvre le sélecteur que pour le clic réel d'une personne), à la taille du panneau Grist d'Antoine (~700x400),
// en thème clair, sombre puis en anglais. dev-tests/scenarios-grid-import.js (groupe « gridImport ») vérifie ce que l'import écrit, DANS la page, avec des évènements synthétiques ;
// une page.evaluate ne déclenche ni le survol d'un menu, ni un geste « trusted », ni un vrai sélecteur de fichier : c'est ici qu'on s'assure que
//   - « + » ouvre son menu au survol et la ligne « Importer un Excel… » (« Import from Excel… ») y suit « Nouvelle grille », dans le panneau, que rien ne recouvre, lisible (F5) ;
//   - un vrai clic sur la ligne ouvre le vrai sélecteur, réduit aux .xlsx / .xlsm, pour un seul fichier ; « Annuler » dans le sélecteur ne change rien (ni message, ni fenêtre) ;
//   - un classeur à plusieurs feuilles ouvre la liste avec recherche des feuilles (choix d'Antoine du 02/10, « Oui, une liste ») sous le « + », dans le panneau, lisible (F5), la recherche
//     sous le focus ; « det » ne garde que « Détails » ; Échap, ou un clic dans le texte, la referme sans rien importer (le focus revient dans le texte) ; un vrai clic sur une ligne
//     (ou Entrée) en fait la grille ;
//   - la feuille choisie devient une grille visible : bandeaux atteignables, fond du titre, largeurs en pixels d'Excel, et le message de fin tient dans le coin d'état ;
//   - un document modifié et pas enregistré : « Modifications non enregistrées » vient APRÈS le choix du fichier ET de la feuille (un fichier illisible ne demande rien) ; « Annuler »
//     garde le document, « Abandonner » importe ;
//   - un fichier qui n'est pas un classeur : un message clair, rien ne change.
// Lancé par run-headless.mjs (groupe Node « gridImportMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-grid-import-mouse.mjs
// GRID_IMPORT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.GRID_IMPORT_MOUSE_PORT || 8947);
const SHOTS = process.env.GRID_IMPORT_SHOTS || '';
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
if (!OFFLINE) console.log('[verify-grid-import-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Un classeur « de tous les jours » fabriqué dans la page par ExcelJS (la bibliothèque que le widget charge lui-même) : une feuille « Facture » (titre orange fusionné sur quatre colonnes,
// titres en gras soulignés d'un trait, montants en euros, total sur fond vert pâle dont le résultat d'une formule, une colonne d'observations large : la grille fait ~900 px, plus que le contenu d'une
// page A4, ce qu'une classe a4-preview restée sur l'éditeur ramènerait à la page) et une seconde feuille visible (le message dit alors laquelle est lue).
async function buildInvoice(page) {
  const base64 = await page.evaluate(async () => {
    await ExportEngines.ensure('xlsx'); // le moteur ne se charge qu'au premier export ou import (js/export-engines.js)
    await XlsxExport.ensureExcelLibLoaded();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Facture');
    ws.columns = [{ width: 12 }, { width: 28 }, { width: 10 }, { width: 14 }, { width: 60 }];
    const thin = { style: 'thin', color: { argb: 'FF000000' } };
    const euro = '#,##0.00\\ "€"';
    ws.mergeCells('A1:E1');
    const title = ws.getCell('A1');
    title.value = 'Facture Alpha';
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED7D31' } };
    title.border = { top: thin, left: thin, bottom: thin, right: thin };
    ws.getRow(1).height = 28;
    ['Réf', 'Désignation', 'Qté', 'Prix', 'Observations'].forEach((t, i) => { const c = ws.getCell(2, i + 1); c.value = t; c.font = { bold: true }; c.border = { bottom: thin }; });
    ws.addRow(['A-1', 'Vis à bois', 2, 12.5, 'Livraison sous huit jours']);
    ws.addRow(['A-2', 'Clou', 1, 8]);
    ws.getCell('D3').numFmt = euro;
    ws.getCell('D4').numFmt = euro;
    ws.getCell('A5').value = 'Total';
    ws.getCell('D5').value = { formula: 'SUM(D3:D4)', result: 20.5 };
    ws.getCell('D5').numFmt = euro;
    ['A5', 'B5', 'C5', 'D5'].forEach((ref) => { const c = ws.getCell(ref); c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }; });
    wb.addWorksheet('Détails').getCell('A1').value = 'Une autre feuille';
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

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

// Un bouton de la fenêtre de confirmation (« Modifications non enregistrées ») par son texte, au vrai clic.
async function clickDialogButton(page, text) {
  const target = await page.evaluate((label) => {
    const overlay = document.getElementById('pp-dialog-modal');
    if (!overlay || getComputedStyle(overlay).display === 'none') return null;
    const button = Array.from(overlay.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).find(b => b.textContent.trim() === label);
    if (!button) return null;
    const r = button.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, reachable: !!top && button.contains(top), inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  }, text);
  if (!target) return null;
  await page.mouse.move(target.x - 8, target.y, { steps: 2 });
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(300);
  return target;
}
const dialogState = page => page.evaluate(() => {
  const overlay = document.getElementById('pp-dialog-modal');
  const shown = !!overlay && getComputedStyle(overlay).display !== 'none';
  return { shown, title: shown ? (overlay.querySelector('.pp-modal-title, h2, h3') || {}).textContent || '' : '', buttons: shown ? Array.from(overlay.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent.trim()) : [] };
});

// « + » puis « Nouveau document » au vrai clic (la grille importée est « à enregistrer » : la confirmation s'ouvre, on abandonne).
async function newDocument(page, discardLabel) {
  const plus = await boxOf(page, '#btn-new');
  await page.mouse.move(plus.x, plus.y, { steps: 3 });
  await page.waitForTimeout(350);
  const row = await boxOf(page, '#v2-btn-new-document');
  await page.mouse.move(row.x, row.y, { steps: 4 });
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(300);
  await clickDialogButton(page, discardLabel);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
  await page.waitForFunction(() => !GridEditor.isActive(), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
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
const focusInText = page => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap'));

const docText = page => page.evaluate(() => EditorCore.getEditor().state.doc.textContent);
const gridActive = page => page.evaluate(() => GridEditor.isActive());
const statusOf = page => page.evaluate(() => {
  const el = document.getElementById('status-msg');
  const r = el.getBoundingClientRect();
  return { text: el.textContent, error: el.classList.contains('error-msg'), clipped: el.scrollWidth > el.clientWidth + 1, inPanel: r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
});

const TEXTS = {
  fr: { row: 'Importer un Excel…', placeholder: 'Rechercher une feuille…', noMatch: 'Aucune feuille ne correspond.', unsaved: 'Modifications non enregistrées', discard: 'Abandonner', cancel: 'Annuler',
    imported: /^Feuille « Facture » \(1 sur 2\) importée : 5 lignes, 5 colonnes\./, unreadable: 'Ce fichier n’est pas un classeur Excel (.xlsx) lisible.', euro: /^12,50\s€$/, total: /^20,50\s€$/ },
  en: { row: 'Import from Excel…', placeholder: 'Search for a sheet…', noMatch: 'No sheet matches.', unsaved: 'Unsaved changes', discard: 'Discard', cancel: 'Cancel',
    imported: /^Sheet “Facture” \(1 of 2\) imported: 5 rows, 5 columns\./, unreadable: 'This file is not a readable Excel (.xlsx) workbook.', euro: /^12\.50\s€$/, total: /^20\.50\s€$/ },
};

async function run(theme, lang) {
  const label = (lang === 'en' ? 'anglais' : theme === 'dark' ? 'sombre' : 'clair');
  const T = TEXTS[lang];
  console.log(`\n=== Import d'un classeur Excel à la vraie souris, ${WIDTH}x${HEIGHT}, ${label} ===`);
  const { context, page } = await openWidget(theme);
  if (lang === 'en') await page.evaluate(() => I18n.setLang('en'));
  const dir = await mkdtemp(join(tmpdir(), 'grid-import-'));
  const invoicePath = join(dir, 'facture.xlsx');
  await writeFile(invoicePath, await buildInvoice(page));
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${lang === 'en' ? 'en' : theme}-${name}.png`) }); };

  // 1) Le menu « + » : la ligne suit « Nouvelle grille », dans le panneau, rien ne la recouvre, texte lisible.
  const plus = await boxOf(page, '#btn-new');
  await page.mouse.move(plus.x, plus.y, { steps: 3 });
  await page.waitForTimeout(350);
  const rows = await page.evaluate(([contrastSrc, backgroundSrc]) => {
    const contrast = eval(contrastSrc);
    const effectiveBackground = eval(backgroundSrc);
    return Array.from(document.querySelectorAll('#v2-new-template-flyout .v2-hover-row')).map((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { id: el.id, text: el.textContent.trim(), top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height,
        inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        reachable: !!top && el.contains(top), clipped: el.scrollWidth > el.clientWidth + 1, contrast: contrast(getComputedStyle(el).color, effectiveBackground(el)) };
    });
  }, [CONTRAST_FN, BACKGROUND_FN]);
  const importRow = rows.find(r => r.id === 'v2-btn-import-xlsx');
  const gridRow = rows.find(r => r.id === 'v2-btn-new-grid');
  check(`${label} - le menu « + » montre « ${T.row} » juste après la nouvelle grille, dans le panneau, sans rien par-dessus`,
    !!importRow && !!gridRow && importRow.text === T.row && importRow.top >= gridRow.bottom - 1 && importRow.inViewport && importRow.reachable && !importRow.clipped, { importRow, gridRow });
  check(`${label} - le texte de la ligne tient les contrastes de la charte (au moins 4,5 : 1)`, !!importRow && importRow.contrast >= 4.5, importRow && importRow.contrast);
  await snap('menu');
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
  await page.waitForTimeout(300);

  // 2) Le vrai sélecteur : un seul fichier, réduit aux classeurs ; « Annuler » ne change rien.
  let chooser = await openChooser(page);
  check(`${label} - un vrai clic sur la ligne ouvre le vrai sélecteur de fichier du navigateur`, !!chooser);
  if (chooser) {
    const input = await chooser.element().evaluate(el => ({ accept: el.accept, multiple: el.multiple, type: el.type }));
    check(`${label} - le sélecteur est réduit aux classeurs .xlsx / .xlsm et ne prend qu'un fichier`, input.type === 'file' && !input.multiple && /\.xlsx/.test(input.accept) && /\.xlsm/.test(input.accept), input);
    await chooser.setFiles([]);
    await page.waitForTimeout(500);
    const after = { grid: await gridActive(page), status: await statusOf(page), dialog: (await dialogState(page)).shown };
    check(`${label} - « Annuler » dans le sélecteur : ni grille, ni message d'erreur, ni fenêtre`, !after.grid && !after.status.error && !after.dialog, after);
  }

  // 3) Le classeur a deux feuilles visibles : la liste des feuilles s'ouvre sous le « + ». Échap la referme sans rien importer, un clic dans le texte aussi.
  chooser = await openChooser(page);
  let list = null;
  if (!chooser) check(`${label} - le sélecteur s'ouvre pour l'import (liste des feuilles)`, false);
  else {
    await chooser.setFiles(invoicePath);
    list = await waitForSheetList(page);
  }
  check(`${label} - le classeur a deux feuilles visibles : la liste des feuilles s'ouvre une fois le classeur lu, « Facture » puis « Détails », et rien n'est encore importé`,
    !!list && list.rows.map(r => r.text).join('|') === 'Facture|Détails' && !(await gridActive(page)), { list });
  if (list) {
    check(`${label} - la liste s'ouvre sous le « + » d'où l'on est parti, entière dans le panneau, une seule dans la page`, list.belowPlus && list.inPanel && list.hostCount === 1, { left: list.left, top: list.top, right: list.right, bottom: list.bottom, belowPlus: list.belowPlus, inPanel: list.inPanel, hosts: list.hostCount });
    check(`${label} - chaque ligne est atteignable à la souris (rien ne la recouvre), dans le panneau, et lisible (contraste d'au moins 4,5 : 1)`, list.rows.every(r => r.reachable && r.inPanel && r.contrast >= 4.5), list.rows);
    check(`${label} - la zone de recherche a le focus et dit « ${T.placeholder} »`, list.focused && list.placeholder === T.placeholder, { focused: list.focused, placeholder: list.placeholder });
    const whileOpen = await statusOf(page);
    check(`${label} - pendant la liste, le coin d'état n'annonce plus la lecture du classeur (elle est finie)`, !/Lecture|Reading/.test(whileOpen.text), whileOpen);
    await snap('list');
    await page.keyboard.type('det');
    await page.waitForTimeout(250);
    const typed = await sheetList(page);
    check(`${label} - « det » tapé au vrai clavier ne garde que « Détails »`, !!typed && typed.rows.map(r => r.text).join('|') === 'Détails' && typed.search === 'det', typed && { rows: typed.rows.map(r => r.text), search: typed.search });
    await snap('list-search');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('zzz');
    await page.waitForTimeout(250);
    const none = await sheetList(page);
    check(`${label} - une recherche sans résultat dit « ${T.noMatch} »`, !!none && none.rows.length === 0 && none.emptyShown === T.noMatch, none && { rows: none.rows.length, empty: none.emptyShown });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const closed = { list: await sheetList(page), grid: await gridActive(page), status: await statusOf(page), dialog: (await dialogState(page)).shown, inText: await focusInText(page), hosts: await page.evaluate(() => document.querySelectorAll('#v2-xlsx-sheet-search').length) };
    check(`${label} - Échap referme la liste sans rien importer : ni grille ni question, le coin d'état redit l'état du modèle, le focus revient dans le texte, rien ne reste dans la page`,
      closed.list === null && !closed.grid && !closed.dialog && !/Lecture|Reading|import/i.test(closed.status.text) && closed.inText && closed.hosts === 0, closed);
  }
  chooser = await openChooser(page);
  if (!chooser) check(`${label} - le sélecteur s'ouvre pour l'import (clic ailleurs)`, false);
  else {
    await chooser.setFiles(invoicePath);
    list = await waitForSheetList(page);
    const text = await boxOf(page, '.tiptap p');
    await page.mouse.move(text.x, text.y, { steps: 3 });
    await page.mouse.click(text.x, text.y);
    await page.waitForTimeout(400);
    const away = { list: await sheetList(page), grid: await gridActive(page), status: await statusOf(page), dialog: (await dialogState(page)).shown, inText: await focusInText(page), hosts: await page.evaluate(() => document.querySelectorAll('#v2-xlsx-sheet-search').length) };
    check(`${label} - un clic dans le texte referme la liste sans rien importer, le focus est où l'on a cliqué`, !!list && away.list === null && !away.grid && !away.dialog && !/Lecture|Reading|import/i.test(away.status.text) && away.inText && away.hosts === 0, away);
  }

  // 3 bis) Le classeur choisi puis la feuille « Facture » au vrai clic : elle devient une grille, dans le panneau.
  chooser = await openChooser(page);
  if (!chooser) check(`${label} - le sélecteur s'ouvre pour l'import`, false);
  else {
    await chooser.setFiles(invoicePath);
    await waitForSheetList(page);
    const picked = await clickSheetRow(page, 'Facture');
    check(`${label} - un vrai clic sur « Facture » dans la liste`, !!picked && picked.reachable && picked.inPanel, picked);
    await page.waitForFunction(() => GridEditor.isActive() && document.querySelectorAll('.v2-grid-colhead').length > 0, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
  const grid = await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    const table = ed.state.doc.child(0);
    const rows = [];
    table.forEach(row => rows.push(row.childCount));
    const widths = [];
    table.child(1).forEach(cell => widths.push(cell.attrs.colwidth && cell.attrs.colwidth[0]));
    const cell = (r, c) => document.querySelectorAll('.tiptap table > tbody > tr')[r].children[c];
    const title = cell(0, 0), vis = cell(2, 1), euro = cell(2, 3), total = cell(4, 3);
    const hit = (sel) => { const el = document.querySelector(sel); if (!el) return { ok: false }; const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { ok: !!top && el.contains(top), inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; };
    const container = document.getElementById('editor-container');
    return {
      active: GridEditor.isActive(), rows, widths, colheads: document.querySelectorAll('.v2-grid-colhead').length,
      title: { text: title.textContent, colspan: title.colSpan, bg: getComputedStyle(title).backgroundColor, bold: Number(getComputedStyle(title.querySelector('strong, b') || title).fontWeight) >= 600 || !!title.querySelector('strong, b'), align: getComputedStyle(title.querySelector('p')).textAlign },
      vis: vis.textContent, euro: euro.textContent, total: total.textContent, totalBg: getComputedStyle(total).backgroundColor,
      corner: hit('.v2-grid-corner'), col: hit('.v2-grid-colhead'), row: hit('.v2-grid-rowhead'), firstCell: hit('.tiptap table td'),
      a4: container.classList.contains('a4-preview'), tableRowHeight: Math.round(document.querySelectorAll('.tiptap table > tbody > tr')[0].getBoundingClientRect().height),
    };
  });
  check(`${label} - le classeur devient une grille : 5 lignes, la première d'une seule case (titre fusionné), les autres de 5, cinq lettres A à E`,
    grid.active && grid.rows.join(',') === '1,5,5,5,5' && grid.colheads === 5 && grid.title.colspan === 5, grid);
  check(`${label} - les largeurs sont celles d'Excel en pixels (12, 28, 10, 14 et 60 caractères : 89, 201, 75, 103 et 425 px), même plus large qu'une page A4`, grid.widths.join(',') === '89,201,75,103,425', grid.widths);
  check(`${label} - le texte est celui qu'Excel montre : « Facture Alpha », « Vis à bois », « 12,50 € » et le total d'une formule dans la langue du widget`,
    grid.title.text === 'Facture Alpha' && grid.vis === 'Vis à bois' && T.euro.test(grid.euro) && T.total.test(grid.total), { title: grid.title.text, vis: grid.vis, euro: grid.euro, total: grid.total });
  check(`${label} - les fonds, le gras et le centrage du titre sont repris (orange, gras, centré), le total est sur fond vert pâle`,
    grid.title.bg === 'rgb(237, 125, 49)' && grid.title.bold && grid.title.align === 'center' && grid.totalBg === 'rgb(226, 239, 218)', { title: grid.title, totalBg: grid.totalBg });
  check(`${label} - la hauteur de la première ligne est celle d'Excel (28 pt = 37 px), pas l'ancienne feuille A4 : aucune classe a4-preview`, grid.tableRowHeight >= 36 && grid.tableRowHeight <= 39 && !grid.a4, { height: grid.tableRowHeight, a4: grid.a4 });
  check(`${label} - le coin, la lettre A, le numéro 1 et la première case sont visibles et atteignables à la souris (rien ne les recouvre)`, grid.corner.ok && grid.col.ok && grid.row.ok && grid.firstCell.ok && grid.corner.inViewport && grid.col.inViewport && grid.row.inViewport, grid);
  const done = await statusOf(page);
  check(`${label} - le coin d'état dit quelle feuille est lue et ce qu'elle a donné (lignes, colonnes), en entier, sans être coupé, dans le panneau`, T.imported.test(done.text) && !done.clipped && done.inPanel, done);
  await snap('imported');

  // 4) Quitter la grille (« Nouveau document ») puis écrire au vrai clavier : un fichier illisible ne demande rien et ne change rien.
  await newDocument(page, T.discard);
  const editorBox = await boxOf(page, '.tiptap p');
  await page.mouse.move(editorBox.x, editorBox.y, { steps: 3 });
  await page.mouse.click(editorBox.x, editorBox.y);
  await page.keyboard.type('Brouillon');
  await page.waitForTimeout(700);
  check(`${label} - « Nouveau document » : on est revenu dans un document ordinaire où la frappe passe`, !(await gridActive(page)) && (await docText(page)) === 'Brouillon', { grid: await gridActive(page), text: await docText(page) });
  chooser = await openChooser(page);
  if (!chooser) check(`${label} - le sélecteur s'ouvre (fichier illisible)`, false);
  else {
    await chooser.setFiles({ name: 'faux.xlsx', mimeType: XLSX_MIME, buffer: Buffer.from('ceci n’est pas un classeur') });
    await page.waitForFunction(() => /lisible|readable/.test(document.getElementById('status-msg').textContent), null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(300);
    const bad = await statusOf(page);
    const asked = await dialogState(page);
    check(`${label} - un fichier qui n'est pas un classeur : « ${T.unreadable} » en rouge, sans fenêtre de confirmation, le document garde « Brouillon »`,
      bad.text === T.unreadable && bad.error && !asked.shown && (await docText(page)) === 'Brouillon' && !(await gridActive(page)), { bad, asked, text: await docText(page) });
    await snap('unreadable');
  }

  // 5) Un document modifié : la liste des feuilles d'abord, la confirmation après le choix de la feuille ; « Annuler » garde le document, « Abandonner » importe.
  chooser = await openChooser(page);
  if (!chooser) check(`${label} - le sélecteur s'ouvre (document modifié)`, false);
  else {
    const before = await dialogState(page);
    await chooser.setFiles(invoicePath);
    const opened = await waitForSheetList(page);
    const whileList = await dialogState(page);
    check(`${label} - document modifié : la liste des feuilles s'ouvre d'abord, la fenêtre « ${T.unsaved} » n'est pas encore posée`, !!opened && !before.shown && !whileList.shown, { opened: !!opened, before, whileList });
    await clickSheetRow(page, 'Facture');
    await page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(300);
    const asked = await dialogState(page);
    check(`${label} - la feuille choisie puis lue, la fenêtre « ${T.unsaved} » s'ouvre (pas avant le choix du fichier ni de la feuille)`, !before.shown && asked.shown && asked.title === T.unsaved && asked.buttons.includes(T.discard) && asked.buttons.includes(T.cancel), { before, asked });
    await snap('unsaved');
    const cancelled = await clickDialogButton(page, T.cancel);
    check(`${label} - « ${T.cancel} » est atteignable à la souris dans le panneau`, !!cancelled && cancelled.reachable && cancelled.inViewport, cancelled);
    await page.waitForTimeout(300);
    check(`${label} - « ${T.cancel} » : la fenêtre se ferme, le document garde « Brouillon », aucune grille`, !(await dialogState(page)).shown && (await docText(page)) === 'Brouillon' && !(await gridActive(page)), { dialog: await dialogState(page), text: await docText(page) });
  }
  chooser = await openChooser(page);
  if (!chooser) check(`${label} - le sélecteur s'ouvre (deuxième essai)`, false);
  else {
    await chooser.setFiles(invoicePath);
    await waitForSheetList(page);
    await page.keyboard.type('fact'); // au clavier cette fois : la recherche puis Entrée prend la première ligne trouvée
    await page.waitForTimeout(250);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && getComputedStyle(ov).display !== 'none'; }, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(300);
    const discard = await clickDialogButton(page, T.discard);
    check(`${label} - « ${T.discard} » est atteignable à la souris dans le panneau`, !!discard && discard.reachable && discard.inViewport, discard);
    await page.waitForFunction(() => GridEditor.isActive() && document.querySelectorAll('.v2-grid-colhead').length === 5, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(400);
    const text = await page.evaluate(() => EditorCore.getEditor().state.doc.textContent);
    check(`${label} - « ${T.discard} » : le brouillon est abandonné, la grille du classeur arrive`, (await gridActive(page)) && text.includes('Facture Alpha') && !text.includes('Brouillon'), { text: text.slice(0, 60) });
  }

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
