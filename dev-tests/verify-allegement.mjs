#!/usr/bin/env node
// LA PUBLICATION ALLÉGÉE (outils/alleger-publication.mjs ; 24/11, Antoine : « oui très bien » à « le document seul d'abord, puis la publication allégée » pour que l'ouverture depuis GFS soit plus rapide) :
// les fichiers de l'app (js/, extensions/, css/) sans leurs commentaires, environ un tiers de moins à télécharger, SANS que le code change. Ce que les cas vérifient :
//  1. le cœur, sur des textes écrits pour piéger l'outil : les commentaires partent (en-tête, bloc sur plusieurs lignes, fin de ligne), mais pas ce qui y ressemble (`'http://x/*y*/'`, une expression régulière,
//     un gabarit, une division, une chaîne ou une adresse `url(...)` de css) ; le code d'après FAIT la même chose que celui d'avant, y compris `return /*⏎*/ x` (le saut de ligne du commentaire reste : la règle
//     du point-virgule automatique renvoie `undefined`, avant comme après) ; `/*! … */`, `@license` et `sourceMappingURL` restent ; le nombre de lignes ne change pas ;
//  2. la preuve se prend en défaut : une sortie qui change le code, une ligne en plus, un texte qui ne se lit plus, un css changé sont REFUSÉS (c'est ce qui fait échouer l'outil sur un fichier qu'il aurait abîmé) ;
//  3. sur l'arbre réel (js/, extensions/ et css/ de ce dépôt) : aucun fichier refusé, au moins le quart du poids compressé en moins, le même nombre de lignes pour CHAQUE fichier, une seconde passe qui n'a
//     plus rien à retirer, et la mesure seule n'écrit rien ;
//  4. ce que l'outil ne touche pas : index.html (l'empreinte de ses scripts en ligne), kit/, vendor/, beta/, un fichier `.min.` ; et il refuse de réécrire le dépôt de développement ;
//  5. l'app DÉMARRE depuis les fichiers allégés (le serveur d'essai les sert avant ceux du dépôt, PP_SITE_OVERLAY) : l'éditeur s'ouvre, le widget est prêt, aucune erreur de page, et ce que la page lit n'a plus
//     les commentaires. Le groupe earlyOpen (32 vérifications) a aussi été lancé une fois contre ces fichiers : PP_SITE_OVERLAY=<dossier allégé> node dev-tests/verify-early-open.mjs.
// Lancé par run-headless.mjs (groupe Node « allegement », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-allegement.mjs
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { alleger, allegerJs, allegerCss, verifierJs, verifierCss } from '../outils/alleger-publication.mjs';

const DEPOT = fileURLToPath(new URL('..', import.meta.url));
const OUTIL = join(DEPOT, 'outils', 'alleger-publication.mjs');
const travail = mkdtempSync(join(tmpdir(), 'allegement-'));
const copier = (nom) => { const dest = join(travail, nom); mkdirSync(dest); for (const d of ['js', 'extensions', 'css']) cpSync(join(DEPOT, d), join(dest, d), { recursive: true }); return dest; };
const lancer = (...args) => spawnSync(process.execPath, [OUTIL, ...args], { encoding: 'utf8' });
const tousLesFichiers = (racine, acc = []) => { for (const nom of readdirSync(racine)) { const chemin = join(racine, nom); if (statSync(chemin).isDirectory()) tousLesFichiers(chemin, acc); else acc.push(chemin); } return acc; };

// Les arbres sont prêts AVANT que le serveur d'essai ne démarre : il lit PP_SITE_OVERLAY à son chargement.
const pristine = copier('intact');
const allegee = copier('allegee');
const sortieEcrire = lancer(allegee, '--ecrire');
const secondePasse = lancer(allegee, '--ecrire');
const mesure = copier('mesure');
const sortieMesure = lancer(mesure);
const bilan = alleger(pristine);
process.env.PP_SITE_OVERLAY = allegee;
const { start, seedModels, overlayServed } = await import('./gfs-page.mjs');

const t = await start({ name: 'verify-allegement', port: Number(process.env.ALLEGEMENT_PORT || 9226) });
const { check } = t;

// --- 1. Des textes écrits pour piéger l'outil ---
const JS = [
  '// en-tête qui part',                                   // 1
  '/* un bloc',                                            // 2
  '   sur trois lignes */',                                // 3
  'var url = \'http://x/*y*/\'; // fin de ligne qui part',  // 4
  'var re = /\\/\\*/.test(\'a /* b\');',                   // 5
  'var gabarit = `a // ${1 /* dedans */ + 1} b`;',         // 6
  'var d = 8 / 2 / 2;',                                    // 7
  'function f() { return /*',                              // 8
  '*/ 5; }',                                               // 9
  '/*! licence gardée */',                                 // 10
  '/** @license MIT gardé */',                             // 11
  'var out = [url, re, gabarit, d, f()];',                 // 12
  '//# sourceMappingURL=a.js.map',                         // 13
].join('\n');
const js = allegerJs(JS);
const valeurs = code => JSON.stringify(new Function(code + '\nreturn out;')());
check('js : l\'outil allège le texte piégé sans le refuser', !!js.sortie, js);
const SORTIE = js.sortie || '';
check('js : les commentaires partent (en-tête, bloc de trois lignes, fin de ligne, et celui d\'un gabarit)', !/en-tête qui part|un bloc|sur trois lignes|fin de ligne qui part|dedans/.test(SORTIE), SORTIE);
check('js : ce qui y ressemble reste (chaîne `http://x/*y*/`, expression régulière, gabarit, division)', /'http:\/\/x\/\*y\*\/'/.test(SORTIE) && /\/\\\/\\\*\//.test(SORTIE) && /`a \/\/ \$\{1[^}]*\+ 1\} b`/.test(SORTIE) && /8 \/ 2 \/ 2/.test(SORTIE), SORTIE);
check('js : le code d\'après fait la même chose que celui d\'avant (mêmes valeurs)', valeurs(JS) === valeurs(SORTIE), { avant: valeurs(JS), apres: valeurs(SORTIE) });
check('js : `return /*⏎*/ x` garde son saut de ligne (le point-virgule automatique renvoie `undefined`, avant et après)', JSON.parse(valeurs(SORTIE))[4] === null && SORTIE.split('\n').length === JS.split('\n').length && /return\s*\n/.test(SORTIE), SORTIE);
check('js : `/*! … */`, `@license` et `sourceMappingURL` restent', /licence gardée/.test(SORTIE) && /@license MIT gardé/.test(SORTIE) && /sourceMappingURL=a\.js\.map/.test(SORTIE), SORTIE);
check('js : le même nombre de lignes (la ligne N du fichier publié est la ligne N du dépôt)', SORTIE.split('\n').length === JS.split('\n').length, { avant: JS.split('\n').length, apres: SORTIE.split('\n').length });
check('js : un module (import/export) et un fichier sans commentaire passent aussi', !!allegerJs('// c\nexport const a = 1;\n').sortie && allegerJs('var a = 1;\n').sortie === 'var a = 1;\n');
check('js : un texte qui ne se lit pas est « illisible », jamais réécrit', allegerJs('function (').raison === 'illisible');

const CSS = [
  '/* en-tête qui part */',                                                // 1
  '.a { color: red; /* fin qui part */ }',                                 // 2
  '.b { background: url(data:image/svg+xml;utf8,<svg xmlns=\'http://x/*y*/\'/>); }', // 3
  '.c::after { content: "/* pas un commentaire */"; }',                    // 4
  '.d/**/.e { margin: 0 }',                                                // 5
  '/*! licence gardée */',                                                 // 6
  '/* sur',                                                                // 7
  '   deux lignes */',                                                     // 8
  '.f { top: 0 }',                                                         // 9
].join('\n');
const css = allegerCss(CSS);
const CS = css.sortie || '';
check('css : l\'outil allège le texte piégé sans le refuser', !!css.sortie, css);
check('css : les commentaires partent (en-tête, fin de ligne, sur deux lignes)', !/en-tête qui part|fin qui part|deux lignes/.test(CS), CS);
check('css : ce qui y ressemble reste (adresse sans guillemets, chaîne, commentaire collé à ses deux jetons, `/*! */`)', /xmlns='http:\/\/x\/\*y\*\/'/.test(CS) && /"\/\* pas un commentaire \*\/"/.test(CS) && /\.d\/\*\*\/\.e/.test(CS) && /licence gardée/.test(CS), CS);
check('css : le même nombre de lignes', CS.split('\n').length === CSS.split('\n').length, CS);

// --- 2. La preuve se prend en défaut ---
const refus = (nom, resultat) => check('la preuve refuse : ' + nom, !!resultat.raison && !resultat.sortie, resultat);
refus('un code changé (`8 / 2 / 2` devient `8 / 2 / 3`)', verifierJs(JS, SORTIE.replace('8 / 2 / 2', '8 / 2 / 3')));
refus('un saut de ligne de plus', verifierJs(JS, SORTIE + '\n'));
refus('un texte qui ne se lit plus', verifierJs(JS, SORTIE.replace('var d', 'var var d')));
refus('un saut de ligne enlevé dans `return /*⏎*/ 5` (le code d\'après renverrait 5 : l\'arbre change)', verifierJs(JS, SORTIE.replace(/return\s*\n\s*\n?\s*5/, 'return 5').replace(/\n\n\n/, '\n\n')));
refus('un css changé (`red` devient `blue`)', verifierCss(CSS, CS.replace('red', 'blue')));
refus('un css qui perd une ligne', verifierCss(CSS, CS.replace('\n.f', '.f')));

// --- 3. L'arbre réel ---
check('l\'arbre réel : l\'outil écrit sans rien refuser (code 0), et le dit', sortieEcrire.status === 0 && /refusés 0\)/.test(sortieEcrire.stdout) && !/REFUSÉ/.test(sortieEcrire.stderr), { statut: sortieEcrire.status, sortie: sortieEcrire.stdout, erreurs: sortieEcrire.stderr });
check('l\'arbre réel : plus de 400 fichiers lus, aucun refusé', bilan.fichiers > 400 && bilan.refusés.length === 0, { fichiers: bilan.fichiers, refusés: bilan.refusés.slice(0, 5) });
const gain = 1 - bilan.gzApres / bilan.gzAvant;
check('l\'arbre réel : au moins le quart du poids compressé en moins (mesuré le 24/11 : 32 %)', gain >= 0.25, { avant: bilan.gzAvant, apres: bilan.gzApres, gain: Math.round(gain * 100) + ' %' });
let lignesDifferentes = [];
let commentairesRestants = 0;
for (const fichier of tousLesFichiers(pristine)) {
  const nom = relative(pristine, fichier);
  const avant = readFileSync(fichier, 'utf8'), apres = readFileSync(join(allegee, nom), 'utf8');
  if (avant.split('\n').length !== apres.split('\n').length) lignesDifferentes.push(nom);
  if (nom.endsWith('.js') && /^\s*\/\/ [A-Za-zÀ-ÿ]/m.test(apres)) commentairesRestants++;
}
check('l\'arbre réel : CHAQUE fichier garde son nombre de lignes (relu ici, sans l\'outil)', lignesDifferentes.length === 0, lignesDifferentes.slice(0, 5));
check('l\'arbre réel : une ligne de commentaire ne reste dans presque aucun fichier js (moins de 5 sur 350 : les `//#` de source et les licences)', commentairesRestants < 5, commentairesRestants);
check('une seconde passe n\'a plus rien à retirer, et sort en 0', secondePasse.status === 0 && /allégés 0,/.test(secondePasse.stdout), { statut: secondePasse.status, sortie: secondePasse.stdout });
const intact = tousLesFichiers(pristine).every(f => readFileSync(f, 'utf8') === readFileSync(join(mesure, relative(pristine, f)), 'utf8'));
check('la mesure seule (sans --ecrire) n\'écrit RIEN et le dit', sortieMesure.status === 0 && intact && /rien n'est écrit/.test(sortieMesure.stdout), sortieMesure.stdout);

// --- 4. Ce que l'outil ne touche pas ---
const mini = join(travail, 'mini');
const poser = (nom, texte) => { const chemin = join(mini, nom); mkdirSync(join(chemin, '..'), { recursive: true }); writeFileSync(chemin, texte); };
const AVEC = '// un commentaire\nvar a = 1; // un autre\n';
const poses = ['js/app.js', 'extensions/x/y.js', 'index.html', 'kit/js/once.js', 'vendor/editeur/m.js', 'beta/js/app.js', 'js/outil.min.js', 'dev-tests/essai.js'];
for (const nom of poses) poser(nom, nom === 'index.html' ? '<script>// un commentaire\nvar a = 1;</script>' : AVEC);
poser('css/a.css', '/* c */\n.a { top: 0 }\n');
const sortieMini = lancer(mini, '--ecrire');
const lu = nom => readFileSync(join(mini, nom), 'utf8');
check('il allège js/, extensions/ et css/ de la racine', sortieMini.status === 0 && lu('js/app.js') === '\nvar a = 1;\n' && lu('extensions/x/y.js') === '\nvar a = 1;\n' && lu('css/a.css') === '\n.a { top: 0 }\n', { app: lu('js/app.js'), css: lu('css/a.css'), sortie: sortieMini.stderr });
check('il ne touche pas index.html, kit/, vendor/, beta/, un fichier `.min.`, ni ce qui est hors des trois dossiers', ['index.html', 'kit/js/once.js', 'vendor/editeur/m.js', 'beta/js/app.js', 'js/outil.min.js', 'dev-tests/essai.js'].every(nom => lu(nom) === (nom === 'index.html' ? '<script>// un commentaire\nvar a = 1;</script>' : AVEC)));
const surDepot = lancer(DEPOT, '--ecrire');
check('il refuse de réécrire le dépôt de développement (code 2, rien de changé)', surDepot.status === 2 && /dépôt de développement/.test(surDepot.stderr));
check('sans dossier ou avec une option inconnue : l\'usage et le code 2', lancer().status === 2 && lancer(mini, '--nimporte').status === 2);
// Un fichier que la preuve refuse reste tel quel, et l'outil sort en 1.
poser('js/casse.js', 'var x = (;\n');
const sortieCasse = lancer(mini, '--ecrire');
check('un fichier qui ne se lit pas reste tel quel, est nommé, et l\'outil sort en 1', sortieCasse.status === 1 && /REFUSÉ \(resté tel quel\) : js\/casse\.js/.test(sortieCasse.stderr) && lu('js/casse.js') === 'var x = (;\n', { statut: sortieCasse.status, erreurs: sortieCasse.stderr });

// --- 5. L'app démarre depuis les fichiers allégés ---
const { app } = await t.openPage({ hosted: false, lang: 'fr', seed: seedModels() });
const statut = await app.evaluate(() => (document.getElementById('status-msg') || {}).textContent);
check('l\'éditeur s\'ouvre et le widget est prêt depuis les fichiers allégés', /prêt|ready|ouvert|opened|non enregistré|not saved/i.test(statut || ''), statut);
check('le serveur d\'essai a servi les fichiers allégés (js/main.js, js/early-open.js, css/style.css)', ['/js/main.js', '/js/early-open.js', '/css/style.css'].every(nom => overlayServed.has(nom)), [...overlayServed].slice(0, 6));
const lecture = await app.evaluate(async () => ({ js: await (await fetch('js/early-open.js')).text(), css: await (await fetch('css/style.css')).text() }));
check('ce que la page lit n\'a plus ses commentaires (js/early-open.js : 67 lignes, dont l\'en-tête de 12 lignes ne dit plus rien)', lecture.js.split('\n').length === readFileSync(join(DEPOT, 'js', 'early-open.js'), 'utf8').split('\n').length && !/L'ouverture du document que GFS désigne/.test(lecture.js) && /const EarlyOpen = \(function/.test(lecture.js), lecture.js.slice(0, 300));
check('et le css aussi, avec les mêmes lignes', lecture.css.split('\n').length === readFileSync(join(DEPOT, 'css', 'style.css'), 'utf8').split('\n').length && lecture.css.length < readFileSync(join(DEPOT, 'css', 'style.css'), 'utf8').length);

rmSync(travail, { recursive: true, force: true });
await t.finish();
