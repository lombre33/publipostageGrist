#!/usr/bin/env node
// Retour d'Antoine du 2026-10-02 (point 12) : « ce modèle a été modifié ailleurs, recharger » alors qu'il est seul sur le modèle, d'après lui quand il tape trop vite pendant une
// sauvegarde. À la VRAIE souris et au vrai clavier, à la taille du panneau Grist d'Antoine (~700x400), avec un Grist qui prend son temps (dev-tests/grist-stub.js:setLatency : la table
// des modèles se relit EN ENTIER à chaque passage de l'enregistrement automatique, plusieurs secondes sur un gros document) : les scénarios de dev-tests/scenarios-autosave-race.js
// montent les mêmes chevauchements DANS la page, mais ne prouvent ni que la vraie frappe, le vrai clic sur Enregistrer et le vrai choix d'un modèle dans la liste ne les créent
// pas, ni que le bandeau n'apparaît pas à l'écran (il est surveillé toutes les 40 ms : même une apparition d'une seconde compte), ni qu'un VRAI conflit reste signalé.
//   1) frappe continue de 8 s : le bandeau n'apparaît jamais, jamais deux écritures à la fois, tout ce qui a été tapé est enregistré, le coin d'état dit « Enregistré à… » ;
//   2) un vrai clic sur Enregistrer au milieu de la frappe : pas de bandeau, la frappe qui suit est enregistrée, le curseur reste dans le texte ;
//   3) un autre modèle choisi dans la liste, à la vraie souris, pendant qu'un passage relit la table : pas de bandeau, l'écran montre le nouveau modèle, aucune des deux lignes touchée ;
//   4) un vrai conflit (quelqu'un d'autre a enregistré) reste signalé même Grist lent : bandeau visible dans la fenêtre, aucune écriture pendant le gel, la version de l'autre intacte, un
//      vrai clic sur « Recharger la dernière version » la charge et le lève ;
//   5) (carte « Corriger » d'Antoine, 02/10) un autre modèle choisi à la vraie souris, puis « Abandonner » à la vraie question, pendant qu'un Enregistrer lent écrit : à son retour l'écran, la
//      liste et le modèle courant restent ceux du modèle choisi, et la frappe qui suit va dans SA ligne - jamais dans celle du modèle quitté ;
//   6) (carte « Corriger » d'Antoine, 02/10) un vrai double clic sur Enregistrer d'un modèle tout neuf, puis un clic, une vraie frappe et Ctrl+S pendant que Grist écrit (~2,5 s) : une seule
//      ligne est créée, sous le nom tapé, le geste en trop attend la première écriture et enregistre ensuite le texte à jour dans la MÊME ligne, jamais deux écritures à la fois ;
//   7) (carte « Corriger » d'Antoine, 02/10) un vrai double clic sur « Utiliser ce modèle » dans l'aperçu de la galerie pendant que Grist écrit (~2,5 s) : un seul modèle est créé, sous le nom
//      de la galerie (jamais « (2) »), la galerie se ferme, il devient le modèle courant et le clic en trop n'écrit rien de plus.
// Lancé par run-headless.mjs (groupe Node "autosaveRaceMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-autosave-race-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.AUTOSAVE_RACE_MOUSE_PORT || 8924);
const WIDTH = 700;
const HEIGHT = 400;

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
if (!OFFLINE) console.log('[verify-autosave-race-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
// Deux modèles aux DateModif DIFFÉRENTS (des secondes entières, comme Grist) : sans cela rien ne distingue la ligne de l'un de celle de l'autre. Une identification qui réussit,
// comme sur un vrai document (sinon chaque passage ferait trois appels de plus vers Publipostage_UserProbe).
const TEMPLATES = `
    const m = stub.state.rows.Publipostage_Modeles;
    const add = (id, nom, html, dateModif) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(html); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(dateModif); m.Margins.push(''); m.EstParDefaut.push(false); };
    add(1, 'Bail habitation', '<p>texte a</p>', 1790000000); add(2, 'Contrat de vente', '<p>texte b</p>', 1790000100);
    stub.state.nextRowId.Publipostage_Modeles = 3;
    stub.setUserEmail('course@example.org');
`;

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
  await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${TEMPLATES} };`);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return page;
}

const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!top && (top === e || e.contains(top)) };
}, sel);
async function realClick(page, sel, wait = 250) {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 3 }); await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(wait);
  return c;
}
// Choisit un modèle dans la liste, à la vraie souris (la liste s'ouvre au clic sur son bouton, la ligne se clique).
async function pickTemplate(page, name, wait = 600) {
  await realClick(page, '.tts-trigger', 250);
  const pos = await page.evaluate(n => {
    const row = Array.from(document.querySelectorAll('.tts-popup .tts-row-leaf')).find(e => e.querySelector('.tts-row-label').textContent.replace(' ★', '').trim() === n);
    if (!row) return null;
    row.scrollIntoView({ block: 'nearest' });
    const b = row.getBoundingClientRect();
    return { x: b.left + 60, y: b.top + b.height / 2 };
  }, name);
  if (!pos) throw new Error('ligne introuvable dans la liste : ' + name);
  await page.mouse.move(pos.x - 20, pos.y, { steps: 3 }); await page.mouse.move(pos.x, pos.y, { steps: 3 });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(wait);
}
// Le curseur dans le texte, à la fin du premier paragraphe, à la vraie souris.
async function clickIntoText(page) {
  const para = await rectOf(page, '.ProseMirror p');
  await page.mouse.click(para.r - 3, para.y); await page.keyboard.press('End');
}
// Surveille le bandeau à 40 ms d'intervalle depuis la page : « vu » reste vrai dès qu'il a été à l'écran un instant (géométrie, pas seulement l'attribut display).
const watchBanner = (page) => page.evaluate(() => {
  window.__race = { seen: false };
  const visible = () => { const b = document.getElementById('autosave-conflict-banner'); return !!b && getComputedStyle(b).display !== 'none' && b.getClientRects().length > 0 && b.getBoundingClientRect().height > 0; };
  window.__raceTimer = setInterval(() => { if (visible()) window.__race.seen = true; }, 40);
});
const bannerSeen = (page) => page.evaluate(() => window.__race.seen);
const bannerNow = (page) => page.evaluate(() => {
  const b = document.getElementById('autosave-conflict-banner'); if (!b || getComputedStyle(b).display === 'none') return { shown: false };
  const r = b.getBoundingClientRect();
  return { shown: true, l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), inside: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight, text: b.textContent.replace(/\s+/g, ' ').trim() };
});
const setLatency = (page, spec) => page.evaluate((s) => { window.__gristStub.setLatency(s); window.__gristStub.resetInFlightStats(); }, spec);
const inFlight = (page) => page.evaluate(() => window.__gristStub.state.inFlight.fetchTable + window.__gristStub.state.inFlight.applyUserActions);
const maxWrites = (page) => page.evaluate(() => window.__gristStub.state.maxInFlight.applyUserActions);
const rowContent = (page, id) => page.evaluate((i) => { const r = window.__gristStub.getRow('Publipostage_Modeles', i); return r ? String(r.Contenu) : null; }, id);
const updates = (page) => page.evaluate(() => window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles'));
const statusOf = (page) => page.evaluate(() => document.getElementById('status-msg').textContent);
const editorText = (page) => page.evaluate(() => document.querySelector('.ProseMirror').textContent);
const inEditor = (page) => page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest && !!a.closest('.ProseMirror'); });
const rowName = (page, id) => page.evaluate((i) => { const r = window.__gristStub.getRow('Publipostage_Modeles', i); return r ? String(r.Nom) : null; }, id);
// La vraie fenêtre « Enregistrer / Abandonner / Annuler » (js/dialogs.js:choose), posée en quittant un modèle modifié : ses boutons se cliquent à la vraie souris.
const dialogState = (page) => page.evaluate(() => {
  const ov = document.getElementById('pp-dialog-modal');
  if (!ov || getComputedStyle(ov).display === 'none') return { open: false };
  const box = ov.querySelector('.modal-content').getBoundingClientRect();
  const buttons = Array.from(ov.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden);
  const rects = buttons.map(b => { const r = b.getBoundingClientRect(); return { label: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  return { open: true, title: ov.querySelector('h3').textContent, labels: buttons.map(b => b.textContent), rects, inPanel: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight };
});
async function clickDialog(page, label, wait = 500) {
  const s = await dialogState(page);
  const b = s.open && s.rects.find(r => r.label === label);
  if (!b) throw new Error('bouton « ' + label + ' » absent : ' + JSON.stringify(s));
  await page.mouse.move(b.x - 10, b.y, { steps: 2 }); await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(wait);
}
const triggerLabel = (page) => page.evaluate(() => document.querySelector('.tts-trigger-label').textContent.replace(/\s*★\s*$/, '').trim());
async function waitFor(page, fn, arg, timeoutMs) {
  try { await page.waitForFunction(fn, arg, { timeout: timeoutMs, polling: 100 }); return true; } catch { return false; }
}
// Plus aucun appel en vol, trois relevés de suite.
async function untilQuiet(page) {
  for (let calm = 0, i = 0; calm < 3 && i < 300; i++) { await page.waitForTimeout(80); calm = (await inFlight(page)) === 0 ? calm + 1 : 0; }
}

// === 1) frappe continue ===
console.log('\n== 1) frappe continue de 8 s, Grist lent (relecture ~2 s, écriture ~1,5 s), panneau 700x400 ==');
{
  const page = await openPage();
  await pickTemplate(page, 'Bail habitation');
  check('départ : le modèle « Bail habitation » est chargé', (await triggerLabel(page)) === 'Bail habitation' && (await editorText(page)) === 'texte a', { label: await triggerLabel(page), text: await editorText(page) });
  await watchBanner(page);
  await setLatency(page, { fetchTable: 2000, applyUserActions: 1500 });
  await clickIntoText(page);
  for (let i = 0; i < 18; i++) { await page.keyboard.type(' mot' + i, { delay: 30 }); await page.waitForTimeout(420); }
  const saved = await waitFor(page, () => String(window.__gristStub.getRow('Publipostage_Modeles', 1).Contenu).indexOf('mot17') !== -1 && window.__gristStub.state.inFlight.fetchTable + window.__gristStub.state.inFlight.applyUserActions === 0, null, 40000);
  await page.waitForTimeout(5200); // deux passages de plus, au repos
  await untilQuiet(page);
  const stored = await rowContent(page, 1);
  check('le bandeau « modifié ailleurs » n\'est jamais apparu, pas même une seconde', !(await bannerSeen(page)), await bannerNow(page));
  check('tout ce qui a été tapé est enregistré (le dernier mot comme le premier)', saved && stored.indexOf('mot0') !== -1 && stored.indexOf('mot17') !== -1, stored);
  check('ce qui est enregistré est exactement ce que l\'écran montre', stored === '<p>' + (await editorText(page)) + '</p>', { stored, screen: await editorText(page) });
  check('jamais deux écritures en même temps (au plus ' + (await maxWrites(page)) + ')', (await maxWrites(page)) <= 1);
  check('le coin d\'état dit « Enregistré à… » (rien d\'en attente)', /^(Enregistré à|Saved at)/.test(await statusOf(page)), await statusOf(page));
  await page.context().close();
}

// === 2) un vrai clic sur Enregistrer au milieu de la frappe ===
console.log('\n== 2) un vrai clic sur Enregistrer au milieu de la frappe, Grist lent (relecture ~1,5 s, écriture ~0,5 s) ==');
{
  const page = await openPage();
  await pickTemplate(page, 'Bail habitation');
  await watchBanner(page);
  await setLatency(page, { fetchTable: 1500, applyUserActions: 500 });
  await clickIntoText(page);
  await page.keyboard.type(' avant', { delay: 30 });
  // Le clic tombe juste après le départ d'un passage de l'auto-save (sa relecture est en vol) : le moment où l'ancien code se trompait à coup sûr (les passages se répètent toutes les
  // 2,5 s à partir de l'ouverture de la page : l'instant d'un clic quelconque ne le garantissait pas).
  await waitFor(page, () => window.__gristStub.state.inFlight.fetchTable > 0, null, 8000);
  await realClick(page, '#btn-save', 100);
  check('le curseur est resté dans le texte après le clic', await inEditor(page));
  for (let i = 0; i < 14; i++) { await page.keyboard.type(' suite' + i, { delay: 30 }); await page.waitForTimeout(380); }
  const saved = await waitFor(page, () => String(window.__gristStub.getRow('Publipostage_Modeles', 1).Contenu).indexOf('suite13') !== -1 && window.__gristStub.state.inFlight.fetchTable + window.__gristStub.state.inFlight.applyUserActions === 0, null, 40000);
  await page.waitForTimeout(5200);
  await untilQuiet(page);
  const stored = await rowContent(page, 1);
  check('le bandeau n\'est jamais apparu après le clic sur Enregistrer', !(await bannerSeen(page)), await bannerNow(page));
  check('« avant » (enregistré à la main) et la dernière frappe (enregistrée par la suite) sont dans la ligne', saved && stored.indexOf('avant') !== -1 && stored.indexOf('suite13') !== -1, stored);
  check('ce qui est enregistré est exactement ce que l\'écran montre', stored === '<p>' + (await editorText(page)) + '</p>', { stored, screen: await editorText(page) });
  await page.context().close();
}

// === 3) un autre modèle choisi pendant qu'un passage relit la table ===
console.log('\n== 3) un autre modèle choisi à la vraie souris pendant qu\'un passage relit la table (relecture ~1,6 s) ==');
{
  const page = await openPage();
  await pickTemplate(page, 'Bail habitation');
  await watchBanner(page);
  await setLatency(page, { fetchTable: 1600, applyUserActions: 0 });
  const reading = await waitFor(page, () => window.__gristStub.state.inFlight.fetchTable > 0, null, 20000); // au repos, un passage ne relit la table que toutes les 15 s (AUTOSAVE_IDLE_INTERVAL_MS)
  check('un passage de l\'enregistrement automatique est en train de relire la table', reading);
  await pickTemplate(page, 'Contrat de vente', 400);
  await page.waitForTimeout(7500); // les passages en vol reviennent, deux autres suivent
  await untilQuiet(page);
  check('le bandeau n\'est jamais apparu', !(await bannerSeen(page)), await bannerNow(page));
  check('l\'écran montre le modèle choisi', (await triggerLabel(page)) === 'Contrat de vente' && (await editorText(page)) === 'texte b', { label: await triggerLabel(page), text: await editorText(page) });
  check('aucune des deux lignes n\'a été réécrite', (await rowContent(page, 1)) === '<p>texte a</p>' && (await rowContent(page, 2)) === '<p>texte b</p>' && (await updates(page)) === 0, { a: await rowContent(page, 1), b: await rowContent(page, 2), updates: await updates(page) });
  await page.context().close();
}

// === 4) un vrai conflit reste signalé ===
console.log('\n== 4) un vrai conflit reste signalé, Grist lent (relecture ~0,8 s) ==');
{
  const page = await openPage();
  await pickTemplate(page, 'Bail habitation');
  await watchBanner(page);
  await setLatency(page, { fetchTable: 800, applyUserActions: 300 });
  await page.evaluate(() => window.__gristStub.remoteWrite('Publipostage_Modeles', 1, { Contenu: '<p>Version d\'ailleurs</p>', DateModif: 1790001000 })); // quelqu'un d'autre enregistre
  await clickIntoText(page);
  await page.keyboard.type(' frappe locale', { delay: 30 });
  const shown = await waitFor(page, () => { const b = document.getElementById('autosave-conflict-banner'); return !!b && getComputedStyle(b).display !== 'none'; }, null, 15000);
  const banner = await bannerNow(page);
  check('le bandeau apparaît', shown && banner.shown, banner);
  check('il tient dans la fenêtre de 700x400', banner.inside === true, banner);
  check('il dit que le modèle a été modifié ailleurs', /modifié ailleurs|modified elsewhere/.test(banner.text || ''), banner.text);
  await page.waitForTimeout(5200); // deux passages de plus : l'enregistrement automatique reste gelé
  await untilQuiet(page);
  check('rien n\'est écrit pendant le gel et la version de l\'autre est intacte', (await updates(page)) === 0 && (await rowContent(page, 1)) === '<p>Version d\'ailleurs</p>', { updates: await updates(page), row: await rowContent(page, 1) });
  await realClick(page, '#autosave-conflict-reload', 800);
  await untilQuiet(page);
  const after = await bannerNow(page);
  check('un vrai clic sur « Recharger la dernière version » charge celle de l\'autre et lève le bandeau', !after.shown && (await editorText(page)) === 'Version d\'ailleurs', { after, text: await editorText(page) });
  await page.waitForTimeout(3200);
  check('et il ne revient pas', !(await bannerNow(page)).shown);
  await page.context().close();
}

// === 5) un autre modèle choisi pendant qu'un Enregistrer lent écrit ===
console.log("\n== 5) un autre modèle choisi à la vraie souris pendant qu'un Enregistrer lent écrit (écriture ~2,5 s), puis une frappe dans ce modèle ==");
{
  const page = await openPage();
  await page.evaluate(() => { localStorage.setItem('pp_autosave_enabled', 'false'); }); // l'écriture lente est celle du bouton, pas d'un passage de l'enregistrement automatique
  await pickTemplate(page, 'Bail habitation');
  await clickIntoText(page);
  await page.keyboard.type(' modifié', { delay: 40 });
  await setLatency(page, { fetchTable: 0, applyUserActions: 2500 });
  await realClick(page, '#btn-save', 100);
  const writing = await waitFor(page, () => window.__gristStub.state.inFlight.applyUserActions > 0, null, 5000);
  check("l'écriture lente de « Bail habitation » est partie", writing);
  await pickTemplate(page, 'Contrat de vente', 700); // des modifications attendent : la liste pose la question « Enregistrer / Abandonner / Annuler »
  const asked = await dialogState(page);
  check('la question « Enregistrer / Abandonner / Annuler » s\'ouvre dans le panneau de 700x400', asked.open && asked.inPanel && JSON.stringify(asked.labels) === '["Annuler","Abandonner","Enregistrer"]', asked);
  await clickDialog(page, 'Abandonner', 800);
  check('pendant l\'écriture : l\'écran montre déjà « Contrat de vente »', (await triggerLabel(page)) === 'Contrat de vente' && (await editorText(page)) === 'texte b', { label: await triggerLabel(page), text: await editorText(page) });
  await waitFor(page, () => window.__gristStub.state.inFlight.applyUserActions === 0, null, 8000);
  await page.waitForTimeout(1200); // la fin de l'enregistrement : la liste relue
  await untilQuiet(page);
  const snap = await page.evaluate(() => ({ current: Templates.getCurrentId(), select: document.getElementById('template-select').value, name: document.getElementById('template-name').value }));
  check('à son retour, l\'enregistrement laisse « Contrat de vente » à l\'écran, dans la liste et comme modèle courant', (await triggerLabel(page)) === 'Contrat de vente' && (await editorText(page)) === 'texte b' && snap.current === 2 && snap.select === '2' && snap.name === 'Contrat de vente',
    { label: await triggerLabel(page), text: await editorText(page), snap });
  check('l\'écriture de « Bail habitation » est allée au bout, « Contrat de vente » n\'a pas bougé', (await rowContent(page, 1)) === '<p>texte a modifié</p>' && (await rowContent(page, 2)) === '<p>texte b</p>', { a: await rowContent(page, 1), b: await rowContent(page, 2) });
  await setLatency(page, 0);
  await page.evaluate(() => { localStorage.removeItem('pp_autosave_enabled'); }); // l'enregistrement automatique revient
  await clickIntoText(page);
  await page.keyboard.type(' ok', { delay: 40 });
  const stored = await waitFor(page, () => / ok/.test(String((window.__gristStub.getRow('Publipostage_Modeles', 2) || {}).Contenu)), null, 8000);
  await page.waitForTimeout(2800); // un passage de plus : rien d'autre ne s'écrit
  await untilQuiet(page);
  check('la frappe dans « Contrat de vente » va dans sa ligne ; « Bail habitation » garde son texte et son nom',
    stored && (await rowContent(page, 1)) === '<p>texte a modifié</p>' && (await rowName(page, 1)) === 'Bail habitation' && (await rowName(page, 2)) === 'Contrat de vente',
    { a: await rowContent(page, 1), b: await rowContent(page, 2), nameA: await rowName(page, 1), nameB: await rowName(page, 2) });
  await page.context().close();
}

// === 6) un deuxième clic sur Enregistrer pendant l'écriture d'un modèle tout neuf ===
console.log("\n== 6) un vrai double clic, puis clic + frappe + Ctrl+S, sur Enregistrer d'un modèle tout neuf pendant que Grist écrit (écriture ~2,5 s) ==");
{
  const rowsNamed = (page, nom) => page.evaluate((n) => { const t = window.__gristStub.state.rows.Publipostage_Modeles; return t.id.filter((id, i) => t.Nom[i] === n); }, nom);
  const actions = (page, type) => page.evaluate((ty) => window.__gristStub.countActions(ty, 'Publipostage_Modeles'), type);
  const listed = (page, nom) => page.evaluate((n) => Array.from(document.getElementById('template-select').options).filter(o => o.textContent.replace(' ★', '').trim() === n).length, nom);
  const currentId = (page) => page.evaluate(() => Templates.getCurrentId());
  const page = await openPage();
  await page.evaluate(() => { localStorage.setItem('pp_autosave_enabled', 'false'); }); // l'écriture lente est celle du bouton
  // Un modèle de départ enregistré d'abord : la table et ses colonnes existent, l'enregistrement qui suit ne fait plus que l'écriture de la ligne.
  await pickTemplate(page, 'Bail habitation');
  await clickIntoText(page);
  await page.keyboard.type(' base', { delay: 30 });
  await realClick(page, '#btn-save', 600);
  await untilQuiet(page);
  // 6a) le double clic
  await realClick(page, '#btn-new', 500);
  check('un modèle tout neuf (sans identifiant) est à l\'écran', (await currentId(page)) === null, await currentId(page));
  await clickIntoText(page);
  await page.keyboard.type('Premier texte', { delay: 30 });
  await page.evaluate(() => { document.getElementById('template-name').value = 'Double clic réel'; });
  await page.evaluate(() => { window.__gristStub.clearActionLog(); window.__clicks = 0; document.getElementById('btn-save').addEventListener('click', () => { window.__clicks++; }, true); });
  await setLatency(page, { fetchTable: 0, applyUserActions: 2500 });
  const save = await rectOf(page, '#btn-save');
  await page.mouse.move(save.x - 12, save.y, { steps: 2 }); await page.mouse.move(save.x, save.y, { steps: 3 });
  await page.mouse.click(save.x, save.y, { clickCount: 2 }); // un vrai double clic : deux enfoncements, deux relâchements
  check('le double clic a bien envoyé deux évènements click au bouton', (await page.evaluate(() => window.__clicks)) === 2, await page.evaluate(() => window.__clicks));
  await waitFor(page, () => window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles') >= 1 && window.__gristStub.state.inFlight.applyUserActions === 0, null, 15000);
  await page.waitForTimeout(1500); // une écriture en trop se montrerait ici
  const maxA = await maxWrites(page); // avant setLatency(page, 0) : il remet ce compte à zéro
  await setLatency(page, 0);
  await untilQuiet(page);
  let ids = await rowsNamed(page, 'Double clic réel');
  check('une seule ligne est créée sous ce nom, jamais « (2) »', ids.length === 1 && (await rowsNamed(page, 'Double clic réel (2)')).length === 0, { ids, second: await rowsNamed(page, 'Double clic réel (2)') });
  check('une création, une mise à jour (le deuxième clic enregistre après la première écriture), jamais deux écritures à la fois', (await actions(page, 'AddRecord')) === 1 && (await actions(page, 'UpdateRecord')) === 1 && maxA <= 1,
    { adds: await actions(page, 'AddRecord'), updates: await actions(page, 'UpdateRecord'), max: maxA });
  check('la ligne porte le texte tapé, la liste et le titre disent le même nom, une seule fois', ids.length === 1 && /Premier texte/.test(String(await rowContent(page, ids[0]))) && (await listed(page, 'Double clic réel')) === 1 && (await triggerLabel(page)) === 'Double clic réel',
    { content: ids.length ? await rowContent(page, ids[0]) : null, listed: await listed(page, 'Double clic réel'), label: await triggerLabel(page) });
  check('le modèle courant est cette ligne, le coin d\'état dit « Enregistré »', ids.length === 1 && (await currentId(page)) === ids[0] && /Enregistré|Saved/.test(await statusOf(page)), { current: await currentId(page), status: await statusOf(page) });
  // 6b) un clic, une vraie frappe, Ctrl+S, un clic : un seul enregistrement de plus
  await realClick(page, '#btn-new', 500);
  await clickIntoText(page);
  await page.keyboard.type('Texte B', { delay: 30 });
  await page.evaluate(() => { document.getElementById('template-name').value = 'Double clic clavier'; window.__gristStub.clearActionLog(); });
  await setLatency(page, { fetchTable: 0, applyUserActions: 2500 });
  await realClick(page, '#btn-save', 100);
  const started = await waitFor(page, () => window.__gristStub.state.inFlight.applyUserActions > 0, null, 5000);
  check('la première écriture est partie', started);
  await clickIntoText(page);
  await page.keyboard.type(' DERNIER', { delay: 30 }); // tapé pendant la première écriture
  await page.keyboard.press('Control+s');
  await realClick(page, '#btn-save', 100);
  await waitFor(page, () => window.__gristStub.countActions('UpdateRecord', 'Publipostage_Modeles') >= 1 && window.__gristStub.state.inFlight.applyUserActions === 0, null, 15000);
  await page.waitForTimeout(1500);
  const maxB = await maxWrites(page);
  await setLatency(page, 0);
  await untilQuiet(page);
  ids = await rowsNamed(page, 'Double clic clavier');
  check('un clic, Ctrl+S et un clic de plus : une seule ligne, une création, une mise à jour, jamais deux écritures à la fois', ids.length === 1 && (await actions(page, 'AddRecord')) === 1 && (await actions(page, 'UpdateRecord')) === 1 && maxB <= 1,
    { ids, adds: await actions(page, 'AddRecord'), updates: await actions(page, 'UpdateRecord'), max: maxB });
  check('la ligne porte le texte tapé pendant la première écriture, c\'est le modèle courant', ids.length === 1 && /Texte B DERNIER/.test(String(await rowContent(page, ids[0]))) && (await currentId(page)) === ids[0],
    { content: ids.length ? await rowContent(page, ids[0]) : null, current: await currentId(page) });
  await page.context().close();
}

// === 7) un deuxième clic sur « Utiliser ce modèle » pendant la création ===
console.log("\n== 7) un vrai double clic sur « Utiliser ce modèle » de la galerie pendant que Grist écrit (écriture ~2,5 s) ==");
{
  const modelRows = (page) => page.evaluate(() => { const t = window.__gristStub.state.rows.Publipostage_Modeles; return t.id.map((id, i) => ({ id, nom: t.Nom[i] })); });
  const actions = (page, type) => page.evaluate((ty) => window.__gristStub.countActions(ty, 'Publipostage_Modeles'), type);
  const galleryShown = (page) => page.evaluate(() => ['template-gallery-modal', 'template-preview-modal'].some(id => { const m = document.getElementById(id); return !!m && getComputedStyle(m).display !== 'none'; }));
  const page = await openPage();
  await page.evaluate(() => { localStorage.setItem('pp_autosave_enabled', 'false'); }); // l'écriture lente est celle de la galerie
  // Un modèle de départ enregistré d'abord : la table et ses colonnes existent, la création qui suit ne fait plus que l'écriture de la ligne.
  await pickTemplate(page, 'Bail habitation');
  await clickIntoText(page);
  await page.keyboard.type(' base', { delay: 30 });
  await realClick(page, '#btn-save', 600);
  await untilQuiet(page);
  // La galerie, à la vraie souris : « + » au survol, « Créer à partir d'un modèle », la première carte (« Facture »).
  const newBtn = await rectOf(page, '#btn-new');
  await page.mouse.move(newBtn.x - 10, newBtn.y, { steps: 2 }); await page.mouse.move(newBtn.x, newBtn.y, { steps: 3 }); await page.waitForTimeout(350);
  const fromTemplate = await rectOf(page, '#v2-btn-new-from-template');
  await page.mouse.move(newBtn.x, fromTemplate.y, { steps: 10 }); await page.mouse.move(fromTemplate.x, fromTemplate.y, { steps: 4 });
  await page.mouse.click(fromTemplate.x, fromTemplate.y); await page.waitForTimeout(400);
  await page.waitForSelector('#tpl-gallery-grid .tpl-gallery-card', { timeout: 8000 }).catch(() => {});
  await realClick(page, '#tpl-gallery-grid .tpl-gallery-card', 400);
  await page.waitForFunction(() => document.getElementById('tpl-preview-tiptap').children.length > 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const entryName = await page.evaluate(() => document.getElementById('tpl-preview-name').textContent.trim());
  const rowsBefore = (await modelRows(page)).length;
  await page.evaluate(() => { window.__gristStub.clearActionLog(); window.__clicks = 0; document.getElementById('tpl-preview-use-empty').addEventListener('click', () => { window.__clicks++; }, true); });
  await setLatency(page, { fetchTable: 0, applyUserActions: 2500 });
  const useBtn = await rectOf(page, '#tpl-preview-use-empty');
  check('« Utiliser ce modèle » est visible et libre dans le panneau de 700x400', !!useBtn && useBtn.onTop && useBtn.l >= 0 && useBtn.r <= WIDTH && useBtn.t >= 0 && useBtn.b <= HEIGHT, useBtn);
  await page.mouse.move(useBtn.x - 12, useBtn.y, { steps: 2 }); await page.mouse.move(useBtn.x, useBtn.y, { steps: 3 });
  await page.mouse.click(useBtn.x, useBtn.y, { clickCount: 2 }); // un vrai double clic
  check('le double clic a bien envoyé deux évènements click au bouton', (await page.evaluate(() => window.__clicks)) === 2, await page.evaluate(() => window.__clicks));
  await waitFor(page, () => window.__gristStub.countActions('AddRecord', 'Publipostage_Modeles') >= 1 && window.__gristStub.state.inFlight.applyUserActions === 0
    && ['template-gallery-modal', 'template-preview-modal'].every(id => getComputedStyle(document.getElementById(id)).display === 'none'), null, 15000);
  await page.waitForTimeout(1500); // une création en trop se montrerait ici
  const maxC = await maxWrites(page);
  await setLatency(page, 0);
  await untilQuiet(page);
  const created = (await modelRows(page)).slice(rowsBefore);
  check('un seul modèle est créé, sous le nom de la galerie, jamais « (2) »', created.length === 1 && created[0].nom === entryName, { entryName, created });
  check('une création, aucune mise à jour, jamais deux écritures à la fois', (await actions(page, 'AddRecord')) === 1 && (await actions(page, 'UpdateRecord')) === 0 && maxC <= 1,
    { adds: await actions(page, 'AddRecord'), updates: await actions(page, 'UpdateRecord'), max: maxC });
  check('la galerie est fermée, la liste et le titre disent le nom une seule fois, c\'est le modèle courant',
    !(await galleryShown(page)) && created.length === 1 && (await triggerLabel(page)) === entryName && (await page.evaluate((n) => Array.from(document.getElementById('template-select').options).filter(o => o.textContent.replace(' ★', '').trim() === n).length, entryName)) === 1
      && (await page.evaluate(() => Templates.getCurrentId())) === created[0].id,
    { shown: await galleryShown(page), label: await triggerLabel(page), current: await page.evaluate(() => Templates.getCurrentId()) });
  check('le coin d\'état dit le nom retenu', new RegExp(entryName).test(await statusOf(page)), await statusOf(page));
  await page.context().close();
}

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
