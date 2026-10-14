#!/usr/bin/env node
// Repère « Page 2 » de l'éditeur et lignes vides de fin, à la taille du panneau Grist d'Antoine (~700x400), avec la vraie souris pour poser le curseur, les boutons de la barre
// et la liste des modèles, et le vrai clavier pour taper (Entrée, texte, Retour arrière). La référence est le dessin de l'éditeur lui-même : les bandes « Page N » de l'Aperçu A4.
// Correction (01/10, carte « Faire ignorer les lignes vides de fin au repère « Page 2 » de l'éditeur ? » d'Antoine : Oui) : le texte arrivait à la marge du bas, deux Entrées de
// trop suffisaient à faire apparaître « Page 2 » alors que la Lecture et les exports ne font pas de page de ces lignes vides (js/header-footer-preview.js:trailingBlankStart).
// Même règle AVANT un saut de page posé à la main (14/10, écart n° 4 de la batterie macroPages) : des Entrées tapées sous un texte ras la marge, puis le bouton « Saut de page »
// de la barre, ne font apparaître qu'un repère (js/header-footer-preview.js:blanksBeforeBreaks) ; sans cela, les lignes vides ouvraient une « Page 2 » que le saut refermait aussitôt.
// Le curseur après le bouton « Saut de page » (14/10, carte « Placer le curseur sous le saut de page quand on clique sur le bouton ? » d'Antoine : Curseur dessous) : le saut posé
// restait sélectionné, la première frappe le REMPLAÇAIT ; le curseur est maintenant sur la ligne de dessous (ajoutée en fin de document), un seul Ctrl+Z défait le bouton.
// Le saut de page qui TERMINE le document (14/10, carte « Cacher la « Page 2 » vide quand un saut de page termine le document ? » : « Cacher dans l'éditeur », écart n° 5 de la batterie
// macroPages) : rien derrière lui que des lignes vides, il n'ouvre pas de page dans l'éditeur, comme dans la Lecture et les exports ; la page revient dès qu'un texte vient derrière lui, et
// l'éditeur défile jusqu'au curseur si la page qui apparaît l'a descendu hors du panneau (js/header-footer-preview.js:renderPaginationOverlay).
// Lancé par run-headless.mjs (groupe Node "editorBlankTailMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-editor-blank-tail-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.EDITOR_BLANK_TAIL_MOUSE_PORT || 8918);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-access-rights-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-editor-blank-tail-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

const sleep = ms => new Promise(r => setTimeout(r, ms));
// EDITOR_BLANK_TAIL_SHOTS=<dossier> enregistre des captures du panneau à relire à l'œil (cinq lignes vides, « Page 2 » une fois « Fin » tapé, saut de page).
const SHOTS = process.env.EDITOR_BLANK_TAIL_SHOTS || '';
const shot = async name => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
// Le dessin des pages est refait 200 ms après la dernière frappe (HeaderFooterPreview.schedulePaginationRecompute) : on attend un peu plus.
const settle = () => sleep(600);
const center = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
// Le geste d'une vraie souris : l'approche, puis le clic.
async function realMove(sel) {
  const c = await center(sel);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  return c;
}

check('Aperçu A4 actif d\'office', await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview')));

// Ce que l'éditeur dessine : une bande « Page N » (sans en-tête ni pied) ou une couture (avec) par changement de page.
const SEAMS = '#editor-container .v2-pagination-overlay .v2-page-break-line, #editor-container .v2-pagination-overlay .v2-page-seam';
const seams = () => page.evaluate(sel => document.querySelectorAll(sel).length, SEAMS);
const blocks = () => page.evaluate(() => {
  const pm = document.querySelector('#editor-container .ProseMirror');
  return { paragraphs: pm.querySelectorAll(':scope > p').length, blank: Array.from(pm.querySelectorAll(':scope > p')).filter(p => !p.textContent.trim()).length };
});

const lines = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + i + ' du document de test de pagination.</p>').join('');
// La capacité d'une page est mesurée dans le vrai éditeur (plus long texte qui tient sur une seule page), jamais écrite en dur.
const capacity = await page.evaluate(async () => {
  const mk = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + i + ' du document de test de pagination.</p>').join('');
  const count = async html => {
    Editor.setHTML(html);
    await new Promise(r => setTimeout(r, 250));
    Editor.refreshPaginationPreview();
    await new Promise(r => setTimeout(r, 60));
    return document.querySelectorAll('#editor-container .v2-pagination-overlay .v2-page-break-line, #editor-container .v2-pagination-overlay .v2-page-seam').length + 1;
  };
  let fits = 5; let over = 120;
  while (over - fits > 1) { const mid = (fits + over) >> 1; if ((await count(mk(mid))) === 1) fits = mid; else over = mid; }
  return fits;
});
check('la capacité d\'une page est mesurée dans l\'éditeur', capacity > 20 && capacity < 120, capacity);

// Un modèle de plus : ligne enregistrée dans le faux Grist + option du vrai <select> (l'arbre des modèles se construit d'après les deux).
async function makeTemplate(name, html) {
  return page.evaluate(async ({ name, html }) => {
    const r = await Templates.save(null, name, html, '', null, null, 'document', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    const option = document.createElement('option'); option.value = String(r.id); option.textContent = name; select.appendChild(option);
    return r.id;
  }, { name, html });
}
// La liste des modèles à la vraie souris : ouvrir l'arbre, cliquer la ligne. Le chargement est attendu par l'identifiant du modèle courant.
async function pickTemplate(name, id) {
  const open = await page.evaluate(() => { const p = document.querySelector('.tts-popup'); return !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 0; });
  if (!open) { const tb = await center('.tts-trigger'); await page.mouse.click(tb.x, tb.y); await sleep(300); }
  const pos = await page.evaluate(n => {
    const row = Array.from(document.querySelectorAll('.tts-popup .tts-row-leaf')).find(e => e.querySelector('.tts-row-label').textContent.replace(' ★', '') === n);
    if (!row) return null;
    row.scrollIntoView({ block: 'nearest' });
    const b = row.getBoundingClientRect();
    return { x: b.left + 60, y: b.top + b.height / 2 };
  }, name);
  if (!pos) return false;
  await page.mouse.move(pos.x, pos.y); await sleep(80);
  await page.mouse.click(pos.x, pos.y);
  await sleep(300);
  // Quitter un modèle modifié (les Entrées tapées) pose la question « Enregistrer / Abandonner / Annuler » : on abandonne, au vrai clic.
  const abandon = await page.evaluate(() => {
    const ov = document.getElementById('pp-dialog-modal');
    if (!ov || getComputedStyle(ov).display === 'none') return null;
    const b = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(x => !x.hidden).find(x => x.textContent === 'Abandonner');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (abandon) { await page.mouse.move(abandon.x - 10, abandon.y, { steps: 2 }); await page.mouse.click(abandon.x, abandon.y); }
  await page.waitForFunction(i => String(Templates.getCurrentId()) === String(i), id, { timeout: 5000 }).catch(() => {});
  await settle();
  return String(await page.evaluate(() => Templates.getCurrentId())) === String(id);
}
// Pose le curseur à la fin du document : clic de la vraie souris au bout de la dernière ligne de texte, puis Ctrl+Fin au vrai clavier.
async function clickAtEndOfDocument() {
  const pos = await page.evaluate(() => {
    const pm = document.querySelector('#editor-container .ProseMirror');
    const last = Array.from(pm.querySelectorAll(':scope > p')).filter(p => p.textContent.trim()).pop();
    last.scrollIntoView({ block: 'center' });
    const r = last.getBoundingClientRect();
    return { x: r.left + Math.min(r.width - 6, 300), y: r.top + r.height / 2 };
  });
  await page.mouse.move(pos.x, pos.y, { steps: 3 });
  await page.mouse.click(pos.x, pos.y);
  await page.keyboard.press('Control+End');
  await sleep(150);
}

// La ligne de texte où est le curseur : où elle tombe dans le panneau, et si elle suit directement un saut de page.
const caretLine = () => page.evaluate(() => {
  const s = getSelection();
  if (!s.rangeCount) return null;
  const node = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
  const line = node && node.closest('#editor-container .ProseMirror > p');
  if (!line) return null;
  const r = line.getBoundingClientRect();
  const before = line.previousElementSibling;
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), windowHeight: innerHeight, followsBreak: !!before && before.classList.contains('page-break-marker'), text: line.textContent };
});
const markerCount = () => page.evaluate(() => document.querySelectorAll('#editor-container .ProseMirror .page-break-marker').length);

// La ligne courante : une table et une ligne quelconques.
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('Clients', { Nom: 'Text' });
  stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients');
});

// --- Texte ras la marge du bas, puis des Entrées de trop au vrai clavier.
const flushId = await makeTemplate('Texte ras la marge', lines(capacity));
check('le modèle dont le texte arrive à la marge du bas s\'ouvre (liste des modèles, vrai clic)', await pickTemplate('Texte ras la marge', flushId));
check('une seule page, aucun repère « Page 2 »', (await seams()) === 0, await seams());

const before = await blocks();
await clickAtEndOfDocument();
for (let i = 0; i < 5; i++) { await page.keyboard.press('Enter'); await sleep(60); }
await settle();
const afterEnters = await blocks();
check('cinq Entrées au clavier ajoutent cinq lignes vides, l\'éditeur les garde', afterEnters.paragraphs === before.paragraphs + 5 && afterEnters.blank >= 5, { before, afterEnters });
check('les cinq lignes vides de fin n\'ouvrent pas de « Page 2 »', (await seams()) === 0, await seams());
await shot('1-cinq-lignes-vides');
const caret = await page.evaluate(() => {
  const s = getSelection();
  if (!s.rangeCount) return null;
  const node = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
  const line = node && node.closest('#editor-container .ProseMirror > p');
  if (!line) return null;
  const r = line.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), windowHeight: innerHeight };
});
check('le curseur reste visible dans le panneau', !!caret && caret.bottom > 0 && caret.top < caret.windowHeight, caret);

// Du texte tapé sur la dernière ligne vide : elle n'est plus vide, la page où elle tombe apparaît.
await page.keyboard.type('Fin');
await settle();
check('du texte tapé sur la dernière ligne vide fait apparaître « Page 2 »', (await seams()) === 1, await seams());
const label = await page.evaluate(sel => { const s = document.querySelector(sel); return s ? s.textContent.replace(/\s+/g, ' ').trim() : null; }, SEAMS);
check('le repère s\'appelle « Page 2 »', /Page 2/.test(label || ''), label);
const finBelowSeam = await page.evaluate(sel => {
  const seam = document.querySelector(sel);
  const fin = Array.from(document.querySelectorAll('#editor-container .ProseMirror > p')).find(p => p.textContent.trim() === 'Fin');
  return !!seam && !!fin && fin.getBoundingClientRect().top >= seam.getBoundingClientRect().top - 1;
}, SEAMS);
check('« Fin » est sous le repère, sur la page 2', finBelowSeam);
await shot('2-page-2-apres-fin');
for (let i = 0; i < 3; i++) { await page.keyboard.press('Backspace'); await sleep(40); }
await settle();
check('le texte effacé, la ligne redevient vide et « Page 2 » disparaît', (await seams()) === 0, await seams());

// --- Un saut de page posé au bouton de la barre en fin de document n'ouvre pas de « Page 2 » ; les lignes vides tapées derrière lui n'en ouvrent pas non plus.
const shortId = await makeTemplate('Texte court', lines(3));
check('le modèle court s\'ouvre (liste des modèles, vrai clic)', await pickTemplate('Texte court', shortId));
await clickAtEndOfDocument();
await page.evaluate(() => document.getElementById('v2-btn-page-break').scrollIntoView({ block: 'nearest', inline: 'center' }));
const breakButton = await realMove('#v2-btn-page-break');
await page.mouse.click(breakButton.x, breakButton.y);
await settle();
check('le saut de page est posé (bloc « Saut de page » dans l\'éditeur)', await page.evaluate(() => !!document.querySelector('#editor-container .ProseMirror .page-break-marker')));
check('le saut de page de fin de document n\'ouvre pas de « Page 2 » : il n\'y a rien derrière lui', (await seams()) === 0, await seams());
await shot('3-saut-de-page-seul');
await page.keyboard.press('Control+End');
for (let i = 0; i < capacity + 20; i++) await page.keyboard.press('Enter');
await settle();
const afterBreakEnters = await blocks();
check('plus d\'une page de lignes vides tapées derrière le saut de page', afterBreakEnters.blank >= capacity + 20, afterBreakEnters);
check('elles n\'ouvrent aucune page : le saut reste en fin de document', (await seams()) === 0, await seams());
await shot('4-lignes-vides-derriere-le-saut');

// --- Des Entrées de trop SOUS un texte ras la marge, puis le saut de page posé au bouton de la barre : le saut referme la page, les lignes vides ne font pas de page de plus.
// Le texte ras la marge est posé dans l'éditeur (le premier modèle, modifié puis enregistré tout seul au repos, n'est plus ras la marge) ; les Entrées, le bouton de la barre et
// la frappe qui suivent sont ceux de la vraie souris et du vrai clavier.
await page.evaluate(html => Editor.setHTML(html), lines(capacity));
await settle();
check('le texte qui arrive à la marge du bas tient sur une seule page, aucun repère avant les Entrées', (await seams()) === 0, await seams());
await clickAtEndOfDocument();
for (let i = 0; i < 3; i++) { await page.keyboard.press('Enter'); await sleep(60); }
await settle();
check('trois Entrées au clavier ne font toujours pas de « Page 2 »', (await seams()) === 0, await seams());
await page.evaluate(() => document.getElementById('v2-btn-page-break').scrollIntoView({ block: 'nearest', inline: 'center' }));
const breakAfterEnters = await realMove('#v2-btn-page-break');
await page.mouse.click(breakAfterEnters.x, breakAfterEnters.y);
await settle();
check('le saut de page est posé derrière les lignes vides', await page.evaluate(() => !!document.querySelector('#editor-container .ProseMirror .page-break-marker')));
check('aucun repère : les lignes vides d\'avant le saut et celle de dessous n\'ouvrent pas de page', (await seams()) === 0, await seams());
// Le curseur est déjà sur la ligne de dessous (choix d'Antoine du 14/10, « Curseur dessous ») : la frappe qui suit s'écrit sous le saut, sans flèche entre le bouton et elle (avant, le
// saut restait sélectionné et la frappe le REMPLAÇAIT).
const caretUnderBreak = await caretLine();
check('juste après le bouton, le curseur est sur la ligne de dessous : celle qui suit directement le saut', !!caretUnderBreak && caretUnderBreak.followsBreak, caretUnderBreak);
check('cette ligne est visible dans le panneau (la fenêtre a défilé jusqu\'à elle)', !!caretUnderBreak && caretUnderBreak.bottom > 0 && caretUnderBreak.top < caretUnderBreak.windowHeight, caretUnderBreak);
await page.keyboard.type('Suite');
await settle();
check('le saut de page est toujours là une fois « Suite » tapée derrière lui', (await page.evaluate(() => document.querySelectorAll('#editor-container .ProseMirror .page-break-marker').length)) === 1);
check('du texte tapé derrière le saut fait apparaître « Page 2 » et pas de « Page 3 »', (await seams()) === 1, await seams());
const caretAfterSuite = await caretLine();
check('la page qui apparaît ne sort pas le curseur du panneau : l\'éditeur défile jusqu\'à lui', !!caretAfterSuite && caretAfterSuite.bottom > 0 && caretAfterSuite.top < caretAfterSuite.windowHeight, caretAfterSuite);
const suiteBelowSeam = await page.evaluate(sel => {
  const seam = document.querySelector(sel);
  const suite = Array.from(document.querySelectorAll('#editor-container .ProseMirror > p')).find(p => p.textContent.trim() === 'Suite');
  return !!seam && !!suite && suite.getBoundingClientRect().top >= seam.getBoundingClientRect().top - 1;
}, SEAMS);
check('« Suite » est sous le repère, sur la page 2', suiteBelowSeam);
// Le bouton de la barre pose le saut à la place de la ligne vide où se trouve le curseur : des trois Entrées, deux lignes vides restent devant lui.
const blanksBeforeMarker = await page.evaluate(() => {
  const marker = document.querySelector('#editor-container .ProseMirror .page-break-marker');
  let count = 0;
  for (let el = marker && marker.previousElementSibling; el && el.tagName === 'P' && !el.textContent.trim(); el = el.previousElementSibling) count++;
  return count;
});
check('les lignes vides tapées devant le saut restent dans le document (on peut y écrire)', blanksBeforeMarker >= 2, blanksBeforeMarker);
await shot('5-entrees-puis-saut-de-page');

// --- Le bouton en fin de document, sans rien derrière : une ligne est ajoutée dessous, le curseur y est, un seul Ctrl+Z rend le document d'avant.
await page.evaluate(html => Editor.setHTML(html), lines(3));
await settle();
await clickAtEndOfDocument();
const paragraphsBefore = (await blocks()).paragraphs;
await page.evaluate(() => document.getElementById('v2-btn-page-break').scrollIntoView({ block: 'nearest', inline: 'center' }));
const endButton = await realMove('#v2-btn-page-break');
await page.mouse.click(endButton.x, endButton.y);
await settle();
check('fin de document : le saut de page est posé', (await markerCount()) === 1, await markerCount());
const endCaret = await caretLine();
check('fin de document : une ligne est ajoutée sous le saut et le curseur y est', !!endCaret && endCaret.followsBreak && endCaret.text === '' && (await blocks()).paragraphs === paragraphsBefore + 1, { endCaret, paragraphsBefore });
check('fin de document : cette ligne est visible dans le panneau', !!endCaret && endCaret.bottom > 0 && endCaret.top < endCaret.windowHeight, endCaret);
await shot('6-curseur-sous-le-saut');
check('fin de document : ni le saut ni la ligne vide ajoutée dessous n\'ouvrent de « Page 2 »', (await seams()) === 0, await seams());
await page.keyboard.type('Suite');
await settle();
const typedLine = await caretLine();
check('fin de document : « Suite » tapée s\'écrit sous le saut, le saut reste', (await markerCount()) === 1 && !!typedLine && typedLine.followsBreak && typedLine.text === 'Suite', { typedLine, markers: await markerCount() });
check('fin de document : la page revient dès qu\'un texte vient derrière le saut', (await seams()) === 1, await seams());
check('fin de document : le curseur reste visible dans le panneau une fois la page apparue', !!typedLine && typedLine.bottom > 0 && typedLine.top < typedLine.windowHeight, typedLine);
await page.keyboard.press('Control+z');
await settle();
const afterFirstUndo = await caretLine();
check('un premier Ctrl+Z retire « Suite », le saut et sa ligne restent', (await markerCount()) === 1 && !!afterFirstUndo && afterFirstUndo.followsBreak && afterFirstUndo.text === '', { afterFirstUndo, markers: await markerCount() });
check('la page disparaît avec le texte : le saut termine de nouveau le document', (await seams()) === 0, await seams());
await page.keyboard.press('Control+z');
await settle();
check('un second Ctrl+Z retire le saut ET la ligne ajoutée d\'un coup : le document est celui d\'avant le bouton', (await markerCount()) === 0 && (await blocks()).paragraphs === paragraphsBefore, { markers: await markerCount(), blocks: await blocks(), paragraphsBefore });

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
