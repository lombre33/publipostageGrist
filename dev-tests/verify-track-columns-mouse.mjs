#!/usr/bin/env node
// Colonnes d'un tableau avec le suivi des modifications allumé, à la vraie souris et au vrai clavier, à la taille du panneau Grist d'Antoine (~700x400), en
// thème clair puis sombre. Demande d'Antoine du 01/10 (« Faire marcher ») : « Colonne avant », « Colonne après » et « Supprimer la colonne » de la barre du tableau
// ne faisaient rien quand le suivi était allumé. La ligne du tableau n'acceptait pas la marque que le suivi pose sur chaque case de la colonne : la transaction était
// refusée (console.warn « Invalid content for node tableRow »). Elles posent maintenant une marque d'insertion ou de suppression sur chaque case, que ProseMirror
// dessine en <ins> / <del> directement dans le <tr> : sans règle d'affichage la case sortait de la ligne, d'où les mesures de géométrie ci-dessous (cases bord à bord,
// dans le tableau). Le HTML enregistré porte la marque en attribut de la case, parce qu'un <ins> posé autour d'un <td> ne survit pas à l'analyseur HTML du navigateur.
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
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
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, colorScheme: dark ? 'dark' : 'light' });
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
    // 7) Langue : l'explication du bouton grisé suit la langue de l'interface.
    await page.evaluate(() => I18n.setLang('en'));
    await loadDoc(MERGED);
    await trackOn();
    await clickCell(3);
    const grey = await barButton('col-del');
    check('[anglais] « Supprimer la colonne » grisé : l\'explication est en anglais', grey.aria === 'true' && /merged cell/.test(grey.title), grey);
    await page.evaluate(() => I18n.setLang('fr'));
    await page.evaluate(() => Editor.setTrackChanges(false));
  }
  await page.context().close();
}

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
