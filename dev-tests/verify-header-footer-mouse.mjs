#!/usr/bin/env node
// En-tête et pied de page vides, à la taille du panneau Grist d'Antoine (~700x400), avec la vraie souris pour tout geste (clic dans la marge, « Terminer »,
// liste des modèles, Enregistrer, Mode lecture / Mode édition) et le vrai clavier pour la saisie.
// Bug corrigé (01/10) : un clic, même par erreur, dans la zone d'en-tête (ou de pied) puis « Terminer » sans rien écrire laissait un en-tête « activé » :
// exitHeaderFooterMode (js/header-footer-preview.js) gardait le « <p></p> » rendu par l'éditeur et l'état activé posé à l'entrée. Le modèle l'enregistrait
// ainsi, et la Lecture ouvrait une bande blanche de 26 px au-dessus et au-dessous de la feuille. Aucun test ne le voyait : les scénarios de
// dev-tests/scenarios-headerfooter.js entraient toujours dans une zone pour y taper quelque chose.
// Lancé par run-headless.mjs (groupe Node "headerFooterMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-header-footer-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.HEADER_FOOTER_MOUSE_PORT || 8912);
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-header-footer-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
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

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });


const sleep = ms => new Promise(r => setTimeout(r, ms));
// Laisse le temps à onUpdate de rejouer ses corrections, qui passent par des transactions supplémentaires : un état lu trop tôt cacherait la boucle.
const settle = () => sleep(700);

// Aperçu A4, le réglage par défaut (case cochée dans index.html) : c'est lui qui dessine les zones de marge cliquables.
check('Aperçu A4 actif d\'office', await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview')));

// Ce que le modèle garde en mémoire (donc ce qui s'enregistre et s'exporte), jamais le DOM.
const hfData = () => page.evaluate(() => JSON.parse(JSON.stringify(Editor.getHeaderFooterData())));
// Idem pour la ligne enregistrée : relue dans le faux Grist (Templates.loadAll), pas dans le cache du widget.
const savedHf = id => page.evaluate(async id => {
  await Templates.loadAll();
  const t = Templates.getCached().find(t => String(t.id) === String(id));
  return t ? t.headerFooter : null;
}, id);
const isClean = d => !!d && d.enabled === false && d.differentFirstPage === false && ['header', 'footer'].every(z => !d[z].default && !d[z].first);
const center = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

// Un clic de vraie souris dans la zone de marge d'en-tête (haut de la feuille) ou de pied (bas) ; on vérifie que c'est bien elle qui reçoit le clic.
async function clickZone(pos) {
  const sel = '#editor-container .v2-page-edge-' + pos;
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  await sleep(250);
  const c = await center(sel);
  const hit = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest('.v2-hf-zone')); }, c);
  await page.mouse.move(c.x, c.y); await sleep(80);
  await page.mouse.click(c.x, c.y);
  await sleep(350);
  return hit && await page.evaluate(() => Editor.isEditingHeaderFooter());
}
// « Terminer » de la pastille d'édition, à la vraie souris ; la pastille doit tenir dans le panneau de 700x400.
async function clickDone() {
  const inside = await page.evaluate(() => { const r = document.getElementById('v2-hf-btn-done').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth; });
  const c = await center('#v2-hf-btn-done');
  await page.mouse.move(c.x, c.y); await sleep(80);
  await page.mouse.click(c.x, c.y);
  await sleep(350);
  return inside && await page.evaluate(() => !Editor.isEditingHeaderFooter() && !document.getElementById('v2-hf-pill'));
}
// Texte tapé au vrai clavier dans la zone ouverte, puis (optionnel) tout effacé.
async function typeInZone(text) {
  await page.click('#editor-container .tiptap p >> nth=0');
  await page.keyboard.type(text);
  await sleep(150);
}
async function clearZone() {
  await page.click('#editor-container .tiptap p >> nth=0');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await sleep(150);
}
// La Lecture sur la ligne sélectionnée : combien de bandes d'en-tête et de pied elle ouvre autour de la feuille (une bande blanche est une zone « activée » vide).
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('Clients', { Nom: 'Text' });
  stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients');
});
async function readerEdges() {
  await page.click('#btn-mode-read');
  await page.waitForSelector('#reader-container .reader-content', { timeout: 10000 }).catch(() => {});
  await sleep(700);
  const edges = await page.evaluate(() => {
    const c = document.getElementById('reader-container');
    const h = sel => Array.from(c.querySelectorAll(sel)).map(e => Math.round(e.getBoundingClientRect().height));
    return { top: h('.v2-page-edge-top'), bottom: h('.v2-page-edge-bottom') };
  });
  await page.click('#btn-mode-edit');
  await sleep(700);
  return edges;
}
async function save() {
  await page.click('#btn-save');
  await sleep(900);
  return page.evaluate(() => Templates.getCurrentId());
}
// Un modèle de plus : ligne enregistrée dans le faux Grist + option du vrai <select> (l'arbre des modèles se construit d'après les deux).
async function makeTemplate(name, html, hf) {
  return page.evaluate(async ({ name, html, hf }) => {
    const r = await Templates.save(null, name, html, '', hf, null, 'document', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    const option = document.createElement('option'); option.value = String(r.id); option.textContent = name; select.appendChild(option);
    return r.id;
  }, { name, html, hf });
}
// La liste des modèles à la vraie souris : ouvrir l'arbre, cliquer la ligne. Le chargement est attendu par l'identifiant du modèle courant.
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
  await settle();
  return true;
}

// 1) Le geste d'Antoine : un clic par erreur dans l'en-tête, « Terminer » sans rien écrire - puis pareil dans le pied.
await page.evaluate(() => Editor.setHTML('<p>Corps du modèle</p>'));
await settle();
check('départ : aucun en-tête ni pied de page', isClean(await hfData()), await hfData());
check('clic de souris dans la zone d\'en-tête : on entre dans l\'édition de l\'en-tête, la pastille est là', await clickZone('top') && await page.evaluate(() => !!document.getElementById('v2-hf-pill')));
check('« Terminer » à la souris sans rien avoir écrit : on sort de l\'édition', await clickDone());
const afterTop = await hfData();
check('rien n\'est resté « activé » : ni en-tête, ni pied, ni première page différente, aucun fragment vide gardé', isClean(afterTop), afterTop);
check('la zone d\'en-tête a gardé son invitation à ajouter un en-tête (zone vide, cliquable)', await page.evaluate(() => !!document.querySelector('#editor-container .v2-page-edge-top.v2-hf-zone-empty .v2-hf-zone-ghost')));
check('clic de souris dans la zone de pied, « Terminer » : pareil', await clickZone('bottom') && await clickDone() && isClean(await hfData()), await hfData());
await page.evaluate(() => { document.getElementById('template-name').value = 'Courrier sans en-tête'; });
const idPlain = await save();
check('Enregistrer : le modèle enregistré n\'a ni en-tête ni pied de page activé', isClean(await savedHf(idPlain)), await savedHf(idPlain));
const plainEdges = await readerEdges();
check('Lecture : aucune bande blanche au-dessus ni au-dessous de la feuille', plainEdges.top.length === 0 && plainEdges.bottom.length === 0, plainEdges);

// 2) Un en-tête avec du texte tapé au vrai clavier reste : « Terminer » ne retire que ce qui est vide.
check('clic dans la zone d\'en-tête, texte tapé au clavier', await clickZone('top') && (await typeInZone('Courrier officiel'), true));
check('« Terminer » : l\'en-tête reste activé avec son texte', await clickDone() && await (async () => { const d = await hfData(); return d.enabled && d.header.default.includes('Courrier officiel') && !d.footer.default; })(), await hfData());
const idHeader = await save();
check('Enregistrer : le texte de l\'en-tête est dans le modèle', (await savedHf(idHeader)).enabled === true && (await savedHf(idHeader)).header.default.includes('Courrier officiel'), await savedHf(idHeader));
const headerEdges = await readerEdges();
check('Lecture : une bande d\'en-tête au-dessus de la feuille, pas de bande de pied', headerEdges.top.length === 1 && headerEdges.bottom.length === 0, headerEdges);

// 3) Un pied de page rempli, puis un clic par erreur dans l'en-tête : le pied reste, l'en-tête vide ne s'installe pas.
check('pied de page : clic dans la zone, texte tapé au clavier, « Terminer »', await clickZone('bottom') && (await typeInZone('Page de pied'), true) && await clickDone());
check('un clic par erreur dans l\'en-tête, « Terminer » : l\'en-tête rempli reste, le pied aussi', await clickZone('top') && await clickDone() && await (async () => { const d = await hfData(); return d.enabled && d.header.default.includes('Courrier officiel') && d.footer.default.includes('Page de pied'); })(), await hfData());

// 4) Tout effacer puis « Terminer » retire l'en-tête (le pied rempli garde l'état activé), puis le pied à son tour : plus rien n'est activé.
check('en-tête : tout effacer au clavier, « Terminer »', await clickZone('top') && (await clearZone(), true) && await clickDone());
const afterClearHeader = await hfData();
check('en-tête effacé : retiré, le pied de page rempli reste activé', afterClearHeader.enabled && !afterClearHeader.header.default && afterClearHeader.footer.default.includes('Page de pied'), afterClearHeader);
check('pied de page : tout effacer au clavier, « Terminer » : plus rien n\'est activé', await clickZone('bottom') && (await clearZone(), true) && await clickDone() && isClean(await hfData()), await hfData());
const idCleared = await save();
check('Enregistrer : le modèle enregistré est remis à plat', isClean(await savedHf(idCleared)), await savedHf(idCleared));
const clearedEdges = await readerEdges();
check('Lecture : aucune bande blanche', clearedEdges.top.length === 0 && clearedEdges.bottom.length === 0, clearedEdges);

// 5) Un modèle déjà enregistré dans cet état par l'ancien comportement (en-tête « activé » vide) : remis à plat à l'ouverture, plus de bande blanche en Lecture.
const staleHf = { enabled: true, differentFirstPage: false, header: { default: '<p></p>', first: '' }, footer: { default: '<p></p>', first: '' } };
const idStale = await makeTemplate('Ancien modèle activé', '<p>Corps ancien</p>', staleHf);
check('le modèle enregistré avec un en-tête activé vide est bien dans cet état', (await savedHf(idStale)).enabled === true, await savedHf(idStale));
check('ouvert par la liste des modèles : remis à plat en mémoire', await pickTemplate('Ancien modèle activé', idStale) && isClean(await hfData()), await hfData());
const staleEdges = await readerEdges();
check('Lecture de ce modèle : aucune bande blanche', staleEdges.top.length === 0 && staleEdges.bottom.length === 0, staleEdges);
await save();
check('Enregistrer ce modèle : il est enregistré à plat', isClean(await savedHf(idStale)), await savedHf(idStale));

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
