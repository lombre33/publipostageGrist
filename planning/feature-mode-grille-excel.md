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

- Un modèle de type `grille` (colonne `TypeModele`, comme `email` et `macro`), créé par « + » ▸ « Nouvelle grille ». L'entrée a été cachée sans `?dev` dans l'adresse du widget
  tant que l'export Excel complet (lot E : toutes les valeurs de la table) n'était pas livré ; elle est dans le menu de tout widget depuis le lot E.
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
- Barre de la case : fixée dans une bande (`#v2-cell-bar-dock`, `GridEditor.barSlot`) entre la barre d'outils et le plan de travail, jamais posée sur une case (01/10, glissé de souris : la barre flottante
  recouvrait les cases voisines de la case courante ; `createFloatingPanel` a `dock` / `undock`, la branche « grille » de `wireTableFloatingToolbar` l'y range) ; masquée avec l'éditeur (`pp-editor-hidden` posé par
  `syncEditorVisibilityForMode`) ; hors d'une grille elle flotte comme avant. « Supprimer le tableau » grisé ; barre de l'image : calques devant/derrière grisés.
- Barre de la case, lot B1 (01/10) : Lignes, Colonnes, Tableau (grisé), Fusion, Fond, Alignement vertical (maquette `Barre`, bordures : lot B2 ci-dessous), sur une ligne à 700 px (elle passe à la ligne au-delà), un
  trait fin entre les groupes. Les boutons propres à la grille portent `v2-grid-only` (montrés par `css/grid.css` sous `body.pp-grid-mode` seulement : la barre d'un tableau de document reste celle d'avant).
  « Fusionner » (`GridEditor.mergeCells`) n'est actif que sur plusieurs cases (`editor.can().mergeCells()`), « Scinder » (`splitCell`) que sur une case fusionnée : grisés sinon (`v2-hf-locked` + `aria-disabled`),
  jamais retirés. Fusionner garde le texte de toutes les cases (à la suite dans la première : rien n'est perdu), le fond et l'alignement de la première, UN seul Annuler. prosemirror-tables ne laisse à la case
  fusionnée que la largeur de sa première colonne (les autres à 0) : `mergeCells` la remet, dans la même transaction, d'après les largeurs d'avant (`columnWidths`) - sinon fusionner toutes les lignes de deux
  colonnes ramenait la seconde à 100 px, `fixDimensions` ne la retrouvant dans aucune autre case. `setColumnWidth` (poignée du bandeau) règle déjà la seule part d'une case fusionnée. Alignement vertical :
  `setVerticalAlign` change toutes les cases choisies d'un coup, le bouton enfoncé (`is-active`, `aria-pressed`) dit l'alignement de toutes les cases choisies, aucun quand elles diffèrent.
  Rendu : l'éditeur et la Lecture montrent `colspan` / `rowspan` tels quels ; l'Excel les fusionnait déjà (`placeCells`) ; le PDF (`tableFrom`) sait maintenant `rowSpan` (une case fusionnée sur plusieurs lignes
  laisse un emplacement vide `{}` dans chaque colonne qu'elle couvre, aux lignes d'après ; le centrage vertical se calcule sur la hauteur de toutes les lignes couvertes) et `ExportCommon.measuredColumnWidthsPx`
  mesure chaque colonne sur la première case d'UNE seule colonne (une ligne de titre fusionnée sur toute la largeur rendait toutes les colonnes égales dans le PDF et le Word, grille ou document).
  Limite : une case fusionnée qui chevauche un saut de page du PDF (lot C) ne sera pas coupée par pdfmake. L'export Word (`js/docx-export.js`) ne traite pas encore `rowspan` dans le calcul des largeurs
  (une grille ne s'y exporte pas ; tableau de document : roadmap A21).
- Barre de la case, lot B2 (01/10) : le bouton « Bordures » (`borders-open`, `v2-grid-only`) entre Fond et Alignement vertical ouvre un menu SOUS la bande (`show(btn, { placement: 'bottom-start' })`, nouvelle option de
  `createFloatingPanel` : au-dessus il recouvrirait la barre d'outils ; le menu de fond s'ouvre lui aussi dessous dans une grille) : huit réglages en icônes (Toutes, Extérieures, Intérieures, Haut, Bas, Gauche, Droite,
  Aucune), la couleur du stylo (les huit nuances du texte, « Personnalisé… », « Par défaut ») qui ne referme pas le menu ; un réglage (`GridEditor.applyBorders`) s'écrit en UNE transaction (un Annuler) et referme le menu ;
  « Intérieures » grisé, jamais retiré, quand il n'y a rien à tracer (`canApplyBorders` : une seule case, l'intérieur d'une case fusionnée). Modèle de données : quatre attributs de case `borderTop|Right|Bottom|Left`
  (null = le trait fin gris de départ, `'none'` = pas de trait, `'#rrggbb'`), nuls hors grille (lus dans `data-border-*` seulement, jamais dans le `border` d'un tableau collé), enregistrés `data-border-<côté>` avec un
  `border-<côté>: hidden | 1px solid #hex` en ligne (`border-collapse: collapse` : `hidden` l'emporte, l'éditeur et la Lecture dessinent comme le PDF). Un trait entre deux cases est UN trait : `js/table-borders.js`
  (module pur, `TableBorders`) donne la règle une seule fois pour l'éditeur, la Lecture, le PDF et l'Excel - un trait est un nœud par côté de case, un trait partagé relie ses deux côtés, une case fusionnée n'a qu'une
  valeur par côté (le trait de chaque côté et les cases d'en face forment un groupe), un groupe qui diverge prend « pas de trait » d'abord, puis la première couleur dans l'ordre de lecture, sinon le trait de départ ;
  le réglage choisi l'emporte sur tout (`TableBorders.set`). L'éditeur (`fixBorders`, après `fixDimensions`) remet d'accord ce que fusionner, supprimer une ligne ou coller ont laissé divergent ; `mergeCells` donne à la
  case fusionnée le pourtour des cases fusionnées (leurs traits intérieurs disparaissent), `splitCell` rend le pourtour aux cases du bord et le trait de départ à l'intérieur ; une ligne ou une colonne ajoutée prolonge les
  traits intérieurs (`borderSeeds` : une nouvelle ligne copie le gauche et le droit de la ligne de référence, une nouvelle colonne le haut et le bas ; en bout de tableau le cadre reste dehors et le trait intérieur
  suit). PDF (`tableFrom`) : `border: [gauche, haut, droite, bas]` et `borderColor` sur chaque case, lus par `ExportCommon.cellBorderSides` (la même règle, sur les `data-border-*`) - pdfmake dessine un trait dès que
  l'UNE ou l'autre des deux cases voisines le demande et une case fusionnée tient son pourtour de sa seule case d'origine (les emplacements vides `{}` ne portent rien) ; Excel : les quatre côtés de la case, un côté sans
  trait n'est pas écrit, toutes les cases d'une plage fusionnée portent le même pourtour. Limites : un trait fin et plein seulement (ni épaisseur, ni pointillé : pdfmake n'a que des épaisseurs de trait par ligne) ;
  le côté d'une case fusionnée est un seul trait (celui des cases d'en face le suit : « bavure » assumée) ; fusionner perd les traits intérieurs, scinder rend le trait de départ à l'intérieur ; une case fusionnée qui
  chevauche un saut de page du PDF reste au lot C.
- Sélection de cases à la souris (01/10) : `js/table-select.js` fait défiler le plan de travail quand le pointeur, bouton appuyé dans une case, est près d'un bord (ou au-delà) et prolonge la sélection de cases
  (`CellSelection`) jusqu'à la case qui arrive sous le bord ; le voile `.selectedCell::after` (`css/editor-v2.css`) rend la sélection visible sur une case colorée. Tableau de document et grille. Limite : le défilement
  horizontal d'un `.tableWrapper` d'un document classique n'est pas suivi (seul `#editor-container` défile ; un tableau de document est ramené à la largeur de la page).
- Alignement vertical : attribut `verticalAlign` de `tableCell` et `tableHeader` (`GridEditor.withCellAttributes`), `null` hors grille, « au milieu » par défaut dans une grille
  (`fixDimensions` le pose sur toute case qui n'en a pas ou qui a une valeur inconnue). Enregistré dans `data-valign` + `style="vertical-align: …"` ; lu dans `data-valign` seulement,
  jamais dans le `vertical-align` d'un tableau collé d'Excel (l'export n'applique l'alignement que dans une grille).
- Le HTML enregistré d'une grille est son tableau, sans la ligne vide cachée de TipTap : `GridEditor.serialize`, appelée par `Editor.getHTML()` et par `Comments.buildReaderHtml()`
  (le chemin de la Lecture quand on a le droit de commenter). Les exports n'ont donc jamais à la deviner.
- Lecture : le HTML enregistré se rend tel quel (largeur du tableau, `<col>`, hauteur des `<tr>`, alignement des `<td>` en ligne) ; une grille plus large que le panneau défile à l'horizontale.
- PDF : une grille se reconnaît dans `tableFrom` (`js/pdf-export.js`) à `data-row-height` sur ses lignes. Chaque ligne reçoit `heights` (hauteur de l'éditeur moins les marges de case et le trait,
  un minimum) et pdfmake ne centre jamais verticalement : le décalage « au milieu » ou « en bas » est mesuré dans le DOM (`Range` sur le contenu de la case) et posé en `margin` haute de la case.
  Une grille plus large que la page est ramenée à sa largeur par la logique des colonnes de tout tableau.
- Export Excel d'un enregistrement (lot D, `js/xlsx-export.js`, `XlsxExport.exportCurrentRecord`) : le modèle est rendu comme en Lecture (`ReaderMode.preview`, donc bulles, conditions, boucles et zéro masqué résolus
  exactement comme à l'écran) dans un hôte hors écran, puis ses cases sont écrites dans une feuille ExcelJS. Le crochet `onBadge` de `ReaderMode.preview(html, tableId, record, onBadge)` laisse l'export lire, bulle
  par bulle, le type de la valeur (`typedCellHook` écrit `data-xl-kind|value|fmt` sur la case) : une case n'est typée que si elle ne contient QUE cette bulle (nombre ou date) ; ce que `ReaderMode.preview` rend en
  texte reste du texte. Aucun style calculé n'est lu (couleurs : seulement ce que la personne a posé, `codeHygiene` y veille). Chargement : ExcelJS 4.4.0 depuis cdnjs avec son SRI, à la demande
  (`ExportCommon.loadScriptOnce`), jamais au démarrage. Menu : « Exporter en Excel… » grisée hors grille, les deux lignes Word grisées dans une grille (`syncExportRowsForModelType` de `js/main.js` ; une ligne grisée
  garde `aria-disabled` et son clic ne lance rien) ; elle ne disparaît jamais.
- Pas dans la première version : boucles sur une ligne de grille, formules, volets figés, images en calque, en-tête/pied/numéros de page, conversion document ⇄ grille.

## Lots

| Lot | Contenu | État |
|---|---|---|
| 0, 0b | Orientation dans `PageLayout` (clé `orientation` de la colonne `Margins`) et bouton portrait / paysage (`js/orientation-toggle.js`) | en ligne (01/10) |
| A1 | La grille dans l'éditeur : type, garde-fou, bandeaux et poignées, barre grisée, barre de la case, enregistrement | en ligne (01/10, `654f926`) |
| A2 | Lecture et PDF d'une grille (sans feuille A4, `rowHeight` et `colwidth` respectés, texte au milieu de sa case, grille plus large que la page ramenée à la largeur) | en ligne (01/10, `418e609`) |
| B1 | Barre de la case : fusion et scission, alignement vertical ; cases fusionnées dans le PDF (`rowSpan`) et colonnes mesurées sur une case simple | prêt (01/10) |
| B2 | Barre de la case : bordures (menu, règle commune `js/table-borders.js`, éditeur, Lecture, PDF, Excel) | prêt (01/10) |
| C | Saut de page porté par la ligne ; bascule portrait / paysage active pour `grille` (`OrientationToggle.TYPES`) | à faire |
| D | Export Excel d'un enregistrement (ExcelJS 4.4.0, cdnjs, chargé à la demande) : ligne « Exporter en Excel… » du menu Qualité PDF, grisée hors grille ; les deux lignes Word grisées dans une grille | en ligne (01/10) |
| E | « Exporter toutes les valeurs de la table » : une archive ZIP d'un classeur par valeur et un classeur unique d'une feuille par valeur ; dans une grille, « lignes » devient « valeurs de la table » (lot PDF compris) ; « Nouvelle grille » visible sans `?dev` (second commit, séparé) | en ligne (01/10) |

## Export Excel (lots D et E) : correspondances retenues

- Largeur de colonne `(px − 5) / 7` ; hauteur de ligne `px × 0,75` ; quadrillage masqué ; orientation et « ajuster à la largeur » dans la mise en page de la feuille.
- Texte riche : une suite de segments (gras, italique, souligné, barré, couleur, taille, police) ; surlignage et fond seulement quand ils couvrent toute la case ; titres → gras + taille ;
  listes écrites « • », « 1. », « ☐ » ; image posée sur la case, à sa taille.
- Nombres et dates : valeur typée seulement si la case ne contient que cela (format d'affichage de la bulle conservé), sinon texte.
- Saut de page : ligne portant le saut → nouvelle feuille, nommée « <nom> (2) » (31 caractères au plus).
- Précisions du lot E : l'archive « <table>-export-xlsx.zip » contient un classeur par valeur (nom : modèle de nom de fichier, comme les PDF) ; le classeur « <table>-export.xlsx » une feuille par valeur,
  nommée comme son fichier (caractères `\ / ? * [ ] :` ôtés, 31 caractères au plus, « nom (2) » si le nom est déjà pris, sans tenir compte de la casse) ; une valeur qui échoue est comptée dans la fin du message et retire
  sa feuille à moitié écrite (le nom est rendu) ; ce sont les mêmes confirmation, progression et ligne de fin que le lot PDF, en mots d'Excel ; `exportText` (`js/main.js`) remplace « lignes » par « valeurs de la table » dans une grille
  (table `GRID_WORDING`, une clé `*Grid` par texte concerné), les lignes Word restent en « lignes » (grisées dans une grille).
- Précisions du lot D : un trait gris fin (`FF777777`) sur chaque case, comme le PDF ; fusions écrites avant les styles ; case sans format = ni couleur de texte ni fond ; un lien qui couvre toute la case est un vrai
  lien Excel, partiel il garde sa couleur et son soulignement sans cible, `javascript:` retiré ; un texte qui commence par `=` reste du texte ; nombres au-delà de 15 chiffres, dates avant 1900, mots (« douze »),
  dates amputées, zéro masqué, condition fausse : texte ou vide ; feuille A4, une page de large, orientation et marges du modèle ; limites connues : une image se pose à l'angle haut gauche de sa case, à sa taille (deux images dans une même case se recouvrent),
  un lien ou un surlignage sur une partie seulement du texte d'une case n'est pas cliquable / dessiné, et la police de départ est Arial 10,5 pt (le Roboto de l'éditeur n'existe pas dans Excel).

## Tests

- `dev-tests/scenarios-grid.js` (groupe `grid`) : forme de départ, pas de feuille A4, barre grisée et rendue, garde-fou avec un témoin sans garde-fou pour chaque commande, sélection, Ctrl+A et Suppr,
  collage d'un tableau, Annuler, tailles des lignes et colonnes ajoutées, bandeaux alignés, tirer un trait (une transaction, un Annuler, minimum, Échap), clic sur un bandeau, barre de la case, suivi coupé,
  contenu qui n'est pas une grille, enregistrer et rouvrir, Lecture et retour ; lot A2 : alignement vertical enregistré (ancien modèle, valeur inconnue, `vertical-align` collé hors grille),
  Lecture comparée à l'éditeur (largeurs, hauteurs, texte à la même hauteur), PDF comparé à l'éditeur (hauteurs et texte peint, lus par pdf.js), grille large ramenée à la page, tableau de document inchangé.
- `dev-tests/scenarios-xlsx.js` (groupe `xlsx`, 26 cas, lots D, E et B2) : le .xlsx produit est dézippé et son OOXML relu (colonnes et lignes, cases typées, formats FR et EN, texte riche, couleurs, fusions et filets, paragraphes
  et listes, liens, images, nom de feuille et mise en page, paysage, ligne répétée par une zone « ligne », document sans tableau, menu grisé, clic de la ligne Excel et alerte sans ligne sélectionnée) ; lot E : l'archive ZIP (un classeur par valeur), le classeur unique (une feuille par valeur, noms valides et distincts), une valeur qui échoue en cours de feuille,
  un bloc de texte conditionnel dans une case (résolu comme à la Lecture), les mots d'une grille (français et anglais, document inchangé, changement de langue) et le PDF unique d'une grille ; relu une fois par openpyxl à l'écriture du lot D
  (LibreOffice n'a pas de module Calc dans ce bac à sable).
- `dev-tests/verify-grid-mouse.mjs` (script Node `gridMouse`) : les mêmes gestes à la vraie souris et au vrai clavier à 700×400, clair et sombre, avec la molette et les contrastes ;
  la Lecture d'une grille large au vrai bouton « Lecture » (colonnes gardées, défilement horizontal, texte au milieu, bulle résolue, pas de ligne vide, contraste du texte) ;
  lots D et E : les menus d'export au survol (cinq lignes dans « Qualité PDF » et deux dans « Exporter en PDF », atteignables dans le panneau, grisées selon le type de modèle, contraste), un vrai clic sur « Exporter en Excel… »
  qui télécharge un .xlsx, un vrai clic sur les deux lignes « toutes les valeurs » (confirmation dans le panneau, puis l'archive ZIP et le classeur unique) et un vrai clic sur une ligne grisée qui ne télécharge rien.
- `dev-tests/verify-table-select-mouse.mjs` (script Node `tableSelectMouse`, 67 mesures) : glisser pour sélectionner des cases à la vraie souris à 700×400, clair et sombre, tableau de document puis grille : rectangle exact dans six sens, sur du contenu réel (bulles, zone répétée,
  condition, liens, images, cases fusionnées, suivi allumé, barre ouverte), voile visible sur une case colorée et texte lisible, défilement tenu au bord du panneau (document, grille de 15 lignes, grille de 12 colonnes), barre de la case dans sa bande qui ne recouvre aucune case (48 glissés), un clic sur
  la barre agit une fois, Entrée et Espace aussi, Lecture, hors grille la barre flotte comme avant. 40 de ces 67 mesures échouent sur le code d'avant (`0dc5e4c`).
- Lot B2 : le groupe `grid` (section 10 de `scenarios-grid.js`, 8 cas) - la règle des bords, un réglage écrit les deux cases d'un trait partagé en un Annuler, un côté de case fusionnée = un groupe, fusion et scission, ligne et colonne ajoutées en bout et au milieu, enregistrement et relecture dans l'éditeur et la Lecture, et deux cas PDF lus sur les traits peints (`h.extractPdfLines`) ; trois cas du groupe `xlsx` (couleur et « pas de trait », HTML en désaccord, bloc fusionné) ; `dev-tests/verify-grid-borders-mouse.mjs` (script Node `gridBordersMouse`, 53 mesures) : le menu à la vraie souris à 700×400, clair et sombre. Chaque correction retirée seule fait échouer un de ces cas (preuves sur l'ancien code faites à l'écriture du lot).
