#!/usr/bin/env node
// Bulle #Variable plus longue que sa case de tableau, à la taille du panneau Grist d'Antoine (~700x400), à la VRAIE souris (survol, clic, glisser d'une bordure
// de colonne) et au vrai clavier (Ctrl+C).
// Bug corrigé (29/09) : un nom de variable plus long que la case la traversait et recouvrait la case voisine. Antoine a proposé de couper le MILIEU du nom avec
// « … » plutôt que de le faire passer à la ligne (contraire au WYSIWYG : l'export met la valeur, pas le nom). js/editor-nodes.js (addNodeView) coupe le libellé
// en un début et une fin, css/variable-actions.css les rétrécit dans une case ; tout le reste ne doit pas bouger : getHTML() garde le nom entier dans un seul texte,
// copier donne la bulle entière, le clic la sélectionne et ouvre la barre de variable, hors d'un tableau la bulle garde son rendu en ligne, le point bleu du format
// (hors de la boîte de la bulle) n'est pas rogné, une bulle cassée garde son propre message d'erreur.
// Sa capture « Budget validé » (colonne de ~118 px, noms en Details_depense_s_Fonctionnement) a montré deux défauts de la première version : à certaines largeurs
// le début ne laissait qu'une tranche de « # » sans « … » (« #nctionnement » passait pour un nom entier), et la fin commençait au milieu d'un mot alors que la case
// avait la place de « Fonctionnement » en entier. Désormais le repère « #… » est toujours là, la fin est le dernier mot du nom et c'est elle qui se coupe, par la
// GAUCHE, quand la case est trop étroite : le bout du nom, qui distingue une variable d'une autre, reste toujours visible.
// Même règle dans les deux colonnes d'une zone 2 colonnes (Antoine, 29/09 : « Oui, les deux colonnes ») : dans la colonne de gauche (26 % de sa capture, ~187 px)
// un nom long passait sur 2 ou 3 lignes (`overflow-wrap: anywhere` de css/style.css) et rendait la zone plus haute dans l'éditeur qu'en lecture et à l'export.
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
// ~110 caractères : plus large que la colonne de DROITE d'une zone 2 colonnes (~500 px), pas seulement que sa colonne de gauche.
const LONG3 = 'Adresse_postale_complete_du_client_avec_tous_les_complements_et_le_bureau_distributeur_final_de_livraison';
const LABEL = c => '#Clients.' + c;
await page.evaluate(async ({ long3 }) => {
  window.__gristStub.setVariables('Clients', { Nom: 'Text', Nom_de_famille_du_proprietaire: 'Text', Adresse_postale_complete_du_client: 'Text', [long3]: 'Text' });
  await GristAPI.refreshSchema();
  // Ce que Ctrl+C met dans le presse-papiers (lu par un écouteur du document, qui passe après celui de l'éditeur).
  window.__copied = null;
  document.addEventListener('copy', e => { window.__copied = { html: e.clipboardData.getData('text/html') }; });
}, { long3: LONG3 });
const chip = (column, extra) => `<span class="var-badge" data-table="Clients" data-column="${column}" data-key="Clients.${column}"${extra || ''}>#Clients.${column}</span>`;
const FMT = ' data-format="{&quot;type&quot;:&quot;number&quot;}"';
const LOOP = ' data-loop="{&quot;table&quot;:&quot;Clients&quot;,&quot;via&quot;:&quot;Nom&quot;,&quot;repeat&quot;:&quot;inline&quot;}" data-loop-repeat="inline"';
const cell = (width, inner) => `<td colwidth="${width}"><p>${inner}</p></td>`;
async function loadDoc(html) {
  await page.evaluate(h => Editor.setHTML(h), html);
  await settle();
}

// Ce qu'on voit de chaque bulle : sa place par rapport à son paragraphe (donc à sa case ou à sa colonne), ses deux morceaux et ce que chacun coupe. La fin se coupe
// par la gauche (son texte est calé à droite de sa boîte), donc `tailClipped` compare des rectangles : scrollWidth ne compte pas ce débordement-là.
const chipsInfo = () => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap span.var-badge')).map((b, index) => {
  const r = b.getBoundingClientRect();
  const p = b.closest('p');
  const c = p.getBoundingClientRect();
  const column = b.closest('.two-columns-column');
  const cr = column ? column.getBoundingClientRect() : null;
  const head = b.querySelector('.var-badge-head');
  const tail = b.querySelector('.var-badge-tail');
  const tailText = tail ? tail.firstElementChild : null;
  const hb = head ? head.getBoundingClientRect() : null;
  const tb = tail ? tail.getBoundingClientRect() : null;
  const tt = tailText ? tailText.getBoundingClientRect() : null;
  const info = {
    index, key: b.dataset.key, label: b.textContent, inCell: !!b.closest('td, th'),
    // Colonne de zone 2 colonnes (0 = gauche, 1 = droite, -1 = hors d'une zone) et ce que la bulle déborde sur la colonne voisine.
    col: column ? Array.from(column.parentElement.children).filter(e => e.classList.contains('two-columns-column')).indexOf(column) : -1,
    colOutLeft: cr ? Math.round((cr.left - r.left) * 10) / 10 : null, colOutRight: cr ? Math.round((r.right - cr.right) * 10) / 10 : null,
    outLeft: Math.round((c.left - r.left) * 10) / 10, outRight: Math.round((r.right - c.right) * 10) / 10, h: Math.round(r.height * 10) / 10, w: Math.round(r.width),
    head: head ? head.textContent : null, tail: tailText ? tailText.textContent : null,
    headW: hb ? Math.round(hb.width * 10) / 10 : null,
    headCut: head ? head.scrollWidth > head.clientWidth : false,
    tailW: tb ? Math.round(tb.width * 10) / 10 : null,
    tailClipped: tt ? tt.width > tb.width + 0.5 : false,
    tailAtEnd: tt ? Math.abs(tb.right - tt.right) < 0.5 : false,
    display: getComputedStyle(b).display, title: b.title, broken: b.classList.contains('var-badge-broken'),
    x: r.left + r.width / 2, y: r.top + r.height / 2,
  };
  // Un em de la bulle en pixels écran (la feuille est réduite par un zoom dans le panneau) : sonde d'un em posée dans le paragraphe puis retirée.
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:1em;height:0';
  p.appendChild(probe);
  info.em = Math.round(probe.getBoundingClientRect().width * parseFloat(getComputedStyle(b).fontSize) / parseFloat(getComputedStyle(p).fontSize) * 100) / 100;
  probe.remove();
  return info;
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
check('les bulles trop longues perdent le milieu : début coupé, repère « #… » toujours visible, fin calée sur le bout du nom',
  cut.length === 5 && cut.every(c => c.head !== null && c.tail && c.label.endsWith(c.tail) && c.head + c.tail === c.label && c.headCut && c.headW >= 1.25 * c.em && c.tailAtEnd),
  cut.map(c => [c.key, c.head, c.tail, c.headCut, c.headW, c.em, c.tailAtEnd]));
check('la fin est le dernier mot du nom (« proprietaire », « du_client »), pas un bout de mot',
  cut.filter(c => c.key === 'Clients.' + LONG).every(c => c.tail === 'proprietaire') && cut.filter(c => c.key === 'Clients.' + LONG2).every(c => c.tail === 'du_client'), cut.map(c => [c.key, c.tail]));
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
check('colonne élargie : le nom apparaît en entier (plus de coupure) et reste dans la case', !widened.headCut && !widened.tailClipped && widened.outRight <= 0.5, widened);
await hoverOn(widened);
check('colonne élargie : plus d\'info-bulle du nom (il est entier)', (await chipsInfo())[0].title === '', (await chipsInfo())[0].title);
const narrower = await dragFirstBorder(-260);
const narrowed = (await chipsInfo())[0];
check('bordure ramenée à gauche : la colonne se rétrécit', narrower.after < wider.after - 150, { wider, narrower });
check('colonne rétrécie : la bulle est de nouveau coupée au milieu, dans sa case', narrowed.headCut && narrowed.outRight <= 0.5 && narrowed.outLeft <= 0.5, narrowed);

// 9) Sa capture « Budget validé » : la colonne « Type de ressources » (~118 px) et ses trois bulles Details_depense_s_*. Mêmes proportions que sur sa capture (la
// feuille est réduite par le même zoom pour la case et pour le texte). Les trois se distinguent par leur bout, le repère « #… » est là, elles tiennent dans la case.
await page.evaluate(async () => {
  window.__gristStub.setVariables('Projets', { Details_depense_s_Fonctionnement: 'Text', Details_depense_s_Investissement: 'Text', Details_depense_s_Personnel: 'Text' });
  await GristAPI.refreshSchema();
});
const budget = column => `<span class="var-badge" data-table="Projets" data-column="${column}" data-key="Projets.${column}">#Projets.${column}</span>`;
const budgetRow = (label, column) => `<tr>${cell(160, label)}${cell(118, budget(column))}${cell(88, '')}</tr>`;
await loadDoc('<p>Avant</p><table><tbody>'
  + `<tr>${cell(160, 'Catégorie')}${cell(118, 'Type de ressources')}${cell(88, 'Montant')}</tr>`
  + budgetRow('Fonctionnement (Masse 10)', 'Details_depense_s_Fonctionnement') + budgetRow('Investissement (Masse 20)', 'Details_depense_s_Investissement') + budgetRow('Personnel (Masse 30)', 'Details_depense_s_Personnel')
  + '</tbody></table><p>Après</p>');
const budgetChips = await chipsInfo();
check('Budget validé : les trois bulles sont dans la colonne de 118 px, sur une ligne, sans rien qui dépasse',
  budgetChips.length === 3 && budgetChips.every(c => c.inCell && c.outLeft <= 0.5 && c.outRight <= 0.5 && c.h < 24), budgetChips.map(c => [c.key, c.outLeft, c.outRight, c.h]));
check('Budget validé : chacune se reconnaît à son bout (Fonctionnement, Investissement, s_Personnel), sous un « #… » visible',
  budgetChips.map(c => c.tail).join('|') === 'Fonctionnement|Investissement|s_Personnel' && budgetChips.every(c => c.headCut && c.headW >= 1.25 * c.em && c.tailAtEnd), budgetChips.map(c => [c.tail, c.headW, c.em, c.tailAtEnd]));

// 10) Toutes les largeurs de colonne, de 96 à 200 px : la bulle reste dans sa case, le repère « #… » ne devient jamais une tranche de « # » sans « … », le bout du nom
// reste visible ; et quand la case a la place, la fin est le dernier mot en entier.
const widths = [96, 100, 104, 108, 112, 116, 120, 124, 128, 132, 140, 160, 200];
await loadDoc('<p>Avant</p>' + widths.map(w => `<table><tbody><tr>${cell(w, budget('Details_depense_s_Fonctionnement'))}${cell(40, String(w))}</tr></tbody></table>`).join(''));
const sweep = await chipsInfo();
check('colonnes de 96 à 200 px : la bulle reste dans sa case à chaque largeur', sweep.length === widths.length && sweep.every(c => c.outLeft <= 0.5 && c.outRight <= 0.5 && c.h < 24), sweep.map((c, i) => [widths[i], c.outLeft, c.outRight]));
const withCue = sweep.filter(c => c.headCut);
check('colonnes de 96 à 200 px : dès que le nom est coupé, le début garde la place de « #… » (jamais une tranche de « # » sans « … »)',
  withCue.length >= 10 && withCue.every(c => c.headW >= 1.25 * c.em), sweep.map((c, i) => [widths[i], c.headW, c.em, c.headCut]));
check('colonnes de 96 à 200 px : le bout du nom reste toujours visible (la fin se coupe par la gauche, jamais par la droite)', sweep.every(c => c.tailAtEnd), sweep.map((c, i) => [widths[i], c.tailAtEnd]));
const roomy = sweep[sweep.length - 1];
check('colonne de 200 px : la fin du nom est le dernier mot en entier (« Fonctionnement », rien de rogné)', roomy.tail === 'Fonctionnement' && !roomy.tailClipped && roomy.headW > 1.25 * roomy.em, roomy);

// 11) Zone 2 colonnes (Antoine, 29/09 : « Oui, les deux colonnes »). Colonne de gauche à 26 % (~187 px de mise en page, comme sur sa capture), colonne de droite ~500 px.
// Avant : dans la colonne de gauche un nom long passait sur 2 ou 3 lignes (`overflow-wrap: anywhere`) et la zone était plus haute dans l'éditeur que dans l'export.
const zoneDoc = (left, right, pct) => `<div class="two-columns-zone" style="--layout-left: ${pct || 26}%;"><div class="two-columns-column">${left}</div><div class="two-columns-column">${right}</div></div>`;
await loadDoc('<p>Avant</p>' + zoneDoc(
  '<p>Objet : Notification Décision n° ' + chip(LONG) + '</p>'
  + '<p>' + chip(LONG2) + '</p>'
  + '<p>' + chip('Nom') + '</p>'
  + '<p>' + chip(LONG, FMT) + '</p>'
  + '<p>' + chip(LONG, LOOP) + '</p>'
  + '<ul><li><p>' + chip(LONG2) + '</p></li></ul>',
  '<p style="text-align: right;">' + chip('Nom') + ' ' + chip(LONG) + '</p>'
  + '<p>' + chip(LONG3) + '</p>'
  + '<p>Texte ' + chip(LONG2) + ' suite</p>'
  + '<p>' + chip(LONG, FMT) + '</p>') + '<p>Après</p>');
const zoneList = await chipsInfo();
const zLeft = zoneList.filter(c => c.col === 0);
const zRight = zoneList.filter(c => c.col === 1);
const stays = c => c.outLeft <= 0.5 && c.outRight <= 0.5 && c.colOutLeft <= 0.5 && c.colOutRight <= 0.5;
check('zone 2 colonnes : 6 bulles dans la colonne de gauche, 5 dans celle de droite', zLeft.length === 6 && zRight.length === 5 && zoneList.length === 11, zoneList.map(c => [c.key, c.col]));
check('chaque bulle reste dans sa colonne et dans son paragraphe (aucune ne déborde sur la colonne voisine)', zoneList.every(stays), zoneList.map(c => [c.key, c.col, c.outLeft, c.outRight, c.colOutLeft, c.colOutRight]));
check('chaque bulle tient sur une seule ligne, dont celle d\'une puce de liste et celle qui suit du texte (la zone ne grandit plus avec les noms)', zoneList.every(c => c.h < 24), zoneList.map(c => [c.key, c.col, c.h]));
const zCut = zLeft.filter(c => c.label.length > 20);
check('colonne de gauche : les 5 noms longs perdent le milieu (début coupé, repère « #… », fin = dernier mot calée sur le bout du nom)',
  zCut.length === 5 && zCut.every(c => c.display === 'inline-flex' && c.head + c.tail === c.label && c.label.endsWith(c.tail) && c.headCut && c.headW >= 1.25 * c.em && c.tailAtEnd),
  zCut.map(c => [c.key, c.display, c.head, c.tail, c.headCut, c.headW, c.em, c.tailAtEnd]));
check('colonne de gauche : la fin est le dernier mot du nom (« proprietaire », « du_client »)',
  zCut.filter(c => c.key === 'Clients.' + LONG).every(c => c.tail === 'proprietaire') && zCut.filter(c => c.key === 'Clients.' + LONG2).every(c => c.tail === 'du_client'), zCut.map(c => [c.key, c.tail]));
const zShort = zLeft.find(c => c.key === 'Clients.Nom');
check('colonne de gauche : la bulle courte n\'est pas coupée', !!zShort && !zShort.tail && !zShort.headCut, zShort);
const rightWhole = zRight.filter(c => c.label.length < 60);
const rightHuge = zRight.find(c => c.key === 'Clients.' + LONG3);
check('colonne de droite : les noms qui tiennent (« #Clients.Nom_de_famille_du_proprietaire », l\'adresse) restent entiers, sans aucune coupure',
  rightWhole.length === 4 && rightWhole.every(c => !c.headCut && !c.tailClipped), rightWhole.map(c => [c.key, c.headCut, c.tailClipped]));
check('colonne de droite : un nom de ~110 caractères, plus large que la colonne, est coupé lui aussi (début coupé, bout du nom visible)',
  !!rightHuge && rightHuge.headCut && rightHuge.tail === 'de_livraison' && rightHuge.tailAtEnd && rightHuge.headW >= 1.25 * rightHuge.em, rightHuge);
const zoneHtml = await page.evaluate(() => {
  const doc = new DOMParser().parseFromString(Editor.getHTML(), 'text/html');
  const spans = Array.from(doc.querySelectorAll('.two-columns-zone span.var-badge'));
  return { count: spans.length, wholeText: spans.every(s => s.childNodes.length === 1 && s.firstChild.nodeType === 3 && s.textContent === '#' + s.dataset.key), noParts: !/var-badge-(head|tail)/.test(Editor.getHTML()), zones: doc.querySelectorAll('.two-columns-zone').length };
});
check('zone 2 colonnes : getHTML() garde le nom entier de chaque bulle dans un seul texte, sans trace du découpage', zoneHtml.count === 11 && zoneHtml.zones === 1 && zoneHtml.wholeText && zoneHtml.noParts, zoneHtml);

// Le point bleu du format (hors de la boîte de la bulle) n'est pas rogné dans une colonne non plus : aucune bulle ne porte d'`overflow`, et le coin d'une bulle à
// format de la colonne de DROITE (loin de la poignée de la zone, qui recouvre le bord de la colonne de gauche) est atteint.
const zoneDot = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('.tiptap .two-columns-column .var-badge'));
  const b = document.querySelectorAll('.tiptap .two-columns-column')[1].querySelector('.var-badge[data-format]');
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  const el = document.elementFromPoint(r.right, r.top);
  return { visibleOverflow: all.every(x => getComputedStyle(x).overflowX === 'visible' && getComputedStyle(x).overflowY === 'visible'), onChip: el === b, tag: el && el.tagName, cls: el && el.className };
});
check('zone 2 colonnes : le point bleu du format n\'est pas rogné (aucune bulle n\'a d\'overflow ; on atteint le coin d\'une bulle à format)', zoneDot.visibleOverflow && zoneDot.onChip, zoneDot);

// Survol, clic et Ctrl+C à la vraie souris sur des bulles de la zone (on les amène à l'écran d'abord : le panneau ne montre que ~200 px de feuille).
async function reveal(index) {
  await page.evaluate(i => document.querySelectorAll('.tiptap span.var-badge')[i].scrollIntoView({ block: 'center', inline: 'nearest' }), index);
  await sleep(250);
  return (await chipsInfo())[index];
}
const zLong = await reveal(zLeft[0].index);
await hoverOn(zLong);
check('survol d\'une bulle coupée de la colonne de gauche : le nom entier en info-bulle', (await chipsInfo())[zLeft[0].index].title === LABEL(LONG), (await chipsInfo())[zLeft[0].index].title);
const zWhole = await reveal(zRight[1].index);
await hoverOn(zWhole);
check('survol d\'une bulle entière de la colonne de droite : pas d\'info-bulle', (await chipsInfo())[zRight[1].index].title === '', (await chipsInfo())[zRight[1].index].title);
const zHuge = await reveal(zRight[2].index);
await hoverOn(zHuge);
check('survol du nom de ~110 caractères de la colonne de droite : le nom entier en info-bulle', (await chipsInfo())[zRight[2].index].title === LABEL(LONG3), (await chipsInfo())[zRight[2].index].title);
const zClick = await reveal(zLeft[0].index);
await page.mouse.click(zClick.x, zClick.y);
await sleep(300);
const zSelected = await page.evaluate(() => {
  const s = EditorCore.getEditor().state.selection;
  return { key: s.node ? s.node.attrs.key : null, marked: document.querySelectorAll('.tiptap span.var-badge.ProseMirror-selectednode').length };
});
check('clic sur une bulle coupée de la colonne de gauche : c\'est elle qui est sélectionnée', zSelected.key === 'Clients.' + LONG && zSelected.marked === 1, zSelected);
const zCondBtn = await hitTest('.v2-varfmt-toolbar.visible button[data-action="var-condition"]');
check('... et la barre de variable s\'ouvre, son icône Condition atteignable à 700x400', zCondBtn.found && zCondBtn.inViewport && zCondBtn.onTop, zCondBtn);
await page.evaluate(() => { window.__copied = null; });
await page.keyboard.press('Control+c');
await sleep(250);
const zCopied = await page.evaluate(() => window.__copied);
check('Ctrl+C sur cette bulle : le presse-papiers reçoit la bulle entière, pas un début et une fin',
  !!zCopied && zCopied.html.includes(`>${LABEL(LONG)}</span>`) && !/var-badge-(head|tail)/.test(zCopied.html), zCopied);
await page.mouse.click(2, 2);

// Poignée de la zone glissée à la vraie souris : colonne de gauche élargie, les noms y tiennent en entier ; ramenée, ils sont de nouveau coupés dans leur colonne.
async function dragZoneGrip(dx) {
  const grip = await page.evaluate(() => {
    const g = document.querySelector('.tiptap .two-columns-resize-grip');
    g.scrollIntoView({ block: 'center' });
    const r = g.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    return { x, y, onTop: document.elementFromPoint(x, y) === g, leftW: document.querySelector('.tiptap .two-columns-column').getBoundingClientRect().width };
  });
  await page.mouse.move(grip.x - 40, grip.y);
  await page.mouse.move(grip.x, grip.y, { steps: 4 });
  await sleep(200);
  await page.mouse.down();
  await page.mouse.move(grip.x + dx, grip.y, { steps: 10 });
  await page.mouse.up();
  await settle();
  const leftW = await page.evaluate(() => document.querySelector('.tiptap .two-columns-column').getBoundingClientRect().width);
  return { onTop: grip.onTop, before: grip.leftW, after: leftW };
}
const gripWide = await dragZoneGrip(250);
const wideList = await chipsInfo();
const wideLeft = wideList.filter(c => c.col === 0);
check('poignée glissée vers la droite : la colonne de gauche s\'élargit (poignée atteinte à la souris)', gripWide.onTop && gripWide.after > gripWide.before + 150, gripWide);
check('colonne de gauche élargie : les noms y sont entiers (plus de coupure), sur une ligne, dans la colonne',
  wideLeft.length === 6 && wideLeft.every(c => !c.headCut && !c.tailClipped && c.h < 24 && stays(c)), wideLeft.map(c => [c.key, c.headCut, c.tailClipped, c.h, c.colOutRight]));
check('... et toutes les bulles de la zone restent dans leur colonne (celle de droite, devenue étroite, en coupe à son tour)', wideList.every(stays) && wideList.every(c => c.h < 24), wideList.map(c => [c.key, c.col, c.colOutRight, c.h]));
const gripBack = await dragZoneGrip(-250);
const backList = await chipsInfo();
check('poignée ramenée à gauche : la colonne de gauche se rétrécit', gripBack.after < gripWide.after - 150, { gripWide, gripBack });
check('colonne de gauche rétrécie : les noms longs sont de nouveau coupés au milieu, chacun dans sa colonne, sur une ligne',
  backList.filter(c => c.col === 0 && c.label.length > 20).every(c => c.headCut && c.tailAtEnd) && backList.every(stays) && backList.every(c => c.h < 24), backList.map(c => [c.key, c.col, c.headCut, c.colOutRight, c.h]));

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
