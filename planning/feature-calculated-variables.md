# Variables calculées

**Priorité 1.** Une simple somme/soustraction (voire multiplication/division) entre deux ou plusieurs
`#Variable`, sans passer par une formule Grist — ex. `sous-total + TVA = total` directement dans le
modèle de document.

## Pourquoi pas "juste ajouter une colonne formule dans Grist" ?

C'est la question à se poser en premier avec l'utilisateur si ce n'est pas déjà tranché : Grist sait
déjà faire des colonnes calculées nativement. La valeur ajoutée d'une "variable calculée" CÔTÉ WIDGET
est probablement : (a) ne pas obliger l'utilisateur à modifier le schéma de sa table Grist juste pour
un document ponctuel, (b) permettre un calcul qui combine des colonnes de **tables différentes** (ex.
une valeur de la table liée + une valeur d'une table tierce, cf. résolution cross-table déjà
existante) sans créer de colonne formule cross-table dans Grist (plus complexe côté Grist natif). À
confirmer avec l'utilisateur avant de s'engager sur la conception exacte — la réponse influence
fortement la portée (simple expression sur DEUX variables scalaires vs. mini-langage d'expression
général).

## Conception proposée (portée minimale raisonnable)

- Nouveau type de badge, inséré via le panneau `#` (à côté des chips intelligents déjà existants) :
  une "variable calculée" qui contient une petite expression arithmétique référençant d'autres
  `#Variable` par leur clé (`#Facture.SousTotal + #Facture.SousTotal * 0.20`, ou une syntaxe plus
  courte à définir).
- Stockage : le badge porte l'expression telle quelle en attribut (`data-formula="..."`), pas une
  valeur pré-calculée — la résolution se fait à l'affichage/export, exactement comme les autres
  variables (cohérent avec le principe déjà établi : rien n'est figé dans le modèle).
- **Réutiliser `variable-format.js`** pour le FORMATAGE du résultat (nombre, devise, nombre en toutes
  lettres — `formatNumber`/`numberToWordsFr`/`numberToWordsEn` existent déjà) : une variable calculée
  doit pouvoir s'afficher formatée exactement comme une variable normale, pas dans un format brut
  différent.
- **Évaluation** : un mini-évaluateur d'expression arithmétique (PAS `eval()` — risque XSS si le
  gabarit vient d'un collaborateur, cohérent avec la vigilance déjà appliquée ailleurs dans le projet
  vis-à-vis de l'injection, cf. `AUDIT_CODE.md` §3.2/§9). Portée minimale : `+ - * /` et parenthèses
  entre des références `#Variable` et des littéraux numériques — un parseur à la main de ce sous-
  ensemble est simple (quelques dizaines de lignes) et évite toute dépendance externe/tout risque
  d'exécution de code arbitraire.
- **Résolution** : dans `js/reader-mode.js`, après la résolution des `#Variable` normales (une
  variable calculée a besoin des valeurs déjà résolues des variables qu'elle référence) — attention à
  l'ORDRE si une variable calculée peut elle-même référencer une AUTRE variable calculée (probablement
  à interdire en V1 pour éviter les dépendances circulaires, plutôt qu'à gérer un graphe de
  dépendances dès le départ).

## Lien avec "lignes de tableau depuis une table liée"

Comme noté dans `feature-table-rows-from-linked-table.md` : le cas d'usage le plus probable pour une
variable calculée dans une vraie facture est un **total sur toutes les lignes répétées**, pas juste
deux variables scalaires (`#Facture.SousTotal + #Facture.TVA` fonctionne pour un total simple, mais
"la somme de `PrixUnitaire × Quantite` sur toutes les lignes de `Produits`" est un besoin
qualitativement différent — une agrégation, pas une expression scalaire). **Recommandation** :
concevoir les deux fonctionnalités ensemble dès le départ, quitte à livrer d'abord la version scalaire
simple (item de cette fiche) puis étendre à l'agrégation une fois le bloc répété en place — mais garder
en tête dès la conception de l'évaluateur d'expression qu'il devra un jour comprendre une syntaxe
d'agrégation (`SOMME(Produits.PrixUnitaire * Produits.Quantite)` ou équivalent).

## Plan de test

Une variable calculée simple (addition de 2 variables), une avec parenthèses/priorité d'opérateurs,
une référençant une variable manquante/invalide (comportement d'erreur cohérent avec celui des
`#Variable` classiques), vérifiée aux 3 étages avec un format d'affichage (devise) appliqué.
