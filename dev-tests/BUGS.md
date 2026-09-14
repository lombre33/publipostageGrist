# Anomalies trouvées — état au 2026-09-14 (mis à jour)

Historique : les 2 premières anomalies ci-dessous ont été trouvées en
construisant la suite de tests automatisés (`dev-tests/`, ~76 scénarios).
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
sélecteur de modèle, cf. `js/main.js`) n'effaçait jamais la pile
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
`js/editor.js`) qui reconstruit l'`EditorState` avec les MÊMES plugins
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

`js/pdf-export.js` : seul le cas `layer==='normal' && (align==='left' ||
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

**Régression corrigée le jour même** : le premier correctif posait le
marqueur `_imageMarker` dans TOUT appel à `inlineRuns()`/
`inlineRunsExcludingNestedLists()`, mais seul `blockFrom()` (flux principal)
savait le retirer avant de construire un `text:` pdfmake. Les 5 AUTRES
appelants (cellule de tableau via `cellContentFrom`/`cellLineToPdfObject`,
extraction de texte pour l'habillage gauche/droite via
`extractRunsBetweenRaw`/`floatedImageParagraphFrom`) laissaient ce marqueur
fuiter tel quel dans un tableau `text:` - pdfmake plantait alors
silencieusement sur N'IMPORTE QUEL document contenant une image (même une
déjà habillée gauche/droite, qui marchait très bien avant ce correctif),
avec `Unrecognized document structure: {"_imageMarker":true}` dans la
console, et le bouton "Export PDF" (qualité vectorielle) ne déclenchait plus
rien. Signalé par l'utilisateur immédiatement après déploiement. Corrigé en
ajoutant un filtrage explicite (`stripImageMarkers()`, nouvelle fonction
utilitaire) à ces 5 points d'appel. Revérifié : suite complète (~85 tests)
+ génération d'un vrai blob PDF (`PdfExport.getNativePdfBlobForRecord`) sur
un document combinant image "au cœur du texte", image habillée gauche, ET
image dans une cellule de tableau - sans erreur.

---

## Bug 4 — Mode Lecture : listes trop indentées (padding-left manquant sur `.reader-content ul/ol`) : **CORRIGÉ (2026-09-14)**

**Sévérité : moyenne.** Trouvé en construisant `dev-tests/scenarios-readmode-fidelity.js` (nouvelle
suite comblant l'angle mort "étage 2" documenté dans `PROTOCOLE_TEST_MANUEL.md`) - premier vrai
résultat de cette suite, dès son premier lancement.

### Ce qui est cassé

`css/editor-v2.css:23` définit `.tiptap ul, .tiptap ol { margin: 0; padding-left: 1.4em; }` (19.6px
à la taille de police par défaut), mais **aucune règle équivalente `.reader-content ul`/`.reader-content
ol` n'existe** - le mode Lecture retombe donc sur le padding par défaut du navigateur (40px sur
Chrome). Une liste (à puces ou numérotée) apparaît donc plus indentée en mode Lecture qu'en éditeur,
et l'écart **se cumule à chaque niveau d'imbrication** (mesuré : 40,8px de trop pour une liste à 2
niveaux, soit ~20,4px de trop par niveau).

Confirmé que ce n'est PAS un problème de structure HTML (identique dans les deux :
`<ul><li><p>...</p><ul><li>...</li></ul></li></ul>` des deux côtés) - uniquement un padding-left
divergent, vérifié directement via `getComputedStyle` sur l'élément `<ul>` de chaque côté.

**N'affecte PAS l'export PDF** : `js/pdf-export.js` mesure l'indentation d'une liste sur un hôte
cloné portant la classe `.tiptap` (jamais `.reader-content`), donc le PDF continue de correspondre à
l'éditeur. Seul le mode Lecture (aperçu visible entre l'édition et l'export, 2ᵉ des 3 moteurs de
rendu du projet) diverge.

### Repro

1. Créer une liste à puces avec au moins un niveau d'indentation (Tab sur un élément).
2. Comparer visuellement l'éditeur et le mode Lecture (bouton "Lecture") sur le même document.

### Correction appliquée

`css/editor-v2.css:23` : `.tiptap ul, .tiptap ol { ... }` étendu à `.tiptap ul, .tiptap ol,
.reader-content ul, .reader-content ol { margin: 0; padding-left: 1.4em; }` - symétrique exact de la
règle `.tiptap` existante, comme envisagé. Vérifié : `readmode_list_indent_position` passe désormais
(delta 0), suite `readModeFidelity` complète 15/15.

### État du test

`dev-tests/scenarios-readmode-fidelity.js:readmode_list_indent_position` passe désormais. La suite
`readModeFidelity` est 100% verte.

---

## Bug 5 — Barre flottante nombre/date d'une bulle #Variable : les `<select>`/`<input>` ne réagissaient pas : **CORRIGÉ (2026-09-14)**

**Sévérité : bloquante.** Rapporté par l'utilisateur en usage réel Grist. Aucune suite `dev-tests` ne
couvrait `wireVariableFloatingToolbar` (`js/floating-toolbars.js`) avant ce bug - angle mort complet,
comblé par `dev-tests/scenarios-varformat.js`.

### Ce qui est cassé

Le panneau (nb décimales, format de date, devise) se refermait à l'instant même où on interagissait
avec un de ses propres `<select>`/`<input>` - symptôme précis rapporté : "la liste apparaît une
micro-seconde puis disparaît".

### Root cause (en deux temps - le premier correctif s'est révélé insuffisant)

Chaque panneau flottant (`check()`, appelé sur tout `selectionUpdate`/`transaction` ProseMirror) se
refermait dès que `editor.view.hasFocus()` devenait faux, pour se fermer proprement au clic ailleurs
dans la page. Un `<button>` échappe à cette règle via `mousedown`+`preventDefault()` (garde le focus
sur l'éditeur, cf. `createFloatingPanel`), mais un `<select>`/`<input>` n'a jamais ce traitement -
cliquer dessus déplace réellement le focus DOM hors de l'éditeur.

**Premier correctif tenté (insuffisant)** : tolérer `panel.el.contains(document.activeElement)` en plus
de `hasFocus()`. Ne suffisait pas : instrumentation (écoute `focusin`/`focusout`/`mousedown` sur
`document`) a montré que le `<select>` ne reçoit PAS toujours le focus DOM de façon fiable/synchrone au
moment du clic (le `focusout` de l'éditeur est immédiat, le `focusin` sur le `<select>` n'arrive
parfois jamais - `document.activeElement` retombait alors sur `<body>`) - `document.activeElement`
est donc invérifiable pour ce cas précis. `check()` refermait donc quand même le panneau à l'instant
précis où le menu déroulant natif commençait tout juste à s'ouvrir.

### Correction appliquée

Suppression complète de la garde `hasFocus()`/`document.activeElement` dans `check()` pour les deux
panneaux concernés (barre nombre/date `#Variable` ET barre image, qui a un slider d'opacité exposé au
même piège) - la fermeture "clic hors du panneau" est déjà assurée ailleurs, de façon fiable, par
`hideFloatingContextToolbars` (`js/editor-core.js`), basée sur la CIBLE du `mousedown` et non sur le
focus qui en résulte. `check()` ne décide plus de fermer que sur la sélection réelle (bulle/image
toujours sélectionnée ou non).

### Repro (ne fonctionne PAS de façon fiable via un clic scripté - cf. test)

1. Insérer une variable `#Variable` sur une colonne Nombre ou Date, la sélectionner.
2. Cliquer le sélecteur "nb décimales" ou "format de date" dans la barre flottante qui apparaît.
3. Avant correctif : le menu se referme quasi instantanément. Après correctif : reste ouvert, le choix
   s'applique normalement.

### État du test

`dev-tests/scenarios-varformat.js` (nouvelle suite, 4 cas) :
`varfmt_number_decimals_select_keeps_panel_open`, `varfmt_date_preset_select_keeps_panel_open`,
`varfmt_currency_input_keeps_panel_open` (les 3 reproduisent la condition via un `blur()` explicite de
l'éditeur - un clic scripté sur le `<select>` ne reproduit pas le focus réel de façon fiable en
automatisation, cf. root cause ci-dessus) et `varfmt_panel_still_hides_on_real_outside_click`
(garde-fou : un vrai clic hors du panneau doit quand même le refermer). Vérifiés un par un contre
l'ANCIEN code (réintroduit temporairement) : les 3 premiers échouent bien sans le correctif, le 4e
reste vert dans les deux cas - suite discriminante confirmée, pas des tests vides. Suite complète
`varFormat` 4/4 verte avec le correctif.
