#!/usr/bin/env node
// Le banc de fidélité des exports sur les MODÈLES RÉELS (campagne « Fiabiliser les exports », 27/11) : pour chaque modèle de la galerie (templates-gallery/, et templates-gallery-dev/ avec --dev) et chaque
// ligne de sa table principale, le VRAI widget (dev-tests/real-widget-kit.mjs : le modèle s'installe par le vrai parcours, les lignes d'exemple se posent dans les tables, la ligne est donnée au widget)
// montre la Lecture, puis le PDF est exporté par le vrai bouton ; les deux sont relus ligne à ligne (dev-tests/export-twin-lib.mjs : la Lecture dans le DOM, le PDF par pdf.js) et comparés :
// le nombre de pages, le nombre de lignes de chaque page, le texte de chaque ligne (une ligne coupée ailleurs change le texte de deux lignes), la hauteur de chaque ligne depuis la première de sa page,
// l'abscisse du début et de la fin de chaque ligne, les images (nombre, taille).
//
// Pourquoi : les essais de dev-tests/ fabriquent leurs documents (« Texte de test », pages remplies de lignes pareilles) et vérifient une règle à la fois ; trois écarts entre l'éditeur, la Lecture et
// le PDF sont pourtant arrivés chez Antoine en 24 h (26-27/11). Un vrai courrier, une vraie facture, avec leurs variables, conditions, boucles, calques et pieds de page, n'étaient comparés nulle part.
//
//   node dev-tests/verify-export-corpus.mjs                       tous les modèles de la galerie (document), toutes les lignes (au plus 8 par modèle)
//   node dev-tests/verify-export-corpus.mjs --only facture,bulletin
//   node dev-tests/verify-export-corpus.mjs --dev                 + templates-gallery-dev/
//   node dev-tests/verify-export-corpus.mjs --rows 2              au plus 2 lignes par modèle
//   node dev-tests/verify-export-corpus.mjs --stress              les documents « éprouvette » (dev-tests/export-stress-corpus.mjs : marges, alignements, imbrications) au lieu de ceux de la galerie ;
//                                                                 `--seed N --count M` y ajoute M documents tirés au hasard (même graine, mêmes documents), `--only id,id` en choisit
//   node dev-tests/verify-export-corpus.mjs --formats none        sans Word ni ODT (seulement Lecture ↔ PDF) ; `--formats docx` ou `odf` : un seul des deux (par défaut : docx,odf)
//   node dev-tests/verify-export-corpus.mjs --report              dit les écarts sans échouer (la première passe, pour les connaître)
//   node dev-tests/verify-export-corpus.mjs --json fichier.json   écrit le détail de chaque document
// Word et ODT (si LibreOffice est là) : chaque document est aussi exporté en .docx et en .odt par le vrai bouton, rendu en PDF par LibreOffice (avec la même Roboto que pdfmake) et comparé AU PDF
// du widget, page par page : le nombre de pages, les lettres de chaque page, les images, l'en-tête et le pied (export-twin-lib.mjs : comparePageContent). LibreOffice n'est pas Word : pas de millimètre.
// Sortie : une ligne par document ; code 1 dès qu'un écart n'est pas dans KNOWN (dev-tests/export-corpus-known.json : ce qui est connu et pas encore corrigé, une case PIRE échoue, une case MIEUX le dit).
// Il faut : Chromium (Playwright), et les bibliothèques des CDN (hors ligne : dev-tests/offline-deps.sh).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { entryFiles, readJson } from './gallery-captures-lib.mjs';
import { FIXED, generate } from './export-stress-corpus.mjs';
import { createKit, ROOT, sleep } from './real-widget-kit.mjs';
import { readerSnapshotInPage, readPdf, readerPages, pdfPages, compareTwins, comparePageContent } from './export-twin-lib.mjs';
import { haveLibreOffice, installPdfFonts, convertToPdf } from './libreoffice-lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i === -1 ? fallback : args[i + 1]; };
const only = String(option('only', '')).split(',').map((s) => s.trim()).filter(Boolean);
const MAX_ROWS = Number(option('rows', 8));
const REPORT = flag('report');
const JSON_OUT = option('json', '');
const STRESS = flag('stress');
const SEED = Number(option('seed', 0));
const COUNT = Number(option('count', 0));
let FORMATS = String(option('formats', 'docx,odf')).split(',').map((x) => x.trim()).filter((x) => x === 'docx' || x === 'odf');
if (FORMATS.length && !haveLibreOffice()) { console.log('LibreOffice (soffice) est absent : Word et ODT ne sont pas rendus, seulement Lecture ↔ PDF.'); FORMATS = []; }
const PORT = Number(process.env.EXPORT_CORPUS_PORT || 8941);
// EXPORT_CORPUS_KEEP=dossier : garde, pour chaque document, le PDF du widget, le .docx et le .odt exportés et leurs rendus LibreOffice (de quoi lire un écart avec pdftotext, à la main).
const KEEP = process.env.EXPORT_CORPUS_KEEP || '';
if (KEEP) mkdirSync(KEEP, { recursive: true });
const keep = (file, name) => { if (KEEP) copyFileSync(file, join(KEEP, name)); };
const KNOWN_FILE = join(ROOT, 'dev-tests', 'export-corpus-known.json');
const KNOWN = existsSync(KNOWN_FILE) ? readJson(KNOWN_FILE) : {};

const galleries = [{ dir: 'templates-gallery' }];
if (flag('dev')) galleries.push({ dir: 'templates-gallery-dev' });
const todo = [];
if (!STRESS) {
  for (const gallery of galleries) {
    const root = join(ROOT, gallery.dir);
    const manifestPath = join(root, 'catalogue.json');
    if (!existsSync(manifestPath)) continue;
    for (const entry of readJson(manifestPath)) {
      if (!entry.pack || (only.length && only.indexOf(entry.id) === -1)) continue;
      const files = entryFiles(root, entry);
      if (!files || !files.exemple) continue;
      const type = (files.pack.template && files.pack.template.type) || 'document';
      // Les e-mails, les grilles et les présentations se lisent autrement qu'en pages de PDF : un autre banc.
      if (type !== 'document') { console.log(`- ${entry.id} : ${type}, hors de ce banc`); continue; }
      todo.push({ entry, files });
    }
  }
}
const stressDocs = !STRESS ? [] : FIXED.concat(COUNT ? generate(SEED || 1, COUNT) : []).filter((d) => !only.length || only.indexOf(d.id) !== -1);
if (!todo.length && !stressDocs.length) { console.log('Rien à passer.'); process.exit(0); }

const kit = await createKit({ port: PORT, workName: 'export-corpus-' });
const browser = await kit.launch();
const results = [];
let fontConf = '';

// Le document que le widget montre à cet instant : la Lecture lue ligne à ligne, le PDF exporté par le vrai bouton et relu, la comparaison ; puis, pour chaque format demandé, le même document en .docx et en .odt, rendu
// par LibreOffice et comparé au PDF (page par page).
async function measure(page, context, tag) {
  await kit.click(page, '#btn-mode-read', 1200);
  await sleep(300);
  const snapshot = await page.evaluate(readerSnapshotInPage);
  if (snapshot.error) throw new Error(snapshot.error);
  const pdfFile = join(kit.work, `${tag.replace(/[^\w.-]/g, '_')}.pdf`);
  await kit.exportPdf(page, pdfFile);
  keep(pdfFile, `${tag.replace(/[^\w.-]/g, '_')}.pdf`);
  const pdf = await readPdf(context, readFileSync(pdfFile).toString('base64'));
  const reader = readerPages(snapshot);
  const twin = pdfPages(pdf, reader[0].bodyOffset, reader[0].bottomOffset);
  const cmp = compareTwins(reader, twin);
  const row = { id: tag, ...cmp, dump: process.env.EXPORT_CORPUS_DUMP ? { reader, pdf: twin } : undefined, lines: { reader: reader.reduce((n, p) => n + p.lines.length, 0), pdf: twin.reduce((n, p) => n + p.lines.length, 0) }, files: {} };
  for (const format of FORMATS) {
    try {
      if (!fontConf) fontConf = (await installPdfFonts(page, kit.work)).conf;
      const file = join(kit.work, `${tag.replace(/[^\w.-]/g, '_')}.${format === 'odf' ? 'odt' : format}`);
      await kit.exportAs(page, format, file);
      const rendered = convertToPdf(file, { work: kit.work, fontConf });
      keep(file, `${tag.replace(/[^\w.-]/g, '_')}.${format === 'odf' ? 'odt' : format}`);
      keep(rendered, `${tag.replace(/[^\w.-]/g, '_')}.${format === 'odf' ? 'odt' : format}.pdf`);
      const other = pdfPages(await readPdf(context, readFileSync(rendered).toString('base64')), reader[0].bodyOffset, reader[0].bottomOffset);
      const same = comparePageContent(twin, other, STRESS ? { drift: { lines: 2, perPage: 1 } } : undefined);
      row.files[format] = same.pages;
      same.diffs.forEach((d) => row.diffs.push(Object.assign(d, { kind: format + ':' + d.kind })));
    } catch (e) {
      row.diffs.push({ kind: format + ':erreur', page: 0, detail: e.message, amount: null });
    }
  }
  if (FORMATS.length) await kit.chooseExportType(page, 'pdf');
  await kit.click(page, '#btn-mode-edit', 500);
  return row;
}

if (todo.length) {
  for (const { entry, files } of todo) {
    const started = Date.now();
    let session = null;
    try {
      const family = files.familyTables;
      const tables = files.pack.tables.map((t) => {
        if (typeof t !== 'string') return t;
        const found = family && family.tables.find((x) => x.id === t);
        if (!found) throw new Error(`la table « ${t} » n'est pas dans la famille « ${files.pack.family} »`);
        return found;
      });
      const rows = Object.assign({}, files.familyExemple && files.familyExemple.rows, files.exemple.rows);
      const imageSpecs = Object.assign({}, files.familyExemple && files.familyExemple.images, files.exemple.images);
      const images = {};
      Object.keys(imageSpecs).forEach((id) => { images[id] = kit.makeImage(imageSpecs[id]); });
      session = await kit.openWidget(browser, images, { extensions: files.exemple.extensions || [] });
      const { page, context } = session;
      await kit.installFromGallery(page, entry.name);
      const main = files.pack.main || tables[0].id;
      await kit.fillRows(page, tables.map((t) => ({ id: t.id, columns: t.columns })), rows);
      const ids = (rows[main] || []).map((r) => r.id).slice(0, MAX_ROWS);
      for (const rowId of ids) {
        const tag = `${entry.id}#${rowId}`;
        try {
          await kit.fire(page, main, rowId);
          results.push(await measure(page, context, tag));
        } catch (e) {
          results.push({ id: tag, error: e.message, diffs: [] });
        }
      }
    } catch (e) {
      results.push({ id: entry.id, error: e.message, diffs: [] });
    } finally {
      if (session) await session.context.close();
    }
    console.log(`  (${entry.id} en ${Math.round((Date.now() - started) / 1000)} s)`);
  }
}

if (stressDocs.length) {
  // Un seul widget pour tous les documents d'éprouvette (kit.openBlankSession) ; chaque document remplace le contenu.
  const started = Date.now();
  let session = null;
  try {
    session = await kit.openBlankSession(browser);
    const { page, context, main, rowId } = session;
    for (const d of stressDocs) {
      const tag = d.id;
      try {
        await kit.setDocument(page, d);
        await kit.fire(page, main, rowId);
        results.push(Object.assign(await measure(page, context, tag), { seed: d.seed }));
      } catch (e) {
        results.push({ id: tag, error: e.message, diffs: [], seed: d.seed });
      }
    }
  } catch (e) {
    results.push({ id: 'éprouvette', error: e.message, diffs: [] });
  } finally {
    if (session) await session.context.close();
  }
  console.log(`  (éprouvette : ${stressDocs.length} document(s) en ${Math.round((Date.now() - started) / 1000)} s)`);
}
await browser.close();
kit.close();

// ---- Le verdict ----
// Le « profil » d'un document : combien d'écarts de chaque sorte. KNOWN dit ce qu'on connaît (id -> { kind: n }) ; plus d'écarts de n'importe quelle sorte = échec, moins = mieux.
const profileOf = (r) => r.diffs.reduce((acc, d) => { acc[d.kind] = (acc[d.kind] || 0) + 1; return acc; }, {});
let failed = 0; let better = 0; let clean = 0;
for (const r of results) {
  if (r.error) { failed += 1; console.log(`ECHEC ${r.id} : ${r.error}`); continue; }
  const profile = profileOf(r);
  const known = KNOWN[r.id] || {};
  const worse = Object.keys(profile).filter((k) => profile[k] > (known[k] || 0));
  const lesser = Object.keys(known).filter((k) => (profile[k] || 0) < known[k]);
  const asFiles = Object.keys(r.files || {}).map((f) => `${f} ${r.files[f].file}p`).join(' ');
  const summary = `${r.id.padEnd(34)} pages ${r.pages.reader}/${r.pages.pdf}  lignes ${r.lines.reader}/${r.lines.pdf}  dy max ${r.maxDy}  pas max ${r.maxGap}  dx max ${r.maxDx}${asFiles ? '  | ' + asFiles : ''}`;
  if (!r.diffs.length) { clean += 1; console.log(`OK    ${summary}`); continue; }
  const kinds = Object.keys(profile).map((k) => `${k} x${profile[k]}`).join(', ');
  if (worse.length) { failed += 1; console.log(`ECART ${summary}\n        ${kinds}`); r.diffs.slice(0, 6).forEach((d) => console.log(`        p.${d.page} ${d.kind} : ${d.detail}`)); }
  else { console.log(`connu ${summary}  (${kinds})`); }
  if (lesser.length) { better += 1; console.log(`        MIEUX que KNOWN : ${lesser.join(', ')}`); }
}
console.log(`\n${results.length} document(s) : ${clean} identique(s), ${failed} en écart nouveau${better ? ', ' + better + ' meilleur(s) que KNOWN' : ''}.`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
process.exit(failed && !REPORT ? 1 : 0);
