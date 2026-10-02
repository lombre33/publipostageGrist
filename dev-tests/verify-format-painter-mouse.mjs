#!/usr/bin/env node
// Pinceau de mise en forme (js/format-painter.js, css/format-painter.css, bouton #v2-btn-format-painter) : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au vrai
// clavier (page.keyboard), en clair, en sombre et en anglais. Ce que dev-tests/scenarios-format-painter.js ne peut pas voir depuis la page : une sélection posée par programme ne dit pas
// si ProseMirror a suivi la souris au relâchement (double-clic sur un mot, glissé, triple-clic sur un paragraphe, cases d'un tableau).
//  - le bouton : sur la 2e rangée, collé au surlignage comme le sont les boutons voisins, de la taille des autres (icône comprise), sans faire passer la barre à une 3e rangée ; icône lisible
//    au repos (≥ 4,5:1) et armé (≥ 3:1, comme tout bouton enfoncé de la barre) ; l'infobulle entière dans la fenêtre avec sa touche ;
//  - un double-clic sur un mot de la source, un clic sur le pinceau, puis un double-clic sur un mot de la cible : le mot prend gras, italique, souligné, barré, police, taille, couleur
//    et surlignage ; le pinceau se range (bouton relâché, curseur de texte), le clavier est dans le document, la sélection reste ;
//  - un glissé sur plusieurs mots, un triple-clic sur un paragraphe (le titre 2 centré d'un curseur, dont le paragraphe passe titre), les cases d'un tableau glissées ;
//  - un simple clic sans sélection ne peint rien et laisse le pinceau armé, Échap l'arrête ; un double-clic sur le bouton le garde armé (liseré, curseur) pour plusieurs mots, un clic
//    sur le bouton l'arrête ;
//  - au clavier : Alt+Maj+C puis Alt+Maj+V sur une sélection faite aux flèches ;
//  - en Lecture le bouton est grisé et ne fait rien ; en anglais, « Format painter (Alt+Shift+C) ».
// Lancé par run-headless.mjs (groupe Node "formatPainterMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-format-painter-mouse.mjs
// FORMAT_PAINTER_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.FORMAT_PAINTER_PORT || 8950);
const SHOTS = process.env.FORMAT_PAINTER_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-shortcuts-keyboard.mjs.
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
if (!OFFLINE) console.log('[verify-format-painter-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });

const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const html = () => page.evaluate(() => Editor.getHTML());
async function setDoc(doc) {
  await page.evaluate(d => { FormatPainter.disarm(); Editor.setHTML(d); }, doc);
  await page.waitForTimeout(250);
}

// Le rectangle du texte `needle` (la première occurrence dans le document, ou la `nth`), la page défilée pour qu'il soit au milieu de la zone visible.
const boxOf = (needle, nth = 0) => page.evaluate(({ needle, nth }) => {
  const root = document.querySelector('.tiptap');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node;
  while ((node = walker.nextNode())) {
    const at = node.textContent.indexOf(needle);
    if (at === -1) continue;
    if (seen++ < nth) continue;
    node.parentElement.scrollIntoView({ block: 'center' });
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + needle.length);
    const r = range.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
  }
  return null;
}, { needle, nth });
const selected = () => page.evaluate(() => { const s = EditorCore.getEditor().state; return s.doc.textBetween(s.selection.from, s.selection.to, '|'); });
// La mise en forme visible d'un mot : les balises de mise en forme au-dessus de lui (jusqu'à son bloc), les styles résolus de son élément le plus proche, et le fond qu'on voit derrière lui (le
// surlignage est posé sur la balise la plus extérieure : le fond ne s'hérite pas, on remonte jusqu'au premier fond non transparent).
const formatOf = needle => page.evaluate(needle => {
  const root = document.querySelector('.tiptap');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.indexOf(needle) === -1) continue;
    const tags = [];
    let el = node.parentElement;
    const near = el;
    let background = 'rgba(0, 0, 0, 0)';
    while (el && el !== root && !/^(P|H[1-6]|LI|TD|TH)$/.test(el.tagName)) {
      tags.push(el.tagName.toLowerCase());
      const own = getComputedStyle(el).backgroundColor;
      if (background === 'rgba(0, 0, 0, 0)' && own !== 'rgba(0, 0, 0, 0)') background = own;
      el = el.parentElement;
    }
    const cs = getComputedStyle(near);
    return { tags: tags.sort().join(','), color: cs.color, background, size: cs.fontSize, family: cs.fontFamily, weight: cs.fontWeight, style: cs.fontStyle };
  }
  return null;
}, needle);
// Le bloc (paragraphe ou titre) dont le texte contient `needle` : sa balise et son alignement. Le texte d'un bloc peint est coupé en morceaux : on le cherche par son texte entier.
const blockOf = needle => page.evaluate(needle => {
  const root = document.querySelector('.tiptap');
  const block = Array.from(root.querySelectorAll('p, h1, h2, h3, h4, h5, h6')).find(el => el.textContent.indexOf(needle) !== -1);
  return block ? { tag: block.tagName.toLowerCase(), align: getComputedStyle(block).textAlign } : null;
}, needle);
const painter = () => page.evaluate(() => {
  const b = document.getElementById('v2-btn-format-painter');
  const p = document.querySelector('.tiptap p, .tiptap h2');
  return { armed: FormatPainter.isArmed(), sticky: FormatPainter.isSticky(), pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active'), stickyAttr: b.getAttribute('data-sticky'),
    rootClass: document.documentElement.classList.contains('pp-format-painting'), cursor: p ? getComputedStyle(p).cursor.slice(0, 12) : '', focusInDoc: !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('.tiptap') };
});
const READY = { armed: false, sticky: false, pressed: 'false', active: false, stickyAttr: null, rootClass: false };
const ARMED = { armed: true, sticky: false, pressed: 'true', active: true, stickyAttr: null, rootClass: true };
const STICKY = { armed: true, sticky: true, pressed: 'true', active: true, stickyAttr: 'true', rootClass: true };
const sameState = (state, want) => Object.keys(want).every(k => state[k] === want[k]);
const isBrush = state => /^url\(/.test(state.cursor);
const overlay = () => page.evaluate(() => { const o = document.querySelector('.tiptap'); return o ? o.getBoundingClientRect().top : 0; });
const clickAt = async (box, extra) => { await page.mouse.click(box.cx, box.cy, extra); await page.waitForTimeout(160); };
const pressTimes = async (key, times) => { for (let i = 0; i < times; i++) { await page.keyboard.press(key); await page.waitForTimeout(50); } };
// Un vrai triple-clic : trois appuis de suite (clickCount 1, 2, 3) - le deuxième sélectionne le mot, le troisième le paragraphe ; `mouse.click({ clickCount: 3 })` n'en envoie qu'un seul, déjà le troisième.
const tripleClick = async box => {
  await page.mouse.move(box.cx, box.cy);
  for (const clickCount of [1, 2, 3]) { await page.mouse.down({ clickCount }); await page.mouse.up({ clickCount }); await page.waitForTimeout(40); }
  await page.waitForTimeout(240);
};
const clickButton = async () => { await page.click('#v2-btn-format-painter', { timeout: 5000 }); await page.waitForTimeout(160); };

// Le contraste WCAG de l'icône du bouton sur son fond, composé sur les fonds parents.
const iconContrast = () => page.evaluate(() => {
  const parse = value => { const m = /rgba?\(([^)]+)\)/.exec(value); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const b = document.getElementById('v2-btn-format-painter');
  const layers = [];
  for (let el = b; el; el = el.parentElement) { const c = parse(getComputedStyle(el).backgroundColor); if (c && c.a > 0) layers.push(c); if (c && c.a === 1) break; }
  let bg = { r: 255, g: 255, b: 255, a: 1 };
  layers.reverse().forEach(layer => { bg = over(layer, bg); });
  const fg = parse(getComputedStyle(b).color);
  const fgc = over(fg, bg);
  const l1 = lum(fgc), l2 = lum(bg);
  return Math.round((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) * 100) / 100;
});
const tipOf = id => page.evaluate(id => {
  const host = document.getElementById(id);
  const r = host.getBoundingClientRect();
  const cs = getComputedStyle(host, '::after');
  const w = parseFloat(cs.width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const left = r.left + host.clientLeft + parseFloat(cs.left) - w / 2;
  return { content: cs.content.replace(/^"|"$/g, ''), opacity: Number(cs.opacity), left: Math.round(left * 10) / 10, right: Math.round((left + w) * 10) / 10 };
}, id);
async function hover(id) {
  const point = await page.evaluate(id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(id => Number(getComputedStyle(document.getElementById(id), '::after').opacity) === 1, id, { timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(60);
}

const STYLED = '<strong><em><u><s><span style="color: #c0392b; background-color: #fff3a3; font-size: 14pt; font-family: Georgia">Source</span></s></u></em></strong>';
const DOC = '<p>' + STYLED + ' et du texte ordinaire plus bas.</p>'
  + '<h2 style="text-align: center">Titre modèle</h2>'
  + '<p>Un paragraphe cible tout simple.</p><p>Zéro autre paragraphe cible ici.</p><p>Troisième cible pour le triple-clic.</p>'
  + '<p>Mot un, mot deux, mot trois.</p>'
  + '<table><tbody><tr><td><p>unième</p></td><td><p>deuxième</p></td></tr><tr><td><p>troisième</p></td><td><p>quatrième</p></td></tr></tbody></table>';
const isPainted = f => !!f && f.tags.split(',').filter(t => ['strong', 'em', 'u', 's', 'span'].includes(t)).length === 5
  && f.color === 'rgb(192, 57, 43)' && f.background === 'rgb(255, 243, 163)' && Math.abs(parseFloat(f.size) - 14 * 96 / 72) < 0.1 && /Georgia/.test(f.family) && Number(f.weight) >= 600 && f.style === 'italic';
const isPlain = f => !!f && f.tags === '' && Number(f.weight) < 600 && f.style === 'normal';

// === Le bouton ============================================================================================================================================
async function buttonPart(T) {
  await setDoc(DOC);
  const geometry = await page.evaluate(() => {
    const b = document.getElementById('v2-btn-format-painter');
    const r = b.getBoundingClientRect();
    const bar = document.getElementById('v2-toolbar');
    const items = Array.from(bar.children).filter(el => el.getBoundingClientRect().height > 0);
    const rows = Array.from(new Set(items.map(el => Math.round(el.getBoundingClientRect().top / 10)))).length;
    const last = items[items.length - 1].getBoundingClientRect();
    const hl = document.getElementById('v2-highlight-split').getBoundingClientRect();
    const undo = document.getElementById('v2-btn-undo').getBoundingClientRect();
    const redo = document.getElementById('v2-btn-redo').getBoundingClientRect();
    const table = document.getElementById('v2-btn-table').getBoundingClientRect();
    const icon = b.querySelector('svg').getBoundingClientRect();
    const tableIcon = document.getElementById('v2-btn-table').querySelector('svg').getBoundingClientRect();
    return { w: r.width, h: r.height, tableW: table.width, tableH: table.height, tableIconW: tableIcon.width, gap: Math.round((r.left - hl.right) * 10) / 10, neighbourGap: Math.round((redo.left - undo.right) * 10) / 10,
      sameRow: Math.abs(r.top - hl.top) < 2, rows, lastRight: Math.round(last.right), iconW: icon.width, afterHighlight: b.previousElementSibling.id, visible: r.width > 0 && r.right <= 700 };
  });
  check(`${T} : le bouton du pinceau suit le surlignage, sur sa rangée, de la taille des autres boutons`, geometry.afterHighlight === 'v2-highlight-split' && geometry.sameRow && geometry.w === geometry.tableW && geometry.h === geometry.tableH && geometry.visible, geometry);
  check(`${T} : collé au surlignage comme le sont les boutons voisins (Annuler et Rétablir), icône de la taille des autres`, geometry.gap === geometry.neighbourGap && geometry.iconW === geometry.tableIconW && geometry.iconW > 0, geometry);
  check(`${T} : la barre garde ses deux rangées à 700 px et rien ne déborde à droite`, geometry.rows === 2 && geometry.lastRight <= WIDTH - 8, geometry);
  const restContrast = await iconContrast();
  check(`${T} : l'icône au repos fait 4,5:1 au moins sur son fond (${restContrast})`, restContrast >= 4.5, restContrast);
  await hover('v2-btn-format-painter');
  const tip = await tipOf('v2-btn-format-painter');
  check(`${T} : l'infobulle « Reproduire la mise en forme (Alt+Maj+C) » est entière dans la fenêtre`, tip.content === 'Reproduire la mise en forme (Alt+Maj+C)' && tip.opacity === 1 && tip.left >= 0 && tip.right <= WIDTH, tip);
  await page.mouse.move(400, 300);
  await snap(`${T}-bouton`);
}

// === Un mot, un glissé, un triple-clic, un tableau ===========================================================================================================
async function paintingPart(T) {
  await setDoc(DOC);
  // 1) double-clic sur le mot source, clic sur le pinceau, double-clic sur un mot de la cible
  let box = await boxOf('Source');
  await page.mouse.dblclick(box.cx, box.cy);
  await page.waitForTimeout(160);
  check(`${T} : le double-clic sélectionne « Source »`, (await selected()) === 'Source', await selected());
  await clickButton();
  let state = await painter();
  check(`${T} : un clic sur le pinceau l'arme (bouton enfoncé, aria-pressed, curseur du pinceau sur le texte)`, sameState(state, ARMED) && isBrush(state), state);
  const armedContrast = await iconContrast();
  check(`${T} : l'icône armée fait 3:1 au moins sur son fond, comme tout bouton enfoncé de la barre (${armedContrast})`, armedContrast >= 3, armedContrast);
  await snap(`${T}-arme`);
  box = await boxOf('simple');
  await page.mouse.dblclick(box.cx, box.cy);
  await page.waitForTimeout(220);
  let f = await formatOf('simple');
  check(`${T} : un double-clic sur « simple » le peint : gras, italique, souligné, barré, Georgia 14 pt, rouge sur jaune`, isPainted(f), f);
  state = await painter();
  check(`${T} : le pinceau s'est rangé (bouton relâché, curseur de texte), le clavier est dans le document`, sameState(state, READY) && !isBrush(state) && state.focusInDoc, state);
  check(`${T} : la sélection reste sur le mot peint`, (await selected()) === 'simple', await selected());
  f = await formatOf('Un paragraphe cible');
  check(`${T} : le reste du paragraphe n'a pas bougé`, isPlain(f), f);
  // dans la foulée du double-clic qui vient de peindre le mot, un triple-clic AILLEURS ne peint rien : le pinceau s'est rangé
  const beforeElsewhere = await html();
  await tripleClick(await boxOf('Troisième cible'));
  check(`${T} : un triple-clic ailleurs, juste après, ne peint rien (le pinceau est rangé)`, (await html()) === beforeElsewhere && (await blockOf('Troisième cible')).tag === 'p', await blockOf('Troisième cible'));

  // 2) un glissé sur plusieurs mots, pinceau armé de nouveau (source : le mot qu'on a peint, sélectionné de nouveau)
  await page.mouse.dblclick((await boxOf('simple')).cx, (await boxOf('simple')).cy);
  await page.waitForTimeout(160);
  await clickButton();
  const startBox = await boxOf('autre');
  const end = await boxOf('ici');
  await page.mouse.move(startBox.left + 1, startBox.cy);
  await page.mouse.down();
  await page.mouse.move(end.right - 0.5, end.cy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(220);
  const dragged = await selected();
  f = await formatOf('autre');
  const f2 = await formatOf('ici');
  const f3 = await formatOf('Zéro');
  check(`${T} : un glissé sur « ${dragged} » le peint en entier (pas le « Zéro » qui précède) et range le pinceau`, /^autre.*ici$/.test(dragged) && isPainted(f) && isPainted(f2) && isPlain(f3) && sameState(await painter(), READY), { dragged, f, f2, f3 });
  await snap(`${T}-glisse`);

  // 3) le curseur dans le titre 2 centré, puis un triple-clic sur un paragraphe : il devient titre 2 centré
  box = await boxOf('Titre');
  await clickAt(box);
  await clickButton();
  state = await painter();
  check(`${T} : un curseur dans le titre arme le pinceau`, sameState(state, ARMED), state);
  box = await boxOf('Troisième cible');
  await tripleClick(box);
  let block = await blockOf('Troisième cible');
  check(`${T} : un vrai triple-clic (le double-clic peint déjà le mot) sur « Troisième cible… » en fait un titre 2 centré, le titre copié`, block && block.tag === 'h2' && block.align === 'center' && sameState(await painter(), READY), block);
  block = await blockOf('Zéro autre paragraphe');
  check(`${T} : le paragraphe d'à côté ne bouge pas`, block && block.tag === 'p', block);

  // 4) un simple clic sans sélection ne peint rien et laisse le pinceau armé ; Échap l'arrête
  box = await boxOf('Source');
  await page.mouse.dblclick(box.cx, box.cy);
  await page.waitForTimeout(120);
  await clickButton();
  const before = await html();
  box = await boxOf('trois.');
  await clickAt(box);
  state = await painter();
  check(`${T} : un simple clic dans le texte ne peint rien et le pinceau reste armé`, (await html()) === before && sameState(state, ARMED) && isBrush(state), state);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  state = await painter();
  check(`${T} : Échap arrête le pinceau (curseur de texte)`, sameState(state, READY) && !isBrush(state), state);

  // 5) double-clic sur le bouton : il copie le mot sélectionné, reste armé pour plusieurs mots, un clic sur le bouton l'arrête
  box = await boxOf('Source');
  await page.mouse.dblclick(box.cx, box.cy);
  await page.waitForTimeout(120);
  await page.dblclick('#v2-btn-format-painter');
  await page.waitForTimeout(200);
  state = await painter();
  check(`${T} : un double-clic sur le pinceau le garde armé (liseré, curseur)`, sameState(state, STICKY) && isBrush(state), state);
  const ring = await page.evaluate(() => getComputedStyle(document.getElementById('v2-btn-format-painter')).boxShadow);
  check(`${T} : le liseré du pinceau durable se voit (box-shadow)`, ring && ring !== 'none', ring);
  await snap(`${T}-durable`);
  for (const word of ['Mot', 'deux,']) {
    box = await boxOf(word);
    await page.mouse.dblclick(box.cx, box.cy);
    await page.waitForTimeout(220);
  }
  const g1 = await formatOf('Mot');
  const g2 = await formatOf('deux');
  state = await painter();
  check(`${T} : deux mots peints à la suite, le pinceau durable reste armé`, isPainted(g1) && isPainted(g2) && sameState(state, STICKY), { g1, g2, state });
  await clickButton();
  state = await painter();
  check(`${T} : un clic sur le bouton arrête le pinceau durable`, sameState(state, READY) && !isBrush(state), state);

  // 6) les cases d'un tableau glissées
  await setDoc(DOC);
  box = await boxOf('Source');
  await page.mouse.dblclick(box.cx, box.cy);
  await page.waitForTimeout(120);
  await clickButton();
  const cellRects = () => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap td')).map(td => { const r = td.getBoundingClientRect(); return [r.left, r.top, r.width].map(Math.round).join(','); }).join(' | '));
  const a = await boxOf('unième');
  const b = await boxOf('deuxième');
  const cellsBefore = await cellRects();
  await page.mouse.move(a.cx, a.cy);
  await page.mouse.down();
  await page.mouse.move(b.cx, b.cy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(260);
  const t1 = await formatOf('unième');
  const t2 = await formatOf('deuxième');
  const t3 = await formatOf('troisième');
  check(`${T} : deux cases de tableau glissées sont peintes ensemble, la ligne du dessous non`, isPainted(t1) && isPainted(t2) && isPlain(t3) && sameState(await painter(), READY), { t1, t2, t3, selected: await selected(), cellSelection: await page.evaluate(() => !!EditorCore.getEditor().state.selection.$anchorCell), a, b, cellsBefore, cellsAfter: await cellRects() });
  await snap(`${T}-tableau`);
}

// === Au clavier ===========================================================================================================================================
async function keyboardPart(T) {
  await setDoc(DOC);
  let box = await boxOf('Source');
  await page.mouse.dblclick(box.cx, box.cy);
  await page.waitForTimeout(160);
  await page.keyboard.press('Alt+Shift+c');
  await page.waitForTimeout(160);
  let state = await painter();
  check(`${T} : Alt+Maj+C arme le pinceau comme le bouton`, sameState(state, ARMED), state);
  box = await boxOf('Mot un');
  await page.mouse.click(box.left + 1, box.cy);
  await page.keyboard.press('Home');
  await page.waitForTimeout(50);
  await pressTimes('Shift+ArrowRight', 3);
  await page.waitForTimeout(120);
  check(`${T} : la sélection faite aux flèches ne peint rien tant qu'on n'a pas demandé`, (await selected()) === 'Mot' && isPlain(await formatOf('Mot')), await selected());
  await page.keyboard.press('Alt+Shift+v');
  await page.waitForTimeout(200);
  state = await painter();
  check(`${T} : Alt+Maj+V peint la sélection du clavier et range le pinceau`, isPainted(await formatOf('Mot')) && sameState(state, READY) && state.focusInDoc, state);
  // sans pinceau armé, Alt+Maj+V repose la dernière copie sur une autre sélection
  await page.keyboard.press('End');
  await page.waitForTimeout(50);
  await pressTimes('Shift+ArrowLeft', 3);
  await page.keyboard.press('Alt+Shift+v');
  await page.waitForTimeout(200);
  const tail = await selected();
  check(`${T} : Alt+Maj+V sans pinceau armé repose la dernière copie sur la sélection (« ${tail} »)`, tail === 'is.' && isPainted(await formatOf('is.')) && sameState(await painter(), READY), { tail, state: await painter(), f: await formatOf('is.') });
}

// === Lecture et anglais ==================================================================================================================================
async function readingPart(T) {
  await setDoc(DOC);
  const box = await boxOf('Source');
  await page.mouse.dblclick(box.cx, box.cy);
  await page.waitForTimeout(120);
  await page.click('#btn-mode-read');
  await page.waitForTimeout(500);
  const grey = await page.evaluate(() => { const b = document.getElementById('v2-btn-format-painter'); return { locked: b.classList.contains('pp-access-locked'), opacity: Number(getComputedStyle(b).opacity), pointer: getComputedStyle(b).pointerEvents }; });
  check(`${T} : en Lecture le bouton est grisé, jamais retiré`, grey.locked && (grey.opacity < 1 || grey.pointer === 'none'), grey);
  await page.keyboard.press('Alt+Shift+c');
  await page.waitForTimeout(120);
  check(`${T} : en Lecture, Alt+Maj+C ne l'arme pas`, !(await painter()).armed, await painter());
  await page.click('#btn-mode-edit');
  await page.waitForTimeout(400);
  check(`${T} : de retour en Édition le bouton est libre et le pinceau au repos`, sameState(await painter(), READY), await painter());
}

async function englishPart() {
  const T = 'anglais';
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await setDoc(DOC);
  await hover('v2-btn-format-painter');
  const tip = await tipOf('v2-btn-format-painter');
  check(`${T} : l'infobulle dit « Format painter (Alt+Shift+C) », entière dans la fenêtre`, tip.content === 'Format painter (Alt+Shift+C)' && tip.opacity === 1 && tip.left >= 0 && tip.right <= WIDTH, tip);
  const aria = await page.evaluate(() => document.getElementById('v2-btn-format-painter').getAttribute('aria-label'));
  check(`${T} : le nom accessible est en anglais`, /^Format painter: copies the formatting/.test(aria), aria);
  await page.mouse.move(400, 300);
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(200);
}

async function run(T) {
  await buttonPart(T);
  await paintingPart(T);
  await keyboardPart(T);
  await readingPart(T);
}

await run('clair');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await run('sombre');
await page.evaluate(() => Settings.setTheme('light'));
await page.waitForTimeout(250);
await englishPart();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
