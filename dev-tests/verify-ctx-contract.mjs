#!/usr/bin/env node
// Contrat de `ctx` des fichiers découpés (refactorisation du 06/11, découpes 3 et 4). Un morceau reçoit de son fichier d'origine un objet de contexte et en lit des noms : un nom que personne
// ne donne n'est pas une erreur de chargement (`ctx.nom` est `undefined`, la destructuration d'un nom absent aussi), il ne casse qu'au geste qui l'appelle - un menu, un bouton, une
// fenêtre qu'on n'ouvre pas tous les jours. Ce script lit les fichiers (sans navigateur, une seconde) et vérifie que chaque nom lu est donné :
//  - js/variable-condition-{otherwise,clipboard,rules,preview}.js lisent `ctx.nom` : donnés par le littéral `const ctx = { … }` de js/variable-condition.js, par ce que chaque morceau rend
//    (`return { … }` de son `create`) ou par `Object.assign(ctx, { … })` de la fenêtre ;
//  - js/free-frame-toolbar.js lit `api` (`const { … } = api;`) et js/free-frame-{line,box}-menus.js `ctx.api` : donnés par l'objet que `wireToolbar` de js/free-frame.js passe à
//    `FrameToolbar.wire(ed, { … })` ; les menus lisent aussi `ctx` (`const { … } = ctx;`) : donné par le littéral `const ctx = { ed, api, … }` de la barre.
//  - js/main-import.js et js/main-export.js (découpes 5 et 6, l'import d'un fichier et les exports sortis de js/main.js) lisent `api` (`const { … } = api;`) : donné par l'objet que js/main.js passe
//    à `MainImport.create({ … })` / `MainExport.create({ … })` ; main.js reprend ce que le morceau rend (`return { … }` de son `create`) ; le verrou d'export est au morceau.
//  - js/main.js (découpe 7, première voie de l'autosave) : l'état partagé par l'enregistrement manuel, l'enregistrement automatique et la sortie d'un modèle est UN objet `persist` ; une faute de
//    frappe (`persist.autosaveDrity`) lit `undefined` sans erreur, donc : chaque `persist.nom` lu ou écrit est une clé du littéral, chaque clé est utilisée, et plus aucun de ces noms n'est lu seul.
//  - js/main-autosave.js, js/main-save.js et js/main-leave.js (découpe 8, l'enregistrement automatique, l'enregistrement manuel et la sortie d'un modèle) : mêmes contrôles de l'`api` que ci-dessus ; `persist` leur est
//    donné ; le type du modèle et le nom du titre leur sont prêtés par des fonctions ; créés dans l'ordre autosave, save, leave (chacun tire du précédent), après les exports et avant l'import.
//  Les détecteurs eux-mêmes : un nom retiré de ce qui est donné est vu (cas fabriqués).
// Lancé par run-headless.mjs (groupe Node « ctxContract », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-ctx-contract.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './load-lib.mjs';
import { stripCode } from './verify-api-snapshot.mjs';

const read = file => stripCode(readFileSync(join(ROOT, file), 'utf8'));
const names = text => text.split(',').map(part => part.trim().split(':')[0].trim()).filter(Boolean);

// Les noms d'un `const { a, b } = <source>;` (plusieurs lignes possibles) : toutes les destructurations de cette source dans le texte.
export function destructured(text, source) {
  const out = [];
  const re = new RegExp('const \\{([^}]*)\\} = ' + source.replace(/\./g, '\\.') + ';', 'g');
  for (const m of text.matchAll(re)) out.push(...names(m[1]));
  return out;
}
// Les clés d'un littéral `<head> { a, b: 1, c }` dont la fin est `}` à la même profondeur (les littéraux de ces fichiers n'ont pas d'accolade dedans).
export function literalKeys(text, head) {
  const at = text.indexOf(head);
  if (at < 0) return null;
  const open = text.indexOf('{', at + head.length - 1);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return names(text.slice(open + 1, i));
  }
  return null;
}
// Les noms que rend le `create` de chaque morceau : le `return { … };` qui ferme la fonction, avant `return { create };`.
export function piecesReturn(text) {
  const m = text.match(/\n {4}return \{([^}]*)\};\n {2}\}\n\n {2}return \{ create/);
  return m ? names(m[1]) : null;
}
export const contextUsed = text => [...new Set([...text.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))];

let pass = 0;
const results = [];
const check = (label, ok, detail) => { results.push({ label, ok, detail }); if (ok) pass++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ' ' + JSON.stringify(detail)}`); };
const missing = (wanted, given) => [...new Set(wanted)].filter(name => !given.includes(name)).sort();

// ---- variable-condition ----------------------------------------------------------------------------------------------------------------------------------------------
const VC_PIECES = ['otherwise', 'clipboard', 'rules', 'preview'].map(piece => `js/variable-condition-${piece}.js`);
const vcWindow = read('js/variable-condition.js');
const vcGiven = [
  ...(literalKeys(vcWindow, 'const ctx = {') || []),
  ...VC_PIECES.flatMap(file => piecesReturn(read(file)) || []),
  ...(literalKeys(vcWindow, 'Object.assign(ctx, {') || []),
];
check('variable-condition : le littéral de ctx et ce que rend chaque morceau sont lisibles', vcGiven.length > 10 && VC_PIECES.every(file => !!piecesReturn(read(file))), { given: vcGiven.length });
for (const file of ['js/variable-condition.js', ...VC_PIECES]) {
  const lack = missing(contextUsed(read(file)), vcGiven);
  check(`variable-condition : ${file} ne lit que des ctx.nom donnés`, lack.length === 0, lack);
}

// ---- free-frame --------------------------------------------------------------------------------------------------------------------------------------------------------
const FF_MENUS = ['js/free-frame-line-menus.js', 'js/free-frame-box-menus.js'];
const ffFacade = read('js/free-frame.js');
const ffToolbar = read('js/free-frame-toolbar.js');
const ffGiven = literalKeys(ffFacade, 'FrameToolbar.wire(ed, {') || [];
const ffCtx = literalKeys(ffToolbar, 'const ctx = {') || [];
check('free-frame : ce que wireToolbar donne à la barre et le littéral de ctx sont lisibles', ffGiven.length > 10 && ffCtx.length >= 4, { given: ffGiven.length, ctx: ffCtx.length });
check('free-frame : la barre ne lit de `api` que des noms donnés par wireToolbar', missing(destructured(ffToolbar, 'api'), ffGiven).length === 0, missing(destructured(ffToolbar, 'api'), ffGiven));
for (const file of FF_MENUS) {
  const text = read(file);
  check(`free-frame : ${file} ne lit de ctx.api que des noms donnés par wireToolbar`, missing(destructured(text, 'ctx.api'), ffGiven).length === 0, missing(destructured(text, 'ctx.api'), ffGiven));
  check(`free-frame : ${file} ne lit de ctx que des noms que la barre y met`, missing(destructured(text, 'ctx'), ffCtx).length === 0, missing(destructured(text, 'ctx'), ffCtx));
  check(`free-frame : ${file} rend ce que la barre en reprend`, missing(ffToolbar.match(new RegExp('const \\{([^}]*)\\} = ' + (file.includes('line') ? 'FrameLineMenus' : 'FrameBoxMenus') + '\\.create\\(ctx\\);'))?.[1].split(',').map(n => n.trim()).filter(Boolean) || ['(introuvable)'], piecesReturn(text) || []).length === 0, null);
}
check('free-frame : la façade range ce que `wire` rend (la barre et son rafraîchissement)', /toolbar = wired\.panel;/.test(ffFacade) && /syncBar = wired\.sync;/.test(ffFacade) && /return \{ panel, sync \};/.test(ffToolbar), null);

// ---- les morceaux sortis de js/main.js (import, exports) -------------------------------------------------------------------------------------------------------------------
const miMain = read('js/main.js');
const MAIN_PIECES = [['MainImport', 'js/main-import.js'], ['MainExport', 'js/main-export.js'], ['MainAutosave', 'js/main-autosave.js'], ['MainSave', 'js/main-save.js'], ['MainLeave', 'js/main-leave.js']];
const mainPieces = MAIN_PIECES.map(([module, file]) => {
  const piece = read(file);
  const taken = (new RegExp(`const \\{([^}]*)\\} = ${module}\\.create\\(`).exec(miMain) || [, ''])[1];
  return { module, file, given: literalKeys(miMain, `${module}.create({`) || [], wanted: destructured(piece, 'api'), returned: piecesReturn(piece) || [], taken: names(taken) };
});
for (const { module, file, given, wanted, returned, taken } of mainPieces) {
  check(`${file} : ce que main.js donne à ${module}.create, ce que le morceau en lit et ce qu'il rend sont lisibles`, given.length >= 6 && wanted.length >= 6 && returned.length >= 4 && taken.length >= 4, { given: given.length, wanted: wanted.length, returned: returned.length, taken: taken.length });
  check(`${file} : le morceau ne lit de \`api\` que des noms donnés par main.js`, missing(wanted, given).length === 0, missing(wanted, given));
  check(`${file} : main.js ne reprend que des noms que le morceau rend`, missing(taken, returned).length === 0, missing(taken, returned));
  check(`${file} : chaque nom que main.js donne au morceau est lu par lui (aucun nom donné pour rien)`, missing(given, wanted).length === 0, missing(given, wanted));
}
check('js/main-export.js : le verrou d\'export est à lui (déclaré dans le morceau, rendu par isExportRunning, jamais lu par son nom dans main.js)',
  /\n {4}let exportOperationInProgress = false;/.test(read('js/main-export.js')) && /const isExportRunning = \(\) => exportOperationInProgress;/.test(read('js/main-export.js')) && !/\bexportOperationInProgress\b/.test(miMain), null);

// ---- l'état de l'enregistrement (objet `persist` de js/main.js) ---------------------------------------------------------------------------------------------------------------
const SAVE_PIECES = ['js/main-autosave.js', 'js/main-save.js', 'js/main-leave.js']; // l'enregistrement automatique, l'enregistrement manuel, la sortie d'un modèle (découpe 8)
const PERSIST_FILES = ['js/main.js', ...SAVE_PIECES]; // les fichiers qui lisent l'objet
const persistKeys = literalKeys(miMain, 'const persist = {') || [];
const persistUsed = text => [...new Set([...text.matchAll(/(?<![\w$.])persist\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))];
const persistBare = (text, keys) => keys.filter(key => new RegExp('(?<![\\w$.])' + key + '\\b(?!\\s*:)').test(text));
const persistRead = PERSIST_FILES.map(file => read(file)).join('\n');
check('js/main.js : le littéral `persist` est lisible (les 19 variables de l\'enregistrement, sans doublon)', persistKeys.length === 19 && new Set(persistKeys).size === persistKeys.length, persistKeys);
check('l\'objet `persist` : chaque `persist.nom` lu ou écrit est une clé du littéral (une faute de frappe lirait `undefined` sans rien casser)', missing(persistUsed(persistRead), persistKeys).length === 0, missing(persistUsed(persistRead), persistKeys));
check('l\'objet `persist` : chaque clé du littéral est utilisée ailleurs (aucune clé pour rien)', missing(persistKeys, persistUsed(persistRead)).length === 0, missing(persistKeys, persistUsed(persistRead)));
check('l\'objet `persist` : aucun de ses noms n\'est plus lu seul dans main.js ni dans les trois fichiers (ni `let`, ni variable libre)', PERSIST_FILES.every(file => persistBare(read(file), persistKeys).length === 0), PERSIST_FILES.map(file => [file, persistBare(read(file), persistKeys)]).filter(([, bare]) => bare.length));
// ---- l'enregistrement en trois fichiers (découpe 8) : `persist` donné aux trois, deux variables prêtées par fonctions, ordre de création --------------------------------------
const SAVE_MODULES = ['MainAutosave', 'MainSave', 'MainLeave'];
const savePositions = SAVE_MODULES.map(module => miMain.indexOf(module + '.create('));
// Un nom que main.js donne à un morceau doit exister dans main.js (sinon : ReferenceError au chargement) : une fonction, une constante, une variable, ou ce que rend un autre morceau.
const mainDeclared = new Set([...miMain.matchAll(/(?:function|const|let) ([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
for (const module of MAIN_PIECES.map(([name]) => name)) for (const m of miMain.matchAll(new RegExp(`const \\{([^}]*)\\} = ${module}\\.create\\(`, 'g'))) names(m[1]).forEach(name => mainDeclared.add(name));
const undeclaredGiven = mainPieces.flatMap(({ file, given }) => given.filter(name => !mainDeclared.has(name) && !/^(get|set)[A-Z]/.test(name)).map(name => `${file} : ${name}`));
check('js/main.js : chaque nom donné à un morceau (import, exports, autosave, enregistrement, sortie) existe dans main.js', undeclaredGiven.length === 0, undeclaredGiven);
check('js/main.js : l\'autosave, l\'enregistrement et la sortie d\'un modèle sont créés dans cet ordre, après les exports et avant l\'import (chacun tire du précédent)', savePositions.every(at => at > 0) && savePositions[0] < savePositions[1] && savePositions[1] < savePositions[2] && miMain.indexOf('MainExport.create(') < savePositions[0] && savePositions[2] < miMain.indexOf('MainImport.create('), savePositions);
check('l\'objet `persist` est donné à chacun des trois fichiers (par son nom)', SAVE_MODULES.every(module => (literalKeys(miMain, module + '.create({') || []).includes('persist')), SAVE_MODULES.filter(module => !(literalKeys(miMain, module + '.create({') || []).includes('persist')));
check('les trois fichiers ne lisent le type du modèle que par getCurrentTypeModele et le nom du titre que par getTitleNameBase / setTitleNameBase (jamais les variables de main.js)',
  SAVE_PIECES.every(file => !/(?<![\w$.])(currentTypeModele|titleNameBase)\b(?!\s*:)/.test(read(file))) && /getCurrentTypeModele: \(\) => currentTypeModele/.test(miMain) && /getTitleNameBase: \(\) => titleNameBase/.test(miMain) && /setTitleNameBase: value => \{ titleNameBase = value; \}/.test(miMain), null);

// ---- les détecteurs eux-mêmes ---------------------------------------------------------------------------------------------------------------------------------------------
check('détecteur : un nom retiré de ce que donne wireToolbar est vu', missing(destructured(ffToolbar, 'api'), ffGiven.filter(name => name !== 'selectedFrame')).includes('selectedFrame'), null);
check('détecteur : un nom retiré de ce que donne la fenêtre est vu', missing(contextUsed(vcWindow + ' ctx.nomQuePersonneNeDonne'), vcGiven).includes('nomQuePersonneNeDonne'), null);
check('détecteur : un nom retiré de ce que donne main.js à un morceau (import, exports) est vu', mainPieces.filter(piece => piece.wanted.includes('setStatus')).length >= 4 && mainPieces.filter(piece => piece.wanted.includes('setStatus')).every(piece => missing(piece.wanted, piece.given.filter(name => name !== 'setStatus')).includes('setStatus')), null);
check('détecteur : une faute de frappe sur `persist.` et un nom lu seul sont vus', missing(persistUsed(persistRead + ' persist.autosaveDrity = 1;'), persistKeys).join() === 'autosaveDrity' && persistBare(persistRead + ' if (autosaveDirty) {}', persistKeys).join() === 'autosaveDirty' && persistBare(persistRead, persistKeys).length === 0, null);
check('détecteur : une destructuration sur plusieurs lignes est lue', destructured('const {\n  a, b,\n  c,\n} = api;', 'api').join() === 'a,b,c', destructured('const {\n  a, b,\n  c,\n} = api;', 'api'));
check('détecteur : le littéral de ctx est lu avec ses valeurs', literalKeys('const ctx = { level, win: null, refs: null };', 'const ctx = {').join() === 'level,win,refs', null);

const failed = results.filter(r => !r.ok);
console.log(`${pass}/${results.length} passés`);
process.exit(failed.length ? 1 : 0);
