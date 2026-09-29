#!/usr/bin/env node
// Bulle #Variable plus longue que sa case de tableau, à la taille du panneau Grist d'Antoine (~700x400), à la VRAIE souris (survol, clic, glisser d'une bordure
// de colonne) et au vrai clavier (Ctrl+C).
// Bug corrigé (29/09) : un nom de variable plus long que la case la traversait et recouvrait la case voisine. Antoine a proposé de couper le MILIEU du nom avec
// « … » plutôt que de le faire passer à la ligne (contraire au WYSIWYG : l'export met la valeur, pas le nom). js/editor-nodes.js (addNodeView) coupe le libellé
// en un début et une fin, css/variable-actions.css les rétrécit dans une case ; tout le reste ne doit pas bouger : getHTML() garde le nom entier dans un seul texte,
// copier donne la bulle entière, le clic la sélectionne et ouvre la barre de variable, hors d'un tableau la bulle garde son rendu en ligne, le point bleu du format
// (hors de la boîte de la bulle) n'est pas rogné, une bulle cassée garde son propre message d'erreur.
// Lancé par run-headless.mjs (groupe Node "chipCellMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-chip-cell-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.CHIP_CELL_PORT || 8895);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-table-undo-keyboard.mjs.
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
if (!OFFLINE) console.log('[verify-chip-cell-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
// Aperçu A4, le réglage d'Antoine (page réduite dans le panneau).
await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const settle = () => sleep(600);

// Noms pris chez Antoine : une colonne au nom long (~30 caractères) et une adresse, bien plus larges que des cases de ~100 px.
const LONG = 'Nom_de_famille_du_proprietaire';
const LONG2 = 'Adresse_postale_complete_du_client';
const LABEL = c => '#Clients.' + c;
await page.evaluate(async () => {
  window.__gristStub.setVariables('Clients', { Nom: 'Text', Nom_de_famille_du_proprietaire: 'Text', Adresse_postale_complete_du_client: 'Text' });
  await GristAPI.refreshSchema();
  // Ce que Ctrl+C met dans le presse-papiers (lu par un écouteur du document, qui passe après celui de l'éditeur).
  window.__copied = null;
  document.addEventListener('copy', e => { window.__copied = { html: e.clipboardData.getData('text/html') }; });
});
const chip = (column, extra) => `<span class="var-badge" data-table="Clients" data-column="${column}" data-key="Clients.${column}"${extra || ''}>#Clients.${column}</span>`;
const FMT = ' data-format="{&quot;type&quot;:&quot;number&quot;}"';
const LOOP = ' data-loop="{&quot;table&quot;:&quot;Clients&quot;,&quot;via&quot;:&quot;Nom&quot;,&quot;repeat&quot;:&quot;inline&quot;}" data-loop-repeat="inline"';
const cell = (width, inner) => `<td colwidth="${width}"><p>${inner}</p></td>`;
async function loadDoc(html) {
  await page.evaluate(h => Editor.setHTML(h), html);
  await settle();
}

// Ce qu'on voit de chaque bulle : sa place par rapport à son paragraphe (donc à sa case), ses deux morceaux et ce que chacun coupe.
const chipsInfo = () => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap span.var-badge')).map((b, index) => {
  const r = b.getBoundingClientRect();
  const p = b.closest('p');
  const c = p.getBoundingClientRect();
  const head = b.querySelector('.var-badge-head');
  const tail = b.querySelector('.var-badge-tail');
  return {
    index, key: b.dataset.key, label: b.textContent, inCell: !!b.closest('td, th'),
    outLeft: Math.round((c.left - r.left) * 10) / 10, outRight: Math.round((r.right - c.right) * 10) / 10, h: Math.round(r.height * 10) / 10, w: Math.round(r.width),
    head: head ? head.textContent : null, tail: tail ? tail.textContent : null,
    headCut: head ? head.scrollWidth > head.clientWidth : false, tailCut: tail ? tail.scrollWidth > tail.clientWidth : false,
    display: getComputedStyle(b).display, title: b.title, broken: b.classList.contains('var-badge-broken'),
    x: r.left + r.width / 2, y: r.top + r.height / 2,
  };
}));
// Centre d'un élément et ce qui s'y trouve réellement au premier plan.
async function hitTest(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, x, y, inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)) };
  }, selector);
}
async function hoverOn(info) {
  await page.mouse.move(2, 2);
  await page.mouse.move(info.x, info.y, { steps: 4 });
  await sleep(150);
}

// 1) Le cas d'Antoine : cases de ~100 px, noms de 40 caractères et plus.
await loadDoc('<p>Avant</p><table><tbody>'
  + '<tr>' + cell(120, chip(LONG)) + cell(120, chip(LONG2)) + cell(120, chip('Nom')) + '</tr>'
  + '<tr>' + cell(120, 'Nom : ' + chip(LONG)) + cell(120, chip(LONG, FMT)) + cell(120, chip(LONG, LOOP)) + '</tr>'
  + '</tbody></table><p>Hors tableau : ' + chip(LONG) + '</p>');
const list = await chipsInfo();
const inCell = list.filter(c => c.inCell);
check('7 bulles dans les cases du tableau, 1 hors tableau', inCell.length === 6 && list.length === 7, list.map(c => c.key + (c.inCell ? ' (case)' : '')));
check('chaque bulle reste dans sa case : elle ne dépasse ni à gauche ni à droite de son paragraphe', inCell.every(c => c.outLeft <= 0.5 && c.outRight <= 0.5), inCell.map(c => [c.key, c.outLeft, c.outRight]));
check('chaque bulle d\'une case tient sur une seule ligne (la ligne du tableau ne grandit pas)', inCell.every(c => c.h < 24), inCell.map(c => [c.key, c.h]));
const cut = inCell.filter(c => c.label.length > 20);
check('les bulles trop longues gardent leur fin (dernier mot du nom) et perdent le milieu : début coupé, fin entière',
  cut.length === 5 && cut.every(c => c.head !== null && c.tail && c.tail.length >= 5 && c.label.endsWith(c.tail) && c.head + c.tail === c.label && c.headCut && !c.tailCut), cut.map(c => [c.key, c.head, c.tail, c.headCut, c.tailCut]));
const shortChip = inCell.find(c => c.key === 'Clients.Nom');
check('la bulle courte n\'est pas coupée', !!shortChip && !shortChip.tail && !shortChip.headCut && shortChip.label === '#Clients.Nom', shortChip);
const outside = list.find(c => !c.inCell);
check('hors d\'un tableau la bulle garde son rendu en ligne, nom entier (aucune coupure)', outside.display === 'inline-block' && !outside.headCut && outside.w > 150, outside);

// Le point bleu du format (hors de la boîte de la bulle) reste visible : rogné par un `overflow` sur la bulle, il disparaîtrait.
const dotHit = await page.evaluate(() => {
  const b = document.querySelector('.tiptap td .var-badge[data-format]');
  const r = b.getBoundingClientRect();
  const el = document.elementFromPoint(r.right, r.top);
  return { onChip: el === b, tag: el && el.tagName, cls: el && el.className };
});
check('le point bleu du format n\'est pas rogné (on l\'atteint au coin de la bulle)', dotHit.onChip, dotHit);

// 2) getHTML() garde le nom entier dans UN seul texte (enregistrement du modèle, export, lecture : rien ne doit voir le découpage de l'éditeur).
const htmlCheck = await page.evaluate(() => {
  const doc = new DOMParser().parseFromString(Editor.getHTML(), 'text/html');
  const spans = Array.from(doc.querySelectorAll('span.var-badge'));
  return {
    count: spans.length,
    wholeText: spans.every(s => s.childNodes.length === 1 && s.firstChild.nodeType === 3 && s.textContent === '#' + s.dataset.key),
    noParts: !/var-badge-(head|tail)/.test(Editor.getHTML()),
  };
});
check('getHTML() : 7 bulles, chacune avec son nom entier dans un seul texte, sans trace du découpage', htmlCheck.count === 7 && htmlCheck.wholeText && htmlCheck.noParts, htmlCheck);

// 3) Survol à la vraie souris : l'info-bulle porte le nom entier quand il est coupé, pas quand il est entier, et ne remplace pas le message d'une bulle cassée.
await hoverOn(list[0]);
const hoverLong = (await chipsInfo())[0];
check('survol d\'une bulle coupée : le nom entier en info-bulle', hoverLong.title === LABEL(LONG), hoverLong.title);
await hoverOn(list[2]);
const hoverShort = (await chipsInfo())[2];
check('survol d\'une bulle entière : pas d\'info-bulle', hoverShort.title === '', hoverShort.title);

// 4) Clic à la vraie souris sur la bulle coupée : elle est sélectionnée et la barre de variable s'ouvre, atteignable.
await page.mouse.click(list[0].x, list[0].y);
await sleep(300);
const selected = await page.evaluate(() => {
  const s = EditorCore.getEditor().state.selection;
  return { key: s.node ? s.node.attrs.key : null, marked: document.querySelectorAll('.tiptap span.var-badge.ProseMirror-selectednode').length };
});
check('clic sur une bulle coupée : c\'est elle qui est sélectionnée', selected.key === 'Clients.' + LONG && selected.marked === 1, selected);
const condBtn = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-condition"]');
check('... et la barre de variable s\'ouvre, son icône Condition atteignable à 700x400', condBtn.found && condBtn.inViewport && condBtn.onTop, condBtn);

// 5) Ctrl+C sur la bulle sélectionnée : le presse-papiers reçoit la bulle entière, pas un début et une fin.
await page.keyboard.press('Control+c');
await sleep(250);
const copied = await page.evaluate(() => window.__copied);
check('Ctrl+C : la bulle copiée porte son nom entier dans un seul texte',
  !!copied && copied.html.includes(`>${LABEL(LONG)}</span>`) && !/var-badge-(head|tail)/.test(copied.html), copied);
await page.mouse.click(2, 2);

// 6) Bulle cassée (colonne supprimée) dans une case étroite : elle reste dans sa case et garde SON message, pas le nom entier.
await loadDoc('<p>Avant</p><table><tbody><tr>' + cell(90, chip('Colonne_supprimee_depuis_longtemps')) + cell(90, 'x') + '</tr></tbody></table>');
const broken = (await chipsInfo())[0];
await hoverOn(broken);
const brokenHover = (await chipsInfo())[0];
check('bulle cassée dans une case étroite : dans sa case, et le survol garde le message d\'erreur (« n\'existe plus »)',
  broken.broken && broken.outLeft <= 0.5 && broken.outRight <= 0.5 && /n'existe plus/.test(brokenHover.title) && brokenHover.title !== broken.label, { broken, title: brokenHover.title });

// 7) Case plus étroite que la fin du nom : la bulle reste quand même dans sa case (la fin est coupée à son tour).
await loadDoc('<p>Avant</p><table><tbody><tr>' + cell(40, chip(LONG)) + cell(60, chip(LONG2)) + cell(120, 'x') + '</tr></tbody></table>');
const narrow = (await chipsInfo());
check('cases de 40 et 60 px : les bulles restent dans leur case', narrow.length === 2 && narrow.every(c => c.outLeft <= 0.5 && c.outRight <= 0.5 && c.h < 24), narrow.map(c => [c.key, c.outLeft, c.outRight, c.h]));

// 8) Colonne élargie puis rétrécie à la vraie souris (glisser de la bordure) : la bulle suit, sans rien refaire — entière quand la case est assez large.
await loadDoc('<p>Avant</p><table><tbody><tr>' + cell(120, chip(LONG)) + cell(120, 'x') + '</tr></tbody></table><p>Après</p>');
async function dragFirstBorder(dx) {
  const border = await page.evaluate(() => {
    const r = document.querySelector('.tiptap table td').getBoundingClientRect();
    return { x: r.right - 1, y: r.top + r.height / 2, w: r.width };
  });
  await page.mouse.move(border.x - 30, border.y);
  await page.mouse.move(border.x, border.y, { steps: 4 });
  await sleep(200);
  const handle = await page.evaluate(() => !!document.querySelector('.column-resize-handle'));
  await page.mouse.down();
  await page.mouse.move(border.x + dx, border.y, { steps: 8 });
  await page.mouse.up();
  await settle();
  const after = await page.evaluate(() => document.querySelector('.tiptap table td').getBoundingClientRect().width);
  return { handle, before: border.w, after };
}
const before = (await chipsInfo())[0];
check('avant d\'élargir : la bulle est coupée', before.headCut && before.outRight <= 0.5, before);
const wider = await dragFirstBorder(260);
const widened = (await chipsInfo())[0];
check('bordure glissée vers la droite : la colonne s\'élargit (poignée de colonne atteinte)', wider.handle && wider.after > wider.before + 150, wider);
check('colonne élargie : le nom apparaît en entier (plus de coupure) et reste dans la case', !widened.headCut && !widened.tailCut && widened.outRight <= 0.5, widened);
await hoverOn(widened);
check('colonne élargie : plus d\'info-bulle du nom (il est entier)', (await chipsInfo())[0].title === '', (await chipsInfo())[0].title);
const narrower = await dragFirstBorder(-260);
const narrowed = (await chipsInfo())[0];
check('bordure ramenée à gauche : la colonne se rétrécit', narrower.after < wider.after - 150, { wider, narrower });
check('colonne rétrécie : la bulle est de nouveau coupée au milieu, dans sa case', narrowed.headCut && !narrowed.tailCut && narrowed.outRight <= 0.5 && narrowed.outLeft <= 0.5, narrowed);

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
