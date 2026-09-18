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
  '@tiptap/core', '@tiptap/starter-kit', '@tiptap/extension-underline',
  '@tiptap/extension-text-align', '@tiptap/extension-text-style', '@tiptap/extension-font-family',
  '@tiptap/extension-table', '@tiptap/extension-table-row', '@tiptap/extension-table-cell',
  '@tiptap/extension-table-header', '@tiptap/extension-task-list', '@tiptap/extension-task-item',
  '@tiptap/extension-placeholder',
  '@tiptap/suggestion', '@floating-ui/dom',
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
  ['node_modules/html2pdf.js/dist/html2pdf.bundle.min.js', 'umd/html2pdf.bundle.min.js'],
  ['node_modules/docx/dist/index.iife.js', 'umd/docx.iife.js'],
];
for (const [from, to] of umd) {
  try { copyFileSync(from, to); }
  catch (e) { console.warn('[build-offline] introuvable, ignore :', from, '-', e.code); }
}
console.log('[build-offline] OK -', Object.keys(map).length, 'modules ESM +', umd.length, 'UMD');
