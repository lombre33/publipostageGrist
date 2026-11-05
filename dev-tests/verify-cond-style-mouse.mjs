#!/usr/bin/env node
// Mise en forme conditionnelle (demande d'Antoine du 2026-11-05, choix « un bouton sur la barre flottante », fenêtre à part) à la VRAIE souris (page.mouse / page.keyboard, Node/Playwright)
// et à la taille du panneau Grist d'Antoine (~700x400), en clair, en sombre et en anglais. dev-tests/scenarios-cond-style.js vérifie la logique DANS la page (dispatchEvent) ; ici, ce que seule
// une vraie souris prouve :
//  - la barre flottante d'une bulle, avec son bouton de plus, tient dans le panneau (aucun bouton coupé) et chaque bouton est au premier plan ;
//  - le bouton « Mise en forme conditionnelle » ouvre la fenêtre, entière dans 700x400 (titre, contenu qui défile, boutons Annuler / Enregistrer au premier plan) ;
//  - une couleur du texte, un fond et un trait choisis par de vrais clics sur les pastilles, « + Ajouter une règle » ouvre une carte neuve, « Autre… » ouvre la fenêtre de couleur devant
//    la nôtre (Échap la ferme seule), « Enregistrer » écrit le réglage ;
//  - en Lecture la couleur SE VOIT sur une vraie capture (pixels rouges sur la ligne où la règle tient, aucun sur l'autre) ;
//  - en anglais : la barre et la fenêtre tiennent dans le panneau.
// Lancé par run-headless.mjs (groupe Node "condStyleMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-cond-style-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.COND_STYLE_MOUSE_PORT || 9443);
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
if (!OFFLINE) console.log('[verify-cond-style-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

// COND_STYLE_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil.
const SHOTS = process.env.COND_STYLE_SHOTS || '';
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

const TABLE = 'CmStyle';
const RED = '#b91c1c';
const BAR = '.v2-varfmt-toolbar.visible';
const MODAL = '#cond-style-modal';
const BIG = { mode: 'all', rules: [{ column: 'Montant', operator: '>', value: '1000' }] };
const STYLE_SPEC = { rules: [{ condition: BIG, style: { color: RED, bold: true } }] };
const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
const badge = (column, extra) => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${extra || ''}></span>`;

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
  const body = overlay.querySelector('.pp-modal-body');
  return { open: true, box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, title: { top: title.top, bottom: title.bottom }, buttons, scrolls: body.scrollHeight > body.clientHeight, cards: overlay.querySelectorAll('.cond-style-card').length };
}, MODAL);
const insideBox = (s, w, h) => s.box.left >= 0 && s.box.right <= w + 0.5 && s.box.top >= 0 && s.box.bottom <= h + 0.5 && s.buttons.every(b => b.left >= s.box.left && b.right <= s.box.right && b.top >= s.box.top && b.bottom <= s.box.bottom && b.onTop);

async function barButtons(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('.v2-varfmt-toolbar');
    const r = bar.getBoundingClientRect();
    const buttons = Array.from(bar.querySelectorAll('.v2-varbadge-actions button')).filter(b => !b.hidden && b.getClientRects().length).map(b => {
      const br = b.getBoundingClientRect();
      const top = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      return { action: b.dataset.action, left: br.left, right: br.right, onTop: !!top && (top === b || b.contains(top)) };
    });
    return { visible: bar.classList.contains('visible'), left: r.left, right: r.right, top: r.top, bottom: r.bottom, buttons };
  });
}

async function runTheme(scheme) {
  console.log(`\n=== Mise en forme conditionnelle, ${WIDTH}x${HEIGHT}, ${scheme} ===`);
  const { context, page } = await openWidget(scheme);
  await seedPage(page, `<p>Le montant est ${badge('Montant', attr('data-cond-style', STYLE_SPEC))} euros.</p><p>Titre : ${badge('Titre')}</p>`, 1);
  // Un vrai clic sur la bulle : la barre s'ouvre.
  const chip = await hitTest(page, '.tiptap .var-badge');
  check(`${scheme} - la bulle est dans le panneau et au premier plan`, chip.found && chip.inViewport && chip.onTop, chip);
  await realClick(page, chip);
  await page.waitForTimeout(300);
  const bar = await barButtons(page);
  const order = bar.buttons.map(b => b.action);
  check(`${scheme} - la barre tient dans le panneau et chaque bouton, « Mise en forme conditionnelle » compris, est au premier plan`,
    bar.visible && bar.left >= 0 && bar.right <= WIDTH + 0.5 && bar.top >= 0 && bar.buttons.length >= 4 && bar.buttons.every(b => b.onTop && b.left >= bar.left && b.right <= bar.right) && order.indexOf('var-style') === order.indexOf('var-condition') + 1, { bar, order });
  const lit = await page.evaluate(() => document.querySelector('.v2-varfmt-toolbar button[data-action="var-style"]').classList.contains('is-active'));
  check(`${scheme} - le bouton est allumé : la bulle a un réglage`, lit);
  await shot(page, `${scheme}-barre`);
  await realClick(page, await hitTest(page, `${BAR} button[data-action="var-style"]`));
  await page.waitForTimeout(500);
  let modal = await modalState(page);
  check(`${scheme} - la fenêtre s'ouvre entière dans le panneau : titre, boutons Annuler / Enregistrer / Retirer au premier plan`, modal.open && modal.cards === 1 && insideBox(modal, WIDTH, HEIGHT) && modal.buttons.length === 3, modal);
  await shot(page, `${scheme}-fenetre`);
  // De vrais clics : un autre rouge ? non - le bleu, un fond et l'italique.
  const BLUE = '#1d4ed8';
  const FILL = '#fff2a8';
  // Dès l'ouverture, sans défiler : les deux rangées de pastilles et les quatre traits sont dans le panneau, au premier plan (c'est le but de la fenêtre).
  const BLUE_SEL = `${MODAL} .cond-style-colors[data-style-key="color"] .cp-swatch[data-color="${BLUE}"]`;
  const FILL_SEL = `${MODAL} .cond-style-colors[data-style-key="fill"] .cp-swatch[data-color="${FILL}"]`;
  const MARK_SEL = `${MODAL} .cond-style-mark[data-mark="italic"]`;
  const atOpening = [await hitTest(page, BLUE_SEL), await hitTest(page, FILL_SEL), await hitTest(page, MARK_SEL)];
  check(`${scheme} - dès l'ouverture, sans défiler, les pastilles du texte et du fond et les traits sont dans le panneau et au premier plan`, atOpening.every(b => b.found && b.inViewport && b.onTop), atOpening);
  const blue = await clickSel(page, BLUE_SEL);
  const fill = await clickSel(page, FILL_SEL);
  const italic = await clickSel(page, MARK_SEL);
  await page.waitForTimeout(150);
  const marks = await page.evaluate(({ BLUE, FILL }) => ({
    blue: document.querySelector(`#cond-style-modal [data-style-key="color"] .cp-swatch[data-color="${BLUE}"]`).classList.contains('is-active'),
    fill: document.querySelector(`#cond-style-modal [data-style-key="fill"] .cp-swatch[data-color="${FILL}"]`).classList.contains('is-active'),
    italic: document.querySelector('#cond-style-modal .cond-style-mark[data-mark="italic"]').classList.contains('is-active'),
    sample: getComputedStyle(document.querySelector('#cond-style-modal .cond-style-card.is-open .cond-style-sample-big')).color,
  }), { BLUE, FILL });
  check(`${scheme} - les pastilles et le trait se choisissent à la vraie souris (atteints dans le panneau), l'échantillon change de couleur`,
    [blue, fill, italic].every(b => b.found && b.inViewport) && marks.blue && marks.fill && marks.italic && marks.sample === 'rgb(29, 78, 216)', { blue, fill, italic, marks });
  // « Autre… » : la fenêtre de couleur s'ouvre DEVANT la nôtre ; Échap la ferme seule.
  await clickSel(page, `${MODAL} .cond-style-colors[data-style-key="color"] [data-role="custom"]`);
  await page.waitForTimeout(300);
  const colorWin = await page.evaluate(() => {
    const overlay = document.getElementById('pp-color-modal');
    if (!overlay || getComputedStyle(overlay).display === 'none') return { open: false };
    const r = overlay.querySelector('.pp-modal-box').getBoundingClientRect();
    const mid = document.elementFromPoint(r.left + r.width / 2, r.top + 30);
    return { open: true, inViewport: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, onTop: !!mid && overlay.contains(mid) };
  });
  check(`${scheme} - « Autre… » ouvre la fenêtre de couleur devant la nôtre`, colorWin.open && colorWin.onTop, colorWin);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  modal = await modalState(page);
  check(`${scheme} - Échap ferme la fenêtre de couleur seule : la nôtre reste ouverte, son choix intact`, modal.open && modal.cards === 1, modal);
  // « + Ajouter une règle » : une carte neuve s'ouvre, le contenu défile, le bouton « Enregistrer » reste au premier plan.
  // Le bouton est sous le bord visible de la fenêtre : on le fait défiler jusqu'à lui, comme une personne à la molette.
  await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'nearest' }), `${MODAL} .cond-style-add`);
  await page.waitForTimeout(80);
  await clickSel(page, `${MODAL} .cond-style-add`);
  await page.waitForTimeout(250);
  modal = await modalState(page);
  check(`${scheme} - « + Ajouter une règle » ouvre une carte neuve, la fenêtre reste entière et défile`, modal.open && modal.cards === 2 && modal.scrolls && insideBox(modal, WIDTH, HEIGHT), modal);
  await shot(page, `${scheme}-deux-regles`);
  const saved = await clickSel(page, `${MODAL} .pp-modal-actions .var-modal-primary`);
  await page.waitForTimeout(300);
  const written = await page.evaluate(() => { const n = EditorCore.getEditor().state.doc.nodeAt(EditorCore.getEditor().state.doc.content.findIndex ? 0 : 0); let found = null; EditorCore.getEditor().state.doc.descendants(node => { if (!found && node.type.name === 'varBadge' && node.attrs.condStyle) found = node.attrs.condStyle; }); return found; });
  check(`${scheme} - « Enregistrer » écrit la règle complète (la carte vide est ignorée) : bleu, fond, gras et italique`, saved.found && written && written.rules.length === 1
    && JSON.stringify(written.rules[0].style) === JSON.stringify({ color: BLUE, fill: FILL, bold: true, italic: true }), written);
  // La Lecture : on VOIT la couleur sur la ligne où la règle tient, pas sur l'autre.
  const seen = [];
  for (const row of [1, 2]) {
    await page.evaluate(async ({ table, row }) => {
      const rows = [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 }, { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 }];
      window.__gristStub.fireRecord(Object.assign({}, rows[row - 1]), table);
      await new Promise(r => setTimeout(r, 80));
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      await ReaderMode.render(Editor.getHTML(), table, GristAPI.getCurrentRecord(), { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
    }, { table: TABLE, row });
    await page.waitForTimeout(250);
    const box = await hitTest(page, '.reader-content span[style]');
    const rect = await page.evaluate(() => { const p = document.querySelector('.reader-content p'); const r = p.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; });
    seen.push({ row, styledSpan: box.found, blueish: await pixelsWhere(page, rect, (r, g, b) => b > 150 && r < 90 && g < 120) });
    await shot(page, `${scheme}-lecture-${row}`);
    await page.evaluate(() => { document.getElementById('reader-container').style.display = ''; document.getElementById('editor-container').style.display = ''; });
  }
  check(`${scheme} - en Lecture, la couleur se voit sur une vraie capture sur la ligne où la règle tient (1 200) et pas sur l'autre (50)`, seen[0].styledSpan && seen[0].blueish > 15 && !seen[1].styledSpan && seen[1].blueish < 3, seen);
  await context.close();
}

// Pixels d'un rectangle qui répondent au test (r, g, b), d'après une VRAIE capture.
async function pixelsWhere(page, rect, test) {
  const png = await page.screenshot({ clip: { x: Math.max(0, Math.floor(rect.left)), y: Math.max(0, Math.floor(rect.top)), width: Math.ceil(rect.w), height: Math.ceil(rect.h) } });
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

async function runEnglish() {
  console.log(`\n=== Mise en forme conditionnelle en anglais, ${WIDTH}x${HEIGHT} ===`);
  const { context, page } = await openWidget('light');
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await seedPage(page, `<p>The amount is ${badge('Montant', attr('data-cond-style', STYLE_SPEC))}.</p>`, 1);
  await realClick(page, await hitTest(page, '.tiptap .var-badge'));
  await page.waitForTimeout(300);
  const bar = await barButtons(page);
  const title = await page.evaluate(() => document.querySelector('.v2-varfmt-toolbar button[data-action="var-style"]').title);
  check('anglais - la barre tient dans le panneau, l\'info-bulle du bouton est en anglais', bar.visible && bar.left >= 0 && bar.right <= WIDTH + 0.5 && title === 'Conditional formatting', { bar, title });
  await realClick(page, await hitTest(page, `${BAR} button[data-action="var-style"]`));
  await page.waitForTimeout(500);
  const modal = await modalState(page);
  const texts = await page.evaluate(() => ({ title: document.getElementById('cond-style-title').textContent, add: document.querySelector('#cond-style-modal .cond-style-add').textContent, intro: document.querySelector('#cond-style-modal .var-modal-intro').textContent, glyphs: Array.from(document.querySelectorAll('#cond-style-modal .cond-style-mark')).map(b => b.textContent).join('') }));
  check('anglais - la fenêtre tient dans le panneau : titre, introduction, « + Add a rule » et lettres B I U S en anglais', modal.open && insideBox(modal, WIDTH, HEIGHT) && texts.title === 'Conditional formatting' && texts.add === '+ Add a rule' && texts.glyphs === 'BIUS' && /takes the color, fill or style you choose/.test(texts.intro), { modal, texts });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('anglais - Échap ferme la fenêtre', !(await page.evaluate(() => ConditionalStyleWindow.isOpen())));
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
