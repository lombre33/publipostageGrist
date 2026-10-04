#!/usr/bin/env node
// Repère « Page 2 » de l'éditeur et lignes vides de fin, à la taille du panneau Grist d'Antoine (~700x400), avec la vraie souris pour poser le curseur, les boutons de la barre
// et la liste des modèles, et le vrai clavier pour taper (Entrée, texte, Retour arrière). La référence est le dessin de l'éditeur lui-même : les bandes « Page N » de l'Aperçu A4.
// Correction (01/10, carte « Faire ignorer les lignes vides de fin au repère « Page 2 » de l'éditeur ? » d'Antoine : Oui) : le texte arrivait à la marge du bas, deux Entrées de
// trop suffisaient à faire apparaître « Page 2 » alors que la Lecture et les exports ne font pas de page de ces lignes vides (js/header-footer-preview.js:trailingBlankStart).
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

// --- Un saut de page posé au bouton de la barre garde son repère ; les lignes vides tapées derrière lui n'ouvrent pas de « Page 3 ».
const shortId = await makeTemplate('Texte court', lines(3));
check('le modèle court s\'ouvre (liste des modèles, vrai clic)', await pickTemplate('Texte court', shortId));
await clickAtEndOfDocument();
await page.evaluate(() => document.getElementById('v2-btn-page-break').scrollIntoView({ block: 'nearest', inline: 'center' }));
const breakButton = await realMove('#v2-btn-page-break');
await page.mouse.click(breakButton.x, breakButton.y);
await settle();
check('le saut de page est posé (bloc « Saut de page » dans l\'éditeur)', await page.evaluate(() => !!document.querySelector('#editor-container .ProseMirror .page-break-marker')));
check('le saut de page garde son repère « Page 2 » même sans rien derrière', (await seams()) === 1, await seams());
await shot('3-saut-de-page-seul');
await page.keyboard.press('Control+End');
for (let i = 0; i < capacity + 20; i++) await page.keyboard.press('Enter');
await settle();
const afterBreakEnters = await blocks();
check('plus d\'une page de lignes vides tapées derrière le saut de page', afterBreakEnters.blank >= capacity + 20, afterBreakEnters);
check('elles n\'ouvrent pas de « Page 3 »', (await seams()) === 1, await seams());
await shot('4-lignes-vides-derriere-le-saut');

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
