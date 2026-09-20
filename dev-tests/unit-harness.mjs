// Petit chargeur pour tester en Node, SANS Playwright/navigateur, un module écrit comme les autres
// scripts classiques du projet (`const X = (function(){...})();`, partagé par scope global comme le
// sont deux <script> d'une même page - cf. js/templates.js, js/comments.js). Réservé aux modules qui
// n'ont pas encore de <script> dans index.html (donc invisibles à _test-harness.html tant que le
// câblage n'est pas fait, cf. dev-tests/generate-harness.sh) et/ou purement logiques (aucun DOM réel
// nécessaire). Une fois un module câblé dans index.html, sa vraie suite de non-régression doit passer
// par dev-tests/run-headless.mjs (le vrai DOM + grist-stub.js) - ne pas la laisser vivre ici.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function createContext(globals) {
  return vm.createContext(Object.assign({ console }, globals));
}

export function loadScript(context, relPath) {
  const abs = join(ROOT, relPath);
  vm.runInContext(readFileSync(abs, 'utf8'), context, { filename: abs });
}

// Évalue une expression (pas une instruction) dans le contexte - sert à la fois à appeler le module
// chargé et à faire ressortir le résultat vers ce process Node.
export function evalIn(context, expr) {
  return vm.runInContext(expr, context);
}

let failures = 0;
let total = 0;
export function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + notes + ')' : '')); }
}
export function summarizeAndExit() {
  console.log(`${total - failures}/${total} passés`);
  process.exit(failures ? 1 : 0);
}
