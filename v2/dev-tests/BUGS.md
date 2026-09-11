# Anomalies trouvées — état au 2026-09-12

Historique : les 2 premières anomalies ci-dessous ont été trouvées en
construisant la suite de tests automatisés (`v2/dev-tests/`, ~76 scénarios).
Une 3e a été trouvée dans une passe de test dédiée, plus poussée, sur la
position des images "au cœur du texte" dans l'export PDF (demande explicite
de vérifier ce point après un retour d'expérience "j'avais plein de bug
moi").

---

## Bug 1 — "Taille d'origine" (image) : **INVALIDÉ, c'était un artefact du test**

Le test original simulait un "redimensionnement" en mutant `img.style.width`
**directement en JavaScript**, sans jamais passer par ProseMirror. Le modèle
gardait donc sa largeur d'origine (déjà 320px) ; le clic sur "Taille
d'origine" appliquait alors un patch strictement identique aux attributs déjà
en place, et ProseMirror (qui compare les nœuds via `Node.eq()`) n'appelait
jamais le callback `update()` de la NodeView — le `<img>` gardait donc son
style muté "à la main", en dehors de tout mécanisme réel de l'éditeur.

Vérifié avec un **vrai** redimensionnement (poignée glissée, ou clics
zoom avant répétés — les deux commitent bien la largeur dans le modèle) :
le clic "Taille d'origine" met à jour l'affichage ET le modèle ensemble,
sans aucun problème. Test corrigé dans `scenarios-images.js:img_reset_size`
pour utiliser un vrai zoom avant avant de cliquer reset — passe maintenant.

**Aucune correction nécessaire côté application.**

---

## Bug 2 — `Editor.setHTML()` ne vidait jamais l'historique Annuler/Rétablir : **CORRIGÉ**

### Ce qui était cassé

Changer de modèle (`Editor.setHTML()`, chemin réel de "Nouveau modèle"/
sélecteur de modèle, cf. `v2/js/main.js`) n'effaçait jamais la pile
Annuler/Rétablir de TipTap. Après avoir chargé un modèle B, appuyer sur
Annuler pouvait faire réapparaître le contenu du modèle A précédent (ou,
constaté en test prolongé, un contenu bien plus ancien) — la pile
s'accumule sur toute la durée de vie de l'éditeur.

### Correction appliquée

TipTap v3 (version utilisée par ce projet, `3.31.3`) a remplacé l'ancienne
extension `@tiptap/extension-history` par un "undoRedo" interne
(`@tiptap/extensions`) qui n'expose **plus aucune commande `clearHistory`**
(vérifié directement dans le paquet publié — seules `undo`/`redo` existent).
La solution habituelle "appeler `clearHistory`" documentée précédemment ici
ne s'applique donc pas à cette version.

Ajouté à la place une petite extension maison (`createClearHistoryExtension`,
`v2/js/editor.js`) qui reconstruit l'`EditorState` avec les MÊMES plugins
(même schéma, même document, mêmes plugins) via `EditorState.create(...)` +
`view.updateState(...)` — ce qui réinitialise l'état de TOUS les plugins,
historique inclus, sans recréer la vue ni perdre le contenu en cours.
Appelée automatiquement dans `Editor.setHTML()` juste après `setContent()`.

Vérifié : après deux `Editor.setHTML()` successifs (simulant un changement
de modèle réel), Annuler ne fait plus RIEN (comportement correct - un
chargement de modèle n'est pas annulable) ; le undo/redo normal PENDANT une
session d'édition (plusieurs frappes dans le MÊME modèle) continue de
fonctionner sans régression. Suite de tests `formatting` (15/15) et `tables`
(7/7) toujours au vert après ce changement.

---

## Bug 3 — Une image "au cœur du texte" SANS alignement gauche/droite sautait toujours en fin de texte de son paragraphe dans le PDF : **CORRIGÉ**

**Sévérité : élevée.** C'était très probablement la cause des problèmes de
position d'image rapportés ("j'avais plein de bug moi" sur les exports,
confirmé par l'utilisateur).

### Ce qui fonctionne (pas de bug)

- Une image "au cœur du texte" avec un alignement **gauche** ou **droit**
  (bouton d'alignement gauche/droit dans la barre d'outils flottante de
  l'image) est correctement transformée en habillage de texte dans le PDF
  (le texte se place à côté de l'image, comme dans l'éditeur) — vérifié.

### Ce qui est cassé

Une image "au cœur du texte" **sans alignement gauche/droit** — c'est-à-dire
soit l'alignement par défaut (aucun bouton d'alignement cliqué après
insertion), soit l'alignement **centré** explicite — est TOUJOURS repoussée
à la fin de tout le texte de son paragraphe dans le PDF, quelle que soit sa
position réelle dans l'éditeur (début de phrase, milieu, fin). Le fait de
basculer "ligne/bloc" (bouton "wrap") ne change rien : cet attribut n'est
jamais lu par l'export PDF (vérifié par recherche dans le code).

### Repro

1. Taper un texte, par exemple "AAA ".
2. Insérer une image (bouton "Ajouter une image") juste après ce texte,
   SANS cliquer aucun bouton d'alignement gauche/droit sur sa barre d'outils
   flottante (laisser l'alignement par défaut, ou cliquer "Centrer").
3. Continuer à taper juste après l'image, dans le MÊME paragraphe, par
   exemple " BBB".
4. Exporter en PDF (qualité vectorielle).

### Résultat observé (bug)

Dans l'éditeur, l'ordre visuel est bien "AAA [image] BBB" (l'image est
visuellement entre les deux). Dans le PDF exporté, le texte apparaît
regroupé EN UN SEUL BLOC ("AAA BBB", concaténé, sans que l'image se soit
jamais trouvée entre les deux), et l'image apparaît ENSUITE, en dessous de
TOUT le texte du paragraphe — peu importe qu'elle ait été insérée au début,
au milieu ou à la fin du texte réel.

Constaté aussi dans le cas extrême "image en tout début de paragraphe, texte
seulement après" : le texte apparaît quand même EN PREMIER dans le PDF, et
l'image APRÈS — un renversement complet de l'ordre réel du document.

### Ce qui était cassé (repro historique)

1. Taper un texte, par exemple "AAA ".
2. Insérer une image (bouton "Ajouter une image") juste après ce texte,
   SANS cliquer aucun bouton d'alignement gauche/droite sur sa barre d'outils
   flottante (laisser l'alignement par défaut, ou cliquer "Centrer").
3. Continuer à taper juste après l'image, dans le MÊME paragraphe, par
   exemple " BBB".
4. Exporter en PDF (qualité vectorielle).

Le texte apparaissait regroupé EN UN SEUL BLOC ("AAA BBB", concaténé), et
l'image apparaissait ENSUITE, en dessous de TOUT le texte du paragraphe —
peu importe qu'elle ait été insérée au début, au milieu ou à la fin du texte
réel.

### Correction appliquée

`v2/js/pdf-export.js` : seul le cas `layer==='normal' && (align==='left' ||
align==='right')` passait déjà par le mécanisme d'habillage `columns`
(`floatedImageParagraphFrom`). Dans TOUS les autres cas (pas d'alignement,
ou `align==='center'`), `blockFrom()` retombait sur le chemin générique où
`inlineRuns()` collectait TOUT le texte dans un tableau `runs` d'un côté, et
les images dans un tableau `images` séparé — sans jamais mémoriser leur
position relative au texte — d'où l'image systématiquement repoussée après
tout le texte.

Corrigé en deux temps :
1. `inlineRuns()` insère désormais un marqueur de position (`_imageMarker`)
   dans le flux de `runs`, exactement à l'endroit où l'image a été
   rencontrée pendant le parcours du DOM, en plus de continuer à pousser
   l'image elle-même dans le tableau `images` séparé (inchangé).
2. `blockFrom()`, pour un `<p>`/`<div>` simple contenant à la fois du texte
   ET une telle image, découpe maintenant le paragraphe en PLUSIEURS blocs
   pdfmake successifs (texte-avant, image, texte-après...) à la place d'un
   bloc unique — reconstituant l'ordre réel du document. Les autres cas
   (titre, élément de liste, citation, sous-liste imbriquée) gardent
   l'ancien comportement inchangé (images toujours poussées après le texte)
   pour ne rien casser là où ce n'était pas signalé.

pdfmake n'a de toute façon aucun support d'image réellement EN LIGNE (elle
ne peut jamais apparaître au milieu d'une même ligne de texte, cf.
commentaire existant en tête de `blockFrom`) — mais l'ORDRE réel
(texte-avant / image / texte-après, en blocs séparés plutôt qu'un bloc-texte
fusionné suivi de l'image) est maintenant respecté, ce qui est le maximum
fidèle réalisable sans un vrai support d'image inline dans pdfmake.

Une zone 2-colonnes réutilise ce même `blockFrom()` pour le contenu de
chaque colonne (via `htmlToPdfContent`) — corrigé automatiquement aussi.
**Non couvert par cette correction** : une image "au cœur du texte" à
l'intérieur d'une CELLULE de tableau garde l'ancien comportement (chemin de
code séparé, `cellContentFrom`/`cellLineToPdfObject`, déjà documenté comme
une limitation connue dans son propre commentaire) — pas signalé par
l'utilisateur pour l'instant, à traiter séparément si besoin.

Vérifié par un nouveau test de régression
(`scenarios-pdf-fidelity.js:pdffid_inline_image_position_in_paragraph`,
maintenant vert) et par une passe complète de la suite (images, tableaux,
2-colonnes, imbrications, sauts de page/sommaire, en-têtes/pieds de page,
fidélité PDF - aucune régression).
