// Textes de l'interface, français et anglais côte à côte : l'export « Email (.eml) » du mode Email (js/eml-export.js) : le type du menu Type d'export, le champ PJ, les phrases du coin d'état et du lot.
// Chargé AVANT js/i18n.js, qui assemble tous les js/i18n-texts-*.js. Un texte neuf va dans le fichier de son domaine, en français et en anglais dans le même lot, et le `?v=` de ce fichier monte dans index.html ;
// une clé n'existe que dans un seul fichier (l'essai « aucune clé déclarée deux fois » lit les fichiers ensemble).
const I18nTextsEml = {
  // --- Le type d'export et sa ligne grisée hors d'un modèle email ---
  'exportType.eml': { fr: 'Email (.eml)', en: 'Email (.eml)' },
  'lock.emlNoSense': { fr: 'Sans objet dans un email (.eml) : il n’a ni pages, ni sommaire, ni vidéo, ni diapositive', en: 'Not applicable in an email (.eml): it has no pages, table of contents, video or slide' },
  'lock.exportEml': { fr: 'Disponible pour un modèle email seulement', en: 'Available for an email template only' },

  // --- Le champ PJ, après Cci : des variables de colonnes Pièces jointes de Grist, rien d'autre ---
  'email.pj.show': { fr: '+ PJ', en: '+ Attachments' },
  'email.pj.placeholder': { fr: 'Pièces jointes de l’email (.eml) : #Colonne de pièces jointes', en: 'Email (.eml) attachments: #Attachments column' },
  'email.pj.aria': { fr: 'Pièces jointes', en: 'Attachments' },

  // --- Un email (.eml), une ligne ---
  'alert.noRecordForExportEml': { fr: 'Aucune ligne n’est sélectionnée. Cliquez sur une ligne dans Grist, puis exportez l’email (.eml).', en: 'No row is selected. Click a row in Grist, then export the email (.eml).' },
  'status.emlGenerating': { fr: 'Préparation de l’email (.eml) en cours…', en: 'Preparing the email (.eml)…' },
  'status.emlGenerated': { fr: 'Email (.eml) généré : ouvrez-le dans votre messagerie pour le relire et l’envoyer.', en: 'Email (.eml) generated: open it in your mail client to review and send it.' },
  'status.emlGeneratedSkipped': { fr: 'Email (.eml) généré. {count|Une adresse n’en est pas une et a été laissée de côté|{count} adresses n’en sont pas et ont été laissées de côté} : {list}.', en: 'Email (.eml) generated. {count|One address is not an address and was left out|{count} addresses are not addresses and were left out}: {list}.' },
  'status.emlGenerationError': { fr: 'Erreur génération de l’email (.eml).', en: 'Email (.eml) generation error.' },
  'eml.attachmentUnreadable': { fr: 'Pièce jointe illisible, l’email n’est pas généré : {files}.', en: 'Attachment unreadable, the email is not generated: {files}.' },

  // --- Un email (.eml) par ligne, dans une archive ZIP ---
  'confirm.batchExportEml': { fr: 'Générer un email (.eml) pour {count|la ligne|chacune des {count} lignes} de « {table} » et {count|le placer|les regrouper} dans une archive ZIP ?', en: 'Generate an email (.eml) for {count|the row|each of the {count} rows} in “{table}” and {count|put it|bundle them} into a ZIP archive?' },
  'status.batchExportProgressEml': { fr: 'Export des emails (.eml) en lot : {current}/{total}…', en: 'Batch email (.eml) export: {current}/{total}…' },
  'status.exportErrorEml': { fr: 'Échec de l’export : aucun email (.eml) généré.', en: 'Export failed: no email (.eml) generated.' },
  'status.batchExportDoneEml': { fr: '{ok} {ok|email (.eml) généré|emails (.eml) générés} — archive ZIP téléchargée.', en: '{ok} {ok|email (.eml)|emails (.eml)} generated — ZIP archive downloaded.' },
  'status.batchExportDoneWithFailuresEml': { fr: '{ok} {ok|email (.eml) généré|emails (.eml) générés}, {failed} {failed|échec|échecs} — archive ZIP téléchargée.', en: '{ok} {ok|email (.eml)|emails (.eml)} generated, {failed} {failed|failure|failures} — ZIP archive downloaded.' },

  // --- L'email lié à un document ou à une grille (js/email-link.js) : Réglages > Email, le bouton à côté de l'étoile et son menu, le coin d'état ---
  'settings.mailClient.title': { fr: 'Messagerie', en: 'Mail program' },
  'emailLink.title.document': { fr: 'Email lié à ce document', en: 'Email linked to this document' },
  'emailLink.title.grid': { fr: 'Email lié à cette grille', en: 'Email linked to this grid' },
  'emailLink.title.email': { fr: 'Documents liés à cet email', en: 'Documents linked to this email' },
  'emailLink.intro.document': {
    fr: 'L’email qui accompagne ce document. Le bouton à côté de l’étoile y mène en un clic, et revient au document depuis l’email.',
    en: 'The email that goes with this document. The button next to the star takes you there in one click, and back to the document from the email.',
  },
  'emailLink.intro.email': {
    fr: 'Les documents et les grilles qui renvoient à cet email. Le bouton à côté de l’étoile mène au document d’où l’on vient, ou à celui qui est lié.',
    en: 'The documents and grids that point to this email. The button next to the star goes back to the document you came from, or to the linked one.',
  },
  'emailLink.select.label': { fr: 'Email lié', en: 'Linked email' },
  'emailLink.select.none': { fr: '— Aucun —', en: '— None —' },
  'emailLink.select.gone': { fr: '— Email supprimé —', en: '— Email deleted —' },
  'emailLink.select.goneHint': {
    fr: 'L’email lié à ce document n’existe plus : choisissez-en un autre, ou « Aucun » pour retirer le lien.',
    en: 'The email linked to this document no longer exists: pick another one, or “None” to remove the link.',
  },
  'emailLink.list.empty': { fr: 'Aucun document n’est lié à cet email.', en: 'No document is linked to this email.' },
  'emailLink.add.label': { fr: 'Lier un document', en: 'Link a document' },
  'emailLink.add.placeholder': { fr: '— Choisir un document —', en: '— Choose a document —' },
  'emailLink.add.option': { fr: '{name} (email actuel : {email})', en: '{name} (current email: {email})' },
  'emailLink.add.hint': { fr: 'Un document n’a qu’un email : le lier ici le retire de celui qu’il avait.', en: 'A document has only one email: linking it here removes it from the one it had.' },
  'emailLink.remove': { fr: 'Retirer', en: 'Remove' },
  'emailLink.remove.aria': { fr: 'Retirer le lien avec « {name} »', en: 'Remove the link with “{name}”' },
  'emailLink.reason.unsaved': {
    fr: 'Ce document n’est pas encore enregistré : donnez-lui un nom et cliquez sur Enregistrer, il pourra alors être lié à un email.',
    en: 'This document is not saved yet: give it a name and click Save, then it can be linked to an email.',
  },
  'emailLink.reason.type': {
    fr: 'Seuls un document, une grille et un email se lient entre eux. Ouvrez-en un pour régler le lien.',
    en: 'Only a document, a grid and an email can be linked to each other. Open one of them to set the link.',
  },
  'emailLink.reason.noEmail': {
    fr: 'Aucun email enregistré. Créez-en un avec « Nouvel email » (menu +), enregistrez-le, puis revenez ici.',
    en: 'No email saved yet. Create one with “New email” (+ menu), save it, then come back here.',
  },
  'emailLink.reason.noDocument': { fr: 'Aucun document ni aucune grille enregistrés à lier.', en: 'No saved document or grid to link.' },
  'emailLink.button.aria': { fr: 'Email lié', en: 'Linked email' },
  'emailLink.button.toEmail': { fr: 'Aller à l’email lié : « {name} »', en: 'Go to the linked email: “{name}”' },
  'emailLink.button.chooseEmail': { fr: 'Aucun email lié : cliquer pour en choisir un', en: 'No linked email: click to choose one' },
  'emailLink.button.toDocument': { fr: 'Revenir au document : « {name} »', en: 'Back to the document: “{name}”' },
  'emailLink.button.chooseDocument': { fr: 'Cet email sert à plusieurs documents : choisir dans le menu', en: 'This email serves several documents: choose from the menu' },
  'emailLink.button.noDocument': { fr: 'Aucun document lié : cliquer pour en lier un', en: 'No linked document: click to link one' },
  'emailLink.button.unsaved': { fr: 'Enregistrez ce document pour le lier à un email', en: 'Save this document to link it to an email' },
  'emailLink.button.type': { fr: 'Seuls un document, une grille et un email se lient entre eux', en: 'Only a document, a grid and an email can be linked to each other' },
  'emailLink.menu.emails': { fr: 'Ouvrir un email', en: 'Open an email' },
  'emailLink.menu.documents': { fr: 'Ouvrir un document', en: 'Open a document' },
  'emailLink.menu.noEmail': { fr: 'Aucun email enregistré', en: 'No saved email' },
  'emailLink.menu.noDocument': { fr: 'Aucun autre document enregistré', en: 'No other saved document' },
  'emailLink.menu.chooseEmail': { fr: 'Choisir l’email lié…', en: 'Choose the linked email…' },
  'emailLink.menu.linkDocument': { fr: 'Lier un document…', en: 'Link a document…' },
  'emailLink.status.gone': { fr: 'Ce document ou cet email n’existe plus, ou ne s’ouvre pas ici : rien n’a changé.', en: 'This document or email no longer exists, or cannot be opened here: nothing changed.' },
  'emailLink.status.several': { fr: 'Cet email sert à plusieurs documents : survolez le bouton pour choisir celui à ouvrir.', en: 'This email serves several documents: hover the button to choose the one to open.' },
  'emailLink.history.documentGone': { fr: 'Ce document a été supprimé depuis : le lien n’est pas changé.', en: 'This document was deleted since: the link is unchanged.' },
  'emailLink.history.emailGone': { fr: 'Cet email a été supprimé depuis : le lien n’est pas changé.', en: 'This email was deleted since: the link is unchanged.' },
  'emailLink.history.changed': { fr: 'Le lien de « {name} » a changé depuis : il n’est pas écrasé.', en: 'The link of “{name}” changed since: it is not overwritten.' },
  'status.emailLinked': { fr: 'Email « {email} » lié à « {name} ».', en: 'Email “{email}” linked to “{name}”.' },
  'status.emailUnlinked': { fr: 'Lien retiré entre « {name} » et son email.', en: 'Link removed between “{name}” and its email.' },
  'status.emailLinkError': { fr: 'Le lien n’a pas été enregistré.', en: 'The link was not saved.' },
};
