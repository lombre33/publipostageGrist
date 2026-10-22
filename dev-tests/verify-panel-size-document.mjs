#!/usr/bin/env node
// La taille du panneau Grist (l'iframe où tourne le widget) ne change JAMAIS le contenu d'un modèle : seulement l'affichage (le zoom de la feuille). Règle d'Antoine
// (22/10) après avoir vu un tableau déborder de la page quand il redimensionnait le panneau.
// Le widget tourne ici dans une iframe d'une page parente, redimensionnée comme le fait Grist. Le même document est chargé à plusieurs tailles de panneau, et le HTML qu'il
// enregistre doit être le même, octet pour octet :
//  - en Aperçu A4 (tableaux de largeurs fixes, mixtes et trop larges, un tableau dans une colonne de zone à deux colonnes, images en calque à poser sur la grille de page,
//    pages tournées) ;
//  - sans Aperçu A4 (e-mail, case décochée) : les colonnes « automatiques » d'un tableau mixte se figeaient à la largeur du panneau (236 px dans 700 px, 586 px dans 1400 px) ;
//  - un glissé continu du panneau n'écrit rien (aucune transaction) ;
//  - un tableau ramené dans la page n'en sort pas (A4 et A5) : arrondies au plus près, ses colonnes la dépassaient d'un demi-pixel chacune ;
//  - avec un moteur qui dessine le contenu au carré du zoom de la feuille (Firefox chez Antoine, capture du 21/10 ; émulé par une règle de style) ou qui combine le zoom autrement :
//    le contenu retrouve le zoom de la feuille, les tableaux restent dans la page et ce qui s'enregistre ne change pas.
// Avant le correctif (js/editor-core.js:pageScale, js/editor.js, js/header-footer-preview.js), tout ce que le DOM mesurait pour l'écrire dans le document (colonnes figées,
// largeur d'une colonne de zone, position des images en calque) se lisait à l'échelle que le panneau donnait à la feuille, arrondie à la façon du moteur : le même modèle
// s'enregistrait à 1 ou 2 px près selon le panneau, et sans Aperçu A4 sur la largeur du panneau.
// Lancé par run-headless.mjs (groupe Node "panelSizeDocument", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-panel-size-document.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PANEL_SIZE_PORT || 9151);

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-table-widths-mouse.mjs.
async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const stubbed = html.replace(
    '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>',
    '<script src="dev-tests/grist-stub.js"></script>'
  );
  await writeFile(join(ROOT, '_test-harness.html'), stubbed);
}
await regenerateHarness();

// La page parente : une iframe sur le harnais, que le test redimensionne comme Grist redimensionne le panneau d'un widget.
const PARENT = '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#888"><iframe id="app" src="/_test-harness.html" style="display:block;width:700px;height:400px;border:0;background:#fff"></iframe>';
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
    if (urlPath === '/__panel-parent.html') { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); res.end(PARENT); return; }
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
if (!OFFLINE) console.log('[verify-panel-size-document] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Barres de défilement classiques (Windows, Firefox d'Antoine) : elles retranchent leur largeur à celle que le panneau offre à la feuille.
const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'], ignoreDefaultArgs: ['--hide-scrollbars'] });
const context = await browser.newContext({ bypassCSP: true, viewport: { width: 2400, height: 1100 } });
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
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
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

await page.goto(`${BASE}/__panel-parent.html`, { waitUntil: 'load' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let frame = null;
for (let i = 0; i < 300 && !frame; i++) { frame = page.frames().find(f => f !== page.mainFrame() && /_test-harness/.test(f.url())); if (!frame) await sleep(100); }
await frame.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await frame.waitForFunction(() => {
  const el = document.getElementById('status-msg');
  return !!el && /prêt|ready/i.test(el.textContent || '');
}, null, { timeout: 90000 });

// Le panneau d'un coup, puis le temps que le zoom d'ajustement, la pagination et les corrections de largeurs se posent.
const setSize = async (w, h) => { await page.evaluate(({ w, h }) => { const f = document.getElementById('app'); f.style.width = w + 'px'; f.style.height = h + 'px'; }, { w, h }); await sleep(450); };
// Glissé continu, comme une poignée de séparation tirée à la main : une largeur toutes les 16 ms.
const dragSize = (fromW, toW, h, steps) => page.evaluate(async ({ fromW, toW, h, steps }) => {
  const f = document.getElementById('app');
  f.style.height = h + 'px';
  for (let i = 1; i <= steps; i++) {
    f.style.width = Math.round(fromW + (toW - fromW) * i / steps) + 'px';
    await new Promise(r => setTimeout(r, 16));
  }
}, { fromW, toW, h, steps });
const loadDoc = async html => { await frame.evaluate(x => Editor.setHTML(x), html); await sleep(900); };
const savedHtml = () => frame.evaluate(() => Editor.getHTML());
const isA4 = () => frame.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview'));
const setA4 = async on => {
  if ((await isA4()) !== on) await frame.evaluate(() => document.getElementById('v2-toggle-a4-preview').click());
  await sleep(500);
};

// Des tailles de panneau d'un bout à l'autre : le plus étroit où la feuille se réduit (échelle 0,5), les échelles intermédiaires où le moteur arrondit autrement, l'échelle 1.
const SIZES = [[700, 400], [420, 400], [560, 400], [640, 400], [780, 400], [820, 500], [1000, 600], [1400, 900], [2200, 1000]];

const cell = (w, text = 'x') => `<td${w ? ` colwidth="${w}"` : ''}><p>${text}</p></td>`;
const table = (widths, rows = 3) => '<table><tbody>' + Array.from({ length: rows }, (_, r) => '<tr>' + widths.map((w, c) => cell(w, `L${r + 1}C${c + 1}`)).join('') + '</tr>').join('') + '</tbody></table>';
const zone = (left, right) => `<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">${left}</div><div class="two-columns-column">${right}</div></div>`;
const breakTo = sense => `<div class="page-break-marker" contenteditable="false"${sense ? ` data-page-orientation="${sense}"` : ''}>Saut de page</div>`;
const lorem = '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>';
// Une image en calque sans grille de page (modèle d'avant la grille : left / top seuls), et une autre sur la page 2 dont le `top` enregistré n'est plus celui de sa grille.
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const layered = (attrs, style) => `<img class="editor-image" src="${GIF}" alt="x" style="width: 120px; position: absolute; ${style}" data-layer="${attrs.layer}" data-wrap="inline"${attrs.grid || ''}>`;

const DOCS = {
  tableaux: lorem + table([150, 150, 150]) + '<p>Entre</p>' + table([200, 0, 0]) + '<p>Entre</p>' + table([0, 150, 0, 0]) + '<p>Entre</p>' + table([350, 380]) + '<p>Fin</p>',
  zone: '<p>Avant</p>' + zone(table([400, 400]) + '<p>gauche</p>', '<p>droite</p>' + table([0, 120, 0])) + '<p>Après</p>',
  images: '<p>Début ' + layered({ layer: 'front' }, 'left: 133px; top: 77px; z-index: 5') + '</p>' + lorem + lorem + '<p>Milieu ' + layered({ layer: 'behind' }, 'left: 311px; top: 190px; z-index: -1') + '</p>'
    + Array.from({ length: 28 }, () => lorem).join('') + '<p>Page 2 ' + layered({ layer: 'front', grid: ' data-page-index="1" data-page-left-pt="60.5" data-page-top-pt="40.25"' }, 'left: 81px; top: 20px; z-index: 5') + '</p>' + lorem,
  pagesTournees: '<h1>Page 1 portrait</h1>' + lorem + table([150, 150, 150]) + table([0, 0, 0]) + breakTo('landscape') + '<h1>Page 2 paysage</h1>' + table([300, 300, 300]) + table([200, 0, 0]) + lorem
    + breakTo('portrait') + '<h1>Page 3 portrait</h1>' + table([0, 0, 0]) + table([500, 400]) + lorem,
};

// 1) Aperçu A4 : le même document, tous les panneaux, le même HTML enregistré.
check('Aperçu A4 actif d\'office', await isA4());
const sameEverywhere = async (name, html) => {
  const seen = [];
  for (const [w, h] of SIZES) { await setSize(w, h); await loadDoc(html); seen.push({ size: w + 'x' + h, html: await savedHtml() }); }
  const reference = seen[0].html;
  const different = seen.filter(s => s.html !== reference).map(s => s.size);
  check(name, different.length === 0 && reference.length > 100, { differentDe700x400: different });
  return seen;
};
const tableaux = await sameEverywhere('Aperçu A4 : tableaux fixes, mixtes et trop large - le même HTML enregistré à neuf tailles de panneau', DOCS.tableaux);
const widthsOf = html => [...html.matchAll(/<table[^>]*>.*?<\/table>/gs)].map(m => [...m[0].match(/<tr[^>]*>(.*?)<\/tr>/s)[1].matchAll(/colwidth="([^"]*)"/g)].map(x => x[1]).join(','));
const pageWidth = await frame.evaluate(() => EditorCore.editorContentWidthPx(EditorCore.getEditor()));
const clamped = widthsOf(tableaux[0].html);
check('Aperçu A4 : le tableau trop large est ramené dans la page, les colonnes mixtes sont figées', clamped[0] === '150,150,150' && /^200,\d+,\d+$/.test(clamped[1]) && clamped[3].split(',').reduce((s, w) => s + Number(w), 0) <= pageWidth + 1
  && clamped[2].split(',').length === 4 && clamped[2].split(',').every(w => Number(w) > 25), { clamped, pageWidth });
// Un tableau ramené dans la page n'en sort pas : la somme de ses colonnes tient dans la largeur utile. Arrondies au plus près, deux colonnes de 365 donnaient 360 + 360 pour
// une page de 719,04 px, et trois de 400 donnaient 3 x 162 dans une page A5 de 484,7 px (le tableau dépassait ou non selon la décimale que la mesure du panneau laissait à la page).
await setSize(700, 400);
const fitsPage = async (name, html) => {
  await loadDoc(html);
  const content = await frame.evaluate(() => EditorCore.editorContentWidthPx(EditorCore.getEditor()));
  const sums = widthsOf(await savedHtml()).map(w => w.split(',').reduce((s, x) => s + Number(x), 0));
  check(name, sums.length > 0 && sums.every(x => x <= content), { sums, content });
};
await fitsPage('Aperçu A4 : deux colonnes de 365 ou trois de 400 sont ramenées dans la page, la somme de leurs colonnes ne la dépasse pas', table([365, 365]) + table([400, 400, 400]) + table([300, 300, 300, 300]));
await frame.evaluate(() => PageLayout.setFormat('A5'));
await sleep(500);
await fitsPage('page A5 : trois colonnes de 400 sont ramenées dans la page, la somme de leurs colonnes ne la dépasse pas', table([400, 400, 400]) + table([365, 365]));
await frame.evaluate(() => PageLayout.setFormat('A4'));
await sleep(500);
await sameEverywhere('Aperçu A4 : un tableau dans une colonne de zone - le même HTML à neuf tailles de panneau', DOCS.zone);
await sameEverywhere('Aperçu A4 : images en calque (grille de page à poser, `top` à relire) - le même HTML à neuf tailles de panneau', DOCS.images);
await sameEverywhere('Aperçu A4 : pages portrait et paysage mêlées - le même HTML à neuf tailles de panneau', DOCS.pagesTournees);

// La largeur utile de la page, d'où se calcule le recadrage d'un tableau, ne dépend pas du panneau.
const widths = [];
for (const [w, h] of SIZES) { await setSize(w, h); widths.push(await frame.evaluate(() => EditorCore.editorContentWidthPx(EditorCore.getEditor()))); }
check('Aperçu A4 : la largeur utile de la page est la même à neuf tailles de panneau', widths.every(x => x === widths[0]) && widths[0] > 700, widths);

// 2) Le glissé continu du panneau n'écrit rien dans le document.
await setSize(700, 400);
await loadDoc(DOCS.tableaux + DOCS.zone);
const beforeDrag = await savedHtml();
await frame.evaluate(() => { window.__panelTx = 0; EditorCore.getEditor().on('transaction', ({ transaction }) => { if (transaction.docChanged) window.__panelTx++; }); });
for (const [a, b, h] of [[700, 420, 400], [420, 1100, 600], [1100, 700, 400], [700, 560, 400], [560, 900, 500]]) { await dragSize(a, b, h, 24); await sleep(700); }
check('glisser le panneau d\'un bout à l\'autre n\'écrit rien : aucune transaction qui change le document', (await frame.evaluate(() => window.__panelTx)) === 0, await frame.evaluate(() => window.__panelTx));
check('glisser le panneau d\'un bout à l\'autre : le HTML enregistré est celui d\'avant', (await savedHtml()) === beforeDrag);

// 3) Sans Aperçu A4 (e-mail, grille, case décochée) : les colonnes automatiques d'un tableau mixte ne se figent plus sur la largeur du panneau.
await setA4(false);
check('Aperçu A4 décoché', !(await isA4()));
const fluid = await sameEverywhere('sans Aperçu A4 : tableaux mixtes - le même HTML enregistré à neuf tailles de panneau', DOCS.tableaux);
const fluidWidths = widthsOf(fluid[0].html);
check('sans Aperçu A4 : les colonnes automatiques sont figées à la largeur d\'une page, pas du panneau', /^200,\d+,\d+$/.test(fluidWidths[1]) && fluidWidths[1].split(',').reduce((s, w) => s + Number(w), 0) <= pageWidth + 0.5
  && fluidWidths[1].split(',').reduce((s, w) => s + Number(w), 0) > pageWidth - 10, { fluidWidths, pageWidth });
check('sans Aperçu A4 : le panneau retrouve sa classe et son zoom d\'avant la mesure (rien ne reste posé)', await frame.evaluate(() => {
  const c = document.getElementById('editor-container');
  return !c.classList.contains('a4-preview') && !c.style.getPropertyValue('--pp-fit-zoom') && !c.style.getPropertyValue('--pp-content-fix');
}));
await setA4(true);

// 4) Un moteur qui dessine le contenu au carré du zoom de la feuille (émulé) : le contenu retrouve le zoom de la feuille, les tableaux restent dans la page, rien ne change à l'enregistrement.
const geometry = () => frame.evaluate(() => {
  const tip = EditorCore.getEditor().view.dom;
  const sheet = tip.parentElement;
  const sr = sheet.getBoundingClientRect();
  const z = EditorCore.layoutZoom(tip);
  const rightEdge = sr.width / z - parseFloat(getComputedStyle(tip).paddingRight);
  return {
    zoom: z,
    ratio: (tip.getBoundingClientRect().width / tip.offsetWidth) / z,
    rightEdge,
    tables: Array.from(tip.querySelectorAll('table')).map(t => (t.getBoundingClientRect().right - sr.left) / z),
  };
});
const emulate = css => frame.evaluate(rule => {
  let style = document.getElementById('pp-test-engine-zoom');
  if (!style) { style = document.createElement('style'); style.id = 'pp-test-engine-zoom'; document.head.appendChild(style); }
  style.textContent = rule;
}, css);
const SQUARED = '#editor-container.a4-preview .v2-page-sheet > .tiptap { zoom: calc(var(--pp-fit-zoom, 1) * var(--pp-content-fix, 1)); }';
// Un moteur qui combine la correction autrement : le zoom dessiné suit `--pp-content-fix` au carré.
const SQUARED_FIX = '#editor-container.a4-preview .v2-page-sheet > .tiptap { zoom: calc(var(--pp-fit-zoom, 1) * var(--pp-content-fix, 1) * var(--pp-content-fix, 1)); }';
const ENGINE_DOC = DOCS.tableaux + DOCS.zone;
const ENGINE_SIZES = [[700, 400], [520, 400], [1000, 600], [640, 400], [1400, 900], [700, 400]];
await emulate('');
await setSize(700, 400);
await loadDoc(ENGINE_DOC);
const saneHtml = await savedHtml();
for (const [label, css] of [['le contenu au carré du zoom de la feuille', SQUARED], ['la correction du zoom combinée au carré', SQUARED_FIX]]) {
  await emulate('');
  await setSize(1000, 600);
  await frame.evaluate(() => { const c = document.getElementById('editor-container'); c.style.removeProperty('--pp-content-fix'); });
  await emulate(css);
  const different = [];
  const problems = [];
  for (const [w, h] of ENGINE_SIZES) {
    await setSize(w, h);
    await loadDoc(ENGINE_DOC);
    const g = await geometry();
    if ((await savedHtml()) !== saneHtml) different.push(w + 'x' + h);
    if (Math.abs(g.ratio - 1) > 0.015) problems.push({ taille: w + 'x' + h, contenuSurFeuille: +g.ratio.toFixed(3) });
    if (g.tables.some(right => right > g.rightEdge + 2)) problems.push({ taille: w + 'x' + h, tableauHorsPage: g.tables.map(Math.round), bordDroit: Math.round(g.rightEdge) });
  }
  check(`moteur qui dessine ${label} : à chaque taille le contenu est au zoom de la feuille et les tableaux restent dans la page`, problems.length === 0, problems);
  check(`moteur qui dessine ${label} : à chaque taille, le HTML enregistré est celui d'un moteur sans écart`, different.length === 0, different);
}
await emulate('');
await frame.evaluate(() => { const c = document.getElementById('editor-container'); c.style.removeProperty('--pp-content-fix'); });

check('aucune erreur JavaScript', pageErrors.length === 0, pageErrors.slice(0, 3));
console.log(`\n${total - failures}/${total} passés`);
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
