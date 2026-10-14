#!/usr/bin/env node
// Rechercher / Remplacer (js/find-replace.js, css/find-replace.css, loupe de js/main-toolbar.js) : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au VRAI
// clavier (frappe, Ctrl+F, Ctrl+H, Entrée, Maj+Entrée, Ctrl+Z, Échap), en clair et en sombre. Ce que scenarios-find-replace.js ne peut pas voir depuis la page :
//  - la loupe tient sur la dernière rangée de la barre d'outils (qui ne gagne aucune rangée), au premier plan, dans le panneau ;
//  - un clic sur la loupe ouvre la barre de recherche, le clavier est dans son champ ; elle et la ligne « Remplacer par » tiennent dans 700 px (aucun débordement) et laissent
//    de la place au texte ;
//  - la frappe, Entrée et Maj+Entrée font défiler les résultats, le courant est toujours visible dans la zone de texte (même tout en bas d'un long modèle) ;
//  - « Mot entier » et « Respecter la casse » au clic ; le chevron montre la ligne de remplacement ;
//  - « Expression régulière » au clic : le motif tapé au vrai clavier (« \d+ », « (\w+) (\w+) »), « Expression non valide » quand il est faux sans que la barre ne passe sur deux rangées,
//    « Tout remplacer » avec « $2 $1 » (une étape d'annulation), l'option éteinte rend au motif son sens de texte ;
//  - les bulles (variables et calculs) : une bulle trouvée est surlignée comme un texte (la courante en orange, son texte lisible), Entrée et Maj+Entrée s'y placent, « Remplacer » change son
//    « Avant » et son « Après » mais jamais son nom ni sa formule, et le plus long des messages (« Avec le suivi, une bulle ne se remplace pas. ») tient sur la rangée du champ, en français
//    comme en anglais ;
//  - l'en-tête et le pied de page : « foo » est compté dans les trois textes, Entrée et Maj+Entrée passent du corps au pied, à l'en-tête et reviennent (l'éditeur entre dans la zone, sa pastille
//    est au premier plan, le résultat courant est orange et visible, le clavier reste dans le champ), « Remplacer » passe au résultat de l'autre texte, « Tout remplacer » agit sur le texte
//    ouvert et dit « 3 remplacements, 2 autres ailleurs » sur une seule rangée, Ctrl+Z ne défait que le texte ouvert, « Terminer » ramène au corps ;
//  - « Remplacer » qui passe d'un texte à l'autre, puis Ctrl+Z au vrai clavier (14/10, carte « Rouvrir le texte ») : le corps remplacé, le pied s'ouvre ; Ctrl+Z, que le clavier soit resté sur le bouton « Remplacer »,
//    qu'on ait cliqué dans le texte du pied ou que ce soit un clic sur le bouton Annuler de la barre, rouvre le corps et défait le remplacement (le pied reste tel quel, Ctrl+Maj+Z le refait) ; une frappe dans le pied
//    d'abord : Ctrl+Z défait la frappe seule ;
//  - « Remplacer » puis Ctrl+Z (le clavier reste sur le bouton) : une seule étape d'annulation, Ctrl+Maj+Z ou Ctrl+Y la refait ; « Tout remplacer » : une seule étape pour tout ;
//  - le suivi des modifications allumé : le remplacement devient une suppression et une insertion suggérées, une seule étape d'annulation ;
//  - Échap ferme et rend le clavier au texte, Ctrl+F reprend le mot sélectionné, Ctrl+H ouvre sur le champ de remplacement ;
//  - Mode lecture : la barre se ferme et la loupe est grisée ; retour en Mode édition ;
//  - beaucoup de résultats (3 500) : à la vraie molette puis au clavier, ceux de l'écran sont toujours tous surlignés (même après un long passage sans résultat et après un saut tout
//    en bas), le surlignage reste borné, le résultat courant est amené à l'écran ;
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
    FindReplace.setOptions({ matchCase: false, wholeWord: false, regex: false });
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
  for (const [id, label] of [['#pp-find-input', 'champ'], ['#pp-find-prev', 'précédent'], ['#pp-find-next', 'suivant'], ['#pp-find-match-case', 'casse'], ['#pp-find-whole-word', 'mot entier'], ['#pp-find-regex', 'expression régulière'], ['#pp-find-close', 'fermer'], ['#pp-find-toggle-replace', 'chevron']]) {
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

// L'expression régulière à la vraie souris et au vrai clavier : le bouton de la barre (dans 700 px, sans passer sur une deuxième rangée), le motif tapé, le motif faux, le remplacement avec ses groupes.
async function runRegex(T) {
  await resetPanel();
  await setDoc('<p>Réf A12 et b34, total 56. Tel 01 23 45 67. a.c abc</p>');
  const first = await pointOf('Réf', 0.05);
  await page.mouse.click(first.x, first.y);
  await page.waitForTimeout(150);
  await caretAtStart();
  await realClick(LOUPE);
  const opened = await boxOf('#pp-find-regex');
  check(`${T}, expression régulière : le bouton est dans la barre, visible et au premier plan, éteint au départ, avec son infobulle`,
    seen(opened) && (await pressed('#pp-find-regex')) === 'false' && (await page.evaluate(() => document.getElementById('pp-find-regex').title)) === 'Expression régulière', opened);
  await realClick('#pp-find-regex');
  const on = { pressed: await pressed('#pp-find-regex'), overflow: await noHorizontalOverflow() };
  await realClick(FIND);
  await page.keyboard.type('\\d+');
  await page.waitForTimeout(250);
  const digits = { count: await countText(), marks: await marksCount(), current: await currentText(), focus: await focusId(), invalid: await page.evaluate(() => document.getElementById('pp-find-input').hasAttribute('aria-invalid')) };
  check(`${T}, expression régulière : un clic allume l'option, « \\d+ » tapé au clavier trouve les 7 nombres (« 12 » le premier), le champ n'est pas en erreur`,
    on.pressed === 'true' && on.overflow.page && on.overflow.bar && digits.count === '1 sur 7' && digits.marks === 7 && digits.current === '12' && digits.focus === 'pp-find-input' && digits.invalid === false, { on, digits });
  await snap(`${T}-6-expression`);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('(\\d+');
  await page.waitForTimeout(250);
  const bad = await page.evaluate(() => {
    const bar = document.getElementById('pp-find-bar'), count = document.getElementById('pp-find-count'), input = document.getElementById('pp-find-input');
    return {
      count: count.textContent, kind: count.dataset.kind, invalid: input.getAttribute('aria-invalid'), marks: document.querySelectorAll('.tiptap .pp-find-match').length, barH: Math.round(bar.getBoundingClientRect().height),
      next: document.getElementById('pp-find-next').getAttribute('aria-disabled'), color: getComputedStyle(count).color, border: getComputedStyle(input).borderTopColor,
    };
  });
  const badBar = await boxOf(BAR);
  const badOverflow = await noHorizontalOverflow();
  check(`${T}, expression régulière : un motif faux (« (\\d+ ») dit « Expression non valide » en rouge, le champ prend le cadre rouge, rien n'est surligné, et la barre reste sur une seule rangée dans 700 px`,
    bad.count === 'Expression non valide' && bad.kind === 'error' && bad.invalid === 'true' && bad.marks === 0 && bad.next === 'true' && bad.color === bad.border && seen(badBar) && bad.barH <= 48 && badOverflow.page && badOverflow.bar, { bad, badBar, badOverflow });
  await snap(`${T}-7-expression-fausse`);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('a.c');
  await page.waitForTimeout(250);
  const dot = { count: await countText(), marks: await marksCount() };
  await realClick('#pp-find-regex');
  await page.waitForTimeout(150);
  const literal = { count: await countText(), marks: await marksCount(), pressed: await pressed('#pp-find-regex') };
  check(`${T}, expression régulière : « a.c » en trouve 2 (a.c et abc), l'option éteinte rend au point son sens de texte : 1 seul résultat`,
    dot.count === '1 sur 2' && dot.marks === 2 && literal.pressed === 'false' && literal.count === '1 sur 1' && literal.marks === 1, { dot, literal });

  // Les groupes dans le remplacement
  await setDoc('<p>Dupont Jean, Martin Anne</p>');
  await caretAtStart();
  await realClick('#pp-find-regex');
  await realClick(FIND);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('(\\w+) (\\w+)');
  await realClick('#pp-find-toggle-replace');
  const placeholder = await page.evaluate(() => document.getElementById('pp-find-replacement').placeholder);
  await realClick(REPL);
  await page.keyboard.type('$2 $1');
  const start = await html();
  const withReplace = { overflow: await noHorizontalOverflow(), editor: await editorBox(), box: await boxOf('#pp-find-replace-all') };
  await realClick('#pp-find-replace-all');
  const all = { html: await html(), count: await countText() };
  await pressKey('Control+z');
  const undone = await html();
  check(`${T}, expression régulière : « Tout remplacer » avec « $2 $1 » permute les prénoms et les noms (2 remplacements), une seule étape d'annulation ; le champ dit « ($1 = groupe) » ; la barre à deux rangées tient dans 700 px`,
    placeholder === 'Remplacer par ($1 = groupe)' && all.html.startsWith('<p>Jean Dupont, Anne Martin</p>') && all.count === '2 remplacements' && undone === start
      && withReplace.overflow.page && withReplace.overflow.bar && seen(withReplace.box) && withReplace.editor.h >= 110, { placeholder, all, undone: undone === start, withReplace });
  await snap(`${T}-8-groupes`);
  await closePanelIfOpen();
}

// Les bulles à la vraie souris et au vrai clavier : une bulle trouvée est surlignée comme un texte (la courante en orange) et reste lisible, Entrée et Maj+Entrée s'y placent, « Remplacer »
// change son « Avant » mais jamais son nom ; chaque message de refus tient sur la rangée du champ dans 700 px (sinon le bouton « fermer » passerait sous le champ).
const bubbleHtml = (key, extra) => `<span class="var-badge" data-table="MouseBulles" data-column="${key}" data-key="MouseBulles.${key}"${extra || ''}></span>`;
const calcBubbleHtml = formula => `<span class="calc-badge" data-formula="${formula}"></span>`;
const BUBBLE_DOC = `<p>Bonjour ${bubbleHtml('Client', ' data-before="Madame "')} de ${bubbleHtml('Ville')}, total ${calcBubbleHtml('{MouseBulles.Montant} * 2')}. Le client Dupont signe, un client fidèle.</p>`;
const MESSAGES = {
  fr: { name: 'Le nom d’une bulle ne se remplace pas.', formula: 'La formule d’un calcul ne se remplace pas.', tooLong: 'Trop long pour une bulle (40 signes au plus).', suggest: 'Avec le suivi, une bulle ne se remplace pas.' },
  en: { name: 'A bubble’s name can’t be replaced.', formula: 'A calculation’s formula can’t be replaced.', tooLong: 'Too long for a bubble (40 characters at most).', suggest: 'With track changes on, bubbles aren’t replaced.' },
};
// Chaque bulle de la page : son genre, si elle est surlignée ou courante, son fond et le contraste de son texte sur ce fond.
const bubbleColors = () => page.evaluate(() => {
  const parse = s => { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2] }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  return Array.from(document.querySelectorAll('.tiptap .var-badge, .tiptap .calc-badge')).map(n => {
    const s = getComputedStyle(n);
    return { kind: n.classList.contains('calc-badge') ? 'calcul' : (n.getAttribute('data-column') || ''), match: n.classList.contains('pp-find-match'), current: n.classList.contains('pp-find-current'), bg: s.backgroundColor, ratio: Math.round(ratio(parse(s.color), parse(s.backgroundColor)) * 100) / 100 };
  });
});
// Les bulles du document, telles que le modèle les enregistre : le nom (ou la formule), l'« Avant » et l'« Après ».
const bubbleAttrs = () => page.evaluate(() => {
  const found = [];
  EditorCore.getEditor().state.doc.descendants(n => {
    if (n.type.name === 'varBadge') found.push(`${n.attrs.column}|${n.attrs.before || ''}|${n.attrs.after || ''}`);
    else if (n.type.name === 'calcBadge') found.push(`calcul|${n.attrs.formula}`);
  });
  return found;
});
// La sélection recouvre-t-elle exactement UNE bulle ? (le nom du genre de nœud, sinon null)
const selectedBubble = () => page.evaluate(() => {
  const ed = EditorCore.getEditor(), s = ed.state.selection, n = ed.state.doc.nodeAt(s.from);
  return n && (n.type.name === 'varBadge' || n.type.name === 'calcBadge') && s.to === s.from + n.nodeSize ? n.type.name : null;
});
// La rangée du champ tient-elle sur une seule ligne, et le message n'est-il pas rogné ?
const findRowFits = () => page.evaluate(() => {
  const row = document.querySelector('#pp-find-bar .pp-find-row');
  const tops = Array.from(row.children).filter(c => c.getClientRects().length).map(c => { const r = c.getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2); });
  const count = document.getElementById('pp-find-count');
  return { single: Math.max.apply(null, tops) - Math.min.apply(null, tops) <= 1, field: Math.round(document.getElementById('pp-find-input').getBoundingClientRect().width), clipped: count.scrollWidth > count.clientWidth + 1, width: Math.round(count.getBoundingClientRect().width) };
});
async function typeInto(selector, text) {
  await realClick(selector);
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
  await page.waitForTimeout(250);
}
// Les quatre messages de refus de « Remplacer », dans la langue donnée : chacun dit pourquoi la bulle reste telle quelle et tient sur la rangée du champ.
async function bubbleMessages(label, lang) {
  const M = MESSAGES[lang];
  await resetPanel();
  await page.evaluate(() => window.__gristStub.setVariables('MouseBulles', { Client: 'Text', Ville: 'Text', Montant: 'Numeric' }));
  await setDoc(BUBBLE_DOC);
  await caretAtStart();
  await realClick(LOUPE);
  await realClick('#pp-find-toggle-replace');
  const start = await html();
  const asked = async (query, replacement, expected) => {
    await caretAtStart();
    await typeInto(FIND, query);
    await typeInto(REPL, replacement);
    await realClick('#pp-find-replace-one');
    const flash = await countText();
    return { flash, ok: flash === expected, fits: await findRowFits(), overflow: await noHorizontalOverflow(), same: (await html()) === start };
  };
  const name = await asked('client', 'dossier', M.name);
  const tooLong = await asked('madame', 'x'.repeat(45), M.tooLong);
  await snap(`${label}-10-bulle-trop-long`);
  const formula = await asked('montant', 'dossier', M.formula);
  await realClick('#v2-btn-track-changes');
  const suggest = await asked('madame', 'Mme', M.suggest);
  await snap(`${label}-10-bulle-suivi`);
  await realClick('#v2-btn-track-changes');
  const traces = await page.evaluate(() => ({ track: Editor.isTrackChangesOn(), marks: document.querySelectorAll('.tiptap del, .tiptap ins').length }));
  const all = { name, tooLong, formula, suggest };
  check(`${label}, messages de refus : les quatre (nom, trop long, formule, suivi) disent leur raison, laissent le modèle tel quel et tiennent sur la rangée du champ dans 700 px (le champ garde 110 px au moins)`,
    Object.values(all).every(r => r.ok && r.same && r.fits.single && !r.fits.clipped && r.fits.field >= 110 && r.overflow.page && r.overflow.bar) && !traces.track && traces.marks === 0, { all, traces });
  await closePanelIfOpen();
}
async function runBubbles(T) {
  await resetPanel();
  await page.evaluate(() => window.__gristStub.setVariables('MouseBulles', { Client: 'Text', Ville: 'Text', Montant: 'Numeric' }));
  await setDoc(BUBBLE_DOC);
  const first = await pointOf('Bonjour', 0.05);
  await page.mouse.click(first.x, first.y);
  await page.waitForTimeout(150);
  await caretAtStart();
  await realClick(LOUPE);
  await page.keyboard.type('client');
  await page.waitForTimeout(250);
  const typed = { count: await countText(), colors: await bubbleColors(), marks: await marksCount(), focus: await focusId() };
  const client = typed.colors.find(b => b.kind === 'Client'), others = typed.colors.filter(b => b.kind !== 'Client');
  check(`${T}, bulles : « client » trouve la bulle Client (par son nom) et deux textes (« 1 sur 3 »), la bulle est la courante : orange, texte lisible (4,5:1 au moins), les autres bulles ne sont pas surlignées`,
    typed.count === '1 sur 3' && typed.marks === 3 && typed.focus === 'pp-find-input' && client.match && client.current && client.bg === 'rgb(255, 179, 71)' && client.ratio >= 4.5 && others.every(b => !b.match && !b.current), typed);
  await snap(`${T}-9-bulle-courante`);
  await pressKey('Enter');
  const next = { count: await countText(), colors: await bubbleColors(), current: await currentText() };
  const clientNext = next.colors.find(b => b.kind === 'Client');
  check(`${T}, bulles : Entrée passe au texte « client » (2 sur 3) et la bulle reste surlignée en jaune pâle, texte lisible`,
    next.count === '2 sur 3' && next.current === 'client' && clientNext.match && !clientNext.current && clientNext.bg === 'rgb(255, 229, 143)' && clientNext.ratio >= 4.5, next);
  await snap(`${T}-9-bulle-trouvee`);
  await pressKey('Shift+Enter');
  const back = { count: await countText(), selected: await selectedBubble() };
  check(`${T}, bulles : Maj+Entrée revient à la bulle (1 sur 3) : la sélection est la bulle`, back.count === '1 sur 3' && back.selected === 'varBadge', back);

  // « Remplacer » : le nom reste, le texte suivant se remplace ; « Tout remplacer » sur l'« Avant » ; une seule étape d'annulation.
  await realClick('#pp-find-toggle-replace');
  await typeInto(REPL, 'dossier');
  const before = await html();
  await realClick('#pp-find-replace-one');
  const refused = { flash: await countText(), same: (await html()) === before, selection: await selectionText(), fits: await findRowFits() };
  check(`${T}, bulles : « Remplacer » sur le nom de la bulle ne change rien, le dit (« Le nom d’une bulle ne se remplace pas. ») et passe au texte suivant, sur une seule rangée`,
    refused.flash === MESSAGES.fr.name && refused.same && refused.selection === 'client' && refused.fits.single && !refused.fits.clipped, refused);
  await snap(`${T}-9-bulle-refus`);
  await realClick('#pp-find-replace-one');
  const replaced = { attrs: await bubbleAttrs(), line: await page.evaluate(() => EditorCore.getEditor().state.doc.firstChild.textContent) };
  check(`${T}, bulles : le second « Remplacer » remplace le texte (« Le dossier Dupont ») sans toucher la bulle Client ni son « Avant »`,
    /Le dossier Dupont signe, un client fidèle/.test(replaced.line) && replaced.attrs[0] === 'Client|Madame |', replaced);
  await pressKey('Control+z');
  const undone = await html();
  check(`${T}, bulles : Ctrl+Z défait ce remplacement d'un seul coup`, undone === before, { undone: undone === before });

  await typeInto(FIND, 'madame');
  await typeInto(REPL, 'Mme');
  const avant = { count: await countText(), colors: await bubbleColors() };
  await realClick('#pp-find-replace-all');
  const avantDone = { flash: await countText(), attrs: await bubbleAttrs(), html: await html() };
  await pressKey('Control+z');
  const avantUndone = await bubbleAttrs();
  await pressKey('Control+Shift+z');
  const avantRedone = await bubbleAttrs();
  check(`${T}, bulles : « madame » trouve l'« Avant » de la bulle (1 sur 1, surlignée), « Tout remplacer » par « Mme » le change (« 1 remplacement »), le nom reste « Client » ; Ctrl+Z puis Ctrl+Maj+Z le défont et le refont`,
    avant.count === '1 sur 1' && avant.colors.find(b => b.kind === 'Client').match && avantDone.flash === '1 remplacement' && avantDone.attrs[0] === 'Client|Mme |' && avantUndone[0] === 'Client|Madame |' && avantRedone[0] === 'Client|Mme |', { avant, avantDone: avantDone.attrs, avantUndone, avantRedone });
  await snap(`${T}-9-bulle-avant`);
  await pressKey('Control+z');
  await closePanelIfOpen();
  await bubbleMessages(T, 'fr');
}

// L'en-tête et le pied de page : trois textes, « foo » dans chacun (1 dans l'en-tête, 3 dans le corps, 1 dans le pied).
const ZONE_BODY = '<p>Premier foo du corps, puis Foo.</p><p>Un deuxième paragraphe sans rien à trouver.</p><p>Et un dernier foo.</p>';
const ZONE_HEADER = '<p>Dossier foo - en-tête</p>';
const ZONE_FOOTER = '<p>Pied de page : foo</p>';
const hfMode = () => page.evaluate(() => { const m = HeaderFooterPreview.getHfMode(); return m ? m.zone + ':' + m.variant : 'main'; });
const zoneTexts = () => page.evaluate(() => { const d = Editor.getHeaderFooterData(); return { header: d.header.default, footer: d.footer.default }; });
const currentColor = () => page.evaluate(() => { const e = document.querySelector('.tiptap .pp-find-current'); return e ? getComputedStyle(e).backgroundColor : null; });
async function setZones() {
  await setDoc(ZONE_BODY);
  await page.evaluate(({ header, footer }) => Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: header, first: '' }, footer: { default: footer, first: '' } }), { header: ZONE_HEADER, footer: ZONE_FOOTER });
  await page.waitForTimeout(250);
}
// Le modèle suivant ne doit pas hériter d'un en-tête ni d'un pied : sortie de la zone, zones vides.
async function clearZones() {
  await page.evaluate(() => { Editor.exitHeaderFooterModeIfActive(); Editor.setHeaderFooterData({ enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } }); });
  await page.waitForTimeout(200);
}
async function runZones(T) {
  await resetPanel();
  await setZones();
  const first = await pointOf('Premier', 0.05);
  await page.mouse.click(first.x, first.y);
  await page.waitForTimeout(150);
  await caretAtStart();
  await realClick(LOUPE);
  await page.keyboard.type('foo');
  await page.waitForTimeout(250);
  const typed = { count: await countText(), mode: await hfMode(), focus: await focusId(), marks: await marksCount(), fits: await findRowFits() };
  check(`${T}, en-tête et pied : « foo » est compté dans les trois textes (« 2 sur 5 » : un dans l'en-tête, trois dans le corps, un dans le pied), le corps reste ouvert et le clavier dans le champ`,
    typed.count === '2 sur 5' && typed.mode === 'main' && typed.focus === 'pp-find-input' && typed.marks === 3 && typed.fits.single, typed);

  // Entrée au vrai clavier : le corps, le pied, l'en-tête, le corps.
  const walk = [];
  for (let i = 0; i < 5; i++) {
    await pressKey('Enter');
    walk.push({ count: await countText(), mode: await hfMode(), focus: await focusId(), current: await currentText(), color: await currentColor(), visible: await currentVisible(), pill: await boxOf('#v2-hf-pill'), fits: await findRowFits() });
    if (i === 2) await snap(`${T}-11-pied`);
    if (i === 3) await snap(`${T}-11-en-tete`);
  }
  const expected = [['3 sur 5', 'main', 'Foo'], ['4 sur 5', 'main', 'foo'], ['5 sur 5', 'footer:default', 'foo'], ['1 sur 5', 'header:default', 'foo'], ['2 sur 5', 'main', 'foo']];
  check(`${T}, en-tête et pied : Entrée passe du dernier « foo » du corps à celui du pied, puis à celui de l'en-tête, puis au corps ; le clavier reste dans le champ, le résultat courant est orange et visible, la pastille de la zone est au premier plan quand une zone est ouverte`,
    walk.every((w, i) => w.count === expected[i][0] && w.mode === expected[i][1] && w.current === expected[i][2] && w.focus === 'pp-find-input' && w.color === 'rgb(255, 179, 71)' && w.visible.found && w.visible.inside && w.fits.single
      && (w.mode === 'main' ? !w.pill : seen(w.pill))), { walk });

  const back = [];
  for (let i = 0; i < 3; i++) { await pressKey('Shift+Enter'); back.push({ count: await countText(), mode: await hfMode(), focus: await focusId() }); }
  check(`${T}, en-tête et pied : Maj+Entrée fait le chemin inverse (corps, en-tête, pied, corps)`,
    back.map(b => b.count + ' ' + b.mode).join(' | ') === '1 sur 5 header:default | 5 sur 5 footer:default | 4 sur 5 main' && back.every(b => b.focus === 'pp-find-input'), { back });

  // « Remplacer » du dernier « foo » du corps : il est remplacé, la recherche passe au pied (l'éditeur y entre).
  await realClick('#pp-find-toggle-replace');
  await typeInto(REPL, 'bar');
  await realClick('#pp-find-next');
  await realClick('#pp-find-prev');
  const lastBefore = await html();
  await realClick('#pp-find-replace-one');
  const crossed = { count: await countText(), mode: await hfMode(), body: await html(), current: await currentText(), pill: await boxOf('#v2-hf-pill'), fits: await findRowFits() };
  check(`${T}, en-tête et pied : « Remplacer » sur le dernier « foo » du corps le remplace puis passe à celui du pied (l'éditeur y entre, « 4 sur 4 »), le corps garde ses autres « foo »`,
    crossed.count === '4 sur 4' && crossed.mode === 'footer:default' && crossed.current === 'foo' && crossed.body !== lastBefore && seen(crossed.pill) && crossed.fits.single, { crossed, lastBefore });
  await snap(`${T}-11-remplacer-vers-le-pied`);

  // « Tout remplacer » dans le pied (le texte ouvert) : un remplacement, trois attendent ailleurs ; Ctrl+Z défait le pied seul.
  const footerBefore = (await zoneTexts()).footer;
  await realClick('#pp-find-replace-all');
  const footerAll = { flash: await countText(), fits: await findRowFits(), overflow: await noHorizontalOverflow(), footer: (await zoneTexts()).footer };
  await pressKey('Control+z');
  const footerUndone = { footer: (await zoneTexts()).footer, mode: await hfMode() };
  await pressKey('Control+Shift+z');
  const footerRedone = (await zoneTexts()).footer;
  check(`${T}, en-tête et pied : « Tout remplacer » dans le pied ouvert dit « 1 remplacement, 3 autres ailleurs » sur une seule rangée ; Ctrl+Z défait le pied (seul) et Ctrl+Maj+Z le refait`,
    footerAll.flash === '1 remplacement, 3 autres ailleurs' && footerAll.fits.single && !footerAll.fits.clipped && footerAll.overflow.page && footerAll.overflow.bar && /bar/.test(footerAll.footer)
      && footerUndone.footer === footerBefore && footerUndone.mode === 'footer:default' && footerRedone === footerAll.footer, { footerAll, footerUndone, footerRedone, footerBefore });
  await snap(`${T}-11-tout-remplacer-pied`);

  // « Terminer » (vrai clic) : retour au corps ; l'en-tête, lui, attend toujours son « foo ».
  await realClick('#v2-hf-btn-done');
  const finished = { mode: await hfMode(), count: await countText(), pill: await boxOf('#v2-hf-pill'), zones: await zoneTexts() };
  check(`${T}, en-tête et pied : « Terminer » ramène au corps, le compteur compte encore le « foo » de l'en-tête et les deux du corps (« 3 résultats »)`,
    finished.mode === 'main' && /^\d+ (sur 3|résultats)$/.test(finished.count) && !finished.pill && /foo/.test(finished.zones.header) && /bar/.test(finished.zones.footer), finished);
  await closePanelIfOpen();
  await clearZones();
}
// « Remplacer » passe d'un texte à l'autre, puis Annuler : le corps a un « foo », le pied aussi, l'en-tête aucun. « Remplacer » remplace celui du corps et le pied s'ouvre ; Annuler doit alors rouvrir le corps et défaire son remplacement.
const CROSS_BODY = '<p>Le corps a un foo ici.</p>';
const CROSS_HEADER = '<p>Tête sans rien</p>';
const CROSS_FOOTER = '<p>Pied foo</p>';
const storyHtml = id => page.evaluate(id => { const s = HeaderFooterPreview.listStories().find(x => x.id === id); return s ? (s.live ? Editor.getHTML() : s.html) : null; }, id);
async function crossIntoFooter() {
  await resetPanel();
  await setDoc(CROSS_BODY);
  await page.evaluate(({ header, footer }) => Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: header, first: '' }, footer: { default: footer, first: '' } }), { header: CROSS_HEADER, footer: CROSS_FOOTER });
  await page.waitForTimeout(250);
  const bodyBefore = await html();
  const first = await pointOf('Le corps', 0.05);
  await page.mouse.click(first.x, first.y);
  await page.waitForTimeout(150);
  await caretAtStart();
  await realClick(LOUPE);
  await page.keyboard.type('foo');
  await page.waitForTimeout(250);
  await realClick('#pp-find-toggle-replace');
  await typeInto(REPL, 'bar');
  const start = { count: await countText(), mode: await hfMode() };
  await realClick('#pp-find-replace-one');
  const landed = { count: await countText(), mode: await hfMode(), body: await storyHtml('main'), pill: await boxOf('#v2-hf-pill'), focus: await focusId() };
  return { bodyBefore, start, landed };
}
async function runUndoReopen(T) {
  const gestures = [
    ['le clavier reste sur le bouton « Remplacer »', async () => { await pressKey('Control+z'); }, 'pp-find-replace-one'],
    ['clic dans le texte du pied', async () => { const p = await pointOf('Pied', 0.5); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); await pressKey('Control+z'); }, 'editor'],
    ['bouton Annuler de la barre', async () => { const b = await boxOf('#v2-btn-undo'); if (!seen(b)) return; await realClick('#v2-btn-undo'); }, 'editor'],
  ];
  for (const [label, gesture, focusAfter] of gestures) {
    const { bodyBefore, start, landed } = await crossIntoFooter();
    check(`${T}, Annuler après « Remplacer » (${label}) : le « foo » du corps est remplacé et le pied s'ouvre (« 1 sur 1 »), comme avant`,
      start.mode === 'main' && landed.mode === 'footer:default' && landed.count === '1 sur 1' && landed.body !== bodyBefore && /bar/.test(landed.body) && seen(landed.pill), { start, landed, bodyBefore });
    await gesture();
    await page.waitForTimeout(150);
    const undone = { mode: await hfMode(), body: await html(), footer: (await zoneTexts()).footer, pill: await boxOf('#v2-hf-pill'), count: await countText(), focus: await focusId(), overflow: await noHorizontalOverflow() };
    check(`${T}, Annuler après « Remplacer » (${label}) : le corps se rouvre, son remplacement est défait, le pied reste tel quel, la pastille de la zone a disparu`,
      undone.mode === 'main' && undone.body === bodyBefore && undone.footer === CROSS_FOOTER && !undone.pill && undone.count === '1 sur 2' && undone.focus === focusAfter && undone.overflow.page && undone.overflow.bar, { undone, bodyBefore, focusAfter });
    if (label === gestures[0][0]) {
      await snap(`${T}-12-annuler-rouvre-le-corps`);
      await pressKey('Control+Shift+z');
      const redone = { mode: await hfMode(), body: await html() };
      check(`${T}, Annuler après « Remplacer » (${label}) : Ctrl+Maj+Z refait le remplacement dans le corps`, redone.mode === 'main' && /bar/.test(redone.body) && redone.body !== bodyBefore, { redone });
    }
    await closePanelIfOpen();
    await clearZones();
  }

  // Une frappe dans le pied d'abord : Ctrl+Z défait la frappe seule, le corps reste remplacé et fermé.
  const { bodyBefore } = await crossIntoFooter();
  const p = await pointOf('Pied', 0.5);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
  await page.keyboard.press('End');
  await page.keyboard.type('zz');
  await page.waitForTimeout(150);
  const typed = (await html());
  await pressKey('Control+z');
  const afterTyping = { typed, mode: await hfMode(), footer: (await zoneTexts()).footer, body: await storyHtml('main') };
  check(`${T}, Annuler après « Remplacer » puis une frappe dans le pied : Ctrl+Z défait la frappe seule, le pied reste ouvert et le corps reste remplacé`,
    /zz/.test(afterTyping.typed) && afterTyping.mode === 'footer:default' && afterTyping.footer === CROSS_FOOTER && afterTyping.body !== bodyBefore && /bar/.test(afterTyping.body), afterTyping);
  await closePanelIfOpen();
  await clearZones();
}
async function zonesEnglish() {
  await resetPanel();
  await setZones();
  await caretAtStart();
  await realClick(LOUPE);
  await realClick('#pp-find-toggle-replace');
  await typeInto(FIND, 'foo');
  await typeInto(REPL, 'bar');
  const counter = await countText();
  await realClick('#pp-find-replace-all');
  const body = { flash: await countText(), fits: await findRowFits(), overflow: await noHorizontalOverflow() };
  await realClick('#pp-find-next');
  await realClick('#pp-find-replace-all');
  const footer = { flash: await countText(), mode: await hfMode(), fits: await findRowFits() };
  check('anglais, en-tête et pied : le compteur dit « 2 of 5 », « Replace all » dans le corps « 3 replacements, 2 others elsewhere » puis dans le pied « 1 replacement, 1 other elsewhere », chacun sur une seule rangée',
    counter === '2 of 5' && body.flash === '3 replacements, 2 others elsewhere' && body.fits.single && !body.fits.clipped && body.overflow.page && body.overflow.bar
      && footer.flash === '1 replacement, 1 other elsewhere' && footer.mode === 'footer:default' && footer.fits.single && !footer.fits.clipped, { counter, body, footer });
  await snap('anglais-11-en-tete-et-pied');
  await closePanelIfOpen();
  await clearZones();
}

// Beaucoup de résultats : 3 500 « foo » (2 000 en haut, un long passage sans rien, 1 500 en bas). Au-delà de 500 résultats, seuls l'écran et ses abords sont surlignés
// (js/find-replace.js) : la fenêtre de surlignage doit suivre la vraie molette et les sauts du clavier.
const bigLine = (i, per) => `<p>Ligne ${i}${per ? ' : ' + Array(per).fill('foo').join(' ') : ' sans rien à trouver'}.</p>`;
const BIG = Array.from({ length: 400 }, (_, i) => bigLine(i, 5)).join('') + Array.from({ length: 300 }, (_, i) => bigLine(400 + i, 0)).join('') + Array.from({ length: 300 }, (_, i) => bigLine(700 + i, 5)).join('');
// Les « foo » dont la ligne tient entièrement dans la zone de texte : ceux que le document y met (`expected`), ceux que le DOM surligne (`marked`), et tous les surlignés (`all`).
const onScreen = () => page.evaluate(() => {
  const box = document.getElementById('editor-container').getBoundingClientRect();
  const ed = EditorCore.getEditor();
  const inside = r => r.top >= box.top + 3 && r.bottom <= box.bottom - 3;
  const expected = FindReplace.findMatches(ed.state.doc, 'foo', {}).filter(m => inside(ed.view.coordsAtPos(m.from))).length;
  const marked = Array.from(document.querySelectorAll('.tiptap .pp-find-match')).filter(e => inside(e.getBoundingClientRect())).length;
  return { expected, marked, all: document.querySelectorAll('.tiptap .pp-find-match').length };
});
const scrollInfo = () => page.evaluate(() => { const s = document.getElementById('editor-container'); return { top: Math.round(s.scrollTop), max: Math.round(s.scrollHeight - s.clientHeight) }; });
async function runManyResults(T) {
  await resetPanel();
  await setDoc(BIG);
  const start = await pointOf('Ligne 0', 0.05);
  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(150);
  await realClick(LOUPE);
  await page.keyboard.type('foo');
  await page.waitForTimeout(400);
  const typed = Object.assign({ count: await countText(), focus: await focusId() }, await onScreen());
  check(`${T}, 3 500 résultats : « 1 sur 3500 », tous ceux de l'écran sont surlignés, mais pas les 3 500 (moins de 1 000)`, typed.count === '1 sur 3500' && typed.expected >= 5 && typed.marked >= typed.expected && typed.all < 1000 && typed.focus === 'pp-find-input', typed);
  await snap(`${T}-7-beaucoup-de-resultats`);

  // La vraie molette, par grands crans : jusqu'au bout du modèle (en traversant le long passage sans résultat), puis en remontant.
  await page.mouse.move(WIDTH / 2, HEIGHT - 60);
  const seen = [];
  let sawEmpty = false;
  let sawResultsAfterEmpty = false;
  let broken = null;
  let widest = 0;
  for (const [dy, times] of [[1500, 24], [-1500, 24]]) {
    for (let i = 0; i < times; i++) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(110);
      const s = Object.assign(await scrollInfo(), await onScreen());
      widest = Math.max(widest, s.all);
      if (s.expected === 0) sawEmpty = true; else if (sawEmpty) sawResultsAfterEmpty = true;
      if (!broken && (s.marked < s.expected || s.all >= 1000)) broken = s;
      if (i % 8 === 7) seen.push(s);
    }
  }
  const end = await scrollInfo();
  check(`${T}, molette : en descendant jusqu'en bas du modèle puis en remontant, ceux de l'écran restent tous surlignés (y compris après le long passage sans résultat), jamais 1 000 surlignés à la fois`,
    !broken && sawEmpty && sawResultsAfterEmpty && widest < 1000 && end.top < end.max, { broken, sawEmpty, sawResultsAfterEmpty, widest, end, seen });

  // Le clavier : « précédent » depuis le premier saute au dernier (tout en bas), « suivant » revient au premier (tout en haut) ; le courant est surligné et à l'écran.
  await page.evaluate(() => { document.getElementById('editor-container').scrollTop = 0; });
  await realClick(FIND);
  await pressKey('Control+a');
  await page.keyboard.type('foo');
  await page.waitForTimeout(300);
  await pressKey('Shift+Enter');
  const last = Object.assign({ count: await countText(), current: await currentText(), visible: await currentVisible() }, await onScreen());
  await pressKey('Enter');
  const first = Object.assign({ count: await countText(), current: await currentText(), visible: await currentVisible() }, await onScreen());
  check(`${T}, Maj+Entrée puis Entrée : « 3500 sur 3500 » tout en bas, puis « 1 sur 3500 » tout en haut ; le résultat courant est orange, dans la zone de texte, et ceux de l'écran restent surlignés`,
    last.count === '3500 sur 3500' && last.current === 'foo' && last.visible.inside && last.marked >= last.expected && last.expected >= 5 && last.all < 1000
    && first.count === '1 sur 3500' && first.current === 'foo' && first.visible.inside && first.marked >= first.expected && first.expected >= 5 && first.all < 1000, { last, first });

  // Une lettre de plus (plus aucun résultat), puis on l'efface : les 3 500 reviennent, l'écran est de nouveau surligné.
  await realClick(FIND);
  await page.keyboard.type('x');
  await page.waitForTimeout(250);
  const none = { count: await countText(), marks: await marksCount() };
  await pressKey('Backspace');
  await page.waitForTimeout(250);
  const back = Object.assign({ count: await countText() }, await onScreen());
  check(`${T}, une lettre de plus puis Retour arrière : « Aucun résultat » sans surlignage, puis les 3 500 résultats reviennent avec l'écran surligné`,
    none.count === 'Aucun résultat' && none.marks === 0 && /^\d+ sur 3500$/.test(back.count) && back.marked >= back.expected && back.expected >= 5 && back.all < 1000, { none, back });
  await pressKey('Escape');
  const closed = { open: await barOpen(), marks: await marksCount() };
  check(`${T}, Échap : le surlignage disparaît, la barre se ferme`, !closed.open && closed.marks === 0, closed);
  await resetPanel();
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
    regexTip: document.getElementById('pp-find-regex').title,
    one: document.getElementById('pp-find-replace-one').textContent,
    all: document.getElementById('pp-find-replace-all').textContent,
  }));
  const box = await boxOf(BAR), over = await noHorizontalOverflow();
  check('anglais, barre : libellés, infobulles et compteur en anglais, la barre tient dans 700 px', /^Find \/ Replace \(Ctrl\+F\)$/.test(tip) && en.placeholder === 'Find in the template' && en.replacement === 'Replace with' && en.count === '1 of 5'
    && en.next === 'Next result (Enter)' && en.caseTip === 'Match case' && en.regexTip === 'Regular expression' && en.one === 'Replace' && en.all === 'Replace all' && seen(box) && over.page && over.bar, { tip, en, over });
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
  await bubbleMessages('anglais', 'en');
  await zonesEnglish();
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(250);
}

await run('light');
await runRegex('light');
await runBubbles('light');
await runZones('light');
await runUndoReopen('light');
await runManyResults('light');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await run('dark');
await runRegex('dark');
await runBubbles('dark');
await runZones('dark');
await runUndoReopen('dark');
await runManyResults('dark');
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
