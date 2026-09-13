# Lignes de tableau générées depuis une table liée

**Priorité 1 — identifiée par l'utilisateur comme "le plus impactant".** Non commencée, ce document
est une conception technique pour permettre une implémentation autonome future.

## Le problème que ça résout

Aujourd'hui, une `#Variable` ramène **une valeur unique** de la ligne Grist courante. Pour une
facture/un devis, il faudrait qu'une ligne de tableau se répète automatiquement pour chaque ligne
d'une table liée (produits, prestations, lignes de commande…) — impossible aujourd'hui sans dupliquer
manuellement des lignes de tableau, ce qui casse tout l'intérêt du publipostage pour ce cas d'usage
(le plus courant pour une facture réelle).

## Ce qui existe déjà et rend cette fonctionnalité moins coûteuse qu'il n'y paraît

- **`GristAPI.fetchTableRows(tableId)`** (`js/grist-api.js:302`) — renvoie déjà toutes les lignes d'une
  table sous forme de tableau d'objets `{colonne: valeur}`. C'est exactement le primitive de données
  dont cette fonctionnalité a besoin, déjà écrit et testé (utilisé aujourd'hui pour la résolution
  cross-table classique).
- **Le mécanisme de règle de correspondance entre tables** (`GristAPI.getLinkRule`/`saveLinkRule`/
  `findReferenceColumns`, `js/grist-api.js:262-379`, table interne `Publipostage_LiensTables`) résout
  déjà "comment relier la table courante à une table cible" (colonne Référence explicite, choisie par
  l'utilisateur une seule fois via une modale avec aperçu) — précisément le problème "quelles lignes de
  la table Produits appartiennent à CETTE facture" qu'il faut résoudre ici. **Ne pas réinventer ce
  mécanisme** : le réutiliser tel quel pour déterminer la relation Facture → Lignes de produits.
- **`js/reader-mode.js`** résout déjà les variables via un motif "trouver le badge, calculer sa
  valeur, remplacer le nœud DOM" (`resolveBadgeNode`, `resolveVariableImages`, `resolveSmartChips`) —
  le nouveau mécanisme de répétition doit suivre ce même motif plutôt qu'une architecture parallèle.

## Conception proposée

### 1. Un nouveau nœud TipTap : "ligne de tableau répétée" (ou "bloc répété")

Le choix le plus simple et le plus proche du besoin réel (factures) : permettre de marquer **une ligne
de tableau** (ou, plus généralement, un bloc top-level type paragraphe) comme "à répéter pour chaque
ligne de [Table liée]". Techniquement :

- Nouvel attribut sur la ligne de tableau (`tr`) ou un wrapper dédié : `data-repeat-table="Produits"`
  (ou un id de règle de liaison, cf. ci-dessous) + `data-repeat-source="rowMarker"`.
- À l'intérieur de cette ligne/de ce bloc, les `#Variable` insérées ne référencent PAS la table
  courante mais la table liée (`Produits.Designation`, `Produits.PrixUnitaire`…) — l'autocomplétion
  `#` doit pouvoir cibler cette "table de boucle" quand le curseur est à l'intérieur du bloc répété
  (nécessite que `js/variables.js` sache détecter "je suis dans un bloc répété, la table par défaut de
  l'autocomplétion change" — même famille de problème que la détection colonne/cellule de tableau déjà
  gérée ailleurs dans le fichier).

### 2. Configuration de la relation (réutilise le mécanisme existant)

Au moment où l'utilisateur insère un bloc répété (nouveau bouton toolbar, ex. dans le menu tableau :
"Ligne répétée depuis une table liée"), demander la table cible, puis appeler EXACTEMENT le même flux
que la résolution cross-table classique (`GristAPI.getLinkRule(tableCible)` → si absent, ouvrir la
modale de configuration existante). Aucune nouvelle UI de liaison à construire.

### 3. Résolution en mode Lecture / export PDF

C'est la partie réellement nouvelle. Pour chaque bloc marqué `data-repeat-table` :
1. Résoudre la règle de liaison (déjà existante) pour obtenir les lignes de la table cible
   correspondant à la ligne courante (filtrer `fetchTableRows(tableCible)` par la colonne Référence de
   la règle, ou — cas "ligne unique" déjà supporté par le mécanisme existant — prendre toutes les
   lignes si la règle est de ce type simplifié, bien que ce cas ait moins de sens pour une répétition).
2. Pour CHAQUE ligne trouvée, cloner le bloc/la ligne de tableau, résoudre les `#Variable` internes
   avec les valeurs de CETTE ligne (au lieu de la ligne "courante" habituelle) — réutiliser
   `resolveBadgeNode` en lui passant un `record`/`tableId` différents de ceux du document principal.
3. Remplacer le bloc marqueur par la séquence de clones résolus.

**Mode Lecture** (`js/reader-mode.js:render`/`preview`) : ajouter cette étape après `resolveBadgeNode`
mais avant `resolveSmartChips` (ordre à vérifier empiriquement — priser la cohérence avec l'ordre déjà
établi pour les autres résolutions).

**Export PDF** (`js/pdf-export.js`) : point plus délicat — `htmlToPdfContent`/`buildPdfContentFromRoot`
travaillent sur le HTML déjà résolu (post-`ReaderMode.preview()`, cf. `resolveNativePdfContent`), donc
si la résolution ci-dessus est ajoutée à `ReaderMode.preview()` (qui EST déjà le point d'entrée commun
lecture+export, confirmé dans `README.md`/`AUDIT_CODE.md` §3.2), le PDF héritera automatiquement du
mécanisme sans changement dans `pdf-export.js` lui-même pour la RÉSOLUTION — seul le rendu d'un
TABLEAU dont le nombre de lignes n'est connu qu'à la résolution (pas dans le HTML du modèle édité) doit
être vérifié (le tableau final, une fois résolu, est un `<table>` HTML standard avec le bon nombre de
`<tr>` — `tableFrom` (`pdf-export.js`) ne devrait rien avoir de spécial à gérer si la résolution a bien
eu lieu EN AMONT, dans le HTML qu'il reçoit).

### 4. Affichage en mode Édition

En édition, le bloc répété doit rester visuellement comme UN SEUL bloc représentatif (pas de
résolution réelle, pas d'accès aux vraies données de la table liée nécessaire) — afficher un badge/une
bordure distinctive ("↻ Répété pour chaque ligne de Produits") plutôt qu'essayer de prévisualiser les
N lignes réelles (cohérent avec le choix déjà fait pour les `#Variable` classiques, qui restent des
badges non résolus en édition).

## Risques et questions ouvertes à trancher avant implémentation

- **Formules/totaux** : une facture a presque toujours un total qui SOMME les lignes répétées (ex.
  somme des `PrixUnitaire × Quantite`) — recoupe directement la fonctionnalité "Variables calculées"
  (priorité 1 également, cf. `feature-calculated-variables.md`). Les deux fonctionnalités devraient
  être conçues ENSEMBLE : une "variable calculée" doit pouvoir référencer "la somme de [colonne] sur
  toutes les lignes répétées de ce bloc", pas seulement deux `#Variable` scalaires.
- **Tri/filtre des lignes répétées** : la boucle "prendre toutes les lignes d'une colonne qui
  respectent une condition" (item scattered de la liste utilisateur, ex. "afficher une liste de
  participants") est le MÊME besoin que celui-ci, avec en plus un filtre conditionnel (pas juste "les
  lignes liées", mais "les lignes liées ET qui remplissent une condition") — à concevoir comme une
  option du même mécanisme (un filtre optionnel sur le bloc répété), pas une fonctionnalité séparée.
- **Nombre de lignes variable → mise en page** : contrairement à tout le reste de l'éditeur (où la
  pagination se calcule sur un contenu connu à l'avance), un bloc répété change le nombre réel de
  blocs SEULEMENT à la résolution — la pagination doit être recalculée POST-résolution (déjà le cas
  architecturalement : la pagination PDF se calcule après `ReaderMode.preview()`, donc pas de
  changement de principe nécessaire, juste à vérifier empiriquement une fois implémenté).
- **Table liée vide ou relation non configurée** : définir un comportement explicite (bloc simplement
  absent du rendu ? ligne "aucune donnée" ? erreur visible comme pour une `#Variable` cassée
  aujourd'hui) — cohérence à établir avec le traitement d'erreur déjà existant pour une `#Variable`
  invalide (`resolveBadgeNode` a déjà un état d'erreur visuel, `isError`, à réutiliser comme modèle).

## Plan de test (à écrire une fois implémenté)

Suivre le motif déjà établi cette session (`dev-tests/scenarios-readmode-fidelity.js`,
`dev-tests/scenarios-pdf-ground-truth.js`) : un nouveau fichier `dev-tests/scenarios-repeated-rows.js`
avec, au minimum : 0/1/plusieurs lignes liées, une ligne liée manquante (relation non configurée),
vérification 3 étages (édition = badge représentatif, lecture = lignes réellement résolues, PDF =
mêmes lignes, mêmes valeurs, tableau bien formé).
