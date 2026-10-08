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
  - les **bandeaux** A, B, C / 1, 2, 3 (collés au défilement, `css/grid.css`) et leurs **poignées** : largeur de colonne et hauteur de ligne en aperçu direct, UNE transaction ; quand plusieurs lignes (colonnes) entières sont choisies par leurs bandeaux, tirer le trait de l'une les règle toutes à la même taille, plancher = la plus haute de leurs hauteurs de texte (08/10, `chosenLines`) ;
  - la **hauteur de ligne** : attribut `rowHeight` de `tableRow` (minimum en px ; le plancher du glissé est la hauteur du texte) et `colwidth` posé sur toutes les cases ;
    une colonne ou une ligne ajoutée par la barre de la case prend la taille de sa voisine.
- Pas de feuille : `js/main.js` retire `a4-preview` des deux conteneurs pour une grille (`syncA4PreviewForModelType`) et grise la case ; ni zone d'en-tête/pied, ni pagination.
- Suivi des modifications coupé et grisé. Barre d'outils : `GRID_LOCKED_IDS` dans `js/main-toolbar.js`, appliqué APRÈS tous les autres verrouillages (le dernier gagne) ;
  grisés : Tableau, Deux colonnes, Sommaire, Citation, Bloc de code, Encadré, Bloc de signature, suivi ×3, aperçu A4. Le garde-fou d'un clic sur un bouton grisé
  (`wireLockedClickGuard`) tient aussi pour Entrée et Espace. « Saut de page » n'y est plus : il a le sien dans une grille (lot C, plus bas), grisé seulement là où il n'a pas de sens.
- Barre de la case : fixée dans une bande (`#v2-cell-bar-dock`, `GridEditor.barSlot`) entre la barre d'outils et le plan de travail, jamais posée sur une case (01/10, glissé de souris : la barre flottante
  recouvrait les cases voisines de la case courante ; `createFloatingPanel` a `dock` / `undock`, la branche « grille » de `wireTableFloatingToolbar` l'y range) ; masquée avec l'éditeur (`pp-editor-hidden` posé par
  `syncEditorVisibilityForMode`) ; hors d'une grille elle flotte comme avant. « Supprimer le tableau » grisé ; barre de l'image : calques devant/derrière grisés.
- Barre de la case, lot B1 (01/10) : Lignes, Colonnes, Tableau (grisé), Fusion, Fond, Alignement vertical (maquette `Barre`, bordures : lot B2 ci-dessous), sur une ligne à 700 px (elle passe à la ligne au-delà), un
  trait fin entre les groupes. Les boutons propres à la grille (Bordures, Alignement vertical) portent `v2-grid-only` (montrés par `css/grid.css` sous `body.pp-grid-mode` seulement) ; « Fusionner » et « Scinder » vont aussi à la barre d'un tableau de document depuis le 04/10 (`js/table-merge.js`, grisés par `is-disabled` avec leur raison : la grille garde `v2-hf-locked`).
  « Fusionner » (`GridEditor.mergeCells`) n'est actif que sur plusieurs cases (`editor.can().mergeCells()`), « Scinder » (`splitCell`) que sur une case fusionnée : grisés sinon (`v2-hf-locked` + `aria-disabled`),
  jamais retirés. Fusionner garde le texte de toutes les cases (à la suite dans la première : rien n'est perdu), le fond et l'alignement de la première, UN seul Annuler. prosemirror-tables ne laisse à la case
  fusionnée que la largeur de sa première colonne (les autres à 0) : `mergeCells` la remet, dans la même transaction, d'après les largeurs d'avant (`columnWidths`) - sinon fusionner toutes les lignes de deux
  colonnes ramenait la seconde à 100 px, `fixCellDimensions` ne la retrouvant dans aucune autre case. `setColumnWidth` (poignée du bandeau) règle déjà la seule part d'une case fusionnée. Alignement vertical :
  `setVerticalAlign` change toutes les cases choisies d'un coup, le bouton enfoncé (`is-active`, `aria-pressed`) dit l'alignement de toutes les cases choisies, aucun quand elles diffèrent.
  Rendu : l'éditeur et la Lecture montrent `colspan` / `rowspan` tels quels ; l'Excel les fusionnait déjà (`placeCells`) ; le PDF (`tableFrom`) sait maintenant `rowSpan` (une case fusionnée sur plusieurs lignes
  laisse un emplacement vide `{}` dans chaque colonne qu'elle couvre, aux lignes d'après ; le centrage vertical se calcule sur la hauteur de toutes les lignes couvertes) et `ExportCommon.measuredColumnWidthsPx`
  mesure chaque colonne sur la première case d'UNE seule colonne (une ligne de titre fusionnée sur toute la largeur rendait toutes les colonnes égales dans le PDF et le Word, grille ou document).
  Un saut de page ne passe jamais au milieu d'une case fusionnée (lot C : bouton grisé, saut retiré par le document, ignoré par les exports). L'export Word (`js/docx-export.js`) ne traite pas encore `rowspan` dans le calcul des largeurs
  (une grille ne s'y exporte pas ; tableau de document : roadmap A21).
- Barre de la case, lot B2 (01/10) : le bouton « Bordures » (`borders-open`, `v2-grid-only`) entre Fond et Alignement vertical ouvre un menu SOUS la bande (`show(btn, { placement: 'bottom-start' })`, nouvelle option de
  `createFloatingPanel` : au-dessus il recouvrirait la barre d'outils ; le menu de fond s'ouvre lui aussi dessous dans une grille) : huit réglages en icônes (Toutes, Extérieures, Intérieures, Haut, Bas, Gauche, Droite,
  Aucune), la couleur du stylo (les huit nuances du texte, « Personnalisé… », « Par défaut ») qui ne referme pas le menu ; un réglage (`GridEditor.applyBorders`) s'écrit en UNE transaction (un Annuler) et referme le menu ;
  « Intérieures » grisé, jamais retiré, quand il n'y a rien à tracer (`canApplyBorders` : une seule case, l'intérieur d'une case fusionnée). Modèle de données : quatre attributs de case `borderTop|Right|Bottom|Left`
  (null = le trait fin gris de départ, `'none'` = pas de trait, `'#rrggbb'`), nuls hors grille (lus dans `data-border-*` seulement, jamais dans le `border` d'un tableau collé), enregistrés `data-border-<côté>` avec un
  `border-<côté>: hidden | 1px solid #hex` en ligne (`border-collapse: collapse` : `hidden` l'emporte, l'éditeur et la Lecture dessinent comme le PDF). Un trait entre deux cases est UN trait : `js/table-borders.js`
  (module pur, `TableBorders`) donne la règle une seule fois pour l'éditeur, la Lecture, le PDF et l'Excel - un trait est un nœud par côté de case, un trait partagé relie ses deux côtés, une case fusionnée n'a qu'une
  valeur par côté (le trait de chaque côté et les cases d'en face forment un groupe), un groupe qui diverge prend « pas de trait » d'abord, puis la première couleur dans l'ordre de lecture, sinon le trait de départ ;
  le réglage choisi l'emporte sur tout (`TableBorders.set`). L'éditeur (`fixBorders`, après `fixCellDimensions`) remet d'accord ce que fusionner, supprimer une ligne ou coller ont laissé divergent ; `mergeCells` donne à la
  case fusionnée le pourtour des cases fusionnées (leurs traits intérieurs disparaissent), `splitCell` rend le pourtour aux cases du bord et le trait de départ à l'intérieur ; une ligne ou une colonne ajoutée prolonge les
  traits intérieurs (`borderSeeds` : une nouvelle ligne copie le gauche et le droit de la ligne de référence, une nouvelle colonne le haut et le bas ; en bout de tableau le cadre reste dehors et le trait intérieur
  suit). PDF (`tableFrom`) : `border: [gauche, haut, droite, bas]` et `borderColor` sur chaque case, lus par `ExportCommon.cellBorderSides` (la même règle, sur les `data-border-*`) - pdfmake dessine un trait dès que
  l'UNE ou l'autre des deux cases voisines le demande et une case fusionnée tient son pourtour de sa seule case d'origine (les emplacements vides `{}` ne portent rien) ; Excel : les quatre côtés de la case, un côté sans
  trait n'est pas écrit, toutes les cases d'une plage fusionnée portent le même pourtour. Limites : un trait fin et plein seulement (ni épaisseur, ni pointillé : pdfmake n'a que des épaisseurs de trait par ligne) ;
  le côté d'une case fusionnée est un seul trait (celui des cases d'en face le suit : « bavure » assumée) ; fusionner perd les traits intérieurs, scinder rend le trait de départ à l'intérieur ; une case fusionnée ne
  chevauche jamais un saut de page (lot C).
- Quadrillage, lot B3 (08/10, demande d'Antoine : « pour le mode lecture et export du mode grille, il faudrait une option pour savoir si on affiche ou pas la grille (hors bordure) ») : une option PAR MODÈLE de grille, cochée
  au départ, pour montrer ou masquer en Lecture, dans le PDF et dans l'Excel le quadrillage de départ - les traits que personne n'a posés. L'éditeur garde le sien ; les traits posés restent (« hors bordure »). Stockage : un
  attribut du TABLEAU, `gridLines` (`'off'` ou null ; `GridEditor.withTableAttributes`), enregistré `data-grid-lines="off"` sur le `<table>` du HTML du modèle - donc rien de plus à brancher (ni colonne, ni `Margins`, ni
  `main.js`) : la Lecture, le PDF, l'Excel, l'export en lot, « Modèle selon la ligne » et l'enregistrement le portent déjà ; `GridEditor.gridLinesShown` / `setGridLinesShown` (un `setNodeMarkup` sur le tableau : un seul Annuler,
  l'enregistrement automatique le voit). Pour que « hors bordure » veuille dire quelque chose, une nouvelle valeur de bord : `'auto'` (`data-border-*="auto"`) = le trait fin gris de départ POSÉ par la personne - le stylo
  « Par défaut » l'écrit désormais (`TableBorders.valueFor`) au lieu de null, qui reste le quadrillage ; l'éditeur et la Lecture le dessinent en ligne (`1px solid #b8c0c9`, `borderHtml`), comme null quand le quadrillage est montré.
  `TableBorders.drawn(sides, gridShown)` donne ce qu'il faut dessiner (null -> « pas de trait » quand le quadrillage est masqué, `auto` -> le trait de départ) : `ExportCommon.cellBorderSides` l'applique et rend alors
  toujours une Map, le PDF (`tableFrom` : la case de remplissage d'une ligne trop courte n'a plus de trait) et l'Excel n'ont rien d'autre à savoir. Lecture : `body.pp-grid-mode #reader-container table[data-grid-lines="off"]
  td, th { border-style: none }` (`css/grid.css` : un trait posé est en ligne et l'emporte, `none` perd en bordures fusionnées ; réservé à une grille). Les largeurs du PDF ne changent pas (le layout garde 0,5 pt par trait,
  seulement non peint). Menu : une ligne à cocher « Quadrillage » (« Lecture et exports ») au pied du menu « Bordures » (`createBordersDropdown`, `data-action="gridlines"`), qui ne referme pas le menu. Limite connue : une
  bordure posée en « Par défaut » AVANT ce lot est stockée comme le quadrillage (null) et disparaît avec lui, à reposer. Tests : `grid` (règle, enregistrement, Lecture, PDF), `xlsx`, `gridBordersMouse` (700x400, clair et sombre,
  Lecture relue sur de vrais pixels).
- Saut de page, lot C (01/10) : attribut `pageBreakBefore` de `tableRow` (`data-page-break-before="true"` sur le `<tr>`, faux par défaut et hors grille). Le bouton « Saut de page » de la barre d'outils le pose AVANT la
  première ligne de la sélection (`GridEditor.togglePageBreak` : un `setNodeMarkup` sur la ligne, un seul Annuler) et s'enfonce quand cette ligne en porte un ; son info-bulle et son nom accessible changent avec le mode
  (`insert.pageBreak.gridTip` / `gridAria`, relus par `I18n.applyTranslations`). Il est grisé sur la première ligne et là où une case fusionnée couvre la limite (`boundaryCrossed` : la même case sur les lignes r - 1
  et r) ; `fixPageBreaks` (au chargement et dans `appendTransaction`) retire un saut devenu impossible (ligne du dessus supprimée, HTML collé) ; `canMerge` refuse de fusionner à travers un saut (un saut sur le bord
  haut de la sélection ne gêne pas). Marqueur : un trait en tirets en `background-image` des cases de la ligne (`css/grid.css`, `--accent-solid`, sous le texte et la voile de sélection) et une pastille
  `.v2-grid-break` à cheval sur le bord haut du numéro de ligne (`pointer-events: none` : la poignée de la ligne du dessus reste atteignable) ; rien en Lecture. Exports : `ExportCommon.gridRowSegments(rows)` rend les
  tranches `[de, à[` (un saut avant la première ligne ou au milieu d'une case fusionnée est ignoré, même dans un HTML qui n'est pas passé par l'éditeur) ; PDF : `tableBlocksFrom` coupe le tableau en morceaux qui
  partagent colonnes et largeurs, chacun après le premier avec `pageBreak: 'before'` ; Excel : `addTableSheet` écrit une feuille par tranche (`fillTableSheet` : lignes recomptées depuis 1, fusions relatives à la
  feuille, mêmes largeurs et même mise en page ; noms « nom », « nom (2) » par `sheetNameFrom`) et `createSingleWorkbook.appendRecord` retire TOUTES les feuilles d'une valeur qui échoue. Portrait / paysage : `'grille'`
  rejoint `OrientationToggle.TYPES` ; le sens et le format (`getMarginsPt`, `pageOptionsFromLayout`) règlent la page du PDF et la feuille Excel (`PAPER_SIZES` : A3 8, A4 9, A5 11, A6 70) et s'enregistrent avec la
  grille (colonne `Margins`). Limites : les moteurs de PDF alternatifs (`js/pdf-export-alt.js`, désactivés dans l'interface) ne suivent pas les sauts ; le saut se pose avant la PREMIÈRE ligne d'une sélection de
  plusieurs lignes ; un saut disparaît quand sa ligne devient la première ; le code de papier de l'A6 (70) n'a pas été ouvert dans Excel ; la Lecture ne montre aucun marqueur.
- Sélection de cases à la souris (01/10) : `js/table-select.js` fait défiler le plan de travail quand le pointeur, bouton appuyé dans une case, est près d'un bord (ou au-delà) et prolonge la sélection de cases
  (`CellSelection`) jusqu'à la case qui arrive sous le bord ; le voile `.selectedCell::after` (`css/editor-v2.css`) rend la sélection visible sur une case colorée. Tableau de document et grille. Limite : le défilement
  horizontal d'un `.tableWrapper` d'un document classique n'est pas suivi (seul `#editor-container` défile ; un tableau de document est ramené à la largeur de la page).
- Alignement vertical : attribut `verticalAlign` de `tableCell` et `tableHeader` (`GridEditor.withCellAttributes`), `null` hors grille, « au milieu » par défaut dans une grille
  (`fixCellDimensions` le pose sur toute case qui n'en a pas ou qui a une valeur inconnue). Enregistré dans `data-valign` + `style="vertical-align: …"` ; lu dans `data-valign` seulement,
  jamais dans le `vertical-align` d'un tableau collé d'Excel (l'export n'applique l'alignement que dans une grille).
- Le HTML enregistré d'une grille est son tableau, sans la ligne vide cachée de TipTap : `GridEditor.serialize`, appelée par `Editor.getHTML()` et par `Comments.buildReaderHtml()`
  (le chemin de la Lecture quand on a le droit de commenter). Les exports n'ont donc jamais à la deviner.
- Lecture : le HTML enregistré se rend tel quel (largeur du tableau, `<col>`, hauteur des `<tr>`, alignement des `<td>` en ligne) ; une grille plus large que le panneau défile à l'horizontale.
- PDF : une grille se reconnaît dans `tableFrom` (`js/pdf-export.js`) à `data-row-height` sur ses lignes. Chaque ligne reçoit `heights` (hauteur de l'éditeur moins les marges de case et le trait,
  un minimum) et pdfmake ne centre jamais verticalement : le décalage « au milieu » ou « en bas » est mesuré dans le DOM (`Range` sur le contenu de la case) et posé en `margin` haute de la case.
  Une grille plus large que la page est ramenée à sa largeur par la logique des colonnes de tout tableau.
- Export Excel d'un enregistrement (lot D, `js/xlsx-export.js`, `XlsxExport.exportCurrentRecord`) : le modèle est rendu comme en Lecture (`ReaderMode.preview`, donc bulles, conditions, boucles et zéro masqué résolus
  exactement comme à l'écran) dans un hôte hors écran, puis ses cases sont écrites dans une feuille ExcelJS. Le crochet `onBadge` de `ReaderMode.preview(html, tableId, record, onBadge)` laisse l'export lire, bulle
  par bulle, le type de la valeur (`typedCellHook` écrit `data-xl-kind|value|fmt` sur la case) : une case n'est typée que si elle ne contient QUE cette bulle (nombre ou date, ou un seul calcul : 02/10, `typedCalcValueOf`) ; ce que `ReaderMode.preview` rend en
  texte reste du texte. Aucun style calculé n'est lu (couleurs : seulement ce que la personne a posé, `codeHygiene` y veille). Chargement : ExcelJS 4.4.0 depuis cdnjs avec son SRI, à la demande
  (`ExportCommon.loadScriptOnce`), jamais au démarrage. Menu : « Exporter en Excel… » grisée hors grille, les deux lignes Word grisées dans une grille (`syncExportRowsForModelType` de `js/main.js` ; une ligne grisée
  garde `aria-disabled` et son clic ne lance rien) ; elle ne disparaît jamais.
- Collage dans une case (02/10, Antoine : « quand on colle une variable en mode grille ça rajoute 1 à 2 lignes en dessous non souhaitées ») : un texte copié finit presque toujours par un retour à la ligne, que
  ProseMirror garde en dernier paragraphe vide sous le texte collé. `GridEditor.trimPastedSlice` (branché sur `transformPasted`, grille seulement : un document garde son collage) ôte les paragraphes vides de fin et
  les retours à la ligne forcés qui terminent le dernier texte ; il en reste toujours un (des lignes vides seules ne collent rien) ; les lignes vides du MILIEU d'un texte restent ; un tableau copié (lignes, cases) est
  laissé tel quel. Le chemin exact d'Antoine (d'où il copie la variable) n'a pas pu être rejoué : seul ce défaut-là est reproduit et corrigé.
- Entrée dans une case (02/10, Antoine : « l'appui sur entrer doit descendre d'une cellule et après soit shift entrer soit ctrl entrer pour ajouter une ligne (prendre le standard de Gsheet ou Exel) ») : Entrée descend d'une case et la
  sélectionne (on tape par-dessus, comme avec Tab), dans la même colonne ; sous une case fusionnée sur plusieurs lignes elle va sous la dernière, dans une case fusionnée sur deux colonnes elle entre par la colonne de gauche ; sur des cases
  choisies elle repart de la case où la sélection a commencé ; sur la DERNIÈRE ligne elle ne fait rien (la touche est prise : ni paragraphe vide, ni ligne de tableau ajoutée). Maj+Entrée et Ctrl+Entrée ajoutent une ligne DANS la case
  (le retour à la ligne forcé de TipTap, déjà là ; l'Excel et le PDF le rendent). Dans une liste (puces, numéros, tâches) Entrée garde son sens de liste, sinon on n'y ajouterait jamais un point ; la liste `#` ou celle des expansions
  ouverte garde aussi son Entrée (choisir une ligne). `GridEditor.createEnterExtension` est une extension à part, de priorité normale, rangée dans `js/editor.js` APRÈS StarterKit et AVANT Variables et TextExpansion : TipTap essaie
  les extensions de la dernière rangée à la première, donc ces listes passent d'abord et la liste à puces ensuite ; une bulle « Calcul » sélectionnée (priorité 1000) garde son Entrée. Hors grille, rien ne change. Alt+Entrée reste « Saut de page ».
  Pas de ligne de tableau ajoutée en passant : un choix du produit (une ligne a une hauteur, des traits, peut porter un saut de page). La case d'arrivée est montrée EN ENTIER, jamais sous les bandeaux collés (colonnes en
  haut, lignes à gauche) : voir « Défilement » ci-dessous.
- Défilement : la case et le curseur jamais sous les bandeaux (02/10, Antoine : « Corriger la flèche du haut et Maj+Tab qui cachent le curseur sous le bandeau », carte à laquelle il a répondu « Corriger »).
  ProseMirror amène le curseur dans la vue en ne connaissant que le bord du panneau : les bandeaux collés recouvrent ce qui passe dessous. La flèche du haut, la flèche de gauche, Maj+Tab et Entrée laissaient le curseur (ou toute la
  case) caché sous le bandeau des colonnes ou des lignes, et vers le bas et la droite (flèche du bas, flèche de droite, Tab) la case arrivait coupée par le bord du panneau. `revealSelection` (`js/grid-editor.js`) complète donc son
  défilement APRÈS lui : l'évènement `transaction` de TipTap suit la mise à jour de la vue, et toute transaction qui demande le défilement (`scrollIntoView` : le plugin des tableaux pour une flèche au bord d'une case, Tab et Maj+Tab ;
  ProseMirror pour une flèche que le navigateur traite dans la case ; Entrée, la frappe, Annuler) passe par là. Quand elle a changé de case (la case du curseur n'est plus celle d'après la transaction précédente : `lastCellDom`),
  la case d'arrivée est montrée EN ENTIER ; pour des cases choisies (Maj+flèche), la dernière touchée. Puis le curseur est ramené hors des bandeaux (5 px de marge, comme ProseMirror), même dans une case plus haute ou plus large que
  le panneau ; en arrivant dans une case en la sélectionnant (Entrée, Tab, Maj+Tab), c'est le DÉBUT de la sélection qui reste en vue, pas sa fin ; dans la même case, la tête d'une sélection qu'on étend. Des cases choisies n'ont pas
  de curseur : seule la case où le geste arrive est montrée (une case plus haute ou plus large que le panneau garde son bord haut ou gauche : c'est le défilement de ProseMirror, ramené sous les bandeaux). Dans la même case seul le curseur
  compte : taper ne fait pas défiler une case coupée sur laquelle on vient de cliquer. Remplace `revealCell`, qu'Entrée appelait seule (elle demande maintenant le défilement comme les autres touches).
- Coller un tableau de tableur (02/10, Antoine : « quand on a copié un tableau depuis exel et que l'on veut le Coller dans une grille, actuellement ça colle une image dans la cellule ; moi j'aimerais bien le tableau avec ses
  cellules, etc. y compris les cellules fusionnées et mises en forme si possible ») : Excel pose dans le presse-papiers un tableau HTML, le texte tabulé ET une image de la plage, et `handlePaste` de `js/editor.js` collait l'image.
  Dans une grille, un presse-papiers qui porte un tableau de tableur (la signature d'Excel, de Google Sheets ou de LibreOffice Calc : `GridTable.clipboardHasSpreadsheetTable`) ne passe plus par le collage d'image ;
  `GridTable.cleanPastedHtml` (branché sur `transformPastedHTML` de `js/grid-editor.js`) lit le tableau case par case (`js/grid-table.js`, DOMParser seulement : la mise en forme d'Excel est dans une feuille de style, `class=xl65`,
  celle de Sheets en ligne, celle de LibreOffice en attributs `bgcolor` / `align` / `valign`) et le réécrit en HTML d'éditeur ; le collage de `prosemirror-tables` fait le reste : les cases collées remplacent celles de la grille à partir
  de la case courante, la grille gagne les lignes et colonnes qui manquent (à la taille de leurs voisines), UN Annuler défait tout. Gardé : fusions (colspan, rowspan, une fusion qui couvre une ligne cachée ne couvre que les lignes qui
  restent), fond, gras / italique / souligné / barré, couleur et taille du texte (la taille de départ du tableur n'est pas écrite), alignement horizontal (écrit, ou à droite pour un nombre qui n'en a pas : « Standard » d'Excel) et vertical
  (en haut, au milieu), traits (la règle des traits partagés de `TableBorders` : le trait du bas d'une case est aussi le haut de celle du dessous ; le gris `#cccccc` du quadrillage de Sheets n'est pas un trait choisi), retours à la ligne
  dans la case, liens (http, https, mailto, tel ; un `javascript:` perd son lien et garde son texte). Pas gardé : la police, les traits épais, pointillés ou doubles (un trait fin continu), l'alignement en bas (c'est celui du tableur
  par défaut : la grille garde le sien, le milieu), les largeurs et hauteurs de la source (la grille garde les siennes), les formules et formats de nombre (le texte AFFICHÉ est collé), les images, les tableaux dans une case. Une ligne ou une case
  masquée (`display:none`) ne se colle pas. Hors grille : voir la puce suivante ; les cases copiées dans la grille, un tableau de page web et un tableau d'Excel
  copié « comme image » (HTML sans tableau) passent comme avant, la réécriture ne touche que ce qui porte la signature d'un tableur. Le modèle de cases (`{ width, cols, rows: [{ height, cells }] }`) est le même pour l'import d'un
  classeur .xlsx (sujet 18) : `GridTable.toHtml(model, { sizes: true })` écrit aussi les largeurs et hauteurs. Les presse-papiers des tests sont reconstitués d'après le format réel (le bac à sable n'a pas de tableur) : à revérifier
  avec un vrai Excel.
- Coller un tableau de tableur dans un DOCUMENT (02/10, choix d'Antoine : « Coller aussi un tableau Excel en cases dans un document, hors grille ? » - « Oui, en cases » : un tableau du document, sans l'image). Le même presse-papiers
  d'Excel, de Google Sheets ou de LibreOffice Calc donne, hors grille aussi, un TABLEAU DU DOCUMENT et plus l'image de la plage : `handlePaste` de `js/editor.js` ne retient plus l'image pour la seule grille
  (`GridTable.clipboardHasSpreadsheetTable` vaut pour tout éditeur), et un `transformPastedHTML` des `editorProps` de `js/editor.js` réécrit le HTML par `GridTable.cleanPastedDocumentHtml` (dans une grille c'est le plugin de la grille qui
  réécrit, avec `cleanPastedHtml` : l'éditeur ne touche alors à rien). Le même modèle de cases, une autre sortie : `GridTable.toDocumentHtml` n'écrit que ce que le PDF et le Word d'un tableau de DOCUMENT lisent - fusions, fond, texte
  (gras, italique, souligné, barré, couleur, taille), alignement horizontal, liens, retours à la ligne et LARGEURS des colonnes (`colwidth`, `<colgroup>`, largeur du tableau : il garde les proportions du tableur) - et ni traits case par case
  (`data-border-*`), ni alignement vertical (`data-valign`), ni hauteur de ligne (`data-row-height`) : le PDF et le Word ne les lisent que pour une grille, l'éditeur les montrerait et l'export non ; une ligne qui porte `data-row-height` fait
  d'ailleurs traiter le tableau en grille. Un tableau plus large que la page (douze colonnes de 100 px) revient à la page par `clampOverflowingTables` en Aperçu A4, la vue de départ : rien ne dépasse dans l'éditeur, donc nulle part ; UN Annuler
  défait le collage (la correction de largeur rejoint l'évènement d'historique du collage). Le curseur dans une case d'un tableau du document : le tableau d'Excel remplit les cases à partir de celle du curseur (collage de `prosemirror-tables`,
  comme tout tableau collé dans un tableau), sans second tableau dedans. Ctrl+Maj+V (coller sans mise en forme) colle le TEXTE de la plage, ni tableau ni image ; une image seule (aucun tableau dans le presse-papiers), un tableau de page web
  et du texte passent comme avant. Pas gardé, comme dans une grille : la police, les traits (le tableau du document a ceux de l'éditeur), les formules et formats de nombre (le texte AFFICHÉ est collé). Vérifié au vrai Ctrl+V avec un vrai
  presse-papiers de Chromium (`dev-tests/verify-doc-paste-mouse.mjs`) ; les presse-papiers des tests sont toujours reconstitués d'après le format réel : à revérifier avec un vrai Excel.
- Importer un classeur Excel (02/10, Antoine : « Prévoir un Import Excel pour le modèle Grille »), le contraire de l'export : la ligne « Importer un Excel… » du menu « + » (juste après « Nouvelle grille », grisée en lecture seule avec tout le
  groupe) ouvre le sélecteur de fichier du navigateur (`.xlsx` / `.xlsm`, un seul fichier) ; le classeur devient une NOUVELLE grille, sans nom et pas enregistrée (comme « Nouvelle grille » : « Nommez le modèle puis enregistrez-le »). Un
  document modifié ouvre « Modifications non enregistrées » APRÈS la lecture du fichier et le choix de la feuille (un fichier illisible ne demande rien ; « Annuler » garde le document). Plusieurs feuilles visibles : une LISTE (choix
  d'Antoine du 02/10, carte « Choisir la feuille à importer quand un classeur Excel en a plusieurs ? » : « Oui, une liste »), la liste avec recherche des autres listes du widget (`SearchSelect.attachSheets` : « Rechercher une feuille… »,
  « Aucune feuille ne correspond. »), posée sous le « + » une fois le classeur lu, avec les noms des feuilles visibles dans l'ordre d'Excel (la masquée n'y est pas) ; la feuille choisie devient la grille (le message dit laquelle : « Feuille
  « X » (2 sur 3) importée… Les autres ne le sont pas. ») ; Échap ou un clic ailleurs referme la liste sans rien importer ni demander (le coin d'état, vidé pendant la liste, redit l'état du modèle par `updateSaveStatus`, le focus revient dans
  le texte) ; une seule feuille visible, ou toutes masquées (la première est prise), s'importe tout de suite, sans liste ; une feuille vide ou trop grande qu'on vient de choisir le dit en rouge, par son nom (« La feuille « Vide » ne contient
  aucune case à importer. »). Si la liste ne peut pas s'ouvrir, la première feuille est prise, comme avant la liste. `js/grid-xlsx-import.js` (`GridXlsxImport` : `openFile` (le classeur lu UNE fois : ses feuilles visibles et
  `build(rang, { lang })`), `chooseSheet`, `importFile`, `fromArrayBuffer`, `buildModel`, `chooseFile`) lit le classeur avec ExcelJS (chargé à la demande, comme l'export), en fait le modèle de cases de `GridTable` (le même que le collage, sujet 17) et le rend par
  `GridTable.toHtml(model, { sizes: true })` ; `js/xlsx-number-format.js` (`XlsxNumberFormat`) écrit le texte que le format de la case donne (« #,##0.00\ "€" », « dd/mm/yyyy », zéros de tête, sections, pourcentages) dans la langue du widget
  (virgule décimale et espace insécable des milliers en français) : un .xlsx ne garde que la valeur brute et le code du format.
  Lu : largeurs (`w × 7 + 5` px, 24 au moins), hauteurs (`pt / 0,75`), fusions (une ligne que des fusions couvrent entièrement reste, avec sa hauteur), fonds (couleur, thème avec sa nuance calculée en HLS, palette indexée), texte (gras, italique,
  souligné, barré, couleur, taille, texte riche, retours à la ligne ; la police n'est pas gardée ; un noir ou « automatique » ne s'écrit pas, le texte suit le thème), alignement horizontal (écrit, sinon les règles de « Standard » : nombre et
  date à droite, booléen et erreur au centre) et vertical (haut ou bas ; le milieu, celui de la grille, sinon), traits (côté par côté, puis la règle des traits partagés de `TableBorders` ; le gris `#777777` que l'export écrit sur toute case est
  le trait par défaut, pas un choix), liens (http, https, mailto, tel ; un `javascript:` perd son lien), résultat des formules (la formule n'est pas gardée). Une feuille, une ligne ou une colonne masquée ne vient pas ; l'étendue lue est celle du
  contenu OU de l'apparence (fond, trait) et des fusions. Pas gardé : images, graphiques, mises en forme conditionnelles, validations, commentaires, volets figés, formules, police, traits épais ou pointillés (un trait fin continu), les feuilles qu'on n'a pas choisies.
  Limites : 1 000 lignes, 100 colonnes et 5 000 cases (une frappe dans une grille de 5 000 cases coûte ~120 ms) ; un .xls ou un classeur protégé par un mot de passe (conteneur OLE `D0 CF 11 E0`), un fichier qui n'est pas un classeur et un classeur
  sans case disent pourquoi (`status.xlsxImport*`, en rouge) et ne changent rien. Deux leçons : (1) la grille arrive PRÊTE (alignement vertical écrit, traits résolus) : sans cela l'éditeur corrigeait chaque case par une transaction à part
  et tiptap rejoue `getChangedRanges` en O(n²) (20 000 cases : 94 à 122 s, maintenant 5 s) ; (2) `loadTemplateIntoEditor` retire `a4-preview` avant de charger une grille (`clampOverflowingTables` ramenait les colonnes d'une grille large à la
  largeur de la page A4 quand on venait d'un document : 36 px par colonne ; cela corrige aussi la réouverture d'une grille large enregistrée).
- Pas dans la première version : boucles sur une ligne de grille, formules, volets figés, images en calque, en-tête/pied/numéros de page, conversion document ⇄ grille.

## Lots

| Lot | Contenu | État |
|---|---|---|
| 0, 0b | Orientation dans `PageLayout` (clé `orientation` de la colonne `Margins`) et bouton portrait / paysage (`js/orientation-toggle.js`) | en ligne (01/10) |
| A1 | La grille dans l'éditeur : type, garde-fou, bandeaux et poignées, barre grisée, barre de la case, enregistrement | en ligne (01/10, `654f926`) |
| A2 | Lecture et PDF d'une grille (sans feuille A4, `rowHeight` et `colwidth` respectés, texte au milieu de sa case, grille plus large que la page ramenée à la largeur) | en ligne (01/10, `418e609`) |
| B1 | Barre de la case : fusion et scission, alignement vertical ; cases fusionnées dans le PDF (`rowSpan`) et colonnes mesurées sur une case simple | prêt (01/10) |
| B2 | Barre de la case : bordures (menu, règle commune `js/table-borders.js`, éditeur, Lecture, PDF, Excel) | prêt (01/10) |
| B3 | Quadrillage montré ou masqué en Lecture et dans les exports (ligne à cocher du menu « Bordures », `gridLines` du tableau, bord `auto`) | prêt (08/10) |
| C | Saut de page porté par la ligne (bouton, marqueur, PDF : nouvelle page, Excel : nouvelle feuille) ; bascule portrait / paysage et format active pour `grille` (`OrientationToggle.TYPES`) | prêt (01/10) |
| D | Export Excel d'un enregistrement (ExcelJS 4.4.0, cdnjs, chargé à la demande) : ligne « Exporter en Excel… » du menu Qualité PDF, grisée hors grille ; les deux lignes Word grisées dans une grille | en ligne (01/10) |
| E | « Exporter toutes les valeurs de la table » : une archive ZIP d'un classeur par valeur et un classeur unique d'une feuille par valeur ; dans une grille, « lignes » devient « valeurs de la table » (lot PDF compris) ; « Nouvelle grille » visible sans `?dev` (second commit, séparé) | en ligne (01/10) |
| Import | Importer un classeur Excel dans une NOUVELLE grille : ligne « Importer un Excel… » du menu « + », une feuille lue case par case (`js/grid-xlsx-import.js`, `js/xlsx-number-format.js`) ; sujet 18 du 02/10 | en ligne (02/10) |
| Import 2 | Liste des feuilles à l'import : un classeur à plusieurs feuilles visibles demande laquelle devient la grille (liste avec recherche sous le « + », Échap = rien d'importé) ; carte du 02/10, « Oui, une liste » | en ligne (02/10) |

## Export Excel (lots D et E) : correspondances retenues

- Largeur de colonne `(px − 5) / 7` ; hauteur de ligne `px × 0,75` ; quadrillage masqué ; orientation et « ajuster à la largeur » dans la mise en page de la feuille.
- Texte riche : une suite de segments (gras, italique, souligné, barré, couleur, taille, police) ; surlignage et fond seulement quand ils couvrent toute la case ; titres → gras + taille ;
  listes écrites « • », « 1. », « ☐ » ; image posée sur la case, à sa taille.
- Nombres et dates : valeur typée seulement si la case ne contient que cela (format d'affichage de la bulle conservé), sinon texte.
- Saut de page : ligne portant le saut (`data-page-break-before`) → nouvelle feuille, nommée « <nom> (2) », « <nom> (3) »… (31 caractères au plus) ; mêmes largeurs, même mise en page, lignes recomptées depuis 1 ;
  dans le classeur unique à la suite de la feuille de la même valeur. Papier de la feuille : A3 8, A4 9, A5 11, A6 70 (codes `paperSize` d'OOXML), sens du modèle.
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
  Collage dans une case (02/10) : un texte qui finit par un retour à la ligne, une variable suivie de paragraphes vides, les lignes du milieu gardées et des lignes vides seules qui ne collent rien, un tableau copié qui passe
  toujours par ses cases, un document inchangé (4 cas, trois échouent sur l'ancien code).
  Entrée (02/10) : descend d'une case et sélectionne son texte, dernière ligne (rien ne bouge), cases fusionnées (dessus, dessous, sur deux colonnes), Maj+Entrée et Ctrl+Entrée = une ligne dans la case (un Annuler chacune),
  liste (un point de plus, sortie sur un point vide, puis la case du dessous), liste `#` ouverte qui garde son Entrée, cases choisies, document inchangé, case d'arrivée toute visible sous les bandeaux dans un plan étroit (9 cas : six échouent sans l'extension, celui de la liste `#` échoue aussi quand l'extension est rangée après Variables, celui du défilement sans `revealSelection`).
  Défilement (02/10) : flèche du haut, flèche de gauche et Maj+Tab (la case d'arrivée toute visible sous les bandeaux), Tab, flèche du bas et flèche de droite (jamais coupée au bord), Maj+flèche (la case où le geste arrive), la frappe (ramène le curseur caché sous le bandeau, ne fait pas défiler une case coupée cliquée), des cases choisies qui s'étendent jusque dans une case plus haute et plus large que le panneau (bord haut et gauche), Entrée dans une case plus haute que le panneau (début du texte en vue : texte court au milieu, texte long en haut) : 6 cas, tous en échec sur l'ancien code.
- `dev-tests/scenarios-grid-table.js` (groupe `gridTable`, 18 cas, sujets 17 et « tableau collé en cases dans un document » du 02/10) : le presse-papiers d'Excel (HTML à feuille de style, texte tabulé et image), de Google Sheets et de LibreOffice Calc, reconstitués ; la
  reconnaissance (une page web, des cases copiées dans la grille, un texte et une plage copiée « comme image » ne sont jamais réécrits), la lecture case par case des trois (fusions, fond, traits, alignements, marques, largeurs et
  hauteurs), un HTML bancal (fusion qui dépasse, ligne courte, script, image, lien `javascript:`, tableau démesuré), les lignes et cases masquées, le HTML d'éditeur relu dans une grille avec ses tailles ; puis le vrai collage (un
  évènement `paste` avec HTML, texte et image) : les cases et aucune image, la grille qui garde ses tailles, UN Annuler, la grille qui grandit au bord, Sheets et LibreOffice, des cases copiées dans la grille, une page web ; puis, dans
  un DOCUMENT : le tableau d'Excel (cinq lignes, fusions, fond, texte, largeurs, ni trait ni alignement vertical ni hauteur de ligne, rien qui le fasse prendre pour une grille, UN Annuler), Sheets et LibreOffice, un tableau de page web
  intact, une image seule et du texte seul qui se collent comme avant, `toDocumentHtml` (largeurs gardées, hauteurs, traits et alignement vertical jamais écrits), le curseur dans une case d'un tableau du document, une plage de douze
  colonnes ramenée à la page en Aperçu A4. Le script Node `dev-tests/verify-doc-paste-mouse.mjs` (groupe `docPasteMouse`, 27 mesures) refait le parcours au vrai Ctrl+V, Ctrl+Maj+V et Ctrl+Z avec le vrai presse-papiers de Chromium, à 700×400,
  en clair et en sombre (il expose les presse-papiers du fichier ci-dessus par `window.GridTableFixtures`).
- `dev-tests/scenarios-xlsx.js` (groupe `xlsx`, 31 cas, lots D, E, B2 et C) : le .xlsx produit est dézippé et son OOXML relu (colonnes et lignes, cases typées, formats FR et EN, texte riche, couleurs, fusions et filets, paragraphes
  et listes, liens, images, nom de feuille et mise en page, paysage, ligne répétée par une zone « ligne », document sans tableau, menu grisé, clic de la ligne Excel et alerte sans ligne sélectionnée) ; lot E : l'archive ZIP (un classeur par valeur), le classeur unique (une feuille par valeur, noms valides et distincts), une valeur qui échoue en cours de feuille,
  un bloc de texte conditionnel dans une case (résolu comme à la Lecture), les mots d'une grille (français et anglais, document inchangé, changement de langue) et le PDF unique d'une grille ; relu une fois par openpyxl à l'écriture du lot D
  (LibreOffice n'a pas de module Calc dans ce bac à sable).
- `dev-tests/scenarios-grid-import.js` (groupe `gridImport`, 22 cas, sujet 18 du 02/10 puis la liste des feuilles) : des classeurs fabriqués octet par octet « comme Excel les écrit » (un zip d'OOXML : le bac à sable n'a pas d'Excel, et ExcelJS n'écrit ni un trait d'un seul
  côté ni un style par case) et lus dans la VRAIE grille chargée : la ligne du menu et son sélecteur ; une facture case par case (fusions, fond du thème avec sa nuance, traits partagés, texte riche, euros, date, formule) ; le texte d'Excel dans
  la langue du widget ; les alignements écrits et ceux de « Standard » ; les liens sûrs (dans l'éditeur ET dans le HTML de l'import : l'éditeur refuse déjà un `javascript:`, l'import ne doit pas le lui transmettre) ; feuilles, lignes et colonnes
  masquées ; largeurs et hauteurs ; lignes couvertes par des fusions ; une grille qui arrive prête (nombre de pas des transactions) et une grille large qui garde ses largeurs venant d'un document et à la réouverture ; les erreurs en français
  et en anglais et les limites (rien ne change) ; la confirmation posée après la lecture du fichier ; un résultat neuf, sans nom, enregistrable ; la lecture seule ; l'aller-retour avec l'export Excel (même grille). La liste des feuilles (7 cas) : les noms dans l'ordre d'Excel sans la feuille masquée, la recherche (accents et casse ignorés, « Aucune feuille ne correspond. », en
  anglais aussi), le clic et Entrée ; Échap et le clic ailleurs (rien d'importé, aucune question, état du modèle redit, focus rendu, rien dans la page) ; une seule feuille visible ou toutes masquées sans liste ; la question « Modifications non
  enregistrées » après le choix de la feuille ; une feuille vide ou trop grande nommée dans l'erreur ; `openFile` et `build` ; la liste en panne (la première feuille).
- `dev-tests/unit-xlsx-number-format.mjs` (script Node `xlsxNumberFormatUnit`, 65 vérifications) : le texte qu'Excel montre pour une valeur (euros, pourcentages, milliers, zéros de tête, sections, comptabilité, devises, « Standard », dates et heures,
  français et anglais, formats abîmés) ; les attendus sont ceux d'Excel, pas ceux de la fonction.
- `dev-tests/verify-grid-import-mouse.mjs` (script Node `gridImportMouse`, 91 mesures) : à 700×400, clair, sombre et anglais, au vrai survol, au vrai clic et avec un VRAI sélecteur de fichier (`filechooser` de Playwright, armé avant le clic) : la ligne du
  menu après « Nouvelle grille », dans le panneau, lisible ; le sélecteur réduit aux classeurs ; « Annuler » ; une facture fabriquée par ExcelJS qui devient une grille visible (bandeaux atteignables, largeurs d'Excel, fond du titre, message de fin en
  entier) ; un fichier illisible ; « Modifications non enregistrées » après le choix du fichier et de la feuille, « Annuler » puis « Abandonner » au vrai clic. La liste des feuilles : sous le « + », dans le panneau, une ligne atteignable et lisible (contraste ≥ 4,5 : 1), la
  recherche tapée au vrai clavier, Échap et un clic dans le texte (rien d'importé, focus rendu), un vrai clic sur « Facture » et Entrée après « fact ».
- Preuves sur l'ancien code du sujet 18 : 26 règles de l'import retirées une à une du code, chacune fait échouer au moins un cas de `gridImport` (celle du lien sûr, qui survivait parce que l'éditeur refuse déjà un `javascript:`, a obtenu la lecture du
  HTML de l'import) ; 16 sur 16 pour le moteur des formats ; 6 règles du menu et du geste retirées du code font échouer le script à la souris. Preuves de la liste des feuilles : 19 règles retirées une à une (fermer sans choisir qui importe quand même, le coin d'état resté sur « Lecture… », l'état
  du modèle non redit, le focus non rendu, la feuille masquée proposée, toujours la première feuille, la question avant la liste, l'erreur sans le nom de la feuille, la liste en panne qui ne prend rien, les textes par défaut, la première feuille
  déjà choisie au départ, la fermeture qui passe avant le choix, la liste qui reste dans la page, la liste pour une seule feuille, aucune feuille quand toutes sont masquées, la langue non transmise, le « + » non pris pour ancre) font toutes échouer
  au moins un cas ; sur l'ancien code 6 cas sur 8 échouent (les deux autres gardent l'ancien comportement : une feuille visible sans liste, la liste en panne).
- `dev-tests/verify-grid-mouse.mjs` (script Node `gridMouse`) : les mêmes gestes à la vraie souris et au vrai clavier à 700×400, clair et sombre, avec la molette et les contrastes ;
  la Lecture d'une grille large au vrai bouton « Lecture » (colonnes gardées, défilement horizontal, texte au milieu, bulle résolue, pas de ligne vide, contraste du texte) ;
  lots D et E : les menus d'export au survol (cinq lignes dans « Qualité PDF » et deux dans « Exporter en PDF », atteignables dans le panneau, grisées selon le type de modèle, contraste), un vrai clic sur « Exporter en Excel… »
  qui télécharge un .xlsx, un vrai clic sur les deux lignes « toutes les valeurs » (confirmation dans le panneau, puis l'archive ZIP et le classeur unique) et un vrai clic sur une ligne grisée qui ne télécharge rien.
- `dev-tests/verify-table-select-mouse.mjs` (script Node `tableSelectMouse`, 67 mesures) : glisser pour sélectionner des cases à la vraie souris à 700×400, clair et sombre, tableau de document puis grille : rectangle exact dans six sens, sur du contenu réel (bulles, zone répétée,
  condition, liens, images, cases fusionnées, suivi allumé, barre ouverte), voile visible sur une case colorée et texte lisible, défilement tenu au bord du panneau (document, grille de 15 lignes, grille de 12 colonnes), barre de la case dans sa bande qui ne recouvre aucune case (48 glissés), un clic sur
  la barre agit une fois, Entrée et Espace aussi, Lecture, hors grille la barre flotte comme avant. 40 de ces 67 mesures échouent sur le code d'avant (`0dc5e4c`).
- Lot B2 : le groupe `grid` (section 10 de `scenarios-grid.js`, 8 cas) - la règle des bords, un réglage écrit les deux cases d'un trait partagé en un Annuler, un côté de case fusionnée = un groupe, fusion et scission, ligne et colonne ajoutées en bout et au milieu, enregistrement et relecture dans l'éditeur et la Lecture, et deux cas PDF lus sur les traits peints (`h.extractPdfLines`) ; trois cas du groupe `xlsx` (couleur et « pas de trait », HTML en désaccord, bloc fusionné) ; `dev-tests/verify-grid-borders-mouse.mjs` (script Node `gridBordersMouse`, 57 mesures) : le menu à la vraie souris à 700×400, clair et sombre. Chaque correction retirée seule fait échouer un de ces cas (preuves sur l'ancien code faites à l'écriture du lot).
- Lot C : le groupe `grid` (section 11 de `scenarios-grid.js`, 9 cas, et un cas d'enregistrement du sens et du format) - le bouton pose et retire le saut avant la ligne visée (Annuler, enregistrement, relecture, libellé), grisé sur la première
  ligne et au milieu d'une case fusionnée, un saut devenu impossible retiré par le document, le marqueur (trait en tirets, pastille, rien en Lecture), les mots dans les deux langues, le PDF (une page par saut, mêmes colonnes sur
  chaque page, un saut qui laisserait une page vide ou couperait une case fusionnée ignoré, le sens et le format de la page d'une grille) ; cinq cas du groupe `xlsx` (feuille « nom (2) », saut ignoré, classeur unique, retour arrière de toutes les
  feuilles d'une valeur, papier et sens) ; `dev-tests/verify-grid-pagebreak-mouse.mjs` (script Node `gridPageBreakMouse`, 65 mesures) : le bouton, le trait en tirets lu sur les pixels, la pastille et la poignée, « Fusionner » grisé,
  le bouton portrait / paysage dans une grille, à la vraie souris à 700×400, clair et sombre. Sur 19 corrections retirées une à une du code, 18 font échouer un de ces cas (preuves sur l'ancien code faites à l'écriture du lot) ; la dernière, un objet de réglages neuf pour chaque feuille de l'Excel
  par prudence (ExcelJS peut garder une référence à ceux qu'on lui donne), n'a aucun effet que l'on puisse observer : elle n'a pas de preuve et le code le dit.
