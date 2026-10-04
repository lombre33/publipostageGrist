#!/usr/bin/env node
// Ordre d'empilement des couches flottantes (retour d'Antoine du 2026-10-01 : « quand on est dans un tableau la toolbar tableau reste tj affichée, ca c'est ok mais du coup le menu # variable s'ouvre
// en dessous, il faudrait qu'il soit en dessus, le dernier menu qui s'ouvre doit tj être au-dessus de l'existant »), à la VRAIE souris et au vrai clavier, avec les vraies barres flottantes, à la
// taille du panneau Grist d'Antoine (~700x400) : les scénarios de dev-tests/scenarios-layers.js tournent DANS la page, sur des menus déplacés à la main, et ne prouvent pas que la géométrie réelle
// d'un petit panneau - la barre repoussée SOUS le tableau, qui descend jusqu'aux menus - ne cache plus rien. Pour chaque couche on demande au navigateur ce qu'il atteint au centre de CHAQUE ligne
// du menu (elementFromPoint) : une ligne dont le centre revient à la barre est une ligne cachée.
//   1) tableau en tête de document, curseur dans une cellule : la barre du tableau reste affichée, le « # » tapé au clavier ouvre la liste, qui recouvre la barre - et aucune de ses lignes (onglets
//      compris) ne passe dessous ;
//   2) la liste # ouverte, la souris survole un menu de la barre du haut : ce menu, ouvert en dernier, est au-dessus de la liste ; la souris restée là, la liste retapée reprend le dessus à son tour ;
//   3) la barre du tableau affichée, chaque menu de la barre du haut s'ouvre au survol sans aucune ligne cachée par elle ;
//   4) idem avec la barre d'une image sélectionnée, puis avec celle d'une bulle sélectionnée ;
//   5) panneau étroit (360 px) : un clic sur l'étiquette d'un bloc de texte conditionnel d'une case de tableau ouvre la barre du bloc PUIS celle du tableau (le focus n'arrive qu'après la sélection) ;
//      les deux se recouvrent et la barre du bloc garde tous ses boutons - les barres flottantes ne sont pas rangées « la dernière ouverte au-dessus », l'ordre du DOM garde la plus précise dessus ;
//   6) la liste # d'un champ de FENÊTRE (la ligne « Calcul » ouvre la fenêtre de la bulle « Calcul ») : barre du tableau, liste # de l'éditeur et menu de la barre du haut ouverts avant, la liste du champ
//      passe devant sa fenêtre (Layers.raise(boîte, fenêtre)), aucune de ses lignes n'est cachée ; rouverte ensuite depuis l'éditeur, elle revient au niveau des menus, sous les fenêtres ;
// Lancé par run-headless.mjs (groupe Node "layersMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-layers-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.LAYERS_MOUSE_PORT || 8917);
const WIDTH = 700;
const HEIGHT = 400;
const SHOTS = process.env.LAYERS_MOUSE_SHOTS || mkdtempSync(join(tmpdir(), 'layers-mouse-'));
mkdirSync(SHOTS, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-wheel-scroll.mjs.
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
if (!OFFLINE) console.log('[verify-layers-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function openPage() {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
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
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return page;
}

const page = await openPage();
const shot = (name) => page.screenshot({ path: SHOTS + '/' + name + '.png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
const wait = (ms) => page.waitForTimeout(ms);
// La souris loin de la barre du haut avant chaque déplacement : en la traversant, elle ouvrirait au passage les menus au survol.
const park = async () => { await page.mouse.move(600, 380, { steps: 4 }); await wait(150); };
const rectOf = (sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom };
}, sel);
async function click(sel) {
  const c = await rectOf(sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.mouse.click(c.x, c.y);
  await wait(300);
  return c;
}

await page.evaluate(() => {
  const stub = window.__gristStub;
  stub.setVariables('Contacts', { Nom: 'Text', Prenom: 'Text', Adresse: 'Text', Ville: 'Text', Telephone: 'Text', Email: 'Text' });
  stub.setRows('Contacts', [{ id: 1, Nom: 'Dupont', Prenom: 'Jean', Adresse: '1 rue A', Ville: 'Lyon', Telephone: '0102', Email: 'j@ex.fr' }]);
  return GristAPI.refreshSchema();
});
await page.evaluate(() => { window.__gristStub.fireRecord({ id: 1, Nom: 'Dupont', Prenom: 'Jean', Adresse: '1 rue A', Ville: 'Lyon', Telephone: '0102', Email: 'j@ex.fr' }, 'Contacts'); });
await wait(100);
const setDoc = async (html) => { await page.evaluate((h) => { Editor.setHTML(h); }, html); await wait(500); };

// Ce que le navigateur atteint au centre de chaque ligne de `container` : les lignes dont le centre revient à autre chose que le conteneur sont cachées, et par quoi.
const coveredRows = (containerSel, rowSel) => page.evaluate(({ containerSel, rowSel }) => {
  const box = document.querySelector(containerSel);
  if (!box) return { found: false, rows: 0, covered: [] };
  const rows = Array.from(box.querySelectorAll(rowSel)).filter(row => { const r = row.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const covered = [];
  rows.forEach((row) => {
    const r = row.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && !box.contains(hit)) covered.push({ row: (row.textContent || row.id || row.className).trim().slice(0, 24), by: (hit.closest('.v2-floating-toolbar') ? 'barre flottante' : (hit.closest('#autocomplete-box') ? 'liste #' : hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : ''))) });
  });
  return { found: true, rows: rows.length, covered };
}, { containerSel, rowSel });
const floatingBar = () => page.evaluate(() => {
  const bars = Array.from(document.querySelectorAll('.v2-floating-toolbar')).filter(bar => getComputedStyle(bar).display !== 'none' && bar.getBoundingClientRect().width > 0);
  const bar = bars[0];
  if (!bar) return null;
  const r = bar.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, z: getComputedStyle(bar).zIndex, actions: Array.from(bar.querySelectorAll('[data-action]')).map(b => b.dataset.action) };
});
const hashMenu = () => page.evaluate(() => {
  const box = document.getElementById('autocomplete-box');
  if (!box || getComputedStyle(box).display === 'none') return null;
  const r = box.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, z: getComputedStyle(box).zIndex };
});
const intersects = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 4 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 4;
const rowsOverlapping = (containerSel, rowSel, other) => page.evaluate(({ containerSel, rowSel, other }) => {
  const box = document.querySelector(containerSel);
  if (!box) return 0;
  return Array.from(box.querySelectorAll(rowSel)).filter((row) => {
    const r = row.getBoundingClientRect();
    return r.width > 0 && Math.min(r.right, other.r) - Math.max(r.left, other.l) > 4 && Math.min(r.bottom, other.b) - Math.max(r.top, other.t) > 4;
  }).length;
}, { containerSel, rowSel, other });
const MENU_ROWS = '.ac-tab, .ac-item';
const FLYOUT_ROWS = 'button, .v2-hover-row, .v2-menu-row';

// Chaque groupe de la barre du haut survolé pour de vrai : son menu s'ouvre, et on compte ses lignes cachées par la couche donnée (`coverer`).
async function hoverEveryGroup(label) {
  const groups = await page.evaluate(() => Array.from(document.querySelectorAll('.v2-hover-group')).map((group, index) => {
    const button = group.querySelector(':scope > button');
    const r = button ? button.getBoundingClientRect() : null;
    return { index, id: button && button.id, x: r && r.left + r.width / 2, y: r && r.top + r.height / 2, visible: !!r && r.width > 0 && r.height > 0 };
  }));
  const bar = await floatingBar();
  let opened = 0, overlapping = 0, hidden = 0;
  const hiddenRows = [];
  for (const g of groups.filter(group => group.visible)) {
    await park();
    await page.mouse.move(g.x, g.y - 6, { steps: 4 });
    await page.mouse.move(g.x, g.y, { steps: 3 });
    await wait(450);
    const flyout = await page.evaluate((index) => {
      const fl = document.querySelectorAll('.v2-hover-group')[index].querySelector(':scope > .v2-hover-flyout');
      if (!fl || getComputedStyle(fl).display === 'none') return null;
      const r = fl.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, z: getComputedStyle(fl).zIndex };
    }, g.index);
    if (!flyout) continue;
    opened++;
    if (intersects(flyout, bar)) overlapping++;
    const report = await page.evaluate((index) => {
      const fl = document.querySelectorAll('.v2-hover-group')[index].querySelector(':scope > .v2-hover-flyout');
      const rows = Array.from(fl.querySelectorAll('button, .v2-hover-row, .v2-menu-row')).filter(row => { const r = row.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const covered = [];
      rows.forEach((row) => {
        const r = row.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && !fl.contains(hit)) covered.push({ row: (row.textContent || row.id || '').trim().slice(0, 20), by: hit.closest('.v2-floating-toolbar') ? 'barre flottante' : (hit.closest('#autocomplete-box') ? 'liste #' : hit.tagName.toLowerCase()) });
      });
      return { rows: rows.length, covered };
    }, g.index);
    if (report.covered.length) { hidden += report.covered.length; hiddenRows.push({ menu: g.id, covered: report.covered.slice(0, 3) }); }
  }
  await park();
  return { label, groups: groups.filter(g => g.visible).length, opened, overlapping, hidden, hiddenRows };
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\n== 1) tableau en tête de document : la liste # sous la barre du tableau ==');
const TABLE_DOC = '<table><tbody><tr><td><p>a1</p></td><td><p>b1</p></td><td><p>c1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td><td><p>c2</p></td></tr></tbody></table><p>Après</p>';
await setDoc(TABLE_DOC);
await park();
await click('.tiptap table tr:nth-child(2) td:nth-child(2)');
await page.keyboard.press('End');
const barBefore = await floatingBar();
check('la barre du tableau est affichée dans la cellule', !!barBefore && barBefore.actions.includes('table-del'), barBefore);
await page.keyboard.type(' #', { delay: 60 });
await wait(350);
const menu = await hashMenu();
const barTyping = await floatingBar();
check('la liste # s\'ouvre au clavier dans la cellule', !!menu, menu);
check('la barre du tableau reste affichée pendant la saisie', !!barTyping && barTyping.actions.includes('table-del'), barTyping);
const overlap = menu && barTyping ? await rowsOverlapping('#autocomplete-box', MENU_ROWS, barTyping) : 0;
check('la liste # tombe sur la barre du tableau (la mesure porte sur un vrai recouvrement)', overlap > 0, { overlap, menu, barTyping });
const hashCovered = await coveredRows('#autocomplete-box', MENU_ROWS);
check('aucune ligne de la liste # (onglets compris) ne passe sous la barre du tableau', hashCovered.rows > 0 && hashCovered.covered.length === 0, hashCovered);
check('la liste # est au-dessus de la barre dans leurs niveaux', !!menu && !!barTyping && Number(menu.z) > Number(barTyping.z), { menu: menu && menu.z, bar: barTyping && barTyping.z });
await shot('1-table-diese');

console.log('\n== 2) le dernier ouvert est au-dessus : un menu de la barre du haut au survol de la liste # ==');
// La liste # reste ouverte (le focus est resté dans la cellule). À 700x400 elle s'ouvre AU-DESSUS de la ligne, sur la barre du haut : la souris va sur « Alignement », juste à gauche d'elle, dont le
// menu s'ouvre au survol PAR-DESSUS la liste, qu'il recouvre en partie.
const flyoutOf = (buttonSel) => page.evaluate((sel) => {
  const fl = document.querySelector(sel).closest('.v2-hover-group').querySelector(':scope > .v2-hover-flyout');
  if (!fl || getComputedStyle(fl).display === 'none') return null;
  const r = fl.getBoundingClientRect();
  const rows = Array.from(fl.querySelectorAll('button')).filter(row => { const q = row.getBoundingClientRect(); return q.width > 0 && q.height > 0; });
  const covered = rows.filter((row) => { const q = row.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !hit || !fl.contains(hit); })
    .map((row) => { const q = row.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return hit && hit.closest('#autocomplete-box') ? 'liste #' : (hit && hit.closest('.v2-floating-toolbar') ? 'barre flottante' : 'autre'); });
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, z: getComputedStyle(fl).zIndex, rows: rows.length, covered };
}, buttonSel);
await park();
const align = await rectOf('#v2-btn-align-main');
await page.mouse.move(align.x, align.y - 6, { steps: 5 });
await page.mouse.move(align.x, align.y, { steps: 3 });
await wait(450);
const alignFlyout = await flyoutOf('#v2-btn-align-main');
const menuStill = await hashMenu();
check('le menu « Alignement » s\'ouvre au survol, la liste # toujours ouverte', !!alignFlyout && !!menuStill, { alignFlyout, menuStill });
check('le menu « Alignement » recouvre la liste # (la mesure porte sur un vrai recouvrement)', intersects(alignFlyout, menuStill), { alignFlyout, menuStill });
check('aucune ligne du menu « Alignement », ouvert en dernier, ne passe sous la liste # ni sous la barre du tableau', !!alignFlyout && alignFlyout.rows > 0 && alignFlyout.covered.length === 0, alignFlyout);
await shot('2-menu-sur-liste-diese');
// La souris reste sur « Alignement » et on retape dans le texte : la liste # redevient le menu qu'on utilise, elle reprend le dessus.
await page.keyboard.type('N', { delay: 60 });
await wait(350);
const menuTyped = await hashMenu();
const flyoutTyped = await flyoutOf('#v2-btn-align-main');
check('la liste # et le menu « Alignement » sont encore ouverts, et se recouvrent', !!menuTyped && !!flyoutTyped && intersects(flyoutTyped, menuTyped), { menuTyped, flyoutTyped });
const hashOverFlyout = await coveredRows('#autocomplete-box', MENU_ROWS);
check('la liste # retapée repasse au-dessus du menu « Alignement » : aucune de ses lignes n\'est cachée', hashOverFlyout.found && hashOverFlyout.rows > 0 && hashOverFlyout.covered.length === 0, hashOverFlyout);
await shot('2-liste-diese-retapee');
await page.keyboard.press('Escape');
await wait(150);
check('Échap referme la liste # (le comportement d\'avant)', (await hashMenu()) === null);

console.log('\n== 3) la barre du tableau affichée : chaque menu de la barre du haut ==');
await click('.tiptap table tr:nth-child(2) td:nth-child(2)');
const tableBarNow = await floatingBar();
check('la barre du tableau est affichée', !!tableBarNow && tableBarNow.actions.includes('table-del'), tableBarNow);
const tableReport = await hoverEveryGroup('tableau');
check('au moins un menu de la barre du haut recouvre la barre du tableau (la mesure porte sur un vrai recouvrement)', tableReport.overlapping > 0, tableReport);
check('tous les menus de la barre du haut s\'ouvrent au survol', tableReport.opened === tableReport.groups && tableReport.groups >= 6, tableReport);
check('aucune ligne de ces menus ne passe sous la barre du tableau', tableReport.hidden === 0, tableReport);

console.log('\n== 4) la barre d\'une image, puis celle d\'une bulle ==');
await setDoc(`<p><img class="editor-image" src="${PNG}" width="160" height="70"></p><p>Texte après l'image</p>`);
await park();
const imageBox = await rectOf('.tiptap img.editor-image');
check('l\'image est assez grande pour être cliquée', !!imageBox && imageBox.r - imageBox.l > 40 && imageBox.b - imageBox.t > 20, imageBox);
await click('.tiptap img.editor-image');
const imageBar = await floatingBar();
check('la barre de l\'image est affichée', !!imageBar && imageBar.actions.some(a => /layer|align|zoom|wrap|delete/.test(a)), imageBar);
const imageReport = await hoverEveryGroup('image');
check('au moins un menu de la barre du haut recouvre la barre de l\'image', imageReport.overlapping > 0, imageReport);
check('aucune ligne de ces menus ne passe sous la barre de l\'image', imageReport.opened >= 6 && imageReport.hidden === 0, imageReport);
await shot('4-image');

await setDoc('<p>Dossier suivi par <span class="var-badge" data-table="Contacts" data-column="Nom" data-key="Contacts.Nom"></span> jusqu\'à la clôture.</p><p>Suite</p>');
await park();
await click('.tiptap .var-badge');
const bubbleBar = await floatingBar();
check('la barre de la bulle est affichée', !!bubbleBar, bubbleBar);
const bubbleReport = await hoverEveryGroup('bulle');
check('au moins un menu de la barre du haut recouvre la barre de la bulle', bubbleReport.overlapping > 0, bubbleReport);
check('aucune ligne de ces menus ne passe sous la barre de la bulle', bubbleReport.opened >= 6 && bubbleReport.hidden === 0, bubbleReport);
await shot('4-bulle');

console.log('\n== 5) panneau étroit (360 px) : un bloc de texte conditionnel dans une case de tableau, les deux barres s\'ouvrent d\'un même clic ==');
// À 360 px la barre du bloc et celle du tableau se recouvrent. Le clic sur l'étiquette du bloc ouvre la barre du bloc tout de suite (la sélection précède le focus), puis celle du tableau à
// l'arrivée du focus : « la dernière ouverte au-dessus » la mettrait sur celle du bloc, dont les boutons ne recevraient plus la souris (condTextMouse l'a montré).
await page.setViewportSize({ width: 360, height: HEIGHT });
const BLOCK_CONDITION = JSON.stringify({ mode: 'any', rules: [{ column: 'Nom', operator: '=', value: 'Dupont' }, { column: 'Ville', operator: '=', value: 'Lyon' }] }).replace(/"/g, '&quot;');
await setDoc('<table><tbody><tr><td><div class="conditional-text" data-condition="' + BLOCK_CONDITION + '"><p>Un texte assez long pour passer à la ligne dans une case étroite</p></div></td><td><p>Autre case</p></td></tr></tbody></table><p>Après</p>');
await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); // l'éditeur n'a pas le focus : le clic le lui rend après avoir sélectionné le bloc
await park();
await click('.tiptap td .conditional-text-tag');
const nested = await page.evaluate(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const bars = Array.from(document.querySelectorAll('.v2-floating-toolbar')).filter(bar => getComputedStyle(bar).display !== 'none' && bar.getBoundingClientRect().width > 0);
  const bubble = bars.find(bar => bar.classList.contains('v2-varfmt-toolbar'));
  const table = bars.find(bar => bar.querySelector('[data-action="table-del"]'));
  if (!bubble || !table) return { bubble: !!bubble, table: !!table };
  const buttons = Array.from(bubble.querySelectorAll('button')).filter(button => button.getBoundingClientRect().width > 0);
  const covered = buttons.filter((button) => {
    const r = button.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !hit || !bubble.contains(hit);
  }).map(button => button.dataset.action);
  return { bubble: rect(bubble), table: rect(table), buttons: buttons.length, covered, bubbleZ: getComputedStyle(bubble).zIndex, tableZ: getComputedStyle(table).zIndex };
});
check('un clic sur l\'étiquette d\'un bloc d\'une case de tableau ouvre les deux barres : celle du bloc et celle du tableau', !!nested.bubble && !!nested.table && typeof nested.bubble === 'object', nested);
check('les deux barres se recouvrent (la mesure porte sur un vrai recouvrement)', typeof nested.bubble === 'object' && typeof nested.table === 'object' && intersects(nested.bubble, nested.table), nested);
check('aucun bouton de la barre du bloc ne passe sous celle du tableau (au centre de chacun, la souris atteint la barre du bloc)', nested.buttons > 0 && nested.covered.length === 0, nested);
await shot('5-bloc-dans-un-tableau-360');
await page.setViewportSize({ width: WIDTH, height: HEIGHT });

console.log('\n== 6) la liste # d\'un champ de fenêtre passe devant sa fenêtre, après d\'autres couches ouvertes avant elle ==');
// La ligne « Calcul » de la liste # ouvre la fenêtre de la bulle « Calcul » (js/variable-calc.js), dont le champ complète les colonnes à la touche #. Les fenêtres (css/modal-base.css, 1990 et plus)
// sont au-dessus de tous les menus : un rang de menu ne suffit jamais à passer devant, la liste s'ouvrait dessous, invisible. Elle passe devant sa fenêtre par Layers.raise(boîte, fenêtre), quelles que
// soient les couches ouvertes avant : ici la barre du tableau (curseur dans une cellule), la liste # de l'éditeur et un menu de la barre du haut survolé par-dessus elle.
const CALC_WINDOW = '#pp-calc-modal';
const windowZ = () => page.evaluate((sel) => parseInt(getComputedStyle(document.querySelector(sel)).zIndex, 10), CALC_WINDOW);
const calcWindowOpen = () => page.evaluate((sel) => { const m = document.querySelector(sel); return !!m && m.style.display !== 'none' && m.getClientRects().length > 0; }, CALC_WINDOW);
await setDoc(TABLE_DOC);
await park();
await click('.tiptap table tr:nth-child(2) td:nth-child(2)');
await page.keyboard.press('End');
await page.keyboard.type(' #', { delay: 60 });
await wait(350);
const alignWin = await rectOf('#v2-btn-align-main');
await page.mouse.move(alignWin.x, alignWin.y - 6, { steps: 5 });
await page.mouse.move(alignWin.x, alignWin.y, { steps: 3 });
await wait(450);
const openedBefore = { bar: await floatingBar(), list: await hashMenu(), flyout: await flyoutOf('#v2-btn-align-main') };
check('avant la fenêtre : la barre du tableau, la liste # de l\'éditeur et le menu « Alignement » sont ouverts', !!openedBefore.bar && openedBefore.bar.actions.includes('table-del') && !!openedBefore.list && !!openedBefore.flyout, openedBefore);
await park();
await click('#autocomplete-box .ac-tab[data-tab="chips"]');
const calcRow = await page.evaluate(() => {
  const row = Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).find(item => /^(Calcul|Calculation)$/.test(item.textContent.trim()));
  if (!row) return null;
  row.scrollIntoView({ block: 'nearest' });
  const r = row.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
check('l\'onglet Chips de la liste # montre la ligne « Calcul »', !!calcRow, calcRow);
if (calcRow) {
  await page.mouse.move(calcRow.x, calcRow.y, { steps: 6 });
  await page.mouse.click(calcRow.x, calcRow.y);
  await wait(450);
}
const calcOpen = await calcWindowOpen();
check('un vrai clic sur « Calcul » ouvre la fenêtre de la formule', calcOpen, { calcOpen });
await page.keyboard.type('#Contacts', { delay: 60 });
await wait(350);
const windowList = await hashMenu();
const winZ = await windowZ();
check('taper # dans le champ de la fenêtre ouvre la liste des colonnes', !!windowList, windowList);
check('la liste est devant sa fenêtre : son niveau est au-dessus de celui de la fenêtre', !!windowList && Number(windowList.z) > winZ, { list: windowList && windowList.z, window: winZ });
const windowListRows = await coveredRows('#autocomplete-box', '.ac-item');
check('aucune ligne de la liste ne passe sous la fenêtre (au centre de chacune, la souris atteint la liste)', windowListRows.found && windowListRows.rows >= 3 && windowListRows.covered.length === 0, windowListRows);
await shot('6-liste-diese-devant-la-fenetre');
await page.keyboard.press('Escape');
await wait(150);
check('Échap referme la liste, la fenêtre reste ouverte', (await hashMenu()) === null && (await calcWindowOpen()), { list: await hashMenu(), open: await calcWindowOpen() });
await page.keyboard.press('Escape');
await wait(250);
check('un second Échap referme la fenêtre', !(await calcWindowOpen()));
// La même liste rouverte depuis l'éditeur retrouve son étage de menu : sous les fenêtres, au-dessus de la barre du tableau, sans ligne cachée.
await page.keyboard.press('End');
await page.keyboard.type(' #', { delay: 60 });
await wait(350);
const listAfter = await hashMenu();
const barAfter = await floatingBar();
const rowsAfter = await coveredRows('#autocomplete-box', MENU_ROWS);
check('rouverte depuis l\'éditeur, la liste revient au niveau des menus : sous les fenêtres', !!listAfter && Number(listAfter.z) >= 1600 && Number(listAfter.z) < winZ, { list: listAfter && listAfter.z, window: winZ });
check('et reste au-dessus de la barre du tableau : aucune ligne cachée', !!barAfter && !!listAfter && Number(listAfter.z) > Number(barAfter.z) && rowsAfter.rows > 0 && rowsAfter.covered.length === 0, { list: listAfter && listAfter.z, bar: barAfter && barAfter.z, rowsAfter });
await page.keyboard.press('Escape');
await wait(150);

check('aucune erreur de page', pageErrors.length === 0, pageErrors);
console.log('  (captures : ' + SHOTS + ')');
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
