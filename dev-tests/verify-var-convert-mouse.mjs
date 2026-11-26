#!/usr/bin/env node
// « Convertir le texte en variables » (demande d'Antoine du 26/11 : du texte « #Projets.Total_Fonctionnement_2026 » collé de l'extérieur dans un tableau, à rebasculer en bulles) à la VRAIE
// souris (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en français puis en anglais. dev-tests/scenarios-var-convert.js vérifie la conversion
// DANS la page ; ici, ce que seule une vraie souris prouve :
//  - sans sélection, le survol du bouton « Insérer une variable » ouvre son menu, la ligne est entière dans le panneau, au premier plan, grisée, et son clic ne change rien ;
//  - avec une zone du tableau sélectionnée à la souris (glisser sur des cases), la ligne est dégrisée : un clic convertit, les bulles sont dans leurs cases, le coin d'état le dit, la clé
//    inconnue et les cases non sélectionnées gardent leur texte, le menu se referme ;
//  - un seul Ctrl+Z (vrai clavier) rend le tableau d'avant ;
//  - le clic du bouton lui-même ouvre toujours la liste « # » ;
//  - en anglais : la ligne et la phrase du coin d'état.
// Lancé par run-headless.mjs (groupe Node "varConvertMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-var-convert-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.VAR_CONVERT_MOUSE_PORT || 8904);
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

const OFFLINE = existsSync(join(CACHE, 'umd'));
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdf-lib@[\d.]+\/dist\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-var-convert-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

// VAR_CONVERT_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil.
const SHOTS = process.env.VAR_CONVERT_SHOTS || '';
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

const TEXT = {
  fr: { row: 'Convertir le texte en variables', done: '3 variables créées, 1 texte laissé tel quel (colonne introuvable).', lang: 'français' },
  en: { row: 'Convert text to variables', done: '3 variables created, 1 text left as is (column not found).', lang: 'anglais' },
};

// Le tableau d'Antoine, en petit : les montants de la première ligne en texte (l'une des colonnes n'existe pas), la dernière colonne hors de la zone qu'on sélectionnera.
const PAGE_TABLE = 'Projets';
async function seedPage(page) {
  await page.evaluate(async (pageTable) => {
    const stub = window.__gristStub;
    stub.setVariables(pageTable, { Nom: 'Text', Total_Fonctionnement_2026: 'Numeric', Total_Fonctionnement_2027: 'Numeric', Total_Investissement_2026: 'Numeric' });
    stub.setRows(pageTable, [{ id: 1, Nom: 'Alpha', Total_Fonctionnement_2026: 10, Total_Fonctionnement_2027: 11, Total_Investissement_2026: 12 }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Alpha' }, pageTable);
    const cell = text => `<td><p>${text}</p></td>`;
    Editor.setHTML('<table><tbody>'
      + '<tr><th><p>Catégorie</p></th><th><p>2026</p></th><th><p>2027</p></th><th><p>Total</p></th></tr>'
      + `<tr>${cell('Fonctionnement')}${cell('#Projets.Total_Fonctionnement_2026')}${cell('#Projets.Total_Fonctionnement_2027')}${cell('#Projets.Nom')}</tr>`
      + `<tr>${cell('Investissement')}${cell('#Projets.Total_Investissement_2026')}${cell('#Projets.Total_Investissement_2099')}${cell('#Projets.Nom')}</tr>`
      + '</tbody></table><p>Fin</p>');
  }, PAGE_TABLE);
  await page.waitForTimeout(500);
}

const cellBox = (page, row, col) => page.evaluate(({ row, col }) => {
  const cell = document.querySelectorAll('.tiptap table tr')[row].children[col];
  cell.scrollIntoView({ block: 'center' });
  const r = cell.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left + 12 };
}, { row, col });
const tableState = page => page.evaluate(() => ({
  bubbles: document.querySelectorAll('.tiptap table .var-badge').length,
  cells: Array.from(document.querySelectorAll('.tiptap table tr')).map(tr => Array.from(tr.children).map(c => (c.querySelector('.var-badge') ? '[B]' : '') + c.textContent.replace(/\s+/g, ' ').trim())),
}));
const rowInfo = page => page.evaluate(() => {
  const row = document.getElementById('v2-btn-convert-variables');
  const flyout = document.getElementById('v2-variable-flyout');
  const r = row.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return {
    x, y, open: getComputedStyle(flyout).display !== 'none' && r.width > 0, onTop: !!top && (top === row || row.contains(top)),
    inViewport: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, fits: row.scrollWidth <= row.clientWidth + 0.5,
    disabled: row.getAttribute('aria-disabled') === 'true', greyed: row.classList.contains('v2-hover-row-disabled'), text: row.textContent.trim(), title: row.title || '',
  };
});
// Le survol du bouton « Insérer une variable » : le menu s'ouvre sous lui.
async function hoverButton(page) {
  const button = await hitTest(page, '#v2-btn-insert-variable');
  await page.mouse.move(button.x - 8, button.y + 14, { steps: 2 });
  await page.mouse.move(button.x, button.y, { steps: 3 });
  await page.waitForTimeout(350);
  return button;
}

async function runCase({ lang, title }) {
  const R = TEXT[lang];
  const label = R.lang;
  console.log(`\n=== ${title}, ${WIDTH}x${HEIGHT}, interface ${lang === 'en' ? 'anglaise' : 'française'} ===`);
  const { context, page } = await openWidget(lang);
  check(`${label} - l'interface est bien en ${lang === 'en' ? 'anglais' : 'français'}`, await page.evaluate(l => I18n.getLang() === l && document.documentElement.lang === l, lang));
  await seedPage(page);
  const before = await tableState(page);
  if (process.env.VAR_CONVERT_DEBUG) console.log('before', JSON.stringify(before));

  // 1) Sans sélection : un clic dans une case, puis le survol du bouton.
  const first = await cellBox(page, 1, 1);
  await park(page, first.y);
  await realClick(page, first);
  await hoverButton(page);
  let info = await rowInfo(page);
  check(`${label} - sans sélection, le survol du bouton ouvre son menu : la ligne « ${R.row} » est entière dans le panneau, au premier plan, texte non rogné`, info.open && info.inViewport && info.onTop && info.fits && info.text === R.row, info);
  check(`${label} - sans sélection, la ligne est grisée et dit pourquoi`, info.disabled && info.greyed && info.title.length > 20, info);
  await shot(page, `${lang}-sans-selection`);
  await page.mouse.click(info.x, info.y);
  await page.waitForTimeout(200);
  check(`${label} - un clic sur la ligne grisée ne change rien`, JSON.stringify(await tableState(page)) === JSON.stringify(before));

  // 2) La zone : un glisser de la case « 2026 » de la première ligne à la case « 2027 » de la seconde (quatre cases, la dernière colonne reste dehors).
  // Le curseur posé à la fin d'un « #Projets.… » rouvre la liste « # » (c'est son rôle) : on la ferme et on pose le curseur hors du tableau avant de glisser, sans quoi le glisser prendrait du texte sélectionné.
  await page.keyboard.press('Escape');
  const outside = await page.evaluate(() => { const p = Array.from(document.querySelectorAll('.tiptap > p')).pop(); const r = p.getBoundingClientRect(); return { x: r.left + 6, y: r.top + r.height / 2 }; });
  await park(page, outside.y);
  await realClick(page, outside);
  const from = await cellBox(page, 1, 1);
  const to = await cellBox(page, 2, 2);
  await park(page, from.y);
  await page.mouse.move(from.left, from.y, { steps: 2 });
  await page.mouse.down();
  await page.mouse.move(to.left, to.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const selected = await page.evaluate(() => document.querySelectorAll('.tiptap .selectedCell').length);
  check(`${label} - le glisser sélectionne quatre cases`, selected === 4, selected);
  await hoverButton(page);
  info = await rowInfo(page);
  check(`${label} - avec la zone sélectionnée, la ligne est dégrisée, entière dans le panneau, au premier plan`, info.open && info.inViewport && info.onTop && !info.disabled && !info.greyed && info.title === '', info);
  await shot(page, `${lang}-zone-selectionnee`);
  await page.mouse.click(info.x, info.y);
  await page.waitForTimeout(400);
  const after = await tableState(page);
  check(`${label} - un clic convertit : trois bulles dans leurs cases, la clé inconnue (« …_2099 ») et la case hors zone gardent leur texte`,
    after.bubbles === 3 && after.cells[1][1].startsWith('[B]') && after.cells[1][2].startsWith('[B]') && after.cells[2][1].startsWith('[B]') && after.cells[2][2] === '#Projets.Total_Investissement_2099'
    && after.cells[1][3] === '#Projets.Nom' && after.cells[2][3] === '#Projets.Nom', after);
  const status = await page.evaluate(() => document.getElementById('status-msg').textContent.trim());
  check(`${label} - le coin d'état dit « ${R.done} »`, status === R.done, status);
  const menuClosed = await page.evaluate(() => { const row = document.getElementById('v2-btn-convert-variables'); return getComputedStyle(row.closest('.v2-hover-flyout')).display === 'none' || row.getBoundingClientRect().width === 0; });
  await page.mouse.move(WIDTH - 4, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(300);
  const flyoutHidden = await page.evaluate(() => getComputedStyle(document.getElementById('v2-variable-flyout')).display === 'none');
  check(`${label} - la souris partie, le menu est refermé`, flyoutHidden || menuClosed, { flyoutHidden, menuClosed });
  await shot(page, `${lang}-converti`);

  // 3) Un seul Ctrl+Z rend le tableau d'avant.
  await page.evaluate(() => EditorCore.getEditor().commands.focus());
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const undone = await tableState(page);
  check(`${label} - un seul Ctrl+Z rend le tableau d'avant`, JSON.stringify(undone) === JSON.stringify(before), undone);

  // 4) Le clic du bouton lui-même : la liste « # » s'ouvre, comme avant.
  // (La liste ne s'ouvre que pour un « # » précédé d'une espace ou d'un début de ligne : le curseur va derrière « Fin », après une espace.)
  await park(page, outside.y);
  await realClick(page, outside);
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  const button = await hitTest(page, '#v2-btn-insert-variable');
  await realClick(page, button);
  await page.waitForTimeout(300);
  const list = await hitTest(page, '#autocomplete-box');
  check(`${label} - le clic du bouton ouvre toujours la liste « # » (entière dans le panneau)`, list.found && list.inViewport, list);
  await shot(page, `${lang}-liste`);
  await context.close();
}

try {
  await runCase({ lang: 'fr', title: 'Convertir le texte en variables, tableau collé' });
  await runCase({ lang: 'en', title: 'Convert text to variables, pasted table' });
} finally {
  check('aucune erreur de page ni boîte inattendue', pageErrors.length === 0, pageErrors);
  await browser.close();
  server.close();
}
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
