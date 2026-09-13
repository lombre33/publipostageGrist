# Blocs conditionnels, choix de modèle conditionnel, fusion conditionnelle de documents

**Priorité 1 (blocs conditionnels) et 5 (choix de modèle conditionnel).** Regroupés dans un seul
document car les trois idées de la liste utilisateur partagent le même besoin fondamental : **évaluer
une condition sur une valeur Grist et en tirer une décision d'affichage/de composition** — seule la
granularité change (un paragraphe / un modèle entier / une séquence de modèles).

## 1. Blocs conditionnels (priorité 1)

### Le problème

Afficher/masquer un paragraphe (ou tout autre bloc) selon une valeur Grist — ex. une clause juridique
spécifique si le client est "Pro", une mention légale si le montant dépasse un seuil.

### Conception proposée

- Attribut sur un bloc top-level (paragraphe, tableau, zone 2-colonnes…) : `data-condition-column`,
  `data-condition-operator` (`=`, `≠`, `>`, `<`, `≥`, `≤`, `contient`, `vide`, `non vide`),
  `data-condition-value`. Réutiliser la même autocomplétion `#` déjà existante pour choisir la colonne
  de référence (probablement la table liée au widget uniquement pour la V1 de cette fonctionnalité —
  une condition sur une table tierce ajouterait une complexité de résolution cross-table à part
  entière, à ne considérer qu'en V2 si demandé).
- UI : un bouton toolbar ("Condition") qui ouvre une petite modale (colonne + opérateur + valeur),
  pose les attributs sur le bloc courant, et l'affiche avec une bordure/pastille distinctive en
  édition (visible mais TOUJOURS affiché en édition — la condition n'a de sens qu'à la résolution,
  cohérent avec le traitement des `#Variable` et du futur bloc répété).
- **Résolution** : dans `js/reader-mode.js` (`render`/`preview`), après avoir accès au `record`
  courant, évaluer chaque bloc portant ces attributs et le retirer du DOM (ou le garder, au choix de
  conception — retirer est plus simple et évite tout résidu dans le PDF) s'il ne remplit pas la
  condition. Comme pour la fonctionnalité "lignes répétées" (`feature-table-rows-from-linked-table.md`),
  faire cette résolution dans `ReaderMode.preview()` (point d'entrée commun lecture+export) évite de
  dupliquer la logique dans `pdf-export.js`.
- **Ordre de résolution** important à définir clairement une fois les 3 nouvelles fonctionnalités
  (répétition, condition, calcul) implémentées : probablement variables calculées → conditions
  (une condition peut porter sur une variable calculée, ex. "si le total dépasse 1000€") → répétition
  (une ligne répétée pourrait elle-même être filtrée par condition, cf. note dans
  `feature-table-rows-from-linked-table.md` sur le filtre optionnel).

### Plan de test

Un modèle avec un bloc conditionnel des deux côtés d'un seuil (une ligne Grist qui remplit la
condition, une qui ne la remplit pas), vérifié aux 3 étages (bloc absent visuellement en lecture ET
dans le PDF quand la condition est fausse, présent avec le bon contenu quand elle est vraie).

## 2. Choix de modèle conditionnel à une variable ("gros module UX")

### Le problème

Choisir AUTOMATIQUEMENT quel modèle utiliser selon une valeur Grist (ex. un modèle de facture
différent selon le pays du client, ou une lettre différente selon le statut du dossier) — plutôt que
de forcer l'utilisateur à sélectionner manuellement le bon modèle avant chaque export.

### Pourquoi l'utilisateur qualifie ça de "gros module UX"

C'est effectivement le plus gros des trois items de ce document : contrairement au bloc conditionnel
(un attribut sur un nœud existant) ou à la variable calculée (une nouvelle sorte de badge), ceci touche
au **flux de sélection de modèle lui-même** (`js/main.js`, `js/templates.js`) — une nouvelle couche de
règles "si [condition sur la ligne courante] alors modèle X" à gérer, éditer, et appliquer AVANT même
que l'éditeur charge un contenu.

### Conception proposée (première ébauche, à affiner avec l'utilisateur avant de s'engager)

- Une nouvelle table interne (même famille que `Publipostage_LiensTables`) stockant des règles
  `{colonne, opérateur, valeur, modèleCible}`, évaluées dans l'ordre à chaque changement de ligne
  Grist sélectionnée (`grist.onRecord`), avant `renderReader`/le chargement de l'éditeur.
- UI de gestion des règles : un nouveau panneau (probablement accessible depuis le sélecteur de
  modèle), même patron que le panneau de gestion des règles de correspondance cross-table déjà
  existant (`js/variables.js`, gestion des `Publipostage_LiensTables`) — **réutiliser ce patron UI**
  plutôt que d'en inventer un nouveau.
- **Question ouverte, à trancher avec l'utilisateur avant de commencer** : ce choix automatique
  s'applique-t-il seulement en mode Lecture/à l'export (le modèle sous-jacent choisi automatiquement,
  mais l'utilisateur peut toujours forcer un autre modèle manuellement), ou remplace-t-il complètement
  le sélecteur manuel ? Impacte fortement la conception UI.

## 3. Fusion conditionnelle de plusieurs documents

### Le problème (reformulation de l'exemple utilisateur)

Assembler à la suite plusieurs modèles dans UN SEUL export PDF, où le CHOIX de quel(s) modèle(s)
inclure dépend d'une condition (ex. notification + annexe, où l'annexe varie selon le projet).

### Conception proposée

C'est une **combinaison** des deux mécanismes ci-dessus, pas une 3ᵉ fonctionnalité isolée :
1. "Fusion de plusieurs modèles en un seul PDF" (item de priorité 4, cf.
   `feature-misc-editor-and-output.md#fusion-de-plusieurs-modèles`) — le mécanisme de base : concaténer
   plusieurs `docDefinition` pdfmake (ou plusieurs blocs de contenu HTML avant résolution) en un seul
   export.
2. Appliquer la logique de "choix de modèle conditionnel" (ci-dessus) à CHAQUE ÉLÉMENT de la séquence
   de fusion plutôt qu'au modèle unique global — ex. une liste ordonnée de "slots" (notification
   toujours incluse, annexe choisie selon condition) plutôt qu'un simple choix de modèle unique.

**Recommandation** : implémenter d'abord la fusion simple (sans condition) et le choix de modèle
conditionnel (sans fusion) comme deux briques indépendantes et testées séparément, puis composer les
deux pour ce cas d'usage — plus sûr que d'attaquer directement le cas combiné.
