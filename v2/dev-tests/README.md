# Suite de tests V2 — éditeur + export PDF vectoriel

Suite de tests automatisés (façon "tests unitaires", au sens : chaque scénario
isole une fonctionnalité précise et renvoie un verdict programmatique)
couvrant l'éditeur V2 (TipTap/ProseMirror) et l'export PDF **vectoriel
uniquement** (qualité "native" — les autres qualités d'export, impression
navigateur/basse/ultra HD, ne sont pas couvertes). Portée volontaire :
**tout sauf la résolution de `#Variable`/pièces jointes Grist**, qui a
besoin d'un vrai document Grist et ne peut pas être testée en local (cf.
mémoire projet `feedback_testing_workflow`). Les chips Date/Heure/Note de
bas de page, eux, sont testés en entier (aucun appel Grist requis).

Conçue pour être **rejouée régulièrement** (régression après une future
modification), pas juste une fois.

## Démarrage rapide

```bash
# Depuis la racine du dépôt
python -m http.server 8843
```

```bash
bash v2/dev-tests/generate-harness.sh   # régénère v2/_test-harness.html depuis v2/index.html
```

Ouvrir `http://localhost:8843/v2/_test-harness.html` dans un navigateur,
puis dans la console :

```js
async function loadFresh(path) { const r = await fetch(path, {cache:'no-store'}); eval(await r.text()); }
window.EditorTestSuites = {};
const files = [
  'helpers', 'runner',
  'scenarios-formatting', 'scenarios-lists', 'scenarios-tables',
  'scenarios-twocolumns', 'scenarios-nesting', 'scenarios-images',
  'scenarios-pagebreak-toc', 'scenarios-headerfooter', 'scenarios-chips',
  'scenarios-pdf-fidelity',
];
for (const f of files) await loadFresh('/v2/dev-tests/' + f + '.js');
const results = await TestRunner.runAll(EditorTestSuites);
console.log(TestRunner.report(results));
results.filter(r => !r.pass);   // ne garder que les échecs, avec leurs `notes` diagnostiques
```

Toujours `{ cache: 'no-store' }` en rechargeant un fichier après une
modification — le cache navigateur sur du JS servi en local produit sinon
de faux négatifs/positifs (piège déjà rencontré plusieurs fois ce projet,
cf. mémoire `project_browser_cache_trap`).

**Lancer un seul groupe** (plus rapide en cours de développement) :
```js
const r = await TestRunner.runGroup('images', EditorTestSuites.images);
console.log(TestRunner.report(r));
```

**Lancer TOUS les groupes d'un coup** peut dépasser le budget de temps de
certains outils d'exécution JS distants (~45s) — dans ce cas, lancer par
lots de 2-3 groupes (voir l'historique de cette session pour l'exemple).

## Pourquoi `v2/_test-harness.html` n'est pas commité

Ce fichier est une copie de `v2/index.html` avec le script de l'API Grist
réelle remplacé par `grist-stub.js` (cf. ce fichier pour le détail du stub —
un `window.grist` minimal qui suffit à ce que `main.js:init()` se termine
sans exception, avec un éditeur vide/sans modèle). Il est **régénéré à la
demande** par `generate-harness.sh` plutôt que commité, pour ne jamais
risquer qu'une version périmée dérive silencieusement de `v2/index.html`
(ex. un nouveau `<script>` ajouté à la vraie page, oublié dans une copie
figée). Toujours relancer `generate-harness.sh` après un changement des
balises `<script>`/`<link>` de `v2/index.html`.

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

## Bugs de fond découverts en construisant/étendant cette suite

- `Editor.setHTML()` ne vidait JAMAIS l'historique annuler/rétablir de TipTap
  - **corrigé** (nouvelle extension `createClearHistoryExtension`,
  `v2/js/editor.js`, TipTap v3 n'exposant plus de commande `clearHistory`
  officielle). Testé par
  `scenarios-formatting.js:fmt_undo_history_not_cleared_by_sethtml`.
- Une image "au cœur du texte" sans alignement gauche/droite (par défaut ou
  centrée) est toujours repoussée en fin de texte de son paragraphe dans
  l'export PDF, quelle que soit sa position réelle dans le document -
  **pas encore corrigé**, en attente de confirmation en conditions réelles.
  Testé par
  `scenarios-pdf-fidelity.js:pdffid_inline_image_position_in_paragraph` - voir
  `BUGS.md` (Bug 3) pour le repro exact.
