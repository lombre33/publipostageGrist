#!/usr/bin/env node
// La bêta figée avec son bandeau (consigne 070 de Grist Factory Suite), sa fenêtre « passez à la dernière version » et son garde-fou (consigne 102).
//
// Le dépôt public garde dans beta/ une copie de la bêta 1.0.0-beta.1 (voir « La bêta figée » dans README.md). Elle reste SANS correctif, avec UN bandeau en plus : « Attention : widget en version bêta.
// Nous vous conseillons de migrer vers la version 1.2. », un bouton « Découvrir les nouveautés » qui ouvre, dans un nouvel onglet, la page des nouveautés de la version 1 (nouveautes.html, à la racine du
// site), et une croix ; et, dans le même script, à chaque ouverture, une fenêtre « Il est temps de passer à la version 1.2 » (demande du porteur du 26/11). Le numéro (X.Y) est celui de la version qui
// part : le script du dépôt de développement porte un repère à sa place (REPERE_NUMERO), que cet outil remplace par le numéro de js/version.js du clone public (ou de --version), si bien que rien ne se retouche
// à la main d'une version à l'autre. Le bandeau est fait de deux fichiers de ce dépôt, outils/depot-propre/beta/beta-bandeau.js et beta-bandeau.css, que cet outil ajoute à la copie (js/beta-bandeau.js et
// css/beta-bandeau.css) avec deux lignes dans son index.html : la feuille juste avant </head>, le script juste avant </body>, après main.js, chacun avec `?v=` et les huit premiers chiffres de son empreinte
// (celle du fichier posé, numéro compris : un numéro qui change change la `?v=`).
// Le garde-fou (consigne 102, choix du porteur du 25/11 : « une dernière bêta qui ne recrée pas les anciennes tables ») est un troisième fichier, outils/depot-propre/beta/beta-garde.js, posé en js/beta-garde.js avec UNE ligne de plus
// dans index.html : juste avant js/table-consent.js, donc avant le démarrage anticipé de la bêta. Devant un document que la version 1 a déjà mis à jour (ses tables portent des noms anglais), la bêta n'écrit plus rien, ne
// recrée aucune ancienne table et dit d'ouvrir la dernière version. Sa feuille est celle du bandeau (css/beta-bandeau.css).
// Rien d'autre de beta/ ne change : tout le reste est, octet pour octet, ce que l'étiquette de la bêta porte. L'outil NE POUSSE JAMAIS et ne committe rien.
//
//   node beta-bandeau.mjs --poser <clone public> [--etiquette v1.0.0-beta.1] [--version 1.2.0]      (ré)écrit beta/ dans le clone : les fichiers de l'étiquette + le bandeau + le garde-fou (publier.sh le fait à chaque publication)
//   node beta-bandeau.mjs --verifier <clone public> [--etiquette ...] [--arbre] [--version 1.2.0]    beta/ du dernier commit (ou, avec --arbre, du dossier de travail) est EXACTEMENT l'étiquette + le bandeau + le garde-fou
//   node beta-bandeau.mjs --ecarts <clone public> [--etiquette ...]               beta/ du dernier commit est l'étiquette, avec ou sans bandeau ni garde-fou (d'une version quelconque) et rien d'autre : ce que publier.sh vérifie avant de recomposer
// L'étiquette par défaut est celle de PP_BETA_ETIQUETTE, sinon v1.0.0-beta.1. Sans --version, le numéro annoncé est celui de js/version.js du clone public (du dossier de travail pour --poser et --verifier --arbre,
// du dernier commit pour --verifier). Code de sortie 1, avec la raison, quand beta/ n'est pas ce qu'elle doit être.
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
export const GARDE_JS = 'js/beta-garde.js';

// Le numéro que le bandeau et la fenêtre de la bêta annoncent : celui de la dernière version, c'est-à-dire de la version qui part, sans son correctif ni son suffixe (1.2.0 donne 1.2, 1.2.3 donne 1.2,
// 1.2.0-rc.1 et 1.2.0-dev donnent 1.2). Une version qui n'a pas cette forme n'est pas une version : l'outil s'arrête, la bêta n'annoncerait pas un numéro au hasard.
export function numeroAffiche(version) {
  const m = /^(\d+)\.(\d+)(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?$/.exec(String(version === undefined || version === null ? '' : version).trim());
  if (!m) throw new Error(`le numéro de version « ${version === undefined || version === null ? '' : version} » n'est pas de la forme 1.2.0 : la bêta ne saurait pas quel numéro annoncer (« migrer vers la version X.Y »)`);
  return `${m[1]}.${m[2]}`;
}
// Le repère du numéro dans outils/depot-propre/beta/beta-bandeau.js : un modèle, pas un numéro. Il y est UNE fois (la constante LATEST) ; la publication le remplace par le numéro de la version qui part,
// si bien qu'il n'y a aucun numéro à retoucher à la main d'une version à l'autre (demande du porteur, 26/11 : « adapte le x avec le bon numéro de version au moment où l'on fera le push »).
export const REPERE_NUMERO = '{{VERSION_COURANTE}}';

// Les fichiers du bandeau et du garde-fou, lus avec des fins de ligne `\n` (une copie de travail qui les convertit, sous Windows, donnerait sinon une autre empreinte, donc une autre `?v=`).
// `version` : le numéro de la version qui part (1.2.0) ; le script du bandeau le reçoit en X.Y à la place du repère, donc son empreinte, et sa `?v=`, changent avec lui. Sans numéro, l'outil s'arrête.
export function sources(version) {
  if (version === undefined || version === null || version === '') throw new Error('sources() demande le numéro de la version qui part (le bandeau de la bêta annonce « migrer vers la version X.Y »)');
  const numero = numeroAffiche(version);
  const lire = nom => readFileSync(join(SOURCES, nom), 'utf8').replace(/\r\n/g, '\n');
  const modele = lire('beta-bandeau.js');
  const n = modele.split(REPERE_NUMERO).length - 1;
  if (n !== 1) throw new Error(`outils/depot-propre/beta/beta-bandeau.js devrait porter le repère ${REPERE_NUMERO} une fois, à la place du numéro de la dernière version (${n} trouvé(s))`);
  return {
    js: Buffer.from(modele.replace(REPERE_NUMERO, () => numero), 'utf8'),
    css: Buffer.from(lire('beta-bandeau.css'), 'utf8'),
    garde: Buffer.from(lire('beta-garde.js'), 'utf8'),
    numero,
  };
}
// Le numéro de la version qui part, tel que le clone public l'écrit dans js/version.js (publier.sh l'y met AVANT de poser la bêta) : dans le dossier de travail avec `arbre`, dans le dernier commit sinon.
export function versionDuClone(clone, { arbre = false } = {}) {
  let texte = '';
  try { texte = arbre ? readFileSync(join(clone, 'js', 'version.js'), 'utf8') : git(clone, 'show', 'HEAD:js/version.js'); } catch (e) { /* le message ci-dessous */ }
  const declaree = (/PP_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(texte) || [])[1];
  if (!declaree) throw new Error(`js/version.js ${arbre ? 'du dossier de travail' : 'du dernier commit'} du clone public ne déclare pas PP_VERSION : le numéro que la bêta annonce ne se connaît pas, donne --version X.Y.Z`);
  return declaree;
}
const empreinte = octets => createHash('sha256').update(octets).digest('hex').slice(0, 8);

// Les trois lignes ajoutées à index.html : la version (`?v=`) est l'empreinte du fichier, si bien qu'un bandeau ou un garde-fou modifié ne se lit pas dans le cache du navigateur.
export function balises(src) {
  return {
    css: `<link rel="stylesheet" href="${BANDEAU_CSS}?v=${empreinte(src.css)}">`,
    js: `<script src="${BANDEAU_JS}?v=${empreinte(src.js)}"></script>`,
    garde: `<script src="${GARDE_JS}?v=${empreinte(src.garde)}"></script>`,
  };
}
const LIGNE_CSS = /<link rel="stylesheet" href="css\/beta-bandeau\.css\?v=[0-9a-f]{8}">\n/g;
const LIGNE_JS = /<script src="js\/beta-bandeau\.js\?v=[0-9a-f]{8}"><\/script>\n/g;
const LIGNE_GARDE = /<script src="js\/beta-garde\.js\?v=[0-9a-f]{8}"><\/script>\n/g;
// La ligne de la bêta devant laquelle se pose le garde-fou : le script qui branche la question « Créer les tables du widget ? », chargé avant le démarrage anticipé (la première lecture, la première création).
const ANCRE_GARDE = /<script src="js\/table-consent\.js[^"]*"><\/script>\n/g;

// La page sans les trois lignes du bandeau et du garde-fou (de n'importe quelle version) : l'index.html de l'étiquette, quand le reste n'a pas bougé.
export function sansBandeau(page) { return page.replace(LIGNE_CSS, '').replace(LIGNE_JS, '').replace(LIGNE_GARDE, ''); }
// La page de l'étiquette avec les trois lignes : la feuille sur sa propre ligne juste avant </head>, le script du bandeau sur la sienne juste avant </body>, le garde-fou sur la sienne juste avant js/table-consent.js.
export function avecBandeau(page, src) {
  if (sansBandeau(page) !== page) throw new Error('index.html porte déjà des lignes du bandeau ou du garde-fou : la composition part de la page de l\'étiquette');
  for (const fin of ['\n</head>', '\n</body>']) {
    const n = page.split(fin).length - 1;
    if (n !== 1) throw new Error(`index.html de la bêta devrait avoir exactement une ligne ${fin.trim()} (${n} trouvée(s)) : le bandeau ne sait pas où se poser`);
  }
  const ancres = page.match(ANCRE_GARDE) || [];
  if (ancres.length !== 1) throw new Error(`index.html de la bêta devrait avoir exactement une ligne <script src="js/table-consent.js…"> (${ancres.length} trouvée(s)) : le garde-fou ne sait pas où se poser`);
  const { css, js, garde } = balises(src);
  return page.replace('\n</head>', () => `\n${css}\n</head>`).replace('\n</body>', () => `\n${js}\n</body>`).replace(ANCRE_GARDE, ligne => `${garde}\n${ligne}`);
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

// Ce que beta/ doit porter, vu comme une liste : celle de l'étiquette, avec index.html recomposé et les trois fichiers du bandeau et du garde-fou en plus.
function attenduAvecBandeau(clone, etiquette, algo, src) {
  const attendu = listerGit(clone, etiquette, BETA_PARTIES);
  const page = attendu.get('index.html');
  if (!page) throw new Error(`l'étiquette ${etiquette} ne porte pas index.html à sa racine`);
  const composee = Buffer.from(avecBandeau(contenuGit(clone, page.blob).toString('utf8'), src), 'utf8');
  attendu.set('index.html', { mode: page.mode, blob: blobDe(composee, algo) });
  attendu.set(BANDEAU_JS, { mode: '100644', blob: blobDe(src.js, algo) });
  attendu.set(BANDEAU_CSS, { mode: '100644', blob: blobDe(src.css, algo) });
  attendu.set(GARDE_JS, { mode: '100644', blob: blobDe(src.garde, algo) });
  return attendu;
}

// Les chemins où `reel` n'est pas `attendu` : un fichier de moins, de plus, ou d'un autre contenu.
function ecartsEntre(attendu, reel) {
  const chemins = new Set([...attendu.keys(), ...reel.keys()]);
  return [...chemins].filter(chemin => !egaux(attendu.get(chemin), reel.get(chemin))).sort();
}

// beta/ du dernier commit (ou du dossier de travail) = l'étiquette + le bandeau + le garde-fou, au bit près : la liste des chemins qui en diffèrent.
export function verifier(clone, etiquette, { arbre = false, version } = {}) {
  const algo = algorithme(clone);
  const attendu = attenduAvecBandeau(clone, etiquette, algo, sources(version === undefined ? versionDuClone(clone, { arbre }) : version));
  const reel = arbre ? listerDossier(join(clone, 'beta'), algo) : listerGit(clone, 'HEAD:beta');
  return ecartsEntre(attendu, reel);
}

// beta/ du dernier commit = l'étiquette, sans bandeau ni garde-fou ou avec ceux d'une version quelconque (leurs trois fichiers et leurs trois lignes ne comptent pas), et rien d'autre :
// { differentes : les parties du site (index.html, css, js…) qui diffèrent, enTrop : les entrées que la bêta n'avait pas }.
export function ecarts(clone, etiquette) {
  const algo = algorithme(clone);
  const attendu = listerGit(clone, etiquette, BETA_PARTIES);
  const reel = listerGit(clone, 'HEAD:beta');
  reel.delete(BANDEAU_JS);
  reel.delete(BANDEAU_CSS);
  reel.delete(GARDE_JS);
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
// `source` : un dossier qui porte les fichiers de la bêta (ceux de l'étiquette) ; `destination` : le dossier beta/ à (ré)écrire ; `src` : sources(version), le bandeau au numéro de la version qui part.
// Aussi utilisée par les essais, sans clone.
export function poserDepuisDossier(source, destination, src) {
  if (!src || !src.js) throw new Error('poserDepuisDossier() demande sources(version) : le bandeau de la bêta annonce le numéro de la version qui part');
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
  writeFileSync(join(destination, GARDE_JS), src.garde);
}
export function poser(clone, etiquette, version) {
  const src = sources(version === undefined ? versionDuClone(clone, { arbre: true }) : version);
  const extrait = mkdtempSync(join(tmpdir(), 'beta-etiquette-'));
  try {
    const tar = gitOctets(clone, ['archive', '--format=tar', etiquette, ...BETA_PARTIES]);
    const sortie = spawnSync('tar', ['-x', '-C', extrait], { input: tar, encoding: 'utf8' });
    if (sortie.status !== 0) throw new Error('extraction de l\'étiquette ' + etiquette + ' impossible : ' + (sortie.stderr || sortie.error || '').toString().trim());
    poserDepuisDossier(extrait, join(clone, 'beta'), src);
  } finally {
    rmSync(extrait, { recursive: true, force: true });
  }
  const ecartsApres = verifier(clone, etiquette, { arbre: true, version: src.numero });
  if (ecartsApres.length) throw new Error('beta/ écrite n\'est pas l\'étiquette + le bandeau + le garde-fou (' + ecartsApres.slice(0, 4).join(', ') + ')');
  return src.numero;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const mode = ['--poser', '--verifier', '--ecarts'].find(option => args.includes(option));
  const choisi = option => { const i = args.indexOf(option); return i >= 0 ? args[i + 1] : undefined; };
  const clone = mode ? args[args.indexOf(mode) + 1] : undefined;
  const etiquette = choisi('--etiquette') || process.env.PP_BETA_ETIQUETTE || 'v1.0.0-beta.1';
  const version = choisi('--version');
  if (!mode || !clone || clone.startsWith('--') || (args.includes('--version') && (!version || version.startsWith('--')))) {
    console.error('Usage : node beta-bandeau.mjs --poser|--verifier|--ecarts <clone du dépôt public> [--etiquette v1.0.0-beta.1] [--arbre] [--version 1.2.0]');
    process.exit(2);
  }
  try {
    if (mode === '--poser') {
      const numero = poser(clone, etiquette, version);
      console.log(`beta/ écrite dans ${clone} : les fichiers de ${etiquette}, le bandeau et sa fenêtre « passez à la version ${numero} » (js/beta-bandeau.js, css/beta-bandeau.css) et le garde-fou (js/beta-garde.js), avec trois lignes de plus dans index.html. Rien n'est ajouté à l'index, rien n'est committé ni poussé.`);
    } else if (mode === '--verifier') {
      const differents = verifier(clone, etiquette, { arbre: args.includes('--arbre'), version });
      if (differents.length === 0) console.log(`beta/ est ${etiquette} avec son bandeau, et rien d'autre.`);
      else {
        console.error(`beta/ n'est pas ${etiquette} avec son bandeau (${differents.length} chemin(s) diffèrent) :\n` + differents.slice(0, 12).map(chemin => `  beta/${chemin}`).join('\n')
          + '\nPour la (ré)écrire : node beta-bandeau.mjs --poser <clone public>, puis la relire avec --verifier --arbre.');
        process.exit(1);
      }
    } else {
      const { differentes, enTrop } = ecarts(clone, etiquette);
      if (differentes.length) {
        console.error(`beta/ n'est pas identique aux fichiers du site de ${etiquette} (la bêta figée ne se corrige pas, on la repose telle que l'étiquette la porte, avec le bandeau et le garde-fou que beta-bandeau.mjs y ajoute) :\n` + differentes.map(partie => `  beta/${partie}`).join('\n'));
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
