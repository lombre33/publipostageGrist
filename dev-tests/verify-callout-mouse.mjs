#!/usr/bin/env node
// Encadré et bloc de signature (js/callout.js, js/main-toolbar.js, css/callout.css) : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au VRAI clavier (flèches, Tab,
// Entrée, Échap, frappe, Ctrl+Z), en clair et en sombre. Ce que scenarios-callout-signature.js ne peut pas voir depuis la page :
//  - le survol de l'icône ouvre le menu, ses sept lignes tiennent dans le panneau et sont au premier plan (aucun autre volet ne les recouvre) ;
//  - un clic sur « Encadré… » ouvre la fenêtre ; elle tient dans 700x400 sans défiler, titre, trois groupes de choix, aperçu et boutons visibles, l'aperçu reste une feuille blanche en sombre ;
//  - un clic sur un type, une couleur et une icône change l'aperçu ; « Insérer » écrit l'encadré, ferme la fenêtre et rend le clavier à l'éditeur ;
//  - au clavier : les flèches changent le choix, Tab ne sort pas de la fenêtre, Échap annule sans toucher au texte, Entrée valide ;
//  - taper dans l'encadré, puis Entrée deux fois en sort ; un clic dans l'encadré rend la ligne « Modifier l'encadré… », « Retirer » défait l'encadré, Ctrl+Z le remet d'un coup ;
//  - le bloc de signature par sa ligne du menu : il apparaît dans le panneau, ses lignes de tirets bas tiennent chacune sur une ligne, et le clavier est dans la légende de gauche ;
//  - l'interface en anglais.
// Lancé par run-headless.mjs (groupe Node "calloutMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-callout-mouse.mjs
// CALLOUT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.CALLOUT_MOUSE_PORT || 8895);
const SHOTS = process.env.CALLOUT_SHOTS || '';
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
] : [];
if (!OFFLINE) console.log('[verify-callout-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|callout/i.test(m.text())) consoleProblems.push(m.text()); });
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

const MAIN = '#v2-btn-link';
const ROWS = ['#v2-row-link', '#v2-btn-citation', '#v2-btn-code-block', '#v2-btn-callout', '#v2-btn-signature', '#v2-btn-qr', '#v2-btn-chart'];
const WIN = '#pp-callout-modal';
const BOX = `${WIN} .modal-content`;
const OK = `${WIN} .var-modal-primary`;
const REMOVE = `${WIN} .var-modal-danger`;
const CANCEL = `${WIN} .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)`;
const choice = (kind, value) => `${WIN} .pp-callout-${kind}[data-value="${value}"]`;

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
const winOpen = () => page.evaluate(() => { const m = document.getElementById('pp-callout-modal'); return !!m && m.style.display !== 'none'; });
const html = () => page.evaluate(() => Editor.getHTML());
// Le document tel qu'écrit : TipTap garde un paragraphe vide à la fin quand le dernier bloc n'en est pas un.
const written = async () => (await html()).replace(/<p><\/p>$/, '');
const focusIn = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.closest('.tiptap') ? 'editor' : (a.closest('#pp-callout-modal') ? (a.dataset.value ? a.className.replace(/^pp-callout-/, '').split(' ')[0] + ':' + a.dataset.value : (a.id || a.textContent.trim() || a.tagName)) : 'ailleurs : ' + (a.id || a.tagName))) : 'rien'; });
const checkedOf = kind => page.evaluate(k => { const b = document.querySelector(`#pp-callout-modal .pp-callout-${k}[aria-checked="true"]`); return b ? b.dataset.value : null; }, kind);
const previewOf = () => page.evaluate(() => { const c = document.querySelector('#pp-callout-modal .pp-callout-paper .callout'); const cs = getComputedStyle(c); return { color: c.dataset.color, icon: c.dataset.icon, bg: cs.backgroundColor, bar: cs.borderLeftColor, paper: getComputedStyle(c.parentElement).backgroundColor, ink: cs.color }; });
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
const rowLabels = () => page.evaluate(() => Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row')).map(r => r.textContent.trim()));

async function run(theme) {
  const T = theme;
  await setDoc('<p>Bonjour le monde entier</p><p>Deuxième ligne</p>');

  // 1) Le menu : un survol réel de l'icône ouvre le volet, ses sept lignes sont dans le panneau et au premier plan.
  const mainBox = await hit(MAIN);
  check(`${T}, menu : l'icône est visible dans le panneau ${WIDTH}x${HEIGHT} et sous la souris`, seen(mainBox), mainBox);
  await openMenu();
  const flyout = await hit('#v2-blocks-flyout');
  const rows = [];
  for (const sel of ROWS) rows.push(await hit(sel));
  check(`${T}, menu : au survol, le volet s'ouvre dans le panneau avec ses sept lignes au premier plan`, flyout.found && flyout.inPanel && rows.every(seen), { flyout, rows });
  const labels = await rowLabels();
  const flyoutTitle = await page.evaluate(() => document.querySelector('#v2-blocks-flyout .v2-hover-flyout-label').textContent);
  check(`${T}, menu : « Lien… » (avec son raccourci), « Citation », « Bloc de code », « Encadré… », « Bloc de signature », « QR code… » et « Graphique de la page… »`, labels.length === 7 && /^Lien…\s*Ctrl\+K$/.test(labels[0]) && labels[1] === 'Citation' && labels[2] === 'Bloc de code' && labels[3] === 'Encadré…' && labels[4] === 'Bloc de signature' && labels[5] === 'QR code…' && labels[6] === 'Graphique de la page…' && flyoutTitle === 'Lien et blocs de contenu', { labels, flyoutTitle });
  await snap(`${T}-1-menu`);
  await closeMenu();
  const closed = await page.evaluate(() => getComputedStyle(document.getElementById('v2-blocks-flyout')).display === 'none');
  check(`${T}, menu : la souris partie, le volet se referme`, closed);

  // 2) La fenêtre, ouverte par un clic réel sur « Encadré… » (curseur dans un paragraphe) : elle tient dans le panneau sans défiler.
  await caretAtEnd('Deuxième');
  await clickRow('#v2-btn-callout');
  const opened = await winOpen();
  const box = await hit(BOX), title = await hit(`${WIN} h3`), ok = await hit(OK), cancel = await hit(CANCEL);
  const groups = [];
  for (const sel of [choice('type', 'note'), choice('type', 'important'), choice('swatch', 'blue'), choice('swatch', 'gray'), choice('icon-option', 'info'), choice('icon-option', 'star'), `${WIN} .pp-callout-paper .callout`]) groups.push(await hit(sel));
  const scroll = await page.evaluate(() => { const b = document.querySelector('#pp-callout-modal .pp-modal-body, #pp-callout-modal .modal-body') || document.querySelector('#pp-callout-modal .modal-content'); return { scrollH: b.scrollHeight, clientH: b.clientHeight }; });
  check(`${T}, fenêtre : un clic sur « Encadré… » l'ouvre`, opened, { opened });
  check(`${T}, fenêtre : elle tient dans ${WIDTH}x${HEIGHT} - titre, trois groupes de choix, aperçu, « Annuler » et « Insérer » au premier plan, sans défiler`, box.inPanel && seen(title) && seen(ok) && seen(cancel) && groups.every(seen) && scroll.scrollH <= scroll.clientH + 1, { box, title, ok, cancel, groups, scroll });
  check(`${T}, fenêtre : le focus est sur « Note » (le choix de départ), pas dans l'éditeur`, (await focusIn()) === 'type:note', await focusIn());
  const preview0 = await previewOf();
  check(`${T}, fenêtre : l'aperçu est bleu (Note) sur une feuille blanche, texte du document sombre, dans les deux thèmes`, preview0.color === 'blue' && preview0.paper === 'rgb(255, 255, 255)' && preview0.bg === 'rgb(239, 246, 255)' && preview0.bar === 'rgb(37, 99, 235)' && preview0.ink === 'rgb(27, 36, 48)', preview0);
  await snap(`${T}-2-fenetre`);

  // 3) La souris : un type, une couleur, une icône ; l'aperçu suit ; « Insérer » écrit l'encadré.
  await clickCenter(choice('type', 'attention'));
  const preview1 = await previewOf();
  check(`${T}, fenêtre : un clic sur « Attention » met l'aperçu en orange, icône triangle (type coché)`, preview1.color === 'amber' && preview1.icon === 'warning' && (await checkedOf('type')) === 'attention', { preview1, type: await checkedOf('type') });
  await clickCenter(choice('swatch', 'purple'));
  await clickCenter(choice('icon-option', 'bulb'));
  const preview2 = await previewOf();
  check(`${T}, fenêtre : un clic sur le rond violet puis sur l'ampoule change l'aperçu, plus aucun type coché`, preview2.color === 'purple' && preview2.icon === 'bulb' && preview2.bg === 'rgb(250, 245, 255)' && (await checkedOf('type')) === null, { preview2, type: await checkedOf('type') });
  await snap(`${T}-3-choix`);
  await clickCenter(OK);
  const h1 = await written();
  check(`${T}, insertion : « Insérer » entoure le paragraphe du curseur, la fenêtre se ferme, le clavier est dans l'éditeur`, !(await winOpen()) && h1 === '<p>Bonjour le monde entier</p><div data-color="purple" data-icon="bulb" class="callout" role="note"><p>Deuxième ligne</p></div>' && (await focusIn()) === 'editor', { h1, focus: await focusIn() });
  const zoom = await sheetZoom();
  const look = await page.evaluate(z => {
    const el = document.querySelector('.tiptap .callout');
    const cs = getComputedStyle(el), before = getComputedStyle(el, '::before'), r = el.getBoundingClientRect(), text = el.querySelector('p').getBoundingClientRect();
    return { bg: cs.backgroundColor, bar: cs.borderLeftColor, barW: el.clientLeft, icon: before.backgroundColor, mask: (before.maskImage || before.webkitMaskImage || '').slice(0, 12), inside: r.left >= 0 && r.right <= innerWidth + 0.5, textFromBar: Math.round((text.left - r.left) / z), ink: getComputedStyle(el.querySelector('p')).color };
  }, zoom);
  check(`${T}, insertion : dans le document, fond violet clair, barre violette de 4 px, icône violette, texte sombre à 44 px du bord (à l'échelle de la feuille), dans le panneau`, look.bg === 'rgb(250, 245, 255)' && look.bar === 'rgb(126, 34, 206)' && look.barW === 4 && look.icon === 'rgb(126, 34, 206)' && look.mask.startsWith('url("data:') && look.inside && Math.abs(look.textFromBar - 44) <= 1 && look.ink === 'rgb(27, 36, 48)', { look, zoom });
  await snap(`${T}-4-encadre`);

  // 4) Le clavier : flèches, Tab qui ne sort pas, Échap qui annule, Entrée qui valide.
  await caretAtEnd('Bonjour');
  await clickRow('#v2-btn-callout');
  check(`${T}, clavier : la fenêtre s'ouvre sur « Note », focus sur le choix`, (await winOpen()) && (await focusIn()) === 'type:note', await focusIn());
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const arrows = { type: await checkedOf('type'), focus: await focusIn(), preview: (await previewOf()).color };
  check(`${T}, clavier : deux flèches droite passent de « Note » à « Important » (rouge), le focus suit`, arrows.type === 'important' && arrows.focus === 'type:important' && arrows.preview === 'red', arrows);
  await page.keyboard.press('ArrowRight');
  const wrap = await checkedOf('type');
  await page.keyboard.press('Home');
  const home = await checkedOf('type');
  await page.keyboard.press('End');
  const end = await checkedOf('type');
  check(`${T}, clavier : la flèche droite revient au début (Note), Début et Fin vont aux extrémités`, wrap === 'note' && home === 'note' && end === 'important', { wrap, home, end });
  const trail = [];
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); trail.push(await focusIn()); }
  check(`${T}, clavier : Tab tourne dans la fenêtre (type, couleur, icône, boutons) sans en sortir`, trail.every(f => !f.startsWith('ailleurs') && f !== 'editor' && f !== 'rien') && new Set(trail).size >= 5, trail);
  await page.keyboard.press('Shift+Tab');
  check(`${T}, clavier : Maj+Tab revient en arrière dans la fenêtre`, !/^(ailleurs|editor|rien)/.test(await focusIn()), await focusIn());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const afterEsc = await written();
  const caretBack = await page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return s.$from.parent.textContent; });
  check(`${T}, clavier : Échap ferme sans toucher au document, le clavier revient dans l'éditeur au même endroit`, !(await winOpen()) && afterEsc === h1 && (await focusIn()) === 'editor' && caretBack === 'Bonjour le monde entier', { afterEsc, focus: await focusIn(), caretBack });
  await clickRow('#v2-btn-callout');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check(`${T}, clavier : « Attention » choisi aux flèches, Entrée valide : le paragraphe entre dans un encadré orange`, !(await winOpen()) && (await written()).startsWith('<div data-color="amber" data-icon="warning" class="callout" role="note"><p>Bonjour le monde entier</p></div>') && (await focusIn()) === 'editor', { h: await written(), focus: await focusIn() });

  // 5) Taper dans l'encadré : Entrée deux fois en sort.
  await setDoc('<p>Un texte</p>');
  await caretAtEnd('Un texte');
  await clickRow('#v2-btn-callout');
  await clickCenter(OK);
  await caretAtEnd('Un texte');
  await page.keyboard.type(' fin');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Suite');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Dehors');
  await page.waitForTimeout(150);
  check(`${T}, frappe : taper dans l'encadré, Entrée pour un nouveau paragraphe, deux fois Entrée pour en sortir`, (await written()) === '<div data-color="blue" data-icon="info" class="callout" role="note"><p>Un texte fin</p><p>Suite</p></div><p>Dehors</p>', await written());

  // 6) Modifier, retirer, annuler : la ligne du menu change quand le curseur est dans l'encadré.
  await setDoc('<p>Avant</p><div class="callout" data-color="green" data-icon="check"><p>Dans la note</p><p>Seconde ligne</p></div><p>Après</p>');
  const inside = await pointOf('Dans la note');
  await page.mouse.click(inside.x, inside.y);
  await page.waitForTimeout(150);
  await openMenu();
  const editLabel = (await rowLabels())[3];
  const editActive = await page.evaluate(() => document.getElementById('v2-btn-callout').classList.contains('is-active'));
  check(`${T}, modification : le curseur dans l'encadré, la ligne devient « Modifier l'encadré… » et s'allume`, editLabel === 'Modifier l’encadré…' && editActive, { editLabel, editActive });
  await snap(`${T}-5-menu-modifier`);
  await clickRow('#v2-btn-callout');
  const editTitle = await page.evaluate(() => document.getElementById('pp-callout-title').textContent);
  const removeBox = await hit(REMOVE), okEdit = await hit(OK), boxEdit = await hit(BOX);
  const prefill = [await checkedOf('swatch'), await checkedOf('icon-option'), await checkedOf('type')];
  check(`${T}, modification : la fenêtre s'ouvre « Modifier l'encadré », vert et coche cochés, « Retirer l'encadré » visible, tout dans le panneau`, editTitle === 'Modifier l’encadré' && prefill.join() === 'green,check,' && seen(removeBox) && seen(okEdit) && boxEdit.inPanel, { editTitle, prefill, removeBox, okEdit, boxEdit });
  await snap(`${T}-6-fenetre-modifier`);
  await clickCenter(choice('swatch', 'red'));
  await clickCenter(OK);
  check(`${T}, modification : un clic sur le rond rouge puis « Valider » recolore l'encadré sans toucher au texte`, (await written()) === '<p>Avant</p><div data-color="red" data-icon="check" class="callout" role="note"><p>Dans la note</p><p>Seconde ligne</p></div><p>Après</p>', await written());
  await clickRow('#v2-btn-callout');
  await clickCenter(REMOVE);
  const removed = await written();
  check(`${T}, retrait : « Retirer l'encadré » rend les deux paragraphes au document, le texte et le curseur gardés`, !(await winOpen()) && removed === '<p>Avant</p><p>Dans la note</p><p>Seconde ligne</p><p>Après</p>' && (await focusIn()) === 'editor', { removed });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(`${T}, retrait : un seul Ctrl+Z remet l'encadré (rouge, coche) avec ses deux paragraphes`, (await written()) === '<p>Avant</p><div data-color="red" data-icon="check" class="callout" role="note"><p>Dans la note</p><p>Seconde ligne</p></div><p>Après</p>', await written());

  // 7) Le bloc de signature par sa ligne du menu.
  await setDoc('<p>Avant</p><p>Texte du contrat</p><p>Après</p>');
  await caretAtEnd('Texte du contrat');
  await clickRow('#v2-btn-signature');
  const sigZoom = await sheetZoom();
  const sig = await page.evaluate(z => {
    const columns = Array.from(document.querySelectorAll('.tiptap .two-columns-column')).map(c => Array.from(c.children).map(p => p.textContent));
    const lines = Array.from(document.querySelectorAll('.tiptap .two-columns-column > p')).filter(p => /^_+$/.test(p.textContent)).map(p => ({ h: Math.round(p.getBoundingClientRect().height / z), w: Math.round(p.getBoundingClientRect().width / z), scrollW: p.scrollWidth }));
    const captionEl = Array.from(document.querySelectorAll('.tiptap .two-columns-column:first-child > p')).pop();
    const r = captionEl.getBoundingClientRect();
    return { columns, lines, caption: { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }, panel: [innerWidth, innerHeight] };
  }, sigZoom);
  const lineChars = '_'.repeat(30);
  check(`${T}, signature : un clic sur « Bloc de signature » pose deux colonnes - trois lignes vides, la ligne, puis « Nom et signature » et « Date »`, JSON.stringify(sig.columns) === JSON.stringify([['', '', '', lineChars, 'Nom et signature'], ['', '', '', lineChars, 'Date']]) && (await focusIn()) === 'editor', { columns: sig.columns, focus: await focusIn() });
  check(`${T}, signature : chaque ligne de tirets bas tient sur une seule ligne dans sa colonne (à ${WIDTH} px), et la légende est dans le panneau`, sig.lines.length === 2 && sig.lines.every(l => l.h < 30 && l.scrollW <= l.w + 1) && sig.caption.l >= 0 && sig.caption.r <= WIDTH && sig.caption.b <= HEIGHT, { sig, sigZoom });
  await page.keyboard.type(' du client');
  await page.waitForTimeout(100);
  check(`${T}, signature : le clavier est dans la légende de gauche - on y tape « du client »`, (await html()).includes('<p>Nom et signature du client</p>') && (await html()).includes('<p>Date</p>'), (await html()).slice(0, 600));
  await snap(`${T}-7-signature`);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  check(`${T}, signature : Ctrl+Z annule la frappe puis retire tout le bloc`, !(await html()).includes('two-columns-zone'), (await html()).slice(0, 300));
}

async function runEnglish() {
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await setDoc('<p>Hello big world</p>');
  await caretAtEnd('Hello');
  await openMenu();
  const labels = await rowLabels();
  const flyoutTitle = await page.evaluate(() => document.querySelector('#v2-blocks-flyout .v2-hover-flyout-label').textContent);
  check('anglais, menu : « Link… Ctrl+K », « Quote », « Code block », « Callout… », « Signature block », « QR code… », « Chart from the page… », titre « Link and content blocks »', labels.length === 7 && /^Link…\s*Ctrl\+K$/.test(labels[0]) && labels[1] === 'Quote' && labels[2] === 'Code block' && labels[3] === 'Callout…' && labels[4] === 'Signature block' && labels[5] === 'QR code…' && labels[6] === 'Chart from the page…' && flyoutTitle === 'Link and content blocks', { labels, flyoutTitle });
  await snap('en-1-menu');
  await clickRow('#v2-btn-callout');
  const en = await page.evaluate(() => {
    const names = kind => Array.from(document.querySelectorAll('#pp-callout-modal .pp-callout-' + kind)).map(b => b.getAttribute('aria-label') || b.textContent.trim());
    return {
      title: document.getElementById('pp-callout-title').textContent,
      labels: ['type', 'color', 'icon'].map(k => document.getElementById('pp-callout-' + k + '-label').textContent),
      types: names('type'), colors: names('swatch'), sample: document.querySelector('#pp-callout-modal .pp-callout-paper .callout').textContent,
      buttons: Array.from(document.querySelectorAll('#pp-callout-modal .var-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent),
    };
  });
  const okBox = await hit(OK), boxEn = await hit(BOX), cancelBox = await hit(CANCEL);
  const scrollEn = await page.evaluate(() => { const b = document.querySelector('#pp-callout-modal .pp-modal-body, #pp-callout-modal .modal-body') || document.querySelector('#pp-callout-modal .modal-content'); return b.scrollHeight <= b.clientHeight + 1; });
  check('anglais, fenêtre : titre, libellés, types, couleurs, aperçu et boutons en anglais, dans le panneau, sans défiler', en.title === 'Insert a callout' && en.labels.join() === 'Type,Color,Icon' && en.types.join() === 'Note,Warning,Important' && en.colors.join() === 'Blue,Green,Orange,Red,Purple,Gray' && en.sample === 'Your text will appear here.' && en.buttons.join() === 'Cancel,Insert' && seen(okBox) && seen(cancelBox) && boxEn.inPanel && scrollEn, { en, okBox, boxEn, scrollEn });
  await snap('en-2-fenetre');
  await clickCenter(OK);
  await clickRow('#v2-btn-signature');
  check('anglais, signature : les légendes sont « Name and signature » et « Date »', (await html()).includes('<p>Name and signature</p>') && (await html()).includes('<p>Date</p>'), (await html()).slice(0, 400));
  await openMenu();
  await page.mouse.move(WIDTH - 30, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(250);
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(250);
  await closeWindowWithEscape();
}

await run('light');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(200);
await run('dark');
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucun avertissement de ProseMirror (sélection invalide, contenu refusé) pendant le parcours', consoleProblems.length === 0, consoleProblems);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
