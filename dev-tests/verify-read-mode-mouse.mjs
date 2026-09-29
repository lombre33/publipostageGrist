#!/usr/bin/env node
// Mode Lecture ordinaire (tous les droits, aucun réglage) à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau Grist d'Antoine
// (~700x400), en thème clair puis sombre - audit UX/UI du 2026-09-29, F1 : l'éditeur y est masqué mais la barre de mise en forme restait active, trois
// clics sur Tableau, Sommaire ou Citation modifiaient le modèle caché et l'auto-save l'enregistrait sans rien montrer.
// dev-tests/scenarios-access-rights.js (access_read_mode_greys_formatting_bar_and_writes_nothing) le vérifie DANS la page (.click()) ; ici, la barre est
// grisée aux PIXELS d'une vraie capture (pas une classe ni une opacité lue), les clics sont de vrais gestes, et ce qui doit rester actif l'est.
// Lancé par run-headless.mjs (groupe Node "readModeMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-read-mode-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.READ_MODE_MOUSE_PORT || 8900);
const WIDTH = 700;
const HEIGHT = 400;

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
if (!OFFLINE) console.log('[verify-read-mode-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  // Boîtes du navigateur (alert/confirm) : acceptées et consignées, jamais bloquantes.
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
  // Semé avant le démarrage : un modèle « Contrat » enregistré et ouvert par défaut, une ligne de données ; AUCUN réglage de droits, donc tous les droits.
  await page.addInitScript(() => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p><p>Second paragraphe du modèle.</p>');
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

// « Encre » d'un contrôle sur une VRAIE capture d'écran (décodée dans la page, comme dev-tests/verify-small-panel.mjs) : écart moyen entre ses pixels et
// celui de son coin (le fond) - un contrôle grisé, clair ou sombre, y est nettement plus faible, quel que soit le thème.
async function ink(page, selector) {
  const b = await boxOf(page, selector);
  if (!b || !b.inViewport) return null;
  const png = await page.screenshot({ clip: { x: Math.ceil(b.left), y: Math.ceil(b.top), width: Math.floor(b.w) - 1, height: Math.floor(b.h) - 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]);
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

const INSERT_IDS = ['v2-btn-table', 'v2-btn-two-columns', 'v2-btn-page-break', 'v2-btn-toc', 'v2-btn-citation'];
const stateOf = page => page.evaluate(() => {
  const s = window.__gristStub;
  return { doc: EditorCore.getEditor().getHTML(), stored: s.getRow('Publipostage_Modeles', 1).Contenu, writes: s.countActions('UpdateRecord', 'Publipostage_Modeles') };
});

async function runTheme(theme) {
  console.log(`\n=== Mode Lecture à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${theme === 'dark' ? 'sombre' : 'clair'} ===`);
  const { context, page } = await openWidget(theme);
  const label = `${theme === 'dark' ? 'sombre' : 'clair'}`;

  // Édition : les cinq boutons d'insertion sont dans le panneau, avec leur encre normale (référence).
  const editInk = {};
  for (const id of INSERT_IDS) editInk[id] = await ink(page, '#' + id);
  check(`${label} - en Édition, les cinq boutons d'insertion sont visibles dans le panneau, avec de l'encre`,
    INSERT_IDS.every(id => editInk[id] != null && editInk[id] > 8), editInk);

  // Vrai clic sur Mode lecture : l'éditeur disparaît, le mode Lecture s'affiche.
  await realClick(page, '#btn-mode-read');
  await page.waitForFunction(() => document.getElementById('reader-container').style.display === 'block' && !!document.querySelector('#reader-container .reader-content'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const read = await page.evaluate(() => ({ reader: document.getElementById('reader-container').style.display, editor: document.getElementById('editor-container').style.display }));
  check(`${label} - vrai clic sur Mode lecture : mode Lecture affiché, éditeur caché`, read.reader === 'block' && read.editor === 'none', read);

  // La barre est grisée aux pixels : chaque bouton d'insertion garde au plus 60 % de son encre (l'opacité de la classe est de 35 %).
  const readInk = {};
  for (const id of INSERT_IDS) readInk[id] = await ink(page, '#' + id);
  check(`${label} - en Lecture, les boutons d'insertion sont grisés aux pixels (moins de 60 % de leur encre)`,
    INSERT_IDS.every(id => readInk[id] != null && readInk[id] < 0.6 * editInk[id]), { editInk, readInk });

  // Trois clics de la preuve d'audit (Tableau, Sommaire, Citation), plus 2 colonnes et Saut de page, puis plus d'un tick d'auto-save (2,5 s).
  const before = await stateOf(page);
  for (const id of INSERT_IDS) await realClick(page, '#' + id);
  await page.waitForTimeout(4500);
  const after = await stateOf(page);
  check(`${label} - en Lecture, cinq vrais clics d'insertion ne modifient pas le document`, after.doc === before.doc, { before: before.doc.length, after: after.doc.length });
  check(`${label} - ... ni le modèle enregistré (contenu identique, aucune écriture de l'auto-save)`,
    after.stored === before.stored && after.writes === before.writes, { storedBefore: before.stored.length, storedAfter: after.stored.length, writesBefore: before.writes, writesAfter: after.writes });

  // Ce qui reste actif en Lecture, à la vraie souris : réglages, aperçu A4, survol de l'export ; le bouton d'export répond à un vrai point de contact.
  await realClick(page, '#v2-btn-settings');
  await page.waitForTimeout(300);
  const settingsOpen = await page.evaluate(() => getComputedStyle(document.getElementById('settings-modal')).display !== 'none');
  await realClick(page, '#settings-close');
  await page.waitForTimeout(300);
  const a4Before = await page.evaluate(() => document.getElementById('reader-container').classList.contains('a4-preview'));
  await realClick(page, '#v2-a4-toggle');
  await page.waitForTimeout(300);
  const a4After = await page.evaluate(() => document.getElementById('reader-container').classList.contains('a4-preview'));
  await realClick(page, '#v2-a4-toggle');
  const exportTouch = await page.evaluate(() => {
    const el = document.getElementById('btn-export-pdf');
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && el.contains(hit);
  });
  check(`${label} - en Lecture, réglages, aperçu A4 et export répondent toujours à la vraie souris`, settingsOpen && a4Before !== a4After && exportTouch, { settingsOpen, a4Before, a4After, exportTouch });

  // Retour en Édition : l'encre revient et un vrai clic sur Tableau insère bien un tableau (rien n'est perdu de l'édition).
  await realClick(page, '#btn-mode-edit');
  await page.waitForTimeout(600);
  const backInk = {};
  for (const id of INSERT_IDS) backInk[id] = await ink(page, '#' + id);
  check(`${label} - retour en Édition : les boutons retrouvent leur encre (au moins 90 %)`,
    INSERT_IDS.every(id => backInk[id] != null && backInk[id] >= 0.9 * editInk[id]), { editInk, backInk });
  await realClick(page, '#v2-btn-table');
  await page.waitForTimeout(400);
  const tables = await page.evaluate(() => (EditorCore.getEditor().getHTML().match(/<table/g) || []).length);
  check(`${label} - retour en Édition : un vrai clic sur Tableau insère un tableau`, tables === 1, { tables });
  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
