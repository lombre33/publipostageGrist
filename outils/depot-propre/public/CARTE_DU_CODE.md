# Carte du code de Publipostage+

*🇬🇧 An English version of this document is available [below](#publipostage-code-map).*

Pour qui relit le code : où est quoi, et par où commencer. Les nombres de lignes sont ceux de `wc -l` au
{{DATE_FR}} ; ils bougent, les rôles pas.

## L'essentiel

- **Une page statique.** `index.html`, `js/`, `css/` et `extensions/` sont servis tels quels par GitHub Pages ; Grist les
  charge dans un cadre et le widget demande l'accès complet au document, une seule fois (`grist.ready`,
  `js/grist-api.js`), pour les raisons que dit le [README](README.md#sécurité-et-permissions). Pas d'étape
  de construction, pas de serveur à nous.
- **Des scripts classiques, dans l'ordre de `index.html`.** Chaque fichier de `js/` définit un objet global
  (`const Nom = (function () { … })()`, ou une simple donnée pour les polices et la version ; `js/main.js`
  et `js/text-expansion-settings.js` s'exécutent sans rien exposer) et lit ceux qui le précèdent dans la
  liste des balises `<script>`. `js/dom.js` est chargé en premier, `js/main.js` en dernier : c'est lui qui
  relie tout. Huit moteurs d'export (`js/pdf-export.js`, `js/pdf-merge.js`, `js/sheet-layout.js`,
  `js/docx-export.js`, `js/xlsx-export.js`, `js/xlsx-number-format.js`, `js/markdown-export.js`, `js/html-export.js`) n'y sont que
  déclarés, par des balises inertes ; `js/export-engines.js` les charge au premier export.
- **Des extensions, à part.** Le graphique de la page et l'écriture en direct sont des extensions de Grist Factory
  Suite (GFS) : leur code est dans `extensions/graphique/` (trois scripts et une feuille de style) et
  `extensions/edition/` (quatre scripts et une feuille de style), que `js/extensions.js` charge au premier
  usage, et seulement si GFS les dit actives (`js/gfs-link.js` lui demande le contexte). `index.html` n'en demande
  aucun fichier. Seul, le widget n'en charge rien : la fonction est grisée, jamais cachée ni perdue, et son clic dit
  qu'il faut passer par GFS. Leurs bibliothèques viennent de GFS, pas de ce dépôt : Plotly pour le graphique ; pour
  l'écriture en direct, un seul module assemblé (Yjs et les extensions de TipTap qui s'en servent), chargé par
  `<script type="module">` avec son empreinte, que ni la carte d'importation ni la politique de sécurité du contenu
  ne nomment.
- **L'éditeur** (TipTap sur ProseMirror) se charge par `import()` depuis l'import map de `index.html`.
  **Chaque export** charge sa bibliothèque au premier usage, avec une empreinte (SRI) que le navigateur
  vérifie.
- **Les données** : les modèles et les réglages vivent dans des tables `Publipostage_*` du document Grist ;
  les préférences d'affichage (langue, thème, raccourcis…) dans le navigateur.
- **Le volume** : 147 fichiers dans `js/` (58 100 lignes : 42 800 de code, 11 800 de commentaires, 3 500 de
  blanc), 3 dans `extensions/graphique/` (1 000 lignes), 5 dans `extensions/edition/` (1 310 lignes) et 2 dans `extensions/diapositives/` (630 lignes), 47 feuilles de style (3 900 lignes), une page de 830 lignes. Quatre fichiers de polices du PDF
  pèsent 2,5 Mo en quelques lignes (des données) ; `js/i18n.js` est du texte à traduire, pas de la logique.

## Par où commencer

Dans l'ordre, une dizaine de minutes chacun :

1. `index.html` : la politique de sécurité du contenu (`<meta http-equiv="Content-Security-Policy">`),
   l'import map, l'ordre des scripts, les deux petits scripts en ligne (leurs empreintes, et celle de
   l'import map, sont dans la politique). Elle garde aussi l'adresse exacte de Plotly, que GFS donne à l'extension
   du graphique et que le widget seul ne charge jamais (le commentaire au-dessus de la balise dit pourquoi).
2. `js/grist-api.js` : tout ce que le widget lit et écrit dans Grist (démarrage, lecture des tables, clés de
   correspondance, sonde de l'e-mail).
3. `js/templates.js` : un modèle est une ligne de `Publipostage_Modeles` (colonnes, lecture,
   enregistrement, en-tête et pied de page).
4. `js/main.js` : l'orchestration (démarrage, modes Édition et Lecture, enregistrement automatique,
   exports).
5. `js/editor.js` puis `js/editor-nodes.js` : l'éditeur et ses nœuds (bulles `#Variable`, encadrés,
   légendes…).
6. `js/reader-mode.js` : le document « résolu » pour une ligne (variables, conditions, boucles), point
   commun de la Lecture et de tous les exports.
7. `js/pdf-export.js`, `js/docx-export.js`, `js/xlsx-export.js`, `js/markdown-export.js`, `js/html-export.js`, `js/mailto-export.js` :
   chacun transforme ce que `reader-mode.js` prépare.
8. [CONTRIBUTING.md](CONTRIBUTING.md) : comment essayer un changement, et les règles du code.

**Pour une lecture de sécurité**, le chemin court : `index.html` (politique, import map) →
`js/grist-api.js` et `js/table-consent.js` (accès, écritures, accord avant de créer une table) →
`js/html-sanitize.js` et `js/templates.js` (le HTML qui ne vient pas de l'éditeur) →
`js/external-images.js`, `js/image-io.js` et `js/export-common.js` (les images d'un autre site, la lecture
des images et le chargeur de scripts). Le [README](README.md#sécurité-et-permissions) dit ce que le widget
demande et ce qu'il garde ; pour signaler une faille : [SECURITY.md](SECURITY.md).

**Le trajet d'une ligne vers un fichier** : une ligne de la table (`GristAPI`) → `ReaderMode.preview`
résout le modèle pour cette ligne (`Variables`, `ConditionRules`, `LoopRules`) → `PdfExport`, `DocxExport`,
`XlsxExport` ou `MailtoExport` écrivent le fichier → `ExportCommon.downloadBlob` le propose au
téléchargement. Les lots (un PDF ou un ZIP pour toutes les lignes) passent par `js/main.js`
(`onExportBatch`) et `js/pdf-merge.js`.

## La carte, famille par famille

### Grist et les données du document (22 fichiers, 8 800 lignes)

| Fichier | Rôle |
|---|---|
| `js/grist-api.js` | L'enveloppe de l'API Grist : démarrage et accès, lectures, écritures, création des tables internes (après l'accord de la personne), clés de correspondance, sonde de l'e-mail ; lit le format d'affichage des colonnes nombre et date et les réglages du document (langue, devise) ; reconnaît un compte Lecteur à l'adresse `readonly=true` (pour lui, ni sonde ni table créée). |
| `js/table-consent.js` | La fenêtre « Créer les tables du widget dans ce document ? » et le compteur de gestes qui la repose après un refus ; `js/grist-api.js` décide quand la poser. |
| `js/templates.js` | Les modèles : la table `Publipostage_Modeles`, lecture, enregistrement, en-tête et pied (JSON), sa ligne réservée aux réglages du document (`TypeModele` = `reglages`, qui porte aussi le mot de passe commun des PDF protégés dans sa colonne `MotDePassePdf` : `readPdfPassword`, `writePdfPassword`) l'identité d'un modèle Grille que des tableaux de document lient (`ensureToken`, colonne `Jeton`), la personne qui a enregistré en dernier (colonne `ModifiePar`) et la copie de l'état remplacé, jointe au lot d'écriture du modèle (`prepareVersionCopy`, `restoreVersion`). |
| `js/versions-store.js` | L'historique des versions d'un modèle : la table `Publipostage_Versions` (créée à la première version gardée, lue seulement à l'ouverture de la fenêtre), les règles pour garder l'état qu'un enregistrement remplace (autre personne, plus de 5 minutes, au plus une copie toutes les 10 minutes), les plafonds (30 versions par modèle, 3 millions de signes, jamais une version nommée) et le ménage des versions orphelines, le nom d'une version (`renameVersion`, `keepNamed`). Une copie ne bloque jamais l'enregistrement. |
| `js/versions-history.js` | La fenêtre « Historique des versions… » du menu du bouton Enregistrer (sur la fenêtre commune, avec `css/versions-history.css`) : la liste des versions, l'aperçu de celle qu'on choisit (document, e-mail, macro-modèle), « Comparer » avec la version actuelle, « Nommer… » et « Restaurer cette version ». Chargée au premier clic seulement. |
| `js/versions-compare.js` | La comparaison du bouton « Comparer » de la fenêtre « Historique des versions… » : aligne les blocs de texte de la version et de la version actuelle (les blocs identiques, puis ceux qui se ressemblent), compare mot à mot les blocs modifiés et rend le document de la version avec, en vert, ce qu'elle a en plus et, en rouge barré, ce que la version actuelle a en plus ; compare aussi un texte court (objet, destinataires) et des lignes (composition d'un macro-modèle). Sans bibliothèque de plus ; chargée au premier clic sur « Comparer » seulement. |
| `js/template-preferences.js` | Épingles, dossiers et choix d'export de chaque personne (`Publipostage_PreferencesModeles`). |
| `js/template-organizer.js`, `js/template-tree-select.js`, `js/template-organize-modal.js` | La liste des modèles en arbre « épinglés + dossiers » et la fenêtre « Organiser mes modèles ». |
| `js/template-gallery.js`, `js/template-gallery-modal.js` | Le catalogue de modèles prêts à l'emploi (dossier `templates-gallery/`, même site que le widget) et la fenêtre de la galerie : grille, recherche, aperçu en captures du document rempli, « Utiliser ce modèle » et « Créer avec ses tables ». |
| `js/template-pack.js` | Un modèle de la galerie livré avec ses tables : lecture et contrôle de son `pack.json`, plan de ce qu'il faut créer dans le document (tables à créer, déjà là, en conflit), puis création des tables vides (colonnes, colonnes de calcul, colonne affichée d'une Référence, règles des Tables liées), retirées si une écriture échoue. |
| `js/view-template.js` | Le modèle par défaut d'une vue (option du widget). |
| `js/export-date.js` | La colonne qui garde la date du dernier export PDF de chaque ligne (option du widget) : la section de Réglages > Vue et l'écriture, une fois le PDF produit (`js/main.js` l'appelle après chaque export PDF). |
| `js/row-template.js`, `js/row-template-panel.js` | « Selon la ligne » : un modèle relié à une condition sur la ligne ; le moteur et l'écran. |
| `js/schema-renames.js` | Suivi des renommages de tables et de colonnes faits dans Grist (instantané des noms dans le navigateur). |
| `js/settings-columns.js` | Avertit quand une colonne citée dans les réglages a disparu. |
| `js/access-rights.js` | Droits par personne (lecture seule, export, commentaires) : un verrou d'interface, pas une protection des données. Un compte Lecteur de Grist ouvre d'office en lecture seule, export gardé, sans commentaires. |
| `js/page-tree.js` | Range les pages que Grist crée avec les tables du widget. |
| `js/saved-page-formats.js` | Les formats de page nommés (`Publipostage_FormatsPage`). |

### HTML qui ne vient pas de l'éditeur (2 fichiers, 420 lignes)

| Fichier | Rôle |
|---|---|
| `js/html-sanitize.js` | Filtre à liste blanche, lu dans un document inerte, pour le HTML des colonnes Grist, des modèles importés et de la galerie. |
| `js/external-images.js` | Images d'un autre site : un cadre « Afficher » à leur place jusqu'au clic (rien n'est retenu), signalées ensuite en permanence, et une fenêtre avant tout export qui les lirait. |

### L'éditeur (37 fichiers, 11 500 lignes)

| Fichier | Rôle |
|---|---|
| `js/editor.js` | Démarrage de TipTap et ProseMirror, assemblage des extensions. |
| `js/editor-core.js` | Outils bas niveau partagés par les modules de l'éditeur (aucune logique métier). |
| `js/editor-nodes.js` | Les nœuds et extensions sur mesure : bulles `#Variable`, calcul, cases et blocs conditionnels, images, sommaire. |
| `js/floating-toolbars.js` | Les barres flottantes d'une sélection : couleur, tableau (dont « Répéter la ligne », qui ouvre la Boucle sur la bulle de la ligne), image, variable, modification suivie. |
| `js/color-palette.js`, `js/color-dialog.js`, `js/color-store.js`, `js/color-math.js` | Le menu de couleur (texte, surlignage, fond de case, trait des bordures) : la palette ; la fenêtre « Couleur personnalisée » ; les couleurs gardées par modèle et par document ; les calculs de couleur (module pur). |
| `js/main-toolbar.js` | La barre d'outils : état des boutons, câblage des clics, insertion d'une image. |
| `js/format-painter.js`, `js/find-replace.js`, `js/link-dialog.js` | Pinceau de mise en forme, Rechercher / Remplacer, liens. |
| `js/script-marks.js` | Exposant et indice : les deux marques de texte, leur lecture dans le HTML (Word, Google Docs), la taille que les exports en tirent et les caractères Unicode que le lien d'un email écrit à leur place. |
| `js/tab-indent.js` | La touche Tab : une tabulation au cran de 12,7 mm (le demi-pouce de Word), écrite comme un petit nœud en ligne pour que le HTML la garde jusqu'en fin de ligne, que Maj+Tab retire ; ce que Tab faisait déjà (niveau d'une puce, case suivante, colonne, liste ouverte) garde la main, et Échap puis Tab quitte l'éditeur ; la mise en bloc de code garde les tabulations. Le cran des exports : `js/pdf-export.js`, `js/docx-export.js`, `js/markdown-export.js`. |
| `js/callout.js`, `js/caption.js`, `js/keep-with-next.js`, `js/qr-code.js` | Encadrés et signature, légendes, « Garder avec le suivant », QR code. |
| `js/chart-entry.js` | Le graphique de la page vu du socle : la forme du cadre dans le document (nom, taille, références du graphique, gardées telles quelles), son grisé sans l'extension, et le seul point d'entrée par lequel le reste du widget atteint son code. Son dessin est dans l'extension `graphique` (plus bas). |
| `js/text-expansion.js`, `js/text-expansion-settings.js` | Expansion de texte (`Publipostage_Abreviations`) et son onglet dans Réglages. |
| `js/suggestion-list.js` | La liste flottante des suggestions à frappe maison (celle de « § » et celle de « @ ») : lignes choisies à la souris ou au clavier, message d'une liste vide. |
| `js/mention.js` | La pastille « @ » : la fiche d'une ligne de n'importe quelle table, sa liste, son nom relu à chaque affichage (Lecture et exports) et « [Fiche introuvable] » quand la ligne a disparu. |
| `js/track-changes.js`, `js/track-changes-core.js`, `js/track-changes-selection.js`, `js/track-changes-resolve.js`, `js/track-changes-reading.js`, `js/track-changes-commands.js` | Suivi des modifications, par-dessus `prosemirror-suggest-changes` : le pont avec l'éditeur et cinq modules (les marques, la sélection, la résolution, la Lecture et les exports, les commandes). |
| `js/comments.js` | Commentaires en fils de discussion (`Publipostage_Commentaires`). |
| `js/table-select.js`, `js/table-merge.js` | Sélection de cases à la souris ; fusion et scission de cases d'un tableau de document. |
| `js/heading-numbering.js` | Numérotation des titres, la même pour l'éditeur, la Lecture, le PDF et le Word. |
| `js/toc-links.js` | Les lignes d'un sommaire sont des liens : un clic amène le titre qu'elles nomment en haut de la zone visible (l'aperçu de l'éditeur, qui y pose aussi le curseur, et la Lecture, aussi au clavier). |
| `js/anchors.js` | Les signets : un nom posé sur un paragraphe ou un titre du premier niveau (attributs `data-anchor` et `data-anchor-name`, drapeau de l'éditeur), l'adresse tirée du nom, la liste des cibles d'un lien « Dans ce document », le saut jusqu'à la cible ; ce que lisent les exports (`indexElements`). |
| `js/bookmark-dialog.js` | La fenêtre « Signet » : poser, renommer ou retirer le signet du bloc où est le curseur. |
| `js/email-plain-text.js` | Le modèle e-mail n'écrit que ce que le lien `mailto:` porte : les touches de gras, d'italique, de souligné, d'alignement et de niveau de titre ne font rien, les signes de Markdown tapés (« # » compris) restent du texte, un collage perd sa mise en forme (un titre devient une ligne simple, un texte brut garde ses lignes vides), une ancienne mise en forme ne s'affiche plus. |

### Variables et conditions (21 fichiers, 7 100 lignes)

| Fichier | Rôle |
|---|---|
| `js/variables.js` | La liste `#`, la valeur d'une bulle (autre table, chemin de références, calcul), la fenêtre des clés de correspondance entre tables. |
| `js/variable-format.js` | Format d'une bulle : nombre (devise, pourcentage, décimales), date (le jour et l'heure dans le fuseau d'une colonne « Date et heure »), Oui / Non, liste, nombre en toutes lettres ; et « Comme dans Grist » : le format d'affichage d'une colonne Grist traduit en réglage de bulle. |
| `js/variable-modal.js` | Ce que partagent les fenêtres d'une bulle. |
| `js/variable-condition.js`, `js/variable-loop.js`, `js/variable-list.js`, `js/variable-linked-attrs.js`, `js/variable-calc.js`, `js/variable-column.js` | Les fenêtres d'une bulle : Condition, Boucle (dont la zone qui entoure la bulle, pour une boucle dans une boucle, et le choix des lignes : rattachées à la ligne affichée ou toutes les lignes de la table ; sous « La variable, dans sa cellule », la note qui dit que les autres variables de la ligne du tableau ne suivent pas ; `rowStatus` et `openRow`, ce que le bouton « Répéter la ligne » de la barre du tableau sait de la ligne visée), Liste, Autres attributs, Calcul, Colonne. |
| `js/variable-otherwise.js` | Le « sinon » d'une bulle (ligne « Sinon afficher » de la fenêtre Condition) : sa forme enregistrée, la bulle qu'il écrit quand la condition n'est pas remplie, et sa résolution avant les bulles en Lecture et dans les exports. |
| `js/field-editor.js`, `js/field-codec.js` | Les champs texte du mode E-mail (Objet, À, Cc, Cci) et du nom du PDF : un éditeur d'une ligne qui pose les mêmes bulles que le document, avec leur barre et leurs fenêtres, et les puces date, heure, email et nom de l'utilisateur ; la valeur enregistrée reste du texte brut tant qu'aucune bulle n'a de réglage et qu'aucune puce n'est posée. |
| `js/formula.js` | Le moteur de calcul d'une bulle « Calcul » (module pur : ni DOM, ni Grist). |
| `js/condition-rules.js`, `js/condition-fields.js` | L'évaluation des règles « colonne, opérateur, valeur ou autre colonne » (module pur) et leurs champs partagés par toutes les fenêtres. |
| `js/loop-rules.js`, `js/list-split.js` | Le moteur de boucle sur les lignes liées, ou sur toutes les lignes d'une table (`all` : celles de la vue Grist du widget, ou toute la table ; `allSourceFor`) (il donne aussi à chaque copie de zone le rang de son tour, que la puce « N° de ligne » écrit, et il développe d'abord les zones extérieures : une zone dans une zone lit les lignes de la ligne en cours de la zone qui l'entoure) ; « Un document par valeur ». |
| `js/conditional-text.js`, `js/conditional-checkbox.js`, `js/conditional-value.js` | Bloc, case et valeur conditionnels. La valeur et le bloc ont un « sinon » : un texte simple écrit à leur place quand la condition n'est pas remplie (attribut `otherwise` du nœud, ligne « Sinon afficher » de la fenêtre de condition, table `TEXT_OTHERWISE` de `js/variable-condition.js` ; lu par `ConditionalText.otherwiseText` et `otherwiseLines`, écrit par `ConditionalValue.resolve` et `ConditionalText.resolve` : une ligne pour la valeur, un paragraphe par ligne pour le bloc). |
| `js/space-gap.js` | Les espaces autour de ce qui n'écrit rien : une valeur conditionnelle retirée, une bulle vide, masquée, à zéro masqué ou sans ligne dans sa boucle ne doublent pas les espaces tapés autour d'elles et n'en laissent ni au bord d'un paragraphe ni devant une virgule (Lecture, tous les exports, en-têtes et pieds, champs de l'e-mail). |

### Macro-modèles (2 fichiers, 520 lignes)

| Fichier | Rôle |
|---|---|
| `js/macro-templates.js` | Choisir et assembler les annexes d'un macro-modèle (aucun DOM) ; en « Selon chaque modèle », écrire le sens de page de chaque modèle assemblé. |
| `js/macro-editor.js` | L'écran de création d'un macro-modèle et son résumé. |

### Page et mise en page (11 fichiers, 3 600 lignes)

| Fichier | Rôle |
|---|---|
| `js/page-layout.js` | Marges, orientation, format, filigrane et couleurs gardées de chaque modèle : la source unique de la largeur de contenu. |
| `js/page-sections.js` | Lit les repères de sens d'un macro-modèle (portrait, paysage) pour que chaque modèle garde son sens de page dans le PDF, le Word, la Lecture et l'impression. |
| `js/page-layer.js` | Les images « sur toutes les pages » et le filigrane. |
| `js/orientation-toggle.js`, `js/page-size-dialog.js`, `js/watermark-dialog.js` | Le menu Page et ses fenêtres : sens (et « Selon chaque modèle » d'un macro-modèle) et format, « Format libre… », « Filigrane… ». |
| `js/page-zoom.js` | Le zoom de la page à l'écran, en Édition et en Lecture (pastille du coin, Ajuster, Ctrl + molette) ; affichage seulement, les exports gardent les dimensions réelles. |
| `js/header-footer-preview.js` | Édition de l'en-tête et du pied, aperçu paginé. |
| `js/table-page-cut.js` | Où un tableau se coupe entre deux pages. |
| `js/zone-page-cut.js` | Où une zone à deux colonnes se coupe entre deux pages, colonne par colonne comme le PDF (l'éditeur et la Lecture). |
| `js/sheet-layout.js`, `js/sheet-assembly-dialog.js` | « Assemblage avant impression » : la géométrie d'une planche et sa fenêtre. |

### Lecture (2 fichiers, 1 400 lignes)

| Fichier | Rôle |
|---|---|
| `js/reader-mode.js` | Le document résolu pour une ligne et paginé ; `preview()` sert aussi tous les exports. |
| `js/reader-guide.js` | Le guide affiché quand aucune ligne n'est choisie, et la carte « Donnez l'accès complet à ce widget » que l'éditeur montre à la place du document quand Grist ne lui donne pas l'accès complet. |

### Mode grille (6 fichiers, 3 800 lignes)

| Fichier | Rôle |
|---|---|
| `js/grid-editor.js` | Le modèle « grille » : un seul tableau de tableur, colonnes et lignes réglables. |
| `js/grid-table.js` | Lire un tableau collé depuis Excel, Google Sheets ou LibreOffice. |
| `js/grid-xlsx-import.js` | Importer un classeur `.xlsx` dans une grille. |
| `js/table-borders.js` | La règle des bordures, écrite une fois pour l'éditeur, la Lecture, le PDF et l'Excel. |
| `js/xlsx-number-format.js` | Le texte qu'Excel montrerait pour un format de nombre ou de date. |
| `js/linked-table.js` | Le tableau d'un document lié à un modèle Grille : l'attribut du lien et le jeton du modèle qui le fait compter, le choix du modèle dans la liste, le repère dans la page, les règles du contenu des cases et les verrous (suivi des modifications, lecture seule), la mise à jour du tableau depuis le modèle, son envoi au modèle et l'ouverture du modèle (avec le retour au document, que `js/main.js` porte), puis le suivi du modèle par le document : la base du tableau (ce que le document et le modèle disaient à la dernière synchro), le plan qui en tire la mise à jour, l'envoi ou le désaccord, la synchro à l'ouverture et à chaque relecture de l'enregistrement automatique (`followLinkedModels` de `js/main.js`), l'envoi des tableaux changés à leurs modèles avec l'enregistrement du document - dans le même lot d'écriture que sa ligne (`Templates.save`), la base de l'éditeur n'avançant qu'une fois Grist d'accord - et la lecture du modèle par les sorties qui lisent les documents enregistrés. |

### Exports (22 fichiers, 9 000 lignes)

| Fichier | Rôle |
|---|---|
| `js/export-common.js` | Aides partagées par les exports, et le chargeur de scripts (cdnjs et jsDelivr avec une empreinte, ou le site du widget lui-même ; le reste est refusé), qui charge aussi, en module et avec son empreinte, le fichier assemblé de GFS de l'écriture en direct. |
| `js/export-engines.js` | Charge au premier export, et non à l'ouverture, les moteurs d'export du widget (PDF, fusion des PDF, feuilles d'assemblage, Word, Excel, format des nombres d'Excel, Markdown, HTML), déclarés dans `index.html` par des balises inertes. |
| `js/image-io.js` | La lecture des images, pour l'insertion (collage, adresse) comme pour les exports PDF, Word et Excel : un fichier, un Blob ou une adresse devient un Blob, une adresse `data:` ou un PNG (`fetch`, `new Image()`) ; et, pour la qualité « Léger » du PDF, une image ramenée à 150 points par pouce dans sa boîte (`lighten`, un canvas). |
| `js/pdf-export.js` | Le PDF vectoriel (pdfmake) : le plus gros fichier du widget. |
| `js/print-export.js` | L'impression par le navigateur (qualité « Impression navigateur » du menu « Type d'export ») : la Lecture rendue (`ReaderMode.renderInto`), découpée en feuilles de la taille exacte du modèle (`css/print.css`), puis confiée à `window.print()`. Une seule façon d'imprimer, seul comme hébergé par Grist Factory Suite (dont le cadre isolé ne laisse pas lire un cadre caché) : la page du widget elle-même - un conteneur à arbre ombre posé dans la page, que `@media print` montre seul le temps de l'impression, retiré à `afterprint`. Aucune bibliothèque à charger ; une ligne à la fois, 60 pages au plus. |
| `js/pdf-fonts.js`, `js/pdf-fonts-extra.js`, `js/pdf-fonts-boxes.js`, `js/pdf-fonts-symbols.js` | Les polices du PDF, des données chargées au premier PDF (`pdf-fonts.js`, `pdf-fonts-boxes.js` et `pdf-fonts-symbols.js` sont générées par des scripts du dépôt de développement, qui ne sont pas publiés ici). |
| `js/pdf-glyph-fallback.js` | Repli de police caractère par caractère. |
| `js/pdf-merge.js` | Un seul PDF pour toutes les lignes (pdf-lib). |
| `js/docx-export.js` | Le Word (docx). |
| `js/xlsx-export.js` | L'Excel d'une grille (ExcelJS). |
| `js/markdown-export.js` | Le Markdown (`.md`, CommonMark et GFM) : le HTML résolu d'une ligne lu nœud par nœud, ce que le Markdown écrit en Markdown et le reste en HTML en ligne, sans bibliothèque. Son second usage, `exportTemplate` / `getMarkdownBlobForTemplate` (« Markdown (modèle) »), écrit le modèle lui-même : une bulle sans réglage en `{{Table.Colonne}}`, les autres éléments de fusion en HTML en ligne avec leurs `data-*`. |
| `js/markdown-import.js` | L'import Markdown, le sens inverse du précédent : un `.md` lu par marked (chargé de cdnjs au premier import, avec son empreinte), remis dans la forme que l'éditeur écrit lui-même (listes à cases, encadrés, notes de bas de page, sommaire, saut de page, images, alignements) puis nettoyé par `HtmlSanitize` ; l'en-tête et le pied de page écrits entre commentaires deviennent ceux du document ; les `{{Table.Colonne}}` redeviennent des bulles de variable et les éléments de fusion écrits en HTML par « Markdown (modèle) » reprennent leurs réglages. |
| `js/html-export.js` | Le HTML (`.html`, pour un site web) : le HTML résolu d'une ligne, qui est déjà du HTML, nettoyé de ce qui ne sert qu'au widget (listes blanches de balises, d'attributs et de déclarations de style, rien qui s'exécute) et accompagné d'une feuille de style réduite à ce que le document emploie. Deux sorties du même contenu : le fichier complet à déposer (`getHtmlBlobForRecord`) et le contenu seul à coller (option `fragment`, dont la feuille de style ne touche que `.pp-doc`). Le texte coule (ni pages, ni marges, ni numéros de page, ni filigrane), l'en-tête et le pied sont écrits une fois ; les images partent en data URI, sauf celles d'une autre adresse web. Sans bibliothèque. |
| `js/mailto-export.js` | Le lien `mailto:` du mode E-mail, et la messagerie qui l'ouvre (Standard ou Zimbra, un réglage personnel de Réglages > Email). |
| `js/batch-failures.js` | Les fenêtres des exports en lot et des PDF : celle qui s'ouvre à la fin d'un lot et liste les lignes qui n'ont pas pu être générées, avec leur raison (l'erreur levée, un genre de modèle que l'export ne fait pas, ou le mot de passe de ligne d'un PDF protégé absent ou inutilisable) ; celle qui prévient qu'un PDF a une page blanche avant de l'enregistrer (« Annuler » ou « Exporter quand même »), et sa liste de fin de lot (sur la fenêtre commune des saisies et des confirmations). |
| `js/batch-scope.js` | Les lignes d'un export en lot : celles que le widget affiche dans Grist (ses filtres, son tri, le lien « Sélectionner par »), ou toute la table ; un widget qui n'en affiche qu'une partie fait poser la question ; `onViewChange` prévient quand Grist dit que ces lignes ont changé (la Lecture d'une boucle sur toutes les lignes se redessine). |
| `js/export-choices.js` | Les choix d'export de la personne, gardés par modèle : le type (PDF, PDF protégé, Word, Excel, Markdown, Markdown (modèle), HTML (fichier à déposer), HTML (contenu à coller)), la qualité du PDF et « une seule ligne / toutes les lignes ». Les trois listes cachées de la barre restent ce que `js/main.js` lit pour exporter ; la table des préférences (`js/template-preferences.js`) les garde d'un ordinateur à l'autre, un compte en lecture seule ne les garde que pour la séance. |
| `js/pdf-protection.js` | Le « PDF protégé » (type du menu « Type d'export ») sans interface : les réglages propres (les trois façons de donner le mot de passe - saisi, commun enregistré dans le document, ou celui de chaque ligne -, trois droits, propriétés du fichier), le mot de passe d'une ligne lu dans sa cellule, le mot de passe « propriétaire » tiré au hasard quand seuls des droits sont posés, et les champs de document que pdfmake lit (chiffrement AES-256). |
| `js/pdf-protection-dialog.js` | La fenêtre « PDF protégé » (sur la fenêtre commune), ouverte avant l'export d'une ligne et d'une archive ZIP : elle rend les réglages ou rien. Elle propose les trois façons de donner le mot de passe, dit où le mot de passe commun s'écrit dans le document et le risque d'un mot de passe en clair, et lit puis écrit ce mot de passe commun par `js/templates.js`. Aucun mot de passe n'est gardé dans le navigateur ; seuls la façon choisie, les droits, l'auteur et la colonne des mots de passe le sont. |

### Socle de l'interface et réglages (15 fichiers, 4 600 lignes)

| Fichier | Rôle |
|---|---|
| `js/dom.js` | Les briques d'interface communes et le seul endroit qui lit du balisage (`Dom.setMarkup`, `Dom.inertTemplate`), chargé en premier. |
| `js/layers.js`, `js/viewport-fit.js` | L'ordre d'empilement des menus et fenêtres ; l'interface tenue dans un petit panneau. |
| `js/modal-base.js`, `js/dialogs.js` | La base commune des fenêtres ; saisies et confirmations (à la place de `prompt` et `confirm`). |
| `js/search-select.js` | La liste déroulante avec recherche, pour tout choix de colonne, de table ou de modèle, avec la descente dans les colonnes d'une Référence. |
| `js/icons.js` | Les icônes SVG. |
| `js/i18n.js` | Les traductions FR et EN, et la langue de départ : celle de GFS quand il héberge le widget (`gfsLang`), sinon celle que la personne a choisie, sinon celle du navigateur. |
| `js/settings.js` | Le panneau Réglages : langue, thème, touche de déclenchement, messagerie du mode E-mail, marges, crédits. Changer de langue ou de touche recharge la page, qui rouvre le modèle où l'on était : son identifiant passe par l'adresse (`#pp-open=<id>`, `reloadKeepingTemplate`), lu puis effacé au démarrage (`takeReopenId`). Hébergé par GFS, la langue est celle de GFS : les deux cases de langue sont grisées avec la raison (`applyLanguageLock`), et un changement fait dans GFS recharge la page de la même façon (`followGfsLanguage` ; la langue de GFS passe par l'adresse, `&pp-lang=fr`). |
| `js/save-reminder.js` | Le rappel « Enregistrer » des Réglages Vue et Accès : la ligne à gauche de « Fermer » après un changement, éteinte par le « Retour » de Grist (qui ne dit rien d'un clic sur « Enregistrer »), et les onglets reprennent alors le réglage enregistré. |
| `js/shortcuts.js`, `js/shortcuts-panel.js` | Les raccourcis clavier personnalisables et leur liste. |
| `js/first-contact.js` | La fenêtre de premier contact quand le widget ne démarre pas comme prévu. |
| `js/clean-reading.js` | La Lecture épurée (sans la barre du haut), ouverte d'emblée pour les personnes en lecture seule, comptes Lecteur de Grist compris, quand la case des Réglages est cochée. |
| `js/version.js` | Le numéro de version. |

### Extensions de Grist Factory Suite (5 fichiers, 650 lignes)

| Fichier | Rôle |
|---|---|
| `js/gfs-link.js` | Le lien avec Grist Factory Suite quand il héberge le widget (l'adresse porte `gfs=`) : le contexte demandé au démarrage (les extensions actives, la source de leurs bibliothèques, l'adresse du widget, l'ouverture demandée et la langue), l'événement `extensions`, l'événement `langue` (`language()`, `onLanguage`), `installer`, et l'appel `ouvrir` que GFS envoie (sa réponse `{ ouvert }` ; tout autre appel reçoit `GFS_INCONNU`) ; `opensInNewTab(href)` dit si un lien `mailto:` ou `tel:` doit s'ouvrir dans un nouvel onglet (hébergé seulement : dans le cadre isolé de GFS, le suivre dans le cadre le ferait mourir). Seul, aucun message n'est écrit ni écouté. |
| `js/gfs-open.js` | Ce que le widget fait d'une ouverture que GFS lui demande : le modèle que GFS désigne s'ouvre au démarrage, avant l'ordre habituel (la ligne, le modèle de la vue, le ★ ; seul le modèle rouvert après un rechargement voulu par l'app, `Settings.takeReopenId`, passe avant lui), et à l'appel `ouvrir` (par le chemin de la liste des modèles, donc avec sa question « Enregistrer / Abandonner / Annuler » quand des modifications attendent) ; le coin d'état dit pourquoi. « Nouveau » (pas de fichier, un type) ouvre à la place un modèle vierge de ce type, au démarrage comme à l'appel, par le chemin du bouton « Nouveau » du même type (`openBlankOfType` de `js/main.js`) ; son avertissement « modèle non enregistré » reste. Rien n'est écrit dans le document ni dans les réglages. |
| `js/extensions.js` | Le registre des extensions : les fichiers de chacune, chargés au premier usage seulement et si GFS la dit active, et ce qu'une fonction grisée dit au clic (GFS ouvre son installation, ou une fenêtre simple dit qu'il faut passer par lui). |
| `js/live-entry.js` | L'écriture en direct vue du socle : le grisé de sa ligne du menu « Édition collaborative » sans l'extension (jamais cachée : la raison en info-bulle, et son clic explique ou ouvre l'installation de GFS), l'activation (le code de l'extension et le fichier de GFS ne se chargent qu'au premier clic, ou quand un salon vivant est vu sur le modèle ouvert), l'entrée automatique (quand une personne allume l'écriture en direct, celles qui ont le même modèle ouvert - présentes ou arrivées ensuite - la rejoignent toutes seules : le socle relit la table `Publipostage_Direct` toutes les 3 s, seulement quand l'extension est active et que rien n'est à perdre à l'écran), et le seul point d'entrée par lequel le reste du widget l'atteint : `isLive` (l'en-tête et le pied de page, le suivi des modifications, les tableaux liés et l'historique des versions se ferment), `undo` et `redo` par personne, `blocksAutosave` et le jeton d'enregistrement (une seule personne enregistre le modèle pour tout le monde). |
| `js/slides-entry.js` | Les présentations vues du socle : le type « presentation » (déclaré à `js/templates.js` avec le nom de l'extension : il s'ouvre quand GFS a activé l'extension « diapositives », sinon il reste grisé dans les listes, jamais perdu), la page d'une présentation (la diapositive 16:9 en paysage, `PageLayout.SLIDE_FORMAT`, pour une présentation vierge ou sans format à elle), le grisé de la ligne « Nouvelle présentation » du menu « + » sans l'extension (son clic explique ou ouvre l'installation de GFS), et le seul point d'entrée par lequel le reste du widget l'atteint : la bande des diapositives (montrée tant qu'une présentation est à l'écran en Édition, son code chargé seulement si l'extension est active ; éteinte en cours de route, la bande reste et ses gestes se grisent) et la page de chaque diapositive, la dernière comprise même vide (`showsEveryPage` pour la pagination de l'éditeur, et pour le PDF, qui ne signale alors aucune page blanche ; `outputHtml`, qui marque les sauts de page d'une présentation, pour la Lecture et les exports) ; `status`, le coin d'état où la bande écrit « Diapositive 3 copiée. » (posé par `js/main.js`). |
| `extensions/graphique/chart-block.js`, `extensions/graphique/chart-source.js`, `extensions/graphique/chart-plot.js` (et `chart-block.css`) | L'extension « graphique » : la fenêtre, le dessin du cadre dans l'éditeur, à la Lecture et à l'export ; la lecture des réglages d'un graphique de Grist (type, colonnes, tri, filtres, lignes ; la liste ne propose pas ce widget-ci, que la page porte comme widget personnalisé : hébergé, GFS donne son adresse) ; le tracé avec Plotly, rendu en image PNG (la bibliothèque est celle que GFS donne, chargée au premier graphique). |
| `extensions/edition/live-channel.js`, `extensions/edition/live-sync.js`, `extensions/edition/live-editor.js`, `extensions/edition/live-control.js` (et `live.css`) | L'extension « édition » (écriture en direct du texte d'un modèle Document) : le tuyau, la table `Publipostage_Direct` relue toutes les 250 ms quand une autre personne est là (2 s seul, rien quand la page est cachée) ; le moteur, un document Yjs par modèle, ses mises à jour, les présences, la compaction et le repère d'enregistrement ; le lien avec l'éditeur (le texte partagé, Annuler et Rétablir par personne, le curseur et le nom des autres, les marques des puces qui voyagent dans un attribut) ; le chef d'orchestre (démarrer, rejoindre - sans question et sans jamais fonder quand c'est l'entrée automatique -, arrêter, la barre des personnes, qui enregistre le modèle). La bibliothèque (Yjs et les extensions de TipTap) est le module que GFS donne sous `edition-live`, jamais importé d'ailleurs. |
| `extensions/diapositives/slide-strip.js` (et `slide-strip.css`) | L'extension « diapositives » : la bande à gauche d'une présentation, une miniature par diapositive (une copie du rendu de l'éditeur, réduite à 80 pixels de large), celle du curseur cochée ; un clic ou les flèches mènent à une diapositive ; son menu (« ⋯ », clic droit, Maj+F10) l'ajoute après, la duplique, la monte, la descend ou la supprime, « Ajouter » au bas de la bande ; chaque geste est une seule transaction de l'éditeur (un Ctrl+Z le défait) ; le point rouge d'une diapositive qui dépasse de sa page, lu sur la pagination de l'éditeur ; les miniatures ne se copient que pour les rangées que la bande montre, ou presque (un `IntersectionObserver` sur la liste), et une rangée suit sa diapositive quand elle change de place (`matchRows`) ; une image en calque (devant ou derrière le texte) suit sa diapositive quand celle-ci change de page : dans la transaction du geste (`predictLayers`), puis après chaque pagination (`followLayers`, rangé dans l'historique du changement qui l'a causé), sa page relue sur `HeaderFooterPreview.pageBodyTops` ; le copier-coller d'une diapositive (Ctrl+C, Ctrl+V, par les événements `copy` et `paste` du navigateur, d'une présentation et d'un onglet à l'autre) : `onCopy` et `slideForClipboard` (son HTML, sans l'image de toutes les pages ni les commentaires, dans une enveloppe `data-pp-slide` qui dit sa première page), `onPaste` et `pasteAfter` (une diapositive de plus, remplie par le collage de l'éditeur, un seul Ctrl+Z), `placePastedLayers` (ses images en calque sur sa nouvelle page) ; la feuille de style cache dans l'éditeur les sauts de page d'une présentation, sauf celui qui est sélectionné (sa place reste). Aucune bibliothèque. |

### Orchestration

`js/main.js` (2 400 lignes) : modèles, modes Édition et Lecture, enregistrement automatique, exports (un
fichier, un lot), câblage de la galerie et de Grist. C'est le fichier qui connaît tous les autres.

### Les feuilles de style

`css/style.css` (jetons de couleur, thème clair et sombre, `--font-ui`), `css/toolbar-v2.css` (la barre du
haut), `css/editor-v2.css` (le texte de l'éditeur) ; les 44 autres vont chacune avec un module ou une
fenêtre de `js/` (`css/callout.css` pour `js/callout.js`) et le disent dans leur premier commentaire ;
`css/roboto-fonts.css` embarque la police des documents.

## Où le widget touche l'extérieur

- **Grist** : `js/grist-api.js` pour l'essentiel ; les modules qui possèdent une table la lisent et
  l'écrivent eux-mêmes (`js/templates.js`, `js/template-preferences.js`, `js/comments.js`,
  `js/text-expansion.js`, `js/saved-page-formats.js`, `js/versions-store.js`). Neuf tables `Publipostage_*`, créées seulement avec
  l'accord de la personne (`js/table-consent.js`) ; le widget ne supprime ni ne renomme aucune table ni
  colonne. Dans les tables qui portent les données, une seule écriture : la date du dernier export PDF,
  dans la colonne que la personne a choisie (`js/export-date.js`, appelé par `js/main.js` après un export).
- **Grist Factory Suite** : seulement quand l'adresse du widget porte `gfs=` (GFS l'héberge), `js/gfs-link.js` écrit
  au cadre parent (le contexte, `installer`, la réponse à l'appel `ouvrir`) et lit ce que GFS lui envoie (les événements
  `extensions` et `langue`, l'appel `ouvrir`), après avoir vérifié d'où il vient ; seul, le widget n'écrit ni n'écoute aucun message.
- **Le réseau** : le script de l'API de Grist (`docs.getgrist.com`), l'éditeur (`esm.sh`), les
  bibliothèques d'export et le lecteur de l'import Markdown au premier usage (`cdnjs.cloudflare.com`, `cdn.jsdelivr.net`), les moteurs
  d'export du widget et les fichiers d'une extension (même site, `extensions/`), et la bibliothèque d'une extension à l'adresse que GFS donne (Plotly, avec son
  empreinte), tous chargés par `ExportCommon.loadScriptOnce`, le catalogue de la galerie (même site, `fetch` dans
  `js/template-gallery.js`), et la lecture d'une image (`fetch` ou `new Image()`, dans `js/image-io.js`
  seulement : l'insertion et les exports PDF, Word et Excel la prennent là ; une image d'un autre
  site attend un clic « Afficher » à l'écran, et la fenêtre de `js/external-images.js` à l'export). Ce sont des lectures : le code n'a
  aucun `fetch` avec un corps ou une méthode d'écriture, ni `XMLHttpRequest`, ni `WebSocket`, ni
  `sendBeacon`, ni cookie.
- **Le navigateur** : `localStorage` pour la langue, le thème, les touches de déclenchement, les
  raccourcis et la vue de leur panneau, l'enregistrement automatique, le dernier choix de l'assemblage
  avant impression, le niveau de zoom des derniers modèles ouverts (avec leur numéro et leur nom) et
  l'instantané des noms de tables et de colonnes (`js/schema-renames.js`). Jamais le contenu d'un modèle
  ni une donnée du document.
- **Les téléchargements** : `ExportCommon.downloadBlob`, sur un clic de la personne.

## Ce qui n'est pas du code du widget

`templates-gallery/` (les modèles de la galerie, des données avec leur `catalogue.json`), `img/` (le logo),
`screenshots/` (les captures du README) et les documents de la racine : `README.md`, `CONTRIBUTING.md`,
`SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `NOTICE`, `LICENSE` et ce fichier. La page ne charge
rien d'eux. Le dépôt de développement du projet garde en plus ses tests, ses outils de publication et ses
notes de conception, qui ne sont pas publiés ici.

## Où changer quoi

| Pour… | Voir |
|---|---|
| Ajouter une colonne à la table des modèles | `js/templates.js` (création, `ensureColumns`, lecture, enregistrement) ; la colonne doit exister avant la première écriture, sinon Grist refuse tout le lot. `Jeton` fait exception : créée à la demande par `ensureToken`, jamais écrite par l'enregistrement ; `ModifiePar` aussi, écrite seulement quand `modifiedByColumnReady` le dit (sans droit de structure, une écriture sur une colonne absente annulerait tout le lot). |
| Ajouter une fenêtre | `js/modal-base.js` et `js/dialogs.js`, `css/modal-base.css`. |
| Ajouter un choix de colonne, de table ou de modèle | `js/search-select.js`. |
| Changer ce qu'est un signet, où il se pose, ou ce que font les liens qui y mènent | `js/anchors.js` (l'attribut, la normalisation, les cibles), `js/bookmark-dialog.js` (la fenêtre) et le choix « Dans ce document » de `js/link-dialog.js` ; chaque export écrit le signet et le lien à sa façon (`placeAnchor` de `js/pdf-export.js`, `anchorBookmarksOf` de `js/docx-export.js`, `anchorTarget` de `js/html-export.js`, `anchorMark` de `js/markdown-export.js`, `anchors` de `js/markdown-import.js`) et la Lecture les suit (`followInternalLink` de `js/reader-mode.js`). |
| Ajouter un texte à l'interface | `js/i18n.js`, en français et en anglais dans le même lot. |
| Changer la façon dont le widget suit la langue de GFS | `js/gfs-link.js` (`language`, `onLanguage`), `gfsLang` de `js/i18n.js` (la langue de départ), `applyLanguageLock` et `followGfsLanguage` de `js/settings.js` (les cases grisées, le rechargement), `Settings.followGfsLanguage()` à la fin d'`init()` de `js/main.js`, la phrase `#settings-language-gfs-note` d'`index.html`. |
| Ajouter un menu ou une fenêtre flottante | `js/layers.js` (l'ordre d'empilement). |
| Ajouter un raccourci clavier | `js/shortcuts.js`. |
| Changer ce que le « PDF protégé » protège (mot de passe, droits, propriétés) | `js/pdf-protection.js` (les réglages, le mot de passe de chaque ligne et les champs de pdfmake), `js/pdf-protection-dialog.js` et `css/pdf-protection.css` (la fenêtre), `js/templates.js` (le mot de passe commun : colonne `MotDePassePdf`), `js/pdf-export.js` (`withDocFields` : les champs ne se posent que sur le document fini), `js/main.js` (`SINGLE_EXPORTS.pdfProtected`, `BATCH_EXPORTS.pdfProtectedZip`, `protectionForRecord`), `js/batch-failures.js` (la ligne sans mot de passe). Un fichier qui réunit plusieurs PDF (un seul PDF, assemblage) ne se chiffre pas : ces sorties sont grisées pour ce type. |
| Ajouter un chemin d'export PDF | `js/main.js` : l'appeler `stampExportDate` après le téléchargement (la colonne de Réglages > Vue qui garde la date du dernier export), avec les lignes dont le PDF est dans le fichier. |
| Changer ce qui fait d'une page du PDF une « page blanche », ou les fenêtres qui la signalent | `js/pdf-export.js` (`blankPagesOf` et `paintsInBody` : ce qui se peint dans le corps ; `markFurniture` : l'en-tête, le pied, le filigrane et le fond qui ne comptent pas ; `blankPageBlock` : la page voulue entre deux sauts de page ; `renderOnce` : la mise en page faite une seule fois, sans recherche de page blanche pour une présentation, dont chaque page est une diapositive voulue), `js/batch-failures.js` (`confirmBlankPages` avant d'enregistrer, `showBlankPages` en fin de lot) et leurs textes `blankPages.*` de `js/i18n.js`. Un nouveau chemin d'export PDF qui enregistre un fichier passe par `exportCurrentRecord` ou lit `blankPages` de `getNativePdfBlobForRecord`. |
| Ajouter une bibliothèque d'export | `js/export-common.js` (chargeur, empreinte) et la politique de sécurité de `index.html`. |
| Changer ce que l'import Markdown reconnaît, ou ce que l'export Markdown écrit | `js/markdown-import.js` et `js/markdown-export.js` vont ensemble : ce que l'un écrit, l'autre doit le relire. |
| Changer ce que l'export HTML écrit, garde ou laisse | `js/html-export.js` : les listes blanches (`KEPT_TAGS`, `STYLE_PROPS`, les attributs), les blocs de la feuille de style (`stylesheetFor` : un par famille d'éléments, écrit seulement quand le document s'en sert) et ce qui sépare le fichier complet du contenu à coller (`BASE_CSS` n'est écrite que dans le premier). |
| Ajouter un type au menu « Type d'export » | Une ligne `data-export-type` du menu (et son `<option>` de `#v2-export-type`) dans `index.html`, `SINGLE_EXPORTS` et `BATCH_EXPORTS` de `js/main.js`, ses textes dans `js/i18n.js`. Le menu, avec ses trois qualités du PDF, doit rester entier dans un panneau de 700 × 400 : à huit types il est déjà resserré (`css/editor-v2.css`, `#v2-quality-flyout`). |
| Changer ce que l'impression par le navigateur imprime (feuilles, page plus haute qu'une feuille, taille de la page) | `js/print-export.js` et `css/print.css` ; le rendu lui-même est celui de la Lecture (`ReaderMode.renderInto` de `js/reader-mode.js`) : le changer change aussi l'impression. Une seule façon d'imprimer (seul comme hébergé) : une règle de contenu s'écrit une fois dans `css/print.css`, sous `div.pp-print-scope` ; ce que le rendu doit hériter de la page (la langue, la police de `body`, les jetons clairs) passe par `lang` sur `.pp-print-scope`, `font-family: inherit` et `:root, .pp-print-host` de `css/style.css`, car le conteneur est en `all: initial`. |
| Ouvrir dans un nouvel onglet un lien que le cadre isolé de GFS ne laisse pas suivre (`mailto:`, `tel:`) | `GfsLink.opensInNewTab(href)` (`js/gfs-link.js`), appelée là où le widget fabrique ou rend un lien : `onCreateEmail` (`js/main.js`), `openExternal` (`js/link-dialog.js`), `readerWrapperFrom` (`js/reader-mode.js`). |
| Ajouter un moteur d'export du widget (un script que seul un export utilise) | Une balise inerte `<script type="text/x-lazy-engine" data-engine="…">` dans `index.html`, puis son nom dans la liste `engines` de l'export qui s'en sert (`js/main.js`) : `js/export-engines.js` le charge au premier besoin. |
| Un nouvel élément de document (nœud, mise en forme) | `js/editor-nodes.js` (l'éditeur), sa feuille de `css/` (l'écran et la Lecture), puis `js/pdf-export.js` et `js/docx-export.js` : chaque export le convertit à part. |
| Changer la palette de couleurs, ou ajouter un menu de couleur | `js/color-palette.js` (la palette et ses rangées ; un menu s'y branche par `createMenu`), `js/color-dialog.js` (la fenêtre « Couleur personnalisée »), `js/color-store.js` (les couleurs gardées : `PageLayout.getCustomColors` pour le modèle, `Templates.getDocumentSettings` pour le document), `css/color-palette.css`. |
| Mettre des bulles de variable ou des puces (date, heure, email, nom de l'utilisateur) dans un champ texte (Objet, À, Cc, Cci, nom du PDF) | `js/field-editor.js` (un éditeur d'une ligne qui se comporte comme l'`<input>` qu'il remplace), `js/field-codec.js` (la valeur enregistrée : texte brut ou HTML), `ReaderMode.fieldText` et `ReaderMode.smartChipValue` dans `js/reader-mode.js` (la valeur résolue, celle des puces), `css/field-editor.css`. |
| Changer ce que deviennent les espaces autour d'une valeur qui n'écrit rien (valeur conditionnelle retirée, bulle vide ou masquée) | `js/space-gap.js` (la règle : `absorb` et `settle`) ; elle est appelée par `putValue` dans `js/reader-mode.js` (les quatre endroits où une bulle est remplacée par sa valeur) et par le retrait d'une valeur dans `js/conditional-value.js` : un nouvel endroit qui pose une valeur à la place d'une bulle l'appelle aussi. |
| Changer ce qu'un modèle e-mail accepte d'écrire (une touche, un collage, une ancienne mise en forme) ou les lignes du texte du lien | `js/email-plain-text.js` et `css/email-plain-text.css` pour ce que l'éditeur accepte ; `js/mailto-export.js` pour le texte du lien, dont les lignes sont celles de l'éditeur, une pour une. |
| Faire lire le lien à une messagerie qui le lit mal (Zimbra affiche `&amp;` pour « & » et change « + » en espace) | `js/mailto-export.js` (`forZimbra`, l'option `client` de `buildMailtoUrl`, `getMailClient` et `setMailClient`) et l'onglet Email de `js/settings.js` et d'`index.html`. |
| Ajouter un modèle à la galerie | Un dossier de `templates-gallery/` (le texte du modèle, son `pack.json` : tables, colonnes, règles des Tables liées, page et type, et ses captures), puis sa ligne dans `templates-gallery/catalogue.json` (nom, étiquettes, vignette, captures, « Fonctions montrées »). `js/template-pack.js` lit et contrôle le `pack.json` ; les tables que plusieurs modèles partagent se disent une fois, dans le dossier `families/`. |
| Changer l'écriture en direct (le tuyau, le moteur, l'éditeur partagé, la barre des personnes, qui enregistre) | `extensions/edition/` : `live-channel.js` (la table `Publipostage_Direct`), `live-sync.js` (Yjs, les salons, la compaction), `live-editor.js` (le lien avec l'éditeur, Annuler par personne, les curseurs), `live-control.js` (démarrer, rejoindre, arrêter, la barre) et `live.css` ; ce que le reste du widget en sait passe par `LiveEntry` (`js/live-entry.js`). La bibliothèque est celle de GFS (`edition-live`) : elle ne s'importe jamais. |
| Changer les présentations (le type, la page 16:9, la ligne du menu « + », la bande des diapositives) | `js/slides-entry.js` (`SlidesEntry` : le type, `pageFor`, `startNew`, la raison du grisé) ; `js/templates.js` (`declareExtensionType` ; `isOpenableType` : ouvrable quand l'extension est active ; `isKnownType` : jamais réécrit sous un autre type, jamais perdu) ; `js/page-layout.js` (`SLIDE_FORMAT`, nommé « 16:9 » par `formatLabel`). La bande des diapositives : `extensions/diapositives/slide-strip.js` et `.css`, nommés par le registre de `js/extensions.js` ; elle lit la pagination de l'éditeur par `HeaderFooterPreview.pageBreaks`, `onPaginated` et `scrollToPage` (`js/header-footer-preview.js`). La page d'une diapositive vide de fin : `SlidesEntry.showsEveryPage` (l'éditeur, `trailingBlankStart`) et `SlidesEntry.outputHtml` (la Lecture et les exports, depuis `js/main.js`), que `ReaderMode.trimTrailingBlankBlocks` respecte (`js/reader-mode.js`). |
| Modifier un fichier de `css/` ou de `js/` | Monter son numéro `?v=` dans `index.html`, sinon le navigateur garde l'ancien. |

---

# Publipostage+ code map

*🇫🇷 Une version française de ce document est disponible [en haut de cette page](#carte-du-code-de-publipostage).*

For anyone reading the code: what is where, and where to start. Line counts are those of `wc -l` as of
{{DATE_EN}}; they move, the roles don't.

## The essentials

- **A static page.** `index.html`, `js/`, `css/` and `extensions/` are served as they are by GitHub Pages; Grist loads them
  in a frame and the widget asks for full access to the document, once (`grist.ready`, `js/grist-api.js`),
  for the reasons given in the [README](README.md#security-and-permissions). No build step, no server of
  our own.
- **Classic scripts, in the order of `index.html`.** Each file in `js/` defines one global object
  (`const Name = (function () { … })()`, or plain data for the fonts and the version; `js/main.js` and
  `js/text-expansion-settings.js` run without exposing anything) and reads the ones that come before it in
  the list of `<script>` tags. `js/dom.js` is loaded first, `js/main.js` last: it is the one that wires
  everything together. Eight export engines (`js/pdf-export.js`, `js/pdf-merge.js`, `js/sheet-layout.js`,
  `js/docx-export.js`, `js/xlsx-export.js`, `js/xlsx-number-format.js`, `js/markdown-export.js`, `js/html-export.js`) are only
  declared there, by inert tags; `js/export-engines.js` loads them on the first export.
- **Extensions, kept apart.** The chart from the page and live editing are Grist Factory Suite (GFS) extensions: their
  code is in `extensions/graphique/` (three scripts and a stylesheet) and `extensions/edition/` (four scripts and a
  stylesheet), which `js/extensions.js` loads on first use, and only if GFS says they are active (`js/gfs-link.js` asks it
  for the context). `index.html` requests none of their files. Alone, the widget loads nothing of them: the feature is
  greyed out, never hidden or lost, and clicking it says it must be used through GFS. Their libraries come from GFS, not
  from this repository: Plotly for the chart; for live editing, a single assembled module (Yjs and the TipTap extensions
  that use it), loaded by `<script type="module">` with its integrity hash, which neither the import map nor the content
  security policy names.
- **The editor** (TipTap on ProseMirror) is loaded with `import()` from the import map of `index.html`.
  **Each export** loads its library on first use, with an integrity hash (SRI) that the browser checks.
- **The data**: templates and settings live in `Publipostage_*` tables of the Grist document; display
  preferences (language, theme, shortcuts…) in the browser.
- **The size**: 147 files in `js/` (58,100 lines: 42,800 of code, 11,800 of comments, 3,500 blank), 3 in
  `extensions/graphique/` (1,000 lines), 5 in `extensions/edition/` (1,310 lines) and 2 in `extensions/diapositives/` (630 lines), 47 stylesheets (3,900 lines), an 830-line page. Four PDF font files weigh 2.5 MB in a few lines (data);
  `js/i18n.js` is text to translate, not logic.

## Where to start

In order, about ten minutes each:

1. `index.html`: the Content Security Policy (`<meta http-equiv="Content-Security-Policy">`), the import
   map, the order of the scripts, the two small inline scripts (their hashes, and the import map's, are in
   the policy). It also keeps the exact address of Plotly, which GFS gives to the chart extension and which
   the widget alone never loads (the comment above the tag says why).
2. `js/grist-api.js`: everything the widget reads and writes in Grist (startup, reading tables, matching
   keys, the e-mail probe).
3. `js/templates.js`: a template is a row of `Publipostage_Modeles` (columns, reading, saving, header and
   footer).
4. `js/main.js`: the orchestration (startup, Edit and Reading modes, autosave, exports).
5. `js/editor.js` then `js/editor-nodes.js`: the editor and its nodes (`#Variable` bubbles, callouts,
   captions…).
6. `js/reader-mode.js`: the document "resolved" for one row (variables, conditions, loops), common ground
   of Reading mode and all the exports.
7. `js/pdf-export.js`, `js/docx-export.js`, `js/xlsx-export.js`, `js/markdown-export.js`, `js/html-export.js`,
   `js/mailto-export.js`: each one transforms what `reader-mode.js` prepares.
8. [CONTRIBUTING.md](CONTRIBUTING.md#contributing-to-publipostage): how to try a change, and the rules of
   the code.

**For a security reading**, the short path: `index.html` (policy, import map) → `js/grist-api.js` and
`js/table-consent.js` (access, writes, consent before creating a table) → `js/html-sanitize.js` and
`js/templates.js` (the HTML that doesn't come from the editor) → `js/external-images.js`, `js/image-io.js`
and `js/export-common.js` (images from another site, image reading and the script loader). The
[README](README.md#security-and-permissions) says what the widget asks for and what it keeps; to report a
vulnerability: [SECURITY.md](SECURITY.md).

**The journey of a row into a file**: a table row (`GristAPI`) → `ReaderMode.preview` resolves the template
for that row (`Variables`, `ConditionRules`, `LoopRules`) → `PdfExport`, `DocxExport`, `XlsxExport` or
`MailtoExport` write the file → `ExportCommon.downloadBlob` offers it for download. Batches (one PDF or one
ZIP for all rows) go through `js/main.js` (`onExportBatch`) and `js/pdf-merge.js`.

## The map, family by family

### Grist and the document's data (22 files, 8,800 lines)

| File | Role |
|---|---|
| `js/grist-api.js` | The wrapper around the Grist API: startup and access, reads, writes, creation of the internal tables (after the person's consent), matching keys, the e-mail probe; reads the display format of number and date columns and the document's settings (language, currency); recognises a Viewer account by the `readonly=true` address (for them, no probe and no table created). |
| `js/table-consent.js` | The "Create the widget’s tables in this document?" window and the gesture counter that asks again after a refusal; `js/grist-api.js` decides when to ask. |
| `js/templates.js` | Templates: the `Publipostage_Modeles` table, reading, saving, header and footer (JSON), its row reserved for the document's settings (`TypeModele` = `reglages`, which also carries the protected PDFs' shared password in its `MotDePassePdf` column: `readPdfPassword`, `writePdfPassword`) the identity of a Grid template that document tables link to (`ensureToken`, `Jeton` column), the person who saved last (`ModifiePar` column) and the copy of the replaced state, attached to the template's write batch (`prepareVersionCopy`, `restoreVersion`). |
| `js/versions-store.js` | A template's version history: the `Publipostage_Versions` table (created when the first version is kept, only read when the window is opened), the rules for keeping the state a save replaces (another person, more than 5 minutes old, at most one copy every 10 minutes), the caps (30 versions per template, 3 million characters, never a named version) and the cleanup of orphan versions, the name of a version (`renameVersion`, `keepNamed`). A copy never blocks a save. |
| `js/versions-history.js` | The "Version history…" window of the Save button menu (on the shared window, with `css/versions-history.css`): the list of versions, the preview of the one you pick (document, e-mail, macro-template), "Compare" with the current version, "Name…" and "Restore this version". Loaded on the first click only. |
| `js/versions-compare.js` | The comparison behind the "Compare" button of the "Version history…" window: aligns the text blocks of the version and of the current version (identical blocks first, then those that look alike), compares the changed blocks word by word and returns the version's document with what it has in addition in green and what the current version has in addition in struck-through red; also compares a short text (subject, recipients) and lines (a macro-template's composition). No extra library; loaded on the first click on "Compare" only. |
| `js/template-preferences.js` | Each person's pins, folders and export choices (`Publipostage_PreferencesModeles`). |
| `js/template-organizer.js`, `js/template-tree-select.js`, `js/template-organize-modal.js` | The template list as a "pinned + folders" tree and the "Organize my templates" window. |
| `js/template-gallery.js`, `js/template-gallery-modal.js` | The catalog of ready-to-use templates (the `templates-gallery/` folder, same site as the widget) and the gallery window: grid, search, preview as screenshots of the filled document, "Use this template" and "Create with its tables". |
| `js/template-pack.js` | A gallery template delivered with its tables: reading and checking its `pack.json`, the plan of what to create in the document (tables to create, already there, in conflict), then the creation of the empty tables (columns, calculated columns, a Reference's displayed column, Linked tables rules), removed if a write fails. |
| `js/view-template.js` | A view's default template (a widget option). |
| `js/export-date.js` | The column that keeps each row's last PDF export date (a widget option): the Settings > View section and the write, once the PDF is made (`js/main.js` calls it after every PDF export). |
| `js/row-template.js`, `js/row-template-panel.js` | "According to the row": a template tied to a condition on the row; the engine and the screen. |
| `js/schema-renames.js` | Tracking of table and column renames made in Grist (a snapshot of the names in the browser). |
| `js/settings-columns.js` | Warns when a column named in the settings has disappeared. |
| `js/access-rights.js` | Per-person rights (read-only, export, comments): an interface lock, not a protection of the data. A Grist Viewer account opens read-only by default, export kept, without comments. |
| `js/page-tree.js` | Tidies the pages Grist creates along with the widget's tables. |
| `js/saved-page-formats.js` | Named page formats (`Publipostage_FormatsPage`). |

### HTML that doesn't come from the editor (2 files, 420 lines)

| File | Role |
|---|---|
| `js/html-sanitize.js` | Allow-list filter, parsed in an inert document, for the HTML of Grist columns, imported templates and the gallery. |
| `js/external-images.js` | Images from another site: a "Show" frame in their place until the click (nothing is remembered), flagged at all times afterwards, and a window before any export that would read them. |

### The editor (37 files, 11,500 lines)

| File | Role |
|---|---|
| `js/editor.js` | Startup of TipTap and ProseMirror, assembly of the extensions. |
| `js/editor-core.js` | Low-level helpers shared by the editor modules (no business logic). |
| `js/editor-nodes.js` | The custom nodes and extensions: `#Variable` bubbles, calculation, conditional cells and blocks, images, table of contents. |
| `js/floating-toolbars.js` | The floating bars of a selection: color, table (including “Repeat the row”, which opens the Loop on the row's bubble), image, variable, tracked change. |
| `js/color-palette.js`, `js/color-dialog.js`, `js/color-store.js`, `js/color-math.js` | The color menu (text, highlight, cell background, border line): the palette; the "Custom color" window; the colors kept per template and per document; the color calculations (a pure module). |
| `js/main-toolbar.js` | The toolbar: button state, click wiring, image insertion. |
| `js/format-painter.js`, `js/find-replace.js`, `js/link-dialog.js` | Format painter, Find / Replace, links. |
| `js/script-marks.js` | Superscript and subscript: the two text marks, how they are read in HTML (Word, Google Docs), the size the exports take from them and the Unicode characters an e-mail link writes in their place. |
| `js/tab-indent.js` | The Tab key: a tab at a 12.7 mm stop (Word's half inch), written as a small inline node so the HTML keeps it up to the end of a line, which Shift+Tab removes; what Tab already did (bullet level, next cell, column, open list) keeps priority, and Escape then Tab leaves the editor; turning text into a code block keeps the tabs. The stop in the exports: `js/pdf-export.js`, `js/docx-export.js`, `js/markdown-export.js`. |
| `js/callout.js`, `js/caption.js`, `js/keep-with-next.js`, `js/qr-code.js` | Callouts and signature, captions, "Keep with next", QR code. |
| `js/chart-entry.js` | The chart from the page as the base of the widget sees it: the shape of its frame in the document (name, size, the chart's references, kept as they are), its greyed state without the extension, and the single entry point through which the rest of the widget reaches its code. Its drawing is in the `graphique` extension (below). |
| `js/text-expansion.js`, `js/text-expansion-settings.js` | Text expansion (`Publipostage_Abreviations`) and its tab in Settings. |
| `js/suggestion-list.js` | The floating list of suggestions with its own typing handling (the one for `§` and the one for `@`): rows picked with the mouse or the keyboard, the message of an empty list. |
| `js/mention.js` | The `@` chip: a record from a row of any table, its list, its name read again each time the document is shown (Reading and exports) and "[Record not found]" when the row is gone. |
| `js/track-changes.js`, `js/track-changes-core.js`, `js/track-changes-selection.js`, `js/track-changes-resolve.js`, `js/track-changes-reading.js`, `js/track-changes-commands.js` | Track changes, on top of `prosemirror-suggest-changes`: the bridge to the editor and five modules (the marks, the selection, resolving, Reading mode and the exports, the commands). |
| `js/comments.js` | Threaded comments (`Publipostage_Commentaires`). |
| `js/table-select.js`, `js/table-merge.js` | Mouse selection of cells; merging and splitting cells of a document table. |
| `js/heading-numbering.js` | Heading numbering, the same for the editor, Reading mode, the PDF and the Word file. |
| `js/toc-links.js` | The lines of a table of contents are links: a click brings the heading they name to the top of the visible area (the editor preview, which also puts the cursor there, and Reading mode, by keyboard too). |
| `js/anchors.js` | Bookmarks: a name placed on a top-level paragraph or heading (`data-anchor` and `data-anchor-name` attributes, editor flag), the address derived from the name, the list of targets for an "In this document" link, the jump to the target; what the exports read (`indexElements`). |
| `js/bookmark-dialog.js` | The "Bookmark" window: place, rename or remove the bookmark of the block where the cursor is. |
| `js/email-plain-text.js` | The e-mail template only writes what the `mailto:` link carries: the bold, italic, underline, alignment and heading-level keys do nothing, typed Markdown signs (« # » included) stay text, pasting drops the formatting (a heading becomes a plain line, pasted plain text keeps its blank lines), formatting left over from an older template is no longer shown. |

### Variables and conditions (21 files, 7,100 lines)

| File | Role |
|---|---|
| `js/variables.js` | The `#` list, the value of a bubble (another table, a path of references, a calculation), the window for matching keys between tables. |
| `js/variable-format.js` | A bubble's format: number (currency, percentage, decimals), date (the day and time in the zone of a "Date and time" column), Yes / No, list, number in words; and "Like in Grist": a Grist column's display format translated into a bubble setting. |
| `js/variable-modal.js` | What a bubble's windows have in common. |
| `js/variable-condition.js`, `js/variable-loop.js`, `js/variable-list.js`, `js/variable-linked-attrs.js`, `js/variable-calc.js`, `js/variable-column.js` | A bubble's windows: Condition, Loop (including the zone around the bubble, for a loop in a loop, and the choice of rows: attached to the displayed row, or all the rows of the table; under “The variable, in its cell”, the note saying that the other variables of the table row do not follow; `rowStatus` and `openRow`, what the table bar's “Repeat the row” button knows about the targeted row), List, Other attributes, Calculation, Column. |
| `js/variable-otherwise.js` | A bubble's "otherwise" (the "Otherwise show" row of the Condition window): its saved form, the bubble it writes when the condition is not met, and its resolution before the bubbles in Reading mode and in the exports. |
| `js/field-editor.js`, `js/field-codec.js` | The text fields of E-mail mode (Subject, To, Cc, Bcc) and of the PDF file name: a one-line editor that places the same bubbles as the document, with their toolbar and windows, and the user's date, time, email and name chips; the stored value stays plain text as long as no bubble has a setting and no chip is placed. |
| `js/formula.js` | The calculation engine of a "Calculation" bubble (a pure module: no DOM, no Grist). |
| `js/condition-rules.js`, `js/condition-fields.js` | Evaluation of "column, operator, value or other column" rules (a pure module) and their fields shared by all the windows. |
| `js/loop-rules.js`, `js/list-split.js` | The loop engine over linked rows, or over all the rows of a table (`all`: the ones of the widget's Grist view, or the whole table; `allSourceFor`) (it also gives each zone copy the rank of its turn, which the "Row number" chip writes, and it expands the outer zones first: a zone inside a zone reads the rows of the current row of the zone around it); "One document per value". |
| `js/conditional-text.js`, `js/conditional-checkbox.js`, `js/conditional-value.js` | Conditional block, checkbox and value. The value and the block have an "otherwise": plain text written in their place when the condition is not met (the node's `otherwise` attribute, the "Otherwise show" row of the condition window, the `TEXT_OTHERWISE` table of `js/variable-condition.js`; read by `ConditionalText.otherwiseText` and `otherwiseLines`, written by `ConditionalValue.resolve` and `ConditionalText.resolve`: one line for the value, one paragraph per line for the block). |
| `js/space-gap.js` | The spaces around what writes nothing: a removed conditional value, or a bubble that is empty, hidden, zero-hidden or has no row in its loop, no longer double the spaces typed around it and leave none at a paragraph's edge or before a comma (Reading view, all the exports, headers and footers, e-mail fields). |

### Macro-templates (2 files, 520 lines)

| File | Role |
|---|---|
| `js/macro-templates.js` | Choosing and assembling a macro-template's appendices (no DOM); with "Follow each template", writing the page orientation of each assembled template. |
| `js/macro-editor.js` | The screen for creating a macro-template, and its summary. |

### Page and layout (11 files, 3,600 lines)

| File | Role |
|---|---|
| `js/page-layout.js` | Margins, orientation, size, watermark and kept colors of each template: the single source of the content width. |
| `js/page-sections.js` | Reads the page-orientation markers of a macro template (portrait, landscape) so that each template keeps its own page orientation in the PDF, Word, reading mode and print output. |
| `js/page-layer.js` | "On every page" images and the watermark. |
| `js/orientation-toggle.js`, `js/page-size-dialog.js`, `js/watermark-dialog.js` | The Page menu and its windows: orientation (and a macro template's "Follow each template") and size, "Custom size…", "Watermark…". |
| `js/page-zoom.js` | On-screen page zoom, in Edit and Reading modes (corner pill, Fit, Ctrl + wheel); display only, the exports keep the real dimensions. |
| `js/header-footer-preview.js` | Header and footer editing, paginated preview. |
| `js/table-page-cut.js` | Where a table is cut between two pages. |
| `js/zone-page-cut.js` | Where a two-column zone is cut between two pages, column by column like the PDF (the editor and Reading mode). |
| `js/sheet-layout.js`, `js/sheet-assembly-dialog.js` | "Assemble before printing": the geometry of a sheet and its window. |

### Reading (2 files, 1,400 lines)

| File | Role |
|---|---|
| `js/reader-mode.js` | The document resolved for a row and paginated; `preview()` also serves all the exports. |
| `js/reader-guide.js` | The guide shown when no row is chosen, and the "Give this widget full access" card the editor shows in place of the document when Grist does not give it full access. |

### Grid mode (6 files, 3,800 lines)

| File | Role |
|---|---|
| `js/grid-editor.js` | The "grid" template: a single spreadsheet-like table, with adjustable columns and rows. |
| `js/grid-table.js` | Reading a table pasted from Excel, Google Sheets or LibreOffice. |
| `js/grid-xlsx-import.js` | Importing an `.xlsx` workbook into a grid. |
| `js/table-borders.js` | The border rule, written once for the editor, Reading mode, the PDF and the Excel file. |
| `js/xlsx-number-format.js` | The text Excel would show for a number or date format. |
| `js/linked-table.js` | A document's table linked to a Grid template: the link attribute and the template's token that makes it count, picking the template in the list, the marker in the page, the content rules for the cells and the locks (track changes, read-only), updating the table from the template, sending it to the template and opening the template (with the way back to the document, which `js/main.js` carries), then the document following its template: the table's base (what the document and the template said at the last sync), the plan drawn from it (update, send, or a disagreement), the sync on opening and at every read of the automatic save (`followLinkedModels` in `js/main.js`), the sending of the changed tables to their templates with the document's save - in the same write as its row (`Templates.save`), the editor's base moving only once Grist agrees - and the reading of the template by the outputs that read saved documents. |

### Exports (22 files, 9,000 lines)

| File | Role |
|---|---|
| `js/export-common.js` | Helpers shared by the exports, and the script loader (cdnjs and jsDelivr with an integrity hash, or the widget's own site; anything else is refused), which also loads, as a module with its integrity hash, the file GFS assembles for live writing. |
| `js/export-engines.js` | Loads, on the first export rather than at startup, the widget's export engines (PDF, PDF merging, sheet assembly, Word, Excel, Excel number formats, Markdown, HTML), declared in `index.html` by inert tags. |
| `js/image-io.js` | Reading images, for insertion (paste, address) as well as for the PDF, Word and Excel exports: a file, a Blob or an address becomes a Blob, a `data:` URI or a PNG (`fetch`, `new Image()`); and, for the "Light" PDF quality, an image brought down to 150 points per inch in its box (`lighten`, a canvas). |
| `js/pdf-export.js` | The vector PDF (pdfmake): the biggest file of the widget. |
| `js/print-export.js` | Browser print (the "Browser print" quality of the "Export type" menu): the Reading view rendered (`ReaderMode.renderInto`), cut into sheets of the template's exact page size (`css/print.css`), then handed to `window.print()`. One way to print, on its own or hosted by Grist Factory Suite (whose isolated frame does not let a hidden frame be read): the widget's own page - a shadow-tree container put in the page, which `@media print` shows alone while printing and which is removed at `afterprint`. No library to load; one row at a time, 60 pages at most. |
| `js/pdf-fonts.js`, `js/pdf-fonts-extra.js`, `js/pdf-fonts-boxes.js`, `js/pdf-fonts-symbols.js` | The PDF fonts, data loaded on the first PDF (`pdf-fonts.js`, `pdf-fonts-boxes.js` and `pdf-fonts-symbols.js` are generated by scripts of the development repository, which are not published here). |
| `js/pdf-glyph-fallback.js` | Character-by-character font fallback. |
| `js/pdf-merge.js` | A single PDF for all rows (pdf-lib). |
| `js/docx-export.js` | The Word file (docx). |
| `js/xlsx-export.js` | The Excel file of a grid (ExcelJS). |
| `js/markdown-export.js` | Markdown (`.md`, CommonMark and GFM): a row's resolved HTML read node by node, what Markdown can write written as Markdown and the rest as inline HTML, with no library. Its second use, `exportTemplate` / `getMarkdownBlobForTemplate` ("Markdown (template)"), writes the template itself: a variable with no settings as `{{Table.Column}}`, the other merge elements as inline HTML with their `data-*`. |
| `js/markdown-import.js` | Markdown import, the reverse of the previous one: an `.md` read by marked (loaded from cdnjs on the first import, with its integrity hash), put back into the form the editor itself writes (task lists, callouts, footnotes, table of contents, page break, images, alignments), then cleaned by `HtmlSanitize`; the header and footer written between comments become the document's; `{{Table.Column}}` come back as variable bubbles and the merge elements that "Markdown (template)" writes as HTML get their settings back. |
| `js/html-export.js` | HTML (`.html`, for a website): a row's resolved HTML, which already is HTML, cleaned of what only serves the widget (allow-lists of tags, attributes and style declarations, nothing that can run) and accompanied by a stylesheet cut down to what the document uses. Two outputs of the same content: the complete file to upload (`getHtmlBlobForRecord`) and the content alone to paste (the `fragment` option, whose stylesheet only touches `.pp-doc`). The text flows (no pages, no margins, no page numbers, no watermark), the header and the footer are written once; images go in as data URIs, except those from another web address. No library. |
| `js/mailto-export.js` | The `mailto:` link of E-mail mode, and the mail program that opens it (Standard or Zimbra, a personal setting in Settings > Email). |
| `js/batch-failures.js` | The windows of batch exports and PDFs: the one that opens at the end of a batch and lists the rows that could not be generated, with their reason (the error raised, a kind of template the export cannot make, or a protected PDF's missing or unusable row password); the one that warns that a PDF has a blank page before it is saved ("Cancel" or "Export anyway"), and its end-of-batch list (on top of the shared input and confirmation window). |
| `js/batch-scope.js` | The rows of a batch export: the ones the widget shows in Grist (its filters, its sort, the "Select by" link), or the whole table; a widget that only shows part of the table triggers the question; `onViewChange` tells when Grist says those rows changed (the reading of a loop over all the rows is redrawn). |
| `js/export-choices.js` | The person's export choices, kept per template: the type (PDF, Protected PDF, Word, Excel, Markdown, Markdown (template), HTML (file to upload), HTML (content to paste)), the PDF quality and "a single row / all rows". The toolbar's three hidden lists remain what `js/main.js` reads to export; the preferences table (`js/template-preferences.js`) keeps them from one computer to the next, a read-only account keeps them for the session only. |
| `js/pdf-protection.js` | The "Protected PDF" (a type of the "Export type" menu) without any interface: the cleaned settings (the three ways to give the password - typed, a shared one saved in the document, or one per row -, three permissions, file properties), the password of a row read from its cell, the random "owner" password drawn when only permissions are set, and the document fields pdfmake reads (AES-256 encryption). |
| `js/pdf-protection-dialog.js` | The "Protected PDF" window (on top of the shared window), opened before the export of one row and of a ZIP archive: it returns the settings or nothing. It offers the three ways to give the password, says where the shared password is written in the document and the risk of a plain-text password, and reads then writes that shared password through `js/templates.js`. No password is kept in the browser; only the chosen way, the permissions, the author and the password column are. |

### Interface foundations and settings (15 files, 4,600 lines)

| File | Role |
|---|---|
| `js/dom.js` | The common interface building blocks and the only place that parses markup (`Dom.setMarkup`, `Dom.inertTemplate`), loaded first. |
| `js/layers.js`, `js/viewport-fit.js` | The stacking order of menus and windows; the interface kept inside a small panel. |
| `js/modal-base.js`, `js/dialogs.js` | The common base of windows; inputs and confirmations (in place of `prompt` and `confirm`). |
| `js/search-select.js` | The drop-down list with search, for every choice of column, table or template, with the walk down into a Reference's columns. |
| `js/icons.js` | The SVG icons. |
| `js/i18n.js` | The French and English translations, and the starting language: GFS's when it hosts the widget (`gfsLang`), otherwise the one the person chose, otherwise the browser's. |
| `js/settings.js` | The Settings panel: language, theme, trigger key, mail program of E-mail mode, margins, credits. Changing the language or the key reloads the page, which reopens the template you were on: its identifier goes through the address (`#pp-open=<id>`, `reloadKeepingTemplate`), read then erased at startup (`takeReopenId`). Hosted by GFS, the language is GFS's: both language boxes are greyed with the reason (`applyLanguageLock`), and a change made in GFS reloads the page the same way (`followGfsLanguage`; GFS's language goes through the address, `&pp-lang=fr`). |
| `js/save-reminder.js` | The "Save" reminder of the Settings View and Access tabs: the line to the left of "Close" after a change, switched off by Grist's "Revert" (which says nothing of a click on "Save"), and the tabs then take back the saved setting. |
| `js/shortcuts.js`, `js/shortcuts-panel.js` | The customizable keyboard shortcuts and their list. |
| `js/first-contact.js` | The first-contact window, when the widget doesn't start as expected. |
| `js/clean-reading.js` | Clean reading (without the top bar), opened straight away for read-only people, Grist Viewer accounts included, when the Settings box is ticked. |
| `js/version.js` | The version number. |

### Grist Factory Suite extensions (5 files, 650 lines)

| File | Role |
|---|---|
| `js/gfs-link.js` | The link with Grist Factory Suite when it hosts the widget (the address carries `gfs=`): the context asked at startup (the active extensions, the source of their libraries, the widget's address, the opening asked for and the language), the `extensions` event, the `langue` event (`language()`, `onLanguage`), `installer`, and the `ouvrir` call GFS sends (its `{ ouvert }` answer; any other call gets `GFS_INCONNU`); `opensInNewTab(href)` says whether a `mailto:` or `tel:` link must open in a new tab (hosted only: in GFS's isolated frame, following it inside the frame would kill the frame). Alone, no message is written or listened to. |
| `js/gfs-open.js` | What the widget does with an opening GFS asks for: the template GFS designates opens at startup, before the usual order (the row, the view's template, the ★; only the template reopened after a reload the app asked for, `Settings.takeReopenId`, comes before it), and on the `ouvrir` call (through the template list's path, so with its "Save / Discard / Cancel" question when changes are waiting); the status corner says why. "New" (no file, a type) opens instead a blank template of that type, at startup as on the call, through the path of the "New" button of the same type (`openBlankOfType` in `js/main.js`); its "template not saved" warning stays. Nothing is written to the document or to the settings. |
| `js/extensions.js` | The extension registry: each one's files, loaded on first use only and if GFS says it is active, and what a greyed-out feature says on click (GFS opens its installation, or a plain window says it must be used through GFS). |
| `js/live-entry.js` | Live editing as the base of the widget sees it: its row of the "Collaborative editing" menu greyed out without the extension (never hidden: the reason as a tooltip, and a click explains or opens GFS's installation), the activation (the extension's code and GFS's file load only on the first click, or when a live room is seen on the open template), the automatic entry (when one person turns live writing on, everyone who has the same template open - already there or arriving later - joins on their own: the base re-reads the `Publipostage_Direct` table every 3 s, only when the extension is active and nothing on screen can be lost), and the single entry point through which the rest of the widget reaches it: `isLive` (the header and footer, track changes, linked tables and the version history close), `undo` and `redo` per person, `blocksAutosave` and the save token (one person saves the template for everyone). |
| `js/slides-entry.js` | Presentations as the base of the widget sees them: the "presentation" type (declared to `js/templates.js` with the extension's name: it opens when GFS has turned on the "diapositives" extension, otherwise it stays greyed out in the lists, never lost), a presentation's page (the 16:9 slide in landscape, `PageLayout.SLIDE_FORMAT`, for a blank presentation or one without its own format), the "New presentation" row of the "+" menu greyed out without the extension (a click explains or opens GFS's installation), and the single entry point through which the rest of the widget reaches them: the slide strip (shown while a presentation is on screen in Edit mode, its code loaded only when the extension is active; turned off along the way, the strip stays and its actions are greyed out) and the page of every slide, the last one included even when empty (`showsEveryPage` for the editor's pagination, and for the PDF, which then reports no blank page; `outputHtml`, which marks a presentation's page breaks, for Reading and exports); `status`, the status corner where the strip writes "Slide 3 copied." (set by `js/main.js`). |
| `extensions/graphique/chart-block.js`, `extensions/graphique/chart-source.js`, `extensions/graphique/chart-plot.js` (and `chart-block.css`) | The "chart" extension: the window, the drawing of the frame in the editor, in Reading and on export; reading a Grist chart's settings (type, columns, sort, filters, rows; the list does not offer this widget, which the page carries as a custom widget: hosted, GFS gives its address); drawing it with Plotly, rendered as a PNG image (the library is the one GFS gives, loaded for the first chart). |
| `extensions/edition/live-channel.js`, `extensions/edition/live-sync.js`, `extensions/edition/live-editor.js`, `extensions/edition/live-control.js` (and `live.css`) | The "edition" extension (live writing of a Document template's text): the pipe, the `Publipostage_Direct` table re-read every 250 ms when someone else is there (2 s alone, nothing while the page is hidden); the engine, one Yjs document per template, its updates, presences, compaction and the save marker; the link with the editor (the shared text, Undo and Redo per person, the others' cursor and name, the chips' marks that travel in an attribute); the conductor (start, join - without a question and never founding when it is the automatic entry -, stop, the people bar, who saves the template). The library (Yjs and the TipTap extensions) is the module GFS gives under `edition-live`, never imported from anywhere else. |
| `extensions/diapositives/slide-strip.js` (and `slide-strip.css`) | The "diapositives" (slides) extension: the strip to the left of a presentation, one thumbnail per slide (a copy of the editor's rendering, scaled down to 80 pixels wide), the cursor's one checked; a click or the arrow keys go to a slide; its menu ("⋯", right-click, Shift+F10) adds one after it, duplicates, moves it up or down or deletes it, "Add" at the bottom of the strip; each action is a single editor transaction (one Ctrl+Z undoes it); the red dot of a slide that overflows its page, read from the editor's pagination; thumbnails are only copied for the rows the strip shows, or nearly (an `IntersectionObserver` on the list), and a row follows its slide when it changes place (`matchRows`); a layered picture (in front of or behind the text) follows its slide when the slide changes page: within the action's transaction (`predictLayers`), then after each pagination (`followLayers`, grouped in the history of the change that caused it), its page read from `HeaderFooterPreview.pageBodyTops`; copying and pasting a slide (Ctrl+C, Ctrl+V, through the browser's `copy` and `paste` events, from one presentation and one tab to another): `onCopy` and `slideForClipboard` (its HTML, without the picture on all pages or the comments, in a `data-pp-slide` wrapper that gives its first page), `onPaste` and `pasteAfter` (one more slide, filled by the editor's paste, one Ctrl+Z), `placePastedLayers` (its layered pictures on its new page); the stylesheet hides a presentation's page breaks in the editor, except the selected one (its place stays). No library. |

### Orchestration

`js/main.js` (2,400 lines): templates, Edit and Reading modes, autosave, exports (one file, one batch),
wiring of the gallery and of Grist. It is the file that knows all the others.

### Stylesheets

`css/style.css` (color tokens, light and dark theme, `--font-ui`), `css/toolbar-v2.css` (the top bar),
`css/editor-v2.css` (the editor's text); the other 44 each go with a module or a window of `js/`
(`css/callout.css` for `js/callout.js`) and say so in their first comment; `css/roboto-fonts.css` embeds
the documents' font.

## Where the widget touches the outside

- **Grist**: `js/grist-api.js` for the most part; the modules that own a table read and write it
  themselves (`js/templates.js`, `js/template-preferences.js`, `js/comments.js`, `js/text-expansion.js`,
  `js/saved-page-formats.js`, `js/versions-store.js`). Nine `Publipostage_*` tables, created only with the person's consent
  (`js/table-consent.js`); the widget neither deletes nor renames any table or column. In the tables that
  hold the data, a single write: the date of the last PDF export, in the column the person chose
  (`js/export-date.js`, called by `js/main.js` after an export).
- **Grist Factory Suite**: only when the widget's address carries `gfs=` (GFS hosts it), `js/gfs-link.js` writes to
  the parent frame (the context, `installer`, the answer to the `ouvrir` call) and reads what GFS sends it (the
  `extensions` and `langue` events, the `ouvrir` call), after checking where it comes from; alone, the widget writes and listens to
  no message.
- **The network**: the Grist API script (`docs.getgrist.com`), the editor (`esm.sh`), the export libraries and
  the Markdown import reader on first use (`cdnjs.cloudflare.com`, `cdn.jsdelivr.net`), the widget's own export engines and an
  extension's files (same site, `extensions/`), and an extension's library at the address GFS gives (Plotly, with its
  integrity hash; the assembled live-editing module, by `<script type="module">` in `Extensions.loadModuleLibrary`), all the others loaded by `ExportCommon.loadScriptOnce`, the gallery catalog (same site, `fetch` in `js/template-gallery.js`), and the reading of an image (`fetch` or
  `new Image()`, in `js/image-io.js` only: insertion and the PDF, Word and Excel exports take it from
  there; an image from another site waits for a "Show" click on screen, and for the window of
  `js/external-images.js` on export). These
  are reads: the code has no `fetch` with a body or a write method, no `XMLHttpRequest`, no `WebSocket`, no
  `sendBeacon` and no cookie.
- **The browser**: `localStorage` for the language, the theme, the trigger keys, the shortcuts and the view
  of their panel, autosave, the last choice in the pre-print assembly, the zoom level of the last templates
  opened (with their number and name) and the snapshot of table and column names
  (`js/schema-renames.js`). Never a template's content or a piece of the document's data.
- **Downloads**: `ExportCommon.downloadBlob`, on the person's click.

## What is not widget code

`templates-gallery/` (the gallery's templates, data with their `catalogue.json`), `img/` (the logo),
`screenshots/` (the README's screenshots) and the documents at the root: `README.md`, `CONTRIBUTING.md`,
`SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `NOTICE`, `LICENSE` and this file. The page loads none
of them. The project's development repository also keeps its tests, its publication tools and its design
notes, which are not published here.

## Where to change what

| To… | See |
|---|---|
| Add a column to the templates table | `js/templates.js` (creation, `ensureColumns`, reading, saving); the column must exist before the first write, otherwise Grist refuses the whole batch. `Jeton` is the exception: created on demand by `ensureToken`, never written by saving; so is `ModifiePar`, written only when `modifiedByColumnReady` says so (without structure rights, a write to a missing column would cancel the whole batch). |
| Add a window | `js/modal-base.js` and `js/dialogs.js`, `css/modal-base.css`. |
| Add a choice of column, table or template | `js/search-select.js`. |
| Change what a bookmark is, where it goes, or what the links that lead to it do | `js/anchors.js` (the attribute, the normalisation, the targets), `js/bookmark-dialog.js` (the window) and the "In this document" choice of `js/link-dialog.js`; each export writes the bookmark and the link its own way (`placeAnchor` in `js/pdf-export.js`, `anchorBookmarksOf` in `js/docx-export.js`, `anchorTarget` in `js/html-export.js`, `anchorMark` in `js/markdown-export.js`, `anchors` in `js/markdown-import.js`) and Reading mode follows them (`followInternalLink` in `js/reader-mode.js`). |
| Add a text to the interface | `js/i18n.js`, in French and English in the same batch. |
| Change how the widget follows GFS's language | `js/gfs-link.js` (`language`, `onLanguage`), `gfsLang` of `js/i18n.js` (the starting language), `applyLanguageLock` and `followGfsLanguage` of `js/settings.js` (the greyed boxes, the reload), `Settings.followGfsLanguage()` at the end of `init()` in `js/main.js`, the `#settings-language-gfs-note` sentence of `index.html`. |
| Add a menu or a floating window | `js/layers.js` (the stacking order). |
| Add a keyboard shortcut | `js/shortcuts.js`. |
| Change what the "Protected PDF" protects (password, permissions, properties) | `js/pdf-protection.js` (the settings, the password of each row and pdfmake's fields), `js/pdf-protection-dialog.js` and `css/pdf-protection.css` (the window), `js/templates.js` (the shared password: `MotDePassePdf` column), `js/pdf-export.js` (`withDocFields`: the fields are only set on the finished document), `js/main.js` (`SINGLE_EXPORTS.pdfProtected`, `BATCH_EXPORTS.pdfProtectedZip`, `protectionForRecord`), `js/batch-failures.js` (the row without a password). A file combining several PDFs (a single PDF, sheet assembly) cannot be encrypted: those outputs are greyed out for this type. |
| Add a PDF export path | `js/main.js`: call `stampExportDate` after the download (the Settings > View column that keeps the last export date), with the rows whose PDF is in the file. |
| Change what makes a PDF page a "blank page", or the windows that report it | `js/pdf-export.js` (`blankPagesOf` and `paintsInBody`: what is painted in the body; `markFurniture`: the header, footer, watermark and background that do not count; `blankPageBlock`: the page asked for between two page breaks; `renderOnce`: the layout done a single time, with no blank-page search for a presentation, whose every page is an intended slide), `js/batch-failures.js` (`confirmBlankPages` before saving, `showBlankPages` at the end of a batch) and their `blankPages.*` texts in `js/i18n.js`. A new PDF export path that saves a file goes through `exportCurrentRecord` or reads `blankPages` from `getNativePdfBlobForRecord`. |
| Add an export library | `js/export-common.js` (loader, integrity hash) and the security policy of `index.html`. |
| Change what the Markdown import recognizes, or what the Markdown export writes | `js/markdown-import.js` and `js/markdown-export.js` go together: what one writes, the other must read back. |
| Change what the HTML export writes, keeps or leaves out | `js/html-export.js`: the allow-lists (`KEPT_TAGS`, `STYLE_PROPS`, the attributes), the stylesheet blocks (`stylesheetFor`: one per family of elements, written only when the document uses it) and what sets the complete file apart from the content to paste (`BASE_CSS` is only written in the first). |
| Add a type to the "Export type" menu | A `data-export-type` row of the menu (and its `<option>` of `#v2-export-type`) in `index.html`, `SINGLE_EXPORTS` and `BATCH_EXPORTS` of `js/main.js`, its texts in `js/i18n.js`. The menu, with the three PDF qualities, must stay whole in a 700 × 400 panel: at eight types it is already tightened (`css/editor-v2.css`, `#v2-quality-flyout`). |
| Change what browser print prints (sheets, a page taller than a sheet, the page size) | `js/print-export.js` and `css/print.css`; the rendering itself is the Reading view's (`ReaderMode.renderInto` in `js/reader-mode.js`): changing it changes the print too. One way to print (on its own or hosted): a content rule is written once in `css/print.css`, under `div.pp-print-scope`; what the rendering must inherit from the page (the language, the font of `body`, the light tokens) goes through `lang` on `.pp-print-scope`, `font-family: inherit` and `:root, .pp-print-host` in `css/style.css`, because the container is `all: initial`. |
| Open in a new tab a link that GFS's isolated frame does not let be followed (`mailto:`, `tel:`) | `GfsLink.opensInNewTab(href)` (`js/gfs-link.js`), called wherever the widget makes or renders a link: `onCreateEmail` (`js/main.js`), `openExternal` (`js/link-dialog.js`), `readerWrapperFrom` (`js/reader-mode.js`). |
| Add an export engine of the widget (a script that only an export uses) | An inert `<script type="text/x-lazy-engine" data-engine="…">` tag in `index.html`, then its name in the `engines` list of the export that uses it (`js/main.js`): `js/export-engines.js` loads it when needed. |
| A new document element (node, formatting) | `js/editor-nodes.js` (the editor), its sheet in `css/` (screen and Reading mode), then `js/pdf-export.js` and `js/docx-export.js`: each export converts it separately. |
| Change the color palette, or add a color menu | `js/color-palette.js` (the palette and its rows; a menu plugs in through `createMenu`), `js/color-dialog.js` (the "Custom color" window), `js/color-store.js` (the kept colors: `PageLayout.getCustomColors` for the template, `Templates.getDocumentSettings` for the document), `css/color-palette.css`. |
| Put variable bubbles or chips (date, time, user's email and name) in a text field (Subject, To, Cc, Bcc, PDF name) | `js/field-editor.js` (a one-line editor that behaves like the `<input>` it replaces), `js/field-codec.js` (the saved value: plain text or HTML), `ReaderMode.fieldText` and `ReaderMode.smartChipValue` in `js/reader-mode.js` (the resolved value, and the chips' value), `css/field-editor.css`. |
| Change what becomes of the spaces around a value that writes nothing (a removed conditional value, an empty or hidden bubble) | `js/space-gap.js` (the rule: `absorb` and `settle`); it is called by `putValue` in `js/reader-mode.js` (the four places where a bubble is replaced by its value) and by the removal of a value in `js/conditional-value.js`: a new place that puts a value in a bubble's stead calls it too. |
| Change what an e-mail template accepts (a key, a paste, formatting left over from an older template) or the lines of the link's text | `js/email-plain-text.js` and `css/email-plain-text.css` for what the editor accepts; `js/mailto-export.js` for the link's text, whose lines are the editor's lines, one for one. |
| Make the link readable by a mail program that misreads it (Zimbra shows `&amp;` for "&" and turns "+" into a space) | `js/mailto-export.js` (`forZimbra`, the `client` option of `buildMailtoUrl`, `getMailClient` and `setMailClient`) and the Email tab of `js/settings.js` and `index.html`. |
| Add a template to the gallery | A folder in `templates-gallery/` (the template's text, its `pack.json`: tables, columns, Linked tables rules, page and type, and its screenshots), then its line in `templates-gallery/catalogue.json` (name, tags, thumbnail, screenshots, "Features shown"). `js/template-pack.js` reads and checks the `pack.json`; tables that several templates share are described once, in the `families/` folder. |
| Change live editing (the pipe, the engine, the shared editor, the people bar, who saves) | `extensions/edition/`: `live-channel.js` (the `Publipostage_Direct` table), `live-sync.js` (Yjs, the rooms, compaction), `live-editor.js` (the link with the editor, per-person Undo, the cursors), `live-control.js` (start, join, stop, the bar) and `live.css`; what the rest of the widget knows of it goes through `LiveEntry` (`js/live-entry.js`). The library is GFS's (`edition-live`): it is never imported. |
| Change presentations (the type, the 16:9 page, the "+" menu row, the slide strip) | `js/slides-entry.js` (`SlidesEntry`: the type, `pageFor`, `startNew`, the reason it is greyed out); `js/templates.js` (`declareExtensionType`; `isOpenableType`: openable when the extension is active; `isKnownType`: never rewritten under another type, never lost); `js/page-layout.js` (`SLIDE_FORMAT`, named "16:9" by `formatLabel`). The slide strip: `extensions/diapositives/slide-strip.js` and `.css`, named by the registry in `js/extensions.js`; it reads the editor's pagination through `HeaderFooterPreview.pageBreaks`, `onPaginated` and `scrollToPage` (`js/header-footer-preview.js`). The page of an empty last slide: `SlidesEntry.showsEveryPage` (the editor, `trailingBlankStart`) and `SlidesEntry.outputHtml` (Reading and exports, from `js/main.js`), which `ReaderMode.trimTrailingBlankBlocks` respects (`js/reader-mode.js`). |
| Modify a file in `css/` or `js/` | Bump its `?v=` number in `index.html`, otherwise the browser keeps the old one. |
