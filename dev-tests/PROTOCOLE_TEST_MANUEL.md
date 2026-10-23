# Protocole de test manuel — Publipostage Grist

Origine : protocole fourni par l'utilisateur (2026-09-13), après avoir trouvé en quelques
secondes des bugs que la suite automatisée + les passes manuelles précédentes n'avaient pas
relevés. Complété ici avec ce qui était déjà couvert (sans doublon), organisé de bout en bout,
et cumulé au fil des sessions — **document vivant, à enrichir à chaque bug trouvé**, pas figé.

**Validation immédiate du principe des 3 étages** : les 3 bugs signalés ce jour-là illustraient
chacun un angle mort différent de ce document - tous corrigés et couverts par un nouveau test
de régression le jour même :
- Titres de même niveau progressivement indentés dans le PDF (jamais dans l'éditeur) - bug
  d'étage 3 pur, invisible sans comparer éditeur et PDF (§1).
- Image flottante "collée en haut à gauche" en mode Lecture, correcte en éditeur - bug d'étage 2
  pur, dans la catégorie explicitement signalée ci-dessus comme angle mort total de la suite
  automatisée (§5).
- Hauteur d'en-tête/pied non plafonnée (texte infini), désynchronisée entre éditeur et PDF - bug
  de cohérence inter-étages (§7).

**Mise à jour 2026-10-12 (menu d'export)** : le bouton « Qualité PDF » s'appelle « Type d'export » et choisit
PDF, PDF protégé, Word, Excel, Markdown, Markdown (modèle), HTML (fichier à déposer) ou HTML (contenu à coller) (la qualité du PDF n'est montrée que pour les deux PDF, et gardée) ; le bouton « Exporter » (Alt+P aussi)
exporte, dans le type choisi, l'option cochée de son menu. Ce menu, titré « Exporter », ne liste que des options de
lignes et de classeur (une seule ligne, toutes les lignes en ZIP, en un seul PDF, assemblage avant impression, toutes
les valeurs de la table dans un seul classeur), avec une petite coche devant l'option cochée ; un clic sur une option
la coche sans rien exporter. Dans la suite de ce protocole, les noms « Exporter en PDF », « Exporter en DOCX (bêta)… »,
« Exporter en Excel… » veulent dire : choisir le type, cocher « Une seule ligne », cliquer Exporter ; « Exporter les
lignes (ZIP) », « …en un seul PDF… », « Assemblage avant impression… », « …en Excel (ZIP)… » et « …dans un seul
classeur… » : choisir le type, cocher l'option du même nom, cliquer Exporter (la confirmation ou la fenêtre de
l'assemblage s'ouvre alors comme avant).

Ces trois choix (type, qualité du PDF, option de lignes) sont gardés **par personne et par modèle**. À vérifier à la
main sur un document Grist : sur un modèle, choisir Word et « Toutes les lignes de la vue (ZIP) » ; ouvrir un second modèle (il
repart de PDF, vectoriel, une seule ligne) et y choisir « Léger » ; recharger la page du document Grist ; rouvrir
chaque modèle (chacun retrouve ses choix, le bouton du type est allumé pour Word) ; avec un compte Lecteur de Grist,
choisir Word sur un modèle : le choix tient pendant la séance, et la table `Publipostage_PreferencesModeles` n'a pas
bougé.

**Mise à jour 2026-10-12 (export Markdown)** : le type « Markdown » du menu « Type d'export » écrit le document de la ligne en `.md` (CommonMark et GFM ;
pas pour une grille). Les tests automatiques comparent le fichier, caractère pour caractère, à l'écriture attendue, et il a été relu avec un second lecteur
Markdown pendant la mise au point ; ce qui reste à voir à la main, dans de vrais afficheurs : exporter un modèle qui a un titre numéroté, du gras, de
l'italique, un lien, une liste imbriquée, une liste à cases, une citation, un tableau, une image, une note de bas de page, un encadré et un sommaire,
puis ouvrir le `.md` dans GitHub (un dépôt d'essai ou un gist), dans l'aperçu Markdown de VS Code et dans Docs de La Suite (Importer) : le texte, les
listes, le tableau et l'encadré (une alerte) doivent s'y lire comme dans la Lecture ; le souligné, la couleur et la taille ne s'y voient que si l'afficheur
laisse passer le HTML en ligne (GitHub le fait, d'autres le retirent : le texte reste lisible) ; « Toutes les lignes de la vue (ZIP) » rend une archive de `.md` nommés
comme les PDF ; avec une image d'un autre site, la fenêtre qui la nomme s'ouvre d'abord, comme pour le PDF.

**Mise à jour 2026-10-12 (import Markdown)** : la ligne « Importer un Markdown… » du menu « + » (sous « Importer un Excel… ») ouvre un `.md` en nouveau document, sans
nom et pas encore enregistré. Les tests automatiques l'essaient avec des fichiers écrits d'après les formats connus ; ce qui reste à voir à la main, avec de VRAIS
fichiers : un export de Docs de La Suite (un document qui a des titres, du gras, une liste à cases, un tableau, une image), le README d'un dépôt GitHub (alertes,
tableaux, balises HTML), une note d'Obsidian (en-tête YAML, notes de bas de page) et un fichier de Typora ou de VS Code. Pour chacun : le texte, les listes, les cases
cochées, le tableau (colonnes alignées), les alertes (encadrés de la bonne couleur), les images en ligne, les notes de bas de page et le sommaire doivent être ceux du
fichier ; une image dont le chemin est celui d'un fichier d'à côté est remplacée par un mot et comptée dans le coin d'état ; le document s'enregistre ensuite sous un
nom comme un nouveau document. Et le tour complet : exporter un modèle en Markdown (menu « Type d'export »), puis importer le `.md` obtenu : le même document revient,
en-tête et pied de page compris. Un fichier énorme ou fait pour piéger le lecteur (limite connue, dite dans le README) peut bloquer la page quelques secondes : ne pas
l'essayer sur un vrai document.

**Mise à jour 2026-10-14 (Markdown (modèle))** : le type « Markdown (modèle) » du menu « Type d'export » (ni pour une grille, ni pour un macro-modèle) écrit le modèle lui-même en
un seul `.md`, ses variables écrites `{{Table.Colonne}}` ; avec lui, le menu « Exporter » ne montre que « Un seul fichier : le modèle ». Les tests automatiques comparent le fichier
et l'aller-retour (exporté, importé, exporté de nouveau : le même texte). Ce qui reste à voir à la main, avec un VRAI modèle (un de la galerie, ou un des vôtres) dans le vrai
document Grist : exporter un modèle qui a des variables dans le texte, un titre et un tableau, une variable à format, une condition, un calcul, une puce de date, une pastille « @ », un numéro
de page, une valeur et un bloc conditionnels, une image liée à une colonne, un code QR, un en-tête et un pied de page ; ouvrir le `.md` (les `{{Table.Colonne}}` se lisent, le
reste est du HTML en ligne que GitHub laisse passer) ; l'importer par « Importer un Markdown… » : le nouveau document doit avoir ses variables en bulles, les mêmes réglages
(format, condition, boucle…) et, sur une ligne, le même aperçu dans la Lecture que le modèle d'origine ; une clé `{{…}}` fautive ou d'une autre table reste du texte et le coin
d'état la compte. Ne reviennent pas : les marges, le format de page, le filigrane, l'objet et les destinataires d'un e-mail, et la numérotation automatique des titres (elle
devient du texte).

**Mise à jour 2026-10-16 (export HTML)** : les types « HTML (fichier à déposer) » et « HTML (contenu à coller) » du menu « Type d'export » (pas pour une grille) écrivent le document de la ligne en
`.html` (une page complète) ou `-fragment.html` (le contenu seul). Les tests automatiques lisent le fichier produit et le montrent dans une vraie page (styles calculés, liens du sommaire et des
notes, isolement de la feuille de style du contenu à coller dans un site) ; ce qui reste à voir à la main, sur de VRAIS sites et navigateurs : exporter un modèle qui a un titre numéroté, du gras, une couleur,
un tableau aux cases fusionnées avec bordures, une liste à cases, un encadré, une zone à deux colonnes, une image jointe dans Grist, un sommaire et une note de bas de page. Le fichier complet, ouvert
dans Chrome, Firefox et Safari, puis posé sur un hébergement statique (GitHub Pages, par exemple) et lu sur un téléphone : le texte est centré sur une largeur de lecture, le tableau large défile au lieu
de déborder, les deux colonnes passent l'une sous l'autre, les liens du sommaire et des notes vont au bon endroit et reviennent, aucun carré ne remplace une case à cocher. Le contenu à coller, dans un
vrai bloc HTML d'un gestionnaire de contenu (WordPress « HTML personnalisé », Wix, Webflow, Squarespace) : la police, la couleur et les titres sont ceux du site, le reste (tableaux, encadrés, colonnes,
cases) garde sa mise en forme, et la feuille de style n'abîme rien autour du bloc ; certains gestionnaires retirent la balise `<style>` du bloc collé : le texte et les styles écrits dans les balises
(couleur, alignement, bordures de tableau) restent, les colonnes, les cases et l'allure des encadrés dépendent de la feuille. « Toutes les lignes de la vue (ZIP) » rend une archive de `.html` nommés comme les
PDF ; avec une image d'un autre site, la fenêtre qui la nomme s'ouvre d'abord, et l'image garde son adresse dans le fichier. À 700×400, le menu « Type d'export » (huit types et, pour le PDF, trois
qualités) tient entier : à vérifier à l'œil et à la vraie souris, en clair et en sombre, en français et en anglais, y compris « Léger (images réduites) » tout en bas.

Dans ces menus, la **ligne choisie** (le type, la qualité du PDF, un niveau de titre) est bleue et en gras ; à vérifier à
l'œil, en clair puis en sombre : la souris sur cette ligne la laisse bleue et en gras, d'un bleu un peu plus soutenu, bien
lisible sur le gris du survol (4,5:1 au moins) ; la souris ailleurs, elle reprend son bleu d'avant. Même vérification pour
l'**onglet choisi** des Réglages et celui de la liste « # » (Variables / Puces) : la souris dessus le laisse bleu et souligné,
d'un bleu un peu plus soutenu, lisible sur le gris du survol.

Les **champs** de l'interface (le nom d'un modèle qu'on renomme ; l'Objet, À, Cc, Cci et le nom du PDF d'un email ; la recherche de la galerie ; le nom d'un macro-modèle ; les marges et le caractère déclencheur des Réglages ; les décimales, la devise et le format de date d'une variable) sont dans la même police que les boutons voisins, celle du système. À vérifier à l'œil, en tapant un mot dans chacun : la forme des lettres est celle du bouton à côté, le texte tapé aussi, et rien ne bouge (ni la taille des champs, ni celle des lettres). Le contenu du document, lui, reste en Roboto.

Les **boutons et libellés à texte** sont dans la même police du système : les lignes du menu des polices et du menu des tailles (clic sur le nom de la police, puis sur la taille), les boutons FR, US, —, « Lettres »
d'une variable nombre, J, M, A d'une variable date, « vrai / faux » d'une variable oui/non (cliquer la bulle), et « + Ajouter un en-tête » / « + Ajouter un pied de page » qui apparaissent quand on survole la marge du
haut ou du bas de la feuille. À vérifier à l'œil : la forme des lettres est celle des boutons de la barre ; la taille des lettres et la hauteur des lignes du menu n'ont pas bougé (seule la largeur des boutons d'une
variable suit la forme des lettres).

Le **texte d'un en-tête ou d'un pied de page** de la feuille (celui du haut et celui du bas de la première page, et ceux qui se répètent entre deux pages) est dans la même police que le texte du modèle, Roboto,
et non plus en Arial. À vérifier à l'œil : écrire le même mot dans l'en-tête et dans le corps du modèle, les lettres ont la même forme ; la taille du texte et la place des zones n'ont pas bougé.

Les **trois boutons jour / mois / année** de la barre d'une variable de date s'écrivent J, M, A en français et D, M, Y en anglais. À vérifier : passer la langue de l'interface en anglais dans les Réglages
(la page se recharge), ouvrir la barre d'une date (cliquer la bulle) : D, M, Y et les infobulles « Show/hide day / month / year » ; revenir au français : J, M, A.

## Principe directeur — la chaîne à 3 étages

Le contenu d'un modèle passe par **3 moteurs de rendu indépendants**, chacun avec son propre
code : l'éditeur (TipTap/ProseMirror), le mode Lecture (`js/reader-mode.js`, résolution
`#Variable` + reconstruction DOM passive), et l'export PDF vectoriel (`js/pdf-export.js`,
reconstruction en `docDefinition` pdfmake). **Une fonctionnalité qui marche dans l'éditeur ne
garantit RIEN sur les deux autres** — ce sont des passes de resérialisation distinctes, pas trois
vues sur un même moteur.

Chaque fonctionnalité doit donc être vérifiée aux **3 étages**, dans l'ordre :
1. **Éditeur** — le comportement/l'état visuel est correct pendant l'édition.
2. **Mode Lecture** — le même document, une fois basculé en lecture, rend EXACTEMENT la même
   mise en page (texte, position, tailles) — pixel perfect, pas "à peu près".
3. **Export PDF vectoriel** — le PDF généré reproduit à nouveau EXACTEMENT la même mise en page.

**Mise à jour 2026-09-14** : l'étage 2 a maintenant une première couverture automatisée réelle -
`dev-tests/scenarios-readmode-fidelity.js` (groupe `readModeFidelity`, 15 cas), comparant la
position RENDUE d'un même repère entre l'éditeur et le mode Lecture (texte, image inline, image en
calque dans 3 contextes, tableau, 2-colonnes, en-tête/pied, note de bas de page, numérotation de
titre). A immédiatement trouvé un vrai bug dès son premier lancement (listes trop indentées en mode
Lecture - padding-left manquant sur `.reader-content ul/ol`, cf. `dev-tests/BUGS.md` Bug 4), **corrigé
le même jour** - suite 100% verte. Reste à couvrir : sommaire, chips intelligents, couleur/surlignage,
formats de police - cf. `dev-tests/README.md` pour la méthodologie complète.

**Constat structurel antérieur (2026-09-13, partiellement résolu ci-dessus)** : la suite automatisée
(`dev-tests/scenarios-*.js`, 89 cas à l'époque) couvrait bien l'étage 1 (état DOM/éditeur) et
partiellement l'étage 3 (structure du `docDefinition` pdfmake, pas un rendu pixel réel - **ce
dernier point est aussi résolu depuis** par `scenarios-pdf-ground-truth.js`, qui décode les octets
réels du PDF via pdf.js plutôt que de lire les métadonnées `.positions[]`/`.absolutePosition` de
pdfmake, jugées peu fiables pour du texte centré/aligné à droite ou une image en calque avec un
alignement résiduel - cf. ce même fichier) — mais **l'étage 2 (mode Lecture) n'avait AUCUNE
couverture automatisée**, alors que c'est un moteur de rendu séparé, avec ses propres bugs déjà
rencontrés (ex. `project_toc_and_heading_numbering` : bug de portée CSS spécifique au mode Lecture,
jamais visible dans l'éditeur). Partiellement comblé, cf. la mise à jour ci-dessus.

Un HTML de test unique regroupant beaucoup de cas (cf. §9, modèles de test) permet de dérouler
les étages 2 et 3 une seule fois sur un document dense plutôt que de re-créer le contenu à
chaque vérification.

---

## 1. Texte et mise en page

**Couverture automatisée (étage 1, éditeur)** : `fmt_bold_basic`, `fmt_italic_basic`,
`fmt_underline_basic`, `fmt_strike_basic`, `fmt_combine_bold_italic_underline`, `fmt_toggle_off`,
`fmt_align_*`, `fmt_font_size_change`, `fmt_heading_levels`, `fmt_heading_numbering_numeric`,
`fmt_undo_redo`, `fmt_undo_history_not_cleared_by_sethtml` (`scenarios-formatting.js`).
**Étage 3 (structure PDF)** : `pdffid_bold_italic_underline_strike`, `pdffid_alignment_*`,
`pdffid_font_size`, `pdffid_sibling_headings_no_cumulative_indent` (ajouté le 2026-09-13, cf.
bug ci-dessous) (`scenarios-pdf-fidelity.js`).
**Étage 2 (Lecture)** : non couvert.
**Bug trouvé le 2026-09-13** : plusieurs H1 de même niveau, avec une numérotation active,
s'indentaient progressivement dans le PDF (jamais dans l'éditeur) — la mesure d'indentation
d'un titre remontait par erreur la largeur du marqueur de numérotation (`::before` CSS,
"I)", "II)", "III)"...) comme si c'était un retrait sémantique. Corrigé en mesurant
l'indentation des titres comme celle d'un `LI` (bord de la boîte, pas position du texte).
**Non couvert du tout** : police (famille), numérotation alpha/romaine (seule `numeric` est
testée), sommaire (TOC), couleur de texte/surlignage.

### Protocole
1. Rédiger 3 paragraphes de plusieurs lignes chacun (assez long pour forcer un retour à la
   ligne naturel dans la largeur de page).
2. **Éditeur** : appliquer, sur des sélections variées (mot seul, phrase, paragraphe entier,
   sélection à cheval sur 2 paragraphes) :
   - Gras/Italique/Souligné/Barré, seuls puis combinés, et leur retrait (re-cliquer).
   - Raccourcis clavier associés (Ctrl+B/I/U) — vérifier qu'ils font la même chose que les
     boutons, y compris dans une cellule de tableau et une colonne (cf. §2/§6).
   - Alignement gauche/centre/droite/justifié, bouton principal ET sous-menu au survol.
   - Police (famille) — vérifier que le rendu change réellement à l'écran, pas seulement le
     libellé du sélecteur.
   - Taille de police via les boutons -/+ ET la valeur affichée (doit refléter la sélection
     courante, pas rester figée sur la dernière valeur cliquée) — c'est **l'affichage
     dynamique de l'état de mise en page** demandé : cliquer dans du texte à 14pt doit remettre
     le contrôle sur "14pt" sans action de l'utilisateur.
   - Même vérification d'affichage dynamique pour Gras/Italique/Souligné/Barré/Alignement (les
     boutons doivent s'allumer/s'éteindre selon la position du curseur).
   - Titres H1-H6, numérotation des titres dans ses 3 styles (`1.`/`a.`/`I.`) ET "Aucune" —
     vérifier le changement de style à la volée sur un document déjà titré.
   - Sommaire (TOC) : insertion, vérifier qu'il reflète les vrais titres et leur numérotation.
   - Retours à la ligne : `Enter` (nouveau bloc) vs `Shift+Enter` (retour dans le même bloc) —
     vérifier que les deux produisent des résultats DIFFÉRENTS et corrects (cf. la régression
     Entrée trouvée et corrigée le 2026-09-12 — un candidat naturel à une régression future,
     surveiller en priorité après tout changement touchant l'import map ou TipTap).
   - Couleur de texte et surlignage, palette ET sélecteur personnalisé.
3. **Mode Lecture** : rebasculer sur le même document, comparer VISUELLEMENT (capture d'écran
   ou zoom) chaque paragraphe à ce qu'il était dans l'éditeur — tailles, couleurs, gras/italique,
   alignement, numérotation des titres, sommaire.
4. **Export PDF** : exporter en vectoriel, ouvrir le PDF, comparer à nouveau à l'éditeur ET au
   mode Lecture — les 3 doivent être identiques.

---

## 2. Tableaux

**Couverture automatisée (étage 1)** : `table_insert_basic`, `table_add_row_after`,
`table_add_col_after`, `table_delete_row`, `table_delete_table`, `table_cell_text_formatting`,
`table_cell_list` (`scenarios-tables.js`). **Étage 3** : `pdffid_table_column_widths_proportional`
(largeurs proportionnelles, construites via HTML avec `colwidth` déjà posé — **pas** via un vrai
glisser de poignée), puis la largeur et les retours à la ligne d'un tableau exporté en PDF :
`pdffid_table_fills_the_content_width_and_keeps_its_columns`, `pdffid_table_default_reaches_the_right_margin`,
`pdffid_table_cells_wrap_like_the_browser` et `pdffid_table_cell_wraps_follow_the_browser_across_widths`.
**Étage 2** : non couvert.
**Gap confirmé** : aucun test ne simule un vrai glisser de la poignée de redimensionnement de
colonne puis ne vérifie la largeur résultante (contrairement à la 2-colonnes, qui a
`twocol_resize_grip` côté éditeur ET une vérification PDF dédiée) — alors que ce mécanisme a
déjà régressé silencieusement une fois par le passé (cf. mémoire projet, poignée de
redimensionnement de tableau).

### Protocole
1. Insérer un tableau, ajouter/supprimer lignes et colonnes dans différents ordres (avant/après,
   au milieu, dernière ligne/colonne restante).
2. Supprimer le tableau entier, vérifier qu'aucun fragment (ligne fantôme, `<colgroup>` orphelin)
   ne reste dans le HTML.
3. Texte dans les cellules : gras/italique/souligné/barré/alignement/liste à puces et numérotée,
   avec indentation (Tab/Shift+Tab) — chaque mise en forme doit rester **par cellule**, jamais
   fuiter sur tout le tableau.
4. Glisser une poignée de redimensionnement de colonne — vérifier que SEULE cette colonne change
   de largeur, que le tableau ne dépasse jamais la largeur de page (Aperçu A4), et que les autres
   colonnes encore "auto" se répartissent l'espace restant correctement.
5. **Mode Lecture** puis **Export PDF** : vérifier que les largeurs de colonnes obtenues après un
   VRAI redimensionnement (pas du HTML écrit à la main) sont fidèlement reproduites dans les
   deux — c'est le scénario que la suite automatisée ne couvre pas aujourd'hui.

---

## 3. Listes (à l'intérieur ou hors tableau)

**Couverture automatisée** : `list_bullet_*`, `list_ordered_*`, `list_checklist_*`,
`list_multi_item_ordered`, `list_indent_outdent`, `list_checklist_check_toggle`
(`scenarios-lists.js`) — éditeur uniquement.

### Protocole
1. Listes à puces et numérotées, dans le flux principal, dans une cellule de tableau, et dans
   une colonne d'une zone 2-colonnes.
2. Indentation/désindentation (Tab/Shift+Tab) sur plusieurs niveaux — vérifier le changement de
   style de puce par niveau (rond → tiret → carré, ou équivalent numéroté) dans l'éditeur, en
   Lecture, et à l'export PDF.
3. Liste de tâches (checklist) : cocher/décocher, vérifier la persistance de l'état coché après
   changement de mode et export.

---

## 4. Images (au cœur du texte)

**Couverture automatisée** : `img_insert_basic`, `img_align_*`, `img_wrap_toggle_inline_block`,
`img_delete_button`, `img_between_two_paragraphs` (`scenarios-images.js`) — éditeur uniquement,
un seul format d'image (PNG 1x1 de test), une seule méthode d'insertion (bouton + URL).
**Étage 2/3** : `pdffid_inline_image_position_in_paragraph` (structure PDF seulement).
**Gaps confirmés** : aucun test ne couvre plusieurs formats de fichier réels (JPEG/GIF/WEBP/SVG),
le copier/coller d'image, une image simulée "colonne Grist Attachments", ni une image à cheval
sur plusieurs paragraphes en flux normal (seul le cas "calque" est couvert par
`img_between_two_paragraphs`).

### Protocole
1. **Insertion, plusieurs méthodes** :
   - Ajout via lien URL (déjà automatisé).
   - Copier/coller une image directement dans l'éditeur (jamais testé, ni auto ni manuel à ce
     jour — vérifier qu'il existe seulement un mécanisme prévu ou si c'est un vrai trou
     fonctionnel).
   - Simuler une colonne Grist "Attachments" liée à une `#Variable` image : vérifier qu'en mode
     Édition c'est un placeholder, et qu'en mode Lecture/export il est bien remplacé par la
     vraie pièce jointe (cf. `GristAPI.hydrateAttachmentImages`).
2. **Formats de fichier** : PNG, JPEG, GIF (animé et statique), WEBP, SVG — au minimum vérifier
   qu'aucun de ces formats ne casse l'insertion ni l'export (rappel : pdfmake ne sait embarquer
   que du JPEG/PNG, `rasterizeDataUri` doit convertir les autres — vérifier que la conversion ne
   dégrade pas visiblement une image simple).
3. **Positions et tailles** : insérer une image à différentes tailles (via poignée ET via les
   boutons zoom), à différentes positions dans un paragraphe (début, milieu, fin), à cheval sur
   plusieurs paragraphes (une image "au cœur du texte" suivie d'un retour à la ligne).
4. **Dans des contextes imbriqués** : dans une cellule de tableau, dans une colonne d'une zone
   2-colonnes (rappel : le cas cellule a une limitation connue et documentée pour l'ordre
   texte/image, cf. `dev-tests/BUGS.md` Bug 3 — vérifier si toujours vrai).
5. **3 étages** pour chaque cas ci-dessus : Éditeur → Lecture (position/taille identiques,
   image bien résolue si Attachments) → PDF (position/taille identiques, format bien converti).

---

## 5. Images flottantes (calque devant/derrière)

**Couverture automatisée** : `img_layer_*` (front/behind, éditeur), `img_resize_corner_handle`,
`img_resize_corner_*`, `img_zoom_buttons`, `img_reset_size`, `img_opacity_slider`,
`img_move_when_layered` (glisser la poignée de déplacement) — tous éditeur uniquement.
**Étage 3** : `pdffid_layered_image_absolute_position` (structure seulement).
**Étage 2** : non couvert avant le 2026-09-13 (toujours aucun test automatisé) — c'est
exactement là qu'un bug a été trouvé ce jour-là : une image en calque s'affichait "collée en
haut à gauche" en mode Lecture, correcte en éditeur. Cause : `.reader-content` n'avait pas
`position:relative` comme `.tiptap`, donc `position:absolute` remontait à `#reader-container`
(mauvais repère, décalage de tout son padding/centrage) au lieu de `.reader-content` lui-même.
Corrigé par une règle CSS symétrique à celle de `.tiptap` — aucun test automatisé de l'étage 2
n'existe encore pour ce cas précis, à ajouter en priorité (cf. Prochaines étapes). C'est aussi
la fonctionnalité la plus complexe géométriquement (bracketing + interpolation, cf. mémoire
projet) et donc la plus probable à diverger
silencieusement entre les 3 étages.

### Protocole
1. Passer une image en calque devant/derrière, vérifier le glisser-déposer réel (poignée de
   déplacement dédiée) ET les 4 poignées de redimensionnement aux coins.
2. Vérifier la position à des endroits volontairement "difficiles" : près d'un bord de page, à
   cheval sur une coupure de page (rappel : bug historique corrigé lié à ce cas précis), dans une
   cellule de tableau, dans une colonne 2-colonnes.
3. Vérifier l'opacité (curseur), le calque normal/devant/derrière et l'alignement gauche/centre/
   droite d'une image en calque (mécanisme différent de l'alignement en flux normal, cf.
   `alignOrSnap`).
4. **3 étages, systématiquement** : la position en pixels dans l'éditeur, en mode Lecture, et en
   points PDF doivent correspondre au même point réel du document — c'est ici que le plus grand
   nombre de bugs a déjà été trouvé par le passé (cf. mémoires
   `project_floating_image_position_limits`, `project_image_anchor_bracketing_interpolation`).

---

## 6. Module 2 colonnes

**Couverture automatisée** : `twocol_insert_basic`, `twocol_independent_content`,
`twocol_formatting_per_column`, `twocol_resize_grip` (éditeur) ; `pdffid_twocolumns_width_ratio`
(structure PDF) ; imbrications avec tableaux/listes/titres/citations
(`scenarios-nesting.js` : `nest_table_inside_twocolumns`, `nest_twocolumns_inside_table_cell`,
`nest_list_inside_table_inside_twocolumns`, `nest_blockquote_inside_twocolumns`).
**Étage 2** : non couvert.

### Protocole
1. Vérifier que le contenu de chaque colonne reste indépendant (mise en forme, listes, images).
2. Glisser la poignée de redimensionnement, vérifier le ratio des largeurs en éditeur, en
   Lecture, et à l'export (le ratio doit être visuellement identique aux 3 étages, pas juste
   numériquement proportionnel dans le `docDefinition`).
3. Vérifier la conservation de la mise en page (padding/bordure de la zone, indentation du texte
   par rapport à un paragraphe normal) aux 3 étages — rappel : ce point précis a déjà eu un bug
   corrigé (`project_two_columns_zone_indent_bug`).

---

## 7. En-tête / pied de page, pagination, notes de bas de page, chips

**Couverture automatisée** : `hf_set_and_get_roundtrip`, `hf_enter_via_real_ui_click`,
`hf_type_in_zone_persists`, `hf_different_first_page`, `hf_page_number_format_*`
(`scenarios-headerfooter.js`) ; `pagebreak_insert`, `pagebreak_pdf_two_pages`,
`toc_insert_and_detect_headings`, `toc_empty_state`, `toc_pdf_page_numbers`
(`scenarios-pagebreak-toc.js`, + `pagebreak_editor_gap_reserves_full_remaining_page` ajouté le
2026-09-13, **puis** `pagebreak_readmode_gap_matches_editor` le même jour une fois découvert que
`reader-mode.js` garde sa PROPRE copie de cette logique de pagination, restée non corrigée après
le premier correctif éditeur - à surveiller à chaque futur changement de l'un des deux fichiers,
l'autre ne suit pas automatiquement) ; `chip_footnote_insert_and_edit`, `chip_footnote_delete`,
`chip_footnote_two_notes_numbering`, `chip_footnote_pdf_placement`,
`chip_footnote_survives_twocolumns_zone`, `chip_smart_*` (date/heure/email — `scenarios-chips.js`).
`pdffid_header_footer_fixed_height_regardless_of_content_length` (`scenarios-pdf-fidelity.js`,
2026-09-13) couvre désormais le bug trouvé ce jour-là (texte d'en-tête/pied infini, jamais
plafonné, PDF/éditeur désynchronisés) — corrigé par une bande fixe (60px de contenu,
`PageLayout.HEADER_FOOTER_ZONE_PX`) ; depuis le 20/10 ce qui la dépasse est COUPÉ à l'écran fermé,
en Lecture, à l'impression, dans le PDF et dans le Word sans jamais repousser le texte de la page,
et l'éditeur ouvert ne refuse plus rien : il trace la limite et le dit (trait rouge, note en mm).
C'est la zone la MIEUX couverte actuellement (éditeur, Lecture, PDF, Word).

### Protocole
1. Vérifier que la bande d'une zone en-tête/pied (`PageLayout.HEADER_FOOTER_ZONE_PX`, 60 px de
   contenu) est la même et **identique** en éditeur, en Lecture et à l'export — une image, un
   tableau ou un texte qui la dépasse n'est jamais refusé dans l'éditeur (la zone ouverte trace
   la limite en rouge et dit de combien elle dépasse, « Réduire l'image » pour une image) et il est
   coupé aux 3 étages, sans jamais décaler le texte de la page — vérifier aussi
   qu'un saut de page forcé peu après le début d'une page réserve bien tout le reste de la page
   dans l'Aperçu A4 (pas un espace collé au pied de page suivant). Dans une zone ouverte,
   « Sommaire » et « Saut de page » de la barre sont grisés (ni un clic ni Alt+Entrée n'y posent
   rien) et redeviennent actifs à « Terminer » ; une zone qui n'a qu'un trait (« --- » puis
   Espace) est gardée à « Terminer » et le trait se voit dans la bande fermée, à la Lecture,
   dans le PDF et dans le Word, le texte de la page restant à sa place. Ce trait est le même
   avant et après « Terminer » (fin, gris clair, sans relief : même épaisseur dans la zone
   ouverte, dans la bande fermée, entre deux pages de l'éditeur et à la Lecture) ; le PDF le
   dessine en noir et le Word en gris clair, comme avant.
2. Vérifier "Première page différente" (en-tête/pied du n°1 distinct du reste).
3. Pagination : compter les pages en Aperçu A4 (éditeur), en mode Lecture, et dans le PDF — les
   3 doivent tomber sur le même nombre de pages pour un même document, y compris avec des sauts
   de page manuels et des en-têtes/pieds de taille variable.
4. Notes de bas de page : insérer plusieurs notes, vérifier la numérotation continue (y compris
   à travers une zone 2-colonnes, cf. bug corrigé le 2026-09-12), l'affichage en bas de la bonne
   page dans le PDF (pas toutes regroupées en fin de document), et leur rendu en mode Lecture.
5. Chips intelligents (date, heure, email, note de bas de page) : vérifier que la valeur insérée
   est plausible et cohérente aux 3 étages.

---

## 8. UI/UX globale

**Couverture automatisée** : aucune (l'automatisation pilote l'éditeur directement, jamais les
survols/menus déroulants/comportement de fermeture).

### Protocole
1. Défilement du document en mode Édition avec un contenu long (plusieurs pages) — vérifier
   l'absence de saut visuel, de recalcul de pagination qui clignote, ou de perte de position du
   curseur.
2. Survoler chaque groupe `.v2-hover-group` (Titre, Alignement, Liste, Type d'export...) —
   vérifier que le menu déroulant s'ouvre sans clignoter, se referme proprement en sortant de la
   zone, et que la sélection au clic fonctionne à chaque fois (pas seulement au premier essai).
3. **Fermeture au clic ailleurs** : ouvrir chaque modale et chaque menu déroulant, cliquer en
   dehors — vérifier la fermeture. Ouvrir une modale, appuyer sur Échap — vérifier la fermeture
   ET que le focus clavier revient sur le bouton qui l'avait ouverte (corrigé le 2026-09-13,
   cf. `ModalBase.adopt` (`js/modal-base.js`, appelée par `wirePageModals` de `js/main.js`) — à revérifier après tout changement sur les modales).
4. Sélection de texte à la souris près des bords de l'éditeur, d'une cellule, d'une image — pas
   de sélection qui "saute" ailleurs de façon inattendue.

---

## 9. Modèles de test dédiés

Trois modèles vivant dans `templates-gallery-dev/` — catalogue **séparé** de `templates-gallery/`,
chargé en plus de celui-ci **seulement quand l'adresse du widget contient `?dev`**
(`https://lombre33.github.io/publipostageGrist/?dev` : à saisir dans l'URL du widget Grist pour dérouler ce
protocole ; sans `?dev` la galerie n'affiche que les vrais modèles, cf. `templates-gallery-dev/README.md`). Ils servent à dérouler rapidement
une bonne partie de ce protocole sans avoir à retaper du contenu à chaque fois :

- **`test-mise-en-page`** ("Modèle de test — Texte & mise en page") : 3 paragraphes multi-lignes
  avec toutes les mises en forme de texte, tous les niveaux de titre + numérotation, un sommaire,
  des listes à puces/numérotées/tâches imbriquées, une citation, un saut de page, une note de bas
  de page et les 3 chips intelligents.
- **`test-images-tableaux`** ("Modèle de test — Images, tableaux & 2 colonnes") : un tableau avec
  texte mis en forme par cellule, une zone 2-colonnes avec formats différents par colonne, une
  image "au cœur du texte" à cheval sur 2 paragraphes, une image en calque devant ET derrière
  (positions volontairement proches d'un bord de page), une image dans une cellule de tableau et
  une dans une colonne 2-colonnes.
- **`vitrine-fonctionnalites`** ("Vitrine des fonctionnalités", tag `démo`/`vitrine`, séparé des
  deux ci-dessus qui sont des fixtures de test internes) : document de 4 pages, destiné à la fois
  à faire la démonstration du module et à servir de test de bout en bout - en-tête/pied de page
  (première page différente), sommaire, tous les formats de texte, listes, citation, note de bas
  de page, tableau, image au cœur du texte à cheval sur 2 paragraphes, 2 images en calque avec de
  vraies photos (Lorem Picsum, vérifié CORS-safe pour l'export), article de presse en zone
  2-colonnes, variables Grist et chips intelligents. C'est en testant ce modèle (éditeur → lecture
  → PDF, 4 pages) que le bug reader-mode du §7 a été trouvé - un bon rappel que ce modèle vaut la
  peine d'être rejoué après tout changement touchant la pagination ou le positionnement en calque.

**Utilisation** : charger le modèle, dérouler le protocole correspondant (§1-§7) aux 3 étages
(Éditeur → Lecture → PDF), sans avoir à reconstruire le contenu de test à la main.

---

## 10. Langue (FR/EN) et touche de déclenchement `#Variable`

**Couverture automatisée** : le changement de langue par Réglages (`languageReloadMouse`) et la langue de GFS (`gfsLanguage`) ; les formats par défaut et la touche de déclenchement : aucune.

### Protocole
1. Panneau Réglages → onglet Langue → basculer FR/EN — la page SE RECHARGE (demande du 14/10 :
   « quand on change de langue, on recharge la page et uniquement ça ») et repart dans la langue
   choisie : vérifier que TOUS les libellés visibles sont dans cette langue (toolbar, infobulles,
   menus, modales), sans texte resté en français au milieu d'une interface en anglais (ou
   l'inverse) — ouvrir les barres flottantes image/tableau/variable, dont les infobulles sont
   écrites à la construction. Avec une modification qui attend d'être enregistrée, la question
   « Enregistrer / Abandonner / Annuler » passe d'abord : « Annuler » laisse la langue d'avant.
   La page rechargée rouvre le modèle où l'on était (demande du 20/10), pas le ★ ni celui de la vue :
   ouvrir un autre modèle que le ★, changer de langue, vérifier que ce modèle est revenu (idem
   après « Recharger maintenant » de l'onglet Touche de déclenchement, et un modèle email ou
   macro-modèle). Dans GFS, le stockage du navigateur est refusé : la langue y est celle de GFS
   (point suivant) ; « Recharger maintenant » y rouvre déjà le modèle, dans la langue de GFS.
   Un F5 ouvre, lui, le modèle habituel.
   **Dans GFS** (consigne GFS 019 du 20/10 : un seul choix de langue par personne, commun à toutes
   les apps) : à l'ouverture l'app est dans la langue de GFS (bouton Langue de l'explorateur de GFS),
   quelle que soit celle du navigateur ; Réglages → Langue : les deux cases sont grisées, visibles,
   avec la phrase « La langue se choisit dans Grist Factory Suite (bouton Langue de l'explorateur). »
   (rien ne se passe au clic) ; changer la langue dans GFS : l'app se recharge dans la nouvelle
   langue et rouvre le modèle où l'on était ; avec une modification en attente, la question
   « Enregistrer / Abandonner / Annuler » passe d'abord, « Annuler » laisse la langue d'avant
   jusqu'au prochain démarrage. À essayer une fois que GFS a avancé sa référence de l'app sur ce
   lot ; seule (hors GFS), rien ne change : les cases restent actives.
2. Vérifier qu'un format par défaut (date/nombre) suit bien la langue choisie quand aucun format
   explicite n'a été posé sur la variable (cf. `I18n.getLang()` dans `variable-format.js`).
3. Onglet Touche de déclenchement → changer le caractère (`#` → `@` par exemple), recharger la
   page (changement à froid, pas à chaud) — vérifier que le nouveau caractère déclenche bien le
   panneau `#Variable`, que l'ancien ne le déclenche plus, et qu'une bulle déjà existante dans un
   document affiche le nouveau caractère après rechargement (pas de migration nécessaire, le
   préfixe est décoratif et régénéré à chaque rendu).

---

## 11. Barre flottante de formatage nombre/date d'une bulle `#Variable`

**Couverture automatisée** : `dev-tests/scenarios-var-number-default.js` (groupe `varNumber`, 6 cas : un nombre sans réglage s'écrit FR - US en
interface anglaise - comme le bouton que la barre montre allumé) et `dev-tests/scenarios-varformat.js` (groupe `varFormat`, 4 cas) - cf.
`dev-tests/BUGS.md` Bug 5 (bloquant, corrigé le 2026-09-14 : le panneau se refermait dès qu'on
touchait un de ses `<select>`/`<input>`, un premier correctif s'étant révélé insuffisant). La suite
automatisée reproduit la CONDITION du bug (focus qui quitte l'éditeur) de façon fiable, mais PAS le
geste utilisateur exact (cliquer réellement un `<select>` natif n'est pas fidèlement simulable en
automatisation, cf. root cause dans BUGS.md) - ce protocole manuel reste donc le seul filet qui
exerce le VRAI clic natif.

### Protocole (à rejouer après tout changement dans `js/floating-toolbars.js` ou `js/editor-core.js`)
1. Insérer une `#Variable` sur une colonne Nombre, la sélectionner (clic dessus) — la barre
   flottante FR/US/—/décimales/devise/lettres et le bouton du zéro (un « 0 » qui devient « Ø » barré quand
   il est enfoncé) doit apparaître au-dessus.
   Sans toucher à la barre, passer en Lecture : le nombre doit déjà s'écrire avec les espaces des
   milliers (« 1 234,5 ») - le FR allumé dans la barre est le réglage réellement appliqué, il ne
   faut pas avoir à recliquer dessus. Le même nombre exporté en PDF s'écrit pareil, sans case vide
   à la place de l'espace. Le bouton du zéro est enfoncé (« Ø ») tant que rien n'est réglé : une ligne
   dont la valeur est 0 n'écrit rien à la place de la bulle en Lecture et à l'export.
2. Cliquer le sélecteur "nb décimales" et choisir une valeur (ex. "2") — le menu déroulant doit
   rester ouvert le temps du choix (pas de fermeture "flash"), la barre doit rester affichée
   ENSUITE, et le nombre de décimales doit bien s'appliquer (vérifiable en rebasculant en mode
   Lecture avec une ligne Grist réelle, ou en rouvrant la bulle).
3. Même vérification pour le champ "Devise" (taper un symbole), pour le bouton du zéro (le cliquer :
   la barre reste affichée, le bouton se relâche et redevient « 0 », et en mode Lecture une ligne dont
   la valeur est 0 écrit « 0 » ; le recliquer : le bouton se renfonce et la Lecture n'écrit plus rien)
   et, sur une colonne Date, le sélecteur "format de date".
4. Cliquer ensuite AILLEURS dans la page (hors de l'éditeur et hors de la barre flottante, ex. le
   nom du modèle) — la barre doit bien se refermer (ne pas rester affichée indéfiniment - garde-fou
   contre une sur-correction du Bug 5). Vérifier avec une bulle, une image et un tableau, juste après
   les avoir cliqués (l'éditeur a alors le focus : c'est seulement dans ce cas que le blur de l'éditeur
   rouvrait la barre d'une bulle ou d'une image).
5. Même vérification sur la barre flottante d'une image en calque (slider d'opacité) : glisser le
   curseur doit modifier l'opacité en direct sans que la barre ne se referme pendant le geste.
6. Bulle #Variable sélectionnée (sa barre ouverte), cliquer « Lecture » : aucune barre flottante ne reste
   affichée (ni au-dessus de la bulle, ni en haut à gauche de la page par-dessus la barre du haut). Même
   résultat en allant sur « Lecture » au clavier (Tab jusqu'au bouton puis Entrée). Revenir en « Édition »,
   cliquer la bulle : sa barre se rouvre.
7. Bulle d'une variable d'une autre table (ex. `#Annuaire.NomPrenom`, mise en gras, avec une condition d'affichage),
   icône « Autres attributs », cocher un attribut, cliquer « Remplacer » (entre « Annuler » et « Insérer ») : la bulle
   devient cet attribut sans rien perdre de son gras ni de sa condition, reste sélectionnée et sa barre revient à côté
   d'elle ; un seul Ctrl+Z rend l'ancienne. « Insérer » ajoute toujours les attributs juste après la bulle. Avec le suivi
   des modifications actif : l'ancienne bulle est barrée, la nouvelle soulignée, « Tout refuser » rend l'ancienne.
8. Bulle choisie (demande d'Antoine du 01/10 : un mini retour visuel pour confirmer qu'on peut copier) : cliquer une bulle bleue, son fond passe à un bleu plus
   soutenu tant qu'elle est sélectionnée (texte, liseré et pointillés d'une condition inchangés) ; Ctrl+C, un clic plus loin dans le texte puis Ctrl+V posent une seconde
   bulle, au fond ordinaire ; le clic dans le texte a rendu à la première son fond d'origine. Même retour sur une bulle « Calcul » (vert plus soutenu, texte plus sombre) et
   sur une variable dont la colonne a disparu (rouge plus soutenu). En thème sombre la couleur est la même : la page du document y reste blanche.

---

## 12. Performance et robustesse

**Couverture automatisée** : aucune.

### Protocole
1. Chronométrer le chargement initial du widget (première ouverture, cache navigateur vide) et
   noter toute lenteur anormale — en particulier le chargement paresseux des bibliothèques PDF
   (~3-5 Mo) qui ne doit se déclencher qu'au premier export, jamais à l'ouverture.
2. Importer chacun des modèles d'exemple de la galerie (Facture, Devis, Contrat de prestation de
   services, Attestation, Courrier de relance, + les 2 modèles de test du §9) — sans données
   Grist réelles (pas de `#Variable` résolue, normal en local) : vérifier au minimum que
   l'insertion ne plante pas, que la mise en page du gabarit s'affiche correctement, et que la
   table Grist simulée (`schema.py`) se parse sans erreur.

---

## 13. Revue rapide des derniers commits

À faire systématiquement après une série de correctifs, avant de les considérer terminés :
1. Relire le diff des fichiers touchés — chercher une logique dupliquée qui aurait dû être
   factorisée (même motif copié-collé à 2-3 endroits), une fonction qui grossit sans être
   redécoupée, ou un correctif posé au mauvais endroit (symptôme traité loin de sa cause réelle).
2. Chercher spécifiquement : nouvelle chaîne interpolée dans du HTML sans passer par
   `HtmlSanitize`/`textContent`, nouvel appel réseau (`fetch`/CDN) sans réflexion sur son
   origine/intégrité, nouvelle donnée sensible loggée en console, nouveau point d'entrée
   `innerHTML` alimenté par une donnée externe au widget (colonne Grist, gabarit partagé).
3. Relancer la suite automatisée complète (89 scénarios) — jamais se fier à un sous-ensemble
   après un changement qui touche un fichier partagé (`editor.js`, `pdf-export.js`,
   `reader-mode.js`, `variables.js`).

---

## 14. Orientation de la page (portrait / paysage)

**Couverture automatisée** : groupe `orientation` (`scenarios-orientation.js`, 21 cas : feuille et pagination de l'éditeur et de la Lecture, facteur
d'ajustement, enregistrement avec le modèle, PDF, Word, colonne à deux colonnes trop large, image en calque (suivi des modifications, Aperçu A4 coupé et Lecture compris), plafond des marges,
impression navigateur), script
Node `orientationMouse` (vrai clic, Entrée et Espace à 700×400, clair et sombre), cas `toolbar_orientation_*` et `autosave_saves_an_orientation_change_alone`.
**Non couvert** : le rendu réel dans Word (seul le XML de la section, `w:orient`, est vérifié), un vrai lecteur PDF, la boîte d'impression d'un navigateur.

### Protocole
1. Ouvrir un modèle classique de plusieurs pages (texte, un tableau, une zone à deux colonnes, une image en calque), cliquer le bouton Portrait / Paysage (juste
   après Aperçu A4) : la feuille s'élargit, les sauts de page se recalculent, l'icône montre une page large et le bouton s'allume. En Lecture : même feuille, mêmes sauts.
2. Exporter en PDF : le lecteur PDF annonce 297 × 210 mm, le texte et le tableau occupent toute la largeur, l'image en calque reste sur la page de son texte, l'en-tête et
   le pied de page se placent sur la page paysage. Même résultat pour « Exporter les lignes » (ZIP et PDF unique).
3. Exporter en Word, ouvrir le fichier dans Word : Mise en page > Orientation indique Paysage, les marges sont celles du modèle, le tableau et la zone à deux colonnes
   remplissent la largeur.
4. Repasser en portrait : la feuille, les sauts de page et les exports sont exactement ceux d'avant ; une colonne réglée à 200 mm en paysage ne laisse pas la colonne
   droite à zéro en portrait (dix millimètres au moins) et retrouve ses 200 mm en repassant en paysage.
5. Enregistrer, recharger la page du document Grist : le modèle revient en paysage ; un modèle enregistré avant ce réglage reste en portrait.
6. Un email : le bouton est visible et grisé (info-bulle « pas disponible pour ce modèle »), un clic ne change rien. Un macro-modèle a son propre bouton (voir le point suivant) :
   la page d'un modèle qu'il assemble n'a aucune prise sur lui.
7. À 700 px de panneau, la feuille paysage est réduite à la largeur du panneau (facteur 0,60 contre 0,85 en portrait) : le texte est plus petit à l'écran, pas dans
   le PDF ni le Word.
8. Suivi des modifications activé, changer d'orientation sur un modèle qui a une image en calque : aucune suggestion (ni suppression ni insertion) n'apparaît, l'image
   reste sur la page de son texte. Un tableau plus large que la page portrait n'est pas réduit tant que le suivi est actif (limite connue de la bibliothèque) ; les exports le
   ramènent à la page.
9. Aperçu A4 décoché (ou Mode lecture), changer d'orientation, puis rallumer l'Aperçu A4 (ou revenir en Mode édition) : l'image en calque est alors sur la page de son
   texte, dans l'éditeur comme dans le PDF.

---

## 15. Format de la page (A3, A4, A5, A6)

**Couverture automatisée** : groupe `pageFormat` (`scenarios-page-format.js`, 24 cas : table des dimensions, menu du bouton Page, feuille et pagination de l'éditeur et de la
Lecture, facteur d'ajustement, enregistrement avec le modèle, marges et plafonds de Réglages, PDF, Word, tableau et zone à deux colonnes, image en calque, suivi des modifications,
impression navigateur), script Node `pageFormatMouse` (survol et vrai clic sur les lignes du menu, Tab, Entrée et Espace, à 700×400, clair et sombre), cas `toolbar_orientation_*`.
**Non couvert** : le rendu réel dans Word (seul `w:pgSz` du fichier est lu), un vrai lecteur PDF, la boîte d'impression d'un navigateur, l'impression réelle sur du papier A3 ou A6.

### Protocole
1. Survoler le bouton Portrait / Paysage (juste après Aperçu A4) : un menu s'ouvre sous la souris avec « Page », Portrait, Paysage, puis A3, A4, A5 et A6 avec leurs dimensions ;
   Portrait et A4 sont cochés. Cliquer A5 : la feuille se rétrécit (148 mm de large), les sauts de page se recalculent, la case devient « Aperçu A5 », le menu se referme quand
   la souris part et le curseur reste dans le texte.
2. Exporter en PDF : le lecteur PDF annonce 148 × 210 mm, le texte et le tableau occupent toute la largeur, l'en-tête et le pied de page (avec le numéro) se placent en haut et en bas
   de chaque page A5. Même résultat pour « Exporter les lignes ». Refaire en A3 (297 × 420 mm) et en A6 (105 × 148 mm), puis en paysage.
3. Exporter en Word, ouvrir le fichier dans Word : Mise en page > Taille indique A5 (ou A3, A6), les marges sont celles du modèle, le tableau et la zone à deux colonnes remplissent la largeur.
4. Repasser en A4 : la feuille et les sauts de page sont exactement ceux d'avant. Les marges d'un petit format ont pu être réduites (elles ne reviennent pas toutes seules) et un
   tableau trop large pour A5 a été réduit pour de bon : à vérifier et à noter.
5. Enregistrer, recharger la page du document Grist : le modèle revient dans son format et son sens ; un modèle enregistré avant ce réglage reste en A4 portrait.
6. Un email : le bouton et son menu sont visibles et grisés (titre « Page (pas disponible pour ce modèle) »), un clic sur une ligne ne change rien.
   Un macro-modèle (au sens imposé ; « Selon chaque modèle » est au § 24) : le bouton et son menu sont actifs ; choisir Paysage puis A5 allume le bouton et coche les deux lignes ; la Lecture, « Exporter en PDF », « Exporter en un seul PDF » et
   « Exporter en DOCX » sont en A5 paysage (le lecteur PDF annonce 210 × 148 mm, Word : Mise en page > Taille A5, Orientation Paysage), même si sa page de garde ou une annexe est en A4
   portrait ou en A3 ; rouvrir cette page de garde seule la montre toujours dans son propre format. Recharger la page du document Grist : le macro-modèle revient en A5 paysage.
   Enregistrement automatique coupé : la page n'est gardée que par « Enregistrer » dans la fenêtre du macro-modèle (et « Enregistrer sous… » en fait une copie qui la garde).
7. À 700 px de panneau : A5 portrait tient sans réduction, A3 portrait est réduit (facteur 0,60), A3 paysage tombe au plancher de 0,5 et la zone d'édition défile horizontalement.
8. Au clavier : Tab depuis Aperçu A4 arrive sur le bouton Page et ouvre son menu, passe par ses six lignes (trait de focus visible), Entrée ou Espace pose le format, Tab suivant
   referme le menu et arrive sur Type d'export.
9. Suivi des modifications activé, changer de format sur un modèle qui a une image en calque : aucune suggestion n'apparaît, l'image reste sur la page de son texte.

---

## 16. Image plus large que sa place, dans le PDF et le Word

**Couverture automatisée** : groupe `imageWide` (`scenarios-image-wide.js`, 8 cas : image dans le texte, dans une case de tableau, dans une colonne d'une zone à deux colonnes, centrée,
habillage gauche et droite aussi larges que la page, image qui tient, format A5 et marges de 30 mm), script Node `wideImagesMouse` (Lecture, PDF et Word à la vraie souris, à 700×400).
La référence est la largeur que l'éditeur donne à l'image (`max-width: 100%`, proportions gardées) ; le PDF est lu par pdf.js, le Word dans `word/document.xml`.
**Non couvert** : le rendu réel dans Word (seules la taille de l'image et la page du fichier sont lues), le texte placé à côté d'une image ancrée aussi large que la page, un vrai lecteur PDF.

### Protocole
1. Dans un modèle A4 portrait, insérer une image (un grand fichier) puis tirer sa poignée bien au-delà du bord droit de la feuille : l'éditeur la garde dans la zone de texte, proportions
   gardées. Mode Lecture : même largeur. « Exporter en PDF » et « Exporter en DOCX » : l'image occupe la même largeur, ses bords restent dans les marges, elle n'est ni rognée ni déformée.
2. Même essai avec l'image centrée (elle reste centrée, entre les marges), dans une case de tableau étroite, puis dans une colonne d'une zone à deux colonnes : elle suit la case ou la colonne.
3. Image à habillage gauche ou droite réglée plus large que la zone de texte : le texte passe dessous (éditeur et Lecture), le PDF fait pareil, le Word aussi (à regarder dans Word : non vérifié ici).
4. Une image plus petite que sa place garde exactement sa taille réglée, en portrait comme en paysage. Passer en A5 ou réduire les marges : l'image qui tenait en A4 est ramenée à la
   nouvelle zone de texte, dans l'éditeur, le PDF et le Word.
5. Une image en calque (devant ou derrière le texte) garde sa taille réglée : elle n'est pas ramenée (son placement relève de « Position des images »).
6. Écart connu : une image à habillage réglée plus large que la page mesure 707 px dans l'éditeur (la marge de 12 px du flottement) et 719 px dans la Lecture, le PDF et le Word.

---

## 17. Lignes vides de fin de document et repère « Page 2 » de l'éditeur

**Couverture automatisée** : groupe `blankLastPage` (`scenarios-blank-last-page.js`, 15 cas : Lecture, PDF, Word et, pour l'éditeur, les quatre cas `blank_page_editor_*`), script Node `editorBlankTailMouse`
(vrai clavier à 700×400 : Entrées de trop au bas d'une page, texte tapé puis effacé, saut de page au bouton de la barre). La capacité d'une page est mesurée, jamais écrite en dur.
**Non couvert** : le rendu réel dans Word, une zone à deux colonnes encore vide en fin de document (l'éditeur la compte). L'impression du navigateur imprime la Lecture et rogne comme elle (groupe `browserPrint`) ; les qualités raster n'existent plus.

### Protocole
1. Dans un modèle A4 portrait (Aperçu A4 activé), taper du texte jusqu'à la marge du bas de la page 1 (la dernière ligne touche la marge), puis appuyer cinq fois sur Entrée : aucune bande « Page 2 »
   n'apparaît, le curseur descend sur les lignes vides (la feuille s'allonge), le pied de page de l'éditeur dit toujours « 1/1 » si le modèle porte un numéro de page « n/total ».
2. Taper une lettre sur la dernière ligne vide : la bande « Page 2 » apparaît juste au-dessus d'elle, le pied dit « 2/2 ». L'effacer : la bande disparaît, le pied redit « 1/1 ».
3. Mettre du texte APRÈS trois lignes vides qui tombent en bas de page : la bande « Page 2 » est là, les lignes vides ont gardé leur place (seules celles de la FIN sont ignorées).
4. Passer en Lecture, puis « Exporter en PDF » et « Exporter en DOCX » avec les cinq lignes vides de l'étape 1 : une seule page, aucune page blanche (même chose qu'à l'étape 1).
5. Poser un saut de page tout à la fin du modèle (bouton de la barre) : la bande « Page 2 » apparaît tout de suite dans l'éditeur (c'est un geste de la personne) ; taper plus d'une page d'Entrées derrière lui n'ouvre pas de
   « Page 3 ». La Lecture et les exports ne font pas de page vide de ce saut final : l'éditeur montre la page où l'on va écrire.
6. Avec un en-tête et un pied de page : refaire les étapes 1 à 3 (la capacité d'une page est plus petite, la page 1 se remplit plus tôt).

---

## 18. Filigrane de la page (texte en travers de chaque page)

**Couverture automatisée** : groupe `watermark` (`scenarios-watermark.js`, 13 cas : le réglage et ses bornes, la géométrie de A3 à A6, le dessin de l'éditeur et de la Lecture, le PDF lu par pdf.js,
le Word lu dans le .docx, l'enregistrement dans `Margins`, la fenêtre et la ligne du menu), script Node `watermarkMouse` (menu et fenêtre à la vraie souris et au clavier, à 700×400, clair, sombre et anglais,
captures avec `WATERMARK_SHOTS=<dossier>`). Le texte, l'angle, la couleur et l'opacité sont lus sur les sorties, jamais sur les objets pdfmake ou docx.js.
**Non couvert** : le rendu réel dans Word et dans Google Docs (seuls l'image ancrée dans l'en-tête, ses pixels et sa place sont lus dans le fichier), un lecteur PDF autre que pdf.js, l'impression navigateur.

### Protocole
1. Ouvrir un modèle classique de plusieurs pages, survoler le bouton Portrait / Paysage : la dernière ligne du menu, après un filet, est « Filigrane… » (rien à droite tant que le modèle n'en a pas).
   La cliquer : une fenêtre s'ouvre avec un champ de texte (rien d'écrit), Diagonale / Horizontale, six couleurs (le gris est choisi), un curseur d'opacité (20 %) et une feuille d'aperçu à la forme de la page.
2. Écrire « CONFIDENTIEL » : la feuille d'aperçu montre le mot en travers de la page, gris clair. Passer en Horizontal, choisir le rouge, tirer le curseur vers 60 % : l'aperçu suit chaque geste. Valider.
3. Aperçu A4 allumé : chaque feuille de l'éditeur porte le mot, au centre exact de la page, derrière le texte ; cliquer et taper dessus place le curseur dans le texte du document (le filigrane ne se sélectionne pas).
   Passer en Mode lecture : même filigrane, même place. Décocher Aperçu A4 : il n'est plus peint (un filigrane n'a de sens que sur la feuille) ; le rallumer le ramène.
4. « Exporter en PDF » : le mot est derrière le texte de chaque page (une image « Sur toutes les pages » le recouvre), à la couleur, à l'angle et à l'opacité choisis ; le texte du filigrane est un vrai texte
   (le sélectionner, le chercher). Même résultat pour « Exporter les lignes ».
5. « Exporter en DOCX » : dans Word, le mot est derrière le texte de chaque page, centré sur la page, de la couleur choisie et pâle (c'est une image, pas du texte modifiable : il ne se retouche pas dans Word).
6. Changer de format (A5 paysage, A3, A6) : le mot reste centré, tourné de la même façon, et rentre dans la page ; un texte de 40 « W » descend à un corps très petit mais reste dans la page.
7. Enregistrer, recharger la page du document Grist : le filigrane est revenu avec le modèle ; un autre modèle n'en a pas ; un macro-modèle a le sien.
8. Rouvrir « Filigrane… », vider le champ puis Valider (ou « Retirer le filigrane ») : le filigrane disparaît de l'éditeur, de la Lecture, du PDF et du Word, et la ligne du menu n'affiche plus de texte. Échap ou
   « Annuler » ne change rien. Un email et une grille : la ligne est grisée.
9. À 700×400, la fenêtre tient sans défiler (titre, texte et son indication, sens, couleurs, curseur, aperçu, boutons), en clair, en sombre et en anglais ; Tab fait le tour de la fenêtre et revient au champ,
   les flèches changent le sens et la couleur, Entrée valide.
10. Écart connu : le Word ne prend pas en compte l'opacité d'une image (la sienne est cuite dans les pixels du filigrane, pas celle d'une image de la couche).

---

## 19. Variables calculées (bulle « Calcul »)

**Couverture automatisée** : groupe `varCalc` (`scenarios-var-calc.js`, 20 cas : nœud et étiquette, case de tableau étroite, bulle rouge, résultat à la Lecture / à l'aperçu commun du PDF et du Word /
en lot / en-tête et pied, anglais, total sans ligne liée, erreurs écrites dans la langue de l'interface, ligne de tableau répétée, vrais PDF et Word, fenêtre ouverte depuis le panneau « # », annulation, calcul refusé,
boutons de fonction, liste des colonnes devant la fenêtre, virgule décimale refusée en anglais, clé de correspondance demandée une fois par table, aperçu, barre flottante, réglages nombre, copier-coller), script Node
`formulaUnit` (le moteur, 104 contrôles) et script Node `calcMouse` (vraie souris et vrai clavier à 700×400, clair, sombre et anglais) ; l'Excel d'un calcul seul dans une case de grille : deux cas du groupe `xlsx`.
**Non couvert** : un vrai Word (le fichier est relu dans `docx`, pas ouvert dans Word), un vrai Excel (le .xlsx est dézippé et son OOXML relu dans `xlsx`, pas ouvert dans Excel), un document Grist réel (jeu de données de test), un calcul sur plusieurs milliers de lignes liées.

### Protocole
1. Dans un modèle dont la table de la page a une colonne Nombre (ex. `HT`) : taper `#`, onglet Chips, ligne « Calcul » : la fenêtre « Insérer un calcul » s'ouvre, rien n'est encore dans le texte.
   Écrire `#Facture.HT * 0,2` (le `#` ouvre la liste des colonnes devant la fenêtre ; Entrée y choisit sans valider) : le résultat de la ligne courante s'affiche sous le champ. « Insérer » pose une bulle verte
   « = #Facture.HT × 0,2 » ; Annuler ou Échap ne laissent rien dans le modèle.
2. Cliquer la bulle : la barre flottante montre « Modifier le calcul » et les réglages nombre (FR / US / décimales / devise / Lettres / Ø) ; condition, autres attributs et boucle sont grisés. « Modifier le calcul »,
   le double-clic et Entrée rouvrent la fenêtre sur la formule ; « Valider » change la bulle en place (un seul Ctrl+Z la rend).
3. Lecture, PDF, Word et e-mail : la bulle devient son résultat, écrit comme une colonne nombre (FR : « 1 200,50 », US en interface anglaise) ; un résultat nul n'écrit rien tant que le bouton Ø est enfoncé.
4. Une facture avec une table de lignes liée (clé de correspondance : une règle par table liée et par table de la page, section 37) : `SOMME(#Lignes.Prix * #Lignes.Quantite)` donne le total des lignes ; sans fonction la fenêtre ou la Lecture dit « donne N valeurs ».
   Dans un tableau dont la ligne est répétée par ligne liée, `#Lignes.Prix * #Lignes.Quantite` donne le total de CHAQUE ligne et la ligne « Total » sous le tableau (avec `SOMME`) celui de toutes les lignes.
5. Une table pas encore liée : le résultat dit « pas encore liée », « Insérer » ouvre la fenêtre de la clé de correspondance ; Annuler la laisse ouverte. Supprimer ensuite la colonne dans Grist : la bulle devient rouge
   avec son message en info-bulle et la Lecture écrit une erreur, jamais un total faux.
6. Panneau de 700 × 400 : la fenêtre tient sans défiler, boutons « Insérer » / « Annuler » visibles ; dans une case de tableau étroite la formule est coupée par « … ».
7. Dans une grille, une case qui ne contient QUE la bulle « Calcul » : « Exporter en Excel… » l'écrit en vrai nombre (la barre de formule d'Excel montre `2469`, pas du texte ; le format de la bulle - décimales, devise - est celui de la case ; aligné à gauche comme les autres nombres). Avec du texte autour, une autre bulle, une erreur de calcul, le bouton « Lettres » ou un zéro masqué (Ø enfoncé) la case est du texte, ou vide ; dans une ligne répétée chaque ligne a SON nombre, et le total sous la grille additionne toutes les lignes liées.

---

## 20. Date du dernier export PDF (Réglages > Vue)

**Couverture automatisée** : groupe `exportDate` (`scenarios-export-date.js`, 11 cas : la liste, l'option et ses échos, la valeur selon le type et le jour de l'appareil, ce que `stamp` écrit et refuse), les cas
`pdfbatch_export_date_*` du groupe `pdfBatch` (le PDF seul, « Impression navigateur » qui n'écrit rien, le ZIP, le PDF unique, une ligne en échec, l'échec de la date dit en rouge, un compte Lecteur), un cas de `sheetAssembly` (la planche), un cas de `settingsColumns`
(colonne disparue dite à l'ouverture) et le script Node `exportDateMouse` (vraie souris et vrai export PDF à 700×400, clair, sombre et anglais). L'essai dans un vrai Grist est le script du laboratoire grist-static
(`/mnt/project-files/labo-grist-reel/lab-export-date.mjs`).
**Non couvert** : un document Grist réel avec des règles d'accès (une colonne que la personne n'a pas le droit d'écrire : Grist refuse, le widget dit « Grist a refusé l'écriture »), une colonne Date et heure d'un autre fuseau
lue dans Grist, un lot de plusieurs milliers de lignes.

### Protocole
1. Dans un document Grist, ajouter à la table du widget une colonne « Dernier export » de type Date et heure (et, pour l'essai, une colonne Texte, une colonne Date et une colonne à formule). Ouvrir Réglages > Vue :
   la section « Date du dernier export PDF » propose « — Aucune — » puis les colonnes Date, Date et heure et Texte (type en indice), pas la colonne à formule ni les colonnes Numérique, Choix, Référence…
2. Choisir « Dernier export » : une phrase dit « Chaque export PDF écrit le jour et l'heure de l'export dans « Dernier export ». » et la ligne « Pour partager vos changements, cliquez sur « Enregistrer »… » apparaît.
   Cliquer « Enregistrer » en haut du widget, dans Grist.
3. Sur une ligne, « Exporter en PDF » : le PDF est téléchargé, l'état dit « PDF généré. » et, dans Grist, la colonne de CETTE ligne montre la date et l'heure de l'export (celles de l'appareil) ; les autres lignes ne changent pas.
4. « Exporter les lignes (ZIP) » puis « Exporter les lignes en un seul PDF » puis « Assemblage avant impression » : chaque ligne du fichier reçoit la date, toutes au même instant. Un lot dont une ligne échoue
   (une image qui ne se lit pas, par exemple) : la fenêtre de fin de lot liste la ligne en échec, qui garde son ancienne date. « Exporter en DOCX », « Exporter en Excel », « Créer l'email » et le bouton PDF réglé sur « Impression navigateur » n'écrivent rien.
5. Refaire avec une colonne Date (le jour seul, sans l'heure) et une colonne Texte (« 2026-10-09 14:32 »).
6. Supprimer la colonne dans Grist, rouvrir Réglages > Vue : la liste la garde, la phrase en rouge dit qu'elle n'existe plus ; un export PDF produit quand même le fichier et le coin d'état commence, en rouge, par
   « Date non écrite : la colonne … n'existe plus. ». Recharger la page du document : l'avertissement d'ouverture cite la colonne supprimée. Transformer une colonne en colonne à formule : la section et
   l'export le disent aussi (« doit être de type Date, Date et heure ou Texte, sans formule »), sans rien écrire.
7. Avec un compte Lecteur (ou une personne en lecture seule par la table des droits) : la section reste visible, grisée, avec « Vous êtes en lecture seule : ce réglage est verrouillé. » ; un export PDF n'écrit rien et ne se plaint de rien.
8. Panneau de 700 × 400 : la section, sa liste avec recherche et la phrase tiennent dans la fenêtre sans défilement de côté ; en sombre aussi.

---

## 21. Numéro de ligne dans une boucle (puce « N° de ligne »)

**Couverture automatisée** : groupe `varLoop` (trois cas `loop_row_number_chip_*` : lignes d'un tableau dans l'ordre affiché, éléments de liste et paragraphes après filtre et tri, lot où chaque ligne de la page repart de 1,
hors de toute zone et zone sans source = 1) et groupe `chips` (cas `chip_row_number_*` : onglet Puces, insertion, libellé français et anglais, aller-retour HTML) ; l'absence de la puce dans les champs texte est tenue par le cas
existant de `fieldEditor` (quatre puces seulement).
**Non couvert** : un vrai Word ou un PDF ouverts hors du navigateur, un document Grist réel.

### Protocole
1. Dans un modèle sur une table de factures avec une table de lignes liée : un tableau avec la ligne d'en-tête « N° | Désignation » et une ligne « puce | #Lignes.Désignation ». Poser la Boucle sur la bulle Désignation
   (« La ligne du tableau »). Pour la puce : taper `#`, onglet Puces, ligne « N° de ligne » (verte, comme la date).
2. Lecture, PDF, Word et e-mail : les lignes sont numérotées 1, 2, 3… dans l'ordre affiché ; l'en-tête reste « N° ».
3. Dans la fenêtre Boucle, choisir un tri (Désignation A → Z) et un filtre : les numéros suivent l'ordre trié et restent sans trou après le filtre.
4. Export en lot (ZIP des lignes) : chaque facture repart de 1 ; une facture sans ligne ne garde que l'en-tête.
5. Poser la puce hors de toute ligne répétée : elle écrit 1.
6. Dans l'Objet de l'e-mail (`#`, onglet Puces) : « N° de ligne » n'est pas proposée.

---

## 22. Boucle dans une boucle (une Boucle posée dans une zone déjà répétée)

**Couverture automatisée** : groupe `varLoop` (quatorze cas `loop_nested_*` : huit du moteur - la liste des détails de chaque ligne et d'elle seule, une zone intérieure placée avant sa zone extérieure, ligne en ligne / paragraphe /
sous-tableau dans la case de chaque ligne, filtre, tri, texte de repli et numéros qui repartent à chaque ligne, trois niveaux, colonne Liste de références, boucle de la page posée dans une zone, source perdue - et six de l'éditeur : icône de
la barre, fenêtre qui nomme les lignes de la zone et son aperçu, choix de la colonne quand plusieurs mènent à la zone, zones que personne ne répète encore, liste « # » et insertion sans clé, condition sans clé), groupes `varColumn`, `varCalc` et
`schemaRenames` (un cas chacun pour les deux premiers, six variantes d'un cas pour le troisième), `loopRulesUnit` (44 vérifications du moteur pur) et le script Node `varToolbarMouse` (section « 4 bis » : vraie souris, 700×400, français et anglais).
**Non couvert** : un vrai Word ou un PDF ouverts hors du navigateur, un document Grist réel (le laboratoire grist-static n'a pas été rejoué pour ce point), plus de douze niveaux de zones.

### Protocole
1. Dans un document Grist : une table Factures (celle du widget), une table Lignes (colonnes Facture - Référence vers Factures -, Désignation) liée à la page par « Tables liées » (clé Facture), et une table Détails (colonnes
   Ligne - Référence vers Lignes -, Libellé). Détails n'a AUCUNE règle de liaison à poser.
2. Dans un modèle : un tableau « Désignation | Détails » dont la deuxième ligne contient `#Lignes.Désignation` dans la première case et, dans la seconde, un élément de liste `#Détails.Libellé`. Poser la Boucle sur Désignation
   (« La ligne du tableau »). Cliquer la bulle Libellé : l'icône Boucle est active (elle ne l'est pas sur une variable qui n'a aucune colonne Référence vers Lignes ; son infobulle dit alors pourquoi).
3. Boucle de Libellé : la fenêtre dit « Lignes de « Détails » rattachées à chaque ligne de « Lignes » par Ligne », sans « Modifier le lien », propose « L'élément de liste » (choisi d'office) et montre un exemple pris sur
   la première ligne qui a des détails. Enregistrer.
4. Lecture, PDF, Word et e-mail : chaque ligne du tableau montre ses propres détails dans sa seconde case, jamais ceux d'une autre ligne ; une ligne sans détails n'affiche aucun élément (ou le texte de repli réglé dans la fenêtre).
5. Poser aussi la puce « N° de ligne » (`#`, onglet Puces) dans la liste des détails : elle repart de 1 à chaque ligne du tableau. Régler un tri et un filtre sur la boucle intérieure : les numéros suivent.
6. Ajouter dans Détails une seconde colonne Référence vers Lignes (« Remplaçant ») : la fenêtre de Libellé propose alors la liste avec recherche des deux colonnes ; choisir l'autre change l'exemple, et le choix est gardé au réaffichage.
7. Poser une autre variable de Lignes (`#Lignes.Prix`) dans la même zone : sa Boucle est grisée, l'infobulle dit « Déjà dans une zone répétée pour « Lignes » » ; une zone n'a qu'une Boucle : dans la fenêtre de Libellé, « La ligne du tableau »
   n'est pas proposée (la ligne est déjà répétée par la bulle Désignation), « L'élément de liste » et « La variable, dans la phrase » le sont.
8. Dans la zone, taper `#` : les colonnes de Lignes et de Détails s'insèrent sans fenêtre de clé de correspondance ; « Colonne… » sur une bulle cassée de la zone accepte une colonne de Détails sans la demander non plus ; la condition d'une
   bulle de la liste des détails qui compare une colonne de Lignes (la zone qui l'entoure) n'en demande pas non plus.
9. Renommer la colonne « Ligne » de Détails dans Grist, rouvrir le widget : le modèle suit (la boucle intérieure garde sa colonne), de même pour le renommage de la table Lignes.
10. Panneau de 700 × 400 : la fenêtre, la liste des colonnes et l'infobulle de l'icône grisée tiennent dans le panneau, en clair, en sombre et en anglais.

---

## 23. PDF protégé (type d'export, mot de passe, autorisations)

**Couverture automatisée** : groupe `pdfProtection` (`scenarios-pdf-protection.js`, 15 cas : le module et ses trois façons de donner le mot de passe, le moteur, le fichier chiffré relu par pdf.js, le menu et ses grisés, le bouton Exporter,
l'archive ZIP, la fenêtre, le mot de passe de chaque ligne et le mot de passe commun écrit dans le document), `documentSettingsUnit` (la colonne et la ligne du mot de passe commun), un cas d'`exportChoices` (le type se retient par
personne et par modèle), `exportType` (quatre types) et le script Node `pdfProtectionMouse` (vraie souris et vraie frappe à 700×400, clair et sombre, français et anglais ; les fichiers téléchargés sont relus par poppler et pypdf :
refus sans mot de passe ou avec un mauvais, ouverture avec le bon, texte, autorisations, propriétés ; un PDF par ligne ouvert avec le mot de passe de sa ligne).
**Non couvert** : l'ouverture dans les visionneuses du quotidien (Adobe Acrobat, Aperçu de macOS, Edge, Chrome, un lecteur sur téléphone), qui n'appliquent pas toutes les autorisations de la même façon, et un document Grist réel
(en particulier les permissions avancées de Grist sur la colonne du mot de passe : la fenêtre en parle, seul un vrai document dit qui peut la lire).

### Protocole
1. Dans un document Grist, ouvrir un modèle, choisir « PDF protégé » dans « Type d'export » : la ligne est active, le bouton du type est allumé ; la qualité du PDF (Vectoriel, Léger) est montrée, « Impression navigateur »
   est grisée (survol : « Pas disponible en PDF protégé : l'impression par le navigateur ne chiffre pas le fichier. »). Dans le menu « Exporter », « Toutes les lignes de la vue en un seul PDF » et « Assemblage avant impression » sont
   grisées avec leur raison ; « Une seule ligne » et « Toutes les lignes de la vue (ZIP) » sont actives.
2. « Exporter » : la fenêtre « PDF protégé » s'ouvre avec trois façons de donner le mot de passe : « Saisi à chaque export (recommandé) » (cochée au départ), « Le même pour tous, enregistré dans le document » et « Un par ligne,
   lu dans une colonne ». Avec la première, le focus est dans « Mot de passe pour ouvrir le PDF » (masqué) ; « Imprimer » et « Copier le texte et les images » sont cochés, « Modifier ou annoter » ne l'est pas, « Exporter » est
   actif. Cocher « Modifier ou annoter » (tout est alors permis) sans mot de passe : « Exporter » se grise et la phrase « Rien n'est protégé : choisir un mot de passe ou retirer une autorisation. » le dit. Taper un mot de
   passe avec un accent (« Sésame2026 ») : « Exporter » se dégrise ; « Afficher le mot de passe » le montre. Échap : rien n'est téléchargé, l'état dit « Export annulé. ».
3. Taper le mot de passe, décocher « Copier le texte et les images », ouvrir « Propriétés du PDF (facultatif) » et saisir un auteur, un sujet et des mots-clés, puis « Exporter » : le PDF est téléchargé, l'état dit « PDF protégé
   généré. ». L'ouvrir dans Acrobat (ou Aperçu) : il demande le mot de passe, refuse un mauvais, s'ouvre avec le bon (accent compris) ; Fichier > Propriétés montre l'auteur, le sujet et les mots-clés ; la sélection de texte
   et la copie sont refusées ; l'impression reste permise. Le texte et la mise en page sont ceux du PDF ordinaire du même modèle.
4. Rouvrir la fenêtre : la façon choisie est retrouvée, le champ du mot de passe saisi est vide et masqué (il n'est gardé nulle part), « Imprimer » est coché, « Copier » décoché et l'auteur est celui de tout à l'heure
   (retenus par navigateur) ; le sujet et les mots-clés sont vides.
5. Champ du mot de passe vide, « Modifier ou annoter » décoché : « Exporter » est actif ; le PDF obtenu s'ouvre sans mot de passe, mais la visionneuse applique les droits (modifier, annoter ou remplir un formulaire
   refusés, selon l'application). Cocher les trois droits sans mot de passe grise « Exporter ».
6. « Le même pour tous, enregistré dans le document » : la fenêtre dit où le mot de passe s'écrit (« Enregistré dans la table « Publipostage_Modeles », colonne « MotDePassePdf » (« Mot de passe des PDF protégés »), ligne
   « Réglages du document ». ») et le risque (« Risque : ce mot de passe est écrit en clair dans le document. Toute personne qui l'ouvre peut le lire, sauf si des permissions avancées de Grist en réservent l'accès. »).
   Taper un mot de passe, « Exporter » : le PDF s'ouvre avec lui et pas sans. Dans Grist, la table « Publipostage_Modeles » a une colonne « Mot de passe des PDF protégés » et une seule ligne « Réglages du document » qui le
   porte (cette ligne n'est pas un modèle : la liste des modèles ne change pas). Rouvrir la fenêtre : la façon et le mot de passe (masqué) reviennent ; l'exporter sans y toucher ne réécrit rien. Le changer : la même ligne est
   mise à jour, jamais une seconde. Dans Grist, restreindre la colonne dans les permissions avancées à une personne : une autre personne qui ouvre la fenêtre ne voit pas le mot de passe (à vérifier sur un vrai document).
7. « Un par ligne, lu dans une colonne » : une liste avec recherche propose les colonnes de la table qui peuvent porter un mot de passe (texte, choix, nombre ; ni les dates ni les cases à cocher) ; la fenêtre prévient que les mots
   de passe sont écrits en clair dans la table et lisibles par toute personne qui ouvre le document, sauf permissions avancées de Grist ; « Exporter » reste grisé, avec la phrase « Choisir la colonne des mots de passe. »,
   tant qu'aucune colonne n'est choisie. Choisir la colonne : le PDF de la ligne affichée s'ouvre avec le mot de passe de SA cellule (espaces autour retirés) et pas avec celui d'une autre ligne. Sur une ligne dont la cellule
   est vide : rien n'est téléchargé et l'état dit « Pas de mot de passe pour cette ligne : la colonne « … » est vide. Aucun PDF n'a été généré. » ; le bouton Exporter se libère.
8. « Toutes les lignes de la vue (ZIP) » puis « Exporter » : la fenêtre commence par « N PDF protégés pour « Table », regroupés dans une archive ZIP avec le même mot de passe et les mêmes autorisations » (ou « …chacun avec le mot de passe
   de sa ligne… » pour « Un par ligne ») et son bouton se nomme « Générer » ; aucune autre confirmation ne suit. L'archive contient un PDF par ligne, chacun s'ouvre avec ce mot de passe (ou avec celui de sa ligne). Pour « Un par
   ligne » avec une cellule vide : une fenêtre « Un document n'a pas été généré » liste « Ligne n° 3 : la colonne « … » est vide : pas de mot de passe pour ce PDF », l'archive contient les autres PDF et l'état dit
   « N PDF protégés générés, 1 échec — archive ZIP téléchargée. ». Annuler : rien n'est généré.
9. Passer à « PDF », exporter : aucune fenêtre, un PDF ordinaire (sans mot de passe) ; revenir à « PDF protégé » : l'option de lignes et la qualité choisies avant sont retrouvées.
10. Panneau de 700 × 400, en clair, en sombre et en anglais (« Protected PDF », « Password to open the PDF », « Permissions for whoever opens the PDF ») : la fenêtre tient, titre et boutons visibles, les trois façons et le
    bloc de celle qui est choisie sans défiler (le mot de passe et les droits pour « saisi à chaque export » ; le champ, l'endroit et le risque pour « le même pour tous » ; la liste, l'aide et le risque pour « un par ligne ») ;
    le groupe des propriétés, ouvert, fait défiler le contenu seul. Fermer puis rouvrir la fenêtre : les propriétés sont repliées et le contenu est en haut, quelle que soit la façon de la fois d'avant.

---

## 24. Macro-modèle aux modèles portrait, paysage et Grille (« Selon chaque modèle »)

**Couverture automatisée** : groupe `mixedOrientation` (`scenarios-mixed-orientation.js`, 39 cas : le contrat des repères de sens, le PDF relu par pdf.js, le Word relu en XML, la Lecture, l'impression navigateur, l'assemblage par
l'application, le réglage de page et le menu), les cas `macro_following_each_model_*` et `macro_editor_offers_documents_and_grids_*` de `macroModeles`, le scénario 8 de `browserPrintPdf` (le vrai PDF d'impression de Chromium) et le
script Node `macroPageAutoMouse` (vraie souris et vrai clavier à 700×400, clair et sombre, français et anglais). Le format de la page, en plus de son sens (une présentation au milieu de pages A4), a son groupe `mixedFormat` et sa section 36.
**Non couvert** : un vrai Word (les cas lisent l'OOXML), Firefox et Safari (pages nommées de l'impression), les visionneuses de PDF du quotidien, un document Grist réel avec de vrais modèles.

### Protocole
1. Dans un document Grist, créer quatre modèles : une lettre en portrait, une annexe en paysage (bouton Page : « Paysage »), une page de fin en portrait et un modèle Grille aux colonnes larges (six colonnes de 200 px), en paysage.
   Créer un macro-modèle (« + », « Macro-modèle ») : la lettre en page de garde, puis trois annexes dont le modèle est, dans l'ordre, l'annexe paysage, la page de fin et la Grille (la liste propose les modèles Grille ; elle ne
   propose ni un email ni un autre macro-modèle). Enregistrer : le macro-modèle s'ouvre, le bouton Page n'est PAS allumé et son info-bulle dit « Page A4 selon chaque modèle (passer en paysage) ».
2. Survoler le bouton Page : le menu a, en tête, « Selon chaque modèle » (cochée), puis « Portrait » et « Paysage » (décochées), les formats, « Format libre… » et « Filigrane… ». Panneau de 700 × 400 : le menu tient en entier.
3. Lecture : quatre feuilles, portrait (la lettre), paysage (l'annexe), portrait (la page de fin), paysage (la Grille, entière dans sa page, sans colonne coupée) ; chaque modèle est sur la feuille de son sens ; avec un
   en-tête et un pied numérotés « n / total », les numéros continuent d'une feuille à l'autre ; aucun défilement horizontal dans le panneau.
4. « Exporter en PDF » : quatre pages, portrait, paysage, portrait, paysage (le lecteur PDF annonce 210 × 297 mm puis 297 × 210 mm), le texte de chaque modèle sur SA page, la Grille entière dans sa page paysage ; l'en-tête, le pied
   « n / total » et le filigrane sont à la taille de chaque page. « Exporter en un seul PDF » et « Toutes les lignes de la vue (ZIP) » donnent les mêmes pages, ligne après ligne.
5. « Exporter en DOCX » : dans Word, quatre sections (Mise en page > Orientation : portrait, paysage, portrait, paysage), la Grille dans sa page paysage ; le sommaire, s'il y en a un, compte toutes les sections.
6. Qualité « Impression navigateur » puis « Exporter » : l'aperçu avant impression montre quatre feuilles, chacune sur le papier de son sens (Chrome ou Edge).
7. Menu Page, « Paysage » : la ligne est cochée seule, le bouton s'allume ; la Lecture n'a plus qu'une feuille paysage avec les quatre modèles dessus, le PDF et le Word sont en paysage de bout en bout (comme avant ce réglage) ;
   « Selon chaque modèle » rend les quatre feuilles. Cliquer le bouton depuis « Selon chaque modèle » impose le paysage, le clic suivant le portrait ; « Selon chaque modèle » revient par le menu (Tab depuis le bouton arrive
   sur cette ligne, Entrée la choisit).
8. Recharger la page du document Grist : le macro-modèle a gardé son réglage (« Selon chaque modèle » cochée, ou le sens imposé choisi en dernier). Un macro-modèle fait avant ce réglage reste au sens imposé (« Portrait » ou « Paysage »
   cochée). Un modèle classique ou une Grille ouverts seuls : le menu n'a pas la ligne ; un email : le bouton reste grisé.
9. Réglages > Marges d'un macro-modèle « Selon chaque modèle » : les marges se bornent sur le côté court de la page (190 mm au plus en A4), la mention « Macro-modèle : ces marges priment… » est là ; changer le format (A5) garde
   « Selon chaque modèle ».
10. Panneau de 700 × 400, en sombre et en anglais (« Follow each template ») : le menu, la Lecture et les boutons tiennent, rien n'est coupé.

---

## 25. Lien « Créer l'email » ouvert dans Zimbra (Réglages > Email)

**Couverture automatisée** : groupe `emailZimbra` (`scenarios-email-zimbra.js`, 8 cas : les défauts de Zimbra rejoués sur un modèle de sa lecture du lien, le lien Standard identique à celui d'avant sur 4 512 combinaisons, le lien
Zimbra qui traverse tout le clavier AZERTY et QWERTY, les destinataires lus tels quels, un message réaliste qui garde ses lignes, les limites connues, le réglage propre au navigateur, l'onglet des Réglages), le script Node
`emailMouse` (phase Zimbra : vraie frappe et vrais clics à 700×400, lien relu par le modèle, jauge) et `settingsWindowMouse` (l'onglet Email, clair et sombre, français et anglais, le choix gardé après rechargement).
**Non couvert** : un vrai client web de Zimbra (le modèle de sa lecture a été comparé, hors du dépôt, au code de cinq versions du client sans écart), les autres logiciels de messagerie (Outlook, Thunderbird, Apple Mail) et un
document Grist réel.

### Protocole
1. Dans un document Grist, ouvrir un modèle email (objet « Facture & Tom + 1 ? <ok> », un corps de deux lignes, une adresse en « À », une autre en « Cc » comme « prenom+tag@exemple.fr »). Réglages > Email : deux choix,
   « Standard » (coché) et « Zimbra », une note sous le second ; l'onglet tient avec les huit autres sur une seule ligne.
2. Réglage « Standard », le navigateur ouvrant les liens `mailto:` dans Zimbra : « Créer l'email » ouvre un brouillon où l'objet est abîmé (« & » écrit `&amp;`, « + » devenu une espace, objet coupé au « ? ») : c'est le défaut
   connu de Zimbra, le comportement attendu en Standard. Avec Thunderbird, Outlook ou Apple Mail, le même lien donne l'objet et le corps exacts.
3. Réglages > Email > « Zimbra », puis « Créer l'email » : l'objet du brouillon est « Facture ＆ Tom ＋ 1 ? ＜ok＞ » (les quatre signes en formes larges, le « ? » resté, rien de coupé, aucun `&amp;`), la même chose dans le corps, les
   lignes du message sont celles de l'éditeur, « À » et « Cc » sont exacts (le « + » de l'adresse est resté).
4. Un message long plein de « & » et de « + » : la jauge de longueur monte plus vite qu'en Standard (6 caractères de lien de plus par signe) et avertit comme avant ; le bouton reste actif.
5. Recharger la page du document Grist : « Zimbra » est encore coché. Dans un autre navigateur, ou une fenêtre privée : « Standard » (le choix est propre au navigateur, il n'est pas dans le document).
6. Panneau de 700 × 400, en sombre et en anglais (« Mail program », « Standard », « Zimbra ») : l'onglet « Email », ses deux choix et la note tiennent sans défilement horizontal, la note se lit en entier et « Fermer » reste visible.

---

## 26. Modèle quitté puis rouvert aussitôt après un enregistrement automatique

**Couverture automatisée** : groupe `autosaveRace` (`scenarios-autosave-race.js`), les quatre cas `race_a_template_left_and_reopened_right_after_an_autosave…` (la frappe retrouvée puis gardée par la suivante),
`race_a_page_change_is_not_lost_when_the_template_is_left_and_reopened…` (le sens de la page), `race_a_read_started_before_a_write_never_puts_the_older_state_back_in_the_cache` (une lecture des modèles partie avant
l'écriture et revenue après) et `race_the_cache_entry_a_save_leaves_is_the_one_a_fresh_read_of_the_row_gives` (le cache égal à la relecture de la ligne, document et macro-modèle).
**Non couvert** : un vrai Grist lent (les cas simulent sa latence), plusieurs personnes sur le même modèle en même temps.

### Protocole
1. Dans un document Grist, deux modèles enregistrés, A et B. Ouvrir A, taper « un » à la fin du texte, attendre que le coin d'état dise « Enregistré à… » (moins de trois secondes), ouvrir B dans la liste puis revenir aussitôt
   sur A : le texte « un » est là.
2. Taper « deux » dans A, attendre l'enregistrement, regarder la ligne de A dans la table des modèles du document Grist (Publipostage_Modeles, colonne Contenu) : elle porte « un » ET « deux » ; aucun bandeau « Ce modèle a été
   modifié ailleurs ».
3. Même geste avec le bouton Page (Paysage), puis avec l'en-tête ou le pied de page, puis avec le nom du fichier PDF : le modèle quitté puis rouvert aussitôt montre ce qui vient d'être changé, pas son état d'avant.
4. Un vrai conflit reste signalé : A ouvert, quelqu'un d'autre (ou une autre fenêtre) enregistre A ; à la lecture suivante le bandeau « Ce modèle a été modifié ailleurs » apparaît et rien n'est écrasé.

---

## 27. Étiquettes « Grille » et « Paysage » dans le résumé d'un macro-modèle

**Couverture automatisée** : le cas `macro_summary_tags_grid_and_landscape_models_next_to_their_name` du groupe `macroModeles` (les étiquettes de cinq modèles, leur ordre et leur place, les trois états du menu Page, un modèle
masqué, l'anglais, un macro-modèle d'avant « Selon chaque modèle », les listes de la fenêtre de composition) et le script Node `macroPageAutoMouse` (vraie souris à 700×400 en clair et en sombre, puis un nom très long à 700 px et à
360 px : place, coupe du nom, contraste, rien ne recouvre le stylo ni l'œil).
**Non couvert** : un document Grist réel avec de vrais modèles, une police du système très différente de celle du test.

### Protocole
1. Dans un document Grist, créer quatre modèles : une lettre en portrait, une annexe en paysage (bouton Page : « Paysage »), un modèle Grille en portrait et un modèle Grille en paysage. Créer un macro-modèle (« + », « Macro-modèle ») :
   la lettre en page de garde, puis une annexe dont les règles et le modèle par défaut sont les trois autres. Enregistrer : le macro-modèle s'ouvre, le menu Page est sur « Selon chaque modèle ».
2. Résumé du macro-modèle, à droite du nom de chaque modèle et avant son stylo : rien pour la lettre ; « Paysage » pour l'annexe en paysage ; « Grille » pour la Grille en portrait ; « Grille » puis « Paysage » pour la Grille en paysage.
   Les étiquettes sont lisibles (texte discret, liseré) et entières ; un nom très long se coupe par « … » (info-bulle : le nom entier), jamais les étiquettes.
3. Menu Page, « Portrait » puis « Paysage » (sens imposé) : « Paysage » disparaît du résumé tout de suite, « Grille » reste ; « Selon chaque modèle » les rétablit.
4. Masquer un modèle par son œil : il se grise et garde ses étiquettes. Passer en anglais : « Landscape », « Grid ». Thème sombre : les étiquettes restent lisibles.
5. Panneau de 700 × 400, puis très étroit (360 px) : rien ne déborde, le stylo et l'œil de chaque ligne restent atteignables (la pastille de zoom, en bas à droite, ne recouvre pas la dernière ligne défilée au bout).
6. « Modifier la composition » : les listes de modèles n'ont aucune étiquette. Un macro-modèle fait avant « Selon chaque modèle » (sens imposé) n'écrit « Paysage » nulle part.

---

## 28. Boucle sur toutes les lignes d'une table (le tableau « Clients », la vue Grist et son filtre)

**Couverture automatisée** : les onze cas `loop_all_*` du groupe `varLoop` (le moteur : lignes de la vue ou de toute la table, ordre, identifiant inconnu ou répété, vue refusée par Grist, une seule lecture de la vue par rendu ; la
fenêtre : source « Rattachées » / « Toutes », « Comme la vue Grist » / « Toute la table », aperçu, mille lignes, tri et filtre repartis à zéro quand la table change, bulle sur une colonne « Remplacer » ; les variables d'une autre table
qui suivent la ligne de chaque tour ; la Lecture qui se redessine quand Grist dit que la vue a changé), les vérifications « toutes les lignes » de `loopRulesUnit`, le cas `loop_window_says_the_other_variables_of_the_row_do_not_follow_a_cell_loop` (la note « dans sa cellule »), les cinq cas `loop_table_bar_repeat_row_*` (le bouton « Répéter la ligne » de la barre du tableau : la bulle choisie, la fenêtre sur « La ligne du tableau », le bouton allumé, les raisons du grisé, une grille, le verrou d'un tableau lié), les sections « 4 ter », « 4 quater » et « 4 quinquies » de `varToolbarMouse` (vraie souris à 700×400) et
l'essai `lab-loop-all-rows-feature.mjs` dans un VRAI Grist (grist-static : fenêtre, Lecture, filtre de Grist posé et retiré, PDF).
**Non couvert** : une très grande table (plusieurs milliers de lignes : lenteur de la Lecture), un filtre posé sur un lien « Sélectionner par » entre deux blocs d'une même page, un Grist hébergé (délais de `fetchSelectedTable`).

### Protocole
1. Dans un document Grist, une table « Clients » (Nom, Ville) de huit lignes, affichée en tableau, et le widget ajouté sur la même table. Dans un modèle : un tableau d'en-tête « Nom | Ville » et d'une ligne vide ; taper `#Nom` dans la
   première case et `#Ville` dans la seconde. Lecture : une seule ligne (celle du curseur).
2. Édition : cliquer la bulle Nom, l'icône Boucle de sa barre est active (elle était grisée). La fenêtre « Boucle sur « Clients » » : « Lignes de « Clients » : Comme la vue Grist (son filtre et son tri) », « La ligne du tableau » choisi,
   aperçu « Vue Grist de « Clients » : 8 lignes sur 8… », pas de choix de source. Enregistrer.
3. Lecture : l'en-tête et huit lignes, Nom et Ville côte à côte à chaque ligne, dans l'ordre du tableau de Grist. Le PDF de la ligne affichée écrit les mêmes huit lignes.
4. Dans Grist, poser sur le bloc du widget (icône Trier/Filtrer) le filtre Ville = Lyon, sans l'enregistrer : la Lecture se redessine seule (sans clic), les lignes de Lyon seulement ; le PDF aussi. « Revert » rend les huit lignes. Un tri
   posé de la même façon (Nom, décroissant) se retrouve dans l'ordre de la Lecture. Un filtre posé sur l'AUTRE tableau de la page ne change rien : le widget ne voit que les lignes de son bloc.
5. Rouvrir la fenêtre, choisir « Toute la table (sans le filtre de Grist) » : l'aperçu dit « Toute la table de « Clients » : 8 lignes » et l'ordre devient celui de la table ; avec un filtre posé dans Grist, la Lecture garde les huit lignes.
6. Une table liée : un modèle de factures avec un tableau « Numéro | Désignation » (`#Factures.Numéro`, `#Lignes.Désignation`, Lignes liée à Factures). Boucle sur Numéro, « Toutes les lignes de la table » : à chaque tour, les lignes de CETTE facture
   dans la deuxième colonne (pas celles de la facture du curseur) ; une facture sans ligne a une case vide.
7. Dans une facture répétée, poser `#Lignes.Désignation` avec sa propre Boucle « Rattachées à la ligne » : pour chaque facture ses lignes (une boucle dans une boucle). Le choix « Toutes les lignes » n'est pas proposé dans une zone déjà répétée.
8. Fenêtre de 700 × 400 : « Comme la vue Grist (son filtre et son tri) » tient en entier, la fenêtre se défile, Enregistrer et Annuler restent visibles. Table de plus de mille lignes : l'aperçu dit que la Lecture peut devenir lente.
9. Changer de colonne par « Colonne… » sur la bulle de la boucle : la boucle reste tant que la colonne est de la même table, elle est retirée pour une colonne d'une autre table.
10. Dans le tableau « Nom | Ville » (deux variables dans la ligne), rouvrir la fenêtre de la bulle Nom et choisir « La variable, dans sa cellule » : sous le choix, « 1 autre variable de la ligne ne suivra pas la boucle : seule cette cellule est répétée.
    Pour répéter toute la ligne, choisissez « La ligne du tableau ». » ; un clic sur « La ligne du tableau » retire la note. Avec trois variables dans la ligne : « 2 autres variables… ne suivront pas… ». Une variable seule dans sa ligne, ou dans une phrase : pas de note.
11. « Répéter la ligne » : dans le tableau « Nom | Ville », cliquer dans une case de la ligne. La barre du tableau porte, tout à droite après un séparateur, le bouton « Répéter la ligne » (icône Boucle), libre. Un clic ouvre la fenêtre de
    la Boucle sur « La ligne du tableau », sans passer par la bulle ; Enregistrer : la ligne est répétée pour toutes les lignes (Lecture : une ligne par ligne de la table, Nom et Ville côte à côte). Le bouton est alors allumé depuis n'importe quelle
    case de la ligne ; un second clic rouvre la fenêtre, avec « Retirer la boucle ». Une ligne sans variable : le bouton est grisé (jamais retiré), sa raison en info-bulle ; plusieurs lignes sélectionnées, ou une case fusionnée sur plusieurs lignes
    qui traverse la ligne : grisé aussi, avec sa raison. Un tableau lié à un modèle Grille, tant que le suivi des modifications ou l'écriture en direct est allumé : grisé, un clic n'ouvre rien. Dans une grille : le bouton est là et se comporte de même.

---

## 29. Colonne « Date et heure » (format de date et liste « Heure ») et puce « Heure actuelle »

**Couverture automatisée** : les treize cas `vardt_*` du groupe `varDateTime` (`dev-tests/scenarios-var-datetime.js` : la date sans réglage, les sept formats au jour du fuseau de la colonne, l'heure à 24 et à 12 heures, la liste « Heure » en français et
en anglais (page qui démarre en anglais), rien hors d'une colonne « Date et heure », la Lecture, le calcul refusé, les assistants de type, la barre), le cas `ft_var_bar_state_per_kind_of_bubble` de `floatingToolbars` (la liste « Heure » n'est montrée que pour cette colonne),
le cas `xlsx_a_date_and_time_cell_is_a_real_date_at_the_day_and_hour_of_the_column_zone`, la section « Date et heure » de `varToolbarMouse` (vraie souris à 700×400), pour la puce « Heure actuelle » les quatre cas `chip_time_*` du groupe `chips` (dont un en page anglaise), le cas `fieldeditor_the_time_chip_of_a_field_has_its_own_bar_and_writes_the_chosen_clock` de `fieldEditor`, la section « Puce Heure actuelle » de `varToolbarMouse` et le parcours de l'Objet d'un email de `fieldEditorMouse`, et l'essai `lab-datetime-format.mjs` dans un VRAI Grist (grist-static :
le type `DateTime:Europe/Paris`, la barre, la Lecture, le PDF et le Word téléchargés).
**Non couvert** : un Grist hébergé dont le fuseau de l'appareil diffère de celui de la colonne (le widget lit le fuseau de la COLONNE, jamais celui de l'appareil), et l'ouverture du .xlsx dans un vrai Excel français (le format « h:mm AM/PM » est celui du fichier ; Excel y écrit AM / PM d'après les réglages de la machine).

### Protocole
1. Une table avec une colonne « Date et heure » (fuseau Europe/Paris) : une ligne au 12/09/2026 à 23:30, une autre au 13/09/2026 à 00:30. Un modèle avec la bulle de cette colonne, sans réglage. Lecture : « 12/09/2026 » et « 13/09/2026 »
   (le jour que Grist montre dans la cellule), jamais « 2026-09-12T21:30:00.000Z » ; le PDF, le Word, le nom du fichier et l'objet d'un courriel écrivent la même date.
2. Cliquer la bulle : la barre montre J M A, la liste du format de date, la liste « Heure » (Sans heure, 23:30, 23 h 30, 11:30 PM, 11:30pm) et « Lettres ». Sur la bulle d'une colonne Date : tout cela sauf la liste « Heure ».
3. Choisir « 12 septembre 2026 » : la ligne du 13/09 à 00:30 écrit « 13 septembre 2026 » (le jour de Paris, pas celui de l'UTC).
4. Choisir « 23 h 30 » : « 12 septembre 2026 à 23 h 30 » et « 13 septembre 2026 à 00 h 30 » ; avec le format « 12/09/2026 » et « 23:30 » : « 12/09/2026 23:30 ». « Lettres » : la date passe en lettres, l'heure reste en chiffres. « Sans heure » :
   retour à la date seule (la bulle garde son réglage de date). Choisir « 11:30 PM » (à 12 heures, quelle que soit la langue de l'interface) : « 12/09/2026 11:30 PM » et, pour la ligne du 13/09 à 00:30, « 13/09/2026 12:30 AM » (minuit passé) ;
   un rendez-vous à midi s'écrit « 12:00 PM ». Choisir « 11:30pm » (am / pm en minuscules collés aux minutes, l'écriture de départ de Grist) : « 12/09/2026 11:30pm », « 13/09/2026 12:30am » et « 12:00pm » à midi. Interface en anglais : la liste n'a que « No time », « 23:30 », « 11:30 PM » et « 11:30pm » (« 23 h 30 » y écrirait « 11:30 PM », la liste ne le montre pas deux fois ; un modèle réglé en « 23 h 30 » montre « 11:30 PM »),
   « 09/12/2026, 23:30 », « 09/12/2026, 11:30 PM », « September 12, 2026 at 11:30 PM ».
5. Un modèle enregistré avant ce réglage, avec un format de date posé à la main sur une colonne « Date et heure » : la ligne du 13/09 à 00:30 écrit maintenant « 13 septembre 2026 » (elle écrivait le 12 : le jour se lisait en UTC), sans heure.
6. Excel de toutes les lignes (ZIP ou classeur unique) d'une grille dont une case ne contient que cette bulle : une vraie date (la case se trie et se calcule), avec l'heure quand la bulle l'écrit ; avec « Lettres », du texte.
   L'Excel de la seule ligne affichée écrit la même vraie date. Avec « 11:30 PM », le format de la case est « h:mm AM/PM » (« dd/mm/yyyy h:mm AM/PM » en français, « mm/dd/yyyy, h:mm AM/PM » en anglais) ; avec « 11:30pm », « h:mmam/pm » (« dd/mm/yyyy h:mmam/pm », « mm/dd/yyyy, h:mmam/pm »).
7. La puce « Heure actuelle » (panneau « # », onglet Puces) posée dans le corps d'un modèle, puis dans l'Objet d'un email : sans réglage elle écrit l'heure de l'appareil sur 24 heures (« 23:30 »), comme avant. Un clic sur la puce ouvre sa barre
   (une seule liste, « Heure » : 23:30, 23 h 30, 11:30 PM, 11:30pm - jamais « Sans heure », jamais la barre d'une bulle) ; la puce « Date du jour » n'a pas de barre. Choisir « 11:30 PM » : la Lecture, le PDF, le Word, « Créer l'email » et le nom du fichier écrivent « 11:30 PM »
   (le nom du fichier « 11_30 PM »), « 11:30pm » : « 11:30pm » ; la barre reste ouverte sur le choix et le rouvre au clic suivant ; « 23:30 » remet l'heure sur 24 heures (le réglage est retiré du modèle). Un seul Annuler rend le réglage d'avant. Enregistrer, repartir d'un modèle vide, rouvrir :
   la puce garde son réglage. Interface en anglais : la liste n'a que « 23:30 », « 11:30 PM » et « 11:30pm ».

## 30. Menus d'Enregistrer, de « + », de « Mode lecture » et de « Type d'export » : un clic de souris les referme, la souris sortie puis revenue les rouvre

**Couverture automatisée** : le cas `toolbar_a_mouse_click_on_the_save_button_closes_its_menu_until_the_mouse_leaves_the_group` du groupe `toolbarChrome` (la marque `data-close-on-click` sur Enregistrer, « + », « Mode lecture » et « Type d'export », et sur eux seuls, la classe `v2-hover-closed`, `aria-expanded`, la sortie qui libère, le focus clavier qui rouvre, le clavier, le doigt et le stylet qui ne referment rien, une ligne du menu, un groupe non marqué), les sections « 1b » (Enregistrer) et « 1c » (« Mode lecture », « Type d'export », « + ») de `menuClickMouse` (vraie souris à 700×400 : le clic referme le menu, la souris menée tout droit sur la dernière ligne qu'il recouvrait atteint l'éditeur, sans toucher « Enregistrement automatique » ni « Historique des versions… » pour Enregistrer, la sortie puis le retour rouvrent, le focus clavier rouvre ; l'étape 1 vérifie aussi que « Titre », non marqué, garde son menu ouvert après un clic) et, dans `fieldEditorMouse` (section 11, l'Objet d'un email enregistré), le contrôle « Enregistrer puis « À » aussitôt » (le clic va dans « À », aucune fenêtre des versions ne s'ouvre).
**Non couvert** : un vrai écran tactile (le doigt n'est essayé que par un clic de type « touch »), Safari et Firefox (les essais tournent dans Chromium).

### Protocole
1. Panneau Grist d'environ 700×400, un modèle email (À, Cc, Objet visibles) : passer la souris sur la disquette (Enregistrer) : le menu s'ouvre (« Enregistrer sous… », « Historique des versions… », « Enregistrement automatique ») et recouvre « À » et la fin d'« Objet ».
2. Cliquer la disquette : le modèle s'enregistre (« Enregistré à … ») et le menu se referme aussitôt, la souris restant sur le bouton ; il ne se rouvre pas tout seul.
3. Mener la souris tout droit sur « À » et cliquer : le curseur est dans « À » ; aucune fenêtre « Historique des versions » ne s'ouvre et « Enregistrement automatique » reste coché.
4. Revenir sur la disquette : le menu s'ouvre comme avant, et un clic sur « Enregistrer sous… » ou sur « Historique des versions… » ouvre toujours sa fenêtre.
5. Au clavier (Tab jusqu'à la disquette) : le menu s'ouvre ; Entrée ou Espace enregistre et le laisse ouvert, comme avant. Cliquer d'abord la disquette, puis, la souris restant dessus, la rejoindre au clavier (Maj+Tab depuis « Supprimer ») : le menu se rouvre.
6. « + », « Mode lecture » et « Type d'export », même geste : passer la souris sur le bouton, le menu s'ouvre ; un clic le referme aussitôt, la souris restant sur le bouton (« + » crée un document neuf, « Mode lecture » passe en lecture - un deuxième clic revient à l'édition -, « Type d'export » ne change rien de plus) ; mener la souris tout droit sur le texte que le menu recouvrait : il ne se rouvre pas et le clic suivant va dans le texte ; sortir du bouton puis y revenir rouvre le menu comme avant ; au clavier (Tab), il s'ouvre et reste ouvert comme avant.
7. Les autres boutons à menu (« Exporter », « Titre », l'alignement, les listes) : après un clic, leur menu reste ouvert tant que la souris est dessus, comme avant.

## 31. Barre d'outils sous la barre de Grist Factory Suite, à n'importe quel bord : un vide, rien de caché, une ligne de plus tout au plus

**Couverture automatisée** : le script Node `gfsBarToolbar` (80 vérifications, GFS simulé dans un cadre isolé, une pastille posée par la page parente tient la place de la barre) : à 700×400 la zone de la barre posée en haut est libre - aucun bouton de la première ligne dans la zone, aucun sous la barre elle-même -, rien de caché ni de coupé, l'ordre du document gardé, ce qui est à gauche de la zone n'a pas bougé, un seul élément décalé, pas de ligne de plus ni de bande ; à la vraie souris, un balayage de la première ligne n'arrive jamais sur la pastille là où se trouve un bouton, le survol d'Enregistrer ouvre son menu et un clic sur Mode lecture puis Mode édition passent par les boutons décalés. La barre à gauche à 700×400 : « Surligner » (que la barre recouvrait de 9 px) saute à son bord droit, seul de toutes les rangées, avec ce qui le suit sur sa ligne ; un balayage à la vraie souris de toute la barre ne rencontre aucun bouton (et le même balayage, le décalage ôté à la main, rencontre « Surligner »), un clic sur la flèche de « Surligner » l'ouvre sans toucher la barre, Gras et Italique qui disparaissent font remonter « Surligner » (plus de décalage). La barre qui part, passe à droite ou en bas (à 700×400, aucun bouton n'y est dessous : rien ne bouge) ou est masquée (`GfsBar.hide`) rend les trois rangées d'avant au pixel près ; Tables liées qui disparaît puis revient ; le cadre à 900×500, 560×300 (le sélecteur du modèle se raccourcit), 1100×600 ; un séparateur resté seul au bord d'une ligne a son trait caché, de 400 à 800 px de large, avec la barre et sans, sans que rien ne bouge, dans la rangée du modèle comme dans celle de mise en forme (de 380 à 900 px de large, sans barre et aux quatre bords ; à 800 px sa deuxième ligne commence par un trait seul, à 600 px un trait finit chacune de ses deux premières lignes). Douze tailles de cadre (de 1100×600 à 400×230) aux quatre bords : aucun bouton des trois rangées sous la barre, rien de caché ni de coupé, l'ordre de lecture gardé dans chaque rangée, au plus une ligne de plus par rangée, rien ne bouge là où la barre ne recouvre rien, un second calcul ne change rien, la barre partie tout revient, d'un bord à l'autre sans passer par « plus de barre » et le cadre qui change de taille sous la barre donnent le même résultat, et sept balayages à la vraie souris sans bouton sous la barre. GFS d'avant la consigne et page seule ; anglais sombre en haut et à gauche. Avec `gfsBar` (hors des rangées de la barre d'outils, rien ne bouge) et la section 23d de `codeHygiene`.
**Non couvert** : Firefox (le navigateur de la personne ; les essais tournent dans Chromium, seul navigateur de ce poste : la ligne qui passe à la suivante et les marges se mesurent pareil, mais le résultat n'y a pas été vu), la vraie barre de GFS (ici une pastille de même rectangle), les menus et les fenêtres sous la barre (suite de la consigne 025), un cadre de moins de 380 px de large avec la barre en haut (le titre du modèle ne se raccourcit pas sous 120 px : il reste en partie sous la barre).

### Protocole
Dans Firefox, le widget hébergé par GFS (ou le GFS simulé), panneau d'environ 700×400 :
1. Placer la barre de boutons de GFS en haut du cadre : au milieu de la première ligne de la barre d'outils, un vide de la largeur de la barre (environ 132 px) s'ouvre. Enregistrer, Supprimer, Tables liées, puis Mode édition et Mode lecture sont à droite de la barre, dans le même ordre ; le titre du modèle et « + » à gauche n'ont pas bougé.
2. Passer la souris, puis cliquer, sur chacun de ces boutons (Enregistrer : son menu s'ouvre sous le bouton ; Mode lecture, puis Mode édition) : aucun n'est caché par la barre, aucun clic ne tombe sur elle.
3. La barre d'outils a la hauteur qu'elle avait sans la barre de GFS, aucun bouton n'a disparu (dans un panneau plus large, une ligne de plus est permise).
4. Retirer la barre (l'explorateur de GFS) : la première ligne redevient telle qu'avant ; la remettre en haut : le vide revient. Masquer la barre (« Présenter » d'une présentation) : le vide disparaît, et revient avec elle.
5. Réduire le panneau à environ 560×300 avec la barre en haut : le sélecteur du modèle se raccourcit (son nom est coupé par « … ») et finit avant la barre ; rien n'est caché.
6. La page seule (adresse sans `gfs=`), ou une version de Grist Factory Suite d'avant la consigne (aucune barre dans le contexte) : aucun décalage.
7. Le trait d'un séparateur resté seul : avec la barre en haut à 700×400, « Page | Type d'export » se coupe au bord de la ligne - la deuxième ligne ne commence pas par un petit trait pâle, et le séparateur resté entre deux boutons de la première ligne se voit. Même chose en élargissant ou en réduisant le panneau de 400 à 800 px (le trait peut se retrouver seul au début d'une ligne, vers 700 px, ou au bout de la première, vers 550 et 720 px) : aucun trait pâle ne reste seul au bord d'une ligne, et le séparateur caché ne fait bouger aucun bouton.
8. La barre à gauche (panneau d'environ 700×400) : « Surligner » (le début de la dernière ligne de mise en forme) n'est plus sous la barre, il commence à son bord droit, les boutons qui le suivent sur sa ligne l'ont suivi, la barre d'outils garde sa hauteur. Passer la souris puis cliquer sur la flèche de « Surligner » : la palette s'ouvre, aucun clic ne tombe sur la barre. Remonter et descendre la souris le long de la barre : elle ne recouvre aucun bouton. Retirer la barre : « Surligner » revient où il était.
9. Les petits panneaux (réduire le panneau à environ 400×300, puis 600×230, puis 400×230) : la barre à droite - Réglages, au bout de la première ligne, recule devant elle, et les boutons de mise en forme qu'elle recouvrirait passent à la ligne suivante avec ceux qui les suivent -, la barre à gauche - les boutons du début de chaque ligne à la hauteur de la barre commencent à son bord droit -, la barre en bas dans le panneau le plus court - les boutons de la dernière ligne qu'elle recouvrirait sautent à son bord droit. Dans tous les cas : aucun bouton sous la barre, aucun n'a disparu, l'ordre de lecture est gardé, au plus une ligne de plus par rangée ; passer d'un bord à l'autre donne à chaque fois la même mise en page que depuis une page sans barre.
10. Le trait seul de la ligne de mise en forme (choix du porteur, 22/10, « Le cacher quand il est seul ») : réduire ou élargir le panneau, sans barre puis avec la barre à chaque bord. Vers 800 px de large, la deuxième ligne de mise en forme (celle qui commence par les colonnes, l'image et le saut de page) ne commence pas par un petit trait pâle ; vers 600 px, aucune des deux premières lignes ne finit par un petit trait pâle ; à 700 px il n'y a rien de tel. Les traits qui séparent deux boutons d'une même ligne se voient toujours, et aucun bouton ne bouge quand un trait se cache.

## 32. Présentations sous la barre de Grist Factory Suite : la bande, le volet « Importer », le ▶ et la pastille du zoom lui laissent sa place, « Présenter » la masque

**Couverture automatisée** : le script Node `slidesGfsBar` (75 vérifications, GFS simulé dans un cadre isolé, une pastille posée par la page parente tient la place de la barre) : barre à gauche, la bande s'élargit d'une gouttière et rien ne passe sous la zone, à la vraie souris ; aux autres bords la bande est comme sans barre ; barre à droite, le volet « Importer » de même ; la pastille du zoom et le ▶ montent ou reculent quand leur place ouverte toucherait la zone (460×300 barre en bas, 700×180 barre à droite) ; « Présenter » (▶, F5, Maj+F5) masque la barre et chaque sortie (Échap, « Quitter », la fin) la rend ; un GFS d'avant la consigne ne change rien.
**Non couvert** : Firefox (le navigateur de la personne ; les essais tournent dans Chromium), la vraie barre de GFS (ici une pastille de même rectangle : la vraie se masque et se remontre par `barre.masquer`), le plein écran du navigateur (le cadre de GFS le refuse).

### Protocole
Dans Firefox, le widget hébergé par GFS, une présentation de trois diapositives ou plus, panneau d'environ 700×400, barre de GFS à gauche (le choix de départ) :
1. La bande des diapositives n'a plus la barre de GFS par-dessus ses miniatures : la barre est dans une gouttière à gauche de la bande, les miniatures, leurs numéros et « Ajouter » / « Importer » sont à droite d'elle. La page est un peu plus étroite qu'avec la barre à un autre bord.
2. Passer la souris sur les miniatures, cliquer l'une d'elles : on arrive à sa diapositive, aucun clic ne tombe sur la barre.
3. Déplacer la barre en haut, à droite, en bas : la bande reprend sa place d'origine et la page sa largeur ; la remettre à gauche : la gouttière revient.
4. Barre à droite, « Importer » : le volet s'ouvre, la barre est dans une gouttière à droite du volet, rien du volet (titre, « Fermer », choix de la source, miniatures) n'est dessous ; la pastille du zoom est à gauche du volet. « Fermer » rend la place.
5. Réduire le panneau à environ 460×300 avec la barre en bas : survoler la pastille du zoom (le pourcentage, coin bas droit) : « − », « + » et « Ajuster » s'ouvrent à sa gauche ; ni la pastille ouverte ni le ▶ ne passent sous la barre (ils sont montés d'une barre). Agrandir le panneau : ils redescendent.
6. Cliquer ▶ (ou F5, Maj+F5) : la barre de GFS disparaît pendant le diaporama. Échap, « Quitter » ou la fin du diaporama : elle revient, au même bord, et la bande n'a pas bougé.
7. Page seule (adresse sans `gfs=`) ou GFS sans barre : aucun décalage.


## 33. Fenêtres, menus, listes de choix, bulles et panneaux sous la barre de Grist Factory Suite : aucun ne passe dessous

**Couverture automatisée** : les scripts Node `gfsBarFit` (882 vérifications : les fenêtres, les menus déroulants de la barre d'outils et leurs info-bulles) et `gfsBarPopups` (1185 vérifications : les barres flottantes d'un tableau et d'une image, les listes des polices, des tailles, de la couleur du texte et des modèles du titre, les popups, les listes avec recherche et les panneaux posés autour de la zone, la barre qui change composant ouvert, l'info-bulle d'un lien, la bulle de taille d'un glissé de colonne, un cadre bas, un cadre étroit, l'outil `GfsBar.settle`), puis `gfsBarCorners` (247 vérifications : le logo et la sortie de la Lecture épurée, dans des cadres bas et très étroits), GFS simulé dans un cadre isolé, une pastille posée par la page parente tient la place de la barre, vraie souris, 700×400, aux quatre bords et sans barre.
**Non couvert** : Firefox (le navigateur de la personne ; les essais tournent dans Chromium), la vraie barre de GFS (ici une pastille de même rectangle), les bandeaux (lettres et numéros) d'un tableau du document, qui restent liés à leur tableau, et la barre d'outils elle-même quand la barre est à gauche ou à droite dans un panneau étroit (un bouton peut y passer sous la barre ; hors de cette section).

### Protocole
Dans Firefox, le widget hébergé par GFS, panneau d'environ 700×400, barre de GFS à gauche (le choix de départ) :
1. Ouvrir la liste des modèles (le titre, en haut à gauche), la liste des polices, celle des tailles et le menu de couleur du texte : aucun ne passe sous la barre ; celui que la barre croiserait glisse à sa droite sans se détacher de son bouton.
2. Dans un document, cliquer une case d'un tableau puis une image : leur barre flottante ne passe pas sous la barre de GFS. Taper « # » en fin de ligne : la liste des variables s'ouvre à côté de la barre, jamais dessous (de même « § » et « @ »). Ouvrir un commentaire, une note de bas de page : même chose.
3. Ouvrir une fenêtre qui a une liste avec recherche (une colonne, une table) : la liste ne passe pas sous la barre. Survoler un lien du document : son info-bulle non plus. Dans un tableau, tirer la poignée d'une lettre de colonne jusque sur la barre : la bulle qui dit la largeur reste à côté d'elle.
4. Barre en haut : les mêmes listes descendent sous elle. Barre à droite : elles s'arrêtent à sa gauche. Barre en bas : une liste qui s'ouvre vers le bas s'arrête au-dessus de la barre et défile à la molette jusqu'à sa dernière ligne ; une liste qui s'ouvre vers le haut remonte d'autant.
5. Garder une liste ouverte (la liste des modèles, par exemple) et déplacer la barre de GFS d'un bord à l'autre : la liste se recale toute seule. Ouvrir l'explorateur de GFS (la barre disparaît) : la liste revient où elle était sans barre.
6. Réduire le panneau à environ 560×300, barre à gauche puis à droite, cliquer une case de tableau : sa barre flottante passe sur deux lignes et reste à côté de la barre de GFS. À 700×400 elle reste sur une ligne.
7. Réduire le panneau à environ 700×180, barre à droite : le logo (coin haut droit de la barre d'outils) recule à gauche de la barre et aucun bouton ne passe dessous. Ouvrir la Lecture épurée (menu du bouton Mode lecture) : le bouton de sortie est aussi à gauche de la barre, et un clic dessus sort de la Lecture épurée. Remettre le panneau à 700×400 : tout est où c'était.
8. Page seule (adresse sans `gfs=`) ou GFS sans barre : tout est où c'était avant.

## 34. Préréglages de marges et chaîne « Lier les quatre marges » (Réglages > Marges) dans Firefox et dans Word

**Couverture automatisée** : le groupe `marginPresets` (12 cas : ce que pose chaque préréglage, celui qui est enfoncé, une petite page, `PageLayout.boundedMarginsMm`, la chaîne, les deux langues), le script Node `marginPresetsMouse` (152 vérifications à la vraie souris et au vrai clavier à 700×400, clair et sombre, français et anglais, modèle simple et macro-modèle : la place, les clics, la frappe, Tab / Maj+Tab / Entrée / Espace, les contrastes) et le cas `access_readonly_greys_margin_presets_and_link` du groupe `accessRights`.
**Non couvert** : Firefox (le navigateur de la personne ; les essais tournent dans Chromium : la grille à trois colonnes qui centre la chaîne entre les champs et l'icône de chaîne tournée à la verticale s'y mesurent pareil, mais le rendu n'y a pas été vu), l'ouverture dans Word du fichier exporté (les marges écrites en `<w:pgMar>` sont relues par le groupe `docx`, pas dans Word lui-même).

### Protocole
Dans Firefox, un modèle ouvert, panneau d'environ 700×400 :
1. Réglages > Marges : sous l'introduction, une rangée de quatre boutons « Aucune », « Étroites », « Classiques », « Larges », puis les quatre champs Haut, Droite, Bas, Gauche avec, au milieu, un petit bouton carré à icône de chaîne. Rien n'est coupé, l'onglet ne défile pas, la fenêtre tient dans l'écran.
2. Cliquer chaque préréglage : les quatre champs prennent 0, 12,7, 25,4 puis 25,4 / 50,8 / 25,4 / 50,8 (haut, droite, bas, gauche), la feuille de l'éditeur derrière la fenêtre suit, et seul le bouton choisi est enfoncé (bleu). Changer un champ à la main : plus aucun bouton enfoncé.
3. Survoler le bouton chaîne : l'info-bulle dit « Lier les quatre marges : en changer une change les trois autres ». Cliquer : il s'enfonce, l'icône montre la chaîne accrochée, aucune marge ne change. Saisir 15 dans « Droite » : les quatre champs affichent 15 et la feuille suit ; saisir un nombre démesuré (400) : chaque paire est bornée, les champs disent ce qui est retenu.
4. Cliquer « Larges » chaîne enfoncée : la chaîne se relâche (l'icône montre la chaîne écartée), les marges sont 25,4 / 50,8 / 25,4 / 50,8. Saisir un nombre dans « Gauche » : les trois autres ne bougent pas. Cliquer « Étroites » chaîne enfoncée : elle reste enfoncée.
5. Fermer puis rouvrir Réglages : la chaîne a gardé son état, le préréglage en place est enfoncé. Recharger la page : la chaîne repart relâchée (elle n'est pas enregistrée), les marges du modèle sont celles qu'il a gardées.
6. Au clavier : Tab parcourt les quatre préréglages, la chaîne, puis Haut, Droite, Bas, Gauche ; Entrée et Espace activent un bouton ; l'anneau de focus se voit sur chacun.
7. Exporter en Word un modèle réglé sur « Larges » et l'ouvrir dans Word : Mise en page > Marges indique les marges « Larges » de Word (2,54 cm en haut et en bas, 5,08 cm à gauche et à droite) ; sur « Étroites » : 1,27 cm partout ; sur « Aucune » : 0 cm.
8. Un macro-modèle : sa mention « Macro-modèle : ces marges priment… » est au-dessus des préréglages, tout tient encore sans défilement ; « Larges » garde « Selon chaque modèle » dans le menu Page.
9. Une personne en lecture seule : les quatre champs, les quatre préréglages et la chaîne sont grisés, un clic dessus ne change rien.


## 35. « Présenter » : le menu ▾ (partir du début ou de la diapositive actuelle) et l'interrupteur « Plein écran »

**Couverture automatisée** : le script Node `slidesShow` (69 vérifications, GFS simulé dans un cadre isolé qui refuse le plein écran, un `requestFullscreen` espion compte ce qu'on demande au navigateur) : le ▾ à gauche du ▶, le menu au-dessus dans le panneau, les deux départs, l'interrupteur grisé avec sa raison dans un cadre qui refuse puis coché, décoché et recoché dans un cadre qui permet (le ▶, F5 et Maj+F5 le suivent), le clavier, l'extension éteinte.
**Non couvert** : le vrai plein écran du navigateur (le cadre de GFS et celui de Grist le refusent : il se voit dans la page seule, hors GFS), Firefox (les essais tournent dans Chromium).

### Protocole
Dans Firefox, une présentation de trois diapositives ou plus, le curseur dans la deuxième :
1. Un petit bouton ▾ est à gauche du ▶, sur la ligne de la pastille du zoom ; le ▶ est toujours contre la pastille. Son info-bulle dit « Autres façons de présenter : depuis le début, plein écran ».
2. Cliquer ▶ : le diaporama part de la diapositive 2, comme avant. Échap.
3. Cliquer ▾ : un menu s'ouvre au-dessus : « À partir de la diapositive 2 (Maj+F5) », « Depuis le début (F5) », « Plein écran ». Cliquer « Depuis le début » : le diaporama part de la première. Échap. Rouvrir le menu, cliquer « À partir de la diapositive 2 » : il part de la deuxième.
4. Dans la page seule (adresse sans `gfs=`) : « Plein écran » est coché ; le ▶ et le menu passent le diaporama en plein écran du navigateur ; Échap sort du plein écran et du diaporama. Décocher « Plein écran » (le menu se ferme), cliquer ▶ : le diaporama prend seulement le panneau ; F5 et Maj+F5 de même ; recocher : le plein écran revient.
5. Dans GFS : « Plein écran » est grisé, avec sous lui « Ce cadre ne le permet pas : le diaporama prend tout le panneau. » ; un clic dessus ne change rien et le menu reste ouvert ; le diaporama prend tout le panneau du widget.
6. Au clavier : Tab jusqu'au ▾, Entrée ouvre le menu sur sa première ligne, ↓ passe à la suivante, Échap referme et rend le clavier à ▾. Entrée sur « Depuis le début » lance ; en quittant, le clavier revient à ▾. Un clic à côté du menu le referme.
7. Désinstaller l'extension « Diapositives » dans GFS : ▾ et ▶ sont grisés ; leur clic demande à GFS de l'installer.

---

## 36. Macro-modèle mêlant des pages A4 et des diapositives (Lecture, Word, impression, PDF)

**Couverture automatisée** : groupe `mixedFormat` (`scenarios-mixed-format.js`, 16 cas : le lecteur des repères de page - sens et format -, `PageLayout.withPage`, l'assemblage d'une présentation, la Lecture, le facteur d'ajustement d'une diapositive, le Word relu
en XML, l'impression navigateur, le PDF relu par pdf.js - taille de chaque page, numéros, zones, sommaire et liens, images et notes, filigrane et pages blanches, PDF protégé -, la chaîne entière, les autres sorties - HTML, Markdown et texte d'un e-mail, qui ne lisent pas le format -), les cas `macro_summary_tags_presentations_and_greys_their_pencil_while_the_extension_is_off` et `macro_editor_offers_documents_grids_and_presentations_but_neither_emails_nor_macros` de `macroModeles`,
le scénario 8 bis de `browserPrintPdf` (le vrai PDF d'impression de Chromium : lettre A4, deux diapositives, annexe A4 en paysage, page de fin) et
le script Node `macroPageAutoMouse` (les étiquettes « Diapositives » et « Paysage » à la vraie souris, 700 px et 360 px).
**Non couvert** : un vrai Word (les cas lisent l'OOXML), un vrai lecteur de PDF (pdf.js lit les tailles, le texte et les liens), Firefox (la propriété `page` y est prise en charge depuis la version 110 d'après MDN, mais ce qu'il fait d'une impression qui mêle deux tailles de feuille n'a pas été vu : pas de Firefox là où les essais tournent) et Safari (pages nommées de l'impression), un
document Grist réel avec une vraie extension « Diapositives » dans Grist Factory Suite.

### Protocole
1. Dans Grist Factory Suite avec l'extension « Diapositives » allumée, créer une présentation de trois diapositives (un titre et un paragraphe chacune ; une quatrième avec un tableau large) et deux documents A4 en portrait : une lettre et
   une page de fin. Créer un macro-modèle (« + », « Macro-modèle ») : la lettre en page de garde, puis deux annexes, la présentation et la page de fin (la liste propose les présentations avec les documents et les grilles). Enregistrer : le menu Page
   est sur « Selon chaque modèle ».
2. Résumé du macro-modèle : « Diapositives » puis « Paysage » à droite du nom de la présentation, rien à côté des deux documents ; le stylo de la présentation est vivant. Éteindre l'extension « Diapositives » (ou ouvrir le document sans elle) : le stylo de
   la présentation est grisé, avec la raison au survol (« Demande l'extension Diapositives (Grist Factory Suite) »), le macro-modèle s'assemble quand même.
3. Lecture : trois suites de feuilles - la lettre (A4 portrait), la présentation (une feuille 16:9 par diapositive, chacune entière dans le panneau de 700 × 400 et lisible, le tableau large entier dans sa feuille), la page de fin (A4 portrait) ;
   avec un en-tête et un pied « n / total », les numéros continuent d'une feuille à l'autre ; aucun défilement horizontal ; en cliquant « Ajuster » de la pastille de zoom, la diapositive reste entière.
4. « Exporter en DOCX » puis ouvrir dans Word : trois sections (Mise en page > Taille : A4, 33,87 × 19,05 cm, A4 ; Orientation : portrait, paysage, portrait) ; le tableau large est entier dans la section des diapositives ; rien ne glisse sur une
   page blanche à la jonction.
5. Qualité « Impression navigateur » puis « Exporter » (Chrome ou Edge) : l'aperçu avant impression montre des feuilles A4, puis des feuilles 16:9, puis des feuilles A4. Dans Firefox : noter ce que montre l'aperçu (c'est la seule vérification de ce
   navigateur : les essais n'en ont pas ; si toutes les feuilles sortent à la taille de la première, le dire). Le cas le plus dur : ajouter au macro-modèle, entre la présentation et la page de fin, une annexe A4 en paysage (même sens que les diapositives, autre
   format) : l'aperçu la montre en feuilles A4 paysage, pas en feuilles 16:9.
6. Menu Page, « Portrait » : le macro-modèle donne son A4 portrait à tous ses modèles, la présentation comprise (ses diapositives coulent sur les pages A4, « Diapositives » reste dans le résumé, « Paysage » disparaît) ; « Selon chaque modèle » les
   rétablit. Thème sombre et anglais (« Slides », « Landscape ») : les étiquettes restent lisibles.
7. « Exporter en PDF » (qualité normale), ouvrir le fichier dans un lecteur de PDF : un seul fichier ; la lettre en A4 portrait, une page 16:9 par diapositive (Propriétés du document : 33,87 × 19,05 cm), la page de fin en A4 portrait ; avec un en-tête et un pied « n / total », les
   numéros courent d'une page à l'autre jusqu'au total du document entier (jamais « 1 / 1 » sur les diapositives), l'en-tête et le pied de chaque page sont dans sa largeur ; le tableau large est entier dans sa diapositive. Avec un sommaire : ses numéros sont ceux du document
   entier et un clic mène au bon titre, même dans une autre taille de page. Une image en calque et une note de bas de page sont sur la page de leur modèle. Un filigrane couvre chaque page, sur sa taille.
8. « Exporter les lignes » en un seul PDF (plusieurs lignes) : chaque ligne commence sur une nouvelle page, avec ses pages de deux tailles, et les numéros recommencent à 1 à chaque ligne.
9. Réglage « PDF protégé » avec un mot de passe, puis « Exporter en PDF » sur ce macro-modèle : l'export s'arrête avec la phrase « Un PDF protégé ne peut pas mêler des pages de formats différents… » et aucun fichier n'est téléchargé ; en lot, la fin de lot la
   répète pour chaque ligne. Menu Page, « Portrait » (toutes les pages A4) : le même réglage protège le PDF sans problème.
10. « Exporter en HTML » puis « Exporter en Markdown » sur ce macro-modèle : le texte de chaque modèle et de chaque diapositive y est, aucun fichier ne montre « Saut de page » ni un repère de page ; le Markdown a une ligne `<div style="page-break-after: always;"></div>` entre les modèles et entre
    les diapositives, le HTML n'en a pas (un fichier HTML n'a pas de pages). Il n'y a rien à regarder du côté de l'e-mail : un modèle d'e-mail ne se range pas dans un macro-modèle.

## 37. Une même table liée lue depuis deux pages : un lien par table de la page (« Tables liées »)

**Couverture automatisée** : le script Node `gristApiCoreUnit` (`unit-grist-api-core.mjs`, 107 vérifications dont 4 sections de ce sujet : la table des liens d'avant la colonne `TableSource`, un lien par couple et le repli sur
le lien commun, la colonne ajoutée une seule fois au premier lien d'une table et jamais à la lecture, le compte qui ne peut pas modifier la structure, la suppression d'un couple ou de tous les liens d'une table), le groupe
`linkConfig` (`scenarios-link-config.js`, 16 cas dont 4 de ce sujet : la fenêtre qui dit pour quelle table vaut le lien, deux pages qui lisent la même table liée sans se défaire, la liste « Tables liées », le bouton grisé
d'un lien d'une autre table), le groupe `schemaRenames` (32 cas dont 2 de ce sujet : une table de la page renommée, la colonne source d'un lien par table), le groupe `templatePack` (26 cas : la galerie pose son lien pour la table
principale du modèle et garde celui qui existe déjà pour elle), les groupes `varLoop`, `varCondition`, `varColumn` et `varLookup` (les boucles, les conditions et les colonnes lisent le lien de leur table de la page).
**Non couvert** : un vrai Grist avec plusieurs pages et de vrais droits d'accès (le faux Grist des essais nomme « TableSource2 » une colonne posée deux fois, comme le vrai, mais ne connaît pas les droits d'accès), une copie
plus ancienne du widget qui écrit la même table des liens au même moment, Firefox.

### Protocole
Dans Firefox, le widget hébergé par GFS (ou la page seule), sur un document qui lit la table « Projets » depuis deux pages (Notifications : `Projet = Projet` ; Suivi_Instance : `Instance_ratachee = Auto`), panneau d'environ 700×400 :
1. Document dont les liens ont été posés avant cette version : « Tables liées » montre chaque lien sous la forme « Toutes les tables → Projets : … » ; la table `Publipostage_LiensTables` n'a pas de colonne « Table de la page »,
   et ouvrir un modèle, le lire ou l'exporter ne l'ajoute pas.
2. Page Suivi_Instance, « Tables liées », « Modifier » sur le lien vers « Projets » : la fenêtre s'intitule « Suivi_Instance → Projets » et dit « Ce lien vaut pour la table « Suivi_Instance » seulement : les autres tables gardent
   le leur. » Choisir `Instance_ratachee` = `Auto`, valider : `Publipostage_LiensTables` gagne la colonne « Table de la page » et une ligne (Suivi_Instance, Projets) ; la ligne d'avant n'a pas bougé.
3. « Tables liées » montre côte à côte « Suivi_Instance → Projets : Instance_ratachee = Auto » et « Toutes les tables → Projets : … ». Les modèles de Suivi_Instance (Lecture, PDF) lisent la ligne de `Instance_ratachee` ; ceux de
   Notifications lisent « Projets » comme avant, par `Projet = Projet`.
4. Refaire le lien depuis Notifications (une autre colonne, puis la première de nouveau) : la ligne de Suivi_Instance n'a pas changé et ses modèles lisent la même ligne.
5. Page Notifications, « Tables liées » : le bouton « Modifier » du lien « Suivi_Instance → Projets » est grisé, son info-bulle dit « Ouvrez la table « Suivi_Instance » pour modifier ce lien. » ; le supprimer demande « Supprimer le
   lien de « Suivi_Instance » vers « Projets » ? » et ne touche que lui.
6. Supprimer dans Grist la table d'un lien par table : sa ligne se lit « (table introuvable) », son bouton « Modifier » est grisé (« La table « … » n'existe plus : ce lien peut être supprimé. ») et « Supprimer » la retire.
7. Un compte Lecteur (ou le document ouvert en lecture seule) : ouvrir, lire et exporter les modèles ne crée aucune colonne ni aucune ligne dans `Publipostage_LiensTables`.
8. Une page de Grist restée ouverte sur la version d'avant : la recharger avant de refaire un lien (elle lit chaque ligne comme le lien commun à toutes les tables et pourrait en écraser une).
9. Panneau de 700 × 400 : la fenêtre d'un lien, avec sa ligne en plus, tient sans défiler ; la liste « Tables liées » aussi, boutons « Fermer », « Modifier » et « Supprimer » visibles.

## 38. « Toutes les lignes de la vue » : l'export en lot suit le tableau relié par « Sélectionner par »

**Couverture automatisée** : le groupe `pdfBatch` (65 cas dont 14 de ce sujet : les lignes, leur ordre, les filtres de valeurs, de nombres et de dates, le tri d'une Référence, les liens qui ne comptent pas, plusieurs widgets à la même adresse, la vue
illisible, la question qui nomme la vue, le ZIP dans l'ordre de la vue), le script Node `dialogsMouse` (322 vérifications dont 42 de ce sujet : les fenêtres à 700×400, en clair, en sombre et en anglais) et, dans un vrai Grist (grist-static 0.1.6),
le laboratoire `lab-export-linked-view.mjs` (21 contrôles en français et en anglais, le ZIP comparé au tableau que Grist affiche).
**Non couvert** : le vrai Firefox, le widget hébergé par GFS (plusieurs applications de GFS portent la même adresse que le widget : tant qu'elles sont toutes reliées au même tableau, c'est lui qui compte ; sinon la fenêtre dit que le widget ne sait pas
lequel est le sien), la « Table de travail » de GFS (aucun filtre : le lot reste sur ses lignes), un compte Lecteur, des dates relatives posées par l'écran de Grist (lues comme illisibles dans les essais, non vues avec la vraie interface).

### Protocole
Dans Firefox, le widget (seul puis hébergé par GFS), sur un document avec une table « Notifications » : un tableau de la table et, à côté, le widget relié à lui par « Sélectionner par » (même table), panneau d'environ 700×400 :
1. Sans filtre sur le tableau : Exporter > « Toutes les lignes de la vue (ZIP) » puis le bouton Exporter : aucune question, la confirmation parle de toutes les lignes et nomme la vue (« D'après la vue « … », liée à ce widget par « Sélectionner par » : seuls
   ses filtres enregistrés dans Grist comptent, un filtre non enregistré est ignoré. »).
2. Poser un filtre sur le tableau (par exemple Statut = « À faire »), SANS cliquer « Enregistrer » : le tableau montre moins de lignes, l'export n'en tient pas compte (même confirmation qu'au 1), la note le dit.
3. Cliquer « Enregistrer » : l'export demande « Quelles lignes exporter ? » avec « La vue « … » n'affiche que N des M lignes de « Notifications » (d'après ses filtres enregistrés). » et les boutons « Annuler », « Toute la table », « Celles de la vue » sur une seule ligne.
   « Celles de la vue » : la confirmation dit N lignes ; le ZIP contient N PDF, dans l'ordre où le tableau les montre. « Toute la table » : M lignes, aucune mention de la vue.
4. Ajouter un tri enregistré (Nom de Z à A) : le ZIP suit l'ordre du tableau ; un tri sur une colonne Référence suit le nom que la Référence montre quand le tableau montre la colonne.
5. Un filtre sur des dates relatives (« les 7 derniers jours ») enregistré sur le tableau : la fenêtre dit que le widget ne peut pas lire la vue, ne propose que « Toute la table » (et « Celles du widget » si son cadre cache des lignes), rien n'est mis en avant et Entrée annule.
6. Retirer le lien « Sélectionner par » du widget : plus de question ni de mention d'une vue, l'export est celui du widget (son propre filtre le cas échéant). Un lien par une colonne de l'autre tableau (le widget montre alors un sous-ensemble) : l'export suit déjà le widget, sans mention d'une vue.
7. Mêmes essais en anglais : « All rows of the view (ZIP) », « The view's rows », « Whole table » ; les fenêtres tiennent dans le panneau sans texte coupé, avec un nom de vue long.
8. Boucle sur toutes les lignes et Lecture : elles gardent les lignes du widget, inchangées.

---

## Prochaines étapes (pistes d'amélioration de la suite automatisée)

**Fait le 2026-09-14** : étage 2 (mode Lecture) comblé pour un premier socle de cas
(`scenarios-readmode-fidelity.js`, cf. mise à jour en tête de document) ; étage 3 rendu fiable pour
le texte centré/aligné à droite et les images en calque (`scenarios-pdf-ground-truth.js`, décodage
réel du PDF via pdf.js).

Par ordre de valeur probable pour la suite :
1. **Étendre `readModeFidelity`** : sommaire/TOC (le marqueur de numérotation de titre est déjà
   couvert, `readmode_heading_numbering_marker_match` - reste le sommaire lui-même), chips
   intelligents (date/heure/email - la VALEUR peut légitimement différer d'un instant à l'autre,
   vérifier plutôt le format/la position), couleur de texte/surlignage, familles de police réelles.
2. **Vrai test de redimensionnement de colonne de tableau** (glisser réel + vérification de
   largeur en éditeur ET en PDF), symétrique à ce qui existe déjà pour la 2-colonnes.
3. **Copier/coller d'image** et **simulation Attachments Grist** dans le harnais de test —
   aujourd'hui seule l'insertion par URL est automatisée.
4. Un test de non-régression sur le **temps de chargement** (mesurer `performance.now()` entre
   la navigation et `Widget prêt.`, alerter si un changement futur le dégrade significativement).
