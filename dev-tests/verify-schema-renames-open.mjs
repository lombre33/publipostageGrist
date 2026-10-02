#!/usr/bin/env node
// Suivi des renommages de Grist (js/schema-renames.js) à l'OUVERTURE RÉELLE du widget (Node/Playwright), à la taille du panneau d'Antoine (~700x400) : dev-tests/scenarios-schema-renames.js appelle la
// passe dans la page ; ici c'est js/main.js qui l'appelle, au démarrage, comme Grist ouvre le widget. Le document est semé AVANT le démarrage (window.__preSeedGristStub) :
//  1. première ouverture : la passe note le schéma (instantané dans le stockage du navigateur) et n'écrit rien ;
//  2. le document rouvert après qu'une colonne a été renommée dans Grist (le modèle enregistré porte encore l'ancien nom) : une fois le modèle affiché - jamais avant - la passe réécrit le modèle,
//     le redessine avec la bonne colonne (la bulle n'est plus rouge, rien « à enregistrer ») et le coin d'état le dit sans déborder du panneau ;
//  3. rouvert encore sans nouveau renommage : rien n'est écrit.
// Lancé par run-headless.mjs (groupe Node "schemaRenamesOpen", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-schema-renames-open.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SCHEMA_RENAMES_OPEN_PORT || 8950);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-var-toolbar-mouse.mjs.
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
if (!OFFLINE) console.log('[verify-schema-renames-open] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
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

// Le document tel qu'il est AVANT puis APRÈS un renommage de « Dossiers.Montant » en « Dossiers.Total » : le modèle enregistré, lui, garde dans les deux cas l'ancien nom (Grist ne réécrit jamais
// le contenu d'un widget). La phase est dans le stockage du navigateur, qui survit au rechargement comme celui de la vraie page : c'est lui qui porte l'instantané d'une ouverture à l'autre.
await page.addInitScript(() => {
  if (!localStorage.getItem('e2e_phase')) localStorage.setItem('e2e_phase', 'first');
  window.__preSeedGristStub = (stub) => {
    const renamed = localStorage.getItem('e2e_phase') !== 'first';
    const montant = renamed ? 'Total' : 'Montant';
    stub.setDocId('e2e-doc');
    stub.setVariables('Dossiers', { Titre: 'Text', [montant]: 'Numeric', Statut: 'Text' });
    stub.setRows('Dossiers', [{ id: 1, Titre: 'Dossier 1', [montant]: 1200, Statut: 'Ouvert' }]);
    const attr = o => JSON.stringify(o).replace(/"/g, '&quot;');
    const content = '<p>Montant : <span class="var-badge" contenteditable="false" data-table="Dossiers" data-column="Montant" data-key="Dossiers.Montant" data-format="' + attr({ type: 'number', decimals: 2 }) + '">#Dossiers.Montant</span>'
      + ' pour <span class="var-badge" contenteditable="false" data-table="Dossiers" data-column="Titre" data-key="Dossiers.Titre">#Dossiers.Titre</span>.</p>'
      + '<div class="conditional-text" data-condition="' + attr({ mode: 'all', rules: [{ column: 'Montant', operator: '>', value: '1000' }] }) + '"><p>Gros dossier</p></div>';
    window.__seededContent = content;
    const m = stub.state.rows.Publipostage_Modeles;
    m.id.push(1); m.Nom.push('Contrat'); m.Contenu.push(content); m.NomFichierPDF.push('#Dossiers.Titre-#Dossiers.Montant'); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
    stub.state.nextRowId.Publipostage_Modeles = 2;
    // La vraie API sait dire la table du widget (grist.getTable().getTableId(), js/grist-api.js:detectTableId) ; le faux Grist, non : sans elle la table de la page serait inconnue à ce stade.
    window.grist.getTable = async () => ({ getTableId: async () => 'Dossiers' });
    // Le premier appel qui ne sert qu'au suivi des renommages (l'adresse du document) : que voyait-on à l'écran à ce moment ?
    window.__firstProbe = null;
    const original = window.grist.docApi.getAccessToken;
    window.grist.docApi.getAccessToken = async function () {
      if (!window.__firstProbe) {
        window.__firstProbe = { shown: !!document.querySelector('.tiptap .var-badge'), status: document.getElementById('status-msg').textContent, at: performance.now() };
      }
      return original.apply(this, arguments);
    };
  };
});

async function open() {
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  // « Mis à jour après un renommage… » peut déjà avoir pris la place de « Widget prêt. » quand la page regarde : le stub répond sans attendre.
  await page.waitForFunction(() => /prêt|ready|Mis à jour/i.test((document.getElementById('status-msg') || {}).textContent || ''), null, { timeout: 90000 });
}
const state = () => page.evaluate(() => {
  const stub = window.__gristStub;
  const row = stub.getRow('Publipostage_Modeles', 1);
  const doc = new DOMParser().parseFromString('<body>' + row.Contenu + '</body>', 'text/html');
  const bubble = doc.querySelector('.var-badge');
  const block = doc.querySelector('.conditional-text');
  const statusEl = document.getElementById('status-msg');
  const box = statusEl.getBoundingClientRect();
  return {
    row: { nom: row.Nom, pdf: row.NomFichierPDF, date: row.DateModif, contenu: row.Contenu },
    bubble: { column: bubble.getAttribute('data-column'), key: bubble.getAttribute('data-key'), text: bubble.textContent, format: bubble.getAttribute('data-format') },
    conditionColumn: JSON.parse(block.getAttribute('data-condition')).rules[0].column,
    updates: stub.countActions('UpdateRecord', 'Publipostage_Modeles'),
    editorBubbles: Array.from(document.querySelectorAll('.tiptap span.var-badge')).map(e => ({ text: e.textContent, broken: e.classList.contains('var-badge-broken') })),
    status: { text: statusEl.textContent, unsaved: statusEl.classList.contains('is-unsaved'), left: box.left, right: box.right, width: box.width, clipped: statusEl.scrollWidth > statusEl.clientWidth + 1, viewport: innerWidth },
    snapshots: Object.keys(localStorage).filter(k => k.indexOf('pp_schema_') === 0 && k !== 'pp_schema_index'),
    seeded: window.__seededContent,
    probe: window.__firstProbe,
  };
});

// 1) Première ouverture : le schéma est noté, rien n'est écrit.
await open();
await page.waitForFunction(() => Object.keys(localStorage).some(k => k.indexOf('pp_schema_') === 0 && k !== 'pp_schema_index'), null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(400);
const first = await state();
check('1re ouverture : un instantané du schéma est rangé, pour un seul document', first.snapshots.length === 1, first.snapshots);
check('1re ouverture : le modèle n\'est pas écrit (aucun UpdateRecord, contenu identique), la bulle est valide', first.updates === 0 && first.row.contenu === first.seeded && first.editorBubbles.length === 2 && first.editorBubbles.every(b => !b.broken), first);
check('1re ouverture : le coin d\'état dit seulement « prêt »', /prêt|ready/i.test(first.status.text) && !/Mis à jour|Updated/.test(first.status.text), first.status);

// 2) Une colonne a été renommée dans Grist : le modèle enregistré porte l'ancien nom, le document le nouveau.
await page.evaluate(() => localStorage.setItem('e2e_phase', 'renamed'));
await open();
await page.waitForFunction(() => /Mis à jour après un renommage/.test(document.getElementById('status-msg').textContent), null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(600);
const second = await state();
check('après un renommage : l\'adresse du document n\'est demandée qu\'une fois le modèle affiché et le widget annoncé prêt (rien avant l\'affichage)',
  !!second.probe && second.probe.shown === true && /prêt|ready/i.test(second.probe.status), second.probe);
check('après un renommage : la bulle suit (colonne, clé, texte) et garde son format',
  second.bubble.column === 'Total' && second.bubble.key === 'Dossiers.Total' && second.bubble.text === '#Dossiers.Total' && second.bubble.format.indexOf('decimals') !== -1, second.bubble);
check('après un renommage : la condition du bloc et le nom du PDF suivent', second.conditionColumn === 'Total' && second.row.pdf === '#Dossiers.Titre-#Dossiers.Total', { cond: second.conditionColumn, pdf: second.row.pdf });
check('après un renommage : un seul envoi, le nom et la date du modèle ne bougent pas', second.updates === 1 && second.row.nom === 'Contrat' && second.row.date === 1790000000, { updates: second.updates, nom: second.row.nom, date: second.row.date });
check('après un renommage : le modèle affiché est redessiné, plus aucune bulle rouge, rien « à enregistrer »',
  second.editorBubbles.length === 2 && second.editorBubbles[0].text === '#Dossiers.Total' && second.editorBubbles.every(b => !b.broken) && second.status.unsaved === false, { bubbles: second.editorBubbles, status: second.status });
check('après un renommage : le coin d\'état le dit, en entier dans le panneau', second.status.text === 'Mis à jour après un renommage dans Grist : 3 variables dans 1 modèle.' && !second.status.clipped && second.status.left >= 0 && second.status.right <= second.status.viewport, second.status);

// 3) Rouvert encore, sans nouveau renommage depuis : rien n'est écrit (le modèle de la page porte l'ancien nom, comme au point 1 : il n'y a plus rien à suivre).
await open();
await page.waitForTimeout(1200);
const third = await state();
check('rouvert sans nouveau renommage : rien n\'est écrit, le coin d\'état redit « prêt »', third.updates === 0 && third.row.contenu === third.seeded && /prêt|ready/i.test(third.status.text) && !/Mis à jour/.test(third.status.text), { updates: third.updates, status: third.status.text });
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
