#!/usr/bin/env node
// Lance les groupes de dev-tests/ dans un Chromium headless, sans aucune manipulation manuelle -
// remplace la procédure "ouvrir _test-harness.html et coller du JS dans la console" du README pour
// tout ce qui doit tourner sans humain (session Claude Code, CI, vérification avant un commit).
//
// Usage :
//   node dev-tests/run-headless.mjs                      # tous les groupes, un navigateur par groupe
//   node dev-tests/run-headless.mjs comments formatting  # seulement ces groupes
//   node dev-tests/run-headless.mjs --port 8899 formatting
//   node dev-tests/run-headless.mjs load [sections] [--quick]   # banc de charge (dev-tests/load-tests.mjs), à la demande seulement
//
// Un navigateur NEUF par groupe, à dessein : le README documente des fuites d'état entre suites
// (scenarios-chips laissait échouer un scénario d'image sans rapport). Un processus par groupe rend
// chaque verdict indépendant de l'ordre de lancement, au prix de quelques secondes de démarrage.
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, 'dev-tests', '.offline-cache');

// « load » : le banc de charge (dev-tests/load-tests.mjs), lancé seulement s'il est nommé en premier - jamais dans la suite complète ni dans la passe ciblée. Les arguments qui suivent
// (sections, --quick, --out, --strict) lui sont transmis tels quels. Il mesure et signale, il ne juge pas : voir « Tests de charge » dans dev-tests/README.md.
if (process.argv[2] === 'load') {
  const loadRun = spawnSync(process.execPath, [join(ROOT, 'dev-tests', 'load-tests.mjs'), ...process.argv.slice(3)], { stdio: 'inherit' });
  process.exit(loadRun.status === null ? 1 : loadRun.status);
}

// _test-harness.html (racine, gitignoré) est une simple copie de index.html avec l'API Grist réelle
// remplacée par le stub local - jusqu'ici régénérée à la main (dev-tests/generate-harness.sh) avant
// TOUT lancement, un piège déjà documenté (mémoire projet) qui a produit un faux résultat dans cette
// même session : un changement de markup (classe CSS ajoutée) non reflété tant que le harnais n'était
// pas régénéré. Régénérée ICI systématiquement (avant de servir quoi que ce soit) pour rendre cette
// dérive structurellement impossible plutôt que de compter sur ce qu'un humain/Claude s'en souvienne à
// chaque session - même substitution que generate-harness.sh, gardée en un seul endroit avec elle.
async function regenerateHarness() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const stubbed = html.replace(
    '<script src="https://docs.getgrist.com/grist-plugin-api.js"></script>',
    '<script src="dev-tests/grist-stub.js"></script>'
  );
  await writeFile(join(ROOT, '_test-harness.html'), stubbed);
}
await regenerateHarness();

// Les groupes et leurs fichiers, dans l'ordre du README. `deps` = fichiers à charger en plus de
// helpers/runner (un groupe qui s'appuie sur un autre scénario n'existe pas aujourd'hui, mais la
// forme est là).
const GROUPS = {
  formatting: 'scenarios-formatting',
  lists: 'scenarios-lists',
  tables: 'scenarios-tables',
  twoColumns: 'scenarios-twocolumns',
  nesting: 'scenarios-nesting',
  images: 'scenarios-images',
  pageBreakToc: 'scenarios-pagebreak-toc',
  headerFooter: 'scenarios-headerfooter',
  chips: 'scenarios-chips',
  varFormat: 'scenarios-varformat',
  pdfFidelity: 'scenarios-pdf-fidelity',
  pdfGroundTruth: 'scenarios-pdf-ground-truth',
  readModeFidelity: 'scenarios-readmode-fidelity',
  pageLayout: 'scenarios-pagelayout',
  orientation: 'scenarios-orientation',
  pageFormat: 'scenarios-page-format', // formats de page A3, A4, A5, A6 (suite de l'orientation) : menu de la barre, feuille, pagination, Lecture, enregistrement, PDF, Word, images en calque
  pageSize: 'scenarios-page-size', // format de page libre (largeur x hauteur en cm, ligne « Format libre… » du menu Page) : lecture et bornes de l'identifiant, dimensions dans chaque unité, fenêtre, éditeur, Lecture, enregistrement, PDF, Word, zones d'en-tête et de pied sur une page basse
  savedFormats: 'scenarios-saved-page-formats', // formats de page enregistrés (table Publipostage_FormatsPage, liste de la fenêtre « Format libre… ») : lecture à l'ouverture et création à la première écriture, table interne, enregistrement et noms uniques, choix et « Valider », retouche d'un champ, suppression confirmée, lignes illisibles, échec d'écriture, langue, reprise sur un autre modèle et assemblage, ordre du clavier
  watermark: 'scenarios-watermark', // filigrane de la page (roadmap n° 14) : réglage borné, géométrie commune, éditeur, Lecture, PDF (texte derrière le contenu), Word (image de l'en-tête), enregistrement, fenêtre, ligne du menu Page
  docx: 'scenarios-docx',
  docxImages: 'scenarios-docx-images',
  comments: 'scenarios-comments',
  autosave: 'scenarios-autosave',
  autosaveRace: 'scenarios-autosave-race', // enregistrement automatique face à un Grist lent : passages qui se chevauchent, Enregistrer pendant un passage, changement de modèle pendant une lecture, relecture échouée
  autosaveIdle: 'scenarios-autosave-idle', // enregistrement automatique AU REPOS (js/main.js, AUTOSAVE_IDLE_INTERVAL_MS) : la table des modèles n'est relue que toutes les 15 s quand rien n'est à enregistrer (30 s pour une table de 3 Mo : l'attente suit le poids de la dernière lecture) et un enregistrement fait ailleurs est signalé à la lecture suivante ; la frappe relit toujours AVANT d'écrire. Vrais minuteurs : ~80 s
  toolbarChrome: 'scenarios-toolbar-chrome',
  macroModeles: 'scenarios-macro-modeles',
  templateTree: 'scenarios-template-tree',
  templateOrganize: 'scenarios-template-organize',
  templateGallery: 'scenarios-template-gallery',
  templatePack: 'scenarios-template-pack', // modèles de la galerie qui s'installent avec leurs tables (js/template-pack.js : lecture et contrôle du pack, plan, actions envoyées à Grist, installation et retour arrière, js/template-gallery-modal.js : aperçu par captures, question, conflits, modèle créé avec sa page) et fichiers des packs des catalogues
  pageTree: 'scenarios-page-tree', // rangement des pages que Grist crée avec les tables du widget (js/page-tree.js) : sous celle des modèles, repliées par défaut
  rowTemplate: 'scenarios-row-template', // modèle selon la ligne (js/row-template.js, Réglages > Selon la ligne) : règles, repli, Lecture et édition, question avant de quitter des modifications, onglet, et l'onglet qui suit les droits changés Réglages ouverts sans redessiner la saisie
  viewTemplate: 'scenarios-view-template', // modèle par défaut de la vue (js/view-template.js, Réglages > Vue) : bouton « Utiliser … pour cette vue » (un email et un macro-modèle se choisissent comme un autre), « Retirer », grisés, choix venu d'ailleurs, repli des règles de ligne, lecture seule, et les boutons qui suivent les droits changés Réglages ouverts
  exportDate: 'scenarios-export-date', // date du dernier export PDF (js/export-date.js, Réglages > Vue) : la liste des colonnes qui peuvent la recevoir, l'option et ses échos, le grisage en lecture seule, ce qui s'écrit selon le type (Date, Date et heure, Texte), une seule écriture pour le lot, colonne disparue / à formule / refusée, ligne supprimée pendant l'export, colonne « vide »
  saveReminder: 'scenarios-save-reminder', // rappel « Enregistrer » des Réglages Vue et Accès (js/save-reminder.js) : le suivi du brouillon (écho, « Enregistrer », « Retour », null = absent), la ligne à droite du titre sur ces deux onglets seulement, français et anglais, ouvrir puis fermer les Réglages n'écrit aucune option
  viewerAccount: 'scenarios-viewer-account', // compte Lecteur de Grist (readonly=true dans l'adresse du cadre : js/grist-api.js:isDocumentReadOnly, js/access-rights.js, état « viewer ») : lecture seule d'office, export gardé, sans commentaires, jamais identifié, Réglages verrouillés, aucune écriture ni création de table tentée
  templateNames: 'scenarios-template-names', // nom de modèle déjà pris : « nom (2) » au premier enregistrement, à « Enregistrer sous… », au crayon « Renommer », pour un macro-modèle
  contrast: 'scenarios-contrast',
  trackChanges: 'scenarios-track-changes',
  varCondition: 'scenarios-var-condition',
  varLoop: 'scenarios-var-loop',
  condText: 'scenarios-cond-text', // bloc de texte conditionnel (menu des variables, onglet Chips) : pose et entourage, barre flottante, fenêtre de condition, Lecture et exports
  condCheckbox: 'scenarios-cond-checkbox', // case conditionnelle (menu des variables, onglet Chips) : pose en un clic, barre flottante (condition, trois styles), fenêtre de condition, Lecture, boucle, en-tête, PDF, Word et e-mail
  condValue: 'scenarios-cond-value', // valeur conditionnelle EN LIGNE (menu des variables, onglet Chips) : pose dans la phrase ou autour d'un texte, touches aux bords, barre flottante, fenêtre de condition, Défaire la valeur, suivi, Lecture, boucle, en-tête, PDF et Word
  varPath: 'scenarios-var-path',
  varLookup: 'scenarios-var-lookup',
  varTextPath: 'scenarios-var-text-path',
  fieldEditor: 'scenarios-field-editor', // champs texte à bulles (Objet, À, Cc, Cci, nom du PDF ; js/field-editor.js, js/field-codec.js) : interface d'<input>, valeur enregistrée, compatibilité des modèles déjà enregistrés, réglages d'une bulle (condition, format, boucle, liste), liste #, Lecture, barre et fenêtres
  varColumn: 'scenarios-var-column', // bouton « Colonne… » de la barre d'une bulle : changer ou réparer la colonne d'une variable (js/variable-column.js)
  schemaRenames: 'scenarios-schema-renames', // suivi des renommages de tables et de colonnes faits dans Grist : mappeur, réécriture des modèles et des clés de correspondance, lecture seule, modèle affiché (js/schema-renames.js)
  settingsColumns: 'scenarios-settings-columns', // avertissement d'ouverture : Réglages > Accès ou > Selon la ligne cite une colonne (ou la table des droits) qui n'existe plus dans Grist (js/settings-columns.js)
  varZero: 'scenarios-var-zero',
  varList: 'scenarios-var-list', // listes d'une variable (colonne Liste de choix ou Liste de références) : toutes avec séparateur, première, dernière, n-ième ; moteur, Lecture, lot, barre, fenêtre « Liste » (js/variable-list.js)
  listSplit: 'scenarios-list-split', // « Un document par valeur » d'une liste (js/list-split.js, case de la fenêtre « Liste ») : plan d'une ligne, bulles épinglées d'un document, lot PDF / PDF unique / Word / Excel, export d'une seule ligne (et la question au-delà de 50 documents)
  varNumber: 'scenarios-var-number-default',
  varBool: 'scenarios-var-bool', // variable Oui / Non : barre à quatre écritures (trois cases de la liste à cases, vrai / faux), la case en Lecture, PDF (polices de cases), Word, Excel et e-mail, le barré, les champs texte inchangés
  linkConfig: 'scenarios-link-config',
  columnSearch: 'scenarios-column-search',
  columnDescend: 'scenarios-column-descend', // descendre dans une colonne Référence depuis une liste de colonnes (js/search-select.js : flèche « › », fil d'Ariane, clavier, lignes posées par addDynamicOption ; js/variables.js:referencedTable / columnsBelow) : règles de condition et « Comparer à une autre colonne » (chemin « Table.Référence.Colonne » lu par la règle), QR code, « Colonne… »
  nameSearch: 'scenarios-name-search', // recherche d'une colonne par son nom (js/search-select.js:searchWords), la même partout : « porteur 3 », « Porteur3 » et les mots dans un autre ordre retrouvent Projets.Porteur_3 dans la liste « # » du corps et des champs texte, les listes avec recherche, l'onglet des puces ; le libellé Grist se cherche aussi
  pdfBatch: 'scenarios-pdf-batch',
  pdfGlyphs: 'scenarios-pdf-glyphs', // un caractère que la police n'a pas ne s'imprime plus en case vide dans le PDF (js/pdf-glyph-fallback.js, js/pdf-fonts.js, js/pdf-fonts-symbols.js, inlineRuns et glyphText de js/pdf-export.js) : PDF relu par pdf.js, glyphes .notdef comptés
  sheetAssembly: 'scenarios-sheet-assembly', // « Assemblage avant impression » (js/sheet-layout.js, js/sheet-assembly-dialog.js, js/pdf-merge.js:createSheets) : géométrie des planches, fenêtre de réglage, PDF relu par pdf.js (feuilles, texte par emplacement, traits de coupe tracés et peints), menu, droits d'export, grille
  accessRights: 'scenarios-access-rights', // droits par personne (js/access-rights.js) : lecture seule, export, commentaires ; la table des droits relue toutes les 10 s, davantage quand elle est grosse (vrais minuteurs : ~40 s pour ces deux cas)
  linksBlocks: 'scenarios-links-blocks',
  calloutSignature: 'scenarios-callout-signature',
  qrCode: 'scenarios-qr-code', // QR code (js/qr-code.js) : ligne du menu de la chaîne, fenêtre, image et cadre de l'éditeur, Lecture, PDF, Word et Excel, relus par un décodeur (jsQR)
  chart: 'scenarios-chart-block', // Graphique de la page (js/chart-plot.js, js/chart-source.js, js/chart-block.js) : lecture des réglages d'un graphique de Grist (type, colonnes, filtres, tri, lignes), figure Plotly de chaque type, ligne du menu, nœud et cadre de l'éditeur, fenêtre, Lecture, PDF, Word et Excel
  caption: 'scenarios-caption', // légende sous une image ou un tableau (js/caption.js) : attribut `data-caption`, boutons des barres flottantes, grisage, tableau / case / colonne, texte d'attente, suivi, style de l'éditeur et de la Lecture, PDF, Word, e-mail
  keepNext: 'scenarios-keep-next', // « Garder avec le suivant » (js/keep-with-next.js) : attribut `data-keep-next`, ligne à cocher du menu Alignement (pose, retrait, grisage et sa raison, deux langues, suivi), la suite de paragraphes gardés passe d'un seul tenant à la page suivante dans l'éditeur, la Lecture, le PDF et le Word
  grid: 'scenarios-grid', // mode grille (js/grid-editor.js) : un seul tableau sans feuille, bandeaux A, B, C / 1, 2, 3, barre grisée, garde-fou
  gridTable: 'scenarios-grid-table', // tableau de tableur collé dans une grille (js/grid-table.js) : le presse-papiers d'Excel (HTML + texte + image), de Google Sheets et de LibreOffice lu case par case (fusions, fond, traits, alignements, marques), collé pour de vrai, aucune image, un seul Annuler ; un tableur de plus de 3 000 lignes ou 300 colonnes est collé tel quel et une fenêtre le dit
  gridImport: 'scenarios-grid-import', // import d'un classeur Excel dans une grille (js/grid-xlsx-import.js) : facture lue case par case (fusions, fonds du thème, traits, tailles, texte riche, liens sûrs, lignes et colonnes masquées), texte d'Excel en français et en anglais, erreurs, limites, grille chargée sans correction case par case, largeurs gardées depuis un document, question avant d'abandonner, aller-retour avec l'export
  gridInDocument: 'scenarios-grid-in-document', // les réglages de la grille sur le tableau d'un DOCUMENT (js/grid-editor.js : `tableInfo(doc, selection)` et `scopedTable`) : alignement vertical, bordures et quadrillage visent le tableau du curseur (un autre tableau, un tableau dans une case), rien hors d'un tableau, refusés sous le suivi des modifications, un seul Annuler, les traits d'une case dans le Word
  linkedTable: 'scenarios-linked-table', // tableau de document LIÉ à un modèle Grille (js/linked-table.js, lot 6a) : l'attribut `data-linked-template`, la pose et la liste avec recherche, les règles du contenu (ce qu'une grille refuse l'est aussi, commandes et collage, le même tableau sans lien l'accepte), un lien par modèle et par document, le lien mort inerte, le suivi qui verrouille, le repère, le bouton du lien de la barre et son menu, « Détacher » (un Annuler), les boutons et la ligne du menu grisés avec leur raison, la Lecture, le PDF et le Word qui ignorent le lien
  blankLastPage: 'scenarios-blank-last-page', // page blanche en fin de document : Lecture, PDF, Word, et le repère « Page 2 » de l'éditeur (js/header-footer-preview.js:trailingBlankStart)
  macroPages: 'scenarios-macro-pages', // macro-modèle : l'éditeur, la Lecture et le PDF ont les mêmes pages (chaque modèle seul, puis les modèles bout à bout : mots de chaque page, pied « n/total », aucune page blanche), 5 formats de page, le Word et une variable vide en dernière ligne
  floatingKeys: 'scenarios-floating-image-keys', // Retour arrière et Suppr n'emportent plus une image en calque (createFloatingImageKeysExtension de js/editor-nodes.js) : l'ancre enjambée, la ligne qui ne porte qu'elle jointe à celle d'avant, la sélection effacée sans l'image, l'image sélectionnée et tout le document qui partent toujours, une image au fil du texte sélectionnée d'abord (Retour arrière juste derrière elle, Suppr juste devant) puis effacée par la seconde frappe
  behindClicks: 'scenarios-behind-image-clicks', // un clic sur du texte posé sur une image « derrière le texte » atteint le texte (createBehindImageClickThroughExtension de js/editor-nodes.js) : le cadre de l'image laisse passer les clics quand le pointeur est sur un caractère, jamais ailleurs sur l'image, ni pour une image devant le texte ou au fil du texte, poignées gardées, bouton enfoncé, changement de calque
  tablePageCut: 'scenarios-table-page-cut', // un tableau se coupe entre deux lignes au saut de page (js/table-page-cut.js) : règle, couture de l'éditeur et de la Lecture, PDF relu par pdf.js, Word
  zonePageCut: 'scenarios-zone-page-cut', // une zone à deux colonnes qui passe le bas de la page se coupe colonne par colonne, comme le PDF (js/zone-page-cut.js) : mêmes pages dans l'éditeur, la Lecture, l'impression navigateur et le PDF, la couture entre deux lignes, le geste d'Antoine (Entrée dans une colonne)
  findReplace: 'scenarios-find-replace', // Rechercher / Remplacer (js/find-replace.js) : moteur, panneau, loupe, remplacement en une étape d'annulation, mode suivi, textes FR / EN, 3 500 résultats (seuls l'écran et ses abords sont surlignés), contrastes
  layers: 'scenarios-layers', // ordre d'empilement des couches flottantes (js/layers.js, jetons --z-* ) : barres flottantes < menus < info-bulles < fenêtres, le dernier ouvert au-dessus, menu # sous la barre du tableau
  imageParity: 'scenarios-image-parity', // bande d'en-tête et de pied sur le PDF : même origine du corps, même coin de feuille, mêmes coupures de page et mêmes marges dans l'éditeur, la Lecture, le PDF et le Word
  pageLayer: 'scenarios-page-layer', // « Sur toutes les pages » (js/page-layer.js) : la case de la barre de l'image, puis le PDF (fond de chaque page) et le Word (ancre dans l'en-tête de chaque page), macro-modèles compris
  fullPages: 'scenarios-full-pages', // « Pages entières » : chaque feuille à sa taille réelle dans l'éditeur et la Lecture (couture = bas de page, gouttière, haut de page), fond de feuille derrière le corps de la Lecture, copies de « Sur toutes les pages » sur les pages 2 et plus à la place du PDF
  xlsx: 'scenarios-xlsx', // export Excel d'une grille (js/xlsx-export.js) : le .xlsx est dézippé et son OOXML lu (valeurs, formats, largeurs, fusions, liens, images, menu)
  imageIo: 'scenarios-image-io', // lecture des images partagée par l'insertion et les exports (js/image-io.js) : adresse en Blob, Blob en data URI, image décodée, PNG redessiné, adresses temporaires libérées
  editorInit: 'scenarios-editor-init', // ce que `Editor.init` assemble (js/editor.js) : extensions TipTap dans leur ordre, nœuds et marques du schéma, plugins nommés, mise à jour et presse-papiers
  externalImages: 'scenarios-external-images', // fenêtre qui liste les sites externes des images avant un export (js/external-images.js) : le module, un PDF et un Word, les lots, l'annulation
  browserPrint: 'scenarios-browser-print', // impression par le navigateur (js/print-export.js, css/print.css, ReaderMode.renderInto), qualité « Impression navigateur » du bouton PDF : la ligne du menu, le cadre caché à bac à sable, une feuille par page de la Lecture au pixel près (même texte, mêmes coutures, A4 et A5 paysage), `@page` dans le cadre seulement, vue sans teinte et images d'un autre site montrées dans l'impression seulement, une page plus haute qu'une feuille continue sans perdre une ligne, limite de 60 pages, déroulement de print / afterprint
  pdfLight: 'scenarios-pdf-light', // qualité « Léger » du bouton PDF (ImageIo.lighten, js/pdf-export.js) : le menu à trois lignes sans « Basse qualité » ni « Ultra HD », le poids et les ~150 ppi, la page qui ne bouge pas (pdf.js), le PDF par défaut intact, PNG opaque en JPEG, logo transparent, petite image et code QR intacts, en-tête, les deux entrées du moteur
  textExpansion: 'scenarios-text-expansion', // expansion de texte « §ub » (js/text-expansion.js) : abréviations par personne dans une table du document, règle de saisie, onglet Réglages > Raccourcis, contrastes, la ligne « Encore N résultats » sous les 50 abréviations
  shortcuts: 'scenarios-shortcuts', // raccourcis clavier personnalisables (js/shortcuts.js, js/shortcuts-panel.js) : combinaisons, touches de départ, une touche changée libère l'ancienne, refus, boutons grisés, infobulles, liste des Réglages, contrastes
  imageWide: 'scenarios-image-wide', // images trop larges dans le PDF et le Word (js/export-common.js:shownImageWidthPx) : la largeur que l'éditeur montre, dans le corps, une case, une colonne, centrée, flottante, selon le format de page
  varCalc: 'scenarios-var-calc', // bulle « Calcul » (variables calculées) : nœud, fenêtre, barre flottante, Lecture, PDF, Word, zones répétées, total de lignes
  emailExport: 'scenarios-email-export', // texte et lien du mode Email (js/mailto-export.js) : puces et numéros comme l'éditeur, retraits sous le texte de l'item, citations en « > », le vrai chemin éditeur -> Lecture -> texte, l'URL construite et sa jauge
  emailPlainText: 'scenarios-email-plain-text', // un modèle email n'écrit que ce que le lien mailto: porte (js/email-plain-text.js, css/email-plain-text.css) : touches de gras, d'italique, de souligné, de code et d'alignement sans effet, signes de Markdown tapés (**x**, *x*) laissés en texte, collage sans mise en forme, texte brut collé avec ses lignes vides, ancienne mise en forme non montrée à l'éditeur ni à la Lecture, image collée refusée ; un document garde tout
  cleanReading: 'scenarios-clean-reading', // Lecture épurée (js/clean-reading.js) : ligne « Lecture épurée » sous Mode lecture, barre du haut cachée, bouton de sortie, Échap, retour au mode d'origine, focus, langue
  readerReads: 'scenarios-reader-reads', // la Lecture lit chaque table une seule fois par rendu, un export une seule fois par ligne (js/grist-api.js:withReadPass, js/export-common.js:resolveRecord) et suit une image qui change de taille après la mesure (js/reader-mode.js:watchGeometry)
  schemaAtDisplay: 'scenarios-schema-at-display', // la passe de schéma exact à l'affichage d'un modèle (js/editor.js:setHTML) : rien n'est relu quand aucune bulle n'est rouge et que la dernière passe a moins d'une minute, elle repart pour une bulle rouge (colonne ajoutée depuis) ou une passe plus vieille
  paginationCost: 'scenarios-pagination-cost', // ce que coûte l'affichage d'un long document : une écriture de la feuille des marges par calcul de pagination (js/header-footer-preview.js, js/reader-mode.js : EditorCore.createStepSheets), une pagination par affichage (js/editor.js:setHTML), une recherche des <col> par tableau (js/editor-nodes.js:withFastColwidth)
  readerGuide: 'scenarios-reader-guide', // guide de la Lecture sans ligne (js/reader-guide.js, img/reader-guide/) : guide en quatre étapes (accès complet, tableau sur la page, « Sélectionner par », ligne choisie) sans « Sélectionner par », court message quand le widget est relié (l'étape de l'accès seule s'il est relié sans accès complet), captures FR / EN, mise à jour sans recharger, clic sur une capture, contrastes clair et sombre
  imageText: 'scenarios-image-text', // image « Au cœur du texte » et texte autour (js/editor-nodes.js, css/editor-v2.css, js/reader-mode.js, js/pdf-export.js, js/docx-export.js) : l'image seule sur sa ligne, l'habillage gauche / droite, l'image dans la ligne, la bascule en ligne / bloc, mesurés dans l'éditeur, la Lecture, le PDF et le Word
  formatPainter: 'scenarios-format-painter', // pinceau de mise en forme (js/format-painter.js, bouton après le surlignage, Alt+Maj+C / V) : ce qui est copié et posé, le paragraphe sur un curseur ou un paragraphe entier, une étape d'historique, armé par un clic ou un double-clic, grisé en e-mail et en macro-modèle, les touches
  scriptMarks: 'scenarios-script-marks', // exposant et indice (js/script-marks.js, css/script-marks.css, rangée de deux icônes du menu « Lien et blocs de contenu », Ctrl+. et Ctrl+,) : les icônes et leur état, la pose, le retrait et l'un qui remplace l'autre, la frappe qui suit, les touches (QWERTY et AZERTY) et leur réglage, le HTML relu (<sup>, <sub>, style de Word et de Google Docs, collage), la note de bas de page qui reste une note, la taille posée avant ou après, le pinceau, grisé en e-mail et en macro-modèle ; le CSS de l'éditeur, de la Lecture et des en-têtes et pieds, les runs du PDF et leur hauteur peinte (pdf.js), le Word (`w:vertAlign`)
  tableCells: 'scenarios-table-cells', // sélection de plusieurs cases d'un tableau (CellSelection) : gras, taille, police, couleurs, surlignage, puces, numéros, citation, retrait et retrait inverse sur toutes les cases choisies (et leurs touches Ctrl+Maj+B, Ctrl+Maj+8, Ctrl+Maj+7, Ctrl+Maj+9), la sélection reste, un seul Annuler ; copier, couper, coller en tableau tabulé
  tableMerge: 'scenarios-table-merge', // fusionner et scinder des cases d'un tableau de DOCUMENT (js/table-merge.js, barre du tableau) : texte gardé à la suite, largeurs rendues, un seul Annuler, gardes (une case, case fusionnée qui dépasse, suivi, ligne répétée par une boucle) et grisé avec sa raison, puis la Lecture, le PDF (pdf.js) et le Word (OOXML) : mêmes cases, mêmes colonnes
  htmlSanitize: 'scenarios-html-sanitize', // HTML qui ne vient pas de l'éditeur (js/html-sanitize.js, Editor.setHTML) : rien ne s'exécute, rien d'actif ne survit, tout ce que l'éditeur écrit reste
  floatingToolbars: 'scenarios-floating-toolbars', // barres flottantes de js/floating-toolbars.js, bouton par bouton : menu du fond et commandes du tableau, taille, calque, habillage et « Sur toutes les pages » de l'image, écriture d'un nombre ou d'une date d'une bulle
  colorPalette: 'scenarios-color-palette', // menu de couleur (js/color-palette.js), fenêtre « Couleur personnalisée » (js/color-dialog.js) et rangées « Couleurs du modèle » (clé `colors` de Margins) et « Couleurs du document » (ligne réservée de la table des modèles) de js/color-store.js : palette 10x5, un appui pose la couleur, code # et champs R V B, couleur gardée dans le modèle et dans le document (appui, croix, Suppr, plafond, enregistrement, JSON abîmé, rangée vide), français et anglais
  pageZoom: 'scenarios-page-zoom', // zoom de la page (js/page-zoom.js, css/page-zoom.css) : pastille du coin bas droit (au repos le pourcentage seul ; moins, plus et Ajuster à sa gauche au survol et au focus), place contre le bord du document, échelle des niveaux et bornes, Ctrl + molette, Ctrl + plus / moins / 0, ajustement à la largeur du panneau, grisé avec sa raison, Édition et Lecture, niveau gardé par modèle, anglais ; affichage seulement
  landmarks: 'scenarios-landmarks', // repères de la page et noms des champs (index.html ; audit externe du 04/10, D-RGAA-region et F-RGAA-04) : la barre du haut est le « banner », l'éditeur, le résumé d'un macro-modèle, la carte de l'accès et la Lecture sont les quatre « main » (un seul à l'écran), onze champs nommés en français et en anglais, étiquettes de la fenêtre des liens
};

// Scripts Node autonomes (page.mouse réel, pas de page.evaluate) : structurellement à part de GROUPS
// ci-dessus, qui exécute tout DANS la page (cf. runGroup) et ne peut donc jamais déclencher un geste de
// molette/survol "trusted" par le navigateur. Inclus par défaut dans `node run-headless.mjs` sans
// argument (la suite complète), et invocables seuls par leur nom comme un groupe normal -
// [[project-publipostage-scroll-chaining-popup-fix]].
const NODE_SCRIPTS = {
  wheelScroll: 'verify-wheel-scroll.mjs',
  linkedTableMouse: 'verify-linked-table-mouse.mjs', // tableau de document lié à un modèle Grille à la vraie souris et au vrai clavier à 700x400, clair, sombre et anglais : volet du bouton Tableau, liste avec recherche, pose, barre sur une ligne avec le bouton du lien et son menu (nom du modèle, « Détacher »), repère et ses contrastes, boutons grisés, suivi des modifications, clavier seul
  readerGuideMouse: 'verify-reader-guide-mouse.mjs', // guide de la Lecture sans ligne à la vraie souris à 700x400, clair et sombre, français et anglais : titre et première étape dans le panneau, quatre étapes atteignables à la molette, clic sur une vraie capture, lien changé en direct, relié sans accès complet (l'étape de l'accès seule), ligne arrivée
  varToolbarMouse: 'verify-var-toolbar-mouse.mjs',
  varBoolMouse: 'verify-var-bool-mouse.mjs', // barre d'une bulle Oui / Non à la vraie souris : quatre boutons atteignables, bouton enfoncé, Lecture mesurée aux pixels d'une vraie capture ; 700x400 clair, sombre et anglais
  varListMouse: 'verify-var-list-mouse.mjs', // fenêtre « Liste » d'une variable à la vraie souris et au vrai clavier : bouton de la barre (entre Boucle et Colonne, grisé pour un texte), fenêtre entière dans 700x400, choix, numéro et séparateurs tapés, aperçu, Enregistrer, Lecture, Remettre par défaut, Échap ; clair, sombre et anglais
  condTextMouse: 'verify-cond-text-mouse.mjs', // bloc de texte conditionnel à la vraie souris : liste « # » et Chips, étiquette et barre (icônes grisées aux pixels), fenêtre de condition, blocs emboîtés, texte entouré, Lecture ; 700x400 clair et sombre
  condCheckboxMouse: 'verify-cond-checkbox-mouse.mjs', // case conditionnelle à la vraie souris : liste « # » et Chips, UN clic pose la puce et ouvre sa barre (icônes grisées aux pixels), fenêtre de condition, colonne étroite, Lecture mesurée aux pixels ; 700x400 clair, sombre et anglais
  condValueMouse: 'verify-cond-value-mouse.mjs', // valeur conditionnelle à la vraie souris et au vrai clavier : liste « # » et Chips, frappe dans la valeur, Entrée, flèches qui en sortent et frappe derrière (ou devant) son cadre, Retour arrière et Suppr aux bords, texte vidé sans perdre la valeur, barre et fenêtre de condition, texte sélectionné entouré, Lecture ; 700x400 clair, sombre et anglais, puis 360 px
  captionMouse: 'verify-caption-mouse.mjs', // légende sous une image ou un tableau à la vraie souris et au vrai clavier : barre de l'image et du tableau, bouton « Légende » (actif, grisé), texte d'attente, frappe, Entrée, Ctrl+Z, Retour arrière ; 700x400 clair, sombre et anglais
  keepNextMouse: 'verify-keep-next-mouse.mjs', // ligne « Garder avec le suivant » du menu Alignement à la vraie souris et au vrai clavier : volet dans le panneau, ligne cochée, un clic pose / retire le réglage, plusieurs paragraphes d'un clic et d'un Ctrl+Z, Entrée, ligne grisée dans un tableau avec sa raison, groupe grisé en Lecture ; 700x400 clair, sombre et anglais
  modalBaseMouse: 'verify-modal-base-mouse.mjs', // base commune des fenêtres (js/modal-base.js) : Condition, Autres attributs, Boucle - titre et boutons fixes, Tab, Échap
  modalPagesMouse: 'verify-modal-pages-mouse.mjs', // même base, lot 2 : les sept fenêtres d'index.html (Réglages, Tables liées, Clé de correspondance, Macro-modèle, Organiser, Galerie, Aperçu)
  dialogsMouse: 'verify-dialogs-mouse.mjs', // saisies et confirmations (js/dialogs.js) à la place de prompt/confirm : au-dessus des autres fenêtres, Tab, Échap, focus rendu
  externalImagesMouse: 'verify-external-images-mouse.mjs', // fenêtre avant l'export d'un modèle qui contient une image d'un site externe (js/external-images.js) : vrai clic sur Exporter PDF / DOCX / lot ZIP, Annuler, Échap, Tab, Continuer, quarante sites qui défilent, la question « Intégrer l'image » / « Garder le lien » à l'insertion par adresse, 700x400 clair, sombre et anglais
  browserPrintPdf: 'verify-browser-print.mjs', // qualité « Impression navigateur » du bouton PDF au vrai clic à 700x400 (menu Qualité, bouton PDF : cadre caché, fenêtre du navigateur appelée une fois, « Impression lancée. », cadre retiré à afterprint, « Vectoriel » intact) puis le VRAI PDF que Chromium tire du document préparé, relu par pdf.js contre la Lecture : mêmes pages, A4 et A5 paysage, mêmes mots, chaque ligne à 0,6 pt, pixels floutés sans écart, fond de case sans « graphiques d'arrière-plan », liste plus haute qu'une page sans rien perdre, thème sombre ou « système » sombre identique au clair pixel pour pixel, image d'un autre site (Annuler, Continuer), plus de 60 pages refusé en français et en anglais
  pdfLightMouse: 'verify-pdf-light-mouse.mjs', // qualité « Léger » du bouton PDF au vrai clic à 700x400 : le menu Qualité à trois lignes entières (français et anglais), le clic sur « Léger », le bouton PDF en « Léger » puis en « Vectoriel » (deux PDF, le premier de moins du sixième du poids), message d'état, aucune erreur
  smallPanel: 'verify-small-panel.mjs',
  accessRightsMouse: 'verify-access-rights-mouse.mjs',
  rowTemplateMouse: 'verify-row-template-mouse.mjs', // modèle selon la ligne (Réglages > Selon la ligne) à la vraie souris dans 700x400 : onglets lisibles (FR, EN), case, colonne / valeur / modèle dans leurs listes avec recherche, option écrite, ouverture à la fermeture, ligne suivante en édition et en Lecture, et le bouton de la vue sur un macro-modèle puis un email
  schemaRenamesOpen: 'verify-schema-renames-open.mjs', // ouverture réelle du widget après un renommage dans Grist : rien avant l'affichage du modèle, modèle réécrit et redessiné, message dans 700x400, rien d'écrit à l'ouverture suivante
  settingsColumnsOpen: 'verify-settings-columns-open.mjs', // ouverture réelle du widget quand Accès ou Selon la ligne cite une colonne disparue : rien avant l'affichage du modèle, avertissement devant « Mis à jour après un renommage… », entier au survol dans 700x400, rien d'écrit, table des droits renommée (l'onglet Accès reste modifiable, l'onglet Vue se dégrise tout de suite)
  templateStartupMouse: 'verify-template-startup-mouse.mjs', // modèle ouvert au démarrage, faux Grist semé avant l'init : la ligne qui désigne un modèle, puis le modèle de la vue, puis le ★ ; un choix de vue supprimé est ignoré, un email ou un macro-modèle choisi s'ouvre (le ★ reste réservé aux modèles ordinaires)
  emailMouse: 'verify-email-mouse.mjs', // « Créer l'email » au vrai clic à 700x400 : le lien mailto: ouvert est capté puis décodé - objet et destinataire tapés au vrai clavier, puces de l'éditeur, retraits sous le texte, « > » devant la citation, lignes vides et lignes collées comme l'éditeur les montre, CRLF, jauge égale à la longueur du lien ; touches de gras, d'italique... sans effet, collage Google Docs et texte brut au vrai presse-papiers, ancienne mise en forme non montrée
  fieldEditorMouse: 'verify-field-editor-mouse.mjs', // les champs à bulles (Objet, À, Cc, Cci, nom du PDF) à la vraie souris et au vrai clavier à 700x400 : « # » et sa liste, la barre et la fenêtre de condition (avec « Avant » / « Après »), « Autres attributs », « Créer l'email » (lien mailto: capté), Lecture, enregistrement et réouverture
  runnerGroupLoad: 'verify-runner-group-load.mjs', // le lanceur lui-même : un groupe dont le fichier existe mais ne se charge pas (SyntaxError) est un ECHEC avec l'erreur de la page, un fichier absent de la branche reste annoncé et sauté ; lance une copie du lanceur sur deux groupes d'essai, un navigateur
  linksBlocksMouse: 'verify-links-blocks-mouse.mjs', // lien, citation, bloc de code sous une icône (js/link-dialog.js) : survol du menu, fenêtre et Ctrl+K au vrai clavier, Ctrl+clic, info-bulle, 700x400 clair, sombre et anglais
  calloutMouse: 'verify-callout-mouse.mjs', // encadré et bloc de signature (js/callout.js) : menu de sept lignes, fenêtre sans défilement, vraie souris et vrai clavier, 700x400 clair, sombre et anglais
  watermarkMouse: 'verify-watermark-mouse.mjs', // filigrane (js/watermark-dialog.js, ligne « Filigrane… » du menu Page) : menu, fenêtre sans défilement, frappe, couleurs, curseur, aperçu, Valider / Annuler / Échap / Entrée / Retirer, éditeur et Lecture, vraie souris et vrai clavier, 700x400 clair, sombre et anglais
  sheetAssemblyMouse: 'verify-sheet-assembly-mouse.mjs', // assemblage avant impression (js/sheet-assembly-dialog.js, ligne du menu Exporter en PDF) : menu, fenêtre sans défilement dans tous ses états, vrais clics et flèches, choix grisé lisible, « Générer » / Annuler / Échap / Entrée, PDF téléchargé relu par pdf.js, 700x400 clair, sombre et anglais
  qrMouse: 'verify-qr-mouse.mjs', // QR code (js/qr-code.js) : ligne du menu de la chaîne, fenêtre sans défilement, liste des colonnes au-dessus de la fenêtre, cadre carré, menu devant la barre flottante, vraie souris et vrai clavier, 700x400 clair, sombre et anglais
  chartMouse: 'verify-chart-mouse.mjs', // Graphique de la page (js/chart-block.js) : ligne du menu de la chaîne, fenêtre sans défilement, liste avec recherche au-dessus de la fenêtre (graphiques grisés avec leur raison, par page), aperçu du vrai graphique, lignes à tracer, cadre sans image, poignée, liaison à régler au-dessus de la fenêtre, Lecture ; vraie souris et vrai clavier, 700x400 clair, sombre et anglais
  gridImportMouse: 'verify-grid-import-mouse.mjs', // import d'un classeur Excel (ligne « Importer un Excel… » du menu « + ») : vrai clic, vrai sélecteur de fichier, grille visible et message d'état entier, « Modifications non enregistrées » après le choix du fichier, fichier illisible, 700x400 clair, sombre et anglais
  docPasteMouse: 'verify-doc-paste-mouse.mjs', // tableau copié dans Excel, Google Sheets ou LibreOffice Calc et collé dans un DOCUMENT : le VRAI presse-papiers de Chromium (HTML tel quel, texte tabulé, image PNG), un vrai Ctrl+V, Ctrl+Maj+V et Ctrl+Z à 700x400 clair et sombre - un tableau du document sans l'image, titre fusionné lisible, un seul Annuler, texte seul avec Ctrl+Maj+V, Sheets et LibreOffice, une image seule toujours collée comme image ; un tableur de 301 colonnes collé tel quel et sa fenêtre (Fermer, Échap, anglais)
  gridMouse: 'verify-grid-mouse.mjs', // mode grille (js/grid-editor.js) : « Nouvelle grille » à la souris, tirer un trait de colonne ou de ligne (aperçu, un seul Annuler), bandeaux, flèches et Ctrl+A, défilement collé, contrastes, 700x400 clair et sombre
  tableSelectMouse: 'verify-table-select-mouse.mjs', // sélection de cases en glissant la souris, tableau de document et grille : rectangle exact dans tous les sens, voile visible sur une case colorée, défilement tenu au bord du panneau, barre de la case fixée dans sa bande (aucune case recouverte), clavier ; 700x400 clair et sombre
  tableCellsMouse: 'verify-table-cells-mouse.mjs', // mise en forme et copier-coller de plusieurs cases d'un tableau à la vraie souris et au vrai clavier : glisser 2x2, boutons de la barre (gras, taille, police, couleurs, puces, citation, retrait, retrait inverse), cases voisines intactes, sélection gardée, Annuler, Ctrl+C / X / V, Suppr, Ctrl+Maj+B / 8 / 7 / 9 ; 700x400 clair
  gridCellsMouse: 'verify-grid-cells-mouse.mjs', // barre de la case d'une grille : fusionner, scinder (UNE case, taille des colonnes gardée, un Ctrl+Z chacun), alignement vertical en haut, au milieu, en bas, boutons grisés jamais retirés, barre d'un tableau de document à 17 boutons (mêmes bordures et mêmes alignements verticaux) ; 700x400 clair et sombre
  tableMergeMouse: 'verify-table-merge-mouse.mjs', // fusion de cases d'un tableau de DOCUMENT à la vraie souris : barre du tableau à 17 boutons sur une ligne (Fusionner et Scinder entre Tableau et Légende), grisés avec leur raison jamais retirés, glisser 2x2 puis un vrai clic = UNE case à la place des quatre, un Ctrl+Z chacun, ligne de titre sur toute la largeur, suivi des modifications grisé ; 700x400 clair et sombre
  docTableToolsMouse: 'verify-doc-table-tools-mouse.mjs', // bordures, alignement vertical et quadrillage dans la barre d'un tableau de DOCUMENT à la vraie souris : 17 boutons sur une ligne, texte vraiment en haut / au milieu / en bas (mesuré), bordures tracées sur les cases glissées et sur les voisines qui les partagent (un Ctrl+Z), « Aucune bordure », « Quadrillage », menu entier dans le panneau qui laisse de son bouton de quoi le refermer, couleur du trait choisie sans perdre la barre (ni le menu son ancre), « Personnalisé… » puis le menu revient, quatre boutons grisés avec leur raison sous le suivi, barre qui passe à la ligne dans un panneau de 420 px, Entrée dans une case au vrai clavier (descend d'une case, Maj+Entrée, puce, citation, dernière ligne, flèche du bas) ; 700x400 clair et sombre
  docStripsMouse: 'verify-doc-strips-mouse.mjs', // bandeaux A, B, C / 1, 2, 3 d'un tableau de DOCUMENT à la vraie souris : posés par-dessus la page dès que le curseur est dans un tableau du premier niveau (lettres sur les colonnes, numéros sur les lignes, mesurés à l'écran, Aperçu A4 ou non, page agrandie), rien décalé au pixel près, retirés de la page quand le curseur en sort, un clic sur une lettre, un numéro ou le coin choisit la colonne, la ligne ou tout (Maj étend), barre du tableau au-dessus des lettres et toujours ouverte, suivent le défilement, rognés au plan de travail, aucun pour un tableau dans une case ou une colonne, ni en Lecture ni dans une grille ; 700x400 clair et sombre, 420 px
  docStripsResizeMouse: 'verify-doc-strips-resize-mouse.mjs', // hauteur d'une ligne d'un tableau de DOCUMENT réglée par la poignée de son numéro à la vraie souris (lot 4 (b), point 5.4 : une case de signature haute) : une poignée par numéro (celles des lettres sont mesurées par docStripsWidthMouse), curseur « row-resize », bulle en centimètres, la ligne suit en direct (les autres gardent la leur, le texte d'après descend), rien écrit avant le relâcher puis une seule transaction en pixels de mise en page (page réduite ou agrandie), un Ctrl+Z, plancher = la hauteur du texte, Échap annule sans rien laisser, lignes choisies à la même hauteur, un seul tableau réglé parmi deux et dans une case, suivi des modifications (suggestion refusable), contraste de la bulle ; 700x400 clair et sombre, 420 px
  docStripsWidthMouse: 'verify-doc-strips-width-mouse.mjs', // largeur d'une colonne d'un tableau de DOCUMENT réglée par la poignée de sa lettre à la vraie souris (lot 4 (c)) : une poignée par lettre (la dernière, au bord du tableau, comprise), curseur « col-resize », bulle en centimètres, la colonne suit en direct (les autres gardent la leur, les lettres suivent), rien écrit avant le relâcher puis une seule transaction en pixels de mise en page (page réduite ou agrandie), un Ctrl+Z, Rétablir ; Aperçu A4 : la page limite le tableau (les colonnes suivantes cèdent au prorata, jamais sous 25 px, la dernière prend ce qui reste, un tableau qui remplit la page n'écrit rien), sans A4 aucune limite ; colonnes automatiques figées sans saut, Échap annule, colonnes choisies à la même largeur, un seul tableau réglé parmi deux et dans une case, suivi des modifications (suggestion refusable, colonnes figées sans marque), contraste de la bulle, grille inchangée ; 700x400 clair et sombre, 420 px
  docPageBreakMouse: 'verify-doc-page-break-mouse.mjs', // « Saut de page » avant une ligne d'un tableau de DOCUMENT à la vraie souris (lot 5 (B, C)) : hors d'un tableau le bouton garde son rôle, dans un tableau du premier niveau il parle d'une ligne (info-bulle « Saut de page avant la ligne », un clic pose la marque sur la ligne et un second la retire, un Ctrl+Z par geste, Entrée et Alt+Entrée), grisé jamais retiré là où le saut ne tient pas (première ligne, case fusionnée, tableau dans une case, suivi des modifications) avec sa raison seule en info-bulle (entière dans le panneau) et sans effet au clic, pastille sur le numéro de la ligne et trait en tirets sur son bord haut (pixels d'une vraie capture), Aperçu A4 : une bande de saut sur la ligne marquée, la ligne qui ouvre la page garde sa hauteur propre (poignée du numéro, Égaliser), « Fusionner » grisé quand la sélection enjambe un saut ; 700x400 clair et sombre
  tableEqualizeMouse: 'verify-table-equalize-mouse.mjs',// « Égaliser » dans la barre du tableau (document et grille) à la vraie souris : deux boutons à leur place (après « Supprimer la ligne » et « Supprimer la colonne »), grisés avec leur raison tant que la sélection ne couvre pas deux lignes (colonnes) et jamais retirés, la moyenne des hauteurs de lignes choisies par leurs numéros (en pixels de mise en page) et des largeurs de colonnes choisies par leurs lettres en UNE transaction (un Ctrl+Z, un Rétablir), tableau et bandeaux inchangés, cases choisies en glissant dans un tableau posé dans une case, suivi des modifications (suggestions refusables, lignes déjà proposées comprises), français et anglais, contraste des icônes, grille ; 700x400 clair et sombre, 420 px
  gridBordersMouse: 'verify-grid-borders-mouse.mjs', // menu « Bordures » de la barre d'une grille : bouton dans la bande, menu sous la bande tout entier sous le pointeur, couleur du stylo sans fermer le menu, réglages appliqués en un Ctrl+Z, « Intérieures » grisé jamais retiré, trait partagé écrit des deux côtés, case fusionnée, menu de fond sous la bande ; 700x400 clair et sombre
  colorPaletteMouse: 'verify-color-palette-mouse.mjs', // menu de couleur et fenêtre « Couleur personnalisée » à la vraie souris à 700x400, clair, sombre et anglais : menus entiers dans le panneau et chaque bouton atteignable, carré et teinte glissés, code # tapé, rangées « Couleurs du modèle » et « Couleurs du document » (côte à côte à 700x400, l'une sous l'autre dans un panneau haut ; appui, croix sous le pointeur sans poser la voisine, Suppr), fond de case et bordures
  gridPageBreakMouse: 'verify-grid-pagebreak-mouse.mjs', // saut de page d'une grille : bouton « Saut de page » grisé (première ligne, case fusionnée) jamais retiré, un vrai clic le pose avant la ligne, trait en tirets mesuré sur les pixels, pastille dans le numéro sans cacher la poignée, « Fusionner » grisé quand la sélection l'enjambe, bouton portrait / paysage actif dans une grille ; 700x400 clair et sombre
  gridLinesMouse: 'verify-grid-lines-mouse.mjs', // lignes et colonnes d'une grille choisies par leurs bandeaux (numéros, lettres, Maj + clic) à la vraie souris et au vrai clavier : Ctrl+C prend toutes les cases (texte tabulé et HTML identiques à un glissé), Ctrl+V pose le bloc entier depuis la case en haut à gauche (répété seulement si la sélection en est un multiple exact), « Ligne / Colonne avant / après » ajoutent autant de lignes ou de colonnes que la sélection en couvre en un seul Ctrl+Z, mise en forme, fond, alignement vertical, bordures, Suppr, Retour arrière, Ctrl+X, fusion et suppression touchent toutes les cases choisies, tirer le trait de l'une des lignes ou colonnes choisies les règle toutes à la même taille (en direct, une seule transaction, plancher du texte, Échap) ; 700x400 clair
  gridHashMouse: 'verify-grid-hash-mouse.mjs', // liste « # » ouverte dans une case de la grille (ou d'un tableau du document) à la vraie souris et au vrai clavier : ↑ et ↓ (Maj comprise) parcourent la liste qui boucle sans que le curseur quitte la case ni qu'aucune case soit sélectionnée, Entrée et Tab posent la colonne en surbrillance dans cette case, Échap ferme sans bouger le curseur, hors liste (jamais ouverte, fermée, ou « #zzzz » sans ligne) les flèches font leur travail de grille, la souris choisit toujours ; 700x400
  orientationMouse: 'verify-orientation-mouse.mjs', // bascule Portrait / Paysage d'un modèle classique : feuille mesurée aux pixels, pagination, Lecture, enregistrement automatique, clavier ; 700x400 clair et sombre
  pageFormatMouse: 'verify-page-format-mouse.mjs', // formats de page A3 à A6 à la vraie souris et au vrai clavier : menu du bouton Page tout entier dans le panneau, feuille mesurée aux pixels, pagination, Lecture, enregistrement automatique, curseur gardé, Tab, email grisé ; 700x400 clair et sombre
  pageSizeMouse: 'verify-page-size-mouse.mjs', // format de page libre à la vraie souris et au vrai clavier : ligne « Format libre… » du menu Page, fenêtre en cm sans défilement (saisie, erreur, aperçu), Valider (feuille mesurée aux pixels, enregistrement automatique, Lecture), en-tête grisé sur une page basse, Tab et Échap, assemblage d'étiquettes ou « ne tient pas », anglais ; 700x400 clair et sombre
  savedFormatsMouse: 'verify-saved-page-formats-mouse.mjs', // formats de page enregistrés à la vraie souris et au vrai clavier : liste de la fenêtre « Format libre… » (invite entière, mesures, contrastes, panneau au-dessus de la fenêtre, tri, recherche, Tab, ↓ et Entrée), choisir remplit les champs sans toucher la page, retoucher un champ remet l'invite, « Enregistrer ce format… » (saisie du nom par-dessus, « (2) »), corbeille confirmée (focus sur « Annuler »), Valider et enregistrement automatique, 40 formats et nom très long, anglais ; 700x400 clair et sombre
  readModeMouse: 'verify-read-mode-mouse.mjs', // barre de mise en forme grisée en mode Lecture (audit 29/09, F1), clair et sombre à 700x400
  saveReminderMouse: 'verify-save-reminder-mouse.mjs', // rappel « Enregistrer » des Réglages Vue et Accès à la vraie souris, 700x400 clair et sombre, français et anglais : la ligne à droite du titre, entière, sans recouvrir titre ni onglets, contraste, apparition au vrai clic (modèle de la vue ; table des droits puis colonne « Lecture seule »), disparition à « Enregistrer » et « Retour » de Grist, réouverture des Réglages
  exportDateMouse: 'verify-export-date-mouse.mjs', // date du dernier export PDF (Réglages > Vue > « Date du dernier export PDF ») à la vraie souris, 700x400 clair et sombre, français et anglais : la section à la molette, la liste avec recherche (Aucune, Date, Date et heure, Texte ; ni Numérique ni formule), le choix au vrai clic et le rappel « Enregistrer », un VRAI export PDF qui date la ligne courante seule, la colonne supprimée (section en rouge, PDF produit, coin d'état « Date non écrite » en rouge, rien d'écrit), un compte Lecteur (grisé, inerte, rien d'écrit)
  viewerMouse: 'verify-viewer-mouse.mjs', // compte Lecteur de Grist à la vraie souris, 700x400 : adresse du cadre `readonly=true` dès le chargement, ouverture en Lecture, barre grisée, Commenter grisé, export qui part, Réglages verrouillés, Lecture épurée d'emblée quand la case est cochée
  cleanReadingMouse: 'verify-clean-reading-mouse.mjs', // Lecture épurée à la vraie souris et au vrai clavier, 700x400 clair et sombre, lecture seule comprise : menu sous Mode lecture, barre cachée, document dans tout le panneau, bouton de sortie, Échap
  pageZoomMouse: 'verify-page-zoom-mouse.mjs', // zoom de la page à la vraie souris, à la vraie molette et au vrai clavier à 700x400, clair, sombre et anglais : pastille réduite au pourcentage, collée au coin bas droit (à 3 px du bord, contre les vraies barres de défilement, ouverte au survol, au focus et sans survol sur un écran tactile, couleurs 4,5:1, fond peint), « Ajuster » (badge de 90x120 mm à la largeur du panneau), plus et moins, Ctrl + plus / moins / 0 retenus, Ctrl + molette qui garde le mot sous le pointeur (Édition, Lecture), Lecture épurée, fenêtre ouverte devant la pastille, niveau retrouvé après rechargement, clic dans le texte, glissé de sélection, bordure de colonne, image et barre flottante à 200 % et à 50 % ; témoin à 1400x1000
  settingsWindowMouse: 'verify-settings-window-mouse.mjs', // fenêtre Réglages : sept onglets sur une ligne, contenu qui défile, « Fermer » fixe (audit 29/09, F2), 700x400 clair et sombre
  columnSearchMouse: 'verify-column-search-mouse.mjs',
  folderDefaultMouse: 'verify-folder-default-mouse.mjs',
  templateMenuMouse: 'verify-template-menu-mouse.mjs', // liste des modèles (12,5 px, sans « Nouveau modèle », « Organiser » en haut à droite) et renommage sur place, 700x400 clair et sombre
  saveMenuMouse: 'verify-save-menu-mouse.mjs', // menu du bouton Enregistrer (Enregistrer sous…, enregistrement automatique coché), souris et clavier, 700x400 clair et sombre
  templateNamesMouse: 'verify-template-names-mouse.mjs', // nom de modèle déjà pris à la vraie souris : « Enregistrer sous… » (proposition sélectionnée, nom saisi déjà pris), crayon « Renommer », galerie deux fois, anglais, 700x400
  autosaveRaceMouse: 'verify-autosave-race-mouse.mjs', // enregistrement automatique face à un Grist lent, à la vraie souris et au vrai clavier : frappe continue, clic sur Enregistrer, autre modèle choisi pendant une lecture, vrai conflit toujours signalé ; 700x400
  menuClickMouse: 'verify-menu-click-mouse.mjs', // un clic de souris sur « + », Enregistrer, Qualité PDF ou Titre ne les laisse plus ouverts ni ne prend le curseur du texte, 700x400
  leaveUnsavedMouse: 'verify-leave-unsaved-mouse.mjs', // quitter un modèle dont une modification attend : la question Enregistrer / Abandonner / Annuler (liste, « + », galerie), 700x400 clair, sombre et anglais
  galleryCaptures: 'verify-gallery-captures.mjs', // captures et pastilles de la galerie, sans navigateur : fichiers présents, tailles des PNG, captures à jour (empreinte de gallery-captures-lib.mjs), pastilles « Fonctions montrées » vraies (libellés FR / EN et preuve dans le modèle)
  templatePackMouse: 'verify-template-pack-mouse.mjs', // galerie, modèle livré avec ses tables (?dev) à la vraie souris : carte, aperçu en captures (nom, tables, pastilles, boutons principal / second), question « Créer les tables du modèle ? » (Annuler, Créer), refus d'une table qui gêne, 700x400 clair, sombre et anglais, 360x400
  layersMouse: 'verify-layers-mouse.mjs', // ordre d'empilement des couches flottantes à la vraie souris et au vrai clavier : la liste # et les menus de la barre du haut au-dessus des barres du tableau, d'une image et d'une bulle, 700x400
  tableUndoKeyboard: 'verify-table-undo-keyboard.mjs',
  trackColumnsMouse: 'verify-track-columns-mouse.mjs', // « Colonne avant / après / Supprimer la colonne » avec le suivi des modifications : colonne alignée, teintée, barrée, Ctrl+Z, enregistrement puis réouverture, cellule fusionnée (suppression grisée), fond de cellule et largeur de colonne suivis (barre « Accepter / Refuser » un par un, toute la colonne, valeur d'origine, tableau automatique), colonne ajoutée ou supprimée puis colorée ou tirée, alignement changé deux fois, 700x400 clair et sombre
  trackRowsMouse: 'verify-track-rows-mouse.mjs', // « Ligne avant / après / Supprimer la ligne » avec le suivi des modifications : ligne pleine largeur, teintée, barrée, Ctrl+Z, enregistrement puis réouverture, cellule fusionnée (suppression grisée), 700x400 clair et sombre
  trackTextColorsMouse: 'verify-track-text-colors-mouse.mjs', // texte inséré et supprimé du suivi à la vraie souris et au vrai clavier, 700x400 clair et sombre : couleurs calculées à 4,5:1 et pixels peints (teintes d'une colonne suivie, page blanche)
  suggestionBarMouse: 'verify-suggestion-bar-mouse.mjs', // barre « Accepter / Refuser » d'UNE modification du suivi à la vraie souris et au vrai clavier, 700x400 clair et sombre : ouverte au clic et au glisser (jamais pendant la frappe ni souris appuyée), sous le curseur et entière dans la fenêtre, 4,5:1 et pixels peints, « Accepter » / « Refuser » d'une modification sur trois, un seul Ctrl+Z, anglais, texte tout en bas, colonne de tableau suivie résolue depuis une case, étiquette « Proposé par … » (nom, adresse à défaut, « et N autres », rien sans auteur connu, après les boutons)
  suggestionReadingMouse: 'verify-suggestion-reading-mouse.mjs', // Lecture « comme si toutes les modifications étaient acceptées » (js/track-changes-reading.js:acceptedView, js/reader-mode.js) à la vraie souris et au vrai clavier, 700x400 clair et sombre : ajout, mot supprimé et remplacement tapés avec le suivi, la Lecture n'a plus ni <ins> ni <del>, le fond vert pâle derrière le texte ajouté (calculé et pixels peints, page blanche autour, couleur du texte inchangée, ni barré ni souligné, 4,5:1), retour à l'édition : suggestions toujours en attente
  layerImagesMouse: 'verify-layer-images-mouse.mjs', // images en calque d'un ancien modèle chargées éditeur masqué (macro-modèle, Mode lecture) : leur position de page se mesure au retour de l'éditeur, 700x400
  macroImagesMouse: 'verify-macro-images-mouse.mjs', // images en calque d'un macro-modèle (js/macro-templates.js, js/reader-mode.js, js/pdf-export.js) : chacune reste dans son courrier en Lecture et dans le PDF téléchargé par le vrai bouton, 700x400
  macroSubmodelMouse: 'verify-macro-submodel-mouse.mjs', // stylo d'un modèle dans le résumé d'un macro-modèle et bandeau « Revenir au macro-modèle » (js/macro-editor.js, js/main.js) à la vraie souris, au vrai clavier et à la molette, 700x400 : ouvrir, revenir, question avant d'abandonner une modification, Lecture, nom très long, sept annexes, modèle supprimé ; clair, sombre et anglais
  macroMarginsNoteMouse: 'verify-macro-margins-note-mouse.mjs', // mention « les marges du macro-modèle priment » de l'onglet Marges (js/settings.js:setMacroMode) à la vraie souris à 700x400 : cachée avec un modèle simple (aucune place), entière et lisible avec un macro-modèle (français clair, anglais sombre, contraste), les quatre champs restent saisissables
  macroHiddenMouse: 'verify-macro-hidden-mouse.mjs', // œil d'un modèle dans le résumé d'un macro-modèle (js/macro-editor.js, js/macro-templates.js) à la vraie souris et au vrai clavier à 700x400 : œil après le stylo, un clic le ferme (barré, enfoncé, nom grisé, coin d'état), Lecture sans le modèle ni rien à sa place, Tab, Espace, Entrée, ligne Grist, modèle supprimé, nom très long ; clair, sombre et anglais
  readerLateMouse: 'verify-reader-late-images-mouse.mjs', // Lecture d'un macro-modèle à la vraie souris à 700x400 avec une pièce jointe lente (réseau retardé) : la Lecture attend l'image, suit celle qui arrive plus tard, les coupures de page sont celles d'une image déjà là ; lectures de tables comptées
  wideImagesMouse: 'verify-wide-images-mouse.mjs', // images trop larges dans le PDF et le Word (js/export-common.js:shownImageWidthPx) : au vrai clic à 700x400, le PDF et le Word téléchargés sont relus, chaque image a la largeur que l'éditeur lui montre
  imageZoomMouse: 'verify-image-zoom-mouse.mjs', // gestes sur une image à la vraie souris à 700x400 (feuille réduite à ~0,85) : devant le texte, glisser, redimensionner, à gauche / au centre / à droite ; témoin à 1400x1000
  pageLayerMouse: 'verify-page-layer-mouse.mjs', // « Sur toutes les pages » à la vraie souris à 700x400 : le bouton de la barre de l'image coche et décoche la case, grisé hors du calque derrière le texte (info-bulle, clic sans effet), barre dans le panneau, flèches, HTML enregistré, anglais ; témoin à 1400x1000
  fullPagesMouse: 'verify-full-pages-mouse.mjs', // « Pages entières » à la vraie souris à 700x400 puis 1400x1000 : la couture (pied, gouttière, en-tête) ne vole aucun clic, le pied et l'en-tête ouvrent leur édition, l'image d'une page 2 se sélectionne et se déplace, une copie de « Sur toutes les pages » ne prend jamais la souris
  imageArrowsKeyboard: 'verify-image-arrows-keyboard.mjs', // flèches du clavier sur une image en calque sélectionnée (1 px, 10 px avec Maj), vrai clavier à 700x400 puis 1400x1000 ; le curseur qui arrive sur son ancre la traverse encore
  imageCornerMouse: 'verify-image-corner-mouse.mjs', // une image tirée dans un coin de la feuille avec un en-tête et un pied remplis, vraie souris à 700x400 : elle s'arrête dans le coin, garde son clic sous la zone, la marge à vide ouvre l'en-tête et le pied ; témoin à 1400x1000
  editorBlankTailMouse: 'verify-editor-blank-tail-mouse.mjs', // repère « Page 2 » de l'éditeur et lignes vides de fin (js/header-footer-preview.js:trailingBlankStart) : au vrai clavier à 700x400, Entrées de trop au bas d'une page, texte tapé puis effacé, saut de page au bouton de la barre
  tailAnchorMouse: 'verify-tail-anchor-mouse.mjs', // image flottante seule sur sa ligne de fin (js/header-footer-preview.js:trailingBlankStart, js/reader-mode.js:trimTrailingBlankBlocks) : petit format 100 x 70 mm ouvert par la liste des modèles à 700x400, vrai clic sur l'image, barre de l'image, Suppr et Ctrl+Z, puis Lecture, PDF et Word relus - une seule page partout, ancre du Word dans le paragraphe qui précède
  floatingKeysMouse: 'verify-floating-image-keys-mouse.mjs', // Retour arrière et Suppr n'emportent plus une image en calque (js/editor-nodes.js:createFloatingImageKeysExtension) : vrai clavier et vraie souris à 700x400, image d'un fichier puis image PJ, devant puis derrière le texte, clair et sombre - clic dans la ligne qui ne porte que l'image, triple clic sur une ligne qui la porte, Suppr en fin de titre ; l'image reste à la même place de l'écran, l'image sélectionnée et Ctrl+A partent toujours, une image au fil du texte est sélectionnée d'abord et effacée par la seconde frappe
  behindClicksMouse: 'verify-behind-image-clicks-mouse.mjs', // un clic sur du texte posé sur une image derrière le texte atteint le texte (js/editor-nodes.js:createBehindImageClickThroughExtension) : vraie souris à 700x400, image d'un fichier puis image PJ, clair et sombre - clic, double et triple clic, glissé, clic ailleurs sur l'image (la sélectionne), poignée de déplacement, image devant le texte inchangée
  headerFooterMouse: 'verify-header-footer-mouse.mjs', // en-tête et pied de page vides (js/header-footer-preview.js) : clic dans la marge puis « Terminer » sans rien écrire, texte tapé, tout effacé, modèle déjà enregistré activé vide, 700x400
  tableWidthsMouse: 'verify-table-widths-mouse.mjs', // largeurs de colonnes quand on change de modèle éditeur masqué (macro-modèle, Mode lecture), Aperçu A4, 700x400
  chipCellMouse: 'verify-chip-cell-mouse.mjs',
  englishTextsMouse: 'verify-english-texts-mouse.mjs', // vraie souris à 700x400, interface en anglais : les sept textes de l'audit F7, puis retour au français par Réglages
  findReplaceMouse: 'verify-find-replace-mouse.mjs', // Rechercher / Remplacer (js/find-replace.js) à la vraie souris et au vrai clavier : loupe, barre de 700 px, Entrée / Maj+Entrée, options, Remplacer puis Ctrl+Z, Tout remplacer, suivi des modifications, Échap, Ctrl+F / Ctrl+H, Mode lecture, 3 500 résultats à la molette ; 700x400 clair, sombre et anglais
  textExpansionKeyboard: 'verify-text-expansion-keyboard.mjs', // expansion « §ub » à la vraie frappe et à la vraie souris, 700x400 : liste sous le curseur, Tab, Entrée, flèches, Échap, Retour arrière, liste à puces, bloc de code, onglet Réglages > Raccourcis, clair, sombre et anglais, plus de 50 abréviations (« Encore N résultats » collée au bas)
  shortcutsKeyboard: 'verify-shortcuts-keyboard.mjs', // raccourcis clavier à la vraie frappe et à la vraie souris, 700x400 : touches de départ, changer / retirer / rendre une touche, refus sous la touche, Tab et Entrée, liste de 48 lignes qui défile, infobulles et lignes de menu, clair, sombre, anglais et mode Mac
  tableCutMouse: 'verify-table-page-cut-mouse.mjs', // tableau coupé entre deux lignes au saut de page (js/table-page-cut.js) à la vraie souris, 700x400 clair et sombre : bande sur le haut d'une ligne, clic, frappe, flèches, Tab, Lecture, PDF relu par pdf.js
  zoneCutMouse: 'verify-zone-page-cut-mouse.mjs', // zone à deux colonnes coupée au saut de page (js/zone-page-cut.js) à la vraie souris et au vrai clavier, 700x400 clair/français puis sombre/anglais : une couture DANS la zone, aucune ligne à cheval, colonnes égales qui reprennent à la même hauteur, clic et flèches de part et d'autre de la couture, liseré et bordures de colonnes (survol) sans pixel dans la couture, Entrée au vrai clavier qui ouvre la page suivante puis Ctrl+Z qui la referme (aucune trace dans le modèle enregistré), la Lecture coupe à la même ligne, lignes vides de fin de la dernière zone sans page de plus
  codeHygiene: 'verify-code-hygiene.mjs', // Node pur, sans navigateur : clés i18n, variables CSS et règles CSS sans usage
  templateOrganizerUnit: 'unit-template-organizer.mjs', // Node pur (vm) : logique de l'arbre de rangement, js/template-organizer.js
  templatePreferencesUnit: 'unit-template-preferences.mjs', // Node pur (vm + faux docApi) : js/template-preferences.js, file d'écritures et retour arrière
  conditionRulesUnit: 'unit-condition-rules.mjs', // Node pur (vm) : js/condition-rules.js:compareValues - vide, liste, Oui / Non, nombres, dates et fuseaux (navigateur réglé ailleurs qu'en UTC), un seul formateur Intl par fuseau
  calcMouse: 'verify-calc-mouse.mjs', // bulle « Calcul » (variables calculées) à la vraie souris et au vrai clavier : ligne « Calcul » de la liste « # », fenêtre dans 700x400, liste des colonnes devant elle, barre aux boutons grisés aux pixels, case étroite, Lecture, anglais ; 700x400 clair et sombre
  loopRulesUnit: 'unit-loop-rules.mjs', // Node pur (vm) : js/loop-rules.js:sourceFor, ce qu'une bulle peut parcourir (liste de références de la page, table liée par « match », dans une zone répétée une colonne Référence vers la zone) et la boucle imbriquée (within, by, nestedColumn, scopeFor)
  xlsxNumberFormatUnit: 'unit-xlsx-number-format.mjs', // Node pur (vm) : js/xlsx-number-format.js, le texte qu'Excel montre pour une valeur (euros, pourcentages, dates, zéros de tête, sections, français et anglais) - sert à l'import d'un classeur dans une grille
  formulaUnit: 'unit-formula.mjs', // Node pur (vm) : js/formula.js, le moteur des bulles « Calcul » (variables calculées) : opérations, listes de lignes, fonctions, fautes de syntaxe, écriture saisie et enregistrée
  scriptMarksMouse: 'verify-script-marks-mouse.mjs', // exposant et indice à la vraie souris et au vrai clavier à 700x400 : la rangée de deux icônes du menu « Lien et blocs de contenu » (volet entier dans le panneau, cibles d'au moins 24 px, infobulles avec la touche), un mot choisi à la souris mis en exposant ou en indice, l'un remplace l'autre, Ctrl+. et Ctrl+, au vrai clavier, la frappe qui suit, le dessin sur les rectangles réels, grisé en e-mail, clair, sombre et anglais
  formatPainterMouse: 'verify-format-painter-mouse.mjs', // pinceau de mise en forme à la vraie souris et au vrai clavier à 700x400 : le bouton sur la 2e rangée sans en ajouter, un mot, un glissé, un triple-clic, des cases de tableau, le double-clic qui garde le pinceau, Échap, Alt+Maj+C / V, clair, sombre et anglais
  startupReadsUnit: 'unit-startup-reads.mjs', // Node pur (vm + faux docApi qui compte ses appels) : ce que l'ouverture lit dans Grist - Templates.loadAll (une lecture), GristAPI.init (aucune table du document), GristAPI.refreshSchema (colonnes exactes, une passe à la fois), câblage d'index.html et de js/main.js
  userIdentityUnit: 'unit-user-identity.mjs', // Node pur (vm + faux docApi) : js/grist-api.js, la lecture du nom et de l'email de la personne - table-sonde d'avant la puce Nom migrée UNE fois, aucune écriture de schéma pour l'email seul, plusieurs puces = une lecture et une colonne ajoutée, compte sans nom, colonne refusée, lecteur du document
  nameSearchUnit: 'unit-name-search.mjs', // Node pur (vm) : js/search-select.js, la recherche par nom (searchWords, searchKey, foundIn, filterItems) - les écritures de Projets.Porteur_3, accents et casse, tous les noms d'une colonne (table, libellé Grist, indice), l'ordre de la liste, le coût sur 20 000 colonnes
  documentSettingsUnit: 'unit-document-settings.mjs', // Node pur (vm + faux docApi qui journalise ses écritures) : js/templates.js, la ligne réservée « réglages du document » de la table des modèles (couleurs du document, aucune table de plus) - jamais un modèle (liste, noms pris, lecture par identifiant), créée à la première écriture seulement, une seule ligne sous plusieurs changements de suite, une lecture partie avant une écriture ne la défait pas, écriture refusée = retour au dernier état confirmé, ligne écrite à la main, colonne TypeModele ajoutée avant la ligne
  colorMathUnit: 'unit-color-math.mjs', // Node pur (vm) : js/color-math.js (code # tapé, couleur CSS relue, aller-retour teinte-saturation-valeur, encre lisible) et les données de js/color-palette.js (palette de cinq rangées de dix)
  gristApiCoreUnit: 'unit-grist-api-core.mjs', // Node pur (vm + faux docApi) : js/grist-api.js, le cœur - ensureTable et createWriteQueue (pris par les modules du widget), init (souscriptions onRecord « shown » et « normal », options, lien, accès), detectTableId, types, choix et colonnes montrées tirés des métadonnées
  attachmentAccessUnit: 'unit-attachment-access.mjs', // Node pur (vm + faux docApi) : js/grist-api.js, l'accès aux pièces jointes - jeton demandé en lecture seule, identifiant (data-attachment-id d'un modèle) accepté seulement s'il est un numéro, jamais glissé dans le chemin de l'adresse sinon ; l'image d'un identifiant refusé garde son src
  scriptLoaderUnit: 'unit-script-loader.mjs', // Node pur (vm) : js/export-common.js, le chargeur de scripts des exports (audit externe du 04/10, C-EXFIL-05) - un script ne vient que d'un des deux CDN de la politique de sécurité du contenu, en https et avec son empreinte SRI, ou du dépôt ; faux CDN, http, javascript:, data:, empreinte absente refusés sans toucher au document ; les sept bibliothèques du widget passent la règle
  userNameChipMouse: 'verify-user-name-chip-mouse.mjs', // puce « Nom de l’utilisateur » à la vraie souris à 700x400, en français et en anglais : ligne juste après l'email dans la liste « # » (Calcul reste atteignable), un clic la pose, le nom en Lecture à côté de l'email, « [Nom indisponible] » / « [Name unavailable] » en rouge sans nom
  rowNumberChipMouse: 'verify-row-number-chip-mouse.mjs', // puce « N° de ligne » à la vraie souris à 700x400, en français et en anglais : ligne juste après le nom de l'utilisateur dans la liste « # », un clic la pose dans la première case d'une ligne de tableau répétée par une Boucle, 1, 2, 3 en Lecture dans l'ordre des lignes, en-tête non numéroté, puce toujours dans le modèle au retour
  startupOpenMouse: 'verify-startup-open-mouse.mjs', // ouverture sur un document aux tables lentes, vrai navigateur à 700x400, vraie souris et vrai clavier : table des modèles lue une fois, modèle affiché avant la lecture complète des tables, bulles jugées tout de suite, « # » liste les colonnes, colonnes exactes ensuite
  cspLoad: 'verify-csp.mjs', // politique de sécurité du contenu de index.html SANS contournement : le widget démarre, s'écrit, se lit et exporte sous la politique ; un script en ligne, un gestionnaire, une adresse javascript:, une balise de base, un cadre, un objet, un formulaire ne passent plus ; le vrai fichier d'API de Grist (réseau) s'évalue ; cadre à bac à sable
  firstContact: 'verify-first-contact.mjs', // premier contact avant la bêta : onglet (titre, icône, description), console muette, version des Crédits, langue du navigateur et choix enregistré, fenêtres « hors de Grist », « réseau bloqué », « chargement long » et « erreur » à la vraie souris et au vrai clavier (700x400, français et anglais, clair et sombre, contrastes), avertissement de la galerie
  lazyEngines: 'verify-lazy-engines.mjs', // chargement paresseux des moteurs d'export (js/export-engines.js), une page neuve par scénario : ni requête ni variable de moteur à l'ouverture, chaque export (PDF, Word, Excel d'une ligne ; ZIP de PDF, PDF unique, assemblage, ZIP de Word, ZIP d'Excel, classeur unique ; import d'un classeur) ne demande que ses moteurs, une fois, et produit son fichier ; un moteur injoignable arrête l'export, puis le même geste aboutit
  tableConsentUnit: 'unit-table-consent.mjs', // Node pur (vm + faux docApi) : la question avant de créer les tables du widget (js/grist-api.js:addTableIfMissing) - accord implicite d'un document qui porte déjà une table, une seule question partagée, refus jamais gardé et question reposée au geste suivant, sans question hors du harnais ; ce que font ensuite les modules qui créent une table (modèles, préférences, commentaires, liens, identité) quand elle est refusée
  tableConsentMouse: 'verify-table-consent-mouse.mjs', // la question « Créer les tables du widget dans ce document ? » à la vraie souris et au vrai clavier à 700x400, sur un document sans aucune table du widget : fenêtre entière, refus (rien d'écrit, aucune erreur), Enregistrer et Ctrl+S qui la reposent, Échap, « oui » ; français clair, anglais sombre, document déjà équipé sans question, démarrage long sans fenêtre « chargement long » par-dessus
};

const argv = process.argv.slice(2);
let port = 8843;
let probe = null; // --probe "<expression JS>" : ouvre le harnais, evalue, affiche - pour inspecter l'etat reel sans ecrire un scenario
// --preseed <fichier.js> : injecte ce fichier AVANT la navigation (page.addInitScript), donc avant que dev-tests/grist-stub.js ne s'execute lui-meme -
// il doit definir window.__preSeedGristStub = (stub) => {...}, appele par grist-stub.js juste apres avoir construit window.__gristStub, donc AVANT
// tout premier fetchTable de GristAPI.init(). Seul moyen de tester "le widget demarre avec tel modele deja marque par defaut" : setVariables/setRows
// APRES "Widget prêt." (la seule ouverture qu'offrait ce fichier jusqu'ici) arrive structurellement trop tard, une fois init() deja termine.
let preseedFile = null;
// --width/--height : viewport par défaut 1400x1000 pensé pour la fenêtre de dev, mais un panneau latéral
// Grist réel (là où vit ce widget) descend couramment à ~700x400 - certains bugs de mise en page/scroll
// (débordement de page masqué, barre d'outils qui remonte hors de portée) ne sont reproductibles qu'à
// cette taille (mesure du coordinateur, 2026-09-28, cf. js/template-tree-select.js:outsideScrollHandler).
let viewportWidth = 1400;
let viewportHeight = 1000;
const wanted = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--port') { port = Number(argv[++i]); continue; }
  if (argv[i] === '--probe') { probe = argv[++i]; continue; }
  if (argv[i] === '--preseed') { preseedFile = argv[++i]; continue; }
  if (argv[i] === '--width') { viewportWidth = Number(argv[++i]); continue; }
  if (argv[i] === '--height') { viewportHeight = Number(argv[++i]); continue; }
  wanted.push(argv[i]);
}
const preseedCode = preseedFile ? readFileSync(resolve(preseedFile), 'utf8') : null;
if (!probe) {
  for (const g of wanted) {
    if (!GROUPS[g] && !NODE_SCRIPTS[g]) {
      console.error(`Groupe inconnu : ${g}\nGroupes : ${[...Object.keys(GROUPS), ...Object.keys(NODE_SCRIPTS)].join(', ')}`);
      process.exit(2);
    }
  }
}
const groups = probe ? [] : (wanted.length ? wanted.filter(g => GROUPS[g]) : Object.keys(GROUPS));
const nodeScripts = probe ? [] : (wanted.length ? wanted.filter(g => NODE_SCRIPTS[g]) : Object.keys(NODE_SCRIPTS));
// GROUPS liste TOUS les groupes du projet, y compris ceux dont le fichier n'est pas encore sur la branche courante (plusieurs chantiers avancent en
// parallèle sur main). Un fichier absent n'est pas un échec de test : on le signale et on passe, au lieu de faire tomber la suite entière sur une
// exception de chargement de script qui ressemble à une régression.
const missingFiles = groups.filter(g => !existsSync(join(ROOT, 'dev-tests', `${GROUPS[g]}.js`)));
const runnable = groups.filter(g => !missingFiles.includes(g));
const missingNodeScripts = nodeScripts.filter(s => !existsSync(join(ROOT, 'dev-tests', NODE_SCRIPTS[s])));
const runnableNodeScripts = nodeScripts.filter(s => !missingNodeScripts.includes(s));

// === Serveur statique ===
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(target);
    // no-store partout : le piège du cache navigateur sur du JS servi en local est documenté dans
    // le README (faux négatifs/positifs après une modification de fichier).
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok, ko) => server.listen(port, '127.0.0.1', ok).on('error', ko));
const BASE = `http://127.0.0.1:${port}`;

// === Miroir hors-ligne des CDN ===
// Si dev-tests/.offline-cache a été construit (offline-deps.sh), on détourne chaque URL CDN vers le
// fichier local équivalent. Sinon on laisse passer : dans un environnement qui joint les CDN, le
// harnais tourne tel quel et ce bloc ne sert à rien.
const esmMapPath = join(CACHE, 'esm-map.json');
const OFFLINE = existsSync(esmMapPath);
const esmMap = OFFLINE ? JSON.parse(readFileSync(esmMapPath, 'utf8')) : {};
const UMD_ROUTES = OFFLINE ? [
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdfmake\.min\.js$/, 'umd/pdfmake.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/vfs_fonts\.min\.js$/, 'umd/vfs_fonts.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.min\.js$/, 'umd/pdf.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf\.worker\.min\.js$/, 'umd/pdf.worker.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/jszip\.min\.js$/, 'umd/jszip.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/pdf-lib\.min\.js$/, 'umd/pdf-lib.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/qrcode\.min\.js$/, 'umd/qrcode.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/plotly\.js-basic-dist-min@.*$/, 'umd/plotly-basic.min.js'],
].filter(([, rel]) => (rel !== 'umd/exceljs.min.js' && rel !== 'umd/qrcode.min.js' && rel !== 'umd/plotly-basic.min.js') || existsSync(join(CACHE, rel))) : [];
if (!OFFLINE) console.log('[run-headless] miroir hors-ligne absent (dev-tests/offline-deps.sh) - les CDN seront appelés en direct.');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

// Les bundles esbuild s'importent entre eux en RELATIF (`from "./chunk-XXXX.js"`). Servis sous des
// URL de base différentes (https://esm.sh/@tiptap/core@3.31.3 d'un côté, https://esm.sh/*prosemirror-model@1.25.11
// de l'autre), ces imports relatifs résolvent vers DEUX URL distinctes pour le même chunk - donc deux
// instances du même module. Symptôme exact observé : "Can not convert <> to a Fragment (looks like
// multiple versions of prosemirror-model were loaded)", et un `instanceof` qui échoue entre deux
// copies de ProseMirror. Réécrire chaque import de chunk vers une URL ABSOLUE unique règle le
// problème à la racine : une URL = un module, quelle que soit l'entrée qui l'a demandé.
const CHUNK_BASE = 'https://esm.sh/_offline-chunks/';
const absoluteChunks = code => code.replace(/(from\s*|import\s*)"\.\/(chunk-[A-Z0-9]+\.js)"/g, (_, kw, file) => `${kw}"${CHUNK_BASE}${file}"`);

const DEV_FILES = ['helpers', 'runner'];

async function runGroup(name, probeExpr) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: viewportWidth, height: viewportHeight } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  if (OFFLINE) {
    // L'importmap de index.html pointe vers esm.sh : on ne la réécrit PAS (le harnais doit rester
    // une copie fidèle de index.html), on détourne les requêtes qu'elle produit.
    await page.route('**://esm.sh/**', async route => {
      const url = route.request().url();
      const chunk = url.match(/\/(chunk-[A-Z0-9]+\.js)$/);
      if (chunk) {
        return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(CACHE, 'esm', chunk[1]), 'utf8')) });
      }
      const spec = Object.keys(esmMap).find(k => url === `https://esm.sh/${k}` || url === `https://esm.sh/*${k}` || url.startsWith(`https://esm.sh/${k}@`) || url.startsWith(`https://esm.sh/*${k}@`));
      if (!spec) return route.fulfill({ status: 404, body: `// pas de miroir local pour ${url}` });
      route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: absoluteChunks(await readFile(join(ROOT, esmMap[spec].replace(/^\//, '')), 'utf8')) });
    });
    for (const [re, rel] of UMD_ROUTES) {
      await page.route(re, async route => route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        // Ces scripts sont injectés avec crossOrigin='anonymous' (js/pdf-export.js) : sans en-tête CORS, le navigateur refuse la réponse détournée.
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: await readFile(join(CACHE, rel), 'utf8'),
      }));
    }
    // js/pdf-export.js protège ses scripts CDN par un hash SRI (`integrity`). Un miroir local ne peut PAS le satisfaire : cdnjs sert des variantes
    // minifiées propres (vfs_fonts.min.js n'existe même pas tel quel dans le paquet npm), donc le hash ne correspondra jamais, et le navigateur refuse le
    // script AVANT de l'exécuter - erreur "Échec de chargement du script". SRI est neutralisé ici, et UNIQUEMENT ici : c'est une protection contre un CDN
    // compromis, sans objet quand le fichier vient du disque local, et l'application réelle la garde intacte.
    await page.addInitScript(() => {
      Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get: () => '', set: () => {} });
    });
    // Polices Google : purement cosmétiques, jamais mesurées par un scénario - court-circuitées pour
    // ne pas attendre un timeout réseau à chaque page.
    await page.route('**://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
  }

  if (preseedCode) await page.addInitScript({ content: preseedCode });
  await page.goto(`${BASE}/_test-harness.html`, { waitUntil: 'load' });
  // L'éditeur se construit par import() dynamiques (js/editor.js) - attendre le vrai signe de vie,
  // pas un délai arbitraire.
  // Deux attentes, pas une. `EditorCore` est un `const` top-level d'un script classique : il vit dans
  // la portée lexicale globale, PAS comme propriété de `window` (`window.EditorCore` vaut toujours
  // undefined). Mais son existence ne suffit pas : l'éditeur existe déjà en 0x0 pendant que
  // main.js:init() finit de tourner, et `document.execCommand('insertText')` renvoie false tant qu'il
  // n'a pas sa vraie taille - des scénarios de frappe échouent alors avec des notes vides, ce qui
  // ressemble à une régression. Le seul signal fiable est le "Widget prêt." posé par la TOUTE
  // DERNIÈRE ligne de init().
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('status-msg');
    return !!el && /prêt|ready/i.test(el.textContent || '');
  }, null, { timeout: 90000 });
  // Les moteurs d'export ne se chargent qu'au premier export (js/export-engines.js) : les scénarios appellent PdfExport, DocxExport, XlsxExport, SheetLayout...
  // directement, ou les remplacent par un espion, et les trouvent chargés comme avant. Le chemin paresseux a son banc (dev-tests/verify-lazy-engines.mjs).
  await page.evaluate(() => ExportEngines.loadAll());
  // .a4-preview n'est jamais posée toute seule dans le harnais (piège documenté, README) : toute
  // mesure pixel dépend d'elle.
  await page.evaluate(() => { document.getElementById('editor-container').classList.add('a4-preview'); });

  if (probeExpr) {
    const probeResult = await page.evaluate(async expr => {
      try { return { value: await eval(expr) }; } catch (e) { return { error: String(e) }; }
    }, probeExpr);
    await browser.close();
    return { name, probe: probeResult, consoleErrors };
  }

  await page.evaluate(() => { window.EditorTestSuites = {}; });
  // Un groupe déclaré dans GROUPS dont le fichier n'existe pas sur la branche courante (une suite vivant encore sur une branche de travail, par ex.) est
  // ANNONCÉ et sauté, pas transformé en exception : sinon un `node dev-tests/run-headless.mjs` sans argument sort en code 1 alors que tout ce qui existe
  // est passé.
  if (!existsSync(join(ROOT, 'dev-tests', `${GROUPS[name]}.js`))) {
    await browser.close();
    return { name, pass: 0, fail: 0, absent: true, consoleErrors };
  }
  for (const f of [...DEV_FILES, GROUPS[name]]) {
    await page.addScriptTag({ url: `/dev-tests/${f}.js` });
  }
  const result = await page.evaluate(async groupName => {
    const suite = window.EditorTestSuites[groupName];
    if (!suite) return { missing: true };
    const results = await window.TestRunner.runGroup(groupName, suite);
    return { report: window.TestRunner.report(results), results: results.map(r => ({ name: r.id || r.name, pass: r.pass, notes: r.notes })) };
  }, name);

  await browser.close();
  if (result.missing) return { name, pass: 0, fail: 0, missing: true, consoleErrors };
  const fail = result.results.filter(r => !r.pass);
  return { name, pass: result.results.length - fail.length, fail: fail.length, failures: fail, report: result.report, consoleErrors };
}

if (probe) {
  const r = await runGroup('__probe__', probe);
  console.log(JSON.stringify(r.probe, null, 2));
  if (r.consoleErrors.length) console.log('--- erreurs console ---\n' + r.consoleErrors.join('\n'));
  server.close();
  process.exit(0);
}

let totalPass = 0, totalFail = 0;
const failing = [];
if (missingFiles.length) console.log(`\n(groupes ignorés, fichier absent de cette branche : ${missingFiles.join(', ')})`);
if (missingNodeScripts.length) console.log(`\n(scripts Node ignorés, fichier absent de cette branche : ${missingNodeScripts.join(', ')})`);
for (const g of runnable) {
  process.stdout.write(`\n=== ${g} ===\n`);
  try {
    const r = await runGroup(g);
    if (r.absent) { console.log(`  (dev-tests/${GROUPS[g]}.js absent de cette branche - groupe sauté)`); continue; }
    // Le fichier existe (sinon `absent` ci-dessus) mais « g » ne s'est pas inscrit dans EditorTestSuites : une erreur de syntaxe l'a empêché de se charger, ou il s'inscrit sous un autre nom.
    // La suite demandée n'a donc PAS tourné : la passe ne peut pas finir verte (calloutSignature est restée sautée près de quatre heures le 02/10, « 0 ECHEC » à la clé). Compté en échec,
    // avec les erreurs de la page (le SyntaxError y est) - choix d'Antoine du 02/10.
    if (r.missing) {
      totalFail++; failing.push(g);
      console.log(`  ECHEC groupe non chargé : dev-tests/${GROUPS[g]}.js existe mais « ${g} » n'est pas inscrit dans EditorTestSuites (erreur de syntaxe dans le fichier ? inscrit sous un autre nom ?)`);
      if (r.consoleErrors.length) console.log(`  (${r.consoleErrors.length} erreur(s) console)\n    ` + r.consoleErrors.slice(0, 5).join('\n    '));
      continue;
    }
    totalPass += r.pass; totalFail += r.fail;
    console.log(r.report);
    if (r.fail) { failing.push(g); r.failures.forEach(f => console.log(`  ECHEC ${f.name}: ${f.notes || ''}`)); }
    if (r.consoleErrors.length) console.log(`  (${r.consoleErrors.length} erreur(s) console)\n    ` + r.consoleErrors.slice(0, 5).join('\n    '));
  } catch (e) {
    totalFail++; failing.push(g);
    console.log(`  EXCEPTION sur le groupe ${g} : ${e.message}`);
  }
}
for (const s of runnableNodeScripts) {
  process.stdout.write(`\n=== ${s} (Node, molette/souris réelle) ===\n`);
  const scriptPath = join(ROOT, 'dev-tests', NODE_SCRIPTS[s]);
  // Port distinct de celui du serveur statique ci-dessus : ce script lance le sien (il a besoin de sa
  // propre page, indépendante de tout groupe GROUPS déjà passé).
  const r = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8', env: { ...process.env, WHEEL_SCROLL_PORT: String(port + 53) } });
  const out = ((r.stdout || '') + (r.stderr || '')).trimEnd();
  console.log(out);
  const m = out.match(/(\d+)\/(\d+) passés\s*$/);
  if (m) {
    const pass = Number(m[1]), tot = Number(m[2]), fail = tot - pass;
    totalPass += pass; totalFail += fail;
    if (fail) failing.push(s);
  } else {
    totalFail++; failing.push(s);
    console.log(`  (sortie inattendue de ${s}, code de sortie ${r.status})`);
  }
}
console.log(`\n=== TOTAL : ${totalPass} OK, ${totalFail} ECHEC(S) ===`);
if (failing.length) console.log('Groupes en échec : ' + failing.join(', '));
server.close();
process.exit(totalFail ? 1 : 0);
