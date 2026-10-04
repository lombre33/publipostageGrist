#!/usr/bin/env node
// Fenêtre qui précède un export dont le modèle contient une image d'un site externe (js/external-images.js, choix d'Antoine du 2026-10-01 « Fenêtre avant
// l'export ») à 700x400 (le panneau d'Antoine), à la VRAIE souris (page.mouse) et au VRAI clavier (Tab, Échap), en clair, en sombre et en anglais, par le vrai
// clic sur le vrai bouton : « Exporter en PDF », « Exporter en DOCX », « Exporter toutes les lignes (ZIP) ».
// Un vrai réseau de test : les adresses en « .test » sont servies par la page de Playwright (page.route) et chaque requête est notée avec son type. L'image que
// l'éditeur AFFICHE est une requête 'image' (inchangée) ; le téléchargement de l'EXPORT est une requête 'fetch' : c'est elle qui ne doit jamais partir avant
// « Continuer », ni après « Annuler ». Les téléchargements de fichiers sont les vrais (événement `download` de Playwright).
// Quatre parties : 1) un PDF d'une ligne (Annuler au clic, Échap, Tab, Continuer) ; 2) un DOCX d'une ligne ; 3) un lot ZIP (deux fenêtres à la suite, un refus arrête
// tout le lot, une seule question pour toutes les lignes) ; 4) quarante sites (le titre et les boutons restent, seule la liste défile), un seul site, anglais.
// Lancé par run-headless.mjs (groupe Node "externalImagesMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-external-images-mouse.mjs
// EXTERNAL_IMAGES_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EXTERNAL_IMAGES_MOUSE_PORT || 8914);
const SHOTS = process.env.EXTERNAL_IMAGES_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-dialogs-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-external-images-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const DATA_PNG = 'data:image/png;base64,' + PNG.toString('base64');

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
const downloads = [];
page.on('download', d => downloads.push(d.suggestedFilename()));
const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });
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
// Les sites « .test » : servis par la page de test, notés avec leur type ('fetch' = l'export qui télécharge, 'image' = l'éditeur qui affiche). L'en-tête CORS
// laisse fetch lire la réponse, comme un vrai site qui l'autorise.
const net = { fetch: [], image: [] };
await page.route(url => url.hostname.endsWith('.test'), async route => {
  const request = route.request();
  (request.resourceType() === 'fetch' ? net.fetch : net.image).push(request.url());
  await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG });
});

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });

// Centre d'un élément et ce qui s'y trouve réellement au premier plan.
async function hitTest(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width,
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
const seen = box => box.found && box.inViewport && box.onTop;
async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const inPanel = box => box.l >= 0 && box.t >= 0 && box.r <= WIDTH && box.b <= HEIGHT;
const isOpen = () => page.evaluate(() => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && ov.style.display !== 'none'; });
const statusText = () => page.evaluate(() => document.getElementById('status-msg').textContent);
const tr = (key, params) => page.evaluate(({ key, params }) => I18n.t(key, params), { key, params });
const clearStatus = () => page.evaluate(() => { document.getElementById('status-msg').textContent = ''; });
const CANCEL = '#pp-dialog-modal .pp-modal-actions button:first-of-type';
const OK = '#pp-dialog-modal .var-modal-primary';

// Centre d'un élément (amené dans la vue), vrai déplacement puis vrai clic.
async function centerOf(selector) {
  return page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, onTop: !!top && (top === e || e.contains(top)) };
  }, selector);
}
async function realClick(selector, wait = 300) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
async function realHover(selector) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 30, c.y + 5, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(450);
}
// Le verrou d'export (withExportLock, js/main.js) retire les clics du bouton ou de la ligne de menu (et grise le bouton) pendant l'export, fenêtre comprise.
const isLocked = id => page.evaluate(id => document.getElementById(id).style.pointerEvents === 'none', id);
// Les images du document, telles que l'éditeur les affiche : toutes chargées, comme avant.
const imagesDisplayed = () => page.evaluate(() => { const list = Array.from(document.querySelectorAll('.tiptap img.editor-image')); return list.length > 0 && list.every(i => i.complete && i.naturalWidth > 0); });

// La fenêtre d'une demande : ce qui est affiché, où, et où est le focus.
const windowState = () => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  const box = ov.querySelector('.modal-content');
  const body = ov.querySelector('.pp-modal-body');
  const message = ov.querySelector('.pp-dialog-message');
  const a = document.activeElement;
  const r = box.getBoundingClientRect();
  const bullets = (message.textContent || '').split('\n').filter(l => l.startsWith('• ')).map(l => l.slice(2));
  return {
    open: ov.style.display !== 'none',
    title: ov.querySelector('h3').textContent,
    intro: (message.textContent || '').split('\n')[0],
    outro: (message.textContent || '').split('\n').filter(l => l.trim() && !l.startsWith('• ')).slice(-1)[0],
    bullets,
    buttons: Array.from(ov.querySelectorAll('.pp-modal-actions button')).map(b => b.textContent),
    focus: a && a.closest && a.closest('#pp-dialog-modal') ? a.textContent : 'hors de la fenêtre : ' + (a && (a.id || a.tagName)),
    box: { l: r.left, t: r.top, r: r.right, b: r.bottom },
    scroll: { client: body.clientHeight, content: body.scrollHeight, top: body.scrollTop },
    whiteSpace: getComputedStyle(message).whiteSpace,
  };
});
const IMAGES_TITLE = () => tr('dialog.externalImages.title');
// Attend que la fenêtre des images soit ouverte (la première fenêtre d'un lot - « Générer » - passe avant, elle a un autre titre).
async function waitImagesWindow(timeout = 45000) {
  const title = await IMAGES_TITLE();
  try {
    await page.waitForFunction(t => {
      const ov = document.getElementById('pp-dialog-modal');
      return !!ov && ov.style.display !== 'none' && ov.querySelector('h3').textContent === t;
    }, title, { timeout });
  } catch (e) {
    throw new Error(`la fenêtre « ${title} » ne s’est pas ouverte en ${timeout / 1000} s (état : « ${await statusText()} », ${net.fetch.length} téléchargement(s) déjà parti(s))`);
  }
  await page.waitForTimeout(150);
}
const waitStatus = (text, timeout = 60000) => page.waitForFunction(t => document.getElementById('status-msg').textContent === t, text, { timeout });
// L'événement `download` de Playwright arrive un instant APRÈS l'état « généré » : on l'attend avant de compter les fichiers.
async function waitDownload(pattern, timeout = 15000) {
  const startedAt = Date.now();
  while (!downloads.some(name => pattern.test(name)) && Date.now() - startedAt < timeout) await page.waitForTimeout(100);
}
const waitClosed = () => page.waitForFunction(() => document.getElementById('pp-dialog-modal').style.display === 'none', null, { timeout: 10000 });
// Combien de fois la fenêtre des images s'est ouverte (le compteur est dans la page, la vraie fenêtre s'ouvre quand même).
async function countImagesWindows() {
  await page.evaluate(() => {
    if (window.__imagesWindows !== undefined) return;
    window.__imagesWindows = 0;
    const real = Dialogs.confirm;
    Dialogs.confirm = function (opts) { if (opts && opts.title === I18n.t('dialog.externalImages.title')) window.__imagesWindows++; return real.apply(Dialogs, arguments); };
  });
}
const windowsOpened = () => page.evaluate(() => window.__imagesWindows);

const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
const img = src => `<img class="editor-image" src="${src}" alt="Image" style="width: 60px;">`;
const HOSTS = ['images.exemple.test', 'cdn.autre.test:8443', 'logos.troisieme.test'];
const documentHtml = (hosts) => `<p>Dossier : ${badge('ExtDossiers', 'Titre')}</p>` + hosts.map((h, i) => img(`https://${h}/logo${i}.png`)).join('') + img(DATA_PNG);
async function seed(html) {
  await page.evaluate(async html => {
    const stub = window.__gristStub;
    stub.setVariables('ExtDossiers', { Titre: 'Text' });
    stub.setRows('ExtDossiers', [{ id: 1, Titre: 'Dossier A' }, { id: 2, Titre: 'Dossier B' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Titre: 'Dossier A' }, 'ExtDossiers');
    Editor.setHTML(html);
  }, html);
  await page.waitForTimeout(500);
}
const manyHosts = n => Array.from({ length: n }, (_, i) => `site${String(i + 1).padStart(2, '0')}.exemple.test`);
const fetchedHosts = () => [...new Set(net.fetch.map(u => new URL(u).host))];

// Le bouton d'un export au vrai clic ; `menu` : le bouton à survoler d'abord pour ouvrir son menu (les lignes ne sont pas visibles sans survol).
async function startExport({ id, menu }) {
  if (menu) await realHover(menu);
  await realClick(id, 500);
}
const EXPORTS = {
  pdf: { id: '#btn-export-pdf', menu: null, button: 'btn-export-pdf', done: 'status.pdfGenerated', file: /\.pdf$/i },
  docx: { id: '#v2-btn-export-docx', menu: '#v2-btn-quality', button: 'v2-btn-export-docx', done: 'status.docxGenerated', file: /\.docx$/i },
};

// 1) et 2) Un export d'une ligne : la fenêtre au vrai clic, Annuler, Échap, Tab, puis Continuer.
async function runSingle(T, kind) {
  const E = EXPORTS[kind];
  const NAME = `${T}, ${kind.toUpperCase()} d’une ligne`;
  await seed(documentHtml(HOSTS));
  net.fetch.length = 0; net.image.length = 0; downloads.length = 0;
  await clearStatus();
  await startExport(E);
  await waitImagesWindow();
  const s = await windowState();
  const [title, intro, outro, okLabel, cancelLabel] = await Promise.all([IMAGES_TITLE(), tr('confirm.externalImages', { count: HOSTS.length, sites: '' }).then(t => t.split('\n')[0]), tr('confirm.externalImages', { count: 1, sites: '' }).then(t => t.split('\n').filter(l => l.trim()).slice(-1)[0]), tr('common.continue'), tr('common.cancel')]);
  check(`${NAME} : la fenêtre s’ouvre dans le panneau ${WIDTH}x${HEIGHT} avec son titre « ${title} » et les trois sites, dans l’ordre de la page`,
    s.open && inPanel(s.box) && s.title === title && s.intro === intro && JSON.stringify(s.bullets) === JSON.stringify(HOSTS), s);
  check(`${NAME} : la fin du message dit que « ${cancelLabel} » arrête l’export, les retours à la ligne sont gardés`, s.outro === outro && s.whiteSpace === 'pre-line', s);
  check(`${NAME} : boutons ${cancelLabel} et ${okLabel}, le focus est sur ${okLabel}`, JSON.stringify(s.buttons) === JSON.stringify([cancelLabel, okLabel]) && s.focus === okLabel, s);
  const [t1, o1, c1] = [await hitTest('#pp-dialog-modal h3'), await hitTest(OK), await hitTest(CANCEL)];
  check(`${NAME} : titre et boutons visibles et au premier plan`, seen(t1) && seen(o1) && seen(c1), { t1, o1, c1 });
  check(`${NAME} : rien n’est téléchargé tant que la fenêtre est ouverte (l’éditeur, lui, affiche ses images comme avant)`, net.fetch.length === 0 && await imagesDisplayed(), { fetch: net.fetch });
  check(`${NAME} : l’export est verrouillé pendant la fenêtre (pas de second export possible)`, await isLocked(E.button) === true, await isLocked(E.button));
  await snap(`${T}-${kind}-1-fenetre`);
  const inside = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); inside.push((await windowState()).focus.startsWith('hors') ? 'dehors' : 'dedans'); }
  check(`${NAME} : six appuis sur Tab restent dans la fenêtre`, inside.every(x => x === 'dedans'), inside);

  // Annuler au vrai clic : fenêtre fermée, « Export annulé. » (pas une erreur), rien téléchargé, rien produit, le bouton est rendu.
  await click(CANCEL);
  await waitClosed();
  await waitStatus(await tr('status.exportCancelled'), 10000);
  check(`${NAME} : « ${cancelLabel} » (vrai clic) ferme la fenêtre et écrit « Export annulé. » - ni erreur, ni téléchargement, ni fichier`,
    !(await isOpen()) && net.fetch.length === 0 && downloads.length === 0 && (await statusText()) === await tr('status.exportCancelled'), { status: await statusText(), fetch: net.fetch, downloads });
  check(`${NAME} : le verrou est rendu après l’annulation`, await isLocked(E.button) === false, await isLocked(E.button));

  // Échap annule de la même façon.
  await clearStatus();
  await startExport(E);
  await waitImagesWindow();
  await page.keyboard.press('Escape');
  await waitClosed();
  await waitStatus(await tr('status.exportCancelled'), 10000);
  check(`${NAME} : Échap annule de la même façon (« Export annulé. », rien téléchargé)`, net.fetch.length === 0 && downloads.length === 0 && (await statusText()) === await tr('status.exportCancelled'), { status: await statusText(), fetch: net.fetch });

  // Continuer au vrai clic : le téléchargement part, le fichier est produit, UNE seule fenêtre pour cet export.
  await clearStatus();
  const windowsBefore = await windowsOpened();
  await startExport(E);
  await waitImagesWindow();
  await click(OK);
  await waitStatus(await tr(E.done));
  await waitDownload(E.file);
  check(`${NAME} : « ${okLabel} » (vrai clic) télécharge les ${HOSTS.length} images, produit le fichier et écrit « ${await tr(E.done)} »`,
    JSON.stringify(fetchedHosts().sort()) === JSON.stringify([...HOSTS].sort()) && downloads.some(n => E.file.test(n)) && (await statusText()) === await tr(E.done), { fetched: fetchedHosts(), downloads, status: await statusText() });
  check(`${NAME} : une seule fenêtre pour cet export, rendue fermée`, (await windowsOpened()) - windowsBefore === 1 && !(await isOpen()), { opened: (await windowsOpened()) - windowsBefore });
}

async function click(selector) { const b = await hitTest(selector); if (b.found) await page.mouse.click(b.x, b.y); await page.waitForTimeout(200); return b; }

// 3) Un lot ZIP : la question du lot, puis celle des images ; un refus arrête tout le lot ; une seule question pour toutes les lignes.
async function runBatch(T) {
  const NAME = `${T}, lot PDF (ZIP) de deux lignes`;
  await seed(documentHtml(HOSTS));
  net.fetch.length = 0; downloads.length = 0;
  await clearStatus();
  await startExport({ id: '#v2-btn-export-pdf-batch', menu: '#btn-export-pdf' });
  const first = await windowState();
  check(`${NAME} : la première fenêtre est celle du lot (« Exporter toutes les lignes »), pas celle des images`, first.open && first.title === 'Exporter toutes les lignes', first);
  await click(OK);
  await waitImagesWindow();
  const s = await windowState();
  check(`${NAME} : « Générer » ouvre ensuite la fenêtre des images, dans le panneau, avec les trois sites`, s.open && inPanel(s.box) && JSON.stringify(s.bullets) === JSON.stringify(HOSTS), s);
  check(`${NAME} : rien n’est encore téléchargé`, net.fetch.length === 0, net.fetch);
  await snap(`${T}-lot-1-fenetre`);
  await click(CANCEL);
  await waitClosed();
  await waitStatus(await tr('status.exportCancelled'), 15000);
  await page.waitForTimeout(500);
  check(`${NAME} : « Annuler » arrête tout le lot : « Export annulé. », aucune image téléchargée, aucune archive, aucune ligne comptée en échec`,
    (await statusText()) === await tr('status.exportCancelled') && net.fetch.length === 0 && downloads.length === 0 && !(await isOpen()), { status: await statusText(), fetch: net.fetch.length, downloads });

  await clearStatus();
  const windowsBefore = await windowsOpened();
  await startExport({ id: '#v2-btn-export-pdf-batch', menu: '#btn-export-pdf' });
  await click(OK);
  await waitImagesWindow();
  await click(OK);
  await page.waitForFunction(() => /ZIP/.test(document.getElementById('status-msg').textContent) && /génér|generated/i.test(document.getElementById('status-msg').textContent), null, { timeout: 90000 });
  await waitDownload(/\.zip$/i);
  check(`${NAME} : « Continuer » exporte les deux lignes dans une archive ZIP, avec UNE seule question des images pour toutes les lignes`,
    (await windowsOpened()) - windowsBefore === 1 && downloads.some(n => /\.zip$/i.test(n)) && net.fetch.length >= 2 * HOSTS.length, { opened: (await windowsOpened()) - windowsBefore, downloads, fetches: net.fetch.length, status: await statusText() });
}

// 4) Beaucoup de sites : le titre et les boutons restent, seule la liste défile ; un seul site ; l'anglais.
async function runMany(T) {
  const NAME = `${T}, quarante sites`;
  const hosts = manyHosts(40);
  await seed(documentHtml(hosts));
  net.fetch.length = 0;
  await startExport(EXPORTS.pdf);
  await waitImagesWindow();
  const s = await windowState();
  check(`${NAME} : la fenêtre tient dans le panneau ${WIDTH}x${HEIGHT} et la liste défile (${s.scroll.content} px de contenu dans ${s.scroll.client} px)`, s.open && inPanel(s.box) && s.scroll.content > s.scroll.client && s.bullets.length === 40, s);
  const [t1, o1, c1] = [await hitTest('#pp-dialog-modal h3'), await hitTest(OK), await hitTest(CANCEL)];
  check(`${NAME} : le titre et les deux boutons restent visibles et au premier plan`, seen(t1) && seen(o1) && seen(c1), { t1, o1, c1 });
  await snap(`${T}-40-haut`);
  const c = await centerOf('#pp-dialog-modal .pp-modal-body');
  await page.mouse.move(c.x, c.y);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(40); }
  await page.waitForTimeout(200);
  const bottom = await windowState();
  const lastVisible = await page.evaluate(() => {
    const body = document.querySelector('#pp-dialog-modal .pp-modal-body');
    const message = body.querySelector('.pp-dialog-message');
    const range = document.createRange();
    const node = message.firstChild;
    const text = node.textContent;
    const at = text.indexOf('site40.exemple.test');
    range.setStart(node, at); range.setEnd(node, at + 'site40.exemple.test'.length);
    const r = range.getBoundingClientRect(), b = body.getBoundingClientRect();
    return r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
  });
  check(`${NAME} : la vraie molette fait défiler la liste jusqu’au dernier site, sans déplacer le titre ni les boutons`, bottom.scroll.top > 0 && lastVisible && seen(await hitTest('#pp-dialog-modal h3')) && seen(await hitTest(OK)), { bottom, lastVisible });
  await snap(`${T}-40-bas`);
  await page.keyboard.press('Escape');
  await waitClosed();
  await waitStatus(await tr('status.exportCancelled'), 10000);
  check(`${NAME} : Échap annule, rien n’est téléchargé`, net.fetch.length === 0, net.fetch);
}

async function runSingleSite(T) {
  const NAME = `${T}, un seul site`;
  await seed(documentHtml([HOSTS[0]]));
  await startExport(EXPORTS.pdf);
  await waitImagesWindow();
  const s = await windowState();
  const expected = (await tr('confirm.externalImages', { count: 1, sites: '' })).split('\n')[0];
  const expectedPlural = (await tr('confirm.externalImages', { count: 2, sites: '' })).split('\n')[0];
  check(`${NAME} : le message est au singulier (« ${expected} »), pas au pluriel`, s.intro === expected && s.intro !== expectedPlural && JSON.stringify(s.bullets) === JSON.stringify([HOSTS[0]]), { s, expected });
  await snap(`${T}-1-site`);
  await page.keyboard.press('Escape');
  await waitClosed();
}

// L'en-tête et le pied de page exportés, et le même site répété : une ligne par site.
async function runHeaderFooter(T) {
  const NAME = `${T}, en-tête et pied de page`;
  await seed(documentHtml([HOSTS[0], HOSTS[0]]));
  await page.evaluate(src => Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: `<p>${'<img class="editor-image" src="' + src + '" alt="Logo">'}</p>`, first: '' }, footer: { default: '', first: '' } }), `https://${HOSTS[2]}/entete.png`);
  await page.waitForTimeout(300);
  await startExport(EXPORTS.pdf);
  await waitImagesWindow();
  const s = await windowState();
  check(`${NAME} : une image de l’en-tête exporté est comptée, un site répété n’est listé qu’une fois, dans l’ordre (corps puis en-tête)`, JSON.stringify(s.bullets) === JSON.stringify([HOSTS[0], HOSTS[2]]), s);
  await page.keyboard.press('Escape');
  await waitClosed();
  await page.evaluate(() => Editor.setHeaderFooterData({ enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } }));
}

async function run(theme) {
  await countImagesWindows();
  await runSingle(theme, 'pdf');
  await runSingle(theme, 'docx');
  await runBatch(theme);
  await runMany(theme);
  await runSingleSite(theme);
  await runHeaderFooter(theme);
}

// Le thème sombre : la même fenêtre à la vraie souris (lisible sur son fond), puis les deux cas qui dépendent de la place (quarante sites) ou du fichier (Word).
async function runDark() {
  await page.evaluate(() => Settings.setTheme('dark'));
  await page.waitForTimeout(150);
  await seed(documentHtml(HOSTS));
  net.fetch.length = 0; downloads.length = 0;
  await startExport(EXPORTS.pdf);
  await waitImagesWindow();
  const s = await windowState();
  check('sombre, PDF d’une ligne : la fenêtre s’ouvre dans le panneau, titre et boutons visibles',
    s.open && inPanel(s.box) && JSON.stringify(s.bullets) === JSON.stringify(HOSTS) && seen(await hitTest('#pp-dialog-modal h3')) && seen(await hitTest(OK)) && seen(await hitTest(CANCEL)), s);
  const colors = await page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    const cs = e => getComputedStyle(e);
    return { box: cs(ov.querySelector('.modal-content')).backgroundColor, text: cs(ov.querySelector('.pp-dialog-message')).color, title: cs(ov.querySelector('h3')).color };
  });
  const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  check('sombre : le texte et le titre de la fenêtre se lisent sur son fond (≥ 4,5:1)', ratio(colors.text, colors.box) >= 4.5 && ratio(colors.title, colors.box) >= 4.5,
    { colors, text: ratio(colors.text, colors.box), title: ratio(colors.title, colors.box) });
  await snap('sombre-pdf-fenetre');
  await page.keyboard.press('Escape');
  await waitClosed();
  await waitStatus(await tr('status.exportCancelled'), 10000);
  await runMany('sombre');
  await runSingle('sombre', 'docx');
  await page.evaluate(() => Settings.setTheme('light'));
}

// L'interface en anglais : titre, message au pluriel puis au singulier, boutons, état.
async function runEnglish() {
  const T = 'anglais';
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(200);
  net.fetch.length = 0;
  await seed(documentHtml(HOSTS));
  await clearStatus();
  await startExport(EXPORTS.pdf);
  await waitImagesWindow();
  const s = await windowState();
  check(`${T}, PDF : titre « Images from an external site », message au pluriel, boutons Cancel et Continue`,
    s.title === 'Images from an external site' && s.intro === 'For this export, the widget has to download images hosted on external sites:' && s.outro === 'Cancel stops the export.'
    && JSON.stringify(s.buttons) === '["Cancel","Continue"]' && s.focus === 'Continue' && JSON.stringify(s.bullets) === JSON.stringify(HOSTS) && inPanel(s.box), s);
  await snap('anglais-pdf-fenetre');
  await click(CANCEL);
  await waitClosed();
  await waitStatus('Export cancelled.', 10000);
  check(`${T}, PDF : « Cancel » écrit « Export cancelled. » et ne télécharge rien`, (await statusText()) === 'Export cancelled.' && net.fetch.length === 0, { status: await statusText(), fetch: net.fetch });
  await seed(documentHtml([HOSTS[0]]));
  await startExport(EXPORTS.pdf);
  await waitImagesWindow();
  const one = await windowState();
  check(`${T}, un seul site : « on an external site »`, one.intro === 'For this export, the widget has to download images hosted on an external site:', one);
  await page.keyboard.press('Escape');
  await waitClosed();
  await page.evaluate(() => I18n.setLang('fr'));
}

// Un arrêt (la fenêtre ne s'ouvre pas, un élément manque) est un échec rapporté, pas un plantage : le navigateur est fermé dans tous les cas.
try {
  await run('clair');
  await runDark();
  await runEnglish();
} catch (e) { total++; failures++; console.log('  FAIL - le parcours s’arrête : ' + e.message); }

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
