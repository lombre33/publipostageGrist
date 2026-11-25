#!/usr/bin/env bash
# Reconstruit dev-tests/.offline-cache/ : un miroir LOCAL des dépendances que l'app charge depuis
# un CDN public (jsdelivr : les exports, le lecteur Markdown, les graphiques) et de celles de ses
# essais. L'éditeur n'en fait plus partie : il vient de sa copie figée vendor/editeur/, un fichier
# du dépôt (consigne 107 de GFS). Rien n'est commité - ni node_modules, ni les bundles produits,
# ni la liste de paquets du dossier (cf. dev-tests/.gitignore) : ce script les retélécharge depuis
# npm à la demande.
#
# À quoi ça sert : la politique réseau d'un environnement d'exécution distant (Claude Code sur le
# web, un runner CI...) refuse souvent ces CDN alors que registry.npmjs.org, lui, est joignable.
# Sans ce miroir, les exports (PDF, Word, Excel...) ne se chargent pas et les essais qui les jouent
# ne peuvent pas tourner. Dans un navigateur normal avec accès aux CDN, ce script est inutile : le
# harnais marche tel quel.
#
# Deux étapes, dans cet ordre :
#  1. `node kit/outils/bibliotheques.mjs --miroir` (le kit, sous-module `kit/`, consigne 063 de GFS) :
#     d'après la liste des bibliothèques (package.json à la racine : « dependencies » et
#     « devDependencies » aux versions exactes, section « gfs.miroir » et « miroir » de chaque
#     bibliothèque), il écrit la liste de paquets du dossier, lance `npm install`, construit les
#     modules ES de la carte d'importation (esm/, esm-map.json : seuls les essais de la Beta figée,
#     qui charge encore son éditeur depuis l'ancien CDN, les lisent) et copie les fichiers UMD que
#     les essais lisent (umd/). Les versions ne s'écrivent donc qu'une fois, dans la liste de la racine.
#  2. assemblage-gfs.mjs : les deux fichiers que Grist Factory Suite assemble et que les essais
#     servent à sa place, « edition-live » (l'écriture en direct) et « pdfjs » (la lecture de PDF).
#     Leurs paquets ne sont PAS dans la liste de la racine (la liste de l'app ne nomme pas les
#     bibliothèques d'une extension) : edition-live.json et pdfjs-gfs.json les portent, le script
#     les installe à part (edition-live-deps/, pdfjs-deps/) et construit edition-live/edition-live.js
#     et pdfjs/pdfjs.js.
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -f "$RACINE/kit/outils/bibliotheques.mjs" ]; then
  echo "Il manque le kit de Grist Factory (kit/outils/bibliotheques.mjs) : lancer d'abord « git submodule update --init kit »." >&2
  exit 1
fi
cd "$RACINE"
node kit/outils/bibliotheques.mjs --miroir
cd dev-tests/.offline-cache
node assemblage-gfs.mjs
