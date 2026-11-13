#!/usr/bin/env node
// Le bloc de PRÉCHARGEMENT des scripts d'index.html (10/11, audit de performance).
//
// Pourquoi : index.html porte sa politique de sécurité du contenu dans une balise <meta> (GitHub Pages n'envoie aucun en-tête). Chromium ne lance alors plus la lecture anticipée de la page : les 213 scripts
// sont demandés UN PAR UN, chacun après l'exécution du précédent, soit un aller-retour réseau par script (mesuré avec 30 ms d'aller-retour : 8,6 s avant « DOMContentLoaded », 19,6 s à 80 ms ; 1,0 s et 1,4 s
// avec le bloc). Une balise `<link rel="preload" as="script">` par script les fait demander tous ensemble, dès l'en-tête ; les scripts gardent leur place et leur ordre d'exécution, rien d'autre ne change.
// Le bloc est ÉCRIT par cet outil à partir des balises `<script src="js/…">` de la page : une version (`?v=`) qui diffère entre la balise et son préchargement ferait télécharger le fichier deux fois.
//
// nouveautes.html (la fenêtre des nouveautés de la version 1 seule sur sa page, consigne 070 de GFS) charge une partie des fichiers d'index.html : l'outil lui donne LEURS versions (`?v=`), puisqu'un même fichier à
// deux versions serait téléchargé deux fois par la personne qui a ouvert le widget puis cette page, et il écrit son bloc de préchargement de la même façon. Les fichiers propres à la page (js/news-page.js,
// css/news-page.css) gardent la version qu'elle écrit.
//
//   node outils/precharger-scripts.mjs              réécrit le bloc d'index.html d'après ses balises, puis aligne nouveautes.html sur index.html et réécrit son bloc (à lancer après avoir ajouté, retiré ou monté la version d'un fichier)
//   node outils/precharger-scripts.mjs --verifier   code 1 si l'un des deux blocs, ou les versions de nouveautes.html, ne sont pas à jour (c'est ce que vérifie dev-tests/verify-code-hygiene.mjs)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const INDEX_PATH = join(ROOT, 'index.html');
export const NEWS_PATH = join(ROOT, 'nouveautes.html');
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

// Les fichiers qu'une page charge par une balise `<script src="js/…?v=…">` ou `<link rel="stylesheet" href="css/…?v=…">`, dans l'ordre de la page, hors commentaires et hors du bloc de préchargement : [fichier, version].
const FILE_TAG = /<script src="((?:js|extensions)\/[^"?]+)\?v=([^"]+)"><\/script>|<link rel="stylesheet" href="(css\/[^"?]+)\?v=([^"]+)">/g;
export function filesOf(html) {
  const outside = html.replace(blockPattern(), '').replace(/<!--[\s\S]*?-->/g, '');
  return [...outside.matchAll(FILE_TAG)].map(m => m[1] ? [m[1], m[2]] : [m[3], m[4]]);
}
// nouveautes.html avec, pour chaque fichier qu'index.html charge aussi, la version d'index.html (les commentaires de la page ne sont pas touchés : seules les balises le sont).
export function alignNews(newsHtml, indexHtml) {
  const versions = new Map(filesOf(indexHtml));
  return newsHtml.replace(FILE_TAG, (tag, script, scriptVersion, sheet, sheetVersion) => {
    const file = script || sheet;
    const version = versions.get(file);
    return version === undefined ? tag : tag.replace('?v=' + (script ? scriptVersion : sheetVersion), '?v=' + version);
  });
}
// nouveautes.html à jour : versions d'index.html, puis son propre bloc de préchargement.
export function rewriteNews(newsHtml, indexHtml) { return rewrite(alignNews(newsHtml, indexHtml)); }
export function isCurrentNews(newsHtml, indexHtml) { return rewriteNews(newsHtml, indexHtml) === newsHtml; }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const html = readFileSync(INDEX_PATH, 'utf8');
  const news = existsSync(NEWS_PATH) ? readFileSync(NEWS_PATH, 'utf8') : null;
  if (process.argv.includes('--verifier')) {
    const stale = [];
    if (!isCurrent(html)) stale.push('index.html (le bloc de préchargement)');
    if (news !== null && !isCurrentNews(news, html)) stale.push('nouveautes.html (les versions d\'index.html, ou son bloc de préchargement)');
    if (stale.length === 0) console.log('Les blocs de préchargement sont à jour : index.html (' + scriptsOf(html).length + ' scripts)' + (news !== null ? ', nouveautes.html (' + scriptsOf(news).length + ' scripts).' : '.'));
    else { console.error('À réécrire : ' + stale.join(' ; ') + ' : lancer node outils/precharger-scripts.mjs'); process.exit(1); }
  } else {
    const next = rewrite(html);
    if (next === html) console.log('index.html : rien à changer (' + scriptsOf(html).length + ' scripts préchargés).');
    else { writeFileSync(INDEX_PATH, next); console.log('index.html : bloc de préchargement réécrit (' + scriptsOf(next).length + ' scripts).'); }
    if (news !== null) {
      const nextNews = rewriteNews(news, next);
      if (nextNews === news) console.log('nouveautes.html : rien à changer (' + scriptsOf(news).length + ' scripts préchargés).');
      else { writeFileSync(NEWS_PATH, nextNews); console.log('nouveautes.html : versions alignées sur index.html, bloc de préchargement réécrit (' + scriptsOf(nextNews).length + ' scripts).'); }
    }
  }
}
