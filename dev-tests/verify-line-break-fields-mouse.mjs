#!/usr/bin/env node
// Un retour à la ligne dans « Texte avant » / « Texte après » de la fenêtre Condition et dans les séparateurs des fenêtres Boucle et Liste (js/grow-text.js, `lines`), demande d'Antoine du 24/11 (« y a-t-il un
// moyen de mettre un retour à la ligne ? », sa réponse à la carte : « Maj+Entrée dans le champ »), à 700x400, à la VRAIE souris et au vrai clavier. Fermé et vide, le champ est une zone de texte d'UNE ligne de 26 px ;
// Maj+Entrée y pose un retour : le champ s'ouvre sur ses deux lignes, sur place, sans fermer ni valider la fenêtre, et reste ouvert quand le focus le quitte ; Entrée seule n'en pose pas ; la longueur permise
// compte le retour ; l'aperçu de la fenêtre le montre « ↵ » ; Enregistrer garde un « \n » dans la bulle (la pastille de l'éditeur le montre « ↵ »), la fenêtre rouverte rend le champ ouvert ; la Lecture écrit un vrai
// retour (<br>) ; Ctrl+Z le défait. En français clair puis en anglais sombre.
// Lancé par run-headless.mjs (groupe Node "lineBreakFieldsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-line-break-fields-mouse.mjs
// LINE_BREAK_FIELDS_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.LINE_BREAK_FIELDS_MOUSE_PORT || 9523);
const SHOTS = process.env.LINE_BREAK_FIELDS_SHOTS || '';
const WIDTH = 700;
const HEIGHT = 400;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-simple-fields-grow-mouse.mjs.
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
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfmake@[\d.]+\/build\/vfs_fonts\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@[\d.]+\/dist\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-line-break-fields-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
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

// Centre d'un élément (amené dans la vue), vrai déplacement puis vrai clic.
async function centerOf(selector) {
  return page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, onTop: !!top && (top === e || e.contains(top)) };
  }, selector);
}
async function realClick(selector, wait = 300) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
async function realHover(selector) {
  const c = await centerOf(selector);
  if (!c) throw new Error('introuvable : ' + selector);
  await page.mouse.move(c.x - 30, c.y + 5, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(450);
}
const statusText = () => page.evaluate(() => document.getElementById('status-msg').textContent.trim());


const SHOT = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
const typeSlow = async (text, delay = 3) => { await page.keyboard.type(text, { delay }); await page.waitForTimeout(300); };
const pressKey = async (key, wait = 250) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };
const park = () => page.mouse.move(400, 330);


const PAGE = 'LbFactures';
const PEOPLE = 'LbParticipants';
const attr = (name, value) => ` ${name}="${(typeof value === 'string' ? value : JSON.stringify(value)).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
const badge = (table, column, extra = '') => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${extra}></span>`;
const INLINE = { repeat: 'inline', table: PEOPLE, empty: 'hide', separator: ', ', lastSeparator: ' et ' };

async function seed() {
  await page.evaluate(async ({ PAGE, PEOPLE }) => {
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setVariables(PEOPLE, { Facture: 'Ref:' + PAGE, Nom: 'Text' });
    stub.setVariables(PAGE, { Numero: 'Text', Themes: 'ChoiceList' });
    stub.setRows(PAGE, [{ id: 1, Numero: 'F-041', Themes: ['L', 'Santé', 'Social', 'Culture'] }]);
    stub.setRows(PEOPLE, [{ id: 1, Facture: 1, Nom: 'Karim' }, { id: 2, Facture: 1, Nom: 'Léa' }, { id: 3, Facture: 1, Nom: 'Sophie' }]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(PEOPLE);
    await GristAPI.saveLinkRule(PEOPLE, { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Numero: 'F-041', Themes: ['Santé', 'Social', 'Culture'] }, PAGE);
  }, { PAGE, PEOPLE });
  await page.waitForTimeout(300);
}

// Sélectionne la bulle visée, puis clique VRAIMENT sur le bouton `action` de sa barre flottante.
async function openFrom(action, windowId) {
  await park();
  const pos = await page.evaluate(() => { const dom = document.querySelector('.tiptap .var-badge'); return dom ? EditorCore.getEditor().view.posAtDOM(dom, 0) : null; });
  if (pos == null) throw new Error('bulle introuvable');
  const BTN = `.v2-varfmt-toolbar.visible button[data-action="${action}"]`;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(p => { document.querySelector('.tiptap').focus(); EditorCore.getEditor().commands.setNodeSelection(p); }, pos);
    await page.waitForTimeout(250);
    if (await page.evaluate(sel => !!document.querySelector(sel), BTN)) break;
  }
  await realClick(BTN, 700);
  if (!(await windowShown('#' + windowId))) throw new Error('fenêtre fermée : ' + windowId);
}
const windowShown = modal => page.evaluate(m => { const e = document.querySelector(m); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, modal);
// Ouvre le repli « Plus d'options » de la fenêtre s'il est fermé (un vrai clic sur son titre).
async function openFold(windowId) {
  const closed = await page.evaluate(id => { const d = document.querySelector('#' + id + ' details.var-fold'); return !!d && !d.open; }, windowId);
  if (closed) await realClick(`#${windowId} details.var-fold > summary`, 300);
}
// Amène le champ dans la zone visible de la fenêtre (le résultat collé couvre le bas), sans bouger la souris.
const reach = id => page.evaluate(i => document.getElementById(i).scrollIntoView({ block: 'center' }), id).then(() => page.waitForTimeout(150));

const field = (id, modal) => page.evaluate(({ id, modal }) => {
  const box = document.getElementById(id);
  const r = box.getBoundingClientRect();
  const win = document.querySelector(modal + ' .pp-modal-box, ' + modal + ' .var-modal-content') || document.querySelector(modal);
  const w = win.getBoundingClientRect();
  return {
    tag: box.tagName, open: box.classList.contains('is-open'), focused: document.activeElement === box, value: box.value, multiline: box.getAttribute('aria-multiline'),
    width: r.width, height: r.height, left: r.left, right: r.right, insideWindow: r.left >= w.left - 0.5 && r.right <= w.right + 0.5, sideScroll: document.documentElement.scrollWidth > innerWidth + 0.5,
    maxLength: box.maxLength, lines: box.value.split('\n').length, scrollsInside: box.scrollHeight > box.clientHeight + 1,
    bodyOverflow: (() => { const b = box.closest('.pp-modal-body'); return !!b && b.scrollWidth > b.clientWidth + 1; })(),
  };
}, { id, modal });
const previewText = modal => page.evaluate(m => Array.from(document.querySelectorAll(m + ' .var-result span, ' + m + ' .var-condition-debug span')).map(e => e.textContent).join(' | '), modal);

// Le champ `id` de la fenêtre `modal` : tout ce que Maj+Entrée y change, jusqu'à l'aperçu.
async function lineChecks(T, name, id, modal, tag, first, second) {
  await reach(id);
  const closed = await field(id, modal);
  check(`${T}, ${name} : fermé et vide, une zone de texte d'une ligne de ${Math.round(closed.height)} px (26), annoncée comme un champ de plusieurs lignes`, closed.tag === 'TEXTAREA' && !closed.open && closed.height === 26 && closed.multiline === 'true', closed);
  await realClick(`#${id}`, 200);
  await typeSlow(first);
  await pressKey('Shift+Enter', 200);
  await typeSlow(second);
  const typed = await field(id, modal);
  await SHOT(`${tag}-ouvert`);
  check(`${T}, ${name} : Maj+Entrée pose un retour à la ligne : la valeur est « ${first}\\n${second} », le champ s'ouvre SUR PLACE sur ses deux lignes, entier dans la fenêtre, sans défilement de côté`,
    typed.value === first + '\n' + second && typed.open && typed.focused && typed.height > closed.height + 10 && typed.height < 80 && Math.abs(typed.width - closed.width) < 1 && Math.abs(typed.left - closed.left) < 1 && typed.insideWindow && !typed.sideScroll && !typed.bodyOverflow, { closed, typed });
  check(`${T}, ${name} : la fenêtre n'est ni fermée ni validée par Maj+Entrée`, await windowShown(modal));
  const before = typed.value;
  await pressKey('Enter', 250);
  const enter = await field(id, modal);
  check(`${T}, ${name} : Entrée seule ne pose pas de retour à la ligne (la valeur est la même, la fenêtre reste ouverte)`, enter.value === before && await windowShown(modal), enter);
  await page.waitForTimeout(350);
  const preview = await previewText(modal);
  check(`${T}, ${name} : l'aperçu de la fenêtre montre le retour « ↵ » et jamais un retour réel`, preview.includes('↵') && !/[\n\u2028]/.test(preview), preview);
  await pressKey('Tab', 300);
  const blurred = await field(id, modal);
  check(`${T}, ${name} : le focus quitte le champ : il reste OUVERT sur ses deux lignes (le texte caché sur une ligne fermée ne se verrait pas), la valeur est gardée`, !blurred.focused && blurred.open && Math.abs(blurred.height - typed.height) < 1 && blurred.value === before, blurred);
  return { closed, typed };
}

// Maj+Entrée respecte la longueur permise (le retour compte un signe) : 40 signes au plus pour « Avant » / « Après ».
async function maxChecks(T, name, id, modal) {
  await reach(id);
  await realClick(`#${id}`, 150);
  await pressKey('Control+a', 100); await pressKey('Delete', 150);
  for (let i = 0; i < 12; i++) { await page.keyboard.type('abc', { delay: 1 }); await page.keyboard.press('Shift+Enter'); }
  await page.waitForTimeout(250);
  const state = await field(id, modal);
  check(`${T}, ${name} : la longueur permise (${state.maxLength}) compte le retour : douze fois « abc » + retour s'arrêtent à ${state.maxLength} signes`, state.value.length === state.maxLength && state.value.startsWith('abc\nabc\n') && state.lines >= 9 && state.height <= 110, state);
  await pressKey('Control+a', 100); await pressKey('Delete', 150);
}

async function run(theme, lang) {
  const T = `${theme}/${lang}`;
  const tag = `${theme}-${lang}`;
  await seed();

  // 1) Fenêtre Condition : « Texte avant » et « Texte après ».
  await page.evaluate(html => Editor.setHTML(html), `<p>Facture : ${badge(PAGE, 'Numero')} fin</p>`);
  await page.waitForTimeout(400);
  await openFrom('var-condition', 'var-condition-modal');
  await openFold('var-condition-modal');
  await lineChecks(T, 'Texte avant', 'var-condition-before', '#var-condition-modal', `${tag}-1-avant`, 'Cher', 'client');
  await maxChecks(T, 'Texte avant', 'var-condition-before', '#var-condition-modal');
  await realClick('#var-condition-before', 150);
  await pressKey('Control+a', 100); await pressKey('Delete', 150);
  await typeSlow('Cher'); await pressKey('Shift+Enter', 150); await typeSlow('client');
  await lineChecks(T, 'Texte après', 'var-condition-after', '#var-condition-modal', `${tag}-1-apres`, '(à régler', 'avant le 30)');
  // Ctrl+Z défait le retour (l'historique du champ).
  await realClick('#var-condition-after', 150);
  await pressKey('End', 100);
  await pressKey('Control+z', 200); await pressKey('Control+z', 200);
  const undone = await field('var-condition-after', '#var-condition-modal');
  check(`${T}, Texte après : Ctrl+Z défait la frappe, le retour à la ligne compris`, undone.value.indexOf('\n') === -1 || undone.value.length < '(à régler\navant le 30)'.length, undone);
  await pressKey('Control+y', 150);
  await pressKey('Control+Shift+z', 150);
  await realClick('#var-condition-after', 150);
  await pressKey('Control+a', 100); await pressKey('Delete', 150);
  await typeSlow('(à régler'); await pressKey('Shift+Enter', 150); await typeSlow('avant le 30)');
  await park();
  await realClick('#var-condition-modal .var-modal-primary', 500);
  check(`${T}, « Enregistrer » ferme la fenêtre`, !(await windowShown('#var-condition-modal')));
  const saved = await page.evaluate(() => { let node = null; EditorCore.getEditor().state.doc.descendants(n => { if (!node && n.type.name === 'varBadge') node = n; }); const chips = Array.from(document.querySelectorAll('.tiptap .var-badge-affix')).map(c => c.getAttribute('data-text')); return { before: node.attrs.before, after: node.attrs.after, chips, html: Editor.getHTML() }; });
  check(`${T}, la bulle garde « Cher\\nclient » et « (à régler\\navant le 30) » ; la pastille de l'éditeur les montre « ↵ »`, saved.before === 'Cher\nclient' && saved.after === '(à régler\navant le 30)' && saved.chips.join('|') === 'Cher↵client|(à régler↵avant le 30)', saved);
  await SHOT(`${tag}-1-pastille`);
  const reading = await page.evaluate(async () => { const tpl = Editor.getHTML(); const out = Dom.inertTemplate(await ReaderMode.preview(tpl, 'LbFactures', { id: 1, Numero: 'F-041' })).content; const span = out.querySelector('.resolved-var'); return { brs: span.querySelectorAll('br').length, text: span.textContent, html: span.innerHTML }; });
  check(`${T}, la Lecture écrit les deux retours (<br>) autour de la valeur`, reading.brs === 2 && reading.text === 'Cherclient' + 'F-041' + '(à régleravant le 30)', reading);
  // La fenêtre rouverte : le repli s'ouvre, les deux champs sont ouverts sur leurs lignes, SANS le focus.
  await openFrom('var-condition', 'var-condition-modal');
  await reach('var-condition-before');
  const again = await Promise.all([field('var-condition-before', '#var-condition-modal'), field('var-condition-after', '#var-condition-modal')]);
  await SHOT(`${tag}-1-rouvert`);
  check(`${T}, la fenêtre rouverte rend « Texte avant » et « Texte après » ouverts sur leurs deux lignes, sans le focus`, again.every(f => f.open && !f.focused && f.height > 36 && f.lines === 2) && again[0].value === 'Cher\nclient' && again[1].value === '(à régler\navant le 30)', again);
  await pressKey('Escape', 400);

  // 2) Fenêtre Boucle : les séparateurs d'une boucle « dans la phrase ».
  await page.evaluate(html => Editor.setHTML(html), `<p>Participants : ${badge(PEOPLE, 'Nom', attr('data-loop', INLINE) + ' data-loop-repeat="inline"')}.</p>`);
  await page.waitForTimeout(500);
  await openFrom('var-loop', 'var-loop-modal');
  await openFold('var-loop-modal');
  await page.evaluate(() => { const e = document.getElementById('var-loop-sep'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await lineChecks(T, 'Séparateur de la boucle', 'var-loop-sep', '#var-loop-modal', `${tag}-2-boucle`, ';', ' ');
  await realClick('#var-loop-sep', 150);
  await pressKey('Control+a', 100); await pressKey('Delete', 150);
  await pressKey('Shift+Enter', 200);
  const alone = await field('var-loop-sep', '#var-loop-modal');
  check(`${T}, Séparateur de la boucle : un retour à la ligne SEUL est un séparateur valide, le champ s'ouvre sur ses deux lignes`, alone.value === '\n' && alone.open && alone.height > 36, alone);
  await page.waitForTimeout(450);
  const loopPreview = await previewText('#var-loop-modal');
  check(`${T}, l'aperçu de la boucle écrit « Karim↵Léa et Sophie »`, loopPreview.includes('Karim↵Léa et Sophie'), loopPreview);
  await SHOT(`${tag}-2-boucle-apercu`);
  await park();
  await realClick('#var-loop-modal .var-modal-primary', 500);
  const loopSaved = await page.evaluate(() => { let node = null; EditorCore.getEditor().state.doc.descendants(n => { if (!node && n.type.name === 'varBadge') node = n; }); return node.attrs.loop; });
  check(`${T}, la boucle garde « \\n » comme séparateur`, !!loopSaved && loopSaved.separator === '\n' && loopSaved.lastSeparator === ' et ', loopSaved);
  const loopReading = await page.evaluate(async () => { const out = Dom.inertTemplate(await ReaderMode.preview(Editor.getHTML(), 'LbFactures', { id: 1, Numero: 'F-041' })).content; const span = out.querySelector('.resolved-var'); return { brs: span.querySelectorAll('br').length, text: span.textContent, sign: /\u2028/.test(out.textContent) }; });
  check(`${T}, la Lecture met « Karim », « Léa et Sophie » sur deux lignes (un <br>) sans jamais écrire le signe interne`, loopReading.brs === 1 && loopReading.text === 'KarimLéa et Sophie' && !loopReading.sign, loopReading);

  // 3) Fenêtre Liste : les séparateurs d'une colonne Liste de choix.
  await page.evaluate(html => Editor.setHTML(html), `<p>Thèmes : ${badge(PAGE, 'Themes')}.</p>`);
  await page.waitForTimeout(500);
  await openFrom('var-list', 'var-list-modal');
  // Le champ s'ouvre sur « , » (le séparateur d'origine) : un vrai clic, tout effacer.
  await realClick('#var-list-sep', 150);
  await pressKey('Control+a', 100); await pressKey('Delete', 150);
  await lineChecks(T, 'Séparateur de la liste', 'var-list-sep', '#var-list-modal', `${tag}-3-liste`, '/', 'x');
  await realClick('#var-list-sep', 150);
  await pressKey('Control+a', 100); await pressKey('Delete', 150);
  await pressKey('Shift+Enter', 200);
  await page.waitForTimeout(450);
  const listPreview = await previewText('#var-list-modal');
  check(`${T}, l'aperçu de la liste écrit « Santé↵Social↵Culture »`, listPreview.includes('Santé↵Social↵Culture'), listPreview);
  await SHOT(`${tag}-3-liste-apercu`);
  await park();
  await realClick('#var-list-modal .var-modal-primary', 500);
  const listSaved = await page.evaluate(() => { let node = null; EditorCore.getEditor().state.doc.descendants(n => { if (!node && n.type.name === 'varBadge') node = n; }); return node.attrs.format; });
  check(`${T}, la liste garde « \\n » comme séparateur`, !!listSaved && !!listSaved.list && listSaved.list.separator === '\n', listSaved);
  const listReading = await page.evaluate(async () => { const out = Dom.inertTemplate(await ReaderMode.preview(Editor.getHTML(), 'LbFactures', { id: 1, Numero: 'F-041', Themes: ['Santé', 'Social', 'Culture'] })).content; const span = out.querySelector('.resolved-var'); return { brs: span.querySelectorAll('br').length, text: span.textContent }; });
  check(`${T}, la Lecture écrit chaque thème sur sa ligne (deux <br>)`, listReading.brs === 2 && listReading.text === 'SantéSocialCulture', listReading);
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

await run('light', 'fr');
await restartIn('en');
await page.evaluate(() => Settings.setTheme('dark'));
await page.waitForTimeout(250);
await run('dark', 'en');

check('aucune boîte native (prompt, confirm, alert) ne s’est ouverte', nativeDialogs.length === 0, nativeDialogs);
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
