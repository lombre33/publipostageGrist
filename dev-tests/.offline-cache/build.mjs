// Bundle les memes versions exactes que l'importmap de index.html en modules ESM locaux.
// `splitting: true` est INDISPENSABLE : sans lui, chaque entree embarquerait sa propre copie de
// ProseMirror, et deux copies de prosemirror-state/view dans la meme page cassent TipTap
// (instanceof croises, plugin keys dupliquees).
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';

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
  ['node_modules/exceljs/dist/exceljs.min.js', 'umd/exceljs.min.js'],
  // QR code (js/qr-code.js) : le générateur que charge l'app, et jsQR (tests seulement : relit le QR code dessiné, dev-tests/scenarios-qr-code.js).
  ['node_modules/qrcode-generator/qrcode.js', 'umd/qrcode.min.js'],
  ['node_modules/jsqr/dist/jsQR.js', 'umd/jsqr.js'],
  // Lecture du Markdown (js/markdown-import.js) : marked 15.0.12, le fichier que cdnjs sert sous le même nom.
  ['node_modules/marked/marked.min.js', 'umd/marked.min.js'],
];
for (const [from, to] of umd) {
  try { copyFileSync(from, to); }
  catch (e) { console.warn('[build-offline] introuvable, ignore :', from, '-', e.code); }
}
// Le fichier « edition-live » de Grist Factory Suite (consigne GFS 012, contrats 2.6 : l'écriture en direct) : les six paquets en UN module ES qui se range dans
// globalThis.GfsPaquets['edition-live'], avec les noms nus de l'éditeur de l'app (@tiptap/core, prosemirror-*) laissés tels quels. Mêmes réglages que l'outil d'assemblage de GFS
// (outils/assemblage.mjs, BUILD_OPTIONS et registrySource) ; les octets peuvent différer des siens (autre esbuild), le contenu et la forme sont les mêmes. Les essais le servent à la place de GFS.
const LIVE_MODULES = ['yjs', 'y-protocols/awareness', '@tiptap/y-tiptap', '@tiptap/extension-collaboration', '@tiptap/extension-collaboration-caret'];
const LIVE_EXTERNAL = ['@tiptap/core', 'prosemirror-model', 'prosemirror-state', 'prosemirror-transform', 'prosemirror-view'];
const LIVE_ALIAS = { '@tiptap/pm/model': 'prosemirror-model', '@tiptap/pm/state': 'prosemirror-state', '@tiptap/pm/transform': 'prosemirror-transform', '@tiptap/pm/view': 'prosemirror-view' };
const liveRegistry = `${LIVE_MODULES.map((name, i) => `import * as m${i} from ${JSON.stringify(name)};`).join('\n')}\n`
  + `(globalThis.GfsPaquets ||= {})["edition-live"] = { version: "1.0.0", modules: { ${LIVE_MODULES.map((name, i) => `${JSON.stringify(name)}: m${i}`).join(', ')} } };\n`;
const live = await build({
  bundle: true, format: 'esm', target: 'es2022', platform: 'browser', minify: true, legalComments: 'none',
  absWorkingDir: process.cwd(), write: false, logLevel: 'warning',
  stdin: { contents: liveRegistry, resolveDir: process.cwd(), sourcefile: 'registre.js' },
  alias: LIVE_ALIAS, external: LIVE_EXTERNAL,
});
mkdirSync('edition-live', { recursive: true });
writeFileSync('edition-live/edition-live.js', live.outputFiles[0].contents);

console.log('[build-offline] OK -', Object.keys(map).length, 'modules ESM +', umd.length, 'UMD');
