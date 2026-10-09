#!/usr/bin/env node
// Puce « N° de ligne » (demande d'Antoine du 2026-10-09, point 5.1 : numéroter les lignes répétées d'une Boucle sans colonne « Ordre » dans Grist) à la VRAIE souris
// (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en français puis en anglais. dev-tests/scenarios-var-loop.js (cas
// loop_row_number_chip_*) vérifie le rang DANS la page (Lecture, aperçu des exports : ordre, filtre, lot) ; ici, ce que seule une vraie souris prouve :
//  - la liste « # », son onglet Puces : « N° de ligne » JUSTE après « Nom de l’utilisateur », entière dans le panneau, au premier plan et sans texte rogné ;
//  - UN clic sur la ligne pose la puce dans la case du tableau à la place du « # » : une seule puce, la liste se ferme, la puce reste dans sa case (même étroite) et
//    la frappe suivante s'écrit derrière elle ;
//  - en Lecture, la colonne se numérote 1, 2, 3 dans l'ordre des lignes de la facture, l'en-tête n'est pas numéroté, plus aucune puce, et la feuille ne déborde pas ;
//  - retour à l'édition : la puce est toujours dans le modèle (la Lecture ne l'a pas remplacée) ;
//  - en anglais : « Row number » dans la liste et dans la case.
// Lancé par run-headless.mjs (groupe Node "rowNumberChipMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-row-number-chip-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.ROW_NUMBER_CHIP_MOUSE_PORT || 8965);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-user-name-chip-mouse.mjs.
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
] : [];
if (!OFFLINE) console.log('[verify-row-number-chip-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

// ROW_NUMBER_CHIP_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil.
const SHOTS = process.env.ROW_NUMBER_CHIP_SHOTS || '';
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

// Le widget d'une personne qui a choisi sa langue dans Réglages : elle est lue dans le stockage local avant tout autre script.
async function openWidget(lang) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, bypassCSP: true });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { pageErrors.push('boîte inattendue : ' + d.message()); d.accept().catch(() => {}); });
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
  await page.addInitScript(l => { try { localStorage.setItem('pp_lang', l); } catch (e) { /* stockage indisponible */ } }, lang);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  // Aperçu A4, le réglage d'Antoine (page réduite dans le panneau).
  await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });
  return { context, page };
}

// Centre d'un élément, entièrement dans le panneau ?, au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ?
async function hitTest(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height,
      inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
// Une ligne de liste retrouvée par son texte exact (la liste « # » n'a pas d'identifiant par ligne), et son texte tient-il dans sa boîte ?
async function hitByText(page, selector, text) {
  return page.evaluate(({ selector, text }) => {
    const el = Array.from(document.querySelectorAll(selector)).find(e => e.textContent.trim() === text);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
      fits: el.scrollWidth <= el.clientWidth + 0.5,
    };
  }, { selector, text });
}
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, box) {
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
}
// Garer la souris au bord droit de la feuille, à la hauteur visée : sur son chemin vers le texte, elle ne survole plus la barre du haut, dont un menu au survol (style de
// paragraphe, …) s'ouvrirait sous le pointeur et recevrait le clic à la place du paragraphe.
const park = (page, y) => page.mouse.move(WIDTH - 4, y);

const ROWS = {
  fr: { name: 'Nom de l’utilisateur', rowNumber: 'N° de ligne', calc: 'Calcul', tab: 'Puces', header: 'N°' },
  en: { name: 'User’s name', rowNumber: 'Row number', calc: 'Calculation', tab: 'Chips', header: 'No.' },
};

// Une facture et ses lignes (rangées par manualSort, qui n'est pas l'ordre de création) : trois lignes pour la facture 1, une pour la 2 (jamais lue ici).
const TABLE_PAGE = 'RnFactures';
const TABLE_LINES = 'RnLignes';
async function seedPage(page, header) {
  await page.evaluate(async ({ pageTable, linesTable, header }) => {
    const stub = window.__gristStub;
    stub.setVariables(pageTable, { Numero: 'Text' });
    stub.setVariables(linesTable, { Facture: 'Ref:' + pageTable, Designation: 'Text', manualSort: 'ManualSortPos' });
    stub.setRows(pageTable, [{ id: 1, Numero: 'F-2026-041' }, { id: 2, Numero: 'F-2026-042' }]);
    stub.setRows(linesTable, [
      { id: 1, Facture: 1, Designation: 'Journée de formation', manualSort: 2 },
      { id: 2, Facture: 1, Designation: 'Livret stagiaire', manualSort: 1 },
      { id: 3, Facture: 1, Designation: 'Déplacement', manualSort: 3 },
      { id: 4, Facture: 2, Designation: 'Audit', manualSort: 4 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(linesTable);
    await GristAPI.saveLinkRule(linesTable, { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Numero: 'F-2026-041' }, pageTable);
    // La ligne du tableau est répétée par la bulle de sa deuxième case ; la première case, vide, attend la puce.
    const loop = { repeat: 'row', table: linesTable, empty: 'header' };
    const badge = `<span class="var-badge" data-table="${linesTable}" data-column="Designation" data-key="${linesTable}.Designation" data-loop="${JSON.stringify(loop).replace(/"/g, '&quot;')}" data-loop-repeat="row"></span>`;
    Editor.setHTML(`<table><tbody><tr><th><p>${header}</p></th><th><p>Désignation</p></th></tr><tr><td><p></p></td><td><p>${badge}</p></td></tr></tbody></table><p></p>`);
  }, { pageTable: TABLE_PAGE, linesTable: TABLE_LINES, header });
  await page.waitForTimeout(500);
}

const chipsInEditor = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .smart-chip')).map(c => {
  const r = c.getBoundingClientRect();
  const cell = c.closest('td, th');
  const cr = cell ? cell.getBoundingClientRect() : null;
  return {
    kind: c.getAttribute('data-chip-kind'), label: c.textContent.trim(), lines: c.getClientRects().length,
    inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
    inCell: !!cr && cell.tagName === 'TD' && r.left >= cr.left - 0.5 && r.right <= cr.right + 0.5,
    cellIndex: cell ? Array.from(cell.parentElement.children).indexOf(cell) : -1,
  };
}));

async function runCase({ lang, title }) {
  const R = ROWS[lang];
  const label = lang === 'en' ? 'anglais' : 'français';
  console.log(`\n=== ${title}, ${WIDTH}x${HEIGHT}, interface ${lang === 'en' ? 'anglaise' : 'française'} ===`);
  const { context, page } = await openWidget(lang);
  check(`${label} - l'interface est bien en ${lang === 'en' ? 'anglais' : 'français'}`, await page.evaluate(l => I18n.getLang() === l && document.documentElement.lang === l, lang));
  await seedPage(page, R.header);

  // 1) La pose : un vrai clic dans la première case du corps du tableau, le bouton « Insérer une variable », l'onglet des puces, un clic sur la ligne « N° de ligne ».
  const target = await page.evaluate(() => {
    const p = document.querySelector('.tiptap table tr:nth-child(2) td:first-child p');
    p.scrollIntoView({ block: 'center' });
    const r = p.getBoundingClientRect();
    return { x: r.left + 10, y: r.top + r.height / 2 };
  });
  await park(page, target.y);
  await realClick(page, target);
  const insertButton = await hitTest(page, '#v2-btn-insert-variable');
  check(`${label} - le bouton « Insérer une variable » est dans le panneau et au premier plan`, insertButton.found && insertButton.inViewport && insertButton.onTop, insertButton);
  await realClick(page, insertButton);
  await page.waitForTimeout(250);
  const panel = await hitTest(page, '#autocomplete-box');
  check(`${label} - la liste « # » s'ouvre entièrement dans le panneau`, panel.found && panel.inViewport, panel);
  const chipsTab = await hitTest(page, '#autocomplete-box .ac-tab[data-tab="chips"]');
  check(`${label} - l'onglet « ${R.tab} » est atteignable à la vraie souris`, chipsTab.found && chipsTab.inViewport && chipsTab.onTop, chipsTab);
  await realClick(page, chipsTab);
  await page.waitForTimeout(150);
  const items = await page.evaluate(() => Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).map(i => i.textContent.trim()));
  check(`${label} - dix lignes, « ${R.rowNumber} » juste après « ${R.name} », « ${R.calc} » en dernier`,
    items.length === 10 && items.indexOf(R.rowNumber) === items.indexOf(R.name) + 1 && items.indexOf(R.rowNumber) === 5 && items[9] === R.calc, items);
  const wanted = await hitByText(page, '#autocomplete-box .ac-item', R.rowNumber);
  check(`${label} - la ligne « ${R.rowNumber} » est entière dans le panneau, au premier plan, texte non rogné`, wanted.found && wanted.inViewport && wanted.onTop && wanted.fits, wanted);
  await shot(page, `${lang}-liste`);
  if (wanted.found) await realClick(page, wanted);
  await page.waitForTimeout(350);
  const listClosed = !(await hitTest(page, '#autocomplete-box')).inViewport;
  let chips = await chipsInEditor(page);
  check(`${label} - un clic sur la ligne : une seule puce « ${R.rowNumber} » remplace « # », dans la première case du corps du tableau, sur une ligne, dans le panneau, et la liste se ferme`,
    chips.length === 1 && chips[0].kind === 'rowNumber' && chips[0].label === R.rowNumber && chips[0].cellIndex === 0 && chips[0].inCell && chips[0].lines === 1 && chips[0].inViewport && listClosed, { chips, listClosed });
  const html = await page.evaluate(() => EditorCore.getEditor().getHTML());
  check(`${label} - le HTML enregistré garde la puce (data-chip-kind="rowNumber")`, html.indexOf('data-chip-kind="rowNumber"') !== -1, html);
  await page.keyboard.type('.');
  const cellText = await page.evaluate(() => document.querySelector('.tiptap table tr:nth-child(2) td:first-child').textContent.trim());
  check(`${label} - le « # » a disparu et le curseur est après la puce : la frappe suivante s'écrit derrière elle`, cellText === R.rowNumber + '.', cellText);
  await shot(page, `${lang}-puce-posee`);

  // 2) La Lecture : la colonne se numérote 1, 2, 3 dans l'ordre des lignes de la facture (celui de la table, pas celui de leur création), l'en-tête n'est pas numéroté.
  await realClick(page, await hitTest(page, '#btn-mode-read'));
  await page.waitForTimeout(900);
  const reading = () => page.evaluate(() => {
    const reader = document.getElementById('reader-container');
    const rows = Array.from(reader.querySelectorAll('table tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim()));
    const table = reader.querySelector('table');
    const box = table && table.getBoundingClientRect();
    return {
      shown: reader.style.display === 'block', rows, chipsLeft: reader.querySelectorAll('.smart-chip').length,
      overflowX: reader.scrollWidth - reader.clientWidth,
      tableInPanel: !!box && box.left >= 0 && box.right <= innerWidth + 0.5,
    };
  });
  let read = await reading();
  await page.waitForTimeout(200);
  read = await reading();
  const expected = [[R.header, 'Désignation'], ['1.', 'Livret stagiaire'], ['2.', 'Journée de formation'], ['3.', 'Déplacement']];
  check(`${label} - Lecture : 1, 2, 3 dans la première colonne, dans l'ordre des lignes de la facture, l'en-tête non numéroté, plus aucune puce, la feuille ne déborde pas`,
    read.shown && JSON.stringify(read.rows) === JSON.stringify(expected) && read.chipsLeft === 0 && read.overflowX <= 1 && read.tableInPanel, read);
  await shot(page, `${lang}-lecture`);

  // 3) Retour à l'édition : la puce est toujours dans le modèle (la Lecture ne l'a pas remplacée).
  await realClick(page, await hitTest(page, '#btn-mode-edit'));
  await page.waitForTimeout(500);
  chips = await chipsInEditor(page);
  check(`${label} - retour à l'édition : la puce « ${R.rowNumber} » est toujours dans le modèle`, chips.length === 1 && chips[0].kind === 'rowNumber' && chips[0].label === R.rowNumber, chips);

  await context.close();
}

try {
  await runCase({ lang: 'fr', title: 'Puce « N° de ligne » dans une ligne de tableau répétée' });
  await runCase({ lang: 'en', title: 'Row number chip in a repeated table row' });
} finally {
  check('aucune erreur de page ni boîte inattendue', pageErrors.length === 0, pageErrors);
  await browser.close();
  server.close();
}
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
