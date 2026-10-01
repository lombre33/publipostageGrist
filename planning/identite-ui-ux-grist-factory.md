# Identité UI/UX — Grist Factory

> **À quoi sert ce document.** Décrire, avec des faits vérifiés dans le code (pas des intentions), les choix
> d'interface déjà faits par Antoine sur les widgets Grist Factory — ce qui est commun à tous les widgets et ce
> qui est propre à chacun — pour pouvoir être collé tel quel dans un autre chat/projet Claude et lui donner
> immédiatement le bon cadre : quelle identité respecter, quoi ne pas réinventer, quoi rester au milieu de la
> route en attendant un arbitrage d'Antoine. État au 2026-09-29 pour `publipostageGrist` (dépôt mature, revérifié dans le
> code après l'audit UX/UI du 29/09 et l'harmonisation des fenêtres) ; `SlidesPlus` (fondation, pas encore un éditeur
> utilisable) n'a pas été revu depuis le 2026-09-18.
>
> Ce fichier existe en deux copies identiques : `identite-ui-ux-grist-factory.md` dans les fichiers du projet, et
> `planning/identite-ui-ux-grist-factory.md` dans le dépôt `publipostageGrist` (branche `main`).

---

## 1. Identité commune « Grist Factory » (transposable à tout nouveau widget)

### Marque
- Éditeur affiché aux utilisateurs : **Grist Factory** — jamais le compte GitHub personnel `lombre33`, ni en
  crédits ni ailleurs dans l'UI.
- Site : **grist-factory.fr**.
- Licence : **GNU GPL v3.0**, lien vers le dépôt public sous l'organisation GitHub `grist-factory` (pas le dépôt
  de développement personnel — ex. `github.com/grist-factory/Publipostage-Plus`, distinct de
  `lombre33/publipostagegrist`).
- Un panneau « Crédits » (dans les Réglages) porte Auteur / Site / Licence / Bio. La Bio est encore un texte
  provisoire écrit par Claude sur Publipostage+ — **à reformuler par Antoine**, ne pas la dupliquer telle quelle
  sur un autre widget sans la lui faire valider.
- **Logo** : chaque widget affiche discrètement le logo Grist Factory (l'avatar du Grist éponyme) dans son
  chrome — placement de référence, choisi par Antoine sur Publipostage+ : en haut à droite, juste après l'icône
  Réglages (`#v2-brand-logo` : rond de 20 px, opacité .85, posé en absolu à 10 px du coin). Discret veut dire une
  taille de repère de marque, pas un élément qui capte l'attention ni qui déplace les contrôles existants autour de
  lui (non-régression, cf. §1 « Non-régression »). L'asset lui-même n'est pas vendorisable comme les autres
  dépendances (§1 « Pas de framework ») : c'est un fichier image à obtenir auprès d'Antoine (avatar du Grist « Grist
  Factory »), pas à recréer ou à deviner.

### Palette : neutre + un seul accent, pas de « monochrome » au sens gris-sur-gris
« Interface principalement monochrome » (règle d'Antoine) veut dire : une base de gris (fond/surface/bordure/texte
à plusieurs intensités) + **un seul bleu d'accent** pour les actions/états actifs, et rien d'autre sans raison
fonctionnelle. Deux couleurs sémantiques s'y ajoutent, jamais décoratives :
- **Rouge** — erreurs, actions destructrices (`--danger`).
- **Ambre** — attention/état en attente (conflit d'autosave sur Publipostage+, badge « connexion en cours » sur
  SlidesPlus) : la même intention existe déjà sur les deux widgets, avec des teintes proches mais pas encore
  unifiées en un token partagé — à harmoniser si un design system commun est créé.

Palette exacte de Publipostage+ (`css/style.css`, jetons de `:root`, thèmes clair et sombre) :

| Rôle | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond app | `--bg` | `#f4f6fa` | `#171b23` |
| Surface (cartes, barres, fenêtres) | `--surface` | `#ffffff` | `#1e2430` |
| Surface enfoncée | `--surface-sunken` | `#eef1f6` | `#262e3c` |
| Bordure / bordure forte | `--border` / `--border-strong` | `#dde2ea` / `#c3cad6` | `#323b4b` / `#465166` |
| Texte | `--text` | `#1b2430` | `#e7ecf5` |
| Texte atténué (un seul gris de texte, cf. « Contrastes ») | `--text-muted` = `--text-faint` | `#667085` | `#9aa6bb` |
| **Accent** (unique) : liens, états actifs, focus ; survol | `--accent`, `--accent-hover` | `#2f6fed`, `#2558c4` | `#5b91f5`, `#74a3f7` |
| Accent plein (fond d'un bouton à texte blanc) ; survol | `--accent-solid`, `--accent-solid-hover` | `#2f6fed`, `#2558c4` | identiques au clair |
| Accent doux : fond, bord | `--accent-soft`, `--accent-soft-border` | `#e8f0fe`, `#c7dbfd` | `#24324b`, `#35507d` |
| Danger ; fond doux | `--danger`, `--danger-soft` | `#d84343`, `#fbe9e9` | `#f08a8a`, `#3a2426` |
| Voile derrière les fenêtres | `--pp-scrim` | `rgba(15, 23, 42, .45)` | `rgba(3, 6, 12, .62)` |
| Rayon d'angle | `--radius-sm` | 7 px sur les contrôles (boutons, champs, lignes de liste), 8 px sur le cadre des fenêtres, rond pour les pastilles et le logo : coins arrondis partout, jamais carrés | idem |
| Ombres | `--shadow-float`, `--shadow-card` | portée douce pour les éléments flottants et les fenêtres, très légère pour les cartes | plus marquée |

Ne pas ajouter une couleur qui n'a pas de rôle sémantique clair (pas de couleur « parce que c'est joli »).

### Contrastes : 4,5:1 au moins, en clair comme en sombre
Arbitré le 29/09 après l'audit (en ligne `c428609`) : tout texte, lien, bouton plein et anneau de focus atteint **4,5:1**
au moins dans les deux thèmes (avant : texte discret à 2,58:1 en clair, liens des Crédits à 1,65:1 en sombre, blanc des
boutons pleins à 3,08:1 en sombre). Règles à suivre :
- Le gris de texte le plus pâle admis est `--text-faint` (= `--text-muted`) ; jamais un gris plus clair pour un texte.
- Un **bouton plein à texte blanc prend `--accent-solid`** (et `--accent-solid-hover`), jamais `--accent` : celui-ci
  s'éclaircit en sombre et le blanc dessus tomberait à 3,08:1.
- Liens et texte d'accent : `--accent`. Anneau de focus : `outline: 2px solid var(--accent)`. Texte d'aide des champs
  (`::placeholder`) : `--text-muted` en sombre.
- Une règle neuve qui pose une couleur de texte, de fond de bouton ou de focus prend ces jetons. Le groupe de tests
  `contrast` mesure la couleur calculée sur l'élément réel, fond composé, en clair puis en sombre ; un nouveau bouton
  plein s'ajoute à sa liste.

### Deux polices, jamais mélangées : chrome vs contenu produit
Un principe distinctif, présent dès l'origine sur Publipostage+ et à reproduire sur tout widget qui génère un
contenu exportable :
- **Police de chrome** (barres d'outils, boutons, libellés, tout ce qui n'est pas le document produit) :
  **Manrope** (poids 500/600/700/800), géométrique et moderne.
- **Police du contenu produit** : celle qui part réellement à l'export. Sur Publipostage+, c'est **Roboto**,
  auto-hébergée (`css/roboto-fonts.css`) en regular/italique/gras/gras-italique — délibérément les MÊMES fichiers
  que ceux embarqués dans le PDF par `pdfmake`, pour que la pagination affichée à l'écran soit identique à celle
  du PDF. Ne jamais laisser la police du contenu dériver de celle réellement exportée.
- Base non stylée (avant les tokens) : `Arial, sans-serif` — n'apparaît jamais telle quelle une fois l'app chargée.

### Thème sombre : uniquement le chrome, jamais le contenu produit
Règle stricte, documentée en commentaire dans le CSS de Publipostage+ : le thème sombre change la couleur de la
barre du haut, du plan de travail, des modales et des panneaux flottants — **jamais** la page/le document
lui-même, qui reste blanc avec son texte sombre dans les deux thèmes. Raison : ces couleurs sont celles qui
partent réellement au PDF/DOCX ; les inverser ferait mentir l'aperçu sur ce qui sera produit. Ce principe
s'applique à tout widget qui prévisualise un contenu destiné à l'export (donc potentiellement aussi la diapositive
de SlidesPlus une fois son éditeur construit).

Mécanique : 3 choix utilisateur (système / clair / sombre), mémorisés en `localStorage`, appliqués via l'attribut
`data-theme` sur `<html>` ; la préférence système (`prefers-color-scheme`) ne joue que si l'utilisateur n'a rien
choisi explicitement. Le voile derrière les fenêtres suit lui aussi le thème (`--pp-scrim`, plus foncé en sombre) : il
n'y a plus de voile clair fixe.

### Icônes : traits monochromes, jamais de police d'icônes ni d'emoji
Toutes les icônes de Publipostage+ sont des SVG en **contour** (`stroke`, pas de remplissage), intégrées en
`mask-image` CSS plutôt qu'en `<img>` : l'icône hérite alors de la couleur du bouton (texte/accent selon l'état),
donc elle s'adapte automatiquement au thème clair/sombre et à l'état survolé/actif sans doublon d'asset. Pas de
police d'icônes (Font Awesome, etc.), pas d'emoji dans le chrome de l'app (SlidesPlus utilise encore un emoji
`⛶` sur son unique bouton — état de fondation, cf. §4).

Deux règles d'Antoine s'y ajoutent :
- **Une icône = une fonction.** La punaise veut dire « favori » (section « Épinglés » de la liste des modèles) et rien
  d'autre, l'étoile « modèle par défaut » : on ne réutilise jamais un tracé pour une seconde fonction (Antoine les
  confondait quand elles partageaient le même dessin, 29/09).
- **Aucun indice décoratif sous un bouton à menu.** Les petites puces bleues qui signalaient un menu au survol ont été
  retirées à sa demande (29/09) ; le menu s'annonce à l'accessibilité par `aria-haspopup` / `aria-expanded`. Ne pas
  remettre d'indice visuel sans lui demander.

### Un seul éditeur, une seule barre d'outils, partagés par tous les modes
Publipostage+ a un seul composant d'édition et une seule barre d'outils (`#v2-toolbar`) pour tous ses modes
(Édition, Lecture et Email) : `switchMode()` (`js/main.js`) ne masque que la zone
éditeur/lecteur, jamais la barre d'outils elle-même. Un bouton sans effet dans un mode donné est **grisé**
(classe `v2-hf-locked`), jamais masqué ni dupliqué dans un composant séparé. Toute nouvelle fonctionnalité de
toolbar transposable à plusieurs modes (ex. bouton `#Variable`) est un composant partagé unique, pas une copie
par mode. Ce principe — pas de duplication de code d'UI entre modes/contextes d'un même widget — est une règle
explicite d'Antoine, pas seulement une observation.

### Non-régression stricte de l'UI existante
Règle d'Antoine valable sur tous les widgets : **on ajoute des éléments d'UI, on ne modifie ni ne supprime ceux
qui existent déjà** sans son accord explicite. Une barre d'outils jugée dense ou perfectible (cf. Publipostage+,
§3) reste telle quelle tant qu'il n'a pas validé un changement — la réponse à une UI qu'on n'ose pas retoucher
n'est jamais de la retoucher quand même, c'est de proposer sans y toucher. Deux précisions :
- Une fonction indisponible dans un contexte est **grisée, jamais masquée** : mode Lecture (la barre de mise en forme
  est grisée), mode Email, droits par personne (opacité .35, plus de clic), export en cours.
- Un défaut qui revient se corrige **une fois pour toutes**, à sa cause commune, pas fenêtre par fenêtre ni menu par
  menu : c'est ce qui a donné la base commune des fenêtres et le pont de survol des menus (§3).

### Bilingue fr/en systématique
Chaque chaîne d'interface visible passe par un attribut `data-i18n` (ex. `data-i18n="settings.credits.author"`)
résolu par un module i18n dédié (`js/i18n.js` sur Publipostage+, clé `fr`/`en` en miroir). Toute chaîne d'UI
ajoutée ou modifiée doit avoir sa traduction anglaise dans le **même lot** — jamais en suivi séparé.

### Vocabulaire et écriture des textes
Arbitré le 29/09 (« Oui, partout », en ligne `fc44fb1`) après un relevé de neuf textes « template », treize pluriels
entre parenthèses et trois écritures du vide :
- Le mot est **« modèle »**, jamais « template » dans un texte français (fichiers et identifiants peuvent garder
  `template`) ; on écrit « Macro-modèle », avec majuscule et trait d'union.
- **Pas de pluriel entre parenthèses** (« 1 ligne(s) trouvée(s) ») : les pluriels s'écrivent `{n|singulier|pluriel}` dans
  `js/i18n.js` (« {count} {count|ligne trouvée|lignes trouvées} » ; en français 0 et 1 sont au singulier, en anglais
  seul 1).
- **Le vide d'une liste** s'écrit « — Choisir … — » (tirets longs) ; « — Aucune — » seulement quand « aucun » est un
  vrai choix.
- Le groupe de tests `codeHygiene` refuse « ligne(s) », « template » en français et « -- … -- ».
- Une indication ou un avertissement sous un champ commence **sous ce champ**, pas sous son libellé.

### Fenêtres : une seule base pour toutes
Arbitré le 29/09 (« Les dix », en ligne `5fd9409` puis `b78d24f`). Toutes les fenêtres du widget — celles écrites dans
`index.html` (Réglages, Tables liées, Clé de correspondance, Macro-modèle, Organiser mes modèles, Galerie, Aperçu),
celles des variables (Condition, Autres attributs, Boucle) et les saisies/confirmations — reposent sur
`js/modal-base.js` et `css/modal-base.css`. Avant : des largeurs de 380 à 960 px sans règle, un voile clair fixe même en
sombre pour six d'entre elles, un titre qui sortait de l'écran, un clavier qui s'échappait de la fenêtre.
- **Trois zones** : le titre (fixe), le contenu (la seule zone qui défile), les boutons (fixes : « Fermer », « Annuler »…).
  La fenêtre tient dans le panneau de 700×400 : le cadre est plafonné à la hauteur du panneau moins 12 px de chaque côté,
  titre et boutons restent visibles. Le cadre porte `role="dialog"`, `aria-modal="true"` et `aria-labelledby`.
- **Trois largeurs** : 400 px (question, tables liées, clé de correspondance, saisies), 480 px (formulaires : Réglages,
  Macro-modèle, Organiser, fenêtres de variable), grande (Galerie, Aperçu : 960 px plafonnés au panneau). Une nouvelle
  fenêtre choisit l'une des trois.
- **Voile** : `--pp-scrim`, qui suit le thème. Un clic sur le voile ne ferme rien.
- **Clavier**, tenu par une seule écoute pour la fenêtre du dessus : le focus entre dans la fenêtre à l'ouverture et
  revient à l'élément qui l'avait à la fermeture ; Tab et Maj+Tab tournent dans la fenêtre, même quand le focus est tombé
  sur `<body>` ; Échap la ferme (une liste avec recherche ouverte ferme d'abord son propre panneau). Pour une fenêtre
  écrite dans `index.html`, Échap déclenche son bouton de fermeture : même sortie qu'à la souris.
- **Empilement** : 1990 pour les fenêtres de variable, 2000 pour celles d'`index.html`, 2050 pour la clé de
  correspondance (elle s'ouvre par-dessus la fenêtre de condition comme par-dessus un macro-modèle, écrit après elle dans
  `index.html`), 2100 pour les saisies et confirmations, qui s'ouvrent par-dessus toutes les autres.
- **Une nouvelle fenêtre** passe par `ModalBase.create({...})` (bâtie en JS) ou `ModalBase.adopt(id, {closeId})` (déjà
  dans `index.html`, branchée dans `wirePageModals` de `js/main.js`) ; jamais d'écouteur Tab ou Échap posé sur le voile.
  Le réglage propre à la zone de contenu d'une fenêtre s'écrit avec deux classes (`.sa-fenetre .sa-liste`), sinon la
  règle de la base l'emporte.

### Saisies et confirmations : des fenêtres du widget, plus de boîtes du navigateur
Arbitré le 29/09 (« Saisies et confirmations », en ligne `aafa4e0`).
- `Dialogs.prompt({title, label, message, value, confirmLabel})` (`js/dialogs.js`) rend le texte tapé, `null` si annulé,
  `''` si le champ est vidé puis validé (« aucun dossier » n'est pas « annulé ») ; `Dialogs.confirm({title, message,
  confirmLabel, danger})` rend un booléen. Toujours avec `await` : oublier `await` prend une promesse pour un « oui »
  (le groupe `codeHygiene` le vérifie et refuse tout `prompt()` / `confirm()` natif dans `js/`).
- Le titre est la question ; les boutons sont « Annuler » puis l'action nommée (« Créer », « Supprimer », « Continuer »…).
  Une confirmation **destructrice** (`danger`) met le focus sur Annuler, pour qu'un Entrée distrait ne supprime rien.
- Une seule fenêtre à la fois : une demande qui en interrompt une l'annule.
- Après Annuler ou Échap, le clavier revient sur le bouton qui a ouvert la fenêtre, **même si ce bouton était grisé par
  le verrou d'export** (« Créer l'email » et « Email trop long » ; de même à la fin d'un export lancé au clavier) — choix
  d'Antoine « Corriger », en ligne `7fa43b0`. À la souris, rien ne change.
- Les `alert()` d'information restent des alertes du navigateur (choix d'Antoine).

### Choisir une colonne, une table ou un modèle : la liste avec recherche
Demande d'Antoine (29/09). Tout choix de colonne, de table ou de modèle passe par la liste avec recherche
(`js/search-select.js` : `attachColumns`, `attachTables`, `attachTemplates`), jamais par un `<select>` natif visible. Le
`<select>` reste la source de vérité, masqué ; une colonne s'affiche avec son type ; la valeur vide est grisée ; si le
composant échoue, la liste native reste (`try/catch`). Le champ **Valeur** d'une règle sur une colonne à choix ou à
référence (`attachValues`) est lui aussi une liste avec recherche des valeurs possibles, « Autre valeur… » toujours en
bas. Sur une colonne **Oui / Non** (case à cocher), c'est la liste « Oui » / « Non » (« Yes » / « No » en anglais), sans
« Autre valeur… » ni saisie libre (demande d'Antoine du 01/10 : limiter les entrées à la main, source d'erreurs) : ce sont
les mots que la comparaison lit ; une valeur déjà enregistrée dans une autre graphie (« vrai », « 1 ») s'affiche
« Oui » / « Non », une valeur que la comparaison ne lit pas reste visible avec « valeur non reconnue » jusqu'à ce qu'on
choisisse. La colonne d'une règle de **macro-modèle** et celle de la **condition d'une bulle** (demande d'Antoine du 01/10, puis
son choix « À plat » du même jour pour la condition) sont UNE seule liste qui réunit celles de toutes les tables, sans
intitulé : celles de la page en nom nu, les autres en « Table.Colonne », retrouvées par leur nom ; une table pas encore
liée ouvre la clé de correspondance par-dessus (Annuler remet la colonne précédente), et le lien d'une table liée se lit
sous la règle une fois la colonne choisie ; « Autre (colonne d'une autre table…) » reste en bas.

### Le panneau de référence : 700×400
Antoine utilise Publipostage+ dans un panneau Grist d'environ **700×400 px** : tout doit y tenir et s'y manier à la souris.
- Un popup (autocomplétion `#`, fil de commentaires, image depuis une variable) se place **après** son affichage, d'après
  sa vraie hauteur (`ViewportFit.placePopup` : dessous, sinon au-dessus, avec défilement si rien ne suffit) ; les
  info-bulles se décalent pour rester dans le panneau.
- Un texte trop long pour sa case ne déborde pas, n'est pas coupé net et ne passe pas à la ligne : il est tronqué par
  « … ». Pour une bulle de variable dans une case étroite ou une colonne de zone à 2 colonnes, c'est le **milieu** du nom
  qui est coupé, début et fin gardés (« #Projets.Det…Fonctionnement »). Le message d'état de la barre du haut est coupé
  de la même façon, son texte entier au survol.
- Tout changement d'interface est vérifié à ce format, **à la vraie souris et au vrai clavier** (Tab, Échap), en clair et
  en sombre, en français et en anglais.

### La langue de ce que le widget écrit dans le document
Arbitré le 29/09 (en ligne `87a2a63`). Ce que le widget écrit lui-même dans le document — le message d'une variable qui ne
se résout pas (« [ERREUR : … ] »), le titre du sommaire — suit la **langue de l'interface** de qui lit ou exporte, en
Lecture comme en PDF et en Word (clés `variables.error.*` et `pdf.tocTitle` de `js/i18n.js`).

### Pas de framework, pas d'étape de build, dépendances tierces encadrées
Les deux widgets sont des pages statiques (HTML/CSS/JS vanilla, pas de React/Vue, pas de bundler) servies telles
quelles — contrainte du modèle de distribution des widgets personnalisés Grist (GitHub Pages). Sur les
dépendances tierces, les deux widgets divergent sciemment (voir §3/§4) : c'est un point à trancher au cas par cas
pour un nouveau widget, pas une règle unique.

---

## 2. Où vit quoi (pour ne pas confondre les deux dépôts)

| | `publipostageGrist` | `SlidesPlus` |
|---|---|---|
| Rôle | Édition et publipostage de documents texte riches (contrats, factures, courriers) | Édition de présentations façon diaporama, avec publipostage par diapositive/table |
| État | Mature, en développement actif de fonctionnalités | Fondation seulement — **pas encore un éditeur utilisable** |
| Moteur d'édition | TipTap/ProseMirror, chargé depuis un CDN (esm.sh) via import map ESM | Fabric.js 7.4.0, **vendorisé** (fichier committé, servi same-origin) |
| Dépendances tierces | Chargées depuis CDN — SRI structurellement impossible en ESM ; vendorisation écartée pour l'instant (décision d'Antoine, 2026-09-18) | Vendorisation systématique de toute dépendance tierce (sauf le SDK Grist lui-même) — voir `DEPENDENCIES.md` |
| Module partagé | `shared/` (accès API Grist, résolution de variables cross-table) — en cours de factorisation avec SlidesPlus, dépôt séparé prévu mais pas encore créé | Consomme le même `shared/` |
| Accès Grist demandé | `full` | `full` (même raison : variables/tables croisées) |

Les deux widgets partagent délibérément le même moteur de résolution de variables et les mêmes enseignements de
sécurité (`AUDIT_CODE.md` de `publipostageGrist` sert de référence à `SlidesPlus`) — une cohérence technique qui
va dans le même sens que la cohérence visuelle demandée par Antoine.

---

## 3. Spécifique à Publipostage+

- Barre d'outils V2 (`#v2-toolbar` + `.bar-row`) : une quarantaine de boutons, presque tous en icône seule sans libellé
  texte (45 dont 8 avec texte, selon l'audit du 29/09), sur **deux lignes à 700×400** (38 % de la hauteur du panneau) et
  jusqu'à **5 rangées** en dessous de 420 px de large, avec sous-menus révélés au survol. Constat de densité admis par
  Antoine mais **chantier gelé** — c'est ce qui a fait préférer un ajustement automatique de la mise en page à un
  contrôle de zoom manuel. Ne rien ajouter dans cette barre sans son accord. Faciliter la prise en main d'un nouvel
  utilisateur (lien vers la galerie dans le document vide, libellés sur la barre d'une variable) lui a été proposé le
  29/09 : il a répondu **« Laisser »**, ne pas le reproposer.
- Menus au survol (`.v2-hover-group` / `.v2-hover-flyout`) : un menu ne se referme pas quand la souris descend lentement
  du bouton vers lui — le pont de survol est porté par le groupe (`--v2-flyout-gap`) ; donc ni `overflow: hidden` ni
  marge entre le bouton et son menu, et tout nouveau menu passe par ces deux classes. Un groupe de boutons à coins
  arrondis n'a pas non plus d'`overflow: hidden` (il rognerait leurs info-bulles) : les coins sont portés par les
  boutons d'extrémité. Après un clic à la souris, l'info-bulle de focus d'un bouton reste cachée (`pp-tip-pointer`)
  jusqu'au prochain appui sur Tab ; celle du survol reste.
  Le bouton principal d'un de ces menus (« + », « Enregistrer », « Qualité PDF », « Titre »…) ne prend pas le focus à la souris : le
  curseur reste dans le texte et le menu se referme quand la souris part (retour d'Antoine du 01/10 : « + » et « Qualité PDF » restaient
  ouverts) ; la règle est commune (`editor-core.js`), un menu neuf n'a rien à coder ; au clavier, Tab ouvre toujours le menu.
- Liens et blocs de contenu (demande d'Antoine du 01/10, « une seule icône pour tout ça ») : une seule icône de la barre
  (la chaîne, à la place de l'ancienne icône Citation) ouvre au survol un menu à lignes — « Lien… » (le raccourci Ctrl+K
  est écrit sur la ligne), « Citation », « Bloc de code », « Encadré… » et « Bloc de signature » (titre du volet « Lien et
  blocs de contenu ») ; les blocs suivants s'y ajoutent comme lignes, jamais comme nouvelles icônes. Une ligne qui n'a pas
  de sens à cet endroit est grisée, jamais masquée : « Lien… » dans un bloc de code, « Bloc de code » quand il effacerait
  une bulle `#Variable` ou une image, « Encadré… » et « Bloc de signature » en mode Email et dans un en-tête ou un pied de
  page, tout le menu en mode macro et en Lecture. Fenêtre du lien (base commune des fenêtres) : « Adresse du lien » (http, https, mailto, tel ; sans
  protocole, `https://` est ajouté, une adresse e-mail devient `mailto:`, un numéro `tel:` ; `javascript:` et le reste sont
  refusés), « Texte à afficher » seulement quand rien n'est sélectionné, « Retirer le lien » seulement sur un lien
  existant (bouton cerclé de rouge, texte `--text` : `--danger` seul ne fait que 4,37:1 sur le fond de la fenêtre) ;
  l'erreur s'affiche sous le champ (barre rouge à gauche, texte normal) ; Ctrl+K ouvre la fenêtre, y compris au clavier
  seul, Entrée valide, Échap annule et rend le clavier à l'éditeur. Dans l'éditeur, un clic simple sur un lien place le
  curseur et n'ouvre rien ; Ctrl/⌘+clic l'ouvre dans un nouvel onglet ; le survol affiche l'adresse et « Ctrl+clic pour
  ouvrir » dans une info-bulle. Un lien est bleu `#0563C1` souligné (papier blanc : 5,9:1, comme dans Word), cliquable en
  Lecture, en PDF et en Word, écrit « texte (adresse) » dans un e-mail. Un bloc de code est en chasse fixe (Cousine ; Courier
  New en Word) sur fond gris, sans variables, et un PDF ne le coupe qu'entre deux lignes.
  Encadré (réponse d'Antoine du 01/10 : « encadré Note, Attention ou Important, couleur et icône au choix ») : « Encadré… »
  ouvre une fenêtre de la base commune, qui tient dans 700×400 sans défiler — Type (« Note » bleu, « Attention » orange,
  « Important » rouge : un point de départ qui pose couleur et icône ensemble), Couleur (six ronds : bleu, vert, orange,
  rouge, violet, gris), Icône (information, triangle, point d'exclamation, coche, ampoule, étoile) et un aperçu sur une
  feuille blanche (le papier reste blanc en sombre). Les flèches et Début/Fin changent le choix, un seul arrêt de Tab par
  groupe, Entrée valide, Échap annule. Dans un encadré la ligne devient « Modifier l'encadré… » et la même fenêtre offre
  « Retirer l'encadré » (même bouton cerclé de rouge que « Retirer le lien »). L'encadré est un fond teinté, une barre de
  4 px de la couleur d'accent à gauche et l'icône dans la marge, le texte garde la couleur du document ; palette unique
  (`js/callout.js`) lue par l'éditeur, la Lecture, le PDF et le Word, texte ≥ 4,5:1 sur les six teintes, barre et icône
  ≥ 3:1. Pas de titre écrit tout seul ; seuls la couleur et l'icône sont gardées (le type n'est pas stocké). Entrée deux
  fois en sort, comme d'une citation ; sur un élément de liste, l'encadré prend la liste entière. En e-mail (texte brut) il
  s'écrit sans fond ni mot ajouté. Bloc de signature : une zone 2 colonnes toute faite (trois lignes vides pour signer, une
  ligne de tirets bas, puis « Nom et signature » à gauche et « Date » à droite) posée sous le bloc du curseur, jamais dedans ;
  c'est du texte ordinaire, qu'on modifie (une variable à la place du nom, une autre légende).
- Modes et droits : Édition, Lecture et Email partagent la même barre. En Lecture la barre de mise en forme est grisée
  (`applyFormattingBarLock`) ; les droits par personne (Réglages > Accès : lecture seule, export, commentaires) grisent
  aussi (`pp-access-locked`), sans jamais masquer. Commenter reste actif en Lecture et agit sur le texte sélectionné dans la
  Lecture, qui surligne alors les passages commentés (choix d'Antoine du 30/09) ; sans le droit de commenter, la Lecture
  reste sans commentaires, comme l'export.
- Sélecteur de modèle en arbre (dossiers) : le `<select>` natif reste en place, masqué, source de la valeur. Punaise =
  favori personnel, étoile = modèle par défaut (jamais un modèle Email) ; chaque dossier s'ouvre replié ou déplié selon le
  choix de l'utilisateur ; la fenêtre « Organiser mes modèles » range (dossiers, glisser-déposer, « Déplacer vers… »).
  La liste reste sobre (retours d'Antoine du 01/10) : même corps que les menus de la barre (12,5 px), noms en graisse
  normale, dossiers en demi-gras ; « Organiser » est un petit bouton dans l'en-tête fixe de la liste, en haut à droite, et
  non dans la barre ; pas de ligne « Nouveau modèle » dans la liste (le bouton « + » crée un modèle) ; renommer un modèle
  remplace son nom, sur place, par un champ de même largeur (pas de champ à côté de la liste).
- Bouton Enregistrer (retours d'Antoine du 01/10) : un clic enregistre. Son menu, ouvert au survol comme celui de « + » ou d'« Exporter », propose « Enregistrer sous… »
  (une copie) et la ligne cochée « Enregistrement automatique » (activé par défaut, choix gardé par navigateur) ; la barre n'a plus ni bouton « Enregistrer sous » ni bascule
  d'enregistrement automatique. À la souris, le bouton et ses lignes ne prennent pas le focus : le curseur reste dans le texte et le menu ne reste pas ouvert une fois la souris
  partie ; au clavier, Tab descend dans le menu. Réactiver l'enregistrement automatique n'efface pas ce qui a été tapé pendant la coupure.
  Enregistrement automatique coupé : le coin d'état dit « Modifications non enregistrées. » (texte normal, pas rouge) dès qu'une modification attend,
  jusqu'au prochain enregistrement ; allumé, le coin reste vide pendant la frappe, l'enregistrement part tout seul.
- Variables : cliquer une variable ouvre sa barre flottante (Condition, Autres attributs, Boucle, réglages nombre/date) ;
  en édition, une bulle à condition est en pointillés ; les fenêtres correspondantes reposent sur la base commune. Dans
  une règle, « = » sur une colonne à choix multiples ou une liste de références veut dire « contient ce choix » (arbitré
  le 29/09).
- Autres attributs : « Insérer » ajoute les attributs cochés juste après la bulle ; « Remplacer » (demande d'Antoine du
  01/10, entre « Annuler » et « Insérer », qui reste le bouton bleu) les met à sa place. C'est la même bulle dont la
  colonne change : son gras, sa couleur, sa boucle, sa condition (sauf case « Reprendre la condition d'affichage »
  décochée) et son format quand la nouvelle colonne est du même genre (nombre ou date) restent ; un seul Annuler la
  rend. Avec plusieurs attributs cochés, le premier prend la place de la bulle et les autres suivent, séparés par une
  espace. Grisé tant que rien n'est coché, comme « Insérer ».
- Écriture d'un nombre : tant qu'aucun réglage n'est posé, la barre d'une bulle nombre montre FR allumé (US en interface
  anglaise) et le document écrit déjà ainsi — espace insécable entre les milliers, virgule (choix d'Antoine du 01/10) ;
  ce que la barre annonce est ce qui s'applique, sans avoir à recliquer. « — » écrit sans séparateur de milliers. Les
  champs texte (Objet, À, Cc, Cci, nom du PDF) gardent le nombre tel que Grist le stocke.
- Zéro d'un nombre : par défaut, un vrai zéro d'une colonne Numérique ou Entier ne s'écrit pas en Lecture, en PDF ni en
  Word (choix d'Antoine du 01/10, modèles déjà enregistrés compris) ; la barre de la bulle a un seul bouton en bascule,
  icône « 0 » qui devient « Ø » (barré) quand le zéro est masqué : enfoncé = masqué, relâché = « 0 » écrit. Une icône,
  une fonction : pas de menu. Les champs texte et la liste des attributs gardent le 0.
- Barres flottantes d'une bulle, d'un tableau ou d'une image : ancrées dans l'éditeur, aucune n'est ouverte quand il est
  masqué (Lecture, résumé d'un macro-modèle), qu'on y passe à la souris ou au clavier (choix « Corriger » d'Antoine,
  01/10) ; elles ne recouvrent jamais la barre du haut. Un clic hors de l'éditeur et hors de la barre ferme celle d'une
  bulle, d'un tableau ou d'une image (choix « Corriger » d'Antoine, 01/10) ; un clic sur l'objet la rouvre.
- Modèles de démonstration/test tenus hors de la galerie publique : dossier `templates-gallery-dev/` avec son propre
  manifeste, lu seulement avec `?dev` dans l'adresse du widget — le dépôt public (`grist-factory/Publipostage-Plus`) ne le
  publie pas.
- Mode Email (livré le 2026-09-18) : règle tranchée — **strictement l'UI existante**, aucun nouveau composant visuel ;
  en cas de doute, réutiliser un pattern déjà en place plutôt que d'en inventer un. Objet / À / Cc / Cci sont de simples
  champs texte ; « Créer l'email » ouvre le logiciel de messagerie (`mailto:`) et la fenêtre « Email trop long »
  avertit au-delà de ~2000 caractères sans bloquer ; ce qui n'a pas de sens en Email (en-tête et pied de page, modèle par
  défaut) est grisé, pas masqué.
- Grille (mode tableau, demande d'Antoine du 01/10) : « + » puis « Nouvelle grille » crée un modèle de type `grille` — un seul tableau
  (15 lignes × 6 colonnes de 100 × 28 px au départ), sans feuille A4 ni en-tête ni pied, qui part du coin du plan de travail et défile
  dans le panneau, entouré de ses bandeaux A, B, C et 1, 2, 3 (gris du chrome, texte ≥ 4,5:1, collés au défilement). On tire le trait entre
  deux lettres pour régler la largeur de la colonne de gauche, entre deux numéros la hauteur de la ligne du dessus : aperçu en direct, taille
  affichée près du pointeur, une seule transaction (un seul Annuler), Échap annule ; une colonne ne passe pas sous 24 px, une ligne ne passe
  pas sous la hauteur de son texte. Un clic sur une lettre, un numéro ou le coin sélectionne la colonne, la ligne ou toute la grille ;
  Ctrl+A prend les cases, Suppr les vide, les flèches et Tab ne sortent jamais du tableau. Ce qui n'a pas de sens dans un tableau unique est
  grisé, jamais retiré : Tableau, Deux colonnes, Sommaire, Saut de page (le temps que la grille ait le sien), Citation, Bloc de code, Encadré, Bloc de signature, les trois
  boutons du suivi des modifications et l'aperçu A4 ; « Lien », la mise en forme, l'image, les variables et Annuler restent actifs. Le
  garde-fou de l'éditeur tient aussi pour le clavier et le collage : la grille reste UN tableau — ni second tableau, ni deux colonnes, ni
  sommaire, ni citation, ni encadré, ni bloc de code, ni image en calque, et on ne supprime ni le tableau, ni sa dernière ligne ou colonne.
  Le texte d'une case est au milieu de sa hauteur (alignement vertical enregistré case par case avec le modèle ; haut et bas viendront avec la
  barre de la case), à l'identique dans l'éditeur, en Lecture et dans le PDF : une ligne plus haute que son texte reste haute, une grille
  large garde ses colonnes et défile à l'horizontale en Lecture au lieu d'être écrasée, aucune ligne vide ne la suit, et dans le PDF une
  grille plus large que la page est ramenée à sa largeur. La barre
  flottante de la case se pose sur la case courante (cadre plein, couleur d'accent) et « Supprimer le tableau » y est grisé. Tant que
  l'export Excel n'est pas livré, « Nouvelle grille » reste cachée du menu « + » sans `?dev` dans l'adresse du widget.
- Feuille A4 : dans un panneau étroit, la page est réduite à la largeur disponible par un `zoom` CSS (`--pp-fit-zoom` : à
  700 px de panneau, 794 px de mise en page passent à 672 px) — à l'écran seulement. Les coupures de ligne de l'éditeur
  sont celles d'un grand panneau ; les PDF sont identiques quelle que soit la taille du panneau.

## 4. Spécifique à SlidesPlus

- **État réel au premier commit : une fondation, pas un éditeur.** Connexion Grist + canevas Fabric.js vide +
  mode présentation (plein écran natif avec repli CSS si l'iframe Grist ne l'autorise pas). Rien de plus n'est
  implémenté.
- L'UI actuelle (`css/style.css`, ~90 lignes) est un point de départ **générique, pas encore la charte Grist
  Factory** : bleu d'accent différent (`#2563eb`, à comparer au `#2f6fed` de Publipostage+), pas de thème sombre,
  pas de séparation police chrome/contenu, un seul bouton avec un emoji (`⛶ Plein écran`). À harmoniser avec la
  charte du §1 au moment de construire le véritable éditeur (Phase 1 de `ROADMAP.md`), pas avant — inutile de
  retoucher une UI qui n'a pas encore de vraie barre d'outils à aligner.
- Diapositive : 960×540 pt (16:9, proportions PowerPoint), choisi dès l'éditeur pour que l'export `.pptx`/PDF
  n'ait pas de conversion surprise.
- Aucun audit de sécurité encore réalisé (rien à auditer au-delà de la fondation actuelle) ; un audit dans
  l'esprit de celui de Publipostage+ est prévu une fois l'éditeur fonctionnel.

---

## 5. Ce qui reste ouvert (ne pas trancher soi-même dans un autre chat)

- Texte définitif de la Bio dans le panneau Crédits de Publipostage+ (actuellement un brouillon de Claude).
- Refonte éventuelle de la barre d'outils V2 de Publipostage+ (jugée dense) — gelée tant qu'Antoine ne l'a pas
  arbitrée.
- Unification des teintes « ambre = attention » entre les deux widgets (proches mais pas identiques aujourd'hui).
- Palette et typographie définitives de SlidesPlus une fois son éditeur réel construit — pour l'instant provisoires.
- Calendrier de rattachement à l'écosystème Grist.Gouv, qui pourrait renommer les dépôts publics.
- Cartes posées à Antoine le 29/09, sans réponse à 21 h ce jour-là : « Commenter » en mode Lecture (recommandation : le
  griser) ; « Par personne » ou « Par ligne » pour les droits de lecture seule (fait « Par personne » en attendant) ;
  trois contrastes restants (message vert « lignes trouvées » à 3,65:1, bleu d'accent sur fond gris à 4,02:1 — onglet
  actif des Réglages, « Modifier le lien » —, puces de la galerie à 4,39:1) ; les boutons de colonne d'un tableau en mode
  suivi des modifications ; « [Email indisponible] » et « (aucun titre dans ce document) », restés en français
  (recommandation : traduire).
- Relevés par l'audit du 29/09 sans avoir fait l'objet d'une carte : deux sortes d'info-bulles, quatre crayons pour quatre
  fonctions, des tailles et couleurs écrites en dur dans le CSS, une lecture seule qui grise sans expliquer pourquoi.

---

*Document autonome — collez-le tel quel dans un autre chat pour lui donner le contexte d'identité visuelle des
widgets Grist Factory. Source : exploration directe de `publipostageGrist` (`index.html`, `css/*.css`,
`js/settings.js`, `js/i18n.js`) et de `SlidesPlus` (`README.md`, `ROADMAP.md`, `css/style.css`, `index.html`) le
2026-09-18, plus les décisions d'Antoine déjà actées en mémoire de projet. Mise à jour du 2026-09-29 : `publipostageGrist`
revérifié dans le code (jetons de `css/style.css`, `css/modal-base.css`, `js/modal-base.js`, `js/dialogs.js`,
`js/search-select.js`, `js/i18n.js`, `js/main.js`) et décisions d'Antoine du 18 au 29/09.*

**Mises à jour**
- 2026-09-18 : première version.
- 2026-09-29 : ajout des sections « Contrastes », « Vocabulaire et écriture des textes », « Fenêtres : une seule base pour
  toutes », « Saisies et confirmations », « Choisir une colonne, une table ou un modèle », « Le panneau de référence :
  700×400 » et « La langue de ce que le widget écrit dans le document » ; palette complétée du thème sombre et des jetons
  `--accent-solid` et `--pp-scrim` ; règles « une icône = une fonction », « aucun indice sous un bouton à menu », « grisé,
  jamais masqué », « un défaut qui revient se corrige une fois pour toutes » ; §3 mis à jour (menus au survol, modes et
  droits, rangement des modèles, variables, mode Email livré, galerie `?dev`, feuille A4) ; §5 complété. Corrigé : le
  « rayon moyen de 11 px » était un jeton (`--radius-md`) que plus aucune règle n'utilisait, retiré du CSS par le
  nettoyage du code (restent 7 px sur les contrôles et 8 px sur le cadre des fenêtres) ; le gris « très atténué »
  `#98a2b3` est devenu `#667085` avec les contrastes (un seul gris de texte) ; le renvoi « cf. §3 » du bouton de
  SlidesPlus pointe §4.
