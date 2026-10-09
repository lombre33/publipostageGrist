# Journal des modifications / Changelog

*🇬🇧 The English version of each entry follows the French one.*

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les versions suivent le
[versionnement sémantique](https://semver.org/lang/fr/). Une bêta porte le suffixe `-beta.N`.

## [{{VERSION}}] - {{DATE}}

### Ajouté

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

### Corrigé

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

### Fixed

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
