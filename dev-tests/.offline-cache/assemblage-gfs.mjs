// Les deux fichiers que Grist Factory Suite assemble et que les essais servent à sa place : « edition-live » (l'écriture en direct) et « pdfjs » (la lecture de PDF). Ce sont les seuls morceaux du miroir des essais que l'outil
// du kit ne refait pas : la liste de l'app (package.json à la racine) ne nomme pas les bibliothèques d'une extension, c'est GFS qui les porte ; leurs paquets, leurs versions exactes et la recette de l'assemblage
// sont dans edition-live.json et pdfjs-gfs.json, à côté. Le reste du miroir (les modules ES de la carte, les fichiers UMD, la liste des paquets du dossier) se refait par `node kit/outils/bibliotheques.mjs --miroir`,
// d'après la liste, jamais à la main : dev-tests/offline-deps.sh lance l'un puis l'autre. Ce script s'exécute dans ce dossier et lit esbuild dans son node_modules (installé par --miroir : esbuild est dans la liste).
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// Le fichier « edition-live » de Grist Factory Suite (consigne GFS 012, contrats 2.6 : l'écriture en direct) : ses six paquets en UN module ES qui se range dans globalThis.GfsPaquets['edition-live'],
// avec les noms nus de l'éditeur de l'app (@tiptap/core, prosemirror-*) laissés tels quels. Mêmes réglages que l'outil d'assemblage de GFS (outils/assemblage.mjs, BUILD_OPTIONS et registrySource) ; les
// octets peuvent différer des siens (autre esbuild), le contenu et la forme sont les mêmes. Les essais le servent à la place de GFS.
// Les paquets et la recette sont dans edition-live.json, à part de package.json : la liste de l'app ne nomme pas les bibliothèques d'une extension (comme le graphique), c'est GFS qui les porte. Sans ce fichier
// (un dossier qui n'a pas ce fichier saute cette étape : le labo de GFS n'en a pas besoin, GFS donne le sien).
const LIVE_SPEC = 'edition-live.json';
let liveBuilt = false;
if (existsSync(LIVE_SPEC)) {
  const spec = JSON.parse(readFileSync(LIVE_SPEC, 'utf8'));
  const recipe = spec.assemble;
  const liveDeps = join(process.cwd(), 'edition-live-deps');
  mkdirSync(liveDeps, { recursive: true });
  writeFileSync(join(liveDeps, 'package.json'), JSON.stringify({ name: 'publipostage-edition-live-deps', private: true, dependencies: spec.dependencies }, null, 2));
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: liveDeps, stdio: 'inherit' });
  const liveRegistry = `${recipe.modules.map((name, i) => `import * as m${i} from ${JSON.stringify(name)};`).join('\n')}\n`
    + `(globalThis.GfsPaquets ||= {})["edition-live"] = { version: ${JSON.stringify(recipe.version)}, modules: { ${recipe.modules.map((name, i) => `${JSON.stringify(name)}: m${i}`).join(', ')} } };\n`;
  const live = await build({
    bundle: true, format: 'esm', target: 'es2022', platform: 'browser', minify: true, legalComments: 'none',
    absWorkingDir: process.cwd(), write: false, logLevel: 'warning',
    stdin: { contents: liveRegistry, resolveDir: liveDeps, sourcefile: 'registre.js' },
    alias: recipe.alias, external: recipe.externes,
  });
  mkdirSync('edition-live', { recursive: true });
  writeFileSync('edition-live/edition-live.js', live.outputFiles[0].contents);
  liveBuilt = true;
}

// Le fichier « pdfjs » de Grist Factory Suite (consigne GFS 040, la lecture de PDF) : pdf.js 6.5 (pdfjs-dist) et son moteur en UN module ES qui se range dans globalThis.GfsPaquets.pdfjs - comme le fichier de GFS,
// il pose lui-même le « faux Worker » (globalThis.pdfjsWorker : un cadre d'app sans `allow-same-origin` ne crée aucun Worker, l'app ne règle donc jamais `workerSrc`). Mêmes réglages d'assemblage que le fichier
// « edition-live » ci-dessus ; les octets peuvent différer de ceux de GFS, le contenu et la forme sont les mêmes. Recette et version dans pdfjs-gfs.json ; sans lui, cette étape est sautée (le labo de GFS n'en a pas besoin).
const PDFJS_SPEC = 'pdfjs-gfs.json';
let pdfjsBuilt = false;
if (existsSync(PDFJS_SPEC)) {
  const spec = JSON.parse(readFileSync(PDFJS_SPEC, 'utf8'));
  const recipe = spec.assemble;
  const pdfjsDeps = join(process.cwd(), 'pdfjs-deps');
  mkdirSync(pdfjsDeps, { recursive: true });
  writeFileSync(join(pdfjsDeps, 'package.json'), JSON.stringify({ name: 'publipostage-pdfjs-deps', private: true, dependencies: spec.dependencies }, null, 2));
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: pdfjsDeps, stdio: 'inherit' });
  const pdfjsRegistry = `${recipe.modules.map((name, i) => `import * as m${i} from ${JSON.stringify(name)};`).join('\n')}\nimport * as engine from ${JSON.stringify(recipe.moteur)};\n`
    + `globalThis.pdfjsWorker = { WorkerMessageHandler: engine.WorkerMessageHandler };\n`
    + `(globalThis.GfsPaquets ||= {})["pdfjs"] = { version: ${JSON.stringify(recipe.version)}, modules: { ${recipe.modules.map((name, i) => `${JSON.stringify(name)}: m${i}`).join(', ')} } };\n`;
  const pdfjs = await build({
    bundle: true, format: 'esm', target: 'es2022', platform: 'browser', minify: true, legalComments: 'none',
    absWorkingDir: process.cwd(), write: false, logLevel: 'warning',
    stdin: { contents: pdfjsRegistry, resolveDir: pdfjsDeps, sourcefile: 'registre.js' },
  });
  mkdirSync('pdfjs', { recursive: true });
  writeFileSync('pdfjs/pdfjs.js', pdfjs.outputFiles[0].contents);
  pdfjsBuilt = true;
}

console.log('[assemblage-gfs] OK -', liveBuilt ? 'edition-live' : '(' + LIVE_SPEC + ' absent : le fichier edition-live n\'est pas construit)', pdfjsBuilt ? '+ pdfjs' : '(' + PDFJS_SPEC + ' absent : le fichier pdfjs n\'est pas construit)');
