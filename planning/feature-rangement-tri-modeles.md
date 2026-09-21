# Rangement et tri des modèles — cadrage

Demandé par Antoine le 2026-09-19 (fil « Rangement et tri des modèles ») : le document sera utilisé
par plusieurs utilisateurs, en plus du modèle par défaut existant (unique, document entier) il faut
que chaque utilisateur puisse définir les modèles qu'il veut voir en priorité dans le sélecteur, et
peut-être des dossiers. Consigne explicite : l'enjeu principal est l'UI/UX — travail dessus puis
maquettage, pas d'implémentation à ce stade.

## 1. État actuel (vérifié dans le code, pas de mémoire)

- Le sélecteur (`#template-select`, `index.html:86`) est un `<select>` natif, rempli par
  `refreshTemplateList()` (`js/main.js:77-90`) dans l'ordre renvoyé par `Templates.loadAll()`
  (`js/templates.js:154-189`), lui-même dans l'ordre des lignes de la table Grist
  `Publipostage_Modeles` — **aucun tri aujourd'hui** (ni alphabétique, ni par date). Sur un document à
  beaucoup de modèles, l'ordre est simplement celui de création.
- Il existe déjà un « modèle par défaut » (colonne `EstParDefaut`, bouton étoile
  `#btn-set-default-template`) : **un seul par document**, pas par utilisateur — c'est le modèle qui
  s'ouvre automatiquement au chargement du widget. Marqué dans le select par un « ★ » ajouté au texte
  de l'option (`js/main.js:87`). C'est probablement ce qu'Antoine appelle « le mode favori » dans sa
  demande — à ne pas confondre avec la priorité PAR UTILISATEUR demandée ici, qui est un concept
  différent et s'ajoute à celui-ci sans le remplacer.
- Le sélecteur vit dans `.title-cluster` (`index.html:85-90`, `css/toolbar-v2.css:9-14`) : bloc compact
  de 28px de haut, le `<select>` a un `max-width: 168px`. Ce bloc est dans `.bar-row`, la même rangée
  que la barre d'outils dense (~30 boutons icône, 5 rangées sous 420px) qu'Antoine a gelée — non
  retouchée sauf accord explicite (`planning/identite-ui-ux-grist-factory.md` §3, §5). Toute
  proposition qui ajoute un élément à cette rangée doit le signaler séparément, ce n'est pas neutre.
- Modèle proche déjà en place ailleurs dans l'UI : la modale « Créer à partir d'un template »
  (`#template-gallery-modal`, `index.html:311-319`) pour la galerie (modèles fournis avec le projet,
  pas ceux de l'utilisateur) — recherche texte + chips de tags actifs/inactifs + grille de cartes
  (`css/toolbar-v2.css:191-204`). C'est un patron déjà validé, réutilisable tel quel pour une interface
  de rangement des modèles de l'utilisateur (recherche + chips de dossiers + liste), plutôt que d'en
  inventer un nouveau (cf. charte, « en cas de doute, réutiliser un pattern déjà en place »).

## 2. Le point qui change tout : l'identification utilisateur est déjà possible

Le point bloquant supposé au départ — « on ne sait pas qui consulte le document, il n'y a pas de
présence temps réel » — est **déjà résolu ailleurs dans le code**, pas à réinventer :

- `GristAPI.getCurrentUserEmail()` (`js/grist-api.js:446-462`) existe et fonctionne : une table interne
  dédiée (`Publipostage_UserProbe`) porte une colonne formule déclenchée sur `user.Email` ; une ligne
  ajoutée puis relue puis supprimée donne le vrai email de la session Grist en cours (contournement du
  jeton d'accès, qui renvoie toujours une identité anonyme scopée document).
- **Déjà utilisé en production** par les commentaires (`js/comments.js:64`) pour attribuer un auteur, et
  par le mode lecture — avec repli anonyme silencieux si l'appel échoue (permissions, etc.), jamais
  d'erreur bloquante.
- Coût : un aller-retour Grist (AddRecord + lecture + RemoveRecord) la toute première fois par session,
  puis mis en cache (`_userEmailCache`) — le même profil de coût que les commentaires, déjà accepté.

Conséquence directe pour ce chantier : la priorisation par utilisateur peut être **réellement par
utilisateur** (stockée dans le document, suit la personne d'un poste à l'autre), pas seulement par
navigateur (comme le drapeau `pp_autosave_enabled` en `localStorage` aujourd'hui, qui ne suit pas la
personne). C'est strictement mieux que l'hypothèse de départ, avec un repli propre déjà éprouvé quand
l'identification échoue (cf. §5, question 1).

## 3. Modèle de données proposé (par défaut, pas une question ouverte)

Une nouvelle table interne, **`Publipostage_PreferencesModeles`** — pas une colonne JSON sur
`Publipostage_Modeles` :

| Colonne | Type | Rôle |
|---|---|---|
| `Utilisateur` | Text | Email (`getCurrentUserEmail()`), ou repli navigateur (§5 Q1) |
| `ModeleId` | Ref → `Publipostage_Modeles` (ou Int) | Le modèle concerné |
| `Epingle` | Bool | Priorité pour CET utilisateur |
| `Dossier` | Text | Nom du dossier pour CET utilisateur (vide = aucun) |

Une ligne par (utilisateur, modèle) qui a une préférence non par défaut — pas de ligne pour le cas
courant « rien de spécial ». Raison de ce choix plutôt qu'une colonne JSON sur `Publipostage_Modeles` :
la préférence est une relation (utilisateur × modèle), pas un attribut d'un seul modèle — exactement la
même forme que les commentaires, pour lesquels Antoine a déjà accepté une table interne dédiée
(`Publipostage_Commentaires`) plutôt qu'une colonne. Sa préférence « éviter de multiplier les tables »
vise les tables MÉTIER visibles par l'utilisateur, pas les tables internes techniques déjà nombreuses
(`Publipostage_LiensTables`, `Publipostage_UserProbe`, `Publipostage_Commentaires`) — cette nouvelle
table rejoint cette liste, ajoutée à `INTERNAL_TABLES` (`js/grist-api.js:7`) pour rester invisible.

Une seule table sert donc à la fois l'épinglage et les dossiers (pas deux mécanismes séparés) :
Antoine peut n'utiliser que l'épinglage sans jamais créer de dossier — comportement par défaut
strictement identique à aujourd'hui (non-régression, cf. §5 Q3).

## 4. Proposition UI/UX

### 4.1 Le sélecteur compact (`#template-select`) — inchangé dans sa forme

Reste un `<select>` natif au même gabarit (168px, 28px de haut) : zéro impact sur la rangée d'outils
déjà dense. Seul le CONTENU des options change, via des `<optgroup>` (natif HTML, pas de nouveau
composant) :

1. `-- Nouveau modèle --` (inchangé, en tête).
2. Si l'utilisateur a épinglé au moins un modèle : groupe non intitulé ou `Épinglés`, ses modèles
   épinglés, triés alphabétiquement.
3. Un `<optgroup>` par dossier que CET utilisateur a créé (ex. `Dossier : Factures`), modèles qu'il y a
   rangés, alphabétique.
4. Le reste des modèles (jamais épinglés ni classés par cet utilisateur) : liste plate, alphabétique —
   ce qui, en soi, corrige déjà l'absence de tri actuelle même pour qui n'utilise jamais la nouvelle
   fonctionnalité (non-régression comportementale : un utilisateur qui n'épingle rien et ne crée aucun
   dossier voit la même liste qu'aujourd'hui, seulement alphabétique au lieu de l'ordre de création).
5. Dernière option, toujours en fin de liste : `Organiser mes modèles…` — n'ouvre pas un modèle, ouvre
   la modale de rangement (§4.2). Pas de nouveau bouton dans la barre (cf. §5 Q2).

Le marqueur « ★ » du modèle par défaut du document reste tel quel et continue de s'appliquer
indépendamment de l'épinglage personnel (un modèle peut être à la fois LE modèle par défaut du
document et épinglé, ou ni l'un ni l'autre, ou l'un sans l'autre).

### 4.2 La modale « Organiser mes modèles »

Réutilise le patron déjà en place de `#template-gallery-modal` (recherche + chips + grille/liste,
`css/toolbar-v2.css:191-204`), avec les mêmes tokens visuels (surface, bordures, rayons, accent bleu
unique) :

- Barre de recherche texte (comme la galerie).
- Chips de dossiers (comme les tags de la galerie) : cliquer un chip filtre la liste à ce dossier ; un
  chip `+ Nouveau dossier` en ouvre la création (juste un nom).
- Liste de MES modèles (pas de vignette image comme la galerie — ceux-ci n'en ont pas) : chaque ligne
  porte le nom du modèle, une icône épingle (trait SVG monochrome, pas d'emoji — cf. charte §1) à
  bascule, et un sélecteur de dossier (menu déroulant : dossiers existants + « Aucun » + « Nouveau… »).
  Pas de glisser-déposer pour une v1 : le tri à l'intérieur d'un groupe reste alphabétique, plus simple
  et suffisant tant qu'Antoine n'en demande pas plus.
- Aucune notion d'auteur/permission sur les dossiers : ils sont strictement personnels, un autre
  utilisateur ne les voit jamais et peut créer un dossier de même nom sans collision (la ligne
  `Publipostage_PreferencesModeles` est propre à son email).

## 5. Questions ouvertes pour Antoine

Posées séparément via les cartes de décision dédiées (une par question) :

1. **Identification** : utiliser `getCurrentUserEmail()` (réel par utilisateur, suit la personne, coût
   d'un aller-retour Grist déjà accepté ailleurs) avec repli sur une clé `localStorage` (comme
   `pp_autosave_enabled`) si l'identification échoue — ou rester par navigateur uniquement (plus simple,
   jamais d'échec, mais un même utilisateur sur deux postes voit deux préférences différentes) ?
2. **Point d'entrée de la modale** : une option `Organiser mes modèles…` en fin de liste du sélecteur
   (aucun ajout à la barre d'outils gelée) — ou un petit bouton icône dédié à côté de l'étoile
   `#btn-set-default-template` (toujours visible, mais ajoute un élément à une rangée déjà dense et
   gelée) ?
3. **Périmètre de cette itération** : livrer épinglage ET dossiers ensemble (demande initiale complète,
   un seul mécanisme de données pour les deux, cf. §3) — ou épinglage seul d'abord (plus vite, dossiers
   réévalués ensuite si le besoin se confirme à l'usage), sachant que la demande d'Antoine était
   elle-même hésitante sur les dossiers (« peut-être même ») ?

## 6. Maquette

Maquette visuelle interactive (4 planches - sélecteur groupé, modale liste plate, et les deux pistes
arborescence du §7) :
https://claude.ai/artifact/8hX42DJG5gQoUS913Ps4eP

## 7. Comparaison avec une arborescence de fichiers classique

Demandé par Antoine le 2026-09-20 : comparer la proposition ci-dessus (liste plate + `<optgroup>`) à
une interface plus proche d'un explorateur de fichiers classique (dossiers imbriqués, dépliables). Deux
pistes conçues et évaluées indépendamment, planches 3 et 4 de la maquette.

### 7.1 Piste A — un vrai arbre, mais confiné à la modale (recommandée)

Le `<select>` de la barre d'outils ne change pas du tout (§4.1 inchangée). Seule la modale « Organiser
mes modèles » (§4.2) change : sa liste plate + `<select>` de dossier par ligne devient un arbre
dépliable/repliable, avec dossiers imbriqués (ex. `Factures > Clients A`), chevrons SVG trait, icônes
dossier/document. Détails :

- **Épinglés reste une section à part**, à plat, au-dessus de l'arbre — un modèle épinglé ET classé
  apparaît aux deux endroits (comme un signet dans un explorateur qui ne retire pas le fichier de son
  dossier), avec son chemin de dossier affiché en clair dans la section Épinglés pour ne pas perdre
  cette information.
- **Pas de glisser-déposer** : un bouton « Déplacer vers… » par modèle ouvre un petit menu listant les
  dossiers, cliquable. Raison : le glisser-déposer HTML5 n'a pas de support tactile natif (deuxième
  implémentation à écrire), et exclut le clavier sans un travail d'accessibilité équivalent — le bouton
  couvre le même besoin pour un coût de développement bien moindre.
- **Modèle de données** : la colonne `Dossier` (§3) reste un Texte, mais stocke un CHEMIN complet
  (`Factures/Clients A`) au lieu d'un simple nom — zéro changement de schéma par rapport à ce qui est
  déjà poussé sur `main`, seulement une convention de contenu différente. Renommer un dossier réécrit
  par lot les lignes dont le chemin commence par l'ancien préfixe (acceptable vu le volume attendu -
  une bibliothèque personnelle de modèles, pas des milliers de lignes).
- **Respecte intégralement** la barre d'outils gelée et la non-régression (rien ne change hors de la
  modale).
- **Coût** : nettement supérieur à la liste plate déjà rédigée (composant arbre à écrire à la main -
  patron ARIA Tree View documenté, mais aucune librairie prête à l'emploi compatible avec ce projet
  zéro-framework/zéro-build) — pour un bénéfice réel mais qui reste à démontrer vu le nombre de modèles
  probable par utilisateur (probablement quelques dizaines, pas des centaines).

### 7.2 Piste B — le sélecteur de la barre devient lui-même un arbre (écartée)

Piste plus radicale : remplacer le `<select>` natif de la barre d'outils par un bouton personnalisé qui
ouvre un panneau flottant contenant l'arbre, pour un rendu « explorateur de fichiers » visible en
permanence, pas seulement dans une modale de rangement.

- **C'est la plus fidèle visuellement** à la demande d'Antoine, mais c'est un changement de nature, pas
  un habillage : le `<select>` natif offre gratuitement le clavier (flèches, recherche par frappe), le
  picker natif mobile, et est lu par au moins 8 endroits de `js/main.js`
  (`onTemplateSelectChange`, `onNew`, `onNewEmail`, la restauration du modèle par défaut, le renommage
  qui réécrit `templateSelect.options[...].textContent`, etc.). Tout ça devrait être réécrit à la main
  (patron ARIA combobox+tree complet), avec un vrai risque de régression clavier/accessibilité/mobile,
  et un chantier de code de plusieurs centaines de lignes.
- Le déclencheur fermé pourrait garder le même gabarit (168×28px), mais remplacer le contrôle
  lui-même dans cette zone est, au sens où Antoine a gelé la barre d'outils, un changement qui appelle
  son accord explicite séparé — pas un simple ajustement visuel dans le gabarit existant.
- Même extension du modèle de données que la piste A (chemin ou nouvelle table pour l'imbrication).

### 7.3 Tableau comparatif

| Critère | Existant proposé (§4, `<optgroup>`) | Piste A — arbre dans la modale | Piste B — arbre dans la barre |
|---|---|---|---|
| Fidélité à « une arborescence classique » | Faible (liste à plat, `<optgroup>` jamais indenté) | Élevée, mais confinée à la modale | Maximale, visible à chaque usage |
| Barre d'outils gelée | Respectée | Respectée | Non respectée sans accord explicite |
| Non-régression | Totale | Totale | À risque (parité clavier/mobile à reconstruire) |
| Effort de dev (JS vanilla) | Minimal | Modéré à élevé | Élevé |
| Risque accessibilité/clavier | Nul (select natif intact) | Modéré, maîtrisable | Élevé |
| Dossiers imbriqués / glisser-déposer | Non (dossiers plats) | Oui (imbriqués), pas de glisser-déposer | Oui (imbriqués), idem |
| Simplicité pour l'utilisateur | Très simple, mais organisation limitée | Bonne, usage quotidien inchangé | Ambivalente (nouvelle habitude) |

### 7.4 Recommandation

Livrer d'abord l'existant (§4, déjà rédigé). Garder la Piste A comme évolution documentée, à
déclencher si l'usage réel démontre un besoin d'imbrication profonde — elle ne touche ni le sélecteur
ni la barre, donc son coût d'activation plus tard reste faible. Écarter la Piste B sauf accord explicite
et informé d'Antoine sur l'ampleur du chantier et sur la remise en cause de la barre gelée.

### 7.5 Point de calendrier (à connaître, pas un engagement de délai)

`index.html`, l'éditeur, la barre d'outils et la chaîne d'export sont actuellement le terrain d'un
autre chantier en cours d'implémentation (« Macro modèles »), avec un troisième chantier en attente sur
les mêmes fichiers. La Piste B, qui touche directement la zone du sélecteur dans la barre, est la plus
exposée à un chevauchement avec ce travail en cours ; la Piste A et l'existant, qui ne touchent que la
modale et `js/templates.js`/`js/main.js` en dehors de cette zone, y sont beaucoup moins exposés. Ce
n'est pas une raison de choix en soi, mais un facteur de risque/calendrier à connaître au moment de
trancher.

## 8. Décision d'Antoine et état d'avancement (2026-09-20)

Antoine a tranché en faveur de la **Piste B**, en connaissance du risque décrit en §7.5 : « la piste B
est très bien je te laisse l'implémenter proprement et rajouter tout les test necessaire pour éviter la
non regression ».

### 8.1 Conception retenue

Le `<select id="template-select">` réel reste l'unique source de vérité (`.value`/`.options`/
`.selectedIndex`/évènement `change`) : les ~8 points d'appel existants de `js/main.js` ne changent pas.
`js/template-tree-select.js` (nouveau, pas encore câblé) l'enveloppe visuellement :
- Le select réel passe en `display:none` permanent via une classe dédiée avec `!important`
  (`css/template-tree-select.css`), jamais via `hidden` seul — piège du 2026-09-19 (bandeau email resté
  affiché malgré `[hidden]`, une règle `display` plus spécifique l'ayant emporté) explicitement évité.
  Renforcé par `tabindex="-1"`/`aria-hidden="true"` en défense supplémentaire.
- Détection des écritures programmatiques de `.value` (nombreuses dans `js/main.js`, aucune ne
  déclenche `change`) par redéfinition de l'accesseur `value` sur cette seule instance de `<select>`.
- Reconstructions complètes du `<select>` (`refreshTemplateList()`) captées par un `MutationObserver`
  sur `childList`/`subtree`, distinct du point précédent.
- État désactivé du select réel reflété sur le déclencheur via le même observateur (`attributes:
  ['disabled']`) — prévu pour un futur verrouillage (mode macro, cf. `js/main-toolbar.js`), aucun
  verrouillage du select lui-même n'existe encore dans le code au 2026-09-20.
- Scope volontairement limité à parcourir/choisir/épingler depuis l'arbre. Assigner un dossier à un
  modèle reste à faire depuis la modale « Organiser mes modèles… » (§4, pas encore construite) plutôt
  que d'improviser un glisser-déposer non éprouvé dans l'arbre — à confirmer avec Antoine au câblage,
  ce n'est pas une limite qu'il a demandée.

Données par utilisateur (épingle + dossier) : table Grist dédiée `Publipostage_PreferencesModeles`
(`js/template-preferences.js`), pas une colonne sur `Publipostage_Modeles` — relation utilisateur ×
modèle, même principe que `Publipostage_Commentaires`. Décision communiquée à Antoine dans le fil
(2026-09-20), pas encore commentée par lui.

### 8.2 Fait au 2026-09-20/21

- `js/template-preferences.js` + `js/template-organizer.js` (logique pure de regroupement, gère les
  trois types `document`/`email`/`macro`) + `js/template-tree-select.js` + `css/template-tree-select.css`.
- Identification anonyme : repli sur `Utilisateur=''` plutôt qu'une erreur bloquante, même politique que
  `js/comments.js` (`Auteur=''`) — l'épingle/dossier posée sans identité résolue reste une préférence
  "anonyme" partagée, relisible dans une session anonyme suivante, plutôt que de perdre l'action. Corrigé
  suite à un vrai échec surpris par `dev-tests/scenarios-template-tree.js` (le harnais de test lui-même
  n'a aucune identité Grist résolue, cas réel que la première version (qui levait une erreur) ne gérait
  pas).
- Câblage dans `index.html` (CSS + 3 `<script>`, `?v=` incrémentés), `js/main.js` (attache
  `TemplateTreeSelect` juste après `refreshTemplateList()`, avant l'écriture du modèle par défaut sur
  `.value` — l'ordre compte, cf. commentaire dans le code), `js/i18n.js` (3 clés FR+EN) et
  `js/grist-api.js` (`Publipostage_PreferencesModeles` ajoutée à `INTERNAL_TABLES`, pour ne jamais
  apparaître comme table "métier" dans le sélecteur de tables liées).
- Tests unitaires sans navigateur : 35/35 passés (organizer 17 + preferences 18, dont migration depuis un
  document sans la table, idempotence, et le round-trip anonyme ci-dessus).
- Vraie suite Playwright `dev-tests/scenarios-template-tree.js` (groupe `templateTree` dans
  `run-headless.mjs`) : 9/9 passés, contre le vrai `_test-harness.html` (donc le vrai `js/main.js`, pas un
  stub) — les trois pièges (display calculé, hors ordre de tabulation, accesseur `value` intercepté sur
  une écriture réelle de `js/main.js`), les 3 types de modèle créés par le vrai flux UI, la persistance
  Grist réelle de l'épingle, l'étoile "modèle par défaut", et la navigation clavier (Échap).
- Suite complète du projet (tous groupes existants + le nouveau) rejouée : aucune régression.
- Limitation d'environnement rencontrée et documentée en mémoire d'équipe (pas propre à cette
  fonctionnalité) : les tests Playwright de ce fil de session ne pouvaient pas du tout démarrer
  (TipTap ne charge jamais depuis esm.sh) tant que `dev-tests/offline-deps.sh` n'avait pas été relancé
  pour reconstruire le miroir CDN local - déjà documenté comme le correctif attendu pour ce cas
  (`dev-tests/README.md`), maintenant fait pour cette session.

### 8.3 Reste à faire

- Confirmer avec Antoine, au moment où il verra le rendu réel, la limite de scope posée en 8.1 (pin/tri
  depuis l'arbre, dossier depuis la modale "Organiser mes modèles…" restant à construire).
- Vérification en conditions réelles (vrai document Grist, vraie identité utilisateur) : aucun fil n'a
  accès au document réel d'Antoine, donc ce point ne peut être confirmé que par lui.
