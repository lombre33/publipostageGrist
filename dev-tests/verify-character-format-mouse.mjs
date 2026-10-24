#!/usr/bin/env node
// « Caractère… » (js/character-format.js, ligne du menu Alignement : espacement des caractères et petites capitales ; chantier 9a de « Import PowerPoint sans perte ») : le panneau de 700x400 d'Antoine, à la VRAIE
// souris (page.mouse) et au vrai clavier, en clair, en sombre et en anglais. Ce que scenarios-character-format.js ne peut pas voir depuis la page :
//  - au survol de l'icône Alignement, le volet s'ouvre dans le panneau et sa ligne « Caractère… » est visible, au premier plan, lisible, avec son nom (français, anglais), sous « Paragraphe… » ;
//  - un vrai clic sur la ligne ouvre la fenêtre : titre, deux réglages, indication et boutons tiennent dans le panneau, l'espacement a le clavier et sa valeur est sélectionnée ;
//  - un mot choisi au double-clic reçoit, par la frappe (2,5 / 2.5 selon la langue, Tab, Espace, Entrée), son espacement et ses petites capitales, que l'éditeur dessine (letter-spacing, font-variant) ; seul ce mot ;
//  - UN Ctrl+Z défait les deux d'un coup, Ctrl+Maj+Z les remet ; « Par défaut » les retire d'une seule étape ;
//  - une saisie qui n'est pas un nombre ou qui sort des bornes garde la fenêtre ouverte, dit pourquoi, grise « Valider » ; Échap ferme sans toucher au document ;
//  - une sélection aux valeurs mêlées : l'espacement reste vide et dit « Plusieurs valeurs », la case est mêlée ; ne changer que la case ne touche pas à l'espacement de chacun ;
//  - curseur seul : la fenêtre règle le style de frappe, le texte tapé ensuite le porte.
// Lancé par run-headless.mjs (groupe Node "characterFormatMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-character-format-mouse.mjs
// CHARACTER_FORMAT_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.CHARACTER_FORMAT_MOUSE_PORT || 8962);
const SHOTS = process.env.CHARACTER_FORMAT_SHOTS || '';
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
if (!OFFLINE) console.log('[verify-character-format-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
page.on('console', m => { if ((m.type() === 'warning' || m.type() === 'error') && /TextSelection|Invalid content|RangeError|characterFormat|character-format/i.test(m.text())) consoleProblems.push(m.text()); });
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


const ROW = '#v2-btn-character';
const MAIN = '#v2-btn-align-main';
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
  const previous = row.previousElementSibling;
  return { label: row.textContent.trim(), aria: row.getAttribute('aria-label'), tab: row.tabIndex, afterParagraph: !!previous && previous.id === 'v2-btn-paragraph' };
}, ROW);
const windowState = () => page.evaluate(({ width, height }) => {
  const overlay = document.getElementById('pp-charfmt-modal');
  if (!overlay) return { shown: false };
  const shown = overlay.style.display !== 'none';
  const seenIn = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.left < -0.5 || r.top < -0.5 || r.right > width + 0.5 || r.bottom > height + 0.5) return false;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  };
  const spacing = document.getElementById('pp-charfmt-spacing');
  const caps = document.getElementById('pp-charfmt-caps');
  const box = overlay.querySelector('.pp-modal-box');
  const buttons = Array.from(overlay.querySelectorAll('.pp-modal-actions button'));
  const error = document.getElementById('pp-charfmt-error');
  const hint = document.getElementById('pp-charfmt-hint');
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
    fieldsIn: shown && seenIn(spacing) && seenIn(caps),
    labels: Array.from(overlay.querySelectorAll('.pp-parafmt-label')).map(l => l.textContent.trim()),
    spacing: spacing.value,
    placeholder: spacing.placeholder,
    caps: caps.checked,
    mixedCaps: caps.indeterminate,
    invalid: spacing.getAttribute('aria-invalid') === 'true',
    focus: active && active.id,
    selected: active === spacing ? spacing.selectionStart === 0 && spacing.selectionEnd === spacing.value.length && spacing.value.length > 0 : false,
    error: error.hidden ? '' : error.textContent.trim(),
    hint: hint.textContent.trim(),
    hintIn: shown && seenIn(hint),
    okDisabled: ok.disabled,
    scrolls: body.scrollHeight > body.clientHeight + 1,
  };
}, { width: WIDTH, height: HEIGHT });
const caret = () => page.evaluate(() => {
  const sel = EditorCore.getEditor().state.selection;
  return { text: sel.$from.parent.textContent, empty: sel.empty, focus: !!document.activeElement && !!document.activeElement.closest('.tiptap') };
});
// Ce que l'éditeur dessine d'un mot : son espacement (pt), ses petites capitales.
const looks = word => page.evaluate((needle) => {
  const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n.textContent.indexOf(needle) < 0) continue;
    const cs = getComputedStyle(n.parentElement);
    return { spacing: cs.letterSpacing === 'normal' ? 0 : Math.round(parseFloat(cs.letterSpacing) * 0.75 * 100) / 100, caps: cs.fontVariantCaps, text: n.textContent };
  }
  return null;
}, word);
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
const selectedText = () => page.evaluate(() => { const s = EditorCore.getEditor().state; return s.doc.textBetween(s.selection.from, s.selection.to, ' '); });
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
async function selectWord(text) {
  const p = await pointOf(text, 0.5);
  await page.mouse.dblclick(p.x, p.y);
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
    const button = Array.from(document.querySelectorAll('#pp-charfmt-modal .pp-modal-actions button')).find(b => b.textContent.trim() === text);
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

const DOC = '<p>Bonjour tout le monde</p><p>Autre ligne</p>';

async function run(theme) {
  const T = theme;
  const en = (await page.evaluate(() => I18n.getLang())) === 'en';
  const point = en ? '.' : ',';
  const texts = en
    ? { row: 'Character…', aria: 'Character: letter spacing and small capitals', title: 'Character', labels: ['Spacing', 'Small capitals'], buttons: ['Default', 'Cancel', 'Confirm'], mixed: 'Several values', numberError: 'Enter a number, for example 1.5.', rangeError: /^The spacing must be between -50 and 500 pt\.$/ }
    : { row: 'Caractère…', aria: 'Caractère : espacement des caractères et petites capitales', title: 'Caractère', labels: ['Espacement', 'Petites capitales'], buttons: ['Par défaut', 'Annuler', 'Valider'], mixed: 'Plusieurs valeurs', numberError: 'Saisissez un nombre, par exemple 1,5.', rangeError: /^L’espacement doit être compris entre -50 et 500 pt\.$/ };

  // 1) Le menu : un survol réel de l'icône ouvre le volet, la ligne y est, dans le panneau, au premier plan, sous « Paragraphe… », avec son nom.
  await setDoc(DOC);
  await selectWord('Bonjour');
  check(`${T}, sélection : le double-clic choisit « Bonjour »`, (await selectedText()) === 'Bonjour', await selectedText());
  await openMenu();
  const rowBox = await hit(ROW);
  const s1 = await rowState();
  check(`${T}, menu : au survol, la ligne « ${texts.row} » est dans le panneau ${WIDTH}x${HEIGHT}, au premier plan`, seen(rowBox), rowBox);
  check(`${T}, menu : la ligne s'appelle « ${texts.row} » (nom accessible complet), juste sous « Paragraphe… », dans l'ordre des tabulations`, s1.label === texts.row && s1.aria === texts.aria && s1.tab === 0 && s1.afterParagraph, s1);
  await snap(`${T}-1-menu`);
  await closeMenu();

  // 2) Un vrai clic : la fenêtre s'ouvre entière dans le panneau, sur les valeurs d'origine (0 pt, case décochée), le champ au clavier et sélectionné.
  const before = await html();
  await pressRow();
  const w2 = await windowState();
  check(`${T}, fenêtre : un clic sur la ligne ouvre « ${texts.title} » ; sa boîte, son titre, ses deux réglages, l'indication et ses trois boutons tiennent dans le panneau, au premier plan, sans défilement`,
    w2.shown && w2.title === texts.title && w2.boxIn && w2.titleIn && w2.fieldsIn && w2.hintIn && w2.buttonsIn && !w2.scrolls, w2);
  check(`${T}, fenêtre : libellés ${texts.labels.join(' / ')}, boutons ${texts.buttons.join(' / ')}`, JSON.stringify(w2.labels) === JSON.stringify(texts.labels) && JSON.stringify(w2.buttons) === JSON.stringify(texts.buttons), w2);
  check(`${T}, fenêtre : 0 pt et case décochée, l'espacement a le clavier et sa valeur est sélectionnée, rien en erreur`, w2.spacing === '0' && w2.caps === false && !w2.mixedCaps && w2.focus === 'pp-charfmt-spacing' && w2.selected && !w2.error && !w2.okDisabled, w2);
  check(`${T}, fenêtre : le document n'a pas bougé pendant l'ouverture`, (await html()) === before);
  await snap(`${T}-2-fenetre`);

  // 3) La frappe : 2,5 (2.5), Tab, Espace, Entrée. Les deux réglages sont posés sur « Bonjour » seul, la fenêtre se ferme, la sélection et le clavier sont dans le texte.
  await page.keyboard.type('2' + point + '5', { delay: 15 });
  await page.keyboard.press('Tab');
  const tab1 = await windowState();
  check(`${T}, clavier : Tab passe à la case « ${texts.labels[1]} »`, tab1.focus === 'pp-charfmt-caps' && tab1.spacing === '2' + point + '5', tab1);
  await page.keyboard.press('Space');
  check(`${T}, clavier : Espace coche la case`, (await windowState()).caps === true);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  const w3 = await windowState();
  check(`${T}, Entrée : la fenêtre se ferme`, !w3.shown);
  const bonjour = await looks('Bonjour');
  const reste = await looks(' tout le monde');
  check(`${T}, l'éditeur dessine « Bonjour » avec 2,5 pt entre les lettres et des petites capitales`, bonjour && bonjour.spacing === 2.5 && bonjour.caps === 'small-caps', bonjour);
  check(`${T}, le reste du paragraphe n'a ni l'un ni l'autre`, reste && reste.spacing === 0 && reste.caps === 'normal', reste);
  const written = await html();
  check(`${T}, le HTML dit letter-spacing: 2.5pt et font-variant: small-caps sur « Bonjour »`, /letter-spacing: 2\.5pt/.test(written) && /font-variant: small-caps/.test(written) && /Bonjour<\/span>/.test(written), written);
  const c3 = await caret();
  check(`${T}, retour à l'édition : « Bonjour » reste choisi et le clavier est dans le texte`, (await selectedText()) === 'Bonjour' && c3.focus, c3);
  await snap(`${T}-3-pose`);

  // 4) Un Ctrl+Z défait les deux d'un coup ; Ctrl+Maj+Z les remet.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const undone = await looks('Bonjour');
  check(`${T}, Ctrl+Z : UN seul retour défait l'espacement et les petites capitales`, undone && undone.spacing === 0 && undone.caps === 'normal' && (await html()) === before, undone);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(250);
  const redone = await looks('Bonjour');
  check(`${T}, Ctrl+Maj+Z : les deux reviennent`, redone && redone.spacing === 2.5 && redone.caps === 'small-caps', redone);

  // 5) Rouvrir : les valeurs de « Bonjour » ; « Par défaut » les retire d'une seule étape.
  await pressRow();
  const w5 = await windowState();
  check(`${T}, réouverture : la fenêtre montre 2${point}5 et la case cochée`, w5.shown && w5.spacing === '2' + point + '5' && w5.caps === true && !w5.mixedCaps, w5);
  await clickButton(texts.buttons[0]);
  const w5b = await windowState();
  check(`${T}, « ${texts.buttons[0]} » : les champs repassent à 0 et décoché sans fermer la fenêtre`, w5b.shown && w5b.spacing === '0' && w5b.caps === false, w5b);
  await clickButton(texts.buttons[2]);
  const gone = await looks('Bonjour');
  check(`${T}, « ${texts.buttons[2]} » : « Bonjour » redevient normal`, gone && gone.spacing === 0 && gone.caps === 'normal', gone);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const back = await looks('Bonjour');
  check(`${T}, Ctrl+Z : un seul retour rend l'espacement et les petites capitales`, back && back.spacing === 2.5 && back.caps === 'small-caps', back);

  // 6) Les erreurs : pas un nombre, hors bornes ; Échap ferme sans toucher au document.
  const stable = await html();
  await pressRow();
  await page.keyboard.type('abc', { delay: 10 });
  const bad1 = await windowState();
  check(`${T}, erreur : « abc » est refusé avec son message, le champ est marqué, « ${texts.buttons[2]} » est grisé`, bad1.shown && bad1.invalid && bad1.error === texts.numberError && bad1.okDisabled, bad1);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('900', { delay: 10 });
  const bad2 = await windowState();
  check(`${T}, erreur : 900 sort des bornes, le message les dit`, bad2.shown && bad2.invalid && texts.rangeError.test(bad2.error) && bad2.okDisabled, bad2);
  await page.keyboard.press('Enter');
  check(`${T}, erreur : Entrée ne ferme pas la fenêtre tant que la saisie est mauvaise`, (await windowState()).shown);
  await snap(`${T}-4-erreur`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(`${T}, Échap : la fenêtre se ferme, le document n'a pas bougé`, !(await windowState()).shown && (await html()) === stable);

  // 7) Valeurs mêlées : « Bonjour tout » (le premier mot espacé, le second non). L'espacement reste vide ; ne cocher que la case ne touche pas à l'espacement.
  const range = await page.evaluate(() => {
    const s = EditorCore.getEditor().state;
    let from = null;
    s.doc.descendants((node, pos) => { if (from === null && node.isText && node.text.indexOf('Bonjour') === 0) from = pos; });
    EditorCore.getEditor().commands.setTextSelection({ from, to: from + 'Bonjour tout'.length });
    return from;
  });
  await page.waitForTimeout(200);
  await pressRow();
  const w7 = await windowState();
  check(`${T}, valeurs mêlées : l'espacement est vide et dit « ${texts.mixed} », la case est mêlée`, w7.shown && w7.spacing === '' && w7.placeholder === texts.mixed && w7.mixedCaps, { w7, range });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  const w7b = await windowState();
  check(`${T}, valeurs mêlées : un Espace sur la case mêlée la coche (plus mêlée)`, w7b.caps === true && !w7b.mixedCaps, w7b);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  const a = await looks('Bonjour');
  const b = await looks(' tout');
  const c = await looks(' le monde');
  check(`${T}, valeurs mêlées : les deux mots choisis sont en petites capitales, « Bonjour » garde ses 2,5 pt, « tout » reste à 0 et la fin du paragraphe n'a pas bougé`, a && b && c && a.caps === 'small-caps' && b.caps === 'small-caps' && a.spacing === 2.5 && b.spacing === 0 && c.caps === 'normal', { a, b, c });

  // 8) Curseur seul : la fenêtre règle le style de frappe, le texte tapé ensuite le porte.
  await setDoc('<p>Fin</p>');
  await clickText('Fin', 0.99);
  await page.keyboard.press('End');
  await pressRow();
  await page.keyboard.type('1' + point + '5', { delay: 10 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.type(' Suite', { delay: 20 });
  await page.waitForTimeout(250);
  const typed = await looks(' Suite');
  const fin = await looks('Fin');
  check(`${T}, curseur seul : le texte tapé ensuite a 1,5 pt entre les lettres, le texte d'avant n'a pas bougé`, typed && typed.spacing === 1.5 && fin && fin.spacing === 0, { typed, fin });
  await closeMenu();
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
