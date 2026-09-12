# Cahier des charges — Widget de publipostage pour Grist

**Projet** : `publipostageGrist`
**Repo GitHub** : https://github.com/lombre33/publipostageGrist
**Hébergement** : GitHub Pages (widget custom Grist, servi en statique, sans build step)
**Rédaction initiale** : 03/09/2026 — **mis à jour le 12/09/2026** pour refléter la réécriture TipTap/ProseMirror (ancien moteur Quill.js retiré du dépôt).

> Ce document décrit l'état fonctionnel actuel du widget. Pour l'installation/configuration/dépendances, voir [`README.md`](README.md). Pour l'état de l'audit qualité/sécurité, voir [`AUDIT_CODE.md`](AUDIT_CODE.md).

---

## 1. Contexte et objectif

Widget custom Grist permettant de faire du **publipostage** directement depuis un document Grist :

- Rédaction d'un texte enrichi (courrier, modèle de document) avec insertion de **variables** issues des colonnes de n'importe quelle table du document.
- Un **mode édition** pour créer/modifier un modèle, et un **mode lecture** qui résout les variables avec la ligne Grist sélectionnée.
- Un **export PDF** du résultat, y compris en **export en lot** sur toutes les lignes d'une table.
- Une **gestion de modèles** multiples, sauvegardés dans le document Grist, avec une galerie de modèles pré-remplis.

Le widget est un module front-end statique (HTML/CSS/JS), sans backend ni build step, déployé via GitHub Pages, intégré dans Grist via `grist-plugin-api.js`.

Moteur d'édition : TipTap/ProseMirror.

---

## 2. Fonctionnalités

### 2.1 Éditeur de texte enrichi

- Mise en forme : gras, italique, souligné, barré, couleur de texte/surlignage, taille de police réelle (en points) et police (5 polices web-safe avec embarquement PDF), alignement (gauche/centre/droite/justifié).
- Titres H1–H6 avec numérotation hiérarchique automatique (optionnelle) et sommaire généré dynamiquement.
- Listes à puces (3 styles), numérotées (numérique/alpha/romain), cases à cocher (3 styles).
- Tableaux (ajout/suppression de lignes/colonnes, redimensionnement, mise en forme par cellule).
- Zones 2 colonnes (largeur relative ajustable par glisser).
- Images : insertion (URL ou pièce jointe Grist), redimensionnement, alignement en flux (gauche/centre/droite avec habillage de texte) ou en calque (devant/derrière le texte).
- Sauts de page manuels.
- Notes de bas de page.
- Chips intelligents : date/heure du jour, email de l'utilisateur Grist connecté — résolus au moment de l'affichage/export, jamais figés dans le modèle.
- En-têtes et pieds de page dédiés, avec option "première page différente" et numérotation de page (plusieurs formats).
- Undo/redo (historique vidé à chaque changement de modèle, pour éviter qu'un Annuler malencontreux ne fasse réapparaître un modèle précédent).
- Interface bilingue français/anglais ; touche de déclenchement de l'autocomplétion `#` configurable.

### 2.2 Insertion de variables

- Taper `#` ouvre un panneau d'autocomplétion listant les colonnes de la table liée au widget, filtrable par la saisie.
- Une variable sélectionnée est insérée sous forme de badge non éditable au caractère près (`data-table`/`data-column`), résolu en mode lecture/export avec la valeur réelle de la ligne courante.
- Le même panneau permet d'insérer les chips intelligents (§2.1) et les notes de bas de page.

### 2.3 Résolution de variables inter-tables

- Une variable peut référencer une colonne d'une **table autre** que celle liée au widget dans la page.
- La première fois qu'une telle variable est utilisée pour une table cible donnée, une modale de configuration demande comment relier la table courante à la table cible : soit via une colonne de type Référence (choix explicite si plusieurs candidates existent, avec aperçu en direct du résultat), soit en mode "ligne unique" (table de paramètres n'ayant qu'une seule ligne pertinente).
- Cette règle de correspondance est enregistrée une fois pour toutes (table Grist interne dédiée) et réutilisée pour toute variable ultérieure vers la même table cible ; un panneau de gestion permet de revoir/modifier/supprimer les règles existantes.

### 2.4 Mode édition / Mode lecture

- **Mode édition** : l'utilisateur rédige le modèle, variables affichées sous forme de badges non résolus, toute la barre d'outils (§2.1) est active.
- **Mode lecture** : contenu en lecture seule, variables remplacées par les valeurs réelles de la ligne actuellement sélectionnée dans Grist, mis à jour automatiquement au changement de ligne. C'est depuis ce mode (ou directement en édition) que l'export PDF est déclenché.

### 2.5 Gestion des modèles

- Les modèles sont stockés dans une table Grist interne dédiée (créée automatiquement, invisible dans les sélecteurs de table normaux), avec : nom, contenu HTML, gabarit de nom de fichier PDF, données d'en-tête/pied de page, date de dernière modification.
- Interface : sélecteur de modèle existant, "Nouveau modèle", "Enregistrer" / "Enregistrer sous", suppression.
- **Galerie de modèles** pré-remplis (contrat de prestation de services, facture) : création en un clic d'un nouveau modèle avec sa table de données associée si elle n'existe pas encore.

### 2.6 Export PDF

- Disponible en 4 qualités : **vectoriel** (moteur principal, texte réellement sélectionnable, fidèle à la mise en page de l'éditeur — tableaux, zones 2 colonnes, images en calque, en-têtes/pieds de page, notes de bas de page, sommaire avec numéros de page réels), impression navigateur, raster basse/ultra qualité.
- Format A4 portrait.
- Nom de fichier configurable via un gabarit pouvant lui-même contenir des variables, résolu avec la ligne courante à l'export ; repli sur un nom générique si non renseigné.
- **Export en lot** : génère un PDF par ligne de la table courante, regroupés dans une archive ZIP téléchargée en une fois.

---

## 3. Intégration technique avec Grist

- API officielle du plugin Grist (`grist-plugin-api.js`), niveau d'accès `requiredAccess: 'full'` (justifié et documenté — voir la section "Sécurité et permissions" du [`README.md`](README.md) pour le détail et les implications à connaître par une RSSI).
- `grist.onRecord()` pour la ligne sélectionnée dans la table courante.
- `grist.docApi` pour : lister tables/colonnes (autocomplétion, règles de correspondance), gérer les tables internes du widget (modèles, règles de correspondance, sonde d'identité utilisateur), lire/écrire les pièces jointes.

---

## 4. Architecture technique du repo

```
publipostageGrist/
├── index.html                    # Point d'entrée
├── css/
│   ├── style.css, roboto-fonts.css   # Styles partagés
│   ├── editor-v2.css, toolbar-v2.css # Styles de l'éditeur/barre d'outils
├── js/
│   ├── grist-api.js              #   connexion à l'API Grist
│   ├── templates.js              #   CRUD des modèles
│   ├── reader-mode.js            #   résolution des variables, aperçu et entrée de tout export PDF
│   ├── html-sanitize.js          #   assainissement HTML (retrait script/gestionnaires d'événements)
│   ├── pdf-fonts*.js             #   polices embarquées pour l'export PDF
│   ├── editor.js                 #   éditeur TipTap/ProseMirror, nœuds personnalisés, barres d'outils
│   ├── pdf-export.js             #   conversion HTML → PDF vectoriel (pdfmake) + autres qualités
│   ├── variables.js              #   autocomplétion #, résolution cross-table
│   ├── variable-format.js        #   formatage date/nombre/nombre en lettres
│   ├── heading-numbering.js      #   numérotation de titres (logique CSS partagée)
│   ├── i18n.js                   #   dictionnaire de traduction FR/EN
│   ├── icons.js                  #   icônes SVG de la barre d'outils
│   ├── settings.js               #   panneau de réglages
│   ├── template-gallery.js       #   galerie de modèles pré-remplis
│   └── main.js                   #   orchestration, câblage UI
├── templates-gallery/            # Modèles pré-remplis (HTML + schéma de table + aperçu)
├── dev-tests/                    # Suite de tests automatisés (~90 scénarios)
├── README.md
└── AUDIT_CODE.md
```

- Dépendances tierces chargées via CDN, versions figées, sans bundler ni étape de build — détail complet dans le [`README.md`](README.md#dépendances).
- GitHub Pages, déploiement direct sur `main`.

---

## 5. Décisions retenues (état actuel)

| Sujet | Décision |
|---|---|
| Moteur d'édition | TipTap/ProseMirror |
| Portée de l'autocomplétion `#` | Table liée au widget par défaut ; toute autre table via une règle de correspondance configurable |
| Représentation des variables | Badge non éditable dans l'éditeur |
| Liaison widget ↔ table | Table liée par la page Grist ; variables cross-table via règles de correspondance dédiées |
| Stockage des modèles | Table Grist interne dédiée, créée automatiquement |
| Export PDF | 4 qualités (vectoriel/impression navigateur/raster bas/haut), unitaire ou en lot (ZIP) |
| Déploiement | Push direct sur `main`, GitHub Pages racine `/` |

## 6. Suites possibles

Pistes déjà identifiées mais non retenues à ce jour (voir aussi [`AUDIT_CODE.md`](AUDIT_CODE.md) pour les chantiers de qualité/sécurité en cours) :

- Export "mailto" (scaffold présent, non branché — `js/mailto-export.js`).
- Auto-hébergement des dépendances TipTap/ProseMirror (actuellement chargées depuis un CDN tiers), mis en attente.
- Réduction du niveau d'accès Grist demandé si l'API du plugin venait à proposer un niveau intermédiaire.
