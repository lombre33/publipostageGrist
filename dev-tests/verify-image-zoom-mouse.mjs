#!/usr/bin/env node
// Gestes sur une image à la taille du panneau Grist d'Antoine (~700x400), vraie souris pour tout : la feuille A4 y est réduite à ~0,85 (--pp-fit-zoom), donc un
// pixel de souris et un pixel de getBoundingClientRect ne valent plus un pixel de mise en page (`left`, `top`, `width` d'une image).
// Bug corrigé (01/10) : js/editor-nodes.js (redimensionner, déplacer) et js/floating-toolbars.js (à gauche / au centre / à droite d'une image en calque, premier
// passage en calque) additionnaient des pixels écran à des pixels de mise en page. À 700 px : agrandir une image de 100 px la RÉTRÉCISSAIT, la glisser de 100 px ne la
// déplaçait que de 85, « à droite » la faisait déborder de 42 px sur la marge, « devant le texte » la décalait en haut à gauche au premier clic. Aucun test ne le voyait :
// les scénarios de dev-tests/ tournent à 1400x1000, feuille à sa taille réelle (facteur 1), et dispatchEvent ne passe pas par la vraie souris.
// Même parcours rejoué à 1400x1000 (facteur 1) en témoin : rien ne doit y changer.
// Suivi des modifications actif (choix d'Antoine, 01/10 : « le déplacement d'une image laisse une trace, quel que soit le mode de déplacement ») : glisser l'image laisse l'original barré
// à sa place et pose la copie à la nouvelle position (suppression + insertion suggérées), resélectionnée ; un simple clic sur l'image sélectionnée ne laisse rien ; glisser la copie la
// déplace en place ; l'original barré ne se glisse pas ; accepter garde la copie, refuser rend l'original (même parcours aux flèches : dev-tests/verify-image-arrows-keyboard.mjs).
// Lancé par run-headless.mjs (groupe Node "imageZoomMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-image-zoom-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.IMAGE_ZOOM_MOUSE_PORT || 8914);
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-image-zoom-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Rectangle (pixels écran) de l'image, de son wrapper de NodeView et de la zone de texte (bord du contenu, marges de page déduites).
const geometry = () => page.evaluate(() => {
  const view = document.querySelector('.tiptap .editor-image-view');
  const img = view.querySelector('img');
  const r = img.getBoundingClientRect();
  const tip = EditorCore.getEditor().view.dom;
  const tr = tip.getBoundingClientRect();
  const cs = getComputedStyle(tip);
  const sheet = tip.closest('.v2-page-sheet');
  const zoom = parseFloat(getComputedStyle(sheet).zoom) || 1;
  const textLeft = tr.left + (parseFloat(cs.paddingLeft) || 0) * zoom;
  const textRight = tr.left + (tip.clientWidth - (parseFloat(cs.paddingRight) || 0)) * zoom;
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, zoom, textLeft, textRight, layer: view.getAttribute('data-layer') || (EditorCore.getEditor().state.doc.firstChild && null) };
});
const imageAttrs = () => page.evaluate(() => {
  let attrs = null;
  EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'editorImage' && !attrs) attrs = { layer: node.attrs.layer, width: node.attrs.width, left: node.attrs.left, top: node.attrs.top, align: node.attrs.align }; });
  return attrs;
});
// Centre d'un élément (pixels écran), après l'avoir ramené dans la fenêtre : le panneau fait 400 px de haut.
const centerOf = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
}, sel);

// Ce que la souris toucherait vraiment au centre de `c` : la poignée cherchée, pas la barre flottante ni le bord de la fenêtre.
const hit = (c, sel) => page.evaluate(({ x, y, sel }) => { const el = document.elementFromPoint(x, y); return !!el && !!el.closest(sel); }, { x: c.x, y: c.y, sel });

async function clickAt(x, y) { await page.mouse.move(x, y); await sleep(40); await page.mouse.down(); await sleep(40); await page.mouse.up(); await sleep(180); }
async function dragBy(from, dx, dy) {
  await page.mouse.move(from.x, from.y); await sleep(60);
  await page.mouse.down(); await sleep(60);
  const steps = 10;
  for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + dx * i / steps, from.y + dy * i / steps); await sleep(12); }
  await sleep(60);
  await page.mouse.up(); await sleep(250);
}
async function clickToolbar(action) {
  const c = await centerOf('.v2-floating-toolbar button[data-action="' + action + '"]');
  if (!c) return false;
  await clickAt(c.x, c.y);
  return true;
}
async function selectImage() {
  const c = await centerOf('.tiptap .editor-image-view img');
  await clickAt(c.x, c.y);
  return page.evaluate(() => { const n = EditorCore.getEditor().state.selection.node; return !!n && n.type.name === 'editorImage'; });
}
// Centre d'une poignée que la souris touche vraiment. La pastille du zoom (js/page-zoom.js) est fixe en bas à droite du panneau et, à 700x400, recouvre la poignée en bas à droite
// d'une image agrandie : on fait alors défiler le document à la vraie molette, comme le ferait Antoine, jusqu'à ce que la poignée soit dégagée.
async function reachableHandle(sel, handleSel) {
  let c = await centerOf(sel);
  for (let i = 0; i < 8 && c && !(await hit(c, handleSel)); i++) {
    await page.mouse.move(120, 200);
    await page.mouse.wheel(0, 60);
    await sleep(200);
    c = await centerOf(sel);
  }
  return c;
}

// Nombre de transactions qui changent le document (un simple clic sur l'image ne doit en produire aucune).
await page.evaluate(() => {
  window.__docTx = 0;
  EditorCore.getEditor().on('transaction', ({ transaction }) => { if (transaction.docChanged) window.__docTx++; });
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
    images.push({ pos, left: node.attrs.left, top: node.attrs.top, deleted: marks.includes('deletion'), inserted: marks.includes('insertion'), domLeft: dom && parseFloat(dom.style.left), domTop: dom && parseFloat(dom.style.top) });
  });
  const s = ed.state.selection;
  return { images, deletions, insertions, selFrom: s.from, selImage: !!(s.node && s.node.type.name === 'editorImage'), pending: TrackChanges.hasPendingSuggestions(ed.state), tx: window.__docTx };
});
const toolbarOpen = () => page.evaluate(() => { const b = document.querySelector('.v2-floating-toolbar button[data-action="zoom-in"]'); return !!b && b.closest('.v2-floating-toolbar').classList.contains('visible'); });

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

// Le même parcours à la souris, rejoué à chaque taille de panneau. `tol` : tolérance en pixels écran (un pixel de mise en page arrondi vaut au plus ~1,2 px écran).
async function gestures(label, expectZoomBelowOne) {
  await freshDocument();
  const g0 = await geometry();
  if (expectZoomBelowOne) check(label + ' : la feuille est réduite (facteur d\'ajustement < 1)', g0.zoom > 0.8 && g0.zoom < 0.9, g0.zoom);
  else check(label + ' : la feuille est à sa taille (facteur 1)', g0.zoom === 1, g0.zoom);

  check(label + ' : un clic sur l\'image la sélectionne', await selectImage());

  // 1) Premier passage en calque : l'image ne doit pas bouger.
  const beforeLayer = await geometry();
  check(label + ' : la barre flottante de l\'image offre « devant le texte »', await clickToolbar('layer-front'));
  const afterLayer = await geometry();
  const attrsLayer = await imageAttrs();
  check(label + ' : « devant le texte » met l\'image en calque', !!attrsLayer && attrsLayer.layer === 'front', attrsLayer);
  check(label + ' : « devant le texte » ne déplace pas l\'image (écart écran ≤ 1,5 px)', near(afterLayer.left, beforeLayer.left) && near(afterLayer.top, beforeLayer.top), { avant: [r2(beforeLayer.left), r2(beforeLayer.top)], apres: [r2(afterLayer.left), r2(afterLayer.top)] });

  // 2) Glisser la poignée de déplacement de 100 px vers la droite et 20 px vers le haut : l'image doit suivre le pointeur (et rester dans les 400 px de la fenêtre,
  //    poignées comprises : la souris ne peut pas les saisir au-delà).
  const handle = await centerOf('.tiptap .editor-image-view .editor-image-move-handle');
  check(label + ' : la poignée de déplacement est là', !!handle && await hit(handle, '.editor-image-move-handle'), handle);
  await dragBy(handle, 100, -20);
  const afterMove = await geometry();
  check(label + ' : glisser de (100, -20) px déplace l\'image de (100, -20) px à l\'écran', near(afterMove.left - afterLayer.left, 100) && near(afterMove.top - afterLayer.top, -20),
    { dx: r2(afterMove.left - afterLayer.left), dy: r2(afterMove.top - afterLayer.top) });
  check(label + ' : glisser ne change pas la taille', near(afterMove.width, afterLayer.width, 0.6) && near(afterMove.height, afterLayer.height, 0.6), { avant: afterLayer.width, apres: afterMove.width });

  // 3) Agrandir par la poignée en bas à droite : +100 px de souris = +100 px de largeur à l'écran, le ratio ne bouge pas.
  await selectImage();
  const se = await centerOf('.tiptap .editor-image-view .editor-image-handle-se');
  check(label + ' : la poignée en bas à droite est là, sous la souris', !!se && await hit(se, '.editor-image-handle-se'), se);
  await dragBy(se, 100, 0);
  const afterGrow = await geometry();
  check(label + ' : tirer la poignée de 100 px vers la droite agrandit l\'image de 100 px à l\'écran', near(afterGrow.width - afterMove.width, 100), { avant: r2(afterMove.width), apres: r2(afterGrow.width) });
  check(label + ' : le ratio est conservé (hauteur / largeur = 0,5)', near(afterGrow.height / afterGrow.width, 0.5, 0.01), r2(afterGrow.height / afterGrow.width));
  check(label + ' : le coin haut gauche ne bouge pas pendant l\'agrandissement', near(afterGrow.left, afterMove.left) && near(afterGrow.top, afterMove.top), { avant: [r2(afterMove.left), r2(afterMove.top)], apres: [r2(afterGrow.left), r2(afterGrow.top)] });

  // 4) Rétrécir de 60 px (la poignée, agrandie de 100 px plus haut, peut maintenant se trouver sous la pastille du zoom : voir reachableHandle).
  await selectImage();
  const se2 = await reachableHandle('.tiptap .editor-image-view .editor-image-handle-se', '.editor-image-handle-se');
  await dragBy(se2, -60, 0);
  const afterShrink = await geometry();
  check(label + ' : tirer la poignée de 60 px vers la gauche rétrécit l\'image de 60 px à l\'écran', near(afterShrink.width - afterGrow.width, -60), { avant: r2(afterGrow.width), apres: r2(afterShrink.width) });

  // 5) À droite, au centre, à gauche : les bords de l'image tombent sur ceux de la zone de texte.
  await selectImage();
  await clickToolbar('align-right');
  const right = await geometry();
  check(label + ' : « à droite » colle l\'image au bord droit du texte', near(right.right, right.textRight), { image: r2(right.right), texte: r2(right.textRight) });
  await selectImage();
  await clickToolbar('align-center');
  const center = await geometry();
  check(label + ' : « au centre » centre l\'image sur la zone de texte', near((center.left + center.right) / 2, (center.textLeft + center.textRight) / 2), { image: r2((center.left + center.right) / 2), texte: r2((center.textLeft + center.textRight) / 2) });
  await selectImage();
  await clickToolbar('align-left');
  const left = await geometry();
  check(label + ' : « à gauche » colle l\'image au bord gauche du texte', near(left.left, left.textLeft), { image: r2(left.left), texte: r2(left.textLeft) });
}

// Le même glisser, suivi des modifications actif.
async function suiviGestures(label) {
  await freshDocument();
  check(label + ' : (suivi) un clic sur l\'image la sélectionne', await selectImage());
  check(label + ' : (suivi) « devant le texte » met l\'image en calque', await clickToolbar('layer-front'));
  await page.evaluate(() => Editor.setTrackChanges(true));
  await sleep(700);
  const g0 = await geometry();
  const s0 = await traceState();
  const a0 = s0.images[0];

  // Un simple clic sur l'image déjà sélectionnée n'est pas un déplacement : aucune écriture, aucune trace.
  await selectImage();
  const s1 = await traceState();
  check(label + ' : (suivi) un simple clic sur l\'image sélectionnée ne laisse aucune trace (une image sans marque, aucune étape, rien en attente)', s1.images.length === 1 && !s1.images[0].deleted && !s1.images[0].inserted && s1.tx === s0.tx && !s1.pending && s1.images[0].left === a0.left && s1.images[0].top === a0.top, { avant: s0, apres: s1 });

  // Glisser la poignée de déplacement de 100 px vers la droite et 20 px vers le haut (pixels écran).
  const handle = await centerOf('.tiptap .editor-image-view .editor-image-move-handle');
  await dragBy(handle, 100, -20);
  const s2 = await traceState();
  const orig = s2.images.find(i => i.deleted);
  const copy = s2.images.find(i => i.inserted);
  check(label + ' : (suivi) glisser laisse deux images, l\'original en suppression suggérée et la copie en insertion suggérée', s2.images.length === 2 && !!orig && !!copy && s2.deletions === 1 && s2.insertions === 1 && s2.pending, s2);
  check(label + ' : (suivi) l\'original reste barré à sa place, DOM compris', !!orig && orig.left === a0.left && orig.top === a0.top && orig.domLeft === a0.left && orig.domTop === a0.top, { original: orig, avant: [a0.left, a0.top] });
  check(label + ' : (suivi) la copie suit le pointeur de (100, -20) px écran, soit (100, -20) / facteur px de mise en page', !!copy && near(copy.left - a0.left, 100 / g0.zoom, 1.5) && near(copy.top - a0.top, -20 / g0.zoom, 1.5) && copy.domLeft === copy.left && copy.domTop === copy.top, { copie: copy, avant: [a0.left, a0.top], zoom: r2(g0.zoom) });
  check(label + ' : (suivi) la copie est resélectionnée, la barre flottante de l\'image est ouverte', !!copy && s2.selImage && s2.selFrom === copy.pos && await toolbarOpen(), { selFrom: s2.selFrom, copie: copy && copy.pos });

  // Glisser la copie : elle se déplace en place, sans empiler une seconde trace.
  const handle2 = await centerOf('.tiptap ins .editor-image-view .editor-image-move-handle');
  check(label + ' : (suivi) la poignée de la copie est là, sous la souris', !!handle2 && await hit(handle2, '.editor-image-move-handle'), handle2);
  await dragBy(handle2, -40, 30);
  const s3 = await traceState();
  const copy3 = s3.images.find(i => i.inserted);
  check(label + ' : (suivi) glisser la copie la déplace en place : toujours une seule trace (une suppression, une insertion)', s3.images.length === 2 && s3.deletions === 1 && s3.insertions === 1 && !!copy3 && near(copy3.left - copy.left, -40 / g0.zoom, 1.5) && near(copy3.top - copy.top, 30 / g0.zoom, 1.5) && s3.selImage && s3.selFrom === copy3.pos, { avant: copy, apres: copy3, s3 });

  // L'original barré ne se glisse pas : le geste ne change rien.
  const originalHandle = await centerOf('.tiptap del .editor-image-view .editor-image-move-handle');
  const reachable = !!originalHandle && await hit(originalHandle, '.editor-image-move-handle');
  check(label + ' : (suivi) la poignée de l\'original barré est atteignable à la souris', reachable, originalHandle);
  const txBefore = await page.evaluate(() => window.__docTx);
  if (reachable) await dragBy(originalHandle, 30, 30);
  const s4 = await traceState();
  const orig4 = s4.images.find(i => i.deleted);
  check(label + ' : (suivi) glisser l\'original barré ne le déplace pas et n\'écrit rien', !!orig4 && orig4.left === a0.left && orig4.top === a0.top && orig4.domLeft === a0.left && orig4.domTop === a0.top && s4.images.length === 2 && s4.deletions === 1 && s4.insertions === 1 && s4.tx === txBefore, { original: orig4, avant: [a0.left, a0.top], tx: [txBefore, s4.tx] });

  // Accepter garde la copie, refuser rend l'original (vrais clics sur « Tout refuser » puis « Tout accepter »).
  await page.click('#v2-btn-reject-all');
  await sleep(350);
  const s5 = await traceState();
  check(label + ' : (suivi) « Tout refuser » rend l\'original seul, à sa position d\'avant le glisser', s5.images.length === 1 && !s5.images[0].deleted && !s5.images[0].inserted && s5.images[0].left === a0.left && s5.images[0].top === a0.top && !s5.pending, s5);
  check(label + ' : (suivi) un clic sur l\'image la sélectionne de nouveau', await selectImage());
  const handle3 = await centerOf('.tiptap .editor-image-view .editor-image-move-handle');
  await dragBy(handle3, 60, 10);
  const s6 = await traceState();
  const copy6 = s6.images.find(i => i.inserted);
  await page.click('#v2-btn-accept-all');
  await sleep(350);
  const s7 = await traceState();
  check(label + ' : (suivi) « Tout accepter » garde la copie seule, à la nouvelle position', !!copy6 && s7.images.length === 1 && !s7.images[0].deleted && !s7.images[0].inserted && s7.images[0].left === copy6.left && s7.images[0].top === copy6.top && !s7.pending, { copie: copy6, apres: s7 });
  await page.evaluate(() => Editor.setTrackChanges(false));
}

await gestures('700x400', true);
await suiviGestures('700x400');

// Témoin : panneau large, facteur 1. Le ResizeObserver de js/main.js recalcule --pp-fit-zoom au changement de taille.
await page.setViewportSize({ width: 1400, height: 1000 });
await sleep(900);
await gestures('1400x1000', false);
await suiviGestures('1400x1000');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
