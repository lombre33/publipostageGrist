#!/usr/bin/env node
// Formats de page (A3, A4, A5, A6) d'un modèle classique à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), à la taille du panneau Grist
// d'Antoine (~700x400), en thème clair puis sombre : le survol du bouton Portrait / Paysage ouvre son menu (deux sens, quatre formats avec leurs dimensions) tout entier dans le
// panneau et sous la souris, un vrai clic sur une ligne change la page (feuille de la largeur du format, mesurée aux PIXELS d'une vraie capture, ramenée dans le panneau par le facteur
// d'ajustement, pagination et Lecture qui suivent, enregistrement automatique en une seule écriture avec la clé `format`), le menu se referme souris partie sans garder le focus ni
// prendre le curseur du texte, le clavier (Tab, Entrée, Espace) parcourt les six lignes, sur un email le menu est grisé et dit pourquoi, et sur un macro-modèle (résumé affiché, éditeur masqué)
// il est actif : un vrai clic y pose A5 paysage, la Lecture suit et l'enregistrement automatique l'écrit dans la ligne du macro-modèle, composition intacte.
// dev-tests/scenarios-page-format.js vérifie le reste DANS la page (PDF, Word, enregistrement, images en calque...) ; ici, chaque geste est un vrai geste.
// Lancé par run-headless.mjs (groupe Node "pageFormatMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-page-format-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PAGE_FORMAT_MOUSE_PORT || 8911);
const WIDTH = 700;
const HEIGHT = 400;
// Captures d'écran du menu (clair et sombre) : un dossier temporaire, ou PAGE_FORMAT_SHOTS pour les garder.
const SHOTS = process.env.PAGE_FORMAT_SHOTS || mkdtempSync(join(tmpdir(), 'page-format-'));
mkdirSync(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-access-rights-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-page-format-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  // Boîtes du navigateur (alert/confirm) : acceptées et consignées, jamais bloquantes.
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept().catch(() => {}); });
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
  // Semé avant le démarrage : un modèle classique « Contrat » enregistré et ouvert par défaut, une ligne de données ; AUCUN réglage de droits, donc tous les droits.
  await page.addInitScript(() => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      // Assez long pour passer sur plusieurs pages dans les deux sens, avec un tableau pour voir la largeur de la page.
      const paras = Array.from({ length: 100 }, (_, i) => '<p>Ligne ' + i + ' du contrat de location, rédigée pour que le modèle tienne sur plusieurs pages.</p>').join('');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p>'
        + '<table><tbody><tr><td><p>Désignation</p></td><td><p>Quantité</p></td><td><p>Prix</p></td></tr></tbody></table>' + paras);
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page, dialogs };
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

// La feuille telle que la voit la personne : son rectangle à l'écran (facteur d'ajustement compris), sa largeur de mise en page (rectangle / facteur), le
// panneau qui la contient, le nombre de sauts de page tracés et le débordement horizontal de la PAGE (et non du conteneur, qui a son propre défilement).
const sheetOf = (page, scope) => page.evaluate((scope) => {
  const container = document.getElementById(scope === 'reader' ? 'reader-container' : 'editor-container');
  const sheet = scope === 'reader' ? container.querySelector('.reader-content') : container.querySelector('.v2-page-sheet');
  if (!sheet) return null;
  const r = sheet.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  const zoom = parseFloat(getComputedStyle(sheet).zoom) || 1;
  return {
    left: r.left, right: r.right, top: r.top, width: r.width, layoutWidth: r.width / zoom, zoom,
    container: { left: c.left, right: c.right, top: c.top, bottom: c.bottom, clientWidth: container.clientWidth, scrollWidth: container.scrollWidth },
    breaks: container.querySelectorAll('.v2-page-break-line').length,
    pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
    landscape: PageLayout.isLandscape(),
  };
}, scope);

// Étendue du BLANC pur de la feuille sur une ligne de vraie capture d'écran (comme dev-tests/verify-small-panel.mjs, la capture est décodée dans la page) :
// le fond de l'espace de travail autour de la feuille est gris clair ou sombre, jamais blanc pur. Une ligne dans la marge haute de la feuille (vide) donne
// ses deux bords tels qu'ils sont peints, et donc coupés si un conteneur rognait la feuille.
async function whiteExtent(page, y, x0, x1) {
  const png = await page.screenshot({ clip: { x: Math.max(0, Math.floor(x0)), y: Math.floor(y), width: Math.floor(Math.min(x1, WIDTH) - Math.max(0, x0)), height: 1 } });
  return page.evaluate(async ({ b64, offset }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, 1).data;
    let first = -1, last = -1;
    for (let x = 0; x < c.width; x++) {
      if (d[x * 4] >= 253 && d[x * 4 + 1] >= 253 && d[x * 4 + 2] >= 253) { if (first < 0) first = x; last = x; }
    }
    return first < 0 ? null : { left: first + offset, right: last + offset + 1 };
  }, { b64: png.toString('base64'), offset: Math.max(0, Math.floor(x0)) });
}

// Vrai survol : la souris rejoint le centre en quelques pas.
async function hoverBox(page, selector) {
  const b = await boxOf(page, selector);
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  return b;
}

const within = (a, b, tol) => Math.abs(a - b) <= tol;
const stored = page => page.evaluate(() => {
  const s = window.__gristStub;
  const row = s.getRow('Publipostage_Modeles', 1);
  return { margins: row.Margins, writes: s.countActions('UpdateRecord', 'Publipostage_Modeles') };
});


// Le menu Page : position, lignes (nom, dimensions, coche, grisé), et si chaque ligne est atteignable (rien ne la recouvre à son centre).
const pageMenu = page => page.evaluate(() => {
  const fly = document.getElementById('v2-page-flyout');
  const btn = document.getElementById('btn-page-orientation');
  const cs = getComputedStyle(fly);
  const r = fly.getBoundingClientRect();
  const rows = Array.from(fly.querySelectorAll('.v2-hover-row-check')).map(row => {
    const rr = row.getBoundingClientRect();
    const hit = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
    return {
      key: row.getAttribute('data-page-orientation') || row.getAttribute('data-page-format'), x: rr.left + rr.width / 2, y: rr.top + rr.height / 2, w: rr.width, h: rr.height,
      checked: row.getAttribute('aria-checked'), disabled: row.getAttribute('aria-disabled'), tab: row.tabIndex,
      hit: !!hit && (hit === row || row.contains(hit)), name: row.querySelector('.v2-page-row-name').textContent, size: (row.querySelector('.v2-page-row-size') || { textContent: '' }).textContent,
    };
  });
  return {
    display: cs.display, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, expanded: btn.getAttribute('aria-expanded'),
    title: document.getElementById('v2-page-flyout-label').textContent, rows,
    inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
  };
});

// Contraste (WCAG) du texte d'un élément contre le premier fond opaque qu'il traverse en remontant.
const contrastOf = (page, selector) => page.evaluate((sel) => {
  const nums = c => (c.match(/-?[\d.]+/g) || []).map(Number);
  const rgba = c => { const n = nums(c); return c.indexOf('color(') === 0 ? { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n.length > 3 ? n[3] : 1 } : { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const el = document.querySelector(sel);
  if (!el) return null;
  const fg = rgba(getComputedStyle(el).color);
  let node = el; let bg = { r: 255, g: 255, b: 255, a: 1 };
  while (node) { const c = rgba(getComputedStyle(node).backgroundColor); if (c.a > .99) { bg = c; break; } node = node.parentElement; }
  const a = lum(fg), b = lum(bg);
  return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), fg: getComputedStyle(el).color, bg: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')' };
}, selector);

// Survole le bouton Page, descend tout droit jusqu'à la ligne demandée (le menu reste ouvert tout du long) et clique.
async function pickRow(page, key) {
  const btn = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(btn.x - 8, btn.y - 4, { steps: 2 });
  await page.mouse.move(btn.x, btn.y, { steps: 3 });
  await page.waitForTimeout(200);
  const menu = await pageMenu(page);
  const row = menu.rows.find(r => r.key === key);
  if (!row) throw new Error('ligne introuvable : ' + key);
  await page.mouse.move(btn.x, row.y, { steps: 8 });
  await page.mouse.move(row.x, row.y, { steps: 3 });
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(1000);
  return menu;
}
const away = async (page) => { await page.mouse.move(350, 345, { steps: 6 }); await page.waitForTimeout(250); };
const inEditor = (page) => page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest && !!a.closest('.ProseMirror'); });
const formatNow = (page) => page.evaluate(() => ({ format: PageLayout.getFormat(), landscape: PageLayout.isLandscape() }));

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Formats de page à la vraie souris et au vrai clavier, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);

  // Départ : A4 portrait, Aperçu A4 allumé (vrai clic si besoin).
  const a4On = await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview'));
  if (!a4On) await realClick(page, '#v2-a4-toggle');
  await page.waitForTimeout(700);
  const start = await sheetOf(page, 'editor');
  check(`${label} - départ : A4 portrait, feuille de 793.71px de mise en page, dans le panneau (facteur ${start && start.zoom.toFixed(3)})`,
    !!start && within(start.layoutWidth, 793.71, 1) && start.left >= start.container.left - 1 && start.right <= start.container.right + 1 && start.pageOverflowX <= 0, start);

  // 1) Le survol du bouton ouvre le menu, tout entier dans le panneau.
  const btn = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(btn.x - 14, btn.y - 6, { steps: 2 });
  await page.mouse.move(btn.x, btn.y, { steps: 4 });
  await page.waitForTimeout(300);
  const open = await pageMenu(page);
  check(`${label} - le survol du bouton ouvre le menu Page sous la souris (aria-expanded « true »)`, open.display === 'flex' && open.expanded === 'true', { display: open.display, expanded: open.expanded });
  check(`${label} - le menu tient tout entier dans le panneau de ${WIDTH}x${HEIGHT} (${Math.round(open.left)}-${Math.round(open.right)} x ${Math.round(open.top)}-${Math.round(open.bottom)})`, open.inside, open);
  check(`${label} - titre « Page », puis Portrait et Paysage, puis A3 A4 A5 A6 avec leurs dimensions ; Portrait et A4 cochés`,
    open.title === 'Page' && open.rows.map(r => r.name).join('|') === 'Portrait|Paysage|A3|A4|A5|A6'
      && open.rows.filter(r => r.size).map(r => r.size).join('|') === '297 × 420 mm|210 × 297 mm|148 × 210 mm|105 × 148 mm'
      && open.rows.filter(r => r.checked === 'true').map(r => r.key).join() === 'portrait,A4', open);
  check(`${label} - chaque ligne est atteignable à la souris (rien ne la recouvre) et assez haute pour la viser (${Math.min.apply(null, open.rows.map(r => r.h)).toFixed(1)}px au moins)`,
    open.rows.every(r => r.hit && r.h >= 24 && r.w >= 120), open.rows.map(r => [r.key, r.hit, r.h, r.w]));
  const cName = await contrastOf(page, '#v2-page-flyout [data-page-format="A5"] .v2-page-row-name');
  const cSize = await contrastOf(page, '#v2-page-flyout [data-page-format="A5"] .v2-page-row-size');
  check(`${label} - contraste du nom d'une ligne (${cName && cName.ratio.toFixed(2)}:1) et de ses dimensions (${cSize && cSize.ratio.toFixed(2)}:1) : au moins 4,5:1`, !!cName && !!cSize && cName.ratio >= 4.5 && cSize.ratio >= 4.5, { cName, cSize });
  const sizeFont = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#v2-page-flyout .v2-page-row-size')).fontSize));
  check(`${label} - les dimensions ne sont pas plus petites que le titre du menu (${sizeFont}px)`, sizeFont >= 11, sizeFont);
  await page.screenshot({ path: SHOTS + '/menu-page-' + theme + '.png', clip: { x: 0, y: 0, width: WIDTH, height: 280 } });

  // 2) La souris descend jusqu'à la ligne A5 sans que le menu se referme ; un vrai clic y pose le format.
  const a5 = open.rows.find(r => r.key === 'A5');
  await page.mouse.move(btn.x, a5.y, { steps: 10 });
  await page.mouse.move(a5.x, a5.y, { steps: 4 });
  const during = await pageMenu(page);
  check(`${label} - la souris descend du bouton à la ligne A5 sans que le menu se referme`, during.display === 'flex', during.display);
  const writes0 = (await stored(page)).writes;
  await page.mouse.click(a5.x, a5.y);
  await page.waitForTimeout(1100);
  const a5Sheet = await sheetOf(page, 'editor');
  const a5Menu = await pageMenu(page);
  check(`${label} - vrai clic sur A5 : feuille de 559.37px de mise en page, entièrement dans le panneau (facteur ${a5Sheet && a5Sheet.zoom.toFixed(3)}), page sans défilement horizontal`,
    !!a5Sheet && within(a5Sheet.layoutWidth, 559.37, 1.5) && a5Sheet.left >= a5Sheet.container.left - 1 && a5Sheet.right <= a5Sheet.container.right + 1 && a5Sheet.pageOverflowX <= 0, a5Sheet);
  const a5Pixels = await whiteExtent(page, a5Sheet.top + 6, 0, WIDTH);
  check(`${label} - A5 : le blanc de la feuille peint par le navigateur a la largeur de la feuille (${a5Pixels && (a5Pixels.right - a5Pixels.left)}px pour ${a5Sheet.width.toFixed(1)}px), avec du fond de chaque côté`,
    !!a5Pixels && within(a5Pixels.right - a5Pixels.left, a5Sheet.width, 4) && a5Pixels.left > 20 && a5Pixels.right < WIDTH - 20, { a5Pixels, width: a5Sheet.width });
  check(`${label} - A5 : les sauts de page sont retracés (${start.breaks} -> ${a5Sheet.breaks}) et la ligne A5 est cochée`,
    a5Sheet.breaks > start.breaks && a5Menu.rows.filter(r => r.checked === 'true').map(r => r.key).join() === 'portrait,A5', { start: start.breaks, a5: a5Sheet.breaks, checked: a5Menu.rows.filter(r => r.checked === 'true').map(r => r.key) });

  // 3) Les textes de la barre disent le format : bouton et case Aperçu (vraie info-bulle au survol).
  const texts = await page.evaluate(() => ({ button: document.getElementById('btn-page-orientation').getAttribute('aria-label'), tip: document.getElementById('v2-a4-toggle').getAttribute('data-tip') }));
  await page.mouse.move(350, 345, { steps: 4 });
  await hoverBox(page, '#v2-a4-toggle');
  await page.waitForTimeout(900);
  const tip = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('v2-a4-toggle'), '::after'); return { content: cs.content, opacity: cs.opacity }; });
  check(`${label} - le bouton dit « ${texts.button} » et l'info-bulle de la case Aperçu, survolée, « ${tip.content.replace(/"/g, '')} »`,
    texts.button === 'Page A5 en portrait (passer en paysage)' && texts.tip === 'Aperçu A5' && /Aperçu A5/.test(tip.content) && tip.opacity === '1', { texts, tip });

  // 4) Souris partie : le menu se referme, le bouton n'a pas gardé le focus ; l'enregistrement automatique écrit le format en UNE écriture.
  await away(page);
  const closed = await pageMenu(page);
  const focusInGroup = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('#v2-page-group'));
  check(`${label} - souris partie : le menu est refermé (aria-expanded « false ») et rien du groupe Page n'a gardé le focus`, closed.display === 'none' && closed.expanded === 'false' && !focusInGroup, { closed: closed.display, expanded: closed.expanded, focusInGroup });
  await page.waitForTimeout(4200);
  const saved = await stored(page);
  const savedMargins = (() => { try { return JSON.parse(saved.margins || '{}'); } catch (e) { return null; } })();
  check(`${label} - l'enregistrement automatique écrit le format A5 (et le portrait) dans le modèle, en une seule écriture`,
    !!savedMargins && savedMargins.format === 'A5' && savedMargins.orientation === 'portrait' && saved.writes === writes0 + 1, { saved, writes0 });

  // 5) Le curseur reste dans le texte : taper, changer de format à la souris, taper encore.
  const para = await boxOf(page, '.ProseMirror p');
  await page.mouse.click(para.right - 3, para.y); await page.keyboard.press('End'); await page.keyboard.type(' ab');
  await pickRow(page, 'A3');
  const stayed = await inEditor(page);
  await page.keyboard.type('x');
  const typed = await page.evaluate(() => document.querySelector('.ProseMirror p').textContent);
  check(`${label} - après un vrai clic sur une ligne du menu, le curseur est resté dans le texte et la frappe suivante y arrive`, stayed && /ab\s?x$/.test(typed), { stayed, typed: typed.slice(-12) });
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await away(page);

  // 6) A3 : la feuille est large, le facteur d'ajustement la ramène dans le panneau ; A3 paysage tombe au plancher (0.5) et c'est le conteneur qui défile, pas la page.
  const a3 = await sheetOf(page, 'editor');
  check(`${label} - A3 portrait : feuille de 1122.52px de mise en page, ramenée dans le panneau (facteur ${a3 && a3.zoom.toFixed(3)}), page sans défilement horizontal`,
    !!a3 && within(a3.layoutWidth, 1122.52, 1.5) && a3.zoom < a5Sheet.zoom + .001 && a3.zoom >= .5 && a3.left >= a3.container.left - 1 && a3.right <= a3.container.right + 1 && a3.pageOverflowX <= 0, a3);
  await pickRow(page, 'landscape');
  await away(page);
  const a3l = await sheetOf(page, 'editor');
  check(`${label} - A3 paysage : feuille de 1587.4px de mise en page, facteur au plancher (${a3l && a3l.zoom.toFixed(3)}), le conteneur défile (${a3l && a3l.container.scrollWidth} pour ${a3l && a3l.container.clientWidth}px) mais pas la page`,
    !!a3l && within(a3l.layoutWidth, 1587.4, 2) && within(a3l.zoom, .5, .001) && a3l.container.scrollWidth > a3l.container.clientWidth && a3l.pageOverflowX <= 0, a3l);

  // 7) Lecture en A5 paysage : la feuille de la Lecture suit, repaginée comme l'éditeur.
  await pickRow(page, 'A5');
  await away(page);
  const a5l = await sheetOf(page, 'editor');
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
  await realClick(page, '#btn-mode-read');
  await page.waitForFunction(() => document.getElementById('reader-container').style.display === 'block' && !!document.querySelector('#reader-container .reader-content'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
  const reader = await sheetOf(page, 'reader');
  check(`${label} - Lecture en A5 paysage : feuille de 793.7px de mise en page, dans le panneau, repaginée comme l'éditeur (${reader && reader.breaks} sauts contre ${a5l.breaks})`,
    !!reader && within(reader.layoutWidth, 793.7, 1.5) && reader.left >= reader.container.left - 1 && reader.right <= reader.container.right + 1 && reader.pageOverflowX <= 0 && reader.breaks === a5l.breaks, { reader, editorBreaks: a5l.breaks });
  await realClick(page, '#btn-mode-edit');
  await page.waitForTimeout(900);
  const backEdit = await sheetOf(page, 'editor');
  check(`${label} - retour en Édition : toujours A5 paysage, même feuille et mêmes sauts de page`, !!backEdit && backEdit.landscape && within(backEdit.layoutWidth, a5l.layoutWidth, .5) && backEdit.breaks === a5l.breaks, { backEdit, a5l });

  // 8) Retour au départ à la souris : Portrait puis A4 redonnent exactement la feuille d'avant.
  await pickRow(page, 'portrait');
  await pickRow(page, 'A4');
  await away(page);
  const back = await sheetOf(page, 'editor');
  check(`${label} - Portrait puis A4 : exactement la feuille, le facteur et les sauts de page du départ`, !!back && !back.landscape && within(back.layoutWidth, start.layoutWidth, .5) && within(back.zoom, start.zoom, .002) && back.breaks === start.breaks, { back, start });

  // 8 bis) Un vrai clic sur le bouton lui-même tourne la page (geste d'avant le menu) ; souris partie, le menu est refermé et le bouton n'a pas gardé le focus (comme Qualité PDF).
  await realClick(page, '#btn-page-orientation');
  await page.waitForTimeout(1000);
  const turned = await formatNow(page);
  await away(page);
  const afterTurn = await pageMenu(page);
  const turnFocus = await page.evaluate(() => { const a = document.activeElement; return a && a.id ? a.id : (a ? a.tagName : null); });
  check(`${label} - vrai clic sur le bouton : la page passe en paysage en gardant le format A4 ; souris partie, le menu est refermé et le bouton n'a pas gardé le focus (${turnFocus})`,
    turned.landscape && turned.format === 'A4' && afterTurn.display === 'none' && afterTurn.expanded === 'false' && turnFocus !== 'btn-page-orientation', { turned, display: afterTurn.display, expanded: afterTurn.expanded, turnFocus });
  await realClick(page, '#btn-page-orientation');
  await page.waitForTimeout(1000);
  await away(page);
  const turnedBack = await formatNow(page);
  check(`${label} - second vrai clic : retour au portrait, format inchangé`, !turnedBack.landscape && turnedBack.format === 'A4', turnedBack);

  // 9) Clavier : Tab arrive sur le bouton (le menu s'ouvre), traverse ses six lignes puis « Filigrane… », puis quitte le menu (qui se referme) ; Entrée et Espace posent le format.
  await page.focus('#v2-toggle-a4-preview');
  const stops = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => { const a = document.activeElement; return a.id || a.getAttribute('data-page-orientation') || a.getAttribute('data-page-format') || a.className; }));
    if (i === 3) {
      // Au quatrième arrêt (A3), la ligne a un trait de focus visible.
      const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), menu: getComputedStyle(document.getElementById('v2-page-flyout')).display }; });
      check(`${label} - clavier : la ligne qui a le focus a un trait de focus visible (${ring.style} ${ring.width}px) et le menu reste ouvert`, ring.style !== 'none' && ring.width >= 2 && ring.menu === 'flex', ring);
    }
    if (stops[stops.length - 1] === 'A6') break;
  }
  check(`${label} - clavier : Tab passe du bouton Page à Portrait, Paysage, A3, A4, A5 puis A6 (${stops.join(' > ')})`, stops.join() === 'btn-page-orientation,portrait,landscape,A3,A4,A5,A6', stops);
  // Après A6 vient la ligne « Filigrane… » (menu Page, js/orientation-toggle.js), le menu reste ouvert ; Maj+Tab revient sur A6.
  await page.keyboard.press('Tab');
  const afterLast = await page.evaluate(() => ({ active: document.activeElement.id, menu: getComputedStyle(document.getElementById('v2-page-flyout')).display }));
  check(`${label} - clavier : après A6, Tab arrive sur « Filigrane… » et le menu reste ouvert`, afterLast.active === 'v2-btn-watermark' && afterLast.menu === 'flex', afterLast);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const viaEnter = await formatNow(page);
  check(`${label} - clavier, Entrée sur A6 : format A6`, viaEnter.format === 'A6' && !viaEnter.landscape, viaEnter);
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  const viaSpace = await formatNow(page);
  check(`${label} - clavier, Espace deux lignes plus haut (A4) : format A4`, viaSpace.format === 'A4' && !viaSpace.landscape, viaSpace);
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const outside = await page.evaluate(() => ({ active: document.activeElement.id, menu: getComputedStyle(document.getElementById('v2-page-flyout')).display }));
  check(`${label} - clavier : Tab hors du menu le referme (focus sur ${outside.active})`, outside.menu === 'none' && outside.active === 'v2-btn-quality', outside);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await away(page);

  // 10) Un email : le menu est grisé, dit pourquoi (français puis anglais), tient dans le panneau, et un vrai clic sur une ligne ne change rien.
  const plus = await boxOf(page, '#btn-new');
  await page.mouse.move(plus.x - 8, plus.y - 4, { steps: 2 }); await page.mouse.move(plus.x, plus.y, { steps: 3 }); await page.waitForTimeout(250);
  const emailRow = await boxOf(page, '#v2-btn-new-email');
  await page.mouse.move(plus.x, emailRow.y, { steps: 10 });
  await page.mouse.move(emailRow.x, emailRow.y, { steps: 4 });
  await page.mouse.click(emailRow.x, emailRow.y);
  await page.waitForTimeout(300);
  // Le format posé plus haut attend d'être enregistré : « Nouvel email » ouvre d'abord « Modifications non enregistrées » (retour d'Antoine du 01/10) ; le test clique « Abandonner ».
  const discard = await page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const button = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).find(b => b.textContent === 'Abandonner');
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (discard) {
    await page.mouse.move(discard.x - 10, discard.y, { steps: 2 });
    await page.mouse.click(discard.x, discard.y);
  }
  await page.waitForTimeout(700);
  await away(page);
  const onEmail = await page.evaluate(() => ({ disabled: document.getElementById('btn-page-orientation').disabled }));
  const btn2 = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(btn2.x - 8, btn2.y - 4, { steps: 2 }); await page.mouse.move(btn2.x, btn2.y, { steps: 3 }); await page.waitForTimeout(300);
  const emailMenu = await pageMenu(page);
  check(`${label} - sur un email : le bouton est grisé, le menu s'ouvre au survol, dit « ${emailMenu.title} », ses six lignes sont grisées et tiennent dans le panneau`,
    onEmail.disabled && emailMenu.display === 'flex' && /pas disponible/.test(emailMenu.title) && emailMenu.rows.length === 6 && emailMenu.rows.every(r => r.disabled === 'true' && r.tab === -1) && emailMenu.inside, emailMenu);
  const a5Email = emailMenu.rows.find(r => r.key === 'A5');
  await page.mouse.move(btn2.x, a5Email.y, { steps: 8 });
  await page.mouse.move(a5Email.x, a5Email.y, { steps: 3 });
  await page.mouse.click(a5Email.x, a5Email.y);
  await page.waitForTimeout(500);
  const emailAfter = await formatNow(page);
  check(`${label} - sur un email : un vrai clic sur la ligne A5 ne change ni le format ni le sens`, emailAfter.format === 'A4' && !emailAfter.landscape, emailAfter);
  await away(page);
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(300);
  await page.mouse.move(btn2.x - 8, btn2.y - 4, { steps: 2 }); await page.mouse.move(btn2.x, btn2.y, { steps: 3 }); await page.waitForTimeout(300);
  const englishMenu = await pageMenu(page);
  check(`${label} - en anglais : « ${englishMenu.title} », Portrait / Landscape, le menu tient dans le panneau`, englishMenu.title === 'Page (not available for this template)' && englishMenu.rows.slice(0, 2).map(r => r.name).join('|') === 'Portrait|Landscape' && englishMenu.inside, englishMenu);
  await away(page);
  await page.evaluate(() => I18n.setLang('fr'));

  // 11) Un macro-modèle a son bouton Page : le menu est actif, un vrai clic y pose le sens et le format (Paysage puis A5), la Lecture suit, et l'enregistrement automatique les écrit dans SA ligne,
  // composition intacte. Le macro-modèle est posé par la page (rien à tester dans sa création : sa fenêtre est couverte par macroModeles) puis ouvert par la liste ; chaque geste qui suit est réel.
  const macroId = await page.evaluate(async () => {
    const cover = Templates.getCached().find(t => t.nom === 'Contrat');
    const saved = await Templates.save(null, 'Dossier', JSON.stringify({ slots: [{ type: 'fixed', modeleId: cover.id }] }), '', null, null, 'macro', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    const option = document.createElement('option'); option.value = String(saved.id); option.textContent = 'Dossier'; select.appendChild(option);
    select.value = String(saved.id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return saved.id;
  });
  await page.waitForTimeout(1000);
  const macroRowNow = () => page.evaluate((id) => { const r = window.__gristStub.getRow('Publipostage_Modeles', id); return { margins: r.Margins, contenu: r.Contenu }; }, macroId);
  const macroBefore = await macroRowNow();
  const onMacro = await page.evaluate(() => ({ disabled: document.getElementById('btn-page-orientation').disabled, summary: getComputedStyle(document.getElementById('macro-summary-container')).display,
    editor: getComputedStyle(document.getElementById('editor-container')).display }));
  const macroBtn = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(macroBtn.x - 8, macroBtn.y - 4, { steps: 2 }); await page.mouse.move(macroBtn.x, macroBtn.y, { steps: 3 }); await page.waitForTimeout(300);
  const macroMenu = await pageMenu(page);
  check(`${label} - sur un macro-modèle (résumé affiché, éditeur masqué) : le bouton est actif, le menu s'ouvre au survol, dit « ${macroMenu.title} », ses six lignes sont actives, atteignables et tiennent dans le panneau ; Portrait et A4 cochés`,
    !onMacro.disabled && onMacro.summary !== 'none' && onMacro.editor === 'none' && macroMenu.display === 'flex' && macroMenu.title === 'Page' && macroMenu.rows.length === 6
      && macroMenu.rows.every(r => r.disabled === 'false' && r.tab === 0 && r.hit && r.h >= 24) && macroMenu.inside && macroMenu.rows.filter(r => r.checked === 'true').map(r => r.key).join() === 'portrait,A4', { onMacro, macroMenu });
  await away(page);
  const macroWrites0 = await page.evaluate(() => window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles'));
  await pickRow(page, 'landscape');
  await pickRow(page, 'A5');
  await away(page);
  const macroChosen = await page.evaluate(() => ({ landscape: PageLayout.isLandscape(), format: PageLayout.getFormat(), pressed: document.getElementById('btn-page-orientation').getAttribute('aria-pressed'),
    label: document.getElementById('btn-page-orientation').getAttribute('aria-label'), checked: Array.from(document.querySelectorAll('#v2-page-flyout .v2-hover-row-check')).filter(r => r.getAttribute('aria-checked') === 'true')
      .map(r => r.getAttribute('data-page-orientation') || r.getAttribute('data-page-format')).join() }));
  check(`${label} - macro-modèle : un vrai clic sur Paysage puis sur A5 pose A5 paysage (bouton allumé, « ${macroChosen.label} »), sans ouvrir l'éditeur`,
    macroChosen.landscape && macroChosen.format === 'A5' && macroChosen.pressed === 'true' && macroChosen.checked === 'landscape,A5' && macroChosen.label === 'Page A5 en paysage (passer en portrait)'
      && (await page.evaluate(() => getComputedStyle(document.getElementById('editor-container')).display)) === 'none', macroChosen);
  await page.waitForTimeout(4200);
  const macroAfter = await macroRowNow();
  const macroSavedMargins = (() => { try { return JSON.parse(macroAfter.margins || '{}'); } catch (e) { return null; } })();
  const macroWrites1 = await page.evaluate(() => window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles'));
  check(`${label} - macro-modèle : l'enregistrement automatique écrit A5 paysage dans sa ligne, en une écriture, et sa composition reste exactement la même`,
    !!macroSavedMargins && macroSavedMargins.orientation === 'landscape' && macroSavedMargins.format === 'A5' && macroAfter.contenu === macroBefore.contenu && macroWrites1 === macroWrites0 + 1, { macroAfter, macroBefore: macroBefore.margins, macroWrites0, macroWrites1 });
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
  await realClick(page, '#btn-mode-read');
  await page.waitForFunction(() => document.getElementById('reader-container').style.display === 'block' && !!document.querySelector('#reader-container .reader-content'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
  const macroReader = await sheetOf(page, 'reader');
  check(`${label} - Lecture du macro-modèle en A5 paysage : feuille de 793.7px de mise en page, dans le panneau (facteur ${macroReader && macroReader.zoom.toFixed(3)}), page sans défilement horizontal`,
    !!macroReader && within(macroReader.layoutWidth, 793.7, 1.5) && macroReader.left >= macroReader.container.left - 1 && macroReader.right <= macroReader.container.right + 1 && macroReader.pageOverflowX <= 0, macroReader);
  await realClick(page, '#btn-mode-edit');
  await page.waitForTimeout(700);
  const macroBack = await page.evaluate(() => ({ summary: getComputedStyle(document.getElementById('macro-summary-container')).display, editor: getComputedStyle(document.getElementById('editor-container')).display,
    pressed: document.getElementById('btn-page-orientation').getAttribute('aria-pressed') }));
  check(`${label} - retour en Édition : le résumé du macro-modèle est affiché (pas l'éditeur) et le bouton Page reste allumé`, macroBack.summary !== 'none' && macroBack.editor === 'none' && macroBack.pressed === 'true', macroBack);
  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
