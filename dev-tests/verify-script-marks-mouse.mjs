#!/usr/bin/env node
// Exposant et indice (js/script-marks.js, js/main-toolbar.js, js/shortcuts.js, css/script-marks.css, index.html) : le panneau de 700x400 d'Antoine, à la VRAIE souris
// (page.mouse) et au VRAI clavier (Ctrl+. et Ctrl+,), en clair et en sombre, en français et en anglais. Ce que scenarios-script-marks.js ne peut pas voir depuis la page :
//  - le survol de l'icône « Lien et blocs de contenu » ouvre le volet ; les deux icônes Exposant et Indice, à droite du titre du volet, et les lignes de toujours tiennent dans le panneau
//    et sont au premier plan (rien ne déborde, aucun autre volet ne les recouvre) ; chaque icône est une cible d'au moins 24x24 px, laisse sa place au titre (en français comme en
//    anglais) et n'ajoute aucune hauteur au volet : il garde la place des lignes que d'autres chantiers y ajoutent ;
//  - l'infobulle de chaque icône dit son nom et sa touche, entière, dans la fenêtre ;
//  - un clic réel sur une icône met le mot choisi à la souris (double-clic) en exposant ou en indice, un second clic le retire, l'une remplace l'autre ; l'icône s'enfonce, le mot reste
//    choisi et le clavier reste dans l'éditeur ;
//  - la frappe réelle : Ctrl+. et Ctrl+, ; le texte tapé à la suite d'une icône cliquée ;
//  - le dessin sur les vrais rectangles du texte : l'exposant est plus petit et plus haut que son voisin, l'indice plus bas, la hauteur du paragraphe ne change pas ;
//  - en mode e-mail les icônes restent actives (Gras est grisé) : un clic réel met le mot choisi en exposant, et le texte du lien l'écrit en caractères Unicode.
// Lancé par run-headless.mjs (groupe Node "scriptMarksMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-script-marks-mouse.mjs
// SCRIPT_MARKS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SCRIPT_MARKS_MOUSE_PORT || 8992);
const SHOTS = process.env.SCRIPT_MARKS_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-dialogs-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-script-marks-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

const MAIN = '#v2-btn-link';
const SUP = '#v2-btn-superscript';
const SUB = '#v2-btn-subscript';
const ROWS = ['#v2-row-link', '#v2-btn-citation', '#v2-btn-code-block', '#v2-btn-callout', '#v2-btn-signature', '#v2-btn-qr'];

async function snap(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
const centerOf = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
}, selector);
// L'élément, tel que la souris le voit : visible dans le panneau et au premier plan (rien d'autre n'est dessus à son centre).
const hit = selector => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { found: true, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, inPanel: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
}, selector);
const seen = box => box.found && box.inPanel && box.onTop;
const html = () => page.evaluate(() => Editor.getHTML());
const selectedText = () => page.evaluate(() => window.getSelection().toString());
const focusIn = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.closest('.tiptap') ? 'editor' : 'ailleurs : ' + (a.id || a.tagName)) : 'rien'; });
const stateOf = id => page.evaluate(id => { const b = document.getElementById(id); return { active: b.classList.contains('is-active'), pressed: b.getAttribute('aria-pressed'), locked: b.classList.contains('v2-hf-locked') }; }, id);
// Pointe un texte de l'éditeur (milieu par défaut) pour y cliquer pour de vrai.
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
  await page.waitForTimeout(200);
}
// L'info-bulle d'un hôte [data-tip] : le ::after (css/toolbar-v2.css), son texte et son rectangle en coordonnées fenêtre, calculés depuis les valeurs résolues du navigateur.
const tipOf = id => page.evaluate(id => {
  const host = document.getElementById(id);
  const r = host.getBoundingClientRect();
  const cs = getComputedStyle(host, '::after');
  const w = parseFloat(cs.width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const h = parseFloat(cs.height) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const left = r.left + host.clientLeft + parseFloat(cs.left) - w / 2;
  const top = r.top + host.clientTop + parseFloat(cs.top);
  return { content: cs.content.replace(/^"|"$/g, ''), opacity: Number(cs.opacity), left: Math.round(left * 10) / 10, right: Math.round((left + w) * 10) / 10, bottom: Math.round((top + h) * 10) / 10 };
}, id);
// Survol réel de l'icône du menu : la souris arrive depuis le bas du document (jamais par-dessus un autre volet de la barre).
async function openMenu() {
  const c = await centerOf(MAIN);
  await page.mouse.move(c.x, c.y + 150);
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(350);
  return c;
}
// Le titre du volet « Lien et blocs de contenu » : où son texte finit, et la hauteur du volet avec puis sans les deux icônes (elles sont hors du flux : la même).
const headOfMenu = () => page.evaluate(() => {
  const flyout = document.getElementById('v2-blocks-flyout');
  const range = document.createRange(); range.selectNodeContents(flyout.querySelector('.v2-hover-flyout-label'));
  const row = flyout.querySelector('.v2-hover-icon-row');
  const shown = flyout.getBoundingClientRect().height;
  row.style.display = 'none';
  const hidden = flyout.getBoundingClientRect().height;
  row.style.display = '';
  return { titleRight: range.getBoundingClientRect().right, shown, hidden };
});
// La souris part vers le bas du panneau, du côté du volet qui a le plus de place : le volet peut descendre jusqu'à 395 px (sept lignes), un point du bas au milieu serait encore dessus.
async function closeMenu() {
  const f = await centerOf('#v2-blocks-flyout');
  const x = f && f.w > 0 ? (f.l > WIDTH - f.r ? f.l / 2 : (f.r + WIDTH) / 2) : WIDTH / 2;
  await page.mouse.move(x, HEIGHT - 20, { steps: 3 });
  await page.waitForTimeout(250);
}
// Une icône du titre du volet, à la vraie souris : le volet s'ouvre au survol de l'icône du menu, la main descend dans le volet jusqu'à la hauteur des icônes (sans en sortir), puis se
// porte de côté sur l'icône, et clique.
async function pressIcon(selector, { click = true } = {}) {
  const c = await openMenu();
  const f = await centerOf('#v2-blocks-flyout');
  const r = await centerOf(selector);
  const x0 = Math.min(Math.max(c.x, f.l + 6), f.r - 6);
  await page.mouse.move(x0, r.y, { steps: 6 });
  await page.mouse.move(r.x, r.y, { steps: 4 });
  await page.waitForTimeout(120);
  if (click) { await page.mouse.click(r.x, r.y); await page.waitForTimeout(250); }
  return r;
}
// L'info-bulle paraît .35s après le survol et se fond en .12s (css/toolbar-v2.css) : on attend qu'elle soit entière.
async function waitTip(id) {
  await page.waitForFunction(id => Number(getComputedStyle(document.getElementById(id), '::after').opacity) === 1, id, { timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(60);
}

async function run(theme) {
  const T = theme;
  const L = { sup: 'Exposant', sub: 'Indice' };

  // 1) Le menu : un survol réel de l'icône ouvre le volet ; les deux icônes du titre et les lignes de toujours (lien, citation, bloc de code, encadré, signature, QR code) sont dans le panneau et au premier plan.
  await setDoc('<p>Bonjour le monde entier</p><p>Deuxième ligne</p>');
  await openMenu();
  const flyout = await hit('#v2-blocks-flyout');
  const rows = [];
  for (const sel of ROWS) rows.push(await hit(sel));
  const sup = await hit(SUP), sub = await hit(SUB);
  check(`${T}, menu : au survol, le volet s'ouvre dans le panneau ${WIDTH}x${HEIGHT} avec ses lignes de toujours au premier plan`, flyout.found && flyout.inPanel && rows.every(seen), { flyout, rows });
  check(`${T}, menu : les icônes Exposant et Indice sont dans le panneau, au premier plan, d'au moins 24x24 px`, seen(sup) && seen(sub) && sup.w >= 24 && sup.h >= 24 && sub.w >= 24 && sub.h >= 24, { sup, sub });
  const link = await hit('#v2-row-link');
  const head = await headOfMenu();
  check(`${T}, menu : les deux icônes sont sur la ligne du titre, à sa droite et à 4 px au moins de lui, au-dessus de « Lien… », Exposant puis Indice côte à côte`,
    sup.b <= link.t + 1 && sub.b <= link.t + 1 && Math.abs(sup.t - sub.t) <= 1 && sup.r <= sub.l + 1 && sup.l >= head.titleRight + 4 && sub.r <= flyout.r, { link, sup, sub, head, flyout });
  check(`${T}, menu : les deux icônes n'ajoutent aucune hauteur au volet (${head.shown} px avec, ${head.hidden} px sans)`, head.shown === head.hidden && head.shown > 0, head);
  await snap(`${T}-1-menu`);

  // 2) Les infobulles : le nom et la touche, entiers, dans la fenêtre.
  await pressIcon(SUP, { click: false });
  await waitTip('v2-btn-superscript');
  const tipSup = await tipOf('v2-btn-superscript');
  check(`${T}, infobulle : « ${L.sup} (Ctrl+.) », entière, dans la fenêtre`, tipSup.content === `${L.sup} (Ctrl+.)` && tipSup.opacity === 1 && tipSup.left >= 0 && tipSup.right <= WIDTH && tipSup.bottom <= HEIGHT, tipSup);
  await snap(`${T}-2-infobulle`);
  await pressIcon(SUB, { click: false });
  await waitTip('v2-btn-subscript');
  const tipSub = await tipOf('v2-btn-subscript');
  check(`${T}, infobulle : « ${L.sub} (Ctrl+,) », entière, dans la fenêtre`, tipSub.content === `${L.sub} (Ctrl+,)` && tipSub.opacity === 1 && tipSub.left >= 0 && tipSub.right <= WIDTH && tipSub.bottom <= HEIGHT, tipSub);
  await closeMenu();
  const closed = await page.evaluate(() => getComputedStyle(document.getElementById('v2-blocks-flyout')).display === 'none');
  check(`${T}, menu : la souris partie, le volet se referme`, closed);

  // 3) Un mot choisi à la souris (double-clic), les icônes à la souris.
  await setDoc('<p>Bonjour le monde entier</p><p>Deuxième ligne</p>');
  const word = await pointOf('monde');
  await page.mouse.dblclick(word.x, word.y);
  await page.waitForTimeout(250);
  const chosen = await selectedText();
  await pressIcon(SUP);
  const h1 = await html();
  const st1 = await stateOf('v2-btn-superscript');
  check(`${T}, souris : un double-clic choisit « monde », un clic sur Exposant le met en <sup>`, chosen.trim() === 'monde' && h1 === '<p>Bonjour le <sup>monde</sup> entier</p><p>Deuxième ligne</p>', { chosen, h1 });
  check(`${T}, souris : l'icône s'enfonce (aria-pressed), le mot reste choisi, le clavier reste dans l'éditeur`, st1.active && st1.pressed === 'true' && (await selectedText()).trim() === 'monde' && (await focusIn()) === 'editor', { st1, sel: await selectedText(), focus: await focusIn() });
  await snap(`${T}-3-exposant`);
  await pressIcon(SUP);
  const h2 = await html();
  const st2 = await stateOf('v2-btn-superscript');
  check(`${T}, souris : un second clic sur Exposant retire la marque et relève l'icône`, h2 === '<p>Bonjour le monde entier</p><p>Deuxième ligne</p>' && !st2.active && st2.pressed === 'false', { h2, st2 });
  await pressIcon(SUB);
  const h3 = await html();
  const st3 = await stateOf('v2-btn-subscript');
  check(`${T}, souris : Indice met le mot en <sub>, son icône s'enfonce`, h3 === '<p>Bonjour le <sub>monde</sub> entier</p><p>Deuxième ligne</p>' && st3.active && st3.pressed === 'true', { h3, st3 });
  await snap(`${T}-4-indice`);
  await pressIcon(SUP);
  const h4 = await html();
  const stSup = await stateOf('v2-btn-superscript'), stSub = await stateOf('v2-btn-subscript');
  check(`${T}, souris : Exposant sur un mot en indice le remplace (jamais les deux)`, h4 === '<p>Bonjour le <sup>monde</sup> entier</p><p>Deuxième ligne</p>' && stSup.active && !stSub.active, { h4, stSup, stSub });
  await pressIcon(SUP);
  await closeMenu();

  // 4) Le vrai clavier : Ctrl+. et Ctrl+, sur le mot encore choisi.
  const keysFrom = await html();
  await page.keyboard.press('Control+.');
  await page.waitForTimeout(150);
  const k1 = await html();
  await page.keyboard.press('Control+.');
  await page.waitForTimeout(150);
  const k2 = await html();
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(150);
  const k3 = await html();
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(150);
  const k4 = await html();
  check(`${T}, clavier : Ctrl+. met en exposant puis retire, Ctrl+, met en indice puis retire (frappe réelle, sans lettre perdue)`,
    keysFrom === '<p>Bonjour le monde entier</p><p>Deuxième ligne</p>' && k1 === '<p>Bonjour le <sup>monde</sup> entier</p><p>Deuxième ligne</p>' && k2 === keysFrom
      && k3 === '<p>Bonjour le <sub>monde</sub> entier</p><p>Deuxième ligne</p>' && k4 === keysFrom, { keysFrom, k1, k2, k3, k4 });

  // 5) Le texte tapé à la suite d'une icône cliquée.
  await setDoc('<p>Bonjour le monde entier</p>');
  const end = await pointOf('entier', 0.98);
  await page.mouse.click(end.x, end.y);
  await page.keyboard.press('End');
  await pressIcon(SUP);
  await page.keyboard.type('2');
  const t1 = await html();
  await pressIcon(SUP);
  await page.keyboard.type(' fin');
  const t2 = await html();
  check(`${T}, frappe : après un clic sur Exposant, le « 2 » tapé est un exposant ; un nouveau clic revient au texte ordinaire`, t1 === '<p>Bonjour le monde entier<sup>2</sup></p>' && t2 === '<p>Bonjour le monde entier<sup>2</sup> fin</p>', { t1, t2 });
  await closeMenu();

  // 6) Le dessin, sur les vrais rectangles du texte.
  await setDoc('<p>Aaa bbb ccc</p><p>Aaa<sup>up</sup> bbb<sub>dn</sub> ccc</p>');
  const m = await page.evaluate(() => {
    const ps = document.querySelectorAll('.tiptap p');
    const rectOf = (p, text) => {
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const i = n.textContent.indexOf(text);
        if (i < 0) continue;
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
        const b = r.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, height: b.height };
      }
      return null;
    };
    return { plainHeight: ps[0].getBoundingClientRect().height, markedHeight: ps[1].getBoundingClientRect().height, base: rectOf(ps[1], 'Aaa'), sup: rectOf(ps[1], 'up'), sub: rectOf(ps[1], 'dn') };
  });
  check(`${T}, dessin : l'exposant est plus petit (6/10) et plus haut que son voisin, l'indice plus bas, sur les rectangles réels du texte`,
    m.sup.height < 0.7 * m.base.height && m.sub.height < 0.7 * m.base.height && m.sup.top < m.base.top && m.sub.bottom > m.base.bottom, m);
  check(`${T}, dessin : la hauteur du paragraphe ne change pas avec un exposant et un indice (${m.plainHeight} px)`, Math.abs(m.markedHeight - m.plainHeight) < 0.5, m);
  await snap(`${T}-5-dessin`);

  // 7) Mode e-mail : le lien est du texte brut, mais l'exposant et l'indice y sont des caractères Unicode : les icônes restent actives (Gras, lui, est grisé), un clic réel met le mot
  // choisi en exposant, et le texte du lien l'écrit en caractères Unicode.
  await setDoc('<p>Bonjour le monde entier</p>');
  const w2 = await pointOf('monde');
  await page.mouse.dblclick(w2.x, w2.y);
  await page.waitForTimeout(250);
  await page.evaluate(() => { MainToolbar.setEmailMode(true); EmailPlainText.setActive(true); MainToolbar.syncToolbarState(); });
  await pressIcon(SUP);
  const emailHtml = await html();
  const emailSup = await stateOf('v2-btn-superscript'), emailSub = await stateOf('v2-btn-subscript');
  const boldLocked = await page.evaluate(() => document.getElementById('v2-btn-bold').classList.contains('v2-hf-locked'));
  const linkText = await page.evaluate(markup => MailtoExport.plainTextFromHtml(markup), emailHtml);
  check(`${T}, e-mail : les deux icônes restent actives (Gras est grisé), un clic réel met « monde » en exposant et le texte du lien l'écrit en caractères Unicode`,
    !emailSup.locked && !emailSub.locked && emailSup.active && boldLocked && emailHtml === '<p>Bonjour le <sup>monde</sup> entier</p>' && linkText === 'Bonjour le ᵐᵒⁿᵈᵉ entier',
    { emailSup, emailSub, boldLocked, emailHtml, linkText });
  await snap(`${T}-6-email`);
  await page.evaluate(() => { EmailPlainText.setActive(false); MainToolbar.setEmailMode(false); MainToolbar.syncToolbarState(); });
  await closeMenu();
}

async function runEnglish() {
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await setDoc('<p>Hello big world</p>');
  await openMenu();
  const names = await page.evaluate(() => ['v2-btn-superscript', 'v2-btn-subscript'].map(id => document.getElementById(id).getAttribute('aria-label')));
  const flyoutTitle = await page.evaluate(() => document.querySelector('#v2-blocks-flyout .v2-hover-flyout-label').textContent);
  check('anglais, menu : icônes « Superscript » et « Subscript », titre « Link and content blocks »', JSON.stringify(names) === '["Superscript","Subscript"]' && flyoutTitle === 'Link and content blocks', { names, flyoutTitle });
  const enHead = await headOfMenu();
  const enSup = await hit(SUP);
  check('anglais, menu : les icônes laissent sa place au titre (4 px au moins) et n\'ajoutent aucune hauteur', enSup.l >= enHead.titleRight + 4 && enHead.shown === enHead.hidden, { enHead, enSup });
  await pressIcon(SUP, { click: false });
  await waitTip('v2-btn-superscript');
  const tipSup = await tipOf('v2-btn-superscript');
  await pressIcon(SUB, { click: false });
  await waitTip('v2-btn-subscript');
  const tipSub = await tipOf('v2-btn-subscript');
  check('anglais, infobulles : « Superscript (Ctrl+.) » et « Subscript (Ctrl+,) », entières, dans la fenêtre',
    tipSup.content === 'Superscript (Ctrl+.)' && tipSub.content === 'Subscript (Ctrl+,)' && tipSup.left >= 0 && tipSub.right <= WIDTH && tipSup.bottom <= HEIGHT && tipSub.bottom <= HEIGHT, { tipSup, tipSub });
  await snap('en-1-menu');
  const word = await pointOf('big');
  await closeMenu();
  await page.mouse.dblclick(word.x, word.y);
  await page.waitForTimeout(200);
  await pressIcon(SUB);
  check('anglais, souris : Subscript met le mot choisi en <sub>', (await html()) === '<p>Hello <sub>big</sub> world</p>', await html());
  await closeMenu();
  await page.evaluate(() => I18n.setLang('fr'));
  await page.waitForTimeout(250);
}

await run('light');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(200);
await run('dark');
await runEnglish();

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
