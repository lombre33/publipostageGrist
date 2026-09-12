# Audit de code — Publipostage Grist V2 (préparation publication + audit DINUM)

**Date** : 2026-09-12 (mis à jour le même jour avec le guide de contribution Grist.Gouv et l'enjeu RSSI)
**Périmètre** : tous les fichiers chargés en production par `v2/index.html`, y compris les fichiers V1 partagés (`js/grist-api.js`, `js/templates.js`, `js/reader-mode.js`, `css/style.css`, `css/roboto-fonts.css`), plus l'inventaire du dossier `v2/` et de la racine du dépôt. La V1 « pure » (`index.html` racine, `js/editor.js`, `js/main.js`, `js/pdf-export.js`, `js/html-source-tab.js`, `js/variables.js`, `js/pdf-fonts*.js` — jamais chargés par la V2) est **hors périmètre**.
**Méthode** : lecture intégrale de chaque fichier (aucune modification), en 4 lots parallèles + vérifications ponctuelles manuelles. ~11 850 lignes de code auditées sur 18 fichiers de production, plus l'inventaire complet de `v2/` et de la racine.
**Référence externe** : « Contributing Guide — Grist.Gouv Widgets » (guide officiel DINUM/ANCT pour la contribution de widgets à l'instance souveraine Grist.Gouv, fourni par l'utilisateur, dernière mise à jour juillet 2026) — voir §8 pour la mise en regard détaillée.

## Comment lire ce rapport

Chaque constat porte un niveau de priorité :
- **Bloquant** : à corriger avant toute publication/audit.
- **Important** : à corriger avant l'audit DINUM/RSSI, risque réel (sécurité, données, corruption silencieuse).
- **Mineur** : à corriger si le temps le permet, pas de risque immédiat.
- **Cosmétique** : nettoyage optionnel.

Aucun **Bloquant** n'a été trouvé (rien n'empêche le fonctionnement actuel). En revanche plusieurs **Important** touchent la sécurité, la surface d'attaque, et l'intégrité des données — à traiter en priorité.

---

## 1. Synthèse exécutive

| Catégorie | Bloquant | Important | Mineur | Cosmétique |
|---|---|---|---|---|
| **Enjeu RSSI (périmètre d'accès + chaîne d'approvisionnement)** | 0 | **4** | 1 | 0 |
| Sécurité applicative (XSS / RGPD) | 0 | 6 | 2 | 0 |
| Intégrité des données (concurrence) | 0 | 2 | 0 | 0 |
| Qualité de code (redondance, structure) | 0 | 6 | 8 | 4 |
| Fichiers / publication / conformité au guide Grist.Gouv | 0 | 3 | 4 | 0 |
| Accessibilité (RGAA) | 0 | 1 | 1 | 1 |
| **Total** | **0** | **22** | **16** | **5** |

**Les 6 points à traiter en priorité absolue avant l'audit DINUM/RSSI :**

1. **[RSSI — voir §2]** Le widget demande l'accès **complet** en lecture/écriture à tout le document Grist (`requiredAccess: 'full'`), alors que trois vecteurs XSS crédibles ont été trouvés (points 3-4 ci-dessous) : en cas de compromission, l'attaquant hérite d'un accès total au document, pas seulement à la table liée. C'est le point que la RSSI va très probablement mettre en avant en premier — à traiter comme un sujet à part entière, pas seulement un « aggravant » d'un autre constat.
2. **[RSSI — voir §2]** Le widget charge à l'exécution ~26 paquets JavaScript tiers depuis deux CDN publics non-souverains (`esm.sh`, `cdnjs.cloudflare.com`), sans aucune vérification d'intégrité (`integrity=`/SRI) ni hébergement local — un sujet de souveraineté numérique explicitement mentionné dans le guide Grist.Gouv (§8) et un vecteur de compromission de la chaîne d'approvisionnement classique.
3. **[Sécurité]** Un log console expose l'intégralité de chaque ligne Grist sélectionnée (potentiellement des données personnelles : noms, emails, adresses) — `js/grist-api.js:61`.
4. **[Sécurité]** Le mode en-tête/pied de page injecte du HTML stocké en base Grist via `innerHTML` sans passer par le schéma de l'éditeur — un collaborateur ayant accès au document Grist (pas forcément au widget) peut y placer un payload qui s'exécute automatiquement à la prochaine ouverture, pour n'importe quel utilisateur — `v2/js/editor.js`.
5. **[Sécurité]** L'export « Impression navigateur » utilise `document.write()` sur le gabarit édité, ce qui **exécute réellement** tout `<script>`/gestionnaire d'événement qu'il contiendrait — `v2/js/pdf-export.js:2655-2664`.
6. **[Publication]** `CAHIER_DES_CHARGES.md` est corrompu (contient du code JavaScript V1 au lieu d'un cahier des charges) et aucun `README.md`/`LICENSE`/`CONTRIBUTING.md` n'existe à la racine — **le guide Grist.Gouv exige explicitement un README par widget** (§8), et la doctrine DINUM générale exige LICENSE/CONTRIBUTING pour un dépôt public.

---

## 2. Enjeu majeur RSSI — périmètre d'accès et surface d'attaque

*C'est, à notre sens, le point qui pèsera le plus lourd dans un audit RSSI : il ne s'agit pas d'un bug isolé mais d'une combinaison de facteurs qui, ensemble, déterminent ce qu'un attaquant peut atteindre s'il exploite l'une des failles listées en §3.*

### 2.1 `requiredAccess: 'full'` — la question centrale

`js/grist-api.js:47` demande le niveau d'accès **`'full'`** au document Grist — le niveau maximal possible pour un widget, permettant de lire ET d'écrire sur **toutes** les tables du document, pas seulement celle liée au widget dans la page. Ce choix n'est pas arbitraire : il est **nécessaire** avec l'architecture actuelle, pour trois usages vérifiés dès le démarrage du widget (avant toute interaction utilisateur) :
- création/lecture des tables internes (`Publipostage_Modeles`, `Publipostage_LiensTables`, `Publipostage_UserProbe`) ;
- résolution de variables `#Table.Colonne` faisant référence à une table AUTRE que celle liée au widget (fonctionnalité "règles de liaison entre tables") ;
- lecture des métadonnées `_grist_Tables`/`_grist_Tables_column` pour peupler l'autocomplétion `#Variable` sur l'ensemble du document.

**L'API plugin Grist ne propose que 3 niveaux** (`'none'` / `'read table'` / `'full'`) — confirmé par lecture du code source de Grist (`CustomSectionAPI.ts`) lors d'une recherche antérieure sur ce projet. `'read table'` limiterait à une lecture seule de la SEULE table liée, ce qui casserait ces trois usages dès le chargement du widget, pas seulement une fonctionnalité secondaire. **Il n'existe donc pas de niveau intermédiaire "lecture/écriture sur plusieurs tables nommées" dans l'API du widget elle-même** — react à cette contrainte en essayant de la contourner côté widget serait une fausse solution.

**Ce qui doit être présenté à la RSSI, concrètement :**
- Le choix `'full'` est techniquement justifié et documenté (pas un oubli de configuration) — mais il signifie que **toute vulnérabilité du widget (XSS, cf. §3) donne à un attaquant un accès en lecture/écriture sur l'intégralité du document Grist**, pas seulement sur les données affichées par le widget. C'est le facteur qui transforme les constats de §3 (autrement "seulement" des XSS côté client) en un risque de niveau document entier.
- **Le bon levier de mitigation n'est PAS côté code du widget** (l'API ne le permet pas), **mais côté configuration native Grist** : les "Règles d'accès" (Access Rules) de Grist, configurées par le propriétaire de CHAQUE document utilisant ce widget, permettent de restreindre ce qu'un UTILISATEUR (humain) peut lire/écrire, indépendamment de ce que le widget demande. C'est un point de configuration par déploiement, pas par le code — mais il doit être documenté clairement (README, guide de déploiement) pour que chaque administration sachant l'appliquer le fasse. **Recommandation concrète : rédiger une section "Sécurité et permissions" dans le futur README expliquant ce compromis et renvoyant vers la documentation Grist sur les Règles d'accès**, pour que la RSSI de chaque administration déployante puisse compenser au niveau document ce que le widget ne peut pas limiter lui-même.
- Réduire drastiquement la SURFACE DE CODE qui a besoin de cet accès complet (au lieu de réduire l'accès lui-même) est une piste réaliste : n'exécuter les appels `'full'` (résolution cross-table, tables internes) que lorsque la fonctionnalité correspondante est réellement utilisée, plutôt que systématiquement au démarrage — réduirait la FRÉQUENCE d'exposition sans changer le NIVEAU d'accès demandé. Non investigué en détail dans cet audit (nécessiterait une revue d'architecture dédiée), mais à évoquer comme piste face à la RSSI.

**Priorité : Important — sujet à documenter et discuter explicitement AVANT l'audit RSSI, pas un correctif de code ponctuel.**

### 2.2 Chaîne d'approvisionnement et souveraineté numérique

| Dépendance | Origine | Version | SRI/intégrité | Constat |
|---|---|---|---|---|
| `grist-plugin-api.js` | `docs.getgrist.com` (éditeur de Grist lui-même) | non-versionné (URL sans version) | Absente | Attendu et documenté — dépendance native au produit hôte. |
| 23 paquets ProseMirror/TipTap/`@floating-ui` | `esm.sh` (CDN public tiers, infrastructure non-française) | **Toutes pinnées** (ex. `@tiptap/core@3.31.3`) — bon point | Absente | `v2/index.html` (import map), également dupliqué dans `v2/smoke-test.html`. |
| pdfmake, html2pdf.js, JSZip | `cdnjs.cloudflare.com` (CDN public tiers) | Toutes pinnées | Absente | `v2/js/pdf-export.js:54-57`. |

**Pourquoi c'est un « très gros point » pour une RSSI** :
- **Aucun `integrity="sha384-..."` (Subresource Integrity)** sur aucun des scripts externes chargés — si l'un de ces CDN sert un contenu altéré (compromission du CDN, attaque de la chaîne d'approvisionnement, faille côté cdnjs/esm.sh déjà documentées publiquement par le passé pour d'autres projets), le navigateur exécute le contenu servi sans aucune vérification, avec le même niveau d'accès `'full'` au document Grist décrit en §2.1.
- **Souveraineté numérique** : le guide Grist.Gouv fourni par l'utilisateur cite explicitement "l'interopérabilité, la souveraineté numérique, l'accessibilité" comme contraintes du secteur public (§8). Dépendre à l'exécution de deux CDN commerciaux non-européens pour charger le MOTEUR MÊME de l'éditeur (ProseMirror/TipTap) et de l'export PDF (pdfmake) est en tension directe avec cet objectif — un widget hébergé sur l'instance officielle DINUM/ANCT qui reste indisponible/altérable si `esm.sh` ou `cdnjs` change de politique, a un incident, ou est bloqué par un pare-feu ministériel, est un risque opérationnel autant que sécuritaire.
- **Absence de SBOM** (Software Bill of Materials) : aucun inventaire formel des dépendances tierces (versions, licences) n'existe dans le dépôt — les versions sont éparpillées dans les URLs de l'import map, pas dans un fichier dédié facilement audité par un outil de Software Composition Analysis (SCA).

**Suggestions, par ordre d'effort croissant** :
1. **Immédiat, faible coût** : ajouter les attributs `integrity`/`crossorigin` sur les scripts CDN de `pdf-export.js` (cdnjs publie déjà des hashes SRI officiels pour ces bibliothèques) — ne couvre pas l'import map `esm.sh` (les imports ES ne supportent pas nativement `integrity` de la même façon), mais réduit déjà une partie du risque.
2. **Moyen terme** : auto-héberger (vendoriser) les bibliothèques critiques (ProseMirror/TipTap, pdfmake, JSZip) dans le dépôt lui-même plutôt que de dépendre d'un CDN à l'exécution — supprime la dépendance réseau ET le risque de chaîne d'approvisionnement pour ces paquets, au prix d'une mise à jour manuelle des versions (au lieu d'automatique via CDN).
3. **Documentation minimale immédiate** : lister ces dépendances (nom, version, CDN d'origine, licence) dans un fichier dédié (ex. `DEPENDENCIES.md` ou section du futur README) — même sans les vendoriser, ceci répond au minimum à l'exigence d'audit/traçabilité qu'une RSSI demandera.

**Priorité : Important** (points 1 et 3) **/ Mineur-mais-structurant** (point 2, vendorisation complète — décision produit à prendre avec l'équipe, hors du périmètre d'un simple correctif).

### 2.3 Fuite de données vers des tiers non maîtrisés

Déjà identifié en détail en §3.2 (S3) mais à relire sous l'angle RSSI : `v2/js/pdf-export.js:2105-2144` télécharge automatiquement, à CHAQUE export, toute image du gabarit dont l'URL n'est pas un `data:` URI — sans validation de domaine. Un gabarit partagé par un collaborateur pointant vers un serveur tiers permet à ce tiers de savoir qu'un export a eu lieu (adresse IP, user-agent), à l'insu de l'utilisateur exportateur. Combiné à l'accès `'full'` (§2.1), un tel gabarit pourrait aussi, en théorie, être conçu pour exfiltrer des informations si un futur code moins prudent venait à inclure des données de session dans une URL construite dynamiquement (non constaté aujourd'hui, mais un pattern à surveiller).

**Priorité : Mineur aujourd'hui, mais à mentionner explicitement à la RSSI comme un principe à valider (allowlist de domaines, ou confirmation explicite avant tout appel réseau sortant déclenché automatiquement).**

---

## 3. Sécurité applicative

### 3.1 Fuite de données personnelles en console (RGPD)

| Fichier:ligne | Constat | Priorité |
|---|---|---|
| `js/grist-api.js:61` | `console.log('[GristAPI] onRecord reçu:', { ..., record, ... })` affiche l'intégralité de la ligne Grist courante (nom, email, adresse... selon le contenu du document) dans la console, **sans condition**, à chaque changement de sélection. | **Important** |
| `js/grist-api.js:263-273` | Un `<div id="debug-rowid">` affiche en permanence "Ligne courante: X — reçu à HH:MM:SS" dans l'UI de production. Résidu de développement. | Mineur |

**Risque** : dans un contexte secteur public (RGPD), exposer des données personnelles en clair dans les outils de développement du navigateur — accessible à quiconque ouvre la console, y compris via une extension navigateur tierce — est une non-conformité facilement identifiable en audit.
**Suggestion** : retirer ces deux instructions, ou les conditionner à un flag de debug explicite (`localStorage.pp_debug`) absent par défaut.
**Impact fonctionnel d'une correction** : nul (purement du logging).

### 3.2 Injection HTML non assainie (XSS)

| Fichier:ligne(s) | Constat | Priorité |
|---|---|---|
| `v2/js/editor.js:2480, 2527/2532, 2638, 2730, 2740` | Le HTML des zones d'en-tête/pied de page (`headerFooterDraft`, chargé tel quel depuis une colonne Grist `HeaderFooter` via `setHeaderFooterData`, ligne 2368) est injecté via `innerHTML` sur des éléments **réellement attachés au DOM visible**, sans jamais repasser par le schéma contraint de l'éditeur (contrairement à `getHTML()`/`setHTML()` qui, eux, sont sains). Un `<img src=x onerror="...">` placé dans cette colonne par n'importe quel collaborateur du document Grist (pas nécessairement un utilisateur du widget) s'exécute **automatiquement** dès qu'un utilisateur charge ce modèle — aucune action explicite requise. | **Important** |
| `v2/js/pdf-export.js` (7 points : lignes ~352-368, 991, 1040-1045, 2046-2047, 2515-2518, 2701-2710) | Tous les hôtes de mesure/rendu hors-écran utilisés pour construire le PDF injectent le gabarit via `innerHTML` sur du DOM **attaché** à `document.body`. `innerHTML` neutralise les `<script>`, mais **pas** les gestionnaires d'événements inline (`onerror`, `onload`) sur un nœud vivant — ils s'exécutent dès l'insertion, à chaque export. | **Important** |
| `v2/js/pdf-export.js:2655-2664` (`exportViaBrowserPrint`) | `document.write(... + container.outerHTML + ...)` : contrairement à `innerHTML`, `document.write` **exécute réellement les balises `<script>`** présentes dans le flux. C'est le vecteur le plus net du projet (exécution de code, pas seulement de gestionnaire d'événement). | **Important** |
| `v2/js/variables.js:610-613, 553-558` | Dans la modale de configuration de liaison entre tables, les noms de colonne/table Grist (`colId`, nom de table référencée) sont interpolés sans échappement dans une chaîne `<option>` injectée en `innerHTML`. Aujourd'hui ces identifiants sont contraints par l'UI standard de Grist, donc peu exploitables en pratique — mais rien ne le garantit si un identifiant est créé via l'API REST Grist en contournant l'éditeur. | Important |
| `v2/js/pdf-export.js:2105-2144` (`inlineEditorImagesAsDataUri`, S3) | `fetch(src)` vers n'importe quelle URL non-`data:` présente dans le gabarit, sans validation de schéma/hôte, à **chaque export**. Cf. §2.3. | Mineur |

**Point important à noter pour l'audit DINUM/RSSI** : `js/reader-mode.js` (qui résout les valeurs `#Table.Colonne` avec les VRAIES données Grist) a été vérifié **sain** — il utilise systématiquement `textContent`, jamais `innerHTML`, pour insérer une valeur de cellule. **Le vecteur d'attaque n'est donc pas "une donnée métier arbitraire dans une cellule Grist", mais le gabarit HTML du modèle lui-même** (et les données d'en-tête/pied de page), que n'importe quel collaborateur ayant un accès en édition au document Grist peut modifier — même sans jamais ouvrir ce widget. **Voir §2.1 pour la mise en perspective avec le niveau d'accès `'full'` du widget.**

**Suggestion générale** : introduire une fonction unique d'assainissement HTML (retrait des balises `<script>`, des attributs `on*`, des URLs `javascript:`) appliquée systématiquement **avant** toute insertion DOM (`innerHTML`/`outerHTML`/`document.write`) du gabarit ou des données d'en-tête/pied — un seul point de correction plutôt que ~10 sites d'insertion à corriger un par un.
**Impact fonctionnel** : correction non risquée pour les fonctionnalités existantes si l'assainissement est bien ciblé (retrait de scripts/handlers uniquement, pas de reformatage du HTML) ; à tester sur un gabarit riche existant (tableaux, images, 2-colonnes) pour confirmer qu'aucune balise légitime n'est perdue.

### 3.3 Permissions et intégrité des tables internes Grist

| Fichier:ligne(s) | Constat | Priorité |
|---|---|---|
| `js/grist-api.js:10` vs `js/templates.js:4` vs `v2/dev-tests/grist-stub.js:44` | Le nom de la table interne `Publipostage_Modeles` est recopié en dur à 3 endroits indépendants au lieu d'être lu depuis une seule source (`Templates.TABLE_NAME`, déjà exporté mais jamais réutilisé). Un renommage futur non répercuté partout ferait réapparaître la table des modèles comme table "normale" dans les sélecteurs de variables. | Important |
| `js/grist-api.js:8-10, 376-378` | La détection des tables internes (`Publipostage_Modeles`/`_LiensTables`/`_UserProbe`) ne vérifie que le NOM, jamais la forme des colonnes. Si un document Grist contient déjà une table portant l'un de ces noms par coïncidence, le widget la traite comme sienne et lit/écrit dessus avec le schéma attendu — risque de corruption de données utilisateur préexistantes. | Important |
| `js/grist-api.js:572-604` | `getCurrentUserEmail()` ne cache que le résultat final, pas la promesse en vol : plusieurs résolutions de chip email en parallèle (ex. en-tête + pied de page) déclenchent chacune leur propre cycle `AddTable`/`AddRecord`/`RemoveRecord`. De plus, `ensureUserProbeTable()` n'a pas de `try/catch` autour de l'`AddTable`, contrairement à sa fonction sœur `ensureLinksTableExists` — une exception ici remonte sans être rattrapée. | Important |

**Suggestion** : faire de `Templates.TABLE_NAME` la source unique de vérité ; ajouter une vérification légère du schéma attendu avant de faire confiance à une table existante ; mémoriser la promesse en cours dans `getCurrentUserEmail()` plutôt que seulement son résultat, et envelopper `AddTable` d'un `try/catch` par cohérence avec le reste du fichier.
**Impact fonctionnel** : faible risque, changements localisés et non intrusifs.

---

## 4. Intégrité des données — état de module et concurrence (`pdf-export.js`)

| Fichier:ligne(s) | Constat | Priorité |
|---|---|---|
| `v2/js/pdf-export.js:110-111` (état module `footnoteCounter`/`footnoteEntries`) + `1075-1087` (`twoColumnsFrom` utilise `Promise.all` sur les 2 colonnes) | Les deux colonnes d'une zone 2-colonnes sont traitées en **parallèle**, chacune via son propre appel à `buildPdfContentFromRoot`, qui réinitialise `footnoteCounter = 0` en entrée. Si les deux colonnes contiennent chacune une note de bas de page, l'exécution concurrente peut faire qu'une colonne réinitialise le compteur pendant que l'autre est encore en train de l'incrémenter — **numérotation ou texte de note corrompu(e) silencieusement**, sans erreur visible, dans un export PDF pourtant présenté comme fiable. Reproductible avec un simple export normal (pas besoin d'interaction inhabituelle). | **Important** |
| `v2/js/main.js` (boutons d'export, ~lignes 161-175/214+) | Aucun verrou n'empêche de déclencher un second export pendant qu'un premier est en cours (bouton non désactivé pendant l'opération asynchrone). Deux exports simultanés partageraient le même état de module (`footnoteCounter`), avec un risque de corruption croisée **entre deux enregistrements Grist différents**. | **Important** |

**Suggestion** : à court terme, désactiver les boutons d'export pendant une opération en cours (correctif simple, `main.js`) ; à plus long terme, threader l'état des notes de bas de page en paramètre plutôt qu'en variable de module partagée (plus invasif, à faire avec des tests de non-régression ciblés sur `dev-tests/scenarios-headerfooter.js`/notes).
**Impact fonctionnel** : le verrou de bouton est sans risque. Le threading de l'état des notes touche un mécanisme central utilisé par tous les chemins (flux principal, tableaux, 2-colonnes) — à faire prudemment, avec la suite de tests automatisés comme filet de sécurité.

---

## 5. Qualité de code — redondance et « mille-feuille »

### 5.1 `v2/js/editor.js` (3316 lignes)

| Constat | Lignes | Priorité |
|---|---|---|
| `captureSelection`/`withSavedSelection` copiées à l'identique dans 3 fonctions (`wireColorPickers`, `wireSelectionDependentSelects`, `wireCompactFontSizeControls`) | 1780-1788, 3163-3171, 3197-3205 | Important |
| Motif « patcher les attributs d'un nœud + restaurer la NodeSelection + dispatch » réimplémenté 3 fois (`updateAttrs`, `updateSelectedImage`, `updateSelectedBadge`) | 1235-1256, 1964-1977, 2184-2193 | Important |
| Cycle de glisser (mousedown→mousemove→mouseup) réécrit à la main 3 fois (poignée 2-colonnes, redimensionnement image, déplacement image) — chaque nettoyage est correct, mais le patron est dupliqué | 999-1004, 1308-1310, 1354-1356 | Mineur |
| Commentaire obsolète référençant un mécanisme à drapeau (`suppressNextFootnoteOutsideCheck`) qui n'existe plus dans le code actuel (remplacé par une vérification directe, ligne 287) | 585-588 | Mineur |
| Préfixe de log incohérent `[editor]` (minuscule) au lieu de `[Editor]` partout ailleurs | 3307 | Cosmétique |

**Aucun code mort trouvé** (pas de fonction/variable inutilisée, pas de branche toujours vraie/fausse, pas de `TODO` oublié). **Aucune fuite de portée de variable** (pas de globale accidentelle, tout l'état reste dans l'IIFE).

**Structure** : le fichier est **trop long pour sa propre lisibilité** malgré un code interne propre — pertinent aussi au regard du critère « portée fonctionnelle raisonnablement étroite » du guide Grist.Gouv (§8). Découpage recommandé, sans dépendance circulaire :
1. Nœuds/extensions TipTap personnalisés (image, 2-colonnes, saut de page, variables, notes...) → `editor-nodes.js`
2. Barres d'outils flottantes contextuelles (image, tableau, variable) → `floating-toolbars.js`
3. Mode en-tête/pied de page + aperçu de pagination → `header-footer-preview.js` (contient aussi le point de sécurité §3.2 — l'isoler faciliterait un futur correctif ciblé)
4. Barre d'outils statique principale → `main-toolbar.js`
5. Cœur du module (`init`, `getHTML`/`setHTML`, API publique) → reste dans `editor.js`, réduit à un point d'assemblage.

### 5.2 `v2/js/pdf-export.js` (2757 lignes)

| Constat | Lignes | Priorité |
|---|---|---|
| Détection d'image flottante (5 lignes identiques au caractère près) dupliquée entre `cellLineToPdfObject` et `blockFrom` | 781-785, 1613-1617 | Mineur |
| Construction de l'objet `_floatCarry` (mêmes 5 champs, même formule) refaite 3 fois dans `blockFrom` | 1636-1641, 1702-1707, 1775-1780 | Mineur |
| Largeur de page A4 codée en dur 6 fois sous 3 formes différentes, dont 4 qui recalculent une constante déjà nommée (`CONTENT_WIDTH_PT`) | 174, 921, 1037, 1404, 1637, 1704, 1777 | Mineur |
| `blockFrom` (~180 lignes) cumule routage par tag, 3 variantes de gestion d'image flottante, segmentation de paragraphe, cas titre/tâche/citation | 1608-1788 | Mineur |
| 3 étapes de post-traitement (sommaire, ancrage d'images en attente, résolution des zones d'en-tête/pied) **sans** `try/catch` de repli, contrairement à toutes les conversions de bloc — une exception ici fait échouer l'export ENTIER au lieu de dégrader une seule zone | 1885-1889, 1894, 2486-2536 | **Important** |
| Une image "au cœur du texte" non flottante, présente dans le MÊME paragraphe qu'une image flottante, est silencieusement perdue (jamais poussée en bloc) | 1380-1420 | Mineur |

**Point positif à noter** : la duplication entre les 3 chemins de rendu (cellule de tableau / flux principal / zone 2-colonnes) est **largement justifiée** — ils produisent des structures pdfmake réellement différentes (stack de cellule vs contenu top-level vs colonnes), et les briques transverses (mesure d'indentation, marqueurs de liste, habillage flottant) sont déjà bien factorisées et réutilisées par les 3. Une fusion forcée serait plus risquée que la duplication résiduelle listée ci-dessus.

**Structure** : découpage naturel identifié (mesure DOM générique / conversion HTML→pdfmake flux principal / tableaux / zones 2-colonnes / images en calque+habillage flottant, le bloc le plus long ~700 lignes / en-têtes-pieds / orchestration+export). Suit exactement les sections déjà délimitées par les commentaires du fichier lui-même.

### 5.3 Autres fichiers

| Fichier:ligne | Constat | Priorité |
|---|---|---|
| `js/templates.js:118-121` | Boucle de validation qui ne peut structurellement jamais se déclencher (`!(column in columns)` sur un objet qui vient d'être construit avec exactement ces clés) — fausse impression de garde-fou. | Mineur |
| `v2/js/variables.js:82-87` | Les libellés d'onglets du panneau `#` (singleton créé une seule fois) ne sont jamais retraduits si l'utilisateur change de langue après la première ouverture du panneau — contrairement au reste du panneau, reconstruit à chaque ouverture. | Mineur |
| `v2/js/i18n.js:323,328` | Le paramètre `root` d'`applyTranslations(root)` n'est en pratique jamais utilisé (aucun module ne crée dynamiquement d'élément `data-i18n*` ni n'appelle la fonction avec un argument) — fonctionnalité prête mais jamais exercée, à documenter comme telle ou à retirer. | Cosmétique |
| `v2/js/main.js:533` | `GristAPI.init()` continue même en cas d'échec (try/catch qui n'interrompt pas la suite) — probablement voulu (résilience) mais non commenté à cet endroit précis. | Mineur |
| `v2/js/editor.js:25` | Pas de `'use strict'` en tête de l'IIFE — aucune fuite constatée en pratique, mais coût nul à ajouter en défense en profondeur. | Cosmétique |

### 5.4 Portée des variables — jugement global

Aucune fuite de portée trouvée dans les fichiers audités (pas de globale accidentelle, pas de `var`, pas de collision de nom entre scopes imbriqués). Le point réellement sensible est celui de la §4 (état de module partagé entre exécutions concurrentes dans `pdf-export.js`), pas une fuite classique de portée lexicale.

---

## 6. Fichiers, inventaire, publication

### 6.1 Fichiers orphelins / à statut clarifier dans `v2/`

| Fichier | Statut constaté | Recommandation | Priorité |
|---|---|---|---|
| `v2/js/mailto-export.js` | Scaffold non câblé (aucun `<script>` ne le charge), mais son propre en-tête l'indique déjà clairement ("SCAFFOLD, pas encore implémenté") | Garder tel quel, rien à corriger | — |
| `v2/smoke-test.html` | Orphelin à la racine de `v2/` (même niveau que le code de production), non listé dans `dev-tests/README.md`, mais cité en dur dans 2 commentaires (`v2/index.html:16`, `v2/js/editor.js:2971`) | Déplacer dans `v2/dev-tests/` (ou un sous-dossier `manual/`), mettre à jour les 2 commentaires qui le citent, l'ajouter au README de dev-tests | Mineur |
| `v2/templates-gallery/*/schema.py` | **Réellement exécuté** (parsé par regex via `template-gallery.js:68-92` pour créer une vraie table Grist) — pas juste de la documentation humaine, contrairement à ce que son extension `.py` pourrait laisser croire | Ajouter un `v2/templates-gallery/README.md` expliquant le rôle de chaque fichier (`manifest.json`, `template.html`, `schema.py`, `screenshot.svg`) et le format exact attendu pour `schema.py` | Mineur |
| `v2/_test-harness.html` | Généré à la demande, jamais commité (`.gitignore` documenté) | Cohérent, rien à faire | — |

### 6.2 Racine du dépôt

| Fichier | Constat | Recommandation | Priorité |
|---|---|---|---|
| `CAHIER_DES_CHARGES.md` | **Confirmé corrompu** : contient le module `Variables` V1 (JavaScript brut, Quill) au lieu d'un cahier des charges. Le vrai contenu existe encore dans l'historique git (`git show 33d7784:CAHIER_DES_CHARGES.md`), écrasé par un commit ultérieur (`fd5d69c`, message générique suspect, qui modifie aussi `js/grist-api.js` dans le même commit — signe d'un écrasement accidentel lors d'un push scripté). | Régénérer le contenu depuis `33d7784`, le mettre à jour pour refléter la V2 (aujourd'hui à parité fonctionnelle), ou le supprimer si le projet préfère documenter le périmètre uniquement via un futur `README.md`/`VERSIONING.md`. **Ne pas se contenter de restaurer `33d7784` tel quel** (ne décrirait que la V1). | **Important** — un fichier nommé "cahier des charges" contenant du code sans rapport est le genre de détail qui discrédite un dépôt aux yeux d'un relecteur externe. |
| `VERSIONING.md` | Périmé pour V2 : dernière entrée `v0.10` (2026-09-08), alors que la V2 est activement développée jusqu'au 12/09 (settings, correctifs export PDF, suite de tests — invisibles dans ce fichier). | Soit indiquer explicitement en tête que ce fichier ne couvre que la V1, soit le compléter avec les jalons V2. | Mineur |
| `README.md`, `LICENSE`, `CONTRIBUTING.md` | **Absents** de la racine. Le guide Grist.Gouv exige explicitement un README **par widget** (objet, configuration, dépendances — cf. §8) ; la doctrine DINUM générale attend en plus LICENSE (permissive) et CONTRIBUTING.md pour un dépôt public. | À créer avant publication officielle — voir §8 pour le contenu minimal attendu du README selon le guide Grist.Gouv. | **Important** |
| Nom du dépôt (`publipostageGrist`) | Le guide Grist.Gouv recommande le format `grist-widget-[nom-fonctionnel]` (ex. `grist-widget-publipostage`) pour la découvrabilité dans l'écosystème. | Envisager un renommage avant publication officielle (impact : mise à jour de l'URL GitHub Pages et de tout lien existant). | Mineur |
| `.gitignore` | Cohérent avec l'état actuel du projet (V2 + dev-tests pris en compte), vérifié en pratique. | Rien à faire. | — |

### 6.3 Références croisées V1 ↔ V2

Toutes les références croisées trouvées (V2 → `../js/grist-api.js`/`templates.js`/`reader-mode.js`/`../css/*`, `pdf-export.js` → `../js/pdf-fonts(-extra).js`) sont accompagnées d'un commentaire explicite justifiant le partage. **Aucune référence accidentelle détectée.**

---

## 7. Accessibilité (RGAA) — signalement, pas un audit RGAA complet

Le secteur public français est soumis au RGAA (106 critères, 13 thèmes — DINUM), et le guide Grist.Gouv cite explicitement l'accessibilité comme une contrainte du secteur public (§8). Un audit RGAA complet est hors du périmètre de cette passe, mais 3 points substantiels sont ressortis :

| Constat | Fichier(s) | Priorité | Référence |
|---|---|---|---|
| Aucune des 5 fenêtres modales n'a `role="dialog"`/`aria-modal="true"` ; le focus clavier n'est jamais déplacé à l'ouverture ni restitué à la fermeture ; la touche Échap n'est pas gérée. | `v2/index.html`, `v2/js/main.js`, `v2/js/settings.js` | **Important** | RGAA 12.7/12.8 (WCAG 2.1 SC 2.4.3, 4.1.2) |
| 3 champs texte n'ont qu'un `placeholder`, sans `aria-label`/`<label>` associé (nom de modèle, nom de fichier PDF, recherche de galerie) — un `placeholder` seul n'est pas une alternative accessible fiable. | `v2/index.html` (lignes 67, 114, 262) | Mineur | RGAA thème formulaires |
| Les modales utilisent `style="display:none"` + bascule JS, alors que le panneau Réglages (même fichier) utilise l'attribut natif `hidden` — deux conventions cohabitent sans qu'un choix soit expliqué. | `v2/index.html` | Cosmétique | — |

**Recommandation** : prévoir un audit RGAA dédié avant publication officielle (hors périmètre de cet audit de code), au minimum sur les points ci-dessus qui sont peu coûteux à corriger (ajout d'attributs ARIA, piège à focus, gestion d'Échap).

---

## 8. Conformité au guide de contribution Grist.Gouv

*Guide fourni par l'utilisateur : « Contributing Guide — Grist.Gouv Widgets », DINUM/ANCT, dernière mise à jour juillet 2026. Ce guide régit spécifiquement la contribution de widgets à l'instance souveraine Grist.Gouv (déploiement interministériel de Grist) — distinct de la doctrine générale de publication de code source déjà citée en §9 (ex-§7 de la version précédente de ce rapport).*

### 8.1 Les deux voies de publication

Le guide décrit deux chemins : **Voie A** (l'équipe Grist.Gouv découvre et « fork » un widget publié publiquement — aucune démarche active requise, mais plus le widget respecte déjà les critères qualité, plus il est « fork-ready ») et **Voie B** (héberger le widget sur l'instance officielle DINUM/ANCT — exige de suivre les 4 étapes du guide ET une **revue de sécurité** avant tout déploiement en production). **La mention d'un audit DINUM par l'utilisateur place clairement ce projet sur la Voie B** — tous les critères ci-dessous sont donc à satisfaire, pas seulement à titre indicatif.

### 8.2 Grille de conformité détaillée

| Exigence du guide | État actuel du projet | Écart | Priorité |
|---|---|---|---|
| **README.md** expliquant : ce que fait le widget, comment le configurer, ses dépendances | Absent (cf. §6.2) | À créer — contenu minimal : objet du widget (publipostage/mail-merge sur données Grist), configuration (liaison de table, règles de correspondance cross-table, réglages langue/touche `#`), dépendances (TipTap/ProseMirror, pdfmake, JSZip, avec origines CDN — cf. §2.2) | **Important** |
| **Portée fonctionnelle raisonnablement étroite** ("si votre widget semble faire plusieurs métiers différents, envisagez de le scinder") | Le widget fait : édition riche + export PDF + galerie de modèles + résolution de variables cross-table + réglages i18n. Peut se justifier comme UN seul métier cohérent ("publipostage documentaire"), mais le volume de code (~11 850 lignes) et la taille de certains fichiers (`editor.js` 3316 lignes) vont dans le sens d'une préoccupation légitime sur ce critère. | À argumenter explicitement dans le README (pourquoi ce périmètre reste un seul widget cohérent) plutôt qu'à découper en plusieurs widgets — une explication claire suffit probablement à satisfaire l'esprit du critère. | Mineur |
| **Tests** : fonctionnalités cœur couvertes par des tests unitaires ; au moins un scénario d'intégration (création de document, interaction widget) | `v2/dev-tests/` couvre ~85 scénarios (formatage, listes, tableaux, 2-colonnes, images, export PDF vectoriel...) — un socle réel et non négligeable. **Mais** : ce sont des tests pilotés manuellement depuis la console navigateur contre un `grist-stub.js` (pas une vraie exécution Grist), pas une suite automatisée exécutable en CI/CD, et rien ne teste le scénario "création de document réel + interaction widget" avec l'API Grist réelle (résolution `#Variable` réelle explicitement documentée comme non testable en local, cf. `dev-tests/README.md`). | Documenter clairement dans le README ce que couvre/ne couvre pas la suite actuelle ; envisager, a minima, un script qui exécute la suite automatiquement (headless) plutôt qu'à la main, même sans aller jusqu'à un vrai test d'intégration Grist réel. | Important |
| **Lisibilité/maintenabilité** : code compréhensible par un humain sans IA, noms explicites | Conforme dans l'ensemble (cf. §5 — conventions de nommage homogènes, commentaires expliquant le "pourquoi") — sous réserve des points de duplication/longueur de fichier déjà listés en §5. | Aucun écart bloquant, nettoyages recommandés en §5. | — |
| **Concis, pas de verbosité excessive** ("Les outils IA ont tendance à générer du code plus long que nécessaire... les relecteurs devraient pouvoir lire la logique de votre widget d'une traite") | Les fichiers `editor.js` (3316 lignes) et `pdf-export.js` (2757 lignes) ne permettent PAS une lecture "d'une traite" par un relecteur — c'est le point le plus directement testé par ce critère du guide. Le code interne à chaque fonction reste cependant loin d'être verbeux artificiellement (audit §5 : peu de code mort, peu de sur-ingénierie) — la longueur vient du nombre de fonctionnalités réelles empilées dans peu de fichiers, pas de code inutilement bavard. | Le découpage en modules proposé en §5.1/§5.2 répond directement à ce critère. | Important |
| **Pas de duplication de code inter-widgets** ("le code partagé doit vivre dans un module commun, pas être copié-collé") | Vérifié : les 3 chemins de rendu PDF (cellule/flux/2-colonnes) réutilisent déjà les briques transverses communes (cf. §5.2, point positif) ; les duplications résiduelles trouvées (§5.1, §5.2) sont internes à un même fichier, pas entre widgets distincts. | Pas d'écart sur l'esprit du critère (un seul widget dans ce dépôt), les duplications internes restent à traiter par ailleurs (§5). | — |
| **« Safe »** : pas d'appel à des services externes non documentés, pas de stockage de données utilisateur hors de Grist | **Écart direct** : les appels aux CDN `esm.sh`/`cdnjs.cloudflare.com` (§2.2) sont des services externes — actuellement non documentés dans le dépôt (aucun fichier ne les liste comme dépendances assumées). Le fetch d'images externes à chaque export (§2.3) est un appel réseau automatique vers un tiers potentiellement non maîtrisé. **Aucune donnée utilisateur n'est stockée hors de Grist** (vérifié : seuls `pp_lang`/`pp_trigger_char`, des préférences d'interface, vivent en `localStorage` — aucune donnée métier). | Documenter explicitement les CDN comme dépendances assumées (§2.2, suggestion 3) répond en grande partie à "non documentés" ; le fetch d'image à l'export mérite une clarification produit (comportement voulu ou à encadrer). | **Important** |
| **Aucune dépendance/dette inutile, pas de code mort** ("Minimal: no unnecessary dependencies, no dead code") | Aucun code mort trouvé dans les fichiers les plus audités (§5.1) ; 2 exports morts trouvés dans `grist-api.js` (`getCurrentOptions`/`getCurrentMappings`, jamais appelés) — mineur, à retirer ou documenter comme API publique volontaire. | Retirer les 2 exports inutilisés, ou expliquer pourquoi ils sont conservés (API publique du module). | Mineur |
| **Canal de signalement de vulnérabilité** (VDP gouvernemental, jamais d'issue publique) | Aucun fichier `SECURITY.md` dans le dépôt indiquant ce canal. | Ajouter un `SECURITY.md` référençant le VDP (`https://vdp.numerique.gouv.fr/p/Policy`) ou le canal Tchap approprié, une fois le widget effectivement rattaché à l'écosystème Grist.Gouv. | Mineur (dépend du calendrier de rattachement officiel) |
| **Convention de nommage du dépôt** : `grist-widget-[nom-fonctionnel]` | Dépôt actuellement nommé `publipostageGrist`. | Cf. §6.2 — renommage à envisager avant soumission officielle. | Mineur |
| **Revue par l'équipe Grist.Gouv** : pertinence, qualité technique (lisible/testé/maintenable), sécurité (risques données/infrastructure) | — | C'est très exactement la structure adoptée par ce rapport (§2-§7 = sécurité/RSSI, §5 = qualité technique, cet audit lui-même répond à l'exigence de préparation à cette revue). | Info |

### 8.3 Point d'attention transverse : contributions assistées par IA

Le guide est explicite : *« Le code assisté par IA doit être compris, lu et testé par un humain avant soumission »* — et prévient contre la verbosité générée par les outils IA. Ce projet a été développé avec une assistance IA importante (historique visible dans les commentaires, très nombreux et détaillés). **Ce n'est pas un problème en soi** (le guide l'autorise explicitement), mais cela renforce l'intérêt des recommandations de §5 (découpage, réduction de duplication) : un relecteur humain de l'équipe Grist.Gouv devra pouvoir suivre la logique de chaque fichier sans reconstituer tout l'historique des correctifs successifs qui l'ont produit.

---

## 9. Contexte réglementaire général (doctrine DINUM/RGS/RGAA/OWASP)

*Recherche complémentaire au guide Grist.Gouv (§8), sur la doctrine DINUM générale de publication de code source (pas spécifique à l'écosystème Grist.Gouv). Sources consultées le 2026-09-12.*

- **Doctrine DINUM pour la publication de code source public** : licences permissives recommandées, transparence (code source ouvert y compris des algorithmes), audit sécurité, SBOM/analyse de composants (dépendances tierces) — cf. §2.2 pour l'écart constaté sur ce dernier point.
- **Checklist de publication (code.gouv.fr)** : README.md, LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG, aucune donnée sensible dans le dépôt, tags de version sémantiques. → **Vérifié dans ce dépôt** : aucun secret trouvé (recherche globale), mais README/LICENSE/CONTRIBUTING manquants (§6.2).
- **RGS (Référentiel Général de Sécurité, ANSSI/DINUM)** : cadre de sécurité des échanges électroniques des administrations, audits de conformité réguliers. Pertinent pour la partie "accès Grist"/API de ce widget (§2, §3.3).
- **RGAA (accessibilité numérique, DINUM)** : 106 critères / 13 thèmes, obligatoire pour un service public numérique. Cf. §7.
- **OWASP (sécurité applicative)** : pour le client-side JS, la prévention XSS repose sur l'encodage contextuel en SORTIE (pas juste le filtrage en entrée) — c'est exactement le principe qui manque aux points listés en §3.2 (le gabarit est injecté tel quel, sans encodage/assainissement adapté au contexte HTML).

**Sources** :
- [code.gouv.fr — Ouvrir un projet numérique](https://documentation.ouvert.numerique.gouv.fr/guides/ouvrir/)
- [ANSSI/cyber.gouv.fr — Open-source dans l'administration](https://cyber.gouv.fr/enjeux-technologiques/open-source/)
- [ANSSI/cyber.gouv.fr — Référentiel Général de Sécurité (RGS)](https://cyber.gouv.fr/reglementation/reglementation-identite-confiance-numerique/securite-echanges-voie-electronique/referentiel-general-de-securite/)
- [RGAA — critères d'accessibilité (Handinova, synthèse)](https://handinova.fr/accessibilite-numerique-les-106-criteres-du-rgaa/)
- [OWASP Secure Coding Practices](https://codesigncert.com/resources/owasp-secure-coding-practices-guide)
- [Grist Help Center — Widget custom / requiredAccess](https://support.getgrist.com/widget-custom/)
- « Contributing Guide — Grist.Gouv Widgets » (DINUM/ANCT, juillet 2026, fourni par l'utilisateur)

---

## 10. Ce qui fonctionne déjà bien (à ne pas perdre en corrigeant le reste)

- **Résolution des variables Grist (`reader-mode.js`)** : systématiquement via `textContent`, jamais `innerHTML` — le vecteur XSS identifié en §3.2 vient du gabarit/de l'en-tête-pied, pas d'une valeur de cellule métier.
- **Cohérence de style remarquable** dans `editor.js`/`pdf-export.js` : conventions de nommage homogènes (`createXxx`/`wireXxx`/`ensureXxx`), gestion d'erreur `try/catch` + repli systématique, commentaires en français expliquant systématiquement le "pourquoi" (bug réel constaté) plutôt que de paraphraser le code.
- **Suite de tests automatisés** (`v2/dev-tests/`, ~85 scénarios) déjà en place et à jour — un vrai filet de sécurité pour les corrections proposées ici, en particulier pour les refactorings de §5, et une réponse partielle (à documenter/étoffer, cf. §8.2) au critère "Tests" du guide Grist.Gouv.
- **Duplication déjà justifiée et documentée** entre les 3 chemins de rendu PDF (cellule/flux principal/2-colonnes) — pas un défaut, un choix assumé, conforme à l'esprit du critère anti-duplication du guide Grist.Gouv (§8.2).
- **Versions de dépendances externes systématiquement pinnées** (jamais de `@latest`) — bon point partiel pour la chaîne d'approvisionnement (§2.2), il manque l'intégrité (SRI) et l'hébergement local pour compléter le tableau.
- **Choix `requiredAccess: 'full'` documenté et techniquement justifié** (§2.1) — ce n'est pas une négligence de configuration, un point qui jouera en faveur du projet dans la discussion avec la RSSI même si le niveau d'accès lui-même reste un point de vigilance.

---

## 11. Prochaines étapes proposées

1. **Décider du calendrier de rattachement à l'écosystème Grist.Gouv** (Voie A ou B, cf. §8.1) — conditionne l'urgence du `SECURITY.md`/canal VDP et du renommage du dépôt.
2. **Traiter les 6 points de la synthèse exécutive (§1)** — enjeu RSSI (§2) et sécurité applicative (§3) d'abord, fichiers de publication en parallèle (faible risque, peut être fait indépendamment).
3. **Préparer le dossier RSSI** (§2) : rédiger la section "Sécurité et permissions" du futur README (accès `'full'` justifié + renvoi vers les Règles d'accès Grist natives comme mitigation côté déploiement), documenter/vendoriser les dépendances CDN, clarifier le comportement de fetch d'image externe.
4. **Rédiger le README requis par le guide Grist.Gouv** (§8.2) en couvrant explicitement : objet, configuration, dépendances (avec origines CDN), portée fonctionnelle assumée, état de la suite de tests.
5. Une fois les points Important de sécurité traités : passe de nettoyage qualité (§5), en commençant par les duplications à faible risque (constantes, petites factorisations) avant les refactorings plus structurants (découpage de fichiers, §5.1/§5.2 — répond aussi au critère "concision" du guide, §8.2).
6. Prévoir séparément un audit RGAA dédié (§7) et la constitution du dossier de sécurité RGS (§9).

Aucun fichier de code n'a été modifié dans le cadre de cet audit.
