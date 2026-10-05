#!/usr/bin/env node
// Politique de sécurité du contenu de index.html (contrôle de sécurité du 04/10, correction 6), dans un vrai Chromium SANS contournement de la politique : tous les autres scripts de
// dev-tests/ tournent avec `bypassCSP` (leurs aides injectent du code en ligne et chargent pdf.js), celui-ci est le seul qui la subit. C'est la vraie page index.html, la seule ligne
// remplacée est l'adresse de l'API Grist, servie par le faux Grist du dépôt (le vrai fichier est vérifié à part, en 3).
//   1) le widget démarre, s'édite, se lit et exporte (PDF, lot en un seul PDF, Word, Excel, QR code, archive ZIP) sans que le navigateur refuse quoi que ce soit ;
//   2) ce que du HTML piégé, posé tel quel dans la page (comme si le filtre avait laissé passer), n'arrive plus à faire : gestionnaire en ligne, script en ligne, script d'une autre
//      adresse ou d'une bibliothèque non figée, balise de base, cadre, objet, formulaire, adresse javascript: ;
//   3) le VRAI fichier d'API de Grist (docs.getgrist.com/grist-plugin-api.js) s'évalue sous la politique : c'est un bundle de développement dont chaque module passe par eval(), le faux
//      Grist des autres tests n'en a pas besoin, et une politique sans 'unsafe-eval' laisserait le widget sans objet grist, donc mort, chez Antoine ; ce contrôle demande le réseau ;
//   4) le widget démarre dans un cadre à bac à sable comme celui d'un document Grist, avec et sans allow-same-origin ;
//   5) la politique ne limite ni les styles, ni les polices, ni les images, ni les connexions ;
//   6) le widget n'a besoin d'aucune feuille de style ni d'aucune police d'un autre site (choix d'Antoine du 04/10 : « une police système similaire, pas de Google Fonts ou autre ») : le parcours
//      entier n'en demande aucune, c'est la seule garde contre une police qui reviendrait, puisque la politique laisse les polices libres.
// Lancé par run-headless.mjs (script Node « cspLoad », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-csp.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const PORT = Number(process.env.WHEEL_SCROLL_PORT || 8921);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
// GitHub Pages répond avec Access-Control-Allow-Origin: * : un cadre à origine opaque (bac à sable sans allow-same-origin) peut donc charger les modules du widget.
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok, ko) => server.listen(PORT, '127.0.0.1', ok).on('error', ko));
const BASE = `http://127.0.0.1:${PORT}`;

// Même miroir hors-ligne des CDN que dev-tests/run-headless.mjs.
const esmMapPath = join(CACHE, 'esm-map.json');
const OFFLINE = existsSync(esmMapPath);
const esmMap = OFFLINE ? JSON.parse(readFileSync(esmMapPath, 'utf8')) : {};
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdfmake\/[\d.]+\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdfmake\/[\d.]+\/vfs_fonts\.min\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/[\d.]+\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf-lib\/[\d.]+\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@[\d.]+\/dist\/index\.iife\.js$/, 'umd/docx.iife.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/exceljs\/[\d.]+\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/qrcode-generator\/[\d.]+\/qrcode\.min\.js$/, 'umd/qrcode.min.js'],
].filter(([, rel]) => existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[verify-csp] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

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
const skip = (name, why) => console.log('  skip - ' + name + ' (' + why + ')');

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const policy = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
const directives = Object.fromEntries(policy.split(';').map(d => d.trim().split(/\s+/)).filter(d => d[0]).map(d => [d[0], d.slice(1)]));

check('index.html porte une politique, avant son premier script', !!policy && html.indexOf('Content-Security-Policy') < html.indexOf('<script'), { found: !!policy });
check('script-src : ni script en ligne sans empreinte, ni joker, ni schéma entier', directives['script-src'] && !directives['script-src'].some(s => /^'unsafe-inline'$|^\*$|^https?:$|^data:$|^blob:$/.test(s)), directives['script-src']);
check('object-src, base-uri, frame-src, form-action : « none »', ['object-src', 'base-uri', 'frame-src', 'form-action'].every(d => (directives[d] || []).join(' ') === "'none'"), directives);
check('la politique ne limite ni les styles, ni les polices, ni les images, ni les connexions', !['default-src', 'style-src', 'font-src', 'img-src', 'connect-src', 'media-src'].some(d => d in directives), Object.keys(directives));

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const context = await browser.newContext({ viewport: { width: 700, height: 400 } });
const page = await context.newPage();
const pageErrors = [];
const consoleRefusals = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) consoleRefusals.push(m.text().slice(0, 160)); });
// Toute feuille de style ou police demandée à un autre site que le widget est notée (le type de la requête vient du navigateur : une feuille importée par @import est une `stylesheet`).
const otherSiteStyles = [];
page.on('request', r => {
  const type = r.resourceType();
  if ((type === 'stylesheet' || type === 'font') && /^https?:/i.test(r.url()) && new URL(r.url()).origin !== BASE) otherSiteStyles.push(type + ' ' + r.url().slice(0, 100));
});

if (OFFLINE) {
  await context.route('**://esm.sh/**', async route => {
    const url = route.request().url();
    const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
    if (chunk) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
    const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
    if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
  });
  for (const [re, rel] of UMD_ROUTES) {
    await context.route(re, async route => route.fulfill({
      status: 200, contentType: 'text/javascript; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: await readFile(join(CACHE, rel), 'utf8'),
    }));
  }
  // Le hash SRI ne peut pas être celui du miroir local (cf. run-headless.mjs) : neutralisé ici seulement, la politique n'est pas touchée.
  await context.addInitScript(() => {
    Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} });
  });
}
// L'API Grist vient de son adresse réelle, sous la politique ; le contenu servi est celui du faux Grist du dépôt.
await context.route('https://docs.getgrist.com/grist-plugin-api.js', route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: readFileSync(join(ROOT, 'dev-tests', 'grist-stub.js'), 'utf8') }));
await context.addInitScript(() => {
  window.__cspViolations = [];
  document.addEventListener('securitypolicyviolation', e => window.__cspViolations.push({ directive: e.effectiveDirective, blocked: e.blockedURI }), true);
});

await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 90000 });
const violations = () => page.evaluate(() => window.__cspViolations.map(v => v.directive + ' ' + v.blocked));

check('le widget démarre sous la politique : « Widget prêt », aucune violation', (await violations()).length === 0, await violations());

// 1) Ce que la personne fait : écrire, lire, exporter.
await page.click('.tiptap');
await page.keyboard.type('Bonjour la politique');
await page.keyboard.press('Control+A');
await page.keyboard.press('Control+B');
const typed = await page.evaluate(() => Editor.getHTML());
check('l\'éditeur s\'écrit et se met en forme (gras) au vrai clavier', /<strong>Bonjour la politique<\/strong>/.test(typed), typed.slice(0, 120));

const reader = await page.evaluate(async () => {
  const hf = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  document.getElementById('reader-container').style.display = 'block';
  await ReaderMode.render('<p>Lecture sous politique</p>', null, { id: 1 }, hf);
  const text = document.querySelector('#reader-container .reader-content').textContent;
  document.getElementById('reader-container').style.display = '';
  return text;
});
check('la Lecture affiche le modèle', /Lecture sous politique/.test(reader), reader);

const exportsRun = await page.evaluate(async () => {
  const out = {};
  const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = 'ERREUR ' + (e && e.message || e); } };
  let pdf = null;
  await step('moteurs', async () => {
    await ExportEngines.loadAll();
    return typeof PdfExport !== 'undefined' && typeof PdfMerge !== 'undefined' && typeof SheetLayout !== 'undefined' && typeof DocxExport !== 'undefined'
      && typeof XlsxExport !== 'undefined' && typeof XlsxNumberFormat !== 'undefined';
  });
  await step('pdf', async () => { await PdfExport.ensurePdfLibsLoaded(); pdf = (await PdfExport.getNativePdfBlobForRecord('<p>Texte du PDF</p>', null, {}, '', null, undefined)).blob; return pdf.size > 1000 && new TextDecoder().decode(new Uint8Array(await pdf.slice(0, 5).arrayBuffer())) === '%PDF-'; });
  await step('zip', async () => { await ExportCommon.ensureJsZipLoaded(); const z = new JSZip(); z.file('a.txt', 'x'); return (await z.generateAsync({ type: 'uint8array' })).length > 20; });
  await step('pdfMerge', async () => { const merged = await PdfMerge.create('t'); await merged.append(pdf); return (await merged.toBlob()).size > 1000; });
  await step('docx', async () => { await DocxExport.ensureDocxLibLoaded(); const r = await DocxExport.getDocxBlobForRecord('<p>Texte du Word</p>', null, {}, '', null, null); return r.blob.size > 1000; });
  await step('xlsx', async () => { await XlsxExport.ensureExcelLibLoaded(); const wb = new ExcelJS.Workbook(); wb.addWorksheet('a').getCell('A1').value = 'x'; return (await wb.xlsx.writeBuffer()).byteLength > 1000; });
  await step('qr', async () => { await QrCode.ensureLibrary(); return /^data:image\/png/.test(await QrCode.dataUri('https://exemple.fr')); });
  return out;
});
for (const [name, label] of [['moteurs', 'les six moteurs du widget (PDF, fusion, feuilles, Word, Excel, format des nombres : js/export-engines.js, au premier export)'], ['pdf', 'PDF (pdfmake, polices du dépôt)'], ['zip', 'archive ZIP (JSZip)'], ['pdfMerge', 'PDF unique (pdf-lib)'], ['docx', 'Word (docx)'], ['xlsx', 'Excel (ExcelJS)'], ['qr', 'QR code (qrcode-generator)']]) {
  check('export : ' + label + ' se charge et produit son fichier sous la politique', exportsRun[name] === true, exportsRun[name]);
}
check('rien n\'a été refusé pendant tout ce parcours (aucune violation, aucun message du navigateur)', (await violations()).length === 0 && consoleRefusals.length === 0, { violations: await violations(), consoleRefusals });
check('aucune feuille de style ni police n\'est demandée à un autre site pendant tout ce parcours (la police du système, choix d\'Antoine du 04/10)', otherSiteStyles.length === 0, otherSiteStyles);

// 2) Du HTML piégé posé tel quel, comme si le filtre l'avait laissé passer.
async function attempt(label, expectedDirective, run) {
  const r = await page.evaluate(async runSource => {
    window.__csp = {};
    window.__cspViolations.length = 0;
    const baseBefore = document.baseURI;
    const host = document.createElement('div');
    document.body.appendChild(host);
    await (new Function('host', 'return (' + runSource + ')(host)'))(host).catch?.(() => {});
    await new Promise(r => setTimeout(r, 400));
    const result = { ran: Object.keys(window.__csp), violations: window.__cspViolations.map(v => v.directive), baseMoved: document.baseURI !== baseBefore };
    host.remove();
    return result;
  }, run.toString()).catch(e => ({ error: String(e) }));
  check(label, !r.error && r.ran.length === 0 && !r.baseMoved && r.violations.some(v => v.startsWith(expectedDirective)), r);
}
await attempt('un gestionnaire en ligne (image à onerror) ne court pas', 'script-src', async host => { host.innerHTML = '<img src="x" onerror="window.__csp.handler=1">'; });
await attempt('un script en ligne ne court pas', 'script-src', async () => { const s = document.createElement('script'); s.textContent = 'window.__csp.inline=1'; document.body.appendChild(s); s.remove(); });
await attempt('un script d\'une autre adresse ne se charge pas', 'script-src', async () => { const s = document.createElement('script'); s.src = 'https://exemple.invalid/x.js'; document.body.appendChild(s); });
await attempt('un script d\'une bibliothèque non figée du même CDN ne se charge pas', 'script-src', async () => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.8.3/angular.min.js'; document.body.appendChild(s); });
await attempt('une adresse javascript: ne court pas', 'script-src', async host => { host.innerHTML = '<a href="javascript:window.__csp.href=1">x</a>'; host.firstChild.click(); });
await attempt('une balise de base ne change pas l\'adresse de base', 'base-uri', async host => { host.innerHTML = '<base href="https://exemple.invalid/">'; });
await attempt('un cadre ne s\'ouvre pas', 'frame-src', async host => { host.innerHTML = '<iframe src="https://exemple.invalid/"></iframe>'; });
await attempt('un objet ne se charge pas', 'object-src', async host => { host.innerHTML = '<object data="https://exemple.invalid/a"></object>'; });
await attempt('un formulaire ne part pas', 'form-action', async host => { host.innerHTML = '<form action="https://exemple.invalid/" method="post"></form>'; host.firstChild.submit(); });

// Un cadre à contenu intégré (srcdoc) n'est pas « chargé » : il hérite de la politique de la page, et son script, parsé avant l'événement load du cadre, a déjà couru ou été refusé quand on regarde.
const srcdoc = await page.evaluate(async () => {
  window.__csp = {};
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const loaded = new Promise(done => frame.addEventListener('load', done, { once: true }));
  frame.srcdoc = '<script>parent.__csp.srcdoc=1<\/script><p id="alive">x</p>';
  await loaded;
  const result = { ran: Object.keys(window.__csp), alive: !!frame.contentDocument.getElementById('alive') };
  frame.remove();
  return result;
});
check('un cadre à contenu intégré (srcdoc) hérite de la politique : son script ne court pas', srcdoc.alive && srcdoc.ran.length === 0, srcdoc);

const alive = await page.evaluate(() => Editor.getHTML());
check('le widget fonctionne encore après ces essais', /Bonjour la politique/.test(alive), alive.slice(0, 80));
check('aucune erreur de page (pageerror) pendant tout le parcours', pageErrors.length === 0, pageErrors);

// 3) Le vrai fichier d'API de Grist, tel que docs.getgrist.com le sert, dans une page qui ne porte que la politique : sans 'unsafe-eval', ses eval() sont refusés et l'objet grist reste
// vide. Un second essai sans 'unsafe-eval' le montre ; s'il réussissait, Grist n'aurait plus besoin de cette ouverture et la politique pourrait la retirer. Le fichier est récupéré par curl
// (qui suit le proxy de sortie de l'environnement) puis servi au navigateur à l'adresse réelle : ce que la page évalue est exactement ce que Grist envoie.
function fetchRealGristApi() {
  try { return execFileSync('curl', ['-sSfL', '-m', '60', 'https://docs.getgrist.com/grist-plugin-api.js'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (e) { return String((e && e.message) || e).split('\n')[0]; }
}
async function realGristApi(policyText, apiSource) {
  const ctx = await browser.newContext();
  const probe = await ctx.newPage();
  await ctx.addInitScript(() => {
    window.__v = [];
    document.addEventListener('securitypolicyviolation', e => window.__v.push(e.effectiveDirective + ' ' + e.blockedURI), true);
  });
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: apiSource }));
  await ctx.route(`${BASE}/__sonde.html`, route => route.fulfill({
    status: 200, contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policyText.replace(/"/g, '&quot;')}"><title>sonde</title><script src="https://docs.getgrist.com/grist-plugin-api.js"></script>`,
  }));
  await probe.goto(`${BASE}/__sonde.html`, { waitUntil: 'load' });
  const out = await probe.evaluate(() => ({
    complete: typeof window.grist === 'object' && !!window.grist && ['ready', 'onRecord', 'docApi', 'getTable'].every(k => k in window.grist),
    violations: window.__v.slice(0, 3),
  }));
  await ctx.close();
  return out;
}
const gristApiSource = fetchRealGristApi();
if (!/var grist/.test(gristApiSource) || gristApiSource.length < 100000) skip('l\'API Grist réelle s\'évalue sous la politique', 'docs.getgrist.com injoignable : ' + gristApiSource.slice(0, 120));
else {
  const real = await realGristApi(policy, gristApiSource);
  check('l\'API Grist réelle (docs.getgrist.com/grist-plugin-api.js) s\'évalue sous la politique : l\'objet grist est complet, aucune violation', real.complete && real.violations.length === 0, real);
  const strict = await realGristApi(policy.replace(/\s*'unsafe-eval'/, ''), gristApiSource);
  if (strict.complete && strict.violations.length === 0) console.log('  info - l\'API Grist réelle n\'a plus besoin de \'unsafe-eval\' : la politique peut le retirer');
  else console.log('  info - sans \'unsafe-eval\' l\'API Grist réelle ne s\'évalue plus (' + (strict.violations[0] || 'objet grist incomplet') + ') : l\'ouverture reste nécessaire');
}

// 4) Dans un cadre comme celui d'un document Grist. Le bac à sable de Grist ne laisse que ce qu'il veut ; avec allow-same-origin le widget démarre en entier, sans (origine opaque) ses
// propres scripts doivent malgré tout se charger : 'self' vaut l'adresse de la page, pas son origine.
async function bootInFrame(sandbox, expectReady) {
  const host = await context.newPage();
  await host.route(`${BASE}/__cadre.html`, route => route.fulfill({
    status: 200, contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><body style="margin:0"><iframe name="w" sandbox="${sandbox}" src="${BASE}/index.html" style="width:700px;height:400px;border:0"></iframe>`,
  }));
  await host.goto(`${BASE}/__cadre.html`, { waitUntil: 'load' });
  const frame = host.frame({ name: 'w' });
  let ready = false;
  try {
    await frame.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: expectReady ? 60000 : 20000 });
    ready = true;
  } catch { /* l'éditeur ne démarre pas */ }
  const seen = await frame.evaluate(() => window.__cspViolations.map(v => v.directive + ' ' + v.blocked)).catch(() => ['(cadre illisible)']);
  await host.close();
  return { ready, seen };
}
const SANDBOX_SAME_ORIGIN = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads';
const sameOrigin = await bootInFrame(SANDBOX_SAME_ORIGIN, true);
check('dans un cadre à bac à sable avec allow-same-origin : l\'éditeur démarre, aucune violation', sameOrigin.ready && sameOrigin.seen.length === 0, sameOrigin);
const opaque = await bootInFrame('allow-scripts allow-forms allow-popups allow-modals allow-downloads', false);
check('dans un cadre à bac à sable sans allow-same-origin : aucun script du widget n\'est refusé', !opaque.seen.some(v => v.startsWith('script-src')), opaque);

await context.close();
await browser.close(); server.close();
console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0);
