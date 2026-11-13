#!/usr/bin/env node
// La bêta figée avec son bandeau (consigne 070 de Grist Factory Suite).
//
// Le dépôt public garde dans beta/ une copie de la bêta 1.0.0-beta.1 (voir « La bêta figée » dans README.md). Elle reste SANS correctif, avec UN bandeau en plus : « Attention : widget en version bêta.
// Nous vous conseillons de migrer vers la version 1.1. », un bouton « Découvrir les nouveautés » qui ouvre, dans un nouvel onglet, la page des nouveautés de la version 1 (nouveautes.html, à la racine du
// site), et une croix. Le bandeau est fait de deux fichiers de ce dépôt, outils/depot-propre/beta/beta-bandeau.js et beta-bandeau.css, que cet outil ajoute à la copie (js/beta-bandeau.js et
// css/beta-bandeau.css) avec deux lignes dans son index.html : la feuille juste avant </head>, le script juste avant </body>, après main.js, chacun avec `?v=` et les huit premiers chiffres de son empreinte.
// Rien d'autre de beta/ ne change : tout le reste est, octet pour octet, ce que l'étiquette de la bêta porte. L'outil NE POUSSE JAMAIS et ne committe rien.
//
//   node beta-bandeau.mjs --poser <clone public> [--etiquette v1.0.0-beta.1]      (ré)écrit beta/ dans le clone : les fichiers de l'étiquette + le bandeau (publier.sh le fait à chaque publication)
//   node beta-bandeau.mjs --verifier <clone public> [--etiquette ...] [--arbre]    beta/ du dernier commit (ou, avec --arbre, du dossier de travail) est EXACTEMENT l'étiquette + le bandeau
//   node beta-bandeau.mjs --ecarts <clone public> [--etiquette ...]               beta/ du dernier commit est l'étiquette, avec ou sans bandeau (d'une version quelconque) et rien d'autre : ce que publier.sh vérifie avant de recomposer
// L'étiquette par défaut est celle de PP_BETA_ETIQUETTE, sinon v1.0.0-beta.1. Code de sortie 1, avec la raison, quand beta/ n'est pas ce qu'elle doit être.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
export const SOURCES = join(ICI, 'beta');
// Les fichiers du site de la bêta, tels que son étiquette les porte à la racine.
export const BETA_PARTIES = ['index.html', 'css', 'js', 'img', 'templates-gallery', 'LICENSE'];
export const BANDEAU_JS = 'js/beta-bandeau.js';
export const BANDEAU_CSS = 'css/beta-bandeau.css';

// Les deux fichiers du bandeau, lus avec des fins de ligne `\n` (une copie de travail qui les convertit, sous Windows, donnerait sinon une autre empreinte, donc une autre `?v=`).
export function sources() {
  const lire = nom => Buffer.from(readFileSync(join(SOURCES, nom), 'utf8').replace(/\r\n/g, '\n'), 'utf8');
  return { js: lire('beta-bandeau.js'), css: lire('beta-bandeau.css') };
}
const empreinte = octets => createHash('sha256').update(octets).digest('hex').slice(0, 8);

// Les deux lignes ajoutées à index.html : la version (`?v=`) est l'empreinte du fichier, si bien qu'un bandeau modifié ne se lit pas dans le cache du navigateur.
export function balises(src = sources()) {
  return {
    css: `<link rel="stylesheet" href="${BANDEAU_CSS}?v=${empreinte(src.css)}">`,
    js: `<script src="${BANDEAU_JS}?v=${empreinte(src.js)}"></script>`,
  };
}
const LIGNE_CSS = /<link rel="stylesheet" href="css\/beta-bandeau\.css\?v=[0-9a-f]{8}">\n/g;
const LIGNE_JS = /<script src="js\/beta-bandeau\.js\?v=[0-9a-f]{8}"><\/script>\n/g;

// La page sans les deux lignes du bandeau (de n'importe quelle version) : l'index.html de l'étiquette, quand le reste n'a pas bougé.
export function sansBandeau(page) { return page.replace(LIGNE_CSS, '').replace(LIGNE_JS, ''); }
// La page de l'étiquette avec les deux lignes : la feuille sur sa propre ligne juste avant </head>, le script sur la sienne juste avant </body>.
export function avecBandeau(page, src = sources()) {
  if (sansBandeau(page) !== page) throw new Error('index.html porte déjà des lignes du bandeau : la composition part de la page de l\'étiquette');
  for (const fin of ['\n</head>', '\n</body>']) {
    const n = page.split(fin).length - 1;
    if (n !== 1) throw new Error(`index.html de la bêta devrait avoir exactement une ligne ${fin.trim()} (${n} trouvée(s)) : le bandeau ne sait pas où se poser`);
  }
  const { css, js } = balises(src);
  return page.replace('\n</head>', () => `\n${css}\n</head>`).replace('\n</body>', () => `\n${js}\n</body>`);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Lire ce qu'une étiquette, un commit ou un dossier porte : chemin -> { mode, blob } (l'empreinte git du contenu), sans rien écrire
// ---------------------------------------------------------------------------------------------------------------------------------------------
const git = (clone, ...args) => execFileSync('git', ['-C', clone, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
const gitOctets = (clone, args, input) => execFileSync('git', ['-C', clone, ...args], { input, maxBuffer: 1 << 30 });
function algorithme(clone) {
  try { return git(clone, 'rev-parse', '--show-object-format').trim() === 'sha256' ? 'sha256' : 'sha1'; } catch (e) { return 'sha1'; }
}
// L'empreinte que git donne à un fichier de ces octets, calculée ici (hash-object n'écrit rien non plus, mais cela évite un processus par fichier).
const blobDe = (octets, algo) => createHash(algo).update(`blob ${octets.length}\0`).update(octets).digest('hex');

function listerGit(clone, treeish, chemins) {
  const sortie = execFileSync('git', ['-C', clone, 'ls-tree', '-r', '-z', treeish, ...(chemins ? ['--', ...chemins] : [])], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const liste = new Map();
  for (const ligne of sortie.split('\0').filter(Boolean)) {
    const m = /^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/s.exec(ligne);
    if (m && m[2] === 'blob') liste.set(m[4], { mode: m[1], blob: m[3] });
  }
  return liste;
}
function listerDossier(dossier, algo) {
  const liste = new Map();
  const marcher = dir => {
    for (const nom of readdirSync(dir)) {
      const abs = join(dir, nom);
      const info = statSync(abs);
      if (info.isDirectory()) marcher(abs);
      else liste.set(relative(dossier, abs).split(sep).join('/'), { mode: info.mode & 0o111 ? '100755' : '100644', blob: blobDe(readFileSync(abs), algo) });
    }
  };
  if (existsSync(dossier)) marcher(dossier);
  return liste;
}
function contenuGit(clone, blob) { return gitOctets(clone, ['cat-file', 'blob', blob]); }

const egaux = (a, b) => !!a && !!b && a.mode === b.mode && a.blob === b.blob;
const racine = chemin => chemin.split('/')[0];

// Ce que beta/ doit porter, vu comme une liste : celle de l'étiquette, avec index.html recomposé et les deux fichiers du bandeau en plus.
function attenduAvecBandeau(clone, etiquette, algo) {
  const attendu = listerGit(clone, etiquette, BETA_PARTIES);
  const page = attendu.get('index.html');
  if (!page) throw new Error(`l'étiquette ${etiquette} ne porte pas index.html à sa racine`);
  const src = sources();
  const composee = Buffer.from(avecBandeau(contenuGit(clone, page.blob).toString('utf8'), src), 'utf8');
  attendu.set('index.html', { mode: page.mode, blob: blobDe(composee, algo) });
  attendu.set(BANDEAU_JS, { mode: '100644', blob: blobDe(src.js, algo) });
  attendu.set(BANDEAU_CSS, { mode: '100644', blob: blobDe(src.css, algo) });
  return attendu;
}

// Les chemins où `reel` n'est pas `attendu` : un fichier de moins, de plus, ou d'un autre contenu.
function ecartsEntre(attendu, reel) {
  const chemins = new Set([...attendu.keys(), ...reel.keys()]);
  return [...chemins].filter(chemin => !egaux(attendu.get(chemin), reel.get(chemin))).sort();
}

// beta/ du dernier commit (ou du dossier de travail) = l'étiquette + le bandeau, au bit près : la liste des chemins qui en diffèrent.
export function verifier(clone, etiquette, { arbre = false } = {}) {
  const algo = algorithme(clone);
  const attendu = attenduAvecBandeau(clone, etiquette, algo);
  const reel = arbre ? listerDossier(join(clone, 'beta'), algo) : listerGit(clone, 'HEAD:beta');
  return ecartsEntre(attendu, reel);
}

// beta/ du dernier commit = l'étiquette, sans bandeau ou avec un bandeau d'une version quelconque (ses deux fichiers et ses deux lignes ne comptent pas), et rien d'autre :
// { differentes : les parties du site (index.html, css, js…) qui diffèrent, enTrop : les entrées que la bêta n'avait pas }.
export function ecarts(clone, etiquette) {
  const algo = algorithme(clone);
  const attendu = listerGit(clone, etiquette, BETA_PARTIES);
  const reel = listerGit(clone, 'HEAD:beta');
  reel.delete(BANDEAU_JS);
  reel.delete(BANDEAU_CSS);
  const page = reel.get('index.html');
  if (page) {
    const octets = contenuGit(clone, page.blob);
    const texte = octets.toString('utf8');
    if (Buffer.from(texte, 'utf8').equals(octets) && sansBandeau(texte) !== texte) reel.set('index.html', { mode: page.mode, blob: blobDe(Buffer.from(sansBandeau(texte), 'utf8'), algo) });
  }
  const differentes = BETA_PARTIES.filter(partie => {
    const dans = liste => new Map([...liste].filter(([chemin]) => racine(chemin) === partie));
    return ecartsEntre(dans(attendu), dans(reel)).length > 0;
  });
  const enTrop = [...new Set([...reel.keys()].map(racine))].filter(nom => !BETA_PARTIES.includes(nom)).sort();
  return { differentes, enTrop };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Poser : écrit beta/ dans le dossier de travail du clone (rien n'est ajouté à l'index, rien n'est committé)
// ---------------------------------------------------------------------------------------------------------------------------------------------
// `source` : un dossier qui porte les fichiers de la bêta (ceux de l'étiquette) ; `destination` : le dossier beta/ à (ré)écrire. Aussi utilisée par les essais, sans clone.
export function poserDepuisDossier(source, destination, src = sources()) {
  // La page composée d'abord : une page où le bandeau ne se pose pas laisse beta/ comme elle était, au lieu de la laisser à moitié écrite.
  const octets = readFileSync(join(source, 'index.html'));
  const page = octets.toString('utf8');
  if (!Buffer.from(page, 'utf8').equals(octets)) throw new Error('index.html de la bêta n\'est pas de l\'UTF-8 : le bandeau ne s\'y pose pas sans le modifier');
  const composee = avecBandeau(page, src);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const partie of BETA_PARTIES) cpSync(join(source, partie), join(destination, partie), { recursive: true });
  writeFileSync(join(destination, 'index.html'), composee);
  writeFileSync(join(destination, BANDEAU_JS), src.js);
  writeFileSync(join(destination, BANDEAU_CSS), src.css);
}
export function poser(clone, etiquette) {
  const extrait = mkdtempSync(join(tmpdir(), 'beta-etiquette-'));
  try {
    const tar = gitOctets(clone, ['archive', '--format=tar', etiquette, ...BETA_PARTIES]);
    const sortie = spawnSync('tar', ['-x', '-C', extrait], { input: tar, encoding: 'utf8' });
    if (sortie.status !== 0) throw new Error('extraction de l\'étiquette ' + etiquette + ' impossible : ' + (sortie.stderr || sortie.error || '').toString().trim());
    poserDepuisDossier(extrait, join(clone, 'beta'));
  } finally {
    rmSync(extrait, { recursive: true, force: true });
  }
  const ecartsApres = verifier(clone, etiquette, { arbre: true });
  if (ecartsApres.length) throw new Error('beta/ écrite n\'est pas l\'étiquette + le bandeau (' + ecartsApres.slice(0, 4).join(', ') + ')');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const mode = ['--poser', '--verifier', '--ecarts'].find(option => args.includes(option));
  const choisi = option => { const i = args.indexOf(option); return i >= 0 ? args[i + 1] : undefined; };
  const clone = mode ? args[args.indexOf(mode) + 1] : undefined;
  const etiquette = choisi('--etiquette') || process.env.PP_BETA_ETIQUETTE || 'v1.0.0-beta.1';
  if (!mode || !clone || clone.startsWith('--')) {
    console.error('Usage : node beta-bandeau.mjs --poser|--verifier|--ecarts <clone du dépôt public> [--etiquette v1.0.0-beta.1] [--arbre]');
    process.exit(2);
  }
  try {
    if (mode === '--poser') {
      poser(clone, etiquette);
      console.log(`beta/ écrite dans ${clone} : les fichiers de ${etiquette} et le bandeau (js/beta-bandeau.js, css/beta-bandeau.css, deux lignes dans index.html). Rien n'est ajouté à l'index, rien n'est committé ni poussé.`);
    } else if (mode === '--verifier') {
      const differents = verifier(clone, etiquette, { arbre: args.includes('--arbre') });
      if (differents.length === 0) console.log(`beta/ est ${etiquette} avec son bandeau, et rien d'autre.`);
      else {
        console.error(`beta/ n'est pas ${etiquette} avec son bandeau (${differents.length} chemin(s) diffèrent) :\n` + differents.slice(0, 12).map(chemin => `  beta/${chemin}`).join('\n')
          + '\nPour la (ré)écrire : node beta-bandeau.mjs --poser <clone public>, puis la relire avec --verifier --arbre.');
        process.exit(1);
      }
    } else {
      const { differentes, enTrop } = ecarts(clone, etiquette);
      if (differentes.length) {
        console.error(`beta/ n'est pas identique aux fichiers du site de ${etiquette} (la bêta figée ne se corrige pas, on la repose telle que l'étiquette la porte, avec le bandeau que beta-bandeau.mjs y ajoute) :\n` + differentes.map(partie => `  beta/${partie}`).join('\n'));
        process.exit(1);
      }
      if (enTrop.length) {
        console.error('beta/ porte des entrées que la bêta n\'avait pas :\n' + enTrop.map(nom => `  beta/${nom}`).join('\n'));
        process.exit(1);
      }
      console.log(`beta/ est ${etiquette}, avec ou sans bandeau, et rien d'autre.`);
    }
  } catch (erreur) {
    console.error('ERREUR : ' + (erreur && erreur.message ? erreur.message : erreur));
    process.exit(1);
  }
}
