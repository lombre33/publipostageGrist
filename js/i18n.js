// Traduction FR/EN de l'interface V2 (panneau Réglages > Langue) - IIFE
// classique, chargée en tout premier parmi les scripts V2 (avant
// variable-format.js/variables.js/editor.js/main.js/settings.js) pour que
// ceux-ci puissent lire I18n.getLang()/I18n.t() comme un global nu déjà
// prêt, même schéma de dépendance implicite par ordre de <script> que
// GristAPI/Editor/Variables partout ailleurs dans ce projet.
//
// MAINTENANCE (demande explicite de l'utilisateur) : chaque entrée porte fr
// ET en côte à côte dans le même objet littéral - impossible de modifier
// l'un sans voir l'autre juste en dessous. `t()` avertit dans la console
// (pas d'échec silencieux) si une clé existe mais que sa traduction 'en'
// n'a pas été renseignée : filet de sécurité si un futur texte français est
// ajouté/modifié sans que son pendant anglais suive.
const I18n = (function () {
  const STRINGS = {
    // --- Bandeau du haut : cluster modèle / actions ---
    'template.select': { fr: 'Modèle', en: 'Template' },
    'template.newOption': { fr: '-- Nouveau modèle --', en: '-- New template --' },
    'template.namePlaceholder': { fr: 'Nom du modèle', en: 'Template name' },
    'template.rename.tip': { fr: 'Renommer', en: 'Rename' },
    'template.rename.aria': { fr: 'Renommer le modèle', en: 'Rename template' },
    'toolbar.new': { fr: 'Nouveau modèle', en: 'New template' },
    'toolbar.newFromTemplate': { fr: 'Créer à partir d’un template…', en: 'Create from a template…' },
    'toolbar.save': { fr: 'Enregistrer', en: 'Save' },
    'toolbar.saveAs': { fr: 'Enregistrer sous (copie)', en: 'Save as (copy)' },
    'toolbar.delete': { fr: 'Supprimer', en: 'Delete' },
    'toolbar.linkRules.tip': { fr: 'Tables liées (correspondance #Variable)', en: 'Linked tables (#Variable matching)' },
    'toolbar.linkRules.aria': { fr: 'Tables liées (correspondance pour #Variable d’une autre table)', en: 'Linked tables (matching for #Variable from another table)' },
    'toolbar.modeEdit': { fr: 'Mode édition', en: 'Edit mode' },
    'toolbar.modeRead': { fr: 'Mode lecture', en: 'Read mode' },
    'toolbar.a4.tip': { fr: 'Aperçu A4', en: 'A4 preview' },
    'toolbar.a4.aria': { fr: 'Aperçu A4 — limite la largeur de l’éditeur à celle du contenu d’une page A4, pour que le texte se répartisse comme dans le PDF.', en: 'A4 preview — limits the editor width to that of an A4 page’s content, so text wraps the same way as in the PDF.' },
    'toolbar.quality.tip': { fr: 'Qualité PDF', en: 'PDF quality' },
    'toolbar.quality.aria': { fr: 'Qualité d’export PDF', en: 'PDF export quality' },
    'toolbar.exportPdf': { fr: 'Exporter en PDF', en: 'Export to PDF' },
    'toolbar.exportPdfBatch': { fr: 'Exporter toutes les lignes (ZIP)…', en: 'Export all rows (ZIP)…' },
    'toolbar.pdfFilename.tip': { fr: 'Nom du fichier PDF', en: 'PDF file name' },
    'toolbar.pdfFilename.aria': { fr: 'Nom de fichier PDF personnalisé', en: 'Custom PDF file name' },
    'toolbar.pdfFilename.placeholder': { fr: 'Nom de fichier PDF (variables #… autorisées)', en: 'PDF file name (#… variables allowed)' },

    // --- Qualité d'export PDF (options + rangées du menu) ---
    'quality.native': { fr: 'Vectoriel (par défaut)', en: 'Vector (default)' },
    'quality.browserPrint': { fr: 'Impr. navigateur', en: 'Browser print' },
    'quality.low': { fr: 'Basse qualité (compressé)', en: 'Low quality (compressed)' },
    'quality.ultra': { fr: 'Ultra HD (impression)', en: 'Ultra HD (print)' },

    // --- Titre / numérotation des titres ---
    'heading.tip': { fr: 'Titre', en: 'Heading' },
    'heading.aria': { fr: 'Titre et numérotation des titres — la numérotation ne s’applique qu’aux titres du flux principal', en: 'Heading and heading numbering — numbering only applies to headings in the main flow' },
    'heading.normal': { fr: 'Normal', en: 'Normal' },
    'heading.level1': { fr: 'Titre 1', en: 'Heading 1' },
    'heading.level2': { fr: 'Titre 2', en: 'Heading 2' },
    'heading.level3': { fr: 'Titre 3', en: 'Heading 3' },
    'heading.level4': { fr: 'Titre 4', en: 'Heading 4' },
    'heading.level5': { fr: 'Titre 5', en: 'Heading 5' },
    'heading.level6': { fr: 'Titre 6', en: 'Heading 6' },
    'numbering.label': { fr: 'Numérotation des titres', en: 'Heading numbering' },
    'numbering.none': { fr: 'Aucune', en: 'None' },

    // --- Mise en forme de texte ---
    'fmt.bold': { fr: 'Gras', en: 'Bold' },
    'fmt.italic': { fr: 'Italique', en: 'Italic' },
    'fmt.underline': { fr: 'Souligné', en: 'Underline' },
    'fmt.strike': { fr: 'Barré', en: 'Strikethrough' },
    'align.main.tip': { fr: 'Alignement', en: 'Alignment' },
    'align.main.aria': { fr: 'Alignement (survoler pour les options)', en: 'Alignment (hover for options)' },
    'align.left': { fr: 'Aligner à gauche', en: 'Align left' },
    'align.center': { fr: 'Centrer', en: 'Center' },
    'align.right': { fr: 'Aligner à droite', en: 'Align right' },
    'align.justify': { fr: 'Justifier', en: 'Justify' },

    // --- Listes ---
    'list.main.tip': { fr: 'Liste', en: 'List' },
    'list.main.aria': { fr: 'Liste (survoler pour les styles)', en: 'List (hover for styles)' },
    'list.bulletDisc': { fr: 'Puce disque', en: 'Disc bullet' },
    'list.bulletCircle': { fr: 'Puce cercle', en: 'Circle bullet' },
    'list.bulletSquare': { fr: 'Puce carrée', en: 'Square bullet' },
    'list.orderedNumeric.tip': { fr: '1. 2. 3.', en: '1. 2. 3.' },
    'list.orderedNumeric.aria': { fr: 'Liste numérotée : 1. 2. 3.', en: 'Numbered list: 1. 2. 3.' },
    'list.orderedAlpha.tip': { fr: 'a. b. c.', en: 'a. b. c.' },
    'list.orderedAlpha.aria': { fr: 'Liste numérotée : a. b. c.', en: 'Numbered list: a. b. c.' },
    'list.orderedRoman.tip': { fr: 'i. ii. iii.', en: 'i. ii. iii.' },
    'list.orderedRoman.aria': { fr: 'Liste numérotée : chiffres romains', en: 'Numbered list: roman numerals' },
    'list.checklistAccentStrike.tip': { fr: 'Case à cocher (accent, texte barré)', en: 'Checkbox (accent, strikethrough)' },
    'list.checklistAccentStrike.aria': { fr: 'Liste à cases à cocher, style accent avec texte barré une fois cochée', en: 'Checklist, accent style with strikethrough once checked' },
    'list.checklistClassic.tip': { fr: 'Case à cocher (classique)', en: 'Checkbox (classic)' },
    'list.checklistClassic.aria': { fr: 'Liste à cases à cocher, style classique', en: 'Checklist, classic style' },
    'list.checklistAccentPlain.tip': { fr: 'Case à cocher (accent, texte normal)', en: 'Checkbox (accent, plain text)' },
    'list.checklistAccentPlain.aria': { fr: 'Liste à cases à cocher, style accent sans texte barré', en: 'Checklist, accent style without strikethrough' },
    'indent.decrease': { fr: 'Diminuer le retrait', en: 'Decrease indent' },
    'indent.increase': { fr: 'Augmenter le retrait', en: 'Increase indent' },

    // --- Police / taille / couleurs ---
    'font.sizeTip': { fr: 'Taille de police', en: 'Font size' },
    'font.sizeDecrease': { fr: 'Diminuer la taille', en: 'Decrease size' },
    'font.sizeIncrease': { fr: 'Augmenter la taille', en: 'Increase size' },
    'font.family': { fr: 'Police', en: 'Font' },
    'color.text.tip': { fr: 'Couleur de police', en: 'Font color' },
    'color.text.aria': { fr: 'Appliquer la dernière couleur de police', en: 'Apply last font color' },
    'color.textCaret.tip': { fr: 'Choisir une couleur', en: 'Choose a color' },
    'color.textCaret.aria': { fr: 'Choisir une couleur de police', en: 'Choose a font color' },
    'color.highlight.tip': { fr: 'Surligner', en: 'Highlight' },
    'color.highlight.aria': { fr: 'Appliquer le dernier surlignage', en: 'Apply last highlight' },
    'color.highlightCaret': { fr: 'Choisir un surlignage', en: 'Choose a highlight' },

    // --- Insertion (tableau, colonnes, image, saut de page, sommaire) ---
    'insert.table': { fr: 'Insérer un tableau', en: 'Insert a table' },
    'insert.twoColumns': { fr: 'Insérer 2 colonnes', en: 'Insert 2 columns' },
    'insert.image.tip': { fr: 'Ajouter une image', en: 'Add an image' },
    'insert.image.aria': { fr: 'Insérer une image (URL)', en: 'Insert an image (URL)' },
    'insert.imageFromVariable': { fr: 'Image depuis une variable (colonne PJ)…', en: 'Image from a variable (attachment column)…' },
    'insert.pageBreak.tip': { fr: 'Saut de page', en: 'Page break' },
    'insert.pageBreak.aria': { fr: 'Insérer un saut de page (forcé à l’export PDF)', en: 'Insert a page break (forced on PDF export)' },
    'insert.toc.tip': { fr: 'Insérer un sommaire', en: 'Insert a table of contents' },
    'insert.toc.aria': { fr: 'Insérer un sommaire (généré à partir des titres)', en: 'Insert a table of contents (generated from headings)' },
    'history.undo': { fr: 'Annuler', en: 'Undo' },
    'history.redo': { fr: 'Rétablir', en: 'Redo' },

    // --- Actions communes (boutons de modale réutilisés à plusieurs endroits) ---
    'common.close': { fr: 'Fermer', en: 'Close' },
    'common.cancel': { fr: 'Annuler', en: 'Cancel' },
    'common.confirm': { fr: 'Valider', en: 'Confirm' },

    // --- Modale "Tables liées" / configuration de correspondance ---
    'linkRules.title': { fr: 'Tables liées (correspondance pour #Variable)', en: 'Linked tables (matching for #Variable)' },
    'linkConfig.useSingleton': { fr: 'Utiliser plutôt toujours la même ligne', en: 'Always use the same row instead' },
    'linkConfig.changeMatch': { fr: 'Changer de correspondance', en: 'Change matching' },

    // --- Galerie de templates ---
    'gallery.title': { fr: 'Créer à partir d’un template', en: 'Create from a template' },
    'gallery.searchPlaceholder': { fr: 'Rechercher un modèle…', en: 'Search for a template…' },
    'gallery.useTemplate': { fr: 'Utiliser ce template', en: 'Use this template' },
    'gallery.useWithNewTable': { fr: 'Utiliser avec une nouvelle table de données', en: 'Use with a new data table' },
    'gallery.backToGallery': { fr: 'Retour à la galerie', en: 'Back to gallery' },
    'gallery.noMatch': { fr: 'Aucun template ne correspond à ce filtre.', en: 'No template matches this filter.' },
    'gallery.allTag': { fr: 'Tous', en: 'All' },

    // --- Panneau Réglages ---
    'settings.tooltip': { fr: 'Réglages', en: 'Settings' },
    'settings.title': { fr: 'Réglages', en: 'Settings' },
    'settings.tab.language': { fr: 'Langue', en: 'Language' },
    'settings.tab.triggerKey': { fr: 'Touche de déclenchement', en: 'Trigger key' },
    'settings.tab.credits': { fr: 'Crédits', en: 'Credits' },
    'settings.language.intro': { fr: 'Langue de l’interface (textes, infobulles, messages).', en: 'Interface language (text, tooltips, messages).' },
    'settings.language.fr': { fr: 'Français', en: 'French' },
    'settings.language.en': { fr: 'Anglais', en: 'English' },
    'settings.triggerKey.intro': { fr: 'Caractère qui ouvre le panneau #Variable/Chips en cours de frappe.', en: 'Character that opens the #Variable/Chips panel while typing.' },
    'settings.triggerKey.reloadNotice': { fr: 'Rechargez la page pour appliquer ce changement.', en: 'Reload the page to apply this change.' },
    'settings.triggerKey.reloadButton': { fr: 'Recharger maintenant', en: 'Reload now' },
    'settings.credits.author': { fr: 'Auteur', en: 'Author' },
    'settings.credits.website': { fr: 'Site', en: 'Website' },
    'settings.credits.license': { fr: 'Licence', en: 'License' },
    'settings.credits.bio': { fr: 'Bio', en: 'Bio' },

    // --- Messages de statut (js/main.js:setStatus) ---
    'status.ready': { fr: 'Widget prêt.', en: 'Widget ready.' },
    'status.gristApiError': { fr: 'Erreur init API Grist.', en: 'Error initializing Grist API.' },
    'status.newTemplateReady': { fr: 'Nouveau modèle prêt.', en: 'New template ready.' },
    'status.templateNameRequired': { fr: 'Nom du modèle requis.', en: 'Template name required.' },
    'status.templateSaved': { fr: 'Modèle enregistré.', en: 'Template saved.' },
    'status.noTemplateSelected': { fr: 'Aucun modèle sélectionné.', en: 'No template selected.' },
    'status.templateDeleted': { fr: 'Modèle supprimé.', en: 'Template deleted.' },
    'status.pdfGenerating': { fr: 'Génération du PDF en cours...', en: 'Generating PDF...' },
    'status.pdfGenerated': { fr: 'PDF généré.', en: 'PDF generated.' },
    'status.pdfGenerationError': { fr: 'Erreur génération PDF.', en: 'PDF generation error.' },
    'status.currentTableNotFound': { fr: 'Table courante introuvable.', en: 'Current table not found.' },
    'status.cannotReadRows': { fr: 'Impossible de lire les lignes de la table.', en: 'Unable to read the table’s rows.' },
    'status.noRowsInTable': { fr: 'Aucune ligne dans la table « {table} ».', en: 'No rows in table “{table}”.' },
    'status.loadingPdfLibs': { fr: 'Chargement des bibliothèques PDF...', en: 'Loading PDF libraries...' },
    'status.pdfLibsLoadError': { fr: 'Échec de chargement des bibliothèques PDF.', en: 'Failed to load PDF libraries.' },
    'status.batchExportProgress': { fr: 'Export PDF en lot : {current}/{total}...', en: 'Batch PDF export: {current}/{total}...' },
    'status.exportError': { fr: 'Échec de l’export : aucun PDF généré.', en: 'Export failed: no PDF generated.' },
    'status.zipCompressing': { fr: 'Compression de l’archive ZIP...', en: 'Compressing the ZIP archive...' },
    'status.batchExportDoneWithFailures': { fr: '{ok} PDF générés, {failed} échec(s) (voir la console) — archive ZIP téléchargée.', en: '{ok} PDFs generated, {failed} failure(s) (see console) — ZIP archive downloaded.' },
    'status.batchExportDone': { fr: '{ok} PDF générés — archive ZIP téléchargée.', en: '{ok} PDFs generated — ZIP archive downloaded.' },
    'status.galleryLoadError': { fr: 'Impossible de charger la galerie de templates.', en: 'Unable to load the template gallery.' },
    'status.templateLoadError': { fr: 'Impossible de charger ce template.', en: 'Unable to load this template.' },
    'status.templateSavedAsNew': { fr: 'Template « {name} » enregistré comme nouveau modèle.', en: 'Template “{name}” saved as a new template.' },
    'status.schemaLoadError': { fr: 'Impossible de charger le schéma de colonnes de ce template.', en: 'Unable to load this template’s column schema.' },
    'status.noColumnsDefined': { fr: 'Ce template ne définit aucune colonne.', en: 'This template defines no columns.' },
    'status.tableCreationError': { fr: 'Échec de la création de la table « {table} ».', en: 'Failed to create table “{table}”.' },
    'status.tableCreatedSummary': { fr: 'Table « {table} » créée avec {count} colonne(s), modèle « {name} » enregistré. Liez ce widget à cette table depuis le menu du widget dans Grist (⋮ → Sélectionner la source de données) pour l’utiliser.', en: 'Table “{table}” created with {count} column(s), template “{name}” saved. Link this widget to that table from the widget menu in Grist (⋮ → Select Widget Data) to use it.' },

    // --- Confirmations / invites (main.js) ---
    'alert.noRecordForExport': { fr: 'Aucune ligne sélectionnée : impossible d’exporter en PDF.', en: 'No row selected: cannot export to PDF.' },
    'confirm.deleteTemplate': { fr: 'Supprimer ce modèle ?', en: 'Delete this template?' },
    'confirm.batchExport': { fr: 'Générer un PDF pour chacune des {count} lignes de « {table} » et les regrouper dans une archive ZIP ?', en: 'Generate a PDF for each of the {count} rows in “{table}” and bundle them into a ZIP archive?' },
    'prompt.newTemplateName': { fr: 'Nom du nouveau modèle :', en: 'Name of the new template:' },
    'prompt.newTableName': { fr: 'Nom de la nouvelle table Grist :', en: 'Name of the new Grist table:' },

    // --- Panneau `#` : onglets ---
    'panel.tabVariables': { fr: 'Variables', en: 'Variables' },
    'panel.tabChips': { fr: 'Chips', en: 'Chips' },
    'chips.footnote': { fr: 'Note de bas de page', en: 'Footnote' },
    'chips.date': { fr: 'Date du jour', en: 'Today’s date' },
    'chips.time': { fr: 'Heure actuelle', en: 'Current time' },
    'chips.email': { fr: 'Email de l’utilisateur', en: 'User’s email' },

    // --- Modale de configuration de correspondance (js/variables.js:showLinkConfigModal) ---
    'linkConfig.columnPlaceholder': { fr: '— Choisissez une colonne —', en: '— Choose a column —' },
    'linkConfig.rowId': { fr: 'Identifiant de ligne', en: 'Row ID' },
    'linkConfig.reference': { fr: '{col} (Référence → {table})', en: '{col} (Reference → {table})' },
    'linkConfig.referenceList': { fr: '{col} (Références → {table})', en: '{col} (References → {table})' },
    'linkConfig.describeSingleton': { fr: 'une seule ligne (paramètres)', en: 'a single row (settings)' },
    'linkConfig.describeRowId': { fr: 'identifiant de ligne', en: 'row ID' },
    'linkConfig.previewChooseColumns': { fr: 'Choisissez les deux colonnes pour voir un aperçu.', en: 'Choose both columns to see a preview.' },
    'linkConfig.previewNoRecord': { fr: 'Aucune ligne sélectionnée dans Grist pour prévisualiser.', en: 'No row selected in Grist to preview.' },
    'linkConfig.previewComputing': { fr: 'Calcul de l’aperçu…', en: 'Computing preview…' },
    'linkConfig.previewTableEmpty': { fr: '« {table} » est vide.', en: '“{table}” is empty.' },
    'linkConfig.previewSingleton': { fr: 'Toujours la ligne n°{id} de « {table} », quelle que soit la ligne courante.', en: 'Always row #{id} of “{table}”, regardless of the current row.' },
    'linkConfig.previewMatches': { fr: '{count} ligne(s) trouvée(s) dans « {table} » (n° {ids}).', en: '{count} row(s) found in “{table}” (# {ids}).' },
    'linkConfig.previewNoMatch': { fr: 'Aucune ligne de « {table} » ne correspond à la ligne courante (valeur recherchée : {value}).', en: 'No row in “{table}” matches the current row (searched value: {value}).' },
    'linkConfig.previewUnavailable': { fr: 'Aperçu indisponible.', en: 'Preview unavailable.' },
    'linkConfig.chooseBeforeConfirm': { fr: 'Choisissez les deux colonnes avant de valider.', en: 'Choose both columns before confirming.' },

    // --- Panneau "Tables liées" (js/variables.js:refreshLinkRulesPanel) ---
    'linkRules.empty': { fr: 'Aucune table liée pour l’instant.', en: 'No linked table yet.' },
    'linkRules.edit': { fr: 'Modifier', en: 'Edit' },
    'linkRules.delete': { fr: 'Supprimer', en: 'Delete' },
    'linkRules.confirmDelete': { fr: 'Supprimer la correspondance configurée pour « {table} » ?', en: 'Delete the configured matching for “{table}”?' },
    'linkRules.confirmDeleteAffected': { fr: '\n\nUtilisée dans : {names}.\nLes #Variable de {plural} ne pourront plus être résolues tant qu’une nouvelle correspondance n’aura pas été configurée.', en: '\n\nUsed in: {names}.\nThe #Variable entries in {plural} will no longer resolve until a new matching has been configured.' },
    'linkRules.thisTemplate': { fr: 'ce modèle', en: 'this template' },
    'linkRules.theseTemplates': { fr: 'ces modèles', en: 'these templates' },
    'linkRules.unnamed': { fr: '(sans nom)', en: '(unnamed)' },

    // --- Titres d'infobulles construits en JS (toolbars flottantes image/tableau) ---
    'colorDropdown.custom': { fr: 'Couleur personnalisée', en: 'Custom color' },
    'colorDropdown.customLabel': { fr: 'Personnalisé…', en: 'Custom…' },
    'colorDropdown.noneDefault': { fr: 'Par défaut', en: 'Default' },
    'colorDropdown.none': { fr: 'Aucun', en: 'None' },
    'imgToolbar.shrink': { fr: 'Réduire', en: 'Shrink' },
    'imgToolbar.grow': { fr: 'Agrandir', en: 'Grow' },
    'imgToolbar.originalSize': { fr: 'Taille d’origine', en: 'Original size' },
    'imgToolbar.opacity': { fr: 'Opacité', en: 'Opacity' },
    'imgToolbar.inlineToggle': { fr: 'Basculer en ligne / bloc', en: 'Toggle inline / block' },
    'imgToolbar.inText': { fr: 'Au cœur du texte', en: 'In line with text' },
    'imgToolbar.front': { fr: 'Devant le texte', en: 'In front of text' },
    'imgToolbar.behind': { fr: 'Derrière le texte', en: 'Behind text' },
    'imgToolbar.delete': { fr: 'Supprimer', en: 'Delete' },

    // --- Toolbar flottante de tableau (js/editor.js:wireTableFloatingToolbar) ---
    'table.rowBefore': { fr: 'Ligne avant', en: 'Row before' },
    'table.rowAfter': { fr: 'Ligne après', en: 'Row after' },
    'table.rowDel': { fr: 'Supprimer la ligne', en: 'Delete row' },
    'table.colBefore': { fr: 'Colonne avant', en: 'Column before' },
    'table.colAfter': { fr: 'Colonne après', en: 'Column after' },
    'table.colDel': { fr: 'Supprimer la colonne', en: 'Delete column' },
    'table.tableDel': { fr: 'Supprimer le tableau', en: 'Delete table' },
    'table.fillOpen': { fr: 'Fond de cellule (remplir)', en: 'Cell background (fill)' },
    'twoColumns.resizeGrip': { fr: 'Redimensionner les colonnes', en: 'Resize columns' },
    'image.moveHandle': { fr: 'Déplacer', en: 'Move' },
    'image.corsWarning': { fr: 'Cette image ne pourra probablement pas être incluse dans le PDF exporté : le serveur qui l’héberge ne semble pas autoriser son téléchargement depuis ce widget (restriction CORS). Elle continuera de s’afficher normalement ici et en mode lecture, mais l’export PDF devra l’ignorer.\n\nPour éviter ce problème, copiez l’image (Ctrl+C depuis son emplacement d’origine) puis collez-la directement ici (Ctrl+V) plutôt que d’insérer son URL : une image collée n’est jamais concernée par cette restriction.', en: 'This image probably cannot be included in the exported PDF: the server hosting it doesn’t seem to allow downloading it from this widget (CORS restriction). It will keep displaying normally here and in read mode, but the PDF export will have to skip it.\n\nTo avoid this, copy the image (Ctrl+C from its original location) then paste it directly here (Ctrl+V) instead of inserting its URL: a pasted image is never affected by this restriction.' },
    'image.urlPrompt': { fr: 'URL de l’image :', en: 'Image URL:' },

    // --- Picker "Image depuis une variable" (js/editor.js) ---
    'imageVarPicker.empty': { fr: 'Aucune colonne Pièce jointe trouvée dans ce document.', en: 'No attachment column found in this document.' },

    // --- Popup d'édition du texte d'une note de bas de page ---
    'footnotePopup.delete': { fr: 'Supprimer', en: 'Delete' },
    'footnotePopup.ok': { fr: 'OK', en: 'OK' },
    'footnotePopup.placeholder': { fr: 'Texte de la note…', en: 'Note text…' },

    // --- Sommaire (placeholder avant résolution) ---
    'toc.placeholder': { fr: 'Sommaire (généré automatiquement à partir des titres)', en: 'Table of contents (generated automatically from headings)' },

    // --- Barre flottante de formatage nombre/date d'une bulle #Variable ---
    'varFmt.styleFr': { fr: 'Français : 1 234,56', en: 'French: 1 234,56' },
    'varFmt.styleUs': { fr: 'Anglo-saxon : 1,234.56', en: 'Anglo-Saxon: 1,234.56' },
    'varFmt.styleNone': { fr: 'Sans séparateur de milliers', en: 'No thousands separator' },
    'varFmt.decimals': { fr: 'Décimales', en: 'Decimals' },
    'varFmt.decimalsAuto': { fr: 'Auto', en: 'Auto' },
    'varFmt.currencyPlaceholder': { fr: 'Devise', en: 'Currency' },
    'varFmt.currencyTitle': { fr: 'Devise (€, $, personnalisé…)', en: 'Currency (€, $, custom…)' },
    'varFmt.wordsNumberTitle': { fr: 'Écriture en toutes lettres (nombres entiers)', en: 'Spelled out (whole numbers)' },
    'varFmt.wordsButton': { fr: 'Lettres', en: 'Words' },
    'varFmt.showDay': { fr: 'Afficher/masquer le jour', en: 'Show/hide day' },
    'varFmt.showMonth': { fr: 'Afficher/masquer le mois', en: 'Show/hide month' },
    'varFmt.showYear': { fr: 'Afficher/masquer l’année', en: 'Show/hide year' },
    'varFmt.datePreset': { fr: 'Format de date', en: 'Date format' },
    'varFmt.wordsDateTitle': { fr: 'Écriture en toutes lettres', en: 'Spelled out' },

    // --- Pastille flottante d'édition d'en-tête/pied (js/editor.js:renderHfPill) ---
    'hf.zoneHeader': { fr: 'En-tête', en: 'Header' },
    'hf.zoneFooter': { fr: 'Pied de page', en: 'Footer' },
    'hf.differentFirstPage': { fr: 'Première page différente', en: 'Different first page' },
    'hf.variantDefault': { fr: 'Pages normales', en: 'Regular pages' },
    'hf.variantFirst': { fr: 'Page 1', en: 'Page 1' },
    'hf.insertPageNumber': { fr: 'Insérer le numéro de page', en: 'Insert page number' },
    'hf.pagenumSimple': { fr: 'Numéro simple (3)', en: 'Simple number (3)' },
    'hf.pagenumPageN': { fr: 'Page 3', en: 'Page 3' },
    'hf.pagenumSlash': { fr: '3 / 12', en: '3 / 12' },
    'hf.done': { fr: 'Terminer', en: 'Done' },

    // --- Sommaire exporté en PDF (js/pdf-export.js:buildTocStack) ---
    'pdf.tocTitle': { fr: 'Sommaire', en: 'Table of Contents' },
    'pdf.tocEmpty': { fr: 'Aucun titre trouvé.', en: 'No heading found.' },
  };

  let lang = (typeof localStorage !== 'undefined' && localStorage.getItem('pp_lang') === 'en') ? 'en' : 'fr';

  function t(key, vars) {
    const entry = STRINGS[key];
    if (!entry) { console.warn('[I18n] clé inconnue :', key); return key; }
    if (!entry[lang]) console.warn('[I18n] traduction "' + lang + '" manquante pour "' + key + '" (repli FR).');
    let s = entry[lang] || entry.fr;
    if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }

  function getLang() { return lang; }

  function setLang(next) {
    lang = next === 'en' ? 'en' : 'fr';
    try { localStorage.setItem('pp_lang', lang); } catch (e) { /* stockage indisponible - la langue ne survivra pas au rechargement, sans plus de conséquence */ }
    document.documentElement.lang = lang;
    applyTranslations();
  }

  // Parcourt le DOM (ou un sous-arbre `root`, ex. un nœud injecté après coup
  // par un module qui ne connaît pas I18n) et applique les 4 variantes
  // d'attribut de traduction déclarative - le texte français d'origine reste
  // en dur dans le HTML comme repli si ce fichier n'a pas encore chargé.
  function applyTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
    scope.querySelectorAll('[data-i18n-tip]').forEach(el => { el.setAttribute('data-tip', t(el.getAttribute('data-i18n-tip'))); });
    scope.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
  }

  // Applique tout de suite (pas seulement lors d'un futur setLang) : ce
  // script est placé après tout le HTML du bandeau/des modales dans
  // index.html (les <script> sont en fin de <body>), donc le DOM à
  // traduire existe déjà à ce point - un utilisateur ayant déjà choisi EN
  // lors d'une session précédente voit l'anglais dès l'ouverture, pas
  // seulement après avoir rouvert le panneau Réglages.
  document.documentElement.lang = lang;
  applyTranslations();

  return { t, getLang, setLang, applyTranslations };
})();
