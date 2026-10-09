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
plafonné, PDF/éditeur désynchronisés) — corrigé par un plafond fixe (60px, comme
`HF_MAX_IMAGE_HEIGHT_PX`) appliqué aux 2 : `overflow:hidden` en édition, marge de page PDF
non-dynamique. C'est la zone la MIEUX couverte actuellement (éditeur + structure PDF), mais
toujours sans étage 2 (Lecture).

### Protocole
1. Vérifier que la taille maximale d'une image OU d'un texte en en-tête/pied
   (`HF_MAX_IMAGE_HEIGHT_PX`/`HF_MAX_IMAGE_WIDTH_PX`) est bien appliquée et **identique** en
   éditeur, en Lecture et à l'export — une image ou un texte qui dépasse doit être plafonné aux
   3 étages (bloqué visuellement dans l'éditeur, jamais seulement à l'écran) — vérifier aussi
   qu'un saut de page forcé peu après le début d'une page réserve bien tout le reste de la page
   dans l'Aperçu A4 (pas un espace collé au pied de page suivant).
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
2. Survoler chaque groupe `.v2-hover-group` (Titre, Alignement, Liste, Qualité PDF...) —
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

**Couverture automatisée** : aucune.

### Protocole
1. Panneau Réglages → onglet Langue → basculer FR/EN — vérifier que TOUS les libellés visibles
   changent immédiatement (toolbar, infobulles, menus, modales), sans texte resté en français
   au milieu d'une interface en anglais (ou l'inverse) — chercher spécifiquement les infobulles
   construites dynamiquement (barres flottantes image/tableau/variable), plus faciles à oublier
   qu'un bouton statique.
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
   Un macro-modèle : le bouton et son menu sont actifs ; choisir Paysage puis A5 allume le bouton et coche les deux lignes ; la Lecture, « Exporter en PDF », « Exporter en un seul PDF » et
   « Exporter en DOCX » sont en A5 paysage (le lecteur PDF annonce 210 × 148 mm, Word : Mise en page > Taille A5, Orientation Paysage), même si sa page de garde ou une annexe est en A4
   portrait ou en A3 ; rouvrir cette page de garde seule la montre toujours dans son propre format. Recharger la page du document Grist : le macro-modèle revient en A5 paysage.
   Enregistrement automatique coupé : la page n'est gardée que par « Enregistrer » dans la fenêtre du macro-modèle (et « Enregistrer sous… » en fait une copie qui la garde).
7. À 700 px de panneau : A5 portrait tient sans réduction, A3 portrait est réduit (facteur 0,60), A3 paysage tombe au plancher de 0,5 et la zone d'édition défile horizontalement.
8. Au clavier : Tab depuis Aperçu A4 arrive sur le bouton Page et ouvre son menu, passe par ses six lignes (trait de focus visible), Entrée ou Espace pose le format, Tab suivant
   referme le menu et arrive sur Qualité PDF.
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
4. Une facture avec une table de lignes liée (clé de correspondance : une règle par table) : `SOMME(#Lignes.Prix * #Lignes.Quantite)` donne le total des lignes ; sans fonction la fenêtre ou la Lecture dit « donne N valeurs ».
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
