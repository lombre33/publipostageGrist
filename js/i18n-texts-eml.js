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
};
