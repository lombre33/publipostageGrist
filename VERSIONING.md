# Historique des versions

| Version | Date | SHA commit | Description | Statut |
|---|---|---|---|---|
| v0.5-rollback | 2026-09-03 | À compléter | Abandon de la tentative de détection sans « SELECT BY » via polling : régression avec disparition des données lorsque « SELECT BY » est configuré et absence d'affichage sans « SELECT BY ». Le widget nécessite donc actuellement la configuration « SELECT BY » pour fonctionner correctement. | rollback |
| v0.3 | 2026-09-03 | `a28d0d399217b28f5e709e794d89b5eeac0d75fb` | Version stable validée : correction bug pdfFilenameInput null au changement de modèle, chaîne complète fonctionnelle (édition, sauvegarde/chargement modèle, mode lecture, export PDF, variables inter-tables) | stable |
| v0.4 | 2026-09-03 | À compléter | Correctif mode lecture : invalidation des rendus asynchrones obsolètes lors d'un changement de ligne sélectionnée | en cours |
| v0.6-rollback-polling | 2026-09-04 | `5e91279899b9ee7f02a9aacea11eb80e21f14982` | Rollback du polling autonome (non désiré par l'utilisateur) + fix crash getTable().then ; retour à la détection événementielle stable basée sur grist.onRecord et grist.getTable() (await, pas .then direct). | rollback |

## Structure pour les prochaines versions

Pour chaque nouvelle version, ajouter une ligne au tableau avec les colonnes suivantes : **version**, **date**, **SHA commit**, **description** et **statut** (`stable`, `en cours` ou `rollback`).

## Points de rollback historiques à éviter

- `6fa93747985` : état avec le bug `"[object Promise]"` en mode lecture — à éviter.
- `342221c27c316b3efb668c47a7d765128c162524` : état avant les 4 correctifs groupés.
- `da07c328e697ed577494d7cb8564a1401efcb7ef` : état avec polling autonome (setInterval + fetchSelectedRecord) et appel fautif getTable().then() — non désiré par l'utilisateur, à éviter.

> Le commit de versionning qui introduit cette documentation est distinct du commit stable v0.3 référencé ci-dessus.
