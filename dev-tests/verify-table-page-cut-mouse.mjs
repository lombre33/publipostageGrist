#!/usr/bin/env node
// Un tableau qui chevauche le saut de page se coupe ENTRE deux lignes (js/table-page-cut.js), à la VRAIE souris (page.mouse) et au VRAI clavier, à la taille du panneau Grist
// d'Antoine (~700x400), en thème clair puis sombre. Ce que scenarios-table-page-cut.js ne peut pas voir depuis la page :
//  - la feuille réduite par le facteur d'ajustement du panneau : chaque page est une feuille entière, la ligne qui ouvre la page commence juste sous la bande de saut de page
//    (après la réserve de la page qui finit), aucun texte de ligne dessous, le liseré de la bande a la largeur du tableau ;
//  - les PIXELS peints dans la réserve et les marges de la couture, transparentes : ni les traits verticaux des cases ni un trait horizontal du tableau (le tableau est rogné
//    à cet endroit), et le trait du haut de la ligne redessiné au bord bas de la bande ;
//  - un vrai clic dans la ligne qui ouvre la page (sous la bande) ou dans la dernière ligne de la page d'avant met le curseur dans CETTE ligne ; la frappe y écrit ; la bande reste
//    à sa place (même rang de ligne) et le modèle enregistré ne contient aucun rembourrage de coupure ;
//  - Flèche bas / Flèche haut et Tab / Maj+Tab traversent la bande d'une ligne à l'autre, dans les deux sens, sans sauter ni bloquer ;
//  - la Lecture (vrai clic sur « Mode lecture ») coupe au même rang que l'éditeur ;
//  - le PDF (vrai clic sur « Exporter en PDF », fichier relu par pdf.js) ne coupe aucune ligne en deux et ne perd aucun texte.
// Lancé par run-headless.mjs (groupe Node "tablePageCutMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-table-page-cut-mouse.mjs
// TABLE_CUT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { inflateSync } from 'node:zlib';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TABLE_CUT_MOUSE_PORT || 8915);
const SHOTS = process.env.TABLE_CUT_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-orientation-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-table-page-cut-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Un tableau de 40 lignes, deux paragraphes dans la première case (« R07L0 », « R07L1 ») : une ligne coupée en deux aurait ses deux jetons sur deux pages.
const ROW_COUNT = 40;
const pad2 = n => String(n).padStart(2, '0');
const DOC_HTML = '<h1>Fiche de suivi</h1><p>Introduction du document.</p><table><tbody>'
  + Array.from({ length: ROW_COUNT }, (_, i) => `<tr><td><p>R${pad2(i)}L0</p><p>R${pad2(i)}L1</p></td><td><p>Valeur ${i}</p></td></tr>`).join('')
  + '</tbody></table><p>Fin du document.</p>';

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept().catch(() => {}); });
  const downloads = [];
  page.on('download', d => downloads.push(d));
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
  // Semé avant le démarrage : un modèle classique « Fiche » enregistré et ouvert par défaut, une ligne de données ; AUCUN réglage de droits, donc tous les droits.
  await page.addInitScript((html) => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Fiche'); m.Contenu.push(html);
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  }, DOC_HTML);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page, dialogs, downloads };
}

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

// Les bandes de saut de page et les lignes du tableau, telles que la personne les voit (rectangles à l'écran, facteur d'ajustement compris). Chaque page est une feuille entière :
// la page qui finit garde une réserve sous sa dernière ligne, puis vient la bande, puis la ligne qui ouvre la page. `aligned[i]` : rang de la première ligne dont le texte est sous la
// bande i (-1 : aucune) ; `overlaps` : nombre de lignes dont le texte passe sous une bande ; `reserve[i]` : place libre entre la dernière ligne de la page qui finit et la bande ;
// `caps` : pour chaque bande, ses liserés de tableau (nombre, et s'ils ont la largeur du tableau).
const seamState = (page, scope) => page.evaluate((scope) => {
  const container = document.getElementById(scope === 'reader' ? 'reader-container' : 'editor-container');
  const rowEls = Array.from(container.querySelectorAll(scope === 'reader' ? '.reader-content > table > tbody > tr' : '.tiptap > .tableWrapper > table > tbody > tr'));
  const table = rowEls[0] && rowEls[0].closest('table');
  const tableRect = table && table.getBoundingClientRect();
  const bandEls = Array.from(container.querySelectorAll('.v2-page-band'));
  const bands = bandEls.map(b => b.getBoundingClientRect());
  const rows = rowEls.map(row => {
    const paras = Array.from(row.querySelectorAll('p'));
    return { top: row.getBoundingClientRect().top, textTop: paras[0].getBoundingClientRect().top, textBottom: paras[paras.length - 1].getBoundingClientRect().bottom, label: paras[0].textContent };
  });
  const aligned = bands.map(r => rows.findIndex(row => row.textTop >= r.bottom - 1));
  const overlaps = bands.reduce((n, r) => n + rows.filter(row => row.textTop < r.bottom - 0.5 && row.textBottom > r.top + 0.5).length, 0);
  const reserve = bands.map((r, i) => aligned[i] > 0 ? Math.round((r.top - rows[aligned[i] - 1].textBottom) * 10) / 10 : null);
  const caps = bandEls.map(b => {
    const list = Array.from(b.querySelectorAll('.v2-page-seam-cap')).map(c => c.getBoundingClientRect());
    return { n: list.length, fullWidth: list.length > 0 && list.every(c => Math.abs(c.left - tableRect.left) <= 2 && Math.abs(c.width - tableRect.width) <= 2) };
  });
  const sheet = scope === 'reader' ? container.querySelector('.reader-content') : container.querySelector('.v2-page-sheet');
  return { bands: bands.length, aligned, overlaps, reserve, caps, rows: rows.length, zoom: parseFloat(getComputedStyle(sheet).zoom) || 1, firstOfPage2: aligned.length && aligned[0] >= 0 ? rows[aligned[0]].label : null };
}, scope);

// Les pixels réellement peints sur une ligne de `width` px (une capture de 1 px de haut, relue sans bibliothèque : une seule ligne de pixels, un filtre PNG à défaire au plus).
async function rowPixels(page, x, y, width) {
  const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width, height: 1 } });
  const bpp = png[25] === 6 ? 4 : 3;
  const idat = [];
  for (let off = 8; off < png.length;) {
    const len = png.readUInt32BE(off);
    if (png.toString('ascii', off + 4, off + 8) === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const out = [];
  for (let i = 0; i < width * bpp; i++) {
    const left = i >= bpp ? out[i - bpp] : 0;
    out.push((raw[1 + i] + (raw[0] === 1 || raw[0] === 4 ? left : raw[0] === 3 ? left >> 1 : 0)) & 255);
  }
  return Array.from({ length: width }, (_, p) => [out[p * bpp], out[p * bpp + 1], out[p * bpp + 2]]);
}
const isWhite = px => px.every(v => v >= 245);

// Ce que peint le tableau entre la dernière ligne de la page qui finit et le bas de la première bande : la réserve, le bas de page, le haut de la page suivante (la gouttière,
// grise, est mise de côté). Doit rester blanc (la feuille) : les traits verticaux des cases de la ligne descendue ne passent pas là. Au bord bas de la bande, le liseré redessine
// le trait du haut de la ligne. Appelée une fois la bande dans le panneau.
async function seamPaint(page, scope) {
  const g = await page.evaluate((scope) => {
    const container = document.getElementById(scope === 'reader' ? 'reader-container' : 'editor-container');
    const rowEls = Array.from(container.querySelectorAll(scope === 'reader' ? '.reader-content > table > tbody > tr' : '.tiptap > .tableWrapper > table > tbody > tr'));
    const band = container.querySelector('.v2-page-band').getBoundingClientRect();
    const k = rowEls.findIndex(row => row.querySelector('p').getBoundingClientRect().top >= band.bottom - 1);
    const divider = container.querySelector('.v2-page-band .v2-page-seam-divider').getBoundingClientRect();
    const table = rowEls[0].closest('table').getBoundingClientRect();
    const cells = Array.from(rowEls[0].children).map(td => td.getBoundingClientRect());
    const c = container.getBoundingClientRect();
    return { prevBottom: rowEls[k - 1].getBoundingClientRect().bottom, bandBottom: band.bottom, dividerTop: divider.top, dividerBottom: divider.bottom, table: { left: table.left, right: table.right },
      xs: cells.map(r => r.left).concat([cells[cells.length - 1].right]), visibleTop: c.top, visibleBottom: c.bottom };
  }, scope);
  const ys = [];
  for (let y = g.prevBottom + 4; y < g.bandBottom - 3; y += 6) if (y < g.dividerTop - 1 || y > g.dividerBottom + 1) ys.push(y);
  const visible = g.prevBottom - 2 >= g.visibleTop && g.bandBottom + 2 <= g.visibleBottom;
  const ink = [];
  for (const x of g.xs.concat([g.table.left + 40])) {
    for (const y of ys) {
      const px = await rowPixels(page, x - 1, y, 3);
      if (!px.every(isWhite)) ink.push({ x: Math.round(x), y: Math.round(y), px: px.map(p => p.join(',')) });
    }
  }
  const cap = (await rowPixels(page, (g.table.left + g.table.right) / 2, g.bandBottom - 0.5, 1))[0];
  return { visible, samples: ys.length * (g.xs.length + 1), ink: ink.slice(0, 4), inkCount: ink.length, cap, capDrawn: !isWhite(cap) };
}

// Fait défiler le conteneur pour que le haut de la bande `index` soit au tiers de la zone visible.
const scrollBandIntoView = (page, scope, index) => page.evaluate(({ scope, index }) => {
  const container = document.getElementById(scope === 'reader' ? 'reader-container' : 'editor-container');
  const band = container.querySelectorAll('.v2-page-band')[index];
  const c = container.getBoundingClientRect();
  container.scrollTop += band.getBoundingClientRect().top - (c.top + c.height / 3);
}, { scope, index });

// Où cliquer pour atteindre le paragraphe `p` de la ligne `row` (centre de son texte) : le point, et si c'est bien la case de cette ligne qui reçoit le clic (rien dessus).
const pointInRow = (page, row, cell, para) => page.evaluate(({ row, cell, para }) => {
  const tr = document.querySelectorAll('#editor-container .tiptap > .tableWrapper > table > tbody > tr')[row];
  const p = tr.children[cell].querySelectorAll('p')[para];
  const r = p.getBoundingClientRect();
  const x = r.left + Math.min(r.width / 2, 24), y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  const c = document.getElementById('editor-container').getBoundingClientRect();
  return { x, y, hitRow: hit && hit.closest('tr') === tr, visible: y > c.top + 2 && y < c.bottom - 2, text: p.textContent };
}, { row, cell, para });

// La ligne du tableau où est le curseur (rang), et son texte.
const caretRow = page => page.evaluate(() => {
  const sel = window.getSelection();
  const node = sel && sel.anchorNode;
  const el = node && (node.nodeType === 3 ? node.parentElement : node);
  const tr = el && el.closest && el.closest('.tiptap tr');
  const rows = Array.from(document.querySelectorAll('#editor-container .tiptap > .tableWrapper > table > tbody > tr'));
  return tr ? { row: rows.indexOf(tr), cell: Array.from(tr.children).indexOf(el.closest('td, th')), focusInEditor: !!document.activeElement.closest('.tiptap') } : { row: -1, cell: -1, focusInEditor: false };
});

// La souris au bas de la zone de texte avant de viser une ligne : de la barre d'outils au texte, elle passerait sur un bouton à menu au survol (titres, qualité PDF), et le menu
// ouvert recouvrirait la ligne visée - le clic irait dans le menu.
async function parkMouse(page) {
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(350);
}

async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// pdf.js dans la page : le texte de chaque page d'un PDF (octets en base64), avec le numéro de page de chaque jeton « R07L1 ».
async function pdfTokens(page, base64) {
  if (!(await page.evaluate(() => !!window.pdfjsLib))) {
    await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' });
    await page.evaluate(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; });
  }
  return page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const tokens = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const text = await (await doc.getPage(n)).getTextContent();
      text.items.forEach(it => { const re = /R(\d+)L\D*(\d+)/g; let m; while ((m = re.exec(it.str))) tokens.push({ page: n - 1, row: Number(m[1]), line: Number(m[2]) }); });
    }
    return { pages: doc.numPages, tokens };
  }, base64);
}

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Tableau coupé au saut de page, vraie souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page, downloads } = await openWidget(theme);

  // Aperçu A4 (vrai clic) : la feuille est visible, les pages sont tracées.
  const a4On = await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview'));
  if (!a4On) await realClick(page, '#v2-a4-toggle');
  await page.waitForTimeout(1200);
  const ed = await seamState(page, 'editor');
  check(`${label} - éditeur : le tableau de ${ROW_COUNT} lignes passe sur plusieurs pages (${ed.bands} sauts, feuille au facteur ${ed.zoom.toFixed(3)})`, ed.bands >= 1 && ed.rows === ROW_COUNT && ed.zoom < 1, ed);
  check(`${label} - éditeur : la ligne qui ouvre chaque page (rangs ${JSON.stringify(ed.aligned)}) commence sous la bande de saut de page, la page d'avant garde sa réserve (${JSON.stringify(ed.reserve)} px), aucun texte dessous`,
    ed.bands >= 1 && ed.aligned.every(i => i > 0) && ed.overlaps === 0 && ed.reserve.every(r => r != null && r >= -0.5), ed);
  check(`${label} - éditeur : le liseré de chaque bande a la largeur du tableau`, ed.caps.length === ed.bands && ed.caps.every(c => c.n === 1 && c.fullWidth), ed.caps);

  // La bande dans le panneau, puis un vrai clic dans la ligne qui ouvre la page (sous la bande).
  const k = ed.aligned[0];
  if (!(k > 0)) { check(`${label} - le reste du parcours vise la ligne qui ouvre la page : aucune bande n'est posée sur une ligne`, false, ed); await context.close(); return; }
  await parkMouse(page);
  await scrollBandIntoView(page, 'editor', 0);
  await page.waitForTimeout(300);
  await snap(page, `${theme}-1-editeur-bande`);
  const edPaint = await seamPaint(page, 'editor');
  check(`${label} - éditeur : la réserve et les marges de la couture sont blanches (${edPaint.samples} points relus aux traits des cases), le trait du haut de la ligne est redessiné au bas de la bande`,
    edPaint.visible && edPaint.inkCount === 0 && edPaint.capDrawn, edPaint);
  const below = await pointInRow(page, k, 0, 0);
  check(`${label} - la ligne qui ouvre la page (${ed.firstOfPage2}) est visible et reçoit le clic : rien ne la recouvre`, below.visible && below.hitRow, below);
  await page.mouse.move(below.x - 8, below.y - 3, { steps: 3 });
  await page.mouse.click(below.x, below.y);
  await page.waitForTimeout(250);
  const clicked = await caretRow(page);
  check(`${label} - vrai clic sous la bande : le curseur est dans la ligne ${k} du tableau, le clavier dans le texte`, clicked.row === k && clicked.focusInEditor, clicked);

  // La frappe écrit dans cette ligne ; la bande reste sur la même ligne.
  await page.keyboard.type('X');
  await page.waitForTimeout(600);
  const typed = await page.evaluate((row) => document.querySelectorAll('#editor-container .tiptap > .tableWrapper > table > tbody > tr')[row].querySelector('p').textContent, k);
  const afterTyping = await seamState(page, 'editor');
  check(`${label} - la frappe écrit dans la ligne ${k} (« ${typed} ») et la bande reste sur la ligne ${k}, sans texte dessous`, typed.includes('X') && afterTyping.aligned[0] === k && afterTyping.bands === ed.bands && afterTyping.overlaps === 0, { typed, afterTyping });

  // Flèche haut / bas à travers la bande. Le navigateur ne passe pas toujours d'un paragraphe à celui d'à côté dans un tableau (de la première ligne d'une ligne, Flèche haut
  // saute au premier paragraphe de la ligne d'avant) : seule compte la ligne du tableau où l'on arrive - la dernière ligne de la page d'avant en montant, la ligne qui ouvre la
  // page en descendant (jamais celle d'après sans être passé par elle).
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(150);
  const up = await caretRow(page);
  const visitedDown = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    visitedDown.push((await caretRow(page)).row);
    if (visitedDown[visitedDown.length - 1] >= k) break;
  }
  check(`${label} - Flèche haut traverse la bande vers la ligne ${k - 1}, Flèche bas revient à la ligne ${k} sans la sauter (lignes visitées : ${JSON.stringify(visitedDown)})`,
    up.row === k - 1 && visitedDown[visitedDown.length - 1] === k && visitedDown.every(r => r === k - 1 || r === k), { up, visitedDown });

  // Tab / Maj+Tab depuis la dernière case de la ligne d'avant.
  const lastCellAbove = await pointInRow(page, k - 1, 1, 0);
  await page.mouse.click(lastCellAbove.x, lastCellAbove.y);
  await page.waitForTimeout(200);
  const startCell = await caretRow(page);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  const afterTab = await caretRow(page);
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(200);
  const afterShiftTab = await caretRow(page);
  check(`${label} - Tab passe de la dernière case de la page d'avant à la première case de la ligne ${k}, Maj+Tab revient`,
    startCell.row === k - 1 && startCell.cell === 1 && afterTab.row === k && afterTab.cell === 0 && afterShiftTab.row === k - 1 && afterShiftTab.cell === 1, { startCell, afterTab, afterShiftTab });
  await snap(page, `${theme}-2-editeur-clavier`);

  // Rien de la coupure dans le modèle enregistré : ni la frappe seule, ni le rembourrage de la ligne descendue.
  await page.waitForTimeout(4500);
  const stored = await page.evaluate(() => window.__gristStub.getRow('Publipostage_Modeles', 1).Contenu || '');
  check(`${label} - le modèle enregistré porte la frappe (« ${typed} ») et aucun rembourrage de coupure`,
    stored.includes('<p>' + typed + '</p>') && !/padding-top/.test(stored) && !/v2-page-seam-cap/.test(stored), { typedStored: stored.includes('<p>' + typed + '</p>'), padding: /padding-top/.test(stored) });

  // Lecture (vrai clic) : même rang de coupure que l'éditeur.
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
  await realClick(page, '#btn-mode-read');
  await page.waitForFunction(() => document.getElementById('reader-container').style.display === 'block' && !!document.querySelector('#reader-container .reader-content table'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const rd = await seamState(page, 'reader');
  check(`${label} - Lecture : mêmes sauts que l'éditeur (${rd.bands} contre ${ed.bands}), la page s'ouvre sur la ligne ${JSON.stringify(rd.aligned)} comme l'éditeur ${JSON.stringify(ed.aligned)}, aucun texte dessous`,
    rd.bands === ed.bands && JSON.stringify(rd.aligned) === JSON.stringify(ed.aligned) && rd.overlaps === 0 && rd.caps.every(c => c.n === 1 && c.fullWidth), { rd, ed });
  await scrollBandIntoView(page, 'reader', 0);
  await page.waitForTimeout(300);
  const rdPaint = await seamPaint(page, 'reader');
  check(`${label} - Lecture : la réserve et les marges de la couture sont blanches (${rdPaint.samples} points relus aux traits des cases), le trait du haut de la ligne est redessiné au bas de la bande`,
    rdPaint.visible && rdPaint.inkCount === 0 && rdPaint.capDrawn, rdPaint);
  await snap(page, `${theme}-3-lecture-bande`);

  // PDF (vrai clic sur « Exporter en PDF ») : le fichier téléchargé, relu par pdf.js.
  downloads.length = 0;
  await realClick(page, '#btn-export-pdf');
  const startedAt = Date.now();
  while (!downloads.some(d => /\.pdf$/i.test(d.suggestedFilename())) && Date.now() - startedAt < 30000) await page.waitForTimeout(150);
  const file = downloads.find(d => /\.pdf$/i.test(d.suggestedFilename()));
  check(`${label} - PDF : le fichier est téléchargé`, !!file, downloads.map(d => d.suggestedFilename()));
  if (file) {
    const bytes = readFileSync(await file.path());
    const pdf = await pdfTokens(page, bytes.toString('base64'));
    const pagesOf = {};
    pdf.tokens.forEach(t => { (pagesOf[t.row] = pagesOf[t.row] || new Set()).add(t.page); });
    const split = Object.keys(pagesOf).filter(r => pagesOf[r].size > 1).map(Number);
    const firstOnPage2 = Math.min(...pdf.tokens.filter(t => t.page === 1).map(t => t.row));
    const readerFirst = rd.aligned[0];
    check(`${label} - PDF : ${pdf.pages} pages, aucune des ${ROW_COUNT} lignes n'est coupée en deux (${pdf.tokens.length}/${ROW_COUNT * 2} jetons lus)`, pdf.pages >= 2 && split.length === 0 && pdf.tokens.length === ROW_COUNT * 2, { pages: pdf.pages, split, tokens: pdf.tokens.length });
    check(`${label} - PDF : la page 2 s'ouvre sur la ligne ${firstOnPage2}, à moins d'une ligne de la Lecture (ligne ${readerFirst})`, Math.abs(firstOnPage2 - readerFirst) <= 1, { firstOnPage2, readerFirst });
  }
  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
