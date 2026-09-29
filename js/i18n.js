// Traduction FR/EN de l'interface (panneau Réglages > Langue) - IIFE classique, chargée en tout premier (avant variable-format.js/variables.js/editor.js/
// main.js/settings.js) pour qu'ils lisent I18n.getLang()/I18n.t() comme un global nu déjà prêt, même schéma de dépendance implicite par ordre de <script>.
//
// MAINTENANCE (demande explicite) : chaque entrée porte fr ET en côte à côte dans le même objet littéral - impossible de modifier l'un sans voir l'autre.
// `t()` avertit en console (pas d'échec silencieux) si une traduction 'en' manque - filet de sécurité si un futur texte français ajouté sans son pendant.
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
    'toolbar.newFromTemplate': { fr: 'Créer à partir d’un modèle…', en: 'Create from a template…' },
    'toolbar.save': { fr: 'Enregistrer', en: 'Save' },
    'toolbar.saveAs': { fr: 'Enregistrer sous (copie)', en: 'Save as (copy)' },
    'toolbar.delete': { fr: 'Supprimer', en: 'Delete' },
    'toolbar.linkRules.tip': { fr: 'Tables liées (correspondance #Variable)', en: 'Linked tables (#Variable matching)' },
    'toolbar.linkRules.aria': { fr: 'Tables liées (correspondance pour #Variable d’une autre table)', en: 'Linked tables (matching for #Variable from another table)' },
    'toolbar.modeEdit': { fr: 'Mode édition', en: 'Edit mode' },
    'toolbar.modeRead': { fr: 'Mode lecture', en: 'Read mode' },
    'toolbar.a4.tip': { fr: 'Aperçu A4', en: 'A4 preview' },
    'toolbar.a4.aria': { fr: 'Aperçu A4 — limite la largeur de l’éditeur à celle du contenu d’une page A4, pour que le texte se répartisse comme dans le PDF.', en: 'A4 preview — limits the editor width to that of an A4 page’s content, so text wraps the same way as in the PDF.' },
    'toolbar.autosave.tip': { fr: 'Enregistrement automatique', en: 'Auto-save' },
    'toolbar.autosave.aria': { fr: 'Enregistrement automatique — enregistre le modèle toutes les ~2,5 secondes pendant que vous éditez. Désactiver si vous préférez enregistrer vous-même.', en: 'Auto-save — saves the template roughly every 2.5 seconds while you edit. Turn off if you prefer to save manually.' },
    'toolbar.quality.tip': { fr: 'Qualité PDF', en: 'PDF quality' },
    'toolbar.quality.aria': { fr: 'Qualité d’export PDF', en: 'PDF export quality' },
    'toolbar.exportPdf': { fr: 'Exporter en PDF', en: 'Export to PDF' },
    'toolbar.exportPdfBatch': { fr: 'Exporter toutes les lignes (ZIP)…', en: 'Export all rows (ZIP)…' },
    'toolbar.exportPdfMerged': { fr: 'Exporter toutes les lignes en un seul PDF…', en: 'Export all rows as a single PDF…' },
    'toolbar.exportDocx': { fr: 'Exporter en DOCX (bêta)…', en: 'Export to DOCX (beta)…' },
    'toolbar.exportDocxBatch': { fr: 'Exporter toutes les lignes en DOCX (ZIP)…', en: 'Export all rows to DOCX (ZIP)…' },
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
    'insert.pageBreak.tip': { fr: 'Saut de page', en: 'Page break' },
    'insert.pageBreak.aria': { fr: 'Insérer un saut de page (forcé à l’export PDF)', en: 'Insert a page break (forced on PDF export)' },
    'insert.toc.tip': { fr: 'Insérer un sommaire', en: 'Insert a table of contents' },
    'insert.toc.aria': { fr: 'Insérer un sommaire (généré à partir des titres)', en: 'Insert a table of contents (generated from headings)' },
    'insert.comment.tip': { fr: 'Commenter la sélection', en: 'Comment on selection' },
    'insert.comment.aria': { fr: 'Ajouter un commentaire sur le texte sélectionné', en: 'Add a comment on the selected text' },
    // Réutilise le nœud blockquote existant (déjà géré en PDF/DOCX, cf. js/pdf-export.js) - seul le bouton manquait (retour Antoine, 2026-09-28).
    'insert.citation.tip': { fr: 'Citation', en: 'Quote' },
    'insert.citation.aria': { fr: 'Insérer une citation', en: 'Insert a quote' },
    'insert.variable.tip': { fr: 'Insérer une variable', en: 'Insert a variable' },
    'insert.variable.aria': { fr: 'Insérer une variable (#Variable ou chip)', en: 'Insert a variable (#Variable or chip)' },

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
    'macro.modal.valuePlaceholderBool': { fr: 'Valeur (Oui / Non)', en: 'Value (Yes / No)' },
    'macro.modal.valueChoosePlaceholder': { fr: '— Choisir une valeur —', en: '— Choose a value —' },
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
    'status.macroSaved': { fr: 'Macro-modèle enregistré.', en: 'Macro template saved.' },

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
    'settings.access.intro': {
      fr: 'Droits par personne, lus dans une table du document : une ligne par personne, repérée par son email Grist, et une case à cocher par droit.',
      en: 'Per-person rights, read from a table in the document: one row per person, matched by their Grist email, and one checkbox per right.',
    },
    'settings.access.table': { fr: 'Table des droits', en: 'Rights table' },
    'settings.access.email': { fr: 'Colonne email', en: 'Email column' },
    'settings.access.readOnly': { fr: 'Lecture seule', en: 'Read-only' },
    'settings.access.export': { fr: 'Export autorisé', en: 'Export allowed' },
    'settings.access.comments': { fr: 'Commentaires autorisés', en: 'Comments allowed' },
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
    'settings.credits.author': { fr: 'Auteur', en: 'Author' },
    'settings.credits.website': { fr: 'Site', en: 'Website' },
    'settings.credits.license': { fr: 'Licence', en: 'License' },
    'settings.credits.bio': { fr: 'Bio', en: 'Bio' },
    'settings.credits.bioText': {
      fr: 'Grist Factory conçoit des widgets libres pour Grist. Publipostage+ en est un : rédiger contrats, factures et courriers à partir de vos données, sans écrire une ligne de code.',
      en: 'Grist Factory builds free and open-source widgets for Grist. Publipostage+ is one of them: write contracts, invoices and letters straight from your data, without a single line of code.',
    },

    // --- Mode Lecture (js/reader-mode.js:render) : état vide (aucune ligne sélectionnée) et avertissement quand une variable n'a pas pu être résolue ---
    'reader.empty.title': { fr: 'Aucune ligne sélectionnée', en: 'No row selected' },
    'reader.empty.hint': { fr: 'Sélectionnez une ligne dans la table Grist pour voir le document avec ses données.', en: 'Select a row in the Grist table to see the document filled with its data.' },
    'reader.unresolvedVariables': { fr: 'Attention : certaines variables n’ont pas pu être résolues.', en: 'Warning: some variables could not be resolved.' },

    // --- Messages de statut (js/main.js:setStatus) ---
    'status.ready': { fr: 'Widget prêt.', en: 'Widget ready.' },
    'status.readyReadOnly': { fr: 'Widget prêt, en lecture seule.', en: 'Widget ready, read-only.' },
    'status.readOnly': { fr: 'Lecture seule.', en: 'Read-only.' },
    'status.gristApiError': { fr: 'Erreur init API Grist.', en: 'Error initializing Grist API.' },
    // init() (js/main.js) n'a de filet QUE sur TemplateTreeSelect.attach() : une exception ailleurs (rare,
    // mais déjà vu le 2026-09-28 avec l'arbre de rangement) bloquait tout le reste - Enregistrer, Ctrl+S,
    // l'auto-save - sans le moindre message, seule la console (jamais consultée par Antoine) montrait la
    // cause. init().catch(...) affiche maintenant l'erreur ici plutôt que de laisser le widget muet.
    'status.initError': { fr: 'Erreur au chargement du widget : {message}', en: 'Error loading the widget: {message}' },
    'status.templateNameRequired': { fr: 'Nom du modèle requis.', en: 'Template name required.' },
    // Coin "info" (#status-msg) piloté par l'état RÉEL de sauvegarde (cf. js/main.js:updateSaveStatus) plutôt que par le dernier événement quel qu'il
    // soit : affiché uniquement quand tout ce qui a été tapé est bien enregistré, vide sinon (frappe non enregistrée, brouillon jamais enregistré, conflit).
    'status.savedAt': { fr: 'Enregistré à {time}.', en: 'Saved at {time}.' },
    // Cas "brouillon jamais enregistré" de updateSaveStatus() (Templates.getCurrentId() encore null) : sans ce message, le coin "info" restait
    // simplement vide et rien n'expliquait pourquoi l'auto-save (qui ne crée jamais de modèle, cf. main.js:autosaveTick "if (!id) return") ne faisait
    // rien pendant que l'utilisateur tapait. Même style d'alerte que templateNameRequired ci-dessus (même cause réelle : pas encore de nom/ligne Grist).
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
    'status.currentTableNotFound': { fr: 'Table courante introuvable.', en: 'Current table not found.' },
    'status.cannotReadRows': { fr: 'Impossible de lire les lignes de la table.', en: 'Unable to read the table’s rows.' },
    'status.noRowsInTable': { fr: 'Aucune ligne dans la table « {table} ».', en: 'No rows in table “{table}”.' },
    'status.loadingPdfLibs': { fr: 'Chargement des bibliothèques PDF...', en: 'Loading PDF libraries...' },
    'status.pdfLibsLoadError': { fr: 'Échec de chargement des bibliothèques PDF.', en: 'Failed to load PDF libraries.' },
    'status.batchExportProgress': { fr: 'Export PDF en lot : {current}/{total}...', en: 'Batch PDF export: {current}/{total}...' },
    'status.exportError': { fr: 'Échec de l’export : aucun PDF généré.', en: 'Export failed: no PDF generated.' },
    'status.zipCompressing': { fr: 'Compression de l’archive ZIP...', en: 'Compressing the ZIP archive...' },
    'status.batchExportDoneWithFailures': { fr: '{ok} PDF générés, {failed} {failed|échec|échecs} (voir la console) — archive ZIP téléchargée.', en: '{ok} PDFs generated, {failed} {failed|failure|failures} (see console) — ZIP archive downloaded.' },
    'status.batchExportDone': { fr: '{ok} PDF générés — archive ZIP téléchargée.', en: '{ok} PDFs generated — ZIP archive downloaded.' },
    // Export DOCX de toutes les lignes (ZIP) : mêmes messages que le lot PDF, avec le bon format (avant le 29/09, il annonçait des PDF).
    'status.loadingExportLibs': { fr: 'Chargement des bibliothèques d’export...', en: 'Loading export libraries...' },
    'status.exportLibsLoadError': { fr: 'Échec de chargement des bibliothèques d’export.', en: 'Failed to load export libraries.' },
    'status.batchExportProgressDocx': { fr: 'Export DOCX en lot : {current}/{total}...', en: 'Batch DOCX export: {current}/{total}...' },
    'status.exportErrorDocx': { fr: 'Échec de l’export : aucun DOCX généré.', en: 'Export failed: no DOCX generated.' },
    'status.batchExportDoneWithFailuresDocx': { fr: '{ok} DOCX générés, {failed} {failed|échec|échecs} (voir la console) — archive ZIP téléchargée.', en: '{ok} DOCX files generated, {failed} {failed|failure|failures} (see console) — ZIP archive downloaded.' },
    'status.batchExportDoneDocx': { fr: '{ok} DOCX générés — archive ZIP téléchargée.', en: '{ok} DOCX files generated — ZIP archive downloaded.' },
    'status.pdfMerging': { fr: 'Assemblage du PDF unique...', en: 'Assembling the single PDF...' },
    'status.mergedExportDoneWithFailures': { fr: '{ok} lignes réunies dans un seul PDF, {failed} {failed|échec|échecs} (voir la console) — fichier téléchargé.', en: '{ok} rows combined into a single PDF, {failed} {failed|failure|failures} (see console) — file downloaded.' },
    'status.mergedExportDone': { fr: '{ok} lignes réunies dans un seul PDF — fichier téléchargé.', en: '{ok} rows combined into a single PDF — file downloaded.' },
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

    // --- Confirmations / invites (main.js) ; titres des fenêtres de saisie et de confirmation (js/dialogs.js), qui prennent aussi les textes des clés voisines ---
    'dialog.imageUrl.title': { fr: 'Insérer une image', en: 'Insert an image' },
    'dialog.newTable.title': { fr: 'Nouvelle table Grist', en: 'New Grist table' },
    'dialog.newFolder.title': { fr: 'Nouveau dossier', en: 'New folder' },
    'dialog.moveFolder.title': { fr: 'Déplacer vers un dossier', en: 'Move to a folder' },
    'dialog.emailTooLong.title': { fr: 'Email trop long', en: 'Email too long' },
    'dialog.batchExport.title': { fr: 'Exporter toutes les lignes', en: 'Export all rows' },
    'alert.noRecordForExport': { fr: 'Aucune ligne sélectionnée : impossible d’exporter en PDF.', en: 'No row selected: cannot export to PDF.' },
    'confirm.deleteTemplate': { fr: 'Supprimer ce modèle ?', en: 'Delete this template?' },
    'confirm.batchExport': { fr: 'Générer un PDF pour chacune des {count} lignes de « {table} » et les regrouper dans une archive ZIP ?', en: 'Generate a PDF for each of the {count} rows in “{table}” and bundle them into a ZIP archive?' },
    'confirm.batchExportDocx': { fr: 'Générer un DOCX pour chacune des {count} lignes de « {table} » et les regrouper dans une archive ZIP ?', en: 'Generate a DOCX for each of the {count} rows in “{table}” and bundle them into a ZIP archive?' },
    'confirm.mergedExport': { fr: 'Générer un PDF pour chacune des {count} lignes de « {table} » et les réunir dans un seul fichier PDF, chaque ligne commençant sur une nouvelle page ?', en: 'Generate a PDF for each of the {count} rows in “{table}” and combine them into a single PDF file, each row starting on a new page?' },
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
    // Même liste avec recherche pour une TABLE (Réglages > Accès), un MODÈLE (macro-modèle) et une VALEUR possible d'une colonne (champ Valeur d'une règle) :
    // SearchSelect.attachTables / attachTemplates / attachValues.
    'searchSelect.searchTables': { fr: 'Rechercher une table…', en: 'Search for a table…' },
    'searchSelect.noTableMatch': { fr: 'Aucune table ne correspond.', en: 'No table matches.' },
    'searchSelect.searchTemplates': { fr: 'Rechercher un modèle…', en: 'Search for a template…' },
    'searchSelect.noTemplateMatch': { fr: 'Aucun modèle ne correspond.', en: 'No template matches.' },
    'searchSelect.searchValues': { fr: 'Rechercher une valeur…', en: 'Search for a value…' },
    'searchSelect.noValueMatch': { fr: 'Aucune valeur ne correspond.', en: 'No value matches.' },
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

    // --- Messages d'erreur d'une #Variable (js/variables.js : baseRows, followReference, resolveRawValue, resolveVariableResult ; js/reader-mode.js :
    // resolveBadgeNode). Écrits dans le document à la place de la valeur (mode Lecture, exports PDF et DOCX), donc dans la langue de l'interface de qui lit ou
    // exporte. Le mode Lecture ne les reconnaît pas à leurs premiers mots mais au drapeau `isError` de Variables.resolveVariableResult ---
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
    'twoColumns.widthMmButton': { fr: 'Régler les largeurs en mm', en: 'Set widths in mm' },
    'twoColumns.widthMmLeftLabel': { fr: 'Gauche (mm)', en: 'Left (mm)' },
    'twoColumns.widthMmRightLabel': { fr: 'Droite (mm)', en: 'Right (mm)' },
    'image.moveHandle': { fr: 'Déplacer', en: 'Move' },
    'image.corsWarning': { fr: 'Cette image ne pourra probablement pas être incluse dans le PDF exporté : le serveur qui l’héberge ne semble pas autoriser son téléchargement depuis ce widget (restriction CORS). Elle continuera de s’afficher normalement ici et en mode lecture, mais l’export PDF devra l’ignorer.\n\nPour éviter ce problème, copiez l’image (Ctrl+C depuis son emplacement d’origine) puis collez-la directement ici (Ctrl+V) plutôt que d’insérer son URL : une image collée n’est jamais concernée par cette restriction.', en: 'This image probably cannot be included in the exported PDF: the server hosting it doesn’t seem to allow downloading it from this widget (CORS restriction). It will keep displaying normally here and in read mode, but the PDF export will have to skip it.\n\nTo avoid this, copy the image (Ctrl+C from its original location) then paste it directly here (Ctrl+V) instead of inserting its URL: a pasted image is never affected by this restriction.' },
    'image.urlPrompt': { fr: 'URL de l’image :', en: 'Image URL:' },

    // --- Picker "Image depuis une variable" (js/editor.js) ---
    'imageVarPicker.empty': { fr: 'Aucune colonne Pièce jointe trouvée dans ce document.', en: 'No attachment column found in this document.' },

    // --- Popup d'édition du texte d'une note de bas de page ---
    'footnotePopup.delete': { fr: 'Supprimer', en: 'Delete' },
    'footnotePopup.ok': { fr: 'OK', en: 'OK' },
    'footnotePopup.placeholder': { fr: 'Texte de la note…', en: 'Note text…' },

    // --- Sommaire (placeholder avant résolution) : montré par l'éditeur (NodeView) ET écrit dans le HTML enregistré/copié (renderHTML, js/editor-nodes.js) ---
    'toc.placeholder': { fr: 'Sommaire (généré automatiquement à partir des titres)', en: 'Table of contents (generated automatically from headings)' },

    // --- Placeholder du corps de l'éditeur, document principal vide (@tiptap/extension-placeholder, cf. js/editor.js) - lu via une fonction plutôt
    // qu'une chaîne figée (cf. commentaire à l'appel), donc pas besoin de I18n.onChange pour suivre un changement de langue en cours de session : ce
    // n'est PAS affiché en mode édition d'en-tête/pied (cf. js/header-footer-preview.js), une zone vide n'y montre aucun texte.
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
    'varFmt.showDay': { fr: 'Afficher/masquer le jour', en: 'Show/hide day' },
    'varFmt.showMonth': { fr: 'Afficher/masquer le mois', en: 'Show/hide month' },
    'varFmt.showYear': { fr: 'Afficher/masquer l’année', en: 'Show/hide year' },
    'varFmt.datePreset': { fr: 'Format de date', en: 'Date format' },
    'varFmt.wordsDateTitle': { fr: 'Écriture en toutes lettres', en: 'Spelled out' },

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

    // --- Titre du sommaire, exporté en PDF (js/pdf-export.js:buildTocStack et son repli), en DOCX (js/docx-export.js:buildTocParagraphs) et affiché en mode
    // Lecture (js/reader-mode.js:resolveTocMarkers) : tous disent la même chose, le mode Lecture étant l'aperçu de l'export ---
    'pdf.tocTitle': { fr: 'Sommaire', en: 'Table of Contents' },
    'pdf.tocEmpty': { fr: 'Aucun titre trouvé.', en: 'No heading found.' },

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
    'varCond.group.current': { fr: '{table} (table de la page)', en: '{table} (this page’s table)' },
    'varCond.group.linkedVia': { fr: '{table} (liée via {via})', en: '{table} (linked via {via})' },
    'varCond.group.singleton': { fr: '{table} (une seule ligne)', en: '{table} (single row)' },
    'varCond.group.notLinked': { fr: '{table} (pas encore liée)', en: '{table} (not linked yet)' },
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

    // --- Fenêtre « Autres attributs » d'une variable (js/variable-linked-attrs.js) ---
    'varLinked.title': { fr: 'Autres attributs de « {table} »', en: 'Other attributes of “{table}”' },
    'varLinked.subtitleVia': { fr: 'Même ligne que {badge}, trouvée via {via}.', en: 'Same row as {badge}, found via {via}.' },
    'varLinked.subtitleSingleton': { fr: 'Même ligne que {badge} : toujours la même ligne de « {table} ».', en: 'Same row as {badge}: always the same row of “{table}”.' },
    'varLinked.subtitlePlain': { fr: 'Même ligne que {badge}.', en: 'Same row as {badge}.' },
    'varLinked.subtitleOtherLink': { fr: 'Dans ce document, la ligne de « {table} » est trouvée via {via} (un seul lien par table) : les attributs suivront ce lien, pas {badge}.', en: 'In this document, the row of “{table}” is found via {via} (one link per table): the attributes will follow that link, not {badge}.' },
    'varLinked.insertLost': { fr: 'La variable a été déplacée ou supprimée pendant le choix : rien n’a été inséré.', en: 'The variable was moved or deleted while choosing: nothing was inserted.' },
    'varLinked.filter': { fr: 'Filtrer les colonnes…', en: 'Filter columns…' },
    'varLinked.thisVariable': { fr: '· cette variable', en: '· this variable' },
    'varLinked.noteRow': { fr: 'Valeurs de la ligne sélectionnée (n° {id}).', en: 'Values for the selected row (#{id}).' },
    'varLinked.noteNoRecord': { fr: 'Aucune ligne sélectionnée dans Grist : valeurs indisponibles.', en: 'No row selected in Grist: values unavailable.' },
    'varLinked.noteNoLinkedRow': { fr: 'Aucune ligne de « {table} » liée à la ligne sélectionnée (n° {id}).', en: 'No row of “{table}” is linked to the selected row (#{id}).' },
    'varLinked.noteInsert': { fr: 'Les attributs cochés s’insèrent juste après la variable, séparés par une espace.', en: 'Checked attributes are inserted right after the variable, separated by a space.' },
    'varLinked.insert': { fr: 'Insérer {count} {count|attribut|attributs}', en: 'Insert {count} {count|attribute|attributes}' },
    'varLinked.empty': { fr: 'Aucune autre colonne dans « {table} ».', en: 'No other column in “{table}”.' },
    'varLinked.noFilterMatch': { fr: 'Aucune colonne ne correspond au filtre.', en: 'No column matches the filter.' },
    'varLinked.attachmentValue': { fr: '(pièce jointe)', en: '(attachment)' },
    'varLinked.subtitlePath': { fr: 'Ligne de « {table} » désignée par {path}. Les attributs insérés suivent ce chemin : aucun lien supplémentaire n’est créé.', en: 'Row of “{table}” pointed to by {path}. Inserted attributes follow this path: no extra link is created.' },
    'varLinked.noteNoPathRow': { fr: '{path} est vide pour la ligne sélectionnée (n° {id}) : aucune valeur à afficher.', en: '{path} is empty for the selected row (#{id}): no values to show.' },
    'varLinked.descend': { fr: 'Voir les colonnes de « {table} » (via {column})', en: 'Show the columns of “{table}” (via {column})' },
    'varLinked.path': { fr: 'Chemin des références', en: 'Reference path' },
    'varLinked.upTo': { fr: 'Remonter à « {table} »', en: 'Go back up to “{table}”' },
    'varLinked.inherit': { fr: 'Reprendre la condition d’affichage', en: 'Reuse the display condition' },
    'varLinked.inheritTitle': { fr: 'Chaque variable insérée reçoit la même condition d’affichage que {badge} : {summary}. Décochez pour les insérer sans condition.', en: 'Each inserted variable gets the same display condition as {badge}: {summary}. Untick to insert them without a condition.' },
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
  };

  let lang = (typeof localStorage !== 'undefined' && localStorage.getItem('pp_lang') === 'en') ? 'en' : 'fr';

  // Pluriel sans parenthèses : `{n|forme au singulier|forme au pluriel}` prend l'une ou l'autre selon la valeur de la variable `n` (règles de la langue :
  // en français 0 et 1 sont au singulier, en anglais seul 1) - « {count} {count|ligne trouvée|lignes trouvées} » donne « 1 ligne trouvée », « 3 lignes
  // trouvées ». Une forme peut contenir d'autres `{variable}` ou un autre pluriel. Traité AVANT les variables simples, pour que le texte d'une variable
  // (nom de colonne, valeur saisie) ne soit jamais lu comme un pluriel.
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
  // composent à l'exécution (ex. l'infobulle « Enregistrer (⌘S) » du bouton Enregistrer, dont le raccourci dépend de la plateforme) : sans ce crochet,
  // applyTranslations() les réécrirait à leur version brute au premier changement de langue.
  const changeListeners = [];
  function onChange(fn) { if (typeof fn === 'function') changeListeners.push(fn); }

  function setLang(next) {
    lang = next === 'en' ? 'en' : 'fr';
    try { localStorage.setItem('pp_lang', lang); } catch (e) { /* stockage indisponible - la langue ne survivra pas au rechargement, sans plus de conséquence */ }
    document.documentElement.lang = lang;
    applyTranslations();
    changeListeners.forEach(fn => { try { fn(lang); } catch (e) { console.warn('[I18n] un abonné au changement de langue a levé une exception', e); } });
  }

  // Parcourt le DOM (ou un sous-arbre `root`, ex. un nœud injecté après coup par un module qui ne connaît pas I18n) et applique les 4 variantes d'attribut de
  // traduction déclarative - le texte français d'origine reste en dur dans le HTML comme repli si ce fichier n'a pas encore chargé.
  function applyTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
    scope.querySelectorAll('[data-i18n-tip]').forEach(el => { el.setAttribute('data-tip', t(el.getAttribute('data-i18n-tip'))); });
    scope.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
  }

  // Applique tout de suite (pas seulement lors d'un futur setLang) : ce script est placé après tout le HTML du bandeau/des modales (les <script> sont en
  // fin de <body>), donc le DOM à traduire existe déjà - un utilisateur ayant déjà choisi EN voit l'anglais dès l'ouverture, pas après avoir rouvert Réglages.
  document.documentElement.lang = lang;
  applyTranslations();

  return { t, getLang, setLang, applyTranslations, onChange };
})();
