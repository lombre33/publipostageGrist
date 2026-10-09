# Carte du code de Publipostage+

*🇬🇧 An English version of this document is available [below](#publipostage-code-map).*

Pour qui relit le code : où est quoi, et par où commencer. Les nombres de lignes sont ceux de `wc -l` au
{{DATE_FR}} ; ils bougent, les rôles pas.

## L'essentiel

- **Une page statique.** `index.html`, `js/` et `css/` sont servis tels quels par GitHub Pages ; Grist les
  charge dans un cadre et le widget demande l'accès complet au document, une seule fois (`grist.ready`,
  `js/grist-api.js`), pour les raisons que dit le [README](README.md#sécurité-et-permissions). Pas d'étape
  de construction, pas de serveur à nous.
- **Des scripts classiques, dans l'ordre de `index.html`.** Chaque fichier de `js/` définit un objet global
  (`const Nom = (function () { … })()`, ou une simple donnée pour les polices et la version ; `js/main.js`
  et `js/text-expansion-settings.js` s'exécutent sans rien exposer) et lit ceux qui le précèdent dans la
  liste des balises `<script>`. `js/dom.js` est chargé en premier, `js/main.js` en dernier : c'est lui qui
  relie tout. Six moteurs d'export (`js/pdf-export.js`, `js/pdf-merge.js`, `js/sheet-layout.js`,
  `js/docx-export.js`, `js/xlsx-export.js`, `js/xlsx-number-format.js`) n'y sont que déclarés, par des
  balises inertes ; `js/export-engines.js` les charge au premier export.
- **L'éditeur** (TipTap sur ProseMirror) se charge par `import()` depuis l'import map de `index.html`.
  **Chaque export** charge sa bibliothèque au premier usage, avec une empreinte (SRI) que le navigateur
  vérifie.
- **Les données** : les modèles et les réglages vivent dans des tables `Publipostage_*` du document Grist ;
  les préférences d'affichage (langue, thème, raccourcis…) dans le navigateur.
- **Le volume** : 124 fichiers dans `js/` (46 300 lignes : 34 200 de code, 9 300 de commentaires, 2 800 de
  blanc), 41 feuilles de style (3 500 lignes), une page de 800 lignes. Quatre fichiers de polices du PDF
  pèsent 2,5 Mo en quelques lignes (des données) ; `js/i18n.js` est du texte à traduire, pas de la logique.

## Par où commencer

Dans l'ordre, une dizaine de minutes chacun :

1. `index.html` : la politique de sécurité du contenu (`<meta http-equiv="Content-Security-Policy">`),
   l'import map, l'ordre des scripts, les deux petits scripts en ligne (leurs empreintes, et celle de
   l'import map, sont dans la politique).
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
7. `js/pdf-export.js`, `js/docx-export.js`, `js/xlsx-export.js`, `js/mailto-export.js` : chacun transforme
   ce que `reader-mode.js` prépare.
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

### Grist et les données du document (18 fichiers, 4 800 lignes)

| Fichier | Rôle |
|---|---|
| `js/grist-api.js` | L'enveloppe de l'API Grist : démarrage et accès, lectures, écritures, création des tables internes (après l'accord de la personne), clés de correspondance, sonde de l'e-mail ; reconnaît un compte Lecteur à l'adresse `readonly=true` (pour lui, ni sonde ni table créée). |
| `js/table-consent.js` | La fenêtre « Créer les tables du widget dans ce document ? » et le compteur de gestes qui la repose après un refus ; `js/grist-api.js` décide quand la poser. |
| `js/templates.js` | Les modèles : la table `Publipostage_Modeles`, lecture, enregistrement, en-tête et pied (JSON), et sa ligne réservée aux réglages du document (`TypeModele` = `reglages`). |
| `js/template-preferences.js` | Épingles et dossiers de chaque personne (`Publipostage_PreferencesModeles`). |
| `js/template-organizer.js`, `js/template-tree-select.js`, `js/template-organize-modal.js` | La liste des modèles en arbre « épinglés + dossiers » et la fenêtre « Organiser mes modèles ». |
| `js/template-gallery.js`, `js/template-gallery-modal.js` | Le catalogue de modèles prêts à l'emploi (dossier `templates-gallery/`, même site que le widget) et la fenêtre de la galerie : grille, aperçu, « Utiliser ce modèle ». |
| `js/view-template.js` | Le modèle par défaut d'une vue (option du widget). |
| `js/export-date.js` | La colonne qui garde la date du dernier export PDF de chaque ligne (option du widget) : la section de Réglages > Vue et l'écriture, une fois le PDF produit (`js/main.js` l'appelle après chaque export PDF). |
| `js/row-template.js`, `js/row-template-panel.js` | « Selon la ligne » : un modèle relié à une condition sur la ligne ; le moteur et l'écran. |
| `js/schema-renames.js` | Suivi des renommages de tables et de colonnes faits dans Grist (instantané des noms dans le navigateur). |
| `js/settings-columns.js` | Avertit quand une colonne citée dans les réglages a disparu. |
| `js/access-rights.js` | Droits par personne (lecture seule, export, commentaires) : un verrou d'interface, pas une protection des données. Un compte Lecteur de Grist ouvre d'office en lecture seule, export gardé, sans commentaires. |
| `js/page-tree.js` | Range les pages que Grist crée avec les tables du widget. |
| `js/saved-page-formats.js` | Les formats de page nommés (`Publipostage_FormatsPage`). |

### HTML qui ne vient pas de l'éditeur (2 fichiers, 410 lignes)

| Fichier | Rôle |
|---|---|
| `js/html-sanitize.js` | Filtre à liste blanche, lu dans un document inerte, pour le HTML des colonnes Grist, des modèles importés et de la galerie. |
| `js/external-images.js` | Images d'un autre site : un cadre « Afficher » à leur place jusqu'au clic (rien n'est retenu), signalées ensuite en permanence, et une fenêtre avant tout export qui les lirait. |

### L'éditeur (33 fichiers, 11 800 lignes)

| Fichier | Rôle |
|---|---|
| `js/editor.js` | Démarrage de TipTap et ProseMirror, assemblage des extensions. |
| `js/editor-core.js` | Outils bas niveau partagés par les modules de l'éditeur (aucune logique métier). |
| `js/editor-nodes.js` | Les nœuds et extensions sur mesure : bulles `#Variable`, calcul, cases et blocs conditionnels, images, sommaire. |
| `js/floating-toolbars.js` | Les barres flottantes d'une sélection : couleur, tableau, image, variable, modification suivie. |
| `js/color-palette.js`, `js/color-dialog.js`, `js/color-store.js`, `js/color-math.js` | Le menu de couleur (texte, surlignage, fond de case, trait des bordures) : la palette ; la fenêtre « Couleur personnalisée » ; les couleurs gardées par modèle et par document ; les calculs de couleur (module pur). |
| `js/main-toolbar.js` | La barre d'outils : état des boutons, câblage des clics, insertion d'une image. |
| `js/format-painter.js`, `js/find-replace.js`, `js/link-dialog.js` | Pinceau de mise en forme, Rechercher / Remplacer, liens. |
| `js/script-marks.js` | Exposant et indice : les deux marques de texte, leur lecture dans le HTML (Word, Google Docs), la taille que les exports en tirent et les caractères Unicode que le lien d'un email écrit à leur place. |
| `js/callout.js`, `js/caption.js`, `js/keep-with-next.js`, `js/qr-code.js` | Encadrés et signature, légendes, « Garder avec le suivant », QR code. |
| `js/chart-block.js`, `js/chart-source.js`, `js/chart-plot.js` | Graphique de la page : la fenêtre et le cadre du document ; la lecture des réglages d'un graphique de Grist (type, colonnes, tri, filtres, lignes) ; le tracé avec Plotly, rendu en image PNG (bibliothèque chargée au premier graphique). |
| `js/text-expansion.js`, `js/text-expansion-settings.js` | Expansion de texte (`Publipostage_Abreviations`) et son onglet dans Réglages. |
| `js/track-changes.js`, `js/track-changes-core.js`, `js/track-changes-selection.js`, `js/track-changes-resolve.js`, `js/track-changes-reading.js`, `js/track-changes-commands.js` | Suivi des modifications, par-dessus `prosemirror-suggest-changes` : le pont avec l'éditeur et cinq modules (les marques, la sélection, la résolution, la Lecture et les exports, les commandes). |
| `js/comments.js` | Commentaires en fils de discussion (`Publipostage_Commentaires`). |
| `js/table-select.js`, `js/table-merge.js` | Sélection de cases à la souris ; fusion et scission de cases d'un tableau de document. |
| `js/heading-numbering.js` | Numérotation des titres, la même pour l'éditeur, la Lecture, le PDF et le Word. |
| `js/email-plain-text.js` | Le modèle e-mail n'écrit que ce que le lien `mailto:` porte : les touches de gras, d'italique, de souligné, d'alignement et de niveau de titre ne font rien, les signes de Markdown tapés (« # » compris) restent du texte, un collage perd sa mise en forme (un titre devient une ligne simple, un texte brut garde ses lignes vides), une ancienne mise en forme ne s'affiche plus. |

### Variables et conditions (20 fichiers, 6 600 lignes)

| Fichier | Rôle |
|---|---|
| `js/variables.js` | La liste `#`, la valeur d'une bulle (autre table, chemin de références, calcul), la fenêtre des clés de correspondance entre tables. |
| `js/variable-format.js` | Format d'une bulle : nombre, date, Oui / Non, liste, nombre en toutes lettres. |
| `js/variable-modal.js` | Ce que partagent les fenêtres d'une bulle. |
| `js/variable-condition.js`, `js/variable-loop.js`, `js/variable-list.js`, `js/variable-linked-attrs.js`, `js/variable-calc.js`, `js/variable-column.js` | Les fenêtres d'une bulle : Condition, Boucle, Liste, Autres attributs, Calcul, Colonne. |
| `js/variable-otherwise.js` | Le « sinon » d'une bulle (ligne « Sinon afficher » de la fenêtre Condition) : sa forme enregistrée, la bulle qu'il écrit quand la condition n'est pas remplie, et sa résolution avant les bulles en Lecture et dans les exports. |
| `js/field-editor.js`, `js/field-codec.js` | Les champs texte du mode E-mail (Objet, À, Cc, Cci) et du nom du PDF : un éditeur d'une ligne qui pose les mêmes bulles que le document, avec leur barre et leurs fenêtres, et les puces date, heure, email et nom de l'utilisateur ; la valeur enregistrée reste du texte brut tant qu'aucune bulle n'a de réglage et qu'aucune puce n'est posée. |
| `js/formula.js` | Le moteur de calcul d'une bulle « Calcul » (module pur : ni DOM, ni Grist). |
| `js/condition-rules.js`, `js/condition-fields.js` | L'évaluation des règles « colonne, opérateur, valeur ou autre colonne » (module pur) et leurs champs partagés par toutes les fenêtres. |
| `js/loop-rules.js`, `js/list-split.js` | Le moteur de boucle sur les lignes liées (il donne aussi à chaque copie de zone le rang de son tour, que la puce « N° de ligne » écrit) ; « Un document par valeur ». |
| `js/conditional-text.js`, `js/conditional-checkbox.js`, `js/conditional-value.js` | Bloc, case et valeur conditionnels. |

### Macro-modèles (2 fichiers, 520 lignes)

| Fichier | Rôle |
|---|---|
| `js/macro-templates.js` | Choisir et assembler les annexes d'un macro-modèle (aucun DOM). |
| `js/macro-editor.js` | L'écran de création d'un macro-modèle et son résumé. |

### Page et mise en page (10 fichiers, 3 300 lignes)

| Fichier | Rôle |
|---|---|
| `js/page-layout.js` | Marges, orientation, format, filigrane et couleurs gardées de chaque modèle : la source unique de la largeur de contenu. |
| `js/page-layer.js` | Les images « sur toutes les pages » et le filigrane. |
| `js/orientation-toggle.js`, `js/page-size-dialog.js`, `js/watermark-dialog.js` | Le menu Page et ses fenêtres : sens et format, « Format libre… », « Filigrane… ». |
| `js/page-zoom.js` | Le zoom de la page à l'écran, en Édition et en Lecture (pastille du coin, Ajuster, Ctrl + molette) ; affichage seulement, les exports gardent les dimensions réelles. |
| `js/header-footer-preview.js` | Édition de l'en-tête et du pied, aperçu paginé. |
| `js/table-page-cut.js` | Où un tableau se coupe entre deux pages. |
| `js/sheet-layout.js`, `js/sheet-assembly-dialog.js` | « Assemblage avant impression » : la géométrie d'une planche et sa fenêtre. |

### Lecture (2 fichiers, 1 300 lignes)

| Fichier | Rôle |
|---|---|
| `js/reader-mode.js` | Le document résolu pour une ligne et paginé ; `preview()` sert aussi tous les exports. |
| `js/reader-guide.js` | Le guide affiché quand aucune ligne n'est choisie, et la carte « Donnez l'accès complet à ce widget » que l'éditeur montre à la place du document quand Grist ne lui donne pas l'accès complet. |

### Mode grille (5 fichiers, 2 900 lignes)

| Fichier | Rôle |
|---|---|
| `js/grid-editor.js` | Le modèle « grille » : un seul tableau de tableur, colonnes et lignes réglables. |
| `js/grid-table.js` | Lire un tableau collé depuis Excel, Google Sheets ou LibreOffice. |
| `js/grid-xlsx-import.js` | Importer un classeur `.xlsx` dans une grille. |
| `js/table-borders.js` | La règle des bordures, écrite une fois pour l'éditeur, la Lecture, le PDF et l'Excel. |
| `js/xlsx-number-format.js` | Le texte qu'Excel montrerait pour un format de nombre ou de date. |

### Exports (16 fichiers, 6 800 lignes)

| Fichier | Rôle |
|---|---|
| `js/export-common.js` | Aides partagées par les exports, et le chargeur de scripts (cdnjs et jsDelivr avec une empreinte, ou le site du widget lui-même ; le reste est refusé). |
| `js/export-engines.js` | Charge au premier export, et non à l'ouverture, les six moteurs d'export du widget (PDF, fusion des PDF, feuilles d'assemblage, Word, Excel, format des nombres d'Excel), déclarés dans `index.html` par des balises inertes. |
| `js/image-io.js` | La lecture des images, pour l'insertion (collage, adresse) comme pour les exports PDF, Word et Excel : un fichier, un Blob ou une adresse devient un Blob, une adresse `data:` ou un PNG (`fetch`, `new Image()`). |
| `js/pdf-export.js` | Le PDF vectoriel (pdfmake) : le plus gros fichier du widget. |
| `js/print-export.js` | L'impression par le navigateur (qualité « Impression navigateur » du bouton PDF) : la Lecture rendue dans un cadre caché à bac à sable (`ReaderMode.renderInto`), découpée en feuilles de la taille exacte du modèle (`css/print.css`), puis confiée à `window.print()`. Aucune bibliothèque à charger ; une ligne à la fois, 60 pages au plus. |
| `js/pdf-fonts.js`, `js/pdf-fonts-extra.js`, `js/pdf-fonts-boxes.js`, `js/pdf-fonts-symbols.js` | Les polices du PDF, des données chargées au premier PDF (`pdf-fonts.js`, `pdf-fonts-boxes.js` et `pdf-fonts-symbols.js` sont générées par des scripts du dépôt de développement, qui ne sont pas publiés ici). |
| `js/pdf-glyph-fallback.js` | Repli de police caractère par caractère. |
| `js/pdf-merge.js` | Un seul PDF pour toutes les lignes (pdf-lib). |
| `js/docx-export.js` | Le Word (docx). |
| `js/xlsx-export.js` | L'Excel d'une grille (ExcelJS). |
| `js/mailto-export.js` | Le lien `mailto:` du mode E-mail. |
| `js/batch-failures.js` | La fenêtre qui s'ouvre à la fin d'un export en lot et liste les lignes qui n'ont pas pu être générées, avec leur raison (sur la fenêtre commune des saisies et des confirmations). |
| `js/batch-scope.js` | Les lignes d'un export en lot : celles que le widget affiche dans Grist (ses filtres, son tri, le lien « Sélectionner par »), ou toute la table ; un widget qui n'en affiche qu'une partie fait poser la question. |

### Socle de l'interface et réglages (15 fichiers, 4 300 lignes)

| Fichier | Rôle |
|---|---|
| `js/dom.js` | Les briques d'interface communes, chargé en premier. |
| `js/layers.js`, `js/viewport-fit.js` | L'ordre d'empilement des menus et fenêtres ; l'interface tenue dans un petit panneau. |
| `js/modal-base.js`, `js/dialogs.js` | La base commune des fenêtres ; saisies et confirmations (à la place de `prompt` et `confirm`). |
| `js/search-select.js` | La liste déroulante avec recherche, pour tout choix de colonne, de table ou de modèle, avec la descente dans les colonnes d'une Référence. |
| `js/icons.js` | Les icônes SVG. |
| `js/i18n.js` | Les traductions FR et EN. |
| `js/settings.js` | Le panneau Réglages : langue, thème, touche de déclenchement, marges, crédits. |
| `js/save-reminder.js` | Le rappel « Enregistrer » des Réglages Vue et Accès : la ligne à gauche de « Fermer » après un changement, éteinte par le « Retour » de Grist (qui ne dit rien d'un clic sur « Enregistrer »), et les onglets reprennent alors le réglage enregistré. |
| `js/shortcuts.js`, `js/shortcuts-panel.js` | Les raccourcis clavier personnalisables et leur liste. |
| `js/first-contact.js` | La fenêtre de premier contact quand le widget ne démarre pas comme prévu. |
| `js/clean-reading.js` | La Lecture épurée (sans la barre du haut), ouverte d'emblée pour les personnes en lecture seule, comptes Lecteur de Grist compris, quand la case des Réglages est cochée. |
| `js/version.js` | Le numéro de version. |

### Orchestration

`js/main.js` (2 300 lignes) : modèles, modes Édition et Lecture, enregistrement automatique, exports (un
fichier, un lot), câblage de la galerie et de Grist. C'est le fichier qui connaît tous les autres.

### Les feuilles de style

`css/style.css` (jetons de couleur, thème clair et sombre, `--font-ui`), `css/toolbar-v2.css` (la barre du
haut), `css/editor-v2.css` (le texte de l'éditeur) ; les 38 autres vont chacune avec un module ou une
fenêtre de `js/` (`css/callout.css` pour `js/callout.js`) et le disent dans leur premier commentaire ;
`css/roboto-fonts.css` embarque la police des documents.

## Où le widget touche l'extérieur

- **Grist** : `js/grist-api.js` pour l'essentiel ; les modules qui possèdent une table la lisent et
  l'écrivent eux-mêmes (`js/templates.js`, `js/template-preferences.js`, `js/comments.js`,
  `js/text-expansion.js`, `js/saved-page-formats.js`). Sept tables `Publipostage_*`, créées seulement avec
  l'accord de la personne (`js/table-consent.js`) ; le widget ne supprime ni ne renomme aucune table ni
  colonne. Dans les tables qui portent les données, une seule écriture : la date du dernier export PDF,
  dans la colonne que la personne a choisie (`js/export-date.js`, appelé par `js/main.js` après un export).
- **Le réseau** : le script de l'API de Grist (`docs.getgrist.com`), l'éditeur (`esm.sh`), les
  bibliothèques d'export au premier usage (`cdnjs.cloudflare.com`, `cdn.jsdelivr.net`) et les moteurs
  d'export du widget (même site), tous chargés par `ExportCommon.loadScriptOnce`, le catalogue de la galerie (même site, `fetch` dans
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

`templates-gallery/` (les modèles de la galerie, des données avec leur `manifest.json`), `img/` (le logo),
`screenshots/` (les captures du README) et les documents de la racine : `README.md`, `CONTRIBUTING.md`,
`SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `NOTICE`, `LICENSE` et ce fichier. La page ne charge
rien d'eux. Le dépôt de développement du projet garde en plus ses tests, ses outils de publication et ses
notes de conception, qui ne sont pas publiés ici.

## Où changer quoi

| Pour… | Voir |
|---|---|
| Ajouter une colonne à la table des modèles | `js/templates.js` (création, `ensureColumns`, lecture, enregistrement) ; la colonne doit exister avant la première écriture, sinon Grist refuse tout le lot. |
| Ajouter une fenêtre | `js/modal-base.js` et `js/dialogs.js`, `css/modal-base.css`. |
| Ajouter un choix de colonne, de table ou de modèle | `js/search-select.js`. |
| Ajouter un texte à l'interface | `js/i18n.js`, en français et en anglais dans le même lot. |
| Ajouter un menu ou une fenêtre flottante | `js/layers.js` (l'ordre d'empilement). |
| Ajouter un raccourci clavier | `js/shortcuts.js`. |
| Ajouter un chemin d'export PDF | `js/main.js` : l'appeler `stampExportDate` après le téléchargement (la colonne de Réglages > Vue qui garde la date du dernier export), avec les lignes dont le PDF est dans le fichier. |
| Ajouter une bibliothèque d'export | `js/export-common.js` (chargeur, empreinte) et la politique de sécurité de `index.html`. |
| Changer ce que l'impression par le navigateur imprime (feuilles, page plus haute qu'une feuille, taille de la page) | `js/print-export.js` et `css/print.css` ; le rendu lui-même est celui de la Lecture (`ReaderMode.renderInto` de `js/reader-mode.js`) : le changer change aussi l'impression. |
| Ajouter un moteur d'export du widget (un script que seul un export utilise) | Une balise inerte `<script type="text/x-lazy-engine" data-engine="…">` dans `index.html`, puis son nom dans la liste `engines` de l'export qui s'en sert (`js/main.js`) : `js/export-engines.js` le charge au premier besoin. |
| Un nouvel élément de document (nœud, mise en forme) | `js/editor-nodes.js` (l'éditeur), sa feuille de `css/` (l'écran et la Lecture), puis `js/pdf-export.js` et `js/docx-export.js` : chaque export le convertit à part. |
| Changer la palette de couleurs, ou ajouter un menu de couleur | `js/color-palette.js` (la palette et ses rangées ; un menu s'y branche par `createMenu`), `js/color-dialog.js` (la fenêtre « Couleur personnalisée »), `js/color-store.js` (les couleurs gardées : `PageLayout.getCustomColors` pour le modèle, `Templates.getDocumentSettings` pour le document), `css/color-palette.css`. |
| Mettre des bulles de variable ou des puces (date, heure, email, nom de l'utilisateur) dans un champ texte (Objet, À, Cc, Cci, nom du PDF) | `js/field-editor.js` (un éditeur d'une ligne qui se comporte comme l'`<input>` qu'il remplace), `js/field-codec.js` (la valeur enregistrée : texte brut ou HTML), `ReaderMode.fieldText` et `ReaderMode.smartChipValue` dans `js/reader-mode.js` (la valeur résolue, celle des puces), `css/field-editor.css`. |
| Changer ce qu'un modèle e-mail accepte d'écrire (une touche, un collage, une ancienne mise en forme) ou les lignes du texte du lien | `js/email-plain-text.js` et `css/email-plain-text.css` pour ce que l'éditeur accepte ; `js/mailto-export.js` pour le texte du lien, dont les lignes sont celles de l'éditeur, une pour une. |
| Modifier un fichier de `css/` ou de `js/` | Monter son numéro `?v=` dans `index.html`, sinon le navigateur garde l'ancien. |

---

# Publipostage+ code map

*🇫🇷 Une version française de ce document est disponible [en haut de cette page](#carte-du-code-de-publipostage).*

For anyone reading the code: what is where, and where to start. Line counts are those of `wc -l` as of
{{DATE_EN}}; they move, the roles don't.

## The essentials

- **A static page.** `index.html`, `js/` and `css/` are served as they are by GitHub Pages; Grist loads them
  in a frame and the widget asks for full access to the document, once (`grist.ready`, `js/grist-api.js`),
  for the reasons given in the [README](README.md#security-and-permissions). No build step, no server of
  our own.
- **Classic scripts, in the order of `index.html`.** Each file in `js/` defines one global object
  (`const Name = (function () { … })()`, or plain data for the fonts and the version; `js/main.js` and
  `js/text-expansion-settings.js` run without exposing anything) and reads the ones that come before it in
  the list of `<script>` tags. `js/dom.js` is loaded first, `js/main.js` last: it is the one that wires
  everything together. Six export engines (`js/pdf-export.js`, `js/pdf-merge.js`, `js/sheet-layout.js`,
  `js/docx-export.js`, `js/xlsx-export.js`, `js/xlsx-number-format.js`) are only declared there, by inert
  tags; `js/export-engines.js` loads them on the first export.
- **The editor** (TipTap on ProseMirror) is loaded with `import()` from the import map of `index.html`.
  **Each export** loads its library on first use, with an integrity hash (SRI) that the browser checks.
- **The data**: templates and settings live in `Publipostage_*` tables of the Grist document; display
  preferences (language, theme, shortcuts…) in the browser.
- **The size**: 124 files in `js/` (46,300 lines: 34,200 of code, 9,300 of comments, 2,800 blank), 41
  stylesheets (3,500 lines), an 800-line page. Four PDF font files weigh 2.5 MB in a few lines (data);
  `js/i18n.js` is text to translate, not logic.

## Where to start

In order, about ten minutes each:

1. `index.html`: the Content Security Policy (`<meta http-equiv="Content-Security-Policy">`), the import
   map, the order of the scripts, the two small inline scripts (their hashes, and the import map's, are in
   the policy).
2. `js/grist-api.js`: everything the widget reads and writes in Grist (startup, reading tables, matching
   keys, the e-mail probe).
3. `js/templates.js`: a template is a row of `Publipostage_Modeles` (columns, reading, saving, header and
   footer).
4. `js/main.js`: the orchestration (startup, Edit and Reading modes, autosave, exports).
5. `js/editor.js` then `js/editor-nodes.js`: the editor and its nodes (`#Variable` bubbles, callouts,
   captions…).
6. `js/reader-mode.js`: the document "resolved" for one row (variables, conditions, loops), common ground
   of Reading mode and all the exports.
7. `js/pdf-export.js`, `js/docx-export.js`, `js/xlsx-export.js`, `js/mailto-export.js`: each one
   transforms what `reader-mode.js` prepares.
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

### Grist and the document's data (18 files, 4,800 lines)

| File | Role |
|---|---|
| `js/grist-api.js` | The wrapper around the Grist API: startup and access, reads, writes, creation of the internal tables (after the person's consent), matching keys, the e-mail probe; recognises a Viewer account by the `readonly=true` address (for them, no probe and no table created). |
| `js/table-consent.js` | The "Create the widget’s tables in this document?" window and the gesture counter that asks again after a refusal; `js/grist-api.js` decides when to ask. |
| `js/templates.js` | Templates: the `Publipostage_Modeles` table, reading, saving, header and footer (JSON), and its row reserved for the document's settings (`TypeModele` = `reglages`). |
| `js/template-preferences.js` | Each person's pins and folders (`Publipostage_PreferencesModeles`). |
| `js/template-organizer.js`, `js/template-tree-select.js`, `js/template-organize-modal.js` | The template list as a "pinned + folders" tree and the "Organize my templates" window. |
| `js/template-gallery.js`, `js/template-gallery-modal.js` | The catalog of ready-to-use templates (the `templates-gallery/` folder, same site as the widget) and the gallery window: grid, preview, "Use this template". |
| `js/view-template.js` | A view's default template (a widget option). |
| `js/export-date.js` | The column that keeps each row's last PDF export date (a widget option): the Settings > View section and the write, once the PDF is made (`js/main.js` calls it after every PDF export). |
| `js/row-template.js`, `js/row-template-panel.js` | "According to the row": a template tied to a condition on the row; the engine and the screen. |
| `js/schema-renames.js` | Tracking of table and column renames made in Grist (a snapshot of the names in the browser). |
| `js/settings-columns.js` | Warns when a column named in the settings has disappeared. |
| `js/access-rights.js` | Per-person rights (read-only, export, comments): an interface lock, not a protection of the data. A Grist Viewer account opens read-only by default, export kept, without comments. |
| `js/page-tree.js` | Tidies the pages Grist creates along with the widget's tables. |
| `js/saved-page-formats.js` | Named page formats (`Publipostage_FormatsPage`). |

### HTML that doesn't come from the editor (2 files, 410 lines)

| File | Role |
|---|---|
| `js/html-sanitize.js` | Allow-list filter, parsed in an inert document, for the HTML of Grist columns, imported templates and the gallery. |
| `js/external-images.js` | Images from another site: a "Show" frame in their place until the click (nothing is remembered), flagged at all times afterwards, and a window before any export that would read them. |

### The editor (33 files, 11,800 lines)

| File | Role |
|---|---|
| `js/editor.js` | Startup of TipTap and ProseMirror, assembly of the extensions. |
| `js/editor-core.js` | Low-level helpers shared by the editor modules (no business logic). |
| `js/editor-nodes.js` | The custom nodes and extensions: `#Variable` bubbles, calculation, conditional cells and blocks, images, table of contents. |
| `js/floating-toolbars.js` | The floating bars of a selection: color, table, image, variable, tracked change. |
| `js/color-palette.js`, `js/color-dialog.js`, `js/color-store.js`, `js/color-math.js` | The color menu (text, highlight, cell background, border line): the palette; the "Custom color" window; the colors kept per template and per document; the color calculations (a pure module). |
| `js/main-toolbar.js` | The toolbar: button state, click wiring, image insertion. |
| `js/format-painter.js`, `js/find-replace.js`, `js/link-dialog.js` | Format painter, Find / Replace, links. |
| `js/script-marks.js` | Superscript and subscript: the two text marks, how they are read in HTML (Word, Google Docs), the size the exports take from them and the Unicode characters an e-mail link writes in their place. |
| `js/callout.js`, `js/caption.js`, `js/keep-with-next.js`, `js/qr-code.js` | Callouts and signature, captions, "Keep with next", QR code. |
| `js/chart-block.js`, `js/chart-source.js`, `js/chart-plot.js` | Chart from the page: the window and the document frame; reading a Grist chart's settings (type, columns, sort, filters, rows); drawing it with Plotly, rendered as a PNG image (library loaded for the first chart). |
| `js/text-expansion.js`, `js/text-expansion-settings.js` | Text expansion (`Publipostage_Abreviations`) and its tab in Settings. |
| `js/track-changes.js`, `js/track-changes-core.js`, `js/track-changes-selection.js`, `js/track-changes-resolve.js`, `js/track-changes-reading.js`, `js/track-changes-commands.js` | Track changes, on top of `prosemirror-suggest-changes`: the bridge to the editor and five modules (the marks, the selection, resolving, Reading mode and the exports, the commands). |
| `js/comments.js` | Threaded comments (`Publipostage_Commentaires`). |
| `js/table-select.js`, `js/table-merge.js` | Mouse selection of cells; merging and splitting cells of a document table. |
| `js/heading-numbering.js` | Heading numbering, the same for the editor, Reading mode, the PDF and the Word file. |
| `js/email-plain-text.js` | The e-mail template only writes what the `mailto:` link carries: the bold, italic, underline, alignment and heading-level keys do nothing, typed Markdown signs (« # » included) stay text, pasting drops the formatting (a heading becomes a plain line, pasted plain text keeps its blank lines), formatting left over from an older template is no longer shown. |

### Variables and conditions (20 files, 6,600 lines)

| File | Role |
|---|---|
| `js/variables.js` | The `#` list, the value of a bubble (another table, a path of references, a calculation), the window for matching keys between tables. |
| `js/variable-format.js` | A bubble's format: number, date, Yes / No, list, number in words. |
| `js/variable-modal.js` | What a bubble's windows have in common. |
| `js/variable-condition.js`, `js/variable-loop.js`, `js/variable-list.js`, `js/variable-linked-attrs.js`, `js/variable-calc.js`, `js/variable-column.js` | A bubble's windows: Condition, Loop, List, Other attributes, Calculation, Column. |
| `js/variable-otherwise.js` | A bubble's "otherwise" (the "Otherwise show" row of the Condition window): its saved form, the bubble it writes when the condition is not met, and its resolution before the bubbles in Reading mode and in the exports. |
| `js/field-editor.js`, `js/field-codec.js` | The text fields of E-mail mode (Subject, To, Cc, Bcc) and of the PDF file name: a one-line editor that places the same bubbles as the document, with their toolbar and windows, and the user's date, time, email and name chips; the stored value stays plain text as long as no bubble has a setting and no chip is placed. |
| `js/formula.js` | The calculation engine of a "Calculation" bubble (a pure module: no DOM, no Grist). |
| `js/condition-rules.js`, `js/condition-fields.js` | Evaluation of "column, operator, value or other column" rules (a pure module) and their fields shared by all the windows. |
| `js/loop-rules.js`, `js/list-split.js` | The loop engine over linked rows (it also gives each zone copy the rank of its turn, which the "Row number" chip writes); "One document per value". |
| `js/conditional-text.js`, `js/conditional-checkbox.js`, `js/conditional-value.js` | Conditional block, checkbox and value. |

### Macro-templates (2 files, 520 lines)

| File | Role |
|---|---|
| `js/macro-templates.js` | Choosing and assembling a macro-template's appendices (no DOM). |
| `js/macro-editor.js` | The screen for creating a macro-template, and its summary. |

### Page and layout (10 files, 3,300 lines)

| File | Role |
|---|---|
| `js/page-layout.js` | Margins, orientation, size, watermark and kept colors of each template: the single source of the content width. |
| `js/page-layer.js` | "On every page" images and the watermark. |
| `js/orientation-toggle.js`, `js/page-size-dialog.js`, `js/watermark-dialog.js` | The Page menu and its windows: orientation and size, "Custom size…", "Watermark…". |
| `js/page-zoom.js` | On-screen page zoom, in Edit and Reading modes (corner pill, Fit, Ctrl + wheel); display only, the exports keep the real dimensions. |
| `js/header-footer-preview.js` | Header and footer editing, paginated preview. |
| `js/table-page-cut.js` | Where a table is cut between two pages. |
| `js/sheet-layout.js`, `js/sheet-assembly-dialog.js` | "Assemble before printing": the geometry of a sheet and its window. |

### Reading (2 files, 1,300 lines)

| File | Role |
|---|---|
| `js/reader-mode.js` | The document resolved for a row and paginated; `preview()` also serves all the exports. |
| `js/reader-guide.js` | The guide shown when no row is chosen, and the "Give this widget full access" card the editor shows in place of the document when Grist does not give it full access. |

### Grid mode (5 files, 2,900 lines)

| File | Role |
|---|---|
| `js/grid-editor.js` | The "grid" template: a single spreadsheet-like table, with adjustable columns and rows. |
| `js/grid-table.js` | Reading a table pasted from Excel, Google Sheets or LibreOffice. |
| `js/grid-xlsx-import.js` | Importing an `.xlsx` workbook into a grid. |
| `js/table-borders.js` | The border rule, written once for the editor, Reading mode, the PDF and the Excel file. |
| `js/xlsx-number-format.js` | The text Excel would show for a number or date format. |

### Exports (16 files, 6,800 lines)

| File | Role |
|---|---|
| `js/export-common.js` | Helpers shared by the exports, and the script loader (cdnjs and jsDelivr with an integrity hash, or the widget's own site; anything else is refused). |
| `js/export-engines.js` | Loads, on the first export rather than at startup, the widget's six export engines (PDF, PDF merging, sheet assembly, Word, Excel, Excel number formats), declared in `index.html` by inert tags. |
| `js/image-io.js` | Reading images, for insertion (paste, address) as well as for the PDF, Word and Excel exports: a file, a Blob or an address becomes a Blob, a `data:` URI or a PNG (`fetch`, `new Image()`). |
| `js/pdf-export.js` | The vector PDF (pdfmake): the biggest file of the widget. |
| `js/print-export.js` | Browser print (the "Browser print" quality of the PDF button): the Reading view rendered in a hidden sandboxed frame (`ReaderMode.renderInto`), cut into sheets of the template's exact page size (`css/print.css`), then handed to `window.print()`. No library to load; one row at a time, 60 pages at most. |
| `js/pdf-fonts.js`, `js/pdf-fonts-extra.js`, `js/pdf-fonts-boxes.js`, `js/pdf-fonts-symbols.js` | The PDF fonts, data loaded on the first PDF (`pdf-fonts.js`, `pdf-fonts-boxes.js` and `pdf-fonts-symbols.js` are generated by scripts of the development repository, which are not published here). |
| `js/pdf-glyph-fallback.js` | Character-by-character font fallback. |
| `js/pdf-merge.js` | A single PDF for all rows (pdf-lib). |
| `js/docx-export.js` | The Word file (docx). |
| `js/xlsx-export.js` | The Excel file of a grid (ExcelJS). |
| `js/mailto-export.js` | The `mailto:` link of E-mail mode. |
| `js/batch-failures.js` | The window that opens at the end of a batch export and lists the rows that could not be generated, with their reason (on top of the shared input and confirmation window). |
| `js/batch-scope.js` | The rows of a batch export: the ones the widget shows in Grist (its filters, its sort, the "Select by" link), or the whole table; a widget that only shows part of the table triggers the question. |

### Interface foundations and settings (15 files, 4,300 lines)

| File | Role |
|---|---|
| `js/dom.js` | The common interface building blocks, loaded first. |
| `js/layers.js`, `js/viewport-fit.js` | The stacking order of menus and windows; the interface kept inside a small panel. |
| `js/modal-base.js`, `js/dialogs.js` | The common base of windows; inputs and confirmations (in place of `prompt` and `confirm`). |
| `js/search-select.js` | The drop-down list with search, for every choice of column, table or template, with the walk down into a Reference's columns. |
| `js/icons.js` | The SVG icons. |
| `js/i18n.js` | The French and English translations. |
| `js/settings.js` | The Settings panel: language, theme, trigger key, margins, credits. |
| `js/save-reminder.js` | The "Save" reminder of the Settings View and Access tabs: the line to the left of "Close" after a change, switched off by Grist's "Revert" (which says nothing of a click on "Save"), and the tabs then take back the saved setting. |
| `js/shortcuts.js`, `js/shortcuts-panel.js` | The customizable keyboard shortcuts and their list. |
| `js/first-contact.js` | The first-contact window, when the widget doesn't start as expected. |
| `js/clean-reading.js` | Clean reading (without the top bar), opened straight away for read-only people, Grist Viewer accounts included, when the Settings box is ticked. |
| `js/version.js` | The version number. |

### Orchestration

`js/main.js` (2,300 lines): templates, Edit and Reading modes, autosave, exports (one file, one batch),
wiring of the gallery and of Grist. It is the file that knows all the others.

### Stylesheets

`css/style.css` (color tokens, light and dark theme, `--font-ui`), `css/toolbar-v2.css` (the top bar),
`css/editor-v2.css` (the editor's text); the other 38 each go with a module or a window of `js/`
(`css/callout.css` for `js/callout.js`) and say so in their first comment; `css/roboto-fonts.css` embeds
the documents' font.

## Where the widget touches the outside

- **Grist**: `js/grist-api.js` for the most part; the modules that own a table read and write it
  themselves (`js/templates.js`, `js/template-preferences.js`, `js/comments.js`, `js/text-expansion.js`,
  `js/saved-page-formats.js`). Seven `Publipostage_*` tables, created only with the person's consent
  (`js/table-consent.js`); the widget neither deletes nor renames any table or column. In the tables that
  hold the data, a single write: the date of the last PDF export, in the column the person chose
  (`js/export-date.js`, called by `js/main.js` after an export).
- **The network**: the Grist API script (`docs.getgrist.com`), the editor (`esm.sh`), the export libraries
  on first use (`cdnjs.cloudflare.com`, `cdn.jsdelivr.net`) and the widget's own export engines (same
  site), all loaded by `ExportCommon.loadScriptOnce`, the gallery catalog (same site, `fetch` in `js/template-gallery.js`), and the reading of an image (`fetch` or
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

`templates-gallery/` (the gallery's templates, data with their `manifest.json`), `img/` (the logo),
`screenshots/` (the README's screenshots) and the documents at the root: `README.md`, `CONTRIBUTING.md`,
`SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `NOTICE`, `LICENSE` and this file. The page loads none
of them. The project's development repository also keeps its tests, its publication tools and its design
notes, which are not published here.

## Where to change what

| To… | See |
|---|---|
| Add a column to the templates table | `js/templates.js` (creation, `ensureColumns`, reading, saving); the column must exist before the first write, otherwise Grist refuses the whole batch. |
| Add a window | `js/modal-base.js` and `js/dialogs.js`, `css/modal-base.css`. |
| Add a choice of column, table or template | `js/search-select.js`. |
| Add a text to the interface | `js/i18n.js`, in French and English in the same batch. |
| Add a menu or a floating window | `js/layers.js` (the stacking order). |
| Add a keyboard shortcut | `js/shortcuts.js`. |
| Add a PDF export path | `js/main.js`: call `stampExportDate` after the download (the Settings > View column that keeps the last export date), with the rows whose PDF is in the file. |
| Add an export library | `js/export-common.js` (loader, integrity hash) and the security policy of `index.html`. |
| Change what browser print prints (sheets, a page taller than a sheet, the page size) | `js/print-export.js` and `css/print.css`; the rendering itself is the Reading view's (`ReaderMode.renderInto` in `js/reader-mode.js`): changing it changes the print too. |
| Add an export engine of the widget (a script that only an export uses) | An inert `<script type="text/x-lazy-engine" data-engine="…">` tag in `index.html`, then its name in the `engines` list of the export that uses it (`js/main.js`): `js/export-engines.js` loads it when needed. |
| A new document element (node, formatting) | `js/editor-nodes.js` (the editor), its sheet in `css/` (screen and Reading mode), then `js/pdf-export.js` and `js/docx-export.js`: each export converts it separately. |
| Change the color palette, or add a color menu | `js/color-palette.js` (the palette and its rows; a menu plugs in through `createMenu`), `js/color-dialog.js` (the "Custom color" window), `js/color-store.js` (the kept colors: `PageLayout.getCustomColors` for the template, `Templates.getDocumentSettings` for the document), `css/color-palette.css`. |
| Put variable bubbles or chips (date, time, user's email and name) in a text field (Subject, To, Cc, Bcc, PDF name) | `js/field-editor.js` (a one-line editor that behaves like the `<input>` it replaces), `js/field-codec.js` (the saved value: plain text or HTML), `ReaderMode.fieldText` and `ReaderMode.smartChipValue` in `js/reader-mode.js` (the resolved value, and the chips' value), `css/field-editor.css`. |
| Change what an e-mail template accepts (a key, a paste, formatting left over from an older template) or the lines of the link's text | `js/email-plain-text.js` and `css/email-plain-text.css` for what the editor accepts; `js/mailto-export.js` for the link's text, whose lines are the editor's lines, one for one. |
| Modify a file in `css/` or `js/` | Bump its `?v=` number in `index.html`, otherwise the browser keeps the old one. |
