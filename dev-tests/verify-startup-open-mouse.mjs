#!/usr/bin/env node
// Ouverture du widget sur un document dont les tables se lisent lentement, dans un vrai navigateur à 700x400 (Playwright, vraie souris et vrai clavier) - mesure d'ouverture
// du 2026-10-02 (Antoine : « délais trop longs à l'ouverture, diviser par 3 »). Le premier modèle ne s'affichait qu'après 18 appels Grist EN SÉRIE, dont sept lectures de la table
// des modèles et une lecture complète de chaque table du document (seulement pour en lister les colonnes) : sur un gros document, plusieurs secondes d'attente. Ici le document est
// celui du faux Grist (dev-tests/grist-stub.js), dont chaque appel est journalisé avec ses dates et dont la lecture complète d'une table du document dure 2,5 s (les autres 40 ms) :
//  - la table des modèles est lue UNE fois avant l'affichage (avant : sept) ;
//  - le modèle est affiché avant qu'aucune table du document n'ait fini de se lire (avant : après la lecture de toutes) ;
//  - les bulles #Variable sont jugées tout de suite sur les colonnes des métadonnées : la bonne n'est pas rouge, les cassées le sont ;
//  - à la vraie souris et au vrai clavier, « # » liste les colonnes pendant que la lecture complète n'est pas finie ;
//  - la lecture complète, elle, a bien lieu ensuite : la colonne que les métadonnées montrent et que fetchTable ne rend pas (accès restreint) disparaît de la liste, sa bulle devient rouge.
// Les durées affichées sont indicatives (le navigateur charge ici les vrais CDN) ; les vérifications portent sur des ordres et des nombres d'appels, jamais sur une durée.
// Lancé par run-headless.mjs (groupe Node "startupOpenMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-startup-open-mouse.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.STARTUP_OPEN_PORT || 8925);
const WIDTH = 700, HEIGHT = 400;
const SLOW_READ_MS = 2500; // lecture complète d'une table du document
const QUICK_MS = 40;       // tout autre appel Grist

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-small-panel.mjs.
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
if (!OFFLINE) console.log('[verify-startup-open-mouse] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Le document : deux tables lues lentement (Missions, Personnes), la table des modèles complète (toutes les colonnes que les migrations de js/templates.js attendent, donc
// aucune n'est ajoutée) avec un modèle par défaut dont quatre bulles : une bonne, une dont la colonne n'existe plus, une dont la table n'existe plus, une dont la colonne
// est dans les métadonnées mais que fetchTable ne rend pas (ce que fait un accès restreint). Chaque appel du widget est journalisé : { name, arg, t0, t1 } (t1 absent tant que
// l'appel n'est pas revenu). Un « observateur » relève, à l'instant où le modèle apparaît dans l'éditeur et à celui où le statut dit « prêt », les appels déjà faits et revenus,
// ainsi que l'état des bulles.
const MODEL_NAME = 'FICHE OUVERTURE';
const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
const MODEL_HTML = `<p>${MODEL_NAME}</p><p>Référence : ${badge('Missions', 'Reference')}</p><p>Ancienne : ${badge('Missions', 'Disparue')}</p>`
  + `<p>Autre table : ${badge('Autre', 'Colonne')}</p><p>Restreinte : ${badge('Missions', 'Secret')}</p>`;
const PRESEED = `
  window.__preSeedGristStub = (stub) => {
    stub.setVariables('Missions', { Reference: 'Text', Titre: 'Text', Montant: 'Numeric', Secret: 'Text' });
    stub.setVariables('Personnes', { Nom: 'Text' });
    delete stub.state.rows.Missions.Secret; // dans les métadonnées, pas dans ce que fetchTable rend
    const cols = ['Nom', 'Contenu', 'NomFichierPDF', 'HeaderFooter', 'DateModif', 'Margins', 'EstParDefaut', 'TypeModele', 'Destinataires', 'Cc', 'Cci', 'Objet', 'SuiviModifications'];
    const m = { id: [1] };
    cols.forEach(c => { m[c] = [null]; });
    Object.assign(m, { Nom: [${JSON.stringify(MODEL_NAME)}], Contenu: [${JSON.stringify(MODEL_HTML)}], NomFichierPDF: [''], HeaderFooter: [''], DateModif: [1790000000], Margins: [''], EstParDefaut: [true], TypeModele: ['document'] });
    stub.state.rows.Publipostage_Modeles = m;
    stub.state.nextRowId.Publipostage_Modeles = 2;

    const calls = window.__ppCalls = [];
    const api = window.grist.docApi;
    ['listTables', 'fetchTable', 'applyUserActions'].forEach((name) => {
      const original = api[name];
      api[name] = async function (arg) {
        const label = typeof arg === 'string' ? arg : (Array.isArray(arg) ? arg.map(a => a[0] + ':' + a[1]).join(',') : '');
        const entry = { name, arg: label, t0: performance.now() };
        calls.push(entry);
        const result = await original.apply(this, arguments); // le « serveur » lit à la demande
        const slow = name === 'fetchTable' && (arg === 'Missions' || arg === 'Personnes');
        await new Promise(r => setTimeout(r, slow ? ${SLOW_READ_MS} : ${QUICK_MS}));
        entry.t1 = performance.now();
        return result;
      };
    });

    const marks = window.__ppMarks = {};
    const snapshot = () => calls.map(c => Object.assign({}, c));
    const badges = () => Array.from(document.querySelectorAll('.tiptap span.var-badge')).map(el => ({ key: el.dataset.key, broken: el.classList.contains('var-badge-broken') }));
    const poll = setInterval(() => {
      const text = (document.querySelector('.tiptap') || {}).textContent || '';
      if (!marks.shownAt && text.indexOf(${JSON.stringify(MODEL_NAME)}) !== -1) {
        marks.shownAt = performance.now(); marks.callsAtShown = snapshot(); marks.badgesAtShown = badges();
      }
      const status = document.getElementById('status-msg');
      if (!marks.readyAt && status && /prêt|ready/i.test(status.textContent || '')) { marks.readyAt = performance.now(); marks.callsAtReady = snapshot(); }
      if (marks.shownAt && marks.readyAt) clearInterval(poll);
    }, 5);
  };
`;

async function openPage(browser) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: WIDTH, height: HEIGHT } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => d.accept());
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
  await page.addInitScript({ content: PRESEED });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  return { page, pageErrors };
}

const userRead = c => c.name === 'fetchTable' && (c.arg === 'Missions' || c.arg === 'Personnes');
const modelsRead = c => c.name === 'fetchTable' && c.arg === 'Publipostage_Modeles';
const ms = n => Math.round(n) + ' ms';

console.log(`\n== Ouverture à ${WIDTH}x${HEIGHT}, lecture complète d'une table du document : ${SLOW_READ_MS} ms ==`);
const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const { page, pageErrors } = await openPage(browser);

// === 1. Ce que l'ouverture lit, dans quel ordre ===
const marks = await page.evaluate(() => window.__ppMarks);
check('le modèle par défaut est affiché dans l\'éditeur', !!marks.shownAt, marks);
check('le statut « Widget prêt. » est atteint', !!marks.readyAt, marks);
const atShown = marks.callsAtShown || [];
const atReady = marks.callsAtReady || [];
console.log(`  (indicatif : modèle affiché à ${ms(marks.shownAt || 0)}, prêt à ${ms(marks.readyAt || 0)} ; ${atShown.length} appels Grist lancés à l'affichage (${atShown.filter(c => c.t1 !== undefined).length} revenus) : ${atShown.map(c => c.name + (c.arg ? ':' + c.arg : '')).join(' ')})`);
check('la table des modèles est lue UNE fois avant l\'affichage du modèle (avant : sept)', atShown.filter(modelsRead).length === 1, atShown.filter(modelsRead).length);
check('aucune table du document n\'est encore revenue quand le modèle s\'affiche (avant : l\'affichage les attendait toutes)', atShown.filter(c => userRead(c) && c.t1 !== undefined).length === 0, atShown.filter(userRead));
const allCalls = await page.evaluate(() => window.__ppCalls);
const firstUserReadAt = Math.min(...allCalls.filter(userRead).map(c => c.t0));
check('la lecture complète des tables du document part à l\'affichage du modèle, pas à l\'ouverture (avant : à l\'ouverture, seulement pour en lister les colonnes)', marks.shownAt - firstUserReadAt < SLOW_READ_MS / 2, { shownAt: marks.shownAt, firstUserReadAt });
check('au plus neuf appels Grist sont revenus quand le modèle s\'affiche (avant : dix-huit)', atShown.filter(c => c.t1 !== undefined).length < 10, atShown.filter(c => c.t1 !== undefined).length);
check('aucune colonne n\'est ajoutée à l\'ouverture d\'un document à jour', atShown.every(c => c.name !== 'applyUserActions'), atShown.filter(c => c.name === 'applyUserActions'));
check('au statut prêt, la table des modèles n\'a été lue qu\'une fois', atReady.filter(modelsRead).length === 1, atReady.filter(modelsRead).length);

// === 2. Les bulles #Variable, jugées sur les colonnes des métadonnées dès l'affichage ===
const shown = Object.fromEntries((marks.badgesAtShown || []).map(b => [b.key, b.broken]));
check('à l\'affichage : la bulle d\'une colonne qui existe n\'est pas rouge', shown['Missions.Reference'] === false, shown);
check('à l\'affichage : la bulle d\'une colonne disparue est rouge', shown['Missions.Disparue'] === true, shown);
check('à l\'affichage : la bulle d\'une table disparue est rouge', shown['Autre.Colonne'] === true, shown);

// === 3. Au vrai clavier, « # » liste les colonnes tant que la lecture complète n'est pas finie ===
const firstParagraph = await page.evaluate(() => {
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  const p = document.querySelector('.tiptap p');
  p.scrollIntoView({ block: 'nearest' });
  const r = p.getBoundingClientRect();
  return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
});
await page.mouse.move(2, 2); // menus au survol : la souris est garée avant
await page.mouse.click(firstParagraph.x, firstParagraph.y);
await page.keyboard.press('End');
await page.keyboard.type(' #');
await page.waitForFunction(() => { const b = document.getElementById('autocomplete-box'); return !!b && getComputedStyle(b).display !== 'none' && !!b.querySelector('.ac-item'); }, null, { timeout: 5000 }).catch(() => {});
const list = await page.evaluate(() => {
  const b = document.getElementById('autocomplete-box');
  if (!b || getComputedStyle(b).display === 'none') return null;
  const r = b.getBoundingClientRect();
  return {
    items: Array.from(b.querySelectorAll('.ac-item')).map(e => e.textContent),
    inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    exactPassDone: !GristAPI.getColumns('Missions').includes('Secret'),
  };
});
check('« # » tapé juste après l\'ouverture : la liste s\'ouvre', !!list && list.items.length > 0, list);
check('« # » : la liste propose les colonnes du document (« Missions.Reference »)', !!list && list.items.some(t => t.includes('Missions.Reference')), list && list.items);
check('« # » : la liste est entière dans la fenêtre', !!list && list.inside, list);
console.log(`  (indicatif : lecture complète ${list && list.exactPassDone ? 'déjà finie' : 'pas encore finie'} quand la liste s'ouvre)`);
await page.keyboard.press('Escape');

// === 4. La lecture complète a lieu ensuite : colonnes exactes, bulle jugée de nouveau ===
await page.waitForFunction(() => !GristAPI.getColumns('Missions').includes('Secret') && GristAPI.getColumns('Missions').includes('Reference'), null, { timeout: 4 * SLOW_READ_MS + 10000 }).catch(() => {});
const exact = await page.evaluate(() => ({
  missions: GristAPI.getColumns('Missions'),
  personnes: GristAPI.getColumns('Personnes'),
  badges: Object.fromEntries(Array.from(document.querySelectorAll('.tiptap span.var-badge')).map(el => [el.dataset.key, el.classList.contains('var-badge-broken')])),
}));
check('la lecture complète rend les colonnes exactes : celle que fetchTable ne rend pas n\'est plus proposée', !exact.missions.includes('Secret') && ['Reference', 'Titre', 'Montant'].every(c => exact.missions.includes(c)), exact.missions);
check('la lecture complète rend les colonnes de l\'autre table', exact.personnes.includes('Nom'), exact.personnes);
check('après la lecture complète : la bulle de la colonne restreinte devient rouge, la bonne reste normale', exact.badges['Missions.Secret'] === true && exact.badges['Missions.Reference'] === false, exact.badges);
const log = await page.evaluate(() => window.__ppCalls);
check('chaque table du document a été lue en entier (la lecture complète n\'est pas supprimée, seulement sortie du chemin d\'ouverture)', ['Missions', 'Personnes'].every(t => log.some(c => c.name === 'fetchTable' && c.arg === t && c.t1 !== undefined)), log.filter(userRead));
check('aucune erreur de script', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
