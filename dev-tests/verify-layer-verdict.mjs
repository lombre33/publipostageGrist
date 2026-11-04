#!/usr/bin/env node
// La relecture des images en calque à l'ouverture d'un modèle (HeaderFooterPreview.reconcileLayerImagesWithGrid) relit le `top` de celles des pages 2 et suivantes sur la pagination de la page
// à l'échelle 1 (EditorCore.pageScale) : deux recalculs de tout le document, ≈ 0,4 s sur « Présentation commerciale », pour ne rien trouver à corriger dans un modèle enregistré depuis les
// feuilles à taille réelle. Antoine (04/11) : « Seulement si le modèle a changé ». Le verdict « relu, rien à corriger » se garde donc par personne (PersonStore, clé `pp_layer_checks`, une
// courte liste de signatures, jamais le contenu d'un modèle), et ne vaut que pour le même texte, la même page, le même en-tête et pied, la même version de l'app (les `?v=` de js/ et css/), la
// même densité d'écran et le même navigateur. Ce que cet essai tient :
//  - un modèle dont le `top` d'une image de la page 2 est périmé est corrigé à chaque ouverture (une fenêtre à l'échelle 1) et ne laisse aucun verdict ;
//  - le même modèle, à jour : la première ouverture mesure et garde le verdict, la deuxième n'ouvre plus aucune fenêtre et le texte enregistré est le même, à cinq tailles de panneau ;
//  - un texte changé, une autre page (format), un en-tête posé ou une autre version de l'app font relire ; la page, l'en-tête ou la version d'avant, revenus, retrouvent leur verdict ;
//  - un modèle d'avant la grille de page (images de la page 1 sans grille) : la migration silencieuse garde sa propre fenêtre, la relecture passe sur son verdict à la deuxième ouverture ;
//  - une page rechargée retrouve les verdicts (stockage du navigateur) ; la liste reste à quarante signatures au plus, les plus récentes.
// Avant le correctif, chaque ouverture ouvrait la fenêtre à l'échelle 1 : les cas « sans fenêtre » échouent sur l'ancien code.
// Lancé par run-headless.mjs (groupe Node "layerVerdict", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-layer-verdict.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.LAYER_VERDICT_PORT || 9174);

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
    if (urlPath === '/__verdict-parent.html') { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); res.end(PARENT); return; }
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
if (!OFFLINE) console.log('[verify-layer-verdict] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

await page.goto(`${BASE}/__verdict-parent.html`, { waitUntil: 'load' });
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
// --- Le texte d'essai : trente paragraphes, deux images en calque sur la page 1 (avec leur grille de page) et sur la page 2 une image « Devant le texte » dont le `top` enregistré n'est plus celui
// de sa grille (un modèle d'avant les feuilles à taille réelle). Un modèle d'avant la grille de page, lui (images de la page 1 sans grille), est essayé à part : la migration silencieuse ouvre sa
// propre fenêtre à l'échelle 1 avant la relecture.
const lorem = '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>';
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const layered = (attrs, style) => `<img class="editor-image" src="${GIF}" alt="x" style="width: 120px; position: absolute; ${style}" data-layer="${attrs.layer}" data-wrap="inline"${attrs.grid || ''}>`;
const STALE = '<p>Début ' + layered({ layer: 'front', grid: ' data-page-index="0" data-page-left-pt="99.75" data-page-top-pt="57.75"' }, 'left: 133px; top: 77px; z-index: 5') + '</p>' + lorem + lorem
  + '<p>Milieu ' + layered({ layer: 'behind', grid: ' data-page-index="0" data-page-left-pt="233.25" data-page-top-pt="142.5"' }, 'left: 311px; top: 190px; z-index: -1') + '</p>'
  + Array.from({ length: 28 }, () => lorem).join('') + '<p>Page 2 ' + layered({ layer: 'front', grid: ' data-page-index="1" data-page-left-pt="60.5" data-page-top-pt="40.25"' }, 'left: 81px; top: 20px; z-index: 5') + '</p>' + lorem;

// Les fenêtres à l'échelle 1 que la relecture ouvre (EditorCore.pageScale(...).measure), comptées depuis la dernière remise à zéro.
await frame.evaluate(() => {
  window.__windows = 0;
  const original = EditorCore.pageScale;
  EditorCore.pageScale = function (...args) {
    const scale = original.apply(this, args);
    const measure = scale.measure;
    scale.measure = function (fn) { window.__windows += 1; return measure.call(this, fn); };
    return scale;
  };
});
const verdicts = () => frame.evaluate(() => { try { return JSON.parse(PersonStore.get('pp_layer_checks') || '[]'); } catch (e) { return null; } });
const forget = () => frame.evaluate(() => PersonStore.remove('pp_layer_checks'));
const windowsFor = async (html, wait = 900) => {
  await frame.evaluate(() => { window.__windows = 0; });
  await frame.evaluate(x => Editor.setHTML(x), html);
  await sleep(wait);
  return frame.evaluate(() => window.__windows);
};
// Le `top` que le document garde pour chaque image en calque (ce que l'enregistrement écrit), dans l'ordre du texte.
const imageTops = () => frame.evaluate(() => {
  const tops = [];
  EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'editorImage' && node.attrs.layer !== 'normal') tops.push(node.attrs.top); });
  return tops;
});

check('Aperçu A4 actif d\'office', await frame.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview')));
await forget();
check('aucun verdict au départ', JSON.stringify(await verdicts()) === '[]', await verdicts());

// 1) Un modèle d'avant les feuilles à taille réelle : la relecture le corrige à chaque ouverture, et ne garde aucun verdict (rien n'était « à jour »).
let windows = await windowsFor(STALE);
const stale1 = await frame.evaluate(() => Editor.getHTML());
check('un modèle dont l\'image de la page 2 a un `top` périmé : la relecture ouvre sa fenêtre à l\'échelle 1 et corrige le `top`', windows === 1 && /data-page-index="1"/.test(stale1) && !/top: 20px/.test(stale1.match(/<img[^>]*data-page-index="1"[^>]*>/)[0]), { windows, image: (stale1.match(/<img[^>]*data-page-index="1"[^>]*>/) || [''])[0].replace(/src="[^"]*"/, 'src=…') });
check('un modèle qui a eu besoin d\'une correction ne laisse aucun verdict', (await verdicts()).length === 0, await verdicts());
const H1 = stale1;

// 2) Le même modèle, déjà corrigé (celui que l'enregistrement a écrit) : la première ouverture mesure et garde le verdict, les suivantes ne mesurent plus.
await forget();
windows = await windowsFor(H1);
check('modèle à jour, première ouverture : la relecture mesure (une fenêtre à l\'échelle 1), sans rien corriger', windows === 1 && (await frame.evaluate(() => Editor.getHTML())) === H1, { windows });
check('elle garde un verdict, une seule signature', (await verdicts()).length === 1, await verdicts());
const tops = await imageTops();
check('le texte d\'essai a ses trois images en calque, dont celle de la page 2 posée là où sa grille la veut (pas à 20 px)', tops.length === 3 && tops[2] > 100, tops);
windows = await windowsFor(H1);
check('modèle à jour, deuxième ouverture : aucune fenêtre à l\'échelle 1, le texte enregistré est le même', windows === 0 && (await frame.evaluate(() => Editor.getHTML())) === H1 && JSON.stringify(await imageTops()) === JSON.stringify(tops), { windows, tops, now: await imageTops() });
check('le verdict n\'a pas grandi', (await verdicts()).length === 1, await verdicts());

// 3) Ce que la taille du panneau ne change pas : le verdict gardé vaut à toute taille, et le texte enregistré est le même à chacune.
const SIZES = [[420, 400], [560, 400], [1000, 600], [1400, 900], [700, 400]];
const sizeProblems = [];
for (const [w, h] of SIZES) {
  await setSize(w, h);
  const count = await windowsFor(H1, 700);
  const now = await imageTops();
  if (count !== 0 || (await frame.evaluate(() => Editor.getHTML())) !== H1 || JSON.stringify(now) !== JSON.stringify(tops)) sizeProblems.push({ taille: w + 'x' + h, fenetres: count, tops: now });
}
check('à cinq tailles de panneau, le modèle à jour s\'ouvre sans fenêtre à l\'échelle 1 et s\'enregistre à l\'identique', sizeProblems.length === 0, sizeProblems);

// 4) Le modèle change : relecture, et un verdict de plus.
windows = await windowsFor(H1.replace('</p>', '</p><p>Un paragraphe de plus</p>'));
check('modèle changé (un paragraphe de plus) : la relecture mesure de nouveau', windows === 1, { windows });
check('et garde un second verdict', (await verdicts()).length === 2, await verdicts());
windows = await windowsFor(H1);
check('le texte d\'avant, revenu, a gardé son verdict : pas de fenêtre', windows === 0, { windows });

// 5) Un modèle qui a besoin d'une correction n'est jamais passé : ni verdict, ni ouverture sans mesure, toutes les fois.
let again = 0;
for (let i = 0; i < 2; i++) again += await windowsFor(STALE, 700);
check('le modèle au `top` périmé rouvert deux fois : la fenêtre s\'ouvre à chaque fois, et il ne laisse toujours aucun verdict de plus', again === 2 && (await verdicts()).length === 2, { again, verdicts: (await verdicts()).length });

// 6) La page du modèle change (format, marges) : la relecture mesure ; revenue, le verdict d'avant vaut encore.
const page0 = await frame.evaluate(() => PageLayout.snapshot());
await frame.evaluate(() => PageLayout.setFormat('A5'));
await sleep(500);
windows = await windowsFor(H1);
check('autre format de page (A5) : la relecture mesure de nouveau', windows === 1, { windows });
await frame.evaluate(p => PageLayout.setMarginsMm(p), page0);
await sleep(500);
windows = await windowsFor(H1);
check('la page d\'avant revenue : le verdict d\'avant vaut encore (pas de fenêtre)', windows === 0, { windows, page0, now: await frame.evaluate(() => PageLayout.snapshot()) });

// 7) L'en-tête et le pied changent : la relecture mesure ; revenus, le verdict d'avant vaut encore.
await frame.evaluate(() => Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '<p>Haut de page</p>', first: '' }, footer: { default: '', first: '' } }));
windows = await windowsFor(H1);
check('avec un en-tête, la relecture mesure de nouveau', windows === 1, { windows });
await frame.evaluate(() => Editor.setHeaderFooterData(null));
windows = await windowsFor(H1);
check('l\'en-tête retiré, le verdict d\'avant vaut encore (pas de fenêtre)', windows === 0, { windows });

// 8) Le verdict est gardé par la personne : une page rechargée le retrouve ; une autre version de l'app (la version d'un fichier de js/ ou de css/) ne s'y fie pas.
let bump = false;
await page.route('**/_test-harness.html', async (route) => {
  const response = await route.fetch();
  let body = await response.text();
  if (bump) body = body.replace(/(js\/page-layout\.js\?v=)([0-9.]+)/, (all, prefix, version) => prefix + version + '9');
  await route.fulfill({ response, body });
});
const reload = async () => {
  await page.reload({ waitUntil: 'load' });
  frame = null;
  for (let i = 0; i < 300 && !frame; i++) { frame = page.frames().find(f => f !== page.mainFrame() && /_test-harness/.test(f.url())); if (!frame) await sleep(100); }
  await frame.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await frame.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  await frame.evaluate(() => {
    window.__windows = 0;
    const original = EditorCore.pageScale;
    EditorCore.pageScale = function (...args) {
      const scale = original.apply(this, args);
      const measure = scale.measure;
      scale.measure = function (fn) { window.__windows += 1; return measure.call(this, fn); };
      return scale;
    };
  });
};
const before = (await verdicts()).length;
await reload();
check('page rechargée : les verdicts gardés sont retrouvés', (await verdicts()).length === before && before >= 2, { before, now: (await verdicts()).length });
windows = await windowsFor(H1);
check('page rechargée : le modèle à jour s\'ouvre sans fenêtre à l\'échelle 1', windows === 0, { windows });
bump = true;
await reload();
windows = await windowsFor(H1);
check('une autre version de l\'app (la version de js/page-layout.js a changé) : la relecture mesure de nouveau', windows === 1, { windows });
check('et garde un verdict de plus', (await verdicts()).length === before + 1, { before, now: (await verdicts()).length });
bump = false;
await reload();
windows = await windowsFor(H1);
check('la version d\'avant revenue : son verdict vaut encore (pas de fenêtre)', windows === 0, { windows });

// 9) Un modèle d'avant la grille de page (images de la page 1 sans grille) : la migration silencieuse les range et ouvre sa propre fenêtre, que le verdict ne concerne pas ; la relecture des
// images de la page 2, elle, passe sur son verdict à la deuxième ouverture, et le texte enregistré est le même.
const LEGACY = H1.replace(/ data-page-index="0" data-page-left-pt="[^"]*" data-page-top-pt="[^"]*"/g, '');
check('le texte d\'essai « d\'avant la grille » n\'a plus de grille sur la page 1', LEGACY !== H1 && !/data-page-index="0"/.test(LEGACY) && /data-page-index="1"/.test(LEGACY));
await forget();
windows = await windowsFor(LEGACY);
const legacy1 = await frame.evaluate(() => Editor.getHTML());
check('modèle d\'avant la grille, première ouverture : la migration et la relecture ouvrent chacune leur fenêtre', windows === 2, { windows });
check('la migration a posé la grille de la page 1', /data-page-index="0"/.test(legacy1));
check('la relecture, qui n\'a rien eu à corriger, a gardé son verdict', (await verdicts()).length === 1, await verdicts());
windows = await windowsFor(LEGACY);
check('même modèle, deuxième ouverture : seule la migration ouvre sa fenêtre, la relecture passe sur son verdict', windows === 1, { windows });
check('et le texte enregistré est le même qu\'à la première ouverture', (await frame.evaluate(() => Editor.getHTML())) === legacy1);

// 10) La liste reste courte : au plus quarante signatures, les plus récentes.
for (let i = 0; i < 44; i++) await windowsFor(H1.replace('</p>', `</p><p>Variante ${i}</p>`), 120);
const final = await verdicts();
check('après quarante-quatre textes différents, la liste garde quarante signatures au plus', final.length === 40, { length: final.length });
const last = await windowsFor(H1.replace('</p>', '</p><p>Variante 43</p>'), 400);
check('le dernier texte relu a gardé son verdict (pas de fenêtre)', last === 0, { last });

check('aucune erreur JavaScript', pageErrors.length === 0, pageErrors.slice(0, 3));
console.log(`\n${total - failures}/${total} passés`);
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
