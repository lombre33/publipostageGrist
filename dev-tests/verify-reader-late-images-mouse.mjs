#!/usr/bin/env node
// Lecture d'un macro-modèle à la taille du panneau Grist d'Antoine (~700x400), avec la vraie souris (liste des modèles, Mode lecture, molette) et une VRAIE image de pièce
// jointe lente (requête retardée par le réseau) : ce que Antoine regarde, pas un objet intermédiaire.
// Bugs corrigés (02/10, point 3 de son retour : « vue lecture lente et parfois affichage mauvais, coupure entre les pages, un décalage chelou apparaît et pousse tout vers le bas,
// mais pas si on part et revient de la ligne ») :
//  - la pagination de la Lecture était mesurée une seule fois : une image qui finissait de charger après (pièce jointe lue sur le serveur de Grist, première vue) laissait des
//    bandes de page périmées - une ligne coupée en deux, le contenu poussé vers le bas ; revenir sur la ligne (image déjà vue) n'avait pas le défaut. Maintenant la Lecture attend
//    les images (1,5 s au plus) avant de mesurer, puis suit celles qui arrivent plus tard (js/reader-mode.js:settleImages, watchGeometry).
//  - chaque variable d'une autre table relisait des tables entières (304 lectures pour trois pages) : la Lecture lit maintenant chaque table une fois par rendu (js/grist-api.js:withReadPass).
// Lancé par run-headless.mjs (groupe Node "readerLateMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-reader-late-images-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.READER_LATE_MOUSE_PORT || 8934);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-macro-images-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-reader-late-images-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const pageErrors = [];
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// La pièce jointe : le widget la lit à ${baseUrl}/attachments/<id>/download?auth=<jeton> (js/grist-api.js:getAttachmentDownloadUrl). Le faux Grist donne ici l'adresse de ce
// serveur de test, et la requête de l'image est retardée de `imageDelayMs` - la première vue d'une pièce jointe réelle, avant qu'elle soit dans le cache du navigateur.
let imageDelayMs = 0;
let imageHits = 0;
const PNG_HEIGHT_PX = 600;
async function pngBytes() {
  return Buffer.from((await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#3d6fc4'; ctx.fillRect(0, 0, 900, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  })), 'base64');
}

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });
const png = await pngBytes();
await page.route('**/api/docs/stub/attachments/*/download*', async route => {
  imageHits++;
  if (imageDelayMs) await sleep(imageDelayMs);
  route.fulfill({ status: 200, contentType: 'image/png', body: png });
});
await page.evaluate(base => {
  window.grist.docApi.getAccessToken = async () => ({ token: 'jeton-test', baseUrl: base + '/api/docs/stub', ttlMsecs: 600000 });
}, BASE);

const center = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

// === Le document : une table de dossiers, des clients et des employés (variables d'autres tables, comme le macro-modèle d'Antoine) ===
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('RlClients', { Nom: 'Text', Ville: 'Text' });
  stub.setRows('RlClients', Array.from({ length: 400 }, (_, i) => ({ id: i + 1, Nom: 'Client ' + (i + 1), Ville: 'Ville ' + (i + 1) })));
  stub.setVariables('RlEmployes', { Nom: 'Text' });
  stub.setRows('RlEmployes', Array.from({ length: 20 }, (_, i) => ({ id: i + 1, Nom: 'Employé ' + (i + 1) })));
  stub.setVariables('RlDossiers', { Nom: 'Text', Client: 'Ref:RlClients', Responsable: 'Ref:RlEmployes', Logo: 'Attachments', gristHelper_Display: 'Text', gristHelper_Display2: 'Text' }, null,
    { Client: 'gristHelper_Display', Responsable: 'gristHelper_Display2' });
  stub.setRows('RlDossiers', Array.from({ length: 30 }, (_, i) => ({ id: i + 1, Nom: 'Dossier ' + (i + 1), Client: i + 1, Responsable: (i % 20) + 1, Logo: null,
    gristHelper_Display: 'Client ' + (i + 1), gristHelper_Display2: 'Employé ' + ((i % 20) + 1) })));
  await GristAPI.refreshSchema();
  await GristAPI.saveLinkRule('RlClients', { mode: 'match', colonneCible: 'id', colonneSource: 'Client' });
  await GristAPI.saveLinkRule('RlEmployes', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
  stub.fireRecord({ id: 17, Nom: 'Dossier 17', Client: 'Client 17', Responsable: 'Employé 17', Logo: null }, 'RlDossiers');
});

const badge = (t, c) => `<span class="var-badge" data-table="${t}" data-column="${c}" data-key="${t}.${c}"></span>`;
const para = (t, n) => Array.from({ length: n }, (_, i) => `<p>${t} ligne ${i + 1} : ${badge('RlClients', i % 2 ? 'Nom' : 'Ville')} suivi de ${badge('RlEmployes', 'Nom')} sur le dossier ${badge('RlDossiers', 'Nom')}</p>`).join('');
// Courrier 1 : de quoi remplir une page et demie, l'image de la pièce jointe (grande) au milieu. Courrier 2 : l'annexe.
const letter1 = `<h1>Courrier de garde</h1>${para('Garde', 16)}<p><img class="editor-image" data-source="attachment" data-attachment-id="7" src="" style="width: 560px"></p>${para('Suite', 44)}`;
const letter2 = `<h1>Annexe</h1>${para('Annexe', 28)}`;

async function makeTemplate(name, html, type) {
  return page.evaluate(async ({ name, html, type }) => {
    const r = await Templates.save(null, name, html, '', null, null, type || 'document', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    const option = document.createElement('option'); option.value = String(r.id); option.textContent = name; select.appendChild(option);
    return r.id;
  }, { name, html, type });
}
const id1 = await makeTemplate('Courrier de garde', letter1);
const id2 = await makeTemplate('Annexe', letter2);
const macroId = await makeTemplate('Macro lente', JSON.stringify({ slots: [{ type: 'fixed', modeleId: id1 }, { type: 'fixed', modeleId: id2 }] }), 'macro');

// La liste des modèles à la vraie souris : ouvrir l'arbre, cliquer la ligne.
async function pickTemplate(name, id) {
  const open = await page.evaluate(() => { const p = document.querySelector('.tts-popup'); return !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 0; });
  if (!open) { const tb = await center('.tts-trigger'); await page.mouse.click(tb.x, tb.y); await sleep(300); }
  const pos = await page.evaluate(n => {
    const row = Array.from(document.querySelectorAll('.tts-popup .tts-row-leaf')).find(e => e.querySelector('.tts-row-label').textContent.replace(' ★', '') === n);
    if (!row) return null;
    row.scrollIntoView({ block: 'nearest' });
    const b = row.getBoundingClientRect();
    return { x: b.left + 60, y: b.top + b.height / 2 };
  }, name);
  if (!pos) return false;
  await page.mouse.move(pos.x, pos.y); await sleep(80);
  await page.mouse.click(pos.x, pos.y);
  await page.waitForFunction(i => String(Templates.getCurrentId()) === String(i), id, { timeout: 5000 }).catch(() => {});
  await sleep(500);
  return true;
}

// La mise en page de la Lecture, mesurée comme Antoine la voit : où coupe chaque page (bloc qui finit la page, bloc qui ouvre la suivante), et si un bloc chevauche une coupure.
// Les rectangles sont en pixels écran, déjà multipliés par le zoom d'ajustement du panneau : à diviser par lui.
function readerGeometry() {
  const rc = document.getElementById('reader-container');
  const content = rc.querySelector('.reader-content');
  if (!content) return null;
  const zoom = content.getBoundingClientRect().width / content.offsetWidth || 1;
  const bands = Array.from(rc.querySelectorAll('.v2-page-band')).map(b => { const r = b.getBoundingClientRect(); return { top: r.top / zoom, bottom: r.bottom / zoom }; });
  const kids = Array.from(content.children).filter(k => k.tagName !== 'STYLE' && !k.classList.contains('page-break-marker')).map(k => { const r = k.getBoundingClientRect(); return { text: (k.textContent || '').slice(0, 24), top: r.top / zoom, bottom: r.bottom / zoom, h: r.height / zoom }; });
  const straddle = bands.flatMap((b, i) => kids.filter(k => k.h > 0 && k.top < b.bottom - 0.5 && k.bottom > b.top + 0.5).map(k => ({ band: i, kid: k.text })));
  const cuts = bands.map(b => {
    const before = kids.filter(k => k.bottom <= b.top + 0.5).pop();
    const after = kids.find(k => k.top >= b.bottom - 0.5);
    return (before ? before.text : '-') + ' | ' + (after ? after.text : '-');
  });
  const img = content.querySelector('img[data-source="attachment"]');
  return { bands: bands.length, cuts, straddle, imgComplete: !!(img && img.complete && img.naturalWidth > 0), imgHeight: img ? Math.round(img.getBoundingClientRect().height / zoom) : null,
    height: Math.round(content.getBoundingClientRect().height / zoom), text: content.textContent.length };
}
// Attend que la Lecture ne bouge plus (même mesure trois fois de suite, image arrivée).
async function untilStable(limitMs) {
  const t0 = Date.now(); let last = ''; let same = 0;
  while (Date.now() - t0 < limitMs) {
    const g = await page.evaluate(readerGeometry);
    const now = JSON.stringify(g);
    same = (g && g.imgComplete && now === last) ? same + 1 : 0;
    last = now;
    if (same >= 3) return g;
    await sleep(150);
  }
  return page.evaluate(readerGeometry);
}
async function openReader() {
  // La Lecture d'avant reste dans le conteneur masqué : vidé, pour que « la feuille apparaît » désigne le nouveau rendu et non l'ancien.
  await page.evaluate(() => { document.getElementById('reader-container').innerHTML = ''; });
  const t0 = Date.now();
  const btn = await center('#btn-mode-read');
  await page.mouse.click(btn.x, btn.y);
  await page.waitForSelector('#reader-container .reader-content', { timeout: 15000 });
  const first = await page.evaluate(readerGeometry);
  return { first, appearedAfterMs: Date.now() - t0 };
}
async function closeReader() {
  const btn = await center('#btn-mode-edit');
  await page.mouse.click(btn.x, btn.y);
  await sleep(500);
}

check('Aperçu A4 actif d\'office', await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview')));
check('le macro-modèle s\'ouvre dans la liste des modèles', await pickTemplate('Macro lente', macroId));

// === Référence : la même Lecture, image servie sans attendre ===
imageDelayMs = 0;
const ref = await openReader();
const reference = await untilStable(8000);
check('référence : la Lecture a plusieurs pages, l\'image est arrivée, rien ne chevauche une coupure', !!reference && reference.bands >= 2 && reference.imgComplete && reference.straddle.length === 0 && reference.imgHeight > 300, reference);
await closeReader();

// === Image un peu lente (sous la limite d'attente de la Lecture) : la première mise en page est déjà la bonne ===
imageDelayMs = 700;
const t0 = Date.now();
const slow = await openReader();
check('image lente : la Lecture attend l\'image avant de se mettre en page (image arrivée à l\'affichage)', slow.first.imgComplete && slow.appearedAfterMs >= 600, { appearedAfterMs: slow.appearedAfterMs, first: slow.first });
check('image lente : coupures identiques à la référence dès l\'affichage, aucune ligne coupée en deux',
  JSON.stringify(slow.first.cuts) === JSON.stringify(reference.cuts) && slow.first.straddle.length === 0 && slow.first.height === reference.height, { first: slow.first, reference });
const slowFinal = await untilStable(6000);
check('image lente : la mise en page ne bouge plus ensuite', JSON.stringify(slowFinal) === JSON.stringify(slow.first), { first: slow.first, final: slowFinal });
await closeReader();

// === Image très lente (au-delà de la limite) : affichée sans elle, puis les coupures sont refaites à son arrivée ===
imageDelayMs = 3200;
const veryHitsBefore = imageHits;
const late = await openReader();
check('image très lente : la Lecture s\'affiche sans attendre l\'image indéfiniment (moins de 2,6 s)', late.appearedAfterMs < 2600 && !late.first.imgComplete, { appearedAfterMs: late.appearedAfterMs, first: late.first });
const lateFinal = await untilStable(10000);
check('image très lente : une fois l\'image arrivée, coupures identiques à la référence, aucune ligne coupée en deux',
  lateFinal.imgComplete && JSON.stringify(lateFinal.cuts) === JSON.stringify(reference.cuts) && lateFinal.straddle.length === 0 && lateFinal.height === reference.height, { first: late.first, final: lateFinal, reference });
check('image très lente : la mise en page avait bien changé à l\'arrivée de l\'image (le test voit le décalage)', JSON.stringify(late.first.cuts) !== JSON.stringify(reference.cuts) || late.first.height !== reference.height, { first: late.first, reference });

// La molette, à la vraie souris, jusqu'à la première coupure : elle entre dans la vue du panneau et rien n'y est coupé en deux.
const box = await page.evaluate(() => { const r = document.getElementById('reader-container').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.move(box.x, box.y);
const bandInView = () => page.evaluate(() => {
  const rc = document.getElementById('reader-container');
  const rect = rc.getBoundingClientRect();
  const band = rc.querySelector('.v2-page-band');
  const b = band && band.getBoundingClientRect();
  return { scrollTop: Math.round(rc.scrollTop), inView: !!b && b.top >= rect.top && b.top <= rect.bottom - 40, bandTop: b && Math.round(b.top - rect.top), panelHeight: Math.round(rect.height) };
});
let seen = await bandInView(); let steps = 0;
for (; steps < 60 && !seen.inView; steps++) { await page.mouse.wheel(0, 120); await sleep(40); seen = await bandInView(); }
check('molette : le panneau défile à la vraie souris jusqu\'à la première coupure de page, qui entre dans la vue', seen.scrollTop > 200 && seen.inView, { steps, seen });
const atBand = await page.evaluate(readerGeometry);
check('molette : à cet endroit, rien n\'est coupé en deux et la coupure est celle de la référence', atBand.straddle.length === 0 && JSON.stringify(atBand.cuts) === JSON.stringify(reference.cuts), atBand);
await closeReader();

// === Lectures : un rendu complet de la Lecture, du clic au texte, sans relire cent fois les mêmes tables ===
imageDelayMs = 0;
const reads = await page.evaluate(() => {
  window.__reads = [];
  const original = window.grist.docApi.fetchTable;
  window.__origFetch = original;
  window.grist.docApi.fetchTable = async (tableId) => { window.__reads.push(tableId); return original(tableId); };
});
await openReader();
const done = await untilStable(8000);
const readCounts = await page.evaluate(() => {
  window.grist.docApi.fetchTable = window.__origFetch;
  return window.__reads.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {});
});
const totalReads = Object.values(readCounts).reduce((a, b) => a + b, 0);
check('Lecture : chaque table est lue au plus deux fois (le rendu d\'entrée dans le mode et celui du zoom d\'ajustement), au total moins de vingt lectures', Math.max(...Object.values(readCounts)) <= 2 && totalReads < 20, { readCounts, totalReads });
const texts = await page.evaluate(() => document.querySelector('#reader-container .reader-content').textContent);
check('Lecture : les variables des trois tables sont résolues', texts.includes('Client 17') && texts.includes('Employé 17') && texts.includes('Dossier 17') && texts.includes('Ville 17') && !/ERREUR/.test(texts), texts.slice(0, 160));
await closeReader();

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
