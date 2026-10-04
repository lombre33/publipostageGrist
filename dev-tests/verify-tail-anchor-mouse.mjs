#!/usr/bin/env node
// Une image flottante seule sur sa ligne n'ouvre pas de deuxième page (Antoine, 2026-10-04 : « dans un document format personnalisé assez petit, j'ai deux images, une première en mode
// classique, une deuxième en mode flottante, sauf que même si l'image est sur la première page on dirait qu'elle crée une deuxième page ; et quand je supprime la ligne de la deuxième
// page cela supprime l'image flottante »), à la VRAIE souris (page.mouse) et au VRAI clavier, à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis sombre. Ce que
// scenarios-blank-last-page.js ne peut pas voir depuis la page :
//  - le petit format du modèle (100 x 70 mm) ouvert par la liste des modèles, au vrai clic : une seule feuille dans l'éditeur, aucune bande « Page 2 », les deux images dessus, la
//    classique au fil du texte et la flottante à sa place, sans rien qui les recouvre ;
//  - un vrai clic sur l'image flottante la sélectionne et sa barre s'ouvre dans le panneau ; « Derrière le texte » puis « Devant le texte » (vrais clics sur la barre) la laissent à sa
//    place et sur une seule feuille ; la touche Suppr l'enlève, Ctrl+Z la rend, toujours sur une seule feuille ;
//  - le modèle enregistré garde les deux images et leurs deux lignes (rien n'est supprimé pour éviter la page) ;
//  - la Lecture (vrai clic sur « Mode lecture ») : une seule feuille, les deux images dessus ;
//  - le PDF (vrai clic sur « Exporter en PDF », fichier relu par pdf.js) : une page, les deux images dessus, la flottante à la place que lui donne sa grille ;
//  - le Word (menu Exporter, vrai clic sur « Exporter en DOCX », word/document.xml relu) : l'ancre de la flottante est dans le paragraphe qui précède sa ligne, à la même place de la page.
// Le parcours est joué deux fois : avec une image flottante venue d'un fichier, puis avec une image flottante importée via une colonne PJ (Antoine, même jour : « important ! l'image est une
// image importée via une colonne PJ ») - dans l'éditeur ce n'est qu'un cadre « #Table.Colonne » dont le libellé n'est pas du texte, à la Lecture et à l'export c'est la pièce jointe de la ligne.
// Lancé par run-headless.mjs (groupe Node "tailAnchorMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-tail-anchor-mouse.mjs
// TAIL_ANCHOR_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TAIL_ANCHOR_MOUSE_PORT || 8976);
const SHOTS = process.env.TAIL_ANCHOR_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-wide-images-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-tail-anchor-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
const fmt = n => (typeof n === 'number' ? +n.toFixed(2) : n);

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

// Une image carrée et bien visible (elle prend la taille qu'on lui donne) : dessinée dans la page, pour qu'une capture montre où elle est.
const squareImage = () => {
  const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
  const g = canvas.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#fff'; g.fillRect(2, 2, 4, 4);
  return canvas.toDataURL('image/png');
};
// La grille de page de l'image flottante, celle que l'Aperçu A4 capture quand on la pose : 150 pt à droite et 20 pt sous le coin du contenu de la page 1.
const GRID_LEFT_PT = 150;
const GRID_TOP_PT = 20;
const FLOAT_PX = 40;
// `left` et `top` du style sont comptés depuis le coin de la feuille : la grille (comptée depuis le coin du contenu) plus la marge, comme l'éditeur les pose quand l'image est positionnée.
// `attachment` : l'image flottante est liée à la colonne PJ « Photo » de la table Clients (cadre sans image dans l'éditeur, la pièce jointe de la ligne ailleurs).
const PJ_ATTRS = ' data-var-table="Clients" data-var-column="Photo" data-var-key="Clients.Photo"';
const PJ_ATTACHMENT_ID = 7;
const floatingHtml = (png, margins, attachment) => '<p><img class="editor-image" src="' + (attachment ? '' : png) + '" alt="" style="width: ' + FLOAT_PX + 'px; height: ' + FLOAT_PX + 'px; position: absolute; left: '
  + (margins.left * 96 / 25.4 + GRID_LEFT_PT * 96 / 72) + 'px; top: ' + (margins.top * 96 / 25.4 + GRID_TOP_PT * 96 / 72) + 'px; z-index: 5;" data-layer="front" data-wrap="inline" data-page-index="0" data-page-left-pt="'
  + GRID_LEFT_PT + '" data-page-top-pt="' + GRID_TOP_PT + '"' + (attachment ? PJ_ATTRS : '') + '></p>';
const classicHtml = (png, widthPx) => '<p><img class="editor-image" src="' + png + '" alt="" style="width: ' + widthPx + 'px" data-layer="normal" data-wrap="inline"></p>';
const MM_TO_PT = 72 / 25.4;

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme, acceptDownloads: true });
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
  // extractPdfGroundTruth (pdf.js) relit le PDF téléchargé : ce sont les positions RÉELLEMENT peintes, pas celles de la définition pdfmake.
  await page.addScriptTag({ path: join(ROOT, 'dev-tests', 'helpers.js') });
  return { context, page };
}

async function runTheme(theme, variant) {
  const attachment = variant === 'attachment';
  const label = (theme === 'dark' ? 'sombre' : 'clair') + (attachment ? ', image PJ' : '');
  console.log(`\n=== Image flottante seule sur sa ligne${attachment ? ' (importée via une colonne PJ)' : ''}, vraie souris, ${WIDTH}x${HEIGHT}, thème ${theme === 'dark' ? 'sombre' : 'clair'} ===`);
  const { context, page } = await openWidget(theme);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const snap = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${theme}-${name}.png`) }); };
  const center = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  // Le geste d'une vraie souris : l'approche, puis le clic (ou le survol qui ouvre un menu).
  async function realMove(sel) {
    const c = await center(sel);
    await page.mouse.move(c.x - 12, c.y, { steps: 2 });
    await page.mouse.move(c.x, c.y, { steps: 3 });
    return c;
  }
  async function realClick(sel) { const c = await realMove(sel); await page.mouse.click(c.x, c.y); return c; }
  // La souris au bas du panneau avant de viser un bouton ou une image : de la barre d'outils au texte, elle passerait sur un bouton à menu au survol, et le menu ouvert recouvrirait la cible.
  async function parkMouse() { await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 }); await sleep(350); }

  // Une table et une ligne courante : la Lecture et les exports ont de quoi s'ouvrir.
  // Avec une colonne PJ : la ligne courante porte la pièce jointe 7, que le faux serveur de Grist sert (l'image carrée dessinée plus bas) à l'adresse de téléchargement.
  const png = await page.evaluate(squareImage);
  await page.evaluate(async ({ attachment, id, png }) => {
    const stub = window.__gristStub;
    const row = attachment ? { id: 1, Nom: 'Dupont', Photo: ['L', id] } : { id: 1, Nom: 'Dupont' };
    stub.setVariables('Clients', attachment ? { Nom: 'Text', Photo: 'Attachments' } : { Nom: 'Text' });
    stub.setRows('Clients', [row]);
    await GristAPI.refreshSchema();
    stub.fireRecord(row, 'Clients');
    if (attachment) {
      const original = window.fetch;
      window.fetch = (input, init) => {
        const url = String(typeof input === 'string' ? input : input && input.url);
        if (!/\/attachments\/\d+\/download/.test(url)) return original.call(window, input, init);
        return Promise.resolve(new Response(new Blob([Uint8Array.from(atob(png.split(',')[1]), c => c.charCodeAt(0))], { type: 'image/png' }), { status: 200 }));
      };
    }
  }, { attachment, id: PJ_ATTACHMENT_ID, png });
  check(`${label} - Aperçu A4 actif d'office`, await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview')));

  // La largeur de l'image au fil du texte qui remplit la page de 100 x 70 mm (la plus grande qui laisse moins d'une ligne de place derrière elle), mesurée sur cet écran avec cette
  // police : c'est le cas d'Antoine, où la ligne de l'image flottante ne tient plus sur la page. Rien de ceci n'est enregistré : le modèle est créé ensuite.
  const measured = await page.evaluate(async (png) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    PageLayout.setMarginsMm(null);
    PageLayout.setPageSize(100, 70);
    OrientationToggle.sync();
    await wait(500);
    const pages = async html => {
      Editor.setHTML(html);
      await wait(300);
      Editor.refreshPaginationPreview();
      await wait(80);
      return document.querySelectorAll('#editor-container .v2-pagination-overlay .v2-page-band').length + 1;
    };
    const classic = w => '<p><img class="editor-image" src="' + png + '" alt="" style="width: ' + w + 'px" data-layer="normal" data-wrap="inline"></p>';
    let fits = 40;
    let over = Math.ceil(PageLayout.getContentHeightMm() * 96 / 25.4);
    while (over - fits > 1) {
      const mid = (fits + over) >> 1;
      if ((await pages(classic(mid) + '<p>Texte</p>')) === 1) fits = mid; else over = mid;
    }
    const result = { width: over, bare: await pages(classic(over)), withText: await pages(classic(over) + '<p>Texte</p>'), margins: PageLayout.getMarginsMm(), format: PageLayout.getFormat() };
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    Editor.setHTML('<p></p>');
    return result;
  }, png);
  check(`${label} - la page de 100 x 70 mm tient l'image de ${measured.width} px et pas une ligne de texte derrière elle (${measured.bare} page, puis ${measured.withText})`,
    measured.format === '70x100' && measured.bare === 1 && measured.withText === 2, measured);

  // Le modèle d'Antoine : le petit format, l'image au fil du texte, et sur la ligne suivante l'image flottante posée sur la page 1. Enregistré dans le faux Grist et ajouté à la liste.
  const documentHtml = classicHtml(png, measured.width) + floatingHtml(png, measured.margins, attachment);
  const templateId = await page.evaluate(async ({ html, margins }) => {
    const r = await Templates.save(null, 'Étiquette', html, '', null, margins, 'document', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    const option = document.createElement('option'); option.value = String(r.id); option.textContent = 'Étiquette'; select.appendChild(option);
    return r.id;
  }, { html: documentHtml, margins: measured.margins });
  // La liste des modèles à la vraie souris : ouvrir l'arbre, cliquer la ligne. Le chargement est attendu par l'identifiant du modèle courant.
  const open = await page.evaluate(() => { const p = document.querySelector('.tts-popup'); return !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 0; });
  if (!open) { const tb = await center('.tts-trigger'); await page.mouse.click(tb.x, tb.y); await sleep(300); }
  const pos = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.tts-popup .tts-row-leaf')).find(e => e.querySelector('.tts-row-label').textContent.replace(' ★', '') === 'Étiquette');
    if (!row) return null;
    row.scrollIntoView({ block: 'nearest' });
    const b = row.getBoundingClientRect();
    return { x: b.left + 60, y: b.top + b.height / 2 };
  });
  if (pos) { await page.mouse.move(pos.x, pos.y); await sleep(80); await page.mouse.click(pos.x, pos.y); }
  await page.waitForFunction(i => String(Templates.getCurrentId()) === String(i), templateId, { timeout: 5000 }).catch(() => {});
  await sleep(1500);
  check(`${label} - le modèle « Étiquette » s'ouvre par la liste des modèles (vrai clic), dans son petit format`, !!pos && await page.evaluate(i => String(Templates.getCurrentId()) === String(i) && PageLayout.getFormat() === '70x100' && PageLayout.isLandscape(), templateId));
  await parkMouse();

  // --- L'éditeur : une seule feuille, les deux images dessus ---
  // Les rectangles à l'écran de la feuille, de chaque image (la feuille est mise à l'échelle du panneau par le facteur d'ajustement : tout est lu à l'écran, jamais déduit).
  const screen = () => page.evaluate(() => {
    const container = document.getElementById('editor-container');
    const sheet = container.querySelector('.v2-page-sheet');
    const sheetRect = sheet.getBoundingClientRect();
    const zoom = parseFloat(getComputedStyle(sheet).zoom) || 1;
    const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
    const images = Array.from(container.querySelectorAll('.tiptap img.editor-image:not(.ProseMirror-separator)'));
    const layers = [];
    EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'editorImage') layers.push(n.attrs.layer); });
    const c = container.getBoundingClientRect();
    return {
      bands: container.querySelectorAll('.v2-pagination-overlay .v2-page-band').length,
      labels: Array.from(container.querySelectorAll('.v2-page-break-label')).map(e => e.textContent),
      zoom, sheet: { left: sheetRect.left, top: sheetRect.top, right: sheetRect.right, bottom: sheetRect.bottom, height: sheetRect.height },
      pageHeightPx: PageLayout.getPageSizePx().height,
      images: images.map(rect), layers, paragraphs: container.querySelectorAll('.tiptap > p').length,
      container: { top: c.top, bottom: c.bottom },
    };
  });
  let s = await screen();
  check(`${label} - éditeur : une seule feuille, aucune bande « Page 2 » (${s.bands} bande, feuille de ${fmt(s.sheet.height / s.zoom)} px pour une page de ${fmt(s.pageHeightPx)} px)`,
    s.bands === 0 && s.labels.length === 0 && near(s.sheet.height / s.zoom, s.pageHeightPx, 4), s);
  check(`${label} - éditeur : les deux images (${JSON.stringify(s.layers)}) et leurs deux lignes sont là, rien n'a été supprimé pour éviter la page`, s.layers.length === 2 && s.layers[0] === 'normal' && s.layers[1] === 'front' && s.paragraphs === 2, s);
  const [classic, floating] = s.images;
  const insideSheet = r => r && r.left >= s.sheet.left - 1 && r.right <= s.sheet.right + 1 && r.top >= s.sheet.top - 1 && r.bottom <= s.sheet.bottom + 1;
  check(`${label} - éditeur : les deux images sont sur la feuille, côte à côte, sans se recouvrir`,
    s.images.length === 2 && insideSheet(classic) && insideSheet(floating) && (classic.right <= floating.left + 1 || floating.right <= classic.left + 1), s);
  await snap('1-editeur');
  await page.evaluate(() => { const c = document.getElementById('editor-container'); c.scrollTop = c.scrollHeight; });
  await sleep(250);
  await snap('1b-editeur-bas');
  await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
  await sleep(250);

  // Un vrai clic sur l'image flottante la sélectionne ; la barre de l'image s'ouvre dans le panneau, ses boutons sont atteignables.
  const scrollInto = y => page.evaluate(({ y }) => {
    const container = document.getElementById('editor-container');
    const c = container.getBoundingClientRect();
    container.scrollTop += y - (c.top + c.height / 2);
  }, { y });
  await scrollInto(floating.y);
  await sleep(200);
  s = await screen();
  const f = s.images[1];
  const covered = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return { tag: el && el.tagName, onImage: !!(el && el.closest('.editor-image-view, img.editor-image')) }; }, { x: f.x, y: f.y });
  check(`${label} - éditeur : rien ne recouvre l'image flottante (l'élément sous le pointeur est l'image)`, covered.onImage, covered);
  await page.mouse.move(f.x - 14, f.y - 6, { steps: 2 });
  await page.mouse.move(f.x, f.y, { steps: 3 });
  await page.mouse.click(f.x, f.y);
  await sleep(350);
  const selected = await page.evaluate(() => {
    const sel = EditorCore.getEditor().state.selection;
    const toolbarButton = document.querySelector('button[data-action="layer-behind"]');
    const r = toolbarButton && toolbarButton.getBoundingClientRect();
    return { type: sel.node ? sel.node.type.name : sel.constructor.name, layer: sel.node && sel.node.attrs.layer,
      toolbar: !!r && r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  });
  check(`${label} - un vrai clic sur l'image flottante la sélectionne, sa barre est dans le panneau`, selected.type === 'editorImage' && selected.layer === 'front' && selected.toolbar, selected);
  await snap('2-image-selectionnee');

  // « Derrière le texte » puis « Devant le texte » : l'image garde sa place et la feuille reste unique.
  const before = (await screen()).images[1];
  await realClick('button[data-action="layer-behind"]');
  await sleep(400);
  s = await screen();
  check(`${label} - barre de l'image, « Derrière le texte » (vrai clic) : l'image garde sa place, toujours une seule feuille`,
    s.layers[1] === 'behind' && s.bands === 0 && near(s.images[1].left, before.left, 1.5) && near(s.images[1].top, before.top, 1.5), { layers: s.layers, bands: s.bands, before, after: s.images[1] });
  await realClick('button[data-action="layer-front"]');
  await sleep(400);
  s = await screen();
  check(`${label} - barre de l'image, « Devant le texte » (vrai clic) : l'image garde sa place, toujours une seule feuille`,
    s.layers[1] === 'front' && s.bands === 0 && near(s.images[1].left, before.left, 1.5) && near(s.images[1].top, before.top, 1.5), { layers: s.layers, bands: s.bands, before, after: s.images[1] });

  // La touche Suppr enlève l'image flottante (la sélection est restée sur elle) ; Ctrl+Z la rend. Une seule feuille à chaque étape. Le temps d'une personne entre deux gestes : l'historique
  // regroupe en une seule annulation ce qui se passe à moins de 500 ms, et le Ctrl+Z défairait alors aussi le retour « Devant le texte ».
  await sleep(900);
  await page.keyboard.press('Delete');
  await sleep(450);
  s = await screen();
  check(`${label} - Suppr (vrai clavier) enlève l'image flottante et elle seule : l'image au fil du texte reste, une seule feuille`, s.layers.length === 1 && s.layers[0] === 'normal' && s.bands === 0, { layers: s.layers, bands: s.bands });
  await sleep(900);
  await page.keyboard.press('Control+z');
  await sleep(450);
  s = await screen();
  check(`${label} - Ctrl+Z (vrai clavier) rend l'image flottante, à sa place, sur une seule feuille`,
    s.layers.length === 2 && s.layers[1] === 'front' && s.bands === 0 && near(s.images[1].left, before.left, 1.5) && near(s.images[1].top, before.top, 1.5), { layers: s.layers, bands: s.bands, before, after: s.images[1] });

  // Le modèle enregistré : les deux images, leurs deux lignes, la grille de la flottante.
  await sleep(4500);
  const stored = await page.evaluate(id => window.__gristStub.getRow('Publipostage_Modeles', id).Contenu || '', templateId);
  const storedDoc = await page.evaluate(html => {
    const probe = document.createElement('div'); probe.innerHTML = html;
    const img = probe.querySelectorAll('img.editor-image');
    return { paragraphs: probe.querySelectorAll(':scope > p').length, images: img.length, layers: Array.from(img).map(i => i.getAttribute('data-layer')), grid: img[1] ? [img[1].getAttribute('data-page-index'), img[1].getAttribute('data-page-left-pt'), img[1].getAttribute('data-page-top-pt')] : null };
  }, stored);
  check(`${label} - le modèle enregistré garde les deux images et leurs deux lignes, la flottante avec sa grille de page`,
    storedDoc.paragraphs === 2 && storedDoc.images === 2 && storedDoc.layers.join() === 'normal,front' && storedDoc.grid && storedDoc.grid[0] === '0', storedDoc);

  // --- La Lecture (vrai clic sur « Mode lecture ») ---
  await parkMouse();
  await realClick('#btn-mode-read');
  await page.waitForFunction(() => document.getElementById('reader-container').style.display === 'block' && !!document.querySelector('#reader-container .reader-content img.editor-image'), null, { timeout: 8000 }).catch(() => {});
  await sleep(1200);
  const reader = await page.evaluate(() => {
    const container = document.getElementById('reader-container');
    const sheet = container.querySelector('.reader-content');
    const sr = sheet.getBoundingClientRect();
    const images = Array.from(container.querySelectorAll('.reader-content img.editor-image')).map(i => { const r = i.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
    return { bands: container.querySelectorAll('.v2-pagination-overlay .v2-page-band').length, sheet: { left: sr.left, top: sr.top, right: sr.right, bottom: sr.bottom }, images };
  });
  const insideReader = r => r.left >= reader.sheet.left - 1 && r.right <= reader.sheet.right + 1 && r.top >= reader.sheet.top - 1 && r.bottom <= reader.sheet.bottom + 1;
  check(`${label} - Lecture : une seule feuille, aucune bande « Page 2 », les deux images dessus`, reader.bands === 0 && reader.images.length === 2 && reader.images.every(insideReader), reader);
  await snap('3-lecture');

  // --- Le PDF (vrai clic sur « Exporter en PDF ») : le fichier téléchargé, relu par pdf.js ---
  const [pdfDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 90000 }).catch(() => null),
    (async () => { const c = await realMove('#btn-export-pdf'); await page.mouse.click(c.x, c.y); })(),
  ]);
  check(`${label} - le bouton « Exporter en PDF » télécharge un fichier`, !!pdfDownload);
  if (pdfDownload) {
    const truth = await page.evaluate(b64 => TestHelpers.extractPdfGroundTruth(b64), readFileSync(await pdfDownload.path()).toString('base64'));
    const first = truth.pages[0];
    const margin = measured.margins.left * MM_TO_PT;
    const marginTop = measured.margins.top * MM_TO_PT;
    const floatingPainted = first && first.images.find(i => near(i.width, FLOAT_PX * 0.75, 1));
    check(`${label} - PDF : une seule page de 100 x 70 mm, aucune page blanche derrière (${truth.pages.length} page, ${fmt(first.width)} x ${fmt(first.height)} pt)`,
      truth.pages.length === 1 && near(first.width, 100 * MM_TO_PT, 1) && near(first.height, 70 * MM_TO_PT, 1), { pages: truth.pages.length, page: first && [first.width, first.height] });
    check(`${label} - PDF : les deux images sont peintes sur la page 1, la flottante à (${fmt(margin + GRID_LEFT_PT)}, ${fmt(marginTop + GRID_TOP_PT)}) pt, la place que lui donne sa grille`,
      first.images.length === 2 && !!floatingPainted && near(floatingPainted.x, margin + GRID_LEFT_PT, 0.6) && near(floatingPainted.y, marginTop + GRID_TOP_PT, 0.6),
      { images: first.images.map(i => ({ x: fmt(i.x), y: fmt(i.y), w: fmt(i.width) })) });
  }

  // --- Le Word : le menu Exporter s'ouvre au survol de son bouton, puis la ligne « Exporter en DOCX » au vrai clic ---
  await realMove('#v2-btn-quality');
  await sleep(500);
  const docxRow = await center('#v2-btn-export-docx');
  await page.mouse.move(docxRow.x, docxRow.y, { steps: 8 });
  await sleep(120);
  const [docxDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 90000 }).catch(() => null),
    page.mouse.click(docxRow.x, docxRow.y),
  ]);
  check(`${label} - la ligne « Exporter en DOCX » télécharge un fichier`, !!docxDownload && /\.docx$/i.test(docxDownload.suggestedFilename()), docxDownload && docxDownload.suggestedFilename());
  if (docxDownload) {
    const word = await page.evaluate(async b64 => {
      await ExportCommon.ensureJsZipLoaded();
      const zip = await JSZip.loadAsync(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
      const doc = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
      const body = doc.getElementsByTagName('w:body')[0];
      const paragraphs = Array.from(body.children).filter(n => n.tagName === 'w:p');
      return {
        paragraphs: paragraphs.length,
        kinds: paragraphs.map(p => Array.from(p.getElementsByTagName('w:drawing')).map(d => (d.getElementsByTagName('wp:anchor')[0] ? 'ancre' : 'en ligne'))),
        anchors: TestHelpers.docxDrawings(doc).filter(d => d.kind === 'anchor').map(d => ({ x: d.x, y: d.y, relativeFrom: d.relativeFrom })),
      };
    }, readFileSync(await docxDownload.path()).toString('base64'));
    const margin = measured.margins.left * MM_TO_PT;
    const marginTop = measured.margins.top * MM_TO_PT;
    check(`${label} - Word : un seul paragraphe, celui de l'image au fil du texte, qui porte aussi l'ancre de la flottante (pas de paragraphe vide à elle seule : ${JSON.stringify(word.kinds)})`,
      word.paragraphs === 1 && word.kinds[0].join() === 'en ligne,ancre', word);
    check(`${label} - Word : l'ancre est sur la page, à (${fmt(margin + GRID_LEFT_PT)}, ${fmt(marginTop + GRID_TOP_PT)}) pt comme dans le PDF`,
      word.anchors.length === 1 && near(word.anchors[0].x, margin + GRID_LEFT_PT, 0.6) && near(word.anchors[0].y, marginTop + GRID_TOP_PT, 0.6) && word.anchors[0].relativeFrom.h === 'page' && word.anchors[0].relativeFrom.v === 'page', word.anchors);
  }
  await context.close();
}

for (const variant of ['file', 'attachment']) {
  await runTheme('light', variant);
  await runTheme('dark', variant);
}
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
