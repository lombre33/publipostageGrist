# Publipostage+ : notes de version

*🇬🇧 An English version of this document is available [below](#publipostage-release-notes-english).*

**Publipostage+ {{VERSION}}**, publiée le {{DATE_FR}} : une mise à jour de la version 1.1.0 du 5 novembre 2026, elle-même une mise à jour de la version stable 1.0.0 du 4 novembre 2026. La première partie liste ce que la 1.1.2 corrige dans la 1.1.0, une puce par correction ; la deuxième garde la note de la 1.1, ce qu'elle ajoute à la 1.0.0, une puce par fonction ; la troisième garde la note de la 1.0.0, pour qui vient de la bêta 1.0.0-beta.1 du 5 octobre 2026. Le [journal des modifications](CHANGELOG.md) donne le détail de chaque entrée.

Elle décrit le widget seul, installé dans Grist. Ce qui demande en plus Grist Factory Suite est à part, dans la dernière section.

## Sommaire

- [Corrections de la version 1.1.2](#corrections-de-la-version-112)
- [Nouveautés de la version 1.1](#nouveautés-de-la-version-11)
  - [Mise en forme conditionnelle](#mise-en-forme-conditionnelle)
  - [Images et pièces jointes](#images-et-pièces-jointes)
  - [Références entre tables](#références-entre-tables)
  - [Corrections de la version 1.1](#corrections-de-la-version-11)
- [Notes de la version 1.0.0](#notes-de-la-version-100)
  - [Nouveautés](#nouveautés)
    - [Mise en forme du texte](#mise-en-forme-du-texte)
    - [Titres, signets, liens et sommaire](#titres-signets-liens-et-sommaire)
    - [Tableaux d'un document](#tableaux-dun-document)
    - [Grilles](#grilles)
    - [En-têtes, pieds de page et page](#en-têtes-pieds-de-page-et-page)
    - [Variables, conditions et boucles](#variables-conditions-et-boucles)
    - [Modèles, macro-modèles et galerie](#modèles-macro-modèles-et-galerie)
    - [Exports et imports](#exports-et-imports)
    - [Rechercher / Remplacer](#rechercher--remplacer)
    - [Lecture et enregistrement](#lecture-et-enregistrement)
    - [Annuler et Rétablir (Ctrl+Z, Ctrl+Y)](#annuler-et-rétablir-ctrlz-ctrly)
    - [Interface, langue et accessibilité](#interface-langue-et-accessibilité)
    - [Vitesse](#vitesse)
  - [Ce qui change pour qui vient de la bêta](#ce-qui-change-pour-qui-vient-de-la-bêta)
  - [Corrections](#corrections)
- [À part : Grist Factory Suite](#à-part--grist-factory-suite)

## Corrections de la version 1.1.2

Ce que la 1.1.2 corrige dans la 1.1.0, une puce par correction. Aucune fonction n'est ajoutée.

- **Le cadre grisé d'un graphique** : sans l'extension des graphiques (hors Grist Factory Suite), le graphique d'un modèle reste un cadre grisé qui dit, en info-bulle, quelle extension lui manque ; depuis la 1.1.0, ce texte avait disparu. Le rouge d'une image dont la colonne a disparu garde le sien.
- **La barre d'une image liée à une colonne** : avec les boutons « Condition d'affichage » et « Boucle » de la 1.1, la barre mesurait 573 px et débordait à droite d'un cadre plus étroit (celui de 560 px de Grist Factory Suite, par exemple). Elle passe maintenant à la ligne, comme la barre d'un tableau, et reste dans le cadre.
- **L'aperçu du sommaire** : en ouvrant un modèle à la place d'un autre qui avait déjà un sommaire, l'aperçu du sommaire dans l'éditeur gardait le texte d'attente ou les titres du modèle d'avant. Il se redessine dès que le document change et montre les titres du modèle ouvert.

## Nouveautés de la version 1.1

Ce que la 1.1 ajoute à la 1.0.0, une puce par fonction.

### Mise en forme conditionnelle

- **Une couleur, un fond ou un trait selon la ligne** : une variable, un calcul, un bloc de texte conditionnel ou une valeur dans la phrase prend une couleur de texte, un fond, du gras, de l'italique, du souligné ou du barré quand une condition est remplie (« en rouge quand le montant dépasse 1 000 »). Le bouton est sur la barre flottante, à côté de « Condition d'affichage » ; il ouvre une fenêtre de huit règles au plus, lues dans l'ordre, avec un aperçu sur la ligne sélectionnée et sur toutes les lignes.
- **Dans toutes les sorties** : la Lecture, le PDF, le Word, l'Excel, le HTML et l'e-mail écrivent la mise en forme ; une colonne renommée dans Grist est suivie dans les règles. Sans règle, rien ne change.
- **« Comme dans Grist »** : une case de la fenêtre, éteinte au départ, fait suivre à une variable, en direct, la mise en forme conditionnelle de sa colonne dans Grist (couleur du texte, fond, gras, italique, souligné, barré) ; les règles du widget passent par-dessus. La case est grisée, avec sa raison, quand la colonne n'a aucune mise en forme conditionnelle dans Grist.
- **Les puces aussi** : les puces date, heure, nom, e-mail et n° de ligne prennent la mise en forme conditionnelle, avec le même bouton sur leur barre ; dans une zone répétée, les règles lisent la ligne du tour. Dans un champ de texte de l'e-mail (Objet, À…), le bouton est grisé, avec sa raison.

### Images et pièces jointes

- **Condition d'affichage d'une image** : une image liée à une colonne Pièces jointes a un bouton « Condition d'affichage » dans sa barre, qui ouvre la même fenêtre qu'une variable ; à la Lecture et à l'export (PDF, Word, HTML, e-mail), elle n'apparaît que si la condition est remplie pour la ligne affichée, le texte autour reste. En édition, l'image reste visible, avec un cadre en pointillés bleus.
- **Boucle d'une image** : un bouton « Boucle » répète l'image, une par ligne d'une table liée : l'image dans la phrase (les copies côte à côte), le paragraphe, la ligne du tableau ou l'élément de liste. Le tri, le filtre et « Si aucune ligne » se règlent comme pour une variable.
- **« Lignes affichées » d'une image** : garder toutes les lignes ou une seule, la première ou la dernière après le filtre et le tri (« la dernière partenaire créée », « le premier logo selon l'ordre »).
- **Une pièce jointe qui n'est pas une image** (PDF, Word…) : la Lecture et tous les exports écrivent, en italique, « Pièce jointe non affichée (ce n'est pas une image) : contrat.pdf » à la place d'un cadre vide ou cassé. Quand une cellule porte plusieurs pièces jointes, c'est la première image qui est dessinée.

### Références entre tables

- **Le lien entre deux tables peut passer par plusieurs références** : la clé du lien peut être un chemin (Badge › Nom prénom › Structure). Quand un seul chemin de références relie les deux tables (jusqu'à trois colonnes de suite), la fenêtre le propose d'elle-même ; sinon, la flèche › de chaque colonne Référence ouvre les colonnes de la table qu'elle désigne. Toute variable de la table du bout (texte, image, calcul, condition, boucle) se lit alors par ce chemin, sans colonne formule. Une version plus ancienne du widget ne connaît pas ces chemins et ignore ce lien.
- **Choisir une image de Référence en Référence** : dans « Image depuis une variable » et dans la liste « Colonne… » d'une image, la flèche › descend de Référence en Référence jusqu'à la colonne Pièces jointes (« Badge.Nom prénom.Structure.Logo ») ; l'image est liée au chemin entier, garde sa taille, son alignement et son opacité quand elle change de colonne, et un seul Annuler rend l'ancienne.

### Corrections de la version 1.1

- **Le gras du PDF** : dans le PDF et dans l'assemblage avant impression, un texte en Arial ou en Georgia n'est plus tout en gras (ou tout maigre) à cause de son premier mot : le poste d'une carte, maigre dans le modèle, sortait en gras. Les lettres, les largeurs et la pagination ne changent pas.
- **Coller une variable copiée seule, sous Windows** : elle ne laisse plus deux sauts de ligne derrière elle, dans un tableau, une grille ou un paragraphe ; un seul Annuler défait le collage.
- **Une image dont la colonne Pièces jointes a disparu** : son cadre devient rouge, comme une variable cassée, avec en info-bulle ce qui manque, et sa barre propose « Colonne… » pour en choisir une autre en gardant la taille, l'alignement, le calque et l'opacité ; un seul Annuler rend l'ancienne colonne. Le rouge et l'icône disparaissent d'eux-mêmes quand la colonne revient dans Grist.
- **Une pièce jointe cochée dans « Autres attributs » devient une image** : « Insérer » pose une image liée à la colonne (avec le chemin entier quand on est descendu de référence en référence) et « Remplacer » la met à la place de la bulle ; l'image reprend la condition d'affichage de la bulle.

## Notes de la version 1.0.0

Cette partie reprend la note de la 1.0.0, la première version stable : ce qui changeait depuis la bêta 1.0.0-beta.1. Elle s'adresse à qui passe directement de la bêta à la 1.1.

### Nouveautés

#### Mise en forme du texte

- **Texte de droite à gauche** : une ligne à cocher du menu Alignement (au survol du bouton) écrit un paragraphe, un titre ou une liste de droite à gauche, pour l'hébreu, l'arabe ou une mise en page en miroir. Les puces, les numéros et les retraits passent à droite, et la Lecture, l'impression, le PDF, le Word et le HTML exporté gardent le sens.
- **« Paragraphe… » : interligne et espaces** (menu Alignement) : l'interligne, en multiple de la ligne simple comme dans Word et PowerPoint, et l'espace avant et après le paragraphe ; « Par défaut » retire les trois réglages.
- **« Paragraphe… » : retraits** : retrait à gauche, retrait de la première ligne et retrait suspendu (première ligne négative), en points.
- **Menu « Aa » : espacement des lettres et petites capitales** : un bouton « Aa », juste après Barré, ouvre au survol le menu « Caractère » : l'espacement des lettres (« − » et « + » par demi-point, ou une valeur tapée puis Entrée) et les petites capitales. Chaque ligne s'applique tout de suite, sans fenêtre ni « Valider », et Ctrl+Z la défait d'un coup ; une ligne est cochée quand tout le texte choisi a le réglage, un tiret dit qu'une partie seulement l'a.
- **Soulignements** : le menu du bouton Souligné offre le soulignement classique (celui du bouton et de Ctrl+U), puis double, pointillé, tireté et ondulé, chaque ligne dessinée comme son trait.
- **Ombre et contour des lettres** : deux lignes à cocher du menu « Aa » ; le PDF les dessine aussi.
- **Signe de la puce** : la ligne « Puce… » du menu Liste choisit le signe d'une liste à puces (un caractère au choix, ou l'un des douze signes proposés : – — ➢ ➔ ► ✓ ✔ ■ ◆ ★ ✦ ❖).
- **Couleur et taille de la puce** : une puce peut avoir sa couleur et sa taille à elle, autres que celles du texte (fenêtre « Puce… »).
- **Exposant et indice** : deux icônes en tête du menu « Aa », et les touches Ctrl+. et Ctrl+, (⌘ sous macOS, réglables dans Réglages > Raccourcis) ; même rendu dans l'éditeur, la Lecture et les exports.
- **Pinceau de mise en forme** : son menu (au survol) garde trois mises en forme dans le modèle et trois autres partagées par tous les modèles du document.
- **Une seule palette de couleurs** : le texte, le surlignage, le fond de case et le trait des bordures ouvrent la même palette (dix colonnes sur cinq rangées, dont des tons foncés lisibles en texte, contraste d'au moins 4,5:1), avec « Personnalisé… » pour une couleur précise.
- **Bulles et puces de l'éditeur : « Par défaut » ou « Mise en forme »** (Réglages > Thème) : les bulles de variable, de calcul, les puces et les fiches « @ » gardent leur fond pâle repérable, ou montrent la couleur, le surlignage, le souligné et le barré choisis. Le numéro de page, la note de bas de page et la case conditionnelle suivent aussi ce choix, et la Lecture, le PDF et le Word écrivent leur mise en forme.

#### Titres, signets, liens et sommaire

- **Styles de titres du modèle et du document** : le menu « Titre » (au survol) montre « Styles de titres du modèle » et « Styles de titres partagés », ces derniers valant pour tous les modèles du document Grist.
- **Style d'un niveau de titre pris d'après la sélection** : « Mettre à jour « Titre N » d'après la sélection » retient la mise en forme du texte choisi pour tous les titres de ce niveau ; « Rétablir le style d'origine » revient en arrière.
- **Numérotation « Article 1 »** : après « 1. », « a. » et « I. », le menu « Titre » numérote en Article 1, puis 1.a, 1.a.1…, dans l'éditeur, le sommaire, la Lecture, le PDF, le Word et le Markdown.
- **Signets** : « Signet… », au menu « Lien et blocs de contenu », nomme un paragraphe ou un titre ; un petit drapeau dans la marge le montre et rouvre la fenêtre qui renomme ou retire le signet et dit combien de liens y mènent.
- **Liens vers un titre ou un signet du document** : « Lien… > Dans ce document » liste, avec recherche, les titres et les signets.
- **Sommaire cliquable** : une ligne du sommaire mène à son titre dans l'éditeur, dans la Lecture (clic, Entrée ou Espace) et dans le PDF (texte et numéro de page en liens).

#### Tableaux d'un document

- **Plusieurs lignes ou colonnes d'un coup** : avec plusieurs cases choisies, « Ligne avant », « Ligne après », « Colonne avant » et « Colonne après » en ajoutent autant que la sélection en couvre, en un seul Annuler.
- **Bordures, alignement vertical et quadrillage** : la barre du tableau a « Bordures » (tous les traits, le pourtour, l'intérieur, un côté ou aucun, dans la couleur choisie, avec la case « Quadrillage » pour la Lecture et les exports) et « Aligner en haut », « au milieu », « en bas ».
- **Trait transparent** : le bouton « Transparent » du menu « Bordures » met le stylo sur « pas de trait », pour effacer un côté ou les traits intérieurs sans toucher au reste (documents et grilles).
- **Lettres et numéros** : dans un tableau, les lettres A, B, C… se posent au-dessus des colonnes et les numéros à gauche des lignes ; un clic choisit une colonne, une ligne ou tout le tableau, Maj + clic étend.
- **Hauteur d'une ligne** : tirer le bas d'un numéro règle la hauteur de la ligne, avec une bulle en centimètres (une case de signature haute, par exemple).
- **Largeur d'une colonne** : tirer le bord droit d'une lettre règle la largeur de la colonne, avec une bulle en centimètres ; dans l'aperçu A4, le tableau ne dépasse jamais la page.
- **Égaliser** : « Égaliser la hauteur des lignes » et « Égaliser la largeur des colonnes » donnent la même taille à celles qui sont choisies.
- **Tableau collé depuis Excel** : un tableau copié dans Excel, Google Sheets ou LibreOffice Calc garde ses traits, son alignement vertical et la hauteur de ses lignes, en plus de ses fusions, fonds, polices et largeurs.
- **Saut de page avant une ligne** : le bouton « Saut de page » (ou Alt+Entrée) ouvre une nouvelle page avant la ligne du curseur, dans l'aperçu A4, la Lecture, le PDF et le Word ; les lignes de titre du tableau reviennent en haut de la page.
- **Tableau lié à un modèle Grille** : « Tableau d'un modèle Grille… », au menu du bouton « Tableau », pose dans le document une copie du tableau d'une grille, qui reste liée à elle (un filet de couleur dans la marge le montre) et dont les cases suivent les règles de la grille.

#### Grilles

- **Quadrillage de la Lecture et des exports** : une ligne à cocher du menu « Bordures » retire les traits gris de départ de la Lecture, du PDF et de l'Excel d'une grille, en gardant ceux qu'on a posés.
- **Taille commune des lignes et des colonnes choisies** : tirer le trait d'une ligne (ou d'une colonne) parmi plusieurs choisies les règle toutes à la même hauteur (largeur), comme dans un tableur.

#### En-têtes, pieds de page et page

- **QR code dans l'en-tête et le pied de page** : « QR code… » reste actif dans ces zones (son texte peut contenir une colonne).
- **Échap termine l'édition de l'en-tête et du pied de page**, comme « Terminer ».
- **Saisie jamais refusée** : dans un en-tête ou un pied de page, une ligne de plus ou une grande image se tape ou se colle sans blocage ; ce qui dépasse est signalé, puis coupé. « Sommaire » et « Saut de page » y sont grisés, et le trait d'une zone terminée a le même aspect que celui qu'on voit en écrivant.
- **Page en paysage au milieu d'un document en portrait** : le menu du bouton Portrait / Paysage (au survol) propose « Tout le document » ou « Cette page » (« Ces pages » pour une sélection).
- **Marges prédéfinies** : « Aucune », « Étroites », « Classiques » (25,4 mm, le « Normal » de Word) et « Larges » dans l'onglet Marges des Réglages, avec un bouton qui lie les quatre marges.
- **Marge autour de chaque page dans l'assemblage avant impression** : un champ « Marge » (en millimètres) laisse de la place autour de chaque page posée sur la feuille, et les traits de coupe passent au milieu de l'espace entre deux pages.

#### Variables, conditions et boucles

- **Boucle sur toutes les lignes d'une table** : l'icône Boucle n'est plus grisée sur une colonne de la table de la page, et « Lignes de la table à utiliser » propose « Comme le widget (son filtre et son tri) », « Comme la vue liée au widget » et « Toute la table ».
- **Boucle dans une boucle** : pour chaque facture ses lignes, puis pour chaque ligne ses étapes (en tableau, en liste ou en paragraphes).
- **N° de ligne** : la puce « N° de ligne » de la liste « # » numérote 1, 2, 3… les lignes que retient la boucle, après son filtre et son tri.
- **« Si aucune ligne → Afficher un texte »** : le texte d'une boucle vide est un champ à variables (« Aucune ligne pour #Factures.Numero »).
- **« Sinon afficher » d'une variable** : une bulle de variable écrit une autre variable, avec son « Avant » et son « Après », quand sa condition n'est pas remplie.
- **« Sinon afficher » d'une valeur conditionnelle** : un texte libre, avec des variables, à la place de la valeur dans la phrase (« Madame » / « Monsieur »).
- **« Sinon afficher » d'un bloc de texte conditionnel** : un second texte, avec des variables, à la place du bloc.
- **« Et » / « Ou » au clic** : le mot « Et » devant la deuxième règle d'une condition (variable, bloc, valeur, case, filtre de boucle) devient « Ou » d'un clic.
- **Groupes « A et (B ou C) »** : le bouton « + Groupe » pose les parenthèses d'une condition.
- **Comparer une colonne à une autre colonne** : le bouton « Comparer à une autre colonne » remplace la valeur d'une règle par une colonne de la même ligne (« Montant = Paye »).
- **Texte « Avant » et « Après » d'une variable** : un texte collé à la valeur, qui disparaît avec elle quand la condition est fausse, la valeur vide ou en erreur.
- **« Autres attributs » d'une colonne Liste de références** : la fenêtre montre les colonnes des fiches de la liste et écrit la colonne choisie pour toutes les fiches (tous les destinataires d'un « À », par exemple).
- **Descendre dans une référence depuis les listes de colonnes** : la flèche « › » des Références ouvre les colonnes de la table liée sous un fil d'Ariane, dans les conditions, les macro-modèles, « Modèle selon la ligne » et le QR code.
- **Choisir la colonne d'une règle dans « Autres attributs »** : la colonne d'une règle s'affiche comme une variable, et un clic ouvre « Autres attributs » pour la choisir en voyant sa valeur.
- **Citer une fiche avec « @ »** : « @ » ouvre la liste des fiches de toutes les tables du document et pose une pastille qui désigne cette ligne.
- **« Comme dans Grist »** : une pipette de la barre d'un nombre ou d'une date reprend le format de la colonne dans Grist (devise, pourcentage, décimales, séparateur de milliers, date et heure).
- **Variables dans l'objet, les destinataires et le nom du PDF** : Objet, À, Cc, Cci et le nom du PDF posent des bulles de variable avec les mêmes conditions, boucles et formats que le corps.
- **Puces dans l'e-mail et le nom du PDF** : « Date du jour », « Heure actuelle », « Email de l'utilisateur » et « Nom de l'utilisateur » s'y posent aussi.
- **Heure à 12 heures** : la liste « Heure » d'une variable « Date et heure » écrit aussi l'heure sur 12 heures, « 11:30 PM » ou « 11:30pm » (l'écriture de départ de Grist), dans les deux langues ; la puce « Heure actuelle » a un réglage 12 h / 24 h.
- **Format de date sur une colonne « Date et heure »** : le format de date d'une variable marche aussi sur ces colonnes, et sa barre gagne la liste « Heure ».
- **Colonnes retrouvées par mots** : les mots d'une colonne se tapent dans n'importe quel ordre, avec ou sans « _ », « . » et « - », dans toutes les listes avec recherche ; la même règle vaut pour « Organiser mes modèles » et la galerie.

#### Modèles, macro-modèles et galerie

- **Galerie de 21 modèles** au lieu de 4 : les quatre d'avant refaits, des modèles à imprimer (flyer, invitation, affiche, badge, carte de visite, étiquettes d'adresse et de produit), un e-mail, deux grilles pour Excel et des documents de métier (quittance de loyer, bulletin scolaire, fiche recette, feuille d'émargement, bon de commande, fiche d'inventaire, bon de mouvement de stock).
- **« Créer avec ses tables »** : un modèle de la galerie peut créer ses tables vides, avec leurs colonnes de calcul et leurs liens ; l'aperçu montre le document rempli de lignes d'exemple, sans en écrire aucune.
- **Macro-modèle qui mêle portrait, paysage et Grille** : avec « Selon chaque modèle », chaque modèle assemblé garde le sens de sa page dans la Lecture, l'impression, le PDF et le Word.
- **Résumé d'un macro-modèle** : une étiquette « Paysage » ou « Grille » dit quels modèles ne sont pas en portrait.
- **Historique des versions** : la ligne « Historique des versions… » du menu Enregistrer liste les versions d'un modèle (date et personne), pour les voir ou les restaurer.
- **Comparer deux versions** : le bouton « Comparer » montre en vert ce qu'une version a en plus de la version actuelle, et en rouge barré ce que la restauration retirerait.
- **Nommer une version** : « Nommer… » donne un nom à une version (« Avant envoi »), qui n'est plus jamais effacée par les plafonds.
- **Modèle de la vue : un e-mail ou un macro-modèle** : Réglages > Vue accepte aussi un e-mail ou un macro-modèle comme modèle d'une vue.

#### Exports et imports

- **PDF « Léger »** : le même PDF vectoriel, dont les images sont ramenées à 150 points par pouce (une photo de 4 Mo ne pèse plus que quelques dizaines de Ko).
- **PDF protégé** : chiffré en AES-256, avec mot de passe d'ouverture, droits (imprimer, copier, modifier ou annoter) et auteur, sujet et mots-clés.
- **Trois façons de donner le mot de passe du PDF protégé** : saisi à chaque export (recommandé), le même pour tous et enregistré dans le document, ou celui d'une colonne de la ligne.
- **Impression par le navigateur** : la fenêtre d'impression du navigateur imprime la Lecture, avec les mêmes coupures de page, en-têtes, pieds, polices et filigrane.
- **Avertissement de page blanche** : avant d'enregistrer le PDF d'une ligne, une fenêtre dit quelles pages ne portent rien et laisse choisir entre « Annuler » et « Exporter quand même » ; pour un export de plusieurs lignes, une fenêtre de fin de lot liste les lignes concernées.
- **Date du dernier export PDF** : Réglages > Vue choisit la colonne (Date, Date et heure ou Texte) où le widget écrit le moment du dernier export PDF de chaque ligne.
- **Exports en lot sur les lignes que le widget affiche** : « Exporter les lignes (ZIP) », « en un seul PDF », « en DOCX (ZIP) », les lignes Excel d'une grille et l'assemblage avant impression suivent les filtres, le tri et « Sélectionner par » ; une fenêtre dit combien de lignes sont affichées (12 sur 340) et demande lesquelles exporter.
- **Liste des lignes qu'un export en lot n'a pas pu générer** : une fenêtre donne le nom du fichier (ou « Ligne n° 12 ») et la raison.
- **Word avec un vrai sommaire** : le sommaire sort en « Table des matières » de Word (un champ qui se met à jour), titres de 1 à 6, chaque ligne menant à son titre.
- **Export Markdown** : un fichier `.md` (CommonMark et GFM), les variables remplacées par les valeurs de la ligne, ou un par ligne dans une archive ZIP.
- **« Markdown (modèle) »** : le modèle lui-même, variables comprises, dans un seul fichier `.md`, qui revient intact à l'import.
- **Import Markdown** : « Importer un Markdown… », au menu « + », ouvre un fichier `.md` comme un nouveau document (titres, listes, cases, tableaux, images, citations, alertes GitHub…).
- **Export HTML** : « HTML (fichier à déposer) » écrit une page complète pour un site, « HTML (contenu à coller) » écrit le seul contenu, à coller dans un bloc HTML d'un gestionnaire de contenu.
- **Zimbra pour « Créer l'email »** : Réglages > Email choisit le logiciel de messagerie, « Standard » ou « Zimbra » (dont le client web relit mal le lien).

#### Rechercher / Remplacer

- **Expressions régulières** : le bouton « .* » lit ce qu'on tape comme un motif, `$1`, `$2`… reprenant les groupes dans « Remplacer par ».
- **Bulles** : une bulle de variable ou de calcul est un résultat quand son nom, son « Avant », son « Après », son « sinon » ou sa formule contient le texte cherché.
- **En-tête et pied de page** : la recherche les parcourt aussi, dans l'ordre de la page, et le compteur les compte (« 2 sur 4 »).

#### Lecture et enregistrement

- **Comptes Lecteur de Grist** : une personne que Grist ouvre en lecture seule voit le widget en Lecture d'emblée, barre grisée, commentaires fermés et exports libres.
- **Rappel « Enregistrer »** dans les Réglages Vue et Accès : une ligne colorée rappelle que ces réglages ne sont donnés aux autres qu'après un clic sur « Enregistrer ».

#### Annuler et Rétablir (Ctrl+Z, Ctrl+Y)

Ctrl+Z défait et Ctrl+Y rend, en plus du texte :

- **les commentaires** ;
- **« Tout accepter » et « Tout refuser »**, d'un seul pas ;
- **un modèle supprimé** ;
- **les copies de modèle** : « Enregistrer sous… » et un modèle de la galerie ;
- **l'épingle, le dossier et le dossier « replié par défaut »** d'un modèle ;
- **le nom donné au crayon** (Renommer) et **les choix d'export** d'un modèle ;
- **le ★ modèle par défaut** du document, depuis n'importe quel modèle ;
- **la page du modèle** (format, sens, marges), l'œil d'un modèle et la composition d'un macro-modèle ;
- **l'en-tête et le pied de page** ;
- **la numérotation des titres** ;
- **l'Objet, À, Cc, Cci** de l'e-mail et le nom du fichier PDF ;
- **les liens entre tables** ;
- **les droits de l'onglet Accès** (la table, ses colonnes, la case de la Lecture épurée) ;
- **le modèle par défaut de la vue**, la colonne de la date du dernier export et le modèle selon la ligne ;
- **les abréviations** : ajout, modification, suppression ;
- **les touches du clavier choisies** dans Réglages et le caractère déclencheur des abréviations ;
- **le thème, les bulles et puces, le caractère d'insertion et la messagerie** des Réglages.

La langue reste volontairement hors d'Annuler.

- **Raccourcis d'annulation plus sûrs** : Ctrl+Z, Ctrl+Y et Ctrl+Maj+Z n'agissent plus derrière une fenêtre ouverte, même dans Chrome, et fonctionnent aussi quand le focus est resté sur une liste ou une glissière de la barre flottante.

#### Interface, langue et accessibilité

- **Fenêtre des nouveautés** : Réglages > Crédits > « Nouveautés » ouvre un carrousel de onze écrans avec de vraies captures : huit nouveautés de la version, un écran « Et aussi » (les titres et leurs styles, Rechercher / Remplacer, les pages, les dates et les heures, les exports), ce que devient un modèle fait avec la bêta et les habitudes qui changent ; le dernier écran mène, par « Voir en détail », à une seconde fenêtre, « Exporter, en détail » (cinq écrans).
- **Un bouton ou une ligne de menu grisé dit pourquoi** : au survol, l'info-bulle donne la raison (dans un modèle e-mail, par exemple, que le modèle s'écrit en texte brut) ; au clic, le coin d'état écrit la même phrase. Rien n'est retiré ni caché. Les raisons couvrent les droits du document, le mode Lecture, le modèle e-mail, le macro-modèle, la grille, l'en-tête et le pied de page, et les types d'export qui ne vont pas au modèle ouvert.
- **201 textes de fenêtres réécrits**, en français et en anglais : introductions, aides, erreurs, confirmations, messages de la barre d'état et info-bulles disent ce qu'on obtient dans le document.
- **58 raccourcis clavier** personnalisables (54 en bêta).

#### Vitesse

- **Pages d'un long document calculées quatre fois plus vite** : les coupures de page se posent d'un coup, les pages restent exactement les mêmes (un texte de 117 pages s'ouvre en 1,0 s au lieu de 1,5 s, sous Chromium).
- **Lecture et enregistrement automatique allégés** : l'entrée en Lecture dessine la page une seule fois, et l'enregistrement automatique ne refait plus tout le texte à chaque passage.

### Ce qui change pour qui vient de la bêta

Ces changements touchent des habitudes de la bêta.

- **« Qualité PDF » devient « Type d'export »** : le bouton à gauche d'« Exporter » choisit le type d'export (PDF, PDF protégé, Word, Excel, Markdown, HTML) et, pour les deux PDF, leur qualité (Vectoriel, Impression navigateur, Léger). Le menu « Exporter » ne liste plus que les options de lignes et de classeur du type choisi.
- **Les choix d'export sont gardés par modèle** : le type d'export, la qualité du PDF et le choix « une seule ligne / toutes les lignes » sont retenus pour chaque personne et chaque modèle, et se retrouvent sur n'importe quel ordinateur.
- **« Commenter la sélection » : Ctrl+Alt+M** (⌥⌘M sur Mac), comme dans Google Docs, à la place d'Alt+Maj+M ; une touche choisie par la personne est gardée, et « Par défaut » rend Ctrl+Alt+M.
- **« Édition collaborative »** : le suivi des modifications, « Tout accepter » et « Tout refuser » se rangent sous un seul bouton (deux personnes de profil, menu au survol). Les lignes gardent leur nom, leur raccourci et leur effet.
- **Menu « Mode lecture »** : deux lignes à cocher, « Lecture simple » et « Lecture épurée », comme le menu « Exporter » ; le bouton fait ce que la ligne cochée dit.
- **Entrée dans un tableau de document** : comme dans une grille, Entrée descend d'une case et en sélectionne le texte ; Maj+Entrée (ou Ctrl+Entrée) ajoute une ligne dans la case. Avant, Entrée coupait le paragraphe de la case.
- **« Identifiant de ligne » devient « Auto »** dans la fenêtre de liaison entre deux tables et dans « Tables liées » (même effet, les règles déjà enregistrées marchent comme avant).
- **« Toutes les lignes » suit la vue liée** : l'export de toutes les lignes (PDF, Word, Excel) exporte les lignes de la vue reliée par « Sélectionner par » ; avant, il ne suivait que le filtre et le tri posés sur le widget lui-même.
- **Puces, tirets et numéros de liste** : ils prennent la couleur et la taille du début du texte de leur point, au lieu de celles du point lui-même (un texte blanc de 28 pt sur fond foncé n'a plus un rond noir presque invisible).
- **Marges d'un macro-modèle** : l'onglet Marges des Réglages dit que celles du macro-modèle priment sur celles des modèles assemblés.
- **L'étoile du modèle par défaut dit son rôle** (« au démarrage ») dans la liste des modèles et dans « Organiser mes modèles », et la liste colore l'icône de chaque sorte de modèle : document en bleu, grille en vert.
- **Changer de langue recharge la page** : elle rouvre le modèle où l'on était, après la question « Enregistrer / Abandonner / Annuler » s'il y a des modifications ; rien n'est plus retraduit à moitié.
- **Menus qui se referment au clic** : ceux d'Enregistrer, de « + », de « Mode lecture » et de « Type d'export » ne recouvrent plus ce qu'on vise juste après.
- **L'icône du menu « Lien et blocs de contenu »** montre des blocs, plus le maillon d'un lien.
- **Galerie** : les quatre modèles d'avant sont refaits avec les fonctions récentes ; les modèles déjà créés à partir d'eux ne changent pas.
- **La bêta reste disponible** : si un ancien modèle ne se rouvre pas bien dans la V1, la bêta 1.0.0-beta.1 reste servie, telle quelle et sans correctif, à `https://grist-factory.github.io/Publipostage-Plus/beta/` (dans Grist, changer l'adresse du widget personnalisé). Seul ajout : un bandeau, que sa croix ferme, conseille de migrer vers la version 1.1, et son bouton « Découvrir les nouveautés » ouvre les nouveautés dans un nouvel onglet. Le retour est sûr tant que le modèle n'a pas été enregistré avec la V1 : la bêta efface ce qu'elle ne connaît pas (signets, exposants et indices, « Sinon afficher »).

#### Retiré

- **« Basse qualité » et « Ultra HD »** : ces deux lignes du menu de qualité du PDF, grisées (« bientôt ») depuis le retrait de html2pdf.js, ne sont plus dans l'interface. Pour alléger un PDF, la ligne « Léger » réduit les images ; pour une affiche, le PDF vectoriel et « Format libre ».

### Corrections

Ces corrections touchent ce que la bêta faisait déjà, regroupées par sujet ; le [journal des modifications](CHANGELOG.md) les détaille une à une.

#### Fidélité entre l'éditeur, la Lecture, le PDF, le Word et le HTML

- **Les lignes de tableau de l'écran ont la hauteur de celles du PDF**, aussi dans un panneau étroit : un long tableau se coupe au même endroit à l'écran et au PDF, et la marge d'un tableau compte partout dans la pagination (plus aucune page à tableau ne grandit).
- **Les pages qui portent un tableau court, une citation, un bloc de code ou un bloc de texte conditionnel ne grandissent plus.**
- **Chaque page commence où elle doit**, même quand la mise en page bouge après coup (un style ou une police arrivés après le calcul des pages).
- **Le texte et les marges de la page suivent le zoom de la feuille**, quoi que le navigateur y ajoute (constaté sous Firefox).
- **La taille du panneau ne change plus rien à ce qu'un modèle enregistre** : les colonnes automatiques d'un tableau mixte, la colonne d'une zone à deux colonnes et la position des images en calque se mesurent à l'échelle réelle de la page, les mêmes à toutes les tailles de panneau.
- **« Égaliser » et la bordure d'une colonne tirée ne dépendent plus du panneau.**
- **Les sauts de page du Word et du PDF suivent l'éditeur** ; le PDF passe un paragraphe à cheval sur le bas d'une page en entier sur la suivante, comme l'éditeur.
- **Plus de page blanche inutile** : un saut de page qui termine le document n'ouvre plus de « Page 2 » vide, des lignes vides juste avant un saut de page ne font plus de page blanche, et le PDF d'un macro-modèle n'ouvre plus de page vide entre deux modèles.
- **Une zone à deux colonnes passe à la page suivante** dans l'éditeur et dans la Lecture, et un tableau plus large que sa colonne reste dans sa colonne.
- **Le trait (--- puis Espace)** a la même hauteur dans l'éditeur, la Lecture et le PDF, a la largeur de son bloc dans le PDF et s'y voit dans les cases de tableau, les listes et les citations.
- **Le curseur passe sous le saut de page** quand on clique sur le bouton.
- **Un tableau de document sort proprement dans tous les affichages et tous les exports** (page A4, A5, A3, paysage, marges changées, cases fusionnées, colorées, hauteurs réglées), et sa ligne qui ouvre une page garde sa hauteur dans l'aperçu A4.
- **Word** : le bout, le trait double et les lignes fusionnées d'un tableau retrouvent leur place, un tableau étroit garde sa largeur, un tableau de la largeur de la page aussi.
- **La couleur d'une note de bas de page et le souligné ou le barré d'une case se retrouvent dans les autres exports** : le HTML les écrit, et la case Oui / Non les reçoit à la Lecture, au PDF et au Word.

#### Listes, citations, titres et blocs

- **Une puce, un numéro, une tâche ou une citation centrés, à droite ou justifiés le sont aussi** dans le Word et dans le PDF (point de liste, citation).
- **Une liste a, dans le PDF, la case, la puce et le texte de l'éditeur** : une liste de tâches avec sa case, un texte de liste qui commence au même endroit, une liste dans une citation avec ses puces et son trait, une citation ou une liste dans une case de tableau bien placées dans toutes les colonnes.
- **Le cadre d'un QR code à colonne reste carré** à toute taille.
- **Un clic juste au-dessus ou juste derrière un bloc de texte conditionnel** pose le curseur dans sa case.
- **Numérotation des titres** : le premier clic sur un bouton de numérotation du menu « Titre » ne se perd plus, le sommaire de l'éditeur montre la numérotation du modèle qu'on ouvre, et les lettres et numéros d'un sous-titre repartent à chaque nouveau titre (éditeur et Lecture).
- **Le sommaire montre ses titres dès « Terminer »** d'un en-tête ou d'un pied de page.
- **La mise en forme choisie sur des cases vides d'un tableau** (couleur, gras, taille, police, surlignage…) n'est plus perdue.
- **Les espaces tapés autour d'une valeur qui n'écrit rien ne s'additionnent plus** (valeur conditionnelle non retenue, bulle vide, masquée, à zéro masqué ou sans ligne dans sa boucle).
- **« 1er »** dans les dates en lettres : le premier du mois s'écrit « 1er janvier 1990 » dans la Lecture, le PDF, le Word et l'e-mail.
- **Un lot d'une seule ligne parle au singulier** (« 1 PDF généré »).

#### En-têtes et pieds de page

- **Un logo aligné à gauche ou à droite reste à côté du texte** dans la Lecture, le PDF et le Word ; le logo aligné d'un pied de page figure dans le PDF.
- **Les listes à puces et numérotées d'un en-tête ou d'un pied gardent leurs puces et leurs numéros dans le Word**, et les lignes vides n'y descendent plus le texte de la page.
- **Un en-tête ou un pied plus haut que sa zone ne repousse plus le texte de la page.**
- **Passer du corps à l'en-tête ou au pied ne propose plus rien en suivi des modifications** et ne mélange plus l'historique d'Annuler.

#### Données, dates et Références

- **Devises, dates et nombres s'écrivent comme dans Grist** : une devise en anglais, une colonne « Any » qui calcule une date, une Référence qui montre un prix décimal (virgule) ou un numéro, un identifiant de ligne, un Oui / Non ou une date, et une cellule dont la formule a échoué s'écrivent pareil dans l'éditeur, la Lecture, le PDF, le Word et l'e-mail.
- **L'Excel d'une seule ligne écrit de vraies dates.**
- **Une liste dont une valeur est vide s'écrit sans virgule de trop.**
- **Les règles de condition lisent mieux les données** : « Avant une date » ne retient plus une cellule sans date, « Est vide » marche sur une liste de références sans élément, et une virgule décimale tapée dans la valeur d'une règle (« 99,5 ») vaut le point.
- **Un lien « Nom = Référence » trouve ce que la Référence montre**, et une ligne dont la colonne « liste de références » compte plusieurs éléments apparaît sous chacun.
- **Le lien entre deux tables est retenu pour chaque table de la page** : en refaire un depuis une table ne casse plus celui d'une autre.
- **« Autres attributs » avec deux colonnes Référence vers une même table** lit la personne de la colonne cliquée.
- **La liste « # » met les colonnes de la table de la page en tête**, même quand cette table n'a encore aucune ligne ; ouverte dans une case de grille ou de tableau, elle se parcourt aux flèches et se valide par Tab.
- **Grilles** : un bloc de cases collé sur des lignes ou des colonnes choisies par leurs numéros et leurs lettres est posé en entier.
- **Les boutons jour, mois et année d'une date** suivent la langue (« D », « M », « Y » en anglais).
- **Les lignes SIRET et TVA du client s'affichent** dans la facture et le contrat de la galerie (les modèles déjà créés ne changent pas).

#### Enregistrement, noms et Réglages

- **Entrée valide le nom d'un modèle partout où on le saisit**, et un nom effacé ne fait plus perdre l'enregistrement.
- **« Abandonner » abandonne vraiment ce qui vient d'être tapé**, même quand l'enregistrement automatique était en train d'écrire.
- **Un modèle quitté puis rouvert aussitôt montre ce qui vient d'y être écrit.**
- **Un compte Lecteur de Grist n'essaie plus d'ajouter la colonne « Modifié par »** : plus d'écriture refusée à chaque ouverture.
- **Réglages ouverts puis fermés sans rien changer** : Grist ne montre plus « Enregistrer » et « Retour » pour un réglage vide, et « Retour » de Grist rend le réglage enregistré.
- **La fenêtre Réglages garde la même hauteur sur les neuf onglets**, la rangée des onglets ne saute plus.
- **Dans la liste des modèles, l'en-tête reste collé au bord du panneau**, le texte qui défile ne passe plus au-dessus.
- **La barre d'une image restée sélectionnée ne revient plus sur la barre du haut** quand on passe en Lecture et qu'on change le type d'export.
- **La barre du tableau reste affichée après un réglage de « Bordures ».**

#### E-mail

- **Le texte du lien « Créer l'email » est fidèle à l'éditeur** : un paragraphe vide, deux de suite ou un retour à la ligne donnent des lignes vides, des paragraphes qui se suivent restent collés.
- **Un modèle e-mail n'écrit que du texte brut** : les raccourcis de mise en forme et les signes de Markdown tapés ne font plus rien dans un e-mail (le gras et le souligné ne partent pas encore dans un e-mail).
- **Un retour à la ligne dans l'objet ou dans une adresse n'ajoute plus rien au lien « Créer l'email »** : l'objet, le destinataire, le Cc et le Cci viennent d'une colonne, et une cellule à plusieurs lignes mettait son retour à la ligne tel quel dans le lien, où une messagerie peut le lire comme le début d'un autre champ. Le retour à la ligne de l'objet devient une espace et celui d'une adresse sépare deux destinataires ; le corps garde ses lignes.

#### Interface et accessibilité

- **La zone où l'on écrit le document a un nom** pour un lecteur d'écran.
- **Les info-bulles des boutons sont lisibles en thème sombre**, la ligne ou l'onglet choisi sous la souris garde un contraste suffisant, et les champs, les boutons et les libellés prennent la police du système (le texte des en-têtes et des pieds s'écrit en Roboto dans la feuille).
- **L'interface anglaise parle anglais** : le repère « Saut de page » de l'éditeur (« Page break ») et les noms et mots-clés des modèles de la galerie.

## À part : Grist Factory Suite

Quelques fonctions ne marchent que lorsque le widget tourne dans Grist Factory Suite (GFS), la suite d'applications de Grist Factory : les présentations (Slides+) avec l'import et l'export PowerPoint, les graphiques, l'écriture en direct et la lecture de PDF. Elles chargent des bibliothèques que le widget seul ne charge pas : hors de GFS, leurs commandes sont grisées, avec leur raison, et un clic explique comment passer par GFS. Elles ne font pas partie de cette note. La galerie de modèles affiche aussi une présentation commerciale, grisée hors de GFS.

---

# Publipostage+: release notes (English)

*🇫🇷 La version française de ce document est [au début de cette page](#publipostage--notes-de-version).*

**Publipostage+ {{VERSION}}**, released on {{DATE_EN}}: an update to version 1.1.0 of 5 November 2026, itself an update to the stable version 1.0.0 of 4 November 2026. The first part lists what 1.1.2 fixes in 1.1.0, one bullet per fix; the second keeps the 1.1 note, what it adds to 1.0.0, one bullet per feature; the third keeps the 1.0.0 note, for anyone coming from the beta 1.0.0-beta.1 of 5 October 2026. The [changelog](CHANGELOG.md) gives the detail of each entry.

It describes the widget on its own, installed in Grist. What also needs Grist Factory Suite is set apart, in the last section.

## Contents

- [Fixes in version 1.1.2](#fixes-in-version-112)
- [What's new in version 1.1](#whats-new-in-version-11)
  - [Conditional formatting](#conditional-formatting)
  - [Images and attachments](#images-and-attachments)
  - [References between tables](#references-between-tables)
  - [Fixes in version 1.1](#fixes-in-version-11)
- [Notes for version 1.0.0](#notes-for-version-100)
  - [What's new](#whats-new)
    - [Text formatting](#text-formatting)
    - [Headings, bookmarks, links and table of contents](#headings-bookmarks-links-and-table-of-contents)
    - [Tables in a document](#tables-in-a-document)
    - [Grids](#grids)
    - [Headers, footers and page](#headers-footers-and-page)
    - [Variables, conditions and loops](#variables-conditions-and-loops)
    - [Templates, macro-templates and gallery](#templates-macro-templates-and-gallery)
    - [Exports and imports](#exports-and-imports)
    - [Find / Replace](#find--replace)
    - [Reading and saving](#reading-and-saving)
    - [Undo and Redo (Ctrl+Z, Ctrl+Y)](#undo-and-redo-ctrlz-ctrly)
    - [Interface, language and accessibility](#interface-language-and-accessibility)
    - [Speed](#speed)
  - [What changes if you come from the beta](#what-changes-if-you-come-from-the-beta)
  - [Fixes](#fixes)
- [Set apart: Grist Factory Suite](#set-apart-grist-factory-suite)

## Fixes in version 1.1.2

What 1.1.2 fixes in 1.1.0, one bullet per fix. No feature is added.

- **The greyed frame of a chart**: without the charts extension (outside Grist Factory Suite), a template's chart stays a greyed frame that says, in a tooltip, which extension it lacks; since 1.1.0 that text had disappeared. The red of an image whose column has disappeared keeps its own.
- **The toolbar of an image linked to a column**: with the 1.1 "Display condition" and "Loop" buttons, the toolbar was 573 px wide and ran past the right edge of a narrower frame (Grist Factory Suite's 560 px one, for instance). It now wraps onto a second row, like a table's toolbar, and stays inside the frame.
- **The table of contents preview**: when you opened a template in place of another that already had a table of contents, the preview in the editor kept the waiting text or the previous template's headings. It now redraws as soon as the document changes and shows the opened template's headings.

## What's new in version 1.1

What 1.1 adds to 1.0.0, one bullet per feature.

### Conditional formatting

- **A color, a fill or a mark depending on the row**: a variable, a calculation, a conditional text block or a value in the sentence takes a text color, a fill, bold, italic, underline or strikethrough when a condition is met ("in red when the amount exceeds 1,000"). The button is on the floating toolbar, next to "Display condition"; it opens a window of at most eight rules, read in order, with a preview on the selected row and on every row.
- **In every output**: Read mode, PDF, Word, Excel, HTML and e-mail all write the formatting; a column renamed in Grist is followed in the rules. Without a rule, nothing changes.
- **"Like in Grist"**: a box in the window, unchecked by default, makes a variable follow, live, its column's conditional formatting in Grist (text color, fill, bold, italic, underline, strikethrough); the widget's own rules go on top. The box is greyed out, with its reason, when the column has no conditional formatting in Grist.
- **Chips too**: the date, time, name, e-mail and row-number chips take conditional formatting, with the same button on their toolbar; in a repeated zone the rules read the row of the turn. In a text field of the e-mail (Subject, To…), the button is greyed out, with its reason.

### Images and attachments

- **Display condition of an image**: an image linked to an attachments column has a "Display condition" button on its toolbar, which opens the same window as for a variable; in Read mode and in exports (PDF, Word, HTML, e-mail) it only appears when the condition is met for the displayed row, the text around it stays. While editing, the image stays visible, with a dashed blue border.
- **Loop on an image**: a "Loop" button repeats the image, one per row of a linked table: the image in the sentence (the copies side by side), the paragraph, the table row or the list item. Sort, filter and "If no row" are set as for a variable.
- **"Rows shown" of an image**: keep all the rows or just one, the first or the last after the filter and the sort ("the last partner created", "the first logo in the order").
- **An attachment that is not an image** (PDF, Word…): Read mode and every export write, in italics, "Attachment not shown (not an image): contrat.pdf" instead of an empty or broken frame. When a cell carries several attachments, the first image is the one drawn.

### References between tables

- **The link between two tables can go through several references**: the link's key can be a path (Badge › Full name › Structure). When only one path of references joins the two tables (up to three columns in a row), the window proposes it by itself; otherwise the › arrow of each Reference column opens the columns of the table it points to. Any variable of the table at the end (text, image, calculation, condition, loop) is then read through this path, without a formula column. An older version of the widget does not know these paths and ignores this link.
- **Pick an image from Reference to Reference**: in "Image from a variable" and in an image's "Column…" list, the › arrow goes down from Reference to Reference to the attachments column ("Badge.Full name.Structure.Logo"); the image is linked to the whole path, keeps its size, alignment and opacity when it changes column, and one Undo gives the old one back.

### Fixes in version 1.1

- **Bold in the PDF**: in the PDF and in the sheet assembly before printing, text in Arial or Georgia is no longer all bold (or all regular) because of its first word: a card's job title, regular in the template, came out bold. The letter shapes, the widths and the pagination do not change.
- **Pasting a variable copied on its own, on Windows**: it no longer leaves two line breaks behind it, in a table, a grid or a paragraph; a single Undo removes the paste.
- **An image whose attachments column has disappeared**: its frame turns red, like a broken variable, with what is missing in the tooltip, and its toolbar offers "Column…" to pick another one, keeping the size, alignment, layer and opacity; a single Undo gives the old column back. The red and the icon go away by themselves when the column is back in Grist.
- **An attachment checked in "Other attributes" becomes an image**: "Insert" places an image linked to the column (with the whole path when you went down from Reference to Reference) and "Replace" puts it in place of the bubble; the image keeps the bubble's display condition.

## Notes for version 1.0.0

This part keeps the 1.0.0 note, the first stable version: what changed since the 1.0.0-beta.1 beta. It is for anyone moving straight from the beta to 1.1.

### What's new

#### Text formatting

- **Right-to-left text**: a checkable row of the Alignment menu (hover the button) writes a paragraph, a heading or a list from right to left, for Hebrew, Arabic or a mirrored layout. Bullets, numbers and indents move to the right, and Reading mode, printing, the PDF, Word and the exported HTML keep the direction.
- **"Paragraph…": line spacing and spaces** (Alignment menu): line spacing, as a multiple of single spacing like in Word and PowerPoint, and the space before and after the paragraph; "Default" removes the three settings.
- **"Paragraph…": indents**: left indent, first-line indent and hanging indent (negative first line), in points.
- **"Aa" menu: letter spacing and small capitals**: an "Aa" button, right after Strikethrough, opens the "Character" menu on hover: letter spacing ("−" and "+" by half a point, or a typed value then Enter) and small capitals. Each row applies at once, with no window and no "OK", and Ctrl+Z takes it back in one step; a row is ticked when all the chosen text has the setting, and a dash says only part of it does.
- **Underlines**: the menu of the Underline button offers the classic underline (the button's own, with Ctrl+U), then double, dotted, dashed and wavy, each row drawn like its line.
- **Letter shadow and outline**: two checkable rows of the "Aa" menu; the PDF draws them too.
- **Bullet sign**: the "Bullet…" row of the List menu chooses the sign of a bulleted list (any character, or one of the twelve signs offered: – — ➢ ➔ ► ✓ ✔ ■ ◆ ★ ✦ ❖).
- **Bullet color and size**: a bullet can have its own color and size, different from the text's ("Bullet…" window).
- **Superscript and subscript**: two icons at the top of the "Aa" menu, and the keys Ctrl+. and Ctrl+, (⌘ on macOS, adjustable in Settings > Shortcuts); same rendering in the editor, Reading mode and the exports.
- **Format painter**: its menu (on hover) keeps three formats in the template and three others shared by all the templates of the document.
- **One single color palette**: text, highlight, cell fill and border line open the same palette (ten columns over five rows, including dark tones that read well as text, with a contrast of at least 4.5:1), with "Custom…" for a precise color.
- **Bubbles and chips in the editor: "Default" or "Formatting"** (Settings > Theme): variable bubbles, calculation bubbles, chips and "@" records either keep their pale, easy-to-spot background, or show the chosen color, highlight, underline and strikethrough. The page number, the footnote and the conditional checkbox follow this choice too, and Reading mode, the PDF and Word write their formatting.

#### Headings, bookmarks, links and table of contents

- **Template and document heading styles**: the "Heading" menu (on hover) shows "Template heading styles" and "Shared heading styles"; the latter apply to all the templates of the Grist document.
- **Style of a heading level taken from the selection**: "Update 'Heading N' to match the selection" keeps the formatting of the chosen text for every heading of that level; "Restore the original style" goes back.
- **"Article 1" numbering**: after "1.", "a." and "I.", the "Heading" menu numbers headings as Article 1, then 1.a, 1.a.1…, in the editor, the table of contents, Reading mode, the PDF, Word and Markdown.
- **Bookmarks**: "Bookmark…", in the "Link and content blocks" menu, names a paragraph or a heading; a small flag in the margin shows it and reopens the window that renames or removes the bookmark and says how many links lead to it.
- **Links to a heading or a bookmark of the document**: "Link… > In this document" lists the headings and the bookmarks, with a search.
- **Clickable table of contents**: a line of the table of contents leads to its heading in the editor, in Reading mode (click, Enter or Space) and in the PDF (text and page number as links).

#### Tables in a document

- **Several rows or columns at once**: with several cells selected, "Row before", "Row after", "Column before" and "Column after" add as many as the selection covers, in a single Undo step.
- **Borders, vertical alignment and gridlines**: the table bar has "Borders" (all lines, the outside, the inside, one side or none, in the chosen color, with a "Gridlines" checkbox for Reading mode and the exports) and "Align to top", "Align to middle" and "Align to bottom".
- **Transparent line**: the "Transparent" button of the "Borders" menu sets the pen to "no line", to erase one side or the inside lines without touching the rest (documents and grids).
- **Letters and numbers**: in a table, the letters A, B, C… sit above the columns and the numbers to the left of the rows; a click selects a column, a row or the whole table, Shift + click extends the selection.
- **Row height**: dragging the bottom of a number sets the height of the row, with a bubble in centimeters (a tall signature box, for instance).
- **Column width**: dragging the right edge of a letter sets the width of the column, with a bubble in centimeters; in the A4 preview, the table never goes beyond the page.
- **Make the same size**: "Make rows the same height" and "Make columns the same width" give the selected ones the same size.
- **Table pasted from Excel**: a table copied from Excel, Google Sheets or LibreOffice Calc keeps its lines, its vertical alignment and the height of its rows, in addition to its merges, fills, fonts and widths.
- **Page break before a row**: the "Page break" button (or Alt+Enter) starts a new page before the row of the cursor, in the A4 preview, Reading mode, the PDF and Word; the header rows of the table come back at the top of the page.
- **Table linked to a Grid template**: "Table from a Grid template…", in the menu of the "Table" button, places in the document a copy of a grid's table that stays linked to it (a colored strip in the margin shows it) and whose cells follow the rules of the grid.

#### Grids

- **Gridlines in Reading mode and the exports**: a checkable row of the "Borders" menu removes the default gray lines from Reading mode, the PDF and the Excel file of a grid, while keeping the ones you set.
- **Same size for the selected rows and columns**: dragging the line of one row (or column) among several selected sets them all to the same height (width), as in a spreadsheet.

#### Headers, footers and page

- **QR code in the header and footer**: "QR code…" stays available in these zones (its text can contain a column).
- **Esc ends the editing of the header and footer**, like "Done".
- **Input is never refused**: in a header or footer, an extra line or a large image can be typed or pasted without blocking; what overflows is flagged, then cut. "Table of Contents" and "Page break" are greyed out there, and the line of a finished zone looks the same as the one you see while writing.
- **Landscape page in the middle of a portrait document**: the menu of the Portrait / Landscape button (on hover) offers "Whole document" or "This page" ("These pages" for a selection).
- **Preset margins**: "None", "Narrow", "Classic" (25.4 mm, Word's "Normal") and "Wide" in the Margins tab of Settings, with a button that links the four margins.
- **Margin around each page in "Assemble before printing"**: a "Margin" field (in millimeters) leaves room around each page placed on the sheet, and the cut marks run through the middle of the gap between two pages.

#### Variables, conditions and loops

- **Loop over all the rows of a table**: the Loop icon is no longer greyed out on a column of the page's table, and "Table rows to use" offers "As the widget (its filter and sort)", "As the view linked to the widget" and "The whole table".
- **Loop inside a loop**: for each invoice its lines, then for each line its steps (as a table, a list or paragraphs).
- **Row number**: the "Row number" chip of the "#" list numbers 1, 2, 3… the rows the loop keeps, after its filter and sort.
- **"If no row > Show a text"**: the text of an empty loop is a field with variables ("No rows for #Invoices.Number").
- **"Otherwise show" of a variable**: a variable bubble writes another variable, with its "Before" and "After", when its condition is not met.
- **"Otherwise show" of a conditional value**: a free text, with variables, in place of the value in the sentence ("Mrs" / "Mr").
- **"Otherwise show" of a conditional text block**: a second text, with variables, in place of the block.
- **"And" / "Or" in one click**: the word "And" in front of the second rule of a condition (variable, block, value, checkbox, loop filter) becomes "Or" with a click.
- **"A and (B or C)" groups**: the "+ Group" button places the parentheses of a condition.
- **Comparing a column with another column**: the "Compare with another column" button replaces the value of a rule with a column of the same row ("Amount = Paid").
- **"Before" and "After" text of a variable**: a text attached to the value, which disappears with it when the condition is false or the value is empty or in error.
- **"Other attributes" of a Reference List column**: the window shows the columns of the records in the list and writes the chosen column for all the records (all the recipients of a "To", for instance).
- **Going down into a Reference from the column lists**: the "›" arrow of References opens the columns of the linked table under a breadcrumb, in conditions, macro-templates, "Template by row" and the QR code.
- **Choosing the column of a rule in "Other attributes"**: the column of a rule is shown like a variable, and a click opens "Other attributes" to choose it while seeing its value.
- **Citing a record with "@"**: "@" opens the list of the records of all the tables of the document and places a chip that designates that row.
- **"Like in Grist"**: an eyedropper in the bar of a number or a date takes the format of the column in Grist (currency, percentage, decimals, thousands separator, date and time).
- **Variables in the subject, the recipients and the PDF name**: Subject, To, Cc, Bcc and the PDF name place variable bubbles with the same conditions, loops and formats as the body.
- **Chips in the email and the PDF name**: "Today's date", "Current time", "User's email" and "User's name" can be placed there too.
- **12-hour time**: the "Time" list of a "Date and time" variable also writes the time on a 12-hour clock, "11:30 PM" or "11:30pm" (Grist's default format), in both languages; the "Current time" chip has a 12 h / 24 h setting.
- **Date format on a "Date and time" column**: the date format of a variable also works on these columns, and its bar gains the "Time" list.
- **Columns found by words**: the words of a column can be typed in any order, with or without "_", "." and "-", in every list with a search; the same rule applies to "Organize my templates" and the gallery.

#### Templates, macro-templates and gallery

- **A gallery of 21 templates** instead of 4: the previous four redone, templates to print (flyer, invitation, poster, badge, business card, address and product labels), an email, two grids for Excel, and business documents (rent receipt, school report, recipe sheet, attendance sheet, purchase order, inventory sheet, stock movement slip).
- **"Create with its tables"**: a gallery template can create its empty tables, with their calculated columns and their links; the preview shows the document filled with sample rows, without writing any.
- **Macro-template mixing portrait, landscape and Grid**: with "Follow each template", each assembled template keeps the direction of its page in Reading mode, printing, the PDF and Word.
- **Macro-template summary**: a "Landscape" or "Grid" label says which templates are not in portrait.
- **Version history**: the "Version history…" row of the Save menu lists the versions of a template (date and person), to view or restore them.
- **Comparing two versions**: the "Compare" button shows in green what a version has more than the current version, and in struck-through red what restoring it would remove.
- **Naming a version**: "Name…" gives a version a name ("Before sending"), which the limits on the number of versions never delete.
- **Template of the view: an email or a macro-template**: Settings > View also accepts an email or a macro-template as the template of a view.

#### Exports and imports

- **"Light" PDF**: the same vector PDF, with its images brought down to 150 points per inch (a 4 MB photo weighs only a few dozen KB).
- **Protected PDF**: encrypted with AES-256, with an opening password, permissions (print, copy, edit or annotate) and author, subject and keywords.
- **Three ways to give the password of the protected PDF**: typed at each export (recommended), the same for everyone and saved in the document, or the one read from a column of the row.
- **Printing through the browser**: the browser's print window prints Reading mode, with the same page breaks, headers, footers, fonts and watermark.
- **Blank page warning**: before saving the PDF of a row, a window says which pages carry nothing and lets you choose between "Cancel" and "Export anyway"; for an export of several rows, an end-of-batch window lists the rows concerned.
- **Date of the last PDF export**: Settings > View chooses the column (Date, Date and time or Text) where the widget writes the moment of the last PDF export of each row.
- **Batch exports on the rows the widget shows**: "Export rows (ZIP)…", "Export rows as a single PDF…", "Export rows to DOCX (ZIP)…", the Excel rows of a grid and "Assemble before printing…" follow the filters, the sort and "Select by"; a window says how many rows are shown (12 of 340) and asks which to export.
- **List of the rows a batch export could not generate**: a window gives the file name (or "Row no. 12") and the reason.
- **Word with a real table of contents**: the table of contents comes out as Word's "Table of Contents" (a field that updates), headings 1 to 6, each line leading to its heading.
- **Markdown export**: a `.md` file (CommonMark and GFM), with the variables replaced by the values of the row, or one per row in a ZIP archive.
- **"Markdown (template)"**: the template itself, variables included, in a single `.md` file that comes back intact on import.
- **Markdown import**: "Import from Markdown…", in the "+" menu, opens a `.md` file as a new document (headings, lists, checkboxes, tables, images, quotes, GitHub alerts…).
- **HTML export**: "HTML (file to upload)" writes a complete page for a website, "HTML (content to paste)" writes only the content, to paste into an HTML block of a content manager.
- **Zimbra for "Create email"**: Settings > Email chooses the mail program, "Standard" or "Zimbra" (whose web client misreads the link).

#### Find / Replace

- **Regular expressions**: the ".*" button reads what is typed as a pattern, `$1`, `$2`… taking the groups in "Replace with".
- **Bubbles**: a variable or calculation bubble is a result when its name, its "Before", its "After", its "otherwise" or its formula contains the searched text.
- **Header and footer**: the search goes through them too, in the order of the page, and the counter counts them ("2 of 4").

#### Reading and saving

- **Grist Viewer accounts**: a person whom Grist opens read-only sees the widget in Reading mode right away, with a greyed-out bar, comments closed and free exports.
- **"Save" reminder** in the View and Access settings: a colored line reminds that these settings reach other people only after a click on "Save".

#### Undo and Redo (Ctrl+Z, Ctrl+Y)

Ctrl+Z undoes and Ctrl+Y redoes, in addition to the text:

- **comments**;
- **"Accept all" and "Reject all"**, in a single step;
- **a deleted template**;
- **template copies**: "Save as…" and a gallery template;
- **the pin, the folder and the "collapsed by default" folder** of a template;
- **the name given with the pencil** (Rename) and **the export choices** of a template;
- **the document's ★ default template**, from any template;
- **the page of the template** (format, direction, margins), the eye of a template and the composition of a macro-template;
- **the header and footer**;
- **heading numbering**;
- **the Subject, To, Cc, Bcc** of the email and the name of the PDF file;
- **links between tables**;
- **the rights of the Access tab** (the table, its columns, the Clean reading checkbox);
- **the default template of the view**, the column of the last export date and the template by row;
- **abbreviations**: add, edit, delete;
- **the keyboard keys chosen** in Settings and the trigger character of abbreviations;
- **the theme, the bubbles and chips, the insert character and the mail client** of Settings.

The language is deliberately left out of Undo.

- **Safer undo shortcuts**: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z no longer act behind an open window, even in Chrome, and also work when the focus stayed on a list or a slider of the floating bar.

#### Interface, language and accessibility

- **"What's new" window**: Settings > Credits > "What's new" opens an eleven-screen carousel with real screenshots: eight new features of the version, an "And also" screen (headings and their styles, Find / Replace, pages, dates and times, exports), what becomes of a template made with the beta, and the habits that change; the last screen leads, through "See details", to a second window, "Exporting, in detail" (five screens).
- **A greyed-out button or menu row says why**: on hover, the tooltip gives the reason (in an email template, for example, that the template is written in plain text); on click, the status corner writes the same sentence. Nothing is removed or hidden. The reasons cover the document's rights, Reading mode, the email template, the macro-template, the grid, the header and the footer, and the export types that do not fit the open template.
- **201 window texts rewritten**, in French and in English: introductions, help, errors, confirmations, status bar messages and tooltips say what you get in the document.
- **58 customizable keyboard shortcuts** (54 in the beta).

#### Speed

- **Pages of a long document computed four times faster**: page breaks are placed in one go, and the pages stay exactly the same (a 117-page text opens in 1.0 s instead of 1.5 s, on Chromium).
- **Lighter Reading mode and auto-save**: entering Reading mode draws the page only once, and auto-save no longer rebuilds the whole text on each pass.

### What changes if you come from the beta

These changes affect habits from the beta.

- **"PDF quality" becomes "Export type"**: the button to the left of "Export" chooses the export type (PDF, Protected PDF, Word, Excel, Markdown, HTML) and, for the two PDF types, their quality (Vector, Browser print, Light). The "Export" menu only lists the row and workbook options of the chosen type.
- **Export choices are kept per template**: the export type, the PDF quality and the "a single row / all rows" choice are remembered for each person and each template, and found again on any computer.
- **"Comment on selection": Ctrl+Alt+M** (⌥⌘M on Mac), like in Google Docs, instead of Alt+Shift+M; a key chosen by the person is kept, and "Default" gives back Ctrl+Alt+M.
- **"Collaborative editing"**: track changes, "Accept all" and "Reject all" are gathered under a single button (two people in profile, menu on hover). The rows keep their name, their shortcut and their effect.
- **"Read mode" menu**: two checkable rows, "Standard reading" and "Clean reading", like the "Export" menu; the button does what the checked row says.
- **Enter in a document table**: as in a grid, Enter goes down one cell and selects its text; Shift+Enter (or Ctrl+Enter) adds a line in the cell. Before, Enter split the paragraph of the cell.
- **"Row ID" becomes "Auto"** in the window that links two tables and in "Linked tables" (same effect, the rules already saved work as before).
- **"All rows" follows the linked view**: the export of all rows (PDF, Word, Excel) exports the rows of the view linked by "Select by"; before, it only followed the filter and the sort set on the widget itself.
- **List bullets, dashes and numbers**: they take the color and the size of the start of the text of their item, instead of those of the item itself (white 28 pt text on a dark background no longer gets an almost invisible black dot).
- **Margins of a macro-template**: the Margins tab of Settings says that the margins of the macro-template take precedence over those of the assembled templates.
- **The star of the default template says its role** ("at startup") in the template list and in "Organize my templates", and the list colors the icon of each kind of template: document in blue, grid in green.
- **Changing language reloads the page**: it reopens the template you were on, after the "Save / Discard / Cancel" question if there are changes; nothing is half-retranslated any more.
- **Menus that close on click**: those of Save, "+", "Read mode" and "Export type" no longer cover what you aim at right after.
- **The icon of the "Link and content blocks" menu** shows blocks, no longer the link of a chain.
- **Gallery**: the four previous templates are redone with the recent features; the templates already created from them do not change.
- **The beta stays available**: if an old template does not reopen well in the V1, the 1.0.0-beta.1 beta is still served, as it was and without fixes, at `https://grist-factory.github.io/Publipostage-Plus/beta/` (in Grist, change the address of the custom widget). The only addition is a banner, which its cross closes, recommending migrating to version 1.1; its "Discover what's new" button opens the news in a new tab. Going back is safe as long as the template has not been saved with the V1: the beta erases what it does not know (bookmarks, superscripts and subscripts, "Otherwise show").

#### Removed

- **"Low quality" and "Ultra HD"**: these two rows of the PDF quality menu, greyed out ("soon") since html2pdf.js was removed, are no longer in the interface. To lighten a PDF, the "Light" row reduces the images; for a poster, use the vector PDF and "Custom size".

### Fixes

These fixes affect what the beta already did, grouped by topic; the [changelog](CHANGELOG.md) details them one by one.

#### Fidelity between the editor, Reading mode, the PDF, Word and HTML

- **The table rows on screen have the height of those in the PDF**, in a narrow panel too: a long table is cut at the same place on screen and in the PDF, and the margin of a table counts everywhere in pagination (no page with a table grows any more).
- **Pages that carry a short table, a quote, a code block or a conditional text block no longer grow.**
- **Each page starts where it should**, even when the layout moves afterwards (a style or a font arriving after the pages were computed).
- **The text and the margins of the page follow the zoom of the sheet**, whatever the browser adds to it (seen on Firefox).
- **The panel size no longer changes anything of what a template saves**: the automatic columns of a mixed table, the column of a two-column zone and the position of layered images are measured at the real scale of the page, the same at every panel size.
- **"Make the same size" and the border of a dragged column no longer depend on the panel.**
- **Word and PDF page breaks follow the editor**; the PDF moves a paragraph that straddles the bottom of a page, whole, to the next one, like the editor.
- **No more needless blank page**: a page break that ends the document no longer opens an empty "Page 2", empty lines just before a page break no longer make a blank page, and the PDF of a macro-template no longer opens an empty page between two templates.
- **A two-column zone moves to the next page** in the editor and in Reading mode, and a table wider than its column stays within its column.
- **The horizontal rule ("---" then Space)** has the same height in the editor, Reading mode and the PDF, has the width of its block in the PDF and shows there in table cells, lists and quotes.
- **The cursor moves below the page break** when you click the button.
- **A document table comes out cleanly in every view and every export** (A4, A5, A3 pages, landscape, changed margins, merged cells, colored cells, set heights), and its row that opens a page keeps its height in the A4 preview.
- **Word**: the cap, the double line and the merged rows of a table find their place again, a narrow table keeps its width, and so does a table as wide as the page.
- **A footnote's color and a checkbox's underline and strikethrough carry over to the other exports**: HTML writes them, and the Yes / No checkbox gets them in Reading mode, the PDF and Word.

#### Lists, quotes, headings and blocks

- **A centered, right-aligned or justified bullet, number, task or quote stays so** in Word and in the PDF (list item, quote).
- **A list has, in the PDF, the checkbox, the bullet and the text of the editor**: a task list with its checkbox, a list text that starts at the same place, a list in a quote with its bullets and its bar, a quote or a list in a table cell well placed in every column.
- **The frame of a QR code that uses a column stays square** at any size.
- **A click just above or just after a conditional text block** puts the cursor in its box.
- **Heading numbering**: the first click on a numbering button of the "Heading" menu is no longer lost, the table of contents of the editor shows the numbering of the template you open, and the letters and numbers of a subheading restart at each new heading (editor and Reading mode).
- **The table of contents shows its headings as soon as you click "Done"** in a header or a footer.
- **The formatting chosen on empty table cells** (color, bold, size, font, highlight…) is no longer lost.
- **Spaces typed around a value that writes nothing no longer add up** (a conditional value not kept, an empty bubble, a hidden one, one with a hidden zero, or one with no row in its loop).
- **"1er" in dates written out in French**: the first of the month is written "1er janvier 1990" in Reading mode, the PDF, Word and the email.
- **A batch of a single row speaks in the singular** ("1 PDF generated").

#### Headers and footers

- **A logo aligned left or right stays next to the text** in Reading mode, the PDF and Word; the aligned logo of a footer appears in the PDF.
- **Bulleted and numbered lists of a header or footer keep their bullets and numbers in Word**, and empty lines no longer push the text of the page down there.
- **A header or footer taller than its zone no longer pushes the text of the page.**
- **Moving from the body to the header or footer no longer records anything in track changes** and no longer mixes up the Undo history.

#### Data, dates and References

- **Currencies, dates and numbers are written as in Grist**: a currency in English, an "Any" column that computes a date, a Reference that shows a decimal price (comma) or a number, a row ID, a Yes / No or a date, and a cell whose formula failed are written the same in the editor, Reading mode, the PDF, Word and the email.
- **The Excel file of a single row writes real dates.**
- **A list with an empty value is written without a stray comma.**
- **Condition rules read data better**: "Before a date" no longer keeps a cell without a date, "Is empty" works on a reference list with no item, and a decimal comma typed in the value of a rule ("99,5") counts as the point.
- **A "Name = Reference" link finds what the Reference shows**, and a row whose "reference list" column has several items appears under each one.
- **The link between two tables is remembered for each table of the page**: redoing one from a table no longer breaks the one of another table.
- **"Other attributes" with two Reference columns to the same table** reads the person from the clicked column.
- **The "#" list puts the columns of the page's table first**, even when that table has no row yet; opened in a grid or table cell, it can be browsed with the arrows and validated with Tab.
- **Grids**: a block of cells pasted onto rows or columns chosen by their numbers and letters is placed in full.
- **The day, month and year buttons of a date** follow the language ("D", "M", "Y" in English).
- **The client's SIRET and VAT lines show** in the invoice and the contract of the gallery (templates already created do not change).

#### Saving, names and Settings

- **Enter validates the name of a template wherever it is typed**, and an erased name no longer loses the save.
- **"Discard" really discards what was just typed**, even when auto-save was in the middle of writing.
- **A template left and reopened right away shows what was just written in it.**
- **A Grist Viewer account no longer tries to add the "Modified by" column**: no more refused write at every opening.
- **Settings opened then closed without changing anything**: Grist no longer shows "Save" and "Revert" for an empty setting, and Grist's "Revert" gives back the saved setting.
- **The Settings window keeps the same height on all nine tabs**, the row of tabs no longer jumps.
- **In the template list, the header stays stuck to the edge of the panel**, the scrolling text no longer passes over it.
- **The bar of an image left selected no longer comes back over the top bar** when you switch to Reading mode and change the export type.
- **The table bar stays shown after a "Borders" setting.**

#### Email

- **The text of the "Create email" link is faithful to the editor**: an empty paragraph, two in a row or a line break give empty lines, and paragraphs that follow each other stay stuck together.
- **An email template writes plain text only**: formatting shortcuts and typed Markdown signs no longer do anything in an email (bold and underline do not go into an email yet).
- **A line break in the subject or in an address no longer adds anything to the "Create email" link**: the subject, recipient, Cc and Bcc come from a column, and a multi-line cell used to put its line break into the link as it was, where a mail program may read it as the start of another field. The subject's line break becomes a space and an address's line break separates two recipients; the body keeps its lines.

#### Interface and accessibility

- **The area where the document is written has a name** for a screen reader.
- **Button tooltips are readable in the dark theme**, the row or tab chosen under the mouse keeps enough contrast, and fields, buttons and labels use the system font (the text of headers and footers is written in Roboto in the sheet).
- **The English interface speaks English**: the "Page break" marker of the editor and the names and keywords of the gallery's templates.

## Set apart: Grist Factory Suite

Some features only work when the widget runs inside Grist Factory Suite (GFS), Grist Factory's suite of applications: presentations (Slides+) with PowerPoint import and export, charts, live editing and PDF reading. They load libraries that the widget alone does not load: outside GFS, their commands are greyed out, with their reason, and a click explains how to go through GFS. They are not part of this note. The template gallery also shows a commercial presentation, greyed out outside GFS.
