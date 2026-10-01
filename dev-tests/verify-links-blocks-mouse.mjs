#!/usr/bin/env node
// Lien, citation et bloc de code sous une seule icône (js/link-dialog.js, js/main-toolbar.js, css/link-dialog.css, css/editor-v2.css) : le panneau de 700x400 d'Antoine, à la
// VRAIE souris (page.mouse) et au VRAI clavier (frappe, Ctrl+K, Entrée, Échap, Tab), en clair et en sombre. Ce que scenarios-links-blocks.js ne peut pas voir depuis la page :
//  - le survol de l'icône ouvre le menu, ses trois lignes tiennent dans le panneau et sont au premier plan (aucun autre volet ne les recouvre) ;
//  - un clic sur la ligne « Lien… » ouvre la fenêtre ; elle tient dans 700x400, titre et boutons visibles, y compris avec le message d'erreur et le champ « texte à afficher » ;
//  - Ctrl+K au clavier ouvre la fenêtre (même sans passer par la barre), Entrée valide, Échap annule et rend le clavier à l'éditeur, Tab ne sort pas de la fenêtre ;
//  - un clic simple sur un lien n'ouvre rien, Ctrl+clic l'ouvre dans un nouvel onglet ; le survol montre l'info-bulle, dans le panneau ;
//  - le bloc de code et la citation par leurs lignes du menu ; une ligne grisée ne répond pas au clic ;
//  - l'interface en anglais.
// Lancé par run-headless.mjs (groupe Node "linksBlocksMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-links-blocks-mouse.mjs
// LINKS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.LINKS_MOUSE_PORT || 8894);
const SHOTS = process.env.LINKS_SHOTS || '';
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-links-blocks-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
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
// Les liens ouverts par Ctrl+clic partent vers exemple.fr : la requête de l'onglet est notée (et servie vide), jamais envoyée sur le réseau.
const opened = [];
await context.route('https://exemple.fr/**', route => { opened.push(route.request().url()); route.fulfill({ status: 200, contentType: 'text/html', body: '<p>ok</p>' }); });

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });

const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });

const MAIN = '#v2-btn-link';
const ROWS = ['#v2-row-link', '#v2-btn-citation', '#v2-btn-code-block'];
const WIN = '#pp-link-modal';

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
const winOpen = () => page.evaluate(() => { const m = document.getElementById('pp-link-modal'); return !!m && m.style.display !== 'none'; });
const html = () => page.evaluate(() => Editor.getHTML());
const focusIn = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.closest('.tiptap') ? 'editor' : (a.closest('#pp-link-modal') ? (a.id || a.tagName) : 'ailleurs : ' + (a.id || a.tagName))) : 'rien'; });
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
// Survol réel de l'icône du menu : la souris arrive depuis le bas du document (jamais par-dessus un autre volet de la barre).
async function openMenu() {
  const c = await centerOf(MAIN);
  await page.mouse.move(c.x, c.y + 150);
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(350);
  return c;
}
async function closeMenu() {
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(250);
}
// Une ligne du menu, à la vraie souris : le volet s'ouvre au survol de l'icône, puis la main descend de l'icône sur la ligne (verticalement, sans quitter le volet) et clique.
// Le trajet est celui d'une main qui vise l'intitulé de la ligne (à gauche) ; une diagonale vers le milieu d'une ligne large sort un instant de l'icône avant d'entrer dans le
// volet (coin de 4 px à droite de l'icône) - c'est le même comportement que les autres volets au survol de la barre, il n'est pas mesuré ici.
async function pressRow(selector, { click = true } = {}) {
  const c = await openMenu();
  const r = await centerOf(selector);
  const x = Math.min(Math.max(c.x, r.l + 8), r.r - 8);
  await page.mouse.move(x, r.y, { steps: 8 });
  await page.waitForTimeout(100);
  if (click) { await page.mouse.click(x, r.y); await page.waitForTimeout(300); }
  return { x, y: r.y };
}
const clickRow = selector => pressRow(selector);
async function closeWindowWithEscape() {
  if (await winOpen()) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
}

async function run(theme) {
  const T = theme;
  await setDoc('<p>Bonjour le monde entier</p><p>Deuxième ligne</p>');

  // 1) Le menu : un survol réel de l'icône ouvre le volet, ses trois lignes sont dans le panneau et au premier plan.
  const mainBox = await hit(MAIN);
  check(`${T}, menu : l'icône est visible dans le panneau ${WIDTH}x${HEIGHT} et sous la souris`, seen(mainBox), mainBox);
  await openMenu();
  const flyout = await hit('#v2-blocks-flyout');
  const rows = [];
  for (const sel of ROWS) rows.push(await hit(sel));
  check(`${T}, menu : au survol, le volet s'ouvre dans le panneau avec ses trois lignes au premier plan`, flyout.found && flyout.inPanel && rows.every(seen), { flyout, rows });
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row')).map(r => r.textContent.trim()));
  check(`${T}, menu : « Lien… » (avec son raccourci), « Citation » et « Bloc de code »`, labels.length === 3 && /^Lien…\s*Ctrl\+K$/.test(labels[0]) && labels[1] === 'Citation' && labels[2] === 'Bloc de code', labels);
  await snap(`${T}-1-menu`);
  await closeMenu();
  const closed = await page.evaluate(() => getComputedStyle(document.getElementById('v2-blocks-flyout')).display === 'none');
  check(`${T}, menu : la souris partie, le volet se referme`, closed);

  // 2) Fenêtre ouverte par la ligne « Lien… » sur un mot sélectionné à la souris (double-clic).
  const word = await pointOf('monde');
  await page.mouse.dblclick(word.x, word.y);
  await page.waitForTimeout(250);
  const selected = await page.evaluate(() => window.getSelection().toString());
  await clickRow('#v2-row-link');
  const opened1 = await winOpen();
  const box1 = await hit(`${WIN} .modal-content`);
  const title1 = await hit(`${WIN} h3`), input1 = await hit('#pp-link-url'), ok1 = await hit(`${WIN} .var-modal-primary`), cancel1 = await hit(`${WIN} .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)`);
  check(`${T}, fenêtre : un double-clic sélectionne « monde », un clic sur « Lien… » ouvre la fenêtre`, selected.trim() === 'monde' && opened1, { selected, opened1 });
  check(`${T}, fenêtre : elle tient dans ${WIDTH}x${HEIGHT}, titre, champ et boutons au premier plan`, box1.inPanel && seen(title1) && seen(input1) && seen(ok1) && seen(cancel1), { box1, title1, input1, ok1, cancel1 });
  check(`${T}, fenêtre : le focus est dans le champ adresse`, (await focusIn()) === 'pp-link-url', await focusIn());
  await snap(`${T}-2-fenetre`);

  // Erreur : l'adresse refusée s'affiche sous le champ sans déborder du panneau, boutons toujours visibles.
  await page.keyboard.type('javascript:alert(1)');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const err = await hit('#pp-link-error');
  const okErr = await hit(`${WIN} .var-modal-primary`), boxErr = await hit(`${WIN} .modal-content`);
  check(`${T}, fenêtre : adresse refusée - le message s'affiche sous le champ, la fenêtre reste ouverte dans le panneau avec ses boutons`, (await winOpen()) && seen(err) && seen(okErr) && boxErr.inPanel, { err, okErr, boxErr });
  check(`${T}, fenêtre : le document n'a pas changé`, !/<a[\s>]/.test(await html()), await html());
  await snap(`${T}-3-erreur`);

  // Frappe réelle d'une bonne adresse : Entrée valide, la fenêtre se ferme, le clavier revient dans l'éditeur.
  await page.keyboard.press('Control+a');
  await page.keyboard.type('exemple.fr');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const h1 = await html();
  check(`${T}, fenêtre : « exemple.fr » + Entrée pose le lien https://exemple.fr sur « monde », la fenêtre se ferme`, !(await winOpen()) && /<a [^>]*href="https:\/\/exemple\.fr"[^>]*>monde<\/a>/.test(h1), h1);
  check(`${T}, fenêtre : le clavier est revenu dans l'éditeur`, (await focusIn()) === 'editor', await focusIn());

  // 3) Ctrl+K au clavier : sur une sélection faite au clavier ; Échap annule, rend le clavier, la sélection est gardée ; Tab ne sort pas de la fenêtre.
  await setDoc('<p>Bonjour le monde entier</p><p>Deuxième ligne</p>');
  const endPoint = await pointOf('entier', 0.98);
  await page.mouse.click(endPoint.x, endPoint.y);
  await page.keyboard.press('End');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(250);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(250);
  check(`${T}, Ctrl+K : la fenêtre s'ouvre au clavier, focus dans le champ`, (await winOpen()) && (await focusIn()) === 'pp-link-url', { open: await winOpen(), focus: await focusIn() });
  const trail = [];
  for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); trail.push(await focusIn()); }
  check(`${T}, Ctrl+K : Tab tourne dans la fenêtre sans en sortir`, trail.every(f => !f.startsWith('ailleurs') && f !== 'editor'), trail);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const sel2 = await page.evaluate(() => window.getSelection().toString());
  check(`${T}, Ctrl+K : Échap ferme sans toucher au texte, le clavier revient dans l'éditeur, la sélection est gardée`, !(await winOpen()) && (await focusIn()) === 'editor' && sel2 === 'entier' && !/<a[\s>]/.test(await html()), { sel2, focus: await focusIn() });
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(200);
  await page.keyboard.type('nom@exemple.fr');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check(`${T}, Ctrl+K : une adresse e-mail devient un lien mailto:`, /<a [^>]*href="mailto:nom@exemple\.fr"[^>]*>entier<\/a>/.test(await html()), await html());

  // 4) Lien existant : un clic simple n'ouvre rien ; Ctrl+K le rouvre prérempli ; Ctrl+clic l'ouvre dans un onglet ; le survol montre l'info-bulle.
  await setDoc('<p>Voir <a href="https://exemple.fr/page">ce site</a> demain</p>');
  const link = await pointOf('ce site');
  const before = opened.length;
  await page.mouse.click(link.x, link.y);
  await page.waitForTimeout(500);
  check(`${T}, lien : un clic simple n'ouvre rien (aucun onglet, aucune fenêtre) et place le curseur`, opened.length === before && !(await winOpen()) && (await page.evaluate(() => EditorCore.getEditor().isActive('link'))), { opened: opened.slice(before) });
  await page.mouse.move(WIDTH / 2, HEIGHT - 15, { steps: 3 });
  await page.waitForTimeout(150);
  await page.mouse.move(link.x, link.y, { steps: 8 });
  await page.waitForTimeout(700);
  const tip = await hit('.pp-link-tip');
  const tipText = await page.evaluate(() => { const t = document.querySelector('.pp-link-tip'); return t && !t.hidden ? t.textContent : null; });
  check(`${T}, lien : le survol montre l'adresse et « Ctrl+clic pour ouvrir » dans une info-bulle, dans le panneau`, tip.found && tip.inPanel && /https:\/\/exemple\.fr\/page/.test(tipText || '') && /Ctrl\+clic pour ouvrir/.test(tipText || ''), { tip, tipText });
  await snap(`${T}-4-infobulle`);
  await page.mouse.move(WIDTH / 2, HEIGHT - 15, { steps: 3 });
  await page.waitForTimeout(250);
  check(`${T}, lien : l'info-bulle disparaît quand la souris s'éloigne`, (await page.evaluate(() => { const t = document.querySelector('.pp-link-tip'); return !t || t.hidden; })));
  await page.mouse.click(link.x, link.y);
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(250);
  const edit = await page.evaluate(() => ({ title: document.getElementById('pp-link-title').textContent, url: document.getElementById('pp-link-url').value, remove: !document.querySelector('#pp-link-modal .var-modal-danger').hidden }));
  const removeBox = await hit(`${WIN} .var-modal-danger`);
  check(`${T}, lien : Ctrl+K sur le lien rouvre la fenêtre « Modifier le lien » avec son adresse et « Retirer le lien » visible`, edit.title === 'Modifier le lien' && edit.url === 'https://exemple.fr/page' && edit.remove && seen(removeBox), { edit, removeBox });
  await snap(`${T}-5-modifier`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const link2 = await pointOf('ce site');
  const before2 = opened.length;
  await page.keyboard.down('Control');
  await page.mouse.click(link2.x, link2.y);
  await page.keyboard.up('Control');
  await page.waitForTimeout(700);
  check(`${T}, lien : Ctrl+clic ouvre l'adresse dans un nouvel onglet`, opened.length === before2 + 1 && /^https:\/\/exemple\.fr\/page/.test(opened[opened.length - 1] || ''), { opened: opened.slice(before2) });
  for (const p of context.pages()) if (p !== page) await p.close().catch(() => {});

  // 5) Sans sélection : le champ « texte à afficher » s'ajoute - c'est l'état le plus haut de la fenêtre, avec l'erreur affichée.
  await setDoc('<p>Début </p>');
  const endOfLine = await pointOf('Début', 1.5) || await pointOf('Début', 1);
  await page.mouse.click(endOfLine.x + 40, endOfLine.y);
  await page.keyboard.press('End');
  await clickRow('#v2-row-link');
  await page.keyboard.type('pas une adresse');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const tall = await page.evaluate(() => {
    const box = document.querySelector('#pp-link-modal .modal-content');
    const body = box.querySelector('.pp-modal-body, .modal-body') || box;
    const r = box.getBoundingClientRect();
    const textField = document.querySelector('#pp-link-modal .pp-link-text-field');
    const ok = document.querySelector('#pp-link-modal .var-modal-primary').getBoundingClientRect();
    return { box: [Math.round(r.top), Math.round(r.bottom)], textShown: !textField.hidden, okBottom: Math.round(ok.bottom), scrollable: body.scrollHeight > body.clientHeight + 1, bodyH: body.clientHeight };
  });
  check(`${T}, sans sélection : le champ « texte à afficher » est là et la fenêtre (avec l'erreur) tient dans ${HEIGHT} px, « Insérer » visible`, tall.textShown && tall.box[0] >= 0 && tall.box[1] <= HEIGHT && tall.okBottom <= HEIGHT, tall);
  await snap(`${T}-6-sans-selection`);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('exemple.fr');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Notre site');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check(`${T}, sans sélection : adresse + texte + Entrée insèrent le lien avec ce texte`, /Début\s*<a [^>]*href="https:\/\/exemple\.fr"[^>]*>Notre site<\/a>/.test(await html()), await html());

  // 6) Bloc de code et citation par les lignes du menu, à la vraie souris.
  await setDoc('<p>Ligne un</p><p>Ligne deux</p>');
  const p1 = await pointOf('Ligne un');
  await page.mouse.click(p1.x, p1.y);
  await page.waitForTimeout(150);
  await clickRow('#v2-btn-code-block');
  const h2 = await html();
  const pre = await page.evaluate(() => { const p = document.querySelector('.tiptap pre'); if (!p) return null; const cs = getComputedStyle(p); return { font: cs.fontFamily, bg: cs.backgroundColor, ws: cs.whiteSpace }; });
  check(`${T}, bloc de code : un clic sur la ligne convertit le paragraphe en <pre><code>, en chasse fixe sur fond gris`, /^<pre><code>Ligne un<\/code><\/pre>/.test(h2) && pre && /Cousine|Courier|monospace/.test(pre.font) && pre.bg === 'rgb(246, 248, 250)', { h2, pre });
  await openMenu();
  const activeRow = await page.evaluate(() => document.getElementById('v2-btn-code-block').classList.contains('is-active'));
  const linkLocked = await page.evaluate(() => document.getElementById('v2-row-link').classList.contains('v2-hf-locked'));
  const linkRow = await hit('#v2-row-link');
  check(`${T}, bloc de code : sa ligne est active, la ligne « Lien… » est grisée et ne reçoit pas la souris`, activeRow && linkLocked && !linkRow.onTop, { activeRow, linkLocked, linkRow });
  await snap(`${T}-7-menu-bloc-de-code`);
  const lockedAt = await pressRow('#v2-row-link');
  check(`${T}, bloc de code : un clic sur la ligne « Lien… » grisée n'ouvre rien`, !(await winOpen()), lockedAt);
  await pressRow('#v2-btn-code-block');
  check(`${T}, bloc de code : un second clic sur sa ligne redonne le paragraphe`, !/<pre>/.test(await html()), await html());
  await closeMenu();
  await clickRow('#v2-btn-citation');
  check(`${T}, citation : un clic sur la ligne met le paragraphe en citation (<blockquote>)`, /<blockquote><p>Ligne un<\/p><\/blockquote>/.test(await html()), await html());
  await closeMenu();
}

async function runEnglish() {
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await setDoc('<p>Hello big world</p>');
  const word = await pointOf('big');
  await page.mouse.dblclick(word.x, word.y);
  await page.waitForTimeout(200);
  await openMenu();
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row')).map(r => r.textContent.trim()));
  const flyoutTitle = await page.evaluate(() => document.querySelector('#v2-blocks-flyout .v2-hover-flyout-label').textContent);
  check('anglais, menu : « Link… Ctrl+K », « Quote », « Code block », titre « Link, quote, code block »', labels.length === 3 && /^Link…\s*Ctrl\+K$/.test(labels[0]) && labels[1] === 'Quote' && labels[2] === 'Code block' && flyoutTitle === 'Link, quote, code block', { labels, flyoutTitle });
  await snap('en-1-menu');
  await clickRow('#v2-row-link');
  await page.keyboard.type('nope nope');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const en = await page.evaluate(() => ({
    title: document.getElementById('pp-link-title').textContent,
    label: document.querySelector('#pp-link-modal label[for="pp-link-url"]').textContent,
    error: document.getElementById('pp-link-error').textContent,
    buttons: Array.from(document.querySelectorAll('#pp-link-modal .var-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent),
  }));
  const okBox = await hit(`${WIN} .var-modal-primary`), boxEn = await hit(`${WIN} .modal-content`), errBox = await hit('#pp-link-error');
  check('anglais, fenêtre : titre, libellé, erreur et boutons en anglais, dans le panneau', en.title === 'Insert a link' && en.label === 'Link address' && /not recognized/.test(en.error) && JSON.stringify(en.buttons) === '["Cancel","Insert"]' && seen(okBox) && boxEn.inPanel && seen(errBox), { en, okBox, boxEn, errBox });
  await snap('en-2-fenetre');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
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
