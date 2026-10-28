#!/usr/bin/env node
// Le registre des actions de Ctrl + Z (dev-tests/undo-ledger.json) tient debout, sans navigateur - suite de la demande d'Antoine du 22/10 : « Il doit prendre en compte 100% des actions faites dans le widget ».
// Le balayage (dev-tests/scenarios-undo-sweep.js, groupe undoSweep) en lit chaque entrée dans le navigateur ; ici, ce qui se voit sans le lancer :
//  1) chaque entrée a une classe connue et ce que sa classe exige : `start` (un document de départ du balayage) pour `model`, `window` et `view` ; `drive` (des gestes connus, dont les fonctions nommées existent dans
//     le balayage) pour `window` ; `cases` (des groupes ou des scripts de run-headless.mjs, dont le fichier existe ET contient un vrai Annuler : une touche Ctrl + Z, l'appel d'undo ou le bouton Annuler) pour `covered`
//     et `own-undo` ; `via` (un contrôle que le balayage essaie à la place) pour `inside` ; `lot` pour `pending` ;
//  2) les réglages d'un essai sont bien formés : `set` (une option ou un texte), `keyOnFocus` (`ignored` ou `field`), `open` et `setup` qui désignent des contrôles du registre, `dynamic` accompagné de son `open` ;
//  3) chaque bouton à identifiant de index.html - la barre, les fenêtres, les Réglages - a son entrée : un bouton ajouté sans être classé fait échouer cet essai, avant même le balayage ;
//  4) aucune entrée n'est cachée derrière une entrée plus large qui la précède (la première qui convient l'emporte) ;
//  5) ce que le registre garde en attente (`pending`) est compté par lot, et les contrôles où Ctrl + Z reste au contrôle qui a le focus (`keyOnFocus: ignored`) sont comptés aussi : tant qu'il en reste, Ctrl + Z ne
//     couvre pas 100 % des actions - le lot qui les traite les reclasse.
// Lancer : node dev-tests/unit-undo-ledger.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(join(ROOT, rel), 'utf8');
const ledger = JSON.parse(read('dev-tests/undo-ledger.json'));
const controls = Object.entries(ledger.controls);
const globRe = pattern => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
const entryFor = key => controls.find(([pattern]) => globRe(pattern).test(key));

// Les documents de départ et les fonctions de geste du balayage, lus dans son fichier.
const sweep = read('dev-tests/scenarios-undo-sweep.js');
const fixtures = new Set(Array.from(sweep.matchAll(/\{ name: '([A-Za-z]+)', markup:/g)).map(m => m[1]));
const driveFunctions = new Set(Array.from(sweep.matchAll(/^\s{4}async (\w+)\(\) \{/gm)).map(m => m[1]));
// Les groupes et les scripts de run-headless.mjs, avec le fichier de chacun.
const runner = read('dev-tests/run-headless.mjs');
const groupsText = runner.slice(runner.indexOf('const GROUPS'), runner.indexOf('const NODE_SCRIPTS'));
const scriptsText = runner.slice(runner.indexOf('const NODE_SCRIPTS'));
const files = new Map();
for (const m of groupsText.matchAll(/^\s{2}(\w+):\s*'([^']+)'/gm)) files.set(m[1], 'dev-tests/' + m[2] + '.js');
for (const m of scriptsText.matchAll(/^\s{2}(\w+):\s*'([^']+)'/gm)) files.set(m[1], 'dev-tests/' + m[2]);
// Un vrai Annuler dans un fichier d'essais : la touche Ctrl + Z (frappée ou dite), l'appel d'undo de l'éditeur, ou le bouton Annuler de la barre.
const UNDO_EVIDENCE = /\.undo\(\)|Control\+z|press\(\s*['"]z['"]|v2-btn-undo|Ctrl ?\+ ?Z/i;

const CLASSES = Object.keys(ledger.classes);
const TRIED = ['model', 'window', 'view'];
const STEPS = new Set(['click', 'clickText', 'type', 'prompt', 'wait', 'control']);

check('le registre porte ses classes et ses entrées', CLASSES.length >= 9 && controls.length > 100, { classes: CLASSES.length, controls: controls.length });

const unknownClass = controls.filter(([, entry]) => CLASSES.indexOf(entry.class) === -1).map(([key]) => key);
check('chaque entrée a une classe connue', unknownClass.length === 0, unknownClass.slice(0, 5));

const noStart = controls.filter(([, entry]) => TRIED.indexOf(entry.class) !== -1 && !fixtures.has(entry.start)).map(([key, entry]) => key + ' -> ' + entry.start);
check('chaque contrôle essayé (model, window, view) a un document de départ que le balayage connaît (' + fixtures.size + ' documents)', noStart.length === 0, noStart.slice(0, 5));

const badDrive = [];
controls.forEach(([key, entry]) => {
  if (entry.class === 'window') {
    if (!Array.isArray(entry.drive) || !entry.drive.length) badDrive.push(key + ' : pas de geste');
    else entry.drive.forEach(step => {
      const op = step[0];
      if (typeof op === 'string' && op.charAt(0) === '@') { if (!driveFunctions.has(op.slice(1))) badDrive.push(key + ' : fonction de geste inconnue ' + op); }
      else if (!STEPS.has(op)) badDrive.push(key + ' : geste inconnu ' + op);
    });
  } else if (entry.drive) badDrive.push(key + ' : `drive` ne va qu\'aux fenêtres');
  if (entry.setup) entry.setup.forEach(step => {
    if (!STEPS.has(step[0])) badDrive.push(key + ' : geste de départ inconnu ' + step[0]);
    else if (step[0] === 'control' && !entryFor(step[1])) badDrive.push(key + ' : le contrôle de départ ' + step[1] + ' n\'est pas au registre');
  });
});
check('chaque fenêtre porte le geste qui la remplit et la valide, fait de gestes connus', badDrive.length === 0, badDrive.slice(0, 5));

const badCases = [];
const evidence = new Map();
const hasUndo = name => {
  if (!evidence.has(name)) evidence.set(name, existsSync(join(ROOT, files.get(name))) && UNDO_EVIDENCE.test(read(files.get(name))));
  return evidence.get(name);
};
controls.forEach(([key, entry]) => {
  const needs = entry.class === 'covered' || entry.class === 'own-undo';
  if (needs && !(Array.isArray(entry.cases) && entry.cases.length)) badCases.push(key + ' : pas de `cases`');
  (entry.cases || []).forEach(name => {
    if (!files.has(name)) badCases.push(key + ' : « ' + name + ' » n\'est ni un groupe ni un script de run-headless.mjs');
    else if (!existsSync(join(ROOT, files.get(name)))) badCases.push(key + ' : le fichier de « ' + name + ' » (' + files.get(name) + ') n\'existe pas');
    else if (!hasUndo(name)) badCases.push(key + ' : « ' + name + ' » ne défait rien (ni Ctrl + Z, ni undo, ni bouton Annuler) : il ne prouve pas que Ctrl + Z rend ce contrôle');
  });
});
check('chaque contrôle renvoyé à un groupe ou à un script (covered, own-undo) en nomme qui existent et qui défont vraiment', badCases.length === 0, badCases.slice(0, 5));

const badInside = controls.filter(([, entry]) => entry.class === 'inside').map(([key, entry]) => {
  const target = entry.via && controls.find(([pattern]) => pattern === entry.via);
  if (!entry.via) return key + ' : pas de `via`';
  if (!target) return key + ' : `via` ' + entry.via + ' n\'est pas une entrée du registre';
  if (TRIED.indexOf(target[1].class) === -1) return key + ' : `via` ' + entry.via + ' n\'est pas essayé par le balayage (' + target[1].class + ')';
  return null;
}).filter(Boolean);
check('chaque choix « inside » renvoie à un contrôle que le balayage essaie', badInside.length === 0, badInside.slice(0, 5));

const badTrial = [];
controls.forEach(([key, entry]) => {
  if (entry.set !== undefined) {
    const one = entry.set && typeof entry.set === 'object' && (Number.isInteger(entry.set.option) !== (typeof entry.set.text === 'string'));
    if (!one || (entry.set.option !== undefined && entry.set.option < 0)) badTrial.push(key + ' : `set` doit porter une option (entier) OU un texte');
    if (['model', 'window'].indexOf(entry.class) === -1) badTrial.push(key + ' : `set` ne va qu\'aux contrôles model ou window');
  }
  if (entry.keyOnFocus !== undefined && ['ignored', 'field'].indexOf(entry.keyOnFocus) === -1) badTrial.push(key + ' : `keyOnFocus` vaut « ignored » ou « field »');
  if (entry.keyOnFocus !== undefined && ['model', 'window'].indexOf(entry.class) === -1) badTrial.push(key + ' : `keyOnFocus` ne va qu\'aux contrôles model ou window');
  if (entry.open !== undefined && !entryFor(entry.open)) badTrial.push(key + ' : `open` ' + entry.open + ' n\'est pas au registre');
  if (entry.dynamic && TRIED.indexOf(entry.class) !== -1 && !entry.open) badTrial.push(key + ' : `dynamic` demande l\'`open` du menu qui le dessine');
  if (entry.dynamic && key.indexOf('*') !== -1 && entry.class !== 'inside') badTrial.push(key + ' : un contrôle `dynamic` essayé porte une clé précise (sans *)');
});
check('les réglages d\'un essai (set, keyOnFocus, open, dynamic) sont bien formés', badTrial.length === 0, badTrial.slice(0, 5));

const badPending = controls.filter(([, entry]) => entry.class === 'pending' && !entry.lot).map(([key]) => key);
check('chaque contrôle en attente dit quel lot le traite', badPending.length === 0, badPending.slice(0, 5));

// Les boutons à identifiant de index.html : tous classés.
const html = read('index.html');
const ids = Array.from(new Set(Array.from(html.matchAll(/<button\b[^>]*?\sid="([^"]+)"/g)).map(m => m[1])));
const unclassified = ids.filter(id => !entryFor('#' + id));
check('chacun des ' + ids.length + ' boutons à identifiant de index.html a son entrée du registre', unclassified.length === 0, unclassified.slice(0, 10));

// Une entrée plus précise que celle qui la précède n'est jamais choisie.
const shadowed = [];
controls.forEach(([pattern], index) => {
  const earlier = controls.slice(0, index).find(([other]) => other !== pattern && globRe(other).test(pattern.replace(/\*/g, 'x')));
  if (earlier && pattern.indexOf('*') === -1) shadowed.push(pattern + ' (cachée par ' + earlier[0] + ')');
});
check('aucune entrée n\'est cachée derrière une entrée plus large qui la précède', shadowed.length === 0, shadowed.slice(0, 5));

const pending = {};
controls.filter(([, entry]) => entry.class === 'pending').forEach(([, entry]) => { pending[entry.lot] = (pending[entry.lot] || 0) + 1; });
const classCounts = {};
controls.forEach(([, entry]) => { classCounts[entry.class] = (classCounts[entry.class] || 0) + 1; });
const keyIgnored = controls.filter(([, entry]) => entry.keyOnFocus === 'ignored').length;
console.log('  registre : ' + JSON.stringify(classCounts) + ' ; en attente par lot : ' + JSON.stringify(pending) + ' ; Ctrl + Z sans effet avec le focus sur le contrôle : ' + keyIgnored);

summarizeAndExit();
