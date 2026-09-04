# Historique des versions

| Version | Date | SHA commit | Description | Statut |
|---|---|---|---|---|
| v1.4.0 | 2026-09-04 | À compléter | Ajout d'une fonctionnalité « Saut de page forcé à l'export PDF » : nouveau Blot Quill `PageBreakBlot` (BlockEmbed non-éditable, classe `.page-break-marker`, label « — Saut de page — ») inséré via un bouton toolbar custom ; `pdf-export.js` active l'option html2pdf `pagebreak: { mode: ['css','legacy'], avoid: '.var-badge' }` qui découpe le PDF sur chaque marqueur (CSS `page-break-after: always`). Le marqueur est sérialisé via le même mécanisme que les autres blots Quill (survit à la sauvegarde / rechargement d'un modèle) et n'interfère pas avec le remplacement des variables `#Table_Colonne` en mode lecture. Aucune régression sur l'édition riche, l'autocomplete, la toolbar existante, le mode lecture ou l'export PDF actuel. | en cours |
| v1.3.0 | 2026-09-04 | À compléter | Rollback vers la version stable 8c4f7011 + retrait définitif du bandeau d’avertissement Select By en mode lecture | en cours |
| v1.1.2 | 2026-09-04 | À compléter | Correctif fiable de la détection du « Select By » : état interne recalculé à chaque `onRecord`, notification `onSelectByChange`, et message sorti du texte rendu vers un bandeau DOM dédié `#reader-warning-banner`. Cause corrigée : lecture d'un mapping encore absent/stale lors du rendu. Les fonctions d'édition, autocomplete, modèles et export PDF restent inchangées. | en cours |
| v1.1.1 | 2026-09-04 | À compléter | Ajout d’un message d’aide contextuel en mode lecture lorsque aucun lien « Select By » n’est détecté, avec rappel de la table détectée et sans polling | en cours |
| v0.5-rollback | 2026-09-03 | À compléter | Abandon de la tentative de détection sans « SELECT BY » via polling : régression avec disparition des données lorsque « SELECT BY » est configuré et absence d’affichage sans « SELECT BY ». Le widget nécessite donc actuellement la configuration « SELECT BY » pour fonctionner correctement. | rollback |
| v0.3 | 2026-09-03 | `a28d0d399217b28f5e709e794d89b5eeac0d75fb` | Version stable validée : correction bug pdfFilenameInput null au changement de modèle, chaîne complète fonctionnelle (édition, sauvegarde/chargement modèle, mode lecture, export PDF, variables inter-tables) | stable |
| v0.4 | 2026-09-03 | À compléter | Correctif mode lecture : invalidation des rendus asynchrones obsolètes lors d'un changement de ligne sélectionnée | en cours |

## Structure pour les prochaines versions

Pour chaque nouvelle version, ajouter une ligne au tableau avec les colonnes suivantes : **version**, **date**, **SHA commit**, **description** et **statut** (`stable`, `en cours` ou `rollback`).

## Points de rollback historiques à éviter

- `6fa93747985` : état avec le bug `"[object Promise]"` en mode lecture — à éviter.
- `342221c27c316b3efb668c47a7d765128c162524` : état avant les 4 correctifs groupés.

> Le commit de versionning qui introduit cette documentation est distinct du commit stable v0.3 référencé ci-dessus.
