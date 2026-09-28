#!/usr/bin/env node
// Vérification à la VRAIE molette (page.mouse.wheel, Node/Playwright) que la page elle-même ne défile
// jamais derrière l'arbre des modèles, à la taille réelle du panneau Grist d'Antoine (~700x400).
//
// Pourquoi ce fichier existe séparément des scénarios de dev-tests/scenarios-*.js : ceux-ci s'exécutent
// tous DANS la page via page.evaluate() (cf. run-headless.mjs:runGroup), donc sans accès à page.mouse -
// un dispatchEvent('scroll')/'wheel' scripté n'y déclenche jamais le comportement natif de défilement
// du navigateur (seul un geste "trusted" le fait). Documenté dans la mémoire projet
// [[project-publipostage-scroll-chaining-popup-fix]] : la seule façon de prouver l'absence de chaînage
// de scroll est un vrai geste Playwright au niveau Node, d'où ce script à part.
//
// Historique du bug (Antoine, 28/09) : au premier clic la liste des modèles s'ouvre, mais la moindre
// molette la referme et la rend impossible à rouvrir. Trois causes, corrigées séparément :
//   1. Un scroll DE LA LISTE elle-même (`.tts-popup` a overflow-y:auto) était vu par l'écouteur
//      `scroll` en capture sur `window` censé fermer le panneau si un ANCÊTRE défile (c7ce978).
//   2. Le scrollTop de la liste restait celui d'avant fermeture (c7ce978).
//   3. Une fois fermée à tort par la cause 1, les crans suivants tombaient sur LA PAGE, qui débordait
//      de façon invisible à cause de #v2-heading-flyout (position:absolute + visibility:hidden, compte
//      quand même dans scrollHeight) - `overscroll-behavior:contain` sur .tts-popup a arrêté le
//      chaînage DEPUIS le popup (c7ce978), mais pas le débordement latent lui-même : une molette
//      donnée directement au-dessus de la barre d'outils ou de l'éditeur, SANS jamais toucher au
//      popup, faisait encore défiler la page de 29px (mesuré indépendamment par le coordinateur en
//      700x400 et 600x400 après c7ce978) et sortait le reste de la barre de la zone visible. Ce script
//      couvre ce chemin, corrigé en pla­fonnant #v2-heading-flyout (css/editor-v2.css, règle
//      `.v2-hover-flyout`) pour qu'il ne compte plus dans le défilement de page une fois fermé, et
//      qu'il tienne dans la fenêtre une fois ouvert (overflow-y:auto interne sinon).
//
// Usage : node dev-tests/verify-wheel-scroll.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = 8896;

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
if (!OFFLINE) console.log('[verify-wheel-scroll] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

async function runAt(width, height) {
  console.log(`\n=== ${width}x${height} ===`);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));

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
  await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });

  // Quelques modèles réels (pas injectés) - juste assez pour avoir une sélection à protéger.
  await page.evaluate(async () => {
    function openFlyout(sel) { document.querySelector(sel).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); }
    async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    for (let i = 1; i <= 5; i++) {
      openFlyout('#v2-new-template-group');
      document.getElementById('v2-btn-new-document').click();
      await sleep(50);
      EditorCore.getEditor().commands.setContent('<p>Contenu ' + i + '</p>');
      document.getElementById('template-name').value = 'Modèle ' + i;
      document.getElementById('btn-save').click();
      await sleep(300);
    }
  });
  // Contenu COURT dans l'éditeur actif - il ne doit pas avoir besoin de défiler lui-même, pour isoler
  // le chaînage vers la page (pas la question posée ici).
  await page.evaluate(() => { EditorCore.getEditor().commands.setContent('<p>Contenu court.</p>'); });

  const selectedBefore = await page.evaluate(() => document.getElementById('template-select').value);

  const triggerBox = await page.evaluate(() => {
    const t = document.querySelector('.tts-trigger');
    const r = t.getBoundingClientRect();
    return { centerX: r.x + r.width / 2, centerY: r.y + r.height / 2 };
  });

  // 1) Popup FERMÉ : molette au-dessus de la barre, puis de l'éditeur - la page ne doit jamais défiler.
  const toolbarBox = await page.evaluate(() => {
    const bar = document.getElementById('toolbar-top');
    const r = bar.getBoundingClientRect();
    return { centerX: r.x + 20, centerY: r.y + r.height / 2 };
  });
  await page.mouse.move(toolbarBox.centerX, toolbarBox.centerY);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100);
  let scrollTop = await page.evaluate(() => document.scrollingElement.scrollTop);
  check('popup fermé, molette sur la barre -> page immobile', scrollTop === 0, { scrollTop });

  const editorBox = await page.evaluate(() => {
    const el = document.getElementById('editor-container');
    const r = el.getBoundingClientRect();
    return { centerX: r.x + r.width / 2, centerY: r.y + Math.min(60, r.height / 2) };
  });
  await page.mouse.move(editorBox.centerX, editorBox.centerY);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100);
  scrollTop = await page.evaluate(() => document.scrollingElement.scrollTop);
  check('popup fermé, molette sur l\'éditeur -> page immobile', scrollTop === 0, { scrollTop });

  // 2) Ouvrir par un vrai clic, molette SUR LA LISTE - reste ouvert, page immobile.
  await page.mouse.click(triggerBox.centerX, triggerBox.centerY);
  await page.waitForTimeout(100);
  let popupOpen = await page.evaluate(() => document.querySelector('.tts-popup').classList.contains('is-open'));
  check('clic sur le déclencheur -> popup ouvert', popupOpen === true);

  const popupBox = await page.evaluate(() => {
    const p = document.querySelector('.tts-popup');
    const r = p.getBoundingClientRect();
    return { centerX: r.x + r.width / 2, centerY: r.y + r.height / 2 };
  });
  await page.mouse.move(popupBox.centerX, popupBox.centerY);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100);
  popupOpen = await page.evaluate(() => document.querySelector('.tts-popup').classList.contains('is-open'));
  scrollTop = await page.evaluate(() => document.scrollingElement.scrollTop);
  check('popup ouvert, molette sur la liste -> reste ouvert', popupOpen === true, { popupOpen });
  check('popup ouvert, molette sur la liste -> page immobile', scrollTop === 0, { scrollTop });

  // 3) Molette sur la barre pendant que le popup est ouvert. outsideScrollHandler ne ferme que si un
  // ANCÊTRE défile vraiment (cf. c7ce978) - une fois #v2-heading-flyout plafonné, la page n'a souvent
  // plus rien à défiler ici, donc rien ne se ferme : ce n'est plus une fermeture garantie, seule
  // l'immobilité de la page l'est.
  await page.mouse.move(toolbarBox.centerX, toolbarBox.centerY);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100);
  scrollTop = await page.evaluate(() => document.scrollingElement.scrollTop);
  check('molette sur la barre, popup ouvert -> page immobile', scrollTop === 0, { scrollTop });

  // 4) Échap pour repartir d'un état FERMÉ connu, puis clic à l'emplacement D'ORIGINE du déclencheur
  // (avant tout défilement) - doit encore tomber dessus et l'ouvrir.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  popupOpen = await page.evaluate(() => document.querySelector('.tts-popup').classList.contains('is-open'));
  check('Échap -> popup fermé', popupOpen === false, { popupOpen });
  const atOriginal = await page.evaluate((box) => {
    const t = document.querySelector('.tts-trigger');
    const el = document.elementFromPoint(box.centerX, box.centerY);
    return { isTriggerOrChild: el === t || t.contains(el), tag: el ? el.tagName + '.' + el.className : null };
  }, triggerBox);
  check('déclencheur toujours à sa position d\'origine', atOriginal.isTriggerOrChild, atOriginal);

  await page.mouse.click(triggerBox.centerX, triggerBox.centerY);
  await page.waitForTimeout(100);
  popupOpen = await page.evaluate(() => document.querySelector('.tts-popup').classList.contains('is-open'));
  check('clic à l\'emplacement d\'origine -> rouvre', popupOpen === true, { popupOpen });

  // 5) La sélection n'a pas bougé pendant toute la séquence (aucun clic parasite sur une ligne).
  const selectedAfter = await page.evaluate(() => document.getElementById('template-select').value);
  check('valeur sélectionnée inchangée', selectedAfter === selectedBefore, { selectedBefore, selectedAfter });

  await browser.close();
}

await runAt(700, 400);
await runAt(600, 400);
server.close();

console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
