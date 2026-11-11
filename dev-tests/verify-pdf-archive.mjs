// Le type d'export « PDF/A (archivage) » (js/pdf-archive.js) mesuré par un VALIDEUR : veraPDF, la référence de la norme (ISO 19005-2, niveau B). Les scénarios du groupe pdfArchive
// (dev-tests/scenarios-pdf-archive.js) lisent la structure du fichier ; ceux-ci demandent à veraPDF si le fichier est conforme, sur les vrais PDF que l'app écrit : une ligne (titre, liste, tableau,
// image à transparence, lien), l'archive ZIP de trois lignes et le PDF unique de trois lignes.
//
// Il faut Java et les bibliothèques de veraPDF (le dossier de leurs .jar) : `VERAPDF_LIB=/chemin/vers/lib node dev-tests/verify-pdf-archive.mjs`. Sans elles le banc ne juge rien et le dit
// (code 0) : une machine sans Java ne doit pas échouer. Les bibliothèques s'obtiennent depuis Maven Central (org.verapdf:validation-model-jakarta-wrapper... : voir le dossier d'essais
// etudes/pdf-accessible-et-envoi-2026-11-10/verapdf du dossier de projet, `pom.xml` puis `mvn dependency:copy-dependencies -DoutputDirectory=lib`). Version mesurée : veraPDF 1.28.2.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { open, stopServer, sleep, fire, downloadOf, startExport, exportBatchOf, ROOT } from './load-lib.mjs';

const LIB = process.env.VERAPDF_LIB || '';
const javaThere = spawnSync('java', ['-version'], { encoding: 'utf8' }).status === 0;
if (!LIB || !existsSync(LIB) || !javaThere) {
  console.log('veraPDF : ' + (!javaThere ? 'Java est absent' : 'VERAPDF_LIB ne désigne pas le dossier des bibliothèques de veraPDF') + ' - rien n\'est jugé.');
  process.exit(0);
}

const PORT = Number(process.env.PDFA_PORT || 8985);
const require = createRequire(import.meta.url);
const JSZip = require(join(ROOT, 'dev-tests', '.offline-cache', 'umd', 'jszip.min.js'));
let total = 0;
let failures = 0;
const check = (name, pass, notes) => {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
};

// veraPDF sur un fichier : { compliant, failed: ['clause x n : description'] } pour le profil demandé (2b : PDF/A-2, niveau B).
function validate(flavour, file) {
  const run = spawnSync('java', ['-cp', join(LIB, '*'), 'org.verapdf.apps.GreenfieldCliWrapper', '--flavour', flavour, '--format', 'xml', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = run.stdout || '';
  const compliant = /isCompliant="true"/.test(out);
  const failed = [...out.matchAll(/<rule [^>]*clause="([^"]+)"[^>]*status="failed"[^>]*failedChecks="(\d+)"/g)].map(m => m[1] + ' x' + m[2]);
  return { compliant, failed, ran: /<validationReport/.test(out) };
}

const scratch = mkdtempSync(join(tmpdir(), 'pp-pdfa-'));
process.env.LOAD_OUT = scratch;
// Un PNG à transparence (16 x 16, rouge à moitié opaque) : la transparence est ce que PDF/A-1 interdisait et PDF/A-2 permet, avec une intention de rendu.
const png = (() => {
  const zlib = require('node:zlib');
  const crc = buffer => { let c, crcValue = 0xffffffff; for (let n = 0; n < buffer.length; n++) { c = (crcValue ^ buffer[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcValue = (crcValue >>> 8) ^ c; } return (crcValue ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(16, 0); header.writeUInt32BE(16, 4); header.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 16 }, () => [200, 30, 30, 128]).flat())]);
  const raw = Buffer.concat(Array.from({ length: 16 }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
})();
const HTML = `<h1>Facture</h1><p>Bonjour <span class="var-badge" data-table="Factures" data-column="Nom" data-key="Factures.Nom"></span>, voici le détail de votre commande.</p>
<h2>Articles</h2><ul><li>Stylo</li><li>Cahier</li></ul>
<table><tbody><tr><th><p>Article</p></th><th><p>Prix</p></th></tr><tr><td><p>Stylo</p></td><td><p>3 €</p></td></tr></tbody></table>
<p><img class="editor-image" src="data:image/png;base64,${png}" alt="Logo de la société" style="width: 120px"></p>
<p>Voir <a href="https://example.com">notre site</a>.</p>`;
const SPEC = { tables: [{ id: 'Factures', rows: 3, columns: [{ id: 'Nom', type: 'Text' }, { id: 'Montant', type: 'Numeric' }] }], models: { count: 1, paragraphs: 2 } };

const w = await open({ spec: SPEC, port: PORT, settleMs: 3000 });
try {
  await w.page.evaluate(html => EditorCore.getEditor().commands.setContent(html), HTML);
  await sleep(500);
  await fire(w.page, 'Factures', 1);
  const files = [];
  const one = await downloadOf(w.page, 'une-ligne', () => startExport(w.page, 'pdfArchive'), 120000);
  files.push(['une ligne', one.file]);
  const zip = await exportBatchOf(w.page, 'pdfArchiveZip', 'lot-zip', { timeout: 120000 });
  const entries = await JSZip.loadAsync(readFileSync(zip.file));
  for (const name of Object.keys(entries.files).sort()) {
    const out = join(scratch, 'zip-' + name.replace(/[^\w.-]+/g, '_'));
    writeFileSync(out, Buffer.from(await entries.files[name].async('uint8array')));
    files.push(['lot ZIP : ' + name, out]);
  }
  const merged = await exportBatchOf(w.page, 'pdfArchiveMerged', 'pdf-unique', { timeout: 120000 });
  files.push(['PDF unique', merged.file]);
  check('les trois exports ont rendu des fichiers (une ligne, 3 PDF du ZIP, le PDF unique)', files.length === 5, files.map(f => f[0]));
  for (const [label, file] of files) {
    const verdict = validate('2b', file);
    check(`${label} : conforme PDF/A-2b d'après veraPDF`, verdict.ran && verdict.compliant, verdict.failed);
  }
  // Le même PDF sans la conversion n'est PAS conforme : le banc mesure bien quelque chose.
  const plain = await downloadOf(w.page, 'ordinaire', () => startExport(w.page, 'pdf'), 120000);
  const plainVerdict = validate('2b', plain.file);
  check('le PDF ordinaire du même document n\'est pas conforme PDF/A-2b (garde-fou du banc : veraPDF juge vraiment)', plainVerdict.ran && !plainVerdict.compliant && plainVerdict.failed.length > 0, plainVerdict);
  check('aucune erreur de page', w.errors.length === 0, w.errors);
} finally {
  await w.close();
  await stopServer();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
