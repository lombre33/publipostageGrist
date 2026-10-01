# Mode grille et export Excel

Demande d'Antoine (01/10/2026) : « une feature qui affiche non plus une page A4 blanche, mais une grille type tableau où l'on puisse redimensionner ligne et
colonne, et prévoir l'export Excel au lieu de docx en plus de pdf, en conservant si possible toute la mise en forme. Griser dans la toolbar les features qui n'ont pas
de sens en mode tableau (module tableau, deux colonnes). »

Maquette validée : <https://claude.ai/artifact/CC98edDfx54GyxEhhswFBu> (v4). Les choix d'Antoine sont dans [[project-publipostage-mode-grille-excel]] (mémoire projet).

## Ce qu'Antoine a choisi

- Export Excel : **les deux** — un ZIP de classeurs (un par enregistrement) et un classeur unique. Le classeur unique coupe par défaut à chaque ligne de la table
  (une feuille par saut de page demandé en plus).
- Barre de la case : fusion et scission des cases, bordures, alignement vertical.
- « Vrais nombres » : une case n'est écrite comme nombre ou date dans l'Excel que si elle ne contient QUE ce nombre ou cette date ; sinon du texte (l'Excel n'est qu'un affichage).
- Saut de page conservé : nouvelle page dans le PDF, nouvelle feuille dans l'Excel.
- Bascule portrait / paysage, voulue aussi pour les modèles classiques (autre fil) ; en attendant elle reste grisée hors des types qui la suivent.
- Libellé de la grille : « exporter toutes les valeurs de la table » (les modèles classiques gardent « lignes »).

## Conception

- Un modèle de type `grille` (colonne `TypeModele`, comme `email` et `macro`), créé par « + » ▸ « Nouvelle grille » ; **entrée cachée sans `?dev`** dans l'adresse du widget
  tant que l'export Excel n'est pas livré (`GridEditor.syncEntryVisibility`).
- Même éditeur TipTap que les documents, aucun second éditeur. `js/grid-editor.js` ajoute seulement ce qui fait d'un document « un tableau et rien d'autre » :
  - le **garde-fou** (`filterTransaction`) : le document reste UN tableau en tête (+ le paragraphe vide que `StarterKit` range sous un tableau final, caché par CSS) ; refusés :
    second tableau, deux colonnes, sommaire, saut de page de document, citation, encadré, bloc de code, trait horizontal, note de bas de page, numéro de page, image en calque ;
  - la **sélection** toujours dans une case (`appendTransaction`) ; Ctrl+A prend les cases, Suppr les vide ;
  - les **bandeaux** A, B, C / 1, 2, 3 (collés au défilement, `css/grid.css`) et leurs **poignées** : largeur de colonne et hauteur de ligne en aperçu direct, UNE transaction ;
  - la **hauteur de ligne** : attribut `rowHeight` de `tableRow` (minimum en px ; le plancher du glissé est la hauteur du texte) et `colwidth` posé sur toutes les cases ;
    une colonne ou une ligne ajoutée par la barre de la case prend la taille de sa voisine.
- Pas de feuille : `js/main.js` retire `a4-preview` des deux conteneurs pour une grille (`syncA4PreviewForModelType`) et grise la case ; ni zone d'en-tête/pied, ni pagination.
- Suivi des modifications coupé et grisé. Barre d'outils : `GRID_LOCKED_IDS` dans `js/main-toolbar.js`, appliqué APRÈS tous les autres verrouillages (le dernier gagne) ;
  grisés : Tableau, Deux colonnes, Sommaire, Saut de page (temporaire), Citation, Bloc de code, Encadré, Bloc de signature, suivi ×3, aperçu A4. Le garde-fou d'un clic sur un bouton grisé
  (`wireLockedClickGuard`) tient aussi pour Entrée et Espace.
- Barre flottante de la case : ancrée sur la case courante (`GridEditor.currentCellDom`), « Supprimer le tableau » grisé ; barre de l'image : calques devant/derrière grisés.
- Pas dans la première version : boucles sur une ligne de grille, formules, volets figés, images en calque, en-tête/pied/numéros de page, conversion document ⇄ grille.

## Lots

| Lot | Contenu | État |
|---|---|---|
| 0, 0b | Orientation dans `PageLayout` (clé `orientation` de la colonne `Margins`) et bouton portrait / paysage (`js/orientation-toggle.js`) | en ligne (01/10) |
| A1 | La grille dans l'éditeur : type, garde-fou, bandeaux et poignées, barre grisée, barre de la case, enregistrement | en cours |
| A2 | Lecture et PDF d'une grille (sans feuille A4, `rowHeight` et `colwidth` respectés, grille plus large que la page ramenée à la largeur) | à faire |
| B | Barre de la case : fusion et scission, bordures, alignement vertical | à faire |
| C | Saut de page porté par la ligne ; bascule portrait / paysage active pour `grille` (`OrientationToggle.TYPES`) | à faire |
| D | Export Excel d'un enregistrement (ExcelJS 4.4.0, cdnjs, chargé à la demande) et lignes Excel du menu Qualité | à faire |
| E | ZIP de classeurs et classeur unique, libellés « valeurs de la table », DOCX grisé en grille / Excel grisé ailleurs | à faire |

## Export Excel (lots D et E) : correspondances retenues

- Largeur de colonne `(px − 5) / 7` ; hauteur de ligne `px × 0,75` ; quadrillage masqué ; orientation et « ajuster à la largeur » dans la mise en page de la feuille.
- Texte riche : une suite de segments (gras, italique, souligné, barré, couleur, taille, police) ; surlignage et fond seulement quand ils couvrent toute la case ; titres → gras + taille ;
  listes écrites « • », « 1. », « ☐ » ; image posée sur la case, à sa taille.
- Nombres et dates : valeur typée seulement si la case ne contient que cela (format d'affichage de la bulle conservé), sinon texte.
- Saut de page : ligne portant le saut → nouvelle feuille, nommée « <nom> (2) » (31 caractères au plus).

## Tests

- `dev-tests/scenarios-grid.js` (groupe `grid`) : forme de départ, pas de feuille A4, barre grisée et rendue, garde-fou avec un témoin sans garde-fou pour chaque commande, sélection, Ctrl+A et Suppr,
  collage d'un tableau, Annuler, tailles des lignes et colonnes ajoutées, bandeaux alignés, tirer un trait (une transaction, un Annuler, minimum, Échap), clic sur un bandeau, barre de la case, suivi coupé,
  contenu qui n'est pas une grille, enregistrer et rouvrir, Lecture et retour.
- `dev-tests/verify-grid-mouse.mjs` (script Node `gridMouse`) : les mêmes gestes à la vraie souris et au vrai clavier à 700×400, clair et sombre, avec la molette et les contrastes.
