#!/usr/bin/env node
// Graphique de la page (js/chart-block.js, js/chart-source.js, js/chart-plot.js, css/chart-block.css, js/search-select.js) : le panneau de 700x400, à la VRAIE souris (page.mouse) et au VRAI
// clavier (frappe, flèches, Tab, Entrée, Échap), en clair, en sombre et en anglais. Ce que scenarios-chart-block.js ne peut pas voir depuis la page :
//  - le survol de l'icône chaîne ouvre le menu « Lien et blocs de contenu » : ses sept lignes, « Graphique de la page… » en dernier, tiennent dans le panneau et sont au premier plan ;
//  - un clic sur la ligne ouvre la fenêtre : elle tient dans 700x400 sans défiler (titre, liste, indication, lignes à tracer, aperçu, boutons) ; « Insérer » est grisé tant qu'aucun graphique n'est choisi ;
//  - un clic sur la liste l'ouvre AU-DESSUS de la fenêtre et dans le panneau : les graphiques rangés par page, ceux que le widget ne sait pas redessiner grisés avec leur raison, qu'un clic ne choisit pas ;
//  - la recherche se tape et se valide au clavier ; l'aperçu montre le vrai graphique de la ligne en cours (une image, à la bonne proportion) ; les deux choix de lignes se cochent à la souris ;
//  - « Insérer » pose un cadre sans image (le nom du graphique, l'icône) à la taille réglée ; un clic le sélectionne, la ligne devient « Modifier le graphique… », la poignée d'angle le redimensionne ;
//  - la liaison entre les deux tables, à régler à la validation, s'ouvre AU-DESSUS de la fenêtre du graphique ; refusée, rien n'est inséré et la fenêtre reste ouverte ;
//  - la Lecture montre le graphique tracé pour la ligne, dans le panneau ;
//  - Tab ne sort pas de la fenêtre, Échap la ferme sans toucher au texte ; les contrastes des textes de la fenêtre, de la liste et du cadre (≥ 4,5:1) en clair et en sombre ;
//  - l'interface en anglais.
// Lancé par run-headless.mjs (groupe Node "chartMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-chart-mouse.mjs
// CHART_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.CHART_MOUSE_PORT || 8917);
const SHOTS = process.env.CHART_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-qr-mouse.mjs.
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/plotly\.js-basic-dist-min@.*$/, 'umd/plotly-basic.min.js'],
] : [];
if (!OFFLINE) console.log('[verify-chart-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const consoleProblems = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
// Un avertissement de ProseMirror ou de TipTap, ou du module du graphique, trahit un geste qui n'a pas la forme attendue : aucun ne doit sortir pendant le parcours.
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|ChartBlock|chart-block|ChartSource|ChartPlot/i.test(m.text())) consoleProblems.push(m.text()); });
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
// Le document de Grist (les deux tables et les graphiques de la page) est celui de scenarios-chart-block.js : une seule description, chargée dans la page.
await page.addScriptTag({ path: join(ROOT, 'dev-tests', 'scenarios-chart-block.js') });

const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });
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
  return { found: true, w: r.width, h: r.height, inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
}, selector);
const seen = box => box.found && box.inPanel && box.onTop;
const html = () => page.evaluate(() => Editor.getHTML());
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
  await page.evaluate(d => { Editor.setHTML(d); }, doc);
  await page.waitForTimeout(200);
}
async function caretAtEnd(text) {
  const p = await pointOf(text);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('End');
  await page.waitForTimeout(120);
}
async function clickCenter(selector) {
  const c = await centerOf(selector);
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(150);
}
// Survol réel de l'icône du menu : la souris arrive depuis le bas du document (jamais par-dessus un autre volet de la barre).
async function openMenu() {
  const c = await centerOf(MAIN);
  await page.mouse.move(c.x, c.y + 150);
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(350);
  return c;
}
// Le volet de sept lignes fait 250 px de haut (jusqu'à y = 395 à x = 338..550) : la main le quitte par le bord droit du panneau, hors de lui.
async function closeMenu() {
  await page.mouse.move(WIDTH - 30, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(250);
}
// Une ligne du menu, à la vraie souris : le volet s'ouvre au survol de l'icône, puis la main descend de l'icône sur la ligne (verticalement, sans quitter le volet) et clique.
async function clickRow(selector) {
  const c = await openMenu();
  const r = await centerOf(selector);
  const x = Math.min(Math.max(c.x, r.l + 8), r.r - 8);
  await page.mouse.move(x, r.y, { steps: 8 });
  await page.waitForTimeout(100);
  await page.mouse.click(x, r.y);
  await page.waitForTimeout(300);
}
async function closeWindowWithEscape() {
  if (await winOpen()) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
}
// La feuille est réduite pour tenir dans les 700 px (zoom d'ajustement, js/main.js:applyPageFitZoom) : getBoundingClientRect() rend des pixels ÉCRAN, les tailles de la feuille sont en pixels de mise en page.
const sheetZoom = () => page.evaluate(() => { const sheet = document.querySelector('.tiptap').closest('.v2-page-sheet'); const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN; return z > 0 ? z : 1; });

const MAIN = '#v2-btn-link';
const ROW = '#v2-btn-chart';
const ROWS = ['#v2-row-link', '#v2-btn-citation', '#v2-btn-code-block', '#v2-btn-callout', '#v2-btn-signature', '#v2-btn-qr', ROW];
const ROW_INDEX = 6;
const FLYOUT = '#v2-blocks-flyout';
const WIN = '#pp-chart-modal';
const BOX = `${WIN} .modal-content`;
const BODY = `${WIN} .pp-modal-body`;
const OK = `${WIN} .var-modal-primary`;
const CANCEL = `${WIN} .var-modal-actions button:not(.var-modal-primary)`;
const TRIGGER = `${WIN} .ss-trigger`;
const LIST = `${WIN} .ss-panel`;
const LIST_INPUT = `${WIN} .ss-input`;
const PAPER = `${WIN} .pp-chart-paper`;
const PREVIEW = `${WIN} .pp-chart-image`;
const MESSAGE = `${WIN} .pp-chart-message`;
const CAPTION = `${WIN} .pp-chart-caption`;
const RADIO_LINKED = `${WIN} input[name="pp-chart-rows"][value="linked"]`;
const RADIO_ALL = `${WIN} input[name="pp-chart-rows"][value="all"]`;
const LABEL_LINKED = `${WIN} .pp-chart-option:nth-of-type(1)`;
const LABEL_ALL = `${WIN} .pp-chart-option:nth-of-type(2)`;
const FRAME = '.tiptap .editor-image-chart-placeholder';
const TOOLBAR_BTN = action => `.v2-floating-toolbar button[data-action="${action}"]`;
const LINK_MODAL = '#link-config-modal';

const winOpen = () => page.evaluate(() => { const m = document.getElementById('pp-chart-modal'); return !!m && m.style.display !== 'none'; });
const focusIn = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.closest('.tiptap') ? 'editor' : (a.closest('#pp-chart-modal') ? (a.id || (a.className || '').split(' ')[0] || a.textContent.trim() || a.tagName) : 'ailleurs : ' + (a.id || a.tagName))) : 'rien'; });
const textOf = selector => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.trim() : null; }, selector);
const isHidden = selector => page.evaluate(sel => { const e = document.querySelector(sel); return !e || e.hidden || getComputedStyle(e).display === 'none'; }, selector);
const isDisabled = selector => page.evaluate(sel => { const e = document.querySelector(sel); return !!e && e.disabled; }, selector);
const isChecked = selector => page.evaluate(sel => { const e = document.querySelector(sel); return !!e && e.checked; }, selector);
const rowLabels = () => page.evaluate(() => Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row')).map(r => r.textContent.trim()));
// Les graphiques du document, tels qu'écrits : références, présence d'une image, taille.
const chartNodes = () => page.evaluate(() => Array.from(new DOMParser().parseFromString(Editor.getHTML(), 'text/html').querySelectorAll('img[data-chart-section]')).map(i => ({ section: i.getAttribute('data-chart-section'), scope: i.getAttribute('data-chart-scope'), name: i.getAttribute('data-chart-name'), hasSrc: i.hasAttribute('src'), width: i.style.width, height: i.style.height })));
const previewState = () => page.evaluate(() => document.querySelector('#pp-chart-modal .pp-chart-paper').dataset.state);
async function settle() {
  await page.waitForFunction(() => { const p = document.querySelector('#pp-chart-modal .pp-chart-paper'); return !!p && p.dataset.state && p.dataset.state !== 'loading'; }, null, { timeout: 25000 });
  await page.waitForTimeout(120);
}
const previewSrc = () => page.evaluate(() => document.querySelector('#pp-chart-modal .pp-chart-image').getAttribute('src') || '');
// Rapport de contraste WCAG du texte d'un élément sur son fond réel (les fonds transparents des ancêtres sont composés jusqu'au premier opaque).
const contrastOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(s => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const layers = [];
  for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
  let base = { r: 255, g: 255, b: 255, a: 1 };
  for (const c of layers.reverse()) base = mix(c, base);
  let fg = parse(getComputedStyle(el).color);
  if (fg.a < 1) fg = mix(fg, base);
  const a = lum(fg), b = lum(base);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}, selector);
// Le document de Grist : les clients et leurs ventes, les graphiques de la page, la règle de liaison, le client 1 en cours.
async function seedDocument() {
  await page.evaluate(async () => { await window.__chartFixture.seed({ resetEditor: async () => {} }); });
  await page.waitForTimeout(200);
}
// Ouvre la fenêtre par la ligne du menu à la vraie souris (curseur déjà posé dans le texte), puis attend la lecture des graphiques.
async function openWindowByMouse() {
  await clickRow(ROW);
  await page.waitForFunction(() => { const s = document.getElementById('pp-chart-pick'); return !!s && s.options[0] && !/^(Lecture des graphiques|Reading the charts)/.test(s.options[0].textContent); }, null, { timeout: 8000 });
  await page.waitForTimeout(200);
}
async function typeSlowly(text) {
  await page.keyboard.type(text, { delay: 12 });
  await page.waitForTimeout(300);
}

async function run(theme) {
  const T = theme;
  await setDoc('<p>Bonjour le monde entier</p><p>Deuxième ligne</p>');
  await seedDocument();

  // 1) Le menu : un survol réel de l'icône chaîne ouvre le volet, ses sept lignes sont dans le panneau et au premier plan.
  const mainBox = await hit(MAIN);
  check(`${T}, menu : l'icône chaîne est visible dans le panneau ${WIDTH}x${HEIGHT} et sous la souris`, seen(mainBox), mainBox);
  await openMenu();
  const flyout = await hit(FLYOUT);
  const rows = [];
  for (const sel of ROWS) rows.push(await hit(sel));
  check(`${T}, menu : au survol, le volet s'ouvre dans le panneau avec ses sept lignes au premier plan`, flyout.found && flyout.inPanel && rows.every(seen), { flyout, rows });
  const labels = await rowLabels();
  check(`${T}, menu : « QR code… » puis « Graphique de la page… » en dernier (rien n'a disparu)`, labels.length === 7 && labels[5] === 'QR code…' && labels[ROW_INDEX] === 'Graphique de la page…' && labels[1] === 'Citation' && labels[4] === 'Bloc de signature', labels);
  await snap(`${T}-1-menu`);
  await closeMenu();
  const closed = await page.evaluate(() => getComputedStyle(document.getElementById('v2-blocks-flyout')).display === 'none');
  check(`${T}, menu : la souris partie, le volet se referme`, closed, { flyout, mouse: [WIDTH / 2, HEIGHT - 20] });

  // 2) La fenêtre, ouverte par un clic réel : elle tient dans le panneau sans défiler ; « Insérer » grisé tant qu'aucun graphique n'est choisi.
  await caretAtEnd('Deuxième');
  await openWindowByMouse();
  const opened = await winOpen();
  const box = await hit(BOX), title = await hit('#pp-chart-title'), trigger = await hit(TRIGGER), paper = await hit(PAPER), message = await hit(MESSAGE), ok = await hit(OK), cancel = await hit(CANCEL), linked = await hit(LABEL_LINKED), all = await hit(LABEL_ALL);
  const scroll = await page.evaluate(sel => { const b = document.querySelector(sel); return { scrollH: b.scrollHeight, clientH: b.clientHeight, scrollW: b.scrollWidth, clientW: b.clientWidth }; }, BODY);
  check(`${T}, fenêtre : un clic sur « Graphique de la page… » l'ouvre`, opened, { opened });
  check(`${T}, fenêtre : elle tient dans ${WIDTH}x${HEIGHT} sans défiler - titre, liste, lignes à tracer, aperçu, « Annuler » et « Insérer » au premier plan`, box.inPanel && seen(title) && seen(trigger) && seen(linked) && seen(all) && seen(paper) && seen(message) && seen(ok) && seen(cancel) && scroll.scrollH <= scroll.clientH + 1 && scroll.scrollW <= scroll.clientW + 1, { box, scroll, trigger, linked, all, paper, ok, cancel });
  check(`${T}, fenêtre : « Insérer » grisé, le message d'aperçu invite à choisir, rien n'est coché de force`, (await isDisabled(OK)) && (await textOf(MESSAGE)) === 'Choisissez un graphique.' && (await textOf('#pp-chart-title')) === 'Insérer un graphique de la page', { disabled: await isDisabled(OK), message: await textOf(MESSAGE) });
  const focusStart = await focusIn();
  check(`${T}, fenêtre : le focus est dans la liste des graphiques (pas sur « Annuler »)`, /ss-trigger|pp-chart-pick/.test(focusStart), focusStart);
  const colors = { title: await contrastOf('#pp-chart-title'), label: await contrastOf(`${WIN} .pp-dialog-label`), hint: await contrastOf('#pp-chart-hint'), detail: await contrastOf(`${WIN} .pp-chart-option-detail`), message: await contrastOf(MESSAGE), cancel: await contrastOf(CANCEL), trigger: await contrastOf(TRIGGER) };
  check(`${T}, fenêtre : tous les textes ont un contraste d'au moins 4,5:1 (titre, libellé, indication, explication des lignes, message d'aperçu, liste, « Annuler »)`, Object.values(colors).every(v => v >= 4.5), colors);
  const paperLook = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).backgroundColor, PAPER);
  check(`${T}, fenêtre : l'aperçu est une feuille blanche, même en sombre (un graphique s'imprime sur du blanc)`, paperLook === 'rgb(255, 255, 255)', paperLook);
  await snap(`${T}-2-fenetre`);

  // 3) La liste, ouverte à la souris : au-dessus de la fenêtre, rangée par page, les graphiques non redessinables grisés avec leur raison, qu'un clic ne choisit pas.
  await clickCenter(TRIGGER);
  await page.waitForTimeout(250);
  const list = await hit(LIST);
  const groups = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chart-modal .ss-group')).map(g => g.textContent.trim()));
  const options = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chart-modal .ss-option')).map(o => ({ name: o.querySelector('.ss-name') ? o.querySelector('.ss-name').textContent : '', off: o.classList.contains('is-unavailable'), reason: o.querySelector('.ss-reason') ? o.querySelector('.ss-reason').textContent : '' })));
  check(`${T}, liste : un clic sur le champ ouvre la liste DANS le panneau et AU-DESSUS de la fenêtre, rangée par page`, list.found && list.inPanel && list.onTop && groups.length === 2 && groups[0] === 'Page : Ventes' && groups[1] === 'Page : Clients' && options.length === 11, { list, groups, count: options.length });
  const off = options.filter(o => o.off);
  check(`${T}, liste : Kaplan-Meier, « Split series », « Error bars » et le widget personnalisé sont grisés avec leur raison`, off.length === 4 && off.every(o => o.reason.length > 10) && off.some(o => /Kaplan-Meier/.test(o.reason)) && off.some(o => /Split series/.test(o.reason)) && off.some(o => /Error bars/.test(o.reason)) && off.some(o => /^Widget personnalisé/.test(o.reason)), off);
  const reasonContrast = await contrastOf(`${WIN} .ss-option.is-unavailable .ss-reason`);
  const optionContrast = await contrastOf(`${WIN} .ss-option:not(.is-unavailable) .ss-name`);
  check(`${T}, liste : la raison d'une ligne grisée et le nom d'un graphique ont un contraste d'au moins 4,5:1`, reasonContrast >= 4.5 && optionContrast >= 4.5, { reasonContrast, optionContrast });
  await snap(`${T}-3-liste`);
  // Un clic réel sur une ligne grisée ne choisit rien : la liste reste ouverte, la fenêtre aussi.
  const greyIndex = options.findIndex(o => o.off);
  const greyBox = await page.evaluate(i => { const r = document.querySelectorAll('#pp-chart-modal .ss-option')[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, greyIndex);
  await page.mouse.click(greyBox.x, greyBox.y);
  await page.waitForTimeout(200);
  const afterGrey = { open: !(await isHidden(LIST)), value: await page.evaluate(() => document.getElementById('pp-chart-pick').value), ok: await isDisabled(OK) };
  check(`${T}, liste : un clic sur une ligne grisée ne choisit rien (la liste reste ouverte, « Insérer » reste grisé)`, afterGrey.open && afterGrey.value === '' && afterGrey.ok, afterGrey);

  // 4) La recherche au clavier, puis le choix : l'aperçu montre le vrai graphique de la ligne en cours.
  await page.keyboard.type('par mois', { delay: 12 });
  await page.waitForTimeout(250);
  const found = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chart-modal .ss-option')).map(o => o.querySelector('.ss-name').textContent));
  check(`${T}, recherche : taper « par mois » ne laisse que « Ventes par mois »`, found.length === 1 && found[0] === 'Ventes par mois', found);
  await page.keyboard.press('Enter');
  await settle();
  const chosen = { value: await page.evaluate(() => document.getElementById('pp-chart-pick').value), listGone: await isHidden(LIST), state: await previewState(), ok: await isDisabled(OK), linked: await isChecked(RADIO_LINKED), all: await isChecked(RADIO_ALL), caption: await textOf(CAPTION), captionShown: !(await isHidden(CAPTION)) };
  check(`${T}, choix : Entrée choisit le graphique, la liste se ferme, les lignes liées sont cochées (une règle de liaison existe), « Insérer » s'allume, la légende dit « Pour la ligne en cours. »`, chosen.value === '101' && chosen.listGone && chosen.state === 'chart' && !chosen.ok && chosen.linked && !chosen.all && chosen.captionShown && chosen.caption === 'Pour la ligne en cours.', chosen);
  const image = await page.evaluate(sel => { const i = document.querySelector(sel); return { w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height, natural: [i.naturalWidth, i.naturalHeight] }; }, PREVIEW);
  const paperBox = await centerOf(PAPER);
  check(`${T}, aperçu : un vrai graphique (image 1 440 x 900, bonne proportion) tient dans la feuille de l'aperçu`, image.natural[0] === 1440 && image.natural[1] === 900 && image.w <= paperBox.w && image.h <= paperBox.h && Math.abs(image.w / image.h - 1.6) < 0.1 || (image.w > 100 && Math.abs((image.natural[0] / image.natural[1]) - 1.6) < 0.01), { image, paper: paperBox && [paperBox.w, paperBox.h] });
  const scroll2 = await page.evaluate(sel => { const b = document.querySelector(sel); return b.scrollHeight <= b.clientHeight + 1 && b.scrollWidth <= b.clientWidth + 1; }, BODY);
  check(`${T}, aperçu : avec la légende, la fenêtre tient toujours dans ${WIDTH}x${HEIGHT} sans défiler`, scroll2 && seen(await hit(CAPTION)) && seen(await hit(OK)), { scroll2 });
  await snap(`${T}-4-apercu`);

  // 5) Les deux choix de lignes, à la souris : « toute la table » change l'aperçu et retire la légende.
  const srcLinked = await previewSrc();
  await clickCenter(LABEL_ALL);
  await settle();
  const srcAll = await previewSrc();
  check(`${T}, lignes : un clic sur « Toute la table » la coche, change l'aperçu (les cinq ventes) et retire la légende`, (await isChecked(RADIO_ALL)) && !(await isChecked(RADIO_LINKED)) && srcAll !== srcLinked && srcAll.startsWith('data:image/png') && (await isHidden(CAPTION)), { all: await isChecked(RADIO_ALL), same: srcAll === srcLinked });
  await clickCenter(LABEL_LINKED);
  await settle();
  check(`${T}, lignes : un clic sur « Les lignes liées… » revient à l'aperçu de la ligne en cours`, (await isChecked(RADIO_LINKED)) && (await previewSrc()) === srcLinked && !(await isHidden(CAPTION)), { linked: await isChecked(RADIO_LINKED) });

  // 6) « Insérer » : un cadre sans image à la taille réglée, dans le panneau.
  await clickCenter(OK);
  await page.waitForTimeout(400);
  const nodes = await chartNodes();
  const zoom = await sheetZoom();
  const frame = await page.evaluate(sel => { const f = document.querySelector(sel); if (!f) return null; const r = f.getBoundingClientRect(); const label = f.querySelector('.editor-image-var-label'); return { w: r.width, h: r.height, l: r.left, r: r.right, label: label ? label.textContent : null }; }, FRAME);
  check(`${T}, insertion : « Insérer » pose le graphique (références gardées, aucune image dans le modèle, 480 x 300 px), la fenêtre se ferme, le clavier est dans l'éditeur`, !(await winOpen()) && nodes.length === 1 && nodes[0].section === '101' && nodes[0].scope === 'linked' && nodes[0].name === 'Ventes par mois' && !nodes[0].hasSrc && nodes[0].width === '480px' && nodes[0].height === '300px' && (await focusIn()) === 'editor', { nodes, focus: await focusIn() });
  check(`${T}, insertion : le cadre montre le nom du graphique, à 480 x 300 px à l'échelle de la feuille, dans le panneau`, !!frame && frame.label === 'Ventes par mois' && Math.abs(frame.w / zoom - 482) < 4 && Math.abs(frame.h / zoom - 302) < 4 && frame.l >= 0 && frame.r <= WIDTH + 0.5, { frame, zoom });
  const frameContrast = await contrastOf(`${FRAME} .editor-image-var-label`);
  check(`${T}, insertion : le nom dans le cadre a un contraste d'au moins 4,5:1`, frameContrast >= 4.5, frameContrast);
  await snap(`${T}-5-cadre`);

  // 7) Un clic réel sur le cadre le sélectionne : la ligne devient « Modifier le graphique… » ; la poignée d'angle le redimensionne.
  // À 700x400 la zone d'écriture ne fait que ~250 px de haut : le cadre posé (480 x 300, soit ~256 px à l'écran) la dépasse. Un clic réel dans son centre le sélectionne, puis la personne fait
  // défiler pour amener le coin bas droit - sa poignée - sous la main.
  await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), FRAME);
  await page.waitForTimeout(150);
  const frameCenter = await centerOf(FRAME);
  await page.mouse.click(frameCenter.x, frameCenter.y);
  await page.waitForTimeout(250);
  await page.evaluate(sel => { const box = document.getElementById('editor-container'); const f = document.querySelector(sel).getBoundingClientRect(); box.scrollTop += f.bottom - (box.getBoundingClientRect().bottom - 30); }, FRAME);
  await page.waitForTimeout(200);
  const sizeOf = () => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; }, FRAME);
  const before = await sizeOf();
  const grip = await centerOf(`${FRAME} .editor-image-handle-se`);
  if (grip) {
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x - 60, grip.y - 8, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
  const after = await sizeOf();
  const resized = (await chartNodes())[0];
  check(`${T}, cadre : tirer la poignée d'angle de 60 px à la souris le réduit de 60 px à l'écran, largeur ET hauteur réglées dans le modèle`, !!grip && Math.abs(before.w - after.w - 60) < 3 && !!resized && /px$/.test(resized.width) && /px$/.test(resized.height), { before, after, resized, grip });
  await openMenu();
  const editLabel = (await rowLabels())[ROW_INDEX];
  const editActive = await page.evaluate(() => document.getElementById('v2-btn-chart').classList.contains('is-active'));
  const rowsWithToolbar = [];
  for (const sel of ROWS) rowsWithToolbar.push(await hit(sel));
  const greyedRows = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row')).map(r => r.classList.contains('v2-hf-locked')));
  check(`${T}, modification : un clic sur le cadre le sélectionne ; la ligne devient « Modifier le graphique… », allumée, et reste au premier plan devant la barre flottante`, editLabel === 'Modifier le graphique…' && editActive && !greyedRows[ROW_INDEX] && seen(rowsWithToolbar[ROW_INDEX]), { editLabel, editActive, row: rowsWithToolbar[ROW_INDEX] });
  await snap(`${T}-6-menu-modifier`);
  await clickRow(ROW);
  await page.waitForFunction(() => { const s = document.getElementById('pp-chart-pick'); return !!s && s.options[0] && !/^(Lecture des graphiques|Reading the charts)/.test(s.options[0].textContent); }, null, { timeout: 8000 });
  await settle();
  const editTitle = await textOf('#pp-chart-title');
  check(`${T}, modification : la fenêtre s'ouvre « Modifier le graphique », le graphique et ses lignes choisis, « Valider », l'aperçu dessiné`, (await winOpen()) && editTitle === 'Modifier le graphique' && (await textOf(OK)) === 'Valider' && (await page.evaluate(() => document.getElementById('pp-chart-pick').value)) === '101' && (await isChecked(RADIO_LINKED)) && (await previewState()) === 'chart', { editTitle, state: await previewState() });
  const toolbarOver = await page.evaluate(() => { const tb = document.querySelector('.v2-floating-toolbar.visible'); if (!tb) return false; const r = tb.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && tb.contains(top); });
  check(`${T}, modification : la barre flottante de l'image ne se peint pas par-dessus la fenêtre ouverte`, !toolbarOver, { toolbarOver });
  await clickCenter(TRIGGER);
  await page.keyboard.type('courbe', { delay: 12 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await settle();
  await clickCenter(LABEL_ALL);
  await settle();
  await clickCenter(OK);
  await page.waitForTimeout(400);
  const edited = await chartNodes();
  check(`${T}, modification : un autre graphique et « Toute la table » - un seul graphique, la même taille réglée, la fenêtre fermée`, !(await winOpen()) && edited.length === 1 && edited[0].section === '102' && edited[0].scope === 'all' && edited[0].width === resized.width && edited[0].height === resized.height, { edited, resized });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const undone = await chartNodes();
  check(`${T}, modification : un seul Ctrl+Z remet l'ancien graphique`, undone.length === 1 && undone[0].section === '101' && undone[0].scope === 'linked', undone);

  // 8) La liaison entre les deux tables, à régler à la validation : sa fenêtre passe AU-DESSUS de celle du graphique ; refusée, rien n'est inséré.
  await setDoc('<p>Bonjour le monde entier</p><p>Deuxième ligne</p>');
  await page.evaluate(async () => { await GristAPI.deleteLinkRule('GfVentes'); await GristAPI.refreshSchema(); });
  await caretAtEnd('Deuxième');
  await openWindowByMouse();
  await clickCenter(TRIGGER);
  await page.keyboard.type('par mois', { delay: 12 });
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await settle();
  const noRuleScope = { all: await isChecked(RADIO_ALL), linked: await isChecked(RADIO_LINKED) };
  await clickCenter(LABEL_LINKED);
  await settle();
  const needs = { state: await previewState(), message: await textOf(MESSAGE), detail: await textOf(`${WIN} .pp-chart-option:nth-of-type(1) .pp-chart-option-detail`), ok: await isDisabled(OK) };
  check(`${T}, liaison : sans règle, « Toute la table » est cochée d'office ; « Les lignes liées » le dit et l'aperçu invite à régler la liaison, « Insérer » reste allumé`, noRuleScope.all && !noRuleScope.linked && needs.state === 'needsLink' && /Liaison avec « GfVentes » à régler/.test(needs.message) && /se règle à la validation/.test(needs.detail) && !needs.ok, { noRuleScope, needs });
  await snap(`${T}-7-liaison-a-regler`);
  await clickCenter(OK);
  await page.waitForTimeout(500);
  const linkBox = await hit(`${LINK_MODAL} .modal-content, ${LINK_MODAL} .modal-box, ${LINK_MODAL} > div`);
  const stack = await page.evaluate(({ link, win }) => { const a = document.querySelector(link), b = document.querySelector(win); return a && b ? { link: parseInt(getComputedStyle(a).zIndex, 10), win: parseInt(getComputedStyle(b).zIndex, 10), shown: getComputedStyle(a).display !== 'none' } : null; }, { link: LINK_MODAL, win: WIN });
  check(`${T}, liaison : « Insérer » ouvre la fenêtre de la liaison AU-DESSUS de celle du graphique, dans le panneau, visible`, !!stack && stack.shown && stack.link > stack.win && linkBox.found && linkBox.inPanel && linkBox.onTop, { stack, linkBox });
  await snap(`${T}-8-liaison`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(`${T}, liaison : refusée (Échap), la fenêtre du graphique reste ouverte et rien n'est inséré`, (await winOpen()) && (await chartNodes()).length === 0 && (await isHidden(LINK_MODAL)), { open: await winOpen(), nodes: (await chartNodes()).length });
  await page.evaluate(async () => { await GristAPI.saveLinkRule('GfVentes', { mode: 'match', colonneCible: 'Client', colonneSource: 'id' }); await GristAPI.refreshSchema(); });
  await closeWindowWithEscape();

  // 9) Le clavier : Tab ne sort pas de la fenêtre, Échap la ferme sans toucher au texte.
  await caretAtEnd('Deuxième');
  await openWindowByMouse();
  const trail = [];
  for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); trail.push(await focusIn()); }
  check(`${T}, clavier : Tab tourne dans la fenêtre (liste, lignes, boutons) sans en sortir`, trail.every(f => !/^(ailleurs|editor|rien)/.test(f)) && new Set(trail).size >= 3, trail);
  await page.keyboard.press('Shift+Tab');
  check(`${T}, clavier : Maj+Tab revient en arrière dans la fenêtre`, !/^(ailleurs|editor|rien)/.test(await focusIn()), await focusIn());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const caretBack = await page.evaluate(() => EditorCore.getEditor().state.selection.$from.parent.textContent);
  check(`${T}, clavier : Échap ferme sans rien insérer, le clavier revient dans l'éditeur au même endroit`, !(await winOpen()) && (await chartNodes()).length === 0 && (await focusIn()) === 'editor' && caretBack === 'Deuxième ligne', { focus: await focusIn(), caretBack });

  // 10) La Lecture : le graphique est tracé pour la ligne affichée, dans le panneau.
  await setDoc('<p>Bonjour le monde entier</p><p><img class="editor-image" alt="Graphique" style="width: 480px; height: 300px" data-layer="normal" data-wrap="inline" data-chart-section="101" data-chart-scope="linked" data-chart-name="Ventes par mois"></p>');
  await clickCenter('#btn-mode-read');
  await page.waitForFunction(() => { const i = document.querySelector('#reader-container .reader-content img'); return !!i && i.naturalWidth > 0; }, null, { timeout: 25000 });
  await page.waitForTimeout(300);
  const reading = await page.evaluate(() => { const i = document.querySelector('#reader-container .reader-content img'); const r = i.getBoundingClientRect(); return { natural: [i.naturalWidth, i.naturalHeight], w: r.width, h: r.height, l: r.left, r: r.right, count: document.querySelectorAll('#reader-container .reader-content img').length, src: i.getAttribute('src').slice(0, 22) }; });
  const readZoom = await page.evaluate(() => { const z = parseFloat(getComputedStyle(document.querySelector('#reader-container .reader-content')).zoom); return z > 0 ? z : 1; });
  check(`${T}, lecture : le graphique est une image PNG tracée (1 440 x 900) pour la ligne affichée, à 480 x 300 px, dans le panneau`, reading.count === 1 && reading.src === 'data:image/png;base64,' && reading.natural[0] === 1440 && reading.natural[1] === 900 && Math.abs(reading.w / readZoom - 480) < 3 && Math.abs(reading.h / readZoom - 300) < 3 && reading.l >= 0 && reading.r <= WIDTH + 0.5, { reading, readZoom });
  await snap(`${T}-9-lecture`);
  await clickCenter('#btn-mode-edit');
  await page.waitForTimeout(400);
}

async function runEnglish() {
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await setDoc('<p>Hello big world</p>');
  await seedDocument();
  await caretAtEnd('Hello');
  await openMenu();
  const labels = await rowLabels();
  const flyout = await hit(FLYOUT);
  const rows = [];
  for (const sel of ROWS) rows.push(await hit(sel));
  check('anglais, menu : le volet « Link and content blocks » montre « Chart from the page… » en septième ligne, dans le panneau', labels.length === 7 && /^Link…\s*Ctrl\+K$/.test(labels[0]) && labels[5] === 'QR code…' && labels[ROW_INDEX] === 'Chart from the page…' && flyout.inPanel && rows.every(seen), { labels, flyout, rows });
  await snap('en-1-menu');
  await clickRow(ROW);
  await page.waitForFunction(() => { const s = document.getElementById('pp-chart-pick'); return !!s && s.options[0] && !/^(Lecture des graphiques|Reading the charts)/.test(s.options[0].textContent); }, null, { timeout: 8000 });
  await page.waitForTimeout(200);
  const en = await page.evaluate(() => {
    const text = sel => (document.querySelector(sel) || {}).textContent;
    return { title: text('#pp-chart-title'), label: text('#pp-chart-modal .pp-dialog-label'), placeholder: document.getElementById('pp-chart-pick').options[0].textContent, hint: text('#pp-chart-hint'), rows: text('#pp-chart-modal .pp-chart-rows legend'), preview: text('#pp-chart-modal .pp-chart-side .pp-dialog-label'), message: text('#pp-chart-modal .pp-chart-message'), ok: text('#pp-chart-modal .var-modal-primary'), cancel: text('#pp-chart-modal .var-modal-actions button:not(.var-modal-primary)') };
  });
  const box = await hit(BOX), ok = await hit(OK), cancel = await hit(CANCEL), trigger = await hit(TRIGGER), paper = await hit(PAPER);
  const scroll = await page.evaluate(sel => { const b = document.querySelector(sel); return b.scrollHeight <= b.clientHeight + 1 && b.scrollWidth <= b.clientWidth + 1; }, BODY);
  check('anglais, fenêtre : titre, libellés, indication, aperçu, message et boutons en anglais, dans le panneau, sans défiler', en.title === 'Insert a chart from the page' && en.label === 'Chart' && en.placeholder === '— Choose a chart —' && /^The chart is set up in Grist/.test(en.hint) && en.rows === 'Rows to plot' && en.preview === 'Preview' && en.message === 'Choose a chart.' && en.ok === 'Insert' && en.cancel === 'Cancel' && box.inPanel && seen(ok) && seen(cancel) && seen(trigger) && seen(paper) && scroll, { en, box, scroll });
  await snap('en-2-fenetre');
  await clickCenter(TRIGGER);
  await page.waitForTimeout(250);
  const off = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chart-modal .ss-option.is-unavailable .ss-reason')).map(r => r.textContent));
  const groups = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chart-modal .ss-group')).map(g => g.textContent.trim()));
  check('anglais, liste : les pages et les raisons grisées sont en anglais', groups[0] === 'Page: Ventes' && off.length === 4 && off.some(r => r === 'Kaplan-Meier: not redrawn yet.') && off.some(r => /^Custom widget/.test(r)), { groups, off });
  await snap('en-3-liste');
  await page.keyboard.type('by month', { delay: 12 });
  await page.waitForTimeout(200);
  const none = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chart-modal .ss-option')).length);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('par mois', { delay: 12 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await settle();
  const caption = await textOf(CAPTION);
  check('anglais, choix : la liste se tape et se valide, la légende de l\'aperçu est « For the current row. », le graphique est dessiné', none === 0 && caption === 'For the current row.' && (await previewState()) === 'chart', { none, caption, state: await previewState() });
  await clickCenter(OK);
  await page.waitForTimeout(400);
  const frameCenter = await centerOf(FRAME);
  await page.mouse.click(frameCenter.x, frameCenter.y);
  await page.waitForTimeout(250);
  await openMenu();
  const editLabel = (await rowLabels())[ROW_INDEX];
  check('anglais, modification : la ligne devient « Edit chart… » quand le cadre est sélectionné', editLabel === 'Edit chart…', editLabel);
  await closeMenu();
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(250);
  await closeWindowWithEscape();
}

await seedDocument();
await run('light');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(200);
await run('dark');
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucun avertissement de ProseMirror (sélection invalide, contenu refusé) ni des modules du graphique pendant le parcours', consoleProblems.length === 0, consoleProblems);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
