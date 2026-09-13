# Nouveaux blocs de contenu — Citation, Légende, Bloc de code, Bloc de signature, Encadré/remarque

**Priorité 2.** Regroupés car ils partagent le même patron d'implémentation dans ce projet : soit un
nœud TipTap standard déjà supporté mais sans accès UI, soit un nouveau nœud personnalisé (même famille
que les nœuds déjà présents dans `js/editor-nodes.js` : image, zone 2-colonnes, saut de page…), plus
son rendu en mode Lecture (CSS `.reader-content`) et son routage dans `js/pdf-export.js:blockFrom`.

## Citation — clarification nécessaire avant tout travail

**Ce qui existe déjà, vérifié dans le code** : le blockquote HTML standard est déjà pleinement
supporté — style éditeur ET lecture (`css/editor-v2.css:84,93`, valeurs identiques des deux côtés,
padding-left/bordure gauche/italique), routage PDF déjà géré (`js/pdf-export.js:1331` liste
`blockquote` parmi les tags reconnus par la mesure d'indentation ; `blockFrom` a une branche dédiée
`tag === 'BLOCKQUOTE'` qui pose `italics: true` et une marge spécifique), et les tests d'imbrication le
couvrent déjà (`nest_blockquote_inside_twocolumns`, `dev-tests/scenarios-nesting.js`).

**Ce qui manque, confirmé par recherche exhaustive** : **aucun bouton toolbar** nulle part dans
`index.html`/`js/main-toolbar.js` ne permet d'insérer un blockquote — la seule voie d'accès serait le
raccourci clavier natif de TipTap StarterKit (`Ctrl+Shift+B` ou la règle d'entrée Markdown `> ` en
début de ligne, si StarterKit les a activés par défaut — **à vérifier**), totalement invisible pour un
utilisateur qui ne les connaît pas.

**Lecture la plus probable de la demande "Citation (le blockquote retiré)"** : le bouton d'accès a
existé puis a été retiré (volontairement ou par oubli lors d'un refactor de toolbar), et la demande est
de le RÉINTRODUIRE (avec le libellé "Citation" plutôt que "Blockquote", plus naturel en français pour
un document). **Ne pas supposer** : redemander confirmation à l'utilisateur avant de commencer, mais
si c'est bien ça, c'est l'item le moins coûteux de tout ce document (un bouton toolbar + `editor.chain()
.focus().toggleBlockquote().run()`, sur le modèle exact des boutons déjà existants dans
`js/main-toolbar.js`) — vérifier aussi si un style visuel "façon citation" (guillemets décoratifs ?)
est attendu en plus du style actuel (bordure gauche + italique), ou si le style actuel suffit déjà.

## Légende (texte italique/petit sous une image ou un tableau)

- Positionnement demandé par l'utilisateur : **sur la toolbar image** — donc accessible depuis la
  barre d'outils flottante d'une image sélectionnée (`js/floating-toolbars.js`), pas depuis la toolbar
  principale. Pour un tableau, prévoir un point d'entrée équivalent (bouton dédié quand une cellule/le
  tableau est sélectionné, ou une action globale "insérer une légende après ce bloc").
- Conception : pas nécessairement un nouveau NŒUD TipTap — pourrait être un simple paragraphe avec un
  attribut/classe distinctif (`data-caption="true"`), stylé en petit/italique/gris via CSS (dans
  `.tiptap`ET `.reader-content`, ne pas répéter l'erreur trouvée ce soir dans Bug 4 en oubliant l'un des
  deux). Le bouton toolbar image insère ce paragraphe juste après l'image (ou son wrapper), avec le
  curseur positionné dedans pour taper directement.
- PDF : `blockFrom` doit reconnaître l'attribut/la classe et appliquer le style (taille réduite,
  italique, couleur atténuée) au bloc pdfmake correspondant — cas simple, même famille que la gestion
  déjà existante de `data-align`.

## Bloc de code (police monospace, fond distinct)

- Nœud TipTap standard `CodeBlock` (fait partie de StarterKit, comme Blockquote) — vérifier s'il est
  déjà activé dans la configuration StarterKit du projet (`js/editor.js`, configuration passée à
  `StarterKit.configure(...)`) avant de supposer qu'il faut l'ajouter de zéro. Si déjà activé côté
  moteur mais sans bouton toolbar (comme Citation ci-dessus), le travail se réduit à : bouton toolbar +
  CSS (`.tiptap pre`/`.reader-content pre` : `font-family: monospace`, fond gris clair, padding) +
  routage PDF (`blockFrom`, nouvelle branche `tag === 'PRE'` posant une police monospace pdfmake — le
  projet embarque déjà Cousine, une police monospace, cf. `js/pdf-fonts-extra.js`/README section
  Polices : **réutiliser cette police déjà embarquée plutôt que d'en ajouter une nouvelle**).

## Bloc de signature (ligne + espace nom/date)

**Recoupe directement l'item "Emplacement de signature" de la liste affinée de l'utilisateur — traité
ici comme UNE SEULE fonctionnalité, pas deux.**

- Pertinence produit forte : l'app cible explicitement contrats/courriers (modèle "Contrat de
  prestation de services" déjà dans la galerie).
- Conception minimale : un bloc pré-formaté (probablement inséré via un bouton toolbar dédié, ou un
  modèle de galerie mis à jour pour l'inclure) avec une ligne horizontale (`<hr>` ou bordure) et deux
  zones de texte libre en dessous (typiquement "Nom" à gauche, "Date" à droite, via une mini zone
  2-colonnes — **réutiliser le nœud 2-colonnes déjà existant** plutôt que d'inventer une nouvelle
  structure de mise en page).
- **Lien avec "chips intelligents réutilisables"** (`feature-reusable-smart-chips.md`) : la demande
  utilisateur mentionne aussi "Signature le ... à ... par ... en qualité de ..." — un texte-modèle
  avec des `#Variable`/chips déjà insérées (date du jour via le chip existant, nom/qualité via des
  `#Variable` de la table liée). Le "bloc de signature" le plus utile serait donc un **fragment de
  modèle prérempli** (texte + variables déjà insérées), pas juste une mise en page vide — envisager de
  le proposer comme un item de la galerie de modèles ou un "insérer un fragment" plutôt qu'un nouveau
  type de nœud à proprement parler. À trancher selon ce qui est le plus simple à maintenir.
- Sans signature électronique réelle pour l'instant (explicitement noté par l'utilisateur) — un simple
  espace visuel, pas un mécanisme de signature juridiquement valable.

## Encadré/remarque façon Notion ("Note", "Attention", "Important")

- Le plus proche d'un "vrai" nouveau nœud TipTap personnalisé parmi ce lot — suivre le patron déjà
  établi dans `js/editor-nodes.js` pour un nœud de type bloc avec attributs (cf. la zone 2-colonnes ou
  le nœud image pour la structure générale : `Node.create({ name, group: 'block', ... addAttributes()
  ... renderHTML() ... addNodeView() ... })`).
- Attributs : `type` (note/attention/important, ou une liste de préréglages), `color` (l'utilisateur
  demande explicitement la couleur ET l'icône modifiables), `icon`.
- UI : bouton toolbar "Encadré" → insère le bloc avec le préréglage par défaut, puis un petit sélecteur
  (couleur + icône) visible quand le bloc est sélectionné — même patron que le sélecteur de couleur
  déjà existant ailleurs dans la toolbar (`main-toolbar.js`).
- Rendu : un bloc avec fond coloré (teinte pâle de la couleur choisie), bordure gauche ou icône dans un
  coin, en éditeur ET en lecture (CSS symétrique, ne pas répéter Bug 4) — pdfmake supporte nativement un
  `table` à une cellule avec `fillColor` pour simuler un encadré coloré (déjà le genre de technique
  utilisée ailleurs dans `pdf-export.js` pour d'autres mises en forme, à vérifier/confirmer en lisant le
  fichier avant de commencer) ; l'icône peut être un caractère Unicode/emoji simple plutôt qu'une vraie
  image, pour éviter toute complexité d'embarquement d'image supplémentaire dans le PDF.

## Plan de test commun

Pour chacun des 5 blocs : un test d'insertion (éditeur), un test de rendu 3 étages (éditeur/lecture/
PDF) sur le modèle déjà établi cette session (`compareEditorReaderPosition`/ground truth PDF), et un
test d'imbrication dans un tableau/une zone 2-colonnes (suivant le patron de
`dev-tests/scenarios-nesting.js`) — l'expérience du projet montre que l'imbrication est systématiquement
le point où un nouveau type de bloc révèle des bugs qu'un test isolé ne voit pas.
