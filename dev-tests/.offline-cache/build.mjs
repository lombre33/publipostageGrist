// Bundle les memes versions exactes que la liste des bibliotheques (package.json a la racine, d'ou l'outil du kit ecrit l'importmap de index.html) en modules ESM locaux.
// `splitting: true` est INDISPENSABLE : sans lui, chaque entree embarquerait sa propre copie de
// ProseMirror, et deux copies de prosemirror-state/view dans la meme page cassent TipTap
// (instanceof croises, plugin keys dupliquees).
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const BARE = [
  'prosemirror-model', 'orderedmap', 'prosemirror-state', 'prosemirror-transform',
  'prosemirror-view', 'rope-sequence', 'prosemirror-history', 'prosemirror-keymap',
  'w3c-keyname', 'prosemirror-commands', 'prosemirror-schema-list', 'prosemirror-tables',
  'prosemirror-gapcursor', 'prosemirror-dropcursor', 'prosemirror-inputrules',
  'prosemirror-changeset',
  '@tiptap/core', '@tiptap/starter-kit', '@tiptap/extension-document', '@tiptap/extension-underline',
  '@tiptap/extension-text-align', '@tiptap/extension-text-style', '@tiptap/extension-font-family',
  '@tiptap/extension-table', '@tiptap/extension-table-row', '@tiptap/extension-table-cell',
  '@tiptap/extension-table-header', '@tiptap/extension-task-list', '@tiptap/extension-task-item',
  '@tiptap/extension-placeholder',
  '@tiptap/suggestion', '@floating-ui/dom', '@handlewithcare/prosemirror-suggest-changes',
];

mkdirSync('entries', { recursive: true });
const entryPoints = {};
for (const spec of BARE) {
  const name = spec.replace('@', '').replace('/', '__');
  const file = `entries/${name}.js`;
  writeFileSync(file, `export * from ${JSON.stringify(spec)};\n`);
  entryPoints[name] = file;
}

const result = await build({
  entryPoints,
  outdir: 'esm',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  metafile: true,
  legalComments: 'none',
  logLevel: 'warning',
});

const map = {};
for (const spec of BARE) {
  const name = spec.replace('@', '').replace('/', '__');
  map[spec] = `/dev-tests/.offline-cache/esm/${name}.js`;
}
writeFileSync('esm-map.json', JSON.stringify(map, null, 2));

// Librairies UMD : copiees telles quelles depuis npm (meme dist que celle servie par les CDN).
mkdirSync('umd', { recursive: true });
const umd = [
  ['node_modules/pdfmake/build/pdfmake.min.js', 'umd/pdfmake.min.js'],
  ['node_modules/pdfmake/build/vfs_fonts.js', 'umd/vfs_fonts.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.min.js', 'umd/pdf.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.js', 'umd/pdf.worker.min.js'],
  ['node_modules/jszip/dist/jszip.min.js', 'umd/jszip.min.js'],
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'umd/pdf-lib.min.js'],
  ['node_modules/docx/dist/index.iife.js', 'umd/docx.iife.js'],
  ['node_modules/docx/dist/charts.iife.js', 'umd/docx-charts.iife.js'],
  ['node_modules/exceljs/dist/exceljs.min.js', 'umd/exceljs.min.js'],
  // QR code (js/qr-code.js) : le générateur que charge l'app, et jsQR (tests seulement : relit le QR code dessiné, dev-tests/scenarios-qr-code.js).
  ['node_modules/qrcode-generator/qrcode.js', 'umd/qrcode.min.js'],
  ['node_modules/jsqr/dist/jsQR.js', 'umd/jsqr.js'],
  // Lecture du Markdown (js/markdown-import.js) : marked 15.0.12, le fichier que cdnjs sert sous le même nom.
  ['node_modules/marked/marked.min.js', 'umd/marked.min.js'],
  // Le graphique créé (extensions/graphique/chart-make.js) : ECharts 6.1.0, le paquet complet que jsDelivr sert sous dist/echarts.min.js (GFS en donne l'adresse ; les essais la détournent vers ce fichier).
  ['node_modules/echarts/dist/echarts.min.js', 'umd/echarts.min.js'],
];
for (const [from, to] of umd) {
  try { copyFileSync(from, to); }
  catch (e) { console.warn('[build-offline] introuvable, ignore :', from, '-', e.code); }
}
// Le fichier « edition-live » de Grist Factory Suite (consigne GFS 012, contrats 2.6 : l'écriture en direct) : ses six paquets en UN module ES qui se range dans globalThis.GfsPaquets['edition-live'],
// avec les noms nus de l'éditeur de l'app (@tiptap/core, prosemirror-*) laissés tels quels. Mêmes réglages que l'outil d'assemblage de GFS (outils/assemblage.mjs, BUILD_OPTIONS et registrySource) ; les
// octets peuvent différer des siens (autre esbuild), le contenu et la forme sont les mêmes. Les essais le servent à la place de GFS.
// Les paquets et la recette sont dans edition-live.json, à part de package.json : la liste de l'app ne nomme pas les bibliothèques d'une extension (comme le graphique), c'est GFS qui les porte. Sans ce fichier
// (le labo de GFS, build-mirror.sh, ne copie que ce script et package.json), cette étape est sautée : le labo n'en a pas besoin, GFS donne le sien.
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

console.log('[build-offline] OK -', Object.keys(map).length, 'modules ESM +', umd.length, 'UMD', liveBuilt ? '+ edition-live' : '(' + LIVE_SPEC + ' absent : le fichier edition-live n\'est pas construit)', pdfjsBuilt ? '+ pdfjs' : '(' + PDFJS_SPEC + ' absent : le fichier pdfjs n\'est pas construit)');
