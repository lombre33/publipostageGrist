# Publipostage+ : notes de version, partie Grist Factory Suite

> Document en attente, **non publié** : il reste dans `outils/depot-propre/en-attente/` et ne part pas avec `publier.sh`. Il complète la note de version du widget seul (`PATCH_NOTES.md`) ; pour le publier, le poser dans `outils/depot-propre/public/` et l'ajouter aux listes de `controles.mjs`.

**Publipostage+ {{VERSION}}**, publiée le {{DATE_FR}}. Cette partie liste, une puce par fonction, ce qui demande en plus Grist Factory Suite (GFS), la suite d'applications de Grist Factory où le widget peut aussi tourner.

Ces fonctions chargent des bibliothèques que le widget seul ne charge pas, et GFS les fournit. Hors de GFS, leurs commandes sont grisées, avec leur raison, et un clic explique comment passer par GFS.

## Sommaire

- [Nouveautés](#nouveautés)
  - [Présentations (Slides+)](#présentations-slides)
  - [Graphiques](#graphiques)
  - [Écriture en direct](#écriture-en-direct)
  - [Lecture de PDF](#lecture-de-pdf)
  - [Intégration à GFS](#intégration-à-gfs)
- [Corrections](#corrections)

## Nouveautés

### Présentations (Slides+)

#### Le modèle et la bande des diapositives

- **Les présentations, un cinquième type de modèle** : « Nouvelle présentation », au menu « + », ouvre le même éditeur que le document (titres, listes, colonnes, tableaux, images, variables, conditions, en-tête et pied de page, Lecture, exports) sur une diapositive 16:9 en paysage.
- **Format de la diapositive** : le menu Page propose Grand écran (16:9), Standard (4:3), Écran 16:10 et Carré (1:1).
- **Bande des miniatures** : une miniature par diapositive, à gauche du texte ; le menu ⋯ d'une miniature (ou clic droit, ou Maj+F10) ajoute, duplique, monte, descend ou supprime une diapositive, « Ajouter » en pose une vide, et tout se défait d'un Ctrl+Z. Au clavier, la bande est une liste (↑ ↓, Ctrl+↑ Ctrl+↓ pour déplacer, Suppr).
- **Point rouge sur une miniature** : une diapositive dont un cadre dépasse de la page le signale.
- **Masquer une diapositive** : « Masquer la diapositive » (menu ⋯) la sort du diaporama sans la supprimer (la Lecture, le PDF et le Word la gardent) ; sa miniature est atténuée, avec un œil barré.
- **Passage automatique à la suivante** : le groupe « Passage à la suivante » de la fenêtre « Transition… » fait avancer le diaporama seul au bout de 2, 3, 5, 10, 15 ou 30 secondes, ou d'une minute.
- **Notes de l'intervenant** : « Notes… » (menu ⋯ d'une miniature) garde ce qu'on dira en présentant (10 000 caractères au plus) ; elles sortent en PowerPoint.
- **Un fond par diapositive** : « Fond… » (menu ⋯) choisit une couleur unie dans la palette commune, avec un avertissement quand le texte noir ne se lirait pas sur ce fond.
- **Une transition par diapositive** : « Transition… » règle comment la diapositive apparaît au diaporama (fondu, poussée, balayage, recouvrement, dévoilement, zoom, ou aucune), son sens et sa durée (de 0,3 à 2 s).
- **Cinq transitions de plus** : division, stores, cercle, losange et croix.
- **Importer une diapositive d'une autre présentation** : le volet « Importer » de la bande copie une diapositive entière d'une autre présentation du document.
- **Page de document en diapositives** : le volet « Importer » pose une page d'un document du modèle en diapositives, avec la case « Garder liée » pour qu'elle suive le document.
- **Diapositive en texte dans un document** : « Diapositive d'une présentation… », au menu « Lien et blocs de contenu » d'un document, pose le texte d'une diapositive, avec la case « Garder liée ».
- **Macro-modèle mêlant pages A4 et diapositives** : une présentation garde sa page de diapositive 16:9 au milieu des pages A4 des autres modèles d'un macro-modèle (Lecture, Word, impression et PDF, un seul fichier ; le PDF protégé ne mêle pas les formats).

#### Les objets d'une diapositive

- **Bouton « Objets »** dans la barre du haut, derrière « Image » : cadre de texte, tableau, vue d'une autre diapositive, formes et lignes.
- **Cadres de texte libres** : un cadre se pose au centre de la diapositive, se déplace, se redimensionne et se règle (fond, trait) ; le menu « Ordre » le met au premier plan, à l'arrière-plan ou derrière le texte.
- **« Derrière le texte »** : le cadre passe sous le texte de la diapositive (un titre sur un grand rectangle de couleur).
- **Formes** : le menu « Objets » range 64 formes en quatre onglets (Courantes, De base, Flèches, Étoiles et bulles), et l'éditeur dessine les 187 formes prédéfinies de PowerPoint avec les réglages de leurs poignées.
- **Lignes et flèches** : une ligne droite, une ligne avec une flèche à la fin, une ligne avec une flèche à chaque bout.
- **Pointes de flèche** : le menu « Extrémités » règle la forme (cinq), la largeur et la longueur de la pointe de chaque bout.
- **Style du trait** : onze motifs (plein, points, tirets de plusieurs longueurs…) et des bouts ronds, carrés ou plats.
- **Trait composé** : double, fin puis épais, épais puis fin ou triple.
- **Transparence du fond et du trait** : une glissière de 0 à 100 sous la palette des menus « Couleur de fond » et « Couleur du trait ».
- **Faire pivoter** : une poignée ronde au-dessus d'un cadre ou d'une forme le fait tourner autour de son centre, Maj le tient sur des angles ronds.
- **Texte tourné d'un quart de tour** : le bouton « Orientation du texte » lit le texte de haut en bas (90°) ou de bas en haut (270°).
- **Colonnes de texte d'un cadre** : de une à quatre colonnes qui se suivent.
- **Taille du texte neuf** : le texte neuf d'une diapositive est à 20 pt, les titres vont de 44 pt (Titre 1) à 21 pt.
- **Vue d'une autre diapositive** : « Vue… » (menu « Objets ») pose dans un cadre la vue en direct d'une autre diapositive, qui mène à elle au clic.
- **Tableau dans un cadre** : un tableau local, ou la copie liée en direct d'un modèle Grille.
- **Sélection multiple, alignement et répartition** : plusieurs objets se choisissent, s'alignent et se répartissent d'un coup ; Ctrl+D duplique l'objet sélectionné.
- **Repères au glissé** : en déplaçant, l'ensemble s'accroche (à 6 pixels) aux bords et aux centres des autres objets et de la diapositive, un trait rose le dit, Alt suspend l'accroche.
- **Groupes d'objets** : Ctrl+G (ou « Grouper ») range les objets choisis dans un groupe, Ctrl+Maj+G le défait.
- **Animation d'un objet** : « Animation… » règle l'effet (apparition, fondu, volée, balayage, zoom), son type (entrée ou sortie), son côté, son départ (au clic, avec ou après la précédente), sa durée et son délai, joués au diaporama.
- **Lien d'un objet** : « Lien… » fait mener un bouton, une forme ou une image à une adresse web, un courriel, un téléphone ou une diapositive, avec l'animation de son choix (« Animation au clic »).
- **Un lien mène à n'importe quelle diapositive** : « Diapositive, titre ou signet » liste d'abord les diapositives ; les actions « suivante », « précédente », « première », « dernière » et « dernière vue » existent aussi. Le PDF, le Word et le HTML (d'une ligne ou en lot) gardent la cible du lien.

#### Thèmes

- **Thème d'une présentation** : « Thème… » (menu Page) choisit parmi sept thèmes prêts (Océan, Hélianthe, Forêt, Bordeaux, Soleil, Ardoise, Éditorial) ou l'aspect d'origine, avec police des titres, police du texte et neuf couleurs ; le texte recoloré suit le thème.
- **« Enregistrer comme thème… »** : range le thème dans la liste du document (douze au plus), que toutes ses présentations retrouvent.
- **Décor du thème** : « Décor… » pose un bandeau, un logo, le numéro de page et un texte de pied sur toutes les diapositives ; le bandeau suit les couleurs du thème.

#### Diaporama

- **Présenter** : un menu ▾ à côté du ▶ lance depuis le début (F5) ou depuis la diapositive du curseur (Maj+F5), avec un interrupteur « Plein écran ».
- **Diaporama dans une fenêtre à part** : quand le cadre du widget refuse le plein écran, le diaporama s'ouvre dans sa propre fenêtre, qui prend tout l'écran.
- **Vue intervenant** : la fenêtre du diaporama se pose sur l'écran du public, le widget devient la console avec la diapositive en cours, la suivante, les notes, un chrono et « Aller à… ».
- **Écran noir (B), écran blanc (W) et stylo** : trois boutons de la console, et un bouton d'effacement.

#### Import et export PowerPoint

- **Import PowerPoint** : « Importer un PowerPoint… » (menu « + ») ouvre un fichier `.pptx`, `.ppsx` ou `.potx` comme une nouvelle présentation, à la page du fichier, avec un compte rendu qui dit tout ce que le fichier demande et que l'éditeur ne sait pas encore faire.
- **Ce que l'import reprend** : toutes les formes de PowerPoint et leurs réglages, les formes libres, les connecteurs coudés ou courbes, les images telles qu'elles s'affichent (rognage, bordure, ombre, recoloration), le thème, la transparence d'un fond ou d'un trait, les traits composés, en tirets et leurs bouts, les retraits, l'interligne et les espaces entre paragraphes, les tabulations, les animations d'objets, les liens et les textes alternatifs, les liens vers une autre diapositive, les objets masqués, les diapositives masquées et leur minutage, les notes de l'intervenant, les commentaires (dans les notes de leur diapositive) et le nom des sections.
- **Export PowerPoint (bêta)** : le menu « Type d'export » propose « PowerPoint (bêta) » pour une présentation, pour une ligne ou un fichier par ligne dans une archive ZIP ; les liens, les animations, les diapositives masquées, le passage automatique et les graphiques créés sont écrits en natifs.
- **Galerie : « Présentation commerciale »** de 39 diapositives, refaite avec les outils de Slides+ (formes, traits en tirets et doubles, cadres tournés, deux colonnes, tableaux, graphiques).

### Graphiques

- **« Créer un graphique… »** (menu de l'image) : un graphique tracé d'après une table de Grist (la table de la page ou une autre), dans un document, une grille ou une diapositive. Dix formes : barres (empilées ou horizontales), courbe, aire, nuage de points, secteurs, anneau, radar, entonnoir, cascade et jauge.
- **Aspect du graphique** : un titre (qui devient son texte alternatif), cinq jeux de couleurs, les valeurs affichées et des barres mêlées à une courbe.
- **Graphiques modifiables dans Word, PowerPoint et Excel** : exporté, un graphique créé devient un graphique natif de ces logiciels, avec ses données (barres, courbe, aire, nuage, secteurs, anneau, radar, barres mêlées à une courbe, cascade) ; l'entonnoir et la jauge restent des images.
- **Graphique de la page** : « Graphique de la page… », au menu « Lien et blocs de contenu », pose dans le document un graphique réglé dans Grist (type, colonnes, tri, filtres) ; il se redessine quand la ligne change, dans l'éditeur, la Lecture et les exports.

### Écriture en direct

- **Écriture en direct** : plusieurs personnes écrivent en même temps le texte d'un même modèle Document, chacune voyant le curseur et le nom des autres, une barre dit qui est là et une seule personne enregistre (ligne « Écriture en direct » du menu « Édition collaborative »).
- **Elle s'allume toute seule** pour les personnes qui ont le modèle ouvert, sans question, sans rien remplacer de ce qu'elles ont sous les yeux.
- **Présentations en direct** : le texte des diapositives, les cadres libres et les lignes, le fond, la transition et les notes, les diapositives ajoutées, déplacées ou supprimées passent d'une personne à l'autre.
- **La page se partage aussi** : format, sens, marges, thème et décor, filigrane, couleurs et mises en forme gardées.
- **Pastille sur la bande** : sous la miniature de la diapositive où quelqu'un écrit, une pastille de sa couleur, avec son nom au survol.

### Lecture de PDF

- **Lire un PDF que GFS garde** : « Lire » sur un PDF de l'explorateur de GFS l'ouvre dans le mode Lecture du widget ; la première page s'affiche aussitôt, le texte se sélectionne et se copie, un PDF protégé demande son mot de passe.

### Intégration à GFS

- **Ranger les PDF parmi les fichiers de GFS** : la section « Destination du PDF » du menu « Exporter » choisit de télécharger, de ranger dans GFS ou les deux.
- **Ambiances de GFS** : la barre d'outils, les menus et les fenêtres prennent l'ambiance choisie dans GFS (Grist Factory, Pop, Papier, Brut, Néon) et sa couleur ; la page, le PDF et les exports gardent l'aspect du modèle.
- **Ouvrir ou créer un modèle depuis l'explorateur de GFS** : un double-clic ouvre le modèle désigné ; « Nouveau » ouvre un modèle vierge du type choisi, et « Nouveau > Importer » importe le fichier Excel, Markdown ou PowerPoint que GFS donne.
- **Langue et préférences de GFS** : la langue est celle de GFS (un seul choix pour toutes ses applications) et les préférences de chaque personne sont gardées par GFS.
- **La barre de GFS** : les fenêtres, la bande des diapositives, les menus, les info-bulles, le logo et la sortie de la Lecture épurée se placent à côté de la barre de GFS, à quelque bord qu'elle soit posée.
- **Impression et liens dans le cadre isolé de GFS** : l'impression par le navigateur passe par la page du widget, et les liens `mailto:` et `tel:` s'ouvrent dans un nouvel onglet.

## Corrections

- **Présentations plus fluides** : une présentation s'ouvre plus vite, supprimer une diapositive ne refait plus les blocs des suivantes, l'interface cachée des cadres ne se construit qu'au premier besoin, écrire dans un cadre ou le déplacer ne refait plus la pagination, et la souris ne fait plus ramer l'éditeur au-dessus d'un cadre derrière le texte.
- **Graphiques plus légers** : à l'ouverture, seuls les graphiques qu'on voit se dessinent, les autres se dessinent au repos, un à la fois ; un graphique déjà dessiné n'est plus redessiné à chaque Lecture, retour en édition ou départ du diaporama ; défiler ne saccade plus quand un graphique arrive à l'écran.
- **Le diaporama ne rame plus**, ses effets jouent enfin dans la fenêtre à part, et sa barre du bas se voit devant la diapositive.
- **Le stylo de la vue intervenant trace un trait lissé**, plus en escalier.
- **Le calcul des pages ne dépend plus du défilement** : la vue ne saute plus à la frappe.
- **Liens vers une diapositive** : ils mènent à elle même quand elle commence par une liste, un bloc de code, un trait, une image seule, un tableau seul, un encadré, des colonnes ou un sommaire, et dans un macro-modèle.
- **Import PowerPoint** : les tableaux sont posés librement à leur place exacte dans un cadre, un graphique masqué est compté, le nom de chaque section s'écrit en tête des notes de sa première diapositive, et les commentaires qui se citent en rond sont tous gardés.
- **Écriture en direct** : une personne qui rejoint après un enregistrement du groupe n'est plus bloquée par un faux « modifié ailleurs ».
- **Graphique de la page** : la miniature d'une diapositive montre le dessin, plus le cadre pointillé.
- **Un modèle renommé dans l'explorateur de GFS garde son nouveau nom.**
