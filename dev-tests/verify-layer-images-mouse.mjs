#!/usr/bin/env node
// Images en calque d'un ancien modèle (sans position de page) chargées éditeur masqué, à la taille du panneau Grist d'Antoine (~700x400), avec la vraie souris pour
// tout geste (liste des modèles, Enregistrer, Mode lecture / Mode édition) et le vrai clavier pour la frappe.
// Bug corrigé (01/10) : HeaderFooterPreview.migrateLegacyImagePositions (js/header-footer-preview.js) donne leur position de page (pageIndex, pageLeftPt, pageTopPt) aux
// images en calque qui n'en ont pas, en mesurant le DOM. Appelée par Editor.setHTML, elle tournait aussi quand l'éditeur était masqué (Mode lecture, résumé d'un
// macro-modèle) : tous les rectangles valent alors 0, l'image recevait -marge/-marge (le coin de la page) et cette position s'enregistrait à la première frappe ou au
// premier Enregistrer, sans jamais être recalculée. Aucun test ne le voyait : les scénarios de dev-tests/scenarios-images.js chargent un modèle dans un éditeur visible.
// Lancé par run-headless.mjs (groupe Node "layerImagesMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-layer-images-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.LAYER_IMAGES_MOUSE_PORT || 8913);
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
if (!OFFLINE) console.log('[verify-layer-images-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });


const sleep = ms => new Promise(r => setTimeout(r, ms));
// Laisse le temps à onUpdate de rejouer ses corrections, qui passent par des transactions supplémentaires : un état lu trop tôt cacherait la boucle.
const settle = () => sleep(700);

// Aperçu A4, le réglage par défaut (case cochée dans index.html) : c'est lui qui déclenche la position de page des images en calque.
check('Aperçu A4 actif d\'office', await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview')));

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
// Position de page de la première image, lue dans le HTML (ce qui s'enregistre et s'exporte), jamais dans le DOM : l'éditeur masqué n'a aucune mesure à offrir.
const gridOf = html => page.evaluate(h => {
  const img = new DOMParser().parseFromString(h, 'text/html').querySelector('img.editor-image');
  const num = name => (img && img.hasAttribute(name)) ? parseFloat(img.getAttribute(name)) : null;
  return img ? { pageIndex: num('data-page-index'), pageLeftPt: num('data-page-left-pt'), pageTopPt: num('data-page-top-pt'), left: img.style.left, top: img.style.top } : null;
}, html);
const docGrid = async () => gridOf(await page.evaluate(() => Editor.getHTML()));
// Idem pour la ligne enregistrée : relue dans le faux Grist (Templates.loadAll), pas dans le cache du widget.
const savedGrid = async id => gridOf(await page.evaluate(async id => {
  await Templates.loadAll();
  return (Templates.getCached().find(t => String(t.id) === String(id)) || {}).contenu || '';
}, id));
const editorHidden = () => page.evaluate(() => getComputedStyle(document.getElementById('editor-container')).display === 'none');
const center = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.6;
const sameGrid = (a, b) => !!a && !!b && a.pageIndex === b.pageIndex && near(a.pageLeftPt, b.pageLeftPt) && near(a.pageTopPt, b.pageTopPt);
const atCorner = async g => { const m = await page.evaluate(() => PageLayout.getMarginsPt()); return !!g && near(g.pageLeftPt, -m.left) && near(g.pageTopPt, -m.top); };

// Un modèle de plus : ligne enregistrée dans le faux Grist + option du vrai <select> (l'arbre des modèles se construit d'après les deux).
async function makeTemplate(name, html, type) {
  return page.evaluate(async ({ name, html, type }) => {
    const r = await Templates.save(null, name, html, '', null, null, type || 'document', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    const option = document.createElement('option'); option.value = String(r.id); option.textContent = name; select.appendChild(option);
    return r.id;
  }, { name, html, type });
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
// Fermer la barre flottante de l'image que la migration sélectionne, sans toucher au document : un clic dans le texte, puis une frappe réelle ensuite.
// La frappe attend que ProseMirror ait lu le clic (selectionchange, quelques ms après mouseup) : une touche pressée avant remplacerait l'image encore
// sélectionnée par le texte (keypress sur une NodeSelection), ce qu'aucun vrai doigt ne fait.
async function typeIntoBody(text) {
  await page.click('.tiptap p >> nth=0');
  await page.waitForFunction(() => !EditorCore.getEditor().state.selection.node, null, { timeout: 5000 });
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
  await sleep(300);
}

// Les modèles : un ancien (image en calque avec left/top seulement), un récent (position de page déjà posée), un macro-modèle qui compose l'ancien.
const legacyHtml = '<p>Madame, Monsieur,</p><p>Texte avec une image <img class="editor-image" src="' + PNG + '" alt="" style="width: 100px; height: 100px; left: 123px; top: 210px; position: absolute;" data-layer="front" data-wrap="inline"> posée en calque.</p><p>Cordialement.</p>';
const modernHtml = '<p>Texte récent <img class="editor-image" src="' + PNG + '" alt="" style="width: 100px; height: 100px; left: 123px; top: 210px; position: absolute;" data-layer="front" data-wrap="inline" data-page-index="0" data-page-left-pt="477.5" data-page-top-pt="-2.5"> avec sa position.</p>';
const idLegacy = await makeTemplate('Courrier ancien', legacyHtml);
const idModern = await makeTemplate('Courrier récent', modernHtml);
const idMacro = await makeTemplate('Macro courriers', JSON.stringify({ slots: [{ type: 'fixed', modeleId: idLegacy }] }), 'macro');
check('le modèle ancien enregistré n\'a pas de position de page', (await savedGrid(idLegacy)).pageIndex === null, await savedGrid(idLegacy));

// 1) Témoin : l'ancien modèle chargé éditeur visible reçoit sa position de page.
check('éditeur visible : l\'ancien modèle se charge', await pickTemplate('Courrier ancien', idLegacy) && !(await editorHidden()));
const visible = await docGrid();
check('éditeur visible : l\'image a reçu sa position de page (page 1, à droite et sous le haut de la page)', !!visible && visible.pageIndex === 0 && visible.pageLeftPt > 0 && visible.pageTopPt > 0, visible);

// 2) Par un macro-modèle : l'éditeur est masqué pendant que l'ancien modèle se charge.
check('macro-modèle ouvert : l\'éditeur est masqué', await pickTemplate('Macro courriers', idMacro) && await editorHidden());
check('macro-modèle puis retour sur l\'ancien modèle : l\'image a la même position de page que chargée éditeur visible (pas le coin de la page)',
  await pickTemplate('Courrier ancien', idLegacy) && !(await editorHidden()) && sameGrid(await docGrid(), visible) && !(await atCorner(await docGrid())), { apres: await docGrid(), visible });

// 3) En Mode lecture : l'ancien modèle se charge éditeur masqué, la position se mesure au retour du Mode édition.
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('Clients', { Nom: 'Text' });
  stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients');
});
await pickTemplate('Courrier récent', idModern);
await page.click('#btn-mode-read');
await page.waitForSelector('#reader-container .reader-content', { timeout: 10000 }).catch(() => {});
await sleep(600);
check('Mode lecture : l\'éditeur est masqué', await editorHidden());
check('Mode lecture : l\'ancien modèle se charge', await pickTemplate('Courrier ancien', idLegacy));
const whileReading = await docGrid();
check('Mode lecture : tant que l\'éditeur est masqué, l\'image n\'a reçu aucune position (rien n\'a été mesuré)', !!whileReading && whileReading.pageIndex === null && whileReading.left === '123px' && whileReading.top === '210px', whileReading);
await page.click('#btn-mode-edit');
await sleep(800);
const back = await docGrid();
check('retour au Mode édition : l\'image reçoit la même position de page que chargée éditeur visible', !(await editorHidden()) && sameGrid(back, visible), { back, visible });
check('retour au Mode édition : la position n\'est pas le coin de la page', !(await atCorner(back)), back);

// 4) Ce qui s'enregistre : une frappe réelle puis Enregistrer. Avant le correctif, c'est ici que la mauvaise position partait dans le modèle.
await typeIntoBody(' Suite.');
// La fin de l'enregistrement se lit dans le texte d'état (« Enregistré à hh:mm:ss »), pas à l'horloge : une relecture trop tôt verrait la ligne en cours d'écriture.
await page.evaluate(() => { document.getElementById('status-msg').textContent = ''; });
await page.click('#btn-save');
await page.waitForFunction(() => /Enregistré/.test(document.getElementById('status-msg').textContent || ''), null, { timeout: 15000 }).catch(() => {});
const savedAfterSave = await savedGrid(idLegacy);
check('Enregistrer après le retour : la ligne enregistrée porte la position mesurée éditeur visible, pas le coin de la page', sameGrid(savedAfterSave, visible) && !(await atCorner(savedAfterSave)), { savedAfterSave, visible });

// 5) Un modèle qui a déjà sa position de page ne la perd pas en passant par un macro-modèle ni par le Mode lecture.
check('modèle récent : sa position de page est celle du modèle', await pickTemplate('Courrier récent', idModern) && (await docGrid()).pageLeftPt === 477.5 && (await docGrid()).pageTopPt === -2.5, await docGrid());
await pickTemplate('Macro courriers', idMacro);
check('modèle récent chargé après un macro-modèle : position de page intacte', await pickTemplate('Courrier récent', idModern) && (await docGrid()).pageIndex === 0 && (await docGrid()).pageLeftPt === 477.5 && (await docGrid()).pageTopPt === -2.5, await docGrid());
await page.click('#btn-mode-read');
await sleep(600);
await pickTemplate('Courrier récent', idModern);
await page.click('#btn-mode-edit');
await sleep(800);
check('modèle récent chargé en Mode lecture puis retour au Mode édition : position de page intacte', (await docGrid()).pageIndex === 0 && (await docGrid()).pageLeftPt === 477.5 && (await docGrid()).pageTopPt === -2.5, await docGrid());
// Le retour de l'éditeur n'est pas une frappe : l'enregistrement automatique (toutes les 2,5 s, activé d'office) ne doit rien réécrire.
await sleep(4000);
const modernSaved = await savedGrid(idModern);
check('retour au Mode édition : l\'auto-save ne réécrit pas le modèle récent', modernSaved.pageLeftPt === 477.5 && modernSaved.pageTopPt === -2.5, modernSaved);

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
