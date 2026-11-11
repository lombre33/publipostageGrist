// L'essai « AVANT / APRÈS » des imports Word et PowerPoint (js/docx-import.js, js/pptx-import.js) : ce que chaque import rend d'un même fichier ne change pas quand on remanie leur code (le chantier
// du dédoublonnage des outils OOXML : js/export-common.js:Ooxml).
// Le lanceur des groupes (run-headless.mjs) rejoue les groupes qui importent des fichiers (GROUPS) avec l'enregistreur dev-tests/ooxml-import-recorder.js, qui range, pour chaque appel de `fromBuffer`,
// l'empreinte du contenu du fichier lu et la sortie de l'import (texte, page, en-têtes et pieds de page, compte rendu, commentaires, suivi). Ici on compare chaque sortie à celle de la référence figée
// (dev-tests/ooxml-import-golden.json : l'empreinte de la sortie de chaque fichier, rendue par le code d'avant).
//  - Une sortie qui CHANGE pour un fichier de la référence fait échouer l'essai, avec l'endroit de l'écart. Quand le changement est voulu (un import qui sait reprendre un élément de plus), `--update`
//    réécrit la référence ; le dit dans le commit (le journal des écarts est dans dev-tests/.ooxml-import-before.json, hors du dépôt, d'une passe à la suivante).
//  - Un fichier NOUVEAU (un cas ajouté à un groupe) ou RETIRÉ ne fait pas échouer : il est dit ; `--update` l'ajoute ou le retire de la référence.
// Usage : node dev-tests/verify-ooxml-import-golden.mjs [--update]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GOLDEN = join(ROOT, 'dev-tests', 'ooxml-import-golden.json');
const BEFORE = join(ROOT, 'dev-tests', '.ooxml-import-before.json');
const PORT = Number(process.env.OOXML_GOLDEN_PORT || 9137);
// Les groupes qui lisent un fichier Word ou PowerPoint : les deux des imports, puis ceux qui importent ce que l'export a écrit (aller-retours).
const GROUPS = ['docxImport', 'pptxImport', 'altText', 'chartOffice', 'frameColumns', 'frameTable', 'frameVertical', 'slideSections', 'tabSize', 'textDirection'];
const update = process.argv.includes('--update');

let total = 0, passed = 0;
const check = (name, ok, notes) => { total++; if (ok) passed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} - ${name}${!ok && notes !== undefined ? ' (' + (typeof notes === 'string' ? notes : JSON.stringify(notes)) + ')' : ''}`); };
const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 16);

const dir = mkdtempSync(join(tmpdir(), 'ooxml-golden-'));
const collectFile = join(dir, 'collected.json');
const run = spawnSync(process.execPath, [join(ROOT, 'dev-tests', 'run-headless.mjs'), '--port', String(PORT), '--preseed', join(ROOT, 'dev-tests', 'ooxml-import-recorder.js'), '--collect', collectFile, ...GROUPS],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const log = (run.stdout || '') + (run.stderr || '');
const totalLine = (log.match(/=== TOTAL : (\d+) OK, (\d+) ECHEC\(S\) ===/) || []);
check('les groupes qui importent un fichier passent tous (ce que le lanceur de groupes dit : ' + GROUPS.join(', ') + ')', run.status === 0 && totalLine[2] === '0', totalLine[0] || log.slice(-300));

let collected = {};
try { collected = JSON.parse(readFileSync(collectFile, 'utf8')); } catch (e) { collected = {}; }
rmSync(dir, { recursive: true, force: true });
const seen = {};
Object.values(collected).forEach(group => Object.entries(group).forEach(([key, entry]) => { seen[key] = entry; }));
const keys = Object.keys(seen).sort();
const kinds = kind => keys.filter(k => seen[k].kind === kind).length;
check('l\'enregistreur a lu les imports des deux formats (au moins 40 fichiers Word et 100 PowerPoint)', kinds('docx') >= 40 && kinds('pptx') >= 100, { docx: kinds('docx'), pptx: kinds('pptx') });
check('aucune sortie enregistrée n\'est une erreur de l\'enregistreur lui-même', keys.every(k => !/^ENREGISTREUR/.test(seen[k].out)), keys.filter(k => /^ENREGISTREUR/.test(seen[k].out)).slice(0, 3));

const now = {};
keys.forEach((k) => { now[k] = { kind: seen[k].kind, sha: sha(seen[k].out), bytes: seen[k].out.length }; });
const before = existsSync(BEFORE) ? JSON.parse(readFileSync(BEFORE, 'utf8')) : {};
const firstDifference = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { at: i, avant: a.slice(Math.max(0, i - 70), i + 90), apres: b.slice(Math.max(0, i - 70), i + 90) };
};

if (update) {
  writeFileSync(GOLDEN, JSON.stringify({ about: 'Ce que rendent les imports Word et PowerPoint des fichiers des groupes d\'essais (dev-tests/verify-ooxml-import-golden.mjs --update). Ne se modifie pas à la main.', entries: now }, null, 1) + '\n');
  const full = {};
  keys.forEach((k) => { full[k] = seen[k].out; });
  writeFileSync(BEFORE, JSON.stringify(full));
  console.log(`  référence réécrite : ${keys.length} fichiers (${kinds('docx')} Word, ${kinds('pptx')} PowerPoint)`);
} else {
  const golden = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')).entries : null;
  check('la référence figée existe (dev-tests/ooxml-import-golden.json)', !!golden);
  if (golden) {
    const known = Object.keys(golden);
    const found = known.filter(k => now[k]);
    const changed = found.filter(k => now[k].sha !== golden[k].sha);
    for (const kind of ['docx', 'pptx']) {
      const mine = found.filter(k => golden[k].kind === kind);
      const bad = mine.filter(k => changed.includes(k));
      check(`${kind === 'docx' ? 'Word' : 'PowerPoint'} : chacun des ${mine.length} fichiers de la référence est rendu comme avant par l'import`, mine.length > 0 && bad.length === 0, bad.slice(0, 5));
    }
    changed.slice(0, 8).forEach((k) => {
      const old = before[k];
      console.log(`    écart ${k} (${golden[k].kind}) : ${golden[k].bytes} -> ${now[k].bytes} octets` + (old ? ' ; ' + JSON.stringify(firstDifference(old, seen[k].out)) : ' ; (journal d\'avant absent : relancer l\'essai sur l\'ancien code avec --update)'));
    });
    check('les fichiers de la référence sont tous rejoués (l\'enregistreur n\'a pas perdu de cas : 90 % au moins)', found.length >= Math.floor(known.length * 0.9), { rejoues: found.length, reference: known.length });
    const fresh = keys.filter(k => !golden[k]);
    const gone = known.filter(k => !now[k]);
    if (fresh.length) console.log(`    (${fresh.length} fichier(s) nouveau(x) hors de la référence : --update les ajoute)`);
    if (gone.length) console.log(`    (${gone.length} fichier(s) de la référence non rejoué(s) : ${gone.slice(0, 4).join(', ')} ; --update les retire ; des paquets qui portent une date ou un identifiant au hasard changent de clé à chaque passe)`);
  }
}
console.log(`\n${passed}/${total} passés`);
process.exit(passed === total ? 0 : 1);
