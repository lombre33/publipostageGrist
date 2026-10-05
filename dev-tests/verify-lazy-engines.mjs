#!/usr/bin/env node
// Chargement paresseux des moteurs d'export (js/export-engines.js) dans un VRAI navigateur, à la taille du panneau d'Antoine (700x400), chaque scénario dans une page neuve (un moteur
// chargé le reste : deux exports dans la même page ne prouveraient rien du second). Le widget est celui d'index.html, avec le faux Grist de dev-tests/grist-stub.js et le miroir hors ligne
// des CDN (dev-tests/load-lib.mjs) ; les exports se lancent à la vraie souris et les fichiers téléchargés sont relus (en-tête PDF, entrées d'un ZIP, feuille d'un classeur).
//   - à l'ouverture : aucune des six adresses des moteurs n'est demandée (PdfExport, PdfMerge, SheetLayout, DocxExport, XlsxExport et XlsxNumberFormat n'existent pas) et rien ne les
//     charge ensuite tout seul ; les six balises inertes de index.html portent chacune leur version de cache ;
//   - ExportEngines : deux demandes d'un même moteur en même temps ne le chargent qu'une fois, une de plus ne fait aucune requête, un nom inconnu est refusé, une liste de noms marche,
//     `loadAll` charge les six, chacun une fois ; un chargement qui échoue (réseau coupé) est repris à l'appel suivant ;
//   - chaque export ne charge que ses moteurs, une fois, et produit son fichier : PDF, Word et Excel d'une ligne ; ZIP de PDF, PDF unique (+ fusion), assemblage (+ fusion et feuilles),
//     ZIP de Word, ZIP d'Excel, classeur Excel unique ; l'import d'un classeur dans une grille (+ format des nombres) ;
//   - un moteur qui ne se charge pas arrête l'export avec son message, sans fichier ni fenêtre de confirmation ; réseau revenu, le même geste aboutit : une ligne et un lot.
// Lancé par run-headless.mjs (groupe Node « lazyEngines », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-lazy-engines.mjs
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { open, stopServer, sleep, click, clickHoverRow, fire, status, downloadOf, exportBatchOf, ROOT } from './load-lib.mjs';

const PORT = Number(process.env.LAZY_ENGINES_PORT || 8984);
const require = createRequire(import.meta.url);
const JSZip = require(join(ROOT, 'dev-tests', '.offline-cache', 'umd', 'jszip.min.js'));
const ExcelJS = require(join(ROOT, 'dev-tests', '.offline-cache', 'umd', 'exceljs.min.js'));

// Les six moteurs : leur nom dans index.html (data-engine), leur fichier, leur variable globale.
const ENGINES = {
  pdf: { file: 'pdf-export', global: 'PdfExport' },
  sheets: { file: 'sheet-layout', global: 'SheetLayout' },
  merge: { file: 'pdf-merge', global: 'PdfMerge' },
  docx: { file: 'docx-export', global: 'DocxExport' },
  xlsx: { file: 'xlsx-export', global: 'XlsxExport' },
  xlsxFormat: { file: 'xlsx-number-format', global: 'XlsxNumberFormat' },
};
const NAMES = Object.keys(ENGINES);
const ENGINE_OF_FILE = Object.fromEntries(NAMES.map(name => [ENGINES[name].file, name]));
const ROWS = 3;
const SPEC = { tables: [{ id: 'PbClients', rows: ROWS, columns: [{ id: 'Nom', type: 'Text' }] }] };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// Une page neuve : `requests` note chaque script de moteur demandé au réseau, dès le chargement de la page ; `loaded()` dit lesquels existent comme variables.
async function scenario(title, fn) {
  console.log('\n' + title);
  const requests = [];
  let w = null;
  try {
    w = await open({
      spec: SPEC, port: PORT, settleMs: 1200,
      onPage: page => page.on('request', request => {
        const match = request.url().match(/\/js\/([a-z-]+)\.js(\?|$)/);
        if (match && ENGINE_OF_FILE[match[1]]) requests.push(ENGINE_OF_FILE[match[1]]);
      }),
    });
    const loaded = () => w.page.evaluate(globals => globals.filter(([, name]) => new Function('return typeof ' + name)() !== 'undefined').map(([engine]) => engine), NAMES.map(name => [name, ENGINES[name].global]));
    await fn({ w, page: w.page, requests, loaded });
  } catch (e) {
    check(title + ' : le scénario va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
  } finally {
    if (w) await w.close();
  }
}
// Les scripts de moteur demandés, exactement ceux que le scénario attend : ni plus (rien ne charge ce qu'il n'utilise pas), ni moins, chacun une fois.
function expectEngines(label, requests, loadedNow, expected) {
  check(`${label} : le réseau ne reçoit que ${expected.map(name => ENGINES[name].file + '.js').join(' et ')}, une seule fois chacun`, same(requests, expected), requests);
  check(`${label} : parmi les six moteurs, seuls existent ${expected.map(name => ENGINES[name].global).join(', ')}`, same(loadedNow, expected), loadedNow);
}

const bytesOf = file => readFile(file);
// Les fichiers téléchargés vont dans le dossier commun des bancs (LOAD_OUT) : un nom par exécution (pid), pour que deux exécutions du banc en même temps ne s'écrasent pas, et ils sont
// retirés à la fin.
const written = [];
const saved = async download => { const out = await download; written.push(out.file); return out; };
// Une fenêtre du widget ouverte (les voiles de js/modal-base.js : classe pp-modal, ouverts et fermés par leur `display`).
const modalOpen = page => page.evaluate(() => Array.from(document.querySelectorAll('.pp-modal')).some(modal => getComputedStyle(modal).display !== 'none'));
const startsWith = (bytes, text) => Buffer.from(bytes.subarray(0, text.length)).toString('latin1') === text;
const zipEntries = async file => Object.keys((await JSZip.loadAsync(await bytesOf(file))).files).filter(name => !name.endsWith('/'));
// Un document que les exports reconnaissent : une ligne courante et un texte ; une grille pour les exports Excel (« + », « Nouvelle grille » à la vraie souris).
async function prepare(page, { grid = false } = {}) {
  if (grid) { await clickHoverRow(page, '#v2-new-template-group', '#v2-btn-new-grid'); await sleep(500); }
  else await page.evaluate(() => Editor.setHTML('<p>Bonjour</p>'));
  await fire(page, 'PbClients', 1);
}
// « Exporter » d'une ligne : le bouton PDF, ou la ligne Word ou Excel du menu « Qualité ».
const SINGLE = {
  pdf: { rows: null, button: '#btn-export-pdf' },
  docx: { rows: ['#v2-btn-quality', '#v2-btn-export-docx'] },
  xlsx: { rows: ['#v2-btn-quality', '#v2-btn-export-xlsx'] },
};
// Un export de trois lignes prend quelques secondes : au-delà de DELAY, c'est qu'il n'aboutit pas (le test échoue au lieu d'attendre dix minutes).
const DELAY = 45000;
const exportSingle = (page, kind, name, timeout = DELAY) => saved(downloadOf(page, `lazy-${process.pid}-${name}`, async () => {
  const { rows, button } = SINGLE[kind];
  if (rows) await clickHoverRow(page, rows[0], rows[1]); else await click(page, button);
}, timeout));
const exportBatch = (page, kind, name) => saved(exportBatchOf(page, kind, `lazy-${process.pid}-${name}`, { timeout: DELAY }));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
await scenario('Ouverture : aucun moteur n\'est chargé', async ({ w, page, requests, loaded }) => {
  await sleep(1500);
  check('ouverture : aucun des six scripts de moteur n\'est demandé au réseau', requests.length === 0, requests);
  check('ouverture : aucun des six moteurs n\'existe (PdfExport, PdfMerge, SheetLayout, DocxExport, XlsxExport, XlsxNumberFormat)', (await loaded()).length === 0, await loaded());
  check('ouverture : ExportEngines existe, avec ensure et loadAll', await page.evaluate(() => typeof ExportEngines === 'object' && typeof ExportEngines.ensure === 'function' && typeof ExportEngines.loadAll === 'function'));
  const tags = await page.evaluate(() => Array.from(document.querySelectorAll('script[type="text/x-lazy-engine"]'), tag => [tag.dataset.engine, tag.getAttribute('src')]));
  check('index.html : six balises inertes, une par moteur, chacune vers son fichier et avec une version de cache (?v=)',
    tags.length === 6 && NAMES.every(name => tags.filter(([engine, src]) => engine === name && new RegExp('^js/' + ENGINES[name].file + '\\.js\\?v=\\d+(\\.\\d+)*$').test(src)).length === 1), tags);
  check('ouverture : les boutons d\'export existent et sont prêts (le clic ne dépend d\'aucun moteur chargé)', await page.evaluate(() => ['btn-export-pdf', 'v2-btn-export-pdf-batch', 'v2-btn-export-docx', 'v2-btn-export-xlsx-batch'].every(id => !!document.getElementById(id))));
  check('ouverture : aucune erreur de page', w.errors.length === 0, w.errors);

});

await scenario('ExportEngines : une demande, deux demandes, une liste, tout', async ({ w, page, requests, loaded }) => {
  const twice = await page.evaluate(async () => { const a = ExportEngines.ensure('pdf'); const b = ExportEngines.ensure('pdf'); await Promise.all([a, b]); return typeof PdfExport; });
  check('deux demandes du même moteur au même instant : un seul chargement', twice === 'object' && same(requests, ['pdf']), { twice, requests });
  const before = requests.length;
  await page.evaluate(() => ExportEngines.ensure('pdf'));
  await page.evaluate(() => ExportEngines.ensure('pdf', 'pdf'));
  check('une demande de plus du même moteur déjà là : aucune requête', requests.length === before, requests);
  check('seul le moteur PDF existe', same(await loaded(), ['pdf']), await loaded());
  const unknown = await page.evaluate(() => ExportEngines.ensure('nulpart').then(() => 'ok', e => e.message));
  check('un nom de moteur inconnu est refusé, avec ce nom dans le message', unknown !== 'ok' && /nulpart/.test(unknown) && requests.length === 1, { unknown, requests });
  await page.evaluate(() => ExportEngines.ensure(['merge', 'sheets']));
  check('une liste de noms charge chacun d\'eux (fusion, feuilles)', same(await loaded(), ['pdf', 'merge', 'sheets']) && same(requests, ['pdf', 'merge', 'sheets']), { loaded: await loaded(), requests });
  check('ensure() sans nom se résout sans rien charger', (await page.evaluate(() => ExportEngines.ensure().then(() => 'ok', e => e.message))) === 'ok' && requests.length === 3, requests);
  await page.evaluate(() => ExportEngines.loadAll());
  check('loadAll charge les trois qui manquaient (Word, Excel, format des nombres), les six ne sont demandés qu\'une fois chacun', same(await loaded(), NAMES) && same(requests, NAMES), { loaded: await loaded(), requests });
  await page.evaluate(() => ExportEngines.loadAll());
  check('un second loadAll ne fait aucune requête', requests.length === 6, requests);
  check('aucune erreur de page', w.errors.length === 0, w.errors);
});

await scenario('Un moteur qui ne se charge pas (réseau coupé), puis le réseau revient', async ({ w, page, requests, loaded }) => {
  await page.route('**/js/sheet-layout.js*', route => route.abort());
  const refused = await page.evaluate(() => ExportEngines.ensure('sheets').then(() => 'ok', e => e.message));
  check('le moteur qui échoue : l\'appel est refusé et le message nomme le script', /sheet-layout\.js/.test(refused) && refused !== 'ok', refused);
  check('rien n\'existe après l\'échec : SheetLayout reste indéfini', (await loaded()).length === 0, await loaded());
  await page.unroute('**/js/sheet-layout.js*');
  await page.evaluate(() => ExportEngines.ensure('sheets'));
  check('le réseau revenu, la même demande aboutit : SheetLayout existe, deux requêtes en tout (l\'échec, puis la reprise)', same(await loaded(), ['sheets']) && same(requests, ['sheets', 'sheets']), { loaded: await loaded(), requests });
  void w;
});

// ---- Un export d'une ligne, un moteur ----
await scenario('PDF d\'une ligne : le moteur PDF seul', async ({ w, page, requests, loaded }) => {
  await prepare(page);
  const out = await exportSingle(page, 'pdf', 'pdf');
  check('PDF d\'une ligne : le fichier est un PDF (en-tête %PDF-, nom en .pdf)', startsWith(await bytesOf(out.file), '%PDF-') && /\.pdf$/.test(out.suggested) && out.size > 1000, out);
  expectEngines('PDF d\'une ligne', requests, await loaded(), ['pdf']);
  check('PDF d\'une ligne : aucune erreur de page', w.errors.length === 0, w.errors);
});
await scenario('Word d\'une ligne : le moteur Word seul', async ({ w, page, requests, loaded }) => {
  await prepare(page);
  const out = await exportSingle(page, 'docx', 'docx');
  const entries = await zipEntries(out.file);
  check('Word d\'une ligne : le fichier est un .docx (zip avec word/document.xml)', /\.docx$/.test(out.suggested) && entries.includes('word/document.xml'), { suggested: out.suggested, entries: entries.slice(0, 6) });
  expectEngines('Word d\'une ligne', requests, await loaded(), ['docx']);
  check('Word d\'une ligne : aucune erreur de page', w.errors.length === 0, w.errors);
});
await scenario('Excel d\'une ligne : le moteur Excel seul', async ({ w, page, requests, loaded }) => {
  await prepare(page, { grid: true });
  const out = await exportSingle(page, 'xlsx', 'xlsx');
  const entries = await zipEntries(out.file);
  check('Excel d\'une ligne : le fichier est un .xlsx (zip avec xl/worksheets/sheet1.xml)', /\.xlsx$/.test(out.suggested) && entries.includes('xl/worksheets/sheet1.xml'), { suggested: out.suggested, entries: entries.slice(0, 8) });
  expectEngines('Excel d\'une ligne', requests, await loaded(), ['xlsx']);
  check('Excel d\'une ligne : aucune erreur de page', w.errors.length === 0, w.errors);
});

// ---- Un export en lot, ses moteurs ----
const BATCHES = [
  { kind: 'pdfZip', label: 'ZIP de PDF', engines: ['pdf'], grid: false, verify: async (out, label) => { const entries = await zipEntries(out.file); check(`${label} : l'archive porte ${ROWS} PDF`, /\.zip$/.test(out.suggested) && entries.length === ROWS && entries.every(n => /\.pdf$/.test(n)), { suggested: out.suggested, entries }); } },
  { kind: 'pdfMerged', label: 'PDF unique', engines: ['pdf', 'merge'], grid: false, verify: async (out, label) => { check(`${label} : un seul PDF, nommé -export.pdf`, startsWith(await bytesOf(out.file), '%PDF-') && /-export\.pdf$/.test(out.suggested) && out.size > 1000, out); } },
  { kind: 'pdfSheets', label: 'Assemblage avant impression', engines: ['pdf', 'merge', 'sheets'], grid: false, verify: async (out, label) => { check(`${label} : un PDF d'assemblage, nommé -assemblage.pdf`, startsWith(await bytesOf(out.file), '%PDF-') && /-assemblage\.pdf$/.test(out.suggested) && out.size > 1000, out); } },
  { kind: 'docxZip', label: 'ZIP de Word', engines: ['docx'], grid: false, verify: async (out, label) => { const entries = await zipEntries(out.file); check(`${label} : l'archive porte ${ROWS} documents Word`, /\.zip$/.test(out.suggested) && entries.length === ROWS && entries.every(n => /\.docx$/.test(n)), { suggested: out.suggested, entries }); } },
  { kind: 'xlsxZip', label: 'ZIP d\'Excel', engines: ['xlsx'], grid: true, verify: async (out, label) => { const entries = await zipEntries(out.file); check(`${label} : l'archive porte ${ROWS} classeurs`, /\.zip$/.test(out.suggested) && entries.length === ROWS && entries.every(n => /\.xlsx$/.test(n)), { suggested: out.suggested, entries }); } },
  { kind: 'xlsxSingle', label: 'Classeur Excel unique', engines: ['xlsx'], grid: true, verify: async (out, label) => { const entries = await zipEntries(out.file); check(`${label} : un classeur, nommé -export.xlsx`, /-export\.xlsx$/.test(out.suggested) && entries.includes('xl/worksheets/sheet1.xml'), { suggested: out.suggested, entries: entries.slice(0, 8) }); } },
];
for (const batch of BATCHES) {
  await scenario(`${batch.label} (lot) : ${batch.engines.map(name => ENGINES[name].file).join(', ')} seuls`, async ({ w, page, requests, loaded }) => {
    await prepare(page, { grid: batch.grid });
    const out = await exportBatch(page, batch.kind, batch.kind);
    await batch.verify(out, batch.label);
    expectEngines(batch.label, requests, await loaded(), batch.engines);
    check(`${batch.label} : aucune erreur de page`, w.errors.length === 0, w.errors);
  });
}

// ---- Import d'un classeur Excel dans une grille : Excel et le format des nombres ----
await scenario('Import d\'un classeur Excel : le moteur Excel et le format des nombres', async ({ w, page, requests, loaded }) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Feuille');
  sheet.addRow(['Nom', 'Montant']);
  sheet.addRow(['Alice', 12.5]);
  sheet.getCell('B2').numFmt = '0.00 "€"';
  const base64 = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
  check('import : rien n\'est chargé avant le choix du fichier', requests.length === 0 && (await loaded()).length === 0, { requests, loaded: await loaded() });
  const result = await page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const opened = await GridXlsxImport.openFile(new File([bytes], 'classeur.xlsx'));
    const built = opened.build(0, { lang: 'fr' });
    return { sheets: opened.sheets, sheetName: built.sheetName, rows: built.rows, cols: built.cols, html: built.html };
  }, base64);
  check('import : la feuille devient une grille de 2 lignes et 2 colonnes, avec « Alice » et le montant mis en forme (12,50 €, par le format des nombres d\'Excel)',
    result.sheetName === 'Feuille' && result.rows === 2 && result.cols === 2 && /Alice/.test(result.html) && /12,50/.test(result.html), { sheets: result.sheets, rows: result.rows, cols: result.cols, html: result.html.slice(0, 300) });
  expectEngines('import', requests, await loaded(), ['xlsx', 'xlsxFormat']);
  const notBook = await page.evaluate(async () => GridXlsxImport.openFile(new File([new Uint8Array([1, 2, 3, 4, 5, 6])], 'x.xlsx')).then(() => 'ok', e => e.code || e.message));
  check('import : un fichier qui n\'est pas un classeur reste un refus clair (« unreadable »), moteurs chargés ou non', notBook === 'unreadable', notBook);
  void w;
});

// ---- Un moteur qui ne se charge pas arrête l'export ; le réseau revenu, le même geste aboutit ----
await scenario('Export sans réseau pour un moteur, puis avec : une ligne et un lot', async ({ w, page, requests, loaded }) => {
  await prepare(page);
  await page.route('**/js/pdf-export.js*', route => route.abort());
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await click(page, '#btn-export-pdf');
  await sleep(2500);
  const expectedLine = await page.evaluate(() => I18n.t('status.pdfGenerationError'));
  check('PDF d\'une ligne, moteur injoignable : le message d\'erreur de l\'export s\'affiche, aucun fichier', (await status(page)) === expectedLine && downloads === 0, { status: await status(page), expectedLine, downloads });
  check('PDF d\'une ligne, moteur injoignable : PdfExport n\'existe pas, aucune fenêtre ne reste ouverte', (await loaded()).length === 0 && !(await modalOpen(page)), await loaded());
  await page.unroute('**/js/pdf-export.js*');
  const again = await exportSingle(page, 'pdf', 'pdf-reprise');
  check('PDF d\'une ligne, réseau revenu : le même clic produit le PDF', startsWith(await bytesOf(again.file), '%PDF-') && again.size > 1000, again);
  check('PDF d\'une ligne : deux requêtes pour le moteur PDF en tout (l\'échec, puis la reprise)', same(requests, ['pdf', 'pdf']) && same(await loaded(), ['pdf']), { requests, loaded: await loaded() });

  // Un lot : le moteur de fusion est injoignable. Le lot s'arrête avant sa fenêtre de confirmation.
  await page.route('**/js/pdf-merge.js*', route => route.abort());
  await clickHoverRow(page, '#btn-export-pdf', '#v2-btn-export-pdf-merged');
  await sleep(2500);
  const expectedBatch = await page.evaluate(() => I18n.t('status.pdfLibsLoadError'));
  const confirmOpen = await modalOpen(page);
  check('PDF unique, moteur de fusion injoignable : le message d\'erreur des bibliothèques s\'affiche, sans fenêtre de confirmation', (await status(page)) === expectedBatch && !confirmOpen && downloads === 1, { status: await status(page), expectedBatch, confirmOpen, downloads });
  await page.unroute('**/js/pdf-merge.js*');
  const merged = await exportBatch(page, 'pdfMerged', 'merged-reprise');
  check('PDF unique, réseau revenu : le même geste produit le PDF unique', startsWith(await bytesOf(merged.file), '%PDF-') && /-export\.pdf$/.test(merged.suggested) && merged.size > 1000, merged);
  check('PDF unique : deux requêtes pour le moteur PDF (l\'échec du premier clic, puis la reprise) et deux pour la fusion (l\'échec du lot, puis la reprise), rien d\'autre', same(requests, ['pdf', 'pdf', 'merge', 'merge']) && same(await loaded(), ['pdf', 'merge']), { requests, loaded: await loaded() });
  void w;
});

await stopServer();
await Promise.all(written.map(file => unlink(file).catch(() => { /* déjà retiré */ })));
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
