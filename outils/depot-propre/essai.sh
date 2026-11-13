#!/usr/bin/env bash
# Essai de publier.sh et de controles.mjs sur de faux dépôts : aucun accès réseau, rien n'est poussé, tout disparaît à la fin.
# Usage : bash outils/depot-propre/essai.sh      (code de sortie 1 s'il y a un échec)
set -uo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/essai-publier-XXXXXX")"
trap 'rm -rf "$T"' EXIT
OK=0; KO=0

G() { git -c user.name=essai -c user.email=essai@example.invalid -c commit.gpgsign=false "$@"; }
ok() { OK=$((OK + 1)); echo "  ok     $1"; }
ko() { KO=$((KO + 1)); echo "  ÉCHEC  $1${2:+ : $2}"; }
# attend(description, motif, sortie) : la sortie contient le motif
attend() { if grep -q -- "$2" <<<"$3"; then ok "$1"; else ko "$1" "« $2 » absent de : $(head -c 300 <<<"$3" | tr '\n' ' ')"; fi; }
# vrai(description, commande…)
vrai() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else ko "$d"; fi; }

# L'étiquette de la bêta figée (beta/) : dans ces essais, v1.0.0-beta.1 est celle que la première publication pose plus bas, la bêta des faux dépôts a la sienne.
export PP_BETA_ETIQUETTE=beta-figee-essai
PUBLIER_ENV=(PP_DATE=2026-10-04 PP_AUTEUR_NOM=Essai PP_AUTEUR_EMAIL=1+grist-factory@users.noreply.github.com)
publier() { env "${PUBLIER_ENV[@]}" bash "$T/dev/outils/depot-propre/publier.sh" --propre "$T/propre" "$@" 2>&1; }

# --- Un faux dépôt de développement, avec les vrais outils et les vrais documents publics ----------------------------------------------------
HASH="$(printf '%s' 'window.x=1;' | openssl dgst -sha256 -binary | openssl base64 -A)"
git init -q --bare "$T/dev-origin.git"
git init -q -b main "$T/dev"
(
  cd "$T/dev"
  mkdir -p css js extensions img templates-gallery dev-tests planning outils/depot-propre/public outils/depot-propre/beta
  cat > index.html <<HTML
<!doctype html><html><head><meta charset="utf-8"><title>essai</title>
<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'sha256-$HASH'; object-src 'none'">
<link rel="stylesheet" href="css/style.css"><script>window.x=1;</script><script src="js/version.js"></script><script src="js/main.js"></script>
</head><body><img src="img/logo.jpg"></body></html>
HTML
  # La page des nouveautés de la version 1 (consigne 070 de GFS) : la fenêtre des nouveautés seule sur sa page, sous une politique de sécurité qui ne laisse passer que ses propres fichiers ; le bouton du bandeau de la bêta figée l'ouvre.
  cat > nouveautes.html <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><title>nouveautés</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<link rel="stylesheet" href="css/style.css"><script src="js/version.js"></script><script src="js/main.js"></script>
</head><body><img src="img/logo.jpg"></body></html>
HTML
  echo 'body { margin: 0; }' > css/style.css
  echo "const PP_VERSION = '1.0.0-beta.1';" > js/version.js
  echo 'window.main = function () { return 1; };' > js/main.js
  echo 'jpg' > img/logo.jpg
  : > .nojekyll   # vide, comme celui du dépôt de développement : publier.sh le fait partir, controles.mjs l'exige
  echo '[]' > templates-gallery/catalogue.json
  printf 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n' > LICENSE
  echo '# dev' > README.md; echo x > dev-tests/a.mjs; echo x > planning/a.md
  # La liste unique des bibliothèques et son catalogue (consignes 063 et 067 de GFS) : à la racine du dépôt de développement, ils ne partent pas.
  mkdir -p bibliotheques; echo '{}' > package.json; echo '{}' > bibliotheques/catalogue.json
  # La copie figée de l'éditeur (consigne 066 de GFS) : du code de tiers construit par l'outil du kit, que publier.sh fait partir avec la page (PUBLIES) ; le faux en porte un module, ses licences et son manifeste.
  mkdir -p vendor/editeur; echo 'export default 1;' > vendor/editeur/prosemirror.js; echo 'licences' > vendor/editeur/LICENCES.txt; echo '{}' > vendor/editeur/COPIE.json
  # Les outils, avec le bandeau de la bêta figée (beta-bandeau.mjs et les deux fichiers de beta/) : controles.mjs et publier.sh les lisent à côté d'eux.
  cp "$ICI/publier.sh" "$ICI/controles.mjs" "$ICI/beta-bandeau.mjs" outils/depot-propre/
  cp "$ICI"/beta/beta-bandeau.js "$ICI"/beta/beta-bandeau.css outils/depot-propre/beta/
  cp -r "$ICI"/public/* outils/depot-propre/public/
  # La carte du code cite chaque fichier du widget : le faux dépôt les porte (vides, pages .html comprises), pour que ses références tiennent.
  grep -oE '`(js|css|extensions)/[A-Za-z0-9_./-]+\.(js|css|html)`' "$ICI/public/CARTE_DU_CODE.md" | tr -d '`' | sort -u | while read -r f; do [ -e "$f" ] || { mkdir -p "$(dirname "$f")"; echo "/* $f */" > "$f"; }; done
  # Le kit de Grist Factory (consigne 041 de GFS) : un sous-module, ici d'un faux dépôt local (git ne laisse cloner un chemin local qu'avec cet accord, le temps de l'essai).
  git init -q -b main "$T/kit-src"
  (
    cd "$T/kit-src"
    mkdir -p css js test
    echo '.kit { color: #000; }' > css/tokens.css
    for f in ambiance-message ambiance-pose correcteurs-message correcteurs-pose once; do echo "export default '$f';" > "js/$f.js"; done
    printf 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n' > LICENSE
    echo '# kit' > README.md; echo x > CHANGELOG.md; echo x > test/a.mjs
    G add -A; G commit -qm kit
  )
  git -c protocol.file.allow=always submodule add -q "$T/kit-src" kit
  G add -A; G commit -qm essai
  git remote add origin "$T/dev-origin.git"; git push -q origin main
)

# --- Un faux dépôt public, à l'adresse attendue --------------------------------------------------------------------------------------------
git init -q -b main "$T/propre-src"
(
  cd "$T/propre-src"
  mkdir -p screenshots; echo png > screenshots/01-edition-modele-avec-variables.png; echo png > screenshots/02-lecture-document-rempli.png; echo png > screenshots/ancienne.png
  echo '# alpha' > README.md; echo old > index.html
  # La bêta figée : beta/ porte les fichiers du site de la bêta (une page, sa feuille de style, sa version, une image, un catalogue, la licence). L'étiquette de la bêta les porte à la racine :
  # son arbre est celui de beta/ (un commit orphelin, comme l'étiquette v1.0.0-beta.1 du vrai dépôt public, dont l'arbre est celui du site). Sa page a, comme celle de la vraie bêta, </head> et </body>
  # chacun en début de ligne : c'est là que beta-bandeau.mjs pose les deux lignes du bandeau (consigne 070 de GFS), la feuille avant </head>, le script avant </body>.
  mkdir -p beta/css beta/js beta/img beta/templates-gallery
  printf '<!doctype html>\n<html>\n<head>\n<title>bêta</title>\n<link rel="stylesheet" href="css/style.css">\n</head>\n<body>\n<img src="img/logo.jpg">\n<script src="js/version.js"></script>\n</body>\n</html>\n' > beta/index.html
  echo 'body { margin: 1px; }' > beta/css/style.css
  echo "const PP_VERSION = '1.0.0-beta.1';" > beta/js/version.js
  echo jpg > beta/img/logo.jpg
  echo '[]' > beta/templates-gallery/catalogue.json
  printf 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n' > beta/LICENSE
  G add -A; G commit -qm alpha
  G tag beta-figee-essai "$(echo bêta | G commit-tree HEAD:beta)"
)
mkdir -p "$T/web/github.com/grist-factory"
git clone -q --bare "$T/propre-src" "$T/web/github.com/grist-factory/Publipostage-Plus.git"
git clone -q "$T/web/github.com/grist-factory/Publipostage-Plus.git" "$T/propre"
AVANT="$(git -C "$T/propre" rev-parse HEAD)"

echo "publier.sh : refus"
(cd "$T/dev" && G rm -q .nojekyll && G commit -qm "sans .nojekyll" && git push -q origin main)
attend "refuse un dépôt de développement sans .nojekyll (le site du dépôt public passerait ses .md dans Jekyll)" ".nojekyll n'existe pas dans le dépôt de développement" "$(publier)"
(cd "$T/dev" && : > .nojekyll && G add .nojekyll && G commit -qm "avec .nojekyll" && git push -q origin main)
# Le kit est un sous-module : tant que `git submodule update --init kit` n'a pas été fait dans le dépôt de développement, il n'y a rien à publier, et la publication dit quoi faire.
(cd "$T/dev" && git submodule deinit -q -f kit)
attend "refuse un kit qui n'est pas récupéré, et dit comment le récupérer" "submodule update --init kit" "$(publier)"
(cd "$T/dev" && git -c protocol.file.allow=always submodule update -q --init kit)
vrai "... et le dépôt de développement est de nouveau propre, kit récupéré" test -z "$(git -C "$T/dev" status --porcelain)" -a -s "$T/dev/kit/js/ambiance-pose.js"
echo 'x' >> "$T/dev/README.md"
attend "refuse un dépôt de développement modifié" "modifications non committées" "$(publier)"
git -C "$T/dev" checkout -q -- README.md
mkdir -p "$T/dev/nouveau-dossier"; echo x > "$T/dev/nouveau-dossier/a"
(cd "$T/dev" && G add -A && G commit -qm "dossier inconnu" && git push -q origin main)
attend "refuse une entrée inconnue à la racine" "à classer dans PUBLIES ou EXCLUS" "$(publier)"
(cd "$T/dev" && G rm -rq nouveau-dossier && G commit -qm "retrait" && git push -q origin main)
mkdir -p "$T/dev/outils/depot-propre/public/autre"; echo x > "$T/dev/outils/depot-propre/public/autre/a"
(cd "$T/dev" && G add -A && G commit -qm "sous-dossier inconnu dans public/" && git push -q origin main)
attend "refuse un sous-dossier inconnu dans public/" "ne contient que des documents" "$(publier)"
(cd "$T/dev" && G rm -rq outils/depot-propre/public/autre && G commit -qm "retrait" && echo x > outils/depot-propre/public/screenshots/note.txt && G add -A && G commit -qm "fichier qui n'est pas une capture" && git push -q origin main)
attend "refuse un fichier qui n'est pas un .png dans public/screenshots/" "ne contient que les captures du README" "$(publier)"
(cd "$T/dev" && G rm -rq outils/depot-propre/public/screenshots/note.txt && echo x > outils/depot-propre/public/beta && G add -A && G commit -qm "un document nommé beta dans public/" && git push -q origin main)
attend "refuse un document de public/ nommé beta (le dossier de la bêta figée du dépôt public n'est jamais écrasé)" "dossier de la bêta figée" "$(publier)"
(cd "$T/dev" && G rm -q outils/depot-propre/public/beta && G commit -qm "retrait" && echo "// Antoine l'a demandé" >> js/main.js && G commit -qam "prénom" && git push -q origin main)
# Un modèle de la galerie qui vient avec ses tables : sa capture et le fichier de tables de sa famille manquent, la publication le dit dans la même passe.
(cd "$T/dev" && mkdir -p templates-gallery/m && echo '{"family":"f"}' > templates-gallery/m/pack.json && echo '[{"id":"m","name":"M","pack":"m/pack.json","preview":[{"src":"m/capture-1.png","w":1,"h":1}]}]' > templates-gallery/catalogue.json && G add -A && G commit -qm "modèle à pack sans capture ni famille" && git push -q origin main)
SORTIE="$(publier)"
attend "refuse quand les contrôles trouvent le prénom" "le prénom du développeur" "$SORTIE"
attend "refuse un modèle à pack dont la capture manque" "cite la capture m/capture-1.png" "$SORTIE"
attend "refuse un modèle à pack dont la famille n'a pas de fichier de tables" "la famille f n'a pas de fichier" "$SORTIE"
attend "ne committe rien quand les contrôles échouent" "rien n'est committé" "$SORTIE"
vrai "remet le clone public à son état d'origine" test "$(git -C "$T/propre" rev-parse HEAD)" = "$AVANT" -a -z "$(git -C "$T/propre" status --porcelain)"

echo "publier.sh : publication"
(cd "$T/dev" && sed -i '/Antoine/d' js/main.js && G rm -rq templates-gallery/m && echo '[]' > templates-gallery/catalogue.json && G add -A && G commit -qm "prénom retiré, modèle à pack retiré" && git push -q origin main)
SORTIE="$(publier --sortie "$T/sortie1")"
attend "publie quand tout est en règle" "Commit .* et étiquette v1.0.0-beta.1 prêts" "$SORTIE"
P="$T/propre"
vrai "identité du commit" test "$(git -C "$P" log -1 --format='%an <%ae>')" = "Essai <1+grist-factory@users.noreply.github.com>"
vrai "étiquette annotée v1.0.0-beta.1" test "$(git -C "$P" cat-file -t v1.0.0-beta.1)" = "tag"
vrai "un commit de plus sur l'historique existant" test "$(git -C "$P" rev-parse HEAD~1)" = "$AVANT"
vrai "le message ne porte aucune trace de session" test -z "$(git -C "$P" log -1 --format=%B | grep -i -E 'claude|session|co-authored')"
vrai "dev-tests, planning et outils ne partent pas" test -z "$(git -C "$P" ls-tree --name-only HEAD | grep -E '^(dev-tests|planning|outils)$')"
vrai "package.json et bibliotheques/ (la liste unique des bibliothèques et son catalogue) sont connus du dépôt de développement et ne partent pas" test -f "$T/dev/package.json" -a -z "$(git -C "$P" ls-tree --name-only HEAD | grep -E '^(package.json|bibliotheques)$')"
vrai ".nojekyll part avec le reste, vide, à la racine du dépôt public" test -f "$P/.nojekyll" -a ! -s "$P/.nojekyll" -a -n "$(git -C "$P" ls-tree --name-only HEAD | grep -x '.nojekyll')"
vrai "les documents publics sont là, README du dépôt de développement absent" test -f "$P/SECURITY.md" -a -f "$P/NOTICE" -a "$(head -1 "$P/README.md")" = "# Publipostage+ pour Grist"
# Un gabarit resté en place s'écrit {{MAJUSCULES}} (comme le cherche controles.mjs) : la carte décrit aussi des {{variables}} de modèle, qui sont du texte.
vrai "la carte du code part avec les documents publics, version et date remplacées" bash -c "grep -q '^# Carte du code de Publipostage+' '$P/CARTE_DU_CODE.md' && ! grep -qE '\{\{[A-Z_]+\}\}' '$P/CARTE_DU_CODE.md'"
vrai "la note de version part avec les documents publics, version et dates remplacées, en français puis en anglais" bash -c "grep -q '^# Publipostage+ : notes de version' '$P/PATCH_NOTES.md' && grep -q '^# Publipostage+: release notes (English)' '$P/PATCH_NOTES.md' && ! grep -qE '\{\{[A-Z_]+\}\}' '$P/PATCH_NOTES.md' && grep -qF '**Publipostage+ 1.0.0-beta.1**, publiée le 4 octobre 2026' '$P/PATCH_NOTES.md' && grep -qF '**Publipostage+ 1.0.0-beta.1**, released on October 4, 2026' '$P/PATCH_NOTES.md'"
vrai "les captures de public/screenshots/ sont posées dans screenshots/ du dépôt public, identiques" bash -c "cmp -s '$T/dev/outils/depot-propre/public/screenshots/01-edition-modele-avec-variables.png' '$P/screenshots/01-edition-modele-avec-variables.png' && cmp -s '$T/dev/outils/depot-propre/public/screenshots/02-lecture-document-rempli.png' '$P/screenshots/02-lecture-document-rempli.png'"
vrai "une capture que seul le dépôt public porte est gardée" test "$(cat "$P/screenshots/ancienne.png")" = png
kit_en_fichiers() { # css, js et licence du kit, en fichiers ordinaires, sans .gitmodules ni lien de sous-module (le dépôt public n'a pas de sous-module)
  [ -s "$P/kit/js/ambiance-pose.js" ] && [ -s "$P/kit/js/ambiance-message.js" ] && [ -s "$P/kit/js/once.js" ] && [ -s "$P/kit/css/tokens.css" ] && [ -s "$P/kit/LICENSE" ] \
    && [ ! -e "$P/.gitmodules" ] && [ -z "$(git -C "$P" ls-tree -r HEAD | grep -E '^160000')" ] && [ -n "$(git -C "$P" ls-tree --name-only HEAD kit/js/ambiance-pose.js)" ]
}
vrai "le kit part en fichiers (css, js, licence), au commit épinglé, sans .gitmodules ni sous-module" kit_en_fichiers
vrai "... sans son README, son journal ni ses essais" test ! -e "$P/kit/README.md" -a ! -e "$P/kit/CHANGELOG.md" -a ! -e "$P/kit/test" -a ! -e "$P/kit/.git"
vrai "la copie figée de l'éditeur part avec la page : un module, ses licences et son manifeste (vendor/editeur)" test -s "$P/vendor/editeur/prosemirror.js" -a -s "$P/vendor/editeur/LICENCES.txt" -a -s "$P/vendor/editeur/COPIE.json"
vrai "la date est écrite en toutes lettres" grep -q "4 octobre 2026" "$P/README.md"
vrai "la sauvegarde .bundle existe" test -s "$T/sortie1/publication-1.0.0-beta.1.bundle"
vrai "le clone public est propre" test -z "$(git -C "$P" status --porcelain)"
vrai "nouveautes.html (la page des nouveautés de la version 1) part à la racine du dépôt public, avec la version 1" test -s "$P/nouveautes.html" -a -n "$(git -C "$P" ls-tree --name-only HEAD | grep -x 'nouveautes.html')"
# La bêta figée (consigne 070 de GFS) : l'étiquette de la bêta, sans correctif, avec un bandeau en plus - deux fichiers (js/beta-bandeau.js, css/beta-bandeau.css) et deux lignes de index.html. Rien d'autre n'a bougé.
vrai "la bêta figée n'a pas bougé, sauf son bandeau : beta/ est l'étiquette de la bêta, octet pour octet, plus le bandeau de outils/depot-propre/beta/ (beta-bandeau.mjs --verifier), et rien d'autre" node "$ICI/beta-bandeau.mjs" --verifier "$P"
vrai "... ses fichiers sont ceux de l'étiquette (version, feuille de style, image, catalogue, licence)" bash -c "for f in js/version.js css/style.css img/logo.jpg templates-gallery/catalogue.json LICENSE; do test \"\$(git -C '$P' rev-parse HEAD:beta/\$f)\" = \"\$(git -C '$P' rev-parse '$PP_BETA_ETIQUETTE:'\$f)\" || exit 1; done"
vrai "... et la page n'a que deux lignes de plus, celles du bandeau : la feuille avant </head>, le script avant </body>" bash -c "test \"\$(diff <(git -C '$P' show '$PP_BETA_ETIQUETTE:index.html') <(git -C '$P' show HEAD:beta/index.html) | grep -c '^<')\" = 0 && test \"\$(diff <(git -C '$P' show '$PP_BETA_ETIQUETTE:index.html') <(git -C '$P' show HEAD:beta/index.html) | grep -c '^>')\" = 2 && git -C '$P' show HEAD:beta/index.html | grep -B1 -x '</head>' | head -1 | grep -q 'css/beta-bandeau.css?v=' && git -C '$P' show HEAD:beta/index.html | grep -B1 -x '</body>' | head -1 | grep -q 'js/beta-bandeau.js?v='"
vrai "le bandeau pose ses deux fichiers dans beta/, ceux de outils/depot-propre/beta/" bash -c "cmp -s '$T/dev/outils/depot-propre/beta/beta-bandeau.js' '$P/beta/js/beta-bandeau.js' && cmp -s '$T/dev/outils/depot-propre/beta/beta-bandeau.css' '$P/beta/css/beta-bandeau.css'"
vrai "... et le bouton du bandeau ouvre une page qui existe dans le dépôt public (../nouveautes.html depuis beta/)" bash -c "grep -q \"const NEWS_PAGE = '../nouveautes.html'\" '$P/beta/js/beta-bandeau.js' && test -s '$P/nouveautes.html'"

echo "publier.sh : garde contre l'écrasement"
(cd "$T/dev" && sed -i 's/beta\.1/beta.2/' js/version.js && G commit -qam "version" && git push -q origin main)
git -C "$P" push -q origin main v1.0.0-beta.1
echo '// reçu côté public' >> "$P/js/main.js"; echo 'retouchée côté public' >> "$P/screenshots/02-lecture-document-rempli.png"; G -C "$P" commit -qam "contribution"; git -C "$P" push -q origin main
SORTIE="$(publier --version 1.0.0-beta.2 --sortie "$T/sortie2")"
attend "refuse d'écraser un changement reçu côté public" "a reçu des changements depuis v1.0.0-beta.1" "$SORTIE"
attend "nomme le fichier concerné" "js/main.js" "$SORTIE"
attend "nomme aussi la capture retouchée côté public" "screenshots/02-lecture-document-rempli.png" "$SORTIE"
SORTIE="$(publier --version 1.0.0-beta.1 --sortie "$T/sortie3")"
attend "refuse une étiquette déjà prise" "existe déjà" "$SORTIE"
SORTIE="$(env PP_DATE=2026-10-04 bash "$T/dev/outils/depot-propre/publier.sh" --propre "$P" --version 1.0.0-beta.2 --sortie "$T/sortie4" --ecraser 2>&1)"
attend "--ecraser passe, mais prévient" "vont être remplacés" "$SORTIE"
attend "sans identité, il s'arrête" "PP_AUTEUR_NOM" "$SORTIE"
vrai "et remet le clone public à son état d'origine" test -z "$(git -C "$P" status --porcelain)"
SORTIE="$(env PP_DATE=2026-10-04 PP_AUTEUR_NOM=Essai PP_AUTEUR_EMAIL=essai@gmail.com bash "$T/dev/outils/depot-propre/publier.sh" --propre "$P" --version 1.0.0-beta.2 --sortie "$T/sortie4b" --ecraser 2>&1)"
attend "une adresse personnelle est refusée (seule l'adresse noreply de GitHub signe)" "noreply" "$SORTIE"
vrai "et rien n'est committé : le clone public est à son état d'origine" test -z "$(git -C "$P" status --porcelain)"
vrai "... ni étiqueté" test -z "$(git -C "$P" tag --list 'v1.0.0-beta.2')"
SORTIE="$(env PP_DATE=2026-10-04 PP_AUTEUR_NOM=Essai PP_AUTEUR_EMAIL=44994092+autre-compte@users.noreply.github.com bash "$T/dev/outils/depot-propre/publier.sh" --propre "$P" --version 1.0.0-beta.2 --sortie "$T/sortie4c" --ecraser 2>&1)"
attend "l'adresse noreply d'un autre compte est refusée aussi" "ni celle d'un autre compte" "$SORTIE"
vrai "... et le clone public est toujours à son état d'origine" test -z "$(git -C "$P" status --porcelain)"
PUBLIER_ENV+=(PP_DATE=2026-11-01)
SORTIE="$(publier --version 1.0.0-beta.2 --sortie "$T/sortie5" --ecraser)"
attend "--ecraser avec identité publie" "étiquette v1.0.0-beta.2 prêts" "$SORTIE"
vrai "le premier du mois s'écrit « 1er », en français et en anglais" bash -c "grep -q '1er novembre 2026' '$P/README.md' && grep -q 'November 1, 2026' '$P/README.md'"
vrai "la version est celle de js/version.js" grep -q "1.0.0-beta.2" "$P/README.md"

echo "controles.mjs : chaque défaut est vu"
C="$ICI/controles.mjs"
MUTER_OPTS=""   # options de controles.mjs en plus (--beta-figee pour les essais de beta/)
muter() { # description, motif attendu, commande de mutation (dans $T/mut)
  rm -rf "$T/mut"; cp -a "$P" "$T/mut"; rm -rf "$T/mut/.git"
  (cd "$T/mut" && eval "$3")
  attend "$1" "$2" "$(node "$C" "$T/mut" --version 1.0.0-beta.2 $MUTER_OPTS 2>&1)"
}
vrai "l'arbre publié passe sans erreur" bash -c "node '$C' '$P' --version 1.0.0-beta.2 | grep -q ' 0 erreur'"
muter "la politique de sécurité manquante" "aucune politique de sécurité" "sed -i '/Content-Security-Policy/d' index.html"
muter "un script en ligne modifié" "sans empreinte" "sed -i 's/window.x=1;/window.x=2;/' index.html"
muter "un lien de session" "lien ou une trace de session" "echo 'https://claude.ai/code/session_0123456789abcdef' >> README.md"
muter "le compte personnel" "compte personnel" "echo 'lombre33' >> NOTICE"
muter "un gabarit resté en place" "gabarit" "echo '{{VERSION}}' >> SECURITY.md"
muter "un lien cassé" "lien(s) cassé(s)" "sed -i 's/(CONTRIBUTING.md)/(CONTRIB.md)/' README.md"
muter "une ancre cassée" "ancre absente" "sed -i 's/(#limites-connues)/(#limites)/' README.md"
muter "un secret" "secret" "echo 'ghp_abcdefghijklmnopqrstuvwxyz0123' >> js/main.js"
muter "un dossier de développement" "présente à la racine" "mkdir dev-tests; echo x > dev-tests/a"
muter "la liste des bibliothèques (package.json) à la racine du dépôt public" "présente à la racine : package.json" "echo '{}' > package.json"
muter "le catalogue des bibliothèques (bibliotheques/) à la racine du dépôt public" "présente à la racine : bibliotheques" "mkdir bibliotheques; echo x > bibliotheques/a"
muter "un fichier cité par la page, absent" "cite des fichiers absents" "rm img/logo.jpg"
# nouveautes.html (consigne 070 de GFS) : la page que le bouton du bandeau de la bêta ouvre. Elle n'est pas le widget : sa politique de sécurité ne laisse passer que ses propres fichiers, sans script en ligne ni connexion.
muter "la page des nouveautés absente" "fichier absent : nouveautes.html" "rm nouveautes.html"
muter "la page des nouveautés sans politique de sécurité" "nouveautes.html : aucune politique de sécurité du contenu" "sed -i '/Content-Security-Policy/d' nouveautes.html"
muter "la page des nouveautés qui autorise d'autres scripts que les siens" "nouveautes.html : script-src doit être 'self' seul" "sed -i \"s/script-src 'self'/script-src 'self' https:/\" nouveautes.html"
muter "la page des nouveautés qui autorise une connexion" "nouveautes.html : connect-src doit être 'none'" "sed -i \"s/connect-src 'none'/connect-src https:/\" nouveautes.html"
muter "la page des nouveautés dont la politique n'est plus fermée par défaut" "nouveautes.html : default-src doit être 'none'" "sed -i \"s/default-src 'none'; //\" nouveautes.html"
muter "la page des nouveautés avec un script en ligne" "nouveautes.html : un script en ligne" "sed -i 's#</body>#<script>window.y=1;</script></body>#' nouveautes.html"
muter "la page des nouveautés qui cite un fichier absent" "nouveautes.html cite des fichiers absents de l'arbre : js/absent.js" "sed -i 's#</body>#<script src=\"js/absent.js\"></script></body>#' nouveautes.html"
vrai "... et la page des nouveautés du faux dépôt, telle qu'elle est, ne fait rien dire à controles.mjs" bash -c "node '$C' '$P' --version 1.0.0-beta.2 | grep -c 'nouveautes.html' | grep -qx 0"
muter "un dossier de la galerie dont le nom commence par « _ » (GitHub Pages ne le sert pas)" "commence par « _ » ou « . »" "mkdir -p templates-gallery/_tables; echo x > templates-gallery/_tables/gestion.json"
muter "un fichier caché dans js/ (GitHub Pages ne le sert pas)" "commence par « _ » ou « . »" "echo x > js/.cache"
muter "la carte du code absente" "fichier absent : CARTE_DU_CODE.md" "rm CARTE_DU_CODE.md"
muter "le .nojekyll manquant (GitHub Pages passerait les .md dans Jekyll)" "fichier absent : .nojekyll" "rm .nojekyll"
muter "une carte du code qui cite un fichier disparu" "CARTE_DU_CODE.md cite des fichiers absents" "rm js/dom.js"
muter "un fichier de js/ sans ligne dans la carte du code" "sans ligne dans CARTE_DU_CODE.md" "echo x > js/nouveau.js"
muter "un lien cassé dans la carte du code" "CARTE_DU_CODE.md → SECU.md" "sed -i 's/(SECURITY.md)/(SECU.md)/' CARTE_DU_CODE.md"
muter "la note de version absente" "fichier absent : PATCH_NOTES.md" "rm PATCH_NOTES.md"
muter "un lien cassé dans la note de version" "PATCH_NOTES.md → JOURNAL.md" "sed -i 's/(CHANGELOG.md)/(JOURNAL.md)/' PATCH_NOTES.md"
muter "une ancre cassée dans la table des matières anglaise de la note de version" "PATCH_NOTES.md → #correctifs" "sed -i 's/(#fixes)/(#correctifs)/' PATCH_NOTES.md"
muter "un retour vers la partie française de la note de version qui perd son double tiret (l'ancre de « Publipostage+ : notes de version »)" "PATCH_NOTES.md → #publipostage-notes-de-version" "sed -i 's/(#publipostage--notes-de-version)/(#publipostage-notes-de-version)/' PATCH_NOTES.md"
# Les nombres que la carte annonce se lisent dans la carte (elle les change à chaque envoi), pas dans ce script.
NJS="$(grep -oEm1 '[0-9]+ fichiers dans `js/`' "$P/CARTE_DU_CODE.md" | grep -oE '^[0-9]+')"
LJS="$(grep -oEm1 '\([0-9][0-9 ]* lignes :' "$P/CARTE_DU_CODE.md" | grep -oE '[0-9][0-9 ]*[0-9]')"
LTREE="$(cat "$P"/js/*.js | wc -l)"
muter "un nombre de fichiers de js/ périmé dans la carte du code" "annonce $((NJS - 1)) et $NJS fichiers dans js/" "sed -i 's/$NJS fichiers dans/$((NJS - 1)) fichiers dans/' CARTE_DU_CODE.md"
NFAM="$(grep -oEm1 '\([0-9]+ fichiers,' "$P/CARTE_DU_CODE.md" | grep -oE '[0-9]+')"
muter "un nombre de fichiers par famille périmé dans la carte du code" "annonce $((NFAM - 1)) fichiers, son tableau en cite $NFAM" "sed -i 's/($NFAM fichiers,/($((NFAM - 1)) fichiers,/' CARTE_DU_CODE.md"
# Les lignes d'une famille se comparent à celles de ses fichiers (ici, des fichiers d'une ligne : tout nombre annoncé au-delà de la marge est signalé).
LFAM="$(grep -oEm1 '^### .*\([0-9]+ fichiers, [0-9][0-9 ]* lignes\)' "$P/CARTE_DU_CODE.md" | grep -oE '[0-9][0-9 ]* lignes\)$' | grep -oE '^[0-9][0-9 ]*[0-9]')"
muter "un nombre de lignes par famille périmé dans la carte du code" "annonce 900 lignes, ses fichiers en comptent" "sed -i 's/, $LFAM lignes)/, 900 lignes)/' CARTE_DU_CODE.md"
# Une famille compte les fichiers de la première colonne de son tableau : un fichier que le rôle d'une ligne cite en passant n'est pas à elle. Les nombres de la carte ne sont recomptés qu'à l'envoi
# (numeros-carte.mjs) : entre deux envois, certaines familles annoncent déjà un compte périmé, et c'est leur avertissement qui compte avant comme après - la mutation ne doit pas en ajouter un.
vrai "... et un fichier que le rôle d'une ligne cite sans qu'il soit à elle ne s'ajoute pas à sa famille" bash -c "rm -rf '$T/mut'; cp -a '$P' '$T/mut'; rm -rf '$T/mut/.git'; AVANT=\$(node '$C' '$T/mut' --version 1.0.0-beta.2 | grep -c 'son tableau en cite'); sed -i '/^| \`js\/grist-api.js\` | /s/ |\$/ Voir \`js\/dom.js\`. |/' '$T/mut/CARTE_DU_CODE.md'; grep -q 'Voir .js/dom.js' '$T/mut/CARTE_DU_CODE.md' && test \"\$(node '$C' '$T/mut' --version 1.0.0-beta.2 | grep -c 'son tableau en cite')\" = \"\$AVANT\""
attend "les lignes que la carte du code annonce se comparent à l'arbre (ici $LTREE lignes de js/)" "annonce $LJS lignes dans js/, l'arbre en compte $LTREE" "$(node "$C" "$P" --version 1.0.0-beta.2 2>&1)"
vrai "... et passent quand l'arbre en compte à peu près autant" bash -c "rm -rf '$T/mut'; cp -a '$P' '$T/mut'; rm -rf '$T/mut/.git'; seq 1 $((${LJS// /} - LTREE)) > '$T/mut/js/gros.js'; ! node '$C' '$T/mut' --version 1.0.0-beta.2 | grep -q 'annonce $LJS lignes'"
# numeros-carte.mjs recompte les nombres de la carte d'après le dépôt de développement ; ici, un arbre dont les fichiers n'ont qu'une ligne.
echo "numeros-carte.mjs : les nombres de la carte du code"
rm -rf "$T/nb"; mkdir -p "$T/nb/outils/depot-propre/public"; cp -a "$T/dev/js" "$T/dev/css" "$T/dev/extensions" "$T/dev/index.html" "$T/nb/"; cp "$ICI/public/CARTE_DU_CODE.md" "$T/nb/outils/depot-propre/public/"
CARTE_NB="$T/nb/outils/depot-propre/public/CARTE_DU_CODE.md"
FAM1="$(grep -m1 '^### .*([0-9]* fichiers, ' "$ICI/public/CARTE_DU_CODE.md")"
SORTIE_NB="$(node "$ICI/numeros-carte.mjs" "$T/nb")"
attend "dit ce qui changerait, famille par famille" "famille : « $FAM1 »" "$SORTIE_NB"
attend "... et le volume" "volume (FR)" "$SORTIE_NB"
vrai "... sans rien écrire sans --fix" cmp -s "$ICI/public/CARTE_DU_CODE.md" "$CARTE_NB"
attend "... et réécrit la carte avec --fix" "réécrit :" "$(node "$ICI/numeros-carte.mjs" "$T/nb" --fix)"
attend "... puis n'a plus rien à changer" "aucun nombre à changer" "$(node "$ICI/numeros-carte.mjs" "$T/nb")"
vrai "... et la carte réécrite ne fait plus rien dire à controles.mjs sur ses nombres" bash -c "rm -rf '$T/mut'; cp -a '$P' '$T/mut'; rm -rf '$T/mut/.git'; sed -e 's/{{DATE_FR}}/4 octobre 2026/g' -e 's/{{DATE_EN}}/October 4, 2026/g' '$CARTE_NB' > '$T/mut/CARTE_DU_CODE.md'; ! node '$C' '$T/mut' --version 1.0.0-beta.2 | grep -qE 'son tableau en cite|ses fichiers en comptent|fichiers dans js/|lignes dans js/'"
mkdir -p "$T/nb/extensions/nouvelle"; echo x > "$T/nb/extensions/nouvelle/a.js"
attend "... et refuse de recompter le volume quand un dossier d'extensions s'ajoute (la phrase nomme les dossiers un à un)" "le volume n'est pas recompté" "$(node "$ICI/numeros-carte.mjs" "$T/nb")"
muter "une clé du navigateur que le contrôle ne connaît pas" "sans que controles.mjs le connaisse" "echo \"localStorage.setItem('pp_nouveau', 1);\" >> js/main.js"
# Les mots à retirer se cherchent à travers les retours à la ligne (\s+) : le README se recoupe en lignes à chaque relecture.
muter "un README français qui ne nomme plus le zoom gardé" "README.md (français) ne nomme pas ce que garde « pp_page_zoom »" "echo \"localStorage.setItem('pp_page_zoom', 1);\" >> js/main.js; perl -0pi -e 's/niveau\s+de\s+zoom/réglage/g' README.md"
muter "un README anglais qui ne nomme plus le zoom gardé" "README.md (anglais) ne nomme pas ce que garde « pp_page_zoom »" "echo \"localStorage.setItem('pp_page_zoom', 1);\" >> js/main.js; perl -0pi -e 's/zoom\s+level/setting/g' README.md"
vrai "une clé du navigateur nommée dans le README passe" bash -c "rm -rf '$T/mut'; cp -a '$P' '$T/mut'; rm -rf '$T/mut/.git'; echo \"localStorage.setItem('pp_page_zoom', 1);\" >> '$T/mut/js/main.js'; node '$C' '$T/mut' --version 1.0.0-beta.2 | grep -q ' 0 erreur'"
muter "un .gitmodules resté dans l'arbre public (il n'a pas de sous-module)" "n'a pas de sous-module" "printf '[submodule \"kit\"]\n' > .gitmodules"
muter "un code qui cite le kit alors qu'un de ses fichiers manque" "cite le kit, mais kit/js/ambiance-pose.js est absent" "echo \"import('../kit/js/ambiance-pose.js');\" >> js/main.js; rm kit/js/ambiance-pose.js"
vrai "un code qui cite le kit, ses fichiers présents, passe" bash -c "rm -rf '$T/mut'; cp -a '$P' '$T/mut'; rm -rf '$T/mut/.git'; echo \"import('../kit/js/ambiance-pose.js');\" >> '$T/mut/js/main.js'; node '$C' '$T/mut' --version 1.0.0-beta.2 | grep -q ' 0 erreur'"
# La page qui cite la copie de l'éditeur (sa carte « gfs-carte-copie », consigne 066 de GFS) : le module cité, les licences et le manifeste doivent être dans l'arbre, sinon la case « Éditeur hors ligne » rendrait une page sans éditeur.
# (La carte est un script en ligne : la politique de sécurité de la page en porte l'empreinte, que le petit script pose avec elle.)
cat > "$T/poser-carte-copie.mjs" <<'JS'
import fs from 'node:fs';
import crypto from 'node:crypto';
const json = JSON.stringify({ imports: { editeur: './vendor/editeur/prosemirror.js?v=1' } });
let html = fs.readFileSync('index.html', 'utf8');
const hash = crypto.createHash('sha256').update(json).digest('base64');
html = html.replace('</head>', `<script type="application/json" id="gfs-carte-copie">${json}</script></head>`).replace('; object-src', ` 'sha256-${hash}'; object-src`);
fs.writeFileSync('index.html', html);
JS
CARTE_COPIE="node '$T/poser-carte-copie.mjs'"
muter "une page qui cite la copie de l'éditeur alors qu'un de ses modules manque" "cite vendor/editeur/prosemirror.js (la copie de l'éditeur), mais il est absent de l'arbre" "$CARTE_COPIE; rm vendor/editeur/prosemirror.js"
muter "une page qui cite la copie de l'éditeur alors que ses licences manquent" "vendor/editeur/LICENCES.txt est absent de l'arbre" "$CARTE_COPIE; rm vendor/editeur/LICENCES.txt"
muter "une page qui cite la copie de l'éditeur alors que son manifeste manque" "vendor/editeur/COPIE.json est absent de l'arbre" "$CARTE_COPIE; rm vendor/editeur/COPIE.json"
vrai "une page qui cite la copie de l'éditeur, ses fichiers présents, passe" bash -c "rm -rf '$T/mut'; cp -a '$P' '$T/mut'; rm -rf '$T/mut/.git'; (cd '$T/mut' && $CARTE_COPIE); node '$C' '$T/mut' --version 1.0.0-beta.2 | grep -q ' 0 erreur'"
muter "une licence qui n'est pas la GPL" "GNU GPL version 3" "echo 'MIT' > LICENSE"
muter "un CHANGELOG sans la version" "aucune section" "sed -i 's/^## \[1.0.0-beta.2\]/## [9.9.9]/' CHANGELOG.md"
muter "js/version.js absent (et la page qui le chargeait retirée)" "js/version.js absent" "rm js/version.js; sed -i 's#<script src=\"js/version.js\"></script>##' index.html"
muter "une page qui ne charge pas js/version.js" "ne charge pas js/version.js" "sed -i 's#<script src=\"js/version.js\"></script>##' index.html"
muter "js/version.js qui annonce une autre version" "annonce 1.0.0-beta.1" "echo \"const PP_VERSION = '1.0.0-beta.1';\" > js/version.js"

echo "controles.mjs : la bêta figée (beta/)"
vrai "beta/ est une entrée connue de la racine : pas d'avertissement « entrée inconnue »" bash -c "! node '$C' '$P' --version 1.0.0-beta.2 | grep -q 'entrée inconnue'"
vrai "l'arbre publié passe sans erreur, bêta figée comprise (--beta-figee)" bash -c "node '$C' '$P' --version 1.0.0-beta.2 --beta-figee | grep -q ' 0 erreur'"
vrai "sans --beta-figee, un arbre sans beta/ passe (celui que codeHygiene assemble n'en a pas)" bash -c "rm -rf '$T/mut'; cp -a '$P' '$T/mut'; rm -rf '$T/mut/.git' '$T/mut/beta'; node '$C' '$T/mut' --version 1.0.0-beta.2 | grep -q ' 0 erreur'"
MUTER_OPTS=--beta-figee
muter "beta/ absente" "la copie figée de la bêta est absente" "rm -rf beta"
muter "beta/ copiée de la version qui part (js/version.js d'une autre version)" "beta/js/version.js annonce 1.0.0-beta.2" "echo \"const PP_VERSION = '1.0.0-beta.2';\" > beta/js/version.js"
muter "beta/ sans js/version.js" "beta/js/version.js annonce aucune version" "rm beta/js/version.js"
muter "une page de beta/ qui cite un fichier absent de beta/" "beta/index.html cite des fichiers absents de beta/ : css/style.css" "rm beta/css/style.css"
# Le bandeau « version bêta » (consigne 070 de GFS) : beta/ le porte tel que outils/depot-propre/beta/ l'écrit ; un bandeau absent, retouché ou mal posé se voit.
muter "un bandeau dont le script manque dans beta/" "beta/js/beta-bandeau.js : le bandeau de la bêta est absent" "rm beta/js/beta-bandeau.js"
muter "un bandeau dont la feuille de style manque dans beta/" "beta/css/beta-bandeau.css : le bandeau de la bêta est absent" "rm beta/css/beta-bandeau.css"
muter "un script du bandeau retouché à la main dans beta/" "beta/js/beta-bandeau.js n'est pas celui de outils/depot-propre/beta/" "echo '/* retouche */' >> beta/js/beta-bandeau.js"
muter "une feuille du bandeau retouchée à la main dans beta/" "beta/css/beta-bandeau.css n'est pas celui de outils/depot-propre/beta/" "echo '/* retouche */' >> beta/css/beta-bandeau.css"
muter "un bandeau dont la ligne du script a disparu de beta/index.html" "le script du bandeau .* devrait y être une fois" "sed -i '/js\/beta-bandeau.js/d' beta/index.html"
muter "un bandeau dont la ligne de la feuille a disparu de beta/index.html" "la feuille du bandeau .* devrait y être une fois" "sed -i '/css\/beta-bandeau.css/d' beta/index.html"
muter "un bandeau dont le script est cité à la version d'un autre fichier (?v= périmé)" "le script du bandeau .* devrait y être une fois, à la version de son fichier" "sed -i 's/beta-bandeau.js?v=[0-9a-f]\{8\}/beta-bandeau.js?v=00000000/' beta/index.html"
muter "un bandeau dont la feuille est citée à la version d'un autre fichier (?v= périmé)" "la feuille du bandeau .* devrait y être une fois, à la version de son fichier" "sed -i 's/beta-bandeau.css?v=[0-9a-f]\{8\}/beta-bandeau.css?v=00000000/' beta/index.html"
muter "un bandeau dont la feuille est après </head>" "la feuille du bandeau doit être dans <head>" "perl -0pi -e 's#(<link rel=\"stylesheet\" href=\"css/beta-bandeau\.css\?v=[0-9a-f]{8}\">\n)(</head>\n)#\$2\$1#' beta/index.html"
muter "un bandeau dont le script n'est plus le dernier de la page (il doit se poser après main.js)" "le script du bandeau doit être le dernier script de la page" "perl -0pi -e 's#(<script src=\"js/version\.js\"></script>\n)(<script src=\"js/beta-bandeau\.js\?v=[0-9a-f]{8}\"></script>\n)#\$2\$1#' beta/index.html"
muter "un bandeau dont le bouton ouvre une page absente de l'arbre" "cette page n'est pas dans l'arbre" "rm nouveautes.html"
MUTER_OPTS=""
renvois() { node "$C" "$1" --version 1.0.0-beta.2 | grep 'un renvoi à un dossier' | grep -oE ' : [0-9]+ ligne' | grep -oE '[0-9]+' || echo 0; }
rm -rf "$T/mut"; cp -a "$P" "$T/mut"; rm -rf "$T/mut/.git"; echo '/* voir planning et dev-tests */' >> "$T/mut/beta/css/style.css"
vrai "les renvois à un dossier non publié que cite le code de la bêta figée ne se comptent pas ($(renvois "$P") ligne(s) ailleurs)" test "$(renvois "$P")" = "$(renvois "$T/mut")"

echo "publier.sh : la bêta figée (beta/) du dépôt public"
# Chaque essai part d'un dépôt public neuf (celui du début, bêta figée comprise), y fait une retouche poussée, puis lance la publication : elle doit s'arrêter.
beta_refus() { # description, motif attendu, retouche du clone public, [variable d'environnement en plus]
  rm -rf "$T/web2" "$T/clone2"; mkdir -p "$T/web2/github.com/grist-factory"
  git clone -q --bare "$T/propre-src" "$T/web2/github.com/grist-factory/Publipostage-Plus.git"
  git clone -q "$T/web2/github.com/grist-factory/Publipostage-Plus.git" "$T/clone2"
  (cd "$T/clone2" && eval "$3" && G add -A && G commit -qm "essai" && git push -q origin main)
  attend "$1" "$2" "$(env "${PUBLIER_ENV[@]}" ${4:-} bash "$T/dev/outils/depot-propre/publier.sh" --propre "$T/clone2" --version 1.0.0-beta.9 --sortie "$T/sortie-beta" 2>&1)"
}
# Une « bêta » dont l'étiquette porte la copie de la version qui part : beta/ lui est identique, c'est controles.mjs (--beta-figee) qui refuse, ce qui prouve que publier.sh le lui demande.
copie_de_la_version() { echo "const PP_VERSION = '1.0.0';" > beta/js/version.js && git add -A && G tag copie-de-la-version "$(echo x | G commit-tree "$(git rev-parse "$(git write-tree):beta")")"; }
beta_refus "refuse un clone public sans beta/" "beta/ est absente du clone public" "git rm -rq beta"
beta_refus "refuse une beta/ retouchée à la main (la bêta figée ne se corrige pas) et nomme le dossier touché" "  beta/css" "echo '/* correctif */' >> beta/css/style.css"
beta_refus "refuse une beta/ à laquelle il manque un dossier de la bêta" "  beta/img" "git rm -rq beta/img"
beta_refus "refuse une beta/ qui porte une entrée que la bêta n'avait pas" "beta/ porte des entrées que la bêta n'avait pas" "echo x > beta/NOTES.md"
beta_refus "refuse quand l'étiquette de la bêta est introuvable" "l'étiquette etiquette-inconnue de la bêta est absente" "echo x >> README.md" "PP_BETA_ETIQUETTE=etiquette-inconnue"
beta_refus "passe la copie de la version qui part à controles.mjs, qui refuse une beta/ qui n'est pas la 1.0.0-beta.1" "beta/js/version.js annonce 1.0.0, la bêta figée est la 1.0.0-beta.1" "copie_de_la_version" "PP_BETA_ETIQUETTE=copie-de-la-version"

echo "beta-bandeau.mjs : le bandeau de la bêta figée (consigne 070 de GFS)"
BB="$ICI/beta-bandeau.mjs"
# Un clone public neuf (celui du début : sa bêta figée est l'étiquette, sans bandeau, comme celle du vrai dépôt public avant la consigne 070), sur lequel chaque essai pose, vérifie ou abîme beta/.
bandeau_clone() { rm -rf "$T/clone3"; git clone -q "$T/propre-src" "$T/clone3"; }
bandeau_clone
vrai "--ecarts accepte beta/ telle que l'étiquette la porte, sans bandeau" node "$BB" --ecarts "$T/clone3"
SORTIE="$(node "$BB" --verifier "$T/clone3" 2>&1)"; STATUT=$?
attend "--verifier refuse une beta/ sans bandeau, et nomme ses deux fichiers" "beta/js/beta-bandeau.js" "$SORTIE"
attend "... et la ligne de sa page" "beta/index.html" "$SORTIE"
vrai "... avec un code de sortie 1" test "$STATUT" = 1
node "$BB" --poser "$T/clone3" >/dev/null
vrai "--poser écrit beta/ dans le dossier de travail seulement : rien n'est ajouté à l'index, rien n'est committé" bash -c "test -z \"\$(git -C '$T/clone3' diff --cached --name-only)\" && test \"\$(git -C '$T/clone3' rev-parse HEAD)\" = \"\$(git -C '$T/propre-src' rev-parse HEAD)\" && git -C '$T/clone3' status --porcelain | grep -q 'beta/'"
vrai "... et ce qu'il écrit passe --verifier --arbre" node "$BB" --verifier "$T/clone3" --arbre
APRES_1="$(cd "$T/clone3" && find beta -type f | sort | xargs cat | openssl dgst -sha256)"
node "$BB" --poser "$T/clone3" >/dev/null
vrai "--poser une seconde fois n'ajoute et ne retire rien (même résultat)" test "$APRES_1" = "$(cd "$T/clone3" && find beta -type f | sort | xargs cat | openssl dgst -sha256)"
(cd "$T/clone3" && G add -A && G commit -qm "bandeau")
vrai "une fois committée, beta/ passe --verifier" node "$BB" --verifier "$T/clone3"
vrai "... et --ecarts (avec ou sans bandeau)" node "$BB" --ecarts "$T/clone3"
# Un bandeau d'une autre version (un correctif du bandeau posé depuis) : publier.sh l'accepte, il le recompose ; --verifier, lui, dit qu'il n'est plus le bon.
(cd "$T/clone3" && echo '/* bandeau d une autre version */' >> beta/js/beta-bandeau.js && sed -i 's/beta-bandeau.js?v=[0-9a-f]\{8\}/beta-bandeau.js?v=00000000/' beta/index.html && G commit -qam "bandeau d'une autre version")
vrai "--ecarts accepte un bandeau d'une autre version : publier.sh le recompose" node "$BB" --ecarts "$T/clone3"
attend "--verifier dit que ce bandeau n'est plus le bon" "beta/js/beta-bandeau.js" "$(node "$BB" --verifier "$T/clone3" 2>&1)"
node "$BB" --poser "$T/clone3" >/dev/null
vrai "--poser le remplace par le bandeau d'aujourd'hui" node "$BB" --verifier "$T/clone3" --arbre
# La bêta figée ne se corrige pas : un fichier de l'étiquette retouché, un fichier de plus, un fichier de moins, la page retouchée ailleurs que par les deux lignes du bandeau.
retouche_refusee() { # description, motif attendu, retouche de beta/ dans le clone
  bandeau_clone; node "$BB" --poser "$T/clone3" >/dev/null
  (cd "$T/clone3" && eval "$3" && G add -A && G commit -qm "retouche")
  local ecarts verifier
  ecarts="$(node "$BB" --ecarts "$T/clone3" 2>&1)"; local s1=$?
  verifier="$(node "$BB" --verifier "$T/clone3" 2>&1)"; local s2=$?
  attend "$1 : --ecarts le refuse" "$2" "$ecarts"
  vrai "... avec un code de sortie 1, pour --ecarts comme pour --verifier" test "$s1" = 1 -a "$s2" = 1
}
retouche_refusee "une feuille de style de la bêta retouchée" "beta/css" "echo '/* correctif */' >> beta/css/style.css"
retouche_refusee "un fichier de la bêta retiré" "beta/img" "git rm -rq beta/img"
retouche_refusee "un fichier que la bêta n'avait pas" "beta/ porte des entrées que la bêta n'avait pas" "echo x > beta/NOTES.md"
retouche_refusee "la page de la bêta retouchée ailleurs que par les lignes du bandeau" "beta/index.html" "sed -i 's#<title>bêta</title>#<title>bêta corrigée</title>#' beta/index.html"
# Où poser les deux lignes : une page de bêta sans ligne </body> (ou en double) n'est pas modifiée au hasard, l'outil s'arrête et dit pourquoi.
bandeau_clone
(cd "$T/clone3" && sed -i '/^<\/body>$/d' beta/index.html && G commit -qam "sans </body>" && G tag sans-body "$(echo x | G commit-tree HEAD:beta)")
SORTIE="$(node "$BB" --poser "$T/clone3" --etiquette sans-body 2>&1)"; STATUT=$?
attend "--poser s'arrête devant une page sans ligne </body>, et le dit" "exactement une ligne </body>" "$SORTIE"
vrai "... avec un code de sortie 1" test "$STATUT" = 1
vrai "... et beta/ du clone n'a pas été touchée (rien d'écrit à moitié)" test -z "$(git -C "$T/clone3" status --porcelain)"
vrai "... et --poser sans clone ni option affiche l'usage (code 2)" bash -c "node '$BB' --poser 2>/dev/null; test \$? = 2"

echo "publier.sh : le bandeau suit le dépôt de développement"
# Un correctif du bandeau (outils/depot-propre/beta/ du dépôt de développement) part à la publication suivante, sans rien toucher d'autre dans beta/.
git -C "$P" push -q origin main v1.0.0-beta.2
(cd "$T/dev" && sed -i 's/beta\.2/beta.3/' js/version.js && echo '/* correctif du bandeau */' >> outils/depot-propre/beta/beta-bandeau.css && G commit -qam "version, bandeau corrigé" && git push -q origin main)
SORTIE="$(publier --version 1.0.0-beta.3 --sortie "$T/sortie6")"
attend "publie avec le bandeau corrigé" "étiquette v1.0.0-beta.3 prêts" "$SORTIE"
vrai "beta/ porte le bandeau corrigé (la feuille de style du dépôt de développement, octet pour octet)" cmp -s "$T/dev/outils/depot-propre/beta/beta-bandeau.css" "$P/beta/css/beta-bandeau.css"
vrai "... avec la version de sa feuille mise à jour dans la page (les huit premiers chiffres de l'empreinte du fichier)" grep -qF "css/beta-bandeau.css?v=$(openssl dgst -sha256 -r "$T/dev/outils/depot-propre/beta/beta-bandeau.css" | cut -c1-8)\"" "$P/beta/index.html"
vrai "... et beta/ est le bandeau du dépôt de développement + l'étiquette de la bêta, rien d'autre" node "$T/dev/outils/depot-propre/beta-bandeau.mjs" --verifier "$P"
vrai "... le reste de beta/ n'a pas bougé (js/version.js est celui de l'étiquette)" test "$(git -C "$P" rev-parse HEAD:beta/js/version.js)" = "$(git -C "$P" rev-parse "$PP_BETA_ETIQUETTE:js/version.js")"

echo
echo "$OK réussi(s), $KO échec(s)."
[ "$KO" -eq 0 ]
