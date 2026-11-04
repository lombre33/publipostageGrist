#!/usr/bin/env node
// Recompte les nombres de public/CARTE_DU_CODE.md (français et anglais) d'après le dépôt de développement : le volume, les familles, les feuilles de style, js/main.js.
// Usage : node outils/depot-propre/numeros-carte.mjs [<dépôt de développement>] [--fix]
//   sans --fix, dit seulement ce qui changerait ; avec --fix, réécrit la carte (les dates restent des gabarits {{DATE_FR}}).
// Les lignes se comptent comme `wc -l`, arrondies à la centaine (à la dizaine sous 1 000) ; les parts d'un total (code, commentaires et blanc ; les dossiers d'extensions) s'additionnent
// au total arrondi. Une famille (« ### Titre (N fichiers, L lignes) ») compte les fichiers de js/ que la première colonne de son tableau nomme, comme controles.mjs : un fichier
// qu'un rôle cite en passant n'est pas à elle. Les mots de la carte (« six scripts et deux feuilles de style ») ne se recomptent pas ici : controles.mjs ne les voit pas non plus, à relire.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const repo = args.find(arg => !arg.startsWith('--')) || join(dirname(fileURLToPath(import.meta.url)), '../..');
const mapPath = join(repo, 'outils/depot-propre/public/CARTE_DU_CODE.md');
let text = readFileSync(mapPath, 'utf8');
const original = text;

const wc = rel => readFileSync(join(repo, rel), 'utf8').split('\n').length - 1;
const filesOf = dir => readdirSync(join(repo, dir)).filter(name => statSync(join(repo, dir, name)).isFile()).sort();
const unitOf = total => (total >= 1000 ? 100 : 10);
const round = n => Math.round(n / unitOf(n)) * unitOf(n);
// Des parts qui s'additionnent au total arrondi : chacune est arrondie par le bas, puis les unités qui manquent vont aux plus grands restes.
function share(total, parts) {
  const unit = unitOf(total);
  const rounded = parts.map(part => Math.floor(part / unit) * unit);
  let missing = (Math.round(total / unit) * unit - rounded.reduce((sum, part) => sum + part, 0)) / unit;
  const byRest = parts.map((part, index) => [part - rounded[index], index]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; missing > 0 && k < byRest.length; k++, missing--) rounded[byRest[k][1]] += unit;
  return { total: Math.round(total / unit) * unit, parts: rounded };
}
const format = { fr: n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '), en: n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') };

// --- js/ : fichiers, lignes, code / commentaires / blanc (un commentaire seul sur sa ligne, `//` ou `/* … */`, est un commentaire)
let code = 0, comment = 0, blank = 0;
const jsFiles = filesOf('js').filter(name => name.endsWith('.js'));
for (const name of jsFiles) {
  let inBlock = false;
  for (const raw of readFileSync(join(repo, 'js', name), 'utf8').split('\n').slice(0, -1)) {
    const line = raw.trim();
    if (inBlock) { comment++; if (line.includes('*/')) inBlock = false; continue; }
    if (!line) { blank++; continue; }
    if (line.startsWith('//')) { comment++; continue; }
    if (line.startsWith('/*')) { comment++; if (!line.includes('*/')) inBlock = true; continue; }
    code++;
  }
}
const jsLines = code + comment + blank;
const sheets = filesOf('css').filter(name => name.endsWith('.css'));
const sheetLines = sheets.reduce((sum, name) => sum + wc(`css/${name}`), 0);
const pageLines = wc('index.html');
const mainLines = wc('js/main.js');
// La phrase du volume nomme les dossiers d'extensions un à un : un dossier de plus ou de moins la rendrait fausse.
const extensionDirs = ['graphique', 'edition', 'diapositives', 'lecture-pdf'];
const extensionDirsHere = readdirSync(join(repo, 'extensions')).filter(name => statSync(join(repo, 'extensions', name)).isDirectory()).sort();
const extensionsNamed = extensionDirsHere.join() === [...extensionDirs].sort().join();
const extensions = extensionDirsHere.map(name => filesOf(`extensions/${name}`).reduce((sum, file) => sum + wc(`extensions/${name}/${file}`), 0));
const extensionFiles = extensionDirsHere.reduce((sum, name) => sum + filesOf(`extensions/${name}`).length, 0);
console.log(`js/ : ${jsFiles.length} fichiers, ${jsLines} lignes (code ${code}, commentaires ${comment}, blanc ${blank}) ; extensions/ : ${extensionFiles} fichiers, ${extensions.reduce((a, b) => a + b, 0)} lignes (${extensionDirsHere.map((name, i) => `${name} ${extensions[i]}`).join(', ')}) ; css/ : ${sheets.length} feuilles, ${sheetLines} lignes ; index.html ${pageLines} lignes ; main.js ${mainLines} lignes`);

const changes = [];
const NUMBER = Symbol('nombre');
const escaped = literal => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +/g, '\\s+');
// Un motif est fait de textes (chaînes) et de nombres (NUMBER) en alternance ; `values` remplace les nombres, dans l'ordre, et les textes sont rendus tels quels (retours à la ligne compris).
function swap(label, lang, pieces, values) {
  const number = lang === 'fr' ? '(\\d+(?: \\d{3})*)' : '(\\d+(?:,\\d{3})*)';
  const regex = new RegExp(pieces.map(piece => (piece === NUMBER ? number : `(${escaped(piece)})`)).join(''), 'g');
  const found = [...text.matchAll(regex)];
  if (found.length !== 1) { console.log(`ATTENTION : « ${label} » trouvé ${found.length} fois (1 attendu)`); return; }
  let k = 0;
  const out = found[0].slice(1).map((group, i) => (pieces[i] === NUMBER ? format[lang](values[k++]) : group)).join('');
  if (out !== found[0][0]) {
    changes.push(`${label} : « ${found[0][0].replace(/\s+/g, ' ')} » → « ${out.replace(/\s+/g, ' ')} »`);
    text = text.slice(0, found[0].index) + out + text.slice(found[0].index + found[0][0].length);
  }
}

if (!extensionsNamed) console.log(`ATTENTION : extensions/ porte ${extensionDirsHere.join(', ')}, la carte nomme ${extensionDirs.join(', ')} : le volume n'est pas recompté`);
else {
  const jsShare = share(jsLines, [code, comment, blank]);
  const extShare = share(extensions.reduce((a, b) => a + b, 0), extensionDirs.map(name => extensions[extensionDirsHere.indexOf(name)]));
  const volume = [jsFiles.length, jsShare.total, ...jsShare.parts, extensionFiles, extShare.total, ...extShare.parts, sheets.length, round(sheetLines), round(pageLines)];
  swap('volume (FR)', 'fr', ['**Le volume** : ', NUMBER, ' fichiers dans `js/` (', NUMBER, ' lignes : ', NUMBER, ' de code, ', NUMBER, ' de commentaires, ', NUMBER, ' de blanc), ', NUMBER,
    ' dans `extensions/` (', NUMBER, ' lignes, dont ', NUMBER, ' dans `graphique/`, ', NUMBER, ' dans `edition/`, ', NUMBER, ' dans `diapositives/` et ', NUMBER, ' dans `lecture-pdf/`), ', NUMBER,
    ' feuilles de style (', NUMBER, ' lignes), une page de ', NUMBER, ' lignes.'], volume);
  swap('volume (EN)', 'en', ['**The size**: ', NUMBER, ' files in `js/` (', NUMBER, ' lines: ', NUMBER, ' of code, ', NUMBER, ' of comments, ', NUMBER, ' blank), ', NUMBER,
    ' in `extensions/` (', NUMBER, ' lines, ', NUMBER, ' of them in `graphique/`, ', NUMBER, ' in `edition/`, ', NUMBER, ' in `diapositives/` and ', NUMBER, ' in `lecture-pdf/`), ', NUMBER,
    ' stylesheets (', NUMBER, ' lines), a ', NUMBER, '-line page.'], volume);
}
// Les feuilles de style que la carte nomme (style, toolbar-v2, editor-v2, roboto-fonts) ne vont pas avec un module ; « les N autres » si.
swap('feuilles de style (FR)', 'fr', ['les ', NUMBER, ' autres vont chacune'], [sheets.length - 4]);
swap('feuilles de style (EN)', 'en', ['the other ', NUMBER, ' each go with'], [sheets.length - 4]);
swap('main.js (FR)', 'fr', ['`js/main.js` (', NUMBER, ' lignes)'], [round(mainLines)]);
swap('main.js (EN)', 'en', ['`js/main.js` (', NUMBER, ' lines)'], [round(mainLines)]);
swap('extensions de la famille (FR)', 'fr', ['les ', NUMBER, " fichiers d'`extensions/`"], [extensionFiles]);
swap('extensions de la famille (EN)', 'en', ['the ', NUMBER, ' files of `extensions/`'], [extensionFiles]);

// --- les familles : « ### Titre (N fichiers, L lignes) »
function families(headingRe, lang) {
  const edits = [];
  for (const match of text.matchAll(headingRe)) {
    const start = match.index + match[0].length;
    const rest = text.slice(start);
    const stop = rest.search(/\n##/);
    const owned = new Set();
    for (const row of (stop < 0 ? rest : rest.slice(0, stop)).split('\n')) {
      if (row.startsWith('| `')) for (const file of row.split('|')[1].matchAll(/`(js\/[A-Za-z0-9._-]+\.js)`/g)) if (existsSync(join(repo, file[1]))) owned.add(file[1]);
    }
    const lines = [...owned].reduce((sum, file) => sum + wc(file), 0);
    const out = `${match[1]}${owned.size}${match[3]}${format[lang](round(lines))}${match[5]}`;
    if (out !== match[0]) changes.push(`famille : « ${match[0]} » → « ${out} »`);
    edits.push({ index: match.index, length: match[0].length, out });
  }
  for (const edit of edits.reverse()) text = text.slice(0, edit.index) + edit.out + text.slice(edit.index + edit.length);
}
families(/^(### .+? \()(\d+)( fichiers, )(\d+(?: \d{3})*)( lignes\))$/gm, 'fr');
families(/^(### .+? \()(\d+)( files, )(\d+(?:,\d{3})*)( lines\))$/gm, 'en');

console.log(changes.length ? changes.map(change => '  ' + change).join('\n') : '  (aucun nombre à changer)');
if (fix && text !== original) { writeFileSync(mapPath, text); console.log('réécrit : ' + mapPath); }
else if (text !== original) console.log("(sans --fix : rien n'est écrit)");
