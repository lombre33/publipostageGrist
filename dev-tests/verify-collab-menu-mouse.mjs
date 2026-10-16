#!/usr/bin/env node
// Édition collaborative (choix d'Antoine du 16/10, carte « Regrouper le suivi et l'écriture en direct sous un bouton « Édition collaborative » ? », réponse « Bouton regroupé ») : le suivi des
// modifications, « Tout accepter » et « Tout refuser » ne sont plus trois icônes de la barre mais les trois lignes du menu d'un seul bouton, ouvert au survol comme « Lien et blocs de
// contenu ». Les scénarios de dev-tests/scenarios-toolbar-chrome.js (toolbar_collab_menu_...) tournent DANS la page ; ce script-ci le prouve à la vraie souris et au vrai clavier, à la taille
// du panneau Grist (~700x400), en clair puis en sombre :
//   1) le survol du bouton ouvre le menu (« Édition collaborative » en titre, trois lignes), tout entier dans le panneau, et chaque ligne reçoit le clic (elementFromPoint à son centre) ;
//   2) un vrai clic sur « Suivi des modifications » allume le suivi - la ligne ET le bouton, menu refermé -, le curseur reste dans le texte, un second clic l'éteint ;
//   3) sans modification en attente « Tout accepter » et « Tout refuser » sont grisés ; une frappe en suivi les dégrise ; « Tout refuser » rend le texte d'origine, « Tout accepter » garde la frappe ;
//   4) le clavier : Tab arrive sur le bouton (le menu s'ouvre), puis sur « Suivi des modifications » ; Entrée l'allume ;
//   5) le texte de chaque ligne se lit (4,5:1 au moins sur le fond du menu), les deux thèmes.
// Lancé par run-headless.mjs (groupe Node "collabMenuMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-collab-menu-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.COLLAB_MENU_MOUSE_PORT || 8931);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-menu-click-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-collab-menu-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const SHOTS = process.env.COLLAB_MENU_SHOTS || mkdtempSync(join(tmpdir(), 'collab-menu-'));
mkdirSync(SHOTS, { recursive: true });

// Une page neuve par thème : même panneau ~700x400, mêmes routes hors-ligne.
async function openPage(dark) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme: dark ? 'dark' : 'light' });
  const page = await context.newPage();
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
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  await page.evaluate(() => { Editor.setHTML('<p>Bonjour monde</p>'); });
  await page.waitForTimeout(300);
  return page;
}

const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!top && (top === e || e.contains(top)) };
}, sel);
// Survol réel (approche en deux temps).
async function hover(page, sel) {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 14, c.y - 6, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(150);
  return c;
}
// Du bouton à une ligne de son menu : tout droit sous le bouton (le menu reste ouvert tout du long), puis vers la ligne.
async function toRow(page, rowSel) {
  const btn = await hover(page, '#v2-btn-collab');
  const row = await rectOf(page, rowSel);
  await page.mouse.move(btn.x, row.y, { steps: 10 });
  await page.mouse.move(row.x, row.y, { steps: 4 });
  await page.waitForTimeout(120);
  return row;
}
async function clickRow(page, rowSel, wait = 250) {
  const row = await toRow(page, rowSel);
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(wait);
  return row;
}
// Hors de tout menu, au bas du panneau.
const away = async (page) => { await page.mouse.move(350, 392, { steps: 6 }); await page.waitForTimeout(250); };
const flyoutOpen = (page) => page.evaluate(() => getComputedStyle(document.getElementById('v2-collab-flyout')).display !== 'none');
const state = (page) => page.evaluate(() => ({
  on: Editor.isTrackChangesOn(), pending: Editor.hasPendingTrackedChanges(),
  buttonLit: document.getElementById('v2-btn-collab').classList.contains('is-active'),
  rowLit: document.getElementById('v2-btn-track-changes').classList.contains('is-active'),
  acceptOff: document.getElementById('v2-btn-accept-all').disabled, rejectOff: document.getElementById('v2-btn-reject-all').disabled,
  html: Editor.getHTML(), inEditor: !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('.ProseMirror'),
}));
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const contrast = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

for (const dark of [false, true]) {
  const theme = dark ? 'sombre' : 'clair';
  console.log(`\n== Panneau ${WIDTH}x${HEIGHT}, ${theme} ==`);
  const page = await openPage(dark);

  // 1) le survol ouvre le menu, tout entier dans le panneau, chaque ligne reçoit le clic
  const btn = await hover(page, '#v2-btn-collab');
  const open1 = await flyoutOpen(page);
  const fly = await rectOf(page, '#v2-collab-flyout');
  const title = await page.evaluate(() => document.querySelector('#v2-collab-flyout .v2-hover-flyout-label').textContent.trim());
  const rows = {};
  for (const id of ['v2-btn-track-changes', 'v2-btn-accept-all', 'v2-btn-reject-all']) rows[id] = await rectOf(page, '#' + id);
  await page.screenshot({ path: `${SHOTS}/menu-ouvert-${theme}.png`, clip: { x: 0, y: 0, width: WIDTH, height: 260 } });
  check(`${theme} : le bouton « Édition collaborative » est dans la barre, visible, au premier plan`, !!btn && btn.onTop && btn.w > 10 && btn.h > 10 && btn.b < 200, btn);
  check(`${theme} : le survol du bouton ouvre le menu, titré « Édition collaborative »`, open1 && title === 'Édition collaborative', { open1, title });
  check(`${theme} : le menu tient tout entier dans le panneau (rien de coupé à droite ni en bas)`, !!fly && fly.l >= 0 && fly.r <= WIDTH && fly.b <= HEIGHT, fly && { l: fly.l, r: fly.r, b: fly.b });
  check(`${theme} : les trois lignes sont dans le menu, dans l'ordre suivi, tout accepter, tout refuser, et reçoivent le clic au centre`,
    Object.values(rows).every(r => r && r.onTop) && rows['v2-btn-track-changes'].y < rows['v2-btn-accept-all'].y && rows['v2-btn-accept-all'].y < rows['v2-btn-reject-all'].y, rows);
  const colors = await page.evaluate(() => {
    const bg = getComputedStyle(document.getElementById('v2-collab-flyout')).backgroundColor;
    return ['v2-btn-track-changes', 'v2-btn-accept-all', 'v2-btn-reject-all'].map(id => ({ id, color: getComputedStyle(document.getElementById(id)).color, disabled: document.getElementById(id).disabled, bg }));
  });
  const ratios = colors.map(c => ({ id: c.id, ratio: Math.round(contrast(c.color, c.bg) * 100) / 100 }));
  check(`${theme} : le texte des lignes se lit sur le fond du menu (4,5:1 au moins)`, ratios.every(r => r.ratio >= 4.5), ratios);
  await away(page);
  check(`${theme} : la souris partie, le menu se referme`, !(await flyoutOpen(page)));

  // 2) accepter et refuser tout sont grisés sans modification en attente, la ligne du suivi ne l'est pas
  const s0 = await state(page);
  check(`${theme} : au départ le suivi est éteint, rien n'est allumé, « Tout accepter » et « Tout refuser » sont grisés`, !s0.on && !s0.buttonLit && !s0.rowLit && s0.acceptOff && s0.rejectOff, s0);

  // 3) un vrai clic sur « Suivi des modifications » l'allume (ligne et bouton), le menu se referme, le curseur reste dans le texte
  const para = await rectOf(page, '.ProseMirror p');
  await page.mouse.click(para.r - 3, para.y); await page.keyboard.press('End');
  await clickRow(page, '#v2-btn-track-changes');
  const s1 = await state(page);
  await away(page);
  const s1b = await state(page);
  check(`${theme} : un vrai clic sur « Suivi des modifications » l'allume, la ligne et le bouton du menu`, s1.on && s1.rowLit && s1.buttonLit, s1);
  check(`${theme} : le bouton reste allumé menu refermé, et le curseur est resté dans le texte`, s1b.buttonLit && s1b.inEditor && !(await flyoutOpen(page)), s1b);
  await page.screenshot({ path: `${SHOTS}/suivi-allume-${theme}.png`, clip: { x: 0, y: 0, width: WIDTH, height: 140 } });

  // 4) en suivi, une frappe propose une modification : accepter et refuser tout se dégrisent ; « Tout refuser » rend le texte d'origine
  await page.keyboard.type(' ajout');
  await page.waitForTimeout(200);
  const s2 = await state(page);
  check(`${theme} : en suivi, la frappe est une modification en attente et dégrise « Tout accepter » et « Tout refuser »`, s2.pending && !s2.acceptOff && !s2.rejectOff && /ajout/.test(s2.html), s2);
  await clickRow(page, '#v2-btn-reject-all', 400);
  await away(page);
  const s3 = await state(page);
  check(`${theme} : « Tout refuser » rend le texte d'origine, plus rien en attente, les deux lignes se regrisent`, !s3.pending && !/ajout/.test(s3.html) && /Bonjour monde/.test(s3.html) && s3.acceptOff && s3.rejectOff, s3);
  await page.mouse.click(para.r - 3, para.y); await page.keyboard.press('End'); await page.keyboard.type(' ajout');
  await page.waitForTimeout(200);
  await clickRow(page, '#v2-btn-accept-all', 400);
  await away(page);
  const s4 = await state(page);
  check(`${theme} : « Tout accepter » garde la frappe, plus rien en attente`, !s4.pending && /Bonjour monde ajout/.test(s4.html.replace(/<[^>]+>/g, '')), s4);

  // 5) un second clic éteint le suivi, le bouton s'éteint avec lui
  await clickRow(page, '#v2-btn-track-changes');
  await away(page);
  const s5 = await state(page);
  check(`${theme} : un second clic éteint le suivi, la ligne et le bouton`, !s5.on && !s5.rowLit && !s5.buttonLit, s5);

  // 6) le clavier : Tab depuis la loupe arrive sur le bouton (le menu s'ouvre), puis sur « Suivi des modifications » ; Entrée l'allume
  await page.focus('#v2-btn-find');
  await page.keyboard.press('Tab');
  const k1 = await page.evaluate(() => ({ active: document.activeElement.id, open: getComputedStyle(document.getElementById('v2-collab-flyout')).display, expanded: document.getElementById('v2-btn-collab').getAttribute('aria-expanded') }));
  check(`${theme} : Tab depuis la loupe arrive sur « Édition collaborative » et ouvre son menu`, k1.active === 'v2-btn-collab' && k1.open === 'flex' && k1.expanded === 'true', k1);
  await page.keyboard.press('Tab');
  const k2 = await page.evaluate(() => ({ active: document.activeElement.id, open: getComputedStyle(document.getElementById('v2-collab-flyout')).display }));
  check(`${theme} : Tab suivant arrive sur « Suivi des modifications », le menu reste ouvert`, k2.active === 'v2-btn-track-changes' && k2.open === 'flex', k2);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const k3 = await state(page);
  check(`${theme} : Entrée allume le suivi`, k3.on && k3.buttonLit, k3);
  await page.evaluate(() => { if (Editor.isTrackChangesOn()) document.getElementById('v2-btn-track-changes').click(); document.activeElement && document.activeElement.blur(); });
  await away(page);

  await page.context().close();
}

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
// Le lanceur (run-headless.mjs) lit « N/N passés » en fin de sortie : la ligne des captures passe avant.
console.log(`\ncaptures : ${SHOTS}`);
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
