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

Maquette visuelle interactive (sélecteur avec groupes, modale « Organiser mes modèles ») :
https://claude.ai/artifact/8hX42DJG5gQoUS913Ps4eP
