#!/usr/bin/env node
// Filigrane de la page (js/watermark-dialog.js, js/page-layer.js, js/orientation-toggle.js, css/watermark.css) : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au
// VRAI clavier (frappe, flèches, Tab, Entrée, Échap), en clair, en sombre et en anglais. Ce que scenarios-watermark.js ne peut pas voir depuis la page :
//  - le survol du bouton Page ouvre son menu ; la ligne « Filigrane… » est après un filet, sous les formats, dans le panneau et au premier plan ;
//  - un clic sur la ligne ouvre la fenêtre ; elle tient dans 700x400 sans défiler (titre, texte, sens, couleurs, opacité, feuille d'aperçu, boutons), le clavier est dans le champ ;
//  - la frappe, un clic sur une couleur, sur « Horizontal » et le curseur d'opacité changent la feuille d'aperçu, qui montre le MÊME dessin que la page ;
//  - « Valider » pose le filigrane sur chaque page de l'éditeur (au centre de la feuille, à la couleur et à l'angle choisis), « Annuler » et Échap ne touchent à rien, Entrée valide ;
//  - la ligne du menu dit le texte en cours ; la fenêtre rouverte montre les réglages posés ; « Retirer le filigrane » le retire ;
//  - la Lecture porte le même filigrane que l'éditeur ;
//  - l'interface en anglais.
// Lancé par run-headless.mjs (groupe Node "watermarkMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-watermark-mouse.mjs
// WATERMARK_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.WATERMARK_MOUSE_PORT || 8930);
const SHOTS = process.env.WATERMARK_SHOTS || '';
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-watermark-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|watermark/i.test(m.text())) consoleProblems.push(m.text()); });
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

const PAGE_BTN = '#btn-page-orientation';
const FLYOUT = '#v2-page-flyout';
const ROW = '#v2-btn-watermark';
const WIN = '#pp-watermark-modal';
const BOX = `${WIN} .modal-content`;
const OK = `${WIN} .var-modal-primary`;
const REMOVE = `${WIN} .var-modal-danger`;
const CANCEL = `${WIN} .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)`;
const TEXT = '#pp-watermark-text';
const RANGE = '#pp-watermark-opacity';
const swatch = key => `${WIN} .pp-watermark-swatch[data-color="${key}"]`;
const angleButton = value => `${WIN} .pp-watermark-choice[data-value="${value}"]`;

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
  return { found: true, w: Math.round(r.width), h: Math.round(r.height), inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
}, selector);
const seen = box => box.found && box.inPanel && box.onTop;
const winOpen = () => page.evaluate(() => { const m = document.getElementById('pp-watermark-modal'); return !!m && m.style.display !== 'none'; });
const noScroll = () => page.evaluate(() => { const b = document.querySelector('#pp-watermark-modal .pp-modal-body'); return { scrollH: b.scrollHeight, clientH: b.clientHeight, ok: b.scrollHeight <= b.clientHeight + 1 }; });
const focusIn = () => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'body';
  if (a.closest('.tiptap')) return 'editor';
  if (a.closest('#pp-watermark-modal')) return a.id || (a.dataset.color ? 'swatch:' + a.dataset.color : a.dataset.value ? 'choice:' + a.dataset.value : a.className || a.tagName);
  return a.id || a.tagName;
});
// Ce que la fenêtre montre : champ, sens et couleur cochés, curseur, pourcentage, et le dessin de la feuille d'aperçu.
const dialogState = () => page.evaluate(() => {
  const q = s => document.querySelector('#pp-watermark-modal ' + s);
  const color = q('.pp-watermark-swatch[aria-checked="true"]');
  const angle = q('.pp-watermark-choice[aria-checked="true"]');
  const wm = q('.pp-watermark-page .v2-page-watermark');
  const cs = wm ? getComputedStyle(wm) : null;
  const m = cs ? new DOMMatrix(cs.transform) : null;
  return {
    text: q('#pp-watermark-text').value, color: color ? color.dataset.color : null, angle: angle ? angle.dataset.value : null,
    range: Number(q('#pp-watermark-opacity').value), percent: q('.pp-watermark-percent').textContent,
    preview: wm ? { text: wm.textContent, color: cs.color, opacity: Number(cs.opacity), deg: Math.round(Math.atan2(m.b, m.a) * 1800 / Math.PI) / 10 } : null,
    removeShown: !q('.var-modal-danger').hidden,
  };
});
// Le filigrane sur les pages de l'éditeur ou de la Lecture : une ligne par feuille, avec l'écart entre le centre du texte (tourné autour de son centre) et celui de la feuille.
const layerState = scope => page.evaluate(sc => {
  const boxes = Array.from(document.querySelectorAll(sc + ' .v2-page-layer-page'));
  return boxes.map(b => {
    const el = b.querySelector('.v2-page-watermark');
    if (!el) return { has: false };
    const br = b.getBoundingClientRect(), er = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const m = new DOMMatrix(cs.transform);
    return {
      has: true, text: el.textContent, color: cs.color, opacity: Number(cs.opacity), deg: Math.round(Math.atan2(m.b, m.a) * 1800 / Math.PI) / 10,
      dx: Math.round((er.left + er.width / 2 - (br.left + br.width / 2)) * 10) / 10, dy: Math.round((er.top + er.height / 2 - (br.top + br.height / 2)) * 10) / 10,
    };
  });
}, scope);
const paintedSame = (layer, expected) => layer.length >= 1 && layer.every(p => p.has && p.text === expected.text && p.color === expected.color && Math.abs(p.opacity - expected.opacity) < 0.005 && p.deg === expected.deg && Math.abs(p.dx) <= 1 && Math.abs(p.dy) <= 1);
const menuRowState = () => page.evaluate(() => {
  const row = document.getElementById('v2-btn-watermark');
  return { name: row.querySelector('.v2-page-row-name').textContent, value: row.querySelector('.v2-page-row-size').textContent, disabled: row.getAttribute('aria-disabled'), role: row.getAttribute('role') };
});
const saved = () => page.evaluate(() => PageLayout.getWatermark());
const pageFocus = async () => { const p = await pointOf('Ligne 3'); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); };
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
async function clickCenter(selector) {
  const c = await centerOf(selector);
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(150);
}
// Survol réel du bouton Page : la souris arrive de côté, le volet s'ouvre sous elle.
async function openPageMenu() {
  const c = await centerOf(PAGE_BTN);
  await page.mouse.move(c.x - 14, c.y - 6, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(350);
  return c;
}
async function closePageMenu() {
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(250);
}
// Clic réel sur « Filigrane… » : le volet s'ouvre au survol du bouton, puis la main descend tout droit du bouton à la ligne (le volet reste ouvert) et clique.
async function clickWatermarkRow() {
  const c = await openPageMenu();
  const r = await centerOf(ROW);
  await page.mouse.move(c.x, r.y, { steps: 8 });
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await page.waitForTimeout(100);
  await page.mouse.click(r.x, r.y);
  await page.waitForTimeout(300);
}
async function closeWindowWithEscape() {
  if (await winOpen()) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
}
// Contraste (WCAG) du texte d'un élément contre le premier fond opaque qu'il traverse en remontant.
const contrastOf = selector => page.evaluate((sel) => {
  const nums = c => (c.match(/-?[\d.]+/g) || []).map(Number);
  const rgba = c => { const n = nums(c); return c.indexOf('color(') === 0 ? { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n.length > 3 ? n[3] : 1 } : { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const el = document.querySelector(sel);
  if (!el) return null;
  const fg = rgba(getComputedStyle(el).color);
  let node = el; let bg = { r: 255, g: 255, b: 255, a: 1 };
  while (node) { const c = rgba(getComputedStyle(node).backgroundColor); if (c.a > .99) { bg = c; break; } node = node.parentElement; }
  const a = lum(fg), b = lum(bg);
  return Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100;
}, selector);

const LONG_DOC = Array.from({ length: 80 }, (_, i) => `<p>Ligne ${i} du document de test de pagination.</p>`).join('');
async function setDoc() {
  await page.evaluate(d => { Editor.setHTML(d); }, LONG_DOC);
  await page.waitForTimeout(500);
}
// Aperçu A4 allumé par un vrai clic (sans lui, l'éditeur n'est pas paginé : pas de page, pas de filigrane).
async function ensureA4Preview() {
  const on = await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview'));
  if (!on) await clickCenter('#v2-a4-toggle');
  await page.waitForTimeout(600);
}

const RED = 'rgb(198, 40, 40)';
const BLUE = 'rgb(21, 101, 192)';
const GRAY = 'rgb(128, 128, 128)';
// Part du texte occupée en largeur par le filigrane horizontal : la feuille d'aperçu de la fenêtre et la page de l'éditeur doivent donner la même proportion.
const widthShare = (scope, box) => page.evaluate(({ scope, box }) => {
  const b = document.querySelector(scope + ' ' + box);
  const el = b && b.querySelector('.v2-page-watermark');
  if (!el) return null;
  return Math.round(el.getBoundingClientRect().width / b.getBoundingClientRect().width * 1000) / 1000;
}, { scope, box });

// Preuve aux pixels que le texte du document reste AU-DESSUS du filigrane : un filigrane rouge plein au milieu de la première page, la feuille défilée jusqu'à lui, et dans la zone
// où une ligne de texte croise le filigrane, des pixels sombres (les lettres) ET des pixels rouges (le filigrane autour) - si le texte passait dessous, ses lettres seraient rouges.
async function textStaysOnTop(T) {
  await page.evaluate(() => PageLayout.setWatermark({ text: 'CONFIDENTIEL', angle: 'horizontal', color: '#c62828', opacity: 1 }));
  await page.waitForTimeout(400);
  const zone = await page.evaluate(() => {
    const ec = document.getElementById('editor-container');
    const wm = ec.querySelector('.v2-page-watermark');
    const first = wm.getBoundingClientRect();
    ec.scrollTop += first.top + first.height / 2 - 280;
    const w = wm.getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll('.tiptap p')).map(p => p.getBoundingClientRect());
    const crossing = rows.find(r => r.top >= w.top + w.height * 0.25 && r.bottom <= w.bottom - w.height * 0.25 && r.right > w.left + 20 && r.left < w.right && r.top > 160 && r.bottom < innerHeight - 4);
    if (!crossing) return null;
    const x0 = Math.max(crossing.left, w.left), x1 = Math.min(crossing.right, w.right);
    return { x: Math.floor(x0), y: Math.floor(crossing.top), width: Math.floor(x1 - x0), height: Math.ceil(crossing.height) };
  });
  let counts = null;
  if (zone && zone.width > 8 && zone.height > 4) {
    const png = await page.screenshot({ clip: zone });
    counts = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let dark = 0, red = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 90) dark++;
        else if (d[i] > 150 && d[i + 1] < 90 && d[i + 2] < 90) red++;
      }
      return { dark, red, w: c.width, h: c.height };
    }, png.toString('base64'));
  }
  check(`${T}, dessus : sur un filigrane rouge plein, les lettres du document restent sombres et le filigrane se voit autour (${counts ? counts.dark + ' pixels sombres, ' + counts.red + ' rouges' : 'aucune ligne de texte ne le croise'})`, !!counts && counts.dark >= 15 && counts.red >= 15, { zone, counts });
  await snap(`${T}-5b-texte-sur-filigrane`);
  await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; PageLayout.setWatermark({ text: 'CONFIDENTIEL', angle: 'horizontal', color: '#c62828', opacity: 0.5 }); });
  await page.waitForTimeout(300);
}

async function run(theme) {
  const T = theme;
  await ensureA4Preview();
  await setDoc();
  await pageFocus();

  // 1) Le menu Page : un survol réel du bouton l'ouvre ; « Filigrane… » est la dernière ligne, après un filet, dans le panneau et au premier plan.
  await openPageMenu();
  const flyout = await hit(FLYOUT), row = await hit(ROW);
  const menu = await page.evaluate(() => {
    const kids = Array.from(document.querySelectorAll('#v2-page-flyout > *'));
    const last = kids[kids.length - 1], before = kids[kids.length - 2];
    return { count: kids.length, lastId: last.id, beforeSep: before.classList.contains('v2-hover-hsep'), sepCount: kids.filter(k => k.classList.contains('v2-hover-hsep')).length };
  });
  const rowInfo = await menuRowState();
  check(`${T}, menu : au survol, le volet Page s'ouvre dans le panneau`, flyout.found && flyout.inPanel, flyout);
  check(`${T}, menu : « Filigrane… » est la dernière ligne, après un second filet, atteignable à la souris (dans le panneau, au premier plan)`, menu.lastId === 'v2-btn-watermark' && menu.beforeSep && menu.sepCount === 2 && seen(row), { menu, row });
  check(`${T}, menu : la ligne dit « Filigrane… » sans texte à droite tant qu'il n'y a pas de filigrane`, rowInfo.name === 'Filigrane…' && rowInfo.value === '' && rowInfo.disabled === 'false' && rowInfo.role === 'menuitem', rowInfo);
  const cName = await contrastOf(`${ROW} .v2-page-row-name`);
  check(`${T}, menu : le nom de la ligne se lit (contraste ${cName}:1, au moins 4,5:1)`, cName >= 4.5, cName);
  await snap(`${T}-1-menu`);
  await closePageMenu();

  // 2) Le clic sur la ligne ouvre la fenêtre : elle tient dans le panneau sans défiler, le clavier est dans le champ.
  await clickWatermarkRow();
  const opened = await winOpen();
  const box = await hit(BOX), title = await hit(`${WIN} h3`), text = await hit(TEXT), ok = await hit(OK), cancel = await hit(CANCEL);
  const parts = [];
  for (const sel of [angleButton('diagonal'), angleButton('horizontal'), swatch('gray'), swatch('orange'), RANGE, `${WIN} .pp-watermark-sheet`]) parts.push(await hit(sel));
  const scroll = await noScroll();
  check(`${T}, fenêtre : un clic sur « Filigrane… » l'ouvre`, opened, { opened });
  check(`${T}, fenêtre : elle tient dans ${WIDTH}x${HEIGHT} - titre, texte, sens, couleurs, opacité, feuille d'aperçu, « Annuler » et « Valider » au premier plan, sans défiler`, box.inPanel && seen(title) && seen(text) && seen(ok) && seen(cancel) && parts.every(seen) && scroll.ok, { box, title, text, ok, cancel, parts, scroll });
  check(`${T}, fenêtre : le focus est dans le champ du texte`, (await focusIn()) === 'pp-watermark-text', await focusIn());
  const s0 = await dialogState();
  check(`${T}, fenêtre : au départ, champ vide, en diagonale, gris, 20 % - rien à retirer, pas de dessin sur la feuille`, s0.text === '' && s0.angle === 'diagonal' && s0.color === 'gray' && s0.range === 20 && s0.percent === '20 %' && s0.preview === null && !s0.removeShown, s0);
  const labels = await page.evaluate(() => ({ title: document.getElementById('pp-watermark-title').textContent, labels: Array.from(document.querySelectorAll('#pp-watermark-modal .pp-watermark-label')).map(l => l.textContent), hint: document.getElementById('pp-watermark-hint').textContent, ph: document.getElementById('pp-watermark-text').placeholder, buttons: Array.from(document.querySelectorAll('#pp-watermark-modal .var-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent), choices: Array.from(document.querySelectorAll('#pp-watermark-modal .pp-watermark-choice')).map(b => b.textContent) }));
  check(`${T}, fenêtre : titre, libellés, indication sous le champ, sens et boutons en français`, labels.title === 'Filigrane de la page' && labels.labels.join() === 'Texte,Sens,Couleur,Opacité' && labels.choices.join() === 'En diagonale,Horizontal' && labels.buttons.join() === 'Annuler,Valider' && /^Écrit en grand derrière chaque page de l’aperçu A4, de la Lecture, du PDF et du Word\.$/.test(labels.hint) && labels.ph === 'CONFIDENTIEL, BROUILLON…', labels);
  const hintAt = await page.evaluate(() => {
    const hint = document.getElementById('pp-watermark-hint').getBoundingClientRect(), field = document.getElementById('pp-watermark-text').getBoundingClientRect(), label = document.querySelector('#pp-watermark-modal .pp-watermark-label').getBoundingClientRect();
    return { hintLeft: hint.left, hintTop: hint.top, fieldLeft: field.left, fieldBottom: field.bottom, labelRight: label.right, labelMiddle: (label.top + label.bottom) / 2, fieldMiddle: (field.top + field.bottom) / 2 };
  });
  check(`${T}, fenêtre : l'indication commence sous le champ (à son bord gauche, pas sous son libellé), et le libellé est à la hauteur du champ`, hintAt.hintTop >= hintAt.fieldBottom && Math.abs(hintAt.hintLeft - hintAt.fieldLeft) <= 0.5 && hintAt.hintLeft > hintAt.labelRight && Math.abs(hintAt.labelMiddle - hintAt.fieldMiddle) <= 2, hintAt);
  const cHint = await contrastOf('#pp-watermark-hint'), cLabel = await contrastOf(`${WIN} .pp-watermark-label`), cPercent = await contrastOf(`${WIN} .pp-watermark-percent`), cChoice = await contrastOf(angleButton('horizontal'));
  check(`${T}, fenêtre : l'indication (${cHint}:1), les libellés (${cLabel}:1), le pourcentage (${cPercent}:1) et les boutons de sens (${cChoice}:1) font au moins 4,5:1`, [cHint, cLabel, cPercent, cChoice].every(c => c >= 4.5), { cHint, cLabel, cPercent, cChoice });
  await snap(`${T}-2-fenetre-vide`);

  // 3) La frappe et les clics changent la feuille d'aperçu.
  await page.keyboard.type('CONFIDENTIEL');
  await page.waitForTimeout(150);
  const s1 = await dialogState();
  check(`${T}, fenêtre : la frappe écrit le texte sur la feuille d'aperçu - gris à 20 %, en diagonale (-45°)`, s1.text === 'CONFIDENTIEL' && s1.preview && s1.preview.text === 'CONFIDENTIEL' && s1.preview.color === GRAY && s1.preview.opacity === 0.2 && s1.preview.deg === -45, s1);
  await snap(`${T}-3-fenetre-diagonale`);
  await clickCenter(swatch('red'));
  await clickCenter(angleButton('horizontal'));
  const s2 = await dialogState();
  check(`${T}, fenêtre : un clic sur « Rouge » et sur « Horizontal » coche les deux et redessine la feuille (rouge, 0°)`, s2.color === 'red' && s2.angle === 'horizontal' && s2.preview.color === RED && s2.preview.deg === 0, s2);
  // Le curseur : un vrai clic au milieu de la piste, puis Début, Fin et les flèches.
  const track = await centerOf(RANGE);
  await page.mouse.click(track.x, track.y);
  await page.waitForTimeout(100);
  const s3 = await dialogState();
  check(`${T}, fenêtre : un clic au milieu du curseur donne une opacité de 40 à 60 % (${s3.percent}), la feuille la suit`, s3.range >= 40 && s3.range <= 60 && s3.percent === `${s3.range} %` && s3.preview.opacity === s3.range / 100, s3);
  await page.keyboard.press('Home');
  const sHome = await dialogState();
  await page.keyboard.press('End');
  const sEnd = await dialogState();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
  const sMid = await dialogState();
  check(`${T}, fenêtre : Début donne 5 %, Fin 100 %, dix flèches à gauche 50 % (pas de 5), le pourcentage et la feuille suivent`, sHome.range === 5 && sHome.percent === '5 %' && sEnd.range === 100 && sEnd.percent === '100 %' && sMid.range === 50 && sMid.percent === '50 %' && sMid.preview.opacity === 0.5, { sHome, sEnd, sMid });
  await snap(`${T}-4-fenetre-rouge`);

  // 4) « Valider » pose le filigrane sur chaque page de l'éditeur, au centre de la feuille, avec la couleur, l'angle et l'opacité choisis.
  await clickCenter(OK);
  const closed = !(await winOpen());
  await page.waitForTimeout(500);
  const editorLayer = await layerState('#editor-container');
  const expected = { text: 'CONFIDENTIEL', color: RED, opacity: 0.5, deg: 0 };
  check(`${T}, valider : la fenêtre se ferme et le clavier revient dans l'éditeur`, closed && (await focusIn()) === 'editor', { closed, focus: await focusIn() });
  check(`${T}, valider : le filigrane est sur les ${editorLayer.length} pages de l'éditeur - même texte, rouge, 50 %, horizontal, centré sur la feuille à 1 px près`, editorLayer.length >= 2 && paintedSame(editorLayer, expected), editorLayer);
  const stored = await saved();
  check(`${T}, valider : le modèle garde { texte, sens, couleur, opacité } bornés`, stored && stored.text === 'CONFIDENTIEL' && stored.angle === 'horizontal' && stored.color === '#c62828' && stored.opacity === 0.5, stored);
  await snap(`${T}-5-editeur`);
  await textStaysOnTop(T);
  const shareDialog = await (async () => { await clickWatermarkRow(); const v = await widthShare(WIN, '.pp-watermark-page'); return v; })();
  const shareEditor = await widthShare('#editor-container', '.v2-page-layer-page');
  check(`${T}, aperçu : le texte occupe la même part de la largeur de la page dans la fenêtre (${shareDialog}) et dans l'éditeur (${shareEditor})`, shareDialog != null && shareEditor != null && Math.abs(shareDialog - shareEditor) < 0.02, { shareDialog, shareEditor });

  // 5) La ligne du menu dit le texte en cours ; la fenêtre rouverte montre les réglages posés, avec « Retirer le filigrane ».
  const s4 = await dialogState();
  check(`${T}, rouvrir : texte, rouge, horizontal, 50 % et « Retirer le filigrane » affiché`, s4.text === 'CONFIDENTIEL' && s4.color === 'red' && s4.angle === 'horizontal' && s4.range === 50 && s4.removeShown, s4);
  const removeLabel = await page.evaluate(() => document.querySelector('#pp-watermark-modal .var-modal-danger').textContent);
  check(`${T}, rouvrir : le bouton dit « Retirer le filigrane »`, removeLabel === 'Retirer le filigrane', removeLabel);
  await snap(`${T}-6-fenetre-rouverte`);

  // 6) Annuler et Échap ne touchent à rien.
  await page.keyboard.press('End');
  await page.keyboard.type('XX');
  await clickCenter(CANCEL);
  const afterCancel = await saved();
  await clickWatermarkRow();
  await page.keyboard.type('YY');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const afterEscape = await saved();
  check(`${T}, annuler et Échap : la fenêtre se ferme, le filigrane reste « CONFIDENTIEL »`, !(await winOpen()) && afterCancel.text === 'CONFIDENTIEL' && afterEscape.text === 'CONFIDENTIEL', { afterCancel, afterEscape });
  const rowAfter = await (async () => { await openPageMenu(); const r = await menuRowState(); await closePageMenu(); return r; })();
  check(`${T}, menu : la ligne montre maintenant le texte en cours (« CONFIDENTIEL ») à droite de « Filigrane… »`, rowAfter.name === 'Filigrane…' && rowAfter.value === 'CONFIDENTIEL', rowAfter);

  // 7) Le clavier : Ctrl+A et une frappe, Tab dans la fenêtre, les flèches sur le sens et la couleur, le curseur, Entrée valide.
  await clickWatermarkRow();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('BROUILLON');
  await page.keyboard.press('Tab');
  const tabAngle = await focusIn();
  await page.keyboard.press('ArrowLeft');
  const sAngle = await dialogState();
  await page.keyboard.press('Tab');
  const tabColor = await focusIn();
  await page.keyboard.press('ArrowRight');
  const sColor = await dialogState();
  await page.keyboard.press('Tab');
  const tabRange = await focusIn();
  await page.keyboard.press('ArrowLeft');
  const sRange = await dialogState();
  check(`${T}, clavier : Tab passe du champ au sens (${tabAngle}), à la couleur (${tabColor}) puis au curseur (${tabRange}) - un seul arrêt par groupe, sur le choix en cours`, tabAngle === 'choice:horizontal' && tabColor === 'swatch:red' && tabRange === 'pp-watermark-opacity', { tabAngle, tabColor, tabRange });
  check(`${T}, clavier : flèche gauche sur le sens -> « En diagonale », flèche droite sur la couleur -> bleu, flèche gauche sur le curseur -> 45 %`, sAngle.angle === 'diagonal' && sColor.color === 'blue' && sRange.range === 45 && sRange.preview.color === BLUE && sRange.preview.deg === -45, { sAngle, sColor, sRange });
  // Tab fait le tour de la fenêtre sans en sortir.
  const tabs = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); tabs.push(await focusIn()); }
  check(`${T}, clavier : Tab tourne dans la fenêtre sans en sortir (${tabs.join(' > ')})`, tabs.every(t => t !== 'editor' && t !== 'body') && tabs.includes('pp-watermark-text'), tabs);
  await page.focus(TEXT);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const keyed = await layerState('#editor-container');
  check(`${T}, clavier : Entrée dans le champ valide - BROUILLON, bleu, 45 %, en diagonale sur chaque page`, !(await winOpen()) && keyed.length >= 2 && paintedSame(keyed, { text: 'BROUILLON', color: BLUE, opacity: 0.45, deg: -45 }), keyed.slice(0, 2));
  await snap(`${T}-7-editeur-diagonale`);

  // 8) La Lecture porte le même filigrane que l'éditeur.
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
  await page.waitForTimeout(300);
  await clickCenter('#btn-mode-read');
  await page.waitForFunction(() => document.getElementById('reader-container').style.display === 'block' && !!document.querySelector('#reader-container .reader-content'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  const readerLayer = await layerState('#reader-container');
  check(`${T}, Lecture : ${readerLayer.length} page(s), toutes avec BROUILLON, bleu, 45 %, en diagonale, au centre de la feuille`, readerLayer.length >= 1 && paintedSame(readerLayer, { text: 'BROUILLON', color: BLUE, opacity: 0.45, deg: -45 }), readerLayer.slice(0, 2));
  await snap(`${T}-8-lecture`);
  await clickCenter('#btn-mode-edit');
  await page.waitForTimeout(500);

  // 9) Retirer : le filigrane disparaît des pages et du menu ; un texte vidé puis « Valider » retire aussi.
  await clickWatermarkRow();
  await clickCenter(REMOVE);
  await page.waitForTimeout(400);
  const gone = await layerState('#editor-container');
  const rowGone = await (async () => { await openPageMenu(); const r = await menuRowState(); await closePageMenu(); return r; })();
  check(`${T}, retirer : la fenêtre se ferme, plus aucun filigrane sur les pages, la ligne du menu n'a plus de texte`, !(await winOpen()) && (await saved()) === null && gone.every(g => !g.has) && rowGone.value === '', { saved: await saved(), gone: gone.slice(0, 2), rowGone });
  await clickWatermarkRow();
  const s5 = await dialogState();
  check(`${T}, retirer : rouverte, la fenêtre repart des réglages par défaut (champ vide, gris, 20 %) sans « Retirer »`, s5.text === '' && s5.color === 'gray' && s5.angle === 'diagonal' && s5.range === 20 && !s5.removeShown, s5);
  await page.keyboard.type('A'.repeat(55));
  const longText = await dialogState();
  check(`${T}, texte : 55 caractères tapés, le champ en garde 40`, longText.text.length === 40, longText.text.length);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check(`${T}, texte : le modèle garde 40 caractères`, (await saved()).text.length === 40, await saved());
  await clickWatermarkRow();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  const sCleared = await dialogState();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check(`${T}, texte vidé : la feuille d'aperçu n'a plus de dessin, « Valider » retire le filigrane`, sCleared.preview === null && (await saved()) === null && !(await winOpen()), { sCleared, saved: await saved() });
  await closeWindowWithEscape();
}

async function runEnglish() {
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await ensureA4Preview();
  await setDoc();
  await pageFocus();
  await openPageMenu();
  const rowEn = await menuRowState();
  check('anglais, menu : la ligne dit « Watermark… »', rowEn.name === 'Watermark…' && rowEn.value === '', rowEn);
  await snap('en-1-menu');
  await closePageMenu();
  await clickWatermarkRow();
  const en = await page.evaluate(() => ({
    title: document.getElementById('pp-watermark-title').textContent,
    labels: Array.from(document.querySelectorAll('#pp-watermark-modal .pp-watermark-label')).map(l => l.textContent),
    choices: Array.from(document.querySelectorAll('#pp-watermark-modal .pp-watermark-choice')).map(b => b.textContent),
    colors: Array.from(document.querySelectorAll('#pp-watermark-modal .pp-watermark-swatch')).map(b => b.getAttribute('aria-label')),
    buttons: Array.from(document.querySelectorAll('#pp-watermark-modal .var-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent),
    hint: document.getElementById('pp-watermark-hint').textContent, ph: document.getElementById('pp-watermark-text').placeholder,
    percent: document.querySelector('#pp-watermark-modal .pp-watermark-percent').textContent,
  }));
  const box = await hit(BOX), ok = await hit(OK), scroll = await noScroll();
  check('anglais, fenêtre : titre, libellés, sens, couleurs, indication, boutons et pourcentage en anglais', en.title === 'Page watermark' && en.labels.join() === 'Text,Direction,Color,Opacity' && en.choices.join() === 'Diagonal,Horizontal' && en.colors.join() === 'Gray,Black,Red,Blue,Green,Orange' && en.buttons.join() === 'Cancel,Confirm' && en.hint === 'Written large behind every page of the A4 preview, the reader, the PDF and the Word file.' && en.ph === 'CONFIDENTIAL, DRAFT…' && en.percent === '20%', en);
  check('anglais, fenêtre : elle tient dans le panneau, sans défiler, « Confirm » au premier plan', box.inPanel && seen(ok) && scroll.ok, { box, ok, scroll });
  await snap('en-2-fenetre');
  await page.keyboard.type('DRAFT');
  await clickCenter(OK);
  await page.waitForTimeout(500);
  const layer = await layerState('#editor-container');
  check('anglais : « Confirm » pose DRAFT en gris, 20 %, en diagonale sur chaque page', layer.length >= 2 && paintedSame(layer, { text: 'DRAFT', color: GRAY, opacity: 0.2, deg: -45 }), layer.slice(0, 2));
  await clickWatermarkRow();
  const removeEn = await page.evaluate(() => document.querySelector('#pp-watermark-modal .var-modal-danger').textContent);
  check('anglais, fenêtre rouverte : le bouton dit « Remove watermark »', removeEn === 'Remove watermark', removeEn);
  await clickCenter(REMOVE);
  await page.waitForTimeout(300);
  check('anglais : « Remove watermark » retire le filigrane', (await saved()) === null, await saved());
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
