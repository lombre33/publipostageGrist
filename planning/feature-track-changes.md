# Suivi des modifications (track changes)

**Jalon BETA**, roadmap RICE d'Antoine, famille « Édition collaborative », statut « à faire — rien
dans le dépôt ». Volontairement écarté du chantier Commentaires le 2026-09-14 : `js/comments.js:1-4`
documente explicitement qu'un commentaire « s'AJOUTE par-dessus le texte sans jamais le modifier »,
alors que le suivi des modifications « doit intercepter CHAQUE frappe/suppression/insertion dans tout
l'éditeur — un ordre de grandeur plus risqué à improviser ». Ce document ne propose pas encore une
conception arrêtée : il cadre les décisions structurantes à trancher avant de pouvoir chiffrer l'effort,
avec les faits techniques vérifiés qui les sous-tendent.

**Note sur `roadmap-consolidee.md`** : ce document (à `/mnt/project-files/`) ne liste pas la famille
« Édition collaborative » (ni « commentaires », déjà livré, ni « suivi des modifications ») dans ses
sections A-F — angle mort de la consolidation à signaler au fil dédié « Suivi de la roadmap », pas
corrigé ici pour éviter un conflit d'édition sur ce fichier partagé.

## Ce qui existe déjà et sur quoi ce chantier peut s'appuyer

- **TipTap 3.31.3 + ~30 paquets `prosemirror-*`**, chargés en ESM via l'import map de `index.html`,
  épinglés à des versions exactes (y compris via des URLs absolues réécrites) pour garantir qu'une
  seule instance de chaque paquet `prosemirror-*` circule dans le bundle — une régression passée
  (`RangeError: Adding different instances of a keyed plugin`) l'a déjà démontré. Toute nouvelle
  dépendance doit résoudre vers ces mêmes instances.
- **`prosemirror-changeset@2.4.1` est déjà présent dans l'import map** (résolu transitivement via
  `@tiptap/pm/changeset.mjs`), mais n'est importé nulle part dans le code applicatif aujourd'hui — sa
  version, déjà la bonne, ne pose donc aucun risque de double-instance si on l'utilise.
- **19 nœuds/marques custom** dans `js/editor-nodes.js` : `varBadge`, `pageNumberBadge`, `smartChip`,
  `footnoteRef`, `commentMark`, `fontSize`, `textColor`, `highlightColor`, `bulletStyle`,
  `orderedListStyle`, `taskListStyle`, `tabNavigation`, `clearHistory`, `twoColumnsColumn`,
  `twoColumnsZone`, `editorImage`, `pageBreak`, `headingNumberingConfig`, `toc` — chacun potentiellement
  concerné par le rendu ou l'ancrage du suivi.
- **Commentaires** (`js/comments.js`) : le patron d'architecture le plus proche. Ancrage
  (`commentMark`, marque ProseMirror, `excludes: ''` pour superposition avec d'autres marques) DANS le
  document ; contenu du fil dans une table Grist compagnon (`Publipostage_Commentaires`), lié par un
  identifiant. `Comments.findMarkRanges()` retrouve les fils en parcourant `doc.descendants()` du
  document COURANT — donc dépendant d'une marque encore présente dans le document vivant.
- **Auto-save** (`js/main.js`) : `autosaveTick()` (js/main.js:345-377) toutes les 2500 ms
  (`AUTOSAVE_INTERVAL_MS`, js/main.js:285), désactivable par l'utilisateur (drapeau localStorage
  `pp_autosave_enabled`, js/main.js:346) — désactivé, la fonction sort immédiatement, **sans aucune
  détection de conflit**. Sinon, relit **toute** la table `Publipostage_Modeles` (`Templates.loadAll()`)
  à chaque tick et compare par égalité stricte (`!==`) le `dateModif` fraîchement relu à la dernière
  valeur connue (`autosaveLastKnownDateModif`, js/main.js:356) ; en cas d'écart, se fige et affiche un
  bandeau **à un seul bouton** (« Recharger la dernière version ») — pas de choix « enregistrer quand
  même » à ce stade (correction du 2026-09-19 : la version précédente de cette section décrivait à tort
  un bandeau à deux choix). Aucune fusion automatique — Grist ne fournit pas de compare-and-swap sur
  `UpdateRecord`.
- **Le bouton « Enregistrer » manuel (`onSave`, js/main.js:223-254) ne vérifie JAMAIS de conflit** —
  bandeau affiché ou non, auto-save activé ou non — et écrase **inconditionnellement 11 colonnes**
  de la ligne en un seul `UpdateRecord` (`Nom`, `Contenu`, `NomFichierPDF`, `DateModif`, `HeaderFooter`,
  `Margins`, `TypeModele`, `Destinataires`, `Cc`, `Cci`, `Objet`), pas seulement `Contenu` — objet
  construit dans `js/templates.js:251-257` (`Templates.save()`) ; `EstParDefaut` est une colonne à
  part, écrite séparément par `setDefault()` (`js/templates.js:204-214`), PAS dans ce même
  `UpdateRecord` (vérifié le 2026-09-19, corrige une lecture antérieure qui en comptait 10 et omettait
  `Objet`). C'est le véritable chemin d'écrasement silencieux, et — important pour le chiffrage du
  risque plus bas — il n'est **pas borné** à la fenêtre de 2,5 s de l'auto-save : un clic sur
  « Enregistrer » écrase à tout moment, y compris juste après un tick qui vient de détecter un conflit
  et d'afficher le bandeau.
- **Identification de l'utilisateur courant** (`GristAPI.getCurrentUserEmail()`, `js/grist-api.js`) :
  passe par une colonne à formule déclenchée dans une table interne dédiée
  (`Publipostage_UserProbe`), vidée après lecture — un aller-retour asynchrone, pas une valeur locale
  instantanée. **Il n'y a pas de présence temps réel** entre utilisateurs (pas de canal live, pas de
  curseurs d'autres utilisateurs) : deux utilisateurs éditent deux copies locales indépendantes du
  document jusqu'à ce que l'un des deux enregistre.

## Décision structurante n°1 — quelle UX de suivi ?

Deux produits différents se cachent sous « suivi des modifications », et le nom de l'exemple officiel
ProseMirror (`prosemirror.net/examples/track/`) prête à confusion : ce n'est **pas** un système
d'accepter/refuser façon Word. Son code source (`ProseMirror/website`, dépôt archivé, licence MIT)
implémente un système façon **« blame » Git** : chaque plage du document est associée au commit qui
l'a produite, une décoration affiche qui a écrit le texte sous le curseur, une action « revert » annule
UN commit précis. Aucun texte barré, aucun accepter/refuser par changement.

Le mode **« suggestion » façon Word/Google Docs** (insertions soulignées, suppressions barrées,
accepter/refuser par changement ou par lot) — ce qu'Antoine a probablement en tête — est un patron
communautaire construit par-dessus `prosemirror-changeset`, pas un exemple clé-en-main.

**Tranché par Antoine (2026-09-18) : mode suggestion façon Word/Google Docs.** Le reste de ce document
part de cette hypothèse.

## Décision structurante n°2 — extension payante Tiptap Pro ou solution DIY ?

Tiptap propose une extension officielle : `@tiptap-pro/extension-tracked-changes` (mode suggestion, 8
types de changement, accepter/refuser unitaire ou en masse, fusion des éditions continues,
intégration avec l'extension Comments Pro). **Mais elle est structurellement incompatible avec
l'architecture actuelle du widget** :

- Distribuée **exclusivement** via le registre npm privé de Tiptap (`registry.tiptap.dev`), jamais sur
  le registre npm public. Un `.npmrc` avec un jeton d'auth (`_authToken`) est requis pour la simple
  résolution du paquet.
- `esm.sh`, `cdnjs.cloudflare.com` et `cdn.jsdelivr.net` ne miroitent que le registre npm **public** —
  ils n'ont aucun mécanisme pour résoudre un paquet d'un registre privé arbitraire. Ce n'est pas un
  réglage à ajuster, c'est une impossibilité de fait tant que le paquet n'est pas sur le registre
  public.
- Même en imaginant un contournement, il faudrait embarquer le jeton Tiptap Pro dans le widget
  statique livré à Grist — un secret côté client, ce qui est exclu — ou ajouter une étape de build
  serveur qui télécharge puis republie le paquet en interne, ce qui romprait la politique actuelle
  « pas de build, pas de vendorisation ».
- Ajout non négligeable : add-on payant (montant non public), sans plan gratuit au-delà d'un essai.
- Point rassurant si le blocage de distribution était un jour levé : d'après la doc d'installation,
  l'extension fonctionne en local sans exiger de serveur de collaboration temps réel pour le suivi de
  base (confiance modérée — accès direct à tiptap.dev bloqué pendant cette recherche, à revérifier
  avant toute décision d'achat).

**Tranché par Antoine (2026-09-18) : on reste en DIY sur ProseMirror**, la politique « pas de build »
n'est pas rouverte pour cette fonctionnalité — pas d'extension Tiptap Pro.

### Pistes DIY évaluées

1. **`prosemirror-changeset@2.4.1` + patron communautaire** (déjà dans l'import map, MIT, zéro nouvelle
   dépendance `prosemirror-*`) : moteur de diff pur, sans UI ni plugin prêt à l'emploi. Fournit
   `ChangeSet.create(docBase)` / `changeset.addSteps(doc, stepMaps, meta)`, conçu pour un usage
   incrémental (ne rediffuse pas tout le document à chaque frappe) et « simplifie » automatiquement un
   couple frappe+backspace ou frappe+Ctrl+Z en « aucun changement ». Coût : écrire soi-même les
   marques/décorations de rendu, le stockage, et l'UI accepter/refuser.
2. **`@handlewithcare/prosemirror-suggest-changes`** (MIT, plugin ProseMirror pur, donc compatible
   Tiptap 3.x via `addProseMirrorPlugins()`) : peer-dependencies très permissives (`^1.0.0` sur
   `prosemirror-model/state/transform/view`), activité récente, maintenu par d'anciens contributeurs
   ProseMirror. Base technique probablement la plus solide, au prix d'écrire la couche d'intégration
   Tiptap (toolbar, activation, rendu).
3. **`tiptap-track-changes`** (npm, MIT, extension Tiptap native, 3 modes edit/suggest/view) :
   peer-dependencies compatibles Tiptap 3.x, mais projet petit, sans indicateur de traction, à auditer
   sérieusement avant tout usage vu le niveau de risque déjà identifié (interception de chaque frappe).
4. Écartés : `@manuscripts/track-changes-plugin` (archivé depuis 2023-12-04), `tiptap-track-change-extension`
   de chenyuncai (peer-deps figées sur une bêta de Tiptap 2, pas de compatibilité Tiptap 3.x connue).

*Recommandation* : partir de l'option 2 (`prosemirror-suggest-changes`) comme socle si un prototype
confirme sa compatibilité avec les nœuds custom du projet (section suivante), plutôt que réécrire tout
depuis `prosemirror-changeset` brut.

## Décision structurante n°3 — ancrage non-destructif ou suppression réelle + « fantôme » décoratif ?

Deux architectures possibles pour représenter une suppression en attente (numérotées séparément du
stockage Grist ci-dessous pour ne pas confondre les deux échelles de décision) :

- **Option 1 — suppression réelle + fantôme décoratif** (patron `prosemirror-changeset`) : le texte
  est réellement retiré de `docB` dès la frappe ; ce qui s'affiche barré à l'écran est une décoration
  « widget » reconstruite depuis un instantané figé `docA`. Risque concret identifié : si le passage
  supprimé portait un `commentMark`, la marque disparaît immédiatement du document COURANT — un fil de
  discussion devient orphelin (introuvable par `findMarkRanges()`, qui scanne `docB`) tant que la
  suppression n'est pas formellement acceptée, alors même que le texte barré reste visible à l'écran.
- **Option 2 — marque non-destructive** (`trackDeletion`, `excludes: ''` comme `commentMark`) : le
  texte supprimé reste physiquement présent dans le document, simplement marqué et stylé barré —
  cohérent avec l'architecture `commentMark` existante (pas d'orphelinage), mais oblige à faire
  connaître ce texte « fantôme mais présent » à **tous** les consommateurs du document : chaque
  commande d'édition, l'export PDF (`js/pdf-export.js`), l'export DOCX (`js/docx-export.js`), l'export
  mailto (`js/mailto-export.js`), le mode Lecture (3ᵉ moteur de rendu indépendant,
  `js/reader-mode.js`) et l'auto-save (le texte envoyé à Grist doit-il inclure les suppressions en
  attente ?).

Nœuds complexes (tableaux, images, sauts de page) : dans les deux architectures, la suppression d'un
nœud entier se traite comme un seul changement (pas de diff granulaire à l'intérieur). Mais afficher le
fantôme d'un tableau/image supprimé exige un chemin de rendu figé dédié pour éviter qu'un clic sur un
fantôme déclenche une action sur un nœud qui n'existe plus réellement à cette position — potentiellement
un cas à couvrir par nœud custom réellement supprimable en bloc (tableaux, images, sauts de page,
zones 2-colonnes ; les chips/badges de variable, atomiques et sans état interne, sont plus simples).

*Recommandation* : l'option 2 est plus cohérente avec l'existant (pas de régression sur les
commentaires) mais élargit la surface de patch à quasiment tous les modules de sortie — à évaluer par
prototype avant de trancher, pas une décision à figer sur dossier.

## Résultat du prototype (2026-09-18) — `prototypes/suivi-modifications.html`

Prototype jetable, pas relié à `index.html` ni à Grist, réutilisant le même import map TipTap 3.31.3
que l'app réelle. Intègre `@handlewithcare/prosemirror-suggest-changes@0.1.8` dans TipTap via son
hook d'extension `dispatchTransaction` (`ExtensionManager#dispatchTransaction` de `@tiptap/core`,
vérifié dans le code source réel) plutôt que via `editorProps.dispatchTransaction`, qui remplacerait
entièrement le pipeline réactif de Tiptap (`onUpdate` cesserait de se déclencher — vérifié dans le
code source : `editorProps.dispatchTransaction || this.dispatchTransaction.bind(this)`). Deux pièges
d'intégration déjà rencontrés et corrigés : Tiptap 3.x n'a **aucun export `default`** (`StarterKit`,
`Table`, etc. sont tous des exports nommés, contrairement à Tiptap 2.x) ; l'extension `Extension.create`
lit `editor` via `this.editor` dans le hook `dispatchTransaction`, pas dans l'objet argument
`{transaction, next}`.

**Confirmé, ce qui marche** : la lib implémente bien l'option 2 (marque non-destructive), pas l'option
1 — vérifié en tapant du texte (`<ins data-id="…">`) et en supprimant un mot (`<del data-id="…">` posé
sur `paragraphe`, le mot reste physiquement dans le HTML). `onUpdate` continue de se déclencher
normalement (réactivité Tiptap intacte). Les décorations (`suggestChanges()` fournit ses propres
`props.decorations`) fonctionnent sans toucher `editorProps.decorations`, donc sans risque de conflit
avec d'éventuelles décorations d'autres extensions de l'app réelle.

**Trois bugs trouvés en testant. Les trois sont corrigés dans le prototype — la suppression de bloc
entier a une vraie prise en charge depuis le 2026-09-19, plus seulement un refus sans plantage :**

1. **Suppression d'un nœud de bloc entier → plantage (2026-09-18), vraie prise en charge trouvée le
   2026-09-19.** Supprimer un **nœud de bloc entier** (une ligne de tableau, ou un **paragraphe
   entier**) avec le suivi actif levait `TransformError: Invalid content for node table/doc`.
   Diagnostic exact en lisant le code source réel de la lib (`dist/replaceStep.js`) : quand la
   suppression correspond EXACTEMENT à un ou plusieurs nœuds de bloc entiers, la lib pose une
   **marque de nœud** (`tr.addNodeMark`, pas une marque inline) sur le bloc lui-même — un mécanisme
   ProseMirror réel (`AddNodeMarkStep`), pas une improvisation de la lib. Ça plante parce que
   ProseMirror valide que le PARENT du nœud marqué autorise cette marque sur ses enfants
   (`NodeType.allowsMarks`, dérivé de `NodeSpec.marks` du parent) — et ni `doc`
   (`@tiptap/extension-document`) ni `table` (`@tiptap/extension-table`) ne déclarent `marks` dans
   Tiptap 3.x (vérifié dans leur code source réel), donc leurs enfants (paragraphe, ligne de tableau)
   ne peuvent porter aucune marque du tout par défaut. **Correctif réel** : étendre ces deux nœuds
   (`Document.extend({marks: 'insertion deletion modification'})`,
   `Table.extend({marks: 'insertion deletion modification'})`) pour autoriser explicitement les 3
   marques de suivi sur leurs enfants directs. Résultat vérifié : supprimer une ligne de tableau ou un
   paragraphe entier pose maintenant un vrai `<del>`/`<ins>` **autour du nœud lui-même**
   (`<del><tr>...</tr></del>`), non destructif, exactement comme pour le texte inline — y compris dans
   l'autre sens (insertion d'un nœud de bloc entier, ex. `insertContentAt` d'un `<p>` complet, pose de
   la même façon un `<ins>` sur le nœud). Le `try/catch` posé le 2026-09-18 est conservé comme filet de
   sécurité pur (transaction refusée, jamais appliquée) pour tout futur type de nœud de bloc dont le
   parent n'aurait pas encore été étendu de la même façon — plus la voie normale.
2. **« Tout accepter »/« tout refuser » ne retiraient pas les marques (2026-09-18).** La garde du pont
   Tiptap ne testait que `isSuggestChangesEnabled(state) && !tr.getMeta('history$')` avant de
   retransformer une transaction, alors que `applySuggestions`/`revertSuggestions`/`applySuggestion`/
   `revertSuggestion` posent un meta `{skip: true}` sur LEUR PROPRE transaction pour dire « ceci est
   déjà le résultat, ne le re-transforme pas » (vu dans `dist/withSuggestChanges.js`, l'intégration
   officielle que ce prototype n'utilise pas directement). **Corrigé** en alignant la garde sur celle
   de la lib (`!('skip' in (tr.getMeta(suggestChangesKey) ?? {}))`).
3. **Bug dans la lib elle-même (pas notre code), trouvé le 2026-09-19** : `applySuggestions`/
   `revertSuggestions` (`commands.js`) plantent avec `Cannot read properties of undefined (reading
   'nodeSize')` quand le bloc accepté/annulé est le **tout dernier nœud du document entier**. Cause :
   leur test de fusion avec le caractère suivant fait
   `deletionTo <= tr.doc.content.size ? tr.doc.textBetween(deletionTo, deletionTo + 1, ...) : ""` — un
   `<=` au lieu d'un `<`, qui tente de lire un caractère hors limites quand `deletionTo` est
   exactement la fin du document. Rien à corriger côté notre code (bug dans le paquet chargé depuis
   esm.sh).

   Deux essais avant le contournement retenu. Le premier (une extension `TrailingParagraphGuard`
   posant en permanence un paragraphe vide via `appendTransaction`) a été **abandonné** après relecture
   critique : il se déclenchait aussi sur l'annulation elle-même, empêchant Ctrl+Z de restaurer
   fidèlement le document (le paragraphe-tampon persistait), et ne protégeait pas un document qui vient
   d'être chargé avec une marque déjà posée sur son dernier nœud (le garde ne s'activait qu'après une
   première transaction). **Contournement retenu** : `runGuardedLibCommand`, une fonction appelée
   ponctuellement autour des 4 fonctions à risque (`applySuggestions`/`revertSuggestions`/
   `applySuggestion`/`revertSuggestion`), et seulement quand le dernier nœud du document porte
   réellement une marque de suivi — insère un paragraphe vide juste après lui, exécute l'opération,
   retire ce paragraphe s'il est resté vide et sans marque. Les deux transactions de bord portent
   `addToHistory: false` : invisibles pour Annuler/Rétablir, donc plus de conflit avec eux, et le
   correctif s'applique dès le tout premier appel (vérifié avec un document chargé et déjà marqué,
   sans édition préalable).

   **Piège Tiptap 3.x rencontré en écrivant ce correctif, à retenir pour la suite** : un premier essai
   passait le `dispatch` fourni par Tiptap au contexte d'une commande directe (`editor.commands.xxx()`,
   pas une chaîne `.chain()`) à nos transactions de bourrage/nettoyage — ça ne faisait RIEN,
   silencieusement (les commandes retournaient `true` sans aucun effet visible). Cause vue dans le code
   source réel de `@tiptap/core` (`CommandManager.buildProps`) : pour un appel direct, Tiptap fournit un
   `dispatch` qui est un pur no-op (`() => void 0`), et un `state.tr` "chaînable" qui est TOUJOURS LE
   MÊME objet `Transaction` partagé pendant tout l'appel — c'est Tiptap qui dispatche ce tr partagé
   lui-même, une seule fois, après le retour de la commande. Passer `editor.state` (l'état déjà figé)
   au lieu de ce `state` chaînable crée un tr ORPHELIN à chaque lecture, que le dispatch no-op jette
   silencieusement. **Corrigé** en utilisant directement `editor.view.dispatch` (le vrai dispatch
   ProseMirror, synchrone, jamais un no-op) et en empêchant Tiptap de dispatcher en plus son propre tr
   partagé resté vide (`tr.setMeta('preventDispatch', true)`). Point d'attention réutilisable : toute
   commande Tiptap qui a besoin d'appliquer PLUSIEURS transactions dans l'ordre (et pas une seule
   mutation isolée) doit passer par ce chemin, pas par le `dispatch`/`state` du contexte de commande.

   **Piège StarterKit rencontré en testant ce correctif, distinct et sans rapport avec le suivi des
   modifications** : `@tiptap/starter-kit@3.31.3` embarque par défaut sa propre extension
   `TrailingNode` (`@tiptap/extensions`, vérifié dans le code source réel du paquet), qui garantit en
   permanence que le document ne se termine jamais par autre chose qu'un paragraphe (par ex. juste
   après un tableau) — active dès que `StarterKit.configure({...})` ne désactive pas explicitement
   `trailingNode`. Conséquence observée : supprimer le dernier paragraphe d'un document qui se termine
   par `[tableau, paragraphe]` expose le tableau comme nouveau dernier nœud, et `TrailingNode` réinsère
   aussitôt un paragraphe vide à sa place — un paragraphe vide identique apparaîtrait de la même façon
   avec une suppression manuelle normale, sans suivi des modifications actif. Ce n'est donc pas un
   reliquat de `runGuardedLibCommand`, juste le comportement permanent de l'éditeur : à ne pas confondre
   avec un bug du correctif si ça se reproduit ailleurs.

   **Piège de la lib rencontré en réordonnant les tests, à connaître avant d'utiliser les commandes par
   id** : `suggestReplaceStep` (`dist/replaceStep.js`) réutilise volontairement l'id d'une marque
   insertion/deletion directement ADJACENTE plutôt que d'en générer une nouvelle, pour représenter un
   remplacement (ancien contenu supprimé + nouveau contenu inséré juste à côté) comme UNE seule
   suggestion groupée. Comportement voulu de la lib, pas un bug — mais il implique qu'accepter/refuser
   par id une suggestion agit aussi sur toute suggestion strictement adjacente qui partage son id, même
   si les deux ont été créées par des actions sans rapport. À garder en tête pour un futur bouton
   « accepter/refuser CE changement » dans l'UI réelle : deux changements qui se touchent peuvent être
   liés du point de vue de la lib.

**Deux bugs supplémentaires trouvés le 2026-09-19, en complexifiant les tests à la demande d'Antoine
(« anticiper les problèmes à la migration, teste avec plusieurs utilisateurs »). Les deux sont corrigés
dans le prototype :**

4. **Recharger un document contenant déjà une marque `deletion` en attente la convertissait en simple
   texte barré PERMANENT, sans exception.** Cause : `@tiptap/starter-kit` embarque sa propre extension
   `Strike`, dont `parseHTML` reconnaît AUSSI la balise `<del>` (en plus de `<s>`/`<strike>`) — vérifié
   dans le code source réel du paquet. StarterKit est enregistré avant `DeletionMark` dans le tableau
   d'extensions, et les deux ont par défaut la même priorité Tiptap (100) : à priorité de règle
   ProseMirror égale (`DOMParser.schemaRules()`, défaut 50), l'ordre d'insertion dans `schema.marks`
   tranche l'égalité, donc `Strike` gagnait la course au parsing de `<del>` et absorbait silencieusement
   la marque de suivi, perdant à la fois son statut de suggestion ET son id. Se déclenchait dès le tout
   premier chargement d'un document contenant une suppression en attente (`setContent`), suivi actif ou
   non à ce moment — donc aussi bien au chargement initial d'un modèle qu'au rechargement après un
   conflit. **Corrigé** en donnant aux marques `insertion`/`deletion` une priorité Tiptap explicite de
   200, pour qu'elles gagnent systématiquement ce genre de conflit de balise avec une extension
   standard de StarterKit.
5. **Recharger un document pendant que le suivi est actif dupliquait tout le contenu au lieu de le
   remplacer.** `editor.commands.setContent()` (utilisé par le prototype pour simuler un rechargement,
   comme `Editor.setHTML()` de l'app réelle à `js/editor.js:392`) passe par le même pipeline
   `dispatchTransaction`/`transformToSuggestionTransaction` qu'une frappe normale : si le suivi est
   actif au moment du chargement, TOUT le remplacement de document est traité comme une seule
   suggestion géante, empilant ancien et nouveau contenu dans des `<del>`/`<ins>` imbriqués au lieu de
   remplacer proprement. **Corrigé** par une nouvelle commande dédiée, `loadDocument(html)`, qui
   parse le HTML directement (`DOMParser.fromSchema`) et dispatche le remplacement avec les mêmes
   méta-données que la lib utilise pour ses propres opérations « déjà appliquées »
   (`{skip: true}` + `addToHistory: false`) — un remplacement net, quel que soit l'état du suivi au
   moment du chargement. Pertinent pour la vraie migration : c'est exactement le rechargement qui se
   produit après un conflit d'auto-save (« Recharger la dernière version ») ou à l'ouverture normale
   d'un modèle qui contient déjà un suivi non résolu.

**Conclusion vérifiée sur la collision d'id entre utilisateurs (pas un bug, un risque de migration à
surveiller)** : `generateNextNumberId` calcule l'id suivant en scannant uniquement le document de
l'instance d'éditeur COURANTE (`max(ids existants) + 1`), sans compteur global. Deux utilisateurs qui
partent du même document sans marque obtiennent donc systématiquement le MÊME id (1) pour leur premier
changement, quel qu'il soit — confirmé en le reproduisant réellement entre deux onglets/deux instances
d'éditeur indépendantes. **Sans conséquence aujourd'hui** : le modèle produit tranché (dernier écrivain
gagne, remplacement intégral de `Contenu`, jamais de fusion) fait que les deux documents qui
collisionnent ne coexistent jamais dans une même instance d'éditeur — un id=1 chez le perdant disparaît
intégralement avec son document au moment de l'écrasement. **Point de vigilance pour une éventuelle
évolution future** (fusion/replay des suggestions de deux utilisateurs au lieu d'un remplacement
intégral — non demandé, non implémenté, hors du modèle produit actuel) : `applySuggestionById`/
`revertSuggestionById` retrouvent une marque par ÉGALITÉ D'ID SEULE sur tout le document, sans borne de
position ; si une future UI combinait un jour les suggestions de deux auteurs dans un même document, la
collision d'id ferait qu'une action « accepter/refuser CE changement » en toucherait potentiellement
DEUX, sans rapport entre eux — vérifié reproductible avec un document construit à la main. À garder en
tête uniquement si un mécanisme de fusion est ajouté un jour ; le modèle actuel n'y est pas exposé.

**Bug de performance CONFIRMÉ (pas une hypothèse) dans la lib tierce, mesuré le 2026-09-19** :
`applySuggestions`/`revertSuggestions`/`applySuggestion`/`revertSuggestion` de
`@handlewithcare/prosemirror-suggest-changes@0.1.8` traitent chaque marque trouvée en appelant
`Transform.mapping.map()` sur un `Transform` PARTAGÉ qui accumule les steps de toutes les marques déjà
traitées dans le même appel — un coût cumulatif en O(N²) pour N marques, pas O(N), puisque
`mapping.map()` coûte proportionnellement au nombre de steps déjà accumulés. Mesuré dans la suite de
tests (400→1600 paragraphes, chacun avec une paire `<ins>`+`<del>` préexistante, plus une table
associée) : temps de « tout accepter » multiplié par **9,12x** et « tout refuser » par **8,69x** pour une
multiplication de la taille par 4x seulement — largement super-linéaire. Mesuré à plus grande échelle
pendant l'investigation (hors suite committée, pour ne pas alourdir son temps d'exécution) :
200→800→3200→12800 paragraphes donnent des ratios de 5,6x/8,45x/20,8x pour chaque multiplication par
4x, et « tout accepter » à 12800 paragraphes (16640 marques) prend environ 26,7 secondes — de quoi geler
l'onglet, la lib dispatchant une seule transaction ProseMirror synchrone sur le thread principal. **Ce
n'est pas un bug de notre code** (`TrackedDocument`/`TrackedTable`/`runGuardedLibCommand` n'y
participent pas) : c'est une caractéristique algorithmique de la lib tierce elle-même, donc pas
corrigeable depuis ce prototype. Piste de mitigation identifiée mais NON intégrée (preuve de concept
seulement, demanderait à re-vérifier son interaction avec les 3 bugs déjà corrigés ci-dessus) :
découper « tout accepter » en plusieurs transactions bornées (une toutes les ~200 paragraphes via
`acceptSuggestionsInSelection()` sur une plage, au lieu d'un seul appel `acceptAllSuggestions()`) a
réduit le temps mesuré à 12800 paragraphes de 15,5s à 7,8s. **À signaler explicitement pour tout
chiffrage réel** : un document long avec beaucoup de changements en attente est un risque de gel de
l'UI, indépendant de tout ce que notre code peut corriger dans le périmètre de ce chantier.

**Superposition avec `commentMark` : comportement vérifié correct, aucun bug trouvé.** Marquer pour
suppression une plage déjà commentée pose bien les deux marques (`deletion` + `commentMark`) sans
conflit ; refuser la suppression restaure texte ET commentaire intacts. Accepter la suppression d'une
plage partiellement commentée ne détruit QUE la portion du commentaire qui recouvrait le texte
physiquement supprimé — la portion survivante du commentaire garde légitimement sa marque (comportement
fin, cohérent avec la conséquence déjà anticipée dans ce document : « un fil de discussion devient
orphelin... tant que la suppression n'est pas formellement acceptée », ici vérifié dans l'autre sens).
Insérer du texte sous suivi à l'intérieur d'une plage commentée pose bien les deux marques (`insertion`
+ `commentMark`) sur le texte inséré.

**Suite de tests automatisée** : `prototypes/test-suivi-modifications.mjs` (Playwright headless,
autonome, `node prototypes/test-suivi-modifications.mjs`) couvre désormais **21 scénarios** — les cas
précédents plus : suppression de ligne/paragraphe entiers marquée non-destructivement sur le nœud,
refus par id d'une suppression de bloc (la restaure), insertion programmatique d'un bloc entier marquée
sur le nœud, refus par id d'une insertion de bloc (la supprime), le cas de bord accepter/refuser le
dernier nœud du document (bug n°3 ci-dessus, dans les deux situations), le round-trip d'une marque
deletion déjà en attente (bug n°4), un scénario complet à deux utilisateurs indépendants qui divergent
puis s'écrasent (dernier écrivain gagne, via `loadDocument`, bug n°5), la mesure de performance
super-linéaire ci-dessus, et les trois scénarios de superposition avec `commentMark`. Les 21 passent.
Un second fichier dédié, `prototypes/test-suivi-modifications-multi-utilisateurs.mjs` (3 scénarios,
tous verts), isole spécifiquement la collision d'id entre utilisateurs indépendants documentée
ci-dessus. Ordre volontaire dans le premier fichier : l'aller-retour insertion/refus d'un bloc de test
passe AVANT le marquage du dernier paragraphe pour suppression, précisément pour éviter l'adjacence de
marques décrite ci-dessus.

**Conséquence** : la marque non-destructive (option 2) est confirmée pour le texte inline ET pour les
nœuds de bloc entiers (paragraphe, ligne de tableau) dans les deux sens (suppression et insertion). Le
choix de lib peut être considéré comme validé pour ce périmètre. Restent à vérifier si le chantier se
chiffre pour de vrai : que les 19 nœuds custom de l'éditeur réel n'ont pas d'autres conteneurs de bloc à
étendre de la même façon (listes, citations, etc. — seuls `doc` et `table` ont été traités ici, sur ce
qui était testé), et que le contournement du bug n°3 tient dans le vrai schéma.

## Décision structurante n°4 — où stocker l'historique côté Grist ?

Le `Contenu` d'un modèle (`Publipostage_Modeles`) est déjà une colonne Texte unique, réécrite en
**entier** à chaque `UpdateRecord`, y compris à chaque tick d'auto-save. Trois modèles comparés :

- **(a) Marques/attributs dans le HTML**, comme `commentMark` : pas de nouvelle colonne ni table,
  ancrage automatique par ProseMirror. Mais le HTML ne fait QUE grossir tant qu'un changement n'est pas
  accepté/refusé, et chaque tick d'auto-save réécrirait alors la totalité de cet historique cumulé même
  pour une frappe isolée.
- **(b) Table compagnon** (façon `Publipostage_Commentaires`) : écartée par Antoine (2026-09-18)
  — « pas fan de la démultiplication des tables ».
- **(c) Nouvelle colonne dans `Publipostage_Modeles`** (ex. `SuiviModifications`, JSON), écrite dans
  le **même** `UpdateRecord` que `Contenu`/`DateModif`, jamais séparément : **retenu par Antoine
  (2026-09-18)**.

(c) reprend l'essentiel des bénéfices de (b) sans nouvelle table : `Contenu` (donc le HTML/la
sérialisation ProseMirror) ne porte pas l'historique, un changement de statut accepté/refusé peut se
faire sans re-sérialiser tout le document, et l'écriture reste un `UpdateRecord` unique et atomique sur
UNE ligne (pas deux écritures sur deux tables à synchroniser, donc pas de risque d'orphelinage
inter-tables). Nécessite quand même un petit identifiant d'ancrage dans le HTML (comme `CommentId`)
pour savoir où chaque entrée du JSON s'applique — un point commun à (b) et (c), pas contournable.
Ne change PAS le coût déjà existant de `Templates.loadAll()`/`readBackDateModif()` (elles ramènent déjà
toute la table, toutes colonnes, à chaque tick de 2,5 s) : une colonne de plus alourdit ce qui est déjà
alourdi par `Contenu` (images en base64, JSON marges/en-têtes), sans changer la NATURE du risque —
même limite de 1 Mo par requête API à surveiller (voir avertissement plus bas). Comme pour (b), le
contenu de la colonne doit être **batché** au rythme de l'auto-save (un lot par tick, jamais par
caractère) : c'est cette discipline — écrire `SuiviModifications` UNIQUEMENT dans le même
`UpdateRecord` que `Contenu`/`DateModif`, au même rythme, jamais via un canal plus fréquent — qui
détermine la fenêtre de perte en cas de conflit (voir section suivante).

*Recommandation* : (c), conformément au choix d'Antoine. `prosemirror-changeset` (ou l'extension DIY
retenue, décision n°2) peut alimenter cette colonne aussi bien qu'une table compagnon — le choix
ci-dessus ne dépend pas de la lib.

⚠️ **Chiffres Grist non vérifiés en direct** (support.getgrist.com/community.getgrist.com bloqués
depuis cet environnement pendant la recherche — à recouper manuellement) : limite de 1 Mo par requête
API et de 10 requêtes concurrentes par document documentées pour la REST API HTTP classique, sans
confirmation officielle trouvée qu'elles s'appliquent à l'identique à l'API « plugin »
(`grist.docApi.*`) utilisée par ce widget ; pas de limite de taille de cellule Texte dédiée trouvée ;
pas de chiffre officiel de débit d'écriture soutenable pour l'auto-hébergé (`grist-core`, ticket GitHub
gristlabs/grist-core#898 ouvert et sans réponse chiffrée à ce jour).

## Enjeu transverse — pas de collaboration temps réel, donc pas de vraie fusion possible

**Exigence d'Antoine (2026-09-18)** : l'édition simultanée ne doit « tout faire perdre au pire [que]
les 3 dernières secondes maximum, même périmètre de risque que l'auto-save, pas plus ».

Le mécanisme de conflit actuel (comparaison de `DateModif` au tick précédent, puis écriture) est un
TOCTOU : deux utilisateurs qui éditent presque simultanément peuvent chacun passer le test « pas de
conflit » puis s'écraser l'un l'autre, sans fusion, le perdant ne le découvrant qu'à son tick suivant
(jusqu'à 2,5 s plus tard). C'est déjà toléré aujourd'hui pour de la prose ordinaire : le perdant ne
perd que le brouillon local accumulé depuis SA dernière sauvegarde réussie, pas ce qui a déjà été
persisté avant — chaque tick renouvelle `DateModif`, donc une collision non détectée au tick N est
détectée au tick N+1 (2,5 s plus tard), elle ne peut pas se reproduire indéfiniment sans être vue.

**Avec le modèle (c) retenu ci-dessus (colonne `SuiviModifications` écrite dans le MÊME `UpdateRecord`
que `Contenu`/`DateModif`, au même rythme), cette exigence est satisfaite par construction, à une
condition stricte à ne pas relâcher en implémentation** : ne jamais laisser le suivi des modifications
s'écrire plus souvent, ou indépendamment, du cycle d'auto-save existant. Tant que `SuiviModifications`
voyage verrouillé sur le même `UpdateRecord` que `Contenu`, un conflit perdu fait perdre exactement la
même fenêtre qu'aujourd'hui (le brouillon + son historique de suivi accumulés depuis la dernière
sauvegarde réussie du perdant, borné par l'intervalle d'auto-save actuel) — pas « tout l'historique »
comme une lecture naïve du risque pourrait le laisser craindre. C'est un argument de plus, indépendant
de la préférence produit d'Antoine, en faveur du modèle (c) plutôt qu'une table compagnon écrite sur un
cycle propre et potentiellement désynchronisé.

**Nuance ajoutée le 2026-09-19, après relecture exacte de `js/main.js`** : la fenêtre de 2,5 s décrite
ci-dessus ne borne que le chemin AUTO-SAVE. Le bouton « Enregistrer » manuel n'a, aujourd'hui déjà,
aucune borne du tout (voir plus haut : `onSave` n'a jamais vérifié de conflit, sur les 11 colonnes de
la ligne). Ce n'est pas une régression introduite par ce chantier : c'est le comportement déjà en
production pour `Contenu` seul. Comme `SuiviModifications` voyagera dans le MÊME `UpdateRecord` que
`Contenu`, quel que soit le chemin qui déclenche cet `UpdateRecord` (tick auto-save borné à 2,5 s, ou
clic manuel non borné), le suivi héritera EXACTEMENT du même profil de risque que `Contenu` aujourd'hui
— ni mieux ni pire. L'exigence d'Antoine (« pas plus de risque que l'auto-save actuel ») reste donc
satisfaite par construction, à condition de comprendre que « le risque de l'auto-save actuel » inclut
déjà ce chemin manuel non borné, pas seulement le tick de 2,5 s.

Reste un point non résolu par cette discipline : la fusion elle-même n'existe toujours pas (dernier
écrivain gagne, intégralement) — seule la TAILLE de ce qui peut être perdu est bornée (au sens ci-dessus,
manual save inclus). Une vraie fusion
demanderait un canal de collaboration temps réel (OT/CRDT, ce que `prosemirror-collab`/Yjs offrent) —
changement structurel hors périmètre de ce cadrage, et non demandé par Antoine. Piste d'atténuation
partielle (pas nécessaire pour tenir l'exigence ci-dessus, juste pour réduire la fréquence des
collisions) : un indicateur « en cours d'édition par X ».

## Enjeu transverse — historique Annuler/Rétablir

Fait vérifié dans `prosemirror-history` : undo/redo ne rembobinent pas un instantané, ils rejouent une
transaction ordinaire à partir des steps inversés, qui passe par le pipeline normal — c'est pour ça que
`prosemirror-changeset` peut voir un undo comme un edit de plus et le simplifier automatiquement.
Conséquence pratique : un accepter/refuser dispatché comme une transaction normale devient **annulable
par défaut**, sans code spécial (Ctrl+Z après « Accepter » repasserait le passage en attente —
comportement intuitif, cohérent avec Word/Google Docs). L'exclure de l'historique (`addToHistory:
false`) est un piège connu de l'écosystème : ça crée un « trou » où le Ctrl+Z suivant saute directement
à l'édition undoable précédente, donnant l'impression que l'undo « saute » un état pourtant vu à
l'écran. *Recommandation* : laisser accepter/refuser annulable par défaut, sauf décision produit
explicite contraire.

## Respect des règles UI d'Antoine

- **Un seul éditeur/une seule toolbar partagés** : un mode suggestion/révision doit se glisser dans
  l'architecture de contexte existante (comme le mode Email l'a fait), pas dupliquer l'éditeur.
- **UI monochrome** : le vocabulaire visuel habituel du suivi des modifications (vert/rouge) est à
  proscrire tel quel — prévoir un langage monochrome (souligné pour insertion, barré pour suppression,
  éventuellement une teinte de fond neutre très légère) à valider avec Antoine.
- **Non-régression stricte** : nouveaux boutons/état à ajouter, jamais modifier le comportement
  existant du bouton « Enregistrer »/de la toolbar de formatage.
- **Traductions anglaises** dans le même lot que toute nouvelle chaîne d'UI (`js/i18n.js`).

## Tests de non-régression à prévoir

Sur le modèle de `dev-tests/scenarios-comments.js`, qui vérifie systématiquement les DEUX moitiés de la
fonctionnalité (ancrage dans le document ET contenu dans la table Grist compagnon) : un futur
`scenarios-track-changes.js` devra vérifier à la fois l'état du document (marques/décorations
insertion/suppression) et, si le modèle (b) est retenu, la table compagnon — plus des scénarios dédiés
pour :
- ~~l'interaction avec `commentMark` (superposition, non-orphelinage)~~ — **couvert dans le
  prototype le 2026-09-19** (3 scénarios verts, voir plus haut) ; à refaire sur le vrai `commentMark`
  de `js/comments.js` (popup, table Grist compagnon) au moment de l'intégration.
- au moins un nœud complexe supprimé en bloc (tableau, image) avec suivi actif ; le prototype couvre
  déjà la ligne de tableau, pas encore l'image.
- l'annulabilité d'un accepter/refuser (Ctrl+Z) ;
- l'auto-save avec un historique de suivi non trivial (taille du payload, absence de blocage) ;
- ~~un scénario de conflit (deux `Contenu` divergents) pour vérifier ce qui survit à un
  écrasement~~ — **couvert dans le prototype le 2026-09-19** (scénario complet à deux utilisateurs
  indépendants, dernier écrivain gagne, voir plus haut) ; à refaire contre le vrai
  `Templates.save()`/`onSave` au moment de l'intégration, notamment pour vérifier le chemin manuel
  sans détection de conflit décrit plus haut.
- ~~perf sur un document long multi-pages avec tableaux/images (coût d'interception de chaque
  transaction) — actuellement une simple hypothèse raisonnée, jamais mesurée sur ce projet~~ —
  **mesuré le 2026-09-19** : croissance super-linéaire confirmée (bug de la lib tierce, voir plus
  haut), pas juste une hypothèse. Reste à mesurer : coût d'interception PAR FRAPPE sur un document déjà
  volumineux pendant une session d'édition normale (le test actuel mesure « tout accepter »/« tout
  refuser », pas la frappe continue).

## Questions ouvertes avec Antoine avant tout chiffrage d'effort

1. ~~UX cible~~ — **tranché 2026-09-18 : mode suggestion façon Word/Google Docs.**
2. ~~Politique « pas de build/pas de vendorisation »~~ — **tranché 2026-09-18 : DIY sur ProseMirror,
   pas de Tiptap Pro.**
3. Attribution par auteur : l'app n'a pas de présence temps réel et l'identification utilisateur
   passe déjà par un détour asynchrone (`UserProbe`) — le suivi doit-il malgré tout distinguer les
   auteurs, ou un suivi anonyme/mono-auteur suffit-il pour un premier jet ?
4. Comportement des exports (PDF/DOCX/mailto/mode Lecture) face à des changements non tranchés :
   n'exporter que l'état accepté, exporter avec les marques visibles, ou bloquer l'export tant qu'il
   reste des changements en attente ?
5. Rétention de l'historique une fois accepté/refusé : conservé (traçabilité, mais recoupe la
   discussion RSSI/RGPD déjà ouverte ailleurs sur `requiredAccess: 'full'`, item B1 de
   `roadmap-consolidee.md`) ou purgé dès résolution (comme un commentaire supprimé aujourd'hui) ?

## Prochaines étapes (2026-09-19) — réponse à la demande d'Antoine « migration / stabilisation / tests »

Recherche menée directement dans `js/editor.js`, `js/editor-nodes.js`, `js/templates.js` et `dev-tests/`
(pas des suppositions) pour fonder les 3 points ci-dessous sur le vrai code.

### 1) Préparer la migration

**Le blocage de zone partagée est levé** : le fil « Mode Email » a fini ses correctifs, Antoine a
confirmé que ça marche chez lui, `index.html`/l'éditeur/la barre d'outils ne sont plus occupés par un
autre chantier. L'intégration peut donc démarrer — **mais seulement sur le feu vert d'Antoine**, qui a
explicitement demandé de durcir le prototype d'abord (fait ci-dessus). Ce qui suit est prêt à être
lancé, pas une étape enchaînée d'office.

Points concrets trouvés en lisant le vrai code (au-delà de `doc`/`table` déjà traités dans le
prototype) :

- **2 conteneurs de bloc supplémentaires ont besoin du même correctif** que `doc`/`table`
  (`.extend({marks: 'insertion deletion modification'})`) : `twoColumnsColumn` (`content: 'block+'`,
  `js/editor-nodes.js:409-415`) et `twoColumnsZone` (`content: 'twoColumnsColumn twoColumnsColumn'`,
  `js/editor-nodes.js:416-420`). Sans ce correctif, un paragraphe supprimé/inséré dans une mise en page
  à deux colonnes ne pourrait pas être marqué non-destructivement. Ça répond à la question laissée
  ouverte plus haut (« les 19 nœuds custom ont-ils d'autres conteneurs à étendre ? ») : oui, ces deux-là.
  À vérifier en même temps : `TableCell`/`TableHeader` (`js/editor.js:269-270`, enrichis via
  `EditorNodes.withCellBackground`) — seul `Table` a été étendu dans le prototype, pas eux séparément.
- **2 risques de collision de balise latents, pas actifs aujourd'hui** (même famille que le bug
  `<del>`/Strike déjà corrigé) : `editorImage` revendique `<img class="editor-image">`
  (`js/editor-nodes.js:699`) alors que l'extension officielle `@tiptap/extension-image` revendique
  `<img>` de façon générique — non chargée aujourd'hui (absente de l'import map), donc sans effet tant
  qu'elle n'est pas ajoutée. Même remarque pour `footnoteRef` sur `<sup>` face à un `Superscript`
  officiel hypothétique. À traiter préventivement (priorité Tiptap explicite) si l'une de ces
  extensions officielles est ajoutée un jour.
- **Aucun hook `dispatchTransaction`/`appendTransaction`/`decorations` n'existe déjà** dans `js/`
  (vérifié par recherche exhaustive) : le pont vers `prosemirror-suggest-changes` ne rentrera en
  conflit avec rien de bas niveau. Deux points de couture à respecter : la chaîne `onUpdate`
  (`js/editor.js:279`, plusieurs traitements enchaînés — pagination, tableaux, badges) et l'extension
  `clearHistory` (`js/editor.js:330`, undo/redo). Bonne nouvelle sur ce dernier point : `setHTML()`
  (`js/editor.js:390-409`) appelle déjà `editor.commands.clearHistory()` à CHAQUE chargement de modèle
  (ligne 395, avec un commentaire expliquant que c'est pour éviter qu'un Annuler ne fasse réapparaître
  un modèle précédent) — donc le vrai `setHTML` a déjà, par construction, le même besoin que la
  commande `loadDocument` du prototype (remplacement net, historique maîtrisé), juste à brancher le
  même contournement de `transformToSuggestionTransaction` dessus.
- **Le point de greffe Grist est entièrement balisé** : un nouvel objet littéral `columns` unique dans
  `Templates.save()` (`js/templates.js:251-257`) construit exactement ce qui part dans le même
  `UpdateRecord`/`AddRecord` que `Contenu`/`DateModif` — il suffit d'y ajouter une clé
  `SuiviModifications`. Reste à écrire, sur le modèle des migrations existantes
  (`ensureHeaderFooterColumn`/`ensureMarginsColumn`/`ensureEmailColumns`, `js/templates.js:27-123`) :
  une migration idempotente dédiée, l'exposer dans la signature de `save(...)`, la lire dans
  `loadAll()`, et mettre à jour les deux points d'appel (`js/main.js:230` bouton Enregistrer,
  `js/main.js:367` tick auto-save).
- **Correction à noter** : le vrai `UpdateRecord` du bouton Enregistrer écrit 11 colonnes, pas 10 —
  `Objet` (objet de l'email) avait été omis d'une lecture précédente ; `EstParDefaut` est en réalité
  une colonne à part, écrite séparément par `setDefault()`, jamais dans ce même `UpdateRecord` (détail
  ci-dessus).

### 2) Stabiliser la feature

- Les 5 bugs déjà trouvés et corrigés dans le prototype (2 sur le nœud de bloc/dernier nœud, 2 sur le
  conflit de balise/rechargement pendant suivi actif, plus la garde `skip`) sont documentés en détail
  plus haut — rien de nouveau à corriger côté prototype à ce stade.
- **Nouveau risque de stabilité identifié aujourd'hui** : `twoColumnsColumn`/`twoColumnsZone` ne sont
  PAS encore couverts par le correctif de marque de nœud (point 1 ci-dessus). Tant que ce n'est pas
  fait, « le prototype est stable » ne veut dire « stable sur `doc`/`table` », pas sur l'ensemble des
  conteneurs de bloc réels de l'éditeur — à traiter avant de considérer la feature prête pour une vraie
  page à deux colonnes.
- Le bug de performance O(N²) confirmé par la mesure (voir plus haut, x9 de temps pour x4 de taille)
  est un vrai risque de stabilité sur un document long, pas juste un détail : nécessite soit un
  arbitrage produit (accepter le risque pour la taille réelle des modèles Grist), soit d'intégrer la
  piste de mitigation par découpage avant tout déploiement à des utilisateurs réels.
- Les 3 questions produit encore ouvertes (attribution par auteur, comportement des exports, rétention
  de l'historique — voir plus bas) bloquent une spec complète ; rien n'empêche de commencer
  l'intégration technique du point 1 sans elles, mais l'UI finale (bouton accepter/refuser, export) en
  dépend.

### 3) Tests unitaires pour sécuriser le déploiement

Périmètre clarifié avec le fil d'audit général des tests (ouvert par Antoine en parallèle) : ce fil-là
couvre ce qui est déjà en production (éditeur, mode email, mode lecture, export PDF) ; le suivi des
modifications reste ici tant qu'il n'est pas intégré, pour éviter deux listes à réconcilier.

- Le mécanisme d'intégration dans le harnais est entièrement balisé : ajouter une entrée dans `GROUPS`
  (`dev-tests/run-headless.mjs:27-47`, ex. `trackChanges: 'scenarios-track-changes'`), écrire
  `dev-tests/scenarios-track-changes.js` sur le patron IIFE + `cases.push({id, description, run})` de
  `scenarios-comments.js`, terminer par `window.EditorTestSuites.trackChanges = cases`.
- **Patron à suivre, déjà éprouvé sur les commentaires** : vérifier systématiquement les DEUX moitiés à
  chaque scénario — l'ancrage dans le document (marques `insertion`/`deletion`/`modification` dans le
  DOM ET dans `Editor.getHTML()`, qui peuvent diverger) ET la donnée de suivi côté Grist (la future
  colonne `SuiviModifications`, une fois qu'elle existe). Exemples directement transposables :
  `scenarios-comments.js:185-213` (suppression = les deux moitiés disparaissent ensemble) et
  `scenarios-comments.js:216-248` (persistance après un vrai cycle Enregistrer/rechargement).
- **Angle mort du harnais déjà documenté (seed après `init()`) : une solution existe déjà, pas besoin
  de la construire.** Le mécanisme `--preseed` (`dev-tests/run-headless.mjs`, `grist-stub.js:231`)
  injecte l'état Grist AVANT que `main.js:init()` tourne, via un petit fichier dédié
  (`node dev-tests/run-headless.mjs --preseed dev-tests/preseed-xxx.js trackChanges`) — c'est le bon
  outil pour tester « le widget démarre avec un suivi déjà en attente », pas un nouveau chantier sur le
  runner.
- Liste des scénarios à écrire dès que l'intégration réelle démarre (reprend et complète la section
  « Tests de non-régression à prévoir » plus haut, maintenant que le prototype les a déjà validés en
  isolation) : les 24 scénarios du prototype portés sur le vrai éditeur (dont round-trip après
  rechargement, deux utilisateurs qui divergent puis s'écrasent, superposition avec `commentMark`),
  plus les deux nouveaux conteneurs de bloc (`twoColumnsColumn`/`twoColumnsZone`) et la colonne
  `SuiviModifications` réelle (les deux moitiés ci-dessus), plus un scénario `--preseed` dédié pour le
  démarrage avec suivi déjà présent.

## Sources externes consultées (recherche du 2026-09-18)

Accès direct à `tiptap.dev`, `prosemirror.net`, `support.getgrist.com` et `community.getgrist.com`
bloqués par la politique réseau de cet environnement pendant la recherche — informations obtenues via
miroirs GitHub (`ueberdosis/tiptap-docs`, `ProseMirror/website` et `prosemirror-changeset`, tous deux
archivés) et résumés de recherche web citant les pages officielles. **À revérifier manuellement avant
toute décision d'architecture ou d'achat qui en dépendrait fortement** :
- `github.com/ueberdosis/tiptap-docs` (mdx `tracked-changes/*`, `guides/pro-extensions.mdx`)
- `github.com/handlewithcarecollective/prosemirror-suggest-changes`, `github.com/sungkhum/tiptap-track-changes`
- `github.com/ProseMirror/prosemirror-changeset`, `github.com/ProseMirror/website` (exemple `track/`), `github.com/ProseMirror/prosemirror-history`
- `support.getgrist.com/limits/`, `support.getgrist.com/api/`, `community.getgrist.com` (fil sur les limites de l'API plugin), `github.com/gristlabs/grist-core/issues/898`
