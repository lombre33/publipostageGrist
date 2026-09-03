# Historique des versions

| Version | Date | SHA commit | Description | Statut |
|---|---|---|---|---|
| v0.3 | 2026-09-03 | `a28d0d399217b28f5e709e794d89b5eeac0d75fb` | Version stable validée : correction bug pdfFilenameInput null au changement de modèle, chaîne complète fonctionnelle (édition, sauvegarde/chargement modèle, mode lecture, export PDF, variables inter-tables) | stable |
| v0.4 | À compléter | À compléter | À compléter | en cours |

## Structure pour les prochaines versions

Pour chaque nouvelle version, ajouter une ligne au tableau avec les colonnes suivantes : **version**, **date**, **SHA commit**, **description** et **statut** (`stable`, `en cours` ou `rollback`).

## Points de rollback historiques à éviter

- `6fa93747985` : état avec le bug `"[object Promise]"` en mode lecture — à éviter.
- `342221c27c316b3efb668c47a7d765128c162524` : état avant les 4 correctifs groupés.

> Le commit de versionning qui introduit cette documentation est distinct du commit stable v0.3 référencé ci-dessus.
