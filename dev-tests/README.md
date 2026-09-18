# Suite de tests — éditeur + export PDF vectoriel

Suite de tests automatisés (façon "tests unitaires", au sens : chaque scénario
isole une fonctionnalité précise et renvoie un verdict programmatique)
couvrant l'éditeur (TipTap/ProseMirror) et l'export PDF **vectoriel
uniquement** (qualité "native" — les autres qualités d'export, impression
navigateur/basse/ultra HD, ne sont pas couvertes). Portée volontaire :
**tout sauf la résolution de `#Variable`/pièces jointes Grist**, qui a
besoin d'un vrai document Grist et ne peut pas être testée en local (cf.
mémoire projet `feedback_testing_workflow`). Les chips Date/Heure/Note de
bas de page, eux, sont testés en entier (aucun appel Grist requis).

Conçue pour être **rejouée régulièrement** (régression après une future
modification), pas juste une fois.

## Portée du test : ciblé (par défaut) vs complet (sur demande explicite)

Deux niveaux de non-régression, pas un seul :

- **Ciblé** (par défaut, à chaque correctif/évolution) : uniquement le(s)
  groupe(s) `scenarios-*.js` couverts par la table ci-dessous pour les
  fichiers réellement modifiés. Plus rapide, suffisant pour valider un
  changement localisé sans balayer tout le reste à chaque fois.
- **Complet** (uniquement si l'utilisateur le demande explicitement - "lance
  tous les tests", "vérifie qu'il n'y a pas de régression partout" - ou avant
  un commit qui touche un fichier réellement transverse comme
  `editor-core.js`) : tous les groupes de la section "Démarrage rapide"
  ci-dessous, par lots de 2-3 (budget ~45s par lot).

**Table fichier source → groupe(s) de tests concernés** (mettre à jour cette
table quand un fichier change de rôle ou qu'un nouveau `scenarios-*.js`
apparaît) :

| Fichier modifié | Groupe(s) à lancer |
|---|---|
| `js/pdf-export.js` | Le(s) groupe(s) du domaine touché (`images`, `twoColumns`, `tables`, `lists`, `formatting`, `pageBreakToc`, `headerFooter`, `chips`) **+ toujours `pdfFidelity` ET `pdfGroundTruth`** (points d'entrée export communs à tout - `pdfGroundTruth` en particulier couvre tout changement touchant la position d'une image en calque ou l'alignement d'un paragraphe) |
| `js/docx-export.js` | **Toujours `docx` ET `docxImages`** (seuls points d'entrée de l'export DOCX - `docxImages` couvre tout changement touchant la position/l'habillage d'une image, `docx` le reste de la structure OOXML) |
| `js/reader-mode.js` | **Toujours `readModeFidelity`** (seul point d'entrée du mode Lecture) + le(s) groupe(s) du domaine touché si le changement touche aussi une logique partagée avec l'éditeur |
| `css/editor-v2.css`, `css/style.css` (règle touchant `.reader-content`) | **Toujours `readModeFidelity`** en plus des groupes déjà listés plus bas pour ce fichier |
| `js/floating-toolbars.js` | `images`, `twoColumns`, `tables` (toolbars tableau/image), `formatting` (pickers couleur), **toujours `varFormat`** (barre flottante nombre/date d'une bulle #Variable - même fichier, cf. Bug 5 dans BUGS.md) |
| `js/editor-nodes.js` | `images`, `twoColumns`, `lists`, `chips`, **+ `pageLayout`** si le changement touche la zone 2-colonnes |
| `js/header-footer-preview.js` | `headerFooter`, `pageBreakToc` (pagination partagée), **+ `pageLayout`** (la hauteur de page dépend des marges du modèle) |
| `js/page-layout.js`, `js/settings.js` (onglet Marges) | **Toujours `pageLayout`** + `pdfFidelity`, `readModeFidelity` et `docx` (la largeur de contenu est consommée par les trois, cf. `<w:pgMar>` pour l'export DOCX) |
| `js/reader-mode.js` | `images` (cas mode Lecture), `pageBreakToc` (cas mode Lecture) |
| `js/main-toolbar.js` | `formatting`, `lists` |
| `js/heading-numbering.js` | `pageBreakToc` (numérotation/sommaire) |
| `css/editor-v2.css`, `css/style.css` | Dépend de la règle touchée - au minimum `images` + `twoColumns` + `tables` si la règle touche `.two-columns-*`/`table td`/`.reader-content`, sinon le groupe visuellement concerné |
| `js/comments.js`, `js/editor-nodes.js:createCommentMark`, `js/main.js` (`loadForTemplate`/`onSave`) | `comments` |
| `js/editor-core.js`, `js/editor.js` | **Transverse** - traiter comme une demande de suite complète, ces fichiers sont partagés par tous les domaines |
| `dev-tests/helpers.js`, `dev-tests/runner.js` | **Transverse** - même traitement (tout scénario dépend de ces deux fichiers) |

Exemple : un correctif dans `twoColumnsFrom` (`js/pdf-export.js`) ne lance
QUE `scenarios-twocolumns.js` + `scenarios-pdf-fidelity.js` (+ `scenarios-images.js`
si le correctif touche une image en calque dans une colonne) - pas les 10
groupes.

## Démarrage rapide (sans navigateur à piloter à la main)

```bash
bash dev-tests/generate-harness.sh          # régénère _test-harness.html depuis index.html
node dev-tests/run-headless.mjs             # tous les groupes
node dev-tests/run-headless.mjs comments formatting # seulement ces groupes
```

`run-headless.mjs` sert le dépôt, ouvre `_test-harness.html` dans un Chromium
headless (Playwright), pose `.a4-preview`, charge `helpers`/`runner` + le
fichier du groupe, exécute et imprime le rapport. Il sort en code 1 dès qu'un
scénario échoue, donc il s'utilise tel quel avant un commit ou dans un runner
CI. **Un navigateur neuf par groupe**, à dessein : ce README documente plus bas
des fuites d'état entre suites, un processus par groupe rend chaque verdict
indépendant de l'ordre de lancement.

Il attend **« Widget prêt. »** dans `#status-msg` avant de charger le moindre
scénario, et pas seulement l'existence de l'éditeur : `.tiptap` existe déjà en
0×0 pendant que `main.js:init()` tourne encore, et `execCommand('insertText')`
renvoie `false` tant que l'éditeur n'a pas sa vraie taille - les scénarios qui
tapent du texte échouent alors avec des notes de diagnostic vides, ce qui
ressemble à une régression sans en être une.

Deux options utiles :

- `--port 8899` si 8843 est déjà pris (plusieurs runs en parallèle).
- `--probe "<expression JS>"` ouvre le harnais, évalue l'expression (`await`
  supporté) et imprime le résultat, sans exécuter aucun scénario - pour
  inspecter l'état réel de la page avant d'écrire un test.

### Dépendances CDN et réseau bloqué

`index.html` charge TipTap/ProseMirror depuis `esm.sh` et pdfmake/pdf.js/JSZip/
html2pdf depuis `cdnjs`. Un environnement d'exécution distant (Claude Code sur
le web, un runner CI) refuse souvent ces hôtes : l'éditeur ne démarre alors pas
du tout et aucun test ne peut tourner.

```bash
bash dev-tests/offline-deps.sh   # réinstalle les MÊMES versions depuis npm et les bundle localement
```

Rien de tout ça n'est commité (cf. `dev-tests/.gitignore`) : ce n'est pas une
vendorisation des dépendances, juste un cache reconstructible. `run-headless.mjs`
détecte ce cache et détourne les requêtes CDN vers lui ; s'il est absent, il
laisse les CDN être appelés normalement. Deux détails qui ont coûté un
diagnostic, réglés dans le lanceur et à ne pas défaire :

- les chunks partagés produits par esbuild sont servis sous **une seule URL
  absolue** - servis sous deux URL différentes, ProseMirror est chargé deux
  fois et TipTap casse avec *"looks like multiple versions of prosemirror-model
  were loaded"* ;
- le hash **SRI** (`integrity`) de `js/pdf-export.js` est neutralisé dans la
  page de test uniquement : un miroir local ne peut pas satisfaire le hash d'un
  fichier minifié par cdnjs. L'application réelle garde sa protection intacte.

## Démarrage manuel (navigateur réel, pour observer ou mettre au point)

```bash
# Depuis la racine du dépôt
python -m http.server 8843
```

```bash
bash dev-tests/generate-harness.sh   # régénère _test-harness.html depuis index.html
```

Ouvrir `http://localhost:8843/_test-harness.html` dans un navigateur,
puis dans la console :

```js
async function loadFresh(path) { const r = await fetch(path, {cache:'no-store'}); eval(await r.text()); }
window.EditorTestSuites = {};
const files = [
  'helpers', 'runner',
  'scenarios-formatting', 'scenarios-lists', 'scenarios-tables',
  'scenarios-twocolumns', 'scenarios-nesting', 'scenarios-images',
  'scenarios-pagebreak-toc', 'scenarios-headerfooter', 'scenarios-chips',
  'scenarios-varformat',
  'scenarios-pdf-fidelity', 'scenarios-pdf-ground-truth', 'scenarios-readmode-fidelity',
  'scenarios-comments', 'scenarios-pagelayout',
  'scenarios-docx', 'scenarios-docx-images',
];
for (const f of files) await loadFresh('/dev-tests/' + f + '.js');
const results = await TestRunner.runAll(EditorTestSuites);
console.log(TestRunner.report(results));
results.filter(r => !r.pass);   // ne garder que les échecs, avec leurs `notes` diagnostiques
```

Toujours `{ cache: 'no-store' }` en rechargeant un fichier après une
modification — le cache navigateur sur du JS servi en local produit sinon
de faux négatifs/positifs (piège déjà rencontré plusieurs fois ce projet,
cf. mémoire `project_browser_cache_trap`).

**`loadFresh`/`eval()` ne recharge PAS un fichier `js/*.js` de l'app** (seuls
les `dev-tests/*.js` s'y prêtent, car ils font `window.TestHelpers = ...`/
`window.EditorTestSuites.xxx = ...` explicitement). Chaque fichier applicatif
(`pdf-export.js`, `editor.js`, `floating-toolbars.js`...) est un
`const X = (function(){...})();` top-level : un `eval()` DANS une fonction
(`loadFresh` en est une) crée un `const` local à cet appel, jamais exposé
globalement - `window.PdfExport` par exemple n'existe même pas. Après avoir
modifié un fichier `js/*.js`, il faut un **vrai rechargement de page**
(`navigate`/F5), jamais `loadFresh` sur ce fichier précis - sinon les tests
valident silencieusement l'ANCIEN code (piège rencontré et longuement
diagnostiqué en séance, cf. mémoire
`project_v2_twocolumns_offsetparent_and_multiline_anchor`).

**Lancer un seul groupe (test ciblé)** - voir la table plus haut pour choisir
le(s) groupe(s) pertinent(s) au fichier modifié :
```js
const r = await TestRunner.runGroup('images', EditorTestSuites.images);
console.log(TestRunner.report(r));
```
Pour plusieurs groupes ciblés à la fois, ne charger QUE leurs fichiers dans
`files` (au lieu de la liste complète du "Démarrage rapide" ci-dessus) avant
d'appeler `TestRunner.runAll(EditorTestSuites)`.

**Lancer TOUS les groupes d'un coup** peut dépasser le budget de temps de
certains outils d'exécution JS distants (~45s) — dans ce cas, lancer par
lots de 2-3 groupes (voir l'historique de cette session pour l'exemple).

**Une session longue qui a fait beaucoup de manipulations DOM manuelles dans
un même onglet (edits d'attributs, overrides `window.prompt`, injection de
librairies tierces...) peut laisser cet onglet dans un état corrompu qui fait
échouer des tests SANS RAPPORT avec le changement en cours** (constaté : 14
échecs sur des tests de formatage/liste/tableau de base après une longue
session de diagnostic manuel, disparus intégralement en relançant les mêmes
tests dans un onglet fraîchement ouvert). Si des tests basiques échouent de
façon inattendue après une session de debug prolongée dans le même onglet,
ouvrir un onglet neuf avant de conclure à une régression (cf. mémoire
`project_stale_tab_module_corruption`, même famille de piège).

**`window.innerWidth`/`innerHeight` peuvent valoir `0` tant que le panneau Browser
n'est pas ACTIVEMENT affiché à l'utilisateur** (constaté 2026-09-14 : 5 faux positifs
- `img_resize_corner_*`, `twocol_resize_grip` - qui mesurent une largeur avant/après un
glisser ; l'utilisateur a confirmé RAS en conditions réelles). `tabs_select` (mettre un
onglet au premier plan) et même un onglet tout neuf ne suffisent PAS à corriger ça - seul
le fait que le panneau lui-même soit visible dans l'interface compte. Un `screenshot`
peut pourtant rendre visuellement correct pendant ce temps (mesure indépendante) - ne pas
s'y fier comme preuve que `getBoundingClientRect()` est fiable. Avant de conclure à un bug
sur un test qui mesure une largeur/hauteur réelle (redimensionnement, glisser une
poignée...), vérifier `window.innerWidth` en premier ; s'il vaut `0`, le test n'a rien
mesuré de valide, quel que soit son verdict.

## `.positions[]`/`.absolutePosition` (métadonnées pdfmake) ne sont PAS la vérité terrain — utiliser `h.extractPdfGroundTruth` pour tout ce qui est centré/aligné-droite/en calque

`exportPdfContent` lit `.positions[]` et `.absolutePosition` directement sur
les objets `docDefinition` APRÈS mise en page (`getBase64`) - un raccourci
pratique, réel effet de bord déjà exploité par `pdf-export.js` lui-même pour
son propre ancrage. Mais ces propriétés se sont révélées **peu fiables** dans
deux cas précis, découverts en creusant un vrai bug utilisateur (position
d'image "aléatoire" sur un scénario 2-colonnes centré) :

1. **Texte multi-lignes centré/aligné à droite** : `.positions[]` peut
   rapporter la MÊME valeur `left` pour TOUTES les lignes d'un bloc, alors que
   le rendu réel centre/aligne chaque ligne indépendamment (une ligne plus
   courte est visuellement plus indentée). Un test qui ne vérifie que
   `positions[0].left` peut sembler "passer" en comparant deux valeurs
   également fausses de la même façon, sans jamais toucher le vrai rendu.
2. **Image en calque (`absolutePosition`) avec un `alignment` résiduel** :
   pdfmake applique `alignment` MÊME par-dessus une `absolutePosition` -
   `.absolutePosition` continue d'afficher la valeur qu'on lui a assignée
   (donc "correcte" en apparence) alors que le PIXEL réellement peint est
   décalé par le centrage. C'était la cause exacte du bug utilisateur : rien
   dans les métadonnées ne le révélait, seul le décodage des octets du PDF
   final l'a montré.

**`TestHelpers.extractPdfGroundTruth(base64)`** (dev-tests/helpers.js) décode
le PDF généré avec pdf.js (chargé depuis un CDN, comme pdfmake lui-même) et
renvoie, par page, `textItems` (position réelle de chaque run de glyphes) et
`images` (position/dimensions réelles de chaque image peinte, dans l'ordre de
peinture). **Toujours l'utiliser** (jamais `.positions[]`/`.absolutePosition`
seuls) pour vérifier la position d'un bloc centré, aligné à droite, ou d'une
image en calque - `scenarios-pdf-ground-truth.js` (groupe `pdfGroundTruth`)
en est l'exemple de référence (matrice contexte × alignement × type d'ancre,
32 cas). `.positions[]`/`.absolutePosition` restent fiables pour du texte
aligné à GAUCHE en une seule ligne (cas déjà couvert par
`scenarios-pdf-fidelity.js`, pas besoin de tout migrer).

## Étage 2 (mode Lecture) — `scenarios-readmode-fidelity.js`, comble un angle mort documenté

`PROTOCOLE_TEST_MANUEL.md` documentait depuis longtemps un angle mort : `js/reader-mode.js` est un
**3ᵉ moteur de rendu indépendant** (ni l'éditeur TipTap ni pdfmake) avec ses propres règles CSS
(`.reader-content`, censées être symétriques à `.tiptap`) - et avait déjà causé un vrai bug par le
passé (image en calque "collée en haut à gauche" en Lecture, `.reader-content` sans
`position:relative`). Ce moteur n'avait **aucune** couverture automatisée avant le 2026-09-14.

`TestHelpers.renderReaderMode(html, headerFooterData)` (dev-tests/helpers.js) appelle
`ReaderMode.render` directement (même contournement que `exportPdfContent` pour `PdfExport` : un
`record` factice minimal, on ne teste jamais ici la résolution de `#Variable`, seulement la fidélité
HTML/CSS) et force les deux conteneurs (`#editor-container`/`#reader-container`) visibles
simultanément pour pouvoir mesurer les deux. `TestHelpers.compareEditorReaderPosition(texte)` /
`compareEditorReaderImage(srcContains)` retrouvent un même repère des deux côtés (par contenu texte,
ou par `src` d'image) et comparent la position RENDUE (`getBoundingClientRect`, relative à chaque
conteneur) - jamais une structure DOM interne, qui peut légitimement différer entre les deux moteurs
tant que le RENDU final concorde.

**A immédiatement trouvé un vrai bug dès son premier lancement** (cf. `dev-tests/BUGS.md` Bug 4,
corrigé le même jour) : `.reader-content ul`/`ol` n'avait pas l'équivalent du `padding-left: 1.4em` de
`.tiptap` - une liste imbriquée rendait visiblement plus indentée en mode Lecture qu'en éditeur (l'écart
se cumulait par niveau). `readModeFidelity` est maintenant 100% vert.

## Étage 3 (export DOCX) — `scenarios-docx.js` + `scenarios-docx-images.js` : on OUVRE le fichier généré

Même principe que `h.extractPdfGroundTruth` pour le PDF, et pour exactement la même raison :
**un objet `docx.Paragraph`/`docx.ImageRun` correct en mémoire ne prouve rien sur le fichier que Word
ouvrira.** Entre les deux il y a la sérialisation de `docx.js`, qui a déjà introduit deux vrais défauts
dans ce projet — un compteur `wp:docPr` repartant à `1` à chaque `ImageRun` (Word refusait d'ouvrir le
fichier), et un `<w:tblGrid>` à 100 twips/colonne quand `columnWidths` est absent — tous deux
**invisibles avant d'ouvrir le paquet**.

`h.exportDocxParts(html, headerFooterData, marginsTwip)` génère le `.docx`, le dézippe (JSZip, via
`PdfExport.ensurePdfLibsLoaded`) et rend chaque partie XML parsée. Les accesseurs à utiliser ensuite :

| Helper | Ce qu'il rend |
|---|---|
| `h.docxDrawings(xmlDoc)` | Une entrée par `<w:drawing>`, dans l'ordre : `kind` (`'inline'` / `'anchor'`), `x`/`y` **en pt** depuis le repère `relativeFrom`, `alignH`/`alignV` quand Word positionne par mot-clé, `widthPt`/`heightPt`, `behindDoc`, `wrap`/`wrapSide`, `docPrId` |
| `h.docxParagraphs(xmlDoc)` | Une entrée par `<w:p>` (y compris dans les tableaux) : `text`, `runs[]` (gras/italique/couleur/taille/police…), `style`, `align`, `numId`/`ilvl`, `indentLeft`, `pageBreakBefore` |
| `h.docxTables(xmlDoc)` | Les `<w:tbl>` de premier niveau avec leur `<w:tblGrid>` réel et la largeur de chaque cellule — de quoi vérifier la cohérence `tblGrid` ↔ `tcW`, celle que Word contrôle |
| `h.docxSectionProps(xmlDoc)` | `<w:sectPr>` : taille de page, `pgMar`, `titlePg`, références en-tête/pied |
| `h.docxNumbering(parts.part('word/numbering.xml'))` | `numId` → `{ format, text, start, indentLeft }` du niveau 0 |
| `h.docxFootnotes(...)`, `h.docxFields(...)` | Notes de bas de page réelles ; champs Word (`PAGE`, `NUMPAGES`) |

`parts.names` liste les parties du paquet, `parts.part(nom)` en parse une (`word/header1.xml`…),
`parts.mediaSizes` donne les octets embarqués dans `word/media/` (dédoublonnage des images).

**Pourquoi une suite `docxImages` séparée** : tout l'historique de `js/docx-export.js` est fait de
corrections de POSITION d'image (habillage gauche/droite ignoré, image plaquée en haut du paragraphe,
image enfant direct du document qui disparaissait, `wp:docPr` dupliqué). `docxImages` rejoue donc la
même matrice `contexte × alignement × type d'ancre` que `pdfGroundTruth`, construite par de vrais clics
dans l'éditeur, et vérifie que `<wp:anchor>` tombe sur `marge de page + grille page capturée` — plus
deux scénarios de parité qui comparent directement la position DOCX à la position **réellement peinte**
dans le PDF du même document.

**A immédiatement trouvé un vrai bug dès son premier lancement** : une image `data-align="center"`
sortait collée à gauche dans le `.docx` alors que l'éditeur, le mode Lecture et le PDF la centrent tous
les trois. Cause : `alignment` est une propriété de **paragraphe** en OOXML (`w:jc`), jamais de run —
l'image doit donc occuper son propre `<w:p>` centré (cf. `splitRunsAtFloatedImages`, `js/docx-export.js`).

## Vérification transversale — marges de page et largeur de colonne mm (`scenarios-pagelayout.js`)

Les marges de page (onglet Réglages, `js/page-layout.js`) et la largeur de colonne en mm d'une zone
2-colonnes (poignée mm, `js/editor-nodes.js`) ont la particularité de traverser TOUS les étages du
produit d'un coup : l'aperçu A4 (CSS), la pagination affichée à l'écran (`js/header-footer-preview.js`
ET `js/reader-mode.js`, deux moteurs distincts), l'export PDF (`js/pdf-export.js`) et l'export DOCX
(`js/docx-export.js`). Livrées les 15-16/09 mais jamais validées par Antoine ni couvertes par un test,
elles ont été éprouvées le 2026-09-18 en comparant systématiquement la MÊME valeur aux 4 endroits, pas
seulement en vérifiant qu'un réglage produit un effet quelque part - c'est cette comparaison croisée qui
a fait sortir 6 défauts d'un coup, chacun invisible en lecture de code isolée d'un seul fichier.

**A immédiatement trouvé 6 défauts réels dès son premier lancement** (10/12 scénarios rouges avant
correctif, cf. commit `080842b`) :

- La pagination affichée codait `37.33px` (28pt) et `719.04px` en dur : elle ignorait purement et
  simplement les marges du modèle. Plus grave, `computePageGridPosition`
  (`js/header-footer-preview.js`) ancre les images en calque sur cette même grille - l'export plaçait
  donc une image sur une autre page que l'éditeur. Testé par `margins_screen_pagination_follows_margins`.
- `Editor.refreshLayout()` dispatchait une transaction vide, qui ne déclenche NI `onUpdate` NI la
  moindre réconciliation de NodeView dans ProseMirror : changer une marge ne redessinait rien tant
  qu'aucune autre action ne le faisait par ailleurs. Testé par `cols_mm_survives_margin_change`.
- Aucune borne haute sur les marges : deux marges opposées démesurées donnaient une largeur de
  contenu NÉGATIVE (zone de saisie effondrée, largeurs négatives à l'export). Testé par
  `margins_clamped_to_printable_page` et `margins_settings_field_shows_applied_value` (le champ
  Réglages doit réafficher la valeur réellement retenue, pas la saisie refusée).
- Une colonne réglée à 60mm mesurait 57.7mm à l'écran et dans le PDF (la conversion mm→% prenait la
  largeur de PAGE pour base, alors que le % s'applique à la boîte de contenu de la zone, amputée de
  22px de padding/bordure hérités des styles V1) mais 60mm dans le DOCX - trois moteurs, deux valeurs.
  Testé par `cols_mm_rendered_width_is_exact`, `cols_mm_editor_matches_reader`,
  `cols_mm_pdf_matches_screen`.
- Le DOCX ne réservait pas la gouttière de 16px entre les deux colonnes : colonne droite à 90mm là où
  l'écran et le PDF rendent 85.8mm, colonnes collées dans Word. Testé par `cols_mm_docx_matches_screen`.
- Le popover "mm" annonçait une largeur de colonne droite qui ne tenait pas compte de cette même
  gouttière. Testé par `cols_mm_popover_announces_real_widths`.

Les marges elles-mêmes (padding de page, `<w:pgMar>`/`pageMargins` pdfmake) sont testées par
`margins_preview_padding`, `margins_pdf_page_margins`, `margins_docx_page_margins`.

**Piège de mesure propre à cette suite** : comparer des mm entre 4 moteurs de rendu différents
(navigateur, pdfmake, docx.js) accumule de l'arrondi à chaque conversion - les tolérances des
assertions (`near(a, b, tol)`, en général 0.5 à 1mm) sont volontairement plus larges que pour une
comparaison écran/écran (`compareEditorReaderPosition` tolère 2px). Resserrer une tolérance sans
mesurer d'abord l'écart réel produit des faux rouges.

## Pourquoi `_test-harness.html` n'est pas commité

Ce fichier est une copie de `index.html` avec le script de l'API Grist
réelle remplacé par `grist-stub.js` (cf. ce fichier pour le détail du stub —
un `window.grist` minimal qui suffit à ce que `main.js:init()` se termine
sans exception, avec un éditeur vide/sans modèle). Il est **régénéré à la
demande** par `generate-harness.sh` plutôt que commité, pour ne jamais
risquer qu'une version périmée dérive silencieusement de `index.html`
(ex. un nouveau `<script>` ajouté à la vraie page, oublié dans une copie
figée). Toujours relancer `generate-harness.sh` après un changement des
balises `<script>`/`<link>` de `index.html`.

## Architecture

- `grist-stub.js` — `window.grist` minimal (voir ci-dessus). `js/grist-api.js`
  n'est PAS modifié, il tourne tel quel contre ce stub.
- `helpers.js` (`window.TestHelpers`) — pilote l'éditeur comme un VRAI
  utilisateur : clics réels sur les boutons toolbar (avec coordonnées
  `clientX`/`clientY` réelles quand la cible est un nœud ProseMirror
  sélectionnable — indispensable, cf. piège documenté dans le fichier),
  frappe clavier (`execCommand('insertText')`), glisser-déposer réel pour les
  poignées de redimensionnement/les grips, et interception de
  `window.pdfMake.createPdf` pour récupérer le `docDefinition` complet
  (positions, `absolutePosition`, alignement, tailles...) sans jamais
  déclencher de téléchargement navigateur.
- `runner.js` (`window.TestRunner`) — exécute une liste de scénarios,
  capture toute exception (jamais silencieusement avalée), produit un
  rapport texte.
- `scenarios-*.js` — un fichier par domaine fonctionnel, chacun enregistre
  ses cas dans `window.EditorTestSuites.<nom>`.
- `BUGS.md` — liste des anomalies RÉELLES trouvées en construisant/passant
  cette suite (pas des échecs de harnais - ceux-là ont été corrigés au fur
  et à mesure, cf. commentaires dans `helpers.js`), avec repro précis pour
  vérification en conditions réelles avant correction.

## Pièges de test déjà rencontrés (évités dans `helpers.js`, à connaître avant d'écrire un nouveau scénario)

- **`execCommand('insertText')`/changement de sélection puis lecture
  immédiate** : ProseMirror synchronise son propre modèle de façon
  asynchrone après une mutation DOM "externe" (pas une de ses propres
  transactions) - toujours attendre un court délai après (`typeText`/
  `selectAllInEditor`/`focusAtEnd` le font déjà en interne).
- **Cliquer un nœud atome (image, badge) sans `clientX`/`clientY`** :
  ProseMirror résout la position cliquée via `posAtCoords()`, qui a besoin
  de vraies coordonnées - un clic "nu" ne sélectionne rien. Toujours passer
  par `TestHelpers.selectAtomNode(el)`.
- **`Editor.getHTML()` (HTML sérialisé) ≠ DOM vivant** : certains attributs
  n'existent que dans un des deux (ex. `data-type="taskItem"` présent dans
  `getHTML()` mais absent du DOM vivant rendu par la NodeView). Toujours
  vérifier lequel des deux un sélecteur doit cibler.
- **En-tête/pied dans le PDF** : vivent dans `docDefinition.header`/`.footer`
  (des FONCTIONS `(currentPage, pageCount) => contenu`), jamais dans
  `docDefinition.content` (réservé au corps). Les appeler soi-même avec
  `(1, 1)` pour en inspecter le contenu.
- **Un scénario qui sélectionne un objet (image, ouvre une toolbar
  flottante) doit laisser le temps à cet état de se stabiliser avant le
  scénario SUIVANT** - `resetEditor()` inclut déjà un délai de 300ms et sort
  d'un éventuel mode d'édition en-tête/pied resté actif, spécifiquement pour
  ça.
- **"Aperçu format A4" (`.a4-preview`) n'est PAS synchronisé par défaut dans
  ce harnais** : la case `#v2-toggle-a4-preview` est cochée par défaut dans
  `index.html`, mais `main.js:wireA4PreviewToggle()` (qui applique cet état
  au chargement) n'est jamais atteint ici (`main.js:init()` s'arrête plus tôt
  dans l'environnement stubbé, cf. piège "Local testing scope" ci-dessous) -
  toute mesure pixel-exacte dépendant de la largeur réelle de page (calque
  d'image notamment) doit poser la classe à la main :
  `document.getElementById('editor-container').classList.add('a4-preview')`
  en tout début de scénario, sinon la largeur réelle de `.tiptap` est celle,
  arbitraire, de la fenêtre du navigateur de test - pas celle du PDF. Un
  cluster entier de scénarios en-tête/pied/saut-de-page dépend de cette même
  classe pour trouver leurs zones DOM (`.v2-hf-zone` etc.) - si un nouveau
  scénario dans ce domaine échoue avec "zone introuvable" sans rapport
  apparent avec son propre changement, vérifier ceci en premier.
- **Le harnais local n'atteint jamais certains câblages `main.js`** (cf.
  mémoire `project_local_testing_scope`) - `init()` y lève une exception
  avant certains `wireXxx()`, silencieusement. `.a4-preview` (ci-dessus) en
  est un exemple concret ; si un nouveau bouton top-toolbar ne réagit à rien
  en test alors qu'il fonctionne en vrai Grist, soupçonner ceci avant un bug
  applicatif.
- **Une suite peut laisser une fuite d'état pour la suivante MÊME sans lien
  fonctionnel apparent** (ex. `scenarios-chips.js` fait parfois échouer
  `pdffid_layered_image_absolute_position` juste après, alors que rien dans
  les puces ne touche à l'image top-level testée) - confirmé non lié à un
  changement de code (repro identique sur une page vierge, juste dans cet
  ordre précis). Cause exacte non élucidée à ce jour ; si un scénario échoue
  seulement en suite complète mais passe seul, ne pas assumer une régression
  du code avant d'avoir vérifié qu'il passe bien seul.

## Bugs de fond découverts en construisant/étendant cette suite

- `Editor.setHTML()` ne vidait JAMAIS l'historique annuler/rétablir de TipTap
  - **corrigé** (nouvelle extension `createClearHistoryExtension`,
  `js/editor.js`, TipTap v3 n'exposant plus de commande `clearHistory`
  officielle). Testé par
  `scenarios-formatting.js:fmt_undo_history_not_cleared_by_sethtml`.
- Une image "au cœur du texte" sans alignement gauche/droite (par défaut ou
  centrée) était toujours repoussée en fin de texte de son paragraphe dans
  l'export PDF, quelle que soit sa position réelle dans le document -
  **corrigé** (l'utilisateur avait confirmé rencontrer souvent ce type de
  souci, pas encore revérifié en conditions réelles après ce correctif
  précis). `blockFrom` (`js/pdf-export.js`) découpe maintenant un tel
  paragraphe en plusieurs
  blocs pdfmake successifs respectant l'ordre réel texte/image, au lieu de
  concaténer tout le texte puis pousser les images après. Testé par
  `scenarios-pdf-fidelity.js:pdffid_inline_image_position_in_paragraph` - voir
  `BUGS.md` (Bug 3) pour le détail. Non couvert : une telle image DANS une
  cellule de tableau garde l'ancien comportement (chemin de code séparé).
- Marges de page et largeur de colonne mm (`js/page-layout.js`,
  `js/editor-nodes.js`) : 6 défauts distincts, tous **corrigés** (commit
  `080842b`) - la pagination affichée ignorait les marges du modèle (37.33px
  codé en dur), `Editor.refreshLayout()` ne redessinait rien, aucune borne ne
  protégeait la largeur de contenu (négative reproduite), une colonne réglée
  en mm ne rendait pas la même largeur à l'écran/PDF/DOCX, la gouttière de
  16px n'était pas réservée dans le DOCX. Voir la section dédiée
  « Vérification transversale — marges de page et largeur de colonne mm »
  ci-dessus pour le détail. Testé par `scenarios-pagelayout.js` (12 scénarios).
