#!/usr/bin/env node
// Colonnes d'un tableau avec le suivi des modifications allumé, à la vraie souris et au vrai clavier, à la taille du panneau Grist d'Antoine (~700x400), en
// thème clair puis sombre. Demande d'Antoine du 01/10 (« Faire marcher ») : « Colonne avant », « Colonne après » et « Supprimer la colonne » de la barre du tableau
// ne faisaient rien quand le suivi était allumé. La ligne du tableau n'acceptait pas la marque que le suivi pose sur chaque case de la colonne : la transaction était
// refusée (console.warn « Invalid content for node tableRow »). Elles posent maintenant une marque d'insertion ou de suppression sur chaque case, que ProseMirror
// dessine en <ins> / <del> directement dans le <tr> : sans règle d'affichage la case sortait de la ligne, d'où les mesures de géométrie ci-dessous (cases bord à bord,
// dans le tableau). Le HTML enregistré porte la marque en attribut de la case, parce qu'un <ins> posé autour d'un <td> ne survit pas à l'analyseur HTML du navigateur.
// Le fond d'une cellule et la largeur d'une colonne posent aussi une marque de modification sur les cases touchées : « Tout refuser » doit les rendre et « Tout accepter » les garder (section 7, 04/10).
// La barre « Accepter / Refuser » les propose aussi, un par un, et la largeur d'une colonne se résout sur toute la colonne (sections 9 et 10, 04/10, carte « Corriger »).
// Une colonne ajoutée puis colorée ou tirée garde sa marque d'ajout (« Refuser » ou « Tout refuser » la retire entière), une colonne supprimée n'accepte aucun fond ni aucune largeur, et un alignement changé deux fois
// se refuse jusqu'à l'original (section 12, 04/10, carte « Aussi l'alignement »).
// Lancé par run-headless.mjs (groupe Node "trackColumnsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-track-columns-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TRACK_COLUMNS_PORT || 8903);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-table-undo-keyboard.mjs.
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
if (!OFFLINE) console.log('[verify-track-columns-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const pageErrors = [];
// Une page neuve par thème : même panneau ~700x400, mêmes routes hors-ligne.
async function openPage(dark) {
const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme: dark ? 'dark' : 'light' });
const page = await context.newPage();
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
// Aperçu A4, le réglage d'Antoine : c'est lui qui déclenche aussi la correction de largeur des tableaux trop larges pour la page.
await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });
return page;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const settle = () => sleep(600);

const AUTO = '<table><tbody><tr><td><p>a1</p></td><td><p>b1</p></td><td><p>c1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td><td><p>c2</p></td></tr></tbody></table><p>fin</p>';
const FIXED = '<table><tbody><tr><td colwidth="150"><p>a1</p></td><td colwidth="150"><p>b1</p></td><td colwidth="150"><p>c1</p></td></tr>'
  + '<tr><td colwidth="150"><p>a2</p></td><td colwidth="150"><p>b2</p></td><td colwidth="150"><p>c2</p></td></tr></tbody></table><p>fin</p>';
const MERGED = '<table><tbody><tr><td colspan="2"><p>ab</p></td><td><p>c1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td><td><p>c2</p></td></tr></tbody></table><p>fin</p>';

const plain = h => h.replace(/ style="[^"]*"/g, '').replace(/<colgroup>.*?<\/colgroup>/, '').replace(/ colspan="1" rowspan="1"/g, '');
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const contrast = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

let page;
const tableState = () => page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.tiptap tr')).map(tr => Array.from(tr.querySelectorAll('td, th')).map(td => {
    const r = td.getBoundingClientRect();
    const cs = getComputedStyle(td);
    const wrapper = td.parentElement.tagName;
    return { left: r.left, right: r.right, kind: wrapper === 'INS' ? 'ins' : wrapper === 'DEL' ? 'del' : 'plain', bg: cs.backgroundColor, color: cs.color, deco: cs.textDecorationLine, text: td.textContent };
  }));
  const t = document.querySelector('.tiptap table').getBoundingClientRect();
  return { rows, table: { left: t.left, right: t.right }, html: Editor.getHTML(), pending: Editor.hasPendingTrackedChanges(), tracking: Editor.isTrackChangesOn() };
});
// Chaque ligne a `cols` cases qui se suivent bord à bord, aucune écrasée : une case sortie de la ligne (ancien rendu : une bande de 11 px) fait échouer ce test.
const inLine = (s, cols) => s.rows.length > 0 && s.rows.every(cells => cells.length === cols && cells.every((c, i) => c.right - c.left > 20 && (i === 0 || Math.abs(c.left - cells[i - 1].right) < 2)));
const insideTable = s => s.rows.every(cells => cells.every(c => c.left >= s.table.left - 1 && c.right <= s.table.right + 1));
const colsOf = s => s.rows.map(cells => cells.length).join(',');
const kindsAt = (s, kind) => s.rows.map(cells => cells.findIndex(c => c.kind === kind)).join(',');

async function loadDoc(html) {
  await page.evaluate(h => { Editor.setTrackChanges(false); Editor.setHTML(h); }, html);
  await settle();
}
async function trackOn() {
  if (await page.evaluate(() => Editor.isTrackChangesOn())) return;
  await page.click('#v2-btn-track-changes');
  await sleep(250);
}
async function clickCell(index) {
  await page.click(`.tiptap td >> nth=${index}`);
  await sleep(300);
}
// Un clic sur une case, la souris garée d'abord au bas du panneau : les menus de la barre d'outils s'ouvrent au survol (celui des listes, après un clic sur la barre du tableau tout en haut) et recouvriraient la case visée.
async function clickCellAway(index) {
  await page.mouse.move(WIDTH / 2, HEIGHT - 6);
  await sleep(350);
  await clickCell(index);
}
async function clickBar(action) {
  await page.click(`.v2-floating-toolbar.visible button[data-action="${action}"]`);
  await settle();
}
// Vrai clic de souris au centre du bouton (page.click refuse les boutons aria-disabled, alors que l'utilisateur, lui, clique dessus).
async function mouseClickBar(action) {
  const box = await page.locator(`.v2-floating-toolbar.visible button[data-action="${action}"]`).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await settle();
}
async function resolveAll(button) {
  await page.click(`#${button}`);
  await settle();
}
async function undo() { await page.keyboard.press('Control+z'); await settle(); }
async function redo() { await page.keyboard.press('Control+y'); await settle(); }
const barButton = action => page.evaluate(a => { const b = document.querySelector(`.v2-floating-toolbar button[data-action="${a}"]`); return { visible: b.closest('.v2-floating-toolbar').classList.contains('visible'), aria: b.getAttribute('aria-disabled'), disabled: b.classList.contains('is-disabled'), title: b.title }; }, action);
// La barre « Accepter / Refuser » (js/floating-toolbars.js:wireSuggestionFloatingToolbar) : ouverte ou non, son cadre, et si la souris atteint bien chaque bouton (rien ne la recouvre, pas même la barre du tableau).
const suggestBar = () => page.evaluate(() => {
  const el = document.querySelector('.v2-suggest-toolbar');
  if (!el) return { visible: false, buttons: [], overlapsTableBar: false };
  const r = el.getBoundingClientRect();
  const buttons = [...el.querySelectorAll('button')].map(b => {
    const br = b.getBoundingClientRect();
    const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
    return { action: b.dataset.action, title: b.title, x: br.left + br.width / 2, y: br.top + br.height / 2, reachable: hit === b };
  });
  const others = [...document.querySelectorAll('.v2-floating-toolbar.visible')].filter(o => o !== el).map(o => o.getBoundingClientRect());
  const overlapsTableBar = others.some(o => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top);
  return { visible: el.classList.contains('visible'), left: r.left, top: r.top, right: r.right, bottom: r.bottom, buttons, overlapsTableBar };
});
// Un vrai clic de souris sur un bouton de la barre « Accepter / Refuser ».
async function clickSuggestBar(action) {
  const b = (await suggestBar()).buttons.find(btn => btn.action === action);
  if (b) await page.mouse.click(b.x, b.y);
  await settle();
  return !!b;
}
// Le fond d'une case et la largeur d'une colonne posés à la vraie souris : la puce « Fond de cellule » de la barre du tableau puis une nuance, le bord droit de la première colonne glissé de `dx` pixels.
async function pickFill(color) {
  await page.click('#v2-table-fill-btn');
  await sleep(250);
  await page.click(`.v2-color-dropdown.visible button[data-action="pick:${color}"]`);
  await settle();
}
// Le bord droit de la `index`-ième case (dans l'ordre du document) glissé de `dx` pixels, comme dragFirstColumnBorder.
async function dragCellBorder(index, dx) {
  const border = await page.evaluate(i => { const r = document.querySelectorAll('.tiptap td')[i].getBoundingClientRect(); return { x: r.right - 1, y: r.top + r.height / 2 }; }, index);
  await page.mouse.move(border.x - 30, border.y);
  await page.mouse.move(border.x, border.y, { steps: 4 });
  await sleep(200);
  await page.mouse.down();
  await page.mouse.move(border.x + dx, border.y, { steps: 6 });
  await page.mouse.up();
  await settle();
}
const centerOf = selector => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
// L'alignement choisi à la vraie souris : survol de l'icône Alignement, arrivée par le bas du document (jamais par-dessus un autre volet de la barre d'outils), puis clic sur l'alignement du volet.
async function alignWith(name) {
  const c = await centerOf('#v2-btn-align-main');
  await page.mouse.move(c.x, c.y + 150);
  await page.mouse.move(c.x, c.y, { steps: 4 });
  await sleep(350);
  const b = await centerOf('#v2-btn-align-' + name);
  await page.mouse.click(b.x, b.y);
  await settle();
  await page.mouse.move(WIDTH / 2, HEIGHT - 6, { steps: 3 });
  await sleep(300);
}
async function dragFirstColumnBorder(dx) {
  const border = await page.evaluate(() => { const r = document.querySelector('.tiptap td').getBoundingClientRect(); return { x: r.right - 1, y: r.top + r.height / 2 }; });
  await page.mouse.move(border.x - 30, border.y);
  await page.mouse.move(border.x, border.y, { steps: 4 });
  await sleep(200);
  await page.mouse.down();
  await page.mouse.move(border.x + dx, border.y, { steps: 6 });
  await page.mouse.up();
  await settle();
}
const colwidths = html => (html.match(/colwidth="(\d+)"/g) || []).map(w => Number(w.match(/\d+/)[0]));
const modificationMarks = html => (html.match(/data-tc-modification/g) || []).length;

for (const dark of [false, true]) {
  const theme = dark ? 'sombre' : 'clair';
  page = await openPage(dark);
  console.log(`\n--- thème ${theme} ---`);

  // 1) Tableau « automatique » : colonne ajoutée par la barre à la vraie souris.
  await loadDoc(AUTO);
  const original = plain((await tableState()).html);
  await trackOn();
  check(`[${theme}] le bouton de suivi (vraie souris) allume le suivi`, (await tableState()).tracking === true);
  await clickCell(1);
  await clickBar('col-after');
  const added = await tableState();
  check(`[${theme}] « Colonne après » avec le suivi : 4 cases par ligne, alignées, dans le tableau, la nouvelle au rang 3`,
    inLine(added, 4) && insideTable(added) && kindsAt(added, 'ins') === '2,2' && added.pending, { cols: colsOf(added), ins: kindsAt(added, 'ins'), inLine: inLine(added, 4) });
  const insCell = added.rows[0][2];
  check(`[${theme}] la case ajoutée est teintée de vert pâle, texte à 4,5:1 au moins`,
    insCell.bg === 'rgb(229, 246, 238)' && contrast(insCell.color, insCell.bg) >= 4.5, { bg: insCell.bg, color: insCell.color, ratio: contrast(insCell.color, insCell.bg) });
  check(`[${theme}] le HTML enregistré porte la marque en attribut de la case, sans <ins> entre les cases`,
    (added.html.match(/<td[^>]* data-tc-insertion="\d+"/g) || []).length === 2 && !/<\/td><ins|<tr><ins/.test(added.html), added.html);

  await undo();
  const undone = await tableState();
  check(`[${theme}] Ctrl+Z (vraie touche) : la colonne disparaît, le tableau est exactement celui d'avant`, plain(undone.html) === original && !undone.pending && colsOf(undone) === '3,3', { cols: colsOf(undone) });
  await redo();
  const redone = await tableState();
  check(`[${theme}] Ctrl+Y (vraie touche) : la colonne ajoutée revient avec sa marque`, plain(redone.html) === plain(added.html) && redone.pending, { cols: colsOf(redone) });

  await resolveAll('v2-btn-reject-all');
  const rejected = await tableState();
  check(`[${theme}] « Tout refuser » (vraie souris) : la colonne ajoutée disparaît, tableau et texte d'origine, plus aucune suggestion`,
    plain(rejected.html) === original && !rejected.pending && inLine(rejected, 3), { cols: colsOf(rejected) });

  // 2) Colonne supprimée : gardée, barrée, teintée de rouge ; acceptée, elle part.
  await clickCell(1);
  await clickBar('col-del');
  const deleted = await tableState();
  check(`[${theme}] « Supprimer la colonne » avec le suivi : la colonne reste (3 cases par ligne, alignées), marquée supprimée au rang 2`,
    inLine(deleted, 3) && insideTable(deleted) && kindsAt(deleted, 'del') === '1,1' && deleted.pending && /b1/.test(deleted.html) && /b2/.test(deleted.html), { cols: colsOf(deleted), del: kindsAt(deleted, 'del') });
  const delCell = deleted.rows[0][1];
  check(`[${theme}] la case supprimée est barrée, teintée de rouge pâle, texte à 4,5:1 au moins`,
    delCell.deco.includes('line-through') && delCell.bg === 'rgb(251, 233, 233)' && contrast(delCell.color, delCell.bg) >= 4.5, { deco: delCell.deco, bg: delCell.bg, color: delCell.color, ratio: contrast(delCell.color, delCell.bg) });
  await resolveAll('v2-btn-accept-all');
  const acceptedDel = await tableState();
  check(`[${theme}] « Tout accepter » (vraie souris) : la colonne supprimée part, 2 colonnes alignées, plus aucune suggestion`,
    colsOf(acceptedDel) === '2,2' && inLine(acceptedDel, 2) && !acceptedDel.pending && !/b1|b2/.test(acceptedDel.html), { cols: colsOf(acceptedDel) });

  // 3) Tableau aux largeurs fixées (le cas courant d'un vrai modèle) : la colonne ajoutée reste refusable, Ctrl+Z rend les largeurs.
  await loadDoc(FIXED);
  const fixedOriginal = plain((await tableState()).html);
  await trackOn();
  await clickCell(1);
  await clickBar('col-before');
  const fixedAdded = await tableState();
  const mods = (fixedAdded.html.match(/data-tc-modification/g) || []).length;
  const insertions = (fixedAdded.html.match(/data-tc-insertion/g) || []).length;
  check(`[${theme}] tableau à largeurs fixées : 4 cases alignées dans la page, 2 insertions, aucune marque de modification de largeur`,
    inLine(fixedAdded, 4) && insideTable(fixedAdded) && insertions === 2 && mods === 0, { cols: colsOf(fixedAdded), insertions, mods });
  await undo();
  const fixedUndone = await tableState();
  check(`[${theme}] tableau à largeurs fixées, Ctrl+Z : une seule frappe rend le tableau et ses largeurs`, plain(fixedUndone.html) === fixedOriginal && !fixedUndone.pending, { cols: colsOf(fixedUndone) });
  await redo();
  await resolveAll('v2-btn-reject-all');
  const fixedRejected = await tableState();
  check(`[${theme}] tableau à largeurs fixées, « Tout refuser » : retour à 3 colonnes alignées, sans suggestion`, colsOf(fixedRejected) === '3,3' && inLine(fixedRejected, 3) && !fixedRejected.pending, { cols: colsOf(fixedRejected) });

  // 4) Une colonne ajoutée et une supprimée en attente survivent à l'enregistrement (HTML) puis à la réouverture.
  await loadDoc(AUTO);
  await trackOn();
  await clickCell(1);
  await clickBar('col-after');
  await clickCell(3); // « c1 » : la colonne ajoutée est maintenant la troisième (supprimer SA propre insertion l'annulerait tout simplement)
  await clickBar('col-del');
  const pendingBoth = await tableState();
  await page.evaluate(() => { const html = Editor.getHTML(); Editor.setHTML(html); });
  await settle();
  const reopened = await tableState();
  check(`[${theme}] enregistrement puis réouverture : la colonne ajoutée et la colonne supprimée sont toujours en attente, à l'identique`,
    reopened.html === pendingBoth.html && reopened.pending && kindsAt(reopened, 'ins') === kindsAt(pendingBoth, 'ins') && kindsAt(reopened, 'del') === kindsAt(pendingBoth, 'del') && inLine(reopened, 4),
    { avant: pendingBoth.html, apres: reopened.html });
  await resolveAll('v2-btn-accept-all');
  const afterReopenAccept = await tableState();
  check(`[${theme}] après réouverture, « Tout accepter » donne le tableau voulu : colonne ajoutée gardée, colonne supprimée partie`, colsOf(afterReopenAccept) === '3,3' && !afterReopenAccept.pending && !/c1|c2/.test(afterReopenAccept.html), { cols: colsOf(afterReopenAccept), html: afterReopenAccept.html });

  // 5) Cellule fusionnée : « Supprimer la colonne » grisé avec son explication (sans effet au clic), ajout à travers la cellule proprement résolu.
  await loadDoc(MERGED);
  const mergedOriginal = plain((await tableState()).html);
  await trackOn();
  await clickCell(3); // b2, sous la cellule fusionnée « ab »
  const grey = await barButton('col-del');
  check(`[${theme}] cellule fusionnée au-dessus : « Supprimer la colonne » est grisé (aria-disabled) et dit pourquoi`, grey.visible && grey.aria === 'true' && grey.disabled && /fusionn/.test(grey.title), grey);
  await mouseClickBar('col-del');
  const greyClick = await tableState();
  check(`[${theme}] clic sur « Supprimer la colonne » grisé : rien ne change, aucune suggestion`, plain(greyClick.html) === mergedOriginal && !greyClick.pending, { cols: colsOf(greyClick) });
  await clickBar('col-before');
  const mergedAdded = await tableState();
  check(`[${theme}] colonne ajoutée à travers la cellule fusionnée : 2 lignes de 4 colonnes de large, alignées, la cellule fusionnée s'élargit`,
    mergedAdded.rows[0].length === 2 && mergedAdded.rows[1].length === 4 && mergedAdded.pending && /colspan="3"/.test(mergedAdded.html), { cols: colsOf(mergedAdded) });
  await resolveAll('v2-btn-reject-all');
  const mergedRejected = await tableState();
  check(`[${theme}] « Tout refuser » rend le tableau à cellule fusionnée tel qu'il était`, plain(mergedRejected.html) === mergedOriginal && !mergedRejected.pending, { html: mergedRejected.html });
  await clickCell(4); // c2 : colonne libre
  const free = await barButton('col-del');
  check(`[${theme}] hors de la cellule fusionnée, « Supprimer la colonne » est actif`, free.aria === 'false' && !free.disabled && free.title === 'Supprimer la colonne', free);

  // 6) Suivi coupé : les boutons agissent tout de suite, sans trace de suivi.
  await loadDoc(AUTO);
  await clickCell(1);
  await clickBar('col-after');
  const plainAdded = await tableState();
  check(`[${theme}] suivi coupé : « Colonne après » ajoute la colonne pour de bon, sans marque`, colsOf(plainAdded) === '4,4' && !plainAdded.pending && !/data-tc-|<ins|<del/.test(plainAdded.html), { cols: colsOf(plainAdded) });

  if (!dark) {
    // 7) Fond de cellule et largeur de colonne avec le suivi (demande d'Antoine du 04/10, carte « Corriger ») : l'un et l'autre posent une marque de modification sur les cases touchées, que la barre
    // « Accepter / Refuser » ne propose jamais ; « Tout refuser » (vraie souris) les rend, d'un seul Ctrl+Z, et « Tout accepter » les garde. Avant la correction, la page se figeait (puis, une fois
    // débloquée, le fond et la largeur restaient en attente).
    await loadDoc(FIXED);
    const cellOriginal = plain((await tableState()).html);
    await trackOn();
    await clickCell(1);
    await page.click('#v2-table-fill-btn');
    await sleep(250);
    await page.click('.v2-color-dropdown.visible button[data-action="pick:#fff2a8"]');
    await settle();
    const filled = await tableState();
    check(`[${theme}] fond de cellule (puce « Fond de cellule », vraie souris) avec le suivi : la case b1 est jaune, une marque de modification en attente`,
      filled.rows[0][1].bg === 'rgb(255, 242, 168)' && (filled.html.match(/data-tc-modification/g) || []).length === 1 && filled.pending, { bg: filled.rows[0][1].bg, html: filled.html });
    const border = await page.evaluate(() => { const r = document.querySelector('.tiptap td').getBoundingClientRect(); return { x: r.right - 1, y: r.top + r.height / 2 }; });
    await page.mouse.move(border.x - 30, border.y);
    await page.mouse.move(border.x, border.y, { steps: 4 });
    await sleep(200);
    await page.mouse.down();
    await page.mouse.move(border.x - 40, border.y, { steps: 6 });
    await page.mouse.up();
    await settle();
    const dragged = await tableState();
    const firstWidth = Number((dragged.html.match(/colwidth="(\d+)"/) || [])[1]);
    check(`[${theme}] largeur de colonne (bord glissé à la vraie souris) avec le suivi : la première colonne est plus étroite, une marque par case touchée (3 en tout avec le fond)`,
      firstWidth > 0 && firstWidth < 150 && (dragged.html.match(/data-tc-modification/g) || []).length === 3 && dragged.pending, { firstWidth, html: dragged.html });
    check(`[${theme}] la barre « Accepter / Refuser » propose le fond de la case b1 (curseur dedans), pas la largeur de la colonne d'à côté`,
      await page.evaluate(() => TrackChanges.selectionSuggestionIds(EditorCore.getEditor().state).length === 1));
    await resolveAll('v2-btn-reject-all');
    const answers = await Promise.race([page.evaluate(() => true), sleep(5000).then(() => false)]);
    check(`[${theme}] « Tout refuser » (vraie souris) : la page répond, elle ne se fige pas`, answers === true);
    const refused = await tableState();
    check(`[${theme}] « Tout refuser » rend le tableau d'avant : largeurs d'origine, case b1 sans fond, aucune marque, plus aucune suggestion`,
      plain(refused.html) === cellOriginal && refused.rows[0][1].bg === 'rgba(0, 0, 0, 0)' && !/data-tc-modification|background-color/.test(refused.html) && !refused.pending, { html: refused.html, bg: refused.rows[0][1].bg });
    await undo();
    const refusedUndone = await tableState();
    check(`[${theme}] un seul Ctrl+Z (vraie touche) remet le fond et la largeur en attente`,
      refusedUndone.rows[0][1].bg === 'rgb(255, 242, 168)' && (refusedUndone.html.match(/data-tc-modification/g) || []).length === 3 && refusedUndone.pending, { html: refusedUndone.html });
    await resolveAll('v2-btn-accept-all');
    const kept = await tableState();
    check(`[${theme}] « Tout accepter » (vraie souris) garde le fond et la largeur, sans marque`,
      kept.rows[0][1].bg === 'rgb(255, 242, 168)' && Number((kept.html.match(/colwidth="(\d+)"/) || [])[1]) === firstWidth && !/data-tc-modification/.test(kept.html) && !kept.pending, { html: kept.html });
    await page.evaluate(() => Editor.setTrackChanges(false));
  }

  if (!dark) {
    // 8) Langue : l'explication du bouton grisé suit la langue de l'interface.
    await page.evaluate(() => I18n.setLang('en'));
    await loadDoc(MERGED);
    await trackOn();
    await clickCell(3);
    const grey = await barButton('col-del');
    check('[anglais] « Supprimer la colonne » grisé : l\'explication est en anglais', grey.aria === 'true' && /merged cell/.test(grey.title), grey);
    await page.evaluate(() => I18n.setLang('fr'));
    await page.evaluate(() => Editor.setTrackChanges(false));
  }
  if (!dark) {
    // 9) Le fond d'une cellule, un par un (demande d'Antoine du 04/10, carte « Corriger ») : la barre « Accepter / Refuser » s'ouvre sous le curseur dans une case colorée, « Refuser » rend la case sans fond et laisse
    // l'autre en attente, « Accepter » garde l'autre ; la barre est atteignable à la souris dans le panneau 700x400, sans recouvrir la barre du tableau. Avant, la barre ne voyait pas ces marques.
    await loadDoc(FIXED);
    const fillOriginal = plain((await tableState()).html);
    await trackOn();
    await clickCellAway(1);
    await pickFill('#fff2a8');
    await clickCellAway(3);
    await pickFill('#c8f7c5');
    const colored = await tableState();
    check(`[${theme}] deux cases colorées (puce « Fond de cellule », vraie souris) : b1 jaune, a2 verte, deux marques en attente`,
      colored.rows[0][1].bg === 'rgb(255, 242, 168)' && colored.rows[1][0].bg === 'rgb(200, 247, 197)' && modificationMarks(colored.html) === 2 && colored.pending, { bg: [colored.rows[0][1].bg, colored.rows[1][0].bg], html: colored.html });
    await clickCellAway(2);
    check(`[${theme}] curseur dans une case sans réglage en attente (c1) : la barre « Accepter / Refuser » reste fermée`, !(await suggestBar()).visible);
    await clickCellAway(1);
    const onYellow = await suggestBar();
    check(`[${theme}] curseur dans la case jaune (vrai clic) : la barre s'ouvre, dans le panneau 700x400, atteinte par la souris, sans recouvrir la barre du tableau`,
      onYellow.visible && onYellow.left >= 0 && onYellow.right <= WIDTH && onYellow.top >= 0 && onYellow.bottom <= HEIGHT && onYellow.buttons.length === 2 && onYellow.buttons.every(b => b.reachable) && !onYellow.overlapsTableBar, onYellow);
    await clickSuggestBar('reject');
    const refusedYellow = await tableState();
    check(`[${theme}] « Refuser » (vraie souris) : b1 n'a plus de fond, a2 reste verte en attente (une marque), la barre se ferme`,
      refusedYellow.rows[0][1].bg === 'rgba(0, 0, 0, 0)' && refusedYellow.rows[1][0].bg === 'rgb(200, 247, 197)' && modificationMarks(refusedYellow.html) === 1 && refusedYellow.pending && !(await suggestBar()).visible, { bg: [refusedYellow.rows[0][1].bg, refusedYellow.rows[1][0].bg], html: refusedYellow.html });
    await clickCellAway(3);
    check(`[${theme}] curseur dans la case verte : la barre s'ouvre`, (await suggestBar()).visible);
    await clickSuggestBar('accept');
    const acceptedGreen = await tableState();
    check(`[${theme}] « Accepter » (vraie souris) : a2 garde son vert, plus aucune marque ni suggestion`,
      acceptedGreen.rows[1][0].bg === 'rgb(200, 247, 197)' && modificationMarks(acceptedGreen.html) === 0 && !acceptedGreen.pending, { html: acceptedGreen.html });
    await undo();
    const undoneGreen = await tableState();
    check(`[${theme}] un seul Ctrl+Z (vraie touche) remet le vert de a2 en attente`, undoneGreen.rows[1][0].bg === 'rgb(200, 247, 197)' && modificationMarks(undoneGreen.html) === 1 && undoneGreen.pending, { html: undoneGreen.html });
    await clickCellAway(3);
    await clickSuggestBar('reject');
    const allRefused = await tableState();
    check(`[${theme}] tout refusé un par un : le tableau d'origine, plus aucune suggestion`, plain(allRefused.html) === fillOriginal && !allRefused.pending, { html: allRefused.html });
    await page.evaluate(() => Editor.setTrackChanges(false));

    // 10) La largeur d'une colonne tirée à la souris : la barre s'ouvre depuis n'importe quelle case de la colonne et résout toute la colonne (une marque par case, un id chacune) ; une colonne d'à côté, tirée aussi, reste en attente.
    await loadDoc(FIXED);
    const widthOriginal = plain((await tableState()).html);
    await trackOn();
    await clickCellAway(0);
    await dragFirstColumnBorder(-40);
    const pulled = await tableState();
    const pulledWidths = colwidths(pulled.html);
    check(`[${theme}] bord de la première colonne glissé (vraie souris) : la colonne est plus étroite sur ses deux cases, une marque par case`,
      pulledWidths.length === 6 && pulledWidths[0] < 150 && pulledWidths[0] === pulledWidths[3] && pulledWidths.slice(1, 3).concat(pulledWidths.slice(4)).every(w => w === 150) && modificationMarks(pulled.html) === 2 && pulled.pending, { pulledWidths, html: pulled.html });
    await clickCellAway(3);
    const onBottom = await suggestBar();
    check(`[${theme}] curseur dans la case du BAS de la colonne tirée (vrai clic) : la barre s'ouvre, dans le panneau, atteinte par la souris, sans recouvrir la barre du tableau`,
      onBottom.visible && onBottom.left >= 0 && onBottom.right <= WIDTH && onBottom.top >= 0 && onBottom.bottom <= HEIGHT && onBottom.buttons.every(b => b.reachable) && !onBottom.overlapsTableBar, onBottom);
    await clickSuggestBar('reject');
    const widthRefused = await tableState();
    const cellWidth = c => c.right - c.left;
    check(`[${theme}] « Refuser » (vraie souris) rend la largeur d'avant à TOUTE la colonne : six largeurs de 150, cases alignées sur leur largeur d'origine, plus aucune marque`,
      colwidths(widthRefused.html).join() === '150,150,150,150,150,150' && modificationMarks(widthRefused.html) === 0 && !widthRefused.pending
        && widthRefused.rows.every(cells => Math.abs(cellWidth(cells[0]) - cellWidth(cells[1])) < 3) && plain(widthRefused.html) === widthOriginal, { widths: colwidths(widthRefused.html), html: widthRefused.html });
    await dragFirstColumnBorder(-40);
    await clickCellAway(0);
    check(`[${theme}] la colonne retirée de nouveau : la barre s'ouvre depuis la case du HAUT`, (await suggestBar()).visible);
    await clickSuggestBar('accept');
    const widthKept = await tableState();
    const keptWidths = colwidths(widthKept.html);
    check(`[${theme}] « Accepter » (vraie souris) garde la largeur sur toute la colonne, sans marque`,
      keptWidths.length === 6 && keptWidths[0] < 150 && keptWidths[0] === keptWidths[3] && modificationMarks(widthKept.html) === 0 && !widthKept.pending, { keptWidths, html: widthKept.html });
    await undo();
    const widthUndone = await tableState();
    check(`[${theme}] un seul Ctrl+Z (vraie touche) remet la largeur de la colonne entière en attente (deux marques)`, modificationMarks(widthUndone.html) === 2 && colwidths(widthUndone.html)[0] === keptWidths[0] && widthUndone.pending, { html: widthUndone.html });
    await page.evaluate(() => Editor.setTrackChanges(false));
  }
  if (!dark) {
    // 11) « Refuser » rend la valeur d'ORIGINE même après plusieurs glissés du même bord, et, sur un tableau inséré à la main (largeurs jamais fixées : le widget fige les autres colonnes dès le premier glissé, hors
    // suivi), la mise en page d'origine - toutes les colonnes de nouveau « automatiques », à la largeur d'avant. Avant, le refus rendait la largeur d'entre-deux, puis le widget figeait de nouveau la colonne.
    const widthsOfRows = state => state.rows.map(cells => cells.map(c => Math.round(c.right - c.left)));
    const closeTo = (a, b) => a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((w, j) => Math.abs(w - b[i][j]) <= 2));
    await loadDoc(AUTO);
    const autoState = await tableState();
    const autoOriginal = plain(autoState.html);
    const autoOriginalWidths = widthsOfRows(autoState);
    await trackOn();
    await clickCellAway(0);
    await dragFirstColumnBorder(-40);
    await dragFirstColumnBorder(-30);
    const autoPulled = await tableState();
    check(`[${theme}] tableau aux largeurs jamais fixées, bord glissé deux fois (vraie souris) : la première colonne est plus étroite, les autres figées par le widget, une marque par case de la colonne`,
      widthsOfRows(autoPulled)[0][0] < autoOriginalWidths[0][0] - 30 && colwidths(autoPulled.html).length === 6 && modificationMarks(autoPulled.html) === 2 && autoPulled.pending, { widths: widthsOfRows(autoPulled), html: autoPulled.html });
    await clickCellAway(3);
    await clickSuggestBar('reject');
    const autoRefused = await tableState();
    check(`[${theme}] « Refuser » (vraie souris) : le tableau d'origine - aucune largeur fixée, colonnes de leur largeur d'avant (à 2 px près), plus aucune suggestion`,
      plain(autoRefused.html) === autoOriginal && colwidths(autoRefused.html).length === 0 && closeTo(widthsOfRows(autoRefused), autoOriginalWidths) && !autoRefused.pending,
      { widths: widthsOfRows(autoRefused), original: autoOriginalWidths, html: autoRefused.html });
    await undo();
    const autoUndone = await tableState();
    check(`[${theme}] un seul Ctrl+Z (vraie touche) remet la largeur tirée en attente, les autres colonnes figées comme avant`, modificationMarks(autoUndone.html) === 2 && colwidths(autoUndone.html).length === 6 && autoUndone.pending, { html: autoUndone.html });
    await resolveAll('v2-btn-reject-all');
    const autoAllRefused = await tableState();
    check(`[${theme}] « Tout refuser » (vraie souris) rend de même le tableau d'origine, largeurs comprises`,
      plain(autoAllRefused.html) === autoOriginal && colwidths(autoAllRefused.html).length === 0 && closeTo(widthsOfRows(autoAllRefused), autoOriginalWidths) && !autoAllRefused.pending, { widths: widthsOfRows(autoAllRefused), html: autoAllRefused.html });
    await page.evaluate(() => Editor.setTrackChanges(false));

    // Largeurs fixées : deux glissés, « Refuser » rend la largeur d'origine à toute la colonne (pas celle du premier glissé).
    await loadDoc(FIXED);
    const fixedState = await tableState();
    const fixedOriginal = plain(fixedState.html);
    await trackOn();
    await clickCellAway(0);
    await dragFirstColumnBorder(-40);
    await dragFirstColumnBorder(-30);
    const fixedPulled = await tableState();
    check(`[${theme}] tableau aux largeurs fixées, bord glissé deux fois (vraie souris) : la colonne a perdu 70 px sur ses deux cases, deux marques`,
      colwidths(fixedPulled.html)[0] < 100 && colwidths(fixedPulled.html)[0] === colwidths(fixedPulled.html)[3] && modificationMarks(fixedPulled.html) === 2, { widths: colwidths(fixedPulled.html) });
    await clickCellAway(3);
    await clickSuggestBar('reject');
    const fixedRefused = await tableState();
    check(`[${theme}] « Refuser » (vraie souris) rend les 150 d'origine à toute la colonne, pas la largeur du premier glissé`,
      colwidths(fixedRefused.html).join() === '150,150,150,150,150,150' && plain(fixedRefused.html) === fixedOriginal && !fixedRefused.pending, { widths: colwidths(fixedRefused.html) });
    await page.evaluate(() => Editor.setTrackChanges(false));
  }
  if (!dark) {
    // 12) Une colonne ajoutée ou supprimée puis colorée ou tirée, et un alignement changé deux fois (carte « Aussi l'alignement », 04/10). Une marque de modification exclut l'insertion et la suppression : le fond ou
    // la largeur posé sur une case de colonne ajoutée lui retirait sa marque d'ajout (« Tout refuser » laissait la colonne), sur une case de colonne supprimée sa marque de suppression (« Tout accepter » rendait un
    // tableau percé). Maintenant le réglage fait partie de l'ajout, et n'a pas lieu sur ce qui se supprime ; l'alignement d'un paragraphe changé deux fois se refuse jusqu'à l'alignement d'origine.
    const cellsWith = (html, name) => (html.match(new RegExp('<td[^>]* data-tc-' + name + '=', 'g')) || []).length;
    const FILL_YELLOW = /background-color: rgb\(255, 242, 168\)/;
    const widthOf = (state, row, col) => Math.round(state.rows[row][col].right - state.rows[row][col].left);

    // Colonne ajoutée puis colorée, refusée à la barre.
    await loadDoc(AUTO);
    const addOriginal = plain((await tableState()).html);
    await trackOn();
    await clickCellAway(1);
    await clickBar('col-after');
    await clickCellAway(2);
    await pickFill('#fff2a8');
    const addFilled = await tableState();
    check(`[${theme}] colonne ajoutée puis colorée (vraie souris) : ses deux cases gardent leur marque d'ajout, aucune marque de modification, le fond est dans le document`,
      colsOf(addFilled) === '4,4' && cellsWith(addFilled.html, 'insertion') === 2 && modificationMarks(addFilled.html) === 0 && FILL_YELLOW.test(addFilled.html) && addFilled.pending, { html: addFilled.html });
    await clickCellAway(2);
    const addBar = await suggestBar();
    check(`[${theme}] la barre « Accepter / Refuser » s'ouvre sur la colonne ajoutée et colorée : dans le panneau, atteinte par la souris, sans recouvrir la barre du tableau`,
      addBar.visible && addBar.left >= 0 && addBar.right <= WIDTH && addBar.top >= 0 && addBar.bottom <= HEIGHT && addBar.buttons.length === 2 && addBar.buttons.every(b => b.reachable) && !addBar.overlapsTableBar, addBar);
    await clickSuggestBar('reject');
    const addRefused = await tableState();
    check(`[${theme}] « Refuser » (vraie souris) enlève toute la colonne ajoutée et colorée : le tableau d'origine, trois colonnes alignées, plus aucune suggestion`,
      plain(addRefused.html) === addOriginal && colsOf(addRefused) === '3,3' && inLine(addRefused, 3) && !addRefused.pending, { cols: colsOf(addRefused), html: addRefused.html });
    await undo();
    const addUndone = await tableState();
    check(`[${theme}] un seul Ctrl+Z (vraie touche) rend la colonne colorée, avec sa marque d'ajout`,
      colsOf(addUndone) === '4,4' && cellsWith(addUndone.html, 'insertion') === 2 && modificationMarks(addUndone.html) === 0 && FILL_YELLOW.test(addUndone.html) && addUndone.pending, { html: addUndone.html });
    await clickCellAway(2);
    await clickSuggestBar('accept');
    const addAccepted = await tableState();
    check(`[${theme}] « Accepter » (vraie souris) garde la colonne et son fond, sans marque`,
      colsOf(addAccepted) === '4,4' && inLine(addAccepted, 4) && FILL_YELLOW.test(addAccepted.html) && cellsWith(addAccepted.html, 'insertion') === 0 && modificationMarks(addAccepted.html) === 0 && !addAccepted.pending, { html: addAccepted.html });
    await page.evaluate(() => Editor.setTrackChanges(false));

    // Colonne ajoutée puis colorée, refusée par « Tout refuser ».
    await loadDoc(AUTO);
    await trackOn();
    await clickCellAway(1);
    await clickBar('col-after');
    await clickCellAway(2);
    await pickFill('#fff2a8');
    await resolveAll('v2-btn-reject-all');
    const addAllRefused = await tableState();
    check(`[${theme}] « Tout refuser » (vraie souris) enlève la colonne ajoutée et colorée : le tableau d'origine, plus aucune suggestion`,
      plain(addAllRefused.html) === addOriginal && colsOf(addAllRefused) === '3,3' && inLine(addAllRefused, 3) && !addAllRefused.pending, { cols: colsOf(addAllRefused), html: addAllRefused.html });
    await page.evaluate(() => Editor.setTrackChanges(false));

    // Colonne ajoutée puis tirée (largeurs fixées) : « Tout refuser » rend le même tableau que sans la largeur tirée.
    await loadDoc(FIXED);
    await trackOn();
    await clickCellAway(1);
    await clickBar('col-after');
    await resolveAll('v2-btn-reject-all');
    const addControl = plain((await tableState()).html);
    await loadDoc(FIXED);
    await trackOn();
    await clickCellAway(1);
    await clickBar('col-after');
    const beforeDrag = await tableState();
    await dragCellBorder(2, -30);
    const addDragged = await tableState();
    check(`[${theme}] colonne ajoutée puis bord glissé (vraie souris) : la colonne est plus étroite, ses cases gardent leur marque d'ajout, aucune marque de modification`,
      widthOf(addDragged, 0, 2) < widthOf(beforeDrag, 0, 2) - 15 && widthOf(addDragged, 1, 2) === widthOf(addDragged, 0, 2) && cellsWith(addDragged.html, 'insertion') === 2 && modificationMarks(addDragged.html) === 0 && addDragged.pending,
      { before: widthOf(beforeDrag, 0, 2), after: widthOf(addDragged, 0, 2), html: addDragged.html });
    await resolveAll('v2-btn-reject-all');
    const addDragRefused = await tableState();
    check(`[${theme}] « Tout refuser » (vraie souris) enlève la colonne ajoutée et tirée comme celle qui ne l'est pas : même tableau, plus aucune suggestion`,
      plain(addDragRefused.html) === addControl && colsOf(addDragRefused) === '3,3' && inLine(addDragRefused, 3) && !addDragRefused.pending, { cols: colsOf(addDragRefused), html: addDragRefused.html, control: addControl });
    await page.evaluate(() => Editor.setTrackChanges(false));

    // Colonne supprimée puis colorée : le fond n'a pas lieu, la suppression reste entière.
    await loadDoc(AUTO);
    await trackOn();
    await clickCellAway(1);
    await clickBar('col-del');
    await clickCellAway(1);
    await pickFill('#fff2a8');
    const delFilled = await tableState();
    check(`[${theme}] colonne supprimée puis colorée (vraie souris) : le fond n'a pas lieu, les deux cases gardent leur marque de suppression, aucune marque de modification`,
      cellsWith(delFilled.html, 'deletion') === 2 && modificationMarks(delFilled.html) === 0 && !/background-color/.test(delFilled.html) && delFilled.pending, { html: delFilled.html });
    await resolveAll('v2-btn-accept-all');
    const delAccepted = await tableState();
    check(`[${theme}] « Tout accepter » (vraie souris) retire la colonne supprimée proprement : deux colonnes alignées, aucune case vide en trop`,
      colsOf(delAccepted) === '2,2' && inLine(delAccepted, 2) && !/b1|b2/.test(delAccepted.html) && !delAccepted.pending, { cols: colsOf(delAccepted), html: delAccepted.html });
    await undo();
    await resolveAll('v2-btn-reject-all');
    const delRefused = await tableState();
    check(`[${theme}] « Tout refuser » (vraie souris) rend le tableau d'origine à la colonne supprimée puis colorée`,
      plain(delRefused.html) === addOriginal && colsOf(delRefused) === '3,3' && !delRefused.pending, { cols: colsOf(delRefused), html: delRefused.html });
    await page.evaluate(() => Editor.setTrackChanges(false));

    // Alignement changé deux fois (vrai survol et vrai clic sur l'icône Alignement), refusé à la barre.
    const ALIGN_DOC = '<p>Un</p><p>Aligné</p>';
    const alignedState = () => page.evaluate(() => {
      const marks = [];
      const aligns = [];
      EditorCore.getEditor().state.doc.descendants(node => {
        if (node.type.name === 'paragraph') aligns.push(node.attrs.textAlign == null ? '-' : node.attrs.textAlign);
        node.marks.forEach(m => { if (m.type.name === 'modification' && m.attrs.attrName === 'textAlign') marks.push(JSON.stringify(m.attrs.previousValue) + '>' + JSON.stringify(m.attrs.newValue)); });
      });
      return { aligns: aligns.join(','), marks, html: Editor.getHTML(), pending: Editor.hasPendingTrackedChanges() };
    });
    const clickAligned = async () => { await page.mouse.move(WIDTH / 2, HEIGHT - 6); await sleep(350); await page.click('.tiptap p >> nth=1'); await sleep(300); };
    await loadDoc(ALIGN_DOC);
    const alignOriginal = (await alignedState()).html;
    await trackOn();
    await clickAligned();
    await alignWith('center');
    await clickAligned();
    await alignWith('right');
    const alignedTwice = await alignedState();
    check(`[${theme}] alignement changé deux fois (vraie souris) : une seule marque, qui garde l'alignement d'origine (aucun) et note « à droite »`,
      alignedTwice.aligns === '-,right' && alignedTwice.marks.join() === 'null>"right"' && alignedTwice.pending, alignedTwice);
    await clickAligned();
    const alignBar = await suggestBar();
    check(`[${theme}] la barre « Accepter / Refuser » s'ouvre sur le paragraphe réaligné : dans le panneau, atteinte par la souris`,
      alignBar.visible && alignBar.left >= 0 && alignBar.right <= WIDTH && alignBar.top >= 0 && alignBar.bottom <= HEIGHT && alignBar.buttons.length === 2 && alignBar.buttons.every(b => b.reachable), alignBar);
    await clickSuggestBar('reject');
    const alignRefused = await alignedState();
    check(`[${theme}] « Refuser » (vraie souris) rend l'alignement d'origine, pas le centré d'entre-deux : le document d'origine, plus aucune suggestion`,
      alignRefused.aligns === '-,-' && alignRefused.html === alignOriginal && alignRefused.marks.length === 0 && !alignRefused.pending, alignRefused);
    await undo();
    const alignUndone = await alignedState();
    check(`[${theme}] un seul Ctrl+Z (vraie touche) remet l'alignement à droite en attente, avec l'alignement d'origine`,
      alignUndone.aligns === '-,right' && alignUndone.marks.join() === 'null>"right"' && alignUndone.pending, alignUndone);
    await clickAligned();
    await clickSuggestBar('accept');
    const alignAccepted = await alignedState();
    check(`[${theme}] « Accepter » (vraie souris) garde l'alignement à droite, sans marque`, alignAccepted.aligns === '-,right' && alignAccepted.marks.length === 0 && !alignAccepted.pending, alignAccepted);
    await page.evaluate(() => Editor.setTrackChanges(false));
  }
  await page.context().close();
}

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
