# Cahier des charges — Widget de publipostage pour Grist

**Projet** : `publipostageGrist`
**Repo GitHub** : https://github.com/lombre33/publipostageGrist
**Hébergement** : GitHub Pages (widget custom Grist, servi en statique)
**Instance cible** : Grist DINUM
**Date de rédaction** : 03/09/2026

---

## 1. Contexte et objectif

Développer un **widget custom Grist** permettant de faire du **publipostage** directement depuis un document Grist :

- Rédaction d'un texte enrichi (courrier, modèle de document) avec insertion de **variables** issues des colonnes de n'importe quelle table du document Grist.
- Un **mode édition** pour créer/modifier un modèle de texte avec ses variables.
- Un **mode lecture** qui, en fonction de la ligne sélectionnée dans la table Grist courante, remplace automatiquement les variables par leurs valeurs.
- Un **export PDF** du résultat en mode lecture (une ligne à la fois pour la V1).
- Une **gestion de modèles** multiples, sauvegardés directement dans le document Grist (création, sélection/chargement, mise à jour).

Le widget est un module front-end statique (HTML/CSS/JS), sans backend, déployé via GitHub Pages, et intégré dans Grist via l'API `grist-plugin-api.js`.

---

## 2. Fonctionnalités détaillées

### 2.1 Éditeur de texte enrichi

Utilisation d'une **librairie existante** (Quill.js retenu, chargé via CDN) plutôt qu'un développement from scratch, étendue pour couvrir les besoins spécifiques.

Fonctionnalités attendues :

- Saisie de texte libre (zone d'édition riche, type WYSIWYG).
- Alignement du texte : gauche, centré, droite, justifié.
- Titres : niveaux 1 à 6 (H1 à H6).
- Mise en forme : gras, italique, souligné.
- **Taille de police** : sélecteur dédié (extension du format Quill standard, qui ne propose pas nativement la taille — à ajouter via un module/format custom `size`).
- **Police de caractères** : sélecteur parmi les polices disponibles côté navigateur (extension du format Quill `font`).
- **Undo / Redo** : au minimum 3 niveaux d'historique (Quill gère nativement un historique configurable via son module `history`, à paramétrer avec une profondeur suffisante, ex. `maxStack: 100`).

### 2.2 Insertion de variables (feature clé du publipostage)

- Lorsque l'utilisateur tape le caractère `#` dans l'éditeur, une **liste déroulante avec autocomplétion** apparaît.
- Cette liste présente l'ensemble des colonnes de **toutes les tables du document Grist**, nommées sous la forme `NomTable_NomColonne`.
- La liste se filtre dynamiquement au fur et à mesure de la saisie après le `#` (recherche incrémentale sur `NomTable_NomColonne`).
- Les données des tables/colonnes sont récupérées via l'API Grist (`grist.docApi.listTables()` et introspection des colonnes de chaque table, par ex. via `fetchTable()` ou les métadonnées de schéma exposées par l'API).
- Une fois une variable sélectionnée dans la liste, elle est insérée dans le texte sous forme de **badge/chip non éditable** (élément visuel distinct, non modifiable au caractère près, supprimable uniquement en bloc) — et non comme du texte brut `#Table_Colonne`.
- Le contenu du badge reste néanmoins identifiable/sérialisable dans le HTML sauvegardé (ex. `<span class="variable-chip" data-table="Table" data-column="Colonne">Table_Colonne</span>`) afin de pouvoir être ré-interprété au chargement du modèle et lors du remplacement en mode lecture.

### 2.3 Résolution des variables inter-tables (colonnes rapportées)

- Le widget est rattaché à une **table courante** via la ligne sélectionnée dans Grist (`grist.onRecord`), mais n'est **pas lié de force** à une table particulière au niveau de la configuration du widget : l'utilisateur reste libre de changer de table.
 - Si un modèle est ouvert alors que la table courante ne correspond pas à ses variables (colonnes introuvables), un **message d'erreur explicite** est affiché (ex. "La colonne `X` du modèle n'existe pas dans la table courante `Y`").
- Cas des variables provenant d'une **autre table** que la table courante (ex. `#Client_Nom` alors que le widget est positionné sur la table `Commandes`) :
 - Le widget doit rechercher automatiquement, parmi les colonnes de la table courante, une **colonne de type Référence (Ref / RefList)** pointant vers la table cible (`Client`).
 - Si une telle colonne de référence existe, elle est utilisée pour aller chercher la valeur sur la ligne liée dans la table cible.
 - **S'il existe plusieurs colonnes de référence possibles** vers la même table cible, une **popup de sélection** est proposée à l'utilisateur au moment de l'insertion du badge, lui demandant quelle colonne de référence utiliser pour résoudre le lien. Ce choix est mémorisé avec le badge (ex. attribut `data-ref-column`) pour ne pas le redemander à chaque lecture.
 - Si aucune colonne de référence n'existe, un message d'erreur est affiché en mode lecture pour cette variable spécifique (valeur non résolvable).

### 2.4 Mode édition / Mode lecture

Un **bouton/toggle** en haut du widget permet de basculer entre les deux modes :

- **Mode édition** :
 - L'utilisateur rédige/modifie le texte du modèle.
 - Les variables apparaissent sous forme de badges (`Table_Colonne`), non résolues.
 - Toute la toolbar de mise en forme (§2.1) est active.

- **Mode lecture** :
 - Le texte est affiché en lecture seule.
 - Les badges de variables sont remplacés par la **valeur réelle** de la colonne correspondante, pour la **ligne actuellement sélectionnée** dans la table courante (récupérée via `grist.onRecord`).
 - Le contenu se met à jour automatiquement si l'utilisateur change de ligne sélectionnée dans Grist.
 - C'est depuis ce mode que l'export PDF est déclenché.

### 2.5 Gestion des modèles (templates)

- Les modèles sont **sauvegardés dans le document Grist lui-même**, dans une table dédiée créée automatiquement par le widget au premier usage si elle n'existe pas encore (via `grist.docApi`), nommée par exemple `Publipostage_Modeles`, avec au minimum les colonnes suivantes :
 - `Nom` (Texte) — nom du modèle.
 - `Contenu` (Texte long) — le HTML du modèle, badges de variables inclus (avec leurs attributs `data-table`, `data-column`, `data-ref-column` le cas échéant).
 - `NomFichierPDF` (Texte) — gabarit du nom de fichier PDF, pouvant lui-même contenir des variables (voir §2.6).
 - `DateModif` (Date/DateTime) — date de dernière modification.
- Interface de gestion des modèles en haut du widget :
 - Sélecteur déroulant "Charger un modèle existant", listant les modèles enregistrés dans `Publipostage_Modeles`.
 - Bouton **"Nouveau modèle"** pour repartir d'une page blanche.
 - Boutons **"Enregistrer"** (met à jour le modèle courant) et **"Enregistrer sous"** (crée un nouveau modèle avec un nouveau nom).

### 2.6 Export PDF

- Disponible uniquement en **mode lecture**, une fois les variables résolues pour la ligne courante.
- Reprend le contenu affiché avec toute sa mise en forme (titres, gras/italique/souligné, alignement, tailles et polices de caractères).
- Génération **côté client**, sans backend, via une librairie JS adaptée (ex. `html2pdf.js` ou `jsPDF` + `html2canvas`), chargée via CDN.
- **Format de page : A4 portrait** par défaut.
- **Nom du fichier** : configurable via un champ dédié du modèle (`NomFichierPDF`), qui peut lui-même contenir des **variables** au même format que le corps du texte (badges `Table_Colonne`), résolues avec la ligne courante au moment de l'export (ex. `Courrier_#Client_Nom_#Commande_Numero.pdf` → `Courrier_Dupont_CMD1234.pdf`).
- Si le champ `NomFichierPDF` n'est pas renseigné, un nom générique de secours est utilisé (ex. `publipostage_<date>.pdf`).
- **V2 (hors périmètre initial, à anticiper dans l'architecture)** : export en masse sur plusieurs lignes (sélection multiple ou toutes les lignes visibles), avec génération d'un PDF par ligne ou d'un PDF consolidé.

## 3. Intégration technique avec Grist

- Utilisation de l'API officielle du plugin Grist :
 ```html
 <script src="https://docs.getgrist.com/grist-plugin-api.js"></script>
 ```
- Appel à `grist.ready()` dès l'initialisation du widget.
- Abonnement à `grist.onRecord()` pour connaître la ligne sélectionnée dans la table courante et alimenter le mode lecture.
- Utilisation de `grist.docApi` pour :
 - Lister les tables et colonnes du document (alimentation de l'autocomplétion `#`).
 - Créer/lire/mettre à jour la table `Publipostage_Modeles`.
 - Résoudre les colonnes de type Référence pour les variables inter-tables.

## 4. Architecture technique du repo

Afin de limiter les régressions lors des corrections/refontes, le code JavaScript est **découpé en modules indépendants**, plutôt qu'un unique fichier monolithique. Structure indicative :

```
publipostageGrist/
├── index.html                  # Point d'entrée du widget
├── CAHIER_DES_CHARGES.md       # Le présent document
├── css/
│   └── style.css               # Mise en forme du widget
└── js/
    ├── grist-api.js            # Connexion à l'API Grist (ready, onRecord, docApi, listing tables/colonnes)
    ├── editor.js                # Initialisation et configuration de l'éditeur riche (Quill + extensions taille/police/undo-redo)
    ├── variables.js             # Logique d'autocomplétion "#", création des badges/chips, résolution des variables (directes + inter-tables via Ref)
    ├── templates.js             # Gestion des modèles : création table Publipostage_Modeles, CRUD, sélecteur, enregistrer/enregistrer sous
    ├── reader-mode.js           # Bascule édition/lecture, remplacement des variables par les valeurs de la ligne courante
    ├── pdf-export.js            # Génération et téléchargement du PDF (A4 portrait), résolution du nom de fichier avec variables
    └── main.js                  # Orchestration générale, câblage des événements UI et des modules ci-dessus
```

- Librairies externes chargées via **CDN** (pas de dépendance à un bundler/build step, cohérent avec un déploiement statique GitHub Pages) :
 - Quill.js (éditeur riche)
 - html2pdf.js (ou jsPDF + html2canvas) pour l'export PDF
 - `grist-plugin-api.js` (API Grist)
- **GitHub Pages** : déploiement depuis la branche `main`, racine du repo (`/`).

## 5. Points ouverts / hypothèses retenues pour la V1

| Sujet | Décision retenue pour la V1 |
|---|---|
| Librairie d'édition | Quill.js via CDN, étendue (taille/police de police) |
| Portée de l'autocomplétion `#` | Toutes les tables et colonnes du document Grist |
| Représentation des variables | Badge/chip non éditable dans l'éditeur |
| Liaison widget ↔ table | Pas de liaison forcée ; message d'erreur si incohérence modèle/table |
| Variables inter-tables | Résolution automatique via colonne(s) de type Référence ; popup de choix si plusieurs colonnes Ref possibles vers la même table |
| Stockage des modèles | Table Grist dédiée `Publipostage_Modeles`, créée automatiquement si absente |
| Gestion multi-modèles | Oui : création, chargement, enregistrement / enregistrement sous |
| Export PDF | Une ligne à la fois, A4 portrait, nom de fichier configurable avec variables |
| Export PDF en masse | Hors périmètre V1, à prévoir en V2 dans l'architecture |
| Déploiement | Push direct sur `main`, sans PR intermédiaire, GitHub Pages racine `/` |

## 6. Prochaines étapes

1. Mise en place de la structure de fichiers (§4) avec un `index.html` fonctionnel intégrant l'API Grist.
2. Intégration de Quill.js et de ses extensions (taille, police, historique).
3. Développement du module d'autocomplétion `#` et des badges de variables.
4. Développement de la gestion des modèles (table `Publipostage_Modeles`).
5. Développement du mode lecture et de la résolution des variables (directes + inter-tables).
6. Intégration de l'export PDF.
7. Tests d'intégration dans une instance Grist (DINUM) réelle.

---

## Note technique — résolution de la détection de la table courante

**Date : 3 septembre 2026**

Le widget doit connaître la table de la ligne reçue par `grist.onRecord` afin de
résoudre correctement les variables et les liaisons inter-tables. Le problème
initial était que `grist.getTable()` seul ne fournissait pas toujours un
identifiant exploitable selon le contexte d'intégration et le niveau d'accès du
widget : l'objet retourné pouvait ne pas exposer directement `tableId`, ou
l'appel pouvait échouer. Une déduction à partir des seules colonnes du record
est également ambiguë lorsque plusieurs tables partagent des noms de colonnes.

La solution retenue dans `js/grist-api.js` est une résolution en cascade,
arrêtée dès qu'une valeur valide est trouvée :

1. `mappings.tableId`, lorsqu'il est fourni par Grist (c'est la source
   prioritaire en accès complet) ;
2. `grist.getTable().getTableId()` ;
3. les propriétés de repli de l'objet retourné par `getTable()` (`tableId`,
   puis `id`, `tableRef` ou `name`) ;
4. une déduction par le schéma chargé (`docApi`) : comparaison des clés du
   record courant avec les colonnes connues des tables du document.

En pratique, les logs `[GristAPI] detectTableId(...)` indiquent la source
retenue pour chaque événement. Dans l'intégration actuelle, `mappings.tableId`
est utilisé lorsqu'il est disponible ; à défaut, la résolution opérationnelle
passe par `grist.getTable().getTableId()` lorsque cette méthode est exposée,
puis par les replis et la déduction par schéma. Il n'existe pas de source
`selectedTable` distincte dans l'API utilisée par cette version : elle n'est
pas ajoutée comme hypothèse silencieuse.

Cette stratégie conserve un identifiant de table même lorsque l'une des
interfaces Grist n'est pas disponible, tout en rendant le diagnostic explicite
dans la console.
