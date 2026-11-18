#!/usr/bin/env node
// Les bibliothèques natives de l'app, rangées par fonction : la copie figée de GFS ou le CDN (consigne GFS 065, contrats de GFS 5.2 point 12 et 2.6 point 14 ; js/gfs-link.js `native`, js/native-libs.js, les sept
// chargeurs réels de js/export-common.js, js/pdf-export.js, js/pdf-merge.js, js/docx-export.js, js/xlsx-export.js, js/markdown-import.js et js/qr-code.js, le coin d'état de js/main.js), 700x400. Un GFS simulé
// (dev-tests/gfs-stub.js, adresse `?gfs=0`) rend les `natives` du contexte et de l'événement `extensions` ; ce script sert lui-même les « copies de GFS » (les fichiers du miroir, à /__gfs-copie/<id>/<version>/<fichier>, avec
// l'en-tête CORS d'un hôte comme GitHub Pages) et lit ce que le navigateur a vraiment demandé : l'empreinte (SRI) d'un script qui ne vient pas d'un CDN y est VRAIE (`realIntegrity` de dev-tests/gfs-page.mjs), une
// fausse empreinte est refusée par le navigateur et sa phrase de refus est lue dans la console. Pour chacune des sept fonctions (pdf, pdf-assemblage, zip, word, excel, markdown, qr), le vrai chargeur est appelé :
//  A) COPIE : une copie de chaque bibliothèque à la version de la liste : le navigateur demande la copie de GFS (jamais le CDN), avec l'empreinte que GFS donne, la bibliothèque marche, rien n'est dit ;
//  B) CDN : `natives` vaut `{}` : le navigateur demande le CDN de l'app avec l'empreinte du catalogue (jamais GFS), la bibliothèque marche, rien n'est dit ; de même seul (sans GFS) ;
//  C) ÉCART : la personne a choisi la copie, mais une copie est d'une autre version que la liste, ou l'autre bibliothèque de la fonction n'en a pas : TOUT par le CDN, aucune copie demandée, et le coin d'état le dit ;
//  D) FAUSSE EMPREINTE : la copie est demandée, le navigateur la refuse (sa phrase est dans la console), le CDN la remplace, la bibliothèque marche, et le coin d'état le dit (jamais en silence) ;
//  E) EN COURS DE ROUTE : un choix qui change (l'événement `extensions`) ne touche pas ce qui est chargé et vaut au chargement suivant, sans recharger la page ;
//  F) DANS LE CADRE ISOLÉ DE GFS (sans `allow-same-origin`, origine opaque, la politique de sécurité de la page respectée) : la copie passe par `'self'` et marche, la fausse empreinte est refusée et le CDN la remplace ;
//  G) LA LECTURE de `natives` : une entrée incomplète, sans empreinte, d'un autre algorithme ou d'un nom illisible est écartée ; l'abonné de `GfsLink.onChange` est rappelé quand SEULE une copie change.
// Le coin d'état garde la phrase en tête des états qui suivent pendant vingt secondes (l'export qui charge la bibliothèque écrit ensuite les siens), puis la lâche.
// Lancé par run-headless.mjs (groupe Node "nativeLibs", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-native-libs.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { start, seedModels, ROOT } from './gfs-page.mjs';

const t = await start({ name: 'verify-native-libs', port: Number(process.env.NATIVE_LIBS_PORT || 8984) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Ce que la liste (package.json) et le catalogue (bibliotheques/catalogue.json) disent de chaque bibliothèque, et le fichier du miroir que le test sert comme « copie de GFS ».
const LIST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const CATALOGUE = JSON.parse(readFileSync(join(ROOT, 'bibliotheques', 'catalogue.json'), 'utf8')).bibliotheques;
const versionOf = id => LIST.dependencies[LIST.gfs.bibliotheques[id].paquet];
const cdnOf = (id) => { const entry = CATALOGUE.find(item => item.id === id); return { src: entry.cdn.src, integrity: entry.cdn.integrite }; };
const mirrorOf = id => LIST.gfs.bibliotheques[id].miroir.vers;
// Par défaut les « copies de GFS » sont les fichiers du miroir hors ligne. GFS_VENDOR=<dossier prototype/vendor d'un clone de GFS> les remplace par les VRAIS fichiers que GFS sert (une mesure à la main, sans effet sur
// ce que l'essai vérifie : les mêmes demandes, les mêmes empreintes, la bibliothèque doit marcher avec ces octets-là).
const GFS_VENDOR = process.env.GFS_VENDOR || '';
const GFS_FILES = { 'pdfmake': 'pdfmake/0.2.7/build/pdfmake.min.js', 'pdfmake-polices': 'pdfmake-polices/0.2.7/build/vfs_fonts.js', 'pdf-lib': 'pdf-lib/1.17.1/dist/pdf-lib.min.js', 'jszip': 'jszip/3.10.1/dist/jszip.min.js',
  'docx': 'docx/9.15.1/dist/index.iife.js', 'docx-charts': 'docx-charts/9.15.1/dist/charts.iife.js', 'exceljs': 'exceljs/4.4.0/dist/exceljs.min.js', 'marked': 'marked/15.0.12/marked.min.js', 'qrcode-generator': 'qrcode-generator/1.4.4/qrcode.js' };
const bytesOf = id => (GFS_VENDOR ? readFileSync(join(GFS_VENDOR, GFS_FILES[id])) : readFileSync(join(ROOT, 'dev-tests', '.offline-cache', mirrorOf(id))));
const sha384 = bytes => 'sha384-' + createHash('sha384').update(bytes).digest('base64');
const copyUrl = id => `${t.base}/__gfs-copie/${id}/${versionOf(id)}/${mirrorOf(id).split('/').pop()}`;
const copyOf = (id, change) => Object.assign({ version: versionOf(id), src: copyUrl(id), integrite: sha384(bytesOf(id)), forme: 'script' }, change || {});
const WRONG = 'sha384-' + 'A'.repeat(64);   // une empreinte bien formée, qui n'est celle d'aucun de ces fichiers
const ALL = Object.keys(LIST.gfs.bibliotheques);
const allCopies = change => Object.fromEntries(ALL.map(id => [id, copyOf(id, typeof change === 'function' ? change(id) : change)]));

// Les sept fonctions : le vrai chargeur que le code appelle (et le moteur d'export qui le porte, chargé comme le fait un export), et ce que la bibliothèque pose dans la page.
const FUNCTIONS = [
  { id: 'pdf', libs: ['pdfmake', 'pdfmake-polices'], globals: ['pdfMake'], name: { fr: 'Export PDF', en: 'PDF export' },
    run: app => app.evaluate(async () => { try { await ExportEngines.ensure('pdf'); await PdfExport.ensurePdfLibsLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'pdf-assemblage', libs: ['pdf-lib'], globals: ['PDFLib'], name: { fr: 'Assemblage de PDF', en: 'PDF assembly' },
    run: app => app.evaluate(async () => { try { await ExportEngines.ensure('merge'); await PdfMerge.ensureLibLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'zip', libs: ['jszip'], globals: ['JSZip'], name: { fr: 'Archives ZIP', en: 'ZIP archives' },
    run: app => app.evaluate(async () => { try { await ExportCommon.ensureJsZipLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'word', libs: ['docx', 'docx-charts'], globals: ['docx', 'docxCharts'], name: { fr: 'Word et graphiques', en: 'Word and charts' },
    run: app => app.evaluate(async () => { try { await ExportEngines.ensure('docx'); await DocxExport.ensureDocxLibLoaded(); await DocxExport.ensureDocxChartsLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'excel', libs: ['exceljs'], globals: ['ExcelJS'], name: { fr: 'Export Excel', en: 'Excel export' },
    run: app => app.evaluate(async () => { try { await ExportEngines.ensure('xlsx'); await XlsxExport.ensureExcelLibLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'markdown', libs: ['marked'], globals: ['marked'], name: { fr: 'Import Markdown', en: 'Markdown import' },
    run: app => app.evaluate(async () => { try { await MarkdownImport.ensureLibLoaded(); return null; } catch (e) { return String(e && e.message); } }) },
  { id: 'qr', libs: ['qrcode-generator'], globals: ['qrcode'], name: { fr: 'QR code', en: 'QR code' },
    run: app => app.evaluate(async () => { try { await QrCode.ensureLibrary(); return null; } catch (e) { return String(e && e.message); } }) },
];
const SAYS = {
  ecart: fn => `${fn.name.fr} : la copie de GFS n’est pas à la version de l’app, le CDN a servi.`,
  echec: fn => `${fn.name.fr} : la copie de GFS n’a pas pu se charger, le CDN a servi.`,
};

// Ce qui est posé dans chaque page : les phrases que l'app dit à la page (`pp:nativeFallback`), lues avant tout autre script.
// `__native(id)` lit GfsLink.native(id) sans planter sur un code qui ne l'a pas (« absent » : le même essai sert à mesurer l'ancien code).
const TRACK = 'window.__fallbacks = []; document.addEventListener("pp:nativeFallback", e => window.__fallbacks.push(e.detail));'
  + ' window.__native = id => (typeof GfsLink !== "undefined" && typeof GfsLink.native === "function" ? GfsLink.native(id) : "absent");';
// Les fichiers que GFS sert : le miroir, avec l'en-tête CORS qu'exige un sous-cadre à origine opaque ; les phrases de refus du navigateur (« Failed to find a valid digest in the 'integrity' attribute… ») sont gardées.
const refusals = [];
const serve = async (page) => {
  page.on('console', (message) => { if (/integrity/i.test(message.text())) refusals.push(message.text()); });
  await page.route('**/__gfs-copie/**', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[2];
    if (!ALL.includes(id)) { await route.fulfill({ status: 404, body: '' }); return; }
    await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: bytesOf(id) });
  });
};
const open = async ({ natives, hosted = true, framed = null, lang = 'fr', extra = {} } = {}) => {
  refusals.length = 0;
  const page = await t.openPage(Object.assign({ hosted, seed: seedModels(), stub: natives === undefined ? null : { natives }, init: TRACK, before: serve, realIntegrity: true, lang }, framed ? { framed, bypassCSP: false } : {}, extra));
  return page;
};

// Appelle le chargeur de la fonction `fn` et rend ce que le navigateur a demandé pendant ce temps (par bibliothèque : la copie de GFS, le CDN), ce que la bibliothèque a posé, les phrases dites à la page, le coin d'état.
async function exercise(opened, fn) {
  const { app, requests } = opened;
  const before = requests.length;
  const fallbacksBefore = await app.evaluate(() => window.__fallbacks.length);
  const error = await fn.run(app);
  const made = requests.slice(before);
  const fallbacks = (await app.evaluate(() => window.__fallbacks)).slice(fallbacksBefore);
  const defined = await app.evaluate(names => names.map(name => typeof window[name]), fn.globals);
  const status = await app.evaluate(() => document.getElementById('status-msg').textContent);
  const integrity = await app.evaluate(() => window.__integrity);
  const per = Object.fromEntries(fn.libs.map(id => [id, { copy: made.filter(url => url === copyUrl(id)).length, cdn: made.filter(url => url === cdnOf(id).src).length }]));
  return { error, per, defined, fallbacks, status, integrity, made };
}
const loaded = r => r.error === null && r.defined.every(kind => kind !== 'undefined');
const integrityOf = (r, src) => (r.integrity.find(item => item.src === src) || null);

async function scenarioA(label, opened, tag) {
  for (const fn of FUNCTIONS) {
    const r = await exercise(opened, fn);
    const copies = fn.libs.every(id => r.per[id].copy === 1 && r.per[id].cdn === 0);
    const sri = fn.libs.every(id => { const got = integrityOf(r, copyUrl(id)); return got && got.integrity === copyOf(id).integrite && got.enforced === true; });
    check(`${tag} ${fn.id} : ${label} : le navigateur demande la copie de GFS de chaque bibliothèque (${fn.libs.join(', ')}), jamais son CDN`, copies, JSON.stringify(r.per));
    check(`${tag} ${fn.id} : la copie se charge avec l'empreinte que GFS donne (vraie : le navigateur la vérifie), la bibliothèque marche et rien n'est dit`, sri && loaded(r) && r.fallbacks.length === 0 && !/GFS/.test(r.status), JSON.stringify({ error: r.error, defined: r.defined, fallbacks: r.fallbacks, status: r.status }));
  }
  check(`${tag} le navigateur n'a refusé aucune empreinte`, refusals.length === 0, refusals);
}
async function scenarioB(label, opened, tag) {
  for (const fn of FUNCTIONS) {
    const r = await exercise(opened, fn);
    const cdn = fn.libs.every(id => r.per[id].cdn === 1 && r.per[id].copy === 0);
    const sri = fn.libs.every(id => { const got = integrityOf(r, cdnOf(id).src); return got && got.integrity === cdnOf(id).integrity; });
    check(`${tag} ${fn.id} : ${label} : le navigateur demande le CDN de l'app pour chaque bibliothèque (${fn.libs.join(', ')}), jamais une copie de GFS`, cdn, JSON.stringify(r.per));
    check(`${tag} ${fn.id} : le CDN se charge avec l'empreinte du catalogue, la bibliothèque marche et rien n'est dit`, sri && loaded(r) && r.fallbacks.length === 0 && !/GFS/.test(r.status), JSON.stringify({ error: r.error, defined: r.defined, fallbacks: r.fallbacks, status: r.status }));
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
console.log('\nA) La personne a mis les sept fonctions en « copie figée » : chaque bibliothèque vient de la copie de GFS, avec son empreinte');
{
  const opened = await open({ natives: allCopies() });
  const ask = await opened.app.evaluate(() => ({ pdfLib: __native('pdf-lib'), none: __native('inconnue') }));
  check('A) GfsLink.native(id) rend la copie du contexte ({ version, src, integrite, forme }) et null pour ce que GFS ne donne pas', ask.pdfLib && ask.pdfLib.version === versionOf('pdf-lib') && ask.pdfLib.src === copyUrl('pdf-lib') && ask.pdfLib.integrite === copyOf('pdf-lib').integrite && ask.pdfLib.forme === 'script' && ask.none === null, JSON.stringify(ask));
  await scenarioA('une copie de chaque bibliothèque à la version de la liste', opened, 'A)');
  await opened.context.close();
}

console.log('\nB) La personne a laissé les fonctions au CDN (le défaut), ou l\'app est seule : chaque bibliothèque vient de son CDN');
{
  const opened = await open({ natives: {} });
  await scenarioB('`natives` vaut {}', opened, 'B)');
  await opened.context.close();
  const old = await open({ natives: undefined });
  const native = await old.app.evaluate(() => __native('pdf-lib'));
  check('B) un GFS d\'avant la 065 (aucun `natives` dans le contexte) : GfsLink.native rend null', native === null, native);
  await old.context.close();
  const alone = await open({ hosted: false, natives: undefined });
  const aloneNative = await alone.app.evaluate(() => ({ hosted: GfsLink.hosted, native: __native('pdf-lib') }));
  check('B) l\'app seule (sans `gfs=` dans son adresse) : pas hébergée, GfsLink.native rend null', aloneNative.hosted === false && aloneNative.native === null, aloneNative);
  await scenarioB('l\'app seule', alone, 'B seule)');
  await alone.context.close();
}

console.log('\nC) La personne a choisi la copie, mais elle ne convient pas : tout par le CDN, et le coin d\'état le dit');
{
  // Chaque copie d'une autre version que la liste.
  const opened = await open({ natives: allCopies({ version: '0.0.1' }) });
  for (const fn of FUNCTIONS) {
    const r = await exercise(opened, fn);
    const cdn = fn.libs.every(id => r.per[id].cdn === 1 && r.per[id].copy === 0);
    check(`C) ${fn.id} : des copies d'une autre version que la liste : le navigateur ne demande aucune copie de GFS, seulement le CDN de chaque bibliothèque (jamais une version que la liste n'a pas)`, cdn && loaded(r), JSON.stringify({ per: r.per, error: r.error, defined: r.defined }));
    check(`C) ${fn.id} : la page le sait (une phrase, raison « ecart ») et le coin d'état la dit en tête`, r.fallbacks.length >= 1 && r.fallbacks.every(item => item.fonction === fn.id && item.raison === 'ecart') && r.status.startsWith(SAYS.ecart(fn)), JSON.stringify({ fallbacks: r.fallbacks, status: r.status }));
  }
  await opened.context.close();
  // Une seule bibliothèque de la fonction a sa copie (pdfmake sans ses polices, docx-charts sans docx) : tout au CDN, pour les deux.
  const partial = await open({ natives: { pdfmake: copyOf('pdfmake'), 'docx-charts': copyOf('docx-charts') } });
  for (const fn of FUNCTIONS.filter(item => item.libs.length === 2)) {
    const r = await exercise(partial, fn);
    const cdn = fn.libs.every(id => r.per[id].cdn === 1 && r.per[id].copy === 0);
    check(`C) ${fn.id} : seule une des deux bibliothèques a sa copie : tout par le CDN, aucune copie demandée (la fonction se choisit en entier)`, cdn && loaded(r) && r.fallbacks.length >= 1 && r.fallbacks.every(item => item.raison === 'ecart') && r.status.startsWith(SAYS.ecart(fn)), JSON.stringify({ per: r.per, fallbacks: r.fallbacks, status: r.status }));
  }
  const rest = FUNCTIONS.filter(item => item.libs.length === 1);
  for (const fn of rest) {
    const r = await exercise(partial, fn);
    check(`C) ${fn.id} : sans copie parmi les bibliothèques données, le CDN, sans rien dire`, fn.libs.every(id => r.per[id].cdn === 1 && r.per[id].copy === 0) && loaded(r) && r.fallbacks.length === 0, JSON.stringify({ per: r.per, fallbacks: r.fallbacks }));
  }
  await partial.context.close();
}

console.log('\nD) Une copie dont l\'empreinte est fausse : le navigateur la refuse, le CDN la remplace, et le coin d\'état le dit');
{
  const opened = await open({ natives: allCopies({ integrite: WRONG }) });
  for (const fn of FUNCTIONS) {
    refusals.length = 0;
    const r = await exercise(opened, fn);
    // Les fichiers d'un même appel suivent le CDN dès que la première copie a échoué (pdfmake, puis ses polices) ; docx et docx-charts sont deux appels.
    const first = fn.libs[0];
    const tried = fn.id === 'pdf' ? [first] : fn.libs;
    const copiesTried = tried.every(id => r.per[id].copy === 1) && fn.libs.filter(id => !tried.includes(id)).every(id => r.per[id].copy === 0);
    const cdn = fn.libs.every(id => r.per[id].cdn === 1);
    const refused = tried.every(id => refusals.some(text => text.includes(copyUrl(id))));
    check(`D) ${fn.id} : la copie est demandée à GFS avec une fausse empreinte : le NAVIGATEUR la refuse (sa phrase de refus est dans la console, pour ${tried.join(', ')})`, copiesTried && refused, JSON.stringify({ per: r.per, refused: refusals.map(text => text.slice(0, 120)) }));
    check(`D) ${fn.id} : le CDN de chaque bibliothèque la remplace, la bibliothèque marche`, cdn && loaded(r), JSON.stringify({ per: r.per, error: r.error, defined: r.defined }));
    check(`D) ${fn.id} : la page le sait (raison « echec », une fois par appel de chargement) et le coin d'état le dit en tête, jamais en silence`,
      r.fallbacks.length === tried.length && r.fallbacks.every((item, at) => item.fonction === fn.id && item.raison === 'echec' && item.bibliotheque === tried[at]) && r.status.startsWith(SAYS.echec(fn)), JSON.stringify({ fallbacks: r.fallbacks, status: r.status }));
  }
  // Le coin d'état garde la phrase en tête des états qui suivent (un export écrit les siens après le chargement), puis la lâche.
  const note = SAYS.echec(FUNCTIONS[FUNCTIONS.length - 1]);
  const star = await opened.app.evaluate(() => {
    const id = Templates.getCurrentId();
    const name = Templates.byId(id).nom;
    return { expected: I18n.t(Templates.isDefault(id) ? 'status.defaultTemplateCleared' : 'status.defaultTemplateSet', { name }), name };
  });
  await opened.app.click('#btn-set-default-template');
  await sleep(500);
  const after = await opened.app.evaluate(() => document.getElementById('status-msg').textContent);
  check('D) le coin d\'état garde la phrase en tête de l\'état que l\'app écrit ensuite (ici « modèle par défaut »)', after === note + ' ' + star.expected, JSON.stringify({ after, expected: note + ' ' + star.expected }));
  await opened.app.evaluate(() => { const now = Date.now.bind(Date); Date.now = () => now() + 25000; });
  const second = await opened.app.evaluate(() => ({ id: Templates.getCurrentId() }));
  const secondExpected = await opened.app.evaluate(({ id }) => I18n.t(Templates.isDefault(id) ? 'status.defaultTemplateCleared' : 'status.defaultTemplateSet', { name: Templates.byId(id).nom }), second);
  await opened.app.click('#btn-set-default-template');
  await sleep(500);
  const expired = await opened.app.evaluate(() => document.getElementById('status-msg').textContent);
  check('D) vingt secondes plus tard, la phrase est lâchée : le coin d\'état n\'a plus que l\'état de l\'app', expired === secondExpected, JSON.stringify({ expired, secondExpected }));
  await opened.context.close();
  // En anglais : la phrase et le nom de la fonction suivent la langue.
  const en = await open({ natives: allCopies({ integrite: WRONG }), lang: 'en' });
  const qr = FUNCTIONS.find(item => item.id === 'qr');
  const word = FUNCTIONS.find(item => item.id === 'word');
  const rQr = await exercise(en, qr);
  check('D) en anglais : « QR code: GFS’s copy failed to load, the CDN was used. »', rQr.status.startsWith('QR code: GFS’s copy failed to load, the CDN was used.'), rQr.status);
  const rWord = await exercise(en, word);
  check('D) en anglais, « Word and charts: GFS’s copy failed to load, the CDN was used. » (la phrase la plus récente passe devant)', rWord.status.startsWith('Word and charts: GFS’s copy failed to load, the CDN was used.') && !rWord.status.includes('QR code'), rWord.status);
  await en.context.close();
  // Version différente en anglais.
  const enGap = await open({ natives: allCopies({ version: '0.0.1' }), lang: 'en' });
  const rGap = await exercise(enGap, FUNCTIONS.find(item => item.id === 'excel'));
  check('D) en anglais, une autre version : « Excel export: GFS’s copy is not the app’s version, the CDN was used. »', rGap.status.startsWith('Excel export: GFS’s copy is not the app’s version, the CDN was used.'), rGap.status);
  await enGap.context.close();
}

console.log('\nE) Un choix qui change en cours de route : ce qui est chargé reste, le nouveau choix vaut au chargement suivant, sans recharger la page');
{
  const opened = await open({ natives: {} });
  const markdown = FUNCTIONS.find(item => item.id === 'markdown');
  const qr = FUNCTIONS.find(item => item.id === 'qr');
  const excel = FUNCTIONS.find(item => item.id === 'excel');
  const pdfMerge = FUNCTIONS.find(item => item.id === 'pdf-assemblage');
  const zip = FUNCTIONS.find(item => item.id === 'zip');
  const marker = await opened.app.evaluate(() => { window.__sameDocument = 'oui'; return performance.timeOrigin; });
  const first = await exercise(opened, markdown);
  check('E) au CDN : marked vient du CDN', first.per.marked.cdn === 1 && first.per.marked.copy === 0 && loaded(first), JSON.stringify(first.per));
  await opened.page.evaluate(copies => window.__gfsStub.setNatives(copies), allCopies());
  await sleep(300);
  const ask = await opened.app.evaluate(() => ({ now: __native('qrcode-generator'), pdfmake: __native('pdfmake') }));
  check('E) l\'événement `extensions` change GfsLink.native sans recharger la page (même document, mêmes globaux)', ask.now && ask.now.src === copyUrl('qrcode-generator') && await opened.app.evaluate(() => window.__sameDocument === 'oui' && typeof window.marked !== 'undefined'), JSON.stringify(ask));
  const again = await exercise(opened, markdown);
  check('E) marked est déjà chargé : l\'appel suivant ne demande plus rien (le nouveau choix ne recharge pas ce qui est là)', again.made.length === 0 && loaded(again), JSON.stringify(again.made));
  const second = await exercise(opened, qr);
  check('E) en copie figée : qrcode-generator, pas encore chargé, vient de la copie de GFS (le nouveau choix vaut au chargement suivant)', second.per['qrcode-generator'].copy === 1 && second.per['qrcode-generator'].cdn === 0 && loaded(second) && second.fallbacks.length === 0, JSON.stringify(second.per));
  await opened.page.evaluate(() => window.__gfsStub.setNatives({}));
  await sleep(300);
  const third = await exercise(opened, excel);
  check('E) de nouveau au CDN : exceljs vient du CDN', third.per.exceljs.cdn === 1 && third.per.exceljs.copy === 0 && loaded(third) && third.fallbacks.length === 0, JSON.stringify(third.per));
  const loadedStill = await opened.app.evaluate(() => ({ qrcode: typeof window.qrcode, marked: typeof window.marked, same: window.__sameDocument }));
  check('E) ce qui était chargé par la copie reste là quand la personne repasse au CDN (qrcode-generator), et la page est la même', loadedStill.qrcode !== 'undefined' && loadedStill.marked !== 'undefined' && loadedStill.same === 'oui', JSON.stringify(loadedStill));
  // Une fonction chargée par la copie, puis le choix « CDN » : l'appel suivant du même chargeur ne redemande rien.
  await opened.page.evaluate(copies => window.__gfsStub.setNatives(copies), allCopies());
  await sleep(300);
  const zipCopy = await exercise(opened, zip);
  await opened.page.evaluate(() => window.__gfsStub.setNatives({}));
  await sleep(300);
  const zipAgain = await exercise(opened, zip);
  check('E) jszip chargé par la copie : après le retour au CDN, l\'appel du chargeur ne demande plus rien (une promesse par bibliothèque et par page)', zipCopy.per.jszip.copy === 1 && zipAgain.made.length === 0 && loaded(zipAgain), JSON.stringify({ zipCopy: zipCopy.per, again: zipAgain.made }));
  const merge = await exercise(opened, pdfMerge);
  check('E) pdf-lib, chargé après le retour au CDN, vient du CDN', merge.per['pdf-lib'].cdn === 1 && merge.per['pdf-lib'].copy === 0 && loaded(merge), JSON.stringify(merge.per));
  check('E) le coin d\'état n\'a rien dit pendant ces changements de choix', !(await opened.app.evaluate(() => /GFS/.test(document.getElementById('status-msg').textContent))), '');
  await opened.context.close();
  void marker;
}

console.log('\nF) Dans le cadre isolé de GFS (sans allow-same-origin, origine opaque, politique de sécurité de la page respectée)');
{
  const framed = { csp: "frame-src 'self'" };
  const copies = await open({ natives: allCopies(), framed });
  const origin = await copies.app.evaluate(() => ({ origin: window.origin, location: window.location.origin, csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]') }));
  check('F) l\'app est bien dans un cadre à origine opaque (window.origin « null »), sa politique de sécurité est celle de la page', origin.origin === 'null' && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin.location) && origin.csp, JSON.stringify(origin));
  await scenarioA('cadre isolé, une copie de chaque bibliothèque (`script-src \'self\'` suffit)', copies, 'F)');
  await copies.context.close();
  const wrong = await open({ natives: allCopies({ integrite: WRONG }), framed });
  for (const fn of FUNCTIONS) {
    refusals.length = 0;
    const r = await exercise(wrong, fn);
    const refused = refusals.some(text => text.includes(copyUrl(fn.libs[0])));
    check(`F) ${fn.id} : fausse empreinte : le navigateur du cadre refuse la copie, le CDN la remplace, la bibliothèque marche, le coin d'état le dit`, refused && fn.libs.every(id => r.per[id].cdn === 1) && loaded(r) && r.fallbacks.length >= 1 && r.status.startsWith(SAYS.echec(fn)), JSON.stringify({ per: r.per, refused, fallbacks: r.fallbacks, status: r.status.slice(0, 120) }));
  }
  await wrong.context.close();
}

console.log('\nG) La lecture de `natives` : une entrée incomplète ou illisible est écartée, un changement de copie seul rappelle l\'abonné');
{
  const good = copyOf('pdf-lib');
  const natives = {
    'pdf-lib': good,
    'jszip': { version: versionOf('jszip'), src: copyUrl('jszip'), forme: 'script' },                                              // sans empreinte
    'marked': { version: versionOf('marked'), src: copyUrl('marked'), integrite: 'md5-abcdef==', forme: 'script' },                // un autre algorithme
    'Excel': copyOf('exceljs'),                                                                                                      // un nom illisible (majuscule)
    'qrcode-generator': Object.assign(copyOf('qrcode-generator'), { version: 5 }),                                                   // une version qui n'est pas un texte
    'exceljs': Object.assign(copyOf('exceljs'), { forme: 'inconnue' }),                                                              // une forme inconnue : `script`
    'docx': Object.assign(copyOf('docx'), { forme: 'module' }),                                                                      // `module` est gardée telle quelle
    'docx-charts': Object.assign(copyOf('docx-charts'), { src: '' }),                                                                // sans adresse
    'pdfmake': 'pas un objet',
  };
  const opened = await open({ natives });
  const read = await opened.app.evaluate(() => Object.fromEntries(['pdf-lib', 'jszip', 'marked', 'Excel', 'qrcode-generator', 'exceljs', 'docx', 'docx-charts', 'pdfmake'].map(id => [id, __native(id)])));
  check('G) l\'entrée complète est gardée telle que GFS la donne', JSON.stringify(read['pdf-lib']) === JSON.stringify(good), JSON.stringify(read['pdf-lib']));
  check('G) sans empreinte, d\'un autre algorithme, au nom illisible, sans adresse, avec une version qui n\'est pas un texte, ou qui n\'est pas un objet : écartée (null)', ['jszip', 'marked', 'Excel', 'qrcode-generator', 'docx-charts', 'pdfmake'].every(id => read[id] === null), JSON.stringify(read));
  check('G) une forme inconnue vaut « script », « module » est gardée', read.exceljs && read.exceljs.forme === 'script' && read.docx && read.docx.forme === 'module', JSON.stringify({ exceljs: read.exceljs, docx: read.docx && read.docx.forme }));
  const mutated = await opened.app.evaluate(() => { const copy = __native('pdf-lib'); if (copy && typeof copy === 'object') { copy.version = 'x'; copy.src = 'y'; } return __native('pdf-lib'); });
  check('G) GfsLink.native rend une copie : la changer ne change pas ce que l\'app a lu', JSON.stringify(mutated) === JSON.stringify(good), JSON.stringify(mutated));
  const asModule = await exercise(opened, FUNCTIONS.find(item => item.id === 'word'));
  check('G) la copie de docx de forme « module » ne sert pas (un script classique est attendu) : tout par le CDN, et le coin d\'état le dit', asModule.per.docx.cdn === 1 && asModule.per.docx.copy === 0 && asModule.fallbacks.length >= 1 && asModule.fallbacks[0].raison === 'ecart' && loaded(asModule), JSON.stringify({ per: asModule.per, fallbacks: asModule.fallbacks }));
  await opened.app.evaluate(() => { window.__changes = 0; GfsLink.onChange(() => { window.__changes += 1; }); });
  const send = async (next) => { await opened.page.evaluate(value => window.__gfsStub.setNatives(value), next); await sleep(200); return opened.app.evaluate(() => window.__changes); };
  const same = await send(natives);                                                                                                 // le même message qu'au chargement : rien ne change
  const ignored = await send(Object.assign({}, natives, { jszip: 'autre chose', marked: { version: 'x' } }));                           // seules des entrées écartées changent : rien ne change pour l'app
  const changed = await send(Object.assign({}, natives, { 'pdf-lib': copyOf('pdf-lib', { version: '9.9.9' }) }));                     // une copie change : une fois
  const again = await send(Object.assign({}, natives, { 'pdf-lib': copyOf('pdf-lib', { version: '9.9.9' }) }));                       // le même message de nouveau : rien
  const cleared = await send({});                                                                                                  // tout repasse au CDN : une fois de plus
  const none = await opened.app.evaluate(() => __native('pdf-lib'));
  check('G) l\'abonné de `GfsLink.onChange` n\'est pas rappelé quand rien ne change (même message, ou seules des entrées écartées), l\'est UNE fois quand une copie change, et une fois de plus quand tout repasse au CDN', same === 0 && ignored === 0 && changed === 1 && again === 1 && cleared === 2 && none === null, JSON.stringify({ same, ignored, changed, again, cleared, none }));
  await opened.context.close();
}

await t.finish();
