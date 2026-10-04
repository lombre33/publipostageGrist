#!/usr/bin/env node
// Barre flottante d'une variable Oui / Non (js/floating-toolbars.js, panneau « bool »), à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau Grist
// d'Antoine (~700x400), en clair, en sombre et en anglais : les scénarios de dev-tests/scenarios-var-bool.js tournent DANS la page (dispatchEvent), ils ne prouvent ni qu'un vrai
// clic atteint chacun des quatre boutons, ni que la barre tient dans un panneau bas, ni que la case de la Lecture se voit aux pixels.
//  - un clic sur une bulle Oui / Non ouvre la barre : panneau « Oui / Non » seul, quatre boutons (trois cases, « vrai / faux »), tous dans le panneau et au premier plan ;
//  - « vrai / faux » est enfoncé tant que rien n'est réglé ; un vrai clic sur chaque case règle la bulle (la barre reste ouverte), « vrai / faux » retire le réglage ;
//  - le bouton enfoncé se distingue des autres (fond) dans les deux thèmes ;
//  - en Lecture (vrai clic sur Mode lecture) la barre se ferme, les cases se VOIENT sur une vraie capture : bleu plein et coche blanche pour une case d'accent cochée, contour gris pour
//    une case décochée, contour sombre pour la case classique, sur la feuille blanche dans les deux thèmes ; la feuille ne déborde pas ;
//  - en anglais le bouton « true / false » et les infobulles tiennent dans la barre.
// Lancé par run-headless.mjs (groupe Node "varBoolMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-var-bool-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.VAR_BOOL_MOUSE_PORT || 8915);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-var-toolbar-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-var-bool-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const nativeDialogs = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
page.on('dialog', async d => { nativeDialogs.push(d.type() + ': ' + d.message()); await d.dismiss(); });
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

const TABLE = 'VbDossiers';
const BADGE = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
const DOC = `<p>Livré : ${BADGE('Actif')} · Payé : ${BADGE('Paye')}</p><p>Montant : ${BADGE('Montant')}</p>`;
// La ligne de la page : Actif vaut Oui, Paye vaut Non (ce que grist.onRecord livre : des booléens).
await page.evaluate(async ({ table }) => {
  const stub = window.__gristStub;
  stub.setVariables(table, { Nom: 'Text', Actif: 'Bool', Paye: 'Bool', Montant: 'Numeric' });
  stub.setRows(table, [{ id: 1, Nom: 'Dupont', Actif: true, Paye: false, Montant: 12 }]);
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Nom: 'Dupont', Actif: true, Paye: false, Montant: 12 }, table);
}, { table: TABLE });
await page.waitForTimeout(200);

// Centre d'un élément, entièrement dans le panneau ?, au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ?
async function hitTest(selector) {
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
// Vrai geste : la souris arrive à quelques pixels du centre puis le rejoint en trois pas (survol compris), puis clique. Le premier saut est direct : partie du coin de la page, la souris
// survolerait les menus de la barre d'outils en chemin et l'un d'eux s'ouvrirait par-dessus la bulle.
async function realClick(box) {
  await page.mouse.move(box.x - 12, box.y);
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(200);
}
const clickSel = async selector => { const b = await hitTest(selector); if (b.found) await realClick(b); return b; };

const BAR = '.v2-varfmt-toolbar.visible';
const BOOL_BUTTON = style => `${BAR} [data-var-panel="bool"] button[data-action="bool-style:${style}"]`;
const STYLES = ['accentStrike', 'classic', 'accentPlain', 'text'];
// Le réglage d'une bulle du document (null = aucun).
const formatOf = column => page.evaluate(col => { let found; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge' && n.attrs.column === col) found = n.attrs.format; }); return found === undefined ? 'absente' : found; }, column);
const barState = () => page.evaluate(() => {
  const bar = document.querySelector('.v2-varfmt-toolbar');
  const panels = ['bool', 'number', 'date'].map(k => !bar.querySelector(`[data-var-panel="${k}"]`).hidden);
  const buttons = Array.from(bar.querySelectorAll('[data-var-panel="bool"] button')).map(b => ({ style: b.getAttribute('data-action').slice(11), pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active'), bg: getComputedStyle(b).backgroundColor, label: b.textContent.trim(), title: b.title, fits: b.scrollWidth <= b.clientWidth + 1 }));
  const r = bar.getBoundingClientRect();
  return { visible: bar.classList.contains('visible'), panels, buttons, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
});

// Couleurs d'une vraie capture : combien de pixels bleus (accent), blancs, sombres et gris dans le rectangle.
async function pixelsOf(box) {
  const png = await page.screenshot({ clip: { x: Math.max(0, Math.floor(box.left) - 1), y: Math.max(0, Math.floor(box.top) - 1), width: Math.ceil(box.w) + 2, height: Math.ceil(box.h) + 2 } });
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const out = { blue: 0, white: 0, dark: 0, grey: 0, total: d.length / 4 };
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (Math.abs(r - 47) < 50 && Math.abs(g - 111) < 50 && Math.abs(b - 237) < 50) out.blue++;
      else if (r > 235 && g > 235 && b > 235) out.white++;
      else if (r < 100 && g < 100 && b < 100) out.dark++;
      else if (r > 90 && r < 160 && Math.abs(r - g) < 25 && Math.abs(g - b) < 40) out.grey++;
    }
    return out;
  }, png.toString('base64'));
}

async function run(theme) {
  const T = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Variable Oui / Non à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${T} ===`);
  await page.evaluate(doc => { Editor.setHTML(doc); }, DOC);
  await page.waitForTimeout(250);

  // 1) Un vrai clic sur la bulle : le panneau « Oui / Non » seul, quatre boutons atteignables dans le panneau.
  const badge = await clickSel('.tiptap .var-badge[data-column="Actif"]');
  check(`${T} - la bulle Oui / Non se trouve et se clique`, badge.found && badge.inViewport, badge);
  const opened = await barState();
  check(`${T} - clic sur la bulle : barre ouverte avec le seul panneau « Oui / Non », entière dans le panneau`, opened.visible && JSON.stringify(opened.panels) === JSON.stringify([true, false, false]) && opened.left >= 0 && opened.right <= WIDTH + 0.5 && opened.top >= 0 && opened.bottom <= HEIGHT + 0.5, opened);
  const reach = {};
  for (const style of STYLES) reach[style] = await hitTest(BOOL_BUTTON(style));
  check(`${T} - les quatre boutons sont dans le panneau, au premier plan et assez grands pour un vrai clic (au moins 24 px)`, STYLES.every(s => reach[s].found && reach[s].inViewport && reach[s].onTop && reach[s].w >= 24 && reach[s].h >= 24), reach);
  check(`${T} - « vrai / faux » est enfoncé tant que rien n'est réglé, les trois cases ne le sont pas`, JSON.stringify(opened.buttons.map(b => [b.style, b.pressed])) === JSON.stringify([['accentStrike', 'false'], ['classic', 'false'], ['accentPlain', 'false'], ['text', 'true']]), opened.buttons);
  const bgActive = opened.buttons.find(b => b.active).bg;
  const bgOthers = opened.buttons.filter(b => !b.active).map(b => b.bg);
  check(`${T} - le bouton enfoncé se distingue des autres par son fond`, bgOthers.every(bg => bg !== bgActive), { bgActive, bgOthers });

  // 2) Un vrai clic sur chaque case règle la bulle, la barre reste ouverte et montre le bouton enfoncé ; « vrai / faux » retire le réglage.
  for (const style of ['classic', 'accentStrike', 'accentPlain']) {
    await clickSel(BOOL_BUTTON(style));
    const after = await barState();
    const format = await formatOf('Actif');
    check(`${T} - vrai clic sur « ${style} » : la bulle porte { type: "bool", style: "${style}" }, la barre reste ouverte, ce bouton est le seul enfoncé`,
      JSON.stringify(format) === JSON.stringify({ type: 'bool', style }) && after.visible && JSON.stringify(after.buttons.map(b => b.pressed === 'true')) === JSON.stringify(STYLES.map(s => s === style)), { format, after: after.buttons.map(b => [b.style, b.pressed]), visible: after.visible });
  }
  await clickSel(BOOL_BUTTON('text'));
  const words = await barState();
  const wordsHtml = await page.evaluate(() => { const box = document.createElement('div'); box.innerHTML = Editor.getHTML(); const b = box.querySelector('span.var-badge[data-column="Actif"]'); return { hasFormat: !!b && b.hasAttribute('data-format') }; });
  check(`${T} - vrai clic sur « vrai / faux » : plus de réglage sur la bulle (ni dans le modèle enregistré), le bouton est enfoncé`, (await formatOf('Actif')) === null && !wordsHtml.hasFormat && words.buttons[3].pressed === 'true' && words.visible, { words: words.buttons.map(b => [b.style, b.pressed]), wordsHtml });

  // 3) Deux bulles réglées différemment : Actif en « accent, texte barré » (cochée), Paye en « classique » (décochée) ; puis la Lecture.
  await clickSel(BOOL_BUTTON('accentStrike'));
  const second = await clickSel('.tiptap .var-badge[data-column="Paye"]');
  check(`${T} - la deuxième bulle se clique (la barre suit la sélection)`, second.found && second.inViewport && (await barState()).visible, second);
  await clickSel(BOOL_BUTTON('classic'));
  check(`${T} - les deux bulles ont leur réglage`, JSON.stringify(await formatOf('Actif')) === JSON.stringify({ type: 'bool', style: 'accentStrike' }) && JSON.stringify(await formatOf('Paye')) === JSON.stringify({ type: 'bool', style: 'classic' }));
  // Un nombre garde sa barre : le panneau « Oui / Non » ne s'y ouvre pas.
  await clickSel('.tiptap .var-badge[data-column="Montant"]');
  const number = await barState();
  check(`${T} - une bulle nombre garde le panneau nombre, sans le panneau « Oui / Non »`, number.visible && JSON.stringify(number.panels) === JSON.stringify([false, true, false]), number.panels);

  const readButton = await clickSel('#btn-mode-read');
  await page.waitForTimeout(400);
  const read = await page.evaluate(() => {
    const reader = document.getElementById('reader-container');
    const bar = document.querySelector('.v2-varfmt-toolbar');
    const boxes = Array.from(reader.querySelectorAll('.resolved-checkbox'));
    if (boxes[0]) boxes[0].scrollIntoView({ block: 'center' });
    return { reader: getComputedStyle(reader).display, bar: bar.classList.contains('visible'), boxes: boxes.map(b => [b.getAttribute('data-checked'), b.getAttribute('data-checkbox-style')]), overflowX: reader.scrollWidth - reader.clientWidth, paper: getComputedStyle(reader.querySelector('.reader-content')).backgroundColor };
  });
  check(`${T} - vrai clic sur Mode lecture : la barre se ferme, deux cases (Actif coché en accent, Paye décoché en classique), la feuille ne déborde pas`,
    readButton.found && read.reader === 'block' && !read.bar && JSON.stringify(read.boxes) === JSON.stringify([['true', 'accentStrike'], ['false', 'classic']]) && read.overflowX <= 1, read);
  await page.waitForTimeout(150);
  const first = await hitTest('#reader-container .resolved-checkbox:nth-of-type(1)');
  const boxRects = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container .resolved-checkbox')).map(b => { const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 }; }));
  check(`${T} - en Lecture les deux cases sont carrées, entières dans le panneau`, boxRects.length === 2 && boxRects.every(b => b.inViewport && Math.abs(b.w - b.h) < 0.6 && b.w >= 9), boxRects);
  if (boxRects.length === 2) {
    const accent = await pixelsOf(boxRects[0]);
    const classic = await pixelsOf(boxRects[1]);
    check(`${T} - sur la capture, la case d'accent cochée est un carré bleu à coche blanche`, accent.blue >= 0.45 * accent.total && accent.white >= 5 && accent.dark === 0, accent);
    check(`${T} - sur la capture, la case classique décochée est un contour gris sur fond blanc, sans bleu`, classic.blue === 0 && classic.grey + classic.dark >= 18 && classic.white >= 0.4 * classic.total, classic);
  }
  void first;
  await clickSel('#btn-mode-edit');
  await page.waitForTimeout(300);
}

async function runEnglish() {
  console.log(`\n=== Variable Oui / Non en anglais, ${WIDTH}x${HEIGHT} ===`);
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await page.evaluate(doc => { Editor.setHTML(doc); }, DOC);
  await page.waitForTimeout(250);
  await clickSel('.tiptap .var-badge[data-column="Actif"]');
  const bar = await barState();
  const reach = {};
  for (const style of STYLES) reach[style] = await hitTest(BOOL_BUTTON(style));
  check('anglais - la barre « Oui / Non » tient dans le panneau, le bouton « true / false » aussi, sans être coupé', bar.visible && bar.left >= 0 && bar.right <= WIDTH + 0.5 && bar.buttons[3].label === 'true / false' && bar.buttons[3].fits && STYLES.every(s => reach[s].found && reach[s].inViewport && reach[s].onTop), { bar, reach });
  check('anglais - infobulles de la liste à cases et « Write true or false »', bar.buttons[1].title === 'Checkbox (classic)' && bar.buttons[2].title === 'Checkbox (accent, plain text)' && bar.buttons[3].title === 'Write true or false' && bar.buttons[0].title === 'Checkbox (accent, text struck through in a list)', bar.buttons.map(b => b.title));
  await clickSel(BOOL_BUTTON('classic'));
  check('anglais - un vrai clic sur la case classique règle la bulle', JSON.stringify(await formatOf('Actif')) === JSON.stringify({ type: 'bool', style: 'classic' }));
  await clickSel('#btn-mode-read');
  await page.waitForTimeout(400);
  const words = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container .reader-content p')).map(p => p.textContent));
  check('anglais - en Lecture, la case classique est écrite et la bulle sans réglage dit « false »', words[0].indexOf('☑') !== -1 && /Payé : false/.test(words[0]), words);
  await clickSel('#btn-mode-edit');
  await page.waitForTimeout(250);
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
