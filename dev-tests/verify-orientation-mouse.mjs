#!/usr/bin/env node
// Bascule Portrait / Paysage d'un modèle classique à la VRAIE souris (page.mouse, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en
// thème clair puis sombre : le bouton de la barre est dans le panneau et actif, un vrai clic passe la feuille en paysage (1122.52px de large, ramenée à la
// largeur du panneau par le facteur d'ajustement, sans défilement horizontal de la page), la pagination et la Lecture suivent, l'enregistrement automatique
// écrit l'orientation, et le retour au portrait (clavier : Entrée, Espace) rend exactement la feuille d'avant.
// dev-tests/scenarios-orientation.js vérifie la même chose DANS la page (.click(), mesures en pixels de mise en page) ; ici, la feuille est mesurée aux PIXELS
// d'une vraie capture (blanc de la feuille contre le fond de l'espace de travail) et chaque geste est un vrai geste.
// Lancé par run-headless.mjs (groupe Node "orientationMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-orientation-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.ORIENTATION_MOUSE_PORT || 8909);
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-orientation-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  // Boîtes du navigateur (alert/confirm) : acceptées et consignées, jamais bloquantes.
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept().catch(() => {}); });
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
  // Semé avant le démarrage : un modèle classique « Contrat » enregistré et ouvert par défaut, une ligne de données ; AUCUN réglage de droits, donc tous les droits.
  await page.addInitScript(() => {
    window.__preSeedGristStub = (stub) => {
      stub.setVariables('Clients', { Nom: 'Text' });
      stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
      const m = stub.state.rows.Publipostage_Modeles;
      m.id.push(1); m.Nom.push('Contrat');
      // Assez long pour passer sur plusieurs pages dans les deux sens, avec un tableau pour voir la largeur de la page.
      const paras = Array.from({ length: 100 }, (_, i) => '<p>Ligne ' + i + ' du contrat de location, rédigée pour que le modèle tienne sur plusieurs pages.</p>').join('');
      m.Contenu.push('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span>, voici le contrat de location.</p>'
        + '<table><tbody><tr><td><p>Désignation</p></td><td><p>Quantité</p></td><td><p>Prix</p></td></tr></tbody></table>' + paras);
      m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
      stub.state.nextRowId.Publipostage_Modeles = 2;
    };
  });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  return { context, page, dialogs };
}


// Centre d'un élément et est-il entièrement dans le panneau ?
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

// La feuille telle que la voit la personne : son rectangle à l'écran (facteur d'ajustement compris), sa largeur de mise en page (rectangle / facteur), le
// panneau qui la contient, le nombre de sauts de page tracés et le débordement horizontal de la PAGE (et non du conteneur, qui a son propre défilement).
const sheetOf = (page, scope) => page.evaluate((scope) => {
  const container = document.getElementById(scope === 'reader' ? 'reader-container' : 'editor-container');
  const sheet = scope === 'reader' ? container.querySelector('.reader-content') : container.querySelector('.v2-page-sheet');
  if (!sheet) return null;
  const r = sheet.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  const zoom = parseFloat(getComputedStyle(sheet).zoom) || 1;
  return {
    left: r.left, right: r.right, top: r.top, width: r.width, layoutWidth: r.width / zoom, zoom,
    container: { left: c.left, right: c.right, top: c.top, bottom: c.bottom, clientWidth: container.clientWidth, scrollWidth: container.scrollWidth },
    breaks: container.querySelectorAll('.v2-page-break-line').length,
    pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
    landscape: PageLayout.isLandscape(),
  };
}, scope);

// Étendue du BLANC pur de la feuille sur une ligne de vraie capture d'écran (comme dev-tests/verify-small-panel.mjs, la capture est décodée dans la page) :
// le fond de l'espace de travail autour de la feuille est gris clair ou sombre, jamais blanc pur. Une ligne dans la marge haute de la feuille (vide) donne
// ses deux bords tels qu'ils sont peints, et donc coupés si un conteneur rognait la feuille.
async function whiteExtent(page, y, x0, x1) {
  const png = await page.screenshot({ clip: { x: Math.max(0, Math.floor(x0)), y: Math.floor(y), width: Math.floor(Math.min(x1, WIDTH) - Math.max(0, x0)), height: 1 } });
  return page.evaluate(async ({ b64, offset }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, 1).data;
    let first = -1, last = -1;
    for (let x = 0; x < c.width; x++) {
      if (d[x * 4] >= 253 && d[x * 4 + 1] >= 253 && d[x * 4 + 2] >= 253) { if (first < 0) first = x; last = x; }
    }
    return first < 0 ? null : { left: first + offset, right: last + offset + 1 };
  }, { b64: png.toString('base64'), offset: Math.max(0, Math.floor(x0)) });
}

const within = (a, b, tol) => Math.abs(a - b) <= tol;
const stored = page => page.evaluate(() => {
  const s = window.__gristStub;
  const row = s.getRow('Publipostage_Modeles', 1);
  return { margins: row.Margins, writes: s.countActions('UpdateRecord', 'Publipostage_Modeles') };
});

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Portrait / Paysage à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);

  // Le bouton est dans le panneau, actif sur ce modèle classique, et montre une page haute.
  const btn = await boxOf(page, '#btn-page-orientation');
  const btnState = () => page.evaluate(() => {
    const b = document.getElementById('btn-page-orientation');
    const cs = getComputedStyle(b, '::before');
    return { disabled: b.disabled, pressed: b.getAttribute('aria-pressed'), data: b.dataset.orientation, tip: b.getAttribute('data-tip'), mask: cs.webkitMaskImage || cs.maskImage || '' };
  });
  const before = await btnState();
  check(`${label} - le bouton d'orientation est entièrement dans le panneau, actif, non enfoncé, avec une page haute`,
    !!btn && btn.inViewport && !before.disabled && before.pressed === 'false' && before.data === 'portrait' && before.mask.indexOf("width='12' height='18'") !== -1, { btn, before });

  // Aperçu A4 (vrai clic) : la feuille est visible.
  const a4On = await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview'));
  if (!a4On) await realClick(page, '#v2-a4-toggle');
  await page.waitForTimeout(700);
  const portrait = await sheetOf(page, 'editor');
  check(`${label} - portrait : feuille de 793.71px de mise en page, ramenée dans le panneau par le facteur d'ajustement (${portrait && portrait.zoom.toFixed(3)})`,
    !!portrait && within(portrait.layoutWidth, 793.71, 1) && portrait.left >= portrait.container.left - 1 && portrait.right <= portrait.container.right + 1 && portrait.pageOverflowX <= 0, portrait);
  // Une ligne vide de la marge haute de la feuille : elle est dans le panneau (le défilement est au début).
  const portraitPixels = await whiteExtent(page, portrait.top + 6, 0, WIDTH);
  check(`${label} - portrait : le blanc de la feuille peint par le navigateur a la largeur de la feuille`,
    !!portraitPixels && within(portraitPixels.right - portraitPixels.left, portrait.width, 4), { portraitPixels, width: portrait.width });

  // Vrai clic sur le bouton : la feuille passe en paysage.
  const writesBefore = (await stored(page)).writes;
  await realClick(page, '#btn-page-orientation');
  await page.waitForTimeout(1100);
  const landscape = await sheetOf(page, 'editor');
  const afterClick = await btnState();
  check(`${label} - vrai clic : le bouton s'enfonce, montre une page large et annonce le paysage dans son info-bulle`,
    afterClick.pressed === 'true' && afterClick.data === 'landscape' && afterClick.mask.indexOf("width='18' height='12'") !== -1 && afterClick.tip !== before.tip, { before, afterClick });
  check(`${label} - paysage : feuille de 1122.52px de mise en page, entièrement dans le panneau (facteur ${landscape && landscape.zoom.toFixed(3)} contre ${portrait.zoom.toFixed(3)}), page sans défilement horizontal`,
    !!landscape && landscape.landscape && within(landscape.layoutWidth, 1122.52, 1.5) && landscape.zoom < portrait.zoom
      && landscape.left >= landscape.container.left - 1 && landscape.right <= landscape.container.right + 1 && landscape.pageOverflowX <= 0, landscape);
  const landscapePixels = await whiteExtent(page, landscape.top + 6, 0, WIDTH);
  check(`${label} - paysage : le blanc peint de la feuille a sa largeur, avec sa marge de chaque côté dans le panneau`,
    !!landscapePixels && within(landscapePixels.right - landscapePixels.left, landscape.width, 4) && landscapePixels.left >= 0 && landscapePixels.right <= WIDTH, { landscapePixels, width: landscape.width });
  check(`${label} - paysage : les sauts de page sont retracés (plus de pages pour le même texte : ${portrait.breaks} -> ${landscape.breaks})`,
    landscape.breaks > portrait.breaks, { portrait: portrait.breaks, landscape: landscape.breaks });

  // L'enregistrement automatique écrit l'orientation (un seul geste = une seule écriture).
  await page.waitForTimeout(4200);
  const saved = await stored(page);
  const savedMargins = (() => { try { return JSON.parse(saved.margins || '{}'); } catch (e) { return null; } })();
  check(`${label} - l'enregistrement automatique écrit le paysage dans le modèle, en une seule écriture`,
    !!savedMargins && savedMargins.orientation === 'landscape' && saved.writes === writesBefore + 1, { saved, writesBefore });

  // Mode lecture (vrai clic) : la feuille de la Lecture est paysage aussi, repaginée comme l'éditeur. La Lecture montre une ligne de la table : on la sélectionne.
  await page.evaluate(() => window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients'));
  await realClick(page, '#btn-mode-read');
  await page.waitForFunction(() => document.getElementById('reader-container').style.display === 'block' && !!document.querySelector('#reader-container .reader-content'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
  const reader = await sheetOf(page, 'reader');
  check(`${label} - Lecture : feuille de 1122.52px de mise en page, dans le panneau, repaginée comme l'éditeur (${reader && reader.breaks} sauts contre ${landscape.breaks})`,
    !!reader && within(reader.layoutWidth, 1122.52, 1.5) && reader.left >= reader.container.left - 1 && reader.right <= reader.container.right + 1 && reader.pageOverflowX <= 0 && reader.breaks === landscape.breaks, reader);
  // En Lecture le bouton reste utilisable ? Il est grisé avec la barre de mise en forme ou non : on ne le modifie pas ici, on vérifie seulement qu'il ne casse rien.
  await realClick(page, '#btn-mode-edit');
  await page.waitForTimeout(900);
  const backEdit = await sheetOf(page, 'editor');
  check(`${label} - retour en Édition : toujours en paysage, même feuille et mêmes sauts de page`,
    !!backEdit && backEdit.landscape && within(backEdit.layoutWidth, 1122.52, 1.5) && backEdit.breaks === landscape.breaks, backEdit);

  // Clavier : Entrée ramène au portrait, Espace repasse en paysage, et un dernier vrai clic revient au portrait - exactement la feuille d'avant.
  await page.focus('#btn-page-orientation');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  const viaEnter = await sheetOf(page, 'editor');
  check(`${label} - clavier, Entrée : retour au portrait, exactement la feuille et les sauts d'avant`,
    !!viaEnter && !viaEnter.landscape && within(viaEnter.layoutWidth, portrait.layoutWidth, .5) && within(viaEnter.zoom, portrait.zoom, .002) && viaEnter.breaks === portrait.breaks, { viaEnter, portrait });
  await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
  const viaSpace = await sheetOf(page, 'editor');
  check(`${label} - clavier, Espace : repasse en paysage`, !!viaSpace && viaSpace.landscape && within(viaSpace.layoutWidth, 1122.52, 1.5) && viaSpace.breaks === landscape.breaks, viaSpace);
  await realClick(page, '#btn-page-orientation');
  await page.waitForTimeout(1000);
  const last = await sheetOf(page, 'editor');
  check(`${label} - dernier vrai clic : portrait, feuille et sauts identiques à ceux du départ`,
    !!last && !last.landscape && within(last.layoutWidth, portrait.layoutWidth, .5) && within(last.zoom, portrait.zoom, .002) && last.breaks === portrait.breaks, { last, portrait });
  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
