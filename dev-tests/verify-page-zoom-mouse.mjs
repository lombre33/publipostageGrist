#!/usr/bin/env node
// Zoom de la page (js/page-zoom.js, css/page-zoom.css) à la vraie souris, à la vraie molette et au vrai clavier (page.mouse, page.keyboard,
// Node/Playwright) et à la taille du panneau Grist (~700x400), en thème clair puis sombre, puis en anglais. Un petit document aux dimensions
// personnalisées (un badge) apparaîtrait sinon tout petit au milieu du gris.
// dev-tests/scenarios-page-zoom.js vérifie la structure, les niveaux, les états et les textes dans la page (clics, touches et molette synthétiques) ;
// ici, ce qui se mesure aux pixels et au geste réel : la pastille collée au coin bas droit (au repos le pourcentage seul, entière dans le panneau, à 3 px du
// bord et hors de la barre de défilement, sur le fond gris autour d'un petit badge ; le survol ou Tab ouvre moins, plus et « Ajuster » à gauche du pourcentage,
// qui ne bouge pas ; atteignable sous la souris, ses couleurs à 4,5:1 et réellement peintes), « Ajuster » qui donne au badge toute la largeur du panneau sans
// barre de défilement horizontale, plus et moins, Ctrl + plus / moins / 0 au vrai clavier (le navigateur ne zoome pas lui-même), Ctrl + molette qui garde sous
// le pointeur le mot qu'il survole (Édition et Lecture), la molette sans Ctrl qui défile comme avant, le curseur du texte gardé quand on clique la
// pastille, la Lecture et la Lecture épurée, une fenêtre ouverte qui passe devant la pastille et garde ses touches, le niveau retrouvé après un
// rechargement de la page, et, dans un Chromium qui garde les vraies barres de défilement (15 px), la pastille qui les longe sans les recouvrir.
// Le zoom change l'échelle des gestes : la bordure d'une colonne de tableau (prosemirror-tables lit la souris en pixels écran) et les poignées d'une
// image doivent encore suivre le pointeur à 200 % et à 50 % (un pixel de souris = un pixel écran). L'affichage d'origine (jamais zoomé) est celui
// d'avant : même facteur d'ajustement que l'ancien calcul.
// Lancé par run-headless.mjs (groupe Node "pageZoomMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-page-zoom-mouse.mjs
// (PAGE_ZOOM_SHOTS=<dossier> y range une capture par étape, à regarder - aucune vérification n'en dépend ; PAGE_ZOOM_ONLY=<partie> n'en lance
// qu'une : badge, contrat, english, wide, scrollbars, touch).
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PAGE_ZOOM_MOUSE_PORT || 8958);
const SHOTS = process.env.PAGE_ZOOM_SHOTS || '';
const ONLY = process.env.PAGE_ZOOM_ONLY || '';
const wanted = part => !ONLY || ONLY === part;
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-clean-reading-mouse.mjs.
async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const stubbed = html.replace(
    '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>',
    '<script src="dev-tests/grist-stub.js"></script>'
  );
  await writeFile(join(ROOT, '_test-harness.html'), stubbed);
}
await regenerateHarness();
if (SHOTS) await mkdir(SHOTS, { recursive: true });

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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-page-zoom-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const pageErrors = [];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol == null ? 1.5 : tol);
const r2 = v => Math.round(v * 100) / 100;
// L'échelle des niveaux de js/page-zoom.js : le cran suivant se calcule ici, pas en lisant le module.
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const stepAbove = z => STEPS.find(s => s > z + 0.005) || 4;
const stepBelow = z => { for (let i = STEPS.length - 1; i >= 0; i--) if (STEPS[i] < z - 0.005) return STEPS[i]; return 0.25; };

// Deux modèles semés avant le démarrage : « Badge » (90 x 120 mm, marges de 8 mm, ouvert au démarrage ou non) et « Contrat » (A4, une quarantaine de lignes). `first` désigne celui qui s'ouvre.
const LONG_BODY = '<p>Contrat de location</p>' + Array.from({ length: 44 }, (_, i) => '<p>Ligne ' + (i + 1) + ' du contrat de location, assez longue pour occuper une ligne entière de la feuille et passer à la suivante dans le panneau.</p>').join('');
const BADGE_BODY = '<p><strong>Bonjour</strong> <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span></p><p>Badge de l’université, fonction et structure.</p>';
const BADGE_MARGINS = JSON.stringify({ top: 8, right: 8, bottom: 8, left: 8, orientation: 'portrait', format: '90x120' });

async function waitReady(page) {
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready|lecture seule/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
  await page.waitForTimeout(900);
}

async function openWidget(colorScheme, first, size, host = browser, contextOptions = {}) {
  const viewport = size || { width: WIDTH, height: HEIGHT };
  const context = await host.newContext({ bypassCSP: true, viewport, colorScheme, ...contextOptions });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { d.accept().catch(() => {}); });
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
  await page.addInitScript(({ longBody, badgeBody, badgeMargins, firstName }) => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }, { id: 2, Nom: 'Martin' }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Badge'); m.Contenu.push(badgeBody);
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(badgeMargins); m.EstParDefaut.push(firstName === 'Badge');
      m.id.push(2); m.Nom.push('Contrat'); m.Contenu.push(longBody);
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000001); m.Margins.push(''); m.EstParDefaut.push(firstName === 'Contrat');
      stub.state.nextRowId.Publipostage_Modeles = 3;
    };
  }, { longBody: LONG_BODY, badgeBody: BADGE_BODY, badgeMargins: BADGE_MARGINS, firstName: first });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await waitReady(page);
  return { context, page };
}

let page = null;
async function shot(name) { if (SHOTS && page) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

const luminance = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const contrast = (a, b) => { const l1 = luminance(a), l2 = luminance(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const parseRgb = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(/[ ,/]+/).map(Number) : [0, 0, 0]; return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };

// Le pixel réellement peint en (x, y) de la fenêtre : une capture de 1x1 px, relue sans bibliothèque (une seule ligne de pixels : tous les filtres PNG rendent les octets bruts).
async function pixelAt(x, y) {
  const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 } });
  const idat = [];
  for (let off = 8; off < png.length;) {
    const len = png.readUInt32BE(off);
    if (png.toString('ascii', off + 4, off + 8) === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return { r: raw[1], g: raw[2], b: raw[3] };
}
const samePixel = (a, b, tol = 3) => Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol;

// Rectangle (pixels écran) d'un élément, ou null.
const boxOf = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
    inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
}, sel);
// La pastille se réduit au pourcentage tant que la souris n'est pas dessus : moins, plus et Ajuster s'ouvrent à sa gauche au survol, le pourcentage ne bouge
// pas. Pour toucher l'un d'eux, la souris survole donc d'abord le pourcentage (openPill) ; une pastille déjà ouverte, sous la souris ou au focus, reste telle.
const PILL_PART = /^#pp-page-zoom-(out|in|fit|value)$/;
const pillOpen = () => page.evaluate(() => { const b = document.getElementById('pp-page-zoom-out'); return !!b && b.getBoundingClientRect().width > 10; });
async function openPill() {
  if (await pillOpen()) return;
  const v = await boxOf('#pp-page-zoom-value');
  if (!v) return;
  await page.mouse.move(v.x, v.y - 3, { steps: 3 });
  await page.waitForFunction(() => document.getElementById('pp-page-zoom-out').getBoundingClientRect().width > 10, null, { timeout: 3000 }).catch(() => {});
}
// Ce que la souris toucherait vraiment au centre de l'élément : lui-même (ou un de ses enfants), pas autre chose posé par-dessus.
async function reachable(sel) {
  if (PILL_PART.test(sel)) await openPill();
  return page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  }, sel);
}

// Vrai geste : la souris rejoint le centre en quelques pas puis clique.
async function realClick(sel) {
  if (PILL_PART.test(sel)) await openPill();
  const b = await boxOf(sel);
  if (!b) return null;
  await page.mouse.move(b.x - 5, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  return b;
}
async function clickAt(x, y) { await page.mouse.move(x, y); await sleep(40); await page.mouse.down(); await sleep(40); await page.mouse.up(); await sleep(180); }
async function dragBy(from, dx, dy) {
  await page.mouse.move(from.x, from.y); await sleep(60);
  await page.mouse.down(); await sleep(60);
  const steps = 10;
  for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + dx * i / steps, from.y + dy * i / steps); await sleep(12); }
  await sleep(60);
  await page.mouse.up(); await sleep(250);
}
// Le temps que le niveau soit posé, gardé et la pagination refaite (js/page-zoom.js : 150 ms de calme, puis la mesure).
const settle = () => sleep(650);
// La souris posée dans le document, loin de la barre d'outils et de la pastille : les menus de la barre s'ouvrent au survol et recouvriraient la pastille (ils sont au-dessus, --z-menu).
const parkMouse = async () => { await page.mouse.move(120, 300); await sleep(200); };

// Ce que l'écran montre de la feuille : l'éditeur ou la Lecture, selon le mode.
const view = () => page.evaluate(() => {
  const reader = document.getElementById('reader-container');
  const read = reader.style.display === 'block';
  const c = document.getElementById(read ? 'reader-container' : 'editor-container');
  const sheet = c.querySelector(read ? '.reader-content' : '.v2-page-sheet');
  const cs = getComputedStyle(c);
  const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const r = sheet ? sheet.getBoundingClientRect() : null;
  const cr = c.getBoundingClientRect();
  const value = document.getElementById('pp-page-zoom-value');
  const fit = document.getElementById('pp-page-zoom-fit');
  return {
    read, factor: parseFloat(c.style.getPropertyValue('--pp-fit-zoom')), layoutW: sheet ? sheet.offsetWidth : null, screenW: r ? r.width : null, left: r ? r.left : null, right: r ? r.right : null, top: r ? r.top : null,
    cLeft: cr.left + c.clientLeft, cRight: cr.left + c.clientLeft + c.clientWidth, cTop: cr.top + c.clientTop, cBottom: cr.top + c.clientTop + c.clientHeight,
    available: c.clientWidth - padding, hScroll: c.scrollWidth > c.clientWidth + 1, vScroll: c.scrollHeight > c.clientHeight + 1, scrollTop: c.scrollTop, scrollLeft: c.scrollLeft,
    sheetWidthPx: PageLayout.getSheetWidthPx(), value: value ? value.textContent : null, pressed: fit ? fit.getAttribute('aria-pressed') : null,
    off: ['out', 'value', 'in', 'fit'].map(k => { const b = document.getElementById('pp-page-zoom-' + k); return !!b && b.getAttribute('aria-disabled') === 'true'; }),
  };
});
const pct = z => Math.round(z * 100) + ' %';
// L'ancien calcul du facteur d'ajustement (js/main.js avant le zoom de la page) : la feuille réduite pour tenir dans le panneau, jamais agrandie, jamais sous 0,5.
const oldFactor = v => { const raw = v.available / v.sheetWidthPx; return raw >= 1 ? 1 : Math.max(0.5, raw); };

// Le centre d'un mot du document (éditeur ou Lecture), en pixels écran.
const wordCenter = (word, read) => page.evaluate(([w, inReader]) => {
  const root = document.querySelector(inReader ? '#reader-container .reader-content' : '.tiptap');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const i = n.textContent.indexOf(w);
    if (i < 0) continue;
    const range = document.createRange();
    range.setStart(n, i); range.setEnd(n, i + w.length);
    const r = range.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }
  return null;
}, [word, !!read]);
// Fait défiler le panneau pour que le mot soit au milieu de sa hauteur.
const scrollWordToMiddle = (word, read) => page.evaluate(([w, inReader]) => {
  const c = document.getElementById(inReader ? 'reader-container' : 'editor-container');
  const root = document.querySelector(inReader ? '#reader-container .reader-content' : '.tiptap');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const i = n.textContent.indexOf(w);
    if (i < 0) continue;
    const range = document.createRange();
    range.setStart(n, i); range.setEnd(n, i + w.length);
    const r = range.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    c.scrollTop += (r.top + r.height / 2) - (cr.top + c.clientHeight / 2);
    return true;
  }
  return false;
}, [word, !!read]);

// Molette avec Ctrl tenu (le pincement du pavé tactile arrive de la même façon) : la souris se pose d'abord, la touche reste enfoncée le temps des crans.
async function ctrlWheel(x, y, deltaY, times) {
  await page.mouse.move(x, y);
  await page.keyboard.down('Control');
  for (let i = 0; i < (times || 1); i++) { await page.mouse.wheel(0, deltaY); await sleep(40); }
  await page.keyboard.up('Control');
  await settle();
}

// Les évènements clavier et molette que la page reçoit, gardés pour lire plus tard s'ils ont été retenus (le zoom du navigateur est alors empêché).
const recordEvents = () => page.evaluate(() => {
  window.__keys = []; window.__wheels = [];
  window.addEventListener('keydown', e => window.__keys.push(e), true);
  window.addEventListener('wheel', e => window.__wheels.push(e), { capture: true, passive: true });
});
const lastKeyPrevented = () => page.evaluate(() => { const k = window.__keys[window.__keys.length - 1]; return k ? k.defaultPrevented : null; });
const wheelsPrevented = () => page.evaluate(() => window.__wheels.map(e => e.defaultPrevented));

// Les couleurs d'un bouton de la pastille et celles de son fond (le fond de la pastille quand le bouton est transparent).
const colorsOf = sel => page.evaluate((s) => {
  const el = document.querySelector(s);
  const pill = document.getElementById('pp-page-zoom');
  const cs = getComputedStyle(el), ps = getComputedStyle(pill);
  const own = cs.backgroundColor;
  const transparent = /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(own);
  return { color: cs.color, bg: transparent ? ps.backgroundColor : own, opacity: cs.opacity, text: el.textContent, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor };
}, sel);

async function pill() {
  return page.evaluate(() => {
    const p = document.getElementById('pp-page-zoom');
    if (!p) return null;
    const r = p.getBoundingClientRect(), cs = getComputedStyle(p);
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, rightGap: innerWidth - r.right, bottomGap: innerHeight - r.bottom, position: cs.position, bg: cs.backgroundColor, borderColor: cs.borderTopColor,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  });
}

// Une colonne de tableau tirée à la vraie souris : la bordure suit le pointeur (prosemirror-tables lit la souris en pixels de l'écran, js/page-zoom.js la ramène à l'échelle de la
// feuille) ET la largeur écrite dans le document est un nombre entier de pixels de mise en page, celui que l'enregistrement relit (colwidth repasse par parseInt) : une largeur à fraction
// (102,774, tirée à la souris sous un facteur de 0,847) était enregistrée autrement qu'elle était tirée, et le suivi des modifications ne lisait plus la largeur de la colonne.
// 61 px et non 60 : sous un facteur de 2 la moitié est un demi-pixel de mise en page, que seul l'arrondi tranche.
const DRAG_PX = 61;
const cell = (w, t) => `<td colwidth="${w}" style="width:${w}px"><p>${t}</p></td>`;
const tableHtml = '<p>Avant le tableau</p><table><tbody><tr>' + cell(100, 'A') + cell(100, 'B') + '</tr></tbody></table><p>Après le tableau</p>';
async function dragFirstBorder(dx) {
  await page.evaluate(() => { const c = document.getElementById('editor-container'); const td = document.querySelector('.tiptap table td'); const r = td.getBoundingClientRect(), cr = c.getBoundingClientRect(); c.scrollTop += r.top - cr.top - 120; c.scrollLeft += r.left - cr.left - 20; });
  await sleep(200);
  const border = await page.evaluate(() => { const r = document.querySelector('.tiptap table td').getBoundingClientRect(); return { x: r.right - 1, y: r.top + r.height / 2, lw: document.querySelector('.tiptap table td').offsetWidth }; });
  await page.mouse.move(border.x - 30, border.y);
  await page.mouse.move(border.x, border.y, { steps: 4 });
  await sleep(200);
  const handle = await page.evaluate(() => !!document.querySelector('.resize-cursor'));
  await page.mouse.down();
  await page.mouse.move(border.x + dx, border.y, { steps: 8 });
  await page.mouse.up();
  await sleep(450);
  const after = await page.evaluate(() => {
    const td = document.querySelector('.tiptap table td');
    let docWidth = null;
    EditorCore.getEditor().state.doc.descendants(node => { if (docWidth === null && node.attrs && node.attrs.colwidth) docWidth = node.attrs.colwidth[0]; });
    const written = Editor.getHTML().match(/colwidth="([^"]*)"/);
    return { right: td.getBoundingClientRect().right, lw: td.offsetWidth, docWidth, savedWidth: written ? written[1] : null };
  });
  return { handle, moved: after.right - (border.x + 1), layoutBefore: border.lw, layoutAfter: after.lw, docWidth: after.docWidth, savedWidth: after.savedWidth };
}
async function checkColumnDrag(label, name, shotName) {
  const z = (await view()).factor;
  await page.evaluate(h => { Editor.setHTML(h); }, tableHtml);
  await sleep(500);
  const drag = await dragFirstBorder(DRAG_PX);
  check(`${label} - tableau à ${name} : la poignée de la bordure apparaît sous la souris`, drag.handle, drag);
  check(`${label} - tableau à ${name} : la bordure de la colonne suit la souris (${DRAG_PX} px de souris = ${r2(drag.moved)} px à l'écran), ${drag.layoutBefore} → ${drag.layoutAfter} px de mise en page`, near(drag.moved, DRAG_PX, 2) && near(drag.layoutAfter - drag.layoutBefore, DRAG_PX / z, 2.5), { drag, z });
  check(`${label} - tableau à ${name} : la largeur tirée (${drag.docWidth}) est un nombre entier de pixels de mise en page, celui que l'enregistrement écrit (${drag.savedWidth}) et que la réouverture relit`,
    Number.isInteger(drag.docWidth) && String(drag.docWidth) === drag.savedWidth && drag.docWidth === parseInt(drag.savedWidth, 10) && near(drag.docWidth - 100, DRAG_PX / z, 1), { drag, z });
  if (shotName) await shot(shotName);
}

// === Le badge : une page de 90 x 120 mm, toute petite au milieu du gris ===
async function runBadge(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Zoom de la page, badge 90 x 120 mm, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const opened = await openWidget(theme, 'Badge');
  page = opened.page;
  await recordEvents();
  await parkMouse();

  // 1) L'affichage d'origine : la page toute petite (facteur 1), la pastille réduite au pourcentage, collée au coin bas droit, sur le fond gris.
  const v0 = await view();
  const p0 = await pill();
  check(`${label} - badge - au départ la page est à sa taille (100 %, facteur ${v0.factor}) : une petite page au milieu du gris`, v0.factor === 1 && v0.value === '100 %' && v0.screenW < v0.available * 0.6, v0);
  check(`${label} - badge - le facteur d'origine est celui d'avant le zoom de la page (ancien calcul : ${r2(oldFactor(v0))})`, near(v0.factor, oldFactor(v0), 0.0006), { factor: v0.factor, ancien: oldFactor(v0) });
  check(`${label} - au repos la pastille n'est que le pourcentage : entière dans le panneau, collée au coin bas droit (à 3 px du bord, ${r2(p0.h)} px de haut, ${r2(p0.w)} px de large)`, !!p0 && p0.inViewport && p0.position === 'fixed' && near(p0.rightGap, 3, 1) && near(p0.bottomGap, 3, 1) && near(p0.h, 24, 1) && p0.w < 62, p0);
  check(`${label} - elle ne recouvre pas la barre de défilement du panneau (elle reste dans le contenu)`, !!p0 && p0.right <= v0.cRight + 0.5 && p0.bottom <= v0.cBottom + 0.5, { pill: p0 && [p0.right, p0.bottom], contenu: [v0.cRight, v0.cBottom] });
  check(`${label} - badge - elle est sur le fond gris autour de la page, pas sur la page (la page s'arrête à ${r2(v0.right)} px, la pastille commence à ${r2(p0.left)})`, !!p0 && p0.left >= v0.right + 2, { page: v0.right, pastille: p0 && p0.left });
  const restParts = await page.evaluate(() => ['out', 'in', 'fit'].map(k => document.getElementById('pp-page-zoom-' + k).getBoundingClientRect().width));
  check(`${label} - au repos moins, plus et Ajuster ne prennent aucune place (1 px chacun) mais restent dans la page, pour Tab et pour un lecteur d'écran`, restParts.every(w => w <= 2), restParts);
  check(`${label} - rien n'est grisé ni enfoncé au départ`, v0.off.every(o => !o) && v0.pressed === 'false', v0);
  // Le fond réellement peint (au repos, la pastille est le pourcentage seul).
  const bg = parseRgb(p0.bg);
  const painted = await pixelAt(p0.left + p0.w / 2, p0.top + 2);
  check(`${label} - le fond de la pastille est peint (pixel ${painted.r},${painted.g},${painted.b} = ${p0.bg})`, samePixel(painted, bg), { painted, attendu: bg });
  await shot(`zoom-${theme}-badge-1-origine`);
  // Le survol l'ouvre : moins, plus et Ajuster à gauche du pourcentage, qui ne bouge pas (un clic dessus rend donc toujours l'affichage d'origine).
  const valueRest = await boxOf('#pp-page-zoom-value');
  await openPill();
  const pOpen = await pill();
  const valueOpen = await boxOf('#pp-page-zoom-value');
  const parts = await page.evaluate(() => Object.fromEntries(['out', 'in', 'fit', 'value'].map(k => { const r = document.getElementById('pp-page-zoom-' + k).getBoundingClientRect(); return [k, { left: r.left, right: r.right, width: r.width }]; })));
  check(`${label} - le survol ouvre la pastille : moins, plus et Ajuster à gauche du pourcentage (${r2(pOpen.w)} px de large au lieu de ${r2(p0.w)}), le bord droit et le pourcentage ne bougent pas`,
    pOpen.w > p0.w + 80 && near(pOpen.right, p0.right, 0.6) && near(pOpen.bottom, p0.bottom, 0.6) && near(valueOpen.left, valueRest.left, 0.6) && near(valueOpen.right, valueRest.right, 0.6)
    && parts.out.width >= 20 && parts.in.width >= 20 && parts.fit.width >= 40 && parts.out.right <= parts.in.left && parts.in.right <= parts.fit.left && parts.fit.right <= parts.value.left, { p0, pOpen, valueRest, valueOpen, parts });
  check(`${label} - ouverte, la pastille reste entière dans le panneau et hors de la barre de défilement`, pOpen.inViewport && pOpen.right <= v0.cRight + 0.5 && pOpen.bottom <= v0.cBottom + 0.5, { pOpen, contenu: [v0.cRight, v0.cBottom] });
  for (const part of ['out', 'value', 'in', 'fit']) check(`${label} - la souris atteint le bouton « ${part} » de la pastille (rien ne le recouvre)`, await reachable('#pp-page-zoom-' + part));
  // Les couleurs : texte ≥ 4,5:1 sur le fond.
  for (const [part, name] of [['out', 'moins'], ['value', 'pourcentage'], ['in', 'plus'], ['fit', 'Ajuster']]) {
    const c = await colorsOf('#pp-page-zoom-' + part);
    const ratio = contrast(parseRgb(c.color), parseRgb(c.bg));
    check(`${label} - ${name} : texte à ${r2(ratio)}:1 sur son fond (≥ 4,5:1)`, ratio >= 4.5, c);
  }
  await shot(`zoom-${theme}-badge-1b-pastille-ouverte`);
  await parkMouse();
  const pShut = await pill();
  check(`${label} - la souris partie, la pastille se referme sur le pourcentage (${r2(pShut.w)} px)`, near(pShut.w, p0.w, 0.6) && near(pShut.right, p0.right, 0.6), { p0, pShut });

  // 2) « Ajuster » : la page prend toute la largeur du panneau, sans barre de défilement horizontale.
  await realClick('#pp-page-zoom-fit');
  await settle();
  await parkMouse();
  const vFit = await view();
  check(`${label} - « Ajuster » : la page prend la largeur du panneau (${r2(vFit.screenW)} px pour ${r2(vFit.available)} disponibles), à ${vFit.value}`, vFit.screenW <= vFit.available + 0.01 && vFit.available - vFit.screenW <= 2.5 && vFit.factor > 1.5, vFit);
  check(`${label} - « Ajuster » : pas de barre de défilement horizontale, la page entre dans le panneau en largeur`, !vFit.hScroll && vFit.left >= vFit.cLeft - 0.5 && vFit.right <= vFit.cRight + 0.5, vFit);
  check(`${label} - « Ajuster » : le bouton est enfoncé`, vFit.pressed === 'true', vFit.pressed);
  check(`${label} - « Ajuster » : la page garde ses dimensions (${r2(vFit.layoutW)} px de mise en page, comme avant), seul l'écran la grandit`, near(vFit.layoutW, v0.layoutW, 0.6) && near(vFit.screenW, vFit.layoutW * vFit.factor, 1.2), { avant: v0.layoutW, apres: vFit.layoutW });
  const pFit = await pill();
  const fitColors = await colorsOf('#pp-page-zoom-fit');
  check(`${label} - « Ajuster » enfoncé : texte à ${r2(contrast(parseRgb(fitColors.color), parseRgb(fitColors.bg)))}:1 (≥ 4,5:1)`, contrast(parseRgb(fitColors.color), parseRgb(fitColors.bg)) >= 4.5, fitColors);
  check(`${label} - la pastille garde sa place quand la page grandit`, near(pFit.rightGap, 3, 1) && near(pFit.bottomGap, 3, 1) && pFit.right <= vFit.cRight + 0.5, { pill: pFit.right, contenu: vFit.cRight });
  await shot(`zoom-${theme}-badge-2-ajuste`);

  // 3) Plus et moins au vrai clic : le cran suivant de l'échelle, la page grandit ou rétrécit à l'écran seulement.
  const fromFit = vFit.factor;
  await realClick('#pp-page-zoom-in');
  await settle();
  const vUp = await view();
  check(`${label} - « + » depuis « Ajuster » : le cran au-dessus (${pct(stepAbove(fromFit))}), ajustement quitté`, near(vUp.factor, stepAbove(fromFit), 0.0006) && vUp.value === pct(stepAbove(fromFit)) && vUp.pressed === 'false', { vFit: fromFit, vUp });
  await realClick('#pp-page-zoom-in');
  await settle();
  const vUp2 = await view();
  check(`${label} - « + » encore : ${pct(stepAbove(vUp.factor))}`, near(vUp2.factor, stepAbove(vUp.factor), 0.0006) && vUp2.value === pct(stepAbove(vUp.factor)), vUp2);
  await realClick('#pp-page-zoom-out');
  await settle();
  const vDown = await view();
  check(`${label} - « − » : retour à ${pct(stepBelow(vUp2.factor))}`, near(vDown.factor, stepBelow(vUp2.factor), 0.0006) && vDown.value === pct(stepBelow(vUp2.factor)), vDown);
  check(`${label} - la page à l'écran mesure sa largeur de mise en page × le niveau (${r2(vDown.screenW)} px), sans que la mise en page bouge`, near(vDown.screenW, vDown.layoutW * vDown.factor, 1.2) && near(vDown.layoutW, v0.layoutW, 0.6), vDown);
  await realClick('#pp-page-zoom-value');
  await settle();
  const vBack = await view();
  check(`${label} - le clic sur le pourcentage rend l'affichage d'origine (100 %, facteur 1, ancien calcul)`, vBack.factor === 1 && vBack.value === '100 %' && vBack.pressed === 'false', vBack);

  // 4) Au clavier : Ctrl + plus, Ctrl + moins, Ctrl + 0 - le navigateur ne zoome pas lui-même (la touche est retenue).
  await clickAt(...(await (async () => { const c = await wordCenter('université', false); return [c.x, c.y]; })()));
  await page.keyboard.press('Control+Equal');
  await settle();
  const k1 = await view(), k1Prevented = await lastKeyPrevented();
  await page.keyboard.press('Control+Shift+Equal');
  await settle();
  const k2 = await view(), k2Prevented = await lastKeyPrevented();
  await page.keyboard.press('Control+Minus');
  await settle();
  const k3 = await view(), k3Prevented = await lastKeyPrevented();
  check(`${label} - Ctrl + « = » : ${pct(1.1)} et la touche est retenue (pas de zoom du navigateur)`, near(k1.factor, 1.1, 0.0006) && k1Prevented === true, { k1, k1Prevented });
  check(`${label} - Ctrl + Maj + « = » (le plus d'un clavier QWERTY) : ${pct(1.25)}, touche retenue`, near(k2.factor, 1.25, 0.0006) && k2Prevented === true, { k2, k2Prevented });
  check(`${label} - Ctrl + « - » : ${pct(1.1)}, touche retenue`, near(k3.factor, 1.1, 0.0006) && k3Prevented === true, { k3, k3Prevented });
  await page.keyboard.press('Control+Digit0');
  await settle();
  const k4 = await view(), k4Prevented = await lastKeyPrevented();
  check(`${label} - Ctrl + 0 : l'affichage d'origine, touche retenue`, k4.factor === 1 && k4.value === '100 %' && k4Prevented === true, { k4, k4Prevented });
  await page.keyboard.press('Control+KeyA');
  const plainKey = await lastKeyPrevented();
  check(`${label} - une autre touche avec Ctrl (Ctrl + A) n'est pas retenue par le zoom`, plainKey !== true || (await view()).factor === 1, { plainKey });
  await page.keyboard.press('Escape');

  // 5) Le curseur reste dans le texte quand on clique la pastille : la frappe qui suit va où il était.
  const word = await wordCenter('université', false);
  await clickAt(word.x, word.y);
  const caretBefore = await page.evaluate(() => EditorCore.getEditor().state.selection.from);
  await realClick('#pp-page-zoom-in');
  await settle();
  const focusKept = await page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest && !!a.closest('.ProseMirror'); });
  await page.keyboard.type('ZZ');
  await sleep(150);
  const typed = await page.evaluate(() => ({ text: EditorCore.getEditor().getText(), from: EditorCore.getEditor().state.selection.from }));
  check(`${label} - le clic sur « + » ne prend pas le focus : le curseur reste dans le texte`, focusKept, { focusKept });
  check(`${label} - ce qu'on tape ensuite arrive au curseur, là où il était (${caretBefore} → ${typed.from})`, /Badge de l’uZZniversité/.test(typed.text) || typed.from === caretBefore + 2, { text: typed.text, caretBefore, from: typed.from });
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Digit0');
  await settle();

  // 6) Au clavier seul : Tab jusqu'à la pastille, Entrée. Au repos moins, plus et Ajuster sont rognés, mais Tab les atteint : le focus dans la pastille l'ouvre.
  //    Le bouton focalisé a un contour visible (≥ 3:1 sur son fond).
  await parkMouse();
  await page.evaluate(() => document.getElementById('pp-page-zoom-out').focus());
  const openedByFocus = await pillOpen();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  const ring = await colorsOf('#pp-page-zoom-in');
  check(`${label} - le focus dans la pastille l'ouvre (moins, plus et Ajuster apparaissent sans souris)`, openedByFocus, openedByFocus);
  check(`${label} - Tab déplace le focus sur le bouton suivant de la pastille (plus)`, focused === 'pp-page-zoom-in', focused);
  check(`${label} - le bouton focalisé a un contour visible (${ring.outlineWidth} ${ring.outlineStyle}) à ${r2(contrast(parseRgb(ring.outlineColor), parseRgb(ring.bg)))}:1 (≥ 3:1)`, ring.outlineStyle !== 'none' && parseFloat(ring.outlineWidth) >= 1 && contrast(parseRgb(ring.outlineColor), parseRgb(ring.bg)) >= 3, ring);
  await page.keyboard.press('Enter');
  await settle();
  const vKeyboard = await view();
  check(`${label} - Tab puis Entrée sur « + » : ${pct(1.1)}`, near(vKeyboard.factor, 1.1, 0.0006), vKeyboard);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const shutByBlur = !(await pillOpen());
  check(`${label} - le focus parti, la pastille se referme sur le pourcentage`, shutByBlur, shutByBlur);
  await page.keyboard.press('Control+Digit0');
  await settle();

  // 7) Le niveau est gardé par modèle : 150 % choisi, la page rechargée le retrouve (puis l'affichage d'origine une fois remis).
  await parkMouse();
  await realClick('#pp-page-zoom-in'); await sleep(120);
  await realClick('#pp-page-zoom-in'); await sleep(120);
  await realClick('#pp-page-zoom-in');
  await settle();
  const v150 = await view();
  await page.reload({ waitUntil: 'load' });
  await waitReady(page);
  await recordEvents();
  const vReload = await view();
  check(`${label} - le niveau choisi (${v150.value}) est retrouvé après un rechargement de la page (${vReload.value})`, v150.value === '150 %' && vReload.value === '150 %' && near(vReload.factor, 1.5, 0.0006), { v150: v150.value, vReload });
  await page.keyboard.press('Control+Digit0');
  await settle();
  await page.reload({ waitUntil: 'load' });
  await waitReady(page);
  const vOriginal = await view();
  check(`${label} - remis à l'affichage d'origine, il le reste après un rechargement`, vOriginal.value === '100 %' && vOriginal.factor === 1, vOriginal);
  await realClick('#pp-page-zoom-fit');
  await settle();
  await page.reload({ waitUntil: 'load' });
  await waitReady(page);
  const vFitReload = await view();
  check(`${label} - « Ajuster » est retrouvé après un rechargement, à la largeur du panneau`, vFitReload.pressed === 'true' && vFitReload.screenW <= vFitReload.available + 0.01 && vFitReload.available - vFitReload.screenW <= 2.5, vFitReload);
  await page.keyboard.press('Control+Digit0');
  await settle();

  await opened.context.close();
}

// === Un contrat A4 : défilement, ancrage sous le pointeur, Lecture, Lecture épurée, fenêtres, tableau et image ===
async function runContract(theme, lang) {
  const label = (theme === 'dark' ? 'sombre' : 'clair') + (lang === 'en' ? ', anglais' : '');
  console.log(`\n=== Zoom de la page, contrat A4, ${WIDTH}x${HEIGHT}, thème ${theme === 'dark' ? 'sombre' : 'clair'}${lang === 'en' ? ', en anglais' : ''} ===`);
  const opened = await openWidget(theme, 'Contrat');
  page = opened.page;
  await recordEvents();
  if (lang === 'en') { await page.evaluate(() => I18n.setLang('en')); await sleep(300); }
  await parkMouse();

  // 1) L'affichage d'origine d'un A4 est celui d'avant : la feuille réduite pour tenir dans le panneau.
  const v0 = await view();
  const p0 = await pill();
  check(`${label} - contrat - au départ la feuille A4 est réduite pour tenir (facteur ${v0.factor}, ancien calcul ${r2(oldFactor(v0))}), pourcentage ${v0.value}`, near(v0.factor, oldFactor(v0), 0.0006) && v0.factor < 1 && v0.value === (lang === 'en' ? pct(v0.factor).replace(' ', '') : pct(v0.factor)), { v0 });
  check(`${label} - la pastille est entière dans le panneau, ${lang === 'en' ? 'son texte anglais compris' : 'collée au coin bas droit'}`, !!p0 && p0.inViewport && near(p0.rightGap, 3, 1) && near(p0.bottomGap, 3, 1), p0);
  if (lang === 'en') {
    const texts = await page.evaluate(() => ({ fit: document.getElementById('pp-page-zoom-fit').textContent, out: document.getElementById('pp-page-zoom-out').title, inn: document.getElementById('pp-page-zoom-in').title, value: document.getElementById('pp-page-zoom-value').title, group: document.getElementById('pp-page-zoom').getAttribute('aria-label') }));
    check('anglais - les textes de la pastille sont en anglais (Fit, Zoom out / in, Back to the original view, Page zoom)', texts.fit === 'Fit' && /^Zoom out/.test(texts.out) && /^Zoom in/.test(texts.inn) && /^Back to the original view/.test(texts.value) && texts.group === 'Page zoom', texts);
    await openPill();
    const openEn = await pill();
    check('anglais - ouverte, la pastille et son « Fit » restent entiers dans le panneau', openEn.inViewport && near(openEn.rightGap, 3, 1), openEn);
    await shot(`zoom-${theme}-en-1-pastille`);
    await opened.context.close();
    return;
  }
  await shot(`zoom-${theme}-contrat-1-origine`);

  // 2) La molette sans Ctrl défile comme avant, sans toucher au niveau.
  await page.mouse.move(WIDTH / 2, 280);
  const scroll0 = (await view()).scrollTop;
  await page.mouse.wheel(0, 240);
  await sleep(350);
  const vPlain = await view();
  const plainPrevented = (await wheelsPrevented()).slice(-1)[0];
  check(`${label} - la molette sans Ctrl défile comme avant (${scroll0} → ${vPlain.scrollTop}) et ne touche pas au niveau`, vPlain.scrollTop > scroll0 && near(vPlain.factor, v0.factor, 0.0006) && plainPrevented === false, { scroll0, vPlain, plainPrevented });

  // 3) Ctrl + molette : le mot sous le pointeur ne bouge pas.
  await scrollWordToMiddle('Ligne 18 ', false);
  await sleep(200);
  const w0 = await wordCenter('Ligne 18 ', false);
  await ctrlWheel(w0.x, w0.y, -100, 4);
  const vZ = await view();
  const w1 = await wordCenter('Ligne 18 ', false);
  const prevented = await wheelsPrevented();
  check(`${label} - Ctrl + molette vers le haut agrandit la page (${pct(v0.factor)} → ${vZ.value}) et la molette est retenue (pas de zoom du navigateur)`, vZ.factor > v0.factor * 1.4 && prevented.slice(-4).every(Boolean), { v0: v0.factor, vZ: vZ.factor, prevented });
  check(`${label} - le mot sous le pointeur n'a pas bougé (écart ${r2(w1.x - w0.x)}, ${r2(w1.y - w0.y)} px, ≤ 3)`, near(w1.x, w0.x, 3) && near(w1.y, w0.y, 3), { avant: w0, apres: w1 });
  await ctrlWheel(w1.x, w1.y, 100, 2);
  const w2 = await wordCenter('Ligne 18 ', false);
  const vOut = await view();
  check(`${label} - Ctrl + molette vers le bas rétrécit la page (${vZ.value} → ${vOut.value}), le mot reste sous le pointeur (écart ${r2(w2.x - w1.x)}, ${r2(w2.y - w1.y)} px)`, vOut.factor < vZ.factor && near(w2.x, w1.x, 3) && near(w2.y, w1.y, 3), { vZ: vZ.factor, vOut: vOut.factor, avant: w1, apres: w2 });
  // Au-dessus de la pastille aussi.
  const pillBox = await boxOf('#pp-page-zoom');
  await ctrlWheel(pillBox.x, pillBox.y, -100, 1);
  const vOverPill = await view();
  check(`${label} - Ctrl + molette posée sur la pastille zoome aussi`, vOverPill.factor > vOut.factor, { vOut: vOut.factor, vOverPill: vOverPill.factor });
  await page.keyboard.press('Control+Digit0');
  await settle();

  // 4) Plus : la page A4 grandit au-delà du panneau, la barre de défilement horizontale prend le relais (la page n'est jamais coupée) ; « Ajuster » la remet à la largeur.
  await realClick('#pp-page-zoom-in'); await sleep(100);
  await realClick('#pp-page-zoom-in'); await sleep(100);
  await realClick('#pp-page-zoom-in');
  await settle();
  const vBig = await view();
  check(`${label} - à ${vBig.value} la page A4 dépasse le panneau et se parcourt (défilement horizontal ${vBig.hScroll ? 'présent' : 'absent'}), rien n'est coupé à gauche (le bord gauche de la feuille revient à ${r2(vBig.left + vBig.scrollLeft)} px une fois le défilement ramené à 0)`, vBig.hScroll && vBig.left + vBig.scrollLeft >= vBig.cLeft - 0.5, vBig);
  await parkMouse();
  await realClick('#pp-page-zoom-fit');
  await settle();
  const vFit = await view();
  check(`${label} - « Ajuster » : l'A4 prend la largeur du panneau (${r2(vFit.screenW)} pour ${r2(vFit.available)}), sans défilement horizontal`, !vFit.hScroll && vFit.screenW <= vFit.available + 0.01 && vFit.available - vFit.screenW <= 2.5, vFit);
  await shot(`zoom-${theme}-contrat-2-ajuste`);

  // 5) La Lecture : le niveau choisi en Édition est celui de la Lecture, « Ajuster » y remplit la largeur de la Lecture (qui a sa propre barre de défilement), Ctrl + molette y ancre le mot.
  await realClick('#pp-page-zoom-in');
  await settle();
  const manualEdit = await view();
  await realClick('#btn-mode-read');
  await page.waitForFunction(() => { const c = document.querySelector('#reader-container .reader-content'); return document.getElementById('reader-container').style.display === 'block' && !!c; }, null, { timeout: 10000 }).catch(() => {});
  await settle();
  await parkMouse();
  const rd = await view();
  check(`${label} - en Lecture le niveau est celui de l'Édition (${manualEdit.value} → ${rd.value}) et la pastille est là, entière et atteignable`, rd.read && rd.value === manualEdit.value && near(rd.factor, manualEdit.factor, 0.0006) && (await pill()).inViewport && await reachable('#pp-page-zoom-in'), { manualEdit: manualEdit.value, rd });
  await realClick('#pp-page-zoom-fit');
  await settle();
  const rdFit = await view();
  check(`${label} - en Lecture « Ajuster » prend la largeur de la Lecture (${r2(rdFit.screenW)} pour ${r2(rdFit.available)} disponibles, ${rdFit.value}), sans défilement horizontal`, rdFit.pressed === 'true' && !rdFit.hScroll && rdFit.screenW <= rdFit.available + 0.01 && rdFit.available - rdFit.screenW <= 2.5, rdFit);
  await realClick('#btn-mode-edit');
  await page.waitForFunction(() => document.getElementById('editor-container').style.display !== 'none' && document.getElementById('reader-container').style.display === 'none', null, { timeout: 8000 }).catch(() => {});
  await settle();
  const editFit = await view();
  check(`${label} - « Ajuster » suit le mode : de retour en Édition la page remplit la largeur de l'Édition (${r2(editFit.screenW)} pour ${r2(editFit.available)}, ${editFit.value})`, !editFit.read && editFit.pressed === 'true' && !editFit.hScroll && editFit.screenW <= editFit.available + 0.01 && editFit.available - editFit.screenW <= 2.5, editFit);
  await realClick('#btn-mode-read');
  await page.waitForFunction(() => { const c = document.querySelector('#reader-container .reader-content'); return document.getElementById('reader-container').style.display === 'block' && !!c; }, null, { timeout: 10000 }).catch(() => {});
  await settle();
  await parkMouse();
  await page.keyboard.press('Control+Digit0');
  await settle();
  const rd0 = await view();
  await scrollWordToMiddle('Ligne 18 ', true);
  await sleep(250);
  const rw0 = await wordCenter('Ligne 18 ', true);
  await ctrlWheel(rw0.x, rw0.y, -100, 4);
  const rdZ = await view();
  const rw1 = await wordCenter('Ligne 18 ', true);
  check(`${label} - en Lecture Ctrl + molette zoome (${rd0.value} → ${rdZ.value}) et le mot reste sous le pointeur (écart ${r2(rw1.x - rw0.x)}, ${r2(rw1.y - rw0.y)} px, ≤ 3)`, rdZ.factor > rd0.factor * 1.4 && near(rw1.x, rw0.x, 3) && near(rw1.y, rw0.y, 3), { avant: rw0, apres: rw1, rd0: rd0.factor, rdZ: rdZ.factor });
  const paper = await page.evaluate(() => { const p = document.querySelector('#reader-container .v2-reader-paper'); const s = document.querySelector('#reader-container .reader-content'); if (!p || !s) return null; const a = p.getBoundingClientRect(), b = s.getBoundingClientRect(); return { top: a.top - b.top, left: a.left - b.left }; });
  check(`${label} - en Lecture le fond des pages suit la feuille agrandie (la Lecture est redessinée sur le rendu réel)`, !!paper && near(paper.top, 0, 1.5) && near(paper.left, 0, 1.5), paper);
  await shot(`zoom-${theme}-contrat-3-lecture`);

  // 6) La Lecture épurée : la pastille reste, loin du bouton de sortie et de la barre de défilement, et Ctrl + plus y zoome.
  const hover = await boxOf('#btn-mode-read');
  await page.mouse.move(hover.x - 8, hover.y, { steps: 2 });
  await page.mouse.move(hover.x, hover.y, { steps: 3 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('v2-read-flyout')).display !== 'none', null, { timeout: 4000 }).catch(() => {});
  await sleep(150);
  const row = await boxOf('#v2-btn-clean-reading');
  if (row) { await page.mouse.move(row.x, row.y, { steps: 10 }); await page.mouse.click(row.x, row.y); }
  await page.waitForFunction(() => document.body.classList.contains('pp-clean-reading'), null, { timeout: 8000 }).catch(() => {});
  await settle();
  const clean = await page.evaluate(() => {
    const p = document.getElementById('pp-page-zoom').getBoundingClientRect();
    const x = document.getElementById('btn-exit-clean-reading').getBoundingClientRect();
    const c = document.getElementById('reader-container');
    const edge = c.getBoundingClientRect().left + c.clientLeft + c.clientWidth;
    return { active: document.body.classList.contains('pp-clean-reading'), pill: { left: p.left, top: p.top, right: p.right, bottom: p.bottom }, exit: { left: x.left, top: x.top, right: x.right, bottom: x.bottom }, edge };
  });
  const overlaps = !(clean.pill.right <= clean.exit.left || clean.pill.left >= clean.exit.right || clean.pill.bottom <= clean.exit.top || clean.pill.top >= clean.exit.bottom);
  check(`${label} - Lecture épurée : la pastille reste visible, hors du bouton de sortie et de la barre de défilement`, clean.active && (await pill()).inViewport && !overlaps && clean.pill.right <= clean.edge + 0.5 && await reachable('#pp-page-zoom-in'), clean);
  const cleanBefore = await view();
  await page.keyboard.press('Control+Equal');
  await settle();
  const cleanAfter = await view();
  check(`${label} - Lecture épurée : Ctrl + plus zoome (${cleanBefore.value} → ${cleanAfter.value})`, cleanAfter.factor > cleanBefore.factor + 0.01, { cleanBefore: cleanBefore.factor, cleanAfter: cleanAfter.factor });
  await shot(`zoom-${theme}-contrat-4-lecture-epuree`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('pp-clean-reading'), null, { timeout: 8000 }).catch(() => {});
  await settle();
  const afterEscape = await view();
  check(`${label} - Échap quitte la Lecture épurée, le niveau reste (${afterEscape.value})`, !(await page.evaluate(() => document.body.classList.contains('pp-clean-reading'))) && near(afterEscape.factor, cleanAfter.factor, 0.0006), { afterEscape: afterEscape.factor, cleanAfter: cleanAfter.factor });
  await realClick('#btn-mode-edit');
  await page.waitForFunction(() => document.getElementById('editor-container').style.display !== 'none' && document.getElementById('reader-container').style.display === 'none', null, { timeout: 8000 }).catch(() => {});
  await settle();
  const backEdit = await view();
  check(`${label} - retour en Édition : le niveau choisi en Lecture (${afterEscape.value}) est celui de l'Édition (${backEdit.value})`, !backEdit.read && near(backEdit.factor, afterEscape.factor, 0.0006), { afterEscape: afterEscape.factor, backEdit: backEdit.factor });
  await page.keyboard.press('Control+Digit0');
  await settle();

  // 7) Une fenêtre ouverte passe devant la pastille et garde ses touches.
  await parkMouse();
  await realClick('#v2-btn-settings');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.pp-modal')).some(m => getComputedStyle(m).display !== 'none'), null, { timeout: 6000 }).catch(() => {});
  await sleep(300);
  const pillCenter = await boxOf('#pp-page-zoom');
  const covered = await page.evaluate(({ x, y }) => { const hit = document.elementFromPoint(x, y); return { inModal: !!hit && !!hit.closest('.pp-modal'), tag: hit ? (hit.id || hit.className || hit.tagName) : null }; }, pillCenter);
  const beforeKeys = await view();
  await page.keyboard.press('Control+Equal');
  await sleep(350);
  const withWindow = await view();
  const windowKeyPrevented = await lastKeyPrevented();
  check(`${label} - une fenêtre ouverte (Réglages) est devant la pastille : le point de la pastille touche la fenêtre`, covered.inModal, covered);
  check(`${label} - fenêtre ouverte : Ctrl + plus ne zoome pas la page et la touche n'est pas retenue (le navigateur la garde)`, near(withWindow.factor, beforeKeys.factor, 0.0006) && windowKeyPrevented !== true, { beforeKeys: beforeKeys.factor, withWindow: withWindow.factor, windowKeyPrevented });
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.evaluate(() => { document.querySelectorAll('.pp-modal').forEach(m => { if (getComputedStyle(m).display !== 'none') m.style.display = 'none'; }); });
  await sleep(150);
  await parkMouse();

  // 8) Les gestes d'édition sous un niveau qui n'est pas celui d'origine, à 200 % puis à 50 % : le curseur se pose là où on clique, la souris sélectionne la plage glissée, la bordure d'une
  //    colonne de tableau suit la souris, une image se déplace et s'agrandit du même nombre de pixels que la souris, et sa barre flottante la suit quand le niveau change.
  const LEVELS = [
    ['200 %', async () => { for (let i = 0; i < 7; i++) { await realClick('#pp-page-zoom-in'); await sleep(110); } }],
    ['50 %', async () => { await page.keyboard.press('Control+Digit0'); await sleep(300); for (let i = 0; i < 4; i++) { await realClick('#pp-page-zoom-out'); await sleep(110); } }],
  ];
  const TEXT = 'Premier paragraphe de test pour cliquer au milieu du texte, assez long pour passer sur deux lignes dans la feuille.';
  // Le bord gauche (pixels écran) du caractère `i` du premier paragraphe, et la position ProseMirror qui lui correspond.
  const charEdge = i => page.evaluate((index) => {
    const text = document.querySelector('.tiptap p').firstChild;
    const range = document.createRange();
    range.setStart(text, index); range.setEnd(text, index + 1);
    const r = range.getBoundingClientRect();
    return { x: r.left + 1, y: r.top + r.height / 2, pos: EditorCore.getEditor().view.posAtDOM(text, index) };
  }, i);
  const scrollTextIntoView = () => page.evaluate(() => {
    const c = document.getElementById('editor-container');
    const p = document.querySelector('.tiptap p');
    const r = p.getBoundingClientRect(), cr = c.getBoundingClientRect();
    c.scrollTop += r.top - cr.top - 60;
    c.scrollLeft += r.left - cr.left - 40;
  });
  const selection = () => page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return { from: s.from, to: s.to }; });
  const geometry = () => page.evaluate(() => {
    const img = document.querySelector('.tiptap .editor-image-view img');
    const r = img.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const toolbarBox = () => page.evaluate(() => { const t = document.querySelector('.v2-floating-toolbar.visible'); if (!t) return null; const r = t.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
  async function showImage() {
    await page.evaluate(() => { const c = document.getElementById('editor-container'); const img = document.querySelector('.tiptap .editor-image-view img'); const r = img.getBoundingClientRect(), cr = c.getBoundingClientRect(); c.scrollTop += r.top - cr.top - 150; c.scrollLeft += r.left - cr.left - 80; });
    await sleep(250);
  }
  async function selectImage() {
    await showImage();
    const b = await boxOf('.tiptap .editor-image-view img');
    await clickAt(b.x, b.y);
    return page.evaluate(() => { const n = EditorCore.getEditor().state.selection.node; return !!n && n.type.name === 'editorImage'; });
  }
  async function freshImageDocument() {
    await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 240; c.height = 120;
      const g = c.getContext('2d'); g.fillStyle = '#1e88e5'; g.fillRect(0, 0, 240, 120); g.fillStyle = '#fdd835'; g.fillRect(120, 60, 120, 60);
      const src = c.toDataURL('image/png');
      Editor.setHTML('<p>Texte </p><p>Ligne du document, un peu de texte pour remplir la page.</p><p>Autre ligne du document.</p>');
      const ed = EditorCore.getEditor();
      ed.commands.setTextSelection(6);
      ed.commands.insertContent({ type: 'editorImage', attrs: { src, alt: '', width: '120px' } });
      Editor.refreshLayout();
    });
    await sleep(500);
  }
  // L'affichage d'origine (« 100 % » à la pastille : à 700 px c'est le facteur d'ajustement de la feuille, ~0,85) : la bordure d'une colonne et sa largeur écrite, comme à 200 % et à 50 %.
  await page.keyboard.press('Control+Digit0');
  await settle();
  await parkMouse();
  await checkColumnDrag(label, `l'affichage d'origine (facteur ${r2((await view()).factor)})`, null);
  for (const [name, setup] of LEVELS) {
    await page.keyboard.press('Control+Digit0');
    await settle();
    await setup();
    await settle();
    await parkMouse();
    const z = (await view()).factor;

    // Le texte : un clic pose le curseur sur le caractère visé, un glissé sélectionne la plage.
    await page.evaluate((t) => { Editor.setHTML('<p>' + t + '</p><p>Second paragraphe.</p>'); }, TEXT);
    await sleep(500);
    await scrollTextIntoView();
    await sleep(200);
    const at = await charEdge(30);
    await clickAt(at.x, at.y);
    const caret = await selection();
    check(`${label} - texte à ${name} (facteur ${r2(z)}) : un clic pose le curseur sur le caractère visé (position ${caret.from} pour ${at.pos})`, caret.from === caret.to && Math.abs(caret.from - at.pos) <= 1, { caret, at });
    const from = await charEdge(10), to = await charEdge(24);
    await dragBy({ x: from.x, y: from.y }, to.x - from.x, to.y - from.y);
    const picked = await selection();
    check(`${label} - texte à ${name} : glisser de la lettre 10 à la lettre 24 sélectionne cette plage (${picked.from} → ${picked.to} pour ${from.pos} → ${to.pos})`, Math.abs(picked.from - from.pos) <= 1 && Math.abs(picked.to - to.pos) <= 1, { picked, from, to });

    // Une colonne de tableau.
    await checkColumnDrag(label, name, `zoom-${theme}-contrat-5-colonne-${name.replace(/\D/g, '')}`);

    // Une image : sélection, passage en calque par la barre flottante, déplacement, agrandissement.
    await freshImageDocument();
    await parkMouse();
    check(`${label} - image à ${name} : un vrai clic la sélectionne`, await selectImage());
    const layer = await boxOf('.v2-floating-toolbar.visible button[data-action="layer-front"]');
    check(`${label} - image à ${name} : la barre flottante de l'image est là et son bouton « devant le texte » atteignable`, !!layer && layer.inViewport, layer);
    if (layer) { await clickAt(layer.x, layer.y); await sleep(250); }
    await selectImage();
    const g0 = await geometry();
    const move = await boxOf('.tiptap .editor-image-view .editor-image-move-handle');
    if (move) await dragBy(move, 60, -10);
    const g1 = await geometry();
    check(`${label} - image à ${name} : glisser la poignée de (60, -10) px déplace l'image de (60, -10) px à l'écran (écart ${r2(g1.left - g0.left)}, ${r2(g1.top - g0.top)})`, !!move && near(g1.left - g0.left, 60, 2) && near(g1.top - g0.top, -10, 2), { g0, g1 });
    await selectImage();
    // Mesurée après la sélection : elle ramène l'image dans le panneau (défilement), ce qui change sa position écran sans qu'elle ait bougé.
    const gShown = await geometry();
    const se = await boxOf('.tiptap .editor-image-view .editor-image-handle-se');
    const seHit = await reachable('.tiptap .editor-image-view .editor-image-handle-se');
    if (se) await dragBy(se, 40, 0);
    const g2 = await geometry();
    check(`${label} - image à ${name} : tirer la poignée de 40 px agrandit l'image de 40 px à l'écran (${r2(gShown.width)} → ${r2(g2.width)}), le coin haut gauche ne bouge pas`, !!se && seHit && near(g2.width - gShown.width, 40, 2) && near(g2.left, gShown.left, 1.5) && near(g2.top, gShown.top, 1.5), { gShown, g2, seHit });
    // La barre flottante reste ouverte et suit l'image quand le niveau change : un clic sur la pastille ne la ferme pas.
    await selectImage();
    const gBefore = await geometry();
    const tbBefore = await toolbarBox();
    await realClick('#pp-page-zoom-in');
    await settle();
    await showImage();
    const gAfter = await geometry();
    const tbAfter = await toolbarBox();
    const gap = (g, t) => t ? Math.max(0, g.top - t.bottom, t.top - (g.top + g.height)) : null;
    check(`${label} - image à ${name} : un cran de zoom, la barre flottante reste ouverte et collée à l'image (écart ${tbBefore ? r2(gap(gBefore, tbBefore)) : 'aucune barre'} → ${tbAfter ? r2(gap(gAfter, tbAfter)) : 'aucune barre'} px, image ${r2(gBefore.width)} → ${r2(gAfter.width)} px)`, !!tbBefore && !!tbAfter && gap(gBefore, tbBefore) <= 40 && gap(gAfter, tbAfter) <= 40 && gAfter.width > gBefore.width * 1.04, { gBefore, tbBefore, gAfter, tbAfter });
    await shot(`zoom-${theme}-contrat-6-image-${name.replace(/\D/g, '')}`);
  }

  await opened.context.close();
}

// === Témoin : un panneau large (1400 x 1000), facteur 1 pour un A4 ===
async function runWide() {
  console.log('\n=== Zoom de la page, témoin 1400x1000 ===');
  const opened = await openWidget('light', 'Contrat', { width: 1400, height: 1000 });
  page = opened.page;
  await recordEvents();
  const v0 = await view();
  const p0 = await pill();
  check('1400x1000 - un A4 est à sa taille au départ (100 %, ancien calcul)', v0.factor === 1 && v0.value === '100 %' && near(oldFactor(v0), 1, 0.0006), v0);
  check('1400x1000 - la pastille est collée au coin bas droit, à 3 px du bord', !!p0 && p0.inViewport && near(p0.rightGap, 3, 1) && near(p0.bottomGap, 3, 1), p0);
  await checkColumnDrag('1400x1000', '100 % (facteur 1)', null);
  await page.mouse.move(700, 300);
  await realClick('#pp-page-zoom-fit');
  await settle();
  const vFit = await view();
  check(`1400x1000 - « Ajuster » : l'A4 prend la largeur du panneau (${r2(vFit.screenW)} pour ${r2(vFit.available)}), sans défilement horizontal`, !vFit.hScroll && vFit.screenW <= vFit.available + 0.01 && vFit.available - vFit.screenW <= 2.5 && vFit.factor > 1, vFit);
  await page.keyboard.press('Control+Digit0');
  await settle();
  await opened.context.close();
}

// === Les vraies barres de défilement : la pastille les longe sans les recouvrir ===
// Le Chromium de test cache les barres (--hide-scrollbars) : elles ne prennent aucune place et la pastille n'aurait rien à longer. Un second Chromium, lancé sans cet
// argument, a les vraies (15 px) : la barre verticale du panneau dès que la feuille dépasse en hauteur, l'horizontale dès qu'elle dépasse en largeur (à 125 % un A4).
async function runScrollbars() {
  console.log(`\n=== Zoom de la page, vraies barres de défilement, contrat A4, ${WIDTH}x${HEIGHT} ===`);
  const classic = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'], ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const opened = await openWidget('light', 'Contrat', null, classic);
    page = opened.page;
    await recordEvents();
    await parkMouse();
    const bars = () => page.evaluate(() => {
      const reader = document.getElementById('reader-container');
      const c = reader.style.display === 'block' ? reader : document.getElementById('editor-container');
      return { vertical: c.offsetWidth - c.clientWidth - 2 * c.clientLeft, horizontal: c.offsetHeight - c.clientHeight - 2 * c.clientTop };
    });
    const along = async (label, wantHorizontal) => {
      const v = await view(), b = await bars(), p = await pill();
      check(`${label} : la barre de défilement verticale est réelle (${b.vertical} px) et la pastille la longe, à ${r2(v.cRight - p.right)} px de son bord (3 px), sans la recouvrir`, b.vertical > 5 && near(v.cRight - p.right, 3, 1) && near(p.rightGap, b.vertical + 3, 1.5), { b, v: { cRight: v.cRight }, p });
      if (wantHorizontal) check(`${label} : la barre horizontale apparaît (${b.horizontal} px) et la pastille passe au-dessus, à ${r2(v.cBottom - p.bottom)} px de son bord (3 px)`, v.hScroll && b.horizontal > 5 && near(v.cBottom - p.bottom, 3, 1) && near(p.bottomGap, b.horizontal + 3, 1.5), { b, v: { cBottom: v.cBottom, hScroll: v.hScroll }, p });
      else check(`${label} : pas de barre horizontale, la pastille est à ${r2(v.cBottom - p.bottom)} px du bas du panneau (3 px)`, !v.hScroll && b.horizontal <= 1 && near(v.cBottom - p.bottom, 3, 1) && near(p.bottomGap, 3, 1.5), { b, v: { cBottom: v.cBottom, hScroll: v.hScroll }, p });
    };
    await along('édition à l\u2019affichage d\u2019origine', false);
    await shot('zoom-barres-1-edition-origine');
    await page.keyboard.press('Control+Equal');
    await settle();
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+Equal'); await settle(); }
    await along(`édition à ${(await view()).value}`, true);
    await shot('zoom-barres-2-edition-zoomee');
    await openPill();
    const open = await pill(), vOpen = await view();
    check('édition zoomée : ouverte, la pastille garde son bord droit et reste au-dessus de la barre horizontale', open.right <= vOpen.cRight + 0.5 && open.bottom <= vOpen.cBottom + 0.5 && near(vOpen.cRight - open.right, 3, 1), { open, vOpen: { cRight: vOpen.cRight, cBottom: vOpen.cBottom } });
    await shot('zoom-barres-3-edition-ouverte');
    await realClick('#btn-mode-read');
    await page.waitForFunction(() => { const c = document.querySelector('#reader-container .reader-content'); return document.getElementById('reader-container').style.display === 'block' && !!c; }, null, { timeout: 10000 }).catch(() => {});
    await settle();
    await parkMouse();
    await along(`lecture à ${(await view()).value}`, true);
    await shot('zoom-barres-4-lecture');
    await page.keyboard.press('Control+Digit0');
    await settle();
    await along('lecture à l\u2019affichage d\u2019origine', false);
    await realClick('#btn-mode-edit');
    await settle();
    await opened.context.close();
  } finally {
    await classic.close();
  }
}

// === Un écran tactile : pas de survol, la pastille reste ouverte ===
// Sans souris rien ne l'ouvrirait : moins, plus et « Ajuster » restent visibles (media (any-hover: hover) de css/page-zoom.css, `hasTouch` de Playwright retire le survol) et un
// vrai toucher les actionne.
async function runTouch() {
  console.log(`\n=== Zoom de la page, écran tactile sans survol, badge 90 x 120 mm, ${WIDTH}x${HEIGHT} ===`);
  const opened = await openWidget('light', 'Badge', null, browser, { hasTouch: true });
  page = opened.page;
  const noHover = await page.evaluate(() => !matchMedia('(any-hover: hover)').matches);
  const p0 = await pill();
  const parts = await page.evaluate(() => Object.fromEntries(['out', 'in', 'fit', 'value'].map(k => { const r = document.getElementById('pp-page-zoom-' + k).getBoundingClientRect(); return [k, { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, right: r.right, width: r.width }]; })));
  check(`tactile - le navigateur n'a aucun survol (any-hover: none), le cas de ce test`, noHover, noHover);
  check(`tactile - la pastille reste ouverte au repos (${r2(p0.w)} px) : moins, plus et Ajuster sont visibles, dans l'ordre, à gauche du pourcentage`,
    p0.w > 150 && parts.out.width >= 20 && parts.in.width >= 20 && parts.fit.width >= 40 && parts.out.right <= parts.in.left && parts.in.right <= parts.fit.left && parts.fit.right <= parts.value.left, { p0, parts });
  check('tactile - elle reste entière dans le panneau, collée au coin bas droit (à 3 px du bord)', p0.inViewport && near(p0.rightGap, 3, 1) && near(p0.bottomGap, 3, 1), p0);
  const before = await view();
  await page.touchscreen.tap(parts.in.x, parts.in.y);
  await settle();
  const after = await view();
  check(`tactile - un toucher sur « + » zoome (${before.value} → ${after.value})`, after.factor > before.factor + 0.05 && after.value === pct(stepAbove(before.factor)), { before: before.factor, after: after.factor });
  await page.touchscreen.tap(parts.fit.x, parts.fit.y);
  await settle();
  const fitted = await view();
  check(`tactile - un toucher sur « Ajuster » donne toute la largeur au badge (${fitted.value})`, fitted.pressed === 'true' && fitted.screenW <= fitted.available + 0.01 && fitted.available - fitted.screenW <= 2.5, fitted);
  await page.touchscreen.tap(parts.value.x, parts.value.y);
  await settle();
  const back = await view();
  check(`tactile - un toucher sur le pourcentage rend l'affichage d'origine (${back.value})`, back.factor === 1 && back.value === '100 %' && back.pressed === 'false', back);
  await shot('zoom-tactile-1-pastille-ouverte');
  await opened.context.close();
}

if (wanted('badge')) { await runBadge('light'); await runBadge('dark'); }
if (wanted('contrat')) { await runContract('light', 'fr'); await runContract('dark', 'fr'); }
if (wanted('english')) { await runContract('light', 'en'); await runContract('dark', 'en'); }
if (wanted('wide')) await runWide();
if (wanted('scrollbars')) await runScrollbars();
if (wanted('touch')) await runTouch();

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
