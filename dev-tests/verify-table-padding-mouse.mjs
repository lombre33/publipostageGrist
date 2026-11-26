#!/usr/bin/env node
// Les marges internes des cases d'un tableau (js/cell-padding.js ; retour d'un utilisateur du 26/11 : « un espacement assez grand au niveau des bordures, ce qui génère des tableaux trop grands quand on a pas mal de
// données ») à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), à la taille du panneau Grist (~700x400), en thème clair puis sombre. Ici on s'assure que
//   - le menu « Bordures » de la barre du tableau garde son pied « Quadrillage » et porte à sa droite « Marges des cases » avec ses trois niveaux (le menu ne grandit pas : tout entier dans le panneau, 207 px au plus), chaque bouton sous le pointeur,
//     « Normal » enfoncé pour un tableau que personne n'a réglé ;
//   - un vrai clic sur « Compact » resserre les cases (la ligne perd 6 px) sans refermer le menu, enfonce « Compact », écrit la marque dans le HTML ; « Large » agrandit ; « Normal » rend la hauteur
//     d'origine et efface la marque ; un seul Ctrl+Z défait un réglage ; le menu de la barre d'un tableau déjà réglé s'ouvre sur son niveau ;
//   - Réglages > Thème > Tableaux : trois choix, « Normal » coché au départ, un vrai clic sur « Compact » le garde, le tableau inséré ensuite par le bouton Tableau porte la marque, un tableau déjà posé ne change pas,
//     Ctrl+Z défait le choix.
// Les chiffres, la marque et chaque sortie (HTML, e-mail, ODT, Word, PDF, PowerPoint) sont dans dev-tests/scenarios-table-padding.js (groupe tablePadding).
// Lancé par run-headless.mjs (groupe Node « tablePaddingMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-table-padding-mouse.mjs
// `TABLE_PADDING_SHOTS` : un dossier où ranger les captures avant / après (clair et sombre), pour les montrer.
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TABLE_PADDING_MOUSE_PORT || 8975);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-grid-cells-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-table-padding-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function openWidget(colorScheme, size = { width: WIDTH, height: HEIGHT }) {
  const context = await browser.newContext({ bypassCSP: true, viewport: size, colorScheme });
  const page = await context.newPage();
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

// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique. Le suivi des modifications, « Tout accepter » et « Tout refuser » sont les lignes du menu « Édition
// collaborative » : tant qu'il est fermé elles n'ont pas de place, la souris survole donc d'abord le bouton qui l'ouvre.
const COLLAB_ROWS = ['#v2-btn-track-changes', '#v2-btn-accept-all', '#v2-btn-reject-all'];
async function realClick(page, selector) {
  if (COLLAB_ROWS.includes(selector)) {
    const trigger = await boxOf(page, '#v2-btn-collab');
    await page.mouse.move(trigger.x, trigger.y, { steps: 3 });
    await page.waitForTimeout(150);
  }
  const b = await boxOf(page, selector);
  if (!b) return null;
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(150);
  return b;
}

// Vrai geste à un point précis de l'écran (le bas d'un bouton peut être sous un menu : on clique la part qui reste à découvert).
async function realClickAt(page, x, y) {
  await page.mouse.move(x - 6, y, { steps: 2 });
  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.click(x, y);
  await page.waitForTimeout(150);
}

// Le centre de la case dont le texte est exactement `text` (une case fusionnée se retrouve par son premier paragraphe).
const cellPoint = (page, text) => page.evaluate((wanted) => {
  const td = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).find(c => c.querySelector('p') && c.querySelector('p').textContent === wanted);
  if (!td) return null;
  const r = td.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, text);

// Le centre de la case de la ligne `r` et de la colonne `c` (depuis 1) d'un tableau encore sans fusion.
const slotPoint = (page, r, c) => page.evaluate(([row, col]) => {
  const td = document.querySelector(`.tiptap table > tbody > tr:nth-child(${row}) > td:nth-child(${col})`);
  if (!td) return null;
  const b = td.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, [r, c]);
async function clickCell(page, at) {
  const p = Array.isArray(at) ? await slotPoint(page, at[0], at[1]) : await cellPoint(page, at);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
}
// Appuie sur la case `from`, glisse sur la case `to`, relâche : une sélection de cases.
async function dragCells(page, from, to) {
  const a = Array.isArray(from) ? await slotPoint(page, from[0], from[1]) : await cellPoint(page, from);
  const b = Array.isArray(to) ? await slotPoint(page, to[0], to[1]) : await cellPoint(page, to);
  await page.mouse.move(a.x, a.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(150);
}


const SHOTS = process.env.TABLE_PADDING_SHOTS || '';
const BAR = '.v2-floating-toolbar.visible';
const MENU = '.v2-borders-dropdown.visible';
const DOC = '<p>Avant le tableau</p><table><tbody>'
  + '<tr><td colwidth="140"><p>Nom</p></td><td colwidth="190"><p>Adresse</p></td><td colwidth="120"><p>Montant</p></td></tr>'
  + '<tr><td colwidth="140"><p>Martin</p></td><td colwidth="190"><p>12 rue des Lilas</p></td><td colwidth="120"><p>1 250,00</p></td></tr>'
  + '<tr><td colwidth="140"><p>Durand</p></td><td colwidth="190"><p>3 place du Marché</p></td><td colwidth="120"><p>340,50</p></td></tr>'
  + '<tr><td colwidth="140"><p>Petit</p></td><td colwidth="190"><p>8 allée des Pins</p></td><td colwidth="120"><p>78,00</p></td></tr>'
  + '</tbody></table><p>Après le tableau</p>';
const htmlOf = page => page.evaluate(() => Editor.getHTML());
const tableState = page => page.evaluate(() => {
  const table = document.querySelector('.tiptap table');
  const td = table.querySelector('td');
  const cs = getComputedStyle(td);
  // `zoom` : l'échelle de la feuille dans le panneau (le tableau se mesure à l'écran, la marge est écrite à l'échelle 1).
  const zoom = table.offsetWidth ? table.getBoundingClientRect().width / table.offsetWidth : 1;
  return { zoom, rowHeight: Math.round(table.querySelector('tr').getBoundingClientRect().height * 100) / 100, tableHeight: Math.round(table.getBoundingClientRect().height * 100) / 100, top: parseFloat(cs.paddingTop), left: parseFloat(cs.paddingLeft), mark: table.getAttribute('data-cell-padding') };
});
// Le menu « Bordures » : ouvert ? entier dans le panneau ? le pied et ses trois niveaux ; chaque bouton est-il sous le pointeur ?
const menuState = page => page.evaluate((sel) => {
  const menu = document.querySelector(sel);
  if (!menu) return null;
  const r = menu.getBoundingClientRect();
  const buttons = Array.from(menu.querySelectorAll('button[data-action^="padding:"]'));
  const reach = buttons.map((b) => { const q = b.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!hit && (hit === b || b.contains(hit)); });
  const grid = menu.querySelector('button[data-action="gridlines"]');
  const name = menu.querySelector('.v2-borders-padding-name');
  return {
    inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, height: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom),
    levels: buttons.map(b => b.dataset.action.slice('padding:'.length)), labels: buttons.map(b => b.textContent), pressed: buttons.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.action.slice('padding:'.length)),
    reach, gridlines: !!grid, name: name ? name.textContent : null,
    // le titre est AU-DESSUS des trois niveaux, et le tout est à droite de « Quadrillage », dans sa hauteur (le menu ne grandit pas)
    titleAboveLevels: name && buttons.length ? buttons[0].getBoundingClientRect().top >= name.getBoundingClientRect().bottom - 1 : false,
    besideGridlines: grid && buttons.length ? buttons[0].getBoundingClientRect().left >= grid.getBoundingClientRect().right - 1 && name.getBoundingClientRect().top >= grid.getBoundingClientRect().top - 6 && buttons[0].getBoundingClientRect().bottom <= grid.getBoundingClientRect().bottom + 6 : false,
  };
}, MENU);

async function shot(page, theme, name) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${theme}-${name}.png`) });
}

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Marges des cases d'un tableau à la souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await page.evaluate(html => { GridEditor.setActive(false); Editor.setHTML(html); document.getElementById('editor-container').scrollTop = 0; }, DOC);
  await page.waitForTimeout(500);
  await clickCell(page, 'Martin');
  const base = await tableState(page);
  check(`${label} - un tableau que personne n'a réglé : 4 px et 6 px, aucune marque (ligne de ${base.rowHeight} px)`, base.top === 4 && base.left === 6 && base.mark === null && !/data-cell-padding/.test(await htmlOf(page)), base);
  await shot(page, theme, '1-avant-normal');

  // ---------- 1) Le menu ----------
  await realClick(page, '#v2-table-borders-btn');
  await page.waitForTimeout(250);
  let menu = await menuState(page);
  check(`${label} - le menu « Bordures » s'ouvre entier dans le panneau avec « Marges des cases » à droite de « Quadrillage », sur sa hauteur (${menu && menu.height} px de haut, au plus 207)`,
    !!menu && menu.inside && menu.height <= 207 && menu.gridlines && menu.name === 'Marges des cases' && menu.besideGridlines, menu);
  check(`${label} - trois niveaux Compact, Normal, Large sous le titre, chacun sous le pointeur, « Normal » enfoncé`,
    !!menu && menu.levels.join() === 'compact,normal,large' && menu.labels.join() === 'Compact,Normal,Large' && menu.titleAboveLevels && menu.reach.every(Boolean) && menu.pressed.join() === 'normal', menu);
  await shot(page, theme, '2-menu-ouvert');

  // ---------- 2) Compact, Large, Normal ----------
  await realClick(page, `${MENU} button[data-action="padding:compact"]`);
  await page.waitForTimeout(250);
  let now = await tableState(page);
  menu = await menuState(page);
  check(`${label} - un vrai clic sur « Compact » : 1 px et 3 px, la ligne passe de ${base.rowHeight} à ${now.rowHeight} px (6 px de moins à l'échelle 1), le tableau perd ${Math.round((base.tableHeight - now.tableHeight) * 100) / 100} px`,
    now.top === 1 && now.left === 3 && Math.abs(base.rowHeight - now.rowHeight - 6 * base.zoom) < 0.5 && now.mark === 'compact', { base, now });
  check(`${label} - le menu reste ouvert, « Compact » est enfoncé, le HTML porte la marque sur le tableau`, !!menu && menu.pressed.join() === 'compact' && menu.inside && /<table[^>]*data-cell-padding="compact"/.test(await htmlOf(page)), menu);
  await shot(page, theme, '3-menu-compact');
  await realClick(page, `${MENU} button[data-action="padding:large"]`);
  await page.waitForTimeout(250);
  const large = await tableState(page);
  check(`${label} - « Large » : 8 px et 12 px, la ligne passe à ${large.rowHeight} px (8 px de plus que « Normal » à l'échelle 1)`, large.top === 8 && large.left === 12 && Math.abs(large.rowHeight - base.rowHeight - 8 * base.zoom) < 0.5 && large.mark === 'large', { base, large });
  await shot(page, theme, '4-menu-large');
  await realClick(page, `${MENU} button[data-action="padding:normal"]`);
  await page.waitForTimeout(250);
  now = await tableState(page);
  check(`${label} - « Normal » rend la hauteur d'origine et efface la marque du HTML`, Math.abs(now.rowHeight - base.rowHeight) < 0.3 && now.mark === null && !/data-cell-padding/.test(await htmlOf(page)), { base, now });

  // ---------- 3) Un Ctrl+Z, et le menu relit le niveau du tableau ----------
  await page.waitForTimeout(800);
  await realClick(page, `${MENU} button[data-action="padding:compact"]`);
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await clickCell(page, 'Durand');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  now = await tableState(page);
  check(`${label} - un seul Ctrl+Z défait le réglage « Compact » (marque effacée, ligne de ${now.rowHeight} px)`, now.mark === null && Math.abs(now.rowHeight - base.rowHeight) < 0.3, { base, now });
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(300);
  await clickCell(page, 'Petit');
  await realClick(page, '#v2-table-borders-btn');
  await page.waitForTimeout(250);
  menu = await menuState(page);
  check(`${label} - Ctrl+Y le rétablit ; le menu rouvert sur une autre case du même tableau s'ouvre sur « Compact » enfoncé`, !!menu && menu.pressed.join() === 'compact', menu);
  await shot(page, theme, '5-apres-compact');
  await page.keyboard.press('Escape');
  await context.close();
}

// Réglages > Thème > Tableaux : le niveau des tableaux que l'on insère ensuite.
async function runSettings() {
  console.log(`\n=== Réglages > Thème > Tableaux à la souris, ${WIDTH}x${HEIGHT} ===`);
  const { context, page } = await openWidget('light');
  await page.evaluate(() => { try { localStorage.removeItem('pp_table_padding'); } catch (e) {} GridEditor.setActive(false); Editor.setHTML('<p>Début</p>'); });
  await page.waitForTimeout(300);
  await realClick(page, '#v2-btn-settings');
  await page.waitForTimeout(300);
  await realClick(page, '#settings-modal .settings-tab[data-settings-tab="theme"]');
  await page.waitForTimeout(250);
  const radios = () => page.evaluate(() => Array.from(document.querySelectorAll('input[name="settings-table-padding"]')).map(r => ({ value: r.value, checked: r.checked, text: r.parentElement.textContent.trim() })));
  let state = await radios();
  check('Réglages - la section « Tableaux » a trois choix, « Normal » coché au départ', state.map(r => r.value).join() === 'compact,normal,large' && state.filter(r => r.checked).map(r => r.value).join() === 'normal' && state.map(r => r.text).join() === 'Compact,Normal,Large', state);
  await page.evaluate(() => document.querySelector('input[name="settings-table-padding"][value="compact"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  const point = await boxOf(page, 'input[name="settings-table-padding"][value="compact"]');
  check('Réglages - le choix « Compact » est atteignable dans la fenêtre de 700x400', !!point && point.inViewport, point);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'reglages-tableaux.png') });
  await realClick(page, 'input[name="settings-table-padding"][value="compact"]');
  state = await radios();
  check('Réglages - un vrai clic sur « Compact » le coche et le garde (pp_table_padding)', state.filter(r => r.checked).map(r => r.value).join() === 'compact' && (await page.evaluate(() => PersonStore.get('pp_table_padding'))) === 'compact', state);
  await realClick(page, '#settings-close');
  await page.waitForTimeout(200);
  await page.evaluate(() => { EditorCore.getEditor().commands.focus('end'); });
  await realClick(page, '#v2-btn-table');
  await page.waitForTimeout(300);
  check('le bouton Tableau pose ensuite un tableau « compact »', /<table[^>]*data-cell-padding="compact"/.test(await htmlOf(page)), await htmlOf(page));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  await realClick(page, '#v2-btn-table');
  await page.waitForTimeout(300);
  const html = await htmlOf(page);
  check('le tableau déjà posé garde son niveau quand on change le choix de départ à « Normal » : un seul tableau après le Ctrl+Z et le nouveau', (html.match(/<table/g) || []).length === 1, html);
  await realClick(page, '#v2-btn-settings');
  await page.waitForTimeout(300);
  await realClick(page, '#settings-modal .settings-tab[data-settings-tab="theme"]');
  await page.evaluate(() => document.querySelector('input[name="settings-table-padding"][value="normal"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  await realClick(page, 'input[name="settings-table-padding"][value="normal"]');
  state = await radios();
  check('Réglages - « Normal » se choisit de la même façon et rend le départ d\'avant', state.filter(r => r.checked).map(r => r.value).join() === 'normal' && (await page.evaluate(() => PersonStore.get('pp_table_padding'))) === 'normal', state);
  await context.close();
}

// Captures pour les montrer (seulement avec TABLE_PADDING_SHOTS) : le même tableau de 14 lignes en « Normal », « Compact » et « Large », dans un panneau plus haut, sans rien vérifier.
async function shootBeforeAfter() {
  const { context, page } = await openWidget('light', { width: 760, height: 640 });
  const rows = Array.from({ length: 14 }, (_, i) => `<tr><td colwidth="150"><p>Dossier ${i + 1}</p></td><td colwidth="210"><p>${i + 3} rue des Lilas</p></td><td colwidth="110"><p>${(i + 1) * 137},50</p></td></tr>`).join('');
  await page.evaluate(html => { GridEditor.setActive(false); Editor.setHTML(html); document.getElementById('editor-container').scrollTop = 0; }, `<p>Avant le tableau</p><table><tbody>${rows}</tbody></table><p>Après le tableau</p>`);
  await page.waitForTimeout(500);
  for (const level of ['normal', 'compact', 'large']) {
    await clickCell(page, 'Dossier 3');
    await page.evaluate((lv) => { GridEditor.setCellPadding(EditorCore.getEditor(), lv); }, level);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS, `grand-tableau-${level}.png`) });
  }
  await context.close();
}

await runTheme('light');
await runTheme('dark');
await runSettings();
if (SHOTS) await shootBeforeAfter();
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
