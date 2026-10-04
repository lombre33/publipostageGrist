# Publipostage+ pour Grist

Widget personnalisé pour [Grist](https://www.getgrist.com/), conçu par [Grist Factory](https://grist-factory.fr). Il sert à rédiger des modèles de documents (contrats, factures, courriers, e-mails, grilles) dont les **variables** `#Table.Colonne` se remplissent avec les données d'une ligne Grist, puis à les lire, à les exporter en **PDF vectoriel** (texte sélectionnable, pas une image de la page), en Word ou en Excel, ou à ouvrir un e-mail prérempli. Les exports se font ligne par ligne ou en lot.

Moteur d'édition : [TipTap](https://tiptap.dev/)/ProseMirror. Le widget est une page statique unique, servie par GitHub Pages à l'adresse `https://lombre33.github.io/publipostageGrist/` : aucune étape de build.

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Fonctionnalités](#fonctionnalités)
- [Installation dans Grist](#installation-dans-grist)
- [Réglages](#réglages)
- [Sécurité et permissions](#sécurité-et-permissions)
- [Dépendances](#dépendances)
- [Organisation du dépôt](#organisation-du-dépôt)
- [Tests](#tests)
- [État du projet](#état-du-projet)
- [Licence](#licence)

## Démarrage rapide

1. Dans une page Grist, ajouter un widget **personnalisé** et y renseigner l'adresse ci-dessus. Accorder l'accès complet au document quand Grist le demande (voir [Sécurité et permissions](#sécurité-et-permissions)).
2. Lier le widget à la table dont les lignes fournissent les données : il suit la ligne sélectionnée.
3. Ouvrir le menu **Nouveau modèle** puis **Nouveau document**, ou **Créer à partir d'un modèle…** pour partir de la galerie.
4. Écrire le texte et taper `#` pour insérer une variable (`#Table.Colonne`).
5. Passer en **Mode lecture** pour voir le document rempli avec la ligne sélectionnée, puis **Exporter en PDF**.

## Fonctionnalités

### Quatre types de modèles

- **Document** : texte riche sur une page A3, A4, A5 ou A6, en portrait ou en paysage, avec des marges réglables par modèle.
- **E-mail** : objet, À, Cc, Cci et corps, avec les mêmes variables. « Créer l'email » ouvre un brouillon dans la messagerie par un lien `mailto:` : le corps est du texte brut, sans pièce jointe, et une jauge prévient quand le lien dépasse environ 2 000 caractères.
- **Grille** : un tableau de type tableur à la place de la page, aux colonnes et aux lignes redimensionnables. On peut y coller un tableau d'Excel, de Google Sheets ou de LibreOffice Calc, ou y importer un classeur `.xlsx`, puis l'exporter en Excel.
- **Macro-modèle** : une page de garde toujours incluse, suivie d'annexes (d'autres modèles) choisies selon des règles évaluées sur la même ligne. Un œil à côté de chaque modèle du résumé le masque de la Lecture et des exports, sans le retirer de la composition.

La galerie **Créer à partir d'un modèle…** propose des modèles prêts à l'emploi (facture, contrat de prestation de services, attestation, courrier de relance), à utiliser seuls ou avec une nouvelle table de données.

### Éditeur

- Gras, italique, souligné, barré ; six polices (Roboto par défaut, Arial, Times New Roman, Georgia, Courier New, Calibri) en tailles réelles de 8 à 72 pt ; couleur du texte et surlignage ; pinceau de mise en forme ; alignement et retraits.
- Titres de 1 à 6 avec numérotation, sommaire généré à partir des titres, sauts de page, notes de bas de page, en-têtes et pieds de page (première page différente, numéro de page), filigrane.
- Listes à puces (disque, cercle, carré), listes numérotées (1., a., I.) et listes de tâches à cocher en trois styles.
- Tableaux (lignes et colonnes, fond de case, légende) et zones à deux colonnes. Dans une grille s'y ajoutent la fusion et la scission des cases, les bordures et l'alignement vertical.
- Images ajoutées par adresse, collées ou prises dans une colonne Pièces jointes de Grist, avec taille, alignement, habillage du texte, calque devant ou derrière le texte, opacité et légende.
- Menu « Lien et blocs de contenu » : lien (Ctrl+K), citation, bloc de code, encadré (Note, Attention, Important), bloc de signature, QR code.
- Rechercher et remplacer, annuler et rétablir, aperçu A4, abréviations qui se développent à la frappe.

### Variables et logique

- **Variables** `#Table.Colonne` avec autocomplétion et recherche, les colonnes de la table du widget en tête. Une colonne d'une autre table s'utilise après le choix d'une clé de correspondance (bouton « Tables liées ») : une règle par table liée, valable pour tous les modèles du document.
- **Mise en forme d'une variable** : nombres (écriture française ou américaine, 0 à 3 décimales, devise, en toutes lettres), dates (formats prédéfinis, en toutes lettres), Oui/Non (texte ou case cochée en trois styles). Le zéro d'une colonne Numérique ou Entier est masqué par défaut, un bouton le rend visible.
- **Condition d'affichage** : une variable, un bloc de texte (« Texte conditionnel »), une valeur dans la phrase (« Valeur conditionnelle ») ou une case cochée (« Case conditionnelle ») ne s'affichent que si une ou plusieurs règles sont remplies sur la ligne (`=`, `≠`, `>`, `<`, `≥`, `≤`, contient, vide, non vide).
- **Boucle** : répète une ligne de tableau, un élément de liste, un paragraphe ou la variable seule pour chaque ligne liée à la ligne de la page, avec filtre, tri, texte de repli et séparateurs.
- **Autres attributs** : insère d'autres colonnes de la même ligne d'une table liée, à la suite d'une variable.
- **Calcul** : une formule avec des colonnes et les fonctions SOMME, MOYENNE, MIN, MAX, NB et ARRONDI, évaluée par un petit analyseur intégré (jamais par `eval`).
- **Bulles prêtes à poser** : date du jour, heure actuelle, e-mail de la personne connectée.
- **Renommages suivis** : quand une table ou une colonne est renommée dans Grist, les modèles sont réécrits à l'ouverture suivante ; une variable restée sans colonne devient rouge et se corrige par « Colonne… ».
- **Choix du modèle** : modèle par défaut à l'ouverture, modèle par défaut d'une vue, ou modèle choisi selon la ligne par des règles (Réglages > Vue).

### Lecture, enregistrement et collaboration

- **Mode lecture** (le document rempli avec la ligne sélectionnée) et **Lecture épurée** (le document seul, sans barre d'outils ; Échap pour en sortir).
- **Enregistrement automatique** toutes les 2,5 secondes environ, avec détection d'un conflit si quelqu'un d'autre a enregistré le modèle entre-temps ; « Enregistrer sous… » ; un nom de modèle déjà pris devient « nom (2) ».
- **Commentaires** sur le texte sélectionné, avec réponses et résolution, partagés entre les personnes qui ouvrent le document.
- **Suivi des modifications** façon Word : les changements sont proposés dans le texte, puis acceptés ou refusés tous ensemble (« Tout accepter », « Tout refuser »).
- **Droits par personne** : lecture seule, export autorisé, commentaires autorisés, lus dans une table du document (Réglages > Accès).
- **Rangement personnel des modèles** : épingles, dossiers et dossiers repliés par défaut (« Organiser mes modèles »), que les autres personnes ne voient pas.

### Exports

- **PDF vectoriel** : texte sélectionnable, polices embarquées, mise en page de l'éditeur reprise ligne à ligne (en-têtes, pieds de page, numéros de page, notes, sommaire, images en calque, filigrane). Le nom du fichier se compose avec des variables.
- **En lot** : un PDF par ligne dans une archive ZIP, ou toutes les lignes dans un seul PDF.
- **Assemblage avant impression** : pose les pages de chaque ligne sur des feuilles A4 ou A3, avec ou sans traits de coupe (quatre A6 sur une A4, par exemple).
- **Word** (`.docx`, bêta) : listes et notes de bas de page natives, un fichier par ligne en lot.
- **Excel** (`.xlsx`) pour les grilles : une archive ZIP d'un classeur par ligne de la table, ou un seul classeur d'une feuille par ligne.
- Avant un export, une fenêtre liste les sites externes dont des images seraient téléchargées.
- Les qualités de PDF « impression navigateur » et « raster » ne sont pas livrées : l'interface les montre grisées (« bientôt »), leur code (html2pdf.js) a été retiré le 4 octobre 2026 et reste dans l'historique git.

### Interface

- Français et anglais, thème clair, sombre ou celui du système, barre d'outils pensée pour un petit panneau (testée à 700×400).
- 54 raccourcis clavier personnalisables.

## Installation dans Grist

1. Dans une page Grist, ajouter un widget personnalisé et renseigner l'adresse `https://lombre33.github.io/publipostageGrist/`. Le dépôt est servi tel quel : toute copie hébergée en HTTPS sur un serveur statique convient aussi.
2. Accorder au widget l'accès complet au document (voir [Sécurité et permissions](#sécurité-et-permissions)).
3. Le lier à la table dont les lignes serviront de source de données : le widget suit la ligne sélectionnée, comme un widget « détail » standard.
4. Au premier lancement, le widget crée ses tables internes `Publipostage_*` (voir [Sécurité et permissions](#sécurité-et-permissions)) : ce premier lancement demande un droit de modification du document. Leurs pages sont rangées sous celle des modèles, repliée.
5. Après une mise à jour du widget, recharger la page du document Grist.

## Réglages

Le bouton **Réglages** de la barre du haut ouvre huit onglets :

| Onglet | Rôle |
|---|---|
| Langue | Français ou English. |
| Thème | Système, clair ou sombre. |
| Déclencheur | Le caractère qui ouvre la liste des variables (`#` par défaut). |
| Raccourcis | Les touches du clavier, une par action, modifiables ; les abréviations et leur caractère déclencheur (`§` par défaut). |
| Marges | Marges haut, droite, bas et gauche du modèle ouvert. |
| Vue | Le modèle par défaut de cette vue, et le choix du modèle selon la ligne. |
| Accès | La table qui donne à chaque personne ses droits (lecture seule, export, commentaires). |
| Crédits | Auteur, site, licence. |

Les réglages « Vue » et « Accès » sont des options du widget : Grist ne les partage avec les autres personnes qu'une fois la vue enregistrée (bouton d'enregistrement en haut du widget).

## Sécurité et permissions

**Niveau d'accès demandé** : `requiredAccess: 'full'`. Le widget lit et écrit sur l'ensemble du document Grist, pas seulement sur la table à laquelle il est lié dans la page. Ce niveau est **nécessaire** avec l'architecture actuelle : la résolution de variables qui citent une table tierce, l'autocomplétion sur l'ensemble du document et la gestion des tables internes du widget en ont besoin dès le chargement. L'API de widget personnalisé de Grist ne propose aucun niveau intermédiaire entre « lecture d'une seule table » et « accès complet ».

**Ce que cela implique pour un déploiement en administration** : ce niveau d'accès s'applique au *widget*, pas directement à chaque personne. Une personne qui n'a, par les **Règles d'accès** natives de Grist (configurées sur le document par son propriétaire), qu'un accès restreint à certaines tables ou colonnes conserve cette restriction quand elle utilise le widget. **La restriction fine du périmètre de données se fait donc dans le document Grist lui-même (Règles d'accès), pas dans la configuration du widget.** Les « droits par personne » du widget (Réglages > Accès) ne sont qu'un verrou d'interface : ils grisent des commandes, ils ne protègent aucune donnée.

**Tables internes** : le widget écrit dans six tables du document, toutes préfixées `Publipostage_` et masquées de ses propres listes de tables : `Publipostage_Modeles` (les modèles), `Publipostage_Commentaires`, `Publipostage_PreferencesModeles` (épingles et dossiers de chaque personne), `Publipostage_Abreviations`, `Publipostage_LiensTables` (les clés de correspondance entre tables) et `Publipostage_UserProbe` (qui sert à lire l'e-mail de la personne connectée).

**Dépendances externes** : le widget charge des bibliothèques depuis des serveurs tiers (`esm.sh` pour le moteur d'édition, `cdnjs.cloudflare.com` et `cdn.jsdelivr.net` pour les exports, `docs.getgrist.com` pour l'API de Grist), en version figée sauf le script de l'API de Grist ; aucune police ni feuille de style ne vient d'un autre site (l'interface prend la police du système) ; voir [Dépendances](#dépendances). Les fichiers de `cdnjs` et de `jsDelivr` sont protégés par une intégrité SRI : le navigateur refuse d'exécuter un fichier altéré. Ce n'est techniquement pas possible pour l'import map `esm.sh` (limite des imports ES). Le détail de cette analyse et la piste restante (auto-hébergement) sont dans [`AUDIT_CODE.md`](AUDIT_CODE.md#2-enjeu-majeur-rssi--périmètre-daccès-et-surface-dattaque).

**Aucune donnée n'est stockée hors de Grist.** Le navigateur ne garde (`localStorage`) que des préférences d'interface (langue, thème, caractères déclencheurs, raccourcis, dernier choix de l'assemblage avant impression, état de l'enregistrement automatique) et, pour suivre les renommages, les noms des tables et des colonnes de chaque document ouvert. Aucune donnée de ligne n'y est copiée.

**Contenus** : le HTML relu depuis le document (un modèle modifié par une autre personne) est assaini avant d'être affiché : scripts, gestionnaires `on…` et adresses `javascript:` sont retirés, et un lien ne garde que `http(s):`, `mailto:` ou `tel:`. Les formules de calcul ne passent jamais par `eval`. Avant un export, une fenêtre demande confirmation quand des images viennent d'un autre site que le widget ou Grist.

**Signaler une vulnérabilité** : ne pas ouvrir d'issue publique. Contacter l'équipe de maintenance de ce dépôt directement (canal à préciser selon le contexte de publication ou de rattachement du widget).

## Dépendances

Aucune étape de build : tous les fichiers sont servis tels quels. Les bibliothèques tierces sont chargées à l'exécution, en version figée (jamais `@latest`), sauf le script de l'API de Grist, que son serveur sert dans sa version courante. Chaque export ne charge sa bibliothèque qu'au premier usage.

| Bibliothèque | Usage | Origine | Intégrité |
|---|---|---|---|
| `grist-plugin-api.js` | API du widget Grist (obligatoire) | `docs.getgrist.com` | aucune (fichier servi par Grist) |
| TipTap 3.31.3 et ses extensions, ProseMirror (une quinzaine de paquets), `@floating-ui/dom` 1.6.12 | Éditeur de texte riche | `esm.sh` (import map de `index.html`) | aucune |
| `@handlewithcare/prosemirror-suggest-changes` 0.1.8 | Suivi des modifications | `esm.sh` (import map) | aucune |
| pdfmake 0.2.7 et `vfs_fonts` | Export PDF vectoriel | `cdnjs.cloudflare.com` | SRI sha384 |
| pdf-lib 1.17.1 | Un seul PDF pour toutes les lignes, assemblage avant impression | `cdnjs.cloudflare.com` | SRI sha384 |
| JSZip 3.10.1 | Exports en lot (archive ZIP) | `cdnjs.cloudflare.com` | SRI sha384 |
| ExcelJS 4.4.0 | Export Excel | `cdnjs.cloudflare.com` | SRI sha384 |
| qrcode-generator 1.4.4 | QR code | `cdnjs.cloudflare.com` | SRI sha384 |
| docx 9.7.1 | Export Word | `cdn.jsdelivr.net` | SRI sha384 |

L'interface prend la police du système (`--font-ui` de `css/style.css`) : aucune police n'est téléchargée, et aucune ne doit l'être (choix du 04/10, gardé par le groupe `codeHygiene` et par `cspLoad`). Les polices des documents sont dans le dépôt : Roboto pour l'éditeur (`css/roboto-fonts.css`), et pour le PDF Roboto, Arimo, Tinos, Cousine, Gelasio et Carlito, les équivalents libres de même métrique d'Arial, Times New Roman, Courier New, Georgia et Calibri (`js/pdf-fonts*.js`).

## Organisation du dépôt

| Chemin | Rôle |
|---|---|
| `index.html` | La page du widget : import map, feuilles de style, scripts. |
| `js/` | Le code du widget, un fichier par fonction (éditeur, barre d'outils, variables, exports, réglages…). |
| `css/` | Les feuilles de style. |
| `img/` | Le logo. |
| `templates-gallery/` | Les modèles de la galerie, avec leur `manifest.json`. |
| `templates-gallery-dev/` | Des modèles de test, chargés seulement quand l'adresse du widget contient `?dev`. |
| `dev-tests/` | La suite de tests, le harnais et le simulateur de Grist. |
| `planning/` | Les notes de conception par chantier, la feuille de route et la charte UI/UX. |
| `prototypes/` | Le prototype du suivi des modifications, avec ses tests. |
| `AUDIT_CODE.md` | L'audit de code (qualité, sécurité, publication) du 12 septembre 2026. |
| `CAHIER_DES_CHARGES.md` | Le cahier des charges initial, gardé comme document historique. |
| `LICENSE` | La licence GNU GPL v3.0. |

Règle de modification : un fichier `css/` ou `js/` modifié monte son numéro `?v=` dans `index.html`, sinon le navigateur garde l'ancienne version en cache.

## Tests

La suite de `dev-tests/` compte 79 groupes de scénarios, joués dans un Chromium sans écran (un navigateur neuf par groupe), et 79 scripts Node (parcours rejoués à la vraie souris dans un panneau de 700×400, tests unitaires, contrôle d'hygiène du code). Elle couvre l'éditeur, les modes Lecture, Grille et E-mail, et les exports PDF, Word et Excel. Le dernier contrôle complet (3 octobre 2026) a passé plus de 6 500 vérifications.

```bash
bash dev-tests/generate-harness.sh           # régénère _test-harness.html depuis index.html
node dev-tests/run-headless.mjs              # tous les groupes et tous les scripts
node dev-tests/run-headless.mjs comments     # seulement ce groupe
```

Le lanceur charge Playwright depuis `/opt/node22/lib/node_modules/playwright`, l'emplacement de l'environnement où la suite tourne aujourd'hui : ailleurs, ce chemin est à adapter. Quand les CDN sont injoignables, `bash dev-tests/offline-deps.sh` reconstruit un miroir local des dépendances. Le détail (groupes, pièges, tableau « fichier modifié → tests à lancer ») est dans [`dev-tests/README.md`](dev-tests/README.md).

Les tests tournent sur un simulateur de Grist : la résolution réelle des variables et des pièces jointes, un vrai document Grist, les autres navigateurs que Chromium et le rendu réel des fichiers Word ne sont pas couverts.

## État du projet

Le widget est en développement actif : chaque évolution est publiée sur `main` puis servie par GitHub Pages. Les notes de conception de [`planning/`](planning/) disent, pour la plupart en tête de fichier, ce qui est livré et ce qui reste à faire.

Un audit de code complet (qualité, sécurité, conformité aux exigences de publication) a été réalisé le 12 septembre 2026, puis complété le 14 par un passage sur la performance et le code mort : voir [`AUDIT_CODE.md`](AUDIT_CODE.md). C'est un instantané : le code a beaucoup évolué depuis.

Limites connues :

- Le widget demande l'accès complet au document, faute de niveau intermédiaire dans Grist.
- L'export Word est en bêta : les images y sont en ligne (pas de position libre), le sommaire est une liste fixe et les polices ne sont pas embarquées.
- L'e-mail ne garde que le texte brut, sans pièce jointe.
- L'export Excel écrit des valeurs, jamais de formule.
- Pas encore faits : le remplissage d'un modèle avec des données d'exemple, les variantes multilingues d'un modèle et la fusion de cellules dans un tableau de document (elle n'existe que dans les grilles).

## Licence

Ce projet est distribué sous licence [GNU General Public License v3.0](LICENSE) (GPLv3).

Copyright (C) 2026 lombre33
