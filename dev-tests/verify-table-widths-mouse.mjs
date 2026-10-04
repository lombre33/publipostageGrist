#!/usr/bin/env node
// Largeurs de colonnes d'un tableau quand on change de modèle, à la taille du panneau Grist d'Antoine (~700x400), avec la vraie souris pour tout geste (bouton
// Tableau de la barre, glisser d'une bordure, liste des modèles, Enregistrer, Mode lecture / Mode édition).
// Bug corrigé (01/10) : en Aperçu A4 (le réglage par défaut), charger un modèle pendant que l'éditeur est masqué - un macro-modèle était ouvert, ou le Mode
// lecture - ramenait TOUTES les colonnes de ses tableaux à 25 px : clampOverflowingTables (js/editor.js) mesurait la largeur de page d'un éditeur sans mise en
// page (clientWidth 0 moins le padding des marges = une largeur négative, jamais ignorée) et en tirait un facteur négatif. Les colonnes se retrouvaient « en pâté »
// à gauche, dans l'éditeur, dans la Lecture et dans les exports, et le premier Enregistrer ou la première frappe écrasait les largeurs du modèle. Aucun test ne
// le voyait : les scénarios de dev-tests/scenarios-tables.js chargent un modèle dans un éditeur toujours visible.
// Lancé par run-headless.mjs (groupe Node "tableWidthsMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-table-widths-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TABLE_WIDTHS_PORT || 8902);
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
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/vfs_fonts\.min\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
] : [];
if (!OFFLINE) console.log('[verify-table-widths-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Laisse le temps à onUpdate de rejouer ses corrections, qui passent par des transactions supplémentaires : un état lu trop tôt cacherait la boucle.
const settle = () => sleep(700);


// Aperçu A4, le réglage par défaut (case cochée dans index.html) : c'est lui qui déclenche aussi la correction de largeur des tableaux trop larges pour la page.
check('Aperçu A4 actif d\'office', await page.evaluate(() => document.getElementById('editor-container').classList.contains('a4-preview')));

// Largeurs de la première ligne, lues dans le document (ce qui s'enregistre et s'exporte), jamais dans le DOM : l'éditeur masqué n'a aucune mesure à offrir.
const docWidths = () => page.evaluate(() => {
  const t = new DOMParser().parseFromString(Editor.getHTML(), 'text/html').querySelector('table');
  return t ? Array.from(t.rows[0].cells).map(c => c.getAttribute('colwidth') || '-') : null;
});
// Idem pour la ligne enregistrée : relue dans le faux Grist (Templates.loadAll), pas dans le cache du widget.
const savedWidths = id => page.evaluate(async id => {
  await Templates.loadAll();
  const html = (Templates.getCached().find(t => String(t.id) === String(id)) || {}).contenu || '';
  const t = new DOMParser().parseFromString(html, 'text/html').querySelector('table');
  return t ? Array.from(t.rows[0].cells).map(c => c.getAttribute('colwidth') || '-') : null;
}, id);
const editorHidden = () => page.evaluate(() => getComputedStyle(document.getElementById('editor-container')).display === 'none');
// Largeur à l'écran du tableau et de ses colonnes : ce que la personne voit.
const screenWidths = () => page.evaluate(() => {
  const t = document.querySelector('.tiptap table');
  return t ? { table: Math.round(t.getBoundingClientRect().width), cells: Array.from(t.rows[0].cells).map(c => Math.round(c.getBoundingClientRect().width)) } : null;
});
const readerWidths = () => page.evaluate(() => {
  const t = document.querySelector('#reader-container table');
  return t ? { table: Math.round(t.getBoundingClientRect().width), cells: Array.from(t.rows[0].cells).map(c => Math.round(c.getBoundingClientRect().width)) } : null;
});
const center = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

// Un modèle de plus : ligne enregistrée dans le faux Grist + option du vrai <select> (l'arbre des modèles se construit d'après les deux).
async function makeTemplate(name, html, type) {
  return page.evaluate(async ({ name, html, type }) => {
    const r = await Templates.save(null, name, html, '', null, null, type || 'document', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    const option = document.createElement('option'); option.value = String(r.id); option.textContent = name; select.appendChild(option);
    return r.id;
  }, { name, html, type });
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
  await page.waitForFunction(i => String(Templates.getCurrentId()) === String(i), id, { timeout: 5000 }).catch(() => {});
  await settle();
  return true;
}
const hasWidth = widths => !!widths && widths.every(w => w !== '-');
const none25 = widths => !!widths && widths.every(w => !/(^|,)25(,|$)/.test(w));
const sameWidths = (a, b) => !!a && !!b && a.length === b.length && a.every((w, i) => Math.abs(Number(w) - Number(b[i])) <= 1);

// 1) Un tableau créé et redimensionné à la vraie souris, enregistré sous un nom.
await page.evaluate(() => Editor.setHTML('<p>Avant</p>'));
await settle();
await page.click('.tiptap p >> nth=0');
await page.keyboard.press('Control+End');
await page.click('#v2-btn-table');
await settle();
const border = await page.evaluate(() => {
  const r = document.querySelector('.tiptap table td, .tiptap table th').getBoundingClientRect();
  return { x: r.right - 1, y: r.top + r.height / 2 };
});
await page.mouse.move(border.x - 30, border.y);
await page.mouse.move(border.x, border.y, { steps: 4 });
await sleep(200);
await page.mouse.down();
await page.mouse.move(border.x - 40, border.y, { steps: 6 });
await page.mouse.up();
await settle();
const dragged = await docWidths();
check('bordure glissée à la vraie souris : chaque colonne a une largeur', hasWidth(dragged) && dragged.length === 2, dragged);
const draggedScreen = await screenWidths();
await page.evaluate(() => { document.getElementById('template-name').value = 'Tableau redimensionné'; });
await page.click('#btn-save');
await sleep(900);
const idT1 = await page.evaluate(() => Templates.getCurrentId());
check('Enregistrer : le modèle porte les largeurs du tableau', (await savedWidths(idT1)).join() === dragged.join(), { enregistre: await savedWidths(idT1), dragged });

// Les autres modèles : trois colonnes de 150, un macro-modèle, un tableau deux fois plus large que la page, un tableau dont seule la première colonne a une largeur.
const pageWidth = await page.evaluate(() => Math.floor(EditorCore.editorContentWidthPx(EditorCore.getEditor())));
const cellsRow = widths => '<tr>' + widths.map(w => '<td' + (w ? ` colwidth="${w}"` : '') + '><p>x</p></td>').join('') + '</tr>';
const tableOf = widths => '<p>Texte</p><table><tbody>' + cellsRow(widths) + cellsRow(widths) + '</tbody></table>';
const idT2 = await makeTemplate('Trois colonnes', tableOf([150, 150, 150]));
const idMacro = await makeTemplate('Macro dossier', JSON.stringify({ slots: [{ type: 'fixed', modeleId: idT2 }] }), 'macro');
const idWide = await makeTemplate('Tableau trop large', tableOf([pageWidth, pageWidth]));
const idMixed = await makeTemplate('Tableau mixte', tableOf([200, 0, 0]));

// 2) Témoin : changer de modèle éditeur visible ne touchait déjà pas aux largeurs.
check('éditeur visible : le modèle « Trois colonnes » se charge avec ses largeurs', await pickTemplate('Trois colonnes', idT2) && (await docWidths()).join() === '150,150,150', await docWidths());
check('éditeur visible : retour sur le tableau redimensionné, mêmes largeurs qu\'avant, à l\'écran comme dans le document',
  await pickTemplate('Tableau redimensionné', idT1) && sameWidths(await docWidths(), dragged) && sameWidths((await screenWidths()).cells, draggedScreen.cells), { doc: await docWidths(), ecran: await screenWidths(), avant: draggedScreen });

// 3) Passage par un macro-modèle : l'éditeur est masqué pendant que le tableau se recharge.
check('macro-modèle ouvert : l\'éditeur est masqué', await pickTemplate('Macro dossier', idMacro) && await editorHidden());
check('macro-modèle puis retour sur le tableau redimensionné : les colonnes gardent leurs largeurs (pas 25 px)',
  await pickTemplate('Tableau redimensionné', idT1) && !(await editorHidden()) && sameWidths(await docWidths(), dragged) && none25(await docWidths()), { doc: await docWidths(), dragged });
const afterMacro = await screenWidths();
check('macro-modèle puis retour : à l\'écran le tableau a la même largeur qu\'avant', !!afterMacro && sameWidths(afterMacro.cells, draggedScreen.cells) && Math.abs(afterMacro.table - draggedScreen.table) <= 2, { afterMacro, draggedScreen });
await page.click('#btn-save');
await sleep(900);
check('Enregistrer après le retour : le modèle garde ses largeurs, rien n\'est écrasé', (await savedWidths(idT1)).join() === dragged.join(), { enregistre: await savedWidths(idT1), dragged });

// 4) Mode lecture : changer de modèle pendant la lecture, l'éditeur masqué. Une ligne de données est sélectionnée, sans quoi la Lecture n'affiche rien.
await page.evaluate(async () => {
  const stub = window.__gristStub;
  stub.setVariables('Clients', { Nom: 'Text' });
  stub.setRows('Clients', [{ id: 1, Nom: 'Dupont' }]);
  await GristAPI.refreshSchema();
  stub.fireRecord({ id: 1, Nom: 'Dupont' }, 'Clients');
});
await page.click('#btn-mode-read');
await page.waitForSelector('#reader-container .reader-content', { timeout: 10000 }).catch(() => {});
await sleep(600);
check('Mode lecture : l\'éditeur est masqué', await editorHidden());
check('Mode lecture : « Trois colonnes » puis le tableau redimensionné, largeurs du document intactes', await pickTemplate('Trois colonnes', idT2) && await pickTemplate('Tableau redimensionné', idT1) && sameWidths(await docWidths(), dragged) && none25(await docWidths()), await docWidths());
const readerT1 = await readerWidths();
check('Mode lecture : le tableau lu garde ses colonnes (aucune réduite à 25 px, tableau plus large que 3 colonnes de 25 px)', !!readerT1 && readerT1.cells.every(w => w > 120), readerT1);
await page.click('#btn-mode-edit');
await sleep(700);
check('retour au Mode édition : le tableau redimensionné a ses largeurs d\'avant, à l\'écran', sameWidths(await docWidths(), dragged) && sameWidths((await screenWidths()).cells, draggedScreen.cells), { doc: await docWidths(), ecran: await screenWidths(), avant: draggedScreen });
check('« Trois colonnes » chargé en Mode lecture a aussi ses trois largeurs une fois l\'éditeur de retour', await pickTemplate('Trois colonnes', idT2) && (await docWidths()).join() === '150,150,150', await docWidths());

// 5) Un tableau trop large pour la page : ramené dans la page, comme quand l'éditeur est visible, et jamais à 25 px.
check('éditeur visible : le tableau trop large est ramené dans la page', await pickTemplate('Tableau trop large', idWide) && (await docWidths()).reduce((s, w) => s + Number(w), 0) <= pageWidth + 3, { doc: await docWidths(), pageWidth });
const wideVisible = await docWidths();
check('éditeur visible : les colonnes ramenées restent larges (pas 25 px)', none25(wideVisible) && wideVisible.every(w => Number(w) > 100), wideVisible);
await pickTemplate('Trois colonnes', idT2);
await page.click('#btn-mode-read');
await sleep(600);
await pickTemplate('Tableau trop large', idWide);
const wideHidden = await docWidths();
check('Mode lecture : le tableau trop large garde, tant que l\'éditeur est masqué, les largeurs du modèle (rien n\'est mesuré)', wideHidden.join() === `${pageWidth},${pageWidth}`, { wideHidden, pageWidth });
await page.click('#btn-mode-edit');
await sleep(700);
const wideShown = await docWidths();
check('retour au Mode édition : le tableau trop large est ramené dans la page, comme éditeur visible', sameWidths(wideShown, wideVisible) && none25(wideShown), { wideShown, wideVisible });
// Le réajustement des largeurs au retour de l'éditeur n'est pas une frappe : l'auto-save (toutes les 2,5 s, activé d'office) ne doit rien réécrire.
await sleep(4000);
check('retour au Mode édition : l\'auto-save ne réécrit pas le modèle (ses largeurs enregistrées sont celles d\'origine)', (await savedWidths(idWide)).join() === `${pageWidth},${pageWidth}`, await savedWidths(idWide));

// 6) Un tableau dont seule la première colonne a une largeur : les deux autres sont figées à leur largeur affichée, éditeur visible ou non.
check('éditeur visible : le tableau mixte se charge, ses colonnes automatiques reçoivent leur largeur affichée', await pickTemplate('Tableau mixte', idMixed) && hasWidth(await docWidths()), await docWidths());
const mixedVisible = await docWidths();
check('éditeur visible : la première colonne garde 200, les autres dépassent le plancher de 25 px', mixedVisible[0] === '200' && mixedVisible.slice(1).every(w => Number(w) > 40), mixedVisible);
await pickTemplate('Trois colonnes', idT2);
await page.click('#btn-mode-read');
await sleep(600);
await pickTemplate('Tableau mixte', idMixed);
const mixedHidden = await docWidths();
check('Mode lecture : les colonnes automatiques ne sont pas figées à 25 px par une mesure à zéro (elles restent automatiques)', mixedHidden.join() === '200,-,-', mixedHidden);
await page.click('#btn-mode-edit');
await sleep(700);
const mixedShown = await docWidths();
check('retour au Mode édition : les colonnes automatiques sont figées à leur largeur affichée, comme éditeur visible', sameWidths(mixedShown, mixedVisible) && none25(mixedShown), { mixedShown, mixedVisible });

check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
