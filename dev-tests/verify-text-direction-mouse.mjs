#!/usr/bin/env node
// « Texte de droite à gauche » (js/text-direction.js, ligne du menu Alignement) : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au VRAI clavier (Maj+flèche, Ctrl+Z), en clair,
// en sombre et en anglais. Ce que scenarios-text-direction.js ne peut pas voir depuis la page :
//  - au survol de l'icône Alignement, le volet s'ouvre dans le panneau et sa ligne « Texte de droite à gauche » est visible, au premier plan, lisible, avec son nom (français, anglais) ;
//  - un vrai clic sur la ligne pose le sens sur le paragraphe du curseur (le texte se range réellement à droite), le curseur reste dans le texte, la ligne s'affiche cochée ; un second clic le retire ;
//  - une sélection faite à la souris et au clavier sur plusieurs paragraphes : UN clic les règle tous, UN Ctrl+Z les défait tous ;
//  - dans une liste, le clic règle la liste entière (puces à droite) ; dans une case de tableau, le paragraphe de la case ;
//  - en Lecture, tout le groupe Alignement est grisé et ne reçoit plus de clic.
// Lancé par run-headless.mjs (groupe Node "textDirectionMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-text-direction-mouse.mjs
// TEXT_DIRECTION_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TEXT_DIRECTION_MOUSE_PORT || 8947);
const SHOTS = process.env.TEXT_DIRECTION_SHOTS || '';
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
if (!OFFLINE) console.log('[verify-text-direction-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const consoleProblems = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
// Un avertissement de ProseMirror ou de TipTap (sélection invalide, contenu refusé) trahit un geste qui n'a pas la forme attendue : aucun ne doit sortir pendant le parcours.
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|textDirection|data-dir/i.test(m.text())) consoleProblems.push(m.text()); });
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

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const centerOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
}, selector);
const html = () => page.evaluate(() => Editor.getHTML());

const ROW = '#v2-btn-rtl';
const MAIN = '#v2-btn-align-main';
// Un élément tel que la souris le voit : trouvé, dans le panneau, au premier plan (rien ne le recouvre).
const hit = selector => page.evaluate(({ sel, width, height }) => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { found: true, x, y, w: r.width, h: r.height, box: [r.left, r.top, r.right, r.bottom].map(Math.round), inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= width + 0.5 && r.bottom <= height + 0.5, onTop: !!top && (top === el || el.contains(top)) };
}, { sel: selector, width: WIDTH, height: HEIGHT });
const seen = b => b.found && b.inPanel && b.onTop && b.w > 8 && b.h > 8;
// L'état de la ligne tel qu'on le lit : cochée, grisée, tabulation, info-bulle, coche dessinée, teinte du texte.
const rowState = () => page.evaluate(sel => {
  const row = document.querySelector(sel);
  const cs = getComputedStyle(row), after = getComputedStyle(row, '::after');
  return { label: row.textContent.trim(), aria: row.getAttribute('aria-label'), checked: row.getAttribute('aria-checked'), disabled: row.getAttribute('aria-disabled'), greyed: row.classList.contains('v2-hover-row-disabled'), tab: row.tabIndex, title: row.title,
    tick: after.visibility === 'visible' && after.content !== 'none', color: cs.color, cursor: cs.cursor, role: row.getAttribute('role') };
}, ROW);
// Ce que le document porte : « Aa< | Bb » (« < » : de droite à gauche).
const dirList = () => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'paragraph') out.push(node.textContent + (node.attrs.dir === 'rtl' ? '<' : '')); });
  return out.join(' | ');
});
const caret = () => page.evaluate(() => {
  const sel = EditorCore.getEditor().state.selection;
  return { text: sel.$from.parent.textContent, empty: sel.empty, focus: !!document.activeElement && !!document.activeElement.closest('.tiptap') };
});
const pointOf = (text, at = 0.5) => page.evaluate(({ text, at }) => {
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
  // La souris repart du bas du panneau : au point de départ de Playwright (0, 0), elle survole la barre d'outils et un volet resterait ouvert sur le document.
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(300);
}
async function clickText(text, at = 0.5) {
  const p = await pointOf(text, at);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
}
// Survol réel de l'icône Alignement : la souris arrive depuis le bas du document (jamais par-dessus un autre volet de la barre).
async function openMenu() {
  const c = await centerOf(MAIN);
  await page.mouse.move(c.x, c.y + 150);
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(350);
  return c;
}
async function closeMenu() {
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(250);
}
// La ligne, à la vraie souris : le volet s'ouvre au survol de l'icône, la main descend sur l'intitulé de la ligne (verticalement, sans quitter le volet) et clique.
async function pressRow({ click = true } = {}) {
  const c = await openMenu();
  const r = await centerOf(ROW);
  const x = Math.min(Math.max(c.x, r.l + 8), r.r - 8);
  await page.mouse.move(x, r.y, { steps: 8 });
  await page.waitForTimeout(100);
  if (click) { await page.mouse.click(x, r.y); await page.waitForTimeout(300); }
  return { x, y: r.y };
}

const DOC = '<p>Bonjour</p><p>Total HT</p><p>Total TTC</p><p>Arrêté à la somme de</p>';
const LIST_DOC = '<p>Avant</p><ul><li><p>Pomme</p></li><li><p>Poire</p></li></ul><p>Après</p>';
const TABLE_DOC = '<p>Avant</p><table><tbody><tr><td><p>Case A</p></td><td><p>Case B</p></td></tr></tbody></table><p>Après</p>';
// Où le texte se range dans son bloc : l'écart à gauche et à droite entre le texte et les bords du paragraphe.
const rightGap = text => page.evaluate(t => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n.textContent.indexOf(t) < 0) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const b = r.getBoundingClientRect(), box = n.parentElement.closest('p, li').getBoundingClientRect();
    return { left: Math.round(b.left - box.left), right: Math.round(box.right - b.right) };
  }
  return null;
}, text);

async function run(theme) {
  const T = theme;
  const en = (await page.evaluate(() => I18n.getLang())) === 'en';
  const label = en ? 'Right-to-left text' : 'Texte de droite à gauche';

  // 1) Le menu : un survol réel de l'icône ouvre le volet, la ligne y est, dans le panneau, au premier plan, avec son nom.
  await setDoc(DOC);
  await clickText('Total HT');
  const mainBox = await hit(MAIN);
  check(`${T}, menu : l'icône Alignement est visible dans le panneau ${WIDTH}x${HEIGHT} et sous la souris`, seen(mainBox), mainBox);
  await openMenu();
  const rowBox = await hit(ROW);
  const s1 = await rowState();
  check(`${T}, menu : au survol, la ligne « ${label} » est dans le panneau, au premier plan`, seen(rowBox), rowBox);
  check(`${T}, menu : la ligne s'appelle « ${label} », elle est à cocher, libre (ni cochée ni grisée), dans l'ordre des tabulations`,
    s1.label === label && !!s1.aria && s1.aria.indexOf(label) === 0 && s1.role === 'menuitemcheckbox' && s1.checked === 'false' && s1.disabled === 'false' && !s1.greyed && s1.tab === 0, s1);
  await snap(`${T}-1-menu`);
  await closeMenu();

  // 2) Un vrai clic sur la ligne : le sens est posé sur le paragraphe du curseur, le texte va réellement à droite, le curseur reste dans le texte.
  const before = await html();
  const gapBefore = await rightGap('Total HT');
  await pressRow();
  const list2 = await dirList(), caret2 = await caret(), gap2 = await rightGap('Total HT');
  check(`${T}, clic : « Total HT » va de droite à gauche, et lui seul`, list2 === 'Bonjour | Total HT< | Total TTC | Arrêté à la somme de', list2);
  check(`${T}, clic : le curseur reste dans « Total HT » et le clavier dans l'éditeur`, caret2.text === 'Total HT' && caret2.empty && caret2.focus, caret2);
  check(`${T}, clic : le HTML écrit porte dir="rtl" data-dir="rtl" sur ce paragraphe seulement`, (await html()) === before.replace('<p>Total HT</p>', '<p dir="rtl" data-dir="rtl">Total HT</p>'), await html());
  check(`${T}, clic : le texte est vu rangé à droite`, gapBefore.left < 4 && gap2.right < 4 && gap2.left > 40, { gapBefore, gap2 });
  await openMenu();
  const s2 = await rowState();
  check(`${T}, clic : la ligne est cochée, la coche est dessinée, et elle reste libre`, s2.checked === 'true' && s2.tick && s2.disabled === 'false' && !s2.greyed, s2);
  await snap(`${T}-2-coche`);

  // 3) Un second clic retire le réglage.
  const r3 = await centerOf(ROW);
  await page.mouse.move(r3.l + 10, r3.y, { steps: 3 });
  await page.mouse.click(r3.l + 10, r3.y);
  await page.waitForTimeout(300);
  const list3 = await dirList(), caret3 = await caret();
  check(`${T}, second clic : le sens est retiré, le document redevient celui d'avant`, list3 === 'Bonjour | Total HT | Total TTC | Arrêté à la somme de' && (await html()) === before, list3);
  check(`${T}, second clic : le curseur n'a pas bougé`, caret3.text === 'Total HT' && caret3.focus, caret3);
  await closeMenu();

  // 4) Plusieurs paragraphes : un clic, Maj+flèche au vrai clavier ; UN clic les règle tous, UN Ctrl+Z les défait tous.
  await setDoc(DOC);
  await clickText('Total HT', 0.9);
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(250);
  await pressRow();
  const list4 = await dirList();
  check(`${T}, sélection : « Total HT » et « Total TTC » sont réglés d'un seul clic, les autres non`, list4 === 'Bonjour | Total HT< | Total TTC< | Arrêté à la somme de', list4);
  await closeMenu();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const undone = await dirList();
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(250);
  const redone = await dirList();
  check(`${T}, sélection : un seul Ctrl+Z les défait tous, Ctrl+Maj+Z les remet`, undone === 'Bonjour | Total HT | Total TTC | Arrêté à la somme de' && redone === list4, { undone, redone });

  // 5) Entrée au vrai clavier, à la fin d'un paragraphe réglé : le suivant va dans le même sens.
  await setDoc(DOC);
  await clickText('Total TTC', 0.9);
  await pressRow();
  await closeMenu();
  await clickText('Total TTC', 0.9);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Suite', { delay: 5 });
  await page.waitForTimeout(200);
  const list5 = await dirList();
  check(`${T}, Entrée : à la fin de « Total TTC » réglé, « Suite » va dans le même sens`, list5 === 'Bonjour | Total HT | Total TTC< | Suite< | Arrêté à la somme de', list5);

  // 6) Une liste : le clic règle la liste entière, son retrait passe à droite, un Ctrl+Z défait tout.
  await setDoc(LIST_DOC);
  await clickText('Pomme');
  await pressRow();
  await closeMenu();
  const ul = await page.evaluate(() => {
    const el = document.querySelector('.tiptap ul'), cs = getComputedStyle(el);
    return { dir: el.getAttribute('dir'), direction: cs.direction, padLeft: parseFloat(cs.paddingLeft), padRight: parseFloat(cs.paddingRight) };
  });
  check(`${T}, liste : le clic règle la liste (dir="rtl"), son retrait passe à droite`, ul.dir === 'rtl' && ul.direction === 'rtl' && ul.padLeft === 0 && ul.padRight > 10, ul);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(`${T}, liste : un seul Ctrl+Z défait la liste et ses paragraphes`, !/data-dir/.test(await html()), await html());

  // 7) Dans une case de tableau : la ligne est libre et règle le paragraphe de la case.
  await setDoc(TABLE_DOC);
  await clickText('Case B');
  await pressRow();
  await closeMenu();
  const list7 = await dirList();
  check(`${T}, tableau : le clic règle le paragraphe de la case, et lui seul`, list7 === 'Avant | Case A | Case B< | Après', list7);

  // 8) La Lecture : tout le groupe Alignement est grisé comme le reste de la barre, rien ne le reçoit plus.
  await setDoc(DOC);
  await clickText('Total HT');
  const readBtn = await centerOf('#btn-mode-read');
  await page.mouse.move(readBtn.x, readBtn.y, { steps: 4 });
  await page.mouse.click(readBtn.x, readBtn.y);
  await page.waitForTimeout(500);
  const lock = await page.evaluate(() => {
    const group = document.getElementById('v2-align-group');
    const cs = getComputedStyle(group);
    return { locked: group.classList.contains('pp-access-locked'), aria: group.getAttribute('aria-disabled'), pointerEvents: cs.pointerEvents, opacity: Number(cs.opacity), reader: getComputedStyle(document.getElementById('reader-container')).display };
  });
  check(`${T}, Lecture : le groupe Alignement est grisé (pp-access-locked, atténué) et n'accepte plus la souris`, lock.locked && lock.aria === 'true' && lock.pointerEvents === 'none' && lock.opacity < 0.5 && lock.reader !== 'none', lock);
  const beforeRead = await html();
  await page.evaluate(sel => document.querySelector(sel).click(), ROW);
  await page.waitForTimeout(200);
  check(`${T}, Lecture : même un clic qui n'est pas de la souris sur la ligne ne change rien`, (await html()) === beforeRead, await html());
  const editBtn = await centerOf('#btn-mode-edit');
  await page.mouse.move(editBtn.x, editBtn.y, { steps: 4 });
  await page.mouse.click(editBtn.x, editBtn.y);
  await page.waitForTimeout(500);
  check(`${T}, retour à l'édition : le groupe Alignement est de nouveau libre`, await page.evaluate(() => !document.getElementById('v2-align-group').classList.contains('pp-access-locked')));
}

// La page ne change plus de langue en route : Réglages garde le choix et la recharge. Le script fait pareil - il garde la langue, recharge, attend le widget.
async function restartIn(lang) {
  await page.evaluate(next => I18n.storeLang(next), lang);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
}

await run('light');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await run('dark');
await restartIn('en');
await page.waitForTimeout(300);
await run('anglais');

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucun avertissement de ProseMirror (sélection invalide, contenu refusé) pendant le parcours', consoleProblems.length === 0, consoleProblems);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
