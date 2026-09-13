# Sauvegarde automatique

**Priorité 1.** Toutes les X secondes ou à chaque modification, avec un interrupteur on/off. Demandée
deux fois par l'utilisateur dans sa liste brute (redondance dans la demande elle-même, pas dans ce
plan) — signe probable d'une frustration réelle avec la perte de travail actuelle.

## Ce qui existe déjà

`js/templates.js:save(id, nom, contenuHtml, nomFichierPDF, headerFooterData)` fait déjà tout le travail
d'enregistrement (AddRecord/UpdateRecord Grist) — c'est la fonction à réutiliser telle quelle, PAS à
dupliquer. Le bouton "Enregistrer" existant dans l'UI l'appelle déjà manuellement (`js/main.js`).

## Conception proposée

- Un minuteur (`setInterval` ou plus probablement un `setTimeout` rearmé à chaque frappe, façon
  debounce — cohérent avec le pattern déjà utilisé pour la pagination,
  `HeaderFooterPreview.schedulePaginationRecompute()`, 200ms de debounce) qui appelle
  `Templates.save(...)` avec l'état courant de l'éditeur, uniquement si :
  - la fonctionnalité est activée (nouveau réglage, cf. ci-dessous) ;
  - un modèle est actuellement chargé (`Templates.getCurrentId()` non nul — ne jamais auto-créer un
    nouveau modèle sans nom explicite) ;
  - le contenu a réellement changé depuis la dernière sauvegarde (comparer `Editor.getHTML()` à une
    copie mémorisée après le dernier `save()` réussi, pour éviter des écritures Grist inutiles si
    l'utilisateur ne fait que naviguer/cliquer sans modifier le texte).
- **Réglage on/off** : nouvelle entrée dans le panneau Réglages (`js/settings.js`, même patron que les
  réglages langue/touche de déclenchement déjà existants) + persistance `localStorage` (cohérent avec
  `pp_lang`/`pp_trigger_char` déjà stockés ainsi — préférence d'interface, pas une donnée métier,
  conforme au principe déjà établi dans `README.md` section Sécurité).
- **Intervalle** : configurable (l'utilisateur mentionne "toutes les X secondes OU à chaque modif") —
  proposer les deux modes comme un choix (débounce court ~2-3s après la dernière frappe = "à chaque
  modif" en pratique, vs. un intervalle fixe plus long ~30-60s = "toutes les X secondes") plutôt que
  deux mécanismes séparés à maintenir.
- **Indicateur visuel** : un statut discret ("Enregistré à 14:32" / "Sauvegarde…" / "Échec de la
  sauvegarde automatique") - réutiliser le mécanisme de statut déjà existant dans l'UI
  (`setStatus(...)`, déjà utilisé pour l'export/le chargement de modèle) plutôt qu'en inventer un
  nouveau.

## Risques et questions ouvertes

- **Conflit avec le verrou d'export existant** : `js/main.js` a déjà un `withExportLock()` empêchant un
  double export concurrent (cf. `AUDIT_CODE.md` §4) — vérifier qu'une sauvegarde automatique ne peut
  jamais se déclencher PENDANT un export (état de module partagé côté `pdf-export.js`, même famille de
  précaution) ni pendant une autre sauvegarde déjà en cours (mémoriser une promesse en vol, même
  correctif que celui déjà recommandé pour `getCurrentUserEmail()` dans `AUDIT_CODE.md` §3.3).
- **Coût réseau** : une sauvegarde à chaque frappe (même débattue) sur un document très actif pourrait
  générer beaucoup d'écritures Grist — profiter de cette fonctionnalité pour vérifier qu'un débounce
  raisonnable (quelques secondes d'inactivité) est bien en place plutôt qu'un vrai déclenchement à
  CHAQUE caractère tapé.
- **Historique Undo/Redo** : `Editor.setHTML()` vide l'historique Annuler/Rétablir (comportement
  volontaire, cf. `dev-tests/BUGS.md` Bug 2) — s'assurer que la sauvegarde automatique n'appelle JAMAIS
  `setHTML()` sur le contenu qu'elle vient de lire (elle ne fait que LIRE `Editor.getHTML()` et écrire
  vers Grist, jamais l'inverse) pour ne pas interférer avec l'historique d'édition en cours.
- **En-tête/pied de page en cours d'édition** : si l'utilisateur est en mode édition en-tête/pied
  (`.hf-editing`) au moment où la sauvegarde automatique se déclenche, vérifier quel contenu est
  effectivement sauvegardé (le brouillon en-tête/pied en cours, ou l'état déjà validé) — cohérence à
  établir avec le comportement du bouton "Enregistrer" manuel dans ce même état.

## Plan de test

Activer/désactiver le réglage, taper du texte et vérifier qu'un `UpdateRecord` Grist se déclenche après
le délai attendu (mockable dans le harnais de test comme le reste des appels `grist.docApi`),
vérifier l'absence de sauvegarde quand rien n'a changé, et la coexistence propre avec un export PDF
déclenché manuellement pendant que l'autosave est actif.
