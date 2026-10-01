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
| Texte d'accent sur fond teinté ; réussite (texte, fond) | `--accent-ink` ; `--good`, `--good-soft` | `#2558c4` ; `#146c48`, `#e5f6ee` | `#74a3f7` ; `#6fd3a3`, `#163326` |
| Texte discret posé sur la page blanche (éditeur, Lecture) | `--paper-text-faint` | `#667085` | identique au clair |
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
- Un texte d'accent posé sur un fond teinté (`--accent-soft`, `--surface-sunken`) prend `--accent-ink`, jamais `--accent`
  (3,97 à 4,43:1 sur ces fonds) : c'est le cas du texte fantôme « Ajouter un en-tête / pied de page », visible au survol
  sur le fond de sa zone. Un message de réussite prend `--good` sur `--good-soft`.
- La page (éditeur, Lecture) reste blanche dans les deux thèmes : un texte discret posé dessus prend `--paper-text-faint`,
  jamais `--text-faint`, qui s'éclaircit en sombre (2,46:1 sur blanc). Une zone qui prend le fond teinté du thème au
  survol (en-tête et pied de page remplis) y reprend le gris du thème.

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

### Couches flottantes : le dernier menu ouvert est toujours au-dessus
Règle d'Antoine du 01/10 (« le dernier menu qui s'ouvre doit toujours être au-dessus de l'existant », vue avec la liste `#`
qui s'ouvrait sous la barre du tableau). Avant : chaque couche avait son `z-index` écrit en dur (barre flottante 2000, liste `#`
1000, menus de la barre du haut 15, liste des modèles 40, info-bulles 50), sans aucun ordre entre elles. Une seule règle,
posée une fois dans `js/layers.js` et trois jetons de `css/style.css`, pas menu par menu :
- **Quatre niveaux, toujours dans cet ordre** : barres flottantes d'une sélection (tableau, image, bulle ; `--z-floating-toolbar`)
  < menus, listes et popups (`--z-menu`) < info-bulles (`--z-tip`) < fenêtres (1990 et plus, section précédente). Une barre
  flottante ne recouvre donc jamais un menu, et un menu ne recouvre jamais une fenêtre.
- **Dans le niveau des menus, le dernier ouvert est dessus** : toute couche flottante appelle `Layers.raise(élément)` à son
  OUVERTURE (ou à chaque placement d'un popup en cours d'usage, comme la liste `#`), jamais à chaque recalage d'un menu déjà
  affiché, qui changerait de rang sans que rien ne s'ouvre. Le rang s'ajoute au niveau et ne le dépasse jamais.
- **Les barres flottantes ne sont pas rangées entre elles** : un seul clic en ouvre souvent deux (une bulle ou un bloc dans
  une case de tableau : la barre de la bulle, puis celle du tableau quand le focus arrive). Elles gardent l'ordre du DOM, la
  plus précise (bulle, image, bloc) est créée après la plus générale (tableau) et reste dessus ; « la dernière ouverte
  au-dessus » mettrait la barre du tableau sur les boutons de la bulle (vu au rejeu de `condTextMouse`, panneau de 360 px).
- **Aucun `z-index` de 100 ou plus écrit en dur** dans une feuille de style, aucun `style.zIndex` hors `js/layers.js` :
  `codeHygiene` le vérifie. Une nouvelle couche flottante prend le jeton de son niveau et appelle `Layers.raise` quand elle
  s'ouvre ; elle se vérifie avec une barre de tableau, d'image ou de bulle affichée, au centre de chacune de ses lignes
  (`layers`, `layersMouse`).

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
choisisse. Sur cette colonne, les opérateurs sans sens (« > » et « ≥ » retiennent toutes les lignes, « < », « ≤ » et
« contient » aucune) sont **grisés** dans la liste des opérateurs, jamais retirés ; l'opérateur déjà enregistré reste
affiché et choisi (choix « Griser » d'Antoine, 01/10). La colonne d'une règle de **macro-modèle** et celle de la **condition d'une bulle** (demande d'Antoine du 01/10, puis
son choix « À plat » du même jour pour la condition) sont UNE seule liste qui réunit celles de toutes les tables, sans
intitulé : celles de la page en nom nu, les autres en « Table.Colonne », retrouvées par leur nom ; une table pas encore
liée ouvre la clé de correspondance par-dessus (Annuler remet la colonne précédente), et le lien d'une table liée se lit
sous la règle une fois la colonne choisie ; « Autre (colonne d'une autre table…) » reste en bas. Dans toute recherche de colonne qui réunit plusieurs tables (cette liste à plat, la liste « # » du corps et des champs texte, le menu « Image depuis une variable »), les colonnes de la **table en cours** viennent en tête, avant celles des autres tables, avec ou sans lettres tapées (demande d'Antoine du 01/10) : c'est la table de la page ; dans une zone répétée par une boucle, celle que la zone parcourt passe avant elle ; chaque table garde l'ordre de ses colonnes, les autres tables celui du schéma, et la limite de 50 clés de la liste « # » s'applique après ce classement.

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
  « Retirer l'encadré » (même bouton cerclé de rouge que « Retirer le lien ») ; il laisse tout le texte à sa place, la
  sélection où elle était, un seul Annuler ; en mode suivi le cadre est barré et son texte inséré (choix « Corriger »
  d'Antoine, 01/10) : « Tout accepter » rend le texte seul, jamais un cadre vide, « Tout refuser » l'encadré d'origine.
  L'encadré est un fond teinté, une barre de 4 px de la couleur d'accent à gauche et l'icône dans la marge, le texte
  garde la couleur du document ; palette unique
  (`js/callout.js`) lue par l'éditeur, la Lecture, le PDF et le Word, texte ≥ 4,5:1 sur les six teintes, barre et icône
  ≥ 3:1. Pas de titre écrit tout seul ; seuls la couleur et l'icône sont gardées (le type n'est pas stocké). Entrée deux
  fois en sort, comme d'une citation ; sur un élément de liste, l'encadré prend la liste entière. En e-mail (texte brut) il
  s'écrit sans fond ni mot ajouté. Bloc de signature : une zone 2 colonnes toute faite (trois lignes vides pour signer, une
  ligne de tirets bas, puis « Nom et signature » à gauche et « Date » à droite) posée sous le bloc du curseur, jamais dedans ;
  c'est du texte ordinaire, qu'on modifie (une variable à la place du nom, une autre légende).
- Rechercher / Remplacer (demande d'Antoine du 01/10 ; sa réponse à la carte : « Ajouter la loupe », la seule icône ajoutée à la barre gelée) : une barre fine entre la barre d'outils et
  le texte, jamais une fenêtre - le modèle reste visible et modifiable pendant qu'on cherche. La loupe est sur la dernière rangée, après Rétablir (aucune rangée de plus à 700 px) ; allumée tant que
  la barre est ouverte, grisée en Lecture et en macro-modèle, son infobulle dit « Rechercher / Remplacer (Ctrl+F) ». Ctrl+F / ⌘F ouvre la barre, Ctrl+H (⌘⇧H sur Mac, ⌘H est réservé à macOS)
  y ajoute la ligne « Remplacer par » : où que soit le clavier, même resté sur un bouton de la barre d'outils, sauf sous une fenêtre ouverte et quand l'éditeur n'est pas à l'écran (la
  recherche du navigateur reprend alors la main). Un mot sélectionné est repris dans le champ ; Entrée / Maj+Entrée passent au résultat suivant / précédent en repartant de l'autre bout ;
  « 3 sur 12 » dit où l'on est, « Aucun résultat » grise les flèches (grisées, jamais retirées). « Respecter la casse » et « Mot entier » sont deux boutons à état, le chevron de gauche montre
  ou cache « Remplacer par ». Tous les résultats sont surlignés en jaune pâle `#ffe58f`, le courant en orange `#ffb347` cerclé de `#8a4b00` (le cerclage le distingue sans la couleur) :
  couleurs fixes, la page reste blanche en sombre, le texte garde la sienne (8:1 au moins). Espaces insécables et apostrophes ou guillemets courbes valent leurs formes droites ; une
  correspondance ne traverse jamais deux paragraphes ni deux cases ; ne se trouvent pas : les bulles (variables, calculs, numéros de page), les images, le texte supprimé en suivi, et l'en-tête
  ou le pied de page tant qu'on ne les modifie pas. « Remplacer » met le texte au résultat courant puis passe au suivant (sans résultat courant il se place d'abord sur le prochain) ;
  « Tout remplacer » les remplace tous et dit combien (« 5 remplacements »). Chaque remplacement est UNE étape d'annulation, « Tout remplacer » compris ; Ctrl+Z, Ctrl+Maj+Z et Ctrl+Y agissent
  sur le modèle même quand le clavier est resté sur un bouton de la barre (dans un champ, Ctrl+Z reste celui du champ). Le nouveau texte garde la mise en forme du texte remplacé (gras,
  couleur, lien) ; avec le suivi des modifications allumé, le remplacement devient une suppression et une insertion suggérées, comme une frappe. Échap ferme depuis n'importe quel contrôle
  de la barre, rend le clavier au texte et laisse le dernier résultat sélectionné ; la barre se ferme aussi quand l'éditeur disparaît (Mode lecture, macro-modèle).
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
  Le bouton Enregistrer dit lui aussi l'état (retour d'Antoine du 01/10) : bleu et blanc enregistrement automatique allumé, noir et blanc classique (fond noir, glyphe blanc) coupé, sans changer de taille.
- Quitter un modèle dont une modification attend (carte d'Antoine du 01/10, « Toujours demander ») : changer de modèle à la liste, « + », « Nouvel email », « Nouvelle grille » et « Utiliser
  ce modèle » de la galerie ouvrent d'abord la fenêtre « Modifications non enregistrées » : Annuler, Abandonner, Enregistrer (le bouton principal, où le focus arrive). Elle est posée que
  l'enregistrement automatique soit allumé ou non, et il n'écrit rien tant qu'elle est ouverte. Annuler et Échap restent sur le modèle (la liste le montre à nouveau, le curseur revient où
  il était) ; Abandonner perd la modification ; Enregistrer l'écrit puis continue. Un nouveau modèle sans nom n'a pas d'Enregistrer, et le message dit pourquoi. Aucune question quand rien
  n'attend, en lecture seule, pour un macro-modèle (il s'édite dans sa fenêtre) ni après « Supprimer » (le modèle n'existe plus).
- Nom de modèle déjà pris (demande d'Antoine du 01/10, « nom(x) avec incrémentation de x ») : un nom que porte déjà un autre modèle devient « nom (2) », puis « nom (3) »... avec une espace
  avant la parenthèse, comme les noms de fichiers d'une archive ; majuscules et espaces autour ne comptent pas (« contrat » et « Contrat » sont le même nom), et un nom qui finit déjà par « (n) »
  continue sa série (« Rapport (2) » donne « Rapport (3) », jamais « Rapport (2) (2) »). Le nom n'est vérifié qu'à la validation : Entrée ou un clic ailleurs sur le crayon « Renommer »,
  Enregistrer, Ctrl+S, « Enregistrer sous… », « Utiliser ce modèle » de la galerie, la fenêtre du macro-modèle ; jamais lettre par lettre, et jamais par l'enregistrement automatique, qui
  n'écrit que le nom courant. « Enregistrer sous… » arrive avec le premier nom libre déjà saisi et sélectionné : Entrée suffit, une frappe le remplace. Le coin d'état dit le nom retenu
  (« Ce nom existe déjà : renommé « Rapport (2) ». ») ; enregistrement automatique coupé il garde « Modifications non enregistrées. », le nouveau nom se lit dans le titre. Un modèle
  déjà enregistré qui garde son nom n'est jamais renommé, même s'il a un jumeau d'avant la règle.
- Variables : cliquer une variable ouvre sa barre flottante (Condition, Autres attributs, Boucle, réglages nombre/date) ;
  en édition, une bulle à condition est en pointillés ; les fenêtres correspondantes reposent sur la base commune. Dans
  une règle, « = » sur une colonne à choix multiples ou une liste de références veut dire « contient ce choix » (arbitré
  le 29/09).
- Bloc de texte conditionnel (demande d'Antoine du 01/10) : une ligne « Texte conditionnel » (« Conditional text ») de l'onglet Chips du menu des variables, jamais une nouvelle
  icône. Sans sélection, un bloc vide se pose à la place de « # » et le curseur s'y met ; avec du texte sélectionné, le bouton « Insérer une variable » ouvre la liste sur Chips,
  la ligne en surbrillance, et Entrée entoure le texte (qui n'est jamais remplacé par « # »). Le bloc contient des paragraphes, des listes, des tableaux, des variables
  (conditionnelles comprises) et d'autres blocs, à toute profondeur. Il se délimite sans changer la largeur du texte (cadre en `outline`), dans la direction artistique des
  bulles : fond `#eaf2ff`, texte `#12406b`, liseré `#b7cdf2` en pointillés, plus foncé (`#5b7fc0`) une fois la condition posée, anneau d'accent une fois sélectionné ; l'étiquette dit
  « Si Statut = Urgent » ou « Texte conditionnel · sans condition ». Un clic sur l'étiquette sélectionne le bloc et ouvre la barre flottante des variables : seule la condition
  d'affichage y sert (même fenêtre que pour une bulle, mêmes colonnes, mêmes liens entre tables) ; « Autres attributs » et « Boucle » n'ont pas d'objet ici, grisés par
  `aria-disabled` avec leur raison en info-bulle, jamais retirés. Le cadre n'existe que dans l'éditeur : condition remplie, le texte se lit sans cadre ni ligne ajoutée ;
  sinon le bloc et tout ce qu'il contient disparaissent, sans ligne vide, en Lecture, PDF, Word et e-mail (un bloc masqué emporte ceux qu'il contient). Entrée sur un paragraphe
  vide en fin de bloc en sort, comme d'une citation ; Retour arrière sur le bloc sélectionné le supprime avec son contenu. « Défaire le bloc » (choix « Fenêtre » d'Antoine, 01/10) :
  dans la fenêtre de condition d'un bloc seulement (jamais dans celle d'une bulle), à côté de « Retirer la condition », il retire le cadre et la condition et laisse tout le texte à
  sa place, un seul Annuler rend le bloc ; son texte garde la couleur du texte (le rouge de « Retirer la condition » ne fait que 4,4:1 sur blanc). Les quatre boutons de la fenêtre
  d'un bloc à condition passent sur deux lignes - les retraits au-dessus, Annuler et Enregistrer dessous, à droite - quand ils ne tiennent pas côte à côte (le français dans les
  480 px) : jamais un bouton hors de la fenêtre.
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
- Variable Oui / Non (demande d'Antoine du 01/10) : une bulle sur une colonne Oui / Non a sa propre barre flottante, comme une date ou
  une image, à quatre boutons d'une même rangée : les trois styles de la liste à cases (`accentStrike`, `classic`, `accentPlain`, mêmes
  icônes, mêmes noms que les boutons de la liste) puis « vrai / faux » (« true / false » en interface anglaise). Sans réglage la bulle
  écrit « vrai » ou « faux » dans la langue de l'interface et « vrai / faux » est le bouton enfoncé : choisir ce bouton retire le réglage
  du modèle (un seul état « sans réglage », pas de réglage « texte » à côté), comme « — » pour un nombre. Les trois autres posent
  `{ type: 'bool', style }` ; le bouton du style posé est enfoncé (`aria-pressed`, fond différent des trois autres). Dans la barre, ces trois
  icônes sont à 20 px (à 15 px elles ne se lisent plus) ; l'infobulle de chaque case nomme son style, la première dit aussi qu'elle
  barre le texte qui suit. En Lecture, au PDF, au Word, à l'Excel et à l'e-mail, la bulle devient une vraie case à cocher, de la
  taille de celle d'un item de liste (1,07 em, jamais plus haute que la ligne) : accent coché `#2f6fed`, accent décoché `#767676`,
  classique coché `#222222`, classique décoché `#6b7684` (4,5:1 au moins sur blanc, la page reste blanche en sombre) ; l'accent coché est
  une case pleine à coche blanche, la classique cochée un contour à coche de sa couleur, une case décochée un contour sur fond blanc ;
  son `aria-label` dit « Coché » ou « Décoché » (« Checked » / « Unchecked »). Le PDF peint ces cases dans
  deux polices maigres du widget (`js/pdf-fonts-boxes.js`, générée par `dev-tests/build-pdf-boxes-font.py`) parce que les polices
  embarquées n'ont pas ☐ ni ☑ ; l'e-mail écrit « [x] » et « [ ] ». Le style « accent, texte barré » barre aussi le texte qui suit
  une case cochée, jusqu'à la fin de la ligne, du bloc ou de la case suivante, dans le gris des textes discrets
  (`--paper-text-faint`, `#667085`, 4,5:1) sauf si ce texte a déjà sa couleur ; une case décochée ne barre rien. Objet, À, Cc, Cci, nom
  du PDF et attributs d'une ligne liée gardent « true » / « false » tels que Grist les stocke (aucune case dans un champ texte). Un
  réglage de format s'applique partout où celui d'une date s'applique : une colonne de boucle en tableau, une boucle dans la phrase, un
  en-tête ou un pied de page.
- Case conditionnelle (demande d'Antoine du 01/10, « une case cochée ou décochée en fonction d'une condition basée sur une colonne » ; sa réponse à la carte : « Puce dédiée », pas un
  texte conditionnel) : une ligne « Case conditionnelle » (« Conditional checkbox ») de l'onglet Chips du menu des variables, jamais une nouvelle icône ; UN clic la pose à la place de «
  # » et la sélectionne, sa barre flottante est déjà ouverte pour choisir la condition (un clic sur une ligne de la liste referme les barres à la fin de son `mousedown` : la sélection
  est reposée juste après). Elle se pose là où une bulle se pose (paragraphe, titre, élément de liste, case de tableau, colonne, en-tête ou pied de page, ligne d'une boucle). La puce
  suit la direction artistique des bulles (fond `#eaf2ff`, texte `#12406b`, liseré `#b7cdf2`, en pointillés `#5b7fc0` une fois la condition posée) et montre la case décochée de la
  Lecture puis son étiquette, « Si Statut = Urgent » ou « sans condition » ; trop longue pour sa case ou sa colonne, elle coupe le milieu de son étiquette par « … », sans déborder ni
  passer à la ligne, et elle n'agrandit pas la ligne. Sa barre : les trois styles de case de la variable Oui / Non (mêmes icônes, mêmes noms, pas de « vrai / faux » : une case est
  toujours une case) et le bouton Condition, qui ouvre la même fenêtre que pour une bulle ou un bloc (mêmes colonnes, mêmes liens entre tables, Copier / Coller entre les trois) sous le
  titre « Condition de la case », avec « Cocher si » devant la combinaison de plusieurs règles et un aperçu qui dit si la case est cochée pour la ligne courante ; « Autres attributs »
  et « Boucle » n'ont pas d'objet ici, grisés par `aria-disabled` avec leur raison en info-bulle, jamais retirés. Une case neuve est « accent, texte normal » : « accent, texte barré »
  barrerait « Pièce fournie » dès que la condition est remplie, ce que seul un choix dans la barre doit faire. Elle se lit cochée quand la condition est remplie pour la ligne affichée
  (pour la ligne du tour dans une zone répétée), décochée sinon, et décochée sans condition ou quand la condition ne se lit plus ; la case est celle de la variable Oui / Non (mêmes
  couleurs, même nom accessible « Coché » / « Décoché ») en Lecture, PDF, Word, Excel et e-mail (« [x] » / « [ ] »), et le style « accent, texte barré » barre le texte qui suit quand
  elle est cochée.
- Barres flottantes d'une bulle, d'un tableau ou d'une image : ancrées dans l'éditeur, aucune n'est ouverte quand il est
  masqué (Lecture, résumé d'un macro-modèle), qu'on y passe à la souris ou au clavier (choix « Corriger » d'Antoine,
  01/10) ; elles ne recouvrent jamais la barre du haut. Un clic hors de l'éditeur et hors de la barre ferme celle d'une
  bulle, d'un tableau ou d'une image (choix « Corriger » d'Antoine, 01/10) ; un clic sur l'objet la rouvre.
- Image en calque (devant ou derrière le texte) : sélectionnée, les flèches du clavier la déplacent de 1 px de mise en page, de 10 px avec
  Maj (demande d'Antoine du 01/10, « déplacer une image aux flèches ») ; la touche tenue appuyée répète, un Ctrl+Z défait une rafale
  d'un coup, l'image s'arrête au bord de la page, l'infobulle de sa poignée de déplacement le dit. Une image dans le texte, le
  curseur et Maj + flèche dans le texte gardent leurs flèches ; le curseur qui ARRIVE sur l'ancre d'une image en calque la traverse
  encore à la flèche suivante, sans la faire glisser (un clic sur l'image ou une action de sa barre flottante rendent les flèches à
  l'image). Le suivi des modifications n'y voit pas une suggestion : une position est de la mise en page, pas du contenu.
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
  grille plus large que la page est ramenée à sa largeur. La case
  courante a son cadre plein, couleur d'accent ; la barre de la case est fixée dans une bande entre la barre d'outils et le plan de travail, jamais posée sur une case ni sur un bandeau
  (un appui ou un glissé de souris tombe toujours sur la case visée), à la même place quelle que soit la case courante, masquée avec l'éditeur (Lecture, macro-modèle), et
  « Supprimer le tableau » y est grisé. Depuis que l'export Excel est complet
  (une ligne, puis toutes les valeurs de la table), « Nouvelle grille » est dans le menu « + » de tout widget, sans rien dans l'adresse.
- Sélectionner des cases en glissant la souris (demande d'Antoine du 01/10, « en mode tableau, laisser le clic appuyé pour sélectionner plusieurs cellules »), dans une grille comme dans un
  tableau de document : appuyer sur une case puis glisser sélectionne le rectangle entre les deux cases, dans tous les sens, en partant du texte de la case aussi ; Maj + clic l'étend. Une case
  sélectionnée reçoit un voile bleu translucide posé PAR-DESSUS son fond (un fond de case jaune cachait la sélection) et son texte garde au moins 4,5:1. Le pointeur tenu près d'un bord du plan
  de travail, ou au-delà (sur la barre d'outils, hors du panneau), le fait défiler, d'autant plus vite qu'il s'éloigne, et la sélection suit la case qui arrive sous le bord ; les bandeaux
  restent collés. Règle générale : rien de flottant ne se pose sur les cases d'un tableau pendant qu'on y travaille ; une barre reste dans sa bande ou hors du plan de travail. Les boutons de la
  barre de la case se déclenchent aussi au clavier (Tab puis Entrée ou Espace), sans doubler le clic de la souris.
- Colonnes d'un tableau avec le suivi des modifications (choix « Faire marcher » d'Antoine, 01/10) : « Colonne avant », « Colonne après » et « Supprimer la colonne » de la barre du tableau agissent comme
  une frappe suggérée. Une colonne ajoutée reste dans le tableau, alignée case par case, teintée de vert pâle (texte `#146c48` sur `#e5f6ee`) ; une colonne supprimée reste, barrée et teintée de rouge pâle
  (texte `#b42318` sur `#fbe9e9`) ; ces teintes sont des constantes, pas des jetons du thème : la page du document reste blanche en clair comme en sombre, et le texte y atteint 4,5:1 au moins. « Tout accepter »
  et « Tout refuser » les résolvent, Ctrl+Z défait l'action en un seul geste, et l'enregistrement les garde : la marque s'écrit en attribut de la case (`data-tc-insertion`, `data-tc-deletion`,
  `data-tc-modification`), jamais en `<ins>` ou `<del>` entre deux cases, que le navigateur écarterait du tableau à la relecture. Au-dessus d'une cellule fusionnée, « Supprimer la colonne » est grisé,
  jamais retiré (`aria-disabled`, explication au survol) : la supprimer à travers une cellule fusionnée casserait le tableau ; « Colonne avant / après » reste actif et élargit la cellule.
  Les largeurs que le widget règle tout seul (colonnes automatiques figées, tableau ramené dans la page) s'écrivent hors suivi : jamais une suggestion que personne n'a écrite.
- Export Excel d'une grille (demande d'Antoine du 01/10) : le menu « Qualité PDF » a trois lignes Excel, sous les deux lignes Word : « Exporter en Excel… », « Exporter toutes les
  valeurs de la table en Excel (ZIP)… » et « Exporter toutes les valeurs de la table dans un seul classeur… ». Elles sont actives dans une grille et grisées ailleurs ; à l'inverse
  les deux lignes Word sont grisées dans une grille — jamais retirées, `aria-disabled` posé, un clic dessus ne lance rien et n'ouvre aucune confirmation. « Exporter en Excel… »
  télécharge un classeur d'une feuille pour la ligne affichée, nommé comme le PDF avec l'extension .xlsx, et le coin d'état dit « Fichier Excel généré. ». La feuille reprend la
  grille : largeur des colonnes et hauteur des lignes, texte au milieu de sa case, cases fusionnées, gras, italique, souligné, barré, couleur et taille, fond de case, listes,
  liens, images, un filet gris fin sur chaque case, page A4 d'une page de large dans son orientation. L'Excel n'est qu'un affichage, sans formule : une case n'est un vrai nombre
  ou une vraie date (au format de la bulle) que si elle ne contient que cette bulle, sinon c'est du texte ; un zéro masqué reste vide ; aucune couleur n'est inventée (une case
  sans format n'a ni couleur de texte ni fond, thème sombre compris).
- Toutes les valeurs de la table, dans une grille (choix d'Antoine du 01/10) : « lignes » devient « valeurs de la table » partout où l'export en lot en parle — les deux lignes du
  menu « Exporter en PDF » (« Exporter toutes les valeurs de la table (ZIP)… », « … en un seul PDF… »), leur confirmation et le message d'une table vide ; dans un document, ces
  textes gardent « lignes ». L'export Excel en lot a deux formes, une ligne chacune : une archive « <table>-export-xlsx.zip » d'un classeur par valeur (nommé comme les PDF par le
  modèle de nom de fichier), ou un seul classeur « <table>-export.xlsx » d'une feuille par valeur, nommée comme son fichier (31 caractères au plus, « nom (2) » quand deux
  feuilles s'appellent pareil). Chacune demande confirmation, annonce sa progression (« Export Excel en lot : 2/10... ») et dit sa fin en mots d'Excel, jamais de PDF.
- Feuille A4 : dans un panneau étroit, la page est réduite à la largeur disponible par un `zoom` CSS (`--pp-fit-zoom` : à
  700 px de panneau, 794 px de mise en page passent à 672 px) — à l'écran seulement. Les coupures de ligne de l'éditeur
  sont celles d'un grand panneau ; les PDF sont identiques quelle que soit la taille du panneau.
- Orientation de la page (demande d'Antoine du 01/10, « une bascule paysage et portrait… également pour les modèles
  classiques ») : le bouton Portrait / Paysage de la barre, juste après Aperçu A4, montre la page telle qu'elle est (haute en
  portrait, large en paysage) et s'allume en paysage. Il est actif pour les modèles classiques et les macro-modèles ; pour un email et une
  grille il reste visible et grisé, jamais retiré. Un modèle a une seule orientation, enregistrée avec lui (clé
  `orientation` de la colonne `Margins`, absente = portrait) ; changer d'orientation garde les quatre marges en millimètres.
  La feuille paysage (297 × 210 mm, 1 122,52 px de mise en page) est ramenée à la largeur du panneau par le même `zoom` : à
  700 px de panneau elle passe aussi à 672 px, facteur 0,60 au lieu de 0,85, donc un texte plus petit à l'écran qu'en
  portrait — rien de tel dans le PDF ni le Word. La pagination, la Lecture, le PDF, le Word et l'impression navigateur
  suivent la page dans son sens ; la galerie de modèles reste en portrait.
- Format de la page (demande d'Antoine du 01/10, « un mode autre que A4 ? genre A3, A5, A6 » dans le fil de l'orientation) : le bouton Portrait / Paysage a un menu au survol, comme Qualité PDF
  ou Titre, et la barre ne gagne aucune icône. Le menu a un titre « Page », les lignes Portrait et Paysage, un filet, puis A3, A4, A5 et A6 avec leurs dimensions (« 148 × 210 mm », en
  gris discret, au moins 4,5:1) ; la coche dit le sens et le format courants. Le bouton garde son icône (la page telle qu'elle est) et son clic (tourner la page) ; il n'a pas
  d'info-bulle, que l'ouverture du menu retirerait : son nom accessible dit « Page A5 en portrait (passer en paysage) ». La case « Aperçu A4 » devient « Aperçu A5 » (« A5 preview »). Un modèle
  a un seul format, enregistré avec lui (clé `format` de la colonne `Margins`, absente ou inconnue = A4) ; changer de format garde le sens, re-borne les marges pour que la zone de texte garde
  20 mm au moins (elles ne reviennent pas au retour en A4) et ramène pour de bon un tableau trop large dans la page. Email et grille gardent le menu visible et grisé, titre
  « Page (pas disponible pour ce modèle) ». À 700 px de panneau, A5 tient sans réduction, A3 portrait passe à 0,60 et A3 paysage tombe au plancher de 0,5 (la zone d'édition défile à
  l'horizontale). La galerie et l'arbre des modèles montrent encore une feuille A4 portrait. D'autres formats (Lettre US...) ne s'ajoutent qu'après le choix d'Antoine.
- Page d'un macro-modèle (carte d'Antoine du 01/10, « Autoriser le paysage pour les macro-modèles ? » : Oui) : le bouton Page et son menu sont actifs sur un macro-modèle comme sur un modèle classique,
  au même endroit et du même aspect ; la coche dit le sens et le format de ce macro-modèle (« Page A3 en paysage (passer en portrait) »). Sa page est dans sa propre ligne (colonne `Margins`, avec ses marges)
  et il l'impose aux modèles qu'il assemble : la Lecture, le PDF (unique, en lot, en un seul fichier) et le Word suivent la page du macro-modèle, jamais celle de sa page de garde ou d'une annexe, qui gardent la
  leur quand on les ouvre seules. Son résumé ne montre pas de feuille : la page se lit sur le bouton (allumé en paysage), dans le menu et à la Lecture. Un macro-modèle sans réglage reste en A4 portrait.
- Image plus large que sa place (carte d'Antoine du 01/10, « Ramener à la page les images trop larges dans le PDF et le Word ? » : « logique de WYSIWYG, si ça dépend en éditeur ça dépasse partout sinon nulle
  part ») : l'éditeur est la référence, la Lecture, le PDF et le Word montrent ce qu'il montre. Une image dans le texte plus large que la zone de texte, la case de tableau ou la colonne qui la porte y est
  ramenée partout, proportions gardées, et suit le format de page et les marges ; une image qui tient garde sa taille réglée. Une image en calque garde sa taille réglée (son placement est une autre règle).
- Fin de document (demande d'Antoine du 01/10, « s'il n'y a pas de contenu, peu importe les marges, on ne crée pas de nouvelle page ») : une dernière ligne vide, un saut de
  page sans rien derrière et les lignes vides au bas des colonnes d'une dernière zone à deux colonnes ne s'impriment pas et ne créent jamais de page, en Lecture, en PDF et en
  Word, même quand le texte arrive pile à la marge du bas. Les lignes vides du milieu gardent leur hauteur ; l'éditeur garde sa ligne finale (il faut pouvoir écrire à la suite).
- Onglet « Raccourcis » et abréviations « § » (demande d'Antoine du 01/10, « un caractère qui flag et qui étend une valeur saisie » ; sa réponse à la carte : « Tout, par personne ») : un
  septième onglet des Réglages, « Raccourcis », après « Déclencheur ». Les sept onglets tiennent sur une seule ligne dans les 480 px de la fenêtre (`.settings-tabs` sans interstice,
  onglets à 7 px et 2 px de marge intérieure), jamais sur deux ; aucun `display` n'est posé sur `.settings-panel` (il battrait l'attribut `hidden` des panneaux masqués). La section «
  Abréviations » met sur une ligne son titre et le réglage « Caractère déclencheur » (un champ de 44 px, « § » par défaut, gardé par navigateur comme la touche des variables ; il refuse
  une lettre, un chiffre, une espace, un délimiteur et le déclencheur des variables, en disant pourquoi, et reprend l'ancien caractère à la perte du focus), puis une phrase d'exemple, le
  formulaire (« Abréviation », « Texte à écrire », « Ajouter » en bouton plein, « Annuler » seulement en modification, Ctrl+Entrée valide), la liste de la personne (l'abréviation en
  gras, son texte coupé par « … », « Modifier » et « Supprimer » qui demande confirmation dans la fenêtre commune) et une ligne qui dit que chacun a les siennes. Une erreur de saisie
  garde la couleur du texte (le rouge ne fait que 4,4:1 sur blanc) avec un filet rouge et se place sous le champ qu'elle concerne, jamais sous son libellé ni sous le titre : celle du
  formulaire dans la colonne des champs, entre le texte et les boutons ; celle du caractère, dont le champ est au bord droit de la ligne du titre, alignée sur ce bord (texte à droite,
  filet à droite). Les abréviations vivent dans la table `Publipostage_Abreviations` du document (`Utilisateur`, `Abreviation`, `Texte`) : une personne ne voit et ne change que les
  siennes (sans identité Grist, les lignes à `Utilisateur` vide) ; la table n'est créée qu'à la première abréviation ajoutée et reste cachée du choix `#Variable`.
- Abréviations dans l'éditeur (même demande) : taper le caractère déclencheur ouvre sous le curseur la liste des abréviations de la personne, dans le même langage que le panneau `#`
  (fond de surface, liseré, ombre légère, ligne choisie sur `--surface-sunken`, texte en `--text`, jamais un gris discret qui n'atteindrait pas 4,5:1 sur la ligne choisie ; couche de
  niveau `--z-menu`, remontée à chaque placement par `ViewportFit.placePopup` : elle passe devant la barre flottante d'un tableau et devant un menu déjà ouvert). Elle se
  filtre à la frappe (abréviation entière, puis début, puis contenu, puis début d'un mot du texte) ; les flèches choisissent, Entrée et Tab valident, Échap la ferme sans rien changer, un
  clic choisit (l'éditeur garde le focus). Entrée et Tab ne choisissent que si la liste est ouverte, et Maj, Ctrl, Alt et ⌘ gardent leur sens : sans liste, Entrée coupe le paragraphe et
  Tab décale l'élément de liste ou passe à la colonne suivante comme avant (l'extension passe avant les autres, priorité 1000, pour que la liste ouverte gagne). Sans passer par la liste,
  une abréviation entière suivie d'une espace (normale, insécable ou fine) ou d'une ponctuation (`. , ; : ! ? ) ] }` et `»`) est remplacée par son texte, le caractère tapé restant
  derrière. Les majuscules de l'abréviation ne comptent pas ; une abréviation collée à une lettre (« mon§ub ») ou inconnue ne change rien ; rien ne se remplace dans un bloc de code ni
  sous une marque code. Retour arrière juste après l'expansion rend ce qui avait été tapé (« §ub »). Les marques en cours (gras, couleur…) sont gardées, un texte sur plusieurs lignes
  s'écrit avec un saut de ligne par ligne, et en suivi des modifications l'expansion n'est qu'une insertion. Le caractère se relit à chaque frappe : le changer dans Réglages vaut tout de
  suite, sans recharger. Les autres champs (objet, destinataires, nom du PDF) ne s'étendent pas.
- Raccourcis clavier (demande d'Antoine du 01/10, « pouvoir définir des raccourcis personnalisés » ; sa réponse à la carte : « Tout, par personne ») : l'onglet « Raccourcis » s'ouvre sur
  les touches, un commutateur à deux boutons (Touches / Abréviations, `.settings-switch`, le bouton choisi plein en `--accent-solid`) montre l'une ou l'autre section et se souvient du
  choix, par navigateur (`pp_shortcuts_view`). Une ligne par action (50, en cinq groupes : Modèles, Affichage, Mise en forme, Insertion, Historique et suivi) : le nom à gauche (aucun
  n'est coupé à 700 px), la touche dans un bouton de 112 px au moins (« Aucune » en italique quand il n'y en a pas), « Par défaut » à droite, grisé tant que la touche est celle d'origine
  ; « Tout remettre par défaut » en haut à droite demande confirmation. Un clic sur la touche l'écoute (« Tapez la touche… », fond `--accent-soft`) : la combinaison tapée est prise,
  Échap abandonne sans fermer la fenêtre, Retour arrière retire la touche. Une combinaison refusée dit pourquoi dans un message sous la touche, dans sa colonne et jamais sous le nom de
  l'action, en `--text` avec un filet rouge, et l'écoute continue. Refus : une touche déjà prise (le nom de l'action est dit), une touche seule, Ctrl+Alt (c'est AltGr), Ctrl+lettre sur
  Mac, les touches que le navigateur ou l'éditeur gardent (Ctrl+R, Ctrl+N…).
- Les touches (même demande) : chaque action fait ce que fait son bouton - elle presse le bouton de la barre, avec le même geste que la souris (click, ou mousedown pour la couleur du
  texte, le surlignage et la taille de police), donc avec ses gardes : grisé par les droits, par le mode ou en Lecture, désactivé ou masqué, une touche ne fait jamais ce qu'un clic ne
  peut pas. Une touche d'origine que l'éditeur traite déjà (Ctrl+B, Ctrl+K, Ctrl+Z…) reste à l'éditeur tant qu'on n'y touche pas ; une fois changée, l'ancienne ne fait plus rien (sauf
  dans un champ de saisie, où elle garde son sens de texte ; sous Windows et Linux les touches Ctrl+Alt de l'éditeur, comme Ctrl+Alt+C, restent actives : c'est AltGr). Rechercher (Ctrl+F) et Rechercher et remplacer (Ctrl+H, ⌘⇧H sur Mac) sont ceux de la barre de recherche
  (`js/find-replace.js`) : changés, la nouvelle touche l'ouvre sans la refermer quand elle l'est déjà (la loupe, elle, la ferme) et l'infobulle de la loupe dit la touche choisie. Aucune action ne
  part fenêtre ouverte ni pendant une saisie en cours (IME) ; une touche enfoncée ne bascule qu'une fois (la taille de police, les retraits, annuler et rétablir se répètent). Les choix
  sont par navigateur (`pp_shortcuts`), comme la langue et le thème ; les touches ne marchent que le curseur dans le widget. Sur Mac, ⌘ remplace Ctrl et les touches s'écrivent ⌃⌥⇧⌘. La
  touche se montre là où le bouton se nomme : dans son infobulle (« Gras (Ctrl+B) », la touche après le texte, entière dans la fenêtre), à droite de la ligne d'un menu (Citation, Titre
  1…), après le titre d'un menu (« Exporter en PDF (Alt+P) ») et dans `aria-keyshortcuts` ; sans touche, rien n'est écrit (pas de parenthèses vides). Un nouveau bouton de la barre
  s'ajoute à la liste (`ACTIONS` de `js/shortcuts.js`, avec son nom français et anglais) et au scénario « la touche fait ce que fait la souris ».

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
  actif des Réglages, « Modifier le lien » —, puces de la galerie à 4,39:1) ; « [Email indisponible] » et « (aucun titre dans ce document) », restés en français
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
