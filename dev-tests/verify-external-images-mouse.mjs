#!/usr/bin/env node
// Fenêtre qui précède un export dont le modèle contient une image d'un site externe (js/external-images.js, choix d'Antoine du 2026-10-01 « Fenêtre avant
// l'export ») à 700x400 (le panneau d'Antoine), à la VRAIE souris (page.mouse) et au VRAI clavier (Tab, Échap), en clair, en sombre et en anglais, par le vrai
// clic sur le vrai bouton : « Exporter en PDF », « Exporter en DOCX », « Exporter les lignes (ZIP) ».
// Un vrai réseau de test : les adresses en « .test » sont servies par la page de Playwright (page.route) et chaque requête est notée avec son type. L'image que
// l'éditeur AFFICHE est une requête 'image' (inchangée) ; le téléchargement de l'EXPORT est une requête 'fetch' : c'est elle qui ne doit jamais partir avant
// « Continuer », ni après « Annuler ». Les téléchargements de fichiers sont les vrais (événement `download` de Playwright).
// Huit parties : 1) un PDF d'une ligne (Annuler au clic, Échap, Tab, Continuer) ; 2) un DOCX d'une ligne ; 3) un lot ZIP (deux fenêtres à la suite, un refus arrête
// tout le lot, une seule question pour toutes les lignes) ; 4) quarante sites (le titre et les boutons restent, seule la liste défile), un seul site, anglais ;
// 5) le BLOCAGE jusqu'au clic (choix du 05/10, « Bloquer jusqu'à un clic ») : une image d'un autre site ne charge pas à l'ouverture, un cadre « Afficher » prend sa place
// dans l'éditeur, dans la Lecture et dans l'en-tête d'une feuille ; aucune requête d'image avant le clic ; texte et bouton à leur taille d'écran sur la feuille réduite du
// panneau, mesurés sur de vrais pixels, avec leurs contrastes, en clair, en sombre et en anglais ; le vrai clic (Entrée et Espace au clavier) affiche les images de CE site,
// pas celles des autres, sans modifier le HTML du modèle ;
// 6) l'AFFICHAGE d'une image affichée (contrôle de sécurité du 04/10, « Tout corriger ») : un contour en tirets rouges et une infobulle qui nomme le site, dans l'éditeur (au
// repos, au survol, sélectionnée) puis dans la Lecture, mesuré sur une vraie capture ; l'image intégrée n'en a pas ; l'export ne redemande pas un site déjà affiché ;
// 7) l'INSERTION par adresse (choix du 04/10, « Demander à l'insertion ») : « Insérer une image », l'adresse d'un autre site, puis la question « Intégrer l'image »
// / « Garder le lien » à la vraie souris et au vrai clavier : Annuler, Échap, Tab, un lien gardé qui s'affiche tout de suite et reste en tirets rouges sur une vraie capture,
// une image intégrée qui n'en a pas, un site dont le téléchargement échoue (fetch refusé), une adresse data: sans question ; clair, sombre et anglais ;
// 8) l'affichage d'un site ne dure que la séance de la page : le vrai clic n'écrit rien (ni localStorage, ni sessionStorage, ni le document Grist) et, la page rechargée, le cadre est
// de retour sans qu'aucune requête soit partie vers le site.
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

// Un site dont le TÉLÉCHARGEMENT par le widget échoue (CORS refusé, réseau coupé) alors que l'éditeur affiche son image - la partie 6. `route.fulfill` ne fait pas respecter CORS
// (une réponse sans l'en-tête passe quand même, vérifié) : le refus est un `route.abort` sur les requêtes `fetch`, que le navigateur rend comme un échec CORS (TypeError).
const REFUSE_HOST = 'refuse.exemple.test';
await page.route(url => url.hostname === REFUSE_HOST, async route => {
  const request = route.request();
  if (request.resourceType() === 'fetch') { net.fetch.push(request.url()); await route.abort('failed'); return; }
  net.image.push(request.url());
  await route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
});

// Ouvre (ou rouvre, `reload`) la page du widget et attend qu'elle soit prête.
async function openHarness(reload = false) {
  if (reload) await page.reload({ waitUntil: 'load' });
  else await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
}
await openHarness();

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
// Les images du document dans l'éditeur, depuis le choix du 05/10 : celles d'un autre site attendent leur clic « Afficher » (un cadre, aucune requête), l'intégrée est chargée.
const editorImages = () => page.evaluate(() => {
  const views = Array.from(document.querySelectorAll('.tiptap .editor-image-view'));
  const blocked = views.filter(v => v.classList.contains('editor-image-blocked'));
  const loaded = views.filter(v => !v.classList.contains('editor-image-blocked')).map(v => v.querySelector('img')).filter(i => i && i.complete && i.naturalWidth > 0);
  return { total: views.length, blocked: blocked.length, loaded: loaded.length };
});
// Luminance relative et rapport de contraste (WCAG) de deux couleurs « rgb(r, g, b) ».
const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

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
  const shownInEditor = await editorImages();
  check(`${NAME} : rien n’est téléchargé tant que la fenêtre est ouverte (l’éditeur montre les ${HOSTS.length} cadres « Afficher » sans demander d’image à ces sites, l’image intégrée est chargée)`,
    net.fetch.length === 0 && net.image.length === 0 && shownInEditor.blocked === HOSTS.length && shownInEditor.loaded === 1, { fetch: net.fetch, image: net.image, shownInEditor });
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
  check(`${NAME} : la première fenêtre est celle du lot (« Exporter les lignes »), pas celle des images`, first.open && first.title === 'Exporter les lignes', first);
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

// 5) et 6) Le BLOCAGE jusqu'au clic « Afficher » (choix du 05/10), puis l'AFFICHAGE de l'image que la personne a affichée : le contour en tirets rouges et l'infobulle d'une image
// qui charge depuis un autre site (js/external-images.js, css/external-images.css). Un site affiché le reste pour toute la séance de la page : chaque passage (clair, sombre,
// anglais) a ses propres sites.
let DISPLAY_HOST = '', OTHER_HOST = '', KEY_HOST = '', READER_KEY_HOST = '';
function useDisplayHosts(T) {
  DISPLAY_HOST = `affiche-${T}.exemple.test`;        // affiché par un vrai clic dans l'éditeur
  OTHER_HOST = `autre-${T}.exemple.test`;            // bloqué dans l'éditeur, affiché par un vrai clic dans la Lecture
  KEY_HOST = `clavier-${T}.exemple.test`;            // affiché au clavier (Entrée) dans l'éditeur
  READER_KEY_HOST = `lecture-${T}.exemple.test`;     // affiché au clavier (Espace) dans la Lecture
}
const displayHosts = () => [DISPLAY_HOST, OTHER_HOST, KEY_HOST, READER_KEY_HOST];
const displayImg = src => `<img class="editor-image" src="${src}" alt="Image" style="width: 90px;">`;
const displayHtml = () => `<p>Dossier : ${badge('ExtDossiers', 'Titre')}</p>` + displayHosts().map(h => `<p>${displayImg('https://' + h + '/logo.png')}</p>`).join('') + `<p>${displayImg(DATA_PNG)}</p>`;
const externalIn = root => `${root} img[src^="https://${DISPLAY_HOST}"]`;
const embeddedIn = root => `${root} img[src^="data:image/png"]`;
// Le rectangle d'une image, amenée au milieu de la vue (la capture et le clic partent de là).
async function boxOf(selector) {
  return page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, selector);
}
// Pixels rouges (celui du contour, même adoucis) dans la bande du haut d'une VRAIE capture : le contour est tracé à l'intérieur de l'image, sur ses premiers pixels.
async function redPixels(box) {
  const png = await page.screenshot({ clip: { x: Math.max(0, Math.floor(box.left)), y: Math.max(0, Math.floor(box.top)), width: Math.max(1, Math.floor(box.width)), height: 6 } });
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
    for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 120 && d[i + 2] < 120 && d[i] - d[i + 1] > 60) red++;
    return red;
  }, png.toString('base64'));
}
const outlineOf = selector => page.evaluate(sel => {
  const e = document.querySelector(sel);
  if (!e) return null;
  const css = getComputedStyle(e);
  return { style: css.outlineStyle, width: css.outlineWidth, color: css.outlineColor, site: e.getAttribute('data-external-site'), title: e.title };
}, selector);
// Le panneau met la feuille à l'échelle (zoom ~0,85 à 700×400) : un trait de 3 px y mesure ~2,5 px ; la VRAIE capture (pixels rouges) dit s'il se voit.
const DASHED_RED = o => !!o && o.style === 'dashed' && o.color === 'rgb(197, 48, 48)' && parseFloat(o.width) >= 1 && parseFloat(o.width) <= 3;

async function checkDisplay(T, where, root) {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
  const outside = await outlineOf(externalIn(root));
  const embedded = await outlineOf(embeddedIn(root));
  const tip = await tr('image.externalSite', { site: DISPLAY_HOST });
  check(`${T}, ${where} : l'image d'un autre site porte son hôte, l'infobulle et un contour de 3 px (à l'échelle de la feuille) en tirets rouges`, !!outside && outside.site === DISPLAY_HOST && outside.title === tip && DASHED_RED(outside), outside);
  check(`${T}, ${where} : l'image intégrée n'a ni hôte, ni infobulle, ni tirets`, !!embedded && embedded.site === null && !embedded.title && embedded.style !== 'dashed', embedded);
  const redOutside = await redPixels(await boxOf(externalIn(root)));
  const redEmbedded = await redPixels(await boxOf(embeddedIn(root)));
  check(`${T}, ${where} : les tirets rouges se voient sur une vraie capture (${redOutside} pixels rouges au bord de l'image d'un autre site, ${redEmbedded} sur l'image intégrée)`, redOutside >= 25 && redEmbedded === 0, { redOutside, redEmbedded });
}

// Le cadre d'une image bloquée sur une VRAIE capture : le fond clair de la feuille (même en thème sombre), le bleu du bouton, le texte du site.
async function paintOf(box) {
  const x = Math.max(0, Math.floor(box.left)), y = Math.max(0, Math.floor(box.top));
  const png = await page.screenshot({ clip: { x, y, width: Math.max(1, Math.min(WIDTH - x, Math.ceil(box.width))), height: Math.max(1, Math.min(HEIGHT - y, Math.ceil(box.height))) } });
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let light = 0, blue = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (r > 225 && g > 225 && b > 225) light++;
      else if (Math.abs(r - 47) < 40 && Math.abs(g - 111) < 40 && Math.abs(b - 237) < 40) blue++;
      else if (r < 90 && g < 90 && b < 110) dark++;
    }
    return { light: Math.round(light / (d.length / 4) * 100) / 100, blue, dark, pixels: d.length / 4 };
  }, png.toString('base64'));
}
const editorFrame = host => `.tiptap .editor-image-view.editor-image-blocked[data-blocked-site="${host}"]`;
const frameCount = root => page.evaluate(root => document.querySelectorAll(`${root} .editor-image-blocked, ${root} img[data-blocked-src]`).length, root);
const imageLoaded = (root, host) => page.waitForFunction(({ root, host }) => { const i = document.querySelector(`${root} img[src^="https://${host}"]`); return !!i && i.complete && i.naturalWidth > 0; }, { root, host }, { timeout: 15000 });

// 5a) L'éditeur à l'ouverture : quatre cadres, aucune requête d'image, texte et bouton à leur taille d'écran, vrais pixels, contrastes, HTML du modèle intact.
async function checkBlockedEditor(T, { dark = false, english = false } = {}) {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(700);
  const site = DISPLAY_HOST;
  const [show, aria, hint] = await Promise.all([tr('image.blocked.show'), tr('image.blocked.alt', { site }), tr('image.blocked.hint', { site })]);
  const info = await page.evaluate(selector => {
    const view = document.querySelector(selector);
    const sheet = document.querySelector('#editor-container .v2-page-sheet');
    const all = document.querySelectorAll('.tiptap .editor-image-view.editor-image-blocked').length;
    const sheetZoom = sheet ? parseFloat(getComputedStyle(sheet).zoom) : 1;
    if (!view) return { found: false, all, sheetZoom };
    view.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = e => { const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
    const box = view.querySelector('.editor-image-blocked-box'), label = view.querySelector('.editor-image-blocked-site'), button = view.querySelector('.editor-image-reveal');
    const cs = e => getComputedStyle(e);
    return {
      found: true, all, sheetZoom, view: rect(view), box: rect(box), label: rect(label), button: rect(button), labelText: label.textContent, buttonText: button.textContent,
      aria: button.getAttribute('aria-label'), title: button.title, address: view.querySelector('img').getAttribute('src'),
      colors: { frame: cs(box).backgroundColor, ink: cs(label).color, button: cs(button).backgroundColor, buttonText: cs(button).color },
    };
  }, editorFrame(site));
  const label = english ? 'en anglais' : (dark ? 'en sombre' : 'en clair');
  check(`${T}, éditeur : les quatre images d’un autre site ont leur cadre « ${show} » à l’ouverture, l’image intégrée est chargée`, info.found && info.all === 4 && (await editorImages()).loaded === 1, { info: { found: info.found, all: info.all }, images: await editorImages() });
  check(`${T}, éditeur : aucune image n’est demandée à ces sites tant qu’aucun clic n’a eu lieu (net.image : ${net.image.length} requête)`, displayHosts().every(h => requestsTo(h) === 0), { image: net.image, fetch: net.fetch });
  check(`${T}, éditeur : le cadre n’a pas d’adresse dans la page (l’<img> n’a pas de src)`, info.address === '' || info.address === null, info.address);
  check(`${T}, éditeur : la feuille est réduite dans ce panneau (zoom ${info.sheetZoom}) : c’est ce que le cadre doit compenser`, info.sheetZoom > 0 && info.sheetZoom < 0.95, info.sheetZoom);
  check(`${T}, éditeur : le cadre fait au moins 112 × 56 px à l’écran (${Math.round(info.view.width)} × ${Math.round(info.view.height)})`, info.view.width >= 111.5 && info.view.height >= 55.5, info.view);
  check(`${T}, éditeur : le bouton « ${show} » et le site gardent leur taille d’écran sur la feuille réduite (bouton ${Math.round(info.button.width)} × ${Math.round(info.button.height)}, ligne du site ${Math.round(info.label.height)} px de haut)`,
    info.buttonText === show && info.labelText === site && info.button.height >= 18 && info.button.height <= 25 && info.button.width >= 56 && info.label.height >= 11.5, { button: info.button, label: info.label });
  check(`${T}, éditeur : le site et le bouton tiennent dans le cadre`, info.label.left >= info.box.left - 0.5 && info.label.right <= info.box.right + 0.5 && info.button.left >= info.box.left - 0.5 && info.button.right <= info.box.right + 0.5
    && info.button.top >= info.box.top - 0.5 && info.button.bottom <= info.box.bottom + 0.5 && info.label.bottom <= info.button.top + 0.5, { box: info.box, label: info.label, button: info.button });
  check(`${T}, éditeur : nom accessible « ${aria} » et infobulle sur le bouton`, info.aria === aria && info.title === hint, { aria: info.aria, title: info.title });
  const button = await hitTest(`${editorFrame(site)} .editor-image-reveal`);
  check(`${T}, éditeur : le bouton est dans la zone visible et au premier plan (rien ne le couvre)`, seen(button), button);
  const contrastText = ratio(info.colors.ink, info.colors.frame), contrastButton = ratio(info.colors.buttonText, info.colors.button);
  check(`${T}, éditeur, ${label} : le site se lit sur le cadre (${contrastText.toFixed(1)}:1) et « ${show} » sur le bouton (${contrastButton.toFixed(2)}:1), au moins 4,5:1`, contrastText >= 4.5 && contrastButton >= 4.5, { colors: info.colors, contrastText, contrastButton });
  check(`${T}, éditeur, ${label} : le cadre garde le papier clair, jamais le fond du thème`, lum(info.colors.frame) > 0.85, info.colors.frame);
  const paint = await paintOf(info.view);
  check(`${T}, éditeur, ${label} : sur une vraie capture, un fond clair (${Math.round(paint.light * 100)} %), le bouton bleu (${paint.blue} pixels) et le texte du site (${paint.dark} pixels sombres)`, paint.light >= 0.4 && paint.blue >= 400 && paint.dark >= 20, paint);
  await snap(`blocage-${T}-editeur`);
  // Un seul saut de la souris, sans passer par la barre d'outils (ses menus s'ouvrent au survol et couvriraient le bouton).
  const target = await centerOf(`${editorFrame(site)} .editor-image-reveal`);
  await page.mouse.move(target.x, target.y);
  await page.waitForTimeout(450);
  const hover = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).backgroundColor, `${editorFrame(site)} .editor-image-reveal`);
  check(`${T}, éditeur : au survol le bouton s’assombrit (${hover})`, hover === 'rgb(31, 88, 196)', hover);
  await page.mouse.move(2, 2);
  const saved = await page.evaluate(() => Editor.getHTML());
  check(`${T}, éditeur : le HTML du modèle garde les quatre adresses, sans cadre ni data:image/svg`, displayHosts().every(h => saved.includes(`src="https://${h}/logo.png"`)) && !/data-blocked|image\/svg/.test(saved), saved.slice(0, 300));
}

// 5b) Le vrai clic sur « Afficher » : l'image de CE site se charge, les autres cadres restent, le HTML du modèle ne bouge pas, le clic ne sélectionne rien.
async function revealEditorByMouse(T) {
  const before = await page.evaluate(() => Editor.getHTML());
  net.image.length = 0;
  await realClick(`${editorFrame(DISPLAY_HOST)} .editor-image-reveal`, 500);
  await imageLoaded('.tiptap', DISPLAY_HOST);
  const state = await page.evaluate(() => ({
    frames: Array.from(document.querySelectorAll('.tiptap .editor-image-view.editor-image-blocked')).map(v => v.dataset.blockedSite),
    html: Editor.getHTML(), selected: !!document.querySelector('.tiptap .editor-image-view.editor-image-selected'),
  }));
  check(`${T}, éditeur : le vrai clic sur « Afficher » charge l’image de ce site (${requestsTo(DISPLAY_HOST)} requête), il n’y a plus de cadre pour elle`, requestsTo(DISPLAY_HOST) >= 1 && !state.frames.includes(DISPLAY_HOST), { frames: state.frames, image: net.image });
  check(`${T}, éditeur : les trois autres sites restent bloqués et n’ont reçu aucune requête`, JSON.stringify(state.frames.sort()) === JSON.stringify([OTHER_HOST, KEY_HOST, READER_KEY_HOST].sort()) && [OTHER_HOST, KEY_HOST, READER_KEY_HOST].every(h => requestsTo(h) === 0), { frames: state.frames, image: net.image });
  check(`${T}, éditeur : le HTML du modèle n’a pas bougé et le clic sur le bouton n’a pas sélectionné l’image`, state.html === before && state.selected === false, { same: state.html === before, selected: state.selected });
}

// 5c) Le clavier dans l'éditeur : l'anneau de focus du bouton, Entrée affiche le site (rien n'est écrit dans le document).
async function revealEditorByKeyboard(T) {
  const selector = `${editorFrame(KEY_HOST)} .editor-image-reveal`;
  const before = await page.evaluate(() => Editor.getHTML());
  await page.keyboard.press('Shift');
  await page.evaluate(sel => { const b = document.querySelector(sel); b.scrollIntoView({ block: 'center', inline: 'nearest' }); b.focus(); }, selector);
  await page.waitForTimeout(150);
  const ring = await page.evaluate(sel => { const b = document.querySelector(sel); const css = getComputedStyle(b); return { focused: document.activeElement === b, style: css.outlineStyle, width: css.outlineWidth, color: css.outlineColor }; }, selector);
  check(`${T}, éditeur : le bouton a le focus au clavier et un anneau de focus visible (${ring.style} ${ring.width} ${ring.color})`, ring.focused && ring.style === 'solid' && parseFloat(ring.width) >= 2, ring);
  await page.keyboard.press('Enter');
  await imageLoaded('.tiptap', KEY_HOST);
  const after = await page.evaluate(() => Editor.getHTML());
  check(`${T}, éditeur : Entrée sur le bouton affiche le site au clavier (${requestsTo(KEY_HOST)} requête) sans rien écrire dans le document`, requestsTo(KEY_HOST) >= 1 && after === before, { same: after === before, image: net.image });
}

// 5d) La Lecture : les frères du site affiché sont déjà montrés, les autres ont leur cadre dessiné (SVG) ; le vrai clic, puis Espace au clavier.
async function checkBlockedReader(T, { dark = false, english = false, keyboard = false } = {}) {
  const frameSel = host => `#reader-container img[data-blocked-site="${host}"]`;
  await page.mouse.move(2, 2);
  await page.waitForTimeout(500);
  const expected = [OTHER_HOST, READER_KEY_HOST].concat(keyboard ? [] : [KEY_HOST]).sort();
  const [show, aria, hint] = await Promise.all([tr('image.blocked.show'), tr('image.blocked.alt', { site: OTHER_HOST }), tr('image.blocked.hint', { site: OTHER_HOST })]);
  const info = await page.evaluate(({ selector }) => {
    const frames = Array.from(document.querySelectorAll('#reader-container img[data-blocked-src]')).map(i => i.dataset.blockedSite).sort();
    const frame = document.querySelector(selector);
    const sheet = document.querySelector('#reader-container .reader-content');
    const sheetZoom = sheet ? parseFloat(getComputedStyle(sheet).zoom) : 1;
    if (!frame) return { found: false, frames, sheetZoom };
    frame.scrollIntoView({ block: 'center', inline: 'nearest' });
    const b = frame.getBoundingClientRect();
    return {
      found: true, frames, sheetZoom, rect: { left: b.left, top: b.top, width: b.width, height: b.height }, role: frame.getAttribute('role'), tab: frame.getAttribute('tabindex'),
      alt: frame.getAttribute('alt'), title: frame.getAttribute('title'), src: frame.getAttribute('src').slice(0, 24), kept: frame.getAttribute('data-blocked-src'), background: getComputedStyle(frame).backgroundColor,
    };
  }, { selector: frameSel(OTHER_HOST) });
  check(`${T}, Lecture : les images des sites pas encore affichés ont leur cadre dessiné (${info.frames.length}), celle du site déjà affiché est montrée`, JSON.stringify(info.frames) === JSON.stringify(expected), { frames: info.frames, expected });
  check(`${T}, Lecture : aucune requête d’image vers un site bloqué`, [OTHER_HOST, READER_KEY_HOST].every(h => requestsTo(h) === 0), { image: net.image });
  check(`${T}, Lecture : le cadre est un bouton (role, tabindex), garde l’adresse du modèle et son nom accessible « ${aria} »`, info.found && info.role === 'button' && info.tab === '0' && info.alt === aria && info.title === hint && info.src.startsWith('data:image/svg+xml') && info.kept === `https://${OTHER_HOST}/logo.png`, info);
  check(`${T}, Lecture : la feuille est réduite (zoom ${info.sheetZoom}) et le cadre fait pourtant au moins 112 × 56 px à l’écran (${Math.round(info.rect.width)} × ${Math.round(info.rect.height)})`, info.sheetZoom < 0.95 && info.rect.width >= 111.5 && info.rect.height >= 55.5, { zoom: info.sheetZoom, rect: info.rect });
  const label = english ? 'en anglais' : (dark ? 'en sombre' : 'en clair');
  const paint = await paintOf(info.rect);
  check(`${T}, Lecture, ${label} : sur une vraie capture, un fond clair (${Math.round(paint.light * 100)} %), le bouton bleu (${paint.blue} pixels) et le texte (${paint.dark} pixels sombres) à leur taille d’écran`, paint.light >= 0.4 && paint.blue >= 400 && paint.dark >= 20 && lum(info.background) > 0.85, { paint, background: info.background });
  if (english) check(`${T}, Lecture : le cadre dessiné est en anglais`, decodeURIComponent(await page.evaluate(sel => document.querySelector(sel).getAttribute('src'), frameSel(OTHER_HOST))).includes('>Show<') && info.alt === `Show the image from ${OTHER_HOST}`, info.alt);
  await snap(`blocage-${T}-lecture`);
  const frameBox = await hitTest(frameSel(OTHER_HOST));
  check(`${T}, Lecture : le cadre est dans la zone visible et au premier plan`, seen(frameBox), frameBox);
  // Le vrai clic sur le cadre.
  net.image.length = 0;
  await realClick(frameSel(OTHER_HOST), 600);
  await imageLoaded('#reader-container', OTHER_HOST);
  const afterClick = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container img[data-blocked-src]')).map(i => i.dataset.blockedSite).sort());
  check(`${T}, Lecture : le vrai clic sur le cadre charge l’image de ce site (${requestsTo(OTHER_HOST)} requête), les autres cadres restent et n’ont reçu aucune requête`,
    requestsTo(OTHER_HOST) >= 1 && JSON.stringify(afterClick) === JSON.stringify(expected.filter(h => h !== OTHER_HOST)) && requestsTo(READER_KEY_HOST) === 0, { afterClick, image: net.image });
  if (keyboard) {
    // Espace sur le cadre qui a le focus : il s'affiche, et la Lecture ne défile pas (la touche n'est pas laissée au navigateur).
    const scrollBefore = await page.evaluate(() => document.getElementById('reader-container').scrollTop);
    await page.keyboard.press('Shift');
    await page.evaluate(sel => { const i = document.querySelector(sel); i.scrollIntoView({ block: 'center', inline: 'nearest' }); i.focus(); }, frameSel(READER_KEY_HOST));
    const scrolledToIt = await page.evaluate(() => document.getElementById('reader-container').scrollTop);
    await page.keyboard.press('Space');
    await imageLoaded('#reader-container', READER_KEY_HOST);
    await page.waitForTimeout(300);
    const scrollAfter = await page.evaluate(() => document.getElementById('reader-container').scrollTop);
    check(`${T}, Lecture : Espace sur le cadre qui a le focus l’affiche (${requestsTo(READER_KEY_HOST)} requête) sans faire défiler la Lecture (${scrolledToIt} → ${scrollAfter})`, requestsTo(READER_KEY_HOST) >= 1 && scrollAfter === scrolledToIt, { scrollBefore, scrolledToIt, scrollAfter });
  }
}

async function runDisplay(T, { dark = false, english = false, keyboard = false } = {}) {
  useDisplayHosts(T);
  if (dark) await page.evaluate(() => Settings.setTheme('dark'));
  if (english) await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(200);
  net.image.length = 0; net.fetch.length = 0;
  await seed(displayHtml());
  await checkBlockedEditor(T, { dark, english });
  await revealEditorByMouse(T);
  if (keyboard) await revealEditorByKeyboard(T);
  await checkDisplay(T, 'éditeur', '.tiptap');
  await snap(`affichage-${T}-editeur`);
  // Au survol, l'image garde ses tirets rouges (le contour bleu de survol d'une image ne les remplace pas) ; sélectionnée, l'éditeur ajoute sa sélection sans les retirer.
  await realHover(externalIn('.tiptap'));
  const hovered = await outlineOf(externalIn('.tiptap'));
  check(`${T}, éditeur, au survol : le contour reste rouge en tirets`, DASHED_RED(hovered), hovered);
  await realClick(externalIn('.tiptap'));
  const selected = await page.evaluate(() => !!document.querySelector('.tiptap .editor-image-view.editor-image-selected'));
  const afterSelect = await outlineOf(externalIn('.tiptap'));
  check(`${T}, éditeur, image sélectionnée : la sélection de l'éditeur et les tirets rouges sont là ensemble`, selected && DASHED_RED(afterSelect), { selected, afterSelect });
  await realClick('#btn-mode-read', 700);
  await page.waitForSelector('#reader-container .reader-content img', { timeout: 15000 });
  await page.waitForTimeout(500);
  await checkDisplay(T, 'Lecture', '#reader-container');
  await snap(`affichage-${T}-lecture`);
  await checkBlockedReader(T, { dark, english, keyboard });
  await realClick('#btn-mode-edit', 500);
  if (dark) await page.evaluate(() => Settings.setTheme('light'));
  if (english) await page.evaluate(() => I18n.setLang('fr'));
}

// 5e) L'en-tête d'une feuille (aperçu paginé de l'éditeur) : le cadre y est aussi, le clic l'affiche sans ouvrir la zone d'en-tête.
async function runZone(T) {
  const host = `entete-${T}.exemple.test`;
  await seed('<p>Corps du modèle</p>');
  net.image.length = 0;
  await page.evaluate(src => Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: `<p><img class="editor-image" src="${src}" alt="Logo" style="width: 90px;"></p>`, first: '' }, footer: { default: '', first: '' } }), `https://${host}/entete.png`);
  await page.waitForTimeout(800);
  const selector = `#editor-container .v2-hf-zone img[data-blocked-site="${host}"]`;
  const frame = await hitTest(selector);
  check(`${T}, en-tête de la feuille : l’image d’un autre site y a son cadre « Afficher » et aucune requête n’est partie (${requestsTo(host)})`, frame.found && requestsTo(host) === 0, { frame, image: net.image });
  const box = await page.evaluate(sel => { const i = document.querySelector(sel); i.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const b = i.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; }, selector);
  const paint = await paintOf(box);
  check(`${T}, en-tête de la feuille : sur une vraie capture, le cadre se voit (${Math.round(paint.light * 100)} % de clair, ${paint.blue} pixels de bouton bleu) et fait au moins 112 × 56 px d’écran (${Math.round(box.width)} × ${Math.round(box.height)})`, paint.blue >= 400 && box.width >= 111.5 && box.height >= 55.5, { paint, box });
  await realClick(selector, 700);
  await imageLoaded('#editor-container .v2-hf-zone', host);
  const state = await page.evaluate(() => ({ editing: document.getElementById('editor-container').classList.contains('hf-editing') }));
  check(`${T}, en-tête de la feuille : le vrai clic charge l’image (${requestsTo(host)} requête) sans ouvrir la zone d’en-tête pour la modifier`, requestsTo(host) >= 1 && state.editing === false, { state, image: net.image });
  await page.evaluate(() => Editor.setHeaderFooterData({ enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } }));
}

// 5f) L'export attend un accord par site : un site affiché n'est pas redemandé, les autres le sont ; tous affichés, plus aucune fenêtre.
async function runExportAfterReveal(T) {
  const hosts = ['un', 'deux', 'trois'].map(n => `export-${n}-${T}.exemple.test`);
  await seed(documentHtml(hosts));
  net.fetch.length = 0; net.image.length = 0; downloads.length = 0;
  await clearStatus();
  await realClick(`${editorFrame(hosts[0])} .editor-image-reveal`, 500);
  await startExport(EXPORTS.pdf);
  await waitImagesWindow();
  const s = await windowState();
  const intro = (await tr('confirm.externalImages', { count: 2, sites: '' })).split('\n')[0];
  check(`${T}, export : le site affiché par un clic n’est pas redemandé, la fenêtre liste les deux autres (${s.bullets.join(', ')})`, JSON.stringify(s.bullets) === JSON.stringify(hosts.slice(1)) && s.intro === intro, s);
  await page.keyboard.press('Escape');
  await waitClosed();
  await waitStatus(await tr('status.exportCancelled'), 10000);
  check(`${T}, export : Échap annule, rien n’est téléchargé`, net.fetch.length === 0 && downloads.length === 0, { fetch: net.fetch, downloads });
  for (const host of hosts.slice(1)) await realClick(`${editorFrame(host)} .editor-image-reveal`, 500);
  const windowsBefore = await windowsOpened();
  await clearStatus();
  await startExport(EXPORTS.pdf);
  await waitStatus(await tr(EXPORTS.pdf.done), 60000);
  await waitDownload(EXPORTS.pdf.file);
  check(`${T}, export, trois sites affichés : aucune fenêtre ne s’ouvre, le PDF est généré et les trois images sont lues`,
    (await windowsOpened()) === windowsBefore && downloads.some(n => EXPORTS.pdf.file.test(n)) && JSON.stringify(fetchedHosts().sort()) === JSON.stringify(hosts.slice().sort()), { opened: (await windowsOpened()) - windowsBefore, downloads, fetched: fetchedHosts() });
}

// 7) L'insertion par adresse (js/main-toolbar.js:imageSourceFromUrl, choix d'Antoine du 04/10 « Demander à l'insertion ») : « Insérer une image », l'adresse d'un autre site, puis la
// question « Intégrer l'image » (par défaut) / « Garder le lien » - un lien gardé s'affiche tout de suite (c'est l'accord de la personne pour ce site) et reste signalé en rouge, une
// image intégrée n'a plus rien d'un autre site. Un site par passage : celui d'un lien gardé reste affiché pour la séance.
let INSERT_HOST = '', INSERT_URL = '';
function useInsertHost(T) { INSERT_HOST = `insere-${T}.exemple.test`; INSERT_URL = `https://${INSERT_HOST}/logo.png`; }
const QUESTION_TITLE = () => tr('dialog.imageExternal.title');
const insertedImages = () => page.evaluate(() => document.querySelectorAll('.tiptap img.editor-image').length);
const insertedSrc = () => page.evaluate(() => { const i = document.querySelector('.tiptap img.editor-image'); return i ? i.getAttribute('src') : null; });
const requestsTo = host => net.fetch.concat(net.image).filter(u => new URL(u).host === host).length;
async function resetDocument() {
  await page.evaluate(() => Editor.setHTML('<p>Texte</p>'));
  net.fetch.length = 0; net.image.length = 0;
  await page.waitForTimeout(150);
}
// L'adresse tapée au vrai clavier dans la fenêtre « Insérer une image », « Insérer » (clic réel ou Entrée) : la question s'ouvre.
async function typeImageUrl(url, { enter = false } = {}) {
  await realClick('#v2-btn-image', 300);
  await page.keyboard.type(url);
  if (enter) await page.keyboard.press('Enter'); else await click(OK);
  const title = await QUESTION_TITLE();
  await page.waitForFunction(t => { const ov = document.getElementById('pp-dialog-modal'); return !!ov && ov.style.display !== 'none' && ov.querySelector('h3').textContent === t; }, title, { timeout: 15000 });
  await page.waitForTimeout(150);
}
// La question : titre, lignes du message, boutons visibles (le « Valider » des saisies est caché), où est le focus, et la place qu'elle prend.
const questionState = () => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  const box = ov.querySelector('.modal-content');
  const message = ov.querySelector('.pp-dialog-message');
  const a = document.activeElement;
  const r = box.getBoundingClientRect();
  const body = ov.querySelector('.pp-modal-body');
  return {
    open: ov.style.display !== 'none',
    title: ov.querySelector('h3').textContent,
    lines: (message.textContent || '').split('\n'),
    buttons: Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map(b => b.textContent),
    focus: a && a.closest && a.closest('#pp-dialog-modal') ? a.textContent : 'hors de la fenêtre : ' + (a && (a.id || a.tagName)),
    box: { l: r.left, t: r.top, r: r.right, b: r.bottom },
    whiteSpace: getComputedStyle(message).whiteSpace,
    scroll: { client: body.clientHeight, content: body.scrollHeight },
  };
});
// Un bouton de la question, par son libellé : vrai déplacement puis vrai clic.
async function clickChoice(label) {
  const c = await page.evaluate(text => {
    const b = Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).find(x => !x.hidden && x.textContent === text);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, onTop: !!top && (top === b || b.contains(top)) };
  }, label);
  if (!c) throw new Error('bouton introuvable dans la question : ' + label);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(300);
  return c;
}
const buttonSeen = label => page.evaluate(text => {
  const b = Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).find(x => !x.hidden && x.textContent === text);
  if (!b) return false;
  const r = b.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && !!top && (top === b || b.contains(top));
}, label);
async function waitInserted(n = 1) { await page.waitForFunction(count => document.querySelectorAll('.tiptap img.editor-image').length === count, n, { timeout: 15000 }); await page.waitForTimeout(250); }
// Le curseur passe après l'image et la souris se gare : ni barre flottante ni survol ne couvrent son bord avant la mesure.
async function leaveImage() {
  await page.keyboard.press('ArrowRight');
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
}
// Le haut de l'image au premier plan, amené en haut de la zone visible : l'image par défaut (320 px de côté, ~190 px à 700x400) est presque aussi haute que la zone.
async function imageTop(selector) {
  return page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'start', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + 3);
    return { left: r.left, top: r.top, width: r.width, height: r.height, onTop: top === e };
  }, selector);
}

async function checkQuestionWindow(T, { english = false } = {}) {
  const [title, message, keep, embed, cancel] = await Promise.all([QUESTION_TITLE(), tr('dialog.imageExternal.message', { site: INSERT_HOST }), tr('dialog.imageExternal.keep'), tr('dialog.imageExternal.embed'), tr('common.cancel')]);
  const s = await questionState();
  const lines = message.split('\n');
  check(`${T}, insertion : la question s'ouvre dans le panneau ${WIDTH}x${HEIGHT} sous le titre « ${title} », avec le site de l'adresse`, s.open && inPanel(s.box) && s.title === title && JSON.stringify(s.lines) === JSON.stringify(lines) && lines[0].includes(INSERT_HOST), s);
  check(`${T}, insertion : trois boutons « ${cancel} », « ${keep} », « ${embed} », le focus est sur « ${embed} » (par défaut)`, JSON.stringify(s.buttons) === JSON.stringify([cancel, keep, embed]) && s.focus === embed, s);
  check(`${T}, insertion : le message garde ses retours à la ligne et tient sans défiler`, s.whiteSpace === 'pre-line' && s.scroll.content <= s.scroll.client + 1, s);
  const seenAll = (await Promise.all([hitTest('#pp-dialog-modal h3').then(seen), buttonSeen(cancel), buttonSeen(keep), buttonSeen(embed)]));
  check(`${T}, insertion : le titre et les trois boutons sont visibles et au premier plan`, seenAll.every(Boolean), seenAll);
  if (english) check(`${T}, insertion : les textes sont ceux de l'anglais`, s.title === 'Image from an external site' && JSON.stringify(s.buttons) === '["Cancel","Keep link","Embed image"]' && s.lines[0] === `This image is hosted on an external site (${INSERT_HOST}).`, s);
  return { keep, embed, cancel };
}

async function runInsert(T, { dark = false, english = false } = {}) {
  useInsertHost(T);
  if (dark) await page.evaluate(() => Settings.setTheme('dark'));
  if (english) await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(200);
  await resetDocument();

  // L'adresse d'un autre site : la question, et rien n'est téléchargé ni inséré tant qu'elle est ouverte.
  await typeImageUrl(INSERT_URL);
  const { keep, embed, cancel } = await checkQuestionWindow(T, { english });
  check(`${T}, insertion : rien n'est téléchargé ni inséré tant que la question est ouverte`, net.fetch.length === 0 && requestsTo(INSERT_HOST) === 0 && (await insertedImages()) === 0, { fetch: net.fetch, image: net.image });
  await snap(`insertion-${T}-question`);
  if (dark) {
    const colors = await page.evaluate(() => {
      const ov = document.getElementById('pp-dialog-modal');
      const cs = e => getComputedStyle(e);
      return { box: cs(ov.querySelector('.modal-content')).backgroundColor, text: cs(ov.querySelector('.pp-dialog-message')).color, title: cs(ov.querySelector('h3')).color };
    });
    check(`${T}, insertion : le texte et le titre de la question se lisent sur son fond (≥ 4,5:1)`, ratio(colors.text, colors.box) >= 4.5 && ratio(colors.title, colors.box) >= 4.5, { colors, text: ratio(colors.text, colors.box), title: ratio(colors.title, colors.box) });
  }

  // Annuler (clic réel) : aucune image, rien de téléchargé. Échap de même. Tab reste dans la question.
  const inside = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); inside.push((await questionState()).focus.startsWith('hors') ? 'dehors' : 'dedans'); }
  check(`${T}, insertion : six appuis sur Tab restent dans la question`, inside.every(x => x === 'dedans'), inside);
  await clickChoice(cancel);
  check(`${T}, insertion : « ${cancel} » (vrai clic) ferme la question sans rien insérer ni télécharger`, !(await isOpen()) && (await insertedImages()) === 0 && requestsTo(INSERT_HOST) === 0, { images: await insertedImages(), fetch: net.fetch, image: net.image });
  await typeImageUrl(INSERT_URL);
  await page.keyboard.press('Escape');
  await waitClosed();
  check(`${T}, insertion : Échap de même`, (await insertedImages()) === 0 && requestsTo(INSERT_HOST) === 0, { images: await insertedImages(), fetch: net.fetch, image: net.image });

  // « Garder le lien » (clic réel) : l'adresse telle qu'elle a été tapée, aucun téléchargement par le widget, l'image reste signalée - sur une vraie capture aussi.
  await typeImageUrl(INSERT_URL);
  await clickChoice(keep);
  await waitInserted(1);
  check(`${T}, insertion : « ${keep} » (vrai clic) insère l'image avec l'adresse tapée, sans que le widget la télécharge`, !(await isOpen()) && (await insertedSrc()) === INSERT_URL && net.fetch.length === 0, { src: await insertedSrc(), fetch: net.fetch });
  await leaveImage();
  const keptState = await editorImages();
  check(`${T}, insertion : le lien gardé s'affiche tout de suite, sans cadre « ${await tr('image.blocked.show')} » (l'accord pour ce site est donné) : l'image est chargée`, keptState.blocked === 0 && keptState.loaded === 1 && requestsTo(INSERT_HOST) >= 1, { keptState, image: net.image });
  const kept = await outlineOf(`.tiptap img[src^="https://${INSERT_HOST}"]`);
  const tip = await tr('image.externalSite', { site: INSERT_HOST });
  const keptBox = await imageTop(`.tiptap img[src^="https://${INSERT_HOST}"]`);
  const redKept = await redPixels(keptBox);
  check(`${T}, insertion : le lien gardé reste signalé - hôte, infobulle, tirets rouges (${redKept} pixels rouges sur une vraie capture)`, !!kept && kept.site === INSERT_HOST && kept.title === tip && DASHED_RED(kept) && keptBox.onTop && redKept >= 25, { kept, redKept, keptBox });
  await snap(`insertion-${T}-lien-garde`);

  // « Intégrer l'image » (clic réel) : une image copiée dans le modèle, téléchargée une fois, sans rien d'un autre site.
  await resetDocument();
  await typeImageUrl(INSERT_URL);
  await clickChoice(embed);
  await waitInserted(1);
  const embeddedSrc = await insertedSrc();
  check(`${T}, insertion : « ${embed} » (vrai clic) télécharge l'image une fois et l'insère en data:, sans l'adresse du site`, !(await isOpen()) && !!embeddedSrc && embeddedSrc.startsWith('data:image/') && net.fetch.length === 1 && net.fetch[0] === INSERT_URL && !embeddedSrc.includes(INSERT_HOST), { src: embeddedSrc && embeddedSrc.slice(0, 40), fetch: net.fetch });
  await leaveImage();
  const embedded = await outlineOf('.tiptap img.editor-image');
  const embeddedBox = await imageTop('.tiptap img.editor-image');
  const redEmbedded = await redPixels(embeddedBox);
  check(`${T}, insertion : l'image intégrée n'a ni hôte, ni infobulle, ni tirets (${redEmbedded} pixel rouge sur une vraie capture)`, !!embedded && embedded.site === null && !embedded.title && embedded.style !== 'dashed' && embeddedBox.onTop && redEmbedded === 0, { embedded, redEmbedded, embeddedBox });
  await snap(`insertion-${T}-image-integree`);
  if (dark) await page.evaluate(() => Settings.setTheme('light'));
  if (english) await page.evaluate(() => I18n.setLang('fr'));
}

// Le reste, en clair : tout au clavier (Entrée dans la saisie puis Entrée sur le choix par défaut), une adresse data: sans question, un site dont le téléchargement échoue.
async function runInsertMore(T) {
  await resetDocument();
  await typeImageUrl(INSERT_URL, { enter: true });
  check(`${T}, insertion au clavier : Entrée dans la saisie ouvre la question, le focus est sur « ${await tr('dialog.imageExternal.embed')} »`, (await questionState()).focus === await tr('dialog.imageExternal.embed'), await questionState());
  await page.keyboard.press('Enter');
  await waitInserted(1);
  const src = await insertedSrc();
  check(`${T}, insertion au clavier : Entrée sur le choix par défaut intègre l'image (data:), rien d'autre à faire`, !!src && src.startsWith('data:image/') && net.fetch.length === 1 && !(await isOpen()), { src: src && src.slice(0, 40), fetch: net.fetch });

  // Une adresse data: n'envoie personne ailleurs : aucune question.
  await resetDocument();
  await realClick('#v2-btn-image', 300);
  await page.keyboard.type(DATA_PNG);
  await click(OK);
  await waitInserted(1);
  check(`${T}, insertion : une adresse data: s'insère tout de suite, sans la question`, !(await isOpen()) && (await insertedSrc()) === DATA_PNG, { open: await isOpen(), src: (await insertedSrc() || '').slice(0, 30) });

  // Un site dont le téléchargement échoue : l'alerte d'avant est gardée, le lien est gardé et signalé comme tout lien d'un autre site.
  await resetDocument();
  const REFUSE_URL = `https://${REFUSE_HOST}/logo.png`;
  const alertsBefore = nativeDialogs.length;
  await typeImageUrl(REFUSE_URL);
  await clickChoice(await tr('dialog.imageExternal.embed'));
  await waitInserted(1);
  const alerts = nativeDialogs.splice(alertsBefore);
  check(`${T}, insertion : un site dont le téléchargement échoue - une seule alerte (celle de toujours), le lien est gardé`, alerts.length === 1 && alerts[0] === 'alert : ' + await tr('image.corsWarning') && (await insertedSrc()) === REFUSE_URL, { alerts: alerts.map(a => a.slice(0, 60)), src: await insertedSrc() });
  await leaveImage();
  const refused = await outlineOf(`.tiptap img[src^="https://${REFUSE_HOST}"]`);
  check(`${T}, insertion : ce lien gardé malgré lui est signalé en tirets rouges`, !!refused && refused.site === REFUSE_HOST && DASHED_RED(refused), refused);
}

// 8) L'affichage d'un site ne dure que la séance de la page : le vrai clic n'écrit rien, et la page rechargée remet le cadre (rien n'a été retenu, aucune requête vers le site).
// Dernière partie : le rechargement repart d'une page neuve (le compteur de fenêtres d'export de la page, entre autres, est remis à zéro).
async function runReload(T) {
  const host = `recharge-${T}.exemple.test`;
  const stored = () => page.evaluate(() => JSON.stringify({ local: Object.entries(localStorage).sort(), session: Object.entries(sessionStorage).sort() }));
  const written = () => page.evaluate(() => window.__gristStub.getActionLog().length);
  await seed(documentHtml([host]));
  net.image.length = 0; net.fetch.length = 0;
  const storedBefore = await stored(), writtenBefore = await written();
  check(`${T}, rechargement : avant le clic, le site a son cadre « Afficher » et aucune requête n'est partie (${requestsTo(host)})`, (await frameCount('.tiptap')) === 1 && requestsTo(host) === 0, { frames: await frameCount('.tiptap'), image: net.image });
  await realClick(`${editorFrame(host)} .editor-image-reveal`, 500);
  await imageLoaded('.tiptap', host);
  await page.waitForTimeout(800);
  check(`${T}, rechargement : le vrai clic affiche l'image (${requestsTo(host)} requête) sans rien écrire (ni localStorage, ni sessionStorage, ni action dans le document Grist)`,
    requestsTo(host) >= 1 && (await frameCount('.tiptap')) === 0 && (await stored()) === storedBefore && (await written()) === writtenBefore, { before: storedBefore, after: await stored(), actions: await page.evaluate(() => window.__gristStub.getActionLog()) });
  await openHarness(true);
  net.image.length = 0; net.fetch.length = 0;
  await seed(documentHtml([host]));
  await page.waitForTimeout(500);
  check(`${T}, rechargement : la page rechargée remet le cadre « Afficher » à ce site (rien n'a été retenu) et n'a envoyé aucune requête vers lui (${requestsTo(host)})`, (await frameCount('.tiptap')) === 1 && requestsTo(host) === 0, { frames: await frameCount('.tiptap'), image: net.image });
}

// Un arrêt (la fenêtre ne s'ouvre pas, un élément manque) est un échec rapporté, pas un plantage : le navigateur est fermé dans tous les cas.
try {
  await run('clair');
  await runDark();
  await runEnglish();
  await runDisplay('clair', { keyboard: true });
  await runZone('clair');
  await runExportAfterReveal('clair');
  await runDisplay('sombre', { dark: true });
  await runDisplay('anglais', { english: true });
  await runInsert('clair');
  await runInsertMore('clair');
  await runInsert('sombre', { dark: true });
  await runInsert('anglais', { english: true });
  await runReload('clair');
} catch (e) { total++; failures++; console.log('  FAIL - le parcours s’arrête : ' + e.message); }

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
