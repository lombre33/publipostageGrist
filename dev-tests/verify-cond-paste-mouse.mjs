#!/usr/bin/env node
// Copier la condition seule d'une pastille ou d'un bloc et la coller sur une autre, à la vraie souris et au vrai clavier (demande d'Antoine du 26/11 : « si on la copie et qu'on va ailleurs sur une autre
// bulle de condition et qu'on colle, ça prend les éléments de condition » ; puis « il faudrait pouvoir sélectionner le bloc entier, la puce, au premier clic, et après sélection la bulle de la condition -
// on garde l'option de copier-coller condition et contenu, ou juste condition »). Dev-tests/scenarios-cond-paste.js (groupe « condPaste ») vérifie le modèle avec un presse-papiers factice ; ici tout est
// vrai : le VRAI premier clic (l'objet entier), le VRAI deuxième clic sur sa bulle bleue (la condition seule), le VRAI Ctrl+C, le presse-papiers de Chromium (sous Linux il rend le HTML nu ; le script le
// réécrit tel que Windows le rend, avec les repères et les retours à la ligne), le VRAI clic sur la cible et le VRAI Ctrl+V, à la taille du panneau Grist d'Antoine (~700x400), clair, sombre et anglais :
//   - bloc vers bloc, pastille vers pastille, bloc vers pastille : la cible a la condition copiée seule, garde son contenu, son sinon et sa colonne, reste choisie (barre ouverte), l'étiquette et le coin d'état
//     le disent, Ctrl+Z puis Ctrl+Maj+Z ;
//   - le premier clic copie toujours l'objet ENTIER et Ctrl+V le remplace comme avant ; l'objet entier collé sur une condition seule choisie n'en prend que la condition ;
//   - un troisième clic, Échap, Retour arrière et une lettre : la condition seule est relâchée, l'objet n'est PAS effacé ; la même condition : rien ne change ; un curseur dans le texte : le texte seul s'insère.
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
    let html = null, text = '';
    for (const item of items) {
      if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
      if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
    }
    if (html == null) return null;
    const wrapped = '<html>\r\n<body>\r\n<!--StartFragment-->' + html.replace(/^<meta[^>]*>/i, '') + '<!--EndFragment-->\r\n</body>\r\n</html>';
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([wrapped], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) }, { unsanitized: ['text/html'] })]);
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
const pickedOf = page => page.evaluate(() => ConditionPick.pickedPos(EditorCore.getEditor().state));
const pickedCount = page => page.evaluate(() => document.querySelectorAll('.tiptap .pp-condition-picked').length);
// Le deuxième clic, sur la même bulle bleue, laissé le temps qu'un double-clic ne s'en mêle pas (un geste posé, comme celui d'Antoine).
async function secondClick(page, label, selector, index) {
  await page.waitForTimeout(650);
  const point = await centerOf(page, selector, index);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(250);
  const selection = await selectionOf(page);
  const picked = await pickedOf(page);
  check(`${label} - le deuxième clic ne choisit que la condition (la sélection de nœud reste, un seul objet porte la marque)`, picked === selection.from && (await pickedCount(page)) === 1, { selection, picked });
  return selection;
}
// Ce que le système a gardé de la copie : le HTML (réécrit comme Windows le rend si `wrap`) et le texte.
async function clipboardOf(page, wrap) {
  if (wrap) await wrapClipboardLikeWindows(page);
  return page.evaluate(async () => {
    const out = { html: '', text: '' };
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/html')) out.html = await (await item.getType('text/html')).text();
      if (item.types.includes('text/plain')) out.text = await (await item.getType('text/plain')).text();
    }
    return out;
  });
}
const isConditionOnly = clip => /data-pp-condition/.test(clip.html) && !/conditional-text|var-badge|calc-badge|conditional-checkbox/.test(clip.html);
const toolbarOpen = page => page.evaluate(() => { const bar = document.querySelector('.v2-varfmt-toolbar'); return !!bar && bar.getClientRects().length > 0 && getComputedStyle(bar).display !== 'none'; });
const countOf = (page, type) => nodesOf(page, type).then(list => list.length);

const T = {
  fr: { done: 'Condition collée : Statut = Urgent. Ctrl+Z pour revenir.', same: 'La condition est déjà la même : rien n’a changé.', on: 'Condition seule choisie. Ctrl+C la copie, Ctrl+V en colle une autre. Un clic de plus la relâche.', copied: 'Condition copiée : Statut = Urgent. Ctrl+V la colle sur une autre pastille ou un autre bloc.', tagUrgentOtherwise: 'Si Statut = Urgent · sinon', tagNormalOtherwise: 'Si Statut = Normal · sinon' },
  en: { done: 'Condition pasted: Statut = Urgent. Ctrl+Z to undo.', same: 'The condition is already the same: nothing changed.', on: 'Condition only selected. Ctrl+C copies it, Ctrl+V pastes another. One more click releases it.', copied: 'Condition copied: Statut = Urgent. Ctrl+V pastes it onto another item.', tagUrgentOtherwise: 'If Statut = Urgent · otherwise', tagNormalOtherwise: 'If Statut = Normal · otherwise' },
};
const TAG = { selector: '.tiptap .conditional-text-tag', type: 'conditionalText' };
const CHIP = { selector: '.tiptap .var-badge', type: 'varBadge' };

async function flow(scheme, lang) {
  const label = (scheme === 'dark' ? 'sombre' : 'clair') + (lang === 'en' ? ', anglais' : '');
  const words = T[lang];
  const { context, page } = await openWidget(scheme);
  if (lang === 'en') await page.evaluate(() => I18n.setLang('en'));
  const clearStatus = () => page.evaluate(() => { document.getElementById('status-msg').textContent = ''; });

  for (const wrap of [false, true]) {
    const how = label + (wrap ? ', Windows' : ', Linux');
    const shotName = n => `${scheme}-${lang}-${wrap ? 'windows' : 'linux'}-${n}`;

    // --- Un bloc prend la condition seule d'un autre bloc : premier clic (entier), deuxième clic (condition seule), Ctrl+C, clic sur la cible, Ctrl+V ---
    await load(page, DOC);
    await clearStatus();
    let before = await docJson(page);
    const blockTexts = (await nodesOf(page, 'conditionalText')).map(n => n.text);
    await shot(page, shotName('1-avant'));
    await clickItem(page, `${how}, bloc vers bloc, la copie`, TAG.selector, 0, TAG.type);
    check(`${how}, bloc vers bloc - le premier clic choisit le bloc ENTIER (rien n'est marqué comme condition seule)`, (await pickedOf(page)) === null && (await pickedCount(page)) === 0);
    await shot(page, shotName('2-bloc-entier'));
    await secondClick(page, `${how}, bloc vers bloc`, TAG.selector, 0);
    check(`${how}, bloc vers bloc - le coin d'état dit « condition seule choisie »`, (await statusText(page)) === words.on, await statusText(page));
    const fill = await page.evaluate(() => { const st = getComputedStyle(document.querySelector('.tiptap .conditional-text-tag')); return { background: st.backgroundColor, color: st.color }; });
    check(`${how}, bloc vers bloc - l'étiquette bleue se remplit (texte blanc sur fond plein)`, fill.color === 'rgb(255, 255, 255)' && fill.background !== 'rgba(0, 0, 0, 0)', fill);
    await shot(page, shotName('3-condition-seule'));
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(250);
    const clip = await clipboardOf(page, wrap);
    check(`${how}, bloc vers bloc - le presse-papiers du système porte la condition seule (« Statut = Urgent »), pas le bloc`, isConditionOnly(clip) && clip.text === 'Statut = Urgent', { html: clip.html.slice(0, 120), text: clip.text });
    check(`${how}, bloc vers bloc - le coin d'état dit « condition copiée » et le document n'a pas bougé`, (await statusText(page)) === words.copied && (await docJson(page)) === before, await statusText(page));
    await clickItem(page, `${how}, bloc vers bloc, la cible`, TAG.selector, 1, TAG.type);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(450);
    const reached = await page.evaluate(() => window.__pasted);
    if (wrap) check(`${how}, bloc vers bloc - le HTML qui arrive à l'éditeur est celui de Windows (repères et retours à la ligne)`, !!reached && /<!--StartFragment-->/.test(reached) && /<!--EndFragment-->\s+<\/body>/.test(reached), reached && reached.slice(0, 80));
    else check(`${how}, bloc vers bloc - le HTML qui arrive à l'éditeur est celui de Linux (sans repères)`, !!reached && !/StartFragment/.test(reached), reached && reached.slice(0, 80));
    let blocks = await nodesOf(page, 'conditionalText');
    check(`${how}, bloc vers bloc - le second bloc a la condition « Statut = Urgent » du premier`, blocks.length === 2 && same(blocks[1].condition, COND_URGENT), blocks);
    check(`${how}, bloc vers bloc - il garde son texte et son sinon, le premier ne bouge pas`, blocks[1].text === blockTexts[1] && blocks[1].otherwise === 'ailleurs' && blocks[0].text === blockTexts[0] && same(blocks[0].condition, COND_URGENT), blocks);
    check(`${how}, bloc vers bloc - l'étiquette dit « ${words.tagUrgentOtherwise} »`, (await tagTexts(page))[1] === words.tagUrgentOtherwise, await tagTexts(page));
    check(`${how}, bloc vers bloc - le coin d'état dit ce qui s'est passé`, (await statusText(page)) === words.done, await statusText(page));
    const stillChosen = await selectionOf(page);
    check(`${how}, bloc vers bloc - le bloc reste choisi en entier (la condition seule, non)`, stillChosen.type === 'conditionalText' && stillChosen.from === blocks[1].pos && (await pickedOf(page)) === null, stillChosen);
    check(`${how}, bloc vers bloc - la barre du bloc reste ouverte`, await toolbarOpen(page));
    await shot(page, shotName('4-apres'));
    const after = await docJson(page);
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(300);
    check(`${how}, bloc vers bloc - un seul Ctrl+Z rend la condition d'avant (« Statut = Normal »)`, (await docJson(page)) === before && (await tagTexts(page))[1] === words.tagNormalOtherwise, await tagTexts(page));
    await page.keyboard.press('Control+Shift+Z');
    await page.waitForTimeout(300);
    check(`${how}, bloc vers bloc - Ctrl+Maj+Z la redonne`, (await docJson(page)) === after);

    // --- Une pastille prend la condition seule d'une autre pastille ---
    await load(page, DOC);
    await clickItem(page, `${how}, pastille vers pastille, la copie`, CHIP.selector, 0, CHIP.type);
    check(`${how}, pastille vers pastille - le premier clic choisit la pastille ENTIÈRE`, (await pickedOf(page)) === null && (await pickedCount(page)) === 0);
    await secondClick(page, `${how}, pastille vers pastille`, CHIP.selector, 0);
    await shot(page, shotName('5-pastille-condition-seule'));
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(250);
    const chipClip = await clipboardOf(page, wrap);
    check(`${how}, pastille vers pastille - le presse-papiers porte la condition seule, pas la pastille`, isConditionOnly(chipClip) && chipClip.text === 'Statut = Urgent', { html: chipClip.html.slice(0, 120) });
    await clickItem(page, `${how}, pastille vers pastille, la cible`, CHIP.selector, 1, CHIP.type);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(450);
    const bubbles = await nodesOf(page, 'varBadge');
    check(`${how}, pastille vers pastille - la seconde a la condition de la première et garde sa colonne « Responsable »`, bubbles.length === 2 && same(bubbles[1].condition, COND_URGENT) && bubbles[1].column === 'Responsable' && bubbles[0].column === 'Titre', bubbles);
    check(`${how}, pastille vers pastille - le coin d'état dit ce qui s'est passé`, (await statusText(page)) === words.done, await statusText(page));
    const dashed = await page.evaluate(() => getComputedStyle(document.querySelectorAll('.tiptap .var-badge')[1]).borderTopStyle);
    check(`${how}, pastille vers pastille - la seconde est dessinée en pointillés bleus, comme une pastille conditionnelle`, dashed === 'dashed', dashed);
    await shot(page, shotName('6-pastille-apres'));

    // --- Un bloc donne sa condition seule à une pastille, d'un type à l'autre ---
    await load(page, DOC);
    await clickItem(page, `${how}, bloc vers pastille, la copie`, TAG.selector, 1, TAG.type);
    await secondClick(page, `${how}, bloc vers pastille`, TAG.selector, 1);
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(250);
    await clipboardOf(page, wrap);
    await clickItem(page, `${how}, bloc vers pastille, la cible`, CHIP.selector, 1, CHIP.type);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(450);
    const crossed = await nodesOf(page, 'varBadge');
    check(`${how}, bloc vers pastille - la pastille « Responsable » a la condition « Statut = Normal » du bloc B`, crossed.length === 2 && same(crossed[1].condition, COND_NORMAL) && crossed[1].column === 'Responsable', crossed);

    // --- Le premier clic copie toujours l'objet ENTIER, et Ctrl+V le remplace comme avant ---
    await load(page, DOC);
    await clickItem(page, `${how}, objet entier, la copie`, TAG.selector, 0, TAG.type);
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(250);
    const wholeClip = await clipboardOf(page, wrap);
    check(`${how}, objet entier - le presse-papiers porte le bloc avec son texte (pas la condition seule)`, /conditional-text/.test(wholeClip.html) && !/data-pp-condition/.test(wholeClip.html) && /Texte du bloc A/.test(wholeClip.html), { html: wholeClip.html.slice(0, 160) });
    await clickItem(page, `${how}, objet entier, la cible`, TAG.selector, 1, TAG.type);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(450);
    blocks = await nodesOf(page, 'conditionalText');
    check(`${how}, objet entier - Ctrl+V remplace le bloc choisi par la copie (texte A, plus de sinon) comme avant`, blocks.length === 2 && blocks[1].text === 'Texte du bloc A' && !blocks[1].otherwise && same(blocks[1].condition, COND_URGENT), blocks);

    // --- L'objet entier copié, collé sur une condition seule choisie : la cible n'en prend que la condition ---
    await load(page, DOC);
    await clickItem(page, `${how}, entier vers condition seule, la copie`, CHIP.selector, 0, CHIP.type);
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(250);
    await clipboardOf(page, wrap);
    await clickItem(page, `${how}, entier vers condition seule, la cible`, CHIP.selector, 1, CHIP.type);
    await secondClick(page, `${how}, entier vers condition seule`, CHIP.selector, 1);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(450);
    const merged = await nodesOf(page, 'varBadge');
    check(`${how}, entier vers condition seule - la cible a la condition de la copie et garde sa colonne « Responsable » (la copie ne la remplace pas)`, merged.length === 2 && same(merged[1].condition, COND_URGENT) && merged[1].column === 'Responsable', merged);
    check(`${how}, entier vers condition seule - la condition seule reste choisie pour en coller une autre`, (await pickedOf(page)) === (await selectionOf(page)).from && (await pickedCount(page)) === 1);

    // --- La même condition : rien ne change, et il le dit ---
    await load(page, DOC);
    before = await docJson(page);
    await clickItem(page, `${how}, même condition, la copie`, TAG.selector, 0, TAG.type);
    await secondClick(page, `${how}, même condition`, TAG.selector, 0);
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(250);
    await clipboardOf(page, wrap);
    await clickItem(page, `${how}, même condition, la cible`, CHIP.selector, 0, CHIP.type);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(450);
    check(`${how}, même condition - le document est identique et le coin d'état le dit`, (await docJson(page)) === before && (await statusText(page)) === words.same, await statusText(page));
  }

  // --- Relâcher la condition seule : un troisième clic, Échap, Retour arrière et une lettre (l'objet n'est PAS effacé) ---
  await load(page, DOC);
  await clickItem(page, `${label}, relâcher`, CHIP.selector, 0, CHIP.type);
  await secondClick(page, `${label}, relâcher`, CHIP.selector, 0);
  await page.waitForTimeout(650);
  const again = await centerOf(page, CHIP.selector, 0);
  await page.mouse.click(again.x, again.y);
  await page.waitForTimeout(250);
  check(`${label} - un troisième clic relâche la condition seule (la pastille reste choisie en entier)`, (await pickedOf(page)) === null && (await pickedCount(page)) === 0 && (await selectionOf(page)).type === 'varBadge');
  for (const key of ['Escape', 'Backspace', 'Delete', 'a']) {
    await clickItem(page, `${label}, touche ${key}`, CHIP.selector, 0, CHIP.type);
    if ((await pickedOf(page)) === null) await secondClick(page, `${label}, touche ${key}`, CHIP.selector, 0);
    const docBefore = await docJson(page);
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
    check(`${label} - « ${key} » relâche la condition seule sans effacer ni remplacer la pastille`, (await pickedOf(page)) === null && (await pickedCount(page)) === 0 && (await countOf(page, 'varBadge')) === 2 && (await docJson(page)) === docBefore);
  }

  // --- Un curseur dans le texte : la condition copiée seule s'insère en texte, sans toucher aucun objet ---
  await load(page, DOC);
  await clickItem(page, `${label}, curseur, la copie`, CHIP.selector, 0, CHIP.type);
  await secondClick(page, `${label}, curseur`, CHIP.selector, 0);
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
  check(`${label} - un clic au bout du texte pose un curseur (pas une pastille choisie) et relâche la condition`, caret.type !== 'varBadge' && caret.type !== 'conditionalText' && (await pickedOf(page)) === null, caret);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(400);
  const inserted = await nodesOf(page, 'varBadge');
  const fullText = await page.evaluate(() => EditorCore.getEditor().state.doc.textContent);
  check(`${label} - Ctrl+V avec un curseur insère le texte « Statut = Urgent » sans toucher aucune pastille`, fullText.includes('Statut = Urgent') && inserted.length === 2 && same(inserted[0].condition, COND_URGENT) && same(inserted[1].condition, null), inserted);

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
