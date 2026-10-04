#!/usr/bin/env node
// Images en calque (flottantes) d'un macro-modèle, à la taille du panneau Grist d'Antoine (~700x400), avec la vraie souris pour tout geste (liste des modèles,
// Mode lecture, bouton « Exporter en PDF ») et le PDF téléchargé relu par pdf.js : ce que Antoine ouvre, pas un objet intermédiaire.
// Bug corrigé (01/10) : le `top` d'une image en calque (et sa page, pour les modèles récents) se compte depuis le haut de la première page de SON modèle. Mis bout à
// bout par un macro-modèle (js/macro-templates.js:buildConcatenatedHtml), les slots suivants commencent plus bas et sur d'autres pages, mais la Lecture
// (js/reader-mode.js) et l'export PDF (js/pdf-export.js) gardaient ces nombres tels quels : toutes les images s'empilaient en haut du document. Aucun test ne le voyait :
// les scénarios de dev-tests/scenarios-macro-modeles.js ne regardaient que le texte assemblé.
// Lancé par run-headless.mjs (groupe Node "macroImagesMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-macro-images-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.MACRO_IMAGES_MOUSE_PORT || 8914);
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
if (!OFFLINE) console.log('[verify-macro-images-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, acceptDownloads: true });
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
// extractPdfGroundTruth (pdf.js) relit le PDF téléchargé : ce sont les positions RÉELLEMENT peintes, pas celles de la définition pdfmake.
await page.addScriptTag({ path: join(ROOT, 'dev-tests', 'helpers.js') });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const settle = () => sleep(700);
const center = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

check('Aperçu A4 actif d\'office', await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview')));

// Trois courriers, le premier sur deux pages et plus : ALPHA (image derrière), BRAVO (devant), CHARLIE (derrière). Position de page (pt) et `top` CSS (px) vont ensemble
// comme dans un modèle enregistré par l'éditeur (top = position de page / 0,75). Les anciens modèles n'ont que left/top.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const LETTERS = [
  { word: 'ALPHA', layer: 'behind', topPt: 45, filler: 60 },
  { word: 'BRAVO', layer: 'front', topPt: 90, filler: 0 },
  { word: 'CHARLIE', layer: 'behind', topPt: 160, filler: 0 },
];
const letterHtml = (l, grid) => {
  const topPx = +(l.topPt / 0.75).toFixed(2);
  const img = '<img class="editor-image" src="' + PNG + '" alt="" style="width: 71px; position: absolute; left: 674px; top: ' + topPx + 'px;" data-layer="' + l.layer + '" data-wrap="inline"'
    + (grid ? ' data-page-index="0" data-page-left-pt="477.5" data-page-top-pt="' + l.topPt + '"' : '') + '>';
  return '<p>' + l.word + img + '</p>' + [0, 1, 2, 3, 4].map(i => '<p>Ligne ' + i + ' du courrier</p>').join('')
    + Array.from({ length: l.filler }, (_, i) => '<p>Remplissage ' + i + '</p>').join('');
};
const PDF_MARGIN_PT = 28.35;

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

// La ligne courante : une table et une ligne quelconques, les slots de ces macro-modèles sont tous fixes.
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('Clients', { Nom: 'Text' });
  stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients');
});

// Lecture : l'image de chaque courrier garde, par rapport au titre de SON courrier, la distance qu'elle a quand ce courrier est lu seul (top CSS - marge haute de la
// feuille), et les images descendent avec les courriers au lieu de s'empiler. La zone zoomée du panneau (700 px de large) rend les nombres à diviser par le zoom.
async function readerMeasure() {
  return page.evaluate(({ words }) => {
    const content = document.querySelector('#reader-container .reader-content');
    if (!content) return null;
    const zoom = content.getBoundingClientRect().width / content.offsetWidth || 1;
    const padTop = parseFloat(getComputedStyle(content).paddingTop) || 0;
    const imgs = Array.from(content.querySelectorAll('img.editor-image'));
    const titles = words.map(w => Array.from(content.querySelectorAll('p')).find(p => p.textContent.trim() === w));
    if (imgs.length !== words.length || titles.some(t => !t)) return { images: imgs.length, titles: titles.map(t => !!t) };
    return {
      zoom: +zoom.toFixed(3), padTop,
      distances: imgs.map((img, i) => +((img.getBoundingClientRect().top - titles[i].getBoundingClientRect().top) / zoom).toFixed(1)),
      tops: imgs.map(img => +(img.getBoundingClientRect().top).toFixed(1)),
    };
  }, { words: LETTERS.map(l => l.word) });
}
async function checkReader(label, macroName, macroId) {
  check(`${label} : le macro-modèle s'ouvre`, await pickTemplate(macroName, macroId));
  await page.click('#btn-mode-read');
  await page.waitForSelector('#reader-container .reader-content img.editor-image', { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const m = await readerMeasure();
  // Le `top` d'origine de chaque modèle (celui qu'il a lu seul), pas celui que la Lecture affiche : elle l'a déjà descendu du début de son slot.
  const expected = m && m.padTop != null ? LETTERS.map(l => +(l.topPt / 0.75 - m.padTop).toFixed(1)) : null;
  check(`${label}, Lecture : les trois images et les trois titres sont là`, !!m && !!m.distances, m);
  if (m && m.distances) {
    check(`${label}, Lecture : chaque image est à la même distance du titre de son courrier que dans ce courrier lu seul`,
      m.distances.every((d, i) => Math.abs(d - expected[i]) < 2), { distances: m.distances, expected, zoom: m.zoom });
    check(`${label}, Lecture : les images descendent avec les courriers, aucune n'est empilée en haut du document`,
      m.tops[0] < m.tops[1] && m.tops[1] < m.tops[2] && m.tops[1] - m.tops[0] > 300, m.tops);
  }
  await page.click('#btn-mode-edit');
  await sleep(500);
}

// Export : le vrai bouton de la barre, le fichier que Chromium télécharge, relu par pdf.js.
async function exportedPdf() {
  const btn = await center('#btn-export-pdf');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90000 }).catch(() => null),
    page.mouse.click(btn.x, btn.y),
  ]);
  if (!download) return null;
  const base64 = readFileSync(await download.path()).toString('base64');
  return page.evaluate(b64 => TestHelpers.extractPdfGroundTruth(b64), base64);
}
// Distance de la première image de la page d'un mot à ce mot (pt) : celle d'un ancien modèle ne dépend pas d'une position de page mais du texte voisin.
const gapOf = (truth, word) => {
  const pageNo = truth.pages.findIndex(p => p.textItems.some(t => t.str.includes(word))) + 1;
  if (!pageNo || !truth.pages[pageNo - 1].images.length) return null;
  return truth.pages[pageNo - 1].images[0].y - truth.pages[pageNo - 1].textItems.find(t => t.str.includes(word)).y;
};
async function checkPdf(label, grid, aloneGaps) {
  const truth = await exportedPdf();
  check(`${label}, PDF : le bouton « Exporter en PDF » télécharge un fichier`, !!truth && truth.pages.length >= 3, truth && truth.pages.length);
  if (!truth) return;
  const pageOf = word => truth.pages.findIndex(p => p.textItems.some(t => t.str.includes(word))) + 1;
  const pages = LETTERS.map(l => pageOf(l.word));
  const perPage = truth.pages.map(p => p.images.length);
  check(`${label}, PDF : le premier courrier tient sur deux pages ou plus, les suivants commencent à la suite`, pages[0] === 1 && pages[1] > 2 && pages[2] > pages[1], pages);
  check(`${label}, PDF : une seule image sur la page de chaque courrier, trois en tout (aucune empilée sur la première page)`,
    pages.every((p, i) => p > 0 && perPage[p - 1] === 1) && perPage.reduce((a, b) => a + b, 0) === 3, { pages, perPage });
  if (grid) {
    const wantY = LETTERS.map(l => PDF_MARGIN_PT + l.topPt);
    const found = pages.map((p, i) => (p > 0 && truth.pages[p - 1].images[0]) || null);
    check(`${label}, PDF : chaque image est à sa position de page sur la page de son courrier`,
      found.every((im, i) => !!im && Math.abs(im.y - wantY[i]) < 1.5 && Math.abs(im.x - (PDF_MARGIN_PT + 477.5)) < 1.5), { found, wantY });
  } else {
    // Ancien modèle : pas de position de page, l'image est ancrée au texte voisin. Sa distance au titre de son courrier est celle qu'elle a quand ce courrier est exporté
    // seul, par le même bouton.
    const gaps = LETTERS.map(l => gapOf(truth, l.word));
    check(`${label}, PDF : chaque image est à la même distance du titre de son courrier que dans ce courrier exporté seul`,
      gaps.every((g, i) => g != null && aloneGaps[i] != null && Math.abs(g - aloneGaps[i]) < 3), { gaps, aloneGaps });
  }
}

// === Modèles à position de page (enregistrés par l'éditeur actuel) ===
const idsGrid = [];
for (const l of LETTERS) idsGrid.push(await makeTemplate('Courrier ' + l.word, letterHtml(l, true)));
const idMacroGrid = await makeTemplate('Macro courriers', JSON.stringify({ slots: idsGrid.map(id => ({ type: 'fixed', modeleId: id })) }), 'macro');
await checkReader('modèles récents', 'Macro courriers', idMacroGrid);
await checkPdf('modèles récents', true);

// === Anciens modèles (left/top seulement) ===
const idsLegacy = [];
for (const l of LETTERS) idsLegacy.push(await makeTemplate('Ancien ' + l.word, letterHtml(l, false)));
const idMacroLegacy = await makeTemplate('Macro anciens courriers', JSON.stringify({ slots: idsLegacy.map(id => ({ type: 'fixed', modeleId: id })) }), 'macro');
// Chaque ancien courrier exporté seul, par le vrai bouton : la référence de la distance de son image à son titre. Ouvert en Mode lecture, donc éditeur masqué : il garde sa
// forme d'ancien modèle (un éditeur visible lui donnerait sa position de page, et l'export prendrait l'autre chemin).
const aloneGaps = [];
await page.click('#btn-mode-read');
await sleep(500);
for (let i = 0; i < LETTERS.length; i++) {
  await pickTemplate('Ancien ' + LETTERS[i].word, idsLegacy[i]);
  const alone = await exportedPdf();
  aloneGaps.push(alone ? gapOf(alone, LETTERS[i].word) : null);
}
await page.click('#btn-mode-edit');
await sleep(500);
await checkReader('anciens modèles', 'Macro anciens courriers', idMacroLegacy);
await checkPdf('anciens modèles', false, aloneGaps);

// Le courrier lu seul, hors macro-modèle, garde l'image où elle est : la correction ne touche pas un modèle ordinaire.
check('modèle ordinaire : le courrier s\'ouvre', await pickTemplate('Courrier CHARLIE', idsGrid[2]));
await page.click('#btn-mode-read');
await page.waitForSelector('#reader-container .reader-content img.editor-image', { timeout: 15000 }).catch(() => {});
await sleep(600);
const alone = await page.evaluate(() => {
  const content = document.querySelector('#reader-container .reader-content');
  const zoom = content.getBoundingClientRect().width / content.offsetWidth || 1;
  const padTop = parseFloat(getComputedStyle(content).paddingTop) || 0;
  const img = content.querySelector('img.editor-image');
  const title = Array.from(content.querySelectorAll('p')).find(p => p.textContent.trim() === 'CHARLIE');
  return { distance: title ? +((img.getBoundingClientRect().top - title.getBoundingClientRect().top) / zoom).toFixed(1) : null, cssTop: parseFloat(img.style.top), padTop };
});
check('modèle ordinaire, Lecture : l\'image reste à son `top` d\'origine (aucun décalage de slot)', alone.distance != null && Math.abs(alone.distance - (alone.cssTop - alone.padTop)) < 2, alone);
await page.click('#btn-mode-edit');
await sleep(300);

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
