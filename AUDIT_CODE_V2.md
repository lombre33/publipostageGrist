# Audit de code — Publipostage Grist V2 (préparation publication + audit DINUM)

**Date** : 2026-09-12
**Périmètre** : tous les fichiers chargés en production par `v2/index.html`, y compris les fichiers V1 partagés (`js/grist-api.js`, `js/templates.js`, `js/reader-mode.js`, `css/style.css`, `css/roboto-fonts.css`), plus l'inventaire du dossier `v2/` et de la racine du dépôt. La V1 « pure » (`index.html` racine, `js/editor.js`, `js/main.js`, `js/pdf-export.js`, `js/html-source-tab.js`, `js/variables.js`, `js/pdf-fonts*.js` — jamais chargés par la V2) est **hors périmètre**.
**Méthode** : lecture intégrale de chaque fichier (aucune modification), en 4 lots parallèles + vérifications ponctuelles manuelles. ~11 850 lignes de code auditées sur 18 fichiers de production, plus l'inventaire complet de `v2/` et de la racine.

**⚠️ Ce rapport n'intègre PAS encore les recommandations spécifiques DINUM** (le document annoncé en pièce jointe n'est pas arrivé) — il s'appuie sur la doctrine publique connue (code.gouv.fr, RGS/ANSSI, RGAA) et les bonnes pratiques générales (OWASP, qualité JS). **À relire et compléter dès réception du document DINUM.**

## Comment lire ce rapport

Chaque constat porte un niveau de priorité :
- **Bloquant** : à corriger avant toute publication/audit.
- **Important** : à corriger avant l'audit DINUM, risque réel (sécurité, données, corruption silencieuse).
- **Mineur** : à corriger si le temps le permet, pas de risque immédiat.
- **Cosmétique** : nettoyage optionnel.

Aucun **Bloquant** n'a été trouvé (rien n'empêche le fonctionnement actuel). En revanche plusieurs **Important** touchent la sécurité et l'intégrité des données — à traiter en priorité.

---

## 1. Synthèse exécutive

| Catégorie | Bloquant | Important | Mineur | Cosmétique |
|---|---|---|---|---|
| Sécurité (XSS / RGPD / permissions) | 0 | 7 | 2 | 0 |
| Intégrité des données (concurrence) | 0 | 2 | 0 | 0 |
| Qualité de code (redondance, structure) | 0 | 6 | 8 | 4 |
| Fichiers / publication | 0 | 2 | 3 | 0 |
| Accessibilité (RGAA) | 0 | 1 | 1 | 1 |
| **Total** | **0** | **18** | **14** | **5** |

**Les 5 points à traiter en priorité absolue avant l'audit DINUM :**

1. **[Sécurité]** Un log console expose l'intégralité de chaque ligne Grist sélectionnée (potentiellement des données personnelles : noms, emails, adresses) — `js/grist-api.js:61`.
2. **[Sécurité]** Le mode en-tête/pied de page injecte du HTML stocké en base Grist via `innerHTML` sans passer par le schéma de l'éditeur — un collaborateur ayant accès au document Grist (pas forcément au widget) peut y placer un payload qui s'exécute automatiquement à la prochaine ouverture, pour n'importe quel utilisateur — `v2/js/editor.js`.
3. **[Sécurité]** L'export « Impression navigateur » utilise `document.write()` sur le gabarit édité, ce qui **exécute réellement** tout `<script>`/gestionnaire d'événement qu'il contiendrait — `v2/js/pdf-export.js:2655-2664`.
4. **[Intégrité des données]** Un export PDF d'un document contenant une zone 2-colonnes avec une note de bas de page dans chaque colonne peut produire une **numérotation/texte de note corrompu silencieusement**, à cause d'un état partagé entre deux traitements concurrents — `v2/js/pdf-export.js`.
5. **[Publication]** `CAHIER_DES_CHARGES.md` est corrompu (contient du code JavaScript V1 au lieu d'un cahier des charges) et aucun `README.md`/`LICENSE`/`CONTRIBUTING.md` n'existe à la racine — requis par la doctrine DINUM pour un dépôt public.

---

## 2. Sécurité

### 2.1 Fuite de données personnelles en console (RGPD)

| Fichier:ligne | Constat | Priorité |
|---|---|---|
| `js/grist-api.js:61` | `console.log('[GristAPI] onRecord reçu:', { ..., record, ... })` affiche l'intégralité de la ligne Grist courante (nom, email, adresse... selon le contenu du document) dans la console, **sans condition**, à chaque changement de sélection. | **Important** |
| `js/grist-api.js:263-273` | Un `<div id="debug-rowid">` affiche en permanence "Ligne courante: X — reçu à HH:MM:SS" dans l'UI de production. Résidu de développement. | Mineur |

**Risque** : dans un contexte secteur public (RGPD), exposer des données personnelles en clair dans les outils de développement du navigateur — accessible à quiconque ouvre la console, y compris via une extension navigateur tierce — est une non-conformité facilement identifiable en audit.
**Suggestion** : retirer ces deux instructions, ou les conditionner à un flag de debug explicite (`localStorage.pp_debug`) absent par défaut.
**Impact fonctionnel d'une correction** : nul (purement du logging).

### 2.2 Injection HTML non assainie (XSS)

| Fichier:ligne(s) | Constat | Priorité |
|---|---|---|
| `v2/js/editor.js:2480, 2527/2532, 2638, 2730, 2740` | Le HTML des zones d'en-tête/pied de page (`headerFooterDraft`, chargé tel quel depuis une colonne Grist `HeaderFooter` via `setHeaderFooterData`, ligne 2368) est injecté via `innerHTML` sur des éléments **réellement attachés au DOM visible**, sans jamais repasser par le schéma contraint de l'éditeur (contrairement à `getHTML()`/`setHTML()` qui, eux, sont sains). Un `<img src=x onerror="...">` placé dans cette colonne par n'importe quel collaborateur du document Grist (pas nécessairement un utilisateur du widget) s'exécute **automatiquement** dès qu'un utilisateur charge ce modèle — aucune action explicite requise. | **Important** |
| `v2/js/pdf-export.js` (7 points : lignes ~352-368, 991, 1040-1045, 2046-2047, 2515-2518, 2701-2710) | Tous les hôtes de mesure/rendu hors-écran utilisés pour construire le PDF injectent le gabarit via `innerHTML` sur du DOM **attaché** à `document.body`. `innerHTML` neutralise les `<script>`, mais **pas** les gestionnaires d'événements inline (`onerror`, `onload`) sur un nœud vivant — ils s'exécutent dès l'insertion, à chaque export. | **Important** |
| `v2/js/pdf-export.js:2655-2664` (`exportViaBrowserPrint`) | `document.write(... + container.outerHTML + ...)` : contrairement à `innerHTML`, `document.write` **exécute réellement les balises `<script>`** présentes dans le flux. C'est le vecteur le plus net du projet (exécution de code, pas seulement de gestionnaire d'événement). | **Important** |
| `v2/js/variables.js:610-613, 553-558` | Dans la modale de configuration de liaison entre tables, les noms de colonne/table Grist (`colId`, nom de table référencée) sont interpolés sans échappement dans une chaîne `<option>` injectée en `innerHTML`. Aujourd'hui ces identifiants sont contraints par l'UI standard de Grist, donc peu exploitables en pratique — mais rien ne le garantit si un identifiant est créé via l'API REST Grist en contournant l'éditeur. | Important |
| `v2/js/pdf-export.js:2105-2144` (`inlineEditorImagesAsDataUri`) | `fetch(src)` vers n'importe quelle URL non-`data:` présente dans le gabarit, sans validation de schéma/hôte, à **chaque export**. Un gabarit pointant vers un serveur tiers agit comme un pixel de suivi silencieux (IP/user-agent de l'exportateur). | Mineur |

**Point important à noter pour l'audit DINUM** : `js/reader-mode.js` (qui résout les valeurs `#Table.Colonne` avec les VRAIES données Grist) a été vérifié **sain** — il utilise systématiquement `textContent`, jamais `innerHTML`, pour insérer une valeur de cellule. **Le vecteur d'attaque n'est donc pas "une donnée métier arbitraire dans une cellule Grist", mais le gabarit HTML du modèle lui-même** (et les données d'en-tête/pied de page), que n'importe quel collaborateur ayant un accès en édition au document Grist peut modifier — même sans jamais ouvrir ce widget.

**Aggravant** : le widget demande `requiredAccess: 'full'` (accès complet en lecture/écriture à tout le document Grist, justifié par ailleurs par l'usage réel — création de tables internes, résolution cross-table). Toute exécution de script obtenue par XSS hériterait donc potentiellement de cet accès complet via l'API `grist.docApi`.

**Suggestion générale** : introduire une fonction unique d'assainissement HTML (retrait des balises `<script>`, des attributs `on*`, des URLs `javascript:`) appliquée systématiquement **avant** toute insertion DOM (`innerHTML`/`outerHTML`/`document.write`) du gabarit ou des données d'en-tête/pied — un seul point de correction plutôt que ~10 sites d'insertion à corriger un par un.
**Impact fonctionnel** : correction non risquée pour les fonctionnalités existantes si l'assainissement est bien ciblé (retrait de scripts/handlers uniquement, pas de reformatage du HTML) ; à tester sur un gabarit riche existant (tableaux, images, 2-colonnes) pour confirmer qu'aucune balise légitime n'est perdue.

### 2.3 Permissions et intégrité des tables internes Grist

| Fichier:ligne(s) | Constat | Priorité |
|---|---|---|
| `js/grist-api.js:10` vs `js/templates.js:4` vs `v2/dev-tests/grist-stub.js:44` | Le nom de la table interne `Publipostage_Modeles` est recopié en dur à 3 endroits indépendants au lieu d'être lu depuis une seule source (`Templates.TABLE_NAME`, déjà exporté mais jamais réutilisé). Un renommage futur non répercuté partout ferait réapparaître la table des modèles comme table "normale" dans les sélecteurs de variables. | Important |
| `js/grist-api.js:8-10, 376-378` | La détection des tables internes (`Publipostage_Modeles`/`_LiensTables`/`_UserProbe`) ne vérifie que le NOM, jamais la forme des colonnes. Si un document Grist contient déjà une table portant l'un de ces noms par coïncidence, le widget la traite comme sienne et lit/écrit dessus avec le schéma attendu — risque de corruption de données utilisateur préexistantes. | Important |
| `js/grist-api.js:572-604` | `getCurrentUserEmail()` ne cache que le résultat final, pas la promesse en vol : plusieurs résolutions de chip email en parallèle (ex. en-tête + pied de page) déclenchent chacune leur propre cycle `AddTable`/`AddRecord`/`RemoveRecord`. De plus, `ensureUserProbeTable()` n'a pas de `try/catch` autour de l'`AddTable`, contrairement à sa fonction sœur `ensureLinksTableExists` — une exception ici remonte sans être rattrapée. | Important |

**Suggestion** : faire de `Templates.TABLE_NAME` la source unique de vérité ; ajouter une vérification légère du schéma attendu avant de faire confiance à une table existante ; mémoriser la promesse en cours dans `getCurrentUserEmail()` plutôt que seulement son résultat, et envelopper `AddTable` d'un `try/catch` par cohérence avec le reste du fichier.
**Impact fonctionnel** : faible risque, changements localisés et non intrusifs.

---

## 3. Intégrité des données — état de module et concurrence (`pdf-export.js`)

| Fichier:ligne(s) | Constat | Priorité |
|---|---|---|
| `v2/js/pdf-export.js:110-111` (état module `footnoteCounter`/`footnoteEntries`) + `1075-1087` (`twoColumnsFrom` utilise `Promise.all` sur les 2 colonnes) | Les deux colonnes d'une zone 2-colonnes sont traitées en **parallèle**, chacune via son propre appel à `buildPdfContentFromRoot`, qui réinitialise `footnoteCounter = 0` en entrée. Si les deux colonnes contiennent chacune une note de bas de page, l'exécution concurrente peut faire qu'une colonne réinitialise le compteur pendant que l'autre est encore en train de l'incrémenter — **numérotation ou texte de note corrompu(e) silencieusement**, sans erreur visible, dans un export PDF pourtant présenté comme fiable. Reproductible avec un simple export normal (pas besoin d'interaction inhabituelle). | **Important** |
| `v2/js/main.js` (boutons d'export, ~lignes 161-175/214+) | Aucun verrou n'empêche de déclencher un second export pendant qu'un premier est en cours (bouton non désactivé pendant l'opération asynchrone). Deux exports simultanés partageraient le même état de module (`footnoteCounter`), avec un risque de corruption croisée **entre deux enregistrements Grist différents**. | **Important** |

**Suggestion** : à court terme, désactiver les boutons d'export pendant une opération en cours (correctif simple, `main.js`) ; à plus long terme, threader l'état des notes de bas de page en paramètre plutôt qu'en variable de module partagée (plus invasif, à faire avec des tests de non-régression ciblés sur `dev-tests/scenarios-headerfooter.js`/notes).
**Impact fonctionnel** : le verrou de bouton est sans risque. Le threading de l'état des notes touche un mécanisme central utilisé par tous les chemins (flux principal, tableaux, 2-colonnes) — à faire prudemment, avec la suite de tests automatisés comme filet de sécurité.

---

## 4. Qualité de code — redondance et « mille-feuille »

### 4.1 `v2/js/editor.js` (3316 lignes)

| Constat | Lignes | Priorité |
|---|---|---|
| `captureSelection`/`withSavedSelection` copiées à l'identique dans 3 fonctions (`wireColorPickers`, `wireSelectionDependentSelects`, `wireCompactFontSizeControls`) | 1780-1788, 3163-3171, 3197-3205 | Important |
| Motif « patcher les attributs d'un nœud + restaurer la NodeSelection + dispatch » réimplémenté 3 fois (`updateAttrs`, `updateSelectedImage`, `updateSelectedBadge`) | 1235-1256, 1964-1977, 2184-2193 | Important |
| Cycle de glisser (mousedown→mousemove→mouseup) réécrit à la main 3 fois (poignée 2-colonnes, redimensionnement image, déplacement image) — chaque nettoyage est correct, mais le patron est dupliqué | 999-1004, 1308-1310, 1354-1356 | Mineur |
| Commentaire obsolète référençant un mécanisme à drapeau (`suppressNextFootnoteOutsideCheck`) qui n'existe plus dans le code actuel (remplacé par une vérification directe, ligne 287) | 585-588 | Mineur |
| Préfixe de log incohérent `[editor]` (minuscule) au lieu de `[Editor]` partout ailleurs | 3307 | Cosmétique |

**Aucun code mort trouvé** (pas de fonction/variable inutilisée, pas de branche toujours vraie/fausse, pas de `TODO` oublié). **Aucune fuite de portée de variable** (pas de globale accidentelle, tout l'état reste dans l'IIFE).

**Structure** : le fichier est **trop long pour sa propre lisibilité** malgré un code interne propre. Découpage recommandé, sans dépendance circulaire :
1. Nœuds/extensions TipTap personnalisés (image, 2-colonnes, saut de page, variables, notes...) → `editor-nodes.js`
2. Barres d'outils flottantes contextuelles (image, tableau, variable) → `floating-toolbars.js`
3. Mode en-tête/pied de page + aperçu de pagination → `header-footer-preview.js` (contient aussi le point de sécurité §2.2 — l'isoler faciliterait un futur correctif ciblé)
4. Barre d'outils statique principale → `main-toolbar.js`
5. Cœur du module (`init`, `getHTML`/`setHTML`, API publique) → reste dans `editor.js`, réduit à un point d'assemblage.

### 4.2 `v2/js/pdf-export.js` (2757 lignes)

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

### 4.3 Autres fichiers

| Fichier:ligne | Constat | Priorité |
|---|---|---|
| `js/templates.js:118-121` | Boucle de validation qui ne peut structurellement jamais se déclencher (`!(column in columns)` sur un objet qui vient d'être construit avec exactement ces clés) — fausse impression de garde-fou. | Mineur |
| `v2/js/variables.js:82-87` | Les libellés d'onglets du panneau `#` (singleton créé une seule fois) ne sont jamais retraduits si l'utilisateur change de langue après la première ouverture du panneau — contrairement au reste du panneau, reconstruit à chaque ouverture. | Mineur |
| `v2/js/i18n.js:323,328` | Le paramètre `root` d'`applyTranslations(root)` n'est en pratique jamais utilisé (aucun module ne crée dynamiquement d'élément `data-i18n*` ni n'appelle la fonction avec un argument) — fonctionnalité prête mais jamais exercée, à documenter comme telle ou à retirer. | Cosmétique |
| `v2/js/main.js:533` | `GristAPI.init()` continue même en cas d'échec (try/catch qui n'interrompt pas la suite) — probablement voulu (résilience) mais non commenté à cet endroit précis. | Mineur |
| `v2/js/editor.js:25` | Pas de `'use strict'` en tête de l'IIFE — aucune fuite constatée en pratique, mais coût nul à ajouter en défense en profondeur. | Cosmétique |

### 4.4 Portée des variables — jugement global

Aucune fuite de portée trouvée dans les fichiers audités (pas de globale accidentelle, pas de `var`, pas de collision de nom entre scopes imbriqués). Le point réellement sensible est celui de la §3 (état de module partagé entre exécutions concurrentes dans `pdf-export.js`), pas une fuite classique de portée lexicale.

---

## 5. Fichiers, inventaire, publication

### 5.1 Fichiers orphelins / à statut clarifier dans `v2/`

| Fichier | Statut constaté | Recommandation | Priorité |
|---|---|---|---|
| `v2/js/mailto-export.js` | Scaffold non câblé (aucun `<script>` ne le charge), mais son propre en-tête l'indique déjà clairement ("SCAFFOLD, pas encore implémenté") | Garder tel quel, rien à corriger | — |
| `v2/smoke-test.html` | Orphelin à la racine de `v2/` (même niveau que le code de production), non listé dans `dev-tests/README.md`, mais cité en dur dans 2 commentaires (`v2/index.html:16`, `v2/js/editor.js:2971`) | Déplacer dans `v2/dev-tests/` (ou un sous-dossier `manual/`), mettre à jour les 2 commentaires qui le citent, l'ajouter au README de dev-tests | Mineur |
| `v2/templates-gallery/*/schema.py` | **Réellement exécuté** (parsé par regex via `template-gallery.js:68-92` pour créer une vraie table Grist) — pas juste de la documentation humaine, contrairement à ce que son extension `.py` pourrait laisser croire | Ajouter un `v2/templates-gallery/README.md` expliquant le rôle de chaque fichier (`manifest.json`, `template.html`, `schema.py`, `screenshot.svg`) et le format exact attendu pour `schema.py` | Mineur |
| `v2/_test-harness.html` | Généré à la demande, jamais commité (`.gitignore` documenté) | Cohérent, rien à faire | — |

### 5.2 Racine du dépôt

| Fichier | Constat | Recommandation | Priorité |
|---|---|---|---|
| `CAHIER_DES_CHARGES.md` | **Confirmé corrompu** : contient le module `Variables` V1 (JavaScript brut, Quill) au lieu d'un cahier des charges. Le vrai contenu existe encore dans l'historique git (`git show 33d7784:CAHIER_DES_CHARGES.md`), écrasé par un commit ultérieur (`fd5d69c`, message générique suspect, qui modifie aussi `js/grist-api.js` dans le même commit — signe d'un écrasement accidentel lors d'un push scripté). | Régénérer le contenu depuis `33d7784`, le mettre à jour pour refléter la V2 (aujourd'hui à parité fonctionnelle), ou le supprimer si le projet préfère documenter le périmètre uniquement via un futur `README.md`/`VERSIONING.md`. **Ne pas se contenter de restaurer `33d7784` tel quel** (ne décrirait que la V1). | **Important** — un fichier nommé "cahier des charges" contenant du code sans rapport est le genre de détail qui discrédite un dépôt aux yeux d'un relecteur externe. |
| `VERSIONING.md` | Périmé pour V2 : dernière entrée `v0.10` (2026-09-08), alors que la V2 est activement développée jusqu'au 12/09 (settings, correctifs export PDF, suite de tests — invisibles dans ce fichier). | Soit indiquer explicitement en tête que ce fichier ne couvre que la V1, soit le compléter avec les jalons V2. | Mineur |
| `README.md`, `LICENSE`, `CONTRIBUTING.md` | **Absents** de la racine. La doctrine DINUM pour l'ouverture d'un code source du secteur public (cf. §7) exige a minima un README (objet, usage, démarrage), une licence (permissive de préférence), et idéalement un CONTRIBUTING.md. | À créer avant publication officielle. | **Important** |
| `.gitignore` | Cohérent avec l'état actuel du projet (V2 + dev-tests pris en compte), vérifié en pratique. | Rien à faire. | — |

### 5.3 Références croisées V1 ↔ V2

Toutes les références croisées trouvées (V2 → `../js/grist-api.js`/`templates.js`/`reader-mode.js`/`../css/*`, `pdf-export.js` → `../js/pdf-fonts(-extra).js`) sont accompagnées d'un commentaire explicite justifiant le partage. **Aucune référence accidentelle détectée.**

---

## 6. Accessibilité (RGAA) — signalement, pas un audit RGAA complet

Le secteur public français est soumis au RGAA (106 critères, 13 thèmes — DINUM). Un audit RGAA complet est hors du périmètre de cette passe, mais 3 points substantiels sont ressortis :

| Constat | Fichier(s) | Priorité | Référence |
|---|---|---|---|
| Aucune des 5 fenêtres modales n'a `role="dialog"`/`aria-modal="true"` ; le focus clavier n'est jamais déplacé à l'ouverture ni restitué à la fermeture ; la touche Échap n'est pas gérée. | `v2/index.html`, `v2/js/main.js`, `v2/js/settings.js` | **Important** | RGAA 12.7/12.8 (WCAG 2.1 SC 2.4.3, 4.1.2) |
| 3 champs texte n'ont qu'un `placeholder`, sans `aria-label`/`<label>` associé (nom de modèle, nom de fichier PDF, recherche de galerie) — un `placeholder` seul n'est pas une alternative accessible fiable. | `v2/index.html` (lignes 67, 114, 262) | Mineur | RGAA thème formulaires |
| Les modales utilisent `style="display:none"` + bascule JS, alors que le panneau Réglages (même fichier) utilise l'attribut natif `hidden` — deux conventions cohabitent sans qu'un choix soit expliqué. | `v2/index.html` | Cosmétique | — |

**Recommandation** : prévoir un audit RGAA dédié avant publication officielle (hors périmètre de cet audit de code), au minimum sur les points ci-dessus qui sont peu coûteux à corriger (ajout d'attributs ARIA, piège à focus, gestion d'Échap).

---

## 7. Contexte réglementaire et bonnes pratiques (recherche complémentaire)

*Sources consultées le 2026-09-12 — voir liens en bas de section. Cette section sera complétée/corrigée dès réception du document DINUM spécifique annoncé.*

- **Doctrine DINUM pour la publication de code source public** : licences permissives recommandées, transparence (code source ouvert y compris des algorithmes), audit sécurité, SBOM/analyse de composants (dépendances tierces).
- **Checklist de publication (code.gouv.fr)** : README.md (objet/usage/démarrage), LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG, aucune donnée sensible dans le dépôt (secrets, logs internes), tags de version sémantiques. → **Vérifié dans ce dépôt** : aucun secret trouvé (recherche globale), mais README/LICENSE/CONTRIBUTING manquants (§5.2).
- **RGS (Référentiel Général de Sécurité, ANSSI/DINUM)** : cadre de sécurité des échanges électroniques des administrations, audits de conformité réguliers. Pertinent pour la partie "accès Grist"/API de ce widget (§2.3).
- **RGAA (accessibilité numérique, DINUM)** : 106 critères / 13 thèmes, obligatoire pour un service public numérique. Cf. §6.
- **OWASP (sécurité applicative)** : pour le client-side JS, la prévention XSS repose sur l'encodage contextuel en SORTIE (pas juste le filtrage en entrée) — c'est exactement le principe qui manque aux points listés en §2.2 (le gabarit est injecté tel quel, sans encodage/assainissement adapté au contexte HTML).

**Sources** :
- [code.gouv.fr — Ouvrir un projet numérique](https://documentation.ouvert.numerique.gouv.fr/guides/ouvrir/)
- [ANSSI/cyber.gouv.fr — Open-source dans l'administration](https://cyber.gouv.fr/enjeux-technologiques/open-source/)
- [ANSSI/cyber.gouv.fr — Référentiel Général de Sécurité (RGS)](https://cyber.gouv.fr/reglementation/reglementation-identite-confiance-numerique/securite-echanges-voie-electronique/referentiel-general-de-securite/)
- [RGAA — critères d'accessibilité (Handinova, synthèse)](https://handinova.fr/accessibilite-numerique-les-106-criteres-du-rgaa/)
- [OWASP Secure Coding Practices](https://codesigncert.com/resources/owasp-secure-coding-practices-guide)
- [Grist Help Center — Widget custom / requiredAccess](https://support.getgrist.com/widget-custom/)

---

## 8. Ce qui fonctionne déjà bien (à ne pas perdre en corrigeant le reste)

- **Résolution des variables Grist (`reader-mode.js`)** : systématiquement via `textContent`, jamais `innerHTML` — le vecteur XSS identifié en §2.2 vient du gabarit/de l'en-tête-pied, pas d'une valeur de cellule métier.
- **Cohérence de style remarquable** dans `editor.js`/`pdf-export.js` : conventions de nommage homogènes (`createXxx`/`wireXxx`/`ensureXxx`), gestion d'erreur `try/catch` + repli systématique, commentaires en français expliquant systématiquement le "pourquoi" (bug réel constaté) plutôt que de paraphraser le code.
- **Suite de tests automatisés** (`v2/dev-tests/`, ~85 scénarios) déjà en place et à jour — un vrai filet de sécurité pour les corrections proposées ici, en particulier pour les refactorings de §4.
- **Duplication déjà justifiée et documentée** entre les 3 chemins de rendu PDF (cellule/flux principal/2-colonnes) — pas un défaut, un choix assumé.

---

## 9. Prochaines étapes proposées

1. Recevoir et intégrer le document DINUM annoncé (impact potentiel sur les priorités ci-dessus).
2. Traiter les 5 points de la synthèse exécutive (§1) — sécurité et intégrité des données d'abord, fichiers de publication en parallèle (faible risque, peut être fait par un humain sans dépendance au reste).
3. Une fois les points Important de sécurité traités : passe de nettoyage qualité (§4), en commençant par les duplications à faible risque (constantes, petites factorisations) avant les refactorings plus structurants (découpage de fichiers).
4. Prévoir séparément un audit RGAA dédié (§6) et la constitution du dossier de sécurité RGS si requis par l'audit DINUM (§7).

Aucun fichier de code n'a été modifié dans le cadre de cet audit.
