#!/usr/bin/env bash
# Reconstruit dev-tests/.offline-cache/ : un miroir LOCAL des dépendances que index.html charge
# depuis des CDN publics (esm.sh, cdnjs, jsdelivr). Rien n'est commité - ni node_modules, ni les
# bundles produits (cf. dev-tests/.gitignore) : ce script les retélécharge depuis npm à la demande.
#
# À quoi ça sert : la politique réseau d'un environnement d'exécution distant (Claude Code sur le
# web, un runner CI...) refuse souvent ces CDN alors que registry.npmjs.org, lui, est joignable.
# Sans ce miroir, TipTap ne démarre pas du tout et AUCUN test ne peut tourner. Dans un navigateur
# normal avec accès aux CDN, ce script est inutile : le harnais marche tel quel.
#
# Les versions installées sont EXACTEMENT celles de l'importmap de index.html - les garder
# synchronisées à la main quand index.html change de version (le script n'est pas une source de
# vérité, juste un miroir).
set -euo pipefail
cd "$(dirname "$0")/.offline-cache"
npm install --no-audit --no-fund --silent
node build.mjs
