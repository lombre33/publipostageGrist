#!/usr/bin/env node
// La Lecture « comme si toutes les modifications étaient acceptées », à la vraie souris et au vrai clavier, à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis sombre.
// Demande d'Antoine du 04/10 (« En mode lecture afficher comme si toutes les modifications était acceptées avec juste un léger changement de couleur là où des modifs sont présentes ») :
// js/reader-mode.js:renderRecord passe le HTML par js/track-changes-reading.js:acceptedView. Le script allume le suivi au bouton, tape, supprime et remplace au clavier, ouvre la Lecture au vrai clic, puis lit : le texte
// supprimé a disparu (pas barré : parti), le texte ajouté et le texte de remplacement sont là, plus aucun <ins> ni <del>, le fond peint aux pixels derrière le texte ajouté (vert pâle, le même dans les deux
// thèmes, la page restant blanche), la couleur du texte inchangée et sans soulignement, 4,5:1 au moins ; puis le retour à l'édition : les suggestions y sont toujours en attente (rien n'a été accepté pour de bon).
// Lancé par run-headless.mjs (groupe Node "suggestionReadingMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-suggestion-reading-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SUGGESTION_READING_PORT || 8954);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-track-text-colors-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-suggestion-reading-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
// Une page neuve par thème : même panneau ~700x400, mêmes routes hors-ligne.
async function openPage(dark) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme: dark ? 'dark' : 'light' });
  const page = await context.newPage();
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
  // Aperçu A4, le réglage d'Antoine : c'est lui qui déclenche aussi la correction de largeur des tableaux trop larges pour la page.
  await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });
  return page;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const settle = () => sleep(600);

const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const contrast = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

let page;
// Le pixel réellement peint en (x, y) de la fenêtre : une capture de 1x1 px, relue sans bibliothèque (une seule ligne de pixels : tous les filtres PNG rendent les octets bruts).
async function pixelAt(x, y) {
  const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 } });
  const idat = [];
  for (let off = 8; off < png.length;) {
    const len = png.readUInt32BE(off);
    if (png.toString('ascii', off + 4, off + 8) === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3]];
}
// Le HTML de l'éditeur : les suggestions y sont des <ins> et des <del> tant qu'elles n'ont pas été acceptées.
const html = () => page.evaluate(() => Editor.getHTML());
const insCount = h => (h.match(/<ins /g) || []).length;
const delCount = h => (h.match(/<del /g) || []).length;
// La souris au bas du panneau : les menus de la barre d'outils s'ouvrent au survol et recouvriraient le texte visé.
const parkMouse = async () => { await page.mouse.move(WIDTH / 2, HEIGHT - 6); await sleep(350); };
// Le centre d'un texte du document (éditeur), pour viser à la vraie souris.
const rectOf = text => page.evaluate((t) => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const i = n.textContent.indexOf(t);
    if (i < 0) continue;
    const range = document.createRange();
    range.setStart(n, i); range.setEnd(n, i + t.length);
    const r = range.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}, text);

for (const dark of [false, true]) {
  const theme = dark ? 'sombre' : 'clair';
  page = await openPage(dark);
  console.log(`\n--- thème ${theme} ---`);
  // Une ligne sélectionnée : sans elle la Lecture n'affiche que son message d'attente.
  await page.evaluate(async () => {
    const stub = window.__gristStub;
    stub.setVariables('Dossiers', { Nom: 'Text' });
    stub.setRows('Dossiers', [{ id: 1, Nom: 'Dossier 1' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Dossier 1' }, 'Dossiers');
    Editor.setTrackChanges(false);
    Editor.setHTML('<p>Premier paragraphe de test.</p><p>Deuxième paragraphe avec un mot à retirer ici.</p><p>Troisième paragraphe avec un mot à changer ici.</p><p>Fin du document.</p>');
  });
  await settle();

  // Le suivi s'allume au bouton (vraie souris) ; une frappe ajoute du texte, un double-clic puis Suppr retire un mot, un double-clic puis une frappe en remplace un autre (texte neuf sans début ni fin commun).
  await page.click('#v2-btn-track-changes');
  await sleep(250);
  await parkMouse();
  await page.click('.tiptap p');
  await page.keyboard.press('End');
  await page.keyboard.type(' Ajout un.');
  await sleep(250);
  const removed = await rectOf('retirer');
  await sleep(600);
  await page.mouse.dblclick(removed.x, removed.y);
  await sleep(250);
  await page.keyboard.press('Delete');
  await sleep(300);
  const replaced = await rectOf('changer');
  await sleep(600);
  await page.mouse.dblclick(replaced.x, replaced.y);
  await sleep(250);
  await page.keyboard.type('nouveau');
  await sleep(300);
  const pending = await html();
  check(`[${theme}] un ajout, une suppression et un remplacement tapés au clavier sont en attente`,
    /<ins [^>]*> Ajout un\.<\/ins>/.test(pending) && /<del [^>]*>retirer<\/del>/.test(pending) && /<del [^>]*>changer<\/del>/.test(pending) && /<ins [^>]*>nouveau<\/ins>/.test(pending) && insCount(pending) === 2 && delCount(pending) === 2, pending);

  // La Lecture, au vrai clic sur le bouton de mode.
  await parkMouse();
  await page.click('#btn-mode-read');
  await page.waitForSelector('#reader-container .reader-content', { timeout: 15000 });
  await settle();
  const reading = await page.evaluate(() => {
    const content = document.querySelector('#reader-container .reader-content');
    const plain = Array.from(content.querySelectorAll('p')).find(p => p.textContent.startsWith('Deuxième'));
    const tinted = Array.from(content.querySelectorAll('.pp-tc-changed'));
    const decorated = Array.from(content.querySelectorAll('*')).filter(el => el.textContent && /line-through|underline/.test(getComputedStyle(el).textDecorationLine));
    const first = tinted[0];
    if (first) first.scrollIntoView({ block: 'center' });
    return {
      text: content.textContent,
      leftovers: content.querySelectorAll('ins, del, [data-tc-insertion], [data-tc-deletion], [data-tc-modification], span[data-type="modification"]').length,
      tinted: tinted.map(el => el.textContent),
      decorated: decorated.map(el => el.tagName + ':' + el.textContent.slice(0, 20)),
      plainColor: plain ? getComputedStyle(plain).color : null,
      firstColor: first ? getComputedStyle(first).color : null,
      firstBackground: first ? getComputedStyle(first).backgroundColor : null,
    };
  });
  check(`[${theme}] la Lecture montre le texte ajouté, sans le mot supprimé ni son espace en double`,
    reading.text.includes('Premier paragraphe de test. Ajout un.') && reading.text.includes('avec un mot à ici.') && !reading.text.includes('retirer'), reading.text);
  check(`[${theme}] la Lecture montre le texte de remplacement, sans l'ancien mot`,
    reading.text.includes('avec un mot à nouveau ici.') && !reading.text.includes('changer'), reading.text);
  check(`[${theme}] plus aucun <ins>, <del> ni marque de suivi dans la Lecture`, reading.leftovers === 0, reading.leftovers);
  check(`[${theme}] le texte ajouté et le remplacement sont teintés, rien d'autre`, reading.tinted.length === 2 && reading.tinted.includes(' Ajout un.') && reading.tinted.includes('nouveau'), reading.tinted);
  check(`[${theme}] ni barré ni souligné : rien n'a de trait`, reading.decorated.length === 0, reading.decorated);
  check(`[${theme}] le fond calculé est le vert pâle, le même dans les deux thèmes`, reading.firstBackground === 'rgb(229, 246, 238)', reading.firstBackground);
  check(`[${theme}] le texte teinté garde la couleur du texte de la page`, !!reading.firstColor && reading.firstColor === reading.plainColor, { first: reading.firstColor, plain: reading.plainColor });
  check(`[${theme}] texte sur fond teinté à 4,5:1 au moins`, !!reading.firstColor && contrast(reading.firstColor, reading.firstBackground) >= 4.5, contrast(reading.firstColor || 'rgb(0,0,0)', reading.firstBackground || 'rgb(255,255,255)'));

  // Aux pixels : sous le texte teinté, le vert pâle ; à côté, la page blanche (en sombre aussi).
  const box = await page.evaluate(() => {
    const tinted = document.querySelector('#reader-container .reader-content .pp-tc-changed');
    if (!tinted) return null;
    const r = tinted.getBoundingClientRect();
    const content = document.querySelector('#reader-container .reader-content').getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, contentLeft: content.left };
  });
  check(`[${theme}] un texte teinté est là pour être mesuré`, !!box);
  if (box) {
    const samples = [];
    for (let i = 1; i <= 6; i++) samples.push(await pixelAt(box.left + (box.right - box.left) * i / 7, box.top + 1.5));
    check(`[${theme}] pixels peints : le fond derrière le texte ajouté est le vert pâle`, samples.some(px => near(px, [229, 246, 238])), samples);
    const aside = await pixelAt(box.contentLeft + 3, (box.top + box.bottom) / 2);
    check(`[${theme}] pixels peints : la page autour reste blanche`, near(aside, [255, 255, 255], 2), aside);
    check(`[${theme}] le texte teinté est dans la fenêtre`, box.left >= 0 && box.right <= WIDTH && box.top >= 0 && box.bottom <= HEIGHT, box);
  }

  // Retour à l'édition : rien n'a été accepté pour de bon.
  await parkMouse();
  await page.click('#btn-mode-edit');
  await sleep(500);
  const after = await html();
  check(`[${theme}] de retour à l'édition, les suggestions sont toujours en attente`, insCount(after) === 2 && delCount(after) === 2 && await page.evaluate(() => Editor.hasPendingTrackedChanges()), after);
  await page.context().close();
}

check('aucune erreur de page', pageErrors.length === 0, pageErrors);
console.log(`\n${total - failures}/${total} passés`);
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
