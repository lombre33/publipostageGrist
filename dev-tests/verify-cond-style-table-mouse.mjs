#!/usr/bin/env node
// Mise en forme conditionnelle d'une case ou d'une ligne de tableau (demande d'Antoine du 2026-11-06 ; ses choix du 2026-11-07 : « Case et ligne », « Document et Grille ensemble », petit repère
// dans l'éditeur) à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en clair, en sombre et en anglais.
// dev-tests/scenarios-cond-style-table.js vérifie la logique DANS la page ; ici, ce que seule une vraie souris prouve :
//  - la barre du tableau, avec son bouton de plus, tient dans le panneau (document) ou dans sa bande (grille) et le bouton est au premier plan ;
//  - le bouton ouvre la fenêtre, entière dans 700x400, avec « Cases choisies » / « Toute la ligne » cliquables ; un vrai clic sur une pastille de fond, sur « Toute la ligne » puis
//    « Enregistrer » écrit le réglage sur la ligne ;
//  - le repère (petit triangle) se VOIT sur une vraie capture dans le coin d'une case réglée, et pas sur une case sans réglage ;
//  - en Lecture le fond de la case se voit sur la ligne où la règle tient, et pas sur l'autre ;
//  - dans une grille, le même bouton est dans la bande de la barre de la case.
// Lancé par run-headless.mjs (groupe Node "condStyleTableMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-cond-style-table-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.COND_STYLE_TABLE_MOUSE_PORT || 9444);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-cond-text-mouse.mjs.
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
] : [];
if (!OFFLINE) console.log('[verify-cond-style-table-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

// COND_STYLE_TABLE_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil.
const SHOTS = process.env.COND_STYLE_TABLE_SHOTS || '';
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

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
  page.on('dialog', d => { pageErrors.push('boîte inattendue : ' + d.message()); d.accept().catch(() => {}); });
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

// Centre d'un élément, entièrement dans le panneau ?, et au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ?
async function hitTest(page, selector) {
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
// Une ligne de liste retrouvée par son texte exact (la liste « # » n'a pas d'identifiant par ligne).
async function hitByText(page, selector, text) {
  return page.evaluate(({ selector, text }) => {
    const el = Array.from(document.querySelectorAll(selector)).find(e => e.textContent.trim() === text);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, x, y, inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)) };
  }, { selector, text });
}
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, box) {
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
}
const clickSel = async (page, selector) => { const b = await hitTest(page, selector); if (b.found) await realClick(page, b); return b; };
// Un menu de la barre : un clic sur son bouton, puis sur l'entrée voulue (la liste d'un menu peut dépasser le panneau de 400 px : on la fait défiler jusqu'à l'entrée, comme une personne à la molette).
async function pickFromMenu(page, openSelector, itemSelector) {
  const opener = await clickSel(page, openSelector);
  await page.waitForTimeout(150);
  await page.evaluate(sel => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: 'nearest' }); }, itemSelector);
  await page.waitForTimeout(60);
  const item = await clickSel(page, itemSelector);
  await page.waitForTimeout(200);
  return { opener, item, reachable: opener.found && opener.inViewport && item.found && item.inViewport };
}


// Pixels « rouges » (la couleur #b91c1c du texte) d'un rectangle, d'après une VRAIE capture.
async function redPixels(page, box) {
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
    let red = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 140 && d[i + 1] < 90 && d[i + 2] < 90) red++;
    return red;
  }, png.toString('base64'));
}


const TABLE = 'CmTable';
const FILL = '#fff2a8';
const BAR = '.v2-table-toolbar';
const MODAL = '#cond-style-modal';
const BIG = { mode: 'all', rules: [{ column: 'Montant', operator: '>', value: '1000' }] };
const SPEC = { rules: [{ condition: BIG, style: { fill: FILL, color: '#b91c1c', bold: true } }] };
const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
const cell = (inner, extra) => `<td${extra || ''}><p>${inner}</p></td>`;
const DOC = '<p>Dossier :</p><table><tbody>'
  + `<tr>${cell('Réglée ' + badge('Montant'), attr('data-cond-style', SPEC))}${cell('Libre')}${cell('Libre')}</tr>`
  + `<tr${attr('data-cond-style', SPEC)}>${cell('Ligne réglée')}${cell('Libre')}${cell('Libre')}</tr>`
  + `<tr>${cell('Libre')}${cell('Libre')}${cell('Libre')}</tr>`
  + '</tbody></table><p></p>';

async function seedPage(page, html, row) {
  await page.evaluate(async ({ table, html, row }) => {
    const stub = window.__gristStub;
    stub.setVariables(table, { Titre: 'Text', Statut: 'Text', Montant: 'Numeric' });
    const rows = [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 }, { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 }];
    stub.setRows(table, rows);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, rows[row - 1]), table);
    Editor.setHTML(html);
  }, { table: TABLE, html, row });
  await page.waitForTimeout(400);
}
// Pixels d'un rectangle qui répondent au test (r, g, b), d'après une VRAIE capture.
async function pixelsWhere(page, rect, test) {
  const png = await page.screenshot({ clip: { x: Math.max(0, Math.floor(rect.left)), y: Math.max(0, Math.floor(rect.top)), width: Math.max(1, Math.ceil(rect.w)), height: Math.max(1, Math.ceil(rect.h)) } });
  return page.evaluate(async ({ b64, src }) => {
    const fn = new Function('r', 'g', 'b', 'return (' + src + ')(r, g, b)');
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (fn(d[i], d[i + 1], d[i + 2])) n++;
    return n;
  }, { b64: png.toString('base64'), src: test.toString() });
}
const isYellow = (r, g, b) => r > 235 && g > 220 && b > 140 && b < 200;
const isAccent = (r, g, b) => b > 170 && b - r > 70;
const rectOf = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
}, selector);

const modalState = page => page.evaluate(sel => {
  const overlay = document.querySelector(sel);
  if (!overlay || getComputedStyle(overlay).display === 'none') return { open: false };
  const box = overlay.querySelector('.pp-modal-box').getBoundingClientRect();
  const buttons = Array.from(overlay.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map(b => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: b.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, onTop: !!top && (top === b || b.contains(top)) };
  });
  const title = overlay.querySelector('h3').getBoundingClientRect();
  const scope = Array.from(overlay.querySelectorAll('.cond-style-scope-btn')).map(b => ({ text: b.textContent, on: b.classList.contains('is-active') }));
  return { open: true, box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, title: { top: title.top, bottom: title.bottom }, buttons, scope };
}, MODAL);
const insideBox = (s, w, h) => s.box.left >= 0 && s.box.right <= w + 0.5 && s.box.top >= 0 && s.box.bottom <= h + 0.5 && s.buttons.every(b => b.left >= s.box.left && b.right <= s.box.right && b.top >= s.box.top && b.bottom <= s.box.bottom && b.onTop);

async function barState(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('.v2-table-toolbar');
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    const btn = bar.querySelector('button[data-action="cell-style"]');
    const br = btn.getBoundingClientRect();
    const top = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
    return { visible: bar.classList.contains('visible'), docked: bar.classList.contains('docked'), left: r.left, right: r.right, top: r.top, bottom: r.bottom, btn: { left: br.left, right: br.right, top: br.top, bottom: br.bottom, onTop: !!top && (top === btn || btn.contains(top)) }, active: btn.classList.contains('is-active') };
  });
}

async function document_(page, scheme) {
  await seedPage(page, DOC, 1);
  await shot(page, `${scheme}-document`);
  // Le repère : un triangle de la couleur d'accent dans le coin haut droit de la case réglée, pas dans celui d'une case libre.
  const ruled = await rectOf(page, '.tiptap tr:nth-child(1) td:nth-child(1)');
  const free = await rectOf(page, '.tiptap tr:nth-child(3) td:nth-child(3)');
  const corner = r => ({ left: r.right - 14, top: r.top + 1, w: 12, h: 12 });
  const markOn = await pixelsWhere(page, corner(ruled), isAccent);
  const markOff = await pixelsWhere(page, corner(free), isAccent);
  const rowCell = await rectOf(page, '.tiptap tr:nth-child(2) td:nth-child(1)');
  const rowMark = await pixelsWhere(page, { left: rowCell.left + 1, top: rowCell.top + 1, w: 12, h: 12 }, isAccent);
  check(`${scheme} - le repère se voit dans le coin d'une case réglée (en haut à droite) et dans celui de la première case d'une ligne réglée (en haut à gauche), pas sur une case libre`, markOn > 8 && markOff === 0 && rowMark > 8, { markOn, markOff, rowMark });

  // La barre du tableau : curseur dans la case réglée par un vrai clic.
  const cellBox = await hitTest(page, '.tiptap tr:nth-child(1) td:nth-child(2)');
  await realClick(page, cellBox);
  await page.waitForTimeout(350);
  const bar = await barState(page);
  check(`${scheme} - la barre du tableau avec son bouton de plus tient dans le panneau, le bouton est au premier plan`, !!bar && bar.visible && bar.left >= 0 && bar.right <= WIDTH + 0.5 && bar.btn.left >= 0 && bar.btn.right <= WIDTH + 0.5 && bar.btn.onTop, bar);
  await shot(page, `${scheme}-barre`);

  // Curseur dans la case réglée : le bouton est allumé ; la fenêtre s'ouvre entière.
  await realClick(page, await hitTest(page, '.tiptap tr:nth-child(1) td:nth-child(1)'));
  await page.waitForTimeout(350);
  const lit = (await barState(page)).active;
  const opened = await clickSel(page, `${BAR} button[data-action="cell-style"]`);
  await page.waitForTimeout(500);
  const modal = await modalState(page);
  check(`${scheme} - le bouton est allumé sur une case réglée et ouvre la fenêtre, entière dans le panneau, « Cases choisies » enfoncé`, lit && opened.found && modal.open && insideBox(modal, WIDTH, HEIGHT) && modal.scope.length === 2 && modal.scope[0].on && !modal.scope[1].on, { lit, modal });
  await shot(page, `${scheme}-fenetre`);

  // Un vrai clic sur une pastille de fond (touche la règle), puis sur « Toute la ligne », puis « Enregistrer » : la ligne porte le réglage, la case garde le sien.
  const swatch = await clickSel(page, `${MODAL} .cond-style-card.is-open .cond-style-colors[data-style-key="fill"] .cp-swatch:nth-child(3)`);
  await page.waitForTimeout(100);
  const rowBtn = await clickSel(page, `${MODAL} .cond-style-scope-btn:nth-child(2)`);
  await page.waitForTimeout(200);
  const afterScope = await modalState(page);
  const save = await clickSel(page, `${MODAL} .pp-modal-actions .var-modal-primary`);
  await page.waitForTimeout(300);
  const written = await page.evaluate(() => {
    const trs = Array.from(document.querySelectorAll('.tiptap tr'));
    return trs.map(tr => tr.getAttribute('data-cond-style') ? JSON.parse(tr.getAttribute('data-cond-style')).rules[0].style : null);
  });
  check(`${scheme} - vrais clics : une pastille de fond, « Toute la ligne », « Enregistrer » - la fenêtre se ferme et la 1re ligne porte le réglage (avec la condition de la case)`,
    swatch.found && rowBtn.found && afterScope.scope[1].on && save.found && !(await modalState(page)).open && written[0] && written[0].fill !== undefined && !!written[1], { swatch: swatch.found, afterScope: afterScope.scope, written });

  // Lecture : le fond se voit sur la ligne où la règle tient (1 200), pas sur celle où elle ne tient pas (50).
  const seen = [];
  for (const row of [1, 2]) {
    await page.evaluate(async ({ table, row }) => {
      const rows = [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 }, { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 }];
      window.__gristStub.fireRecord(Object.assign({}, rows[row - 1]), table);
    }, { table: TABLE, row });
    await page.waitForTimeout(200);
    await page.evaluate(async () => { await ReaderMode.render(Editor.getHTML(), GristAPI.getCurrentTableId(), GristAPI.getCurrentRecord(), { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } }); });
    await page.evaluate(() => { document.getElementById('reader-container').style.display = 'block'; });
    await page.waitForTimeout(300);
    const first = await rectOf(page, '.reader-content tr:nth-child(1) td:nth-child(1)');
    const second = await rectOf(page, '.reader-content tr:nth-child(1) td:nth-child(2)');
    const free = await rectOf(page, '.reader-content tr:nth-child(3) td:nth-child(2)');
    seen.push({ row, yellow: first ? await pixelsWhere(page, first, isYellow) : -1, sameRow: second ? await pixelsWhere(page, second, isYellow) : -1, free: free ? await pixelsWhere(page, free, isYellow) : -1, area: first ? first.w * first.h : 0 });
    await shot(page, `${scheme}-lecture-${row}`);
    await page.evaluate(() => { document.getElementById('reader-container').style.display = ''; document.getElementById('editor-container').style.display = ''; });
  }
  check(`${scheme} - en Lecture, le fond jaune remplit la case réglée ET, par la règle de la ligne, la case voisine de sa ligne, sur la ligne où la règle tient (1 200) ; pas la case d'une ligne libre ; rien sur la ligne où elle ne tient pas (50)`,
    seen[0].yellow > seen[0].area * 0.5 && seen[0].sameRow > seen[0].area * 0.5 && seen[0].free === 0 && seen[1].yellow === 0 && seen[1].sameRow === 0, seen);
}

async function grid(page, scheme) {
  const newBtn = await hitTest(page, '#btn-new');
  await page.mouse.move(newBtn.x, newBtn.y, { steps: 3 });
  await page.waitForTimeout(350);
  const entry = await hitTest(page, '#v2-btn-new-grid');
  await page.mouse.move(entry.x, entry.y, { steps: 4 });
  await page.mouse.click(entry.x, entry.y);
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return;
    const button = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).find(b => b.textContent === 'Ne pas enregistrer');
    if (button) button.click();
  });
  await page.waitForFunction(() => GridEditor.isActive() && document.querySelectorAll('.v2-grid-colhead').length > 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
  await realClick(page, await hitTest(page, '.tiptap table tr:nth-child(3) td:nth-child(3)'));
  await page.waitForTimeout(400);
  const bar = await barState(page);
  const gridBand = await page.evaluate(() => { const dock = document.getElementById('v2-cell-bar-dock'); const bar = document.querySelector('.v2-table-toolbar'); return { inDock: !!dock && !!bar && dock.contains(bar), editor: document.getElementById('editor-container').getBoundingClientRect().top }; });
  check(`${scheme} - dans une grille, le bouton est dans la bande de la barre de la case, entier dans le panneau et au premier plan`, !!bar && bar.docked && gridBand.inDock && bar.right <= WIDTH + 0.5 && bar.btn.right <= WIDTH + 0.5 && bar.btn.left >= 0 && bar.btn.onTop && bar.bottom <= gridBand.editor + 1, { bar, gridBand });
  await shot(page, `${scheme}-grille`);
  const open = await clickSel(page, `${BAR} button[data-action="cell-style"]`);
  await page.waitForTimeout(500);
  const modal = await modalState(page);
  check(`${scheme} - dans une grille, le bouton ouvre la même fenêtre, entière dans le panneau`, open.found && modal.open && insideBox(modal, WIDTH, HEIGHT), modal);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

async function runTheme(scheme) {
  console.log(`\n=== Mise en forme conditionnelle d'un tableau, ${WIDTH}x${HEIGHT}, thème ${scheme} ===`);
  const { context, page } = await openWidget(scheme);
  await document_(page, scheme);
  await grid(page, scheme);
  await context.close();
}

async function runEnglish() {
  console.log(`\n=== Mise en forme conditionnelle d'un tableau en anglais, ${WIDTH}x${HEIGHT} ===`);
  const { context, page } = await openWidget('light');
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await seedPage(page, DOC, 1);
  await realClick(page, await hitTest(page, '.tiptap tr:nth-child(1) td:nth-child(1)'));
  await page.waitForTimeout(350);
  const title = await page.evaluate(() => document.querySelector('.v2-table-toolbar button[data-action="cell-style"]').title);
  await clickSel(page, `${BAR} button[data-action="cell-style"]`);
  await page.waitForTimeout(500);
  const modal = await modalState(page);
  check('anglais - le bouton et la fenêtre sont en anglais et tiennent dans le panneau', modal.open && insideBox(modal, WIDTH, HEIGHT) && title === 'Conditional formatting of the cells or the row' && modal.scope[0].text === 'Chosen cells' && modal.scope[1].text === 'Whole row', { title, modal });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => I18n.setLang('fr'));
  await context.close();
}

await runTheme('light');
await runTheme('dark');
await runEnglish();

check('aucune erreur JavaScript ni boîte native pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
