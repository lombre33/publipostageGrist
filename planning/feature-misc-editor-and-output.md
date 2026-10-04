# Fonctionnalités diverses — édition, sortie PDF, organisation

> **Statut au 4 octobre 2026 : en grande partie livré.** En ligne : Rechercher / Remplacer, filigrane, taille et orientation de page, QR code, dossiers de modèles, nom de modèle déjà pris (« nom (2) »), copier-coller d'images, fusion de plusieurs modèles (macro-modèles) et choix de modèle conditionnel (« Modèle selon la ligne »). Pas encore faits : le remplissage avec des données d'exemple, les variantes multi-langues d'un modèle et la fusion de cellules dans un tableau de document (elle n'existe que dans les grilles). Ce document garde les conceptions d'origine.

Regroupe les items de la roadmap qui sont chacun trop petits pour mériter leur propre fichier, mais
gardés en détail pour ne rien perdre de la demande initiale.

## Recherche / Remplacer

Fonctionnalité standard d'éditeur de texte, absente aujourd'hui. TipTap/ProseMirror n'a pas d'extension
officielle "Find & Replace" dans le écosystème `@tiptap/*` déjà utilisé par ce projet — les
implémentations communes construisent une recherche sur `editor.state.doc` (parcours texte + calcul de
positions) et posent des `Decoration` ProseMirror pour surligner les correspondances. Prévoir : un champ
de recherche (probablement dans la toolbar ou une modale légère), navigation suivant/précédent,
remplacement un par un ou "tout remplacer" — attention à bien passer par des transactions ProseMirror
réelles (comme tout le reste de l'éditeur) pour que l'historique Annuler/Rétablir fonctionne
correctement sur un remplacement.

**Livré le 01/10** (roadmap A20, tâche de fond ; Antoine a choisi d'ajouter la loupe à la barre d'outils) : `js/find-replace.js` et `css/find-replace.css`. Une barre fine entre la barre d'outils et le texte
(jamais une fenêtre), ouverte par la loupe, Ctrl+F ou Ctrl+H (⌘⇧H sur Mac). L'état de la recherche vit dans le module, pas dans le plugin ProseMirror : `Editor.setHTML` reconstruit l'état de l'éditeur
et remettrait les plugins à zéro. Les résultats se calculent par bloc de texte (jamais à cheval sur deux paragraphes), à travers les changements de mise en forme ; une bulle, une image et le texte
supprimé en suivi comptent pour des caractères qu'aucune requête ne trouve. Un remplacement est une vraie transaction (UNE étape d'annulation, « Tout remplacer » compris), garde la mise en forme
du texte remplacé et passe par le pont du suivi des modifications quand il est allumé. Les règles d'interface sont dans la charte (`identite-ui-ux-grist-factory.md`, « Rechercher / Remplacer »),
les tests dans les groupes `findReplace` et `findReplaceMouse`. Pas fait : chercher dans le texte des bulles (noms de variables), dans l'en-tête et le pied de page hors édition, ni par expression régulière.

## Fusion de cellules de tableau

Le tableau du projet utilise `@tiptap/extension-table` (confirmé par les mêmes classes
`.tableWrapper`/`.selectedCell`/`.column-resize-handle` que documente `css/editor-v2.css:98-101`, posées
par `prosemirror-tables` lui-même) — cette extension **supporte nativement** `mergeCells`/`splitCell`
en sélectionnant plusieurs cellules. Le travail principal n'est donc probablement PAS d'implémenter la
fusion elle-même (déjà fournie par la librairie), mais de :
1. Exposer les commandes via l'UI (bouton toolbar tableau, actif seulement si plusieurs cellules sont
   sélectionnées — même patron que les boutons contextuels déjà existants dans la toolbar tableau
   flottante, `js/floating-toolbars.js`).
2. **Vérifier et adapter `js/pdf-export.js:tableFrom`** pour un tableau contenant des cellules fusionnées
   (`colspan`/`rowspan`) — pdfmake supporte `colSpan`/`rowSpan` sur ses cellules, mais le code de
   conversion actuel (`tableFrom`) n'a probablement jamais eu à en tenir compte (à vérifier en lisant la
   fonction avant de commencer). C'est là que se trouve le vrai risque technique de cette fonctionnalité,
   pas dans l'éditeur lui-même.

## Copier/coller d'images dans l'éditeur

Déjà identifié comme trou de test dans `PROTOCOLE_TEST_MANUEL.md` §4 ("jamais testé, ni auto ni manuel
à ce jour — vérifier qu'il existe seulement un mécanisme prévu ou si c'est un vrai trou fonctionnel").
**Première étape avant toute implémentation** : vérifier empiriquement si TipTap/ProseMirror gère déjà
nativement un coller d'image (certaines configurations StarterKit interceptent automatiquement un
`paste` contenant une image et l'insèrent en `data:` URI) — si c'est déjà le cas, le travail se limite
à vérifier que l'image collée obtient bien tous les attributs attendus par le reste du système
(`data-layer`, `data-wrap`, dimensionnement par défaut, cf. `createEditorImageNode` dans
`js/editor-nodes.js`) plutôt qu'à construire un gestionnaire de `paste` depuis zéro. Le second besoin
mentionné par l'utilisateur ("copier depuis et vers l'éditeur pour dupliquer une image") suggère aussi
de vérifier le sens inverse : sélectionner une image DANS l'éditeur, `Ctrl+C`, coller — doit dupliquer
le nœud avec ses attributs (position, calque…) plutôt que de perdre l'information.

## Nom de modèle dupliqué

**Confirmé par lecture du code** : `js/templates.js:save()` n'a aujourd'hui aucune vérification de nom
dupliqué — un nouveau modèle avec un nom déjà pris écrase silencieusement rien (`AddRecord` crée un
2ᵉ enregistrement avec le même `Nom`, les deux coexistent, source de confusion dans le sélecteur de
modèle). Correctif simple : avant `AddRecord` (jamais avant `UpdateRecord`, qui modifie un modèle
existant intentionnellement), vérifier via `Templates.loadAll()`/`getCached()` si le nom existe déjà
parmi les modèles chargés, et si oui, ajouter automatiquement " (1)", " (2)"... jusqu'à trouver un nom
libre (algorithme standard, identique à celui utilisé par la plupart des gestionnaires de fichiers).

## Watermark (filigrane)

Deux approches possibles côté export PDF vectoriel (`js/pdf-export.js`), pdfmake supportant nativement
un filigrane :
- Option native pdfmake `watermark: { text: '...', opacity, color, ... }` dans le `docDefinition` — la
  plus simple à câbler, mais limitée à du texte (pas une image/un logo en filigrane).
- Pour un filigrane image ou plus personnalisé : un bloc `{image, opacity, absolutePosition}` répété
  sur chaque page — technique déjà maîtrisée par le projet pour le positionnement d'image en calque
  (`js/pdf-export.js`), mais nécessite de savoir combien de pages le document final aura (accessible via
  le même mécanisme de double-passe déjà utilisé pour la pagination du sommaire/des notes de bas de
  page, cf. `resolveNativePdfContent`).
UI : un réglage (texte ou image, opacité, position) — probablement dans les réglages du modèle ou un
nouveau petit panneau dédié, à trancher avec l'utilisateur (filigrane par modèle, ou global à tous les
exports ?).

**Filigrane texte livré le 01/10** (suite du fil Paysage et portrait) : réglage PAR MODÈLE, clé `watermark` (`{text, angle: 'diagonal'|'horizontal', color: '#rrggbb', opacity 0,05 à 1}`) de la colonne
`Margins` à côté du sens, du format et des marges (`js/page-layout.js` : `normalizeWatermark`, `getWatermark`, `setWatermark`, évènement `pp:watermarkChanged` ; absent = pas de filigrane, aucune migration).
On a gardé la seconde approche de ci-dessus (une couche posée à la main), pas l'option `watermark` de pdfmake, qui peint PAR-DESSUS le contenu : la géométrie est commune aux quatre rendus
(`PageLayer.watermarkLayout`, `watermarkElement`), le dessin est la première chose peinte dans la boîte de chaque page (derrière les images « Sur toutes les pages »). Éditeur et Lecture : élément
`.v2-page-watermark` de `paintCopies` (visible avec Aperçu A4, jamais dans le document) ; PDF : un nœud SVG à Roboto gras en tête de `doc.background` de chaque page (vrai texte vectoriel) ;
Word : une image PNG ancrée derrière le texte dans l'en-tête, centrée sur la page. UI : ligne « Filigrane… » en bas du menu Page (`js/orientation-toggle.js`) qui ouvre `js/watermark-dialog.js` (texte
de 40 caractères au plus, sens, six couleurs, opacité de 5 à 100 %, feuille d'aperçu, « Retirer le filigrane ») ; grisée pour un email et une grille. Un macro-modèle a le sien.
**Reste** : un filigrane IMAGE seul (aujourd'hui : une image « Sur toutes les pages » derrière le texte avec son opacité) ; le Word n'applique pas l'opacité d'une image de la couche ; le filigrane
du Word est une image (pas du texte modifiable dans Word).

## Taille et orientation de page

**Chantier plus profond qu'il n'y paraît** : `A4`, le format portrait, et `PAGE_MARGIN_PT = 28`
apparaissent codés en dur à de nombreux endroits — `js/pdf-export.js` (`pageSize: 'A4'`,
`pageOrientation: 'portrait'`, `CONTENT_WIDTH_PT` dérivé d'A4), `js/header-footer-preview.js`
(`A4_PAGE_HEIGHT_PX`, `A4_BASE_MARGIN_PX`), et les valeurs CSS de simulation d'aperçu
(`793.71px`/`37.33px`, dérivées d'A4 à 96/72 DPI, `css/editor-v2.css`). Une vraie prise en charge
multi-format nécessite de transformer ces constantes en PARAMÈTRES (par modèle, stockés comme
`headerFooterData` l'est déjà) propagés aux 3 mêmes endroits — pas juste au niveau de l'export final.
**Recommandation** : traiter comme un chantier à part entière avec son propre document de conception une
fois qu'on s'y attaque réellement (pas juste "changer une variable pageSize"), tant les 3 étages de
rendu (éditeur/lecture/PDF) dépendent tous indépendamment de la même hypothèse A4-portrait aujourd'hui.

**Orientation livrée le 01/10 pour les modèles classiques** : `js/page-layout.js` porte l'orientation (clé `orientation` de la colonne `Margins`, absente =
portrait) et reste la seule source des dimensions de la page (`getPageSize*`, `pageSizePtFor`, `pageSizeTwipFor`) ; la feuille et la pagination de l'éditeur
et de la Lecture, le PDF (aussi en lot), le Word et l'impression navigateur les lisent. Le A4 portrait n'est plus écrit en dur que dans `js/page-layout.js`, dans les
valeurs initiales de `js/pdf-export.js` et `js/docx-export.js` (remplacées à chaque export), dans le repli CSS du portrait (`--pp-page-width`) et dans l'aperçu
de la galerie, toujours en portrait. Le bouton de la barre agit sur les modèles classiques et, depuis le second envoi du 01/10, sur les macro-modèles ; un email et une grille restent en portrait.
**Formats A3, A4, A5 et A6 livrés le 01/10** (suite du même fil) : `PageLayout.FORMATS` est la seule table des dimensions (mm, pt de pdfmake, twips de Word, nom pdfmake / jsPDF) ; le
format s'enregistre avec le sens et les marges (clé `format` de la colonne `Margins`, absente ou inconnue = A4) et se choisit dans le menu au survol du bouton Portrait / Paysage
(`js/orientation-toggle.js`, aucune icône de plus dans la barre). Les trois fonctions de dimensions prennent le format comme le sens, les consommateurs (éditeur, Lecture, facteur
d'ajustement, PDF, PDF en lot, Word, impression navigateur, qualités raster, plafonds de Réglages) n'ont rien d'autre appris. Un format de plus est une ligne de `FORMATS`.
**Reste ouvert** : d'autres formats (Lettre US, Légal US, A2, A1, ISO B...) sur carte à Antoine, rien de codé avant son choix ; l'aperçu de la galerie et de l'arbre des modèles
(toujours une feuille A4 portrait) ; (l'orientation et le format d'un macro-modèle sont livrés : voir ci-dessous).

**Page d'un macro-modèle livrée le 01/10** (carte « Autoriser le paysage pour les macro-modèles ? » : Oui) : `OrientationToggle.TYPES` contient `macro`. Le sens, le format et les marges du macro-modèle sont dans la colonne `Margins` de sa propre ligne (écriture de l'enregistrement automatique, de la fenêtre de composition et d'« Enregistrer sous… » : voir `planning/feature-macro-modeles.md`) ; la Lecture, le PDF (aussi en lot et en un seul fichier) et le Word lisent `PageLayout`, chargé avec le macro-modèle. L'assemblage (`MacroTemplates.buildConcatenatedHtml`) ne reprend que le contenu des modèles : leur page n'a aucune prise sur le macro-modèle, qui l'impose à tout ce qu'il assemble, et ils gardent la leur. Un tableau aux colonnes réglées écrit pour une page plus large tient dans la page du macro-modèle (Lecture, PDF et Word, sondé le 01/10). Limite annoncée à Antoine : enregistrement automatique coupé, la page d'un macro-modèle n'est gardée que par « Enregistrer » de sa fenêtre et la question avant de le quitter ne s'ouvre pas (comme pour ses marges).

**Image plus large que la zone de texte, dans le PDF et le Word (livré le 01/10)** (carte « Ramener à la page les images trop larges dans le PDF et le Word ? » d'Antoine : « logique de WYSIWYG, si ça dépend en éditeur ça dépasse partout sinon nulle part ») : l'éditeur et la Lecture ramènent une image dans le texte à la largeur de ce qui la contient (`max-width: 100%`, proportions gardées) ; le PDF et le Word prennent maintenant la même largeur (`ExportCommon.shownImageWidthPx`, lue sur la boîte que le navigateur pose à l'image dans l'hôte de mesure, appelée par `pdfImageFromNode` et `docxImageDataFrom`), dans le corps, une case de tableau, une colonne, centrée, selon le format de page et les marges. Une image à habillage aussi large que la page laisse le texte dessous dans le PDF (`floatedImageParagraphFrom`). Une image en calque garde sa taille réglée (chantier « Position des images »). Reste différent : une image flottante réglée plus large que la zone de texte mesure 707 px dans l'éditeur (le flottement retire sa marge de 12 px de la place disponible) et 719 px dans la Lecture, le PDF et le Word.

## Fin de document sans contenu

**Livré le 01/10** (demande d'Antoine : « s'il n'y a pas de contenu, peu importe les marges, on ne crée pas de nouvelle page ») : une dernière ligne vide ne s'imprime pas mais occupe une
ligne, et quand le texte arrive à la marge du bas elle ouvrait une page entière pour elle seule. `ReaderMode.trimTrailingBlankBlocks` (`js/reader-mode.js`) retire de la FIN du document les
paragraphes, zones à deux colonnes et sauts de page sans rien à montrer (texte, image, tableau, liste, citation, encadré, note, numéro de page) et les lignes vides au bas des colonnes d'une
dernière zone ; la Lecture (`render`), le PDF (`htmlToPdfContent`, flux principal) et le Word (`buildDocxDocument`, qui garde un paragraphe de 1 pt derrière un dernier tableau) l'appellent.
**Repère « Page 2 » de l'éditeur** (carte d'Antoine du 01/10, « Faire ignorer les lignes vides de fin au repère « Page 2 » de l'éditeur ? » : Oui) : `computePageBreaks`
(`js/header-footer-preview.js`) ignorait déjà le tout dernier paragraphe vide ; `trailingBlankStart` étend la règle à TOUTE la suite de lignes vides qui termine le document. L'éditeur les
garde (il faut pouvoir écrire à la suite), mais deux Entrées de trop au bas d'une page ne font plus apparaître « Page 2 », ni un « 2/2 » dans le pied : les lignes dépassent simplement
la dernière page, et la page apparaît dès qu'on tape du texte dessus. Un saut de page posé par la personne garde son repère même sans rien derrière (Lecture et exports, eux, ne font
pas de page vide de lui) ; les lignes vides tapées derrière lui n'ouvrent pas de « Page 3 ». Les lignes vides du milieu gardent leur place.
**Reste ouvert** : l'impression navigateur et les qualités raster (`js/pdf-export-alt.js`, désactivées dans l'interface) ne rognent pas ; une zone à deux colonnes vide en fin de document
compte encore dans l'éditeur (elle n'est pas une « ligne vide »).

## QR code / code-barres

Génération pure client-side, plusieurs librairies légères existent (ex. `qrcode`/`qrcode-generator`
pour QR, `jsbarcode` pour code-barres — à choisir/valider avec l'utilisateur, chargées en CDN comme le
reste des dépendances du projet, avec SRI dès l'ajout — cf. `AUDIT_CODE.md` §2.2, ne pas répéter
l'absence de SRI qui existe déjà pour `esm.sh`). Conception :
- Nouveau type de contenu inséré via un bouton toolbar (ou dans le panneau `#`, puisque la source est
  une URL stockée dans une cellule Grist — donc plutôt une "variable image spéciale" que du texte) : la
  valeur résolue (`#Table.ColonneURL`) est passée à la librairie QR pour générer une image (canvas →
  `data:` URI) au moment de la résolution (mode Lecture/export), pas stockée dans le modèle.
- Rendu : comme une image normale une fois généré (réutiliser toute l'infrastructure image déjà
  existante — insertion, positionnement, export PDF) plutôt que d'inventer un nouveau mécanisme de
  rendu pour ce cas précis.

**Livré le 01/10 (le QR code ; les codes-barres restent à faire)** — demande d'Antoine : « intégration d'un lien présent dans une cellule Grist (variable) ou d'un lien externe qui
peut être rentré ». Bibliothèque `qrcode-generator` 1.4.4 de cdnjs avec SRI (`LIB` de `js/qr-code.js`), chargée à la demande par `ExportCommon.loadScriptOnce`, texte en UTF-8, correction
d'erreur M. Un QR code est une image de l'éditeur (`editorImage`) qui garde en plus son texte (`data-qr-text`, attribut `qrText`) : sans colonne, l'image PNG (noir sur blanc, 640 px
de côté environ, quatre modules de marge, modules en pixels entiers) est dessinée à l'insertion et suivie telle quelle par la Lecture, le PDF et le Word ; avec une colonne
(`#Table.Colonne`, la détection de l'objet d'un e-mail, `Variables.findTextVariables`), le modèle ne stocke pas d'image : un cadre carré la remplace dans l'éditeur et
`QrCode.resolveImage` la dessine pour chaque ligne à la Lecture et à l'export (`ReaderMode.render` et `ReaderMode.preview`, donc PDF, Word et lots), y compris dans une zone répétée
(`LoopRules.BOUND_SELECTOR`). Une colonne vide pour la ligne retire le QR code ; un texte trop long (2 331 octets au plus) ou une bibliothèque absente laisse une note dans la langue de
l'interface. Les nombres s'écrivent bruts (`rawNumbers`). Une cellule du widget Lien de Grist (« titre adresse ») donne l'adresse seule quand la colonne est tout le texte : l'option
du widget n'est pas lue (`js/grist-api.js` n'a pas été touché), l'adresse est le dernier mot s'il commence par http(s)://. Entrée : la ligne « QR code… » du menu « Lien et blocs de contenu »
(icône chaîne, `#v2-btn-qr` ; Antoine a choisi ce menu sur la carte de placement, devant le menu Image), fenêtre de la base commune (`js/qr-code.js`, `css/qr-code.css`). Dans une grille la ligne reste
active : `XlsxExport` passe par `ReaderMode.preview`, l'image se pose sur sa case. Tests : groupe `qrCode` (le QR code est relu par un décodeur, jsQR, en page, dans les pixels du PDF, dans le .docx
et dans le .xlsx) et script Node `qrMouse` (vraie souris, 700×400).
**Reste ouvert** : pas de QR code dans un en-tête ni un pied de page (la ligne est grisée là) ; les codes-barres (`jsbarcode`) ; un QR code logo au centre ou une autre couleur ; la
correction d'erreur est fixe (M).

## Fusion de plusieurs modèles

Concaténer plusieurs modèles en un seul export PDF (ex. lettre de couverture + CGV + facture). Deux
approches :
1. **Niveau HTML** (avant résolution) : concaténer le HTML de plusieurs modèles avec un saut de page
   entre chacun, puis traiter comme un document normal (résolution + export) — la plus simple, réutilise
   tout le pipeline existant sans y toucher.
2. **Niveau pdfmake** (après résolution/mesure) : fusionner plusieurs `docDefinition.content` — plus
   complexe (numérotation de page/sommaire/notes de bas de page à unifier entre les documents fusionnés)
   mais nécessaire si chaque modèle doit garder sa PROPRE configuration d'en-tête/pied de page distincte
   au sein du même PDF final (l'approche 1 ne le permet pas facilement, une seule config
   `headerFooterData` par export).
**Recommandation** : commencer par l'approche 1 (cas d'usage "même en-tête/pied pour tout le document
fusionné", probablement suffisant pour la majorité des besoins réels) et ne considérer l'approche 2 que
si un besoin réel de configs distinctes par section apparaît.

## Dossiers/favoris (galerie de modèles)

Les tags existent déjà (`templates-gallery/manifest.json`, champ `tags`) pour les modèles de la GALERIE
(préremplis, livrés avec le projet) — mais la demande porte sur les MODÈLES DE L'UTILISATEUR (stockés
dans la table interne `Publipostage_Modeles`), pas la galerie elle-même. Conception : ajouter une
colonne `Dossier`/`Favori` à la table interne des modèles (`js/templates.js`), UI de filtrage dans le
sélecteur de modèle existant (groupement par dossier, épingle favori en tête de liste) — changement de
schéma de table interne à gérer avec précaution (migration silencieuse pour les modèles déjà existants
sans cette colonne, même philosophie que `ensureHeaderFooterColumn()` déjà présent dans
`js/templates.js` pour une précédente évolution de schéma).

## Remplissage données d'exemple

Bouton qui injecte des valeurs factices dans toutes les `#Variable` du modèle en cours d'édition, pour
prévisualiser la mise en page sans dépendre d'une vraie ligne Grist. Conception : parcourir le HTML de
l'éditeur, repérer tous les badges `.var-badge` (même sélecteur que `resolveBadgeNode` utilise déjà),
générer une valeur plausible selon le TYPE de colonne Grist (déjà connu via `GristAPI.getColumnType` —
texte : "Exemple de texte", nombre : une valeur aléatoire plausible, date : aujourd'hui, référence : un
texte placeholder) et les injecter dans une COPIE temporaire du mode Lecture (ne jamais modifier le
modèle réel ni écrire dans Grist) — un mode "aperçu factice" plutôt qu'une vraie résolution. Recoupe
directement le besoin de test de `feature-table-rows-from-linked-table.md` (prévisualiser un bloc
répété sans vraies données liées) — à concevoir en gardant ce cas en tête.

## Choix de modèle conditionnel

Voir `feature-conditional-content.md` — traité en détail là-bas avec les blocs conditionnels et la
fusion conditionnelle de documents, car les trois partagent le même besoin sous-jacent (évaluer une
condition sur une valeur Grist).

## Variantes multi-langues

Réflexion produit avant tout : est-ce (a) plusieurs modèles totalement indépendants juste tagués "FR"/
"EN" (le plus simple, aucun changement technique, juste une convention d'usage + peut-être un filtre
dans le sélecteur), ou (b) un mécanisme de "traduction liée" où modifier le contenu d'une langue doit
pouvoir se répercuter/alerter sur les autres variantes (bien plus complexe — nécessite de définir ce
qu'est un "même modèle en plusieurs langues" au niveau du schéma de données, et un mécanisme de diff/
synchronisation). **Ne pas commencer d'implémentation avant d'avoir tranché ce point avec
l'utilisateur** — c'est une décision de conception produit, pas un détail technique.
