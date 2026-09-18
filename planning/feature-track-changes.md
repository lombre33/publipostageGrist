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
- **Auto-save** (`js/main.js`) : `autosaveTick()` toutes les 2500 ms, relit **toute** la table
  `Publipostage_Modeles` (`Templates.loadAll()`) à chaque tick pour comparer `DateModif`, réécrit
  l'intégralité de la colonne Texte `Contenu` à chaque sauvegarde. Détection de conflit purement
  applicative et a posteriori (comparaison de `DateModif` au tick précédent, pas un verrou) : en cas
  d'écart, bandeau « recharger » (perd le brouillon local) vs « enregistrer quand même » (écrase la
  version distante). Aucune fusion automatique — Grist ne fournit pas de compare-and-swap sur
  `UpdateRecord`.
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

Deux architectures possibles pour représenter une suppression en attente :

- **(a) Suppression réelle + fantôme décoratif** (patron `prosemirror-changeset`) : le texte est
  réellement retiré de `docB` dès la frappe ; ce qui s'affiche barré à l'écran est une décoration
  « widget » reconstruite depuis un instantané figé `docA`. Risque concret identifié : si le passage
  supprimé portait un `commentMark`, la marque disparaît immédiatement du document COURANT — un fil de
  discussion devient orphelin (introuvable par `findMarkRanges()`, qui scanne `docB`) tant que la
  suppression n'est pas formellement acceptée, alors même que le texte barré reste visible à l'écran.
- **(b) Marque non-destructive** (`trackDeletion`, `excludes: ''` comme `commentMark`) : le texte
  supprimé reste physiquement présent dans le document, simplement marqué et stylé barré — cohérent
  avec l'architecture `commentMark` existante (pas d'orphelinage), mais oblige à faire connaître ce
  texte « fantôme mais présent » à **tous** les consommateurs du document : chaque commande d'édition,
  l'export PDF (`js/pdf-export.js`), l'export DOCX (`js/docx-export.js`), l'export mailto
  (`js/mailto-export.js`), le mode Lecture (3ᵉ moteur de rendu indépendant, `js/reader-mode.js`) et
  l'auto-save (le texte envoyé à Grist doit-il inclure les suppressions en attente ?).

Nœuds complexes (tableaux, images, sauts de page) : dans les deux architectures, la suppression d'un
nœud entier se traite comme un seul changement (pas de diff granulaire à l'intérieur). Mais afficher le
fantôme d'un tableau/image supprimé exige un chemin de rendu figé dédié pour éviter qu'un clic sur un
fantôme déclenche une action sur un nœud qui n'existe plus réellement à cette position — potentiellement
un cas à couvrir par nœud custom réellement supprimable en bloc (tableaux, images, sauts de page,
zones 2-colonnes ; les chips/badges de variable, atomiques et sans état interne, sont plus simples).

*Recommandation* : l'option (b) est plus cohérente avec l'existant (pas de régression sur les
commentaires) mais élargit la surface de patch à quasiment tous les modules de sortie — à évaluer par
prototype avant de trancher, pas une décision à figer sur dossier.

## Décision structurante n°4 — où stocker l'historique côté Grist ?

Le `Contenu` d'un modèle (`Publipostage_Modeles`) est déjà une colonne Texte unique, réécrite en
**entier** à chaque `UpdateRecord`, y compris à chaque tick d'auto-save. C'est le contexte dans lequel
juger les deux modèles :

- **(a) Marques/attributs dans le HTML**, comme `commentMark` : pas de nouvelle table, ancrage
  automatique par ProseMirror. Mais le HTML ne fait QUE grossir tant qu'un changement n'est pas
  accepté/refusé (rien ne le compacte automatiquement aujourd'hui pour les commentaires non plus), et
  chaque tick d'auto-save (2,5 s) réécrirait alors la **totalité** de cet historique cumulé, même pour
  une frappe isolée — coût réseau proportionnel à tout l'historique, pas à l'édition. Risque concret :
  `Templates.loadAll()`/`readBackDateModif()` ramènent **toute** la table à chaque tick, pour tous les
  modèles ouverts — alourdir le `Contenu` d'UN modèle pénalise cette lecture pour toutes les sessions.
  Si `Contenu` (déjà potentiellement lourd : images en base64, JSON marges/en-têtes) approchait la
  limite documentée de 1 Mo par corps de requête API Grist, l'auto-save échouerait en boucle
  silencieuse précisément quand il y a le plus d'historique à tracer.
- **(b) Table compagnon** (façon `Publipostage_Commentaires`) : le `Contenu` reste borné à la taille du
  document, indépendamment de la profondeur de l'historique ; un changement de statut
  accepté/refusé/en attente se fait par un `UpdateRecord` ciblé sur SA ligne, sans toucher `Contenu`.
  Nécessite quand même un petit identifiant d'ancrage dans le HTML (comme `CommentId`). Doit
  impérativement être **batché** au rythme de l'auto-save (un lot par tick, jamais par caractère,
  fusion des plages contiguës comme `findMarkRanges()` le fait déjà) pour ne pas exploser le nombre
  d'`AddRecord` (limite de concurrence documentée : 10 requêtes API simultanées par document côté
  Grist SaaS). Risque propre : orphelinage des lignes si leurs ancrages disparaissent lors d'un
  écrasement de `Contenu` par un autre utilisateur.

*Recommandation* : (b), pour les mêmes raisons qui ont motivé le choix de `Publipostage_Commentaires` —
borne le coût de l'auto-save, isole les changements de statut du gros blob HTML. `prosemirror-changeset`
peut alimenter aussi bien (a) que (b), le choix ci-dessus ne dépend pas de la lib retenue.

⚠️ **Chiffres Grist non vérifiés en direct** (support.getgrist.com/community.getgrist.com bloqués
depuis cet environnement pendant la recherche — à recouper manuellement) : limite de 1 Mo par requête
API et de 10 requêtes concurrentes par document documentées pour la REST API HTTP classique, sans
confirmation officielle trouvée qu'elles s'appliquent à l'identique à l'API « plugin »
(`grist.docApi.*`) utilisée par ce widget ; pas de limite de taille de cellule Texte dédiée trouvée ;
pas de chiffre officiel de débit d'écriture soutenable pour l'auto-hébergé (`grist-core`, ticket GitHub
gristlabs/grist-core#898 ouvert et sans réponse chiffrée à ce jour).

## Enjeu transverse — pas de collaboration temps réel, donc pas de vraie fusion possible

Le mécanisme de conflit actuel (comparaison de `DateModif` au tick précédent, puis écriture) est un
TOCTOU : deux utilisateurs qui éditent presque simultanément peuvent chacun passer le test « pas de
conflit » puis s'écraser l'un l'autre, sans fusion, le perdant ne le découvrant qu'à son tick suivant
(jusqu'à 2,5 s plus tard). C'est déjà toléré aujourd'hui pour de la prose ordinaire (perte des
dernières frappes). Pour le suivi des modifications, l'enjeu est plus grave :

- Modèle (a) : un écrasement de `Contenu` détruit **tout** l'historique de suivi du perdant d'un coup
  (pas seulement ses dernières frappes) — y compris des changements déjà acceptés/refusés.
- Modèle (b) : les lignes de suivi survivent à l'écrasement (table séparée), mais risquent
  l'orphelinage si leur ancrage a disparu de la version de `Contenu` qui l'emporte.

Dans les deux cas, un outil censé produire un historique fiable et attribuable peut en perdre une
partie silencieusement sur une simple coïncidence de calendrier — en tension directe avec l'objectif
même de la fonctionnalité. Une vraie fusion demanderait un canal de collaboration temps réel
(OT/CRDT, ce que `prosemirror-collab`/Yjs offrent) — changement structurel hors périmètre de ce
cadrage. Piste d'atténuation partielle (pas une solution) : un indicateur « en cours d'édition par
X » réduirait la fréquence des collisions sans les éliminer.

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
- l'interaction avec `commentMark` (superposition, non-orphelinage) ;
- au moins un nœud complexe supprimé en bloc (tableau, image) avec suivi actif ;
- l'annulabilité d'un accepter/refuser (Ctrl+Z) ;
- l'auto-save avec un historique de suivi non trivial (taille du payload, absence de blocage) ;
- un scénario de conflit (deux `Contenu` divergents) pour vérifier ce qui survit à un écrasement.
- perf sur un document long multi-pages avec tableaux/images (coût d'interception de chaque
  transaction) — actuellement une simple hypothèse raisonnée, jamais mesurée sur ce projet.

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
