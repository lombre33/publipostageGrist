#!/usr/bin/env node
// Le lanceur (dev-tests/run-headless.mjs) face à un groupe dont le fichier existe mais ne se charge pas. Retour d'Antoine du 02/10 : une apostrophe non échappée dans
// scenarios-callout-signature.js (SyntaxError) a laissé le groupe calloutSignature sauté près de quatre heures, la passe finissant « 0 ECHEC(S) » ; il a choisi de le compter en échec.
// Ce script lance une COPIE du lanceur à laquelle deux groupes d'essai sont ajoutés (GROUPS) : l'un dont le fichier a la même erreur de syntaxe qu'au 02/10, l'autre dont le fichier
// n'existe pas sur la branche (cas voulu : annoncé et sauté, jamais un échec - voir le commentaire de missingFiles dans run-headless.mjs). Il lit le code de sortie, le total, la liste
// des groupes en échec et l'erreur de la page. Les fichiers d'essai sont écrits dans dev-tests/ le temps du lancement, puis supprimés.
// RUNNER_SOURCE=<fichier> : lanceur à éprouver à la place de dev-tests/run-headless.mjs (pour montrer que ce test échoue sur l'ancien lanceur). RUNNER_GROUP_LOAD_PORT : port du lanceur d'essai.
// Lancé par run-headless.mjs (groupe Node "runnerGroupLoad", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-runner-group-load.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(process.env.RUNNER_SOURCE || join(HERE, 'run-headless.mjs'));
const PORT = process.env.RUNNER_GROUP_LOAD_PORT || '8951';
const COPY = join(HERE, '.zz-essai-run-headless.mjs');
const BROKEN = join(HERE, 'zz-essai-groupe-casse.js');

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}

// Le fichier du groupe casse : l'apostrophe de « l'éditeur » n'est pas échappée dans une chaîne entre apostrophes, comme le 02/10.
const BROKEN_SOURCE = [
  "// Groupe d'essai de verify-runner-group-load.mjs, supprimé à la fin du lancement.",
  'window.EditorTestSuites = window.EditorTestSuites || {};',
  "window.EditorTestSuites.zzEssaiCasse = [{ id: 'zz_essai', description: 'la puce de l'éditeur', run: async () => ({ pass: true }) }];",
].join('\n');

const original = readFileSync(SOURCE, 'utf8');
const patched = original.replace('const GROUPS = {', "const GROUPS = {\n  zzEssaiCasse: 'zz-essai-groupe-casse',\n  zzEssaiAbsent: 'zz-essai-fichier-absent',");
check('le lanceur d’essai a reçu ses deux groupes (la déclaration « const GROUPS = { » est toujours là)', patched !== original);

let out = '';
let status = null;
if (patched !== original) {
  try {
    writeFileSync(COPY, patched);
    writeFileSync(BROKEN, BROKEN_SOURCE);
    const r = spawnSync(process.execPath, [COPY, '--port', PORT, 'zzEssaiCasse', 'zzEssaiAbsent'], { encoding: 'utf8', timeout: 240000 });
    out = (r.stdout || '') + (r.stderr || '');
    status = r.status;
  } finally {
    rmSync(COPY, { force: true });
    rmSync(BROKEN, { force: true });
  }

  check('un groupe dont le fichier existe mais ne se charge pas fait échouer la passe (code de sortie 1)', status === 1, status);
  check('le total le compte comme UN échec et aucun succès', /=== TOTAL : 0 OK, 1 ECHEC\(S\) ===/.test(out), out.match(/=== TOTAL[^\n]*/));
  check('la liste des groupes en échec nomme ce groupe, et lui seul', /^Groupes en échec : zzEssaiCasse\s*$/m.test(out), out.match(/Groupes en échec[^\n]*/));
  check('la ligne d’échec nomme le fichier du groupe', /ECHEC groupe non chargé : dev-tests\/zz-essai-groupe-casse\.js/.test(out), out.match(/zz-essai-groupe-casse[^\n]*/));
  check('l’erreur de la page (la syntaxe) est affichée sous le groupe', /pageerror: [^\n]*Unexpected|SyntaxError/.test(out), out.match(/erreur\(s\) console[^]*?(?=\n\n|$)/));
  check('un groupe dont le fichier n’existe pas sur la branche reste annoncé et sauté, jamais un échec', /fichier absent de cette branche : zzEssaiAbsent/.test(out) && !/Groupes en échec : [^\n]*zzEssaiAbsent/.test(out), out.match(/fichier absent[^\n]*/));
}

if (failures && out) console.log('\n--- sortie du lanceur d’essai (fin) ---\n' + out.slice(-2500));
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
