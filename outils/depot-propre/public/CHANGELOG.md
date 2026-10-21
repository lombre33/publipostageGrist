# Journal des modifications / Changelog

*🇬🇧 The English version of each entry follows the French one.*

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les versions suivent le
[versionnement sémantique](https://semver.org/lang/fr/). Une bêta porte le suffixe `-beta.N`.

## [{{VERSION}}] - {{DATE}}

### Ajouté

- **Une fenêtre des nouveautés, avec de vraies captures** : Réglages > Crédits gagne une ligne « Nouveautés », sous la version, qui ouvre un carrousel de neuf écrans : sept nouveautés
  de la version 1.0 en images (la Boucle, l'historique des versions, la galerie de modèles, les signets, puis, par Grist Factory Suite, l'écriture en direct, les présentations et le
  graphique de la page, étiquetés « Grist Factory Suite »), puis deux écrans « avant → après » : ce que devient un modèle fait avec la bêta, et les habitudes qui changent. Le dernier
  écran mène, par « Voir en détail », à une seconde fenêtre, « Exporter, en détail » : cinq écrans de captures numérotées (le bouton « Type d'export » et son menu, les trois qualités du
  PDF, « une seule ligne / toutes les lignes », plusieurs pages sur une feuille, le PDF protégé). Les points du bas passent d'un écran à l'autre (un seul arrêt de Tab, les flèches
  changent d'écran) ; Échap ferme une fenêtre à la fois et rend le focus au bouton qui l'avait ouverte ; tous les écrans ont la même hauteur, la fenêtre ne saute pas. Les images sont
  celles du vrai widget, en français et en anglais (`img/news/`, en WebP, 0,6 Mo en tout) ; si l'une ne vient pas, le texte et la hauteur de l'écran restent. Rien ne l'ouvre toute seule
  pour l'instant, et elle ne note rien, ni dans le navigateur ni dans le document. Le code est dans `js/whats-new.js` (`WhatsNew.open`, `WhatsNew.openExport`) et `css/whats-new.css`.

- **Un bouton « Comme dans Grist » dans la barre d'un nombre ou d'une date** : une pipette lit le format d'affichage de la colonne dans Grist (devise - €, $, £... -, pourcentage,
  nombre de décimales, séparateur de milliers, format de la date et de l'heure) et le pose sur la bulle d'un clic, d'un seul Annuler. Rien n'est posé tout seul : un modèle existant
  s'écrit comme avant. L'info-bulle du bouton montre ce que le clic écrit (« Comme dans Grist : 1 234,57 € ») et ajoute « (approché) » quand le widget ne sait pas écrire exactement
  pareil : un mois en toutes lettres s'écrit dans la langue de l'interface là où Grist l'écrit toujours en anglais, une heure en 12 h s'écrit « 11:30 PM » ou « 11:30pm » (identique seulement pour le
  « h:mm A » et le « h:mma » de Grist, son réglage de départ : « 09:05 AM », avec son zéro de tête, reste approché), les secondes et le fuseau, les parenthèses d'un négatif, le nom du jour devant une date en chiffres, les points
  ou tirets d'une date et le mot ou la virgule qui lie la date à l'heure ne sont pas repris. Le bouton est grisé, avec sa raison en info-bulle,
  quand le widget ne peut pas l'écrire : un calcul (il n'a pas de colonne Grist), l'écriture scientifique, une date dont le mois vient avant le jour dans une interface française (elle
  se lirait à l'envers), un format de date inconnu, une devise du document illisible (saisissez-la dans la case Devise) ; et « Déjà écrit comme dans Grist » quand la bulle l'est. Le clic
  relit la colonne : un réglage changé dans Grist à l'instant est pris en compte. La barre d'un nombre gagne une case « % » (0,256 s'écrit « 25,6 % » ; elle exclut la devise et « Lettres »,
  le dernier choix reste) et la liste des décimales montre « 0 à 10 » pour un « au moins, au plus » de Grist. La Lecture, le PDF, le Word, l'e-mail et l'Excel écrivent le même texte ;
  dans l'Excel, une case typée garde le pourcentage et ses décimales (`#,##0.00 %`). Le code est dans `js/variable-format.js` (`gristColumnFormat`, `applyGristFormat`) et
  `js/grist-api.js` (`getColumnFormatOptions`, `getDocumentSettings`).

- **Une Boucle sur toutes les lignes d'une table** : l'icône Boucle de la barre d'une bulle n'est plus grisée sur une colonne ordinaire de la table
  de la page, ni sur une table dont aucune ligne n'est rattachée à la ligne affichée. La fenêtre « Boucle » propose « Lignes de « Clients » » : « Comme la vue Grist (son filtre
  et son tri) », choisi d'office pour la table de la page (les lignes que le widget montre, dans l'ordre de la vue : un filtre ou un tri posé dans Grist, enregistré ou non, s'y
  retrouve), ou « Toute la table (sans le filtre de Grist) », dans l'ordre des lignes de la table. Pour une variable qui a aussi des lignes rattachées à la ligne affichée (table
  liée, colonne Liste de références), un choix « Rattachées à la ligne affichée » ou « Toutes les lignes de la table » vient en tête de la fenêtre. La ligne du tableau (ou l'élément
  de liste, le paragraphe, la variable seule) se répète alors pour chaque ligne, avec toutes ses variables : celles de la même table lisent la ligne du tour, celles d'une autre
  table liée par une règle « match » ou par une colonne Référence lisent les lignes qui vont avec cette ligne-là. Filtre, tri, texte de repli et séparateurs se règlent comme
  pour les lignes rattachées ; une zone qui répète toutes les lignes d'une table peut contenir une boucle intérieure (pour chaque facture ses lignes). Au-delà de mille lignes,
  la fenêtre prévient que la Lecture peut devenir lente (le PDF reste rapide). Dans une ligne de tableau qui porte d'autres variables ou calculs, choisir « La variable, dans sa cellule » (au lieu de « La ligne du tableau ») écrit sous le choix combien de ces autres bulles ne suivront pas la boucle - seule cette cellule est répétée - et comment les faire suivre ; la note ne compte que la ligne de la bulle et ne vient ni pour une variable seule dans sa ligne ni dans une phrase. Dans la barre du tableau, un bouton « Répéter la ligne » (l'icône Boucle, après les alignements) ouvre cette même fenêtre pour la ligne où est le curseur : il choisit tout seul la bulle de la ligne qui peut la répéter (celle qui a des lignes rattachées d'abord, puis celle qui parcourt toute sa table), « La ligne du tableau » est choisie et toutes les autres bulles de la ligne suivent ; il s'allume quand la ligne est déjà répétée (de n'importe quelle case de la ligne) et rouvre alors la fenêtre de la bulle qui la répète ; il est grisé, avec sa raison, quand la ligne n'a pas de variable à répéter, que plusieurs lignes sont sélectionnées, qu'une case fusionnée traverse la ligne ou qu'un tableau lié est verrouillé. La Lecture se redessine toute seule quand Grist dit que les lignes de la vue ont changé (un filtre
  posé ou retiré, une ligne ajoutée ou modifiée) ; le PDF, le Word, les lots et l'e-mail lisent la vue au moment de l'export. Le widget ne voit que les lignes de son propre bloc :
  un filtre posé sur un autre tableau de la page n'y change rien. Le code est dans `js/loop-rules.js` (`allSourceFor`), `js/variable-loop.js` et `js/batch-scope.js`
  (`onViewChange`).

- **Des signets, et des liens qui y mènent** : la ligne « Signet… » du menu « Lien et blocs de contenu » (la deuxième, sous « Lien… ») donne un nom au paragraphe ou au titre où est
  le curseur. Un petit drapeau gris dans la marge de l'éditeur le montre (rien dans le document, rien de décalé ; un clic dessus rouvre la fenêtre, qui renomme ou retire le signet
  et dit combien de liens y mènent). La fenêtre « Lien… » a un second choix, « Dans ce document » : la liste, avec recherche, des titres et des signets ; un titre qui n'a pas de
  signet reçoit son adresse avec le lien, d'un seul Annuler. Un lien se suit comme un lien du web : Ctrl/⌘+clic dans l'éditeur (la cible vient en haut de la zone visible et le
  curseur y est), un clic ou Entrée à la Lecture, et l'info-bulle nomme la cible. Le PDF mène à la ligne du signet, sur sa page, aussi dans le PDF unique ; le Word écrit un signet
  et un lien interne ; le HTML un `id` et un lien `#…` ; le Markdown une ancre `<a id>` et un lien `[texte](#…)` (le Markdown « modèle » garde le nom du signet, et l'import le
  retrouve) ; l'e-mail en texte brut et l'Excel n'écrivent que le texte du lien. Un lien dont la cible n'existe plus n'est que du texte partout, et la fenêtre le dit. Un signet se
  pose sur un paragraphe ou un titre du texte (pas dans un tableau, une liste, une colonne, un encadré, un en-tête ou un pied de page : la ligne est alors grisée, avec sa raison) ;
  les planches de « Assemblage avant impression » n'ont aucun lien. La barre d'outils ne change pas ; le menu de la chaîne, qui a maintenant huit lignes, est resserré dans un
  panneau bas pour tenir dans 700 × 400. Le code est dans `js/anchors.js` et `js/bookmark-dialog.js`.

- **L'écriture en direct s'allume toute seule pour les personnes qui ont le modèle ouvert** : quand une personne allume l'écriture en direct d'un modèle, celles qui l'ont
  ouvert - déjà là, ou arrivées ensuite - la rejoignent sans rien faire, sans la question « Rejoindre l'écriture en direct ? » (la ligne du menu garde sa question pour qui
  allume elle-même un modèle déjà en direct). Rien de ce qu'on a sous les yeux n'est remplacé : ni du texte tapé et pas encore enregistré, ni un texte enregistré ici que le
  groupe n'a pas, ni la Lecture, une question, un export ou un conflit à trancher ; la ligne du menu reste alors le chemin. Qui arrête le direct, ou refuse de le rejoindre,
  n'y est pas ramené avant d'avoir rouvert le modèle ; chaque modèle a son propre direct, et un direct que plus personne n'occupe n'attire personne. Il faut que l'extension
  « Édition collaborative » soit activée dans Grist Factory Suite : la coche vaut pour tout le document, et une page déjà ouverte ne la reçoit qu'à son rechargement. Sans elle
  (et dans le widget seul), rien n'est lu ni chargé. Avec elle, le widget lit
  toutes les 3 s la table du direct du document (la liste des tables tant qu'elle n'existe pas) ; ni le code de l'extension ni le fichier de Grist Factory Suite ne sont
  demandés avant qu'un direct vive. Le code est dans `js/live-entry.js` et dans le mode « rejoindre seulement » de `extensions/edition/`.

- **Les lignes d'un sommaire mènent à leurs titres, partout** : dans l'éditeur, un clic sur une ligne de l'aperçu du sommaire amène le titre en haut de la zone visible et y pose
  le curseur (ce qu'on tape ensuite entre dans ce titre) ; le vide à droite d'une ligne sélectionne toujours le bloc, pour le supprimer ou le copier. Dans la Lecture, un clic, ou
  Entrée et Espace sur une ligne atteinte avec Tab, fait de même. Dans le PDF, le texte et le numéro de page de chaque ligne sont des liens qui mènent au haut du titre, sur sa page,
  aussi dans le PDF unique qui réunit toutes les lignes d'une table (le PDF n'écrit une destination par titre que si le modèle a un sommaire ; les planches de « Assemblage avant
  impression », faites pour être imprimées, n'ont aucun lien). Le Word, le HTML et le Markdown menaient déjà aux titres. Une ligne garde la couleur du sommaire, sans le bleu des
  liens du texte ; elle ne se souligne qu'au survol et quand le clavier y est. Le geste est dans `js/toc-links.js`.

- **La bande des diapositives, à gauche d'une présentation** (extension « Diapositives » de Grist Factory Suite) : en Édition, une miniature par diapositive, dans
  l'ordre, celle du curseur cochée ; un clic sur une miniature mène à sa diapositive. Le menu d'une diapositive (le bouton « ⋯ » de sa miniature, un clic droit, ou Maj+F10)
  en ajoute une après elle, la duplique, la monte, la descend ou la supprime ; « Ajouter », au bas de la bande, ajoute une diapositive vide après celle du curseur, où l'on
  écrit aussitôt. Chaque geste se défait d'un seul Ctrl+Z ; une présentation garde au moins une diapositive, et ce qui ne s'applique pas (monter la première…) est grisé avec
  sa raison. Au clavier, la bande est une liste (Échap puis Tab y mènent depuis le texte) : ↑ et ↓ vont d'une diapositive à l'autre, Ctrl+↑ et Ctrl+↓ la déplacent, Suppr
  l'efface, Entrée et Échap rendent le clavier au texte. Une diapositive dont le contenu dépasse continue sur une page de plus, comme un document, et sa miniature porte un
  point rouge. Une diapositive vide ajoutée à la fin a sa page tout de suite, dans l'éditeur, la Lecture, le PDF et le Word, comme une diapositive vide au milieu ; un
  document qui finit sur un saut de page reste sans page blanche. Le PDF d'une présentation, seul ou en lot, ne signale plus de page blanche : une diapositive vide est
  voulue (un document garde l'avertissement). Les sauts de page qui séparent les diapositives ne se voient plus dans l'éditeur (leur place reste, la pagination ne change pas) ;
  celui qu'une flèche ou un clic sélectionne se voit, pour qu'on sache ce que Suppr efface ; un document garde ses sauts de page visibles. Une présentation chargée (70
  diapositives d'images, de graphiques et de tableaux) reste légère : la bande ne copie que les miniatures qu'elle montre, et un peu au-delà (les autres en arrivant, quand
  elle défile), une diapositive qui change de place garde sa miniature, et chaque geste de la bande ne refait la pagination de l'éditeur qu'une fois. Les images posées devant
  ou derrière le texte (formes, photos) suivent leur diapositive : quand elle monte ou descend, ou qu'une diapositive d'avant est ajoutée, dupliquée, supprimée ou se met à
  dépasser, elles changent de page avec elle, dans l'éditeur, la Lecture, le PDF et le Word, et un Ctrl+Z les ramène avec le geste ; une image répétée sur toutes les pages reste
  où elle est. Une diapositive se copie et se colle (Ctrl+C, Ctrl+V), d'une présentation à l'autre et d'un onglet du navigateur à l'autre : Ctrl+C copie celle de la miniature
  qui a le clavier, ou, dans le texte, celle du curseur quand rien n'y est sélectionné (le coin d'état le dit) ; Ctrl+V la colle après la miniature, ou après la diapositive du
  curseur, avec son texte, ses images et ses formes, posées sur sa nouvelle page, et un seul Ctrl+Z la retire ; ce qui appartient à la présentation d'où elle vient y reste
  (l'image de toutes ses pages, les commentaires), et un texte sélectionné se copie comme toujours. « Importer », sous « Ajouter », ouvre à droite un volet qui reste ouvert
  (la page se réduit à la place qui reste) : on y choisit une autre présentation du document dans la liste avec recherche, ses diapositives s'y montrent en miniatures, et
  chaque clic (ou Entrée) sur l'une d'elles la copie après la diapositive du curseur, comme un collage : son texte, ses images et ses formes, sans l'image de toutes ses
  pages ni les commentaires ; chaque import est un Ctrl+Z à lui. Sur une présentation de 70 diapositives chargées, le volet ne dessine que les miniatures qu'il montre. La case « Garder liée », dans le volet,
  importe la diapositive liée à son original : ce qui change d'un côté arrive de l'autre, avec l'enregistrement de la présentation qui change et à la lecture suivante de l'autre, sans
  entrer dans son historique ; sa miniature porte une pastille de lien. Changée des deux côtés, une fenêtre montre les deux versions en miniatures : « Garder celle d'ici », « Prendre
  l'autre » (un Ctrl+Z la rend) ou « Plus tard ». Le menu ⋯ d'une diapositive liée en choisit le sens (« Dans les deux sens » ; « Suit la source », dont le texte refuse alors la
  frappe ; « Envoie à la source », qui verrouille l'original, un cadenas sur sa miniature), compare les deux versions ou la détache. Le lien est un repère caché à la fin de la
  diapositive, que la Lecture, le PDF, le Word, le diaporama et les lots ne voient jamais ; dupliquée ou collée, une diapositive liée arrive sans son lien ; pendant le suivi des
  modifications ou l'écriture en direct, rien ne se synchronise et ses gestes sont grisés avec leur raison. « Présenter », le bouton ▶ à
  gauche de la pastille du zoom (ou Maj+F5), lance le diaporama depuis la diapositive du curseur, F5 depuis la première : la présentation en plein écran, fond noir, une diapositive à
  la fois, aussi grande que l'écran le permet, telle que la Lecture la rend pour la ligne choisie (variables remplies, en-têtes et pieds, formes et images posées sur leur page) ; →,
  Espace, Entrée, un clic ou la molette avancent, ← recule, Début et Fin vont à la première et à la dernière, un écran noir dit la fin ; la souris qui bouge montre une petite barre
  (précédente, numéro, suivante, quitter) ; Échap quitte, le document n'a pas bougé. Quand le cadre refuse le plein écran (Grist Factory Suite tant qu'il ne l'autorise pas à son
  cadre), le diaporama prend tout le panneau du widget. Une miniature se glisse à la souris jusqu'à sa nouvelle place : une ligne dit où elle se posera, la bande défile près de
  ses bords, Échap annule, et un Ctrl+Z la remet. « Ajouter » propose cinq mises en page : Vide, Titre, Titre et contenu, Deux colonnes et Titre de section, avec leur texte
  à remplacer déjà posé. Plusieurs diapositives se choisissent ensemble (Ctrl+clic, Maj+clic, Maj+↑ ↓, Ctrl+A dans la bande) : Dupliquer, Monter,
  Descendre, Supprimer, Ctrl+C et le glisser s'appliquent alors à toutes, et un Ctrl+Z les défait d'un coup. La barre d'outils ne change pas. Si
  Grist Factory Suite éteint l'extension pendant qu'une présentation est ouverte, la bande reste : ses miniatures mènent toujours à leur diapositive, ses gestes sont grisés avec leur raison et leur clic ouvre l'installation. Le code de la bande
  (`extensions/diapositives/`) ne se charge qu'avec l'extension, et n'exige aucune bibliothèque.

- **Les présentations, un cinquième type de modèle** (extension « Diapositives » de Grist Factory Suite) : le menu « + » a une ligne « Nouvelle présentation »,
  entre « Nouveau macro-modèle » et « Nouvelle grille ». Une présentation est un modèle du même éditeur que les documents (titres, listes, colonnes, tableaux, images, variables,
  conditions, en-tête et pied de page, Lecture, exports) dont la page est une diapositive 16:9 en paysage (33,87 × 19,05 cm, le format « grand écran » de PowerPoint) : chaque
  saut de page commence une diapositive. Le bouton de la page et l'aperçu la nomment « 16:9 », et son menu la change comme celle d'un document. Elle s'enregistre sous le type
  « presentation » (colonne `TypeModele`, sa page dans `Margins`) et s'ouvre depuis la liste des modèles (une icône d'écran), le modèle de la vue, une règle de ligne ou
  l'explorateur de Grist Factory Suite ; elle n'est jamais le modèle par défaut du document (son étoile est grisée, avec la raison), ni écrite en direct. Sans l'extension (le
  widget seul, ou Grist Factory Suite qui ne l'a pas activée), la ligne du menu est grisée avec sa raison, jamais retirée : son clic dit qu'il faut passer par Grist Factory
  Suite, ou ouvre son installation. Les présentations restent alors dans la liste, grisées avec leur raison, jamais ouvertes ni perdues : leurs variables suivent les colonnes
  renommées dans Grist, et une présentation déjà ouverte quand l'extension s'éteint s'enregistre toujours sous son type. L'extension n'exige aucune bibliothèque ;
  `js/slides-entry.js` en est le seul point d'entrée pour le reste du widget.

- **L'écriture en direct, pour le texte d'un modèle** (extension « Édition collaborative » de Grist Factory Suite) : le menu « Édition collaborative » a une quatrième
  ligne, « Écriture en direct ». Plusieurs personnes écrivent en même temps le texte d'un même modèle Document : chacune voit le curseur et le nom des autres, une barre
  sous la barre d'outils dit qui est là (« 1 autre personne », une pastille par personne, un bouton « Arrêter »), et Annuler et Rétablir ne défont que ses propres frappes.
  Une personne qui ouvre le direct d'un modèle déjà écrit en direct est d'abord interrogée (« Rejoindre l'écriture en direct ? ») : le texte qu'elle voyait est remplacé par celui
  du groupe. Une seule personne enregistre le modèle pour tout le monde (la première de la liste, parmi les pages visibles ; si elle cache ou ferme sa page, la suivante) :
  les autres n'enregistrent que leurs réglages propres, et le bandeau « modifié ailleurs » ne vient qu'à celle qui enregistre. Tant que le direct dure, l'en-tête et le pied de
  page, le suivi des modifications (avec « Tout accepter » et « Tout refuser »), les tableaux liés et la restauration d'une version sont fermés : grisés ou estompés, jamais
  retirés, avec leur raison, et un clic l'explique ; la Recherche ne parcourt que le corps du texte. La ligne elle-même est grisée, avec sa raison, pour un modèle e-mail, une
  grille, un macro-modèle, un modèle pas encore enregistré ou un document en lecture seule, et sans l'extension (le widget seul : son clic dit qu'il faut passer par Grist Factory
  Suite ; hébergé, un fichier de Grist Factory Suite qui ne se charge pas est dit dans une fenêtre, et le clic suivant réessaie). Les frappes passent par la table
  `Publipostage_Direct` du document (créée au premier direct, relue toutes les 250 ms quand une autre personne est là et 2 s seule, vidée par la dernière personne qui part) ; la
  bibliothèque (Yjs et les extensions de TipTap qui s'en servent) est UN fichier assemblé que Grist Factory Suite donne et que le widget charge par `<script type="module">` avec son
  empreinte : ni la carte d'importation ni la politique de sécurité du contenu n'ont changé. Le code est dans `extensions/edition/` ; `js/live-entry.js` en est le seul point
  d'entrée pour le reste du widget.

- **Hébergé par Grist Factory Suite (GFS), le widget ouvre le modèle que GFS désigne** : un double-clic sur un modèle dans l'explorateur de GFS ouvre
  Publipostage+ sur ce modèle, au démarrage (avant le modèle de la ligne, celui de la vue et le ★) comme quand le widget est déjà ouvert (le même chemin que la liste des
  modèles : la question « Enregistrer / Abandonner / Annuler » se pose si des modifications attendent, et GFS reçoit la réponse de la personne). Le coin d'état dit
  « Ouvert depuis l'explorateur. ». Rien n'est écrit : ni le modèle de la vue, ni le ★, ni aucun réglage, donc pas d'« Enregistrer » à faire dans Grist. Si GFS ne désigne rien,
  désigne un modèle qui n'existe plus ou dont le type ne s'ouvre pas ici, le modèle d'avant s'ouvre, sans message. Servi seul, rien ne change.

- **Hébergé par Grist Factory Suite (GFS), « Nouveau » ouvre un modèle vierge** : le bouton « Nouveau » de l'explorateur de GFS ouvre Publipostage+ sur un modèle vierge du type
  choisi (document, e-mail, grille, macro-modèle, et présentation quand l'extension « Diapositives » est active), au démarrage (à la place du modèle de la ligne, de celui de la
  vue et du ★) comme quand le widget est déjà ouvert (le même chemin que le bouton « Nouveau » du même type : la question « Enregistrer / Abandonner / Annuler » se pose si
  des modifications attendent, et GFS reçoit la réponse de la personne). Le coin d'état garde l'avertissement « modèle non enregistré » : rien n'est écrit avant son premier
  « Enregistrer », et le modèle arrive alors à la racine (le dossier que GFS indique n'est pas lu). Un macro-modèle ouvre son écran de composition, vide, par-dessus le modèle
  habituel. Si le type demandé est absent ou ne s'ouvre pas ici, si la présentation n'a pas son extension ou si le document est en lecture seule, le modèle d'avant s'ouvre (au
  démarrage) ou GFS reçoit « non ouvert » (à l'appel), sans rien changer. Servi seul, rien ne change.

- **Un export HTML, pour un site web** : le menu « Type d'export » a deux lignes de plus, après « Markdown (modèle) ». « HTML (fichier à déposer) » écrit une
  page complète (`.html`, UTF-8, titre, feuille de style, largeur de lecture centrée) à poser telle quelle sur un site ; « HTML (contenu à coller) » écrit le seul
  contenu (`…-fragment.html` : un `<style>` et un bloc `<div class="pp-doc">`), à coller dans un bloc HTML d'un gestionnaire de contenu : sa feuille de style ne touche que ce
  bloc et laisse la typographie (police, couleur, taille des titres, liens) au site. Le document de la ligne s'écrit comme pour les autres types (variables remplacées par
  leurs valeurs, blocs conditionnels tranchés), mais le texte coule comme une page web : ni feuilles A4, ni marges, ni numéros de page, ni filigrane ; l'en-tête et le pied de
  page sont écrits une fois, en haut et en bas. Sont gardés : les titres (leur numérotation est écrite dans le texte), les paragraphes et leur alignement, le gras, l'italique,
  le souligné, le barré, l'exposant, l'indice, la couleur, le fond, la taille et la police, les liens, les tabulations, les listes (puces, numéros, lettres, cases à cocher),
  les citations, les blocs de code, les tableaux (fusions, bordures, fonds), les encadrés, les zones à deux colonnes (l'une sous l'autre sur un écran étroit), les légendes, le
  sommaire (une liste de liens) et les notes de bas de page (avec leurs liens aller et retour). Une pièce jointe de Grist, un graphique ou un code QR part dans le fichier (data
  URI) ; une image d'un autre site garde son adresse, et la fenêtre qui liste ces sites passe d'abord, comme pour les autres types. Ne sont pas gardés : les marges, le format
  et le sens de la page, les sauts de page, le filigrane, les images derrière le texte ou sur toutes les pages, les numéros de page et les polices elles-mêmes (une police nommée
  dans le document reste nommée, avec des polices de repli). Rien de ce qui peut s'exécuter n'est écrit : ni script, ni gestionnaire d'évènement, ni adresse active. « Une seule
  ligne » télécharge le fichier de la ligne affichée (nommé comme son PDF, en `.html` ou `-fragment.html`) ; « Toutes les lignes (ZIP) » en fait un par ligne dans une archive ZIP,
  après sa confirmation, « Un document par valeur » compris. Comme Word et Markdown, le type est grisé, jamais retiré, dans une grille, et il est gardé par personne et par
  modèle. Le menu « Type d'export » est resserré (lignes de 24 px au lieu de 27, 2 px d'écart) pour que ses huit types et les trois qualités du PDF tiennent dans un panneau de
  700 × 400. Le moteur (`js/html-export.js`) ne charge aucune bibliothèque et ne se charge qu'au premier export HTML.

- **Une numérotation « Article » pour les titres** : le menu « Titre » propose, après « 1. », « a. » et « I. », le bouton « Article 1 ». Le titre 1 s'écrit « Article 1 »,
  le titre 2 « 1.a », le titre 3 « 1.a.1 », puis l'alternance du chiffre et de la lettre continue (« 1.a.1.a »). Le mot « Article » ne précède que le titre 1, en français comme
  en anglais. Chaque nouvel Article remet à zéro les niveaux du dessous (« Article 2 », puis « 2.a »). Le sommaire, la Lecture, le PDF, le Word et le Markdown écrivent le
  même numéro que l'éditeur ; les autres numérotations restent comme avant.

- **Un QR code dans l'en-tête et le pied de page** : la ligne « QR code… » du menu « Lien et blocs de contenu » reste active quand on
  modifie un en-tête ou un pied de page (« Encadré… », « Bloc de signature » et « Graphique de la page… » y restent grisés). Le
  QR code s'y pose à 36 px - la zone d'édition ne laisse que 44 px de haut à son contenu - ; la poignée de l'image
  l'agrandit jusqu'à 60 px, la hauteur de la bande. Son texte peut contenir une colonne (« #Clients.Site ») : la bande de la
  feuille montre alors un carré pointillé de la même taille, et la Lecture, le PDF, le Word et l'impression dessinent le
  QR code de la ligne affichée (sans valeur, il disparaît). Une zone déjà pleine (deux lignes de texte, par exemple) le
  refuse sans rien poser : la fenêtre reste ouverte et dit « Pas assez de place dans cette zone… ».

- **Historique des versions d'un modèle** : le menu du bouton Enregistrer a une ligne « Historique des versions… ». Le widget
  garde désormais l'état qu'un enregistrement remplace quand il a été écrit par une autre personne, ou qu'il a plus de 5 minutes ;
  pendant qu'on écrit sans s'arrêter, au plus une version toutes les 10 minutes. La fenêtre liste les versions de la plus récente
  à la plus ancienne (« Version actuelle » en tête, puis la date et la personne de chacune), montre l'aperçu de celle qu'on choisit
  (le texte, l'objet et les destinataires d'un e-mail, la composition d'un macro-modèle) et « Restaurer cette version » la remet
  dans le modèle et dans l'éditeur, après une question. L'état remplacé reste dans la liste (« Avant une restauration ») : une
  restauration se défait donc de la même façon ; ce qui était tapé et pas encore enregistré est enregistré d'abord. Les versions
  sont dans leur propre table, `Publipostage_Versions`, créée à la première version gardée et lue seulement quand on ouvre la
  fenêtre : un document n'en charge rien de plus au démarrage ni à l'enregistrement, et une copie n'empêche jamais d'enregistrer.
  Au plus 30 versions par modèle et 3 millions de signes pour le document. Le modèle porte aussi, dans `Publipostage_Modeles`, la
  personne qui l'a enregistré en dernier (colonne `ModifiePar`) et un jeton qui le reconnaît (colonne `Jeton`).

- **« Comparer » une version avec la version actuelle** : la fenêtre « Historique des versions… » a un bouton « Comparer » (à gauche
  de « Fermer », éteint à chaque ouverture, grisé sur « Version actuelle »). Allumé, il montre la version choisie avec, en vert, ce
  qu'elle a en plus de la version actuelle et, en rouge barré, ce que la version actuelle a en plus d'elle (ce qu'une restauration
  retirerait) ; le vert a un trait dessous et le rouge est barré : la couleur ne parle jamais seule. Au-dessus de la feuille : le
  nombre de différences (« 2 différences avec la version actuelle »), « Aucune différence de texte » ou, quand seule la mise en forme
  change, le nombre de blocs concernés, et la légende des deux couleurs ; la première différence est amenée dans l'aperçu. Un mot
  remplacé ne compte que pour une différence (l'ancien barré, puis le nouveau) ; un paragraphe, un élément de liste, une case ou une
  ligne de tableau ajoutés ou retirés gardent leur forme ; une pastille ou une image qui change est marquée en entier. Pour un
  e-mail, l'objet et les destinataires se comparent mot à mot sur leur ligne ; pour un macro-modèle, les lignes de la composition
  (jamais d'après le numéro d'une annexe). « Restaurer cette version » reprend toujours l'état gardé, jamais la feuille marquée. Le
  calcul est écrit sans bibliothèque de plus et ne se charge qu'au premier clic sur « Comparer ». Limites : la mise en forme seule
  (gras, alignement, niveau d'un titre) n'est pas marquée mais comptée à part, l'en-tête, le pied de page et les marges ne se
  comparent pas, et un graphique ou un saut de page ne sont pas marqués.

- **« Nommer… » une version** : la fenêtre « Historique des versions… » a un bouton « Nommer… » (entre « Comparer » et « Fermer »).
  Sur une version gardée, il lui donne un nom (« Avant envoi ») : le nom prend la place de la date en tête de sa ligne, et une version
  nommée n'est plus jamais effacée par les plafonds (30 versions par modèle, 3 millions de signes) ; seule la suppression de son modèle
  l'emporte. Le nom déjà donné est reproposé, un champ laissé vide le retire (la version redevient une version comme les autres).
  Sur « Version actuelle », il garde l'état enregistré que l'aperçu montre sous le nom donné, en version de plus (avec la date et la
  personne de son dernier enregistrement) : ce qui est tapé et pas encore enregistré n'en fait pas partie, et l'enregistrement qui
  remplace ensuite cet état n'en refait pas une copie. Un nom compte 80 caractères au plus. Un modèle trop lourd pour être gardé
  (images collées) le dit au lieu de le garder ; un refus de Grist ou la lecture seule se disent dans la fenêtre, qui reste ouverte.

- **« Markdown (modèle) » : un modèle qui revient intact, variables comprises** : le menu « Type d'export » a une ligne de plus,
  « Markdown (modèle) », à côté de « Markdown » (qui écrit toujours le document d'une ligne, variables remplacées par leurs
  valeurs). « Exporter » écrit le modèle lui-même, tel que l'éditeur le montre, en un seul fichier `.md` nommé d'après le
  modèle : le menu Exporter le dit à la place des lignes (« Un seul fichier : le modèle »), rien n'est lu dans Grist, et le
  type n'est pas proposé dans une grille ni dans un macro-modèle (il est grisé, comme Word dans une grille). Une variable sans
  réglage s'écrit `{{Table.Colonne}}` (la clé de la bulle, chemin de références compris : `{{Clients.Chef.Email}}`). Tout ce
  qui se fusionne et que le Markdown ne sait pas écrire s'écrit en HTML en ligne avec ses réglages : une variable réglée
  (format, condition, boucle, texte autour, sinon), un calcul, une puce (date, heure…), une pastille « @ » (la fiche qu'elle cite, table, ligne et colonne), un numéro de page, une case
  conditionnelle, une valeur conditionnelle, un bloc de texte conditionnel (son contenu reste en Markdown, une ligne vide
  autour), une image liée à une colonne, un code QR et un graphique de la page (même derrière le texte). Le reste s'écrit comme
  dans « Markdown », en-tête et pied de page compris, et un « {{ » tapé dans le texte est protégé pour ne jamais être relu
  comme une variable. Les suggestions du suivi des modifications y sont acceptées. À l'import, les `{{Table.Colonne}}`
  redeviennent des bulles et les éléments en HTML reprennent leurs réglages : un modèle exporté puis importé, puis exporté de
  nouveau, donne exactement le même fichier. Une clé `{{…}}` qui n'est pas une variable de ce document reste du texte, et le
  coin d'état dit combien (« Markdown importé ; 2 variables inconnues laissées en texte. »). Ne sont pas gardés : les marges,
  le format et le sens de la page, le filigrane, les images derrière le texte ou sur toutes les pages qui ne se fusionnent
  pas, le lien d'un tableau avec un modèle Grille, l'objet et les destinataires d'un modèle d'e-mail ; la numérotation des
  titres, écrite dans leur texte, revient comme du texte.

- **Citer une fiche avec « @ »** : dans l'éditeur, « @ » ouvre la liste des fiches de toutes les tables du document, celles
  de la table de la page d'abord, chacune avec sa table à droite dès que le document a plusieurs tables à fiches. Les mots
  tapés se cherchent dans le nom de la fiche et dans celui de sa table, dans n'importe quel ordre, sans compter accents ni
  casse ; la liste montre 50 fiches au plus et dit combien d'autres répondent encore. Le choix pose une pastille « @ Marie
  Martin » qui désigne CETTE ligne - sa table, son numéro de ligne et la colonne dont on lit le texte -, là où une
  #variable lit la ligne que la page affiche : « Rédigé par @Marie Martin » écrit toujours Marie Martin, que la page montre
  une facture ou un autre dossier. Le nom d'une fiche est la colonne que Grist montre quand une Référence désigne sa table
  (« Colonne à afficher »), à défaut la première colonne de texte. Il se relit à chaque affichage - la Lecture, le PDF, le
  Word, l'Excel, le Markdown et l'e-mail - : renommer la personne dans Grist la renomme dans les modèles, et une table ou une
  colonne renommée suit, comme pour une variable. Une fiche dont la ligne a disparu écrit « [Fiche introuvable] » en rouge,
  et sa pastille rougit dans l'éditeur, la raison en info-bulle. « @ » n'ouvre la liste qu'en début de mot : une adresse
  e-mail tapée, « @@ » et un bloc de code n'ouvrent rien. Échap ferme la liste pour ce « @ » sans rien écrire ; un nouveau
  « @ » la rouvre. Quand Réglages a donné « @ » au panneau des variables ou aux abréviations, la liste des fiches s'efface
  devant lui.

- **Un trait « transparent » dans un tableau** : dans le menu « Bordures » de la barre d'un tableau (celui d'un document
  comme celui d'une Grille), le bouton « Transparent » à droite de « Couleur du trait » met le stylo sur « pas de trait » :
  le réglage qu'on clique ensuite n'efface que les traits qu'il vise. Avec « Transparent », « Bordure du bas » rend
  invisible le bas des cases choisies, « Bordures intérieures » efface les traits du milieu d'un bloc et garde son cadre,
  là où « Aucune bordure » efface tous les côtés choisis. Le bouton s'enfonce quand il est choisi, le menu reste ouvert, et
  rien n'est écrit tant qu'un réglage n'est pas cliqué (un seul Annuler le défait). « Par défaut » ou une nuance de la
  palette reprend le stylo ; il garde son choix tant que la page reste ouverte, comme une couleur. Un trait effacé l'est
  partout - l'éditeur, la Lecture, le PDF, le Word et l'Excel -, y compris du côté de la case voisine qui le partage. Un
  tableau fait avant se relit tel quel.

- **Le résumé d'un macro-modèle dit quels modèles sont en paysage ou en grille** : à droite du nom de chaque modèle qui n'est
  pas un document en portrait, une petite étiquette « Paysage » ou « Grille » (une grille en paysage porte les deux, « Grille »
  d'abord). « Paysage » n'apparaît que lorsque le menu Page du macro-modèle est sur « Selon chaque modèle » : avec « Portrait »
  ou « Paysage » imposé, tous les modèles ont la page du macro-modèle, et l'étiquette dirait une page qu'ils n'ont pas ;
  « Grille » reste, elle dit ce qu'est le modèle. L'étiquette suit le menu Page tout de suite (sans attendre l'enregistrement)
  et le changement de langue ; un modèle masqué par son œil la garde, un modèle introuvable n'en a pas. Les listes où l'on
  choisit un modèle n'en portent pas.

- **Une fenêtre prévient quand un PDF a une page blanche** : avant d'enregistrer le PDF d'une ligne, le widget cherche dans
  sa mise en page les pages où rien ne se peint - ni texte, ni image, ni trait. Les espaces d'un paragraphe vide, l'en-tête
  et le pied de page, le filigrane et les images « sur toutes les pages » ne comptent pas : une page qui ne porte qu'eux est
  blanche. S'il y en a, la fenêtre « Une page blanche dans ce PDF » dit lesquelles (« La page 2 est blanche... ») et laisse
  le choix : « Annuler » n'enregistre rien (et la ligne n'est pas datée), « Exporter quand même » enregistre le PDF. Pour un
  export de plusieurs lignes (archive ZIP, PDF unique, planches), tous les PDF sont enregistrés comme avant, puis une fenêtre
  de fin de lot liste les lignes dont le PDF a des pages blanches, avec leurs numéros de page. La page blanche qu'on a voulue
  - deux sauts de page de suite - n'est pas signalée. Vaut pour le PDF, le PDF protégé et la qualité « Léger » ; l'impression
  du navigateur (qui met en pages elle-même), le Word, l'Excel et le Markdown n'ont pas de fenêtre. C'est le filet derrière
  les corrections des causes connues (lignes vides en fin de document, devant un saut de page, entre deux modèles d'un
  macro-modèle).

- **« Sinon afficher » dans la condition d'une valeur conditionnelle** : la fenêtre de condition d'une valeur (le texte
  posé dans la phrase) a, comme celle d'une bulle, une ligne « Sinon afficher » : un texte libre écrit à la place de la
  valeur quand la condition n'est pas remplie, au lieu de deux valeurs côte à côte aux conditions opposées
  (« Madame » / « Monsieur »). La ligne est la dernière de la fenêtre, sous l'aperçu ; son champ reste grisé tant
  qu'aucune règle n'est complète, et porte jusqu'à 200 caractères. Le texte s'écrit tel qu'il est tapé, espaces
  comprises, en texte brut et dans le style du texte qui entoure la valeur ; vide (ou fait d'espaces), il n'y a pas de
  sinon et la valeur disparaît comme avant. « Retirer la condition » et « Défaire la valeur » l'emportent avec la
  condition, et un seul Annuler les rend ensemble. Le sinon vaut dans la Lecture, le PDF, le Word, l'Excel, l'e-mail,
  les en-têtes et pieds de page et une ligne répétée de tableau ; une condition illisible écrit le sinon, comme une
  condition non remplie, et une valeur extérieure non remplie écrit son sinon seul (celui des valeurs qu'elle
  contient ne compte pas). L'aperçu de la fenêtre dit ce que la ligne sélectionnée écrit et combien de lignes
  affichent le sinon. Dans l'éditeur, une valeur à sinon porte un trait plein sous son cadre pointillé, qui ne prend
  aucune place dans la ligne, et son info-bulle dit le texte. « Rechercher / Remplacer » ne lit pas ce texte. Un modèle
  enregistré avant se relit tel quel.

- **« Sinon afficher » dans la condition d'un bloc de texte conditionnel** : la fenêtre de condition d'un bloc (le passage
  entouré, menu des variables, onglet Puces) a, comme celle d'une valeur ou d'une bulle, une ligne « Sinon afficher » :
  un second texte écrit à la place du bloc quand la condition n'est pas remplie, au lieu de deux blocs aux conditions
  opposées. La ligne est la dernière de la fenêtre, sous l'aperçu ; son champ, de plusieurs lignes, reste grisé tant
  qu'aucune règle n'est complète, et porte jusqu'à 1000 caractères. Chaque ligne non vide devient un paragraphe ; les
  lignes vides et les espaces seuls ne comptent pas, et un champ qui n'en a que vaut l'absence de sinon (le bloc
  disparaît comme avant). C'est du texte simple, sans variable ni mise en forme : pour un sinon mis en forme, deux blocs
  aux conditions opposées restent la voie. « Retirer la condition » et « Défaire le bloc » l'emportent avec la
  condition, et un seul Annuler les rend ensemble. Le sinon vaut dans la Lecture, le PDF, le Word, l'Excel, l'e-mail,
  les en-têtes et pieds de page, un élément de liste, une case de tableau et une ligne répétée par une boucle ; une
  condition illisible écrit le sinon, comme une condition non remplie, et un bloc extérieur non rempli écrit son sinon
  seul (celui des blocs qu'il contient ne compte pas). L'aperçu de la fenêtre dit ce que la ligne sélectionnée écrit et
  combien de lignes affichent le sinon. Dans l'éditeur, l'étiquette du bloc devient « Si … · sinon » et son info-bulle
  dit le texte. La case conditionnelle n'en a pas (cochée ou décochée suffit). « Rechercher / Remplacer » ne lit pas ce
  texte. Un modèle enregistré avant se relit tel quel.

- **« Et » / « Ou » au clic entre deux conditions** : dans la fenêtre de condition d'une variable, d'un bloc de texte, d'une
  valeur ou d'une case conditionnels, et dans le filtre d'une boucle, le mot « Et » devant la deuxième règle est un
  bouton : un clic le met sur « Ou » (la variable s'affiche dès qu'une des règles est remplie), un second le remet sur
  « Et ». Avec trois règles ou plus, le mot change pour toutes : une condition n'a qu'un seul mode, « toutes » ou « au
  moins une ». La liste « toutes / au moins une » du haut reste, et suit le bouton ; l'aperçu, l'enregistrement, la
  Lecture et les exports suivent aussi. Le bouton se prend au clavier (Tab, puis Entrée ou Espace) et son info-bulle dit
  ce qu'un clic change.

- **Des groupes « A et (B ou C) » dans une condition** : dans la fenêtre de condition d'une variable, d'un bloc de texte,
  d'une valeur ou d'une case conditionnels, et dans le filtre d'une boucle, le bouton « + Groupe » pose un encadré : les
  parenthèses d'une condition. Ses lignes se combinent entre elles (« Et » / « Ou » au clic, ou la liste « toutes / au
  moins une » de son en-tête) et l'encadré se combine avec les règles qui l'entourent par le « Et » / « Ou » placé devant
  lui : « Statut = Urgent et (Montant ≥ 1000 ou Montant < 100) » s'écrit tel quel. L'encadré a son propre « + Ajouter
  une condition » et sa croix, qui le retire avec ses lignes ; un encadré dont les lignes restent vides n'est pas
  enregistré. L'aperçu, le résumé (avec ses parenthèses), l'enregistrement, Copier / Coller la condition, la Lecture et
  les exports suivent aussi, et un renommage de colonne atteint les lignes de l'encadré. Une condition sans encadré se
  lit et s'affiche comme avant.

- **Un macro-modèle qui mêle portrait, paysage et Grille** : le menu du bouton Page d'un macro-modèle propose
  « Selon chaque modèle », « Portrait » et « Paysage ». Avec « Selon chaque modèle » (le réglage d'un macro-modèle
  neuf), chaque modèle assemblé garde le sens de sa propre page : un modèle en paysage entre deux modèles en
  portrait tourne la page à son tour, dans la Lecture (une feuille par suite de modèles de même sens), dans
  l'impression du navigateur (chaque feuille sur le papier de son sens), dans le PDF (une taille de page par
  modèle) et dans le Word (une section par suite de modèles de même sens). L'en-tête, le pied de page, les
  numéros « n / total » et le filigrane se refont à la taille de chaque page, et la numérotation continue d'un
  modèle à l'autre. Le format et les marges restent ceux du macro-modèle pour tous ses modèles : seul le sens
  change d'un modèle à l'autre. Un modèle Grille se pose dans un macro-modèle comme un document (la fenêtre de
  composition le propose) : un tableau trop large pour une page en portrait tient sur la page en paysage de son
  modèle. « Portrait » et « Paysage » imposent un sens à tous les modèles, comme avant ; un clic sur le bouton
  depuis « Selon chaque modèle » impose le paysage (un second clic, le portrait). Les macro-modèles déjà faits
  gardent leur sens, imposé : rien ne change pour eux tant qu'on ne choisit pas « Selon chaque modèle ». Un
  macro-modèle dont tous les modèles ont le même sens sort comme avant.

- **Rechercher / Remplacer par expression régulière** : le bouton « .* » de la barre de recherche lit ce qui est
  tapé comme un motif JavaScript (`\d+` trouve les nombres, `[A-Z]{2,}` les sigles, `(\w+) (\w+)` deux mots de
  suite) ; il s'ajoute à « Respecter la casse » et à « Mot entier ». Un motif ne traverse ni une bulle, ni un
  texte supprimé en suivi, ni deux paragraphes : « Tout remplacer » n'efface donc jamais une bulle. Dans
  « Remplacer par », `$1`, `$2`… reprennent les groupes du motif (`$2 $1` permute deux mots), `$&` le texte
  trouvé, `$<nom>` un groupe nommé et `$$` un dollar ; sans l'option, le texte du remplacement s'écrit tel
  quel. Un motif faux (une parenthèse oubliée) ne trouve rien et le compteur dit « Expression non valide »
  (la raison du navigateur est dans son info-bulle). Un résultat vide (`^`, `x*`) n'est pas compté, et le mot
  sélectionné repris dans le champ est échappé quand l'option est allumée.
- **Rechercher / Remplacer trouve aussi les bulles** : une bulle de variable ou de calcul est un résultat quand son
  nom (`#Client`), son « Avant », son « Après », son « sinon » ou la formule du calcul contient ce qui est
  tapé ; « Respecter la casse », « Mot entier » et l'expression régulière s'y appliquent. La bulle entière est
  surlignée (en orange quand c'est la courante), elle compte pour un résultat dans « 2 sur 5 », et Entrée et
  Maj+Entrée s'y placent. « Remplacer » ne change dans une bulle que son « Avant », son « Après » et ceux de
  son « sinon » (« Madame » devient « Mme » dans toutes les bulles d'un coup, en une seule étape
  d'annulation) ; le nom d'une bulle et la formule d'un calcul ne se remplacent jamais, et le compteur le dit
  (« 3 remplacements, 1 bulle laissée »). Un « Avant » ou un « Après » garde 40 signes au plus (au-delà la
  bulle reste telle quelle et le dit). Avec le suivi des modifications, les bulles restent telles quelles :
  le texte, lui, devient une suppression et une insertion suggérées. Les numéros de page, les puces et les
  images ne sont pas cherchés.
- **Rechercher / Remplacer cherche aussi l'en-tête et le pied de page** : la recherche parcourt tout le modèle dans
  l'ordre de la page (l'en-tête, le corps, le pied, avec ceux de la première page quand « Première page
  différente » est cochée), même quand on ne les modifie pas : le compteur les compte tous (« 2 sur 4 »), et
  Entrée et Maj+Entrée passent du dernier résultat du corps à celui du pied, puis de l'en-tête, puis reviennent au
  corps (la zone s'ouvre comme après un clic dans la marge, avec sa pastille « Terminer »). « Remplacer »
  remplace puis va au résultat suivant, même dans un autre texte. « Tout remplacer » agit sur le texte ouvert et
  dit ce qui attend ailleurs (« 2 remplacements, 1 autre ailleurs ») : un clic dans chaque texte suffit. Taper
  dans le champ n'ouvre jamais une zone, seuls Entrée, les flèches et « Remplacer » y entrent. Annuler défait le
  texte ouvert, sauf juste après un « Remplacer » qui a fait passer la recherche à un autre texte : Ctrl+Z (ou le
  bouton Annuler) rouvre alors le texte du remplacement et le défait ; une frappe, un autre résultat ou la
  fermeture de la barre entre-temps, et il agit de nouveau dans le texte ouvert. Les résultats d'un texte qui
  n'est pas ouvert sont comptés mais pas surlignés ; un modèle email n'a ni en-tête ni pied.
- **Boucle dans une boucle** : une Boucle se pose aussi sur une variable placée dans une zone qu'une autre
  Boucle répète déjà : pour chaque facture ses lignes, puis pour chaque ligne ses étapes (en tableau, en
  liste ou en paragraphes). La zone intérieure lit les lignes de la ligne en cours de la zone qui l'entoure.
  La structure des données ne change pas : la table intérieure a une colonne Référence vers la table de la
  zone extérieure (comme « Facture » dans « Lignes »), ou la table extérieure a une colonne Liste de
  références vers elle ; aucune règle de liaison de plus n'est à poser. S'il y a plusieurs colonnes Référence
  vers la table extérieure, la fenêtre « Boucle » demande laquelle rattache les lignes. Elle nomme la zone qui
  entoure la bulle, et son aperçu montre une ligne de la zone extérieure avec ses lignes. Dans une zone
  répétée, les variables de la table de cette zone, de celles qui l'entourent et des tables dont les lignes
  s'y rattachent se posent, se changent par « Colonne… » et servent dans une condition sans clé de
  correspondance à choisir. Une zone n'a qu'une Boucle, et ne répète pas la table de la zone qui l'entoure
  (l'icône est alors grisée et dit pourquoi). Les renommages de tables et de colonnes dans Grist suivent
  aussi ces boucles ; la puce « N° de ligne » donne le rang de la zone la plus proche.
- **PDF « Léger »** : le menu « Type d'export » (pour le type PDF) propose « Léger (images réduites) ». C'est le même PDF
  vectoriel, texte et mise en page intacts, dont les images sont ramenées à 150 points par pouce (la netteté
  d'un courrier ou de l'écran) : une photo de 4 Mo posée sur 10 cm n'en pèse plus que quelques dizaines de Ko.
  Une photo (JPEG ou PNG opaque) est recompressée en JPEG ; un logo à fond transparent reste un PNG
  transparent ; une petite image, un code QR et une image déjà légère ne sont pas touchés ; une image n'est
  jamais agrandie. La page ne bouge pas (le ratio de l'image est gardé, l'en-tête et le pied sont allégés
  aussi). Le choix vaut pour le PDF d'une ligne et pour les lots (archive ZIP, PDF unique, assemblage avant
  impression). « Vectoriel (par défaut) » reprend toujours les images telles quelles.
- **PDF protégé** : le menu « Type d'export » propose « PDF protégé ». Un clic sur « Exporter » ouvre d'abord une
  fenêtre : le mot de passe pour ouvrir le fichier (accents permis, 127 octets au plus), ce que la personne qui
  l'ouvre a le droit de faire (imprimer, copier le texte et les images, modifier ou annoter : imprimer et copier
  sont permis, modifier est refusé au départ) et, dans un groupe replié, l'auteur, le sujet et les mots-clés du
  fichier. C'est le même PDF vectoriel que d'habitude, mise en page intacte, chiffré en AES-256 : sans le mot de
  passe, une visionneuse refuse de l'ouvrir. Sans mot de passe, le fichier s'ouvre tout seul et la visionneuse
  applique les droits choisis (ils ne tiennent que chez les lecteurs qui les respectent) ; la lecture par un
  lecteur d'écran reste toujours permise. Le choix vaut pour le PDF d'une ligne et pour « Toutes les lignes
  (ZIP) », où la fenêtre tient lieu de confirmation et dit combien de PDF partent. « Impression navigateur »,
  « Toutes les lignes en un seul PDF » et « Assemblage avant impression » sont grisés pour ce type, avec leur
  raison en info-bulle (le navigateur ne chiffre pas, un fichier qui réunit plusieurs documents ne se protège
  pas) : rien n'est retiré, et le choix revient avec le PDF.
- **Trois façons de donner le mot de passe d'un PDF protégé** : la fenêtre laisse le choix. « Saisi à chaque
  export (recommandé) » : on le tape au moment d'exporter, il n'est écrit nulle part. « Le même pour tous,
  enregistré dans le document » : un seul mot de passe pour tous les PDF, écrit en clair dans le document, table
  « Publipostage_Modeles », colonne « MotDePassePdf », ligne « Réglages du document » ; la fenêtre le dit, avec le
  risque (toute personne qui ouvre le document peut le lire, sauf si les permissions avancées de Grist en
  restreignent l'accès). « Un par ligne, lu dans une colonne » : chaque PDF prend le mot de passe de sa ligne, dans
  la colonne de la table que l'on choisit dans une liste avec recherche ; la fenêtre prévient qu'un mot de passe
  écrit dans une table y est lisible en clair. Une ligne dont la cellule est vide (ou de plus de 127 octets) n'est
  jamais exportée sans protection : elle échoue, la fenêtre de fin de lot la liste avec sa raison et les autres
  PDF sortent. Le navigateur retient la façon choisie, les droits, l'auteur et la colonne, jamais un mot de passe.

- **Numéro de ligne dans une boucle** : la liste « # » (onglet « Puces ») propose « N° de ligne ». Posée dans
  une ligne de tableau, un élément de liste ou un paragraphe qu'une Boucle répète, la puce s'écrit 1, 2, 3…
  dans la Lecture et dans les exports (PDF, Word, lots, e-mail) : elle compte les lignes que la boucle retient,
  après son filtre et son tri, et repart de 1 pour chaque ligne de la page (chaque facture d'un lot). Hors d'une
  zone répétée, elle vaut 1. Plus besoin d'une colonne « Ordre » dans Grist pour numéroter. Elle n'est pas
  proposée dans les champs de l'e-mail ni dans le nom du PDF.
- **Date du dernier export PDF** : Réglages > Vue propose une liste « Colonne » (avec « — Aucune — ») pour
  choisir la colonne de la table qui gardera le moment du dernier export PDF de chaque ligne. Elle accepte
  une colonne Date (le jour), Date et heure (l'instant) ou Texte (« 2026-10-09 14:32 »), et pas une colonne
  à formule, que Grist refuse d'écrire. La date est écrite une fois le PDF produit (« Exporter en PDF » d'une
  ligne, lot en ZIP, PDF unique, assemblage avant impression), pour les lignes qui sont dans le fichier : une
  ligne dont le PDF a échoué n'est pas datée. Une seule écriture par export ; ni Word, ni Excel, ni e-mail, ni « Impression navigateur »
  (le navigateur ne dit pas si la personne a imprimé). Si la colonne a disparu ou n'est plus utilisable, le PDF est produit quand même et le coin d'état commence,
  en rouge, par « Date non écrite : … » ; l'avertissement à l'ouverture signale aussi une colonne disparue.
  Un compte Lecteur de Grist n'écrit rien. Le choix est une option du widget : Grist ne le partage qu'une
  fois la vue enregistrée.
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
- **Lettres et numéros d'un tableau de document** : quand le curseur est dans un tableau du document, les
  lettres A, B, C… se posent au-dessus de ses colonnes et les numéros 1, 2, 3… à gauche de ses lignes, comme
  dans une grille, par-dessus la page : le texte ne bouge pas (les lettres recouvrent la ligne juste au-dessus
  du tableau tant que vous y êtes). Un clic sur une lettre choisit la colonne, sur un numéro la ligne, sur le
  coin tout le tableau ; Maj + clic étend. Les lettres et les numéros des cases choisies s'allument, et la barre
  du tableau reste ouverte, posée au-dessus des lettres. Ils suivent le défilement et disparaissent quand le
  curseur sort du tableau. Ils ne se montrent ni dans un tableau posé dans une case ou dans une colonne, ni en
  Lecture, et une grille garde les siens. Avec le suivi des modifications allumé ils sont là aussi : choisir des
  cases ne modifie rien.
- **Hauteur d'une ligne d'un tableau de document** : tirer le bas d'un numéro (1, 2, 3…) règle la hauteur de
  cette ligne, comme dans une grille : par exemple une case de signature haute. La bulle du glissé dit la
  hauteur en centimètres, la ligne suit en direct (les autres gardent la leur, le texte d'après descend), et
  un seul Annuler la rend. Une ligne ne descend pas sous la hauteur de son texte ; Échap annule le glissé ; des
  lignes choisies par leurs numéros prennent toutes la même hauteur. La hauteur est un minimum : une ligne que
  son texte agrandit grandit, et le PDF et le Word la reprennent. Avec le suivi des modifications allumé, la
  hauteur est proposée comme une modification, que vous pouvez refuser.
- **Largeur d'une colonne d'un tableau de document** : tirer le bord droit d'une lettre (A, B, C…) règle la
  largeur de cette colonne, comme dans une grille. La bulle du glissé dit la largeur en centimètres, la colonne
  suit en direct (les autres gardent la leur) et un seul Annuler la rend. Dans l'Aperçu A4, le tableau ne
  dépasse jamais la page : quand la colonne tirée n'a plus de place, les colonnes qui la suivent cèdent celle
  qui manque, au prorata de ce qu'elles peuvent céder (jamais sous 25 px), et la colonne s'arrête là où la page
  finit. Des colonnes sans largeur posée gardent la leur : le glissé les fige à leur largeur du moment. Échap
  annule le glissé ; des colonnes choisies par leurs lettres prennent toutes la largeur de la poignée tirée.
  Avec le suivi des modifications allumé, la largeur est proposée comme une modification, que vous pouvez
  refuser.
- **Égaliser la hauteur des lignes et la largeur des colonnes** : quand plusieurs lignes (ou plusieurs colonnes)
  sont choisies, par leurs numéros (leurs lettres) ou en glissant sur le tableau, les boutons « Égaliser la
  hauteur des lignes » et « Égaliser la largeur des colonnes » de la barre du tableau leur donnent à toutes la
  moyenne de leurs tailles, en un seul geste (un seul Annuler). C'est la même barre dans un tableau de document
  et dans une grille. Le tableau garde sa largeur d'ensemble ; une ligne ne descend pas sous la hauteur de son
  texte (si l'une est plus haute que la moyenne à cause de son texte, toutes prennent sa hauteur). Les boutons
  sont grisés, avec leur raison en info-bulle, tant que moins de deux lignes (colonnes) sont choisies. Avec le
  suivi des modifications allumé, les nouvelles tailles sont proposées comme modifications, que vous pouvez
  refuser.
- **Un tableau copié dans Excel garde ses traits, son alignement vertical et la hauteur de ses lignes** : collé
  dans un document, un tableau copié dans Excel, Google Sheets ou LibreOffice Calc arrive avec les traits de ses
  cases (le trait du bas d'un titre est aussi le haut de la ligne dessous), l'alignement vertical de ses cases et
  la hauteur de ses lignes, en plus de ses fusions, fonds, polices et largeurs de colonnes. Une ligne haute dans
  Excel reste haute dans le document (c'est un minimum : un texte plus haut agrandit la ligne), et l'aperçu A4,
  la Lecture, le PDF et le Word reprennent le tout. C'est toujours un tableau du document : la barre du tableau
  et les bandeaux y règlent les traits, l'alignement et les hauteurs comme dans une grille. Dans une grille, le
  collage ne change pas.
- **Saut de page avant une ligne d'un tableau de document** : dans un tableau de document, le bouton « Saut de page »
  de la barre d'outils pose un saut AVANT la ligne où se trouve le curseur, comme dans une grille ; un second clic
  le retire (un seul Annuler par geste) et Alt+Entrée fait de même au clavier. La page change là dans l'aperçu A4
  et dans la Lecture, et le PDF comme le Word y ouvrent une nouvelle page ; les lignes de titres du tableau
  reviennent en haut de cette page, comme quand un tableau se coupe de lui-même. Le saut se voit : un trait en
  tirets sur le bord haut de la ligne et une pastille sur son numéro. Le bouton est grisé, avec sa raison en
  info-bulle, sur la première ligne, sur une ligne qu'une case fusionnée traverse, dans un tableau posé dans une
  case, une colonne, un encadré ou une liste, et quand le suivi des modifications est allumé ; « Fusionner » est
  grisé quand la sélection enjambe un saut. Hors d'un tableau, le bouton garde son rôle d'avant (il insère un
  repère de saut de page).
- **Un tableau lié à un modèle Grille** : dans un document, le volet du bouton « Tableau » (au survol) a une ligne
  « Tableau d'un modèle Grille… » : une liste avec recherche des modèles Grille, dont le choix pose dans le
  document une copie du tableau du modèle, le curseur dans sa première case. Ce tableau reste LIÉ au modèle : un
  filet de couleur dans la marge, à gauche, le montre (il ne s'imprime pas et n'entre pas dans le document), et
  ses cases suivent les règles d'une grille. Ni second tableau, ni colonnes, ni sommaire, ni citation, encadré,
  bloc de code ou trait horizontal dedans, au clavier comme au collage, et les boutons concernés sont grisés tant
  que le curseur y est ; le texte, la mise en forme, les lignes, les colonnes, la fusion, l'alignement vertical,
  les bordures et le saut de page avant une ligne s'y règlent comme dans une grille. Un modèle n'est lié qu'une
  fois par document, la copie collée d'un tableau lié perd son lien, et une grille ou un en-tête et un pied de
  page n'en ont jamais. Le lien reconnaît son modèle même si Grist redonne le même numéro à un autre : un
  tableau copié depuis un autre document, ou dont le modèle a été remplacé, n'est pas un lien (il garde ses
  cases, sans repère ni menu) ; un tableau lié avant cette version reçoit cette identité à sa première mise à
  jour ou à son premier envoi. Avec le suivi des modifications allumé, le tableau lié est verrouillé. Dans la barre du
  tableau, un bouton du lien ouvre un menu qui donne le nom du modèle et propose quatre actions. « Mettre à jour
  depuis le modèle » : les cases du tableau deviennent celles du modèle, relu à ce moment-là (le curseur reste
  dans sa case, un seul Annuler rend l'état d'avant ; un tableau déjà identique n'est pas touché et garde ses
  commentaires). « Envoyer au modèle » : le tableau du document est écrit dans le modèle, après une confirmation
  qui dit dans combien d'autres modèles ce tableau est posé ; seuls le contenu et la date du modèle changent
  (son nom, son en-tête, ses marges restent), et ni le lien ni les commentaires du document n'y vont. « Ouvrir le
  modèle » : le modèle Grille s'ouvre dans l'éditeur, comme un choix de la liste (la question « Modifications
  non enregistrées » est posée au document qui en a), et une ligne sous la barre d'outils, « Revenir au
  document », ramène au document, le curseur dans la même case du tableau ; si le tableau diffère alors du
  modèle, la ligne d'état le dit sans rien remplacer. « Détacher du modèle » : le tableau reste, sans lien (un
  seul Annuler). Les actions qui écrivent dans le document sont grisées, avec leur raison en info-bulle, tant que
  le suivi des modifications est allumé ; « Ouvrir le modèle » reste disponible. Supprimer un modèle Grille posé
  comme tableau lié dans d'autres modèles le dit dans la fenêtre de confirmation ; ces tableaux gardent leurs
  cases et perdent leur lien. La ligne du volet « Tableau » est grisée, avec sa raison en info-bulle, là où un
  tableau lié ne se pose pas. Le document suit son modèle : à l'ouverture d'un document, et à chaque relecture de
  l'enregistrement automatique, un tableau lié que le modèle a changé (et que ce document n'a pas modifié depuis la
  dernière fois) prend le tableau du modèle, cases et largeurs de colonnes, le curseur reste dans sa case, les
  commentaires des cases dont le texte n'a pas changé restent, et la ligne d'état le dit. Rien n'est écrit dans
  Grist, le document n'est pas marqué « à enregistrer » (le quitter ne pose aucune question) et Annuler ne rend pas
  ce que personne n'a fait ; la Lecture d'un macro-modèle et les exports en lot montrent aussi le tableau actuel du
  modèle. Si le tableau a été modifié dans le document ET dans le modèle, ou si l'on ne sait pas lequel des deux a
  changé (tableau posé avant cette version) et qu'ils diffèrent, rien n'est remplacé : la ligne d'état dit que le
  tableau diffère du modèle, et « Mettre à jour depuis le modèle » ou « Envoyer au modèle » tranchent. Rien ne bouge
  tant que le suivi des modifications est allumé, qu'un en-tête ou un pied de page est ouvert ou qu'une saisie est en
  cours ; si l'enregistrement automatique est coupé, le document ne suit son modèle qu'à son ouverture.
  Le modèle suit aussi le document : quand le document s'enregistre (enregistrement automatique, bouton Enregistrer,
  premier enregistrement, « Enregistrer sous… »), un tableau lié que ce document a changé, et que le modèle n'a pas
  changé depuis la dernière fois, est écrit dans son modèle, sans question, dans le même lot d'écriture dans Grist
  que le document : Grist écrit les deux ou aucun (un modèle supprimé entre-temps fait refuser le lot, rien n'est
  écrit et le tableau reste à envoyer au passage suivant). Seuls le contenu et la date du modèle changent (son nom,
  son en-tête et ses marges restent), ni le lien ni les commentaires du document n'y vont, et la ligne d'état dit «
  Modèle « X » mis à jour avec ce tableau. » (ou « 2 modèles mis à jour avec ces tableaux. »), phrase qui reste
  lisible après « Enregistré à… ». Le bouton Enregistrer relit d'abord les modèles quand un tableau est à envoyer :
  un modèle changé ailleurs entre-temps n'est jamais écrasé (la ligne d'état dit que le tableau diffère du modèle)
  et, si la lecture échoue, le document s'enregistre seul. Rien ne part tant que le suivi des modifications est
  allumé, qu'un en-tête ou un pied de page est ouvert, qu'une saisie est en cours ou que la grille est à l'écran, ni
  à l'ouverture d'un document, ni pour un macro-modèle ; une largeur de colonne changée dans le document ne compte
  pas comme une modification à envoyer. « Enregistrer sous… » est un enregistrement comme un autre : la copie envoie
  ses tableaux liés au modèle, et « Détacher du modèle » avant l'évite.
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
  validation). Dans l'éditeur, ses poignées changent sa largeur et sa hauteur et un clic le sélectionne :
  la ligne du menu devient « Modifier le graphique… ». Plotly se charge
  au premier graphique seulement (jsDelivr, version et empreinte figées). Ce que le widget ne redessine pas
  encore reste dans la liste, grisé, avec sa raison : widgets personnalisés, Kaplan-Meier, « Split series »,
  « Error bars », filtres sur des dates relatives. Le total d'un anneau s'écrit sans le format de la
  colonne.
- **Graphique de la page dessiné dans l'éditeur** : le cadre pointillé d'un graphique cède la place à son
  dessin, le même que celui de la Lecture et des exports, à la taille réglée. « Toute la table » ne dépend
  d'aucune ligne : il se dessine à l'ouverture du modèle. « Les lignes liées » est tracé pour la ligne que
  Grist affiche et se redessine quand elle change. Le dessin n'est jamais enregistré dans le modèle : le
  document suit toujours le graphique de Grist. Rien ne prévient le widget quand les données d'une autre
  table changent : le dessin est refait à l'ouverture, au changement de taille, de ligne ou de valeurs de la
  ligne, au clic sur le graphique et au retour dans le mode Édition ; la Lecture redessine toujours. Quand
  rien ne peut se dessiner (aucune ligne sélectionnée pour « liées », rien à tracer, graphique supprimé dans
  Grist, bibliothèque injoignable), le cadre pointillé et le nom du graphique restent. Dans une case plus
  étroite que lui, le graphique rétrécit sans se déformer, comme dans la Lecture.
- **Export Markdown** : le menu « Type d'export » propose « Markdown » (pour un document ; une grille ne l'a pas, comme pour
  Word). « Exporter » écrit le document de la ligne en un fichier `.md` (CommonMark et GFM, ce que lisent GitHub, VS Code,
  Obsidian et Docs de La Suite), ses variables remplacées par les valeurs de la ligne ; « Exporter les lignes (ZIP) » en
  fait un par ligne dans une archive, nommé comme le PDF de la ligne. « Une ligne » ou « Toutes les lignes », « Un document
  par valeur » et les lignes que le widget affiche se comportent comme pour les autres types, et le type choisi est gardé par
  personne et par modèle comme eux. Tout ce que le Markdown sait écrire s'écrit en Markdown : titres (leur numérotation
  « 1) » ou « a) » est écrite dans le texte, comme dans le PDF), gras, italique, barré, code en ligne et blocs de code (avec
  leur langage), liens, listes à puces, numérotées (depuis leur premier numéro) et à cases, imbriquées, citations, filets,
  tableaux, images, notes de bas de page (`[^1]`), encadrés (en alertes GitHub : NOTE, TIP, IMPORTANT, WARNING ou CAUTION
  selon leur couleur) et sommaire (une liste de liens vers les titres). Ce que le Markdown ne sait pas écrire reste en HTML
  dans le fichier plutôt que d'être perdu : souligné, exposant, indice, surlignage, couleur, taille et police du texte,
  alignement centré ou à droite, saut de page, largeur d'une image qui n'est pas la largeur par défaut, tableau aux cases
  fusionnées ou qui portent une liste, un code ou un autre tableau. L'en-tête et le pied de page (ceux de la première page
  compris) sont écrits une fois, entre des commentaires HTML. Une image d'une autre adresse web garde son adresse ; une pièce
  jointe de Grist, un graphique ou un code QR part dans le fichier (data URI), pour que le fichier se suffise. Ne sont pas
  gardés : les marges, le format et le sens de la page, le filigrane, les images sur toutes les pages ou derrière le texte,
  les numéros de page, les paragraphes vides, les colonnes (les deux colonnes se suivent), les styles de puces et de
  numérotation (a, b, c), le justifié, l'interligne et les couleurs de fond des cases d'un tableau Markdown. Comme pour les
  autres types, une fenêtre liste avant l'export les sites externes dont des images seraient téléchargées. Le moteur
  (`js/markdown-export.js`) ne charge aucune bibliothèque et ne se charge qu'au premier export Markdown.
- **Import Markdown** : la ligne « Importer un Markdown… » du menu « + », sous « Importer un Excel… », ouvre le sélecteur de
  fichiers ; le fichier `.md` choisi devient un nouveau document, sans nom et pas encore enregistré, comme « Nouveau document ».
  Si le document en cours a des modifications non enregistrées, la question « Modifications non enregistrées » vient après la
  lecture du fichier, et jamais pour un fichier refusé. C'est le sens inverse de l'export : tout ce que l'export écrit est relu,
  et un fichier venu de Docs de La Suite, de GitHub, de VS Code, d'Obsidian ou de Typora l'est de la même façon. Sont repris :
  titres, paragraphes et retours à la ligne, gras, italique, barré, code en ligne et blocs de code (avec leur langage), liens
  (adresses nues, e-mail, téléphone, liens par référence), listes à puces, numérotées et à cases (cochées ou non), citations,
  filets, tableaux (GFM ou HTML, cases fusionnées, colonnes alignées), images (adresse web ou intégrée au fichier, avec leur
  largeur et leur alignement), alertes GitHub (`> [!NOTE]`, TIP, IMPORTANT, WARNING, CAUTION) en encadrés de la couleur de
  l'alerte, notes de bas de page (`[^1]`), sommaire (`[TOC]` ou la liste de liens que l'export écrit), saut de page (la `<div>`
  de l'export, `\newpage`), souligné, exposant, indice, couleur, taille et alignement écrits en HTML, et l'en-tête et le pied de
  page que l'export écrit entre des commentaires HTML. Le fichier est lu en UTF-8 (avec ou sans BOM), en UTF-16 (avec BOM) ou, à défaut,
  en Windows-1252 ; l'en-tête YAML d'un fichier Jekyll, Hugo ou Obsidian n'est pas du texte. Une image qui n'est ni en ligne ni
  dans le fichier (un chemin vers le fichier d'à côté) ne peut pas suivre le texte : un mot la remplace (« [image non reprise :
  légende] ») et le coin d'état compte celles qui manquent. Les variables que « Markdown (modèle) » écrit (`{{Table.Colonne}}`)
  redeviennent des bulles ; un `#Table.Colonne` écrit à la main reste du texte. Ne sont pas repris : le titre d'une image ou d'un lien, le HTML que l'éditeur ne connaît pas (son texte reste), les listes à cases
  emboîtées (mises à plat), la numérotation des titres écrite dans le texte (elle reste du texte) et les notes que rien
  n'appelle. Un script, un gestionnaire d'événement, un cadre ou une adresse `javascript:` sont retirés. Un fichier binaire,
  vide ou de plus de 10 Mo est refusé, avec un message clair. Le lecteur est marked 15.0.12 (MIT), chargé de
  `cdnjs.cloudflare.com` avec son empreinte SRI au premier import seulement ; `js/markdown-import.js` remet son résultat dans la
  forme que l'éditeur écrit lui-même.
- **Impression par le navigateur** : la ligne « Impression navigateur » du menu « Type d'export » (le menu Qualité
  du bouton PDF, avant son renommage), jusque-là grisée, imprime la Lecture par la fenêtre d'impression du navigateur (« Enregistrer au format PDF » ou une
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
- **Galerie de 22 modèles, dont des modèles livrés avec leurs tables** : la galerie « Créer à partir d'un modèle »
  passe de quatre modèles à vingt-deux. Les quatre d'avant (facture, contrat de prestation de services,
  attestation, courrier de relance) sont refaits avec les fonctions récentes ; s'y ajoutent des modèles à
  imprimer (flyer A6, invitation A6 en paysage, affiche A3, badge d'événement A6, carte de visite 85 × 55,
  étiquette d'adresse 70 × 37, étiquette de produit A6), un modèle d'e-mail (réapprovisionnement), deux
  grilles pour Excel (valorisation du stock, émargement) et des documents de métier : quittance de loyer,
  bulletin scolaire, fiche recette, feuille d'émargement, bon de commande, fiche d'inventaire, bon de
  mouvement de stock, et une présentation commerciale de trente diapositives (photos, graphiques, formes devant et
  derrière le texte, tableaux, deux colonnes, variables de la table « Contacts ») ; sans l'extension « Diapositives »
  de Grist Factory Suite, ses deux boutons sont grisés avec leur raison, et leur clic dit comment l'obtenir. Un modèle livré avec ses tables a un bouton « Créer avec ses tables » (« Créer avec sa
  table » s'il n'en a qu'une) : une question liste les tables (« Créer les tables du modèle ? »), puis le
  widget crée les tables du modèle SANS AUCUNE LIGNE, avec leurs colonnes, leurs colonnes de calcul, la colonne
  qui affiche une Référence et les règles des Tables liées dont le modèle a besoin, et enregistre le modèle
  avec sa page (format, sens, marges), son type (document, e-mail, grille ou présentation), le nom de son PDF et les
  champs de son e-mail. Une table du document qui porte déjà le nom d'une table du modèle est gardée telle
  quelle si ses colonnes conviennent ; sinon une fenêtre dit ce qui manque et rien n'est créé ni modifié.
  « Utiliser ce modèle » garde le texte seul. L'aperçu d'un modèle montre le document rempli de lignes
  d'exemple, en images faites avec le vrai widget (une par page, avec « Aperçu avec des lignes d'exemple :
  les tables créées restent vides. »), la page du modèle, les tables qu'il crée et ses « Fonctions
  montrées » (Code QR, Format de page, Boucle sur des lignes liées, Montant en toutes lettres…) : aucune
  ligne d'exemple n'est jamais écrite dans le document.
- **Réglages > Email : choisir le logiciel de messagerie qui ouvre « Créer l'email »** : « Standard » (le réglage de
  départ : le lien n'a pas changé d'un octet) ou « Zimbra ». Le client web de Zimbra relit mal le lien : un « & » de
  l'objet ou du corps s'y affichait `&amp;`, un « + » devenait une espace, un « ? » coupait l'objet, et aucun codage
  du lien n'y change rien (il envoie « & » en `%26`, comme le veut le format). Avec « Zimbra », le lien écrit les
  signes « & », « < », « > » et « + » de l'objet et du corps en formes larges (＆ ＜ ＞ ＋), que Zimbra n'abîme
  pas, et met un Cc vide en tête pour que l'objet, le texte, le Cc et le Cci ne soient lus qu'une fois : toutes les
  touches d'un clavier AZERTY et QWERTY passent. Le lien est plus long (6 caractères de plus par signe) et la jauge
  de longueur mesure le lien réel. Limites : dans le corps, une adresse web avec « & » et une adresse email avec
  « + » passent aussi en formes larges (elles ne passaient pas mieux avant), « +33 » devient « ＋33 » ; une adresse
  « À » qui contient « & » ou « ? » (très rare) reste mal lue par Zimbra. Le choix est propre à ce navigateur,
  comme la langue et le thème, et n'est pas écrit dans le document.
- **L'heure d'une colonne « Date et heure » s'écrit aussi à 12 heures, avec AM / PM, dans toutes les langues** : la liste « Heure » de la barre d'une variable propose « 11:30 PM » en plus de
  « 23:30 » et de « 23 h 30 », quelle que soit la langue de l'interface (avant, seul l'anglais pouvait écrire l'heure à 12 heures, et le français n'avait que le 24 heures). Minuit s'écrit «
  12:30 AM », midi « 12:00 PM », l'heure sans zéro de tête (« 9:05 AM »), derrière la date comme les autres écritures (« 12 septembre 2026 à 11:30 PM », « 12/09/2026 11:30 PM », en anglais «
  09/12/2026, 11:30 PM »). Rien ne change pour les modèles déjà posés : « 23:30 » et « 23 h 30 » écrivent comme avant, et en anglais « 23 h 30 » écrivait déjà « 11:30 PM » - la liste n'y
  montre alors que « No time », « 23:30 » et « 11:30 PM », et la bulle d'un modèle réglé ainsi affiche « 11:30 PM ». Dans l'Excel, la case est une vraie date au format « h:mm AM/PM ». Le
  code est dans `js/variable-format.js` (`TIME_STYLES`, `timeText`, `timeChoices`), `js/floating-toolbars.js` (la liste « Heure ») et `js/xlsx-export.js` (`TIME_CODES`).
- **« 11:30pm » dans la liste « Heure », et un réglage 12 h / 24 h pour la puce « Heure actuelle »** : la liste « Heure » de la barre d'une variable « Date et heure » propose une quatrième
  écriture, « 11:30pm » (am / pm en minuscules, collés aux minutes - l'écriture de départ de Grist, « h:mma » -, minuit « 12:30am », midi « 12:00pm », la même dans les deux langues) ; le
  bouton « Comme dans Grist » l'écrit exactement pour ce réglage. La puce « Heure actuelle » écrit toujours l'heure sur 24 heures (« 23:30 ») tant qu'on n'y touche pas ; un clic sur la puce
  - dans le document comme dans l'Objet, les adresses ou le nom du PDF - ouvre sa propre barre, avec la même liste : « 23:30 », « 23 h 30 » (français seulement), « 11:30 PM », « 11:30pm »,
  sans « Sans heure » (une puce écrit toujours une heure). « 23:30 » retire le réglage. La Lecture, le PDF, le Word, l'e-mail et le nom du fichier écrivent l'heure de l'appareil dans cette
  écriture. Dans l'Excel, « 11:30pm » s'écrit `h:mmam/pm`. Seule trace dans un modèle enregistré : l'attribut `data-chip-time` de la puce, absent tant que rien n'est réglé (un modèle existant
  s'écrit comme avant ; une version plus ancienne du widget l'ignorerait et écrirait l'heure sur 24 heures). Le code est dans `js/variable-format.js` (`TIME_STYLES`, `timeText`,
  `gristTimeFormat`), `js/editor-nodes.js` (la puce), `js/reader-mode.js` (`formatNowTime`, `smartChipValue`), `js/floating-toolbars.js` (`createTimeChipToolbar`) et `js/field-editor.js` (la barre dans les champs).

### Modifié

- **La liste des modèles colore l'icône de chaque sorte de modèle, comme l'explorateur de Grist Factory Suite** : dans la liste déroulante des modèles et sur son bouton, l'icône
  d'un document est bleue, celle d'une grille verte et celle d'une présentation orange. L'e-mail, le macro-modèle et les dossiers gardent la couleur du texte ; un modèle grisé
  (extension éteinte, type inconnu) n'a aucune couleur, et le bouton la perd avec lui quand Grist Factory Suite éteint l'extension de la présentation ouverte. Chaque couleur fait
  3:1 au moins sur les fonds de la liste (ligne survolée et ligne choisie comprises), en clair et en sombre ; la forme de l'icône dit toujours la sorte, la couleur s'y ajoute.
  « Organiser mes modèles » reste monochrome. Les couleurs sont les jetons `--t-doc`, `--t-grid` et `--t-slides` de `css/style.css` ; les règles sont dans
  `css/template-tree-select.css`, et `syncTriggerLabel` de `js/template-tree-select.js` retire la couleur du bouton d'un modèle que le widget ne sait plus ouvrir.

- **Les pages d'un long document se calculent quatre fois plus vite, et restent exactement les mêmes** : dans l'éditeur et dans la Lecture, les coupures de page entre deux
  blocs se posent d'un coup au lieu d'une à une (une mise en page du document par page avant). Chaque coupure posée est relue : si une seule n'est pas à la place prévue, elle
  et les suivantes repassent par le calcul d'avant, page par page. Les pages, les réserves sous chaque bloc et les coutures sont au chiffre près celles d'avant (vérifié sur une
  présentation de 70 diapositives chargées, un long texte à listes, images et sauts de page, avec et sans en-tête et pied de page différents en première page, et des tableaux).
  Mesuré : la présentation de 70 diapositives passe de 220 à 280 ms à 45 à 55 ms par calcul, un long texte de 15 à 6 ms. Les coupures dans un tableau ou une zone à deux
  colonnes gardent le calcul page par page. Le code est dans `placeSimpleSeamsAtOnce` de `js/header-footer-preview.js` et de `js/reader-mode.js`.

- **Dans Grist Factory Suite, la langue est celle de GFS, un seul choix par personne pour toutes ses apps** : le widget démarre dans la langue que GFS lui dit (celle de son bouton
  Langue), avant celle du navigateur et avant celle qu'il avait gardée seul. Dans les Réglages, les deux cases de langue sont grisées, jamais masquées, avec une phrase dessous : « La
  langue se choisit dans Grist Factory Suite (bouton Langue de l'explorateur). » Quand la personne change la langue dans GFS, le widget se recharge dans la nouvelle langue et rouvre
  le modèle où elle était ; avec une modification en attente, la question « Enregistrer / Abandonner / Annuler » passe d'abord, et « Annuler » laisse la langue d'avant jusqu'au
  prochain démarrage. Une langue changée pendant un rechargement est rattrapée au départ, une fois le modèle ouvert. « Recharger maintenant » (touche de déclenchement) garde la langue
  de GFS en un seul rechargement. Seul, ou avec une GFS qui ne donne pas la langue, rien ne change : les cases restent actives. La langue de GFS passe par le fragment de l'adresse du
  cadre (`#pp-open=…&pp-lang=fr`), jamais par le stockage du navigateur, que le cadre isolé de GFS refuse ; une adresse qu'on ne peut pas modifier ne fait pas recharger la page (elle
  repartirait dans l'ancienne langue et s'y reprendrait sans fin). Le code est dans `js/gfs-link.js` (`language`, `onLanguage`), `js/i18n.js` (`gfsLang`), `js/settings.js`
  (`applyLanguageLock`, `followGfsLanguage`, `reloadKeepingTemplate`) et la fin d'`init()` de `js/main.js`.

- **Après un changement de langue ou de touche de déclenchement, le widget rouvre le modèle où l'on était** : changer de langue dans les Réglages, ou cliquer sur « Recharger maintenant »
  après avoir changé la touche de déclenchement, recharge la page, qui rouvre maintenant le modèle ouvert (de n'importe quel type) au lieu de revenir au modèle habituel (celui que Grist
  Factory Suite désigne, celui de la ligne, celui de la vue ou le ★). Seul comme hébergé par GFS : l'identifiant du modèle passe par la fin de l'adresse du widget (`#pp-open=…`), lue
  puis effacée au démarrage, et jamais par le stockage du navigateur, que le cadre isolé de GFS refuse ; un rechargement qui ne vient pas de l'app (F5) ouvre le modèle habituel. Un modèle
  pas encore enregistré, supprimé entre-temps ou que cette version ne sait pas ouvrir : le modèle habituel s'ouvre, sans message. Dans GFS, la langue n'est plus un choix de
  l'app : elle est celle de GFS (entrée précédente), et la réouverture y marche de même. Le code est dans `js/settings.js` (`reloadKeepingTemplate`, `takeReopenId`) et dans le départ
  de `js/main.js`.

- **Les en-têtes et les pieds de page ne refusent plus rien à la saisie : ce qui dépasse est dit, puis coupé** : la taille de la zone ne change pas (60 px de contenu, fixée d'après les
  usages), mais l'éditeur ne bloque plus la frappe ni l'image quand elle est pleine. On peut taper une ligne de plus, coller ou insérer une image de n'importe quelle taille (elle entre à
  320 px), l'agrandir sans plafond, poser un QR code (à 36 px) ou un tableau ; le bouton « Tableau » en pose un d'une ligne dans une zone (deux dans le corps du texte), et un tableau
  laissé vide n'est plus jeté à « Terminer ». Quand le contenu dépasse la bande, trois signes à la fois : un trait rouge en tirets à la limite, un fond rouge très pâle en dessous et
  une note sous la feuille qui dit de combien, en millimètres (« L'en-tête dépasse de 16 mm : ce qui est sous le trait sera coupé à l'impression et dans les exports. »). Si une image
  en est la cause, la note propose « Réduire l'image » : elle ramène l'image (la sélectionnée, sinon la plus haute) à la taille qui tient, proportions gardées, en un seul Annuler. Les
  lignes vides à la fin d'une zone ne comptent pas (il n'y a rien à couper dessous), celles du milieu comptent. Le texte de la page ne bouge jamais : ce qui est sous le trait est coupé
  dans la Lecture, l'impression, le PDF et Word (voir « Un en-tête ou un pied de page plus haut que sa zone ne repousse plus le texte de la page »). Un tableau d'en-tête ou de pied garde son quadrillage dans la zone ouverte, la zone fermée, la
  Lecture, le PDF et Word ; un tableau plus haut que la zone y est coupé à la limite. La barre flottante d'un tableau, d'une image ou d'une variable ne recouvre plus la pastille
  « Terminer » : elle passe sous l'élément. Le code est dans `js/header-footer-preview.js` (`refreshZoneOverflow`, `shrinkZoneImage`).

- **Dans un en-tête ou un pied de page, « Sommaire » et « Saut de page » sont grisés, et une zone qui n'a qu'un trait est gardée** : dans une zone ouverte, ces deux boutons n'ont
  pas de sens (une bande de 60 px n'a ni liste de titres ni page à ouvrir) : ils sont grisés, comme la numérotation des titres, jamais retirés. Ni un clic ni Alt+Entrée n'y posent
  quoi que ce soit, pas même avant la deuxième ligne d'un tableau de la zone, et « Terminer » les rend ; dans le corps du texte, rien ne change, et le reste de la barre non plus.
  Une zone qui ne contient qu'une ligne horizontale (« --- » puis Espace) n'est plus jetée à « Terminer », comme l'était un tableau vide : le trait reste, l'en-tête reste activé, et
  la zone fermée, la Lecture, le PDF, Word et le Markdown le montrent, le texte de la page restant à sa place. Le code est dans `js/main-toolbar.js` (`syncLocks`) et dans
  `js/page-layout.js` (`hasZoneContent`).

- **Le trait d'un en-tête ou d'un pied de page terminé est le même que celui qu'on voit en écrivant** : « --- » puis Espace fait un trait fin et gris clair dans le corps et dans la zone
  ouverte ; une fois « Terminer » cliqué, dans la zone fermée, entre deux pages de l'éditeur et à la Lecture, le trait prenait celui du navigateur (plus épais, plus foncé, en relief,
  5 px moins haut). Il a maintenant le même aspect partout à l'écran (21 px de haut en tout, gris clair, sans relief), et l'impression par le navigateur le reprend. Le texte de la page
  ne bouge pas, et la taille des zones, le PDF et Word ne changent pas. Le code est dans `css/editor-v2.css` (la règle `.tiptap hr`).

- **L'impression par le navigateur passe par la page du widget, seul comme hébergé par Grist Factory Suite (GFS)** : GFS fait tourner chaque app dans un cadre isolé (sans
  `allow-same-origin`) où le cadre caché que l'impression fabriquait ne se lisait plus (« Impossible de préparer l'impression. »). Le widget dessine donc les feuilles de la
  Lecture dans sa propre page (un conteneur hors de l'écran, mais mis en page, dont l'arbre ombre reprend les feuilles de style et la langue du document), appelle
  `window.print()` sur sa fenêtre, ne montre que ce conteneur à l'impression (rien d'autre de la page), donne au document le nom de fichier que le navigateur propose à
  « Enregistrer au format PDF », puis retire tout à la fin de l'impression. Il n'y a plus qu'une façon d'imprimer (choix du 16/10, avec moins de code) : servi seul, le widget
  imprime lui aussi par sa page, et le cadre caché à bac à sable n'existe plus. Les feuilles sont celles d'avant, aux mêmes coupures (même taille de page, mêmes en-têtes et
  pieds, mêmes sens de page) ; l'impression ordinaire de la page n'est pas touchée. Le contenu du document n'est plus enfermé dans un cadre sans script : le filtre de la
  Lecture et la politique de sécurité de la page (ni script ni gestionnaire en ligne) le protègent.
- **Hébergé par GFS, les liens `mailto:` et `tel:` s'ouvrent dans un nouvel onglet** : dans le cadre isolé de GFS, suivre un tel lien dans le cadre faisait disparaître le widget
  jusqu'au rechargement. « Créer l'e-mail », le Ctrl + clic sur un lien de l'éditeur et les liens de la Lecture qui n'ouvraient pas déjà un nouvel onglet (modèle importé, colonne
  écrite par un autre) s'ouvrent désormais dans un nouvel onglet (`target="_blank"`, `rel="noopener noreferrer"`). Servi seul, rien ne change.

- **Le suivi des modifications, « Tout accepter » et « Tout refuser » se rangent sous un seul bouton, « Édition collaborative »** : les trois boutons de la
  barre d'outils laissent la place à un bouton (deux personnes de profil) dont le menu s'ouvre au survol, comme « Tableau » ou « Lien et blocs de contenu ».
  Rien ne disparaît : les trois lignes gardent leur nom, leur icône, leur info-bulle, leur raccourci clavier et leur effet ; « Tout accepter » et « Tout refuser »
  restent grisés tant qu'aucune modification n'attend ; tout le menu se grise dans une grille et dans un macro-modèle, comme les boutons d'avant. Le bouton
  s'allume tant que le suivi est en marche : menu fermé, on voit que le suivi est actif. Ce bouton est la place des fonctions de travail à plusieurs qui
  viendront s'y ranger.
- **Le graphique de la page devient une extension de Grist Factory Suite (GFS)** : servi seul (l'adresse du widget n'est
  pas celle de GFS), Publipostage+ ne dessine plus de graphique, et ne charge ni son code ni sa bibliothèque. Rien n'est
  perdu ni caché : la ligne « Graphique de la page… » reste à sa place, grisée avec sa raison ; le cadre d'un graphique déjà
  posé dans un modèle reste, grisé, avec son nom, et le modèle se réenregistre à l'identique ; la Lecture et les exports
  écrivent « [Graphique indisponible] » à sa place. Un clic sur la ligne grisée (ou le raccourci de l'action) ouvre une
  fenêtre qui dit qu'il faut passer par GFS pour cette fonction. Servi par GFS, le graphique marche comme avant : son code
  (le dossier `extensions/graphique/`) se charge à la première utilisation, et Plotly, sa bibliothèque, vient de GFS, qui
  en donne l'adresse et l'empreinte au moment du dessin ; Plotly n'est plus dans la liste des bibliothèques du widget ni
  dans sa carte d'importation. La liste des graphiques de la page ne propose pas le widget lui-même, même servi par GFS,
  dont l'adresse est alors celle que porte sa section (GFS la donne au widget). La politique de sécurité de la page garde
  l'adresse exacte de Plotly 2.13.2, et rien d'autre : elle ne fait que la permettre, le widget seul ne la charge jamais.

- **Changer de langue recharge la page** : dans les Réglages, choisir « English » ou « Français » recharge la page, qui
  repart dans la langue choisie ; rien n'est plus retraduit en direct. Avant, certaines barres déjà ouvertes (la barre
  d'une variable, celle du tableau) gardaient quelques textes dans la langue d'avant. Si le document a des modifications
  qui attendent d'être enregistrées, la question « Enregistrer / Abandonner / Annuler » passe d'abord, comme quand on
  change de modèle : « Annuler » laisse la langue d'avant. Si le navigateur refuse de garder le choix (stockage bloqué),
  la langue ne change pas et la case revient sur la langue en cours.

- **L'étoile du modèle par défaut dit son rôle, dans la liste et dans « Organiser mes modèles »** : chaque modèle
  ordinaire de la liste déroulante et de la fenêtre « Organiser mes modèles » porte une étoile (visible au survol ou au
  clavier) qui pose, déplace ou retire le modèle par défaut du document, celui qui s'ouvre au démarrage du widget, pour
  toutes les personnes qui l'utilisent (la punaise reste un favori personnel). La ligne du modèle par défaut le dit en
  toutes lettres (« au démarrage »), la fenêtre porte une légende qui explique l'étoile, et la ligne d'état nomme le
  modèle qui s'ouvrira au démarrage. L'étoile de la barre d'outils reste. Un e-mail et un macro-modèle ne peuvent pas
  être le modèle par défaut du document : leur étoile est grisée, avec l'info-bulle qui dit pourquoi (pour une vue :
  Réglages > Vue), comme en lecture seule.
- **Le bouton « Qualité PDF » devient « Type d'export »** : le bouton à gauche d'« Exporter » choisit le type
  d'export (PDF, PDF protégé, Word ou Excel) et, pour les deux PDF seulement, leur qualité (Vectoriel, Impression navigateur, Léger) :
  la qualité choisie est gardée et revient avec le PDF. Le menu du bouton **Exporter**, titré « Exporter », ne
  liste plus que les options de lignes et de classeur du type choisi, avec une petite coche devant celle qui est
  cochée : une seule ligne, toutes les lignes (archive ZIP) et, pour le PDF, toutes les lignes en un seul PDF et
  l'assemblage avant impression, pour Excel toutes les valeurs de la table dans un seul classeur. Un clic sur une
  option la coche sans rien exporter ; le bouton **Exporter** (Alt+P aussi) lance l'option cochée dans le type
  choisi, avec sa confirmation pour un lot. Rien n'est retiré : les neuf exports d'avant se font par ces choix,
  avec la même confirmation et le même effet ; Word reste grisé dans une grille et Excel dans un document, et le
  type revient alors au PDF. Une option que le type n'a pas (« un seul PDF » après un passage à Word) se lit
  « Toutes les lignes (ZIP) » et revient avec son type.
- **Vos choix d'export sont gardés par modèle** : le type d'export (PDF, PDF protégé, Word, Excel), la qualité du PDF et le choix
  « une seule ligne / toutes les lignes » sont retenus pour chaque personne et pour chaque modèle. On les retrouve à
  l'ouverture du modèle, sur n'importe quel ordinateur (ils sont écrits dans la table des préférences de la personne,
  comme ses épingles), et un modèle dont on n'a rien changé repart des réglages d'origine (PDF vectoriel, une seule
  ligne) : les choix d'un modèle ne passent pas au suivant. Un compte en lecture seule choisit comme les autres, mais
  ses choix ne durent que la séance : rien n'est écrit dans le document. Un nouveau modèle garde les siens dès son
  premier enregistrement, et « Enregistrer sous » emporte ceux de l'écran. Un document créé avant cette fonction reçoit
  trois colonnes de plus dans la table des préférences au premier choix d'export, jamais au démarrage.
- **Marges d'un macro-modèle** : l'onglet Marges des Réglages dit, tant qu'un macro-modèle est chargé, que ses marges
  priment sur celles des modèles assemblés : elles valent pour toutes ses pages, dans la Lecture, le PDF, le Word et
  l'impression ; les marges propres à un modèle ne servent que lorsqu'on l'ouvre seul. Rien ne change dans le calcul des
  marges, seule la mention est nouvelle ; avec un modèle simple elle reste cachée.
- **Entrée dans un tableau de document** : comme dans une grille (et dans Excel ou Google Sheets), Entrée descend
  d'une case et en sélectionne le texte, on tape par-dessus ; Maj+Entrée (ou Ctrl+Entrée) ajoute une ligne dans la
  case ; sur la dernière ligne, Entrée ne fait rien. Une liste, une citation, un bloc de code ou la liste « # »
  ouverte gardent leur Entrée. Avant, Entrée coupait le paragraphe de la case : pour écrire une seconde ligne dans
  une case, utilisez maintenant Maj+Entrée.
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
- **Le sommaire de l'export Word est un vrai sommaire Word** : un modèle qui porte un sommaire sort en Word avec la
  « Table des matières » de Word (un champ qui se met à jour) au lieu d'une liste fixe. Elle reprend les titres de 1 à 6,
  et chaque ligne mène à son titre. Le champ est marqué « à mettre à jour » : à l'ouverture, Word peut demander s'il
  doit mettre à jour les champs, et Oui écrit les numéros de page ; plus tard, un clic droit sur le sommaire,
  « Mettre à jour les champs », le refait après une modification du document. Sans cette mise à jour (aperçu, Google
  Docs, LibreOffice, Word en mode protégé), le sommaire montre la liste des titres sans numéro de page, comme avant ;
  sans aucun titre, il garde sa phrase « aucun titre » et Word ne pose aucune question. Chaque titre porte aussi son
  niveau de plan, que LibreOffice lit pour refaire le sommaire. Les polices ne sont toujours pas embarquées dans le fichier.

### Retiré

- **« Basse qualité » et « Ultra HD »** : ces deux lignes du menu Qualité du bouton PDF, grisées (« bientôt »)
  depuis le retrait de html2pdf.js, ne sont plus dans l'interface ni dans le code. Un PDF photographié page par
  page serait plus lourd, sans texte sélectionnable et jamais plus net que le PDF vectoriel : pour alléger un
  PDF, la ligne « Léger » réduit les images ; pour une affiche, le PDF vectoriel et « Format libre ».

### Corrigé

- **En anglais, une devise s'écrit comme dans Grist** : un montant négatif en dollars s'écrivait « $-7.13 » et un montant en francs suisses « CHF1,234.57 » quand l'interface (ou la bulle) est en anglais ; ils
  s'écrivent maintenant « -$7.13 » et « CHF 1,234.57 » (« -CHF 1,234.57 » en négatif), partout où une bulle écrit un montant. Le moins passe avant le signe de la devise ; une devise en lettres (« CHF », « kr », ou celle
  qu'on a saisie à la main) est suivie d'une espace insécable, alors que « $ », « € », « £ » ou « R$ » restent collés au nombre, comme Intl l'écrit pour Grist. La case Excel d'un nombre pose la même espace dans son format
  (« "CHF "#,##0.00 »). Le français ne change pas (« -7,13 € », « 1 234,57 CHF ») et le pourcentage écarte toujours la devise. Le code est dans `js/variable-format.js` (`currencyFirst`, `currencyGap`) et
  `js/xlsx-export.js` (`numberFormatCode`), les tests dans les groupes `gristFormatUnit` (seize textes du vrai Grist ne sont plus des « écarts connus », sept vérifications de plus) et `xlsx`.

- **Une colonne « Any » qui calcule une date l'écrit comme une date** : une colonne de formule ajoutée sans type (« Any ») qui calcule une date s'écrivait « 2026-09-12T21:30:00.000Z » dans la Lecture, le PDF, le Word
  et l'Excel de la ligne choisie, et « D, 1789248600, Europe/Paris » (« d, 1789171200 » pour un jour) à l'export en lot, dans les boucles et les tables liées ; les règles la comparaient comme du texte. Maintenant le
  document écrit « 12/09/2026 » pour un jour et « 12/09/2026 23:30 » pour un instant (l'heure du fuseau de la valeur : 23 h 30 UTC le 31/12 est le 01/01/2027 00:30 à Paris ; « 09/12/2026, 23:30 » en anglais),
  partout pareil. Les règles (« = 12/09/2026 », « = 2026-09-12 », « < 01/01/2027 », « est vide », une colonne contre une autre) comparent le jour, le calcul « + 1 » dit que c'est une date comme sur une colonne Date,
  et la case Excel reste du texte, le même. La barre d'une colonne « Any » n'a pas de réglage de date : pour choisir l'écriture, ou retirer l'heure, donner le type Date ou Date et heure à la colonne dans le panneau de droite
  de Grist. Un nombre ou un texte dans une colonne « Any » s'écrit comme avant. Le code est dans `js/variables.js` (`cellValue`, `effectiveFormatOf`), `js/variable-format.js` (`writesTime`) et
  `js/condition-rules.js` (`compareDates`, `expectedFromValue`), les tests dans les groupes `varShapes`, `realShapes` et `conditionRulesUnit` (section 18).

- **Une Référence qui montre un prix décimal l'écrit avec la virgule** : le prix d'un article montré par une Référence s'écrivait « 1.5 » (avec le point) là où la même valeur dans une colonne Numérique s'écrit
  « 1,5 », dans la Lecture, le PDF, le Word et l'Excel, ligne choisie comme lot. Maintenant le nombre que montre une Référence prend la séparation décimale de la langue de l'interface (le point en anglais), jusqu'à
  dix décimales et sans espace des milliers : « 1,5 », « 0,3 » et toujours « 2024 » pour une année ou un identifiant de ligne, jamais « 2 024 » (le type de la Référence ne dit pas si la colonne montrée est un prix ou
  une année). Une règle (« = 1,5 » comme « = 1.5 »), un calcul, un tri et un filtre lisent le nombre et non son écriture : ils ne changent pas. Le code est dans `js/variables.js` (`effectiveFormatOf`), le test dans
  le groupe `varShapes`.

- **« Avant une date » ne retient plus une cellule sans date** : une règle « < 01/01/2027 » ou « ≤ 01/01/2027 » (bloc, valeur, case ou bulle conditionnels, macro-modèle, filtre d'une boucle) était vraie quand la date
  était vide : la comparaison lisait du texte, où le texte vide vient avant tout texte, et le bloc « avant 2027 » s'écrivait pour chaque ligne sans date (« > » et « ≥ » étaient déjà faux). Maintenant une date vide
  n'est avant ni après aucun jour, dans une colonne Date, une colonne Date et heure et une Référence qui montre une date (quand la règle porte un jour), sur la ligne choisie comme à l'export en lot ; « = » reste
  faux, « ≠ » et « est vide » restent vrais. Une colonne de nombres ou de texte garde sa comparaison (« vide < 5 » est encore vrai). Le code est dans `js/condition-rules.js` (`compareDates`), les tests dans les
  groupes `varShapes` et `conditionRulesUnit` (section 17).

- **Une liste dont une valeur est vide s'écrit sans virgule de trop** : une liste de références (ou une valeur par ligne liée) dont l'une des valeurs n'écrit rien - une fiche sans date, un texte vide - gardait
  sa place entre deux virgules : « , 12/09/2026 » quand la fiche sans date était la première, « 01/03/2026, , 12/09/2026 » au milieu, « 01/03/2026, » à la fin et « , » quand toutes étaient vides, dans la Lecture,
  le PDF, le Word et l'Excel, ligne choisie comme lot. Maintenant les valeurs vides sont sautées, comme le faisaient déjà la fenêtre « Liste » et l'export « un document par valeur » : « 12/09/2026 »,
  « 01/03/2026, 12/09/2026 », rien quand tout est vide. Le code est dans `js/variables.js` (`formatList`), le test dans le groupe `varShapes`.

- **L'Excel d'une seule ligne écrit de vraies dates** : une colonne Date ou Date et heure s'écrivait dans la case sous forme de texte (« 12/09/2026 »), qu'on ne trie ni ne calcule (échéance + 30 jours), alors que l'export
  en lot (un classeur ou une feuille par ligne) écrit une vraie date d'Excel. Maintenant la case de la ligne choisie est une vraie date, avec le même numéro de série et le même format que dans le lot (« 12/09/2026 »,
  « 12 septembre 2026 », « 12/09/2026 23:30 » selon la bulle), l'heure lue dans le fuseau de la colonne ; une date vide laisse la case vide. Une colonne « Any » qui porte une date reste du texte. Le code est dans
  `js/xlsx-export.js` (`resolvedFiniteNumber`), le test dans le groupe `varShapes`.

- **Une cellule dont la formule a échoué s'écrit pareil partout** : une cellule que Grist montre en erreur (« #DIV/0! » quand une formule divise par zéro, « #AttributeError », « #TypeError », « #Invalid DateTime: bientôt »
  pour une formule qui rend du texte dans une colonne Date…) s'écrivait « #DIV/0! » dans la Lecture, le PDF, le Word et l'Excel de la ligne choisie, mais rien du tout dans une colonne Date ou Date et heure, et « E, ZeroDivisionError »
  à l'export en lot, dans les boucles et les tables liées (« , , , » pour une colonne Date) ; un calcul dessus disait « contient « E » » en lot et « contient « #DIV/0! » » ailleurs, et une règle « = #DIV/0! » ne la reconnaissait
  qu'en ligne seule. Maintenant le document écrit le texte de Grist, dans une colonne de n'importe quel type (Numérique, Entier, Oui / Non, Date, Date et heure, Texte, Any, liste de choix, Référence, liste de références),
  sur la ligne choisie comme à l'export en lot, et la case Excel est du texte, le même. Le code est dans `js/variable-format.js` (`cellError`, `isCellError`) et
  `js/variables.js` (`formatValue`, `decodeShown`, `cellValue`), les tests dans le groupe `varShapes`.

- **Une Référence qui montre un numéro, un identifiant de ligne, un Oui / Non ou une date s'écrit pareil partout** : dans la Lecture, le PDF, le Word et l'Excel de la ligne choisie, elle s'écrivait « Produits[2024] »
  pour un numéro (« Produits[0] » pour une Référence vide), « 2026-09-12 » ou « 2026-09-12T21:30:00.000Z » pour une date et « faux » pour un Oui / Non dont la Référence ne désigne rien ; à l'export en lot, dans les boucles et
  les tables liées, elle s'écrivait « 2024 » mais « d, 1789171200 » pour une date, et un calcul dessus échouait (« contient « Produits[2024] », qui n'est pas un nombre ») ou additionnait des secondes. Maintenant le document
  écrit « 2024 » ou « 12/09/2026 » (le jour dans le fuseau de la colonne montrée : 23 h 30 UTC le 31/12 est le 01/01/2027 à Paris) et rien quand la Référence ne désigne aucune ligne ; « 0 » reste un 0 quand la ligne
  désignée vaut 0. Les règles suivent (« = 2024 », « > 2000 », « = 12/09/2026 », « = 2026-09-12 », « est vide » ne se disent plus faux sur la ligne choisie), le calcul « + 1 » donne 2 025 et refuse une date comme sur une
  colonne Date, un filtre de boucle compare le jour et un tri se fait dans l'ordre du calendrier, la case Excel écrit le même texte. Une liste de références de dates s'écrit « 01/03/2026, 12/09/2026 » partout, et la bulle
  de la colonne dans une zone « liste de références » écrit la date de chaque fiche.
  Le code est dans `js/variables.js` (`decodeShown`, `shownValue`, `cellValue`, `effectiveFormatOf`, `calcOperand`), `js/variable-format.js` (`formatDate`), `js/condition-rules.js` (`compareDates`,
  `expectedFromValue`) et `js/loop-rules.js` (`sortKey`, les ancres d'une liste).

- **Le repère « Saut de page » et la galerie de modèles parlent anglais dans une interface anglaise** : dans l'éditeur, le repère d'un saut de page dit « Page break » (il disait
  toujours « Saut de page ») ; le document enregistré ne change pas, il garde « Saut de page » quelle que soit la langue où il a été écrit, comme les exports et la Lecture. Dans la
  galerie « Créer à partir d'un modèle », les noms des 22 modèles et leurs mots-clés (vente, administratif, événement, impression, stock, métier) sont traduits : sur les cartes, dans
  les boutons de mots-clés, dans la recherche (elle lit le nom que la carte montre), dans l'aperçu et dans le nom du modèle enregistré. Les modèles eux-mêmes restent en français, et en
  français rien ne change. Un modèle sans traduction (un modèle de démonstration) garde son nom ; `dev-tests/verify-gallery-captures.mjs` vérifie que chaque modèle et chaque mot-clé
  du catalogue a la sienne. Le code est dans `js/editor-nodes.js` (`createPageBreakNode`), `js/template-gallery-modal.js` (`entryName`, `tagLabel`) et `js/i18n.js` (`pageBreak.marker`,
  `gallery.name.*`, `gallery.tag.*`, `I18n.has`).

- **La virgule décimale tapée dans la valeur d'une règle vaut le point** : sur une colonne Numérique ou Entier, « 99,5 » n'était pas lu comme un nombre et la règle comparait du texte : pour un total de
  1 234,5, « > 99,5 », « = 1234,5 », « = 1234,50 » et « ≤ 1234,5 » donnaient faux et « ≠ 1234,5 » vrai, sans aucun message, alors qu'avec le point (99.5) tout était juste. « 99,5 » et « 99.5 »
  veulent maintenant dire la même chose face à un nombre, dans les macro-modèles, les blocs, valeurs, cases et bulles conditionnels et les filtres d'une boucle. Une seule virgule entre deux suites de
  chiffres est décimale, en français comme en anglais (« 1,234 » est 1,234, jamais mille deux cent trente-quatre) ; tout le reste se lit comme avant, et une colonne Texte garde la comparaison de
  texte. Le code est dans `js/condition-rules.js` (`compareGeneral`, `withDecimalPoint`).

- **« Est vide » marche sur une liste de références sans élément** : une liste de références qu'on n'a pas remplie, ou qu'une formule de Grist calcule vide (les remises d'une facture
  qui n'en a pas), n'était reconnue ni par « est vide » ni par « n'est pas vide » : « est vide » ne se déclenchait jamais et « n'est pas vide » toujours, si bien qu'un bloc « Aucune
  remise » ne s'affichait jamais et qu'un « Détail des remises » s'affichait même sans remise. Grist envoie cette liste sans élément sous deux formes, `[]` pour la ligne affichée et
  `["L"]` (puis `[]` une fois décodée) pour la ligne d'un export en lot : ce n'était ni rien ni un texte vide. Une liste sans élément est maintenant vide, quel qu'en soit le type, dans
  les macro-modèles, les blocs, valeurs, cases et bulles conditionnels et les conditions d'un Excel (la comparaison de deux colonnes et le filtre d'une boucle la lisaient déjà ainsi) ;
  une liste de choix multiples laissée vide marchait déjà. Le code est dans `js/condition-rules.js` (`isBlank`, `compareValues`).

- **Le format de date d'une variable marche aussi sur une colonne « Date et heure », et sa barre gagne une liste « Heure »** : Grist rend le type d'une telle colonne avec son fuseau («
  DateTime:Europe/Paris »), jamais « DateTime » nu, et le widget ne le reconnaissait pas. Sans réglage, la Lecture, le PDF, le Word, le nom du fichier et l'objet du courriel écrivaient le
  texte brut « 2026-09-12T21:30:00.000Z » là où une colonne Date écrit « 12/09/2026 » ; la barre de la bulle n'avait aucun réglage de date ; un format posé à la main lisait le jour en UTC
  (un rendez-vous du 13/09 à 00 h 30 à Paris s'écrivait « 12 septembre 2026 ») ; l'Excel écrivait du texte ; « Colonne… » et « Remplacer » ne voyaient pas une date, et un calcul sur la
  colonne n'était pas refusé comme sur une colonne Date. Maintenant la bulle a les réglages de date d'une colonne Date, et le jour est celui du fuseau de la colonne pour les sept formats,
  partout où la bulle s'écrit. Une liste « Heure » de plus, qui n'existe que pour cette colonne, écrit l'heure du fuseau de la colonne : « Sans heure » (le départ, c'est l'écriture d'avant :
  aucun modèle déjà enregistré n'écrit d'heure), « 23:30 », « 23 h 30 » ou « 11:30 PM » (à 12 heures). L'heure suit la date après une espace, avec « à » derrière un mois en lettres (« 12
  septembre 2026 à 23 h 30 »), et reste en chiffres même avec « Lettres ». Dans les exports Excel de plusieurs lignes, une case qui ne contient que cette bulle est une vraie date, avec
  l'heure quand la bulle l'écrit. Le code est dans `js/variable-format.js` (`formatDate`, `wallClock`, `TIME_STYLES`), `js/variables.js`, `js/floating-toolbars.js` et `js/xlsx-export.js`
  (`typedDate`).

- **Entrée valide le nom d'un modèle partout où on le saisit, et un nom effacé ne fait plus perdre l'enregistrement** : le crayon « Renommer » et la fenêtre « Enregistrer sous
  (copie) » validaient déjà le nom par Entrée ; pas la fenêtre du macro-modèle, où Entrée dans « Nom du macro-modèle » ne faisait rien (il fallait cliquer sur « Enregistrer »).
  Entrée y fait maintenant ce que fait « Enregistrer » : la fenêtre se ferme, un nom déjà pris est numéroté, un nom vide donne le même message et la fenêtre reste ouverte ; pendant
  une composition de texte (accent mort, saisie asiatique), Entrée ne fait que choisir le caractère, et Échap garde son rôle. Sur un modèle neuf, pas encore enregistré, Entrée
  refermait le champ du crayon mais le titre redisait « — Nouveau modèle — », comme si le nom était perdu : le titre montre maintenant le nom validé (Entrée ou un clic ailleurs),
  le modèle reste à enregistrer, et le modèle vierge suivant repart de « — Nouveau modèle — ». Enfin, dans le champ du crayon d'un modèle enregistré, un nom effacé (Entrée ou un
  clic ailleurs) fermait le champ vide : le titre gardait l'ancien nom, mais ni l'enregistrement automatique ni « Enregistrer » n'écrivent un modèle sans nom, si bien que plus rien
  de ce qui était tapé ensuite n'était gardé, sans un mot. Le champ reprend maintenant le nom d'avant et le coin d'état le dit (« Nom du modèle requis : « Facture » est gardé. »).
  Échap, qui ne faisait rien dans ce champ, abandonne la frappe : le champ se referme sur le nom d'avant, même si l'enregistrement automatique avait déjà écrit le début du nom tapé
  (le passage suivant le réécrit) ; pendant une composition de texte, Échap n'annule que la composition.

- **« Abandonner » abandonne vraiment ce qui vient d'être tapé, même quand l'enregistrement automatique était en train d'écrire** : la question « Enregistrer / Abandonner / Annuler »
  (en changeant de modèle, en créant un document, un email ou une grille, en important un fichier, en changeant de langue) empêchait les passages suivants de l'enregistrement
  automatique, mais pas celui qui était déjà parti : il pouvait finir d'écrire pendant la question, et le texte était déjà enregistré quand la personne répondait « Abandonner ». La
  question attend maintenant la fin du passage en cours (8 secondes au plus, si Grist ne répond plus) : s'il a tout enregistré, il n'y a plus rien à demander et la suite se fait
  directement ; sinon la question est posée, et rien ne s'écrit tant qu'elle est ouverte, même si la personne hésite longtemps. Sans passage en cours, la question s'ouvre comme avant.

- **Dans un en-tête ou un pied de page, un logo aligné à gauche ou à droite reste à côté du texte dans la Lecture, le PDF et Word** : l'éditeur le montrait déjà à côté du texte,
  mais la Lecture et l'impression le posaient seul sur sa ligne, au-dessus du texte ; le PDF perdait l'image (le fichier n'en contenait aucune et le texte restait décalé comme
  s'il y en avait une) ; Word la superposait au texte quand elle était à gauche. Le logo flotte maintenant à côté du texte dans la bande du haut et du bas de la feuille comme dans
  les coutures de la Lecture ; le PDF le garde, au bord de la page, son texte à côté de lui ; Word le met dans la première case d'une ligne de tableau sans bordure, son texte dans
  l'autre, ce qui se rend de la même façon dans Word, LibreOffice et Google Docs.

- **Les listes à puces et numérotées d'un en-tête ou d'un pied de page gardent leurs puces et leurs numéros dans Word** : le fichier désignait une numérotation que Word ne trouvait
  pas dans `numbering.xml`, si bien que le texte s'affichait sans puce ni numéro. Le corps du document n'était pas concerné.

- **Un en-tête ou un pied de page plus haut que sa zone ne repousse plus le texte de la page** : la zone d'un en-tête ou d'un pied garde sa taille (60 px de contenu) ; ce qui la
  dépasse est coupé de la même façon dans la Lecture, l'impression, le PDF et Word, et le texte de la page reste exactement où il est. Avant, Word descendait tout le corps du
  document dès que l'en-tête ou le pied était plus haut que la zone (huit lignes, une grande image), le PDF coupait à une hauteur qui dépendait des marges, et la Lecture
  montrait une bande plus haute que la zone. Dans Word, le contenu qui dépasse est enveloppé dans une ligne de tableau sans bordure dont la hauteur est exacte (45 pt) ; dans le
  PDF, les lignes au-delà de la limite sont retirées et une image trop haute est rognée ; dans la Lecture et l'impression, la bande est coupée à 60 px. Un en-tête ou un pied qui
  tient dans la zone s'écrit comme avant. L'éditeur dit ce qui dépasse (voir « Les en-têtes et les pieds de page ne refusent plus rien à la saisie »).

- **Le logo aligné d'un pied de page figure dans le PDF** : un logo aligné à gauche ou à droite dans un pied de page n'était pas peint dans le PDF, il sortait de la feuille par le
  bas, deux fois trop bas. Il est maintenant au bord de la page, son texte à côté de lui, comme à l'écran. L'en-tête, Word et la Lecture n'étaient pas concernés.

- **Dans Word, les lignes vides d'un en-tête ou d'un pied de page ne descendent plus le texte de la page** : Word écrit chaque ligne vide, mais la mesure du widget ne la comptait
  pas ; un en-tête fait d'un texte suivi de huit retours à la ligne passait pour une seule ligne, n'était pas coupé à la zone et le corps du document descendait (de 83 pt à
  130 pt dans l'essai). Une ligne vide compte maintenant pour une ligne, et ce qui dépasse la zone est coupé comme le reste ; un en-tête ou un pied d'une ou deux lignes
  s'écrit comme avant. Le PDF et la Lecture n'étaient pas concernés.

- **La liste « # » met les colonnes de la table de la page en tête, même quand cette table n'a encore aucune ligne** : le widget ne connaissait la table de la page qu'à l'arrivée d'une
  ligne envoyée par Grist. Avec une table vide, ou avec « Sélectionner par » tant qu'aucune ligne n'est choisie, aucune ligne n'arrive : la liste « # » (dans le texte comme dans les
  champs Objet, À, Cc, Cci et Nom du fichier PDF) suivait alors l'ordre des tables du document, et la table de la page, souvent créée en dernier, se retrouvait tout en bas. Le widget lit
  maintenant sa table dans ce que Grist lui envoie dès l'ouverture, avec ou sans ligne : ses colonnes sont en tête, puis celles des autres tables, comme c'était déjà le cas dès qu'une
  ligne était choisie. Si Grist rattache le widget à une autre table, la liste la suit sans attendre une ligne. Les autres listes de colonnes qui commencent par la table de la page en
  profitent aussi.

- **Le premier clic sur un bouton de numérotation du menu « Titre » ne se perd plus** : dans un panneau bas (400 px), « 1. », « a. », « I. », « Article 1 » et « Aucune » sont sous le bas du
  menu, qu'il faut faire défiler. Le premier appui donnait le focus au bouton et le menu remontait tout en haut : le bouton s'éloignait avant le relâchement, rien n'était choisi et il fallait
  cliquer une seconde fois. Le menu garde maintenant sa place quand on appuie sur un de ses boutons ; il ne revient en haut qu'à son ouverture.

- **Le sommaire de l'éditeur montre la numérotation du modèle qu'on ouvre** : le bloc « Sommaire » gardait la numérotation du modèle précédent (ou aucune) jusqu'à la première frappe, alors
  que les titres du texte, la Lecture, le PDF, le Word et le Markdown étaient justes. Il suit maintenant celle du modèle ouvert, sans rien taper.

- **Les lettres et les numéros d'un sous-titre repartent à chaque nouveau titre, dans l'éditeur et en Lecture** : avec « 1) », « a) » ou « I) », un titre 2 continuait ses lettres
  d'un titre 1 à l'autre (« c) » sous le titre « 2) » au lieu de « a) »), un titre 3 ses chiffres romains ; le PDF, le Word et le sommaire repartaient bien. L'éditeur et la Lecture
  repartent maintenant comme eux. Même cause, autre conséquence : les notes de bas de page de l'éditeur et de la Lecture portaient toutes le numéro « 1 » ; elles sont de nouveau
  numérotées 1, 2, 3.

- **Une puce, un numéro, une tâche ou une citation centré, à droite ou justifié l'est aussi dans le Word** : le bouton
  d'alignement de l'éditeur centre, aligne à droite ou justifie le texte d'un point de liste ou d'une citation, mais le
  Word l'écrivait toujours à gauche (seul le paragraphe ordinaire suivait l'éditeur). Il suit maintenant l'éditeur, au
  premier niveau, dans une sous-liste et dans une case de tableau, et les listes restent de vraies listes Word
  (numérotation native). Un point ou une citation de plusieurs paragraphes prend l'alignement du premier ; comme dans
  tout document Word, la puce, le numéro ou la case suit son texte aligné (dans l'éditeur et le PDF, elle reste au bord
  gauche).

- **Le cadre d'un QR code à colonne reste carré à toute taille** : en dessous de 60 px de large, le texte de remplacement « QR code » de son image
  masquée se coupait sur plusieurs lignes et rendait le cadre plus haut que large (38 x 42 px pour un QR code de 36 px, 32 x 82 px pour 30 px) ;
  le cadre garde maintenant sa forme carrée dans le corps du document comme dans un en-tête ou un pied de page.

- **Une liste de tâches a, dans le PDF, la case et le texte de l'éditeur** : la case du PDF était plus petite que celle de
  l'éditeur (3 mm de côté au lieu de 4) et le texte partait trop à gauche (4,6 mm après le bord de l'élément, 7,4 mm dans
  l'éditeur ; 5,6 mm avec le style « Classique »). La case prend maintenant la taille et la place de celle de l'éditeur dans
  les trois styles, cochée ou non, et le texte commence au même endroit, au premier niveau comme dans une case de tableau :
  ses lignes se coupent aux mêmes mots, à gauche, centrées, à droite ou justifiées. Un élément coupé par un saut de page
  n'élargit plus de 1 mm tout ce qui le suit (le paragraphe justifié d'après sortait de la marge de droite).

- **Une citation centrée, à droite ou justifiée l'est aussi dans le PDF** : le bouton d'alignement de l'éditeur centre, aligne
  à droite ou justifie le texte d'une citation, mais le PDF l'écrivait toujours à gauche. Il suit maintenant l'éditeur, au
  premier niveau et dans une case de tableau : le texte s'aligne dans la boîte de la citation (italique, retrait et espaces
  du dessus et du dessous inchangés) et ses lignes se coupent aux mêmes mots. Une citation de plusieurs paragraphes prend
  l'alignement du premier ; la dernière ligne d'un texte centré ou à droite finit une espace (moins d'1 mm) avant celle de
  l'éditeur, comme dans un paragraphe ordinaire.
- **Passer du corps à l'en-tête ou au pied ne propose plus rien en suivi des modifications et ne mélange plus
  l'historique** : avec le suivi allumé, ouvrir l'en-tête (ou le pied) empilait le texte du corps (barré) et celui
  de l'en-tête (souligné) en suggestions, qui se retrouvaient ensuite dans le modèle enregistré ; et Annuler juste
  après avoir ouvert ou fermé une zone remettait le corps dans l'en-tête, ou l'en-tête dans le corps. Le passage ne
  laisse plus de suggestion et n'entre plus dans l'historique : le corps, l'en-tête et le pied gardent chacun le
  leur (Annuler défait la dernière frappe du texte ouvert).
- **Un point de liste centré, à droite ou justifié l'est aussi dans le PDF** : le bouton d'alignement de l'éditeur centre, aligne
  à droite ou justifie le texte d'un point de liste, mais le PDF l'écrivait toujours à gauche. Il suit maintenant l'éditeur, au
  premier niveau, dans une sous-liste, dans une case de tableau et dans une liste de tâches : le texte s'aligne dans la boîte
  du point, ses lignes se coupent aux mêmes mots, et la puce ou le numéro reste au bord gauche de la boîte, comme dans l'éditeur
  (elle ne suit pas le texte centré). Un point coupé par un saut de page garde ses lignes et ne décale rien derrière lui.
  La dernière ligne d'un texte centré ou à droite finit une espace (moins d'1 mm) avant celle de l'éditeur, comme dans un
  paragraphe ordinaire.
- **Le texte d'une liste commence au même endroit dans le PDF que dans l'éditeur** : dans le PDF, la puce ou le numéro était
  écrit en tête du texte, au bord de l'élément : la première ligne d'un point de liste partait 2 mm (une puce) à 4 mm (« 1. »)
  plus à droite que dans l'éditeur et avait d'autant moins de place, et les lignes suivantes revenaient sous la puce. La puce
  ou le numéro pend maintenant à gauche du texte, comme dans l'éditeur, la Lecture et le Word : toutes les lignes d'un point
  commencent au même bord, au premier niveau, dans une sous-liste et dans une case de tableau, et la première ligne a autant
  de place que les suivantes. Un numéro plus large que le retrait de la liste (« 100. ») sort à gauche du retrait, comme dans
  l'éditeur. Les listes de tâches ont leur propre entrée, plus haut.
- **Un saut de page qui termine le document n'ouvre plus de « Page 2 » vide dans l'éditeur** : un saut de page posé à la main à la
  fin du document (rien derrière lui que des lignes vides, ou d'autres sauts) gardait dans l'éditeur son repère « Page 2 » et
  comptait dans le « n/total » du pied de page, alors que la Lecture, le PDF et le Word le retirent avec sa queue : on voyait
  deux pages là où l'export n'en faisait qu'une. L'éditeur n'en dessine plus le repère : le document montre les pages qui
  sortiront. Le repère revient dès qu'un texte vient derrière le saut (un texte tapé sur la ligne de dessous, par exemple) et
  repart avec lui ; l'éditeur défile alors jusqu'au curseur si la page qui apparaît l'a descendu hors du panneau. Le saut reste
  visible comme bloc « Saut de page », les lignes vides restent dans le document, et deux sauts de suite devant du texte
  laissent toujours leur page blanche, voulue.
- **Le curseur passe sous le saut de page quand on clique sur le bouton** : le bouton « Saut de page » laissait le saut posé
  sélectionné, si bien que la première touche tapée le remplaçait : on perdait le saut en voulant écrire à la suite. Le
  curseur se place maintenant sur la ligne de dessous, prêt à écrire, et l'éditeur défile jusqu'à elle (elle ouvre la page
  suivante). Un texte coupé en deux par le saut a déjà sa suite dessous ; en fin de document, devant un tableau, une
  liste ou un autre saut de page, une ligne vide est ajoutée dessous. Un seul Annuler rend le document d'avant le clic,
  ligne ajoutée comprise. Dans une grille ou un tableau de document, le bouton garde son rôle (le saut avant la ligne)
  et ne déplace pas le curseur.
- **Des lignes vides juste avant un saut de page ne font plus de page blanche** : quand le texte arrivait à la marge du bas d'une
  page et qu'une ou plusieurs lignes vides (une Entrée de trop) précédaient un saut de page posé à la main, ces lignes ne tenaient
  plus sur la page et ouvraient une page pour elles seules, que le saut refermait aussitôt : une page blanche au milieu du
  document, dans l'éditeur (Aperçu A4), la Lecture, l'impression, le PDF et le Word. Ces lignes vides ne comptent plus : le texte qui
  suit le saut commence en haut de la page suivante, comme sans elles. L'éditeur les garde (on peut y écrire, et une ligne
  écrite dessus compte pour sa page), les autres lignes vides du texte gardent leur hauteur, et deux sauts de page de suite
  laissent toujours leur page blanche, voulue.
- **Un tableau plus large que sa colonne reste dans sa colonne, dans une zone à deux colonnes** : un tableau posé dans l'une des
  deux colonnes d'une zone n'était ramené qu'à la largeur de la page : il passait sur le texte de l'autre colonne, et celui de
  la colonne de droite sortait même de la page. Il est maintenant ramené à la largeur du texte de sa colonne, colonnes au
  prorata (aucune sous 25 px), dans l'éditeur (Aperçu A4), la Lecture, l'impression, le PDF et le Word. Il suit la colonne
  quand on déplace le trait de séparation de la zone. Un tableau qui tient déjà dans sa colonne n'est pas touché, et un tableau
  déjà au plus étroit n'est plus récrit à chaque frappe.
- **Les espaces tapés autour d'une valeur qui n'écrit rien ne s'additionnent plus** : quand une valeur conditionnelle
  n'était pas retenue (deux de suite, « Madame » puis « Monsieur » avant « Durand »), ou qu'une bulle de variable était vide, masquée
  par sa condition, à zéro masqué, sans valeur dans son « sinon » ou sans ligne dans sa boucle, elle disparaissait
  mais les espaces tapés de chaque côté restaient : « Bonjour  Durand » (deux espaces), « Cher Monsieur , bonjour »,
  un paragraphe qui commençait ou finissait par une espace. Il n'en reste maintenant qu'une entre deux mots, aucune
  au début ni à la fin d'un paragraphe, aucune devant une virgule ou un point collé à ce qui disparaît ; une espace
  tapée devant un « : » (usage français) reste. C'est corrigé partout où le document est écrit pour une ligne : la
  Lecture, l'impression, le PDF, le Word, l'Excel, le Markdown, l'e-mail, l'en-tête et le pied de page, et les champs
  texte (Objet, À, Cc, Cci, nom du PDF). Seules les espaces collées à ce qui n'écrit rien sont touchées (deux espaces
  tapées ailleurs restent deux) et le modèle enregistré n'est jamais modifié ; dans l'éditeur, les bulles et les
  valeurs gardent leur marge visuelle, qui n'est pas une espace du texte.
- **Une liste dans une citation s'écrit dans le PDF avec ses puces, chaque élément sur sa ligne, et son trait** : dans le
  PDF, une liste posée dans une citation sortait d'un seul tenant avec elle : ses éléments se collaient sur une même
  ligne, sans puce ni numéro, et le trait posé dans un élément ne se dessinait pas. Chaque élément a maintenant sa
  ligne, sa puce ou son numéro au retrait de l'éditeur, en italique comme la citation ; le trait va de la puce au
  bord droit de la page ; le texte d'avant et d'après la liste reste dans la citation.
- **Une citation dans une case de tableau s'écrit dans le PDF comme une citation du texte** : dans le PDF, une citation
  posée dans une case sortait à plat, comme le texte de la case : sans italique, sans son retrait et sans
  l'espace de 4 points qu'elle a au-dessus et en dessous hors tableau. Elle est maintenant en italique, au même
  retrait et avec les mêmes espaces que hors tableau, dans toutes les colonnes, et ses lignes se coupent aux mêmes
  mots que dans l'éditeur ; le trait d'une citation de case part de ce retrait.
- **Un modèle quitté puis rouvert aussitôt montre ce qui vient d'y être écrit** : après une modification (un mot, le
  sens de la page, l'en-tête), l'enregistrement automatique l'écrivait bien dans Grist, mais le modèle qu'on quittait
  puis rouvrait dans les secondes qui suivaient s'affichait avec son état d'avant, comme si la modification était
  perdue ; la modification suivante, enregistrée depuis cet écran, écrasait alors la première dans Grist, sans aucun
  message. Le modèle rouvert montre maintenant ce qui vient d'être enregistré, et une lecture de la liste des modèles
  partie avant un enregistrement et revenue après (Grist lent) ne remet plus l'ancien état.
- **Une liste dans une case de tableau est bien placée dans le PDF, dans toutes les colonnes** : dans le PDF, une liste
  (à puces, numérotée ou de tâches) posée dans la deuxième colonne d'un tableau, ou dans une suivante, partait loin à
  droite et son texte tenait à une lettre par ligne ; dans la première colonne, elle était décalée de quelques points
  vers la droite. Sa puce et son texte sont maintenant à la même distance du bord de la case que dans une liste hors
  tableau. Une sous-liste dans une case (une liste dans un élément de liste) n'avait ni puce ni retrait : elle a les
  deux, un niveau plus à droite que son élément.
- **Un tableau de document sort proprement dans tous les affichages et tous les exports** : les colonnes et les lignes
  d'un même tableau ont été comparées dans l'éditeur, la Lecture, l'impression du navigateur, le PDF et le Word (page A4,
  A5, A3, en paysage, marges changées ; tableaux étroits, larges, à cases fusionnées, colorées, à hauteurs réglées), et
  quatre défauts sont corrigés. Un tableau enregistré sans l'Aperçu A4, plus large que la page, y rentre maintenant dans
  le Word (la grille et chaque case, au prorata des colonnes) comme dans le PDF, la Lecture et l'impression. Cocher
  « Aperçu A4 » le ramène aussitôt dans la page, sans attendre une frappe et sans marquer le document comme modifié. Un
  tableau posé dans un élément de liste (à puces, numérotée, imbriquée) ou dans une citation n'est plus écrit à plat
  (« Un élémentL1AL1B… ») dans le PDF et le Word : c'est un tableau, au retrait de l'élément, et le texte qui le suit
  continue l'élément sans nouvelle puce.
- **Le trait du PDF a la largeur de son bloc et se voit dans les cases, listes et citations** : dans le PDF, le trait
  faisait toujours la même longueur (un peu moins que le texte, et assez pour déborder sur la colonne d'à côté dans
  une zone à deux colonnes), et il n'était pas dessiné du tout dans une case de tableau, un élément de liste ou une
  citation, alors que l'éditeur l'y montre. Il suit maintenant la largeur de sa page, de sa colonne, de sa case, de
  son élément de liste ou de sa citation, et il est dessiné partout où l'éditeur le montre, à la même hauteur. Il
  reste noir. Le PDF d'un courrier peut bouger de quelques lignes. Pas encore dessiné : un trait dans une liste
  placée dans une citation.
- **Le trait d'une citation posée dans un élément de liste, une case ou une autre citation se voit dans le PDF** : ces
  citations étaient lues d'un seul tenant avec ce qui les entoure : leur trait n'était pas dessiné, et leur première
  ligne se collait à la dernière de l'élément de liste (« AlphaBeta » sur une seule ligne). La citation d'un élément de
  liste ou d'une autre citation fait maintenant ses propres blocs (en italique, à son retrait) et son trait est dessiné
  à la même hauteur que dans l'éditeur ; celle d'une case garde son texte à plat, avec son trait d'un bord de la case
  à l'autre. Un trait dans un élément de liste de tâches n'existe pas : l'éditeur le sort de la liste (deux listes, le
  trait entre elles) et le PDF le dessine. Le PDF d'un courrier qui pose une citation dans une liste peut bouger de
  quelques lignes.
- **La zone où l'on écrit le document a un nom pour un lecteur d'écran** : elle est annoncée comme une zone de texte à
  plusieurs lignes, « Éditeur du modèle » (« En-tête ou pied de page du modèle » quand on écrit un en-tête ou un
  pied), en français comme en anglais.
- **Le trait a la même hauteur dans l'éditeur, la Lecture et le PDF** : un trait prenait 21 px dans l'éditeur, 16 px
  en Lecture et 13 px dans le PDF, et l'éditeur ne comptait pas sa place en coupant les pages : un courrier à
  plusieurs traits n'avait pas les mêmes pages selon qu'on le regardait ou qu'on l'exportait (sur un courrier à
  22 traits, la première page de l'éditeur portait huit lignes de plus que celle du PDF). Le trait prend
  maintenant la même place partout, 21 px, deux traits de suite 42 px, et les pages tombent aux mêmes lignes ;
  le PDF d'un courrier à traits peut bouger de quelques lignes.
- **Le PDF passe un paragraphe à cheval sur le bas d'une page en entier sur la page suivante, comme l'éditeur** : un
  paragraphe (ou une citation) de plusieurs lignes qui ne tenait plus dans la place restante d'une page était
  coupé entre deux lignes par le PDF, alors que l'éditeur, la Lecture et l'impression par le navigateur le
  passaient en entier sur la page suivante : un même courrier n'avait pas les mêmes pages selon qu'on le
  regardait ou qu'on l'exportait. Le PDF fait maintenant comme eux, au premier niveau comme dans une colonne de
  zone ; il reste parfois un peu de blanc en bas de page, comme dans l'éditeur. Un paragraphe de plus de 90 %
  d'une page, un titre, une liste, un bloc de code, un encadré, un paragraphe à côté d'une image flottante, une
  légende et un texte relié par « Garder avec le suivant » gardent leur coupe d'avant.
- **La barre du tableau reste affichée après un réglage de « Bordures »** : choisir un réglage referme le menu, mais
  la barre du tableau se refermait avec lui alors que le curseur était toujours dans la case ; il fallait cliquer
  ailleurs pour la retrouver. Elle reste affichée.
- **Tableau de document en aperçu A4 : la ligne qui ouvre une page garde sa hauteur** : quand un tableau se poursuit
  sur une deuxième page, la ligne qui ouvre cette page est descendue sous la couture ; son numéro (les bandeaux
  A, B, C / 1, 2, 3) et sa poignée comptaient ce vide comme de la hauteur de la ligne, si bien que le numéro
  devenait immense, que tirer sa poignée posait une hauteur démesurée et que « Égaliser » prenait cette hauteur
  pour la moyenne. Le numéro, la poignée et « Égaliser » ne mesurent plus que la ligne.
- **Une zone à deux colonnes passe à la page suivante dans l'éditeur et dans la Lecture** : une zone plus
  haute que ce qui reste de la page dépassait le bas de la feuille sans jamais ouvrir de deuxième page
  (Entrée dans une colonne n'en ouvrait donc jamais), alors que le PDF la coupait là où la page finit. L'éditeur,
  la Lecture et l'impression par le navigateur la coupent maintenant comme le PDF, colonne par colonne : chaque
  colonne continue sur la page suivante à partir du premier paragraphe (ou de la première liste, du premier
  tableau) qui ne tient plus, et les deux colonnes y reprennent à la même hauteur, en haut de la page. Dans
  l'éditeur le liseré de la zone et les bordures des colonnes s'arrêtent à la couture. Les lignes vides tout en bas des
  colonnes de la dernière zone d'un modèle n'ouvrent pas de page de plus, comme les lignes vides à la fin d'un
  modèle ; dès que du contenu suit la zone, elles comptent.
- **Les sauts de page du Word et du PDF suivent l'éditeur** : un saut de page posé devant un tableau, des
  colonnes, un trait horizontal ou un sommaire est gardé par le Word (il était perdu, ou écrit après le
  sommaire), et deux sauts de page de suite laissent une page blanche dans le PDF et dans le Word, comme dans
  l'éditeur, la Lecture et l'impression navigateur. Un modèle de macro-modèle qui commence par un tableau ou
  des colonnes commence donc bien sa page dans le Word.
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
  étiré à toute la page.
- **Un tableau de la largeur de la page dans le Word** : un tableau dont les colonnes dépassaient de 2 à 2,7 mm
  la largeur du texte de la page (une facture ou un bon de commande en A4, par exemple) est ramené à cette
  largeur, comme dans le PDF, au lieu de déborder. Un tableau qui tient dans la page ne change pas.
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
- **Page vide entre deux modèles d'un macro-modèle à l'export PDF** : quand la lettre d'un modèle arrive à la
  marge du bas, la ligne vide qui la termine (celle que l'éditeur laisse derrière une dernière zone à deux
  colonnes ou un dernier tableau, ou une Entrée de trop) n'y tenait plus et ouvrait une page blanche avant le
  modèle suivant : dans le PDF, et dans la Lecture quand le texte arrivait pile à la marge (elle y a un peu plus
  de place que le PDF pour une lettre en colonnes ou un tableau, d'où une page vide au PDF seul). La fin de
  chaque modèle est maintenant rognée comme la fin du document, dans la Lecture, le PDF et le Word : ses lignes
  vides, la ligne qui ne porte qu'une image en calque de la première page (l'image reste à sa place, ancrée au
  paragraphe qui la précède) et les lignes vides au bas des colonnes d'une dernière zone. Les lignes vides du
  milieu d'un modèle, le saut de page qui ouvre le modèle suivant et un modèle entièrement vide ne changent pas.
- **Infobulles des boutons en thème sombre** : le texte des infobulles de la barre était écrit en blanc sur une
  bulle claire (1,19:1, à peine lisible). Il suit maintenant la surface du thème : foncé sur la bulle claire en
  thème sombre, toujours blanc sur la bulle sombre en thème clair.
- **Lignes SIRET et TVA du client dans la facture et le contrat de la galerie** : ces deux lignes ne
  s'affichaient jamais, même pour un client dont les champs étaient remplis, parce que leur condition lisait
  la table de la page au lieu de celle du client. Les modèles de la galerie les affichent ; ceux qui ont déjà
  été créés ne changent pas.
- **Ligne choisie d'un menu sous la souris** : dans un menu qui s'ouvre au survol (Type d'export, qualité du PDF,
  niveaux de titre), la ligne choisie est en bleu et en gras, mais sous la souris ce bleu se posait sur le gris du
  survol et n'y atteignait que 4,0:1 en thème clair et 4,4:1 en thème sombre, un peu pâle. Elle garde son bleu et son
  gras, avec un bleu plus soutenu tant que la souris est dessus (5,7:1 en clair, 5,4:1 en sombre) ; au repos, rien ne
  change.
- **Onglet choisi sous la souris** : dans les Réglages et dans la liste « # » (Variables / Puces), l'onglet choisi est
  bleu et souligné, mais sous la souris ce bleu se posait sur le gris du survol et n'y atteignait que 4,0:1 en thème
  clair et 4,4:1 en thème sombre. Il garde son bleu et son trait, avec un bleu plus soutenu tant que la souris est
  dessus (5,7:1 en clair, 5,4:1 en sombre) ; au repos, rien ne change.
- **Les champs prennent la police des boutons** : depuis le passage à la police du système, les boutons la prenaient
  mais pas les champs. Le nom du modèle (quand on le renomme), l'Objet, À, Cc, Cci et le nom du PDF d'un email, la
  recherche de la galerie, le nom du macro-modèle, les marges et le caractère déclencheur des Réglages, les décimales,
  la devise et le format de date d'une variable restaient en Arial, la police par défaut du navigateur. Tous les champs
  de l'interface, et le texte qu'on y tape, ont maintenant la même police que les boutons voisins ; leur taille et leur
  place ne changent pas. Le contenu du document garde son Roboto.
- **Les boutons et les libellés prennent aussi la police du système** : après les champs, il restait quelques boutons
  et libellés en Arial, la police par défaut du navigateur : les lignes du menu des polices et du menu des tailles, les
  boutons FR, US, J, M, A, « Lettres » et « vrai / faux » de la barre d'une variable, et « + Ajouter un en-tête » /
  « + Ajouter un pied de page » quand on survole la marge de la feuille. Ils ont maintenant la même police que le reste
  de l'interface ; la taille des lettres et la hauteur des lignes du menu ne changent pas (seule la largeur des boutons
  d'une variable suit la forme des lettres de la police de l'ordinateur). Le contenu du document garde son Roboto.
- **Le texte des en-têtes et des pieds de page s'écrit en Roboto dans la feuille** : il s'affichait en Arial, la police par
  défaut du navigateur, alors que le PDF et le reste du document sont en Roboto. La feuille montre maintenant les mêmes
  lettres que le PDF, pour l'en-tête et le pied de la première page comme pour ceux qui se répètent entre deux pages ; la
  taille du texte et la place des zones ne changent pas.
- **Les boutons jour, mois et année d'une date suivent la langue** : la barre d'une variable de date affichait « J »,
  « M » et « A » même quand l'interface était en anglais. Elle affiche « D », « M » et « Y » en anglais, avec leurs
  infobulles dans la langue choisie.

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

- **A what's-new window, with real screenshots**: Settings > Credits gains a "What's new" line, under the version, which opens a nine-screen carousel: seven new things of version 1.0
  in pictures (the Loop, the version history, the template gallery, bookmarks, then, through Grist Factory Suite, live writing, presentations and the page chart, tagged "Grist Factory
  Suite"), then two "before → after" screens: what becomes of a template made with the beta, and the habits that change. The last screen leads, through "See details", to a second
  window, "Exporting, in detail": five screens of numbered screenshots (the "Export type" button and its menu, the three PDF qualities, "one row / all rows", several pages on one
  sheet, the protected PDF). The dots at the bottom move from one screen to the next (a single Tab stop, the arrows change screen); Escape closes one window at a time and gives the
  focus back to the button that had opened it; every screen has the same height, so the window doesn't jump. The images are the real widget's, in French and in English (`img/news/`,
  WebP, 0.6 MB in all); if one fails to load, the text and the screen's height stay. Nothing opens it by itself for now, and it writes nothing, neither in the browser nor in the
  document. The code is in `js/whats-new.js` (`WhatsNew.open`, `WhatsNew.openExport`) and `css/whats-new.css`.

- **A "Like in Grist" button in the toolbar of a number or a date**: a pipette reads the column's display format in Grist (currency - €, $, £... -, percentage, number of decimals,
  thousands separator, date and time format) and puts it on the bubble in one click, one single Undo. Nothing is applied by itself: an existing template reads as before. The
  button's tooltip shows what the click writes ("Like in Grist: 1 234,57 €") and adds "(approximate)" when the widget cannot write exactly the same: a month spelled out is written
  in the interface language where Grist always writes it in English, a 12-hour time is written "11:30 PM" or "11:30pm" (identical only for Grist's "h:mm A" and "h:mma", its default: "09:05 AM", with its leading zero, stays
  approximate), and the seconds, the time zone, the parentheses of a negative, the weekday before a numeric date, the dots or dashes of a date and the word or comma that joins the
  date to the time are not taken over. The button is greyed out, with its reason as a tooltip, when the widget cannot write it: a calculation
  (it has no Grist column), scientific notation, a date whose month comes before the day in a French interface (it would be read backwards), an unknown date format, an unreadable
  document currency (type it in the Currency box); and "Already written like in Grist" when the bubble already is. The click reads the column again: a setting changed in Grist a
  moment ago is taken into account. The toolbar of a number gets a "%" button (0.256 is written "25.6%"; it excludes the currency and "Words", the last choice stays) and the
  decimals list shows "0 to 10" for a Grist "at least, at most". Reading, the PDF, Word, the e-mail and Excel write the same text; in Excel, a typed cell keeps the percentage and its
  decimals (`#,##0.00 %`). The code is in `js/variable-format.js` (`gristColumnFormat`, `applyGristFormat`) and `js/grist-api.js` (`getColumnFormatOptions`, `getDocumentSettings`).

- **A loop over all the rows of a table**: the Loop icon of a bubble's bar is no longer greyed on an ordinary column of the page's table, nor on a
  table none of whose rows is attached to the displayed row. The "Loop" window offers "Rows of "Clients"": "Like the Grist view (its filter and its sort)", chosen by default for the
  page's table (the rows the widget shows, in the view's order: a filter or a sort set in Grist, saved or not, is found there), or "The whole table (without Grist's filter)", in
  the order of the table's rows. For a variable that also has rows attached to the displayed row (linked table, Reference list column), a choice "Attached to the displayed row" or
  "All the rows of the table" comes first in the window. The table row (or the list item, the paragraph, the variable alone) is then repeated for each row, with all its variables:
  the ones of the same table read the turn's row, the ones of another table linked by a "match" rule or by a Reference column read the rows that go with that row. Filter, sort,
  fallback text and separators are set as for attached rows; a zone that repeats all the rows of a table can hold an inner loop (for each invoice its lines). Beyond a thousand rows
  the window warns that Reading view may become slow (the PDF stays fast). In a table row that holds other variables or calculations, choosing "The variable, in its cell" (instead of "The table row") writes under the choice how many of those other bubbles will not follow the loop - only that cell is repeated - and how to make them follow; the note only counts the bubble's own row and does not appear for a variable alone in its row or in a sentence. In the table bar, a "Repeat the row" button (the Loop icon, after the alignments) opens the same window for the row the cursor is in: it picks by itself the bubble of the row that can repeat it (the one with linked rows first, then the one that goes over its whole table), "The table row" is chosen and all the other bubbles of the row follow; it lights up when the row is already repeated (from any cell of the row) and then reopens the window of the bubble that repeats it; it is greyed, with its reason, when the row has no variable to repeat, several rows are selected, a merged cell runs through the row or a linked table is locked. Reading view is redrawn by itself when Grist says the view's rows changed (a filter set or removed, a
  row added or modified); the PDF, the Word file, the batches and the e-mail read the view at the time of the export. The widget only sees the rows of its own block: a filter set on
  another table of the page changes nothing here. The code is in `js/loop-rules.js` (`allSourceFor`), `js/variable-loop.js` and `js/batch-scope.js` (`onViewChange`).

- **Bookmarks, and links that lead to them**: the "Bookmark…" row of the "Link and content blocks" menu (the second one, under "Link…") gives a name to the paragraph or heading
  where the cursor is. A small grey flag in the editor's margin shows it (nothing in the document, nothing shifted; a click on it reopens the window, which renames or removes the
  bookmark and says how many links lead to it). The "Link…" window has a second choice, "In this document": the list, with search, of the headings and bookmarks; a heading that has
  no bookmark gets its address with the link, in a single Undo. A link is followed like a web link: Ctrl/⌘+click in the editor (the target comes to the top of the visible area and
  the cursor goes there), a click or Enter in Reading view, and the tooltip names the target. The PDF leads to the bookmark's line, on its page, in the single PDF too; the Word
  file writes a bookmark and an internal link; the HTML an `id` and a `#…` link; the Markdown an `<a id>` anchor and a `[text](#…)` link (the "template" Markdown keeps the
  bookmark's name, and the import finds it again); the plain-text e-mail and the Excel file only write the link's text. A link whose target no longer exists is only text
  everywhere, and the window says so. A bookmark goes on a paragraph or a heading of the text (not in a table, list, column, callout, header or footer: the row is then greyed, with
  its reason); the sheets of "Assemble before printing" carry no links. The toolbar does not change; the chain menu, which now has eight rows, is tightened in a short panel to fit in
  700 × 400. The code is in `js/anchors.js` and `js/bookmark-dialog.js`.

- **Live editing switches on by itself for everyone who has the template open**: when one person turns live editing on for a template, the people who have it open - already
  there, or arriving later - join without doing anything, without the "Join live editing?" question (the menu row keeps its question for whoever turns it on themselves for a
  template that is already live). Nothing on screen is replaced: not typed text that is not saved yet, not text saved here that the group does not have, not Reading view, a
  question, an export or a conflict to settle; the menu row remains the way in then. Whoever stops live editing, or declines to join, is not brought back before reopening the
  template; each template has its own live session, and a session nobody is in attracts no one. The "Collaborative editing" extension must be turned on in Grist Factory Suite:
  the tick applies to the whole document, and a page that is already open only receives it when it is reloaded. Without it (and in the widget alone), nothing is read or loaded.
  With it, the widget reads the document's live table every 3 s (the list of tables while it does
  not exist yet); neither the extension's code nor Grist Factory Suite's file is requested before a live session exists. The code is in `js/live-entry.js` and in the "join only"
  mode of `extensions/edition/`.

- **The lines of a table of contents lead to their headings, everywhere**: in the editor, a click on a line of the table of contents preview brings the heading to the top of the visible
  area and puts the cursor in it (what you type next goes into that heading); the empty space to the right of a line still selects the block, to delete or copy it. In Reading view, a
  click, or Enter and Space on a line reached with Tab, does the same. In the PDF, the text and the page number of each line are links that lead to the top of the heading, on its page,
  also in the single PDF that gathers every row of a table (the PDF only writes a destination per heading when the template has a table of contents; the sheets of "Assemble before
  printing", made to be printed, carry no links). The Word file, the HTML and the Markdown already led to the headings. A line keeps the colour of the table of contents, without the
  blue of the links in the text; it is only underlined under the pointer and when the keyboard is on it. The gesture lives in `js/toc-links.js`.

- **The slide strip, to the left of a presentation** (the "Slides" extension of Grist Factory Suite): in Edit mode, one thumbnail per slide, in order, the
  cursor's one checked; a click on a thumbnail goes to its slide. A slide's menu (the "⋯" button of its thumbnail, a right-click, or Shift+F10) adds one after it,
  duplicates it, moves it up or down, or deletes it; "Add", at the bottom of the strip, adds an empty slide after the cursor's one, ready to type in. Each action is
  undone by a single Ctrl+Z; a presentation keeps at least one slide, and what does not apply (moving the first one up…) is greyed out with its reason. With the keyboard,
  the strip is a list (Escape then Tab lead to it from the text): ↑ and ↓ go from one slide to another, Ctrl+↑ and Ctrl+↓ move it, Delete removes it, Enter and Escape
  give the keyboard back to the text. A slide whose content overflows continues on one more page, like a document, and its thumbnail shows a red dot. An empty slide added
  at the end gets its page straight away, in the editor, Reading, the PDF and Word, like an empty slide in the middle; a document that ends with a page break still has no
  blank page. A presentation's PDF, alone or in a batch, no longer flags a blank page: an empty slide is intended (a document keeps the warning). The page breaks between
  slides no longer show in the editor (their place stays, the pagination does not change); the one an arrow key or a click selects shows, so you know what Delete removes; a
  document keeps its page breaks visible. A heavy presentation (70 slides of pictures, charts and tables) stays light: the strip only copies the thumbnails it shows, and a
  little beyond (the others as they come into view when it scrolls), a slide that changes place keeps its thumbnail, and each strip action redoes the editor's pagination
  only once. Pictures placed in front of or behind the text (shapes, photos) follow their slide: when it moves up or down, or when a slide before it is added, duplicated,
  deleted or starts to overflow, they change page with it, in the editor, Reading, the PDF and Word, and one Ctrl+Z brings them back with the action; a picture repeated on
  every page stays where it is. A slide can be copied and pasted (Ctrl+C, Ctrl+V), from one presentation to another and from one browser tab to another: Ctrl+C copies the
  slide of the thumbnail that has the keyboard, or, in the text, the cursor's slide when nothing is selected (the status corner says so); Ctrl+V pastes it after the thumbnail,
  or after the cursor's slide, with its text, pictures and shapes, placed on its new page, and one Ctrl+Z removes it; what belongs to the presentation it comes from stays
  there (the picture on all its pages, the comments), and selected text copies as always. "Import", under "Add", opens a panel on the right that stays open (the page
  shrinks to the room left): you pick another presentation of the document in the searchable list, its slides show as thumbnails, and each click (or Enter) on one copies
  it after the cursor's slide, like a paste: its text, pictures and shapes, without the picture on all its pages or the comments; each import is its own Ctrl+Z. On a
  presentation of 70 heavy slides, the panel only draws the thumbnails it shows. The "Keep linked" box, in the panel,
  imports the slide linked to its original: what changes on one side reaches the other, with the save of the presentation that changes and at the other one's next read, without
  entering its history; its thumbnail carries a link badge. Changed on both sides, a window shows both versions as thumbnails: "Keep this one", "Take the other one" (one Ctrl+Z
  gives it back) or "Later". A linked slide's ⋯ menu chooses its direction ("Both ways"; "Follows the source", whose text then refuses typing; "Sends to the source", which locks
  the original, a padlock on its thumbnail), compares both versions or detaches it. The link is a hidden marker at the end of the slide, which Reading, the PDF, Word, the slide
  show and batches never see; duplicated or pasted, a linked slide arrives without its link; during track changes or live writing, nothing syncs and its actions are greyed out
  with their reason. "Present", the ▶ button to the left of the zoom pill
  (or Shift+F5), starts the slide show from the cursor's slide, F5 from the first one: the presentation full screen, black background, one slide at a time, as large as the screen
  allows, as Reading renders it for the chosen row (variables filled in, headers and footers, shapes and pictures on their page); →, Space, Enter, a click or the wheel go forward, ←
  goes back, Home and End go to the first and the last, a black screen tells the end; moving the mouse shows a small bar (previous, number, next, exit); Esc exits, the document has not
  moved. When the frame refuses full screen (Grist Factory Suite as long as it does not allow it on its frame), the slide show takes the whole widget panel. A thumbnail can be dragged with the mouse to
  its new place: a line shows where it will land, the strip scrolls near its edges, Esc cancels, and one Ctrl+Z puts it back. "Add" offers five layouts: Blank, Title,
  Title and content, Two columns and Section header, with their placeholder text already in place. Several slides can be chosen together (Ctrl+click, Shift+click,
  Shift+↑ ↓, Ctrl+A in the strip): Duplicate, Move up, Move down, Delete, Ctrl+C and dragging then apply to all of them, and one Ctrl+Z undoes them at once. The toolbar does not change. If Grist Factory Suite turns the extension off while a presentation is open, the strip stays: its thumbnails still lead to
  their slide, its actions are greyed out with their reason and their click opens the installation. The strip's code (`extensions/diapositives/`) loads only with the
  extension, and needs no library.

- **Presentations, a fifth template type** (the "Slides" extension of Grist Factory Suite): the "+" menu gets a "New presentation" row, between "New macro
  template" and "New grid". A presentation is a template of the same editor as documents (headings, lists, columns, tables, images, variables, conditions, header and footer,
  Reading, exports) whose page is a 16:9 slide in landscape (33.87 × 19.05 cm, PowerPoint's "widescreen" size): each page break starts a slide. The page button and the
  preview call it "16:9", and its menu changes it as for a document. It is saved under the "presentation" type (`TypeModele` column, its page in `Margins`) and opens from
  the template list (a screen icon), the view's template, a row rule or Grist Factory Suite's explorer; it is never the document's default template (its star is greyed out,
  with the reason), nor edited live. Without the extension (the widget alone, or Grist Factory Suite that has not turned it on), the menu row is greyed out with its reason,
  never removed: its click says it must be used through Grist Factory Suite, or opens its installation. Presentations then stay in the list, greyed out with their reason,
  never opened nor lost: their variables follow the columns renamed in Grist, and a presentation already open when the extension is turned off is still saved under its
  type. The extension needs no library; `js/slides-entry.js` is its single entry point for the rest of the widget.

- **Live editing, for a template's text** (the "Collaborative editing" extension of Grist Factory Suite): the "Collaborative editing" menu gets a fourth row, "Live editing". Several
  people write the text of the same Document template at the same time: each sees the others' cursor and name, a bar under the toolbar says who is there ("1 other person", one chip
  per person, a "Stop" button), and Undo and Redo only undo their own typing. A person who starts live editing on a template that is already being written live is asked first
  ("Join live editing?"): the text they were looking at is replaced by the group's. One person saves the template for everyone (the first in the list, among the visible pages; if
  they hide or close their page, the next one): the others only save their own settings, and the "modified elsewhere" banner only comes up for the person who saves. While live
  editing lasts, the header and footer, track changes (with "Accept all" and "Reject all"), linked tables and restoring a version are closed: greyed out or dimmed, never removed,
  with their reason, and a click explains it; Find only goes through the body of the text. The row itself is greyed out, with its reason, for an e-mail template, a grid, a
  macro-template, a template not yet saved or a read-only document, and without the extension (the widget alone: its click says it must be used through Grist Factory Suite;
  hosted, a Grist Factory Suite file that fails to load is reported in a window, and the next click tries again). The typing goes through the document's `Publipostage_Direct`
  table (created at the first live session, re-read every 250 ms when someone else is there and every 2 s alone, emptied by the last person to leave); the library (Yjs and the TipTap
  extensions that use it) is ONE assembled file that Grist Factory Suite gives and the widget loads with `<script type="module">` and its integrity hash: neither the import map nor
  the content security policy changed. The code is in `extensions/edition/`; `js/live-entry.js` is the single entry point for the rest of the widget.

- **Hosted by Grist Factory Suite (GFS), the widget opens the template GFS designates**: double-clicking a template in GFS's explorer opens Publipostage+ on that
  template, at startup (before the row's template, the view's template and the ★) as when the widget is already open (the same path as the template list: the
  "Save / Discard / Cancel" question comes first if changes are waiting, and GFS receives the person's answer). The status corner says "Opened from the explorer."
  Nothing is written: not the view's template, not the ★, no setting, so there is no "Save" to do in Grist. If GFS designates nothing, or a template that no longer
  exists or whose type does not open here, the usual template opens, with no message. Served on its own, nothing changes.

- **Hosted by Grist Factory Suite (GFS), "New" opens a blank template**: the "New" button of GFS's explorer opens Publipostage+ on a blank template of the chosen type (document,
  e-mail, grid, macro template, and presentation when the "Slides" extension is active), at startup (instead of the row's template, the view's template and the ★) as when the
  widget is already open (the same path as the "New" button of the same type: the "Save / Discard / Cancel" question comes first if changes are waiting, and GFS receives the
  person's answer). The status corner keeps the "template not saved" warning: nothing is written before its first "Save", and the template then lands at the root (the folder GFS
  indicates is not read). A macro template opens its composition screen, empty, on top of the usual template. If the requested type is missing or does not open here, if the
  presentation has no extension or if the document is read-only, the previous template opens (at startup) or GFS receives "not opened" (on the call), with nothing changed.
  Served on its own, nothing changes.

- **An HTML export, for a website**: the "Export type" menu has two more rows, after "Markdown (template)". "HTML (file to upload)" writes a complete page (`.html`, UTF-8, title,
  stylesheet, centred reading width) to put on a site as it is; "HTML (content to paste)" writes the content alone (`…-fragment.html`: a `<style>` and a `<div class="pp-doc">` block), to paste
  into an HTML block of a content manager: its stylesheet only touches that block and leaves the typography (font, colour, heading sizes, links) to the site. The row's document is
  written as for the other types (variables replaced by their values, conditional blocks settled), but the text flows like a web page: no A4 sheets, no margins, no page numbers, no
  watermark; the header and the footer are written once, at the top and at the bottom. Kept: headings (their numbering is written in the text), paragraphs and their alignment, bold,
  italic, underline, strikethrough, superscript, subscript, colour, background, size and font, links, tabs, lists (bullets, numbers, letters, checkboxes), quotes, code blocks, tables (merges,
  borders, backgrounds), callouts, two-column areas (one under the other on a narrow screen), captions, the table of contents (a list of links) and footnotes (with their links there and
  back). A Grist attachment, a chart or a QR code goes into the file (data URI); an image from another site keeps its address, and the window that lists those sites comes first, as for the
  other types. Not kept: the margins, the page size and orientation, page breaks, the watermark, images behind the text or on every page, page numbers and the fonts themselves (a font named
  in the document stays named, with fallback fonts). Nothing that can run is written: no script, no event handler, no active address. "A single row" downloads the file of the row shown
  (named like its PDF, as `.html` or `-fragment.html`); "All rows (ZIP)" makes one per row in a ZIP archive, after its confirmation, "One document per value" included. Like Word and
  Markdown, the type is greyed, never removed, in a grid, and it is kept per person and per template. The "Export type" menu is tightened (rows of 24 px instead of 27, 2 px apart) so
  that its eight types and the three PDF qualities fit in a 700 × 400 panel. The engine (`js/html-export.js`) loads no library and only loads at the first HTML export.

- **An "Article" numbering for headings**: the "Heading" menu offers, after "1.", "a." and "I.", the "Article 1" button. A level 1 heading is written "Article 1", a level 2
  heading "1.a", a level 3 heading "1.a.1", then the alternation of number and letter goes on ("1.a.1.a"). The word "Article" only precedes level 1, in French and in English
  alike. Each new Article starts the levels below it again ("Article 2", then "2.a"). The table of contents, the Reading view, the PDF, the Word file and the Markdown file write
  the same number as the editor; the other numberings stay as they were.

- **A QR code in the header and footer**: the "QR code…" row of the "Link and content blocks" menu stays active when you edit a
  header or a footer ("Callout…", "Signature block" and "Chart from the page…" stay greyed there). The QR code goes in at
  36 px - the editing area leaves only 44 px of height for its content - ; the image handle enlarges it up to 60 px, the
  height of the band. Its text can contain a column ("#Clients.Site"): the sheet's band then shows a dashed square of the
  same size, and the Reading view, the PDF, the Word file and printing draw the QR code of the row shown (with no value it
  disappears). An area that is already full (two lines of text, for instance) refuses it without adding anything: the
  window stays open and says "Not enough room in this area…".

- **Version history of a template**: the Save button menu has a "Version history…" line. The widget now keeps the state a save
  replaces when it was written by another person, or is more than 5 minutes old; while you write without stopping, at most one
  version every 10 minutes. The window lists the versions from the most recent to the oldest ("Current version" first, then the
  date and the person of each), shows a preview of the one you pick (the text, the subject and recipients of an e-mail, the
  composition of a macro-template) and "Restore this version" puts it back in the template and in the editor, after a question.
  The replaced state stays in the list ("Before a restore"): a restore is undone the same way; what was typed and not yet saved
  is saved first. The versions live in their own table, `Publipostage_Versions`, created when the first version is kept and only
  read when the window is opened: a document loads nothing more at startup or when saving, and a copy never prevents a save. At
  most 30 versions per template and 3 million characters for the document. The template also carries, in `Publipostage_Modeles`,
  the person who saved it last (`ModifiePar` column) and a token that recognises it (`Jeton` column).

- **"Compare" a version with the current version**: the "Version history…" window has a "Compare" button (left of "Close", off every
  time the window opens, greyed out on "Current version"). When on, it shows the chosen version with, in green, what it has in
  addition to the current version and, in struck-through red, what the current version has in addition to it (what a restore would
  remove); the green has a line under it and the red is struck through: colour never speaks alone. Above the sheet: the number of
  differences ("2 differences from the current version"), "No text difference" or, when only the formatting changes, the number of
  blocks concerned, and the key to the two colours; the first difference is brought into the preview. A replaced word counts as a
  single difference (the old one struck, then the new one); a paragraph, list item, cell or table row added or removed keeps its
  shape; a variable bubble or image that changes is marked as a whole. For an e-mail, the subject and recipients are compared word
  by word on their line; for a macro-template, the lines of the composition (never by annex number). "Restore this version" always
  takes the kept state, never the marked sheet. The calculation is written without any extra library and only loads on the first
  click on "Compare". Limits: formatting alone (bold, alignment, heading level) is not marked but counted separately, the header,
  footer and margins are not compared, and a chart or page break is not marked.

- **"Name…" a version**: the "Version history…" window has a "Name…" button (between "Compare" and "Close"). On a kept version it
  gives it a name ("Before sending"): the name takes the place of the date at the top of its row, and a named version is never erased
  by the caps again (30 versions per template, 3 million characters); only deleting its template removes it. The name already given
  is offered again, and an empty field removes it (the version becomes a version like the others). On "Current version" it keeps the
  saved state that the preview shows under the name given, as one more version (with the date and the person of its last save):
  what is typed and not yet saved is not part of it, and the save that later replaces that state does not make another copy of it.
  A name is at most 80 characters. A template too heavy to be kept (pasted images) says so instead of keeping it; a refusal from
  Grist or read-only mode is said in the window, which stays open.

- **"Markdown (template)": a template that comes back intact, variables included**: the "Export type" menu has one more line,
  "Markdown (template)", next to "Markdown" (which still writes a row's document, variables replaced by their values).
  "Export" writes the template itself, as the editor shows it, in a single `.md` file named after the template: the Export
  menu says so in place of the row options ("One file: the template"), nothing is read from Grist, and the type is not offered
  in a grid or a macro template (it is greyed out, like Word in a grid). A variable with no settings is written
  `{{Table.Column}}` (the bubble's key, reference path included: `{{Clients.Chef.Email}}`). Everything that merges and that
  Markdown cannot write is written as inline HTML with its settings: a variable with settings (format, condition, loop,
  surrounding text, otherwise), a calculation, a chip (date, time…), an "@" chip (the record it cites: table, row and column), a page number, a conditional checkbox, a conditional
  value, a conditional text block (its content stays Markdown, with a blank line around it), an image linked to a column, a QR
  code and a chart of the page (even behind the text). The rest is written as in "Markdown", header and footer included, and
  a "{{" typed in the text is protected so it is never read back as a variable. The tracked-changes suggestions are accepted.
  On import, `{{Table.Column}}` become bubbles again and the HTML elements get their settings back: a template exported,
  imported and exported again gives exactly the same file. A `{{…}}` key that is not a variable of this document stays text,
  and the status corner says how many ("Markdown imported; 2 unknown variables left as text."). Not kept: margins, page format
  and orientation, watermark, images behind the text or on every page that are not merged, the link of a table with a Grid
  template, the subject and recipients of an e-mail template; the heading numbering, written in their text, comes back as text.

- **Cite a record with "@"**: in the editor, "@" opens the list of the records of every table in the document, the page's
  table first, each with its table on the right as soon as the document has several tables with records. The words typed
  are searched in the record's name and in its table's name, in any order, ignoring accents and case; the list shows at
  most 50 records and says how many more still match. The choice puts a "@ Marie Martin" chip that points at THAT row - its
  table, its row number and the column whose text is read - where a #variable reads the row the page shows: "Written by
  @Marie Martin" always writes Marie Martin, whether the page shows an invoice or another file. A record's name is the
  column Grist shows when a Reference points at its table ("Show column"), the first text column otherwise. It is read
  again each time the document is shown - Reading, PDF, Word, Excel, Markdown and e-mail -: renaming the person in Grist
  renames them in the templates, and a renamed table or column is followed, as for a variable. A record whose row is gone
  writes "[Record not found]" in red, and its chip turns red in the editor, the reason in its tooltip. "@" only opens the
  list at the start of a word: a typed e-mail address, "@@" and a code block open nothing. Escape closes the list for that
  "@" without writing anything; a new "@" opens it again. When Settings has given "@" to the variables panel or to the
  abbreviations, the records list gives way to it.

- **A "transparent" line in a table**: in the "Borders" menu of a table's bar (a document table as well as a Grid), the
  "Transparent" button to the right of "Line color" sets the pen to "no line": the setting you click next hides only the
  lines it aims at. With "Transparent", "Bottom border" makes the bottom of the chosen cells invisible, "Inside borders"
  clears the lines inside a block and keeps its frame, where "No border" clears every side of the chosen cells. The button
  stays pressed once chosen, the menu stays open, and nothing is written until a setting is clicked (one Undo reverts it).
  "Default" or a swatch of the palette takes the pen back; it keeps its choice while the page stays open, like a color. A
  hidden line is hidden everywhere - the editor, Reading mode, PDF, Word and Excel -, including on the side of the
  neighboring cell that shares it. A table made before reads as it was.

- **A macro template's summary says which templates are landscape or grid**: to the right of the name of every template that
  is not a portrait document, a small "Landscape" or "Grid" label (a landscape grid carries both, "Grid" first). "Landscape"
  only appears while the macro template's Page menu is on "Follow each template": with "Portrait" or "Landscape" imposed,
  every template has the macro template's page, and the label would name a page they do not have; "Grid" stays, it says
  what the template is. The label follows the Page menu at once (without waiting for the save) and the language; a template
  hidden by its eye keeps it, a template that cannot be found has none. The lists where you pick a template do not carry it.

- **A window warns when a PDF has a blank page**: before saving a row's PDF, the widget looks in its layout for pages where
  nothing is painted - no text, no image, no line. The spaces of an empty paragraph, the header and footer, the watermark and
  the "on every page" images do not count: a page that holds only those is blank. If there is one, the "A blank page in this
  PDF" window says which ("Page 2 is blank...") and lets you choose: "Cancel" saves nothing (and the row is not dated),
  "Export anyway" saves the PDF. For an export of several rows (ZIP archive, single PDF, sheets) every PDF is saved as before,
  then an end-of-batch window lists the rows whose PDF has blank pages, with their page numbers. The blank page you asked for
  - two page breaks in a row - is not reported. Applies to the PDF, the protected PDF and the "Light" quality; the browser
  print (which lays out the pages itself), Word, Excel and Markdown have no window. It is the safety net behind the fixes of
  the known causes (empty lines at the end of a document, before a page break, between two templates of a macro-template).

- **"Otherwise show" in the condition of a conditional value**: the condition window of a conditional value (the text
  placed in a sentence) has, like a bubble's, an "Otherwise show" row: free text written in place of the value when
  its condition is not met, instead of two values side by side with opposite conditions ("Madam" / "Sir"). The row is
  the last of the window, under the preview; its field stays greyed until a rule is complete, and takes up to 200
  characters. The text is written as typed, spaces included, as plain text and in the style of the text around the
  value; empty (or only spaces), there is no "otherwise" and the value disappears as before. "Remove condition" and
  "Unwrap value" take it away with the condition, and a single Undo brings them back together. The "otherwise" applies
  in Reading mode, the PDF, the Word, the Excel, the e-mail, headers and footers and a repeated table row; an unreadable
  condition writes the "otherwise", like a condition that is not met, and an outer value whose condition is not met
  writes its own "otherwise" alone (those of the values it contains do not count). The window's preview says what the
  selected row writes and how many rows show the "otherwise" text. In the editor, a value with an "otherwise" carries a
  solid line under its dashed frame, which takes no room in the line, and its tooltip says the text. "Find / Replace"
  does not read this text. A template saved before reads back as it was.

- **"Otherwise show" in the condition of a conditional text block**: the condition window of a block (the wrapped
  passage, variables menu, Chips tab) has, like a value's or a bubble's, an "Otherwise show" row: a second text written
  in place of the block when its condition is not met, instead of two blocks with opposite conditions. The row is the
  last of the window, under the preview; its field, of several lines, stays greyed until a rule is complete, and takes
  up to 1000 characters. Each non-empty line becomes a paragraph; empty lines and lines of only spaces do not count,
  and a field with nothing else has no "otherwise" (the block disappears as before). It is plain text, with no
  variable and no formatting: for a formatted "otherwise", two blocks with opposite conditions remain the way.
  "Remove condition" and "Unwrap block" take it away with the condition, and a single Undo brings them back together.
  The "otherwise" applies in Reading mode, the PDF, the Word, the Excel, the e-mail, headers and footers, a list item,
  a table cell and a row repeated by a loop; an unreadable condition writes the "otherwise", like a condition that is
  not met, and an outer block whose condition is not met writes its own "otherwise" alone (those of the blocks it
  contains do not count). The window's preview says what the selected row writes and how many rows show the
  "otherwise" text. In the editor, the block's label becomes "If … · otherwise" and its tooltip says the text. The
  conditional checkbox has none (ticked or unticked is enough). "Find / Replace" does not read this text. A template
  saved before reads back as it was.

- **"And" / "Or" on a click between two conditions**: in the condition window of a variable, a conditional text block, a
  conditional value or a conditional checkbox, and in the filter of a loop, the word "And" in front of the second rule
  is a button: a click turns it into "Or" (the variable shows as soon as one of the rules is met), a second click puts
  "And" back. With three rules or more the word changes for all of them: a condition has one single mode, "all" or
  "any". The "all / any" list at the top stays, and follows the button; the preview, the saved condition, Reading mode
  and the exports follow too. The button works from the keyboard (Tab, then Enter or Space) and its tooltip says what a
  click changes.

- **Groups, "A and (B or C)", in a condition**: in the condition window of a variable, a conditional text block, a
  conditional value or a conditional checkbox, and in the filter of a loop, the "+ Group" button adds a box: the brackets
  of a condition. Its rows combine with each other ("And" / "Or" on a click, or the "all / any" list of its header) and
  the box combines with the rules around it through the "And" / "Or" in front of it: "Status = Urgent and (Amount ≥ 1000
  or Amount < 100)" is written just like that. The box has its own "+ Add a condition" and a cross that removes it with
  its rows; a box whose rows stay empty is not saved. The preview, the summary (with its brackets), the saved condition,
  Copy / Paste of the condition, Reading mode and the exports follow too, and a column rename reaches the rows of the
  box. A condition without a box reads and shows as before.

- **A macro template that mixes portrait, landscape and Grid templates**: the menu of the Page button of a macro
  template offers "Follow each template", "Portrait" and "Landscape". With "Follow each template" (the setting of
  a new macro template), every assembled template keeps the orientation of its own page: a landscape template
  between two portrait ones turns the page in turn, in Reading mode (one sheet per run of templates of the same
  orientation), in browser printing (each sheet on the paper of its orientation), in the PDF (one page size per
  template) and in the Word file (one section per run of templates of the same orientation). The header, the
  footer, the "n / total" numbers and the watermark are redone at the size of each page, and the numbering carries
  on from one template to the next. The format and the margins stay those of the macro template for all of its
  templates: only the orientation changes from one template to another. A Grid template goes into a macro
  template like a document (the composition window offers it): a table too wide for a portrait page fits on the
  landscape page of its template. "Portrait" and "Landscape" impose one orientation on all templates, as before;
  a click on the button from "Follow each template" imposes landscape (a second click, portrait). Macro templates
  made before keep their imposed orientation: nothing changes for them until you choose "Follow each template". A
  macro template whose templates all have the same orientation comes out as before.

- **Find / Replace with a regular expression**: the ".*" button of the search bar reads what is typed as a
  JavaScript pattern (`\d+` finds numbers, `[A-Z]{2,}` acronyms, `(\w+) (\w+)` two words in a row); it
  sits next to "Match case" and "Whole word". A pattern never crosses a bubble, a tracked deletion or two
  paragraphs, so "Replace all" never erases a bubble. In "Replace with", `$1`, `$2`… take the groups of the
  pattern (`$2 $1` swaps two words), `$&` the matched text, `$<name>` a named group and `$$` a dollar sign;
  without the option, the replacement is written as is. A wrong pattern (a forgotten parenthesis) finds
  nothing and the counter says "Invalid expression" (the browser's reason is in its tooltip). An empty
  match (`^`, `x*`) is not counted, and the selected word carried into the field is escaped when the
  option is on.
- **Find / Replace also finds bubbles**: a variable or calculation bubble is a result when its name
  (`#Client`), its "Before", its "After", its "otherwise" or the formula of the calculation contains what is
  typed; "Match case", "Whole word" and the regular expression apply to it. The whole bubble is highlighted
  (orange when it is the current one), it counts as one result in "2 of 5", and Enter and Shift+Enter go to
  it. "Replace" only changes a bubble's "Before", "After" and those of its "otherwise" ("Dear" becomes
  "Hello" in every bubble at once, in a single undo step); a bubble's name and a calculation's formula are
  never replaced, and the counter says so ("3 replacements, 1 bubble left as is"). A "Before" or an "After"
  keeps 40 characters at most (beyond that the bubble stays as it is and says so). With track changes on,
  bubbles stay as they are: the text becomes a suggested deletion and insertion. Page numbers, chips and
  images are not searched.
- **Find / Replace also searches the header and the footer**: the search goes through the whole template in page
  order (the header, the body, the footer, with those of the first page when "Different first page" is
  ticked), even when they are not being edited: the counter counts them all ("2 of 4"), and Enter and
  Shift+Enter go from the last result of the body to the one in the footer, then the header, then back to the
  body (the zone opens as after a click in the margin, with its "Done" pill). "Replace" replaces and goes to
  the next result, even in another text. "Replace all" acts on the open text and says what waits elsewhere
  ("2 replacements, 1 other elsewhere"): one click in each text is enough. Typing in the field never opens a
  zone, only Enter, the arrows and "Replace" go in. Undo undoes the open text, except right after a "Replace"
  that moved the search to another text: Ctrl+Z (or the Undo button) then reopens the text of the replacement
  and undoes it; a keystroke, another result or closing the bar in between, and it acts in the open text again.
  The results of a text that is not open are counted but not highlighted; an email template has no header or
  footer.
- **Loop in a loop**: a Loop can also be placed on a variable inside a zone that another Loop already
  repeats: for each invoice its lines, then for each line its steps (in a table, a list or paragraphs). The
  inner zone reads the rows of the current row of the zone around it. The data structure does not change:
  the inner table has a Reference column to the table of the outer zone (like "Invoice" in "Lines"), or the
  outer table has a Reference list column to it; no extra linking rule is needed. When several Reference
  columns lead to the outer table, the "Loop" window asks which one attaches the rows. It names the zone
  around the bubble, and its preview shows a row of the outer zone with its rows. Inside a repeated zone,
  the variables of that zone's table, of the tables around it and of the tables whose rows attach to it can
  be placed, changed with "Column…" and used in a condition without choosing a matching key. A zone has one
  Loop only, and does not repeat the table of the zone around it (the icon is then greyed out and says why).
  Renames of tables and columns in Grist follow these loops too; the "Row number" chip gives the rank in the
  nearest zone.
- **"Light" PDF**: the "Export type" menu (for the PDF type) offers "Light (smaller images)". It is the same vector PDF,
  text and layout untouched, with its images brought down to 150 points per inch (the sharpness of a letter
  or a screen): a 4 MB photo placed over 10 cm weighs only a few dozen KB. A photo (JPEG or opaque PNG) is
  recompressed as a JPEG; a logo on a transparent background stays a transparent PNG; a small image, a QR code
  and an image that is already light are left alone; an image is never enlarged. The page does not move (the
  image ratio is kept, the header and footer are lightened too). The choice applies to the PDF of one row and
  to batches (ZIP archive, single PDF, sheet assembly). "Vector (default)" still takes images as they are.
- **Protected PDF**: the "Export type" menu offers "Protected PDF". Clicking "Export" first opens a window: the
  password to open the file (accents allowed, 127 bytes at most), what the person who opens it may do (print,
  copy the text and images, edit or annotate: printing and copying are allowed, editing is refused by default) and,
  in a collapsed group, the file's author, subject and keywords. It is the same vector PDF as usual, layout
  untouched, encrypted with AES-256: without the password, a viewer refuses to open it. With no password, the
  file opens by itself and the viewer applies the chosen permissions (they only bind the viewers that honour
  them); reading by a screen reader is always allowed. The choice applies to the PDF of one row and to
  "All rows (ZIP)", where the window replaces the confirmation and says how many PDFs leave. "Browser print",
  "All rows as a single PDF" and "Assemble before printing" are greyed out for this type, with their reason in a
  tooltip (the browser does not encrypt, a file combining several documents cannot be protected): nothing is
  removed, and the choice comes back with the PDF.
- **Three ways to give the password of a protected PDF**: the window lets you choose. "Typed at each export
  (recommended)": you type it when you export, it is written nowhere. "Same for all, saved in the document": a
  single password for all the PDFs, written in plain text in the document, table "Publipostage_Modeles", column
  "MotDePassePdf", row "Réglages du document"; the window says so, with the risk (anyone who opens the document can
  read it, unless advanced Grist permissions restrict access). "One per row, read from a column": each PDF takes
  the password of its own row, in the column of the table you choose from a searchable list; the window warns
  that a password written in a table can be read there in plain text. A row whose cell is empty (or over 127 bytes)
  is never exported unprotected: it fails, the window at the end of the batch lists it with its reason and the
  other PDFs are delivered. The browser remembers the chosen way, the permissions, the author and the column,
  never a password.

- **Row number in a loop**: the "#" list ("Chips" tab) offers "Row number". Placed in a table row, a list
  item or a paragraph that a Loop repeats, the chip is written as 1, 2, 3… in Reading and in the exports
  (PDF, Word, batches, e-mail): it counts the rows the loop keeps, after its filter and sort, and starts
  again at 1 for each page row (each invoice of a batch). Outside a repeated zone it is 1. No "Order"
  column is needed in Grist to number rows any more. It is not offered in the e-mail fields or in the PDF
  name.
- **Date of the last PDF export**: Settings > View offers a "Column" list (with "— None —") to choose the
  column of the table that will keep the moment of each row's last PDF export. It accepts a Date column
  (the day), a Date and time column (the instant) or a Text column ("2026-10-09 14:32"), and no formula
  column, which Grist refuses to write. The date is written once the PDF is made ("Export as PDF" of one
  row, ZIP batch, single PDF, sheet assembly), for the rows that are in the file: a row whose PDF failed
  is not dated. One write per export; no Word, no Excel, no e-mail, no "Browser print"
  (the browser does not say whether the person printed). If the column has gone or can no
  longer take the date, the PDF is made all the same and the status corner starts, in red, with "Date not
  written: …"; the warning shown when opening also reports a column that has gone. A Grist Viewer account
  writes nothing. The choice is a widget option: Grist only shares it once the view is saved.
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
- **Letters and numbers on a document table**: when the cursor is in a table of the document, the letters A, B,
  C… sit above its columns and the numbers 1, 2, 3… to the left of its rows, as in a grid, over the page: the
  text does not move (the letters cover the line just above the table while you are in it). A click on a
  letter picks the column, on a number the row, on the corner the whole table; Shift + click extends. The
  letters and numbers of the picked cells light up, and the table bar stays open, sitting above the letters.
  They follow the scrolling and go away when the cursor leaves the table. They do not show for a table inside
  a cell or a column, nor in Reading, and a grid keeps its own. With track changes on they are there too:
  picking cells changes nothing.
- **Row height in a document table**: dragging the bottom of a number (1, 2, 3…) sets the height of that row,
  as in a grid: for example a tall signature cell. The drag tip gives the height in centimetres, the row follows
  live (the others keep theirs, the text after moves down), and a single Undo gives it back. A row does not go
  below the height of its text; Esc cancels the drag; rows picked by their numbers all get the same height. The
  height is a minimum: a row that its text makes taller grows, and the PDF and the Word export carry it over.
  With track changes on, the height is suggested as a change, which you can reject.
- **Width of a column in a document table**: dragging the right edge of a letter (A, B, C…) sets the width of
  that column, as in a grid. The drag tip gives the width in centimetres, the column follows live (the others keep
  their own) and a single Undo gives it back. In the A4 preview the table never goes past the page: when the
  dragged column has no room left, the columns after it give up the missing space, in proportion to what they can
  give (never below 25 px), and the column stops where the page ends. Columns without a set width keep theirs: the
  drag freezes them at their current width. Esc cancels the drag; columns picked by their letters all take the
  width of the dragged handle. With track changes on, the width is suggested as a change, which you can reject.
- **Make rows the same height and columns the same width**: when several rows (or several columns) are picked,
  by their numbers (their letters) or by dragging across the table, the "Make rows the same height" and "Make
  columns the same width" buttons of the table bar give them all the average of their sizes, in one move (a
  single Undo). It is the same bar in a document table and in a grid. The table keeps its overall width; a row
  does not go below the height of its text (if one is taller than the average because of its text, they all
  take its height). The buttons are greyed, with their reason as a tooltip, until at least two rows (columns)
  are picked. With track changes on, the new sizes are suggested as changes, which you can reject.
- **A table copied from Excel keeps its lines, vertical alignment and row heights**: pasted into a document, a
  table copied from Excel, Google Sheets or LibreOffice Calc arrives with the lines of its cells (the bottom line
  of a title is also the top line of the row below), the vertical alignment of its cells and the height of its
  rows, on top of its merged cells, fills, fonts and column widths. A tall row in Excel stays tall in the document
  (it is a minimum: taller text makes the row grow), and the A4 preview, Reading, the PDF and the Word export carry
  it all over. It is still a table of the document: the table bar and the letters and numbers set the lines,
  alignment and heights there as in a grid. Pasting into a grid does not change.
- **Page break before a row of a document table**: in a document table, the toolbar's "Page break" button sets a
  break BEFORE the row the cursor is in, as in a grid; a second click removes it (one Undo per gesture) and
  Alt+Enter does the same from the keyboard. The page changes there in the A4 preview and in Reading, and the PDF
  and the Word export both open a new page; the table's title rows come back at the top of that page, as when a
  table splits by itself. The break shows: a dashed line along the top edge of the row and a badge on its number.
  The button is greyed, with its reason as a tooltip, on the first row, on a row that a merged cell runs through,
  in a table inside a cell, a column, a box or a list, and while track changes is on; "Merge" is greyed when the
  selection straddles a break. Outside a table the button keeps its former role (it inserts a page break marker).
- **A table linked to a Grid template**: in a document, the "Table" button's flyout (on hover) has a "Table from a
  Grid template…" row: a searchable list of Grid templates, whose choice places in the document a copy of the
  template's table, the cursor in its first cell. That table stays LINKED to the template: a coloured line in
  the left margin shows it (it is not printed and does not go into the document), and its cells follow the
  rules of a grid. No second table, columns, table of contents, quote, callout, code block or horizontal rule
  inside it, from the keyboard or by pasting, and the buttons concerned are greyed while the cursor is in it;
  text, formatting, rows, columns, merging, vertical alignment, borders and the page break before a row are set
  as in a grid. A template is linked only once per document, a pasted copy of a linked table loses its link, and
  a grid or a header and footer never have one. The link recognises its template even if Grist hands the same
  number to another one: a table copied from another document, or whose template was replaced, is not a link
  (it keeps its cells, with no marker or menu); a table linked before this version gets that identity at its
  first update or send. With track changes on, the linked table is locked. In the table
  bar, a link button opens a menu that gives the template's name and offers four actions. "Update from the
  template": the table's cells become the template's, read again at that moment (the cursor stays in its cell,
  one Undo brings the previous state back; a table that is already identical is left alone and keeps its
  comments). "Send to the template": the document's table is written into the template, after a confirmation
  that says in how many other templates this table is placed; only the template's content and date change (its
  name, header and footer, margins stay), and neither the link nor the document's comments go into it. "Open the
  template": the Grid template opens in the editor, like a choice in the list (the "Unsaved changes" question is
  asked of a document that has some), and a line under the toolbar, "Back to the document", brings you back to
  the document, the cursor in the same cell of the table; if the table then differs from the template, the
  status line says so without replacing anything. "Detach from the template": the table stays, without the link
  (one Undo). The actions that write into the document are greyed, with their reason as a tooltip, while track
  changes is on; "Open the template" stays available. Deleting a Grid template that is placed as a linked table
  in other templates says so in the confirmation window; those tables keep their cells and lose their link. The
  "Table" flyout row is greyed, with its reason as a tooltip, where a linked table cannot be placed. The
  document follows its template: when a document opens, and at every read of the automatic save, a linked table
  that the template has changed (and that this document has not changed since the last time) takes the
  template's table, cells and column widths, the cursor stays in its cell, the comments of the cells whose text
  has not changed stay, and the status line says so. Nothing is written to Grist, the document is not marked
  "unsaved" (leaving it asks no question) and Undo does not give back what nobody did; a macro template's
  reading and the batch exports also show the template's current table. If the table was changed in the
  document AND in the template, or if it is not known which of the two changed (a table placed before this
  version) and they differ, nothing is replaced: the status line says the table differs from the template, and
  "Update from the template" or "Send to the template" settle it. Nothing moves while track changes is on, while
  a header or footer is open or while text is being composed; if the automatic save is switched off, the
  document follows its template only when it opens.
  The template follows the document too: when the document is saved (automatic save, the Save button, the first
  save, "Save as…"), a linked table that this document has changed, and that the template has not changed since the
  last time, is written into its template, without a question, in the same Grist write as the document: Grist writes
  both or neither (a template deleted in the meantime makes it refuse the whole write, nothing is written and the
  table stays to be sent at the next pass). Only the template's content and date change (its name, header and
  margins stay), neither the link nor the document's comments go with it, and the status line says "Template “X”
  updated with this table." (or "2 templates updated with these tables."), a sentence that stays legible after
  "Saved at…". The Save button first reads the templates again when a table is to be sent: a template changed
  elsewhere in the meantime is never overwritten (the status line says the table differs from the template) and, if
  the read fails, the document is saved alone. Nothing is sent while track changes is on, while a header or footer
  is open, while text is being composed or while the grid is on screen, nor when a document opens, nor for a macro
  template; a column width changed in the document is not a change to send. "Save as…" is a save like any other: the
  copy sends its linked tables to the template, and "Detach from the template" beforehand avoids it.
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
  tables is set when you confirm). In the editor, its handles change its width and height and a click
  selects it: the menu row becomes "Edit chart…". Plotly loads for the
  first chart only (jsDelivr, version and hash pinned). What the widget does not redraw yet stays in the list,
  greyed, with its reason: custom widgets, Kaplan-Meier, "Split series", "Error bars", filters on relative
  dates. A donut's total is written without the column's format.
- **Chart from the page drawn in the editor**: a chart's dotted frame gives way to its drawing, the same as
  Reading and the exports show, at the size set. "The whole table" depends on no row: it is drawn when the
  template opens. "The linked rows" is drawn for the row Grist shows and redrawn when it changes. The
  drawing is never saved in the template: the document always follows the chart in Grist. Nothing tells the
  widget when another table's data changes: the drawing is redone when the template opens, when the size,
  the row or the row's values change, on a click on the chart and on return to Edit mode; Reading always
  redraws. When nothing can be drawn (no row selected for "linked", nothing to plot, chart deleted in Grist,
  library unreachable), the dotted frame and the chart's name stay. In a space narrower than the chart, it
  shrinks without distortion, as in Reading.
- **Markdown export**: the "Export type" menu offers "Markdown" (for a document; a grid does not have it, as with Word).
  "Export" writes the row's document as an `.md` file (CommonMark and GFM, what GitHub, VS Code, Obsidian and La Suite Docs
  read), its variables replaced by the row's values; "Export rows (ZIP)" makes one per row in an archive, named like the row's
  PDF. "One row" or "All rows", "One document per value" and the rows the widget displays behave as for the other types, and
  the chosen type is kept per person and per template like them. Everything Markdown can write is written in Markdown:
  headings (their "1)" or "a)" numbering is written in the text, as in the PDF), bold, italic, strikethrough, inline code and
  code blocks (with their language), links, bullet, numbered (from their first number) and task lists, nested, quotes, rules,
  tables, images, footnotes (`[^1]`), callouts (as GitHub alerts: NOTE, TIP, IMPORTANT, WARNING or CAUTION according to their
  colour) and the table of contents (a list of links to the headings). What Markdown cannot write stays HTML in the file
  rather than being lost: underline, superscript, subscript, highlight, text colour, size and font, centred or right
  alignment, page break, the width of an image that is not the default width, a table with merged cells or cells holding a
  list, a code block or another table. The header and footer (the first page's included) are written once, between HTML
  comments. An image from another web address keeps its address; a Grist attachment, a chart or a QR code goes into the file
  (data URI), so the file stands on its own. Not kept: margins, page size and orientation, the watermark, images on every
  page or behind the text, page numbers, empty paragraphs, columns (the two columns follow each other), bullet and numbering
  styles (a, b, c), justified text, line spacing and the background colours of a Markdown table's cells. As with the other
  types, a window lists the external sites that images would be downloaded from before the export. The engine
  (`js/markdown-export.js`) loads no library and loads only at the first Markdown export.
- **Markdown import**: the "Import from Markdown…" line of the "+" menu, under "Import from Excel…", opens the file picker; the
  chosen `.md` file becomes a new document, with no name and not yet saved, like "New document". If the current document has
  unsaved changes, the "Unsaved changes" question comes after the file has been read, and never for a refused file. It is the
  reverse of the export: everything the export writes is read back, and a file from La Suite Docs, GitHub, VS Code, Obsidian or
  Typora is read the same way. Kept: headings, paragraphs and line breaks, bold, italic, strikethrough, inline code and code
  blocks (with their language), links (bare addresses, e-mail, phone, reference links), bullet, numbered and task lists (checked
  or not), quotes, rules, tables (GFM or HTML, merged cells, aligned columns), images (web address or embedded in the file, with
  their width and alignment), GitHub alerts (`> [!NOTE]`, TIP, IMPORTANT, WARNING, CAUTION) as callouts of the alert's colour,
  footnotes (`[^1]`), the table of contents (`[TOC]` or the list of links the export writes), the page break (the export's
  `<div>`, `\newpage`), underline, superscript, subscript, colour, size and alignment written as HTML, and the header and footer
  that the export writes between HTML comments. The file is read as UTF-8 (with or without BOM), UTF-16 (with BOM) or, failing that,
  Windows-1252; the YAML front matter of a Jekyll, Hugo or Obsidian file is not text. An image that is neither online nor in the
  file (a path to the file next to it) cannot follow the text: a word replaces it ("[image not imported: caption]") and the
  status corner counts the ones that are missing. The variables that "Markdown (template)" writes (`{{Table.Column}}`) become
  bubbles again; a `#Table.Column` typed by hand stays text. Not kept: the title of an image or a
  link, HTML the editor does not know (its text stays), nested task lists (flattened), the numbering of headings written in the
  text (it stays text) and footnotes that nothing calls. A script, an event handler, a frame or a `javascript:` address is
  removed. A binary file, an empty file or one over 10 MB is refused, with a clear message. The reader is marked 15.0.12 (MIT),
  loaded from `cdnjs.cloudflare.com` with its SRI hash on the first import only; `js/markdown-import.js` puts its result back
  into the form the editor itself writes.
- **Browser print**: the "Browser print" line of the "Export type" menu (the PDF button's Quality menu before it was renamed), greyed out until now, prints the
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
- **A gallery of 22 templates, some delivered with their tables**: the "Create from a template" gallery grows
  from four templates to twenty-two. The previous four (invoice, service agreement, certificate, payment
  reminder letter) are redone with the recent features; new ones are templates to print (A6 flyer, A6
  landscape invitation, A3 poster, A6 event badge, 85 × 55 business card, 70 × 37 address label, A6 product
  label), an e-mail template (restocking), two grids for Excel (stock valuation, attendance) and business
  documents: rent receipt, school report, recipe sheet, attendance sheet, purchase order, inventory sheet,
  stock movement slip, and a thirty-slide sales presentation (photos, charts, shapes in front of and behind the
  text, tables, two columns, variables of the "Contacts" table); without the Grist Factory Suite "Slides"
  extension, its two buttons are greyed out with their reason, and their click says how to get it. A template delivered with its tables has a "Create with its tables" button ("Create
  with its table" when it has just one): a question lists the tables ("Create the template's tables?"), then
  the widget creates the template's tables WITH NO ROWS, with their columns, calculated columns, the column
  that displays a Reference and the Linked tables rules the template needs, and saves the template with its
  page (size, orientation, margins), its type (document, e-mail, grid or presentation), its PDF name and its e-mail fields.
  A document table that already has the name of one of the template's tables is kept as it is when its
  columns fit; otherwise a window says what is missing and nothing is created or changed. "Use this
  template" keeps the text alone. The preview of a template shows the document filled with sample rows, as
  images made with the real widget (one per page, with "Preview with sample rows: the tables created stay
  empty."), the template's page, the tables it creates and its "Features shown" (QR code, Page size, Loop
  over linked rows, Amount spelled out…): no sample row is ever written into the document.
- **Settings > Email: choose the mail program that opens "Create email"**: "Standard" (the default: the link has
  not changed by a single byte) or "Zimbra". Zimbra's web client reads the link badly: an "&" in the subject or the
  body showed up as `&amp;`, a "+" turned into a space, a "?" cut the subject, and no encoding of the link changes
  that (it sends "&" as `%26`, as the format requires). With "Zimbra", the link writes the "&", "<", ">" and "+"
  signs of the subject and the body as full-width forms (＆ ＜ ＞ ＋), which Zimbra does not damage, and puts an
  empty Cc first so that the subject, the text, the Cc and the Bcc are read only once: every key of an AZERTY and
  QWERTY keyboard comes through. The link is longer (6 more characters per sign) and the length gauge measures the
  real link. Limits: in the body, a web address with "&" and an email address with "+" also turn into full-width
  forms (they did not do better before), "+33" becomes "＋33"; a "To" address that contains "&" or "?" (very
  rare) is still read badly by Zimbra. The choice belongs to this browser, like the language and the theme, and
  is not written into the document.
- **The time of a "Date and time" column can also be written on a 12-hour clock, with AM / PM, in every language**: the "Time" list in a variable's bar offers "11:30 PM" next to "23:30" and
  "23 h 30", whatever the interface language (before, only English could write a 12-hour time, and French had the 24-hour clock only). Midnight is written "12:30 AM", noon "12:00 PM", the
  hour has no leading zero ("9:05 AM"), after the date like the other styles ("September 12, 2026 at 11:30 PM", "12/09/2026 11:30 PM", in English "09/12/2026, 11:30 PM"). Nothing changes for
  templates already set: "23:30" and "23 h 30" write as before, and in English "23 h 30" already wrote "11:30 PM" - the list then shows only "No time", "23:30" and "11:30 PM", and the bubble
  of a template set that way shows "11:30 PM" selected. In Excel the cell is a real date formatted "h:mm AM/PM". The code is in `js/variable-format.js` (`TIME_STYLES`, `timeText`,
  `timeChoices`), `js/floating-toolbars.js` (the "Time" list) and `js/xlsx-export.js` (`TIME_CODES`).
- **"11:30pm" in the "Time" list, and a 12 / 24-hour choice for the "Current time" chip**: the "Time" list in the bar of a "Date and time" variable offers a fourth style, "11:30pm"
  (lowercase am / pm stuck to the minutes - Grist's default, "h:mma" -, midnight "12:30am", noon "12:00pm", the same in both languages); the "Like in Grist" button writes it exactly for
  that setting. The "Current time" chip keeps writing the 24-hour clock ("23:30") until you touch it; a click on the chip - in the document as in the Subject, the addresses or the PDF
  name - opens its own bar, with the same list: "23:30", "23 h 30" (French only), "11:30 PM", "11:30pm", without "No time" (a chip always writes a time). "23:30" removes the setting.
  Reading mode, PDF, Word, e-mail and the file name write the device's time in that style. In Excel, "11:30pm" is written `h:mmam/pm`. The only trace in a saved template: the chip's
  `data-chip-time` attribute, absent while nothing is set (an existing template reads as before; an older widget version would ignore it and write the 24-hour clock). The code is in
  `js/variable-format.js` (`TIME_STYLES`, `timeText`, `gristTimeFormat`), `js/editor-nodes.js` (the chip), `js/reader-mode.js` (`formatNowTime`, `smartChipValue`),
  `js/floating-toolbars.js` (`createTimeChipToolbar`) and `js/field-editor.js` (the bar in the fields).

### Changed

- **The template list colors each kind of template's icon, like the Grist Factory Suite explorer**: in the template drop-down list and on its button, a document's icon is blue, a
  grid's green and a presentation's orange. E-mail, macro-template and folders keep the text color; a greyed-out template (extension off, unknown type) has no color, and the
  button loses it with it when Grist Factory Suite turns off the open presentation's extension. Each color reaches at least 3:1 on the list's backgrounds (the hovered and the
  chosen row included), in light and dark; the icon's shape always says the kind, the color is added to it. "Organize my templates" stays monochrome. The colors are the `--t-doc`,
  `--t-grid` and `--t-slides` tokens of `css/style.css`; the rules are in `css/template-tree-select.css`, and `syncTriggerLabel` of `js/template-tree-select.js` removes the
  button's color for a template the widget can no longer open.

- **A long document's pages are calculated four times faster, and stay exactly the same**: in the editor and in Reading, page cuts between two blocks are placed all at once
  instead of one by one (one layout of the document per page before). Each placed cut is read back: if a single one is not where it was predicted, it and the following ones go
  back through the previous calculation, page by page. The pages, the room kept under each block and the seams are exactly the previous ones (checked on a presentation of 70
  heavy slides, a long text with lists, images and page breaks, with and without a header and footer that differ on the first page, and tables). Measured: the 70-slide
  presentation goes from 220-280 ms to 45-55 ms per calculation, a long text from 15 to 6 ms. Cuts inside a table or a two-column zone keep the page-by-page calculation. The
  code is in `placeSimpleSeamsAtOnce` of `js/header-footer-preview.js` and `js/reader-mode.js`.

- **In Grist Factory Suite, the language is GFS's, one choice per person for all its apps**: the widget starts in the language GFS tells it (the one of its Language button), before
  the browser's and before the one it had kept on its own. In Settings, the two language boxes are greyed, never hidden, with a sentence under them: "The language is chosen in Grist
  Factory Suite (Language button in the explorer)." When the person changes the language in GFS, the widget reloads in the new language and reopens the template they were on; with a
  change waiting to be saved, the "Save / Discard / Cancel" question comes first, and "Cancel" keeps the previous language until the next start. A language changed during a reload is
  caught up at startup, once the template is open. "Reload now" (trigger key) keeps GFS's language in a single reload. On its own, or with a GFS that does not give the language,
  nothing changes: the boxes stay active. GFS's language goes through the fragment of the frame's address (`#pp-open=…&pp-lang=fr`), never through the browser's storage, which GFS's
  isolated frame refuses; an address that cannot be modified does not make the page reload (it would start again in the old language and loop forever). The code is in `js/gfs-link.js`
  (`language`, `onLanguage`), `js/i18n.js` (`gfsLang`), `js/settings.js` (`applyLanguageLock`, `followGfsLanguage`, `reloadKeepingTemplate`) and the end of `init()` in `js/main.js`.

- **After changing the language or the trigger key, the widget reopens the template you were on**: changing the language in Settings, or clicking "Reload now" after changing the trigger
  key, reloads the page, which now reopens the open template (of any type) instead of going back to the usual one (the one Grist Factory Suite designates, the row's, the view's or the
  ★). On its own as well as hosted by GFS: the template's identifier goes through the end of the widget's address (`#pp-open=…`), read then erased at startup, and never through the
  browser's storage, which GFS's isolated frame refuses; a reload that does not come from the app (F5) opens the usual template. A template not saved yet, deleted in the meantime or that
  this version cannot open: the usual template opens, with no message. In GFS, the language is no longer a choice of the
  app: it is GFS's (previous entry), and the reopening works there too. The code is in `js/settings.js` (`reloadKeepingTemplate`, `takeReopenId`) and in the startup of `js/main.js`.

- **Headers and footers no longer refuse anything when typing: what goes beyond is reported, then cut**: the size of the zone does not change (60 px of content, set after common
  practice), but the editor no longer blocks typing or an image when it is full. You can type one more line, paste or insert an image of any size (it goes in at 320 px), enlarge it
  without a cap, add a QR code (at 36 px) or a table; the "Table" button adds a one-row table in a zone (two in the body of the text), and a table left empty is no longer thrown away at
  "Done". When the content goes beyond the band, three signs at once: a red dashed line at the limit, a very pale red tint below it and a note under the sheet saying by how much, in
  millimetres ("The header is 16 mm too tall: anything below the line will be cut when printed or exported."). If an image is the cause, the note offers "Shrink the image": it brings
  the image (the selected one, otherwise the tallest) down to the size that fits, keeping its proportions, in a single Undo. Blank lines at the end of a zone do not count (there is
  nothing to cut below them), those in the middle do. The text of the page never moves: what is below the line is cut in Reading mode, printing, the PDF and Word (see "A header or footer taller than its zone no longer pushes the text
  of the page"). A header or footer table keeps its grid in the open zone, the closed zone, Reading mode, the PDF and Word; a table taller than the zone is cut at the limit there. The
  floating bar of a table, an image or a variable no longer covers the "Done" pill: it goes below the element. The code is in `js/header-footer-preview.js` (`refreshZoneOverflow`,
  `shrinkZoneImage`).

- **In a header or footer, "Insert a table of contents" and "Page break" are greyed out, and a zone that only has a line is kept**: in an open zone these two buttons make no sense (a
  60 px band has no list of headings and no page to open): they are greyed out, like heading numbering, never removed. Neither a click nor Alt+Enter adds anything there, not even
  before the second row of a table in the zone, and "Done" gives them back; in the body of the text nothing changes, and neither does the rest of the toolbar. A zone that holds only a
  horizontal rule ("---" then Space) is no longer thrown away at "Done", as an empty table was: the line stays, the header stays on, and the closed zone, Reading mode, the PDF, Word and
  Markdown show it, with the text of the page staying where it is. The code is in `js/main-toolbar.js` (`syncLocks`) and in `js/page-layout.js` (`hasZoneContent`).

- **The line in a closed header or footer looks like the one you see while typing**: "---" then Space makes a thin, light grey line in the body and in the open zone; once "Done" was
  clicked, in the closed zone, between two pages of the editor and in Reading mode, the line used the browser's own (thicker, darker, embossed, 5 px shorter). It now looks the same
  everywhere on screen (21 px tall in all, light grey, flat), and browser print follows. The text of the page does not move, and the size of the zones, the PDF and Word do not change.
  The code is in `css/editor-v2.css` (the `.tiptap hr` rule).

- **Browser print goes through the widget's own page, on its own as well as hosted by Grist Factory Suite (GFS)**: GFS runs each app in an isolated frame (without
  `allow-same-origin`) where the hidden frame that printing used to build could no longer be read ("Could not prepare the print."). The widget therefore draws the Reading
  view's sheets in its own page (an off-screen but laid-out container whose shadow tree takes over the stylesheets and the document's language), calls `window.print()` on its
  own window, shows only that container when printing (nothing else of the page), gives the document the file name the browser proposes for "Save as PDF", then removes
  everything when printing ends. There is now one way to print (decision of 16/10, with less code): served on its own, the widget prints through its page too, and the hidden
  sandboxed frame no longer exists. The sheets are the same as before, cut at the same places (same page size, same headers and footers, same page orientations); the page's
  ordinary print is untouched. The document's content is no longer shut in a script-less frame: the Reading view's filter and the page's content security policy (no inline
  script, no handler) protect it.
- **Hosted by GFS, `mailto:` and `tel:` links open in a new tab**: in GFS's isolated frame, following such a link inside the frame made the widget disappear until reload.
  "Create the email", Ctrl + click on an editor link and the Reading view's links that did not already open a new tab (imported template, column written by someone else) now
  open in a new tab (`target="_blank"`, `rel="noopener noreferrer"`). Served on its own, nothing changes.

- **Track changes, "Accept all" and "Reject all" move under a single button, "Collaborative editing"**: the three toolbar buttons give way to one button (two
  people in profile) whose menu opens on hover, like "Table" or "Link and content blocks". Nothing disappears: the three rows keep their name, icon, tooltip,
  keyboard shortcut and effect; "Accept all" and "Reject all" stay greyed while no change is waiting; the whole menu greys out in a grid and in a macro template,
  like the buttons before. The button lights up while track changes is running: with the menu closed, you can see tracking is on. This button is the place for
  the collaboration features that will be added to it.
- **The page chart becomes an extension of Grist Factory Suite (GFS)**: served on its own (the widget's address is not
  GFS's), Publipostage+ no longer draws charts, and loads neither their code nor their library. Nothing is lost or
  hidden: the "Chart from the page…" row stays in place, greyed with its reason; the frame of a chart already placed in a
  template stays, greyed, with its name, and the template saves back unchanged; the Reading view and the exports write
  "[Chart unavailable]" in its place. Clicking the greyed row (or the action's shortcut) opens a window saying this
  feature needs GFS. Served by GFS, the chart works as before: its code (the `extensions/graphique/` folder) loads on first
  use, and Plotly, its library, comes from GFS, which gives its address and integrity hash when the chart is drawn; Plotly
  is no longer in the widget's library list or in its import map. The page's chart list does not offer the widget itself,
  even when GFS serves it, in which case its address is the one its section carries (GFS gives it to the widget). The
  page's security policy keeps the exact address of Plotly 2.13.2, and nothing else: it only allows it, the widget on its
  own never loads it.

- **Changing the language reloads the page**: in Settings, choosing "English" or "Français" reloads the page, which
  restarts in the chosen language; nothing is retranslated live any more. Before, some bars that were already built
  (the variable bar, the table bar) kept a few texts in the previous language. If the document has changes waiting to be
  saved, the "Save / Discard / Cancel" question comes first, as when you switch template: "Cancel" keeps the previous
  language. If the browser refuses to keep the choice (storage blocked), the language does not change and the choice
  goes back to the current language.

- **The default-template star says what it does, in the list and in "Organize my templates"**: each ordinary
  template in the drop-down list and in the "Organize my templates" window now carries a star (shown on hover or
  from the keyboard) that sets, moves or removes the document's default template, the one that opens when the widget
  starts, for everyone who uses the document (the pin stays a personal favourite). The default template's row says so
  in words ("at startup"), the window carries a legend explaining the star, and the status line names the template
  that will open at startup. The toolbar star stays. An e-mail and a macro template cannot be the document's default
  template: their star is greyed out, with a tooltip saying why (for a view: Settings > View), as it is in read-only
  mode.
- **The "PDF quality" button becomes "Export type"**: the button to the left of "Export" chooses the export type
  (PDF, Protected PDF, Word or Excel) and, for the two PDF types only, their quality (Vector, Browser print, Light): the quality you chose is
  kept and comes back with the PDF. The **Export** button's menu, titled "Export", now lists only the rows and
  workbook options of the chosen type, with a small check mark in front of the ticked one: a single row, all rows
  (ZIP archive) and, for the PDF, all rows as a single PDF and assembly before printing, for Excel all the table's
  values in a single workbook. Clicking an option ticks it without exporting anything; the **Export** button
  (Alt+P too) runs the ticked option in the chosen type, with its confirmation for a batch. Nothing is removed: the
  nine exports from before are done with these choices, with the same confirmation and the same effect; Word stays
  greyed out in a grid and Excel in a document, and the type then goes back to PDF. An option the type does not
  have ("a single PDF" after switching to Word) reads "All rows (ZIP)" and comes back with its type.
- **Your export choices are kept per template**: the export type (PDF, Protected PDF, Word, Excel), the PDF quality and the "a single
  row / all rows" choice are remembered for each person and each template. You get them back when the template
  opens, on any computer (they are written to the person's preferences table, like their pins), and a template you
  changed nothing on starts from the original settings (vector PDF, a single row): one template's choices do not
  carry over to the next. A read-only account chooses like everyone else, but its choices only last for the session:
  nothing is written to the document. A new template keeps its own from its first save, and "Save as" takes along the
  ones on screen. A document created before this feature gets three more columns in the preferences table at the
  first export choice, never at startup.
- **Margins of a macro template**: the Margins tab of Settings now says, while a macro template is loaded, that its margins
  take precedence over those of the assembled templates: they apply to every page of its Reading view, PDF, Word and
  print output, and a template's own margins only apply when it is opened on its own. The margins themselves are
  unchanged, only the note is new; with an ordinary template it stays hidden.
- **Enter in a document table**: as in a grid (and in Excel or Google Sheets), Enter moves down one cell and selects
  its text, so you type over it; Shift+Enter (or Ctrl+Enter) adds a line inside the cell; on the last row, Enter does
  nothing. A list, a quote, a code block or an open "#" list keep their Enter. Enter used to split the cell's
  paragraph: to write a second line in a cell, use Shift+Enter now.
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
- **The Word export's table of contents is a real Word table of contents**: a template that has a table of contents
  now comes out in Word with Word's own "Table of Contents" (a field that can be updated) instead of a fixed list. It
  picks up the headings of levels 1 to 6, and each line leads to its heading. The field is flagged "to update": when
  the file opens, Word may ask whether to update the fields, and Yes writes the page numbers; later, a right click on
  the table, "Update field", rebuilds it after the document is edited. Without that update (a preview, Google Docs,
  LibreOffice, Word in protected view) the table shows the list of headings without page numbers, as before; with no
  heading at all it keeps its "no heading" sentence and Word asks nothing. Each heading also carries its outline level,
  which LibreOffice reads to rebuild the table. Fonts are still not embedded in the file.

### Removed

- **"Low quality" and "Ultra HD"**: these two rows of the PDF button's Quality menu, greyed out ("soon") since
  html2pdf.js was removed, are no longer in the interface or in the code. A PDF photographed page by page
  would be heavier, with no selectable text and never sharper than the vector PDF: to lighten a PDF, the
  "Light" row reduces the images; for a poster, use the vector PDF and "Custom size".

### Fixed

- **In English, a currency is written as in Grist**: a negative amount in dollars was written "$-7.13" and an amount in Swiss francs "CHF1,234.57" when the interface (or the bubble) is in English; they are now written
  "-$7.13" and "CHF 1,234.57" ("-CHF 1,234.57" when negative), wherever a bubble writes an amount. The minus sign comes before the currency sign; a currency in letters ("CHF", "kr", or one typed by hand) is followed
  by a non-breaking space, whereas "$", "€", "£" or "R$" stay stuck to the number, as Intl writes it for Grist. The Excel cell of a number puts the same space in its format ("CHF "#,##0.00). French does not change
  ("-7,13 €", "1 234,57 CHF") and a percentage still drops the currency. The code is in `js/variable-format.js` (`currencyFirst`, `currencyGap`) and `js/xlsx-export.js` (`numberFormatCode`), the tests in the
  `gristFormatUnit` (sixteen texts of the real Grist are no longer "known gaps", seven more checks) and `xlsx` groups.

- **An "Any" column that computes a date writes it as a date**: a formula column added without a type ("Any") that computes a date was written "2026-09-12T21:30:00.000Z" in the Reader, the PDF, the Word and the
  Excel of the chosen row, and "D, 1789248600, Europe/Paris" ("d, 1789171200" for a day) in the batch export, in loops and in linked tables; rules compared it as text. Now the document writes "12/09/2026" for a
  day and "12/09/2026 23:30" for an instant (the time in the value's own time zone: 23:30 UTC on 31/12 is 01/01/2027 00:30 in Paris; "09/12/2026, 23:30" in English), the same everywhere. Rules ("= 12/09/2026",
  "= 2026-09-12", "< 01/01/2027", "is empty", one column against another) compare the day, the calculation "+ 1" says it is a date as it does on a Date column, and the Excel cell stays text, the same. The toolbar
  of an "Any" column has no date setting: to choose the writing, or drop the time, give the column the Date or Date-and-time type in Grist's right-hand panel. A number or a text in an "Any" column is written as
  before. The code is in `js/variables.js` (`cellValue`, `effectiveFormatOf`), `js/variable-format.js` (`writesTime`) and `js/condition-rules.js` (`compareDates`, `expectedFromValue`), the tests in the `varShapes`,
  `realShapes` and `conditionRulesUnit` (section 18) groups.

- **A Reference that shows a decimal price writes it with the decimal comma**: an article's price shown through a Reference was written "1.5" (with a point) where the same value in a Numeric column reads "1,5" in a
  French interface, in the Reader, the PDF, the Word and the Excel, chosen row and batch alike. Now a number shown by a Reference takes the decimal separator of the interface language (a point in English), up to
  ten decimals and without a thousands space: "1,5", "0,3" and still "2024" for a year or a row id, never "2 024" (the Reference's type does not say whether the column shown is a price or a year). Rules ("= 1,5" as
  well as "= 1.5"), calculations, sorts and filters read the number, not its writing: they do not change. The code is in `js/variables.js` (`effectiveFormatOf`), the test in the `varShapes` group.

- **"Before a date" no longer keeps a cell without a date**: a rule "< 01/01/2027" or "≤ 01/01/2027" (conditional block, value, checkbox or bubble, macro template, loop filter) was true when the date was empty:
  the comparison read text, where the empty text comes before any text, and the "before 2027" block was written for every row without a date (">" and "≥" were already false). Now an empty date is neither before nor
  after any day, in a Date column, a Date-and-time column and a Reference showing a date (when the rule carries a day), on the chosen row as in the batch export; "=" stays false, "≠" and "is empty" stay true. A
  column of numbers or text keeps its comparison ("empty < 5" is still true). The code is in `js/condition-rules.js` (`compareDates`), the tests in the `varShapes` and `conditionRulesUnit` groups (section 17).

- **A list with an empty value is written without a stray comma**: a list of references (or one value per linked row) in which one value writes nothing - a record without a date, an empty text - kept its place
  between two commas: ", 12/09/2026" when the record without a date came first, "01/03/2026, , 12/09/2026" in the middle, "01/03/2026, " at the end and "," when all were empty, in the Reader, the PDF,
  the Word and the Excel, chosen row and batch alike. Now empty values are skipped, as the "List" window and the "one document per value" export already did: "12/09/2026", "01/03/2026, 12/09/2026", nothing when
  everything is empty. The code is in `js/variables.js` (`formatList`), the test in the `varShapes` group.

- **The Excel of a single row writes real dates**: a Date or Date-and-time column was written to the cell as text ("12/09/2026"), which cannot be sorted or computed on (due date + 30 days), while the batch export
  (one workbook or one sheet per row) writes a real Excel date. Now the chosen row's cell is a real date, with the same serial number and the same format as in the batch ("12/09/2026", "12 September 2026",
  "12/09/2026 23:30" depending on the bubble), the time read in the column's time zone; an empty date leaves the cell empty. An "Any" column that carries a date stays text. The code is in `js/xlsx-export.js`
  (`resolvedFiniteNumber`), the test in the `varShapes` group.

- **A cell whose formula failed is written the same everywhere**: a cell that Grist shows as an error ("#DIV/0!" when a formula divides by zero, "#AttributeError", "#TypeError", "#Invalid DateTime: bientôt" for a formula
  that returns text in a Date column…) was written "#DIV/0!" in the Reader, the PDF, the Word and the Excel of the chosen row, but nothing at all in a Date or Date-and-time column, and "E, ZeroDivisionError" in the batch export, in
  loops and in linked tables (", , ," for a Date column); a calculation on it said "contains "E"" in a batch and "contains "#DIV/0!"" elsewhere, and a rule "= #DIV/0!" only recognised it on a single row. Now the
  document writes Grist's text, in a column of any type (Numeric, Integer, Yes / No, Date, Date and time, Text, Any, choice list, Reference, reference list), on the chosen row as in the batch export, and the Excel cell
  is text, the same. The code is in `js/variable-format.js` (`cellError`, `isCellError`) and `js/variables.js` (`formatValue`, `decodeShown`, `cellValue`), the
  tests in the `varShapes` group.

- **A reference that shows a number, a row id, a Yes / No or a date is written the same everywhere**: in the Reader, the PDF, the Word and the Excel of the chosen row, it was written "Produits[2024]" for a
  number ("Produits[0]" for an empty reference), "2026-09-12" or "2026-09-12T21:30:00.000Z" for a date, and "false" for a Yes / No whose reference points to nothing; in the batch export, in loops and in linked
  tables it was written "2024" but "d, 1789171200" for a date, and a calculation on it failed ("contains "Produits[2024]", which is not a number") or added up seconds. Now the document writes "2024" or
  "12/09/2026" (the day in the shown column's time zone: 23:30 UTC on 31/12 is 01/01/2027 in Paris) and nothing when the reference points to no row; "0" stays a 0 when the row it points to is 0. Rules follow
  ("= 2024", "> 2000", "= 12/09/2026", "= 2026-09-12", "is empty" no longer say false on the chosen row), the calculation "+ 1" gives 2,025 and refuses a date as it does on a Date column, a loop's filter
  compares the day and a sort follows the calendar, and the Excel cell writes the same text. A list of references to dates is written "01/03/2026, 12/09/2026" everywhere, and the column's bubble inside a
  "list of references" zone writes each record's date. The code is in `js/variables.js` (`decodeShown`, `shownValue`, `cellValue`,
  `effectiveFormatOf`, `calcOperand`), `js/variable-format.js` (`formatDate`), `js/condition-rules.js` (`compareDates`, `expectedFromValue`) and `js/loop-rules.js` (`sortKey`, a list's anchors).

- **The “Page break” marker and the template gallery speak English in an English interface**: in the editor, a page break's marker reads “Page break” (it always read “Saut de
  page”); the saved document does not change, it keeps “Saut de page” whichever language it was written in, like the exports and Reading mode. In the “Create from a template”
  gallery, the names of the 22 templates and their keywords (sales, admin, event, print, stock, sector) are translated: on the cards, in the keyword buttons, in the search (it reads
  the name the card shows), in the preview and in the name of the saved template. The templates themselves stay in French, and in French nothing changes. A template without a
  translation (a demo template) keeps its name; `dev-tests/verify-gallery-captures.mjs` checks that every template and every keyword of the catalogue has one. The code is in
  `js/editor-nodes.js` (`createPageBreakNode`), `js/template-gallery-modal.js` (`entryName`, `tagLabel`) and `js/i18n.js` (`pageBreak.marker`, `gallery.name.*`, `gallery.tag.*`,
  `I18n.has`).

- **A decimal comma typed in a rule's value reads as a point**: on a Numeric or Integer column, "99,5" was not read as a number and the rule compared text: for a total of 1,234.5, "> 99,5",
  "= 1234,5", "= 1234,50" and "≤ 1234,5" gave false and "≠ 1234,5" gave true, with no message, while with a point (99.5) everything was right. "99,5" and "99.5" now mean the same thing
  against a number, in macro templates, in conditional blocks, values, checkboxes and bubbles, and in a loop's filter. A single comma between two runs of digits is decimal, in French and in
  English ("1,234" is 1.234, never one thousand two hundred thirty-four); everything else reads as before, and a Text column keeps the text comparison. The code is in `js/condition-rules.js`
  (`compareGeneral`, `withDecimalPoint`).

- **"Is empty" works on a list of references with no item**: a list of references that was left blank, or that a Grist formula computes as empty (the discounts of an invoice that has
  none), was recognised neither by "is empty" nor by "is not empty": "is empty" never fired and "is not empty" always did, so a "No discount" block never appeared and a "Discount
  details" block appeared even with no discount. Grist sends such a list in two forms, `[]` for the displayed row and `["L"]` (then `[]` once decoded) for the row of a batch export:
  neither nothing nor an empty text. A list with no item is now empty, whatever its type, in macro templates and in conditional blocks, values, checkboxes and bubbles, and in the
  conditions of an Excel (the comparison of two columns and a loop's filter already read it that way); a multiple-choice list left blank already worked. The code is in
  `js/condition-rules.js` (`isBlank`, `compareValues`).

- **A variable's date format also works on a "Date and time" column, and its bar gains a "Time" list**: Grist gives the type of such a column with its time zone ("DateTime:Europe/Paris"),
  never a bare "DateTime", and the widget did not recognise it. With no setting, Reading mode, the PDF, the Word file, the file name and the e-mail subject wrote the raw text
  "2026-09-12T21:30:00.000Z" where a Date column writes "12/09/2026"; the bubble's bar had no date setting; a hand-set format read the day in UTC (an appointment on 13/09 at 00:30 in Paris
  was written "September 12, 2026"); Excel wrote text; "Column…" and "Replace" did not see a date, and a calculation on the column was not refused as it is on a Date column. The bubble now
  has the date settings of a Date column, and the day is the one of the column's time zone for the seven formats, wherever the bubble is written. One more list, "Time", which only exists for
  this column, writes the time of the column's time zone: "No time" (the default, which is the way it was written before: no document already saved writes a time), "23:30", "23 h 30" or
  "11:30 PM" (on a 12-hour clock). The time follows the date after a space, with "at" after a month in letters ("September 12, 2026 at 11:30 PM"), and stays in digits even with "Letters". In
  the Excel exports of several rows, a cell holding only this bubble is a real date, with the time when the bubble writes it. The code is in `js/variable-format.js` (`formatDate`,
  `wallClock`, `TIME_STYLES`), `js/variables.js`, `js/floating-toolbars.js` and `js/xlsx-export.js` (`typedDate`).

- **Enter validates a template's name wherever it is typed, and an erased name no longer loses the saving**: the "Rename" pencil and the "Save as (copy)" window already validated
  the name with Enter; the macro template window did not: Enter in "Macro template name" did nothing (you had to click "Save"). Enter now does what "Save" does there: the window
  closes, a name already taken is numbered, an empty name gives the same message and the window stays open; during a text composition (dead key, Asian input), Enter only picks the
  character, and Esc keeps its role. On a new template, not saved yet, Enter closed the pencil field but the title still said "— New template —", as if the name were lost: the
  title now shows the validated name (Enter or a click elsewhere), the template is still to be saved, and the next blank template starts again from "— New template —". Finally, in
  the pencil field of a saved template, an erased name (Enter or a click elsewhere) closed the field empty: the title kept the old name, but neither auto-save nor "Save" writes a
  template without a name, so nothing typed afterwards was kept, without a word. The field now takes back the previous name and the status corner says so ("Template name required:
  “Facture” is kept."). Esc, which did nothing in this field, drops the typing: the field closes on the previous name, even if auto-save had already written the beginning of the
  typed name (the next pass writes it back); during a text composition, Esc only cancels the composition.

- **"Discard" really discards what was just typed, even when auto-save was writing at that moment**: the "Save / Discard / Cancel" question (when switching template, creating a
  document, an email or a grid, importing a file, changing the language) stopped the later auto-save passes, but not one that had already started: it could finish writing while the
  question was open, and the text was already saved by the time the person answered "Discard". The question now waits for the pass in progress to finish (8 seconds at most, if Grist
  stops answering): if it saved everything there is nothing left to ask and the action goes ahead directly; otherwise the question is asked, and nothing is written while it is
  open, however long the person hesitates. With no pass in progress, the question opens as before.

- **In a header or footer, a logo aligned left or right stays beside the text in Reading mode, the PDF and Word**: the editor already showed it beside the text, but Reading mode
  and printing put it alone on its line, above the text; the PDF lost the image (the file contained none and the text stayed shifted as if there were one); Word laid it over the
  text when it was on the left. The logo now floats beside the text in the top and bottom bands of the sheet as in the seams of Reading mode; the PDF keeps it, at the edge of the page,
  with its text beside it; Word puts it in the first cell of a borderless table row and its text in the other, which renders the same way in Word, LibreOffice and Google Docs.

- **Bulleted and numbered lists in a header or footer keep their bullets and numbers in Word**: the file pointed to a numbering that Word could not find in `numbering.xml`, so the
  text showed without bullet or number. The body of the document was not concerned.

- **A header or footer taller than its zone no longer pushes the text of the page**: the zone of a header or footer keeps its size (60 px of content); whatever goes beyond it is cut
  the same way in Reading mode, printing, the PDF and Word, and the text of the page stays exactly where it is. Before, Word moved the whole body of the document down as soon as the
  header or footer was taller than the zone (eight lines, a large image), the PDF cut at a height that depended on the margins, and Reading mode showed a band taller than the zone. In
  Word, the content that goes beyond is wrapped in a borderless table row with an exact height (45 pt); in the PDF, the lines beyond the limit are removed and a too-tall image is
  cropped; in Reading mode and printing, the band is cut at 60 px. A header or footer that fits the zone is written as before. The editor reports what goes beyond (see "Headers and footers no longer refuse anything when typing").

- **The aligned logo of a page footer appears in the PDF**: a logo aligned left or right in a page footer was not drawn in the PDF, it fell off the bottom of the sheet, twice too low.
  It now sits at the edge of the page with its text beside it, as on screen. The header, Word and Reading mode were not concerned.

- **In Word, blank lines in a header or footer no longer push the text of the page down**: Word writes every blank line, but the widget's measure did not count it; a header made of
  a text followed by eight line breaks counted as a single line, was not cut at the zone and the body of the document moved down (from 83 pt to 130 pt in the test). A blank line
  now counts as a line, and whatever goes beyond the zone is cut like the rest; a header or footer of one or two lines is written as before. The PDF and Reading mode were not
  concerned.

- **The "#" list puts the columns of the page's table first, even when that table has no row yet**: the widget only knew the page's table once Grist sent it a row. With an empty table,
  or with "Select by" while no row is chosen, no row arrives: the "#" list (in the text as in the Subject, To, Cc, Bcc and PDF file name fields) then followed the order of the tables of
  the document, and the page's table, often created last, ended up at the very bottom. The widget now reads its table from what Grist sends it as soon as it opens, with or without a row:
  its columns come first, then those of the other tables, as was already the case once a row was chosen. If Grist attaches the widget to another table, the list follows it without
  waiting for a row. The other column lists that start with the page's table benefit as well.

- **The first click on a numbering button of the "Heading" menu is no longer lost**: in a short panel (400 px), "1.", "a.", "I.", "Article 1" and "None" sit below the bottom of the menu,
  which has to be scrolled. The first press gave the button focus and the menu jumped back to the top: the button moved away before the mouse button was released, nothing was chosen and a
  second click was needed. The menu now keeps its place when you press one of its buttons; it only returns to the top when it opens.

- **The table of contents of the editor shows the numbering of the template you open**: the "Table of contents" block kept the numbering of the previous template (or none) until the first
  keystroke, while the headings of the text, the Reading view, the PDF, the Word file and the Markdown file were right. It now follows the opened template, without typing anything.

- **The letters and numbers of a sub-heading start again at each new heading, in the editor and in the Reading view**: with "1)", "a)" or "I)", a level 2 heading went on with
  its letters from one level 1 heading to the next ("c)" under the heading "2)" instead of "a)"), a level 3 heading with its Roman numerals; the PDF, the Word file and the table
  of contents started again correctly. The editor and the Reading view now start again like them. Same cause, another consequence: the footnotes of the editor and of the Reading
  view all carried the number "1"; they are numbered 1, 2, 3 again.

- **A centered, right-aligned or justified bullet, number, task or quote is now aligned the same way in the Word file**: the
  editor's alignment button centers, right-aligns or justifies the text of a list item or a quote, but the Word file
  always wrote it on the left (only an ordinary paragraph followed the editor). It now follows the editor, at the first
  level, in a sub-list and in a table cell, and lists remain real Word lists (native numbering). An item or a quote of
  several paragraphs takes the alignment of its first; as in any Word document, the bullet, number or box moves with its
  aligned text (in the editor and the PDF it stays at the left edge).

- **The frame of a QR code with a column stays square at any size**: below 60 px wide, the "QR code" replacement text of its hidden image
  wrapped onto several lines and made the frame taller than wide (38 x 42 px for a 36 px QR code, 32 x 82 px for 30 px); the frame
  now keeps its square shape in the body of the document as well as in a header or a footer.

- **A task list now has the editor's box and text in the PDF**: the PDF's box was smaller than the editor's (3 mm wide
  instead of 4) and the text started too far left (4.6 mm after the item's edge, 7.4 mm in the editor; 5.6 mm with the
  "Classic" style). The box now takes the size and place of the editor's in all three styles, ticked or not, and the text
  starts in the same place, at the first level and in a table cell: its lines break at the same words, whether left,
  centered, right-aligned or justified. An item cut by a page break no longer widens everything behind it by 1 mm (the
  justified paragraph after it stuck out of the right margin).

- **A centered, right-aligned or justified quote is now aligned the same way in the PDF**: the editor's alignment button
  centers, right-aligns or justifies a quote's text, but the PDF always wrote it on the left. It now follows the editor, at
  the first level and in a table cell: the text is aligned inside the quote's box (italics, indent and the space above and
  below unchanged) and its lines break at the same words. A quote of several paragraphs takes the alignment of its first;
  the last line of a centered or right-aligned text ends one space (under 1 mm) before the editor's, as in an ordinary
  paragraph.
- **Going from the body to the header or the footer no longer suggests anything under track changes and no longer
  mixes the undo history**: with track changes on, opening the header (or the footer) stacked the body text
  (struck through) and the header text (underlined) as suggestions, which then ended up in the saved template;
  and Undo right after opening or closing a zone put the body in the header, or the header in the body. The
  switch no longer leaves any suggestion and no longer enters the history: the body, the header and the footer each
  keep their own (Undo undoes the last typing of the open text).
- **A centered, right-aligned or justified list item is now aligned the same way in the PDF**: the editor's alignment button
  centers, right-aligns or justifies a list item's text, but the PDF always wrote it on the left. It now follows the editor, at
  the first level, in a sub-list, in a table cell and in a task list: the text is aligned inside the item's box, its lines
  break at the same words, and the bullet or number stays at the box's left edge, as in the editor (it does not follow the
  centered text). An item cut by a page break keeps its lines and shifts nothing behind it. The last line of a centered or
  right-aligned text ends one space (under 1 mm) before the editor's, as in an ordinary paragraph.
- **A list's text starts in the same place in the PDF as in the editor**: in the PDF, the bullet or number was written at the
  head of the text, at the item's edge: the first line of a list item started 2 mm (a bullet) to 4 mm ("1.") further right
  than in the editor and had that much less room, and the following lines went back under the bullet. The bullet or number
  now hangs to the left of the text, as in the editor, Reading mode and Word: every line of an item starts at the same
  edge, at the first level, in a sub-list and in a table cell, and the first line has as much room as the others. A number
  wider than the list's indent ("100.") sticks out to the left of the indent, as in the editor. Task lists have their own entry, above.
- **A page break that ends the document no longer opens an empty "Page 2" in the editor**: a page break set by hand at the
  end of the document (nothing behind it but blank lines, or other breaks) kept its "Page 2" marker in the editor and counted
  in the footer's "n/total", whereas Reading mode, PDF and Word remove it with its tail: you saw two pages where the export
  made one. The editor no longer draws the marker: the document shows the pages that will come out. The marker comes back as
  soon as text is behind the break (text typed on the line below, for instance) and goes away with it; the editor then
  scrolls to the cursor if the page that appears pushed it out of the panel. The break stays visible as a "Page break"
  block, the blank lines stay in the document, and two breaks in a row before text still leave their blank page, which is
  intended.
- **The cursor moves below the page break when you click the button**: the "Page break" button left the new break selected,
  so the first key you typed replaced it: you lost the break while trying to keep writing after it. The cursor now goes
  to the line below, ready to write, and the editor scrolls to it (it opens the next page). A text split in two by the
  break already has its rest below; at the end of the document, or before a table, a list or another page break, an
  empty line is added below. A single Undo gives back the document as it was before the click, added line included. In
  a grid or a document table, the button keeps its role (the break before the row) and does not move the cursor.
- **Blank lines just before a page break no longer make a blank page**: when the text reached the bottom margin of a page and
  one or more blank lines (an extra Enter) came before a page break set by hand, those lines no longer fitted on the page and
  opened a page of their own, which the break closed at once: a blank page in the middle of the document, in the editor
  (A4 preview), Reading mode, print, PDF and Word. Those blank lines no longer count: the text after the break starts at the
  top of the next page, as without them. The editor keeps them (you can write on them, and a line written on one counts for
  its page), the other blank lines in the text keep their height, and two page breaks in a row still leave their blank page,
  which is intended.
- **A table wider than its column stays inside its column, in a two-column zone**: a table placed in one of the two columns
  of a zone was only brought back to the width of the page: it ran over the text of the other column, and in the right
  column it even left the page. It is now brought back to the width of its column's text, columns in proportion (none under
  25 px), in the editor (A4 preview), Reading mode, print, PDF and Word. It follows the column when the zone's separator
  is moved. A table that already fits its column is not touched, and a table already at its narrowest is no longer
  rewritten on every keystroke.
- **The spaces typed around a value that writes nothing no longer add up**: when a conditional value was not kept
  (two in a row, "Mrs" then "Mr" before "Durand"), or when a variable bubble was empty, hidden by its condition,
  zero-hidden, had no value in its "otherwise" or no row in its loop, it disappeared but the spaces typed on each
  side stayed: "Hello  Durand" (two spaces), "Dear Sir , hello", a paragraph that began or ended with a space. Now
  only one is left between two words, none at the start or the end of a paragraph, none before a comma or a full stop
  attached to what disappears; a space typed before a ":" (French usage) stays. It is fixed everywhere the document
  is written for a row: Reading view, print, PDF, Word, Excel, Markdown, e-mail, header and footer, and the text
  fields (Subject, To, Cc, Bcc, PDF name). Only the spaces next to what writes nothing are touched (two spaces typed
  elsewhere stay two) and the saved template is never changed; in the editor, bubbles and values keep their visual
  margin, which is not a space of the text.
- **A list in a quote is written in the PDF with its bullets, each item on its line, and its rule**: in the PDF, a list
  placed in a quote came out in one piece with it: its items were glued on the same line, without bullet or number,
  and a rule placed in an item was not drawn. Each item now has its line, its bullet or number at the editor's
  indent, in italics like the quote; the rule goes from the bullet to the right edge of the page; the text before
  and after the list stays in the quote.
- **A quote in a table cell is written in the PDF like a quote in the text**: in the PDF, a quote placed in a cell came
  out flat, like the cell's text: without italics, without its indent and without the 4-point space it has
  above and below outside a table. It is now in italics, with the same indent and the same spaces as outside a table,
  in every column, and its lines break at the same words as in the editor; the rule of a quote in a cell starts at that
  indent.
- **A template left and reopened right away shows what was just written to it**: after a change (a word, the page
  orientation, the header), automatic saving did write it to Grist, but a template you left and reopened within the
  next few seconds appeared with its earlier state, as if the change were lost; the next change, saved from that
  screen, then overwrote the first in Grist without any message. The reopened template now shows what was just saved,
  and a read of the template list that started before a save and came back after it (slow Grist) no longer puts the
  earlier state back.
- **A list in a table cell is placed correctly in the PDF, in every column**: in the PDF, a list (bulleted, numbered
  or task list) placed in the second column of a table, or in a later one, started far to the right and its text came
  out one letter per line; in the first column it was shifted a few points to the right. Its bullet and its text are
  now at the same distance from the cell edge as in a list outside a table. A sub-list in a cell (a list inside a list
  item) had neither bullet nor indent: it now has both, one level further right than its item.
- **A document table comes out cleanly in every view and every export**: the columns and rows of the same table were
  compared in the editor, Reading mode, browser printing, the PDF and the Word file (A4, A5, A3 pages, landscape,
  changed margins; narrow, wide, merged, colored and set-height tables), and four defects are fixed. A table saved
  without the A4 preview and wider than the page now fits the page in the Word file (the grid and every cell, in
  proportion to the columns) as it already did in the PDF, Reading mode and printing. Ticking "A4 preview" brings it
  back into the page at once, without waiting for a keystroke and without marking the document as modified. A table
  placed in a list item (bulleted, numbered, nested) or in a quote is no longer written flat ("An itemL1AL1B…") in the
  PDF and the Word file: it is a table, indented like the item, and the text after it continues the item without a new
  bullet.
- **The PDF rule takes the width of its block and shows in cells, lists and quotes**: in the PDF, the rule was
  always the same length (a little shorter than the text, and long enough to overflow into the next column in a
  two-column zone), and it was not drawn at all in a table cell, a list item or a quote, although the editor shows
  it there. It now follows the width of its page, column, cell, list item or quote, and is drawn wherever the
  editor shows it, at the same height. It stays black. The PDF of a letter may move by a few lines. Not yet
  drawn: a rule in a list placed inside a quote.
- **The rule of a quote placed inside a list item, a cell or another quote now shows in the PDF**: these quotes were
  read as one piece with what surrounds them, so their rule was not drawn and their first line ran into the last line
  of the list item ("AlphaBeta" on one line). The quote of a list item or of another quote is now its own blocks (in
  italics, at its indent) and its rule is drawn at the same height as in the editor; the quote of a cell keeps its flat
  text, with its rule running from one edge of the cell to the other. A rule inside a task list item does not exist:
  the editor moves it out of the list (two lists, the rule between them) and the PDF draws it. The PDF of a letter
  that puts a quote in a list may move by a few lines.
- **The area where you write the document has a name for a screen reader**: it is announced as a multi-line text
  box, "Template editor" ("Template header or footer" while you write a header or a footer), in French and in English.
- **The horizontal rule is the same height in the editor, Reading mode and the PDF**: a rule took 21 px in the
  editor, 16 px in Reading mode and 13 px in the PDF, and the editor did not count its room when cutting pages:
  a letter with several rules did not have the same pages whether you looked at it or exported it (in a letter
  with 22 rules, the editor's first page carried eight more lines than the PDF's). The rule now takes the same
  room everywhere, 21 px, two rules in a row 42 px, and pages break at the same lines; the PDF of a letter with
  rules may move by a few lines.
- **The PDF moves a paragraph that straddles the bottom of a page to the next page whole, like the editor**: a
  paragraph (or quote) of several lines that no longer fitted in what was left of a page was cut between two
  lines by the PDF, while the editor, Reading mode and browser printing moved it whole to the next page: the
  same letter did not have the same pages whether you looked at it or exported it. The PDF now does the same,
  at the top level and inside a zone column; a little white space sometimes remains at the bottom of the page,
  as in the editor. A paragraph taller than 90% of a page, a heading, a list, a code block, a callout, a
  paragraph beside a floating image, a caption and text tied by "Keep with next" keep their previous cut.
- **The table bar stays open after a "Borders" setting**: choosing a setting closes the menu, but the table bar
  closed with it although the cursor was still in the cell; you had to click elsewhere to get it back. It now
  stays open.
- **Document table in the A4 preview: the row that opens a page keeps its height**: when a table carries on to a
  second page, the row that opens that page is pushed down under the seam; its number (the A, B, C / 1, 2, 3 strips)
  and its handle counted that gap as part of the row's height, so the number grew huge, dragging its handle set an
  oversized height and "Make rows the same height" took that height for the average. The number, the handle and
  "Make rows the same height" now measure the row alone.
- **A two-column zone moves on to the next page in the editor and in Reading mode**: a zone taller than what
  is left of the page ran past the bottom of the sheet without ever opening a second page (so pressing Enter
  in a column never opened one), while the PDF cut it where the page ends. The editor, Reading mode and browser
  printing now cut it like the PDF, column by column: each column carries on at the top of the next page from
  the first paragraph (or list, or table) that no longer fits, and the two columns resume at the same height
  there. In the editor the zone's outline and the column borders stop at the page seam. Blank lines at the very
  bottom of the columns of a template's last zone do not open one more page, like blank lines at the end of a
  template; as soon as content follows the zone, they count.
- **Page breaks in Word and in the PDF follow the editor**: a page break placed before a table, columns, a
  horizontal rule or a table of contents is kept by Word (it was lost, or written after the table of
  contents), and two page breaks in a row leave a blank page in the PDF and in Word, like the editor, Reading
  and browser print. A macro-model template that begins with a table or columns now starts its page in Word.
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
  keeps that width in Word, as in the editor and the PDF; it used to be stretched to the full page.
- **A page-wide table in Word**: a table whose columns ran 2 to 2.7 mm past the width of the page text (an
  invoice or a purchase order on A4, for example) is brought back to that width, as in the PDF, instead of
  overhanging. A table that fits in the page does not change.
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
- **An empty page between two templates of a macro-template in the PDF export**: when the letter of a template
  reaches the bottom margin, the blank line that ends it (the one the editor leaves behind a last two-column
  zone or a last table, or one Enter too many) no longer fitted and opened a blank page before the next
  template: in the PDF, and in Reading mode when the text came right up to the margin (it has a little more room
  than the PDF for a letter in columns or a table, hence a blank page in the PDF alone). The end of each
  template is now trimmed like the end of the document, in Reading, the PDF and the Word export: its blank
  lines, the line that only carries a layer image of the first page (the image stays where it is, anchored to
  the paragraph before it) and the blank lines at the bottom of the columns of a last zone. Blank lines in the
  middle of a template, the page break that opens the next template and a template that is entirely empty do not
  change.
- **Button tooltips in the dark theme**: the text of the toolbar tooltips was written in white on a light
  bubble (1.19:1, barely readable). It now follows the theme's surface colour: dark on the light bubble in
  the dark theme, still white on the dark bubble in the light theme.
- **Client SIRET and VAT lines in the gallery's invoice and agreement**: these two lines never showed, even
  for a client whose fields were filled in, because their condition read the page's table instead of the
  client's. The gallery templates now show them; templates already created do not change.
- **Chosen row of a menu under the mouse**: in a menu that opens on hover (Export type, PDF quality, heading
  levels), the chosen row is blue and bold, but under the mouse that blue sat on the hover grey and only reached
  4.0:1 in the light theme and 4.4:1 in the dark theme, a little pale. It keeps its blue and its bold, with a firmer
  blue while the mouse is over it (5.7:1 in light, 5.4:1 in dark); at rest, nothing changes.
- **Chosen tab under the mouse**: in Settings and in the "#" list (Variables / Chips), the chosen tab is blue and
  underlined, but under the mouse that blue sat on the hover grey and only reached 4.0:1 in the light theme and 4.4:1
  in the dark theme. It keeps its blue and its line, with a firmer blue while the mouse is over it (5.7:1 in light,
  5.4:1 in dark); at rest, nothing changes.
- **Fields use the buttons' font**: since the switch to the system font, buttons used it but fields did not. The
  template name (while renaming it), an email's Subject, To, Cc, Bcc and the PDF name, the gallery search, the macro
  template's name, the margins and the trigger character in Settings, a variable's decimals, currency and date format
  stayed in Arial, the browser's default font. Every field of the interface, and the text typed in it, now uses the same
  font as the buttons next to it; their size and place do not change. The document's content keeps its Roboto.
- **Buttons and labels use the system font too**: after the fields, a few buttons and labels were still in Arial, the
  browser's default font: the lines of the font menu and the size menu, the FR, US, J, M, A, "Words" and "true / false"
  buttons of a variable's bar, and "+ Add a header" / "+ Add a footer" when you hover the page margin. They now use the
  same font as the rest of the interface; the letter size and the height of the menu lines do not change (only the width
  of a variable's buttons follows the shape of the letters in the computer's font). The document's content keeps its Roboto.
- **The text of headers and footers is written in Roboto on the sheet**: it was shown in Arial, the browser's default
  font, while the PDF and the rest of the document use Roboto. The sheet now shows the same letters as the PDF, for the
  header and footer of the first page as well as for those repeated between two pages; the size of the text and the
  place of the zones do not change.
- **The day, month and year buttons of a date follow the language**: a date variable's bar showed "J", "M" and "A"
  even when the interface was in English. It now shows "D", "M" and "Y" in English, with their tooltips in the chosen
  language.

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
