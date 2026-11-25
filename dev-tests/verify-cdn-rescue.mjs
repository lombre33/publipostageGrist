#!/usr/bin/env node
// Le secours d'un CDN : la copie de GFS (consigne GFS 108, contrats de GFS 5.2 point 14, kit 0.31.0 : kit/js/script-loader.js ; js/gfs-link.js `secours`, js/export-common.js `loadScriptOnce(lib, secours)`, js/native-libs.js, js/extensions.js
// `rescue` et les chargeurs de extensions/graphique/chart-plot.js et chart-make.js), 700x400. Un GFS simulé (dev-tests/gfs-stub.js, adresse `?gfs=0`) rend `secours` dans le contexte et l'événement `extensions` ; ce script sert lui-même les « copies de
// GFS » (les fichiers du miroir, à /__gfs-copie/<id>/<version>/<fichier>, avec l'en-tête CORS d'un hôte comme GitHub Pages), PRIVE le navigateur du CDN de la façon que chaque cas dit (une réponse en erreur, un fichier introuvable, d'autres octets que ceux
// que l'empreinte nomme, un hôte qui ne répond pas) et lit ce que le navigateur a vraiment demandé : l'empreinte (SRI) d'un script y est VRAIE (`realIntegrity` de dev-tests/gfs-page.mjs ; `'tout'` pour le CDN aussi), une fausse empreinte est refusée par
// le navigateur et sa phrase de refus est lue dans la console. Pour chacune des neuf fonctions de chargement - les sept des bibliothèques natives (pdf, pdf-assemblage, zip, word, excel, markdown, qr) et les deux du graphique (Plotly, ECharts : les
// bibliothèques que GFS donne par `bibliotheques`) -, le vrai chargeur est appelé :
//  A) LE CDN ÉCHOUE (la réponse est une erreur réseau) : le navigateur demande le CDN d'abord, puis la copie de GFS, avec l'empreinte que GFS donne ; la bibliothèque marche et rien n'est dit à la personne (elle n'a rien choisi) ;
//  B) LE CDN NE TROUVE RIEN (404) : le même ;
//  C) LE CDN RENVOIE D'AUTRES OCTETS (l'empreinte du catalogue les refuse, pour de bon) : le navigateur les refuse, ils ne s'exécutent jamais, la copie de GFS les remplace ;
//  D) LE CDN NE RÉPOND PAS : au bout de 3 secondes, la copie de GFS ; un CDN qui répondrait après coup ne défait rien (les mêmes octets, une deuxième fois) ;
//  E) LE CDN RÉPOND : la copie de GFS n'est jamais demandée ;
//  F) L'APP SEULE (sans `gfs=`) : rien ne change - une balise, le CDN, jamais le chargeur du kit ; le CDN en échec fait échouer l'appel comme avant ;
//  G) UN GFS D'AVANT LA 108 (le contexte n'a pas de `secours`) : de même ;
//  H) UNE COPIE D'UNE AUTRE VERSION que la liste de l'app (ou de forme module, pour une bibliothèque native) n'est jamais un secours ;
//  I) UN SECOURS D'UNE ORIGINE QUE LA POLITIQUE NE PERMET PAS n'est jamais demandé ;
//  J) UNE COPIE QUI ÉCHOUE AUSSI (fausse empreinte) : l'appel échoue, avec la phrase des deux échecs ;
//  K) DANS LE CADRE ISOLÉ DE GFS (origine opaque, la politique de sécurité de la page respectée) : la copie passe par `'self'`, aucune violation ;
//  L) LA LECTURE de `secours` : la version demandée, une entrée incomplète écartée, un changement seul qui ne rappelle personne, le nouveau secours qui vaut au chargement suivant ;
//  M) UNE BIBLIOTHÈQUE DE FORME MODULE (le fichier assemblé d'une extension) a aussi son secours ;
//  N) LA CARTE D'IMPORTATION nomme `kit/script-loader` et une page sans le chargeur du kit retombe sur la balise seule.
// Lancé par run-headless.mjs (groupe Node "cdnRescue", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-cdn-rescue.mjs
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { start, seedModels, ROOT } from './gfs-page.mjs';

const t = await start({ name: 'verify-cdn-rescue', port: Number(process.env.CDN_RESCUE_PORT || 9230) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Ce que la liste (package.json) et le catalogue (bibliotheques/catalogue.json) disent de chaque bibliothèque native, et les deux du graphique ; le fichier du miroir que le test sert comme « copie de GFS ».
const LIST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const CATALOGUE = JSON.parse(readFileSync(join(ROOT, 'bibliotheques', 'catalogue.json'), 'utf8')).bibliotheques;
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');
const NATIVE = Object.keys(LIST.gfs.bibliotheques);
const CHARTS = {
  plotly: { version: '2.13.2', cdn: 'https://cdn.jsdelivr.net/npm/plotly.js-basic-dist-min@2.13.2/plotly-basic.min.js', file: 'plotly-basic.min.js', fake: 'window.Plotly = { copie: "de test" };' },
  echarts: { version: '6.1.0', cdn: 'https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js', file: 'echarts.min.js', cache: 'umd/echarts.min.js', fake: 'window.echarts = { copie: "de test" };' },
};
const ALL = NATIVE.concat(Object.keys(CHARTS));
const isNative = id => NATIVE.includes(id);
const versionOf = id => (isNative(id) ? LIST.dependencies[LIST.gfs.bibliotheques[id].paquet] : CHARTS[id].version);
const mirrorOf = id => LIST.gfs.bibliotheques[id].miroir.vers;
const cdnOf = (id) => {
  if (!isNative(id)) return { src: CHARTS[id].cdn, integrity: null };
  const entry = CATALOGUE.find(item => item.id === id);
  return { src: entry.cdn.src, integrity: entry.cdn.integrite };
};
// Plotly : un faux fichier (le chargeur seul est sous test, pas le dessin) ; ECharts : le vrai du miroir s'il est construit ; les neuf natives : leurs fichiers du miroir.
const bytesOf = (id) => {
  if (id === 'plotly') return Buffer.from(CHARTS.plotly.fake);
  if (id === 'echarts') return existsSync(join(CACHE, CHARTS.echarts.cache)) ? readFileSync(join(CACHE, CHARTS.echarts.cache)) : Buffer.from(CHARTS.echarts.fake);
  return readFileSync(join(CACHE, mirrorOf(id)));
};
const sha384 = bytes => 'sha384-' + createHash('sha384').update(bytes).digest('base64');
const fileOf = id => (isNative(id) ? mirrorOf(id).split('/').pop() : CHARTS[id].file);
const copyUrl = id => `${t.base}/__gfs-copie/${id}/${versionOf(id)}/${fileOf(id)}`;
const copyOf = (id, change) => Object.assign({ version: versionOf(id), src: copyUrl(id), integrite: sha384(bytesOf(id)), forme: 'script' }, change || {});
const WRONG = 'sha384-' + 'A'.repeat(64);   // une empreinte bien formée, qui n'est celle d'aucun de ces fichiers
const allSpares = change => Object.fromEntries(ALL.map(id => [id, copyOf(id, typeof change === 'function' ? change(id) : change)]));

// Les neuf fonctions : le vrai chargeur que le code appelle (et le moteur d'export qui le porte, chargé comme le fait un export), et ce que la bibliothèque pose dans la page.
const FUNCTIONS = [
  { id: 'pdf', libs: ['pdfmake', 'pdfmake-polices'], globals: ['pdfMake'], native: true, name: { fr: 'Export PDF' },
    run: app => app.evaluate(async () => { try { await ExportEngines.ensure('pdf'); await PdfExport.ensurePdfLibsLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'pdf-assemblage', libs: ['pdf-lib'], globals: ['PDFLib'], native: true, name: { fr: 'Assemblage de PDF' },
    run: app => app.evaluate(async () => { try { await ExportEngines.ensure('merge'); await PdfMerge.ensureLibLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'zip', libs: ['jszip'], globals: ['JSZip'], native: true, name: { fr: 'Archives ZIP' },
    run: app => app.evaluate(async () => { try { await ExportCommon.ensureJsZipLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'word', libs: ['docx', 'docx-charts'], globals: ['docx', 'docxCharts'], native: true, name: { fr: 'Word et graphiques' },
    run: app => app.evaluate(async () => { try { await ExportEngines.ensure('docx'); await DocxExport.ensureDocxLibLoaded(); await DocxExport.ensureDocxChartsLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'excel', libs: ['exceljs'], globals: ['ExcelJS'], native: true, name: { fr: 'Export Excel' },
    run: app => app.evaluate(async () => { try { await ExportEngines.ensure('xlsx'); await XlsxExport.ensureExcelLibLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'markdown', libs: ['marked'], globals: ['marked'], native: true, name: { fr: 'Import Markdown' },
    run: app => app.evaluate(async () => { try { await MarkdownImport.ensureLibLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'qr', libs: ['qrcode-generator'], globals: ['qrcode'], native: true, name: { fr: 'QR code' },
    run: app => app.evaluate(async () => { try { await QrCode.ensureLibrary(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'plotly', libs: ['plotly'], globals: ['Plotly'], native: false, name: { fr: 'Graphique (Plotly)' },
    run: app => app.evaluate(async () => { try { await Extensions.ensure('graphique'); await ChartPlot.ensureLibrary(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'echarts', libs: ['echarts'], globals: ['echarts'], native: false, name: { fr: 'Graphique (ECharts)' },
    run: app => app.evaluate(async () => { try { await Extensions.ensure('graphique'); await ChartMake.ensureLibrary(); return null; } catch (e) { return String(e && e.message); } }) },
];
const NATIVES = FUNCTIONS.filter(fn => fn.native);
const OLD_MESSAGE = fn => `Échec de chargement du script : ${cdnOf(fn.libs[0]).src}`;
const BOTH_MESSAGE = fn => `Échec de chargement du script : ${cdnOf(fn.libs[0]).src} (et de sa copie chez GFS)`;

// Ce qui est posé dans chaque page : les phrases que l'app dit à la page (`pp:nativeFallback`), les violations de la politique de sécurité, ce que les octets « changés » ont fait s'ils se sont exécutés.
const TRACK = 'window.__fallbacks = []; document.addEventListener("pp:nativeFallback", e => window.__fallbacks.push(e.detail));'
  + ' window.__violations = []; document.addEventListener("securitypolicyviolation", e => window.__violations.push(e.effectiveDirective + " " + e.blockedURI), true);'
  // « absent » : le même essai sert à mesurer l'ancien code, qui n'a ni GfsLink.secours ni Extensions.rescue.
  + ' window.__secours = (id, version) => (typeof GfsLink !== "undefined" && typeof GfsLink.secours === "function" ? GfsLink.secours(id, version) : "absent");'
  + ' window.__rescue = id => (typeof Extensions !== "undefined" && typeof Extensions.rescue === "function" ? Extensions.rescue(id) : "absent");';
const CORS = { 'Access-Control-Allow-Origin': '*' };
const SCRIPT = 'text/javascript; charset=utf-8';
const refusals = [];   // les phrases de refus d'empreinte du navigateur
const warnings = [];   // les phrases du chargeur du kit quand la copie prend le relais
const serve = async (page) => {
  page.on('console', (message) => {
    if (/integrity/i.test(message.text())) refusals.push(message.text());
    if (/la copie de GFS prend le relais/.test(message.text())) warnings.push(message.text());
  });
  await page.route('**/__gfs-copie/**', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[2];
    if (!ALL.includes(id)) { await route.fulfill({ status: 404, body: '' }); return; }
    await route.fulfill({ status: 200, contentType: SCRIPT, headers: CORS, body: bytesOf(id) });
  });
  // Le CDN des deux bibliothèques du graphique (le harnais ne sert qu'ECharts, et seulement quand son miroir est construit) : les mêmes octets que leur copie.
  for (const id of Object.keys(CHARTS)) await page.route(CHARTS[id].cdn, route => route.fulfill({ status: 200, contentType: SCRIPT, headers: CORS, body: bytesOf(id) }));
};
// Ce que le CDN fait de toute demande de la page, posé APRÈS l'ouverture (la dernière route posée gagne sur celles du harnais).
const OUTAGES = {
  erreur: () => route => route.abort('failed'),
  introuvable: () => route => route.fulfill({ status: 404, contentType: 'text/plain', headers: CORS, body: 'introuvable' }),
  octets: () => route => route.fulfill({ status: 200, contentType: SCRIPT, headers: CORS, body: 'window.__evil = (window.__evil || 0) + 1;' }),
  muet: held => (route) => { held.push(route); },
};
const open = async ({ natives = {}, secours = allSpares(), hosted = true, framed = null, integrity = true, outage = null, blockKit = false } = {}) => {
  refusals.length = 0;
  warnings.length = 0;
  const stub = {};
  if (natives !== undefined) stub.natives = natives;
  if (secours !== null) stub.secours = secours;   // `null` : un GFS d'avant la 108, dont le contexte n'a pas de `secours`
  const opened = await t.openPage(Object.assign({ hosted, seed: seedModels(), stub: hosted ? stub : null, init: TRACK, before: serve, realIntegrity: integrity }, framed ? { framed, bypassCSP: false } : {}));
  opened.held = [];
  if (outage) await opened.page.route('https://cdn.jsdelivr.net/**', OUTAGES[outage](opened.held));
  if (blockKit) await opened.page.route('**/kit/js/script-loader.js*', route => route.abort('failed'));
  return opened;
};

// Appelle le chargeur de la fonction `fn` et rend ce que le navigateur a demandé pendant ce temps (par bibliothèque : la copie de GFS, le CDN), ce que la bibliothèque a posé, les phrases dites à la page, le coin d'état, le temps pris.
async function exercise(opened, fn, limit = 20000) {
  const { app, requests } = opened;
  const before = requests.length;
  const fallbacksBefore = await app.evaluate(() => window.__fallbacks.length);
  const warningsBefore = warnings.length;
  const began = Date.now();
  // Un chargeur qui n'aurait aucun secours attendrait un CDN muet sans fin : le test le lit comme une erreur au bout de `limit` ms, au lieu d'attendre avec lui.
  const error = await Promise.race([fn.run(app), sleep(limit).then(() => `aucune réponse en ${limit} ms`)]);
  const ms = Date.now() - began;
  const made = requests.slice(before);
  const fallbacks = (await app.evaluate(() => window.__fallbacks)).slice(fallbacksBefore);
  const defined = await app.evaluate(names => names.map(name => typeof window[name]), fn.globals);
  const status = await app.evaluate(() => document.getElementById('status-msg').textContent);
  const integrity = await app.evaluate(() => window.__integrity);
  const evil = await app.evaluate(() => window.__evil);
  const per = Object.fromEntries(fn.libs.map(id => [id, { copy: made.filter(url => url === copyUrl(id)).length, cdn: made.filter(url => url === cdnOf(id).src).length }]));
  const order = fn.libs.every(id => made.indexOf(cdnOf(id).src) !== -1 && made.indexOf(cdnOf(id).src) < made.indexOf(copyUrl(id)));
  return { error, per, order, defined, fallbacks, status, integrity, evil, made, ms, said: warnings.length - warningsBefore };
}
const loaded = r => r.error === null && r.defined.every(kind => kind !== 'undefined');
const silent = r => r.fallbacks.length === 0 && !/GFS/.test(r.status);
const integrityOf = (r, src) => (r.integrity.find(item => item.src === src) || null);
const loaderAsked = opened => opened.requests.some(url => /\/kit\/js\/script-loader\.js/.test(url));
const copiesAsked = opened => opened.requests.filter(url => url.includes('/__gfs-copie/'));
// Le CDN qui répond enfin, après coup : les octets du miroir.
async function release(opened) {
  for (const route of opened.held.splice(0)) {
    const id = ALL.find(item => cdnOf(item).src === route.request().url());
    await route.fulfill({ status: 200, contentType: SCRIPT, headers: CORS, body: id ? bytesOf(id) : '' });
  }
  await sleep(400);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\nA) Le CDN échoue (réseau) : la copie de GFS le remplace, rien n\'est dit à la personne');
{
  const opened = await open({ outage: 'erreur' });
  for (const fn of FUNCTIONS) {
    const r = await exercise(opened, fn);
    const asked = fn.libs.every(id => r.per[id].cdn === 1 && r.per[id].copy === 1);
    check(`A) ${fn.id} : le navigateur demande le CDN d'abord, puis la copie de GFS, une fois chacun, pour chaque bibliothèque (${fn.libs.join(', ')})`, asked && r.order, JSON.stringify({ per: r.per, order: r.order }));
    const sri = fn.libs.every(id => { const got = integrityOf(r, copyUrl(id)); return got && got.integrity === copyOf(id).integrite && got.enforced === true; });
    check(`A) ${fn.id} : la copie se charge avec l'empreinte que GFS donne (vraie : le navigateur la vérifie), la bibliothèque marche, rien n'est dit à la personne`, sri && loaded(r) && silent(r), JSON.stringify({ error: r.error, defined: r.defined, fallbacks: r.fallbacks, status: r.status }));
  }
  check('A) le chargeur du kit a dit une fois, par bibliothèque, que la copie de GFS prend le relais (console), et le navigateur n\'a refusé aucune empreinte', warnings.length === FUNCTIONS.reduce((n, fn) => n + fn.libs.length, 0) && refusals.length === 0, JSON.stringify({ warnings: warnings.length, refusals }));
  await opened.context.close();
}

console.log('\nB) Le CDN ne trouve rien (404) : de même');
{
  const opened = await open({ outage: 'introuvable' });
  for (const fn of FUNCTIONS) {
    const r = await exercise(opened, fn);
    check(`B) ${fn.id} : le CDN d'abord, la copie de GFS ensuite, la bibliothèque marche, rien n'est dit`, fn.libs.every(id => r.per[id].cdn === 1 && r.per[id].copy === 1) && r.order && loaded(r) && silent(r), JSON.stringify({ per: r.per, error: r.error, defined: r.defined }));
  }
  await opened.context.close();
}

console.log('\nC) Le CDN renvoie d\'autres octets que ceux de l\'empreinte : le navigateur les refuse, ils ne s\'exécutent jamais, la copie de GFS les remplace');
{
  const opened = await open({ outage: 'octets', integrity: 'tout' });
  for (const fn of FUNCTIONS) {
    refusals.length = 0;
    const r = await exercise(opened, fn);
    const refused = fn.libs.every(id => refusals.some(text => text.includes(cdnOf(id).src)));
    const asked = fn.libs.every((id) => { const got = integrityOf(r, cdnOf(id).src); return r.per[id].cdn === 1 && r.per[id].copy === 1 && got && got.enforced === true && /^sha384-/.test(got.integrity) && (cdnOf(id).integrity === null || got.integrity === cdnOf(id).integrity); });
    check(`C) ${fn.id} : le CDN est demandé avec son empreinte, le NAVIGATEUR refuse ses octets (sa phrase de refus est dans la console), la copie de GFS est demandée ensuite`, asked && refused && r.order, JSON.stringify({ per: r.per, refused, refusals: refusals.length }));
    check(`C) ${fn.id} : les octets refusés ne se sont jamais exécutés, la copie de GFS donne la bibliothèque, rien n'est dit à la personne`, r.evil === undefined && loaded(r) && silent(r), JSON.stringify({ evil: r.evil, error: r.error, defined: r.defined }));
  }
  await opened.context.close();
}

console.log('\nD) Le CDN ne répond pas : au bout de 3 secondes, la copie de GFS ; le CDN qui répondrait après coup ne défait rien');
{
  const opened = await open({ outage: 'muet' });
  for (const fn of FUNCTIONS) {
    const r = await exercise(opened, fn, fn.libs.length * 3000 + 6000);
    const perLibrary = fn.libs.length * 3000;
    check(`D) ${fn.id} : le CDN est demandé d'abord, la copie de GFS ensuite, après 3 secondes d'attente par bibliothèque (${r.ms} ms pour ${fn.libs.length})`, fn.libs.every(id => r.per[id].cdn === 1 && r.per[id].copy === 1) && r.order && r.ms >= perLibrary - 200 && r.ms < perLibrary + 6000, JSON.stringify({ per: r.per, ms: r.ms, order: r.order }));
    check(`D) ${fn.id} : la bibliothèque marche depuis la copie de GFS, rien n'est dit à la personne`, loaded(r) && silent(r), JSON.stringify({ error: r.error, defined: r.defined, fallbacks: r.fallbacks, status: r.status }));
    const copyIntegrity = fn.libs.every((id) => { const got = integrityOf(r, copyUrl(id)); return got && got.integrity === copyOf(id).integrite && got.enforced === true; });
    check(`D) ${fn.id} : la copie se charge avec l'empreinte que GFS donne (vraie)`, copyIntegrity, JSON.stringify(r.integrity.filter(item => fn.libs.some(id => item.src === copyUrl(id)))));
  }
  // Le CDN répond enfin, après coup : ses octets (les mêmes, la bibliothèque une deuxième fois) ne défont rien de ce qui marche.
  const held = opened.held.length;
  await release(opened);
  const still = await opened.app.evaluate(() => ({
    globals: ['pdfMake', 'PDFLib', 'JSZip', 'docx', 'docxCharts', 'ExcelJS', 'marked', 'qrcode', 'Plotly', 'echarts'].map(name => typeof window[name]),
    fonts: window.pdfMake && window.pdfMake.vfs ? Object.keys(window.pdfMake.vfs).length : 0,
    createPdf: !!(window.pdfMake && typeof window.pdfMake.createPdf === 'function'),
  }));
  check(`D) les ${held} réponses tardives du CDN (les mêmes octets une deuxième fois) ne défont rien : toutes les bibliothèques sont là, pdfmake garde ses polices et son createPdf`, held === FUNCTIONS.reduce((n, fn) => n + fn.libs.length, 0) && still.globals.every(kind => kind !== 'undefined') && still.fonts > 0 && still.createPdf, JSON.stringify({ held, still }));
  await opened.context.close();
}

console.log('\nE) Le CDN répond : la copie de GFS n\'est jamais demandée');
{
  const opened = await open({});
  for (const fn of FUNCTIONS) {
    const r = await exercise(opened, fn);
    check(`E) ${fn.id} : le navigateur demande le CDN de chaque bibliothèque, une fois, jamais la copie de GFS, la bibliothèque marche, rien n'est dit`, fn.libs.every(id => r.per[id].cdn === 1 && r.per[id].copy === 0) && loaded(r) && silent(r) && r.said === 0, JSON.stringify({ per: r.per, error: r.error, defined: r.defined, said: r.said }));
  }
  check('E) aucune copie de GFS n\'a été demandée de toute la page, et le chargeur du kit n\'a rien dit', copiesAsked(opened).length === 0 && warnings.length === 0, JSON.stringify({ copies: copiesAsked(opened), warnings: warnings.length }));
  check('E) GFS donnait un secours : le chargeur du kit est celui qui a posé les balises', loaderAsked(opened), '');
  await opened.context.close();
}

console.log('\nF) L\'app seule (sans `gfs=` dans son adresse) : rien ne change, pas de chargeur du kit, pas de copie');
{
  const ok = await open({ hosted: false });
  for (const fn of NATIVES) {
    const r = await exercise(ok, fn);
    check(`F) ${fn.id} : le CDN répond : une demande par bibliothèque, aucune copie, la bibliothèque marche`, fn.libs.every(id => r.per[id].cdn === 1 && r.per[id].copy === 0) && loaded(r), JSON.stringify({ per: r.per, error: r.error, defined: r.defined }));
  }
  check('F) le chargeur du kit n\'a pas même été demandé : une balise seule, sans minuterie, comme avant', !loaderAsked(ok) && copiesAsked(ok).length === 0, JSON.stringify({ loader: loaderAsked(ok), copies: copiesAsked(ok) }));
  await ok.context.close();
  const down = await open({ hosted: false, outage: 'erreur' });
  for (const fn of NATIVES) {
    const r = await exercise(down, fn);
    check(`F) ${fn.id} : le CDN échoue : l'appel échoue comme avant (« ${OLD_MESSAGE(fn)} »), aucune copie demandée`, r.error === OLD_MESSAGE(fn) && r.defined.every(kind => kind === 'undefined') && copiesAsked(down).length === 0, JSON.stringify({ error: r.error, defined: r.defined, copies: copiesAsked(down) }));
  }
  check('F) le CDN échoue : le chargeur du kit n\'a pas été demandé', !loaderAsked(down), '');
  await down.context.close();
}

console.log('\nG) Un GFS d\'avant la 108 (le contexte n\'a pas de `secours`) : rien ne change');
{
  const opened = await open({ secours: null, outage: 'erreur' });
  const none = await opened.app.evaluate(() => ({ native: __secours('pdf-lib'), plotly: __secours('plotly'), rescue: __rescue('plotly') }));
  check('G) GfsLink.secours et Extensions.rescue rendent null', none.native === null && none.plotly === null && none.rescue === null, JSON.stringify(none));
  for (const fn of FUNCTIONS) {
    const r = await exercise(opened, fn);
    check(`G) ${fn.id} : le CDN échoue : l'appel échoue comme avant (« ${OLD_MESSAGE(fn)} »), aucune copie demandée`, r.error === OLD_MESSAGE(fn) && r.defined.every(kind => kind === 'undefined') && copiesAsked(opened).length === 0, JSON.stringify({ error: r.error, defined: r.defined, copies: copiesAsked(opened) }));
  }
  check('G) le chargeur du kit n\'a pas été demandé', !loaderAsked(opened), '');
  await opened.context.close();
}

console.log('\nH) Une copie d\'une autre version que la liste (ou de forme module) n\'est jamais un secours d\'une bibliothèque native');
{
  const gap = await open({ secours: allSpares({ version: '0.0.1' }), outage: 'erreur' });
  const ask = await gap.app.evaluate(() => ({ native: __secours('pdf-lib', NativeLibs.versionOf('pdf-lib')), any: __secours('pdf-lib') && __secours('pdf-lib').version }));
  check('H) GfsLink.secours(id, version) rend null quand la copie est d\'une autre version, la copie telle quelle sans version demandée', ask.native === null && ask.any === '0.0.1', JSON.stringify(ask));
  for (const fn of NATIVES) {
    const r = await exercise(gap, fn);
    check(`H) ${fn.id} : le CDN échoue, la copie est d'une autre version : l'appel échoue (« ${OLD_MESSAGE(fn)} »), la copie n'est pas demandée`, r.error === OLD_MESSAGE(fn) && r.per[fn.libs[0]].copy === 0 && r.defined.every(kind => kind === 'undefined'), JSON.stringify({ error: r.error, per: r.per, defined: r.defined }));
  }
  for (const fn of FUNCTIONS.filter(item => !item.native)) {
    const r = await exercise(gap, fn);
    check(`H) ${fn.id} : GFS ne dit pas de version pour une bibliothèque d'extension : sa copie sert, la bibliothèque marche`, r.per[fn.libs[0]].copy === 1 && loaded(r), JSON.stringify({ error: r.error, per: r.per, defined: r.defined }));
  }
  await gap.context.close();
  const asModule = await open({ secours: allSpares({ forme: 'module' }), outage: 'erreur' });
  const zip = NATIVES.find(fn => fn.id === 'zip');
  const r = await exercise(asModule, zip);
  check('H) zip : une copie de forme « module » ne sert pas (un script classique est attendu) : l\'appel échoue, la copie n\'est pas demandée', r.error === OLD_MESSAGE(zip) && r.per.jszip.copy === 0, JSON.stringify({ error: r.error, per: r.per }));
  await asModule.context.close();
}

console.log('\nI) Un secours d\'une origine que la politique ne permet pas n\'est jamais demandé');
{
  const evil = Object.fromEntries(ALL.map(id => [id, copyOf(id, { src: `https://evil.example/${id}.js` })]));
  const opened = await open({ secours: evil, outage: 'erreur' });
  for (const id of ['zip', 'plotly']) {
    const fn = FUNCTIONS.find(item => item.id === id);
    const r = await exercise(opened, fn);
    check(`I) ${id} : le CDN échoue, le secours est d'un autre site : l'appel échoue comme avant (« ${OLD_MESSAGE(fn)} »), l'autre site n'est jamais demandé`, r.error === OLD_MESSAGE(fn) && !opened.requests.some(url => url.includes('evil.example')) && r.defined.every(kind => kind === 'undefined'), JSON.stringify({ error: r.error, evil: opened.requests.filter(url => url.includes('evil.example')) }));
  }
  check('I) le chargeur du kit n\'a pas été demandé (le secours refusé revient au chargement d\'avant)', !loaderAsked(opened), '');
  await opened.context.close();
}

console.log('\nJ) La copie échoue aussi (fausse empreinte) : l\'appel échoue, avec la phrase des deux échecs');
{
  const opened = await open({ secours: allSpares({ integrite: WRONG }), outage: 'erreur', integrity: 'tout' });
  for (const fn of FUNCTIONS) {
    refusals.length = 0;
    const r = await exercise(opened, fn);
    const first = fn.libs[0];
    check(`J) ${fn.id} : le CDN échoue, le NAVIGATEUR refuse la copie (fausse empreinte), l'appel échoue : « ${BOTH_MESSAGE(fn)} »`, r.error === BOTH_MESSAGE(fn) && r.per[first].cdn === 1 && r.per[first].copy === 1 && refusals.some(text => text.includes(copyUrl(first))), JSON.stringify({ error: r.error, per: r.per, refusals: refusals.length }));
    check(`J) ${fn.id} : aucune bibliothèque ne s'est posée dans la page`, r.defined.every(kind => kind === 'undefined') && r.evil === undefined, JSON.stringify({ defined: r.defined, evil: r.evil }));
  }
  await opened.context.close();
}

console.log('\nK) Dans le cadre isolé de GFS (sans allow-same-origin, origine opaque, politique de sécurité de la page respectée)');
{
  const framed = { csp: "frame-src 'self'" };
  const opened = await open({ framed, outage: 'erreur' });
  const origin = await opened.app.evaluate(() => ({ origin: window.origin, csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]') }));
  check('K) l\'app est bien dans un cadre à origine opaque (window.origin « null »), sa politique de sécurité est celle de la page', origin.origin === 'null' && origin.csp, JSON.stringify(origin));
  for (const fn of FUNCTIONS) {
    const r = await exercise(opened, fn);
    const sri = fn.libs.every(id => { const got = integrityOf(r, copyUrl(id)); return got && got.integrity === copyOf(id).integrite && got.enforced === true; });
    check(`K) ${fn.id} : le CDN échoue, la copie de GFS passe par \`script-src 'self'\` avec son empreinte, la bibliothèque marche, rien n'est dit`, fn.libs.every(id => r.per[id].cdn === 1 && r.per[id].copy === 1) && r.order && sri && loaded(r) && silent(r), JSON.stringify({ per: r.per, error: r.error, defined: r.defined }));
  }
  const violations = await opened.app.evaluate(() => window.__violations);
  check('K) la politique de sécurité n\'a bloqué aucune balise (ni le chargeur du kit, ni une copie de GFS)', violations.length === 0, JSON.stringify(violations));
  await opened.context.close();
}

console.log('\nL) La lecture de `secours` : la version demandée, une entrée incomplète écartée, un changement seul qui ne rappelle personne');
{
  const good = copyOf('pdf-lib');
  const secours = {
    'pdf-lib': good,
    'jszip': { version: versionOf('jszip'), src: copyUrl('jszip'), forme: 'script' },                    // sans empreinte
    'marked': copyOf('marked', { integrite: 'md5-abcdef==' }),                                            // un autre algorithme
    'Excel': copyOf('exceljs'),                                                                           // un nom illisible (majuscule)
    'exceljs': copyOf('exceljs', { forme: 'inconnue' }),                                                  // une forme inconnue : `script`
    'plotly': copyOf('plotly'),
    'echarts': 'pas un objet',
  };
  const opened = await open({ secours });
  const read = await opened.app.evaluate(({ version }) => ({
    pdfLib: __secours('pdf-lib'), same: __secours('pdf-lib', version), other: __secours('pdf-lib', '0.0.0'), jszip: __secours('jszip'), marked: __secours('marked'), Excel: __secours('Excel'),
    exceljs: __secours('exceljs'), plotly: __secours('plotly'), echarts: __secours('echarts'), unknown: __secours('inconnue'), kind: typeof window.__secours,
  }), { version: versionOf('pdf-lib') });
  check('L) GfsLink.secours(id) rend la copie telle que GFS la donne ; avec la version de la liste, la même ; avec une autre version, null ; pour un nom que GFS ne donne pas, null', JSON.stringify(read.pdfLib) === JSON.stringify(good) && JSON.stringify(read.same) === JSON.stringify(good) && read.other === null && read.unknown === null, JSON.stringify(read));
  check('L) sans empreinte, d\'un autre algorithme, au nom illisible ou qui n\'est pas un objet : écartée (null) ; une forme inconnue vaut « script »', read.jszip === null && read.marked === null && read.Excel === null && read.echarts === null && read.exceljs && read.exceljs.forme === 'script', JSON.stringify(read));
  const mutated = await opened.app.evaluate(() => { const copy = __secours('pdf-lib'); if (copy && typeof copy === 'object') { copy.src = 'x'; copy.version = 'y'; } return __secours('pdf-lib'); });
  check('L) GfsLink.secours rend une copie : la changer ne change pas ce que l\'app a lu', JSON.stringify(mutated) === JSON.stringify(good), JSON.stringify(mutated));
  await opened.app.evaluate(() => { window.__changes = 0; GfsLink.onChange(() => { window.__changes += 1; }); });
  const send = async (next) => { await opened.page.evaluate(value => window.__gfsStub.setSecours(value), next); await sleep(200); return opened.app.evaluate(() => window.__changes); };
  const same = await send(secours);
  const changed = await send(Object.assign({}, secours, { 'pdf-lib': copyOf('pdf-lib', { src: copyUrl('pdf-lib') + '?autre' }) }));
  const cleared = await send({});
  const none = await opened.app.evaluate(() => __secours('pdf-lib'));
  check('L) un secours qui change seul ne rappelle l\'abonné de `GfsLink.onChange` en rien (il ne change rien à ce que l\'app charge), même quand tout est retiré, et la page reste la même', same === 0 && changed === 0 && cleared === 0 && none === null, JSON.stringify({ same, changed, cleared, none }));
  // Le nouveau secours vaut au chargement suivant, sans recharger la page.
  await opened.page.route('https://cdn.jsdelivr.net/**', route => route.abort('failed'));
  const zip = NATIVES.find(fn => fn.id === 'zip');
  const before = await exercise(opened, zip);
  check('L) sans secours (retiré en cours de route) : le CDN échoue, l\'appel échoue comme avant', before.error === OLD_MESSAGE(zip) && before.per.jszip.copy === 0, JSON.stringify({ error: before.error, per: before.per }));
  await opened.page.evaluate(copies => window.__gfsStub.setSecours(copies), allSpares());
  await sleep(300);
  const after = await exercise(opened, zip);
  check('L) le secours que GFS donne ensuite (l\'événement `extensions`) vaut au chargement suivant, sans recharger la page', after.per.jszip.cdn === 1 && after.per.jszip.copy === 1 && loaded(after) && silent(after), JSON.stringify({ per: after.per, error: after.error, defined: after.defined }));
  await opened.context.close();
}

console.log('\nM) Une bibliothèque de forme module (le fichier assemblé d\'une extension) a aussi son secours');
{
  const opened = await open({});
  const moduleBytes = 'window.__moduleCopy = (window.__moduleCopy || 0) + 1; export const copie = true;';
  const moduleCopy = { version: '1.0.0', src: `${t.base}/__gfs-copie/module-test/1.0.0/module.js`, integrite: sha384(Buffer.from(moduleBytes)), forme: 'module' };
  const moduleCdn = 'https://cdn.jsdelivr.net/npm/module-test@1.0.0/module.js';
  await opened.page.route('**/__gfs-copie/module-test/**', route => route.fulfill({ status: 200, contentType: SCRIPT, headers: CORS, body: moduleBytes }));
  await opened.page.route(moduleCdn, route => route.abort('failed'));
  const done = await opened.app.evaluate(async ({ cdn, copy }) => {
    try {
      await ExportCommon.loadScriptOnce({ src: cdn, integrity: 'sha384-' + 'B'.repeat(64), type: 'module' }, copy);
      const tags = Array.from(document.querySelectorAll('script[type="module"]')).map(tag => ({ src: tag.src, integrity: tag.integrity }));
      return { error: null, copy: window.__moduleCopy, tags };
    } catch (e) { return { error: String(e && e.message) }; }
  }, { cdn: moduleCdn, copy: moduleCopy });
  const tagged = (done.tags || []).filter(tag => tag.src === moduleCdn || tag.src === moduleCopy.src);
  check('M) le CDN du module échoue : la copie de GFS, posée en <script type="module"> avec son empreinte, s\'exécute une fois et l\'appel est résolu', done.error === null && done.copy === 1 && tagged.length === 2 && tagged.find(tag => tag.src === moduleCopy.src).integrity === moduleCopy.integrite, JSON.stringify(done));
  await opened.context.close();
}

console.log('\nN) La carte d\'importation nomme `kit/script-loader` ; une page sans le chargeur du kit retombe sur la balise seule');
{
  const opened = await open({});
  const map = await opened.app.evaluate(async () => {
    const entry = JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports['kit/script-loader'] || null;
    let module = null;
    try { module = await import('kit/script-loader'); } catch (e) { module = null; }   // une page sans la carte : l'ancien code
    return { entry, loadScript: module ? typeof module.loadScript : 'absent', delay: module ? module.SECOURS_DELAI : null };
  });
  check('N) la carte d\'importation d\'index.html nomme « kit/script-loader », le module se charge, `loadScript` est une fonction et la minuterie vaut 3000 ms', /\/kit\/js\/script-loader\.js/.test(map.entry || '') && map.loadScript === 'function' && map.delay === 3000, JSON.stringify(map));
  await opened.context.close();
  const alone = await open({ blockKit: true });
  const zip = NATIVES.find(fn => fn.id === 'zip');
  const ok = await exercise(alone, zip);
  check('N) le chargeur du kit est introuvable : le CDN répond, la bibliothèque se charge par une balise seule, sans copie, sans erreur', ok.per.jszip.cdn === 1 && ok.per.jszip.copy === 0 && loaded(ok), JSON.stringify({ per: ok.per, error: ok.error, defined: ok.defined }));
  await alone.context.close();
  const down = await open({ blockKit: true, outage: 'erreur' });
  const failed = await exercise(down, NATIVES.find(fn => fn.id === 'qr'));
  check('N) le chargeur du kit est introuvable ET le CDN échoue : l\'appel échoue comme avant, sans copie, sans erreur dans la page', failed.error === OLD_MESSAGE(NATIVES.find(fn => fn.id === 'qr')) && copiesAsked(down).length === 0, JSON.stringify({ error: failed.error, copies: copiesAsked(down) }));
  await down.context.close();
}

await t.finish();
