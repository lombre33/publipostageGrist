#!/usr/bin/env node
// Tableau de document lié à un modèle Grille (js/linked-table.js, css/linked-table.css, js/floating-toolbars.js, js/main-toolbar.js ; lots 6a et 6b) : le panneau de 700x400 d'Antoine, à la VRAIE
// souris (page.mouse) et au VRAI clavier (frappe, Tab, Entrée, Échap, Ctrl+Z), en clair et en sombre, puis en anglais. Ce que scenarios-linked-table.js ne peut pas voir depuis la page :
//  - le survol du bouton Tableau ouvre un volet dont la ligne « Tableau d'un modèle Grille… » tient dans le panneau et est au premier plan (la ligne ne tenait pas dans le menu « Lien et blocs de
//    contenu », déjà plein) ; l'info-bulle du bouton ne se superpose pas au volet ; un clic sur le bouton pose toujours un tableau ordinaire ;
//  - la liste avec recherche s'ouvre dans le panneau, champ au clavier, modèles par ordre alphabétique, ligne sans tableau grisée avec sa raison, frappe réelle, « Aucun modèle Grille ne
//    correspond. », Échap qui rend le clavier à l'éditeur ; un clic sur une ligne pose le tableau, curseur dans la première case ;
//  - la barre du tableau : un seul bouton du lien (la barre reste sur une ligne), son menu (nom du modèle, règle de la grille, « Détacher ») ouvert à la souris dans le panneau et au premier plan, contrastes ≥ 4,5:1, un nom très long coupé par « … » dans le menu ;
//  - le repère (filet d'accent du bord gauche) dans la marge, à 3:1 au moins du fond de la page, nom du modèle pour les lecteurs d'écran ;
//  - les boutons grisés par le tableau lié ne reçoivent pas la souris et un clic dessus ne change rien ; « Détacher » à la souris, un seul Ctrl+Z ;
//  - le suivi des modifications (vrai bouton) : la frappe dans le tableau lié est refusée, dans un tableau ordinaire elle se suit ; le bouton du lien, son menu (« Détacher » grisé avec la raison) et le repère le disent ;
//  - le clavier seul : le focus sur le bouton Tableau ouvre le volet, Tab atteint la ligne, Entrée ouvre la liste, la frappe filtre, Entrée pose ;
//  - les deux sens (lot 6b) : le menu du lien tient dans le panneau avec ses trois lignes (contrastes ≥ 4,5:1), « Mettre à jour depuis le modèle » ramène les cases du modèle (curseur dans la
//    même case, ligne d'état), « Envoyer au modèle » ouvre une confirmation dans le panneau, « Annuler » n'écrit rien, « Envoyer » écrit le modèle et lui seul.
// Lancé par run-headless.mjs (groupe Node "linkedTableMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-linked-table-mouse.mjs
// LINKED_TABLE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.LINKED_TABLE_MOUSE_PORT || 9003);
const SHOTS = process.env.LINKED_TABLE_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-dialogs-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-linked-table-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });

const TABLE = '#v2-btn-table';
const ROW = '#v2-btn-linked-table';
const FLYOUT = '#v2-table-flyout';
const PICKER = '#v2-linked-table-search';
const BAR = '.v2-table-toolbar';
const LBTN = '#v2-table-linked-btn';
const MENU = '.v2-linked-menu';
const MENU_ROW = MENU + ' [data-action="linked-detach"]';
const ROW_PULL = MENU + ' [data-action="linked-pull"]';
const ROW_PUSH = MENU + ' [data-action="linked-push"]';
const ROW_OPEN = MENU + ' [data-action="linked-open"]';
const RETURN_BAR = '#linked-return-bar';
const RETURN_BTN = '#btn-linked-return';
const DIALOG = '#pp-dialog-modal';
const DIALOG_CANCEL = DIALOG + ' .pp-modal-actions button:first-of-type';
const DIALOG_OK = DIALOG + ' .var-modal-primary';
const GRID = '<table><tbody>' + [1, 2, 3].map(r => '<tr>' + ['A', 'B', 'C'].map(c => `<td><p>${c}${r}</p></td>`).join('') + '</tr>').join('') + '</tbody></table>';
const LONG_NAME = 'Un nom de modèle Grille vraiment très long pour la barre du tableau';
const DOC = '<p>Bonjour le monde entier</p><p>Deuxième ligne</p>';

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const centerOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
}, selector);
// L'élément, tel que la souris le voit : visible dans le panneau et au premier plan (rien d'autre n'est dessus à son centre).
const hit = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { found: true, w: Math.round(r.width), h: Math.round(r.height), inPanel: r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
    onTop: !!top && (top === el || el.contains(top)), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
}, selector);
const seen = box => box.found && box.inPanel && box.onTop;
// Un bouton visible de la fenêtre (#pp-dialog-modal) par son libellé : « Enregistrer » et les autres choix de la question « Modifications non enregistrées » partagent des classes avec des boutons cachés de la fenêtre.
const dialogButton = label => page.evaluate(t => {
  const b = Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).find(e => !e.hidden && e.textContent === t);
  if (!b) return { found: false };
  const r = b.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);
  return { found: true, x, y, w: Math.round(r.width), h: Math.round(r.height), inPanel: r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === b || b.contains(top)) };
}, label);
const clickDialogButton = async label => {
  const at = await dialogButton(label);
  if (!at.found) return false;
  await page.mouse.move(at.x, at.y, { steps: 6 });
  await page.waitForTimeout(100);
  await page.mouse.click(at.x, at.y);
  return true;
};
const html = () => page.evaluate(() => Editor.getHTML());
const linkedIds = () => page.evaluate(() => LinkedTable.linkedTables(EditorCore.getEditor().state.doc).map(({ node }) => node.attrs.linkedTemplate));
const focusIn = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.closest('.tiptap') ? 'editor' : (a.id || a.className || a.tagName)) : 'rien'; });
const cellOfCursor = () => page.evaluate(() => { const s = getSelection(); const n = s.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); const td = el && el.closest('td'); return td ? td.textContent.trim() : null; });
// Pointe un texte de l'éditeur (milieu par défaut) pour y cliquer pour de vrai.
const pointOf = (text, at = 0.5) => page.evaluate(({ text, at }) => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const i = n.textContent.indexOf(text);
    if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width * at, y: b.top + b.height / 2 };
  }
  return null;
}, { text, at });
async function setDoc(doc) {
  await page.evaluate(d => { Editor.setTrackChanges(false); Editor.setHTML(d); }, doc);
  await page.waitForTimeout(250);
}
// Le contraste de deux couleurs « rgb(...) » (WCAG 2) et le fond opaque d'un élément (le premier ancêtre qui en a un).
const contrastOf = (fg, bg) => page.evaluate(([fg, bg]) => {
  const parse = c => c.match(/rgba?\(([^)]+)\)/)[1].split(',').slice(0, 3).map(Number);
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const a = lum(parse(fg)), b = lum(parse(bg));
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}, [fg, bg]);
const backgroundOf = selector => page.evaluate(sel => {
  let el = document.querySelector(sel);
  while (el) {
    const c = getComputedStyle(el).backgroundColor;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(',').map(Number); if (p.length === 3 || p[3] === undefined || p[3] >= 0.99) return c; }
    el = el.parentElement;
  }
  return 'rgb(255, 255, 255)';
}, selector);
// Survol réel du bouton Tableau : la souris arrive depuis le bas du document (jamais par-dessus un autre volet de la barre).
async function openMenu() {
  const c = await centerOf(TABLE);
  await page.mouse.move(c.x, c.y + 150);
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(350);
  return c;
}
async function closeMenu() {
  await page.mouse.move(WIDTH - 30, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(250);
}
// Une ligne du menu, à la vraie souris : le volet s'ouvre au survol du bouton, puis la main descend du bouton sur la ligne (verticalement, sans quitter le volet) et clique.
async function pressRow(selector, { click = true, from = TABLE } = {}) {
  const c = await centerOf(from);
  await page.mouse.move(c.x, c.y + 150);
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(350);
  const r = await centerOf(selector);
  const x = Math.min(Math.max(c.x, r.l + 8), r.r - 8);
  await page.mouse.move(x, r.y, { steps: 8 });
  await page.waitForTimeout(100);
  if (click) { await page.mouse.click(x, r.y); await page.waitForTimeout(300); }
  return { x, y: r.y };
}
const pickerRows = () => page.evaluate(() => Array.from(document.querySelectorAll('#v2-linked-table-search .ss-option')).map(li => ({
  name: (li.querySelector('.ss-name') || li).textContent.trim(),
  reason: (li.querySelector('.ss-reason') || { textContent: '' }).textContent.trim(),
  disabled: li.getAttribute('aria-disabled') === 'true',
})));
const pickerOpen = () => page.evaluate(() => !!document.getElementById('v2-linked-table-search'));
async function openPickerByMouse() {
  await pressRow(ROW);
  await page.waitForSelector(PICKER + ' .ss-option', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
}
async function clickOption(text) {
  const at = await page.evaluate(t => {
    const li = Array.from(document.querySelectorAll('#v2-linked-table-search .ss-option')).find(e => e.textContent.indexOf(t) !== -1);
    if (!li) return null;
    const r = li.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, text);
  if (!at) return false;
  await page.mouse.move(at.x, at.y, { steps: 4 });
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(400);
  return true;
}
async function clickInText(text, at = 0.5) {
  const p = await pointOf(text, at);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
}

let modelsMade = false;
async function makeModels() {
  if (modelsMade) return;
  await page.evaluate(async ({ grid, longName }) => {
    for (const [name, content] of [['Grille des tarifs', grid], ['Grille vide', '<p>rien</p>'], [longName, grid]]) await Templates.save(null, name, content, '', null, null, 'grille', null);
    await Templates.save(null, 'Lettre type', grid, '', null, null, 'document', null);
    await Templates.loadAll();
  }, { grid: GRID, longName: LONG_NAME });
  modelsMade = true;
}

async function run(theme) {
  const T = theme;
  await makeModels();

  // 1) Le menu : un survol réel du bouton Tableau ouvre le volet, sa ligne est dans le panneau et au premier plan.
  await setDoc(DOC);
  await clickInText('entier', 0.98);
  const tableBtn = await hit(TABLE);
  check(`${T}, menu : le bouton Tableau est visible dans le panneau ${WIDTH}x${HEIGHT} et sous la souris`, seen(tableBtn), tableBtn);
  await openMenu();
  const flyout = await hit(FLYOUT);
  const row = await hit(ROW);
  const label = await hit(FLYOUT + ' .v2-hover-flyout-label');
  check(`${T}, menu : au survol, le volet s'ouvre dans le panneau, titre et ligne au premier plan`, flyout.found && flyout.inPanel && seen(row) && label.found, { flyout, row, label });
  const info = await page.evaluate(() => {
    const r = document.getElementById('v2-btn-linked-table');
    const button = document.getElementById('v2-btn-table');
    return { text: r.textContent.trim(), icon: !!r.querySelector('.v2-menu-row-icon svg'), label: document.querySelector('#v2-table-flyout .v2-hover-flyout-label').textContent.trim(),
      disabled: r.getAttribute('aria-disabled'), tip: button.getAttribute('data-tip'), name: button.getAttribute('aria-label'), expanded: button.getAttribute('aria-expanded') };
  });
  // Comme Image, Enregistrer et Exporter, le bouton n'a pas d'info-bulle propre : elle se retirerait dès l'ouverture du volet, dont le titre dit le bouton (js/shortcuts.js y écrit sa touche).
  check(`${T}, menu : « Tableau d’un modèle Grille… » avec son icône sous le titre « Insérer un tableau », active, et le bouton n'a pas d'info-bulle qui se superposerait au volet`,
    info.text === 'Tableau d’un modèle Grille…' && info.icon && info.label === 'Insérer un tableau' && info.disabled !== 'true' && info.expanded === 'true' && info.tip === null && info.name === 'Insérer un tableau', info);
  await snap(`${T}-1-menu`);
  await closeMenu();
  const closed = await page.evaluate(() => getComputedStyle(document.getElementById('v2-table-flyout')).display === 'none');
  check(`${T}, menu : la souris partie, le volet se referme`, closed);
  // Le bouton Tableau garde sa fonction : un clic, hors d'un tableau, pose un tableau ordinaire (2 lignes), sans lien.
  const before = await html();
  const btn = await centerOf(TABLE);
  await page.mouse.move(btn.x, btn.y + 150);
  await page.mouse.click(btn.x, btn.y);
  await page.waitForTimeout(250);
  const plain = await html();
  check(`${T}, bouton Tableau : un clic pose toujours un tableau ordinaire, sans lien`, /<table/.test(plain) && !/data-linked-template/.test(plain) && (plain.match(/<tr/g) || []).length === 2 && !/<table/.test(before), plain);
  await closeMenu();

  // 2) La liste avec recherche, ouverte par la ligne : dans le panneau, trois modèles Grille par ordre alphabétique, frappe réelle, Échap.
  await setDoc(DOC);
  await clickInText('entier', 0.98);
  await openPickerByMouse();
  const panelBox = await hit(PICKER + ' .ss-panel');
  const inputBox = await hit(PICKER + ' .ss-input');
  check(`${T}, liste : elle s'ouvre dans le panneau ${WIDTH}x${HEIGHT}, champ de recherche au premier plan et au clavier`, seen(inputBox) && panelBox.found && panelBox.inPanel && (await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('ss-input'))), { panelBox, inputBox });
  const rows = await pickerRows();
  const plainNames = rows.map(r => r.name.replace(/Ce modèle n’a pas de tableau$/, ''));
  check(`${T}, liste : les modèles Grille par ordre alphabétique, jamais le modèle d'un autre genre ; « Grille vide » grisé avec « Ce modèle n’a pas de tableau »`,
    plainNames.join('|') === 'Grille des tarifs|Grille vide|' + LONG_NAME && rows[1].disabled && rows[1].reason === 'Ce modèle n’a pas de tableau' && !rows[0].disabled && !rows[2].disabled, rows);
  await snap(`${T}-2-liste`);
  await page.keyboard.type('tarif');
  await page.waitForTimeout(200);
  const narrowed = await pickerRows();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('zzzz');
  await page.waitForTimeout(200);
  const none = await page.evaluate(() => { const e = document.querySelector('#v2-linked-table-search .ss-empty'); const r = e && e.getBoundingClientRect(); return e ? { hidden: e.hidden, text: e.textContent.trim(), inPanel: r.width > 0 && r.bottom <= innerHeight } : null; });
  check(`${T}, liste : « tarif » ne laisse que « Grille des tarifs » ; « zzzz » dit « Aucun modèle Grille ne correspond. »`, narrowed.length === 1 && narrowed[0].name === 'Grille des tarifs' && none && !none.hidden && none.text === 'Aucun modèle Grille ne correspond.' && none.inPanel, { narrowed, none });
  await snap(`${T}-3-liste-vide`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(`${T}, liste : Échap la ferme, rien n'est posé, le clavier revient dans l'éditeur`, !(await pickerOpen()) && !/<table/.test(await html()) && (await focusIn()) === 'editor', { open: await pickerOpen(), focus: await focusIn(), html: await html() });

  // 3) Le choix d'une ligne à la souris pose le tableau : curseur dans sa première case, barre du tableau avec son bouton du lien, qui ouvre un menu.
  await openPickerByMouse();
  const chosen = await clickOption('Grille des tarifs');
  const ids = await linkedIds();
  const doc1 = await html();
  check(`${T}, pose : un clic sur « Grille des tarifs » pose son tableau (3 lignes, 3 colonnes, mêmes cases), lié au modèle, la liste se ferme`,
    chosen && ids.length === 1 && (doc1.match(/<tr/g) || []).length === 3 && /A1/.test(doc1) && /C3/.test(doc1) && !(await pickerOpen()), { chosen, ids, doc1: doc1.slice(0, 200) });
  check(`${T}, pose : le curseur est dans la première case`, (await cellOfCursor()) === 'A1', await cellOfCursor());
  const bar = await hit(BAR);
  const linkBtn = await hit(LBTN);
  const barBox = await centerOf(BAR);
  const barInfo = await page.evaluate(() => { const b = document.getElementById('v2-table-linked-btn'); const r = document.querySelector('.v2-table-toolbar').getBoundingClientRect(); return { title: b.title, svgs: b.querySelectorAll('svg').length, w: Math.round(b.getBoundingClientRect().width), barH: Math.round(r.height), expanded: b.getAttribute('aria-expanded') }; });
  check(`${T}, barre : elle s'ouvre sur le lien : le bouton du lien est dans le panneau et au premier plan, la barre reste sur une seule ligne`, seen(linkBtn) && bar.inPanel && linkBtn.r <= barBox.r - 2 && barInfo.barH <= 44 && barInfo.w <= 32, { bar, linkBtn, barInfo });
  check(`${T}, barre : l'info-bulle du bouton dit « Grille des tarifs »`, /^Tableau lié au modèle Grille « Grille des tarifs »/.test(barInfo.title) && barInfo.svgs === 2 && barInfo.expanded === 'false', barInfo);
  const barBg = await backgroundOf(LBTN);
  const btnColor = await page.evaluate(() => getComputedStyle(document.getElementById('v2-table-linked-btn')).color);
  check(`${T}, barre : l'icône du lien a un contraste d'au moins 4,5:1 (${btnColor} sur ${barBg})`, (await contrastOf(btnColor, barBg)) >= 4.5, { btnColor, barBg });
  await snap(`${T}-4-barre`);
  // Son menu, à la vraie souris : un clic sur le bouton l'ouvre, dans le panneau et au premier plan.
  const lb = await centerOf(LBTN);
  await page.mouse.move(lb.x, lb.y, { steps: 5 });
  await page.mouse.click(lb.x, lb.y);
  await page.waitForTimeout(300);
  const menuBox = await hit(MENU);
  const menuHead = await hit(MENU + ' .v2-linked-menu-head');
  const menuHint = await hit(MENU + ' .v2-linked-menu-hint');
  const menuRow = await hit(MENU_ROW);
  check(`${T}, menu du lien : un clic sur le bouton l'ouvre dans le panneau ${WIDTH}x${HEIGHT}, nom, texte et « Détacher » au premier plan`, menuBox.found && menuBox.inPanel && seen(menuHead) && seen(menuHint) && seen(menuRow), { menuBox, menuHead, menuHint, menuRow });
  const menuInfo = await page.evaluate(() => {
    const m = document.querySelector('.v2-linked-menu');
    const row = m.querySelector('[data-action="linked-detach"]');
    const bar = document.querySelector('.v2-table-toolbar');
    return { name: m.querySelector('.v2-linked-menu-name').textContent, hint: m.querySelector('.v2-linked-menu-hint').textContent, row: row.textContent.trim(), rowTitle: row.title, rowDisabled: row.getAttribute('aria-disabled'),
      expanded: document.getElementById('v2-table-linked-btn').getAttribute('aria-expanded'), barOpen: getComputedStyle(bar).display !== 'none' };
  });
  check(`${T}, menu du lien : « Grille des tarifs », ses cases suivent les règles d'une grille, « Détacher du modèle » actif ; la barre reste ouverte`,
    menuInfo.name === 'Grille des tarifs' && /^Ses cases suivent les règles d’une grille/.test(menuInfo.hint) && menuInfo.row === 'Détacher du modèle' && /^Détacher du modèle Grille/.test(menuInfo.rowTitle) && menuInfo.rowDisabled === 'false' && menuInfo.expanded === 'true' && menuInfo.barOpen, menuInfo);
  const menuBg = await backgroundOf(MENU);
  const menuColors = await page.evaluate(() => { const m = document.querySelector('.v2-linked-menu'); const c = sel => getComputedStyle(m.querySelector(sel)).color; return { name: c('.v2-linked-menu-name'), hint: c('.v2-linked-menu-hint'), row: c('.v2-linked-menu-row') }; });
  const menuContrasts = { name: await contrastOf(menuColors.name, menuBg), hint: await contrastOf(menuColors.hint, menuBg), row: await contrastOf(menuColors.row, menuBg) };
  check(`${T}, menu du lien : nom, texte et « Détacher » ont un contraste d'au moins 4,5:1 sur le fond du menu (${menuBg})`, Object.values(menuContrasts).every(c => c >= 4.5), menuContrasts);
  await snap(`${T}-4b-menu`);
  // Un appui ailleurs, dans le texte du tableau, referme le menu : la barre, elle, reste (le curseur est toujours dans le tableau).
  await clickInText('A1');
  const menuClosed = await page.evaluate(() => ({ shown: getComputedStyle(document.querySelector('.v2-linked-menu')).display !== 'none', expanded: document.getElementById('v2-table-linked-btn').getAttribute('aria-expanded') }));
  check(`${T}, menu du lien : un appui dans le texte le referme`, !menuClosed.shown && menuClosed.expanded === 'false', menuClosed);
  // Le même bouton, rappuyé, ferme le menu qu'il a ouvert.
  const lb1 = await centerOf(LBTN);
  await page.mouse.click(lb1.x, lb1.y);
  await page.waitForTimeout(200);
  await page.mouse.click(lb1.x, lb1.y);
  await page.waitForTimeout(200);
  const toggled = await page.evaluate(() => ({ shown: getComputedStyle(document.querySelector('.v2-linked-menu')).display !== 'none', expanded: document.getElementById('v2-table-linked-btn').getAttribute('aria-expanded') }));
  check(`${T}, menu du lien : un second appui sur le bouton le referme`, !toggled.shown && toggled.expanded === 'false', toggled);

  // 4) Le repère : le curseur hors du tableau, un filet d'accent le long du bord gauche, à 3:1 au moins du fond de la page.
  await clickInText('Deuxième');
  const marker = await page.evaluate(() => {
    const w = document.querySelector('.tiptap .tableWrapper');
    const cs = getComputedStyle(w);
    const r = w.getBoundingClientRect();
    return { cls: w.className, shadow: cs.boxShadow, left: r.left, label: w.getAttribute('aria-label') };
  });
  const markerColor = (marker.shadow.match(/rgba?\([^)]+\)/) || [''])[0];
  const pageBg = await backgroundOf('.tiptap .tableWrapper');
  const markerContrast = markerColor ? await contrastOf(markerColor, pageBg) : 0;
  check(`${T}, repère : le tableau lié porte son filet (${markerColor}) dans la marge, dans le panneau, contraste ${markerContrast.toFixed(1)}:1 sur ${pageBg}`, /pp-linked-table/.test(marker.cls) && marker.left - 4 >= 0 && markerContrast >= 3, { marker, pageBg, markerContrast });
  check(`${T}, repère : le nom du modèle est dit aux lecteurs d'écran`, marker.label === 'Tableau lié au modèle Grille « Grille des tarifs »', marker.label);
  await snap(`${T}-5-repere`);

  // 5) Les boutons que le tableau lié grise : ils ne reçoivent pas la souris et un clic dessus ne fait rien. Curseur dans une case, à la souris.
  await clickInText('B2');
  const greyed = {};
  for (const id of ['v2-btn-table', 'v2-btn-two-columns', 'v2-btn-toc']) {
    greyed[id] = await page.evaluate(i => { const e = document.getElementById(i); const cs = getComputedStyle(e); return { locked: e.classList.contains('v2-hf-locked'), opacity: cs.opacity, events: cs.pointerEvents }; }, id);
  }
  check(`${T}, boutons : Tableau, Deux colonnes et Sommaire sont grisés (jamais retirés) quand le curseur est dans le tableau lié`, Object.values(greyed).every(g => g.locked && g.events === 'none' && Number(g.opacity) < 0.5), greyed);
  const docBefore = await html();
  for (const id of ['v2-btn-table', 'v2-btn-two-columns', 'v2-btn-toc']) {
    const c = await centerOf('#' + id);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(120);
  }
  const lockedLine = await pressRow('#v2-btn-citation', { from: '#v2-btn-link' });
  await closeMenu();
  const lockedCode = await pressRow('#v2-btn-code-block', { from: '#v2-btn-link' });
  await closeMenu();
  check(`${T}, boutons : un clic sur ces boutons et sur « Citation » et « Bloc de code » (grisés) ne change rien au document`, (await html()) === docBefore, { lockedLine, lockedCode });
  // La ligne du menu Tableau, elle, est grisée avec sa raison : un tableau lié ne se pose pas dans un tableau.
  await openMenu();
  const menuOpenWhileLocked = await page.evaluate(() => getComputedStyle(document.getElementById('v2-table-flyout')).display);
  check(`${T}, menu : curseur dans le tableau lié, le bouton Tableau est grisé et son volet ne s'ouvre pas`, menuOpenWhileLocked === 'none', { menuOpenWhileLocked });
  await closeMenu();

  // 6) « Détacher » à la souris, par le menu du lien : le tableau reste, le lien part, le menu se referme, les boutons se dégrisent ; Ctrl+Z rend le lien.
  await clickInText('B2');
  const casesBefore = (await html()).replace(/ data-linked-template="\d+"/, '');
  const linkBtnBox = await hit(LBTN);
  check(`${T}, Détacher : le curseur dans le tableau, le bouton du lien est dans la barre, visible et au premier plan`, seen(linkBtnBox), linkBtnBox);
  const d = await centerOf(LBTN);
  await page.mouse.move(d.x, d.y, { steps: 5 });
  await page.mouse.click(d.x, d.y);
  await page.waitForTimeout(300);
  const detachAt = await centerOf(MENU_ROW);
  await page.mouse.move(detachAt.x, detachAt.y, { steps: 6 });
  await page.waitForTimeout(100);
  await page.mouse.click(detachAt.x, detachAt.y);
  await page.waitForTimeout(300);
  const detachedHtml = await html();
  check(`${T}, Détacher : la ligne « Détacher du modèle » du menu : le lien part, les cases restent`, !/data-linked-template/.test(detachedHtml) && detachedHtml === casesBefore && (await linkedIds()).length === 0, detachedHtml.slice(0, 160));
  const afterDetach = await page.evaluate(() => ({ group: Array.from(document.querySelectorAll('.v2-table-toolbar [data-linked-only]')).some(e => !e.hidden && getComputedStyle(e).display !== 'none'), tableLocked: document.getElementById('v2-btn-table').classList.contains('v2-hf-locked'),
    mark: Array.from(document.querySelectorAll('.tiptap .tableWrapper')).some(w => /pp-linked/.test(w.className)), menuShown: getComputedStyle(document.querySelector('.v2-linked-menu')).display !== 'none', expanded: document.getElementById('v2-table-linked-btn').getAttribute('aria-expanded') }));
  check(`${T}, Détacher : le menu se referme, le bouton du lien, le repère et le grisé des boutons disparaissent`, !afterDetach.group && !afterDetach.tableLocked && !afterDetach.mark && !afterDetach.menuShown && afterDetach.expanded === 'false', afterDetach);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  check(`${T}, Détacher : Ctrl+Z (un seul) rend le lien`, (await linkedIds()).length === 1 && /data-linked-template/.test(await html()), await html());

  // 7) Suivi des modifications (bouton réel) : le tableau lié est verrouillé, le tableau ordinaire se suit.
  await setDoc('<p>Avant</p>' + GRID + '<p>Entre</p><table><tbody><tr><td><p>Libre</p></td><td><p>Autre</p></td></tr></tbody></table>');
  // Le premier tableau est lié à « Grille des tarifs » (la pose le fait ; ici il est écrit tel quel dans le document).
  await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    const model = Templates.getCached().find(t => t.nom === 'Grille des tarifs');
    let pos = null;
    ed.state.doc.descendants((n, p) => { if (pos == null && n.type.name === 'table') pos = p; return pos == null; });
    ed.view.dispatch(ed.state.tr.setNodeAttribute(pos, 'linkedTemplate', model.id));
  });
  await page.waitForTimeout(250);
  await clickInText('A1');
  const track = await centerOf('#v2-btn-track-changes');
  await page.mouse.move(track.x, track.y, { steps: 4 });
  await page.mouse.click(track.x, track.y);
  await page.waitForTimeout(300);
  await clickInText('A1');
  await page.keyboard.type('zz');
  await page.waitForTimeout(250);
  const lockedCell = await page.evaluate(() => { let t = ''; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'tableCell' && /A1/.test(n.textContent)) t = n.textContent; return true; }); return t; });
  const lockedBtn = await page.evaluate(() => { const b = document.getElementById('v2-table-linked-btn'); return { locked: b.classList.contains('is-locked'), title: b.title, mark: /pp-linked-locked/.test(document.querySelector('.tiptap .tableWrapper').className) }; });
  check(`${T}, suivi : la frappe dans le tableau lié est refusée (la case reste « A1 »), le bouton du lien et le repère se verrouillent`, lockedCell === 'A1' && lockedBtn.locked && lockedBtn.mark && /verrouillé/.test(lockedBtn.title), { lockedCell, lockedBtn });
  // Son menu dit pourquoi : « Détacher » est grisé avec la raison, jamais retiré, et un appui dessus ne change rien.
  const lc = await centerOf(LBTN);
  await page.mouse.move(lc.x, lc.y, { steps: 4 });
  await page.mouse.click(lc.x, lc.y);
  await page.waitForTimeout(300);
  const lockedMenu = await page.evaluate(() => {
    const m = document.querySelector('.v2-linked-menu');
    const row = m.querySelector('[data-action="linked-detach"]');
    return { shown: getComputedStyle(m).display !== 'none', hint: m.querySelector('.v2-linked-menu-hint').textContent, disabled: row.getAttribute('aria-disabled'), title: row.title, opacity: Number(getComputedStyle(row).opacity) };
  });
  const lockedRow = await centerOf(MENU_ROW);
  const beforeLockedPress = await html();
  await page.mouse.move(lockedRow.x, lockedRow.y, { steps: 5 });
  await page.mouse.click(lockedRow.x, lockedRow.y);
  await page.waitForTimeout(250);
  check(`${T}, suivi : le menu du lien dit « Verrouillé tant que le suivi des modifications est allumé. », « Détacher » est grisé avec la raison et un appui dessus ne change rien`,
    lockedMenu.shown && /^Verrouillé tant que le suivi/.test(lockedMenu.hint) && lockedMenu.disabled === 'true' && /verrouillé/.test(lockedMenu.title) && lockedMenu.opacity < 0.6 && (await html()) === beforeLockedPress && (await linkedIds()).length === 1, { lockedMenu });
  await snap(`${T}-6-suivi`);
  await clickInText('Autre');
  await page.keyboard.type('yy');
  await page.waitForTimeout(250);
  const freeCell = await page.evaluate(() => { let t = ''; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'tableCell' && /yy/.test(n.textContent)) t = n.textContent; return true; }); return t; });
  check(`${T}, suivi : dans le tableau sans lien la frappe se suit toujours`, /yy/.test(freeCell) && /Au/.test(freeCell), freeCell);
  // Sous le suivi, la ligne du menu Tableau (bouton actif, curseur dans le tableau ordinaire) est grisée avec sa raison ; un clic dessus n'ouvre rien.
  await clickInText('Libre');
  const trackedRow = await pressRow(ROW, { click: false });
  const trackedState = await page.evaluate(() => { const r = document.getElementById('v2-btn-linked-table'); return { disabled: r.getAttribute('aria-disabled'), greyed: r.classList.contains('v2-hover-row-disabled'), title: r.title }; });
  await page.mouse.click(trackedRow.x, trackedRow.y);
  await page.waitForTimeout(300);
  check(`${T}, suivi : la ligne du menu Tableau est grisée avec « Indisponible avec le suivi des modifications… » et ne s'ouvre pas`, trackedState.disabled === 'true' && trackedState.greyed && /^Indisponible avec le suivi des modifications/.test(trackedState.title) && !(await pickerOpen()), trackedState);
  await closeMenu();
  await page.mouse.click(track.x, track.y);
  await page.waitForTimeout(300);
  // Suivi éteint, le curseur dans le tableau ordinaire : la ligne est grisée parce qu'un tableau lié ne se pose pas dans un tableau.
  await clickInText('Libre');
  const inTableRow = await pressRow(ROW, { click: false });
  const inTableState = await page.evaluate(() => { const r = document.getElementById('v2-btn-linked-table'); return { disabled: r.getAttribute('aria-disabled'), greyed: r.classList.contains('v2-hover-row-disabled'), title: r.title }; });
  await page.mouse.click(inTableRow.x, inTableRow.y);
  await page.waitForTimeout(300);
  check(`${T}, menu : le curseur dans un tableau ordinaire, la ligne est grisée avec « Un tableau lié se pose hors d’un tableau… » et ne s'ouvre pas`, inTableState.disabled === 'true' && inTableState.greyed && /^Un tableau lié se pose hors d’un tableau/.test(inTableState.title) && !(await pickerOpen()), inTableState);
  await snap(`${T}-6b-ligne-grisee`);
  await closeMenu();
  await clickInText('A1');
  await page.keyboard.type('ok');
  await page.waitForTimeout(250);
  const freeAgain = await page.evaluate(() => { let t = ''; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'tableCell' && /ok/.test(n.textContent) && /^A/.test(n.textContent)) t = n.textContent; return true; }); return t; });
  check(`${T}, suivi : le suivi éteint, le tableau lié reprend la frappe`, /ok/.test(freeAgain) && !(await page.evaluate(() => Editor.isTrackChangesOn())), freeAgain);

  // 8) Au clavier : Tab sur le bouton Tableau ouvre le volet, Tab suivant atteint la ligne, Entrée ouvre la liste, frappe, Entrée pose.
  await setDoc(DOC);
  await clickInText('entier', 0.98);
  await page.focus(TABLE);
  await page.waitForTimeout(250);
  const volet = await page.evaluate(() => getComputedStyle(document.getElementById('v2-table-flyout')).display);
  await page.keyboard.press('Tab');
  const onRow = await page.evaluate(() => document.activeElement && document.activeElement.id);
  check(`${T}, clavier : le focus sur le bouton Tableau ouvre le volet et Tab atteint la ligne « Tableau d’un modèle Grille… »`, volet !== 'none' && onRow === 'v2-btn-linked-table', { volet, onRow });
  await page.keyboard.press('Enter');
  await page.waitForSelector(PICKER + ' .ss-option', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
  await page.keyboard.type('long');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const longIds = await linkedIds();
  check(`${T}, clavier : Entrée sur la ligne ouvre la liste, « long » + Entrée pose le tableau du modèle au nom long, le clavier revient dans l'éditeur`, longIds.length === 1 && (await focusIn()) === 'editor' && (await cellOfCursor()) === 'A1', { longIds, focus: await focusIn(), cell: await cellOfCursor() });
  // Le nom très long : la barre reste sur une ligne dans le panneau, le menu coupe le nom par « … » (l'info-bulle de l'en-tête le dit en entier) et tient dans le panneau.
  const lg = await centerOf(LBTN);
  await page.mouse.move(lg.x, lg.y, { steps: 4 });
  await page.mouse.click(lg.x, lg.y);
  await page.waitForTimeout(300);
  const longMenu = await page.evaluate(() => {
    const bar = document.querySelector('.v2-table-toolbar').getBoundingClientRect();
    const m = document.querySelector('.v2-linked-menu');
    const n = m.querySelector('.v2-linked-menu-name');
    const mb = m.getBoundingClientRect();
    return { barH: Math.round(bar.height), barInPanel: bar.left >= 0 && bar.right <= innerWidth, clipped: n.scrollWidth > n.clientWidth, full: m.querySelector('.v2-linked-menu-head').title === n.textContent && n.textContent.length > 40,
      menuW: Math.round(mb.width), menuInPanel: mb.left >= 0 && mb.right <= innerWidth && mb.top >= 0 && mb.bottom <= innerHeight };
  });
  check(`${T}, barre : un nom très long ne change pas la barre (une ligne, dans le panneau) ; le menu le coupe par « … » (l'info-bulle le dit en entier) et tient dans le panneau`, longMenu.barH <= 44 && longMenu.barInPanel && longMenu.clipped && longMenu.full && longMenu.menuW <= 240 && longMenu.menuInPanel, longMenu);
  await snap(`${T}-7-nom-long`);

  // 9) Les deux sens, à la vraie souris. Le menu du lien : trois lignes dans le panneau, au premier plan, lisibles ; « Mettre à jour depuis le modèle » ramène les cases du modèle (le curseur reste
  // dans la même case) ; « Envoyer au modèle » demande confirmation dans une fenêtre qui tient dans le panneau ; « Annuler » n'écrit rien ; « Envoyer » écrit le modèle et lui seul.
  await setDoc(DOC);
  await clickInText('entier', 0.98);
  await openPickerByMouse();
  await clickOption('Grille des tarifs');
  const modelId = await page.evaluate(() => Templates.getCached().find(t => t.nom === 'Grille des tarifs').id);
  const modelRow = () => page.evaluate(id => __gristStub.getRow(Templates.TABLE_NAME, id), modelId);
  const statusNow = () => page.evaluate(() => ({ text: document.getElementById('status-msg').textContent, error: document.getElementById('status-msg').classList.contains('error-msg') }));
  const dialogState = () => page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    const open = !!ov && ov.style.display !== 'none';
    return { open, title: open ? ov.querySelector('h3').textContent : '', message: open ? ov.querySelector('.pp-dialog-message').textContent : '',
      buttons: open ? Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent) : [] };
  });
  const openLinkMenu = async () => {
    const lb9 = await centerOf(LBTN);
    await page.mouse.move(lb9.x, lb9.y, { steps: 5 });
    await page.mouse.click(lb9.x, lb9.y);
    await page.waitForTimeout(300);
  };
  const clickAt = async (selector) => {
    const at = await centerOf(selector);
    await page.mouse.move(at.x, at.y, { steps: 6 });
    await page.waitForTimeout(100);
    await page.mouse.click(at.x, at.y);
  };
  await clickInText('B2');
  await page.keyboard.type('zz');
  await page.waitForTimeout(250);
  const typed = await html();
  check(`${T}, deux sens : la frappe réelle dans le tableau lié s'écrit`, /zz/.test(typed), typed.slice(0, 200));
  await openLinkMenu();
  const m9 = await hit(MENU);
  const boxes9 = [await hit(ROW_PULL), await hit(ROW_PUSH), await hit(ROW_OPEN), await hit(MENU_ROW)];
  check(`${T}, deux sens : le menu du lien tient dans le panneau ${WIDTH}x${HEIGHT}, ses quatre lignes au premier plan`, m9.found && m9.inPanel && boxes9.every(seen), { m9, boxes9 });
  const rows9 = await page.evaluate(() => Array.from(document.querySelectorAll('.v2-linked-menu-row')).map(r => ({ text: r.textContent.trim(), icon: !!r.querySelector('svg'), disabled: r.getAttribute('aria-disabled'), color: getComputedStyle(r).color })));
  check(`${T}, deux sens : « Mettre à jour depuis le modèle », « Envoyer au modèle », « Ouvrir le modèle » et « Détacher du modèle », chacune avec son icône, actives`,
    rows9.map(r => r.text).join('|') === 'Mettre à jour depuis le modèle|Envoyer au modèle|Ouvrir le modèle|Détacher du modèle' && rows9.every(r => r.icon && r.disabled === 'false'), rows9);
  const bg9 = await backgroundOf(MENU);
  const contrasts9 = [];
  for (const r of rows9) contrasts9.push(await contrastOf(r.color, bg9));
  check(`${T}, deux sens : les quatre lignes ont un contraste d'au moins 4,5:1 sur le fond du menu (${bg9})`, contrasts9.every(c => c >= 4.5), contrasts9);
  await snap(`${T}-8-deux-sens-menu`);
  // Mettre à jour : un clic réel sur la ligne referme le menu et ramène les cases du modèle ; le curseur reste dans la case.
  await clickAt(ROW_PULL);
  await page.waitForTimeout(600);
  const pulled = await html();
  const afterPull = await page.evaluate(() => ({ menuShown: getComputedStyle(document.querySelector('.v2-linked-menu')).display !== 'none', expanded: document.getElementById('v2-table-linked-btn').getAttribute('aria-expanded') }));
  check(`${T}, deux sens : « Mettre à jour depuis le modèle » ramène les cases du modèle (plus de « zz »), referme le menu, le lien reste`,
    !/zz/.test(pulled) && /<p>B2<\/p>/.test(pulled) && !afterPull.menuShown && afterPull.expanded === 'false' && (await linkedIds()).length === 1, { pulled: pulled.slice(0, 260), afterPull });
  const stPull = await statusNow();
  check(`${T}, deux sens : la ligne d'état dit « Tableau mis à jour depuis le modèle « Grille des tarifs ». »`, stPull.text === 'Tableau mis à jour depuis le modèle « Grille des tarifs ».' && !stPull.error, stPull);
  check(`${T}, deux sens : après la mise à jour le curseur est toujours dans la case B2 de l'éditeur, la barre du tableau et le bouton du lien aussi`,
    (await focusIn()) === 'editor' && (await cellOfCursor()) === 'B2' && seen(await hit(LBTN)), { focus: await focusIn(), cell: await cellOfCursor() });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  check(`${T}, deux sens : un seul Ctrl+Z rend les cases d'avant la mise à jour`, /zz/.test(await html()), (await html()).slice(0, 200));
  // Envoyer : le menu se referme, la confirmation s'ouvre dans le panneau ; Annuler n'écrit rien.
  await openLinkMenu();
  const contentBefore = (await modelRow()).Contenu;
  await clickAt(ROW_PUSH);
  await page.waitForSelector(DIALOG_OK, { state: 'visible', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  const dlg = await dialogState();
  const dlgBox = await hit(DIALOG + ' .modal-content');
  const dlgTitle = await hit(DIALOG + ' h3');
  const dlgOk = await hit(DIALOG_OK);
  const dlgCancel = await hit(DIALOG_CANCEL);
  check(`${T}, deux sens : « Envoyer au modèle » referme le menu et ouvre la confirmation dans le panneau (titre, message, « Annuler » et « Envoyer » au premier plan)`,
    dlg.open && dlg.title === 'Envoyer ce tableau au modèle ?' && dlg.message === 'Le tableau du modèle « Grille des tarifs » sera remplacé par celui-ci.' && dlg.buttons.join('|') === 'Annuler|Envoyer'
      && dlgBox.inPanel && seen(dlgTitle) && seen(dlgOk) && seen(dlgCancel) && !(await page.evaluate(() => getComputedStyle(document.querySelector('.v2-linked-menu')).display !== 'none')), { dlg, dlgBox, dlgTitle, dlgOk, dlgCancel });
  await snap(`${T}-9-deux-sens-confirmation`);
  await clickAt(DIALOG_CANCEL);
  await page.waitForTimeout(400);
  check(`${T}, deux sens : « Annuler » ferme la fenêtre, n'écrit rien dans le modèle, le clavier revient dans l'éditeur`,
    !(await dialogState()).open && (await modelRow()).Contenu === contentBefore && (await focusIn()) === 'editor', { dialog: await dialogState(), focus: await focusIn() });
  // « Envoyer » : le modèle reçoit le tableau, sans le lien, et lui seul change.
  const rowBefore = await modelRow();
  await page.waitForTimeout(1100);
  await openLinkMenu();
  await clickAt(ROW_PUSH);
  await page.waitForSelector(DIALOG_OK, { state: 'visible', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
  await clickAt(DIALOG_OK);
  await page.waitForTimeout(700);
  const rowAfter = await modelRow();
  const changed = Object.keys(rowAfter).filter(k => JSON.stringify(rowAfter[k]) !== JSON.stringify(rowBefore[k])).sort().join();
  const stPush = await statusNow();
  check(`${T}, deux sens : « Envoyer » écrit le tableau dans le modèle (sans le lien), seules les colonnes Contenu et DateModif changent, la ligne d'état le dit, la fenêtre se ferme`,
    changed === 'Contenu,DateModif' && /zz/.test(rowAfter.Contenu) && !/data-linked-template/.test(rowAfter.Contenu) && stPush.text === 'Modèle « Grille des tarifs » mis à jour avec ce tableau.' && !stPush.error && !(await dialogState()).open && (await focusIn()) === 'editor',
    { changed, status: stPush, dialog: await dialogState(), focus: await focusIn() });
  // Le modèle est remis tel qu'il était pour les passes suivantes.
  await page.evaluate(async ({ id, grid }) => { __gristStub.remoteWrite(Templates.TABLE_NAME, id, { Contenu: grid }); await Templates.loadAll(); }, { id: modelId, grid: GRID });

  // 10) Ouvrir le modèle et revenir au document, à la vraie souris. Un document ENREGISTRÉ qui pose le tableau lié à « Grille des tarifs » (ouvert par la liste : la fenêtre « Modifications non enregistrées » du
  // texte de départ reçoit « Abandonner », ce n'est que la mise en place). Puis tout est réel : la case du tableau, le bouton du lien, la ligne « Ouvrir le modèle » (dans le panneau, au premier plan, lisible), le modèle
  // et son bandeau « Revenir au document » (une ligne, dans le panneau, contrastes ≥ 4,5:1), le clic sur « Revenir au document » (le curseur dans la même case, la barre du tableau), la fenêtre « Modifications non
  // enregistrées » devant un document modifié (« Annuler » ne change rien, « Enregistrer » écrit puis ouvre), et la confirmation de suppression du modèle, qui dit où il est posé.
  const docName = 'Contrat ' + T;
  await page.evaluate(() => { try { localStorage.setItem('pp_autosave_enabled', 'false'); } catch (e) { /* stockage indisponible */ } });
  const savedDoc = await page.evaluate(async ({ grid, nom }) => {
    const model = Templates.getCached().find(t => t.nom === 'Grille des tarifs');
    const saved = await Templates.save(null, nom, '<p>Bonjour</p>' + grid.replace('<table>', `<table data-linked-template="${model.id}">`) + '<p>Au revoir</p>', '', null, null, 'document', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    if (!Array.from(select.options).some(o => o.value === String(saved.id))) { const o = document.createElement('option'); o.value = String(saved.id); o.textContent = nom; select.appendChild(o); }
    const realChoose = Dialogs.choose;
    Dialogs.choose = async () => 'discard';
    select.value = String(saved.id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    Dialogs.choose = realChoose;
    return { id: saved.id, modelId: model.id, linked: LinkedTable.linkedTables(EditorCore.getEditor().state.doc).length };
  }, { grid: GRID, nom: docName });
  check(`${T}, ouvrir le modèle : le document enregistré est à l'écran avec son tableau lié`, savedDoc.linked === 1 && (await page.evaluate(() => document.getElementById('template-name').value)) === docName, savedDoc);
  const onScreen = () => page.evaluate(() => {
    const bar = document.getElementById('linked-return-bar');
    return { name: document.getElementById('template-name').value, grid: GridEditor.isActive(), bar: !bar.hidden && getComputedStyle(bar).display !== 'none', linked: LinkedTable.linkedTables(EditorCore.getEditor().state.doc).length };
  });
  await clickInText('B2');
  await openLinkMenu();
  const rowOpen = await hit(ROW_OPEN);
  const openInfo = await page.evaluate(() => { const r = document.querySelector('.v2-linked-menu [data-action="linked-open"]'); return { text: r.textContent.trim(), icon: !!r.querySelector('svg'), title: r.title, color: getComputedStyle(r).color }; });
  check(`${T}, ouvrir le modèle : la ligne « Ouvrir le modèle » est dans le panneau, au premier plan, avec son icône et son info-bulle, lisible (≥ 4,5:1)`,
    seen(rowOpen) && openInfo.text === 'Ouvrir le modèle' && openInfo.icon && /^Ouvre le modèle Grille « Grille des tarifs » dans l’éditeur/.test(openInfo.title) && (await contrastOf(openInfo.color, await backgroundOf(MENU))) >= 4.5, { rowOpen, openInfo });
  await clickAt(ROW_OPEN);
  await page.waitForTimeout(1100);
  const bar10 = await page.evaluate(() => {
    const bar = document.getElementById('linked-return-bar'), text = document.getElementById('linked-return-text'), btn = document.getElementById('btn-linked-return');
    const r = bar.getBoundingClientRect(), b = btn.getBoundingClientRect();
    const cell = document.querySelector('.tiptap td, .tiptap th');
    const c = cell && cell.getBoundingClientRect();
    return { name: document.getElementById('template-name').value, grid: GridEditor.isActive(), shown: !bar.hidden && getComputedStyle(bar).display !== 'none', text: text.textContent, btn: btn.textContent, barH: Math.round(r.height),
      inPanel: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, btnInside: b.left >= r.left && b.right <= r.right && b.height >= 24, gridVisible: !!c && c.top >= r.bottom - 1 && c.bottom <= innerHeight && c.height > 0,
      menuShown: getComputedStyle(document.querySelector('.v2-linked-menu')).display !== 'none', macroBar: !document.getElementById('macro-return-bar').hidden };
  });
  check(`${T}, ouvrir le modèle : le modèle « Grille des tarifs » est à l'écran en grille, le bandeau « Modèle Grille ouvert depuis le document « ${docName} ». » et « Revenir au document » tient sur une ligne dans le panneau, la grille reste visible dessous, le menu est refermé`,
    bar10.name === 'Grille des tarifs' && bar10.grid && bar10.shown && bar10.text === `Modèle Grille ouvert depuis le document « ${docName} ».` && bar10.btn === 'Revenir au document' && bar10.barH <= 44 && bar10.inPanel && bar10.btnInside && bar10.gridVisible && !bar10.menuShown && !bar10.macroBar, bar10);
  const fgText = await page.evaluate(() => getComputedStyle(document.getElementById('linked-return-text')).color);
  const fgBtn = await page.evaluate(() => getComputedStyle(document.getElementById('btn-linked-return')).color);
  const cText = await contrastOf(fgText, await backgroundOf(RETURN_BAR));
  const cBtn = await contrastOf(fgBtn, await backgroundOf(RETURN_BTN));
  check(`${T}, ouvrir le modèle : le texte du bandeau (${cText.toFixed(1)}:1) et le bouton « Revenir au document » (${cBtn.toFixed(1)}:1) ont un contraste d'au moins 4,5:1`, cText >= 4.5 && cBtn >= 4.5, { cText, cBtn });
  await snap(`${T}-10-modele-ouvert`);
  await clickAt(RETURN_BTN);
  await page.waitForTimeout(1100);
  const home10 = await onScreen();
  const hintNow = await statusNow();
  check(`${T}, revenir au document : le document est de retour (liste, nom, tableau lié), la grille et le bandeau ont disparu`, home10.name === docName && !home10.grid && !home10.bar && home10.linked === 1, home10);
  check(`${T}, revenir au document : le curseur est dans la case B2 où il était, le clavier dans l'éditeur, la barre du tableau et le bouton du lien sont là, aucun message d'écart`,
    (await cellOfCursor()) === 'B2' && (await focusIn()) === 'editor' && seen(await hit(BAR)) && seen(await hit(LBTN)) && !/diffère/.test(hintNow.text), { cell: await cellOfCursor(), focus: await focusIn(), status: hintNow });
  await snap(`${T}-11-document-revenu`);
  // Un document modifié : la vraie question, « Annuler » ne change rien, « Enregistrer » écrit puis ouvre le modèle.
  await clickInText('B2');
  await page.keyboard.type('zz');
  await page.waitForTimeout(250);
  await openLinkMenu();
  await clickAt(ROW_OPEN);
  await page.waitForSelector(DIALOG_OK, { state: 'visible', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const ask10 = await dialogState();
  const askBox = await hit(DIALOG + ' .modal-content');
  const askButtons = [await dialogButton('Annuler'), await dialogButton('Abandonner'), await dialogButton('Enregistrer')];
  check(`${T}, ouvrir le modèle : un document modifié pose « Modifications non enregistrées » (nom du document, « Annuler », « Abandonner », « Enregistrer ») dans le panneau, avant tout changement d'écran`,
    ask10.open && ask10.title === 'Modifications non enregistrées' && ask10.message.includes(docName) && ask10.buttons.join('|') === 'Annuler|Abandonner|Enregistrer' && askBox.inPanel && askButtons.every(seen) && (await onScreen()).name === docName, { ask10, askBox, askButtons });
  await snap(`${T}-12-question`);
  await clickDialogButton('Annuler');
  await page.waitForTimeout(400);
  const kept10 = await onScreen();
  check(`${T}, ouvrir le modèle : « Annuler » ferme la fenêtre, le document reste (avec sa frappe), pas de bandeau, le clavier revient dans l'éditeur`,
    !(await dialogState()).open && kept10.name === docName && !kept10.grid && !kept10.bar && /zz/.test(await html()) && (await focusIn()) === 'editor', { kept10, focus: await focusIn() });
  await openLinkMenu();
  await clickAt(ROW_OPEN);
  await page.waitForSelector(DIALOG + ' .pp-modal-actions button', { state: 'visible', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  await clickDialogButton('Enregistrer');
  await page.waitForTimeout(1300);
  const saved10 = await onScreen();
  const storedDoc = await page.evaluate(id => __gristStub.getRow(Templates.TABLE_NAME, id).Contenu, savedDoc.id);
  check(`${T}, ouvrir le modèle : « Enregistrer » écrit le document avec la frappe puis ouvre le modèle avec son bandeau`, /zz/.test(storedDoc) && saved10.name === 'Grille des tarifs' && saved10.grid && saved10.bar, { saved10, stored: storedDoc.slice(0, 160) });
  // La suppression du modèle, pendant qu'il est à l'écran : la confirmation dit dans combien de modèles il est posé.
  await clickAt('#btn-delete');
  await page.waitForSelector(DIALOG_OK, { state: 'visible', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const del10 = await dialogState();
  const delBox = await hit(DIALOG + ' .modal-content');
  const delButtons = [await hit(DIALOG_CANCEL), await hit(DIALOG_OK)];
  const wantedMessage = 'Ce modèle Grille est posé comme tableau lié dans 1 modèle : ces tableaux resteront, détachés.';
  check(`${T}, supprimer le modèle : la confirmation dit « ${wantedMessage} » dans le panneau, boutons au premier plan`,
    del10.open && del10.title === 'Supprimer ce modèle ?' && del10.message === wantedMessage && delBox.inPanel && delButtons.every(seen), { del10, delBox, delButtons });
  await snap(`${T}-13-suppression`);
  await clickAt(DIALOG_CANCEL);
  await page.waitForTimeout(400);
  const stay10 = await onScreen();
  check(`${T}, supprimer le modèle : « Annuler » ne supprime rien, le modèle et son bandeau restent`, !(await dialogState()).open && stay10.name === 'Grille des tarifs' && stay10.grid && stay10.bar
    && !!(await page.evaluate(id => __gristStub.getRow(Templates.TABLE_NAME, id), savedDoc.modelId)), { stay10 });
  // Remise en place pour la suite : le document vierge, l'enregistrement automatique rallumé.
  await page.evaluate(async () => {
    const realChoose = Dialogs.choose;
    Dialogs.choose = async () => 'discard';
    document.getElementById('btn-new').click();
    await new Promise(r => setTimeout(r, 500));
    Dialogs.choose = realChoose;
    try { localStorage.removeItem('pp_autosave_enabled'); } catch (e) { /* stockage indisponible */ }
  });
  // Le document de ce passage est retiré : les passages suivants (la confirmation d'« Envoyer » compte les modèles qui posent le tableau) repartent du même état.
  await page.evaluate(async id => { await Templates.remove(id); await Templates.loadAll(); }, savedDoc.id);
}

async function runEnglish() {
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await setDoc(DOC);
  await clickInText('entier', 0.98);
  await openMenu();
  const en = await page.evaluate(() => ({ row: document.getElementById('v2-btn-linked-table').textContent.trim(), label: document.querySelector('#v2-table-flyout .v2-hover-flyout-label').textContent.trim(), aria: document.getElementById('v2-btn-linked-table').getAttribute('aria-label') }));
  const rowBox = await hit(ROW);
  check('anglais, menu : « Table from a Grid template… » sous « Insert a table », dans le panneau', en.row === 'Table from a Grid template…' && en.label === 'Insert a table' && /Insert a table linked/.test(en.aria) && seen(rowBox), { en, rowBox });
  await closeMenu();
  await openPickerByMouse();
  const ph = await page.evaluate(() => document.querySelector('#v2-linked-table-search .ss-input').placeholder);
  const rows = await pickerRows();
  const emptyRow = rows.find(r => /Empty|vide/i.test(r.name));
  const inputBox = await hit(PICKER + ' .ss-input');
  check('anglais, liste : champ « Search for a Grid template… », ligne sans tableau grisée « This template has no table », dans le panneau', ph === 'Search for a Grid template…' && emptyRow && emptyRow.disabled && emptyRow.reason === 'This template has no table' && seen(inputBox), { ph, rows, inputBox });
  await snap('en-1-liste');
  await clickOption('Grille des tarifs');
  const enBtn = await centerOf(LBTN);
  await page.mouse.move(enBtn.x, enBtn.y, { steps: 4 });
  await page.mouse.click(enBtn.x, enBtn.y);
  await page.waitForTimeout(300);
  const barEn = await page.evaluate(() => {
    const b = document.getElementById('v2-table-linked-btn');
    const m = document.querySelector('.v2-linked-menu');
    const row = m.querySelector('[data-action="linked-detach"]');
    const w = document.querySelector('.tiptap .tableWrapper');
    return { btn: b.title, hint: m.querySelector('.v2-linked-menu-hint').textContent, row: row.textContent.trim(), rowTitle: row.title, aria: w && w.getAttribute('aria-label'), shown: getComputedStyle(m).display !== 'none' };
  });
  const menuEnBox = await hit(MENU);
  check('anglais, barre et menu : info-bulle du bouton, texte du menu, « Detach from the template », étiquette du repère', /^Table linked to the Grid template “Grille des tarifs”: link menu/.test(barEn.btn) && barEn.shown && menuEnBox.inPanel && /^Its cells follow the rules of a grid/.test(barEn.hint)
    && barEn.row === 'Detach from the template' && /^Detach from the Grid template/.test(barEn.rowTitle) && barEn.aria === 'Table linked to the Grid template “Grille des tarifs”', barEn);
  await snap('en-2-barre');
  // Les deux sens, en anglais : trois lignes (libellés, info-bulles) puis la confirmation de l'envoi, qui tient dans le panneau ; « Cancel » n'écrit rien.
  await clickInText('B2');
  await page.keyboard.type('zz');
  await page.waitForTimeout(250);
  const enLink = await centerOf(LBTN);
  await page.mouse.move(enLink.x, enLink.y, { steps: 4 });
  await page.mouse.click(enLink.x, enLink.y);
  await page.waitForTimeout(300);
  const enRows = await page.evaluate(() => Array.from(document.querySelectorAll('.v2-linked-menu-row')).map(r => ({ text: r.textContent.trim(), title: r.title })));
  const enBoxes = [await hit(ROW_PULL), await hit(ROW_PUSH), await hit(ROW_OPEN), await hit(MENU_ROW)];
  check('anglais, deux sens : « Update from the template », « Send to the template », « Open the template » et « Detach from the template » avec leurs info-bulles, dans le panneau',
    enRows.map(r => r.text).join('|') === 'Update from the template|Send to the template|Open the template|Detach from the template' && /^Replace this table’s cells with those of the Grid template “Grille des tarifs”/.test(enRows[0].title)
      && /^Replace the table of the Grid template “Grille des tarifs” with this one/.test(enRows[1].title) && /^Open the Grid template “Grille des tarifs” in the editor/.test(enRows[2].title) && enBoxes.every(seen), { enRows, enBoxes });
  await snap('en-3-deux-sens-menu');
  const enBefore = (await page.evaluate(id => __gristStub.getRow(Templates.TABLE_NAME, id), await page.evaluate(() => Templates.getCached().find(t => t.nom === 'Grille des tarifs').id))).Contenu;
  const pushAt = await centerOf(ROW_PUSH);
  await page.mouse.move(pushAt.x, pushAt.y, { steps: 6 });
  await page.waitForTimeout(100);
  await page.mouse.click(pushAt.x, pushAt.y);
  await page.waitForSelector(DIALOG_OK, { state: 'visible', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  const enDlg = await page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    const open = !!ov && ov.style.display !== 'none';
    return { open, title: open ? ov.querySelector('h3').textContent : '', message: open ? ov.querySelector('.pp-dialog-message').textContent : '', buttons: open ? Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent) : [] };
  });
  const enBox = await hit(DIALOG + ' .modal-content');
  check('anglais, deux sens : la confirmation « Send this table to the template? » (le modèle est nommé dans le message), « Cancel » et « Send », dans le panneau',
    enDlg.open && enDlg.title === 'Send this table to the template?' && enDlg.message === 'The table of the template “Grille des tarifs” will be replaced by this one.' && enDlg.buttons.join('|') === 'Cancel|Send' && enBox.inPanel && seen(await hit(DIALOG_OK)) && seen(await hit(DIALOG_CANCEL)), { enDlg, enBox });
  await snap('en-4-deux-sens-confirmation');
  const cancelAt = await centerOf(DIALOG_CANCEL);
  await page.mouse.move(cancelAt.x, cancelAt.y, { steps: 4 });
  await page.mouse.click(cancelAt.x, cancelAt.y);
  await page.waitForTimeout(400);
  const enAfter = (await page.evaluate(id => __gristStub.getRow(Templates.TABLE_NAME, id), await page.evaluate(() => Templates.getCached().find(t => t.nom === 'Grille des tarifs').id))).Contenu;
  check('anglais, deux sens : « Cancel » ferme la fenêtre et n\'écrit rien dans le modèle', enAfter === enBefore && !(await page.evaluate(() => { const ov = document.getElementById('pp-dialog-modal'); return ov && ov.style.display !== 'none'; })), { same: enAfter === enBefore });
  // Ouvrir le modèle, revenir au document et supprimer le modèle, en anglais : la ligne du menu, le bandeau (texte, bouton, étiquette), la confirmation de suppression qui dit où le modèle est posé.
  const enDocName = 'Contract en';
  await page.evaluate(() => { try { localStorage.setItem('pp_autosave_enabled', 'false'); } catch (e) { /* stockage indisponible */ } });
  const enDoc = await page.evaluate(async ({ grid, nom }) => {
    const model = Templates.getCached().find(t => t.nom === 'Grille des tarifs');
    const saved = await Templates.save(null, nom, '<p>Hello</p>' + grid.replace('<table>', `<table data-linked-template="${model.id}">`) + '<p>Bye</p>', '', null, null, 'document', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    if (!Array.from(select.options).some(o => o.value === String(saved.id))) { const o = document.createElement('option'); o.value = String(saved.id); o.textContent = nom; select.appendChild(o); }
    const realChoose = Dialogs.choose;
    Dialogs.choose = async () => 'discard';
    select.value = String(saved.id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    Dialogs.choose = realChoose;
    return { id: saved.id, linked: LinkedTable.linkedTables(EditorCore.getEditor().state.doc).length };
  }, { grid: GRID, nom: enDocName });
  const clickSel = async (selector) => {
    const at = await centerOf(selector);
    await page.mouse.move(at.x, at.y, { steps: 6 });
    await page.waitForTimeout(100);
    await page.mouse.click(at.x, at.y);
  };
  await clickInText('B2');
  await clickSel(LBTN);
  await page.waitForTimeout(300);
  const enOpenRow = await page.evaluate(() => { const r = document.querySelector('.v2-linked-menu [data-action="linked-open"]'); return { text: r.textContent.trim(), title: r.title }; });
  check('anglais, ouvrir le modèle : la ligne « Open the template » et son info-bulle, dans le panneau', enDoc.linked === 1 && enOpenRow.text === 'Open the template' && /^Open the Grid template “Grille des tarifs” in the editor; a banner brings you back to this document$/.test(enOpenRow.title) && seen(await hit(ROW_OPEN)), { enDoc, enOpenRow });
  await clickSel(ROW_OPEN);
  await page.waitForTimeout(1100);
  const enBar = await page.evaluate(() => {
    const bar = document.getElementById('linked-return-bar'), text = document.getElementById('linked-return-text'), btn = document.getElementById('btn-linked-return');
    const r = bar.getBoundingClientRect(), b = btn.getBoundingClientRect();
    return { shown: !bar.hidden && getComputedStyle(bar).display !== 'none', text: text.textContent, btn: btn.textContent, aria: bar.getAttribute('aria-label'), barH: Math.round(r.height), inPanel: r.left >= 0 && r.right <= innerWidth, btnInside: b.left >= r.left && b.right <= r.right, grid: GridEditor.isActive() };
  });
  check('anglais, ouvrir le modèle : le bandeau « Grid template opened from the document “Contract en”. » et « Back to the document », sur une ligne dans le panneau',
    enBar.shown && enBar.grid && enBar.text === `Grid template opened from the document “${enDocName}”.` && enBar.btn === 'Back to the document' && enBar.aria === 'Back to the document' && enBar.barH <= 44 && enBar.inPanel && enBar.btnInside, enBar);
  await snap('en-5-modele-ouvert');
  await clickSel('#btn-delete');
  await page.waitForSelector(DIALOG_OK, { state: 'visible', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const enDel = await page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    const open = !!ov && ov.style.display !== 'none';
    return { open, title: open ? ov.querySelector('h3').textContent : '', message: open ? ov.querySelector('.pp-dialog-message').textContent : '', buttons: open ? Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent) : [] };
  });
  const enDelBox = await hit(DIALOG + ' .modal-content');
  check('anglais, supprimer le modèle : « Delete this template? » dit « This Grid template is placed as a linked table in 1 template: those tables will stay, detached. », dans le panneau',
    enDel.open && enDel.title === 'Delete this template?' && enDel.message === 'This Grid template is placed as a linked table in 1 template: those tables will stay, detached.' && enDelBox.inPanel && seen(await hit(DIALOG_CANCEL)) && seen(await hit(DIALOG_OK)), { enDel, enDelBox });
  await snap('en-6-suppression');
  await clickSel(DIALOG_CANCEL);
  await page.waitForTimeout(400);
  await clickSel(RETURN_BTN);
  await page.waitForTimeout(1100);
  const enHome = await page.evaluate(() => ({ name: document.getElementById('template-name').value, grid: GridEditor.isActive(), bar: !document.getElementById('linked-return-bar').hidden }));
  check('anglais, revenir au document : « Back to the document » ramène le document, sans bandeau', enHome.name === enDocName && !enHome.grid && !enHome.bar && (await cellOfCursor()) === 'B2', { enHome, cell: await cellOfCursor() });
  await page.evaluate(async () => {
    const realChoose = Dialogs.choose;
    Dialogs.choose = async () => 'discard';
    document.getElementById('btn-new').click();
    await new Promise(r => setTimeout(r, 500));
    Dialogs.choose = realChoose;
    try { localStorage.removeItem('pp_autosave_enabled'); } catch (e) { /* stockage indisponible */ }
  });
  await page.evaluate(async id => { await Templates.remove(id); await Templates.loadAll(); }, enDoc.id);
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(250);
}

await run('light');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(200);
await run('dark');
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
