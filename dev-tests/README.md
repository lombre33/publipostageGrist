# Suite de tests — éditeur + export PDF vectoriel

Suite de tests automatisés (façon "tests unitaires", au sens : chaque scénario
isole une fonctionnalité précise et renvoie un verdict programmatique)
couvrant l'éditeur (TipTap/ProseMirror) et l'export PDF **vectoriel
uniquement** (qualité "native" — les autres qualités d'export, impression
navigateur/basse/ultra HD, ne sont pas couvertes). Portée volontaire :
**tout sauf la résolution de `#Variable`/pièces jointes Grist**, qui a
besoin d'un vrai document Grist et ne peut pas être testée en local (cf.
mémoire projet `feedback_testing_workflow`). Les chips Date/Heure/Note de
bas de page, eux, sont testés en entier (aucun appel Grist requis).

Conçue pour être **rejouée régulièrement** (régression après une future
modification), pas juste une fois.

## Portée du test : ciblé (par défaut) vs complet (sur demande explicite)

Deux niveaux de non-régression, pas un seul :

- **Ciblé** (par défaut, à chaque correctif/évolution) : uniquement le(s)
  groupe(s) `scenarios-*.js` couverts par la table ci-dessous pour les
  fichiers réellement modifiés. Plus rapide, suffisant pour valider un
  changement localisé sans balayer tout le reste à chaque fois.
- **Complet** (uniquement si l'utilisateur le demande explicitement - "lance
  tous les tests", "vérifie qu'il n'y a pas de régression partout" - ou avant
  un commit qui touche un fichier réellement transverse comme
  `editor-core.js`) : tous les groupes de la section "Démarrage rapide"
  ci-dessous, par lots de 2-3 (budget ~45s par lot).

**Table fichier source → groupe(s) de tests concernés** (mettre à jour cette
table quand un fichier change de rôle ou qu'un nouveau `scenarios-*.js`
apparaît) :

| Fichier modifié | Groupe(s) à lancer |
|---|---|
| `js/pdf-export.js` | Le(s) groupe(s) du domaine touché (`images`, `twoColumns`, `tables`, `lists`, `formatting`, `pageBreakToc`, `headerFooter`, `chips`) **+ toujours `pdfFidelity` ET `pdfGroundTruth`** (points d'entrée export communs à tout - `pdfGroundTruth` en particulier couvre tout changement touchant la position d'une image en calque ou l'alignement d'un paragraphe) ; pour `rebaseMacroSlotImages`, `slotStartPages`, `originalBlocks` et `_backgroundByPage` de `resolveNativePdfContent` (images en calque d'un macro-modèle, images « derrière » des pages suivantes, fond de page `doc.background`) : **+ `macroModeles` et le script Node `macroImagesMouse`** |
| `js/docx-export.js` | **Toujours `docx` ET `docxImages`** (seuls points d'entrée de l'export DOCX - `docxImages` couvre tout changement touchant la position/l'habillage d'une image, `docx` le reste de la structure OOXML) |
| `js/reader-mode.js` | **Toujours `readModeFidelity`** (seul point d'entrée du mode Lecture) + le(s) groupe(s) du domaine touché si le changement touche aussi une logique partagée avec l'éditeur ; `preview` et son crochet `onBadge` (l'export Excel y lit le type de chaque case) : **+ `xlsx`** ; pour `rebaseLayerImagesBySlot` (images en calque d'un macro-modèle, descendues du début de leur slot) : **+ `macroModeles` et le script Node `macroImagesMouse`** |
| `css/editor-v2.css`, `css/style.css` (règle touchant `.reader-content`) | **Toujours `readModeFidelity`** en plus des groupes déjà listés plus bas pour ce fichier |
| `js/floating-toolbars.js` | `images`, `twoColumns`, `tables` (toolbars tableau/image), `formatting` (pickers couleur), **toujours `varFormat` ET `varZero`** (barre flottante nombre/date d'une bulle #Variable - même fichier, cf. Bug 5 dans BUGS.md ; `varZero` : son bouton « 0 / Ø » du zéro ; `varFormat` : aussi la barre fermée en Lecture, `check()` ne l'ouvre pas sur un éditeur masqué, et fermée par un clic ailleurs, blur de l'éditeur compris ; `images` : le même clic ailleurs pour la barre d'une image) **+ le script Node `varToolbarMouse`** (vrai clic et Entrée sur « Lecture » avec une bulle sélectionnée ; vrai clic sur le texte d'état avec une bulle ou une image sélectionnée) |
| `js/editor-nodes.js` | `images`, `twoColumns`, `lists`, `chips`, **+ `pageLayout`** si le changement touche la zone 2-colonnes **+ le script Node `chipCellMouse`** si le changement touche la bulle `varBadge` (`addNodeView`, `splitBadgeLabel` : nom coupé au milieu dans une case de tableau ou une colonne de zone 2 colonnes) **+ `varFormat`, `varCondition`, `varLoop`** (la bulle porte leur point bleu, leur pointillé et leur icône) |
| `js/header-footer-preview.js` | `headerFooter`, `pageBreakToc` (pagination partagée), **+ `pageLayout`** (la hauteur de page dépend des marges du modèle) ; pour `computePageGridPosition` et `migrateLegacyImagePositions` (position de page des images en calque d'un ancien modèle, éditeur masqué) : **+ `images` et le script Node `layerImagesMouse`** ; `migrateLegacyImagePositions` écrit sa position hors suivi et hors historique (`TrackChanges.skipTracking` de `js/track-changes.js`, qui n'a pas d'autre ligne ici) : **+ `trackChanges`** et les cas `image_legacy_layer_track_changes_*` du groupe `images` (suivi actif : une seule image après l'ouverture, chaque `refreshLayout` et chaque aller-retour Lecture / Édition, sans suggestion en attente ; un modèle déjà abîmé ne grossit plus et « Tout refuser » rend l'image d'origine) ; pour `exitHeaderFooterMode`, `setHeaderFooterData` et `dropEmptyZones` (ce qui reste « activé » une fois « Terminer » cliqué ou un modèle ouvert) : **+ le script Node `headerFooterMouse`** |
| `js/page-layout.js`, `js/settings.js` (onglet Marges) | **Toujours `pageLayout`** + `pdfFidelity`, `readModeFidelity` et `docx` (la largeur de contenu est consommée par les trois, cf. `<w:pgMar>` pour l'export DOCX) ; le texte du numéro de page (`pageNumberText`, `resolvePageNumberBadges`) sert aussi à l'aperçu paginé, au mode Lecture et au PDF : **+ `headerFooter`** (scénario `hf_page_numbers_resolved_in_editor_preview_and_reader`) **et `pdfBatch`** |
| `js/reader-mode.js` | `images` (cas mode Lecture), `pageBreakToc` (cas mode Lecture) |
| `js/orientation-toggle.js` (liste `TYPES`, menu du bouton Page), l'orientation et le format dans `js/page-layout.js` (`FORMATS`, `setFormat`, `pageSizePtFor`, `pageSizeTwipFor`, `pdfPageNameFor`, `--pp-page-width`, `pp:pageLayoutChanged`), et tout code qui lit la taille de la page dans `js/pdf-export.js` (`pageWidthPt`, `pageHeightPt`), `js/pdf-export-alt.js` (`@page`), `js/docx-export.js` (`pageWidthTwip`, section), `js/header-footer-preview.js` (`recaptureLayeredImageGrids`, hauteur de page), `js/reader-mode.js`, `js/settings.js` (plafond des marges), `js/main.js` (`applyPageFitZoom`, `onPageLayoutChanged`, `layerGridsStale`), `css/editor-v2.css` (`--pp-page-width`, `--pp-col-left`) | **Toujours `orientation` ET `pageFormat` ET les scripts Node `orientationMouse` et `pageFormatMouse`** (la page en paysage ou en A5 à l'écran, en Lecture, dans le PDF, le Word et l'impression navigateur ; les scripts survolent et cliquent le vrai bouton et les lignes de son menu à 700×400, clair et sombre, et mesurent la feuille aux pixels) **+ `toolbarChrome` et `autosave`** (le bouton, son état grisé, l'enregistrement de l'orientation seule) **+ `pageLayout`, `pdfFidelity`, `pdfGroundTruth`, `readModeFidelity`, `docx`, `docxImages`** (le portrait doit rester identique à l'ancien rendu) |
| `ReaderMode.trimTrailingBlankBlocks` (`js/reader-mode.js`) et ses trois appels : `render` de la Lecture, `htmlToPdfContent` de `js/pdf-export.js` (flux principal), `buildDocxDocument` de `js/docx-export.js` (+ le paragraphe de 1 pt derrière un dernier tableau) | **Toujours `blankLastPage`** (page blanche en fin de document) + `readModeFidelity`, `pdfFidelity`, `pdfGroundTruth`, `docx`, `pdfBatch`, et `twoColumns`, `tables`, `pageBreakToc` pour ce qui précède une fin de document |
| `js/main-toolbar.js` | `formatting`, `lists` |
| `js/heading-numbering.js` | `pageBreakToc` (numérotation/sommaire) |
| `css/editor-v2.css`, `css/style.css` | Dépend de la règle touchée - au minimum `images` + `twoColumns` + `tables` si la règle touche `.two-columns-*`/`table td`/`.reader-content`, sinon le groupe visuellement concerné |
| `js/comments.js`, `js/editor-nodes.js:createCommentMark`, `js/main.js` (`loadForTemplate`/`onSave`), `js/grist-api.js` (`INTERNAL_TABLES`) | `comments` |
| `js/main.js` (section « Auto-save », `autosaveTick`/`resetAutosaveState`/`wireSaveMenu`/`updateSaveStatus` - la ligne « Enregistrement automatique » du menu Enregistrer et le coin d'état `#status-msg` : « Modifications non enregistrées. » tant qu'une modification attend et que l'enregistrement automatique est coupé), `js/templates.js` (`save`/`loadAll` - `DateModif`), `js/i18n.js` (`status.unsavedChanges`), `css/style.css` (`#status-msg.is-unsaved`, `#btn-save.is-autosave-off` et les jetons `--solid-neutral*` : le bouton Enregistrer est bleu et blanc enregistrement automatique allumé, noir et blanc coupé) | `autosave` ET `contrast` (et `toolbarChrome` pour le menu : cf. la ligne suivante) **ET le script Node `saveMenuMouse` si le coin d'état change** (le message entier à 700 px sans changer la hauteur de la barre, tronqué par « … » avec son texte au survol vers 860 px) |
| `index.html` (`#v2-save-group` : bouton Enregistrer, lignes « Enregistrer sous… » et « Enregistrement automatique »), `js/main.js` (`wireSaveMenu`, `decorateSaveButtonShortcut`, `onSaveAs`, `READ_ONLY_LOCKED_IDS`), `css/editor-v2.css` (`.v2-hover-row:focus-visible`, `.v2-hover-row-check`) | **Toujours `toolbarChrome` ET `autosave` ET `accessRights` ET `contrast` ET les scripts Node `saveMenuMouse` ET `menuClickMouse` ET `dialogsMouse`** (le menu ouvert au survol sous le bouton, un clic = un enregistrement sans prendre le focus, la ligne cochée « Enregistrement automatique » qui arrête vraiment les écritures, « Enregistrer sous… » à la souris et au clavier, le groupe grisé en lecture seule ; `saveMenuMouse` clique pour de vrai à 700×400, clair et sombre, `dialogsMouse` ouvre « Enregistrer sous… » par le menu) |
| `index.html` (`.bar-row`, `#v2-email-fields-row`, `#v2-toolbar` - markup/attributs, pas le contenu de l'éditeur), `css/toolbar-v2.css`, `js/main.js` (`loadTemplateIntoEditor` pour la partie chrome, `syncDefaultTemplateButton`, `onNew`/`onNewEmail`), `js/main-toolbar.js` (`setEmailMode`/`syncToolbarState`) | **Toujours `toolbarChrome`** (seul groupe qui clique réellement les boutons/flyouts de la barre du haut plutôt que l'éditeur lui-même - ajouté 2026-09-19 après deux bugs visuels sur cette zone passés inaperçus) **+ le script Node `settingsWindowMouse`** dès que la fenêtre Réglages (`.settings-modal-content`, `.settings-tabs`, `.settings-panel`, `#settings-close`, libellés `settings.tab.*`) change de largeur, d'onglets ou de défilement (scénario `settings_window_holds_six_tabs_on_one_row_and_only_the_panel_scrolls` : la structure à toute taille de fenêtre ; le script : les pixels à 700×400) |
| `js/macro-templates.js`, `js/macro-editor.js`, `css/toolbar-v2.css` (bloc `.macro-rule-*` : la règle d'une annexe sur deux lignes ; ces classes sont partagées avec la fenêtre de condition d'une bulle et le filtre d'une boucle), `js/main.js` (`loadMacroIntoEditor`, `getCurrentMacroSlots`, `currentDocumentHtml`, `onNewMacro`/`onMacroSaved`, branches macro de `onSave`/`onSaveAs`/`onExportBatch`, `macroSettingsOnScreen`, branche macro d'`autosaveTick`), `js/templates.js` (`safeParseMacroSlots`) | **Toujours `macroModeles`** (seul groupe qui couvre la résolution page de garde + annexes conditionnelles, et les cas `macro_autosave_*` et `macro_modal_save_*` : renommer un macro-modèle chargé, changer une marge ou son nom de PDF laisse sa composition, le macro-modèle supprimé ailleurs n'est jamais réécrit, et la fenêtre de composition comme « Enregistrer sous… » gardent son nom de PDF, son en-tête / pied et ses marges, ceux de l'écran même enregistrement automatique coupé ; ils attendent de vrais passages du minuteur, une minute de plus) **+ `autosave`** si `autosaveTick` change **+ `toolbarChrome`** si le changement touche le verrouillage de la toolbar en mode macro (`js/main-toolbar.js` `setMacroMode`) **+ `columnSearch` et le script Node `columnSearchMouse`** dès que les listes de modèles de la fenêtre changent (page de garde, modèle d'une règle, « Si aucune règle ne correspond » : listes avec recherche, `SearchSelect.attachTemplates` ; sections `macro` et `withoutComponent`) ou que la liste des colonnes d'une règle change (une seule liste pour les colonnes de toutes les tables, sans groupes, et la clé de correspondance pour une table pas encore liée : cas `colsearch_macro_rule_*`, sections `macro` et `macroTables`) ou que la mise en page d'une règle change (section `ruleRows` : deux lignes, sans recouvrement, en clair et en sombre à 700×400 ; la fenêtre de condition et le filtre d'une boucle gardent leur ligne unique) **+ `varCondition` et `varLoop`** si `css/toolbar-v2.css` change une classe `.macro-rule-*` commune ; pour `buildConcatenatedHtml` et le marqueur `data-macro-slot` (`slotBreakHtml`) : **+ `pdfFidelity` et le script Node `macroImagesMouse`** (les images en calque de chaque slot, en Lecture et dans le PDF) |
| `js/editor-core.js`, `js/editor.js` | **Transverse** - traiter comme une demande de suite complète, ces fichiers sont partagés par tous les domaines |
| `js/editor.js` (`onUpdate`, `backfillAutoColumnWidths`, `clampOverflowingTables`, `dispatchColumnWidthFix`, appels de `setHTML` et `refreshLayout`), `js/editor-core.js` (`editorContentWidthPx`), `js/main.js` (`syncEditorVisibilityForMode` : l'éditeur masqué en Lecture ou devant un macro-modèle, rejoué à son retour ; il ferme aussi les barres flottantes d'une bulle, d'un tableau ou d'une image : **`varFormat` et le script Node `varToolbarMouse`**) | **Toujours le script Node `tableUndoKeyboard`** (Ctrl+Z / Ctrl+Y au vrai clavier sur un tableau qui a des largeurs : colonne ajoutée avant ou après, bordure glissée à la vraie souris, tableau presque aussi large que la page ; à 700×400) **ET le script Node `tableWidthsMouse`** (changer de modèle à la vraie souris par un macro-modèle ou en Mode lecture, éditeur masqué : les colonnes gardent leurs largeurs) **+ `tables`, `pageLayout`, `formatting`** (Annuler/Rétablir, `setHTML`) **+ `trackChanges`** (la correction de largeurs passe aussi par le pont du suivi) ; `refreshLayout` rejoue aussi la position de page des images en calque d'un ancien modèle chargé masqué : **+ `images` et le script Node `layerImagesMouse`** |
| `js/track-changes.js` (`TrackingDOMSerializer` et `installSerializer` : la marque d'une case de tableau s'écrit en attribut `data-tc-insertion` / `data-tc-deletion` / `data-tc-modification` de la case, lue par les règles `td[data-tc-…]` des trois marques ; `extendForTracking`), `js/editor.js` (`TrackedTableRow` : la ligne accepte les marques de suivi ; `selectedColumnsCrossMergedCell` ; `dispatchColumnWidthFix` écrit hors suivi), `js/floating-toolbars.js` (`columnDeleteBlocked` : « Supprimer la colonne » grisé à travers une cellule fusionnée, `aria-disabled` et `table.colDelMerged`), `css/track-changes.css` (cases d'une colonne en suggestion : `display: contents` sur l'enveloppe, teintes vert pâle / rouge pâle fixes, 4,5:1, la page reste blanche en sombre) | **`trackChanges`** (cas `trackchanges_column_*`) **ET le script Node `trackColumnsMouse`** (colonne avant, après, supprimée avec le suivi à la vraie souris, Ctrl+Z / Ctrl+Y, « Tout accepter / refuser », enregistrement puis réouverture, cellule fusionnée ; 700×400 clair et sombre) **+ `tables`, `tableUndoKeyboard`, `tableWidthsMouse`, `contrast`, `codeHygiene`** (et `varFormat`, `varZero` pour `js/floating-toolbars.js`) |
| `js/template-tree-select.js`, `css/template-tree-select.css` | **Toujours `templateTree`** (arbre de sélection des modèles - ouverture/fermeture, scroll interne, réouverture, en-tête fixe avec « Organiser », liste sobre à 12,5 px, plus de ligne « Nouveau modèle ») **ET le script Node `templateMenuMouse`** (la même liste à la vraie souris et au vrai clavier à 700×400, clair et sombre, avec le renommage sur place) - « Organiser » ne se trouve plus dans la barre : `modalPagesMouse` et `dialogsMouse` ouvrent la fenêtre par la liste |
| `js/template-organize-modal.js`, `css/template-organize-modal.css`, `js/template-preferences.js` (épingle, dossier, dossier replié par défaut) | **Toujours `templateOrganize` ET `templateTree` ET le script Node `folderDefaultMouse`** (modale « Organiser mes modèles » et préférences par utilisateur : l'interrupteur « déplié / replié par défaut » d'un dossier, la ligne d'état `ModeleId` 0 et la colonne `Replie`, sa migration sur un document ancien, la liste déroulante qui s'ouvre repliée ; le script clique pour de vrai à 700×400, recharge la page et ouvre un document sans la colonne) |
| `css/editor-v2.css` (règle `.v2-hover-flyout`/`.v2-hover-flyout-scrollable`/pont de survol `.v2-hover-group:hover::after`), `js/editor-core.js` (`positionFlyout`/`setGroupExpanded`/`menuTriggerOf` - le bouton principal d'un menu au survol ne prend pas le focus à la souris) | **Toujours `toolbarChrome` ET `templateTree` ET les scripts Node `wheelScroll` (molette réelle, cf. plus bas) ET `smallPanel` (descente lente de la souris vers chaque menu, section `menusSurvol`) ET `menuClickMouse` (vrai clic sur « + », « Enregistrer », « Qualité PDF » et « Titre », puis souris partie : le menu se referme et le curseur reste dans le texte)** - ces menus partagent un mécanisme commun (`.v2-hover-group`/`.v2-hover-flyout`, délégation dans `editor-core.js`) avec le popup de l'arbre des modèles : un flyout mal plafonné fait déborder LA PAGE (pas juste le menu) même fermé, ce qu'aucun scénario `page.evaluate()` ne peut détecter (cf. [[project-publipostage-scroll-chaining-popup-fix]]) |
| `js/variable-condition.js`, `js/variable-linked-attrs.js`, `css/variable-actions.css`, `js/condition-rules.js` (`conditionHolds`, lignes liées multiples ; `compareValues` : « = » sur une colonne à choix multiples ou une liste de références veut dire « contient ce choix », « ≠ » l'inverse - cas `varcond_list_column_equals_means_contains` ; `parseBoolExpected`, exportée : les mots de la liste Oui / Non du champ Valeur sont ceux que la comparaison lit - cas `colsearch_value_bool_*` de `columnSearch`), `js/condition-fields.js` (mode toutes tables), `js/variables.js` (`ruleSourceValue`, `resolveLinkedRows`, `formatValue`), `js/reader-mode.js` (`badgeConditionHolds`), attribut `condition` de `varBadge` (`js/editor-nodes.js`), actions de la barre d'une bulle (`js/floating-toolbars.js:wireVariableFloatingToolbar`) | **Toujours `varCondition` ET le script Node `varToolbarMouse`** (variables conditionnelles et autres attributs : masquage en lecture/export, fenêtres, barre flottante, Copier / Coller la condition d'une variable sur une autre - presse-papier interne, boutons grisés par `aria-disabled`, focus gardé au clavier ; le script clique pour de vrai à 700×400, la ligne des boutons jusque dans un panneau de 360 px ; attributs insérés depuis une variable à condition : ligne « Reprendre la condition d'affichage » cochée d'office, condition reprise par chaque bulle insérée ou aucune case décochée ; bouton « Remplacer » de la même fenêtre, cas `varlinked_replace_*` : l'attribut coché prend la place de la bulle, qui garde son gras, sa condition - sauf case décochée -, son format quand la nouvelle colonne est du même genre (nombre, date) et sa boucle d'une même table, un seul Annuler, aucune transaction refusée en mode suivi, anglais, bulle disparue pendant le choix ; le script clique, tabule puis Entrée, annule au clavier et mesure les trois boutons jusqu'à 360 px) **+ `macroModeles`** si `js/condition-rules.js`/`js/condition-fields.js` change (mêmes règles) **+ `condText` et le script Node `condTextMouse`** si la ligne de boutons de la fenêtre de condition change (« Défaire le bloc » d'un bloc de texte, groupes `var-modal-actions-start` / `var-modal-actions-end` : une ou deux lignes selon la place) |
| `js/loop-rules.js`, `js/variable-loop.js`, partie boucle de `css/variable-actions.css` (repères de zone, fenêtre), `js/variables.js` (`opts.loop` de `resolveRawValue`, `computeItems`), `js/reader-mode.js` (`LoopRules.expandZones`/`removeHiddenBlocks`, `resolveBadgeNode`), attribut `loop` de `varBadge` (`js/editor-nodes.js`), `js/condition-fields.js` (`opts.table`), icône Boucle de la barre d'une bulle (`js/floating-toolbars.js:wireVariableFloatingToolbar`) | **Toujours `varLoop` ET le script Node `varToolbarMouse`** (boucles : zones répétées en lecture et dans les exports, filtre, tri, séparateurs, cas sans ligne, fenêtre et icône, boucle gardée quand « Remplacer » change la colonne de la bulle qui la porte - cas `loop_replace_from_linked_attributes_keeps_the_loop_of_the_row` ; le script clique pour de vrai à 700×400) **+ `varCondition` et `macroModeles`** si `js/condition-rules.js`/`js/condition-fields.js` change **+ `columnSearch` et le script Node `columnSearchMouse`** dès que la fenêtre Boucle change (« Trier par » est une liste avec recherche : section `loopSort`) |
| `js/conditional-text.js`, `css/conditional-text.css`, `createConditionalTextNode` de `js/editor-nodes.js` (nœud `conditionalText`, vue et étiquette), l'entrée « Texte conditionnel » de l'onglet Chips (`js/variables.js` : `SMART_CHIP_ITEMS`, `preferChipsTab`, `command`), le bouton « Insérer une variable » de `js/main-toolbar.js`, le cas « bloc sélectionné » de `js/floating-toolbars.js:wireVariableFloatingToolbar` (`selectedBlockNode`, `syncBlockState`), la variante « bloc » de `js/variable-condition.js` (`isBlock`, `textKey`, bouton « Défaire le bloc » : `unwrapBlock`, `ConditionalText.unwrap`), `ConditionalText.resolve` appelé par `js/reader-mode.js` (`render`, `preview`, `resolveHeaderFooterZone`), `.conditional-text` dans `BOUND_SELECTOR` de `js/loop-rules.js`, `isSplittableByExport` de `js/header-footer-preview.js`, section « Bloc de texte conditionnel » de `js/i18n.js` | **Toujours `condText` ET le script Node `condTextMouse`** (bloc de texte conditionnel, demande d'Antoine du 01/10 : entrée du panneau « # » en français et en anglais, bloc vide posé à la place de « # » (début, milieu, fin de paragraphe, case de tableau, élément de liste, colonne) avec le curseur dedans, blocs emboîtés à toute profondeur, texte sélectionné entouré par le bouton « Insérer une variable » (deux paragraphes, liste entière, case ; Échap ne laisse rien en attente), étiquette qui dit la condition, clic qui sélectionne le bloc et ouvre la barre des variables avec « Autres attributs » et « Boucle » grisés par `aria-disabled` (jamais retirés, état remis à zéro sur une bulle), fenêtre de condition partagée avec les bulles (introduction, aperçu « le bloc s'affiche / est masqué », enregistrer, retirer, annuler, Copier / Coller entre une bulle et un bloc, mêmes colonnes), Entrée deux fois qui sort du bloc, Retour arrière sur le bloc sélectionné qui le supprime, « Défaire le bloc » (bouton de la fenêtre de condition, bloc seulement, demande d'Antoine du 01/10 : le cadre et la condition partent, tout le texte reste - blocs emboîtés, liste, case de tableau, colonne et encadré compris -, un seul Annuler, curseur au début du texte libéré, rien touché si le bloc a disparu pendant que la fenêtre est ouverte, mode suivi : bloc barré puis « Tout accepter » rend le texte seul), Lecture et aperçu d'export (condition remplie : le cadre disparaît ; sinon le bloc et ce qu'il contient disparaissent sans ligne vide ; emboîtés, variables à condition, case, élément de liste, colonne, ligne de tableau répétée par une boucle, colonne d'une table liée, en-tête et pied de page, encadré dans un bloc et bloc dans un encadré), vrais fichiers PDF et Word d'une ligne, repères de commentaire en Lecture, cadre sans effet sur la largeur du texte, pagination de l'aperçu A4, copier-coller d'un bloc, mode suivi ; le script clique, tape et sélectionne pour de vrai à 700×400, en clair et en sombre, puis à 360 px pour l'étiquette d'une condition longue ; icônes grisées mesurées sur une vraie capture) **+ `varCondition`, `varLoop`, `varToolbarMouse`** si le changement touche aussi `js/variable-condition.js`, `js/floating-toolbars.js` ou `js/loop-rules.js` (ce sont leurs fichiers) **+ `readModeFidelity`, `pdfBatch`, `docx`, `docxImages`** si le rendu change **+ `chips`** si l'onglet Chips change **+ `codeHygiene`** (CSS, `js/i18n.js`, `index.html`) |
| `js/modal-base.js`, `css/modal-base.css` (base commune des fenêtres : voile, cadre, titre, zone de contenu, ligne de boutons, Tab et Échap), et l'ouverture/fermeture des fenêtres qui s'y appuient (`js/variable-condition.js`, `js/variable-linked-attrs.js`, `js/variable-loop.js` ; pour les sept fenêtres écrites dans `index.html` - Réglages, Tables liées, Clé de correspondance, Macro-modèle, Organiser, Galerie, Aperçu - `ModalBase.adopt` dans `js/main.js:wirePageModals`, leur balisage dans `index.html` et leurs habillages de `css/toolbar-v2.css`, `css/template-organize-modal.css` et `css/access-rights.css`) | **Toujours les scripts Node `modalBaseMouse` ET `modalPagesMouse`** (`modalBaseMouse` : Condition d'affichage, Autres attributs et Boucle à 700×400, en clair et en sombre : le titre et la ligne de boutons ne bougent pas quand le contenu défile, seule la zone de contenu défile, Tab et Maj+Tab tournent dans la fenêtre même quand le focus est tombé sur `<body>`, Échap la ferme où que soit le focus, le choix de la clé par-dessus garde le clavier, mêmes largeur et voile pour les trois, panneau de 360 px ; `modalPagesMouse` : la même chose pour les sept fenêtres d'`index.html`, plus Échap après « Supprimer » dans Tables liées, la clé ouverte par le crayon d'une règle, « Retour à la galerie ») **+ `varCondition`, `varLoop`, `varPath`, `linkConfig` et les scripts Node `varToolbarMouse` et `columnSearchMouse`** (ils ouvrent ces fenêtres et s'y servent de la molette ; la section `macroTables` vérifie que la clé de correspondance, `#link-config-modal` à z-index 2050, s'ouvre AU-DESSUS d'un macro-modèle, écrit après elle dans `index.html` : à z-index égal elle passerait dessous) **+ les groupes de la fenêtre d'`index.html` touchée** (`toolbarChrome` et le script Node `settingsWindowMouse` pour Réglages, `accessRights` pour l'onglet Accès, `macroModeles`, `templateOrganize` + `templateTree` et le script Node `folderDefaultMouse` pour Organiser, `templateGallery` pour la galerie et l'aperçu) **+ `codeHygiene`** dès que `css/modal-base.css` ou `index.html` change |
| `js/dialogs.js`, section « Saisies et confirmations » de `css/modal-base.css` (`Dialogs.prompt` / `Dialogs.confirm` / `Dialogs.choose`, à la place de `window.prompt` / `window.confirm`), et chaque appel converti (image par adresse, enregistrer sous, supprimer un modèle, email trop long, les trois exports en lot, table de la galerie, supprimer un fil de commentaires, dossiers d'Organiser, supprimer une correspondance de tables) | **Toujours le script Node `dialogsMouse`** (la fenêtre à 700×400 en clair et en sombre : champ prérempli et sélectionné, Entrée / Échap / clic, focus rendu à l'élément d'origine, Tab qui tourne, fenêtre AU-DESSUS d'Organiser, une seule fenêtre pour deux demandes ; puis chacun des appels par le vrai clic sur le vrai bouton ; aucune boîte native) **+ `modalBaseMouse`** (mêmes fichiers de base) **+ `codeHygiene`** (aucun `prompt()` / `confirm()` natif, `await` devant chaque appel) **+ le groupe de la fonction dont l'appel a changé** (les scénarios dans la page répondent à la fenêtre par `TestHelpers.stubDialogs`, comme ils répondaient à `window.prompt`) |
| `js/main.js` (`hasEditsToConfirmBeforeLeaving`, `askBeforeLeaving`, `onTemplateSelectChange`, `onNew` / `onNewEmail` / `onNewGrid`, `onMacroSaved`, `useEmpty` / `useWithData` de la galerie, `leavePromptOpen` de `autosaveTick` - la question « Enregistrer / Abandonner / Annuler » posée avant de quitter ou de remplacer un modèle dont une modification attend, enregistrement automatique allumé ou non), `js/i18n.js` (`dialog.unsaved.*`), section « Saisies et confirmations » de `css/modal-base.css` (les trois boutons passent à la ligne dans un panneau étroit), `dev-tests/helpers.js` (réponse « Abandonner » du harnais, `withRealChoose`) | **Toujours `autosave`** (trois cas où la VRAIE fenêtre est rendue par `h.withRealChoose` : Annuler, Échap, Abandonner, Enregistrer, enregistrement automatique allumé, « + », « Nouvel email », brouillon sans nom, suppression) **ET le script Node `leaveUnsavedMouse`** (la vraie liste, le vrai « + », la galerie, 700×400 : rien ne se pose quand rien n'attend, y compris après avoir chargé un modèle riche) **+ `dialogsMouse`** (section « choix ») **+ tout groupe ou script qui change de modèle ou en crée un derrière un état « modifié »** : les scénarios dans la page reçoivent « Abandonner » du harnais, un script Node sans harnais rencontre la vraie fenêtre et doit y répondre |
| `js/external-images.js` (la fenêtre qui précède un export dont le modèle contient une image d'un site externe : `ExternalImages.confirmExport`, `beginRun` / `endRun`, `isCancel`), ses appels (`exportCurrentRecord` et `getNativePdfBlobForRecord` de `js/pdf-export.js`, `getDocxBlobForRecord` de `js/docx-export.js`, `getXlsxBlobForRecord` et `createSingleWorkbook().appendRecord` de `js/xlsx-export.js`), `withExportLock`, `onExportPdf`, `onExportDocx`, `onExportXlsx` et `onExportBatch` de `js/main.js` (un refus est « Export annulé. », pas une erreur, et arrête tout le lot), les clés `dialog.externalImages.title`, `confirm.externalImages` et `status.exportCancelled` de `js/i18n.js` | **Toujours `externalImages`** (le module seul : quels sites sont listés, en-tête et pied comptés seulement quand ils sont exportés, un site accepté pas redemandé dans un lancement, un refus arrête tout, une seule fenêtre à la fois, serveur de Grist reconnu par l'origine de son jeton, texte au singulier et au pluriel en français et en anglais ; puis les vrais exports d'une ligne, PDF, Word et Excel : la fenêtre s'ouvre AVANT tout téléchargement et « Annuler » ne télécharge ni ne produit rien ; puis les vraies lignes du menu Exporter, lots compris, les trois lignes Excel d'une grille aussi) **+ le script Node `externalImagesMouse`** (à 700×400, en clair, en sombre et en anglais, par le vrai clic sur Exporter en PDF / en DOCX / toutes les lignes en ZIP : Annuler, Échap, Tab, Continuer, quarante sites qui défilent ; les téléchargements sont ceux du navigateur) **+ `pdfFidelity`, `pdfGroundTruth`, `docx`, `docxImages`, `pdfBatch`, `xlsx`** (les points d'entrée d'export traversent le même appel) **+ `dialogsMouse` et `accessRightsMouse`** (le verrou d'export et la fenêtre commune) **+ `codeHygiene`** (`index.html`, `js/i18n.js`) |
| `js/search-select.js` (dont `attachValues`, `SearchSelect.sync`, le plafond `MAX_ROWS` de 500 lignes et sa ligne « Encore N résultats »), `css/search-select.css`, `js/variables.js` (`showLinkConfigModal`, `describeColumn`, `fillColumnSelect`), `index.html` (`#link-config-modal`) | **Toujours `linkConfig` ET `columnSearch` ET les scripts Node `varToolbarMouse` et `columnSearchMouse` (+ `smallPanel` : le composant sert aussi de menu à « Image depuis une variable », options `popup`/`anchor`/`onClose`)** (fenêtre de choix de la clé entre deux tables : listes de colonnes avec recherche au fil de la frappe, table entre parenthèses derrière chaque colonne, Échap/Tab/↑↓/Entrée, repli sur les `<select>` natifs ; les scripts cliquent et tapent pour de vrai à 700×400, molette comprise) **+ `varCondition` et `varLoop`** (ils ouvrent cette fenêtre pour une table pas encore liée, et tous les choix de colonne de leurs fenêtres passent par ce composant) **+ `macroModeles` et `accessRights`** dès que `attachTables` / `attachTemplates` (ou leurs textes) change : listes de modèles du macro-modèle et liste des tables de l'onglet Accès |
| `js/condition-fields.js` (liste des colonnes d'une règle : `buildColumnField`, `appendColumnOption`, `appendAllTablesOptions` (UNE seule liste à plat, sans groupes), `ensureTableLinked` ; champ Valeur : `buildValueField`, `buildValueList`, `buildBoolList`, `syncValueDisabled` ; opérateurs : `syncOperatorOptions`) | **Toujours `columnSearch` ET le script Node `columnSearchMouse`** (le choix de colonne d'une règle Colonne / Opérateur / Valeur est une liste avec recherche - js/search-select.js - dans la fenêtre de condition d'une bulle, le filtre d'une boucle et les macro-modèles : type derrière chaque colonne, saisie avancée toujours en bas, choix « rien », focus, colonne remise si le choix de la clé est annulé ; la colonne d'une règle de macro-modèle ET celle de la condition d'une bulle sont UNE même liste de toutes les tables, à plat et sans intitulé de groupe, retrouvée par son nom, avec la clé de correspondance pour une table pas encore liée - cas `colsearch_macro_rule_*`, `colsearch_condition_*` et `colsearch_condition_and_macro_rules_list_the_same_columns_in_the_same_order` ; le script clique et tape pour de vrai à 700×400, sections `condition`, `loop`, `macro`, `macroTables` ; le champ Valeur d'une colonne à choix ou d'une Référence est une liste avec recherche des valeurs possibles - cas `colsearch_value_*`, section `values` : choix de la colonne, noms de la table liée lus après « — Chargement… — », « Autre valeur… » toujours en bas, valeur déjà enregistrée gardée, grisage par « vide » / « non vide » (une seule atténuation), repli sur le texte libre ou le `<select>` natif, 500 lignes au plus ; le champ Valeur d'une colonne Oui / Non est la liste « Oui » / « Non » (« Yes » / « No » en anglais), sans « Autre valeur… » ni champ libre, ses mots lus par la comparaison - une valeur déjà enregistrée garde sa graphie (« vrai », « 1 »...) ou, si la comparaison ne la lit pas, reste visible avec « valeur non reconnue » ; sur une colonne Oui / Non, les opérateurs sans sens (« > », « < », « ≥ », « ≤ », « contient ») sont GRISÉS dans la liste des opérateurs, jamais retirés, et l'opérateur déjà enregistré reste affiché et choisi - cas `colsearch_value_bool_*` (dont `colsearch_value_bool_operators_*` : condition d'une bulle, filtre d'une boucle, macro-modèle), section `boolValues`) **+ `varCondition`, `varLoop`, `macroModeles`** (les règles) |
| `js/variables.js` (`currentTables`, `prioritizeTables` ; leur emploi dans `computeItems` et `checkForFilenameTrigger`), `js/main-toolbar.js` (`openImageVariablePicker` : classement des colonnes Pièces jointes) | **Toujours `columnSearch` ET `varLoop` ET `varTextPath` ET le script Node `columnSearchMouse`** (dans une recherche de colonne qui réunit plusieurs tables - liste « # » du corps et des champs texte (Nom de fichier PDF, À, Cc, Cci, Objet), menu « Image depuis une variable » -, les colonnes de la table de la page viennent en tête, celles de la table parcourue par une zone répétée avant elles, les autres tables dans l'ordre du schéma, chaque table dans l'ordre de ses colonnes ; la limite de 50 clés de la liste « # » s'applique APRÈS ce classement - cas `colsearch_hash_list_*`, `colsearch_text_fields_hash_list_*`, `colsearch_image_menu_puts_*` ; la liste à plat de la colonne d'une règle (condition d'une bulle, macro-modèle) l'avait déjà : cas `colsearch_rule_column_search_keeps_*` ; le script tape et presse pour de vrai à 700×400, section `hashList` et fin de `imagePicker`) **+ `smallPanel`** si la liste « # » change de place ou de taille |
| `js/grist-api.js` (`refreshColumnTypes` : `visibleCol` d'une Référence ; `getReferenceColumn`, `getReferenceValues`), `dev-tests/grist-stub.js` (5e paramètre `visibleCols` de `setVariables`) | **Toujours `columnSearch` ET `macroModeles`** (cas `colsearch_value_*` et `macro_get_reference_values` : la colonne montrée d'une Référence se lit dans `_grist_Tables_column`, ses valeurs dans la table liée, triées, sans doublon, ni id de ligne ni date) **+ `linkConfig`, `varCondition`, `varLoop`, `varFormat`, `varPath`, `varLookup`, `varTextPath`** dès que `dev-tests/grist-stub.js` change (le stub sert à tous les groupes ; `setVariables` sur une table déjà déclarée garde ses anciennes lignes : une table par test) |
| `js/variable-linked-attrs.js` (niveaux, flèches, fil d'Ariane), `js/variables.js` (`resolvePathValue`, `resolveRows`, `baseRows`, `followReference`, crochet `isColumnPath` de `resolveRawValue`, `resolveVariableResult` et ses messages d'erreur), `js/grist-api.js` (`resolveColumnPath`, `tableAtEndOf`, `getColumnType` en chemin), `js/editor.js` (`refreshVariableBadgeValidity` d'un chemin), `js/loop-rules.js` (`sourceFor` d'un chemin), `css/variable-actions.css` (`.var-linked-path`, `.var-linked-descend`) | **Toujours `varPath` ET `varCondition` ET le script Node `varToolbarMouse`** (bulles qui descendent de référence en référence, `#Projet.Accompagnateur.Email` : lecture, export en lot, ligne d'une zone répétée, type/format de la dernière colonne, bulle cassée, fenêtre « Autres attributs » qui descend et remonte, les cinq messages d'erreur d'une variable en français et en anglais avec le drapeau `isError` d'où la Lecture tire son avertissement ; le script clique la flèche et le fil d'Ariane à la vraie souris à 700×400) **+ `varLoop`** si `js/loop-rules.js` change, et **la suite complète** dès que `js/editor.js` est touché (fichier transverse) |
| `js/variables.js` (`rawRowOf`, `ruleSourceValue`, branche « même table » de `resolveRawValue`) | **Toujours `varLookup` ET `varCondition` ET `linkConfig` ET le script Node `varToolbarMouse`** (champ rapporté de la table de la page - colonne à formule - que `grist.onRecord` n'a pas livré : valeur en lecture et à l'export, clé de liaison, condition, aperçu de la fenêtre de clé ; une seule lecture de la table par ligne livrée, aucune pour une colonne livrée) **+ `macroModeles`** (les règles des macro-modèles passent par `ConditionRules.matches`) **+ `pdfBatch`, `docx` et `docxImages`** dès qu'un chemin de rendu ou d'export change de valeur |
| `js/variables.js` (`findTextVariables`, `extendKeyPath`, `resolveTextVariables`, `pathItems`, `checkForFilenameTrigger`, `insertFilenameVariable`), `js/reader-mode.js` (`resolveFilename`) | **Toujours `varTextPath`** (clés simples et chemins de références `#Projet.Accompagnateur.Email` dans les champs Objet/À/Cc/Cci du mode email et dans le nom du PDF : un seul scan pour les deux, point de fin de phrase ou « .pdf » laissé en texte, référence vide ou disparue, ligne d'un export en lot, touche de déclenchement des Réglages ; et la liste `#` de ces champs : les colonnes de la ligne liée après « #Projet.Accompagnateur. », de référence en référence, sans colonne d'aide, fermée après un choix et derrière une clé complète) **+ le script Node `smallPanel`, section `chemins`** (`node dev-tests/verify-small-panel.mjs chemins` : vrai clavier et vraie souris à 600, 700 et 800×400, liste entière dans la fenêtre et cliquable, À, Cc, Cci et nom du PDF) **+ `varPath`** (même descente) **+ `readModeFidelity`** (`js/reader-mode.js`) **+ `toolbarChrome`** (« Créer l'email ») **+ `pdfBatch`, `docx` et `docxImages`** (le nom du fichier exporté passe par `resolveFilename`) |
| `js/variable-format.js` (`isZero`), `js/variables.js` (`zeroHidden`, `formatValue` et ses options `rawNumbers` / `keepZero`), le bouton « 0 / Ø » de la barre nombre de `js/floating-toolbars.js` (`num-zero`, `setSelectedBadgeFormat`) et son icône `zeroToggle` de `js/icons.js`, `js/variable-linked-attrs.js` (liste des attributs : `keepZero`), la règle `.v2-varfmt-toolbar` de `css/toolbar-v2.css` (barre qui passe à la ligne dans un panneau étroit) | **Toujours `varZero`** (un vrai zéro d'une colonne Numérique ou Entier ne s'écrit pas par défaut, pour toutes les bulles et les modèles déjà enregistrés ; réglage `zero:'show'` du format = le bouton relâché ; l'ancien `zero:'hide'` du menu reste « masqué » ; seul un vrai zéro disparaît (0, « 0,00 », pas 0,004) et rien d'autre ne change ; colonne Texte, Date, champs texte `rawNumbers` (Objet, À, Cc, Cci, nom du PDF) et liste des attributs `keepZero` gardent le 0 ; le bouton ne pose pas la mise en forme des nombres, les autres réglages le gardent ; corps, en-tête et pied de page de la Lecture, boucles en tableau et en ligne, aperçu et lignes brutes d'un lot, PDF et Word réels) **+ `varFormat`** (même barre) **+ le script Node `varToolbarMouse`** (section « Nombres » : bouton atteignable à 700×400, enfoncé avec un 0 barré par défaut, vrai clic qui l'allume et l'éteint, la barre reste affichée, réglage gardé par FR, Lecture « 1 200 » / « 0 » à la vraie souris, barre dans la fenêtre à 360 px) **+ `smallPanel`** (`css/toolbar-v2.css`) **+ `readModeFidelity`, `pdfBatch`, `docx` et `docxImages`** (tout le rendu d'une bulle passe par `formatValue`) |
| `js/variables.js` (`formatValue` : écriture par défaut d'un nombre sans réglage ; option `rawNumbers` de `resolveVariableResult`, `resolveVariable` et `resolveTextVariables`), `js/variable-format.js` (`formatNumber` : espace des milliers insécable U+00A0, jamais l'espace fine U+202F que la police des PDF n'a pas), `js/reader-mode.js` (`resolveFilename`) | **Toujours `varNumber`** (une colonne Numérique ou Entier sans format s'écrit FR - US en interface anglaise - comme le bouton que la barre montre allumé, sans recliquer dessus ; colonne Texte, date et réglages explicites inchangés ; champs texte et nom du PDF gardent le nombre brut ; tous les chemins de rendu : Lecture, aperçu, ligne d'un lot, en-tête et pied, boucles ; vrai PDF sans glyphe manquant et vrai DOCX) **+ `varZero` ET `varLookup`** (leurs attentes d'un nombre portent cette écriture par défaut) **+ `varFormat`** **+ le script Node `varToolbarMouse`** (section « Nombres » : FR allumé et Lecture « 1 200 » sans recliquer, à la vraie souris) **+ `readModeFidelity`, `pdfBatch`, `docx` et `docxImages`** |
| `js/pdf-merge.js`, `js/main.js` (`onExportBatch`, `withExportLock`), lignes « Exporter toutes les lignes » du menu Exporter en PDF (`index.html`) | **Toujours `pdfBatch`** (clique les lignes du menu et ouvre le fichier téléchargé : archive ZIP d'un PDF par ligne, PDF unique où chaque ligne commence sur une nouvelle page avec sa propre numérotation, puis les deux téléchargements DOCX : un .docx, une archive d'un .docx par ligne ; un macro-modèle réel dont les annexes se choisissent ligne par ligne, en ZIP comme en PDF unique) **+ `dialogsMouse`** si `withExportLock` change (le clavier revient sur « Créer l'email » et « Exporter en PDF » que le verrou a grisés) |
| `js/viewport-fit.js`, `css/toolbar-v2.css` (info-bulles `[data-tip]`, `#status-msg`, champs email sous 900px, `overflow` de `#toolbar-top`/`#v2-title-cluster`/`.v2-color-split`/`#v2-size-stepper`), placement des popups (`js/variables.js:position`, `js/comments.js:positionPopup`, `js/main-toolbar.js:openImageVariablePicker`) | **Toujours le script Node `smallPanel`** (vraie souris à 600-800×400 : info-bulles entières et visibles aux pixels, pas d'info-bulle collée après Échap, email+Cci, hauteur de barre stable, popups dans la fenêtre, liste `#` des champs texte après le point : section `chemins`, menu « Image depuis une variable » : liste avec recherche de 10 colonnes) + les groupes déjà listés pour ces fichiers (`toolbarChrome`, `comments`, `chips`, `formatting`, `lists`) **+ `columnSearch` et le script Node `columnSearchMouse`** dès que `openImageVariablePicker` change (le menu est une liste avec recherche du composant `js/search-select.js` : sections `imagePicker` et `withoutComponent`, repli sur la liste simple) |
| `js/access-rights.js`, onglet Réglages > Accès (`index.html`, `css/access-rights.css`), `js/main.js` (section « Droits par personne », gardes `isReadOnly`/`canExport` de `onSave`, `switchMode`, `withExportLock`, `autosaveTick`, `saveReaderCommentAnchors`, `applyFormattingBarLock` : barre de mise en forme grisée en mode Lecture, `applyCommentsPermissions` / `readerCommentsActive` : Lecture commentable dès qu'elle est affichée), `js/comments.js` (`readerMode`, `buildReaderHtml`, `wireReader`), options du widget et email simulés (`dev-tests/grist-stub.js` : `setWidgetOptions`, `setUserEmail`) | **Toujours `accessRights` ET le script Node `accessRightsMouse`** (lecture seule, export et commentaires par personne ; le script démarre avec le réglage déjà posé et commente en Lecture à la vraie souris, à 700×400) **+ `readModeMouse`** si la barre grisée en Lecture ou Commenter dans la Lecture choisie change **+ `comments`** si `js/comments.js` change **+ les groupes qui passent par le vrai mode Lecture** (`readModeFidelity`, `pageLayout`, `pageBreakToc`, `images`, `macroModeles`, `varCondition`, `varLoop`, `varPath`, `varLookup`, le script Node `englishTextsMouse`) si `renderReader`, `readerCommentsActive` ou `Comments.buildReaderHtml` change : la Lecture de tout le monde passe par ce rendu annoté dès qu'on peut commenter **+ `settingsWindowMouse`** si la hauteur du contenu de l'onglet ou `css/access-rights.css` change (le contenu de l'onglet défile dans la fenêtre Réglages, « Fermer » reste fixe) **+ `columnSearch` et le script Node `columnSearchMouse`** (section `access` : les cinq choix de l'onglet - la table, l'email et les trois droits - sont des listes avec recherche ; vrai clic, frappe, Échap, à 700×400) |
| `js/pdf-export-alt.js` (qualités impression navigateur et raster, chargement de `html2pdf.js` à la demande), liste `PDF_LIB_URLS` de `js/pdf-export.js` (JSZip n'y est plus : il se charge par `ExportCommon.ensureJsZipLoaded`) | **Toujours `pdfBatch`** (le premier export PDF, au vrai bouton, ne charge pas `html2pdf.js` ; une qualité raster appelée directement le charge à ce moment-là et produit un PDF) **ET le script Node `smallPanel`, section `exportPdf`** (premier export PDF au vrai clic à 700×400 : un PDF sort, aucune requête vers `html2pdf`) **+ `pdfFidelity` ET `pdfGroundTruth`** |
| `js/export-common.js` (chargeur de script, chargement de JSZip seul, téléchargement d'un Blob, mesure des colonnes, hôte de mesure, en-tête/pied résolus : partagés par `js/pdf-export.js`, `js/docx-export.js`, `js/xlsx-export.js`, `js/pdf-merge.js` et les lots ZIP de `js/main.js`) | **Toujours `pdfFidelity`, `pdfGroundTruth`, `pdfBatch`, `docx`, `docxImages`, `xlsx`, `pageLayout`, `tables`, `twoColumns`** (une aide changée touche tous les exports ; `pdfBatch` vérifie que le lot DOCX en ZIP ne charge que JSZip, sans pdfmake ni ses polices) **+ `codeHygiene`** |
| `js/template-gallery.js`, `templates-gallery/manifest.json`, `templates-gallery-dev/manifest.json`, `#template-gallery-modal` (`index.html`), `wireTemplateGalleryModal` (`js/main.js`) | **Toujours `templateGallery`** (galerie « Créer à partir d'un template » : les trois modèles de `templates-gallery-dev/` ne sont lus que si l'adresse du widget contient `?dev` ; sans lui, ni `loadManifest`, ni la grille, ni le réseau ne les voient ; `?dev` seul, avec une valeur ou au milieu d'autres paramètres les ajoute, le cache ne fige pas le réglage) |
| `css/style.css` (jetons `--text-faint`, `--paper-text-faint`, `--accent-solid`, `--accent-solid-hover`, règle `::placeholder` du thème sombre, boutons `#btn-save` et `#btn-export-pdf`), toute règle à texte blanc sur fond d'accent (`css/toolbar-v2.css`, `css/editor-v2.css`, `css/variable-actions.css`), liens des Crédits (`css/toolbar-v2.css`), anneau de focus du sélecteur de modèle (`css/template-tree-select.css`) | **Toujours `contrast` ET `codeHygiene`** (contrastes mesurés sur les éléments réels, en clair puis en sombre, transitions coupées : texte discret et liens des Crédits 4,5:1, boutons pleins à texte blanc 4,5:1, texte d'aide d'un champ 4,5:1, anneau de focus 3:1). Un texte blanc sur `var(--accent)` est un défaut : `--accent` s'éclaircit en sombre (3,08:1), le fond d'un bouton plein prend `--accent-solid` ; un texte d'accent posé sur un fond gris ou teinté (`--surface-sunken`, `--accent-soft` : 3,97 à 4,43:1) prend `--accent-ink` ; un message de réussite prend `--good` sur `--good-soft` ; les puces de la galerie mélangent `--text-faint` et `--text` ; la page (éditeur, Lecture) reste blanche en sombre : un texte discret posé dessus (texte d'attente, tâche cochée de la Lecture, contenu d'un en-tête ou d'un pied) prend `--paper-text-faint`, jamais `--text-faint` (2,46:1 sur blanc en sombre), et le texte fantôme « Ajouter un en-tête » prend `--accent-ink` sur le fond de survol de sa zone ; le survol ne se joue pas depuis la page, les cas lisent le fond et la couleur que la règle `:hover` déclare dans la feuille de style (cas `contrast_success_message…`, `contrast_accent_text_on_tinted…`, `contrast_gallery_card_chips…`, `contrast_header_footer_ghost_text…`, `contrast_faint_text_on_the_white_paper…`) |
| `js/template-organizer.js` (vue « épinglés + arbre de dossiers »), `js/template-preferences.js` (file d'écritures des préférences, retour arrière sur refus de Grist) | **Toujours les scripts Node `templateOrganizerUnit` ET `templatePreferencesUnit`** (purs, sans navigateur, moins d'une seconde), en plus des groupes de la ligne « Organiser mes modèles » ci-dessus pour `js/template-preferences.js` |
| Un texte de l'interface passé par `I18n.t` : `js/header-footer-preview.js` (libellés `hf.addHeader`/`hf.addFooter` des zones fantômes de la page), `js/main-toolbar.js` (ligne Roboto du menu de police), `js/reader-mode.js` (avertissement de variable non résolue, titre et vide du sommaire), `js/editor-nodes.js` (`renderHTML` du sommaire), et la clé correspondante de `js/i18n.js` | **Le script Node `englishTextsMouse`** (interface en anglais à 700×400 : ces sept textes lus à la vraie souris, puis retour au français par Réglages) |
| Un texte que le widget écrit dans le document : les messages d'erreur d'une variable (clés `variables.error.*` de `js/i18n.js`, `js/variables.js`, et `js/reader-mode.js` : `resolveBadgeNode` repère l'erreur par le drapeau `isError`, pas par les premiers mots du message), le titre du sommaire et sa phrase « aucun titre » dans `js/docx-export.js` (`buildTocParagraphs`, clés `pdf.tocTitle` et `docx.tocEmpty`), le titre du repli de `js/pdf-export.js` (clé `pdf.tocTitle`, la même que le PDF normal et la Lecture), et « [Email indisponible] » du chip Email de `js/reader-mode.js` (`resolveSmartChips`, clé `reader.emailUnavailable`) | **`varPath` ET `docx` ET `pageBreakToc` ET `chips` ET le script Node `englishTextsMouse`** (chaque message en français et en anglais, aux huit endroits qui l'écrivent ; l'avertissement de la Lecture qui ne dépend plus de la langue ni d'une valeur de cellule qui commence par un crochet ; le titre Word et PDF et la phrase « aucun titre » du Word dans les deux langues, repli du PDF compris ; le chip Email dont l'adresse ne se lit pas, en Lecture et dans l'aperçu des exports ; le script Node lit le message de la variable et celui du chip à 700×400) **+ `readModeFidelity`, `pdfFidelity`, `pdfGroundTruth`, `pdfBatch`, `docxImages`** (rendu touché) |
| `js/link-dialog.js` (adresse acceptée par `normalizeUrl`, fenêtre du lien, Ctrl+K, Ctrl/⌘+clic et info-bulle), `css/link-dialog.css`, le menu à une icône `#v2-blocks-group` (`index.html`) et ses actions dans `js/main-toolbar.js` (`toggleCodeBlock` et sa garde `codeBlockWouldDropContent`, `toggleBlockquote`, verrous de `syncToolbarState`), `js/html-sanitize.js` (`safeLinkHref`), `js/export-common.js` (`codeLinesOf`), les branches lien / `<pre>` / `<blockquote>` de `js/pdf-export.js`, `js/docx-export.js`, `js/mailto-export.js` et `js/reader-mode.js`, les règles `a`, `pre`, `blockquote` et `.v2-menu-row*` de `css/editor-v2.css`, la configuration Link de `js/editor.js` | **Toujours `linksBlocks` ET le script Node `linksBlocksMouse`** (liens : adresses acceptées et refusées - `javascript:`, `data:`, `file:` jamais -, pose, modification, retrait, sans sélection avec « texte à afficher », adresse tapée qui devient un lien ; Ctrl+K sans passer par la barre ; Lecture, PDF, Word et e-mail ; bloc de code : conversion et retour, une ligne grisée n'efface jamais une bulle `#Variable` ni une image, coupes du PDF entre deux lignes seulement, une ligne de code par paragraphe Word ; citation ; verrous en mode macro et dans un bloc de code (en Lecture : groupe `accessRights`) ; le script clique et tape pour de vrai à 700×400, en clair, en sombre et en anglais : survol de l'icône, ligne « Lien… », fenêtre entière dans le panneau avec l'erreur et le champ « texte à afficher », Ctrl+K / Tab / Échap / Entrée, Ctrl+clic qui ouvre un onglet et clic simple qui n'ouvre rien, info-bulle du lien) **+ `contrast`** (le texte du lien, le bouton « Retirer le lien » et le message d'erreur du lien, en clair et en sombre) **+ `toolbarChrome`** (la barre et son menu) **+ `accessRights` et le script Node `accessRightsMouse`** (le menu grisé en Lecture) **+ `readModeFidelity`, `pdfFidelity`, `pdfGroundTruth`, `pdfBatch`, `docx` et `docxImages`** (rendu touché) **+ `codeHygiene`** (CSS, `js/i18n.js`, `index.html`) |
| `js/callout.js` (nœud `callout` et sa palette `COLORS` / `ICONS` / `PRESETS`, fenêtre « Insérer / Modifier l'encadré », `wrapSelection`, `unwrapAround` - REMPLACE le cadre par son contenu, jamais `tr.lift` : en mode suivi une levée laisse un cadre vide après « Tout accepter » -, bloc de signature `insertSignature`), `css/callout.css`, les lignes `#v2-btn-callout` et `#v2-btn-signature` du menu (`index.html` ; `js/main-toolbar.js` : libellé « Modifier l'encadré… » dans un encadré, verrous en mode Email et en en-tête / pied), `TrackedCallout` de `js/editor.js`, `ExportCommon.calloutMetricsPx`, les branches encadré de `js/pdf-export.js` (`calloutFrom`), `js/docx-export.js` (`calloutBlocksFrom`, largeur transmise aux tableaux et aux colonnes), `js/mailto-export.js` (`collectBlocks`), `js/reader-mode.js` et `js/loop-rules.js` (`removeAndPrune` retire l'encadré que « masquer le paragraphe » a vidé) | **Toujours `calloutSignature` ET le script Node `calloutMouse`** (menu à cinq lignes ; fenêtre : type / couleur / icône, aperçu, Insérer, Modifier, Retirer, Annuler, Échap, Entrée ; insertion autour d'un bloc, de plusieurs blocs, d'une liste, dans une colonne ou une cellule ; un Annuler défait tout ; couleur ou icône inconnues d'un ancien document ; signature ; Lecture au pixel près de l'éditeur ; PDF lu sur ses pixels (fond, barre, icône, texte dans la boîte, coupe entre deux pages, colonne) ; Word (tableau à deux cellules, icône en image, cellule qui finit par un paragraphe, deux encadrés de suite, largeur du conteneur) ; e-mail ; suivi des modifications - entourer, retirer, signature, et retirer l'encadré puis « Tout accepter » rend le texte seul, sans cadre vide, « Tout refuser » l'encadré d'origine ; retirer garde l'image ou la plage de texte sélectionnées ; le script clique et tape pour de vrai à 700×400, en clair, en sombre et en anglais) **+ `linksBlocks`** (le menu à cinq lignes) **+ `contrast`** (menu, fenêtre, six couleurs du document) **+ `accessRights`** (les deux lignes grisées en Lecture, aucune fenêtre ouverte) **+ `varLoop`** (l'élagage de `loop-rules`) **+ `trackChanges`, `twoColumns`, `tables`, `nesting`** (le nœud est un conteneur de blocs : suite complète, `js/editor.js` est transverse) **+ `readModeFidelity`, `pdfFidelity`, `pdfGroundTruth`, `pdfBatch`, `docx` et `docxImages`** (rendu touché) **+ `codeHygiene`** (CSS, `js/i18n.js`, `index.html`) |
| `js/i18n.js` (clé ajoutée ou retirée, texte d'un pluriel, fonction `t`), `css/*.css` (variable, classe ou id ajouté ou retiré), `index.html` (classe ou id retiré d'un élément que le CSS visait encore) | **Le script Node `codeHygiene`** (sans navigateur, < 1 s : aucune clé i18n, variable CSS ou règle CSS sans usage, aide d'export non recopiée, vocabulaire et pluriels des textes, aucune boîte `prompt()` / `confirm()` du navigateur) **+ `varCondition`, `varLoop`, `varPath`, `varLookup`** quand un texte à nombre change (ils comparent aussi le texte français d'un pluriel) |
| `js/grid-editor.js`, `css/grid.css` (mode grille : garde-fou « un seul tableau », bandeaux A, B, C / 1, 2, 3, largeur de colonne et hauteur de ligne), et ce que la grille ajoute ailleurs : `GRID_LOCKED_IDS` et `setGridMode` de `js/main-toolbar.js`, le chargement par type de `loadTemplateIntoEditor`/`loadMacroIntoEditor` et `applyA4Preview`/`syncA4PreviewForModelType` de `js/main.js`, la bande de la barre de la case (`#v2-cell-bar-dock` d'`index.html`, `dock` / `undock` de `createFloatingPanel` dans `js/editor-core.js`, la branche « grille » de `wireTableFloatingToolbar` de `js/floating-toolbars.js`) et le calque grisé de l'image (`js/floating-toolbars.js`), `rowHeight`, `verticalAlign`, `GridEditor.createExtension` et `getHTML` de `js/editor.js`, `Editor.setTrackChanges`, la branche « grille » de `tableFrom` (`js/pdf-export.js` : hauteurs de ligne, centrage vertical) et la fin de `buildReaderHtml` (`js/comments.js`) | **Toujours `grid` ET les scripts Node `gridMouse` et `tableSelectMouse`** (le geste réel : menu « + », tirer un trait, molette, clavier d'un tableur, glisser pour sélectionner des cases, Lecture, contrastes, 700×400 clair et sombre), plus `pdfFidelity`, `pdfGroundTruth`, `pdfBatch`, `readModeFidelity` et `tables` quand le rendu d'un tableau bouge, `toolbarChrome` (barre d'outils et chargement par type), `tables` (barre de la case, largeurs de colonnes), `autosave` (enregistrement et réouverture), `accessRights`, `trackChanges` et `macroModeles` quand `main.js`/`main-toolbar.js` bouge ; **+ `codeHygiene`** (classes et variables de `css/grid.css`, clés `grid.*`/`toolbar.newGrid`) |
| `js/table-select.js` (défilement tenu au bord du panneau pendant un glissé de cases, `TableSelect.attach` appelé par `js/editor.js`), la règle `.tiptap table .selectedCell::after` (voile de sélection) de `css/editor-v2.css`, `dock` / `undock` / `isDocked` de `createFloatingPanel` (`js/editor-core.js`), le clic de souris et la touche Entrée ou Espace d'un bouton de barre flottante (`createFloatingPanel`), `#v2-cell-bar-dock` (`index.html`, `css/grid.css`), la branche « grille » de `wireTableFloatingToolbar` (`js/floating-toolbars.js`), `pp-editor-hidden` de `syncEditorVisibilityForMode` (`js/main.js`) | **Toujours `tableSelectMouse` ET `gridMouse`** (glisser de case en case à la vraie souris, tableau de document et grille, 700×400 clair et sombre : le rectangle sélectionné, le défilement au bord du panneau, la barre de la case dans sa bande qui ne recouvre aucune case) **+ `grid`, `tables` et `images`** (les barres flottantes de l'image et de la bulle passent par `createFloatingPanel`) **+ `varFormat`, `varZero`, `varCondition`, `varLoop`** (leurs barres flottantes : un clic de souris ou une touche les déclenche une seule fois) **+ `readModeFidelity`** (`pp-editor-hidden`) **+ `toolbarChrome`** **+ `codeHygiene`** (`css/grid.css`, `css/editor-v2.css`, `js/i18n.js` : `grid.cellBar`, `index.html`) |
| `js/xlsx-export.js` (export Excel d'une grille : colonnes `(px − 5) / 7`, lignes `px × 0,75`, cases typées, texte riche, fusions, liens, images, mise en page de la feuille), le crochet `onBadge` de `ReaderMode.preview` (`js/reader-mode.js`), `createSingleWorkbook` et `getXlsxBlobForRecord` (le lot « toutes les valeurs de la table » : un classeur par valeur dans un ZIP, ou un seul classeur d'une feuille par valeur), les lignes « Exporter en Excel… », « … en Excel (ZIP)… » et « … dans un seul classeur… » (`#v2-btn-export-xlsx*` du menu Qualité PDF, `index.html`), `onExportXlsx`, `syncExportRowsForModelType`, `onExportRow`, `onExportBatch` (branche du classeur unique), `BATCH_EXPORTS.xlsxZip` / `xlsxSingle`, `withExportLock` et `exportText` / `GRID_WORDING` de `js/main.js` (les trois lignes Excel grisées hors grille, les deux lignes Word grisées dans une grille, jamais retirées ; dans une grille, « lignes » devient « valeurs de la table » partout où le lot PDF en parle), les clés `toolbar.exportXlsx*`, `status.*Xlsx`, `status.xlsx*`, `status.singleWorkbook*` et `*Grid` de `js/i18n.js`, la liste des dépendances de `dev-tests/.offline-cache/` (ExcelJS) | **Toujours `xlsx` ET le script Node `gridMouse`** (section 11 : les menus à 700×400, clair et sombre, lignes atteignables, grisées ou non, contraste, vrai clic qui télécharge un .xlsx, un ZIP de classeurs et un classeur unique après leur confirmation) **+ `readModeFidelity`** (`preview` est celle de la Lecture) **+ `pdfBatch`, `docx` et `docxImages`** (les deux lignes Word, `withExportLock`, `onExportBatch` partagé avec les lots PDF) **+ `varZero`, `varNumber` et `varFormat`** (la valeur typée d'une case vient de `Variables.zeroHidden` et `formatValue`) **+ `toolbarChrome`** (le menu) **+ `codeHygiene`** (`js/xlsx-export.js` ne lit aucun style calculé ; clés i18n et `index.html`) |
| `dev-tests/helpers.js`, `dev-tests/runner.js` | **Transverse** - même traitement (tout scénario dépend de ces deux fichiers) |

Exemple : un correctif dans `twoColumnsFrom` (`js/pdf-export.js`) ne lance
QUE `scenarios-twocolumns.js` + `scenarios-pdf-fidelity.js` (+ `scenarios-images.js`
si le correctif touche une image en calque dans une colonne) - pas les 10
groupes.

## Démarrage rapide (sans navigateur à piloter à la main)

```bash
bash dev-tests/generate-harness.sh          # régénère _test-harness.html depuis index.html
node dev-tests/run-headless.mjs             # tous les groupes
node dev-tests/run-headless.mjs comments formatting # seulement ces groupes
```

`run-headless.mjs` sert le dépôt, ouvre `_test-harness.html` dans un Chromium
headless (Playwright), pose `.a4-preview`, charge `helpers`/`runner` + le
fichier du groupe, exécute et imprime le rapport. Il sort en code 1 dès qu'un
scénario échoue, donc il s'utilise tel quel avant un commit ou dans un runner
CI. **Un navigateur neuf par groupe**, à dessein : ce README documente plus bas
des fuites d'état entre suites, un processus par groupe rend chaque verdict
indépendant de l'ordre de lancement.

Il attend **« Widget prêt. »** dans `#status-msg` avant de charger le moindre
scénario, et pas seulement l'existence de l'éditeur : `.tiptap` existe déjà en
0×0 pendant que `main.js:init()` tourne encore, et `execCommand('insertText')`
renvoie `false` tant que l'éditeur n'a pas sa vraie taille - les scénarios qui
tapent du texte échouent alors avec des notes de diagnostic vides, ce qui
ressemble à une régression sans en être une.

Deux options utiles :

- `--port 8899` si 8843 est déjà pris (plusieurs runs en parallèle).
- `--probe "<expression JS>"` ouvre le harnais, évalue l'expression (`await`
  supporté) et imprime le résultat, sans exécuter aucun scénario - pour
  inspecter l'état réel de la page avant d'écrire un test.
- Un second script Node, `varToolbarMouse` (`dev-tests/verify-var-toolbar-mouse.mjs`), clique
  à la vraie souris, à 700×400, la barre d'une bulle #Variable puis ses trois fenêtres (condition, autres
  attributs, boucle ; choix de la clé par-dessus) : icônes, Enregistrer/Insérer/Valider atteignables et non recouverts ;
  Copier / Coller la condition d'une variable sur une autre (souris, puis Tab et Entrée pour le focus) ; case « Reprendre
  la condition d'affichage » des autres attributs (cochée, décochée, condition longue, panneau de 360 px) ; bouton « Remplacer » des autres attributs (entre « Annuler » et « Insérer », grisé tant que rien n'est coché, vrai clic puis bulle sélectionnée et sa barre de retour à côté d'elle, un Ctrl+Z, Tab puis Entrée, trois boutons sur une ligne à 360 px) ; barre d'une
  bulle nombre : bouton « 0 / Ø » du zéro (atteignable, enfoncé par défaut, vrai clic qui l'allume et l'éteint, réglage gardé après
  un clic sur FR, barre qui passe à la ligne et reste dans la fenêtre à 360 px) ; bulle sélectionnée puis vrai clic sur « Lecture » ou
  Entrée sur le bouton : aucune barre flottante n'est affichée (ni en haut à gauche), puis « Édition » et un clic sur la bulle la rouvrent ;
  bulle ou image sélectionnée puis vrai clic sur le texte d'état (l'éditeur a le focus : c'est seulement alors que son blur rouvrait la barre) :
  la barre se ferme, un clic dans la barre ne la ferme pas, un clic sur l'objet la rouvre.
- Un troisième, `smallPanel` (`dev-tests/verify-small-panel.mjs`), rejoue à la vraie souris et au vrai clavier le
  petit panneau Grist (600 à 800×400) : info-bulles de la barre entières et visibles sur une vraie capture,
  page jamais décalable, pas d'info-bulle collée après un clic puis Échap, email+Cci lisible, hauteur de
  barre indépendante du message d'état, popups #Variable/commentaires/image tenus dans la fenêtre, menus au
  survol (`.v2-hover-group`) qui restent ouverts quand la souris y descend ou en remonte lentement (un pixel
  par pas, état relevé à chaque pas : un geste d'un seul bond saute la bande de 2px et ne voit rien), et
  sans petit point bleu au coin des boutons de ces menus (retiré à la demande d'Antoine le 29/09 ; comparé sur
  une vraie capture au coin opposé du même bouton, à ne pas remettre sans lui demander).
  Sections lançables seules : `node dev-tests/verify-small-panel.mjs popups email menusSurvol`.
- Un quatrième, `accessRightsMouse` (`dev-tests/verify-access-rights-mouse.mjs`), démarre à 700×400 avec des
  droits déjà réglés (lecture seule, sans export, commentaires permis) : widget ouvert directement en Lecture,
  vrais clics sur des commandes grisées sans effet, texte sélectionné en glissant la souris dans le mode Lecture,
  Commenter puis Publier cliqués pour de vrai.
- `readModeMouse` (`dev-tests/verify-read-mode-mouse.mjs`) ouvre à 700×400, en thème clair puis sombre, un modèle avec tous les droits (aucun réglage) et passe
  en Lecture à la vraie souris : les cinq boutons d'insertion doivent y être grisés AUX PIXELS d'une vraie capture (moins de 60 % de leur encre d'Édition),
  cinq vrais clics dessus ne modifient ni le document ni le modèle enregistré (plus d'un tick d'auto-save), réglages, aperçu A4 et export restent actifs, puis
  l'Édition retrouve ses boutons et un vrai clic sur Tableau insère un tableau. Avant le correctif du 29/09 (audit UX/UI, F1), la barre restait active derrière
  l'éditeur masqué : trois clics suffisaient à modifier le modèle enregistré sans rien montrer.
  Deuxième partie (`runCommentsTheme`, choix d'Antoine du 30/09 « Commenter dans la Lecture ») : dans ce même mode Lecture choisi, l'éditeur masqué garde une
  sélection (« Bonjour ») qui n'a rien à voir avec ce que la personne sélectionne dans la Lecture. Commenter sans texte sélectionné dans la Lecture affiche
  l'alerte et ne pose rien ; « le contrat » glissé à la souris puis Commenter pose la marque sur ce texte (jamais sur « Bonjour »), surlignée dans la Lecture, la
  fenêtre collée à elle dans le panneau ; Publier enregistre le modèle et le fil ; un vrai clic sur le texte surligné rouvre le fil ; en Édition, la marque est
  sur le même texte. Avant, Commenter posait sa marque sur le texte masqué, enregistrée sans rien montrer, avec la fenêtre dans le coin haut gauche. Dans la
  page : `access_read_mode_comment_lands_on_the_reader_selection`, `access_read_mode_comment_without_reader_selection_alerts_and_writes_nothing` et
  `access_read_mode_without_comment_right_shows_no_comments` (groupe `accessRights`).
- `settingsWindowMouse` (`dev-tests/verify-settings-window-mouse.mjs`) ouvre les Réglages à 700×400, en thème clair puis sombre et en français puis en anglais, et
  mesure la fenêtre à la vraie souris : 480 px de large, les six onglets sur une seule ligne sans être coupés, la fenêtre entière dans le panneau sans défiler,
  « Fermer » dans la fenêtre et atteignable (`elementFromPoint`) sur chaque onglet, seul le contenu de l'onglet Accès défile à la vraie molette (« Fermer » ne
  bouge pas, la dernière ligne d'aide devient visible), un vrai clic sur « Fermer » ferme. Avant le correctif du 29/09 (audit UX/UI, F2), la fenêtre faisait
  360 px, les onglets passaient sur deux ou trois lignes, « Fermer » sortait du panneau sur l'onglet Accès et « Crédits » n'était plus atteignable. Le scénario
  `settings_window_holds_six_tabs_on_one_row_and_only_the_panel_scrolls` (groupe `toolbarChrome`) en garde la structure à toute taille de fenêtre : largeur, onglets,
  un seul panneau affiché à la fois (un `display` posé sur `.settings-panel` battrait `[hidden]`), défilement porté par la zone de contenu (`.settings-body`, qui
  contient le panneau affiché) et non par la fenêtre ni par les onglets. Le script Node mesure « ce qui fait défiler l'onglet » (le premier ancêtre du panneau à
  défilement vertical), donc reste valable quelle que soit la structure de la fenêtre.
- Un cinquième, `columnSearchMouse` (`dev-tests/verify-column-search-mouse.mjs`), ouvre à 700×400 les fenêtres qui
  proposent un choix de colonne (condition d'affichage d'une bulle, filtre et « Trier par » d'une boucle, règles et listes de modèles d'un macro-modèle,
  Réglages > Accès (la table et les colonnes), menu « Image depuis une variable » de la barre ; sections `condition`, `loop`, `loopSort`, `macro`, `macroTables`, `ruleRows`, `access`, `imagePicker`, `hashList`, `values`, `boolValues` et `withoutComponent` lançables seules ; `condition` mesure la liste à plat de la fenêtre de condition (aucun intitulé, « ann » retrouve les colonnes de CsAnnuaire) ; `macroTables` mesure la colonne d'une règle de macro-modèle, en clair et en sombre (« role » retrouve CsContacts.Role dans la liste unique, sans intitulé de table ; une table pas encore liée ouvre la clé par-dessus le macro-modèle, entière dans le panneau et au premier plan ; Échap, Annuler et Valider remettent ou gardent la colonne ; une table liée n'ouvre plus rien) ; `hashList` mesure la liste « # » du corps à la vraie frappe (les colonnes de la table de la page en tête, avec ou sans lettres tapées ; flèches et Entrée suivent l'ordre affiché) et la fin de `imagePicker` y ajoute la table de la page en tête du menu Image ; `values` mesure le champ Valeur d'une règle (colonne à choix, Référence, 1 201 valeurs plafonnées à 500 lignes avec leur ligne « Encore… » et la molette jusqu'en bas, grisage par « vide », « Autre valeur… », condition d'une bulle et macro-modèle, en clair et en sombre) ; `boolValues` mesure le champ Valeur d'une colonne Oui / Non (la liste Choisir / Oui / Non au vrai clic et au clavier, sans champ libre, grisée par « vide », une valeur enregistrée non reconnue visible puis remplacée, les opérateurs sans sens grisés et sautés par les flèches du vrai clavier, « Actif > Oui » enregistré avant gardé tel quel, condition d'une bulle et macro-modèle, clair et sombre, puis en anglais) ; `ruleRows` mesure la règle d'une annexe du macro-modèle (deux lignes, aucun contrôle qui en recouvre un autre, la croix retire la règle entière) et vérifie que la fenêtre de condition et le filtre d'une boucle, qui partagent les classes `.macro-rule-*`, gardent leur ligne unique, en clair et en sombre ; la dernière recharge la page sans `js/search-select.js` : chaque choix de colonne doit rester la liste native (le menu Image, la liste simple d'avant), qui marche) et s'en sert comme une personne : clic sur le champ visible
  (le `<select>` est masqué par la liste avec recherche, `js/search-select.js` : Playwright ne peut plus le
  sélectionner), frappe, molette sur la liste, clic sur le résultat, Échap, Tab. Il vérifie que le panneau de la liste
  tient dans la fenêtre Grist, que ses lignes et la saisie avancée sont au premier plan, et que ni la page ni la fenêtre
  ne bougent.
- Un sixième, `tableUndoKeyboard` (`dev-tests/verify-table-undo-keyboard.mjs`), appuie pour de vrai sur Ctrl+Z et Ctrl+Y (`page.keyboard`) à 700×400
  dans un tableau qui a des largeurs de colonnes : tableau inséré par le bouton de la barre, bordure glissée à la vraie souris, colonne ajoutée par
  la barre du tableau ; puis un modèle enregistré avec ses largeurs (du texte tapé, puis une colonne ajoutée avant la première), puis un tableau presque
  aussi large que la page. Il exige qu'un seul Ctrl+Z ramène le tableau exactement à son état d'avant (HTML identique), le suivant l'action précédente,
  et que Ctrl+Y les rejoue dans l'ordre. Avant le correctif du 29/09 (js/editor.js), la correction de largeurs d'`onUpdate` formait son propre
  événement d'historique : Ctrl+Z ne défaisait qu'elle, `onUpdate` la rejouait aussitôt, et l'ajout de colonne ne s'annulait jamais.
- `tableWidthsMouse` (`dev-tests/verify-table-widths-mouse.mjs`, 23 vérifications) redimensionne un tableau à la vraie souris à 700×400 (Aperçu A4, le réglage par
  défaut), l'enregistre, puis change de modèle à la vraie souris par la liste des modèles : d'abord éditeur visible (témoin), puis en passant par un macro-modèle,
  puis en Mode lecture, deux cas où l'éditeur est masqué (`display:none`) pendant que le modèle se charge. Il exige que le tableau retrouve ses largeurs, dans le
  document comme à l'écran, dans la Lecture, et dans la ligne relue après un clic sur Enregistrer ; qu'un tableau plus large que la page soit ramené dans la page
  au retour de l'éditeur comme à un chargement éditeur visible ; et que les colonnes automatiques d'un tableau mixte restent automatiques tant que l'éditeur est
  masqué, puis soient figées à leur largeur affichée à son retour. Avant le correctif du 01/10 (`js/editor-core.js`, `js/editor.js`, `js/main.js`),
  `clampOverflowingTables` mesurait la page d'un éditeur masqué (`clientWidth` 0 moins le padding des marges : une largeur négative) et ramenait toutes les
  colonnes à 25 px : 10 vérifications sur 23 échouent sur l'ancien code, et le premier Enregistrer écrasait les largeurs du modèle. Les cas équivalents en page,
  l'éditeur masqué à la main, sont dans le groupe `tables` (`table_*_hidden_editor`).
- `layerImagesMouse` (`dev-tests/verify-layer-images-mouse.mjs`, 17 vérifications) charge à la vraie souris, à 700×400 (Aperçu A4), un ancien modèle dont l'image en calque n'a
  que `left` / `top` (pas de position de page), d'abord éditeur visible (témoin : l'image reçoit sa position de page), puis après un macro-modèle et en Mode lecture, deux cas
  où l'éditeur est masqué (`display:none`) pendant le chargement. Il exige que rien ne soit mesuré tant que l'éditeur est masqué, que la position de page soit celle du
  témoin au retour (pas le coin de la page, -marge / -marge), que la ligne relue après une frappe au vrai clavier et un clic sur Enregistrer la porte aussi, et qu'un modèle récent
  garde la sienne (aucune réécriture par l'auto-save). Avant le correctif du 01/10 (`js/header-footer-preview.js`, `js/editor.js`), `migrateLegacyImagePositions` mesurait un éditeur
  masqué où tous les rectangles valent 0 : l'image recevait -28 pt / -28 pt, qui s'enregistraient à la première frappe ou au premier Enregistrer, sans jamais être recalculés :
  5 vérifications sur 17 échouent sur l'ancien code. Les cas équivalents en page sont dans le groupe `images` (`image_legacy_layer_hidden_*`, `image_layer_with_page_grid_*`).
- `headerFooterMouse` (`dev-tests/verify-header-footer-mouse.mjs`, 25 vérifications) clique à la vraie souris à 700×400 (Aperçu A4) dans la zone d'en-tête puis dans celle de pied,
  « Terminer » sans rien écrire ; tape un texte au vrai clavier dans l'en-tête, le garde, puis l'efface avec Ctrl+A et Suppr ; vérifie à chaque étape ce que le modèle
  garde (`Editor.getHeaderFooterData()`), la ligne relue après un clic sur Enregistrer, et les bandes que la Lecture ouvre au-dessus et au-dessous de la feuille ; enfin
  il ouvre par la liste des modèles un modèle enregistré avec un en-tête « activé » vide. Il exige que rien ne reste activé quand les deux zones sont vides (ni première page
  différente, ni fragment « <p></p> » gardé), que la zone qui a du contenu reste, et qu'aucune bande blanche de 26 px n'apparaisse en Lecture. Avant le correctif du 01/10
  (`js/header-footer-preview.js`, `exitHeaderFooterMode` gardait le « <p></p> » de l'éditeur et l'état activé posé à l'entrée) : 13 vérifications sur 25 échouent sur l'ancien
  code. Les cas équivalents sans souris sont dans le groupe `headerFooter` (`hf_click_then_done_without_typing_leaves_nothing_enabled` et les cinq suivants).
- `macroImagesMouse` (`dev-tests/verify-macro-images-mouse.mjs`, 20 vérifications) ouvre à la vraie souris, à 700×400 (Aperçu A4), un macro-modèle de trois courriers qui ont chacun
  une image en calque (derrière, devant, derrière ; le premier sur deux pages et plus), d'abord à position de page (modèles enregistrés par l'éditeur actuel) puis sans (anciens
  modèles, `left` / `top` seulement). Il passe en Mode lecture et mesure la distance de chaque image au titre de SON courrier (celle qu'a ce courrier lu seul : `top` CSS moins
  la marge haute de la feuille, divisée par le zoom du panneau), puis clique le vrai bouton « Exporter en PDF », reçoit le fichier que Chromium télécharge et le relit avec
  pdf.js : une seule image sur la page de chaque courrier, à la position de page de son modèle (pour un ancien modèle, à la distance de son titre qu'a ce courrier exporté
  seul par le même bouton, ouvert en Mode lecture pour qu'il garde sa forme d'ancien modèle). Un modèle ordinaire lu seul ne bouge pas. Avant le correctif du 01/10 (`js/macro-templates.js`, `js/reader-mode.js`, `js/pdf-export.js`) le `top` et la page d'une image, comptés depuis le haut
  de la première page de SON modèle, étaient gardés tels quels une fois les courriers mis bout à bout : les trois images s'empilaient en haut du premier courrier (PDF :
  trois images sur la page 1, aucune sur les suivantes) : 8 vérifications sur 20 échouent sur l'ancien code. Les cas équivalents en page sont dans le groupe `macroModeles`
  (`macro_layer_images_*`, `macro_legacy_layer_images_*`, `macro_build_concatenated_html_marks_slot_starts`) et, pour les deux défauts du PDF qui touchent aussi un modèle seul de
  plusieurs pages (indices décalés par les images déjà insérées ; image « derrière » d'une page suivante peinte sur la page d'avant), dans `pdfFidelity`
  (`pdffid_layered_images_on_page_two_stay_on_page_two`).
- Un septième, `chipCellMouse` (`dev-tests/verify-chip-cell-mouse.mjs`), met à 700×400 des bulles #Variable aux noms de 40 caractères et plus dans des
  cases de tableau de ~100 px (dont une bulle formatée, une bulle en boucle et une bulle cassée) et s'en sert à la vraie souris : survol (le nom entier en
  info-bulle seulement quand il est coupé, le message d'une bulle cassée intact), clic (la bulle est sélectionnée, la barre de variable atteignable), Ctrl+C
  (la bulle entière dans le presse-papiers), bordure de colonne glissée à droite puis à gauche (la bulle se redéploie puis se recoupe toute seule). Il exige
  que chaque bulle reste dans son paragraphe, sur une ligne, avec le début coupé par « … », un repère « #… » toujours visible (jamais une tranche de « # »
  sans « … ») et la fin du nom calée à droite (elle se coupe par la gauche : le bout du nom reste lisible, c'est la fin qui distingue une variable d'une autre),
  que la fin soit le dernier mot du nom quand la case a la place, que `getHTML()` garde le nom entier dans un seul texte, qu'une bulle hors tableau garde son
  rendu en ligne et que le point bleu du format (hors de la boîte de la bulle) ne soit pas rogné. Il rejoue aussi la capture « Budget validé » d'Antoine
  (colonne de 118 px, Details_depense_s_Fonctionnement / Investissement / Personnel) et balaie les largeurs de colonne de 96 à 200 px.
  Même règle dans les deux colonnes d'une zone 2 colonnes (Antoine, 29/09 : « Oui, les deux colonnes ») : le test y met 11 bulles (colonne de gauche à 26 %, dont
  un nom en plein texte, dans une puce de liste, avec format et en boucle ; colonne de droite avec un nom de ~110 caractères), exige une seule ligne par bulle,
  le nom coupé seulement quand la colonne est trop étroite (les noms qui tiennent restent entiers, sans info-bulle), puis glisse la poignée de la zone à la vraie
  souris : colonne de gauche élargie, les noms y sont entiers ; ramenée, ils sont de nouveau coupés, chacun dans sa colonne.
  Avant le correctif du 29/09 (`js/editor-nodes.js`, `css/variable-actions.css`), la bulle traversait sa case (jusqu'à 190 px de trop) et recouvrait la voisine ;
  la première version du correctif laissait, entre deux largeurs, une tranche de « # » sans « … » et une fin qui commençait au milieu d'un mot. Dans une colonne
  de zone, un nom long passait sur 2 ou 3 lignes (`overflow-wrap: anywhere`, css/style.css) : la zone du document d'Antoine faisait ~940 px dans l'éditeur, ~910 px
  avec la coupure (la colonne de droite décide alors de la hauteur).
- Un huitième, `codeHygiene` (`dev-tests/verify-code-hygiene.mjs`), est du Node pur, sans navigateur (moins d'une seconde) : il lit les sources et refuse
  ce que rien n'appelle plus et qu'aucun test fonctionnel ne peut voir. Une clé de `js/i18n.js` que ni un script ni `index.html` ne demande (ni comme
  chaîne, ni par un préfixe construit comme `'varLoop.repeat.' + kind`), une clé déclarée deux fois, une variable CSS déclarée que personne ne lit, une règle
  CSS dont chaque sélecteur vise une classe ou un id que ni `index.html`, ni un script, ni un modèle de la galerie ne produit. Il est permissif à dessein
  (un nom cité seulement dans un commentaire compte comme utilisé) : il ne doit jamais faire échouer un changement légitime. Une classe posée par une
  bibliothèque (TipTap, prosemirror-tables) va dans `LIBRARY_CLASSES`, avec sa source. Il refuse aussi qu'une aide d'export (chargeur de script CDN,
  téléchargement d'un Blob, mesure des colonnes d'un tableau, hôte de mesure, résolution des variables d'en-tête/pied) soit recopiée dans un exporteur au lieu
  d'être appelée dans `js/export-common.js`. Même règle pour la conversion du numéro de page (« Page n », « n/total »), qui n'existe que dans `js/page-layout.js`. Enfin, le vocabulaire que la personne lit (choix d'Antoine du 29/09) : « modèle » et jamais « template » dans les textes français, un pluriel écrit
  `{n|singulier|pluriel}` (`I18n.t` choisit la forme selon la langue : 0 et 1 au singulier en français, seul 1 en anglais ; le texte d'une variable n'est jamais lu comme un
  pluriel) et jamais « ligne(s) », une seule option vide de liste (« — Choisir une colonne — », tirets longs), « macro-modèle » avec un trait d'union. Avant le
  nettoyage du 29/09, il aurait relevé 3 clés i18n, 6 variables CSS, 7 règles CSS mortes et 9 copies d'aides
  d'export. Dernière règle (29/09, « Saisies et confirmations ») : aucun `prompt()` ni `confirm()` du navigateur dans `js/` (les `alert()` restent), et chaque
  `Dialogs.prompt` / `Dialogs.confirm` / `Dialogs.choose` est appelé avec `await` (ou `return`) : une promesse est toujours « vraie », `if (!Dialogs.confirm(...)) return;` ne
  s'arrêterait jamais et une suppression partirait sans réponse.
- `englishTextsMouse` (`dev-tests/verify-english-texts-mouse.mjs`, 49 vérifications) démarre à 700×400 avec l'interface en anglais (`pp_lang`) et lit, à la vraie
  souris et au vrai clavier, les sept textes que l'audit UX/UI du 29/09 (constat F7) trouvait en français : les zones fantômes « + Add a header » / « + Add a footer »
  (survolées, libellé visible et non rogné, un clic ouvre l'édition de l'en-tête ; une zone survolée s'agrandit et pousse la page, donc la souris est libérée avant
  de mesurer la zone visée), la ligne « Roboto (default) » du menu de police (choisir Georgia puis cette ligne applique puis retire la police), le sommaire (texte
  anglais dans l'éditeur, dans `getHTML()` et dans le presse-papiers à Ctrl+C ; un modèle enregistré en français garde son sommaire et se réenregistre avec le
  texte anglais), puis le mode Lecture (« Table of Contents », « No heading found. », « Warning: some variables could not be resolved. » pour une variable qui
  ne se résout pas, puis le message de cette variable : « [ERROR: no matching configured for Contrats — …] » et celui du chip Email dont l'adresse ne se lit pas :
  « [Email unavailable] », le faux Grist du harnais ne donnant aucune adresse). Il passe ensuite en français par Réglages, sans
  recharger : les zones fantômes et la ligne Roboto suivent tout de suite, le reste au rendu suivant, avec les textes d'origine. Avant le correctif du 29/09, 13 de ses 45 vérifications échouaient (les deux zones, la ligne Roboto, le texte du sommaire
  enregistré et copié, les trois textes du mode Lecture) ; les deux vérifications du message d'erreur sont venues avec le push suivant (carte d'Antoine « Oui, les
  deux »), et deux autres (le chip Email, en anglais puis en français) avec celui d'après (carte « Traduire ») : l'anglais échouait avant. Le titre du sommaire des exports DOCX et
  PDF, la phrase « aucun titre » du sommaire DOCX et les autres messages d'erreur d'une variable sont vérifiés en page (`docx`, `pageBreakToc`, `varPath`, `chips` :
  « Table of Contents » / « Sommaire », dont le repli du PDF, « (no heading in this document) », les cinq messages dans les deux langues et le chip Email).
- `linksBlocksMouse` (`dev-tests/verify-links-blocks-mouse.mjs`, 58 vérifications) ouvre à 700×400, en clair puis en sombre puis en anglais, le menu à une icône qui réunit « Lien… » (avec son raccourci Ctrl+K), « Citation », « Bloc de code », « Encadré… » et « Bloc de signature » (`js/link-dialog.js`, `js/callout.js`, `js/main-toolbar.js`) et s'en sert à la vraie souris et au vrai clavier : survol de l'icône (le volet s'ouvre dans le panneau, ses cinq lignes sont au premier plan, il se referme quand la souris part), clic sur « Lien… » après un double-clic qui sélectionne un mot (fenêtre entière dans le panneau, titre, champ et boutons au premier plan, focus dans le champ, adresse refusée = message sous le champ sans que la fenêtre ou le document bougent, « exemple.fr » + Entrée pose `https://exemple.fr` et rend le clavier à l'éditeur), Ctrl+K sans passer par la barre (Tab tourne dans la fenêtre, Échap la ferme en gardant la sélection, une adresse e-mail devient un lien `mailto:`), lien existant (un clic simple n'ouvre rien, le survol montre l'adresse et « Ctrl+clic pour ouvrir » dans le panneau, Ctrl+K rouvre « Modifier le lien » avec « Retirer le lien », Ctrl+clic ouvre un nouvel onglet), sans sélection (le champ « texte à afficher » s'ajoute : c'est l'état le plus haut de la fenêtre, avec l'erreur affichée, il doit tenir dans 400 px), bloc de code et citation par leurs lignes (la ligne du bloc de code est active, « Lien… » grisée ne reçoit pas la souris, un clic dessus n'ouvre rien). La souris descend de l'icône sur la ligne en ligne droite : une diagonale vers le milieu d'une ligne large sort un instant de l'icône avant d'entrer dans le volet (coin de 4 px à droite de l'icône), comme pour les autres volets au survol. `LINKS_SHOTS=<dossier>` enregistre aussi des captures à relire à l'œil.
- `calloutMouse` (`dev-tests/verify-callout-mouse.mjs`, 64 vérifications) ouvre à 700×400, en clair puis en sombre puis en anglais, la ligne « Encadré… » du même menu (`js/callout.js`) et la ligne « Bloc de signature », à la vraie souris et au vrai clavier : le volet et ses cinq lignes dans le panneau ; la fenêtre entière dans le panneau, sans défiler, avec son aperçu sur une feuille blanche dans les deux thèmes, le focus sur « Note » ; un clic sur un type, une couleur, une icône puis « Insérer » (le paragraphe entre dans l'encadré, la fenêtre se ferme, le clavier est dans l'éditeur ; fond, barre de 4 px, icône et texte à 44 px du bord mesurés à l'échelle de la feuille, qui est réduite à 700 px) ; au clavier : flèches, Début et Fin, Tab et Maj+Tab qui ne sortent pas de la fenêtre, Échap qui rend le clavier au même endroit, Entrée qui valide ; frappe dans l'encadré et Entrée deux fois pour en sortir ; la ligne « Modifier l'encadré… » quand le curseur y est, « Retirer l'encadré », un seul Ctrl+Z pour tout remettre ; la signature (deux colonnes, chaque ligne de tirets bas sur une seule ligne à 700 px, le clavier dans la légende de gauche, un Ctrl+Z pour la frappe puis un pour le bloc) ; en anglais, les textes et la fenêtre dans le panneau. Il note aussi tout avertissement de ProseMirror (sélection invalide, contenu refusé) : aucun ne doit sortir. `CALLOUT_SHOTS=<dossier>` enregistre aussi des captures à relire à l'œil.
- `gridMouse` (`dev-tests/verify-grid-mouse.mjs`) ouvre à 700×400, en clair puis en sombre, le mode grille (`js/grid-editor.js`) à la vraie souris et au vrai clavier : « + » puis « Nouvelle grille » choisie au survol et au clic (une grille déjà modifiée ouvre d'abord « Modifications non enregistrées » : l'aide `freshGrid` clique « Abandonner »), les bandeaux et la première case atteignables (`elementFromPoint`), aucune feuille A4 ; tirer le trait A|B de 60 px (colonne à 160 px en direct, info-bulle « 160 px », curseur `col-resize`, aucune transaction avant le relâcher, UNE à la fin, un seul Ctrl+Z), tirer le trait sous le 1 (ligne à ~68 px), le plancher d'une ligne (la hauteur de son texte), Échap qui annule ; un clic sur une lettre, un numéro ou le coin sélectionne (15, 6 ou 90 cases), Suppr vide et Ctrl+Z rend ; Tab, 30 flèches bas et 12 flèches droite qui ne sortent jamais du tableau, Ctrl+A ; la barre de la case fixée dans sa bande au-dessus de la grille (jamais sur une case ni sur un bandeau, la même place quelle que soit la case courante) ; les bandeaux collés à la molette (vertical, puis horizontal une fois la colonne A élargie) ; contrastes des bandeaux et du cadre de la case ; la Lecture d'une grille large au vrai bouton « Lecture » (12 colonnes de 100 px qui gardent leur largeur et défilent à la molette, ligne de 60 px, texte au milieu de sa case, bulle remplacée par sa valeur, aucune ligne vide dessous, texte >= 4,5:1) puis « Édition » qui rend les bandeaux. Le groupe `grid` (`dev-tests/scenarios-grid.js`) vérifie la logique dans la page (évènements de pointeur synthétiques, un témoin sans le garde-fou pour chaque commande refusée) et, depuis le lot A2, l'alignement vertical des cases enregistré avec le modèle (`data-valign`, grille sans ligne vide finale, ancien modèle relu « au milieu », `vertical-align` collé d'Excel ignoré hors grille), la Lecture comparée à l'éditeur (largeurs, hauteurs, texte à la même hauteur : au milieu, en haut, en bas) et le PDF comparé à l'éditeur (hauteurs de ligne, texte peint à la même hauteur lu par pdf.js, grille large ramenée à la largeur de la page, tableau de document inchangé).
- `tableSelectMouse` (`dev-tests/verify-table-select-mouse.mjs`) sélectionne des cases en GLISSANT la souris, à la vraie souris (`page.mouse`), à 700×400, en clair puis en sombre, dans un tableau de document puis dans une grille (demande d'Antoine du 01/10). Tableau de document : six glissés (de droite à gauche puis vers le bas, en colonne, en ligne, en diagonale vers le haut, de deux cases voisines, vers la gauche) donnent exactement le rectangle entre les deux cases, un glissé qui commence sur le texte aussi, Maj + clic étend ; une case sélectionnée, colorée ou non, reçoit un voile bleu translucide (`::after` aussi grand que la case : la couleur de fond ne le cache plus) et son texte y reste lisible (≥ 4,5:1) ; bouton tenu au bord du bas puis au-dessus du panneau (sur la barre d'outils), le plan de travail défile tout seul et la sélection suit jusqu'à la dernière ligne, puis remonte (`js/table-select.js`). Grille : la bande de la barre de la case (`#v2-cell-bar-dock`) est entre la barre d'outils et le plan de travail, la barre y est visible et ne recouvre ni une case ni un bandeau quelle que soit la case courante (A1, B2, D3, C5, F6) ; 24 glissés curseur dans A1, 24 curseur dans D5 (chaque case du bloc vers sa voisine en diagonale) : aucun appui ne tombe sur la barre (elle recouvrait les cases voisines de la case courante) ; grille de 15 lignes puis de 12 colonnes, bouton tenu au bord du bas puis de droite : elle défile et la sélection va jusqu'à la ligne 15 et la colonne L, les bandeaux restent collés ; un vrai clic sur « Insérer une ligne après » ajoute UNE ligne (pas deux), la barre se déclenche aussi à Entrée et à Espace ; la Lecture masque la bande et le retour à l'édition la rend ; hors d'une grille, la barre flotte comme avant au-dessus du tableau, bande masquée. Contenu réel d'un document (précision d'Antoine : il parlait d'abord d'un tableau de document) : bulles de variables, zone répétée, condition, liens, images, cases fusionnées, en-tête coloré, suivi des modifications allumé, curseur déjà dans le tableau (barre ouverte) : le glissé donne le bon rectangle et chaque case est sous le voile. Mesuré sur l'ancien code (`0dc5e4c`) : 40 des 67 mesures échouent (voile, défilement, barre qui recouvre six cases, appuis qui tombent sur ses boutons).
  Section 11 (lots D et E) : le menu Qualité PDF au vrai survol, à 700×400 en clair et en sombre : les cinq lignes d'export (Word, Word en ZIP, Excel, Excel en ZIP, classeur unique) sont atteignables (`elementFromPoint`) et entièrement dans le panneau, les deux plus longues comprises ; les trois lignes Excel actives et les deux lignes Word grisées dans une grille, l'inverse dans un document, aucune retirée ; un vrai clic sur une ligne grisée ne télécharge rien et n'ouvre aucune confirmation ; un vrai clic sur « Exporter en Excel… » télécharge un .xlsx (une archive qui commence par `PK`) et le coin d'état le dit ; un vrai clic sur « … en Excel (ZIP)… » puis sur « Continuer » dans la confirmation (qui tient dans le panneau, parle d'Excel et de valeurs, jamais de PDF ni de lignes) télécharge « -export-xlsx.zip » avec un classeur dedans, et un vrai clic sur « … dans un seul classeur… » télécharge « -export.xlsx » ; le menu « Exporter en PDF » d'une grille dit « valeurs de la table » dans ses deux lignes, sans « lignes » ; le texte des lignes (grisées comprises) à 4,5:1 au moins.
- Le groupe `xlsx` (`dev-tests/scenarios-xlsx.js`, 23 cas) ouvre le fichier que produit « Exporter en Excel… » (`js/xlsx-export.js`) comme `docx` ouvre un .docx : le .xlsx est dézippé (JSZip) et son OOXML lu par `openXlsx`, un lecteur propre au fichier de test (feuilles, `<cols>`, hauteurs de lignes, cellules et leur type, `styles.xml` résolu : format de nombre, police, fond, bordure, alignement ; chaînes partagées et passages de texte riche, fusions, liens, dessins), jamais les objets ExcelJS d'entrée. Il vérifie qu'une grille devient une feuille de mêmes colonnes (largeur `(px − 5) / 7`), lignes (hauteur `px × 0,75`) et textes ; qu'une case qui ne contient QUE ce nombre ou cette date est un vrai nombre ou une vraie date au format de la bulle (français, puis anglais : `mm/dd/yyyy`, devise devant) alors que du texte autour, deux bulles, un nombre en lettres, une date amputée, un zéro masqué, plus de 15 chiffres, une date avant 1900 ou une condition fausse restent du texte ou du vide ; gras, italique, souligné, barré, couleur, taille et police en texte riche ; des couleurs qui ne viennent que de ce que la personne a posé (jamais de blanc sur blanc en thème sombre) ; les fusions et le filet gris de chaque case ; paragraphes, listes et sauts de ligne ; liens (cliquables seulement quand ils couvrent la case, `javascript:` retiré, un texte qui commence par `=` jamais écrit comme formule) ; images ; nom de feuille valide ; A4 sur une page de large, paysage ; la ligne d'une grille répétée par une zone « ligne » qui garde le nombre de chacune de ses lignes ; un document sans tableau ; le menu (les cinq lignes d'export grisées selon le type de modèle et jamais retirées, clic d'une ligne grisée sans effet ni confirmation, clic d'« Exporter en Excel… » qui télécharge le classeur de la ligne courante, alerte d'une ligne non sélectionnée qui parle d'Excel et non de PDF, en français et en anglais) ; un bloc de texte conditionnel (`js/conditional-text.js`) dans une case, résolu comme à la Lecture (contenu gardé sans cadre, une bulle seule restant un vrai nombre, bloc faux retiré et case vide gardant son filet, blocs emboîtés) ; et, pour « toutes les valeurs de la table » (lot E), l'archive ZIP (un classeur d'une feuille par valeur, nommé par le modèle de nom de fichier, ses vrais nombres), le classeur unique (une feuille par valeur nommée comme son fichier, 31 caractères au plus, caractères interdits ôtés, « nom (2) » quand deux feuilles s'appellent pareil, avec ses largeurs et ses hauteurs), la confirmation, la progression et la fin qui parlent d'Excel (jamais de PDF, de DOCX ni de lignes), les contrôles rendus à la fin, une valeur qui échoue en cours de feuille sans laisser de feuille à moitié écrite (la feuille est retirée, son nom est rendu) et les mots d'une grille (« valeurs de la table » dans les quatre lignes « toutes les valeurs », la confirmation et le message d'une table vide du lot PDF, qui redeviennent « lignes » dans un document et suivent un changement de langue). Le fichier a aussi été relu une fois par openpyxl à l'écriture du lot ; LibreOffice n'est pas utilisable dans ce bac à sable (pas de module Calc). ExcelJS est chargé à la demande depuis cdnjs, avec son SRI, au premier export Excel : le miroir hors ligne le sert (`bash dev-tests/offline-deps.sh` ; un cache construit avant ce lot n'a pas `umd/exceljs.min.js`, seuls `xlsx` et la section 11 de `gridMouse` échouent alors).
- Un neuvième, `modalBaseMouse` (`dev-tests/verify-modal-base-mouse.mjs`), ouvre à 700×400, en clair puis en sombre, les trois fenêtres de la base commune
  (`js/modal-base.js`) - Condition d'affichage, Autres attributs, Boucle - et les fait déborder (quatre règles de plus, une liste de seize colonnes, deux
  filtres de plus). Il exige, à la vraie molette, que le titre et la ligne de boutons ne bougent pas du haut au bas du contenu (le cadre ne défile pas, la
  page et l'éditeur derrière non plus) ; au vrai clavier, que Tab et Maj+Tab fassent le tour de la fenêtre sans en sortir - après un clic sur le voile comme
  quand le focus est tombé sur `<body>` -, qu'Échap la ferme après neuf Tab comme depuis `<body>` et rende le focus à l'éditeur, et que le choix de la clé d'une
  table pas encore liée (ouvert par-dessus la condition) garde le clavier : Tab y reste, un premier Échap le ferme seul ; enfin que les trois aient la même
  largeur et le voile du thème (`--pp-scrim`), qu'un clic sur le voile ne ferme rien, que `role="dialog"` soit nommé par le titre affiché et qu'elles tiennent
  dans 360 px. Il n'emploie que les sélecteurs des fenêtres d'avant la base (`#var-…-modal`, `h3`, `.var-modal-actions`) : contre l'ancien code il échoue par
  ses constats (41 sur 131 : titre qui défile hors du cadre, Tab qui part dans l'éditeur, Échap muet, largeurs de 480 et 420 px), pas par un sélecteur absent.
  `MODAL_BASE_SHOTS=<dossier>` enregistre aussi des captures à relire à l'œil.
- Un dixième, `dialogsMouse` (`dev-tests/verify-dialogs-mouse.mjs`), ouvre à 700×400, en clair puis en sombre, la saisie et la confirmation du widget (`js/dialogs.js`,
  qui remplace `window.prompt` et `window.confirm`) et s'en sert comme une personne : frappe réelle qui remplace le texte sélectionné, Entrée, Échap, clic sur
  Annuler ou sur le bouton principal, Tab et Maj+Tab qui tournent entre le champ et les boutons (même depuis `<body>`), focus rendu à l'élément d'origine. Une
  saisie vide rend `''`, une saisie annulée `null` (« aucun dossier » n'est pas « annulé »). Une confirmation destructrice (`danger`) met le focus sur Annuler.
  Il ouvre aussi la saisie AU-DESSUS d'Organiser mes modèles (fenêtre écrite dans `index.html`, z-index 2000) : elle est au premier plan, Tab et Échap ne
  touchent qu'elle, Organiser reste ouverte dessous puis se ferme au second Échap ; enfin la confirmation la plus longue dans 360 px, et aucune boîte native.
  Une section « choix » ouvre `Dialogs.choose` (la question « Enregistrer / Abandonner / Annuler » d'avant un changement de modèle, `js/main.js:askBeforeLeaving`) : trois boutons
  dans l'ordre, dans le panneau et au premier plan, le focus sur le bouton principal (sur Annuler quand il n'y en a pas), Tab et Maj+Tab qui tournent sans le bouton caché de la
  confirmation, Échap et Annuler rendent `null`, un vrai clic sur un choix rend sa valeur, Entrée valide le bouton principal ; ensuite la confirmation et la saisie retrouvent leurs
  deux boutons (rien ne reste d'un choix), et à 360 px le troisième bouton passe à la ligne au lieu de sortir de la fenêtre.
  Seconde partie (`runSites`) : les endroits qui l'appellent, chacun par le vrai clic sur le vrai bouton - image par adresse, enregistrer sous, supprimer un
  modèle (focus d'emblée sur Annuler), email trop long, les trois exports en lot (message propre à chacun ; Annuler ne lance rien, Générer lance le chargement),
  table de la galerie (au-dessus de l'aperçu, nom proposé sélectionné), supprimer un fil de commentaires (la confirmation s'ouvre à l'appui du bouton, sous le
  pointeur, et y reste), nouveau dossier / sous-dossier / déplacer vers un dossier au-dessus d'Organiser (vider le champ sort le modèle de tout dossier),
  supprimer une correspondance de tables (le titre est la question, le message nomme les modèles touchés). Chaque cas dit ce qui se passe à l'Échap, à
  l'Annuler et à la validation. L'ancien code (boîtes du navigateur) échoue partout : la fenêtre ne s'ouvre pas et les boîtes natives sont comptées.
  Le verrou d'export (`withExportLock`, `js/main.js`) grise « Créer l'email » et « Exporter en PDF » avant que leur fenêtre s'ouvre ou pendant l'export, et le
  navigateur en retire alors le focus : lancés au clavier (vraies touches Tab et Entrée), le clavier doit revenir sur le bouton, cadre de focus visible, à Échap, à
  Annuler, à Continuer et à la fin de l'export ; il n'y revient pas si le focus est allé dans le document pendant l'export ; lancés à la souris, rien ne change
  (le focus reste sur la page, aucun cadre n'apparaît, même quand la fenêtre est fermée à la souris après un lancement au clavier). L'ancien code laisse le focus sur
  la page dans les quatre cas de retour au clavier.
  `DIALOGS_SHOTS=<dossier>` enregistre aussi des captures à relire à l'œil.
- Un onzième, `modalPagesMouse` (`dev-tests/verify-modal-pages-mouse.mjs`), est le second lot de la base commune des fenêtres : les sept fenêtres écrites dans
  `index.html` - Réglages, Tables liées, Clé de correspondance, Macro-modèle, Organiser mes modèles, Galerie, Aperçu - que `ModalBase.adopt` (`js/main.js:wirePageModals`)
  reprend sans que leur module change sa façon de les ouvrir (`style.display`). Il les ouvre à 700×400, à la vraie souris (la barre, le menu au survol, le crayon d'une
  règle, une carte de la galerie), en clair puis en sombre, avec de quoi les faire déborder (quatorze règles de correspondance, quatorze modèles, la galerie `?dev`
  à sept cartes, deux annexes de macro-modèle, l'onglet Accès) : pour chacune, dans le panneau avec titre, en-tête et boutons entiers et au premier plan
  (`elementFromPoint`), `role="dialog"` `aria-modal` nommé par son titre, voile de la couleur du thème (`--pp-scrim`), largeur de sa taille (400, 480 ou grande =
  panneau moins 24 px), à 360 px rien ne déborde (le document montré par l'aperçu garde sa largeur et se fait défiler de côté, comme avant) ; à la molette, SEULE la
  zone de contenu défile - titre, en-tête et boutons restent à leur place jusqu'au dernier élément, le cadre et la page derrière ne bougent pas ; au clavier, Tab et
  Maj+Tab tournent dans la fenêtre (après un clic sur le voile, depuis `<body>`), Échap la ferme depuis `<body>` comme après neuf Tab et rend le focus au bouton de la
  barre qui l'avait ouverte. Puis trois parcours : Tables liées > « Supprimer » > confirmation > la liste est redessinée (le focus tombe sur `<body>`) > Échap ferme
  Tables liées ; Tables liées > crayon > Clé de correspondance par-dessus (Tab y reste, un premier Échap la ferme seule et rend le focus au crayon, le second ferme
  Tables liées) ; Galerie > carte > Aperçu > « Retour à la galerie » (le clavier reste dans la galerie) > Échap, et Échap depuis l'aperçu ferme tout. Il n'emploie que
  les sélecteurs des fenêtres d'avant la base (`#…-modal`, `.modal-content`, `h3`, `.modal-actions`, les identifiants de leurs boutons) : contre l'ancien code
  (`aafa4e0`) il échoue sur 54 constats de 323 (Échap muet depuis `<body>` sur les sept fenêtres, `role="dialog"` absent du cadre, voile qui ne suit pas le thème
  sombre sur six, largeurs de 380, 520 et 684 px, titre du macro-modèle qui défile hors du cadre, Échap sans effet après « Supprimer »), pas par un sélecteur absent ;
  les trois parcours de la clé et de la galerie passent avant et après (chemins déplacés). `MODAL_PAGES_SHOTS=<dossier>` enregistre aussi des captures à relire à
  l'œil.
- `saveMenuMouse` (`dev-tests/verify-save-menu-mouse.mjs`, 88 vérifications) clique et tape pour de vrai, à 700×400, en clair puis en sombre, le menu du bouton Enregistrer (retours
  d'Antoine du 01/10, points 5 et 6) : plus de bouton « Enregistrer sous » ni de bascule dans la barre ; le survol ouvre le menu juste dessous, entier dans la fenêtre (titre
  « Enregistrer (Ctrl+S) », « Enregistrer sous… », « Enregistrement automatique » avec sa coche), il reste ouvert quand la souris descend lentement vers une ligne et se referme
  quand elle part ; un vrai clic sur la ligne cochée la décoche (coche disparue, choix dans localStorage, message dans le coin d'état), éteinte plus rien ne s'écrit seul pendant 3 s
  et un clic sur Enregistrer écrit une seule fois, le focus et le curseur restent dans le texte (la frappe suivante y arrive) et le menu ne reste pas ouvert souris partie ; la recocher
  enregistre au tick suivant ce qui a été tapé pendant la coupure ; « Enregistrer sous… » ouvre la saisie, Entrée crée la copie, Échap n'en crée pas et rend le focus là où il était ;
  renommer puis cliquer Enregistrer referme le champ et enregistre le nouveau nom ; au clavier, Tab descend dans le menu (anneau de focus de 2 px) puis en sort, Espace et Entrée
  basculent la case, Entrée sur « Enregistrer sous… » ouvre la saisie et Échap rend le focus au bouton Enregistrer ; le choix survit à un rechargement ; textes en anglais ;
  enregistrement automatique coupé, une frappe écrit « Modifications non enregistrées. » dans le coin d'état (en entier à 700 px, sans changer la hauteur de la barre, plus
  soutenu que le message ordinaire), il tient 3 s sans qu'une écriture parte et un clic sur Enregistrer le remplace par « Enregistré à… » ; vers 860 px, où le coin coupe le texte
  par « … », le message entier s'affiche au survol. Le bouton Enregistrer suit le même état (retour d'Antoine du 01/10) : bleu et blanc (fond `--accent-solid`, glyphe blanc) enregistrement
  automatique allumé, noir et blanc classique (fond `--solid-neutral`, glyphe blanc, bordure du thème) dès qu'un vrai clic le décoche, sans changer de taille, plus clair au survol
  (`--solid-neutral-hover`), de nouveau bleu une fois recoché, et noir dès le premier affichage après un rechargement avec la coche éteinte (déjà noir à la fin du chargement des scripts, avant la réponse de Grist : `syncSaveButtonLook()` ouvre `init()`). `SAVE_MENU_SHOTS=<dossier>` enregistre des captures à relire à l'œil. Il plante sur l'ancien code (pas de ligne
  « Enregistrement automatique » dans le menu), et les sept cas neufs de `toolbarChrome`, `autosave` et `contrast` y échouent ; sur le code d'avant l'indicateur (`55292d6`),
  cinq constats échouent (le coin d'état reste vide), comme les quatre cas neufs : un de `toolbarChrome` (la règle des menus), deux de `autosave` et un de `contrast`.
- `menuClickMouse` (`dev-tests/verify-menu-click-mouse.mjs`, 16 vérifications) clique pour de vrai, à 700×400, en clair, les boutons de la barre qui ouvrent un menu au survol (retour
  d'Antoine du 01/10 : « + » et « Qualité PDF » restaient ouverts après un clic ; « Titre » avait le même défaut) : un clic synthétique ne déplace jamais le focus, aucun scénario
  `page.evaluate()` ne peut donc le voir. Pour « + », « Enregistrer », « Qualité PDF » et « Titre » : le survol ouvre le menu sous la souris, puis après un vrai clic et la souris
  partie le menu est refermé (`aria-expanded="false"`) et le bouton n'a pas gardé le focus ; après un clic sur « Qualité PDF » ou « Titre », le curseur est resté dans le texte et
  la frappe suivante y arrive ; renommer un modèle puis cliquer « Qualité PDF » referme le champ, affiche le nom tapé et laisse le focus ailleurs que sur le bouton ; au clavier,
  Tab depuis « Portrait / Paysage » (le dernier bouton avant lui) arrive sur « Qualité PDF » dont le menu s'ouvre, puis se referme au Tab suivant, et Entrée sur Enregistrer écrit une seule fois ; une ligne de menu
  ordinaire (« Nouvel email ») se clique toujours et son menu se referme. Contre l'ancien code (`55292d6`) il échoue sur six constats (les trois menus restés ouverts, le focus resté
  sur « Qualité PDF » et sur « Titre », le focus resté après le renommage) et passe sur « Enregistrer », réglé avant.
- `leaveUnsavedMouse` (`dev-tests/verify-leave-unsaved-mouse.mjs`, 38 vérifications) clique et tape pour de vrai, à 700×400, la question « Enregistrer / Abandonner / Annuler » posée avant
  de quitter ou de remplacer un modèle dont une modification attend (carte d'Antoine du 01/10, « Toujours demander » : enregistrement automatique allumé ou non). Rien n'attend : neuf
  modèles (six simples, trois riches tirés de la galerie : tableaux, images, variables) se parcourent à la liste sans une seule question et sans « Modifications non enregistrées. » (un
  chargement ne laisse jamais « modifié »). Enregistrement automatique coupé, une frappe : la fenêtre s'ouvre au premier plan avec le nom du modèle quitté, le focus sur Enregistrer, rien n'a
  bougé derrière (même modèle chargé, texte gardé, aucune écriture) ; Annuler et Échap gardent le modèle, le texte et l'indicateur « modifié » et rendent le focus à la liste ; Abandonner
  charge l'autre sans écrire, sans nouvelle question derrière ; Enregistrer, au clic comme à Entrée, écrit une fois puis charge. Enregistrement automatique allumé : la même question dans les
  2,5 s de la frappe (le scénario recommence si le passage tombe entre les deux), et pas une écriture pendant qu'elle est ouverte. « + » (le bouton, puis la ligne « Nouvel email ») pose la même
  question, Annuler rend le curseur au texte, Abandonner ouvre un document ou un email vide ; un nouveau modèle sans nom n'a que Annuler et Abandonner. La galerie : « Utiliser ce modèle » pose
  la question AU-DESSUS de l'aperçu, Annuler le laisse ouvert sans rien créer et rend le focus au bouton, Abandonner crée le modèle et ferme tout. Sombre, anglais, sombre en anglais : la fenêtre
  tient dans le panneau et tout se lit à 4,5:1. `LEAVE_UNSAVED_SHOTS=<dossier>` enregistre des captures à relire à l'œil. Contre l'ancien code (`5214a5e`) il échoue dès la première question
  (le modèle se charge sans fenêtre) et plante faute de fenêtre.
- `templateMenuMouse` (`dev-tests/verify-template-menu-mouse.mjs`, 46 vérifications) clique pour de vrai, à 700×400, en clair puis en sombre, la liste déroulante des
  modèles (retours UI/UX d'Antoine du 01/10) : noms à 12,5 px en graisse normale et dossiers en demi-gras (le corps des menus de la barre, ni 16 px ni 700), plus de
  ligne « Nouveau modèle » (le bouton « + » crée un modèle), « Organiser » dans l'en-tête fixe de la liste, en haut à droite, au premier plan et cliquable même liste
  défilée (il ouvre la fenêtre et ferme la liste, Échap rend le focus au bouton de la liste), Haut depuis la première ligne atteint « Organiser » avec son anneau de
  focus, la vraie molette défile la liste (30 modèles), le renommage remplace le nom du modèle sur place (même place et même largeur, barre de la même hauteur, Entrée
  montre aussitôt le nouveau nom avec son ★, Enregistrer écrit la colonne `Nom` de Grist) et les textes de l'interface en anglais. `TEMPLATE_MENU_SHOTS=<dossier>`
  enregistre des captures à relire à l'œil. Contre l'ancien code il échoue sur ces constats (« Organiser » encore dans la barre, noms à 16 px, ligne « Nouveau modèle »
  présente, pas d'en-tête), et plante ensuite faute d'en-tête.
- `condTextMouse` (`dev-tests/verify-cond-text-mouse.mjs`, 75 vérifications) clique, tape et sélectionne pour de vrai, à 700×400, en clair puis en sombre, le bloc de texte
  conditionnel (demande d'Antoine du 01/10) : le bouton « Insérer une variable », l'onglet Chips et la ligne « Texte conditionnel » atteignables et au premier plan, le bloc
  vide posé à la place de « # » avec le curseur dedans (la frappe suivante y va), l'étiquette cliquable qui sélectionne le bloc et ouvre la barre des variables posée contre
  elle, « Autres attributs » et « Boucle » grisés sur une vraie capture (moins de 60 % de l'encre de la même icône active sur une bulle) et sans effet au clic, la fenêtre de
  condition entière dans le panneau (colonne choisie dans la liste avec recherche, aperçu « le bloc s'affiche », Enregistrer non recouvert), l'étiquette lisible (4,5:1), un
  bloc dans le bloc dont les deux étiquettes ne se recouvrent pas, un paragraphe sélectionné à la souris (triple clic) puis entouré par le bouton, la Lecture (ligne « Urgent » :
  textes affichés sans cadre ; ligne « Normal » : bloc et bloc emboîté disparus, le bloc sans condition reste), le retour en Édition (cadres en pointillés, aucune barre), et à
  360 px l'étiquette d'une condition longue coupée par « … » dans une case de tableau. Section « Défaire le bloc » : la ligne de boutons de la fenêtre d'un bloc (sans condition :
  une ligne ; avec condition : une ou deux lignes selon la place - en français les quatre boutons ne tiennent pas toujours dans les 480 px, ils passaient avant hors de la fenêtre -,
  jamais un bouton hors de la fenêtre, recouvert ou coupé, « Enregistrer » toujours à droite ; même mesure à 360 px et en anglais, où les quatre tiennent sur une ligne ; Tab et Maj+Tab au vrai clavier tournent sur les quatre boutons sans quitter la fenêtre), le texte du bouton lisible (4,5:1) et de la hauteur des autres (30 px), un vrai clic
  qui défait le bloc extérieur (cadre et condition partis, texte resté, blocs voisins intacts, curseur au début du texte, barre fermée), puis Ctrl+Z (le bloc et sa condition
  reviennent d'un coup) et Ctrl+Maj+Z au clavier. `COND_TEXT_SHOTS=<dossier>` enregistre des captures à relire à l'œil. Contre l'ancien code il échoue dès la vérification de la
  ligne « Texte conditionnel » (absente de l'onglet Chips) et plante ensuite faute de bloc.
- `externalImagesMouse` (`dev-tests/verify-external-images-mouse.mjs`, 58 vérifications) ouvre à 700×400, en clair, en sombre puis en anglais, la fenêtre qui précède un export dont le
  modèle contient une image d'un site externe (`js/external-images.js`, choix d'Antoine du 01/10 « Fenêtre avant l'export »), par le vrai clic sur le vrai bouton : « Exporter en
  PDF », « Exporter en DOCX » (ligne du menu) et « Exporter toutes les lignes (ZIP) » (deux fenêtres à la suite : celle du lot, puis celle des images). Les adresses « .test » sont
  servies par Playwright (`page.route`) et notées avec leur type : l'image que l'éditeur AFFICHE est une requête `image` (inchangée, toutes chargées), le téléchargement de
  l'EXPORT est une requête `fetch`, et c'est elle qui ne doit partir ni pendant la fenêtre ni après « Annuler » ; les fichiers sont les vrais téléchargements du navigateur
  (événement `download`, attendu après l'état « généré » : il arrive un instant plus tard). Exigé : la fenêtre dans le panneau avec son titre, les sites dans l'ordre de la page
  (en-tête exporté compris, un site répété une seule fois), le focus sur « Continuer », titre et boutons visibles et au premier plan (`elementFromPoint`), l'export verrouillé
  pendant la fenêtre et rendu après, six Tab qui restent dedans ; « Annuler » (vrai clic) et Échap écrivent « Export annulé. » (pas une erreur) sans rien télécharger ni produire ;
  « Continuer » télécharge les images, produit le .pdf / .docx et écrit « PDF généré. » / « DOCX généré. » avec UNE seule fenêtre pour l'export ; un lot ZIP refusé s'arrête sur la
  première ligne (rien de téléchargé, aucune archive, aucune ligne comptée en échec), accepté il ne pose qu'une question pour toutes les lignes ; quarante sites dans 700×400 :
  seule la liste défile (vraie molette, dernier site atteint), le titre et les boutons ne bougent pas ; un seul site : le message au singulier ; en sombre le texte et le titre
  se lisent sur le fond (4,5:1) ; en anglais le titre, le message, les boutons et « Export cancelled. ». Contre l'ancien code (sans la fenêtre) il s'arrête sur son premier
  constat : la fenêtre ne s'ouvre pas. `EXTERNAL_IMAGES_SHOTS=<dossier>` enregistre aussi des captures à relire à l'œil.
- `trackColumnsMouse` (`dev-tests/verify-track-columns-mouse.mjs`, 44 vérifications) clique pour de vrai, à 700×400, en clair puis en sombre, « Colonne avant », « Colonne après » et « Supprimer la colonne » de la barre
  d'un tableau avec le suivi des modifications allumé (bouton du suivi à la souris), et rejoue les touches Ctrl+Z / Ctrl+Y. Exigé : la colonne ajoutée reste dans le tableau, alignée case par case (4 cases par
  ligne), teintée de vert pâle ; la colonne supprimée reste, barrée et teintée de rouge pâle, texte à 4,5:1 au moins sur ces teintes (la page reste blanche en sombre) ; le HTML enregistré porte la marque en attribut de la
  case (`data-tc-insertion`, `data-tc-deletion`), jamais un `<ins>` ou un `<del>` entre deux cases : le navigateur les en sort à la relecture ; « Tout refuser » rend le tableau et son texte d'origine, « Tout accepter »
  applique l'ajout et la suppression ; un tableau à largeurs fixées (`colwidth`) garde ses 3 colonnes d'origine, la colonne ajoutée entre dans la page sans marque de modification de largeur, un seul Ctrl+Z rend tableau et
  largeurs ; ajout puis suppression en attente, `Editor.setHTML(Editor.getHTML())` (l'enregistrement puis la réouverture) les retrouve à l'identique ; au-dessus d'une cellule fusionnée, « Supprimer la colonne » est
  grisé (`aria-disabled`, explication au survol, un vrai clic ne change rien : la suppression à travers une cellule fusionnée casserait le tableau), l'ajout à travers elle élargit la cellule et « Tout refuser » rend le tableau tel qu'il était ;
  suivi coupé, les boutons agissent sans aucune trace ; interface en anglais, l'explication du bouton grisé l'est aussi. Avant le correctif du 01/10 (`js/editor.js`, `js/track-changes.js`, `css/track-changes.css`), la ligne ne
  portait pas les marques de suivi : la commande échouait en silence (« Colonne avant » ne faisait rien, « Contenu invalide pour le nœud tableRow »), et les enveloppes `<ins>` / `<del>` d'une case seraient sorties du tableau
  à la relecture : le navigateur les en écarte. Les mêmes cas, dans la page, sont dans le groupe `trackChanges` (`trackchanges_column_*`).
- `templateOrganizerUnit` (`dev-tests/unit-template-organizer.mjs`, 26 vérifications) et `templatePreferencesUnit` (`dev-tests/unit-template-preferences.mjs`, 34
  vérifications) sont du Node pur (module chargé dans un contexte `vm`, faux `docApi` de `dev-tests/fake-grist-doc-api.mjs`) : ils tournaient déjà à la main mais
  n'étaient inscrits nulle part, donc jamais rejoués par un `run-headless.mjs` sans argument. Ils le sont depuis le nettoyage du 29/09.
- Un groupe Node à part, `wheelScroll` (`dev-tests/verify-wheel-scroll.mjs`),
  tourne automatiquement en plus des groupes `EditorTestSuites` ci-dessus dans
  un `run-headless.mjs` sans argument (ou seul via
  `node dev-tests/run-headless.mjs wheelScroll`). Nécessaire car TOUS les
  scénarios `scenarios-*.js` s'exécutent DANS la page via `page.evaluate()`
  (sans accès à `page.mouse`), donc un `dispatchEvent('wheel'/'scroll')`
  scripté n'y déclenche jamais le comportement natif de scroll/hover du
  navigateur - seul un geste Playwright réel au niveau Node le peut. Ce script
  vérifie qu'aucune molette réelle (verticale ou horizontale, popup ouvert ou
  fermé, y compris en mode email+Cci à 700×400 et 600×400) ne fait défiler la
  PAGE elle-même derrière l'arbre des modèles ou les menus de la barre
  (`.v2-hover-flyout`) - cf. [[project-publipostage-scroll-chaining-popup-fix]].
- `--preseed <fichier.js>` injecte ce fichier AVANT la navigation
  (`page.addInitScript`), donc avant que `dev-tests/grist-stub.js` ne
  s'exécute lui-même - le fichier doit définir
  `window.__preSeedGristStub = (stub) => {...}` (accès direct à
  `stub.state.rows.Publipostage_Modeles`, etc.), appelé juste après que
  `grist-stub.js` a construit `window.__gristStub`, donc AVANT le tout premier
  `fetchTable` de `GristAPI.init()`. Seul moyen de tester "le widget démarre
  avec tel modèle déjà marqué par défaut" : semer via `setVariables`/`setRows`
  APRÈS "Widget prêt." (ce que ce fichier permettait déjà) arrive
  structurellement trop tard, une fois `init()` déjà terminé. Combinable avec
  `--probe` pour inspecter l'état obtenu sans écrire de scénario. Trouvé utile
  le 2026-09-19 en cherchant (à tort - la vraie cause était une règle CSS, cf.
  plus bas) un bug qui ne se manifestait qu'au tout premier chargement.

### Dépendances CDN et réseau bloqué

`index.html` charge TipTap/ProseMirror depuis `esm.sh` et pdfmake/pdf.js/JSZip/
html2pdf depuis `cdnjs` (ExcelJS aussi, mais à la demande, au premier export Excel). Un environnement d'exécution distant (Claude Code sur
le web, un runner CI) refuse souvent ces hôtes : l'éditeur ne démarre alors pas
du tout et aucun test ne peut tourner.

```bash
bash dev-tests/offline-deps.sh   # réinstalle les MÊMES versions depuis npm et les bundle localement
```

Rien de tout ça n'est commité (cf. `dev-tests/.gitignore`) : ce n'est pas une
vendorisation des dépendances, juste un cache reconstructible. `run-headless.mjs`
détecte ce cache et détourne les requêtes CDN vers lui ; s'il est absent, il
laisse les CDN être appelés normalement. Deux détails qui ont coûté un
diagnostic, réglés dans le lanceur et à ne pas défaire :

- les chunks partagés produits par esbuild sont servis sous **une seule URL
  absolue** - servis sous deux URL différentes, ProseMirror est chargé deux
  fois et TipTap casse avec *"looks like multiple versions of prosemirror-model
  were loaded"* ;
- le hash **SRI** (`integrity`) de `js/pdf-export.js` est neutralisé dans la
  page de test uniquement : un miroir local ne peut pas satisfaire le hash d'un
  fichier minifié par cdnjs. L'application réelle garde sa protection intacte.

## Démarrage manuel (navigateur réel, pour observer ou mettre au point)

```bash
# Depuis la racine du dépôt
python -m http.server 8843
```

```bash
bash dev-tests/generate-harness.sh   # régénère _test-harness.html depuis index.html
```

Ouvrir `http://localhost:8843/_test-harness.html` dans un navigateur,
puis dans la console :

```js
async function loadFresh(path) { const r = await fetch(path, {cache:'no-store'}); eval(await r.text()); }
window.EditorTestSuites = {};
const files = [
  'helpers', 'runner',
  'scenarios-formatting', 'scenarios-lists', 'scenarios-tables',
  'scenarios-twocolumns', 'scenarios-nesting', 'scenarios-images',
  'scenarios-pagebreak-toc', 'scenarios-headerfooter', 'scenarios-chips',
  'scenarios-varformat',
  'scenarios-pdf-fidelity', 'scenarios-pdf-ground-truth', 'scenarios-readmode-fidelity',
  'scenarios-comments', 'scenarios-pagelayout',
  'scenarios-docx', 'scenarios-docx-images',
  'scenarios-macro-modeles',
];
for (const f of files) await loadFresh('/dev-tests/' + f + '.js');
const results = await TestRunner.runAll(EditorTestSuites);
console.log(TestRunner.report(results));
results.filter(r => !r.pass);   // ne garder que les échecs, avec leurs `notes` diagnostiques
```

Toujours `{ cache: 'no-store' }` en rechargeant un fichier après une
modification — le cache navigateur sur du JS servi en local produit sinon
de faux négatifs/positifs (piège déjà rencontré plusieurs fois ce projet,
cf. mémoire `project_browser_cache_trap`).

**`loadFresh`/`eval()` ne recharge PAS un fichier `js/*.js` de l'app** (seuls
les `dev-tests/*.js` s'y prêtent, car ils font `window.TestHelpers = ...`/
`window.EditorTestSuites.xxx = ...` explicitement). Chaque fichier applicatif
(`pdf-export.js`, `editor.js`, `floating-toolbars.js`...) est un
`const X = (function(){...})();` top-level : un `eval()` DANS une fonction
(`loadFresh` en est une) crée un `const` local à cet appel, jamais exposé
globalement - `window.PdfExport` par exemple n'existe même pas. Après avoir
modifié un fichier `js/*.js`, il faut un **vrai rechargement de page**
(`navigate`/F5), jamais `loadFresh` sur ce fichier précis - sinon les tests
valident silencieusement l'ANCIEN code (piège rencontré et longuement
diagnostiqué en séance, cf. mémoire
`project_v2_twocolumns_offsetparent_and_multiline_anchor`).

**Lancer un seul groupe (test ciblé)** - voir la table plus haut pour choisir
le(s) groupe(s) pertinent(s) au fichier modifié :
```js
const r = await TestRunner.runGroup('images', EditorTestSuites.images);
console.log(TestRunner.report(r));
```
Pour plusieurs groupes ciblés à la fois, ne charger QUE leurs fichiers dans
`files` (au lieu de la liste complète du "Démarrage rapide" ci-dessus) avant
d'appeler `TestRunner.runAll(EditorTestSuites)`.

**Lancer TOUS les groupes d'un coup** peut dépasser le budget de temps de
certains outils d'exécution JS distants (~45s) — dans ce cas, lancer par
lots de 2-3 groupes (voir l'historique de cette session pour l'exemple).

**Une session longue qui a fait beaucoup de manipulations DOM manuelles dans
un même onglet (edits d'attributs, overrides `window.prompt`, injection de
librairies tierces...) peut laisser cet onglet dans un état corrompu qui fait
échouer des tests SANS RAPPORT avec le changement en cours** (constaté : 14
échecs sur des tests de formatage/liste/tableau de base après une longue
session de diagnostic manuel, disparus intégralement en relançant les mêmes
tests dans un onglet fraîchement ouvert). Si des tests basiques échouent de
façon inattendue après une session de debug prolongée dans le même onglet,
ouvrir un onglet neuf avant de conclure à une régression (cf. mémoire
`project_stale_tab_module_corruption`, même famille de piège).

**`window.innerWidth`/`innerHeight` peuvent valoir `0` tant que le panneau Browser
n'est pas ACTIVEMENT affiché à l'utilisateur** (constaté 2026-09-14 : 5 faux positifs
- `img_resize_corner_*`, `twocol_resize_grip` - qui mesurent une largeur avant/après un
glisser ; l'utilisateur a confirmé RAS en conditions réelles). `tabs_select` (mettre un
onglet au premier plan) et même un onglet tout neuf ne suffisent PAS à corriger ça - seul
le fait que le panneau lui-même soit visible dans l'interface compte. Un `screenshot`
peut pourtant rendre visuellement correct pendant ce temps (mesure indépendante) - ne pas
s'y fier comme preuve que `getBoundingClientRect()` est fiable. Avant de conclure à un bug
sur un test qui mesure une largeur/hauteur réelle (redimensionnement, glisser une
poignée...), vérifier `window.innerWidth` en premier ; s'il vaut `0`, le test n'a rien
mesuré de valide, quel que soit son verdict.

## `.positions[]`/`.absolutePosition` (métadonnées pdfmake) ne sont PAS la vérité terrain — utiliser `h.extractPdfGroundTruth` pour tout ce qui est centré/aligné-droite/en calque

`exportPdfContent` lit `.positions[]` et `.absolutePosition` directement sur
les objets `docDefinition` APRÈS mise en page (`getBase64`) - un raccourci
pratique, réel effet de bord déjà exploité par `pdf-export.js` lui-même pour
son propre ancrage. Mais ces propriétés se sont révélées **peu fiables** dans
deux cas précis, découverts en creusant un vrai bug utilisateur (position
d'image "aléatoire" sur un scénario 2-colonnes centré) :

1. **Texte multi-lignes centré/aligné à droite** : `.positions[]` peut
   rapporter la MÊME valeur `left` pour TOUTES les lignes d'un bloc, alors que
   le rendu réel centre/aligne chaque ligne indépendamment (une ligne plus
   courte est visuellement plus indentée). Un test qui ne vérifie que
   `positions[0].left` peut sembler "passer" en comparant deux valeurs
   également fausses de la même façon, sans jamais toucher le vrai rendu.
2. **Image en calque (`absolutePosition`) avec un `alignment` résiduel** :
   pdfmake applique `alignment` MÊME par-dessus une `absolutePosition` -
   `.absolutePosition` continue d'afficher la valeur qu'on lui a assignée
   (donc "correcte" en apparence) alors que le PIXEL réellement peint est
   décalé par le centrage. C'était la cause exacte du bug utilisateur : rien
   dans les métadonnées ne le révélait, seul le décodage des octets du PDF
   final l'a montré.

**`TestHelpers.extractPdfGroundTruth(base64)`** (dev-tests/helpers.js) décode
le PDF généré avec pdf.js (chargé depuis un CDN, comme pdfmake lui-même) et
renvoie, par page, `textItems` (position réelle de chaque run de glyphes) et
`images` (position/dimensions réelles de chaque image peinte, dans l'ordre de
peinture). **Toujours l'utiliser** (jamais `.positions[]`/`.absolutePosition`
seuls) pour vérifier la position d'un bloc centré, aligné à droite, ou d'une
image en calque - `scenarios-pdf-ground-truth.js` (groupe `pdfGroundTruth`)
en est l'exemple de référence (matrice contexte × alignement × type d'ancre,
32 cas). `.positions[]`/`.absolutePosition` restent fiables pour du texte
aligné à GAUCHE en une seule ligne (cas déjà couvert par
`scenarios-pdf-fidelity.js`, pas besoin de tout migrer).

## Étage 2 (mode Lecture) — `scenarios-readmode-fidelity.js`, comble un angle mort documenté

`PROTOCOLE_TEST_MANUEL.md` documentait depuis longtemps un angle mort : `js/reader-mode.js` est un
**3ᵉ moteur de rendu indépendant** (ni l'éditeur TipTap ni pdfmake) avec ses propres règles CSS
(`.reader-content`, censées être symétriques à `.tiptap`) - et avait déjà causé un vrai bug par le
passé (image en calque "collée en haut à gauche" en Lecture, `.reader-content` sans
`position:relative`). Ce moteur n'avait **aucune** couverture automatisée avant le 2026-09-14.

`TestHelpers.renderReaderMode(html, headerFooterData)` (dev-tests/helpers.js) appelle
`ReaderMode.render` directement (même contournement que `exportPdfContent` pour `PdfExport` : un
`record` factice minimal, on ne teste jamais ici la résolution de `#Variable`, seulement la fidélité
HTML/CSS) et force les deux conteneurs (`#editor-container`/`#reader-container`) visibles
simultanément pour pouvoir mesurer les deux. `TestHelpers.compareEditorReaderPosition(texte)` /
`compareEditorReaderImage(srcContains)` retrouvent un même repère des deux côtés (par contenu texte,
ou par `src` d'image) et comparent la position RENDUE (`getBoundingClientRect`, relative à chaque
conteneur) - jamais une structure DOM interne, qui peut légitimement différer entre les deux moteurs
tant que le RENDU final concorde.

**A immédiatement trouvé un vrai bug dès son premier lancement** (cf. `dev-tests/BUGS.md` Bug 4,
corrigé le même jour) : `.reader-content ul`/`ol` n'avait pas l'équivalent du `padding-left: 1.4em` de
`.tiptap` - une liste imbriquée rendait visiblement plus indentée en mode Lecture qu'en éditeur (l'écart
se cumulait par niveau). `readModeFidelity` est maintenant 100% vert.

## Étage 3 (export DOCX) — `scenarios-docx.js` + `scenarios-docx-images.js` : on OUVRE le fichier généré

Même principe que `h.extractPdfGroundTruth` pour le PDF, et pour exactement la même raison :
**un objet `docx.Paragraph`/`docx.ImageRun` correct en mémoire ne prouve rien sur le fichier que Word
ouvrira.** Entre les deux il y a la sérialisation de `docx.js`, qui a déjà introduit deux vrais défauts
dans ce projet — un compteur `wp:docPr` repartant à `1` à chaque `ImageRun` (Word refusait d'ouvrir le
fichier), et un `<w:tblGrid>` à 100 twips/colonne quand `columnWidths` est absent — tous deux
**invisibles avant d'ouvrir le paquet**.

`h.exportDocxParts(html, headerFooterData, marginsTwip)` génère le `.docx`, le dézippe (JSZip, via
`PdfExport.ensurePdfLibsLoaded`) et rend chaque partie XML parsée. Les accesseurs à utiliser ensuite :

| Helper | Ce qu'il rend |
|---|---|
| `h.docxDrawings(xmlDoc)` | Une entrée par `<w:drawing>`, dans l'ordre : `kind` (`'inline'` / `'anchor'`), `x`/`y` **en pt** depuis le repère `relativeFrom`, `alignH`/`alignV` quand Word positionne par mot-clé, `widthPt`/`heightPt`, `behindDoc`, `wrap`/`wrapSide`, `docPrId` |
| `h.docxParagraphs(xmlDoc)` | Une entrée par `<w:p>` (y compris dans les tableaux) : `text`, `runs[]` (gras/italique/couleur/taille/police…), `style`, `align`, `numId`/`ilvl`, `indentLeft`, `pageBreakBefore` |
| `h.docxTables(xmlDoc)` | Les `<w:tbl>` de premier niveau avec leur `<w:tblGrid>` réel et la largeur de chaque cellule — de quoi vérifier la cohérence `tblGrid` ↔ `tcW`, celle que Word contrôle |
| `h.docxSectionProps(xmlDoc)` | `<w:sectPr>` : taille de page, `pgMar`, `titlePg`, références en-tête/pied |
| `h.docxNumbering(parts.part('word/numbering.xml'))` | `numId` → `{ format, text, start, indentLeft }` du niveau 0 |
| `h.docxFootnotes(...)`, `h.docxFields(...)` | Notes de bas de page réelles ; champs Word (`PAGE`, `NUMPAGES`) |

`parts.names` liste les parties du paquet, `parts.part(nom)` en parse une (`word/header1.xml`…),
`parts.mediaSizes` donne les octets embarqués dans `word/media/` (dédoublonnage des images).

**Pourquoi une suite `docxImages` séparée** : tout l'historique de `js/docx-export.js` est fait de
corrections de POSITION d'image (habillage gauche/droite ignoré, image plaquée en haut du paragraphe,
image enfant direct du document qui disparaissait, `wp:docPr` dupliqué). `docxImages` rejoue donc la
même matrice `contexte × alignement × type d'ancre` que `pdfGroundTruth`, construite par de vrais clics
dans l'éditeur, et vérifie que `<wp:anchor>` tombe sur `marge de page + grille page capturée` — plus
deux scénarios de parité qui comparent directement la position DOCX à la position **réellement peinte**
dans le PDF du même document.

**A immédiatement trouvé un vrai bug dès son premier lancement** : une image `data-align="center"`
sortait collée à gauche dans le `.docx` alors que l'éditeur, le mode Lecture et le PDF la centrent tous
les trois. Cause : `alignment` est une propriété de **paragraphe** en OOXML (`w:jc`), jamais de run —
l'image doit donc occuper son propre `<w:p>` centré (cf. `splitRunsAtFloatedImages`, `js/docx-export.js`).

**« Erreur génération DOCX. » sur la Fiche mission (2026-10-01)** : un modèle collé de Word garde des couleurs
**nommées** (`color: black`, `color: red`) que le navigateur ne réécrit pas en `rgb()` ; `docx.js` n'accepte qu'un
`RRGGBB` pour `w:color` et `w:shd` et levait « Invalid hex value 'BLACK' », ce qui faisait échouer l'export entier. La
couleur est maintenant lue par le navigateur (`cssColorHex`, `js/docx-export.js`). `docx_run_color_forms` couvre toutes
les formes (nom, `#f00`, `rgb()` en %, `hsl()`, `rgba()`, transparent, illisible) ; `docx_fiche_mission_named_colors_and_reference_paths`
rejoue le modèle d'Antoine avec des bulles à chemin de références sur trois niveaux et une date (dernier du groupe : il
fixe la ligne courante de la page).

## Vérification transversale — marges de page et largeur de colonne mm (`scenarios-pagelayout.js`)

Les marges de page (onglet Réglages, `js/page-layout.js`) et la largeur de colonne en mm d'une zone
2-colonnes (poignée mm, `js/editor-nodes.js`) ont la particularité de traverser TOUS les étages du
produit d'un coup : l'aperçu A4 (CSS), la pagination affichée à l'écran (`js/header-footer-preview.js`
ET `js/reader-mode.js`, deux moteurs distincts), l'export PDF (`js/pdf-export.js`) et l'export DOCX
(`js/docx-export.js`). Livrées les 15-16/09 mais jamais validées par Antoine ni couvertes par un test,
elles ont été éprouvées le 2026-09-18 en comparant systématiquement la MÊME valeur aux 4 endroits, pas
seulement en vérifiant qu'un réglage produit un effet quelque part - c'est cette comparaison croisée qui
a fait sortir 6 défauts d'un coup, chacun invisible en lecture de code isolée d'un seul fichier.

**A immédiatement trouvé 6 défauts réels dès son premier lancement** (10/12 scénarios rouges avant
correctif, cf. commit `080842b`) :

- La pagination affichée codait `37.33px` (28pt) et `719.04px` en dur : elle ignorait purement et
  simplement les marges du modèle. Plus grave, `computePageGridPosition`
  (`js/header-footer-preview.js`) ancre les images en calque sur cette même grille - l'export plaçait
  donc une image sur une autre page que l'éditeur. Testé par `margins_screen_pagination_follows_margins`.
- `Editor.refreshLayout()` dispatchait une transaction vide, qui ne déclenche NI `onUpdate` NI la
  moindre réconciliation de NodeView dans ProseMirror : changer une marge ne redessinait rien tant
  qu'aucune autre action ne le faisait par ailleurs. Testé par `cols_mm_survives_margin_change`.
- Aucune borne haute sur les marges : deux marges opposées démesurées donnaient une largeur de
  contenu NÉGATIVE (zone de saisie effondrée, largeurs négatives à l'export). Testé par
  `margins_clamped_to_printable_page` et `margins_settings_field_shows_applied_value` (le champ
  Réglages doit réafficher la valeur réellement retenue, pas la saisie refusée).
- Une colonne réglée à 60mm mesurait 57.7mm à l'écran et dans le PDF (la conversion mm→% prenait la
  largeur de PAGE pour base, alors que le % s'applique à la boîte de contenu de la zone, amputée de
  22px de padding/bordure hérités des styles V1) mais 60mm dans le DOCX - trois moteurs, deux valeurs.
  Testé par `cols_mm_rendered_width_is_exact`, `cols_mm_editor_matches_reader`,
  `cols_mm_pdf_matches_screen`.
- Le DOCX ne réservait pas la gouttière de 16px entre les deux colonnes : colonne droite à 90mm là où
  l'écran et le PDF rendent 85.8mm, colonnes collées dans Word. Testé par `cols_mm_docx_matches_screen`.
- Le popover "mm" annonçait une largeur de colonne droite qui ne tenait pas compte de cette même
  gouttière. Testé par `cols_mm_popover_announces_real_widths`.

Les marges elles-mêmes (padding de page, `<w:pgMar>`/`pageMargins` pdfmake) sont testées par
`margins_preview_padding`, `margins_pdf_page_margins`, `margins_docx_page_margins`.

**Orientation de la page** (01/10, `js/page-layout.js`) : `getOrientation`, `isLandscape`, `setOrientation` et
`getPageSizeMm/Pt/Px/Twip`, enregistrés dans la colonne `Margins` du modèle (clé `orientation` ; absente, c'est le
portrait). Cinq scénarios `orientation_*` gardent l'API et son enregistrement : portrait inchangé sans réglage (A4 210 × 297,
contenu 719 px), page échangée en mm, pt, px et twip, orientation conservée quand on retouche une marge (même geste que l'onglet
Réglages) et marges re-bornées pour la page de la nouvelle orientation, enregistrement par `Templates.save` puis rechargement par
`Templates.loadAll`, et un ancien `Margins` sans la clé qui se recharge en portrait avec ses marges. Ils ne mesurent ni l'aperçu,
ni la pagination, ni les exports : chaque moteur qui se branche à l'orientation a ses propres scénarios.

**Orientation des modèles classiques** (01/10, `scenarios-orientation.js`, groupe `orientation`, 21 scénarios ;
`verify-orientation-mouse.mjs`, script Node `orientationMouse`) : le format A4 était écrit en dur à sept endroits
(793,71 px, 841,89 pt, 11 906 × 16 838 twips...), chaque scénario vérifie donc un étage DIFFÉRENT et toujours que le
paysage donne le même résultat à l'écran et à l'export - un étage oublié se verrait comme une page de 297 mm découpée dans un
PDF de 210 mm, ou un tableau Word plus étroit que la page. Étages couverts : feuille de l'éditeur et de la Lecture (largeur
`--pp-page-width`, espaceurs d'en-tête et de pied), pagination de l'éditeur et de la Lecture (même hauteur de page, deux moteurs),
facteur d'ajustement à la largeur du panneau, enregistrement avec le modèle et rechargement (un ancien `Margins` sans orientation,
un nouveau modèle et un macro-modèle restent en portrait), PDF (page, largeur de texte, nombre de pages, tableau), Word
(`w:orient`, marges identiques, tableau et zone à deux colonnes), colonne gauche de 200 mm réglée en paysage puis repassée en
portrait (à l'écran, dans le PDF et dans le Word : elle ne rend jamais la colonne droite négative, le réglage revient en paysage),
image en calque qui suit son texte sur une autre page (suivi des modifications actif, sans que la recapture devienne une suppression +
insertion à accepter ou refuser ; Aperçu A4 coupé ou Lecture, recapturée au retour), plafond des marges dans Réglages, impression navigateur et qualités raster,
et le vrai bouton avec la liste de types livrée (actif pour un modèle classique, grisé pour un email).

Les scénarios passent par `toggle()` (en haut du fichier) : `PageLayout.setOrientation()` puis `pp:marginsChanged`, les deux gestes
du bouton. Le rafraîchissement (facteur d'ajustement, pagination, Lecture, grille des images en calque) est celui de `js/main.js`,
écouteur de `pp:pageLayoutChanged` - le même chemin qu'au clic. Deux garde-fous de non-régression passent aussi sur l'ancien code
(`orient_legacy_margins_without_orientation_load_as_portrait`, `orient_pdf_portrait_unchanged_without_orientation`) : un modèle
portrait rend comme avant. `--pp-page-width` vaut 793,71 px en portrait - la valeur que `css/editor-v2.css` écrivait en dur, pas les
793,7008 px de 210 mm (`PageLayout.getSheetWidthPx`) - et 1 122,52 px en paysage ; le facteur d'ajustement du portrait reste celui d'avant au millième.

**Pièges propres à l'orientation** :
- `pdfmake` remplace chaque largeur de colonne par un objet `{ width, ... }` après la mise en page : lire `typeof w === 'number' ? w : w.width`.
- Un tableau Word mesuré dans le navigateur dépasse la largeur de contenu de ~50 twips, en portrait aussi (arrondi au pixel) : tolérance de 100.
- Les grilles `data-page-index / left / top-pt` d'une image en calque sont celles que lisent le PDF et le Word : un changement d'orientation les
  recapture (`HeaderFooterPreview.recaptureLayeredImageGrids`, une transaction hors historique) ; éditeur masqué (Lecture) ou sans Aperçu A4, la recapture attend
  (`layerGridsStale` et `recaptureStaleLayerGrids` de `js/main.js`) le retour en Édition ou l'Aperçu A4 rallumé (scénario `orient_layered_grid_is_recaptured_once_the_editor_can_measure_again`).
  Suivi des modifications actif, cette transaction passe par `TrackChanges.skipTracking` (`js/track-changes.js`) : sans elle la lib la transforme en suppression +
  insertion de l'image (scénario `orient_with_track_changes_on_the_grid_recapture_is_not_a_suggestion`). `migrateLegacyImagePositions` (chargement d'un ancien modèle) n'a pas
  cette protection : à suivi actif, la grille qu'elle capture ressort en suggestion (défaut d'avant, proposé à Antoine, non corrigé ici).
- Suivi actif, la correction de largeur d'un tableau trop large (`clampOverflowingTables`) est refusée par la lib (« Invalid content for node tableRow », déjà vrai pour
  les marges) : le tableau déborde de la feuille à l'écran jusqu'à la sortie du suivi, les exports le ramènent à la page. Suivi coupé, repasser en portrait réduit
  les colonnes (240 px au lieu de 300) et le retour en paysage ne les rend pas.
- Une image plus large que la page déborde du PDF et du Word, en portrait comme en paysage (défaut d'avant, sans rapport avec l'orientation : aucun scénario ne le fige).

**Formats de page A3, A4, A5, A6** (01/10, `scenarios-page-format.js`, groupe `pageFormat`, 24 scénarios ; `verify-page-format-mouse.mjs`, script Node
`pageFormatMouse`, 61 contrôles) : suite de l'orientation. `PageLayout.FORMATS` est la seule table des dimensions (mm pour l'écran, pt pour pdfmake, twips pour Word,
dans le sens portrait) ; le format voyage avec le sens et les marges (`getMarginsMm/Pt/Twip` le joignent, clé `format` du JSON de la colonne `Margins`, absente ou
inconnue = A4). Le menu au survol du bouton Page (`js/orientation-toggle.js`) donne les deux sens et les quatre formats ; un format de plus est une ligne de `FORMATS` et
une ligne de `FORMATS` dans le fichier de scénarios, qui écrit en dur ses dimensions (pdfmake, Word) pour voir toute dérive de la table. Les scénarios passent par
`apply(orientation, format)` (`PageLayout.setOrientation` + `setFormat`, `OrientationToggle.sync()`, puis `pp:marginsChanged`) ou par les vraies lignes du menu
(`click()` sur le `<span>`). Étages couverts : table et unités, format inconnu / absent / en minuscules, menu (lignes, coches, dimensions, événements, Entrée et Espace,
grisé pour un email et pendant un export), feuille et `--pp-page-width` des huit combinaisons, textes de la case Aperçu et du bouton (français, anglais), Lecture,
pagination (A3 < A4 < A5 < A6) et accord éditeur / Lecture, facteur d'ajustement (A5 tient sans réduction, A3 paysage tombe au plancher de 0,5), enregistrement avec le modèle
et rechargement (nouveau modèle, ancien `Margins`, format inconnu, macro-modèle : A4), marges re-bornées sur une petite page et plafonds de Réglages, PDF (page de pdfmake,
largeur de texte, nombre de pages, tableau, en-tête et pied avec numéro de page), Word (`w:pgSz`, marges identiques, tableau et zone à deux colonnes), colonne gauche trop large
sur A6, tableau trop large ramené dans la page, image en calque qui suit son texte, suivi des modifications actif, impression navigateur et qualités raster, et un garde-fou de
non-régression (`fmt_exports_without_format_stay_a4`, passe aussi sur l'ancien code : un appelant sans format obtient l'A4 d'avant).
- `EditorCore.editorContentWidthPx` lit `clientWidth` : des pixels de mise en page, déjà indépendants du facteur d'ajustement - ne pas le diviser par le `zoom` de la feuille (contrairement à
  `getBoundingClientRect`), sinon l'A3 paysage (zoom 0,86 dans le navigateur de test) donne 463 mm pour une page de 420.
- pdf.js coupe un mot au trait d'union (« EN- » puis « TETE ») : relire le texte du haut d'une page en entier, pas par morceau.
- Le bouton Page n'a pas de `data-tip` : il ouvre son menu au survol et au focus, ce qui retire l'info-bulle (`css/toolbar-v2.css`) ; l'information est dans son `aria-label` et dans le menu.
  Le cas `toolbar_every_menu_trigger_toggles_aria_expanded_while_open` le vérifierait en échec (le focus qui sert de référence ouvre déjà le menu).
- Le menu a six lignes `tabindex="0"` : Tab traverse le bouton puis ses six lignes avant Qualité PDF (`menuClickMouse`, `pageFormatMouse`).
- Limites à savoir (annoncées à Antoine) : passer à un format plus petit réduit pour de bon un tableau trop large (`clampOverflowingTables`, hors historique, pas rendu au retour) et
  re-borne les marges (elles ne reviennent pas) ; l'aperçu d'un modèle dans la galerie et dans l'arbre reste en A4 portrait ; à 700 px, l'A3 paysage (1 587 px de mise en page)
  tombe au plancher de 0,5 du facteur d'ajustement et le conteneur défile horizontalement (la page, non) ; email, macro-modèle et grille restent en A4 portrait, grisés ; rien n'est vérifié
  dans un vrai Word ni un vrai lecteur PDF, seulement dans le fichier produit (`w:pgSz`, page lue par pdf.js).

**Page blanche en fin de document** (01/10, `scenarios-blank-last-page.js`, groupe `blankLastPage`, 11 scénarios) : une dernière ligne vide ne s'imprime pas,
mais elle occupe une ligne ; quand le texte arrive à la marge du bas elle n'y tient plus et la mise en page ouvre une page pour elle seule (« Page 2 » vide en
Lecture, page sans texte dans le PDF). Elle est toujours là derrière un dernier tableau ou une dernière zone à deux colonnes (ProseMirror ajoute un paragraphe
final), et dès qu'on tape une Entrée de trop. `ReaderMode.trimTrailingBlankBlocks` retire ces blocs de la FIN du document (paragraphe, zone à deux colonnes ou saut
de page sans texte, image, tableau, liste, citation, encadré, note ni numéro de page ; un titre n'en est jamais un) et les lignes vides au bas des colonnes d'une
dernière zone ; les lignes vides du milieu gardent leur hauteur, le premier bloc reste toujours. Appelée par `ReaderMode.render` (après la résolution des bulles, avant
`keepBlankLines`), par `htmlToPdfContent` (flux principal seulement : ni colonnes, ni encadrés, ni en-têtes et pieds) et par `buildDocxDocument` (qui ajoute un
paragraphe de 1 pt derrière un dernier tableau, zone à deux colonnes comprise, que Word exige).
- La capacité d'une page est MESURÉE (dichotomie sur `lines(n)`, chaque essai est un vrai rendu), jamais écrite en dur : elle vaut 52 lignes sans en-tête ni pied dans les deux
  moteurs, mais 45 dans le PDF et 46 dans la Lecture avec un en-tête et un pied. Chaque moteur est comparé à SA référence (le même document sans le vide de fin), jamais à l'autre :
  la Lecture ignore les marges des blocs (`margin: 6px 0` d'une zone) et tient une ligne de plus que le PDF avec en-tête et pied, un écart d'avant sans rapport avec ces pages blanches.
- Une page blanche du PDF = aucune ligne du corps ni image sur la page pdf.js ; le texte d'en-tête et de pied est peint sur CHAQUE page et ne compte pas (`HEADER_FOOTER_TEXT`).
  Lecture : une frontière `.v2-page-break-line` (sans en-tête ni pied) ou `.v2-page-seam` (avec) par changement de page. Word : le XML de `word/document.xml`.
- Dix des onze scénarios échouent sur l'ancien code ; le onzième (`blank_page_header_and_footer_zones_keep_their_blank_lines`) est un garde-fou qui passe aussi : `ReaderMode.preview`
  sert aussi aux zones d'en-tête et de pied, ils ne sont pas rognés. Non vérifié dans un vrai Word ni un vrai lecteur PDF.
- Hors de ce lot : l'éditeur garde sa ligne finale (il faut pouvoir écrire à la suite) et son repère « Page 2 » peut encore tomber sur des lignes vides saisies au bas d'une page ; l'impression
  navigateur et les qualités raster (`js/pdf-export-alt.js`, désactivées dans l'interface) ne rognent pas.

**Images d'un site externe à l'export** (01/10, `scenarios-external-images.js`, groupe `externalImages`, 23 scénarios, `js/external-images.js`) : une image du modèle dont l'adresse est
un http(s) vers un autre site que le widget et que Grist (ancien modèle inséré par adresse, image collée depuis une page web, conversion en base64 impossible) était téléchargée à
chaque export sans rien demander (`inlineEditorImagesAsDataUri` de `js/pdf-export.js`, `docxImageDataFrom` de `js/docx-export.js`, `imageForWorkbook` de `js/xlsx-export.js`). Une fenêtre (`Dialogs.confirm`) liste maintenant les sites
avant tout téléchargement : « Continuer » exporte, « Annuler » arrête l'export (« Export annulé. », pas une erreur). L'affichage de l'éditeur et de la Lecture ne change pas.
- Ne comptent pas comme externes : `data:` et `blob:`, l'origine du widget, une adresse relative, le serveur de Grist (celui du jeton de pièces jointes, jamais deviné d'après l'adresse d'une image :
  une image marquée « pièce jointe » mais qui pointe ailleurs est listée) ; ni `ftp:` ni `file:` (`fetch` n'en sait rien faire). « Image depuis une variable » ne lit que des colonnes Pièces
  jointes : aucune cellule ne peut envoyer l'export vers un autre site. En-tête et pied ne comptent que quand ils sont exportés (« première page » seulement si elle diffère).
- Le HTML est lu dans un document inerte (`DOMParser`) : un `innerHTML` sur un nœud de la page, même détaché, fait déjà charger ses images. Un scénario le mesure (entrées de ressources de la page).
- Un clic = un lancement (`withExportLock` : `beginRun` / `endRun`) : un site déjà accepté n'est pas redemandé, un refus arrête tout le lot (`onExportBatch` sort de sa boucle, la ligne n'est pas
  comptée en échec) ; sans lancement ouvert (appel direct), chaque appel demande pour lui seul. Une seule fenêtre à la fois : deux demandes qui se croisent attendent leur tour.
- Les scénarios répondent à la fenêtre par `h.stubDialogs({ confirm })` et remplacent `fetch` pour les adresses en « .test » (jamais résolues) : rien ne part sur le réseau. Le PDF unique
  (« Exporter toutes les lignes en un seul PDF ») charge `pdf-lib` : `umd/pdf-lib.min.js` doit être dans `.offline-cache` (`offline-deps.sh` le construit, `build.mjs`).
- Sur l'ancien code (`confirmExport` remplacé par une fonction qui ne fait rien) 21 des 23 scénarios échouent ; les deux autres sont des garde-fous (aucune fenêtre quand aucune image n'est externe).

**Piège de mesure propre à cette suite** : comparer des mm entre 4 moteurs de rendu différents
(navigateur, pdfmake, docx.js) accumule de l'arrondi à chaque conversion - les tolérances des
assertions (`near(a, b, tol)`, en général 0.5 à 1mm) sont volontairement plus larges que pour une
comparaison écran/écran (`compareEditorReaderPosition` tolère 2px). Resserrer une tolérance sans
mesurer d'abord l'écart réel produit des faux rouges.

## Pourquoi `_test-harness.html` n'est pas commité

Ce fichier est une copie de `index.html` avec le script de l'API Grist
réelle remplacé par `grist-stub.js` (cf. ce fichier pour le détail du stub —
un `window.grist` minimal qui suffit à ce que `main.js:init()` se termine
sans exception, avec un éditeur vide/sans modèle). Il est **régénéré à la
demande** par `generate-harness.sh` plutôt que commité, pour ne jamais
risquer qu'une version périmée dérive silencieusement de `index.html`
(ex. un nouveau `<script>` ajouté à la vraie page, oublié dans une copie
figée). Toujours relancer `generate-harness.sh` après un changement des
balises `<script>`/`<link>` de `index.html`.

## Architecture

- `grist-stub.js` — `window.grist` minimal (voir ci-dessus). `js/grist-api.js`
  n'est PAS modifié, il tourne tel quel contre ce stub.
- `helpers.js` (`window.TestHelpers`) — pilote l'éditeur comme un VRAI
  utilisateur : clics réels sur les boutons toolbar (avec coordonnées
  `clientX`/`clientY` réelles quand la cible est un nœud ProseMirror
  sélectionnable — indispensable, cf. piège documenté dans le fichier),
  frappe clavier (`execCommand('insertText')`), glisser-déposer réel pour les
  poignées de redimensionnement/les grips, et interception de
  `window.pdfMake.createPdf` pour récupérer le `docDefinition` complet
  (positions, `absolutePosition`, alignement, tailles...) sans jamais
  déclencher de téléchargement navigateur. `stubDialogs({ prompt?, confirm?, choose? })`
  remplace `Dialogs.prompt` / `Dialogs.confirm` (js/dialogs.js) par des
  réponses toutes faites, comme les scénarios remplaçaient `window.prompt` /
  `window.confirm` avant le 29/09 ; il rend `{ asked, restore }`.
  `Dialogs.choose` (la question « Enregistrer / Abandonner / Annuler » d'avant un changement de modèle) a une réponse par défaut du harnais, « Abandonner » : `resetEditor()` passe par
  `Editor.setHTML`, que `js/main.js` compte comme une modification en attente, donc tout scénario qui change de modèle derrière lui l'attendrait sinon. `stubDialogs({ choose })`
  la remplace, `withRealChoose(fn)` rend la vraie fenêtre le temps de `fn` (le scénario clique alors ses boutons), `choosePrompts` garde les demandes reçues par la réponse par défaut.
- `runner.js` (`window.TestRunner`) — exécute une liste de scénarios,
  capture toute exception (jamais silencieusement avalée), produit un
  rapport texte.
- `scenarios-*.js` — un fichier par domaine fonctionnel, chacun enregistre
  ses cas dans `window.EditorTestSuites.<nom>`.
- `BUGS.md` — liste des anomalies RÉELLES trouvées en construisant/passant
  cette suite (pas des échecs de harnais - ceux-là ont été corrigés au fur
  et à mesure, cf. commentaires dans `helpers.js`), avec repro précis pour
  vérification en conditions réelles avant correction.

## Pièges de test déjà rencontrés (évités dans `helpers.js`, à connaître avant d'écrire un nouveau scénario)

- **`execCommand('insertText')`/changement de sélection puis lecture
  immédiate** : ProseMirror synchronise son propre modèle de façon
  asynchrone après une mutation DOM "externe" (pas une de ses propres
  transactions) - toujours attendre un court délai après (`typeText`/
  `selectAllInEditor`/`focusAtEnd` le font déjà en interne).
- **Cliquer un nœud atome (image, badge) sans `clientX`/`clientY`** :
  ProseMirror résout la position cliquée via `posAtCoords()`, qui a besoin
  de vraies coordonnées - un clic "nu" ne sélectionne rien. Toujours passer
  par `TestHelpers.selectAtomNode(el)`.
- **`Editor.getHTML()` (HTML sérialisé) ≠ DOM vivant** : certains attributs
  n'existent que dans un des deux (ex. `data-type="taskItem"` présent dans
  `getHTML()` mais absent du DOM vivant rendu par la NodeView). Toujours
  vérifier lequel des deux un sélecteur doit cibler.
- **En-tête/pied dans le PDF** : vivent dans `docDefinition.header`/`.footer`
  (des FONCTIONS `(currentPage, pageCount) => contenu`), jamais dans
  `docDefinition.content` (réservé au corps). Les appeler soi-même avec
  `(1, 1)` pour en inspecter le contenu.
- **Un scénario qui sélectionne un objet (image, ouvre une toolbar
  flottante) doit laisser le temps à cet état de se stabiliser avant le
  scénario SUIVANT** - `resetEditor()` inclut déjà un délai de 300ms et sort
  d'un éventuel mode d'édition en-tête/pied resté actif, spécifiquement pour
  ça.
- **"Aperçu format A4" (`.a4-preview`) n'est PAS synchronisé par défaut dans
  ce harnais** : la case `#v2-toggle-a4-preview` est cochée par défaut dans
  `index.html`, mais `main.js:wireA4PreviewToggle()` (qui applique cet état
  au chargement) n'est jamais atteint ici (`main.js:init()` s'arrête plus tôt
  dans l'environnement stubbé, cf. piège "Local testing scope" ci-dessous) -
  toute mesure pixel-exacte dépendant de la largeur réelle de page (calque
  d'image notamment) doit poser la classe à la main :
  `document.getElementById('editor-container').classList.add('a4-preview')`
  en tout début de scénario, sinon la largeur réelle de `.tiptap` est celle,
  arbitraire, de la fenêtre du navigateur de test - pas celle du PDF. Un
  cluster entier de scénarios en-tête/pied/saut-de-page dépend de cette même
  classe pour trouver leurs zones DOM (`.v2-hf-zone` etc.) - si un nouveau
  scénario dans ce domaine échoue avec "zone introuvable" sans rapport
  apparent avec son propre changement, vérifier ceci en premier.
- **Le harnais local n'atteint jamais certains câblages `main.js`** (cf.
  mémoire `project_local_testing_scope`) - `init()` y lève une exception
  avant certains `wireXxx()`, silencieusement. `.a4-preview` (ci-dessus) en
  est un exemple concret ; si un nouveau bouton top-toolbar ne réagit à rien
  en test alors qu'il fonctionne en vrai Grist, soupçonner ceci avant un bug
  applicatif.
- **Une suite peut laisser une fuite d'état pour la suivante MÊME sans lien
  fonctionnel apparent** (ex. `scenarios-chips.js` fait parfois échouer
  `pdffid_layered_image_absolute_position` juste après, alors que rien dans
  les puces ne touche à l'image top-level testée) - confirmé non lié à un
  changement de code (repro identique sur une page vierge, juste dans cet
  ordre précis). Cause exacte non élucidée à ce jour ; si un scénario échoue
  seulement en suite complète mais passe seul, ne pas assumer une régression
  du code avant d'avoir vérifié qu'il passe bien seul.
- **Lire un .xlsx dans un scénario** (`openXlsx` de `scenarios-xlsx.js`) : ExcelJS écrit la couleur d'une police ou d'un fond dans `<color rgb="FF…"/>` (`argb` est le nom de l'objet
  d'entrée, pas celui de l'attribut) ; les formats de nombre courants sont des identifiants intégrés sans `<numFmt>` (3 = `#,##0`, 4 = `#,##0.00`, 9 = `0%`) ; une même chaîne
  de texte riche est dans `sharedStrings.xml` sous forme de passages `<r>`. Dans le contenu de test d'une case : une `<img>` brute est supprimée par l'éditeur sans
  `class="editor-image"` ; une liste de tâches s'écrit `<ul data-type="taskList"><li data-checked data-type="taskItem"><label>…</label><div><p>…` ; un surlignage est un
  `<span style="background-color:…">`, pas un `<mark>`, et l'éditeur n'écrit ni exposant ni indice.

## Bugs de fond découverts en construisant/étendant cette suite

- `Editor.setHTML()` ne vidait JAMAIS l'historique annuler/rétablir de TipTap
  - **corrigé** (nouvelle extension `createClearHistoryExtension`,
  `js/editor.js`, TipTap v3 n'exposant plus de commande `clearHistory`
  officielle). Testé par
  `scenarios-formatting.js:fmt_undo_history_not_cleared_by_sethtml`.
- Une image "au cœur du texte" sans alignement gauche/droite (par défaut ou
  centrée) était toujours repoussée en fin de texte de son paragraphe dans
  l'export PDF, quelle que soit sa position réelle dans le document -
  **corrigé** (l'utilisateur avait confirmé rencontrer souvent ce type de
  souci, pas encore revérifié en conditions réelles après ce correctif
  précis). `blockFrom` (`js/pdf-export.js`) découpe maintenant un tel
  paragraphe en plusieurs
  blocs pdfmake successifs respectant l'ordre réel texte/image, au lieu de
  concaténer tout le texte puis pousser les images après. Testé par
  `scenarios-pdf-fidelity.js:pdffid_inline_image_position_in_paragraph` - voir
  `BUGS.md` (Bug 3) pour le détail. Non couvert : une telle image DANS une
  cellule de tableau garde l'ancien comportement (chemin de code séparé).
- Marges de page et largeur de colonne mm (`js/page-layout.js`,
  `js/editor-nodes.js`) : 6 défauts distincts, tous **corrigés** (commit
  `080842b`) - la pagination affichée ignorait les marges du modèle (37.33px
  codé en dur), `Editor.refreshLayout()` ne redessinait rien, aucune borne ne
  protégeait la largeur de contenu (négative reproduite), une colonne réglée
  en mm ne rendait pas la même largeur à l'écran/PDF/DOCX, la gouttière de
  16px n'était pas réservée dans le DOCX. Voir la section dédiée
  « Vérification transversale — marges de page et largeur de colonne mm »
  ci-dessus pour le détail. Testé par `scenarios-pagelayout.js` (12 scénarios).
