# Publier une version sur le dépôt public

Ces outils préparent l'envoi d'une version de Publipostage+ vers le dépôt public
`grist-factory/Publipostage-Plus` : un commit de plus sur son historique, une étiquette `vX.Y.Z` et une
sauvegarde. **Ils ne poussent jamais** : le dernier geste (`git push`) reste manuel, après relecture.
Ce dossier ne part pas sur le dépôt public (`outils/` est dans les exclusions de `publier.sh`).

| Fichier | Rôle |
|---|---|
| `publier.sh` | Remplace dans un clone du dépôt public les fichiers publiés par ceux du dépôt de développement, pose les documents de `public/`, lance les contrôles, committe et étiquette. |
| `controles.mjs` | Les contrôles sur l'arbre à publier : une ERREUR empêche le commit, un AVERTISSEMENT se relit. |
| `essai.sh` | Les essais de ces deux scripts sur de faux dépôts (sans réseau, rien n'est poussé). À relancer après toute modification d'un des deux. |
| `public/` | Les documents publics : `README.md` (bilingue), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `NOTICE`. `{{VERSION}}`, `{{DATE}}`, `{{DATE_FR}}` et `{{DATE_EN}}` y sont remplacés à la publication. |

## Publier

1. Dépôt de développement : propre, sur `origin/main`, clone complet (`git fetch --unshallow origin main`
   sur un clone partiel). Tous les lots à publier y sont déjà.
2. Clone du dépôt public, une fois pour toutes : `git clone https://github.com/grist-factory/Publipostage-Plus.git`.
3. Version : `PP_VERSION` dans `js/version.js` (semver, `1.0.0-beta.1` pour la première bêta), et la section
   `## [version] - {{DATE}}` du `public/CHANGELOG.md`, en français et en anglais. Relire `public/README.md`
   (limites connues, roadmap) : il décrit l'état du jour de la publication, pas celui de la précédente.
4. Préparer sans committer, pour relire :
   `bash outils/depot-propre/publier.sh --propre ../Publipostage-Plus --sans-commit`
   puis `git -C ../Publipostage-Plus diff --cached --stat`. Le clone public revient à zéro avec
   `git reset --hard && git clean -fd`.
5. Préparer et committer, sous l'identité qui signera dans l'historique public (aucune valeur par défaut) :
   `PP_AUTEUR_NOM="…" PP_AUTEUR_EMAIL="…" bash outils/depot-propre/publier.sh --propre ../Publipostage-Plus`
6. Relire le commit (`git -C ../Publipostage-Plus show --stat`), puis pousser :
   `git -C ../Publipostage-Plus push origin main vX.Y.Z`.
7. Vérifier que GitHub Pages sert la nouvelle version : le flux « pages build and deployment » part, puis
   `https://grist-factory.github.io/Publipostage-Plus/` charge sans erreur dans un document Grist de test.

La sortie du script (`fichiers.txt`, `resume.txt`, `controles.txt` et `publication-X.Y.Z.bundle`, une
sauvegarde du commit) est écrite dans le dossier donné par `--sortie`, ou dans un dossier temporaire dont le
chemin est affiché.

## Ce que le script refuse

- Un dépôt de développement modifié, pas sur `origin/main` ou partiel ; un clone public modifié, pas sur
  `main` ou pas à jour.
- Une entrée à la racine du dépôt de développement qu'il ne connaît pas (`PUBLIES` ou `EXCLUS` dans
  `publier.sh`) : un nouveau dossier ne part jamais par oubli. Un dossier publié s'ajoute aussi à `KNOWN`
  dans `controles.mjs`, un dossier qui ne doit pas partir à `NEVER`.
- Une version qui n'est pas du semver, ou une étiquette déjà prise.
- D'écraser ce que le dépôt public a reçu depuis la dernière étiquette (une contribution acceptée là-bas et
  pas reportée ici) : reporter d'abord le changement dans le dépôt de développement, ou `--ecraser`.
- De committer quand les contrôles ont une erreur, ou sans identité. Il remet alors le clone public à son
  état d'origine.

## Les contrôles

ERREUR (bloque le commit) : fichier requis absent ; dossier de développement présent ; licence qui n'est pas
la GPL v3 ; prénom du développeur, compte personnel, lien ou trace de session, renvoi à la mémoire du projet,
secret ; politique de sécurité du contenu absente, après un script, avec `'unsafe-inline'`, ou dont les
empreintes ne sont pas celles des scripts en ligne de `index.html` ; fichier cité par la page absent ;
adresse du dépôt de développement ; gabarit `{{…}}` resté en place ; lien ou ancre cassé dans les documents
publics ; `CHANGELOG.md` sans la section de la version ; `js/version.js` qui annonce une autre version.

AVERTISSEMENT (à relire) : renvoi à un dossier non publié (`planning`, `dev-tests`…) ; entrée inconnue à la
racine ; adresse e-mail non fictive ; `console.log` ou `console.info` dans `js/` ; fichier de plus de 2,5 Mo.

## Pourquoi un commit de plus

L'alpha a été publiée en un commit initial sur un dépôt neuf, puis des commits de documentation faits à la
main (le README du dépôt public est écrit à part, avec ses captures `screenshots/`, que le script ne touche
pas). Chaque publication ajoute un commit sur cet historique : le réécrire (ré-initialiser, force-push)
casserait les clones et les étiquettes de tout le monde. `public/README.md` reprend le README de l'alpha
(même plan, même voix) : le modifier ici, jamais directement sur le dépôt public.
