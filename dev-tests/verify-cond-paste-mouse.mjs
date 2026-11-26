#!/usr/bin/env node
// Coller la condition d'une pastille sur une autre, à la vraie souris et au vrai clavier (demande d'Antoine du 26/11 : « si on la copie et qu'on va ailleurs sur une autre bulle de condition
// et qu'on colle, ça prend les éléments de condition »). Dev-tests/scenarios-cond-paste.js (groupe « condPaste ») vérifie le modèle avec un presse-papiers factice ; ici tout est vrai : le VRAI
// clic sur l'étiquette « Si … » d'un bloc ou sur une pastille (sélection de nœud), le VRAI Ctrl+C, le presse-papiers de Chromium (sous Linux il rend le HTML nu ; le script le réécrit tel que
// Windows le rend, avec les repères et les retours à la ligne), le VRAI clic sur la cible et le VRAI Ctrl+V, à la taille du panneau Grist d'Antoine (~700x400), clair, sombre et anglais :
//   - bloc vers bloc : la cible a la condition de la copie, garde son texte et son sinon, reste choisie (barre ouverte), l'étiquette et le coin d'état le disent, Ctrl+Z puis Ctrl+Maj+Z ;
//   - pastille vers pastille (pointillés bleus), bloc vers pastille (d'un type à l'autre) ;
//   - la même condition : rien ne change, le coin d'état le dit ;
//   - un curseur dans le texte : Ctrl+V insère la pastille comme avant.
// Lancé par run-headless.mjs (groupe Node « condPasteMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-cond-paste-mouse.mjs (COND_PASTE_SHOTS=<dossier> pour les captures)
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.COND_PASTE_MOUSE_PORT || 8964);
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

const OFFLINE = existsSync(join(CACHE, 'umd'));
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
if (!OFFLINE) console.log('[verify-cond-paste-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme, deviceScaleFactor: process.env.COND_PASTE_SHOTS ? 2 : 1 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { d.accept().catch(() => {}); });
  if (OFFLINE) {
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

// Les captures (facultatives) : COND_PASTE_SHOTS=<dossier> les y écrit, à l'échelle 2.
const SHOTS = process.env.COND_PASTE_SHOTS || '';
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

const COND_URGENT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] };
const COND_NORMAL = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Normal' }] };
const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
const badge = (column, condition) => `<span class="var-badge" data-table="Dossiers" data-column="${column}" data-key="Dossiers.${column}"${condition ? attr('data-condition', condition) : ''}></span>`;
const block = (text, condition, otherwise) => `<div class="conditional-text"${attr('data-condition', condition)}${otherwise ? ` data-otherwise="${otherwise}"` : ''}><p>${text}</p></div>`;
// Deux blocs « Si Statut = Urgent » et « Si Statut = Normal · sinon », puis une ligne avec deux pastilles : la première conditionnelle, la seconde sans condition.
const DOC = block('Texte du bloc A', COND_URGENT) + block('Texte du bloc B', COND_NORMAL, 'ailleurs') + `<p>Titre ${badge('Titre', COND_URGENT)} et Responsable ${badge('Responsable', null)} fin</p>`;

async function load(page, html) {
  await page.evaluate((h) => {
    const stub = window.__gristStub;
    stub.setVariables('Dossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Text' });
    stub.setRows('Dossiers', [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean' }]);
    return GristAPI.refreshSchema().then(() => {
      stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean' }, 'Dossiers');
      Editor.setHTML(h);
      const box = document.getElementById('editor-container');
      box.scrollTop = 0; box.scrollLeft = 0;
    });
  }, html);
  await page.waitForTimeout(600);
  // Ce que le collage reçoit vraiment : le HTML que le navigateur donne à l'évènement `paste`.
  await page.evaluate(() => {
    window.__pasted = null;
    if (!window.__pasteListener) {
      window.__pasteListener = e => { window.__pasted = e.clipboardData.getData('text/html'); };
      document.addEventListener('paste', window.__pasteListener, true);
    }
  });
}

const centerOf = (page, selector, index) => page.evaluate(([s, i]) => { const el = document.querySelectorAll(s)[i || 0]; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [selector, index]);
// Le point est-il bien sur l'élément visé (la barre flottante d'une autre pastille ne le recouvre pas) ?
const hits = (page, selector, index, point) => page.evaluate(([s, i, p]) => { const el = document.querySelectorAll(s)[i || 0]; const hit = document.elementFromPoint(p.x, p.y); return !!hit && (el === hit || el.contains(hit)); }, [selector, index, point]);
const selectionOf = page => page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return s.node ? { type: s.node.type.name, from: s.from } : { type: s.constructor.name, from: s.from }; });
const docJson = page => page.evaluate(() => JSON.stringify(EditorCore.getEditor().state.doc.toJSON()));
const nodesOf = (page, type) => page.evaluate((t) => { const out = []; EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === t) out.push({ pos, column: node.attrs.column, condition: node.attrs.condition && ConditionRules.plainCondition(node.attrs.condition), text: node.textContent, otherwise: node.attrs.otherwise }); }); return out; }, type);
const statusText = page => page.evaluate(() => document.getElementById('status-msg').textContent);
const tagTexts = page => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .conditional-text-tag')).map(t => t.textContent));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const parkMouse = async page => { await page.mouse.move(WIDTH - 10, HEIGHT - 10); await page.waitForTimeout(100); };

// Ce que Windows rend à `getData('text/html')` : le HTML copié, entouré des repères et de retours à la ligne.
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

// Un vrai clic sur l'objet (l'étiquette « Si … » d'un bloc, ou la pastille).
async function clickItem(page, label, selector, index, expected) {
  await parkMouse(page);
  const point = await centerOf(page, selector, index);
  check(`${label} - le point visé n'est pas recouvert`, await hits(page, selector, index, point), point);
  await page.mouse.move(point.x - 8, point.y, { steps: 6 });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(200);
  const selection = await selectionOf(page);
  check(`${label} - un vrai clic le choisit seul (sélection de nœud ${expected})`, selection.type === expected, selection);
  return selection;
}
// Le geste d'Antoine : clic sur la source, Ctrl+C, clic sur la cible, Ctrl+V. `wrap` : le presse-papiers est réécrit comme Windows le rend.
async function copyThenPaste(page, label, source, target, wrap) {
  await clickItem(page, `${label}, la copie`, source.selector, source.index, source.type);
  await page.keyboard.press('Control+C');
  await page.waitForTimeout(250);
  if (wrap) await wrapClipboardLikeWindows(page);
  await clickItem(page, `${label}, la cible`, target.selector, target.index, target.type);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(450);
  const reached = await page.evaluate(() => window.__pasted);
  if (wrap) check(`${label} - le HTML qui arrive à l'éditeur est celui de Windows (repères et retours à la ligne)`, !!reached && /<!--StartFragment-->/.test(reached) && /<!--EndFragment-->\s+<\/body>/.test(reached), reached && reached.slice(0, 80));
  else check(`${label} - le HTML qui arrive à l'éditeur est celui de Linux (sans repères)`, !!reached && !/StartFragment/.test(reached), reached && reached.slice(0, 80));
}

const T = {
  fr: { done: 'Condition collée : Statut = Urgent. Ctrl+Z pour revenir.', same: 'La condition est déjà la même : rien n’a changé.', tagUrgentOtherwise: 'Si Statut = Urgent · sinon', tagNormalOtherwise: 'Si Statut = Normal · sinon' },
  en: { done: 'Condition pasted: Statut = Urgent. Ctrl+Z to undo.', same: 'The condition is already the same: nothing changed.', tagUrgentOtherwise: 'If Statut = Urgent · otherwise', tagNormalOtherwise: 'If Statut = Normal · otherwise' },
};

async function flow(scheme, lang) {
  const label = (scheme === 'dark' ? 'sombre' : 'clair') + (lang === 'en' ? ', anglais' : '');
  const words = T[lang];
  const { context, page } = await openWidget(scheme);
  if (lang === 'en') await page.evaluate(() => I18n.setLang('en'));

  for (const wrap of [false, true]) {
    const how = label + (wrap ? ', Windows' : ', Linux');

    // --- Un bloc prend la condition d'un autre bloc ---
    await load(page, DOC);
    await page.evaluate(() => { document.getElementById('status-msg').textContent = ''; });
    await shot(page, `${scheme}-${lang}-${wrap ? 'windows' : 'linux'}-1-avant`);
    let before = await docJson(page);
    const blockTexts = (await nodesOf(page, 'conditionalText')).map(n => n.text);
    await copyThenPaste(page, `${how}, bloc vers bloc`, { selector: '.tiptap .conditional-text-tag', index: 0, type: 'conditionalText' }, { selector: '.tiptap .conditional-text-tag', index: 1, type: 'conditionalText' }, wrap);
    let blocks = await nodesOf(page, 'conditionalText');
    check(`${how}, bloc vers bloc - le second bloc a la condition « Statut = Urgent » du premier`, blocks.length === 2 && same(blocks[1].condition, COND_URGENT), blocks);
    check(`${how}, bloc vers bloc - il garde son texte et son sinon, le premier ne bouge pas`, blocks[1].text === blockTexts[1] && blocks[1].otherwise === 'ailleurs' && blocks[0].text === blockTexts[0] && same(blocks[0].condition, COND_URGENT), blocks);
    check(`${how}, bloc vers bloc - l'étiquette dit « ${words.tagUrgentOtherwise} »`, (await tagTexts(page))[1] === words.tagUrgentOtherwise, await tagTexts(page));
    check(`${how}, bloc vers bloc - le coin d'état dit ce qui s'est passé`, (await statusText(page)) === words.done, await statusText(page));
    const stillChosen = await selectionOf(page);
    check(`${how}, bloc vers bloc - le bloc reste choisi (la barre ne se ferme pas)`, stillChosen.type === 'conditionalText' && stillChosen.from === blocks[1].pos, stillChosen);
    const barOpen = await page.evaluate(() => { const bar = document.querySelector('.v2-varfmt-toolbar'); return !!bar && bar.getClientRects().length > 0 && getComputedStyle(bar).display !== 'none'; });
    check(`${how}, bloc vers bloc - la barre du bloc reste ouverte`, barOpen);
    await shot(page, `${scheme}-${lang}-${wrap ? 'windows' : 'linux'}-2-apres`);
    const after = await docJson(page);
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(300);
    check(`${how}, bloc vers bloc - un seul Ctrl+Z rend la condition d'avant (« Statut = Normal »)`, (await docJson(page)) === before && (await tagTexts(page))[1] === words.tagNormalOtherwise, await tagTexts(page));
    await page.keyboard.press('Control+Shift+Z');
    await page.waitForTimeout(300);
    check(`${how}, bloc vers bloc - Ctrl+Maj+Z la redonne`, (await docJson(page)) === after);

    // --- Une pastille prend la condition d'une autre pastille ---
    await load(page, DOC);
    await copyThenPaste(page, `${how}, pastille vers pastille`, { selector: '.tiptap .var-badge', index: 0, type: 'varBadge' }, { selector: '.tiptap .var-badge', index: 1, type: 'varBadge' }, wrap);
    const bubbles = await nodesOf(page, 'varBadge');
    check(`${how}, pastille vers pastille - la seconde a la condition de la première et garde sa colonne « Responsable »`, bubbles.length === 2 && same(bubbles[1].condition, COND_URGENT) && bubbles[1].column === 'Responsable' && bubbles[0].column === 'Titre', bubbles);
    const dashed = await page.evaluate(() => getComputedStyle(document.querySelectorAll('.tiptap .var-badge')[1]).borderTopStyle);
    check(`${how}, pastille vers pastille - la seconde est dessinée en pointillés bleus, comme une pastille conditionnelle`, dashed === 'dashed', dashed);
    await shot(page, `${scheme}-${lang}-${wrap ? 'windows' : 'linux'}-3-pastille`);

    // --- Un bloc donne sa condition à une pastille, d'un type à l'autre ---
    await load(page, DOC);
    await copyThenPaste(page, `${how}, bloc vers pastille`, { selector: '.tiptap .conditional-text-tag', index: 1, type: 'conditionalText' }, { selector: '.tiptap .var-badge', index: 1, type: 'varBadge' }, wrap);
    const crossed = await nodesOf(page, 'varBadge');
    check(`${how}, bloc vers pastille - la pastille « Responsable » a la condition « Statut = Normal » du bloc B`, crossed.length === 2 && same(crossed[1].condition, COND_NORMAL) && crossed[1].column === 'Responsable', crossed);

    // --- La même condition : rien ne change, et il le dit ---
    await load(page, DOC);
    before = await docJson(page);
    await copyThenPaste(page, `${how}, même condition`, { selector: '.tiptap .conditional-text-tag', index: 0, type: 'conditionalText' }, { selector: '.tiptap .var-badge', index: 0, type: 'varBadge' }, wrap);
    check(`${how}, même condition - le document est identique et le coin d'état le dit`, (await docJson(page)) === before && (await statusText(page)) === words.same, await statusText(page));
  }

  // --- Le collage d'avant, partout où la cible n'est pas choisie ---
  await load(page, DOC);
  await clickItem(page, `${label}, curseur`, '.tiptap .var-badge', 0, 'varBadge');
  await page.keyboard.press('Control+C');
  await page.waitForTimeout(250);
  const endPoint = await page.evaluate(() => {
    const p = Array.from(document.querySelectorAll('.tiptap > p')).pop();
    const range = document.createRange();
    range.selectNodeContents(p);
    const rects = range.getClientRects();
    const last = rects[rects.length - 1] || p.getBoundingClientRect();
    return { x: last.right + 10, y: last.top + last.height / 2 };
  });
  await parkMouse(page);
  await page.mouse.click(endPoint.x, endPoint.y);
  await page.waitForTimeout(150);
  const caret = await selectionOf(page);
  check(`${label} - un clic au bout du texte pose un curseur (pas une pastille choisie)`, caret.type !== 'varBadge' && caret.type !== 'conditionalText', caret);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(400);
  const inserted = await nodesOf(page, 'varBadge');
  check(`${label} - Ctrl+V avec un curseur insère la pastille comme avant, sans toucher les autres`, inserted.length === 3 && same(inserted[1].condition, null) && same(inserted[0].condition, COND_URGENT), inserted);

  await context.close();
}

await flow('light', 'fr');
await flow('dark', 'fr');
await flow('light', 'en');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors.slice(0, 3));
await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
