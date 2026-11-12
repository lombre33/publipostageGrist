#!/usr/bin/env node
// La liste unique des bibliothèques, relue par l'outil du kit (consignes 063 et 067 de GFS). Une version s'écrit une fois, dans package.json à la racine ; l'outil du kit (kit/outils/bibliotheques.mjs) en tire
// le catalogue (bibliotheques/catalogue.json), la carte d'importation et le script-src d'index.html. Son mode --verifier relit ces trois fichiers SANS réseau et sort en 1 au moindre écart : c'est ce que joue cet
// essai, sur la liste et la page telles qu'elles sont commitées, puis sur des copies où l'on défait UNE chose à la fois (ce que ferait une version montée à la main, une source ajoutée à la main) :
//  1) la liste, le catalogue et la page commités sont cohérents : code 0, « liste, catalogue et politique cohérents » ;
//  2) une version montée dans la liste sans relancer l'outil : refusée, la bibliothèque nommée ;
//  3) une version montée à la main dans la carte d'importation d'index.html : l'écart est nommé (la carte est écrite par l'outil, jamais à la main) ;
//  4) une source de script-src retirée à la main, ou une source ajoutée à la main (une adresse qui n'est ni dans la liste ni dans le catalogue) : les deux écarts sont nommés ;
//  5) une empreinte du catalogue changée : le code qui écrit la même empreinte n'est plus d'accord, le fichier est nommé ;
//  6) le ?v= du kit changé dans la page sans l'être dans la liste (gfs.carte.fixes) : refusé ;
//  7) la copie figée de l'éditeur (vendor/editeur, consigne 066 de GFS ; gfs.copie dans la liste) : un fichier de la copie dont l'empreinte n'est plus celle de COPIE.json est nommé ; une version de la liste montée sans refaire la copie
//     est un écart nommé (« refaire la copie (--copies) ») ; la carte « copie » de la page changée à la main est un écart nommé ; la copie absente est dite non construite.
// Le kit est un sous-module : sans lui (`git submodule update --init kit`), l'essai est SAUTÉ et le dit (0/0 passés) - la forme de la liste, ses versions exactes, le miroir des essais et la carte contre la liste se
// gardent sans lui dans codeHygiene (§ 38).
// Lancé par run-headless.mjs (groupe Node « bibliothequesListe », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-bibliotheques-liste.mjs
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = join(ROOT, 'kit', 'outils', 'bibliotheques.mjs');

if (!existsSync(TOOL)) {
  console.log('Sauté : le kit de Grist Factory manque (kit/outils/bibliotheques.mjs) - `git submodule update --init kit`. La forme de la liste, le miroir et la carte se gardent sans lui dans codeHygiene (§ 38).');
  summarizeAndExit();
}

const verify = root => {
  const run = spawnSync(process.execPath, [TOOL, '--racine', root, '--verifier'], { encoding: 'utf8', timeout: 60000 });
  return { status: run.status, out: (run.stdout || '').trim(), err: (run.stderr || '').trim() };
};

// Une copie de ce que l'outil relit : la liste, le catalogue et la page (copiés, pour être défaits), le code (js/ et extensions/, liés : l'outil y lit les empreintes écrites à côté des adresses) et la copie figée
// de l'éditeur (vendor/ : liée ; COPIÉE pour l'essai qui en défait un fichier, sans quoi il défairait le vrai ; absente pour celui qui la retire).
const scratch = mkdtempSync(join(tmpdir(), 'bibliotheques-liste-'));
let count = 0;
const copy = (edit, vendor = 'lien') => {
  const dir = join(scratch, `copie-${++count}`);
  cpSync(join(ROOT, 'bibliotheques'), join(dir, 'bibliotheques'), { recursive: true });
  for (const file of ['package.json', 'index.html']) writeFileSync(join(dir, file), readFileSync(join(ROOT, file), 'utf8'));
  for (const folder of ['js', 'extensions']) symlinkSync(join(ROOT, folder), join(dir, folder), 'dir');
  if (vendor === 'lien') symlinkSync(join(ROOT, 'vendor'), join(dir, 'vendor'), 'dir');
  else if (vendor === 'copie') cpSync(join(ROOT, 'vendor'), join(dir, 'vendor'), { recursive: true });
  edit(dir);
  return dir;
};
// Remplace `from` par `to` ; `from` doit y être exactement `times` fois (une fois par défaut ; deux pour ce que la page dit dans ses deux cartes, celle du CDN et celle de la copie).
const change = (dir, file, from, to, times = 1) => {
  const path = join(dir, file);
  const text = readFileSync(path, 'utf8');
  if (text.split(from).length !== times + 1) throw new Error(`${file} : « ${from.slice(0, 60)} » doit y être exactement ${times} fois`);
  writeFileSync(path, text.split(from).join(to));
};

try {
  const clean = verify(ROOT);
  check('liste commitée : package.json, bibliotheques/catalogue.json et index.html sont cohérents pour l\'outil du kit (code 0, sans réseau)', clean.status === 0 && /liste, catalogue et politique cohérents/.test(clean.out), `${clean.status} ${clean.out} ${clean.err}`.slice(0, 400));

  const bumped = verify(copy(dir => change(dir, 'package.json', '"marked": "15.0.12"', '"marked": "15.0.13"')));
  check('une version montée dans la liste sans relancer l\'outil est refusée, la bibliothèque nommée (marked)', bumped.status === 1 && /marked/.test(bumped.err), `${bumped.status} ${bumped.err}`.slice(0, 300));

  const handMap = verify(copy(dir => change(dir, 'index.html', '"prosemirror-state": "https://esm.sh/*prosemirror-state@1.4.4"', '"prosemirror-state": "https://esm.sh/*prosemirror-state@1.4.5"')));
  check('une version montée à la main dans la carte d\'importation du CDN d\'index.html est un écart nommé (la carte est écrite par l\'outil du kit)', handMap.status === 1 && /index\.html : à changer dans la carte du CDN : prosemirror-state/.test(handMap.err), `${handMap.status} ${handMap.err}`.slice(0, 300));

  const dropped = verify(copy(dir => change(dir, 'index.html', 'https://esm.sh/linkifyjs@4.4.0 ', '')));
  check('une source de script-src retirée à la main est un écart nommé (« à ajouter à script-src »)', dropped.status === 1 && /à ajouter à script-src : https:\/\/esm\.sh\/linkifyjs@4\.4\.0/.test(dropped.err), `${dropped.status} ${dropped.err}`.slice(0, 300));

  const added = verify(copy(dir => change(dir, 'index.html', 'script-src \'self\' \'unsafe-eval\' ', 'script-src \'self\' \'unsafe-eval\' https://autre.exemple/x.js ')));
  check('une source ajoutée à la main dans script-src (ni dans la liste ni dans le catalogue) est un écart nommé (« à retirer de script-src »)', added.status === 1 && /à retirer de script-src : https:\/\/autre\.exemple\/x\.js/.test(added.err), `${added.status} ${added.err}`.slice(0, 300));

  const catalogue = JSON.parse(readFileSync(join(ROOT, 'bibliotheques', 'catalogue.json'), 'utf8')).bibliotheques.find(entry => entry.id === 'docx');
  const flipped = catalogue.cdn.integrite.replace(/^sha384-./, prefix => prefix.slice(0, -1) + (prefix.endsWith('A') ? 'B' : 'A'));
  const integrity = verify(copy(dir => change(dir, 'bibliotheques/catalogue.json', catalogue.cdn.integrite, flipped)));
  check('une empreinte changée dans le catalogue ne s\'accorde plus avec celle que le code écrit à côté de l\'adresse : le fichier de js/ est nommé', integrity.status === 1 && /js\/docx-export\.js/.test(integrity.err) && /empreinte/.test(integrity.err), `${integrity.status} ${integrity.err}`.slice(0, 300));

  const pin = verify(copy(dir => change(dir, 'index.html', 'ambiance-pose.js?v=', 'ambiance-pose.js?v=deadbee#', 2)));
  check('le ?v= du kit changé dans la page (ses deux cartes) sans l\'être dans la liste (gfs.carte.fixes) est refusé', pin.status === 1 && /kit\/ambiance-pose/.test(pin.err), `${pin.status} ${pin.err}`.slice(0, 300));

  // La copie figée de l'éditeur (consigne 066).
  const manifest = JSON.parse(readFileSync(join(ROOT, 'vendor', 'editeur', 'COPIE.json'), 'utf8'));
  check('la copie commitée a son manifeste, ses licences et plus de trente modules (garde-fou de l\'essai lui-même : sans eux, les essais qui suivent ne prouvent rien)', existsSync(join(ROOT, 'vendor', 'editeur', 'LICENCES.txt')) && Object.keys(manifest.fichiers).length > 30 && !!manifest.fichiers['prosemirror-model.js'] && !!manifest.paquets['prosemirror-model'], Object.keys(manifest.fichiers).length);

  const tampered = verify(copy(dir => writeFileSync(join(dir, 'vendor', 'editeur', 'prosemirror-model.js'), readFileSync(join(dir, 'vendor', 'editeur', 'prosemirror-model.js'), 'utf8') + '\n//a la main\n'), 'copie'));
  check('un fichier de la copie dont l\'empreinte n\'est plus celle de COPIE.json est un écart nommé (la copie est construite par l\'outil, jamais à la main)', tampered.status === 1 && /vendor\/editeur\/prosemirror-model\.js n'est plus celui de la copie/.test(tampered.err) && /--copies/.test(tampered.err), `${tampered.status} ${tampered.err}`.slice(0, 300));

  const modelVersion = /"prosemirror-model": "([^"]+)"/.exec(readFileSync(join(ROOT, 'package.json'), 'utf8'))[1];
  const staleCopy = verify(copy(dir => change(dir, 'package.json', `"prosemirror-model": "${modelVersion}"`, `"prosemirror-model": "${modelVersion}9"`)));
  check('une version de la liste montée sans refaire la copie est un écart nommé (le paquet, « refaire la copie (--copies) »)', staleCopy.status === 1 && /prosemirror-model : la copie a /.test(staleCopy.err) && /refaire la copie \(--copies\)/.test(staleCopy.err), `${staleCopy.status} ${staleCopy.err}`.slice(0, 400));

  const copyMap = verify(copy(dir => change(dir, 'index.html', 'prosemirror-model.js?v=', 'prosemirror-model.js?v=0000')));
  check('une adresse de la carte « copie » de la page changée à la main est un écart nommé (la carte est écrite par l\'outil du kit)', copyMap.status === 1 && /index\.html : à changer dans la carte de la copie : prosemirror-model/.test(copyMap.err), `${copyMap.status} ${copyMap.err}`.slice(0, 300));

  const missing = verify(copy(() => {}, 'absente'));
  check('une copie absente (vendor/ non récupéré) est dite non construite, avec la commande qui la construit', missing.status === 1 && /vendor\/editeur\/COPIE\.json absent/.test(missing.err) && /--copies/.test(missing.err), `${missing.status} ${missing.err}`.slice(-300));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

summarizeAndExit();
