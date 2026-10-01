#!/usr/bin/env node
// Fenêtre Réglages à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis sombre, en
// français puis en anglais - audit UX/UI du 2026-09-29, F2 : 360px pour six onglets (« Touche de déclenchement » sur deux lignes, « Marges de page » sur
// trois, « Crédits » rogné) et, dans Accès, un contenu de 529px pour une fenêtre de 376px qui emportait « Fermer » 93px sous le bas du panneau.
// Cible : 480px, sept onglets (six avant « Raccourcis ») sur UNE ligne aux libellés courts, titre et onglets fixes, SEUL le contenu de l'onglet défile, « Fermer » fixe en bas.
// Lancé par run-headless.mjs (groupe Node "settingsWindowMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-settings-window-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SETTINGS_WINDOW_MOUSE_PORT || 8901);
const WIDTH = 700;
const HEIGHT = 400;
const TABS = ['language', 'theme', 'triggerKey', 'pageMargins', 'access', 'credits'];

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-read-mode-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-settings-window-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => d.accept().catch(() => {}));
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
  // Semé avant le démarrage : une table de données (l'onglet Accès en liste les colonnes) et un modèle ouvert par défaut. Aucun réglage de droits.
  await page.addInitScript(() => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text', Email: 'Text', Actif: 'Bool' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont', Email: 'dupont@exemple.fr', Actif: true }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>.</p>');
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
  return { context, page };
}

async function boxOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
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

// Géométrie de la fenêtre Réglages telle que l'écran la montre : fenêtre, onglets, onglet visible, bouton Fermer (et ce qui reçoit un vrai point de contact
// à son centre).
const measure = page => page.evaluate(() => {
  const box = document.querySelector('#settings-modal .settings-modal-content');
  const rect = el => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const tabs = Array.from(box.querySelectorAll('.settings-tab')).map(t => Object.assign({ name: t.getAttribute('data-settings-tab'), text: t.textContent.trim(), cut: t.scrollWidth > t.clientWidth }, rect(t)));
  const close = document.getElementById('settings-close');
  const closeRect = rect(close);
  const hit = document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2);
  const panel = box.querySelector('.settings-panel:not([hidden])');
  const panelStyle = panel ? getComputedStyle(panel) : null;
  // Ce qui fait défiler le contenu de l'onglet : le premier ancêtre du panneau (lui compris) à défilement vertical, dans le cadre. Depuis la base commune des
  // fenêtres c'est la zone de contenu (.settings-body, qui porte les sept panneaux) ; avant, c'était le panneau lui-même.
  let scroller = panel;
  while (scroller && scroller !== box && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
  if (scroller === box) scroller = null;
  return {
    vw: innerWidth, vh: innerHeight,
    box: rect(box), boxScroll: { scrollHeight: box.scrollHeight, clientHeight: box.clientHeight },
    tabs, close: closeRect, closeTouched: hit === close || close.contains(hit),
    panel: panel ? Object.assign({ name: panel.getAttribute('data-settings-panel'), scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight, overflowY: panelStyle.overflowY, scrollTop: panel.scrollTop }, rect(panel)) : null,
    scroller: scroller ? Object.assign({ scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight, overflowY: getComputedStyle(scroller).overflowY, scrollTop: scroller.scrollTop, holdsTabs: box.querySelector('.settings-tab') ? scroller.contains(box.querySelector('.settings-tab')) : false }, rect(scroller)) : null,
    pageScrolls: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight || document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth,
  };
});

function tabsProblem(m) {
  const tops = m.tabs.map(t => t.top);
  const oneRow = Math.max(...tops) - Math.min(...tops) <= 1 && m.tabs.every(t => t.height <= 40);
  const cut = m.tabs.filter(t => t.cut).map(t => t.text);
  const last = m.tabs[m.tabs.length - 1];
  const inside = last.right <= m.box.right - 18 && m.tabs[0].left >= m.box.left + 18;
  return oneRow && cut.length === 0 && inside ? null : { oneRow, heights: m.tabs.map(t => Math.round(t.height)), cut, lastRight: Math.round(last.right), boxRight: Math.round(m.box.right) };
}

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Fenêtre Réglages à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await realClick(page, '#v2-btn-settings');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('settings-modal')).display !== 'none', null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);

  for (const lang of ['fr', 'en']) {
    if (lang === 'en') {
      await realClick(page, '#settings-modal .settings-tab[data-settings-tab="language"]');
      await realClick(page, 'input[name="settings-lang"][value="en"]');
      await page.waitForTimeout(400);
    }
    const tag = `${label}, ${lang === 'fr' ? 'français' : 'anglais'}`;
    const bad = { size: [], tabs: [], fits: [], boxScroll: [], close: [] };
    let accessMeasure = null;
    for (const name of TABS) {
      await realClick(page, `#settings-modal .settings-tab[data-settings-tab="${name}"]`);
      await page.waitForTimeout(150);
      const m = await measure(page);
      if (name === 'access') accessMeasure = m;
      if (m.panel && m.panel.name !== name) bad.size.push({ name, shown: m.panel.name });
      if (Math.round(m.box.width) !== 480) bad.size.push({ name, width: Math.round(m.box.width) });
      const t = tabsProblem(m);
      if (t) bad.tabs.push({ name, t });
      if (!(m.box.left >= 0 && m.box.top >= 0 && m.box.right <= m.vw && m.box.bottom <= m.vh) || m.pageScrolls) bad.fits.push({ name, box: m.box, vw: m.vw, vh: m.vh, pageScrolls: m.pageScrolls });
      if (m.boxScroll.scrollHeight > m.boxScroll.clientHeight + 1) bad.boxScroll.push({ name, boxScroll: m.boxScroll });
      if (!(m.close.top >= m.box.top && m.close.bottom <= m.box.bottom && m.close.bottom <= m.vh && m.closeTouched)) bad.close.push({ name, close: m.close, box: m.box, vh: m.vh, touched: m.closeTouched });
    }
    check(`${tag} - la fenêtre fait 480px de large sur les sept onglets`, bad.size.length === 0, bad.size);
    check(`${tag} - les sept onglets tiennent sur une ligne, aucun libellé coupé, « Crédits » dans la fenêtre`, bad.tabs.length === 0, bad.tabs);
    check(`${tag} - la fenêtre tient dans le panneau (ni la page ni la fenêtre ne défilent)`, bad.fits.length === 0 && bad.boxScroll.length === 0, { fits: bad.fits, boxScroll: bad.boxScroll });
    check(`${tag} - « Fermer » reste entier dans la fenêtre et dans le panneau, et reçoit un vrai point de contact, sur chaque onglet`, bad.close.length === 0, bad.close);

    // Accès : le contenu est plus haut que la place restante - il défile lui-même (molette réelle), « Fermer » ne bouge pas et la dernière note devient visible.
    await realClick(page, '#settings-modal .settings-tab[data-settings-tab="access"]');
    await page.waitForTimeout(150);
    const before = await measure(page);
    check(`${tag} - Accès : le contenu défile dans son propre cadre (${before.scroller ? before.scroller.scrollHeight : '?'}px pour ${before.scroller ? Math.round(before.scroller.clientHeight) : '?'}px), sans les onglets`,
      !!before.scroller && /auto|scroll/.test(before.scroller.overflowY) && before.scroller.scrollHeight > before.scroller.clientHeight + 4 && !before.scroller.holdsTabs, before.scroller);
    const p = before.scroller;
    if (p) {
      await page.mouse.move(p.left + p.width / 2, p.top + Math.min(20, p.height / 2), { steps: 3 });
      for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 250);
      await page.waitForTimeout(250);
    }
    const after = await measure(page);
    // Vu depuis le cadre qui défile : la dernière note est entière dans ce que la fenêtre en montre (le contenu plus bas est rogné, pas visible).
    const lastHint = await page.evaluate(() => {
      const hints = document.querySelectorAll('.settings-panel:not([hidden]) .settings-access-hint');
      const h = hints[hints.length - 1];
      let scroller = document.querySelector('.settings-panel:not([hidden])');
      while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
      if (!h || !scroller) return null;
      const r = h.getBoundingClientRect(), pr = scroller.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, scrollerTop: pr.top, scrollerBottom: pr.bottom, inside: r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1 };
    });
    check(`${tag} - Accès : la molette fait défiler le contenu, « Fermer » ne bouge pas, la dernière note devient visible`,
      !!after.scroller && after.scroller.scrollTop > 0 && Math.abs(after.close.top - before.close.top) < 1 && after.closeTouched && !!lastHint && lastHint.inside, { scrollTop: after.scroller && after.scroller.scrollTop, closeBefore: before.close.top, closeAfter: after.close.top, lastHint });
  }

  // Vrai clic sur Fermer : la fenêtre se ferme.
  await realClick(page, '#settings-close');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => getComputedStyle(document.getElementById('settings-modal')).display === 'none');
  check(`${label} - vrai clic sur « Fermer » : la fenêtre se ferme`, closed);
  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
