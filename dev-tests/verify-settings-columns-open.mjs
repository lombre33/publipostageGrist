#!/usr/bin/env node
// Avertissement d'ouverture sur les réglages Accès et Selon la ligne (js/settings-columns.js) à l'OUVERTURE RÉELLE du widget (Node/Playwright), à la taille du panneau d'Antoine (~700x400) :
// dev-tests/scenarios-settings-columns.js appelle la vérification dans la page ; ici c'est js/main.js qui l'appelle, au démarrage, comme Grist ouvre le widget. Le document est semé AVANT le
// démarrage (window.__preSeedGristStub), la phase vit dans le stockage du navigateur, qui survit au rechargement comme celui de la vraie page :
//  1. aucun réglage (le cas général) : le coin d'état dit « prêt », rien d'autre ;
//  2. réglages sains (Accès et Selon la ligne citent des colonnes qui existent) : « prêt », rien d'autre - et l'instantané du schéma est noté ;
//  3. trois colonnes renommées dans Grist (une du modèle, une des droits, une de la règle « Selon la ligne ») : une fois le modèle affiché - jamais avant - le coin d'état dit QUEL réglage
//     cite QUOI, l'avertissement devant « Mis à jour après un renommage… » (le suivi des renommages, js/schema-renames.js, réécrit le modèle sans toucher aux réglages), message entier
//     au survol, dans le panneau ; rien n'est écrit dans les options ;
//  4. rouvert sans nouveau renommage : l'avertissement seul, tant que le réglage n'est pas refait - et en anglais quand l'interface l'est ;
//  5. réglages refaits sur les nouvelles colonnes : « prêt ».
// Lancé par run-headless.mjs (groupe Node "settingsColumnsOpen", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-settings-columns-open.mjs
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.SETTINGS_COLUMNS_OPEN_PORT || 8951);
const WIDTH = 700;
const HEIGHT = 400;

// Même régénération du harnais et même miroir hors-ligne que dev-tests/verify-schema-renames-open.mjs.
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
if (!OFFLINE) console.log('[verify-settings-columns-open] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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

// Le document avant puis après trois renommages : Dossiers.Montant -> Total (le modèle enregistré cite encore Montant), Droits.Export -> Exporter et Dossiers.Statut -> Etat (les réglages
// citent encore Export et Statut : Grist ne les réécrit jamais, ce sont des options du widget). La phase est dans le stockage du navigateur ; `fixed` : les réglages refaits sur les nouveaux noms.
const EMAIL = 'responsable@exemple.fr';
await page.addInitScript((email) => {
  if (!localStorage.getItem('e2e_phase')) localStorage.setItem('e2e_phase', 'none');
  window.__preSeedGristStub = (stub) => {
    const phase = localStorage.getItem('e2e_phase');
    const renamed = ['renamed', 'again', 'again-en', 'fixed'].indexOf(phase) !== -1;
    const montant = renamed ? 'Total' : 'Montant';
    const statut = renamed ? 'Etat' : 'Statut';
    const exporter = renamed ? 'Exporter' : 'Export';
    stub.setDocId('e2e-settings-doc');
    stub.setVariables('Dossiers', { Titre: 'Text', [montant]: 'Numeric', [statut]: 'Text' });
    stub.setRows('Dossiers', [{ id: 1, Titre: 'Dossier 1', [montant]: 1200, [statut]: 'Ouvert' }]);
    stub.setVariables('Droits', { Email: 'Text', LectureSeule: 'Bool', [exporter]: 'Bool' });
    stub.setRows('Droits', [{ id: 1, Email: email, LectureSeule: false, [exporter]: true }]);
    stub.setUserEmail(email);
    // Les réglages tels que la vue les a enregistrés : Accès (table des droits, colonne des courriels, deux colonnes de droit) et Selon la ligne (une règle sur « Statut »). Le modèle « 999 » n'existe
    // pas : la règle est sautée et « Sinon : garder » n'ouvre rien - le réglage est lu sans que le widget change de modèle.
    const cited = phase === 'fixed' ? { exportColumn: 'Exporter', statut: 'Etat' } : { exportColumn: 'Export', statut: 'Statut' };
    const options = phase === 'none' ? null : {
      droitsAcces: { table: 'Droits', emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: cited.exportColumn },
      modeleSelonLigne: { enabled: true, rules: [{ column: cited.statut, operator: '=', value: 'Ouvert', modeleId: '999' }], otherwise: 'keep' },
    };
    stub.setWidgetOptions(options);
    window.__seededOptions = options;
    const attr = o => JSON.stringify(o).replace(/"/g, '&quot;');
    const content = '<p>Montant : <span class="var-badge" contenteditable="false" data-table="Dossiers" data-column="Montant" data-key="Dossiers.Montant" data-format="' + attr({ type: 'number', decimals: 2 }) + '">#Dossiers.Montant</span>'
      + ' pour <span class="var-badge" contenteditable="false" data-table="Dossiers" data-column="Titre" data-key="Dossiers.Titre">#Dossiers.Titre</span>.</p>';
    const m = stub.state.rows.Publipostage_Modeles;
    m.id.push(1); m.Nom.push('Contrat'); m.Contenu.push(content); m.NomFichierPDF.push('#Dossiers.Titre'); m.HeaderFooter.push(''); m.DateModif.push(1790000000); m.Margins.push(''); m.EstParDefaut.push(true);
    stub.state.nextRowId.Publipostage_Modeles = 2;
    // La vraie API sait dire la table du widget (grist.getTable().getTableId(), js/grist-api.js:detectTableId) ; le faux Grist, non : sans elle la table de la page serait inconnue à ce stade.
    window.grist.getTable = async () => ({ getTableId: async () => 'Dossiers' });
    // Tout ce que le coin d'état a dit, avec ce que l'écran montrait à ce moment (le modèle est-il affiché ?) : l'avertissement ne doit venir qu'après « Widget prêt. » et l'affichage du modèle.
    window.__statusLog = [];
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('status-msg');
      new MutationObserver(() => {
        window.__statusLog.push({ text: el.textContent, error: el.classList.contains('error-msg'), shown: !!document.querySelector('.tiptap .var-badge'), at: Math.round(performance.now()) });
      }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    });
  };
}, EMAIL);

const WARNING_RE = /n’existe plus|n’existent plus|no longer exist/;
async function open() {
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  // « Mis à jour après un renommage… » peut déjà avoir pris la place de « Widget prêt. » quand la page regarde (sans l'avertissement, c'est même tout ce qu'elle dira).
  await page.waitForFunction(() => /prêt|ready|Mis à jour|Updated|n’existe plus|n’existent plus|no longer exist/i.test((document.getElementById('status-msg') || {}).textContent || ''), null, { timeout: 90000 });
}
// L'ouverture finie : on laisse une seconde au widget pour parler (les droits se calculent, le schéma se relit) avant de lire le coin d'état.
const settle = (ms) => page.waitForTimeout(ms || 1500);
const state = () => page.evaluate(() => {
  const stub = window.__gristStub;
  const statusEl = document.getElementById('status-msg');
  const box = statusEl.getBoundingClientRect();
  return {
    status: { text: statusEl.textContent, error: statusEl.classList.contains('error-msg'), left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width), clipped: statusEl.scrollWidth > statusEl.clientWidth + 1, viewport: innerWidth },
    log: window.__statusLog,
    options: stub.state.options,
    seededOptions: window.__seededOptions,
    modelUpdates: stub.countActions('UpdateRecord', 'Publipostage_Modeles'),
    anyRightsWrite: stub.countActions('UpdateRecord', 'Droits') + stub.countActions('AddRecord', 'Droits') + stub.countActions('RemoveRecord', 'Droits'),
    bubbles: Array.from(document.querySelectorAll('.tiptap span.var-badge')).map(e => ({ text: e.textContent, broken: e.classList.contains('var-badge-broken') })),
    lang: I18n.getLang(),
  };
});
const warningsOf = log => log.filter(entry => WARNING_RE.test(entry.text));
const readyOf = log => log.filter(entry => /prêt|ready/i.test(entry.text));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1) Aucun réglage : le coin d'état dit « prêt » et rien d'autre.
await open();
await settle();
const none = await state();
check('aucun réglage : le coin d\'état dit « prêt » et rien d\'autre, aucune erreur', /prêt|ready/i.test(none.status.text) && warningsOf(none.log).length === 0 && !none.status.error, { status: none.status, log: none.log });
check('aucun réglage : rien n\'est écrit dans les droits, les options restent vides', none.anyRightsWrite === 0 && none.options === null, { writes: none.anyRightsWrite, options: none.options });

// 2) Réglages sains : « prêt », rien d'autre.
await page.evaluate(() => localStorage.setItem('e2e_phase', 'first'));
await open();
await settle();
const first = await state();
check('réglages sains : le coin d\'état dit « prêt » et rien d\'autre', /prêt|ready/i.test(first.status.text) && warningsOf(first.log).length === 0 && !first.status.error, { status: first.status, log: first.log });
check('réglages sains : le modèle est affiché, aucune bulle rouge, rien d\'écrit', first.bubbles.length === 2 && first.bubbles.every(b => !b.broken) && first.modelUpdates === 0, { bubbles: first.bubbles, updates: first.modelUpdates });

// 3) Trois colonnes renommées : le modèle porte encore l'ancien nom, les deux réglages aussi.
await page.evaluate(() => localStorage.setItem('e2e_phase', 'renamed'));
await open();
await page.waitForFunction(() => /Mis à jour après un renommage/.test(document.getElementById('status-msg').textContent) || /n’existe plus/.test(document.getElementById('status-msg').textContent), null, { timeout: 20000 }).catch(() => {});
await settle(2500);
const renamed = await state();
const WARNING_BOTH_FR = 'Accès : la colonne « Export » n’existe plus. Modèle selon la ligne : la colonne « Statut » n’existe plus. À re-choisir dans les Réglages.';
const RENAMED_FR = 'Mis à jour après un renommage dans Grist : 1 variable dans 1 modèle.';
const firstWarning = warningsOf(renamed.log)[0];
const firstReady = readyOf(renamed.log)[0];
check('après un renommage : l\'avertissement ne vient qu\'APRÈS « Widget prêt. » et une fois le modèle affiché (rien avant l\'affichage)',
  !!firstWarning && !!firstReady && firstWarning.shown === true && firstReady.at <= firstWarning.at && renamed.log.indexOf(firstReady) < renamed.log.indexOf(firstWarning), { firstReady, firstWarning });
check('après un renommage : le coin d\'état nomme les deux réglages et leur colonne, l\'avertissement DEVANT « Mis à jour après un renommage… »', renamed.status.text === WARNING_BOTH_FR + ' ' + RENAMED_FR, renamed.status.text);
check('après un renommage : message d\'erreur (même couleur que les autres), dans le panneau, jamais à cheval sur le bord', renamed.status.error === true && renamed.status.left >= 0 && renamed.status.right <= renamed.status.viewport, renamed.status);
await page.mouse.move(5, HEIGHT - 5);
await page.hover('#status-msg');
await page.waitForTimeout(150);
const title = await page.evaluate(() => document.getElementById('status-msg').title);
check('après un renommage : coupé par « … » au bord du coin, le message ENTIER se lit au survol', renamed.status.clipped === true && title === renamed.status.text, { clipped: renamed.status.clipped, title, width: renamed.status.width });
check('après un renommage : le suivi des renommages a fait son travail (modèle réécrit, bulle suivie, un seul envoi), les réglages n\'ont pas été touchés',
  renamed.modelUpdates === 1 && renamed.bubbles.length === 2 && renamed.bubbles[0].text === '#Dossiers.Total' && renamed.bubbles.every(b => !b.broken) && sameJson(renamed.options, renamed.seededOptions) && renamed.anyRightsWrite === 0,
  { updates: renamed.modelUpdates, bubbles: renamed.bubbles, optionsKept: sameJson(renamed.options, renamed.seededOptions), rightsWrites: renamed.anyRightsWrite });
check('après un renommage : la personne n\'est pas mise en lecture seule par ce message (« Export » disparu ne retire aucun droit)', renamed.status.text.indexOf('lecture seule') === -1, renamed.status.text);

// 4) Rouvert sans nouveau renommage : l'avertissement seul, tant que le réglage n'est pas refait.
await page.evaluate(() => localStorage.setItem('e2e_phase', 'again'));
await open();
await settle(2500);
const again = await state();
check('rouvert sans nouveau renommage : l\'avertissement seul, sans « Mis à jour… » (il n\'y a plus rien à suivre)', again.status.text === WARNING_BOTH_FR && again.status.error === true, again.status);
check('rouvert : rien n\'est écrit (aucun envoi du modèle, options identiques)', again.modelUpdates === 0 && sameJson(again.options, again.seededOptions), { updates: again.modelUpdates, optionsKept: sameJson(again.options, again.seededOptions) });

// … et en anglais quand l'interface l'est.
await page.evaluate(() => { localStorage.setItem('e2e_phase', 'again-en'); localStorage.setItem('pp_lang', 'en'); });
await open();
await page.waitForFunction(() => /no longer exist/.test(document.getElementById('status-msg').textContent), null, { timeout: 20000 }).catch(() => {});
await settle(1500);
const english = await state();
check('en anglais : le message suit la langue de l\'interface', english.lang === 'en' && english.status.text === 'Access: the column “Export” no longer exists. Template by row: the column “Statut” no longer exists. Choose again in Settings.', { lang: english.lang, text: english.status.text });
await page.evaluate(() => localStorage.removeItem('pp_lang'));

// 5) Réglages refaits sur les nouvelles colonnes : « prêt ».
await page.evaluate(() => localStorage.setItem('e2e_phase', 'fixed'));
await open();
await settle();
const fixed = await state();
check('réglages refaits sur les nouvelles colonnes : le coin d\'état redit « prêt », plus aucun avertissement', /prêt|ready/i.test(fixed.status.text) && warningsOf(fixed.log).length === 0 && !fixed.status.error, { status: fixed.status, log: fixed.log });
check('aucune erreur JavaScript pendant le parcours', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
