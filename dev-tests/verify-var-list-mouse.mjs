#!/usr/bin/env node
// Fenêtre « Liste » d'une variable (js/variable-list.js, bouton « Liste » de la barre flottante, js/floating-toolbars.js), à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard,
// Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en clair, en sombre et en anglais : les scénarios de dev-tests/scenarios-var-list.js tournent DANS la page
// (dispatchEvent), ils ne prouvent ni qu'un vrai clic atteint le bouton ni que la fenêtre tient dans un panneau bas (titre et boutons visibles), ni que le numéro se tape au clavier.
//  - un clic sur une bulle Liste de choix ouvre la barre : le bouton « Liste » est entre « Boucle » et « Colonne », atteignable, au premier plan, la barre entière dans le panneau ;
//  - un vrai clic sur le bouton ouvre la fenêtre : cadre, titre et boutons Annuler / Enregistrer entiers dans 700x400, les quatre choix et le champ du numéro atteignables ;
//  - « La n-ième » puis un numéro tapé au clavier, « Toutes les valeurs » puis deux séparateurs tapés : l'aperçu dit ce que le document écrira ;
//  - Enregistrer ferme la fenêtre, la barre revient avec le bouton bleu, la bulle porte son point bleu, la Lecture écrit la liste telle que réglée ;
//  - une bulle qui n'est pas une liste : bouton grisé, un vrai clic dessus n'ouvre rien ; « Remettre par défaut » et Échap (vrai clavier) ;
//  - la case « Un document par valeur » : un vrai clic sur son libellé (ou sur la case) la coche, la barre d'espace la bascule, l'aperçu gagne une seconde ligne (le nombre de documents de la ligne),
//    la fenêtre garde titre et boutons visibles dans 700x400, Enregistrer l'écrit (perValue) et la bulle porte sa petite icône ; décochée puis enregistrée, plus aucun réglage ;
//  - en anglais les quatre choix, les champs et la case tiennent dans la fenêtre sans déborder.
// Lancé par run-headless.mjs (groupe Node "varListMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-var-list-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.VAR_LIST_MOUSE_PORT || 8916);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-var-toolbar-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-var-list-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const nativeDialogs = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
page.on('dialog', async d => { nativeDialogs.push(d.type() + ': ' + d.message()); await d.dismiss(); });
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

const TABLE = 'VlProjets';
const BADGE = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
const DOC = `<p>Thèmes : ${BADGE('Themes')} · Titre : ${BADGE('Titre')}</p>`;
// La ligne de la page : une liste de choix à trois valeurs (ce que grist.onRecord livre : un tableau).
const RECORD = { id: 1, Titre: 'Alpha', Themes: ['Santé', 'Social', 'Culture'] };
await page.evaluate(async ({ table, record }) => {
  const stub = window.__gristStub;
  stub.setVariables(table, { Titre: 'Text', Themes: 'ChoiceList' });
  stub.setRows(table, [{ id: 1, Titre: 'Alpha', Themes: ['L', 'Santé', 'Social', 'Culture'] }]);
  await GristAPI.refreshSchema();
  stub.fireRecord(record, table);
}, { table: TABLE, record: RECORD });
await page.waitForTimeout(200);

const SHOTS = process.env.VAR_LIST_SHOTS || '';
async function shot(name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// Centre d'un élément, entièrement dans le panneau ?, au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ?
async function hitTest(selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      found: true, x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height,
      inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      onTop: !!top && (top === el || el.contains(top)),
    };
  }, selector);
}
// Vrai geste : la souris arrive à quelques pixels du centre puis le rejoint en trois pas (survol compris), puis clique. Le premier saut est direct : partie du coin de la page, la souris
// survolerait les menus de la barre d'outils en chemin et l'un d'eux s'ouvrirait par-dessus la bulle.
async function realClick(box) {
  await page.mouse.move(box.x - 12, box.y);
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(200);
}
const clickSel = async selector => { const b = await hitTest(selector); if (b.found) await realClick(b); return b; };

const BAR = '.v2-varfmt-toolbar.visible';
const LIST_BUTTON = `${BAR} button[data-action="var-list"]`;
const MODAL = '#var-list-modal';
const PICK = pick => `${MODAL} .var-loop-seg button[data-pick="${pick}"]`;
const SPLIT_LABEL = `${MODAL} label[for="var-list-split"]`;
const SPLIT_BOX = `${MODAL} #var-list-split`;
// Le réglage d'une bulle du document (null = aucun).
const formatOf = column => page.evaluate(col => { let found; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge' && n.attrs.column === col) found = n.attrs.format; }); return found === undefined ? 'absente' : found; }, column);
const barState = () => page.evaluate(() => {
  const bar = document.querySelector('.v2-varfmt-toolbar');
  const button = bar.querySelector('button[data-action="var-list"]');
  const order = Array.from(bar.querySelectorAll('.v2-varbadge-actions button')).map(b => b.getAttribute('data-action'));
  const r = bar.getBoundingClientRect();
  return { visible: bar.classList.contains('visible'), order, active: button.classList.contains('is-active'), disabled: button.getAttribute('aria-disabled') === 'true', title: button.title, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
});
const modalState = () => page.evaluate(() => {
  const overlay = document.getElementById('var-list-modal');
  if (!overlay) return { shown: false };
  const box = overlay.querySelector('.pp-modal-box');
  const body = overlay.querySelector('.pp-modal-body');
  const r = box.getBoundingClientRect();
  const field = sel => overlay.querySelector(sel);
  return {
    shown: overlay.style.display !== 'none' && r.width > 0,
    left: r.left, right: r.right, top: r.top, bottom: r.bottom, overflowX: box.scrollWidth - box.clientWidth, bodyOverflowX: body.scrollWidth - body.clientWidth,
    scrolls: body.scrollHeight > body.clientHeight + 1,
    sepTop: Math.round(overlay.querySelector('#var-list-sep').getBoundingClientRect().top), lastTop: Math.round(overlay.querySelector('#var-list-last').getBoundingClientRect().top),
    picks: Array.from(overlay.querySelectorAll('.var-loop-seg button')).map(b => [b.dataset.pick, b.getAttribute('aria-pressed'), b.textContent]),
    sepRow: !field('.var-list-seps').hidden, numRow: !field('.var-list-number').hidden,
    sep: field('#var-list-sep').value, last: field('#var-list-last').value, index: field('#var-list-index').value,
    reset: !field('.var-modal-danger').hidden, preview: field('.var-condition-debug-line').textContent,
    splitChecked: field('#var-list-split').checked, splitLabel: field('label[for="var-list-split"]').textContent, splitHint: field('.var-list-split .var-loop-hint').textContent,
    lines: Array.from(overlay.querySelectorAll('.var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent),
    focus: document.activeElement ? (document.activeElement.id || document.activeElement.dataset.pick || document.activeElement.tagName) : null,
  };
});
// Le texte se tape comme une personne : un clic dans le champ, tout sélectionné, la frappe.
async function typeInto(selector, text) {
  const b = await clickSel(selector);
  await page.keyboard.press('Control+A');
  if (text === '') await page.keyboard.press('Backspace'); else await page.keyboard.type(text);
  await page.waitForTimeout(450);
  return b;
}

async function run(theme) {
  const T = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Fenêtre « Liste » à la vraie souris, ${WIDTH}x${HEIGHT}, thème ${T} ===`);
  await page.evaluate(doc => { Editor.setHTML(doc); }, DOC);
  await page.waitForTimeout(250);

  // 1) Un vrai clic sur la bulle : la barre, avec le bouton « Liste » entre « Boucle » et « Colonne ».
  const badge = await clickSel('.tiptap .var-badge[data-column="Themes"]');
  check(`${T} - la bulle Liste de choix se trouve et se clique`, badge.found && badge.inViewport, badge);
  const bar = await barState();
  check(`${T} - clic sur la bulle : barre ouverte, entière dans le panneau, bouton « Liste » entre « Boucle » et « Colonne », ni grisé ni bleu`,
    bar.visible && bar.left >= 0 && bar.right <= WIDTH + 0.5 && bar.top >= 0 && JSON.stringify(bar.order.slice(-3)) === JSON.stringify(['var-loop', 'var-list', 'var-column']) && !bar.disabled && !bar.active, bar);
  const button = await hitTest(LIST_BUTTON);
  check(`${T} - le bouton « Liste » est dans le panneau, au premier plan et assez grand pour un vrai clic (au moins 24 px)`, button.found && button.inViewport && button.onTop && button.w >= 24 && button.h >= 24, button);
  await shot(`${theme}-1-barre`);

  // 2) Un vrai clic sur le bouton : la fenêtre, entière dans le panneau, titre et boutons visibles.
  await realClick(button);
  await page.waitForTimeout(350);
  const opened = await modalState();
  check(`${T} - vrai clic sur « Liste » : la fenêtre s'ouvre, entière dans le panneau, sans défilement horizontal`, opened.shown && opened.left >= 0 && opened.right <= WIDTH + 0.5 && opened.top >= 0 && opened.bottom <= HEIGHT + 0.5 && opened.overflowX <= 1 && opened.bodyOverflowX <= 1, opened);
  check(`${T} - la barre de la bulle est masquée tant que la fenêtre est ouverte`, !(await barState()).visible);
  const title = await hitTest(`${MODAL} #var-list-title`);
  const save = await hitTest(`${MODAL} .var-modal-primary`);
  const cancel = await hitTest(`${MODAL} .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)`);
  check(`${T} - le titre et les boutons Annuler / Enregistrer sont visibles, au premier plan`, [title, save, cancel].every(b => b.found && b.inViewport && b.onTop), { title, save, cancel });
  check(`${T} - ouverte : « Toutes les valeurs » enfoncé, séparateur « , », champ du numéro caché, pas de « Remettre par défaut », aperçu de la ligne`,
    opened.picks[0][1] === 'true' && opened.picks.slice(1).every(p => p[1] === 'false') && opened.sepRow && !opened.numRow && opened.sep === ', ' && !opened.reset
    && opened.preview === 'Ligne sélectionnée (n° 1) : 3 valeurs (Santé, Social, Culture). Le document écrit « Santé, Social, Culture ».', opened);
  check(`${T} - ouverte (case décochée) : la fenêtre tient dans le panneau SANS défilement - l'aperçu est entier - et les deux séparateurs sont sur une seule ligne`, !opened.scrolls && opened.sepTop === opened.lastTop, opened);
  const picks = {};
  for (const p of ['all', 'first', 'last', 'nth']) picks[p] = await hitTest(PICK(p));
  check(`${T} - les quatre choix sont dans la fenêtre, au premier plan et assez grands (au moins 24 px de haut)`, Object.values(picks).every(b => b.found && b.inViewport && b.onTop && b.h >= 24), picks);
  await shot(`${theme}-2-fenetre`);

  // 3) Vrais clics sur les choix : première, dernière, puis n-ième avec un numéro tapé.
  await clickSel(PICK('first'));
  const first = await modalState();
  check(`${T} - clic sur « La première » : ce bouton seul est enfoncé, plus de séparateur, aperçu « Santé »`, first.picks[1][1] === 'true' && first.picks.filter(p => p[1] === 'true').length === 1 && !first.sepRow && !first.numRow && first.preview.endsWith('Le document écrit « Santé ».'), first);
  await clickSel(PICK('nth'));
  const nthOpen = await modalState();
  const numberBox = await hitTest(`${MODAL} #var-list-index`);
  check(`${T} - clic sur « La n-ième » : le champ du numéro apparaît (valeur 1), entier dans la fenêtre, atteignable`, nthOpen.picks[3][1] === 'true' && nthOpen.numRow && nthOpen.index === '1' && numberBox.found && numberBox.inViewport && numberBox.onTop, { nthOpen, numberBox });
  await typeInto(`${MODAL} #var-list-index`, '2');
  const nth2 = await modalState();
  check(`${T} - numéro « 2 » tapé au clavier : aperçu « Social »`, nth2.index === '2' && nth2.preview.endsWith('Le document écrit « Social ».'), nth2);
  await typeInto(`${MODAL} #var-list-index`, '7');
  const nth7 = await modalState();
  check(`${T} - numéro « 7 » : l'aperçu dit qu'il n'y a pas de valeur n° 7 et que le document n'écrit rien`, nth7.preview.indexOf('pas de valeur n° 7') !== -1 && nth7.preview.endsWith('le document n’écrit rien.'), nth7);
  await shot(`${theme}-3-nieme`);

  // 4) « Toutes les valeurs » et deux séparateurs tapés.
  await clickSel(PICK('all'));
  await typeInto(`${MODAL} #var-list-sep`, ' / ');
  await typeInto(`${MODAL} #var-list-last`, ' et ');
  const all = await modalState();
  check(`${T} - séparateurs tapés (« / » puis « et » avant la dernière) : aperçu « Santé / Social et Culture »`, all.sep === ' / ' && all.last === ' et ' && all.preview.endsWith('Le document écrit « Santé / Social et Culture ».'), all);
  const previewBox = await hitTest(`${MODAL} .var-condition-debug-line`);
  check(`${T} - la ligne d'aperçu est dans le panneau`, previewBox.found && previewBox.inViewport, previewBox);
  await shot(`${theme}-4-toutes`);

  // 5) Enregistrer : fenêtre fermée, barre de retour avec le bouton bleu, point bleu sur la bulle, Lecture.
  await clickSel(`${MODAL} .var-modal-primary`);
  await page.waitForTimeout(300);
  const saved = await modalState();
  const barAfter = await barState();
  const format = await formatOf('Themes');
  const dot = await page.evaluate(() => { const b = document.querySelector('.tiptap .var-badge[data-column="Themes"]'); const after = getComputedStyle(b, '::after'); return { content: after.content, width: after.width }; });
  check(`${T} - vrai clic sur Enregistrer : la fenêtre se ferme, la bulle porte le séparateur et « et », la barre revient avec le bouton « Liste » bleu`,
    !saved.shown && JSON.stringify(format) === JSON.stringify({ list: { separator: ' / ', lastSeparator: ' et ' } }) && barAfter.visible && barAfter.active && !barAfter.disabled, { saved, format, barAfter });
  check(`${T} - la bulle réglée porte son point bleu`, dot.content !== 'none' && Math.abs(parseFloat(dot.width) - 6) < 0.5, dot);
  await shot(`${theme}-5-enregistre`);
  await clickSel('#btn-mode-read');
  await page.waitForTimeout(400);
  const read = await page.evaluate(() => ({ reader: getComputedStyle(document.getElementById('reader-container')).display, bar: document.querySelector('.v2-varfmt-toolbar').classList.contains('visible'), text: Array.from(document.querySelectorAll('#reader-container .reader-content .resolved-var')).map(e => e.textContent) }));
  check(`${T} - Mode lecture : la barre se ferme, la bulle écrit « Santé / Social et Culture »`, read.reader === 'block' && !read.bar && JSON.stringify(read.text) === JSON.stringify(['Santé / Social et Culture', 'Alpha']), read);
  await clickSel('#btn-mode-edit');
  await page.waitForTimeout(300);

  // 6) Une bulle qui n'est pas une liste : bouton grisé, un vrai clic n'ouvre rien.
  await clickSel('.tiptap .var-badge[data-column="Titre"]');
  const textBar = await barState();
  const textButton = await hitTest(LIST_BUTTON);
  if (textButton.found) await realClick(textButton);
  await page.waitForTimeout(250);
  check(`${T} - bulle texte : bouton « Liste » grisé avec sa raison en info-bulle, un vrai clic dessus n'ouvre rien`,
    textBar.visible && textBar.disabled && !textBar.active && textBar.title === 'Disponible pour une colonne Liste de choix ou Liste de références' && !(await modalState()).shown, textBar);

  // 7) Rouvrir : le réglage est là, « Remettre par défaut » aussi ; Échap (vrai clavier) ferme sans rien changer ; « Remettre par défaut » retire tout.
  await clickSel('.tiptap .var-badge[data-column="Themes"]');
  await clickSel(LIST_BUTTON);
  await page.waitForTimeout(350);
  const again = await modalState();
  check(`${T} - rouverte : « Toutes les valeurs » avec ses séparateurs, « Remettre par défaut » proposé`, again.shown && again.picks[0][1] === 'true' && again.sep === ' / ' && again.last === ' et ' && again.reset, again);
  await clickSel(PICK('last'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const escaped = await modalState();
  check(`${T} - Échap (vrai clavier) ferme la fenêtre sans rien changer`, !escaped.shown && JSON.stringify(await formatOf('Themes')) === JSON.stringify({ list: { separator: ' / ', lastSeparator: ' et ' } }), escaped);
  await clickSel('.tiptap .var-badge[data-column="Themes"]');
  await clickSel(LIST_BUTTON);
  await page.waitForTimeout(350);
  await clickSel(`${MODAL} .var-modal-danger`);
  await page.waitForTimeout(300);
  const reset = await barState();
  check(`${T} - « Remettre par défaut » : fenêtre fermée, la bulle n'a plus aucun réglage, le bouton n'est plus bleu`, !(await modalState()).shown && (await formatOf('Themes')) === null && reset.visible && !reset.active, reset);

  // 8) « Un document par valeur » : un vrai clic sur le libellé coche la case, la barre d'espace la bascule, l'aperçu gagne sa seconde ligne, la fenêtre reste entière dans le panneau.
  await clickSel('.tiptap .var-badge[data-column="Themes"]');
  await clickSel(LIST_BUTTON);
  await page.waitForTimeout(350);
  const splitOpen = await modalState();
  const splitLabelBox = await hitTest(SPLIT_LABEL);
  const splitCheckBox = await hitTest(SPLIT_BOX);
  check(`${T} - la case « Un document par valeur » est décochée à l'ouverture, avec son indication dessous, et il n'y a qu'une ligne d'aperçu`,
    splitOpen.shown && !splitOpen.splitChecked && splitOpen.splitLabel === 'Un document par valeur' && splitOpen.splitHint === 'Exports PDF, Word et Excel seulement.' && splitOpen.lines.length === 1, splitOpen);
  check(`${T} - le libellé et la case sont dans le panneau, au premier plan, le libellé assez haut pour un vrai clic (au moins 20 px)`,
    [splitLabelBox, splitCheckBox].every(b => b.found && b.inViewport && b.onTop) && splitLabelBox.h >= 20, { splitLabelBox, splitCheckBox });
  await shot(`${theme}-6-case-decochee`);
  await clickSel(SPLIT_LABEL);
  const splitTicked = await modalState();
  check(`${T} - vrai clic sur le libellé : la case est cochée, l'aperçu a une seconde ligne « 3 documents, un par valeur », la première ligne ne bouge pas`,
    splitTicked.splitChecked && splitTicked.lines.length === 2 && splitTicked.lines[0] === splitOpen.lines[0] && splitTicked.lines[1] === 'Export : 3 documents, un par valeur (Santé, Social, Culture).', splitTicked);
  check(`${T} - case cochée : la fenêtre reste entière dans le panneau (700x400), sans défilement horizontal, titre et boutons visibles et au premier plan`,
    splitTicked.left >= 0 && splitTicked.right <= WIDTH + 0.5 && splitTicked.top >= 0 && splitTicked.bottom <= HEIGHT + 0.5 && splitTicked.overflowX <= 1 && splitTicked.bodyOverflowX <= 1
    && [await hitTest(`${MODAL} #var-list-title`), await hitTest(`${MODAL} .var-modal-primary`)].every(b => b.found && b.inViewport && b.onTop), splitTicked);
  const secondLine = await page.evaluate(sel => {
    const lines = Array.from(document.querySelectorAll(sel + ' .var-condition-debug-line')).filter(l => !l.hidden);
    const r = lines[lines.length - 1].getBoundingClientRect();
    const body = document.querySelector(sel + ' .pp-modal-body').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, bodyTop: body.top, bodyBottom: body.bottom };
  }, MODAL);
  check(`${T} - la seconde ligne d'aperçu est entière à l'écran juste après le clic (la fenêtre la fait venir en vue si le panneau est bas)`,
    secondLine.top >= secondLine.bodyTop - 0.5 && secondLine.bottom <= secondLine.bodyBottom + 0.5, secondLine);
  await shot(`${theme}-7-case-cochee`);
  // Clavier : la case a le focus après le clic sur son libellé ; Espace la bascule.
  await page.keyboard.press('Space');
  const spaceOff = await modalState();
  await page.keyboard.press('Space');
  const spaceOn = await modalState();
  check(`${T} - la barre d'espace (vrai clavier) décoche puis recoche la case, la seconde ligne d'aperçu suit`,
    !spaceOff.splitChecked && spaceOff.lines.length === 1 && spaceOn.splitChecked && spaceOn.lines.length === 2, { spaceOff, spaceOn });
  await clickSel(PICK('first'));
  const withFirst = await modalState();
  check(`${T} - la case va avec « La première » : elle reste cochée, la première ligne dit « Santé », la seconde garde les 3 documents`,
    withFirst.splitChecked && withFirst.picks[1][1] === 'true' && withFirst.lines[0].endsWith('Le document écrit « Santé ».') && withFirst.lines[1].startsWith('Export : 3 documents'), withFirst);
  await clickSel(PICK('all'));
  await clickSel(`${MODAL} .var-modal-primary`);
  await page.waitForTimeout(300);
  const splitSaved = await modalState();
  const splitBar = await barState();
  const splitFormat = await formatOf('Themes');
  const icon = await page.evaluate(() => {
    const b = document.querySelector('.tiptap .var-badge[data-column="Themes"]');
    const style = getComputedStyle(b);
    return { padding: style.paddingRight, image: style.backgroundImage.slice(0, 40), dot: getComputedStyle(b, '::after').content };
  });
  check(`${T} - vrai clic sur Enregistrer : la fenêtre se ferme, la bulle porte seulement « un document par valeur », la barre revient avec le bouton « Liste » bleu`,
    !splitSaved.shown && JSON.stringify(splitFormat) === JSON.stringify({ list: { perValue: true } }) && splitBar.visible && splitBar.active && !splitBar.disabled, { splitSaved, splitFormat, splitBar });
  check(`${T} - la bulle réglée porte sa petite icône à droite (marge de 17 px, image de fond) et garde son point bleu`,
    icon.padding === '17px' && icon.image.indexOf('data:image/svg+xml') !== -1 && icon.dot !== 'none', icon);
  await clickSel('.tiptap .var-badge[data-column="Titre"]');
  await shot(`${theme}-8-bulle-icone`);
  await clickSel('#btn-mode-read');
  await page.waitForTimeout(400);
  const splitRead = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container .reader-content .resolved-var')).map(e => e.textContent));
  check(`${T} - Mode lecture : la liste s'écrit en entier (« Santé, Social, Culture »), un document par valeur ne concerne que les exports`, JSON.stringify(splitRead) === JSON.stringify(['Santé, Social, Culture', 'Alpha']), splitRead);
  await clickSel('#btn-mode-edit');
  await page.waitForTimeout(300);
  // Rouverte : cochée ; un vrai clic sur la case elle-même la décoche, Enregistrer retire tout réglage.
  await clickSel('.tiptap .var-badge[data-column="Themes"]');
  await clickSel(LIST_BUTTON);
  await page.waitForTimeout(350);
  const splitAgain = await modalState();
  check(`${T} - rouverte : la case est cochée, « Remettre par défaut » proposé, la seconde ligne d'aperçu est là`, splitAgain.shown && splitAgain.splitChecked && splitAgain.reset && splitAgain.lines.length === 2, splitAgain);
  await clickSel(SPLIT_BOX);
  const splitOff = await modalState();
  check(`${T} - vrai clic sur la case : décochée, la seconde ligne disparaît`, !splitOff.splitChecked && splitOff.lines.length === 1, splitOff);
  await clickSel(`${MODAL} .var-modal-primary`);
  await page.waitForTimeout(300);
  const splitCleared = await barState();
  check(`${T} - Enregistrer sans la case : la bulle n'a plus aucun réglage, le bouton n'est plus bleu, l'icône a disparu`,
    (await formatOf('Themes')) === null && splitCleared.visible && !splitCleared.active
    && (await page.evaluate(() => getComputedStyle(document.querySelector('.tiptap .var-badge[data-column="Themes"]')).backgroundImage)) === 'none', splitCleared);
}

async function runEnglish() {
  console.log(`\n=== Fenêtre « Liste » en anglais, ${WIDTH}x${HEIGHT} ===`);
  await page.evaluate(() => I18n.setLang('en'));
  await page.waitForTimeout(250);
  await page.evaluate(doc => { Editor.setHTML(doc); }, DOC);
  await page.waitForTimeout(250);
  await clickSel('.tiptap .var-badge[data-column="Themes"]');
  const bar = await barState();
  check('anglais - la barre tient dans le panneau, le bouton « Liste » dit « List: which values to write »', bar.visible && bar.left >= 0 && bar.right <= WIDTH + 0.5 && bar.title === 'List: which values to write', bar);
  await clickSel(LIST_BUTTON);
  await page.waitForTimeout(350);
  const opened = await modalState();
  const picks = {};
  for (const p of ['all', 'first', 'last', 'nth']) picks[p] = await hitTest(PICK(p));
  check('anglais - la fenêtre tient dans le panneau sans défilement horizontal, les quatre choix (« All values », « The first », « The last », « The nth ») entiers et atteignables',
    opened.shown && opened.right <= WIDTH + 0.5 && opened.bottom <= HEIGHT + 0.5 && opened.overflowX <= 1 && opened.bodyOverflowX <= 1 && JSON.stringify(opened.picks.map(p => p[2])) === JSON.stringify(['All values', 'The first', 'The last', 'The nth'])
    && Object.values(picks).every(b => b.found && b.inViewport && b.onTop), { opened, picks });
  check('anglais - ouverte (case décochée) : la fenêtre tient dans le panneau sans défilement et les deux séparateurs sont sur une seule ligne', !opened.scrolls && opened.sepTop === opened.lastTop, opened);
  await clickSel(PICK('nth'));
  await typeInto(`${MODAL} #var-list-index`, '3');
  const nth = await modalState();
  check('anglais - « The nth » avec le numéro 3 : aperçu « Culture »', nth.preview === 'Selected row (#1): 3 values (Santé, Social, Culture). The document writes “Culture”.', nth);
  await shot('en-fenetre');
  check('anglais - la case « One document per value » est décochée avec son indication', opened.splitLabel === 'One document per value' && !opened.splitChecked
    && opened.splitHint === 'PDF, Word and Excel exports only.', opened);
  await clickSel(SPLIT_LABEL);
  const enSplit = await modalState();
  check('anglais - vrai clic sur le libellé : la case est cochée, seconde ligne « 3 documents for this row », la fenêtre reste entière dans le panneau, sans défilement horizontal',
    enSplit.splitChecked && enSplit.lines.length === 2 && enSplit.lines[1] === 'Export: 3 documents, one per value (Santé, Social, Culture).'
    && enSplit.right <= WIDTH + 0.5 && enSplit.bottom <= HEIGHT + 0.5 && enSplit.overflowX <= 1 && enSplit.bodyOverflowX <= 1
    && [await hitTest(`${MODAL} #var-list-title`), await hitTest(`${MODAL} .var-modal-primary`)].every(b => b.found && b.inViewport && b.onTop), enSplit);
  await shot('en-case-cochee');
  await clickSel(`${MODAL} .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)`);
  await page.waitForTimeout(250);
  check('anglais - Cancel ferme la fenêtre sans rien changer', !(await modalState()).shown && (await formatOf('Themes')) === null);
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
