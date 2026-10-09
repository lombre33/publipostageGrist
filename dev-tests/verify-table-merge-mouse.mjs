#!/usr/bin/env node
// Fusionner et scinder des cases d'un tableau de DOCUMENT (js/table-merge.js, barre du tableau ; Antoine, 04/10 : « fusion de cellules dans les documents » à coder pour la bêta) à la VRAIE
// souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), à la taille du panneau Grist (~700x400), en thème clair puis sombre. Une page.evaluate ne déclenche ni un appui
// « trusted », ni le survol, ni le glissé : c'est ici qu'on s'assure que
//   - la barre flottante du tableau porte ses 17 boutons sur une seule ligne, entière dans le panneau, avec « Fusionner les cases » et « Scinder la case » entre « Supprimer le tableau » et
//     « Légende » (Bordures et alignement vertical : dev-tests/verify-doc-table-tools-mouse.mjs) ; les deux grisés (jamais retirés, survol gardé pour l'info-bulle) quand ils ne servent pas, avec leur raison ;
//   - glisser sur quatre cases puis cliquer « Fusionner » en fait UNE case qui occupe exactement la place des quatre (les autres cases ne bougent pas), le texte à la suite ; UN Ctrl+Z la défait ;
//   - « Scinder » rend les cases à leur place et à leur taille ; une ligne de titre se fusionne sur toute la largeur ;
//   - avec le suivi des modifications, les deux boutons sont grisés (raison : le suivi) et un clic dessus ne fait rien, puis ils se dégrisent.
// Les commandes, les gardes (boucle, case qui dépasse), la Lecture, le PDF et le Word sont dans dev-tests/scenarios-table-merge.js (groupe tableMerge).
// Lancé par run-headless.mjs (groupe Node « tableMergeMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-table-merge-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TABLE_MERGE_MOUSE_PORT || 8972);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-grid-cells-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
].filter(([, rel]) => rel !== 'umd/exceljs.min.js' || existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[verify-table-merge-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
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
  return { context, page };
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
  await page.waitForTimeout(150);
  return b;
}

// Le centre de la case dont le texte est exactement `text` (une case fusionnée se retrouve par son premier paragraphe).
const cellPoint = (page, text) => page.evaluate((wanted) => {
  const td = Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).find(c => c.querySelector('p') && c.querySelector('p').textContent === wanted);
  if (!td) return null;
  const r = td.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, text);

// Le centre de la case de la ligne `r` et de la colonne `c` (depuis 1) d'un tableau encore sans fusion.
const slotPoint = (page, r, c) => page.evaluate(([row, col]) => {
  const td = document.querySelector(`.tiptap table > tbody > tr:nth-child(${row}) > td:nth-child(${col})`);
  if (!td) return null;
  const b = td.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, [r, c]);
async function clickCell(page, at) {
  const p = Array.isArray(at) ? await slotPoint(page, at[0], at[1]) : await cellPoint(page, at);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
}
// Appuie sur la case `from`, glisse sur la case `to`, relâche : une sélection de cases.
async function dragCells(page, from, to) {
  const a = Array.isArray(from) ? await slotPoint(page, from[0], from[1]) : await cellPoint(page, from);
  const b = Array.isArray(to) ? await slotPoint(page, to[0], to[1]) : await cellPoint(page, to);
  await page.mouse.move(a.x, a.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

// Les cases du premier tableau : forme, texte (un élément par paragraphe), largeur enregistrée, et leur rectangle à l'écran.
const cellsOf = page => page.evaluate(() => {
  const out = [];
  const rows = Array.from(document.querySelectorAll('.tiptap table > tbody > tr'));
  rows.forEach((tr, r) => Array.from(tr.children).forEach((td) => {
    const b = td.getBoundingClientRect();
    out.push({ row: r, text: td.textContent, paragraphs: Array.from(td.querySelectorAll(':scope > p')).map(p => p.textContent), colspan: td.colSpan, rowspan: td.rowSpan, left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width });
  }));
  return out;
});
const selectedCount = page => page.evaluate(() => document.querySelectorAll('.tiptap td.selectedCell, .tiptap th.selectedCell').length);
const byText = (cells, text) => cells.find(c => c.paragraphs[0] === text) || null;
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
const sameRect = (a, b, tolerance = 1.5) => !!a && !!b && near(a.left, b.left, tolerance) && near(a.top, b.top, tolerance) && near(a.right, b.right, tolerance) && near(a.bottom, b.bottom, tolerance);

// Un document : un paragraphe, un tableau 4 lignes x 3 colonnes aux largeurs réglées (140, 190 et 120 px), un paragraphe. B1, A2 et B2 sont vides : fusionner A1 à B2 n'y ajoute aucune ligne de
// texte, la case fusionnée occupe alors exactement la place des quatre (une case fusionnée qui reçoit du texte s'agrandit pour le montrer, comme dans toute table).
const EMPTY = new Set(['B1', 'A2', 'B2']);
const DOC = '<p>Avant le tableau</p><table><tbody>'
  + [1, 2, 3, 4].map(r => '<tr>' + [140, 190, 120].map((w, c) => `<td colwidth="${w}"><p>${EMPTY.has('ABC'[c] + r) ? '' : 'ABC'[c] + r}</p></td>`).join('') + '</tr>').join('')
  + '</tbody></table><p>Après le tableau</p>';

// Contraste WCAG de deux couleurs CSS « rgb(...) ».
const CONTRAST_FN = `(a, b) => {
  const parse = c => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const la = lum(parse(a)), lb = lum(parse(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}`;

const BAR = '.v2-floating-toolbar.visible';
const button = action => `${BAR} button[data-action="${action}"]`;
// Chaque bouton de la barre du tableau : visible, grisé, info-bulle, entier dans le panneau ; l'ordre (de gauche à droite) et la hauteur de la barre.
const barState = page => page.evaluate((sel) => {
  const bar = document.querySelector(sel);
  if (!bar) return null;
  const buttons = {};
  const order = [];
  bar.querySelectorAll('button[data-action]').forEach(b => {
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    const shown = cs.display !== 'none' && r.width > 0;
    if (shown) order.push([r.left, b.dataset.action]);
    buttons[b.dataset.action] = {
      shown, disabled: b.classList.contains('is-disabled'), aria: b.getAttribute('aria-disabled'), title: b.title, opacity: Number(cs.opacity), pointer: cs.pointerEvents, color: cs.color,
      inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
    };
  });
  order.sort((a, b) => a[0] - b[0]);
  const r = bar.getBoundingClientRect();
  return { buttons, order: order.map(o => o[1]), height: r.height, background: getComputedStyle(bar).backgroundColor, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
}, BAR);

async function runTheme(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Fusion de cases d'un tableau de document à la souris, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await page.evaluate(`window.__ratio = ${CONTRAST_FN};`);
  await page.evaluate(html => { GridEditor.setActive(false); Editor.setHTML(html); const box = document.getElementById('editor-container'); box.scrollTop = 0; }, DOC);
  await page.waitForTimeout(500);

  // ---------- 1) La barre, curseur dans une case ----------
  await clickCell(page, [2, 2]);
  const SHOWN = ['row-before', 'row-after', 'row-del', 'rows-equalize', 'col-before', 'col-after', 'col-del', 'cols-equalize', 'table-del', 'cell-merge', 'cell-split', 'caption', 'fill-open', 'borders-open', 'valign-top', 'valign-middle', 'valign-bottom'];
  let bar = await barState(page);
  check(`${label} - la barre du tableau porte ses 17 boutons dans l'ordre Lignes, Colonnes (chacune avec son « Égaliser »), Tableau, Fusion, Légende, Fond, Bordures, Alignements, sur une seule ligne, entière dans le panneau`,
    !!bar && bar.order.join() === SHOWN.join() && bar.inside && bar.height <= 40 && SHOWN.every(a => bar.buttons[a].inside), { order: bar && bar.order, height: bar && bar.height, inside: bar && bar.inside });
  check(`${label} - une seule case choisie : « Fusionner » et « Scinder » sont grisés (visibles, atténués, survol gardé), avec leur raison pour info-bulle`,
    !!bar && ['cell-merge', 'cell-split'].every(a => bar.buttons[a].shown && bar.buttons[a].disabled && bar.buttons[a].aria === 'true' && bar.buttons[a].opacity < 0.5 && bar.buttons[a].pointer !== 'none')
    && bar.buttons['cell-merge'].title === 'Fusionner les cases : sélectionnez-en au moins deux, en glissant sur le tableau' && bar.buttons['cell-split'].title === 'Scinder la case : placez le curseur dans une case fusionnée', bar && bar.buttons);
  check(`${label} - les autres boutons ne sont pas grisés`, !!bar && ['row-before', 'col-after', 'fill-open', 'caption'].every(a => !bar.buttons[a].disabled), bar && bar.buttons);
  const original = await cellsOf(page);
  await realClick(page, button('cell-split'));
  await realClick(page, button('cell-merge'));
  const afterNoop = await cellsOf(page);
  check(`${label} - un clic sur un bouton grisé ne fait rien`, afterNoop.length === 12 && original.every((c, i) => sameRect(c, afterNoop[i], 0.6)), afterNoop.length);

  // ---------- 2) Glisser sur quatre cases, fusionner, annuler ----------
  await page.waitForTimeout(650);
  await dragCells(page, [1, 1], [2, 2]);
  bar = await barState(page);
  check(`${label} - glisser de A1 à B2 choisit 4 cases ; la barre reste entière dans le panneau, « Fusionner » est actif, « Scinder » reste grisé`,
    (await selectedCount(page)) === 4 && !!bar && bar.inside && !bar.buttons['cell-merge'].disabled && bar.buttons['cell-merge'].opacity > 0.9 && bar.buttons['cell-merge'].title === 'Fusionner les cases'
    && bar.buttons['cell-split'].disabled, { selected: await selectedCount(page), bar: bar && [bar.inside, bar.buttons['cell-merge'], bar.buttons['cell-split']] });
  const contrast = await page.evaluate(([sel, bg]) => window.__ratio(getComputedStyle(document.querySelector(sel)).color, bg), [button('cell-merge'), bar && bar.background]);
  check(`${label} - l'icône de « Fusionner » se lit sur la barre (contraste ≥ 3:1) : ${Math.round(contrast * 100) / 100}`, contrast >= 3, contrast);
  await realClick(page, button('cell-merge'));
  const merged = await cellsOf(page);
  const mergedCell = merged.find(c => c.colspan === 2 && c.rowspan === 2);
  const union = { left: original[0].left, top: original[0].top, right: original[1].right, bottom: original[4].bottom };
  const stay = ['C1', 'C2', 'A3', 'B3', 'C3', 'A4', 'B4', 'C4'].every(t => sameRect(byText(merged, t), byText(original, t)));
  check(`${label} - « Fusionner » (vrai clic) fait UNE case de 2 colonnes et 2 lignes (8 cases + elle), qui occupe exactement la place des quatre ; les autres cases ne bougent pas ; le texte est gardé`,
    merged.length === 9 && !!mergedCell && sameRect(mergedCell, union) && stay && mergedCell.paragraphs.join('|') === 'A1', { count: merged.length, mergedCell, union, stay });
  bar = await barState(page);
  check(`${label} - la case fusionnée est choisie : « Fusionner » se grise, « Scinder » devient actif`, !!bar && bar.buttons['cell-merge'].disabled && !bar.buttons['cell-split'].disabled && bar.buttons['cell-split'].title === 'Scinder la case' && (await selectedCount(page)) === 1, bar && bar.buttons);
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const undone = await cellsOf(page);
  check(`${label} - un seul Ctrl+Z rend le tableau d'avant : 12 cases, aux mêmes places et aux mêmes tailles`, undone.length === 12 && original.every((c, i) => sameRect(c, undone[i], 0.6) && c.paragraphs.join() === undone[i].paragraphs.join()), undone.length);

  // ---------- 3) Scinder ----------
  await page.waitForTimeout(650);
  await dragCells(page, [1, 1], [2, 2]);
  await realClick(page, button('cell-merge'));
  await page.waitForTimeout(650);
  await realClick(page, button('cell-split'));
  const split = await cellsOf(page);
  const first = byText(split, 'A1');
  const back = split.length === 12 && split.every((c, i) => sameRect(c, original[i], 2.5));
  check(`${label} - « Scinder » (vrai clic) rend 12 cases, chacune à sa place et à sa taille d'avant ; la première garde le texte, les trois autres naissent vides`,
    split.length === 12 && split.every(c => c.colspan === 1 && c.rowspan === 1) && !!first && first.paragraphs.join('|') === 'A1' && back && split.filter(c => c.text === '').length === 3, { count: split.length, back, texts: split.map(c => c.text) });
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const remerged = await cellsOf(page);
  check(`${label} - Ctrl+Z annule « Scinder » en un seul geste : la case fusionnée est de retour`, remerged.length === 9 && !!remerged.find(c => c.colspan === 2 && c.rowspan === 2), remerged.length);
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);

  // ---------- 4) Une ligne de titre sur toute la largeur ----------
  await page.waitForTimeout(650);
  await dragCells(page, 'A3', 'C3');
  await realClick(page, button('cell-merge'));
  const title = await cellsOf(page);
  const titleCell = title.find(c => c.colspan === 3);
  // Trois textes à la suite dans une seule ligne : la case se fait plus haute (elle montre tout), les lignes d'en dessous descendent d'autant mais restent dans leurs colonnes.
  const below = ['A4', 'B4', 'C4'].map(t => [byText(title, t), byText(original, t)]);
  check(`${label} - une ligne de titre : les trois cases de la 3e ligne en une seule sur toute la largeur du tableau, le texte à la suite, la ligne d'en dessous dans les mêmes colonnes`,
    !!titleCell && near(titleCell.left, original[6].left) && near(titleCell.right, original[8].right) && titleCell.paragraphs.join('|') === 'A3|B3|C3'
    && below.every(([now, before]) => !!now && near(now.left, before.left) && near(now.right, before.right) && now.top >= before.top - 0.6), { titleCell, below: below.map(([n, b]) => n && [n.left, n.top, b.left, b.top]) });
  await page.waitForTimeout(650);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);

  // ---------- 5) Le suivi des modifications grise les deux boutons ----------
  await realClick(page, '#v2-btn-track-changes');
  await page.waitForTimeout(200);
  const tracking = await page.evaluate(() => Editor.isTrackChangesOn());
  await dragCells(page, 'A3', 'B4');
  bar = await barState(page);
  const trackedTitle = 'Indisponible avec le suivi des modifications : la forme du tableau changerait';
  check(`${label} - suivi des modifications allumé et 4 cases choisies : « Fusionner » est grisé avec sa raison (le suivi), la barre est toujours là`,
    tracking && (await selectedCount(page)) === 4 && !!bar && bar.buttons['cell-merge'].shown && bar.buttons['cell-merge'].disabled && bar.buttons['cell-merge'].title === trackedTitle && bar.buttons['cell-merge'].opacity < 0.5, { tracking, bar: bar && bar.buttons['cell-merge'] });
  await realClick(page, button('cell-merge'));
  const stillTwelve = await cellsOf(page);
  check(`${label} - un clic sur « Fusionner » pendant le suivi ne fait rien : 12 cases, aucune modification proposée`, stillTwelve.length === 12 && !(await page.evaluate(() => Editor.hasPendingTrackedChanges())), stillTwelve.length);
  await realClick(page, '#v2-btn-track-changes');
  await page.waitForTimeout(250);
  await dragCells(page, 'A3', 'B4');
  bar = await barState(page);
  check(`${label} - le suivi éteint, « Fusionner » est de nouveau actif`, !(await page.evaluate(() => Editor.isTrackChangesOn())) && !!bar && !bar.buttons['cell-merge'].disabled && bar.buttons['cell-merge'].title === 'Fusionner les cases', bar && bar.buttons['cell-merge']);

  await context.close();
}

await runTheme('light');
await runTheme('dark');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
