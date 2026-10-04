#!/usr/bin/env node
// Lignes d'un tableau avec le suivi des modifications allumé, à la vraie souris et au vrai clavier, à la taille du panneau Grist d'Antoine (~700x400), en thème clair puis
// sombre. Demande d'Antoine du 01/10 (carte « Faire marcher aussi Ligne avant / après et Supprimer la ligne avec le suivi ? », réponse « Corriger ») : même défaut que les
// colonnes avant leur correction. La marque que le suivi pose sur la LIGNE est dessinée par ProseMirror en <ins> / <del> autour du <tr>, directement dans le <tbody> : sans règle
// d'affichage la ligne sortait du tableau (une bande de quelques millimètres), d'où les mesures de géométrie ci-dessous (chaque ligne a la largeur du tableau). Le HTML enregistré
// porte la marque en attribut de la ligne (<tr data-tc-insertion="3">), parce qu'un <ins> posé autour d'un <tr> ne survit pas à l'analyseur HTML du navigateur : la ligne ajoutée
// n'était plus refusable à la réouverture, la ligne supprimée revenait comme si de rien n'était.
// Lancé par run-headless.mjs (groupe Node "trackRowsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-track-rows-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TRACK_ROWS_PORT || 8922);
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
if (!OFFLINE) console.log('[verify-track-rows-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

const ROWS3 = '<table><tbody><tr><td><p>a1</p></td><td><p>b1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td></tr><tr><td><p>a3</p></td><td><p>b3</p></td></tr></tbody></table><p>fin</p>';
const ROWSPAN = '<table><tbody><tr><td rowspan="2"><p>ab</p></td><td><p>c1</p></td></tr><tr><td><p>c2</p></td></tr><tr><td><p>a3</p></td><td><p>b3</p></td></tr></tbody></table><p>fin</p>';

const plain = h => h.replace(/ style="[^"]*"/g, '').replace(/<colgroup>.*?<\/colgroup>/, '').replace(/ colspan="1" rowspan="1"/g, '');
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const contrast = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

let page;
const tableState = () => page.evaluate(() => {
  const trs = Array.from(document.querySelectorAll('.tiptap tr')).map(tr => {
    const r = tr.getBoundingClientRect();
    const wrapper = tr.parentElement.tagName;
    const cells = Array.from(tr.querySelectorAll('td, th')).map(td => { const cs = getComputedStyle(td); return { bg: cs.backgroundColor, color: cs.color, deco: cs.textDecorationLine }; });
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, kind: wrapper === 'INS' ? 'ins' : wrapper === 'DEL' ? 'del' : 'plain', cells, text: tr.textContent };
  });
  const t = document.querySelector('.tiptap table').getBoundingClientRect();
  return { trs, table: { left: t.left, right: t.right }, html: Editor.getHTML(), pending: Editor.hasPendingTrackedChanges(), tracking: Editor.isTrackChangesOn() };
});
// Chaque ligne a la largeur du tableau (à 2 px près) et une vraie hauteur, les lignes se suivent sans trou ni chevauchement : une ligne sortie du tableau (ancien rendu :
// une bande de 22 à 49 px de large) fait échouer ce test.
const fullWidth = s => s.trs.length > 0 && s.trs.every((r, i) => r.right - r.left > 100 && Math.abs(r.left - s.table.left) < 2 && Math.abs(r.right - s.table.right) < 2 && r.bottom - r.top > 10
  && (i === 0 || Math.abs(r.top - s.trs[i - 1].bottom) < 2));
const texts = s => s.trs.map(r => r.text).join('|');
const kindAt = (s, kind) => s.trs.findIndex(r => r.kind === kind);

async function loadDoc(html) {
  await page.evaluate(h => { Editor.setTrackChanges(false); Editor.setHTML(h); }, html);
  await settle();
}
async function trackOn() {
  if (await page.evaluate(() => Editor.isTrackChangesOn())) return;
  await page.click('#v2-btn-track-changes');
  await sleep(250);
}
// La souris au bas du panneau : les menus de la barre d'outils s'ouvrent au survol et recouvriraient la case visée.
const parkMouse = async () => { await page.mouse.move(WIDTH / 2, HEIGHT - 20); await sleep(350); };
async function clickCell(index) {
  await parkMouse();
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
// Bouton grisé (rien n'est en attente) : on ne clique pas, les contrôles qui suivent le constatent au lieu d'attendre 30 s qu'il s'allume.
async function resolveAll(button) {
  if (!(await page.locator(`#${button}`).isEnabled())) return false;
  await page.click(`#${button}`);
  await settle();
  return true;
}
async function undo() { await page.keyboard.press('Control+z'); await settle(); }
async function redo() { await page.keyboard.press('Control+y'); await settle(); }
const barButton = action => page.evaluate(a => {
  const b = document.querySelector(`.v2-floating-toolbar button[data-action="${a}"]`);
  return { visible: b.closest('.v2-floating-toolbar').classList.contains('visible'), aria: b.getAttribute('aria-disabled'), disabled: b.classList.contains('is-disabled'), title: b.title };
}, action);

for (const dark of [false, true]) {
  const theme = dark ? 'sombre' : 'clair';
  page = await openPage(dark);
  console.log(`\n--- thème ${theme} ---`);

  // 1) Ligne ajoutée par la barre, à la vraie souris.
  await loadDoc(ROWS3);
  const original = plain((await tableState()).html);
  await trackOn();
  check(`[${theme}] le bouton de suivi (vraie souris) allume le suivi`, (await tableState()).tracking === true);
  await clickCell(2); // a2
  await clickBar('row-after');
  const added = await tableState();
  check(`[${theme}] « Ligne après » avec le suivi : 4 lignes pleine largeur, se suivant sans trou, la nouvelle au rang 3`,
    added.trs.length === 4 && fullWidth(added) && kindAt(added, 'ins') === 2 && added.pending, { rows: added.trs.length, ins: kindAt(added, 'ins'), full: fullWidth(added), widths: added.trs.map(r => Math.round(r.right - r.left)).join() });
  const insCell = added.trs[2].cells[0];
  check(`[${theme}] la ligne ajoutée est teintée de vert pâle, texte à 4,5:1 au moins`,
    added.trs[2].cells.every(c => c.bg === 'rgb(229, 246, 238)') && contrast(insCell.color, insCell.bg) >= 4.5, { bg: insCell.bg, color: insCell.color, ratio: contrast(insCell.color, insCell.bg) });
  check(`[${theme}] le HTML enregistré porte la marque en attribut de la ligne, sans <ins> dans le tableau`,
    (added.html.match(/<tr[^>]* data-tc-insertion="\d+"/g) || []).length === 1 && !/<tbody><ins|<\/tr><ins/.test(added.html), added.html);

  await undo();
  const undone = await tableState();
  check(`[${theme}] Ctrl+Z (vraie touche) : la ligne disparaît, le tableau est exactement celui d'avant`, plain(undone.html) === original && !undone.pending && undone.trs.length === 3, { rows: undone.trs.length });
  await redo();
  const redone = await tableState();
  check(`[${theme}] Ctrl+Y (vraie touche) : la ligne ajoutée revient avec sa marque`, plain(redone.html) === plain(added.html) && redone.pending, { rows: redone.trs.length });

  await resolveAll('v2-btn-reject-all');
  const rejected = await tableState();
  check(`[${theme}] « Tout refuser » (vraie souris) : la ligne ajoutée disparaît, tableau et texte d'origine, plus aucune suggestion`,
    plain(rejected.html) === original && !rejected.pending && fullWidth(rejected), { rows: rejected.trs.length });

  // 2) Ligne supprimée : gardée, barrée, teintée de rouge ; acceptée, elle part.
  await clickCell(2); // a2
  await clickBar('row-del');
  const deleted = await tableState();
  check(`[${theme}] « Supprimer la ligne » avec le suivi : la ligne reste (3 lignes pleine largeur), marquée supprimée au rang 2, texte gardé`,
    deleted.trs.length === 3 && fullWidth(deleted) && kindAt(deleted, 'del') === 1 && deleted.pending && texts(deleted) === 'a1b1|a2b2|a3b3', { rows: deleted.trs.length, del: kindAt(deleted, 'del'), texts: texts(deleted) });
  const delCell = deleted.trs[1].cells[0];
  check(`[${theme}] la ligne supprimée est barrée, teintée de rouge pâle, texte à 4,5:1 au moins`,
    deleted.trs[1].cells.every(c => c.deco.includes('line-through') && c.bg === 'rgb(251, 233, 233)') && contrast(delCell.color, delCell.bg) >= 4.5, { deco: delCell.deco, bg: delCell.bg, color: delCell.color, ratio: contrast(delCell.color, delCell.bg) });
  await resolveAll('v2-btn-accept-all');
  const acceptedDel = await tableState();
  check(`[${theme}] « Tout accepter » (vraie souris) : la ligne supprimée part, 2 lignes pleine largeur, plus aucune suggestion`,
    acceptedDel.trs.length === 2 && fullWidth(acceptedDel) && !acceptedDel.pending && texts(acceptedDel) === 'a1b1|a3b3' && !/data-tc-|<ins|<del/.test(acceptedDel.html), { rows: acceptedDel.trs.length, texts: texts(acceptedDel) });

  // 3) Une ligne ajoutée et une supprimée en attente survivent à l'enregistrement (HTML) puis à la réouverture.
  await loadDoc(ROWS3);
  await trackOn();
  await clickCell(2); // a2
  await clickBar('row-after');
  await clickCell(6); // a3 : la ligne ajoutée est maintenant la troisième (cases 4 et 5), a3 la quatrième (supprimer SA propre insertion l'annulerait tout simplement)
  await clickBar('row-del');
  const pendingBoth = await tableState();
  await page.evaluate(() => { const html = Editor.getHTML(); Editor.setHTML(html); });
  await settle();
  const reopened = await tableState();
  check(`[${theme}] enregistrement puis réouverture : la ligne ajoutée et la ligne supprimée sont toujours en attente, à l'identique, teintées`,
    reopened.html === pendingBoth.html && reopened.pending && kindAt(reopened, 'ins') === kindAt(pendingBoth, 'ins') && kindAt(reopened, 'del') === kindAt(pendingBoth, 'del') && kindAt(reopened, 'ins') === 2 && kindAt(reopened, 'del') === 3 && fullWidth(reopened),
    { avant: pendingBoth.html, apres: reopened.html });
  await resolveAll('v2-btn-accept-all');
  const afterReopenAccept = await tableState();
  check(`[${theme}] après réouverture, « Tout accepter » donne le tableau voulu : ligne ajoutée gardée (vide), ligne supprimée partie`,
    afterReopenAccept.trs.length === 3 && !afterReopenAccept.pending && texts(afterReopenAccept) === 'a1b1|a2b2|' && !/a3|b3|data-tc-|<ins|<del/.test(afterReopenAccept.html),
    { rows: afterReopenAccept.trs.length, texts: texts(afterReopenAccept) });

  // 4) Cellule fusionnée en hauteur : « Supprimer la ligne » grisé avec son explication (sans effet au clic), ajout à travers la cellule proprement résolu.
  await loadDoc(ROWSPAN);
  const mergedOriginal = plain((await tableState()).html);
  await trackOn();
  await clickCell(2); // c2, sous la cellule fusionnée « ab »
  const grey = await barButton('row-del');
  check(`[${theme}] cellule fusionnée au-dessus : « Supprimer la ligne » est grisé (aria-disabled) et dit pourquoi`, grey.visible && grey.aria === 'true' && grey.disabled && /fusionn/.test(grey.title), grey);
  await mouseClickBar('row-del');
  const greyClick = await tableState();
  check(`[${theme}] clic sur « Supprimer la ligne » grisé : rien ne change, aucune suggestion`, plain(greyClick.html) === mergedOriginal && !greyClick.pending, { rows: greyClick.trs.length });
  await clickCell(1); // c1 : la ligne qui porte la cellule fusionnée est grisée aussi
  const greyTop = await barButton('row-del');
  check(`[${theme}] la ligne qui porte la cellule fusionnée est grisée aussi`, greyTop.aria === 'true' && greyTop.disabled, greyTop);
  await clickBar('row-after');
  const mergedAdded = await tableState();
  check(`[${theme}] ligne ajoutée à travers la cellule fusionnée : 4 lignes pleine largeur, la cellule fusionnée s'allonge (rowspan 3)`,
    mergedAdded.trs.length === 4 && fullWidth(mergedAdded) && mergedAdded.pending && /rowspan="3"/.test(mergedAdded.html), { rows: mergedAdded.trs.length, full: fullWidth(mergedAdded) });
  await resolveAll('v2-btn-reject-all');
  const mergedRejected = await tableState();
  check(`[${theme}] « Tout refuser » rend le tableau à cellule fusionnée tel qu'il était`, plain(mergedRejected.html) === mergedOriginal && !mergedRejected.pending, { html: mergedRejected.html });
  await clickCell(3); // a3 : ligne libre
  const free = await barButton('row-del');
  check(`[${theme}] hors de la cellule fusionnée, « Supprimer la ligne » est actif`, free.aria === 'false' && !free.disabled && free.title === 'Supprimer la ligne', free);

  // 5) Suivi coupé : les boutons agissent tout de suite, sans trace de suivi.
  await loadDoc(ROWS3);
  await clickCell(2);
  await clickBar('row-after');
  const plainAdded = await tableState();
  check(`[${theme}] suivi coupé : « Ligne après » ajoute la ligne pour de bon, sans marque`, plainAdded.trs.length === 4 && !plainAdded.pending && !/data-tc-|<ins|<del/.test(plainAdded.html), { rows: plainAdded.trs.length });

  if (!dark) {
    // 6) Langue : l'explication du bouton grisé suit la langue de l'interface.
    await page.evaluate(() => I18n.setLang('en'));
    await loadDoc(ROWSPAN);
    await trackOn();
    await clickCell(2);
    const greyEn = await barButton('row-del');
    check('[anglais] « Supprimer la ligne » grisé : l\'explication est en anglais', greyEn.aria === 'true' && /merged cell/.test(greyEn.title), greyEn);
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
