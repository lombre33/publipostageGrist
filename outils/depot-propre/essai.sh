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

PUBLIER_ENV=(PP_DATE=2026-10-04 PP_AUTEUR_NOM=Essai PP_AUTEUR_EMAIL=essai@example.invalid)
publier() { env "${PUBLIER_ENV[@]}" bash "$T/dev/outils/depot-propre/publier.sh" --propre "$T/propre" "$@" 2>&1; }

# --- Un faux dépôt de développement, avec les vrais outils et les vrais documents publics ----------------------------------------------------
HASH="$(printf '%s' 'window.x=1;' | openssl dgst -sha256 -binary | openssl base64 -A)"
git init -q --bare "$T/dev-origin.git"
git init -q -b main "$T/dev"
(
  cd "$T/dev"
  mkdir -p css js img templates-gallery dev-tests planning outils/depot-propre/public
  cat > index.html <<HTML
<!doctype html><html><head><meta charset="utf-8"><title>essai</title>
<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'sha256-$HASH'; object-src 'none'">
<link rel="stylesheet" href="css/style.css"><script>window.x=1;</script><script src="js/version.js"></script><script src="js/main.js"></script>
</head><body><img src="img/logo.jpg"></body></html>
HTML
  echo 'body { margin: 0; }' > css/style.css
  echo "const PP_VERSION = '1.0.0-beta.1';" > js/version.js
  echo 'window.main = function () { return 1; };' > js/main.js
  echo 'jpg' > img/logo.jpg
  echo '[]' > templates-gallery/manifest.json
  printf 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n' > LICENSE
  echo '# dev' > README.md; echo x > dev-tests/a.mjs; echo x > planning/a.md
  cp "$ICI/publier.sh" "$ICI/controles.mjs" outils/depot-propre/
  cp "$ICI"/public/* outils/depot-propre/public/
  G add -A; G commit -qm essai
  git remote add origin "$T/dev-origin.git"; git push -q origin main
)

# --- Un faux dépôt public, à l'adresse attendue --------------------------------------------------------------------------------------------
git init -q -b main "$T/propre-src"
(
  cd "$T/propre-src"
  mkdir -p screenshots; echo png > screenshots/edition-variables.png; echo png > screenshots/lecture-resolue.png
  echo '# alpha' > README.md; echo old > index.html
  G add -A; G commit -qm alpha
)
mkdir -p "$T/web/github.com/grist-factory"
git clone -q --bare "$T/propre-src" "$T/web/github.com/grist-factory/Publipostage-Plus.git"
git clone -q "$T/web/github.com/grist-factory/Publipostage-Plus.git" "$T/propre"
AVANT="$(git -C "$T/propre" rev-parse HEAD)"

echo "publier.sh : refus"
echo 'x' >> "$T/dev/README.md"
attend "refuse un dépôt de développement modifié" "modifications non committées" "$(publier)"
git -C "$T/dev" checkout -q -- README.md
mkdir -p "$T/dev/nouveau-dossier"; echo x > "$T/dev/nouveau-dossier/a"
(cd "$T/dev" && G add -A && G commit -qm "dossier inconnu" && git push -q origin main)
attend "refuse une entrée inconnue à la racine" "à classer dans PUBLIES ou EXCLUS" "$(publier)"
(cd "$T/dev" && G rm -rq nouveau-dossier && G commit -qm "retrait" && echo "// Antoine l'a demandé" >> js/main.js && G commit -qam "prénom" && git push -q origin main)
SORTIE="$(publier)"
attend "refuse quand les contrôles trouvent le prénom" "le prénom du développeur" "$SORTIE"
attend "ne committe rien quand les contrôles échouent" "rien n'est committé" "$SORTIE"
vrai "remet le clone public à son état d'origine" test "$(git -C "$T/propre" rev-parse HEAD)" = "$AVANT" -a -z "$(git -C "$T/propre" status --porcelain)"

echo "publier.sh : publication"
(cd "$T/dev" && sed -i '/Antoine/d' js/main.js && G commit -qam "prénom retiré" && git push -q origin main)
SORTIE="$(publier --sortie "$T/sortie1")"
attend "publie quand tout est en règle" "Commit .* et étiquette v1.0.0-beta.1 prêts" "$SORTIE"
P="$T/propre"
vrai "identité du commit" test "$(git -C "$P" log -1 --format='%an <%ae>')" = "Essai <essai@example.invalid>"
vrai "étiquette annotée v1.0.0-beta.1" test "$(git -C "$P" cat-file -t v1.0.0-beta.1)" = "tag"
vrai "un commit de plus sur l'historique existant" test "$(git -C "$P" rev-parse HEAD~1)" = "$AVANT"
vrai "le message ne porte aucune trace de session" test -z "$(git -C "$P" log -1 --format=%B | grep -i -E 'claude|session|co-authored')"
vrai "dev-tests, planning et outils ne partent pas" test -z "$(git -C "$P" ls-tree --name-only HEAD | grep -E '^(dev-tests|planning|outils)$')"
vrai "les documents publics sont là, README du dépôt de développement absent" test -f "$P/SECURITY.md" -a -f "$P/NOTICE" -a "$(head -1 "$P/README.md")" = "# Publipostage+ pour Grist"
vrai "screenshots/ (propre au dépôt public) est intact" test -f "$P/screenshots/edition-variables.png"
vrai "la date est écrite en toutes lettres" grep -q "4 octobre 2026" "$P/README.md"
vrai "la sauvegarde .bundle existe" test -s "$T/sortie1/publication-1.0.0-beta.1.bundle"
vrai "le clone public est propre" test -z "$(git -C "$P" status --porcelain)"

echo "publier.sh : garde contre l'écrasement"
(cd "$T/dev" && sed -i 's/beta\.1/beta.2/' js/version.js && G commit -qam "version" && git push -q origin main)
git -C "$P" push -q origin main v1.0.0-beta.1
echo '// reçu côté public' >> "$P/js/main.js"; G -C "$P" commit -qam "contribution"; git -C "$P" push -q origin main
SORTIE="$(publier --version 1.0.0-beta.2 --sortie "$T/sortie2")"
attend "refuse d'écraser un changement reçu côté public" "a reçu des changements depuis v1.0.0-beta.1" "$SORTIE"
attend "nomme le fichier concerné" "js/main.js" "$SORTIE"
SORTIE="$(publier --version 1.0.0-beta.1 --sortie "$T/sortie3")"
attend "refuse une étiquette déjà prise" "existe déjà" "$SORTIE"
SORTIE="$(env PP_DATE=2026-10-04 bash "$T/dev/outils/depot-propre/publier.sh" --propre "$P" --version 1.0.0-beta.2 --sortie "$T/sortie4" --ecraser 2>&1)"
attend "--ecraser passe, mais prévient" "vont être remplacés" "$SORTIE"
attend "sans identité, il s'arrête" "PP_AUTEUR_NOM" "$SORTIE"
vrai "et remet le clone public à son état d'origine" test -z "$(git -C "$P" status --porcelain)"
PUBLIER_ENV+=(PP_DATE=2026-11-01)
SORTIE="$(publier --version 1.0.0-beta.2 --sortie "$T/sortie5" --ecraser)"
attend "--ecraser avec identité publie" "étiquette v1.0.0-beta.2 prêts" "$SORTIE"
vrai "le premier du mois s'écrit « 1er », en français et en anglais" bash -c "grep -q '1er novembre 2026' '$P/README.md' && grep -q 'November 1, 2026' '$P/README.md'"
vrai "la version est celle de js/version.js" grep -q "1.0.0-beta.2" "$P/README.md"

echo "controles.mjs : chaque défaut est vu"
C="$ICI/controles.mjs"
muter() { # description, motif attendu, commande de mutation (dans $T/mut)
  rm -rf "$T/mut"; cp -a "$P" "$T/mut"; rm -rf "$T/mut/.git"
  (cd "$T/mut" && eval "$3")
  attend "$1" "$2" "$(node "$C" "$T/mut" --version 1.0.0-beta.2 2>&1)"
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
muter "un fichier cité par la page, absent" "cite des fichiers absents" "rm img/logo.jpg"
muter "une licence qui n'est pas la GPL" "GNU GPL version 3" "echo 'MIT' > LICENSE"
muter "un CHANGELOG sans la version" "aucune section" "sed -i 's/^## \[1.0.0-beta.2\]/## [9.9.9]/' CHANGELOG.md"

echo
echo "$OK réussi(s), $KO échec(s)."
[ "$KO" -eq 0 ]
