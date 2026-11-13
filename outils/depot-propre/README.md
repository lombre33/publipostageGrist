# Publier une version sur le dépôt public

Ces outils préparent l'envoi d'une version de Publipostage+ vers le dépôt public
`grist-factory/Publipostage-Plus` : un commit de plus sur son historique, une étiquette `vX.Y.Z` et une
sauvegarde. **Ils ne poussent jamais** : le dernier geste (`git push`) reste manuel, après relecture.
Ce dossier ne part pas sur le dépôt public (`outils/` est dans les exclusions de `publier.sh`).

| Fichier | Rôle |
|---|---|
| `publier.sh` | Remplace dans un clone du dépôt public les fichiers publiés par ceux du dépôt de développement (le kit de Grist Factory, `kit/`, un sous-module, part en fichiers : css, js et licence, au commit que le dépôt de développement épingle), pose les documents et les captures de `public/`, lance les contrôles, committe et étiquette. |
| `controles.mjs` | Les contrôles sur l'arbre à publier : une ERREUR empêche le commit, un AVERTISSEMENT se relit. |
| `beta-bandeau.mjs` | La bêta figée avec son bandeau « version bêta » (consigne 070 de GFS) : `--poser` écrit `beta/` dans le clone public (les fichiers de l'étiquette de la bêta + le bandeau, dans le dossier de travail seulement), `--verifier` et `--ecarts` la relisent (voir « Le bandeau de la bêta »). `publier.sh` le lance à chaque publication ; il ne committe ni ne pousse jamais. |
| `beta/` | Les deux fichiers du bandeau, `beta-bandeau.js` et `beta-bandeau.css` : ils ne partent pas tels quels, `beta-bandeau.mjs` les pose dans `beta/js/` et `beta/css/` du dépôt public. |
| `essai.sh` | Les essais de ces scripts, de `beta-bandeau.mjs` et de `numeros-carte.mjs` sur de faux dépôts (sans réseau, rien n'est poussé). À relancer après toute modification d'un des quatre. |
| `numeros-carte.mjs` | Recompte les nombres de `public/CARTE_DU_CODE.md`, en français et en anglais (le volume de `js/`, des extensions et des feuilles de style, les familles, `js/main.js`) d'après le dépôt de développement : `node outils/depot-propre/numeros-carte.mjs` dit ce qui changerait, `--fix` réécrit la carte. |
| `public/` | Les documents publics : `README.md` (bilingue), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `PATCH_NOTES.md` (la note de version : une puce par fonction, en français puis en anglais), `NOTICE`, `CARTE_DU_CODE.md` (la carte du code, bilingue). `{{VERSION}}`, `{{DATE}}`, `{{DATE_FR}}` et `{{DATE_EN}}` y sont remplacés à la publication. `public/screenshots/` porte les captures du README (des `.png`), posées telles quelles dans `screenshots/` du dépôt public : une capture du même nom est remplacée, les autres sont gardées. |
| `en-attente/` | Des documents prêts et pas publiés : aujourd'hui `PATCH_NOTES_GFS.md`, la partie de la note de version qui demande Grist Factory Suite (présentations, graphiques, écriture en direct, lecture de PDF, intégration à GFS). `publier.sh` ne les lit pas ; pour en publier un, le poser dans `public/` et l'ajouter aux trois listes de `controles.mjs` (fichiers requis, entrées connues, documents dont les liens se contrôlent). |
| `captures/` | Refait les 17 captures du README (`public/screenshots/`) sur l'interface du jour : le vrai widget et le faux Grist de `dev-tests/`, piloté à la vraie souris, en douze scènes (le modèle « Contrat de prestation de services » de la galerie, le menu « Aa », les conditions, la boucle, un macro-modèle, l'historique des versions, les exports…), 1280 px de large à l'échelle 2. `bash dev-tests/offline-deps.sh` une fois, puis `bash outils/depot-propre/captures/lancer-tout.sh` ; `captures/LISEZMOI.md` dit les scènes et les pièges. Puis committer les images de `public/screenshots/`. |

## Publier

1. Dépôt de développement : propre, sur `origin/main`, clone complet (`git fetch --unshallow origin main`
   sur un clone partiel), kit récupéré (`git submodule update --init kit`). Tous les lots à publier y sont déjà.
2. Clone du dépôt public, une fois pour toutes : `git clone https://github.com/grist-factory/Publipostage-Plus.git`.
3. Version : `PP_VERSION` dans `js/version.js` (semver, `1.0.0-beta.1` pour la première bêta), et la section
   `## [{{VERSION}}] - {{DATE}}` du `public/CHANGELOG.md`, en français et en anglais : elle reste ouverte entre
   deux publications, et les changements s'y écrivent au fil de l'eau. Une fois la version publiée, la section
   prend sa version et sa date en clair (`## [1.0.0-beta.1] - 2026-10-05`) et une nouvelle section
   `## [{{VERSION}}] - {{DATE}}` s'ouvre au-dessus. Relire `public/README.md`
   (limites connues, roadmap) : il décrit l'état du jour de la publication, pas celui de la précédente.
   Relire `public/PATCH_NOTES.md` (la note de version) contre la section `## [{{VERSION}}]` du CHANGELOG : une puce par fonction, en
   français puis en anglais, avec le même nombre de puces des deux côtés ; une fonction née depuis sa dernière relecture y prend sa puce
   (celles qui demandent Grist Factory Suite vont dans `en-attente/PATCH_NOTES_GFS.md`, pas dans la note publique).
   Relire aussi `public/CARTE_DU_CODE.md` : les contrôles voient un fichier cité qui n'existe plus, un fichier de
   `js/` qui n'y figure pas et les nombres de `js/` périmés (fichiers en tout et par famille, lignes au vingtième près) ;
   `node outils/depot-propre/numeros-carte.mjs --fix` les recompte tous, ceux des extensions et des feuilles de style aussi.
   Reste à relire les mots (« six scripts et deux feuilles de style ») et les lignes d'un fichier nouveau ou qui change de rôle. Si l'interface a changé
   depuis les captures du README (`public/screenshots/`), les refaire : `bash outils/depot-propre/captures/lancer-tout.sh` (voir `captures/LISEZMOI.md`).
4. Préparer sans committer, pour relire :
   `bash outils/depot-propre/publier.sh --propre ../Publipostage-Plus --sans-commit`
   puis `git -C ../Publipostage-Plus diff --cached --stat`. Le clone public revient à zéro avec
   `git reset --hard && git clean -fd`.
5. Préparer et committer, sous l'identité qui signera dans l'historique public (aucune valeur par défaut) :
   `PP_AUTEUR_NOM="grist-factory" PP_AUTEUR_EMAIL="328957858+grist-factory@users.noreply.github.com" bash outils/depot-propre/publier.sh --propre ../Publipostage-Plus`
   C'est l'adresse noreply du compte public (GitHub > Réglages > E-mails), choix d'Antoine du 04/10 ; le script refuse
   toute autre adresse, pour que l'adresse personnelle des commits de l'alpha ne s'ajoute pas à ceux de la bêta.
6. Labo de compatibilité avec la bêta, environ 30 minutes, avant CHAQUE envoi au dépôt public (choix du 21/10, carte
   « Le jeu figé et le labo avant l'envoi »). La bêta (`9261da6`, étiquette `v1.0.0-beta.1`) est déployée sur de
   nombreux modèles : la version qui part doit les rouvrir, les enregistrer et les exporter comme prévu. Le mode
   d'emploi est `/mnt/project-files/compatibilite-beta-2026-10-21/README.md` (un vrai Grist, grist-static et Playwright,
   le code de `main` face à celui de la bêta) : les essais 1 (13 modèles d'usage), 2 (26 cas limites), 4 (la galerie de la
   bêta et un vrai e-mail), 5 (lignes vides avant un saut de page), 9 (tableaux à traits de couleur par case) et 10
   (grilles), la comparaison image par image des PDF et des Word, et le rejeu de la V1 seule sur les 2 684 documents de
   la bêta (`replay-all-beta.json.gz` ne change plus). Chaque écart relevé doit être écrit au `public/CHANGELOG.md`
   (section ouverte) ; un écart qui n'y est pas se corrige, ou s'y écrit, avant l'envoi. La passe légère des lots,
   `node dev-tests/run-headless.mjs betaCompat` (le jeu figé `dev-tests/beta-compat-set.json`, sans Grist), ne remplace pas
   ce labo : elle n'a ni données ni tables liées.
7. Relire le commit (`git -C ../Publipostage-Plus show --stat`), puis pousser :
   `git -C ../Publipostage-Plus push origin main vX.Y.Z`.
8. Vérifier que GitHub Pages sert la nouvelle version : le flux « pages build and deployment » part, puis
   `https://grist-factory.github.io/Publipostage-Plus/` charge sans erreur dans un document Grist de test.
   `…/Publipostage-Plus/beta/` montre le bandeau « Attention : widget en version bêta… » (consigne 070 de GFS), et son
   bouton « Découvrir les nouveautés » ouvre `…/Publipostage-Plus/nouveautes.html` dans un nouvel onglet : la même
   publication porte les deux, aucun envoi à part.

La sortie du script (`fichiers.txt`, `resume.txt`, `controles.txt` et `publication-X.Y.Z.bundle`, une
sauvegarde du commit) est écrite dans le dossier donné par `--sortie`, ou dans un dossier temporaire dont le
chemin est affiché.

## Ce que le script refuse

- Un dépôt de développement modifié, pas sur `origin/main` ou partiel ; un clone public modifié, pas sur
  `main` ou pas à jour.
- Une entrée à la racine du dépôt de développement qu'il ne connaît pas (`PUBLIES` ou `EXCLUS` dans
  `publier.sh`) : un nouveau dossier ne part jamais par oubli. Un dossier publié s'ajoute aussi à `KNOWN`
  dans `controles.mjs`, un dossier qui ne doit pas partir à `NEVER`. `package.json` (la liste unique des
  bibliothèques) et `bibliotheques/` (son catalogue) sont classés ainsi : ils restent dans le dépôt de
  développement, et les poser dans le dépôt public est une décision à part.
- Un fichier ou un dossier de `PUBLIES` que le dépôt de développement ne suit pas. `.nojekyll`, un fichier vide
  à la racine, en fait partie : il part avec le reste, car le dépôt public a son propre site (GitHub Pages) et,
  sans lui, Pages passe les `.md` dans Jekyll avant de publier ; un `.md` qui porte une accolade double ouverte
  seule fait alors échouer la publication, et le site reste sur la version d'avant, sans rien montrer.
- Un kit que le dépôt de développement ne récupère pas (`git submodule update --init kit`), ou qui n'est pas un
  sous-module. Le dépôt public n'a pas de sous-module : `.gitmodules` ne part pas (`EXCLUS`), le kit y arrive en
  fichiers ordinaires, ceux de son commit épinglé (`KIT_PARTIES` : `css`, `js`, `LICENSE`), sans son README, son
  journal ni ses essais. Ce que la page ou `js/` en importe (`kit/js/ambiance-message.js`, `ambiance-pose.js`,
  `correcteurs-message.js`, `correcteurs-pose.js`, `once.js`) doit y être, sinon `controles.mjs` s'arrête.
- Un sous-dossier de `public/` autre que `screenshots/`, ou autre chose qu'un `.png` dans `public/screenshots/`.
- Une version qui n'est pas du semver, ou une étiquette déjà prise.
- D'écraser ce que le dépôt public a reçu depuis la dernière étiquette (une contribution acceptée là-bas et
  pas reportée ici) : reporter d'abord le changement dans le dépôt de développement, ou `--ecraser`.
- Un clone public dont `beta/`, la copie figée de la bêta, manque, n'est pas identique aux fichiers du site de
  l'étiquette de la bêta (au bandeau près, de n'importe quelle version) ou porte une entrée de trop ; un document de
  `public/` nommé `beta` (voir « La bêta figée »).
- De committer quand les contrôles ont une erreur, ou sans identité. Il remet alors le clone public à son
  état d'origine.

## Les contrôles

ERREUR (bloque le commit) : fichier requis absent (`.nojekyll` compris) ; dossier de développement présent ; licence qui n'est pas
la GPL v3 ; prénom du développeur, compte personnel, lien ou trace de session, renvoi à la mémoire du projet,
secret ; politique de sécurité du contenu absente, après un script, avec `'unsafe-inline'`, ou dont les
empreintes ne sont pas celles des scripts en ligne de `index.html` ; fichier cité par la page absent ;
adresse du dépôt de développement ; gabarit `{{…}}` resté en place ; lien ou ancre cassé dans les documents
publics ; `CHANGELOG.md` sans la section de la version ; `js/version.js` absent, non chargé par `index.html` ou qui annonce une autre version ;
`CARTE_DU_CODE.md` qui cite un fichier absent ; `.gitmodules` dans l'arbre ; code qui cite `kit/js/…` alors qu'un fichier du kit dont l'app dépend manque ; clé du `localStorage` que le code garde et que le paragraphe du README sur le stockage
du navigateur ne nomme pas, en français ou en anglais (la liste est `STORED` dans `controles.mjs`, à compléter avec le README) ;
`nouveautes.html` (la page des nouveautés de la version 1, consigne 070 de GFS) absente, sans politique de sécurité du contenu fermée (`default-src 'none'`, `script-src 'self'` seul,
`connect-src 'none'`), avec un script en ligne ou qui cite un fichier absent de l'arbre.

AVERTISSEMENT (à relire) : renvoi à un dossier non publié (`planning`, `dev-tests`…) ; entrée inconnue à la
racine ; fichier de `js/` sans ligne dans `CARTE_DU_CODE.md` ; nombre de fichiers ou de lignes de la carte périmé (`js/` en tout, et chaque famille : ses fichiers sont ceux de la première colonne de son tableau) ; adresse e-mail non fictive ; `console.log` ou `console.info` dans `js/` ; fichier de plus de 2,5 Mo.

Avec `--beta-figee` (que `publier.sh` donne ; `codeHygiene` non : l'arbre qu'il assemble n'a pas de `beta/`), `controles.mjs` lit aussi la bêta figée : ERREUR si
`beta/index.html` manque, si `beta/js/version.js` n'annonce pas `1.0.0-beta.1` (une copie de la version qui part) ou si la page de `beta/` cite un fichier qui n'y est pas.
Il lit aussi son bandeau : ERREUR si `beta/js/beta-bandeau.js` ou `beta/css/beta-bandeau.css` manque ou n'est pas, à l'octet près, celui de `outils/depot-propre/beta/` ; si une des deux lignes
du bandeau n'est pas, une fois, dans `beta/index.html` à la version de son fichier (`?v=`) ; si la feuille n'est pas dans `<head>` ou si le script n'est pas le dernier de la page ; ou si la page que
son bouton ouvre (`../nouveautes.html`) n'est pas dans l'arbre.
Le renvoi à un dossier non publié ne compte pas les lignes de `beta/` : le code de la bêta les cite, et il ne se corrige pas.

Ces contrôles ne tournent pas qu'à l'envoi : à chaque correction, `codeHygiene` (`dev-tests/verify-code-hygiene.mjs`, section 26) assemble dans un dossier temporaire l'arbre que `publier.sh` publierait
(sans clone public ni identité) et y lance `controles.mjs`. Une ERREUR s'y voit le jour où on la fait, pas le jour de l'envoi (choix d'Antoine du 16/10) ; les avertissements restent à relire à l'envoi.

## La bêta figée (`beta/`)

Le dépôt public garde dans `beta/`, à l'adresse `https://grist-factory.github.io/Publipostage-Plus/beta/`, une copie **sans correctif** des
fichiers du site de la bêta (étiquette `v1.0.0-beta.1`) : `index.html`, `css`, `js`, `img`, `templates-gallery` et `LICENSE`. Elle sert aux personnes
dont un ancien modèle ne se rouvre pas bien dans la V1 (choix du 04/11, carte « Garder la bêta à une adresse dédiée dans le dépôt public ? » :
« Oui, dossier beta/ »). Les chemins de la bêta sont relatifs, sa politique de sécurité du contenu n'autorise que sa propre origine : elle démarre
depuis un sous-dossier (essai du 04/11 : éditeur prêt, galerie chargée, aucune requête en échec ni violation). Elle se pose à la main, une fois, **avant** l'envoi de la V1,
dans le clone du dépôt public (propre, sur `main`, étiquettes récupérées) :

```
git pull --ff-only && git fetch --tags
mkdir beta
for x in index.html css js img templates-gallery LICENSE; do git archive v1.0.0-beta.1 "$x" | tar -x -C beta; done
git add beta
git -c user.name="grist-factory" -c user.email="328957858+grist-factory@users.noreply.github.com" -c commit.gpgsign=false \
    commit -m "Ajout de la copie figée de la bêta 1.0.0-beta.1 à l'adresse /beta/"
for x in index.html css js img templates-gallery LICENSE; do
  [ "$(git rev-parse v1.0.0-beta.1:$x)" = "$(git rev-parse HEAD:beta/$x)" ] && echo "identique  $x" || echo "DIFFÉRENT  $x"
done
git push origin main
```

Les six lignes doivent dire « identique » avant le `git push` (sinon `git reset --hard origin/main` et on recommence). Même identité que les publications (l'adresse
noreply du compte public, jamais l'adresse personnelle) ; pas d'étiquette pour ce commit. Ensuite, à GitHub Pages d'avoir fini (« pages build and deployment »),
`…/beta/js/version.js` doit montrer `1.0.0-beta.1`, et le widget chargé par cette adresse dans un document Grist de test, Réglages > Crédits, la même version.

`publier.sh` la vérifie avant toute chose (`beta` n'est ni dans `PUBLIES` ni dans les documents de `public/`) : `beta/` doit être là et
identique, octet pour octet (empreintes git de chaque entrée), à ce que l'étiquette de la bêta porte, sans entrée de plus, au bandeau près (voir plus bas) ; `PP_BETA_ETIQUETTE` nomme une autre étiquette
(les essais de `essai.sh` s'en servent). Il la recompose ensuite à l'étape 4 (les fichiers de l'étiquette + le bandeau d'aujourd'hui), et `controles.mjs --beta-figee` relit l'arbre préparé, bandeau compris.
Une bêta retouchée à la main, ou prise sur `main` plutôt que sur l'étiquette, est refusée : on la repose telle que l'étiquette la porte. Pour retirer le dossier un jour : `git rm -r beta` côté public, puis retirer le contrôle (la
vérification de `publier.sh`, `beta-bandeau.mjs`, le bloc « bêta figée » de `controles.mjs`, `--beta-figee` et leurs essais).

### Le bandeau de la bêta (consigne 070 de GFS)

La bêta reste sans correctif, avec **un bandeau en plus** : « Attention : widget en version bêta. Nous vous conseillons de migrer vers la version 1.1. » (en anglais : « Attention: this widget is a beta version. We recommend
migrating to version 1.1. »), un bouton « Découvrir les nouveautés » et une croix. La langue est celle du widget. Le bouton ouvre, dans un nouvel onglet, `nouveautes.html` (`../nouveautes.html?lang=fr` ou `?lang=en`
depuis `beta/`), la page de la version 1 qui montre sa fenêtre des nouveautés seule : choix d'Antoine du 13/11, carte « Nouvel onglet ». La croix ferme le bandeau jusqu'à la prochaine ouverture (rien n'est retenu), et la
fenêtre des nouveautés ne s'ouvre jamais seule dans la bêta. Le bandeau ne cache ni la barre d'outils ni le menu des modèles : la page se raccourcit de sa hauteur.

Il est fait de deux fichiers de ce dépôt, `outils/depot-propre/beta/beta-bandeau.js` et `beta-bandeau.css` (les jetons de couleur de la bêta, contraste de 4,5:1 au moins en clair et en sombre). `beta-bandeau.mjs` les
ajoute à `beta/` du clone public (`js/beta-bandeau.js`, `css/beta-bandeau.css`) avec deux lignes dans `beta/index.html` : la feuille sur sa propre ligne juste avant `</head>`, le script sur la sienne juste avant `</body>`
(après `main.js`), chacun suivi de `?v=` et des huit premiers chiffres de l'empreinte de son fichier. Rien d'autre de `beta/` ne change.

```
node outils/depot-propre/beta-bandeau.mjs --poser <clone public>      (ré)écrit beta/ : les fichiers de l'étiquette + le bandeau (dossier de travail seulement)
node outils/depot-propre/beta-bandeau.mjs --verifier <clone public>   beta/ du dernier commit est l'étiquette + le bandeau, au bit près (--arbre : celle du dossier de travail)
node outils/depot-propre/beta-bandeau.mjs --ecarts <clone public>     beta/ est l'étiquette, avec ou sans bandeau (d'une version quelconque), et rien d'autre
```

L'outil ne committe rien et ne pousse jamais. `publier.sh` le lance à chaque publication (`--ecarts` à l'étape 1, `--poser` à l'étape 4) : un seul envoi porte la version 1, `nouveautes.html` et le bandeau, si bien qu'aucune
adresse ne répond 404 entre deux envois, et un bandeau corrigé dans ce dépôt part à la publication suivante. Il n'y a rien à poser à la main : la copie sans bandeau déjà en ligne reçoit le sien au premier `publier.sh` qui suit.
Le dépôt public se pousse depuis la machine d'Antoine, jamais depuis le nuage.

Limites à dire (forum) : le retour à la bêta n'est sûr que tant qu'aucun contenu propre à la V1 n'est enregistré dans le modèle (la bêta efface signets, exposants et indices,
« sinon afficher ») ; chaque personne change l'adresse du widget dans Grist ; les préférences gardées dans le navigateur (`pp_*`) sont partagées avec la V1, même origine ;
aucun correctif, aucune suite.

## Pourquoi un commit de plus

L'alpha a été publiée en un commit initial sur un dépôt neuf, puis des commits de documentation faits à la
main (le README du dépôt public est écrit à part, avec ses captures `screenshots/` : celles de l'alpha, que
la bêta remplace par `public/screenshots/` ; une capture que seul le dépôt public porte n'est pas touchée).
Chaque publication ajoute un commit sur cet historique : le réécrire (ré-initialiser, force-push)
casserait les clones et les étiquettes de tout le monde. `public/README.md` reprend le README de l'alpha
(même plan, même voix) : le modifier ici, jamais directement sur le dépôt public.
