# Historique des Versions

Les versions stables sont créées lors d'une livraison explicitement demandée. Chaque entrée pointe vers un tag Git permettant le rollback.

---

## Versions Stables

| Version | Date | SHA Commit | Statut | Description |
|---------|------|-----------|--------|-------------|
| v0.4 | 2026-09-05 | `3b6fc3af` | **stable** ✅ | Rollback au commit 886e74d - restauration état stable après régression |
| v0.5 | 2026-09-06 | `02632d95` | **stable** ✅ | Alignement indépendant par cellule (tableau) et par colonne (2-colonnes) ; formats gras/italique/souligné/barré/taille/police dans les cellules ; export PDF vectorisé respectant l'alignement par colonne ; nouveau module image (upload PJ Grist ou URL, redimensionnement, opacité). |
| v0.6 | 2026-09-06 | `e7f65706` | **stable** ✅ | Correction bug upload image (readOnly) + UI resize/drag/toolbar image. |
| v0.7 | 2026-09-06 | `79ff7638` | **stable** ✅ | Second rollback correctif vers `79ff76383c42ee1b414756be2369ec12d0f5c1b0`, nouvelle référence stable. Le rollback précédent était erroné : il était allé trop loin jusqu'à v0.6 au lieu de restaurer ce commit, qui contenait déjà le correctif des formats de toolbar dans les cellules de tableau. |
| v0.8 | 2026-09-07 | `d38868b` | **stable** ✅ | Export PDF vectoriel fidèle à l'éditeur pour le module image (position, taille, police, interligne) : validé sans déformation ni décalage perceptible par l'utilisateur sur l'export. Correctifs successifs qui y mènent : marge de page comptée deux fois pour une image en calque, interligne pdfmake mal calibré par rapport au rendu navigateur, largeur du mode "Aperçu format A4" fausse (padding compté deux fois), taille de police par défaut du PDF non alignée sur celle de l'éditeur (11pt vs 10.5pt réel), espace parasite en tête de paragraphe centré/justifié, police Roboto chargée pour l'éditeur (matcher celle du PDF, pas l'inverse), bug de désynchronisation Quill après `setHTML()` (image insérée juste après un chargement de modèle pouvait atterrir dans le mauvais bloc), et ancrage d'une image en calque par proximité visuelle plutôt que par imbrication DOM (une image glissée loin de son paragraphe d'origine restait ancrée sur celui-ci). Un harnais de test réutilisable (`dev-tests/`) couvre désormais cette matrice de cas pour les futurs correctifs. **Bugs connus, hors périmètre de cette version** : le glisser-déposer d'une image en calque peut se rompre après certaines manipulations (parfois avec duplication de l'image), et l'alignement gauche/centre/droite du texte devient inutilisable une fois le déplacement d'une image commencé — en cours de correction. |

---

## Notes

- Chaque version stable doit être documentée avec son commit SHA exact
- Les versions en développement seront ajoutées après validation explicite
- Rollback : `git fetch origin --tags && git checkout tags/v0.5` (ou `git reset --hard tags/v0.5` sur une branche de restauration).
- Le tag de la version stable est créé sur le commit final de livraison.

- **2026-09-06** : Rollback effectué sur `main` vers la version stable **v0.6** (commit `e7f65706ff137910aabe5988d555fa9d6c104335`) suite à des régressions critiques : JS cassé après ajout du module image (erreur « Conteneur éditeur introuvable : #editor-container » levée depuis `Editor.init`). Fichiers restaurés :
  - `js/editor.js` — 29329 octets — blob `cfaf6aca6b7d2b1089cb521f2b87a9b6e3c54c7d`
  - `css/style.css` — 6401 octets — blob `ee7b1e9b2da701fb9d17c7cf4d43910399a4a685`
  - `css/style.css.tmp_append` (recréé) — 1586 octets — blob `7f6e2772611b345a63e0cc6edaf01097da398e9a`

- **2026-09-06** : Second rollback correctif demandé vers `79ff76383c42ee1b414756be2369ec12d0f5c1b0`. Cette restauration est la référence stable visée ; le rollback v0.6 précédent était erroné et avait supprimé le correctif des formats de toolbar dans les cellules de tableau.
