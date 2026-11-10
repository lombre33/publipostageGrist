#!/usr/bin/env node
// Le bloc de PRÉCHARGEMENT des scripts d'index.html (10/11, audit de performance).
//
// Pourquoi : index.html porte sa politique de sécurité du contenu dans une balise <meta> (GitHub Pages n'envoie aucun en-tête). Chromium ne lance alors plus la lecture anticipée de la page : les 213 scripts
// sont demandés UN PAR UN, chacun après l'exécution du précédent, soit un aller-retour réseau par script (mesuré avec 30 ms d'aller-retour : 8,6 s avant « DOMContentLoaded », 19,6 s à 80 ms ; 1,0 s et 1,4 s
// avec le bloc). Une balise `<link rel="preload" as="script">` par script les fait demander tous ensemble, dès l'en-tête ; les scripts gardent leur place et leur ordre d'exécution, rien d'autre ne change.
// Le bloc est ÉCRIT par cet outil à partir des balises `<script src="js/…">` de la page : une version (`?v=`) qui diffère entre la balise et son préchargement ferait télécharger le fichier deux fois.
//
//   node outils/precharger-scripts.mjs              réécrit le bloc d'index.html d'après ses balises (à lancer après avoir ajouté, retiré ou monté la version d'un script)
//   node outils/precharger-scripts.mjs --verifier   code 1 si le bloc n'est pas à jour (c'est ce que vérifie dev-tests/verify-code-hygiene.mjs)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const INDEX_PATH = join(ROOT, 'index.html');
export const START = '<!-- précharge des scripts : début (écrit par outils/precharger-scripts.mjs d\'après les balises <script> ci-dessous : ne pas le modifier à la main) -->';
export const END = '<!-- précharge des scripts : fin -->';
const EXPLAIN = '<!-- Sans ce bloc, les scripts se chargent un par un (la politique de sécurité de cette page est une balise <meta> : le navigateur ne lit plus la page à l\'avance) : 8 s de plus à 30 ms d\'aller-retour. -->';

// Les scripts de la page qui s'exécutent (ni le script en ligne, ni la carte d'importation, ni les moteurs paresseux `type="text/x-lazy-…"`), dans leur ordre, hors du bloc lui-même.
export function scriptsOf(html) {
  const outside = html.replace(blockPattern(), '');
  return [...outside.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script src="((?:js|extensions)\/[^"]+)"><\/script>/g)].map(m => m[1]);
}
function blockPattern() {
  return new RegExp(escapeRegExp(START) + '[\\s\\S]*?' + escapeRegExp(END) + '\\n?');
}
function escapeRegExp(text) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function blockFor(html) {
  return [START, EXPLAIN].concat(scriptsOf(html).map(src => `<link rel="preload" as="script" href="${src}">`)).concat(END).join('\n') + '\n';
}
// Le texte d'index.html avec son bloc à jour : remplacé là où il est, ou posé avant </head>.
export function rewrite(html) {
  const block = blockFor(html);
  if (blockPattern().test(html)) return html.replace(blockPattern(), () => block);
  return html.replace('</head>', () => block + '</head>');
}
export function isCurrent(html) { return rewrite(html) === html; }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const html = readFileSync(INDEX_PATH, 'utf8');
  if (process.argv.includes('--verifier')) {
    if (isCurrent(html)) console.log('Le bloc de préchargement d\'index.html est à jour (' + scriptsOf(html).length + ' scripts).');
    else { console.error('Le bloc de préchargement d\'index.html n\'est pas à jour : lancer node outils/precharger-scripts.mjs'); process.exit(1); }
  } else {
    const next = rewrite(html);
    if (next === html) console.log('Rien à changer (' + scriptsOf(html).length + ' scripts préchargés).');
    else { writeFileSync(INDEX_PATH, next); console.log('Bloc de préchargement réécrit : ' + scriptsOf(next).length + ' scripts.'); }
  }
}
