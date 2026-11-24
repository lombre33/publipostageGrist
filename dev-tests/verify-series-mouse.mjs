#!/usr/bin/env node
// La ligne suivante ou précédente d'une série (js/variable-linked-attrs.js : le volet « Ligne suivante ou précédente » de la fenêtre « Autres colonnes de la même
// ligne », maillon « +1(Date;Cycle) » du chemin d'une variable) à la VRAIE souris et au vrai clavier (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau
// Grist d'Antoine (~700x400), en clair, en sombre et en anglais : les scénarios de dev-tests/scenarios-var-series.js tournent DANS la page (dispatchEvent), ils ne prouvent
// ni qu'un vrai clic atteint le bouton de la barre de la bulle, ni que la fenêtre entière tient dans un panneau bas sans rogner un champ ni cacher un bouton, ni qu'« Aller à
// cette ligne » et « Remplacer » reçoivent le vrai clic. Les captures vont dans le dossier de SERIES_MOUSE_SHOTS (rien n'est écrit sans cette variable).
// Lancé par run-headless.mjs (groupe Node "seriesMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-series-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SERIES_MOUSE_PORT || 8897);
const SHOTS = process.env.SERIES_MOUSE_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;

async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  await writeFile(join(ROOT, '_test-harness.html'), html.replace('<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>', '<script src="dev-tests/grist-stub.js"></script>'));
}
await regenerateHarness();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(target));
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

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

let total = 0;
let failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });

async function newPage({ lang, theme }) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme: theme === 'dark' ? 'dark' : 'light' });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.addInitScript(l => { try { localStorage.setItem('pp_lang', l); } catch (e) { /* stockage indisponible */ } }, lang);
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
      await page.route(re, async route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: await readFile(join(CACHE, rel), 'utf8') }));
    }
    await page.addInitScript(() => { Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} }); });
    await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
  }
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  await page.evaluate(theme => { if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme'); }, theme);
  return { context, page };
}

// VsInstances : la page ; le cycle A va 2 (jour 0) → 4 (jour 15) → 7 (jour 15) → 1 (jour 30). La ligne affichée est la 2.
async function seed(page) {
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    const day = n => 1735689600 + n * 86400;
    const rows = [
      { id: 1, Titre: 'Séance 3', Cycle: 'A', Date: day(30), Numero: 3 },
      { id: 2, Titre: 'Séance 1', Cycle: 'A', Date: day(0), Numero: 1 },
      { id: 3, Titre: 'Séance B2', Cycle: 'B', Date: day(10), Numero: 2 },
      { id: 4, Titre: 'Séance 2', Cycle: 'A', Date: day(15), Numero: 2 },
      { id: 7, Titre: 'Séance 2 bis', Cycle: 'A', Date: day(15), Numero: 22 },
    ];
    stub.setVariables('VsInstances', { Titre: 'Text', Cycle: 'Text', Date: 'Date', Numero: 'Int' });
    stub.setRows('VsInstances', rows);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, rows[1]), 'VsInstances');
    const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
    Editor.setHTML(`<p>Prochaine séance : ${badge('VsInstances', 'Titre')}</p>`);
  });
  await page.waitForTimeout(400);
}

const centerOf = async (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  el.scrollIntoView({ block: 'nearest' });
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}, selector);
// Ce que la souris atteindrait au centre de l'élément : l'élément lui-même ou l'un de ses enfants, rien d'autre par-dessus.
const reachable = async (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!top && (top === el || el.contains(top) || top.contains(el));
}, selector);
async function shot(page, name) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name + '.png') });
}

async function runMode(mode) {
  const label = `${mode.lang} ${mode.theme}`;
  const { context, page } = await newPage(mode);
  try {
    await seed(page);
    // 1. Le clic sur la bulle, puis sur le bouton de sa barre : la fenêtre s'ouvre.
    const badge = await centerOf(page, '.tiptap .var-badge');
    await page.mouse.click(badge.x, badge.y);
    await page.waitForTimeout(300);
    const linkedBtn = await centerOf(page, '.v2-varfmt-toolbar button[data-action="var-linked"]');
    const enabled = await page.evaluate(() => document.querySelector('.v2-varfmt-toolbar button[data-action="var-linked"]').getAttribute('aria-disabled'));
    check(`${label} : le bouton de la barre de la bulle est actif pour une colonne ordinaire de la page`, !!linkedBtn && enabled === 'false', { enabled });
    await shot(page, `${mode.lang}-${mode.theme}-1-barre`);
    await page.mouse.click(linkedBtn.x, linkedBtn.y);
    await page.waitForTimeout(400);
    const box = await centerOf(page, '#var-linked-modal .var-modal-content');
    check(`${label} : la fenêtre tient dans le panneau (${WIDTH}x${HEIGHT}) sans être rognée`, !!box && box.left >= 0 && box.right <= WIDTH && box.top >= 0 && box.bottom <= HEIGHT, box);
    const panelOpen = await page.evaluate(() => document.querySelector('.var-linked-step').open);
    check(`${label} : le volet « Ligne suivante ou précédente » est ouvert d'emblée`, panelOpen);
    await shot(page, `${mode.lang}-${mode.theme}-2-fenetre`);

    // 2. « Aller à cette ligne » grisé, puis réglé au clavier (Tab depuis le sens, flèches du champ) et à la souris.
    const goBefore = await page.evaluate(() => document.querySelector('.var-linked-step-go').disabled);
    check(`${label} : « Aller à cette ligne » est grisé tant que la colonne d'ordre n'est pas choisie`, goBefore === true);
    for (const field of ['direction', 'rank', 'order', 'group']) {
      const where = await centerOf(page, `.var-linked-step-${field}`);
      const hit = await reachable(page, `.var-linked-step-${field}`);
      check(`${label} : le champ « ${field} » est dans la fenêtre et rien ne le recouvre`, !!where && hit && where.left >= box.left - 1 && where.right <= box.right + 1, where);
    }
    await page.selectOption('.var-linked-step-order', 'Date');
    await page.selectOption('.var-linked-step-group', 'Cycle');
    await page.focus('.var-linked-step-rank');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    const rank = await page.evaluate(() => document.querySelector('.var-linked-step-rank').value);
    check(`${label} : le rang se règle aux flèches du clavier (1, puis 2, puis 1)`, rank === '1', rank);
    const goReach = await reachable(page, '.var-linked-step-go');
    const go = await centerOf(page, '.var-linked-step-go');
    check(`${label} : « Aller à cette ligne » reçoit le vrai clic`, goReach, go);
    await page.mouse.click(go.x, go.y);
    await page.waitForTimeout(500);
    const level = await page.evaluate(() => ({
      crumbs: Array.from(document.querySelectorAll('.var-linked-path .var-linked-crumb')).map(c => c.textContent),
      titre: (document.querySelector('.var-linked-row[data-col="Titre"] .var-linked-value') || {}).textContent,
      panelOpen: document.querySelector('.var-linked-step').open,
    }));
    check(`${label} : le fil d'Ariane dit le maillon et la liste montre la ligne suivante (Séance 2)`, JSON.stringify(level.crumbs) === JSON.stringify(['VsInstances', '+1(Date;Cycle)']) && level.titre === 'Séance 2' && level.panelOpen === false, level);
    await shot(page, `${mode.lang}-${mode.theme}-3-ligne-suivante`);

    // 3. Cocher Titre à la souris, « Remplacer » : la bulle porte le maillon et écrit le titre de la ligne d'après.
    const tick = await centerOf(page, '.var-linked-row[data-col="Titre"] input');
    await page.mouse.click(tick.x, tick.y);
    const replace = await centerOf(page, '#var-linked-modal button.var-linked-replace');
    check(`${label} : « Remplacer » est dans la fenêtre et reçoit le vrai clic`, !!replace && replace.bottom <= HEIGHT && await reachable(page, '#var-linked-modal button.var-linked-replace'), replace);
    await page.mouse.click(replace.x, replace.y);
    await page.waitForTimeout(400);
    const after = await page.evaluate(async () => {
      const keys = [];
      EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge') keys.push(n.attrs.key); });
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      await ReaderMode.render(Editor.getHTML(), 'VsInstances', GristAPI.getCurrentRecord(), { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
      const text = reader.querySelector('.reader-content').textContent;
      reader.style.display = 'none';
      return { keys, text };
    });
    check(`${label} : la bulle porte le maillon et écrit le titre de la ligne suivante`, JSON.stringify(after.keys) === JSON.stringify(['VsInstances.+1(Date;Cycle).Titre']) && /Séance 2/.test(after.text) && !/Séance 1/.test(after.text), after);
  } finally {
    await context.close();
  }
}

for (const mode of [{ lang: 'fr', theme: 'light' }, { lang: 'fr', theme: 'dark' }, { lang: 'en', theme: 'light' }]) await runMode(mode);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
