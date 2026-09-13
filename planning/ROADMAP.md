# Feuille de route — fonctionnalités Beta

Consolidation de la liste de fonctionnalités fournie par l'utilisateur le 2026-09-14 (deux jets : une
liste brute au fil de l'eau, puis une liste affinée listant les items jugés les plus prioritaires) —
dédupliquée et organisée par thème. **Rien de cette liste n'a été implémenté ni retouché ce soir**
(consigne explicite : le code actuel est celui publié en Alpha le lendemain matin). Ce document est le
point d'entrée ; les fonctionnalités les plus grosses ont leur propre fichier détaillé dans ce même
dossier `planning/`.

## Comment lire ce document

- **Impact** : valeur perçue pour l'utilisateur final (propriétaire de documents Grist qui publipostent).
- **Effort** : taille du chantier dans CE codebase précis (pas dans l'absolu) — tient compte de
  l'infrastructure déjà existante (ex. la résolution cross-table existe déjà, ce qui rend certaines
  fonctionnalités "grosses en apparence" bien moins coûteuses qu'il n'y paraît).
- **Fichier détaillé** : quand présent, contient repro/conception technique/plan de test — à lire avant
  de commencer l'implémentation.

## Priorité 1 — le plus impactant (identifié comme tel par l'utilisateur lui-même)

| # | Fonctionnalité | Impact | Effort | Détail |
|---|---|---|---|---|
| 1 | **Lignes de tableau générées depuis une table liée** (répétition automatique pour chaque ligne d'une table liée — produits/prestations d'une facture) | Très élevé | Élevé | [feature-table-rows-from-linked-table.md](feature-table-rows-from-linked-table.md) |
| 2 | **Blocs conditionnels** (afficher/masquer un paragraphe selon une valeur Grist) | Élevé | Moyen | [feature-conditional-content.md](feature-conditional-content.md) |
| 3 | **Variables calculées** (somme/soustraction entre `#Variable`, ex. sous-total + TVA = total) | Élevé | Moyen | [feature-calculated-variables.md](feature-calculated-variables.md) |
| 4 | **Mode sauvegarde automatique** (toutes les X secondes ou à chaque modif, on/off) | Élevé (évite la perte de travail) | Faible-Moyen | [feature-autosave.md](feature-autosave.md) |

## Priorité 2 — nouveaux types de blocs de contenu

Regroupés dans un seul fichier détaillé car ils partagent le même patron d'implémentation (nouveau
nœud TipTap + rendu éditeur/lecture/PDF + entrée toolbar) : [feature-content-blocks.md](feature-content-blocks.md)

| # | Fonctionnalité | Notes de l'utilisateur |
|---|---|---|
| 5 | Citation | "(le blockquote retiré)" — **à clarifier avec l'utilisateur** : un blockquote existe déjà (`js/pdf-export.js`, tests `nest_blockquote_inside_twocolumns`) ; comprendre si la demande est de le remplacer/renommer en "Citation", ou d'ajouter un second style distinct. Traité comme "à re-préciser" dans le fichier détaillé, pas supposé arbitrairement. |
| 6 | Légende | Texte italique/petit sous une image ou un tableau ; entrée prévue sur la toolbar image |
| 7 | Bloc de code | Police monospace, fond distinct |
| 8 | Bloc de signature | Ligne + espace nom/date — cohérent avec l'usage contrats/courriers de l'app. Recoupe l'item 30 de la liste affinée ("Emplacement de signature — placeholder dédié") : **même fonctionnalité**, fusionnée dans un seul plan. |
| 9 | Encadré/remarque façon Notion | "Note"/"Attention"/"Important", bloc coloré avec icône ; couleur et icône modifiables |

## Priorité 3 — enrichissement des variables et chips

| # | Fonctionnalité | Impact | Effort | Détail |
|---|---|---|---|---|
| 10 | **Chips intelligents réutilisables** (entreprise, adresse, représenté par…, bloc signature "le/à/par/en qualité de", coordonnées bancaires) | Élevé (très pertinent factures/contrats) | Moyen | [feature-reusable-smart-chips.md](feature-reusable-smart-chips.md) |
| 11 | Formater les chips intelligents comme la date (donner aux autres chips les mêmes options de format que le chip date) | Moyen | Faible | Même fichier que l'item 10 (`variable-format.js` déjà structuré pour ça) |
| 12 | **Remplissage avec des données d'exemple** (bouton injectant des valeurs factices dans toutes les `#Variable` du modèle en cours, pour prévisualiser sans ligne Grist réelle) | Moyen-Élevé (accélère la conception de modèle) | Faible-Moyen | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#remplissage-données-dexemple) |

## Priorité 4 — sortie PDF et présentation

| # | Fonctionnalité | Impact | Effort | Détail |
|---|---|---|---|---|
| 13 | **Fiabiliser les autres modes d'export PDF** (impression navigateur, raster basse/ultra — actuellement isolés dans `js/pdf-export-alt.js`, désactivés dans l'UI) | Moyen (offre déjà annoncée mais grisée) | Élevé | [feature-pdf-export-alt-modes.md](feature-pdf-export-alt-modes.md) — l'utilisateur a explicitement autorisé à commencer ce chantier dès ce soir si le temps le permettait |
| 14 | Watermark (filigrane) | Moyen | Faible-Moyen | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#watermark) |
| 15 | Changement de taille de page (A1-A6) et orientation portrait/paysage | Moyen | Moyen (`pdf-export.js`/`header-footer-preview.js` codent en dur le format A4 à plusieurs endroits) | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#taille-et-orientation-de-page) |
| 16 | QR code / code-barres (lien de paiement, suivi — basé sur une URL stockée dans une cellule Grist) | Moyen (très utile factures) | Faible-Moyen (génération QR pure client-side, plusieurs libs légères existent) | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#qr-code--code-barres) |
| 17 | Fusion de plusieurs modèles en un seul PDF (ex. lettre de couverture + CGV + facture) | Moyen-Élevé | Moyen | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#fusion-de-plusieurs-modèles) |
| 18 | Fusion à la suite de plusieurs documents conditionnels (ex. notification puis annexe qui varie selon le projet) | Moyen | Moyen-Élevé | Recoupe largement l'item 17 + les blocs conditionnels (item 2) — traité comme une **combinaison** des deux dans [feature-conditional-content.md](feature-conditional-content.md#fusion-conditionnelle-de-documents), pas une 3ᵉ fonctionnalité séparée |

## Priorité 5 — organisation et confort d'édition

| # | Fonctionnalité | Impact | Effort | Détail |
|---|---|---|---|---|
| 19 | Dossiers/favoris dans la galerie de modèles | Moyen (utile à l'échelle d'une organisation) | Faible-Moyen | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#dossiers-et-favoris-galerie) |
| 20 | Recherche/Remplacer | Moyen | Faible-Moyen | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#recherche--remplacer) |
| 21 | Fusion de cellules de tableau | Moyen | Moyen (TipTap `prosemirror-tables` le supporte nativement — vérifier l'étendue déjà couverte) | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#fusion-de-cellules-de-tableau) |
| 22 | Copier/coller des images dans l'éditeur (dupliquer une image en copiant/collant) | Moyen | Faible-Moyen | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#copier-coller-dimages) — déjà identifié comme trou de test dans `PROTOCOLE_TEST_MANUEL.md` §4 |
| 23 | Si nom de modèle déjà pris, ajouter automatiquement "(1)" | Faible | Très faible | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#nom-de-modèle-dupliqué) — confirmé : `js/templates.js:save()` n'a aujourd'hui AUCUNE vérification de nom dupliqué |
| 24 | Choix de modèle conditionnel à une variable ("gros module UX" selon l'utilisateur) | Élevé | Élevé | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#choix-de-modèle-conditionnel) |
| 25 | Variantes multi-langues d'un même modèle (+ réflexion sur la gestion des modifications) | Moyen-Élevé | Élevé (question de conception produit autant que technique) | [feature-misc-editor-and-output.md](feature-misc-editor-and-output.md#variantes-multi-langues) |
| 26 | Affiner la fidélité du mode Lecture (éditeur = lecture = PDF) | Élevé (fiabilité perçue du produit) | — | **Déjà entamé ce soir**, cf. `dev-tests/scenarios-readmode-fidelity.js` (nouveau, 15 cas) et `dev-tests/BUGS.md` Bug 4 (1 bug réel trouvé, correctif identifié mais non appliqué). Prochaine étape : appliquer ce correctif + étendre la suite (cf. `dev-tests/PROTOCOLE_TEST_MANUEL.md`, section "Prochaines étapes"). |

## Priorité 6 — performance et infrastructure

| # | Fonctionnalité | Détail |
|---|---|---|
| 27 | Optimisation du temps de chargement | Couvert par l'audit de performance de ce soir, pas un item de roadmap produit séparé — voir le rapport d'audit à la racine du dépôt pour le détail chiffré et priorisé (police CSS en TTF au lieu de WOFF2, cascade de 14 imports séquentiels, etc.) |
| 28 | "Lazy Loading" | Mentionné sans plus de précision par l'utilisateur — recoupe très probablement le point précédent (chargement paresseux déjà en place pour les libs PDF, cf. audit §1.4 ; les pistes d'amélioration restantes sont dans le rapport d'audit). **À reclarifier avec l'utilisateur** si l'intention visait autre chose (ex. lazy-loading d'images dans un très long document). |

## Item nécessitant une clarification avant tout travail

- **"Correction mineure sur le header/footer editor"** — mentionné sans détail ni repro. À redemander
  explicitement à l'utilisateur avant d'investiguer (rien dans les mémoires/dev-tests/BUGS.md actuels
  ne pointe vers un bug header/footer connu et non corrigé au moment de la rédaction de ce document,
  hormis l'absence d'étage 2 pour cette zone — déjà planifiée dans `PROTOCOLE_TEST_MANUEL.md`).

## Recommandation d'ordre d'attaque pour la Beta

1. Items 1-4 (priorité 1) — cœur de la proposition de valeur "facture/contrat" que l'app vise déjà
   (modèles Facture/Contrat déjà dans la galerie), et le plus demandé explicitement ("le plus impactant").
2. Item 26 (fidélité mode Lecture) en continu — déjà commencé, peu coûteux à poursuivre au fil de l'eau
   à chaque nouvelle fonctionnalité plutôt qu'en un seul chantier dédié.
3. Priorité 2 (blocs de contenu) — gain UX visible rapidement, risque technique faible (patron déjà
   maîtrisé : le projet a déjà ajouté plusieurs types de nœuds TipTap avec succès).
4. Priorité 3 (chips réutilisables) — accélère directement la création de modèles contrats/factures,
   effort modéré.
5. Priorité 4/5 selon retours utilisateurs de l'Alpha - plusieurs de ces items (multi-langue, choix de
   modèle conditionnel, fusion de modèles) sont des chantiers de conception produit autant que
   d'implémentation ; privilégier un retour utilisateur avant de s'y engager en profondeur.
