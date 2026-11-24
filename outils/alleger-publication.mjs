#!/usr/bin/env node
// Alléger ce qu'on publie : les fichiers de l'app (js/, extensions/, css/) SANS leurs commentaires.
//
// Pourquoi (24/11, Antoine : « il faut avoir quelque chose de plus instantané » à l'ouverture depuis GFS ; validé « oui très bien » après « le document seul d'abord ») : l'app se charge depuis le site, en
// 369 fichiers au démarrage, et les commentaires du code (en français, longs : ils disent le pourquoi de chaque choix) en pèsent près d'un tiers. Mesuré sur main : 12,4 Mo de js, 4,44 Mo une fois compressés (gzip),
// 3,02 Mo sans les commentaires (−32 %) ; au démarrage seul, −45 % (2,70 → 1,48 Mo, environ 0,7 s de moins à l'ouverture depuis GFS).
//
// Ce que fait l'outil, et ce qu'il ne fait jamais :
//   - il retire les commentaires, rien d'autre : pas de renommage, pas de réécriture, pas de réduction des espaces. Le code qui s'exécute est le même, et l'outil le PROUVE fichier par fichier avant d'écrire :
//       js : l'arbre syntaxique (acorn) du fichier d'avant et celui d'après sont identiques, au caractère près des littéraux ;
//       css : le texte d'après, comparé à celui d'avant par un second relevé des commentaires, indépendant du premier, est le même à l'espace près ;
//       les deux : le même nombre de lignes. Un commentaire sur plusieurs lignes laisse ses sauts de ligne : « la ligne N du fichier publié est la ligne N du dépôt », ce que les traces d'erreur et le rapport
//       de fluidité citent (et un `return /*⏎*/ x` garde son saut de ligne, que la règle du point-virgule automatique lit). Mesuré : garder les lignes coûte 0,02 Mo sur 3 (0,6 %).
//     Un fichier qui ne passe pas la preuve reste TEL QUEL et fait sortir l'outil en erreur (code 1) : rien d'à demi fait.
//   - il garde les commentaires que l'exécution ou la licence lisent : `/*! … */`, `@license`, `@preserve`, `sourceMappingURL`, `sourceURL`, les marques `@vite-ignore`, `webpackIgnore`, `__PURE__`.
//   - il ne touche pas : index.html (la politique de sécurité du contenu porte l'empreinte de ses scripts en ligne), kit/ (le code de Grist Factory, épinglé à son commit), vendor/ (code de tiers, minifié, avec ses
//     licences), beta/ (la copie figée de la bêta du dépôt public), les fichiers `.min.`, ni rien hors de js/, extensions/ et css/ de la racine donnée.
//
// Usage :
//   node outils/alleger-publication.mjs <dossier>            mesure seulement : dit ce que ça donnerait, n'écrit RIEN
//   node outils/alleger-publication.mjs <dossier> --ecrire   réécrit les fichiers de <dossier> (une copie de l'arbre à publier : un clone, un `git archive`, jamais le dépôt de développement lui-même, que l'outil refuse)
//   --liste          ajoute le détail fichier par fichier (les plus gros gains d'abord)
// Code de sortie : 0 tout est passé, 1 un fichier n'a pas passé la preuve (resté tel quel), 2 usage.
// Dépend d'acorn (le seul analyseur de la chaîne : `npm install -g acorn`), cherché dans NODE_PATH, /opt/node-tools/node_modules et la racine globale de npm.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative, resolve, delimiter, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Les dossiers de la racine dont on retire les commentaires, avec ce qu'on y lit.
const PARTIES = [['js', '.js'], ['extensions', '.js'], ['css', '.css']];

let acornMemo = null;
function acorn() {
  if (acornMemo) return acornMemo;
  const dossiers = (process.env.NODE_PATH || '').split(delimiter).filter(Boolean).concat('/opt/node-tools/node_modules');
  try { dossiers.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch { /* pas de npm : on cherche ailleurs */ }
  const chercheurs = [createRequire(import.meta.url)].concat(dossiers.map(dossier => createRequire(join(dossier, 'x.js'))));
  for (const chercheur of chercheurs) { try { acornMemo = chercheur('acorn'); return acornMemo; } catch { /* au suivant */ } }
  throw new Error('acorn est introuvable (npm install -g acorn)');
}

// --- js ---------------------------------------------------------------------------------------------------------------------------------------
// Un fichier de l'app est un script ; ceux qui s'importent entre eux (kit, extensions) sont des modules : on essaie le script, puis le module, et la preuve se fait avec le même type.
function analyser(src) {
  const base = { ecmaVersion: 'latest', allowHashBang: true };
  for (const type of ['script', 'module']) {
    const commentaires = [];
    try { return { type, ast: acorn().parse(src, Object.assign({ sourceType: type, onComment: commentaires }, base)), commentaires }; } catch { /* le type suivant, puis plus rien : null */ }
  }
  return null;
}
// Les commentaires que l'exécution ou la licence lisent : on les garde.
const GARDE_BLOC = /^!|@license|@preserve|@vite-ignore|webpackIgnore|^[#@]__PURE__/;
const GARDE_TOUS = /sourceMappingURL|sourceURL/;
const aGarder = c => (c.type === 'Block' && GARDE_BLOC.test(c.value)) || GARDE_TOUS.test(c.value);

// Le texte d'après : chaque commentaire à retirer laisse ses sauts de ligne (un commentaire d'une ligne : rien) ; les espaces qui le précédaient en fin de ligne partent avec lui.
function sansCommentaires(src, commentaires, fin = '\n') {
  let out = src;
  for (const c of commentaires.filter(c => !aGarder(c)).sort((a, b) => b.start - a.start)) {
    const sauts = (out.slice(c.start, c.end).match(/\r\n|\n|\r|\u2028|\u2029/g) || []).length;
    let debut = c.start;
    let finLigne = out.indexOf('\n', c.end); if (finLigne === -1) finLigne = out.length;
    const termine = !out.slice(c.end, finLigne).trim();
    if (termine) while (debut > 0 && (out[debut - 1] === ' ' || out[debut - 1] === '\t')) debut--;
    const avant = out[debut - 1], apres = out[c.end];
    // Au milieu d'une ligne de code, le commentaire était une séparation : un espace la garde (`a/**/in b`).
    const remplace = sauts ? fin.repeat(sauts) : (!termine && avant && !/\s/.test(avant) && apres && !/\s/.test(apres) ? ' ' : '');
    out = out.slice(0, debut) + remplace + out.slice(c.end);
  }
  return out;
}
const empreinteArbre = ast => JSON.stringify(ast, (cle, valeur) => (cle === 'start' || cle === 'end' ? undefined : valeur));
const nbLignes = texte => texte.split('\n').length;

// { sortie, ... } ou { raison } quand le fichier ne se lit pas ou que la preuve ne passe pas (il reste alors tel quel).
export function allegerJs(src) {
  const lu = analyser(src);
  if (!lu) return { raison: 'illisible' };
  const sortie = sansCommentaires(src, lu.commentaires, src.includes('\r\n') ? '\r\n' : '\n');
  return verifierJs(src, sortie, lu);
}
export function verifierJs(src, sortie, lu = analyser(src)) {
  let apres;
  try { apres = acorn().parse(sortie, { ecmaVersion: 'latest', allowHashBang: true, sourceType: lu.type }); } catch (e) { return { raison: 'le texte allégé ne se lit plus (' + e.message + ')' }; }
  if (empreinteArbre(lu.ast) !== empreinteArbre(apres)) return { raison: 'l\'arbre syntaxique a changé' };
  if (nbLignes(src) !== nbLignes(sortie)) return { raison: 'le nombre de lignes a changé' };
  return { sortie };
}

// --- css --------------------------------------------------------------------------------------------------------------------------------------
// Un parcours caractère par caractère qui saute les chaînes ("…", '…') et les adresses sans guillemets (url(data:…/*…)), retire les commentaires `/* … */` (sauf `/*! … */`), garde les sauts de ligne.
export function sansCommentairesCss(src) {
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === '\'') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if ((c === 'u' || c === 'U') && /^url\(\s*[^\s'")]/i.test(src.slice(i, i + 12)) && !/[\w-]/.test(src[i - 1] || '')) {
      const fermee = src.indexOf(')', i);
      const j = fermee === -1 ? n : fermee + 1;
      out += src.slice(i, j); i = j; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const fermee = src.indexOf('*/', i + 2);
      const j = fermee === -1 ? n : fermee + 2;
      const texte = src.slice(i, j);
      const avant = out[out.length - 1], apres = src[j];
      // `a/**/b` : le commentaire est collé à ses deux côtés, il fait partie de la jointure : on le garde plutôt que de changer ce que ces deux jetons veulent dire.
      const colle = avant && !/\s/.test(avant) && apres && !/\s/.test(apres) && !/[{};,:>+~]/.test(avant) && !/[{};,:>+~]/.test(apres);
      if (texte[2] === '!' || colle) { out += texte; i = j; continue; }
      const sauts = (texte.match(/\n/g) || []).length;
      const termine = !src.slice(j, src.indexOf('\n', j) === -1 ? n : src.indexOf('\n', j)).trim();
      if (termine) out = out.replace(/[ \t]+$/, '');
      out += sauts ? '\n'.repeat(sauts) : (termine || !avant || /\s/.test(avant) || !apres || /\s/.test(apres) ? '' : ' ');
      i = j; continue;
    }
    out += c; i++;
  }
  return out;
}
// Le second relevé, indépendant du parcours ci-dessus : une expression qui garde les chaînes et les `url(…)` sans guillemets et remplace tout commentaire par un espace.
const SANS_COMMENTAIRES_REGEX = /("(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|url\(\s*[^\s'")][^)]*\))|\/\*[\s\S]*?(?:\*\/|$)/gi;
const nu = texte => texte.replace(SANS_COMMENTAIRES_REGEX, (tout, garde) => garde || ' ').replace(/\s+/g, ' ').trim();
export function verifierCss(src, sortie) {
  if (nu(src) !== nu(sortie)) return { raison: 'le texte allégé n\'est pas celui d\'avant, commentaires mis à part' };
  if (nbLignes(src) !== nbLignes(sortie)) return { raison: 'le nombre de lignes a changé' };
  return { sortie };
}
export function allegerCss(src) { return verifierCss(src, sansCommentairesCss(src)); }

// --- l'arbre ----------------------------------------------------------------------------------------------------------------------------------
function fichiersDe(racine) {
  const trouves = [];
  const descendre = (dossier, fin) => {
    if (!existsSync(dossier)) return;
    for (const nom of readdirSync(dossier).sort()) {
      const chemin = join(dossier, nom);
      const info = lstatSync(chemin);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) descendre(chemin, fin);
      else if (nom.endsWith(fin) && !/\.min\./.test(nom)) trouves.push(chemin);
    }
  };
  for (const [dossier, fin] of PARTIES) descendre(join(racine, dossier), fin);
  return trouves;
}

export function alleger(racine, { ecrire = false } = {}) {
  const bilan = { fichiers: 0, allegés: 0, inchangés: 0, refusés: [], brutAvant: 0, brutApres: 0, gzAvant: 0, gzApres: 0, detail: [], parType: { js: [0, 0], css: [0, 0] } };
  for (const chemin of fichiersDe(racine)) {
    const src = readFileSync(chemin, 'utf8');
    const css = chemin.endsWith('.css');
    let resultat;
    try { resultat = css ? allegerCss(src) : allegerJs(src); } catch (e) { resultat = { raison: e.message }; }
    const nom = relative(racine, chemin).split('\\').join('/');
    const avantGz = gzipSync(src, { level: 6 }).length;
    bilan.fichiers++;
    if (!resultat.sortie) { bilan.refusés.push({ nom, raison: resultat.raison }); bilan.brutAvant += Buffer.byteLength(src); bilan.brutApres += Buffer.byteLength(src); bilan.gzAvant += avantGz; bilan.gzApres += avantGz; continue; }
    const apresGz = resultat.sortie === src ? avantGz : gzipSync(resultat.sortie, { level: 6 }).length;
    if (resultat.sortie === src) bilan.inchangés++; else { bilan.allegés++; if (ecrire) writeFileSync(chemin, resultat.sortie); }
    bilan.brutAvant += Buffer.byteLength(src); bilan.brutApres += Buffer.byteLength(resultat.sortie);
    bilan.gzAvant += avantGz; bilan.gzApres += apresGz;
    bilan.parType[css ? 'css' : 'js'][0] += avantGz; bilan.parType[css ? 'css' : 'js'][1] += apresGz;
    bilan.detail.push({ nom, gzAvant: avantGz, gzApres: apresGz });
  }
  return bilan;
}

// --- la ligne de commande ---------------------------------------------------------------------------------------------------------------------
const USAGE = [
  'Usage :',
  '  node outils/alleger-publication.mjs <dossier>            mesure seulement : n\'écrit RIEN',
  '  node outils/alleger-publication.mjs <dossier> --ecrire   réécrit les fichiers de <dossier> (une copie de l\'arbre à publier, jamais le dépôt de développement)',
  '  --liste   ajoute le détail fichier par fichier',
].join('\n');
const mo = octets => (octets / 1e6).toFixed(2).replace('.', ',') + ' Mo';
const pct = (avant, apres) => (avant ? Math.round((1 - apres / avant) * 100) : 0) + ' %';
function main(args) {
  const options = new Set(args.filter(a => a.startsWith('--')));
  const dossiers = args.filter(a => !a.startsWith('--'));
  const inconnues = [...options].filter(o => !['--ecrire', '--liste', '--help', '-h'].includes(o));
  if (options.has('--help') || dossiers.length !== 1 || inconnues.length) {
    console.error(USAGE);
    if (inconnues.length) console.error('Option inconnue : ' + inconnues.join(', '));
    return 2;
  }
  const racine = resolve(dossiers[0]);
  if (!existsSync(racine)) { console.error('ERREUR : ' + racine + ' n\'existe pas'); return 2; }
  const ecrire = options.has('--ecrire');
  if (ecrire && racine === DEPOT) { console.error('ERREUR : l\'outil ne réécrit jamais le dépôt de développement (ses commentaires sont le code source) : donne-lui une copie de l\'arbre à publier.'); return 2; }
  const bilan = alleger(racine, { ecrire });
  console.log((ecrire ? 'Réécrit' : 'Mesure (rien n\'est écrit)') + ' : ' + racine);
  console.log('Fichiers lus : ' + bilan.fichiers + ' (allégés ' + bilan.allegés + ', sans commentaire à retirer ' + bilan.inchangés + ', refusés ' + bilan.refusés.length + ')');
  console.log('Poids : ' + mo(bilan.brutAvant) + ' → ' + mo(bilan.brutApres) + ' (' + pct(bilan.brutAvant, bilan.brutApres) + ' de moins) ; compressé (gzip) : ' + mo(bilan.gzAvant) + ' → ' + mo(bilan.gzApres) + ' (' + pct(bilan.gzAvant, bilan.gzApres) + ' de moins)');
  console.log('  dont js : ' + mo(bilan.parType.js[0]) + ' → ' + mo(bilan.parType.js[1]) + ', css : ' + mo(bilan.parType.css[0]) + ' → ' + mo(bilan.parType.css[1]));
  if (options.has('--liste')) for (const f of bilan.detail.sort((a, b) => (b.gzAvant - b.gzApres) - (a.gzAvant - a.gzApres))) console.log('  ' + f.nom + ' : ' + f.gzAvant + ' → ' + f.gzApres);
  for (const r of bilan.refusés) console.error('REFUSÉ (resté tel quel) : ' + r.nom + ' — ' + r.raison);
  return bilan.refusés.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
