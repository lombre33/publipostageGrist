#!/usr/bin/env node
// « Sur toutes les pages » (js/page-layer.js) à la vraie souris, à la taille du panneau Grist d'Antoine (~700x400, feuille réduite à ~0,85) : le bouton de la barre flottante d'une
// image derrière le texte coche puis décoche la case (HTML, bouton enfoncé, fond qui change), la barre entière reste dans le panneau avec ce bouton en plus, le curseur reste dans
// l'éditeur après le clic, la case survit aux flèches du clavier (la grille page suit, la case reste) et à un aller-retour par le HTML enregistré. Devant le texte ou dans le texte, le
// bouton est grisé (jamais retiré), son info-bulle dit pourquoi, et un clic dessus ne change rien ; revenue derrière le texte, l'image n'a pas retrouvé la case. En anglais, les
// textes sont ceux de l'anglais. Le PDF et le Word de cette case sont dans le groupe pageLayer (dev-tests/scenarios-page-layer.js).
// Fonctionnalité du 01/10 (la Fiche mission d'Antoine) : js/floating-toolbars.js (wireImageFloatingToolbar, bouton data-action="repeat"), js/page-layer.js.
// Lancé par run-headless.mjs (groupe Node "pageLayerMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-page-layer-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PAGE_LAYER_MOUSE_PORT || 8917);
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
if (!OFFLINE) console.log('[verify-page-layer-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol == null ? 1.5 : tol);
const r2 = v => Math.round(v * 100) / 100;

// Rectangle (pixels écran) d'un élément, ou null.
const rectOf = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
}, sel);
async function clickAt(x, y) { await page.mouse.move(x, y); await sleep(40); await page.mouse.down(); await sleep(40); await page.mouse.up(); await sleep(180); }
async function clickToolbar(action) {
  const c = await rectOf('.v2-floating-toolbar button[data-action="' + action + '"]');
  if (!c) return false;
  await clickAt(c.x, c.y);
  return true;
}
const REPEAT = '.v2-floating-toolbar button[data-action="repeat"]';
// État du bouton « Sur toutes les pages » lu sur la page : classes, aria, info-bulle, fond réellement peint.
const repeatState = () => page.evaluate(sel => {
  const b = document.querySelector(sel);
  if (!b) return null;
  return { active: b.classList.contains('is-active'), disabled: b.classList.contains('is-disabled'), ariaDisabled: b.getAttribute('aria-disabled'), pressed: b.getAttribute('aria-pressed'), title: b.title, bg: getComputedStyle(b).backgroundColor, opacity: getComputedStyle(b).opacity };
}, REPEAT);
const imageInfo = () => page.evaluate(() => {
  let info = null;
  EditorCore.getEditor().state.doc.descendants(node => {
    if (node.type.name !== 'editorImage' || info) return;
    const a = node.attrs;
    info = { layer: a.layer, repeat: a.repeat, pageIndex: a.pageIndex, pageLeftPt: a.pageLeftPt, pageTopPt: a.pageTopPt };
  });
  return info;
});
const selection = () => page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return { image: !!(s.node && s.node.type.name === 'editorImage') }; });
const html = () => page.evaluate(() => Editor.getHTML());
const focusInEditor = () => page.evaluate(() => EditorCore.getEditor().view.dom.contains(document.activeElement));
async function selectImage() {
  const c = await rectOf('.tiptap .editor-image-view img');
  await clickAt(c.x, c.y);
  return (await selection()).image;
}

// Document neuf : une image dans le texte (320 x 160) et des lignes dessous, Aperçu A4 actif, sans en-tête ni pied.
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

async function run(label) {
  await freshDocument();
  check(label + ' : un clic sur l\'image la sélectionne', await selectImage());
  check(label + ' : « dans le texte » : le bouton « Sur toutes les pages » est là, grisé, avec son pourquoi', await (async () => {
    const s = await repeatState();
    return !!s && s.disabled && s.ariaDisabled === 'true' && s.pressed === 'false' && s.title === (await page.evaluate(() => I18n.t('imgToolbar.repeatNeedsBehind')));
  })());

  check(label + ' : « derrière le texte » (barre flottante)', await clickToolbar('layer-behind'));
  const behind = await imageInfo();
  check(label + ' : l\'image est derrière le texte, sa grille page est capturée, la case est décochée', behind.layer === 'behind' && behind.repeat === false && Number.isFinite(behind.pageLeftPt) && Number.isFinite(behind.pageTopPt), behind);
  const s0 = await repeatState();
  if (!s0) { check(label + ' : la barre de l\'image a un bouton « Sur toutes les pages »', false); return; }
  check(label + ' : derrière le texte : le bouton est actif (non grisé), pas enfoncé, son info-bulle est « Sur toutes les pages »', !!s0 && !s0.disabled && s0.ariaDisabled === 'false' && s0.pressed === 'false' && s0.title === 'Sur toutes les pages', s0);

  // La barre entière tient dans le panneau avec ce bouton en plus.
  const bar = await page.evaluate(sel => { const t = document.querySelector(sel).closest('.v2-floating-toolbar'); const b = t.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, vw: innerWidth, vh: innerHeight }; }, REPEAT);
  check(label + ' : la barre de l\'image tient dans le panneau (' + Math.round(bar.left) + ' à ' + Math.round(bar.right) + ' sur ' + bar.vw + ')', bar.left >= 0 && bar.right <= bar.vw && bar.top >= 0 && bar.bottom <= bar.vh, bar);
  const btnRect = await rectOf(REPEAT);
  const neighbour = await rectOf('.v2-floating-toolbar button[data-action="layer-behind"]');
  check(label + ' : le bouton est visible, de la taille de ses voisins, dans la barre', !!btnRect && !!neighbour && Math.abs(btnRect.w - neighbour.w) < 1 && Math.abs(btnRect.h - neighbour.h) < 1 && btnRect.w > 0 && btnRect.right <= bar.right, { bouton: btnRect, voisin: neighbour });

  // Un vrai clic coche la case.
  await clickAt(btnRect.x, btnRect.y);
  const on = await repeatState();
  const onInfo = await imageInfo();
  const onHtml = await html();
  check(label + ' : un clic coche la case : HTML, modèle et bouton enfoncé d\'accord', /data-repeat="true"/.test(onHtml) && onInfo.repeat === true && !!on && on.active && on.pressed === 'true', { html: /data-repeat="true"/.test(onHtml), onInfo, on });
  check(label + ' : le fond du bouton enfoncé est différent de celui du bouton au repos', !!on && !!s0 && on.bg !== s0.bg, { repos: s0 && s0.bg, enfonce: on && on.bg });
  check(label + ' : l\'image reste sélectionnée et le curseur dans l\'éditeur', (await selection()).image && await focusInEditor());
  check(label + ' : la case ne déplace pas l\'image (même grille page)', onInfo.pageIndex === behind.pageIndex && onInfo.pageLeftPt === behind.pageLeftPt && onInfo.pageTopPt === behind.pageTopPt, { avant: behind, apres: onInfo });

  // Les flèches du clavier déplacent l'image cochée : la case reste, la grille page suit.
  await page.keyboard.press('ArrowRight'); await sleep(250);
  const moved = await imageInfo();
  check(label + ' : une flèche déplace l\'image cochée de 0,75 pt et la case reste cochée', moved.repeat === true && Math.abs(moved.pageLeftPt - onInfo.pageLeftPt - 0.75) < 0.02 && moved.pageTopPt === onInfo.pageTopPt, { avant: onInfo, apres: moved });

  // Aller-retour par le HTML enregistré.
  const saved = await html();
  await page.evaluate(h => { Editor.setHTML(h); Editor.refreshLayout(); }, saved);
  await sleep(400);
  const back = await imageInfo();
  check(label + ' : rechargée depuis le HTML enregistré, l\'image est toujours cochée, à la même place', !!back && back.repeat === true && back.layer === 'behind' && back.pageLeftPt === moved.pageLeftPt && back.pageTopPt === moved.pageTopPt, { moved, back });
  await selectImage();

  // Un second clic décoche.
  const r1 = await rectOf(REPEAT);
  await clickAt(r1.x, r1.y);
  const off = await repeatState();
  check(label + ' : un second clic décoche : plus de data-repeat, bouton au repos', !/data-repeat/.test(await html()) && (await imageInfo()).repeat === false && !!off && !off.active && off.pressed === 'false', off);

  // Devant le texte : grisé, un clic ne change rien.
  await clickToolbar('layer-behind');
  const r2b = await rectOf(REPEAT);
  await clickAt(r2b.x, r2b.y);
  check(label + ' : derrière le texte, un clic recoche la case', (await imageInfo()).repeat === true);
  check(label + ' : « devant le texte » (barre flottante) efface la case', await clickToolbar('layer-front') && (await imageInfo()).repeat === false && !/data-repeat/.test(await html()));
  const frontState = await repeatState();
  const htmlBefore = await html();
  const r3 = await rectOf(REPEAT);
  await clickAt(r3.x, r3.y);
  const frontAfter = await repeatState();
  check(label + ' : devant le texte : le bouton est grisé, dit pourquoi, et un clic dessus ne change rien', !!frontState && frontState.disabled && frontState.title === (await page.evaluate(() => I18n.t('imgToolbar.repeatNeedsBehind'))) && frontAfter.disabled && (await html()) === htmlBefore && (await selection()).image, { frontState, frontAfter });
  await clickToolbar('layer-behind');
  check(label + ' : revenue derrière le texte, l\'image n\'a pas retrouvé la case', (await imageInfo()).repeat === false && !(await repeatState()).active);
}

await run('700x400');

// Anglais : les textes du bouton.
await page.evaluate(() => I18n.setLang('en'));
await sleep(300);
await freshDocument();
await selectImage();
await clickToolbar('layer-behind');
const enOk = await repeatState();
await clickToolbar('layer-front');
const enGrey = await repeatState();
check('en anglais : « On every page » derrière le texte, la raison en anglais devant le texte', !!enOk && enOk.title === 'On every page' && !!enGrey && enGrey.disabled && enGrey.title === 'On every page (for an image behind the text)', { enOk, enGrey });
await page.evaluate(() => I18n.setLang('fr'));

// Témoin : panneau large, facteur 1.
await page.setViewportSize({ width: 1400, height: 1000 });
await sleep(900);
await run('1400x1000');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
