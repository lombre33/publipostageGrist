#!/usr/bin/env node
// Une variable copiée seule puis collée ailleurs ne laisse plus deux sauts de ligne derrière elle (Antoine, 05/11 : « dans un tableau, dans une ligne classique sans saut de ligne, je clique sur une
// variable, je la copie, je clique sur une autre ligne, je colle, et ça rajoute en dessous deux sauts de ligne non voulus »). Cause : sous Windows, Chrome, Edge et Firefox rendent le HTML copié
// entouré de `<html>\r\n<body>\r\n<!--StartFragment-->` ... `<!--EndFragment-->\r\n</body>\r\n</html>` ; une bulle sélectionnée seule (une sélection de nœud) se copie sans paragraphe autour, et
// ProseMirror, qui lit un HTML venu de l'éditeur en gardant les blancs, fait un saut de ligne forcé de chaque retour à la ligne resté derrière elle (js/editor.js : withoutFragmentPadding).
// Dev-tests/scenarios-grid.js (groupe « grid », quatre cas `..._after_windows_clipboard_wrapping`) vérifie ce que le collage écrit avec des évènements `paste` synthétiques ; ici tout est vrai :
// le VRAI clic sur la bulle (sélection de nœud), le VRAI Ctrl+C, le presse-papiers de Chromium (sous Linux il rend le HTML nu : le script le réécrit tel que Windows le rend, avec les repères et
// les retours à la ligne), le VRAI clic sur une autre case et le VRAI Ctrl+V, à la taille du panneau Grist d'Antoine (~700x400) :
//   - dans un tableau de document, dans une grille et dans un paragraphe du document : la bulle collée est seule dans sa case (ou son paragraphe), aucun `<br>` ni paragraphe derrière elle, la ligne
//     garde la hauteur d'une ligne de texte (celle de la case d'où la bulle a été copiée) ;
//   - le HTML qui arrive à l'éditeur est bien celui de Windows (les repères y sont) : le test ne passe pas faute d'avoir joué le cas ;
//   - un seul Ctrl+Z défait le collage, Ctrl+Maj+Z le rend ;
//   - le presse-papiers tel que Linux le rend (sans repères) se colle comme avant.
// Lancé par run-headless.mjs (groupe Node « pasteVariableMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-paste-variable-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PASTE_VARIABLE_MOUSE_PORT || 8962);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-grid-import-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-paste-variable-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
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


// Une bulle de variable « Nom » : celle que la personne copie.
const BADGE = '<span class="var-badge" data-table="Collage" data-column="Nom" data-key="Collage.Nom"></span>';
const gridRow = cells => `<tr data-row-height="30" style="height: 30px">${cells.map(c => `<td colwidth="160"><p>${c}</p></td>`).join('')}</tr>`;
const gridHtml = `<table style="width: 320px;"><colgroup><col style="width: 160px;"><col style="width: 160px;"></colgroup><tbody>${[['Nom ' + BADGE, 'B'], ['C', 'D'], ['E', 'F'], ['G', '']].map(gridRow).join('')}</tbody></table>`;
const tableHtml = '<p>avant</p><table><colgroup><col style="width: 160px;"><col style="width: 160px;"></colgroup><tbody><tr><td colwidth="160"><p>Nom ' + BADGE + '</p></td><td colwidth="160"><p>B</p></td></tr><tr><td colwidth="160"><p>C</p></td><td colwidth="160"><p></p></td></tr></tbody></table><p>après</p>';
const paragraphsHtml = '<p>Nom ' + BADGE + '</p><p>autre ligne</p><p>dernière ligne</p>';

async function load(page, html, grid) {
  await page.evaluate(({ h, g }) => {
    GridEditor.setActive(false);
    Editor.setHTML(h);
    if (g) GridEditor.setActive(true);
    const box = document.getElementById('editor-container');
    box.scrollTop = 0; box.scrollLeft = 0;
  }, { h: html, g: grid });
  await page.waitForTimeout(500);
  // Ce que le collage reçoit vraiment (le HTML que le navigateur donne à l'évènement `paste`), pour ne pas croire jouer le cas de Windows sans le jouer.
  await page.evaluate(() => {
    window.__pasted = null;
    if (!window.__pasteListener) {
      window.__pasteListener = e => { window.__pasted = e.clipboardData.getData('text/html'); };
      document.addEventListener('paste', window.__pasteListener, true);
    }
  });
}

// Le milieu d'un élément, ou la fin du texte d'une case / d'un paragraphe (un clic à droite du texte pose le curseur au bout de la ligne).
const centerOf = (page, selector, index) => page.evaluate(([s, i]) => { const el = document.querySelectorAll(s)[i || 0]; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [selector, index]);
const endOfText = (page, selector, index) => page.evaluate(([s, i]) => {
  const p = document.querySelectorAll(s)[i];
  const range = document.createRange();
  range.selectNodeContents(p);
  const rects = range.getClientRects();
  const last = rects[rects.length - 1] || p.getBoundingClientRect();
  return { x: rects.length ? last.right + 10 : last.left + 6, y: last.top + last.height / 2 };
}, [selector, index]);
// Le texte de chaque case ou paragraphe, une ligne par bloc : « # » pour une bulle, « <br> » pour un saut de ligne forcé.
const linesOf = (page, selector) => page.evaluate((s) => {
  const out = [];
  EditorCore.getEditor().state.doc.descendants((node) => {
    if (s === 'td' && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) {
      const lines = [];
      node.forEach(block => { const parts = []; block.forEach(inline => parts.push(inline.type.name === 'varBadge' ? '#' + inline.attrs.column : inline.type.name === 'hardBreak' ? '<br>' : inline.text)); lines.push(parts.join('') || '-'); });
      out.push(lines.join(' / '));
      return false;
    }
    if (s === 'p' && node.type.name === 'paragraph') {
      const parts = [];
      node.forEach(inline => parts.push(inline.type.name === 'varBadge' ? '#' + inline.attrs.column : inline.type.name === 'hardBreak' ? '<br>' : inline.text));
      out.push(parts.join('') || '-');
      return false;
    }
    return true;
  });
  return out;
}, selector);
// Les sauts de ligne forcés de l'éditeur à l'écran (le `<br>` de fin que ProseMirror pose dans un paragraphe vide n'en est pas un).
const hardBreaks = page => page.evaluate(() => document.querySelectorAll('.tiptap br:not(.ProseMirror-trailingBreak)').length);
const heightOf = (page, selector, index) => page.evaluate(([s, i]) => document.querySelectorAll(s)[i].getBoundingClientRect().height, [selector, index]);
const docJson = page => page.evaluate(() => JSON.stringify(EditorCore.getEditor().state.doc.toJSON()));

// Ce que Windows rend à `getData('text/html')` : le HTML que l'éditeur a copié, entouré des repères et de retours à la ligne.
async function wrapClipboardLikeWindows(page) {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    let html = null;
    for (const item of items) if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
    if (html == null) return null;
    const wrapped = '<html>\r\n<body>\r\n<!--StartFragment-->' + html.replace(/^<meta[^>]*>/i, '') + '<!--EndFragment-->\r\n</body>\r\n</html>';
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([wrapped], { type: 'text/html' }) }, { unsanitized: ['text/html'] })]);
    return wrapped;
  });
}

// Le geste de la personne : un clic sur la bulle, Ctrl+C, un clic au bout du texte d'une autre case (ou ligne), Ctrl+V. `wrap` : le presse-papiers est réécrit comme Windows le rend.
async function copyThenPaste(page, label, { wrap, targetSelector, targetIndex }) {
  const chip = await centerOf(page, '.tiptap .var-badge', 0);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
  await page.waitForTimeout(100);
  await page.mouse.move(chip.x - 8, chip.y, { steps: 6 });
  await page.mouse.click(chip.x, chip.y);
  await page.waitForTimeout(150);
  const selection = await page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return s.node ? s.node.type.name : s.constructor.name; });
  check(`${label} - un vrai clic sur la variable la sélectionne seule (sélection de nœud)`, selection === 'varBadge', selection);
  await page.keyboard.press('Control+C');
  await page.waitForTimeout(200);
  const wrapped = wrap ? await wrapClipboardLikeWindows(page) : null;
  const target = await endOfText(page, targetSelector, targetIndex);
  // La barre flottante de la bulle ne recouvre pas la case visée : le clic tombe bien dessus.
  const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el && !!el.closest('.tiptap'); }, [target.x, target.y]);
  check(`${label} - l'endroit visé n'est pas recouvert (le clic tombe dans le texte)`, hit, target);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(400);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
  const reached = await page.evaluate(() => window.__pasted);
  if (wrap) check(`${label} - le HTML qui arrive à l'éditeur est celui de Windows (repères et retours à la ligne)`, !!reached && /<!--StartFragment-->/.test(reached) && /<!--EndFragment-->\s+<\/body>/.test(reached), reached);
  else check(`${label} - le HTML qui arrive à l'éditeur est celui de Linux (sans repères)`, !!reached && !/StartFragment/.test(reached), reached);
}

async function undoRedo(page, label, before, after) {
  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(300);
  const undone = await docJson(page);
  check(`${label} - un seul Ctrl+Z défait le collage`, undone === before, undone.length);
  await page.keyboard.press('Control+Shift+Z');
  await page.waitForTimeout(300);
  const redone = await docJson(page);
  check(`${label} - Ctrl+Maj+Z le rend`, redone === after, redone.length);
}

async function flow(scheme, label) {
  const { context, page } = await openWidget(scheme);

  for (const wrap of [true, false]) {
    const how = wrap ? 'Windows' : 'Linux';

    // --- Un tableau de DOCUMENT : la bulle de la première case collée à la fin du texte de la case du dessous, puis dans la case vide ---
    await load(page, tableHtml, false);
    const sourceHeight = await heightOf(page, '.tiptap td', 0);
    let before = await docJson(page);
    await copyThenPaste(page, `${label}, ${how}, tableau de document, case avec du texte`, { wrap, targetSelector: '.tiptap td p', targetIndex: 2 });
    let lines = await linesOf(page, 'td');
    check(`${label}, ${how}, tableau de document - la case du dessous a son texte puis la bulle, rien derrière`, lines[2] === 'C#Nom' && lines[0] === 'Nom #Nom', lines);
    check(`${label}, ${how}, tableau de document - aucun saut de ligne forcé, aucun paragraphe de plus`, (await hardBreaks(page)) === 0 && lines.every(line => !/ \/ |<br>/.test(line)), { breaks: await hardBreaks(page), lines });
    const rowHeight = await heightOf(page, '.tiptap td', 2);
    check(`${label}, ${how}, tableau de document - la case garde la hauteur d'une ligne (${Math.round(rowHeight)} px, celle d'où la bulle vient : ${Math.round(sourceHeight)} px)`, rowHeight <= sourceHeight + 2, { rowHeight, sourceHeight });
    let after = await docJson(page);
    await undoRedo(page, `${label}, ${how}, tableau de document`, before, after);

    await load(page, tableHtml, false);
    before = await docJson(page);
    await copyThenPaste(page, `${label}, ${how}, tableau de document, case vide`, { wrap, targetSelector: '.tiptap td p', targetIndex: 3 });
    lines = await linesOf(page, 'td');
    const emptyHeight = await heightOf(page, '.tiptap td', 3);
    check(`${label}, ${how}, tableau de document - la case vide ne reçoit que la bulle, sur une ligne`, lines[3] === '#Nom' && (await hardBreaks(page)) === 0 && emptyHeight <= sourceHeight + 2, { lines, emptyHeight, sourceHeight });

    // --- Une GRILLE ---
    await load(page, gridHtml, true);
    const gridSource = await heightOf(page, '.tiptap td p', 0);
    before = await docJson(page);
    await copyThenPaste(page, `${label}, ${how}, grille`, { wrap, targetSelector: '.tiptap td p', targetIndex: 7 });
    lines = await linesOf(page, 'td');
    const gridHeight = await heightOf(page, '.tiptap td p', 7);
    check(`${label}, ${how}, grille - la case vide ne reçoit que la bulle, sur une ligne (${Math.round(gridHeight)} px, source ${Math.round(gridSource)} px)`, lines[7] === '#Nom' && (await hardBreaks(page)) === 0 && gridHeight <= gridSource + 2, { lines, gridHeight, gridSource });
    after = await docJson(page);
    await undoRedo(page, `${label}, ${how}, grille`, before, after);
    await page.evaluate(() => GridEditor.setActive(false));

    // --- Un paragraphe du document ---
    await load(page, paragraphsHtml, false);
    before = await docJson(page);
    await copyThenPaste(page, `${label}, ${how}, paragraphe`, { wrap, targetSelector: '.tiptap > p', targetIndex: 1 });
    lines = await linesOf(page, 'p');
    check(`${label}, ${how}, paragraphe - « autre ligne » est suivie de la bulle, sans saut de ligne ni paragraphe de plus`, lines.join('|') === 'Nom #Nom|autre ligne#Nom|dernière ligne' && (await hardBreaks(page)) === 0, lines);
    after = await docJson(page);
    await undoRedo(page, `${label}, ${how}, paragraphe`, before, after);
  }
  await context.close();
}

await flow('light', 'clair');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors.slice(0, 3));
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
