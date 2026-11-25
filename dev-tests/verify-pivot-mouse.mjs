#!/usr/bin/env node
// Le tableau croisé de la grille (js/pivot-editor.js, js/pivot-window.js) à la VRAIE souris et au vrai clavier (page.mouse / page.keyboard, Node/Playwright), à la taille du panneau Grist d'Antoine (~700x400),
// en thème clair puis sombre, en français puis en anglais. dev-tests/scenarios-pivot-editor.js (groupe « pivotEditor ») vérifie la logique DANS la page avec des évènements synthétiques ; ici on s'assure que
//   - le cadre de la ligne du tableau croisé (étiquette, bouton « Modifier », début du tableau) tient dans le panneau, lisible (contrastes F5), et que son bouton se clique à la souris ;
//   - « Modifier » ouvre la fenêtre, qui tient dans 700x400 (ses boutons restent atteignables, le contenu défile), ses listes de colonnes s'ouvrent, se cherchent et se choisissent à la souris ;
//   - « Poser le tableau croisé » écrit la ligne, Ctrl+Z la reprend en UN seul pas ; « Tableau croisé… » de la barre du tableau ouvre la même fenêtre sur une ligne ordinaire ;
//   - Échap ferme la fenêtre et le clavier revient dans la grille.
// Lancé par run-headless.mjs (groupe Node « pivotMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-pivot-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PIVOT_MOUSE_PORT || 8897);
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
if (!OFFLINE) console.log('[verify-pivot-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
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

// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, selector) {
  const b = await boxOf(page, selector);
  if (!b) return null;
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  return b;
}

// Tire à la vraie souris d'un point à un autre : appuyé, déplacé en `steps` pas, `during` lu AVANT le relâcher, puis relâché.
async function realDrag(page, from, to, during) {
  await page.mouse.move(from.x, from.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  const live = during ? await during() : null;
  await page.mouse.up();
  await page.waitForTimeout(150);
  return live;
}

const gridState = page => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  const doc = ed.state.doc;
  const table = doc.child(0);
  const widths = [];
  table.firstChild.forEach(cell => widths.push(cell.attrs.colwidth && cell.attrs.colwidth[0]));
  const heights = [];
  table.forEach(row => heights.push(row.attrs.rowHeight));
  const sel = ed.state.selection;
  let selected = 0;
  if (sel.forEachCell) sel.forEachCell(() => { selected++; });
  const insideTable = !!sel.$anchorCell || (sel.$from.depth >= 1 && sel.$from.node(1).type.name === 'table');
  return {
    rows: table.childCount, cols: table.firstChild.childCount, widths, heights, text: doc.textContent, selected, insideTable,
    cellsByWidth: (() => { const col0 = new Set(); table.forEach(row => col0.add(String(row.child(0).attrs.colwidth))); return Array.from(col0); })(),
  };
});

// Contraste WCAG de deux couleurs CSS « rgb(...) » (le fond rgba(0,0,0,0) d'un parent est remonté par `backdrop`).
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

// « + » puis « Nouvelle grille » à la vraie souris : une grille de départ toute neuve (le menu s'ouvre au survol, l'entrée y est de tout widget).
// Une grille modifiée et pas enregistrée ouvre d'abord « Modifications non enregistrées » (retour d'Antoine du 01/10) : ce test repart à zéro, il clique « Abandonner ».
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
    const button = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).find(b => b.textContent === 'Ne pas enregistrer');
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
  await page.mouse.move(WIDTH - 10, HEIGHT - 10); // hors du menu
  return entry;
}

// Un clic réel exige que la cible soit DANS le panneau : sinon page.mouse clique dans le vide et le test échouerait pour une mauvaise raison.
// Le centre d'abord ; la pastille de zoom (#pp-page-zoom) couvre le coin bas droit du panneau et la dernière case d'une grille défilée jusqu'au bout passe
// dessous (son centre tombe sur le pourcentage) : elle se vise alors sur son côté gauche, que la pastille laisse libre.
async function clickInPanel(page, selector, label) {
  const b = await boxOf(page, selector);
  const at = b && await page.evaluate(({ sel, box }) => {
    const el = document.querySelector(sel);
    const reached = p => { const top = document.elementFromPoint(p.x, p.y); return !!top && el.contains(top); };
    return [{ x: box.x, y: box.y }, { x: box.left + box.w / 4, y: box.y }, { x: box.left + 10, y: box.y }].find(reached) || null;
  }, { sel: selector, box: b });
  if (!b || !b.inViewport || !at) { check(`${label} : ${selector} est sous le pointeur, dans le panneau (cible d'un vrai clic)`, false, { b, at }); return null; }
  await page.mouse.move(at.x - 6, at.y, { steps: 2 });
  await page.mouse.click(at.x, at.y);
  return b;
}


const SHOTS = process.env.PIVOT_MOUSE_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };

// Le jeu de données des essais « pivotEditor » (dev-tests/scenarios-pivot-editor.js), posé dans le faux Grist de la page.
async function seedData(page) {
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    const products = [[1, 'Plomberie', 1, 10, 2.5], [2, 'Visserie', 2, 100, 0.12], [3, 'Visserie', 1, 40, 0.3], [4, 'Électricité', 3, 8, 12.99], [5, 'Plomberie', 3, 3, 40],
      [6, 'Visserie', 1, 5, 1], [7, 'Électricité', 1, 20, 3.1], [8, 'Électricité', 3, 2, 70.5], [9, 'Plomberie', 2, 6, 9.9], [10, null, 2, 4, 5]];
    stub.setViewRows(null);
    stub.setViewFailure(null);
    stub.setVariables('PvEmplacements', { Zone: 'Choice' }, { Zone: ['Réserve', 'Picking', 'Quai'] });
    stub.setVariables('PvAtlas', { Nom: 'Text' });
    stub.setVariables('PvProduits', { Categorie: 'Choice', Emplacement: 'Ref:PvEmplacements', Stock: 'Numeric', PrixAchat: 'Numeric', Atlas: 'Ref:PvAtlas', manualSort: 'ManualSortPos' }, { Categorie: ['Visserie', 'Électricité', 'Plomberie'] });
    stub.setRows('PvEmplacements', [{ id: 1, Zone: 'Réserve' }, { id: 2, Zone: 'Picking' }, { id: 3, Zone: 'Quai' }]);
    stub.setRows('PvAtlas', [{ id: 1, Nom: 'Atlas Nord' }, { id: 2, Nom: 'Atlas Sud' }]);
    stub.setRows('PvProduits', products.map(([id, Categorie, Emplacement, Stock, PrixAchat]) => ({ id, Categorie: Categorie || '', Emplacement, Stock, PrixAchat, manualSort: id, Atlas: id % 2 ? 1 : 2 })));
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('PvProduits');
    await GristAPI.saveLinkRule('PvProduits', { mode: 'match', colonneCible: 'Atlas', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Atlas Nord' }, 'PvAtlas');
  });
  await page.waitForTimeout(150);
}
const PIVOT_DEF = { v: 1, source: { table: 'PvProduits', scope: 'linked' }, rows: ['Categorie'], cols: [], value: { kind: 'formula', formula: '{PvProduits.Stock} * {PvProduits.PrixAchat}' }, agg: 'sum' };
async function setGridWithPivot(page) {
  await page.evaluate((def) => {
    const attr = JSON.stringify(def).replace(/"/g, '&quot;');
    const cells = text => [0, 1, 2, 3].map(i => `<td colwidth="${[120, 90, 90, 90][i]}"><p>${i === 0 ? text : ''}</p></td>`).join('');
    Editor.setHTML('<table><tbody>'
      + `<tr><th colspan="4" colwidth="120,90,90,90"><p><strong>Titre</strong></p></th></tr>`
      + `<tr data-pivot="${attr}">${cells('')}</tr><tr>${cells('Une ligne')}</tr><tr>${cells('')}</tr></tbody></table>`);
  }, PIVOT_DEF);
  await page.waitForTimeout(700);
}
const pivotRowAttrs = page => page.evaluate(() => { const t = EditorCore.getEditor().state.doc.child(0); return Array.from({ length: t.childCount }, (_, i) => { const a = t.child(i).attrs.pivot; return a ? JSON.parse(a) : null; }); });
const windowOpen = page => page.evaluate(() => { const m = document.getElementById('pp-pivot-modal'); return !!m && getComputedStyle(m).display !== 'none'; });
const insideEditor = page => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.tiptap'));
const viewportBox = (page, selector) => boxOf(page, selector);
const contrastOf = (page, fgSelector, bgSelector) => page.evaluate(({ fgSel, bgSel, fn }) => {
  const contrast = eval(fn);
  const fg = getComputedStyle(document.querySelector(fgSel)).color;
  let node = document.querySelector(bgSel);
  let bg = getComputedStyle(node).backgroundColor;
  while (/rgba\(0, 0, 0, 0\)|transparent/.test(bg) && node.parentElement) { node = node.parentElement; bg = getComputedStyle(node).backgroundColor; }
  return contrast(fg, bg);
}, { fgSel: fgSelector, bgSel: bgSelector, fn: CONTRAST_FN });

// Le clavier réel dans une liste avec recherche : ouvrir le champ visible d'un <select> (clic), taper de quoi filtrer, Entrée choisit la première ligne.
async function pickInList(page, selectId, query, label) {
  const trigger = `#${selectId} + .ss-wrap .ss-trigger`;
  const b = await clickInPanel(page, trigger, label);
  if (!b) return false;
  await page.waitForTimeout(150);
  if (query) await page.keyboard.type(query, { delay: 20 });
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  return true;
}

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Tableau croisé de la grille à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await seedData(page);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
  await freshGrid(page);
  await setGridWithPivot(page);
  await shot(page, `pivot-${theme}-frame`);

  // 1) Le cadre de la ligne : dans le panneau, lisible, avec le début du tableau calculé.
  const frame = await boxOf(page, '.pp-pivot-preview');
  const edit = await boxOf(page, '.pp-pivot-edit');
  const mini = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-pivot-preview table.pp-pivot-mini tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim())));
  check(`${label} - le cadre de la ligne est dans le panneau, avec son bouton « Modifier » atteignable et le début du tableau calculé (Nord : 12, 62, puis le total 278,4)`,
    !!frame && frame.inViewport && !!edit && edit.inViewport && mini.length === 4 && mini[0][0] === 'Categorie' && mini[3][0] === 'Total' && mini[3][1].replace(/\s/g, '') === '278,4', { frame, edit, mini });
  const contrasts = [await contrastOf(page, '.pp-pivot-title', '.pp-pivot-preview'), await contrastOf(page, '.pp-pivot-edit', '.pp-pivot-edit'), await contrastOf(page, '.pp-pivot-mini th', '.pp-pivot-mini th'),
    await contrastOf(page, '.pp-pivot-mini td', '.pp-pivot-mini td'), await contrastOf(page, '.pp-pivot-mini tr.is-total td', '.pp-pivot-mini tr.is-total td')];
  check(`${label} - l'étiquette, le bouton et les cases du cadre tiennent les contrastes de la charte (4,5:1)`,
    contrasts.every(value => value >= 4.5), contrasts);
  check(`${label} - la ligne est plus haute que ses voisines et les bandeaux de la grille suivent (le numéro de la ligne est en face du cadre)`, await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.tiptap table > tbody > tr'));
    const heads = Array.from(document.querySelectorAll('.v2-grid-rowhead'));
    const a = rows[1].getBoundingClientRect(), b = heads[1] && heads[1].getBoundingClientRect();
    return rows[1].classList.contains('pp-pivot-row') && a.height > rows[2].getBoundingClientRect().height + 60 && !!b && Math.abs(a.top - b.top) < 2 && Math.abs(a.height - b.height) < 2;
  }));

  // 2) « Modifier » à la souris : la fenêtre tient dans le panneau, le bouton principal est atteignable.
  await realClick(page, '.pp-pivot-edit');
  await page.waitForTimeout(500);
  const box = await boxOf(page, '#pp-pivot-modal .pp-modal-box');
  const ok = await boxOf(page, '#pp-pivot-modal .var-modal-primary');
  const remove = await boxOf(page, '#pp-pivot-modal .var-modal-danger');
  await shot(page, `pivot-${theme}-window`);
  check(`${label} - « Modifier » ouvre la fenêtre : elle tient dans le panneau, « Enregistrer » et « Retirer » y sont atteignables`,
    await windowOpen(page) && !!box && box.inViewport && !!ok && ok.inViewport && !!remove && remove.inViewport, { box, ok, remove });
  const reopened = await page.evaluate(() => ({ table: document.getElementById('pp-pivot-table').value, row: document.getElementById('pp-pivot-row1').value, calc: document.getElementById('pp-pivot-calc').value }));
  check(`${label} - la fenêtre rouvre sur la définition de la ligne (table, colonne des lignes, Calcul écrit comme une bulle)`, reopened.table === 'PvProduits' && reopened.row === 'Categorie' && reopened.calc === '#PvProduits.Stock * #PvProduits.PrixAchat', reopened);

  // 3) Les listes de colonnes : la recherche et la descente dans une Référence au clavier.
  const trigger = '#pp-pivot-cols + .ss-wrap .ss-trigger';
  await clickInPanel(page, trigger, `${label} - Colonnes du tableau`);
  await page.waitForTimeout(200);
  await page.keyboard.type('Empl', { delay: 20 });
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+A'); // vide la recherche pour que → descende dans la ligne en surbrillance
  await page.keyboard.press('Backspace');
  await page.keyboard.type('Empl', { delay: 20 });
  const listed = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-pivot-modal .ss-panel:not([hidden]) .ss-list li')).map(li => li.textContent.trim()));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check(`${label} - la recherche « Empl » dans la liste des colonnes trouve la colonne Emplacement, et un Entrée la choisit`,
    listed.some(t => t.indexOf('Emplacement') !== -1) && await page.evaluate(() => document.getElementById('pp-pivot-cols').value) === 'Emplacement', listed);
  // Descendre dans la Référence (Emplacement ▸ Zone) : « → » ouvre ses colonnes, la zone se cherche et se choisit comme une colonne de la table.
  await clickInPanel(page, trigger, `${label} - Colonnes du tableau (descendre)`);
  await page.waitForTimeout(200);
  await page.keyboard.type('Empl', { delay: 20 });
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const below = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-pivot-modal .ss-panel:not([hidden]) .ss-list li')).map(li => li.textContent.trim()));
  await page.keyboard.type('Zone', { delay: 20 });
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  const chosenPath = await page.evaluate(() => document.getElementById('pp-pivot-cols').value);
  check(`${label} - « → » sur Emplacement ouvre les colonnes de sa table (Zone) ; la choisir donne le chemin Emplacement ▸ Zone`, below.some(t => t.indexOf('Zone') !== -1) && chosenPath === 'PvProduits.Emplacement.Zone', { below, chosenPath });
  const shown = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-pivot-modal .pp-pivot-window-preview table tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim())));
  check(`${label} - l'aperçu de la fenêtre suit le choix : une colonne par zone (Réserve, Picking, Quai) et le total`, shown.length >= 3 && ['Réserve', 'Picking', 'Quai', 'Total'].every(name => shown[0].indexOf(name) !== -1), shown);

  // 4) Valider : la ligne est écrite, Ctrl+Z la reprend en un seul pas.
  const before = await pivotRowAttrs(page);
  await realClick(page, '#pp-pivot-modal .var-modal-primary');
  await page.waitForTimeout(400);
  const after = await pivotRowAttrs(page);
  check(`${label} - « Enregistrer » écrit la ligne (la colonne des colonnes est posée) et ferme la fenêtre`, !(await windowOpen(page)) && before[1].cols.length === 0 && after[1] && after[1].cols.join() === 'Emplacement.Zone', { before: before[1], after: after[1] });
  check(`${label} - le clavier revient dans la grille après la fermeture`, await insideEditor(page));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const undone = await pivotRowAttrs(page);
  check(`${label} - Ctrl+Z reprend cette modification d'un seul pas (la ligne revient comme avant)`, !!undone[1] && undone[1].cols.length === 0 && undone[1].rows.join() === 'Categorie', undone[1]);

  // 4 bis) Les lignes retenues et l'écriture des nombres, à la souris et au clavier : une condition (Stock ≥ 10), deux décimales en moins et une devise ; l'aperçu les suit, « Enregistrer » les écrit,
  // Ctrl+Z reprend le tout d'un seul pas, et la fenêtre rouverte les relit.
  await clickInPanel(page, '.pp-pivot-edit', `${label} - Modifier (filtre)`);
  await page.waitForTimeout(500);
  const addRule = '#pp-pivot-modal .pp-pivot-filter .var-condition-add';
  await page.evaluate(() => document.getElementById('pp-pivot-filter-label').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const noneSaid = await page.evaluate(() => (document.querySelector('#pp-pivot-modal .pp-pivot-filter .var-loop-hint') || {}).textContent);
  check(`${label} - sans condition, « Lignes retenues » le dit (« toutes les lignes lues sont croisées ») et propose d'en ajouter une`, noneSaid === 'Toutes les lignes lues sont croisées.' && !!(await boxOf(page, addRule)), noneSaid);
  await clickInPanel(page, addRule, `${label} - + Ajouter une condition`);
  await page.waitForTimeout(250);
  const columnTrigger = '#pp-pivot-modal .pp-pivot-filter .macro-rule-row .macro-rule-column + .ss-wrap .ss-trigger';
  await clickInPanel(page, columnTrigger, `${label} - colonne de la condition`);
  await page.waitForTimeout(200);
  await page.keyboard.type('Stock', { delay: 20 });
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const operator = document.querySelector('#pp-pivot-modal .pp-pivot-filter .macro-rule-row select:not(.macro-rule-column)');
    operator.value = '≥';
    operator.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  await clickInPanel(page, '#pp-pivot-modal .pp-pivot-filter .macro-rule-value', `${label} - valeur de la condition`);
  await page.keyboard.type('10', { delay: 20 });
  await page.waitForTimeout(700);
  const filtered = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-pivot-modal .pp-pivot-window-preview table tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim())));
  const stats = await page.evaluate(() => document.querySelector('#pp-pivot-modal .pp-pivot-window-preview + .pp-link-note').textContent);
  check(`${label} - la condition « Stock ≥ 10 » restreint l'aperçu aux produits qui la remplissent (3 lignes lues, total 99)`,
    filtered.length === 5 && filtered[filtered.length - 1][0] === 'Total' && filtered[filtered.length - 1][1].replace(/\s/g, '') === '99' && /3 /.test(stats), { filtered, stats });
  await shot(page, `pivot-${theme}-window-filter`);
  // L'écriture des nombres : zéro décimale, devise « € ».
  await page.evaluate(() => document.getElementById('pp-pivot-fmt-label').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  await page.evaluate(() => { const d = document.getElementById('pp-pivot-fmt-decimals'); d.value = '0'; d.dispatchEvent(new Event('change', { bubbles: true })); });
  await clickInPanel(page, '#pp-pivot-fmt-currency', `${label} - devise`);
  await page.keyboard.type('€', { delay: 20 });
  await page.waitForTimeout(700);
  await shot(page, `pivot-${theme}-window-filter-format`);
  const written = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-pivot-modal .pp-pivot-window-preview table tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim())));
  check(`${label} - zéro décimale et la devise « € » s'écrivent dans l'aperçu, cases et total compris`, written.length === 5 && written.slice(1).every(row => /€$/.test(row[1])) && written[written.length - 1][1].replace(/[\s  ]/g, '') === '99€', written);
  const fits = await boxOf(page, '#pp-pivot-modal .var-modal-primary');
  check(`${label} - avec le filtre et l'écriture des nombres, la fenêtre tient toujours dans le panneau (« Enregistrer » atteignable)`, !!fits && fits.inViewport, fits);
  await realClick(page, '#pp-pivot-modal .var-modal-primary');
  await page.waitForTimeout(450);
  const saved = (await pivotRowAttrs(page))[1];
  check(`${label} - « Enregistrer » écrit le filtre (Stock ≥ 10) et le format (0 décimale, €) dans la ligne`,
    !!saved && !!saved.filter && saved.filter.mode === 'all' && saved.filter.rules.length === 1 && saved.filter.rules[0].column === 'Stock' && saved.filter.rules[0].operator === '≥' && saved.filter.rules[0].value === '10'
    && !!saved.format && saved.format.decimals === 0 && saved.format.currency === '€' && saved.format.type === 'number', saved);
  const framed = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-pivot-preview table.pp-pivot-mini tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim())));
  check(`${label} - le cadre de la ligne montre le tableau filtré et écrit avec la devise (deux rangées, puis le total 99 €)`, framed.length === 4 && framed[3][0] === 'Total' && framed[3][1].replace(/[\s  ]/g, '') === '99€' && framed[1][1].replace(/[\s  ]/g, '') === '12€', framed);
  await clickInPanel(page, '.pp-pivot-edit', `${label} - Modifier (relecture)`);
  await page.waitForTimeout(500);
  const reread = await page.evaluate(() => ({
    rules: document.querySelectorAll('#pp-pivot-modal .pp-pivot-filter .macro-rule-row').length,
    column: (document.querySelector('#pp-pivot-modal .pp-pivot-filter .macro-rule-column') || {}).value, value: (document.querySelector('#pp-pivot-modal .pp-pivot-filter .macro-rule-value') || {}).value,
    decimals: document.getElementById('pp-pivot-fmt-decimals').value, currency: document.getElementById('pp-pivot-fmt-currency').value,
  }));
  check(`${label} - la fenêtre rouverte relit le filtre et l'écriture des nombres`, reread.rules === 1 && reread.column === 'Stock' && reread.value === '10' && reread.decimals === '0' && reread.currency === '€', reread);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const unfiltered = (await pivotRowAttrs(page))[1];
  check(`${label} - Ctrl+Z reprend le filtre et le format d'un seul pas (la ligne revient sans eux)`, !!unfiltered && unfiltered.filter === undefined && unfiltered.format === undefined && unfiltered.rows.join() === 'Categorie', unfiltered);

  // 5) Une ligne ordinaire : le bouton de la barre du tableau ouvre la fenêtre, Échap la ferme et le clavier revient.
  const plain = await boxOf(page, '.tiptap table > tbody > tr:nth-child(4) > td:nth-child(2)');
  await page.mouse.move(plain.x - 4, plain.y, { steps: 3 });
  await page.mouse.click(plain.x, plain.y);
  await page.waitForTimeout(350);
  const barBtn = '.v2-floating-toolbar button[data-action="row-pivot"]';
  const barState = await page.evaluate((sel) => { const b = document.querySelector(sel); return b && { grey: b.classList.contains('is-disabled'), on: b.classList.contains('is-active'), title: b.title }; }, barBtn);
  check(`${label} - sur une ligne ordinaire, « Tableau croisé… » est dans la barre du tableau, disponible`, !!barState && !barState.grey && !barState.on && barState.title.indexOf('Tableau croisé') === 0, barState);
  await clickInPanel(page, barBtn, `${label} - bouton de la barre du tableau`);
  await page.waitForTimeout(500);
  const fresh = await page.evaluate(() => ({ open: getComputedStyle(document.getElementById('pp-pivot-modal')).display !== 'none', ok: document.querySelector('#pp-pivot-modal .var-modal-primary').textContent, removeHidden: document.querySelector('#pp-pivot-modal .var-modal-danger').hidden, row1: document.getElementById('pp-pivot-row1').value }));
  check(`${label} - le bouton de la barre ouvre la fenêtre d'un tableau neuf (« Poser le tableau croisé », sans « Retirer », rien de choisi)`, fresh.open && fresh.ok === 'Poser le tableau croisé' && fresh.removeHidden && fresh.row1 === '', fresh);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`${label} - Échap ferme la fenêtre sans rien écrire, le clavier revient dans la grille`, !(await windowOpen(page)) && (await pivotRowAttrs(page)).filter(Boolean).length === 1 && await insideEditor(page));

  // 6) La même fenêtre en anglais.
  await page.evaluate(() => { I18n.setLang('en'); document.getElementById('editor-container').scrollTop = 0; });
  await page.waitForTimeout(150);
  await clickInPanel(page, '.pp-pivot-edit', `${label} - Modifier (anglais)`);
  await page.waitForTimeout(500);
  await shot(page, `pivot-${theme}-window-en`);
  const english = await page.evaluate(() => ({ title: document.querySelector('#pp-pivot-modal h3').textContent, ok: document.querySelector('#pp-pivot-modal .var-modal-primary').textContent, hint: document.getElementById('pp-pivot-calc').placeholder, filter: document.getElementById('pp-pivot-filter-label').textContent, format: document.getElementById('pp-pivot-fmt-label').textContent, none: (document.querySelector('#pp-pivot-modal .pp-pivot-filter .var-loop-hint') || {}).textContent, styles: Array.from(document.getElementById('pp-pivot-fmt-style').options).map(o => o.textContent) }));
  const enBox = await boxOf(page, '#pp-pivot-modal .pp-modal-box');
  check(`${label} - en anglais, la fenêtre est écrite en anglais et tient dans le panneau`, english.title === 'Pivot table' && english.ok === 'Save' && english.hint.indexOf('Products') !== -1 && !!enBox && enBox.inViewport, { english, enBox });
  check(`${label} - en anglais, « Rows kept » et « How numbers are written » (séparateurs, décimales) sont écrits en anglais`, english.filter === 'Rows kept' && english.format === 'How numbers are written' && english.none === 'Every row read is used.' && english.styles[0] === 'The language’s own' && /French|Anglo/.test(english.styles.join()), english);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.evaluate(() => I18n.setLang('fr'));

  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
