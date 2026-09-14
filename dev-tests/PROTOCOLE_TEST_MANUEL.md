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
glisser de poignée). **Étage 2** : non couvert.
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
   cf. `wireModalAccessibility` — à revérifier après tout changement sur les modales).
4. Sélection de texte à la souris près des bords de l'éditeur, d'une cellule, d'une image — pas
   de sélection qui "saute" ailleurs de façon inattendue.

---

## 9. Modèles de test dédiés

Deux modèles ajoutés à la galerie (`templates-gallery/`, tag `test`) pour dérouler rapidement une
bonne partie de ce protocole sans avoir à retaper du contenu à chaque fois :

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

## 11. Performance et robustesse

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

## 12. Revue rapide des derniers commits

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
