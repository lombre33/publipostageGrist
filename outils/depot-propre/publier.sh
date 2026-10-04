#!/usr/bin/env bash
# Prépare l'envoi d'une version de Publipostage+ vers le dépôt public (grist-factory/Publipostage-Plus) : un commit de plus, prêt à pousser.
# NE POUSSE JAMAIS. Il ne touche pas au dépôt de développement ; il écrit dans un clone du dépôt public que tu lui désignes.
#
# Usage :
#   PP_AUTEUR_NOM="…" PP_AUTEUR_EMAIL="…" publier.sh --propre <clone du dépôt public> [--dev <clone du dépôt de développement>]
#                                                       [--version 1.0.0-beta.1] [--sortie <dossier>] [--message "…"] [--sans-commit] [--ecraser]
#   --sans-commit : prépare l'arbre et lance les contrôles, sans committer (pour relire le résultat). L'identité n'est alors pas demandée.
#   --ecraser     : publie même si le dépôt public a reçu, depuis la dernière étiquette de version, des changements aux fichiers que ce script remplace.
#
# Ce que fait le script, dans l'ordre :
#   1. vérifie que le dépôt de développement est propre et sur origin/main, et que le clone public est propre et à jour ;
#   2. refuse toute entrée de la racine du dépôt de développement qu'il ne connaît pas (PUBLIES ou EXCLUS ci-dessous) : un nouveau dossier ne part jamais par oubli ;
#   3. refuse d'écraser des changements faits dans le dépôt public depuis la dernière étiquette vX.Y.Z (contribution acceptée là-bas et pas reportée ici) ;
#   4. remplace dans le clone public les entrées PUBLIEES par celles du dépôt de développement (fichiers suivis seulement, les fichiers retirés disparaissent) ;
#      les entrées que seul le dépôt public porte (screenshots/, .github/…) ne sont pas touchées ;
#   5. pose par-dessus les documents publics de outils/depot-propre/public/ (README, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, NOTICE, CARTE_DU_CODE),
#      où {{VERSION}}, {{DATE}} (2026-10-04), {{DATE_FR}} (4 octobre 2026) et {{DATE_EN}} (October 4, 2026) sont remplacés ;
#   6. lance controles.mjs sur l'arbre obtenu : une ERREUR empêche le commit ;
#   7. committe sous l'identité donnée (jamais d'identité par défaut : sans PP_AUTEUR_NOM et PP_AUTEUR_EMAIL, il s'arrête ; l'adresse doit être l'adresse noreply de GitHub du compte grist-factory), pose l'étiquette vX.Y.Z,
#      écrit un résumé et une sauvegarde (.bundle) dans le dossier de sortie.
# Quand il s'arrête avant le commit (erreur, ou identité absente), le clone public revient à son état d'origine.
set -euo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ce qui part sur le dépôt public, tel que le dépôt de développement le suit.
PUBLIES=(index.html css js img templates-gallery LICENSE)
# Ce qui ne part jamais (les documents publics viennent de public/, pas du README du dépôt de développement).
EXCLUS=(.claude .gitignore AUDIT_CODE.md CAHIER_DES_CHARGES.md README.md dev-tests outils planning prototypes templates-gallery-dev)

DEV=""
PROPRE=""
VERSION=""
SORTIE=""
MESSAGE=""
SANS_COMMIT=0
ECRASER=0
MODIFIE=0   # 1 dès que l'arbre du clone public a été remplacé
GARDER=0    # 1 quand l'arbre doit rester tel quel en sortie (commit fait, ou --sans-commit)

usage() { awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"; }
die() { echo "ERREUR : $*" >&2; exit 1; }
restaurer() {
  git -C "$PROPRE" reset -q --hard HEAD 2>/dev/null && git -C "$PROPRE" clean -fdq 2>/dev/null \
    && echo "Le clone public est revenu à son état d'origine." >&2 || true
}
trap 'if [ "$MODIFIE" -eq 1 ] && [ "$GARDER" -eq 0 ]; then restaurer; fi' EXIT

while [ $# -gt 0 ]; do
  case "$1" in
    --dev) DEV="${2:?--dev demande un dossier}"; shift 2 ;;
    --propre) PROPRE="${2:?--propre demande un dossier}"; shift 2 ;;
    --version) VERSION="${2:?--version demande un numéro}"; shift 2 ;;
    --sortie) SORTIE="${2:?--sortie demande un dossier}"; shift 2 ;;
    --message) MESSAGE="${2:?--message demande un texte}"; shift 2 ;;
    --sans-commit) SANS_COMMIT=1; shift ;;
    --ecraser) ECRASER=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$PROPRE" ] || { usage >&2; die "--propre est obligatoire"; }
[ -n "$DEV" ] || DEV="$(cd "$ICI/../.." && pwd)"
DEV="$(cd "$DEV" && pwd)"
PROPRE="$(cd "$PROPRE" && pwd)"
git -C "$DEV" rev-parse --git-dir >/dev/null 2>&1 || die "$DEV n'est pas un dépôt git (indique --dev)"
git -C "$PROPRE" rev-parse --git-dir >/dev/null 2>&1 || die "$PROPRE n'est pas un dépôt git"
[ "$DEV" != "$PROPRE" ] || die "--dev et --propre désignent le même dossier"

# --- 1. Les deux dépôts sont dans l'état attendu -------------------------------------------------------------------------------------------
git -C "$DEV" fetch --quiet origin main || die "git fetch origin main a échoué dans le dépôt de développement"
[ -z "$(git -C "$DEV" status --porcelain)" ] || die "le dépôt de développement a des modifications non committées"
[ "$(git -C "$DEV" rev-parse HEAD)" = "$(git -C "$DEV" rev-parse origin/main)" ] \
  || die "le dépôt de développement n'est pas sur origin/main (HEAD $(git -C "$DEV" rev-parse --short HEAD), origin/main $(git -C "$DEV" rev-parse --short origin/main)) : git checkout --detach origin/main"
if [ "$(git -C "$DEV" rev-parse --is-shallow-repository)" = "true" ]; then
  die "le dépôt de développement est un clone partiel : git fetch --unshallow origin main"
fi

url_propre="$(git -C "$PROPRE" remote get-url origin 2>/dev/null || true)"
echo "$url_propre" | grep -qi 'github.com[/:]grist-factory/publipostage-plus\(\.git\)\?$' \
  || die "l'origine du clone public est « $url_propre » : attendu github.com/grist-factory/Publipostage-Plus"
git -C "$PROPRE" fetch --quiet --tags origin main || die "git fetch origin main a échoué dans le clone public"
[ -z "$(git -C "$PROPRE" status --porcelain)" ] || die "le clone public a des modifications non committées"
[ "$(git -C "$PROPRE" branch --show-current)" = "main" ] || die "le clone public n'est pas sur la branche main"
[ "$(git -C "$PROPRE" rev-parse HEAD)" = "$(git -C "$PROPRE" rev-parse origin/main)" ] \
  || die "le clone public n'est pas à jour avec origin/main : git -C $PROPRE pull --ff-only"

# --- version et dates ----------------------------------------------------------------------------------------------------------------------
if [ -z "$VERSION" ]; then
  VERSION="$(git -C "$DEV" show HEAD:js/version.js 2>/dev/null | sed -n "s/.*PP_VERSION *= *['\"]\([^'\"]*\)['\"].*/\1/p" | head -1)"
fi
[ -n "$VERSION" ] || die "version inconnue : js/version.js n'existe pas encore dans le dépôt de développement, donne --version"
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' \
  || die "la version « $VERSION » n'est pas de la forme 1.0.0 ou 1.0.0-beta.1 (versionnement sémantique)"
git -C "$PROPRE" rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null && die "l'étiquette v$VERSION existe déjà dans le dépôt public : choisis une autre version"

DATE_PUB="${PP_DATE:-$(date +%F)}"
echo "$DATE_PUB" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || die "PP_DATE doit s'écrire 2026-10-04 (reçu « $DATE_PUB »)"
MOIS_FR=(janvier février mars avril mai juin juillet août septembre octobre novembre décembre)
MOIS_EN=(January February March April May June July August September October November December)
an="${DATE_PUB%%-*}"; reste="${DATE_PUB#*-}"; mois=$((10#${reste%%-*})); jour=$((10#${reste#*-}))
[ "$mois" -ge 1 ] && [ "$mois" -le 12 ] && [ "$jour" -ge 1 ] && [ "$jour" -le 31 ] || die "date impossible : $DATE_PUB"
if [ "$jour" -eq 1 ]; then jour_fr="1er"; else jour_fr="$jour"; fi
DATE_FR="$jour_fr ${MOIS_FR[$((mois-1))]} $an"
DATE_EN="${MOIS_EN[$((mois-1))]} $jour, $an"

# --- 2. Aucune entrée inconnue à la racine du dépôt de développement ------------------------------------------------------------------------
inconnues=""
while IFS= read -r entree; do
  connue=0
  for x in "${PUBLIES[@]}" "${EXCLUS[@]}"; do [ "$entree" = "$x" ] && connue=1; done
  [ $connue -eq 1 ] || inconnues+="  $entree"$'\n'
done < <(git -C "$DEV" ls-tree --name-only HEAD)
[ -z "$inconnues" ] || die "entrée(s) de la racine du dépôt de développement à classer dans PUBLIES ou EXCLUS de publier.sh :"$'\n'"$inconnues"
for x in "${PUBLIES[@]}"; do
  git -C "$DEV" cat-file -e "HEAD:$x" 2>/dev/null || die "$x n'existe pas dans le dépôt de développement"
done
[ -d "$ICI/public" ] || die "$ICI/public est introuvable (les documents publics)"
DOCS=()
for doc in "$ICI"/public/*; do [ -f "$doc" ] || die "$doc n'est pas un fichier : public/ ne contient que des documents à la racine"; DOCS+=("$(basename "$doc")"); done

# --- 3. Rien de ce que le dépôt public a reçu depuis la dernière publication ne doit être écrasé --------------------------------------------
derniere="$(git -C "$PROPRE" tag --list 'v*' --merged HEAD --sort=-creatordate | head -1)"
if [ -n "$derniere" ]; then
  recus="$(git -C "$PROPRE" diff --name-only "$derniere" HEAD -- "${PUBLIES[@]}" "${DOCS[@]}")"
  if [ -n "$recus" ]; then
    if [ "$ECRASER" -eq 1 ]; then
      echo "Attention : ces fichiers du dépôt public ont changé depuis $derniere et vont être remplacés (--ecraser) :" >&2
      echo "$recus" | head -20 | sed 's/^/  /' >&2
    else
      die "le dépôt public a reçu des changements depuis $derniere, que cette publication écraserait :"$'\n'"$(echo "$recus" | head -20 | sed 's/^/  /')"$'\n'"Reporte-les d'abord dans le dépôt de développement, ou relance avec --ecraser."
    fi
  fi
else
  echo "Aucune étiquette vX.Y.Z dans le dépôt public : première publication depuis l'alpha, rien à comparer."
fi

# --- 4. et 5. L'arbre à publier ------------------------------------------------------------------------------------------------------------
MODIFIE=1
for x in "${PUBLIES[@]}"; do rm -rf "${PROPRE:?}/$x"; done
git -C "$DEV" archive --format=tar HEAD "${PUBLIES[@]}" | tar -x -C "$PROPRE"
for nom in "${DOCS[@]}"; do
  sed -e "s/{{VERSION}}/$VERSION/g" -e "s/{{DATE_FR}}/$DATE_FR/g" -e "s/{{DATE_EN}}/$DATE_EN/g" -e "s/{{DATE}}/$DATE_PUB/g" \
    "$ICI/public/$nom" > "$PROPRE/$nom"
done

# --- 6. Les contrôles ----------------------------------------------------------------------------------------------------------------------
[ -n "$SORTIE" ] || SORTIE="$(mktemp -d "${TMPDIR:-/tmp}/publication-XXXXXX")"
mkdir -p "$SORTIE"
git -C "$PROPRE" add -A
git -C "$PROPRE" diff --cached --name-status --find-renames > "$SORTIE/fichiers.txt"
git -C "$PROPRE" diff --cached --stat | tail -1 > "$SORTIE/resume.txt" || true
set +e
node "$ICI/controles.mjs" "$PROPRE" --version "$VERSION" | tee "$SORTIE/controles.txt"
statut=${PIPESTATUS[0]}
set -e

ajoutes=$(grep -c '^A' "$SORTIE/fichiers.txt" || true)
modifies=$(grep -c '^M' "$SORTIE/fichiers.txt" || true)
retires=$(grep -c '^D' "$SORTIE/fichiers.txt" || true)
echo
echo "Dépôt de développement : $(git -C "$DEV" rev-parse --short HEAD) ; clone public : $(git -C "$PROPRE" rev-parse --short HEAD) ; version $VERSION"
echo "Changements : $ajoutes ajouté(s), $modifies modifié(s), $retires retiré(s). Détail : $SORTIE/fichiers.txt"
if [ "$retires" -gt 0 ]; then
  echo "Retirés du dépôt public (les 12 premiers) :"; grep '^D' "$SORTIE/fichiers.txt" | head -12 | sed 's/^D\t/  /'
fi

if [ "$SANS_COMMIT" -eq 1 ]; then
  GARDER=1
  echo "Sans commit : l'arbre est prêt (indexé) dans $PROPRE. Relire : git -C $PROPRE diff --cached --stat"
  echo "Pour le remettre à zéro avant un autre essai : git -C $PROPRE reset --hard && git -C $PROPRE clean -fd"
  echo "Rien n'est poussé."
  exit "$statut"
fi
[ "$statut" -eq 0 ] || die "les contrôles ont signalé des erreurs : rien n'est committé (relire $SORTIE/controles.txt)"
if [ -z "${PP_AUTEUR_NOM:-}" ] || [ -z "${PP_AUTEUR_EMAIL:-}" ]; then
  die "donne l'identité du commit : PP_AUTEUR_NOM et PP_AUTEUR_EMAIL (aucune valeur par défaut)"
fi
# Choix d'Antoine du 04/10 : le commit de la bêta ne porte pas son adresse personnelle (celle de l'alpha reste lisible dans l'historique public), mais
# l'adresse « noreply » de GitHub du compte public, 328957858+grist-factory@users.noreply.github.com (GitHub > Réglages > E-mails). Celle d'un autre
# compte (la sienne, en noreply, ferait renvoyer chaque commit vers son profil personnel) est refusée aussi.
if ! [[ "$PP_AUTEUR_EMAIL" =~ ^[0-9]+\+grist-factory@users\.noreply\.github\.com$ ]]; then
  die "l'adresse du commit doit être l'adresse noreply de GitHub du compte public (<numéro>+grist-factory@users.noreply.github.com, GitHub > Réglages > E-mails), pas une adresse personnelle ni celle d'un autre compte"
fi

# --- 7. Le commit et l'étiquette -----------------------------------------------------------------------------------------------------------
if [ -z "$MESSAGE" ]; then
  case "$VERSION" in
    *-beta*) MESSAGE="Publication de la bêta $VERSION" ;;
    *) MESSAGE="Publication de la version $VERSION" ;;
  esac
  MESSAGE="$MESSAGE"$'\n\n'"Contenu : voir CHANGELOG.md."
fi
export GIT_AUTHOR_NAME="$PP_AUTEUR_NOM" GIT_AUTHOR_EMAIL="$PP_AUTEUR_EMAIL" GIT_COMMITTER_NAME="$PP_AUTEUR_NOM" GIT_COMMITTER_EMAIL="$PP_AUTEUR_EMAIL"
git -C "$PROPRE" -c commit.gpgsign=false commit -q -m "$MESSAGE"
GARDER=1
git -C "$PROPRE" -c tag.gpgsign=false tag -a "v$VERSION" -m "Version $VERSION"
git -C "$PROPRE" bundle create "$SORTIE/publication-$VERSION.bundle" main "v$VERSION" "^origin/main" >/dev/null 2>&1
echo "Commit $(git -C "$PROPRE" rev-parse --short HEAD) et étiquette v$VERSION prêts dans $PROPRE (signés : $PP_AUTEUR_NOM <$PP_AUTEUR_EMAIL>)."
echo "Sauvegarde : $SORTIE/publication-$VERSION.bundle"
echo "Rien n'est poussé. Pour publier : git -C $PROPRE push origin main v$VERSION"
