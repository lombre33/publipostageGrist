// Refige les sorties de la V1 du jeu de compatibilité avec la bêta (dev-tests/beta-compat-set.json) : joue `BetaCompat.freeze()` (dev-tests/scenarios-beta-compat.js) dans le
// harnais, puis réécrit le fichier. Les entrées et les sorties de la bêta (`html`, `out`, `headerFooter`, `margins`) ne bougent pas, c'est la bêta qu'elles figent ; seuls `pdf`,
// `docx` et `email` de chaque modèle sont recalculés avec le code de l'arbre : `git diff dev-tests/beta-compat-set.json` dit lesquels ont bougé. À lancer après un lot dont le
// CHANGELOG dit que ces sorties changent exprès, jamais pour faire taire un cas du groupe `betaCompat`.
//   node dev-tests/refreeze-beta-compat.mjs
import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SET_FILE = join(ROOT, 'dev-tests', 'beta-compat-set.json');
const PROBE = `(async () => {
  for (const f of ['helpers', 'runner', 'scenarios-beta-compat']) {
    await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = '/dev-tests/' + f + '.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  }
  return BetaCompat.freeze();
})()`;

// La sortie va dans un fichier : un tube serait coupé quand le harnais se ferme (process.exit après le dernier console.log).
const dir = mkdtempSync(join(tmpdir(), 'beta-compat-'));
const raw = join(dir, 'probe.txt');
const fd = openSync(raw, 'w');
const run = spawnSync(process.execPath, [join(ROOT, 'dev-tests', 'run-headless.mjs'), '--probe', PROBE], { stdio: ['ignore', fd, 'inherit'], cwd: ROOT });
closeSync(fd);
try {
  if (run.status !== 0) throw new Error('le harnais a rendu le code ' + run.status);
  const text = readFileSync(raw, 'utf8');
  const frozen = JSON.parse(text.slice(0, text.lastIndexOf('}') + 1)).value;
  if (typeof frozen !== 'string' || !frozen.includes('"models"')) throw new Error('la sonde n\'a pas rendu le jeu : ' + text.slice(0, 300));
  const before = readFileSync(SET_FILE, 'utf8');
  writeFileSync(SET_FILE, frozen);
  console.log(before === frozen ? 'Rien n\'a bougé : les sorties de la V1 sont celles du jeu.' : 'dev-tests/beta-compat-set.json réécrit : `git diff` dit quelles sorties ont bougé (à dire au CHANGELOG).');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
