#!/usr/bin/env node
// Retours d'Antoine du 2026-10-01 (carte « Les deux ») : un clic de souris sur le bouton d'un menu au survol ne le laisse plus ouvert une fois la souris partie, et ne prend plus le
// curseur du texte. Les scénarios de dev-tests/scenarios-toolbar-chrome.js tournent DANS la page (dispatchEvent) : un évènement synthétique ne déplace jamais le focus, ils ne peuvent
// donc pas prouver ce défaut (le bouton cliqué gardait le focus, son menu avec lui par :focus-within) - il ne se voit qu'à la vraie souris, à la taille du panneau Grist (~700x400).
//   1) « + », Enregistrer, Qualité PDF et Titre : le survol ouvre le menu, un vrai clic puis la souris partie le referment (aria-expanded revenu à « false »), et le bouton n'a pas gardé
//      le focus ; Exporter n'est pas cliqué ici (il lance un export) ;
//   2) le curseur reste dans le texte : taper, cliquer Qualité PDF ou Titre à la souris, taper encore, tout arrive dans l'éditeur ;
//   3) un champ de saisie qui avait le focus (renommage du modèle) est validé et refermé au clic sur un de ces boutons, comme avant : le clic n'est pas perdu quand la barre se redessine ;
//   4) le clavier est intact : Tab arrive sur Qualité PDF et ouvre son menu, Tab suivant le referme, Entrée sur Enregistrer enregistre ;
//   5) une ligne de menu ordinaire (« Nouvel email ») se clique toujours et son menu se referme aussi.
// Lancé par run-headless.mjs (groupe Node "menuClickMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-menu-click-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.MENU_CLICK_MOUSE_PORT || 8911);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-wheel-scroll.mjs.
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
if (!OFFLINE) console.log('[verify-menu-click-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const TEMPLATES = `
    const m = stub.state.rows.Publipostage_Modeles;
    const add = (id, nom, html, def) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(html); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); };
    add(1, 'Bail habitation', '<p>a</p>', false); add(2, 'Contrat de vente', '<p>b</p>', true); add(3, 'Avenant loyer', '<p>c</p>', false);
    add(4, 'Mise en demeure', '<p>d</p>', false); add(5, 'Quittance', '<p>e</p>', false); add(6, 'Sans dossier', '<p>f</p>', false);
    stub.state.nextRowId.Publipostage_Modeles = 7;
`;

async function openPage(extraSeed) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
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
  await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${TEMPLATES} ${extraSeed || ''} };`);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return page;
}

import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const SHOTS = process.env.MENU_CLICK_SHOTS || mkdtempSync(join(tmpdir(), 'menu-click-'));
mkdirSync(SHOTS, { recursive: true });

const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!top && (top === e || e.contains(top)) };
}, sel);
// Survol réel (approche en deux temps), puis clic réel, puis la souris s'en va : le menu doit se refermer tout seul.
async function hover(page, sel) {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 14, c.y - 6, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(150);
  return c;
}
async function realClick(page, sel, wait = 250) {
  const c = await hover(page, sel);
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
// Hors de tout menu : celui de « Qualité PDF » (neuf lignes dont les trois d'Excel, jusqu'à ~350 px de haut) recouvre le milieu du panneau, la souris part donc tout en bas.
const away = async (page) => { await page.mouse.move(350, 385, { steps: 6 }); await page.waitForTimeout(250); };
const open = (page, fly) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).display !== 'none', fly);
const expanded = (page, sel) => page.evaluate((s) => document.querySelector(s).getAttribute('aria-expanded'), sel);
const activeId = (page) => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) : null; });
const inEditor = (page) => page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest && !!a.closest('.ProseMirror'); });
const editorText = (page) => page.evaluate(() => document.querySelector('.ProseMirror').textContent);
const statusOf = (page) => page.evaluate(() => document.getElementById('status-msg').textContent);
const names = (page) => page.evaluate(() => window.__gristStub.state.rows.Publipostage_Modeles.Nom.slice());

console.log('\n== Panneau 700x400, clair ==');
const page = await openPage('');
await page.waitForTimeout(300);

// 1) chaque bouton de menu : le survol ouvre, un vrai clic puis la souris partie referment, le bouton n'a pas gardé le focus
const MENUS = [
  ['« + »', '#btn-new', '#v2-new-template-flyout'],
  ['Enregistrer', '#btn-save', '#v2-save-flyout'],
  ['Qualité PDF', '#v2-btn-quality', '#v2-quality-flyout'],
  ['Titre', '#v2-heading-chip', '#v2-heading-flyout'],
];
for (const [label, btn, fly] of MENUS) {
  await hover(page, btn);
  const hovering = await open(page, fly);
  const c = await rectOf(page, btn);
  await page.mouse.click(c.x, c.y); await page.waitForTimeout(400);
  const stillOpenUnderMouse = await open(page, fly);
  await away(page);
  const closed = !(await open(page, fly));
  const exp = await expanded(page, btn);
  const focus = await activeId(page);
  check(`${label} : le survol ouvre le menu sous la souris`, hovering, { hovering });
  check(`${label} : après un vrai clic puis la souris partie, le menu est refermé (aria-expanded « false ») et le bouton n’a pas gardé le focus`, closed && exp === 'false' && focus !== btn.slice(1), { stillOpenUnderMouse, closed, exp, focus });
}
await page.screenshot({ path: SHOTS + '/apres-clics.png', clip: { x: 0, y: 0, width: 700, height: 250 } });

// Le « + » vient de créer un document vide : on repart d'une page neuve (le modèle par défaut chargé) pour la suite.
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
await page.waitForTimeout(300);

// 2) le curseur reste dans le texte
const para = await rectOf(page, '.ProseMirror p');
await page.mouse.click(para.r - 3, para.y); await page.keyboard.press('End'); await page.keyboard.type(' ab');
for (const [label, btn] of [['Qualité PDF', '#v2-btn-quality'], ['Titre', '#v2-heading-chip']]) {
  await realClick(page, btn, 300);
  const stayed = await inEditor(page);
  await page.keyboard.type('x');
  const text = await editorText(page);
  check(`${label} : après un vrai clic, le curseur est resté dans le texte et la frappe suivante y arrive`, stayed && text.endsWith(' abx'), { stayed, focus: await activeId(page), text });
  await page.keyboard.press('Backspace');
  await away(page);
}

// 3) un champ de saisie qui avait le focus (renommage) est validé et refermé au clic, le clic n'est pas perdu
await realClick(page, '#btn-rename-template', 250);
await page.keyboard.press('End'); await page.keyboard.type(' renommé en route');
await realClick(page, '#v2-btn-quality', 500);
const ren = await page.evaluate(() => ({ hidden: document.getElementById('template-name').hidden, label: document.querySelector('.tts-trigger-label').textContent, focus: document.activeElement && (document.activeElement.id || document.activeElement.tagName) }));
check('renommer puis cliquer Qualité PDF : le champ se referme, le nom tapé est affiché dans la liste, le bouton n’a pas gardé le focus', ren.hidden && /renommé en route/.test(ren.label) && ren.focus !== 'v2-btn-quality', { ren });
await away(page);

// 4) le clavier est intact (le bouton Portrait / Paysage, ajouté entre Aperçu A4 et Qualité PDF, est le dernier avant lui dans l'ordre de Tab)
await page.focus('#btn-page-orientation');
await page.keyboard.press('Tab');
const kq = await page.evaluate(() => ({ active: document.activeElement.id, open: getComputedStyle(document.getElementById('v2-quality-flyout')).display, expanded: document.getElementById('v2-btn-quality').getAttribute('aria-expanded') }));
check('Tab depuis Portrait / Paysage : on arrive sur Qualité PDF, son menu s’ouvre (focus clavier)', kq.active === 'v2-btn-quality' && kq.open === 'flex' && kq.expanded === 'true', kq);
await page.keyboard.press('Tab');
const kq2 = await page.evaluate(() => ({ active: document.activeElement.id, open: getComputedStyle(document.getElementById('v2-quality-flyout')).display, expanded: document.getElementById('v2-btn-quality').getAttribute('aria-expanded') }));
check('Tab suivant : le menu de Qualité PDF se referme', kq2.open === 'none' && kq2.expanded === 'false' && kq2.active !== 'v2-btn-quality', kq2);
await page.focus('#btn-save');
const u0 = await page.evaluate(() => window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles'));
await page.keyboard.press('Enter'); await page.waitForTimeout(600);
const u1 = await page.evaluate(() => window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles'));
check('Entrée sur le bouton Enregistrer (focus clavier) enregistre toujours : une écriture, sous le nom renommé', u1 - u0 === 1 && /Enregistré à/.test(await statusOf(page)) && (await names(page)).some(n => /renommé en route$/.test(n)), { u0, u1, status: await statusOf(page), names: await names(page) });
await page.evaluate(() => document.activeElement && document.activeElement.blur());
await away(page);

// 5) une ligne de menu ordinaire se clique toujours, son menu se referme aussi (descente tout droit sous le bouton, puis vers la ligne : le menu reste ouvert tout du long)
const btnC = await hover(page, '#btn-new');
const rowC = await rectOf(page, '#v2-btn-new-email');
await page.mouse.move(btnC.x, rowC.y, { steps: 10 });
await page.mouse.move(rowC.x, rowC.y, { steps: 4 });
await page.mouse.click(rowC.x, rowC.y); await page.waitForTimeout(600);
const mail = await page.evaluate(() => ({ createBtn: getComputedStyle(document.getElementById('btn-create-email')).display }));
await away(page);
check('une ligne de menu ordinaire (« Nouvel email ») se clique toujours : le mode email s’ouvre, le menu se referme souris partie', mail.createBtn !== 'none' && !(await open(page, '#v2-new-template-flyout')), { mail });

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await page.context().close();
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
