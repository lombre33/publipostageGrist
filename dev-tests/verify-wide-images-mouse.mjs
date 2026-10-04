#!/usr/bin/env node
// Images trop larges dans le PDF et le Word, à la taille du panneau Grist d'Antoine (~700x400), avec la vraie souris pour tout geste (liste des modèles, bouton
// « Exporter en PDF », menu Exporter puis « Exporter en DOCX ») : le fichier que Chromium télécharge est relu (pdf.js pour le PDF, word/document.xml pour le Word), pas un
// objet intermédiaire. La référence est l'éditeur lui-même : la largeur de chaque image à l'écran, ramenée au zoom du panneau.
// Correction (01/10, carte « Ramener à la page les images trop larges dans le PDF et le Word ? » d'Antoine : « logique de WYSIWYG, si ça dépend en éditeur ça dépasse
// partout sinon nulle part ») : l'éditeur ramène une image à la largeur de ce qui la contient (`max-width: 100%`), le PDF et le Word gardaient la largeur réglée et
// l'image sortait de la page, de la case ou de la colonne (js/export-common.js:shownImageWidthPx).
// Lancé par run-headless.mjs (groupe Node "wideImagesMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-wide-images-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.WIDE_IMAGES_MOUSE_PORT || 8916);
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-wide-images-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
// Le geste d'une vraie souris : l'approche, puis le clic (ou le survol qui ouvre un menu).
async function realMove(sel) {
  const c = await center(sel);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  return c;
}

check('Aperçu A4 actif d\'office', await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview')));

// Une image 2:1 (si seule la largeur était ramenée, les proportions changeraient). Cinq images dans un seul document : dans le texte, dans une case de tableau (200 px de large),
// dans la colonne gauche d'une zone à deux colonnes, centrée, et une qui tient (300 px, témoin : rien n'est réduit en trop).
const PNG = await page.evaluate(() => {
  const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100;
  const g = canvas.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 200, 100); g.fillStyle = '#fff'; g.fillRect(10, 10, 80, 80);
  return canvas.toDataURL('image/png');
});
const img = (widthPx, extra) => '<img class="editor-image" src="' + PNG + '" alt="Image"' + (extra || '') + ' style="width: ' + widthPx + 'px">';
const KINDS = ['dans le texte (900 px)', 'dans une case de 200 px (700 px)', 'dans une colonne (700 px)', 'centrée (900 px)', 'qui tient (300 px)'];
const DOCUMENT_HTML = '<p>Texte</p><p>' + img(900) + '</p>'
  + '<table><tbody><tr><td colwidth="200"><p>' + img(700) + '</p></td><td colwidth="200"><p>b</p></td><td colwidth="200"><p>c</p></td></tr></tbody></table>'
  + '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column"><p>' + img(700) + '</p></div><div class="two-columns-column"><p>droite</p></div></div>'
  + '<p style="text-align: center">' + img(900, ' data-align="center"') + '</p><p>' + img(300) + '</p>';

// Un modèle de plus : ligne enregistrée dans le faux Grist + option du vrai <select> (l'arbre des modèles se construit d'après les deux).
async function makeTemplate(name, html) {
  return page.evaluate(async ({ name, html }) => {
    const r = await Templates.save(null, name, html, '', null, null, 'document', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    const option = document.createElement('option'); option.value = String(r.id); option.textContent = name; select.appendChild(option);
    return r.id;
  }, { name, html });
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

// La ligne courante : une table et une ligne quelconques.
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('Clients', { Nom: 'Text' });
  stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients');
});

const fmt = n => (typeof n === 'number' ? +n.toFixed(1) : n);
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

const id = await makeTemplate('Images larges', DOCUMENT_HTML);
check('le modèle aux cinq images s\'ouvre (liste des modèles, vrai clic)', await pickTemplate('Images larges', id));

// La référence : la largeur de chaque image dans l'éditeur, en px de mise en page (le panneau de 700 px zoome la feuille : on divise par le zoom).
const editor = await page.evaluate(() => {
  const pm = document.querySelector('#editor-container .ProseMirror');
  const zoom = pm.getBoundingClientRect().width / pm.offsetWidth || 1;
  const images = Array.from(pm.querySelectorAll('img.editor-image'));
  return { zoom: +zoom.toFixed(3), count: images.length, widths: images.map(i => i.getBoundingClientRect().width / zoom), styleWidths: images.map(i => parseFloat(i.style.width)), pmWidth: pm.offsetWidth };
});
check('l\'éditeur montre les cinq images', editor.count === 5, editor);
check('l\'éditeur ramène les quatre images trop larges à leur place et laisse la dernière telle quelle',
  editor.count === 5 && editor.widths.slice(0, 4).every((w, i) => w < editor.styleWidths[i] - 1) && near(editor.widths[4], 300, 1), { widths: editor.widths.map(fmt), styleWidths: editor.styleWidths });
const expectedPt = editor.widths.map(w => w * 0.75);

const PDF_MARGIN_LEFT_PT = 28; const PDF_MARGIN_RIGHT_PT = 28;

// PDF : le vrai bouton « Exporter en PDF », le fichier téléchargé relu par pdf.js.
const [pdfDownload] = await Promise.all([
  page.waitForEvent('download', { timeout: 90000 }).catch(() => null),
  (async () => { const c = await realMove('#btn-export-pdf'); await page.mouse.click(c.x, c.y); })(),
]);
check('le bouton « Exporter en PDF » télécharge un fichier', !!pdfDownload);
if (pdfDownload) {
  const truth = await page.evaluate(b64 => TestHelpers.extractPdfGroundTruth(b64), readFileSync(await pdfDownload.path()).toString('base64'));
  const pdfImages = truth.pages.flatMap((p, i) => p.images.map(im => ({ page: i + 1, x: im.x, y: im.y, width: im.width, height: im.height, pageWidth: p.width })))
    .sort((a, b) => a.page - b.page || a.y - b.y);
  check('PDF : cinq images peintes', pdfImages.length === 5, pdfImages.map(i => ({ page: i.page, w: fmt(i.width) })));
  if (pdfImages.length === 5) {
    pdfImages.forEach((im, i) => {
      check(`PDF, image ${KINDS[i]} : peinte à la largeur de l'éditeur (${fmt(expectedPt[i])} pt), proportions gardées`,
        near(im.width, expectedPt[i], 1) && near(im.height, im.width / 2, 1), { width: fmt(im.width), height: fmt(im.height), editorPt: fmt(expectedPt[i]) });
      check(`PDF, image ${KINDS[i]} : dans les marges de la feuille`,
        im.x >= PDF_MARGIN_LEFT_PT - 0.5 && im.x + im.width <= im.pageWidth - PDF_MARGIN_RIGHT_PT + 0.5, { x: fmt(im.x), right: fmt(im.x + im.width), pageWidth: fmt(im.pageWidth) });
    });
    const centered = pdfImages[3];
    check('PDF, image centrée : au milieu de la zone de texte', near(centered.x + centered.width / 2, centered.pageWidth / 2, 1), { middle: fmt(centered.x + centered.width / 2), pageMiddle: fmt(centered.pageWidth / 2) });
  }
}

// Word : le menu Exporter s'ouvre au survol de son bouton, puis la ligne « Exporter en DOCX » au vrai clic.
await realMove('#v2-btn-quality');
await sleep(500);
const docxRow = await center('#v2-btn-export-docx');
await page.mouse.move(docxRow.x, docxRow.y, { steps: 8 });
await sleep(120);
const [docxDownload] = await Promise.all([
  page.waitForEvent('download', { timeout: 90000 }).catch(() => null),
  page.mouse.click(docxRow.x, docxRow.y),
]);
check('la ligne « Exporter en DOCX » télécharge un fichier', !!docxDownload && /\.docx$/i.test(docxDownload.suggestedFilename()), docxDownload && docxDownload.suggestedFilename());
if (docxDownload) {
  const word = await page.evaluate(async b64 => {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    const doc = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    const section = TestHelpers.docxSectionProps(doc);
    return { drawings: TestHelpers.docxDrawings(doc), contentWidthPt: (section.widthTwip - section.margins.left - section.margins.right) / 20 };
  }, readFileSync(await docxDownload.path()).toString('base64'));
  check('Word : cinq images', word.drawings.length === 5, word.drawings.map(d => fmt(d.widthPt)));
  if (word.drawings.length === 5) {
    word.drawings.forEach((d, i) => {
      check(`Word, image ${KINDS[i]} : dessinée à la largeur de l'éditeur (${fmt(expectedPt[i])} pt), proportions gardées, dans la zone de texte`,
        near(d.widthPt, expectedPt[i], 1.5) && near(d.heightPt, d.widthPt / 2, 1.5) && d.widthPt <= word.contentWidthPt + 1, { width: fmt(d.widthPt), height: fmt(d.heightPt), editorPt: fmt(expectedPt[i]), contentWidthPt: fmt(word.contentWidthPt) });
    });
  }
}

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
