# Journal des modifications / Changelog

*🇬🇧 The English version of each entry follows the French one.*

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les versions suivent le
[versionnement sémantique](https://semver.org/lang/fr/). Une bêta porte le suffixe `-beta.N`.

## [{{VERSION}}] - {{DATE}}

### Ajouté

- **Variables dans les champs de l'e-mail et le nom du PDF** : Objet, À, Cc, Cci et le nom du PDF posent des
  bulles de variable comme le corps du modèle (`#` ouvre la liste des variables, Entrée pose la bulle), avec
  la même barre et les mêmes fenêtres : condition, « Autres attributs », boucle dans la phrase, liste,
  format. Le zéro masqué et « Un document par valeur » restent propres au corps du modèle. Un modèle
  enregistré avant se relit tel quel (même objet, mêmes adresses, même nom de fichier), la Lecture montre
  la valeur résolue, et les renommages de colonnes et de tables sont suivis dans ces champs aussi.
- **Texte « Avant » et « Après » d'une variable** : la fenêtre de condition d'une bulle a deux petits champs
  (40 signes, espaces comprises) dont le texte s'écrit collé à la valeur, dans le même style, dans la
  Lecture, le PDF, le Word, l'Excel, les en-têtes et les pieds de page. Il ne s'écrit pas quand la
  condition est fausse, que la valeur est vide ou qu'elle est en erreur, et il vaut aussi sans condition :
  une virgule qui disparaît avec la variable.

### Modifié

- **Modèle de la vue** : Réglages > Vue > « Utiliser … pour cette vue » accepte aussi un e-mail ou un
  macro-modèle, qui s'ouvre au démarrage de la vue (un macro-modèle sur son résumé, un e-mail sur son
  bandeau Objet / À / Cc) ; l'étoile du document reste réservée aux modèles ordinaires.
- **Recherche d'une colonne** : une colonne se retrouve en tapant ses mots, dans n'importe quel ordre, avec
  ou sans « _ », « . » et « - » (« porteur 3 », « Porteur3 » et « 3 porteur » retrouvent
  `Projets.Porteur_3`), dans la liste `#` et dans toutes les listes avec recherche. Le libellé que Grist
  montre en tête de la colonne se cherche aussi.

## [1.0.0-beta.1] - 2026-10-05

Première bêta publique. Elle reprend l'alpha du 14 septembre 2026 et ajoute l'essentiel des lignes
« Bêta » de la roadmap, à l'exception de celles qui sont reportées en V1 (voir le
[README](README.md#roadmap)).

### Ajouté

- **Types de modèles** : E-mail (objet, destinataires, corps, lien `mailto:` avec jauge de longueur),
  Grille (tableur, collage depuis Excel, Google Sheets ou LibreOffice Calc, import d'un classeur
  `.xlsx`, fusion et scission de cases, export Excel) et Macro-modèle (une page de garde et des annexes
  choisies par des règles sur la ligne).
- **Enregistrement et collaboration** : enregistrement automatique avec détection de conflit, menu
  « Enregistrer » et « Enregistrer sous… », nom de modèle déjà pris devenu « nom (2) », commentaires
  avec réponses et résolution, suivi des modifications (bêta ; la barre Accepter / Refuser dit qui a
  proposé la modification), droits par personne (lecture seule, export, commentaires), rangement
  personnel des modèles (dossiers, épingles), modèle par défaut d'une vue et choix du modèle selon la
  ligne.
- **Variables et logique** : conditions d'affichage (variable, bloc de texte, valeur dans la phrase, case
  cochée), boucles sur les lignes liées, « Autres attributs », variables d'une table liée sans règle
  préalable, calculs (SOMME, MOYENNE, MIN, MAX, NB, ARRONDI), mise en forme des Oui/Non, zéro masqué,
  renommages de tables et de colonnes suivis.
- **Mise en page** : formats de page A3 à A6 en portrait ou en paysage, formats libres et nommés, marges
  par modèle, filigrane, images en calque (déplacées aux flèches du clavier, légende), citation, bloc de
  code, encadré, bloc de signature, QR code, pinceau de mise en forme, abréviations, rechercher /
  remplacer, zoom de la page à l'écran (pastille du coin, Ajuster, Ctrl + molette), fusion et scission de
  cases dans les tableaux d'un document (Word et PDF les suivent ; au saut de page, les lignes liées par
  une case fusionnée restent ensemble).
- **Lecture** : lecture épurée, guide quand le widget n'est lié à aucune ligne (et, sans l'accès complet au
  document, la même carte d'accès à la place de l'éditeur), commentaires depuis la Lecture.
- **Exports** : Word (`.docx`, bêta), un seul PDF pour toutes les lignes, assemblage avant impression
  (feuilles A4 ou A3, traits de coupe), repli de police par caractère dans le PDF (grec, cyrillique,
  vietnamien, flèches, coches, monnaies), fenêtre de confirmation avant le téléchargement d'images
  venant d'un autre site.
- **Interface** : thème clair, sombre ou celui du système, 54 raccourcis clavier personnalisables, choix
  dans des listes avec recherche pour les colonnes, tables et modèles, fenêtres communes (Tab, Échap),
  barre d'outils pensée pour un petit panneau, contrastes d'au moins 4,5:1.
- **Premier contact** : ouvert seul dans un onglet, le widget dit qu'il s'utilise dans Grist, où l'ajouter
  et à quelle adresse ; si le réseau bloque une adresse dont il dépend, ou si le démarrage dure plus de
  30 secondes, une fenêtre liste les adresses à autoriser ; toute autre erreur de démarrage affiche son
  message technique. La langue de l'interface suit celle du navigateur au premier lancement, puis le choix
  fait dans Réglages. Le numéro de version est dans Réglages > Crédits, et l'onglet a un titre, une icône
  et une description.
- **Galerie** : un avertissement rappelle que les modèles sont des exemples à adapter, pas un conseil
  juridique.
- **Dépôt** : `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `NOTICE` et
  `CARTE_DU_CODE.md` (quel fichier fait quoi, par où commencer), limites connues et roadmap à jour dans le
  README.

### Modifié

- Les bibliothèques d'export (PDF, ZIP, Excel, Word, QR code) et les scripts d'export du widget lui-même
  ne se chargent qu'au premier usage : le widget s'ouvre plus vite.
- La console du navigateur ne reçoit plus que les avertissements et les erreurs : le widget n'y raconte
  plus son démarrage.
- L'interface prend la police du système : la police Manrope n'est plus téléchargée depuis Google Fonts,
  et plus aucune police ni feuille de style ne vient d'un autre site.
- La galerie ne propose que quatre modèles : facture, contrat de prestation de services, attestation,
  courrier de relance.

### Retiré

- html2pdf.js et la qualité de PDF « raster » : le PDF est vectoriel. Les qualités « impression
  navigateur », « basse qualité » et « Ultra HD » restent grisées (« bientôt »).
- L'idée d'une version avec les dépendances embarquées, écartée pour l'instant.

### Sécurité

- Politique de sécurité du contenu (CSP) dans la page : scripts limités aux adresses connues et à trois
  scripts en ligne cités par leur empreinte.
- Le HTML d'un modèle relu depuis le document est assaini avant d'être affiché.
- Bibliothèques d'export en versions figées, avec intégrité SRI.
- Une image hébergée sur un autre site n'est chargée qu'après un clic sur « Afficher » (éditeur, Lecture,
  en-têtes et pieds de page, galerie) : ouvrir un document ne révèle plus à ce site l'adresse IP ni
  l'heure d'ouverture. Rien n'est retenu d'une séance à l'autre.
- Le widget demande l'accord de la personne avant de créer ses tables dans le document ; un refus
  n'écrit rien.
- Suites d'un audit externe (4 octobre 2026) : l'en-tête et le pied de page sont filtrés dès la lecture,
  la galerie construit ses cartes avec du texte et non du HTML, et le chargeur de scripts des exports
  refuse toute adresse hors de cdnjs, de jsDelivr (avec empreinte) et du site du widget. L'éditeur reste
  chargé depuis `esm.sh` : l'audit reste « NON CONFORME » (voir les
  [limites connues](README.md#limites-connues)).

### Corrigé

- De nombreux écarts de fidélité entre l'éditeur, la Lecture, le PDF et le Word.

## [Alpha] - 2026-09-14

Première publication : éditeur riche, variables `#Table.Colonne`, puces intelligentes, export PDF
vectoriel et en lot, gestion multi-modèles, galerie, interface bilingue.

---

## [{{VERSION}}] - {{DATE}} (English)

### Added

- **Variables in the e-mail fields and the PDF name**: Subject, To, Cc, Bcc and the PDF file name place
  variable bubbles like the template body (`#` opens the variable list, Enter places the bubble), with the
  same bar and windows: condition, "Other attributes", loop inside the sentence, list, format. Hidden zero
  and "One document per value" remain specific to the template body. A template saved earlier reads back
  as it was (same subject, same addresses, same file name), Reading mode shows the resolved value, and
  column and table renames are followed in these fields too.
- **"Before" and "After" text of a variable**: a bubble's condition window has two small fields (40
  characters, spaces included) whose text is written glued to the value, in the same style, in Reading
  mode, the PDF, the Word file, the Excel file, headers and footers. It is not written when the condition
  is false or when the value is empty or in error, and it also applies without a condition: a comma that
  disappears with the variable.

### Changed

- **A view's template**: Settings > View > "Use … for this view" now also accepts an e-mail or a macro
  template, which opens when the view starts (a macro template on its summary, an e-mail on its
  Subject / To / Cc banner); the document's ★ stays reserved for ordinary templates.
- **Column search**: a column is found by typing its words, in any order, with or without "_", "." and "-"
  ("porteur 3", "Porteur3" and "3 porteur" find `Projets.Porteur_3`), in the `#` list and in every
  searchable list. The label Grist shows at the top of the column is searched too.

## [1.0.0-beta.1] - 2026-10-05 (English)

First public beta. It builds on the 14 September 2026 alpha and adds most of the roadmap's "Beta" lines,
except those postponed to V1 (see the [README](README.md#roadmap-1)).

### Added

- **Template types**: E-mail (subject, recipients, body, `mailto:` link with a length gauge), Grid
  (spreadsheet, paste from Excel, Google Sheets or LibreOffice Calc, `.xlsx` workbook import, cell merge
  and split, Excel export) and Macro template (a cover page and appendices chosen by rules on the row).
- **Saving and collaboration**: autosave with conflict detection, "Save" and "Save as…" menu, a taken
  template name becomes "name (2)", comments with replies and resolution, track changes (beta; the
  Accept / Reject bar says who proposed the change), per-person rights (read-only, export, comments),
  personal organization of templates (folders, pins), a view's default template and template choice by
  row.
- **Variables and logic**: display conditions (variable, text block, value in a sentence, checked box),
  loops over linked rows, "Other attributes", variables from a linked table without a prior rule,
  calculations (SUM, AVERAGE, MIN, MAX, COUNT, ROUND), formatting of Yes/No values, hidden zero, tracked
  table and column renames.
- **Layout**: A3 to A6 page formats in portrait or landscape, free and named formats, per-template
  margins, watermark, layered images (moved with the arrow keys, caption), quote, code block, callout,
  signature block, QR code, format painter, abbreviations, find / replace, on-screen page zoom (corner
  pill, Fit, Ctrl + wheel), merging and splitting cells in document tables (Word and PDF follow; at a
  page break, rows tied by a merged cell stay together).
- **Reading**: clean reading, a guide when the widget is not linked to any row (and, without full access to
  the document, the same access card in place of the editor), comments from Reading mode.
- **Exports**: Word (`.docx`, beta), a single PDF for all rows, sheet assembly before printing (A4 or A3
  sheets, crop marks), per-character font fallback in the PDF (Greek, Cyrillic, Vietnamese, arrows,
  check marks, currencies), a confirmation window before downloading images from another site.
- **Interface**: light, dark or system theme, 54 customizable keyboard shortcuts, searchable pickers for
  columns, tables and templates, shared windows (Tab, Esc), toolbar designed for a small panel,
  contrast of at least 4.5:1.
- **First contact**: opened alone in a browser tab, the widget says it is used inside Grist, where to add
  it and at which address; if the network blocks an address it depends on, or if startup takes more than
  30 seconds, a window lists the addresses to allow; any other startup error shows its technical
  message. The interface language follows the browser's on first launch, then the choice made in
  Settings. The version number is in Settings > Credits, and the tab has a title, an icon and a
  description.
- **Gallery**: a notice reminds that the templates are examples to adapt, not legal advice.
- **Repository**: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `NOTICE` and
  `CARTE_DU_CODE.md` (which file does what, where to start), known limitations and an up-to-date roadmap
  in the README.

### Changed

- The export libraries (PDF, ZIP, Excel, Word, QR code) and the widget's own export scripts only load on
  first use: the widget opens faster.
- The browser console now only receives warnings and errors: the widget no longer narrates its startup
  there.
- The interface uses the system font: the Manrope font is no longer downloaded from Google Fonts, and no
  font or stylesheet comes from another site any more.
- The gallery only offers four templates: invoice, service agreement, certificate, payment reminder
  letter.

### Removed

- html2pdf.js and the "raster" PDF quality: the PDF is vector. The "browser print", "low quality" and
  "Ultra HD" qualities remain greyed out ("soon").
- The idea of a version with bundled dependencies, set aside for now.

### Security

- Content Security Policy (CSP) in the page: scripts limited to known addresses and to three inline
  scripts cited by their hash.
- The HTML of a template read back from the document is sanitized before being displayed.
- Export libraries at pinned versions, with SRI integrity.
- An image hosted on another site is only loaded after a click on "Show" (editor, Reading mode, headers
  and footers, gallery): opening a document no longer tells that site the IP address or the time of
  opening. Nothing is remembered from one session to the next.
- The widget asks for the person's consent before creating its tables in the document; a refusal writes
  nothing.
- Follow-ups to an external audit (October 4, 2026): headers and footers are filtered as soon as they
  are read, the gallery builds its cards from text rather than HTML, and the export script loader refuses
  any address outside cdnjs, jsDelivr (with an integrity hash) and the widget's own site. The editor is
  still loaded from `esm.sh`: the audit stays "NON CONFORME" (see the
  [known limitations](README.md#known-limitations)).

### Fixed

- Many fidelity gaps between the editor, Reading mode, the PDF and the Word file.

## [Alpha] - 2026-09-14 (English)

First release: rich editor, `#Table.Column` variables, smart chips, vector and batch PDF export,
multi-template management, gallery, bilingual interface.
