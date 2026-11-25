# Idées de fonctions et d'études

Ce fichier recense, au fil de l'eau, **toutes les idées de fonctions et d'études lancées dans le chat du projet**. Une ligne par idée : sa date, ce qu'elle apporte en mots d'usage, l'effort de développement estimé (de 1 à 5) et son état. Il complète [ROADMAP.md](ROADMAP.md) (liste du 14/09/2026, plus tenue à jour) et le classeur `RoadMap_Suite_Grist_Factory_fusionnee.xlsx` du dossier du projet. On y garde ce qui n'est pas réalisé, y compris ce qui a été refusé, pour ne pas le reproposer.

Dernière mise à jour : 25/11/2026.

## États

| État | Sens |
|---|---|
| idée | notée, rien d'étudié ni de codé |
| à l'étude | étude, maquette ou prototype faits, ou carte posée ; rien de livré |
| refusé | écartée ou « pas pour l'instant » : ne pas la reproposer sans demande |
| fait | livrée sur `main` (on garde le hash) ; la ligne reste pour mémoire |

## Effort de développement (de 1 à 5)

C'est une estimation à la louche, faite d'après ce qui existe déjà dans le code : elle se reprend quand l'idée est étudiée. Elle compte la taille du travail, pas une durée. Pour une idée refusée, elle dit ce que coûterait un retour en arrière sur la décision.

| Effort | Sens |
|---|---|
| 1 | petit réglage, à un seul endroit |
| 2 | fonction simple qui réutilise une brique existante : un lot court |
| 3 | vraie fonction : un lot, plusieurs fichiers, une fenêtre ou un menu, les exports à relire |
| 4 | gros morceau : plusieurs lots, ou une brique nouvelle (stockage, bibliothèque, sécurité) |
| 5 | chantier majeur : conception produit d'abord, refonte ou risque élevé |

## Tenue du fichier

- Toute nouvelle idée lancée dans le chat y reçoit **une ligne**, à son thème, à l'état « idée », avec son effort de 1 à 5 et, en quelques mots, ce qui le justifie. Pas de doublon : si l'idée existe déjà, on met sa ligne à jour.
- Quand l'état change, on garde la date de l'idée et on note entre parenthèses la date et la raison du changement (et le hash quand c'est fait). Quand l'idée est étudiée, on revoit son effort.
- Une idée refusée reste dans le fichier avec sa date et le mot exact de la réponse.
- Quand une idée passe à « fait », on peut la déplacer en bas du thème ; on ne la supprime pas.
- Une idée venue de GFS le dit dans sa ligne (« idée de GFS »).

## Édition, liens et navigation dans le document

| Date | Idée | Effort | État |
|---|---|---|---|
| 24/11/2026 | **Citer la fiche suivante (ou la précédente) d'une série** : des instances s'enchaînent (un numéro, une date) ; dans un e-mail, une variable donne l'instance choisie et une autre donne la suivante, le « +1 ». Reste à dire comment se règle « suivante » : par numéro ou par date, dans la même instance ou dans toute la table. Cousine de l'idée `#ODJ[n]` du 12/11, qui n'avait pas été retenue. En attendant, une colonne Référence à formule dans Grist peut donner la suivante (à essayer). Pensée pour tout le widget, pas seulement les e-mails. Étude écrite le 24/11 (« Étude : la fiche suivante, pour tout le widget », document en ligne) : un maillon « +1 » / « -1 » dans le chemin d'une variable, avec colonne d'ordre et colonne de groupe. 5 choix tranchés le 24/11, tous sur la recommandation : ordre réglé à chaque maillon, rien d'écrit quand il n'y a pas de ligne voisine, ±n, groupe par une colonne, tri sur la colonne choisie (jamais l'écran). Lot 1 fait le 24/11 (`1e92b00`) : le maillon dans les bulles, la fenêtre « Autres colonnes de la même ligne » (ouverte aussi pour une colonne ordinaire de la page), les renommages. Lot 2 fait le 25/11 : les champs À / Objet / Cc / Cci / nom du PDF, les calculs, les renommages de texte, le choix de colonne d'une condition (`bf7e0c2`) et la pastille « @ » avec son signe « +1 » visible, rien d'écrit en bout de série (lot 2b, `ce60f94`). Lot 3 fait le 25/11 : « première » et « dernière » de la série (maillon « first(Date;Cycle) » / « last(Date;Cycle) », dans la fenêtre à côté de « suivante » et « précédente », signe « début » / « fin » sur la pastille) et, dans le choix de colonne d'une condition, le bouton « Y a-t-il une suivante ? » (colonne d'ordre de la voisine + « non vide »). Mesuré le 25/11 sur 30 000 lignes (50 cycles) : rangée une fois en 26 ms, 5 000 lectures de voisines en 4 ms. Reste : le réglage « Série » par table et le filtre complet (lot 4), un essai dans un vrai Grist. | 3 : la pastille « @ » et les variables savent déjà lire une ligne précise et descendre de référence en référence ; reste à définir la suivante, la poser dans la fenêtre et la lire dans tous les exports ; 4 si réglage « Série » par table | à l'étude : lots 1 à 3 faits (24-25/11), lot 4 à venir |
| 25/11/2026 | **Réglages de la puce « N° de ligne »** : un nombre de chiffres (« 007 »), un préfixe ou un séparateur de milliers, comme une variable sur une colonne numérique. Trouvé en cherchant ce que les autres puces n'ont pas, après le format de la date du jour. | 2 : un attribut de plus sur la puce, la barre flottante existe | idée |
| 25/11/2026 | **Majuscules, minuscules et « Première lettre en majuscule » sur une variable de texte, une pastille ou une puce** : aucune pastille n'en propose aujourd'hui (rien à aligner, c'est une fonction qui n'existe nulle part). Trouvé dans l'audit « tout uniformiser » du 25/11. | 3 : un réglage de plus sur les bulles texte, la Lecture, tous les exports et la liste des options | idée |
| 24/11/2026 | **Icônes de la liste des documents en couleur pour le macro-modèle et l'e-mail** : le macro-modèle porte trois feuilles bleue, verte et orange (les trois sortes qu'il assemble), l'e-mail est violet. | 2 : réutilise les jetons des autres sortes, un jeton de plus, un seul fichier de style | fait (version B choisie sur carte le 24/11) |
| 23/11/2026 | **Notice du document** : sur un document, une grille ou une présentation, ajouter une page d'explication sur le fonctionnement (« comment se servir de ce document »), comme un commentaire. Texte court avec titres, gras, listes et liens ; un bandeau fin sous la barre d'outils et une fenêtre ; rouverte et écrite depuis le menu du crayon à côté du nom ; jamais imprimée ni exportée. | 3 : une colonne `Notice` de plus dans la table des documents (hors du texte, donc aucun export ne la voit), une fenêtre avec un petit éditeur, un bandeau, une ligne de menu, Annuler et la lecture seule | fait (23/11, `1304f2a` : sur `main`) |
| 23/11/2026 | **Banque d'icônes nommées** : en plus des smileys, choisir une icône par son nom avec « @ ». Les icônes seraient rangées dans Grist (en pièce jointe) et/ou dans le dépôt. | 4 : images à choisir et à nommer en FR et EN, rangement dans Grist, dessin fidèle dans le PDF, le Word, le HTML et l'e-mail | idée |
| 23/11/2026 | **Aperçu de la première page au survol d'un lien** vers un titre, une annexe ou un signet : en passant la souris, on voit le début de l'endroit visé. (Le renvoi « cf [titre] » existe depuis le 20/11, `ed0bb1b` ; l'aperçu, non.) | 3 : l'info-bulle au survol existe déjà ; reste à dessiner l'extrait de l'endroit visé, en édition et en Lecture | idée |
| 23/11/2026 | **Bouton « retour » après un clic sur un titre, une annexe ou un signet** : revenir là où l'on était avant le clic, pour faire des allers-retours rapides dans le document. | 2 : garder la position d'avant chaque saut et poser un bouton ; à placer sans gêner la barre de GFS | idée |
| 20/11/2026 | **Tampon « Confidentiel » ajouté automatiquement**, à côté du texte. | 3 : proche du filigrane (couche de page) ; reste à trancher quand il se pose tout seul | idée |
| 06/11/2026 | **Blocs partagés** : un même bloc de texte réutilisé dans plusieurs documents. | 4 : rangement commun dans Grist, mise à jour partout, rendu dans tous les exports | idée (besoin à vérifier) |
| 12/10/2026 | **Codes-barres**, en plus du QR code. | 3 : le QR code montre le chemin ; il faut une bibliothèque en plus et les exports | idée (« plus tard ») |
| 12/10/2026 | **Remplir avec des données d'exemple** : des valeurs factices dans toutes les variables, pour voir le document sans ligne Grist réelle. | 3 : une valeur plausible par type de colonne, et la Lecture sans ligne réelle | idée (« plus tard ») |
| 12/10/2026 | **Lignes d'exemple dans les tables livrées avec les modèles de la galerie** (elles sont créées vides). | 2 : le créateur de tables de la galerie écrirait quelques lignes en plus | idée (« plus tard ») |
| 14/09/2026 | **Modèles multi-langues** : une même mise en page proposée en plusieurs langues. | 5 : conception produit d'abord (comment garder les langues d'accord quand on modifie) | idée (conception produit d'abord) |
| 06/11/2026 | **Incorporer la police dans le Word exporté** : aujourd'hui, si Roboto manque chez le destinataire, Word la remplace. | 3 : l'incorporation de polices dans un fichier Word est un format à part, à vérifier dans Word | idée (« option plus tard ») |
| 01/10/2026 | **Puces réutilisables** (entreprise, adresse, bloc de signature, coordonnées bancaires…). | 4 | refusé (« Pas pour l'instant », 01/10) |

## Documents générés, envoi et archivage

| Date | Idée | Effort | État |
|---|---|---|---|
| 06/11/2026 | **Journal des documents générés** : une ligne par document produit, dans une table compagne (`Publipostage_Journal`). | 3 : une table de plus et une écriture à la fin de chaque lot | refusé (« Rien pour l'instant », 11/11) |
| 06/11/2026 | **Envoi automatique depuis le PDF gardé dans la ligne** (case « Prêt à envoyer » et automatisation). | 5 : le widget n'envoie jamais de données sans carte de sécurité | refusé (« Rien pour l'instant », 11/11) |
| 06/11/2026 | **PDF accessible (balisé)**. PDF/A est fait (`00881fd`). Le balisage a un prototype mesuré le 11/11 : facture et devis conformes PDF/UA-1, rendu identique, +4 à +22 Ko. Reste à l'intégrer et à l'essayer avec un vrai lecteur d'écran. | 4 : 4 à 6 lots (texte de remplacement des images, listes, rôle de chaque bloc, langue) | à l'étude |
| 06/11/2026 | **Calendrier `.ics` et carte de contact vCard** en sortie. | 3 : deux formats texte simples, mais une correspondance des champs à choisir | idée |
| 06/11/2026 | **Aides pour QR de paiement** (virement SEPA…). | 2 : un gabarit de contenu pour le QR code qui existe déjà | idée |
| 06/11/2026 | **Tâches d'un compte rendu vers une table Grist.** | 4 : le widget écrirait dans Grist, donc une carte de sécurité d'abord | idée (besoin à vérifier) |
| 12/11/2026 | **Joindre le PDF de la ligne à l'e-mail `.eml` exporté.** | 2 : la fabrication du PDF par ligne et les pièces jointes de l'e-mail existent | idée (« carte possible plus tard ») |
| 10/2026 | **Calculs dans le widget** (sommes, TVA…). | 5 | refusé (« NON », 09/10) |
| 10/2026 | **Signature électronique.** | 5 | refusé (abandonnée, 09/10) |
| 10/2026 | **Factur-X.** | 5 | refusé (« on n'aura jamais d'homologation », 09/10) |

## Grille et tableaux

| Date | Idée | Effort | État |
|---|---|---|---|
| 12/11/2026 | **Tableau croisé (TCD) en grille.** Lots 1 à 5 faits (`3cc346c` à `1790472`). Reste le lot 6 (dates groupées, deux colonnes), la variante « tableau sur place » et le format de nombre Excel qui suivrait la colonne Grist. | 3 pour le lot 6 : le moteur et les sorties existent | à l'étude |
| 13/10/2026 | **Écriture en direct (à plusieurs) dans la grille.** Avis rendu : le document est raisonnable, la grille « plus tard ou jamais ». | 5 : plusieurs bibliothèques en plus, et une grille n'est pas un texte | idée |
| 10/2026 | **Regroupement avec sous-total.** | 4 | refusé |
| 10/2026 | **Pagination de grille.** | 4 | refusé |
| 10/2026 | **Excel avec formules.** | 4 | refusé |

## Révision : suivi des modifications et commentaires

Le volet, les quatre affichages et les couleurs d'auteur sont faits (`158d572`) ; les trois lignes suivantes ne le sont pas.

| Date | Idée | Effort | État |
|---|---|---|---|
| 06/11/2026 | **Rôle « suggérant »** : une personne qui ne peut que proposer des modifications. | 4 : les droits par personne existent, mais le suivi doit devenir obligatoire pour elle | idée |
| 06/11/2026 | **Export Word avec les marques de suivi** (insertions et suppressions visibles dans Word). | 3 : à vérifier dans Word | idée |
| 06/11/2026 | **Journal des modifications résolues.** | 2 : les modifications sont purgées dès qu'elles sont résolues, il faudrait les garder quelque part | idée |

## Diapositives (Slides+) et diaporama

| Date | Idée | Effort | État |
|---|---|---|---|
| 20/11/2026 | **Choisir l'icône de l'onglet ouvert par le widget** (diaporama, mode présentateur). | 2 : poser l'icône dans la page du diaporama ; le choix de la personne reste à ranger | idée |
| 13/11/2026 | **Présentation non linéaire façon Prezi / Zoom de PowerPoint** : un sommaire qui zoome sur la diapositive cliquée, retour automatique en fin de section. Option A recommandée. Étude et maquettes rendues. | 3 pour l'option A ; 5 pour une vraie toile zoomable | idée (en réserve, « pas de dev pour l'instant ») |
| 21/10/2026 | **Minutage automatique et durée par diapositive.** | 3 : le lecteur, un réglage par diapositive et la parité PowerPoint | idée (reporté) |
| 11/11/2026 | **Départ plus rapide du diaporama d'un gros modèle déjà ouvert** (120 diapositives : 12 s, puis 0,5 s par diapositive). | 3 : le coût vient de la mise en page de tout le modèle ; à mesurer avant de toucher | idée (non traité) |
| 20/11/2026 | **Polices étroites dans l'éditeur** (Arial Narrow, pour que les textes importés ne soient plus réduits). Bibliothèque en plus : seulement avec GFS. | 3 : la police, son rendu dans le PDF et la règle « avec GFS seulement » | idée (à part) |
| 02/11/2026 | **Import PowerPoint : dégradés, ombres, motifs** (chantiers 6 et 7). | 4 | refusé (« pas pour l'instant ») |
| 11/11/2026 | **Diaporama dans un autre onglet qui suit le texte et les valeurs Grist en direct.** | 4 | refusé (on garde la copie du moment) |
| 07/11/2026 | **Import Word : traits pointillé, double, épais, et texte tourné dans une case.** | 3 | refusé (« Pas pour l'instant », 07/11) |

## Sécurité, performance et structure

| Date | Idée | Effort | État |
|---|---|---|---|
| 18/11/2026 | **Renforcer d'abord les empreintes de l'éditeur** (vérifier que le code chargé est bien celui attendu). Carte posée, réponse attendue. | 2 : les 96 empreintes existent et démarrent l'éditeur ; Firefox et le mode hors ligne à essayer | à l'étude |
| 18/11/2026 | **Protection contre une bibliothèque qui enverrait des données** (variante stricte avec alerte). Carte posée, réponse attendue. | 4 : la règle de sécurité stricte casse des usages (images d'autres sites, polices de GFS) | à l'étude |
| 20/11/2026 | **Revoir le nombre de tables que le widget crée dans Grist** (recommandation de la carte : neuf tables, noms en anglais seulement). Reporté après la bascule FR vers EN (« Plus tard », 20/11). | 4 : migrer les données des documents existants | idée (reporté) |
| 04/10/2026 | **Manifeste de catalogue de widget** (url, widgetId, niveau d'accès). | 2 | idée (« plus tard ») |
| 24/11/2026 | **Publier les fichiers de l'app sans leurs commentaires** (environ 45 % de moins à télécharger, ~0,7 s à l'ouverture depuis GFS) : une étape de publication à caler avec GFS. Validée par Antoine après « le document seul d'abord ». L'outil est écrit et prouvé (`outils/alleger-publication.mjs`, essai `allegement` : l'arbre syntaxique et le nombre de lignes de chaque fichier sont identiques, donc les numéros de ligne des erreurs ne changent pas) ; l'app démarre depuis les fichiers allégés ; reste à choisir où on le branche (site de test par un déploiement GitHub Actions, ou envoi public). | 2 : un déploiement à poser, rien d'autre | outil prêt, publication à décider |
| 25/11/2026 | **Ouvrir plus vite un document à règles d'accès.** Aujourd'hui, quand Grist refuse la lecture rapide (`/sql`) au jeton en lecture seule, le widget lit la table entière à l'ouverture. GFS a vérifié (son fait 173, vrai Grist 1.7.19, document de 120 Mo) qu'avec le jeton qui peut écrire, le propriétaire lit la liste en 1,8 s au lieu de 7,5 s environ, pendant que l'éditeur et le lecteur n'obtiennent rien : les règles tiennent. Reprendre ce choix ici est une décision de sécurité (un jeton qui peut écrire partirait dans l'adresse de la lecture) : une carte avant de coder. | 2 : un jeton de plus à demander après le premier refus, retenu un moment ; le faux Grist des essais sait déjà refuser `/sql` | idée (carte à poser) |
