#!/usr/bin/env node
// Lance les groupes de dev-tests/ dans un Chromium headless, sans aucune manipulation manuelle -
// remplace la procédure "ouvrir _test-harness.html et coller du JS dans la console" du README pour
// tout ce qui doit tourner sans humain (session Claude Code, CI, vérification avant un commit).
//
// Usage :
//   node dev-tests/run-headless.mjs                      # tous les groupes, un navigateur par groupe
//   node dev-tests/run-headless.mjs comments formatting  # seulement ces groupes
//   node dev-tests/run-headless.mjs --port 8899 formatting
//
// Un navigateur NEUF par groupe, à dessein : le README documente des fuites d'état entre suites
// (scenarios-chips laissait échouer un scénario d'image sans rapport). Un processus par groupe rend
// chaque verdict indépendant de l'ordre de lancement, au prix de quelques secondes de démarrage.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');

// Les groupes et leurs fichiers, dans l'ordre du README. `deps` = fichiers à charger en plus de
// helpers/runner (un groupe qui s'appuie sur un autre scénario n'existe pas aujourd'hui, mais la
// forme est là).
const GROUPS = {
  formatting: 'scenarios-formatting',
  lists: 'scenarios-lists',
  tables: 'scenarios-tables',
  twoColumns: 'scenarios-twocolumns',
  nesting: 'scenarios-nesting',
  images: 'scenarios-images',
  pageBreakToc: 'scenarios-pagebreak-toc',
  headerFooter: 'scenarios-headerfooter',
  chips: 'scenarios-chips',
  varFormat: 'scenarios-varformat',
  pdfFidelity: 'scenarios-pdf-fidelity',
  pdfGroundTruth: 'scenarios-pdf-ground-truth',
  readModeFidelity: 'scenarios-readmode-fidelity',
  pageLayout: 'scenarios-pagelayout',
  docx: 'scenarios-docx',
  docxImages: 'scenarios-docx-images',
  comments: 'scenarios-comments',
  autosave: 'scenarios-autosave',
  toolbarChrome: 'scenarios-toolbar-chrome',
  macroModeles: 'scenarios-macro-modeles',
  templateTree: 'scenarios-template-tree',
};

const argv = process.argv.slice(2);
let port = 8843;
let probe = null; // --probe "<expression JS>" : ouvre le harnais, evalue, affiche - pour inspecter l'etat reel sans ecrire un scenario
// --preseed <fichier.js> : injecte ce fichier AVANT la navigation (page.addInitScript), donc avant que dev-tests/grist-stub.js ne s'execute lui-meme -
// il doit definir window.__preSeedGristStub = (stub) => {...}, appele par grist-stub.js juste apres avoir construit window.__gristStub, donc AVANT
// tout premier fetchTable de GristAPI.init(). Seul moyen de tester "le widget demarre avec tel modele deja marque par defaut" : setVariables/setRows
// APRES "Widget prêt." (la seule ouverture qu'offrait ce fichier jusqu'ici) arrive structurellement trop tard, une fois init() deja termine.
let preseedFile = null;
const wanted = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--port') { port = Number(argv[++i]); continue; }
  if (argv[i] === '--probe') { probe = argv[++i]; continue; }
  if (argv[i] === '--preseed') { preseedFile = argv[++i]; continue; }
  wanted.push(argv[i]);
}
const preseedCode = preseedFile ? readFileSync(resolve(preseedFile), 'utf8') : null;
const groups = probe ? [] : (wanted.length ? wanted : Object.keys(GROUPS));
for (const g of groups) {
  if (!GROUPS[g]) { console.error(`Groupe inconnu : ${g}\nGroupes : ${Object.keys(GROUPS).join(', ')}`); process.exit(2); }
}
// GROUPS liste TOUS les groupes du projet, y compris ceux dont le fichier n'est pas encore sur la branche courante (plusieurs chantiers avancent en
// parallèle sur main). Un fichier absent n'est pas un échec de test : on le signale et on passe, au lieu de faire tomber la suite entière sur une
// exception de chargement de script qui ressemble à une régression.
const missingFiles = groups.filter(g => !existsSync(join(ROOT, 'dev-tests', `${GROUPS[g]}.js`)));
const runnable = groups.filter(g => !missingFiles.includes(g));

// === Serveur statique ===
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
    // no-store partout : le piège du cache navigateur sur du JS servi en local est documenté dans
    // le README (faux négatifs/positifs après une modification de fichier).
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok, ko) => server.listen(port, '127.0.0.1', ok).on('error', ko));
const BASE = `http://127.0.0.1:${port}`;

// === Miroir hors-ligne des CDN ===
// Si dev-tests/.offline-cache a été construit (offline-deps.sh), on détourne chaque URL CDN vers le
// fichier local équivalent. Sinon on laisse passer : dans un environnement qui joint les CDN, le
// harnais tourne tel quel et ce bloc ne sert à rien.
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
if (!OFFLINE) console.log('[run-headless] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

// Les bundles esbuild s'importent entre eux en RELATIF (`from "./chunk-XXXX.js"`). Servis sous des
// URL de base différentes (https://esm.sh/@tiptap/core@3.31.3 d'un côté, https://esm.sh/*prosemirror-model@1.25.11
// de l'autre), ces imports relatifs résolvent vers DEUX URL distinctes pour le même chunk - donc deux
// instances du même module. Symptôme exact observé : "Can not convert <> to a Fragment (looks like
// multiple versions of prosemirror-model were loaded)", et un `instanceof` qui échoue entre deux
// copies de ProseMirror. Réécrire chaque import de chunk vers une URL ABSOLUE unique règle le
// problème à la racine : une URL = un module, quelle que soit l'entrée qui l'a demandé.
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

const DEV_FILES = ['helpers', 'runner'];

async function runGroup(name, probeExpr) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  if (OFFLINE) {
    // L'importmap de index.html pointe vers esm.sh : on ne la réécrit PAS (le harnais doit rester
    // une copie fidèle de index.html), on détourne les requêtes qu'elle produit.
    await page.route('**://esm.sh/**', async route => {
      const url = route.request().url();
      const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
      if (chunk) {
        return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
      }
      const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
      if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
      route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
    });
    for (const [re, rel] of UMD_ROUTES) {
      await page.route(re, async route => route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        // Ces scripts sont injectés avec crossOrigin='anonymous' (js/pdf-export.js) : sans en-tête CORS, le navigateur refuse la réponse détournée.
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: await readFile(join(CACHE, rel), 'utf8'),
      }));
    }
    // js/pdf-export.js protège ses scripts CDN par un hash SRI (`integrity`). Un miroir local ne peut PAS le satisfaire : cdnjs sert des variantes
    // minifiées propres (vfs_fonts.min.js n'existe même pas tel quel dans le paquet npm), donc le hash ne correspondra jamais, et le navigateur refuse le
    // script AVANT de l'exécuter - erreur "Échec de chargement du script". SRI est neutralisé ici, et UNIQUEMENT ici : c'est une protection contre un CDN
    // compromis, sans objet quand le fichier vient du disque local, et l'application réelle la garde intacte.
    await page.addInitScript(() => {
      Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} });
    });
    // Polices Google : purement cosmétiques, jamais mesurées par un scénario - court-circuitées pour
    // ne pas attendre un timeout réseau à chaque page.
    await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
  }

  if (preseedCode) await page.addInitScript({ content: preseedCode });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  // L'éditeur se construit par import() dynamiques (js/editor.js) - attendre le vrai signe de vie,
  // pas un délai arbitraire.
  // Deux attentes, pas une. `EditorCore` est un `const` top-level d'un script classique : il vit dans
  // la portée lexicale globale, PAS comme propriété de `window` (`window.EditorCore` vaut toujours
  // undefined). Mais son existence ne suffit pas : l'éditeur existe déjà en 0x0 pendant que
  // main.js:init() finit de tourner, et `document.execCommand('insertText')` renvoie false tant qu'il
  // n'a pas sa vraie taille - des scénarios de frappe échouent alors avec des notes vides, ce qui
  // ressemble à une régression. Le seul signal fiable est le "Widget prêt." posé par la TOUTE
  // DERNIÈRE ligne de init().
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  // .a4-preview n'est jamais posée toute seule dans le harnais (piège documenté, README) : toute
  // mesure pixel dépend d'elle.
  await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });

  if (probeExpr) {
    const probeResult = await page.evaluate(async expr => {
      try { return { value: await eval(expr) }; } catch (e) { return { error: String(e) }; }
    }, probeExpr);
    await browser.close();
    return { name, probe: probeResult, consoleErrors };
  }

  await page.evaluate(() => { window.EditorTestSuites = {}; });
  // Un groupe déclaré dans GROUPS dont le fichier n'existe pas sur la branche courante (une suite vivant encore sur une branche de travail, par ex.) est
  // ANNONCÉ et sauté, pas transformé en exception : sinon un `node dev-tests/run-headless.mjs` sans argument sort en code 1 alors que tout ce qui existe
  // est passé.
  if (!existsSync(join(ROOT, 'dev-tests', `${GROUPS[name]}.js`))) {
    await browser.close();
    return { name, pass: 0, fail: 0, absent: true, consoleErrors };
  }
  for (const f of [...DEV_FILES, GROUPS[name]]) {
    await page.addScriptTag({ url: `/dev-tests/${f}.js` });
  }
  const result = await page.evaluate(async groupName => {
    const suite = window.EditorTestSuites[groupName];
    if (!suite) return { missing: true };
    const results = await window.TestRunner.runGroup(groupName, suite);
    return { report: window.TestRunner.report(results), results: results.map(r => ({ name: r.id || r.name, pass: r.pass, notes: r.notes })) };
  }, name);

  await browser.close();
  if (result.missing) return { name, pass: 0, fail: 0, missing: true, consoleErrors };
  const fail = result.results.filter(r => !r.pass);
  return { name, pass: result.results.length - fail.length, fail: fail.length, failures: fail, report: result.report, consoleErrors };
}

if (probe) {
  const r = await runGroup('__probe__', probe);
  console.log(JSON.stringify(r.probe, null, 2));
  if (r.consoleErrors.length) console.log('--- erreurs console ---\n' + r.consoleErrors.join('\n'));
  server.close();
  process.exit(0);
}

let totalPass = 0, totalFail = 0;
const failing = [];
if (missingFiles.length) console.log(`\n(groupes ignorés, fichier absent de cette branche : ${missingFiles.join(', ')})`);
for (const g of runnable) {
  process.stdout.write(`\n=== ${g} ===\n`);
  try {
    const r = await runGroup(g);
    if (r.absent) { console.log(`  (dev-tests/${GROUPS[g]}.js absent de cette branche - groupe sauté)`); continue; }
    if (r.missing) { console.log(`  (groupe absent de EditorTestSuites - fichier dev-tests/${GROUPS[g]}.js non enregistré ?)`); continue; }
    totalPass += r.pass; totalFail += r.fail;
    console.log(r.report);
    if (r.fail) { failing.push(g); r.failures.forEach(f => console.log(`  ECHEC ${f.name}: ${f.notes || ''}`)); }
    if (r.consoleErrors.length) console.log(`  (${r.consoleErrors.length} erreur(s) console)\n    ` + r.consoleErrors.slice(0, 5).join('\n    '));
  } catch (e) {
    totalFail++; failing.push(g);
    console.log(`  EXCEPTION sur le groupe ${g} : ${e.message}`);
  }
}
console.log(`\n=== TOTAL : ${totalPass} OK, ${totalFail} ECHEC(S) ===`);
if (failing.length) console.log('Groupes en échec : ' + failing.join(', '));
server.close();
process.exit(totalFail ? 1 : 0);
