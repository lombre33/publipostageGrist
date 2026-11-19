#!/usr/bin/env node
// Consigne 072 de GFS (17/11, décision du porteur : « le rangement de Publipostage+ fait foi »), à la VRAIE souris, à la taille du panneau Grist d'Antoine (~700x400), en clair
// puis en sombre. GFS écrit désormais dans la table du rangement (Publipostage_PreferencesModeles) pour la même personne : les scénarios de dev-tests/scenarios-template-tree.js et
// scenarios-template-organize.js tournent DANS la page (dispatchEvent) ; ils ne prouvent ni qu'un vrai clic ouvre la liste et la relit, ni que la liste et la fenêtre « Organiser mes
// modèles » tiennent dans 700x400 avec les dossiers vides, ni l'aspect d'un dossier vide dans les deux thèmes.
// Une « autre connexion » (GFS) = des actions appliquées au faux Grist sans passer par le widget (window.__gristStub.applyUserActions), pendant que le widget est ouvert.
// Ce que ce script prouve, par thème :
//  (a) la liste est relue à chaque ouverture (vrai clic sur le déclencheur) : un dossier créé, un modèle rangé et un modèle épinglé dans GFS pendant que la liste était fermée
//      apparaissent à l'ouverture suivante, sans doublon, et le widget n'écrit rien en relisant ;
//  (b) un dossier qui n'a que sa ligne d'état est un dossier vide de l'arbre (replié ou déplié selon « Replie »), dans la liste ET dans « Organiser mes documents » ;
//  (c) le widget ouvert seul (sans GFS) montre son rangement : tout ce qui précède se joue dans une page sans GFS, et l'abonné de la barre de GFS (garde `popup &&`) ne lève rien ;
//  (d) un dossier vide se crée et se supprime dans « Organiser mes documents » (décision du porteur du 17/11, « Créer et supprimer ») : « Nouveau dossier » GARDE le dossier vide (sa ligne d'état est
//      écrite, GFS la voit), un dossier vide porte « Supprimer » (au premier plan, dans la fenêtre à 700x400), supprimer retire la ligne d'état, et les deux gestes se défont et se rétablissent
//      au vrai clavier (Ctrl + Z, Ctrl + Y, la fenêtre fermée : une fenêtre ouverte garde la touche).
// Lancé par run-headless.mjs (groupe Node "templateRereadMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-template-reread-mouse.mjs
// SHOT_DIR=<dossier> : y dépose les captures (liste et fenêtre, clair et sombre).
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.TEMPLATE_REREAD_MOUSE_PORT || 8897);
const WIDTH = 700;
const HEIGHT = 400;
const SHOT_DIR = process.env.SHOT_DIR || '';
if (SHOT_DIR) await mkdir(SHOT_DIR, { recursive: true });

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-folder-default-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-template-reread-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const consoleErrors = [];
const TABLE = 'Publipostage_PreferencesModeles';
const TEMPLATES = `
    const m = stub.state.rows.Publipostage_Modeles;
    const add = (id, nom, html, def) => { m.id.push(id); m.Nom.push(nom); m.Contenu.push(html); m.NomFichierPDF.push(''); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(def); };
    add(1, 'Bail habitation', '<p>a</p>', false); add(2, 'Contrat de vente', '<p>b</p>', true); add(3, 'Avenant loyer', '<p>c</p>', false);
    add(4, 'Mise en demeure', '<p>d</p>', false); add(5, 'Quittance', '<p>e</p>', false); add(6, 'Sans dossier', '<p>f</p>', false);
    stub.state.nextRowId.Publipostage_Modeles = 7;
`;
// Le rangement tel que GFS l'a laissé avant que le widget s'ouvre : « Bail habitation » dans « Contrats », et trois dossiers qui n'ont que leur ligne d'état (ModeleId 0) :
// « Archives » déplié, « Contrats/Avenants » et « Courriers » repliés.
const SEED_PREFS = `
    stub.state.tables.push('${TABLE}');
    stub.state.rows.${TABLE} = { id: [1, 2, 3, 4], Utilisateur: ['', '', '', ''], ModeleId: [1, 0, 0, 0], Epingle: [false, false, false, false],
      Dossier: ['Contrats', 'Archives', 'Contrats/Avenants', 'Courriers'], Replie: [false, false, true, true] };
    stub.state.nextRowId.${TABLE} = 5;
`;

async function openPage(scheme) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT }, colorScheme: scheme });
  const page = await context.newPage();
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { consoleErrors.push(m.text()); console.log('[console.error]', m.text().slice(0, 200)); } });
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
  await page.addInitScript((t) => { try { localStorage.setItem('pp_theme', t); } catch (e) { /* stockage refusé */ } }, scheme);
  await page.addInitScript(`window.__preSeedGristStub = (stub) => { ${TEMPLATES} ${SEED_PREFS} };`);
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return { page, context };
}

const center = (page, sel) => page.evaluate((s) => {
  const r = document.querySelector(s); if (!r) return null; r.scrollIntoView({ block: 'nearest' });
  const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, sel);
// Les lignes de la liste déroulante : un dossier = chemin, état déplié, enfants directs (lignes de modèles et sous-dossiers) ; vide = aucun enfant.
const treeRows = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.tts-popup .tts-row-folder')).map(r => {
  const g = r.nextElementSibling;
  return { f: r.dataset.folderPath, exp: r.getAttribute('aria-expanded'), hidden: getComputedStyle(g).display === 'none', children: g ? g.querySelectorAll(':scope > .tts-row, :scope > .tts-group').length : -1 };
}));
const leavesIn = (page, folder) => page.evaluate((f) => {
  const row = Array.from(document.querySelectorAll('.tts-popup .tts-row-folder')).find(r => r.dataset.folderPath === f);
  return row ? Array.from(row.nextElementSibling.querySelectorAll(':scope > .tts-row-leaf .tts-row-label')).map(e => e.textContent.replace(' ★', '')) : null;
}, folder);
const pinnedNames = (page) => page.evaluate(() => {
  const label = Array.from(document.querySelectorAll('.tts-popup .tts-section-label'))[0];
  if (!label) return [];
  const out = []; let n = label.nextElementSibling;
  while (n && !n.classList.contains('tts-section-label')) { if (n.classList.contains('tts-row-leaf')) out.push(n.querySelector('.tts-row-label').textContent.replace(' ★', '')); n = n.nextElementSibling; }
  return out;
});
const organizeFolders = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#template-organize-list .tts-row-folder')).map(r => ({
  f: r.querySelector('.tts-row-label').textContent, hasSwitch: !!r.querySelector('.tom-folder-default-btn'), exp: r.getAttribute('aria-expanded'),
  children: r.nextElementSibling && r.nextElementSibling.classList.contains('tts-group') ? r.nextElementSibling.querySelectorAll(':scope > .tts-row, :scope > .tts-group').length : -1 })));
const widgetWrites = (page) => page.evaluate((t) => window.__gristStub.countActions('AddRecord', t) + window.__gristStub.countActions('UpdateRecord', t) + window.__gristStub.countActions('BulkUpdateRecord', t), TABLE);
const shot = async (page, name) => { if (SHOT_DIR) await page.screenshot({ path: join(SHOT_DIR, name + '.png') }); };
const inViewport = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vh: innerHeight, vw: innerWidth, overflowX: document.documentElement.scrollWidth - innerWidth }; }, sel);

async function playScheme(scheme) {
  console.log(`\n=== Thème ${scheme === 'dark' ? 'sombre' : 'clair'}, ${WIDTH}x${HEIGHT} ===`);
  const { page, context } = await openPage(scheme);
  const tag = (s) => `[${scheme}] ${s}`;
  const themeApplied = await page.evaluate(() => (document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')));
  check(tag('le thème demandé est bien celui de la page'), themeApplied === scheme, themeApplied);

  // (c) La page est ouverte seule : pas de GFS, et pourtant le rangement se montre. L'abonné de la barre de GFS (garde `popup &&`) a déjà été rappelé au démarrage sans rien lever.
  const noGfs = await page.evaluate(() => ({ hosted: GfsLink.hosted }));
  check(tag('page ouverte seule, sans GFS'), noGfs.hosted === false, noGfs);

  // (b) Au démarrage, les dossiers qui n'ont que leur ligne d'état sont là, dans la liste déroulante ouverte au vrai clic.
  const trigger = await center(page, '.tts-trigger');
  await page.mouse.move(trigger.x - 20, trigger.y - 6, { steps: 2 }); await page.mouse.move(trigger.x, trigger.y, { steps: 3 });
  await page.mouse.click(trigger.x, trigger.y); await page.waitForTimeout(300);
  let rows = await treeRows(page);
  const byPath = (p) => rows.find(r => r.f === p);
  check(tag('liste : « Archives » (ligne d’état seule, Replie faux) est un dossier déplié et vide'), !!byPath('Archives') && byPath('Archives').exp === 'true' && byPath('Archives').children === 0, rows);
  check(tag('liste : « Contrats/Avenants » et « Courriers » (Replie vrai) sont des dossiers vides repliés'), !!byPath('Contrats/Avenants') && byPath('Contrats/Avenants').exp === 'false' && byPath('Contrats/Avenants').children === 0 && !!byPath('Courriers') && byPath('Courriers').exp === 'false' && byPath('Courriers').children === 0, rows);
  check(tag('liste : « Contrats » garde son modèle et son sous-dossier vide'), !!byPath('Contrats') && (await leavesIn(page, 'Contrats')).join() === 'Bail habitation', await leavesIn(page, 'Contrats'));
  const geoOpen = await inViewport(page, '.tts-popup');
  check(tag('700x400 : la liste tient dans la fenêtre, sans défilement horizontal de la page'), !!geoOpen && geoOpen.top >= 0 && geoOpen.bottom <= geoOpen.vh && geoOpen.right <= geoOpen.vw && geoOpen.overflowX <= 20, geoOpen);
  await shot(page, `liste-ouverte-${scheme}`);

  // Un vrai clic sur un dossier vide replié le déplie (il n'y a rien dessous) sans rien écrire.
  const writes0 = await widgetWrites(page);
  const courriers = await center(page, '.tts-popup .tts-row-folder[data-folder-path="Courriers"]');
  await page.mouse.click(courriers.x, courriers.y); await page.waitForTimeout(200);
  rows = await treeRows(page);
  check(tag('vrai clic sur un dossier vide : il s’ouvre et reste vide, le widget n’écrit rien'), byPath('Courriers').exp === 'true' && byPath('Courriers').children === 0 && (await widgetWrites(page)) === writes0, rows);

  // (a) GFS range pendant que la liste est fermée : un dossier créé, « Bail habitation » rangé dedans, « Avenant loyer » épinglé.
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(tag('Échap ferme la liste'), (await page.evaluate(() => !document.querySelector('.tts-popup.is-open'))));
  await page.evaluate(async (t) => {
    const stub = window.__gristStub;
    await stub.applyUserActions([
      ['AddRecord', t, null, { Utilisateur: '', ModeleId: 0, Epingle: false, Dossier: 'Chez GFS', Replie: false }],
      ['UpdateRecord', t, 1, { Dossier: 'Chez GFS' }],
      ['AddRecord', t, null, { Utilisateur: '', ModeleId: 3, Epingle: true, Dossier: '', Replie: false }],
    ]);
  }, TABLE);
  const writesGfs = await widgetWrites(page);
  await page.mouse.click(trigger.x, trigger.y); await page.waitForTimeout(700);
  rows = await treeRows(page);
  check(tag('relue à l’ouverture : le dossier créé dans GFS est là, vide plus bas, avec « Bail habitation » rangé dedans'), !!byPath('Chez GFS') && (await leavesIn(page, 'Chez GFS')).join() === 'Bail habitation', { rows, leaves: await leavesIn(page, 'Chez GFS') });
  check(tag('relue à l’ouverture : « Contrats » n’a plus le modèle (une seule fois dans l’arbre, pas de doublon)'), (await leavesIn(page, 'Contrats')).length === 0 && (await page.evaluate(() => document.querySelectorAll('.tts-popup .tts-row-leaf').length)) === 6 + 1, { leaves: await leavesIn(page, 'Contrats'), count: await page.evaluate(() => document.querySelectorAll('.tts-popup .tts-row-leaf').length) });
  check(tag('relue à l’ouverture : « Avenant loyer » épinglé dans GFS est dans « Épinglés »'), (await pinnedNames(page)).includes('Avenant loyer'), await pinnedNames(page));
  check(tag('relue à l’ouverture : le widget n’a rien écrit en relisant'), (await widgetWrites(page)) === writesGfs, { avant: writesGfs, apres: await widgetWrites(page) });
  const geoAfter = await inViewport(page, '.tts-popup');
  check(tag('700x400 : la liste relue tient toujours dans la fenêtre'), !!geoAfter && geoAfter.top >= 0 && geoAfter.bottom <= geoAfter.vh && geoAfter.overflowX <= 20, geoAfter);
  await shot(page, `liste-relue-${scheme}`);

  // La fenêtre « Organiser mes documents » (vrai clic sur son bouton) : mêmes dossiers vides, avec l'interrupteur « replié par défaut » ; relue aussi à l'ouverture.
  const organize = await center(page, '#btn-organize-templates');
  await page.mouse.move(organize.x - 12, organize.y - 4, { steps: 2 }); await page.mouse.click(organize.x, organize.y); await page.waitForTimeout(500);
  let orows = await organizeFolders(page);
  const oby = (p) => orows.find(r => r.f === p || r.f.endsWith('/' + p));
  check(tag('Organiser : les dossiers vides (« Archives », « Courriers », « Chez GFS » a son modèle) sont des lignes avec leur interrupteur'), !!oby('Archives') && oby('Archives').hasSwitch && !!oby('Courriers') && oby('Courriers').hasSwitch, orows);
  check(tag('Organiser : « Archives » et « Courriers » n’ont aucun modèle dessous'), oby('Archives').children === 0 && oby('Courriers').children === 0, orows);
  const geoModal = await page.evaluate(() => { const c = document.querySelector('.template-organize-modal-content'); const r = c.getBoundingClientRect(); const l = document.getElementById('template-organize-list'); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, listScroll: l.scrollHeight, listClient: l.clientHeight, overflowX: document.documentElement.scrollWidth - innerWidth }; });
  check(tag('700x400 : la fenêtre « Organiser » tient dans la fenêtre'), geoModal.top >= 0 && geoModal.bottom <= geoModal.vh && geoModal.overflowX <= 20, geoModal);
  await shot(page, `organiser-${scheme}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);

  // GFS ajoute encore un dossier pendant que la fenêtre est fermée : la rouvrir le montre (la fenêtre relit à l'ouverture, comme la liste).
  await page.evaluate(async (t) => { await window.__gristStub.applyUserActions([['AddRecord', t, null, { Utilisateur: '', ModeleId: 0, Epingle: false, Dossier: 'Dernier dossier GFS', Replie: true }]]); }, TABLE);
  await page.evaluate(() => TemplateOrganizeModal.open()); await page.waitForTimeout(600);
  orows = await organizeFolders(page);
  check(tag('Organiser relu à l’ouverture : le dossier ajouté dans GFS entre-temps est là'), !!orows.find(r => r.f === 'Dernier dossier GFS'), orows);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);

  // (d) Créer, supprimer, défaire, rétablir un dossier vide, à la vraie souris et au vrai clavier.
  const NAME = 'Brouillons';
  const stateRowsOf = (name) => page.evaluate(([t, n]) => { const r = window.__gristStub.state.rows[t]; return r.id.map((id, i) => ({ id, u: r.Utilisateur[i], m: r.ModeleId[i], d: r.Dossier[i] })).filter(x => x.m === 0 && x.d === n); }, [TABLE, name]);
  const folderRowIn = (path) => page.evaluate((n) => { const row = document.querySelector('#template-organize-list .tts-row-folder[data-folder-path="' + CSS.escape(n) + '"]'); if (!row) return null; const lab = row.querySelector('.tts-row-label'); return { del: !!row.querySelector('.tom-folder-delete-btn'), hint: !!row.querySelector('.tom-place-hint'), nameCut: !!lab && (() => { const rg = document.createRange(); rg.selectNodeContents(lab); return rg.getBoundingClientRect().width > lab.getBoundingClientRect().width + 0.05; })(), name: lab ? lab.textContent : '' }; }, NAME);
  const statusText = () => page.evaluate(() => (document.getElementById('status-msg') || {}).textContent || '');
  const delGeo = () => page.evaluate((n) => {
    const row = document.querySelector('#template-organize-list .tts-row-folder[data-folder-path="' + CSS.escape(n) + '"]');
    const b = row && row.querySelector('.tom-folder-delete-btn'); if (!b) return null;
    const r = b.getBoundingClientRect(), l = document.getElementById('template-organize-list').getBoundingClientRect(), rr = row.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height), inList: r.top >= l.top - 1 && r.bottom <= l.bottom + 1 && r.left >= 0 && r.right <= innerWidth, top: hit === b, rowLeft: rr.left + 40, label: b.textContent.trim(), rowFits: rr.right <= l.right + 1 };
  }, NAME);
  // Le bouton « Organiser » est dans l'en-tête de la liste déroulante : on ouvre la liste au vrai clic (si elle ne l'est pas), puis la fenêtre.
  const openOrganize = async () => {
    if (!(await page.evaluate(() => !!document.querySelector('.tts-popup.is-open')))) { const t = await center(page, '.tts-trigger'); await page.mouse.move(t.x - 12, t.y - 4, { steps: 2 }); await page.mouse.click(t.x, t.y); await page.waitForTimeout(400); }
    const b = await center(page, '#btn-organize-templates'); await page.mouse.move(b.x - 12, b.y - 4, { steps: 2 }); await page.mouse.click(b.x, b.y); await page.waitForTimeout(500);
  };
  const closeOrganize = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };
  const keys = async (combo) => { await page.keyboard.press(combo); await page.waitForTimeout(900); };

  await openOrganize();
  const newFolder = await center(page, '#template-organize-new-folder');
  await page.mouse.click(newFolder.x, newFolder.y); await page.waitForTimeout(250);
  await page.keyboard.type(NAME); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  await shot(page, `organiser-nouveau-dossier-${scheme}`);
  let made = await folderRowIn(NAME);
  check(tag('créer : « Nouveau dossier » (vrai clic, nom tapé) montre le dossier vide, avec « Supprimer » et l’invite « Ranger ici »'), !!made && made.del && made.hint, made);
  check(tag('700x400 : le nom du dossier neuf tient en entier (pas de points de suspension), c’est l’invite « Vide : … » qui se raccourcit'), !!made && made.name === NAME && made.nameCut === false, made);
  let made1 = await stateRowsOf(NAME);
  check(tag('créer : la ligne d’état du dossier est écrite tout de suite (ModeleId 0, Dossier « Brouillons »), une seule : GFS la voit'), made1.length === 1 && made1[0].m === 0, made1);
  let geo = await delGeo();
  check(tag('700x400 : « Supprimer » est dans la liste de la fenêtre, au premier plan, assez grand pour un clic (≥ 20 px de haut), la ligne tient dans la fenêtre'), !!geo && geo.inList && geo.top && geo.h >= 20 && geo.rowFits && geo.label === 'Supprimer', geo);
  await page.mouse.move(geo.rowLeft, geo.y, { steps: 2 }); await page.waitForTimeout(150);
  await shot(page, `organiser-dossier-vide-${scheme}`);

  // Supprimer : un vrai clic, sans question ; la ligne d'état part avec le dossier.
  await page.mouse.click(geo.x, geo.y); await page.waitForTimeout(600);
  check(tag('supprimer : un vrai clic sur « Supprimer » retire le dossier de la liste, sans question'), (await folderRowIn(NAME)) === null && (await page.evaluate(() => { const ov = document.getElementById('pp-dialog-modal'); return !ov || ov.style.display === 'none'; })), await folderRowIn(NAME));
  check(tag('supprimer : sa ligne d’état est retirée de la table (GFS ne le voit plus)'), (await stateRowsOf(NAME)).length === 0, await stateRowsOf(NAME));

  // Défaire, rétablir : la fenêtre fermée, au vrai clavier.
  await closeOrganize();
  await keys('Control+z');
  check(tag('défaire la suppression (Ctrl + Z) : le coin d’état le dit et la ligne d’état revient'), /Brouillons/.test(await statusText()) && (await stateRowsOf(NAME)).length === 1, { status: await statusText(), rows: await stateRowsOf(NAME) });
  await openOrganize();
  made = await folderRowIn(NAME);
  check(tag('défaire la suppression : le dossier est revenu dans « Organiser », vide, avec « Supprimer »'), !!made && made.del, made);
  await closeOrganize();
  await keys('Control+y');
  check(tag('rétablir la suppression (Ctrl + Y) : la ligne d’état repart'), (await stateRowsOf(NAME)).length === 0, await stateRowsOf(NAME));
  await keys('Control+z');
  await keys('Control+z');
  check(tag('défaire encore (Ctrl + Z, Ctrl + Z) : la suppression puis la création sont défaites, le dossier n’existe plus (aucune ligne d’état)'), (await stateRowsOf(NAME)).length === 0 && !(await page.evaluate((n) => TemplatePreferences.listStateFolders().includes(n), NAME)), await stateRowsOf(NAME));
  await keys('Control+y');
  check(tag('rétablir la création (Ctrl + Y) : le dossier vide revient, sa ligne d’état aussi'), (await stateRowsOf(NAME)).length === 1, await stateRowsOf(NAME));
  await openOrganize();
  check(tag('rétablir la création : le dossier est dans « Organiser »'), !!(await folderRowIn(NAME)), await folderRowIn(NAME));
  // Le geste est encore là : un dossier vide qu'on garde ne coûte rien, on le supprime pour rendre la page comme elle était.
  geo = await delGeo();
  await page.mouse.move(geo.rowLeft, geo.y, { steps: 2 }); await page.mouse.click(geo.x, geo.y); await page.waitForTimeout(500);
  check(tag('à la fin : le dossier de l’essai est supprimé, la table du rangement n’a plus que les lignes de départ et celles de GFS'), (await stateRowsOf(NAME)).length === 0, await stateRowsOf(NAME));
  await closeOrganize();

  // Une autre personne (autre identifiant) : ses dossiers vides ne sont pas les nôtres. Le stub n'identifie personne : ses lignes se lisent « Utilisateur vide = la personne courante »,
  // donc ce contrôle-ci est fait avec une ligne qui porte un autre e-mail (elle ne doit pas apparaître pour la personne courante, comme avant).
  await page.evaluate(async (t) => { await window.__gristStub.applyUserActions([['AddRecord', t, null, { Utilisateur: 'autre@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Chez quelqu’un d’autre', Replie: false }]]); }, TABLE);
  await page.mouse.click(trigger.x, trigger.y); await page.waitForTimeout(500);
  rows = await treeRows(page);
  check(tag('le dossier vide d’une autre personne n’apparaît pas'), !rows.find(r => r.f === 'Chez quelqu’un d’autre'), rows.map(r => r.f));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await context.close();
}

// Une exception qui arrête un parcours (sur l'ancien code, un dossier vide absent de la liste n'a pas de ligne à cliquer) est une vérification qui échoue, pas la fin du script : le second thème se joue quand même.
async function playSchemeToTheEnd(scheme) {
  try { await playScheme(scheme); } catch (e) { check(`[${scheme}] le parcours va jusqu'au bout (une exception l'arrête : ${e && e.message})`, false); }
}
await playSchemeToTheEnd('light');
await playSchemeToTheEnd('dark');

check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);
check('aucune erreur dans la console (dont « abonné en échec » de la barre de GFS)', consoleErrors.length === 0, consoleErrors);
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
