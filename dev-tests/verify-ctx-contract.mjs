#!/usr/bin/env node
// Contrat de `ctx` des fichiers découpés (refactorisation du 06/11, découpes 3 et 4). Un morceau reçoit de son fichier d'origine un objet de contexte et en lit des noms : un nom que personne
// ne donne n'est pas une erreur de chargement (`ctx.nom` est `undefined`, la destructuration d'un nom absent aussi), il ne casse qu'au geste qui l'appelle - un menu, un bouton, une
// fenêtre qu'on n'ouvre pas tous les jours. Ce script lit les fichiers (sans navigateur, une seconde) et vérifie que chaque nom lu est donné :
//  - js/variable-condition-{otherwise,clipboard,rules,preview}.js lisent `ctx.nom` : donnés par le littéral `const ctx = { … }` de js/variable-condition.js, par ce que chaque morceau rend
//    (`return { … }` de son `create`) ou par `Object.assign(ctx, { … })` de la fenêtre ;
//  - js/free-frame-toolbar.js lit `api` (`const { … } = api;`) et js/free-frame-{line,box}-menus.js `ctx.api` : donnés par l'objet que `wireToolbar` de js/free-frame.js passe à
//    `FrameToolbar.wire(ed, { … })` ; les menus lisent aussi `ctx` (`const { … } = ctx;`) : donné par le littéral `const ctx = { ed, api, … }` de la barre.
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

// ---- les détecteurs eux-mêmes ---------------------------------------------------------------------------------------------------------------------------------------------
check('détecteur : un nom retiré de ce que donne wireToolbar est vu', missing(destructured(ffToolbar, 'api'), ffGiven.filter(name => name !== 'selectedFrame')).includes('selectedFrame'), null);
check('détecteur : un nom retiré de ce que donne la fenêtre est vu', missing(contextUsed(vcWindow + ' ctx.nomQuePersonneNeDonne'), vcGiven).includes('nomQuePersonneNeDonne'), null);
check('détecteur : une destructuration sur plusieurs lignes est lue', destructured('const {\n  a, b,\n  c,\n} = api;', 'api').join() === 'a,b,c', destructured('const {\n  a, b,\n  c,\n} = api;', 'api'));
check('détecteur : le littéral de ctx est lu avec ses valeurs', literalKeys('const ctx = { level, win: null, refs: null };', 'const ctx = {').join() === 'level,win,refs', null);

const failed = results.filter(r => !r.ok);
console.log(`${pass}/${results.length} passés`);
process.exit(failed.length ? 1 : 0);
