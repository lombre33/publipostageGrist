# Historique des versions

| Version | Date | SHA commit | Description | Statut |
|---|---|---|---|---|
| 0.3-rollback | 2026-09-03 | `fac4bd683579a835b4ded6bfcfcc92dac720c7d7` | Rollback propre de `05f57a1b45ac39548f18bb70f1065c8dcfcd5ca5` vers l’état fonctionnel de `d6de3383e35e334b52754283df2454c283708dfa`, avec indicateur « Ligne courante » conservé | Poussé sur `main`, tests statiques effectués |
| 0.3-dynamic-selection | — | — | Correctif isolé de détection dynamique sans SELECT BY | À implémenter après validation manuelle du rollback |

## Référence stable

- Commit stable v0.3 historique : `a28d0d399217b28f5e709e794d89b5eeac0d75fb`.
- Commit fonctionnel retenu pour le rollback : `d6de3383e35e334b52754283df2454c283708dfa`.
- Commit régressif retiré de l’état de travail : `05f57a1b45ac39548f18bb70f1065c8dcfcd5ca5` (polling `getSelectedRows()`).

## État fonctionnel après rollback

L’éditeur, la sauvegarde/suppression de modèles, l’export PDF, la résolution des variables inter-tables, les abonnements `onRecord`/`onRecords` et les boutons de changement de mode sont conservés dans `js/main.js` et `js/grist-api.js`. L’indicateur de diagnostic `Ligne courante` reste actif.

## Correctif dynamique à venir

Ne pas réintroduire le polling de `getSelectedRows()` tel quel : la documentation Custom Widget officielle décrit `onRecord` comme l’événement de changement de curseur et `onRecords` comme l’événement de changement des enregistrements sélectionnés. Le prochain correctif doit être isolé, conditionnel et testé dans Grist avant activation par défaut.

## Points de rollback historiques à éviter

- `05f57a1b45ac39548f18bb70f1065c8dcfcd5ca5` : polling autonome ayant provoqué des régressions.
