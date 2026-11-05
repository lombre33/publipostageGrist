#!/usr/bin/env bash
# Régénère les captures du README public (widget autonome, sans Grist Factory Suite) : le VRAI widget du dépôt, le faux Grist de dev-tests/, la vraie souris.
# Les scènes tournent l'une après l'autre (jamais deux navigateurs en même temps : les captures dépendent des délais).
#
# Usage : REPO_DIR=/chemin/du/depot bash lancer-tout.sh [dossier des images finales]
#   REPO_DIR  : le dépôt publipostageGrist (défaut : celui de ce script), avec dev-tests/.offline-cache (bash dev-tests/offline-deps.sh, 1 à 2 min)
#   OUT_DIR   : où les scènes écrivent leurs images brutes (défaut ./out à côté des scripts)
#   argument  : le dossier des images finales (défaut ../public/screenshots : celui que publier.sh pose dans screenshots/ du dépôt public)
# Une scène seule : `node s09-recherche.mjs` (elle écrit dans OUT_DIR ; le nom brut est dans la table ci-dessous).
set -euo pipefail
cd "$(dirname "$0")"
export REPO_DIR="${REPO_DIR:-$(cd ../../.. && pwd)}"
export OUT_DIR="${OUT_DIR:-$PWD/out}"
FINAL="${1:-$(cd ../public && pwd)/screenshots}"

[ -f "$REPO_DIR/dev-tests/.offline-cache/esm-map.json" ] || { echo "Il manque le miroir hors ligne : cd $REPO_DIR && bash dev-tests/offline-deps.sh" >&2; exit 1; }
command -v convert >/dev/null || { echo "ImageMagick (convert) est nécessaire." >&2; exit 1; }
mkdir -p "$OUT_DIR" "$FINAL"

for scene in s01-hero s02-galerie s03-alignement s04-conditions s05-versions s06-tableau s07-exports s08-assemblage s09-recherche s10-boucle s11-lecture s12-macro; do
  echo "== $scene"
  node "$scene.mjs"
done

# image brute -> nom final (les 17 images que le README public montre)
while read -r raw final; do
  cp "$OUT_DIR/$raw" "$FINAL/$final"
done <<'EOF'
h1-edition-contrat-prestation-services.png 01-edition-modele-avec-variables.png
h2-lecture-contrat-prestation-services.png 02-lecture-document-rempli.png
g-galerie-grille.png 03-galerie-de-modeles.png
b2-menu-caractere.png 11-menu-caractere-aa.png
b3-fenetre-paragraphe.png 12-fenetre-paragraphe.png
b3b-paragraphe-applique.png 13-resultat-caractere-et-paragraphe.png
t3-tableau-bordures-crop.png 20-tableau-bordures-comme-une-grille.png
c2-condition-groupe.png 30-condition-et-ou-groupes.png
l4-boucle.png 31-boucle-ligne-de-tableau.png
k0b-macro-resume.png 40-macro-modele-composition.png
k3-macro-lecture.png 41-macro-modele-lecture.png
v1-versions.png 42-historique-des-versions.png
e2-type-export.png 50-type-export.png
a2-assemblage.png 51-assemblage-avant-impression.png
r1-recherche.png 60-rechercher-remplacer-regex.png
m1-mode-lecture.png 70-menu-mode-lecture.png
m2-lecture-epuree.png 71-lecture-epuree.png
EOF
echo "Images finales : $FINAL"
ls -l "$FINAL"
