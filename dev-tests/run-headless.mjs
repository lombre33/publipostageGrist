#!/usr/bin/env node
// Lance les groupes de dev-tests/ dans un Chromium headless, sans aucune manipulation manuelle -
// remplace la procédure "ouvrir _test-harness.html et coller du JS dans la console" du README pour
// tout ce qui doit tourner sans humain (session Claude Code, CI, vérification avant un commit).
//
// Usage :
//   node dev-tests/run-headless.mjs                      # tous les groupes, un navigateur par groupe
//   node dev-tests/run-headless.mjs comments formatting  # seulement ces groupes
//   node dev-tests/run-headless.mjs --port 8899 formatting
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
  watermark: 'scenarios-watermark', // filigrane de la page (roadmap n° 14) : réglage borné, géométrie commune, éditeur, Lecture, PDF (texte derrière le contenu), Word (image de l'en-tête), enregistrement, fenêtre, ligne du menu Page
  docx: 'scenarios-docx',
  docxImages: 'scenarios-docx-images',
  comments: 'scenarios-comments',
  autosave: 'scenarios-autosave',
  autosaveRace: 'scenarios-autosave-race', // enregistrement automatique face à un Grist lent : passages qui se chevauchent, Enregistrer pendant un passage, changement de modèle pendant une lecture, relecture échouée
  autosaveIdle: 'scenarios-autosave-idle', // enregistrement automatique AU REPOS (js/main.js, AUTOSAVE_IDLE_INTERVAL_MS) : la table des modèles n'est relue que toutes les 15 s quand rien n'est à enregistrer et un enregistrement fait ailleurs est signalé à la lecture suivante ; la frappe relit toujours AVANT d'écrire. Vrais minuteurs : ~45 s
  toolbarChrome: 'scenarios-toolbar-chrome',
  macroModeles: 'scenarios-macro-modeles',
  templateTree: 'scenarios-template-tree',
  templateOrganize: 'scenarios-template-organize',
  templateGallery: 'scenarios-template-gallery',
  pageTree: 'scenarios-page-tree', // rangement des pages que Grist crée avec les tables du widget (js/page-tree.js) : sous celle des modèles, repliées par défaut
  rowTemplate: 'scenarios-row-template', // modèle selon la ligne (js/row-template.js, Réglages > Selon la ligne) : règles, repli, Lecture et édition, question avant de quitter des modifications, onglet, et l'onglet qui suit les droits changés Réglages ouverts sans redessiner la saisie
  viewTemplate: 'scenarios-view-template', // modèle par défaut de la vue (js/view-template.js, Réglages > Vue) : bouton « Utiliser … pour cette vue », « Retirer », grisés, choix venu d'ailleurs, repli des règles de ligne, lecture seule, et les boutons qui suivent les droits changés Réglages ouverts
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
  varColumn: 'scenarios-var-column', // bouton « Colonne… » de la barre d'une bulle : changer ou réparer la colonne d'une variable (js/variable-column.js)
  schemaRenames: 'scenarios-schema-renames', // suivi des renommages de tables et de colonnes faits dans Grist : mappeur, réécriture des modèles et des clés de correspondance, lecture seule, modèle affiché (js/schema-renames.js)
  settingsColumns: 'scenarios-settings-columns', // avertissement d'ouverture : Réglages > Accès ou > Selon la ligne cite une colonne (ou la table des droits) qui n'existe plus dans Grist (js/settings-columns.js)
  varZero: 'scenarios-var-zero',
  varList: 'scenarios-var-list', // listes d'une variable (colonne Liste de choix ou Liste de références) : toutes avec séparateur, première, dernière, n-ième ; moteur, Lecture, lot, barre, fenêtre « Liste » (js/variable-list.js)
  varNumber: 'scenarios-var-number-default',
  varBool: 'scenarios-var-bool', // variable Oui / Non : barre à quatre écritures (trois cases de la liste à cases, vrai / faux), la case en Lecture, PDF (polices de cases), Word, Excel et e-mail, le barré, les champs texte inchangés
  linkConfig: 'scenarios-link-config',
  columnSearch: 'scenarios-column-search',
  pdfBatch: 'scenarios-pdf-batch',
  sheetAssembly: 'scenarios-sheet-assembly', // « Assemblage avant impression » (js/sheet-layout.js, js/sheet-assembly-dialog.js, js/pdf-merge.js:createSheets) : géométrie des planches, fenêtre de réglage, PDF relu par pdf.js (feuilles, texte par emplacement, traits de coupe tracés et peints), menu, droits d'export, grille
  accessRights: 'scenarios-access-rights',
  linksBlocks: 'scenarios-links-blocks',
  calloutSignature: 'scenarios-callout-signature',
  qrCode: 'scenarios-qr-code', // QR code (js/qr-code.js) : ligne du menu de la chaîne, fenêtre, image et cadre de l'éditeur, Lecture, PDF, Word et Excel, relus par un décodeur (jsQR)
  caption: 'scenarios-caption', // légende sous une image ou un tableau (js/caption.js) : attribut `data-caption`, boutons des barres flottantes, grisage, tableau / case / colonne, texte d'attente, suivi, style de l'éditeur et de la Lecture, PDF, Word, e-mail
  grid: 'scenarios-grid', // mode grille (js/grid-editor.js) : un seul tableau sans feuille, bandeaux A, B, C / 1, 2, 3, barre grisée, garde-fou
  gridTable: 'scenarios-grid-table', // tableau de tableur collé dans une grille (js/grid-table.js) : le presse-papiers d'Excel (HTML + texte + image), de Google Sheets et de LibreOffice lu case par case (fusions, fond, traits, alignements, marques), collé pour de vrai, aucune image, un seul Annuler
  gridImport: 'scenarios-grid-import', // import d'un classeur Excel dans une grille (js/grid-xlsx-import.js) : facture lue case par case (fusions, fonds du thème, traits, tailles, texte riche, liens sûrs, lignes et colonnes masquées), texte d'Excel en français et en anglais, erreurs, limites, grille chargée sans correction case par case, largeurs gardées depuis un document, question avant d'abandonner, aller-retour avec l'export
  blankLastPage: 'scenarios-blank-last-page', // page blanche en fin de document : Lecture, PDF, Word, et le repère « Page 2 » de l'éditeur (js/header-footer-preview.js:trailingBlankStart)
  tablePageCut: 'scenarios-table-page-cut', // un tableau se coupe entre deux lignes au saut de page (js/table-page-cut.js) : règle, couture de l'éditeur et de la Lecture, PDF relu par pdf.js, Word
  findReplace: 'scenarios-find-replace', // Rechercher / Remplacer (js/find-replace.js) : moteur, panneau, loupe, remplacement en une étape d'annulation, mode suivi, textes FR / EN, contrastes
  layers: 'scenarios-layers', // ordre d'empilement des couches flottantes (js/layers.js, jetons --z-* ) : barres flottantes < menus < info-bulles < fenêtres, le dernier ouvert au-dessus, menu # sous la barre du tableau
  imageParity: 'scenarios-image-parity', // bande d'en-tête et de pied sur le PDF : même origine du corps, même coin de feuille, mêmes coupures de page et mêmes marges dans l'éditeur, la Lecture, le PDF et le Word
  pageLayer: 'scenarios-page-layer', // « Sur toutes les pages » (js/page-layer.js) : la case de la barre de l'image, puis le PDF (fond de chaque page) et le Word (ancre dans l'en-tête de chaque page), macro-modèles compris
  fullPages: 'scenarios-full-pages', // « Pages entières » : chaque feuille à sa taille réelle dans l'éditeur et la Lecture (couture = bas de page, gouttière, haut de page), fond de feuille derrière le corps de la Lecture, copies de « Sur toutes les pages » sur les pages 2 et plus à la place du PDF
  xlsx: 'scenarios-xlsx', // export Excel d'une grille (js/xlsx-export.js) : le .xlsx est dézippé et son OOXML lu (valeurs, formats, largeurs, fusions, liens, images, menu)
  externalImages: 'scenarios-external-images', // fenêtre qui liste les sites externes des images avant un export (js/external-images.js) : le module, un PDF et un Word, les lots, l'annulation
  textExpansion: 'scenarios-text-expansion', // expansion de texte « §ub » (js/text-expansion.js) : abréviations par personne dans une table du document, règle de saisie, onglet Réglages > Raccourcis, contrastes
  shortcuts: 'scenarios-shortcuts', // raccourcis clavier personnalisables (js/shortcuts.js, js/shortcuts-panel.js) : combinaisons, touches de départ, une touche changée libère l'ancienne, refus, boutons grisés, infobulles, liste des Réglages, contrastes
  imageWide: 'scenarios-image-wide', // images trop larges dans le PDF et le Word (js/export-common.js:shownImageWidthPx) : la largeur que l'éditeur montre, dans le corps, une case, une colonne, centrée, flottante, selon le format de page
  varCalc: 'scenarios-var-calc', // bulle « Calcul » (variables calculées) : nœud, fenêtre, barre flottante, Lecture, PDF, Word, zones répétées, total de lignes
  emailExport: 'scenarios-email-export', // texte et lien du mode Email (js/mailto-export.js) : puces et numéros comme l'éditeur, retraits sous le texte de l'item, citations en « > », le vrai chemin éditeur -> Lecture -> texte, l'URL construite et sa jauge
  cleanReading: 'scenarios-clean-reading', // Lecture épurée (js/clean-reading.js) : ligne « Lecture épurée » sous Mode lecture, barre du haut cachée, bouton de sortie, Échap, retour au mode d'origine, focus, langue
  readerReads: 'scenarios-reader-reads', // la Lecture lit chaque table une seule fois par rendu (js/grist-api.js:withReadPass) et suit une image qui change de taille après la mesure (js/reader-mode.js:watchGeometry)
  readerGuide: 'scenarios-reader-guide', // guide de la Lecture sans ligne (js/reader-guide.js, img/reader-guide/) : guide en trois étapes sans « Sélectionner par », court message quand le widget est relié, captures FR / EN, mise à jour sans recharger, clic sur une capture, contrastes clair et sombre
  imageText: 'scenarios-image-text', // image « Au cœur du texte » et texte autour (js/editor-nodes.js, css/editor-v2.css, js/reader-mode.js, js/pdf-export.js, js/docx-export.js) : l'image seule sur sa ligne, l'habillage gauche / droite, l'image dans la ligne, la bascule en ligne / bloc, mesurés dans l'éditeur, la Lecture, le PDF et le Word
  formatPainter: 'scenarios-format-painter', // pinceau de mise en forme (js/format-painter.js, bouton après le surlignage, Alt+Maj+C / V) : ce qui est copié et posé, le paragraphe sur un curseur ou un paragraphe entier, une étape d'historique, armé par un clic ou un double-clic, grisé en e-mail et en macro-modèle, les touches
  tableCells: 'scenarios-table-cells', // sélection de plusieurs cases d'un tableau (CellSelection) : gras, taille, police, couleurs, surlignage, puces, numéros, citation, retrait et retrait inverse sur toutes les cases choisies (et leurs touches Ctrl+Maj+B, Ctrl+Maj+8, Ctrl+Maj+7, Ctrl+Maj+9), la sélection reste, un seul Annuler ; copier, couper, coller en tableau tabulé
  htmlSanitize: 'scenarios-html-sanitize', // HTML qui ne vient pas de l'éditeur (js/html-sanitize.js, Editor.setHTML) : rien ne s'exécute, rien d'actif ne survit, tout ce que l'éditeur écrit reste
};

// Scripts Node autonomes (page.mouse réel, pas de page.evaluate) : structurellement à part de GROUPS
// ci-dessus, qui exécute tout DANS la page (cf. runGroup) et ne peut donc jamais déclencher un geste de
// molette/survol "trusted" par le navigateur. Inclus par défaut dans `node run-headless.mjs` sans
// argument (la suite complète), et invocables seuls par leur nom comme un groupe normal -
// [[project-publipostage-scroll-chaining-popup-fix]].
const NODE_SCRIPTS = {
  wheelScroll: 'verify-wheel-scroll.mjs',
  readerGuideMouse: 'verify-reader-guide-mouse.mjs', // guide de la Lecture sans ligne à la vraie souris à 700x400, clair et sombre, français et anglais : titre et première étape dans le panneau, trois étapes atteignables à la molette, clic sur une vraie capture, lien changé en direct, ligne arrivée
  varToolbarMouse: 'verify-var-toolbar-mouse.mjs',
  varBoolMouse: 'verify-var-bool-mouse.mjs', // barre d'une bulle Oui / Non à la vraie souris : quatre boutons atteignables, bouton enfoncé, Lecture mesurée aux pixels d'une vraie capture ; 700x400 clair, sombre et anglais
  varListMouse: 'verify-var-list-mouse.mjs', // fenêtre « Liste » d'une variable à la vraie souris et au vrai clavier : bouton de la barre (entre Boucle et Colonne, grisé pour un texte), fenêtre entière dans 700x400, choix, numéro et séparateurs tapés, aperçu, Enregistrer, Lecture, Remettre par défaut, Échap ; clair, sombre et anglais
  condTextMouse: 'verify-cond-text-mouse.mjs', // bloc de texte conditionnel à la vraie souris : liste « # » et Chips, étiquette et barre (icônes grisées aux pixels), fenêtre de condition, blocs emboîtés, texte entouré, Lecture ; 700x400 clair et sombre
  condCheckboxMouse: 'verify-cond-checkbox-mouse.mjs', // case conditionnelle à la vraie souris : liste « # » et Chips, UN clic pose la puce et ouvre sa barre (icônes grisées aux pixels), fenêtre de condition, colonne étroite, Lecture mesurée aux pixels ; 700x400 clair, sombre et anglais
  condValueMouse: 'verify-cond-value-mouse.mjs', // valeur conditionnelle à la vraie souris et au vrai clavier : liste « # » et Chips, frappe dans la valeur, Entrée, flèches qui en sortent et frappe derrière (ou devant) son cadre, Retour arrière et Suppr aux bords, texte vidé sans perdre la valeur, barre et fenêtre de condition, texte sélectionné entouré, Lecture ; 700x400 clair, sombre et anglais, puis 360 px
  captionMouse: 'verify-caption-mouse.mjs', // légende sous une image ou un tableau à la vraie souris et au vrai clavier : barre de l'image et du tableau, bouton « Légende » (actif, grisé), texte d'attente, frappe, Entrée, Ctrl+Z, Retour arrière ; 700x400 clair, sombre et anglais
  modalBaseMouse: 'verify-modal-base-mouse.mjs', // base commune des fenêtres (js/modal-base.js) : Condition, Autres attributs, Boucle - titre et boutons fixes, Tab, Échap
  modalPagesMouse: 'verify-modal-pages-mouse.mjs', // même base, lot 2 : les sept fenêtres d'index.html (Réglages, Tables liées, Clé de correspondance, Macro-modèle, Organiser, Galerie, Aperçu)
  dialogsMouse: 'verify-dialogs-mouse.mjs', // saisies et confirmations (js/dialogs.js) à la place de prompt/confirm : au-dessus des autres fenêtres, Tab, Échap, focus rendu
  externalImagesMouse: 'verify-external-images-mouse.mjs', // fenêtre avant l'export d'un modèle qui contient une image d'un site externe (js/external-images.js) : vrai clic sur Exporter PDF / DOCX / lot ZIP, Annuler, Échap, Tab, Continuer, quarante sites qui défilent, 700x400 clair, sombre et anglais
  smallPanel: 'verify-small-panel.mjs',
  accessRightsMouse: 'verify-access-rights-mouse.mjs',
  rowTemplateMouse: 'verify-row-template-mouse.mjs', // modèle selon la ligne (Réglages > Selon la ligne) à la vraie souris dans 700x400 : onglets lisibles (FR, EN), case, colonne / valeur / modèle dans leurs listes avec recherche, option écrite, ouverture à la fermeture, ligne suivante en édition et en Lecture
  schemaRenamesOpen: 'verify-schema-renames-open.mjs', // ouverture réelle du widget après un renommage dans Grist : rien avant l'affichage du modèle, modèle réécrit et redessiné, message dans 700x400, rien d'écrit à l'ouverture suivante
  settingsColumnsOpen: 'verify-settings-columns-open.mjs', // ouverture réelle du widget quand Accès ou Selon la ligne cite une colonne disparue : rien avant l'affichage du modèle, avertissement devant « Mis à jour après un renommage… », entier au survol dans 700x400, rien d'écrit, table des droits renommée (l'onglet Accès reste modifiable, l'onglet Vue se dégrise tout de suite)
  templateStartupMouse: 'verify-template-startup-mouse.mjs', // modèle ouvert au démarrage, faux Grist semé avant l'init : la ligne qui désigne un modèle, puis le modèle de la vue, puis le ★ ; un choix de vue supprimé ou devenu email est ignoré
  emailMouse: 'verify-email-mouse.mjs', // « Créer l'email » au vrai clic à 700x400 : le lien mailto: ouvert est capté puis décodé - objet et destinataire tapés au vrai clavier, puces de l'éditeur, retraits sous le texte, « > » devant la citation, CRLF, jauge égale à la longueur du lien
  runnerGroupLoad: 'verify-runner-group-load.mjs', // le lanceur lui-même : un groupe dont le fichier existe mais ne se charge pas (SyntaxError) est un ECHEC avec l'erreur de la page, un fichier absent de la branche reste annoncé et sauté ; lance une copie du lanceur sur deux groupes d'essai, un navigateur
  linksBlocksMouse: 'verify-links-blocks-mouse.mjs', // lien, citation, bloc de code sous une icône (js/link-dialog.js) : survol du menu, fenêtre et Ctrl+K au vrai clavier, Ctrl+clic, info-bulle, 700x400 clair, sombre et anglais
  calloutMouse: 'verify-callout-mouse.mjs', // encadré et bloc de signature (js/callout.js) : menu de cinq lignes, fenêtre sans défilement, vraie souris et vrai clavier, 700x400 clair, sombre et anglais
  watermarkMouse: 'verify-watermark-mouse.mjs', // filigrane (js/watermark-dialog.js, ligne « Filigrane… » du menu Page) : menu, fenêtre sans défilement, frappe, couleurs, curseur, aperçu, Valider / Annuler / Échap / Entrée / Retirer, éditeur et Lecture, vraie souris et vrai clavier, 700x400 clair, sombre et anglais
  sheetAssemblyMouse: 'verify-sheet-assembly-mouse.mjs', // assemblage avant impression (js/sheet-assembly-dialog.js, ligne du menu Exporter en PDF) : menu, fenêtre sans défilement dans tous ses états, vrais clics et flèches, choix grisé lisible, « Générer » / Annuler / Échap / Entrée, PDF téléchargé relu par pdf.js, 700x400 clair, sombre et anglais
  qrMouse: 'verify-qr-mouse.mjs', // QR code (js/qr-code.js) : ligne du menu de la chaîne, fenêtre sans défilement, liste des colonnes au-dessus de la fenêtre, cadre carré, menu devant la barre flottante, vraie souris et vrai clavier, 700x400 clair, sombre et anglais
  gridImportMouse: 'verify-grid-import-mouse.mjs', // import d'un classeur Excel (ligne « Importer un Excel… » du menu « + ») : vrai clic, vrai sélecteur de fichier, grille visible et message d'état entier, « Modifications non enregistrées » après le choix du fichier, fichier illisible, 700x400 clair, sombre et anglais
  docPasteMouse: 'verify-doc-paste-mouse.mjs', // tableau copié dans Excel, Google Sheets ou LibreOffice Calc et collé dans un DOCUMENT : le VRAI presse-papiers de Chromium (HTML tel quel, texte tabulé, image PNG), un vrai Ctrl+V, Ctrl+Maj+V et Ctrl+Z à 700x400 clair et sombre - un tableau du document sans l'image, titre fusionné lisible, un seul Annuler, texte seul avec Ctrl+Maj+V, Sheets et LibreOffice, une image seule toujours collée comme image
  gridMouse: 'verify-grid-mouse.mjs', // mode grille (js/grid-editor.js) : « Nouvelle grille » à la souris, tirer un trait de colonne ou de ligne (aperçu, un seul Annuler), bandeaux, flèches et Ctrl+A, défilement collé, contrastes, 700x400 clair et sombre
  tableSelectMouse: 'verify-table-select-mouse.mjs', // sélection de cases en glissant la souris, tableau de document et grille : rectangle exact dans tous les sens, voile visible sur une case colorée, défilement tenu au bord du panneau, barre de la case fixée dans sa bande (aucune case recouverte), clavier ; 700x400 clair et sombre
  tableCellsMouse: 'verify-table-cells-mouse.mjs', // mise en forme et copier-coller de plusieurs cases d'un tableau à la vraie souris et au vrai clavier : glisser 2x2, boutons de la barre (gras, taille, police, couleurs, puces, citation, retrait, retrait inverse), cases voisines intactes, sélection gardée, Annuler, Ctrl+C / X / V, Suppr, Ctrl+Maj+B / 8 / 7 / 9 ; 700x400 clair
  gridCellsMouse: 'verify-grid-cells-mouse.mjs', // barre de la case d'une grille : fusionner, scinder (UNE case, taille des colonnes gardée, un Ctrl+Z chacun), alignement vertical en haut, au milieu, en bas, boutons grisés jamais retirés, barre d'un tableau de document inchangée ; 700x400 clair et sombre
  gridBordersMouse: 'verify-grid-borders-mouse.mjs', // menu « Bordures » de la barre d'une grille : bouton dans la bande, menu sous la bande tout entier sous le pointeur, couleur du stylo sans fermer le menu, réglages appliqués en un Ctrl+Z, « Intérieures » grisé jamais retiré, trait partagé écrit des deux côtés, case fusionnée, menu de fond sous la bande ; 700x400 clair et sombre
  gridPageBreakMouse: 'verify-grid-pagebreak-mouse.mjs', // saut de page d'une grille : bouton « Saut de page » grisé (première ligne, case fusionnée) jamais retiré, un vrai clic le pose avant la ligne, trait en tirets mesuré sur les pixels, pastille dans le numéro sans cacher la poignée, « Fusionner » grisé quand la sélection l'enjambe, bouton portrait / paysage actif dans une grille ; 700x400 clair et sombre
  orientationMouse: 'verify-orientation-mouse.mjs', // bascule Portrait / Paysage d'un modèle classique : feuille mesurée aux pixels, pagination, Lecture, enregistrement automatique, clavier ; 700x400 clair et sombre
  pageFormatMouse: 'verify-page-format-mouse.mjs', // formats de page A3 à A6 à la vraie souris et au vrai clavier : menu du bouton Page tout entier dans le panneau, feuille mesurée aux pixels, pagination, Lecture, enregistrement automatique, curseur gardé, Tab, email grisé ; 700x400 clair et sombre
  readModeMouse: 'verify-read-mode-mouse.mjs', // barre de mise en forme grisée en mode Lecture (audit 29/09, F1), clair et sombre à 700x400
  cleanReadingMouse: 'verify-clean-reading-mouse.mjs', // Lecture épurée à la vraie souris et au vrai clavier, 700x400 clair et sombre, lecture seule comprise : menu sous Mode lecture, barre cachée, document dans tout le panneau, bouton de sortie, Échap
  settingsWindowMouse: 'verify-settings-window-mouse.mjs', // fenêtre Réglages : sept onglets sur une ligne, contenu qui défile, « Fermer » fixe (audit 29/09, F2), 700x400 clair et sombre
  columnSearchMouse: 'verify-column-search-mouse.mjs',
  folderDefaultMouse: 'verify-folder-default-mouse.mjs',
  templateMenuMouse: 'verify-template-menu-mouse.mjs', // liste des modèles (12,5 px, sans « Nouveau modèle », « Organiser » en haut à droite) et renommage sur place, 700x400 clair et sombre
  saveMenuMouse: 'verify-save-menu-mouse.mjs', // menu du bouton Enregistrer (Enregistrer sous…, enregistrement automatique coché), souris et clavier, 700x400 clair et sombre
  templateNamesMouse: 'verify-template-names-mouse.mjs', // nom de modèle déjà pris à la vraie souris : « Enregistrer sous… » (proposition sélectionnée, nom saisi déjà pris), crayon « Renommer », galerie deux fois, anglais, 700x400
  autosaveRaceMouse: 'verify-autosave-race-mouse.mjs', // enregistrement automatique face à un Grist lent, à la vraie souris et au vrai clavier : frappe continue, clic sur Enregistrer, autre modèle choisi pendant une lecture, vrai conflit toujours signalé ; 700x400
  menuClickMouse: 'verify-menu-click-mouse.mjs', // un clic de souris sur « + », Enregistrer, Qualité PDF ou Titre ne les laisse plus ouverts ni ne prend le curseur du texte, 700x400
  leaveUnsavedMouse: 'verify-leave-unsaved-mouse.mjs', // quitter un modèle dont une modification attend : la question Enregistrer / Abandonner / Annuler (liste, « + », galerie), 700x400 clair, sombre et anglais
  layersMouse: 'verify-layers-mouse.mjs', // ordre d'empilement des couches flottantes à la vraie souris et au vrai clavier : la liste # et les menus de la barre du haut au-dessus des barres du tableau, d'une image et d'une bulle, 700x400
  tableUndoKeyboard: 'verify-table-undo-keyboard.mjs',
  trackColumnsMouse: 'verify-track-columns-mouse.mjs', // « Colonne avant / après / Supprimer la colonne » avec le suivi des modifications : colonne alignée, teintée, barrée, Ctrl+Z, enregistrement puis réouverture, cellule fusionnée (suppression grisée), 700x400 clair et sombre
  trackRowsMouse: 'verify-track-rows-mouse.mjs', // « Ligne avant / après / Supprimer la ligne » avec le suivi des modifications : ligne pleine largeur, teintée, barrée, Ctrl+Z, enregistrement puis réouverture, cellule fusionnée (suppression grisée), 700x400 clair et sombre
  trackTextColorsMouse: 'verify-track-text-colors-mouse.mjs', // texte inséré et supprimé du suivi à la vraie souris et au vrai clavier, 700x400 clair et sombre : couleurs calculées à 4,5:1 et pixels peints (teintes d'une colonne suivie, page blanche)
  suggestionBarMouse: 'verify-suggestion-bar-mouse.mjs', // barre « Accepter / Refuser » d'UNE modification du suivi à la vraie souris et au vrai clavier, 700x400 clair et sombre : ouverte au clic et au glisser (jamais pendant la frappe ni souris appuyée), sous le curseur et entière dans la fenêtre, 4,5:1 et pixels peints, « Accepter » / « Refuser » d'une modification sur trois, un seul Ctrl+Z, anglais, texte tout en bas, colonne de tableau suivie résolue depuis une case
  layerImagesMouse: 'verify-layer-images-mouse.mjs', // images en calque d'un ancien modèle chargées éditeur masqué (macro-modèle, Mode lecture) : leur position de page se mesure au retour de l'éditeur, 700x400
  macroImagesMouse: 'verify-macro-images-mouse.mjs', // images en calque d'un macro-modèle (js/macro-templates.js, js/reader-mode.js, js/pdf-export.js) : chacune reste dans son courrier en Lecture et dans le PDF téléchargé par le vrai bouton, 700x400
  macroSubmodelMouse: 'verify-macro-submodel-mouse.mjs', // stylo d'un modèle dans le résumé d'un macro-modèle et bandeau « Revenir au macro-modèle » (js/macro-editor.js, js/main.js) à la vraie souris, au vrai clavier et à la molette, 700x400 : ouvrir, revenir, question avant d'abandonner une modification, Lecture, nom très long, sept annexes, modèle supprimé ; clair, sombre et anglais
  macroHiddenMouse: 'verify-macro-hidden-mouse.mjs', // œil d'un modèle dans le résumé d'un macro-modèle (js/macro-editor.js, js/macro-templates.js) à la vraie souris et au vrai clavier à 700x400 : œil après le stylo, un clic le ferme (barré, enfoncé, nom grisé, coin d'état), Lecture sans le modèle ni rien à sa place, Tab, Espace, Entrée, ligne Grist, modèle supprimé, nom très long ; clair, sombre et anglais
  readerLateMouse: 'verify-reader-late-images-mouse.mjs', // Lecture d'un macro-modèle à la vraie souris à 700x400 avec une pièce jointe lente (réseau retardé) : la Lecture attend l'image, suit celle qui arrive plus tard, les coupures de page sont celles d'une image déjà là ; lectures de tables comptées
  wideImagesMouse: 'verify-wide-images-mouse.mjs', // images trop larges dans le PDF et le Word (js/export-common.js:shownImageWidthPx) : au vrai clic à 700x400, le PDF et le Word téléchargés sont relus, chaque image a la largeur que l'éditeur lui montre
  imageZoomMouse: 'verify-image-zoom-mouse.mjs', // gestes sur une image à la vraie souris à 700x400 (feuille réduite à ~0,85) : devant le texte, glisser, redimensionner, à gauche / au centre / à droite ; témoin à 1400x1000
  pageLayerMouse: 'verify-page-layer-mouse.mjs', // « Sur toutes les pages » à la vraie souris à 700x400 : le bouton de la barre de l'image coche et décoche la case, grisé hors du calque derrière le texte (info-bulle, clic sans effet), barre dans le panneau, flèches, HTML enregistré, anglais ; témoin à 1400x1000
  fullPagesMouse: 'verify-full-pages-mouse.mjs', // « Pages entières » à la vraie souris à 700x400 puis 1400x1000 : la couture (pied, gouttière, en-tête) ne vole aucun clic, le pied et l'en-tête ouvrent leur édition, l'image d'une page 2 se sélectionne et se déplace, une copie de « Sur toutes les pages » ne prend jamais la souris
  imageArrowsKeyboard: 'verify-image-arrows-keyboard.mjs', // flèches du clavier sur une image en calque sélectionnée (1 px, 10 px avec Maj), vrai clavier à 700x400 puis 1400x1000 ; le curseur qui arrive sur son ancre la traverse encore
  imageCornerMouse: 'verify-image-corner-mouse.mjs', // une image tirée dans un coin de la feuille avec un en-tête et un pied remplis, vraie souris à 700x400 : elle s'arrête dans le coin, garde son clic sous la zone, la marge à vide ouvre l'en-tête et le pied ; témoin à 1400x1000
  editorBlankTailMouse: 'verify-editor-blank-tail-mouse.mjs', // repère « Page 2 » de l'éditeur et lignes vides de fin (js/header-footer-preview.js:trailingBlankStart) : au vrai clavier à 700x400, Entrées de trop au bas d'une page, texte tapé puis effacé, saut de page au bouton de la barre
  headerFooterMouse: 'verify-header-footer-mouse.mjs', // en-tête et pied de page vides (js/header-footer-preview.js) : clic dans la marge puis « Terminer » sans rien écrire, texte tapé, tout effacé, modèle déjà enregistré activé vide, 700x400
  tableWidthsMouse: 'verify-table-widths-mouse.mjs', // largeurs de colonnes quand on change de modèle éditeur masqué (macro-modèle, Mode lecture), Aperçu A4, 700x400
  chipCellMouse: 'verify-chip-cell-mouse.mjs',
  englishTextsMouse: 'verify-english-texts-mouse.mjs', // vraie souris à 700x400, interface en anglais : les sept textes de l'audit F7, puis retour au français par Réglages
  findReplaceMouse: 'verify-find-replace-mouse.mjs', // Rechercher / Remplacer (js/find-replace.js) à la vraie souris et au vrai clavier : loupe, barre de 700 px, Entrée / Maj+Entrée, options, Remplacer puis Ctrl+Z, Tout remplacer, suivi des modifications, Échap, Ctrl+F / Ctrl+H, Mode lecture ; 700x400 clair, sombre et anglais
  textExpansionKeyboard: 'verify-text-expansion-keyboard.mjs', // expansion « §ub » à la vraie frappe et à la vraie souris, 700x400 : liste sous le curseur, Tab, Entrée, flèches, Échap, Retour arrière, liste à puces, bloc de code, onglet Réglages > Raccourcis, clair, sombre et anglais
  shortcutsKeyboard: 'verify-shortcuts-keyboard.mjs', // raccourcis clavier à la vraie frappe et à la vraie souris, 700x400 : touches de départ, changer / retirer / rendre une touche, refus sous la touche, Tab et Entrée, liste de 48 lignes qui défile, infobulles et lignes de menu, clair, sombre, anglais et mode Mac
  tableCutMouse: 'verify-table-page-cut-mouse.mjs', // tableau coupé entre deux lignes au saut de page (js/table-page-cut.js) à la vraie souris, 700x400 clair et sombre : bande sur le haut d'une ligne, clic, frappe, flèches, Tab, Lecture, PDF relu par pdf.js
  codeHygiene: 'verify-code-hygiene.mjs', // Node pur, sans navigateur : clés i18n, variables CSS et règles CSS sans usage
  templateOrganizerUnit: 'unit-template-organizer.mjs', // Node pur (vm) : logique de l'arbre de rangement, js/template-organizer.js
  templatePreferencesUnit: 'unit-template-preferences.mjs', // Node pur (vm + faux docApi) : js/template-preferences.js, file d'écritures et retour arrière
  conditionRulesUnit: 'unit-condition-rules.mjs', // Node pur (vm) : js/condition-rules.js:compareValues - vide, liste, Oui / Non, nombres, dates et fuseaux (navigateur réglé ailleurs qu'en UTC), un seul formateur Intl par fuseau
  calcMouse: 'verify-calc-mouse.mjs', // bulle « Calcul » (variables calculées) à la vraie souris et au vrai clavier : ligne « Calcul » de la liste « # », fenêtre dans 700x400, liste des colonnes devant elle, barre aux boutons grisés aux pixels, case étroite, Lecture, anglais ; 700x400 clair et sombre
  xlsxNumberFormatUnit: 'unit-xlsx-number-format.mjs', // Node pur (vm) : js/xlsx-number-format.js, le texte qu'Excel montre pour une valeur (euros, pourcentages, dates, zéros de tête, sections, français et anglais) - sert à l'import d'un classeur dans une grille
  formulaUnit: 'unit-formula.mjs', // Node pur (vm) : js/formula.js, le moteur des bulles « Calcul » (variables calculées) : opérations, listes de lignes, fonctions, fautes de syntaxe, écriture saisie et enregistrée
  formatPainterMouse: 'verify-format-painter-mouse.mjs', // pinceau de mise en forme à la vraie souris et au vrai clavier à 700x400 : le bouton sur la 2e rangée sans en ajouter, un mot, un glissé, un triple-clic, des cases de tableau, le double-clic qui garde le pinceau, Échap, Alt+Maj+C / V, clair, sombre et anglais
  startupReadsUnit: 'unit-startup-reads.mjs', // Node pur (vm + faux docApi qui compte ses appels) : ce que l'ouverture lit dans Grist - Templates.loadAll (une lecture), GristAPI.init (aucune table du document), GristAPI.refreshSchema (colonnes exactes, une passe à la fois), câblage d'index.html et de js/main.js
  userIdentityUnit: 'unit-user-identity.mjs', // Node pur (vm + faux docApi) : js/grist-api.js, la lecture du nom et de l'email de la personne - table-sonde d'avant la puce Nom migrée UNE fois, aucune écriture de schéma pour l'email seul, plusieurs puces = une lecture et une colonne ajoutée, compte sans nom, colonne refusée, lecteur du document
  userNameChipMouse: 'verify-user-name-chip-mouse.mjs', // puce « Nom de l’utilisateur » à la vraie souris à 700x400, en français et en anglais : ligne juste après l'email dans la liste « # » (Calcul reste atteignable), un clic la pose, le nom en Lecture à côté de l'email, « [Nom indisponible] » / « [Name unavailable] » en rouge sans nom
  startupOpenMouse: 'verify-startup-open-mouse.mjs', // ouverture sur un document aux tables lentes, vrai navigateur à 700x400, vraie souris et vrai clavier : table des modèles lue une fois, modèle affiché avant la lecture complète des tables, bulles jugées tout de suite, « # » liste les colonnes, colonnes exactes ensuite
  cspLoad: 'verify-csp.mjs', // politique de sécurité du contenu de index.html SANS contournement : le widget démarre, s'écrit, se lit et exporte sous la politique ; un script en ligne, un gestionnaire, une adresse javascript:, une balise de base, un cadre, un objet, un formulaire ne passent plus ; le vrai fichier d'API de Grist (réseau) s'évalue ; cadre à bac à sable
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
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/html2pdf\.bundle\.min\.js$/, 'umd/html2pdf.bundle.min.js'],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/docx@.*$/, 'umd/docx.iife.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/exceljs\.min\.js$/, 'umd/exceljs.min.js'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/.*\/qrcode\.min\.js$/, 'umd/qrcode.min.js'],
].filter(([, rel]) => (rel !== 'umd/exceljs.min.js' && rel !== 'umd/qrcode.min.js') || existsSync(join(CACHE, rel))) : [];
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
