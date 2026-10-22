#!/usr/bin/env node
// « Paragraphe… » (js/paragraph-format.js, ligne du menu Alignement : interligne, espace avant, espace après, retrait à gauche, retrait de la première ligne) : le panneau de 700x400 d'Antoine, à la VRAIE souris (page.mouse) et au VRAI clavier (frappe,
// Tab, Entrée, Échap, Maj+flèche, Ctrl+Z), en clair, en sombre et en anglais. Ce que scenarios-paragraph-format.js ne peut pas voir depuis la page :
//  - au survol de l'icône Alignement, le volet s'ouvre dans le panneau et sa ligne « Paragraphe… » est visible, au premier plan, lisible, avec son nom (français, anglais) ;
//  - un vrai clic sur la ligne ouvre la fenêtre : titre, cinq champs, indication et boutons tiennent dans le panneau (titre et boutons fixes), le premier champ a le clavier et sa valeur est sélectionnée ;
//  - la frappe au clavier (1,5 / 1.5 selon la langue, Tab d'un champ à l'autre, Entrée) pose les cinq réglages, le curseur et le clavier retournent dans le texte, l'éditeur les montre (remplissages, interligne,
//    retrait à gauche, retrait de la première ligne) ;
//  - UN Ctrl+Z défait les cinq d'un coup, Ctrl+Maj+Z les remet ; « Par défaut » les retire d'une seule étape ;
//  - une première ligne suspendue plus loin que le retrait à gauche est refusée, avec la limite ; dans un élément de liste, les deux champs de retrait sont grisés (avec leur raison) et Tab les saute ;
//  - une saisie qui n'est pas un nombre ou qui sort des bornes garde la fenêtre ouverte, dit pourquoi (champ souligné de rouge, message), grise « Valider » ; Échap ferme sans toucher au document ;
//  - plusieurs paragraphes aux valeurs différentes (clic, Maj+flèche) : le champ qui diffère reste vide et dit « Plusieurs valeurs » ; modifier un seul champ ne touche pas aux autres ;
//  - sur un titre, la ligne est là, grisée avec sa raison pour info-bulle, et son clic n'ouvre rien ; en Lecture, tout le groupe Alignement est grisé.
// Lancé par run-headless.mjs (groupe Node "paragraphFormatMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-paragraph-format-mouse.mjs
// PARAGRAPH_FORMAT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.PARAGRAPH_FORMAT_MOUSE_PORT || 8957);
const SHOTS = process.env.PARAGRAPH_FORMAT_SHOTS || '';
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
if (!OFFLINE) console.log('[verify-paragraph-format-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|paragraphFormat|paragraph-format/i.test(m.text())) consoleProblems.push(m.text()); });
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

const ROW = '#v2-btn-paragraph';
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
// L'état de la ligne tel qu'on le lit : grisée, tabulation, info-bulle, curseur, teinte du texte.
const rowState = () => page.evaluate(sel => {
  const row = document.querySelector(sel);
  const cs = getComputedStyle(row);
  return { label: row.textContent.trim(), aria: row.getAttribute('aria-label'), disabled: row.getAttribute('aria-disabled'), greyed: row.classList.contains('v2-hover-row-disabled'), tab: row.tabIndex, title: row.title, color: cs.color, cursor: cs.cursor };
}, ROW);
// La fenêtre telle qu'on la voit : ouverte, ses morceaux dans le panneau et au premier plan, les champs, les remarques, le champ qui a le clavier.
const KEYS = ['lineHeight', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentFirst'];
const windowState = () => page.evaluate(({ width, height, KEYS }) => {
  const overlay = document.getElementById('pp-parafmt-modal');
  if (!overlay) return { shown: false };
  const shown = overlay.style.display !== 'none';
  const seenIn = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.left < -0.5 || r.top < -0.5 || r.right > width + 0.5 || r.bottom > height + 0.5) return false;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  };
  const input = key => document.getElementById('pp-parafmt-' + key);
  const box = overlay.querySelector('.pp-modal-box');
  const buttons = Array.from(overlay.querySelectorAll('.pp-modal-actions button'));
  const error = document.getElementById('pp-parafmt-error');
  const hint = document.getElementById('pp-parafmt-hint');
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
    fieldsIn: shown && KEYS.every(key => seenIn(input(key))),
    labels: Array.from(overlay.querySelectorAll('.pp-parafmt-label')).map(l => l.textContent.trim()),
    values: KEYS.map(key => input(key).value),
    placeholders: KEYS.map(key => input(key).placeholder),
    invalid: KEYS.filter(key => input(key).getAttribute('aria-invalid') === 'true'),
    disabled: KEYS.filter(key => input(key).disabled),
    reasons: KEYS.filter(key => input(key).title),
    focus: active && active.id,
    selected: active && active.tagName === 'INPUT' ? active.selectionStart === 0 && active.selectionEnd === active.value.length && active.value.length > 0 : false,
    error: error.hidden ? '' : error.textContent.trim(),
    errorIn: error.hidden ? null : seenIn(error),
    hint: hint.textContent.trim(),
    hintIn: shown && seenIn(hint),
    okDisabled: ok.disabled,
    scrolls: body.scrollHeight > body.clientHeight + 1,
    box: (() => { const r = box.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); })(),
  };
}, { width: WIDTH, height: HEIGHT, KEYS });
// Ce que le document porte : « Aa[1.758|12|6]{36|18} | Bb » (interligne | avant | après, puis retrait à gauche | première ligne ; « - » pour un réglage absent).
const settings = () => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.descendants((node) => {
    if (node.type.name !== 'paragraph') return;
    const a = node.attrs;
    const none = a.lineHeight == null && a.spaceBefore == null && a.spaceAfter == null;
    const part = v => (v == null ? '-' : String(v));
    const indents = a.indentLeft == null && a.indentFirst == null ? '' : '{' + part(a.indentLeft) + '|' + part(a.indentFirst) + '}';
    out.push(node.textContent + (none ? '' : '[' + part(a.lineHeight) + '|' + part(a.spaceBefore) + '|' + part(a.spaceAfter) + ']') + indents);
  });
  return out.join(' | ');
});
const caret = () => page.evaluate(() => {
  const sel = EditorCore.getEditor().state.selection;
  return { text: sel.$from.parent.textContent, empty: sel.empty, focus: !!document.activeElement && !!document.activeElement.closest('.tiptap') };
});
// Ce que l'éditeur dessine d'un paragraphe : son interligne (multiple de sa taille), ses remplissages (pt), son retrait à gauche et celui de sa première ligne (pt).
const looks = text => page.evaluate((needle) => {
  const p = Array.from(document.querySelectorAll('.tiptap p')).find(el => el.textContent.indexOf(needle) === 0);
  if (!p) return null;
  const cs = getComputedStyle(p);
  return { line: Math.round(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) * 1000) / 1000, top: Math.round(parseFloat(cs.paddingTop) * 0.75 * 100) / 100, bottom: Math.round(parseFloat(cs.paddingBottom) * 0.75 * 100) / 100, left: Math.round(parseFloat(cs.paddingLeft) * 0.75 * 100) / 100, first: Math.round(parseFloat(cs.textIndent) * 0.75 * 100) / 100 };
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
  if (click) { await page.mouse.click(x, r.y); await page.waitForTimeout(350); }
  return { x, y: r.y };
}
// Un bouton de la fenêtre, au vrai clic.
async function clickButton(label) {
  const point = await page.evaluate((text) => {
    const button = Array.from(document.querySelectorAll('#pp-parafmt-modal .pp-modal-actions button')).find(b => b.textContent.trim() === text);
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

const DOC = '<p>Bonjour</p><p>Total HT</p><p>Total TTC</p><p>Arrêté à la somme de</p>';
const HEADING_DOC = '<h2>Un titre</h2><p>Un texte</p>';

async function run(theme) {
  const T = theme;
  const en = (await page.evaluate(() => I18n.getLang())) === 'en';
  const point = en ? '.' : ',';
  const texts = en
    ? { row: 'Paragraph…', aria: 'Paragraph: line spacing, spaces and indents', title: 'Paragraph', labels: ['Line spacing', 'Space before', 'Space after', 'Left indent', 'First line'], buttons: ['Default', 'Cancel', 'Confirm'], mixed: 'Several values', ok: 'Confirm', reset: 'Default',
      reason: 'Only for text paragraphs (not headings, captions, headers or footers)', numberError: 'Enter a number, for example 1.5.', rangeError: /^The line spacing must be between 0\.2 and 9\.99\.$/, firstError: /^The first line cannot go out of the margin: -10 pt minimum\.$/ }
    : { row: 'Paragraphe…', aria: 'Paragraphe : interligne, espaces et retraits', title: 'Paragraphe', labels: ['Interligne', 'Espace avant', 'Espace après', 'Retrait à gauche', 'Première ligne'], buttons: ['Par défaut', 'Annuler', 'Valider'], mixed: 'Plusieurs valeurs', ok: 'Valider', reset: 'Par défaut',
      reason: 'Seulement pour les paragraphes du texte (ni titre, ni légende, ni en-tête ou pied de page)', numberError: 'Saisissez un nombre, par exemple 1,5.', rangeError: /^L’interligne doit être compris entre 0,2 et 9,99\.$/, firstError: /^La première ligne ne peut pas sortir de la marge : -10 pt au minimum\.$/ };
  const defaultLine = '1' + point + '21';

  // 1) Le menu : un survol réel de l'icône ouvre le volet, la ligne y est, dans le panneau, au premier plan, avec son nom.
  await setDoc(DOC);
  await clickText('Total HT');
  const mainBox = await hit(MAIN);
  check(`${T}, menu : l'icône Alignement est visible dans le panneau ${WIDTH}x${HEIGHT} et sous la souris`, seen(mainBox), mainBox);
  await openMenu();
  const rowBox = await hit(ROW);
  const s1 = await rowState();
  check(`${T}, menu : au survol, la ligne « ${texts.row} » est dans le panneau, au premier plan`, seen(rowBox), rowBox);
  check(`${T}, menu : la ligne s'appelle « ${texts.row} » (nom accessible complet), libre (ni grisée), dans l'ordre des tabulations`, s1.label === texts.row && s1.aria === texts.aria && s1.disabled === 'false' && !s1.greyed && s1.tab === 0 && s1.title === '', s1);
  await snap(`${T}-1-menu`);
  await closeMenu();
  check(`${T}, menu : la souris partie, le volet se referme`, await page.evaluate(() => getComputedStyle(document.querySelector('#v2-align-group .v2-hover-flyout')).display === 'none'));

  // 2) Un vrai clic sur la ligne : la fenêtre s'ouvre, entière dans le panneau, sur les valeurs du paragraphe (celles d'origine), premier champ au clavier et sélectionné.
  const before = await html();
  await pressRow();
  const w2 = await windowState();
  check(`${T}, fenêtre : un clic sur la ligne ouvre « ${texts.title} » ; sa boîte, son titre, ses cinq champs, l'indication et ses trois boutons tiennent dans le panneau ${WIDTH}x${HEIGHT}, au premier plan, sans que le corps de la fenêtre défile`,
    w2.shown && w2.title === texts.title && w2.boxIn && w2.titleIn && w2.fieldsIn && w2.hintIn && w2.buttonsIn && !w2.scrolls, w2);
  check(`${T}, fenêtre : les libellés sont ${texts.labels.map(l => '« ' + l + ' »').join(', ')} et les boutons ${texts.buttons.map(l => '« ' + l + ' »').join(', ')}, dans cet ordre`, JSON.stringify(w2.labels) === JSON.stringify(texts.labels) && JSON.stringify(w2.buttons) === JSON.stringify(texts.buttons), { labels: w2.labels, buttons: w2.buttons });
  check(`${T}, fenêtre : les champs montrent les valeurs d'origine (${defaultLine} fois la ligne simple, 0 pt, 0 pt, 0 pt, 0 pt), l'interligne a le clavier et sa valeur est sélectionnée, rien n'est en erreur, aucun champ grisé`,
    JSON.stringify(w2.values) === JSON.stringify([defaultLine, '0', '0', '0', '0']) && w2.disabled.length === 0 && w2.focus === 'pp-parafmt-lineHeight' && w2.selected && !w2.error && w2.invalid.length === 0 && !w2.okDisabled, w2);
  check(`${T}, fenêtre : le document n'a pas bougé pendant l'ouverture`, (await html()) === before);
  await snap(`${T}-2-fenetre`);

  // 3) La frappe : 1,5 (ou 1.5), Tab, 12, Tab, 6, Tab, 36, Tab, 18, Entrée. Les cinq réglages sont posés, la fenêtre se ferme, le curseur est resté dans le texte.
  await page.keyboard.type('1' + point + '5', { delay: 15 });
  await page.keyboard.press('Tab');
  const tab1 = await windowState();
  check(`${T}, clavier : Tab passe à « ${texts.labels[1]} » et sélectionne sa valeur`, tab1.focus === 'pp-parafmt-spaceBefore' && tab1.selected, tab1);
  await page.keyboard.type('12', { delay: 15 });
  await page.keyboard.press('Tab');
  await page.keyboard.type('6', { delay: 15 });
  await page.keyboard.press('Tab');
  const tab2 = await windowState();
  check(`${T}, clavier : Tab passe à « ${texts.labels[3]} » et sélectionne sa valeur`, tab2.focus === 'pp-parafmt-indentLeft' && tab2.selected, tab2);
  await page.keyboard.type('36', { delay: 15 });
  await page.keyboard.press('Tab');
  await page.keyboard.type('18', { delay: 15 });
  const typed = await windowState();
  check(`${T}, clavier : les cinq champs disent ${'1' + point + '5'}, 12, 6, 36, 18`, JSON.stringify(typed.values) === JSON.stringify(['1' + point + '5', '12', '6', '36', '18']) && !typed.error && typed.boxIn && typed.buttonsIn, typed);
  await snap(`${T}-3-saisie`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  const w3 = await windowState();
  const list3 = await settings(), caret3 = await caret();
  check(`${T}, Entrée : valide et ferme la fenêtre`, !w3.shown, w3.shown);
  check(`${T}, Entrée : « Total HT » porte 1,758 (1,5 x 1,172), 12 pt avant, 6 pt après, 36 pt à gauche et 18 pt à la première ligne, et lui seul`, list3 === 'Bonjour | Total HT[1.758|12|6]{36|18} | Total TTC | Arrêté à la somme de', list3);
  check(`${T}, Entrée : le curseur reste dans « Total HT » et le clavier dans l'éditeur`, caret3.text === 'Total HT' && caret3.empty && caret3.focus, caret3);
  const look3 = await looks('Total HT'), plain3 = await looks('Total TTC');
  check(`${T}, éditeur : « Total HT » est dessiné avec son interligne (1,758), ses remplissages (12 pt, 6 pt) et ses retraits (36 pt, 18 pt) ; « Total TTC » garde l'interligne d'origine, aucun remplissage et aucun retrait`,
    look3 && Math.abs(look3.line - 1.758) < 0.01 && Math.abs(look3.top - 12) < 0.05 && Math.abs(look3.bottom - 6) < 0.05 && Math.abs(look3.left - 36) < 0.05 && Math.abs(look3.first - 18) < 0.05
      && plain3 && Math.abs(plain3.line - 1.42) < 0.01 && plain3.top === 0 && plain3.bottom === 0 && plain3.left === 0 && plain3.first === 0, { look3, plain3 });
  await snap(`${T}-4-pose`);

  // 4) UN Ctrl+Z défait les cinq réglages, Ctrl+Maj+Z les remet.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const undone = await settings(), htmlUndone = await html();
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(250);
  const redone = await settings();
  check(`${T}, annuler : un seul Ctrl+Z défait les cinq réglages (document d'avant), Ctrl+Maj+Z les remet`, undone === 'Bonjour | Total HT | Total TTC | Arrêté à la somme de' && htmlUndone === before && redone === list3, { undone, redone });

  // 5) La fenêtre rouverte montre les valeurs posées ; « Par défaut » les remet, Valider les retire en une étape.
  await pressRow();
  const w5 = await windowState();
  check(`${T}, réouverture : les champs montrent 1${point}5, 12, 6, 36 et 18`, JSON.stringify(w5.values) === JSON.stringify(['1' + point + '5', '12', '6', '36', '18']) && w5.shown, w5);
  await clickButton(texts.reset);
  const w5b = await windowState();
  check(`${T}, « ${texts.reset} » : les champs reviennent à ${defaultLine}, 0, 0, 0 et 0 et la fenêtre reste ouverte, le clavier dans l'interligne`, JSON.stringify(w5b.values) === JSON.stringify([defaultLine, '0', '0', '0', '0']) && w5b.shown && w5b.focus === 'pp-parafmt-lineHeight', w5b);
  await clickButton(texts.ok);
  const list5 = await settings();
  check(`${T}, « ${texts.ok} » (vrai clic) : « Total HT » n'a plus aucun réglage (ni retrait), en une seule étape d'historique`, list5 === 'Bonjour | Total HT | Total TTC | Arrêté à la somme de', list5);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(`${T}, « ${texts.reset} » : un Ctrl+Z remet les cinq réglages d'un coup`, (await settings()) === list3, await settings());

  // 6) Une saisie qui n'est pas bonne : la fenêtre reste ouverte, le champ est en erreur, le message le dit, « Valider » est grisé ; Entrée ne fait rien ; Échap ferme sans toucher au document.
  const beforeError = await html();
  await pressRow();
  await page.keyboard.type('abc', { delay: 15 });
  const w6 = await windowState();
  check(`${T}, erreur : « abc » dans l'interligne : champ en erreur, message « ${texts.numberError} », « ${texts.ok} » grisé, le message entièrement visible sans défiler`, w6.invalid.join() === 'lineHeight' && w6.error === texts.numberError && w6.okDisabled && w6.shown && w6.boxIn && w6.buttonsIn && w6.errorIn === true && !w6.scrolls, w6);
  await snap(`${T}-5-erreur`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check(`${T}, erreur : Entrée ne valide pas et la fenêtre reste ouverte`, (await windowState()).shown && (await html()) === beforeError);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('20', { delay: 15 });
  const w6b = await windowState();
  check(`${T}, erreur : 20 est hors bornes : le message donne les bornes (0${point}2 à 9${point}99), le champ reste en erreur`, texts.rangeError.test(w6b.error) && w6b.invalid.join() === 'lineHeight' && w6b.okDisabled, w6b);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const w6c = await windowState();
  const caret6 = await caret();
  check(`${T}, Échap : ferme la fenêtre, le document est celui d'avant et le clavier retourne dans le texte`, !w6c.shown && (await html()) === beforeError && caret6.focus && caret6.text === 'Total HT', { shown: w6c.shown, caret6 });

  // 6 bis) Une première ligne suspendue ne passe pas à gauche de la marge du paragraphe : le message donne la limite, « Valider » est grisé, Entrée ne valide pas ; corrigée, la fenêtre valide en une étape.
  await setDoc(DOC);
  await clickText('Total HT');
  const beforeHang = await html();
  await pressRow();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await page.keyboard.type('10', { delay: 15 });
  await page.keyboard.press('Tab');
  await page.keyboard.type('-18', { delay: 15 });
  const w6d = await windowState();
  check(`${T}, retrait suspendu : -18 pour 10 pt à gauche est refusé : « ${texts.labels[4]} » en erreur, le message dit la limite (-10), « ${texts.ok} » grisé, la fenêtre entière dans le panneau et le message visible sans défiler`,
    w6d.invalid.join() === 'indentFirst' && texts.firstError.test(w6d.error) && w6d.okDisabled && w6d.shown && w6d.boxIn && w6d.buttonsIn && w6d.errorIn === true && !w6d.scrolls, w6d);
  await snap(`${T}-5b-retrait-suspendu`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check(`${T}, retrait suspendu : Entrée ne valide pas, la fenêtre reste ouverte et le document ne bouge pas`, (await windowState()).shown && (await html()) === beforeHang);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('-10', { delay: 15 });
  const w6e = await windowState();
  check(`${T}, retrait suspendu : corrigé à -10, plus d'erreur et « ${texts.ok} » est libre`, w6e.invalid.length === 0 && !w6e.error && !w6e.okDisabled, w6e);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const list6e = await settings();
  check(`${T}, retrait suspendu : « Total HT » porte 10 pt à gauche et -10 pt à la première ligne`, list6e === 'Bonjour | Total HT{10|-10} | Total TTC | Arrêté à la somme de', list6e);
  const look6e = await looks('Total HT');
  check(`${T}, retrait suspendu : l'éditeur dessine la première ligne à la marge (padding 10 pt, text-indent -10 pt)`, !!look6e && Math.abs(look6e.left - 10) < 0.05 && Math.abs(look6e.first + 10) < 0.05, look6e);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(`${T}, retrait suspendu : un Ctrl+Z rend le document d'avant`, (await html()) === beforeHang);

  // 6 ter) Dans un élément de liste, les retraits n'ont pas cours : leurs deux champs sont grisés avec leur raison, Tab les saute, les trois autres champs restent libres.
  await setDoc('<ul><li><p>Premier point</p></li></ul><p>Bonjour</p>');
  await clickText('Premier point');
  await pressRow();
  const w6f = await windowState();
  check(`${T}, liste : « ${texts.labels[3]} » et « ${texts.labels[4]} » sont grisés avec leur raison, les trois autres champs sont libres, rien n'est en erreur`,
    w6f.shown && w6f.disabled.join() === 'indentLeft,indentFirst' && w6f.reasons.join() === 'indentLeft,indentFirst' && w6f.invalid.length === 0 && w6f.boxIn && w6f.buttonsIn, w6f);
  await snap(`${T}-5c-liste`);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  const after3Tabs = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent.trim() }));
  check(`${T}, liste : après l'espace après, Tab saute les deux champs grisés et passe à un bouton (« ${texts.reset} »)`, after3Tabs.tag === 'BUTTON' && after3Tabs.text === texts.reset, after3Tabs);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 7) Plusieurs paragraphes aux valeurs différentes (clic, Maj+flèche) : le champ qui diffère reste vide et dit « Plusieurs valeurs » ; on ne change que l'espace avant.
  await setDoc('<p>Bonjour</p><p data-space-before="4" data-line-height="2.344">Total HT</p><p data-space-before="4">Total TTC</p><p>Arrêté</p>');
  await clickText('Total HT', 0.9);
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(250);
  await pressRow();
  const w7 = await windowState();
  check(`${T}, plusieurs paragraphes : l'interligne diffère (champ vide, « ${texts.mixed} »), l'espace avant est commun (4)`, JSON.stringify(w7.values) === JSON.stringify(['', '4', '0', '0', '0']) && w7.placeholders[0] === texts.mixed && w7.placeholders[1] === '' && w7.shown, w7);
  await snap(`${T}-6-plusieurs`);
  await page.keyboard.press('Tab');
  await page.keyboard.type('9', { delay: 15 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const list7 = await settings();
  check(`${T}, plusieurs paragraphes : seul l'espace avant change (9 pt) ; l'interligne de « Total HT » est gardé, « Total TTC » n'en prend pas`, list7 === 'Bonjour | Total HT[2.344|9|-] | Total TTC[-|9|-] | Arrêté', list7);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(`${T}, plusieurs paragraphes : un seul Ctrl+Z rend les deux paragraphes`, (await settings()) === 'Bonjour | Total HT[2.344|4|-] | Total TTC[-|4|-] | Arrêté', await settings());

  // 8) Sur un titre : la ligne est là, grisée (jamais retirée), avec sa raison pour info-bulle ; un clic n'ouvre rien.
  await setDoc(DOC);
  await clickText('Total HT');
  await openMenu();
  const freeColor = (await rowState()).color;
  await closeMenu();
  await setDoc(HEADING_DOC);
  await clickText('Un titre');
  await openMenu();
  const box8 = await hit(ROW), s8 = await rowState();
  check(`${T}, titre : la ligne est toujours dans le volet, visible, au premier plan`, seen(box8), box8);
  check(`${T}, titre : elle est grisée (aria-disabled, teinte atténuée, curseur interdit, hors des tabulations) et dit pourquoi : « ${texts.reason.slice(0, 40)}… »`, s8.disabled === 'true' && s8.greyed && s8.tab === -1 && s8.title === texts.reason && s8.cursor === 'not-allowed', s8);
  check(`${T}, titre : la teinte du texte grisé n'est pas celle du texte libre`, s8.color !== freeColor, { greyed: s8.color, free: freeColor });
  const beforeHeading = await html();
  await pressRow();
  check(`${T}, titre : un clic sur la ligne grisée n'ouvre aucune fenêtre et ne change rien`, !(await windowState()).shown && (await html()) === beforeHeading);
  await snap(`${T}-7-grise`);
  await closeMenu();
  await clickText('Un texte');
  await openMenu();
  check(`${T}, retour dans un paragraphe : la ligne est de nouveau libre`, (await rowState()).disabled === 'false', await rowState());
  await closeMenu();

  // 9) La Lecture : tout le groupe Alignement est grisé comme le reste de la barre, rien ne le reçoit plus.
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
  await page.evaluate(sel => document.querySelector(sel).click(), ROW);
  await page.waitForTimeout(250);
  check(`${T}, Lecture : même un clic qui n'est pas de la souris sur la ligne n'ouvre rien`, !(await windowState()).shown);
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
