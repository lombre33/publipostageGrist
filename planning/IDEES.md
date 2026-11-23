# Idées de fonctions et d'études

Ce fichier recense, au fil de l'eau, **toutes les idées de fonctions et d'études lancées dans le chat du projet**. Une ligne par idée : sa date, ce qu'elle apporte en mots d'usage, et son état. Il complète [ROADMAP.md](ROADMAP.md) (liste du 14/09/2026, plus tenue à jour) et le classeur `RoadMap_Suite_Grist_Factory_fusionnee.xlsx` du dossier du projet. On y garde ce qui n'est pas réalisé, y compris ce qui a été refusé, pour ne pas le reproposer.

Dernière mise à jour : 23/11/2026.

## États

| État | Sens |
|---|---|
| idée | notée, rien d'étudié ni de codé |
| à l'étude | étude, maquette ou prototype faits, ou carte posée ; rien de livré |
| refusé | écartée ou « pas pour l'instant » : ne pas la reproposer sans demande |
| fait | livrée sur `main` (on garde le hash) ; la ligne reste pour mémoire |

## Tenue du fichier

- Toute nouvelle idée lancée dans le chat y reçoit **une ligne**, à son thème, à l'état « idée ». Pas de doublon : si l'idée existe déjà, on met sa ligne à jour.
- Quand l'état change, on garde la date de l'idée et on note entre parenthèses la date et la raison du changement (et le hash quand c'est fait).
- Une idée refusée reste dans le fichier avec sa date et le mot exact de la réponse.
- Quand une idée passe à « fait », on peut la déplacer en bas du thème ; on ne la supprime pas.

## Édition, liens et navigation dans le document

| Date | Idée | État |
|---|---|---|
| 23/11/2026 | **Banque d'icônes nommées** : en plus des smileys, choisir une icône par son nom avec « @ ». Les icônes seraient rangées dans Grist (en pièce jointe) et/ou dans le dépôt. | idée |
| 23/11/2026 | **Aperçu de la première page au survol d'un lien** vers un titre, une annexe ou un signet : en passant la souris, on voit le début de l'endroit visé. (Le renvoi « cf [titre] » existe depuis le 20/11, `ed0bb1b` ; l'aperçu, non.) | idée |
| 23/11/2026 | **Bouton « retour » après un clic sur un titre, une annexe ou un signet** : revenir là où l'on était avant le clic, pour faire des allers-retours rapides dans le document. | idée |
| 20/11/2026 | **Tampon « Confidentiel » ajouté automatiquement**, à côté du texte. | idée |
| 06/11/2026 | **Blocs partagés** : un même bloc de texte réutilisé dans plusieurs documents. | idée (besoin à vérifier) |
| 12/10/2026 | **Codes-barres**, en plus du QR code. | idée (« plus tard ») |
| 12/10/2026 | **Remplir avec des données d'exemple** : des valeurs factices dans toutes les variables, pour voir le document sans ligne Grist réelle. | idée (« plus tard ») |
| 12/10/2026 | **Lignes d'exemple dans les tables livrées avec les modèles de la galerie** (elles sont créées vides). | idée (« plus tard ») |
| 14/09/2026 | **Modèles multi-langues** : une même mise en page proposée en plusieurs langues. | idée (conception produit d'abord) |
| 06/11/2026 | **Incorporer la police dans le Word exporté** : aujourd'hui, si Roboto manque chez le destinataire, Word la remplace. | idée (« option plus tard ») |
| 01/10/2026 | **Puces réutilisables** (entreprise, adresse, bloc de signature, coordonnées bancaires…). | refusé (« Pas pour l'instant », 01/10) |

## Documents générés, envoi et archivage

| Date | Idée | État |
|---|---|---|
| 06/11/2026 | **Journal des documents générés** : une ligne par document produit, dans une table compagne (`Publipostage_Journal`). | refusé (« Rien pour l'instant », 11/11) |
| 06/11/2026 | **Envoi automatique depuis le PDF gardé dans la ligne** (case « Prêt à envoyer » et automatisation). | refusé (« Rien pour l'instant », 11/11) |
| 06/11/2026 | **PDF accessible (balisé)**. PDF/A est fait (`00881fd`). Le balisage a un prototype mesuré le 11/11 : facture et devis conformes PDF/UA-1, rendu identique, +4 à +22 Ko. Reste à l'intégrer (4 à 6 lots) et à l'essayer avec un vrai lecteur d'écran. | à l'étude |
| 06/11/2026 | **Calendrier `.ics` et carte de contact vCard** en sortie. | idée |
| 06/11/2026 | **Aides pour QR de paiement** (virement SEPA…). | idée |
| 06/11/2026 | **Tâches d'un compte rendu vers une table Grist.** | idée (besoin à vérifier) |
| 12/11/2026 | **Joindre le PDF de la ligne à l'e-mail `.eml` exporté.** | idée (« carte possible plus tard ») |
| 10/2026 | **Calculs dans le widget** (sommes, TVA…). | refusé (« NON », 09/10) |
| 10/2026 | **Signature électronique.** | refusé (abandonnée, 09/10) |
| 10/2026 | **Factur-X.** | refusé (« on n'aura jamais d'homologation », 09/10) |

## Grille et tableaux

| Date | Idée | État |
|---|---|---|
| 12/11/2026 | **Tableau croisé (TCD) en grille.** Lots 1 à 5 faits (`3cc346c` à `1790472`). Reste le lot 6 (dates groupées, deux colonnes), la variante « tableau sur place » et le format de nombre Excel qui suivrait la colonne Grist. | à l'étude |
| 13/10/2026 | **Écriture en direct (à plusieurs) dans la grille.** Avis rendu : le document est raisonnable, la grille « plus tard ou jamais ». | idée |
| 10/2026 | **Regroupement avec sous-total.** | refusé |
| 10/2026 | **Pagination de grille.** | refusé |
| 10/2026 | **Excel avec formules.** | refusé |

## Révision : suivi des modifications et commentaires

| Date | Idée | État |
|---|---|---|
| 06/11/2026 | **Rôle « suggérant »** (une personne qui ne peut que proposer des modifications), **export Word avec les marques de suivi**, **journal des modifications résolues**. Le volet, les quatre affichages et les couleurs d'auteur sont faits (`158d572`) ; ces trois-là ne le sont pas. | idée |

## Diapositives (Slides+) et diaporama

| Date | Idée | État |
|---|---|---|
| 20/11/2026 | **Choisir l'icône de l'onglet ouvert par le widget** (diaporama, mode présentateur). | idée |
| 13/11/2026 | **Présentation non linéaire façon Prezi / Zoom de PowerPoint** : un sommaire qui zoome sur la diapositive cliquée, retour automatique en fin de section. Option A recommandée. Étude et maquettes rendues. | idée (en réserve, « pas de dev pour l'instant ») |
| 21/10/2026 | **Minutage automatique et durée par diapositive.** | idée (reporté) |
| 11/11/2026 | **Départ plus rapide du diaporama d'un gros modèle déjà ouvert** (120 diapositives : 12 s, puis 0,5 s par diapositive). | idée (non traité) |
| 20/11/2026 | **Polices étroites dans l'éditeur** (Arial Narrow, pour que les textes importés ne soient plus réduits). Bibliothèque en plus : seulement avec GFS. | idée (à part) |
| 02/11/2026 | **Import PowerPoint : dégradés, ombres, motifs** (chantiers 6 et 7). | refusé (« pas pour l'instant ») |
| 11/11/2026 | **Diaporama dans un autre onglet qui suit le texte et les valeurs Grist en direct.** | refusé (on garde la copie du moment) |
| 07/11/2026 | **Import Word : traits pointillé, double, épais, et texte tourné dans une case.** | refusé (« Pas pour l'instant », 07/11) |

## Sécurité, performance et structure

| Date | Idée | État |
|---|---|---|
| 18/11/2026 | **Renforcer d'abord les empreintes de l'éditeur**, puis **une protection contre une bibliothèque qui enverrait des données** (variante stricte avec alerte). Deux cartes posées, réponse attendue. | à l'étude |
| 20/11/2026 | **Revoir le nombre de tables que le widget crée dans Grist** (recommandation de la carte : neuf tables, noms en anglais seulement). Reporté après la bascule FR vers EN (« Plus tard », 20/11). | idée (reporté) |
| 04/10/2026 | **Manifeste de catalogue de widget** (url, widgetId, niveau d'accès). | idée (« plus tard ») |
