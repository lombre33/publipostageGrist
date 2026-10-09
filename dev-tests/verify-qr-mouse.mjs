#!/usr/bin/env node
// QR code (js/qr-code.js, js/main-toolbar.js, css/qr-code.css, js/editor-nodes.js) : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au VRAI clavier (frappe, Tab, Entrée,
// Échap, Ctrl+Z), en clair, en sombre et en anglais. Ce que scenarios-qr-code.js ne peut pas voir depuis la page :
//  - le survol de l'icône chaîne ouvre le menu « Lien et blocs de contenu » : ses sept lignes, « QR code… » en sixième, tiennent dans le panneau et sont au premier plan, le volet ne déborde pas ;
//  - un clic sur « QR code… » ouvre la fenêtre ; elle tient dans 700x400 sans défiler - titre, champ, « Insérer une colonne… », aperçu et boutons visibles ; le focus est dans le champ ;
//  - taper une adresse montre son QR code (relu par un décodeur) ; « Insérer » le pose dans le document, à 120 px et carré, et rend le clavier à l'éditeur ;
//  - un clic sur le QR code le sélectionne : la ligne devient « Modifier le QR code… », la fenêtre s'ouvre remplie, Entrée valide, un Ctrl+Z revient à l'ancien ;
//  - « Insérer une colonne… » : la liste avec recherche s'ouvre AU-DESSUS de la fenêtre et dans le panneau, se tape et se valide au clavier ; l'aperçu montre la ligne en cours ;
//  - taper « # » dans le champ ouvre la liste des colonnes, visible et cliquable par-dessus la fenêtre ; Entrée choisit sans valider la fenêtre ;
//  - le cadre d'un QR code à colonne (sans image) reste carré, se sélectionne à la souris et se redimensionne par la barre flottante de l'image ;
//  - Tab ne sort pas de la fenêtre, Échap la ferme sans toucher au texte ; les contrastes des textes de la fenêtre et du cadre (≥ 4,5:1) en clair et en sombre ;
//  - l'interface en anglais.
// Lancé par run-headless.mjs (groupe Node "qrMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-qr-mouse.mjs
// QR_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.QR_MOUSE_PORT || 8914);
const SHOTS = process.env.QR_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-links-blocks-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/qrcode\.min\.js$/, 'umd/qrcode.min.js'],
] : [];
if (!OFFLINE) console.log('[verify-qr-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
// Un avertissement de ProseMirror ou de TipTap (sélection invalide, contenu refusé) trahit un geste qui n'a pas la forme attendue : aucun ne doit sortir pendant le parcours.
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|QrCode|qr-code/i.test(m.text())) consoleProblems.push(m.text()); });
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
// Le document tel qu'écrit : TipTap garde un paragraphe vide à la fin quand le dernier bloc n'en est pas un.
const written = async () => (await html()).replace(/<p><\/p>$/, '');
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
// Un clic réel dans le texte, puis le curseur en fin de ligne.
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
async function closeMenu() {
  // Le volet à sept lignes (jusqu'à « Graphique de la page… ») descend à ~395 px et couvre le bas du milieu du panneau : la souris le quitte par le coin bas droit.
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
  if (await winOpen()) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
}
// La feuille est réduite pour tenir dans les 700 px (zoom d'ajustement, js/main.js:applyPageFitZoom) : getBoundingClientRect() rend des pixels ÉCRAN, les tailles de la feuille sont en pixels de mise en page.
const sheetZoom = () => page.evaluate(() => { const sheet = document.querySelector('.tiptap').closest('.v2-page-sheet'); const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN; return z > 0 ? z : 1; });

await page.addScriptTag({ url: OFFLINE ? `${BASE}/dev-tests/.offline-cache/umd/jsqr.js` : 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js' });

const MAIN = '#v2-btn-link';
const ROW = '#v2-btn-qr';
const ROWS = ['#v2-row-link', '#v2-btn-citation', '#v2-btn-code-block', '#v2-btn-callout', '#v2-btn-signature', ROW, '#v2-btn-chart'];
const FLYOUT = '#v2-blocks-flyout';
const WIN = '#pp-qr-modal';
const BOX = `${WIN} .modal-content`;
const BODY = `${WIN} .pp-modal-body`;
const FIELD = '#pp-qr-text';
const OK = `${WIN} .var-modal-primary`;
const CANCEL = `${WIN} .var-modal-actions button:not(.var-modal-primary)`;
const COLUMN = `${WIN} .pp-qr-column`;
const PAPER = `${WIN} .pp-qr-paper`;
const PREVIEW = `${WIN} .pp-qr-image`;
const MESSAGE = `${WIN} .pp-qr-message`;
const CAPTION = `${WIN} .pp-qr-caption`;
const LIST = `${WIN} .ss-panel`;
const LIST_INPUT = `${WIN} .ss-input`;
const SUGGEST = '#autocomplete-box';
const QR_IMG = '.tiptap .editor-image-view img';
const FRAME = '.tiptap .editor-image-qr-placeholder';
const TOOLBAR_BTN = action => `.v2-floating-toolbar button[data-action="${action}"]`;

const winOpen = () => page.evaluate(() => { const m = document.getElementById('pp-qr-modal'); return !!m && m.style.display !== 'none'; });
const focusIn = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.closest('.tiptap') ? 'editor' : (a.closest('#pp-qr-modal') ? (a.id || (a.className || '').split(' ')[0] || a.textContent.trim() || a.tagName) : (a.closest('#autocomplete-box') ? 'autocomplete' : 'ailleurs : ' + (a.id || a.tagName)))) : 'rien'; });
const fieldValue = () => page.evaluate(() => document.getElementById('pp-qr-text').value);
const textOf = selector => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.trim() : null; }, selector);
const isHidden = selector => page.evaluate(sel => { const e = document.querySelector(sel); return !e || e.hidden || getComputedStyle(e).display === 'none'; }, selector);
const isDisabled = selector => page.evaluate(sel => { const e = document.querySelector(sel); return !!e && e.disabled; }, selector);
const rowLabels = () => page.evaluate(() => Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row')).map(r => r.textContent.trim()));
const QR_ROW_INDEX = 5;
// Les QR codes du document, tels qu'écrits : texte gardé, présence d'une image, largeur.
const qrNodes = () => page.evaluate(() => Array.from(new DOMParser().parseFromString(Editor.getHTML(), 'text/html').querySelectorAll('img[data-qr-text]')).map(i => ({ text: i.getAttribute('data-qr-text'), hasSrc: i.hasAttribute('src'), src: i.getAttribute('src'), width: i.style.width })));
// Le texte que lit un décodeur (jsQR, chargé dans la page) dans une image `data:`.
const decode = src => page.evaluate(async s => {
  const img = new Image(); img.src = s; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const found = window.jsQR(data.data, data.width, data.height);
  return found ? found.data : null;
}, src);
const previewRead = async () => ((await isHidden(PREVIEW)) ? null : decode(await page.evaluate(sel => document.querySelector(sel).src, PREVIEW)));
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
// La table et la ligne en cours, pour que le champ « colonne » ait de quoi se résoudre (comme dans le document d'Antoine).
async function seedRecord() {
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    const row = { id: 1, Nom: 'Atelier Durand', Site: 'https://durand.example/accueil', Montant: 12000 };
    stub.setVariables('QrClients', { Nom: 'Text', Site: 'Text', Montant: 'Numeric' });
    stub.setRows('QrClients', [row]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, row), 'QrClients');
  });
  await page.waitForTimeout(150);
}
// Ouvre la fenêtre par la ligne du menu à la vraie souris (curseur déjà posé dans le texte).
async function openWindowByMouse() {
  await clickRow(ROW);
  await page.waitForTimeout(150);
}
async function typeSlowly(text) {
  await page.keyboard.type(text, { delay: 12 });
  await page.waitForTimeout(450);
}

async function run(theme) {
  const T = theme;
  await setDoc('<p>Bonjour le monde entier</p><p>Deuxième ligne</p>');
  await seedRecord();

  // 1) Le menu : un survol réel de l'icône chaîne ouvre le volet, ses sept lignes sont dans le panneau et au premier plan.
  const mainBox = await hit(MAIN);
  check(`${T}, menu : l'icône chaîne est visible dans le panneau ${WIDTH}x${HEIGHT} et sous la souris`, seen(mainBox), mainBox);
  await openMenu();
  const flyout = await hit(FLYOUT);
  const rows = [];
  for (const sel of ROWS) rows.push(await hit(sel));
  check(`${T}, menu : au survol, le volet s'ouvre dans le panneau avec ses sept lignes au premier plan`, flyout.found && flyout.inPanel && rows.every(seen), { flyout, rows });
  const labels = await rowLabels();
  check(`${T}, menu : « Lien… », « Citation », « Bloc de code », « Encadré… », « Bloc de signature », « QR code… » puis « Graphique de la page… »`, labels.length === 7 && /^Lien…\s*Ctrl\+K$/.test(labels[0]) && labels[1] === 'Citation' && labels[2] === 'Bloc de code' && labels[3] === 'Encadré…' && labels[4] === 'Bloc de signature' && labels[QR_ROW_INDEX] === 'QR code…' && labels[6] === 'Graphique de la page…', labels);
  await snap(`${T}-1-menu`);
  await closeMenu();
  const closed = await page.evaluate(() => getComputedStyle(document.getElementById('v2-blocks-flyout')).display === 'none');
  check(`${T}, menu : la souris partie, le volet se referme`, closed);

  // 2) La fenêtre, ouverte par un clic réel sur « QR code… » : elle tient dans le panneau sans défiler, le focus est dans le champ.
  await caretAtEnd('Deuxième');
  await openWindowByMouse();
  const opened = await winOpen();
  const box = await hit(BOX), title = await hit('#pp-qr-title'), field = await hit(FIELD), column = await hit(COLUMN), ok = await hit(OK), cancel = await hit(CANCEL), paper = await hit(PAPER), message = await hit(MESSAGE);
  const scroll = await page.evaluate(sel => { const b = document.querySelector(sel); return { scrollH: b.scrollHeight, clientH: b.clientHeight, scrollW: b.scrollWidth, clientW: b.clientWidth }; }, BODY);
  check(`${T}, fenêtre : un clic sur « QR code… » l'ouvre`, opened, { opened });
  check(`${T}, fenêtre : elle tient dans ${WIDTH}x${HEIGHT} sans défiler - titre, champ, « Insérer une colonne… », aperçu, « Annuler » et « Insérer » au premier plan`, box.inPanel && seen(title) && seen(field) && seen(column) && seen(paper) && seen(message) && seen(ok) && seen(cancel) && scroll.scrollH <= scroll.clientH + 1 && scroll.scrollW <= scroll.clientW + 1, { box, title, field, column, ok, cancel, paper, message, scroll });
  check(`${T}, fenêtre : le focus est dans le champ, vide ; « Insérer » grisé ; le message d'aperçu invite à saisir`, (await focusIn()) === 'pp-qr-text' && (await fieldValue()) === '' && (await isDisabled(OK)) && (await textOf(MESSAGE)) === 'Saisissez une adresse ou un texte.', { focus: await focusIn(), disabled: await isDisabled(OK), message: await textOf(MESSAGE) });
  const colors = { title: await contrastOf('#pp-qr-title'), label: await contrastOf(`${WIN} .pp-dialog-label`), hint: await contrastOf('#pp-qr-hint'), column: await contrastOf(COLUMN), message: await contrastOf(MESSAGE), cancel: await contrastOf(CANCEL) };
  check(`${T}, fenêtre : tous les textes ont un contraste d'au moins 4,5:1 (titre, libellé, indication, bouton de colonne, message d'aperçu, « Annuler »)`, Object.values(colors).every(v => v >= 4.5), colors);
  const paperLook = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).backgroundColor, PAPER);
  check(`${T}, fenêtre : l'aperçu est une feuille blanche, même en sombre (un QR code se lit noir sur blanc)`, paperLook === 'rgb(255, 255, 255)', paperLook);
  await snap(`${T}-2-fenetre`);

  // 3) Taper une adresse au vrai clavier : l'aperçu montre son QR code, relu ; « Insérer » le pose.
  await typeSlowly('https://exemple.fr/qr?a=é');
  const shown = !(await isHidden(PREVIEW));
  const read = await previewRead();
  check(`${T}, saisie : l'adresse tapée au clavier montre son QR code dans l'aperçu (relu : la même adresse), « Insérer » s'allume`, shown && read === 'https://exemple.fr/qr?a=é' && !(await isDisabled(OK)), { shown, read, disabled: await isDisabled(OK) });
  const previewBox = await hit(PREVIEW);
  check(`${T}, saisie : l'image d'aperçu est carrée et tient dans la feuille de 150 px`, previewBox.found && Math.abs(previewBox.w - previewBox.h) < 1.5 && previewBox.w >= 100 && previewBox.w <= 150.5, previewBox);
  await snap(`${T}-3-apercu`);
  await clickCenter(OK);
  const nodes = await qrNodes();
  const zoom = await sheetZoom();
  const placed = await page.evaluate(sel => { const i = document.querySelector(sel); if (!i) return null; const r = i.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, r: r.right }; }, QR_IMG);
  check(`${T}, insertion : « Insérer » pose un QR code complet (image PNG, texte gardé, 120 px), la fenêtre se ferme, le clavier est dans l'éditeur`, !(await winOpen()) && nodes.length === 1 && nodes[0].text === 'https://exemple.fr/qr?a=é' && nodes[0].hasSrc && /^data:image\/png/.test(nodes[0].src) && nodes[0].width === '120px' && (await focusIn()) === 'editor', { nodes: nodes.map(n => [n.text, n.hasSrc, n.width]), focus: await focusIn() });
  check(`${T}, insertion : dans le document l'image est carrée (120 px à l'échelle de la feuille) et dans le panneau en largeur ; le décodeur relit l'adresse`, !!placed && Math.abs(placed.w - placed.h) < 1.5 && Math.abs(placed.w / zoom - 120) < 1.5 && placed.l >= 0 && placed.r <= WIDTH + 0.5 && (await decode(nodes[0].src)) === 'https://exemple.fr/qr?a=é', { placed, zoom });
  await snap(`${T}-4-insere`);

  // La poignée d'angle, tirée à la vraie souris, redimensionne le QR code sans le déformer (l'image est carrée, sa hauteur suit sa largeur) et suit le pointeur : +60 px de souris, +60 px
  // d'image à l'écran, malgré le zoom d'ajustement du panneau (0,847 à 700 px ; EditorCore.layoutZoom, js/editor-nodes.js).
  const handleDrag = async frameSelector => {
    const c = await centerOf(frameSelector);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(250);
    const size = () => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; }, frameSelector);
    const before = await size();
    const grip = await centerOf(`${frameSelector.replace(/ img$/, '')} .editor-image-handle-se`);
    if (!grip) return { before, after: before, grip: null };
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x + 60, grip.y + 8, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    return { before, after: await size(), grip };
  };
  const dragFull = await handleDrag(QR_IMG);
  check(`${T}, insertion : tirer la poignée d'angle de 60 px à la souris agrandit le QR code de 60 px sans le déformer (reste carré)`, !!dragFull.grip && Math.abs(dragFull.after.w - dragFull.before.w - 60) < 3 && Math.abs(dragFull.after.w - dragFull.after.h) < 1.5, dragFull);
  await page.mouse.click(WIDTH - 40, HEIGHT - 40);
  await page.waitForTimeout(150);

  // 4) Modifier : un clic réel sur l'image la sélectionne, la ligne devient « Modifier le QR code… », la fenêtre s'ouvre remplie.
  const imgPoint = await centerOf(QR_IMG);
  await page.mouse.click(imgPoint.x, imgPoint.y);
  await page.waitForTimeout(250);
  const widthBeforeEdit = (await qrNodes())[0].width;
  const toolbarZoom = await hit(TOOLBAR_BTN('zoom-in'));
  await openMenu();
  const editLabel = (await rowLabels())[QR_ROW_INDEX];
  const editActive = await page.evaluate(() => document.getElementById('v2-btn-qr').classList.contains('is-active'));
  check(`${T}, modification : un clic sur le QR code le sélectionne (barre flottante de l'image visible) et la ligne devient « Modifier le QR code… », allumée`, seen(toolbarZoom) && editLabel === 'Modifier le QR code…' && editActive, { toolbarZoom, editLabel, editActive });
  // La barre flottante de l'image, posée juste au-dessus de l'image, tombe sur les lignes du menu : le menu doit passer devant (js/layers.js : --z-menu au-dessus de --z-floating-toolbar).
  const rowsWithToolbar = [];
  for (const sel of ROWS) rowsWithToolbar.push(await hit(sel));
  // Une ligne grisée (pointer-events: none : « Lien… » et « Bloc de code » avec une image sélectionnée) n'est pas touchée par la souris : seules les lignes actives sont à tester, « QR code… » en tête.
  const greyedRows = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row')).map(r => r.classList.contains('v2-hf-locked')));
  const activeRows = rowsWithToolbar.filter((_, i) => !greyedRows[i]);
  const toolbarOverlap = await page.evaluate(() => { const tb = document.querySelector('.v2-floating-toolbar.visible'); const fl = document.getElementById('v2-blocks-flyout'); if (!tb || !fl) return null; const a = tb.getBoundingClientRect(), b = fl.getBoundingClientRect(); return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; });
  check(`${T}, menu : la barre flottante de l'image est sur le volet (elles se recouvrent) et les lignes actives, « QR code… » comprise, restent au premier plan, cliquables`, toolbarOverlap === true && !greyedRows[QR_ROW_INDEX] && activeRows.length >= 4 && activeRows.every(seen), { toolbarOverlap, greyedRows, rowsWithToolbar });
  await snap(`${T}-5-menu-modifier`);
  await openWindowByMouse();
  const editTitle = await textOf('#pp-qr-title');
  const editOk = await textOf(OK);
  check(`${T}, modification : la fenêtre s'ouvre « Modifier le QR code », le champ rempli avec l'adresse du QR code, bouton « Valider », focus dans le champ`, (await winOpen()) && editTitle === 'Modifier le QR code' && (await fieldValue()) === 'https://exemple.fr/qr?a=é' && editOk === 'Valider' && (await focusIn()) === 'pp-qr-text', { editTitle, value: await fieldValue(), editOk, focus: await focusIn() });
  // La barre flottante de l'image (--z-floating-toolbar) ne doit pas se peindre par-dessus la fenêtre (js/modal-base.js) qui s'ouvre sur le QR code sélectionné.
  const toolbarOver = await page.evaluate(() => { const tb = document.querySelector('.v2-floating-toolbar.visible'); if (!tb) return false; const r = tb.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && tb.contains(top); });
  check(`${T}, modification : la barre flottante de l'image ne se peint pas par-dessus la fenêtre ouverte`, !toolbarOver, { toolbarOver });
  await snap(`${T}-5b-fenetre-modifier`);
  await page.keyboard.press('Control+a');
  await typeSlowly('https://exemple.fr/deux');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const edited = await qrNodes();
  check(`${T}, modification : Entrée valide - un seul QR code, la nouvelle adresse (relue), la même largeur, la fenêtre fermée`, !(await winOpen()) && edited.length === 1 && edited[0].text === 'https://exemple.fr/deux' && (await decode(edited[0].src)) === 'https://exemple.fr/deux' && edited[0].width === widthBeforeEdit, { widthBeforeEdit, edited: edited.map(n => [n.text, n.width]) });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const undone = await qrNodes();
  check(`${T}, modification : un seul Ctrl+Z (clavier dans l'éditeur) remet l'ancienne adresse`, undone.length === 1 && undone[0].text === 'https://exemple.fr/qr?a=é', undone.map(n => n.text));

  // 5) Une colonne : « Insérer une colonne… » à la souris, la recherche au clavier, l'aperçu de la ligne en cours.
  await setDoc('<p>Bonjour le monde entier</p><p>Deuxième ligne</p>');
  await caretAtEnd('Deuxième');
  await openWindowByMouse();
  await clickCenter(COLUMN);
  await page.waitForTimeout(250);
  const list = await hit(LIST);
  const firstOption = await hit(`${WIN} .ss-option`);
  check(`${T}, colonne : « Insérer une colonne… » ouvre la liste avec recherche DANS le panneau et AU-DESSUS de la fenêtre, premier choix visible`, list.found && list.inPanel && list.onTop && seen(firstOption), { list, firstOption });
  const searchFocus = await page.evaluate(() => { const a = document.activeElement; return !!a && a.classList.contains('ss-input'); });
  await snap(`${T}-6-colonnes`);
  await page.keyboard.type('site', { delay: 12 });
  await page.waitForTimeout(200);
  const options = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-qr-modal .ss-option')).map(o => o.textContent.replace(/\s+/g, ' ').trim()));
  check(`${T}, colonne : le focus est dans la recherche ; taper « site » ne laisse que « QrClients.Site »`, searchFocus && options.length === 1 && options[0].startsWith('QrClients.Site'), { searchFocus, options });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const afterPick = { value: await fieldValue(), focus: await focusIn(), listGone: await isHidden(LIST), caption: await textOf(CAPTION), captionShown: !(await isHidden(CAPTION)), read: await previewRead() };
  check(`${T}, colonne : Entrée dans la liste écrit « #QrClients.Site » dans le champ, rend le clavier au champ ; l'aperçu montre le QR code de la ligne en cours (relu) avec sa légende`, afterPick.value === '#QrClients.Site' && afterPick.focus === 'pp-qr-text' && afterPick.listGone && afterPick.captionShown && afterPick.caption === 'Pour la ligne en cours.' && afterPick.read === 'https://durand.example/accueil', afterPick);
  const captionBox = await hit(CAPTION);
  const hintBox = await hit('#pp-qr-hint');
  const scroll2 = await page.evaluate(sel => { const b = document.querySelector(sel); return b.scrollHeight <= b.clientHeight + 1 && b.scrollWidth <= b.clientWidth + 1; }, BODY);
  check(`${T}, colonne : avec la légende, la fenêtre tient toujours dans ${WIDTH}x${HEIGHT} sans défiler (légende, indication et boutons visibles)`, seen(captionBox) && seen(hintBox) && seen(await hit(OK)) && scroll2, { captionBox, hintBox, scroll2 });
  await snap(`${T}-7-colonne-choisie`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const frameNodes = await qrNodes();
  const frame = await page.evaluate(sel => { const f = document.querySelector(sel); if (!f) return null; const r = f.getBoundingClientRect(); const label = f.querySelector('.editor-image-var-label'); return { w: r.width, h: r.height, l: r.left, r: r.right, label: label ? label.textContent : null }; }, FRAME);
  check(`${T}, colonne : Entrée pose un cadre sans image (le texte « #QrClients.Site » seul est gardé), carré, qui montre le texte, dans le panneau`, !(await winOpen()) && frameNodes.length === 1 && !frameNodes[0].hasSrc && frameNodes[0].text === '#QrClients.Site' && !!frame && Math.abs(frame.w - frame.h) < 1.5 && frame.label === '#QrClients.Site' && frame.l >= 0 && frame.r <= WIDTH + 0.5, { frameNodes: frameNodes.map(n => [n.text, n.hasSrc]), frame });
  const frameContrast = await contrastOf(`${FRAME} .editor-image-var-label`);
  check(`${T}, colonne : le texte du cadre a un contraste d'au moins 4,5:1`, frameContrast >= 4.5, frameContrast);
  await snap(`${T}-8-cadre`);

  // 6) Le cadre se sélectionne à la souris et se redimensionne par la barre flottante de l'image, toujours carré.
  const frameCenter = await centerOf(FRAME);
  await page.mouse.click(frameCenter.x, frameCenter.y);
  await page.waitForTimeout(250);
  const sizeOf = () => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; }, FRAME);
  const before = await sizeOf();
  const zoomIn = await hit(TOOLBAR_BTN('zoom-in'));
  await clickCenter(TOOLBAR_BTN('zoom-in'));
  const grown = await sizeOf();
  await clickCenter(TOOLBAR_BTN('zoom-out'));
  await clickCenter(TOOLBAR_BTN('zoom-out'));
  const shrunk = await sizeOf();
  check(`${T}, cadre : un clic le sélectionne, « agrandir » puis deux fois « réduire » le redimensionnent et il reste carré`, seen(zoomIn) && grown.w > before.w && shrunk.w < before.w && [before, grown, shrunk].every(s => Math.abs(s.w - s.h) < 1.5), { before, grown, shrunk });
  const dragFrame = await handleDrag(FRAME);
  check(`${T}, cadre : tirer la poignée d'angle de 60 px à la souris l'agrandit de 60 px sans le déformer (reste carré)`, !!dragFrame.grip && Math.abs(dragFrame.after.w - dragFrame.before.w - 60) < 3 && Math.abs(dragFrame.after.w - dragFrame.after.h) < 1.5, dragFrame);

  // 7) Taper « # » dans le champ : la liste des colonnes est visible et cliquable par-dessus la fenêtre ; Entrée choisit sans valider.
  await setDoc('<p>Bonjour le monde entier</p><p>Deuxième ligne</p>');
  await caretAtEnd('Deuxième');
  await openWindowByMouse();
  await typeSlowly('https://x.fr/#QrC');
  const suggest = await hit(SUGGEST);
  const suggestItem = await hit(`${SUGGEST} .ac-item`);
  const overWindow = await page.evaluate(({ list, win }) => parseInt(getComputedStyle(document.querySelector(list)).zIndex, 10) > parseInt(getComputedStyle(document.querySelector(win)).zIndex, 10), { list: SUGGEST, win: WIN });
  check(`${T}, « # » : la liste des colonnes s'ouvre dans le panneau, au premier plan par-dessus la fenêtre (niveau de la fenêtre + 1 par Layers.raise(boîte, fenêtre) de js/layers.js, aucune classe ni niveau propres à la fenêtre), premier choix cliquable`, suggest.found && suggest.inPanel && overWindow && seen(suggestItem), { suggest, suggestItem, overWindow });
  await snap(`${T}-9-diese`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(`${T}, « # » : Entrée choisit la première colonne dans le champ, la fenêtre reste ouverte, rien n'est inséré, la liste se ferme`, (await winOpen()) && /^https:\/\/x\.fr\/#QrClients\.\w+$/.test(await fieldValue()) && (await qrNodes()).length === 0 && (await isHidden(SUGGEST)), { value: await fieldValue(), nodes: (await qrNodes()).length });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(`${T}, Échap ferme la fenêtre sans rien insérer, le clavier revient à l'éditeur, la liste des colonnes reste fermée`, !(await winOpen()) && (await qrNodes()).length === 0 && (await focusIn()) === 'editor' && (await isHidden(SUGGEST)), { open: await winOpen(), focus: await focusIn(), hidden: await isHidden(SUGGEST) });

  // 8) Le clavier : Tab ne sort pas de la fenêtre.
  await caretAtEnd('Deuxième');
  await openWindowByMouse();
  await typeSlowly('abc');
  const trail = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); trail.push(await focusIn()); }
  check(`${T}, clavier : Tab tourne dans la fenêtre (champ, colonne, boutons) sans en sortir`, trail.every(f => !/^(ailleurs|editor|rien)/.test(f)) && new Set(trail).size >= 3, trail);
  await page.keyboard.press('Shift+Tab');
  check(`${T}, clavier : Maj+Tab revient en arrière dans la fenêtre`, !/^(ailleurs|editor|rien)/.test(await focusIn()), await focusIn());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const caretBack = await page.evaluate(() => EditorCore.getEditor().state.selection.$from.parent.textContent);
  check(`${T}, clavier : Échap ferme sans toucher au document, le clavier revient dans l'éditeur au même endroit`, !(await winOpen()) && (await qrNodes()).length === 0 && (await focusIn()) === 'editor' && caretBack === 'Deuxième ligne', { focus: await focusIn(), caretBack });
}

async function runEnglish() {
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await setDoc('<p>Hello big world</p>');
  await seedRecord();
  await caretAtEnd('Hello');
  await openMenu();
  const labels = await rowLabels();
  const flyout = await hit(FLYOUT);
  const rows = [];
  for (const sel of ROWS) rows.push(await hit(sel));
  check('anglais, menu : le volet « Link and content blocks » montre « QR code… » en sixième ligne et « Chart from the page… » en septième, dans le panneau', labels.length === 7 && /^Link…\s*Ctrl\+K$/.test(labels[0]) && labels[QR_ROW_INDEX] === 'QR code…' && labels[6] === 'Chart from the page…' && flyout.inPanel && rows.every(seen), { labels, flyout, rows });
  await snap('en-1-menu');
  await clickRow(ROW);
  await page.waitForTimeout(150);
  const en = await page.evaluate(() => {
    const text = sel => (document.querySelector(sel) || {}).textContent;
    return { title: text('#pp-qr-title'), label: text('#pp-qr-modal .pp-dialog-label'), column: text('#pp-qr-modal .pp-qr-column'), placeholder: document.getElementById('pp-qr-text').placeholder, hint: text('#pp-qr-hint'), preview: text('#pp-qr-modal .pp-qr-side .pp-dialog-label'), message: text('#pp-qr-modal .pp-qr-message'), ok: text('#pp-qr-modal .var-modal-primary'), cancel: text('#pp-qr-modal .var-modal-actions button:not(.var-modal-primary)') };
  });
  const box = await hit(BOX), ok = await hit(OK), cancel = await hit(CANCEL), column = await hit(COLUMN), field = await hit(FIELD), paper = await hit(PAPER);
  const scroll = await page.evaluate(sel => { const b = document.querySelector(sel); return b.scrollHeight <= b.clientHeight + 1 && b.scrollWidth <= b.clientWidth + 1; }, BODY);
  check('anglais, fenêtre : titre, libellés, indication, aperçu, message et boutons en anglais, dans le panneau, sans défiler', en.title === 'Insert a QR code' && en.label === 'Address or text' && en.column === 'Insert a column…' && en.placeholder === 'https://example.com' && en.hint === 'A column gives each row its own QR code.' && en.preview === 'Preview' && en.message === 'Enter an address or text.' && en.ok === 'Insert' && en.cancel === 'Cancel' && box.inPanel && seen(ok) && seen(cancel) && seen(column) && seen(field) && seen(paper) && scroll, { en, box, scroll });
  await snap('en-2-fenetre');
  await clickCenter(COLUMN);
  await page.waitForTimeout(250);
  await page.keyboard.type('nom', { delay: 12 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const caption = await textOf(CAPTION);
  check('anglais, colonne : la liste se tape et se valide, la légende de l\'aperçu est « For the current row. », le QR code est celui de la ligne', (await fieldValue()) === '#QrClients.Nom' && caption === 'For the current row.' && (await previewRead()) === 'Atelier Durand', { value: await fieldValue(), caption, read: await previewRead() });
  await snap('en-3-colonne');
  await clickCenter(OK);
  await page.waitForTimeout(300);
  await openMenu();
  await page.mouse.move(WIDTH - 30, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(250);
  const frameCenter = await centerOf(FRAME);
  await page.mouse.click(frameCenter.x, frameCenter.y);
  await page.waitForTimeout(250);
  await openMenu();
  const editLabel = (await rowLabels())[QR_ROW_INDEX];
  check('anglais, modification : la ligne devient « Edit QR code… » quand le cadre est sélectionné', editLabel === 'Edit QR code…', editLabel);
  await closeMenu();
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(250);
  await closeWindowWithEscape();
}

await seedRecord();
await run('light');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(200);
await run('dark');
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucun avertissement de ProseMirror (sélection invalide, contenu refusé) ni du module QR pendant le parcours', consoleProblems.length === 0, consoleProblems);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
