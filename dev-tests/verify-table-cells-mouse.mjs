#!/usr/bin/env node
// Plusieurs cases d'un tableau de document sélectionnées d'un coup (glissé de la souris, js/table-select.js) : la mise en forme de la barre d'outils et le copier-coller portent sur
// TOUTES les cases (demande d'Antoine, 02/10 : « dans un module tableau on peut bel et bien sélectionner désormais plusieurs cellules d'un coup, par contre j'ai l'impression que je ne
// peux pas faire d'édition dessus ? Le but serait de pouvoir mettre en forme et/ou C/C la sélection »), à la VRAIE souris et au VRAI clavier (Node/Playwright), à la taille du panneau
// Grist (~700x400). Une page.evaluate ne déclenche ni un appui « trusted », ni le survol, ni Ctrl+C / Ctrl+V : c'est ici qu'on s'assure que
//   - glisser sur quatre cases (2x2) puis cliquer la taille, la police, la couleur, le surlignage ou « Liste à puces » met en forme les quatre cases, aucune autre, et que la sélection
//     de cases reste (la mise en forme suivante, un Ctrl+C partent de la même sélection) ; un seul Annuler défait la dernière mise en forme sur toutes les cases ;
//   - la « Citation » (menu au survol de l'icône chaîne) entoure le contenu des quatre cases, un second clic l'en sort ; « Retrait » emboîte les éléments de chaque liste des quatre cases
//     sous le premier et « Retrait inverse » les sort de leur liste, les deux boutons (grisés avant) sont actifs dès que les cases ont une liste, un seul Annuler rend l'état d'avant ;
//   - les touches d'origine de la citation et des listes (Ctrl+Maj+B, Ctrl+Maj+8 puces, Ctrl+Maj+7 numérotée, Ctrl+Maj+9 tâches) font la même chose que leur bouton sur les quatre cases (celles de l'éditeur ne traitent
//     que la case de tête) : la sélection de cases reste, une seconde fois elles défont, un seul Annuler rend l'état d'avant ;
//   - Ctrl+C met dans le presse-papiers un tableau (HTML) ET un texte brut tabulé (cases séparées par une tabulation, lignes par un retour à la ligne) ; Ctrl+V dans une autre case
//     colle les quatre valeurs à partir d'elle, Ctrl+X vide les cases coupées, Suppr aussi.
// Lancé par run-headless.mjs (groupe Node « tableCellsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-table-cells-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TABLE_CELLS_PORT || 8935);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-read-mode-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-table-cells-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  await page.waitForTimeout(120);
  return b;
}

const cellBox = (page, r, c) => boxOf(page, `.tiptap table tr:nth-child(${r}) > :nth-child(${c})`);

// Les cases sélectionnées, lues sur le rendu : rectangle (lignes et colonnes, depuis 1) et nombre ; la sélection de ProseMirror doit être une sélection de cases.
const selectedRect = page => page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('.tiptap td.selectedCell, .tiptap th.selectedCell'));
  const sel = EditorCore.getEditor().state.selection;
  if (!els.length) return { count: 0, isCell: !!sel.$anchorCell };
  const rows = els.map(e => e.parentElement.rowIndex + 1), cols = els.map(e => e.cellIndex + 1);
  return { count: els.length, r1: Math.min(...rows), r2: Math.max(...rows), c1: Math.min(...cols), c2: Math.max(...cols), isCell: !!sel.$anchorCell };
});
const wantRect = (from, to) => {
  const r1 = Math.min(from[0], to[0]), r2 = Math.max(from[0], to[0]), c1 = Math.min(from[1], to[1]), c2 = Math.max(from[1], to[1]);
  return { count: (r2 - r1 + 1) * (c2 - c1 + 1), r1, r2, c1, c2, isCell: true };
};
const sameRect = (got, want) => got.isCell && got.count === want.count && got.r1 === want.r1 && got.r2 === want.r2 && got.c1 === want.c1 && got.c2 === want.c2;
const show = r => r.count ? `${r.count} cases, lignes ${r.r1}-${r.r2}, colonnes ${r.c1}-${r.c2}${r.isCell ? '' : ' (pas une sélection de cases)'}` : `aucune case${r.isCell ? '' : ' (pas une sélection de cases)'}`;

// Gare la souris dans le coin du panneau d'édition : un menu au survol de la barre (styles de liste) reste ouvert tant que le pointeur est sur lui, et il recouvre alors des cases du tableau.
async function parkMouse(page) {
  const box = await boxOf(page, '#editor-container');
  await page.mouse.move(box.left + 4, box.bottom - 4, { steps: 3 });
  await page.waitForTimeout(300);
}

// Clic de souris sur une case du tableau (la souris est garée avant).
async function clickCell(page, r, c) {
  await parkMouse(page);
  const b = await cellBox(page, r, c);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(150);
}

// Appuie sur la case `from`, glisse sur la case `to`, relâche.
async function dragCells(page, from, to) {
  await parkMouse(page);
  const a = await cellBox(page, from[0], from[1]);
  const b = await cellBox(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y, { steps: 2 });
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(120);
  return selectedRect(page);
}

const ROWS = 4, COLS = 3;
const TABLE = '<p>Avant</p><table><tbody>' + Array.from({ length: ROWS }, (_, r) => '<tr>' + Array.from({ length: COLS }, (_, c) => `<td><p>R${r + 1}C${c + 1} texte</p></td>`).join('') + '</tr>').join('') + '</tbody></table><p>Après</p>';
const FROM = [2, 2], TO = [3, 3]; // le carré du milieu : quatre cases, des cases intactes tout autour
const inSquare = (r, c) => r >= FROM[0] && r <= TO[0] && c >= FROM[1] && c <= TO[1];

async function loadDoc(page, html) {
  await page.evaluate(h => {
    GridEditor.setActive(false);
    EditorCore.getEditor().commands.setContent(h);
    const box = document.getElementById('editor-container');
    box.scrollTop = 0; box.scrollLeft = 0;
  }, html);
  await page.waitForTimeout(450);
}

// Ce que porte chaque case, lu sur le rendu : texte, taille / police / couleur / surlignage du texte, gras, liste.
const cellsState = page => page.evaluate(() => {
  const out = {};
  document.querySelectorAll('.tiptap table tr').forEach((tr, ri) => Array.from(tr.children).forEach((td, ci) => {
    const styled = prop => { const el = Array.from(td.querySelectorAll('span[style]')).find(s => s.style[prop]); return el ? el.style[prop] : ''; };
    out[(ri + 1) + ',' + (ci + 1)] = {
      text: td.textContent, size: styled('fontSize'), family: styled('fontFamily'), color: styled('color'), background: styled('backgroundColor'),
      bold: !!td.querySelector('strong, b'), list: !!td.querySelector('ul > li'), ordered: !!td.querySelector('ol > li'), task: !!td.querySelector('ul[data-type="taskList"]'),
      quote: !!td.querySelector(':scope > blockquote'), items: td.querySelectorAll('li').length, nested: td.querySelectorAll('li li').length, paragraphs: td.querySelectorAll(':scope > p').length,
    };
  }));
  return out;
});
const keys = (pred) => { const list = []; for (let r = 1; r <= ROWS; r++) for (let c = 1; c <= COLS; c++) if (pred(r, c)) list.push(r + ',' + c); return list; };
const INSIDE = keys(inSquare), OUTSIDE = keys((r, c) => !inSquare(r, c));

// Presse-papiers : ce que Ctrl+C / Ctrl+X y mettent, lu par un écouteur du document qui passe après celui de l'éditeur.
async function spyClipboard(page) {
  await page.evaluate(() => {
    window.__clip = null;
    if (window.__clipSpy) return;
    window.__clipSpy = true;
    for (const type of ['copy', 'cut']) document.addEventListener(type, (e) => { window.__clip = { type, text: e.clipboardData.getData('text/plain'), html: e.clipboardData.getData('text/html') }; });
  });
}

async function runTheme(colorScheme) {
  const label = colorScheme === 'dark' ? 'sombre' : 'clair';
  const { context, page } = await openWidget(colorScheme);
  await spyClipboard(page);

  // ---- 1. Mise en forme de la barre d'outils : les quatre cases, aucune autre, la sélection de cases reste ----
  async function openMenuAndPick(openSel, itemSel) {
    const opener = await realClick(page, openSel);
    check(`${label} - ${openSel} est visible dans le panneau`, !!opener && opener.inViewport, opener);
    // La liste d'un menu peut dépasser le panneau de 400 px : on la fait défiler jusqu'à l'entrée, comme une personne à la molette.
    await page.evaluate(sel => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: 'nearest' }); }, itemSel);
    await page.waitForTimeout(60);
    const item = await realClick(page, itemSel);
    check(`${label} - l'entrée ${itemSel} du menu est visible dans le panneau`, !!item && item.inViewport, item);
  }
  const controls = [
    ['gras', async () => realClick(page, '#v2-btn-bold'), s => s.bold],
    ['taille 12 pt (menu)', () => openMenuAndPick('#v2-size-chip-val', '.v2-format-panel.visible button[data-action="12pt"]'), s => s.size === '12pt'],
    ['police Georgia (menu)', () => openMenuAndPick('#v2-font-chip', '.v2-format-panel.visible button[data-action="Georgia"]'), s => /Georgia/.test(s.family)],
    ['couleur de police rouge (palette)', () => openMenuAndPick('#v2-btn-text-color-caret', '.v2-color-dropdown.visible button[data-action="pick:#b91c1c"]'), s => s.color === 'rgb(185, 28, 28)'],
    ['surlignage jaune (palette)', () => openMenuAndPick('#v2-btn-highlight-caret', '.v2-color-dropdown.visible button[data-action="pick:#fff2a8"]'), s => s.background === 'rgb(255, 242, 168)'],
    ['« + » de la taille', () => realClick(page, '#v2-size-plus'), s => s.size !== ''],
    ['liste à puces', () => realClick(page, '#v2-btn-bullet'), s => s.list],
    ['numérotation a. b. c. (menu au survol des listes)', async () => {
      const main = await boxOf(page, '#v2-btn-bullet');
      await page.mouse.move(main.x, main.y, { steps: 3 });
      await page.waitForTimeout(350);
      const item = await realClick(page, '#v2-btn-ordered-alpha');
      check(`${label} - le style a. b. c. du menu des listes est visible dans le panneau`, !!item && item.inViewport, item);
    }, s => s.ordered],
  ];
  for (const [name, act, has] of controls) {
    await loadDoc(page, TABLE);
    const rect = await dragCells(page, FROM, TO);
    check(`${label} - ${name} : le glissé choisit bien les quatre cases du milieu`, sameRect(rect, wantRect(FROM, TO)), show(rect));
    await act();
    await page.waitForTimeout(200);
    const state = await cellsState(page);
    check(`${label} - ${name} : les quatre cases sélectionnées sont mises en forme`, INSIDE.every(k => has(state[k])), INSIDE.map(k => [k, has(state[k])]));
    check(`${label} - ${name} : aucune autre case ne change`, OUTSIDE.every(k => !has(state[k])), OUTSIDE.filter(k => has(state[k])));
    const after = await selectedRect(page);
    check(`${label} - ${name} : la sélection de cases reste (mêmes quatre cases, voile visible)`, sameRect(after, wantRect(FROM, TO)), show(after));
  }

  // Deux mises en forme à la suite sur la même sélection, puis un seul Annuler : la seconde disparaît des quatre cases, la première reste.
  await loadDoc(page, TABLE);
  await dragCells(page, FROM, TO);
  await openMenuAndPick('#v2-size-chip-val', '.v2-format-panel.visible button[data-action="14pt"]');
  await page.waitForTimeout(150);
  await openMenuAndPick('#v2-btn-text-color-caret', '.v2-color-dropdown.visible button[data-action="pick:#15803d"]');
  await page.waitForTimeout(250);
  let state = await cellsState(page);
  check(`${label} - une taille puis une couleur sur la même sélection : les quatre cases portent les deux`, INSIDE.every(k => state[k].size === '14pt' && state[k].color !== ''), INSIDE.map(k => [k, state[k].size, state[k].color]));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  state = await cellsState(page);
  check(`${label} - un seul Annuler retire la couleur des quatre cases et garde la taille`, INSIDE.every(k => state[k].color === '' && state[k].size === '14pt'), INSIDE.map(k => [k, state[k].size, state[k].color]));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  state = await cellsState(page);
  check(`${label} - un second Annuler retire la taille des quatre cases`, INSIDE.every(k => state[k].size === ''), INSIDE.map(k => [k, state[k].size]));

  // Liste à puces : un second clic la retire de toutes les cases ; un seul Annuler la rend à toutes.
  await loadDoc(page, TABLE);
  await dragCells(page, FROM, TO);
  await realClick(page, '#v2-btn-bullet');
  await page.waitForTimeout(200);
  await realClick(page, '#v2-btn-bullet');
  await page.waitForTimeout(200);
  state = await cellsState(page);
  check(`${label} - un second clic sur « Liste à puces » la retire des quatre cases`, Object.values(state).every(s => !s.list));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  state = await cellsState(page);
  check(`${label} - un seul Annuler rend la liste aux quatre cases`, INSIDE.every(k => state[k].list) && OUTSIDE.every(k => !state[k].list));

  // ---- 1 bis. Citation et retrait : le menu au survol de l'icône chaîne, puis les deux boutons du retrait ----
  const hoverAndClick = async (hoverSel, targetSel, what) => {
    const main = await boxOf(page, hoverSel);
    await page.mouse.move(main.x, main.y, { steps: 3 });
    await page.waitForTimeout(350);
    const item = await realClick(page, targetSel);
    check(`${label} - ${what} est visible dans le panneau`, !!item && item.inViewport, item);
  };
  const disabledOf = id => page.evaluate(i => document.getElementById(i).disabled, id);

  await loadDoc(page, TABLE);
  const quoteRect = await dragCells(page, FROM, TO);
  check(`${label} - citation : le glissé choisit bien les quatre cases du milieu`, sameRect(quoteRect, wantRect(FROM, TO)), show(quoteRect));
  await hoverAndClick('#v2-btn-link', '#v2-btn-citation', 'la ligne « Citation » du menu');
  await page.waitForTimeout(200);
  state = await cellsState(page);
  check(`${label} - citation : le contenu des quatre cases sélectionnées entre dans une citation`, INSIDE.every(k => state[k].quote && state[k].text.length > 0), INSIDE.map(k => [k, state[k].quote]));
  check(`${label} - citation : aucune autre case ne change`, OUTSIDE.every(k => !state[k].quote), OUTSIDE.filter(k => state[k].quote));
  const quoteKept = await selectedRect(page);
  check(`${label} - citation : la sélection de cases reste (mêmes quatre cases)`, sameRect(quoteKept, wantRect(FROM, TO)), show(quoteKept));
  check(`${label} - citation : la ligne du menu est enfoncée`, await page.evaluate(() => document.getElementById('v2-btn-citation').classList.contains('is-active')));
  await hoverAndClick('#v2-btn-link', '#v2-btn-citation', 'la ligne « Citation » du menu (second clic)');
  await page.waitForTimeout(200);
  state = await cellsState(page);
  check(`${label} - un second clic sur « Citation » sort les quatre cases de leur citation`, Object.values(state).every(s => !s.quote));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  state = await cellsState(page);
  check(`${label} - un seul Annuler rend la citation aux quatre cases`, INSIDE.every(k => state[k].quote) && OUTSIDE.every(k => !state[k].quote), INSIDE.map(k => [k, state[k].quote]));

  // Le raccourci d'origine de la citation, Ctrl+Maj+B (celui de l'éditeur ne traite que la case de tête) : au vrai clavier, sur la sélection de cases.
  await loadDoc(page, TABLE);
  await dragCells(page, FROM, TO);
  await page.keyboard.press('Control+Shift+B');
  await page.waitForTimeout(200);
  state = await cellsState(page);
  check(`${label} - Ctrl+Maj+B met le contenu des quatre cases sélectionnées en citation, aucune autre`, INSIDE.every(k => state[k].quote) && OUTSIDE.every(k => !state[k].quote), { inside: INSIDE.map(k => [k, state[k].quote]), outside: OUTSIDE.filter(k => state[k].quote) });
  const shortcutKept = await selectedRect(page);
  check(`${label} - Ctrl+Maj+B : la sélection de cases reste`, sameRect(shortcutKept, wantRect(FROM, TO)), show(shortcutKept));
  await page.keyboard.press('Control+Shift+B');
  await page.waitForTimeout(200);
  state = await cellsState(page);
  check(`${label} - Ctrl+Maj+B une seconde fois : les quatre cases sortent de leur citation`, Object.values(state).every(s => !s.quote));

  // Les touches d'origine des listes, Ctrl+Maj+8 (puces), Ctrl+Maj+7 (numérotée) et Ctrl+Maj+9 (tâches) : celles de l'éditeur ne traitent que la case de tête ; au vrai clavier, sur la sélection de cases.
  // 600 ms entre deux appuis : l'historique de ProseMirror groupe les gestes plus proches (un Annuler rendrait alors les deux).
  for (const [chord, name, has] of [['Control+Shift+8', 'Ctrl+Maj+8', s => s.list], ['Control+Shift+7', 'Ctrl+Maj+7', s => s.ordered], ['Control+Shift+9', 'Ctrl+Maj+9', s => s.task]]) {
    await loadDoc(page, TABLE);
    await dragCells(page, FROM, TO);
    await page.keyboard.press(chord);
    await page.waitForTimeout(600);
    state = await cellsState(page);
    check(`${label} - ${name} pose la liste dans les quatre cases sélectionnées, aucune autre`, INSIDE.every(k => has(state[k])) && OUTSIDE.every(k => !has(state[k])), { inside: INSIDE.map(k => [k, has(state[k])]), outside: OUTSIDE.filter(k => has(state[k])) });
    const listKept = await selectedRect(page);
    check(`${label} - ${name} : la sélection de cases reste`, sameRect(listKept, wantRect(FROM, TO)), show(listKept));
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    state = await cellsState(page);
    check(`${label} - ${name} : un seul Annuler retire la liste des quatre cases`, Object.values(state).every(s => !has(s)), INSIDE.map(k => [k, has(state[k])]));
    await loadDoc(page, TABLE);
    await dragCells(page, FROM, TO);
    await page.keyboard.press(chord);
    await page.waitForTimeout(300);
    await page.keyboard.press(chord);
    await page.waitForTimeout(250);
    state = await cellsState(page);
    check(`${label} - ${name} une seconde fois : la liste sort des quatre cases`, Object.values(state).every(s => !has(s)), INSIDE.map(k => [k, has(state[k])]));
  }

  const LISTS = '<p>Avant</p><table><tbody>' + Array.from({ length: ROWS }, (_, r) => '<tr>' + Array.from({ length: COLS }, (_, c) => `<td><ul><li>a${r + 1}${c + 1}</li><li>b${r + 1}${c + 1}</li><li>c${r + 1}${c + 1}</li></ul></td>`).join('') + '</tr>').join('') + '</tbody></table><p>Après</p>';
  await loadDoc(page, LISTS);
  const listRect = await dragCells(page, FROM, TO);
  check(`${label} - retrait : le glissé choisit bien les quatre cases du milieu`, sameRect(listRect, wantRect(FROM, TO)), show(listRect));
  check(`${label} - retrait : « Retrait » et « Retrait inverse » sont actifs (les cases contiennent des listes)`, !(await disabledOf('v2-btn-indent')) && !(await disabledOf('v2-btn-outdent')), { indent: await disabledOf('v2-btn-indent'), outdent: await disabledOf('v2-btn-outdent') });
  const indentBox = await realClick(page, '#v2-btn-indent');
  check(`${label} - le bouton « Retrait » est visible dans le panneau`, !!indentBox && indentBox.inViewport, indentBox);
  await page.waitForTimeout(200);
  state = await cellsState(page);
  check(`${label} - retrait : dans chacune des quatre cases, le deuxième et le troisième éléments passent sous le premier`, INSIDE.every(k => state[k].items === 3 && state[k].nested === 2 && state[k].text === 'a' + k.replace(',', '') + 'b' + k.replace(',', '') + 'c' + k.replace(',', '')), INSIDE.map(k => [k, state[k].items, state[k].nested]));
  check(`${label} - retrait : les autres cases gardent leurs trois éléments au même niveau`, OUTSIDE.every(k => state[k].items === 3 && state[k].nested === 0), OUTSIDE.map(k => [k, state[k].items, state[k].nested]));
  const indentKept = await selectedRect(page);
  check(`${label} - retrait : la sélection de cases reste`, sameRect(indentKept, wantRect(FROM, TO)), show(indentKept));
  check(`${label} - retrait : « Retrait » se grise (plus rien à emboîter), « Retrait inverse » reste actif`, (await disabledOf('v2-btn-indent')) && !(await disabledOf('v2-btn-outdent')), { indent: await disabledOf('v2-btn-indent'), outdent: await disabledOf('v2-btn-outdent') });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  state = await cellsState(page);
  check(`${label} - un seul Annuler rend les listes d'avant aux quatre cases`, INSIDE.every(k => state[k].items === 3 && state[k].nested === 0), INSIDE.map(k => [k, state[k].items, state[k].nested]));
  const outdentBox = await realClick(page, '#v2-btn-outdent');
  check(`${label} - le bouton « Retrait inverse » est visible dans le panneau`, !!outdentBox && outdentBox.inViewport, outdentBox);
  await page.waitForTimeout(200);
  state = await cellsState(page);
  check(`${label} - retrait inverse : les éléments des quatre listes deviennent des paragraphes`, INSIDE.every(k => !state[k].list && state[k].paragraphs === 3), INSIDE.map(k => [k, state[k].list, state[k].paragraphs]));
  check(`${label} - retrait inverse : les autres cases gardent leur liste`, OUTSIDE.every(k => state[k].items === 3), OUTSIDE.map(k => [k, state[k].items]));
  const outdentKept = await selectedRect(page);
  check(`${label} - retrait inverse : la sélection de cases reste`, sameRect(outdentKept, wantRect(FROM, TO)), show(outdentKept));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  state = await cellsState(page);
  check(`${label} - un seul Annuler rend les listes aux quatre cases`, INSIDE.every(k => state[k].items === 3 && state[k].list), INSIDE.map(k => [k, state[k].items, state[k].list]));

  // ---- 2. Copier / couper / coller / effacer au vrai clavier ----
  await loadDoc(page, TABLE);
  await spyClipboard(page);
  const sel0 = await dragCells(page, FROM, TO);
  check(`${label} - copier : le glissé choisit bien les quatre cases`, sameRect(sel0, wantRect(FROM, TO)), show(sel0));
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(250);
  const clip = await page.evaluate(() => window.__clip);
  const want = 'R2C2 texte\tR2C3 texte\nR3C2 texte\tR3C3 texte';
  check(`${label} - Ctrl+C : le texte brut est un tableau tabulé (cases par une tabulation, lignes par un retour à la ligne)`, !!clip && clip.type === 'copy' && clip.text === want, clip && clip.text);
  check(`${label} - Ctrl+C : le HTML est un tableau de deux lignes de deux cases`, !!clip && (clip.html.match(/<tr>/g) || []).length === 2 && (clip.html.match(/<td/g) || []).length === 4, clip && clip.html.slice(0, 160));
  await clickCell(page, 4, 1);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(350);
  const grid = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table tr')).map(tr => Array.from(tr.children).map(td => td.textContent)));
  check(`${label} - Ctrl+V dans une autre case : les quatre valeurs arrivent à partir d'elle, le tableau gagne la ligne qui manque`,
    grid.length === 5 && grid[3][0] === 'R2C2 texte' && grid[3][1] === 'R2C3 texte' && grid[4][0] === 'R3C2 texte' && grid[4][1] === 'R3C3 texte', grid);

  await loadDoc(page, TABLE);
  await spyClipboard(page);
  await dragCells(page, FROM, TO);
  await page.keyboard.press('Control+x');
  await page.waitForTimeout(300);
  const cut = await page.evaluate(() => window.__clip);
  state = await cellsState(page);
  check(`${label} - Ctrl+X : le presse-papiers reçoit le même tableau tabulé et les quatre cases se vident`, !!cut && cut.type === 'cut' && cut.text === want && INSIDE.every(k => state[k].text === '') && OUTSIDE.every(k => state[k].text !== ''), { cut: cut && cut.text, texts: INSIDE.map(k => state[k].text) });

  await loadDoc(page, TABLE);
  await dragCells(page, FROM, TO);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(250);
  state = await cellsState(page);
  const afterDelete = await selectedRect(page);
  check(`${label} - Suppr : les quatre cases se vident, la sélection de cases reste`, INSIDE.every(k => state[k].text === '') && OUTSIDE.every(k => state[k].text !== '') && sameRect(afterDelete, wantRect(FROM, TO)), { texts: INSIDE.map(k => state[k].text), rect: show(afterDelete) });

  // Un texte copié dans UNE case, collé sur quatre cases sélectionnées : les quatre le reçoivent (comme un tableur).
  await loadDoc(page, TABLE);
  await spyClipboard(page);
  await clickCell(page, 4, 3);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(200);
  await dragCells(page, FROM, TO);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(300);
  state = await cellsState(page);
  check(`${label} - une valeur copiée d'une case et collée sur quatre cases sélectionnées : les quatre la reçoivent`, INSIDE.every(k => state[k].text === 'R4C3 texte'), INSIDE.map(k => state[k].text));

  await context.close();
}

await runTheme('light');
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
