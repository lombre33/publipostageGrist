#!/usr/bin/env node
// Flèches du clavier sur une image en calque (devant ou derrière le texte), au vrai clavier et à la vraie souris à la taille du panneau Grist d'Antoine (~700x400, feuille réduite à
// ~0,85), puis en témoin à 1400x1000 (facteur 1). Chaque appui vaut 1 px de MISE EN PAGE (10 avec Maj), la grille page (PDF et Word) suit, un Ctrl+Z défait une rafale d'un coup,
// la touche tenue appuyée répète, contre le bord de la page rien ne s'écrit de plus. Les flèches ne changent rien ailleurs : image dans le texte, curseur dans le texte, et - garde-fou
// - le curseur qui ARRIVE sur l'ancre d'une image en calque la traverse encore à la flèche suivante au lieu de la faire glisser (sinon on ne passerait plus au clavier ce premier
// paragraphe, et la touche tenue ferait filer l'image sur la page). Un clic sur l'image, une action de sa barre flottante rendent les flèches à l'image. Suivi des modifications actif
// (choix d'Antoine, 01/10 : « le déplacement d'une image laisse une trace, quel que soit le mode de déplacement ») : le premier appui d'une rafale laisse l'image d'origine barrée à sa place
// et pose la copie à la nouvelle position (suppression + insertion suggérées), resélectionnée ; les appuis suivants déplacent cette copie sans empiler d'autres traces ; Ctrl+Z défait
// la rafale et sa trace d'un coup ; accepter garde la copie, refuser rend l'original ; l'original barré ne bouge pas ; contre le bord de la page, rien ne s'écrit de plus.
// Fonctionnalité du 01/10 (« déplacer une image aux flèches ») : js/floating-toolbars.js (wireImageFloatingToolbar), infobulle de la poignée dans js/i18n.js (image.moveHandle).
// Lancé par run-headless.mjs (groupe Node "imageArrowsKeyboard", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-image-arrows-keyboard.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.IMAGE_ARROWS_KEYBOARD_PORT || 8915);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-layer-images-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-image-arrows-keyboard] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol == null ? 1.5 : tol);
const r2 = v => Math.round(v * 100) / 100;

// Rectangle (pixels écran) de l'image et facteur d'ajustement de la feuille.
const geometry = () => page.evaluate(() => {
  const view = document.querySelector('.tiptap .editor-image-view');
  const r = view.querySelector('img').getBoundingClientRect();
  const sheet = EditorCore.getEditor().view.dom.closest('.v2-page-sheet');
  return { left: r.left, top: r.top, zoom: parseFloat(getComputedStyle(sheet).zoom) || 1 };
});
// Attributs enregistrés de l'image, et position posée sur son DOM (les deux doivent toujours être d'accord).
const imageInfo = () => page.evaluate(() => {
  let info = null;
  const ed = EditorCore.getEditor();
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'editorImage' || info) return;
    const a = node.attrs;
    const view = ed.view.nodeDOM(pos);
    info = { pos, layer: a.layer, width: a.width, left: a.left, top: a.top, pageIndex: a.pageIndex, pageLeftPt: a.pageLeftPt, pageTopPt: a.pageTopPt, domLeft: parseFloat(view.style.left), domTop: parseFloat(view.style.top) };
  });
  return info;
});
// Toutes les images du document (l'original barré et sa copie en suivi), avec ce que la trace en dit.
const traceState = () => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  const images = [];
  let deletions = 0, insertions = 0;
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'editorImage') return;
    const marks = node.marks.map(m => m.type.name);
    if (marks.includes('deletion')) deletions++;
    if (marks.includes('insertion')) insertions++;
    const dom = ed.view.nodeDOM(pos);
    images.push({ pos, left: node.attrs.left, top: node.attrs.top, pageLeftPt: node.attrs.pageLeftPt, pageTopPt: node.attrs.pageTopPt, deleted: marks.includes('deletion'), inserted: marks.includes('insertion'), domLeft: dom && parseFloat(dom.style.left) });
  });
  const s = ed.state.selection;
  return { images, deletions, insertions, selFrom: s.from, selImage: !!(s.node && s.node.type.name === 'editorImage'), pending: TrackChanges.hasPendingSuggestions(ed.state) };
});
// La barre flottante de l'image est ouverte (visible), pas seulement présente dans le DOM.
const toolbarOpen = () => page.evaluate(() => { const b = document.querySelector('.v2-floating-toolbar button[data-action="zoom-in"]'); return !!b && b.closest('.v2-floating-toolbar').classList.contains('visible'); });
const selection = () => page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return { image: !!(s.node && s.node.type.name === 'editorImage'), from: s.from, to: s.to }; });
// Grille page relue sur le rendu à cet instant.
const freshGrid = () => page.evaluate(() => {
  const ed = EditorCore.getEditor();
  let pos = null;
  ed.state.doc.descendants((n, p) => { if (n.type.name === 'editorImage' && pos == null) pos = p; });
  return HeaderFooterPreview.computePageGridPosition(ed.view.nodeDOM(pos));
});
const focusInEditor = () => page.evaluate(() => EditorCore.getEditor().view.dom.contains(document.activeElement));

const centerOf = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
}, sel);
async function clickAt(x, y) { await page.mouse.move(x, y); await sleep(40); await page.mouse.down(); await sleep(40); await page.mouse.up(); await sleep(180); }
async function clickToolbar(action) {
  const c = await centerOf('.v2-floating-toolbar button[data-action="' + action + '"]');
  if (!c) return false;
  await clickAt(c.x, c.y);
  return true;
}
async function selectImage() {
  const c = await centerOf('.tiptap .editor-image-view img');
  await clickAt(c.x, c.y);
  return (await selection()).image;
}
const ensureSelected = async () => { if (!(await selection()).image) await selectImage(); };
// Clic sur un bouton de la barre qui peut rester grisé (« Tout accepter » sans rien en attente) : le constat qui suit échoue proprement, le script ne s'arrête pas sur une attente.
const clickBar = async sel => { try { await page.click(sel, { timeout: 2500 }); } catch (e) { /* bouton grisé : les vérifications suivantes le diront */ } };

// Vrai clavier : une pression, ou la touche tenue (Playwright marque `repeat` quand la touche est déjà enfoncée).
async function press(key, times = 1) {
  for (let i = 0; i < times; i++) await page.keyboard.press(key);
  await sleep(150);
}
// Appuis rapprochés (bien en deçà du délai de groupement de l'historique) : une rafale, que Ctrl+Z défait d'un coup.
async function burst(keys) {
  for (const key of keys) await page.keyboard.press(key);
  await sleep(250);
}
async function hold(key, times) {
  for (let i = 0; i < times; i++) await page.keyboard.down(key);
  await page.keyboard.up(key);
  await sleep(150);
}
const caretAt = pos => page.evaluate(p => { EditorCore.getEditor().chain().focus().setTextSelection(p).run(); }, pos);

// Document neuf : un paragraphe, l'image (320 px de large, ratio 2:1) dans le texte, des lignes en dessous pour que la page ne soit pas vide.
async function freshDocument() {
  await page.evaluate(() => {
    document.getElementById('editor-container').classList.add('a4-preview');
    PageLayout.setMarginsMm(null);
    Editor.setHeaderFooterData({ enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
    const c = document.createElement('canvas'); c.width = 320; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#1e88e5'; g.fillRect(0, 0, 320, 160); g.fillStyle = '#fdd835'; g.fillRect(160, 80, 160, 80);
    const src = c.toDataURL('image/png');
    const paras = Array.from({ length: 12 }, (_, i) => '<p>Ligne ' + i + ' du document, un peu de texte pour remplir la page.</p>').join('');
    Editor.setHTML('<p>Texte </p>' + paras);
    const ed = EditorCore.getEditor();
    ed.commands.setTextSelection(6);
    ed.commands.insertContent({ type: 'editorImage', attrs: { src, alt: '', width: '320px' } });
    Editor.refreshLayout();
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
  });
  await sleep(500);
}

// Nombre de transactions qui changent le document (une flèche contre le bord de la page ne doit en produire aucune).
await page.evaluate(() => {
  window.__docTx = 0;
  EditorCore.getEditor().on('transaction', ({ transaction }) => { if (transaction.docChanged) window.__docTx++; });
});

async function run(label, expectZoomBelowOne) {
  await freshDocument();
  const g0 = await geometry();
  if (expectZoomBelowOne) check(label + ' : la feuille est réduite (facteur d\'ajustement < 1)', g0.zoom > 0.8 && g0.zoom < 0.9, g0.zoom);
  else check(label + ' : la feuille est à sa taille (facteur 1)', g0.zoom === 1, g0.zoom);

  // L'image se met en calque à la vraie souris : un clic la sélectionne, « devant le texte » dans sa barre flottante.
  check(label + ' : un clic sur l\'image la sélectionne', await selectImage());
  check(label + ' : « devant le texte » met l\'image en calque', await clickToolbar('layer-front'));
  check(label + ' : le curseur reste dans l\'éditeur après le clic sur la barre flottante (les flèches y arrivent)', await focusInEditor());
  const a0 = await imageInfo();
  check(label + ' : l\'image est en calque, sa grille page est capturée', a0.layer === 'front' && a0.pageIndex === 0 && typeof a0.pageLeftPt === 'number' && typeof a0.pageTopPt === 'number', a0);

  // 1 px de mise en page par appui.
  const s0 = await geometry();
  await press('ArrowRight');
  const a1 = await imageInfo();
  const s1 = await geometry();
  check(label + ' : flèche droite : l\'image se déplace de 1 px de mise en page vers la droite', a1.left === a0.left + 1 && a1.top === a0.top, { avant: [a0.left, a0.top], apres: [a1.left, a1.top] });
  check(label + ' : à l\'écran, 1 px de mise en page vaut le facteur d\'ajustement', near(s1.left - s0.left, g0.zoom, 0.3) && near(s1.top, s0.top, 0.3), { dx: r2(s1.left - s0.left), zoom: r2(g0.zoom), dy: r2(s1.top - s0.top) });
  check(label + ' : la grille page suit (0,75 pt par pixel, même page)', near(a1.pageLeftPt - a0.pageLeftPt, 0.75, 0.02) && near(a1.pageTopPt, a0.pageTopPt, 0.02) && a1.pageIndex === 0, { avant: [a0.pageLeftPt, a0.pageTopPt], apres: [a1.pageLeftPt, a1.pageTopPt] });
  check(label + ' : l\'image reste sélectionnée', (await selection()).image);

  await press('ArrowDown', 3);
  const a2 = await imageInfo();
  check(label + ' : trois fois flèche bas : 3 px vers le bas', a2.top === a1.top + 3 && a2.left === a1.left, { avant: [a1.left, a1.top], apres: [a2.left, a2.top] });
  await press('ArrowLeft');
  await press('ArrowUp');
  const a3 = await imageInfo();
  check(label + ' : flèche gauche puis flèche haut : 1 px de chaque côté', a3.left === a2.left - 1 && a3.top === a2.top - 1, { avant: [a2.left, a2.top], apres: [a3.left, a3.top] });

  // 10 px avec Maj.
  await press('Shift+ArrowRight');
  const a4 = await imageInfo();
  check(label + ' : Maj + flèche droite : 10 px', a4.left === a3.left + 10 && a4.top === a3.top, { avant: [a3.left, a3.top], apres: [a4.left, a4.top] });
  await press('Shift+ArrowDown');
  const a5 = await imageInfo();
  check(label + ' : Maj + flèche bas : 10 px', a5.top === a4.top + 10 && a5.left === a4.left, { avant: [a4.left, a4.top], apres: [a5.left, a5.top] });
  await press('Shift+ArrowLeft');
  await press('Shift+ArrowUp');
  const a6 = await imageInfo();
  check(label + ' : Maj + flèche gauche puis haut : revient de 10 px de chaque côté', a6.left === a5.left - 10 && a6.top === a5.top - 10, { avant: [a5.left, a5.top], apres: [a6.left, a6.top] });

  // Ce que le PDF et le Word liront : la grille page enregistrée est celle du rendu, et le DOM est d'accord avec le modèle.
  const grid = await freshGrid();
  check(label + ' : la grille page enregistrée est celle du rendu', !!grid && near(grid.pageLeftPt, a6.pageLeftPt, 0.02) && near(grid.pageTopPt, a6.pageTopPt, 0.02) && grid.pageIndex === a6.pageIndex, { rendu: grid, enregistre: [a6.pageIndex, a6.pageLeftPt, a6.pageTopPt] });
  check(label + ' : la position posée sur le DOM est celle du modèle', a6.domLeft === a6.left && a6.domTop === a6.top, a6);

  // Une rafale se défait d'un coup (même groupe d'historique) et se rétablit.
  await sleep(700);
  await ensureSelected();
  const b0 = await imageInfo();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await sleep(250);
  const b1 = await imageInfo();
  check(label + ' : cinq flèches de suite : 5 px', b1.left === b0.left + 5 && b1.top === b0.top, { avant: [b0.left, b0.top], apres: [b1.left, b1.top] });
  await page.keyboard.press('Control+z');
  await sleep(250);
  const b2 = await imageInfo();
  check(label + ' : Ctrl+Z défait toute la rafale d\'un coup', !!b2 && b2.left === b0.left && b2.top === b0.top, { avant: [b0.left, b0.top], apres: b2 && [b2.left, b2.top] });
  await page.keyboard.press('Control+y');
  await sleep(250);
  const b3 = await imageInfo();
  check(label + ' : Ctrl+Y la rétablit', !!b3 && b3.left === b0.left + 5, { attendu: b0.left + 5, apres: b3 && b3.left });

  // Touche tenue appuyée : chaque répétition déplace de 1 px.
  await ensureSelected();
  const h0 = await imageInfo();
  await hold('ArrowDown', 20);
  const h1 = await imageInfo();
  check(label + ' : touche tenue appuyée : l\'image répète, 20 px', h1.top === h0.top + 20 && h1.left === h0.left, { avant: [h0.left, h0.top], apres: [h1.left, h1.top] });

  // Derrière le texte : les mêmes flèches.
  await ensureSelected();
  check(label + ' : « derrière le texte » (barre flottante)', await clickToolbar('layer-behind'));
  const k0 = await imageInfo();
  await press('ArrowRight');
  const k1 = await imageInfo();
  check(label + ' : derrière le texte : les flèches déplacent aussi l\'image', k0.layer === 'behind' && k1.left === k0.left + 1 && k1.top === k0.top, { avant: [k0.left, k0.top], apres: [k1.left, k1.top] });

  // Contre le bord de la page physique (haut puis gauche) : l'image s'arrête, et la flèche en trop n'écrit rien.
  await ensureSelected();
  await clickToolbar('layer-front');
  const margins = await page.evaluate(() => PageLayout.getMarginsPt());
  await press('Shift+ArrowUp', 30);
  const e1 = await imageInfo();
  check(label + ' : en haut : l\'image s\'arrête au bord de la page', near(e1.pageTopPt, -margins.top, 0.01), { pageTopPt: e1.pageTopPt, margeHaut: margins.top });
  const tx1 = await page.evaluate(() => window.__docTx);
  await press('Shift+ArrowUp', 3);
  await press('ArrowUp', 3);
  const e2 = await imageInfo();
  const tx2 = await page.evaluate(() => window.__docTx);
  check(label + ' : contre le bord du haut : rien ne s\'écrit de plus (ni document, ni historique) et le DOM reste d\'accord', tx2 === tx1 && e2.top === e1.top && e2.domTop === e2.top && (await selection()).image, { tx1, tx2, haut: [e1.top, e2.top, e2.domTop] });
  await press('Shift+ArrowLeft', 40);
  const e3 = await imageInfo();
  check(label + ' : à gauche : l\'image s\'arrête au bord de la page', near(e3.pageLeftPt, -margins.left, 0.01), { pageLeftPt: e3.pageLeftPt, margeGauche: margins.left });
  const tx3 = await page.evaluate(() => window.__docTx);
  await press('Shift+ArrowLeft', 2);
  await press('ArrowLeft', 3);
  const e4 = await imageInfo();
  const tx4 = await page.evaluate(() => window.__docTx);
  check(label + ' : contre le bord de gauche : rien ne s\'écrit de plus', tx4 === tx3 && e4.left === e3.left && e4.domLeft === e4.left, { tx3, tx4, gauche: [e3.left, e4.left, e4.domLeft] });
  // Et dans l'autre sens, l'image repart aussitôt.
  await press('ArrowRight');
  const e5 = await imageInfo();
  check(label + ' : depuis le bord, la flèche opposée la ramène de 1 px', e5.left === e4.left + 1, { avant: e4.left, apres: e5.left });

  // --- Ce que les flèches ne changent pas ---
  // Image dans le texte : les flèches de ProseMirror (le curseur traverse l'image), rien ne bouge.
  await ensureSelected();
  check(label + ' : « dans le texte » (barre flottante)', await clickToolbar('layer-normal'));
  const n0 = await imageInfo();
  await press('ArrowRight');
  const n1 = await imageInfo();
  const nsel = await selection();
  check(label + ' : image dans le texte : la flèche droite traverse l\'image comme avant (curseur après l\'image, rien ne bouge)', n0.layer === 'normal' && !nsel.image && nsel.from === n0.pos + 1 && n1.left === n0.left && n1.top === n0.top, { n0, n1, nsel });
  // Curseur dans le texte : une flèche avance d'un caractère, Maj + flèche étend la sélection.
  await caretAt(1);
  await press('ArrowRight');
  const t1 = await selection();
  check(label + ' : curseur dans le texte : flèche droite avance d\'un caractère', t1.from === 2 && t1.to === 2, t1);
  await press('Shift+ArrowRight');
  const t2 = await selection();
  check(label + ' : curseur dans le texte : Maj + flèche droite étend la sélection d\'un caractère', t2.from === 2 && t2.to === 3, t2);

  // Le curseur ARRIVE sur l'ancre d'une image en calque : il la traverse encore, l'image ne glisse pas.
  check(label + ' : « devant le texte » sur l\'image (clic, barre flottante)', (await selectImage()) && await clickToolbar('layer-front'));
  const c0 = await imageInfo();
  await caretAt(1);
  let arrived = false;
  let walked = 0;
  for (; walked < 12; walked++) {
    await press('ArrowRight');
    if ((await selection()).image) { arrived = true; break; }
  }
  const c1 = await imageInfo();
  check(label + ' : au clavier, le curseur arrive sur l\'image en calque (elle se sélectionne) sans l\'avoir déplacée', arrived && walked + 1 === c0.pos && c1.left === c0.left && c1.top === c0.top, { walked, pos: c0.pos, c0, c1 });
  await press('ArrowRight');
  const c2 = await imageInfo();
  const csel2 = await selection();
  check(label + ' : curseur arrivé sur l\'ancre : la flèche suivante traverse l\'image (curseur après), elle ne la déplace pas', !csel2.image && csel2.from === c0.pos + 1 && c2.left === c0.left && c2.top === c0.top, { csel2, c0, c2 });
  await press('ArrowLeft');
  check(label + ' : de l\'autre côté, la flèche gauche arrive aussi sur l\'image', (await selection()).image);
  await hold('ArrowLeft', 8);
  const c3 = await imageInfo();
  const csel3 = await selection();
  check(label + ' : touche tenue en traversant l\'ancre : l\'image ne bouge pas, le curseur avance dans le texte', c3.left === c0.left && c3.top === c0.top && !csel3.image && csel3.from < c0.pos, { csel3, c0, c3 });

  // Un clic sur l'image, ou une action de sa barre flottante, rend les flèches à l'image (même arrivée par le clavier).
  await caretAt(c0.pos + 1);
  await press('ArrowLeft');
  check(label + ' : (arrivée au clavier) l\'image est sélectionnée', (await selection()).image);
  await selectImage();
  const d0 = await imageInfo();
  await press('ArrowRight');
  const d1 = await imageInfo();
  check(label + ' : après un clic sur l\'image, les flèches la déplacent', d1.left === d0.left + 1 && d1.top === d0.top && (await selection()).image, { avant: [d0.left, d0.top], apres: [d1.left, d1.top] });
  await caretAt(c0.pos + 1);
  await press('ArrowLeft');
  check(label + ' : (arrivée au clavier, de nouveau) l\'image est sélectionnée', (await selection()).image);
  check(label + ' : « agrandir » dans la barre flottante', await clickToolbar('zoom-in'));
  const f0 = await imageInfo();
  await press('ArrowRight');
  const f1 = await imageInfo();
  check(label + ' : après une action de la barre flottante, les flèches déplacent l\'image', f1.left === f0.left + 1 && f1.top === f0.top && f1.width === f0.width, { avant: [f0.left, f0.top], apres: [f1.left, f1.top] });

  // Suivi des modifications actif (choix d'Antoine, 01/10) : le déplacement laisse sa trace, aux flèches comme à la souris. Le premier appui laisse l'original barré à sa place et pose la
  // copie à la nouvelle position, resélectionnée ; les appuis suivants déplacent cette copie ; une rafale (appuis rapprochés, un seul groupe d'historique) se défait d'un coup, trace comprise.
  await ensureSelected();
  await page.evaluate(() => Editor.setTrackChanges(true));
  await sleep(700);
  const tm0 = (await traceState()).images[0];
  await burst(['ArrowRight', 'ArrowRight', 'ArrowRight']);
  const tr1 = await traceState();
  const orig1 = tr1.images.find(i => i.deleted);
  const copy1 = tr1.images.find(i => i.inserted);
  check(label + ' : suivi actif : trois flèches laissent deux images, l\'original en suppression suggérée et la copie en insertion suggérée', tr1.images.length === 2 && !!orig1 && !!copy1 && tr1.deletions === 1 && tr1.insertions === 1 && tr1.pending, tr1);
  check(label + ' : suivi actif : l\'original reste barré à sa place (position et DOM inchangés)', !!orig1 && orig1.left === tm0.left && orig1.top === tm0.top && orig1.domLeft === tm0.left, { original: orig1, avant: [tm0.left, tm0.top] });
  check(label + ' : suivi actif : la copie est à 3 px à droite, son DOM d\'accord avec le modèle', !!copy1 && copy1.left === tm0.left + 3 && copy1.top === tm0.top && copy1.domLeft === copy1.left, { copie: copy1, avant: [tm0.left, tm0.top] });
  check(label + ' : suivi actif : la copie est resélectionnée (image sélectionnée, barre flottante ouverte)', !!copy1 && tr1.selImage && tr1.selFrom === copy1.pos && await toolbarOpen(), { selFrom: tr1.selFrom, copie: copy1 && copy1.pos });
  const cues = await page.evaluate(() => {
    const del = document.querySelector('.tiptap del img.editor-image');
    const ins = document.querySelector('.tiptap ins img.editor-image');
    const cs = el => el ? getComputedStyle(el) : null;
    return { delOutline: cs(del) && cs(del).outlineStyle, delOpacity: cs(del) && cs(del).opacity, insOutline: cs(ins) && cs(ins).outlineStyle, insOpacity: cs(ins) && cs(ins).opacity };
  });
  check(label + ' : suivi actif : la trace se voit (original estompé au cadre rouge en tirets, copie au cadre vert plein)', cues.delOutline === 'dashed' && Number(cues.delOpacity) < 0.6 && cues.insOutline === 'solid' && Number(cues.insOpacity) === 1, cues);
  await burst(['Shift+ArrowDown', 'ArrowRight', 'ArrowRight']);
  const tr2 = await traceState();
  const orig2 = tr2.images.find(i => i.deleted);
  const copy2 = tr2.images.find(i => i.inserted);
  check(label + ' : suivi actif : les appuis suivants déplacent la copie (5 px à droite, 10 px plus bas) sans empiler d\'autres traces', tr2.images.length === 2 && !!copy2 && copy2.left === tm0.left + 5 && copy2.top === tm0.top + 10 && copy2.domLeft === copy2.left && tr2.deletions === 1 && tr2.insertions === 1 && !!orig2 && orig2.left === tm0.left && orig2.top === tm0.top, tr2);
  check(label + ' : suivi actif : la copie reste sélectionnée, la barre flottante ouverte', tr2.selImage && !!copy2 && tr2.selFrom === copy2.pos && await toolbarOpen(), { selFrom: tr2.selFrom });
  check(label + ' : suivi actif : la grille page de la copie suit (PDF et Word) ; celle de l\'original ne bouge pas', !!copy2 && !!orig2 && near(copy2.pageLeftPt - tm0.pageLeftPt, 5 * 0.75, 0.05) && near(copy2.pageTopPt - tm0.pageTopPt, 7.5, 0.05) && near(orig2.pageLeftPt, tm0.pageLeftPt, 0.02) && near(orig2.pageTopPt, tm0.pageTopPt, 0.02), { copie: copy2 && [copy2.pageLeftPt, copy2.pageTopPt], original: orig2 && [orig2.pageLeftPt, orig2.pageTopPt], avant: [tm0.pageLeftPt, tm0.pageTopPt] });
  await sleep(700);
  await page.keyboard.press('Control+z');
  await sleep(300);
  const tr3 = await traceState();
  check(label + ' : suivi actif : Ctrl+Z défait la rafale et sa trace d\'un coup (une seule image, sans marque, à sa place, rien en attente)', tr3.images.length === 1 && !tr3.images[0].deleted && !tr3.images[0].inserted && tr3.images[0].left === tm0.left && tr3.images[0].top === tm0.top && !tr3.pending, tr3);

  // Accepter garde la copie, refuser rend l'original (vrais clics sur « Tout accepter » et « Tout refuser »).
  await ensureSelected();
  await burst(['ArrowRight', 'ArrowRight', 'ArrowDown']);
  await clickBar('#v2-btn-accept-all');
  await sleep(350);
  const tr4 = await traceState();
  check(label + ' : suivi actif : « Tout accepter » garde la copie seule, à la nouvelle position', tr4.images.length === 1 && !tr4.images[0].inserted && !tr4.images[0].deleted && tr4.images[0].left === tm0.left + 2 && tr4.images[0].top === tm0.top + 1 && !tr4.pending, tr4);
  await ensureSelected();
  await burst(['ArrowLeft', 'ArrowLeft', 'ArrowLeft']);
  const tr5 = await traceState();
  check(label + ' : suivi actif : une nouvelle rafale laisse sa trace, l\'image d\'avant devient l\'original', tr5.images.length === 2 && tr5.deletions === 1 && tr5.insertions === 1 && (tr5.images.find(i => i.inserted) || {}).left === tm0.left - 1, tr5);
  await clickBar('#v2-btn-reject-all');
  await sleep(350);
  const tr6 = await traceState();
  check(label + ' : suivi actif : « Tout refuser » rend l\'original seul, à sa position d\'avant la rafale', tr6.images.length === 1 && !tr6.images[0].inserted && !tr6.images[0].deleted && tr6.images[0].left === tm0.left + 2 && tr6.images[0].top === tm0.top + 1 && !tr6.pending, tr6);

  // L'original barré ne bouge pas : sélectionné, la flèche garde son sens ordinaire (elle n'écrit rien).
  await ensureSelected();
  await burst(['ArrowRight', 'ArrowRight']);
  const sv0 = await traceState();
  const origin0 = sv0.images.find(i => i.deleted);
  if (origin0) await page.evaluate(pos => { const ed = EditorCore.getEditor(); ed.chain().focus().setNodeSelection(pos).run(); }, origin0.pos);
  await sleep(200);
  const txBefore = await page.evaluate(() => window.__docTx);
  await burst(['ArrowRight', 'ArrowDown']);
  const sv1 = await traceState();
  const txAfter = await page.evaluate(() => window.__docTx);
  check(label + ' : suivi actif : une flèche sur l\'original barré sélectionné ne déplace rien et n\'écrit rien', txAfter === txBefore && JSON.stringify(sv1.images.map(i => [i.left, i.top, i.deleted, i.inserted])) === JSON.stringify(sv0.images.map(i => [i.left, i.top, i.deleted, i.inserted])), { avant: sv0.images, apres: sv1.images, txBefore, txAfter });
  await clickBar('#v2-btn-reject-all');
  await sleep(350);

  // Contre le bord de la page, en suivi : la flèche est consommée mais rien ne s'écrit (ni suggestion de plus, ni étape d'historique).
  await ensureSelected();
  for (let i = 0; i < 30; i++) {
    const before = await page.evaluate(() => window.__docTx);
    await page.keyboard.press('Shift+ArrowUp');
    await sleep(60);
    if ((await page.evaluate(() => window.__docTx)) === before) break;
  }
  const edge0 = await traceState();
  const edgeTx0 = await page.evaluate(() => window.__docTx);
  await burst(['ArrowUp', 'ArrowUp']);
  const edge1 = await traceState();
  const edgeTx1 = await page.evaluate(() => window.__docTx);
  check(label + ' : suivi actif : contre le bord haut de la page, rien ne s\'écrit de plus (une seule trace, aucune étape de plus)', edge0.images.length === 2 && edge1.images.length === 2 && edge1.deletions === 1 && edge1.insertions === 1 && edgeTx1 === edgeTx0 && (edge0.images.find(i => i.inserted) || {}).top === (edge1.images.find(i => i.inserted) || {}).top && edge1.selImage, { avant: edge0.images, apres: edge1.images, edgeTx0, edgeTx1 });
  await clickBar('#v2-btn-reject-all');
  await sleep(350);
  await page.evaluate(() => Editor.setTrackChanges(false));

  // Image en calque dans une cellule de tableau : `left` et `top` se comptent depuis la cellule (son offsetParent), la grille page depuis le coin de la page.
  await page.evaluate(() => {
    const ed = EditorCore.getEditor();
    const c = document.createElement('canvas'); c.width = 160; c.height = 80;
    const g = c.getContext('2d'); g.fillStyle = '#e53935'; g.fillRect(0, 0, 160, 80);
    const src = c.toDataURL('image/png');
    Editor.setHTML('<p>Avant</p><table><tbody><tr><td><p>Cellule A</p></td><td><p>Cellule B</p></td></tr><tr><td><p>Cellule C</p></td><td><p>Cellule D</p></td></tr></tbody></table><p>Après</p>');
    let cellPos = null;
    ed.state.doc.descendants((n, p) => { if (n.type.name === 'paragraph' && n.textContent === 'Cellule B') cellPos = p + 1 + n.content.size; });
    ed.chain().focus().setTextSelection(cellPos).insertContent({ type: 'editorImage', attrs: { src, alt: '', width: '120px' } }).run();
    Editor.refreshLayout();
  });
  await sleep(400);
  check(label + ' : (tableau) la vraie souris sélectionne l\'image de la cellule', await selectImage());
  check(label + ' : (tableau) « devant le texte »', await clickToolbar('layer-front'));
  const w0 = await imageInfo();
  await press('ArrowRight');
  const w1 = await imageInfo();
  check(label + ' : (tableau) flèche droite : 1 px depuis la cellule, la grille page suit de 0,75 pt', w1.left === w0.left + 1 && w1.top === w0.top && near(w1.pageLeftPt - w0.pageLeftPt, 0.75, 0.02) && near(w1.pageTopPt, w0.pageTopPt, 0.02), { avant: [w0.left, w0.top, w0.pageLeftPt], apres: [w1.left, w1.top, w1.pageLeftPt] });
  await press('Shift+ArrowDown');
  const w2 = await imageInfo();
  check(label + ' : (tableau) Maj + flèche bas : 10 px, la grille page suit de 7,5 pt', w2.top === w1.top + 10 && near(w2.pageTopPt - w1.pageTopPt, 7.5, 0.05) && w2.domTop === w2.top, { avant: [w1.top, w1.pageTopPt], apres: [w2.top, w2.pageTopPt] });
}

await run('700x400', true);

// Témoin : panneau large, facteur 1. Le ResizeObserver de js/main.js recalcule --pp-fit-zoom au changement de taille.
await page.setViewportSize({ width: 1400, height: 1000 });
await sleep(900);
await run('1400x1000', false);

const tip = await page.evaluate(() => { const h = document.querySelector('.tiptap .editor-image-view .editor-image-move-handle'); return h && h.title; });
check('l\'infobulle de la poignée de déplacement annonce les flèches du clavier', /fl[eè]ches|arrow/i.test(tip || ''), tip);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
