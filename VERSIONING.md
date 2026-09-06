# Historique des Versions

Les versions stables sont créées lors d'une livraison explicitement demandée. Chaque entrée pointe vers un tag Git permettant le rollback.

---

## Versions Stables

| Version | Date | SHA Commit | Statut | Description |
|---------|------|-----------|--------|-------------|
| v0.4 | 2026-09-05 | `3b6fc3af` | **stable** ✓ | Rollback au commit 886e74d - restauration état stable après régression |
| v0.5 | 2026-09-06 | `02632d95` | **stable** ✓ | Alignement indépendant par cellule (tableau) et par colonne (2-colonnes) ; formats gras/italique/souligné/barré/taille/police dans les cellules ; export PDF vectorisé respectant l'alignement par colonne ; nouveau module image (upload PJ Grist ou URL, redimensionnement, opacité). |

---

## Notes

- Chaque version stable doit être documentée avec son commit SHA exact
- Les versions en développement seront ajoutées après validation explicite
- Rollback : `git fetch origin --tags && git checkout tags/v0.5` (ou `git reset --hard tags/v0.5` sur une branche de restauration).
- Le tag de la version stable est créé sur le commit final de livraison.
