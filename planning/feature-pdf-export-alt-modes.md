# Fiabiliser les modes d'export PDF non-vectoriels

**Priorité 4 — l'utilisateur a explicitement autorisé à commencer ce chantier dès la session du
2026-09-14 si le temps le permettait ("tu peux déjà travailler si tu veux").** Isolé dans son propre
fichier `js/pdf-export-alt.js`, déjà découplé du moteur vectoriel — donc un chantier sur ce fichier
n'a aucun risque de régresser l'export vectoriel (seul mode actuellement actif dans l'UI publiée).

**Statut au 2026-09-14 soir** : ce document est une analyse/plan, écrit dans le respect de la consigne
"pas de nouveau fix ce soir" (le fichier n'a pas été modifié). Comme ces 3 modes sont déjà **désactivés
dans l'UI** (`index.html`, boutons grisés), toute future implémentation ici peut se faire, être testée,
et même être commitée SANS jamais affecter le comportement vu par un utilisateur de l'Alpha — seule la
réactivation finale des boutons dans `index.html` rendrait le travail visible, et peut donc être
décidée séparément, une fois chaque mode jugé fiable.

## État actuel des 3 modes (lu dans `js/pdf-export-alt.js`, 82 lignes)

### 1. Impression navigateur (`exportViaBrowserPrint`)

Génère un `<iframe>` caché contenant le HTML résolu + les VRAIES feuilles de style du projet
(relinkées, pas recopiées), attend le chargement images+CSS, puis déclenche `window.print()`. Choisi
spécifiquement car "immunisé contre les images bloquées par CORS à l'export" (commentaire en tête de
fonction) — contrairement au mode raster (§2), qui utilise `html2canvas` et EST sensible à CORS.

**Limites connues/risques à vérifier avant de réactiver** :
- Dépend de l'utilisateur pour finaliser l'impression (choisir "Enregistrer en PDF" dans la boîte de
  dialogue native) — ce n'est pas un export "silencieux" comme le mode vectoriel, à bien clarifier dans
  l'UI si réactivé (libellé actuel "Impr. navigateur" semble déjà l'indiquer, mais vérifier la clarté
  perçue par un utilisateur non prévenu).
- Le timeout de secours à 4000 ms (ligne 55) pourrait ne pas suffire sur un document très image-lourd
  ou une connexion lente — à tester avec le modèle `vitrine-fonctionnalites` (le plus dense de la
  galerie) avant de considérer ce mode fiable.
- Pagination : repose sur `page-break-after` CSS natif du navigateur pour `.page-break-marker` — à
  vérifier que les sauts de page AUTOMATIQUES (pas seulement les sauts manuels) tombent au même endroit
  qu'en export vectoriel (le moteur d'impression du navigateur a son propre algorithme de pagination,
  indépendant de `computePageBreaks`/pdfmake) — probable point de divergence si vérifié.
- `@page { margin: 18mm }` (ligne 36) — à comparer avec `PAGE_MARGIN_PT = 28pt` du moteur vectoriel
  (`js/pdf-export.js`) : 18mm ≈ 51pt, **valeur différente** de la marge vectorielle. Si l'objectif est
  la cohérence visuelle entre modes d'export, cette valeur devrait probablement être alignée
  (28pt ≈ 9.87mm) — à trancher : est-ce voulu (une marge d'impression "standard" différente) ou un
  oubli de synchronisation ?

### 2. Raster basse/ultra HD (`buildRasterContainerAndOptions` + `html2pdf.js`)

Rend le HTML résolu dans un conteneur détaché, capture en image via `html2canvas`, assemble en PDF via
`jsPDF` (le tout piloté par `html2pdf.js`, déjà chargé paresseusement comme le reste, cf. audit
performance §1.4). Le commentaire ligne 65 note déjà une limite connue : "le sommaire n'est pas résolu
ici : html2canvas n'a aucune notion de page" — donc les numéros de page réels du sommaire (fonctionnalité
existante en vectoriel) ne peuvent pas fonctionner dans ce mode par construction, pas par bug.

**Limites connues/risques à vérifier avant de réactiver** :
- **CORS** : contrairement au mode impression, `html2canvas` échoue silencieusement ou rend une zone
  vide pour une image chargée depuis un domaine sans en-têtes CORS permissifs — à re-tester avec le
  modèle vitrine (images Lorem Picsum, déjà vérifiées "CORS-safe" pour le vectoriel selon
  `PROTOCOLE_TEST_MANUEL.md` §9, mais le mode vectoriel télécharge et ré-encode l'image lui-même
  — `inlineEditorImagesAsDataUri` — alors qu'`html2canvas` la charge différemment ; ne pas supposer que
  "CORS-safe pour le vectoriel" implique "CORS-safe pour le raster").
- **Qualité/poids** : `scale: 6` pour "Ultra HD" (ligne 6) peut produire un PDF volumineux pour un
  document long (chaque page = une image bitmap à haute résolution) — mesurer la taille de fichier
  réelle sur un document de plusieurs pages avant de qualifier ce mode de prêt.
- **Fidélité de mise en page** : `html2canvas` a ses propres limites connues de rendu CSS (certaines
  propriétés modernes mal supportées) — un audit visuel comparatif (capture d'écran du DOM réel vs. le
  rendu `html2canvas`) sur chaque type de contenu (tableau, 2-colonnes, image en calque) serait le test
  le plus informatif avant de lever le drapeau "fiable".
- `pagebreak: { mode: ['css', 'legacy'] }` (ligne 77) — comme pour le mode impression, vérifier que les
  sauts de page tombent aux mêmes endroits qu'en vectoriel (risque de divergence similaire).

## Approche de travail recommandée

1. **Instrumenter avant de corriger** : construire un test manuel (ou un script dev-tests, si
   automatisable sans trop de fragilité — `html2pdf`/`window.print()` sont plus difficiles à piloter
   qu'un export vectoriel silencieux) qui génère les 3 sorties (vectoriel + impression + raster) pour
   le MÊME modèle dense (`vitrine-fonctionnalites`) et les compare visuellement page par page.
2. Traiter chaque limite listée ci-dessus comme un ticket séparé plutôt qu'un chantier monolithique —
   elles n'ont pas la même cause ni le même risque (CORS vs. pagination vs. cohérence de marge).
3. Ne réactiver un mode dans l'UI (`index.html`, retirer `disabled`) qu'une fois son propre lot de
   limites levé ou explicitement accepté comme limitation documentée (ex. "le sommaire n'a pas de vrais
   numéros de page en mode raster" peut être un compromis acceptable si clairement indiqué à
   l'utilisateur au moment du choix de qualité, plutôt qu'un blocage à la réactivation).

## Plan de test

Pas de suite `dev-tests/` dédiée aujourd'hui pour ces 2 modes (contrairement au vectoriel) — à
envisager une fois le premier des deux modes stabilisé, en s'inspirant de la méthodologie déjà
éprouvée cette session (`extractPdfGroundTruth` pour le vectoriel n'est pas directement réutilisable
ici puisque `html2canvas`/`window.print()` ne produisent pas un PDF vectoriel analysable par pdf.js de
la même façon utile — pour le mode raster, une comparaison PIXEL de la page rendue serait la
vérité-terrain la plus proche, à construire au moment venu).
