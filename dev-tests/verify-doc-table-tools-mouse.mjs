#!/usr/bin/env node
// Bordures, alignement vertical et quadrillage dans la barre du tableau d'un DOCUMENT (js/floating-toolbars.js ; Antoine, 09/10 : « le module d'insertion de tableau d'un doc classique est en fait un
// tableau du mode grille », lot 3 sur 6) à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), à la taille du panneau Grist (~700x400), en thème clair puis sombre.
// Une page.evaluate ne déclenche ni un appui « trusted », ni le survol, ni le glissé : c'est ici qu'on s'assure que
//   - la barre flottante du tableau porte ses 15 boutons sur une seule ligne, entière dans le panneau, avec « Bordures » après « Fond » et les trois alignements verticaux à la fin ;
//   - les trois alignements placent vraiment le texte de la case en haut, au milieu ou en bas de sa case (mesure à l'écran), pour les cases glissées comme pour une seule, le bouton de la case
//     visée est enfoncé, « en haut » (l'état d'une case que personne n'a réglée) efface la marque ;
//   - « Bordures » ouvre son menu entier dans le panneau (il glisse le long de son bouton dans 400 px et en laisse de quoi le refermer), choisir la couleur du trait ne le referme pas, ne le
//     déplace pas et laisse la barre affichée, « Personnalisé… » le rouvre à la même place, un réglage trace les traits sur les cases glissées ET sur les cases voisines qui les partagent (trait
//     dessiné une fois), en un seul Ctrl+Z ; « Aucune bordure » masque le trait ; « Quadrillage » se coche sans refermer le menu ;
//   - avec le suivi des modifications, les quatre boutons sont grisés (jamais retirés, survol gardé pour l'info-bulle, raison : le suivi) et un clic dessus ne fait rien, puis ils se dégrisent ;
//   - dans un panneau plus étroit que la barre (420 px), elle passe à la ligne : aucun de ses boutons n'est hors du panneau et le dernier se clique.
//   Un glissé qui part d'une case déjà choisie déplace le texte choisi (c'est le navigateur) : le script repart toujours d'un simple curseur dans une case à l'écart.
// Les fonctions, leurs gardes, le tableau dans une case, le Word, la structure (lignes en nombre, fusion) sont dans dev-tests/scenarios-grid-in-document.js (groupe gridInDocument) ; les
// boutons un à un dans dev-tests/scenarios-floating-toolbars.js (groupe floatingToolbars).
// Lancé par run-headless.mjs (groupe Node « docTableToolsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-doc-table-tools-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.DOC_TABLE_TOOLS_MOUSE_PORT || 8973);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-grid-cells-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
].filter(([, rel]) => rel !== 'umd/exceljs.min.js' || existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[verify-doc-table-tools-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function openWidget(colorScheme, size = { width: WIDTH, height: HEIGHT }) {
  const context = await browser.newContext({ bypassCSP: true, viewport: size, colorScheme });
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
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page };
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
  await page.waitForTimeout(150);
  return b;
}

// Vrai geste à un point précis de l'écran (le bas d'un bouton peut être sous un menu : on clique la part qui reste à découvert).
async function realClickAt(page, x, y) {
  await page.mouse.move(x - 6, y, { steps: 2 });
  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.click(x, y);
  await page.waitForTimeout(150);
}

// Le centre de la case dont le texte est exactement `text` (une case fusionnée se retrouve par son premier paragraphe).
const cellPoint = (page, text) => page.evaluate((wanted) => {
  const td = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).find(c => c.querySelector('p') && c.querySelector('p').textContent === wanted);
  if (!td) return null;
  const r = td.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, text);

// Le centre de la case de la ligne `r` et de la colonne `c` (depuis 1) d'un tableau encore sans fusion.
const slotPoint = (page, r, c) => page.evaluate(([row, col]) => {
  const td = document.querySelector(`.tiptap table > tbody > tr:nth-child(${row}) > td:nth-child(${col})`);
  if (!td) return null;
  const b = td.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, [r, c]);
async function clickCell(page, at) {
  const p = Array.isArray(at) ? await slotPoint(page, at[0], at[1]) : await cellPoint(page, at);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
}
// Appuie sur la case `from`, glisse sur la case `to`, relâche : une sélection de cases.
async function dragCells(page, from, to) {
  const a = Array.isArray(from) ? await slotPoint(page, from[0], from[1]) : await cellPoint(page, from);
  const b = Array.isArray(to) ? await slotPoint(page, to[0], to[1]) : await cellPoint(page, to);
  await page.mouse.move(a.x, a.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

// Les cases du premier tableau : forme, texte (un élément par paragraphe), largeur enregistrée, et leur rectangle à l'écran.
const cellsOf = page => page.evaluate(() => {
  const out = [];
  const rows = Array.from(document.querySelectorAll('.tiptap table > tbody > tr'));
  rows.forEach((tr, r) => Array.from(tr.children).forEach((td) => {
    const b = td.getBoundingClientRect();
    out.push({ row: r, text: td.textContent, paragraphs: Array.from(td.querySelectorAll(':scope > p')).map(p => p.textContent), colspan: td.colSpan, rowspan: td.rowSpan, left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width });
  }));
  return out;
});
const selectedCount = page => page.evaluate(() => document.querySelectorAll('.tiptap td.selectedCell, .tiptap th.selectedCell').length);
const byText = (cells, text) => cells.find(c => c.paragraphs[0] === text) || null;
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
const sameRect = (a, b, tolerance = 1.5) => !!a && !!b && near(a.left, b.left, tolerance) && near(a.top, b.top, tolerance) && near(a.right, b.right, tolerance) && near(a.bottom, b.bottom, tolerance);


// Contraste WCAG de deux couleurs CSS « rgb(...) ».
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

const BAR = '.v2-floating-toolbar.visible';
const button = action => `${BAR} button[data-action="${action}"]`;
// Chaque bouton de la barre du tableau : visible, grisé, info-bulle, entier dans le panneau ; l'ordre (de gauche à droite) et la hauteur de la barre.
const barState = page => page.evaluate((sel) => {
  const bar = document.querySelector(sel);
  if (!bar) return null;
  const buttons = {};
  const order = [];
  bar.querySelectorAll('button[data-action]').forEach(b => {
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    const shown = cs.display !== 'none' && r.width > 0;
    if (shown) order.push([r.left, b.dataset.action]);
    buttons[b.dataset.action] = {
      shown, disabled: b.classList.contains('is-disabled'), aria: b.getAttribute('aria-disabled'), title: b.title, opacity: Number(cs.opacity), pointer: cs.pointerEvents, color: cs.color,
      active: b.classList.contains('is-active'), pressed: b.getAttribute('aria-pressed'), expanded: b.getAttribute('aria-expanded'), rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
    };
  });
  order.sort((a, b) => a[0] - b[0]);
  const r = bar.getBoundingClientRect();
  return { buttons, order: order.map(o => o[1]), height: r.height, background: getComputedStyle(bar).backgroundColor, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
}, BAR);


// Un document : un paragraphe, un tableau 3 lignes x 3 colonnes aux largeurs réglées (140, 190 et 120 px), un paragraphe. La case A2 porte quatre lignes : la 2e ligne du tableau est haute, B2 et
// C2 (une seule ligne de texte) ont la place de s'aligner en haut, au milieu ou en bas.
const DOC = '<p>Avant le tableau</p><table><tbody>'
  + '<tr><td colwidth="140"><p>A1</p></td><td colwidth="190"><p>B1</p></td><td colwidth="120"><p>C1</p></td></tr>'
  + '<tr><td colwidth="140"><p>A2</p><p>haut</p><p>de</p><p>case</p></td><td colwidth="190"><p>B2</p></td><td colwidth="120"><p>C2</p></td></tr>'
  + '<tr><td colwidth="140"><p>A3</p></td><td colwidth="190"><p>B3</p></td><td colwidth="120"><p>C3</p></td></tr>'
  + '</tbody></table><p>Après le tableau</p>';
const ORDER = ['row-before', 'row-after', 'row-del', 'col-before', 'col-after', 'col-del', 'table-del', 'cell-merge', 'cell-split', 'caption', 'fill-open', 'borders-open', 'valign-top', 'valign-middle', 'valign-bottom'];
const VALIGNS = ['valign-top', 'valign-middle', 'valign-bottom'];
const SETTINGS = ['borders-open', ...VALIGNS];
const MENU = '.v2-borders-dropdown.visible';

// Les écarts entre le texte d'une case et ses bords haut et bas : en haut = grand écart dessous, en bas = grand écart dessus, au milieu = deux écarts égaux.
const gapsOf = (page, text) => page.evaluate((wanted) => {
  const td = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).find(c => c.querySelector('p') && c.querySelector('p').textContent === wanted);
  if (!td) return null;
  const cell = td.getBoundingClientRect();
  const paragraphs = td.querySelectorAll(':scope > p');
  const first = paragraphs[0].getBoundingClientRect();
  const last = paragraphs[paragraphs.length - 1].getBoundingClientRect();
  return { gapTop: first.top - cell.top, gapBottom: cell.bottom - last.bottom, height: cell.height };
}, text);
// Le trait que le navigateur dessine d'un côté d'une case (couleur, style, épaisseur).
const borderOf = (page, text, side) => page.evaluate(([wanted, name]) => {
  const td = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).find(c => c.querySelector('p') && c.querySelector('p').textContent === wanted);
  if (!td) return null;
  const cs = getComputedStyle(td);
  return { color: cs['border' + name + 'Color'], style: cs['border' + name + 'Style'], width: parseFloat(cs['border' + name + 'Width']) };
}, [text, side]);
const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
const sidesOf = async (page, texts) => {
  const out = {};
  for (const text of texts) for (const side of SIDES) out[text + '.' + side.toLowerCase()] = await borderOf(page, text, side);
  return out;
};
const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
const isPen = (line, rgb) => !!line && line.color === rgb && line.style === 'solid' && line.width >= 1;
const sameLine = (a, b) => !!a && !!b && a.color === b.color && a.style === b.style && a.width === b.width;
const htmlOf = page => page.evaluate(() => Editor.getHTML());
// Le menu « Bordures » : ouvert ? entier dans le panneau ? sans recouvrir son bouton ?
const menuState = page => page.evaluate((sel) => {
  const menu = document.querySelector(sel);
  const chip = document.getElementById('v2-table-borders-btn');
  if (!menu || !chip) return null;
  const r = menu.getBoundingClientRect();
  const c = chip.getBoundingClientRect();
  const row = menu.querySelector('button[data-action="gridlines"]');
  return {
    left: r.left, top: r.top, right: r.right, bottom: r.bottom, height: r.height,
    inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
    // La part du bouton que le menu ne recouvre pas (px de haut) et le point où la souris l'atteint : dans un panneau de 400 px le menu glisse le long de son bouton pour tenir
    // tout entier (js/color-palette.js:fitInWindow), il peut en couvrir le bas, jamais tout.
    chipFree: (r.right <= c.left || r.left >= c.right) ? c.height : Math.max(0, r.top >= c.top ? Math.min(c.bottom, r.top) - c.top : c.bottom - Math.max(c.top, r.bottom)),
    chipPoint: { x: c.left + c.width / 2, y: r.top >= c.top ? c.top + Math.max(0, Math.min(c.bottom, r.top) - c.top) / 2 : c.bottom - Math.max(0, c.bottom - Math.max(c.top, r.bottom)) / 2 },
    presets: menu.querySelectorAll('.v2-borders-presets button').length, gridlines: row ? row.getAttribute('aria-checked') : null, expanded: chip.getAttribute('aria-expanded'),
  };
}, MENU);
const chipExpanded = page => page.evaluate(() => document.getElementById('v2-table-borders-btn').getAttribute('aria-expanded'));

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Bordures et alignement vertical d'un tableau de document à la souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);
  await page.evaluate(html => { GridEditor.setActive(false); Editor.setHTML(html); const box = document.getElementById('editor-container'); box.scrollTop = 0; }, DOC);
  await page.waitForTimeout(500);
  const gap = async () => { await page.waitForTimeout(700); };

  // ---------- 1) La barre, curseur dans une case ----------
  await clickCell(page, 'B2');
  let bar = await barState(page);
  check(`${label} - la barre du tableau porte ses 15 boutons dans l'ordre Lignes, Colonnes, Tableau, Fusion, Légende, Fond, Bordures, Alignements, sur une seule ligne, entière dans le panneau`,
    !!bar && bar.order.join() === ORDER.join() && bar.inside && bar.height <= 40 && ORDER.every(a => bar.buttons[a].inside), { order: bar && bar.order, height: bar && bar.height, inside: bar && bar.inside });
  check(`${label} - « Bordures » et les trois alignements sont là, libres (ni grisés ni atténués), avec leur info-bulle ; une case que personne n'a réglée se lit « en haut »`,
    !!bar && SETTINGS.every(a => bar.buttons[a].shown && !bar.buttons[a].disabled && bar.buttons[a].opacity > 0.9) && bar.buttons['borders-open'].title === 'Bordures'
    && bar.buttons['valign-top'].title === 'Aligner en haut' && bar.buttons['valign-middle'].title === 'Aligner au milieu' && bar.buttons['valign-bottom'].title === 'Aligner en bas'
    && bar.buttons['valign-top'].active && bar.buttons['valign-top'].pressed === 'true' && !bar.buttons['valign-middle'].active && !bar.buttons['valign-bottom'].active, bar && SETTINGS.map(a => bar.buttons[a]));
  const contrast = await page.evaluate(([bg, selectors]) => selectors.map(sel => window.__ratio(getComputedStyle(document.querySelector(sel)).color, bg)), [bar && bar.background, [button('borders-open'), button('valign-middle')]]);
  check(`${label} - les icônes de « Bordures » et de l'alignement se lisent sur la barre (contraste ≥ 3:1) : ${contrast.map(c => Math.round(c * 100) / 100).join(' et ')}`, contrast.every(c => c >= 3), contrast);

  // ---------- 2) Alignement vertical ----------
  const start = await gapsOf(page, 'B2');
  check(`${label} - B2 (texte d'une ligne dans une ligne haute) part en haut : peu d'écart dessus, beaucoup dessous (${Math.round(start.gapTop)} et ${Math.round(start.gapBottom)} px)`, start.gapTop < 12 && start.gapBottom > 40, start);
  await realClick(page, button('valign-bottom'));
  const down = await gapsOf(page, 'B2');
  bar = await barState(page);
  const c2 = await gapsOf(page, 'C2');
  check(`${label} - « Aligner en bas » (vrai clic) met le texte de B2 au bas de sa case (${Math.round(down.gapTop)} et ${Math.round(down.gapBottom)} px), la case voisine C2 ne bouge pas, le bouton du bas est enfoncé`,
    down.gapBottom < 12 && down.gapTop > 40 && c2.gapTop < 12 && !!bar && bar.buttons['valign-bottom'].active && bar.buttons['valign-bottom'].pressed === 'true' && !bar.buttons['valign-top'].active && !bar.buttons['valign-middle'].active, { down, c2 });
  await realClick(page, button('valign-middle'));
  const mid = await gapsOf(page, 'B2');
  bar = await barState(page);
  check(`${label} - « Aligner au milieu » centre le texte (${Math.round(mid.gapTop)} et ${Math.round(mid.gapBottom)} px) et allume le bouton du milieu seul`,
    Math.abs(mid.gapTop - mid.gapBottom) <= 3 && mid.gapTop > 20 && !!bar && bar.buttons['valign-middle'].active && !bar.buttons['valign-top'].active && !bar.buttons['valign-bottom'].active, { mid, bar: bar && VALIGNS.map(a => bar.buttons[a].active) });
  await realClick(page, button('valign-top'));
  const up = await gapsOf(page, 'B2');
  bar = await barState(page);
  const html = await htmlOf(page);
  check(`${label} - « Aligner en haut » ramène le texte en haut, allume le bouton du haut et efface la marque : le HTML du tableau n'a plus aucun alignement`,
    up.gapTop < 12 && up.gapBottom > 40 && !!bar && bar.buttons['valign-top'].active && !/data-valign|vertical-align/.test(html), { up, html: html.slice(0, 200) });
  await dragCells(page, 'B2', 'C2');
  await realClick(page, button('valign-bottom'));
  const both = [await gapsOf(page, 'B2'), await gapsOf(page, 'C2'), await gapsOf(page, 'B3')];
  bar = await barState(page);
  check(`${label} - deux cases glissées (B2 et C2) : « Aligner en bas » les met toutes deux en bas, la ligne d'en dessous (B3) ne change pas, le bouton du bas est enfoncé`,
    (await selectedCount(page)) === 2 && both[0].gapBottom < 12 && both[1].gapBottom < 12 && both[2].gapTop < 12 && !!bar && bar.buttons['valign-bottom'].active, { selected: await selectedCount(page), both });
  await clickCell(page, 'B1');
  bar = await barState(page);
  check(`${label} - le curseur passe sur une case non réglée (B1) : « Aligner en haut » est de nouveau le bouton enfoncé`, !!bar && bar.buttons['valign-top'].active && !bar.buttons['valign-bottom'].active, bar && VALIGNS.map(a => bar.buttons[a].active));
  await dragCells(page, 'B1', 'B2');
  bar = await barState(page);
  check(`${label} - deux cases d'alignements différents (B1 en haut, B2 en bas) : aucun bouton n'est enfoncé`, !!bar && VALIGNS.every(a => !bar.buttons[a].active && bar.buttons[a].pressed !== 'true'), bar && VALIGNS.map(a => [bar.buttons[a].active, bar.buttons[a].pressed]));
  // Un glissé qui part d'une case déjà choisie est un glissé du contenu choisi (le navigateur déplace le texte) : on repart d'un simple curseur dans une case à l'écart.
  await gap();
  await clickCell(page, 'A3');
  await dragCells(page, 'B2', 'C2');
  await realClick(page, button('valign-top'));

  // ---------- 3) Bordures ----------
  await gap();
  await clickCell(page, 'A3');
  await dragCells(page, 'B2', 'C3');
  const cells = ['B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3'];
  const base = await sidesOf(page, cells);
  await realClick(page, button('borders-open'));
  let menu = await menuState(page);
  check(`${label} - « Bordures » (vrai clic) ouvre le menu : huit réglages, « Quadrillage » coché, entier dans le panneau (${menu ? Math.round(menu.height) : '?'} px de haut) ; le bouton annonce « ouvert » et en laisse au moins 8 px à découvert pour refermer le menu (${menu ? Math.round(menu.chipFree) : '?'} px)`,
    !!menu && menu.presets === 8 && menu.gridlines === 'true' && menu.inside && menu.chipFree >= 8 && menu.expanded === 'true' && (await selectedCount(page)) === 4, menu);
  const opened = menu;
  const penAction = await page.evaluate((sel) => { const swatches = Array.from(document.querySelectorAll(sel + ' .cp-grid button[data-action^="pen:"]')); return swatches.length ? swatches[swatches.length - 1].dataset.action : null; }, MENU);
  const pen = penAction ? hexToRgb(penAction.slice('pen:'.length)) : null;
  await realClick(page, `${MENU} button[data-action="${penAction}"]`);
  menu = await menuState(page);
  check(`${label} - choisir la couleur du trait ne referme pas le menu, qui ne bouge pas, et la barre du tableau reste affichée (un appui dans le menu n'est pas un appui hors de la barre)`,
    !!penAction && !!menu && !!opened && menu.left === opened.left && menu.top === opened.top && (await page.evaluate((sel) => !!document.querySelector(sel), BAR)), { penAction, opened, menu });
  await realClick(page, `${MENU} button[data-action="borders:outer"]`);
  check(`${label} - « Bordures extérieures » referme le menu`, (await menuState(page)) === null && (await chipExpanded(page)) === 'false');
  let now = await sidesOf(page, cells);
  const outer = [['B2', 'top'], ['B2', 'left'], ['C2', 'top'], ['C2', 'right'], ['B3', 'bottom'], ['B3', 'left'], ['C3', 'bottom'], ['C3', 'right']];
  check(`${label} - les huit côtés du pourtour de B2:C3 sont tracés dans la couleur choisie (${penAction}), de 1 px au moins`, !!pen && outer.every(([t, s]) => isPen(now[t + '.' + s], pen)), outer.map(([t, s]) => [t, s, now[t + '.' + s]]));
  const shared = [['A2', 'right'], ['A3', 'right'], ['B1', 'bottom'], ['C1', 'bottom']];
  check(`${label} - les cases voisines qui partagent ces traits (A2, A3 à gauche ; B1, C1 au-dessus) les portent aussi : un seul trait, dessiné pareil des deux côtés`, !!pen && shared.every(([t, s]) => isPen(now[t + '.' + s], pen)), shared.map(([t, s]) => [t, s, now[t + '.' + s]]));
  const inner = [['B2', 'right'], ['B2', 'bottom'], ['C2', 'left'], ['C2', 'bottom'], ['B3', 'right'], ['B3', 'top'], ['C3', 'left'], ['C3', 'top']];
  check(`${label} - l'intérieur (entre les quatre cases) et les côtés extérieurs au bloc gardent le trait de départ`, inner.every(([t, s]) => sameLine(now[t + '.' + s], base[t + '.' + s])) && ['A2.left', 'A3.bottom', 'B1.top', 'C1.right'].every(k => sameLine(now[k], base[k])), inner.map(([t, s]) => [t, s, now[t + '.' + s], base[t + '.' + s]]));
  await gap();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  now = await sidesOf(page, cells);
  check(`${label} - un seul Ctrl+Z défait tout le réglage : tous les côtés reprennent leur trait de départ, aucune marque dans le HTML`, cells.every(t => SIDES.every(s => sameLine(now[t + '.' + s.toLowerCase()], base[t + '.' + s.toLowerCase()]))) && !/data-border/.test(await htmlOf(page)));

  // « Personnalisé… » : la fenêtre de couleur remplace le menu, puis le menu revient sur son bouton, la barre du tableau et la sélection de cases aussi.
  await realClick(page, button('borders-open'));
  await realClick(page, `${MENU} button[data-action="pen-custom"]`);
  const dialog = await page.evaluate(() => {
    const modal = document.getElementById('pp-color-modal');
    const box = modal && modal.querySelector('.pp-modal-box');
    const r = box ? box.getBoundingClientRect() : null;
    const hex = document.getElementById('pp-color-hex');
    return {
      shown: !!modal && getComputedStyle(modal).display !== 'none', menuOpen: !!document.querySelector('.v2-borders-dropdown.visible'), focused: !!hex && document.activeElement === hex,
      inside: !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    };
  });
  check(`${label} - « Personnalisé… » ferme le menu et ouvre la fenêtre de couleur, tout entière dans le panneau, le champ du code au clavier`, dialog.shown && !dialog.menuOpen && dialog.focused && dialog.inside, dialog);
  await page.keyboard.type('ff8800');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  menu = await menuState(page);
  bar = await barState(page);
  check(`${label} - Entrée applique : la fenêtre se ferme, la barre du tableau est de retour et le menu rouvert reprend sa place sur son bouton, les quatre cases restent choisies`,
    !!menu && !!opened && menu.left === opened.left && menu.top === opened.top && menu.inside && menu.chipFree >= 8 && menu.expanded === 'true' && !!bar && bar.inside && (await selectedCount(page)) === 4
    && !(await page.evaluate(() => getComputedStyle(document.getElementById('pp-color-modal')).display !== 'none')), { opened, menu });
  await realClick(page, `${MENU} button[data-action="borders:outer"]`);
  now = await sidesOf(page, cells);
  const orange = hexToRgb('#ff8800');
  check(`${label} - la couleur composée est celle du stylo : le pourtour de B2:C3 est tracé en orange`, outer.every(([t, s]) => isPen(now[t + '.' + s], orange)), outer.map(([t, s]) => [t, s, now[t + '.' + s]]));
  await gap();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);

  await realClick(page, button('borders-open'));
  await realClick(page, `${MENU} button[data-action="borders:none"]`);
  now = await sidesOf(page, cells);
  const hidden = [['B2', 'top'], ['B2', 'left'], ['B2', 'right'], ['B2', 'bottom'], ['C3', 'right'], ['C3', 'bottom'], ['A2', 'right'], ['A3', 'right'], ['B1', 'bottom']];
  check(`${label} - « Aucune bordure » masque tous les traits du bloc (pourtour et intérieur) et ceux que les voisines partagent`, hidden.every(([t, s]) => now[t + '.' + s].style === 'hidden'), hidden.map(([t, s]) => [t, s, now[t + '.' + s].style]));
  await gap();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  now = await sidesOf(page, cells);
  check(`${label} - Ctrl+Z rend les traits`, cells.every(t => SIDES.every(s => sameLine(now[t + '.' + s.toLowerCase()], base[t + '.' + s.toLowerCase()]))));

  // « Quadrillage » : la coche, sans refermer le menu ; l'éditeur garde son quadrillage.
  await realClick(page, button('borders-open'));
  await realClick(page, `${MENU} button[data-action="gridlines"]`);
  menu = await menuState(page);
  now = await sidesOf(page, cells);
  const offHtml = await htmlOf(page);
  check(`${label} - « Quadrillage » décoché (vrai clic) : le menu reste ouvert, la case se décoche, le tableau le garde (data-grid-lines="off") ; l'éditeur, lui, dessine toujours ses traits`,
    !!menu && menu.gridlines === 'false' && /<table[^>]*data-grid-lines="off"/.test(offHtml) && cells.every(t => SIDES.every(s => sameLine(now[t + '.' + s.toLowerCase()], base[t + '.' + s.toLowerCase()]))), { menu, html: offHtml.slice(0, 160) });
  await gap();
  await realClick(page, `${MENU} button[data-action="gridlines"]`);
  menu = await menuState(page);
  check(`${label} - « Quadrillage » recoché : la marque disparaît du HTML`, !!menu && menu.gridlines === 'true' && !/data-grid-lines/.test(await htmlOf(page)), menu);
  const reach = menu ? menu.chipPoint : (await boxOf(page, button('borders-open')));
  await realClickAt(page, reach.x, reach.y);
  check(`${label} - un second clic sur la part du bouton « Bordures » que le menu laisse à découvert referme le menu`, (await menuState(page)) === null && (await chipExpanded(page)) === 'false');

  // ---------- 4) Le suivi des modifications grise les quatre boutons ----------
  await clickCell(page, 'B2');
  await realClick(page, '#v2-btn-track-changes');
  await page.waitForTimeout(200);
  const tracking = await page.evaluate(() => Editor.isTrackChangesOn());
  await clickCell(page, 'B2');
  bar = await barState(page);
  const REASON = 'Indisponible avec le suivi des modifications : ce réglage ne serait pas suivi';
  check(`${label} - suivi des modifications allumé : « Bordures » et les trois alignements sont grisés (visibles, atténués, survol gardé) avec la raison pour info-bulle, aucun alignement n'est enfoncé`,
    tracking && !!bar && SETTINGS.every(a => bar.buttons[a].shown && bar.buttons[a].disabled && bar.buttons[a].aria === 'true' && bar.buttons[a].opacity < 0.5 && bar.buttons[a].pointer !== 'none' && bar.buttons[a].title === REASON)
    && VALIGNS.every(a => !bar.buttons[a].active), { tracking, bar: bar && SETTINGS.map(a => bar.buttons[a]) });
  const tracked = await htmlOf(page);
  await realClick(page, button('valign-bottom'));
  await realClick(page, button('borders-open'));
  check(`${label} - un clic sur un bouton grisé ne fait rien : le menu ne s'ouvre pas, le document ne change pas, aucune modification n'est proposée`,
    (await menuState(page)) === null && (await htmlOf(page)) === tracked && !(await page.evaluate(() => Editor.hasPendingTrackedChanges())), (await menuState(page)));
  await realClick(page, '#v2-btn-track-changes');
  await page.waitForTimeout(250);
  await clickCell(page, 'B2');
  bar = await barState(page);
  check(`${label} - le suivi éteint, les quatre boutons reprennent leur libellé et leur éclat`,
    !(await page.evaluate(() => Editor.isTrackChangesOn())) && !!bar && SETTINGS.every(a => !bar.buttons[a].disabled && bar.buttons[a].opacity > 0.9) && bar.buttons['borders-open'].title === 'Bordures' && bar.buttons['valign-bottom'].title === 'Aligner en bas',
    bar && SETTINGS.map(a => [bar.buttons[a].disabled, bar.buttons[a].title]));

  await context.close();
}

// Un panneau plus étroit que la barre (quinze boutons, ~460 px) : elle passe à la ligne, aucun bouton n'est hors du panneau, le dernier (« Aligner en bas ») se clique.
async function runNarrow() {
  const NARROW = 420;
  console.log(`\n=== La barre d'un tableau de document dans un panneau étroit, ${NARROW}x${HEIGHT} ===`);
  const { context, page } = await openWidget('light', { width: NARROW, height: HEIGHT });
  await page.evaluate(html => { GridEditor.setActive(false); Editor.setHTML(html); const box = document.getElementById('editor-container'); box.scrollTop = 0; }, DOC);
  await page.waitForTimeout(500);
  await clickCell(page, 'B2');
  const bar = await barState(page);
  const tops = bar ? Array.from(new Set(ORDER.map(a => Math.round(bar.buttons[a].rect.top)))) : [];
  check(`étroit - la barre passe à la ligne : ses 15 boutons sont tous visibles et entiers dans le panneau de ${NARROW} px, sur deux lignes au plus (${tops.length})`,
    !!bar && bar.inside && ORDER.every(a => bar.buttons[a].shown && bar.buttons[a].inside) && tops.length >= 2 && tops.length <= 2, { inside: bar && bar.inside, tops, hidden: bar && ORDER.filter(a => !bar.buttons[a].inside) });
  await realClick(page, button('valign-bottom'));
  const down = await gapsOf(page, 'B2');
  check('étroit - le dernier bouton (« Aligner en bas ») se clique à la vraie souris : le texte de B2 passe au bas de sa case', !!down && down.gapBottom < 12 && down.gapTop > down.gapBottom + 20, down);
  await context.close();
}

await runTheme('light');
await runTheme('dark');
await runNarrow();
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
