#!/usr/bin/env node
// Rechercher / Remplacer (js/find-replace.js, css/find-replace.css, loupe de js/main-toolbar.js) : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au VRAI
// clavier (frappe, Ctrl+F, Ctrl+H, Entrée, Maj+Entrée, Ctrl+Z, Échap), en clair et en sombre. Ce que scenarios-find-replace.js ne peut pas voir depuis la page :
//  - la loupe tient sur la dernière rangée de la barre d'outils (qui ne gagne aucune rangée), au premier plan, dans le panneau ;
//  - un clic sur la loupe ouvre la barre de recherche, le clavier est dans son champ ; elle et la ligne « Remplacer par » tiennent dans 700 px (aucun débordement) et laissent
//    de la place au texte ;
//  - la frappe, Entrée et Maj+Entrée font défiler les résultats, le courant est toujours visible dans la zone de texte (même tout en bas d'un long modèle) ;
//  - « Mot entier » et « Respecter la casse » au clic ; le chevron montre la ligne de remplacement ;
//  - « Remplacer » puis Ctrl+Z (le clavier reste sur le bouton) : une seule étape d'annulation, Ctrl+Maj+Z ou Ctrl+Y la refait ; « Tout remplacer » : une seule étape pour tout ;
//  - le suivi des modifications allumé : le remplacement devient une suppression et une insertion suggérées, une seule étape d'annulation ;
//  - Échap ferme et rend le clavier au texte, Ctrl+F reprend le mot sélectionné, Ctrl+H ouvre sur le champ de remplacement ;
//  - Mode lecture : la barre se ferme et la loupe est grisée ; retour en Mode édition ;
//  - l'interface en anglais.
// Lancé par run-headless.mjs (groupe Node "findReplaceMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-find-replace-mouse.mjs
// FIND_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.FIND_MOUSE_PORT || 8914);
const SHOTS = process.env.FIND_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-links-blocks-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-find-replace-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
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

const nativeDialogs = [];
page.on('dialog', async d => { nativeDialogs.push(d.type() + ' : ' + d.message()); await d.dismiss(); });

const LOUPE = '#v2-btn-find';
const BAR = '#pp-find-bar';
const FIND = '#pp-find-input';
const REPL = '#pp-find-replacement';
// Un long modèle : « foo » en haut (avec Foo, FOO et football) et tout en bas, pour voir le défilement jusqu'au résultat. Casse et mot entier changent le nombre de résultats.
const FILLER = Array.from({ length: 30 }, (_, i) => `<p>Paragraphe ${i + 1} sans rien de particulier à signaler ici.</p>`).join('');
const DOC = `<p>Premier foo en haut, puis Foo et FOO, football.</p>${FILLER}<p>Tout en bas, un dernier foo.</p>`;

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const boxOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return {
    x, y, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height,
    inPanel: r.width > 0 && r.height > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
    onTop: !!top && (top === el || el.contains(top)),
  };
}, selector);
const seen = box => !!box && box.inPanel && box.onTop;
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(selector) {
  const b = await boxOf(selector);
  if (!b) return null;
  await page.mouse.move(b.x - 6, b.y, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(120);
  return b;
}
const html = () => page.evaluate(() => Editor.getHTML());
const focusId = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.closest('.tiptap') ? 'editor' : (a.id || a.tagName)) : 'rien'; });
const barOpen = () => page.evaluate(() => { const b = document.getElementById('pp-find-bar'); return !!b && !b.hidden; });
const countText = () => page.evaluate(() => document.getElementById('pp-find-count') ? document.getElementById('pp-find-count').textContent : null);
const currentText = () => page.evaluate(() => Array.from(document.querySelectorAll('.tiptap .pp-find-current')).map(e => e.textContent).join('|'));
const marksCount = () => page.evaluate(() => document.querySelectorAll('.tiptap .pp-find-match').length);
const pressed = selector => page.evaluate(sel => document.querySelector(sel).getAttribute('aria-pressed'), selector);
const selectionText = () => page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return EditorCore.getEditor().state.doc.textBetween(s.from, s.to); });
// Le résultat courant est-il dans la zone de texte visible ?
const currentVisible = () => page.evaluate(() => {
  const cur = document.querySelector('.tiptap .pp-find-current');
  const box = document.getElementById('editor-container');
  if (!cur || !box) return { found: false };
  const r = cur.getBoundingClientRect(), c = box.getBoundingClientRect();
  return { found: true, inside: r.top >= c.top - 1 && r.bottom <= c.bottom + 1 && r.left >= c.left - 1 && r.right <= c.right + 1, top: Math.round(r.top), bottom: Math.round(r.bottom), boxTop: Math.round(c.top), boxBottom: Math.round(c.bottom) };
});
const noHorizontalOverflow = () => page.evaluate(() => {
  const bar = document.getElementById('pp-find-bar');
  const barOk = !bar || bar.hidden || (bar.scrollWidth <= bar.clientWidth + 1 && bar.getBoundingClientRect().right <= innerWidth + 0.5);
  return { page: document.documentElement.scrollWidth <= innerWidth + 1, bar: barOk, scrollWidth: document.documentElement.scrollWidth };
});
const editorBox = () => page.evaluate(() => { const r = document.getElementById('editor-container').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; });
const toolbarBottom = () => page.evaluate(() => Math.round(document.getElementById('toolbar-top').getBoundingClientRect().bottom));
// Pointe un texte de l'éditeur (milieu par défaut) pour y cliquer pour de vrai. La souris est d'abord ramenée en bas de la zone de texte : posée sur la marge du haut de la page,
// elle y ferait apparaître l'invite « en-tête » (12 px de plus), et le texte visé bougerait sous le clic.
const pointOf = async (text, at = 0.5) => {
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 2 });
  await page.waitForTimeout(200);
  return locate(text, at);
};
const locate = (text, at) => page.evaluate(({ text, at }) => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const i = n.textContent.indexOf(text);
    if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width * at, y: b.top + b.height / 2 };
  }
  return null;
}, { text, at });
async function setDoc(doc) {
  await page.evaluate(d => { Editor.setHTML(d); }, doc);
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
}
async function caretAtStart() {
  await page.evaluate(() => { const ed = EditorCore.getEditor(); const TextSelection = EditorCore.getTextSelectionClass(); ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 1))); });
  await page.waitForTimeout(150);
}
async function pressKey(combo) { await page.keyboard.press(combo); await page.waitForTimeout(120); }
async function closePanelIfOpen() {
  if (await barOpen()) { await page.evaluate(() => FindReplace.close({ focus: false })); await page.waitForTimeout(120); }
}

// Le panneau garde sa ligne « Remplacer par », sa requête et ses options d'un usage à l'autre : chaque passage repart d'un panneau neuf, refermé.
async function resetPanel() {
  await page.evaluate(() => {
    FindReplace.open({ replace: false });
    const toggle = document.getElementById('pp-find-toggle-replace');
    if (toggle.getAttribute('aria-expanded') === 'true') toggle.click();
    FindReplace.setReplacement('');
    FindReplace.setOptions({ matchCase: false, wholeWord: false });
    FindReplace.setQuery('');
    FindReplace.close({ focus: false });
  });
  await page.waitForTimeout(150);
}
const scrollTop = () => page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
async function run(theme) {
  const T = theme;
  await resetPanel();
  await setDoc(DOC);
  const start = await html();
  const toolbarBefore = await toolbarBottom();
  const editorBefore = await editorBox();

  // === 1) La loupe de la barre ================================================================================================================================================
  const loupe = await boxOf(LOUPE);
  const tip = await page.evaluate(sel => document.querySelector(sel).getAttribute('data-tip'), LOUPE);
  check(`${T}, loupe : sur la barre d'outils, dans le panneau, au premier plan, infobulle avec son raccourci`, seen(loupe) && loupe.b <= toolbarBefore + 0.5 && /\(Ctrl\+F\)$/.test(tip), { loupe, toolbarBefore, tip });
  check(`${T}, loupe : la barre de recherche n'est pas ouverte au départ`, !(await barOpen()), null);

  // Le curseur au début du texte, comme quand on commence à lire : la recherche part de là.
  const first = await pointOf('Premier', 0.05);
  await page.mouse.click(first.x, first.y);
  await page.waitForTimeout(150);

  // === 2) Ouvrir à la souris, taper ==========================================================================================================================================
  await realClick(LOUPE);
  const opened = { open: await barOpen(), pressed: await pressed(LOUPE), focus: await focusId() };
  const bar1 = await boxOf(BAR);
  const toolbarAfter = await toolbarBottom();
  const editorOpen = await editorBox();
  const overflow1 = await noHorizontalOverflow();
  check(`${T}, ouverture : un clic sur la loupe ouvre la barre (loupe allumée), le clavier est dans son champ`, opened.open && opened.pressed === 'true' && opened.focus === 'pp-find-input', opened);
  check(`${T}, ouverture : la barre tient dans 700 px (aucun débordement), sous la barre d'outils qui ne bouge pas, et laisse au moins 150 px au texte`,
    seen(bar1) && bar1.h <= 48 && overflow1.page && overflow1.bar && toolbarAfter === toolbarBefore && editorOpen.top >= toolbarAfter && editorOpen.h >= 150, { bar1, overflow1, toolbarBefore, toolbarAfter, editorBefore, editorOpen });
  for (const [id, label] of [['#pp-find-input', 'champ'], ['#pp-find-prev', 'précédent'], ['#pp-find-next', 'suivant'], ['#pp-find-match-case', 'casse'], ['#pp-find-whole-word', 'mot entier'], ['#pp-find-close', 'fermer'], ['#pp-find-toggle-replace', 'chevron']]) {
    const b = await boxOf(id);
    check(`${T}, ouverture : « ${label} » est visible et cliquable (au premier plan)`, seen(b), b);
  }
  await snap(`${T}-1-ouverte`);

  await page.keyboard.type('foo');
  await page.waitForTimeout(250);
  const typed = { count: await countText(), marks: await marksCount(), current: await currentText(), selection: await selectionText(), focus: await focusId() };
  check(`${T}, frappe : « foo » trouve 5 résultats, le premier est le courant, le clavier reste dans le champ`, typed.count === '1 sur 5' && typed.marks === 5 && typed.current === 'foo' && typed.selection === 'foo' && typed.focus === 'pp-find-input', typed);
  const colors = await page.evaluate(() => {
    const m = document.querySelector('.tiptap .pp-find-match:not(.pp-find-current)'), c = document.querySelector('.tiptap .pp-find-current');
    return { match: getComputedStyle(m).backgroundColor, current: getComputedStyle(c).backgroundColor, page: getComputedStyle(document.querySelector('.tiptap')).backgroundColor };
  });
  check(`${T}, surlignage : jaune pâle pour les résultats, orange pour le courant, sur une page qui reste blanche`, colors.match === 'rgb(255, 229, 143)' && colors.current === 'rgb(255, 179, 71)' && /rgba?\(255, 255, 255|rgba\(0, 0, 0, 0\)/.test(colors.page), colors);
  await snap(`${T}-2-recherche`);

  // === 3) Parcourir ===========================================================================================================================================================
  await pressKey('Enter');
  const e1 = { count: await countText(), current: await currentText() };
  await pressKey('Shift+Enter');
  await pressKey('Shift+Enter');
  const wrapBack = { count: await countText(), current: await currentText(), visible: await currentVisible() };
  check(`${T}, Entrée / Maj+Entrée : « 2 sur 5 » (Foo), puis en arrière jusqu'au dernier résultat tout en bas, amené dans la zone de texte`, e1.count === '2 sur 5' && e1.current === 'Foo' && wrapBack.count === '5 sur 5' && wrapBack.current === 'foo' && wrapBack.visible.inside, { e1, wrapBack });
  await snap(`${T}-3-dernier-resultat`);
  await pressKey('Enter');
  const forth = { count: await countText(), visible: await currentVisible() };
  check(`${T}, Entrée sur le dernier : retour au premier, ramené en haut du texte`, forth.count === '1 sur 5' && forth.visible.inside, forth);
  await realClick('#pp-find-next');
  await realClick('#pp-find-next');
  const clicked = { count: await countText(), current: await currentText() };
  await realClick('#pp-find-prev');
  const clickedBack = { count: await countText(), current: await currentText() };
  check(`${T}, flèches : un clic sur « Résultat suivant » deux fois (3 sur 5), un sur « Résultat précédent » (2 sur 5)`, clicked.count === '3 sur 5' && clicked.current === 'FOO' && clickedBack.count === '2 sur 5' && clickedBack.current === 'Foo', { clicked, clickedBack });

  // === 4) Options ============================================================================================================================================================
  await realClick('#pp-find-whole-word');
  const whole = { count: await countText(), pressed: await pressed('#pp-find-whole-word'), marks: await marksCount() };
  await realClick('#pp-find-match-case');
  const both = { count: await countText(), pressed: await pressed('#pp-find-match-case'), marks: await marksCount() };
  await realClick('#pp-find-whole-word');
  const caseOnly = { count: await countText(), marks: await marksCount() };
  await realClick('#pp-find-match-case');
  const none = { count: await countText(), marks: await marksCount(), word: await pressed('#pp-find-whole-word'), case: await pressed('#pp-find-match-case') };
  check(`${T}, options : « Mot entier » retire football (4 résultats), avec « Respecter la casse » il n'en reste que 2, la casse seule en laisse 3, tout éteint en rend 5`,
    whole.marks === 4 && whole.pressed === 'true' && both.marks === 2 && both.pressed === 'true' && caseOnly.marks === 3 && none.marks === 5 && none.word === 'false' && none.case === 'false', { whole, both, caseOnly, none });

  // === 5) Remplacer ==========================================================================================================================================================
  await realClick('#pp-find-toggle-replace');
  const replaceRowOpen = await page.evaluate(() => ({ hidden: document.getElementById('pp-find-replace-row').hidden, expanded: document.getElementById('pp-find-toggle-replace').getAttribute('aria-expanded') }));
  const editorWithReplace = await editorBox();
  const overflow2 = await noHorizontalOverflow();
  for (const [id, label] of [['#pp-find-replacement', 'champ « Remplacer par »'], ['#pp-find-replace-one', 'Remplacer'], ['#pp-find-replace-all', 'Tout remplacer']]) {
    const b = await boxOf(id);
    check(`${T}, ligne de remplacement : « ${label} » est visible et cliquable (au premier plan)`, seen(b), b);
  }
  check(`${T}, ligne de remplacement : le chevron la montre (tourné vers le bas), 700 px suffisent, il reste 110 px au texte`, !replaceRowOpen.hidden && replaceRowOpen.expanded === 'true' && overflow2.page && overflow2.bar && editorWithReplace.h >= 110, { replaceRowOpen, overflow2, editorWithReplace });
  await realClick(REPL);
  await page.keyboard.type('bar');
  await snap(`${T}-4-remplacement`);
  // Le curseur au début : « Remplacer » commence par le premier résultat.
  await caretAtStart();
  await realClick('#pp-find-replace-one'); // se place sur le premier résultat
  const placed = { html: await html(), count: await countText(), current: await currentText() };
  await realClick('#pp-find-replace-one'); // le remplace
  const afterOne = { html: await html(), count: await countText(), current: await currentText(), focus: await focusId() };
  check(`${T}, « Remplacer » : le premier clic se place sur le résultat sans rien changer, le second le remplace (foo devient bar) et passe au suivant`,
    placed.html === start && placed.current === 'foo' && afterOne.html.includes('Premier bar en haut') && !afterOne.html.includes('Premier foo') && afterOne.current === 'Foo' && afterOne.count === '1 sur 4' && afterOne.focus === 'pp-find-replace-one', { placed, afterOne });
  await pressKey('Control+z');
  const undone = await html();
  await pressKey('Control+Shift+z');
  const redone = await html();
  await pressKey('Control+z');
  await pressKey('Control+y');
  const redoneY = await html();
  await pressKey('Control+z');
  check(`${T}, Ctrl+Z après « Remplacer » (le clavier reste sur le bouton) : une seule étape défait le remplacement, Ctrl+Maj+Z puis Ctrl+Y le refont`,
    undone === start && redone === afterOne.html && redoneY === afterOne.html && (await html()) === start, { undone: undone === start, redone: redone === afterOne.html, redoneY: redoneY === afterOne.html });

  await realClick('#pp-find-replace-all');
  const all = { html: await html(), count: await countText(), marks: await marksCount() };
  check(`${T}, « Tout remplacer » : les 5 résultats deviennent « bar » (football devient bartball), le compteur dit « 5 remplacements », plus rien en surbrillance`,
    (all.html.match(/bar/g) || []).length === 5 && !/foo/i.test(all.html) && all.html.includes('bartball') && all.count === '5 remplacements' && all.marks === 0, all);
  await snap(`${T}-5-tout-remplace`);
  await pressKey('Control+z');
  const allUndone = await html();
  await pressKey('Control+Shift+z');
  const allRedone = await html();
  await pressKey('Control+z');
  check(`${T}, « Tout remplacer » puis Ctrl+Z : les 5 remplacements se défont d'un seul coup, Ctrl+Maj+Z les refait d'un seul coup`, allUndone === start && allRedone === all.html && (await html()) === start, { undone: allUndone === start, redone: allRedone === all.html });

  // === 6) Suivi des modifications ============================================================================================================================================
  await realClick('#v2-btn-track-changes');
  const tracked = await page.evaluate(() => ({ on: Editor.isTrackChangesOn(), active: document.getElementById('v2-btn-track-changes').classList.contains('is-active') }));
  await realClick('#pp-find-replace-all');
  const suggestion = await page.evaluate(() => ({
    dels: Array.from(document.querySelectorAll('.tiptap del')).map(d => d.textContent.toLowerCase()),
    inss: Array.from(document.querySelectorAll('.tiptap ins')).map(d => d.textContent),
    count: document.getElementById('pp-find-count').textContent,
  }));
  await pressKey('Control+z');
  const suggestionUndone = await html();
  const leftovers = await page.evaluate(() => document.querySelectorAll('.tiptap del, .tiptap ins').length);
  check(`${T}, suivi des modifications : « Tout remplacer » propose 5 suppressions et 5 insertions (les anciens textes restent lisibles), un seul Ctrl+Z les retire toutes`,
    tracked.on && tracked.active && suggestion.dels.length === 5 && suggestion.inss.length === 5 && suggestion.dels.every(d => d.includes('foo')) && suggestion.inss.every(i => i === 'bar') && suggestionUndone === start && leftovers === 0, { tracked, suggestion, undone: suggestionUndone === start, leftovers });
  await snap(`${T}-6-suivi`);
  await realClick('#v2-btn-track-changes');
  check(`${T}, suivi des modifications : un second clic sur le bouton l'éteint`, !(await page.evaluate(() => Editor.isTrackChangesOn())), null);

  // === 7) Fermer, Ctrl+F, Ctrl+H =============================================================================================================================================
  await realClick(FIND);
  await pressKey('Escape');
  const closed = { open: await barOpen(), marks: await marksCount(), focus: await focusId(), loupe: await page.evaluate(sel => document.querySelector(sel).classList.contains('is-active'), LOUPE), selection: await selectionText() };
  check(`${T}, Échap : la barre se ferme, le surlignage disparaît, le clavier retourne au texte, la loupe s'éteint, le résultat courant reste sélectionné`, !closed.open && closed.marks === 0 && closed.focus === 'editor' && !closed.loupe && closed.selection.length > 0, closed);

  await scrollTop();
  const word = await pointOf('Premier');
  await page.mouse.dblclick(word.x, word.y);
  await page.waitForTimeout(150);
  await pressKey('Control+f');
  const ctrlF = { open: await barOpen(), value: await page.evaluate(() => document.getElementById('pp-find-input').value), focus: await focusId(), count: await countText(), replaceHidden: await page.evaluate(() => document.getElementById('pp-find-replace-row').hidden) };
  check(`${T}, Ctrl+F dans le texte avec « Premier » sélectionné : la barre s'ouvre avec ce mot dans le champ (1 résultat), le clavier dans le champ`, ctrlF.open && ctrlF.value === 'Premier' && ctrlF.count === '1 sur 1' && ctrlF.focus === 'pp-find-input', ctrlF);
  await pressKey('Escape');
  await scrollTop();
  const word2 = await pointOf('Paragraphe 3 ');
  await page.mouse.click(word2.x, word2.y);
  await page.waitForTimeout(100);
  await pressKey('Control+h');
  const ctrlH = { open: await barOpen(), replaceHidden: await page.evaluate(() => document.getElementById('pp-find-replace-row').hidden), focus: await focusId() };
  const overflow3 = await noHorizontalOverflow();
  check(`${T}, Ctrl+H dans le texte : la barre s'ouvre avec la ligne « Remplacer par », le clavier dans le champ de remplacement`, ctrlH.open && !ctrlH.replaceHidden && ctrlH.focus === 'pp-find-replacement' && overflow3.page && overflow3.bar, { ctrlH, overflow3 });
  await pressKey('Escape');
  check(`${T}, Échap depuis le champ de remplacement : la barre se ferme, le clavier retourne au texte`, !(await barOpen()) && (await focusId()) === 'editor', await focusId());

  // Le clavier hors du texte, sur un bouton de la barre d'outils (« Rétablir », sans effet ici, comme après Tab) : Ctrl+F ouvre quand même la barre, pas la recherche du navigateur.
  await page.focus('#v2-btn-redo');
  const toolbarFocus = await focusId();
  await pressKey('Control+f');
  const fromToolbar = { open: await barOpen(), focus: await focusId() };
  check(`${T}, Ctrl+F avec le clavier sur un bouton de la barre d'outils : la barre s'ouvre, le clavier dans son champ`, toolbarFocus === 'v2-btn-redo' && fromToolbar.open && fromToolbar.focus === 'pp-find-input', { toolbarFocus, fromToolbar });
  await pressKey('Escape');

  // === 8) Mode lecture =======================================================================================================================================================
  await realClick(LOUPE);
  const beforeRead = await barOpen();
  await realClick('#btn-mode-read');
  await page.waitForTimeout(250);
  const read = await page.evaluate(() => ({ open: !document.getElementById('pp-find-bar').hidden, locked: document.getElementById('v2-btn-find').getAttribute('aria-disabled'), editorHidden: document.getElementById('editor-container').offsetParent === null }));
  await realClick(LOUPE);
  const stillClosed = !(await barOpen());
  await realClick('#btn-mode-edit');
  await page.waitForTimeout(250);
  const back = await page.evaluate(() => ({ locked: document.getElementById('v2-btn-find').getAttribute('aria-disabled'), editorHidden: document.getElementById('editor-container').offsetParent === null }));
  await realClick(LOUPE);
  const reopened = await barOpen();
  check(`${T}, Mode lecture : la barre ouverte se ferme, la loupe est grisée et ne l'ouvre plus ; en Mode édition la loupe rouvre la barre`,
    beforeRead && !read.open && read.locked === 'true' && read.editorHidden && stillClosed && back.locked !== 'true' && !back.editorHidden && reopened, { beforeRead, read, stillClosed, back, reopened });
  await closePanelIfOpen();
}

async function runEnglish() {
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(300);
  await resetPanel();
  await setDoc(DOC);
  const first = await pointOf('Premier', 0.05);
  await page.mouse.click(first.x, first.y);
  const tip = await page.evaluate(sel => document.querySelector(sel).getAttribute('data-tip'), LOUPE);
  await realClick(LOUPE);
  await page.keyboard.type('foo');
  await page.waitForTimeout(250);
  await realClick('#pp-find-toggle-replace');
  await realClick(REPL);
  await page.keyboard.type('bar');
  const en = await page.evaluate(() => ({
    bar: document.getElementById('pp-find-bar').getAttribute('aria-label'),
    placeholder: document.getElementById('pp-find-input').placeholder,
    replacement: document.getElementById('pp-find-replacement').placeholder,
    count: document.getElementById('pp-find-count').textContent,
    next: document.getElementById('pp-find-next').title,
    caseTip: document.getElementById('pp-find-match-case').title,
    one: document.getElementById('pp-find-replace-one').textContent,
    all: document.getElementById('pp-find-replace-all').textContent,
  }));
  const box = await boxOf(BAR), over = await noHorizontalOverflow();
  check('anglais, barre : libellés, infobulles et compteur en anglais, la barre tient dans 700 px', /^Find \/ Replace \(Ctrl\+F\)$/.test(tip) && en.placeholder === 'Find in the template' && en.replacement === 'Replace with' && en.count === '1 of 5'
    && en.next === 'Next result (Enter)' && en.caseTip === 'Match case' && en.one === 'Replace' && en.all === 'Replace all' && seen(box) && over.page && over.bar, { tip, en, over });
  await snap('en-1-barre');
  await realClick('#pp-find-replace-all');
  const done = await countText();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  await realClick(FIND);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('introuvable');
  await page.waitForTimeout(200);
  const none = await countText();
  check('anglais, compteur : « 5 replacements » après « Replace all », « No results » pour un mot absent', done === '5 replacements' && none === 'No results', { done, none });
  await pressKey('Escape');
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(250);
}

await run('light');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await run('dark');
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
