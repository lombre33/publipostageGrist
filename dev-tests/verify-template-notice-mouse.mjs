#!/usr/bin/env node
// La notice du document (js/template-notice.js, demande d'Antoine du 23/11) à la VRAIE souris et au vrai clavier, à la taille du panneau Grist d'Antoine (~700x400), en clair et français puis
// en sombre et anglais : les scénarios de dev-tests/scenarios-template-notice.js tournent DANS la page (dispatchEvent) et ne prouvent ni qu'un vrai survol du crayon ouvre son menu
// (que l'`overflow` du cluster du nom ne rogne pas), ni que le bandeau fin tient sous la barre sans la faire déborder, ni que la fenêtre, avec son éditeur, tient dans 700x400.
//   1) un document qui a une notice : le bandeau « Notice » est sous la barre d'outils, fin (36 px au plus), « Lire » et « Fermer » au premier plan, aucun défilement horizontal ;
//   2) le survol du crayon ouvre un menu à deux lignes (« Renommer », « Notice du document… ») qui tient dans la fenêtre ; un vrai clic sur la seconde ouvre la fenêtre, qui tient dans 700x400 ;
//   3) Échap ferme la fenêtre ; « Fermer » du bandeau le range (le texte remonte) ; le crayon seul renomme toujours, et la ligne « Renommer » aussi ;
//   4) un document sans notice : pas de bandeau, la ligne dit « Ajouter une notice… » ; on écrit au clavier, un vrai clic sur « Enregistrer la notice » l'écrit (le bandeau apparaît) ;
//   5) au clavier : le focus sur le crayon ouvre son menu, Tab atteint les deux lignes, Entrée sur la seconde ouvre la fenêtre ; l'éditeur de la fenêtre et ses boutons tiennent dans 700x400.
// Lancé par run-headless.mjs (groupe Node "templateNoticeMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-template-notice-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TEMPLATE_NOTICE_MOUSE_PORT || 8909);
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

const OFFLINE = existsSync(join(CACHE, 'umd'));
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-template-notice-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];
const NOTICE = '<h3>Mode d’emploi</h3><p>Choisissez la <strong>ligne</strong>, puis exportez en PDF.</p><ul><li>Premier point</li><li>Second point</li></ul><p><a href="https://exemple.fr">Aide en ligne</a></p>';
const TEMPLATES = `
    const m = stub.state.rows.Publipostage_Modeles;
    m.Notice = m.id.map(() => '');
    const add = (id, nom, html, def, notice) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(html); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); m.Notice.push(notice || ''); };
    add(1, 'Bail habitation', '<p>Contenu du bail</p>', false, ${JSON.stringify(NOTICE)});
    add(2, 'Contrat de vente', '<p>Contenu de la vente</p>', true, '');
    stub.state.nextRowId.Publipostage_Modeles = 3;
`;

async function openPage(extraSeed, lang) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: Number(process.env.NOTICE_DSF || 1) });
  const page = await context.newPage();
  if (lang) await page.addInitScript(l => { try { localStorage.setItem('pp_lang', l); } catch (e) { /* rien */ } }, lang); // une page qui DÉMARRE dans cette langue : changer de langue recharge la page
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  if (OFFLINE) {
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
const SHOTS = process.env.TEMPLATE_NOTICE_SHOTS || mkdtempSync(join(tmpdir(), 'template-notice-'));
mkdirSync(SHOTS, { recursive: true });

const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!top && (top === e || e.contains(top)) };
}, sel);
async function realClick(page, sel, wait = 250) {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 3 }); await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
// Un vrai survol : la souris arrive sur le crayon et y reste.
async function realHover(page, sel, wait = 350) {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 14, c.y + 2, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(wait);
  return c;
}
const windowShown = (page) => page.evaluate(() => { const m = document.getElementById('pp-notice-modal'); return !!m && !m.hidden && getComputedStyle(m).display !== 'none'; });
const inside = (r, vw, vh) => !!r && r.l >= 0 && r.t >= 0 && r.r <= vw && r.b <= vh;
const pickDocument = (page, id) => page.evaluate(async (value) => {
  const select = document.getElementById('template-select');
  select.value = String(value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 500));
}, id);
const TEXT = {
  light: { lang: 'fr', bar: 'Notice', row: 'Notice du document…', add: 'Ajouter une notice…', rename: 'Renommer', read: 'Lire', close: 'Fermer', save: 'Enregistrer la notice', title: /^Notice : /, tool: 'Titre' },
  dark: { lang: 'en', bar: 'Instructions', row: 'Document instructions…', add: 'Add instructions…', rename: 'Rename', read: 'Read', close: 'Close', save: 'Save instructions', title: /^Instructions: /, tool: 'Heading' },
};

for (const theme of ['light', 'dark']) {
  const T = theme === 'light' ? 'clair/français' : 'sombre/anglais';
  const X = TEXT[theme];
  console.log(`\n== ${T} ==`);
  const page = await openPage('', X.lang);
  await page.evaluate((t) => Settings.setTheme(t), theme);
  await page.waitForTimeout(200);
  await pickDocument(page, 1);

  // 1) le bandeau
  const bar = await page.evaluate(() => { const b = document.getElementById('pp-notice-bar'); const r = b.getBoundingClientRect(); const tool = document.getElementById('toolbar-top').getBoundingClientRect(); return { hidden: b.hidden, h: r.height, w: r.width, top: r.top, toolbarBottom: tool.bottom, title: b.querySelector('.pp-notice-bar-title').textContent, sw: document.documentElement.scrollWidth, vw: innerWidth }; });
  check(`${T} : le document à notice montre le bandeau « ${X.bar} »`, !bar.hidden && bar.title === X.bar && bar.h > 0 && bar.h <= 36, bar);
  check(`${T} : le bandeau tient dans la largeur, sans défilement horizontal`, bar.w <= bar.vw && bar.sw <= bar.vw, bar);
  const read = await rectOf(page, '.pp-notice-bar-read'), close = await rectOf(page, '.pp-notice-bar-close');
  check(`${T} : « ${X.read} » et « ${X.close} » sont dans la fenêtre et au premier plan`, inside(read, 700, 400) && inside(close, 700, 400) && read.onTop && close.onTop, { read, close });
  await page.screenshot({ path: SHOTS + `/bandeau-${theme}.png` });

  // 2) le menu du crayon
  await realHover(page, '#btn-rename-template');
  const menu = await page.evaluate(() => { const f = document.getElementById('v2-rename-flyout'); const r = f.getBoundingClientRect(); return { shown: getComputedStyle(f).display !== 'none', l: r.left, t: r.top, r: r.right, b: r.bottom, rows: Array.from(f.querySelectorAll('.v2-hover-row')).map(e => e.textContent.trim()) }; });
  check(`${T} : le survol du crayon ouvre son menu, entier dans la fenêtre, avec « ${X.rename} » et « ${X.row} »`, menu.shown && inside(menu, 700, 400) && menu.rows.length === 2 && menu.rows[0] === X.rename && menu.rows[1] === X.row, menu);
  await page.screenshot({ path: SHOTS + `/menu-${theme}.png` });
  const rowTop = await rectOf(page, '#v2-notice-row');
  check(`${T} : la ligne de la notice est au premier plan (le cluster du nom ne la rogne pas)`, !!rowTop && rowTop.onTop, rowTop);
  await realClick(page, '#v2-notice-row', 500);
  check(`${T} : un vrai clic sur la ligne ouvre la fenêtre de la notice`, await windowShown(page));
  const win = await page.evaluate(() => { const b = document.querySelector('#pp-notice-modal .pp-notice-box'); const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, title: document.getElementById('pp-notice-title').textContent, text: document.getElementById('pp-notice-view').textContent, link: !!document.querySelector('#pp-notice-view a[target="_blank"][rel~="noopener"]') }; });
  check(`${T} : la fenêtre tient dans 700x400, titre « ${X.bar} : … », texte lu, lien qui s’ouvre à part`, inside(win, 700, 400) && X.title.test(win.title) && win.text.includes('Mode d’emploi') && win.link, win);
  await page.screenshot({ path: SHOTS + `/lecture-${theme}.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check(`${T} : Échap ferme la fenêtre`, !(await windowShown(page)));

  // 3) Fermer le bandeau, puis le crayon et « Renommer »
  const editorTop0 = await page.evaluate(() => Math.round(document.getElementById('editor-container').getBoundingClientRect().top));
  await realClick(page, '.pp-notice-bar-close');
  const afterClose = await page.evaluate(() => ({ hidden: document.getElementById('pp-notice-bar').hidden, top: Math.round(document.getElementById('editor-container').getBoundingClientRect().top) }));
  check(`${T} : « ${X.close} » range le bandeau et le texte remonte`, afterClose.hidden && afterClose.top < editorTop0, { editorTop0, afterClose });
  await realClick(page, '#btn-rename-template');
  check(`${T} : le crayon seul renomme toujours (le champ s’ouvre)`, await page.evaluate(() => !document.getElementById('template-name').hidden));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  await realHover(page, '#btn-rename-template');
  await realClick(page, '#v2-rename-row');
  check(`${T} : la ligne « ${X.rename} » ouvre le même champ`, await page.evaluate(() => !document.getElementById('template-name').hidden));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  await page.mouse.move(600, 300); await page.waitForTimeout(250);

  // 4) un document sans notice : on écrit au clavier
  await pickDocument(page, 2);
  const none = await page.evaluate(() => ({ hidden: document.getElementById('pp-notice-bar').hidden, row: document.getElementById('v2-notice-row').textContent }));
  check(`${T} : un document sans notice n’a pas de bandeau et sa ligne dit « ${X.add} »`, none.hidden && none.row === X.add, none);
  await realHover(page, '#btn-rename-template');
  await realClick(page, '#v2-notice-row', 900);
  const editor = await page.evaluate(() => { const box = document.querySelector('#pp-notice-modal .pp-notice-box').getBoundingClientRect(); const ok = document.getElementById('pp-notice-ok').getBoundingClientRect(); const tools = document.getElementById('pp-notice-tools'); return { box: { l: box.left, t: box.top, r: box.right, b: box.bottom }, ok: { l: ok.left, t: ok.top, r: ok.right, b: ok.bottom }, tools: tools.hidden ? 0 : tools.querySelectorAll('button').length, focus: document.activeElement && document.activeElement.closest('#pp-notice-editor') !== null, okText: document.getElementById('pp-notice-ok').textContent }; });
  check(`${T} : la fenêtre d’écriture, ses six outils et « ${X.save} » tiennent dans 700x400, le focus est dans le texte`, inside(editor.box, 700, 400) && inside(editor.ok, 700, 400) && editor.tools === 6 && editor.focus && editor.okText === X.save, editor);
  await page.keyboard.type('Remplir la ligne, puis exporter.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ne rien changer au texte.');
  await page.waitForTimeout(150);
  await page.screenshot({ path: SHOTS + `/ecriture-${theme}.png` });
  await realClick(page, '#pp-notice-ok', 700);
  const saved = await page.evaluate(() => ({ stored: Templates.byId(Templates.getCurrentId()).notice, bar: !document.getElementById('pp-notice-bar').hidden, read: !document.getElementById('pp-notice-view').hidden, status: document.getElementById('status-msg').textContent }));
  check(`${T} : « ${X.save} » écrit la notice (deux paragraphes), le bandeau apparaît, la fenêtre repasse en lecture`, saved.stored.includes('<p>Remplir la ligne, puis exporter.</p>') && saved.stored.includes('<p>Ne rien changer au texte.</p>') && saved.bar && saved.read, saved);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // 5) au clavier
  await pickDocument(page, 1);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  await page.focus('#btn-rename-template'); await page.waitForTimeout(300);
  const kbMenu = await page.evaluate(() => getComputedStyle(document.getElementById('v2-rename-flyout')).display !== 'none');
  check(`${T} : le focus sur le crayon ouvre son menu`, kbMenu);
  await page.keyboard.press('Tab'); await page.waitForTimeout(80);
  const first = await page.evaluate(() => document.activeElement && document.activeElement.id);
  await page.keyboard.press('Tab'); await page.waitForTimeout(80);
  const second = await page.evaluate(() => document.activeElement && document.activeElement.id);
  check(`${T} : Tab atteint « ${X.rename} » puis « ${X.row} »`, first === 'v2-rename-row' && second === 'v2-notice-row', { first, second });
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  check(`${T} : Entrée sur la ligne ouvre la fenêtre`, await windowShown(page));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check(`${T} : ... Échap la referme`, !(await windowShown(page)));
  await page.screenshot({ path: SHOTS + `/fin-${theme}.png` });
  await page.context().close();
}

check('aucune erreur de page', pageErrors.length === 0, pageErrors.slice(0, 3));
console.log(`\nCaptures : ${SHOTS}`);
await browser.close();
server.close();
console.log(`${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
