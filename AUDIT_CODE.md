# Audit de code — Publipostage Grist (préparation publication + audit DINUM)

**Date** : 2026-09-12 (mis à jour le même jour avec le guide de contribution Grist.Gouv, l'enjeu RSSI, puis les premiers correctifs appliqués)
**Périmètre** : tous les fichiers chargés en production par `index.html`, ~11 850 lignes de code sur 18 fichiers de production à l'audit initial.
**Méthode** : lecture intégrale de chaque fichier (aucune modification lors de l'audit initial), en 4 lots parallèles + vérifications ponctuelles manuelles. Correctifs ultérieurs appliqués et testés (voir §3.1/§3.2/§6.2).

**Mise à jour 2026-09-12 (soir)** : l'ancienne version V1 (Quill.js, historique) a été entièrement retirée du dépôt — elle avait atteint la parité fonctionnelle et n'était plus maintenue. L'arborescence `v2/` a été aplatie à la racine du dépôt (`v2/js/` → `js/`, `v2/css/` → `css/`, `v2/dev-tests/` → `dev-tests/`, `v2/templates-gallery/` → `templates-gallery/`, `v2/index.html` → `index.html`) : il n'existe plus qu'une seule version, un seul point d'entrée, une seule URL GitHub Pages. Ce même jour, régression critique trouvée et corrigée : la touche **Entrée ne scindait plus aucun bloc, dans aucun contexte** (paragraphe, liste...) — cause racine : l'import map ne couvrait pas les sous-chemins `@tiptap/pm/*` que le bundle esm.sh de `@tiptap/core` importe via des URLs absolues, chargeant une deuxième instance de `prosemirror-model` distincte de celle partagée par le reste du code (cf. §5 et le commit de correction). Les 4 échecs de tests listés plus loin comme « limitation connue du harnais » étaient en réalité CE bug réel, à tort écartés comme faux positifs — leçon retenue : ne plus classer un échec de test comme limitation d'outillage sans avoir isolé la cause avec un test indépendant du mécanisme suspecté.
**Référence externe** : « Contributing Guide — Grist.Gouv Widgets » (guide officiel DINUM/ANCT pour la contribution de widgets à l'instance souveraine Grist.Gouv, fourni par l'utilisateur, dernière mise à jour juillet 2026) — voir §8 pour la mise en regard détaillée.

**Mise à jour 2026-09-14** : passe d'audit complémentaire dédiée **performance/optimisation** (jamais couverte en détail jusqu'ici, cf. nouveau §12) et **hygiène du code mort/CSS** (relecture ciblée, au-delà du seul exemple `.ql-editor` déjà repéré manuellement — le retrait de la V1 le 2026-09-12 a laissé beaucoup plus de résidus `.ql-*` dans `css/style.css` qu'initialement supposé, cf. nouveau §13). Egalement corrigés le même jour, en amont de cet audit et hors de son périmètre propre (voir l'historique de session pour le détail) : un bug réel de positionnement d'image en calque (alignement de paragraphe hérité appliqué à tort à une image `absolutePosition`, mécanisme V1/Quill supprimé plutôt que patché) et un garde-fou ajouté contre une image glissée hors de la page physique. Nouvelle suite de tests `dev-tests/scenarios-readmode-fidelity.js` comblant partiellement l'angle mort "mode Lecture" déjà documenté dans `dev-tests/PROTOCOLE_TEST_MANUEL.md` — a immédiatement trouvé un vrai bug (listes trop indentées en mode Lecture, cf. `dev-tests/BUGS.md` Bug 4), **volontairement non corrigé** ce soir-là (consigne explicite : le code alors en place devait être publié en Alpha le lendemain matin sans nouveau correctif). Plan de fonctionnalités Beta consolidé dans `planning/ROADMAP.md`.

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
| **Enjeu RSSI (périmètre d'accès + chaîne d'approvisionnement)** | 0 | ~~4~~ **1** *(SRI + documentation des dépendances corrigés le 2026-09-12 ; reste : vendorisation `esm.sh`, décision produit **mise en attente à la demande de l'utilisateur**)* | 1 | 0 |
| Sécurité applicative (XSS / RGPD) | 0 | ~~6~~ **0** *(tous corrigés le 2026-09-12)* | 2 | 0 |
| Intégrité des données (concurrence) | 0 | ~~2~~ **0** *(corrigés le 2026-09-12)* | 0 | 0 |
| Qualité de code (redondance, structure) | 0 | ~~6~~ **1** *(5 corrigées le 2026-09-12 : dédup. editor.js/pdf-export.js, robustesse, code mort ; reste : découpage structurel des 2 gros fichiers)* | 8 | 4 |
| Fichiers / publication / conformité au guide Grist.Gouv | 0 | ~~3~~ **2** *(README créé le 2026-09-12)* | 4 | 0 |
| Accessibilité (RGAA) | 0 | ~~1~~ **0** *(modales corrigées le 2026-09-13)* | 1 | 1 |
| **Performance/optimisation** (nouveau 2026-09-14, cf. §12) | 0 | 2 | 6 | 2 |
| **Code mort / hygiène CSS** (approfondi 2026-09-14, cf. §13) | 0 | 0 | ~15 (surtout résidus `.ql-*`) | ~10 |
| **Total** | **0** | ~~22~~ **5 restants** (19 corrigés) | **~37** | **~17** |

**Corrigé le 2026-09-12** (voir détail §2.2/§3.1/§3.2/§4/§5/§6.2) : fuite RGPD en console, XSS
en-tête/pied de page, XSS `document.write()`, XSS modale de liaison entre tables, intégrité SRI sur
les 4 bibliothèques `cdnjs` (V1+V2), README.md créé (avec documentation des dépendances),
**corruption silencieuse de la numérotation des notes de bas de page dans une zone 2-colonnes**
(root cause plus profonde qu'un simple problème de concurrence, cf. §4), `CAHIER_DES_CHARGES.md`
régénéré à jour pour la V2, **nettoyage qualité de code** (déduplication editor.js/pdf-export.js,
repli try/catch sur 3 fonctions critiques de pdf-export.js, retrait de code mort, élagage des
commentaires les plus disproportionnés). Nouveau module partagé
[`js/html-sanitize.js`](js/html-sanitize.js) réutilisable pour d'éventuels futurs points d'entrée
HTML non maîtrisé. Vérifié sans régression sur ~90 scénarios de test + export PDF réel + nouveau test
de régression permanent pour le bug de notes de bas de page.

**Mis en attente à la demande explicite de l'utilisateur** : la vendorisation d'`esm.sh` (§2.2) —
décision produit délibérément reportée, pas oubliée.

**Mise à jour 2026-09-12 (nuit) — passe exhaustive de tests + élagage des commentaires terminé** :
suite au retrait de la V1, un protocole de test exhaustif (suite automatisée 89/89 scénarios +
parcours manuel complet de chaque contrôle d'interface) a été rejoué. Une régression réelle trouvée
et corrigée : la navigation clavier (flèches/Entrée/Tab/Échap) de l'autocomplétion `#Variable` du
champ "Nom de fichier PDF" était **totalement inerte** depuis l'introduction de l'onglet Chips
(`js/variables.js` comparait `acBox.style.display` à `'block'`, valeur qu'il ne prend plus jamais
depuis un passage à `'flex'` — seule la sélection à la souris fonctionnait). L'élagage des
commentaires disproportionnés (§5, jugé "partiel" ci-dessus) est désormais **terminé** sur tous les
fichiers de production : tout bloc de 5 lignes ou plus a été relu et condensé à 1-3 lignes,
gardant le fait "pourquoi" et retirant la narration. Suite de tests toujours 89/89 après coup.

**Mise à jour 2026-09-13** : accessibilité RGAA des 5 modales corrigée (§7, cf. `wireModalAccessibility()` dans `js/main.js`). Par ailleurs, les 3 qualités d'export PDF non-vectorielles (impression navigateur, basse/ultra HD) — jamais aussi robustes que le vectoriel, cf. §5.2 — ont été isolées dans un nouveau fichier dédié `js/pdf-export-alt.js` (aucune dépendance croisée avec le moteur pdfmake) et **désactivées dans l'UI** (options grisées, non cliquables) en attendant d'être fiabilisées ; seul l'export vectoriel reste proposé aux utilisateurs de l'alpha publique.

**Ce qui reste à traiter en priorité avant l'audit DINUM/RSSI :**

1. **[RSSI — voir §2.1, non corrigé]** Le widget demande l'accès **complet** en lecture/écriture à tout le document Grist (`requiredAccess: 'full'`) — désormais moins critique depuis la correction des XSS ci-dessus, mais reste un sujet à documenter/discuter explicitement avec la RSSI (la mitigation passe par les Règles d'accès Grist natives, pas par le code du widget — déjà expliqué dans le nouveau README).
2. **[RSSI — voir §2.2, en attente]** Les ~23 paquets ProseMirror/TipTap restent chargés depuis `esm.sh` sans intégrité vérifiable (limitation technique des imports ES, pas juste un oubli) — vendorisation complète mise en attente, décision produit à part entière (cf. ci-dessus).
3. **[Publication, non corrigé]** `LICENSE`/`CONTRIBUTING.md`/`SECURITY.md` restent à créer (le choix de licence est une décision de l'utilisateur, pas un défaut de code).
4. **[RSSI, non corrigé, mineur]** Le fetch automatique d'images externes à chaque export (§2.3) reste non encadré — clarification produit à faire (allowlist ou confirmation explicite).

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
| `grist-plugin-api.js` | `docs.getgrist.com` (éditeur de Grist lui-même) | non-versionné (URL sans version) | Absente | Attendu et documenté — dépendance native au produit hôte, pas de version stable publiée par Grist à épingler. |
| 23 paquets ProseMirror/TipTap/`@floating-ui` | `esm.sh` (CDN public tiers, infrastructure non-française) | **Toutes pinnées** (ex. `@tiptap/core@3.31.3`) — bon point | Absente — **non corrigée** (les imports ES via import map ne supportent pas `integrity` comme un `<script src>` classique ; nécessiterait une vendorisation complète, cf. suggestion 2 ci-dessous) | `index.html` (import map). |
| pdfmake, `vfs_fonts`, html2pdf.js, JSZip | `cdnjs.cloudflare.com` (CDN public tiers) | Toutes pinnées | ✅ **Ajoutée le 2026-09-12** (hash `sha384-...` calculé directement sur chaque fichier réellement servi pour la version épinglée) | `js/pdf-export.js` (chargement paresseux) et `index.html` racine (V1, chargement statique — fichiers partagés) ; vérifié : les 4 bibliothèques se chargent toujours correctement (V1 et V2) après ajout des hashes. |

**Pourquoi c'est un « très gros point » pour une RSSI** :
- **Aucun `integrity="sha384-..."` (Subresource Integrity)** sur aucun des scripts externes chargés — si l'un de ces CDN sert un contenu altéré (compromission du CDN, attaque de la chaîne d'approvisionnement, faille côté cdnjs/esm.sh déjà documentées publiquement par le passé pour d'autres projets), le navigateur exécute le contenu servi sans aucune vérification, avec le même niveau d'accès `'full'` au document Grist décrit en §2.1.
- **Souveraineté numérique** : le guide Grist.Gouv fourni par l'utilisateur cite explicitement "l'interopérabilité, la souveraineté numérique, l'accessibilité" comme contraintes du secteur public (§8). Dépendre à l'exécution de deux CDN commerciaux non-européens pour charger le MOTEUR MÊME de l'éditeur (ProseMirror/TipTap) et de l'export PDF (pdfmake) est en tension directe avec cet objectif — un widget hébergé sur l'instance officielle DINUM/ANCT qui reste indisponible/altérable si `esm.sh` ou `cdnjs` change de politique, a un incident, ou est bloqué par un pare-feu ministériel, est un risque opérationnel autant que sécuritaire.
- **Absence de SBOM** (Software Bill of Materials) : aucun inventaire formel des dépendances tierces (versions, licences) n'existe dans le dépôt — les versions sont éparpillées dans les URLs de l'import map, pas dans un fichier dédié facilement audité par un outil de Software Composition Analysis (SCA).

**Suggestions, par ordre d'effort croissant** :
1. ~~**Immédiat, faible coût** : ajouter les attributs `integrity`/`crossorigin` sur les scripts CDN de `pdf-export.js`~~ — **fait le 2026-09-12** pour les 4 bibliothèques `cdnjs` (V1 et V2).
2. **Moyen terme, non fait** : auto-héberger (vendoriser) les bibliothèques critiques (ProseMirror/TipTap sur `esm.sh`, dont SRI ne peut pas protéger via l'import map) dans le dépôt lui-même plutôt que de dépendre d'un CDN à l'exécution — supprime la dépendance réseau ET le risque de chaîne d'approvisionnement pour ces paquets, au prix d'une mise à jour manuelle des versions (au lieu d'automatique via CDN).
3. ~~**Documentation minimale immédiate**~~ — **fait le 2026-09-12** : dépendances listées dans le README (section Dépendances), avec origine CDN et usage de chacune.

**Priorité restante : Mineur-mais-structurant** (point 2, vendorisation d'`esm.sh` — décision produit à prendre avec l'équipe, hors du périmètre d'un simple correctif ; les points 1 et 3, les plus critiques pour un audit RSSI immédiat, sont traités).

### 2.3 Fuite de données vers des tiers non maîtrisés

Déjà identifié en détail en §3.2 (S3) mais à relire sous l'angle RSSI : `js/pdf-export.js:2105-2144` télécharge automatiquement, à CHAQUE export, toute image du gabarit dont l'URL n'est pas un `data:` URI — sans validation de domaine. Un gabarit partagé par un collaborateur pointant vers un serveur tiers permet à ce tiers de savoir qu'un export a eu lieu (adresse IP, user-agent), à l'insu de l'utilisateur exportateur. Combiné à l'accès `'full'` (§2.1), un tel gabarit pourrait aussi, en théorie, être conçu pour exfiltrer des informations si un futur code moins prudent venait à inclure des données de session dans une URL construite dynamiquement (non constaté aujourd'hui, mais un pattern à surveiller).

**Priorité : Mineur aujourd'hui, mais à mentionner explicitement à la RSSI comme un principe à valider (allowlist de domaines, ou confirmation explicite avant tout appel réseau sortant déclenché automatiquement).**

---

## 3. Sécurité applicative

### 3.1 Fuite de données personnelles en console (RGPD) — ✅ CORRIGÉ

| Fichier:ligne | Constat | Priorité |
|---|---|---|
| `js/grist-api.js:61` | ~~`console.log('[GristAPI] onRecord reçu:', { ..., record, ... })` affiche l'intégralité de la ligne Grist courante~~ — **corrigé** : le log ne contient plus que `rowId`/horodatage, plus jamais `record`/`mappings`. | ~~Important~~ |
| `js/grist-api.js` (`updateRowDebug`) | ~~Un `<div id="debug-rowid">` affiche en permanence "Ligne courante: X — reçu à HH:MM:SS" dans l'UI de production~~ — **corrigé** : fonction et appel retirés. | ~~Mineur~~ |

**Risque** : dans un contexte secteur public (RGPD), exposer des données personnelles en clair dans les outils de développement du navigateur — accessible à quiconque ouvre la console, y compris via une extension navigateur tierce — est une non-conformité facilement identifiable en audit.
**Suggestion** : retirer ces deux instructions, ou les conditionner à un flag de debug explicite (`localStorage.pp_debug`) absent par défaut.
**Impact fonctionnel d'une correction** : nul (purement du logging).

### 3.2 Injection HTML non assainie (XSS) — ✅ CORRIGÉ

**Correctif appliqué** : nouveau module partagé V1/V2 [`js/html-sanitize.js`](js/html-sanitize.js)
(`HtmlSanitize.clean(html)`) — parse le HTML via `DOMParser` (document inerte : aucun script ni
gestionnaire d'événement ne s'exécute pendant le parsing lui-même), retire les balises `<script>`,
tous les attributs `on*`, et les URLs `javascript:`, puis re-sérialise. Appliqué à **2 points
d'entrée uniques** qui couvrent l'intégralité des chemins listés ci-dessous, plutôt qu'à chaque site
d'insertion individuellement :
- `js/reader-mode.js` : `render()` et `preview()` — couvre l'aperçu "Lecture" ET tout export PDF
  (vectoriel, impression navigateur, raster), puisque `PdfExport.exportCurrentRecord`/
  `getNativePdfBlobForRecord` obtiennent systématiquement leur HTML via `ReaderMode.preview()`.
- `js/editor.js` : `setHeaderFooterData()` — seul point d'entrée d'un en-tête/pied venant de
  l'extérieur de l'éditeur (colonne Grist `HeaderFooter`) ; couvre par ricochet tous les sites de
  rendu qui le consomment (`measureHtmlHeightPx`, `resolvePageNumberBadgesForPreview`, `updateHfZone`,
  `renderPaginationOverlay`) et l'export PDF de l'en-tête/pied (`pdf-export.js`, qui lit la même
  donnée via `Editor.getHeaderFooterData()`).

Vérifié par la suite de tests complète (~90 scénarios, aucune régression) et par un export PDF réel
d'un document combinant tableau/image/gras via `PdfExport.getNativePdfBlobForRecord` après le
correctif.

| Fichier:ligne(s) (état AVANT correctif) | Constat | Priorité |
|---|---|---|
| `js/editor.js:2480, 2527/2532, 2638, 2730, 2740` | En-tête/pied de page injecté via `innerHTML` sans passer par le schéma de l'éditeur — un collaborateur du document Grist pouvait y placer un payload s'exécutant automatiquement. | ~~Important~~ ✅ |
| `js/pdf-export.js` (mesure/rendu du gabarit principal, via `reader-mode.js` en amont) | Hôtes de mesure hors-écran injectant le gabarit via `innerHTML` sans assainissement. | ~~Important~~ ✅ |
| `js/pdf-export.js:2655-2664` (`exportViaBrowserPrint`) | `document.write(... + container.outerHTML + ...)` exécutait réellement les `<script>` du gabarit. | ~~Important~~ ✅ |
| `js/variables.js:610-613, 553-558` | ~~Noms de colonne/table Grist interpolés sans échappement dans une modale~~ — **corrigé le 2026-09-12** : les deux constructions `<option>` passent désormais par `HtmlSanitize.clean()` avant assignation à `innerHTML`. Vérifié : neutralise une injection de test (`<script>` retiré, aucune exécution) tout en préservant à l'identique le rendu avec des colonnes réelles, y compris une colonne Référence. | ~~Important~~ ✅ |
| `js/pdf-export.js:2105-2144` (`inlineEditorImagesAsDataUri`, S3) | `fetch(src)` vers n'importe quelle URL non-`data:` présente dans le gabarit, sans validation, à chaque export. | Mineur — non corrigé, cf. §2.3. |

**Point important à noter pour l'audit DINUM/RSSI** : `js/reader-mode.js` (résolution des valeurs
`#Table.Colonne`) reste vérifié **sain** par ailleurs — il utilise systématiquement `textContent`,
jamais `innerHTML`, pour insérer une valeur de cellule. Le vecteur corrigé ici était le gabarit HTML
du modèle lui-même (et les données d'en-tête/pied de page), pas une donnée métier arbitraire.

### 3.3 Permissions et intégrité des tables internes Grist

| Fichier:ligne(s) | Constat | Priorité |
|---|---|---|
| `js/grist-api.js:10` vs `js/templates.js:4` vs `dev-tests/grist-stub.js:44` | Le nom de la table interne `Publipostage_Modeles` est recopié en dur à 3 endroits indépendants au lieu d'être lu depuis une seule source (`Templates.TABLE_NAME`, déjà exporté mais jamais réutilisé). Un renommage futur non répercuté partout ferait réapparaître la table des modèles comme table "normale" dans les sélecteurs de variables. | Important |
| `js/grist-api.js:8-10, 376-378` | La détection des tables internes (`Publipostage_Modeles`/`_LiensTables`/`_UserProbe`) ne vérifie que le NOM, jamais la forme des colonnes. Si un document Grist contient déjà une table portant l'un de ces noms par coïncidence, le widget la traite comme sienne et lit/écrit dessus avec le schéma attendu — risque de corruption de données utilisateur préexistantes. | Important |
| `js/grist-api.js:572-604` | `getCurrentUserEmail()` ne cache que le résultat final, pas la promesse en vol : plusieurs résolutions de chip email en parallèle (ex. en-tête + pied de page) déclenchent chacune leur propre cycle `AddTable`/`AddRecord`/`RemoveRecord`. De plus, `ensureUserProbeTable()` n'a pas de `try/catch` autour de l'`AddTable`, contrairement à sa fonction sœur `ensureLinksTableExists` — une exception ici remonte sans être rattrapée. | Important |

**Suggestion** : faire de `Templates.TABLE_NAME` la source unique de vérité ; ajouter une vérification légère du schéma attendu avant de faire confiance à une table existante ; mémoriser la promesse en cours dans `getCurrentUserEmail()` plutôt que seulement son résultat, et envelopper `AddTable` d'un `try/catch` par cohérence avec le reste du fichier.
**Impact fonctionnel** : faible risque, changements localisés et non intrusifs.

---

## 4. Intégrité des données — état de module et concurrence (`pdf-export.js`) — ✅ CORRIGÉ

| Fichier:ligne(s) | Constat | Priorité |
|---|---|---|
| `js/pdf-export.js` (état module `footnoteCounter`/`footnoteEntries`, `buildPdfContentFromRoot`) | ~~Les deux colonnes d'une zone 2-colonnes sont traitées en parallèle... réinitialise `footnoteCounter = 0` en entrée~~ — **root cause réévaluée et corrigée le 2026-09-12** : le vrai problème n'était pas QUE la concurrence (`Promise.all`), mais que `buildPdfContentFromRoot` remettait `footnoteCounter`/`footnoteEntries` à zéro à **CHAQUE** appel, y compris les appels imbriqués (un par colonne). Même en exécution strictement séquentielle, le traitement de la 2ᵉ colonne écrasait déjà le résultat de la 1ʳᵉ — **vérifié par reproduction directe avant correctif** (la note de la 1ʳᵉ colonne disparaissait du PDF, celle de la 2ᵉ survivait seule). | ~~Important~~ ✅ |
| `js/main.js` (boutons d'export) | ~~Aucun verrou n'empêche de déclencher un second export pendant qu'un premier est en cours~~ — **corrigé** : `withExportLock()` désactive les deux boutons d'export (unitaire + en lot) pendant toute opération, empêchant un chevauchement entre deux exports distincts. | ~~Important~~ ✅ |

**Correctif appliqué** (2 volets complémentaires) :
1. `buildPdfContentFromRoot(root, headingMarkers, availableWidthPt, isTopLevel)` — nouveau paramètre `isTopLevel` (déjà utilisé ailleurs pour la numérotation des titres, juste jamais propagé jusqu'ici) : la remise à zéro de `footnoteCounter`/`footnoteEntries` ne se fait plus que pour le VRAI appel top-level (une fois par passe de mesure/rendu du document entier), jamais pour les appels imbriqués via une zone 2-colonnes. Une colonne continue donc la numérotation là où le document principal (ou la colonne précédente) l'a laissée, au lieu de repartir de zéro et écraser le travail déjà fait.
2. `twoColumnsFrom` : les deux colonnes sont désormais traitées **séquentiellement** (plus de `Promise.all`) — élimine aussi toute race résiduelle si une colonne attend un décodage d'image pendant que l'autre progresse. Coût négligeable (jamais plus de 2 colonnes).
3. `js/main.js` : nouveau `withExportLock()`, désactive les boutons d'export unitaire ET en lot (span `v2-btn-export-pdf-batch` inclus - `.disabled` n'a pas d'effet sur un `<span>`, géré via `pointer-events`/`opacity`) pendant toute la durée d'un export, en défense en profondeur contre un chevauchement de deux exports top-level distincts (que la correction n°1 ne couvre pas, puisqu'il s'agit alors de deux VRAIS appels top-level légitimement concurrents).

Vérifié : reproduction du bug AVANT correctif (confirmé cassé), puis re-test APRÈS (les deux notes apparaissent, numérotées 1 et 2) ; scénario supplémentaire note dans le corps principal + note en colonne (numérotation continue 1/2 correcte) ; nouveau test de régression permanent `scenarios-chips.js:chip_footnote_survives_twocolumns_zone` ; suite complète (~90 scénarios) sans régression.

---

## 5. Qualité de code — redondance et « mille-feuille »

### 5.1 `js/editor.js` (3316 → 2480 lignes) — ✅ redondances corrigées, élagage des commentaires terminé

| Constat | Lignes (avant correctif) | Priorité |
|---|---|---|
| `captureSelection`/`withSavedSelection` copiées à l'identique dans 3 fonctions | 1780-1788, 3163-3171, 3197-3205 | ~~Important~~ ✅ extrait dans `createSelectionPreserver()` |
| Motif « patcher les attributs d'un nœud + restaurer la NodeSelection + dispatch » réimplémenté 3 fois | 1235-1256, 1964-1977, 2184-2193 | ~~Important~~ ✅ extrait dans `patchNodeAndReselect()` |
| Cycle de glisser (mousedown→mousemove→mouseup) réécrit à la main 3 fois | 999-1004, 1308-1310, 1354-1356 | Mineur — **conservé tel quel** (2-3 lignes par site, l'abstraction n'aurait pas apporté de clarté réelle face au risque de régression) |
| Commentaire obsolète référençant un mécanisme à drapeau inexistant | 585-588 | ~~Mineur~~ ✅ |
| Préfixe de log incohérent `[editor]` au lieu de `[Editor]` | 3307 | ~~Cosmétique~~ ✅ |

**Élagage des commentaires** (demande explicite de l'utilisateur, cf. guide Grist.Gouv §8.2 "watch out for verbosity") : deux passes successives (2026-09-12, jour puis nuit) ont ramené tout bloc de 5 lignes ou plus à 1-3 lignes dans l'ensemble du fichier, gardant le "pourquoi" et retirant la narration ("signalé par l'utilisateur", "vérifié en conditions réelles", détails déjà expliqués ailleurs). **Terminé**, plus de blocs disproportionnés restants.

**Aucun code mort trouvé** (pas de fonction/variable inutilisée, pas de branche toujours vraie/fausse, pas de `TODO` oublié). **Aucune fuite de portée de variable** (pas de globale accidentelle, tout l'état reste dans l'IIFE).

**Structure** : le fichier est **trop long pour sa propre lisibilité** malgré un code interne propre — pertinent aussi au regard du critère « portée fonctionnelle raisonnablement étroite » du guide Grist.Gouv (§8). Découpage recommandé, sans dépendance circulaire :
1. Nœuds/extensions TipTap personnalisés (image, 2-colonnes, saut de page, variables, notes...) → `editor-nodes.js`
2. Barres d'outils flottantes contextuelles (image, tableau, variable) → `floating-toolbars.js`
3. Mode en-tête/pied de page + aperçu de pagination → `header-footer-preview.js` (contient aussi le point de sécurité §3.2 — l'isoler faciliterait un futur correctif ciblé)
4. Barre d'outils statique principale → `main-toolbar.js`
5. Cœur du module (`init`, `getHTML`/`setHTML`, API publique) → reste dans `editor.js`, réduit à un point d'assemblage.

### 5.2 `js/pdf-export.js` (2757 → 1922 lignes, + `js/pdf-export-alt.js` 95 lignes) — ✅ redondances, robustesse, commentaires corrigés, impression navigateur/raster isolées

| Constat | Lignes (avant correctif) | Priorité |
|---|---|---|
| Détection d'image flottante (5 lignes identiques) dupliquée entre `cellLineToPdfObject` et `blockFrom` | 781-785, 1613-1617 | ~~Mineur~~ ✅ extrait dans `findFloatImageIn()` |
| Construction de l'objet `_floatCarry` (mêmes 5 champs) refaite 3 fois dans `blockFrom` | 1636-1641, 1702-1707, 1775-1780 | ~~Mineur~~ ✅ extrait dans `makeFloatCarry()` |
| Largeur de page A4 codée en dur 6 fois sous 3 formes différentes, dont une constante déjà nommée (`CONTENT_WIDTH_PT`) jamais réutilisée | 174, 921, 1037, 1404, 1637, 1704, 1777 | ~~Mineur~~ ✅ toutes remplacées par `CONTENT_WIDTH_PT` |
| `blockFrom` (~180 lignes) cumule routage par tag, 3 variantes de gestion d'image flottante, segmentation de paragraphe, cas titre/tâche/citation | 1608-1788 | Mineur — **non traité** (découpage structurel, risque plus élevé, cf. §5 structure) |
| 3 étapes de post-traitement (sommaire, ancrage d'images en attente, résolution des zones d'en-tête/pied) sans `try/catch` de repli | 1885-1889, 1894, 2486-2536 | ~~Important~~ ✅ chacune enveloppée d'un repli dégradant seulement la zone concernée |
| Une image "au cœur du texte" non flottante, présente dans le MÊME paragraphe qu'une image flottante, est silencieusement perdue | 1380-1420 | Mineur — **non traité** (cas limite rare, combinaison flottante+non-flottante dans un même paragraphe) |

**Point positif à noter** : la duplication entre les 3 chemins de rendu (cellule de tableau / flux principal / zone 2-colonnes) est **largement justifiée** — ils produisent des structures pdfmake réellement différentes (stack de cellule vs contenu top-level vs colonnes), et les briques transverses (mesure d'indentation, marqueurs de liste, habillage flottant) sont déjà bien factorisées et réutilisées par les 3. Une fusion forcée serait plus risquée que la duplication résiduelle listée ci-dessus.

**Structure** : découpage naturel identifié (mesure DOM générique / conversion HTML→pdfmake flux principal / tableaux / zones 2-colonnes / images en calque+habillage flottant, le bloc le plus long ~700 lignes / en-têtes-pieds / orchestration+export). Suit exactement les sections déjà délimitées par les commentaires du fichier lui-même.

### 5.3 Autres fichiers

| Fichier:ligne | Constat | Priorité |
|---|---|---|
| `js/templates.js` | ~~Boucle de validation qui ne peut structurellement jamais se déclencher~~ — **retirée**. | ~~Mineur~~ ✅ |
| `js/grist-api.js` | ~~`getCurrentMappings`/`getCurrentOptions` exportés mais jamais appelés~~ — **retirés** (variables internes `_currentMappings`/`_currentOptions` conservées, toujours utilisées ailleurs). | ~~Mineur~~ ✅ |
| `js/variables.js:82-87` | Les libellés d'onglets du panneau `#` (singleton créé une seule fois) ne sont jamais retraduits si l'utilisateur change de langue après la première ouverture du panneau — contrairement au reste du panneau, reconstruit à chaque ouverture. | Mineur |
| `js/i18n.js:323,328` | Le paramètre `root` d'`applyTranslations(root)` n'est en pratique jamais utilisé (aucun module ne crée dynamiquement d'élément `data-i18n*` ni n'appelle la fonction avec un argument) — fonctionnalité prête mais jamais exercée, à documenter comme telle ou à retirer. | Cosmétique |
| `js/main.js:533` | `GristAPI.init()` continue même en cas d'échec (try/catch qui n'interrompt pas la suite) — probablement voulu (résilience) mais non commenté à cet endroit précis. | Mineur |
| `js/editor.js:25` | Pas de `'use strict'` en tête de l'IIFE — aucune fuite constatée en pratique, mais coût nul à ajouter en défense en profondeur. | Cosmétique |

### 5.4 Portée des variables — jugement global

Aucune fuite de portée trouvée dans les fichiers audités (pas de globale accidentelle, pas de `var`, pas de collision de nom entre scopes imbriqués). Le point réellement sensible est celui de la §4 (état de module partagé entre exécutions concurrentes dans `pdf-export.js`), pas une fuite classique de portée lexicale.

---

## 6. Fichiers, inventaire, publication

### 6.1 Fichiers orphelins / à statut clarifier

| Fichier | Statut constaté | Recommandation | Priorité |
|---|---|---|---|
| `js/mailto-export.js` | Scaffold non câblé (aucun `<script>` ne le charge), mais son propre en-tête l'indique déjà clairement ("SCAFFOLD, pas encore implémenté") | Garder tel quel, rien à corriger | — |
| `smoke-test.html` | ~~Orphelin, cité en dur dans 2 commentaires~~ **Supprimé le 2026-09-12** (prototype obsolète, supersédé par `dev-tests/`) | — | — |
| `templates-gallery/*/schema.py` | **Réellement exécuté** (parsé par regex via `template-gallery.js:68-92` pour créer une vraie table Grist) — pas juste de la documentation humaine, contrairement à ce que son extension `.py` pourrait laisser croire | Ajouter un `templates-gallery/README.md` expliquant le rôle de chaque fichier (`manifest.json`, `template.html`, `schema.py`, `screenshot.svg`) et le format exact attendu pour `schema.py` | Mineur |
| `_test-harness.html` | Généré à la demande, jamais commité (`.gitignore` documenté) | Cohérent, rien à faire | — |

### 6.2 Racine du dépôt

| Fichier | Constat | Recommandation | Priorité |
|---|---|---|---|
| `CAHIER_DES_CHARGES.md` | ~~Confirmé corrompu : contenait le module `Variables` V1 (JavaScript brut, Quill) au lieu d'un cahier des charges~~ — **régénéré le 2026-09-12** depuis l'historique git, mis à jour pour refléter l'état actuel. | — | ~~Important~~ ✅ |
| `VERSIONING.md` | ~~Périmé, ne couvrait que l'historique V1~~ — **supprimé le 2026-09-12** avec le retrait de la V1 (les tags git existants restent disponibles pour un rollback historique si nécessaire). | — | — |
| `README.md` | ~~Absent de la racine~~ — **créé le 2026-09-12** : objet, configuration, section dédiée "Sécurité et permissions" (accès `'full'` + renvoi vers les Règles d'accès Grist), dépendances, tests, état du projet. | — | ~~Important~~ ✅ |
| `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` | Toujours absents. La doctrine DINUM générale attend LICENSE (permissive) et CONTRIBUTING.md pour un dépôt public ; le guide Grist.Gouv attend un canal de signalement de vulnérabilité (§8.2). | Choix de licence à valider avec l'utilisateur (décision légale/organisationnelle, pas un défaut de code) avant de créer `LICENSE`. `SECURITY.md` dépend du calendrier de rattachement officiel à l'écosystème Grist.Gouv. | **Important** |
| Nom du dépôt (`publipostageGrist`) | Le guide Grist.Gouv recommande le format `grist-widget-[nom-fonctionnel]` (ex. `grist-widget-publipostage`) pour la découvrabilité dans l'écosystème. | Envisager un renommage avant publication officielle (impact : mise à jour de l'URL GitHub Pages et de tout lien existant). | Mineur |
| `.gitignore` | Cohérent avec l'état actuel du projet (V2 + dev-tests pris en compte), vérifié en pratique. | Rien à faire. | — |

### 6.3 Références internes (obsolète — V1 retirée le 2026-09-12)

Section devenue sans objet : la V1 a été retirée et l'arborescence `v2/` aplatie à la racine
(cf. l'entrée du 2026-09-12 en tête de ce rapport). Il n'existe plus qu'un seul jeu de fichiers.

---

## 7. Accessibilité (RGAA) — signalement, pas un audit RGAA complet

Le secteur public français est soumis au RGAA (106 critères, 13 thèmes — DINUM), et le guide Grist.Gouv cite explicitement l'accessibilité comme une contrainte du secteur public (§8). Un audit RGAA complet est hors du périmètre de cette passe, mais 3 points substantiels sont ressortis :

| Constat | Fichier(s) | Priorité | Référence |
|---|---|---|---|
| ~~Aucune des 5 fenêtres modales n'a `role="dialog"`/`aria-modal="true"` ; le focus clavier n'est jamais déplacé à l'ouverture ni restitué à la fermeture ; la touche Échap n'est pas gérée.~~ — **corrigé le 2026-09-13** : nouveau `wireModalAccessibility()` (`js/main.js`), générique via `MutationObserver` sur le `style.display` de chaque modale — pose `role="dialog"`/`aria-modal="true"`, déplace le focus sur le premier élément focusable à l'ouverture, piège Tab/Shift+Tab à l'intérieur, ferme sur Échap (en déclenchant le VRAI bouton de fermeture, pas une fermeture réimplémentée), et restitue le focus à l'élément qui avait ouvert la modale. Aucun site d'ouverture/fermeture existant n'a été modifié. Vérifié sur 2 modales (comportement identique pour les 3 autres, même mécanisme générique). | ~~`index.html`, `js/main.js`, `js/settings.js`~~ | ~~Important~~ ✅ | RGAA 12.7/12.8 (WCAG 2.1 SC 2.4.3, 4.1.2) |
| 3 champs texte n'ont qu'un `placeholder`, sans `aria-label`/`<label>` associé (nom de modèle, nom de fichier PDF, recherche de galerie) — un `placeholder` seul n'est pas une alternative accessible fiable. | `index.html` (lignes 67, 114, 262) | Mineur — non corrigé | RGAA thème formulaires |
| Les modales utilisent `style="display:none"` + bascule JS, alors que le panneau Réglages (même fichier) utilise l'attribut natif `hidden` — deux conventions cohabitent sans qu'un choix soit expliqué. | `index.html` | Cosmétique | — |

**Recommandation** : prévoir un audit RGAA dédié avant publication officielle (hors périmètre de cet audit de code), au minimum sur les points ci-dessus qui sont peu coûteux à corriger (ajout d'attributs ARIA, piège à focus, gestion d'Échap).

---

## 8. Conformité au guide de contribution Grist.Gouv

*Guide fourni par l'utilisateur : « Contributing Guide — Grist.Gouv Widgets », DINUM/ANCT, dernière mise à jour juillet 2026. Ce guide régit spécifiquement la contribution de widgets à l'instance souveraine Grist.Gouv (déploiement interministériel de Grist) — distinct de la doctrine générale de publication de code source déjà citée en §9 (ex-§7 de la version précédente de ce rapport).*

### 8.1 Les deux voies de publication

Le guide décrit deux chemins : **Voie A** (l'équipe Grist.Gouv découvre et « fork » un widget publié publiquement — aucune démarche active requise, mais plus le widget respecte déjà les critères qualité, plus il est « fork-ready ») et **Voie B** (héberger le widget sur l'instance officielle DINUM/ANCT — exige de suivre les 4 étapes du guide ET une **revue de sécurité** avant tout déploiement en production). **La mention d'un audit DINUM par l'utilisateur place clairement ce projet sur la Voie B** — tous les critères ci-dessous sont donc à satisfaire, pas seulement à titre indicatif.

### 8.2 Grille de conformité détaillée

| Exigence du guide | État actuel du projet | Écart | Priorité |
|---|---|---|---|
| **README.md** expliquant : ce que fait le widget, comment le configurer, ses dépendances | ~~Absent~~ — **créé le 2026-09-12**, couvre objet/configuration/dépendances/sécurité-permissions/tests/état du projet. | — | ~~Important~~ ✅ |
| **Portée fonctionnelle raisonnablement étroite** ("si votre widget semble faire plusieurs métiers différents, envisagez de le scinder") | Le widget fait : édition riche + export PDF + galerie de modèles + résolution de variables cross-table + réglages i18n. Peut se justifier comme UN seul métier cohérent ("publipostage documentaire"), mais le volume de code (~11 850 lignes) et la taille de certains fichiers (`editor.js` 3316 lignes) vont dans le sens d'une préoccupation légitime sur ce critère. | À argumenter explicitement dans le README (pourquoi ce périmètre reste un seul widget cohérent) plutôt qu'à découper en plusieurs widgets — une explication claire suffit probablement à satisfaire l'esprit du critère. | Mineur |
| **Tests** : fonctionnalités cœur couvertes par des tests unitaires ; au moins un scénario d'intégration (création de document, interaction widget) | `dev-tests/` couvre ~85 scénarios (formatage, listes, tableaux, 2-colonnes, images, export PDF vectoriel...) — un socle réel et non négligeable. **Mais** : ce sont des tests pilotés manuellement depuis la console navigateur contre un `grist-stub.js` (pas une vraie exécution Grist), pas une suite automatisée exécutable en CI/CD, et rien ne teste le scénario "création de document réel + interaction widget" avec l'API Grist réelle (résolution `#Variable` réelle explicitement documentée comme non testable en local, cf. `dev-tests/README.md`). | Documenter clairement dans le README ce que couvre/ne couvre pas la suite actuelle ; envisager, a minima, un script qui exécute la suite automatiquement (headless) plutôt qu'à la main, même sans aller jusqu'à un vrai test d'intégration Grist réel. | Important |
| **Lisibilité/maintenabilité** : code compréhensible par un humain sans IA, noms explicites | Conforme dans l'ensemble (cf. §5 — conventions de nommage homogènes, commentaires expliquant le "pourquoi") — sous réserve des points de duplication/longueur de fichier déjà listés en §5. | Aucun écart bloquant, nettoyages recommandés en §5. | — |
| **Concis, pas de verbosité excessive** ("Les outils IA ont tendance à générer du code plus long que nécessaire... les relecteurs devraient pouvoir lire la logique de votre widget d'une traite") | Les fichiers `editor.js` (3316 lignes) et `pdf-export.js` (2757 lignes) ne permettent PAS une lecture "d'une traite" par un relecteur — c'est le point le plus directement testé par ce critère du guide. Le code interne à chaque fonction reste cependant loin d'être verbeux artificiellement (audit §5 : peu de code mort, peu de sur-ingénierie) — la longueur vient du nombre de fonctionnalités réelles empilées dans peu de fichiers, pas de code inutilement bavard. | Le découpage en modules proposé en §5.1/§5.2 répond directement à ce critère. | Important |
| **Pas de duplication de code inter-widgets** ("le code partagé doit vivre dans un module commun, pas être copié-collé") | Vérifié : les 3 chemins de rendu PDF (cellule/flux/2-colonnes) réutilisent déjà les briques transverses communes (cf. §5.2, point positif) ; les duplications résiduelles trouvées (§5.1, §5.2) sont internes à un même fichier, pas entre widgets distincts. | Pas d'écart sur l'esprit du critère (un seul widget dans ce dépôt), les duplications internes restent à traiter par ailleurs (§5). | — |
| **« Safe »** : pas d'appel à des services externes non documentés, pas de stockage de données utilisateur hors de Grist | **Partiellement résolu** : les CDN `esm.sh`/`cdnjs.cloudflare.com` (§2.2) sont désormais documentés dans le README (section Dépendances) — ne sont donc plus "non documentés", mais restent des services externes sans intégrité SRI (§2.2, non corrigé). Le fetch d'images externes à chaque export (§2.3) reste un appel réseau automatique non encadré. **Aucune donnée utilisateur n'est stockée hors de Grist** (vérifié : seuls `pp_lang`/`pp_trigger_char`, des préférences d'interface, vivent en `localStorage` — aucune donnée métier). | Le fetch d'image à l'export mérite encore une clarification produit (comportement voulu ou à encadrer) ; l'intégrité SRI/vendorisation reste à traiter (§2.2). | Mineur *(dégradé depuis Important — le point "non documenté" est traité)* |
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
- **Suite de tests automatisés** (`dev-tests/`, ~90 scénarios) déjà en place et à jour — un vrai filet de sécurité pour les corrections proposées ici, en particulier pour les refactorings de §5, et une réponse partielle (à documenter/étoffer, cf. §8.2) au critère "Tests" du guide Grist.Gouv. A servi à valider les correctifs de sécurité du 2026-09-12 (aucune régression).
- **Correctifs de sécurité 2026-09-12** : fuite RGPD (console), XSS en-tête/pied de page, XSS `document.write()` corrigés via un point d'entrée unique par vulnérabilité plutôt qu'un correctif dispersé sur chaque site d'insertion — cf. §3.1/§3.2. README.md créé, couvrant notamment la section "Sécurité et permissions" attendue par une RSSI.
- **Correctif d'intégrité des données 2026-09-12** (§4) : la corruption silencieuse de la numérotation des notes de bas de page dans une zone 2-colonnes s'est révélée avoir une cause plus profonde que prévu à l'audit initial (remise à zéro sur tout appel imbriqué, pas seulement un problème de concurrence) — détectée par reproduction directe AVANT correctif, corrigée avec un paramètre `isTopLevel` déjà existant ailleurs dans le fichier, et couverte par un nouveau test de régression permanent.
- **Duplication déjà justifiée et documentée** entre les 3 chemins de rendu PDF (cellule/flux principal/2-colonnes) — pas un défaut, un choix assumé, conforme à l'esprit du critère anti-duplication du guide Grist.Gouv (§8.2).
- **Versions de dépendances externes systématiquement pinnées** (jamais de `@latest`) — bon point partiel pour la chaîne d'approvisionnement (§2.2), il manque l'intégrité (SRI) et l'hébergement local pour compléter le tableau.
- **Choix `requiredAccess: 'full'` documenté et techniquement justifié** (§2.1) — ce n'est pas une négligence de configuration, un point qui jouera en faveur du projet dans la discussion avec la RSSI même si le niveau d'accès lui-même reste un point de vigilance.

---

## 11. Prochaines étapes proposées

**Fait le 2026-09-12** : README.md créé ; fuite RGPD console corrigée ; XSS en-tête/pied de page,
`document.write()` et modale de liaison entre tables corrigés via `js/html-sanitize.js` ; intégrité
SRI ajoutée sur les 4 bibliothèques `cdnjs` (V1+V2), dépendances documentées dans le README ;
corruption silencieuse des notes de bas de page en zone 2-colonnes corrigée (§4) + verrou
anti-double-export.

**Mis en attente à la demande de l'utilisateur** : vendorisation `esm.sh` (§2.2) — décision produit
délibérément reportée.

1. **Décider du calendrier de rattachement à l'écosystème Grist.Gouv** (Voie A ou B, cf. §8.1) — conditionne l'urgence du `SECURITY.md`/canal VDP et du renommage du dépôt.
2. **Choisir une licence** (décision légale/organisationnelle, doctrine DINUM = permissive de préférence) pour pouvoir créer `LICENSE`.
3. Le fetch d'image externe non encadré (§2.3) reste à clarifier (allowlist ou confirmation explicite) si jugé utile.
4. Passe de nettoyage qualité (§5), en commençant par les duplications à faible risque (constantes, petites factorisations) avant les refactorings plus structurants (découpage de fichiers, §5.1/§5.2 — répond aussi au critère "concision" du guide, §8.2).
5. Prévoir séparément un audit RGAA dédié (§7) et la constitution du dossier de sécurité RGS (§9).

Mise à jour du 2026-09-12 : ce rapport reflète les correctifs déjà appliqués (voir mentions "✅
CORRIGÉ" ci-dessus) suite à validation explicite de l'utilisateur. Toutes les autres sections
décrivent l'état constaté lors de l'audit initial, non encore traité.

**Mise à jour du 2026-09-14** : voir §12 (performance) et §13 (code mort/CSS) pour la passe
complémentaire de ce jour — **rien n'a été corrigé pour ces deux nouvelles sections** (audit pur,
consigne explicite de ne pas toucher au code publié en Alpha le lendemain). Priorités ajoutées à la
liste ci-dessus, par ordre de ratio gain/effort décroissant :
6. **`css/roboto-fonts.css` en WOFF2 au lieu de TTF brut** (§12.1.1) — le point le plus impactant de
   l'audit performance, gain de plusieurs centaines de Ko sur le premier rendu, aucun risque
   fonctionnel, aucun outil de build à mettre en place.
7. **Paralléliser les 14 `import()` séquentiels de `js/editor.js:init()`** (§12.1.2) — `Promise.all`,
   gain potentiel important sur le temps d'ouverture du widget, changement mécanique sans risque.
8. **Retirer les résidus CSS `.ql-*` de `css/style.css`** (§13.1) — bien plus étendu que le seul exemple
   initialement repéré (~80 lignes sur 405, la moitié du fichier), aucun risque (vérifié mort par grep
   exhaustif), purement cosmétique mais pertinent pour la lisibilité avant une revue Grist.Gouv (§8.2).
9. Les autres constats Moyen/Mineur de §12 (redondance `listTables()`, double mesure DOM de la 2ᵉ passe
   PDF, `computePageGridPosition` qui recalcule deux fois les sauts de page) et de §13 (résidus CSS V2
   internes §13.2, chaînes de fonctions mortes "PJ"/"colonne image dédiée" §13.3) — aucun n'est urgent,
   à traiter au fil de l'eau.
10. **Fonctionnalités Beta** : voir `planning/ROADMAP.md` (nouveau, 2026-09-14) pour le plan consolidé
    des demandes fonctionnelles de l'utilisateur, avec un fichier de conception dédié par grosse
    fonctionnalité dans `planning/`.

---

## 12. Performance et optimisation (nouveau 2026-09-14)

*Périmètre volontairement distinct du reste de cet audit — jamais couvert en profondeur jusqu'ici.
Méthode : lecture ciblée du chargement initial, du pipeline de mesure/pagination, du moteur d'export
PDF, et recherche systématique des écouteurs d'évènements globaux. Aucune mesure chronométrée réelle —
estimations déduites de la lecture du code. Échelle de priorité identique au reste du rapport, avec
**Info** ajouté pour les points vérifiés déjà corrects (à ne pas re-signaler par erreur dans un futur
audit).*

### 12.0 Synthèse

| # | Constat | Fichier:ligne(s) | Priorité |
|---|---|---|---|
| 12.1 | `css/roboto-fonts.css` (566 Ko) embarque du TrueType brut en base64 au lieu de WOFF2 | `css/roboto-fonts.css:7-32`, `index.html:75` | **Important** |
| 12.2 | 14 `await import()` séquentiels au démarrage de l'éditeur (effet cascade réseau) | `js/editor.js:216-231` | **Important** |
| 12.3 | `GristAPI.init()` puis `Editor.init()` attendus en série alors qu'ils sont indépendants | `js/main.js:539-540` | Mineur |
| 12.4 | Bibliothèques PDF déjà chargées paresseusement (premier export seulement) | `js/pdf-export.js:4-14` | Info — déjà bien fait |
| 12.5 | `ensurePdfLibsLoaded` charge 6 scripts strictement en série, dont 2 non nécessaires au seul export vectoriel actif | `js/pdf-export.js:6-14,27-34` | Mineur |
| 12.6 | `font-display: block` sur des polices déjà embarquées en local | `css/roboto-fonts.css:11,18,25,32` | Cosmétique |
| 12.7 | `computePageGridPosition` recalcule les sauts de page deux fois de suite | `js/header-footer-preview.js:319-330` | Mineur-Moyen |
| 12.8 | Pagination déjà débouncée (200 ms) sur la frappe | `js/header-footer-preview.js:243-246` | Info — déjà bien fait |
| 12.9 | `resolvePendingImageAnchors` en O(images × blocs) | `js/pdf-export.js:1266-1323` | Mineur |
| 12.10 | La 2ᵉ passe de `resolveNativePdfContent` refait toute la mesure DOM depuis zéro | `js/pdf-export.js:1568` | Moyen |
| 12.11 | ~4-8 cycles clone/mesure hors-écran par export (2-colonnes + tableau) | `js/pdf-export.js:635-751,1339-1361` | Moyen |
| 12.12 | 4 zones en-tête/pied résolues en série sans nécessité (pas d'état partagé contrairement aux colonnes) | `js/pdf-export.js:1712-1715,1739-1744` | Mineur-Moyen |
| 12.13 | Images dupliquées (même `src`) re-téléchargées/re-rastérisées séparément | `js/pdf-export.js:1382-1412` | Mineur |
| 12.14 | Export en lot (ZIP) et 2-colonnes volontairement séquentiels — vérifiés justifiés (état de module partagé) | `js/main.js:240-251`, `js/pdf-export.js:686-688` | Info — justifié |
| 12.15 | Listeners `document`/`window` : tous posés une seule fois, aucune accumulation trouvée | tout `js/` | Info — bonne hygiène |
| 12.16 | `mouseup {once:true}` non nettoyé par `destroy()` si un glisser est interrompu | `js/editor-nodes.js:636-637,668-669,700-703` | Mineur |
| 12.17 | `grist.docApi.listTables()` appelé 3 fois séparément, dont 2 au même démarrage | `js/grist-api.js:181,317,478` | Moyen |
| 12.18 | `refreshSchema` parallélise déjà correctement ses `fetchTable` | `js/grist-api.js:187` | Info — bonne pratique |
| 12.19 | `pdf-fonts.js`/`pdf-fonts-extra.js` en TTF brut — contrainte réelle de pdfmake, pas un oubli | `js/pdf-fonts.js`, `js/pdf-fonts-extra.js` | Info — justifié |
| 12.20 | 5 familles de police non-Roboto chargées en bloc même si le document n'utilise que Roboto | `js/pdf-fonts-extra.js` | Mineur |
| 12.21 | `console.log` sur chaque évènement `onRecord` | `js/grist-api.js:45` | Cosmétique |

### 12.1 Chargement initial

**[Important] §12.1 `roboto-fonts.css` en TTF brut plutôt que WOFF2.** Chargé en tout premier `<link>`
du `<head>` (`index.html:75`, avant tout le reste du CSS) — donc bloquant pour le premier rendu. 566 Ko
pour 4 `@font-face` seulement, chacune en `data:font/truetype;base64,...` : le TrueType n'est pas
compressé pour le web (contrairement à WOFF2/Brotli, ~5-8× plus petit) et le base64 ajoute ~33 % de
surcharge. Un jeu de 4 `.woff2` équivalent pèserait vraisemblablement moins de 100 Ko. **Différence
avec `js/pdf-fonts*.js`** (§12.19) : ces fichiers-là sont réellement contraints au TTF par pdfmake
(qui embarque les tables de glyphes directement dans le PDF, ne peut pas décompresser du WOFF2) — ce
n'est PAS le cas de `roboto-fonts.css`, une police CSS classique que le navigateur sait nativement lire
en WOFF2. Suggestion : reconvertir via `fonttools`/`woff2_compress` (hors ligne, pas d'outil de build
permanent nécessaire), aucun changement fonctionnel.

**[Important] §12.2 Cascade de 14 `import()` dynamiques séquentiels.** `js/editor.js:216-231`
(`init()`, une fois par session) attend chaque `await import('@tiptap/...')` avant de lancer le
suivant, alors qu'aucune dépendance d'ordre réelle n'existe entre eux (chacun affecte une variable
locale distincte, aucun n'est utilisé avant la ligne 254). Sur une connexion avec 50-150 ms de latence
vers `esm.sh` (cache froid), cela peut ajouter 1 à 2 secondes avant que l'éditeur n'apparaisse.
Suggestion : `Promise.all([import(...), import(...), ...])`, changement mécanique sans risque.

**[Mineur] §12.3** `GristAPI.init()` et `Editor.init()` (`js/main.js:539-540`) sont indépendants
(vérifié : `Editor.init()` n'appelle jamais `GristAPI` dans son propre corps) mais attendus en série —
pourraient démarrer en parallèle pour superposer leurs latences réseau respectives au lieu de les
additionner.

**[Info — déjà bien fait] §12.4** Bibliothèques PDF (pdfmake/vfs_fonts/html2pdf/JSZip + polices,
~1,8 Mo) confirmées chargées paresseusement, uniquement au premier export réel (`ensurePdfLibsLoaded`,
déclenchée depuis `js/pdf-export.js:1758,1798`) — exactement le pattern recommandé, déjà en place.

**[Mineur] §12.5** Les 6 bibliothèques PDF sont chargées strictement en série
(`js/pdf-export.js:27-34`), y compris `html2pdf.bundle.min.js` et `jszip.min.js` qui n'ont aucune
dépendance d'ordre entre eux ni avec pdfmake — et qui, aujourd'hui, ne servent à AUCUN chemin actif
(qualités raster/impression désactivées dans l'UI ; export en lot ZIP est le seul utilisateur réel de
JSZip). Un simple export unitaire vectoriel télécharge donc ces 2 bibliothèques pour rien, retardant en
plus `pdf-fonts.js`/`pdf-fonts-extra.js` (1,77 Mo) qui pourraient démarrer plus tôt. Suggestion :
séparer en groupes (cœur vectoriel / JSZip / html2pdf) et paralléliser les groupes indépendants.

**[Cosmétique] §12.6** `font-display: block` (`css/roboto-fonts.css:11,18,25,32`) n'a plus d'utilité
réelle une fois la police déjà embarquée en local (pas de requête réseau à "attendre") — `swap`/
`optional` donnerait la même garantie sans le risque théorique de texte invisible.

### 12.2 Coût de mesure/reflow à l'exécution

**[Mineur-Moyen] §12.7** `computePageGridPosition` (`js/header-footer-preview.js:319-330`) appelle
`renderPaginationOverlay()` (qui calcule déjà les sauts de page en interne) PUIS recalcule les mêmes
sauts de page une seconde fois via `computePageBreaks` — travail dupliqué à chaque glisser d'image en
calque, action "aligner"/"calque devant-derrière", et une fois par image à migrer au chargement d'un
document ancien. Suggestion : faire retourner les `breaks` déjà calculés par `renderPaginationOverlay`
plutôt que de les recalculer. Non urgent (actions ponctuelles, pas la frappe).

**[Info — déjà bien fait] §12.8** La pagination est déjà débouncée à 200 ms sur la frappe
(`schedulePaginationRecompute`, `js/header-footer-preview.js:243-246`) — les appels non débouncés
correspondent tous à des actions discrètes (entrer/sortir du mode en-tête/pied, charger un modèle),
jamais à un flux de frappe continu. Confirmé correct.

**[Mineur] §12.9** `resolvePendingImageAnchors` (`js/pdf-export.js:1266-1323`) est en O(images en
calque × blocs mesurables) — pas de "layout thrashing" au sens strict (aucune écriture intercalée entre
les lectures), mais un coût qui grossit avec le nombre d'images en calque simultanées. Risque faible en
pratique (fonctionnalité secondaire, documents avec beaucoup d'images en calque rares).

**[Info — justifié] §12.10 bis** L'écriture-puis-lecture dans la boucle de `renderPaginationOverlay`
(`js/header-footer-preview.js:435-474`) est un "layout thrashing" explicitement voulu et commenté :
chaque coupure de page dépend réellement de la marge appliquée par la précédente, le lot ne peut pas
être batché sans changer le résultat. Confirmé justifié.

### 12.3 Coût du pipeline d'export PDF

**[Info — nécessaire] §12.10** L'architecture à deux passes de `resolveNativePdfContent`
(`js/pdf-export.js:1513-1568`, déclenchée seulement si sommaire/images en calque en attente/notes de
bas de page) sert à connaître les numéros de page réels que pdfmake attribuera — information qui
n'existe qu'après la propre pagination de pdfmake, impossible à connaître à l'avance sans réimplémenter
son algorithme. Confirmé fondamentalement nécessaire pour ces 3 fonctionnalités, déjà limité aux seuls
documents qui en ont besoin.

**[Moyen] §12.10** Quand cette double passe se déclenche, la 2ᵉ passe rappelle intégralement
`htmlToPdfContent` (`js/pdf-export.js:1568`) — reconstruit un nouveau `root`, réattache hors-écran,
redécode toutes les images, relance toute la mesure DOM récursive — alors que la GÉOMÉTRIE du document
n'a pas changé entre les deux passes (même HTML, même largeur), seule l'info de pagination pdfmake
diffère. Le travail de mesure DOM (le plus coûteux) est donc entièrement dupliqué. Suggestion (refactor
non trivial) : séparer mesure DOM et construction d'objets pdfmake pour réutiliser les mesures déjà
faites en 1ʳᵉ passe.

**[Moyen] §12.11** Pour un document avec une zone 2-colonnes et un tableau, environ **4 cycles**
clone/attache/mesure/détache hors-écran par export (dont 1 `cloneNode(true)` dans `twoColumnsFrom`
rien que pour mesurer le chrome CSS de la zone) — ~8 si la double passe de §12.10 se déclenche aussi.
`tableFrom`, en comparaison, mesure directement sans clone séparé — bonne pratique déjà en place à ce
niveau précis. Le traitement séquentiel (pas parallèle) des 2 colonnes est confirmé justifié (état de
module partagé `footnoteCounter`, cf. §4 de ce rapport).

**[Mineur-Moyen] §12.12** Contrairement aux 2 colonnes (état partagé réel), les 4 zones en-tête/pied
(`js/pdf-export.js:1712-1715,1739-1744`) n'ont AUCUN état de module partagé entre elles (les notes de
bas de page ne sont jamais résolues en en-tête/pied) — pourtant résolues en série sans raison. Bon
contre-exemple au sein du même fichier : le réflexe de paralléliser existe (`refreshSchema`, §12.18)
mais n'est pas appliqué uniformément partout où ce serait pourtant sans risque.

**[Mineur] §12.13** `inlineEditorImagesAsDataUri` (`js/pdf-export.js:1382-1412`) ne déduplique jamais
par `src` — une même image répétée plusieurs fois dans un document relance sa propre conversion/
rastérisation canvas à chaque occurrence. Suggestion : mémoïser par `src` dans une `Map` locale à
l'appel.

**[Info — justifié] §12.14** L'export en lot (ZIP, `js/main.js:240-251`) reste volontairement
séquentiel pour la même raison que les 2 colonnes (état de module partagé `footnoteCounter`/
`footnoteEntries`) — paralléliser mélangerait les notes de bas de page entre lignes Grist différentes,
un risque plus grave encore. Confirmé correct, donne aussi un indicateur de progression naturel.

### 12.4 Mémoire et hygiène des écouteurs d'évènements

**[Info — bonne hygiène] §12.15** Recherche exhaustive des `addEventListener` sur `document`/`window`
dans tout `js/` : tous posés une seule fois (au niveau module ou dans `init()`, jamais reposés à
l'ouverture répétée d'une toolbar/d'un mode/d'un modèle) — aucune accumulation trouvée sur les
scénarios réalistes (ouverture répétée de la barre d'outils image, entrée/sortie répétée du mode
en-tête/pied, changement de modèle répété).

**[Mineur] §12.16** `js/editor-nodes.js:636-637,668-669` posent un `mouseup {once:true}` non retiré par
`destroy()` (`js/editor-nodes.js:700-703`, qui ne nettoie que les `mousemove`). Aucun souci en usage
normal (`{once:true}` s'auto-nettoie au relâchement), mais si le NodeView est détruit PENDANT un
glisser (ex. Ctrl+Z en plein déplacement), le listener orphelin reste posé sur `document` jusqu'au
prochain relâchement de bouton n'importe où sur la page. Suggestion : ajouter le nettoyage manquant à
`destroy()` par cohérence.

### 12.5 Calculs redondants

**[Moyen] §12.17** `grist.docApi.listTables()` appelé 3 fois séparément (`js/grist-api.js:181,317,478`),
dont 2 systématiquement en séquence au même démarrage (`refreshSchema()` puis `ensureLinksTableExists()`
dans le même `init()`) — la 2ᵉ refait un aller-retour réseau identique à une information déjà obtenue
2 lignes plus haut, jamais conservée. Coût : un aller-retour réseau supplémentaire à CHAQUE ouverture du
widget. Suggestion : conserver la liste brute lors de `refreshSchema()` et la réutiliser.

**[Info — bonne pratique] §12.18** `refreshSchema` parallélise déjà correctement ses `fetchTable` via
`Promise.all` (`js/grist-api.js:187`, commenté explicitement "latence = le plus lent, pas la somme") —
bon exemple à conserver, contraste utile avec §12.12/§12.17.

### 12.6 Autres constats

**[Info — justifié] §12.19** `pdf-fonts.js`/`pdf-fonts-extra.js` en TTF brut (166 Ko + 1,6 Mo) : une
vraie contrainte de pdfmake (embarque les glyphes directement dans le flux PDF, ne peut pas
désempaqueter du WOFF2), pas un oubli — voir la distinction avec §12.1 (`roboto-fonts.css`, qui n'a
elle aucune excuse).

**[Mineur] §12.20** `pdf-fonts-extra.js` pose inconditionnellement les 20 entrées (5 familles × 4
styles) dès son exécution, même si le document exporté n'utilise que Roboto (police par défaut) — coût
systématique (une fois par session, pas répété) même quand inutile. Suggestion (non urgente) : découper
par famille et ne charger que celles réellement référencées dans le document.

**[Cosmétique] §12.21** `console.log` sur chaque `onRecord` (`js/grist-api.js:45`) — coût individuel
négligeable, bruit de console sur une session longue avec beaucoup de navigation. Sans lien avec le
point RGPD déjà traité en §3.1 (celui-ci ne loggue que `rowId`, pas de donnée personnelle).

**Conclusion §12** : le point le plus impactant et le plus simple à corriger est §12.1 (police CSS en
WOFF2). §12.2 (parallélisation des imports) a le second meilleur ratio gain/effort. Les points liés au
pipeline PDF (§12.7, §12.10-12.12, §12.17) sont réels mais de moindre ampleur et/ou plus coûteux à
corriger proprement — à traiter sans urgence. Une part importante de ce qui aurait pu sembler
"suspect" à la lecture s'est révélée, à vérification, être un choix délibéré déjà correctement
implémenté (§12.4, §12.8, §12.14, §12.18, §12.19) — cohérent avec l'historique de correctifs déjà
documenté dans ce rapport.

---

## 13. Code mort et hygiène CSS (approfondi 2026-09-14)

*L'audit du 2026-09-12/13 avait déjà cherché du code mort dans `editor.js`/`pdf-export.js` (§5.1,
conclusion "aucun trouvé") mais n'avait jamais passé `css/style.css` au crible ligne à ligne — cette
passe comble ce trou, déclenchée par la découverte manuelle d'une règle `.ql-editor` (V1/Quill) morte
pendant la session du 2026-09-13/14. Méthode : `grep` exhaustif sur TOUT le dépôt (jamais limité au
fichier d'origine) pour chaque candidat "mort" — un sélecteur/une fonction n'est classé mort que si sa
recherche à travers `index.html` + tous les `js/*.js` + `dev-tests/*.js` ne renvoie aucun autre résultat
que sa propre définition.*

### 13.1 Résidus V1 (Quill.js) dans `css/style.css` — bien plus étendu que le seul exemple déjà repéré

Confirmé par `grep -rn "ql-" js/*.js index.html` → 0 classe réelle référencée nulle part. Mais
**`css/style.css` contient environ 80 lignes de sélecteurs `.ql-*` sur 405** (la moitié du fichier) :

| Bloc mort | Lignes | Priorité |
|---|---|---|
| `#editor-container.a4-preview .ql-editor` | `css/style.css:166` | Mineur *(exemple initial déjà repéré manuellement)* |
| `.ql-editor`, `.ql-toolbar.ql-snow`, pickers/traits/remplissages `.ql-snow`, états hover/active | `css/style.css:174-187` | Mineur |
| `.ql-toolbar .ql-formats`, `.ql-page-break`, `.ql-insert-*`, `.ql-undo/.ql-redo svg` | `css/style.css:212-224,236` | Mineur |
| Numérotation de titres : branche `.ql-editor[data-heading-style]` d'un sélecteur groupé (la branche `.reader-content[...]` reste vivante) — doublon exact de la règle déjà correcte et scopée à `.tiptap` seul dans `css/editor-v2.css:295-319` | `css/style.css:300-331` | Cosmétique (comportement inchangé si retiré) |
| Pickers Taille/Police Quill (5 polices × plusieurs règles chacune) | `css/style.css:383-405` | Mineur |

Suggestion : supprimer l'intégralité (aucun risque, vérifié par grep global) ; pour la numérotation de
titres, retirer la duplication au profit de la version déjà correcte d'`editor-v2.css`.

### 13.2 Résidus d'anciennes itérations V2 elles-mêmes (sans rapport avec Quill)

Le point le plus substantiel manqué par l'audit du 2026-09-12/13 (qui n'avait jamais lu `style.css`
ligne à ligne). Chacun vérifié par recherche globale, pas seulement dans le fichier CSS :

| Résidu | Remplacé par | Lignes mortes |
|---|---|---|
| Ancien panneau repliable nom-modèle/nom-fichier (`.toolbar-panel`, `#btn-toggle-panel`, `.compact-select`, `.field-hint`) | `.title-cluster`/`.v2-pdf-filename-cluster` (`css/toolbar-v2.css`) | `css/style.css:53,91-94,123-128` |
| Mode "Code HTML" (édition brute) entièrement retiré (2 seuls modes restants : édition/lecture) | — (fonctionnalité retirée, pas remplacée) | `css/style.css:112-114,117-120` |
| Infobulle par libellé au survol (`.btn-text`) | mécanisme `[data-tip]` — **le remplacement est documenté par le code lui-même** (`css/toolbar-v2.css:30`) | `css/style.css:65-73` |
| Système d'édition de tableau V1 maison (`.editable-table`, `.table-context-toolbar`, `.table-col-resize-handle`, `body.resizing-table-column`) | `@tiptap/extension-table` natif (`.tableWrapper`/`.selectedCell`/`.column-resize-handle`, posées par `prosemirror-tables` lui-même — pas du code applicatif, donc pas "mortes" elles) | `css/style.css:190-193,195-209,237-238,242-276` (~45 lignes) |
| Ancienne barre d'outils flottante image (Quill) : `.editor-image-toolbar`, `.editor-image-opacity`, `.editor-image-anchor`, `body.resizing-editor-image` | `.v2-floating-toolbar` (`js/floating-toolbars.js`) | `css/style.css:339-360,371-373,378-379` |
| Résidus isolés : `.v2-hover-vsep`, `.v2-format-chip-icon`, `.two-columns-marker` | — | `css/editor-v2.css:404,463-464`, `css/style.css:229,234` |
| Icône "blockquote" du dictionnaire (`js/icons.js:21`) jamais demandée — aucun bouton "Citation" nulle part dans l'UI | — | `js/icons.js:21` *(voir `planning/feature-content-blocks.md` : probable fonctionnalité manquante plutôt qu'un vrai déchet — le RENDU blockquote reste actif, seul le bouton d'accès manque)* |

Priorité : Mineur/Cosmétique pour l'ensemble (aucun impact fonctionnel, ~130 lignes CSS mortes au
total entre §13.1 et §13.2).

### 13.3 Chaînes de fonctions JS entièrement inatteignables (au-delà de simples exports inutilisés)

Deux fonctionnalités avec une implémentation complète côté `js/grist-api.js`/`js/templates.js` mais
**aucun point d'entrée UI** :
- **"Enregistrer l'export PDF dans une pièce jointe"** : `saveAttachmentToMappedColumn`,
  `getPdfAttachmentColumnId` (`js/grist-api.js:509,515`), `uploadAttachment` (`js/grist-api.js:450`,
  transitivement mort) — aucun `#btn-save-attachment` dans `index.html`, aucun appelant nulle part.
  *(Rappel `AUDIT_CODE.md` déjà existant : ce mécanisme avait été volontairement retiré de l'UI par le
  passé pour une raison de casse de la résolution `#Variable`, cf. mémoire projet — cohérent avec ce
  constat, pas une régression.)*
- **"Colonne pièce-jointe dédiée par image insérée"** : `createImageColumn`, `attachImage`
  (`js/templates.js:26,36`) — jamais appelées, l'insertion réelle d'image en V2 passe exclusivement par
  URL ou par variable liée à une colonne PJ déjà existante.

Priorité : Mineur — du code de MUTATION de document (via `applyUserActions`) resté mort, dans un module
qui demande déjà l'accès `'full'` (§2.1) : surface à auditer pour rien. Suggestion : supprimer, ou
documenter explicitement comme scaffold (à la manière de `js/mailto-export.js`, déjà annoté ainsi).

### 13.4 Propriétés exportées mais jamais consommées hors de leur propre module

Même classe de problème que `getCurrentOptions`/`getCurrentMappings` déjà retirés le 2026-09-12 — liste
complète (vérifiée sur TOUS les modules cette fois, pas seulement `grist-api.js`) :
`EditorCore.hideFloatingContextToolbars`, `PdfExport.getNativePdfBlob`, `GristAPI.detectTableId`,
`GristAPI.getAttachmentDownloadUrl`, `HeaderFooterPreview.enterHeaderFooterMode`/
`.exitHeaderFooterMode`/`.renderHfPill`, `MainToolbar.applyToolbarIcons`/`.wireHeadingMenu`/
`.wireSelectionDependentSelects`/`.wireCompactFontSizeControls`, `PdfExportAlt.getQualityPreset`,
`VariableFormat.numberToWordsFr`/`.numberToWordsEn` — toutes ont un usage interne réel (pas du code
mort à proprement parler), seule leur présence dans l'API PUBLIQUE du module est superflue. Priorité :
Cosmétique.

**Cas particulier `Settings.getTriggerChar`** : jamais appelée nulle part (ni interne au-delà de peupler
son propre `<select>`, ni externe) — son commentaire documente que la clé `localStorage` est relue
directement ailleurs, mais cite `js/variables.js`/`js/editor.js` alors que **3 copies indépendantes** de
cette même lecture existent aujourd'hui (`js/editor-nodes.js:6-11`, `js/variables.js:6-11`,
`js/reader-mode.js:326-328`) — le commentaire est à corriger (3 sites, pas 2, et `editor.js` a bougé
vers `editor-nodes.js` depuis le découpage de §5.1). Priorité : Cosmétique, mais utile à corriger pour
la lisibilité.

### 13.5 Commentaires de référence croisée obsolètes (conséquence du découpage `editor.js`, §5.1)

Le découpage recommandé par l'audit du 2026-09-12 (`editor.js` 2480 → 383 lignes, réparti dans
`editor-nodes.js`/`floating-toolbars.js`/`header-footer-preview.js`/`main-toolbar.js`) a laissé
plusieurs commentaires ailleurs dans le dépôt (`css/editor-v2.css`, `css/toolbar-v2.css`, `js/i18n.js`,
`js/reader-mode.js`) pointant encore vers `js/editor.js` pour des fonctions qui ont déménagé — une
dizaine d'occurrences au total (détail dans le rapport source de cette passe, disponible sur demande).
Priorité : Cosmétique/Mineur — aucun impact d'exécution, mais coût réel de navigation pour un futur
relecteur (pertinent pour le critère "lisibilité sans IA" du guide Grist.Gouv, §8.2).

### 13.6 Rappel (déjà connu, non nouveau)

`Templates.TABLE_NAME` reste toujours recopié en dur à 2 endroits (`js/grist-api.js:7`,
`dev-tests/grist-stub.js:44`) au lieu d'être réutilisé — déjà signalé en §3.3, toujours pas corrigé au
2026-09-14, aucune régression, juste un rappel de non-traitement.
