// Traduction FR/EN de l'interface (panneau Réglages > Langue) - IIFE classique, chargée en tout premier (avant variable-format.js, variables.js,
// editor.js, main.js et settings.js) pour qu'ils lisent I18n.getLang() et I18n.t() comme un global nu déjà prêt, même schéma de dépendance implicite
// par ordre de <script>.
//
// Maintenance : chaque entrée porte fr et en côte à côte dans le même objet littéral, impossible de modifier l'un sans voir l'autre. `t()` avertit en
// console (pas d'échec silencieux) si une traduction 'en' manque : filet de sécurité si un futur texte français est ajouté sans son pendant.
const I18n = (function () {
  const STRINGS = {
    // --- Bandeau du haut : cluster modèle / actions ---
    'template.select': { fr: 'Modèle', en: 'Template' },
    'template.newOption': { fr: '— Nouveau modèle —', en: '— New template —' },
    'template.namePlaceholder': { fr: 'Nom du modèle', en: 'Template name' },
    'template.rename.tip': { fr: 'Renommer', en: 'Rename' },
    'template.rename.aria': { fr: 'Renommer le modèle', en: 'Rename template' },
    'template.setDefault.tip': { fr: 'Modèle par défaut : s’ouvre au démarrage', en: 'Default template: opens at startup' },
    'template.setDefault.aria': { fr: 'Définir ce modèle comme modèle par défaut à l’ouverture', en: 'Set this template as the default one on open' },
    // --- Arbre de modèles (épingle + dossiers), js/template-tree-select.js ---
    'templateTree.pin.aria': { fr: 'Épingler ce modèle', en: 'Pin this template' },
    'templateTree.pin.tip': { fr: 'Épingler en haut de la liste (favori personnel)', en: 'Pin to the top of the list (personal favorite)' },
    'templateTree.unpin.tip': { fr: 'Retirer des épinglés', en: 'Remove from pinned' },
    'templateTree.pinnedSection': { fr: 'Épinglés', en: 'Pinned' },
    'templateTree.allSection': { fr: 'Tous les modèles', en: 'All templates' },
    // En-tête du panneau : titre et bouton « Organiser » (son info-bulle et son aria-label restent 'toolbar.organizeTemplates').
    'templateTree.title': { fr: 'Modèles', en: 'Templates' },
    'templateTree.organize': { fr: 'Organiser', en: 'Organize' },
    'templateTree.empty': { fr: 'Aucun modèle enregistré.', en: 'No saved template yet.' },
    // --- Modale "Organiser mes modèles" (créer des dossiers, y ranger des modèles), js/template-organize-modal.js ---
    'organize.modal.title': { fr: 'Organiser mes modèles', en: 'Organize my templates' },
    'organize.modal.intro': { fr: 'Ce rangement est personnel : les autres personnes qui utilisent ce document ne le voient pas.', en: 'This organization is personal: other people using this document don’t see it.' },
    'organize.modal.searchPlaceholder': { fr: 'Rechercher un modèle…', en: 'Search for a template…' },
    'organize.modal.noMatch': { fr: 'Aucun modèle ne correspond à cette recherche.', en: 'No template matches this search.' },
    'organize.modal.moveButton': { fr: 'Déplacer vers…', en: 'Move to…' },
    'organize.modal.moveHint': { fr: 'Dossier (existant ou nouveau). Dossiers existants : {folders}. Laisser vide pour aucun dossier.', en: 'Folder (existing or new). Existing folders: {folders}. Leave empty for no folder.' },
    'organize.modal.moveHintEmpty': { fr: 'Dossier (nouveau nom). Laisser vide pour aucun dossier.', en: 'Folder (new name). Leave empty for no folder.' },
    'organize.modal.newFolderRoot': { fr: '+ Nouveau dossier', en: '+ New folder' },
    'organize.modal.newSubfolderAria': { fr: 'Ajouter un sous-dossier', en: 'Add a subfolder' },
    'organize.modal.newFolderPrompt': { fr: 'Nom du nouveau dossier', en: 'New folder name' },
    'organize.modal.newFolderPendingHint': { fr: 'Pas encore créé : glissez un modèle ici, ou cliquez « Ranger ici » sur un modèle ci-dessous.', en: 'Not created yet: drop a template here, or click “Place here” on a template below.' },
    'organize.modal.newFolderCancelAria': { fr: 'Annuler la création de ce dossier', en: 'Cancel creating this folder' },
    'organize.modal.placeHereButton': { fr: 'Ranger ici', en: 'Place here' },
    // Interrupteur "ce dossier s'ouvre déplié / replié dans la liste" (une ligne par dossier, choix personnel enregistré par utilisateur).
    'organize.modal.folderDefault.aria': { fr: 'Dossier replié par défaut dans la liste des modèles', en: 'Folder collapsed by default in the template list' },
    'organize.modal.folderDefault.expandedTip': { fr: 'S’ouvre déplié dans la liste : cliquer pour qu’il s’ouvre replié', en: 'Opens expanded in the list: click to make it open collapsed' },
    'organize.modal.folderDefault.collapsedTip': { fr: 'S’ouvre replié dans la liste : cliquer pour qu’il s’ouvre déplié', en: 'Opens collapsed in the list: click to make it open expanded' },
    'toolbar.organizeTemplates': { fr: 'Organiser mes modèles', en: 'Organize my templates' },
    'toolbar.new': { fr: 'Nouveau modèle', en: 'New template' },
    'toolbar.newDocument': { fr: 'Nouveau document', en: 'New document' },
    'toolbar.newEmail': { fr: 'Nouvel email', en: 'New email' },
    'toolbar.newMacro': { fr: 'Nouveau macro-modèle', en: 'New macro template' },
    'toolbar.newGrid': { fr: 'Nouvelle grille', en: 'New grid' },
    'toolbar.importXlsx': { fr: 'Importer un Excel…', en: 'Import from Excel…' },
    'toolbar.newFromTemplate': { fr: 'Créer à partir d’un modèle…', en: 'Create from a template…' },
    'toolbar.save': { fr: 'Enregistrer', en: 'Save' },
    'toolbar.saveAs': { fr: 'Enregistrer sous (copie)', en: 'Save as (copy)' },
    'toolbar.saveAsRow': { fr: 'Enregistrer sous…', en: 'Save as…' },
    'toolbar.delete': { fr: 'Supprimer', en: 'Delete' },
    'toolbar.linkRules.tip': { fr: 'Tables liées (correspondance #Variable)', en: 'Linked tables (#Variable matching)' },
    'toolbar.linkRules.aria': { fr: 'Tables liées (correspondance pour #Variable d’une autre table)', en: 'Linked tables (matching for #Variable from another table)' },
    'toolbar.modeEdit': { fr: 'Mode édition', en: 'Edit mode' },
    'toolbar.modeRead': { fr: 'Mode lecture', en: 'Read mode' },
    // Lecture épurée (js/clean-reading.js) : la ligne du menu du bouton Mode lecture, et l'info-bulle du bouton de sortie.
    'toolbar.cleanReading': { fr: 'Lecture épurée', en: 'Clean reading' },
    'cleanReading.exit': { fr: 'Quitter la lecture épurée (Échap)', en: 'Exit clean reading (Esc)' },
    // Zoom de la page (js/page-zoom.js, retour d'Antoine du 2026-10-04) : la pastille du coin bas droit du document. {keys} : le raccourci,
    // « Ctrl » ou « ⌘ » selon la plateforme - le script compose ces textes, aucun attribut data-i18n-* ne les porte.
    'pageZoom.group': { fr: 'Zoom de la page', en: 'Page zoom' },
    'pageZoom.value': { fr: '{n} %', en: '{n}%' },
    'pageZoom.out': { fr: 'Zoom arrière ({keys})', en: 'Zoom out ({keys})' },
    'pageZoom.in': { fr: 'Zoom avant ({keys})', en: 'Zoom in ({keys})' },
    'pageZoom.reset': { fr: 'Revenir à l’affichage d’origine ({keys})', en: 'Back to the original view ({keys})' },
    'pageZoom.fit': { fr: 'Ajuster', en: 'Fit' },
    'pageZoom.fit.tip': { fr: 'Ajuster la page à la largeur du panneau', en: 'Fit the page to the panel width' },
    // Grisé, avec sa raison : l'aperçu de la page est décoché ({format} : « A4 », « 7 × 3,7 cm »...), ou le modèle n'a pas de page
    // (grille, résumé d'un macro-modèle).
    'pageZoom.unavailable.preview': { fr: 'Zoom indisponible : l’aperçu {format} est décoché', en: 'Zoom unavailable: the {format} preview is turned off' },
    'pageZoom.unavailable.none': { fr: 'Zoom indisponible : ce modèle n’a pas de page à afficher', en: 'Zoom unavailable: this template has no page to show' },
    // {format} : le format de la page du modèle (A3, A4, A5, A6, ou « 7 × 3,7 cm » pour un format libre : PageLayout.getFormatLabel) -
    // js/orientation-toggle.js compose ces textes, aucun attribut data-i18n-* ne les porte.
    'toolbar.a4.tip': { fr: 'Aperçu {format}', en: '{format} preview' },
    'toolbar.a4.aria': { fr: 'Aperçu {format} — limite la largeur de l’éditeur à celle du contenu d’une page {format}, pour que le texte se répartisse comme dans le PDF.', en: '{format} preview — limits the editor width to that of a {format} page’s content, so text wraps the same way as in the PDF.' },
    'toolbar.orientation.portrait': { fr: 'Page {format} en portrait (passer en paysage)', en: '{format} page in portrait (switch to landscape)' },
    'toolbar.orientation.landscape': { fr: 'Page {format} en paysage (passer en portrait)', en: '{format} page in landscape (switch to portrait)' },
    'toolbar.orientation.unavailable': { fr: 'Orientation de la page (pas disponible pour ce modèle)', en: 'Page orientation (not available for this template)' },
    // Menu au survol du bouton Portrait / Paysage : sens, puis format.
    'toolbar.page.label': { fr: 'Page', en: 'Page' },
    'toolbar.page.unavailable': { fr: 'Page (pas disponible pour ce modèle)', en: 'Page (not available for this template)' },
    'toolbar.page.portrait': { fr: 'Portrait', en: 'Portrait' },
    'toolbar.page.landscape': { fr: 'Paysage', en: 'Landscape' },
    'toolbar.page.custom': { fr: 'Format libre…', en: 'Custom size…' },
    'toolbar.page.watermark': { fr: 'Filigrane…', en: 'Watermark…' },
    // Fenêtre « Filigrane… » du menu Page (js/watermark-dialog.js) : le texte écrit en grand, en travers de chaque page du modèle.
    'watermark.title': { fr: 'Filigrane de la page', en: 'Page watermark' },
    'watermark.text.label': { fr: 'Texte', en: 'Text' },
    'watermark.text.placeholder': { fr: 'CONFIDENTIEL, BROUILLON…', en: 'CONFIDENTIAL, DRAFT…' },
    // {format} : le format de la page du modèle (A3, A4, A5, A6, ou « 7 × 3,7 cm »), comme dans « Aperçu {format} » de la barre.
    'watermark.text.hint': { fr: 'Écrit en grand derrière chaque page de l’aperçu {format}, de la Lecture, du PDF et du Word.', en: 'Written large behind every page of the {format} preview, the reader, the PDF and the Word file.' },
    'watermark.direction.label': { fr: 'Sens', en: 'Direction' },
    'watermark.direction.diagonal': { fr: 'En diagonale', en: 'Diagonal' },
    'watermark.direction.horizontal': { fr: 'Horizontal', en: 'Horizontal' },
    'watermark.color.label': { fr: 'Couleur', en: 'Color' },
    'watermark.color.gray': { fr: 'Gris', en: 'Gray' },
    'watermark.color.black': { fr: 'Noir', en: 'Black' },
    'watermark.color.red': { fr: 'Rouge', en: 'Red' },
    'watermark.color.blue': { fr: 'Bleu', en: 'Blue' },
    'watermark.color.green': { fr: 'Vert', en: 'Green' },
    'watermark.color.orange': { fr: 'Orange', en: 'Orange' },
    'watermark.opacity.label': { fr: 'Opacité', en: 'Opacity' },
    'watermark.opacity.value': { fr: '{n} %', en: '{n}%' },
    'watermark.remove': { fr: 'Retirer le filigrane', en: 'Remove watermark' },
    // Fenêtre « Format libre… » du menu Page (js/page-size-dialog.js) : la taille de la page en centimètres. {min} et {max} : les bornes (2 et
    // 55,88), écrites avec la virgule en français, le point en anglais.
    'pageSize.title': { fr: 'Format de page libre', en: 'Custom page size' },
    'pageSize.width.label': { fr: 'Largeur', en: 'Width' },
    'pageSize.height.label': { fr: 'Hauteur', en: 'Height' },
    'pageSize.width.aria': { fr: 'Largeur de la page, en centimètres', en: 'Page width, in centimeters' },
    'pageSize.height.aria': { fr: 'Hauteur de la page, en centimètres', en: 'Page height, in centimeters' },
    'pageSize.hint': { fr: 'De {min} à {max} cm, la limite de Word. Plus large que haute, la page est en paysage.', en: 'From {min} to {max} cm, the Word limit. Wider than tall, the page is in landscape.' },
    'pageSize.error.number': { fr: 'Saisissez un nombre en centimètres, par exemple 10,5.', en: 'Enter a number in centimeters, for example 10.5.' },
    'pageSize.error.range': { fr: 'La taille doit être comprise entre {min} et {max} cm.', en: 'The size must be between {min} and {max} cm.' },
    'pageSize.saved.label': { fr: 'Format', en: 'Format' },
    'pageSize.saved.placeholder': { fr: '— Choisir un format —', en: '— Choose a format —' },
    'pageSize.saved.search': { fr: 'Chercher un format…', en: 'Search formats…' },
    'pageSize.saved.none': { fr: 'Aucun format enregistré.', en: 'No saved formats.' },
    'pageSize.saved.noMatch': { fr: 'Aucun format ne correspond.', en: 'No format matches.' },
    'pageSize.saved.save': { fr: 'Enregistrer ce format…', en: 'Save this format…' },
    'pageSize.saved.saveTitle': { fr: 'Enregistrer ce format', en: 'Save this format' },
    'pageSize.saved.nameLabel': { fr: 'Nom du format', en: 'Format name' },
    'pageSize.saved.saved': { fr: 'Format « {name} » enregistré.', en: 'Format “{name}” saved.' },
    'pageSize.saved.delete': { fr: 'Supprimer le format enregistré', en: 'Delete the saved format' },
    'pageSize.saved.deleteTitle': { fr: 'Supprimer ce format ?', en: 'Delete this format?' },
    'pageSize.saved.deleteMessage': { fr: 'Le format « {name} » ({size}) sera retiré de la liste. Les modèles qui l’utilisent gardent leur taille.', en: 'The format “{name}” ({size}) will be removed from the list. Templates that use it keep their size.' },
    'pageSize.saved.deleted': { fr: 'Format « {name} » supprimé.', en: 'Format “{name}” deleted.' },
    'pageSize.saved.error.write': { fr: 'Le format n’a pas pu être enregistré dans le document.', en: 'The format could not be saved to the document.' },
    'pageSize.saved.error.delete': { fr: 'Le format n’a pas pu être supprimé du document.', en: 'The format could not be deleted from the document.' },
    // Fenêtre « Assemblage avant impression… » du menu Exporter en PDF (js/sheet-assembly-dialog.js) : les pages de chaque ligne posées sur des
    // feuilles A4 ou A3, une par emplacement, avec ou sans traits de coupe.
    'sheetAssembly.title': { fr: 'Assemblage avant impression', en: 'Assemble before printing' },
    'sheetAssembly.sheet.label': { fr: 'Feuille', en: 'Sheet' },
    'sheetAssembly.sheet.tooSmall': { fr: 'Trop petite pour une page {format}.', en: 'Too small for a {format} page.' },
    'sheetAssembly.orientation.label': { fr: 'Orientation', en: 'Orientation' },
    'sheetAssembly.orientation.portrait': { fr: 'Portrait', en: 'Portrait' },
    'sheetAssembly.orientation.landscape': { fr: 'Paysage', en: 'Landscape' },
    'sheetAssembly.orientation.tooSmall': { fr: 'Une page {format} n’y tient pas.', en: 'A {format} page does not fit.' },
    'sheetAssembly.noFit': { fr: 'Une page {format} ne tient ni sur A4 ni sur A3 : l’assemblage n’est pas possible.', en: 'A {format} page fits on neither A4 nor A3: assembly is not possible.' },
    'sheetAssembly.slots.label': { fr: 'Emplacements', en: 'Slots' },
    'sheetAssembly.slots.across': { fr: 'en largeur', en: 'across' },
    'sheetAssembly.slots.down': { fr: 'en hauteur', en: 'down' },
    'sheetAssembly.marks.label': { fr: 'Traits de coupe', en: 'Crop marks' },
    'sheetAssembly.marks.off': { fr: 'Sans', en: 'Without' },
    'sheetAssembly.marks.on': { fr: 'Avec', en: 'With' },
    'sheetAssembly.summary': { fr: '{slots} {slots|emplacement|emplacements} par feuille ({cols} × {rows}) : {count} {count|ligne|lignes}, au moins {sheets} {sheets|feuille|feuilles} {sheet}.', en: '{slots} {slots|slot|slots} per sheet ({cols} × {rows}): {count} {count|row|rows}, at least {sheets} {sheet} {sheets|sheet|sheets}.' },
    'sheetAssembly.summaryGrid': { fr: '{slots} {slots|emplacement|emplacements} par feuille ({cols} × {rows}) : {count} {count|valeur|valeurs} de la table, au moins {sheets} {sheets|feuille|feuilles} {sheet}.', en: '{slots} {slots|slot|slots} per sheet ({cols} × {rows}): {count} table {count|value|values}, at least {sheets} {sheet} {sheets|sheet|sheets}.' },
    'sheetAssembly.hint': { fr: 'Un emplacement par page, dans l’ordre de la table.', en: 'One slot per page, in table order.' },
    'sheetAssembly.scaled': { fr: 'Pages réduites à {n} % pour laisser la place aux traits de coupe.', en: 'Pages reduced to {n}% to leave room for the crop marks.' },
    'toolbar.autosave.row': { fr: 'Enregistrement automatique', en: 'Auto-save' },
    // Mode grille (js/grid-editor.js) : infobulles des bandeaux A, B, C / 1, 2, 3.
    'grid.selectAll': { fr: 'Tout sélectionner', en: 'Select all' },
    'grid.resizeColumn': { fr: 'Tirer pour régler la largeur de la colonne', en: 'Drag to set the column width' },
    'grid.resizeRow': { fr: 'Tirer pour régler la hauteur de la ligne', en: 'Drag to set the row height' },
    'grid.cellBar': { fr: 'Barre de la case', en: 'Cell toolbar' },
    'grid.pageBreak': { fr: 'Saut de page · nouvelle page du PDF, nouvelle feuille de l’Excel', en: 'Page break · new page in the PDF, new sheet in the Excel file' },
    'toolbar.autosave.aria': { fr: 'Enregistrement automatique — enregistre le modèle toutes les ~2,5 secondes pendant que vous éditez. Désactiver si vous préférez enregistrer vous-même.', en: 'Auto-save — saves the template roughly every 2.5 seconds while you edit. Turn off if you prefer to save manually.' },
    'toolbar.quality.tip': { fr: 'Qualité PDF', en: 'PDF quality' },
    'toolbar.quality.aria': { fr: 'Qualité d’export PDF', en: 'PDF export quality' },
    'toolbar.exportPdf': { fr: 'Exporter en PDF', en: 'Export to PDF' },
    'toolbar.exportPdfBatch': { fr: 'Exporter toutes les lignes (ZIP)…', en: 'Export all rows (ZIP)…' },
    'toolbar.exportPdfMerged': { fr: 'Exporter toutes les lignes en un seul PDF…', en: 'Export all rows as a single PDF…' },
    'toolbar.exportPdfBatchGrid': { fr: 'Exporter toutes les valeurs de la table (ZIP)…', en: 'Export all table values (ZIP)…' },
    'toolbar.exportPdfMergedGrid': { fr: 'Exporter toutes les valeurs de la table en un seul PDF…', en: 'Export all table values as a single PDF…' },
    'toolbar.exportPdfSheets': { fr: 'Assemblage avant impression…', en: 'Assemble before printing…' },
    'toolbar.exportDocx': { fr: 'Exporter en DOCX (bêta)…', en: 'Export to DOCX (beta)…' },
    'toolbar.exportDocxBatch': { fr: 'Exporter toutes les lignes en DOCX (ZIP)…', en: 'Export all rows to DOCX (ZIP)…' },
    'toolbar.exportXlsx': { fr: 'Exporter en Excel…', en: 'Export to Excel…' },
    'toolbar.exportXlsxBatch': { fr: 'Exporter toutes les valeurs de la table en Excel (ZIP)…', en: 'Export all table values to Excel (ZIP)…' },
    'toolbar.exportXlsxSingle': { fr: 'Exporter toutes les valeurs de la table dans un seul classeur…', en: 'Export all table values to a single workbook…' },
    'toolbar.pdfFilename.tip': { fr: 'Nom du fichier PDF', en: 'PDF file name' },
    'toolbar.pdfFilename.aria': { fr: 'Nom de fichier PDF personnalisé', en: 'Custom PDF file name' },
    'toolbar.pdfFilename.placeholder': { fr: 'Nom de fichier PDF (variables #… autorisées)', en: 'PDF file name (#… variables allowed)' },

    // --- Qualité d'export PDF (options + rangées du menu) ---
    'quality.native': { fr: 'Vectoriel (par défaut)', en: 'Vector (default)' },
    'quality.browserPrint': { fr: 'Impr. navigateur (bientôt)', en: 'Browser print (soon)' },
    'quality.low': { fr: 'Basse qualité (bientôt)', en: 'Low quality (soon)' },
    'quality.ultra': { fr: 'Ultra HD (bientôt)', en: 'Ultra HD (soon)' },

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
    // Pinceau de mise en forme (js/format-painter.js) : l'infobulle nomme le bouton, le nom accessible dit comment s'en servir.
    'fmt.painter.tip': { fr: 'Reproduire la mise en forme', en: 'Format painter' },
    'fmt.painter.aria': { fr: 'Reproduire la mise en forme : copie celle du texte sélectionné, puis la pose sur le texte qu\'on sélectionne ensuite (double-clic : plusieurs fois, Échap pour arrêter)', en: 'Format painter: copies the formatting of the selected text, then applies it to the text you select next (double-click to keep painting, Esc to stop)' },
    'align.main.tip': { fr: 'Alignement', en: 'Alignment' },
    'align.main.aria': { fr: 'Alignement (survoler pour les options)', en: 'Alignment (hover for options)' },
    'align.left': { fr: 'Aligner à gauche', en: 'Align left' },
    'align.center': { fr: 'Centrer', en: 'Center' },
    'align.right': { fr: 'Aligner à droite', en: 'Align right' },
    'align.justify': { fr: 'Justifier', en: 'Justify' },
    // « Garder avec le suivant » (js/keep-with-next.js) : la ligne à cocher du menu Alignement, son nom accessible et la raison de son grisage
    // (info-bulle).
    'keepNext.row': { fr: 'Garder avec le suivant', en: 'Keep with next' },
    'keepNext.aria': { fr: 'Garder avec le suivant : le paragraphe reste sur la même page que le bloc qui le suit', en: 'Keep with next: the paragraph stays on the same page as the block that follows it' },
    'keepNext.notHere': { fr: 'Seulement pour les paragraphes du texte (ni titre, ni légende, ni tableau, liste, colonne, encadré ou citation, ni en-tête ou pied de page)', en: 'Only for text paragraphs (not headings, captions, tables, lists, columns, callouts, quotes, headers or footers)' },

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
    'font.robotoDefault': { fr: 'Roboto (par défaut)', en: 'Roboto (default)' },
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
    'insert.qr.row': { fr: 'QR code…', en: 'QR code…' },
    'insert.qr.rowEdit': { fr: 'Modifier le QR code…', en: 'Edit QR code…' },
    'insert.qr.aria': { fr: 'Insérer un QR code', en: 'Insert a QR code' },
    'insert.qr.ariaEdit': { fr: 'Modifier le QR code', en: 'Edit the QR code' },
    'insert.pageBreak.tip': { fr: 'Saut de page', en: 'Page break' },
    'insert.pageBreak.aria': { fr: 'Insérer un saut de page (forcé à l’export PDF)', en: 'Insert a page break (forced on PDF export)' },
    // Le même bouton dans une grille : le saut se pose avant la ligne sélectionnée, et un second clic le retire.
    'insert.pageBreak.gridTip': { fr: 'Saut de page avant la ligne', en: 'Page break before the row' },
    'insert.pageBreak.gridAria': { fr: 'Saut de page avant la ligne sélectionnée : nouvelle page du PDF, nouvelle feuille de l’Excel (un second clic le retire)', en: 'Page break before the selected row: new page in the PDF, new sheet in the Excel file (click again to remove it)' },
    'insert.toc.tip': { fr: 'Insérer un sommaire', en: 'Insert a table of contents' },
    'insert.toc.aria': { fr: 'Insérer un sommaire (généré à partir des titres)', en: 'Insert a table of contents (generated from headings)' },
    'insert.comment.tip': { fr: 'Commenter la sélection', en: 'Comment on selection' },
    'insert.comment.aria': { fr: 'Ajouter un commentaire sur le texte sélectionné', en: 'Add a comment on the selected text' },
    // Réutilise le nœud blockquote existant (déjà géré en PDF et en Word, cf. js/pdf-export.js) : seul le bouton manquait.
    'insert.citation.tip': { fr: 'Citation', en: 'Quote' },
    'insert.citation.aria': { fr: 'Insérer une citation', en: 'Insert a quote' },
    'insert.variable.tip': { fr: 'Insérer une variable', en: 'Insert a variable' },
    'insert.variable.aria': { fr: 'Insérer une variable (#Variable ou chip)', en: 'Insert a variable (#Variable or chip)' },
    // Une seule icône de la barre pour le lien, la citation, le bloc de code, l'encadré et le bloc de signature : le bouton principal ouvre la
    // fenêtre du lien, le menu au survol porte les lignes. Le raccourci (Ctrl+K ou ⌘K selon la plateforme) s'ajoute à l'aria-label par
    // js/link-dialog.js.
    'insert.blocks.tip': { fr: 'Lien et blocs de contenu', en: 'Link and content blocks' },
    'insert.link.aria': { fr: 'Insérer un lien', en: 'Insert a link' },
    'insert.link.row': { fr: 'Lien…', en: 'Link…' },
    'insert.codeBlock.tip': { fr: 'Bloc de code', en: 'Code block' },
    'insert.codeBlock.aria': { fr: 'Insérer un bloc de code', en: 'Insert a code block' },
    'insert.callout.row': { fr: 'Encadré…', en: 'Callout…' },
    'insert.callout.rowEdit': { fr: 'Modifier l’encadré…', en: 'Edit callout…' },
    'insert.callout.aria': { fr: 'Insérer un encadré', en: 'Insert a callout' },
    'insert.signature.tip': { fr: 'Bloc de signature', en: 'Signature block' },
    'insert.signature.aria': { fr: 'Insérer un bloc de signature', en: 'Insert a signature block' },
    // --- Encadré (js/callout.js) : Note, Attention et Important ne sont que des points de départ (couleur + icône), jamais gardés dans le document
    // ---
    'callout.title.new': { fr: 'Insérer un encadré', en: 'Insert a callout' },
    'callout.title.edit': { fr: 'Modifier l’encadré', en: 'Edit the callout' },
    'callout.type': { fr: 'Type', en: 'Type' },
    'callout.type.note': { fr: 'Note', en: 'Note' },
    'callout.type.attention': { fr: 'Attention', en: 'Warning' },
    'callout.type.important': { fr: 'Important', en: 'Important' },
    'callout.color': { fr: 'Couleur', en: 'Color' },
    'callout.color.blue': { fr: 'Bleu', en: 'Blue' },
    'callout.color.green': { fr: 'Vert', en: 'Green' },
    'callout.color.amber': { fr: 'Orange', en: 'Orange' },
    'callout.color.red': { fr: 'Rouge', en: 'Red' },
    'callout.color.purple': { fr: 'Violet', en: 'Purple' },
    'callout.color.gray': { fr: 'Gris', en: 'Gray' },
    'callout.icon': { fr: 'Icône', en: 'Icon' },
    'callout.icon.info': { fr: 'Information', en: 'Information' },
    'callout.icon.warning': { fr: 'Triangle d’avertissement', en: 'Warning triangle' },
    'callout.icon.alert': { fr: 'Point d’exclamation', en: 'Exclamation mark' },
    'callout.icon.check': { fr: 'Coche', en: 'Check mark' },
    'callout.icon.bulb': { fr: 'Ampoule', en: 'Light bulb' },
    'callout.icon.star': { fr: 'Étoile', en: 'Star' },
    'callout.preview': { fr: 'Aperçu', en: 'Preview' },
    'callout.preview.sample': { fr: 'Votre texte apparaîtra ici.', en: 'Your text will appear here.' },
    'callout.remove': { fr: 'Retirer l’encadré', en: 'Remove callout' },
    // --- Bloc de signature (js/callout.js) : les deux légendes écrites sous les lignes, dans la langue de l'interface au moment de l'insertion ---
    'signature.name': { fr: 'Nom et signature', en: 'Name and signature' },
    'signature.date': { fr: 'Date', en: 'Date' },
    // --- QR code (js/qr-code.js) : la fenêtre, son aperçu, et ce que la Lecture et les exports écrivent à la place d'un QR code qu'ils ne peuvent
    // pas dessiner ---
    'qr.title.new': { fr: 'Insérer un QR code', en: 'Insert a QR code' },
    'qr.title.edit': { fr: 'Modifier le QR code', en: 'Edit the QR code' },
    'qr.text.label': { fr: 'Adresse ou texte', en: 'Address or text' },
    'qr.text.placeholder': { fr: 'https://exemple.fr', en: 'https://example.com' },
    'qr.text.hint': { fr: 'Une colonne donne un QR code propre à chaque ligne.', en: 'A column gives each row its own QR code.' },
    'qr.column': { fr: 'Insérer une colonne…', en: 'Insert a column…' },
    'qr.preview': { fr: 'Aperçu', en: 'Preview' },
    'qr.preview.row': { fr: 'Pour la ligne en cours.', en: 'For the current row.' },
    'qr.preview.empty': { fr: 'Saisissez une adresse ou un texte.', en: 'Enter an address or text.' },
    'qr.preview.noRecord': { fr: 'Aucune ligne en cours : l’aperçu n’est pas disponible.', en: 'No current row: no preview available.' },
    'qr.preview.noValue': { fr: 'Colonne vide pour la ligne en cours : pas de QR code.', en: 'Empty column for the current row: no QR code.' },
    'qr.preview.unresolved': { fr: 'Colonne illisible pour la ligne en cours.', en: 'Column unreadable for the current row.' },
    'qr.preview.tooLong': { fr: 'Texte trop long pour un QR code.', en: 'Text too long for a QR code.' },
    'qr.preview.unavailable': { fr: 'QR code indisponible : la bibliothèque n’a pas pu se charger.', en: 'QR code unavailable: the library could not be loaded.' },
    'qr.doc.unavailable': { fr: '[QR code indisponible]', en: '[QR code unavailable]' },
    'qr.doc.tooLong': { fr: '[QR code : texte trop long]', en: '[QR code: text too long]' },
    // --- Légende sous une image ou un tableau (js/caption.js) : le bouton des barres flottantes, le texte d'attente de la légende vide et les
    // raisons du grisage ---
    'caption.placeholder': { fr: 'Légende…', en: 'Caption…' },
    'caption.addImage': { fr: 'Ajouter une légende sous l’image', en: 'Add a caption under the image' },
    'caption.addTable': { fr: 'Ajouter une légende sous le tableau', en: 'Add a caption under the table' },
    'caption.goTo': { fr: 'Aller à la légende', en: 'Go to the caption' },
    'caption.imageLayer': { fr: 'Pas de légende pour une image devant ou derrière le texte', en: 'No caption for an image in front of or behind the text' },
    'caption.imageFloat': { fr: 'Pas de légende pour une image à gauche ou à droite : le texte l’habille', en: 'No caption for an image on the left or right: the text wraps around it' },
    'caption.gridLocked': { fr: 'Pas de légende dans une grille', en: 'No caption in a grid' },
    // --- Fenêtre du lien (js/link-dialog.js) : « hyperlink » et pas « link », préfixe déjà pris par les tables liées (linkRules, linkConfig) ---
    'hyperlink.title.new': { fr: 'Insérer un lien', en: 'Insert a link' },
    'hyperlink.title.edit': { fr: 'Modifier le lien', en: 'Edit the link' },
    'hyperlink.url.label': { fr: 'Adresse du lien', en: 'Link address' },
    'hyperlink.url.placeholder': { fr: 'https://exemple.fr', en: 'https://example.com' },
    'hyperlink.url.hint': { fr: 'Une adresse web, une adresse e-mail ou un numéro de téléphone.', en: 'A web address, an e-mail address or a phone number.' },
    'hyperlink.text.label': { fr: 'Texte à afficher', en: 'Text to display' },
    'hyperlink.text.placeholder': { fr: 'Vide : l’adresse elle-même s’affiche', en: 'Empty: the address itself is shown' },
    'hyperlink.error.empty': { fr: 'Saisissez l’adresse du lien.', en: 'Enter the link address.' },
    'hyperlink.error.invalid': { fr: 'Cette adresse n’est pas reconnue. Exemples : https://exemple.fr, nom@exemple.fr, 01 23 45 67 89.', en: 'This address is not recognized. Examples: https://example.com, name@example.com, +1 555 123 4567.' },
    'hyperlink.remove': { fr: 'Retirer le lien', en: 'Remove link' },
    'hyperlink.openHint': { fr: '{key}+clic pour ouvrir', en: '{key}+click to open' },
    // Rechercher / Remplacer (js/find-replace.js) : la loupe de la barre, le panneau, le compteur
    'find.tip': { fr: 'Rechercher / Remplacer', en: 'Find / Replace' },
    'find.button.aria': { fr: 'Rechercher et remplacer dans le modèle', en: 'Find and replace in the template' },
    'find.aria': { fr: 'Rechercher et remplacer', en: 'Find and replace' },
    'find.find.label': { fr: 'Rechercher', en: 'Find' },
    'find.find.placeholder': { fr: 'Rechercher dans le modèle', en: 'Find in the template' },
    'find.replacement.label': { fr: 'Remplacer par', en: 'Replace with' },
    'find.replacement.placeholder': { fr: 'Remplacer par', en: 'Replace with' },
    'find.toggleReplace': { fr: 'Afficher ou masquer le remplacement', en: 'Show or hide replace' },
    'find.prev': { fr: 'Résultat précédent (Maj+Entrée)', en: 'Previous result (Shift+Enter)' },
    'find.next': { fr: 'Résultat suivant (Entrée)', en: 'Next result (Enter)' },
    'find.matchCase': { fr: 'Respecter la casse', en: 'Match case' },
    'find.wholeWord': { fr: 'Mot entier', en: 'Whole word' },
    'find.close': { fr: 'Fermer (Échap)', en: 'Close (Esc)' },
    'find.replaceOne': { fr: 'Remplacer', en: 'Replace' },
    'find.replaceAll': { fr: 'Tout remplacer', en: 'Replace all' },
    'find.count.none': { fr: 'Aucun résultat', en: 'No results' },
    'find.count.index': { fr: '{index} sur {count}', en: '{index} of {count}' },
    'find.count.total': { fr: '{count} {count|résultat|résultats}', en: '{count} {count|result|results}' },
    'find.replaced': { fr: '{count} {count|remplacement|remplacements}', en: '{count} {count|replacement|replacements}' },
    'find.replaceFailed': { fr: 'Remplacement impossible ici.', en: 'Can’t replace here.' },

    // --- Commentaires (js/comments.js) ---
    'comments.selectTextFirst': { fr: 'Sélectionnez du texte avant d’ajouter un commentaire.', en: 'Select some text before adding a comment.' },
    'comments.saveTemplateFirst': { fr: 'Enregistrez d’abord le modèle avant d’ajouter un commentaire.', en: 'Save the template first before adding a comment.' },
    'comments.resolvedBadge': { fr: 'Résolu', en: 'Resolved' },
    'comments.activeBadge': { fr: 'Commentaire', en: 'Comment' },
    'comments.close': { fr: 'Fermer', en: 'Close' },
    'comments.anonymous': { fr: 'Anonyme', en: 'Anonymous' },
    'comments.replyPlaceholder': { fr: 'Répondre…', en: 'Reply…' },
    'comments.firstMessagePlaceholder': { fr: 'Écrivez un commentaire…', en: 'Write a comment…' },
    'comments.post': { fr: 'Publier', en: 'Post' },
    'comments.reply': { fr: 'Répondre', en: 'Reply' },
    'comments.resolve': { fr: 'Résoudre', en: 'Resolve' },
    'comments.reopen': { fr: 'Rouvrir', en: 'Reopen' },
    'comments.deleteThread': { fr: 'Supprimer', en: 'Delete' },
    'comments.confirmDelete': { fr: 'Supprimer ce fil de commentaires ?', en: 'Delete this comment thread?' },
    'comments.saveError': {
      fr: 'Commentaire non enregistré : le modèle a changé ailleurs ou l’enregistrement a échoué. Rechargez-le puis réessayez.',
      en: 'Comment not saved: the template changed elsewhere or saving failed. Reload it and try again.',
    },
    'comments.readerChanged': { fr: 'Le document vient de changer : sélectionnez de nouveau le texte à commenter.', en: 'The document just changed: select the text to comment on again.' },
    'history.undo': { fr: 'Annuler', en: 'Undo' },
    'history.redo': { fr: 'Rétablir', en: 'Redo' },

    // --- Suivi des modifications (js/track-changes.js) ---
    'trackChanges.toggle.tip': { fr: 'Suivi des modifications', en: 'Track changes' },
    'trackChanges.toggle.aria': { fr: 'Activer ou désactiver le suivi des modifications', en: 'Turn track changes on or off' },
    'trackChanges.acceptAll.tip': { fr: 'Tout accepter', en: 'Accept all' },
    'trackChanges.acceptAll.aria': { fr: 'Accepter toutes les suggestions du document', en: 'Accept all suggestions in the document' },
    'trackChanges.rejectAll.tip': { fr: 'Tout refuser', en: 'Reject all' },
    'trackChanges.rejectAll.aria': { fr: 'Refuser toutes les suggestions du document', en: 'Reject all suggestions in the document' },
    // Barre flottante d'une modification (js/floating-toolbars.js:wireSuggestionFloatingToolbar) : le libellé du bouton, et son info-bulle, qui dit
    // combien de modifications il traite ({n} : celles de la sélection).
    'trackChanges.accept.label': { fr: 'Accepter', en: 'Accept' },
    'trackChanges.reject.label': { fr: 'Refuser', en: 'Reject' },
    'trackChanges.accept.tip': { fr: 'Accepter {n|cette modification|ces modifications}', en: 'Accept {n|this change|these changes}' },
    'trackChanges.reject.tip': { fr: 'Refuser {n|cette modification|ces modifications}', en: 'Reject {n|this change|these changes}' },
    // Qui a proposé la modification, dans la même barre (js/floating-toolbars.js:wireSuggestionFloatingToolbar) : un nom, ou une adresse à défaut de nom ; « et {n} autre(s) » quand la sélection
    // couvre les modifications de plusieurs personnes (l'info-bulle de l'étiquette les donne toutes, avec leur adresse).
    'trackChanges.proposedBy.one': { fr: 'Proposé par {name}', en: 'Proposed by {name}' },
    'trackChanges.proposedBy.many': { fr: 'Proposé par {name} et {n} {n|autre|autres}', en: 'Proposed by {name} and {n} {n|other|others}' },

    // --- Actions communes (boutons de modale réutilisés à plusieurs endroits) ---
    'common.close': { fr: 'Fermer', en: 'Close' },
    'common.cancel': { fr: 'Annuler', en: 'Cancel' },
    'common.confirm': { fr: 'Valider', en: 'Confirm' },
    'common.save': { fr: 'Enregistrer', en: 'Save' },
    'common.create': { fr: 'Créer', en: 'Create' },
    'common.delete': { fr: 'Supprimer', en: 'Delete' },
    'common.insert': { fr: 'Insérer', en: 'Insert' },
    'common.continue': { fr: 'Continuer', en: 'Continue' },
    'common.generate': { fr: 'Générer', en: 'Generate' },
    'common.move': { fr: 'Déplacer', en: 'Move' },

    // --- Modale "Tables liées" / configuration de correspondance ---
    'linkRules.title': { fr: 'Tables liées (correspondance pour #Variable)', en: 'Linked tables (matching for #Variable)' },
    'linkConfig.useSingleton': { fr: 'Utiliser plutôt toujours la même ligne', en: 'Always use the same row instead' },
    'linkConfig.changeMatch': { fr: 'Changer de correspondance', en: 'Change matching' },

    // --- Galerie de templates ---
    'gallery.title': { fr: 'Créer à partir d’un modèle', en: 'Create from a template' },
    'gallery.searchPlaceholder': { fr: 'Rechercher un modèle…', en: 'Search for a template…' },
    'gallery.legalNote': { fr: 'Ces modèles sont des exemples à adapter ; ils ne remplacent pas un conseil juridique.', en: 'These templates are examples to adapt; they are not legal advice.' },
    'gallery.useTemplate': { fr: 'Utiliser ce modèle', en: 'Use this template' },
    'gallery.useWithNewTable': { fr: 'Utiliser avec une nouvelle table de données', en: 'Use with a new data table' },
    'gallery.backToGallery': { fr: 'Retour à la galerie', en: 'Back to gallery' },
    'gallery.noMatch': { fr: 'Aucun modèle ne correspond à ce filtre.', en: 'No template matches this filter.' },
    'gallery.allTag': { fr: 'Tous', en: 'All' },

    // --- Macro modèles (page de garde + annexes conditionnelles, planning/feature-macro-modeles.md) ---
    'macro.editButton': { fr: 'Modifier la composition', en: 'Edit composition' },
    'macro.modal.title': { fr: 'Macro-modèle', en: 'Macro template' },
    'macro.modal.intro': { fr: 'Page de garde toujours incluse, puis des annexes choisies selon des règles évaluées sur la même ligne.', en: 'Cover page always included, then annexes chosen by rules evaluated on the same row.' },
    'macro.modal.nameLabel': { fr: 'Nom du macro-modèle', en: 'Macro template name' },
    'macro.modal.namePlaceholder': { fr: 'Nom du macro-modèle', en: 'Macro template name' },
    'macro.modal.coverLabel': { fr: 'Page de garde', en: 'Cover page' },
    'macro.modal.annexesTitle': { fr: 'Annexes conditionnelles', en: 'Conditional annexes' },
    'macro.modal.addSlot': { fr: '+ Ajouter une annexe conditionnelle', en: '+ Add a conditional annex' },
    'macro.modal.annexeLabel': { fr: 'Annexe {n}', en: 'Annex {n}' },
    'macro.modal.removeSlot': { fr: 'Supprimer cette annexe', en: 'Remove this annex' },
    'macro.modal.ruleIf': { fr: 'Si', en: 'If' },
    'macro.modal.ruleOrIf': { fr: 'Ou si', en: 'Or if' },
    'macro.modal.columnChoosePlaceholder': { fr: '— Choisir une colonne —', en: '— Choose a column —' },
    'macro.modal.columnAdvanced': { fr: 'Autre (colonne d\'une autre table…)', en: 'Other (column from another table…)' },
    'macro.modal.columnAdvancedPlaceholder': { fr: 'Table.Colonne', en: 'Table.Column' },
    'macro.modal.typeDate': { fr: 'date', en: 'date' },
    'macro.modal.typeDateTime': { fr: 'date et heure', en: 'date and time' },
    'macro.modal.typeBool': { fr: 'case à cocher', en: 'checkbox' },
    'macro.modal.typeRef': { fr: 'référence', en: 'reference' },
    'macro.modal.typeNumeric': { fr: 'nombre', en: 'number' },
    'macro.modal.typeChoice': { fr: 'choix', en: 'choice' },
    'macro.modal.columnMissingFromRecord': { fr: '⚠ absente de la ligne affichée - cochez-la dans les colonnes de ce widget', en: '⚠ missing from the displayed row - check it in this widget\'s columns' },
    'macro.modal.valuePlaceholder': { fr: 'Valeur', en: 'Value' },
    'macro.modal.valuePlaceholderDate': { fr: 'Valeur (ex. 2026-09-26 ou 26/09/2026)', en: 'Value (e.g. 2026-09-26)' },
    'macro.modal.valueChoosePlaceholder': { fr: '— Choisir une valeur —', en: '— Choose a value —' },
    // Champ Valeur d'une colonne Oui / Non (Bool) : les deux mots que la comparaison lit (ConditionRules.parseBoolExpected), et la mention d'une
    // valeur déjà enregistrée qu'elle ne lit pas (js/condition-fields.js:buildBoolList).
    'macro.modal.valueBoolYes': { fr: 'Oui', en: 'Yes' },
    'macro.modal.valueBoolNo': { fr: 'Non', en: 'No' },
    'macro.modal.valueUnrecognized': { fr: 'valeur non reconnue', en: 'unrecognized value' },
    // Champ Valeur d'une colonne Référence, le temps de lire les lignes de la table liée (GristAPI.getReferenceValues).
    'macro.modal.valueLoading': { fr: '— Chargement… —', en: '— Loading… —' },
    'macro.modal.valueAdvanced': { fr: 'Autre valeur…', en: 'Other value…' },
    'macro.modal.choosePlaceholder': { fr: '— Choisir un modèle —', en: '— Choose a template —' },
    'macro.modal.removeRule': { fr: 'Supprimer cette règle', en: 'Remove this rule' },
    'macro.modal.addRule': { fr: '+ Ajouter une condition (ou si)', en: '+ Add a condition (or if)' },
    'macro.modal.defaultLabel': { fr: 'Si aucune règle ne correspond', en: 'If no rule matches' },
    'macro.modal.defaultSkip': { fr: 'Ne rien inclure', en: 'Include nothing' },
    'macro.modal.defaultUse': { fr: 'Utiliser « {name} »', en: 'Use “{name}”' },
    'macro.modal.noSlots': { fr: 'Aucune annexe conditionnelle pour l’instant.', en: 'No conditional annex yet.' },
    'macro.modal.nameRequired': { fr: 'Le macro-modèle doit avoir un nom.', en: 'The macro template needs a name.' },
    'macro.modal.saveError': { fr: 'Échec de l’enregistrement du macro-modèle.', en: 'Failed to save the macro template.' },
    'macro.summary.empty': { fr: 'Aucune page de garde ni annexe définie pour l’instant.', en: 'No cover page or annex defined yet.' },
    'macro.summary.noCover': { fr: 'aucune', en: 'none' },
    'macro.summary.text': { fr: 'Page de garde : {cover} — {count} {count|annexe conditionnelle|annexes conditionnelles}.', en: 'Cover page: {cover} — {count} conditional {count|annex|annexes}.' },
    // Les modèles de la composition, un stylo chacun (js/macro-editor.js) : il ouvre ce modèle dans l'éditeur ; le bandeau « Revenir au
    // macro-modèle » (js/main.js) ramène au macro-modèle.
    'macro.summary.partsAria': { fr: 'Modèles assemblés', en: 'Assembled templates' },
    'macro.summary.edit': { fr: 'Modifier le modèle « {name} »', en: 'Edit the template “{name}”' },
    'macro.summary.missing': { fr: 'modèle introuvable', en: 'template not found' },
    'macro.summary.noTemplate': { fr: 'aucun modèle choisi', en: 'no template chosen' },
    // L'œil de chaque modèle du résumé (js/macro-editor.js) : il masque le modèle de la Lecture et de toutes les sorties du macro-modèle, sans le
    // retirer de la composition. Le nom accessible dit le geste et ne change pas (c'est `aria-pressed` qui dit l'état) ; l'info-bulle dit l'état et
    // ce que le clic fait.
    'macro.summary.hide': { fr: 'Masquer le modèle « {name} »', en: 'Hide the template “{name}”' },
    'macro.summary.hideTip': { fr: 'Masquer « {name} » de la Lecture et des exports', en: 'Hide “{name}” from Reading and exports' },
    'macro.summary.hiddenTip': { fr: '« {name} » est masqué de la Lecture et des exports : cliquer pour l’afficher', en: '“{name}” is hidden from Reading and exports: click to show it' },
    'macro.return.aria': { fr: 'Retour au macro-modèle', en: 'Back to the macro template' },
    'macro.return.text': { fr: 'Modèle ouvert depuis le macro-modèle « {name} ».', en: 'Template opened from the macro template “{name}”.' },
    'macro.return.button': { fr: 'Revenir au macro-modèle', en: 'Back to the macro template' },
    'status.macroSaved': { fr: 'Macro-modèle enregistré.', en: 'Macro template saved.' },
    'status.macroModelHidden': { fr: 'Modèle masqué de la Lecture et des exports : « {name} »', en: 'Template hidden from Reading and exports: “{name}”' },
    'status.macroModelShown': { fr: 'Modèle de nouveau dans la Lecture et les exports : « {name} »', en: 'Template back in Reading and exports: “{name}”' },

    // --- Panneau Réglages ---
    'settings.tooltip': { fr: 'Réglages', en: 'Settings' },
    'settings.title': { fr: 'Réglages', en: 'Settings' },
    'settings.tab.language': { fr: 'Langue', en: 'Language' },
    'settings.tab.triggerKey': { fr: 'Déclencheur', en: 'Trigger' },
    'settings.tab.pageMargins': { fr: 'Marges', en: 'Margins' },
    'settings.tab.theme': { fr: 'Thème', en: 'Theme' },
    'settings.theme.intro': {
      fr: "Apparence de l'interface. La page du document reste blanche dans les deux thèmes : c'est elle qui part à l'impression.",
      en: 'Interface appearance. The document page stays white in both themes: it is what gets printed.',
    },
    'settings.theme.system': { fr: 'Système', en: 'System' },
    'settings.theme.light': { fr: 'Clair', en: 'Light' },
    'settings.theme.dark': { fr: 'Sombre', en: 'Dark' },
    'settings.tab.credits': { fr: 'Crédits', en: 'Credits' },
    'settings.tab.access': { fr: 'Accès', en: 'Access' },
    'settings.tab.rowTemplate': { fr: 'Vue', en: 'View' },
    'settings.view.intro': {
      fr: 'Réglages propres à cette vue. Pour les appliquer à tout le monde, enregistrez ensuite la vue dans Grist (bouton Enregistrer en haut du widget).',
      en: 'Settings for this view. To apply them to everyone, then save the view in Grist (Save button at the top of the widget).',
    },
    'settings.rowTemplate.title': { fr: 'Modèle selon la ligne', en: 'Template by row' },
    'settings.rowTemplate.intro': {
      fr: 'Ouvre tout seul le bon modèle selon la ligne sélectionnée dans la table de la page, en édition comme en lecture. Les règles se lisent dans l’ordre : la première qui correspond choisit le modèle.',
      en: 'Automatically opens the right template for the row selected in the page’s table, in editing and in reading. Rules are read in order: the first one that matches picks the template.',
    },
    'settings.rowTemplate.enable': { fr: 'Choisir le modèle selon la ligne', en: 'Pick the template from the row' },
    'settings.rowTemplate.ruleElseIf': { fr: 'Sinon si', en: 'Else if' },
    'settings.rowTemplate.addRule': { fr: '+ Ajouter une règle', en: '+ Add a rule' },
    'settings.rowTemplate.empty': { fr: 'Aucune règle : ajoutez-en une pour relier un modèle à une condition.', en: 'No rule: add one to link a template to a condition.' },
    'settings.rowTemplate.otherwise': { fr: 'Si aucune règle ne correspond', en: 'If no rule matches' },
    'settings.rowTemplate.otherwise.default': { fr: 'Ouvrir le modèle par défaut', en: 'Open the default template' },
    'settings.rowTemplate.otherwise.keep': { fr: 'Laisser le modèle ouvert', en: 'Keep the open template' },
    'settings.rowTemplate.locked': { fr: 'Vous êtes en lecture seule : ce réglage est verrouillé.', en: 'You are read-only: this setting is locked.' },
    'settings.viewTemplate.title': { fr: 'Modèle par défaut de cette vue', en: 'Default template for this view' },
    'settings.viewTemplate.intro': {
      fr: 'Le modèle qui s’ouvre chaque fois que l’on arrive dans cette vue. Sans choix, c’est le modèle par défaut du document (★) qui s’ouvre.',
      en: 'The template that opens every time someone arrives in this view. With no choice, the document’s default template (★) opens.',
    },
    'settings.viewTemplate.status.set': { fr: 'Modèle de cette vue : « {name} ».', en: 'Template for this view: “{name}”.' },
    'settings.viewTemplate.status.none': { fr: 'Aucun modèle choisi pour cette vue.', en: 'No template chosen for this view.' },
    'settings.viewTemplate.status.noneWithDefault': {
      fr: 'Aucun modèle choisi pour cette vue : le modèle par défaut du document (« {name} ») s’ouvre.',
      en: 'No template chosen for this view: the document’s default template (“{name}”) opens.',
    },
    'settings.viewTemplate.status.missing': {
      fr: 'Le modèle choisi pour cette vue n’existe plus ou ne peut pas s’ouvrir seul : le modèle par défaut du document s’ouvre.',
      en: 'The template chosen for this view no longer exists or cannot open on its own: the document’s default template opens.',
    },
    'settings.viewTemplate.use': { fr: 'Utiliser le modèle ouvert pour cette vue', en: 'Use the open template for this view' },
    'settings.viewTemplate.useNamed': { fr: 'Utiliser « {name} » pour cette vue', en: 'Use “{name}” for this view' },
    'settings.viewTemplate.clear': { fr: 'Retirer', en: 'Remove' },
    'settings.viewTemplate.cannotStart': { fr: 'Un modèle email ou un macro-modèle ne peut pas s’ouvrir au démarrage.', en: 'An email template or a macro template cannot open at startup.' },
    'settings.viewTemplate.locked': { fr: 'Vous êtes en lecture seule : ce réglage est verrouillé.', en: 'You are read-only: this setting is locked.' },
    'settings.rowTemplate.exportHint': {
      fr: 'Quand ce réglage est coché, un export en lot rend chaque ligne avec le modèle que les règles lui désignent.',
      en: 'When this setting is on, a batch export renders each row with the template the rules pick for it.',
    },
    'settings.access.intro': {
      fr: 'Droits par personne, lus dans une table du document : une ligne par personne, repérée par son email Grist, et une case à cocher par droit.',
      en: 'Per-person rights, read from a table in the document: one row per person, matched by their Grist email, and one checkbox per right.',
    },
    'settings.access.table': { fr: 'Table des droits', en: 'Rights table' },
    'settings.access.email': { fr: 'Colonne email', en: 'Email column' },
    'settings.access.readOnly': { fr: 'Lecture seule', en: 'Read-only' },
    'settings.access.export': { fr: 'Export autorisé', en: 'Export allowed' },
    'settings.access.comments': { fr: 'Commentaires autorisés', en: 'Comments allowed' },
    // Case « Ouvrir les personnes en lecture seule sur la Lecture épurée » (js/access-rights.js, js/clean-reading.js).
    'settings.access.cleanReading': { fr: 'Ouvrir les personnes en lecture seule sur la Lecture épurée', en: 'Open read-only people on Clean reading' },
    'settings.access.cleanReadingHint': {
      fr: 'Elles ouvrent sur le document seul, sans la barre d’outils ; le bouton rond du coin haut droit ou Échap leur rend la barre (Commenter, Exporter selon leurs droits). Choisissez d’abord la colonne « Lecture seule ».',
      en: 'They open on the document alone, without the toolbar; the round button at the top right, or Esc, brings the toolbar back (Comment, Export, depending on their rights). Choose the “Read-only” column first.',
    },
    'settings.access.none': { fr: '— Aucune —', en: '— None —' },
    'settings.access.saveHint': {
      fr: 'Pour l’appliquer à tout le monde, enregistrez ensuite la vue dans Grist (bouton Enregistrer en haut du widget). Une personne absente de la table garde tous les droits.',
      en: 'To apply it to everyone, then save the view in Grist (Save button at the top of the widget). A person missing from the table keeps all rights.',
    },
    'settings.access.protectHint': {
      fr: 'Simple verrou d’interface : seules les règles d’accès de Grist protègent vraiment les modèles et les données.',
      en: 'Interface lock only: only Grist access rules truly protect templates and data.',
    },
    'settings.access.locked': { fr: 'Vous êtes en lecture seule : ce réglage est verrouillé.', en: 'You are read-only: this setting is locked.' },
    'settings.access.status.pending': { fr: 'Lecture de vos droits…', en: 'Reading your rights…' },
    'settings.access.status.found': { fr: 'Vous ({email}) : {rights}.', en: 'You ({email}): {rights}.' },
    'settings.access.status.notFound': { fr: 'Vous ({email}) n’êtes pas dans la table : tous les droits.', en: 'You ({email}) are not in the table: all rights.' },
    'settings.access.status.noEmail': { fr: 'Votre email Grist est introuvable : tous les droits.', en: 'Your Grist email could not be found: all rights.' },
    'settings.access.status.error': { fr: 'Table des droits illisible pour vous : lecture seule par précaution.', en: 'Rights table unreadable for you: read-only as a precaution.' },
    'settings.access.status.tableGone': { fr: 'La table des droits n’existe plus : choisissez-en une autre. Lecture seule d’ici là, par précaution.', en: 'The rights table no longer exists: choose another one. Read-only until then, as a precaution.' },
    'settings.access.right.readOnly': { fr: 'lecture seule', en: 'read-only' },
    'settings.access.right.edit': { fr: 'modification', en: 'editing' },
    'settings.access.right.export': { fr: 'export', en: 'export' },
    'settings.access.right.noExport': { fr: 'sans export', en: 'no export' },
    'settings.access.right.comments': { fr: 'commentaires', en: 'comments' },
    'settings.access.right.noComments': { fr: 'sans commentaires', en: 'no comments' },
    'settings.language.intro': { fr: 'Langue de l’interface (textes, infobulles, messages).', en: 'Interface language (text, tooltips, messages).' },
    'settings.language.fr': { fr: 'Français', en: 'French' },
    'settings.language.en': { fr: 'Anglais', en: 'English' },
    'settings.triggerKey.intro': { fr: 'Caractère qui ouvre le panneau #Variable/Chips en cours de frappe.', en: 'Character that opens the #Variable/Chips panel while typing.' },
    'settings.pageMargins.intro': { fr: 'Marges de page (mm) - propres à ce modèle, appliquées à l’aperçu et aux exports PDF/DOCX.', en: 'Page margins (mm) - specific to this template, applied to the preview and to PDF/DOCX exports.' },
    'settings.pageMargins.top': { fr: 'Haut', en: 'Top' },
    'settings.pageMargins.right': { fr: 'Droite', en: 'Right' },
    'settings.pageMargins.bottom': { fr: 'Bas', en: 'Bottom' },
    'settings.pageMargins.left': { fr: 'Gauche', en: 'Left' },
    'settings.triggerKey.reloadNotice': { fr: 'Rechargez la page pour appliquer ce changement.', en: 'Reload the page to apply this change.' },
    'settings.triggerKey.reloadButton': { fr: 'Recharger maintenant', en: 'Reload now' },
    'settings.credits.version': { fr: 'Version', en: 'Version' },
    'settings.credits.author': { fr: 'Auteur', en: 'Author' },
    'settings.credits.website': { fr: 'Site', en: 'Website' },
    'settings.credits.license': { fr: 'Licence', en: 'License' },
    'settings.credits.bio': { fr: 'Bio', en: 'Bio' },
    'settings.credits.bioText': {
      fr: 'Grist Factory conçoit des widgets libres pour Grist. Publipostage+ en est un : rédiger contrats, factures et courriers à partir de vos données, sans écrire une ligne de code.',
      en: 'Grist Factory builds free and open-source widgets for Grist. Publipostage+ is one of them: write contracts, invoices and letters straight from your data, without a single line of code.',
    },

    // --- Réglages > Raccourcis : abréviations « §ub » (js/text-expansion.js) ---
    'settings.tab.shortcuts': { fr: 'Raccourcis', en: 'Shortcuts' },
    'settings.expansion.title': { fr: 'Abréviations', en: 'Abbreviations' },
    'settings.expansion.intro': {
      fr: 'Tapez le caractère déclencheur puis une abréviation, par exemple « {example} », et un espace : elle est remplacée par son texte.',
      en: 'Type the trigger character and an abbreviation, for example “{example}”, then a space: it is replaced by its text.',
    },
    'settings.expansion.perPerson': { fr: 'Chaque personne a les siennes, enregistrées dans le document (table Publipostage_Abreviations).', en: 'Everyone has their own, saved in the document (Publipostage_Abreviations table).' },
    'settings.expansion.char': { fr: 'Caractère déclencheur', en: 'Trigger character' },
    'settings.expansion.char.invalid': { fr: 'Un seul caractère, qui ne soit ni une lettre, ni un chiffre, ni une espace, ni . , ; : ! ? ) ] } » - _', en: 'One character only, not a letter, a digit, a space, nor . , ; : ! ? ) ] } » - _' },
    'settings.expansion.char.sameAsVariables': { fr: 'Ce caractère ouvre déjà le panneau des variables (onglet Déclencheur) : choisissez-en un autre.', en: 'This character already opens the variables panel (Trigger tab): pick another one.' },
    'settings.expansion.abbreviation': { fr: 'Abréviation', en: 'Abbreviation' },
    'settings.expansion.text': { fr: 'Texte à écrire', en: 'Text to write' },
    'settings.expansion.textPlaceholder': { fr: 'université de Bordeaux', en: 'University of Bordeaux' },
    'settings.expansion.add': { fr: 'Ajouter', en: 'Add' },
    'settings.expansion.edit': { fr: 'Modifier', en: 'Edit' },
    'settings.expansion.editAria': { fr: 'Modifier l’abréviation {abbreviation}', en: 'Edit abbreviation {abbreviation}' },
    'settings.expansion.deleteAria': { fr: 'Supprimer l’abréviation {abbreviation}', en: 'Delete abbreviation {abbreviation}' },
    'settings.expansion.confirmDelete': { fr: 'Supprimer l’abréviation {abbreviation} ?', en: 'Delete abbreviation {abbreviation}?' },
    'settings.expansion.empty': { fr: 'Aucune abréviation pour l’instant.', en: 'No abbreviations yet.' },
    'settings.expansion.error.empty': { fr: 'Saisissez une abréviation.', en: 'Enter an abbreviation.' },
    'settings.expansion.error.tooLong': { fr: 'Une abréviation compte 30 caractères au plus.', en: 'An abbreviation has 30 characters at most.' },
    'settings.expansion.error.chars': { fr: 'Lettres, chiffres, tiret et tiret bas seulement, sans espace.', en: 'Letters, digits, hyphen and underscore only, no spaces.' },
    'settings.expansion.error.duplicate': { fr: 'Cette abréviation existe déjà.', en: 'This abbreviation already exists.' },
    'settings.expansion.error.textEmpty': { fr: 'Saisissez le texte à écrire.', en: 'Enter the text to write.' },
    'settings.expansion.error.textTooLong': { fr: 'Le texte compte 2 000 caractères au plus.', en: 'The text has 2,000 characters at most.' },
    'settings.expansion.error.saveFailed': { fr: 'L’enregistrement dans le document a échoué.', en: 'Saving to the document failed.' },
    'expansion.panel.label': { fr: 'Abréviations', en: 'Abbreviations' },

    // --- Réglages > Raccourcis : touches du clavier (js/shortcuts.js, js/shortcuts-panel.js) ---
    'settings.switch.aria': { fr: 'Sections des raccourcis', en: 'Shortcut sections' },
    'settings.switch.keys': { fr: 'Touches', en: 'Keys' },
    'settings.switch.expansion': { fr: 'Abréviations', en: 'Abbreviations' },
    'settings.keys.title': { fr: 'Touches du clavier', en: 'Keyboard keys' },
    'settings.keys.intro': {
      fr: 'Cliquez sur une touche, puis tapez la combinaison voulue. Échap annule, Retour arrière retire la touche.',
      en: 'Click a key, then press the combination you want. Esc cancels, Backspace removes the key.',
    },
    'settings.keys.perBrowser': {
      fr: 'Les touches ne marchent que lorsque le curseur est dans le widget ; le navigateur garde pour lui Ctrl+N, Ctrl+T et Ctrl+W. Elles sont propres à ce navigateur, comme la langue et le thème.',
      en: 'Keys only work while the cursor is in the widget; the browser keeps Ctrl+N, Ctrl+T and Ctrl+W for itself. They are specific to this browser, like the language and the theme.',
    },
    'settings.keys.resetAll': { fr: 'Tout remettre par défaut', en: 'Reset all to default' },
    'settings.keys.confirmResetAll': { fr: 'Remettre toutes les touches par défaut ?', en: 'Reset all keys to their defaults?' },
    'settings.keys.reset': { fr: 'Par défaut', en: 'Default' },
    'settings.keys.resetAria': { fr: 'Remettre la touche d’origine de « {action} »', en: 'Restore the default key for “{action}”' },
    'settings.keys.none': { fr: 'Aucune', en: 'None' },
    'settings.keys.recording': { fr: 'Tapez la touche…', en: 'Press a key…' },
    'settings.keys.recordingAria': { fr: '{action} : tapez la combinaison voulue', en: '{action}: press the combination you want' },
    'settings.keys.keyAria': { fr: '{action} : touche {key}. Appuyer pour la changer', en: '{action}: key {key}. Press to change it' },
    'settings.keys.keyAriaNone': { fr: '{action} : aucune touche. Appuyer pour en choisir une', en: '{action}: no key. Press to choose one' },
    'settings.keys.group.templates': { fr: 'Modèles', en: 'Templates' },
    'settings.keys.group.view': { fr: 'Affichage', en: 'View' },
    'settings.keys.group.format': { fr: 'Mise en forme', en: 'Formatting' },
    'settings.keys.group.insert': { fr: 'Insertion', en: 'Insert' },
    'settings.keys.group.history': { fr: 'Historique et suivi', en: 'History and tracking' },
    'settings.keys.problem.invalid': { fr: 'Cette combinaison n’est pas valable.', en: 'This combination is not valid.' },
    'settings.keys.problem.needsModifier': { fr: 'Ajoutez Ctrl (⌘ sur Mac) ou Alt : une touche seule s’écrirait dans le texte.', en: 'Add Ctrl (⌘ on Mac) or Alt: a key on its own would be typed into the text.' },
    'settings.keys.problem.macCtrl': { fr: 'Sur Mac, Ctrl avec une lettre déplace le curseur : ajoutez ⌘ ou ⌥.', en: 'On a Mac, Ctrl with a letter moves the cursor: add ⌘ or ⌥.' },
    'settings.keys.problem.duplicate': { fr: '{key} est déjà la touche de «\u00a0{action}\u00a0».', en: '{key} is already the key for “{action}”.' },
    'settings.keys.problem.reserved': { fr: '{key} est gardée par le navigateur ou l’éditeur : choisissez-en une autre.', en: '{key} is kept by the browser or the editor: pick another one.' },
    'settings.keys.problem.altGr': { fr: 'Ctrl+Alt sert à AltGr, qui écrit des caractères (@, # …) : choisissez une autre combinaison.', en: 'Ctrl+Alt is AltGr, which types characters (@, # …): pick another combination.' },
    'shortcuts.action.rename': { fr: 'Renommer le modèle', en: 'Rename the template' },
    'shortcuts.action.setDefault': { fr: 'Modèle par défaut', en: 'Default template' },
    'shortcuts.action.templates': { fr: 'Liste des modèles', en: 'Template list' },
    'shortcuts.action.delete': { fr: 'Supprimer le modèle', en: 'Delete the template' },
    'shortcuts.action.keysList': { fr: 'Liste des raccourcis', en: 'Shortcut list' },
    'shortcuts.action.find': { fr: 'Rechercher', en: 'Find' },
    'shortcuts.action.replace': { fr: 'Rechercher et remplacer', en: 'Find and replace' },
    'shortcuts.action.bulletList': { fr: 'Liste à puces', en: 'Bulleted list' },
    'shortcuts.action.orderedList': { fr: 'Liste numérotée', en: 'Numbered list' },
    'shortcuts.action.taskList': { fr: 'Liste de tâches', en: 'Task list' },
    'shortcuts.action.image': { fr: 'Insérer une image', en: 'Insert an image' },
    'shortcuts.action.formatPaste': { fr: 'Appliquer la mise en forme', en: 'Apply the copied formatting' },

    // --- Mode Lecture (js/reader-mode.js:render) : état vide (aucune ligne sélectionnée) et avertissement quand une variable n'a pas pu être résolue
    // ---
    'reader.empty.title': { fr: 'Aucune ligne sélectionnée', en: 'No row selected' },
    'reader.empty.hint': { fr: 'Sélectionnez une ligne dans la table Grist pour voir le document avec ses données.', en: 'Select a row in the Grist table to see the document filled with its data.' },
    // Guide de la Lecture sans ligne (js/reader-guide.js) : quatre étapes pour que le widget reçoive une ligne (accès complet au document, tableau
    // sur la page, « Sélectionner par » de Grist, clic sur une ligne). Les libellés de Grist cités (« Ajouter », « Niveau d'accès », « Sélectionner
    // par », « Données source »...) sont ceux de ses fichiers de langue (grist-core, static/locales/{fr,en}.client.json) ; « Ajouter à la Page »
    // prend sa majuscule en français.
    'readerGuide.title': { fr: 'Reliez ce widget à votre tableau', en: 'Link this widget to your table' },
    'readerGuide.intro': { fr: 'En mode Lecture, le modèle se remplit avec la ligne choisie dans un tableau de cette page. Aucune ligne n’arrive à ce widget : il lui faut l’accès complet au document, et il doit être relié à ce tableau par le réglage « Sélectionner par » de Grist.', en: 'In Reading mode, the template is filled with the row picked in a table on this page. No row reaches this widget: it needs full access to the document, and it must be linked to that table with Grist’s “Select by” setting.' },
    'readerGuide.step': { fr: 'Étape {n}', en: 'Step {n}' },
    'readerGuide.access.title': { fr: 'Donnez l’accès complet à ce widget', en: 'Give this widget full access' },
    'readerGuide.access.lead': { fr: 'Déjà fait ? Passez à l’étape {next}. Sinon, cliquez sur ce widget pour le sélectionner : Grist ouvre son panneau de droite.', en: 'Already done? Go to step {next}. Otherwise, click this widget to select it: Grist opens its right-hand panel.' },
    'readerGuide.access.mark1': { fr: 'Ouvrez l’onglet « Vue »', en: 'Open the “Widget” tab' },
    'readerGuide.access.mark2': { fr: 'Vérifiez « Niveau d’accès » : il doit afficher « Accès complet au document »', en: 'Check “Access level”: it must read “Full document access”' },
    'readerGuide.access.mark3': { fr: 'Sinon, cliquez sur « Accepter »', en: 'If not, click “Accept”' },
    'readerGuide.access.alt': { fr: 'Le panneau de droite de Grist : l’onglet « Vue » (1), la liste « Niveau d’accès » (2) et le bouton « Accepter » de la demande d’accès complet (3).', en: 'Grist’s right-hand panel: the “Widget” tab (1), the “Access level” list (2) and the “Accept” button of the full-access request (3).' },
    // Widget relié mais sans accès complet : cette seule étape, sans son numéro ni son titre (c'est celui de la carte).
    'readerGuide.accessOnly.intro': { fr: 'Ce widget est relié à un tableau, mais Grist ne lui envoie aucune ligne tant qu’il n’a pas l’accès complet au document.', en: 'This widget is linked to a table, but Grist sends it no row until it has full access to the document.' },
    'readerGuide.accessOnly.lead': { fr: 'Cliquez sur ce widget pour le sélectionner : Grist ouvre son panneau de droite.', en: 'Click this widget to select it: Grist opens its right-hand panel.' },
    'readerGuide.add.title': { fr: 'Mettez votre tableau sur cette page', en: 'Put your table on this page' },
    'readerGuide.add.lead': { fr: 'Il y est déjà ? Passez à l’étape {next}. Sinon, dans Grist, ouvrez « Ajouter », puis « Ajouter une vue à la page ».', en: 'Already there? Go to step {next}. Otherwise, in Grist, open “Add new”, then “Add widget to page”.' },
    'readerGuide.add.mark1': { fr: 'Choisissez « Table »', en: 'Pick “Table”' },
    'readerGuide.add.mark2': { fr: 'Choisissez vos données', en: 'Pick your data' },
    'readerGuide.add.mark3': { fr: 'Cliquez sur « Ajouter à la Page »', en: 'Click “Add to page”' },
    'readerGuide.add.alt': { fr: 'La boîte « Ajouter une vue à la page » de Grist : « Table » (1), vos données (2), puis « Ajouter à la Page » (3).', en: 'Grist’s “Add widget to page” box: “Table” (1), your data (2), then “Add to page” (3).' },
    'readerGuide.link.title': { fr: 'Reliez ce widget au tableau', en: 'Link this widget to the table' },
    'readerGuide.link.lead': { fr: 'Cliquez sur ce widget pour le sélectionner, puis ouvrez le panneau de droite de Grist.', en: 'Click this widget to select it, then open Grist’s right-hand panel.' },
    'readerGuide.link.mark1': { fr: 'Ouvrez l’onglet « Données source »', en: 'Open the “Data” tab' },
    'readerGuide.link.mark2': { fr: 'Ouvrez la liste « Sélectionner par »', en: 'Open the “Select by” list' },
    'readerGuide.link.mark3': { fr: 'Choisissez votre tableau', en: 'Pick your table' },
    'readerGuide.link.alt': { fr: 'Le panneau de droite de Grist : l’onglet « Données source » (1), la liste « Sélectionner par » (2) et, dans cette liste, le tableau (3).', en: 'Grist’s right-hand panel: the “Data” tab (1), the “Select by” list (2) and, in that list, the table (3).' },
    'readerGuide.pick.title': { fr: 'Cliquez sur une ligne du tableau', en: 'Click a row of the table' },
    'readerGuide.pick.lead': { fr: 'Le tableau est vide ? Ajoutez-y d’abord une ligne.', en: 'Is the table empty? Add a row to it first.' },
    'readerGuide.pick.mark1': { fr: 'Cliquez sur une ligne', en: 'Click a row' },
    'readerGuide.pick.mark2': { fr: 'Le modèle s’affiche avec les données de cette ligne', en: 'The template shows that row’s data' },
    'readerGuide.pick.alt': { fr: 'Une ligne choisie dans le tableau (1) et le modèle rempli avec ses données (2).', en: 'A row picked in the table (1) and the template filled with its data (2).' },
    'readerGuide.zoom': { fr: 'Cliquer pour agrandir la capture', en: 'Click to enlarge the screenshot' },
    'readerGuide.unzoom': { fr: 'Cliquer pour réduire la capture', en: 'Click to shrink the screenshot' },
    'readerGuide.unsure': { fr: 'Ce widget est déjà relié ? Cliquez simplement sur une ligne du tableau.', en: 'Is this widget already linked? Just click a row of the table.' },
    'reader.unresolvedVariables': { fr: 'Attention : certaines variables n’ont pas pu être résolues.', en: 'Warning: some variables could not be resolved.' },
    // Écrit à la place du chip « Email de l'utilisateur » quand l'adresse ne peut pas être lue (js/reader-mode.js:resolveSmartChips) : en Lecture et
    // dans les exports.
    'reader.emailUnavailable': { fr: '[Email indisponible]', en: '[Email unavailable]' },
    // Pareil pour le chip « Nom de l'utilisateur » : nom illisible, ou que Grist ne donne pas à cette personne.
    'reader.nameUnavailable': { fr: '[Nom indisponible]', en: '[Name unavailable]' },

    // --- Messages de statut (js/main.js:setStatus) ---
    'status.ready': { fr: 'Widget prêt.', en: 'Widget ready.' },
    'status.readyReadOnly': { fr: 'Widget prêt, en lecture seule.', en: 'Widget ready, read-only.' },
    'status.readOnly': { fr: 'Lecture seule.', en: 'Read-only.' },
    'status.gristApiError': { fr: 'Erreur init API Grist.', en: 'Error initializing Grist API.' },
    // init() (js/main.js) n'a de filet que sur TemplateTreeSelect.attach() : une exception ailleurs bloquerait tout le reste (Enregistrer, Ctrl+S,
    // l'auto-save) sans le moindre message, seule la console en montrant la cause. init().catch(...) affiche l'erreur ici plutôt que de laisser le
    // widget muet.
    'status.initError': { fr: 'Erreur au chargement du widget : {message}', en: 'Error loading the widget: {message}' },
    'status.templateNameRequired': { fr: 'Nom du modèle requis.', en: 'Template name required.' },
    'status.nameExists': { fr: 'Ce nom existe déjà : renommé « {name} ».', en: 'This name already exists: renamed “{name}”.' },
    // Coin « info » (#status-msg) piloté par l'état réel de sauvegarde (cf. js/main.js:updateSaveStatus) plutôt que par le dernier événement quel
    // qu'il soit : affiché uniquement quand tout ce qui a été tapé est bien enregistré, vide sinon (frappe en attente du prochain passage de
    // l'enregistrement automatique, brouillon jamais enregistré, conflit) - sauf enregistrement automatique coupé, cf. unsavedChanges plus bas.
    'status.savedAt': { fr: 'Enregistré à {time}.', en: 'Saved at {time}.' },
    // Enregistrement automatique coupé et modifications en attente : le coin le dit tant que rien n'est enregistré à la main. Plus large que la base
    // du coin (12,5 em, css/toolbar-v2.css) : entier quand la barre le met sur sa propre ligne (panneau d'environ 700 px), coupé par « … » dans la
    // bande où il partage la première ligne avec les boutons (environ 850 à 880 px) - son texte entier s'affiche alors au survol
    // (js/viewport-fit.js).
    'status.unsavedChanges': { fr: 'Modifications non enregistrées.', en: 'Unsaved changes.' },
    // Cas « brouillon jamais enregistré » de updateSaveStatus() (Templates.getCurrentId() encore null) : sans ce message, le coin « info » resterait
    // vide et rien n'expliquerait pourquoi l'auto-save (qui ne crée jamais de modèle, cf. main.js:autosaveTick « if (!id) return ») ne fait rien
    // pendant la frappe. Même style d'alerte que templateNameRequired ci-dessus (même cause : pas encore de nom ni de ligne Grist).
    'status.unsavedTemplateWarning': { fr: 'Modèle non enregistré : donnez-lui un nom puis cliquez sur Enregistrer pour activer l’enregistrement automatique.', en: 'Template not saved: name it and click Save to enable auto-save.' },
    'status.autosaveConflictReloaded': { fr: 'Dernière version rechargée.', en: 'Latest version reloaded.' },
    'status.autosaveDisabled': { fr: 'Enregistrement automatique désactivé.', en: 'Auto-save turned off.' },
    'status.autosaveEnabled': { fr: 'Enregistrement automatique réactivé.', en: 'Auto-save turned back on.' },
    'status.autosaveError': { fr: 'Échec de l’enregistrement automatique.', en: 'Auto-save failed.' },
    'status.saveError': { fr: 'Échec de l’enregistrement.', en: 'Save failed.' },
    'status.noTemplateSelected': { fr: 'Aucun modèle sélectionné.', en: 'No template selected.' },
    'status.defaultTemplateSet': { fr: 'Modèle par défaut défini : il s’ouvrira automatiquement.', en: 'Default template set: it will open automatically.' },
    'status.defaultTemplateCleared': { fr: 'Modèle par défaut retiré.', en: 'Default template cleared.' },
    'status.templateDeleted': { fr: 'Modèle supprimé.', en: 'Template deleted.' },
    'status.pdfGenerating': { fr: 'Génération du PDF en cours...', en: 'Generating PDF...' },
    'status.pdfGenerated': { fr: 'PDF généré.', en: 'PDF generated.' },
    'status.pdfGenerationError': { fr: 'Erreur génération PDF.', en: 'PDF generation error.' },
    'status.emailGenerating': { fr: 'Préparation de l’email...', en: 'Preparing the email...' },
    'status.emailCreated': { fr: 'Email créé, ouverture de votre logiciel de messagerie.', en: 'Email created, opening your mail client.' },
    'status.emailCreationError': { fr: 'Erreur lors de la création de l’email.', en: 'Error while creating the email.' },
    'alert.noRecordForEmail': { fr: 'Aucune ligne sélectionnée : impossible de créer l’email.', en: 'No row selected: cannot create the email.' },
    'confirm.emailTooLong': { fr: 'Cet email dépasse {length} caractères (limite conseillée : {limit}) : certains logiciels de messagerie (Outlook notamment) tronqueront le message. Continuer quand même ?', en: 'This email is {length} characters long (recommended limit: {limit}): some mail clients (Outlook in particular) will truncate the message. Continue anyway?' },
    'status.docxGenerating': { fr: 'Génération du DOCX en cours...', en: 'Generating DOCX...' },
    'status.docxGenerated': { fr: 'DOCX généré.', en: 'DOCX generated.' },
    'status.docxGenerationError': { fr: 'Erreur génération DOCX.', en: 'DOCX generation error.' },
    'status.xlsxGenerating': { fr: 'Génération du fichier Excel en cours...', en: 'Generating the Excel file...' },
    'status.xlsxGenerated': { fr: 'Fichier Excel généré.', en: 'Excel file generated.' },
    'status.xlsxGenerationError': { fr: 'Erreur de génération du fichier Excel.', en: 'Excel file generation error.' },
    'status.xlsxImporting': { fr: 'Lecture du classeur Excel…', en: 'Reading the Excel workbook…' },
    'status.xlsxImported': { fr: 'Excel importé : {rows} {rows|ligne|lignes}, {cols} {cols|colonne|colonnes}. Nommez le modèle puis enregistrez-le.', en: 'Excel imported: {rows} {rows|row|rows}, {cols} {cols|column|columns}. Name the template, then save it.' },
    'status.xlsxImportedSheet': { fr: 'Feuille « {sheet} » ({index} sur {total}) importée : {rows} {rows|ligne|lignes}, {cols} {cols|colonne|colonnes}. Les autres ne le sont pas.', en: 'Sheet “{sheet}” ({index} of {total}) imported: {rows} {rows|row|rows}, {cols} {cols|column|columns}. The others are not.' },
    'status.xlsxImportOldFormat': { fr: 'Ce classeur est au format .xls ou protégé par un mot de passe : enregistrez-le en .xlsx, sans mot de passe, pour l’importer.', en: 'This workbook is in the .xls format or password-protected: save it as .xlsx without a password to import it.' },
    'status.xlsxImportUnreadable': { fr: 'Ce fichier n’est pas un classeur Excel (.xlsx) lisible.', en: 'This file is not a readable Excel (.xlsx) workbook.' },
    'status.xlsxImportEmpty': { fr: 'Ce classeur ne contient aucune case à importer.', en: 'This workbook has no cells to import.' },
    'status.xlsxImportEmptySheet': { fr: 'La feuille « {sheet} » ne contient aucune case à importer.', en: 'The sheet “{sheet}” has no cells to import.' },
    'status.xlsxImportTooBig': { fr: 'Cette feuille est trop grande pour une grille : {rows} {rows|ligne|lignes} et {cols} {cols|colonne|colonnes} (au plus {maxRows} lignes, {maxCols} colonnes et {maxCells} cases).', en: 'This sheet is too big for a grid: {rows} {rows|row|rows} and {cols} {cols|column|columns} (at most {maxRows} rows, {maxCols} columns and {maxCells} cells).' },
    'status.batchExportProgressXlsx': { fr: 'Export Excel en lot : {current}/{total}...', en: 'Batch Excel export: {current}/{total}...' },
    'status.exportErrorXlsx': { fr: 'Échec de l’export : aucun classeur Excel généré.', en: 'Export failed: no Excel workbook generated.' },
    'status.batchExportDoneXlsx': { fr: '{ok} {ok|classeur Excel généré|classeurs Excel générés} — archive ZIP téléchargée.', en: '{ok} Excel {ok|workbook|workbooks} generated — ZIP archive downloaded.' },
    'status.batchExportDoneWithFailuresXlsx': { fr: '{ok} {ok|classeur Excel généré|classeurs Excel générés}, {failed} {failed|échec|échecs} (voir la console) — archive ZIP téléchargée.', en: '{ok} Excel {ok|workbook|workbooks} generated, {failed} {failed|failure|failures} (see console) — ZIP archive downloaded.' },
    'status.xlsxAssembling': { fr: 'Assemblage du classeur Excel unique...', en: 'Assembling the single Excel workbook...' },
    'status.singleWorkbookDone': { fr: '{ok} {ok|valeur réunie|valeurs réunies} dans un seul classeur Excel — fichier téléchargé.', en: '{ok} {ok|value|values} combined into a single Excel workbook — file downloaded.' },
    'status.singleWorkbookDoneWithFailures': { fr: '{ok} {ok|valeur réunie|valeurs réunies} dans un seul classeur Excel, {failed} {failed|échec|échecs} (voir la console) — fichier téléchargé.', en: '{ok} {ok|value|values} combined into a single Excel workbook, {failed} {failed|failure|failures} (see console) — file downloaded.' },
    'status.currentTableNotFound': { fr: 'Table courante introuvable.', en: 'Current table not found.' },
    'status.cannotReadRows': { fr: 'Impossible de lire les lignes de la table.', en: 'Unable to read the table’s rows.' },
    'status.noRowsInTable': { fr: 'Aucune ligne dans la table « {table} ».', en: 'No rows in table “{table}”.' },
    'status.cannotReadRowsGrid': { fr: 'Impossible de lire les valeurs de la table.', en: 'Unable to read the table’s values.' },
    'status.noRowsInTableGrid': { fr: 'Aucune valeur dans la table « {table} ».', en: 'No values in table “{table}”.' },
    'status.loadingPdfLibs': { fr: 'Chargement des bibliothèques PDF...', en: 'Loading PDF libraries...' },
    'status.pdfLibsLoadError': { fr: 'Échec de chargement des bibliothèques PDF.', en: 'Failed to load PDF libraries.' },
    'status.batchExportProgress': { fr: 'Export PDF en lot : {current}/{total}...', en: 'Batch PDF export: {current}/{total}...' },
    'status.exportError': { fr: 'Échec de l’export : aucun PDF généré.', en: 'Export failed: no PDF generated.' },
    'status.zipCompressing': { fr: 'Compression de l’archive ZIP...', en: 'Compressing the ZIP archive...' },
    'status.batchExportDoneWithFailures': { fr: '{ok} PDF générés, {failed} {failed|échec|échecs} (voir la console) — archive ZIP téléchargée.', en: '{ok} PDFs generated, {failed} {failed|failure|failures} (see console) — ZIP archive downloaded.' },
    'status.batchExportDone': { fr: '{ok} PDF générés — archive ZIP téléchargée.', en: '{ok} PDFs generated — ZIP archive downloaded.' },
    // Export DOCX de toutes les lignes (ZIP) : mêmes messages que le lot PDF, avec le bon format.
    'status.loadingExportLibs': { fr: 'Chargement des bibliothèques d’export...', en: 'Loading export libraries...' },
    'status.exportLibsLoadError': { fr: 'Échec de chargement des bibliothèques d’export.', en: 'Failed to load export libraries.' },
    'status.batchExportProgressDocx': { fr: 'Export DOCX en lot : {current}/{total}...', en: 'Batch DOCX export: {current}/{total}...' },
    'status.exportErrorDocx': { fr: 'Échec de l’export : aucun DOCX généré.', en: 'Export failed: no DOCX generated.' },
    'status.batchExportDoneWithFailuresDocx': { fr: '{ok} DOCX générés, {failed} {failed|échec|échecs} (voir la console) — archive ZIP téléchargée.', en: '{ok} DOCX files generated, {failed} {failed|failure|failures} (see console) — ZIP archive downloaded.' },
    'status.batchExportDoneDocx': { fr: '{ok} DOCX générés — archive ZIP téléchargée.', en: '{ok} DOCX files generated — ZIP archive downloaded.' },
    'status.pdfMerging': { fr: 'Assemblage du PDF unique...', en: 'Assembling the single PDF...' },
    'status.mergedExportDoneWithFailures': { fr: '{ok} lignes réunies dans un seul PDF, {failed} {failed|échec|échecs} (voir la console) — fichier téléchargé.', en: '{ok} rows combined into a single PDF, {failed} {failed|failure|failures} (see console) — file downloaded.' },
    'status.mergedExportDone': { fr: '{ok} lignes réunies dans un seul PDF — fichier téléchargé.', en: '{ok} rows combined into a single PDF — file downloaded.' },
    'status.mergedExportDoneGrid': { fr: '{ok} {ok|valeur réunie|valeurs réunies} dans un seul PDF — fichier téléchargé.', en: '{ok} {ok|value|values} combined into a single PDF — file downloaded.' },
    'status.mergedExportDoneWithFailuresGrid': { fr: '{ok} {ok|valeur réunie|valeurs réunies} dans un seul PDF, {failed} {failed|échec|échecs} (voir la console) — fichier téléchargé.', en: '{ok} {ok|value|values} combined into a single PDF, {failed} {failed|failure|failures} (see console) — file downloaded.' },
    'status.sheetsAssembling': { fr: 'Assemblage des feuilles...', en: 'Assembling the sheets...' },
    'status.sheetsExportDone': { fr: '{ok} {ok|ligne placée|lignes placées} sur {sheets} {sheets|feuille|feuilles} — fichier téléchargé.', en: '{ok} {ok|row|rows} placed on {sheets} {sheets|sheet|sheets} — file downloaded.' },
    'status.sheetsExportDoneWithFailures': { fr: '{ok} {ok|ligne placée|lignes placées} sur {sheets} {sheets|feuille|feuilles}, {failed} {failed|échec|échecs} (voir la console) — fichier téléchargé.', en: '{ok} {ok|row|rows} placed on {sheets} {sheets|sheet|sheets}, {failed} {failed|failure|failures} (see console) — file downloaded.' },
    'status.sheetsExportDoneGrid': { fr: '{ok} {ok|valeur placée|valeurs placées} sur {sheets} {sheets|feuille|feuilles} — fichier téléchargé.', en: '{ok} {ok|value|values} placed on {sheets} {sheets|sheet|sheets} — file downloaded.' },
    'status.sheetsExportDoneWithFailuresGrid': { fr: '{ok} {ok|valeur placée|valeurs placées} sur {sheets} {sheets|feuille|feuilles}, {failed} {failed|échec|échecs} (voir la console) — fichier téléchargé.', en: '{ok} {ok|value|values} placed on {sheets} {sheets|sheet|sheets}, {failed} {failed|failure|failures} (see console) — file downloaded.' },
    'status.galleryLoadError': { fr: 'Impossible de charger la galerie de modèles.', en: 'Unable to load the template gallery.' },
    'status.templateLoadError': { fr: 'Impossible de charger ce modèle.', en: 'Unable to load this template.' },
    'status.templateSavedAsNew': { fr: 'Modèle « {name} » enregistré comme nouveau modèle.', en: 'Template “{name}” saved as a new template.' },
    'status.schemaLoadError': { fr: 'Impossible de charger le schéma de colonnes de ce modèle.', en: 'Unable to load this template’s column schema.' },
    'status.noColumnsDefined': { fr: 'Ce modèle ne définit aucune colonne.', en: 'This template defines no columns.' },
    'status.tableCreationError': { fr: 'Échec de la création de la table « {table} ».', en: 'Failed to create table “{table}”.' },
    'status.tableCreatedSummary': { fr: 'Table « {table} » créée avec {count} {count|colonne|colonnes}, modèle « {name} » enregistré. Liez ce widget à cette table depuis le menu du widget dans Grist (⋮ → Sélectionner la source de données) pour l’utiliser.', en: 'Table “{table}” created with {count} {count|column|columns}, template “{name}” saved. Link this widget to that table from the widget menu in Grist (⋮ → Select Widget Data) to use it.' },

    // --- Auto-save (bandeau de conflit, main.js) ---
    'autosave.conflict.message': { fr: 'Ce modèle a été modifié ailleurs pendant votre édition.', en: 'This template was modified elsewhere while you were editing.' },
    'autosave.conflict.reload': { fr: 'Recharger la dernière version', en: 'Reload latest version' },

    // --- Confirmations / invites (main.js) ; titres des fenêtres de saisie et de confirmation (js/dialogs.js), qui prennent aussi les textes des
    // clés voisines ---
    'dialog.imageUrl.title': { fr: 'Insérer une image', en: 'Insert an image' },
    'dialog.newTable.title': { fr: 'Nouvelle table Grist', en: 'New Grist table' },
    'dialog.newFolder.title': { fr: 'Nouveau dossier', en: 'New folder' },
    'dialog.moveFolder.title': { fr: 'Déplacer vers un dossier', en: 'Move to a folder' },
    'dialog.emailTooLong.title': { fr: 'Email trop long', en: 'Email too long' },
    'dialog.batchExport.title': { fr: 'Exporter toutes les lignes', en: 'Export all rows' },
    'dialog.batchExport.titleGrid': { fr: 'Exporter toutes les valeurs de la table', en: 'Export all table values' },
    // Un tableur de plus de 3 000 lignes ou 300 colonnes (js/grid-table.js) est collé tel quel : la fenêtre le dit une fois le collage fait.
    'dialog.pasteTooBig.title': { fr: 'Tableau collé sans mise en forme', en: 'Table pasted without formatting' },
    'dialog.pasteTooBig.rows': { fr: 'Le tableau collé compte {count} lignes : au-delà de {max}, il est collé tel quel, sans la mise en forme du tableur (fusions, fonds, largeurs de colonnes).', en: 'The pasted table has {count} rows: beyond {max}, it is pasted as is, without the spreadsheet formatting (merged cells, fills, column widths).' },
    'dialog.pasteTooBig.cols': { fr: 'Le tableau collé compte {count} colonnes : au-delà de {max}, il est collé tel quel, sans la mise en forme du tableur (fusions, fonds, largeurs de colonnes).', en: 'The pasted table has {count} columns: beyond {max}, it is pasted as is, without the spreadsheet formatting (merged cells, fills, column widths).' },
    // Quitter un modèle dont des modifications ne sont pas enregistrées (autre modèle, « + », nouvel email, nouvelle grille, galerie) : « Toujours
    // demander ». Sans nom (nouveau modèle jamais enregistré) il n'y a pas d'« Enregistrer » : le nom manque, la fenêtre propose d'abandonner ou
    // d'annuler pour lui en donner un.
    'dialog.unsaved.title': { fr: 'Modifications non enregistrées', en: 'Unsaved changes' },
    'dialog.unsaved.message': { fr: '« {name} » a des modifications non enregistrées. Les enregistrer avant de continuer ?', en: '“{name}” has unsaved changes. Save them before continuing?' },
    'dialog.unsaved.messageNoName': { fr: 'Ce nouveau modèle n’a pas de nom et n’est pas enregistré. Annulez pour lui en donner un, ou abandonnez-le.', en: 'This new template has no name and is not saved. Cancel to name it, or discard it.' },
    'dialog.unsaved.discard': { fr: 'Abandonner', en: 'Discard' },
    'alert.noRecordForExport': { fr: 'Aucune ligne sélectionnée : impossible d’exporter en PDF.', en: 'No row selected: cannot export to PDF.' },
    'alert.noRecordForExportXlsx': { fr: 'Aucune valeur de la table sélectionnée : impossible d’exporter en Excel.', en: 'No table value selected: cannot export to Excel.' },
    'alert.noRecordForExportGrid': { fr: 'Aucune valeur de la table sélectionnée : impossible d’exporter en PDF.', en: 'No table value selected: cannot export to PDF.' },
    'confirm.deleteTemplate': { fr: 'Supprimer ce modèle ?', en: 'Delete this template?' },
    'confirm.batchExport': { fr: 'Générer un PDF pour chacune des {count} lignes de « {table} » et les regrouper dans une archive ZIP ?', en: 'Generate a PDF for each of the {count} rows in “{table}” and bundle them into a ZIP archive?' },
    'confirm.batchExportDocx': { fr: 'Générer un DOCX pour chacune des {count} lignes de « {table} » et les regrouper dans une archive ZIP ?', en: 'Generate a DOCX for each of the {count} rows in “{table}” and bundle them into a ZIP archive?' },
    'confirm.mergedExport': { fr: 'Générer un PDF pour chacune des {count} lignes de « {table} » et les réunir dans un seul fichier PDF, chaque ligne commençant sur une nouvelle page ?', en: 'Generate a PDF for each of the {count} rows in “{table}” and combine them into a single PDF file, each row starting on a new page?' },
    'confirm.batchExportGrid': { fr: 'Générer un PDF par valeur de « {table} » ({count} {count|valeur|valeurs}) et les regrouper dans une archive ZIP ?', en: 'Generate one PDF per value of “{table}” ({count} {count|value|values}) and bundle them into a ZIP archive?' },
    'confirm.mergedExportGrid': { fr: 'Générer un PDF par valeur de « {table} » ({count} {count|valeur|valeurs}) et les réunir dans un seul fichier PDF, chaque valeur commençant sur une nouvelle page ?', en: 'Generate one PDF per value of “{table}” ({count} {count|value|values}) and combine them into a single PDF file, each value starting on a new page?' },
    'confirm.batchExportXlsx': { fr: 'Générer un classeur Excel par valeur de « {table} » ({count} {count|valeur|valeurs}) et les regrouper dans une archive ZIP ?', en: 'Generate one Excel workbook per value of “{table}” ({count} {count|value|values}) and bundle them into a ZIP archive?' },
    'confirm.singleWorkbookExport': { fr: 'Générer un seul classeur Excel, avec une feuille par valeur de « {table} » ({count} {count|valeur|valeurs}) ?', en: 'Generate a single Excel workbook with one sheet per value of “{table}” ({count} {count|value|values})?' },
    // Images d'un site externe à l'export (js/external-images.js) : la fenêtre qui liste les sites avant le PDF ou le Word, et le message quand on
    // l'annule.
    'dialog.externalImages.title': { fr: 'Images d’un site externe', en: 'Images from an external site' },
    'confirm.externalImages': { fr: 'Pour cet export, le widget doit télécharger des images hébergées {count|sur un site externe|sur des sites externes} :\n{sites}\n\nAnnuler arrête l’export.', en: 'For this export, the widget has to download images hosted {count|on an external site|on external sites}:\n{sites}\n\nCancel stops the export.' },
    // Image insérée par son adresse quand elle vient d'un autre site (js/main-toolbar.js) : la question posée une fois, à l'insertion.
    'dialog.imageExternal.title': { fr: 'Image d’un site externe', en: 'Image from an external site' },
    'dialog.imageExternal.message': { fr: 'Cette image est hébergée sur un site externe ({site}).\n\nIntégrer l’image la copie dans le modèle : elle ne dépend plus de ce site.\nGarder le lien l’affiche depuis ce site à chaque ouverture du modèle : elle sera signalée en rouge.', en: 'This image is hosted on an external site ({site}).\n\nEmbedding the image copies it into the template: it no longer depends on that site.\nKeeping the link shows it from that site each time the template is opened: it will be flagged in red.' },
    'dialog.imageExternal.embed': { fr: 'Intégrer l’image', en: 'Embed image' },
    'dialog.imageExternal.keep': { fr: 'Garder le lien', en: 'Keep link' },
    // Image d'un site externe à l'affichage (js/external-images.js) : l'infobulle de toute image qui charge depuis un autre site que le widget et
    // Grist (contour en tirets, css/external-images.css).
    'image.externalSite': { fr: 'Image hébergée sur un site externe ({site}) : chaque affichage la télécharge depuis ce site.', en: 'Image hosted on an external site ({site}): every display downloads it from that site.' },
    'status.exportCancelled': { fr: 'Export annulé.', en: 'Export cancelled.' },
    'prompt.newTemplateName': { fr: 'Nom du nouveau modèle :', en: 'Name of the new template:' },
    'prompt.newTableName': { fr: 'Nom de la nouvelle table Grist :', en: 'Name of the new Grist table:' },

    // --- Panneau `#` : onglets ---
    'panel.tabVariables': { fr: 'Variables', en: 'Variables' },
    'panel.tabChips': { fr: 'Chips', en: 'Chips' },
    'chips.footnote': { fr: 'Note de bas de page', en: 'Footnote' },
    'chips.date': { fr: 'Date du jour', en: 'Today’s date' },
    'chips.time': { fr: 'Heure actuelle', en: 'Current time' },
    'chips.email': { fr: 'Email de l’utilisateur', en: 'User’s email' },
    'chips.name': { fr: 'Nom de l’utilisateur', en: 'User’s name' },

    // --- Modale de configuration de correspondance (js/variables.js:showLinkConfigModal) ---
    'linkConfig.columnPlaceholder': { fr: '— Choisir une colonne —', en: '— Choose a column —' },
    'linkConfig.rowId': { fr: 'Identifiant de ligne', en: 'Row ID' },
    // Indice entre parenthèses derrière le nom d'une colonne Référence dans les listes de la fenêtre (Variables.describeColumn) : la table visée.
    'linkConfig.refHint': { fr: 'Référence → {table}', en: 'Reference → {table}' },
    'linkConfig.refListHint': { fr: 'Références → {table}', en: 'References → {table}' },
    'linkConfig.searchColumns': { fr: 'Rechercher une colonne…', en: 'Search for a column…' },
    'linkConfig.noColumnMatch': { fr: 'Aucune colonne ne correspond.', en: 'No column matches.' },
    // Liste déroulante avec recherche (js/search-select.js) : textes par défaut, la fenêtre de liaison passe les siens ci-dessus.
    'searchSelect.placeholder': { fr: 'Rechercher…', en: 'Search…' },
    'searchSelect.empty': { fr: 'Aucun résultat.', en: 'No results.' },
    'searchSelect.count': { fr: '{count} {count|résultat|résultats}', en: '{count} {count|result|results}' },
    // Liste de plus de 500 résultats : seuls les premiers sont posés, cette ligne dit combien d'autres restent.
    'searchSelect.more': { fr: 'Encore {count} {count|résultat|résultats} : précisez la recherche.', en: '{count} more {count|result|results}: refine your search.' },
    // Même liste avec recherche pour une table (Réglages > Accès), un modèle (macro-modèle), une valeur possible d'une colonne (champ Valeur d'une
    // règle) et une feuille d'un classeur Excel (import d'une grille) : SearchSelect.attachTables / attachTemplates / attachValues / attachSheets.
    'searchSelect.searchTables': { fr: 'Rechercher une table…', en: 'Search for a table…' },
    'searchSelect.noTableMatch': { fr: 'Aucune table ne correspond.', en: 'No table matches.' },
    'searchSelect.searchTemplates': { fr: 'Rechercher un modèle…', en: 'Search for a template…' },
    'searchSelect.noTemplateMatch': { fr: 'Aucun modèle ne correspond.', en: 'No template matches.' },
    'searchSelect.searchValues': { fr: 'Rechercher une valeur…', en: 'Search for a value…' },
    'searchSelect.noValueMatch': { fr: 'Aucune valeur ne correspond.', en: 'No value matches.' },
    'searchSelect.searchSheets': { fr: 'Rechercher une feuille…', en: 'Search for a sheet…' },
    'searchSelect.noSheetMatch': { fr: 'Aucune feuille ne correspond.', en: 'No sheet matches.' },
    'linkConfig.describeSingleton': { fr: 'une seule ligne (paramètres)', en: 'a single row (settings)' },
    'linkConfig.describeRowId': { fr: 'identifiant de ligne', en: 'row ID' },
    'linkConfig.previewChooseColumns': { fr: 'Choisissez les deux colonnes pour voir un aperçu.', en: 'Choose both columns to see a preview.' },
    'linkConfig.previewNoRecord': { fr: 'Aucune ligne sélectionnée dans Grist pour prévisualiser.', en: 'No row selected in Grist to preview.' },
    'linkConfig.previewComputing': { fr: 'Calcul de l’aperçu…', en: 'Computing preview…' },
    'linkConfig.previewTableEmpty': { fr: '« {table} » est vide.', en: '“{table}” is empty.' },
    'linkConfig.previewSingleton': { fr: 'Toujours la ligne n°{id} de « {table} », quelle que soit la ligne courante.', en: 'Always row #{id} of “{table}”, regardless of the current row.' },
    'linkConfig.previewMatches': { fr: '{count} {count|ligne trouvée|lignes trouvées} dans « {table} » (n° {ids}).', en: '{count} {count|row|rows} found in “{table}” (# {ids}).' },
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

    // --- Messages d'erreur d'une #Variable (js/variables.js : baseRows, followReference, resolveRawValue, resolveVariableResult ;
    // js/reader-mode.js : resolveBadgeNode). Écrits dans le document à la place de la valeur (mode Lecture, exports PDF et DOCX), donc dans la langue
    // de l'interface de qui lit ou exporte. Le mode Lecture ne les reconnaît pas à leurs premiers mots mais au drapeau `isError` de
    // Variables.resolveVariableResult ---
    'variables.error.noCurrentTable': { fr: '[ERREUR: table courante indisponible]', en: '[ERROR: current table unavailable]' },
    'variables.error.noMatching': { fr: '[ERREUR: aucune correspondance configurée pour {table} — réinsérez la variable pour la configurer]', en: '[ERROR: no matching configured for {table} — reinsert the variable to configure it]' },
    'variables.error.rowNotFound': { fr: '[ERREUR: ligne introuvable dans {table}]', en: '[ERROR: row not found in {table}]' },
    'variables.error.notReference': { fr: '[ERREUR: {table}.{column} n’est pas une colonne Référence]', en: '[ERROR: {table}.{column} is not a Reference column]' },
    'variables.error.failed': { fr: '[ERREUR: résolution de {table}.{column} impossible]', en: '[ERROR: could not resolve {table}.{column}]' },
    'variables.error.generic': { fr: '[ERREUR: {message}]', en: '[ERROR: {message}]' },

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
    'imgToolbar.wrapNeedsText': { fr: 'Basculer en ligne / bloc (pour une image non alignée, avec du texte autour)', en: 'Toggle inline / block (for an unaligned image with text around it)' },
    'imgToolbar.inText': { fr: 'Au cœur du texte', en: 'In line with text' },
    'imgToolbar.front': { fr: 'Devant le texte', en: 'In front of text' },
    'imgToolbar.behind': { fr: 'Derrière le texte', en: 'Behind text' },
    'imgToolbar.repeat': { fr: 'Sur toutes les pages', en: 'On every page' },
    'imgToolbar.repeatNeedsBehind': { fr: 'Sur toutes les pages (pour une image derrière le texte)', en: 'On every page (for an image behind the text)' },
    'imgToolbar.repeatNeedsPage': { fr: 'Sur toutes les pages (active l’Aperçu A4 pour placer l’image sur la page)', en: 'On every page (turn on the A4 preview to place the image on the page)' },
    'imgToolbar.delete': { fr: 'Supprimer', en: 'Delete' },

    // --- Toolbar flottante de tableau (js/editor.js:wireTableFloatingToolbar) ---
    'table.rowBefore': { fr: 'Ligne avant', en: 'Row before' },
    'table.rowAfter': { fr: 'Ligne après', en: 'Row after' },
    'table.rowDel': { fr: 'Supprimer la ligne', en: 'Delete row' },
    'table.rowDelMerged': { fr: 'Indisponible avec le suivi des modifications : une cellule fusionnée traverse cette ligne', en: 'Unavailable with track changes on: a merged cell runs across this row' },
    'table.colBefore': { fr: 'Colonne avant', en: 'Column before' },
    'table.colAfter': { fr: 'Colonne après', en: 'Column after' },
    'table.colDel': { fr: 'Supprimer la colonne', en: 'Delete column' },
    'table.colDelMerged': { fr: 'Indisponible avec le suivi des modifications : une cellule fusionnée traverse cette colonne', en: 'Unavailable with track changes on: a merged cell runs across this column' },
    'table.tableDel': { fr: 'Supprimer le tableau', en: 'Delete table' },
    'table.fillOpen': { fr: 'Fond de cellule (remplir)', en: 'Cell background (fill)' },
    // Fusion et scission de cases (js/floating-toolbars.js : grille et tableau de document), puis l'alignement vertical de la barre d'une grille. Les
    // cinq phrases d'après sont les raisons du grisé, en info-bulle (js/table-merge.js).
    'table.cellMerge': { fr: 'Fusionner les cases', en: 'Merge cells' },
    'table.cellSplit': { fr: 'Scinder la case', en: 'Split cell' },
    'table.cellMergeNeedsCells': { fr: 'Fusionner les cases : sélectionnez-en au moins deux, en glissant sur le tableau', en: 'Merge cells: select at least two, by dragging across the table' },
    'table.cellMergeOverlap': { fr: 'Fusionner les cases : une case déjà fusionnée dépasse de la sélection, incluez-la en entier', en: 'Merge cells: an already merged cell sticks out of the selection, include all of it' },
    'table.cellMergeLoop': { fr: 'Fusionner les cases : une ligne de la sélection est répétée par une boucle', en: 'Merge cells: a row of the selection is repeated by a loop' },
    'table.cellSplitNeedsMerged': { fr: 'Scinder la case : placez le curseur dans une case fusionnée', en: 'Split cell: place the cursor in a merged cell' },
    'table.cellTracked': { fr: 'Indisponible avec le suivi des modifications : la forme du tableau changerait', en: 'Unavailable with track changes on: the shape of the table would change' },
    'table.valignTop': { fr: 'Aligner en haut', en: 'Align to top' },
    'table.valignMiddle': { fr: 'Aligner au milieu', en: 'Align to middle' },
    'table.valignBottom': { fr: 'Aligner en bas', en: 'Align to bottom' },
    // Menu « Bordures » de cette barre : les huit réglages, puis la couleur du trait.
    'table.bordersOpen': { fr: 'Bordures', en: 'Borders' },
    'table.bordersAll': { fr: 'Toutes les bordures', en: 'All borders' },
    'table.bordersOuter': { fr: 'Bordures extérieures', en: 'Outside borders' },
    'table.bordersInner': { fr: 'Bordures intérieures', en: 'Inside borders' },
    'table.bordersTop': { fr: 'Bordure du haut', en: 'Top border' },
    'table.bordersBottom': { fr: 'Bordure du bas', en: 'Bottom border' },
    'table.bordersLeft': { fr: 'Bordure de gauche', en: 'Left border' },
    'table.bordersRight': { fr: 'Bordure de droite', en: 'Right border' },
    'table.bordersNone': { fr: 'Aucune bordure', en: 'No border' },
    'table.bordersPen': { fr: 'Couleur du trait', en: 'Line color' },
    'twoColumns.resizeGrip': { fr: 'Redimensionner les colonnes', en: 'Resize columns' },
    'twoColumns.widthMmButton': { fr: 'Régler les largeurs en mm', en: 'Set widths in mm' },
    'twoColumns.widthMmLeftLabel': { fr: 'Gauche (mm)', en: 'Left (mm)' },
    'twoColumns.widthMmRightLabel': { fr: 'Droite (mm)', en: 'Right (mm)' },
    'image.moveHandle': { fr: 'Déplacer (flèches du clavier : 1 px, avec Maj : 10 px)', en: 'Move (arrow keys: 1 px, with Shift: 10 px)' },
    'image.corsWarning': { fr: 'Cette image ne pourra probablement pas être incluse dans le PDF exporté : le serveur qui l’héberge ne semble pas autoriser son téléchargement depuis ce widget (restriction CORS). Elle continuera de s’afficher normalement ici et en mode lecture, mais l’export PDF devra l’ignorer.\n\nPour éviter ce problème, copiez l’image (Ctrl+C depuis son emplacement d’origine) puis collez-la directement ici (Ctrl+V) plutôt que d’insérer son URL : une image collée n’est jamais concernée par cette restriction.', en: 'This image probably cannot be included in the exported PDF: the server hosting it doesn’t seem to allow downloading it from this widget (CORS restriction). It will keep displaying normally here and in read mode, but the PDF export will have to skip it.\n\nTo avoid this, copy the image (Ctrl+C from its original location) then paste it directly here (Ctrl+V) instead of inserting its URL: a pasted image is never affected by this restriction.' },
    'image.urlPrompt': { fr: 'URL de l’image :', en: 'Image URL:' },

    // --- Picker "Image depuis une variable" (js/editor.js) ---
    'imageVarPicker.empty': { fr: 'Aucune colonne Pièce jointe trouvée dans ce document.', en: 'No attachment column found in this document.' },

    // --- Popup d'édition du texte d'une note de bas de page ---
    'footnotePopup.delete': { fr: 'Supprimer', en: 'Delete' },
    'footnotePopup.ok': { fr: 'OK', en: 'OK' },
    'footnotePopup.placeholder': { fr: 'Texte de la note…', en: 'Note text…' },

    // --- Sommaire (placeholder avant résolution) : montré par l'éditeur (NodeView) ET écrit dans le HTML enregistré/copié (renderHTML,
    // js/editor-nodes.js) ---
    'toc.placeholder': { fr: 'Sommaire (généré automatiquement à partir des titres)', en: 'Table of contents (generated automatically from headings)' },

    // --- Placeholder du corps de l'éditeur, document principal vide (@tiptap/extension-placeholder, cf. js/editor.js) - lu via une fonction plutôt
    // qu'une chaîne figée (cf. commentaire à l'appel), donc pas besoin de I18n.onChange pour suivre un changement de langue en cours de session : ce
    // n'est pas affiché en mode édition d'en-tête/pied (cf. js/header-footer-preview.js), une zone vide n'y montre aucun texte.
    'editor.placeholder': { fr: 'Commencez à écrire votre modèle ici…', en: 'Start writing your template here…' },

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
    'varFmt.zero': { fr: 'Ne rien afficher si la valeur vaut zéro', en: 'Show nothing if the value is zero' },
    'varFmt.showDay': { fr: 'Afficher/masquer le jour', en: 'Show/hide day' },
    'varFmt.showMonth': { fr: 'Afficher/masquer le mois', en: 'Show/hide month' },
    'varFmt.showYear': { fr: 'Afficher/masquer l’année', en: 'Show/hide year' },
    'varFmt.datePreset': { fr: 'Format de date', en: 'Date format' },
    'varFmt.wordsDateTitle': { fr: 'Écriture en toutes lettres', en: 'Spelled out' },
    // Colonne Oui / Non : les quatre écritures de la barre d'une bulle. Les trois cases sont celles de la liste à cases (mêmes icônes, mêmes
    // infobulles list.checklistClassic.tip et list.checklistAccentPlain.tip ; la première précise ce que le style barre dans une variable), le texte
    // écrit « vrai » / « faux » (« true » / « false » en anglais) - c'est aussi ce que la bulle écrit sans réglage. Coché / décoché : le nom
    // accessible d'une case de la Lecture.
    'varFmt.boolTrue': { fr: 'vrai', en: 'true' },
    'varFmt.boolFalse': { fr: 'faux', en: 'false' },
    'varFmt.boolChecked': { fr: 'Coché', en: 'Checked' },
    'varFmt.boolUnchecked': { fr: 'Décoché', en: 'Unchecked' },
    'varFmt.boolTextButton': { fr: 'vrai / faux', en: 'true / false' },
    'varFmt.boolTextTitle': { fr: 'Écrire vrai ou faux', en: 'Write true or false' },
    'varFmt.boolAccentStrike': { fr: 'Case à cocher (accent, texte barré dans une liste)', en: 'Checkbox (accent, text struck through in a list)' },

    // --- Pastille flottante d'édition d'en-tête/pied (js/editor.js:renderHfPill) ---
    'hf.zoneHeader': { fr: 'En-tête', en: 'Header' },
    'hf.zoneFooter': { fr: 'Pied de page', en: 'Footer' },
    // Zones fantômes de la page vide (js/header-footer-preview.js:renderPaginationOverlay) : un clic y ouvre l'édition.
    'hf.addHeader': { fr: 'Ajouter un en-tête', en: 'Add a header' },
    'hf.addFooter': { fr: 'Ajouter un pied de page', en: 'Add a footer' },
    'hf.differentFirstPage': { fr: 'Première page différente', en: 'Different first page' },
    'hf.variantDefault': { fr: 'Pages normales', en: 'Regular pages' },
    'hf.variantFirst': { fr: 'Page 1', en: 'Page 1' },
    'hf.insertPageNumber': { fr: 'Insérer le numéro de page', en: 'Insert page number' },
    'hf.pagenumSimple': { fr: 'Numéro simple (3)', en: 'Simple number (3)' },
    'hf.pagenumPageN': { fr: 'Page 3', en: 'Page 3' },
    'hf.pagenumSlash': { fr: '3 / 12', en: '3 / 12' },
    'hf.done': { fr: 'Terminer', en: 'Done' },

    // --- Titre du sommaire, exporté en PDF (js/pdf-export.js:buildTocStack et son repli), en DOCX (js/docx-export.js:buildTocParagraphs) et affiché
    // en mode Lecture (js/reader-mode.js:resolveTocMarkers) : tous disent la même chose, le mode Lecture étant l'aperçu de l'export ---
    'pdf.tocTitle': { fr: 'Sommaire', en: 'Table of Contents' },
    'pdf.tocEmpty': { fr: 'Aucun titre trouvé.', en: 'No heading found.' },
    // Sommaire d'un export DOCX sans aucun titre (js/docx-export.js:buildTocParagraphs) : sa phrase à lui, en italique entre parenthèses.
    'docx.tocEmpty': { fr: '(aucun titre dans ce document)', en: '(no heading in this document)' },

    // --- Mode Email (planning/feature-email-mode.md) : bandeau Objet/À/Cc/Cci + action de création du mailto: ---
    'email.to.label': { fr: 'À', en: 'To' },
    'email.to.placeholder': { fr: 'Destinataires (#Variable ou adresses séparées par des virgules)', en: 'Recipients (#Variable or comma-separated addresses)' },
    'email.cc.label': { fr: 'Cc', en: 'Cc' },
    'email.cc.placeholder': { fr: 'Copie', en: 'Cc' },
    'email.cci.placeholder': { fr: 'Copie cachée', en: 'Bcc' },
    'email.cci.show': { fr: '+ Cci', en: '+ Bcc' },
    'email.subject.label': { fr: 'Objet', en: 'Subject' },
    'email.subject.placeholder': { fr: 'Objet de l’email (#Variable autorisée)', en: 'Email subject (#Variable allowed)' },
    'email.createButton': { fr: 'Créer l’email', en: 'Create email' },
    'email.charCount': { fr: '{count} / {limit} caractères', en: '{count} / {limit} characters' },
    'email.charCountOverLimit': { fr: '{count} / {limit} caractères — le message sera tronqué par votre logiciel de messagerie', en: '{count} / {limit} characters — your mail client will truncate the message' },

    // --- Barre flottante d'une bulle #Variable : actions (js/floating-toolbars.js:wireVariableFloatingToolbar) ---
    'varToolbar.condition': { fr: 'Condition d’affichage', en: 'Display condition' },
    'varToolbar.linked': { fr: 'Autres attributs de la même ligne', en: 'Other attributes of the same row' },
    'varToolbar.linkedDisabled': { fr: 'Disponible pour une variable d’une autre table ou une colonne Référence', en: 'Available for a variable from another table or a Reference column' },
    'varToolbar.loop': { fr: 'Boucle : répéter pour chaque ligne liée', en: 'Loop: repeat for each linked row' },
    'varToolbar.loopDisabled': { fr: 'Disponible pour une variable liée à plusieurs lignes', en: 'Available for a variable linked to several rows' },
    'varToolbar.loopNested': { fr: 'Déjà dans une zone répétée pour « {table} »', en: 'Already inside a zone repeated for “{table}”' },

    // --- Fenêtre de condition d'une variable (js/variable-condition.js, js/condition-fields.js en mode toutes tables) ---
    'varCond.title': { fr: 'Condition d’affichage', en: 'Display condition' },
    'varCond.intro': { fr: 'n’apparaît en lecture et à l’export que si la condition est remplie. En édition, la bulle reste visible, en pointillés.', en: 'only appears in read mode and in exports when the condition is met. While editing, the bubble stays visible with a dashed border.' },
    'varCond.modeBefore': { fr: 'Afficher si', en: 'Show if' },
    'varCond.modeAll': { fr: 'toutes', en: 'all' },
    'varCond.modeAny': { fr: 'au moins une', en: 'any' },
    'varCond.modeAfter': { fr: 'les conditions sont remplies', en: 'of the conditions are met' },
    'varCond.modeAria': { fr: 'Combinaison des conditions', en: 'How the conditions combine' },
    'varCond.ruleAnd': { fr: 'Et', en: 'And' },
    'varCond.ruleOr': { fr: 'Ou', en: 'Or' },
    'varCond.removeRule': { fr: 'Supprimer cette condition', en: 'Remove this condition' },
    'varCond.addRule': { fr: '+ Ajouter une condition', en: '+ Add a condition' },
    'varCond.linkHint.match': { fr: 'ligne de « {table} » trouvée via {via}', en: 'row of “{table}” found via {via}' },
    'varCond.linkHint.singleton': { fr: 'toujours la même ligne de « {table} »', en: 'always the same row of “{table}”' },
    'varCond.linkHint.edit': { fr: 'Modifier le lien', en: 'Edit link' },
    'varCond.debug.chooseColumn': { fr: 'Choisissez une colonne pour voir l’aperçu.', en: 'Choose a column to see a preview.' },
    'varCond.debug.noRecord': { fr: 'Aucune ligne sélectionnée dans Grist : sélectionnez-en une pour voir l’aperçu.', en: 'No row selected in Grist: select one to see a preview.' },
    'varCond.debug.computing': { fr: 'Calcul de l’aperçu…', en: 'Computing preview…' },
    'varCond.debug.currentMet': { fr: 'Ligne sélectionnée (n° {id}) : condition remplie, la variable affiche « {value} ».', en: 'Selected row (#{id}): condition met, the variable shows “{value}”.' },
    'varCond.debug.currentNotMet': { fr: 'Ligne sélectionnée (n° {id}) : condition non remplie, la variable est masquée.', en: 'Selected row (#{id}): condition not met, the variable is hidden.' },
    'varCond.debug.count': { fr: 'Dans « {table} » : {count} {count|ligne|lignes} sur {total} {count|remplit|remplissent} la condition.', en: 'In “{table}”: {count} of {total} {total|row|rows} {count|meets|meet} the condition.' },
    'varCond.debug.first': { fr: 'Première : n° {id}{label}, qui afficherait « {value} ».', en: 'First: #{id}{label}, which would show “{value}”.' },
    'varCond.debug.none': { fr: 'Dans « {table} » : aucune des {total} lignes ne remplit la condition.', en: 'In “{table}”: none of the {total} rows meets the condition.' },
    'varCond.debug.emptyValue': { fr: '(vide)', en: '(empty)' },
    'varCond.debug.imageValue': { fr: '(image)', en: '(image)' },
    'varCond.remove': { fr: 'Retirer la condition', en: 'Remove condition' },
    'varCond.saveLost': { fr: 'La variable a été déplacée ou supprimée pendant l’édition : la condition n’a pas été enregistrée.', en: 'The variable was moved or deleted while editing: the condition was not saved.' },
    'varCond.clip.copy': { fr: 'Copier', en: 'Copy' },
    'varCond.clip.paste': { fr: 'Coller', en: 'Paste' },
    'varCond.clip.copied': { fr: 'Copiée', en: 'Copied' },
    'varCond.clip.copyTitle': { fr: 'Copier cette condition pour la coller sur une autre variable', en: 'Copy this condition to paste it on another variable' },
    'varCond.clip.copyEmpty': { fr: 'Rien à copier : choisissez d’abord une colonne.', en: 'Nothing to copy: pick a column first.' },
    'varCond.clip.pasteTitle': { fr: 'Coller la condition copiée à la place de celle-ci : {summary}', en: 'Paste the copied condition in place of this one: {summary}' },
    'varCond.clip.pasteEmpty': { fr: 'Rien à coller : copiez d’abord la condition d’une variable avec « Copier ».', en: 'Nothing to paste: first copy a variable’s condition with “Copy”.' },
    'varCond.clip.copiedStatus': { fr: 'Condition copiée.', en: 'Condition copied.' },
    'varCond.clip.pastedStatus': { fr: 'Condition collée. Enregistrez pour l’appliquer à la variable.', en: 'Condition pasted. Save to apply it to the variable.' },

    // --- Bloc de texte conditionnel (menu des variables, onglet Chips ; js/editor-nodes.js:createConditionalTextNode, js/conditional-text.js) :
    // l'entrée du panneau, l'étiquette du bloc dans l'éditeur, et les variantes « bloc » de la barre flottante et de la fenêtre de condition d'une
    // variable (js/floating-toolbars.js, js/variable-condition.js) ---
    'chips.conditionalText': { fr: 'Texte conditionnel', en: 'Conditional text' },
    'varToolbar.linkedBlock': { fr: 'Disponible pour une variable, pas pour un bloc de texte', en: 'Available for a variable, not for a text block' },
    'varToolbar.loopBlock': { fr: 'Disponible pour une variable liée à plusieurs lignes, pas pour un bloc de texte', en: 'Available for a variable linked to several rows, not for a text block' },
    'varCond.introBlock': { fr: 'Ce bloc de texte n’apparaît en lecture et à l’export que si la condition est remplie. En édition, il reste visible, entouré de pointillés.', en: 'This text block only appears in read mode and in exports when the condition is met. While editing, it stays visible inside a dashed frame.' },
    'varCond.debug.currentMetBlock': { fr: 'Ligne sélectionnée (n° {id}) : condition remplie, le bloc s’affiche.', en: 'Selected row (#{id}): condition met, the block is shown.' },
    'varCond.debug.currentNotMetBlock': { fr: 'Ligne sélectionnée (n° {id}) : condition non remplie, le bloc est masqué.', en: 'Selected row (#{id}): condition not met, the block is hidden.' },
    'varCond.debug.firstBlock': { fr: 'Première : n° {id}{label}.', en: 'First: #{id}{label}.' },
    'varCond.saveLostBlock': { fr: 'Le bloc de texte a été déplacé ou supprimé pendant l’édition : la condition n’a pas été enregistrée.', en: 'The text block was moved or deleted while editing: the condition was not saved.' },
    'varCond.unwrapBlock': { fr: 'Défaire le bloc', en: 'Unwrap block' },
    'varCond.unwrapBlockTitle': { fr: 'Retire le cadre et la condition : le texte du bloc reste à sa place.', en: 'Removes the frame and the condition: the block’s text stays where it is.' },
    'varCond.unwrapLostBlock': { fr: 'Le bloc de texte a été déplacé ou supprimé pendant l’édition : il n’a pas été défait.', en: 'The text block was moved or deleted while editing: it was not unwrapped.' },
    'varCond.clip.pastedStatusBlock': { fr: 'Condition collée. Enregistrez pour l’appliquer au bloc de texte.', en: 'Condition pasted. Save to apply it to the text block.' },
    'condText.tag.none': { fr: 'Texte conditionnel · sans condition', en: 'Conditional text · no condition' },
    'condText.tag.if': { fr: 'Si {condition}', en: 'If {condition}' },
    'condText.tag.titleNone': { fr: 'Texte conditionnel sans condition : il s’affiche toujours. Cliquez pour choisir sa condition.', en: 'Conditional text with no condition: it always shows. Click to choose its condition.' },
    'condText.tag.titleIf': { fr: 'S’affiche si {condition}. Cliquez pour modifier sa condition.', en: 'Shown if {condition}. Click to edit its condition.' },

    // --- Valeur conditionnelle (menu des variables, onglet Chips ; js/conditional-value.js, js/editor-nodes.js:createConditionalValueNode) :
    // l'entrée du panneau, le texte d'attente et l'info-bulle de la valeur dans l'éditeur, les boutons grisés de sa barre (js/floating-toolbars.js)
    // et les variantes « valeur » de la fenêtre de condition (js/variable-condition.js) ---
    'chips.conditionalValue': { fr: 'Valeur conditionnelle', en: 'Conditional value' },
    'condValue.placeholder': { fr: 'valeur', en: 'value' },
    'condValue.titleNone': { fr: 'Valeur conditionnelle sans condition : elle s’affiche toujours. Pour choisir sa condition, cliquez dedans puis sur l’icône de condition de la barre.', en: 'Conditional value with no condition: it always shows. To choose its condition, click inside it, then the condition icon in the toolbar.' },
    'condValue.titleIf': { fr: 'S’affiche si {condition}. Pour modifier sa condition, cliquez dedans puis sur l’icône de condition de la barre.', en: 'Shown if {condition}. To edit its condition, click inside it, then the condition icon in the toolbar.' },
    'varToolbar.notForValue': { fr: 'Disponible pour une variable, pas pour une valeur conditionnelle', en: 'Available for a variable, not for a conditional value' },
    'varToolbar.loopValue': { fr: 'Disponible pour une variable liée à plusieurs lignes, pas pour une valeur conditionnelle', en: 'Available for a variable linked to several rows, not for a conditional value' },
    'varCond.introValue': { fr: 'Cette valeur n’apparaît en lecture et à l’export que si la condition est remplie. En édition, elle reste visible, entourée de pointillés.', en: 'This value only appears in read mode and in exports when the condition is met. While editing, it stays visible inside a dashed frame.' },
    'varCond.debug.currentMetValue': { fr: 'Ligne sélectionnée (n° {id}) : condition remplie, la valeur s’affiche.', en: 'Selected row (#{id}): condition met, the value is shown.' },
    'varCond.debug.currentNotMetValue': { fr: 'Ligne sélectionnée (n° {id}) : condition non remplie, la valeur est masquée.', en: 'Selected row (#{id}): condition not met, the value is hidden.' },
    'varCond.saveLostValue': { fr: 'La valeur conditionnelle a été déplacée ou supprimée pendant l’édition : la condition n’a pas été enregistrée.', en: 'The conditional value was moved or deleted while editing: the condition was not saved.' },
    'varCond.unwrapValue': { fr: 'Défaire la valeur', en: 'Unwrap value' },
    'varCond.unwrapValueTitle': { fr: 'Retire le cadre et la condition : le texte de la valeur reste à sa place.', en: 'Removes the frame and the condition: the value’s text stays where it is.' },
    'varCond.unwrapLostValue': { fr: 'La valeur conditionnelle a été déplacée ou supprimée pendant l’édition : elle n’a pas été défaite.', en: 'The conditional value was moved or deleted while editing: it was not unwrapped.' },
    'varCond.clip.pastedStatusValue': { fr: 'Condition collée. Enregistrez pour l’appliquer à la valeur.', en: 'Condition pasted. Save to apply it to the value.' },

    // --- Case conditionnelle (menu des variables, onglet Chips ; js/conditional-checkbox.js, js/editor-nodes.js:createConditionalCheckboxNode) :
    // l'entrée du panneau, le libellé et l'info-bulle de la puce dans l'éditeur, les deux boutons grisés de sa barre (js/floating-toolbars.js). La
    // fenêtre de condition a ses phrases à part (`varCond.*Checkbox`).
    'chips.conditionalCheckbox': { fr: 'Case conditionnelle', en: 'Conditional checkbox' },
    'condCheckbox.tag.none': { fr: 'sans condition', en: 'no condition' },
    'condCheckbox.tag.if': { fr: 'Si {condition}', en: 'If {condition}' },
    'condCheckbox.tag.titleNone': { fr: 'Case conditionnelle sans condition : elle reste décochée. Cliquez pour choisir sa condition.', en: 'Conditional checkbox with no condition: it stays unchecked. Click to choose its condition.' },
    'condCheckbox.tag.titleIf': { fr: 'Cochée si {condition}. Cliquez pour modifier sa condition.', en: 'Checked if {condition}. Click to edit its condition.' },
    'varToolbar.conditionCheckbox': { fr: 'Condition de la case : cochée si…', en: 'Checkbox condition: checked if…' },
    'varToolbar.linkedCheckbox': { fr: 'Disponible pour une variable, pas pour une case conditionnelle', en: 'Available for a variable, not for a conditional checkbox' },
    'varToolbar.loopCheckbox': { fr: 'Disponible pour une variable liée à plusieurs lignes, pas pour une case conditionnelle', en: 'Available for a variable linked to several rows, not for a conditional checkbox' },
    'varCond.titleCheckbox': { fr: 'Condition de la case', en: 'Checkbox condition' },
    'varCond.introCheckbox': { fr: 'Cette case est cochée en lecture et à l’export si la condition est remplie, décochée sinon. En édition, la puce reste visible, en pointillés.', en: 'This checkbox is checked in read mode and in exports when the condition is met, and unchecked otherwise. While editing, the chip stays visible with a dashed border.' },
    'varCond.modeBeforeCheckbox': { fr: 'Cocher si', en: 'Check if' },
    'varCond.debug.currentMetCheckbox': { fr: 'Ligne sélectionnée (n° {id}) : condition remplie, la case est cochée.', en: 'Selected row (#{id}): condition met, the checkbox is checked.' },
    'varCond.debug.currentNotMetCheckbox': { fr: 'Ligne sélectionnée (n° {id}) : condition non remplie, la case est décochée.', en: 'Selected row (#{id}): condition not met, the checkbox is unchecked.' },
    'varCond.saveLostCheckbox': { fr: 'La case conditionnelle a été déplacée ou supprimée pendant l’édition : la condition n’a pas été enregistrée.', en: 'The conditional checkbox was moved or deleted while editing: the condition was not saved.' },
    'varCond.clip.pastedStatusCheckbox': { fr: 'Condition collée. Enregistrez pour l’appliquer à la case.', en: 'Condition pasted. Save to apply it to the checkbox.' },

    // --- Fenêtre « Autres attributs » d'une variable (js/variable-linked-attrs.js) ---
    'varLinked.title': { fr: 'Autres attributs de « {table} »', en: 'Other attributes of “{table}”' },
    'varLinked.subtitleVia': { fr: 'Même ligne que {badge}, trouvée via {via}.', en: 'Same row as {badge}, found via {via}.' },
    'varLinked.subtitleSingleton': { fr: 'Même ligne que {badge} : toujours la même ligne de « {table} ».', en: 'Same row as {badge}: always the same row of “{table}”.' },
    'varLinked.subtitlePlain': { fr: 'Même ligne que {badge}.', en: 'Same row as {badge}.' },
    'varLinked.subtitleOtherLink': { fr: 'Dans ce document, la ligne de « {table} » est trouvée via {via} (un seul lien par table) : les attributs suivront ce lien, pas {badge}.', en: 'In this document, the row of “{table}” is found via {via} (one link per table): the attributes will follow that link, not {badge}.' },
    'varLinked.insertLost': { fr: 'La variable a été déplacée ou supprimée pendant le choix : rien n’a été inséré ni remplacé.', en: 'The variable was moved or deleted while choosing: nothing was inserted or replaced.' },
    'varLinked.filter': { fr: 'Filtrer les colonnes…', en: 'Filter columns…' },
    'varLinked.thisVariable': { fr: '· cette variable', en: '· this variable' },
    'varLinked.noteRow': { fr: 'Valeurs de la ligne sélectionnée (n° {id}).', en: 'Values for the selected row (#{id}).' },
    'varLinked.noteNoRecord': { fr: 'Aucune ligne sélectionnée dans Grist : valeurs indisponibles.', en: 'No row selected in Grist: values unavailable.' },
    'varLinked.noteNoLinkedRow': { fr: 'Aucune ligne de « {table} » liée à la ligne sélectionnée (n° {id}).', en: 'No row of “{table}” is linked to the selected row (#{id}).' },
    'varLinked.noteInsert': { fr: '« Insérer » ajoute les attributs cochés juste après la variable, séparés par une espace ; « Remplacer » les met à sa place.', en: '“Insert” adds the checked attributes right after the variable, separated by a space; “Replace” puts them in its place.' },
    'varLinked.insert': { fr: 'Insérer {count} {count|attribut|attributs}', en: 'Insert {count} {count|attribute|attributes}' },
    'varLinked.replace': { fr: 'Remplacer', en: 'Replace' },
    'varLinked.replaceTitle': { fr: 'Remplace {badge} par les attributs cochés, au lieu de les insérer après elle.', en: 'Replaces {badge} with the checked attributes instead of inserting them after it.' },
    'varLinked.empty': { fr: 'Aucune autre colonne dans « {table} ».', en: 'No other column in “{table}”.' },
    'varLinked.noFilterMatch': { fr: 'Aucune colonne ne correspond au filtre.', en: 'No column matches the filter.' },
    'varLinked.attachmentValue': { fr: '(pièce jointe)', en: '(attachment)' },
    'varLinked.subtitlePath': { fr: 'Ligne de « {table} » désignée par {path}. Les attributs insérés suivent ce chemin : aucun lien supplémentaire n’est créé.', en: 'Row of “{table}” pointed to by {path}. Inserted attributes follow this path: no extra link is created.' },
    'varLinked.noteNoPathRow': { fr: '{path} est vide pour la ligne sélectionnée (n° {id}) : aucune valeur à afficher.', en: '{path} is empty for the selected row (#{id}): no values to show.' },
    'varLinked.descend': { fr: 'Voir les colonnes de « {table} » (via {column})', en: 'Show the columns of “{table}” (via {column})' },
    'varLinked.path': { fr: 'Chemin des références', en: 'Reference path' },
    'varLinked.upTo': { fr: 'Remonter à « {table} »', en: 'Go back up to “{table}”' },
    'varLinked.inherit': { fr: 'Reprendre la condition d’affichage', en: 'Reuse the display condition' },
    'varLinked.inheritTitle': { fr: 'Chaque variable insérée, ou mise à la place de {badge}, reçoit la même condition d’affichage que {badge} : {summary}. Décochez pour les poser sans condition.', en: 'Each variable inserted, or put in place of {badge}, gets the same display condition as {badge}: {summary}. Untick to place them without a condition.' },
    'varBadge.brokenPath': { fr: 'La colonne « {column} » n’est plus atteignable depuis la table « {table} » : un maillon du chemin a disparu ou n’est plus une référence.', en: 'Column “{column}” can no longer be reached from table “{table}”: a link in the path was removed or is no longer a reference.' },

    // --- Fenêtre « Boucle » d'une variable (js/variable-loop.js ; moteur js/loop-rules.js) ---
    'varLoop.title': { fr: 'Boucle sur « {table} »', en: 'Loop over “{table}”' },
    'varLoop.intro.zone': { fr: 'et les autres variables de « {table} » placées dans la zone répétée prennent, à chaque tour, les valeurs d’une ligne. En édition, la zone reste affichée une fois, avec son repère.', en: 'and the other “{table}” variables placed in the repeated zone take the values of one row on each pass. While editing, the zone is shown once, with its marker.' },
    'varLoop.intro.inline': { fr: 'se répète pour chaque ligne liée, dans la phrase. En édition, la bulle reste seule, marquée du repère de boucle.', en: 'repeats for each linked row, within the sentence. While editing, the bubble stays single, with the loop marker.' },
    'varLoop.section.source': { fr: 'Lignes parcourues', en: 'Rows looped over' },
    'varLoop.section.repeat': { fr: 'Ce qui se répète', en: 'What repeats' },
    'varLoop.section.filter': { fr: 'Filtrer', en: 'Filter' },
    'varLoop.section.sort': { fr: 'Trier par', en: 'Sort by' },
    'varLoop.section.empty': { fr: 'Si aucune ligne', en: 'If no row' },
    'varLoop.source.link': { fr: 'Lignes de « {table} » trouvées via {via}', en: 'Rows of “{table}” found via {via}' },
    'varLoop.source.singleton': { fr: '« {table} » est liée à une seule ligne : la boucle n’en parcourt qu’une.', en: '“{table}” is linked to a single row: the loop only goes over that one.' },
    'varLoop.source.refList': { fr: 'Lignes de « {table} » listées dans {via}', en: 'Rows of “{table}” listed in {via}' },
    'varLoop.source.noLink': { fr: '« {table} » n’est plus liée à cette page : la boucle n’a aucune ligne à parcourir.', en: '“{table}” is no longer linked to this page: the loop has no rows to go over.' },
    'varLoop.repeat.row': { fr: 'La ligne du tableau', en: 'The table row' },
    'varLoop.repeat.rowMerged': { fr: 'Indisponible : une case fusionnée sur plusieurs lignes traverse cette ligne', en: 'Unavailable: a cell merged across several rows runs through this row' },
    'varLoop.repeat.cell': { fr: 'La variable, dans sa cellule', en: 'The variable, in its cell' },
    'varLoop.repeat.item': { fr: 'L’élément de liste', en: 'The list item' },
    'varLoop.repeat.inline': { fr: 'La variable, dans la phrase', en: 'The variable, in the sentence' },
    'varLoop.repeat.paragraph': { fr: 'Le paragraphe', en: 'The paragraph' },
    'varLoop.repeat.heading': { fr: 'Le titre', en: 'The heading' },
    'varLoop.separator': { fr: 'Séparateur', en: 'Separator' },
    'varLoop.lastSeparator': { fr: 'Avant le dernier', en: 'Before the last' },
    'varLoop.lastSeparatorDefault': { fr: ' et ', en: ' and ' },
    'varLoop.separatorHint': { fr: 'espaces comprises', en: 'spaces included' },
    'varLoop.filter.before': { fr: 'Garder les lignes où', en: 'Keep rows where' },
    'varLoop.filter.none': { fr: 'Sans condition : toutes les lignes liées.', en: 'No condition: all linked rows.' },
    'varLoop.sort.tableOrder': { fr: 'Ordre', en: 'Table order' },
    'varLoop.sort.listOrder': { fr: 'Ordre', en: 'List order' },
    'varLoop.sort.asc': { fr: 'croissant', en: 'ascending' },
    'varLoop.sort.desc': { fr: 'décroissant', en: 'descending' },
    'varLoop.sort.az': { fr: 'A → Z', en: 'A → Z' },
    'varLoop.sort.za': { fr: 'Z → A', en: 'Z → A' },
    'varLoop.sort.directionAria': { fr: 'Sens du tri', en: 'Sort direction' },
    'varLoop.empty.header': { fr: 'Garder l’en-tête seul', en: 'Keep the header only' },
    'varLoop.empty.rowText': { fr: 'Une ligne de texte', en: 'A row of text' },
    'varLoop.empty.none': { fr: 'Ne rien afficher', en: 'Show nothing' },
    'varLoop.empty.itemText': { fr: 'Un élément de texte', en: 'An item with text' },
    'varLoop.empty.hide': { fr: 'Masquer le paragraphe', en: 'Hide the paragraph' },
    'varLoop.empty.hideHeading': { fr: 'Masquer le titre', en: 'Hide the heading' },
    'varLoop.empty.text': { fr: 'Afficher un texte', en: 'Show a text' },
    'varLoop.empty.blank': { fr: 'Laisser vide', en: 'Leave empty' },
    'varLoop.empty.textLabel': { fr: 'Texte affiché', en: 'Text shown' },
    'varLoop.empty.textPlaceholder': { fr: 'Ex. Aucune ligne', en: 'E.g. No rows' },
    'varLoop.preview.linked': { fr: 'Ligne sélectionnée (n° {id}) : {count} {count|ligne liée|lignes liées}.', en: 'Selected row (#{id}): {count} linked {count|row|rows}.' },
    'varLoop.preview.kept': { fr: 'Ligne sélectionnée (n° {id}) : {count} {count|ligne|lignes} sur {total} {count|retenue|retenues}.', en: 'Selected row (#{id}): {count} of {total} {total|row|rows} kept.' },
    'varLoop.preview.noneLinked': { fr: 'Ligne sélectionnée (n° {id}) : aucune ligne liée.', en: 'Selected row (#{id}): no linked row.' },
    'varLoop.preview.noneKept': { fr: 'Ligne sélectionnée (n° {id}) : {total|la ligne liée n’est pas retenue|aucune des {total} lignes liées n’est retenue}.', en: 'Selected row (#{id}): {total|the linked row is not kept|none of the {total} linked rows is kept}.' },
    'varLoop.preview.noSource': { fr: 'Ligne sélectionnée (n° {id}) : la boucle ne trouve aucune ligne à parcourir depuis cette page.', en: 'Selected row (#{id}): the loop finds no rows to go over from this page.' },
    'varLoop.preview.row': { fr: 'Le tableau en affiche {count} : {values}.', en: 'The table shows {count}: {values}.' },
    'varLoop.preview.item': { fr: 'La liste en affiche {count} : {values}.', en: 'The list shows {count}: {values}.' },
    'varLoop.preview.paragraph': { fr: 'Le paragraphe se répète {count} fois : {values}.', en: 'The paragraph repeats {count} {count|time|times}: {values}.' },
    'varLoop.preview.heading': { fr: 'Le titre se répète {count} fois : {values}.', en: 'The heading repeats {count} {count|time|times}: {values}.' },
    'varLoop.preview.inline': { fr: 'La phrase affiche « {text} ».', en: 'The sentence shows “{text}”.' },
    'varLoop.effect.header': { fr: 'Le tableau garde son en-tête seul.', en: 'The table keeps its header only.' },
    'varLoop.effect.rowText': { fr: 'Le tableau affiche une ligne « {text} ».', en: 'The table shows a row “{text}”.' },
    'varLoop.effect.none': { fr: 'L’élément disparaît de la liste.', en: 'The item disappears from the list.' },
    'varLoop.effect.itemText': { fr: 'La liste affiche « {text} ».', en: 'The list shows “{text}”.' },
    'varLoop.effect.hide': { fr: 'Le paragraphe disparaît.', en: 'The paragraph disappears.' },
    'varLoop.effect.hideHeading': { fr: 'Le titre disparaît.', en: 'The heading disappears.' },
    'varLoop.effect.text': { fr: 'Le paragraphe affiche « {text} ».', en: 'The paragraph shows “{text}”.' },
    'varLoop.effect.blank': { fr: 'Le paragraphe reste vide.', en: 'The paragraph stays empty.' },
    'varLoop.effect.inlineBlank': { fr: 'La variable reste vide.', en: 'The variable stays empty.' },
    'varLoop.stats.same': { fr: 'Dans « {table} » : {count} {count|ligne retenue|lignes retenues} pour chaque ligne.', en: 'In “{table}”: {count} {count|row|rows} kept for every row.' },
    'varLoop.stats.all': { fr: 'Dans « {table} » : de {min} à {max} lignes retenues par ligne, aucune ligne sans.', en: 'In “{table}”: {min} to {max} rows kept per row, none without.' },
    'varLoop.stats.some': { fr: 'Dans « {table} » : {count} {count|ligne|lignes} sur {total} {count|a|ont} au moins une ligne retenue. Pour la ligne n° {id}, aucune : {effect}', en: 'In “{table}”: {count} of {total} {total|row|rows} {count|has|have} at least one row kept. For row #{id}, none: {effect}' },
    'varLoop.stats.none': { fr: 'Dans « {table} » : aucune des {total} lignes n’a de ligne retenue.', en: 'In “{table}”: none of the {total} rows has a row kept.' },
    'varLoop.remove': { fr: 'Retirer la boucle', en: 'Remove loop' },
    'varLoop.saveLost': { fr: 'La variable a été déplacée ou supprimée pendant l’édition : la boucle n’a pas été enregistrée.', en: 'The variable was moved or deleted while editing: the loop was not saved.' },
    // === Bulle « Calcul » (js/formula.js, js/variable-calc.js) : ligne du menu des variables, fenêtre, erreurs, barre de la bulle ===
    'chips.calc': { fr: 'Calcul', en: 'Calculation' },
    'calc.title.new': { fr: 'Insérer un calcul', en: 'Insert a calculation' },
    'calc.title.edit': { fr: 'Modifier le calcul', en: 'Edit the calculation' },
    'calc.formula.label': { fr: 'Formule', en: 'Formula' },
    'calc.formula.placeholder': { fr: 'Ex. : {trigger}Table.Prix * {trigger}Table.Quantite', en: 'e.g. {trigger}Table.Price * {trigger}Table.Quantity' },
    'calc.formula.hint': { fr: 'Tape {trigger} pour choisir une colonne. Opérations : + − * / (ou × ÷) et parenthèses ; 20 % vaut 0,2.', en: 'Type {trigger} to pick a column. Operations: + − * / (or × ÷) and brackets; 20% is 0.2.' },
    'calc.functions.label': { fr: 'Fonctions', en: 'Functions' },
    'calc.functions.hint': { fr: 'Une table liée à plusieurs lignes donne une valeur par ligne ; une fonction en fait un total : SOMME({trigger}Lignes.Prix * {trigger}Lignes.Quantite).', en: 'A table linked to several rows gives one value per row; a function turns them into a total: SUM({trigger}Lines.Price * {trigger}Lines.Quantity).' },
    'calc.fn.SUM': { fr: 'Additionne les valeurs, celles de chaque ligne liée comprises', en: 'Adds up the values, including those of every linked row' },
    'calc.fn.AVERAGE': { fr: 'Moyenne des valeurs', en: 'Average of the values' },
    'calc.fn.MIN': { fr: 'La plus petite valeur', en: 'The smallest value' },
    'calc.fn.MAX': { fr: 'La plus grande valeur', en: 'The largest value' },
    'calc.fn.COUNT': { fr: 'Nombre de valeurs (les cellules vides ne comptent pas)', en: 'Number of values (empty cells do not count)' },
    'calc.fn.ROUND': { fr: 'Arrondit une valeur : ARRONDI(valeur ; décimales)', en: 'Rounds a value: ROUND(value; decimals)' },
    'calc.status.empty': { fr: 'Écris un calcul pour en voir le résultat.', en: 'Write a calculation to see its result.' },
    'calc.status.result': { fr: 'Résultat pour la ligne courante : {value}', en: 'Result for the current row: {value}' },
    'calc.status.zero': { fr: 'Résultat pour la ligne courante : 0, que le document n’écrit pas (bouton Ø de la barre de la bulle).', en: 'Result for the current row: 0, which the document does not write (Ø button on the bubble’s bar).' },
    'calc.status.blank': { fr: 'Résultat pour la ligne courante : rien à écrire (cellules vides).', en: 'Result for the current row: nothing to write (empty cells).' },
    'calc.status.noRow': { fr: 'Aucune ligne n’est sélectionnée : le résultat s’affichera quand une ligne le sera.', en: 'No row is selected: the result will show once a row is.' },
    'calc.status.notLinked': { fr: 'La table « {table} » n’est pas encore liée à « {current} » : la clé de correspondance sera demandée à l’enregistrement.', en: 'The table “{table}” is not linked to “{current}” yet: the matching key will be asked for when saving.' },
    'calc.status.inLoop': { fr: 'Dans une zone répétée, « {table} » donne la ligne de chaque tour : le résultat se voit en Lecture.', en: 'In a repeated zone, “{table}” gives the row of each turn: the result shows in Reading mode.' },
    'calc.error.unknownColumn': { fr: '« {text} » n’est pas une colonne de ce document : choisis-la dans la liste qui s’ouvre après {trigger}.', en: '“{text}” is not a column of this document: pick it from the list that opens after {trigger}.' },
    'formula.error.empty': { fr: 'Le calcul est vide.', en: 'The calculation is empty.' },
    'formula.error.unclosedBrace': { fr: 'Les accolades ne s’écrivent pas : choisis une colonne avec {trigger}.', en: 'Curly brackets are not typed: pick a column with {trigger}.' },
    'formula.error.badKey': { fr: '« {key} » n’est pas un nom de colonne : choisis la colonne avec {trigger}.', en: '“{key}” is not a column name: pick the column with {trigger}.' },
    'formula.error.comma': { fr: 'Entre deux valeurs, écris « ; » et non une virgule : SOMME(2 ; 3). Une décimale s’écrit 0,2.', en: 'Between two values, write “;” rather than a comma: SUM(2; 3). A decimal is written 0.2.' },
    'formula.error.badChar': { fr: 'Caractère non reconnu : « {char} ».', en: 'Unrecognized character: “{char}”.' },
    'formula.error.unexpectedEnd': { fr: 'Le calcul se termine trop tôt : il manque une valeur.', en: 'The calculation ends too soon: a value is missing.' },
    'formula.error.tooDeep': { fr: 'Trop de parenthèses ou de fonctions imbriquées.', en: 'Too many nested brackets or functions.' },
    'formula.error.unclosedParen': { fr: 'Une parenthèse n’est pas refermée.', en: 'A bracket is not closed.' },
    'formula.error.unknownName': { fr: '« {name} » n’est ni une colonne ni une fonction : pour une colonne, tape {trigger} puis son nom.', en: '“{name}” is neither a column nor a function: for a column, type {trigger} then its name.' },
    'formula.error.unknownFunction': { fr: 'Fonction inconnue : « {name} ». Disponibles : {list}.', en: 'Unknown function: “{name}”. Available: {list}.' },
    'formula.error.badArgsMin': { fr: '{name} attend au moins une valeur.', en: '{name} needs at least one value.' },
    'formula.error.badArgsRound': { fr: '{name} attend une valeur et, si tu veux, un nombre de décimales : {name}(valeur ; 2).', en: '{name} takes a value and, optionally, a number of decimals: {name}(value; 2).' },
    'formula.error.unexpected': { fr: 'Ce calcul ne se lit pas à « {token} ».', en: 'This calculation cannot be read at “{token}”.' },
    'formula.error.badRound': { fr: 'Le nombre de décimales d’un arrondi est un entier de −10 à 10.', en: 'The number of decimals of a rounding is a whole number from −10 to 10.' },
    'formula.error.notNumber': { fr: '« {key} » contient « {text} », qui n’est pas un nombre.', en: '“{key}” holds “{text}”, which is not a number.' },
    'formula.error.dateColumn': { fr: '« {key} » est une date, pas un nombre : elle ne peut pas entrer dans un calcul.', en: '“{key}” is a date, not a number: it cannot be part of a calculation.' },
    'formula.error.attachments': { fr: '« {key} » contient des pièces jointes, pas des nombres.', en: '“{key}” holds attachments, not numbers.' },
    'formula.error.unknownVariable': { fr: '« {key} » n’a pas pu être lue.', en: '“{key}” could not be read.' },
    'formula.error.divZero': { fr: 'Division par zéro.', en: 'Division by zero.' },
    'formula.error.manyValues': { fr: 'Ce calcul donne {count} valeurs (une par ligne liée) : utilise SOMME, MOYENNE, MIN, MAX ou NB pour n’en faire qu’un nombre.', en: 'This calculation gives {count} values (one per linked row): use SUM, AVERAGE, MIN, MAX or COUNT to make it a single number.' },
    'formula.error.lengthMismatch': { fr: 'Deux listes de lignes n’ont pas la même longueur ({a} et {b}) : elles ne viennent pas de la même table liée.', en: 'Two row lists differ in length ({a} and {b}): they do not come from the same linked table.' },
    'formula.error.badResult': { fr: 'Le résultat n’est pas un nombre.', en: 'The result is not a number.' },
    'formula.error.failed': { fr: 'calcul impossible', en: 'calculation failed' },
    'formula.error.unknownTable': { fr: 'La table « {table} » n’existe plus dans ce document.', en: 'The table “{table}” no longer exists in this document.' },
    'formula.error.unknownColumn': { fr: 'La colonne « {column} » n’est plus atteignable depuis la table « {table} ».', en: 'The column “{column}” can no longer be reached from the table “{table}”.' },
    'varToolbar.calcEdit': { fr: 'Modifier le calcul', en: 'Edit the calculation' },
    'varToolbar.notForCalc': { fr: 'Disponible pour une variable, pas pour un calcul', en: 'Available for a variable, not for a calculation' },
    // Bouton « Colonne… » (js/variable-column.js) : n'est dans la barre que d'une variable cassée (renommée ou supprimée dans Grist), pour choisir la bonne colonne.
    'varToolbar.columnBroken': { fr: 'Cette variable ne trouve plus sa colonne : choisir la bonne…', en: 'This variable can no longer find its column: pick the right one…' },
    // Suivi des renommages de Grist (js/schema-renames.js) : le coin d'état, une fois les modèles réécrits.
    'schemaRenames.status': { fr: 'Mis à jour après un renommage dans Grist : {parts}.', en: 'Updated after a rename in Grist: {parts}.' },
    'schemaRenames.part.variables': { fr: '{count} {count|variable|variables} dans {models} {models|modèle|modèles}', en: '{count} {count|variable|variables} in {models} {models|template|templates}' },
    'schemaRenames.part.links': { fr: '{count} {count|clé de correspondance|clés de correspondance}', en: '{count} matching {count|key|keys}' },
    // Avertissement d'ouverture (js/settings-columns.js) : un réglage Accès ou Selon la ligne cite une colonne, ou la table des droits, qui n'existe
    // plus dans Grist. Le titre est celui de l'onglet.
    'settingsColumns.quoted': { fr: '« {name} »', en: '“{name}”' },
    'settingsColumns.part.columns': { fr: '{title} : {count|la colonne|les colonnes} {names} {count|n’existe|n’existent} plus.', en: '{title}: {count|the column|the columns} {names} {count|no longer exists|no longer exist}.' },
    'settingsColumns.part.table': { fr: '{title} : la table « {name} » n’existe plus.', en: '{title}: the table “{name}” no longer exists.' },
    'settingsColumns.status': { fr: '{parts} À re-choisir dans les Réglages.', en: '{parts} Choose again in Settings.' },
    // Liste d'une variable (js/variable-list.js, bouton « Liste » de la barre d'une bulle) : une colonne Liste de choix ou Liste de références écrit
    // toutes ses valeurs (avec le séparateur voulu), la première, la dernière ou la n-ième. Les séparateurs sont ceux des boucles (« Séparateur »,
    // « Avant la dernière »).
    'varToolbar.list': { fr: 'Liste : quelles valeurs écrire', en: 'List: which values to write' },
    'varToolbar.listDisabled': { fr: 'Disponible pour une colonne Liste de choix ou Liste de références', en: 'Available for a Choice List or Reference List column' },
    'varToolbar.listLoop': { fr: 'La boucle écrit déjà chaque valeur de la liste : retirez-la pour régler la liste', en: 'The loop already writes every value of the list: remove it to set the list' },
    'varToolbar.listBlock': { fr: 'Disponible pour une variable, pas pour un bloc de texte', en: 'Available for a variable, not for a text block' },
    'varToolbar.listCheckbox': { fr: 'Disponible pour une variable, pas pour une case conditionnelle', en: 'Available for a variable, not for a conditional checkbox' },
    'varList.title': { fr: 'Liste', en: 'List' },
    'varList.intro.choice': { fr: 'contient plusieurs choix. Réglez ce que le document en écrit.', en: 'holds several choices. Set what the document writes from it.' },
    'varList.intro.ref': { fr: 'contient plusieurs lignes de « {table} ». Réglez ce que le document en écrit.', en: 'holds several rows of “{table}”. Set what the document writes from it.' },
    'varList.section.pick': { fr: 'Afficher', en: 'Show' },
    'varList.pick.all': { fr: 'Toutes les valeurs', en: 'All values' },
    'varList.pick.first': { fr: 'La première', en: 'The first' },
    'varList.pick.last': { fr: 'La dernière', en: 'The last' },
    'varList.pick.nth': { fr: 'La n-ième', en: 'The nth' },
    'varList.separator': { fr: 'Séparateur', en: 'Separator' },
    'varList.lastSeparator': { fr: 'Avant la dernière', en: 'Before the last' },
    'varList.lastSeparatorPlaceholder': { fr: 'comme le séparateur', en: 'same as separator' },
    'varList.separatorHint': { fr: 'espaces comprises', en: 'spaces included' },
    'varList.number': { fr: 'Numéro', en: 'Number' },
    'varList.numberHint': { fr: '1 = la première valeur. Sans valeur à ce rang, rien n’est écrit.', en: '1 = the first value. With no value at that position, nothing is written.' },
    'varList.preview.empty': { fr: 'Ligne sélectionnée (n° {id}) : la liste est vide, le document n’écrit rien.', en: 'Selected row (#{id}): the list is empty, the document writes nothing.' },
    'varList.preview.values': { fr: 'Ligne sélectionnée (n° {id}) : {count} {count|valeur|valeurs} ({values}). Le document écrit « {text} ».', en: 'Selected row (#{id}): {count} {count|value|values} ({values}). The document writes “{text}”.' },
    'varList.preview.beyond': { fr: 'Ligne sélectionnée (n° {id}) : {count} {count|valeur|valeurs} ({values}), mais pas de valeur n° {index} : le document n’écrit rien.', en: 'Selected row (#{id}): {count} {count|value|values} ({values}), but no value #{index}: the document writes nothing.' },
    'varList.reset': { fr: 'Remettre par défaut', en: 'Reset to default' },
    'varList.saveLost': { fr: 'La variable a été déplacée ou supprimée pendant l’édition : le réglage de la liste n’a pas été enregistré.', en: 'The variable was moved or deleted while editing: the list setting was not saved.' },
    'varList.split.label': { fr: 'Un document par valeur', en: 'One document per value' },
    'varList.split.hint': { fr: 'Exports PDF, Word et Excel seulement.', en: 'PDF, Word and Excel exports only.' },
    'varList.split.preview': { fr: 'Export : {count} documents, un par valeur ({values}).', en: 'Export: {count} documents, one per value ({values}).' },
    'varList.split.previewSingle': { fr: 'Export : un seul document, cette ligne n’a qu’une valeur.', en: 'Export: a single document, this row has only one value.' },
    'varList.split.previewEmpty': { fr: 'Export : un seul document, la liste de cette ligne est vide.', en: 'Export: a single document, the list of this row is empty.' },
    'confirm.splitNote': { fr: 'Une variable de liste est réglée « Un document par valeur » : cela fait {documents} {documents|document|documents} en tout.', en: 'A list variable is set to “One document per value”: that makes {documents} {documents|document|documents} in all.' },
    // Export d'une seule ligne de beaucoup de documents (js/main.js, SPLIT_CONFIRM_FROM), sinon sans question ; son titre est `varList.split.label`.
    'confirm.splitExport': { fr: 'Cette ligne fait {documents} {documents|document|documents}, un par valeur des listes réglées « Un document par valeur ». Générer l’archive ?', en: 'This row makes {documents} {documents|document|documents}, one per value of the lists set to “One document per value”. Generate the archive?' },
    'status.splitMergedDone': { fr: '{ok} {ok|document réuni|documents réunis} dans un seul PDF — fichier téléchargé.', en: '{ok} {ok|document|documents} combined into a single PDF — file downloaded.' },
    'status.splitMergedDoneWithFailures': { fr: '{ok} {ok|document réuni|documents réunis} dans un seul PDF, {failed} {failed|échec|échecs} (voir la console) — fichier téléchargé.', en: '{ok} {ok|document|documents} combined into a single PDF, {failed} {failed|failure|failures} (see console) — file downloaded.' },
    'status.splitSheetsDone': { fr: '{ok} {ok|document placé|documents placés} sur {sheets} {sheets|feuille|feuilles} — fichier téléchargé.', en: '{ok} {ok|document|documents} placed on {sheets} {sheets|sheet|sheets} — file downloaded.' },
    'status.splitSheetsDoneWithFailures': { fr: '{ok} {ok|document placé|documents placés} sur {sheets} {sheets|feuille|feuilles}, {failed} {failed|échec|échecs} (voir la console) — fichier téléchargé.', en: '{ok} {ok|document|documents} placed on {sheets} {sheets|sheet|sheets}, {failed} {failed|failure|failures} (see console) — file downloaded.' },
    'status.splitSingleWorkbookDone': { fr: '{ok} {ok|document réuni|documents réunis} dans un seul classeur Excel — fichier téléchargé.', en: '{ok} {ok|document|documents} combined into a single Excel workbook — file downloaded.' },
    'status.splitSingleWorkbookDoneWithFailures': { fr: '{ok} {ok|document réuni|documents réunis} dans un seul classeur Excel, {failed} {failed|échec|échecs} (voir la console) — fichier téléchargé.', en: '{ok} {ok|document|documents} combined into a single Excel workbook, {failed} {failed|failure|failures} (see console) — file downloaded.' },
    // --- Images qu'un export n'a pas pu lire : leur nombre s'écrit avant l'état de fin d'export (js/main.js:setExportDoneStatus) ---
    'status.imagesUnread': { fr: '{n} {n|image introuvable|images introuvables} (voir la console).', en: '{n} missing {n|image|images} (see console).' },
    // --- Premier contact : le widget ouvert hors de Grist, un réseau qui bloque une adresse, un démarrage interrompu (js/first-contact.js) ---
    'firstContact.reload': { fr: 'Recharger la page', en: 'Reload the page' },
    'firstContact.keepWaiting': { fr: 'Continuer d’attendre', en: 'Keep waiting' },
    'firstContact.technical': { fr: 'Message technique', en: 'Technical message' },
    'firstContact.copy': { fr: 'Copier', en: 'Copy' },
    'firstContact.copied': { fr: 'Copié', en: 'Copied' },
    'firstContact.outside.title': { fr: 'Ce widget s’ouvre dans Grist', en: 'This widget opens inside Grist' },
    'firstContact.outside.intro': { fr: 'Publipostage+ est un widget personnalisé pour Grist : il ne fonctionne pas seul dans un onglet du navigateur. Pour l’utiliser :', en: 'Publipostage+ is a custom widget for Grist: it does not work on its own in a browser tab. To use it:' },
    'firstContact.outside.step1': { fr: 'Dans une page Grist, ajoutez un widget personnalisé et collez cette adresse :', en: 'In a Grist page, add a custom widget and paste this address:' },
    'firstContact.outside.step2': { fr: 'Dans le panneau du widget, réglez « Sélectionner par » (Select by) sur la table dont les lignes servent de source de données.', en: 'In the widget’s panel, set “Select by” to the table whose rows are the data source.' },
    'firstContact.outside.step3': { fr: 'Accordez-lui l’accès complet au document quand Grist le demande.', en: 'Grant it full access to the document when Grist asks.' },
    'firstContact.outside.readme': { fr: 'Lire l’installation', en: 'Read the installation guide' },
    'firstContact.network.title': { fr: 'Le widget n’a pas pu se charger', en: 'The widget could not load' },
    'firstContact.network.intro': { fr: 'Publipostage+ télécharge ses composants depuis quelques adresses publiques, et votre réseau (pare-feu, proxy) en bloque sans doute une. Demandez à votre service informatique d’autoriser :', en: 'Publipostage+ downloads its components from a few public addresses, and your network (firewall, proxy) is probably blocking one of them. Ask your IT department to allow:' },
    'firstContact.network.then': { fr: 'Rechargez ensuite la page.', en: 'Then reload the page.' },
    'firstContact.network.list': { fr: 'La liste complète des adresses est dans le README.', en: 'The full list of addresses is in the README.' },
    'firstContact.slow.title': { fr: 'Le chargement est long', en: 'Loading is taking a while' },
    'firstContact.slow.intro': { fr: 'Le widget n’a pas fini de démarrer. Une connexion lente peut suffire ; sinon, votre réseau (pare-feu, proxy) bloque sans doute l’une de ces adresses :', en: 'The widget has not finished starting. A slow connection may be enough; otherwise your network (firewall, proxy) is probably blocking one of these addresses:' },
    'firstContact.host.editor': { fr: 'l’éditeur de texte, nécessaire au démarrage', en: 'the text editor, needed to start' },
    'firstContact.host.grist': { fr: 'l’API de Grist, nécessaire au démarrage', en: 'the Grist API, needed to start' },
    'firstContact.host.exports': { fr: 'les exports PDF, Word et Excel, au premier export', en: 'PDF, Word and Excel exports, on first export' },
    'firstContact.error.title': { fr: 'Le widget n’a pas pu démarrer', en: 'The widget could not start' },
    'firstContact.error.intro': { fr: 'Une erreur a arrêté le démarrage. Rechargez la page ; si elle revient, joignez le message technique ci-dessous à votre signalement.', en: 'An error stopped the widget from starting. Reload the page; if it comes back, include the technical message below when you report it.' },
  };

  // Langue au premier lancement : celle que la personne a choisie dans Réglages (enregistrée), sinon la première langue du navigateur parmi le français
  // et l'anglais, l'anglais quand il n'en propose aucune des deux, le français quand il ne dit rien. Le choix n'est enregistré qu'à un changement dans
  // Réglages : un navigateur remis en anglais, ou en français, est suivi tant que la personne n'a rien choisi.
  function initialLang() {
    let stored = null;
    try { stored = localStorage.getItem('pp_lang'); } catch (e) { /* stockage indisponible : on suit le navigateur */ }
    if (stored === 'fr' || stored === 'en') return stored;
    const asked = typeof navigator === 'undefined' ? [] : (navigator.languages && navigator.languages.length ? Array.from(navigator.languages) : [navigator.language]).filter(Boolean);
    for (const tag of asked) {
      const code = String(tag).toLowerCase().split('-')[0];
      if (code === 'fr' || code === 'en') return code;
    }
    return asked.length ? 'en' : 'fr';
  }

  let lang = initialLang();

  // Pluriel sans parenthèses : `{n|forme au singulier|forme au pluriel}` prend l'une ou l'autre selon la valeur de la variable `n` (règles de la
  // langue : en français 0 et 1 sont au singulier, en anglais seul 1) - « {count} {count|ligne trouvée|lignes trouvées} » donne « 1 ligne trouvée »,
  // « 3 lignes trouvées ». Une forme peut contenir d'autres `{variable}` ou un autre pluriel. Traité avant les variables simples, pour que le texte
  // d'une variable (nom de colonne, valeur saisie) ne soit jamais lu comme un pluriel.
  const pluralRules = {};
  function expandPlurals(s, vars) {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) return out + s.slice(i);
      out += s.slice(i, open);
      const head = /^\{(\w+)\|/.exec(s.slice(open));
      if (!head || !vars || !(head[1] in vars)) { out += '{'; i = open + 1; continue; }
      let depth = 0;
      let split = -1;
      let close = -1;
      for (let j = open; j < s.length && close < 0; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') { if (--depth === 0) close = j; }
        else if (s[j] === '|' && depth === 1 && j >= open + head[0].length && split < 0) split = j;
      }
      if (close < 0 || split < 0) { out += '{'; i = open + 1; continue; }
      const rules = pluralRules[lang] || (pluralRules[lang] = new Intl.PluralRules(lang));
      const chosen = rules.select(Number(vars[head[1]])) === 'one' ? s.slice(open + head[0].length, split) : s.slice(split + 1, close);
      out += expandPlurals(chosen, vars);
      i = close + 1;
    }
    return out;
  }

  function t(key, vars) {
    const entry = STRINGS[key];
    if (!entry) { console.warn('[I18n] clé inconnue :', key); return key; }
    if (!entry[lang]) console.warn('[I18n] traduction "' + lang + '" manquante pour "' + key + '" (repli FR).');
    let s = entry[lang] || entry.fr;
    if (vars) {
      s = expandPlurals(s, vars);
      Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
    }
    return s;
  }

  function getLang() { return lang; }

  // Abonnés notifiés après chaque changement de langue. Nécessaire pour les libellés qu'aucun attribut data-i18n-* ne peut porter parce qu'ils se
  // composent à l'exécution (ex. l'infobulle « Enregistrer (⌘S) » du bouton Enregistrer, dont le raccourci dépend de la plateforme) : sans ce
  // crochet, applyTranslations() les réécrirait à leur version brute au premier changement de langue.
  const changeListeners = [];
  function onChange(fn) { if (typeof fn === 'function') changeListeners.push(fn); }

  function setLang(next) {
    lang = next === 'en' ? 'en' : 'fr';
    try { localStorage.setItem('pp_lang', lang); } catch (e) { /* stockage indisponible : la langue ne survivra pas au rechargement */ }
    document.documentElement.lang = lang;
    applyTranslations();
    changeListeners.forEach(fn => { try { fn(lang); } catch (e) { console.warn('[I18n] un abonné au changement de langue a levé une exception', e); } });
  }

  // Parcourt le DOM (ou un sous-arbre `root`, ex. un nœud injecté après coup par un module qui ne connaît pas I18n) et applique les 4 variantes
  // d'attribut de traduction déclarative - le texte français d'origine reste en dur dans le HTML comme repli si ce fichier n'a pas encore chargé.
  function applyTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
    scope.querySelectorAll('[data-i18n-tip]').forEach(el => { el.setAttribute('data-tip', t(el.getAttribute('data-i18n-tip'))); });
    scope.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
  }

  // Applique tout de suite (pas seulement lors d'un futur setLang) : ce script est placé après tout le HTML du bandeau/des modales (les <script> sont
  // en fin de <body>), donc le DOM à traduire existe déjà - un utilisateur ayant déjà choisi EN voit l'anglais dès l'ouverture, pas après avoir
  // rouvert Réglages.
  document.documentElement.lang = lang;
  applyTranslations();

  return { t, getLang, setLang, applyTranslations, onChange };
})();
