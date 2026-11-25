#!/usr/bin/env node
// Un texte brut copié dans Notepad++ (ou un .md ouvert dans un éditeur de texte) et collé dans un document garde ses lignes vides (23/11 : « j'ai un document md ouvert sur Notepad++, je vois les
// sauts de ligne, je le copie-colle dans un document et je n'ai plus les sauts de ligne »). Notepad++ ne met dans le presse-papiers que du texte brut (`text/plain`, fins de ligne \r\n sous Windows) :
// ProseMirror le coupait sur `(?:\r\n?|\n)+`, donc les lignes vides entre deux paragraphes disparaissaient. `plainTextToSlice` de js/editor.js (`clipboardTextParser`) fait une ligne, un paragraphe,
// les lignes vides comprises. Dev-tests/scenarios-plain-text-paste.js (groupe « plainTextPaste ») vérifie ce que le collage écrit avec des évènements `paste` synthétiques ; ici tout est vrai : le
// VRAI presse-papiers de Chromium (texte brut seul, sans HTML : le script écoute `paste` pour prouver que seul `text/plain` arrive), le VRAI clic au bout d'un paragraphe, le VRAI Ctrl+V (et Ctrl+Maj+V),
// à la taille du panneau Grist (~700x400), en clair et en sombre :
//   - les huit paragraphes attendus sont là, lignes vides comprises, et le premier se colle à la suite du texte du curseur ; aucun saut de ligne forcé ;
//   - à l'écran, une ligne vide laisse sa hauteur d'une ligne entre deux paragraphes (une, puis deux de suite), et rien ne déborde du panneau ;
//   - un seul Ctrl+Z défait le collage, Ctrl+Maj+Z le rend ;
//   - Ctrl+A puis Ctrl+C redonne le texte à l'identique, une ligne par paragraphe : recollé dans un éditeur de texte, aucune ligne n'est doublée (23/11 : « deux sauts de ligne à chaque fois ») ;
//   - une seule ligne collée reste dans le paragraphe du curseur ; le Markdown n'est pas lu (« # » reste un « # »).
// Lancé par run-headless.mjs (groupe Node « plainTextPasteMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-plain-text-paste-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PLAIN_TEXT_PASTE_MOUSE_PORT || 8972);
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdf-lib@[\d.]+\/dist\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/exceljs@[\d.]+\/dist\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
].filter(([, rel]) => rel !== 'umd/exceljs.min.js' || existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[verify-plain-text-paste-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

const docParagraphs = page => page.evaluate(() => { const out = []; EditorCore.getEditor().state.doc.forEach(node => out.push(node.textContent)); return out; });
const docJson = page => page.evaluate(() => JSON.stringify(EditorCore.getEditor().state.doc.toJSON()));
const hardBreaks = page => page.evaluate(() => document.querySelectorAll('.tiptap br:not(.ProseMirror-trailingBreak)').length);

async function load(page, html) {
  await page.evaluate(h => { GridEditor.setActive(false); Editor.setHTML(h); const box = document.getElementById('editor-container'); box.scrollTop = 0; box.scrollLeft = 0; }, html);
  await page.waitForTimeout(500);
  // Ce que le collage reçoit vraiment : du texte brut seul, comme Notepad++.
  await page.evaluate(() => {
    window.__pasted = null;
    if (!window.__pasteListener) {
      window.__pasteListener = e => { window.__pasted = { html: e.clipboardData.getData('text/html'), plain: e.clipboardData.getData('text/plain') }; };
      document.addEventListener('paste', window.__pasteListener, true);
    }
  });
}
// Le milieu du texte d'un paragraphe (un vrai clic y pose le curseur), puis la touche Fin : le curseur est au bout de la ligne, quelle que soit la mise en page du moment.
const middleOfText = (page, selector, index) => page.evaluate(([s, i]) => {
  const p = document.querySelectorAll(s)[i];
  const range = document.createRange();
  range.selectNodeContents(p);
  const r = range.getBoundingClientRect();
  return { x: r.left + Math.max(2, r.width / 2), y: r.top + r.height / 2 };
}, [selector, index]);
// Le haut et la hauteur de chaque paragraphe du document, à l'écran.
const boxes = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap > p')).map(p => { const r = p.getBoundingClientRect(); return { text: p.textContent, top: r.top, height: r.height }; }));

async function clickAtEnd(page, index) {
  // Un premier clic donne le focus au texte et laisse la mise en page se poser (barre flottante, zoom de la feuille) ; le second pose le curseur là où la personne le voit.
  const first = await middleOfText(page, '.tiptap > p', index);
  await page.mouse.click(first.x, first.y);
  await page.waitForTimeout(500);
  const target = await middleOfText(page, '.tiptap > p', index);
  const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el && !!el.closest('.tiptap'); }, [target.x, target.y]);
  await page.mouse.move(target.x - 30, target.y, { steps: 4 });
  await page.mouse.click(target.x, target.y);
  await page.keyboard.press('End');
  await page.waitForTimeout(150);
  return hit;
}
async function pasteText(page, text, keys) {
  await page.evaluate(t => navigator.clipboard.writeText(t), text);
  await page.keyboard.press(keys || 'Control+V');
  await page.waitForTimeout(400);
  await page.mouse.move(WIDTH - 10, HEIGHT - 10);
  return page.evaluate(() => window.__pasted);
}

const NOTEPAD = 'Ligne un\r\nLigne deux\r\n\r\nPara deux\r\n\r\n\r\nPara trois';
const EXPECTED = ['AvantLigne un', 'Ligne deux', '', 'Para deux', '', '', 'Para trois', 'Après'];

async function flow(scheme, label) {
  const { context, page } = await openWidget(scheme);

  for (const keys of ['Control+V', 'Control+Shift+V']) {
    const how = keys === 'Control+V' ? 'Ctrl+V' : 'Ctrl+Maj+V';
    await load(page, '<p>Avant</p><p>Après</p>');
    const before = await docJson(page);
    const reachable = await clickAtEnd(page, 0);
    check(`${label}, ${how} - le clic dans « Avant » tombe dans le texte`, reachable);
    const reached = await pasteText(page, NOTEPAD, keys);
    check(`${label}, ${how} - le collage ne reçoit que du texte brut (comme Notepad++) : aucun HTML, les cinq lignes y sont`, !!reached && reached.html === '' && /Ligne un/.test(reached.plain) && /Para trois/.test(reached.plain), reached);
    const got = await docParagraphs(page);
    check(`${label}, ${how} - huit paragraphes, lignes vides comprises, le premier à la suite d'« Avant » et « Après » intact`, JSON.stringify(got) === JSON.stringify(EXPECTED), got);
    check(`${label}, ${how} - aucun saut de ligne forcé : une ligne, un paragraphe`, (await hardBreaks(page)) === 0);
    const shown = await boxes(page);
    const at = text => shown.find(b => b.text === text);
    const lineHeight = (at('Ligne deux') || {}).height || 0;
    const oneBlank = at('Para deux') && at('Ligne deux') ? at('Para deux').top - at('Ligne deux').top : 0;
    const twoBlank = at('Para trois') && at('Para deux') ? at('Para trois').top - at('Para deux').top : 0;
    check(`${label}, ${how} - à l'écran, une ligne vide laisse une ligne entre « Ligne deux » et « Para deux », deux lignes vides en laissent deux (${Math.round(oneBlank)} px, ${Math.round(twoBlank)} px pour des lignes de ${Math.round(lineHeight)} px)`,
      lineHeight > 5 && oneBlank >= lineHeight * 1.8 && twoBlank >= lineHeight * 2.8 && twoBlank > oneBlank + lineHeight * 0.8, { oneBlank, twoBlank, lineHeight });
    const overflow = await page.evaluate(() => { const c = document.getElementById('editor-container'); return c.scrollWidth - c.clientWidth; });
    check(`${label}, ${how} - rien ne déborde du panneau à droite`, overflow <= 1, overflow);
    const after = await docJson(page);
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(300);
    check(`${label}, ${how} - un seul Ctrl+Z défait le collage`, (await docJson(page)) === before);
    await page.keyboard.press('Control+Shift+Z');
    await page.waitForTimeout(300);
    check(`${label}, ${how} - Ctrl+Maj+Z le rend`, (await docJson(page)) === after);
    // Le retour : tout sélectionner (Ctrl+A) et copier (Ctrl+C) donne le texte tel qu'il est écrit, une ligne par paragraphe, sans ligne vide de plus (le vrai presse-papiers, relu).
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(150);
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(250);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    check(`${label}, ${how} - Ctrl+A puis Ctrl+C redonne le texte à l'identique, une ligne par paragraphe, sans ligne vide de plus (de quoi le recoller dans un éditeur de texte)`, copied.replace(/\r\n/g, '\n') === EXPECTED.join('\n'), copied);
    // Le HTML de la même copie (ce que lit ONLYOFFICE quand on colle « en reproduisant la mise en forme ») : chaque ligne vide y est un paragraphe avec son retour, `<p><br></p>`, et le
    // navigateur la dessine avec une hauteur de ligne (un `<p></p>` n'en a aucune : les traitements de texte l'écartaient).
    const copiedHtml = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const item = items.find(it => it.types.includes('text/html'));
      return item ? await (await item.getType('text/html')).text() : '';
    });
    const copiedShape = await page.evaluate(html => {
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:0;top:0;width:600px;font:16px/20px sans-serif;visibility:hidden';
      holder.innerHTML = html;
      holder.querySelectorAll('p').forEach(p => { p.style.margin = '0'; });
      document.body.appendChild(holder);
      const blocks = Array.from(holder.querySelectorAll('p')).map(p => ({ html: p.innerHTML, height: p.getBoundingClientRect().height }));
      holder.remove();
      return blocks;
    }, copiedHtml);
    check(`${label}, ${how} - le HTML copié (vrai presse-papiers) a ses huit paragraphes, dont trois lignes vides écrites \`<p><br></p>\``,
      copiedShape.length === EXPECTED.length && copiedShape.filter(b => b.html === '<br>').length === EXPECTED.filter(line => line === '').length && copiedShape.every((b, i) => (EXPECTED[i] === '') === (b.html === '<br>')), copiedHtml);
    check(`${label}, ${how} - un logiciel qui dessine ce HTML (sans marge) laisse à chaque ligne vide la hauteur d'une ligne : aucune ne s'écrase`, copiedShape.length > 0 && copiedShape.every(b => b.height >= 19), copiedShape);
  }

  // Une seule ligne : elle reste dans le paragraphe du curseur, pas de paragraphe de plus.
  await load(page, '<p>Avant</p><p>Après</p>');
  await clickAtEnd(page, 1);
  await pasteText(page, ' et plus');
  const one = await docParagraphs(page);
  check(`${label} - une seule ligne collée reste dans le paragraphe du curseur`, JSON.stringify(one) === JSON.stringify(['Avant', 'Après et plus']), one);

  // Le Markdown n'est pas lu au collage : « # » reste un « # », les lignes vides restent.
  await load(page, '<p></p>');
  await clickAtEnd(page, 0);
  await pasteText(page, '# Titre\r\n\r\nUn paragraphe\r\nsur deux lignes\r\n\r\n- puce\r\n');
  const md = await docParagraphs(page);
  const structure = await page.evaluate(() => document.querySelectorAll('.tiptap h1, .tiptap h2, .tiptap ul, .tiptap ol').length);
  check(`${label} - le texte d'un .md collé reste du texte (pas de titre ni de puce) et garde ses lignes vides`, structure === 0 && JSON.stringify(md.slice(0, 6)) === JSON.stringify(['# Titre', '', 'Un paragraphe', 'sur deux lignes', '', '- puce']), { md, structure });

  await context.close();
}

await flow('light', 'clair');
await flow('dark', 'sombre');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors.slice(0, 3));
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
