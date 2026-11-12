#!/usr/bin/env node
// Section répétée d'une boucle (demande d'Antoine du 2026-11-12 : un ordre du jour, un titre par point, de la place pour écrire entre les titres ; choix « Section répétée, puis Dérouler »,
// étape 1) à la VRAIE souris et au VRAI clavier (page.mouse / page.keyboard, Node/Playwright) et à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis sombre.
// dev-tests/scenarios-loop-section.js vérifie la logique DANS la page ; ici, ce que seuls une vraie souris et un vrai clavier prouvent : un clic sur la bulle d'un titre puis sur l'icône
// Boucle ouvre la fenêtre, « Le titre et ce qui le suit » se choisit au clic (sa note entière dans la fenêtre), Enregistrer pose le repère de la section dans l'éditeur (teinte et trait de
// marge sur le titre et les blocs qui le suivent, pas sur ceux d'après le titre suivant), Alt+/ puis « fin section » + Entrée pose la marque « Fin de la section » sous le curseur et le
// repère s'arrête avant elle, la Lecture écrit un titre par point avec son texte et sans la marque.
// Lancé par run-headless.mjs (groupe Node "loopSectionMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-loop-section-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.LOOP_SECTION_MOUSE_PORT || 9183);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-cond-text-mouse.mjs.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-loop-section-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

// LOOP_SECTION_SHOTS=<dossier> : enregistre des captures aux moments clés, à relire à l'œil (comme COND_VALUE_SHOTS pour la valeur).
const SHOTS = process.env.LOOP_SECTION_SHOTS || '';
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const pageErrors = [];

async function openWidget(colorScheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { pageErrors.push('boîte inattendue : ' + d.message()); d.accept().catch(() => {}); });
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
  return { context, page };
}

// Centre d'un élément, entièrement dans le panneau ?, et au premier plan (un contrôle recouvert par autre chose ne recevrait pas le clic) ?
async function hitTest(page, selector) {
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
// Une ligne de liste retrouvée par son texte exact (la liste « # » n'a pas d'identifiant par ligne).
async function hitByText(page, selector, text) {
  return page.evaluate(({ selector, text }) => {
    const el = Array.from(document.querySelectorAll(selector)).find(e => e.textContent.trim() === text);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, x, y, inViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, onTop: !!top && (top === el || el.contains(top)) };
  }, { selector, text });
}
// Vrai geste : la souris rejoint le centre en quelques pas (survol compris) puis clique.
async function realClick(page, box) {
  await page.mouse.move(box.x - 6, box.y, { steps: 2 });
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.mouse.click(box.x, box.y);
}
// Souris garée dans la page, loin des menus au survol de la barre d'outils (un geste qui part du coin haut gauche en traverse un et le laisse ouvert sur le texte).
const park = page => page.mouse.move(400, 330);
const pressTimes = async (page, key, n) => { for (let i = 0; i < n; i++) await page.keyboard.press(key); };

// « Encre » d'un contrôle sur une VRAIE capture d'écran : écart moyen entre ses pixels et celui de son coin (le fond) - un contrôle grisé, clair ou sombre, y est
// nettement plus faible (même mesure que dev-tests/verify-read-mode-mouse.mjs).
async function ink(page, selector) {
  const b = await hitTest(page, selector);
  if (!b.found || !b.inViewport) return null;
  const png = await page.screenshot({ clip: { x: Math.ceil(b.left), y: Math.ceil(b.top), width: Math.floor(b.w) - 1, height: Math.floor(b.h) - 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]);
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

// La ligne `selector` de la fenêtre de la boucle, amenée entière dans la partie visible du corps de la fenêtre à la VRAIE molette (le corps défile, le titre et les boutons restent).
// Rend { fully, ... } à la fin, ou null si la ligne n'existe pas.
async function wheelIntoView(page, selector, scope) {
  let last = null;
  for (let i = 0; i < 14; i++) {
    last = await page.evaluate(({ sel, scope }) => {
      const el = document.querySelector(sel);
      const body = document.querySelector(scope + ' .pp-modal-body');
      if (!el || !body) return null;
      const r = el.getBoundingClientRect();
      const v = body.getBoundingClientRect();
      return { fully: r.top >= v.top - 0.5 && r.bottom <= v.bottom + 0.5, below: r.bottom > v.bottom, x: v.left + v.width / 2, y: v.top + v.height / 2, scrollTop: body.scrollTop, maxScroll: body.scrollHeight - body.clientHeight };
    }, { sel: selector, scope: scope || '#var-loop-modal' });
    if (!last || last.fully) return last;
    await page.mouse.move(last.x, last.y);
    await page.mouse.wheel(0, last.below ? 110 : -110);
    await page.waitForTimeout(120);
  }
  return last;
}


// === La section répétée, à la vraie souris et au vrai clavier ===
const PAGE = 'MsInstances';
const POINTS = 'MsPoints';
const RECORD = { id: 1, Nom: 'Comité du 12 novembre' };

async function seedPage(page) {
  await page.evaluate(async ({ record, page, points }) => {
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setVariables(page, { Nom: 'Text' });
    stub.setVariables(points, { Instance: 'Ref:' + page, Parent: 'Ref:' + points, Titre: 'Text', Rapporteur: 'Text', manualSort: 'ManualSortPos' });
    stub.setRows(page, [{ id: 1, Nom: 'Comité du 12 novembre' }]);
    stub.setRows(points, [
      { id: 1, Instance: 1, Parent: 0, Titre: 'Approbation du compte rendu', Rapporteur: 'M. Durand', manualSort: 1 },
      { id: 2, Instance: 1, Parent: 0, Titre: 'Budget 2027', Rapporteur: 'Mme Lefèvre', manualSort: 2 },
      { id: 3, Instance: 1, Parent: 2, Titre: 'Crédits de formation', Rapporteur: '', manualSort: 3 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(points);
    await GristAPI.saveLinkRule(points, { mode: 'match', colonneCible: 'Instance', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(record, page);
    const bubble = (column) => '<span class="var-badge" data-table="' + points + '" data-column="' + column + '" data-key="' + points + '.' + column + '"></span>';
    Editor.setHTML('<h2>' + bubble('Titre') + '</h2><p>Rapporteur : ' + bubble('Rapporteur') + '</p><p>Décision :</p><p>Prochaine réunion le 3 décembre.</p><h1>Annexes</h1><p>Texte des annexes.</p>');
  }, { record: RECORD, page: PAGE, points: POINTS });
  await page.waitForTimeout(400);
}
// Les blocs de l'éditeur avec le repère de section qu'ils portent : « h2 section first », « p section », « p -».
const blocksOf = page => page.evaluate(() => Array.from(document.querySelector('.tiptap').children).filter(el => !el.classList.contains('ProseMirror-trailingBreak')).map(el => {
  const kinds = ['first', 'last'].filter(k => el.classList.contains('pp-loop-section-' + k));
  const tag = el.classList.contains('loop-end-marker') ? 'fin' : el.tagName.toLowerCase();
  return tag + ' ' + (el.classList.contains('pp-loop-section') ? 'section' : '-') + (kinds.length ? ' ' + kinds.join(' ') : '');
}));
const windowShown = page => page.evaluate(() => { const m = document.getElementById('var-loop-modal'); return !!m && getComputedStyle(m).display !== 'none' && m.getClientRects().length > 0; });
const readSections = page => page.evaluate(async () => {
  const box = document.createElement('div');
  box.innerHTML = await ReaderMode.preview(Editor.getHTML(), 'MsInstances', { id: 1, Nom: 'Comité du 12 novembre' });
  return Array.from(box.children).map(el => el.tagName.toLowerCase() + ' ' + el.textContent.trim());
});

async function run(theme) {
  const label = theme === 'dark' ? 'sombre' : 'clair';
  console.log(`\n=== Section répétée d'une boucle à la vraie souris et au vrai clavier, ${WIDTH}x${HEIGHT}, thème ${label} ===`);
  const { context, page } = await openWidget(theme);
  await seedPage(page);

  // 1) Un vrai clic sur la bulle du titre, puis sur l'icône Boucle de sa barre : la fenêtre s'ouvre ; « Le titre et ce qui le suit » est proposé.
  await park(page);
  await realClick(page, await hitTest(page, '.tiptap h2 .var-badge'));
  await page.waitForTimeout(300);
  await realClick(page, await hitTest(page, '.v2-varfmt-toolbar.visible button[data-action="var-loop"]'));
  await page.waitForTimeout(500);
  const opened = await hitTest(page, '#var-loop-modal .var-modal-content');
  check(`${label} - un clic sur la bulle du titre puis sur l'icône Boucle ouvre la fenêtre, entière dans le panneau`, (await windowShown(page)) && opened.found && opened.inViewport && opened.onTop, opened);
  const choices = await page.evaluate(() => Array.from(document.querySelectorAll('#var-loop-modal .var-loop-seg button')).map(b => b.dataset.repeat + ':' + b.textContent));
  check(`${label} - le choix « Ce qui se répète » propose « Le titre et ce qui le suit » après « Le titre »`, JSON.stringify(choices.map(c => c.split(':')[0])) === JSON.stringify(['inline', 'paragraph', 'section']) && /Le titre et ce qui le suit/.test(choices[2]), choices);

  // 2) Un vrai clic sur le choix : sa note dit où la section s'arrête, entière dans la fenêtre ; « Si aucune ligne » propose de masquer la section.
  const choice = await hitTest(page, '#var-loop-modal .var-loop-seg button[data-repeat="section"]');
  check(`${label} - le choix « Le titre et ce qui le suit » est entièrement dans le panneau et au premier plan`, choice.found && choice.inViewport && choice.onTop, choice);
  await realClick(page, choice);
  await page.waitForTimeout(250);
  const note = await wheelIntoView(page, '#var-loop-modal .var-loop-row-note');
  const noteText = await page.evaluate(() => { const n = document.querySelector('#var-loop-modal .var-loop-row-note'); const r = n.getBoundingClientRect(); const c = document.querySelector('#var-loop-modal .var-modal-content').getBoundingClientRect(); return { hidden: n.hidden, text: n.textContent, inside: r.left >= c.left && r.right <= c.right, overflowX: n.scrollWidth - n.clientWidth }; });
  await shot(page, `${theme}-1-fenetre-section`);
  check(`${label} - la note dit où la section s'arrête et comment la fermer ailleurs, entière dans la fenêtre`, note && note.fully && !noteText.hidden && /prochain titre/.test(noteText.text) && /Fin de la section/.test(noteText.text) && noteText.inside && noteText.overflowX <= 0, { note, noteText });
  const empty = await page.evaluate(() => Array.from(document.querySelectorAll('#var-loop-modal #var-loop-empty option')).map(o => o.textContent));
  check(`${label} - « Si aucune ligne » propose de masquer le titre et ce qui le suit, ou d'afficher un texte à la place`, JSON.stringify(empty) === JSON.stringify(['Masquer le titre et ce qui le suit', 'Afficher un texte à la place']), empty);

  // 3) Enregistrer au vrai clic : le repère de la section est dans l'éditeur, du titre au bloc d'avant « Annexes ».
  await page.evaluate(() => { const b = document.querySelector('#var-loop-modal .var-modal-actions .pp-btn-primary, #var-loop-modal .var-modal-actions button:last-child'); b.scrollIntoView({ block: 'nearest' }); });
  const save = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#var-loop-modal .var-modal-actions button')).find(x => x.textContent === 'Enregistrer'); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && (top === b || b.contains(top)), inViewport: r.top >= 0 && r.bottom <= innerHeight + 0.5 }; });
  check(`${label} - « Enregistrer » est dans le panneau et au premier plan`, save.onTop && save.inViewport, save);
  await realClick(page, save);
  await page.waitForTimeout(500);
  await park(page);
  const marked = await blocksOf(page);
  await shot(page, `${theme}-2-section-posee`);
  check(`${label} - le titre et les trois blocs qui le suivent portent le repère de la section, pas « Annexes » ni ce qui le suit`,
    JSON.stringify(marked) === JSON.stringify(['h2 section first', 'p section', 'p section', 'p section last', 'h1 -', 'p -']), marked);
  const tint = await page.evaluate(() => { const h = document.querySelector('.tiptap h2'); const p = document.querySelector('.tiptap p'); const hs = getComputedStyle(h); const ps = getComputedStyle(p); return { head: hs.backgroundColor, body: ps.backgroundColor, bar: ps.boxShadow, tab: getComputedStyle(h, '::after').content }; });
  check(`${label} - la teinte de la zone répétée et le trait de marge sont posés, le titre a l'onglet`, tint.head === 'rgb(245, 249, 255)' && tint.body === 'rgb(245, 249, 255)' && /inset/.test(tint.bar) && tint.tab === '""', tint);

  // 4) Le curseur au bout de « Décision : » (vrai clic), Alt+/ puis « fin section » + Entrée : la marque est posée, la section s'arrête avant elle.
  const decision = await page.evaluate(() => {
    const p = Array.from(document.querySelectorAll('.tiptap p')).find(e => e.textContent === 'Décision :');
    const r = p.getBoundingClientRect();
    const x = r.left + 30, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, hit: top ? top.tagName + '.' + top.className : null, rect: [r.left, r.top, r.right, r.bottom] };
  });
  await realClick(page, decision);
  // Le curseur d'un clic se pose à l'évènement suivant : la touche Fin n'est pressée qu'après.
  await page.waitForTimeout(200);
  await page.keyboard.press('End');
  const caret = await page.evaluate(() => { const sel = EditorCore.getEditor().state.selection; return { empty: sel.empty, node: !!sel.node, parent: sel.$from.parent.textContent, at: sel.from }; });
  check(`${label} - un clic sur « Décision : » et Fin placent le curseur au bout de cette ligne`, caret.empty && !caret.node && caret.parent === 'Décision :', { caret, decision });
  await page.keyboard.press('Alt+/');
  await page.waitForTimeout(400);
  const paletteShown = await page.evaluate(() => { const m = document.getElementById('pp-palette-modal'); return !!m && getComputedStyle(m).display !== 'none' && m.getClientRects().length > 0; });
  check(`${label} - Alt+/ ouvre la palette de commandes`, paletteShown, paletteShown);
  await page.keyboard.type('fin section');
  await page.waitForTimeout(250);
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-palette-list [role="option"]')).map(e => e.textContent.trim()).slice(0, 4));
  await shot(page, `${theme}-3-palette`);
  check(`${label} - « fin section » retient la commande « Fin de la section répétée »`, rows.some(t => /Fin de la section répétée/.test(t)), rows);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const afterMarker = await blocksOf(page);
  await shot(page, `${theme}-4-marque-posee`);
  check(`${label} - la marque « Fin de la section » est posée sous « Décision : » et la section s'arrête avant elle`,
    JSON.stringify(afterMarker) === JSON.stringify(['h2 section first', 'p section', 'p section last', 'fin -', 'p -', 'h1 -', 'p -']), afterMarker);
  const markerLook = await page.evaluate(() => { const m = document.querySelector('.tiptap .loop-end-marker'); const r = m.getBoundingClientRect(); return { text: m.textContent, left: r.left, right: r.right, inViewport: r.left >= 0 && r.right <= innerWidth + 0.5 }; });
  check(`${label} - le repère de la marque dit « Fin de la section » et tient dans le panneau`, markerLook.text === 'Fin de la section' && markerLook.inViewport, markerLook);

  // 5) La Lecture : un titre par point avec « Rapporteur : … » et « Décision : », la marque absente, le texte de fin une seule fois.
  const read = await readSections(page);
  const expected = [
    'h2 Approbation du compte rendu', 'p Rapporteur : M. Durand', 'p Décision :',
    'h2 Budget 2027', 'p Rapporteur : Mme Lefèvre', 'p Décision :',
    'h2 Crédits de formation', 'p Rapporteur :', 'p Décision :',
    'p Prochaine réunion le 3 décembre.', 'h1 Annexes', 'p Texte des annexes.',
  ];
  check(`${label} - la Lecture écrit un titre par point avec son texte, sans la marque, et le texte de fin une seule fois`, JSON.stringify(read) === JSON.stringify(expected), read);
  await context.close();
}

try {
  await run('light');
  await run('dark');
} catch (e) {
  check('le parcours va jusqu\'au bout sans exception : ' + e.message, false, e.stack);
}
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors.slice(0, 5));

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
