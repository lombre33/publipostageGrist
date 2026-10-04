#!/usr/bin/env node
// Un tableau copié dans Excel, Google Sheets ou LibreOffice Calc, collé dans un DOCUMENT (hors grille) : choix d'Antoine du 02/10 (« Coller aussi un tableau Excel en cases dans un document,
// hors grille ? » - « Oui, en cases » : un tableau du document, sans l'image). dev-tests/scenarios-grid-table.js (groupe « gridTable ») vérifie ce que le collage écrit, DANS la page, avec des
// évènements `paste` synthétiques ; ici le presse-papiers est le VRAI de Chromium (navigator.clipboard.write avec le HTML tel quel, le texte tabulé et l'image PNG de la plage, comme Excel les
// pose) et le collage est un VRAI Ctrl+V (Ctrl+Maj+V pour le texte seul, Ctrl+Z pour annuler), à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis sombre :
//   - le curseur posé à la vraie souris au bout d'une ligne de texte, Ctrl+V colle un TABLEAU du document - aucune image - entièrement visible dans le panneau, sans défilement
//     horizontal ; le titre fusionné sur trois colonnes garde son fond, son gras et son centrage, lisible sur son fond (WCAG, F5) ; ce n'est pas une grille (aucun bandeau A, B, C) ;
//   - Ctrl+Z défait le collage d'un coup, Ctrl+Maj+Z le rend ;
//   - Ctrl+Maj+V (coller sans mise en forme) colle le TEXTE de la plage, ni tableau ni image ;
//   - Google Sheets et LibreOffice Calc donnent eux aussi un tableau, sans image ;
//   - une image seule (aucun tableau dans le presse-papiers) se colle toujours comme image.
// Lancé par run-headless.mjs (groupe Node « docPasteMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-doc-paste-mouse.mjs
// DOC_PASTE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.DOC_PASTE_MOUSE_PORT || 8948);
const SHOTS = process.env.DOC_PASTE_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-grid-import-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
].filter(([, rel]) => rel !== 'umd/exceljs.min.js' || existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[verify-doc-paste-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { d.accept().catch(() => {}); });
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
  // Les presse-papiers de tableurs de dev-tests/scenarios-grid-table.js (le fichier se charge sans le lanceur : il ne fait que déclarer ses cas et ses presse-papiers).
  await page.addScriptTag({ url: `${BASE}/dev-tests/scenarios-grid-table.js` });
  await page.waitForFunction(() => !!window.GridTableFixtures, null, { timeout: 10000 });
  return { context, page };
}

// Contraste WCAG de deux couleurs CSS « rgb(...) ».
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

// Pose dans le VRAI presse-papiers de Chromium ce qu'une application y pose : le HTML tel quel (`unsanitized` : sans lui Chromium retirerait la feuille de style d'Excel), le texte et,
// pour Excel, l'image de la plage.
async function setClipboard(page, parts) {
  await page.evaluate(async (p) => {
    const fixtures = window.GridTableFixtures;
    const items = {};
    if (p.html) items['text/html'] = new Blob([fixtures[p.html]], { type: 'text/html' });
    if (p.text) items['text/plain'] = new Blob([fixtures[p.text] != null ? fixtures[p.text] : p.text], { type: 'text/plain' });
    if (p.png) items['image/png'] = new Blob([Uint8Array.from(atob(fixtures.PNG_BASE64), c => c.charCodeAt(0))], { type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem(items, { unsanitized: ['text/html'] })]);
  }, parts);
}

// Un document de départ (deux lignes de texte) et le curseur au bout de la première, posé à la vraie souris : le clic tombe à droite du texte de la ligne, jamais à un décalage fixe du haut.
async function startDocument(page) {
  await page.evaluate(() => { Editor.setHTML('<p>début</p><p>fin</p>'); });
  await page.waitForTimeout(250);
  const target = await page.evaluate(() => {
    const p = document.querySelector('.tiptap > p');
    const range = document.createRange();
    range.selectNodeContents(p);
    const rects = range.getClientRects();
    const last = rects[rects.length - 1];
    return { x: last.right + 12, y: last.top + last.height / 2 };
  });
  // La souris part du coin du panneau et arrive au texte sans croiser la barre du haut : sur son chemin, le menu au survol « Titre » s'ouvrirait et recouvrirait le texte.
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
  await page.waitForTimeout(150);
  await page.mouse.move(target.x - 6, target.y, { steps: 6 });
  await page.mouse.click(target.x, target.y);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10); // hors des menus au survol
  await page.waitForTimeout(150);
  return page.evaluate(() => { const sel = EditorCore.getEditor().state.selection; return { atEnd: sel.empty && sel.$from.parent.textContent === 'début' && sel.$from.parentOffset === 5, focused: document.activeElement && document.activeElement.closest('.tiptap') !== null }; });
}

async function settle(page) { await page.waitForTimeout(700); }

// Ce que la personne voit après le collage : images, tableaux, forme du tableau, place dans le panneau, titre (fond, gras, centrage, lisibilité).
const documentState = page => page.evaluate((contrastSrc) => {
  const contrast = eval(contrastSrc);
  const root = document.querySelector('.tiptap');
  const container = document.getElementById('editor-container');
  const table = root.querySelector('table');
  const cr = container.getBoundingClientRect();
  const out = {
    // `img.ProseMirror-separator` : l'image d'aide que ProseMirror pose après une image en fin de ligne, pas une image du document.
    images: root.querySelectorAll('img:not(.ProseMirror-separator)').length, tables: root.querySelectorAll('table').length,
    grid: GridEditor.isActive() || container.classList.contains('v2-grid-mode') || !!document.querySelector('.v2-grid-band'),
    blocks: Array.from(root.children).map(c => (c.classList.contains('tableWrapper') ? 'table' : c.tagName.toLowerCase())).join(','), text: root.textContent,
  };
  if (table) {
    const r = table.getBoundingClientRect();
    out.rows = table.rows.length;
    out.box = { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    out.visible = r.width > 0 && r.left >= cr.left && r.right <= cr.right && r.top >= cr.top && r.bottom <= cr.bottom;
    out.noHorizontalScroll = container.scrollWidth <= container.clientWidth + 1;
    const title = table.rows[0] && table.rows[0].cells[0];
    if (title) {
      const paragraph = title.querySelector('p');
      const style = getComputedStyle(title);
      out.title = {
        text: title.textContent, colSpan: title.colSpan, background: style.backgroundColor, bold: !!title.querySelector('strong, b'),
        centered: !!paragraph && getComputedStyle(paragraph).textAlign === 'center', contrast: Math.round(contrast(getComputedStyle(paragraph || title).color, style.backgroundColor) * 100) / 100,
      };
    }
  }
  return out;
}, CONTRAST_FN);

async function flow(colorScheme, label) {
  const { context, page } = await openWidget(colorScheme);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label}-${name}.png`) }); };

  // --- Excel : tableau HTML + texte tabulé + image de la plage ---
  const placed = await startDocument(page);
  check(`${label} - le curseur est au bout de la première ligne, posé à la vraie souris`, placed.atEnd && placed.focused, placed);
  const before = await page.evaluate(() => JSON.stringify(EditorCore.getEditor().state.doc.toJSON()));
  await setClipboard(page, { html: 'EXCEL_HTML', text: 'EXCEL_TEXT', png: true });
  await page.keyboard.press('Control+V');
  await settle(page);
  const excel = await documentState(page);
  await shot('excel');
  check(`${label} - Ctrl+V d'une plage d'Excel colle un tableau du document : cinq lignes, aucune image`, excel.tables === 1 && excel.rows === 5 && excel.images === 0, excel);
  check(`${label} - le tableau est posé après la première ligne, la seconde reste derrière`, /^p,table,p/.test(excel.blocks) && /^début/.test(excel.text) && /fin$/.test(excel.text), excel.blocks);
  check(`${label} - le tableau est entièrement dans le panneau, sans défilement horizontal`, excel.visible === true && excel.noHorizontalScroll === true, excel.box);
  check(`${label} - ce n'est pas une grille : aucun bandeau A, B, C`, excel.grid === false);
  check(`${label} - le titre est fusionné sur trois colonnes, en gras, centré, sur le fond orange d'Excel`, !!excel.title && excel.title.text === 'Facture Alpha' && excel.title.colSpan === 3 && excel.title.bold && excel.title.centered && excel.title.background === 'rgb(255, 192, 0)', excel.title);
  check(`${label} - le texte du titre se lit sur son fond (≥ 4,5:1)`, !!excel.title && excel.title.contrast >= 4.5, excel.title);

  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(300);
  const undone = await page.evaluate(() => JSON.stringify(EditorCore.getEditor().state.doc.toJSON()));
  const undoneState = await documentState(page);
  check(`${label} - un seul Ctrl+Z défait le collage : plus de tableau, le document d'avant`, undone === before && undoneState.tables === 0 && undoneState.images === 0, undoneState);
  await page.keyboard.press('Control+Shift+Z');
  await page.waitForTimeout(300);
  const redone = await documentState(page);
  check(`${label} - Ctrl+Maj+Z rend le tableau`, redone.tables === 1 && redone.rows === 5 && redone.images === 0, redone);

  // --- Ctrl+Maj+V : coller sans mise en forme = le texte de la plage, ni tableau ni image ---
  await startDocument(page);
  await setClipboard(page, { html: 'EXCEL_HTML', text: 'EXCEL_TEXT', png: true });
  await page.keyboard.press('Control+Shift+V');
  await settle(page);
  const plain = await documentState(page);
  check(`${label} - Ctrl+Maj+V colle le texte de la plage : ni tableau ni image`, plain.tables === 0 && plain.images === 0 && /Facture Alpha/.test(plain.text) && /A-1/.test(plain.text), plain);

  // --- Google Sheets, LibreOffice Calc ---
  await startDocument(page);
  await setClipboard(page, { html: 'SHEETS_HTML', text: 'Facture Beta\t\t\nB-1\tÉcrou M8\t3,20 €\n' });
  await page.keyboard.press('Control+V');
  await settle(page);
  const sheets = await documentState(page);
  check(`${label} - Google Sheets : un tableau de deux lignes, sans image, fond et fusion gardés`, sheets.tables === 1 && sheets.images === 0 && sheets.rows === 2 && !!sheets.title && sheets.title.colSpan === 3 && sheets.title.background === 'rgb(255, 217, 102)', sheets);
  await startDocument(page);
  await setClipboard(page, { html: 'LIBREOFFICE_HTML', text: 'Facture Gamma\t\t\nC-1\tRondelle\nplate\t1,75\nC-2\t\t0,25\n' });
  await page.keyboard.press('Control+V');
  await settle(page);
  const calc = await documentState(page);
  check(`${label} - LibreOffice Calc : un tableau de trois lignes, sans image, fond et fusion gardés`, calc.tables === 1 && calc.images === 0 && calc.rows === 3 && !!calc.title && calc.title.colSpan === 3 && calc.title.background === 'rgb(255, 255, 0)', calc);

  // --- Une image seule se colle toujours comme image ---
  await startDocument(page);
  await setClipboard(page, { png: true });
  await page.keyboard.press('Control+V');
  await page.waitForFunction(() => document.querySelectorAll('.tiptap img:not(.ProseMirror-separator)').length > 0, null, { timeout: 6000 }).catch(() => {});
  const image = await documentState(page);
  check(`${label} - une image seule (aucun tableau dans le presse-papiers) se colle toujours comme image`, image.images === 1 && image.tables === 0, image);
  await context.close();
}

await flow('light', 'clair');
await flow('dark', 'sombre');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors.slice(0, 3));
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
