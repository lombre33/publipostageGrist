#!/usr/bin/env node
// « Puce… » (js/bullet-format.js, ligne du menu Liste : le signe de la puce ; chantier 9d de « Import PowerPoint sans perte ») : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au vrai clavier,
// en clair, en sombre et en anglais. Ce que scenarios-bullet-format.js ne peut pas voir depuis la page :
//  - au survol de l'icône Liste, le volet s'ouvre dans le panneau et sa ligne « Puce… » est visible, au premier plan, lisible, avec son nom (français, anglais) ; hors d'une liste à puces elle est grisée, dit pourquoi et un clic n'ouvre rien ;
//  - dans une liste à puces, un vrai clic sur la ligne ouvre la fenêtre : titre, champ, signes courants, indication et boutons tiennent dans le panneau, le champ a le clavier ;
//  - un signe tapé (➢) puis Entrée devient la puce de la liste (le `::marker` le montre), seulement celle de cette liste ; UN Ctrl+Z le retire, Ctrl+Maj+Z le remet ;
//  - un signe courant choisi à la souris puis « Valider » ; « Par défaut » rend le rond ; un bouton de style (carré) retire le signe choisi ;
//  - une saisie de plusieurs caractères garde la fenêtre ouverte, dit pourquoi, grise « Valider », Entrée ne fait rien ; Échap ferme sans toucher au document.
// Lancé par run-headless.mjs (groupe Node "bulletFormatMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-bullet-format-mouse.mjs
// BULLET_FORMAT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.BULLET_FORMAT_MOUSE_PORT || 8963);
const SHOTS = process.env.BULLET_FORMAT_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-keep-next-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-bullet-format-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|bulletFormat|bullet-format/i.test(m.text())) consoleProblems.push(m.text()); });
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


const ROW = '#v2-btn-bullet-char';
const MAIN = '#v2-btn-bullet';
const hit = selector => page.evaluate(({ sel, width, height }) => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { found: true, x, y, w: r.width, h: r.height, box: [r.left, r.top, r.right, r.bottom].map(Math.round), inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= width + 0.5 && r.bottom <= height + 0.5, onTop: !!top && (top === el || el.contains(top)) };
}, { sel: selector, width: WIDTH, height: HEIGHT });
const seen = b => b.found && b.inPanel && b.onTop && b.w > 8 && b.h > 8;
const rowState = () => page.evaluate(sel => {
  const row = document.querySelector(sel);
  return { label: row.textContent.trim(), aria: row.getAttribute('aria-label'), disabled: row.getAttribute('aria-disabled') === 'true', title: row.title || '' };
}, ROW);
const windowState = () => page.evaluate(({ width, height }) => {
  const overlay = document.getElementById('pp-bulletfmt-modal');
  if (!overlay) return { shown: false };
  const shown = overlay.style.display !== 'none';
  const seenIn = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.left < -0.5 || r.top < -0.5 || r.right > width + 0.5 || r.bottom > height + 0.5) return false;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  };
  const input = document.getElementById('pp-bulletfmt-char');
  const box = overlay.querySelector('.pp-modal-box');
  const buttons = Array.from(overlay.querySelectorAll('.pp-modal-actions button'));
  const presets = Array.from(overlay.querySelectorAll('.pp-bulletfmt-preset'));
  const error = document.getElementById('pp-bulletfmt-error');
  const hint = document.getElementById('pp-bulletfmt-hint');
  const ok = overlay.querySelector('.var-modal-primary');
  const body = overlay.querySelector('.pp-modal-body');
  const active = document.activeElement;
  return {
    shown,
    boxIn: shown && seenIn(box),
    titleIn: shown && seenIn(overlay.querySelector('h3')),
    title: overlay.querySelector('h3').textContent.trim(),
    buttonsIn: shown && buttons.length === 3 && buttons.every(seenIn),
    buttons: buttons.map(b => b.textContent.trim()),
    inputIn: shown && seenIn(input),
    presetsIn: shown && presets.length === 12 && presets.every(seenIn),
    presetsPressed: presets.filter(p => p.getAttribute('aria-pressed') === 'true').map(p => p.textContent),
    labels: Array.from(overlay.querySelectorAll('.pp-parafmt-label')).map(l => l.textContent.trim()),
    value: input.value,
    invalid: input.getAttribute('aria-invalid') === 'true',
    focus: active && active.id,
    selected: active === input ? input.selectionStart === 0 && input.selectionEnd === input.value.length && input.value.length > 0 : false,
    error: error.hidden ? '' : error.textContent.trim(),
    hint: hint.textContent.trim(),
    hintIn: shown && seenIn(hint),
    okDisabled: ok.disabled,
    scrolls: body.scrollHeight > body.clientHeight + 1,
  };
}, { width: WIDTH, height: HEIGHT });
// Le signe que l'éditeur dessine pour l'item qui porte `text` (le `content` de son ::marker), sans les guillemets.
const markerOf = text => page.evaluate((needle) => {
  const li = Array.from(document.querySelectorAll('.tiptap li')).find(item => item.textContent.indexOf(needle) !== -1);
  return li ? getComputedStyle(li, '::marker').content.replace(/^"|"$/g, '') : null;
}, text);
// La couleur et la taille que l'éditeur dessine pour la puce de l'item qui porte `text`.
const lookOf = text => page.evaluate((needle) => {
  const li = Array.from(document.querySelectorAll('.tiptap li')).find(item => item.textContent.indexOf(needle) !== -1);
  if (!li) return null;
  const style = getComputedStyle(li, '::marker');
  return { color: style.color, size: Math.round(parseFloat(style.fontSize) * 75) / 100 };
}, text);
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
  await page.mouse.move(WIDTH / 2, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(300);
}
async function clickText(text, at = 0.5) {
  const p = await pointOf(text, at);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
}
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
async function pressRow({ click = true } = {}) {
  const c = await openMenu();
  const r = await centerOf(ROW);
  const x = Math.min(Math.max(c.x, r.l + 8), r.r - 8);
  await page.mouse.move(x, r.y, { steps: 8 });
  await page.waitForTimeout(100);
  if (click) { await page.mouse.click(x, r.y); await page.waitForTimeout(350); }
  return { x, y: r.y };
}
async function clickButton(label) {
  const point = await page.evaluate((text) => {
    const button = Array.from(document.querySelectorAll('#pp-bulletfmt-modal .pp-modal-actions button')).find(b => b.textContent.trim() === text);
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, label);
  if (!point) return false;
  await page.mouse.move(point.x, point.y, { steps: 3 });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(350);
  return true;
}
async function clickField(id) {
  const point = await page.evaluate((fieldId) => {
    const r = document.getElementById(fieldId).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
  await page.mouse.move(point.x, point.y, { steps: 3 });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(150);
}
async function clickSwatch(color) {
  const point = await page.evaluate((c) => {
    const button = Array.from(document.querySelectorAll('#pp-bulletfmt-modal .pp-bulletfmt-swatch')).find(b => b.dataset.color === c);
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, color);
  if (!point) return false;
  await page.mouse.move(point.x, point.y, { steps: 3 });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(200);
  return true;
}
const fieldsOf = () => page.evaluate(() => ({
  color: document.getElementById('pp-bulletfmt-color').value,
  size: document.getElementById('pp-bulletfmt-size').value,
  swatches: Array.from(document.querySelectorAll('#pp-bulletfmt-modal .pp-bulletfmt-swatch[aria-pressed="true"]')).map(b => b.dataset.color),
  invalid: ['pp-bulletfmt-color', 'pp-bulletfmt-size'].filter(id => document.getElementById(id).getAttribute('aria-invalid') === 'true'),
  error: document.getElementById('pp-bulletfmt-error').hidden ? '' : document.getElementById('pp-bulletfmt-error').textContent.trim(),
  ok: !document.querySelector('#pp-bulletfmt-modal .var-modal-primary').disabled,
  scrolls: (() => { const body = document.querySelector('#pp-bulletfmt-modal .pp-modal-body'); return body.scrollHeight > body.clientHeight + 1; })(),
}));
async function clickPreset(char) {
  const point = await page.evaluate((c) => {
    const button = Array.from(document.querySelectorAll('#pp-bulletfmt-modal .pp-bulletfmt-preset')).find(b => b.textContent === c);
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, char);
  if (!point) return false;
  await page.mouse.move(point.x, point.y, { steps: 3 });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(200);
  return true;
}

const DOC = '<ul><li><p>Alpha liste</p></li></ul><ul><li><p>Beta liste</p></li></ul><p>Libre texte</p>';

async function run(theme) {
  const T = theme;
  const en = (await page.evaluate(() => I18n.getLang())) === 'en';
  const texts = en
    ? { row: 'Bullet…', aria: 'Bullet: choose the bullet character of the list', title: 'Bullet', labels: ['Character', 'Common characters', 'Color', 'Size (pt)'], buttons: ['Default', 'Cancel', 'Confirm'], notHere: 'Only in a bulleted list' }
    : { row: 'Puce…', aria: 'Puce : choisir le signe de la puce de la liste', title: 'Puce', labels: ['Signe', 'Signes courants', 'Couleur', 'Taille (pt)'], buttons: ['Par défaut', 'Annuler', 'Valider'], notHere: 'Seulement dans une liste à puces' };

  // 1) Hors d'une liste à puces : la ligne est là, grisée, avec sa raison ; un clic n'ouvre rien.
  await setDoc(DOC);
  await clickText('Libre');
  await pressRow({ click: false });
  const free = await hit(ROW);
  const freeState = await rowState();
  check(`${T}, hors d'une liste : la ligne « ${texts.row} » est visible, au premier plan, dans le panneau`, seen(free), free);
  check(`${T}, hors d'une liste : elle est grisée, dit « ${texts.notHere} » en info-bulle, son nom est « ${texts.row} »`, freeState.disabled && freeState.title === texts.notHere && freeState.label === texts.row && freeState.aria === texts.aria, freeState);
  await snap(`bullet-${T}-row-disabled`);
  await page.mouse.click(free.x, free.y);
  await page.waitForTimeout(300);
  check(`${T}, hors d'une liste : un clic sur la ligne grisée n'ouvre pas la fenêtre`, !(await windowState()).shown);
  await closeMenu();

  // 2) Dans une liste à puces : un vrai clic ouvre la fenêtre.
  await clickText('Alpha');
  await pressRow({ click: false });
  const inList = await rowState();
  check(`${T}, dans une liste à puces : la ligne est active, sans info-bulle`, !inList.disabled && inList.title === '', inList);
  await page.mouse.click((await hit(ROW)).x, (await hit(ROW)).y);
  await page.waitForTimeout(350);
  const w1 = await windowState();
  check(`${T}, la fenêtre s'ouvre : titre « ${texts.title} », libellés, trois boutons, tout dans le panneau, sans défilement`, w1.shown && w1.boxIn && w1.titleIn && w1.title === texts.title && JSON.stringify(w1.labels) === JSON.stringify(texts.labels) && w1.buttonsIn && JSON.stringify(w1.buttons) === JSON.stringify(texts.buttons) && !w1.scrolls, w1);
  check(`${T}, les douze signes courants et l'indication sont visibles dans le panneau ; le champ a le clavier`, w1.presetsIn && w1.inputIn && w1.hintIn && w1.focus === 'pp-bulletfmt-char' && w1.value === '', w1);
  await snap(`bullet-${T}-window`);

  // 3) Un signe tapé puis Entrée : la puce de cette liste seulement.
  await page.keyboard.type('➢', { delay: 20 });
  const w2 = await windowState();
  check(`${T}, le signe tapé est dans le champ et « ${texts.buttons[2]} » reste actif`, w2.value === '➢' && !w2.okDisabled && w2.error === '' && JSON.stringify(w2.presetsPressed) === JSON.stringify(['➢']), w2);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  check(`${T}, Entrée valide et ferme : la puce de « Alpha » est ➢, celle de « Beta » reste le rond`, !(await windowState()).shown && (await markerOf('Alpha')) === '➢ ' && (await markerOf('Beta')) === '• ', { alpha: await markerOf('Alpha'), beta: await markerOf('Beta') });
  await snap(`bullet-${T}-applied`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(`${T}, UN Ctrl+Z retire le signe`, (await markerOf('Alpha')) === '• ', await markerOf('Alpha'));
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(250);
  check(`${T}, Ctrl+Maj+Z le remet`, (await markerOf('Alpha')) === '➢ ', await markerOf('Alpha'));

  // 4) Un signe courant choisi à la souris, puis « Valider ».
  await clickText('Alpha');
  await pressRow();
  const w3 = await windowState();
  check(`${T}, la fenêtre rouverte montre le signe de la liste, sélectionné, et son bouton enfoncé`, w3.shown && w3.value === '➢' && w3.selected && JSON.stringify(w3.presetsPressed) === JSON.stringify(['➢']), w3);
  await clickPreset('✓');
  const w4 = await windowState();
  check(`${T}, un clic sur ✓ le met dans le champ et enfonce son bouton`, w4.value === '✓' && JSON.stringify(w4.presetsPressed) === JSON.stringify(['✓']), w4);
  await clickButton(texts.buttons[2]);
  check(`${T}, « ${texts.buttons[2]} » pose ✓`, !(await windowState()).shown && (await markerOf('Alpha')) === '✓ ', await markerOf('Alpha'));

  // 5) Plusieurs caractères : la fenêtre reste ouverte, dit pourquoi, Entrée ne fait rien ; Échap ferme sans toucher.
  await clickText('Alpha');
  await pressRow();
  await page.keyboard.type('ab', { delay: 20 });
  const w5 = await windowState();
  check(`${T}, deux caractères : l'erreur est dite, le champ marqué, « ${texts.buttons[2]} » grisé`, w5.invalid && w5.error !== '' && w5.okDisabled, w5);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check(`${T}, Entrée sur une saisie refusée laisse la fenêtre ouverte et la puce intacte`, (await windowState()).shown && (await markerOf('Alpha')) === '✓ ', { alpha: await markerOf('Alpha') });
  await snap(`bullet-${T}-error`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`${T}, Échap ferme sans toucher au document`, !(await windowState()).shown && (await markerOf('Alpha')) === '✓ ', { alpha: await markerOf('Alpha') });

  // 6) « Par défaut » rend le rond ; un bouton de style retire le signe choisi.
  await clickText('Alpha');
  await pressRow();
  await clickButton(texts.buttons[0]);
  const w6 = await windowState();
  check(`${T}, « ${texts.buttons[0]} » vide le champ sans fermer la fenêtre`, w6.shown && w6.value === '' && !w6.okDisabled, w6);
  await clickButton(texts.buttons[2]);
  check(`${T}, valider un champ vide rend le rond`, (await markerOf('Alpha')) === '• ', await markerOf('Alpha'));
  await clickText('Alpha');
  await pressRow();
  await page.keyboard.type('◆', { delay: 20 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await openMenu();
  const square = await centerOf('#v2-btn-bullet-square');
  await page.mouse.move(square.x, square.y, { steps: 6 });
  await page.mouse.click(square.x, square.y);
  await page.waitForTimeout(300);
  check(`${T}, le bouton « carré » de la liste retire le signe choisi : la puce est le carré`, (await markerOf('Alpha')) === '* ', await markerOf('Alpha'));
  await closeMenu();

  // 7) La couleur et la taille de la puce (lot 9e) : posées sur le point du curseur seul, en un pas d'historique, sans toucher au signe.
  const beta = await lookOf('Beta');
  await clickText('Alpha');
  await pressRow();
  const f0 = await fieldsOf();
  check(`${T}, la fenêtre a ses deux champs vides (« comme le texte »), sans défilement ni erreur`, f0.color === '' && f0.size === '' && !f0.scrolls && f0.error === '' && f0.ok && f0.swatches.length === 0, f0);
  await clickField('pp-bulletfmt-color');
  await page.keyboard.type('cc0000', { delay: 20 });
  await clickField('pp-bulletfmt-size');
  await page.keyboard.type('20', { delay: 20 });
  const f1 = await fieldsOf();
  check(`${T}, un code sans dièse et une taille tapés : pas d'erreur, « ${texts.buttons[2]} » actif`, f1.color === 'cc0000' && f1.size === '20' && f1.error === '' && f1.ok, f1);
  await snap(`bullet-${T}-look`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  const alphaLook = await lookOf('Alpha');
  check(`${T}, Entrée pose la puce rouge de 20 pt sur « Alpha » seul, le signe est resté`, !(await windowState()).shown && alphaLook.color === 'rgb(204, 0, 0)' && alphaLook.size === 20 && (await markerOf('Alpha')) === '* ' && JSON.stringify(await lookOf('Beta')) === JSON.stringify(beta), { alphaLook, beta: await lookOf('Beta') });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(`${T}, UN Ctrl+Z retire la couleur et la taille`, JSON.stringify(await lookOf('Alpha')) === JSON.stringify(beta), await lookOf('Alpha'));
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(250);
  check(`${T}, Ctrl+Maj+Z les remet`, (await lookOf('Alpha')).color === 'rgb(204, 0, 0)', await lookOf('Alpha'));
  await clickText('Alpha');
  await pressRow();
  const f2 = await fieldsOf();
  check(`${T}, rouverte, la fenêtre montre #cc0000 et 20`, f2.color === '#cc0000' && f2.size === '20', f2);
  await clickSwatch('#000000');
  const f3 = await fieldsOf();
  check(`${T}, un clic sur la teinte noire met #000000 dans le champ et l'enfonce`, f3.color === '#000000' && JSON.stringify(f3.swatches) === JSON.stringify(['#000000']), f3);
  await clickField('pp-bulletfmt-color');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('rouge', { delay: 20 });
  const f4 = await fieldsOf();
  check(`${T}, un code qui n'en est pas un : l'erreur est dite, le champ marqué, « ${texts.buttons[2]} » grisé`, JSON.stringify(f4.invalid) === JSON.stringify(['pp-bulletfmt-color']) && f4.error !== '' && !f4.ok, f4);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('#0a0', { delay: 20 });
  await clickField('pp-bulletfmt-size');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('2', { delay: 20 });
  const f5 = await fieldsOf();
  check(`${T}, une taille trop petite : l'erreur de la taille est dite`, JSON.stringify(f5.invalid) === JSON.stringify(['pp-bulletfmt-size']) && f5.error !== '' && !f5.ok, f5);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('18,5', { delay: 20 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  const green = await lookOf('Alpha');
  check(`${T}, #0a0 devient le vert #00aa00 et la virgule est acceptée : 18,5 pt`, green.color === 'rgb(0, 170, 0)' && green.size === 18.5, green);
  await clickText('Alpha');
  await pressRow();
  await clickButton(texts.buttons[0]);
  const f6 = await fieldsOf();
  check(`${T}, « ${texts.buttons[0]} » vide aussi la couleur et la taille`, f6.color === '' && f6.size === '', f6);
  await clickButton(texts.buttons[2]);
  check(`${T}, valider des champs vides rend à la puce la couleur et la taille du texte`, JSON.stringify(await lookOf('Alpha')) === JSON.stringify(beta), await lookOf('Alpha'));
}

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
