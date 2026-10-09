# Journal des modifications / Changelog

*🇬🇧 The English version of each entry follows the French one.*

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les versions suivent le
[versionnement sémantique](https://semver.org/lang/fr/). Une bêta porte le suffixe `-beta.N`.

## [{{VERSION}}] - {{DATE}}

### Ajouté

- **Exports en lot sur les lignes que le widget affiche** : « Exporter les lignes (ZIP) », « Exporter les
  lignes en un seul PDF », « Exporter les lignes en DOCX (ZIP) », les deux lignes Excel d'une grille et
  « Assemblage avant impression » partent des lignes que le widget affiche dans Grist (ses filtres, son tri,
  le lien « Sélectionner par » d'un autre widget), dans l'ordre du widget. Quand il n'en affiche qu'une
  partie, une fenêtre dit combien (12 sur 340, par exemple) et demande « Quelles lignes exporter ? » :
  « Celles affichées » (le choix mis en avant) ou « Toute la table ». Un widget qui
  affiche toute la table ne pose pas la question, et son tri se retrouve dans le fichier ; s'il n'affiche
  aucune ligne, la fenêtre le dit et ne propose que « Toute la table ». Les valeurs d'une ligne viennent
  toujours de la table : un lot garde sa forme et ses noms de fichier. Dans une grille, « lignes » devient
  « valeurs ». Si Grist ne donne pas les lignes affichées, le lot reste ce qu'il était : toute la table. Les
  lignes de menu perdent le mot « toutes ».
- **Variables dans les champs de l'e-mail et le nom du PDF** : Objet, À, Cc, Cci et le nom du PDF posent des
  bulles de variable comme le corps du modèle (`#` ouvre la liste des variables, Entrée pose la bulle), avec
  la même barre et les mêmes fenêtres : condition, « Autres attributs », boucle dans la phrase, liste,
  format. Le zéro masqué et « Un document par valeur » restent propres au corps du modèle. Un modèle
  enregistré avant se relit tel quel (même objet, mêmes adresses, même nom de fichier), la Lecture montre
  la valeur résolue, et les renommages de colonnes et de tables sont suivis dans ces champs aussi.
- **Puces dans les champs de l'e-mail et le nom du PDF** : dans l'Objet, À, Cc, Cci et le nom du PDF, `#`
  ouvre la même liste que dans le document, avec ses deux onglets ; l'onglet « Puces » y propose « Date du
  jour », « Heure actuelle », « Email de l'utilisateur » et « Nom de l'utilisateur » (la note de bas de
  page, les blocs conditionnels et le calcul restent au corps du modèle). La puce garde son vert et prend sa
  valeur du moment dans la Lecture, à « Créer l'email » et à l'export : date jj/mm/aaaa, heure hh:mm,
  adresse et nom de la personne connectée, avec le texte de repli du document quand l'un des deux ne se lit
  pas. Dans le nom du PDF, les caractères qu'un nom de fichier ne peut pas porter deviennent « _ »
  (« 08/10/2026 » donne « 08_10_2026 »). Un modèle enregistré avant se relit tel quel.
- **Texte « Avant » et « Après » d'une variable** : la fenêtre de condition d'une bulle a deux petits champs
  (40 signes, espaces comprises) dont le texte s'écrit collé à la valeur, dans le même style, dans la
  Lecture, le PDF, le Word, l'Excel, les en-têtes et les pieds de page. Il ne s'écrit pas quand la
  condition est fausse, que la valeur est vide ou qu'elle est en erreur, et il vaut aussi sans condition :
  une virgule qui disparaît avec la variable.
- **Comparer une colonne à une autre colonne** : dans la fenêtre de condition d'une bulle, d'un « Texte
  conditionnel », d'une « Valeur conditionnelle », d'une « Case conditionnelle » et des bulles des champs de
  l'e-mail, le bouton « Comparer à une autre colonne », à gauche du champ Valeur, remplace ce champ par la
  liste des colonnes, avec sa recherche : la règle compare deux colonnes de la même ligne (« Montant =
  Paye »). La comparaison suit les types comme avec une valeur saisie : deux cellules vides sont égales, les
  dates se comparent au jour, les listes à l'ordre près. Les opérateurs « vide » et « non vide » grisent le
  bouton, une règle sans autre colonne choisie est ignorée, le résumé nomme l'autre colonne entre accolades
  (`Montant = {Paye}`) et un renommage de colonne la suit. Une condition enregistrée avant se relit telle
  quelle ; les macro-modèles, « Modèle selon la ligne » et le filtre d'une boucle gardent la valeur saisie.
- **Quadrillage d'une grille en Lecture et dans les exports** : le menu « Bordures » de la barre de la case
  a une ligne à cocher « Quadrillage » (« Lecture et exports »). Décochée, la Lecture, le PDF et l'Excel de
  la grille ne dessinent plus les traits gris de départ, mais gardent ceux que vous avez posés, couleur
  « Par défaut » comprise ; l'éditeur garde son quadrillage. Une grille déjà enregistrée ne change pas tant
  que la case reste cochée. Les bordures posées avec « Par défaut » avant cette version ne se distinguent
  pas du quadrillage : elles disparaissent avec lui, à reposer.
- **Descendre dans une référence depuis les listes de colonnes** : dans la fenêtre de condition d'une bulle
  (la colonne de la règle et « Comparer à une autre colonne »), les macro-modèles, « Modèle selon la ligne »,
  « Insérer une colonne… » du QR code et le choix d'une autre colonne pour une bulle cassée, une colonne
  Référence porte la flèche « › » de la fenêtre « Autres attributs ». Un clic sur la flèche, ou la touche →
  au bout de la recherche, ouvre les colonnes de la table liée sous un fil d'Ariane (« Colonnes ›
  Responsable ») ; ←, Retour arrière ou un clic sur le fil remontent, et un clic sur la ligne garde la
  Référence elle-même. La colonne choisie plus bas est un chemin (`Projets.Responsable.Email`) que la règle
  lit de référence en référence, sans créer de lien entre les tables ; la fenêtre rouverte le montre comme un
  choix de la liste, le champ Valeur suit la dernière colonne du chemin et la recherche d'un niveau ne
  cherche que ce niveau. Le filtre et le tri d'une boucle, Réglages > Accès et les clés de correspondance
  gardent leur liste à plat ; une liste de références ne se descend pas.
- **Choisir la colonne d'une règle dans la fenêtre « Autres attributs »** : dans la fenêtre de condition d'une
  bulle (la colonne de la règle et « Comparer à une autre colonne »), la colonne choisie s'affiche dans le
  champ comme une variable du document (la même bulle bleue, avec son « # »). Un clic sur elle - ou
  Ctrl+Entrée sur le champ, ou le bouton à droite de la zone de recherche de la liste - ouvre par-dessus la
  fenêtre « Autres attributs », pour choisir la colonne en voyant sa valeur sur la ligne sélectionnée. Elle
  s'ouvre sur la table de la colonne (celle de la page, ou une autre table liée), au niveau de la colonne déjà
  choisie, qui est sélectionnée ; depuis la liste, au niveau où elle en était, avec la recherche dans son
  filtre. La flèche « › » et le fil d'Ariane descendent de Référence en Référence. « Choisir » (ou un
  double-clic sur une ligne) pose la colonne comme la liste l'aurait fait ; « Annuler » et Échap ne changent
  rien. Un clic ailleurs dans le champ (sa flèche) ouvre la liste comme avant ; les macro-modèles et le filtre
  d'une boucle gardent leur champ et n'ont ni la bulle ni le bouton.
- **« Autres attributs » d'une colonne Liste de références** : une colonne qui désigne plusieurs fiches (l'équipe
  d'un dossier, des destinataires) posée dans le document, dans l'Objet ou dans « À » d'un e-mail n'a plus
  l'icône « Autres attributs » grisée. La fenêtre montre les colonnes des fiches de la liste, avec la valeur de
  chacune à la suite (séparées par une virgule), et « Insérer » ou « Remplacer » pose le chemin
  (`#Dossiers.Equipe.Email`) qui écrit cette colonne pour toutes les fiches de la liste, dans l'ordre de la
  liste : dans « À », « Créer l'email » reprend alors toutes les adresses. Le bouton « Liste » de la bulle en chemin
  est actif aussi (le séparateur, la première, la dernière), et « Remplacer » garde le réglage de la colonne :
  un point-virgule réglé entre les valeurs reste entre les adresses, que le lien de « Créer l'email » sépare
  toujours par une virgule, comme tous les clients de messagerie la lisent. Une liste vide n'écrit rien, une fiche
  disparue est ignorée, aucun lien entre tables n'est créé, et la flèche « › » d'une colonne Référence des fiches
  continue le chemin. Le même chemin se lit dans la Lecture, le PDF, le Word, l'e-mail et l'export en lot, et
  se tape dans les champs de l'e-mail (`#Dossiers.Equipe.Em` propose « Email »). Les flèches des listes de
  colonnes et la boucle sur un chemin gardent leur règle : une liste de références ne s'y descend pas.
- **Taille commune des lignes et des colonnes choisies d'une grille** : quand plusieurs lignes (ou colonnes)
  sont choisies par leurs numéros (leurs lettres), tirer le trait de l'une d'elles les règle toutes à la
  même hauteur (largeur), en direct puis en un seul Annuler, comme dans un tableur ; une ligne ne descend
  pas sous la hauteur de son texte, la plus haute de celles choisies fixe le plancher commun. Le trait d'une
  seule ligne choisie, d'une ligne hors de la sélection, d'une case fusionnée choisie seule ou d'un bloc de
  cases qui ne couvre pas toute la largeur (toute la hauteur pour des colonnes) ne règle que sa ligne. Un
  appui sur le trait sans le bouger ne change rien, et Échap annule le geste.
- **« Sinon afficher » dans la condition d'une bulle** : la fenêtre de condition d'une bulle de variable a
  une ligne « Sinon afficher » : l'autre variable que la bulle écrit quand sa condition n'est pas remplie, au
  lieu de deux bulles côte à côte aux conditions opposées. On la choisit dans la liste des variables avec
  recherche (les colonnes de la table de la page en tête, avec la flèche « › » des Références) ; elle a son
  propre « Avant » et son propre « Après », repris de ceux de la bulle au premier choix, à changer
  (« Payée le », « Échéance : »). La ligne reste grisée tant qu'aucune règle n'est complète ; « — Aucune — »
  la retire, et « Retirer la condition » la retire avec la condition. Le sinon vaut dans la Lecture, le PDF,
  le Word, l'Excel, les en-têtes et pieds de page, les champs de l'e-mail et une ligne répétée de tableau
  (qui lit la ligne du tour) ; le format de la bulle (nombre, date, Oui / Non) passe à son sinon quand sa
  colonne est du même genre, jamais un réglage de liste ni de boucle. L'aperçu de la fenêtre dit ce que la
  ligne sélectionnée écrit et combien de lignes affichent le sinon ; la ligne est la dernière de la fenêtre,
  sous l'aperçu. Dans l'éditeur, la bulle porte une pastille « sinon » avec la variable et son texte, qui
  rougit seule quand sa colonne disparaît ; les renommages de colonnes et de tables la suivent, et la
  confirmation avant de supprimer la correspondance d'une table liée compte aussi les modèles dont seul un
  sinon lit cette table. Un modèle enregistré avant se relit tel quel.
- **Rappel « Enregistrer » dans les Réglages Vue et Accès** : les réglages de ces deux onglets (le modèle de
  la vue, « Modèle selon la ligne », les droits par personne) sont ceux de la vue : Grist n'en garde qu'un
  brouillon, que les autres personnes ne reçoivent qu'après un clic sur « Enregistrer » en haut du widget.
  Après un changement, une ligne colorée à gauche de « Fermer » le rappelle ; elle se retire au « Retour » de
  Grist et à la prochaine ouverture des Réglages. Grist ne dit pas au widget qu'on a cliqué sur
  « Enregistrer » : la ligne reste affichée jusqu'à la fermeture des Réglages, et son texte est une consigne,
  vraie aussi après le clic.
- **Comptes Lecteur de Grist ouverts en lecture seule** : une personne que Grist ouvre en Lecteur (Grist le dit
  au widget par l'adresse de la page, `readonly=true`) voit le widget en Lecture d'emblée, sans réglage à faire.
  La barre reste affichée mais grisée (Mode édition, Enregistrer, Commenter et la mise en forme y sont,
  inutilisables), les commentaires sont fermés et l'export (PDF, Word, Excel, e-mail) reste libre. Grist ne
  laisse pas un Lecteur écrire dans le document : le widget ne l'identifie donc pas (ni table des droits ni
  ligne par personne pour lui), ne lui propose pas de créer de table et ne tente aucune écriture. Réglages >
  Accès dit « Compte Lecteur dans Grist : lecture seule, export, sans commentaires. », listes et case grisées,
  et l'onglet Vue est verrouillé. Quand la case « Ouvrir les personnes en lecture seule sur la Lecture épurée »
  est cochée, ces comptes ouvrent d'emblée sur la Lecture épurée, comme une personne de la table des droits
  mise en lecture seule. Comme le widget ne sait pas qui est un Lecteur, la colonne « Export autorisé » ne
  peut pas le restreindre : son export reste ouvert.
- **Plusieurs lignes ou colonnes d'un coup dans un tableau de document** : quand plusieurs cases d'un tableau
  sont choisies, « Ligne avant », « Ligne après », « Colonne avant » et « Colonne après », dans la barre du
  tableau, ajoutent autant de lignes ou de colonnes que les cases choisies en couvrent, en un seul Annuler,
  comme dans une grille. Un simple curseur en ajoute toujours une.
- **Bordures, alignement vertical et quadrillage dans un tableau de document** : la barre du tableau d'un
  document porte, après le fond de case, le bouton « Bordures » (tous les traits, le pourtour, l'intérieur,
  un côté ou aucun, dans la couleur choisie, et la ligne à cocher « Quadrillage » pour la Lecture et les
  exports) puis « Aligner en haut », « au milieu » et « en bas », comme la barre d'une grille. Ils visent le
  tableau du curseur, ou les cases que vous avez glissées, un seul Annuler défait un réglage, et la Lecture,
  le PDF et le Word les reprennent. Avec le suivi des modifications allumé, ces quatre boutons sont grisés :
  ces réglages ne seraient pas suivis. Dans un panneau étroit, la barre passe sur deux lignes au lieu de
  déborder. Un tableau que vous n'avez pas réglé ne change pas.
- **Marge autour de chaque page dans l'assemblage avant impression** : la fenêtre « Assemblage avant
  impression » a un champ « Marge » (en millimètres, 0 au départ, les flèches avancent de 0,5) qui laisse de la
  place autour de chaque page posée sur la feuille : la marge compte de chaque côté d'une page, donc deux
  fois entre deux pages et une fois au bord de la grille. Les traits de coupe passent au milieu de l'espace
  entre deux pages, si bien que chaque morceau découpé garde sa marge. Quand la feuille ne laisse pas la
  place (quatre A6 sur une A4 avec 5 mm), toutes les pages sont réduites du même facteur, et la fenêtre le
  dit (« Pages réduites à 90 % pour laisser la place à la marge. », ou « … aux traits de coupe et à la
  marge. ») ; l'aperçu montre la feuille comme le fichier la portera. La marge est plafonnée à ce que la
  feuille accepte (les pages ne descendent jamais sous la moitié de leur taille) et le champ dit toujours la
  valeur appliquée. Avec 0, la planche est celle d'avant ; le dernier choix est gardé par navigateur avec la
  feuille et les traits de coupe. La fenêtre est un peu plus large pour tout garder lisible dans un panneau
  de 700 × 400.
- **Graphique de la page dans le document** : « Graphique de la page… », au menu « Lien et blocs de contenu »,
  pose dans le document un graphique déjà réglé dans Grist. La fenêtre liste, avec une recherche, les
  graphiques des pages du document ; le graphique se règle dans Grist (type, colonnes, tri, filtres
  enregistrés, empilement, axe logarithmique…) et le document le suit, sans second réglage. Il se redessine
  avec Plotly 2.13.2, la version de Grist, en barres, courbe, aire, nuage de points, secteurs et anneau, et
  entre dans la Lecture, le PDF, le Word et l'Excel comme une image. Deux choix de lignes : « Toute la
  table » (le même graphique partout, comme dans Grist) ou « Les lignes liées à la ligne du document » (un
  graphique propre à chaque élève, chaque facture… ; la liaison entre les deux tables se règle à la
  validation). Dans l'éditeur, le cadre garde le nom du graphique ; ses poignées changent sa largeur et sa
  hauteur et un clic le sélectionne : la ligne du menu devient « Modifier le graphique… ». Plotly se charge
  au premier graphique seulement (jsDelivr, version et empreinte figées). Ce que le widget ne redessine pas
  encore reste dans la liste, grisé, avec sa raison : widgets personnalisés, Kaplan-Meier, « Split series »,
  « Error bars », filtres sur des dates relatives. Le total d'un anneau s'écrit sans le format de la
  colonne.
- **Impression par le navigateur** : la ligne « Impression navigateur » du menu Qualité du bouton PDF, jusque-là
  grisée, imprime la Lecture par la fenêtre d'impression du navigateur (« Enregistrer au format PDF » ou une
  imprimante). La mise en page est celle de la Lecture : mêmes coupures de page, mêmes en-têtes, pieds et numéros
  de page, mêmes polices, tableaux, images et filigrane, en thème clair quel que soit le thème du widget. Le
  document est mesuré par la Lecture elle-même, puis découpé en feuilles de la taille exacte du modèle (A4, A5
  en paysage, A6, format libre) : une feuille par page de la Lecture, sans marge ajoutée par le navigateur. Une
  page de la Lecture plus haute qu'une feuille (une longue liste) continue sur la feuille suivante, coupée entre
  deux lignes, sans rien perdre. Les images d'un autre site s'impriment après la fenêtre qui les annonce, sans
  être affichées dans la Lecture pour autant. L'impression se fait une ligne à la fois et sur 60 pages au plus
  (un message dit alors de choisir le PDF vectoriel) ; les lots, le PDF fusionné, l'assemblage et « Un document
  par valeur » restent des PDF vectoriels. À savoir : le navigateur arrondit lui-même la page (l'A4 devient
  594,96 × 841,92 pt) ; choisissez « Enregistrer au format PDF », le format de papier par défaut, une échelle de
  100 % et les marges par défaut.
- **Exposant et indice** : deux icônes, Exposant (x²) et Indice (x₂), à droite du titre du menu « Lien et blocs de
  contenu » (la barre ne change pas), et les touches Ctrl+. et Ctrl+, (⌘ sous macOS), qu'on règle dans
  Réglages > Raccourcis. Elles mettent le texte choisi, ou ce qu'on tape à la suite, en exposant (m³, 1ᵉʳ) ou
  en indice (H₂O) ; poser l'une retire l'autre. Le texte est réduit à 6/10 de sa taille (celle qu'on a
  choisie, le cas échéant) sans changer la hauteur de la ligne, et le rendu est le même partout : l'éditeur,
  la Lecture, les en-têtes et pieds de page, le PDF (levé ou baissé de la même hauteur que sur l'écran), le
  Word et l'Excel (le vrai exposant ou indice du fichier, que la personne qui l'ouvre peut retirer). Dans un
  email, le lien est du texte brut : l'exposant et l'indice y sont écrits avec les caractères Unicode qui en
  tiennent lieu (m³, H₂O, 1ᵉʳ, 10⁻³) ; un groupe dont un caractère n'en a pas (« ème », une virgule, un q)
  reste écrit comme on l'a tapé, sans exposant. Un texte collé de Word ou de Google Docs garde ses exposants
  et ses indices, et le pinceau de mise en forme les copie. Les icônes sont grisées pour un macro-modèle ; la
  note de bas de page garde son rendu.

### Modifié

- **Modèle de la vue** : Réglages > Vue > « Utiliser … pour cette vue » accepte aussi un e-mail ou un
  macro-modèle, qui s'ouvre au démarrage de la vue (un macro-modèle sur son résumé, un e-mail sur son
  bandeau Objet / À / Cc) ; l'étoile du document reste réservée aux modèles ordinaires.
- **Recherche par mots** : une colonne se retrouve en tapant ses mots, dans n'importe quel ordre, avec ou
  sans « _ », « . » et « - » (« porteur 3 », « Porteur3 » et « 3 porteur » retrouvent
  `Projets.Porteur_3`), dans la liste `#` et dans toutes les listes avec recherche ; le libellé que Grist
  montre en tête de la colonne se cherche aussi. La même règle vaut pour « Organiser mes modèles », la
  galerie « Créer à partir d'un modèle » (« validé budget » retrouve « Budget validé ») et le filtre
  « Filtrer les colonnes… » d'« Autres attributs », où la valeur affichée en face se cherche aussi.
- **Menu de couleur** : le texte, le surlignage, le fond de case et le trait des bordures ouvrent la même
  palette, de dix colonnes sur cinq rangées (les gris, puis dix teintes en quatre tons, dont un ton foncé qui
  se lit en texte sur la page blanche, avec un contraste d'au moins 4,5:1), au lieu de huit nuances et d'un
  sélecteur caché sous un bouton : un clic sur une pastille pose la couleur. « Personnalisé… » ouvre la
  fenêtre « Couleur personnalisée » (un carré saturation-luminosité, un curseur de teinte, le code
  hexadécimal à 3 ou 6 chiffres, le rouge, le vert et le bleu) ; « Appliquer » pose la couleur et peut la
  garder dans deux rangées de la palette, « Couleurs du modèle » (elles voyagent avec le modèle) et
  « Couleurs du document » (partagées par tous les modèles et toute l'équipe). Une rangée garde dix
  couleurs, la plus récente d'abord ; une croix, ou Suppr au clavier, en retire une. Les couleurs du
  document sont écrites dans une ligne réservée de la table `Publipostage_Modeles` (« Réglages du
  document »), créée à la première couleur gardée pour le document : aucune table de plus, et aucune liste
  de modèles ne la montre.
- **Lignes qu'un export en lot n'a pas pu générer** : à la fin d'un export de toutes les lignes (PDF, Word ou
  Excel, en archive ZIP, en fichier unique ou en planches), quand des lignes échouent, une fenêtre les liste :
  le nom que leur fichier aurait porté (ou « Ligne n° 12 »), puis la raison - un modèle d'un genre que
  l'export ne fait pas (une grille en Word) ou l'erreur rencontrée -, avec le nombre de documents que le
  fichier contient. Le coin d'état ne renvoie plus à la console du navigateur. Les autres lignes sont
  téléchargées comme avant ; quand toutes échouent, rien n'est téléchargé et la fenêtre le dit.

### Corrigé

- **Un lot d'une seule ligne parle au singulier** : « Générer un PDF pour la ligne de … », « 1 PDF généré »,
  « 1 DOCX généré » et « 1 ligne réunie dans un seul PDF » au lieu de « 1 lignes » et « 1 PDF générés ».
- **« Autres attributs » avec deux colonnes Référence vers une même table** (Demandeur et Valideur vers un
  annuaire, par exemple) : la fenêtre part de la colonne cliquée, montre la personne de cette colonne et
  pose `#Dossiers.Valideur.Email` ; elle ne lisait qu'une seule personne pour toute la ligne. Aucun lien
  n'est créé ni changé, et avec une seule colonne Référence vers la table rien ne change.
- **Lignes et colonnes d'une grille choisies par leurs numéros et leurs lettres** : un bloc de cases copié
  puis collé sur des lignes ou des colonnes choisies est posé en entier à partir de la case en haut à gauche
  de la sélection (la grille gagne les lignes ou les colonnes qui manquent), au lieu d'être rogné à la
  taille de la sélection ; comme dans un tableur, il ne se répète que si la sélection en est un multiple
  exact (une case copiée remplit toute la ligne choisie). « Ligne avant », « Ligne après », « Colonne
  avant » et « Colonne après » ajoutent autant de lignes (de colonnes) que la sélection en couvre, en un
  seul Annuler, au lieu d'une seule.
- **Réglages ouverts puis fermés sans rien changer** : l'onglet Vue (« Modèle selon la ligne ») n'écrit plus
  un réglage vide à la fermeture des Réglages. Grist y voyait un brouillon de la vue et montrait
  « Enregistrer » et « Retour » alors que rien n'avait été touché.
- **Liste « # » ouverte dans une case de la grille ou d'un tableau** : ↑ et ↓ parcourent la liste des colonnes
  tant qu'elle est affichée, au lieu de déplacer le curseur dans la case voisine (ce qui la refermait) ;
  Tab choisit la colonne en surbrillance, comme Entrée, au lieu de passer à la case suivante. Liste
  fermée (ou sans ligne), les flèches et Tab font comme avant.
- **« Retour » de Grist avec les Réglages ouverts** : les onglets Vue et Accès reprennent le réglage enregistré
  que Grist rend (la case « Choisir le modèle selon la ligne », les listes et la case de l'onglet Accès) au lieu
  de garder le réglage annulé, et fermer les Réglages ne le réécrit plus : Grist ne remontre plus
  « Enregistrer » pour un changement qu'on vient d'annuler.
- **Largeur d'un tableau étroit dans le Word** : un tableau dont les colonnes, réglées à la main, tiennent en
  moins de la largeur de la page garde cette largeur dans le Word, comme dans l'éditeur et le PDF ; il était
  étiré à toute la page. Un tableau de la largeur de la page ne change pas.
- **« 1er » dans les dates en lettres** : le premier du mois s'écrit « 1er janvier 1990 » (« premier janvier
  mille neuf cent quatre-vingt-dix » en toutes lettres) au lieu de « 1 janvier 1990 » (« un janvier … »),
  dans la Lecture, le PDF, le Word et l'e-mail. Les autres jours, un mois en chiffres (« 01/01/1990 »), un
  mois masqué et l'interface anglaise ne changent pas.
- **Texte du lien « Créer l'email » fidèle à l'éditeur** : le texte du message a les lignes de l'éditeur, une
  pour une. Un paragraphe vide, deux de suite ou un retour à la ligne tapé (Maj+Entrée) donnent des lignes
  vides ; des paragraphes qui se suivent restent collés. Le texte laissait tomber les paragraphes vides et
  ajoutait une ligne vide entre deux blocs, d'où un écart entre l'éditeur et le message ouvert dans le
  logiciel de messagerie.
- **Un modèle e-mail n'écrit que du texte brut** : Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+E, Ctrl+Maj+S, les
  alignements (Ctrl+Maj+L, E, R, J) et les niveaux de titre (Ctrl+Alt+1 à 6) ne font plus rien dans un
  modèle e-mail, dont les boutons étaient déjà grisés (le menu des titres l'est aussi maintenant), et les
  signes de Markdown tapés (`**gras**`, `*italique*`, `~~barré~~`, `code`, `#` en début de ligne suivi d'une espace ou
  d'Entrée) y restent du texte, tels que le lien les écrit, au lieu d'être mangés pour une mise en forme que le lien ne porte pas.
  Un texte copié ailleurs perd à l'arrivée son gras, son italique, son souligné, sa couleur, sa taille,
  sa police, son alignement et ses images, ses titres deviennent des lignes simples, et il garde son texte,
  ses liens, ses listes, ses citations et ses lignes vides ; un texte brut collé garde lui aussi ses lignes
  vides. Une mise en forme restée dans un modèle plus ancien (le gras des bulles d'une notification, un
  titre, par exemple) ne s'affiche plus dans l'éditeur ni à la Lecture, sans rien changer au modèle
  enregistré. Les documents, les grilles et les macro-modèles ne changent pas.

## [1.0.0-beta.1] - 2026-10-05

Première bêta publique. Elle reprend l'alpha du 14 septembre 2026 et ajoute l'essentiel des lignes
« Bêta » de la roadmap, à l'exception de celles qui sont reportées en V1 (voir le
[README](README.md#roadmap)).

### Ajouté

- **Types de modèles** : E-mail (objet, destinataires, corps, lien `mailto:` avec jauge de longueur),
  Grille (tableur, collage depuis Excel, Google Sheets ou LibreOffice Calc, import d'un classeur
  `.xlsx`, fusion et scission de cases, export Excel) et Macro-modèle (une page de garde et des annexes
  choisies par des règles sur la ligne).
- **Enregistrement et collaboration** : enregistrement automatique avec détection de conflit, menu
  « Enregistrer » et « Enregistrer sous… », nom de modèle déjà pris devenu « nom (2) », commentaires
  avec réponses et résolution, suivi des modifications (bêta ; la barre Accepter / Refuser dit qui a
  proposé la modification), droits par personne (lecture seule, export, commentaires), rangement
  personnel des modèles (dossiers, épingles), modèle par défaut d'une vue et choix du modèle selon la
  ligne.
- **Variables et logique** : conditions d'affichage (variable, bloc de texte, valeur dans la phrase, case
  cochée), boucles sur les lignes liées, « Autres attributs », variables d'une table liée sans règle
  préalable, calculs (SOMME, MOYENNE, MIN, MAX, NB, ARRONDI), mise en forme des Oui/Non, zéro masqué,
  renommages de tables et de colonnes suivis.
- **Mise en page** : formats de page A3 à A6 en portrait ou en paysage, formats libres et nommés, marges
  par modèle, filigrane, images en calque (déplacées aux flèches du clavier, légende), citation, bloc de
  code, encadré, bloc de signature, QR code, pinceau de mise en forme, abréviations, rechercher /
  remplacer, zoom de la page à l'écran (pastille du coin, Ajuster, Ctrl + molette), fusion et scission de
  cases dans les tableaux d'un document (Word et PDF les suivent ; au saut de page, les lignes liées par
  une case fusionnée restent ensemble).
- **Lecture** : lecture épurée, guide quand le widget n'est lié à aucune ligne (et, sans l'accès complet au
  document, la même carte d'accès à la place de l'éditeur), commentaires depuis la Lecture.
- **Exports** : Word (`.docx`, bêta), un seul PDF pour toutes les lignes, assemblage avant impression
  (feuilles A4 ou A3, traits de coupe), repli de police par caractère dans le PDF (grec, cyrillique,
  vietnamien, flèches, coches, monnaies), fenêtre de confirmation avant le téléchargement d'images
  venant d'un autre site.
- **Interface** : thème clair, sombre ou celui du système, 54 raccourcis clavier personnalisables, choix
  dans des listes avec recherche pour les colonnes, tables et modèles, fenêtres communes (Tab, Échap),
  barre d'outils pensée pour un petit panneau, contrastes d'au moins 4,5:1.
- **Premier contact** : ouvert seul dans un onglet, le widget dit qu'il s'utilise dans Grist, où l'ajouter
  et à quelle adresse ; si le réseau bloque une adresse dont il dépend, ou si le démarrage dure plus de
  30 secondes, une fenêtre liste les adresses à autoriser ; toute autre erreur de démarrage affiche son
  message technique. La langue de l'interface suit celle du navigateur au premier lancement, puis le choix
  fait dans Réglages. Le numéro de version est dans Réglages > Crédits, et l'onglet a un titre, une icône
  et une description.
- **Galerie** : un avertissement rappelle que les modèles sont des exemples à adapter, pas un conseil
  juridique.
- **Dépôt** : `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `NOTICE` et
  `CARTE_DU_CODE.md` (quel fichier fait quoi, par où commencer), limites connues et roadmap à jour dans le
  README.

### Modifié

- Les bibliothèques d'export (PDF, ZIP, Excel, Word, QR code) et les scripts d'export du widget lui-même
  ne se chargent qu'au premier usage : le widget s'ouvre plus vite.
- La console du navigateur ne reçoit plus que les avertissements et les erreurs : le widget n'y raconte
  plus son démarrage.
- L'interface prend la police du système : la police Manrope n'est plus téléchargée depuis Google Fonts,
  et plus aucune police ni feuille de style ne vient d'un autre site.
- La galerie ne propose que quatre modèles : facture, contrat de prestation de services, attestation,
  courrier de relance.

### Retiré

- html2pdf.js et la qualité de PDF « raster » : le PDF est vectoriel. Les qualités « impression
  navigateur », « basse qualité » et « Ultra HD » restent grisées (« bientôt »).
- L'idée d'une version avec les dépendances embarquées, écartée pour l'instant.

### Sécurité

- Politique de sécurité du contenu (CSP) dans la page : scripts limités aux adresses connues et à trois
  scripts en ligne cités par leur empreinte.
- Le HTML d'un modèle relu depuis le document est assaini avant d'être affiché.
- Bibliothèques d'export en versions figées, avec intégrité SRI.
- Une image hébergée sur un autre site n'est chargée qu'après un clic sur « Afficher » (éditeur, Lecture,
  en-têtes et pieds de page, galerie) : ouvrir un document ne révèle plus à ce site l'adresse IP ni
  l'heure d'ouverture. Rien n'est retenu d'une séance à l'autre.
- Le widget demande l'accord de la personne avant de créer ses tables dans le document ; un refus
  n'écrit rien.
- Suites d'un audit externe (4 octobre 2026) : l'en-tête et le pied de page sont filtrés dès la lecture,
  la galerie construit ses cartes avec du texte et non du HTML, et le chargeur de scripts des exports
  refuse toute adresse hors de cdnjs, de jsDelivr (avec empreinte) et du site du widget. L'éditeur reste
  chargé depuis `esm.sh` : l'audit reste « NON CONFORME » (voir les
  [limites connues](README.md#limites-connues)).

### Corrigé

- De nombreux écarts de fidélité entre l'éditeur, la Lecture, le PDF et le Word.

## [Alpha] - 2026-09-14

Première publication : éditeur riche, variables `#Table.Colonne`, puces intelligentes, export PDF
vectoriel et en lot, gestion multi-modèles, galerie, interface bilingue.

---

## [{{VERSION}}] - {{DATE}} (English)

### Added

- **Batch exports on the rows the widget shows**: "Export rows (ZIP)", "Export rows as a single PDF",
  "Export rows to DOCX (ZIP)", the two Excel lines of a grid and "Assemble before printing" start from
  the rows the widget shows in Grist (its filters, its sort, the "Select by" link of another widget), in
  the order of the widget. When it only shows part of the table, a window says how many (12 of 340, for
  example) and asks "Which rows to export?": "Displayed rows" (the highlighted choice) or "Whole table".
  A widget that shows the whole table asks nothing, and its sort carries over to the file;
  if it shows no rows, the window says so and only offers "Whole table". The values of a row always come
  from the table: a batch keeps its shape and its file names. In a grid, "rows" becomes "values". If Grist
  does not give the displayed rows, the batch stays what it was: the whole table. The menu lines lose the
  word "all".
- **Variables in the e-mail fields and the PDF name**: Subject, To, Cc, Bcc and the PDF file name place
  variable bubbles like the template body (`#` opens the variable list, Enter places the bubble), with the
  same bar and windows: condition, "Other attributes", loop inside the sentence, list, format. Hidden zero
  and "One document per value" remain specific to the template body. A template saved earlier reads back
  as it was (same subject, same addresses, same file name), Reading mode shows the resolved value, and
  column and table renames are followed in these fields too.
- **Chips in the e-mail fields and the PDF name**: in Subject, To, Cc, Bcc and the PDF name, `#` opens the
  same list as in the document, with its two tabs; the "Chips" tab offers "Today's date", "Current time",
  "User's email" and "User's name" (the footnote, the conditional blocks and the calculation stay in the
  template body). The chip keeps its green and takes its value of the moment in Reading mode, at "Create
  email" and at export: date dd/mm/yyyy, time hh:mm, address and name of the signed-in person, with the
  document's fallback text when either cannot be read. In the PDF name, the characters a file name cannot
  hold become "_" ("08/10/2026" gives "08_10_2026"). A template saved earlier reads back as it was.
- **"Before" and "After" text of a variable**: a bubble's condition window has two small fields (40
  characters, spaces included) whose text is written glued to the value, in the same style, in Reading
  mode, the PDF, the Word file, the Excel file, headers and footers. It is not written when the condition
  is false or when the value is empty or in error, and it also applies without a condition: a comma that
  disappears with the variable.
- **Comparing a column with another column**: in the condition window of a bubble, of a "Conditional
  text", of a "Conditional value", of a "Conditional checkbox" and of the bubbles in the e-mail fields, the
  "Compare with another column" button, to the left of the Value field, replaces that field with the list
  of columns, with its search: the rule compares two columns of the same row ("Amount = Paid"). The
  comparison follows the types as with a typed value: two empty cells are equal, dates are compared by the
  day, lists regardless of order. The "vide" and "non vide" operators (empty, not empty) grey the button
  out, a rule with no other column chosen is ignored, the summary names the other column in braces
  (`Amount = {Paid}`) and a column rename follows it. A condition saved earlier reads back as it was; macro
  templates, "Template by row" and a loop's filter keep the typed value.
- **Gridlines of a grid in Reading mode and in exports**: the "Borders" menu of the cell bar has a
  "Gridlines" check row ("Reading and exports"). Unchecked, Reading mode, the PDF and the Excel file of the
  grid no longer draw the starting grey lines, but keep the ones you placed, "Default" color included; the
  editor keeps its gridlines. A grid saved earlier does not change while the box stays checked. Borders
  placed with "Default" before this version cannot be told apart from the gridlines: they disappear with
  them, so place them again.
- **Going down into a reference from the column lists**: in a bubble's condition window (the rule's column
  and "Compare with another column"), macro templates, "Template by row", the QR code's "Insert a column…" and
  the choice of another column for a broken bubble, a Reference column carries the "›" arrow of the "Other
  attributes" window. Clicking the arrow, or pressing → at the end of the search, opens the columns of the
  linked table under a breadcrumb ("Columns › Responsable"); ←, Backspace or a click on the breadcrumb go
  back up, and a click on the row keeps the Reference itself. A column picked further down is a path
  (`Projets.Responsable.Email`) that the rule reads from reference to reference, without creating a link
  between the tables; the reopened window shows it as a choice of the list, the Value field follows the
  path's last column, and the search of a level only searches that level. A loop's filter and sorting,
  Settings > Access and the matching keys keep their flat list; a list of references cannot be walked down.
- **Choosing a rule's column in the "Other attributes" window**: in a bubble's condition window (the rule's
  column and "Compare with another column"), the chosen column is shown in the field as a variable of the
  document (the same blue bubble, with its "#"). Clicking it - or Ctrl+Enter on the field, or the button to the
  right of the list's search box - opens the "Other attributes" window on top, to choose the column while
  seeing its value on the selected row. It opens on the column's table (the page's, or another linked table),
  at the level of the column already chosen, which is selected; from the list, at the level the list was at,
  with the search carried into its filter. The "›" arrow and the breadcrumb go down from Reference to
  Reference. "Choose" (or a double-click on a row) sets the column the way the list would have; "Cancel" and
  Esc change nothing. Clicking elsewhere in the field (its arrow) opens the list as before; macro templates
  and a loop's filter keep their field and have neither the bubble nor the button.
- **"Other attributes" of a Reference List column**: a column that points to several rows (a file's team, some
  recipients) placed in the document, in the Subject or in an e-mail's "To" no longer has its "Other
  attributes" icon greyed out. The window shows the columns of the rows in the list, with each one's value one
  after the other (comma-separated), and "Insert" or "Replace" sets the path (`#Files.Team.Email`) that writes
  that column for every row of the list, in the list's order: in "To", "Create the email" then takes all the
  addresses. The "List" button of the path bubble is active too (separator, first, last), and "Replace" keeps the
  column's setting: a semicolon set between the values stays between the addresses, which the link of "Create the
  email" always separates with a comma, the way every mail client reads it. An empty list writes nothing, a row
  that has gone is skipped, no link between tables is created, and the "›" arrow of a Reference column of the
  rows carries the path on. The same path reads in Reading mode,
  the PDF, the Word, the e-mail and the batch export, and can be typed in the e-mail fields (`#Files.Team.Em`
  suggests "Email"). The arrows of the column lists and a loop on a path keep their rule: a list of references
  is not walked down there.
- **Common size for the chosen rows and columns of a grid**: when several rows (or columns) are chosen by
  their numbers (letters), dragging the edge of one of them sets them all to the same height (width), live
  and then in a single Undo, as in a spreadsheet; a row never goes below the height of its text, the
  tallest of the chosen ones sets the shared floor. The edge of a single chosen row, of a row outside the
  selection, of a merged cell chosen on its own or of a block of cells that does not cover the full width
  (full height for columns) sets only its own row. Pressing the edge without moving it changes nothing, and
  Escape cancels the gesture.
- **"Otherwise show" in a bubble's condition**: the condition window of a variable bubble has an
  "Otherwise show" row: the other variable the bubble writes when its condition is not met, instead of two
  bubbles side by side with opposite conditions. It is picked in the variable list with search (the columns
  of the page's table first, with the "›" arrow of References); it has its own "Before" and its own "After",
  copied from the bubble's when a variable is first picked, to change ("Paid on", "Due: "). The row stays
  greyed until a rule is complete; "— None —" removes it, and "Remove condition" removes it along with the
  condition. The "otherwise" applies in Reading mode, the PDF, the Word, the Excel, headers and footers, the
  e-mail fields and a repeated table row (which reads the row of the turn); the bubble's format (number,
  date, Yes / No) carries over to it when its column is of the same kind, never a list or loop setting. The
  window's preview says what the selected row writes and how many rows show the "otherwise" value; the row is
  the last of the window, under the preview. In the editor, the bubble carries an "otherwise" chip with the
  variable and its text, which turns red alone when its column disappears; renames of columns and tables
  follow it, and the confirmation before deleting a linked table's matching also counts the templates where
  only an "otherwise" reads that table. A template saved before reads back as it was.
- **"Save" reminder in the Settings View and Access tabs**: the settings of these two tabs (the view's
  template, "Template by row", the per-person rights) are the view's: Grist keeps only a draft of them, which
  other people receive only after a click on "Save" at the top of the widget. After a change, a colored line
  to the left of "Close" reminds you; it goes away on Grist's "Revert" and the next time Settings open.
  Grist does not tell the widget that "Save" was clicked: the line stays until Settings are closed, and its
  text is an instruction, true after the click as well.
- **Grist Viewer accounts open read-only**: a person Grist opens as a Viewer (Grist tells the widget through
  the page address, `readonly=true`) sees the widget in Reading mode straight away, with nothing to set. The
  toolbar stays shown but greyed (Edit mode, Save, Comment and the formatting are there, unusable), comments
  are closed and export (PDF, Word, Excel, e-mail) stays free. Grist does not let a Viewer write to the
  document, so the widget does not identify them (no rights table or per-person row for them), offers them no
  table creation and attempts no write. Settings > Access reads "Viewer account in Grist: read-only, export,
  no comments.", with its lists and box greyed, and the View tab is locked. When the "Open read-only people on
  Clean reading" box is ticked, these accounts open straight on Clean reading, like a person of the rights
  table set read-only. Since the widget does not know who a Viewer is, the "Export allowed" column cannot
  restrict them: their export stays open.
- **Several rows or columns at once in a document table**: when several cells of a table are picked, "Row
  before", "Row after", "Column before" and "Column after" in the table bar add as many rows or columns as the
  picked cells cover, in a single Undo, as in a grid. A plain cursor still adds one.
- **Borders, vertical alignment and gridlines in a document table**: the table bar of a document now carries,
  after the cell background, a "Borders" button (all lines, the outline, the inside, one side or none, in the
  chosen color, and the "Gridlines" tick for Reading and the exports) then "Align to top", "to middle" and "to
  bottom", like a grid's bar. They act on the table under the cursor, or on the cells you dragged across, a
  single Undo reverts a setting, and Reading, the PDF and the Word export carry them over. With track changes
  on, these four buttons are greyed: these settings would not be tracked. In a narrow panel the bar wraps onto
  two lines instead of overflowing. A table you have not set does not change.
- **Margin around each page in sheet assembly**: the "Assemble before printing" window has a "Margin" field (in
  millimetres, 0 to start with, the arrows step by 0.5) that leaves room around each page laid on the
  sheet: the margin sits on every side of a page, so it counts twice between two pages and once at the edge
  of the grid. Crop marks run through the middle of the gap between two pages, so every piece you cut out
  keeps its margin. When the sheet has no room for it (four A6 on one A4 with 5 mm), all the pages are
  scaled down by the same factor, and the window says so ("Pages reduced to 90% to leave room for the
  margin.", or "… for the crop marks and the margin."); the preview shows the sheet as the file will carry
  it. The margin is capped at what the sheet accepts (pages never go below half their size) and the field
  always shows the value that is applied. With 0, the sheet is the one you had before; the last choice is
  kept per browser along with the sheet and the crop marks. The window is a little wider so that
  everything stays readable in a 700 × 400 panel.
- **Chart from the page in the document**: "Chart from the page…", in the "Link and content blocks" menu,
  puts a chart already set up in Grist into the document. The window lists, with a search, the charts on the
  document's pages; the chart is set up in Grist (type, columns, sort, saved filters, stacking, log axis…)
  and the document follows it, with no second setup. It is redrawn with Plotly 2.13.2, the version Grist
  uses, as bars, line, area, scatter, pie and donut, and goes into Reading, the PDF, the Word and the Excel
  as an image. Two choices of rows: "The whole table" (the same chart everywhere, as in Grist) or "The rows
  linked to the document's row" (a chart of its own for each student, each invoice…; the link between the two
  tables is set when you confirm). In the editor, the frame keeps the chart's name; its handles change its width
  and height and a click selects it: the menu row becomes "Edit chart…". Plotly loads for the
  first chart only (jsDelivr, version and hash pinned). What the widget does not redraw yet stays in the list,
  greyed, with its reason: custom widgets, Kaplan-Meier, "Split series", "Error bars", filters on relative
  dates. A donut's total is written without the column's format.
- **Browser print**: the "Browser print" line of the PDF button's Quality menu, greyed out until now, prints the
  Reading view through the browser's print window ("Save as PDF" or a printer). The layout is the Reading
  view's: same page breaks, same headers, footers and page numbers, same fonts, tables, images and watermark,
  in the light theme whatever the widget's theme. The document is measured by the Reading view itself, then cut
  into sheets of the template's exact page size (A4, A5 landscape, A6, free format): one sheet per page of the
  Reading view, with no margin added by the browser. A Reading-view page taller than a sheet (a long list)
  continues on the next sheet, cut between two lines, losing nothing. Images from another site are printed
  after the window that announces them, without being shown in the Reading view for that matter. Printing is
  one row at a time and up to 60 pages (a message then says to choose the vector PDF); batches, the merged PDF,
  sheet assembly and "One document per value" remain vector PDFs. Worth knowing: the browser rounds the page
  itself (A4 becomes 594.96 × 841.92 pt); choose "Save as PDF", the default paper size, a 100% scale and the
  default margins.
- **Superscript and subscript**: two icons, Superscript (x²) and Subscript (x₂), on the right of the title of the
  "Link and content blocks" menu (the toolbar does not change), and the keys Ctrl+. and Ctrl+, (⌘ on macOS),
  which you set in Settings > Shortcuts. They put the chosen text, or what you type next, in superscript (m³,
  1st) or subscript (H₂O); setting one removes the other. The text is reduced to 6/10 of its size (the one you
  chose, if any) without changing the height of the line, and the rendering is the same everywhere: the
  editor, Reading mode, headers and footers, the PDF (raised or lowered by the same height as on screen),
  Word and Excel (the file's real superscript or subscript, which the person who opens it can remove). In an
  e-mail, the link is plain text: superscript and subscript are written with the Unicode characters that
  stand in for them (m³, H₂O, 1ˢᵗ, 10⁻³); a group with a character that has none ("ème", a comma, a q) stays
  as it was typed, without superscript. Text pasted from Word or Google Docs keeps its superscripts and
  subscripts, and the format painter copies them. The icons are greyed for a macro template; the footnote
  keeps its look.

### Changed

- **A view's template**: Settings > View > "Use … for this view" now also accepts an e-mail or a macro
  template, which opens when the view starts (a macro template on its summary, an e-mail on its
  Subject / To / Cc banner); the document's ★ stays reserved for ordinary templates.
- **Word search**: a column is found by typing its words, in any order, with or without "_", "." and "-"
  ("porteur 3", "Porteur3" and "3 porteur" find `Projets.Porteur_3`), in the `#` list and in every
  searchable list; the label Grist shows at the top of the column is searched too. The same rule applies
  to "Organize my templates", the "Create from a template" gallery ("validé budget" finds "Budget validé")
  and the "Filter columns…" filter of "Other attributes", where the displayed value next to each column is
  searched too.
- **Color menu**: text, highlight, cell background and border line color open the same palette, ten columns
  by five rows (the greys, then ten hues in four tones, one dark enough to read as text on the white page,
  with a contrast of at least 4.5:1), instead of eight shades and a picker hidden under a button: a click on
  a swatch applies the color. "Custom…" opens the "Custom color" window (a saturation-brightness square, a
  hue slider, the 3- or 6-digit hex code, and the red, green and blue values); "Apply" applies the color and
  can keep it in two rows of the palette, "Template colors" (they travel with the template) and "Document
  colors" (shared by every template and the whole team). A row keeps ten colors, the most recent first; a
  cross, or Delete on the keyboard, removes one. The document colors are written to a reserved row of the
  `Publipostage_Modeles` table ("Réglages du document"), created when the first color is kept for the
  document: no extra table, and no template list shows it.
- **Rows a batch export could not generate**: at the end of an export of all the rows (PDF, Word or Excel,
  as a ZIP archive, a single file or sheets), when some rows fail, a window lists them: the name their file
  would have had (or "Row #12"), then the reason - a template of a kind the export does not make (a grid
  in Word) or the error met -, with the number of documents the file contains. The status corner no longer
  points to the browser console. The other rows are downloaded as before; when all of them fail, nothing is
  downloaded and the window says so.

### Fixed

- **A batch of one row speaks in the singular**: "Generate a PDF for the row in …", "1 PDF generated",
  "1 DOCX file generated" and "1 row combined into a single PDF" instead of "1 PDFs generated".
- **"Other attributes" with two Reference columns to the same table** (Requester and Approver pointing to
  a directory, for example): the window starts from the clicked column, shows the person of that column
  and places `#Dossiers.Valideur.Email`; it used to read a single person for the whole row. No link is
  created or changed, and with a single Reference column to the table nothing changes.
- **Rows and columns of a grid chosen by their numbers and letters**: a block of cells copied and pasted onto
  chosen rows or columns is placed in full from the top-left cell of the selection (the grid gains the rows
  or columns it lacks), instead of being cropped to the size of the selection; as in a spreadsheet, it
  repeats only when the selection is an exact multiple of it (one copied cell fills the whole chosen row).
  "Row before", "Row after", "Column before" and "Column after" add as many rows (columns) as the selection
  covers, in a single Undo, instead of one.
- **Settings opened then closed without changing anything**: the View tab ("Template by row") no longer
  writes an empty setting when Settings close. Grist saw it as a draft of the view and showed "Save" and
  "Revert" although nothing had been touched.
- **"#" list open in a cell of a grid or a table**: ↑ and ↓ now walk the list of columns while it is
  displayed, instead of moving the cursor to the neighbouring cell (which closed it); Tab picks the
  highlighted column, like Enter, instead of going to the next cell. With the list closed (or empty),
  the arrows and Tab work as before.
- **Grist's "Revert" with Settings open**: the View and Access tabs take back the saved setting that Grist
  hands back (the "Pick the template from the row" box, the lists and the box of the Access tab) instead of
  keeping the cancelled one, and closing Settings no longer writes it again: Grist no longer shows "Save"
  again for a change that was just cancelled.
- **Width of a narrow table in Word**: a table whose hand-set columns add up to less than the page width
  keeps that width in Word, as in the editor and the PDF; it used to be stretched to the full page. A table
  as wide as the page does not change.
- **"1er" in dates written in letters**: the first of the month is written "1er janvier 1990" ("premier
  janvier mille neuf cent quatre-vingt-dix" in full words) instead of "1 janvier 1990" ("un janvier …"), in
  the Reading mode, the PDF, the Word file and the e-mail. Other days, a month in digits ("01/01/1990"), a
  hidden month and the English interface do not change.
- **The text of the "Create the email" link matches the editor**: the text of the message has the editor's
  lines, one for one. An empty paragraph, two in a row or a typed line break (Shift+Enter) give blank
  lines; paragraphs that follow each other stay together. The text used to drop empty paragraphs and add a
  blank line between two blocks, so the message opened in the mail client differed from the editor.
- **An e-mail template only writes plain text**: Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+E, Ctrl+Shift+S, the
  alignments (Ctrl+Shift+L, E, R, J) and the heading levels (Ctrl+Alt+1 to 6) no longer do anything in an
  e-mail template, whose buttons were already greyed out (the heading menu is now too), and typed Markdown
  signs (`**bold**`, `*italic*`, `~~strike~~`, `code`, `#` at the start of a line followed by a space or Enter) stay text there, as the
  link writes them, instead of being eaten for formatting the link does not carry.
  Text copied from elsewhere loses its bold, italic, underline, colour, size, font, alignment
  and images on arrival, its headings become plain lines, and it keeps its text, links, lists, quotes and
  blank lines; pasted plain text keeps its blank lines too. Formatting left over in an older template (the
  bold on the bubbles of a notification, a heading, for example) is no longer shown in the editor or in
  Reading mode, without changing the saved template. Documents, grids and macro-templates do not change.

## [1.0.0-beta.1] - 2026-10-05 (English)

First public beta. It builds on the 14 September 2026 alpha and adds most of the roadmap's "Beta" lines,
except those postponed to V1 (see the [README](README.md#roadmap-1)).

### Added

- **Template types**: E-mail (subject, recipients, body, `mailto:` link with a length gauge), Grid
  (spreadsheet, paste from Excel, Google Sheets or LibreOffice Calc, `.xlsx` workbook import, cell merge
  and split, Excel export) and Macro template (a cover page and appendices chosen by rules on the row).
- **Saving and collaboration**: autosave with conflict detection, "Save" and "Save as…" menu, a taken
  template name becomes "name (2)", comments with replies and resolution, track changes (beta; the
  Accept / Reject bar says who proposed the change), per-person rights (read-only, export, comments),
  personal organization of templates (folders, pins), a view's default template and template choice by
  row.
- **Variables and logic**: display conditions (variable, text block, value in a sentence, checked box),
  loops over linked rows, "Other attributes", variables from a linked table without a prior rule,
  calculations (SUM, AVERAGE, MIN, MAX, COUNT, ROUND), formatting of Yes/No values, hidden zero, tracked
  table and column renames.
- **Layout**: A3 to A6 page formats in portrait or landscape, free and named formats, per-template
  margins, watermark, layered images (moved with the arrow keys, caption), quote, code block, callout,
  signature block, QR code, format painter, abbreviations, find / replace, on-screen page zoom (corner
  pill, Fit, Ctrl + wheel), merging and splitting cells in document tables (Word and PDF follow; at a
  page break, rows tied by a merged cell stay together).
- **Reading**: clean reading, a guide when the widget is not linked to any row (and, without full access to
  the document, the same access card in place of the editor), comments from Reading mode.
- **Exports**: Word (`.docx`, beta), a single PDF for all rows, sheet assembly before printing (A4 or A3
  sheets, crop marks), per-character font fallback in the PDF (Greek, Cyrillic, Vietnamese, arrows,
  check marks, currencies), a confirmation window before downloading images from another site.
- **Interface**: light, dark or system theme, 54 customizable keyboard shortcuts, searchable pickers for
  columns, tables and templates, shared windows (Tab, Esc), toolbar designed for a small panel,
  contrast of at least 4.5:1.
- **First contact**: opened alone in a browser tab, the widget says it is used inside Grist, where to add
  it and at which address; if the network blocks an address it depends on, or if startup takes more than
  30 seconds, a window lists the addresses to allow; any other startup error shows its technical
  message. The interface language follows the browser's on first launch, then the choice made in
  Settings. The version number is in Settings > Credits, and the tab has a title, an icon and a
  description.
- **Gallery**: a notice reminds that the templates are examples to adapt, not legal advice.
- **Repository**: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `NOTICE` and
  `CARTE_DU_CODE.md` (which file does what, where to start), known limitations and an up-to-date roadmap
  in the README.

### Changed

- The export libraries (PDF, ZIP, Excel, Word, QR code) and the widget's own export scripts only load on
  first use: the widget opens faster.
- The browser console now only receives warnings and errors: the widget no longer narrates its startup
  there.
- The interface uses the system font: the Manrope font is no longer downloaded from Google Fonts, and no
  font or stylesheet comes from another site any more.
- The gallery only offers four templates: invoice, service agreement, certificate, payment reminder
  letter.

### Removed

- html2pdf.js and the "raster" PDF quality: the PDF is vector. The "browser print", "low quality" and
  "Ultra HD" qualities remain greyed out ("soon").
- The idea of a version with bundled dependencies, set aside for now.

### Security

- Content Security Policy (CSP) in the page: scripts limited to known addresses and to three inline
  scripts cited by their hash.
- The HTML of a template read back from the document is sanitized before being displayed.
- Export libraries at pinned versions, with SRI integrity.
- An image hosted on another site is only loaded after a click on "Show" (editor, Reading mode, headers
  and footers, gallery): opening a document no longer tells that site the IP address or the time of
  opening. Nothing is remembered from one session to the next.
- The widget asks for the person's consent before creating its tables in the document; a refusal writes
  nothing.
- Follow-ups to an external audit (October 4, 2026): headers and footers are filtered as soon as they
  are read, the gallery builds its cards from text rather than HTML, and the export script loader refuses
  any address outside cdnjs, jsDelivr (with an integrity hash) and the widget's own site. The editor is
  still loaded from `esm.sh`: the audit stays "NON CONFORME" (see the
  [known limitations](README.md#known-limitations)).

### Fixed

- Many fidelity gaps between the editor, Reading mode, the PDF and the Word file.

## [Alpha] - 2026-09-14 (English)

First release: rich editor, `#Table.Column` variables, smart chips, vector and batch PDF export,
multi-template management, gallery, bilingual interface.
