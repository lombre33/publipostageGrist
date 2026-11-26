#!/usr/bin/env node
// « En bas de la page » (js/bottom-anchor.js, ligne du menu Alignement, demande du 26/11) : le panneau de 700x400, à la VRAIE souris (page.mouse) et au VRAI clavier (frappe, Entrée, Maj+flèche,
// Ctrl+Z), en clair, en sombre et en anglais. Ce que scenarios-bottom-anchor.js ne peut pas voir depuis la page :
//  - au survol de l'icône Alignement, le volet s'ouvre dans le panneau et sa ligne « En bas de la page » est visible, au premier plan, lisible, avec son nom (français, anglais) ;
//  - un vrai clic sur la ligne pose le réglage sur le bloc du curseur, le curseur et le clavier restent dans le texte, la ligne s'affiche cochée (coche visible) ; un second clic le retire ;
//  - une sélection faite à la souris et au clavier (clic, Maj+flèche) sur plusieurs blocs : UN clic les règle tous, UN Ctrl+Z les défait tous ;
//  - dans un tableau, la ligne est libre (le tableau entier se cale) ; dans un bloc de texte conditionnel, elle est grisée (teinte atténuée, curseur interdit) avec sa raison pour info-bulle, et son clic ne change rien ;
//  - le bloc calé tombe au bas de la page à l'écran (le vrai calage, mesuré sur la feuille paginée) ;
//  - en Lecture, tout le groupe Alignement est grisé comme le reste de la barre et ne reçoit plus de clic.
// Lancé par run-headless.mjs (groupe Node "bottomAnchorMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-bottom-anchor-mouse.mjs
// BOTTOM_ANCHOR_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.BOTTOM_ANCHOR_MOUSE_PORT || 8942);
const SHOTS = process.env.BOTTOM_ANCHOR_SHOTS || '';
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

const OFFLINE = existsSync(join(CACHE, 'umd'));
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-bottom-anchor-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

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
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|bottomAnchor|bottom-anchor/i.test(m.text())) consoleProblems.push(m.text()); });
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

const ROW = '#v2-btn-bottom-anchor';
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
// Ce que le document porte : « Aa* | Bb » (« * » : calé en bas de la page), les blocs de premier niveau seulement.
const keepList = () => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.forEach((node) => { if (node.textContent) out.push(node.textContent.slice(0, 18) + (node.attrs.bottomAnchor ? '*' : '')); });
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
  await page.evaluate(d => {
    Editor.setHTML(d);
    // Le bloc calé est dessiné au bas de la page : le curseur y fait défiler le panneau, et le document suivant resterait hors de l'écran (la souris cliquerait à côté).
    for (let el = document.querySelector('.tiptap'); el; el = el.parentElement) if (el.scrollTop) el.scrollTop = 0;
    window.scrollTo(0, 0);
  }, doc);
  // La souris repart du bas du panneau : au point de départ de Playwright (0, 0), elle survole la barre d'outils et un volet resterait ouvert sur le document.
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(300);
}
async function clickText(text, at = 0.5) {
  // Juste après le retour de la Lecture à l'édition, le premier clic peut tomber avant que l'éditeur ne reprenne la main : on le refait tant que le curseur n'est pas dans le bloc visé.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const p = await pointOf(text, at);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(250);
    if ((await caret()).text.indexOf(text) !== -1) return;
    await page.waitForTimeout(700); // plus que l'intervalle du double-clic : le second clic ne doit pas sélectionner le mot
  }
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

const DOC = '<p>Bonjour</p><p>Fait à Paris</p><p>Signature</p><p>Mentions</p>';
const TABLE_DOC = '<p>Avant</p><table><tbody><tr><td><p>Case A</p></td><td><p>Case B</p></td></tr></tbody></table><p>Après</p>';
const COND_DOC = '<div class="conditional-text"><p>Texte conditionnel</p></div><p>Après</p>';

async function run(theme) {
  const T = theme;
  const en = (await page.evaluate(() => I18n.getLang())) === 'en';
  const label = en ? 'At the bottom of the page' : 'En bas de la page';
  const ariaLabel = en ? 'At the bottom of the page: the block sits at the foot of the page it falls on, however long the text above it' : 'En bas de la page : le bloc se pose au bas de la page où il tombe, quelle que soit la longueur du texte au-dessus';
  const reason = en ? 'Only for blocks of the text (not a conditional text block, a header or a footer, a free frame or a table of contents)' : 'Seulement pour les blocs du texte (ni un bloc de texte conditionnel, ni un en-tête ou un pied de page, ni un cadre libre ou un sommaire)';

  // 1) Le menu : un survol réel de l'icône ouvre le volet, la ligne y est, dans le panneau, au premier plan, avec son nom.
  await setDoc(DOC);
  // Après un passage en Lecture, le premier clic de la souris ne déplace plus le curseur tant que l'éditeur n'a pas reçu un geste de sa part : le curseur est posé au début, puis le clic fait le reste.
  await page.evaluate(() => EditorCore.getEditor().commands.focus('start'));
  await page.waitForTimeout(300);
  await clickText('Signature');
  const mainBox = await hit(MAIN);
  check(`${T}, menu : l'icône Alignement est visible dans le panneau ${WIDTH}x${HEIGHT} et sous la souris`, seen(mainBox), mainBox);
  await openMenu();
  const rowBox = await hit(ROW);
  const s1 = await rowState();
  check(`${T}, menu : au survol, la ligne « ${label} » est dans le panneau, au premier plan`, seen(rowBox), rowBox);
  check(`${T}, menu : la ligne s'appelle « ${label} » (nom accessible complet), elle est à cocher, libre (ni cochée ni grisée), dans l'ordre des tabulations`, s1.label === label && s1.aria === ariaLabel && s1.role === 'menuitemcheckbox' && s1.checked === 'false' && s1.disabled === 'false' && !s1.greyed && s1.tab === 0 && !s1.tick && s1.title === '', s1);
  await snap(`${T}-1-menu`);
  await closeMenu();
  check(`${T}, menu : la souris partie, le volet se referme`, await page.evaluate(() => getComputedStyle(document.querySelector('#v2-align-group .v2-hover-flyout')).display === 'none'));

  // 2) Un vrai clic sur la ligne : le réglage est posé sur le bloc du curseur, le curseur et le clavier restent dans le texte.
  const before = await html();
  await pressRow();
  const list2 = await keepList(), caret2 = await caret();
  check(`${T}, clic : « Signature » porte le réglage, et lui seul`, list2 === 'Bonjour | Fait à Paris | Signature* | Mentions', list2);
  check(`${T}, clic : le curseur reste dans « Signature » et le clavier dans l'éditeur`, caret2.text === 'Signature' && caret2.empty && caret2.focus, caret2);
  check(`${T}, clic : le HTML écrit porte data-bottom-anchor="true" sur ce bloc seulement`, (await html()) === before.replace('<p>Signature</p>', '<p data-bottom-anchor="true">Signature</p>'), await html());
  await openMenu();
  const s2 = await rowState();
  check(`${T}, clic : la ligne est cochée, la coche est dessinée, et elle reste libre`, s2.checked === 'true' && s2.tick && s2.disabled === 'false' && !s2.greyed, s2);
  await snap(`${T}-2-coche`);

  // 3) Un second clic retire le réglage.
  const r3 = await centerOf(ROW);
  await page.mouse.move(r3.l + 10, r3.y, { steps: 3 });
  await page.mouse.click(r3.l + 10, r3.y);
  await page.waitForTimeout(300);
  const list3 = await keepList(), caret3 = await caret();
  check(`${T}, second clic : le réglage est retiré, le document redevient celui d'avant`, list3 === 'Bonjour | Fait à Paris | Signature | Mentions' && (await html()) === before, list3);
  check(`${T}, second clic : le curseur n'a pas bougé`, caret3.text === 'Signature' && caret3.focus, caret3);
  await closeMenu();

  // 4) Plusieurs blocs : un clic, Maj+flèche au vrai clavier ; UN clic les règle tous, UN Ctrl+Z les défait tous.
  await setDoc(DOC);
  await clickText('Fait à Paris', 0.9);
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(250);
  await pressRow();
  const list4 = await keepList();
  check(`${T}, sélection : « Fait à Paris » et « Signature » sont réglés d'un seul clic, les autres non`, list4 === 'Bonjour | Fait à Paris* | Signature* | Mentions', list4);
  await closeMenu();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const undone = await keepList();
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(250);
  const redone = await keepList();
  check(`${T}, sélection : un seul Ctrl+Z les défait tous, Ctrl+Maj+Z les remet`, undone === 'Bonjour | Fait à Paris | Signature | Mentions' && redone === list4, { undone, redone });

  // 5) Entrée au vrai clavier, à la fin d'un bloc réglé : le suivant est ordinaire.
  await setDoc(DOC);
  await clickText('Signature', 0.9);
  await pressRow();
  await closeMenu();
  await clickText('Signature', 0.9);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Suite', { delay: 5 });
  await page.waitForTimeout(200);
  const list5 = await keepList();
  check(`${T}, Entrée : à la fin de « Signature » réglé, « Suite » n'est pas réglé`, list5 === 'Bonjour | Fait à Paris | Signature* | Suite | Mentions', list5);

  // 6) Dans un tableau, la ligne est libre et cale le tableau entier ; dans un bloc de texte conditionnel, elle est grisée avec sa raison, et un clic ne change rien.
  await setDoc(DOC);
  await clickText('Signature');
  await openMenu();
  const freeColor = (await rowState()).color;
  await closeMenu();
  await setDoc(TABLE_DOC);
  await clickText('Case B');
  await openMenu();
  const box6 = await hit(ROW), s6 = await rowState();
  check(`${T}, tableau : la ligne est dans le volet, visible, au premier plan, et libre`, seen(box6) && s6.disabled === 'false' && !s6.greyed && s6.tab === 0, { box6, s6 });
  await pressRow();
  const tableList = await page.evaluate(() => { const out = []; EditorCore.getEditor().state.doc.forEach(n => out.push(n.type.name + (n.attrs.bottomAnchor ? '*' : ''))); return out.join('|'); });
  check(`${T}, tableau : un clic règle le tableau entier (et lui seul)`, tableList === 'paragraph|table*|paragraph', tableList);
  await closeMenu();
  await setDoc(COND_DOC);
  await clickText('Texte conditionnel');
  await openMenu();
  const box6b = await hit(ROW), s6b = await rowState();
  check(`${T}, bloc conditionnel : la ligne est toujours dans le volet, visible, au premier plan`, seen(box6b), box6b);
  check(`${T}, bloc conditionnel : elle est grisée (aria-disabled, teinte atténuée, curseur interdit, hors des tabulations) et dit pourquoi : « ${reason.slice(0, 40)}… »`, s6b.disabled === 'true' && s6b.greyed && s6b.tab === -1 && s6b.title === reason && s6b.cursor === 'not-allowed' && s6b.checked === 'false', s6b);
  check(`${T}, bloc conditionnel : la teinte du texte grisé n'est pas celle du texte libre`, s6b.color !== freeColor, { greyed: s6b.color, free: freeColor });
  const beforeCond = await html();
  await pressRow();
  check(`${T}, bloc conditionnel : un clic sur la ligne grisée ne change rien`, (await html()) === beforeCond && !/data-bottom-anchor/.test(await html()), await html());
  await snap(`${T}-6-grise`);
  await closeMenu();

  // 7) Le vrai calage, à l'écran : le bloc calé tombe au bas de la page (la feuille paginée), quelle que soit la longueur du texte au-dessus.
  const foot = n => page.evaluate(async (count) => {
    const lines = Array.from({ length: count }, (_, i) => `<p>Ligne ${i}</p>`).join('');
    Editor.setHTML(lines + '<p data-bottom-anchor="true">Signature</p>');
    await new Promise(r => setTimeout(r, 500));
    Editor.refreshPaginationPreview();
    await new Promise(r => setTimeout(r, 500));
    const sig = Array.from(document.querySelectorAll('.tiptap > p')).find(p => p.textContent === 'Signature');
    const bodyTops = HeaderFooterPreview.pageBodyTops();
    const z = (document.querySelector('.tiptap').getBoundingClientRect().width / document.querySelector('.tiptap').offsetWidth) || 1;
    const top = document.querySelector('.tiptap').getBoundingClientRect().top;
    const r = sig.getBoundingClientRect();
    return { bottom: Math.round((r.bottom - top) / z), body: Math.round(bodyTops[0]), shift: getComputedStyle(sig).transform };
  }, n);
  const f2 = await foot(2), f12 = await foot(12);
  check(`${T}, à l'écran : la signature calée est à la même hauteur que le texte au-dessus fasse deux ou douze lignes, bien plus bas que sa place naturelle`, f2.bottom === f12.bottom && f2.bottom > 700 && f2.shift !== 'none', { f2, f12 });
  await snap(`${T}-7-calage`);

  // 8) La Lecture : tout le groupe Alignement est grisé comme le reste de la barre, rien ne le reçoit plus.
  await setDoc(DOC);
  await clickText('Signature');
  const readBtn = await centerOf('#btn-mode-read');
  await page.mouse.move(readBtn.x, readBtn.y, { steps: 4 });
  await page.mouse.click(readBtn.x, readBtn.y);
  await page.waitForTimeout(500);
  const lock = await page.evaluate(() => {
    const group = document.getElementById('v2-align-group');
    const cs = getComputedStyle(group);
    // Le groupe grisé reçoit la souris pour dire pourquoi (js/lock-reasons.js) ; son bouton et son menu n'y répondent plus.
    const button = group.querySelector(':scope > button');
    const flyout = group.querySelector('.v2-hover-flyout');
    return { locked: group.classList.contains('pp-access-locked'), aria: group.getAttribute('aria-disabled'), pointerEvents: cs.pointerEvents, buttonPointerEvents: button ? getComputedStyle(button).pointerEvents : null, flyout: flyout ? getComputedStyle(flyout).display : null, reason: group.getAttribute('title') || '', opacity: Number(cs.opacity), reader: getComputedStyle(document.getElementById('reader-container')).display };
  });
  check(`${T}, Lecture : le groupe Alignement est grisé (pp-access-locked, atténué), dit pourquoi, et ni son bouton ni son menu n'acceptent la souris`, lock.locked && lock.aria === 'true' && lock.buttonPointerEvents === 'none' && lock.flyout === 'none' && lock.reason !== '' && lock.opacity < 0.5 && lock.reader !== 'none', lock);
  const beforeRead = await html();
  await page.evaluate(sel => document.querySelector(sel).click(), ROW);
  await page.waitForTimeout(200);
  check(`${T}, Lecture : même un clic qui n'est pas de la souris sur la ligne ne change rien`, (await html()) === beforeRead, await html());
  await snap(`${T}-8-lecture`);
  const editBtn = await centerOf('#btn-mode-edit');
  await page.mouse.move(editBtn.x, editBtn.y, { steps: 4 });
  await page.mouse.click(editBtn.x, editBtn.y);
  // Le retour à l'édition rend la main à l'éditeur un peu plus tard (curseur en fin de texte) : on attend, sinon ce curseur tardif prend la place de celui du scénario suivant.
  await page.waitForTimeout(600);
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
// Le changement de thème rend la main à l'éditeur un peu plus tard (curseur en fin de texte) : on attend qu'il l'ait fait avant de poser le curseur du premier scénario.
await page.waitForTimeout(400);
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
