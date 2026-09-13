# Fonctionnalités diverses — édition, sortie PDF, organisation

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
